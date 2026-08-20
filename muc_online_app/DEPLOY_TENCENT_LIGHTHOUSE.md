# 航线运行中心生产部署说明

## 目标架构

- 域名：`https://www.ceairm.com`
- 主机：腾讯云轻量应用服务器 Ubuntu 24.04，公网 IP `120.53.227.226`
- 网关：Nginx，仅开放 `22/80/443`
- 应用：Node.js 24，监听 `127.0.0.1:8787`
- 数据库：本机 PostgreSQL，仅监听本机
- 附件：腾讯云私有 COS，浏览器使用短时签名地址直传和下载
- 发布：版本目录 + `current`软链接，健康检查失败自动回滚

生产目录：

```text
/opt/airline-operations-center/app/current
/opt/airline-operations-center/releases
/opt/airline-operations-center/shared/.env
/opt/airline-operations-center/scripts
/opt/airline-operations-center/backups
/var/log/airline-operations-center
```

## 上线前云配置

1. 为`ceairm.com`和`www.ceairm.com`添加 A 记录，均指向`120.53.227.226`。
2. 轻量服务器防火墙只开放`22/80/443`，不要开放`8787/5432`。
3. 创建私有 COS 存储桶和独立备份前缀。
4. 为应用创建最小权限 CAM 密钥，只允许目标存储桶的对象读写；备份账户只允许备份前缀。
5. COS CORS 允许来源`https://www.ceairm.com`，方法`PUT/GET/HEAD`，请求头`*`，暴露`ETag,Content-Length`。

## 首次初始化

将`deploy/tencent`上传到服务器临时目录，然后以 root 执行：

```bash
export POSTGRES_APP_PASSWORD='使用密码管理器生成的高强度密码'
sudo -E bash deploy/tencent/bootstrap.sh
```

复制运行文件：

```bash
sudo install -m 0750 deploy/tencent/deploy.sh /opt/airline-operations-center/scripts/deploy.sh
sudo install -m 0750 deploy/tencent/rollback.sh /opt/airline-operations-center/scripts/rollback.sh
sudo install -m 0750 deploy/tencent/migrate.sh /opt/airline-operations-center/scripts/migrate.sh
sudo install -m 0750 deploy/tencent/health-check.sh /opt/airline-operations-center/scripts/health-check.sh
sudo install -m 0750 deploy/tencent/backup-airline-operations-center.sh /opt/airline-operations-center/scripts/backup.sh
sudo install -m 0644 deploy/tencent/airline-operations-center.service /etc/systemd/system/airline-operations-center.service
sudo install -m 0644 deploy/tencent/logrotate-airline-operations-center /etc/logrotate.d/airline-operations-center
```

根据`.env.example`创建`/opt/airline-operations-center/shared/.env`，权限设为`0640 root:airline`。不得把密钥提交到 Git。

## 首次数据迁移

迁移前先复制本机 SQLite 和附件目录到服务器的受限临时目录。执行：

```bash
set -a
source /opt/airline-operations-center/shared/.env
set +a
SQLITE_PATH=/secure-import/muc.sqlite npm run migrate:sqlite-to-postgres
UPLOAD_DIR=/secure-import/uploads npm run migrate:attachments-to-cos
```

迁移附件只会复制到 COS 并更新 PostgreSQL 指针，不删除本地原件。核对数据和附件后，再将原件转入离线归档。

## 构建与发布

发布分支必须先完成评审和测试，再合并`main`。合并不会自动部署；生产发布需要人工执行。

本机构建：

```bash
cd muc_online_app
bash deploy/tencent/build-release.sh 1.0.0-20260820
```

将生成的压缩包和`.sha256`上传到服务器，核对摘要后执行：

```bash
sha256sum -c airline-operations-center-1.0.0-20260820.tar.gz.sha256
sudo /opt/airline-operations-center/scripts/deploy.sh \
  /tmp/airline-operations-center-1.0.0-20260820.tar.gz \
  1.0.0-20260820
```

发布脚本依次执行数据库备份、解压、安装依赖、迁移、切换版本、重启和健康检查。健康检查失败会恢复旧版本。数据库迁移必须保持向后兼容；涉及不可逆数据变更时先人工快照。

回滚：

```bash
sudo /opt/airline-operations-center/scripts/rollback.sh
# 或指定版本目录
sudo /opt/airline-operations-center/scripts/rollback.sh /opt/airline-operations-center/releases/VERSION
```

## HTTPS

DNS 生效后先让 Nginx 使用仅 HTTP 的临时站点，再申请证书：

```bash
sudo certbot certonly --nginx -d ceairm.com -d www.ceairm.com
sudo install -m 0644 deploy/tencent/nginx-airline-operations-center.conf \
  /etc/nginx/sites-available/airline-operations-center
sudo ln -sfn /etc/nginx/sites-available/airline-operations-center \
  /etc/nginx/sites-enabled/airline-operations-center
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

HTTP 必须 301 跳转到`https://www.ceairm.com`。

## 备份与监控

备份脚本生成 PostgreSQL 自定义格式备份及 SHA-256，并在配置`COS_BACKUP_URI`后上传异地 COS。脚本不自动删除历史备份。

```cron
0 2 * * * /opt/airline-operations-center/scripts/backup.sh >> /var/log/airline-operations-center/backup.log 2>&1
```

每次重大变更前创建腾讯云磁盘快照。至少每季度在隔离数据库演练一次恢复。

健康检查：

```bash
curl https://www.ceairm.com/api/health
```

返回值必须包含`ok:true`、`status:ok`、`database:postgres`、当前`version`和 COS 配置状态。

## 验收清单

- 域名和 HTTPS 正常，HTTP 自动跳转。
- 公网无法访问`8787`和`5432`。
- 生产环境没有演示账号和默认密码。
- 登录、权限、维修派工、报工、复核、统计及 SSE 同步正常。
- 附件直传、预览、下载和删除正常，COS 存储桶不可匿名访问。
- PostgreSQL 行数与 SQLite 源数据核对一致。
- 服务及服务器重启后数据不丢失。
- 发布失败可自动回滚，人工回滚可用。
- 本地和异地备份均存在，恢复演练通过。

生产服务器禁止直接修改当前版本代码，禁止把密钥写入仓库，禁止在未验证备份前删除历史数据。
