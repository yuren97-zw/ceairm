# 考勤与假期模块

本模块以8792独立开发版为后续唯一来源，替代原考勤雏形。集成不复制本机凭证、端口、数据库路径或真实样本。原开发验收记录在受控备份保存，不随源码发布。

## 统一身份和权限

复用人员主档personId、统一登录及attendance数据范围。查看、统计、导出、同步分别受attendance.read、attendance.stats.read、attendance.export、attendance.record.manage控制。scope=all不绕过当前账户范围。

## 默认关闭外部执行

以下开关只有值为true时开启；集成验收必须全部为false：

- ATTENDANCE_SYNC_ENABLED：周期任务。
- ATTENDANCE_WORKER_ENABLED：持久化队列执行。
- ATTENDANCE_EVENTS_ENABLED：真实Stream连接。
- ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED：审批到期复核。

ATTENDANCE_APPROVAL_PLANS_ENABLED=true可展示保存的审批计划，不代表开启真实同步。凭证使用受限环境文件，禁止进入Git、public或发布包。不要使用其他项目的本机启动脚本部署。

## 数据与业务口径

历史原始输入、日记录、审批、额度、变更历史及同步依据完整保留。明确分类、缺失与待核对分开；未来批准审批不提前变为实际考勤。考勤分类和HTML导出使用当前规则，原始依据不覆盖。Excel和HTML的事由展示边界沿用模块规则。

## 迁移

新增027混合同步、028假期额度、029审批计划迁移。PostgreSQL审批历史使用BIGSERIAL，SQLite安装转换为INTEGER PRIMARY KEY AUTOINCREMENT。已发布迁移保持不变。

SQLite转PostgreSQL必须使用scripts/migrate-sqlite-to-postgres.mjs：它按版本安装结构，拒绝有数据的旧身份目标，迁移全部attendance_表，逐表核对并恢复审批历史序号。不得通过整库替换覆盖主系统身份或业务数据。

## 验收与切换

先在副本完成SQLite/PostgreSQL16、权限、规则、导出、队列恢复及移动布局验收。真实钉钉、实体手机和连续观察单独记录缺口。最终仅保留一个真实同步执行端；不同数据库中的租约无法互相排他。切换须经确认，记录任务进度和数据切换点，并同时准备代码、数据库及队列回退。
