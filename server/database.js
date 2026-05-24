const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'mechat.db');
let db = null;
let SQL = null;

let dbDirty = false;
let saveTimer = null;
const SAVE_INTERVAL = 2000;

function hashPassword(password) {
    return crypto.createHash('sha256').update('mechat_salt_' + password).digest('hex');
}

async function initDatabase() {
    SQL = await initSqlJs();
    
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }
    
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE,
            password_hash TEXT,
            nickname TEXT NOT NULL,
            avatar TEXT,
            x REAL DEFAULT 0,
            y REAL DEFAULT 0,
            color TEXT,
            bio TEXT DEFAULT '',
            last_active INTEGER,
            created_at INTEGER
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS friends (
            user_id TEXT NOT NULL,
            friend_id TEXT NOT NULL,
            created_at INTEGER,
            PRIMARY KEY (user_id, friend_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS blocks (
            user_id TEXT NOT NULL,
            blocked_id TEXT NOT NULL,
            created_at INTEGER,
            PRIMARY KEY (user_id, blocked_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS friend_requests (
            from_id TEXT NOT NULL,
            to_id TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at INTEGER,
            PRIMARY KEY (from_id, to_id),
            FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            x REAL NOT NULL,
            y REAL NOT NULL,
            content TEXT NOT NULL,
            author TEXT NOT NULL,
            author_id TEXT NOT NULL,
            author_color TEXT,
            timestamp INTEGER NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS private_messages (
            id TEXT PRIMARY KEY,
            from_id TEXT NOT NULL,
            to_id TEXT NOT NULL,
            content TEXT NOT NULL,
            from_name TEXT NOT NULL,
            from_avatar TEXT,
            from_color TEXT,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    try { db.run(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`); } catch(e) {}
    try { db.run(`ALTER TABLE users ADD COLUMN is_super_admin INTEGER DEFAULT 0`); } catch(e) {}

    db.run(`
        CREATE TABLE IF NOT EXISTS banned_users (
            user_id TEXT PRIMARY KEY,
            banned_by TEXT NOT NULL,
            reason TEXT,
            created_at INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS muted_users (
            user_id TEXT PRIMARY KEY,
            muted_by TEXT NOT NULL,
            reason TEXT,
            created_at INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    forceSave();
    console.log('数据库初始化完成');
    return db;
}

function markDirty() {
    dbDirty = true;
    if (!saveTimer) {
        saveTimer = setTimeout(() => {
            flushSave();
        }, SAVE_INTERVAL);
    }
}

function flushSave() {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    if (dbDirty) {
        forceSave();
    }
}

function forceSave() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
    dbDirty = false;
}

function saveDatabase() {
    markDirty();
}

function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
}

function mapQueryResult(results) {
    if (results.length === 0) return [];
    const columns = results[0].columns;
    return results[0].values.map(row => { const obj = {}; columns.forEach((c, i) => obj[c] = row[i]); return obj; });
}

function getUserById(userId) {
    const results = db.exec(`SELECT id, username, nickname, avatar, x, y, color, bio, last_active, created_at, is_admin, is_super_admin FROM users WHERE id = ?`, [userId]);
    if (results.length === 0) return null;
    const columns = results[0].columns;
    const row = results[0].values[0];
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
}

function getUserByUsername(username) {
    const results = db.exec(`SELECT id, username, password_hash, nickname, avatar, x, y, color, bio, last_active, created_at, is_admin, is_super_admin FROM users WHERE username = ?`, [username]);
    if (results.length === 0) return null;
    const columns = results[0].columns;
    const row = results[0].values[0];
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
}

function createUser(userData) {
    db.run(`
        INSERT INTO users (id, username, password_hash, nickname, avatar, x, y, color, bio, last_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        userData.id,
        userData.username || null,
        userData.passwordHash || null,
        userData.nickname,
        userData.avatar || null,
        userData.x || 0,
        userData.y || 0,
        userData.color,
        userData.bio || '',
        Date.now(),
        Date.now()
    ]);
    saveDatabase();
    return { changes: 1 };
}

function updateUser(userId, data) {
    const fields = [];
    const values = [];
    
    if (data.nickname !== undefined) { fields.push('nickname = ?'); values.push(data.nickname); }
    if (data.avatar !== undefined) { fields.push('avatar = ?'); values.push(data.avatar); }
    if (data.x !== undefined) { fields.push('x = ?'); values.push(data.x); }
    if (data.y !== undefined) { fields.push('y = ?'); values.push(data.y); }
    if (data.color !== undefined) { fields.push('color = ?'); values.push(data.color); }
    if (data.bio !== undefined) { fields.push('bio = ?'); values.push(data.bio); }
    if (data.passwordHash !== undefined) { fields.push('password_hash = ?'); values.push(data.passwordHash); }
    
    fields.push('last_active = ?');
    values.push(Date.now());
    values.push(userId);
    
    if (fields.length > 1) {
        db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
        saveDatabase();
    }
    return { changes: 1 };
}

function updateUserPosition(userId, x, y) {
    db.run(`UPDATE users SET x = ?, y = ?, last_active = ? WHERE id = ?`, [x, y, Date.now(), userId]);
    markDirty();
    return { changes: 1 };
}

function getOnlineUsers() {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const results = db.exec(`SELECT id, username, nickname, avatar, x, y, color, bio, last_active FROM users WHERE last_active > ?`, [fiveMinutesAgo]);
    if (results.length === 0) return [];
    
    const columns = results[0].columns;
    return results[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}

function verifyLogin(username, password) {
    const user = getUserByUsername(username);
    if (!user) return { success: false, error: '用户不存在' };
    if (!user.password_hash) return { success: false, error: '该账号未设置密码，请使用游客模式' };
    if (user.password_hash !== hashPassword(password)) return { success: false, error: '密码错误' };
    return { success: true, user };
}

function registerUser(username, password, nickname, color) {
    if (getUserByUsername(username)) return { success: false, error: '用户名已存在' };
    if (!username || username.length < 2) return { success: false, error: '用户名至少2个字符' };
    if (!password || password.length < 4) return { success: false, error: '密码至少4个字符' };
    
    const id = generateId();
    createUser({
        id,
        username,
        passwordHash: hashPassword(password),
        nickname: nickname || username,
        color: color
    });
    return { success: true, id };
}

function addFriend(userId, friendId) {
    if (userId === friendId) return { success: false, error: '不能添加自己为好友' };
    try {
        db.run(`INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)`, [userId, friendId, Date.now()]);
        db.run(`INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)`, [friendId, userId, Date.now()]);
        saveDatabase();
        return { success: true };
    } catch (e) {
        return { success: false, error: '添加失败' };
    }
}

function removeFriend(userId, friendId) {
    db.run(`DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`, [userId, friendId, friendId, userId]);
    saveDatabase();
    return { success: true };
}

function getFriends(userId) {
    const results = db.exec(`
        SELECT u.id, u.username, u.nickname, u.avatar, u.color, u.bio, u.last_active 
        FROM friends f JOIN users u ON f.friend_id = u.id 
        WHERE f.user_id = ?
    `, [userId]);
    if (results.length === 0) return [];
    const columns = results[0].columns;
    return results[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}

function isFriend(userId, targetId) {
    const results = db.exec(`SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?`, [userId, targetId]);
    return results.length > 0;
}

function sendFriendRequest(fromId, toId) {
    if (fromId === toId) return { success: false, error: '不能添加自己为好友' };
    if (isFriend(fromId, toId)) return { success: false, error: '已经是好友了' };
    const existing = db.exec(`SELECT status FROM friend_requests WHERE from_id = ? AND to_id = ?`, [fromId, toId]);
    if (existing.length > 0) return { success: false, error: '已发送过申请' };
    try {
        db.run(`INSERT INTO friend_requests (from_id, to_id, status, created_at) VALUES (?, ?, 'pending', ?)`, [fromId, toId, Date.now()]);
        saveDatabase();
        return { success: true };
    } catch (e) {
        return { success: false, error: '发送失败' };
    }
}

function acceptFriendRequest(fromId, toId) {
    const req = db.exec(`SELECT status FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'`, [fromId, toId]);
    if (req.length === 0) return { success: false, error: '申请不存在或已处理' };
    db.run(`UPDATE friend_requests SET status = 'accepted' WHERE from_id = ? AND to_id = ?`, [fromId, toId]);
    addFriend(fromId, toId);
    saveDatabase();
    return { success: true };
}

function rejectFriendRequest(fromId, toId) {
    db.run(`UPDATE friend_requests SET status = 'rejected' WHERE from_id = ? AND to_id = ?`, [fromId, toId]);
    saveDatabase();
    return { success: true };
}

function getPendingRequests(userId) {
    const results = db.exec(`
        SELECT u.id, u.username, u.nickname, u.avatar, u.color, r.from_id as requestId
        FROM friend_requests r JOIN users u ON r.from_id = u.id 
        WHERE r.to_id = ? AND r.status = 'pending'
    `, [userId]);
    if (results.length === 0) return [];
    const columns = results[0].columns;
    return results[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}

function savePrivateMessage(fromId, toId, content, fromName, fromAvatar, fromColor) {
    const id = generateId();
    db.run(`INSERT INTO private_messages (id, from_id, to_id, content, from_name, from_avatar, from_color, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, fromId, toId, content, fromName, fromAvatar, fromColor, Date.now()]);
    saveDatabase();
    return id;
}

function getPrivateMessages(userId1, userId2, limit) {
    limit = limit || 50;
    const results = db.exec(`
        SELECT id, from_id, to_id, content, from_name, from_avatar, from_color, timestamp 
        FROM private_messages 
        WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)
        ORDER BY timestamp ASC LIMIT ?
    `, [userId1, userId2, userId2, userId1, limit]);
    if (results.length === 0) return [];
    const columns = results[0].columns;
    return results[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}

function clearPrivateMessages(userId1, userId2) {
    db.run(`DELETE FROM private_messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)`, [userId1, userId2, userId2, userId1]);
    saveDatabase();
}

function setAdmin(userId, isAdmin) {
    db.run(`UPDATE users SET is_admin = ? WHERE id = ?`, [isAdmin ? 1 : 0, userId]);
    saveDatabase();
}

function isAdmin(userId) {
    const results = db.exec(`SELECT is_admin FROM users WHERE id = ?`, [userId]);
    if (results.length === 0 || results[0].values.length === 0) return false;
    return results[0].values[0][0] === 1;
}

function setSuperAdmin(userId, isSuper) {
    db.run(`UPDATE users SET is_super_admin = ? WHERE id = ?`, [isSuper ? 1 : 0, userId]);
    saveDatabase();
}

function isSuperAdmin(userId) {
    const results = db.exec(`SELECT is_super_admin FROM users WHERE id = ?`, [userId]);
    if (results.length === 0 || results[0].values.length === 0) return false;
    return results[0].values[0][0] === 1;
}

function banUser(userId, adminId, reason) {
    db.run(`INSERT OR REPLACE INTO banned_users (user_id, banned_by, reason, created_at) VALUES (?, ?, ?, ?)`,
        [userId, adminId, reason || '', Date.now()]);
    saveDatabase();
    return { success: true };
}

function unbanUser(userId) {
    db.run(`DELETE FROM banned_users WHERE user_id = ?`, [userId]);
    saveDatabase();
    return { success: true };
}

function isBanned(userId) {
    const results = db.exec(`SELECT user_id FROM banned_users WHERE user_id = ?`, [userId]);
    return results.length > 0 && results[0].values.length > 0;
}

function muteUser(userId, adminId, reason) {
    db.run(`INSERT OR REPLACE INTO muted_users (user_id, muted_by, reason, created_at) VALUES (?, ?, ?, ?)`,
        [userId, adminId, reason || '', Date.now()]);
    saveDatabase();
    return { success: true };
}

function unmuteUser(userId) {
    db.run(`DELETE FROM muted_users WHERE user_id = ?`, [userId]);
    saveDatabase();
    return { success: true };
}

function isMuted(userId) {
    const results = db.exec(`SELECT user_id FROM muted_users WHERE user_id = ?`, [userId]);
    return results.length > 0 && results[0].values.length > 0;
}

function deleteMessage(messageId) {
    db.run(`DELETE FROM messages WHERE id = ?`, [messageId]);
    saveDatabase();
}

function clearAllMessages() {
    db.run(`DELETE FROM messages`);
    saveDatabase();
}

function getBannedUsers() {
    const results = db.exec(`
        SELECT b.user_id, u.nickname, u.username, b.banned_by, b.reason, b.created_at
        FROM banned_users b LEFT JOIN users u ON b.user_id = u.id
    `);
    if (results.length === 0) return [];
    const columns = results[0].columns;
    return results[0].values.map(row => { const obj = {}; columns.forEach((c, i) => obj[c] = row[i]); return obj; });
}

function getMutedUsers() {
    const results = db.exec(`
        SELECT m.user_id, u.nickname, u.username, m.muted_by, m.reason, m.created_at
        FROM muted_users m LEFT JOIN users u ON m.user_id = u.id
    `);
    if (results.length === 0) return [];
    const columns = results[0].columns;
    return results[0].values.map(row => { const obj = {}; columns.forEach((c, i) => obj[c] = row[i]); return obj; });
}

function updateUserField(userId, field, value) {
    const allowedFields = ['nickname', 'avatar', 'color', 'bio'];
    if (!allowedFields.includes(field)) return { success: false, error: '不允许修改此字段' };
    db.run(`UPDATE users SET ${field} = ? WHERE id = ?`, [value, userId]);
    saveDatabase();
    return { success: true };
}

function cleanupInactiveUsers(maxInactiveDays) {
    maxInactiveDays = maxInactiveDays || 30;
    const cutoff = Date.now() - (maxInactiveDays * 24 * 60 * 60 * 1000);
    db.run(`DELETE FROM messages WHERE timestamp < ?`, [cutoff]);
    db.run(`DELETE FROM private_messages WHERE timestamp < ?`, [cutoff]);
    db.run(`DELETE FROM friend_requests WHERE created_at < ?`, [cutoff]);
    const results = db.exec(`SELECT COUNT(*) as count FROM users WHERE last_active < ? AND last_active > 0`, [cutoff]);
    const count = results.length > 0 ? results[0].values[0][0] : 0;
    saveDatabase();
    return { cleaned: count };
}

function deleteGuestUsers() {
    const results = db.exec(`SELECT id FROM users WHERE username IS NULL`);
    if (results.length === 0) return { deleted: 0 };
    const guestIds = results[0].values.map(row => row[0]);
    guestIds.forEach(id => {
        db.run(`DELETE FROM messages WHERE author_id = ?`, [id]);
        db.run(`DELETE FROM private_messages WHERE from_id = ? OR to_id = ?`, [id, id]);
        db.run(`DELETE FROM friend_requests WHERE from_id = ? OR to_id = ?`, [id, id]);
        db.run(`DELETE FROM friends WHERE user_id = ? OR friend_id = ?`, [id, id]);
        db.run(`DELETE FROM blocks WHERE user_id = ? OR blocked_id = ?`, [id, id]);
        db.run(`DELETE FROM muted_users WHERE user_id = ?`, [id]);
        db.run(`DELETE FROM users WHERE id = ?`, [id]);
    });
    saveDatabase();
    return { deleted: guestIds.length };
}

function getAllUsersInfo() {
    const results = db.exec(`
        SELECT id, username, nickname, avatar, color, bio, is_admin, is_super_admin, last_active, created_at FROM users ORDER BY created_at DESC
    `);
    if (results.length === 0) return [];
    const columns = results[0].columns;
    return mapQueryResult(results);
}

function blockUser(userId, blockedId) {
    if (userId === blockedId) return { success: false, error: '不能屏蔽自己' };
    removeFriend(userId, blockedId);
    db.run(`INSERT OR IGNORE INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)`, [userId, blockedId, Date.now()]);
    saveDatabase();
    return { success: true };
}

function unblockUser(userId, blockedId) {
    db.run(`DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?`, [userId, blockedId]);
    saveDatabase();
    return { success: true };
}

function isBlocked(userId, targetId) {
    const results = db.exec(`SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?`, [userId, targetId]);
    return results.length > 0;
}

function getBlockedUsers(userId) {
    const results = db.exec(`SELECT blocked_id FROM blocks WHERE user_id = ?`, [userId]);
    if (results.length === 0) return new Set();
    return new Set(results[0].values.map(row => row[0]));
}

function createMessage(messageData) {
    db.run(`
        INSERT INTO messages (id, user_id, x, y, content, author, author_id, author_color, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        messageData.id,
        messageData.userId || null,
        messageData.x,
        messageData.y,
        messageData.content,
        messageData.author,
        messageData.authorId,
        messageData.authorColor,
        messageData.timestamp || Date.now()
    ]);
    markDirty();
    return { changes: 1 };
}

function getMessages(options = {}) {
    const { limit = 100, offset = 0, x, y, radius = 2000 } = options;

    let query = `SELECT m.id, m.user_id as userId, m.x, m.y, m.content, m.author, 
                        m.author_id as authorId, m.author_color as authorColor, 
                        m.timestamp, u.is_admin as authorIsAdmin 
                 FROM messages m LEFT JOIN users u ON m.author_id = u.id`;
    let params = [];

    if (x !== undefined && y !== undefined) {
        query += ` WHERE m.x BETWEEN ? AND ? AND m.y BETWEEN ? AND ?`;
        params = [x - radius, x + radius, y - radius, y + radius];
    }

    query += ' ORDER BY m.timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = db.exec(query, params);
    if (results.length === 0) return [];

    const columns = results[0].columns;
    return results[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}

function getRecentMessages(limit = 50) {
    const results = db.exec(`
        SELECT m.id, m.user_id as userId, m.x, m.y, m.content, m.author, 
               m.author_id as authorId, m.author_color as authorColor, 
               m.timestamp, u.is_admin as authorIsAdmin 
        FROM messages m LEFT JOIN users u ON m.author_id = u.id 
        ORDER BY m.timestamp DESC LIMIT ?
    `, [limit]);
    if (results.length === 0) return [];

    const columns = results[0].columns;
    return results[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}



function clearMessages() {
    db.run(`DELETE FROM messages`);
    const result = db.exec('SELECT changes()');
    const changes = result.length > 0 ? result[0].values[0][0] : 0;
    console.log(`清空了 ${changes} 条消息`);
    saveDatabase();
    return changes;
}

function closeDatabase() {
    if (db) {
        flushSave();
        db.close();
        db = null;
    }
}

module.exports = {
    initDatabase,
    saveDatabase,
    generateId,
    hashPassword,
    getUserById,
    getUserByUsername,
    createUser,
    updateUser,
    updateUserPosition,
    getOnlineUsers,
    verifyLogin,
    registerUser,
    addFriend,
    removeFriend,
    getFriends,
    isFriend,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    getPendingRequests,
    savePrivateMessage,
    getPrivateMessages,
    clearPrivateMessages,
    setAdmin,
    isAdmin,
    setSuperAdmin,
    isSuperAdmin,
    banUser,
    unbanUser,
    isBanned,
    muteUser,
    unmuteUser,
    isMuted,
    deleteMessage,
    clearAllMessages,
    getBannedUsers,
    getMutedUsers,
    updateUserField,
    cleanupInactiveUsers,
    deleteGuestUsers,
    getAllUsersInfo,
    blockUser,
    unblockUser,
    isBlocked,
    getBlockedUsers,
    createMessage,
    getMessages,
    getRecentMessages,
    cleanupInactiveUsers,
    clearMessages,
    closeDatabase,
    flushSave
};
