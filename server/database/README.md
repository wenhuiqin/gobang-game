# 五子棋游戏数据库初始化指南

## 数据库配置

当前项目已配置为使用阿里云 MySQL 数据库：

- **主机地址**: `rm-2zee9z54ltx0z14sqgo.mysql.rds.aliyuncs.com`
- **端口**: `3306`
- **用户名**: `qwh`
- **数据库名**: `gomoku_game`

配置文件位置：`server/.env`

## 数据库结构

数据库包含以下表：

1. **users** - 用户表
   - 存储用户基本信息、等级、战绩等
   
2. **game_records** - 对战记录表
   - 存储每局游戏的详细记录
   
3. **rooms** - 房间表
   - 存储游戏房间信息
   
4. **leaderboards** - 排行榜表
   - 存储各类排行榜数据

## 初始化方法

### 方法一：使用脚本（推荐）

```bash
cd /Users/xuwencai/Desktop/flag/server/database
./init-database.sh
```

脚本会自动读取 `.env` 配置文件并执行数据库初始化。

### 方法二：手动执行

如果你的本机安装了 MySQL 客户端：

```bash
mysql -h rm-2zee9z54ltx0z14sqgo.mysql.rds.aliyuncs.com \
      -P 3306 \
      -u qwh \
      -p \
      < schema.sql
```

然后输入密码：`!Qwh971121`

### 方法三：使用云数据库管理工具

1. 登录阿里云控制台
2. 进入 RDS MySQL 数据库管理
3. 使用 DMS 数据管理工具
4. 复制 `schema.sql` 的内容并执行

## 验证安装

初始化完成后，可以通过以下方式验证：

```bash
mysql -h rm-2zee9z54ltx0z14sqgo.mysql.rds.aliyuncs.com \
      -P 3306 \
      -u qwh \
      -p gomoku_game \
      -e "SHOW TABLES;"
```

应该能看到以下表：
- users
- game_records
- rooms
- leaderboards

## 注意事项

1. **网络连接**：确保你的网络可以访问阿里云数据库（可能需要配置白名单）
2. **MySQL 客户端**：Mac 用户可通过 `brew install mysql-client` 安装
3. **数据备份**：重要数据请及时备份
4. **环境变量**：`.env` 文件不应提交到版本控制系统

## 常见问题

### 1. 无法连接到数据库

- 检查网络连接
- 确认 IP 是否在阿里云 RDS 白名单中
- 验证用户名和密码是否正确

### 2. MySQL 命令未找到

Mac 系统：
```bash
brew install mysql-client
export PATH="/usr/local/opt/mysql-client/bin:$PATH"
```

### 3. 权限不足

确保数据库用户 `qwh` 拥有创建数据库和表的权限。

## 联系支持

如有问题，请查看项目文档或联系开发团队。

