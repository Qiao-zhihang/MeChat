# MeChat API 文档

## 目录
1. [REST API](#rest-api)
2. [Socket.IO 事件](#socketio-事件)
3. [数据类型](#数据类型)
4. [错误处理](#错误处理)
5. [示例代码](#示例代码)

---

## REST API

### 基础信息

- **基础 URL**: `http://localhost:3000/api`
- **Content-Type**: `application/json`

### 端点列表

#### 1. 健康检查

```http
GET /api/health
```

**响应**:
```json
{
    "status": "ok",
    "timestamp": 1704067200000
}
```

#### 2. 用户注册

```http
POST /api/register
```

**请求体**:
```json
{
    "username": "string",      // 必填，至少2个字符
    "password": "string",      // 必填，至少4个字符
    "nickname": "string",      // 可选，默认使用用户名
    "color": "#hexcolor"       // 可选，默认随机颜色
}
```

**成功响应**:
```json
{
    "success": true,
    "id": "id_1704067200000_abc123",
    "user": {
        "id": "id_1704067200000_abc123",
        "username": "testuser",
        "nickname": "测试用户",
        "avatar": null,
        "x": 0,
        "y": 0,
        "color": "#6366f1",
        "bio": ""
    }
}
```

**错误响应**:
```json
{
    "success": false,
    "error": "用户名已存在"
}
```

#### 3. 用户登录

```http
POST /api/login
```

**请求体**:
```json
{
    "username": "string",
    "password": "string"
}
```

**成功响应**:
```json
{
    "success": true,
    "user": {
        "id": "id_1704067200000_abc123",
        "username": "testuser",
        "nickname": "测试用户",
        "avatar": null,
        "x": 100,
        "y": 200,
        "color": "#6366f1",
        "bio": "",
        "is_admin": 0,
        "is_super_admin": 0
    }
}
```

**错误响应**:
```json
{
    "success": false,
    "error": "密码错误"
}
```

#### 4. 获取在线用户

```http
GET /api/users
```

**响应**:
```json
{
    "users": [
        {
            "id": "id_1704067200000_abc123",
            "username": "user1",
            "nickname": "用户1",
            "avatar": null,
            "x": 100,
            "y": 200,
            "color": "#6366f1",
            "bio": "个人简介"
        }
    ],
    "count": 1
}
```

#### 5. 获取用户信息

```http
GET /api/user/:id
```

**参数**:
- `id` - 用户ID

**响应**:
```json
{
    "id": "id_1704067200000_abc123",
    "username": "user1",
    "nickname": "用户1",
    "avatar": null,
    "x": 100,
    "y": 200,
    "color": "#6366f1",
    "bio": "个人简介",
    "last_active": 1704067200000,
    "created_at": 1704067200000
}
```

#### 6. 获取消息

```http
GET /api/messages?limit=100&x=0&y=0&radius=2000
```

**查询参数**:
- `limit` - 返回消息数量（默认100，最大500）
- `x` - 中心X坐标（可选）
- `y` - 中心Y坐标（可选）
- `radius` - 搜索半径（默认2000）

**响应**:
```json
{
    "messages": [
        {
            "id": "id_1704067200000_msg123",
            "userId": "id_1704067200000_abc123",
            "x": 100,
            "y": 200,
            "content": "消息内容",
            "author": "用户1",
            "authorId": "id_1704067200000_abc123",
            "authorColor": "#6366f1",
            "authorIsAdmin": 0,
            "timestamp": 1704067200000
        }
    ],
    "count": 1
}
```

#### 7. 清空消息

```http
POST /api/clear-messages
```

**响应**:
```json
{
    "success": true,
    "message": "已删除 100 条消息"
}
```

---

## Socket.IO 事件

### 连接

```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('Connected:', socket.id);
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
});
```

### 客户端 → 服务器

#### 1. 注册用户

```javascript
socket.emit('register', {
    userId: 'id_1704067200000_abc123',  // 可选，已有用户ID
    nickname: '游客123',                  // 可选，默认随机名称
    avatar: 'data:image/png;base64,...',  // 可选，头像数据
    color: '#6366f1'                      // 可选，默认随机颜色
});
```

**响应事件**: `registered`

#### 2. 更新资料

```javascript
socket.emit('update_profile', {
    nickname: '新昵称',
    avatar: 'data:image/png;base64,...',
    color: '#ff0000',
    bio: '新的个人简介'
});
```

**响应事件**: `profile_updated`

#### 3. 移动位置

```javascript
socket.emit('move', {
    x: 150.5,
    y: 200.5
});
```

**广播事件**: `user_moved`

#### 4. 发送消息

```javascript
socket.emit('send_message', {
    content: '消息内容',
    x: 150,           // 可选，默认当前位置
    y: 200,           // 可选，默认当前位置
    friendOnly: false // 可选，仅好友可见
});
```

**限制**:
- 内容长度：1-500字符
- 发送频率：最小间隔1秒

**广播事件**: `new_message`

#### 5. 发送私信

```javascript
socket.emit('send_private_message', {
    targetId: 'id_1704067200000_def456',
    content: '私信内容'
});
```

**限制**:
- 只能给好友发送私信
- 禁言用户无法发送

**响应事件**: `private_message_sent`

#### 6. 好友请求

**发送请求**:
```javascript
socket.emit('send_friend_request', {
    targetId: 'id_1704067200000_def456'
});
```

**接受请求**:
```javascript
socket.emit('accept_friend_request', {
    fromId: 'id_1704067200000_def456'
});
```

**拒绝请求**:
```javascript
socket.emit('reject_friend_request', {
    fromId: 'id_1704067200000_def456'
});
```

**删除好友**:
```javascript
socket.emit('remove_friend', {
    targetId: 'id_1704067200000_def456'
});
```

**获取好友列表**:
```javascript
socket.emit('get_friends');
```

**响应事件**: `friends_list`

**获取待处理请求**:
```javascript
socket.emit('get_pending_requests');
```

**响应事件**: `pending_requests`

#### 7. 屏蔽用户

**屏蔽**:
```javascript
socket.emit('block_user', {
    targetId: 'id_1704067200000_def456'
});
```

**取消屏蔽**:
```javascript
socket.emit('unblock_user', {
    targetId: 'id_1704067200000_def456'
});
```

#### 8. 私信历史

**获取历史**:
```javascript
socket.emit('get_dm_history', {
    targetId: 'id_1704067200000_def456'
});
```

**响应事件**: `dm_history`

**清空历史**:
```javascript
socket.emit('clear_dm_history', {
    targetId: 'id_1704067200000_def456'
});
```

**响应事件**: `dm_cleared`

### 管理员事件

#### 1. 删除消息

```javascript
socket.emit('admin_delete_message', {
    key: 'ADMIN_SECRET_KEY',
    messageId: 'id_1704067200000_msg123'
});
```

**广播事件**: `message_deleted`

#### 2. 禁言用户

```javascript
socket.emit('admin_mute_user', {
    targetId: 'id_1704067200000_def456',
    reason: '发布不当内容'
});
```

**目标用户事件**: `muted`

#### 3. 解禁用户

```javascript
socket.emit('admin_unmute_user', {
    targetId: 'id_1704067200000_def456'
});
```

**目标用户事件**: `unmuted`

#### 4. 封禁用户

```javascript
socket.emit('admin_ban_user', {
    targetId: 'id_1704067200000_def456',
    reason: '严重违规'
});
```

**目标用户事件**: `banned`

#### 5. 解封用户

```javascript
socket.emit('admin_unban_user', {
    targetId: 'id_1704067200000_def456'
});
```

#### 6. 踢出用户

```javascript
socket.emit('admin_kick_user', {
    targetId: 'id_1704067200000_def456',
    reason: '被管理员踢出'
});
```

**目标用户事件**: `kicked`

#### 7. 系统广播

```javascript
socket.emit('admin_broadcast', {
    content: '系统维护通知：服务器将在10分钟后重启'
});
```

**广播事件**: `system_broadcast`

#### 8. 清空所有消息

```javascript
socket.emit('admin_clear_messages', {
    key: 'ADMIN_SECRET_KEY'
});
```

**广播事件**: `messages_cleared`

#### 9. 清理不活跃用户

```javascript
socket.emit('admin_cleanup', {
    days: 30  // 清理30天未登录的用户
});
```

**响应事件**: `admin_result`

#### 10. 设置管理员

```javascript
socket.emit('admin_set_admin', {
    targetId: 'id_1704067200000_def456'
});
```

**目标用户事件**: `became_admin`

#### 11. 取消管理员

```javascript
socket.emit('admin_unset_admin', {
    targetId: 'id_1704067200000_def456'
});
```

**目标用户事件**: `lost_admin`

#### 12. 获取管理列表

```javascript
socket.emit('admin_get_lists');
```

**响应事件**: `admin_lists`

#### 13. 获取所有用户

```javascript
socket.emit('admin_get_all_users');
```

**响应事件**: `all_users_list`

### 服务器 → 客户端

#### 1. 注册成功

```javascript
socket.on('registered', (data) => {
    console.log(data);
    // {
    //     success: true,
    //     user: { id, nickname, avatar, x, y, color },
    //     isAdmin: false,
    //     isSuperAdmin: false,
    //     onlineUsers: [...],
    //     recentMessages: [...]
    // }
});
```

#### 2. 用户加入

```javascript
socket.on('user_joined', (data) => {
    console.log(data);
    // { user: { id, nickname, avatar, x, y, color } }
});
```

#### 3. 用户离开

```javascript
socket.on('user_left', (data) => {
    console.log(data);
    // { userId: 'id_...', nickname: '用户名' }
});
```

#### 4. 用户移动

```javascript
socket.on('user_moved', (data) => {
    console.log(data);
    // { userId: 'id_...', x: 150, y: 200 }
});
```

#### 5. 新消息

```javascript
socket.on('new_message', (message) => {
    console.log(message);
    // {
    //     id: 'id_...',
    //     x: 100,
    //     y: 200,
    //     content: '消息内容',
    //     author: '用户名',
    //     authorId: 'id_...',
    //     authorColor: '#6366f1',
    //     authorIsAdmin: 0,
    //     friendOnly: false,
    //     timestamp: 1704067200000
    // }
});
```

#### 6. 私信

```javascript
socket.on('private_message', (message) => {
    console.log(message);
    // {
    //     id: 'id_...',
    //     fromId: 'id_...',
    //     fromName: '发送者',
    //     fromAvatar: '...',
    //     fromColor: '#6366f1',
    //     toId: 'id_...',
    //     content: '私信内容',
    //     timestamp: 1704067200000
    // }
});
```

#### 7. 好友请求

```javascript
socket.on('friend_request', (data) => {
    console.log(data);
    // { fromUser: { id, nickname, avatar, color } }
});
```

#### 8. 好友请求被接受

```javascript
socket.on('friend_accepted', (data) => {
    console.log(data);
    // { toUser: { id, nickname, avatar, color } }
});
```

#### 9. 好友列表

```javascript
socket.on('friends_list', (data) => {
    console.log(data);
    // { friends: [{ id, username, nickname, avatar, color, bio, last_active }] }
});
```

#### 10. 待处理请求

```javascript
socket.on('pending_requests', (data) => {
    console.log(data);
    // { requests: [{ id, username, nickname, avatar, color, requestId }] }
});
```

#### 11. 私信历史

```javascript
socket.on('dm_history', (data) => {
    console.log(data);
    // {
    //     targetId: 'id_...',
    //     messages: [{ id, from_id, to_id, content, from_name, from_avatar, from_color, timestamp }]
    // }
});
```

#### 12. 资料更新

```javascript
socket.on('profile_updated', (data) => {
    console.log(data);
    // { user: { ... } } 或 { field: 'nickname', value: '新昵称' }
});
```

#### 13. 系统广播

```javascript
socket.on('system_broadcast', (message) => {
    console.log(message);
    // {
    //     id: 'id_...',
    //     content: '广播内容',
    //     fromAdmin: '管理员名',
    //     timestamp: 1704067200000
    // }
});
```

#### 14. 被禁言

```javascript
socket.on('muted', (data) => {
    console.log(data);
    // { reason: '原因', adminName: '管理员名' }
});
```

#### 15. 被解禁

```javascript
socket.on('unmuted', () => {
    console.log('已被解禁');
});
```

#### 16. 被封禁

```javascript
socket.on('banned', (data) => {
    console.log(data);
    // { reason: '原因', adminName: '管理员名' }
});
```

#### 17. 被踢出

```javascript
socket.on('kicked', (data) => {
    console.log(data);
    // { reason: '原因', adminName: '管理员名' }
});
```

#### 18. 消息被删除

```javascript
socket.on('message_deleted', (data) => {
    console.log(data);
    // { messageId: 'id_...', adminName: '管理员名' }
});
```

#### 19. 消息被清空

```javascript
socket.on('messages_cleared', (data) => {
    console.log(data);
    // { adminName: '管理员名' }
});
```

#### 20. 成为管理员

```javascript
socket.on('became_admin', () => {
    console.log('已成为管理员');
});
```

#### 21. 失去管理员

```javascript
socket.on('lost_admin', () => {
    console.log('已失去管理员权限');
});
```

#### 22. 管理列表

```javascript
socket.on('admin_lists', (data) => {
    console.log(data);
    // {
    //     banned: [{ user_id, nickname, username, banned_by, reason, created_at }],
    //     muted: [{ user_id, nickname, username, muted_by, reason, created_at }]
    // }
});
```

#### 23. 所有用户列表

```javascript
socket.on('all_users_list', (data) => {
    console.log(data);
    // { users: [{ id, username, nickname, avatar, color, bio, is_admin, is_super_admin, last_active, created_at }] }
});
```

#### 24. 错误消息

```javascript
socket.on('error', (data) => {
    console.error(data);
    // { message: '错误描述' }
});
```

#### 25. 管理操作结果

```javascript
socket.on('admin_result', (data) => {
    console.log(data);
    // { success: true, action: 'mute', targetId: 'id_...' }
    // { success: false, action: 'delete_message', error: '密钥错误' }
});
```

---

## 数据类型

### User 对象

```typescript
interface User {
    id: string;              // 用户唯一ID
    username?: string;       // 用户名
    nickname: string;        // 昵称
    avatar?: string;         // 头像URL（base64）
    x: number;               // X坐标
    y: number;               // Y坐标
    color: string;           // 主题颜色（#hex）
    bio?: string;            // 个人简介
    is_admin?: number;       // 是否管理员（0/1）
    is_super_admin?: number; // 是否超级管理员（0/1）
    last_active?: number;    // 最后活跃时间戳
    created_at?: number;     // 创建时间戳
}
```

### Message 对象

```typescript
interface Message {
    id: string;              // 消息ID
    userId?: string;         // 用户ID
    x: number;               // X坐标
    y: number;               // Y坐标
    content: string;         // 内容
    author: string;          // 作者昵称
    authorId: string;        // 作者ID
    authorColor: string;     // 作者颜色
    authorIsAdmin?: number;  // 作者是否管理员
    friendOnly?: boolean;    // 是否仅好友可见
    timestamp: number;       // 时间戳
}
```

### PrivateMessage 对象

```typescript
interface PrivateMessage {
    id: string;              // 消息ID
    fromId: string;          // 发送者ID
    toId: string;            // 接收者ID
    content: string;         // 内容
    fromName: string;        // 发送者昵称
    fromAvatar?: string;     // 发送者头像
    fromColor: string;       // 发送者颜色
    timestamp: number;       // 时间戳
}
```

### FriendRequest 对象

```typescript
interface FriendRequest {
    id: string;              // 请求者ID
    username?: string;       // 请求者用户名
    nickname: string;        // 请求者昵称
    avatar?: string;         // 请求者头像
    color: string;           // 请求者颜色
    requestId: string;       // 请求ID（发送者ID）
}
```

---

## 错误处理

### HTTP 错误码

| 状态码 | 含义 | 场景 |
|--------|------|------|
| 200 | 成功 | 请求成功 |
| 400 | 请求错误 | 参数缺失或无效 |
| 401 | 未授权 | 登录失败 |
| 404 | 未找到 | 用户不存在 |
| 500 | 服务器错误 | 内部错误 |

### Socket 错误

```javascript
socket.on('error', (data) => {
    // 常见错误消息：
    // - '请先注册用户'
    // - '您已被禁言，无法发送消息'
    // - '消息内容不能为空'
    // - '消息内容过长（最多500字符）'
    // - '发送太频繁，请稍后再试'
    // - '只能给好友发送私信'
    // - '无权限'
});
```

---

## 示例代码

### 完整客户端示例

```javascript
// 连接服务器
const socket = io('http://localhost:3000');

// 应用状态
const state = {
    currentUser: null,
    onlineUsers: new Map(),
    messages: [],
    friends: [],
    isAdmin: false
};

// 连接成功
socket.on('connect', () => {
    console.log('Connected to server');
    
    // 注册为游客
    socket.emit('register', {
        nickname: '游客' + Math.floor(Math.random() * 1000)
    });
});

// 注册成功
socket.on('registered', (data) => {
    state.currentUser = data.user;
    state.isAdmin = data.isAdmin;
    
    // 更新在线用户
    data.onlineUsers.forEach(user => {
        state.onlineUsers.set(user.id, user);
    });
    
    // 加载历史消息
    state.messages = data.recentMessages;
    
    console.log('Registered as:', data.user.nickname);
});

// 接收新消息
socket.on('new_message', (message) => {
    state.messages.push(message);
    displayMessage(message);
});

// 用户加入
socket.on('user_joined', (data) => {
    state.onlineUsers.set(data.user.id, data.user);
    console.log('User joined:', data.user.nickname);
});

// 用户离开
socket.on('user_left', (data) => {
    state.onlineUsers.delete(data.userId);
    console.log('User left:', data.nickname);
});

// 用户移动
socket.on('user_moved', (data) => {
    const user = state.onlineUsers.get(data.userId);
    if (user) {
        user.x = data.x;
        user.y = data.y;
    }
});

// 发送消息
function sendMessage(content) {
    socket.emit('send_message', {
        content: content,
        friendOnly: false
    });
}

// 移动位置
function moveTo(x, y) {
    socket.emit('move', { x, y });
}

// 发送好友请求
function addFriend(userId) {
    socket.emit('send_friend_request', { targetId: userId });
}

// 接受好友请求
function acceptFriend(fromId) {
    socket.emit('accept_friend_request', { fromId });
}

// 发送私信
function sendPrivateMessage(targetId, content) {
    socket.emit('send_private_message', { targetId, content });
}

// 接收私信
socket.on('private_message', (message) => {
    console.log('Private message from', message.fromName, ':', message.content);
});

// 错误处理
socket.on('error', (data) => {
    console.error('Error:', data.message);
    alert(data.message);
});

// 断开连接
socket.on('disconnect', () => {
    console.log('Disconnected from server');
});
```

### 管理员操作示例

```javascript
// 删除消息（需要管理员权限）
function deleteMessage(messageId) {
    socket.emit('admin_delete_message', {
        key: 'ADMIN_SECRET_KEY',
        messageId: messageId
    });
}

// 禁言用户
function muteUser(userId, reason) {
    socket.emit('admin_mute_user', {
        targetId: userId,
        reason: reason
    });
}

// 封禁用户
function banUser(userId, reason) {
    socket.emit('admin_ban_user', {
        targetId: userId,
        reason: reason
    });
}

// 系统广播
function broadcast(content) {
    socket.emit('admin_broadcast', { content });
}

// 监听管理操作结果
socket.on('admin_result', (data) => {
    if (data.success) {
        console.log('Admin action success:', data.action);
    } else {
        console.error('Admin action failed:', data.error);
    }
});
```

---

## 更新日志

### v1.0.0
- 初始 API 版本
- 实现基础聊天功能
- 实现用户系统
- 实现好友系统
- 实现管理员功能
