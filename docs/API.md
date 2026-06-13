# MeChat API 文档

## 概览

MeChat 的通信分为两个通道：

- **HTTP REST API**：账号认证、健康检查、数据查询（7 个端点）
- **Socket.IO 实时事件**：全部业务逻辑（30+ 客户端事件、25+ 服务器事件）

**基础 URL**：`http://localhost:3000`

**Socket.IO 连接**：

```javascript
const socket = io('http://localhost:3000');
```

---

## REST API

### GET /api/health

健康检查端点，用于监控服务是否正常运行。

**响应** `200`：

```json
{ "status": "ok", "timestamp": 1704067200000 }
```

---

### POST /api/register

用户注册。

**请求体**：

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|:----:|------|------|
| username | string | 是 | ≥2 字符，唯一 | 登录用户名 |
| password | string | 是 | ≥4 字符 | 密码（scrypt 哈希存储） |
| nickname | string | 否 | ≤20 字符 | 显示昵称，默认同 username |
| color | string | 否 | #hex 格式 | 主题色，默认随机 |

**响应** `200`：

```json
{
  "success": true,
  "id": "id_1704067200000_abc123",
  "user": {
    "id": "id_1704067200000_abc123",
    "username": "myname",
    "nickname": "我的昵称",
    "color": "#6366f1",
    ...
  }
}
```

**错误响应** `400`：

```json
{ "success": false, "error": "用户名已存在" }
```

可能的错误：`用户名和密码不能为空`、`用户名已存在`、`用户名至少2个字符`、`密码至少4个字符`

---

### POST /api/login

用户登录。

**请求体**：

| 字段 | 类型 | 必填 |
|------|------|:----:|
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

可能的错误：`用户名和密码不能为空`、`用户不存在`、`密码错误`、`该账号未设置密码，请使用游客模式`

---

### GET /api/users

获取在线用户列表（5 分钟内有活跃记录的用户）。

**查询参数**：无

**响应** `200`：

```json
{
  "users": [
    {
      "id": "id_xxx",
      "username": "user1",
      "nickname": "昵称",
      "avatar": "data:image/...",
      "x": 100,
      "y": 200,
      "color": "#6366f1",
      "bio": "个性签名"
    }
  ],
  "count": 1
}
```

---

### GET /api/user/:id

获取指定用户的详细信息。

**路径参数**：

| 参数 | 说明 | 约束 |
|------|------|------|
| id | 用户唯一 ID | 必须以 `id_` 开头 |

**响应** `200`：完整用户对象

**响应** `404`：

```json
{ "error": "用户不存在" }
```

**响应** `400`：

```json
{ "error": "无效的用户ID" }
```

---

### GET /api/messages

获取消息列表，支持按坐标范围筛选。

**查询参数**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| limit | number | 100 | 返回数量上限 |
| x | number | - | 中心 X 坐标（与 y、radius 配合） |
| y | number | - | 中心 Y 坐标（与 x、radius 配合） |
| radius | number | 2000 | 搜索半径 |

**响应** `200`：

```json
{
  "messages": [...],
  "count": 42
}
```

---

### POST /api/clear-messages

清空所有世界消息。**需要管理员密钥鉴权**。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| key | string | 是 | 管理员密钥（必须等于环境变量 ADMIN_KEY） |

**响应** `200`：

```json
{ "success": true, "message": "已删除 100 条消息" }
```

**响应** `403`：

```json
{ "success": false, "error": "无权限" }
```

---

## Socket.IO 事件

### 客户端 → 服务器 (Client Events)

#### 用户生命周期

##### register

进入世界。新用户创建账号，老用户恢复会话。

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| userId | string | 否 | 已有用户 ID（恢复会话时传入） |
| sessionToken | string | 否 | 会话令牌（与 userId 配对验证） |
| nickname | string | 否 | 昵称（≤20 字符），覆盖已有值 |
| avatar | string | 否 | 头像（base64 JPEG, 128px） |
| color | string | 否 | 主题色（#hex 格式） |

**服务端返回事件**：`registered`

##### update_profile

更新个人资料。

**参数**：

| 字段 | 类型 | 必填 | 约束 |
|------|------|:----:|------|
| nickname | string | 否 | ≤20 字符 |
| avatar | string | 否 | base64 图片 |
| color | string | 否 | #hex 格式 |
| bio | string | 否 | ≤200 字符 |

> 仅允许修改以上四个字段（白名单机制）

**服务端返回事件**：`profile_updated`（自己）、`user_profile_changed`（广播给其他人）

#### 移动

##### move

上报位置更新。

**参数**：

| 字段 | 类型 | 必填 | 约束 |
|------|------|:----:|------|
| x | number | **是** | isFinite, 范围 [-100000, 100000] |
| y | number | **是** | isFinite, 范围 [-100000, 100000] |

> 服务端验证数值有效性后更新内存并选择性广播

#### 世界消息

##### send_message

发送世界留言。

**参数**：

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|:----:|------|------|
| content | string | **是** | 1~500 字符 | 消息内容（自动 trim） |
| x | number | 否 | number | 消息 X 坐标，默认为当前坐标 |
| y | number | 否 | number | 消息 Y 坐标，默认为当前坐标 |
| friendOnly | boolean | 否 | - | true = 仅好友可见 |

**校验链**：登录检查 → 禁言检查 → 非空检查 → 长度限制 → 频率限制(1s) → 存储 → 屏蔽过滤 → 广播

##### admin_delete_message

管理员删除指定消息。

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| key | string | **是** | 管理员密钥 |
| messageId | string | **是** | 要删除的消息 ID |

> 需要管理员权限 + 密钥双重验证

#### 好友系统

| 事件 | 参数 | 说明 |
|------|------|------|
| `send_friend_request` | `{ targetId }` | 发送好友申请。检查非自己、非已好友、无重复申请、无反向申请 |
| `accept_friend_request` | `{ fromId }` | 接受好友申请。建立双向好友关系 |
| `reject_friend_request` | `{ fromId }` | 拒绝好友申请。状态标记为 rejected |
| `remove_friend` | `{ targetId }` | 删除好友。双向移除 friends 记录 |
| `get_friends` | - | 请求好友列表 + 待处理申请 |
| `get_pending_requests` | - | 仅请求待处理的好友申请 |

**相关服务端事件**：
- `friend_request` — 收到好友申请通知
- `friend_accepted` — 好友申请被对方接受
- `friend_removed` — 被好友删除
- `friends_list` — 好友列表数据
- `pending_requests` — 待处理申请列表
- `friend_result` — 操作结果确认

#### 屏蔽系统

| 事件 | 参数 | 说明 |
|------|------|------|
| `block_user` | `{ targetId }` | 屏蔽用户（同时解除好友关系） |
| `unblock_user` | `{ targetId }` | 取消屏蔽 |

**相关服务端事件**：
- `block_result` — 屏蔽操作结果
- `user_left` — 屏蔽后对屏蔽者隐藏（被屏蔽者视角）

#### 私信系统

| 事件 | 参数 | 约束 | 说明 |
|------|------|------|------|
| `send_private_message` | `{ targetId, content }` | content ≤2000 字符；仅限好友 | 发送私信 |
| `get_dm_history` | `{ targetId }` | - | 获取私信历史（最近 50 条） |
| `clear_dm_history` | `{ targetId }` | - | 清空与指定用户的私信记录 |

**相关服务端事件**：
- `private_message` — 收到私信
- `private_message_sent` — 发送成功确认
- `dm_history` — 私信历史记录
- `dm_cleared` — 私信清空确认

> 私信包含 2 秒去重机制（recentDmCache），防止网络重试导致重复消息

#### 管理员操作

所有管理操作需要 `is_admin === 1`，站长专属操作需要 `is_super_admin === 1`。

**通用管理**（需管理员权限）：

| 事件 | 参数 | 说明 |
|------|------|------|
| `admin_mute_user` | `{ targetId, reason? }` | 禁言用户 |
| `admin_unmute_user` | `{ targetId }` | 解除禁言 |
| `admin_kick_user` | `{ targetId, reason? }` | 踢出用户（500ms 后断开连接） |
| `admin_ban_user` | `{ targetId, reason? }` | 封禁用户（禁止重新进入） |
| `admin_unban_user` | `{ targetId }` | 解除封禁 |
| `admin_broadcast` | `{ content }` | 全服广播（content ≤500 字符） |
| `admin_clear_messages` | - | 清空所有世界消息 |
| `admin_cleanup` | `{ days? }` | 清理不活跃数据（默认 30 天） |
| `admin_get_lists` | - | 获取封禁/禁言列表 |
| `admin_get_all_users` | - | 获取全部用户列表 |
| `admin_get_user_info` | `{ targetId }` | 获取用户详情 |
| `admin_update_user` | `{ targetId, field, value }` | 修改用户信息（仅 nickname/avatar/color/bio） |
| `admin_kick_guests` | - | 踢出所有游客并删除其数据 |

**站长专属**（需超级管理员权限）：

| 事件 | 参数 | 说明 |
|------|------|------|
| `admin_set_admin` | `{ targetId }` | 任命管理员（不可修改站长自身） |
| `admin_unset_admin` | `{ targetId }` | 撤销管理员（不可修改站长自身） |

**相关服务端事件**：
- `admin_result` — 操作结果 `{ success, action, targetId?, error? }`
- `became_admin` / `lost_admin` — 管理员身份变更通知
- `admin_lists` — 封禁/禁言列表数据
- `all_users_list` — 全部用户列表
- `user_info_detail` — 用户详情
- `muted` / `unmuted` — 禁言状态变更通知
- `kicked` — 被踢出通知 `{ reason, adminName }`
- `banned` — 被封禁通知 `{ reason, adminName }`
- `system_broadcast` — 全服广播内容

---

### 服务器 → 客户端 (Server Events)

#### 用户状态

| 事件 | 数据 | 触发时机 |
|------|------|----------|
| `registered` | `{ user, isAdmin, isSuperAdmin, sessionToken, onlineUsers, recentMessages }` | 进入世界成功 |
| `user_joined` | `{ user }` | 新用户首次进入 |
| `user_left` | `{ userId, nickname }` | 用户离开（最后连接断开） |
| `user_reconnected` | `{ userId, nickname, x, y }` | 用户重连（多标签页场景） |
| `user_moved` | `{ userId, x, y }` | 其他用户位置更新 |
| `profile_updated` | `{ user }` | 自己的资料更新成功 |
| `user_profile_changed` | `{ userId, changes }` | 其他用户资料变更 |

#### 消息

| 事件 | 数据 | 触发时机 |
|------|------|----------|
| `new_message` | `{ id, x, y, content, author, authorId, authorColor, authorIsAdmin, friendOnly, timestamp }` | 新世界消息 |
| `message_deleted` | `{ messageId, adminName }` | 消息被管理员删除 |
| `messages_cleared` | `{ adminName }` | 所有消息被清空 |

#### 好友

| 事件 | 数据 | 触发时机 |
|------|------|----------|
| `friend_request` | `{ fromUser: { id, nickname, avatar, color } }` | 收到好友申请 |
| `friend_accepted` | `{ toUser: { id, nickname, avatar, color } }` | 申请被对方接受 |
| `friend_result` | `{ targetId?, success, action?, error?, reverse_request? }` | 好友操作结果 |
| `friends_list` | `{ friends: [...] }` | 好友列表数据 |
| `pending_requests` | `{ requests: [...] }` | 待处理申请列表 |
| `friend_removed` | `{ fromUserId }` | 被好友删除 |

#### 私信

| 事件 | 数据 | 触发时机 |
|------|------|----------|
| `private_message` | `{ id, fromId, fromName, fromAvatar, fromColor, toId, content, timestamp }` | 收到私信 |
| `private_message_sent` | `{ targetId, content, timestamp }` | 私信发送确认 |
| `dm_history` | `{ targetId, messages: [...] }` | 私信历史记录 |
| `dm_cleared` | `{ targetId }` | 私信被清空 |

#### 系统通知

| 事件 | 数据 | 触发时机 |
|------|------|----------|
| `system_broadcast` | `{ id, content, fromAdmin, timestamp }` | 全服广播 |
| `muted` | `{ reason, adminName }` | 被禁言 |
| `unmuted` | `{}` | 被解除禁言 |
| `kicked` | `{ reason, adminName }` | 被踢出 |
| `banned` | `{ reason, adminName }` | 被封禁 |

#### 错误

| 事件 | 数据 | 触发时机 |
|------|------|----------|
| `error` | `{ message: string }` | 各种操作失败时的通用错误通知 |

**常见错误消息汇总**：

| 错误消息 | 触发条件 |
|----------|----------|
| `请先注册用户` | 未登录状态下发送消息等需要身份的操作 |
| `您已被禁言，无法发送消息` | 被禁言用户尝试发消息/私信 |
| `您已被封禁` | 被封禁用户尝试进入 |
| `消息内容不能为空` | 发送空消息 |
| `消息内容过长（最多500字符） | 消息超长 |
| `私信内容不能超过2000字` | 私信超长 |
| `发送太频繁，请稍后再试` | 消息频率超限（<1s 间隔） |
| `只能给好友发送私信` | 对非好友发送私信 |
| `无权限` | 非管理员执行管理操作 |
| `仅站长可设置管理员` | 普通管理员尝试任命管理员 |
| `仅站长可取消管理员` | 普通管理员尝试撤销管理员 |
| `无法修改站长权限` | 尝试修改站长的管理员状态 |
| `昵称不能超过20个字符` | 昵称超长 |
| `签名不能超过200个字符` | 签名超长 |
| `密钥错误` | 管理员密钥不匹配 |
| `用户不存在` | 目标用户 ID 无效 |

---

## 数据类型

### User（用户对象）

```typescript
interface User {
    id: string;              // 唯一 ID，格式 "id_时间戳_随机串"
    username?: string;       // 登录用户名（游客为 null）
    nickname: string;        // 显示昵称
    avatar?: string;         // 头像（base64 编码的 JPEG，约 128px）
    x: number;               // 世界 X 坐标
    y: number;               // 世界 Y 坐标
    color: string;           // 主题色（#hex 格式）
    bio?: string;            // 个性签名
    is_admin?: number;       // 0 或 1
    is_super_admin?: number; // 0 或 1
    last_active?: number;    // 最后活跃时间戳（毫秒）
    created_at?: number;     // 创建时间戳（毫秒）
}
```

### Message（世界消息）

```typescript
interface Message {
    id: string;
    userId?: string;         // 发送者用户 ID
    x: number;              // 消息所在 X 坐标
    y: number;              // 消息所在 Y 坐标
    content: string;        // 消息文本
    author: string;         // 作者昵称
    authorId: string;       // 作者用户 ID
    authorColor: string;    // 作者主题色
    authorIsAdmin?: number; // 作者是否管理员（0/1）
    timestamp: number;      // 发送时间戳（毫秒）
}
```

> 注意：客户端收到的 `new_message` 事件中额外包含 `friendOnly` 字段（boolean），表示是否为好友专属消息。

### PrivateMessage（私信）

```typescript
interface PrivateMessage {
    id: string;
    fromId: string;          // 发送者 ID
    toId: string;            // 接收者 ID
    content: string;         // 消息内容
    fromName: string;        // 发送者昵称
    fromAvatar?: string;     // 发送者头像
    fromColor: string;       // 发送者主题色
    timestamp: number;       // 发送时间戳（毫秒）
}
```

### FriendRequest（好友申请）

```typescript
interface FriendRequest {
    id: string;              // 请求方用户 ID
    username?: string;
    nickname: string;
    avatar?: string;
    color: string;
}
```

---

## 权限矩阵

| 操作 | 普通用户 | 管理员 | 站长 |
|------|:--------:|:------:|:----:|
| 发送世界消息 | ✅ | ✅ | ✅ |
| 发送好友专属消息 | ✅ | ✅ | ✅ |
| 添加/接受/拒绝好友 | ✅ | ✅ | ✅ |
| 发送/查看私信 | ✅ | ✅ | ✅ |
| 屏蔽/取消屏蔽用户 | ✅ | ✅ | ✅ |
| 修改个人资料 | ✅ | ✅ | ✅ |
| 禁言用户 | ❌ | ✅ | ✅ |
| 解除禁言 | ❌ | ✅ | ✅ |
| 踢出用户 | ❌ | ✅ | ✅ |
| 封禁用户 | ❌ | ✅ | ✅ |
| 解除封禁 | ❌ | ✅ | ✅ |
| 删除消息 | ❌ | ✅ (需密钥) | ✅ (需密钥) |
| 全服广播 | ❌ | ✅ | ✅ |
| 清空消息 | ❌ | ✅ | ✅ |
| 编辑用户信息 | ❌ | ✅ | ✅ |
| 清理离线数据 | ❌ | ✅ | ✅ |
| 踢出所有游客 | ❌ | ✅ | ✅ |
| 任命管理员 | ❌ | ❌ | ✅ |
| 撤销管理员 | ❌ | ❌ | ✅ |
