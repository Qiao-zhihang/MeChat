# MeChat

> 2D 开放世界实时聊天应用 —— 在无限虚拟空间中自由漫步，与世界各地的用户实时交流。

## 功能特性

### 开放世界
- 无限 2D 平面，自由探索
- WASD / 方向键移动（桌面端），虚拟摇杆（移动端）
- 鼠标滚轮 / 双指缩放视野（0.6x ~ 3x）
- 坐标传送：点击底部坐标栏输入目标坐标直达

### 即时通讯
- **世界留言**：基于位置的消息气泡，漂浮在 2D 世界中
- **好友专属消息**：仅好友可见的消息模式
- **一对一私信**：好友间私密对话，支持历史记录
- 消息持久化存储，重新上线可查看历史

### 社交系统
- 好友申请 / 接受 / 拒绝 完整流程
- 好友列表（含在线状态标识）
- 一键传送至好友身边
- 用户屏蔽（双向隔离）

### 用户系统
- 账号注册 / 登录
- 游客模式（免注册即可进入）
- 自定义昵称 / 头像 / 主题色 / 个性签名
- 会话持久化（关闭浏览器后自动恢复）

### 管理后台
- 禁言 / 踢出 / 封禁 / 解封用户
- 站长任命 / 撤销管理员
- 全服广播通知
- 消息删除（密钥验证）
- 离线数据清理

### 移动端 & PWA
- 虚拟摇杆控制
- 触摸手势支持
- 响应式布局适配
- PWA 支持（可添加到主屏幕）

### 视觉设计
- Apple 风格毛玻璃 UI（Glassmorphism）
- 液态玻璃折射特效（SVG displacement filter）
- Canvas 点阵网格背景（视差滚动效果）
- 距离自适应角色大小（近大远小）

## 技术栈

| 层级 | 技术 |
|------|------|
| **后端** | Node.js + Express + Socket.IO |
| **数据库** | sql.js (SQLite) — 内存运行 + 定时文件持久化 |
| **前端** | HTML5 Canvas + Socket.IO Client |
| **样式** | Tailwind CSS + Font Awesome + Google Fonts |
| **部署** | 支持 Nginx 反向代理 + PM2 进程管理 |

## 项目结构

```
MeChat/
├── .env.example            # 环境变量配置示例
├── .gitignore              # Git 忽略规则
├── LICENSE                 # MIT 开源许可证
├── package.json            # 项目依赖与脚本
├── index.html              # 前端单页应用（内嵌 CSS + JS）
├── server/
│   ├── index.js            # 服务端主程序（Express + Socket.IO）
│   └── database.js         # 数据库模块（SQLite CRUD 操作）
├── public/
│   ├── manifest.json       # PWA 配置
│   ├── sw.js               # Service Worker
│   ├── intro.html          # 介绍页面
│   └── *.svg/*.png         # 静态资源
└── docs/
    ├── API.md              # API 完整文档
    └── DEVELOPER.md        # 开发者文档
```

## 快速开始

### 环境要求

- **Node.js** >= 18.0.0
- **npm**（随 Node.js 安装）

### 安装与运行

```bash
# 1. 克隆项目
git clone <repository-url>
cd MeChat

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置 ADMIN_KEY（必填）

# 4. 启动服务器
npm start

# 5. 打开浏览器访问
# http://localhost:3000
```

## 配置说明

### 环境变量

复制 `.env.example` 为 `.env` 并配置：

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|:----:|------|
| `PORT` | `3000` | 否 | 服务器监听端口 |
| `ADMIN_KEY` | 无 | **是** | 管理员操作密钥，不设置则服务器无法启动 |
| `SUPER_ADMINS` | 无 | 否 | 站长用户名，多个用逗号分隔 |

> **安全提示**：`ADMIN_KEY` 是敏感信息，切勿上传到 Git 仓库。

### 权限体系

| 角色 | 权限范围 |
|------|----------|
| **普通用户** | 发送消息、添加好友、私信、修改个人资料 |
| **管理员** | 禁言/踢出/封禁/解封、删除消息（需密钥）、全服广播、清空消息、清理数据、踢出游客 |
| **站长** | 管理员全部权限 + 任命/撤销管理员、编辑任意用户信息 |

## 操作指南

### 桌面端

| 操作 | 按键 |
|------|------|
| 移动角色 | `W` `A` `S` `D` 或 方向键 |
| 打开聊天框 | `Enter` 或 `T` |
| 发送消息 | 输入内容后按 `Enter` |
| 取消输入 | `Esc` |
| 缩放视野 | 鼠标滚轮 |
| 查看用户菜单 | 左键点击用户头像 |
| 管理员删除消息 | 右键点击消息气泡 |
| 坐标传送 | 点击底部坐标栏输入坐标 |
| 切换操作提示 | `H` |

### 移动端

| 操作 | 方式 |
|------|------|
| 移动角色 | 左下角虚拟摇杆 |
| 缩放视野 | 双指捏合 |
| 查看用户菜单 | 单击用户头像 |
| 重置缩放 | 双击画布 |

### 好友与私信

1. 点击其他用户头像 → 选择「添加好友」
2. 对方在个人资料面板中接受请求
3. 好友列表中点击「私信」按钮进入一对一聊天

### 管理面板

通过个人资料面板 → 管理面板进入，包含四个标签页：

- **公告**：发送全服广播（顶部横幅展示 6 秒）
- **用户**：搜索用户、查看详情、编辑昵称/签名/头像、任命/撤销管理员
- **封禁/禁言**：查看列表、执行封禁/禁言/解封/解禁操作
- **系统**：清理离线数据（可配置天数）、清空所有聊天记录

## 数据库结构

数据存储在 SQLite 数据库文件 `data/mechat.db` 中，共 9 张表：

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `users` | 用户信息 | id, username, password_hash, nickname, avatar, x, y, color, bio, is_admin, is_super_admin |
| `friends` | 好友关系（双向） | user_id, friend_id |
| `friend_requests` | 好友申请 | from_id, to_id, status |
| `blocks` | 屏蔽关系 | user_id, blocked_id |
| `messages` | 世界消息 | id, x, y, content, author, author_id, author_color, timestamp |
| `private_messages` | 私信记录 | id, from_id, to_id, content, timestamp |
| `banned_users` | 封禁记录 | user_id, banned_by, reason |
| `muted_users` | 禁言记录 | user_id, muted_by, reason |

所有高频查询字段均已建立索引以优化性能。

## API 概览

### REST API（认证相关）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/register` | 用户注册 |
| POST | `/api/login` | 用户登录 |
| GET | `/api/users` | 在线用户列表 |
| GET | `/api/user/:id` | 用户详情 |
| GET | `/api/messages` | 消息列表（支持坐标筛选） |
| POST | `/api/clear-messages` | 清空消息（需管理员密钥） |

### Socket.IO 实时事件

全部业务逻辑通过 Socket.IO 双向通信完成，包括：
- 用户注册/会话恢复、位置同步
- 消息收发（世界消息 + 私信）
- 好友系统（申请/接受/拒绝/删除）
- 屏蔽功能
- 管理操作（禁言/踢出/封禁/广播等）

完整 API 参考：[`docs/API.md`](docs/API.md)

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

### PM2 进程管理（推荐生产环境使用）

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

## 安全机制

- **密码存储**：scrypt 哈希 + 随机盐值（每用户独立），兼容旧版 SHA256 回退
- **管理员鉴权**：敏感操作需验证 `ADMIN_KEY`
- **输入验证**：消息长度限制、类型检查、数值边界校验
- **频率限制**：消息 1 秒间隔、位置双重节流（50ms + 距离阈值）
- **HTTP 安全头**：X-Content-Type-Options、X-Frame-Options、X-XSS-Protection
- **外键约束**：启用 SQLite 外键级联删除

## 文档索引

| 文档 | 内容 |
|------|------|
| [`README.md`](README.md) | 项目概述、快速开始、操作指南（本文件） |
| [`docs/API.md`](docs/API.md) | REST API 与 Socket.IO 事件完整参考 |
| [`docs/DEVELOPER.md`](docs/DEVELOPER.md) | 架构设计、数据流、安全机制、性能优化、调试指南 |

## 许可证

[MIT License](LICENSE)
