require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});
app.use(express.static(path.join(__dirname, '..', 'public'), {
    etag: true, maxAge: '5m', setHeaders: (res, filePath) => {
        if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.ico')) {
            res.setHeader('Cache-Control', 'public, max-age=300');
        }
    }
}));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const RANDOM_NAMES = ['旅行者', '探险家', '漫步者', '流浪者', '追光者', '星尘旅人', '风语者', '月光骑士', '迷雾行者', '云端漫步者'];
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#84cc16'];

function getRandomName() { return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]; }
function getRandomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }

async function startServer() {
    await db.initDatabase();

    const ADMIN_KEY = process.env.ADMIN_KEY;
    if (!ADMIN_KEY) {
        console.error('❌ 未设置环境变量 ADMIN_KEY，请配置 .env 文件后重启服务器');
        process.exit(1);
    }
    
    // 从环境变量读取站长名单，多个用逗号分隔
    const SUPER_ADMINS = process.env.SUPER_ADMINS?.split(',').map(s => s.trim()).filter(s => s) || [];
    console.log(`📋 站长名单: ${SUPER_ADMINS.join(', ')}`);
    for (const name of SUPER_ADMINS) {
        const user = db.getUserByUsername(name);
        if (user) { db.setAdmin(user.id, true); db.setSuperAdmin(user.id, true); console.log(`✅ 已设置站长: ${name}`); }
    }

    app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));
    
    app.post('/api/register', (req, res) => {
        try {
            const { username, password, nickname, color } = req.body;
            if (!username || !password) return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
            const result = db.registerUser(username, password, nickname || username, color || getRandomColor());
            if (!result.success) return res.status(400).json(result);
            const user = db.getUserById(result.id);
            res.json({ success: true, id: result.id, user });
        } catch (error) { 
            console.error('注册失败:', error); 
            res.status(500).json({ success: false, error: '注册失败' }); 
        }
    });
    
    app.post('/api/login', (req, res) => {
        try {
            const { username, password } = req.body;
            if (!username || !password) return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
            const result = db.verifyLogin(username, password);
            if (!result.success) return res.status(401).json(result);
            res.json({ success: true, user: result.user });
        } catch (error) { 
            console.error('登录失败:', error); 
            res.status(500).json({ success: false, error: '登录失败' }); 
        }
    });
    
    app.get('/api/users', (req, res) => {
        try {
            const users = db.getOnlineUsers();
            res.json({ users: users.map(u => ({ id: u.id, username: u.username, nickname: u.nickname, avatar: u.avatar, x: u.x, y: u.y, color: u.color, bio: u.bio })), count: users.length });
        } catch (error) { res.status(500).json({ error: '获取用户列表失败' }); }
    });
    
    app.get('/api/user/:id', (req, res) => {
        try {
            const user = db.getUserById(req.params.id);
            if (!user) return res.status(404).json({ error: '用户不存在' });
            res.json(user);
        } catch (error) { res.status(500).json({ error: '获取用户信息失败' }); }
    });
    
    app.get('/api/messages', (req, res) => {
        try {
            const { limit = 100, x, y, radius = 2000 } = req.query;
            const messages = db.getMessages({ limit: parseInt(limit), x: x ? parseFloat(x) : undefined, y: y ? parseFloat(y) : undefined, radius: parseFloat(radius) });
            res.json({ messages, count: messages.length });
        } catch (error) { res.status(500).json({ error: '获取消息失败' }); }
    });
    
    app.post('/api/clear-messages', (req, res) => {
        try {
            const result = db.clearMessages();
            res.json({ success: true, message: `已删除 ${result} 条消息` });
        } catch (error) { 
            console.error('清空消息失败:', error);
            res.status(500).json({ success: false, error: '清空消息失败' }); 
        }
    });

    const onlineUsers = new Map();
    const userSocketMap = new Map();
    const blockedCache = new Map();
    const positionDirty = new Set();
    const sessionTokens = new Map();
    const recentDmCache = new Map();
    
    function getBlockedIds(userId) {
        if (blockedCache.has(userId)) return blockedCache.get(userId);
        const ids = db.getBlockedUsers(userId);
        blockedCache.set(userId, ids);
        return ids;
    }
    
    function invalidateBlockCache(userId) {
        blockedCache.delete(userId);
        for (const [id] of onlineUsers) { blockedCache.delete(id); }
    }
    
    function flushPositions() {
        if (positionDirty.size === 0) return;
        for (const userId of positionDirty) {
            const user = Array.from(onlineUsers.values()).find(u => u.id === userId);
            if (user) db.updateUserPosition(userId, user.x, user.y);
        }
        positionDirty.clear();
    }

    function disconnectOldSocket(userId, newSocketId) {
        const oldSocketId = userSocketMap.get(userId);
        if (!oldSocketId || oldSocketId === newSocketId) return false;
        
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket) {
            oldSocket.disconnect(true);
            return true;
        }
        return false;
    }

    function isUserOnlineExcluding(userId, excludeSocketId) {
        for (const [sid, u] of onlineUsers.entries()) {
            if (sid !== excludeSocketId && u.id === userId) return true;
        }
        return false;
    }

    function filterUsersForClient(clientUserId) {
        const blockedIds = getBlockedIds(clientUserId);
        return Array.from(onlineUsers.values()).filter(u => u.id !== clientUserId && !blockedIds.has(u.id));
    }
    
    function filterMessagesForClient(messages, clientUserId) {
        const blockedIds = getBlockedIds(clientUserId);
        return messages.filter(m => !blockedIds.has(m.authorId));
    }

    io.on('connection', (socket) => {
        console.log('新的客户端连接:', socket.id);
        let currentUser = null;
        
        socket.on('register', (data) => {
            const existingId = data.userId || null;
            const sessionToken = data.sessionToken || null;
            const existingColor = data.color || null;
            if (data.nickname && data.nickname.length > 20) { socket.emit('error', { message: '昵称不能超过20个字符' }); return; }
            
            let user;
            let isReconnect = false;
            
            if (existingId && existingId.startsWith('id_')) {
                const storedToken = sessionTokens.get(existingId);
                if (sessionToken && storedToken === sessionToken) {
                    const existingUser = db.getUserById(existingId);
                    if (existingUser) {
                        isReconnect = true;
                        user = {
                            ...existingUser,
                            nickname: data.nickname || existingUser.nickname,
                            avatar: data.avatar || existingUser.avatar,
                            color: existingColor && existingColor.startsWith('#') ? existingColor : existingUser.color
                        };
                        db.updateUser(user.id, { nickname: user.nickname, avatar: user.avatar, color: user.color });
                    }
                }
                if (!user) {
                    const dbUser = db.getUserById(existingId);
                    if (dbUser) {
                        sessionTokens.delete(existingId);
                        user = {
                            ...dbUser,
                            nickname: data.nickname || dbUser.nickname,
                            avatar: data.avatar || dbUser.avatar,
                            color: existingColor && existingColor.startsWith('#') ? existingColor : dbUser.color
                        };
                        db.updateUser(user.id, { nickname: user.nickname, avatar: user.avatar, color: user.color });
                    } else {
                        sessionTokens.delete(existingId);
                        user = {
                            id: db.generateId(),
                            nickname: data.nickname || getRandomName(),
                            avatar: data.avatar || null,
                            x: 0,
                            y: 0,
                            color: existingColor && existingColor.startsWith('#') ? existingColor : getRandomColor()
                        };
                        db.createUser(user);
                    }
                }
            } else {
                user = {
                    id: db.generateId(),
                    nickname: data.nickname || getRandomName(),
                    avatar: data.avatar || null,
                    x: 0,
                    y: 0,
                    color: existingColor && existingColor.startsWith('#') ? existingColor : getRandomColor()
                };
                db.createUser(user);
            }
            
            if (!sessionTokens.has(user.id)) {
                sessionTokens.set(user.id, 'tk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 14));
            }
            const token = sessionTokens.get(user.id);
            
            const wasOnlineBefore = disconnectOldSocket(user.id, socket.id);
            
            onlineUsers.set(socket.id, user);
            userSocketMap.set(user.id, socket.id);
            currentUser = user;
            currentUser.isAdmin = db.isAdmin(user.id);
            currentUser.isSuperAdmin = db.isSuperAdmin(user.id);

            if (db.isBanned(user.id)) {
                socket.emit('error', { message: '您的账号已被封禁' });
                socket.disconnect();
                return;
            }

            const visibleUsers = filterUsersForClient(user.id);
            const recentMessages = filterMessagesForClient(db.getRecentMessages(50), user.id);

            socket.emit('registered', { success: true, user, isAdmin: currentUser.isAdmin, isSuperAdmin: currentUser.isSuperAdmin, sessionToken: token, onlineUsers: visibleUsers, recentMessages });
            
            if (!wasOnlineBefore) {
                socket.broadcast.emit('user_joined', { user });
            } else {
                socket.broadcast.emit('user_reconnected', { userId: user.id, nickname: user.nickname, x: user.x, y: user.y });
            }
            
            console.log(`用户加入: ${user.nickname} (ID: ${user.id})`);
        });
        
        socket.on('update_profile', (data) => {
            if (!currentUser) return;
            if (data.nickname !== undefined && data.nickname.length > 20) { socket.emit('error', { message: '昵称不能超过20个字符' }); return; }
            if (data.bio !== undefined && data.bio.length > 200) { socket.emit('error', { message: '签名不能超过200个字符' }); return; }
            const allowedFields = ['nickname', 'avatar', 'color', 'bio'];
            const cleanData = {};
            for (const field of allowedFields) {
                if (data[field] !== undefined) cleanData[field] = data[field];
            }
            if (Object.keys(cleanData).length > 0) {
                db.updateUser(currentUser.id, cleanData);
                Object.assign(currentUser, cleanData);
                socket.emit('profile_updated', { user: currentUser });
                socket.broadcast.emit('user_profile_changed', { userId: currentUser.id, changes: cleanData });
            }
        });
        
        socket.on('send_friend_request', (data) => {
            if (!currentUser) return;
            const result = db.sendFriendRequest(currentUser.id, data.targetId);
            if (result.success) {
                const targetSocket = userSocketMap.get(data.targetId);
                if (targetSocket) io.to(targetSocket).emit('friend_request', { fromUser: { id: currentUser.id, nickname: currentUser.nickname, avatar: currentUser.avatar, color: currentUser.color } });
                socket.emit('friend_result', { targetId: data.targetId, success: true, action: 'request_sent' });
            } else {
                socket.emit('friend_result', { targetId: data.targetId, success: false, error: result.error });
            }
        });
        
        socket.on('accept_friend_request', (data) => {
            if (!currentUser) return;
            const result = db.acceptFriendRequest(data.fromId, currentUser.id);
            if (result.success) {
                const fromSocket = userSocketMap.get(data.fromId);
                if (fromSocket) io.to(fromSocket).emit('friend_accepted', { toUser: { id: currentUser.id, nickname: currentUser.nickname, avatar: currentUser.avatar, color: currentUser.color } });
                socket.emit('friend_result', { success: true, action: 'accepted' });
                const friends = db.getFriends(currentUser.id);
                socket.emit('friends_list', { friends });
                if (fromSocket) {
                    const theirFriends = db.getFriends(data.fromId);
                    io.to(fromSocket).emit('friends_list', { friends: theirFriends });
                }
            } else {
                socket.emit('friend_result', { success: false, error: result.error });
            }
        });
        
        socket.on('reject_friend_request', (data) => {
            if (!currentUser) return;
            db.rejectFriendRequest(data.fromId, currentUser.id);
            socket.emit('friend_result', { success: true, action: 'rejected' });
        });
        
        socket.on('get_pending_requests', () => {
            if (!currentUser) return;
            const requests = db.getPendingRequests(currentUser.id);
            socket.emit('pending_requests', { requests });
        });
        
        socket.on('remove_friend', (data) => {
            if (!currentUser) return;
            db.removeFriend(currentUser.id, data.targetId);
            const targetSocket = userSocketMap.get(data.targetId);
            if (targetSocket) io.to(targetSocket).emit('friend_removed', { fromUserId: currentUser.id });
            socket.emit('friend_result', { targetId: data.targetId, success: true, action: 'removed' });
            
            const friends = db.getFriends(currentUser.id);
            socket.emit('friends_list', { friends });
        });
        
        socket.on('get_friends', () => {
            if (!currentUser) return;
            const friends = db.getFriends(currentUser.id);
            socket.emit('friends_list', { friends });
            const pending = db.getPendingRequests(currentUser.id);
            socket.emit('pending_requests', { requests: pending });
        });
        
        socket.on('block_user', (data) => {
            if (!currentUser) return;
            const result = db.blockUser(currentUser.id, data.targetId);
            if (result.success) {
                invalidateBlockCache(currentUser.id);
                const targetSocket = userSocketMap.get(data.targetId);
                if (targetSocket) io.to(targetSocket).emit('user_left', { userId: currentUser.id, nickname: currentUser.nickname });
                socket.emit('block_result', { targetId: data.targetId, success: true });
            } else {
                socket.emit('block_result', { targetId: data.targetId, success: false, error: result.error });
            }
        });
        
        socket.on('unblock_user', (data) => {
            if (!currentUser) return;
            db.unblockUser(currentUser.id, data.targetId);
            invalidateBlockCache(currentUser.id);
            socket.emit('block_result', { targetId: data.targetId, success: true, action: 'unblocked' });
        });
        
        socket.on('move', (data) => {
            if (!currentUser) return;
            if (typeof data.x !== 'number' || typeof data.y !== 'number' || !isFinite(data.x) || !isFinite(data.y)) return;
            if (data.x < -100000 || data.x > 100000 || data.y < -100000 || data.y > 100000) return;
            currentUser.x = data.x;
            currentUser.y = data.y;
            positionDirty.add(currentUser.id);
            
            const blockedByOthers = [];
            for (const [sid, otherUser] of onlineUsers.entries()) {
                if (otherUser.id !== currentUser.id && getBlockedIds(otherUser.id).has(currentUser.id)) {
                    blockedByOthers.push(sid);
                }
            }
            
            const broadcastTargets = Array.from(io.sockets.sockets.keys())
                .filter(sid => sid !== socket.id && !blockedByOthers.includes(sid));
            
            if (broadcastTargets.length > 0) {
                io.to(broadcastTargets).emit('user_moved', { userId: currentUser.id, x: data.x, y: data.y });
            }
        });
        
        socket.on('send_message', (data) => {
            if (!currentUser) { socket.emit('error', { message: '请先注册用户' }); return; }
            if (db.isMuted(currentUser.id)) { socket.emit('error', { message: '您已被禁言，无法发送消息' }); return; }
            if (!data.content || typeof data.content !== 'string' || data.content.trim().length === 0) { socket.emit('error', { message: '消息内容不能为空' }); return; }
            if (data.content.length > 500) { socket.emit('error', { message: '消息内容过长（最多500字符）' }); return; }
            
            const now = Date.now();
            if (socket.lastMessageTime && now - socket.lastMessageTime < 1000) {
                socket.emit('error', { message: '发送太频繁，请稍后再试' });
                return;
            }
            socket.lastMessageTime = now;
            
            const msgX = typeof data.x === 'number' && isFinite(data.x) ? data.x : currentUser.x;
            const msgY = typeof data.y === 'number' && isFinite(data.y) ? data.y : currentUser.y;
            
            const message = {
                id: db.generateId(),
                x: msgX,
                y: msgY,
                content: data.content.trim(),
                author: currentUser.nickname,
                authorId: currentUser.id,
                authorColor: currentUser.color,
                authorIsAdmin: currentUser.isAdmin,
                friendOnly: !!data.friendOnly,
                timestamp: now
            };
            db.createMessage(message);
            
            const blockedSockets = [];
            for (const [sid, otherUser] of onlineUsers.entries()) {
                if (getBlockedIds(otherUser.id).has(currentUser.id)) {
                    blockedSockets.push(sid);
                }
            }
            
            let sendTargets;
            if (message.friendOnly) {
                sendTargets = [socket.id];
                for (const [sid, otherUser] of onlineUsers.entries()) {
                    if (!blockedSockets.includes(sid) && db.isFriend(currentUser.id, otherUser.id)) {
                        sendTargets.push(sid);
                    }
                }
            } else {
                sendTargets = Array.from(io.sockets.sockets.keys()).filter(sid => !blockedSockets.includes(sid));
            }
            
            if (sendTargets.length > 0) {
                io.to(sendTargets).emit('new_message', message);
            }
        });
        
        socket.on('send_private_message', (data) => {
            if (!currentUser) return;
            if (db.isMuted(currentUser.id)) { socket.emit('error', { message: '您已被禁言，无法发送私信' }); return; }
            if (!data.targetId || !data.content || !data.content.trim()) return;
            if (data.content.length > 2000) { socket.emit('error', { message: '私信内容不能超过2000字' }); return; }
            const dedupKey = currentUser.id + '_' + data.targetId + '_' + data.content.trim();
            const lastDm = recentDmCache.get(dedupKey);
            if (lastDm && Date.now() - lastDm < 2000) return;
            recentDmCache.set(dedupKey, Date.now());
            setTimeout(() => recentDmCache.delete(dedupKey), 5000);
            if (!db.isFriend(currentUser.id, data.targetId)) {
                socket.emit('error', { message: '只能给好友发送私信' }); return;
            }
            const pm = {
                id: db.generateId(),
                fromId: currentUser.id,
                fromName: currentUser.nickname,
                fromAvatar: currentUser.avatar,
                fromColor: currentUser.color,
                toId: data.targetId,
                content: data.content.trim(),
                timestamp: Date.now()
            };
            db.savePrivateMessage(pm.fromId, pm.toId, pm.content, pm.fromName, pm.fromAvatar, pm.fromColor);
            const targetSocket = userSocketMap.get(data.targetId);
            if (targetSocket) {
                io.to(targetSocket).emit('private_message', pm);
            }
            socket.emit('private_message_sent', { targetId: data.targetId, content: pm.content, timestamp: pm.timestamp });
        });

        socket.on('get_dm_history', (data) => {
            if (!currentUser || !data.targetId) return;
            const messages = db.getPrivateMessages(currentUser.id, data.targetId);
            socket.emit('dm_history', { targetId: data.targetId, messages });
        });

        socket.on('clear_dm_history', (data) => {
            if (!currentUser || !data.targetId) return;
            db.clearPrivateMessages(currentUser.id, data.targetId);
            socket.emit('dm_cleared', { targetId: data.targetId });
        });

        socket.on('admin_delete_message', (data) => {
            if (!currentUser || !currentUser.isAdmin) { socket.emit('error', { message: '无权限' }); return; }
            if (data.key !== ADMIN_KEY) { socket.emit('admin_result', { success: false, action: 'delete_message', error: '密钥错误' }); return; }
            db.deleteMessage(data.messageId);
            io.emit('message_deleted', { messageId: data.messageId, adminName: currentUser.nickname });
            socket.emit('admin_result', { success: true, action: 'delete_message' });
        });

        socket.on('admin_mute_user', (data) => {
            if (!currentUser || !currentUser.isAdmin) { socket.emit('error', { message: '无权限' }); return; }
            const result = db.muteUser(data.targetId, currentUser.id, data.reason);
            if (result.success) {
                const targetSocket = userSocketMap.get(data.targetId);
                if (targetSocket) io.to(targetSocket).emit('muted', { reason: data.reason, adminName: currentUser.nickname });
                socket.emit('admin_result', { success: true, action: 'mute', targetId: data.targetId });
            }
        });

        socket.on('admin_unmute_user', (data) => {
            if (!currentUser || !currentUser.isAdmin) { socket.emit('error', { message: '无权限' }); return; }
            db.unmuteUser(data.targetId);
            const targetSocket = userSocketMap.get(data.targetId);
            if (targetSocket) io.to(targetSocket).emit('unmuted', {});
            socket.emit('admin_result', { success: true, action: 'unmute', targetId: data.targetId });
        });

        socket.on('admin_broadcast', (data) => {
            if (!currentUser || !currentUser.isAdmin) { socket.emit('error', { message: '无权限' }); return; }
            if (!data.content || !data.content.trim()) return;
            if (data.content.length > 500) { socket.emit('error', { message: '广播内容不能超过500字' }); return; }
            const broadcastMsg = { id: db.generateId(), content: data.content.trim(), fromAdmin: currentUser.nickname, timestamp: Date.now() };
            io.emit('system_broadcast', broadcastMsg);
            socket.emit('admin_result', { success: true, action: 'broadcast' });
        });

        socket.on('admin_kick_user', (data) => {
            if (!currentUser || !currentUser.isAdmin) { socket.emit('error', { message: '无权限' }); return; }
            const targetSocket = userSocketMap.get(data.targetId);
            if (targetSocket) {
                io.to(targetSocket).emit('kicked', { adminName: currentUser.nickname, reason: data.reason });
                setTimeout(() => { const s = io.sockets.sockets.get(targetSocket); if (s) s.disconnect(); }, 500);
                socket.emit('admin_result', { success: true, action: 'kick', targetId: data.targetId });
            } else {
                socket.emit('admin_result', { success: false, action: 'kick', error: '用户不在线' });
            }
        });

        socket.on('admin_kick_guests', () => {
            if (!currentUser || !currentUser.isAdmin) { socket.emit('error', { message: '无权限' }); return; }
            const guestSockets = [];
            for (const [sid, user] of onlineUsers.entries()) {
                if (!user.username) {
                    io.to(sid).emit('kicked', { adminName: currentUser.nickname, reason: '游客账号已被管理员注销' });
                    guestSockets.push(sid);
                }
            }
            const result = db.deleteGuestUsers();
            setTimeout(() => {
                guestSockets.forEach(sid => { const s = io.sockets.sockets.get(sid); if (s) s.disconnect(); });
            }, 500);
            socket.emit('admin_result', { success: true, action: 'kick_guests', deleted: result.deleted });
        });

        socket.on('admin_ban_user', (data) => {
            if (!currentUser || !currentUser.isAdmin) { socket.emit('error', { message: '无权限' }); return; }
            db.banUser(data.targetId, currentUser.id, data.reason);
            const targetSocket = userSocketMap.get(data.targetId);
            if (targetSocket) {
                io.to(targetSocket).emit('banned', { adminName: currentUser.nickname, reason: data.reason });
                setTimeout(() => { const s = io.sockets.sockets.get(targetSocket); if (s) s.disconnect(); }, 500);
            }
            socket.emit('admin_result', { success: true, action: 'ban', targetId: data.targetId });
        });

        socket.on('admin_unban_user', (data) => {
            if (!currentUser || !currentUser.isAdmin) { socket.emit('error', { message: '无权限' }); return; }
            db.unbanUser(data.targetId);
            socket.emit('admin_result', { success: true, action: 'unban', targetId: data.targetId });
        });

        socket.on('admin_get_user_info', (data) => {
            if (!currentUser || !currentUser.isAdmin) { socket.emit('error', { message: '无权限' }); return; }
            const info = db.getUserById(data.targetId);
            if (info) socket.emit('user_info_detail', info);
            else socket.emit('admin_result', { success: false, action: 'get_info', error: '用户不存在' });
        });

        socket.on('admin_clear_messages', (data) => {
            if (!currentUser || !currentUser.isAdmin) { socket.emit('error', { message: '无权限' }); return; }
            db.clearAllMessages();
            io.emit('messages_cleared', { adminName: currentUser.nickname });
            socket.emit('admin_result', { success: true, action: 'clear_messages' });
        });

        socket.on('admin_cleanup', (data) => {
            if (!currentUser || !currentUser.isAdmin) { socket.emit('error', { message: '无权限' }); return; }
            const result = db.cleanupInactiveUsers(data.days || 30);
            socket.emit('admin_result', { success: true, action: 'cleanup', cleaned: result.cleaned });
        });

        socket.on('admin_update_user', (data) => {
            if (!currentUser || !currentUser.isAdmin) { socket.emit('error', { message: '无权限' }); return; }
            const result = db.updateUserField(data.targetId, data.field, data.value);
            if (result.success) {
                const targetSocket = userSocketMap.get(data.targetId);
                if (targetSocket) {
                    const targetUser = onlineUsers.get(targetSocket);
                    if (targetUser) targetUser[data.field] = data.value;
                    io.to(targetSocket).emit('profile_updated', { field: data.field, value: data.value });
                }
                socket.emit('admin_result', { success: true, action: 'update_user', targetId: data.targetId });
            } else {
                socket.emit('admin_result', { success: false, action: 'update_user', error: result.error });
            }
        });

        socket.on('admin_set_admin', (data) => {
            if (!currentUser || !currentUser.isSuperAdmin) { socket.emit('error', { message: '仅站长可设置管理员' }); return; }
            if (db.isSuperAdmin(data.targetId)) { socket.emit('error', { message: '无法修改站长权限' }); return; }
            db.setAdmin(data.targetId, true);
            const targetSocket = userSocketMap.get(data.targetId);
            if (targetSocket) {
                const targetUser = onlineUsers.get(targetSocket);
                if (targetUser) targetUser.isAdmin = true;
                io.to(targetSocket).emit('became_admin', {});
            }
            socket.emit('admin_result', { success: true, action: 'set_admin', targetId: data.targetId });
        });

        socket.on('admin_unset_admin', (data) => {
            if (!currentUser || !currentUser.isSuperAdmin) { socket.emit('error', { message: '仅站长可取消管理员' }); return; }
            if (db.isSuperAdmin(data.targetId)) { socket.emit('error', { message: '无法修改站长权限' }); return; }
            db.setAdmin(data.targetId, false);
            const targetSocket = userSocketMap.get(data.targetId);
            if (targetSocket) {
                const targetUser = onlineUsers.get(targetSocket);
                if (targetUser) targetUser.isAdmin = false;
                io.to(targetSocket).emit('lost_admin', {});
            }
            socket.emit('admin_result', { success: true, action: 'unset_admin', targetId: data.targetId });
        });

        socket.on('admin_get_lists', () => {
            if (!currentUser || !currentUser.isAdmin) return;
            socket.emit('admin_lists', {
                banned: db.getBannedUsers(),
                muted: db.getMutedUsers()
            });
        });

        socket.on('admin_get_all_users', () => {
            if (!currentUser || !currentUser.isAdmin) return;
            socket.emit('all_users_list', { users: db.getAllUsersInfo() });
        });

        socket.on('disconnect', () => {
            if (currentUser) {
                if (positionDirty.has(currentUser.id)) db.updateUserPosition(currentUser.id, currentUser.x, currentUser.y);
                positionDirty.delete(currentUser.id);
                if (!isUserOnlineExcluding(currentUser.id, socket.id)) {
                    const leftTargets = [];
                    for (const [sid, otherUser] of onlineUsers.entries()) {
                        if (sid !== socket.id && !getBlockedIds(otherUser.id).has(currentUser.id)) {
                            leftTargets.push(sid);
                        }
                    }
                    if (leftTargets.length > 0) {
                        io.to(leftTargets).emit('user_left', { userId: currentUser.id, nickname: currentUser.nickname });
                    }
                }
                userSocketMap.delete(currentUser.id);
            }
            onlineUsers.delete(socket.id);
            console.log(`客户端断开: ${socket.id}`);
        });
    });

    setInterval(() => { db.cleanupInactiveUsers(); }, 60 * 60 * 1000);
    setInterval(() => { flushPositions(); }, 5000);

    process.on('SIGINT', () => { 
        console.log('\n正在关闭服务器...'); 
        flushPositions();
        db.closeDatabase(); 
        server.close(() => { 
            console.log('服务器已关闭'); 
            process.exit(0); 
        }); 
    });

    server.listen(PORT, () => {
        console.log(`🌐 MeChat 服务器运行中 - http://localhost:${PORT}`);
    });
}

startServer().catch(console.error);
