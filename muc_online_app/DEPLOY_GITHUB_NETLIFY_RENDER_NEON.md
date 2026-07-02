# 航线运行中心部署说明：GitHub + Netlify + Render + Neon

## 1. GitHub

将整个项目目录推送到 GitHub。关键文件：

- `muc_online_app/public/`：Netlify 前端静态文件
- `muc_online_app/server.mjs`：Render Node.js 后端
- `muc_online_app/db.mjs`：SQLite / PostgreSQL 数据库适配层
- `muc_online_app/migrations/001_init_postgres.sql`：Neon 初始化表结构
- `muc_online_app/scripts/migrate-sqlite-to-postgres.mjs`：本地 SQLite 数据迁移到 Neon
- `netlify.toml`：Netlify 配置
- `render.yaml`：Render Blueprint 配置

## 2. Neon PostgreSQL

1. 在 Neon 创建 Project 和 Database。
2. 复制连接串，作为 Render 的 `DATABASE_URL`。
3. 首次部署前执行初始化 SQL：

```bash
psql "$DATABASE_URL" -f muc_online_app/migrations/001_init_postgres.sql
```

如没有本机 `psql`，也可以在 Neon 控制台 SQL Editor 中粘贴执行 `001_init_postgres.sql`。

## 3. Render 后端

使用 GitHub 仓库创建 Render Web Service，或使用 `render.yaml` Blueprint。

Render 环境变量：

```text
NODE_ENV=production
HOST=0.0.0.0
COOKIE_SECURE=true
UPLOAD_DIR=/var/data/uploads
DATABASE_URL=<Neon PostgreSQL connection string>
CORS_ORIGIN=https://<your-netlify-site>.netlify.app
```

Render 配置：

```text
Root Directory: muc_online_app
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
Persistent Disk Mount Path: /var/data/uploads
```

部署后验证：

```text
https://<your-render-service>.onrender.com/api/health
```

## 4. Netlify 前端

使用同一 GitHub 仓库创建 Netlify Site。

Netlify 配置已写入根目录 `netlify.toml`：

```text
Publish directory: muc_online_app/public
Build command: 生成 public/config.js
```

Netlify 环境变量：

```text
MUC_API_BASE_URL=https://<your-render-service>.onrender.com/api
```

部署后访问 Netlify 域名，登录测试：

```text
54002010 / muc2026
publisher / 123456
receiver / 123456
```

## 5. 本地数据迁移到 Neon

在本机或有 Node/npm 的环境中执行：

```bash
cd muc_online_app
npm install
DATABASE_URL="<Neon PostgreSQL connection string>" npm run migrate:sqlite-to-postgres
```

迁移脚本会迁移 SQLite 表数据。附件文件需要同步复制到 Render Persistent Disk 对应目录 `/var/data/uploads`。

Render 没有直接文件管理 UI 时，建议第一版重新上传关键附件；如必须批量迁移附件，可后续接入对象存储或临时上传脚本。

## 6. 正式验证清单

- Netlify 页面能打开并跳转 `/login`、`/dashboard`。
- 登录后 `/api/me` 保持会话，不被跨域 Cookie 拦截。
- 信息传达列表、阅读回执、收藏、发布、作废/恢复正常。
- 100MB 以内附件上传成功，Render 重启后附件仍存在。
- 系统设置、登录用户管理、批量修改正常。
- 统计分析和 Excel/CSV 导出正常。
- 删除用户后人员、接收统计、阅读回执和统计分析不残留。

## 7. 注意事项

- 正式跨域登录依赖 `SameSite=None; Secure`，所以 Render 必须使用 HTTPS 域名。
- `CORS_ORIGIN` 必须精确填写 Netlify 域名，不要带路径。
- Neon 只存业务数据和附件元数据；附件文件不存 Neon。
- Render 免费实例可能休眠，首次访问会慢；生产建议使用付费实例。
