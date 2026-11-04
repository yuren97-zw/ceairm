# 本地集成验收与安全交付

## 环境身份

A/B/C继续各自使用独立SQLite。集成环境使用PostgreSQL16、127.0.0.1:55432、ceairm_integration；应用8800。禁止连接生产或复制真实账户、会话及附件。未知分支、端口冲突和越界路径应修正配置，不得绕过检查。

安装使用官方Postgres.app PostgreSQL16，用户目录安装，不改变PATH或设置开机自启。首次创建新状态目录：

```sh
node scripts/setup-local-integration.mjs /绝对路径/Postgres.app/Contents/Versions/16/bin /绝对路径/新的私有状态目录
```

已有状态目录会被拒绝，避免覆盖配置或数据库。config.json和admin.json权限0600，父目录0700，禁止Git、分享或打印。应用账户无超级用户、建库、建角色权限。专用集群明确HBA认证；普通集成账户不能跨库。

本机已安装路径及私有状态目录见本次审计。再次运行数据库使用配置中的bin/data执行pg_ctl -D DATA -l LOG -w start；停止使用pg_ctl -D DATA -m fast -w stop。仅操作这个专用集群，不以killall结束PostgreSQL。当前数据不自动清空；重建须重新审批和备份。

## 固定提交与工件

PR针对最新main的模拟合并结果测试，记录基线/分支/结果SHA。仅明确批准同批验收时才整合额外分支；不把历史集成工作树当作最新版本。

从干净、固定提交的目录构建；本地Mac包仅用于本机，Linux CI验证Linux包：

```sh
bash deploy/tencent/build-release.sh integration-完整SHA /绝对路径/package.tar.gz
MUC_INTEGRATION_CONFIG=/私有目录/config.json node scripts/check-integration-package.mjs /绝对路径/package.tar.gz 完整SHA --check
```

`--serve`在8800保留预览，Ctrl-C仅停止本次应用。校验摘要、版本、解包路径及受限npm链接；执行两次迁移，验证健康、未登录拒绝、合成管理员登录及主要接口。集成Cookie独立，全部真实同步关闭。应用初始化密码只保留在私有配置，不能写进日志。CI使用自己创建的临时数据库及非超级用户，结束仅清理自身资源。

## 数据库与业务验证

```sh
MUC_INTEGRATION_CONFIG=/私有目录/config.json node scripts/check-local-postgres.mjs attendance
MUC_INTEGRATION_CONFIG=/私有目录/config.json node scripts/check-local-postgres.mjs server
MUC_INTEGRATION_CONFIG=/私有目录/config.json node scripts/check-local-postgres.mjs upgrade
MUC_INTEGRATION_CONFIG=/私有目录/config.json node scripts/check-integration-restore.mjs
node scripts/benchmark-attendance-loading.mjs
```

适配层完整应用元数据固定查询public，不能靠search_path隔离完整应用测试。HTTP/升级用全新临时库和独立角色，默认拒绝同名已存在资源，finally仅清理自己创建的库和角色。恢复演练使用另一个临时库，核对全部表数据指纹、索引、约束及源库不变，保留私有快照和证明。考勤专项可以使用现有随机schema检查。

测试覆盖RBAC、范围、维修报工/自动确认/复核、信息、考勤/假期及并发。200人基准采用合成数据，不作为云端速度承诺。后台到期/审批/重试使用模拟与可控时间验证，不调用钉钉或COS。

## 发布与回滚边界

旧迁移不可原地修改或删除，新迁移须编号唯一，附旧代码兼容性说明。合并前基线变化需重测。最终生产工件在上传发布前用PostgreSQL检查；本次不运行Release工作流、不合并main、不调整仓库保护设置。

回滚代码不等于恢复数据库。有新增业务写入后禁止用旧备份覆盖；先保存现场，确认兼容性、增量数据及恢复方案。生产PITR另设专项，现有加密备份和定时器不在本次重新安装。

CI失败时PR保持草稿。手机实机、真实外部服务和生产验收缺口必须列出，不以本机通过替代。
