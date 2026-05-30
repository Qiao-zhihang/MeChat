# MeChat 开发者文档

## 目录

- [架构概览](#架构概览)
- [后端](#后端)
- [前端](#前端)
- [数据流](#数据流)
- [安全机制](#安全机制)
- [性能策略](#性能策略)
- [调试与排错](#调试与排错)

---

## 架构概览

MeChat 采用经典的实时 Web 应用架构：Express 提供 HTTP 静态文件服务和 REST API，Socket.IO 处理所有实时双向通信，sql.js 在内存中运行 SQLite 并定时持久化到磁盘。前端是一个单 HTML 文件，内嵌全部 CSS 和 JavaScript，通过 Canvas 2D 渲染开放世界。

```
┌──────────────────────────────────────────────────────┐
│  浏览器 (index.html)                                 │
│                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Canvas   │  │ Socket.IO    │  │ UI 层         │  │
│  │ 渲染引擎  │  │ 客户端        │  │ 毛玻璃组件    │  │
│  └──────────┘  └──────┬───────┘  └───────────────┘  │
└───────────────────────┼──────────────────────────────┘
                        │ WebSocket
┌───────────────────────┼──────────────────────────────┐
│  Node.js 服务器        │                              │
│                       ▼                              │
│  ┌────────────────────────────────────────────────┐  │
│  │  Express + Socket.IO                           │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │  │
│  │  │ REST API │  │ 事件处理  │  │ 静态文件    │  │  │
│  │  │ (认证)   │  │ (业务)   │  │ (前端资源)  │  │  │
│  │  └──────────┘  └────┬─────┘  └────────────┘  │  │
│  └───────────────────────┼────────────────────────┘  │
│                          ▼                           │
│  ┌────────────────────────────────────────────────┐  │
│  │  database.js (sql.js → SQLite)                 │  │
│  │  内存数据库 + 2秒延迟写盘                       │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 通信分工

| 通道 | 用途 |
|------|------|
| HTTP REST | 仅用于账号注册和登录认证 |
| Socket.IO | 所有实时功能：会话恢复、位置同步、消息收发、好友系统、私信、管理操作 |
| localStorage | 前端本地持久化 userId、sessionToken、用户颜色 |

---

## 后端

### 文件结构

| 文件 | 职责 |
|------|------|
| `server/index.js` | Express 服务器创建、中间件配置、REST 路由、Socket.IO 事件处理、在线状态管理 |
| `server/database.js` | SQLite 初始化与迁移、全部数据 CRUD 操作、定时持久化 |

### 服务器启动流程

```
startServer()
  ├── db.initDatabase()          // 初始化 SQLite，创建/迁移表结构
  ├── 设置站长账号                 // 遍历 SUPER_ADMINS，设为管理员+站长
  ├── 注册 REST 路由              // /api/health, /register, /login, /users 等
  ├── io.on('connection', ...)   // 注册全部 Socket 事件处理器
  ├── setInterval(flushPositions, 5000)  // 每5秒批量写位置到数据库
  ├── setInterval(cleanupInactiveUsers, 3600000)  // 每小时清理不活跃用户
  └── server.listen(PORT)
```

### 在线状态管理

服务器维护四个核心内存数据结构：

```javascript
const onlineUsers    = new Map();  // socket.id → user 对象
const userSocketMap  = new Map();  // userId → socket.id
const blockedCache   = new Map();  // userId → Set<blockedId>
const positionDirty  = new Set();  // 待写盘的 userId 集合
```

**关键设计决策**：

- **单设备登录**：同一 userId 的新连接会自动断开旧连接（`disconnectOldSocket`）
- **屏蔽缓存**：`blockedCache` 避免每次广播都查询数据库，屏蔽/取消屏蔽时全量失效
- **位置批量写盘**：移动事件只更新内存，每 5 秒由 `flushPositions()` 批量写入数据库
- **断连判断**：`isUserOnlineExcluding()` 确保同一用户多标签页时，关闭一个不会广播离开

### Socket.IO 事件分类

**用户生命周期**：`register` → `move` / `send_message` / ... → `disconnect`

| 阶段 | 事件 | 说明 |
|------|------|------|
| 进入 | `register` | 创建或恢复用户，检查封禁状态，发送在线列表和历史消息 |
| 移动 | `move` | 更新内存位置，广播给非屏蔽用户 |
| 通讯 | `send_message` | 验证→节流→存储→选择性广播 |
| 社交 | `send_friend_request` / `accept_friend_request` / `block_user` 等 | 好友和屏蔽操作 |
| 私信 | `send_private_message` / `get_dm_history` | 仅限好友间的一对一消息 |
| 管理 | `admin_mute_user` / `admin_ban_user` / `admin_broadcast` 等 | 需要管理员/站长权限 |
| 离开 | `disconnect` | 保存位置、广播离开、清理映射 |

### 消息广播的屏蔽过滤

发送消息时，服务器需要同时考虑「谁屏蔽了我」和「我屏蔽了谁」：

```javascript
// 1. 找出屏蔽了我的用户（我不应发给他们）
const blockedSockets = [];
for (const [sid, otherUser] of onlineUsers.entries()) {
    if (getBlockedIds(otherUser.id).has(currentUser.id)) {
        blockedSockets.push(sid);
    }
}

// 2. 好友专属消息只发给好友
if (message.friendOnly) {
    sendTargets = onlineUsers 中非屏蔽 + 是好友的 socket
} else {
    sendTargets = 所有非屏蔽的 socket
}
```

### 数据库持久化策略

```
写入操作 → markDirty() → 2秒延迟 → flushSave() → 写入 data/mechat.db
                                    ↑
                          期间如有新写入则重置计时器
```

- `markDirty()`：设置脏标记，启动 2 秒定时器
- `flushSave()`：导出内存数据库为 Buffer，同步写入文件
- `forceSave()`：立即写入（用于初始化和关闭时）
- 位置数据单独处理：`positionDirty` 集合 + 5 秒间隔批量写盘

---

## 前端

### 文件结构

整个前端是一个 `index.html` 文件（约 3900 行），分为三大区域：

| 行范围 | 内容 |
|--------|------|
| 1 ~ 1600 | CSS 样式（设计令牌、组件样式、动画、响应式） |
| 1600 ~ 2300 | HTML 结构（入口界面、Canvas、HUD、面板、对话框） |
| 2300 ~ 3891 | JavaScript（状态管理、认证、Socket 通信、渲染引擎、输入处理） |

### 设计系统

采用 Apple 风格毛玻璃（Glassmorphism）设计语言：

```css
:root {
    --glass-bg:       rgba(255, 255, 255, 0.62);
    --glass-border:   rgba(255, 255, 255, 0.48);
    --primary:        #007aff;        /* iOS 蓝 */
    --accent-red:     #ff3b30;
    --accent-green:   #30d158;
    --radius-xl:      22px;
    --radius-lg:      16px;
    --radius-md:      12px;
}
```

核心视觉效果：
- `backdrop-filter: blur(40px) saturate(180%)` 实现毛玻璃
- SVG `feDisplacementMap` 滤镜实现液态玻璃折射（`LiquidGlass` 模块）
- CSS 动画：`cardEnter`（弹入）、`fadeIn`（淡入）、`dmSlideIn`（滑入）

### JavaScript 模块划分

虽然代码在同一个文件中，但逻辑上分为以下模块：

| 模块 | 行范围 | 职责 |
|------|--------|------|
| `MobileAdapter` | 1607-1898 | 设备检测、触摸事件、移动模式切换 |
| `ResponsiveLayout` | 1902-2075 | 基于 vw/vh/vmin 的动态布局计算 |
| `JoystickController` | 2079-2233 | 虚拟摇杆 Canvas 绘制与触摸输入 |
| `LiquidGlass` | 2240-2293 | SDF 位移贴图生成，液态玻璃滤镜 |
| 状态管理 | 2299-2310 | `state` 全局对象 |
| 认证系统 | 2349-2441 | 登录/注册/游客进入/会话恢复 |
| Socket 通信 | 2441-3320 | 全部 Socket.IO 事件监听与发送 |
| 输入处理 | 3321-3428 | 键盘/鼠标/触摸事件 |
| 渲染引擎 | 3429-3891 | Canvas 游戏循环、网格/消息/用户渲染 |

### 渲染引擎

游戏循环由 `requestAnimationFrame` 驱动：

```
gameLoop(timestamp)
  ├── updatePosition()     // 根据按键/摇杆计算新位置
  │     ├── 桌面：WASD/方向键，速度 3px/帧
  │     └── 移动：虚拟摇杆归一化向量，速度 3px/帧
  ├── socket.emit('move')  // 双重节流：50ms 时间 + 0.15 距离阈值
  ├── render()             // Canvas 绘制
  │     ├── renderGrid()       // 点阵网格（视差 0.65，点大小随距离衰减）
  │     ├── renderMessages()   // 消息气泡（视口裁剪，最多 100/50 条）
  │     ├── renderOtherUsers() // 其他用户（距离自适应大小，好友光环）
  │     └── renderCurrentUser() // 当前用户（十字准星）
  └── updateCoordsDisplay() // 80ms 节流更新坐标文字
```

**消息气泡渲染细节**：
- 带作者颜色的半透明背景 + 阴影
- 管理员消息：橙色背景 + 左侧橙色边框
- 高光渐变叠加模拟玻璃质感
- 长消息（>50 字符或 >2 行）截断显示，提示「点击查看全文」
- `msgMeasureCache` 缓存气泡尺寸避免重复计算

**用户渲染细节**：
- 距离自适应大小（近大远小）
- 好友：外圈光环 + 名称后加星号
- 管理员/站长：名称后加标签
- 头像：优先显示上传图片（圆形裁切），否则显示颜色圆圈 + 首字母
- `userAvatars` Map 缓存已加载的头像 Image 对象

### 移动端适配

三个专用模块协作完成移动端支持：

1. **MobileAdapter**：检测设备类型，启用移动模式，绑定触摸事件
2. **ResponsiveLayout**：基于视口百分比动态计算所有 UI 元素位置和尺寸
3. **JoystickController**：Canvas 绘制虚拟摇杆，输出归一化方向向量（含 0.15 死区）

响应式断点：`@media (max-width: 768px)`，面板全屏化、按钮紧凑化。

### 会话持久化

前端通过 localStorage 存储三个值，实现关闭浏览器后自动恢复会话：

```javascript
localStorage.setItem('mechat_user_id', userId);
localStorage.setItem('mechat_session_token', sessionToken);
localStorage.setItem('mechat_user_color', color);
```

重新打开页面时，`register` 事件携带 `userId` 和 `sessionToken`，服务器识别为老用户并恢复数据。

---

## 数据流

### 用户进入

```
浏览器打开页面
  → 读取 localStorage 中的 userId
  → socket.connect()
  → socket.emit('register', { userId, nickname, avatar, color })
  → 服务器：查找/创建用户 → 检查封禁 → 返回 { user, onlineUsers, recentMessages }
  → 前端：初始化 state → 开始渲染循环
```

### 发送世界消息

```
用户按 Enter → 输入内容 → 按 Enter 发送
  → socket.emit('send_message', { content, x, y, friendOnly })
  → 服务器：
      1. 检查登录状态
      2. 检查禁言状态
      3. 验证内容（非空、≤500字符）
      4. 频率限制（1秒间隔）
      5. 写入数据库
      6. 计算屏蔽列表，选择性广播
  → 其他客户端收到 'new_message' → 添加到 messages 数组 → Canvas 渲染
```

### 位置同步

```
用户按住 WASD
  → 每帧计算新位置
  → 双重节流（50ms + 0.15距离）
  → socket.emit('move', { x, y })
  → 服务器：更新内存 → 广播 'user_moved' 给非屏蔽用户
  → 其他客户端：更新 otherUsers 中对应位置 → Canvas 重绘
  → 服务器每5秒：flushPositions() 批量写数据库
```

---

## 安全机制

### 密码存储

```javascript
// SHA256 + 应用特定前缀盐值
crypto.createHash('sha256').update('mechat_salt_' + password).digest('hex');
```

> ⚠️ **安全提示**：当前实现使用 SHA256 + 固定盐值。生产环境建议使用专业的密码哈希库如 bcrypt 或 Argon2。

### 权限层级

| 角色 | 权限 |
|------|------|
| 普通用户 | 发消息、加好友、私信 |
| 管理员 (is_admin) | 禁言/踢出/封禁/解封、删除消息（需密钥）、广播、清空消息、清理数据 |
| 站长 (is_super_admin) | 管理员全部权限 + 任命/撤销管理员、编辑用户信息 |

### 输入验证

- 消息内容：非空检查、500 字符上限、类型检查
- 位置数据：`typeof === 'number'` + `isFinite()` 检查
- 用户名：≥2 字符；密码：≥4 字符
- 管理员密钥：删除消息等敏感操作需验证 `ADMIN_KEY`

### 频率限制

- 消息发送：1 秒最小间隔（`socket.lastMessageTime`）
- 位置同步：50ms 时间节流 + 0.15 距离阈值

---

## 性能策略

### 数据库层

| 策略 | 实现 |
|------|------|
| 内存数据库 | sql.js 全部操作在内存中，避免磁盘 I/O |
| 延迟写盘 | 脏标记 + 2 秒防抖，合并短时间内的多次写入 |
| 位置批量写 | 独立的 5 秒间隔，避免频繁的位置更新触发写盘 |
| 自动清理 | 每小时清理不活跃用户和过期数据 |

### 网络层

| 策略 | 实现 |
|------|------|
| 屏蔽缓存 | `blockedCache` Map，避免每次广播查库 |
| 选择性广播 | 计算非屏蔽 socket 列表，只发给目标用户 |
| 位置节流 | 客户端双重节流（50ms + 0.15 距离） |
| 单设备登录 | 新连接自动踢旧连接，避免重复资源消耗 |

### 渲染层

| 策略 | 实现 |
|------|------|
| 视口裁剪 | 只渲染可见区域内的消息和用户 |
| 消息数量限制 | PC 最多 100 条、移动端 50 条 |
| 总消息上限 | 5000 条，超出后删除最旧的 |
| 头像缓存 | `userAvatars` Map 避免重复加载 Image |
| 气泡尺寸缓存 | `msgMeasureCache` Map 避免重复测量文本 |
| 坐标显示节流 | 80ms 间隔更新 DOM 文字 |

---

## 调试与排错

### 启动调试

```bash
# 使用 Node.js 内置调试器
node --inspect server/index.js

# 使用 nodemon 自动重启（开发推荐）
npx nodemon server/index.js
```

### 常见问题

**问题：用户反馈看不到其他人的消息**

排查步骤：
1. 检查是否误屏蔽了对方 → 查看数据库 `blocks` 表
2. 检查消息是否为好友专属 → `friendOnly` 字段
3. 检查 Socket 连接是否正常 → 浏览器开发者工具 Network → WS 标签页

**问题：数据库文件损坏**

sql.js 在启动时从文件加载数据库，如果文件损坏会导致初始化失败。解决方法：
1. 备份 `data/mechat.db`
2. 删除 `data/mechat.db`，重启服务器会自动创建新数据库

**问题：移动端无法移动**

1. 检查 `MobileAdapter` 是否正确检测到移动设备
2. 在浏览器控制台执行 `state.movementDisabled` 检查移动是否被禁用
3. 检查虚拟摇杆 Canvas 是否被其他元素遮挡

### 前端调试技巧

```javascript
// 浏览器控制台查看应用状态
console.log(state);              // 当前用户和视口状态
console.log(state.otherUsers);   // 在线用户列表
console.log(state.messages.length); // 消息数量

// 监控全部 Socket 事件
socket.onAny((eventName, ...args) => {
    console.log('[Socket]', eventName, args);
});
```

### 后端调试技巧

```javascript
// 在 server/index.js 中添加日志
socket.on('send_message', (data) => {
    console.log('[MSG]', currentUser.nickname, ':', data.content?.substring(0, 50));
});

// 查看数据库内容（在服务器运行时）
// 连接后执行
const db = require('./database');
console.log(db.getAllUsersInfo());
console.log(db.getMessages({ limit: 5 }));
```
