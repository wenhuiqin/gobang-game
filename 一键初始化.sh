#!/bin/bash

echo "🚀 五子棋小游戏 - 一键初始化脚本"
echo "================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查MySQL
echo "📝 第1步：检查MySQL..."
if ! command -v mysql &> /dev/null; then
    echo -e "${RED}❌ MySQL未安装，请先安装MySQL${NC}"
    exit 1
fi
echo -e "${GREEN}✅ MySQL已安装${NC}"

# 创建数据库
echo ""
echo "📝 第2步：创建数据库..."
mysql -u root -p'12345678' -e "CREATE DATABASE IF NOT EXISTS gomoku CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 数据库创建成功${NC}"
else
    echo -e "${RED}❌ 数据库创建失败，请检查MySQL密码${NC}"
    exit 1
fi

# 导入表结构
echo ""
echo "📝 第3步：导入数据库表结构..."
mysql -u root -p'12345678' gomoku < server/database/schema.sql 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 表结构导入成功${NC}"
else
    echo -e "${RED}❌ 表结构导入失败${NC}"
    exit 1
fi

# 检查Node.js
echo ""
echo "📝 第4步：检查Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js未安装，请先安装Node.js 18+${NC}"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js已安装 ($NODE_VERSION)${NC}"

# 安装依赖
echo ""
echo "📝 第5步：安装后端依赖（可能需要1-2分钟）..."
cd server
if [ ! -d "node_modules" ]; then
    npm install
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ 依赖安装成功${NC}"
    else
        echo -e "${RED}❌ 依赖安装失败${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  依赖已存在，跳过安装${NC}"
fi
cd ..

# 检查Redis
echo ""
echo "📝 第6步：检查Redis..."
if ! command -v redis-cli &> /dev/null; then
    echo -e "${YELLOW}⚠️  Redis未安装，某些功能可能受限${NC}"
    echo -e "${YELLOW}   建议安装：brew install redis${NC}"
else
    redis-cli ping > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Redis运行正常${NC}"
    else
        echo -e "${YELLOW}⚠️  Redis未启动，正在启动...${NC}"
        redis-server --daemonize yes 2>/dev/null
        sleep 2
        redis-cli ping > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Redis启动成功${NC}"
        else
            echo -e "${YELLOW}⚠️  Redis启动失败，请手动启动：redis-server${NC}"
        fi
    fi
fi

# 完成
echo ""
echo "================================"
echo -e "${GREEN}🎉 初始化完成！${NC}"
echo ""
echo "下一步："
echo "1. 启动后端："
echo "   cd server && npm run start:dev"
echo ""
echo "2. 打开微信开发者工具，导入 client 目录"
echo ""
echo "3. 开始游戏！"
echo ""

