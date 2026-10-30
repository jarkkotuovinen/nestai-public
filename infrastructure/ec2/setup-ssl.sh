#!/bin/bash
set -e

# Install nginx
yum install -y nginx

# Generate self-signed certificate
mkdir -p /etc/nginx/ssl
openssl req -x509 -newkey rsa:4096 -keyout /etc/nginx/ssl/key.pem -out /etc/nginx/ssl/cert.pem -days 365 -nodes -subj "/C=FI/ST=Oulu/L=Oulu/O=NestAI/CN=$(ec2-metadata --public-ipv4 | cut -d ' ' -f 2)"

# Configure nginx for WebSocket with SSL
cat > /etc/nginx/conf.d/websocket.conf << 'EOF'
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 443 ssl;
    server_name _;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeouts
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF

# Start and enable nginx
systemctl enable nginx
systemctl start nginx

echo "SSL WebSocket proxy configured successfully"
