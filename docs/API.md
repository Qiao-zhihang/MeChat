# MeChat API 文档

## 概览

MeChat 的通信分为两个通道：

- **HTTP REST API**：仅用于账号注册和登录（7 个端点）
- **Socket.IO 实时事件**：所有业务逻辑（30+ 客户端事件、25+ 服务器事件）

基础 URL：`http://localhost:3000`

---

## REST API

### POST /api/register

用户注册。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名，≥2 字符 |
| password | string | 是 | 密码，≥4 字符 |
| nickname | string | 否 | 昵称，默认同 username |
| color | string | 否 | 主题色，默认随机 |

**响应** `200`：

```json
{ "success": true, "id": "id_...", "user": { "id": "...", "username": "...", "nickname": "...", ... } }
```

**错误响应** `400`：

```json
{ "success": false, "error": "用户名已存在" }
```

### POST /api/login

用户登录。

**请求体**：

| 字段 | 类型 | 必填 |
|------|------|------|
| username | string | 是 |
| password | string | 是 |

**响应** `200`：

```json
{ "success": true, "user": { "id": "...", "username": "...", "nickname": "...", ... } }
```

**错误响应** `401`：

```json
{ "success": false, "error": "密码错误" }
```

### GET /api/health

健康检查。

**响应**：

```json
{ "status": "ok", "timestamp": 1704067200000 }
```

### GET /api/users

获取在线用户列表（5 分钟内活跃）。

**响应**：

```json
{ "users": [{ "id": "...", "username": "...", "nickname": "...", "avatar": "...", "x": 0, "y": 0, "color": "#6366f1", "bio": "..." }], "count": 1 }
```

### GET /api/user/:id

获取指定用户信息。

**响应** `200`：用户对象

**响应** `404`：`{ "error": "用户不存在" }`

### GET /api/messages

获取消息列表，支持按坐标范围筛选。

**查询参数**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| limit | number | 100 | 返回数量上限 |
| x | number | - | 中心 X 坐标（与 y、radius 配合使用） |
| y | number | - | 中心 Y 坐标 |
| radius | number | 2000 | 搜索半径 |

### POST /api/clear-messages

清空所有消息。

**响应**：

```json
{ "success": true, "message": "已删除 100 条消息" }
```

---

## Socket.IO 事件

### 连接

```javascript
const socket = io('http://localhost:3000');
```

---

### 客户端 → 服务器

#### 用户

| 事件 | 参数 | 说明 |
|------|------|------|
| `register` | `{ userId?, nickname?, avatar?, color? }` | 进入世界（新建或恢复会话） |
| `update_profile` | `{ nickname?, avatar?, color?, bio? }` | 更新个人资料 |

#### 移动

| 事件 | 参数 | 说明 |
|------|------|------|
| `move` | `{ x: number, y: number }` | 更新位置（服务端验证数值有效性） |

#### 消息

| 事件 | 参数 | 说明 |
|------|------|------|
| `send_message` | `{ content, x?, y?, friendOnly? }` | 发送世界留言。限制：1-500 字符，1 秒间隔 |
| `admin_delete_message` | `{ key, messageId }` | 删除指定消息（需管理员权限 + 密钥） |

#### 好友

| 事件 | 参数 | 说明 |
|------|------|------|
| `send_friend_request` | `{ targetId }` | 发送好友申请 |
| `accept_friend_request` | `{ fromId }` | 接受好友申请 |
| `reject_friend_request` | `{ fromId }` | 拒绝好友申请 |
| `remove_friend` | `{ targetId }` | 删除好友 |
| `get_friends` | - | 请求好友列表 |
| `get_pending_requests` | - | 请求待处理的好友申请 |

#### 屏蔽

| 事件 | 参数 | 说明 |
|------|------|------|
| `block_user` | `{ targetId }` | 屏蔽用户（同时解除好友关系） |
| `unblock_user` | `{ targetId }` | 取消屏蔽 |

#### 私信

| 事件 | 参数 | 说明 |
|------|------|------|
| `send_private_message` | `{ targetId, content }` | 发送私信（仅限好友） |
| `get_dm_history` | `{ targetId }` | 获取私信历史（最近 50 条） |
| `clear_dm_history` | `{ targetId }` | 清空与指定用户的私信记录 |

#### 管理员

| 事件 | 参数 | 权限 | 说明 |
|------|------|------|------|
| `admin_mute_user` | `{ targetId, reason? }` | 管理员 | 禁言用户 |
| `admin_unmute_user` | `{ targetId }` | 管理员 | 解除禁言 |
| `admin_kick_user` | `{ targetId, reason? }` | 管理员 | 踢出用户（断开连接） |
| `admin_ban_user` | `{ targetId, reason? }` | 管理员 | 封禁用户（禁止进入） |
| `admin_unban_user` | `{ targetId }` | 管理员 | 解除封禁 |
| `admin_broadcast` | `{ content }` | 管理员 | 全服广播 |
| `admin_clear_messages` | - | 管理员 | 清空所有世界消息 |
| `admin_cleanup` | `{ days? }` | 管理员 | 清理不活跃数据（默认 30 天） |
| `admin_get_lists` | - | 管理员 | 获取封禁/禁言列表 |
| `admin_get_all_users` | - | 管理员 | 获取全部用户列表 |
| `admin_get_user_info` | `{ targetId }` | 管理员 | 获取用户详情 |
| `admin_update_user` | `{ targetId, field, value }` | 管理员 | 修改用户信息（仅限 nickname/avatar/color/bio） |
| `admin_set_admin` | `{ targetId }` | 站长 | 任命管理员 |
| `admin_unset_admin` | `{ targetId }` | 站长 | 撤销管理员 |

---

### 服务器 → 客户端

#### 用户状态

| 事件 | 数据 | 说明 |
|------|------|------|
| `registered` | `{ user, isAdmin, isSuperAdmin, onlineUsers, recentMessages }` | 注册/进入成功 |
| `user_joined` | `{ user }` | 新用户进入 |
| `user_left` | `{ userId, nickname }` | 用户离开 |
| `user_reconnected` | `{ userId, nickname, x, y }` | 用户重连 |
| `user_moved` | `{ userId, x, y }` | 用户位置更新 |
| `profile_updated` | `{ user }` | 个人资料更新成功（自己触发） |
| `user_profile_changed` | `{ userId, changes }` | 其他用户资料变更 |

#### 消息

| 事件 | 数据 | 说明 |
|------|------|------|
| `new_message` | `{ id, x, y, content, author, authorId, authorColor, authorIsAdmin, friendOnly, timestamp }` | 新世界消息 |
| `message_deleted` | `{ messageId, adminName }` | 消息被管理员删除 |
| `messages_cleared` | `{ adminName }` | 所有消息被清空 |

#### 好友

| 事件 | 数据 | 说明 |
|------|------|------|
| `friend_request` | `{ fromUser: { id, nickname, avatar, color } }` | 收到好友申请 |
| `friend_accepted` | `{ toUser: { id, nickname, avatar, color } }` | 好友申请被接受 |
| `friend_result` | `{ targetId?, success, action?, error? }` | 好友操作结果 |
| `friends_list` | `{ friends: [...] }` | 好友列表 |
| `pending_requests` | `{ requests: [...] }` | 待处理的好友申请 |

#### 私信

| 事件 | 数据 | 说明 |
|------|------|------|
| `private_message` | `{ id, fromId, fromName, fromAvatar, fromColor, toId, content, timestamp }` | 收到私信 |
| `private_message_sent` | `{ targetId, content, timestamp }` | 私信发送成功确认 |
| `dm_history` | `{ targetId, messages: [...] }` | 私信历史记录 |
| `dm_cleared` | `{ targetId }` | 私信被清空 |

#### 管理员

| 事件 | 数据 | 说明 |
|------|------|------|
| `admin_result` | `{ success, action, targetId?, error? }` | 管理操作结果 |
| `became_admin` | - | 被任命为管理员 |
| `lost_admin` | - | 被撤销管理员 |
| `admin_lists` | `{ banned: [...], muted: [...] }` | 封禁/禁言列表 |
| `all_users_list` | `{ users: [...] }` | 全部用户列表 |
| `user_info_detail` | `{ ...userObject }` | 用户详情 |

#### 系统通知

| 事件 | 数据 | 说明 |
|------|------|------|
| `system_broadcast` | `{ id, content, fromAdmin, timestamp }` | 全服广播 |
| `muted` | `{ reason, adminName }` | 被禁言 |
| `unmuted` | `{}` | 被解除禁言 |
| `kicked` | `{ reason, adminName }` | 被踢出 |
| `banned` | `{ reason, adminName }` | 被封禁 |

#### 错误

| 事件 | 数据 | 说明 |
|------|------|------|
| `error` | `{ message: string }` | 通用错误 |

常见错误消息：`请先注册用户`、`您已被禁言，无法发送消息`、`消息内容不能为空`、`消息内容过长（最多500字符）`、`发送太频繁，请稍后再试`、`只能给好友发送私信`、`无权限`、`仅站长可设置管理员`、`您的账号已被封禁`

---

## 数据类型

### User

```typescript
{
    id: string;              // 唯一 ID，格式 "id_时间戳_随机串"
    username?: string;       // 登录用户名（游客为空）
    nickname: string;        // 显示昵称
    avatar?: string;         // 头像（base64 JPEG，128px）
    x: number;               // 世界 X 坐标
    y: number;               // 世界 Y 坐标
    color: string;           // 主题色（#hex）
    bio?: string;            // 个性签名
    is_admin?: number;       // 0 或 1
    is_super_admin?: number; // 0 或 1
    last_active?: number;    // 最后活跃时间戳（毫秒）
    created_at?: number;     // 创建时间戳（毫秒）
}
```

### Message

```typescript
{
    id: string;
    x: number;               // 消息所在 X 坐标
    y: number;               // 消息所在 Y 坐标
    content: string;
    author: string;          // 作者昵称
    authorId: string;
    authorColor: string;
    authorIsAdmin?: number;
    friendOnly?: boolean;    // true = 仅好友可见
    timestamp: number;
}
```

### PrivateMessage

```typescript
{
    id: string;
    fromId: string;
    toId: string;
    content: string;
    fromName: string;
    fromAvatar?: string;
    fromColor: string;
    timestamp: number;
}
```
