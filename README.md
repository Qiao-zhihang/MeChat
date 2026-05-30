# MeChat

> 2D 开放世界实时聊天应用 —— 在虚拟空间中自由漫步，与世界各地的用户实时交流。

## 功能一览

| 类别 | 功能 |
|------|------|
| **开放世界** | 无限 2D 平面、WASD/方向键/虚拟摇杆移动、鼠标滚轮/双指缩放、坐标传送 |
| **即时通讯** | 世界留言（基于位置）、好友专属消息、一对一私信、消息历史持久化 |
| **社交系统** | 好友申请/接受/拒绝、好友列表（含在线状态）、一键传送至好友、用户屏蔽 |
| **用户系统** | 账号注册/登录、游客模式（免注册）、自定义昵称/头像/主题色/个性签名、会话持久化 |
| **管理后台** | 管理员禁言/踢出/封禁/解封、站长任命/撤销管理员、全服广播、消息删除（密钥验证）、离线数据清理 |
| **移动端** | 虚拟摇杆、触摸手势、响应式布局、PWA 支持 |
| **视觉设计** | Apple 风格毛玻璃 UI、液态玻璃折射特效、Canvas 点阵网格（视差效果）、距离自适应角色大小 |

## 技术栈

**后端**：Node.js / Express / Socket.IO / sql.js (SQLite)

**前端**：HTML5 Canvas / Socket.IO Client / Tailwind CSS / Font Awesome / Google Fonts (Orbitron + Noto Sans SC)

**数据存储**：SQLite（内存数据库 + 定时文件持久化），数据文件 `data/mechat.db`

## 项目结构

```
MeChat/
├── .gitattributes          # Git 属性配置
├── .gitignore              # Git 忽略规则
├── .env.example            # 环境变量配置示例
├── LICENSE                 # MIT 开源许可证
├── README.md               # 项目说明文档
├── index.html              # 前端单页应用（内嵌 CSS + JS）
├── package.json            # 项目依赖配置
├── package-lock.json       # 依赖版本锁定
├── docs/
│   ├── API.md              # API 完整文档
│   └── DEVELOPER.md        # 开发者文档
├── public/
│   ├── manifest.json       # PWA 配置
│   ├── og-image.png        # 网站图标
│   └── sw.js               # Service Worker
└── server/
    ├── database.js         # 数据库模块
    └── index.js            # 服务端主程序
```

## 快速开始

```bash
# 环境要求：Node.js >= 18.0.0

# 1. 安装依赖
npm install

# 2. 启动服务器
npm start

# 3. 打开浏览器访问
# http://localhost:3000
```

## 配置

### 环境变量

复制 `.env.example` 为 `.env` 并配置以下变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务器监听端口 |
| `SUPER_ADMINS` | （无） | 站长用户名，多个用逗号分隔 |
| `ADMIN_KEY` | （无） | 管理员操作密钥，**必须设置**，否则服务器无法启动 |

> ⚠️ **注意**：`ADMIN_KEY` 是敏感信息，**不要上传到 GitHub**。

### 管理员与站长

在 `.env` 文件中配置：

| 变量 | 说明 |
|------|------|
| `ADMIN_KEY` | 管理员操作密钥（删除消息等敏感操作需验证）**必须设置** |
| `SUPER_ADMINS` | 站长用户名（多个用逗号分隔，启动时自动设为站长） |

站长拥有管理员全部权限，额外可任命/撤销管理员、编辑用户信息。

## 操作指南

### 桌面端

| 操作 | 按键/方式 |
|------|-----------|
| 移动 | `W` `A` `S` `D` 或方向键 |
| 打开消息输入 | `Enter` 或 `T` |
| 发送消息 | 输入内容后按 `Enter` |
| 取消输入 | `Esc` |
| 缩放视野 | 鼠标滚轮（0.6x ~ 3x） |
| 查看用户菜单 | 左键点击用户头像 |
| 管理员删除消息 | 右键点击消息气泡 |
| 坐标传送 | 点击底部坐标栏，输入目标坐标 |
| 切换操作提示 | `H` |

### 移动端

| 操作 | 方式 |
|------|------|
| 移动 | 左下角虚拟摇杆 |
| 缩放 | 双指捏合 |
| 查看用户菜单 | 单击用户头像 |
| 重置缩放 | 双击画布 |

### 好友与私信

1. 点击其他用户头像 → 选择「添加好友」
2. 对方在个人资料面板中接受请求
3. 好友列表中点击「私信」按钮进入一对一聊天

### 管理员操作

通过个人资料面板 → 管理面板进入，包含四个标签页：

- **公告**：发送全服广播（顶部横幅展示 6 秒）
- **用户**：搜索用户、查看详情、编辑昵称/签名、任命/撤销管理员
- **封禁/禁言**：查看封禁和禁言列表、执行封禁/禁言/解封/解禁操作
- **系统**：清理离线数据（可配置天数）、清空所有聊天记录

## 数据库结构

共 8 张表：

| 表名 | 用途 | 主要字段 |
|------|------|----------|
| `users` | 用户信息 | id, username, password_hash, nickname, avatar, x, y, color, bio, is_admin, is_super_admin, last_active, created_at |
| `friends` | 好友关系（双向） | user_id, friend_id, created_at |
| `friend_requests` | 好友申请 | from_id, to_id, status (pending/accepted/rejected), created_at |
| `blocks` | 屏蔽关系 | user_id, blocked_id, created_at |
| `messages` | 世界消息 | id, x, y, content, author, author_id, author_color, timestamp |
| `private_messages` | 私信记录 | id, from_id, to_id, content, from_name, from_avatar, from_color, timestamp |
| `banned_users` | 封禁记录 | user_id, banned_by, reason, created_at |
| `muted_users` | 禁言记录 | user_id, muted_by, reason, created_at |

## API 概览

### REST API（仅用于认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/register` | 用户注册 |
| POST | `/api/login` | 用户登录 |
| GET | `/api/users` | 在线用户列表 |
| GET | `/api/user/:id` | 用户详情 |
| GET | `/api/messages` | 消息列表（支持坐标范围筛选） |
| POST | `/api/clear-messages` | 清空消息 |

### Socket.IO 实时事件

所有业务逻辑通过 Socket.IO 双向通信完成，包括用户注册/会话恢复、位置同步、消息收发、好友系统、私信、管理员操作等。

完整 API 文档见 [`docs/API.md`](docs/API.md)。

## 部署

### Nginx 反向代理

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

### PM2 进程管理

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'mechat',
    script: './server/index.js',
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
    env: { NODE_ENV: 'production', PORT: 3000 }
  }]
};
```

```bash
pm2 start ecosystem.config.js
```

## 文档索引

| 文档 | 说明 |
|------|------|
| [`README.md`](README.md) | 项目概述、快速开始、操作指南（本文件） |
| [`docs/API.md`](docs/API.md) | REST API 与 Socket.IO 事件完整参考 |
| [`docs/DEVELOPER.md`](docs/DEVELOPER.md) | 架构设计、数据流、安全机制、性能优化、调试指南 |

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。
