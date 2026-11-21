# P0-57 过夜检查单一事实+多机会关联 实现与验证记录（2026-11-18）

## 原文依据

V10.1 原文行 1518-1524/1566/2005/2160（裁决：docs/MAINTENANCE_V101_ADJUDICATION_20261118.md §P0-57）：
单一检查事实 + 多机会关联表（一次真实检查存一次、以关系引用、不复制冲突副本）；示例模块
`overnight_feedback` 产出 CHECK_RESULT、不产工时/架次；适用条件=非基地站+过夜保障且须真实
业务规则核实（不得仅凭机号/航班号推断）；现阶段仅定义契约、不提前挂载生产机会。

## 实现

- **迁移 `migrations/059_overnight_feedback.sql`**：`maintenance_overnight_facts`
  （id、client_id 唯一幂等键、checked_at、station、summary、evidence_ref、
  applicability_basis 必填、inspector_account_id、created_by/at）+
  `maintenance_overnight_fact_opportunities`（fact_id×opportunity_id 主键、linked_by、
  created_at；opportunity_id 对应 maintenance_flights，与 052 模块实例同一机会口径）+
  opportunity 索引。
- **模块 `maintenance-overnight-feedback.mjs`**：`createMaintenanceOvernightFeedback({db,transaction,clock,randomId,authorize,audit,mountInstance})`
  - `recordFact`：clientId 幂等（重放返回既有事实）；必填校验含 applicability_basis
    （空则拒绝）；事实+全部关联+逐关联审计在**一笔事务**内提交；`mount:true` 时挂载在
    事务提交后逐机会调用注入的 mountInstance（不嵌套事务）。
  - 挂载复用**真实**非结算扩展注册路径 `createMaintenanceExtensionModules.register`
    （moduleTypeCode=`extension_overnight_feedback` v1、resultType=`CHECK_RESULT`）：
    注册路径自带权限、规则快照校验、已确认历史拒挂、冻结定义、审计与重放。定义由注册
    路径写入 `maintenance_module_definitions`（含 requiredBeforePendingReview=false、
    countsAsFormalReportSubmission=false）。
  - instanceKey=`mof_`+sha256(clientId) 前 32 位（确定性）：重放/重试自动补齐缺失挂载，
    且同一事实跨多机会同键不冲突（唯一键含 opportunity）。
  - `listByOpportunity`（关系反查）/`view`。模块**零**写入工时/架次/复核/结算表。
- **server.mjs 接线**：import + `db.exec(MAINTENANCE_OVERNIGHT_FEEDBACK_SCHEMA)` +
  `maintenanceOvernightFeedbackService()`（authorize=maintenanceExtensionAuthorized 即
  maintenance.module.manage 真实权限、audit→maintenanceLog(touch:false)、mountInstance 闭
  包读取当前规则快照后调用真实 register）+ 导出。**无公开 HTTP 路由、无启动自动挂载**
  （按原文"不提前挂载生产机会"）。

## 验证

- 靶向用例 `overnight feedback stores one fact linked to many opportunities and mounts a
  CHECK_RESULT module without settlement writes`（tests/server.test.mjs，隔离构造模式）：
  1 事实×3 关联（不复制）；确定性 instanceKey×3 实例；定义 CHECK_RESULT/无门禁/不算正式
  提报；重放全 replayed 且行数不变；第二个不同 clientId 事实独立+关联追加；
  listByOpportunity 聚合双事实；审计 4 条；report-modules 投影含
  extension_overnight_feedback（requiredBeforePendingReview=false、resultSource=null、
  completionAvailable=false）；maintenance_effective_hour_results 与
  maintenance_sortie_results **字节不变**；无依据/无机会/不存在机会均拒绝。
- 双配置全量 872/872（default + coordinator），迁移策略检查通过（仅新增、基线不可变）。
- 附注：一次证据落盘中 `tests/release-poller.test.mjs` 出现 1 例 spawnSync 超时抖动
  （r.status=null，该轮整跑 240s vs 常态 42s，机器高负载）；该文件单独重跑 5/5 通过，
  两次全量重跑 872/872——与维修域无关，记录在案不掩盖。

## 诚实限制（不因此升级 verified）

- 服务级用例为隔离构造（authorize/audit 注入）；真实
  maintenance.module.manage 权限链由既有扩展注册 API 用例（871 基线内）覆盖，过夜服务
  本身未走 HTTP（无路由，属内部服务面）。
- 按原文不挂载生产机会：无真实生产数据上的过夜事实；"适用条件=非基地站+过夜保障"由
  必填 applicability_basis 留痕人工核实，系统不代业务判定。
- PG 双库未单独演练（迁移同构、策略检查过；指纹脚本按目录动态纳入 059 两表）。
