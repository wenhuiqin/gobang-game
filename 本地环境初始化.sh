#!/bin/bash

# 本地开发环境初始化脚本

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   五子棋小游戏 - 本地环境初始化${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. 检查Node.js
echo -e "${YELLOW}📦 检查Node.js...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✅ Node.js已安装: ${NODE_VERSION}${NC}"
else
    echo -e "${RED}❌ Node.js未安装${NC}"
    echo -e "请安装Node.js v16+: https://nodejs.org/"
    exit 1
fi
echo ""

# 2. 检查npm
echo -e "${YELLOW}📦 检查npm...${NC}"
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}✅ npm已安装: ${NPM_VERSION}${NC}"
else
    echo -e "${RED}❌ npm未安装${NC}"
    exit 1
fi
echo ""

# 3. 检查Redis
echo -e "${YELLOW}💾 检查Redis...${NC}"
if command -v redis-cli &> /dev/null; then
    REDIS_PING=$(redis-cli ping 2>/dev/null || echo "FAILED")
    if [ "$REDIS_PING" = "PONG" ]; then
        echo -e "${GREEN}✅ Redis运行中${NC}"
    else
        echo -e "${YELLOW}⚠️  Redis未运行，尝试启动...${NC}"
        redis-server --daemonize yes 2>/dev/null || true
        sleep 1
        REDIS_PING=$(redis-cli ping 2>/dev/null || echo "FAILED")
        if [ "$REDIS_PING" = "PONG" ]; then
            echo -e "${GREEN}✅ Redis已启动${NC}"
        else
            echo -e "${RED}❌ Redis启动失败${NC}"
            echo -e "请手动安装Redis: brew install redis"
            exit 1
        fi
    fi
else
    echo -e "${RED}❌ Redis未安装${NC}"
    echo -e "安装命令: brew install redis"
    exit 1
fi
echo ""

# 4. 配置后端环境
echo -e "${YELLOW}⚙️  配置后端环境...${NC}"
cd server

# 创建.env文件（如果不存在）
if [ ! -f .env ]; then
    cat > .env << 'EOF'
NODE_ENV=development

# 微信小游戏配置
WECHAT_APP_ID=wx4379feb1257bd826
WECHAT_APP_SECRET=8ecb76c6b50f69136e1a7893d53e2f6d

# 云数据库配置
DB_HOST=rm-2zee9z54ltx0z14sqgo.mysql.rds.aliyuncs.com
DB_PORT=3306
DB_USERNAME=qwh
DB_PASSWORD=!Qwh971121
DB_DATABASE=gobang

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT配置
JWT_SECRET=gobang-game-secret-key-2025-development
JWT_EXPIRES_IN=7d

# 服务器配置
PORT=3000
WS_PORT=3001
EOF
    echo -e "${GREEN}✅ 已创建.env配置文件${NC}"
else
    echo -e "${GREEN}✅ .env配置文件已存在${NC}"
fi

# 安装依赖
echo -e "${YELLOW}📦 安装后端依赖...${NC}"
npm install
echo -e "${GREEN}✅ 后端依赖安装完成${NC}"

# 编译TypeScript
echo -e "${YELLOW}🔨 编译TypeScript...${NC}"
npm run build
echo -e "${GREEN}✅ 编译完成${NC}"

cd ..
echo ""

# 5. 初始化数据库（可选）
echo -e "${YELLOW}🗄️  数据库初始化（可选）${NC}"
read -p "是否需要初始化云MySQL数据库？(y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v mysql &> /dev/null; then
        echo -e "${YELLOW}正在连接云MySQL...${NC}"
        mysql -h rm-2zee9z54ltx0z14sqgo.mysql.rds.aliyuncs.com \
              -u qwh \
              -p'!Qwh971121' \
              gobang < server/database/schema.sql
        echo -e "${GREEN}✅ 数据库初始化完成${NC}"
    else
        echo -e "${YELLOW}⚠️  MySQL客户端未安装，跳过数据库初始化${NC}"
        echo -e "可手动执行: mysql -h rm-2zee9z54ltx0z14sqgo.mysql.rds.aliyuncs.com -u qwh -p gobang < server/database/schema.sql"
    fi
fi
echo ""

# 6. 完成
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   ✅ 初始化完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "🚀 启动开发服务器："
echo -e "   ${YELLOW}cd server && npm run start:dev${NC}"
echo ""
echo -e "📊 启动后访问："
echo -e "   API: ${YELLOW}http://localhost:3000/api${NC}"
echo -e "   健康检查: ${YELLOW}http://localhost:3000/api/user/leaderboard${NC}"
echo ""
echo -e "📱 打开微信开发者工具："
echo -e "   导入项目: ${YELLOW}client-cocos${NC}"
echo ""

