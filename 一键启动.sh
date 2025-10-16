#!/bin/bash

echo "================================"
echo "五子棋小游戏 - 一键启动脚本"
echo "================================"
echo ""

# 步骤1：创建数据库
echo "📦 步骤1/3: 创建数据库..."
mysql -uroot -p12345678 -e "CREATE DATABASE IF NOT EXISTS gobang CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ 数据库创建成功"
else
    echo "⚠️  数据库可能已存在，继续..."
fi

# 步骤2：导入表结构
echo ""
echo "📊 步骤2/3: 导入数据库表结构..."
mysql -uroot -p12345678 gobang < server/database/schema.sql 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ 表结构导入成功"
else
    echo "⚠️  表可能已存在，继续..."
fi

# 步骤3：安装依赖并启动
echo ""
echo "📦 步骤3/3: 安装依赖并启动服务..."
cd server

if [ ! -d "node_modules" ]; then
    echo "正在安装依赖（首次运行需要几分钟）..."
    npm install
fi

echo ""
echo "✅ 所有准备工作完成！"
echo ""

# 检查并清理3000端口
echo "🔍 检查3000端口占用情况..."
PORT_PID=$(lsof -ti :3000)
if [ ! -z "$PORT_PID" ]; then
    echo "⚠️  检测到3000端口被占用 (PID: $PORT_PID)"
    echo "🧹 正在清理端口..."
    kill -9 $PORT_PID 2>/dev/null
    sleep 1
    echo "✅ 端口已清理"
else
    echo "✅ 端口可用"
fi

echo ""
echo "🚀 正在启动服务..."
echo "================================"
echo "访问地址: http://localhost:3000"
echo "按 Ctrl+C 停止服务"
echo "================================"
echo ""

npm run start:dev

