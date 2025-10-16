#!/bin/bash

# 五子棋游戏数据库初始化脚本
# 使用方法: ./init-database.sh

# 加载环境变量
if [ -f ../.env ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
fi

# 数据库配置
DB_HOST=${DB_HOST:-"localhost"}
DB_PORT=${DB_PORT:-3306}
DB_USER=${DB_USERNAME:-"root"}
DB_PASS=${DB_PASSWORD:-""}
DB_NAME=${DB_DATABASE:-"gomoku_game"}

echo "================================"
echo "五子棋游戏数据库初始化"
echo "================================"
echo "数据库主机: ${DB_HOST}"
echo "数据库端口: ${DB_PORT}"
echo "数据库名称: ${DB_NAME}"
echo "================================"
echo ""

# 检查 mysql 命令是否可用
if ! command -v mysql &> /dev/null; then
    echo "错误: 未找到 mysql 命令，请先安装 MySQL 客户端"
    echo ""
    echo "Mac安装方法: brew install mysql-client"
    echo "然后添加到PATH: export PATH=\"/usr/local/opt/mysql-client/bin:\$PATH\""
    exit 1
fi

# 执行 SQL 文件
echo "正在初始化数据库..."
mysql -h"${DB_HOST}" -P"${DB_PORT}" -u"${DB_USER}" -p"${DB_PASS}" < schema.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ 数据库初始化成功！"
    echo ""
    echo "已创建以下表："
    echo "  - users (用户表)"
    echo "  - game_records (对战记录表)"
    echo "  - rooms (房间表)"
    echo "  - leaderboards (排行榜表)"
    echo ""
else
    echo ""
    echo "✗ 数据库初始化失败，请检查配置和网络连接"
    echo ""
fi

