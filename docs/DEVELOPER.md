# MeChat 开发者文档

## 目录
1. [架构概览](#架构概览)
2. [后端架构](#后端架构)
3. [前端架构](#前端架构)
4. [数据流](#数据流)
5. [安全机制](#安全机制)
6. [性能优化](#性能优化)
7. [调试指南](#调试指南)

---

## 架构概览

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         客户端                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Canvas     │  │  Socket.IO   │  │     UI       │      │
│  │   渲染层      │  │   通信层      │  │   交互层      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebSocket / HTTP
┌──────────────────────────▼──────────────────────────────────┐
│                        服务器                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Express Server                      │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │  │
│  │  │  REST API    │  │  Socket.IO   │  │  Static   │  │  │
│  │  │   路由       │  │   处理器      │  │   Files   │  │  │
│  │  └──────────────┘  └──────────────┘  └───────────┘  │  │
│  └──────────────────────────┬───────────────────────────┘  │
│                             │                              │
│  ┌──────────────────────────▼───────────────────────────┐  │
│  │                  Database Module                      │  │
│  │              (sql.js - SQLite)                        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 后端架构

### 1. 服务器入口 (server/index.js)

#### 核心模块

```javascript
// 主要依赖
const express = require('express');      // Web 服务器
const http = require('http');            // HTTP 服务器
const { Server } = require('socket.io'); // 实时通信
const cors = require('cors');            // 跨域支持
const db = require('./database');        // 数据库模块
```

#### 服务器配置

```javascript
const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: '*', methods: ['GET', 'POST'] } 
});
```

#### 中间件配置

```javascript
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..'), {
    etag: true, 
    maxAge: '5m',
    setHeaders: (res, path) => {
        if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.ico')) {
            res.setHeader('Cache-Control', 'public, max-age=300');
        }
    }
}));
```

### 2. 状态管理

#### 在线用户管理

```javascript
const onlineUsers = new Map();      // socket.id -> user
const userSocketMap = new Map();    // userId -> socket.id
const blockedCache = new Map();     // userId -> Set(blockedIds)
const positionDirty = new Set();    // 需要保存位置的用户
```

#### 核心函数

```javascript
// 获取用户屏蔽列表（带缓存）
function getBlockedIds(userId) {
    if (blockedCache.has(userId)) return blockedCache.get(userId);
    const ids = db.getBlockedUsers(userId);
    blockedCache.set(userId, ids);
    return ids;
}

// 使屏蔽缓存失效
function invalidateBlockCache(userId) {
    blockedCache.delete(userId);
    for (const [id] of onlineUsers) { 
        blockedCache.delete(id); 
    }
}

// 批量刷新位置到数据库
function flushPositions() {
    if (positionDirty.size === 0) return;
    for (const userId of positionDirty) {
        const user = Array.from(onlineUsers.values()).find(u => u.id === userId);
        if (user) db.updateUserPosition(userId, user.x, user.y);
    }
    positionDirty.clear();
}
```

### 3. Socket.IO 事件处理

#### 连接生命周期

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   connect   │────▶│  register   │────▶│  connected  │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ disconnected│◀────│  cleanup    │◀────│   events    │
└─────────────┘     └─────────────┘     └─────────────┘
```

#### 事件处理流程

```javascript
io.on('connection', (socket) => {
    let currentUser = null;
    
    // 1. 用户注册/登录
    socket.on('register', (data) => {
        // 处理用户注册逻辑
        // 发送 registered 事件
    });
    
    // 2. 位置更新
    socket.on('move', (data) => {
        // 更新位置
        // 广播给其他用户（考虑屏蔽）
    });
    
    // 3. 消息发送
    socket.on('send_message', (data) => {
        // 验证用户状态
        // 检查禁言状态
        // 频率限制
        // 保存消息
        // 广播（考虑好友可见/屏蔽）
    });
    
    // 4. 断开连接
    socket.on('disconnect', () => {
        // 保存位置
        // 通知其他用户
        // 清理状态
    });
});
```

### 4. 数据库模块 (server/database.js)

#### 数据库初始化

```javascript
async function initDatabase() {
    SQL = await initSqlJs();
    
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }
    
    // 创建表结构
    createTables();
    
    // 强制保存
    forceSave();
}
```

#### 数据持久化策略

```javascript
// 标记脏数据
function markDirty() {
    dbDirty = true;
    if (!saveTimer) {
        saveTimer = setTimeout(() => {
            flushSave();
        }, SAVE_INTERVAL);  // 2秒延迟保存
    }
}

// 强制保存
function forceSave() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
    dbDirty = false;
}
```

#### 核心数据操作

```javascript
// 用户操作
module.exports = {
    // 查询
    getUserById,
    getUserByUsername,
    getOnlineUsers,
    
    // 创建/更新
    createUser,
    updateUser,
    updateUserPosition,
    
    // 认证
    verifyLogin,
    registerUser,
    
    // 好友
    addFriend,
    removeFriend,
    getFriends,
    isFriend,
    
    // 消息
    createMessage,
    getMessages,
    getRecentMessages,
    
    // 管理
    banUser,
    unbanUser,
    muteUser,
    unmuteUser,
    setAdmin,
    setSuperAdmin
};
```

---

## 前端架构

### 1. 页面结构

```html
<!DOCTYPE html>
<html>
<head>
    <!-- 样式和字体 -->
    <link href="https://fonts.googleapis.com/css2?family=...">
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/.../font-awesome.min.css">
</head>
<body>
    <!-- 入口界面 -->
    <div id="entryScreen">...</div>
    
    <!-- 游戏画布 -->
    <canvas id="worldCanvas"></canvas>
    
    <!-- UI 层 -->
    <div class="online-badge">...</div>
    <div class="user-card">...</div>
    <div class="coords-display">...</div>
    <div class="controls-hint">...</div>
    
    <!-- 消息输入 -->
    <div class="message-input-container">...</div>
    
    <!-- 对话框 -->
    <div class="dialog-overlay">...</div>
    <div class="modal-overlay">...</div>
</body>
</html>
```

### 2. 核心类设计

#### 应用状态管理

```javascript
const AppState = {
    // 用户状态
    currentUser: null,
    isAdmin: false,
    isSuperAdmin: false,
    
    // 在线用户
    onlineUsers: new Map(),
    
    // 消息
    messages: [],
    privateMessages: new Map(),
    
    // 好友
    friends: [],
    pendingRequests: [],
    blockedUsers: new Set(),
    
    // 画布状态
    camera: { x: 0, y: 0 },
    viewport: { width: 0, height: 0 },
    
    // 输入状态
    keys: new Set(),
    mouse: { x: 0, y: 0 },
    
    // 消息输入
    isTyping: false,
    friendOnlyMode: false
};
```

#### 渲染循环

```javascript
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.lastTime = 0;
    }
    
    start() {
        const loop = (timestamp) => {
            const deltaTime = timestamp - this.lastTime;
            this.lastTime = timestamp;
            
            this.update(deltaTime);
            this.render();
            
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
    
    update(deltaTime) {
        // 更新用户位置
        // 更新相机位置
        // 更新动画
    }
    
    render() {
        // 清空画布
        // 绘制网格
        // 绘制消息
        // 绘制用户
        // 绘制UI
    }
}
```

### 3. 输入处理

#### 键盘控制

```javascript
const InputHandler = {
    init() {
        window.addEventListener('keydown', (e) => {
            if (AppState.isTyping) return;
            
            switch(e.key) {
                case 'w': case 'ArrowUp':    // 向上移动
                case 's': case 'ArrowDown':  // 向下移动
                case 'a': case 'ArrowLeft':  // 向左移动
                case 'd': case 'ArrowRight': // 向右移动
                    AppState.keys.add(e.key);
                    break;
                case 'Enter':
                case 't':
                    openMessageInput();
                    break;
                case 'Escape':
                    closeMessageInput();
                    break;
            }
        });
        
        window.addEventListener('keyup', (e) => {
            AppState.keys.delete(e.key);
        });
    }
};
```

#### 鼠标控制

```javascript
const MouseHandler = {
    init() {
        const canvas = document.getElementById('worldCanvas');
        
        canvas.addEventListener('click', (e) => {
            if (AppState.isTyping) return;
            
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // 转换到世界坐标
            const worldX = x - AppState.camera.x;
            const worldY = y - AppState.camera.y;
            
            // 处理点击
            handleWorldClick(worldX, worldY);
        });
        
        canvas.addEventListener('mousemove', (e) => {
            // 更新鼠标位置
        });
    }
};
```

### 4. 网络通信

#### Socket 连接管理

```javascript
const NetworkManager = {
    socket: null,
    
    connect() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });
        
        this.socket.on('registered', (data) => {
            // 处理注册成功
        });
        
        this.socket.on('new_message', (message) => {
            // 处理新消息
        });
        
        this.socket.on('user_moved', (data) => {
            // 更新用户位置
        });
        
        // ... 其他事件处理
    },
    
    // 发送消息
    sendMessage(content, options = {}) {
        this.socket.emit('send_message', {
            content,
            x: AppState.currentUser.x,
            y: AppState.currentUser.y,
            friendOnly: options.friendOnly || false
        });
    },
    
    // 移动
    move(x, y) {
        this.socket.emit('move', { x, y });
    }
};
```

---

## 数据流

### 1. 用户注册流程

```
┌─────────┐     register      ┌─────────┐     createUser      ┌─────────┐
│  Client │ ─────────────────▶ │ Server  │ ─────────────────▶ │   DB    │
└─────────┘                    └─────────┘                    └─────────┘
     │                              │                              │
     │                              │ ◀────────────────────────────┘
     │                              │    user created
     │ ◀────────────────────────────┘
     │    registered event
     │    { user, onlineUsers, messages }
     ▼
┌─────────┐
│  Render │
└─────────┘
```

### 2. 消息发送流程

```
┌─────────┐    send_message    ┌─────────┐    createMessage    ┌─────────┐
│  Client │ ─────────────────▶ │ Server  │ ─────────────────▶ │   DB    │
└─────────┘                    └─────────┘                    └─────────┘
                                      │
                                      │ getBlockedIds
                                      ▼
                               ┌─────────────┐
                               │ Filter Users │
                               │ (blocked)   │
                               └─────────────┘
                                      │
                                      │ new_message
                                      ▼
                               ┌─────────────┐
                               │  Broadcast  │
                               │  to others  │
                               └─────────────┘
```

### 3. 位置同步流程

```
┌─────────┐      move         ┌─────────┐   update position   ┌─────────┐
│  Client │ ─────────────────▶ │ Server  │ ─────────────────▶ │  State  │
└─────────┘                    └─────────┘                    └─────────┘
                                      │
                                      │ user_moved
                                      ▼
                               ┌─────────────┐
                               │  Broadcast  │
                               │ (non-blocked)│
                               └─────────────┘
                                      │
                                      ▼
                               ┌─────────────┐
                               │ 5s interval │
                               │ flush to DB │
                               └─────────────┘
```

---

## 安全机制

### 1. 认证安全

#### 密码哈希

```javascript
function hashPassword(password) {
    return crypto
        .createHash('sha256')
        .update('mechat_salt_' + password)
        .digest('hex');
}
```

#### 登录验证

```javascript
function verifyLogin(username, password) {
    const user = getUserByUsername(username);
    if (!user) return { success: false, error: '用户不存在' };
    if (!user.password_hash) return { 
        success: false, 
        error: '该账号未设置密码，请使用游客模式' 
    };
    if (user.password_hash !== hashPassword(password)) {
        return { success: false, error: '密码错误' };
    }
    return { success: true, user };
}
```

### 2. 权限控制

#### 管理员验证

```javascript
socket.on('admin_delete_message', (data) => {
    // 1. 检查是否已登录
    if (!currentUser) { 
        socket.emit('error', { message: '无权限' }); 
        return; 
    }
    
    // 2. 检查管理员权限
    if (!currentUser.isAdmin) { 
        socket.emit('error', { message: '无权限' }); 
        return; 
    }
    
    // 3. 验证管理员密钥
    if (data.key !== ADMIN_KEY) { 
        socket.emit('admin_result', { 
            success: false, 
            action: 'delete_message', 
            error: '密钥错误' 
        }); 
        return; 
    }
    
    // 4. 执行操作
    db.deleteMessage(data.messageId);
    // ...
});
```

### 3. 频率限制

#### 消息节流

```javascript
socket.on('send_message', (data) => {
    const now = Date.now();
    if (socket.lastMessageTime && now - socket.lastMessageTime < 1000) {
        socket.emit('error', { message: '发送太频繁，请稍后再试' });
        return;
    }
    socket.lastMessageTime = now;
    // ...
});
```

### 4. 输入验证

```javascript
socket.on('send_message', (data) => {
    // 内容验证
    if (!data.content || typeof data.content !== 'string') {
        socket.emit('error', { message: '消息内容不能为空' });
        return;
    }
    
    // 长度限制
    if (data.content.length > 500) {
        socket.emit('error', { message: '消息内容过长（最多500字符）' });
        return;
    }
    
    // 位置验证
    const msgX = typeof data.x === 'number' && isFinite(data.x) ? data.x : currentUser.x;
    const msgY = typeof data.y === 'number' && isFinite(data.y) ? data.y : currentUser.y;
    // ...
});
```

---

## 性能优化

### 1. 数据库优化

#### 批量写入

```javascript
// 使用脏标记 + 定时保存
let dbDirty = false;
let saveTimer = null;
const SAVE_INTERVAL = 2000;

function markDirty() {
    dbDirty = true;
    if (!saveTimer) {
        saveTimer = setTimeout(() => {
            flushSave();
        }, SAVE_INTERVAL);
    }
}
```

#### 位置批量保存

```javascript
const positionDirty = new Set();

// 标记需要保存的位置
socket.on('move', (data) => {
    currentUser.x = data.x;
    currentUser.y = data.y;
    positionDirty.add(currentUser.id);
});

// 每5秒批量保存
setInterval(() => {
    flushPositions();
}, 5000);
```

### 2. 网络优化

#### 屏蔽列表缓存

```javascript
const blockedCache = new Map();

function getBlockedIds(userId) {
    if (blockedCache.has(userId)) return blockedCache.get(userId);
    const ids = db.getBlockedUsers(userId);
    blockedCache.set(userId, ids);
    return ids;
}

function invalidateBlockCache(userId) {
    blockedCache.delete(userId);
    // 清除所有相关缓存
    for (const [id] of onlineUsers) { 
        blockedCache.delete(id); 
    }
}
```

#### 选择性广播

```javascript
function filterUsersForClient(clientUserId) {
    const blockedIds = getBlockedIds(clientUserId);
    return Array.from(onlineUsers.values())
        .filter(u => u.id !== clientUserId && !blockedIds.has(u.id));
}

// 只发送给非屏蔽用户
const blockedSockets = [];
for (const [sid, otherUser] of onlineUsers.entries()) {
    if (getBlockedIds(otherUser.id).has(currentUser.id)) {
        blockedSockets.push(sid);
    }
}

const sendTargets = Array.from(io.sockets.sockets.keys())
    .filter(sid => !blockedSockets.includes(sid));
```

### 3. 前端优化

#### Canvas 渲染优化

```javascript
class Renderer {
    render() {
        // 1. 只渲染视口内的内容
        const visibleBounds = this.getVisibleBounds();
        
        // 2. 批量绘制
        this.ctx.save();
        
        // 3. 使用离屏渲染（如果需要）
        // this.offscreenCtx.drawImage(...);
        
        // 4. 绘制可见消息
        this.messages
            .filter(m => this.isInViewport(m, visibleBounds))
            .forEach(m => this.drawMessage(m));
        
        // 5. 绘制可见用户
        this.onlineUsers
            .filter(u => this.isInViewport(u, visibleBounds))
            .forEach(u => this.drawUser(u));
        
        this.ctx.restore();
    }
}
```

---

## 调试指南

### 1. 服务器调试

#### 启动调试模式

```bash
# 使用 nodemon 自动重启
npm install -g nodemon
nodemon server/index.js

# 或使用 Node.js 调试器
node --inspect server/index.js
```

#### 日志输出

```javascript
// 在关键位置添加日志
console.log('用户加入:', user.nickname, '(ID:', user.id + ')');
console.log('消息发送:', message.content.substring(0, 50));
console.log('位置更新:', userId, '->', x, y);

// 使用 debug 模块
const debug = require('debug')('mechat:server');
debug('connection from %s', socket.id);
```

### 2. 数据库调试

#### 查看数据库内容

```javascript
// 在控制台执行
const db = require('./server/database');

// 查看所有用户
console.log(db.getAllUsersInfo());

// 查看消息
console.log(db.getMessages({ limit: 10 }));

// 查看在线用户
console.log(db.getOnlineUsers());
```

### 3. 前端调试

#### 浏览器控制台

```javascript
// 查看应用状态
console.log(AppState);

// 查看在线用户
console.log(AppState.onlineUsers);

// 测试发送消息
NetworkManager.sendMessage('测试消息');

// 测试移动
NetworkManager.move(100, 200);
```

#### 网络监控

```javascript
// 监控所有 Socket 事件
const originalEmit = socket.emit;
socket.emit = function(...args) {
    console.log('Socket emit:', args);
    return originalEmit.apply(this, args);
};

socket.onAny((eventName, ...args) => {
    console.log('Socket receive:', eventName, args);
});
```

### 4. 常见问题排查

#### 连接问题

```javascript
// 检查连接状态
socket.on('connect_error', (error) => {
    console.error('连接错误:', error);
});

socket.on('disconnect', (reason) => {
    console.log('断开连接:', reason);
});
```

#### 性能问题

```javascript
// 监控帧率
let frameCount = 0;
let lastTime = performance.now();

function checkFPS() {
    frameCount++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
        console.log('FPS:', frameCount);
        frameCount = 0;
        lastTime = now;
    }
    requestAnimationFrame(checkFPS);
}
```

---

## 扩展开发

### 1. 添加新功能

#### 示例：添加表情功能

**后端修改 (server/index.js)**

```javascript
socket.on('send_emoji', (data) => {
    if (!currentUser) return;
    if (db.isMuted(currentUser.id)) return;
    
    const emoji = {
        id: db.generateId(),
        x: data.x,
        y: data.y,
        emoji: data.emoji,
        authorId: currentUser.id,
        timestamp: Date.now()
    };
    
    // 广播给所有用户
    io.emit('new_emoji', emoji);
});
```

**前端修改 (index.html)**

```javascript
// 添加表情选择器
function showEmojiPicker() {
    // 显示表情选择界面
}

// 发送表情
function sendEmoji(emoji) {
    socket.emit('send_emoji', {
        x: AppState.currentUser.x,
        y: AppState.currentUser.y,
        emoji: emoji
    });
}

// 接收表情
socket.on('new_emoji', (data) => {
    // 在画布上显示表情动画
});
```

### 2. 数据库迁移

#### 添加新表

```javascript
// 在 initDatabase 函数中添加
db.run(`
    CREATE TABLE IF NOT EXISTS new_table (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        data TEXT,
        created_at INTEGER
    )
`);

// 添加新列（使用 try-catch 避免重复添加）
try { 
    db.run(`ALTER TABLE users ADD COLUMN new_field TEXT DEFAULT ''`); 
} catch(e) {}
```

---

## 附录

### 代码规范

1. **命名规范**
   - 变量：camelCase
   - 常量：UPPER_SNAKE_CASE
   - 函数：camelCase
   - 类：PascalCase

2. **注释规范**
   ```javascript
   /**
    * 函数描述
    * @param {string} param1 - 参数说明
    * @returns {boolean} 返回值说明
    */
   function example(param1) {
       // 单行注释
       return true;
   }
   ```

3. **错误处理**
   ```javascript
   try {
       // 可能出错的代码
   } catch (error) {
       console.error('操作失败:', error);
       // 适当的错误处理
   }
   ```

### 版本历史

- v1.0.0 - 初始版本
  - 基础聊天功能
  - 用户系统
  - 好友系统
  - 管理员功能
