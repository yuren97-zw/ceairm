# 考勤与假期模块

本模块以8792独立开发版为后续唯一来源，替代原考勤雏形。原「航线中心考勤统计项目」目录已并入考勤线工作树（分支 `codex/attendance-leave`），其 `work/` 运行数据库、凭据与验收交付物随目录保留；集成不复制本机凭证、端口、数据库路径或真实样本到其他线。

## 统一身份和权限

复用人员主档personId、统一登录及attendance数据范围。查看、统计、导出、同步分别受attendance.read、attendance.stats.read、attendance.export、attendance.record.manage控制。scope=all不绕过当前账户范围。

## 真实执行入口（考勤线工作树）

- 启动：`npm run dev`（即 `node scripts/start-attendance-8792.mjs`），从工作树根读取 `work/hybrid-validation.env`、`work/8792-stage.json`、`work/attendance-hybrid-stream.sqlite`、`work/preview-uploads`。
- 阶段：`work/8792-stage.json` 的 `stage` 只允许 `manual` / `realtime`，缺省 fail-closed；`realtime` 才开启 `ATTENDANCE_EVENTS_ENABLED`。现有realtime阶段、队列执行和必要断线补偿保留，周期同步保持关闭，考勤日期下限 2026-10-01。
- 原 `start-attendance-preview.mjs` 仅转向8792，不再启动8791。该入口不读 `DATABASE_URL`，不继承 `ATTENDANCE_ENV_FILE`。
- 隔离开发入口 `npm run start:dev` 仅适用于 `~/.codex/worktrees/` 下的 info-rbac / maintenance-personnel 两线；考勤线工作树承载真实执行，不使用该入口。

## 服务器配置

凭证通过服务器环境变量或 ATTENDANCE_ENV_FILE 指向的受限文件加载。环境文件权限应为600，不能提交、放进public或包含在发布包中。无需重置现有应用密钥。

```dotenv
DINGTALK_APP_KEY=现有应用ClientID
DINGTALK_APP_SECRET=现有应用ClientSecret
DINGTALK_OP_USER_ID=排班查询操作员的钉钉userid
DINGTALK_ROOT_DEPT_ID=659081858
DINGTALK_TRIP_REASON_FIELD_NAME=出差事由
# 有稳定的表单控件ID时优先配置，避免同名字段不明确
DINGTALK_TRIP_REASON_FIELD_ID=
DINGTALK_MONTHLY_API_BUDGET=500000
DINGTALK_REQUEST_GAP_MS=500
ATTENDANCE_SYNC_ENABLED=false
ATTENDANCE_WORKER_ENABLED=false
ATTENDANCE_EVENTS_ENABLED=false
# 仅事件接收需要，必须核实为本企业及当前应用
DINGTALK_CORP_ID=
DINGTALK_UNIFIED_APP_ID=
```

应用凭证读取权限与API调试台登录态不同，必须用此应用真实调用验证。定时建任务、执行队列、接收事件分别由三个开关独立控制，默认全部关闭。后台显示企业共70万调用额度，预算应结合其他应用用量调整。

已知必要权限：

- 考勤数据读权限 qyapi_get_attendance_data（现有应用已开通）及企业API基本权限。
- 通讯录部门信息读权限 qyapi_get_department_list。
- 通讯录部门成员读权限 qyapi_get_department_member（返回姓名、工号等人员关联字段）。
- 工作流实例读权限 Workflow.Instance.Read，用于出差审批表单详情。

仅在确有需要且得到用户确认后开通读取权限、调整数据授权范围或发布应用版本，不申请通讯录管理、考勤写入等权限。范围尽量限定青岛航线维修车间及下属部门；钉钉工作流权限的实际可读范围须在授权页核实，不能假设仅包含出差单。

## 默认关闭外部执行

以下开关只有值为true时开启；集成验收必须全部为false：

- ATTENDANCE_SYNC_ENABLED：周期任务。
- ATTENDANCE_WORKER_ENABLED：持久化队列执行。
- ATTENDANCE_EVENTS_ENABLED：真实Stream连接。
- ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED：审批到期复核。

ATTENDANCE_APPROVAL_PLANS_ENABLED=true可展示保存的审批计划，不代表开启真实同步。定时任务采用北京时间：每天12:30核对昨天（含周末），周二10:00核对前一周周一至周日，每月3日11:30核对上一完整自然月；没有班次收尾任务。按同源完整核对24小时内无新变化、且核对发生在该班次计划结束后的记录复用结果；休息或无排班日期要求在归属日期结束后核对，任务时间代表开始排队，不保证该时刻完成。

## 数据与接口

022考勤主表、023假期目录、027混合同步、028假期额度、029审批计划迁移。SQLite启动时幂等建表；PostgreSQL部署先运行项目迁移流程，随后启动。保存人员映射、日记录、必要源字段、变更历史、同步任务与租约；不保存打卡地址、经纬度或设备标识。

- GET /api/attendance/status、/days、/summary、/person、/exceptions；日期查询使用month=YYYY-MM，可选query、department、team、personId。
- POST /api/attendance/sync，JSON为from、to，范围2026-10-01至今天；返回202及任务ID。
- GET /api/attendance/export/xlsx 或 /html，scope=filtered或all；all忽略人员筛选但仍限账号数据范围。
- GET /api/attendance/capability-statuses?personId=...：预留接口，enabled=false。

四项权限分别控制查看、统计、导出、同步；无人工修改接口。所有写请求沿用项目同源验证。

## 数据与业务口径

历史原始输入、日记录、审批、额度、变更历史及同步依据完整保留。明确分类、缺失与待核对分开；未来批准审批不提前变为实际考勤。考勤分类和HTML导出使用当前规则，原始依据不覆盖。Excel和HTML的事由展示边界沿用模块规则。根据排班及有效上下班记录确定白班或夜班，不能解释的请假、缺卡、打卡冲突不会被出差用途覆盖。出差审批只读取指定“出差事由”控件，含培训或派驻分别识别；双命中为用途冲突，未命中为出差，资料缺失另行标识。当日最后计划下班点与对应有效下班打卡做差，按秒累计，最小为0，不设30分钟门槛，不扣用餐；跨夜按workDate归属；SYSTEM/NotSigned不能当真实打卡，缺失不填零。

## 固定假期类别目录

只读钉钉接口 `/topapi/attendance/vacation/type/list`，参数 `vacation_source=all`，需应用权限 `qyapi_holiday_readonly`。申请权限仍需用户确认。目录只存假种名称、来源、业务类型及单位，不读取假期余额或员工假期消费记录。目录成功缓存后所有月份均展示全部假种；历史审批中已出现但不在当前目录中的假种仍保留。没有最终归类天数时页面和Excel显示0，不把未同步日期解释为已核实出勤。

## 迁移

027混合同步、028假期额度、029审批计划迁移。PostgreSQL审批历史使用BIGSERIAL，SQLite安装转换为INTEGER PRIMARY KEY AUTOINCREMENT。已发布迁移保持不变。

SQLite转PostgreSQL必须使用scripts/migrate-sqlite-to-postgres.mjs：它按版本安装结构，拒绝有数据的旧身份目标，迁移全部attendance_表，逐表核对并恢复审批历史序号。不得通过整库替换覆盖主系统身份或业务数据。

## 验收与回退

执行npm run check、npm test、npm run build:web以及npm run test:attendance。用现有应用验证通讯录工号、跨夜排班、审批表单、撤销及补卡；比对覆盖月份及Excel/HTML。真实钉钉、实体手机和连续观察单独记录缺口。真实权限未齐时保持定时同步关闭。

正式上线前备份数据库和原发布目录；执行迁移、配置受限环境文件，验证健康检查后再启用定时同步。回退时将ATTENDANCE_SYNC_ENABLED、ATTENDANCE_WORKER_ENABLED、ATTENDANCE_EVENTS_ENABLED全部设为false并恢复原代码包，保留新增考勤表和已同步记录。最终仅保留一个真实同步执行端；不同数据库中的租约无法互相排他。切换须经确认，记录任务进度和数据切换点，并同时准备代码、数据库及队列回退。
