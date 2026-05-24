# MeChat - 开放世界即时通讯

## 项目概述

MeChat 是一个基于 2D 开放世界的实时聊天应用程序，用户可以在虚拟空间中自由移动、发送消息、添加好友并进行私信交流。项目采用现代 Web 技术栈构建，具有实时通信、用户管理、消息持久化等完整功能。

## 核心特性

### 🌍 2D 开放世界
- 无限虚拟空间，用户可以自由移动
- 实时位置同步，查看其他在线用户
- 基于位置的消息系统

### 💬 实时通讯
- 公共频道消息广播
- 好友专属消息（仅好友可见）
- 一对一私信系统
- 消息历史记录持久化

### 👥 社交功能
- 好友系统（添加/删除好友）
- 好友请求管理
- 用户屏蔽功能
- 在线用户列表

### 🔐 用户系统
- 游客模式（无需注册）
- 账号注册与登录
- 自定义昵称、头像、颜色
- 个人简介设置

### 👮 管理功能
- 管理员权限系统
- 用户禁言/解禁
- 用户封禁/解封
- 消息删除
- 系统广播
- 用户清理

## 技术架构

### 后端技术栈
- **Node.js** - 运行时环境
- **Express** - Web 服务器框架
- **Socket.IO** - 实时双向通信
- **sql.js** - SQLite 数据库（内存 + 文件持久化）
- **CORS** - 跨域支持

### 前端技术栈
- **HTML5 Canvas** - 2D 渲染
- **Socket.IO Client** - 实时通信
- **Tailwind CSS** - 样式框架
- **Font Awesome** - 图标库
- **Google Fonts** - 字体

### 数据存储
- **SQLite** - 本地文件数据库
- 数据文件位置：`data/mechat.db`

## 项目结构

```
MeChat/
├── server/
│   ├── index.js          # 主服务器入口
│   └── database.js       # 数据库操作模块
├── data/
│   └── mechat.db         # SQLite 数据库文件
├── public/
│   └── og-image.png      # 网站图标
├── index.html            # 前端主页面
├── package.json          # 项目配置
└── README.md             # 项目文档
```

## 快速开始

### 环境要求
- Node.js >= 18.0.0
- npm 或 yarn

### 安装步骤

1. 克隆项目
```bash
git clone <repository-url>
cd MeChat
```

2. 安装依赖
```bash
npm install
```

3. 启动服务器
```bash
npm start
```

4. 访问应用
打开浏览器访问 `http://localhost:3000`

### 开发模式
```bash
npm run dev
```

## 配置说明

### 环境变量
- `PORT` - 服务器端口（默认：3000）

### 管理员配置
在 `server/index.js` 中配置：
```javascript
const ADMIN_KEY = 'Qiao20100102';  // 管理员密钥
const SUPER_ADMINS = ['Mecat', '千帆栖鸥'];  // 超级管理员用户名
```

## API 文档

### REST API

#### 健康检查
```
GET /api/health
```

#### 用户注册
```
POST /api/register
Body: { username, password, nickname?, color? }
```

#### 用户登录
```
POST /api/login
Body: { username, password }
```

#### 获取在线用户
```
GET /api/users
```

#### 获取用户信息
```
GET /api/user/:id
```

#### 获取消息
```
GET /api/messages?limit=100&x=0&y=0&radius=2000
```

#### 清空消息
```
POST /api/clear-messages
```

### Socket.IO 事件

#### 客户端 → 服务器

| 事件名 | 描述 | 参数 |
|--------|------|------|
| `register` | 注册用户 | `{ userId?, nickname?, avatar?, color? }` |
| `update_profile` | 更新资料 | `{ nickname?, avatar?, color?, bio? }` |
| `move` | 移动位置 | `{ x, y }` |
| `send_message` | 发送消息 | `{ content, x?, y?, friendOnly? }` |
| `send_private_message` | 发送私信 | `{ targetId, content }` |
| `send_friend_request` | 发送好友请求 | `{ targetId }` |
| `accept_friend_request` | 接受好友请求 | `{ fromId }` |
| `reject_friend_request` | 拒绝好友请求 | `{ fromId }` |
| `remove_friend` | 删除好友 | `{ targetId }` |
| `block_user` | 屏蔽用户 | `{ targetId }` |
| `unblock_user` | 取消屏蔽 | `{ targetId }` |
| `get_friends` | 获取好友列表 | - |
| `get_pending_requests` | 获取待处理请求 | - |
| `get_dm_history` | 获取私信历史 | `{ targetId }` |
| `clear_dm_history` | 清空私信历史 | `{ targetId }` |

#### 管理员事件

| 事件名 | 描述 | 参数 |
|--------|------|------|
| `admin_delete_message` | 删除消息 | `{ key, messageId }` |
| `admin_mute_user` | 禁言用户 | `{ targetId, reason }` |
| `admin_unmute_user` | 解禁用户 | `{ targetId }` |
| `admin_ban_user` | 封禁用户 | `{ targetId, reason }` |
| `admin_unban_user` | 解封用户 | `{ targetId }` |
| `admin_kick_user` | 踢出用户 | `{ targetId, reason }` |
| `admin_broadcast` | 系统广播 | `{ content }` |
| `admin_clear_messages` | 清空所有消息 | `{ key }` |
| `admin_cleanup` | 清理不活跃用户 | `{ days }` |
| `admin_set_admin` | 设置管理员 | `{ targetId }` |
| `admin_unset_admin` | 取消管理员 | `{ targetId }` |
| `admin_get_lists` | 获取封禁/禁言列表 | - |
| `admin_get_all_users` | 获取所有用户 | - |

#### 服务器 → 客户端

| 事件名 | 描述 | 数据 |
|--------|------|------|
| `registered` | 注册成功 | `{ user, isAdmin, isSuperAdmin, onlineUsers, recentMessages }` |
| `user_joined` | 用户加入 | `{ user }` |
| `user_left` | 用户离开 | `{ userId, nickname }` |
| `user_moved` | 用户移动 | `{ userId, x, y }` |
| `new_message` | 新消息 | `message` |
| `private_message` | 私信 | `message` |
| `friend_request` | 好友请求 | `{ fromUser }` |
| `friend_accepted` | 好友请求被接受 | `{ toUser }` |
| `friends_list` | 好友列表 | `{ friends }` |
| `pending_requests` | 待处理请求 | `{ requests }` |
| `dm_history` | 私信历史 | `{ targetId, messages }` |
| `error` | 错误消息 | `{ message }` |
| `system_broadcast` | 系统广播 | `message` |
| `muted` | 被禁言 | `{ reason, adminName }` |
| `unmuted` | 被解禁 | - |
| `banned` | 被封禁 | `{ reason, adminName }` |
| `kicked` | 被踢出 | `{ reason, adminName }` |

## 数据库设计

### 表结构

#### users - 用户表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | 用户唯一ID |
| username | TEXT UNIQUE | 用户名 |
| password_hash | TEXT | 密码哈希 |
| nickname | TEXT | 昵称 |
| avatar | TEXT | 头像URL |
| x | REAL | X坐标 |
| y | REAL | Y坐标 |
| color | TEXT | 主题颜色 |
| bio | TEXT | 个人简介 |
| is_admin | INTEGER | 是否管理员 |
| is_super_admin | INTEGER | 是否超级管理员 |
| last_active | INTEGER | 最后活跃时间 |
| created_at | INTEGER | 创建时间 |

#### friends - 好友关系表
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | TEXT | 用户ID |
| friend_id | TEXT | 好友ID |
| created_at | INTEGER | 创建时间 |

#### friend_requests - 好友请求表
| 字段 | 类型 | 说明 |
|------|------|------|
| from_id | TEXT | 发送者ID |
| to_id | TEXT | 接收者ID |
| status | TEXT | 状态：pending/accepted/rejected |
| created_at | INTEGER | 创建时间 |

#### blocks - 屏蔽关系表
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | TEXT | 用户ID |
| blocked_id | TEXT | 被屏蔽用户ID |
| created_at | INTEGER | 创建时间 |

#### messages - 消息表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | 消息ID |
| user_id | TEXT | 用户ID |
| x | REAL | X坐标 |
| y | REAL | Y坐标 |
| content | TEXT | 内容 |
| author | TEXT | 作者昵称 |
| author_id | TEXT | 作者ID |
| author_color | TEXT | 作者颜色 |
| timestamp | INTEGER | 时间戳 |

#### private_messages - 私信表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | 消息ID |
| from_id | TEXT | 发送者ID |
| to_id | TEXT | 接收者ID |
| content | TEXT | 内容 |
| from_name | TEXT | 发送者昵称 |
| from_avatar | TEXT | 发送者头像 |
| from_color | TEXT | 发送者颜色 |
| timestamp | INTEGER | 时间戳 |

#### banned_users - 封禁用户表
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | TEXT PRIMARY KEY | 用户ID |
| banned_by | TEXT | 操作管理员ID |
| reason | TEXT | 原因 |
| created_at | INTEGER | 封禁时间 |

#### muted_users - 禁言用户表
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | TEXT PRIMARY KEY | 用户ID |
| muted_by | TEXT | 操作管理员ID |
| reason | TEXT | 原因 |
| created_at | INTEGER | 禁言时间 |

## 操作指南

### 基本操作

#### 移动
- 使用 **WASD** 或 **方向键** 移动
- 鼠标点击目标位置自动移动

#### 发送消息
- 按 **Enter** 或 **T** 打开消息输入框
- 输入内容后按 **Enter** 发送
- 按 **Esc** 取消发送

#### 好友功能
- 点击用户头像查看资料
- 发送好友请求
- 接受/拒绝好友请求
- 删除好友

#### 私信
- 在好友列表中选择好友
- 打开私信对话框
- 发送私密消息

### 管理员操作

#### 获取管理员权限
1. 注册账号
2. 超级管理员使用密钥设置管理员权限

#### 管理命令
- **删除消息** - 删除违规消息
- **禁言用户** - 禁止用户发送消息
- **封禁用户** - 禁止用户登录
- **踢出用户** - 强制断开用户连接
- **系统广播** - 向所有用户发送通知
- **清理用户** - 删除不活跃账号

## 安全说明

### 密码安全
- 使用 SHA256 哈希存储
- 添加盐值增强安全性

### 权限控制
- 管理员密钥验证
- 超级管理员特权
- 操作日志记录

### 数据保护
- 定期自动保存数据库
- 异常关闭数据恢复
- 敏感操作验证

## 性能优化

### 数据库优化
- 内存数据库 + 定期持久化
- 批量写入操作
- 自动清理过期数据

### 网络优化
- Socket.IO 连接管理
- 消息节流控制
- 位置更新批量处理

### 前端优化
- Canvas 渲染优化
- 虚拟滚动
- 资源懒加载

## 部署建议

### 生产环境
1. 使用反向代理（Nginx）
2. 配置 SSL/TLS
3. 设置环境变量
4. 配置进程管理器（PM2）

### 示例 Nginx 配置
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### PM2 配置
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'mechat',
    script: './server/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

## 开发计划

### 已实现功能
- ✅ 基础聊天功能
- ✅ 用户系统
- ✅ 好友系统
- ✅ 私信功能
- ✅ 管理员系统
- ✅ 消息持久化

### 计划功能
- 📝 图片消息
- 📝 语音消息
- 📝 群组功能
- 📝 地图标记
- 📝 主题切换
- 📝 移动端适配

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证

MIT License

## 联系方式

如有问题或建议，欢迎提交 Issue 或联系开发团队。

---

**MeChat** - 连接世界的每一个角落 🌍
