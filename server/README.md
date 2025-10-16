# 五子棋微信小游戏 - 后端服务

基于 NestJS + TypeScript + MySQL + Redis 开发的五子棋游戏后端服务。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并修改配置：

```bash
cp .env.example .env
```

### 3. 创建数据库

```bash
mysql -u root -p
CREATE DATABASE gomoku CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. 启动服务

```bash
# 开发模式
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

## 项目结构

```
src/
├── common/              # 公共模块
│   ├── config/          # 配置文件
│   ├── constants/       # 常量定义
│   ├── decorators/      # 装饰器
│   ├── filters/         # 异常过滤器
│   ├── guards/          # 守卫
│   └── interceptors/    # 拦截器
├── modules/             # 业务模块
│   ├── auth/            # 认证模块
│   ├── user/            # 用户模块
│   ├── game/            # 游戏模块
│   └── ai/              # AI模块
├── shared/              # 共享模块
│   ├── redis/           # Redis服务
│   └── wechat/          # 微信服务
├── utils/               # 工具函数
├── app.module.ts        # 根模块
└── main.ts              # 入口文件
```

## 技术栈

- **框架：** NestJS 10.x
- **语言：** TypeScript
- **数据库：** MySQL 8.0
- **缓存：** Redis 7.x
- **ORM：** TypeORM
- **实时通信：** Socket.io

## API文档

### 认证接口

#### POST /api/auth/login
微信登录

**请求体：**
```json
{
  "code": "微信登录code",
  "userInfo": {
    "nickName": "昵称",
    "avatarUrl": "头像URL"
  }
}
```

**响应：**
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "token": "jwt_token",
    "user": {
      "id": "1",
      "nickname": "玩家昵称",
      "avatarUrl": "头像URL",
      "level": 1,
      "totalGames": 0,
      "winGames": 0,
      "winRate": 0
    }
  }
}
```

### 用户接口

#### GET /api/user/profile
获取用户信息（需要认证）

**Headers:**
```
Authorization: Bearer {token}
```

#### GET /api/user/history?page=1&limit=20
获取用户战绩历史（需要认证）

## WebSocket事件

### 客户端 -> 服务端

#### join_room
加入房间
```javascript
socket.emit('join_room', {
  roomId: 'room_123',
  userId: '1'
})
```

#### start_ai_game
开始AI对战
```javascript
socket.emit('start_ai_game', {
  roomId: 'room_123',
  userId: '1',
  difficulty: 1,  // 1简单 2中等 3困难
  playerColor: 'black'  // 'black' or 'white'
})
```

#### make_move
落子
```javascript
socket.emit('make_move', {
  roomId: 'room_123',
  userId: '1',
  x: 7,
  y: 7
})
```

### 服务端 -> 客户端

#### game_started
游戏开始
```javascript
socket.on('game_started', (data) => {
  // data.gameState
})
```

#### opponent_move
对手落子
```javascript
socket.on('opponent_move', (data) => {
  // data: { x, y, userId }
})
```

#### ai_move
AI落子
```javascript
socket.on('ai_move', (data) => {
  // data: { x, y }
})
```

#### game_over
游戏结束
```javascript
socket.on('game_over', (data) => {
  // data: { winner, gameState, reason }
})
```

## 开发规范

请严格遵守 `docs/开发规范文档.md` 中的规范：

- ⚠️ **禁止硬编码**：所有常量必须定义在 `src/common/constants/` 中
- 📦 **模块化开发**：遵循NestJS模块化架构
- ✅ **代码规范**：统一的命名、注释、格式
- 🔒 **安全第一**：输入验证、SQL注入防护

## License

MIT

