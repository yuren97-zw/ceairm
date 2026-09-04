# 正式运行前的一次性清理

此工具不属于部署、启动或数据库迁移流程。仅支持 PostgreSQL；绝不对本地 SQLite 执行。
保留 `54002010` 原身份、姓名、班组、职能、密码和权限，保留全部工时规则及已审核系统设置。
固化项目、全部其他业务记录及账号都会删除。数据库先备份并恢复到隔离数据库验证；附件文件不备份，永久删除后无法恢复。

## 执行前提

1. 部署并验证移除演示入口的版本。确认生产设置 `NODE_ENV=production`，域名和目标数据库正确。
2. 在正式网站修改 `54002010` 密码并实际验证登录；不把密码发到聊天、命令参数或代码中。
3. 从受保护的服务环境载入 `DATABASE_URL`、`PGSSLMODE`、COS 和 `UPLOAD_DIR`；不要输出环境变量值。
4. 设置 `RESET_EXPECTED_HOST` 为核实的服务器 hostname，`RESET_EXPECTED_DATABASE` 为核实的业务库名称。
5. 数据库连接账号需可导出、创建/删除隔离校验库及恢复备份；缺权限时停止，不绕过恢复验证。
6. 进入维护窗口，停止 `airline-operations-center-deploy.timer`，等待并停止其部署 service，然后停止应用 service。不停止 PostgreSQL。

## 核对清单

在已发布应用目录执行下列命令。目录必须是新的、位于发布目录以外的绝对路径；工具默认不删除数据。

```sh
node scripts/reset-production-data.mjs inspect /opt/airline-operations-center/backups/launch-reset-YYYYMMDD
```

核对数据库身份、所有表数量、管理员资料、附件路径及存储环境。清单不含密码，只含数据指纹和文件索引。
额外表、未知设置、未知附件类型、默认密码或管理员身份不符均会阻止清理，必须查明原因后处理。
核对 COS `attachments/` 前缀及本地附件目录是否有不在索引中的遗留文件；存在时单独列出并审核，不能宣称这些孤立文件已被本工具删除，也不得清空整个存储桶。

## 清理数据库

将输出的清单摘要设置为 `RESET_CONFIRM`，并在实际验证正式密码后设置 `RESET_PASSWORD_LOGIN_VERIFIED=yes`。

```sh
node scripts/reset-production-data.mjs execute /opt/airline-operations-center/backups/launch-reset-YYYYMMDD
```

工具先检查三项服务都已停止、数据未变化、附件环境一致，然后生成 `database.dump`，恢复到随机命名的隔离数据库并逐表比对数据指纹。
恢复验证成功后才在一个事务内删除业务数据、其他账号和旧日志，检查规则未变，并写入一条正式初始化审计。
`database-cleared.json` 是后续附件删除所需回执。失败保持维护状态，不自动恢复应用、不自动重试清空。
若数据库事务已提交但回执写入失败，必须人工核对初始化审计及备份，不重新执行清理。

## 永久删除附件

这是独立的、不可回滚步骤。确认数据库清理成功后设置 `RESET_DELETE_FILES=PERMANENT`：

```sh
node scripts/reset-production-data.mjs delete-files /opt/airline-operations-center/backups/launch-reset-YYYYMMDD
```

仅删除清单中的应用附件，逐项写入 `files-deleted.jsonl`。COS 删除后验证对象不存在；不修改数据库备份。
如果 COS 开启过版本控制，工具会停止，需另行审核所有对象版本及删除标记，不能用普通 DELETE 冒充永久删除。
失败时根据清单和日志重试本阶段，不重复清数据库。任何已删除的附件原文件都无法从数据库备份恢复。

## 验收及恢复服务

- 确认唯一账号是 `54002010`、全权限启用，原人员资料保留，其他账号和旧会话失效。
- 所有业务记录和固化项目为空，工时/架次为零，规则及分类与清理前指纹一致。
- 原附件签名链接无法访问；核对附件清单数量及孤立文件处理结果，避免漏报。
- 启动应用，验证正式密码登录、管理员人员选择、空数据页、健康检查及 COS 配置。
- 重启一次应用，确认不会再生测试人员和内容，浏览器加载新的缓存版本。
- 验收通过后恢复自动部署 timer；不要在验收前开放业务写入。
- 异常时保持维护状态，按已验证数据库备份恢复；附件已永久删除的事实必须单独告知，不能承诺完整文件回滚。

数据库备份及清理清单留存在受限服务器目录，不进入 GitHub。此流程不清理本地测试数据库。
