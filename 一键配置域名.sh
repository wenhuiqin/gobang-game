#!/bin/bash

# 定义域名和邮箱
DOMAIN="gobang.ai-image-tools.top"
EMAIL="admin@ai-image-tools.top"  # 请替换为你的邮箱

echo "🔧 开始配置域名和SSL..."

# 1. 安装Nginx
echo "📦 安装Nginx..."
sudo apt update
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# 2. 安装Certbot和Nginx插件
echo "📦 安装Certbot..."
sudo apt install -y certbot python3-certbot-nginx

# 3. 创建Nginx配置文件（先只配置HTTP，SSL由Certbot自动配置）
echo "⚙️  创建Nginx配置..."
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
sudo bash -c "cat > $NGINX_CONF <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    # API Proxy to NestJS Backend
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }

    # WebSocket Proxy to NestJS WebSocket Service
    location /game {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # Error pages
    error_page 404 /404.html;
    location = /404.html {
        internal;
    }
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        internal;
    }
}
EOF"

# 4. 启用Nginx配置
echo "✅ 启用Nginx配置..."
sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. 检查DNS是否生效
echo "🔍 检查DNS解析..."
DNS_IP=$(dig +short $DOMAIN @8.8.8.8 | tail -n1)
if [ -z "$DNS_IP" ]; then
    echo "⚠️  DNS还未生效，请等待5-30分钟"
    echo "   你可以稍后手动运行SSL申请命令："
    echo "   sudo certbot --nginx -d $DOMAIN -m $EMAIL --agree-tos --redirect --no-eff-email"
else
    echo "✅ DNS已解析到: $DNS_IP"
    echo "🔒 申请SSL证书..."
    sudo certbot --nginx -d $DOMAIN -m $EMAIL --agree-tos --redirect --no-eff-email
fi

echo ""
echo "✅ 配置完成！"
echo "📝 测试命令："
echo "   curl http://$DOMAIN/api/user/leaderboard"
echo "   如果DNS已生效，也可以测试HTTPS："
echo "   curl https://$DOMAIN/api/user/leaderboard"
