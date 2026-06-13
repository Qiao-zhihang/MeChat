# MeChat 开发者文档

## 目录

- [架构概览](#架构概览)
- [后端架构](#后端架构)
- [前端架构](#前端架构)
- [核心数据流](#核心数据流)
- [安全机制](#安全机制)
- [性能策略](#性能策略)
- [调试与排错](#调试与排错)

---

## 架构概览

MeChat 采用经典的实时 Web 应用架构：Express 提供 HTTP 静态文件服务和 REST API，Socket.IO 处理所有实时双向通信，sql.js 在内存中运行 SQLite 并定时持久化到磁盘。前端是单 HTML 文件，内嵌全部 CSS 和 JavaScript，通过 Canvas 2D 渲染开放世界。

```
┌──────────────────────────────────────────────────────────────┐
│  浏览器 (index.html — 单文件 SPA)                             │
│                                                              │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ Canvas     │  │ Socket.IO    │  │ UI 层              │   │
│  │ 渲染引擎    │  │ Client       │  │ 毛玻璃组件 / 面板   │   │
│  └────────────┘  └──────┬───────┘  └────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │ WebSocket (Socket.IO)
┌─────────────────────────┼───────────────────────────────────┐
│  Node.js Server          ▼                                   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Express + Socket.IO                                 │    │
│  │  ┌──────────┐  ┌────────────┐  ┌────────────────┐   │    │
│  │  │ REST API │  │ Event       │  │ Static Files   │   │    │
│  │  │ (认证)    │  │ Handlers    │  │ (public/)      │   │    │
│  │  └──────────┘  └─────┬──────┘  └────────────────┘   │    │
│  └──────────────────────┼──────────────────────────────┘    │
│                           ▼                                   │
│  ┌────────────────────────────────────────────────────┐     │
│  │  database.js (sql.js → SQLite)                     │     │
│  │  内存数据库 + 脏标记延迟写盘 (2s) + 位置批量写 (5s) │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

### 通信分工

| 通道 | 用途 | 说明 |
|------|------|------|
| HTTP REST | 注册、登录、健康检查、用户/消息查询 | 仅认证和只读接口 |
| Socket.IO | 所有实时业务逻辑 | 会话恢复、位置同步、消息收发、好友系统、管理操作 |
| localStorage | 前端本地持久化 | userId、sessionToken、userColor |

---

## 后端架构

### 文件职责

| 文件 | 行数 | 职责 |
|------|:----:|------|
| `server/index.js` | ~695 | Express 创建、中间件、REST 路由、Socket.IO 全部事件处理、在线状态管理 |
| `server/database.js` | ~715 | SQLite 初始化/迁移、全部 CRUD、密码哈希（scrypt）、定时持久化 |

### 服务器启动流程

```
startServer()
  ├── db.initDatabase()                // 初始化 SQLite，建表/迁移/索引
  ├── 校验 ADMIN_KEY                    // 未设置则 process.exit(1)
  ├── 设置 SUPER_ADMINS                 // 遍历站长名单，设为管理员+超级管理员
  ├── 注册 REST 路由                    // /api/health, register, login, users...
  ├── io.on('connection', ...)          // 注册全部 Socket 事件处理器
  ├── setInterval(cleanupInactiveUsers) // 每小时清理不活跃数据
  ├── setInterval(flushPositions)       // 每5秒批量写位置到数据库
  └── server.listen(PORT)
```

### 核心内存数据结构

服务器维护以下内存中的数据结构：

```javascript
const onlineUsers      = new Map();   // socket.id → user 对象（在线用户）
const userSocketMap    = new Map();   // userId → socket.id（反向映射）
const blockedCache     = new Map();   // userId → Set<blockedId>（屏蔽缓存）
const positionDirty    = new Set();   // 待写盘的 userId 集合
const sessionTokens    = new Map();   // userId → sessionToken（会话令牌）
const recentDmCache    = new Map();   // 去重键→时间戳（私信防重复）
```

### 关键设计决策

**单设备登录**
- 同一 userId 的新连接自动断开旧连接（`disconnectOldSocket`）
- 防止同一账号多设备资源重复消耗

**屏蔽过滤优化**
- `blockedCache` 缓存每个用户的屏蔽列表，避免每次广播都查库
- 屏蔽/取消屏蔽时调用 `invalidateBlockCache()` 全量失效
- 发消息时同时检查「谁屏蔽了我」和「我屏蔽了谁」两个方向

**位置批量写盘**
- 移动事件 `move` 只更新内存 Map，不立即写库
- 每 5 秒由 `flushPositions()` 批量将脏位置写入数据库
- 断开连接时立即保存当前位置

**断连判断**
- `isUserOnlineExcluding()` 确保同用户多标签页时，关闭一个不触发离开广播

### Socket.IO 事件分类

完整的用户生命周期：

```
register → move / send_message / ... → disconnect
```

| 类别 | 事件 | 说明 |
|------|------|------|
| **进入** | `register` | 创建或恢复用户，检查封禁状态，返回在线列表和历史消息 |
| **移动** | `move` | 更新内存位置，选择性广播给非屏蔽用户 |
| **通讯** | `send_message` | 登录校验→禁言检查→内容验证→节流→存储→屏蔽过滤→广播 |
| **社交** | `send_friend_request` / `accept_friend_request` / `block_user` 等 | 好友申请/接受/拒绝/删除、屏蔽/取消屏蔽 |
| **私信** | `send_private_message` / `get_dm_history` / `clear_dm_history` | 仅限好友间的一对一消息 |
| **资料** | `update_profile` | 修改昵称/头像/颜色/签名，白名单字段校验 |
| **管理** | `admin_mute_user` / `admin_ban_user` / `admin_broadcast` 等 | 需对应角色权限 |
| **离开** | `disconnect` | 保存位置、选择性广播离开、清理所有映射 |

### 消息广播的屏蔽过滤算法

发送消息时需要双向计算接收者列表：

```
1. 找出「屏蔽了我的用户」→ 我不应发给他们（blockedSockets）
2. 判断是否好友专属消息：
   - 是 → 只发给 非屏蔽 ∩ 是好友 的 socket
   - 否 → 发给所有非屏蔽的 socket
3. 排除发送者自身 socket
```

### 数据库持久化策略

```
写入操作 → markDirty() → [2秒防抖] → flushSave() → 导出 Buffer → 写入 data/mechat.db
                                    ↑
                          期间新写入则重置计时器（合并多次写入）

特殊路径：
- forceSave() → 立即写入（初始化、关闭时使用）
- 位置数据 → 独立的 positionDirty Set + 5秒间隔 flushPositions()
```

### 密码哈希方案

```javascript
// 当前方案：scrypt + 随机盐值（每用户独立）
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return salt + ':' + hash;  // 存储格式：盐:哈希
}

// 验证时支持旧版回退（SHA256 + 固定盐）
function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) {
        // 兼容旧版 SHA256 用户
        return crypto.createHash('sha256').update('mechat_salt_' + password).digest('hex') === stored;
    }
    return crypto.scryptSync(password, salt, 64).toString('hex') === hash;
}
```

---

## 前端架构

### 文件结构

整个前端是一个 `index.html` 单文件应用，逻辑上分为三大区域：

| 区域 | 行范围（约） | 内容 |
|------|:-----------:|------|
| CSS 样式 | 1 ~ 1600 | 设计令牌、毛玻璃组件、动画、响应式断点 |
| HTML 结构 | 1600 ~ 2300 | 入口界面、Canvas 画布、HUD、面板、对话框 |
| JavaScript | 2300 ~ 3900 | 状态管理、认证、Socket 通信、渲染引擎、输入处理 |

### 设计系统

采用 Apple 风格毛玻璃（Glassmorphism）设计语言：

```css
:root {
    --glass-bg:       rgba(255, 255, 255, 0.62);
    --glass-border:   rgba(255, 255, 255, 0.48);
    --primary:        #007aff;        /* iOS 蓝 */
    --accent-red:     #ff3b30;        /* 危险操作 */
    --accent-green:   #30d158;        /* 成功确认 */
    --radius-xl:      22px;
    --radius-lg:      16px;
    --radius-md:      12px;
}
```

**核心视觉效果：**
- `backdrop-filter: blur(40px) saturate(180%)` 实现毛玻璃背景
- SVG `feDisplacementMap` 滤镜实现液态玻璃折射效果（`LiquidGlass` 模块）
- CSS 动画：`cardEnter`（弹入）、`fadeIn`（淡入）、`dmSlideIn`（滑入）

### JavaScript 模块划分

虽然代码在同一个文件中，但逻辑上分为以下模块：

| 模块 | 职责 |
|------|------|
| `MobileAdapter` | 设备检测、触摸事件绑定、移动模式切换 |
| `ResponsiveLayout` | 基于 vw/vh/vmin 的动态布局计算 |
| `JoystickController` | 虚拟摇杆 Canvas 绘制与触摸输入（含 0.15 死区） |
| `LiquidGlass` | SDF 位移贴图生成，液态玻璃滤镜效果 |
| `state` | 全局状态对象（当前用户、视口、其他用户、消息等） |
| 认证系统 | 登录/注册/游客进入/会话恢复 |
| Socket 通信层 | 全部 Socket.IO 事件监听与发送封装 |
| 输入处理器 | 键盘/鼠标/触摸事件分发 |
| 渲染引擎 | Canvas 游戏循环、网格/消息/用户绘制 |

### 渲染引擎

游戏循环由 `requestAnimationFrame` 驱动，支持 Page Visibility API（标签页隐藏时暂停渲染以节省资源）：

```
gameLoop(timestamp)
  ├── updatePosition()        // 根据按键/摇杆计算新位置
  │     ├── 桌面：WASD/方向键，速度 3px/帧
  │     └── 移动：虚拟摇杆归一化向量，速度 3px/帧
  ├── socket.emit('move')     // 双重节流：50ms 时间 + 0.15 距离阈值
  ├── render()               // Canvas 绘制
  │     ├── renderGrid()         // 点阵网格（视差 0.65，点大小随距离衰减）
  │     ├── renderMessages()     // 消息气泡（视口裁剪，PC最多100条/移动50条）
  │     ├── renderOtherUsers()   // 其他用户（距离自适应大小，好友光环）
  │     └── renderCurrentUser()  // 当前用户（十字准星）
  └── updateCoordsDisplay()    // 80ms 节流更新坐标文字
```

**消息气泡渲染细节：**
- 带作者主题色的半透明背景 + 投影阴影
- 管理员消息：橙色背景 + 左侧橙色边框标识
- 高光渐变叠加模拟玻璃质感
- 长消息（>50 字符或 >2 行）截断显示，提示点击查看全文
- `msgMeasureCache` 缓存气泡尺寸避免重复文本测量

**用户渲染细节：**
- 距离自适应大小（近大远小）
- 好友：外圈光环 + 名称后星号标记
- 管理员/站长：名称后角色标签
- 头像优先显示上传图片（圆形裁切），否则显示颜色圆圈 + 首字母
- `userAvatars` Map 缓存已加载的头像 Image 对象

### 移动端适配

三个专用模块协作完成移动端支持：

1. **MobileAdapter**：检测设备类型，启用移动模式，绑定触摸事件
2. **ResponsiveLayout**：基于视口百分比动态计算所有 UI 元素位置和尺寸
3. **JoystickController**：Canvas 绘制虚拟摇杆，输出归一化方向向量（含 0.15 死区）

响应式断点：`@media (max-width: 768px)`，面板全屏化、按钮紧凑化。

### 会话持久化

前端通过 localStorage 存储三个关键值，实现关闭浏览器后自动恢复会话：

```javascript
localStorage.setItem('mechat_user_id', userId);        // 用户唯一 ID
localStorage.setItem('mechat_session_token', token);    // 服务端签发的会话令牌
localStorage.setItem('mechat_user_color', color);       // 用户主题色
```

重新打开页面时，`register` 事件携带 `userId` 和 `sessionToken`，服务端验证令牌匹配后识别为老用户并恢复完整数据。

---

## 核心数据流

### 用户进入世界

```
浏览器打开 MeChat 页面
  → 读取 localStorage 中的 userId 和 sessionToken
  → 建立 Socket.IO 连接
  → emit('register', { userId, sessionToken, nickname, avatar, color })
  → 服务端：
      ├─ 新用户 → 创建记录 → 分配随机名/色 → 签发 sessionToken
      ├─ 老用户（令牌匹配）→ 恢复数据 → 更新可变字段
      └─ 老用户（令牌失效）→ 清除旧令牌 → 作为新用户处理
  → 检查封禁状态 → 封禁则断开连接
  → 返回 { user, isAdmin, isSuperAdmin, onlineUsers, recentMessages }
  → 前端初始化 state → 启动渲染循环
  → 广播 user_joined 或 user_reconnected
```

### 发送世界消息

```
用户按 Enter 打开输入框 → 输入内容 → 按 Enter 发送
  → emit('send_message', { content, x, y, friendOnly })
  → 服务端逐级校验：
      1. 检查登录状态
      2. 检查禁言状态
      3. 内容非空 + ≤500字符
      4. 频率限制（距上次 ≥1秒）
  → 写入 messages 表
  → 计算屏蔽列表（双向）+ 好友过滤
  → 选择性广播 'new_message' 给目标客户端
  → 各客户端收到后添加到 messages 数组 → 下帧 Canvas 重绘
```

### 位置同步

```
用户按住 WASD/拖动摇杆
  → 每帧 updatePosition() 计算新坐标
  → 双重节流判定（50ms 时间窗口 + 0.15 距离阈值）
  → emit('move', { x, y })
  → 服务端：数值有效性检查（type + isFinite + 边界 ±100000）
  → 更新 onlineUsers 内存
  → 加入 positionDirty 待写集合
  → 广播 'user_moved' 给非屏蔽的其余客户端
  → 其余客户端更新 otherUsers 中对应用户位置 → Canvas 重绘
  → （每5秒）flushPositions() 批量写数据库
```

### 好友私信流程

```
A 点击 B 头像 → 「添加好友」
  → A: emit('send_friend_request', { targetId: B.id })
  → 服务端：检查非自己、非已好友、无待处理申请、无反向申请
  → B 收到 'friend_request' 通知
  → B 在面板中点击「接受」
  → B: emit('accept_friend_request', { fromId: A.id })
  → 服务端：建立双向 friends 记录
  → A 收到 'friend_accepted'，B 收到 friend_result
  → 双方刷新 friends_list

A 进入与 B 的私信：
  → A: emit('send_private_message', { targetId: B.id, content })
  → 服务端：检查好友关系 + 禁言 + 内容≤2000字 + 2秒去重
  → 写入 private_messages 表
  → B 在线则实时推送 'private_message'
  → A 收到 'private_message_sent' 确认
```

---

## 安全机制

### 密码存储

| 方案 | 算法 | 盐值 | 安全等级 |
|------|------|------|----------|
| **当前（推荐）** | scrypt | 每用户随机 16 字节 | 高（抗 GPU/ASIC） |
| **旧版（兼容）** | SHA256 | 固定字符串 `mechat_salt_` | 低（仅作兼容保留） |

> 生产环境建议逐步迁移所有旧用户到 scrypt。

### 权限层级

| 角色 | 标识字段 | 权限 |
|------|---------|------|
| 普通用户 | is_admin=0, is_super_admin=0 | 发消息、加好友、私信、改资料 |
| 管理员 | is_admin=1 | 禁言/踢出/封禁/解封、删消息(需密钥)、广播、清消息、清理数据、踢游客 |
| 站长 | is_super_admin=1 | 以上全部 + 任命/撤销管理员、编辑任意用户信息 |

### 输入验证规则

| 数据类型 | 验证规则 |
|----------|----------|
| 消息内容 | 非空、trim 后长度 >0、≤500 字符 |
| 私信内容 | 非空、≤2000 字符 |
| 昵称 | ≤20 字符 |
| 个性签名 | ≤200 字符 |
| 用户名 | ≥2 字符 |
| 密码 | ≥4 字符 |
| 位置坐标 | `typeof number` + `isFinite()` + 范围 [-100000, 100000] |
| 用户 ID | 必须以 `id_` 前缀开头 |
| 管理员密钥 | 必须严格等于环境变量 `ADMIN_KEY` |

### 频率限制

| 操作 | 限制 |
|------|------|
| 世界消息发送 | 最小间隔 1 秒（`socket.lastMessageTime`） |
| 私信发送 | 2 秒内相同内容去重（`recentDmCache`） |
| 位置同步 | 客户端双重节流：50ms 时间 + 0.15 距离阈值 |

### HTTP 安全头

```javascript
res.setHeader('X-Content-Type-Options', 'nosniff');  // 防 MIME 嗅探
res.setHeader('X-Frame-Options', 'DENY');            // 防点击劫持
res.setHeader('X-XSS-Protection', '1; mode=block');  // 防 XSS
```

---

## 性能策略

### 数据库层

| 策略 | 实现 | 效果 |
|------|------|------|
| 内存数据库 | sql.js 全部操作在内存中执行 | 避免磁盘 I/O 延迟 |
| 延迟写盘 | 脏标记 + 2 秒防抖定时器 | 合并短时间多次写入为一次 I/O |
| 位置独立批写 | positionDirty Set + 5 秒间隔 | 避免高频移动触发频繁写盘 |
| 性能索引 | 9 个索引覆盖高频查询路径 | 消息查询、好友列表、屏蔽检查等加速 |
| 自动清理 | 每小时 cleanupInactiveUsers | 清理过期消息/请求/不活跃用户 |

**已建立的索引：**

| 索引名 | 表 | 字段 | 用途 |
|--------|-----|------|------|
| idx_messages_author_id | messages | author_id | 按用户查消息 |
| idx_messages_timestamp | messages | timestamp | 消息时间排序 |
| idx_messages_position | messages | x, y | 按坐标范围查消息 |
| idx_private_messages_pair | private_messages | from_id, to_id | 两人私信查询 |
| idx_private_messages_timestamp | private_messages | timestamp | 私信时间排序 |
| idx_friends_user | friends | user_id | 查询好友列表 |
| idx_users_active | users | last_active | 查询活跃用户 |
| idx_blocks_user | blocks | user_id | 查询屏蔽列表 |

### 网络层

| 策略 | 实现 | 效果 |
|------|------|------|
| 屏蔽缓存 | blockedCache Map | 避免每次广播遍历 blocks 表 |
| 选择性广播 | 计算目标 socket 列表 | 只发给需要看到的用户 |
| 位置节流 | 客户端双重节流 | 减少 90%+ 的无效移动包 |
| 单设备登录 | 新连接踢旧连接 | 避免重复资源占用 |
| 私信去重 | recentDmCache 5秒窗口 | 防止网络重试导致重复消息 |

### 渲染层

| 策略 | 实现 | 效果 |
|------|------|------|
| 视口裁剪 | 只渲染可见区域内的元素 | 减少不必要的 draw 调用 |
| 消息数量上限 | PC 100 条 / 移动端 50 条 | 控制 DOM/Canvas 绘制压力 |
| 总消息上限 | 5000 条，FIFO 淘汰最旧 | 防止内存无限增长 |
| 头像缓存 | userAvatars Map<Image> | 避免重复加载和解码图片 |
| 气泡尺寸缓存 | msgMeasureCache | 避免重复 canvas.measureText |
| 坐标显示节流 | 80ms 间隔更新 DOM | 减少 DOM 回流 |
| Page Visibility | 标签页隐藏暂停 rAF | 节省 CPU/电池 |
| escapeHtml 优化 | 正则替换替代 DOM 方式 | 减少 GC 压力 |
| 消息缓存清理 | 删除消息时同步清缓存 | 防止缓存泄漏 |

---

## 调试与排错

### 启动调试

```bash
# 使用 Node.js 内置调试器
node --inspect server/index.js

# 使用 nodemon 自动重启（开发推荐）
npx nodemon server/index.js
```

### 常见问题排查

#### 用户看不到其他人的消息

1. 检查是否误屏蔽了对方 → 查看 `blocks` 表
2. 检查消息是否为好友专属（`friendOnly=true`）→ 非好友不可见
3. 检查 Socket 连接状态 → 浏览器 DevTools → Network → WS 标签页

#### 数据库文件损坏

sql.js 启动时从文件加载数据库，损坏会导致初始化失败：

1. 备份 `data/mechat.db`
2. 删除 `data/mechat.db`
3. 重启服务器，自动创建全新空数据库

#### 移动端无法移动

1. 检查 `MobileAdapter` 是否正确检测到移动设备类型
2. 控制台执行 `state.movementDisabled` 查看移动是否被禁用
3. 检查虚拟摇杆 Canvas 是否被其他 UI 元素遮挡

#### 服务器启动失败（ADMIN_KEY 未设置）

```
❌ 未设置环境变量 ADMIN_KEY，请配置 .env 文件后重启服务器
```

确保 `.env` 文件存在且包含有效的 `ADMIN_KEY` 值。

### 前端调试技巧

```javascript
// 浏览器控制台查看完整应用状态
console.log(state);                  // 当前用户、视口、其他用户等
console.log(state.otherUsers);       // 在线用户列表及位置
console.log(state.messages.length);  // 当前加载的消息数量

// 监控所有 Socket 事件（开发调试用）
socket.onAny((eventName, ...args) => {
    console.log('[Socket]', eventName, args);
});
```

### 后端调试技巧

```javascript
// 在 server/index.js 中添加消息日志
socket.on('send_message', (data) => {
    console.log('[MSG]', currentUser.nickname, ':', data.content?.substring(0, 50));
});

// 在运行中的服务器查看数据（通过 Node REPL 或临时路由）
const db = require('./database');
console.log(db.getAllUsersInfo());           // 全部用户
console.log(db.getMessages({ limit: 5 }));    // 最近消息
```

### 关闭服务器时的数据安全

服务器捕获 `SIGINT` 信号（Ctrl+C），执行有序关闭：

```
SIGINT 触发
  → flushPositions()     // 保存所有未写的位置数据
  → db.closeDatabase()   // 最后一次 flushSave() + 关闭 DB 连接
  → server.close()       // 停止接受新连接
  → process.exit(0)      // 退出进程
```
