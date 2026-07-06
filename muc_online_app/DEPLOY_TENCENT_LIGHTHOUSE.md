# 航线运行中心：腾讯云轻量应用服务器部署说明

## 部署形态

第一版按单机方式部署：

- Node.js 后端统一提供前端页面和 `/api/*` 接口。
- SQLite 数据库放在服务器持久目录。
- 附件放在服务器持久目录。
- Nginx 对公网提供 `80/443`，反向代理到本机 `127.0.0.1:8787`。

不建议公网直接开放 `8787` 端口。

## 推荐目录

```text
/opt/airline-operations-center/app       应用代码
/opt/airline-operations-center/data      SQLite 数据库
/opt/airline-operations-center/uploads   附件文件
/var/log/airline-operations-center       运行日志
```

## 需要上传的文件

从本机上传 `muc_online_app` 中这些内容：

```text
server.mjs
db.mjs
package.json
public/
data/muc.sqlite
uploads/
```

不需要上传：

```text
.DS_Store
public/.DS_Store
public/index 2.html
start-local.command
```

## 服务器准备

安装 Node.js 24+、Nginx：

```bash
sudo apt update
sudo apt install -y nginx
node -v
```

如果系统 Node 版本低于 24，建议安装 NodeSource 或使用官方 Node 24 二进制包。

创建目录：

```bash
sudo mkdir -p /opt/airline-operations-center/app
sudo mkdir -p /opt/airline-operations-center/data
sudo mkdir -p /opt/airline-operations-center/uploads
sudo mkdir -p /var/log/airline-operations-center
```

把本机数据库复制到：

```text
/opt/airline-operations-center/data/muc.sqlite
```

把本机附件目录内容复制到：

```text
/opt/airline-operations-center/uploads/
```

安装依赖：

```bash
cd /opt/airline-operations-center/app
npm install --omit=dev
```

## 环境变量

生产环境建议：

```text
NODE_ENV=production
HOST=127.0.0.1
PORT=8787
DB_PATH=/opt/airline-operations-center/data/muc.sqlite
UPLOAD_DIR=/opt/airline-operations-center/uploads
COOKIE_SECURE=false
```

配置 HTTPS 后，将 `COOKIE_SECURE` 改为：

```text
COOKIE_SECURE=true
```

## systemd 服务

新建：

```bash
sudo nano /etc/systemd/system/airline-operations-center.service
```

内容：

```ini
[Unit]
Description=Airline Operations Center
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/airline-operations-center/app
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=8787
Environment=DB_PATH=/opt/airline-operations-center/data/muc.sqlite
Environment=UPLOAD_DIR=/opt/airline-operations-center/uploads
Environment=COOKIE_SECURE=false
ExecStart=/usr/bin/node server.mjs
Restart=always
RestartSec=5
StandardOutput=append:/var/log/airline-operations-center/app.log
StandardError=append:/var/log/airline-operations-center/error.log

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable airline-operations-center
sudo systemctl start airline-operations-center
sudo systemctl status airline-operations-center
```

本机验证：

```bash
curl http://127.0.0.1:8787/api/health
```

## Nginx 反向代理

新建：

```bash
sudo nano /etc/nginx/sites-available/airline-operations-center
```

内容：

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 120m;
    client_body_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用：

```bash
sudo ln -s /etc/nginx/sites-available/airline-operations-center /etc/nginx/sites-enabled/airline-operations-center
sudo nginx -t
sudo systemctl reload nginx
```

腾讯云安全组开放：

```text
80
443
```

不要对公网开放：

```text
8787
```

## 数据备份

建议每天备份数据库和附件。可复制仓库中的脚本：

```bash
sudo mkdir -p /opt/airline-operations-center/backups
sudo cp /opt/airline-operations-center/app/deploy/tencent/backup-airline-operations-center.sh /opt/airline-operations-center/backup.sh
sudo chmod +x /opt/airline-operations-center/backup.sh
sudo /opt/airline-operations-center/backup.sh
```

如需每天凌晨 2 点自动备份，可加入 crontab：

```bash
0 2 * * * /opt/airline-operations-center/backup.sh >> /var/log/airline-operations-center/backup.log 2>&1
```

## 验收清单

- `curl http://127.0.0.1:8787/api/health` 返回 `{ ok: true }`。
- 公网 IP 或域名能打开登录页。
- `54002010 / muc2026` 可以登录管理员。
- 信息传达列表、收藏、阅读回执、发布、作废/恢复正常。
- 用户管理和批量修改正常。
- 附件上传、预览、下载正常。
- 上传 100MB 以内附件不被 Nginx 拦截。
- 重启服务和重启服务器后，数据库与附件仍存在。
