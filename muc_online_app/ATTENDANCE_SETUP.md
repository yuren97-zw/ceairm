# 钉钉考勤模块接入与运行

功能入口为现有一级考勤管理，不单独维护人员主数据。前端和全部导出都由后端执行考勤数据范围校验。人员与能力状态提供器首期返回 enabled=false。

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
```

应用凭证读取权限与API调试台登录态不同，必须用此应用真实调用验证。自动任务只有在四个必要配置齐备且ATTENDANCE_SYNC_ENABLED=true时启动。手动同步仍受考勤维护权限约束。后台显示企业共70万调用额度，默认本应用预算8000；示例500000是拟分配的上限，不是已授予独占配额，应结合其他应用用量调整。

首次全量回补和21:00回查会逐人逐日读取审批及考勤，133人回查两个月约8000次基础日查询，另有排班、分页、通讯录、审批详情请求。按500ms请求间隔和单任务调度需要较长时间，页面显示持久化进度，不能承诺10:00或21:00立即完成。

已知必要权限：

- 考勤数据读权限 qyapi_get_attendance_data（现有应用已开通）及企业API基本权限。
- 通讯录部门信息读权限 qyapi_get_department_list。
- 通讯录部门成员读权限 qyapi_get_department_member（返回姓名、工号等人员关联字段）。
- 工作流实例读权限 Workflow.Instance.Read，用于出差审批表单详情。

仅在确有需要且得到用户确认后开通读取权限、调整数据授权范围或发布应用版本，不申请通讯录管理、考勤写入等权限。范围尽量限定青岛航线维修车间及下属部门；钉钉工作流权限的实际可读范围须在授权页核实，不能假设仅包含出差单。

## 数据与接口

新增022_attendance.sql。SQLite启动时幂等建表；PostgreSQL部署先运行项目迁移流程，随后启动。保存人员映射、日记录、必要源字段、变更历史、同步任务与租约；不保存打卡地址、经纬度或设备标识。

GET /api/attendance/status、/days、/summary、/person、/exceptions；日期查询使用month=YYYY-MM，可选query、department、team、personId。
POST /api/attendance/sync，JSON为from、to，范围2026-09-01至今天；返回202及任务ID。
GET /api/attendance/export/xlsx 或 /html，scope=filtered或all；all忽略人员筛选但仍限账号数据范围。
GET /api/attendance/capability-statuses?personId=...：预留接口，enabled=false。

四项权限分别控制查看、统计、导出、同步；无人工修改接口。所有写请求沿用项目同源验证。

## 分类与加班

根据排班及有效上下班记录确定白班或夜班，不能解释的请假、缺卡、打卡冲突不会被出差用途覆盖。出差审批只读取指定“出差事由”控件，含培训或派驻分别识别；双命中为用途冲突，未命中为出差，资料缺失另行标识。明确白班／夜班优先，用途继续保留。

当日最后计划下班点与对应有效下班打卡做差，按秒累计，最小为0，不设30分钟门槛，不扣用餐。跨夜按workDate归属。SYSTEM/NotSigned不能当真实打卡，缺失不填零。

## 验收与回退

执行npm run check、npm test、npm run build:web以及npm run test:attendance。用现有应用验证通讯录工号、跨夜排班、审批表单、撤销及补卡；比对9月覆盖及Excel/HTML。真实权限未齐时保持定时同步关闭。

正式上线前备份数据库和原发布目录；执行迁移、配置受限环境文件，验证健康检查后再启用定时同步。回退时将ATTENDANCE_SYNC_ENABLED=false并恢复原代码包，保留新增考勤表和已同步记录。

## 固定假期类别目录

新增只读钉钉接口 `/topapi/attendance/vacation/type/list`，参数 `vacation_source=all`，需应用权限 `qyapi_holiday_readonly`。申请权限仍需用户确认。目录只存假种名称、来源、业务类型及单位，不读取假期余额或员工假期消费记录。

新增023_attendance_leave_catalog.sql，SQLite启动时幂等建表，PostgreSQL使用原迁移流程。目录成功缓存后所有月份均展示全部假种；历史审批中已出现但不在当前目录中的假种仍保留。没有最终归类天数时页面和Excel显示0，不把未同步日期解释为已核实出勤，不改变每天唯一分类。

`POST /api/attendance/leave-types/refresh`：沿用 `attendance.record.manage` 与查看权限，只刷新假期目录，不创建考勤同步任务。使用现有持久化租约与API额度限制。正式启用自动同步后每天刷新一次，失败保留上次成功目录；未启用时不自动调用。

`/days`、`/status`及导出快照增加 `leaveTypes`，包含names、status、lastSyncedAt、lastAttemptAt、error。目录未读取、权限不足和旧目录分别说明，不声称完整。Excel仍为11张工作表，统计规则记录目录状态和时间；离线HTML保留相同目录列、说明与颜色语义。


## 全员显示设置

类别列使用共享固定顺序，清单外新类别按名称排序并自动插入无记录／未来日期之前。管理员可在人员统计底部分页区保存每页20／50／100行为全员默认。首次为20行；普通用户临时切换行数，手动刷新或重新进入恢复全员默认，类别勾选仍独立，新出现类别默认勾选。企业新假种跨月份保留并显示0，普通新类别仅在当月实际出现时展示。所有非零类别数量使用对应色系标签；0保持普通显示。

`GET /api/attendance/display-settings` 需 `attendance.read`；`POST` 还要求超级账号或有效 `system_admin` 角色，不能仅凭考勤维护权限保存。载荷为 `{pageSize: 20|50|100}`；旧载荷中的categoryOrder忽略，历史已存排序字段不清除且不再参与显示。响应保留固定categoryOrder以及updatedAt、canManage。配置复用settings的attendanceDisplay键，不新增表，保存写入审计。Excel包含全部类别，离线HTML嵌入同版固定顺序及分页默认；导出不受页码限制。

本次界面验收使用8791和 `attendance-display-validation.sqlite` 副本且不加载钉钉凭证。原验收库存在未完成的手动同步任务，单独关闭 `ATTENDANCE_SYNC_ENABLED` 仅关闭调度，仍会处理已有队列；启动只读界面预览时需使用无凭证副本，避免断点任务续跑。正式服务及正式定时同步不在本次操作范围。
