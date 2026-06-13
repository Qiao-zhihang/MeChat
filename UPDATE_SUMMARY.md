# 更新概要

> 更新时间：2026-06-12

## 安全修复

### 1. `/api/clear-messages` 端点添加鉴权
**文件**: `server/index.js`

该接口原先无需任何认证即可清空全部聊天记录，现已要求提供管理员密钥（`ADMIN_KEY`），与系统中其他管理操作保持一致。

### 2. 密码哈希升级为 scrypt
**文件**: `server/database.js`

- 旧方案：SHA256 + 静态盐值 `mechat_salt_`（易受彩虹表和 GPU 暴力破解攻击）
- 新方案：`crypto.scryptSync(password, salt, 64)`（Node.js 内置，抗 GPU/ASIC 攻击）
- 存储格式：`随机盐:派生密钥`（每用户独立盐值）
- 兼容性：`verifyPassword` 函数含旧哈希回退逻辑，现有用户可正常登录

## 数据库优化

### 3. 启用外键约束
**文件**: `server/database.js`

添加 `PRAGMA foreign_keys = ON`，使 SQLite 的表间外键约束和级联删除真正生效。

### 4. 添加数据库索引
**文件**: `server/database.js`

为高频查询字段建立索引，提升查询性能：

| 索引 | 目标表 | 作用 |
|---|---|---|
| `idx_messages_author_id` | messages | 按用户查询消息 |
| `idx_messages_timestamp` | messages | 按时间排序消息 |
| `idx_messages_position` | messages | 按位置范围查询消息 |
| `idx_private_messages_pair` | private_messages | 查询两人私信记录 |
| `idx_private_messages_timestamp` | private_messages | 私信时间排序 |
| `idx_friends_user` | friends | 查询用户好友列表 |
| `idx_users_active` | users | 查询在线用户 |
| `idx_blocks_user` | blocks | 查询屏蔽列表 |

## 前端性能

### 5. Page Visibility API 暂停后台渲染
**文件**: `index.html`

- 浏览器标签页隐藏时自动暂停 `requestAnimationFrame` 渲染循环，切回时恢复
- 节省 CPU 和笔记本电池消耗

### 6. Canvas 渲染优化
**文件**: `index.html`

- 修复 `renderOtherUsers()` 中好友名字渲染时重复设置 `ctx.font` 的问题
- `escapeHtml` 从 DOM 元素创建改为纯字符串正则替换，减少 GC 压力

## 内存泄漏修复

### 7. 消息缓存随删除操作清理
**文件**: `index.html`

- `message_deleted`：单条消息删除时同步清理 `msgMeasureCache`
- `messages_cleared`：全量清空时同步清理 `msgMeasureCache`
- 防止缓存随运行时间持续增长

## 接口健壮性

### 8. 用户 ID 参数校验
**文件**: `server/index.js`

`/api/user/:id` 端点增加格式校验（`id.startsWith('id_')`），拒绝无效的 ID 格式，避免无意义数据库查询。

## 代码清理

### 9. 移除重复导出
**文件**: `server/database.js`

`cleanupInactiveUsers` 在 `module.exports` 中出现两次，已移除多余的重复项。

## 文件清理

### 10. 移除重复文件
- 删除 `public/图片1.svg`（与 `public/mechat-logo.svg` 完全重复）
- 删除 `.uploads/` 空目录，并加入 `.gitignore`

## 升级指引

项目已有的现有用户（旧 SHA256 哈希）可正常登录，`verifyPassword` 内含回退兼容逻辑。

建议 clone 后删除测试数据库 `data/mechat.db`，让首次启动自动创建干净数据库。
