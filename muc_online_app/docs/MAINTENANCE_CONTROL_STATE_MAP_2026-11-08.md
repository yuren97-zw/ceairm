# 维修管控现状映射附录（源码核对版）

- **核对基准**：`codex/maintenance-personnel` @ `5e090b4`（= origin/main 最新，2026-11-08 快进同步后），工作树 `~/.codex/worktrees/maintenance-personnel-8788`。
- **方法**：只读扫描 `server.mjs`（9113 行）、`public/app.js`（9426 行）、`maintenance-aircraft-hours.mjs`、`db.mjs`、`rbac-policy.mjs`、`migrations/`、`deploy/tencent/`、`tests/`（60 个测试）及 git/CI 配置；`docs/` 既有文档仅作旁证并逐处标注，**未照抄任何拟议接口**。
- **行号引用缩写**：`S:nnn` = `muc_online_app/server.mjs`；`A:nnn` = `muc_online_app/public/app.js`。行号以基准 commit 为准。
- **本工作树基线验证**：`npm run check` 通过；`npm test` 441/441 通过（0 失败 0 跳过）。

---

## 0. 拟议术语 → 源码实际承载 对照（重要）

拟议文档中的部分概念在源码中**没有同名实现**，核对到的真实承载如下，后续章节一律使用源码实际名称：

| 拟议/口语概念 | 源码实际承载 | 证据 |
|---|---|---|
| 「放行人员核对」 | 无同名功能；由**放行人员唯一性（radio 单选）+ 报工后锁定（三处校验）** 实现 | S:2121-2125、S:2550-2570、S:5296-5298、A:5998-5999 |
| 「管理复核」 | **任务树复核**（`GET/PUT /api/maintenance/flights/:id/review`） | S:7982-7999、A:6545 |
| 「八类实际工时比例」 | 无「八类」提法；实际为 4 种 `rule_type`（roleRatio / routineRatio / nonroutineCategoryHours / nonroutineCombinationRatio）+ **工时机型组**配置 | S:8173、S:958-966、maintenance-aircraft-hours.mjs |
| 「hourCategory=NONROUTINE」 | **不存在**该字段；现行用 `owner_type` + `category` + `source` 组合区分 | S:970、S:917、S:978（详见 §14） |
| 「工时账本」 | 无 `/api/hours` 端点；工时结果存 `maintenance_hour_results`，架次存 `maintenance_sortie_results`（分表） | S:979-1008 |
| 「退回/撤销/重派」 | 无独立 API 与关键词；等价路径见 §2 | S:4725-4746 等 |

---

## 1. 真实派工、执行路由、页面组件及首页跳转参数

**实现状态：已实现；首页带参跳转维修页：未找到。**

- 派工 API：`POST /api/maintenance/(flights|subtasks)/:id/dispatch`（S:8095），权限 `maintenance.assignment.manage`（S:8099）。核心 `setMaintenanceAssignments`（S:4781-4848）：
  - 乐观锁 `expectedUpdatedAt` 必须匹配 `maintenance_flights.updated_at`（S:4787-4788）；
  - 已提报类别锁定 `lockedRoles`（S:4795-4801：release 提报锁 `放行`，routine 提报锁其余角色，nonroutine 提报锁全部），全锁定报 409「该任务的派工类别均已提报，请在复核阶段调整」（S:4802）；
  - 写入：删未锁定旧记录（S:4812-4818），以 `status:'已派工'` 重建（S:4831），收尾 `reconcileMaintenanceTreeStatus`（S:4836）+ `maintenanceLog(user,"dispatch",...)`（S:4840）；
  - 直接编辑门槛 `assertMaintenanceTreeDirectEditAllowed`（S:4713-4724）：`已确认`/已归档或 `report_finalized_at` 非空时禁止直接派工。
- Excel 派工导入：`POST /api/maintenance/dispatch-import/preview|commit`（S:7745-7800），仅「未派工」且无派工/报工记录的机会可导入（S:7775-7777）。
- 执行路由：整体状态 ∈ `已派工/已提报` 才进执行列表（S:3044，逐字：`and visible_assignment.status in ('已派工','已提报') and maintenance_flights.status in ('已派工','已提报')`）；执行详情 `GET /api/maintenance/flights/:id?scope=execute`（S:8014-8015）→ `publicMaintenanceExecutionView`（S:2839-2870，`activeStatuses = new Set(["已派工","已提报"])` S:2841）。
- 旧整合报工 `PUT/GET /api/maintenance/flights/:id/work-report` 已停用返回 410（S:8000-8004）。
- 页面组件：页签 `maintenanceTabs = [["dispatch","派工"],["execute","执行"],["data","数据"],["report","报表"],["hours","工时"]]`（A:3086-3092），渲染入口 `renderMaintenance()`（A:4354）；派工板 `renderMaintenanceDispatch()`（A:3507）；任务卡 `maintenanceFlightCard()`（A:3347）；派工弹窗 `openMaintenanceDispatchDialog()`（A:5940）；执行页 `renderMaintenanceExecute()`（A:3566）。
- **首页（homePage）不存在带参跳转维修页的入口**（首页跳转仅 `data-home-info-filter` → 信息页，A:4602-4615）；进入维修模块只有顶部导航 `data-page="maintenancePage"`。模块内实际带参跳转（属性名原样）：
  - `data-maint-dispatch`（值 `"flight:<id>"` / `"subtask:<id>"`，A:3296/3319/3376）
  - `data-maint-review` + `data-maint-review-focus`（A:3299）
  - `data-maint-report` + `data-report-type`（取值 `routine|nonroutine|nonroutine-create|finalize`，A:3659-3664）
  - `data-maint-release-confirm` + `data-maint-flight-id`（A:3662）
  - `data-maint-tab`（页签）
- 列表请求参数名（原样）：`scope`、`view`、`limit`、`cursor`、`locationId`（execute）/ `dateFrom`、`dateTo`、`search`、`opportunity`（dispatch）（A:1119-1132、S:7664-7676）。

## 2. 维修机会整体状态枚举、退回/撤销/重派等既有合法分支

**实现状态：已实现；「退回/撤销/重派」独立 API：未找到（全库关键词 0 命中）。**

- 枚举（逐字，字段 `maintenance_flights.status` / `maintenance_subtasks.status`，默认 `'未派工'` S:895/S:920；`maintenance_assignments.status` 默认 `'已派工'` S:937）：
  - 后端白名单 `maintenanceStatus`：`["未派工", "已派工", "已提报", "待复核", "已确认"]`（S:2054-2057）；报表常量同（S:3882）；前端 `taskStatuses` 同（A:3095）。
  - 报工批次 `maintenance_report_batches.status` 出现取值：`已提报 / 待复核 / 已确认 / 预填`（S:4727、S:2735、S:2692）；报工分段 status：`已提报 | 未提报 | 无需报工`（S:2737-2740）。
- 状态派生（无集中状态表，分散计算）：
  - `maintenanceAssignmentsStatus(ownerType, ownerId)`（S:3249-3256）：无记录→`未派工`；有`已派工`→`已派工`；全`已确认`→`已确认`；全`待复核/已确认`→`待复核`；否则→`已提报`。
  - 整体派生 `reconcileMaintenanceTreeStatus(flightId, personId, {preserveConfirmed})`（S:3270-3295）：`allConfirmed && report_finalized_at`→`已确认`；`report_finalized_at`→`待复核`；`anySubmitted`→`已提报`；有派工→`已派工`；否则`未派工`。`preserveConfirmed` 保证已确认不降级（S:3277/S:3292）。
- 既有合法回退/重派路径（等价分支）：
  1. **报工作废重置** `invalidateMaintenanceReportCategory(flightId, reportType, user, reason)`（S:4725-4746）：删批次 + `update maintenance_assignments set status='已派工' where status<>'已确认'` + reconcile 重算。触发点：修改维修机会类别（S:8032-8033）、新增/修改/删除非例行（S:8061/S:8077/S:3782）。
  2. **复核中调整（重派等价）** `saveMaintenanceReview` mode `save` → `reconcileMaintenanceReviewAssignments`（S:3522-3560）删/增 assignment，新增者状态 `已确认 或 待复核`（S:3534）。
  3. **派工重下**：对未提报类别重新 dispatch 整体重建（S:4812-4834）。
  4. **自动报工确认** `autoConfirmMaintenanceRoutine`（S:5211-5222，internal-only）：非航后类、progress.ready、无正式/草稿非例行时直接 finalize。
  - 重复提报禁止：批次已存在报 409「该类别已经提报，不能重复提交」（S:2692）。

## 3. 放行人员核对、管理复核：权限、按钮与状态前置条件

**实现状态：任务树复核已实现；「放行人员核对」无同名功能，由三处锁定链路承载。**

### 3.1 放行人员核对（实际承载 = 放行人员锁定）
- 权限：`maintenanceCanExecute(executor,true)` = `maintenance.view` + `maintenance.execute.submit`（S:2050-2052）；报工路由校验 `assignment.person_id === executor.personId` 否则 403「只能反馈派给自己的任务」（S:8103，数据范围豁免走 `personnel-access.mjs` `allows()`）。
- 放行唯一性：`放行类别最多只能选择一人`（S:2121-2125）；前端放行用 radio 单选（A:5998-5999、A:6631-6632）。
- 报工校验 `submitMaintenanceRelease`（S:4985-4988）：`release.person_id !== user.personId` →「只有当前维修机会的放行人员可以上报架次」；`release.status !== "已派工"` → 409「放行已经提报，请刷新页面」。
- 三处锁定：
  1. 例行报工调整归属 `applyMaintenanceReleaseSelection`（S:2550-2570）：未提报时仅当前放行人员可调整；已提报时「放行架次已提报，放行人员已锁定」。
  2. 报工确认终审（S:5296-5298）：「放行架次已提报，放行人员不能修改」/「放行派工与已提报人员不一致，请核对后重试」。
  3. 复核任务树内放行角色单选 + 报工弹窗「放行（已锁定）」只读块（A:6631-6632、A:9120、A:6290）。
- 前端按钮：`放行报工`（A:3662），渲染条件 `canSubmitReport && release?.status === "已派工" && !releaseBatch`（A:3635/3646）；弹窗 `maintenanceReleaseConfirmDialog`「确认已放行，上报架次？」（A:5723），确认调 `assignmentAction(id,"complete",{feedback:""})`（A:7839）。

### 3.2 管理复核（= 任务树复核 maintenance review）
- 权限：查看 `maintenance.review.view`、提交 `maintenance.review.submit`（S:7986-7994）；持有角色 `addon_maintenance_review`、`addon_archive_modify`、`system_admin`——**基础 manager 角色不含**（rbac-policy.mjs maintenanceV2/addon 定义）；修改已确认数据另需 `maintenance.archive.modify`（S:3602/3719/3768）。
- 按钮与前置：维修机会状态徽标变复核按钮，条件 `["待复核","已确认"].includes(status) && hasRbac("maintenance.review.view")`（A:3298-3299），仅管理视图传入 reviewFlightId（A:3376/3319），执行视图不渲染（A:3595）；弹窗 `openMaintenanceReviewDialog`（A:6545）；`保存`/`确认整棵任务树` 按钮仅 `draft.canEdit` 时渲染（A:6674），归档模式隐藏 confirm。
- 写操作（**无「驳回」概念**，`grep 驳回|退回|打回` 维修段 0 命中）：
  - **confirm**（S:3663-3671）：批次→`已确认`、机会→`已确认`+`archived_at`、`rebuildMaintenanceReviewResults`（S:3560-3594）逐 assignment 落已确认结果（放行写 `maintenance_sortie_results`，`confirmed_by` 记录）、写签署字段 `routine_electronic_signed`/`nonroutine_electronic_signed`、日志 `review_confirm`。
  - **save**（S:3597-3690）：仅调整人员/工时，任务状态保持不变（前端提示逐字 A:6746「已保存，任务状态保持不变。」），日志 `review_save`。
  - 变通打回：仅经 `invalidateMaintenanceReportCategory`（见 §2.1），无独立驳回接口。
- confirm 阻断项（S:3496-3515）：「`${label}的${person}/${role}尚未进入待复核`」「缺少${…}架次/工时上报结果」；签署方式必选（S:3629-3631「请选择例行签署方式」）；已确认修改必须填原因（S:3607）；已确认禁 confirm（S:3610 附近「已确认数据请使用保存归档修改」）。
- 独立批量确认通道：`POST /api/maintenance/sorties/:id/confirm`、`/sorties/confirm-batch`、`/hours/confirm-batch`（S:8310-8340、S:8287），权限 `maintenance.hours.confirm`，前置 `status==='待复核'`（409「架次尚未进入待复核或已经确认，不能直接确认」）。

## 4. 工时单位、精度、比例分摊、尾差、重复人员与汇总口径

**实现状态：已实现（最大余数法 + 角色内均分，全程整数「分」运算）。**

- **单位**：小时（非分钟），存储列均 `real`：`maintenance_flights.standard_hours`（S:893）、`maintenance_hour_results.hours`（S:979）、`adjusted_hours`（S:980）。
- **录入精度**：例行机型组工时 ≤2 位小数（maintenance-aircraft-hours.mjs:31「工时须大于0，最多两位小数」）；非例行/拖机以 **0.1 小时**为步长（S:5066-5067「工时必须以0.1小时为单位」；A:5882 `step="0.1"`）；例行比例 ≤3 位小数（S:1437）、非例行组合比例 ≤2 位（S:1413-1414）。
- **内部精度**：统一转整数分 `Math.round(baseHours * 100)`（S:3195/3201/3223）。
- **分摊唯一入口** `maintenanceCalculatedHours(ownerType, owner, assignments)`（S:3191-3242）：
  - 例行（S:3219-3241）：`weighted = totalCents * Math.round(ratio * 1000)`（整数权重防浮点漂移，S:3224）；`roleCents = floor(weighted/1000)`；**尾差按 `weighted % 1000` 降序（index 升序破平）逐人 +1 分**（S:3226-3231）；角色内按 `person_id`,`id` 排序均分，余数给前几人（S:3237-3239）。**无人角色预算不外捐**：`if (!people.length) return;`（S:3236，注释 "Missing roles must not donate hours to others"）。
  - 非例行（S:3200-3217）：角色序 `["主做","检验","辅助"]`（S:1368）先 floor+最大余数分角色预算，再角色内按 `assigned_at,id` 均分。
  - 拖机（S:3193-3198）：不走比例，`floor(totalCents/n)` + 余数给排序最前者。
- **重复人员**：同一人同角色去重 `personId\0role`（S:2118-2119）；不同人同角色**均分该角色预算**（非各拿全比例）；比例行按 role 唯一约束 `unique(rule_type,name)`（S:964），重复提交报「`${combination}的${role}比例重复`」（S:1417）。
- **汇总口径**：JS 累加为主——`maintenanceStats` 逐行 `maintenanceFinalHours`（adjusted_hours 优先，S:4407-4411）累加后 `toFixed(2)`（S:4053/4080/4144-4146）；唯一 SQL 聚合仅排序子查询（S:4260）。
- 前端复核预览同口径复刻 `maintenanceReviewCalculatedHours`（A:6574-6592），与 server 有逐人逐分对齐测试。
- 测试锚点：`tests/maintenance-hours-rounding.test.mjs`（航后 5h 恰好 500 分、顺序稳定、同角色极差 ≤1 分、缺角色不获他人预算、小数预算守恒、非例行 0.6/0.3/0.1、拖机合计 100 分、复核预览对齐）。

## 5. 例行共享草稿：保存路径、锁定批次、历史数据

**实现状态：已实现。**

- API：`PUT /api/maintenance/flights/:id/reports/routine/draft`（S:7682、S:7695-7707）→ `saveMaintenanceRoutineDraft`（S:2641）；前端 `saveRoutineDraft`（A:1280），按钮 `data-maint-work-save-routine`（A:6308）。
- 存储：表 `maintenance_report_drafts`（S:1060-1071）：`id, flight_id, report_type, payload_json, version, updated_by, updated_by_name, created_at, updated_at`，`unique(flight_id, report_type)`；写入 `writeMaintenanceReportDraft`（S:2455-2464，on conflict 更新 payload、version+1）。
- payload 结构（逐字）：`{ entries:[{role,personId}], feedback, releasePersonId }`（S:2661-2666）；保存同步派工表 `syncMaintenanceRoutineAssignments`（S:2574-2639），已提报拒绝（S:2585）。
- **锁定批次机制**：表 `maintenance_report_batches`（S:1030-1043）`unique(flight_id, report_type)` + 明细 `maintenance_report_entries`（S:1044-1059）`unique(batch_id, owner_type, owner_id, role, person_id)`；锁定 = 状态锁 `["已提报","待复核","已确认"]`（S:2735）。批次存在后：例行草稿保存被拒（S:2646）、重复提交被拒（S:2692）、放行人员锁死（S:2553-2558）。并发：草稿 `version` 乐观锁（S:2649-2650「共享草稿已被其他人员更新」）。**锁粒度 = flight_id × report_type**（release/routine/nonroutine 三类）。
- 历史结构：旧表 `maintenance_work_reports`（S:1007-1019，flight_id 主键、status 默认 `草稿`）+ `maintenance_work_report_entries`（S:1020-1029）；一次性迁移到批次/结果表（S:1225-1270，source=`历史放行架次/历史例行报工/历史非例行报工`）。
- 报工视图：`maintenanceReportsView`（S:4913-4981）返回 `routine.draft/locked/roleStatuses`、`nonroutine.draft/locked/revision`。

## 6. 非例行：保存后展开可见、单项删除、工种报工按钮

**实现状态：前两项已实现；「工种对应报工按钮」以「统一按钮 + 工种 tab」形式实现，无逐工种提交按钮。**

- **保存后展开可见**：已实现但**不自动展开**——保存成功仅 `closeDialog + refreshMaintenance`（A:6351-6352）；派工板卡头部折叠态显示计数 `· 草稿 N 项`（A:3389），点 `data-maint-toggle-subtasks` 展开渲染草稿卡（A:3325-3345，徽章 `status-badge draft` 草稿）；执行页草稿项带 `execute-nonroutine-draft-badge`（A:3602-3629）。
- **单项删除**：
  - 草稿（nonroutine-create）：`data-maint-remove-temp-nonroutine`（A:6281-6282，handler A:7672-7690，最少保留一项「至少保留一个单项」）——**前端 splice 后整单 PUT 草稿，无逐项服务端 API**（DELETE 端点仅整份草稿，S:7689 非 nonroutine 报 405）。
  - 正式非例行：`data-maint-delete-report-subtask`（A:6281，handler A:7616-7638，`confirm(...)` 确认）→ `deletedSubtaskIds` → 服务端 `deleteMaintenanceSubtaskForReport`（S:5200-5208），权限 `maintenance.nonroutine.delete.own`（S:2506-2519）。
  - 独立删除：卡片 `data-maint-delete-subtask`（A:3320）→ `DELETE /api/maintenance/subtasks/:id`（S:8084-8094），权限 `maintenance.content.manage`。
- **工种报工按钮**：执行页按钮按**报工类别**（`例行报工 / 非例行报工 / 新增非例行报工 / 放行报工 / 报工确认`，A:3659-3664）；弹窗内每工种为 tab（`maintenanceWorkReportRoleGroups` A:6209-6223，显示 `已提报`/`N 人`），提交是单个 `data-maint-work-submit`（A:6308、A:7702-7704）。各工种选人状态存 `draft.selections`（键 `${contextKey}|${role}`，A:6195-6196）。

## 7. 人员/工种同屏多选 UI

**实现状态：已落地；筛选/去重已实现；批量=多选勾选（无全选按钮）；删除确认部分覆盖。**

- 组件：派工弹窗 `maintenanceDispatchDialog`（A:5940-5991，原生 `showModal`）＝左工种组 `maintenance-role-groups`（A:6004-6017）+ 右人员列表 `maintenance-people-picker`（A:6019-6041）同屏；报工弹窗同构（A:6304-6305）。多选 checkbox、放行 radio（A:5998-5999）。
- 人员筛选：分类下拉 `maintDispatchTeam`/`maintWorkReportTeam` + 搜索框 `maintDispatchSearch`/`maintWorkReportSearch`（placeholder「姓名 / 工号」，匹配 name/employeeNo/username/id，A:6030-6034）；中文输入法防抖 `compositionstart/end`（A:8660-8682）。
- 批量新增：多选勾选 + 跨工种累计「已选 N 人次」（A:6038）；**未找到「全选/批量添加」按钮**。
- 去重：前端 Set + `order.has(userId)`（A:9144-9150）；候选列表排除已选（A:6028）；服务端双重去重（S:2484 findIndex、S:4850-4866 seen key）。
- 删除确认：报工弹窗删单项/整稿有 `confirm()`（A:7624、A:6363）；**派工弹窗工种清除按钮 `data-maint-clear-role` 无确认**（A:6015、A:7784-7790），取消勾选个人无确认。

## 8. 非例行标准库、人工审核、审核中工时、补记通道

**实现状态：标准库未找到；其余已实现。**

- **非例行标准库：未找到**——无标准库表/服务/API（全库 `标准库|standardLibrary|standard_library` 0 命中）。最接近机制：类别硬编码 `["工卡指令","单项工作","拖机","其他"]`（S:2387）；规则表仅种「拖机」默认 3h（S:1611）；附加工作 Excel 导入 `POST /api/maintenance/subtasks/import`（S:7815-7868）属导入通道非标准库。
- 人工审核：已实现（§3.2 任务树复核 + §2 状态机 `待复核`）。
- 审核中工时：`maintenance_hour_results.status` 默认 `'待复核'`（S:981），取值域 `已提报/待复核/已确认`（S:1209）；`adjusted_hours` 复核调整值（S:980，读取优先 S:4407-4411）；`confirmed_by/confirmed_at`（S:982-983）；批量确认 `/api/maintenance/hours/confirm-batch` 仅 `待复核` 可确认（S:8278）。
- 补记通道：已实现——复核对话框「新增非例行」（A:6665，标签 `归档补录`/`待复核补录` A:6641）→ review payload `newSubtasks`（S:3613）→ 写 `maintenance_subtasks`，`resultSource = "复核补录"（待复核）| "归档补录"（已确认）`（S:3650）；必填补录原因（S:3615），仅 `待复核/已确认` 可补录（S:3614）。使用者：`maintenance.review.submit`，改已确认另需 `maintenance.archive.modify`。
- 另有工作者侧「临时非例行」报工入口（非审核补记）：`create_temporary_nonroutine`（S:5053-5059），source=`临时非例行报工`（S:5069）。

## 9. 拖机单独工时设置：入口、数据来源、旧 API、迁移映射

**实现状态：已实现。**

- 数据来源：`maintenance_hour_rules` 行 `rule_type='nonroutineCategoryHours' and name='拖机'`；读取 `maintenanceTowDefaultHours()`（S:1362-1366，无配置回退 `3`）；幂等种子 3h（S:1610-1611）。
- 前端入口：工时 tab → `simpleGroup("towHours","拖机工时规则",...)`（A:3747/3781），保存校验「拖机默认总工时必须大于0且以0.1小时为单位」（A:7907-7911）；非例行表单选拖机默认章节 `09` + 默认工时（A:5869-5870、A:9044-9051）；复核对话框 `setMaintenanceReviewSubtaskCategory`（A:6526-6533）；报工接口下发 `defaults.towStandardHours`（S:4946）。
- 旧 API：**无独立拖机 API**，保存走 `PUT /api/maintenance/rules`（S:8143-8188）；旧 `workType` 标准工时整笔拒绝「旧标准工时已停止维护，请使用机型组配置」（S:8149-8151）；`roleRatio` 仍在白名单（S:8173）但 UI 不再渲染（遗留数据）。
- 历史/迁移：`normalizeMaintenanceTowAndPrimaryRole()`（S:1572-1617）：「主作」→「主做」全表迁移 + 幂等种入拖机规则；拖机角色固定「主做」（S:2080/2473/3124/5069）；导入映射 章节 `09` → `category "拖机"`（tests/maintenance-import.test.mjs:81-88）；个人统计类别映射（S:4418）。

## 10. 「八类」实际工时比例配置：权威表/服务、入参响应、边界处理、算法

**实现状态：配置体系已实现；「八类」提法未找到；`maintenance_hour_rules` 无版本/生效时间字段（版本语义只在机型组配置）。**

- **权威存储**：表 `maintenance_hour_rules`（S:958-966：`id/rule_type/name/value/created_at/updated_at`，`unique(rule_type,name)`）+ settings 键 **`maintenance_aircraft_hours_v1`**（S:3150，机型组）。`rule_type` 白名单（逐字）：`["roleRatio", "routineRatio", "nonroutineCategoryHours", "nonroutineCombinationRatio"]`（S:8173）。
- **服务**：无独立 service 文件，全在 server.mjs：`maintenanceRulesResponse`(S:1346)、`maintenanceRatioForOwner/RuleForOwner`(S:3123-3142)、`maintenanceCalculatedHours`(S:3191-3242)、校验 `validateMaintenanceRoutineRules`(S:1428-1447)/`validateMaintenanceNonroutineCombinationRules`(S:1405-1426)/`normalizeMaintenanceRoutineRatioRules`(S:1465-1520)；机型组独立文件 `maintenance-aircraft-hours.mjs`。
- **接口**：`GET /api/maintenance/rules` → `{ rules, aircraftHours }`（S:8127-8131），routineRatio 行拆出 `opportunity`、`role`（S:1354-1358），组合行拆出 `combination`、`role`（S:1348-1351）；`PUT` 入参 `{ rules:[{rule_type|ruleType, name, opportunity, combination, role, value, id}], aircraftHours:{version, groups}, reason, confirmation }`（S:8147-8182）。
- **空角色**：读取侧 `(maintenanceRatioForOwner(...) || 0)`→0 预算（S:3224）；保存侧强制完整（S:1442-1443「缺少例行工种比例」、合计 `Math.abs(total-1)>0.0005` 拒绝 S:1444-1445）；非例行提交缺有效比例报「缺少有效工时比例」（S:5072-5073）；拖机非主做恒 0（S:3124）。
- **多人同角色**：均分角色预算（§4）。
- **策略版本/生效/适用范围**：机型组 `{id,name,codes,enabled,hours}`，保存 `version = previous.version + 1` + 乐观锁 409「工时机型组已被修改，请刷新后重试」（S:8158-8167）；适用范围 = `item.enabled && item.codes.includes(code)`（maintenance-aircraft-hours.mjs:41）；每机会例行快照 `routine_hours_snapshot`（migrations/017；JSON `{aircraftCode, groupId, groupName, opportunity, baseHours, version, ratios, capturedAt}` S:3175/3184-3186）**首次例行报工冻结、改矩阵不重算**（S:3180-3181）。`maintenance_hour_rules` 本身**无版本/生效时间字段**，保存即时生效、靠快照隔离历史。
- **工时管理页入口**：维修页 tab「工时」（A:3091）→ `renderMaintenanceHours`（A:4363）；tab 切换加载 `/maintenance/rules`（A:1144-1156）；权限 `maintenance.rules.view`/`maintenance.rules.manage`（S:8130/8146；前端 A:3741/3785）。
- **角色 vs 法定检验资质**：**未混用、也无联动**——分摊显式排除放行（S:3222 filter、A:6575 return 0、S:8176 跳过保存放行 ratio）；资质是独立体系（`users.function_category ∈ ["维修","放行"]` S:108、资质表 `personnel_authorizations`/`personnel_training_records` S:6752+）；**派工归一化不校验资质/函数类别**（S:2104-2126 仅校验人员存在、角色允许、放行 ≤1 人）——即无混用，但也无资格联动校验。

## 11. 维修机会机型：原始字段、字典、A320 匹配、标准库映射

**实现状态：字段与匹配已实现；后端机型字典表/标准库映射：未找到。**

- 原始字段：`maintenance_flights.aircraft_no`（机号）、`aircraft_type`（机型）（S:882-883）；导入归一化 `aircraftType` 大写化（S:2174-2175）；列表展示 `aircraftNo/aircraftType`（S:2805-2806、A:3218）。
- 机型字典：**无后端字典表**；前端选项常量 `aircraftTypes = ["A319","A320","A321","A330","B737","B767","B777","B787","ARJ21","C919","大机型","小机型","其他"]`（A:3093）仅作 UI 选项。
- **A320 系列匹配口径：精确匹配，无机型族别名**——`resolveAircraftHours`：`code = String(aircraft).trim().toUpperCase()`，`group.codes.includes(code)`（maintenance-aircraft-hours.mjs:39-44）；文件头注释逐字「Aircraft codes are exact identifiers: no automatic model-family aliases.」；`A320≠320` 由 tests/maintenance-aircraft-hours.test.mjs 锁定；同码属多组报错「机型 X 不能同时属于多个工时机型组」（maintenance-aircraft-hours.mjs:23）。
- 标准数据库机型映射种子：**未找到**（仓库内 A320 字样仅出现在测试/烟测 fixture 的能力授权项目，与机型工时映射无关）。

## 12. 原非例行选择 UI 结构、移动端搜索 CSS、iOS PWA 行为

**实现状态：已实现（详见各点）。**

- 弹层：原生 `<dialog>` + `showModal()`（A:5990/6170/6566），body 动态注入（A:5696-5731）；关闭统一 `closeDialog`（A:4903-4912）与全局 `data-close`（A:7355-7359）；放行确认弹窗阻止 `cancel` 默认行为（A:5725-5729）。
- 选择器结构：`maintenance-role-groups`（工种组：工种名+已选预览前 3 人 `+N`、锁定态 `locked`/`已提报 · N 人`）→ `maintenance-picker-tools`（分类下拉 + `maintenance-selected-count` + 搜索框）→ `maintenance-people-picker`（已选排前，候选按班组/姓名 zh-CN 排序，A:6035）；人员行 `maintenance-person-row`/`maintenance-person-info`/`maintenance-person-role`（A:6001）。
- **移动端搜索框 CSS 在 `public/index.html` 内联 `<style>`**（不在 app.js）：`.search` 基类 index.html:20（`width:100%;padding:10px 12px;border-radius:12px;font-size:15px`），520px 断点 index.html:28（`font-size:13px;padding:9px 10px`），focus 态 193/205-213/568；弹窗内 `.maintenance-picker-tools` index.html:1092-1098/1140，移动端 1314-1333。
- **iOS PWA 键盘**：visualViewport 仅挂报工弹窗——`resize/scroll → syncMaintenanceWorkReportViewport`（A:5719-5720；A:5742-5758：`window.innerHeight - viewport.height > 120` 判定，toggle `keyboard-visible`，写 CSS 变量 `--maintenance-report-viewport-height/--maintenance-report-viewport-top`）；对应 CSS index.html:1324-1326（`.maintenance-work-report-dialog.keyboard-visible{position:fixed;top:calc(var(--maintenance-report-viewport-top,0px) + 4px);...}`）；另一套状态弹窗 viewport 处理见 tests/status-dialog-viewport.test.mjs。PWA：manifest `display:"standalone"`、`apple-mobile-web-app-capable`（index.html:9-12）、SW 注册 index.html:1829-1840。
- **父页面关闭行为**：无 `window.opener`/postMessage 机制（`window.open` 仅导出用、noopener）。刷新链 = 弹窗 `close` 事件 → `flushMaintenancePendingRefresh()`（A:5493、A:5702-5730）；编辑器打开期间 SSE 刷新挂起（`maintenanceHasOpenEditor` A:5606-5608、`refreshMaintenanceFromSync` 置 `maintenanceRefreshPending` A:5610-5626），关闭后统一 `refreshMaintenance()`（A:5628-5632）；保存成功路径另主动 close+refresh（A:6351-6352）。

## 13. 放行报工 → 放行架次：归属、重复、口径、撤销，且不进工时账本

**实现状态：已实现；「不进工时账本」成立（证据链完整）。**

- **归属人**：报工人必须是 `release.person_id === user.personId`（S:4986-4988）；架次记录写派工行 person_id（S:4989-4994）；确认时再写死 `person_id,user_name,team,sorties=1`（S:5300-5302）。
- **重复放行**：报错不去重不覆盖——已提报再提交 409「放行已经提报，请刷新页面」（S:4988）；底层 upsert `on conflict(owner_type,owner_id,assignment_id) do update set sorties=1` + `unique(owner_type,owner_id,assignment_id)`（S:993-1008、S:3325-3327）——每 assignment 恒 1 条。
- **架次口径**：**按维修机会计数，固定 1 架次/人**（S:3327 `insert ... '放行','放行架次',1,...`；确认时 S:5301 `sorties=1`）；不按航班号拆分，日期维度 join `f.date`（S:4400-4406）；月度汇总 `maintenancePersonalSortieRows`（S:4400-4406）、个人明细 `sorties: 1`（S:4637-4652）。
- **撤销/更正**：报工人无自助撤销（提交即锁，无撤回端点/草稿）；管理侧更正 = `invalidateMaintenanceReportCategory(flightId,"release",...)` 仅批次状态 ∈ `['已提报','预填']` 时删架次结果 + 派工回退 `已派工`（S:4725-4742，触发点仅修改机会类别 S:8032）；复核任务树可改放行人员并重建（S:3580-3583）；归档删除走 `deleteMaintenanceFlight`（S:3717+，需 `maintenance.review.submit`/`maintenance.archive.modify` + 原因）。
- **不进工时账本（验证链）**：
  1. 分表且架次表无 hours 列（S:979-1008：`maintenance_hour_results` 有 `hours`，`maintenance_sortie_results` 只有 `sorties`）；
  2. 无写入路径：`submitMaintenanceRelease` 只调 `regenerateMaintenanceSorties`（S:4996），工时生成显式排除 `role<>'放行'`（S:3305）；
  3. 历史迁移主动清除 `delete from maintenance_hour_results where role='放行'` + 删放行 ratio 规则（S:1525-1534）；放行工时恒 0（tests/maintenance-hours-rounding.test.mjs:51、A:6575）；
  4. 汇总分列：工时行只取 hour_results（S:4384-4393）、架次行单独取 sortie_results（S:4400-4406）、报表 `finalHours: 放行→null` / `sorties: 放行→N`（S:4311-4312）、例行过滤跳过放行（S:4037）;
  5. 两表 38 处引用全部在 server.mjs 维修段内，无外部模块引用，不存在 `/api/hours` 端点。

## 14. 三类报工状态写入与整体状态触发；门槛判断适配器适配性

**实现状态：已实现；门槛与副作用部分分离——适合抽取，需显式建模两个特例。**

| 类别 | 提交函数 | 门槛判断 | 状态写入 | 整体状态触发 |
|---|---|---|---|---|
| 放行 release | `submitMaintenanceRelease`（S:4983-5003，路由 S:7725/S:8123） | S:4987 本人须是放行派工；S:4988 `release.status!=='已派工'`→409 | assignment→`已提报`（S:4996）；batch→`已提报`（S:4991-4994） | `regenerateMaintenanceSorties`（S:4997）+ reconcile（S:4998）+ autoConfirm（S:5000） |
| 例行 routine | `submitMaintenanceRoutine`（S:5005-5029，路由 S:7726） | S:5008 `maintenanceCanSubmitReport`（S:2722-2724）；S:5010-5011 版本锁；S:5017-5018 工时/比例校验 | batch→`已提报`（S:5020）；assignments→`已提报`（S:5021） | `regenerateMaintenanceHours`（S:5022）+ reconcile（S:5024）+ autoConfirm（S:5026） |
| 非例行 nonroutine | `submitMaintenanceNonroutine`（S:5184-5198；草稿 S:5168-5182，路由 S:7727-7728） | `assertMaintenanceNonroutineEditable`（S:5083-5095：须派工人员、`待复核/已确认` 禁改、批次已存在禁改、revision 锁） | subtask.status（S:5157 逐字）：`submit ? "已提报" : (entries.length ? "已派工" : "未派工")` | batch（S:5192）+ `regenerateMaintenanceHours`（S:5160）+ reconcile（S:5194） |

- 纯读判定（可复用）：`maintenanceAssignmentsStatus`（S:3249）、`maintenanceReportProgress`（S:2726-2753，完全只读，输出 `segments/ready/anySubmitted/batches`，前端消费同一结构 A:3636-3653）；非例行门槛已独立成 assert（S:5083）。
- 耦合点（适配器需剥离）：放行/例行门槛内联在提交函数（S:4988、S:5008）；版本锁依赖请求 payload（S:4787、S:5010-5011、S:5090）；`replaceMaintenanceAssignmentsFromEntries` 写后自更 owner 状态（S:4909）；reconcile 既算又写（S:3278/3293）；autoConfirm 同事务再触发完整确认（S:5000/5026）；前端另有平行门槛布尔（A:3647-3651 `canRoutine/canNonroutine/canCreateNonroutine/canFinalize`）与后端语义重复。
- **结论：适合抽**。建议形态「输入 owner 快照 + 动作 → 输出 允许/拦截原因」，收敛 S:4713、S:4988、S:5083-5094、S:2692、S:4802/4809、S:5229-5235、S:3629-3633 的分散断言；版本锁与 reconcile/autoConfirm 写副作用留在原函数。**两个必须显式建模的特例**：finalize 分支绕过 reconcile 直接批量写 `待复核`（S:5304-5313）；`preserveConfirmed` 的已确认不降级语义（S:3277/3292）。
- 报工确认/最终提报：`saveMaintenanceReportConfirmation`（S:5224-5322，门槛 S:5229-5235：原放行报工人、无非例行草稿、`progress.ready`、未确认过）+ `finalizeMaintenanceReports`（S:5324-5326）。

## 15. 非例行普通入账 vs 审核补记的统一标识

**实现状态：hourCategory=NONROUTINE 未找到（全仓库 0 匹配）；现行靠 owner_type + source 区分。**

- **hourCategory / NONROUTINE 字段：不存在**。现行区分：
  - `maintenance_hour_results.owner_type`（S:970）：`'subtask'`=非例行、`'flight'`=例行（统计读取 S:4504）；
  - `maintenance_subtasks.category`（S:917）承载四类别，读取归一化旧标签（S:4413-4419：`EO/工程指令→工卡指令`、`ADD WORK/NRC/临时工作→单项工作`）。
- **两条路径写同一张表**：
  - 普通入账：`PUT .../reports/nonroutine` → `submitMaintenanceNonroutine` → `regenerateMaintenanceHours("subtask",...,"已提报")`（S:5160）→ 插入 hour_results，`source = "非例行"`（S:3314）；批次条目 `source="非例行报工"`（S:5069）。
  - 审核补记：`saveMaintenanceReview` → `rebuildMaintenanceReviewResults` → `source = resultSource || old?.source || "非例行"`（S:3586），`resultSource = "复核补录"/"归档补录"`（S:3650）。
- **来源渠道**：有 `source` 文本字段（S:978/1055/998/897），取值清单（原样）：`非例行`、`维修机会`、`放行架次`、`非例行报工`、`临时非例行报工`、`报工补录`（S:2701）、`报工确认调整`（S:2710）、`后台归档修正`（S:3460/3465）、`复核补录`、`归档补录`、`历史非例行报工`（S:1269）、`例行派工保存`（S:2658）。**名为 `channel` 的字段：未找到**。
- **老数据兼容**：一次性迁移 `migrateMaintenanceTerminology`（S:1280-1287，`source='附加工作'→'非例行'`）；历史机会冻结 `freezeLegacyMaintenanceHours`（S:3166-3178，`{groupId:"legacy", groupName:"历史规则", version:0, legacy:true}`）；读取时回退/归一化（S:3163、S:4413-4419）；加列机制 SQLite `ensureColumn`（S:186-189）/ PG `add column if not exists`。

## 16. 模块启用条件与规则版本快照：现状与兼容性

**实现状态：模块级开关未找到（现状=三层门）；版本快照例行侧已实现、非例行侧未实现；对未来扩展兼容性良好。**

- 现有「门」：
  1. RBAC 权限 gate（每个端点 `hasRbac`，如 S:7994/8043/8055；目录 rbac-policy.mjs:40-145）；
  2. 导航可见性 `NAVIGATION_NODES`：`maintenancePage` 要求 `anyOf: ["maintenance.view","maintenance.execute.view","maintenance.dispatch.view","maintenance.review.view","maintenance.stats.manage.view"]`（rbac-policy.mjs:210）；
  3. 机型组级启用位 `enabled`（maintenance-aircraft-hours.mjs:34/41）。
  - 参考模式（维修模块外）：考勤子功能开关 `config.approvalPlansEnabled`（attendance-service.mjs:436/458）。
- 版本快照：例行——`routine_hours_snapshot`（S:1128 ensureColumn + migrations/017），内嵌 `version`（S:3175），规则本体 `maintenance_aircraft_hours_v1` 保存即 version+1（S:8158-8167）；前端显示「规则版本 N」（A:6294）。**非例行——无快照**，`standard_hours` 为提交时录入的静态值（S:918、S:3145），天然冻结但无版本语义。其余 `version` 字段（S:1036/1065/205-213）均为并发控制，非规则快照。
- **兼容性结论：可兼容，不迁移/不重开历史**。已确认状态承载字段（逐字，S:1120-1134）：`report_finalized_by/_by_name/_at/_mode`、`archived_at`、`status`、`routine_electronic_signed`/`nonroutine_electronic_signed`；判定 `confirmed = status==='已确认' || archived_at`（S:3380/3601/3716）。依据：加列不改旧行有先例（S:186-189、migrations/017）；空值回退有先例（S:3163、S:3175 legacy version 0、S:4413-4419）；状态保护 `preserveConfirmed` 已存在（S:3292）。注意点：启用条件评估逻辑需全新新增；非例行统一快照需为 `standard_hours` 补版本语义。

## 17. SQLite/PostgreSQL 运行时、迁移兼容；SSE 事件与多端刷新

**实现状态：已实现（双运行时 + 迁移纪律 + 双 SSE 流）。**

- **驱动**：SQLite 用 `node:sqlite` `DatabaseSync`（db.mjs:8；Node 24 内置，无 better-sqlite3）；PostgreSQL 用 `pg` Client（db.mjs:173-174）。
- **方言机制**：以 SQLite 为主方言写 SQL，`translateSql`（db.mjs:27-40）动态改写为 PG：`begin immediate→begin`、`insert or ignore→insert ... on conflict do nothing`、`?→$n` 占位符、混合大小写别名加引号（PG 折叠未引号别名）。
- **真实运行时**：本地开发=工作树内 SQLite 文件（`start-local-development.mjs`：`env.DB_PATH` 必须是本工作树内普通文件，scripts/start-local-development.mjs:22-28）；生产=systemd `ExecStart=/usr/bin/node server.mjs` + `EnvironmentFile=/opt/airline-operations-center/shared/.env`（deploy/tencent/airline-operations-center.service:11-12），CI 明确「Verify the actual Linux artifact with PostgreSQL」（.github/workflows/ci.yml:58-59）；云库升级演练覆盖 017-029 迁移（docs/PRODUCTION_CUTOVER_CHECKLIST.md:25，文档旁证）。**具体 SQLite/PG 服务器版本未在仓库内固定**（无 engines 字段锁定数据库版本）。
- **迁移纪律**：`migrations/001…029`（PG SQL，唯一权威清单）；SQLite 侧启动 `ensureColumn` 补列（S:186-189）；`scripts/check-migration-policy.mjs` 以显式 baseline SHA 校验「已存在迁移文件不可修改、只允许新增」（git diff --name-status 只允许 A）。
- **SSE**：两条流——
  - `event: maintenance`（端点 S:7583-7588，连接即发 `type:"maintenance.connected"` + `version`，`retry: 3000`）；
  - `event: info`（S:8407-8410，data kind：`connected/content/scope/receipt`，S:9085）；
  - 另有 `event: access-revoked`（S:7175、S:9077）。
  - maintenance 事件广播：`bumpMaintenanceVersion(flightId, eventType="maintenance.updated")`（S:205-213，写 `maintenance_sync_state.version` + 推送所有 client）。**事件类型清单（逐字）**：`maintenance.connected`、`maintenance.updated`（默认）、`maintenance.location.corrected`（S:7657）、`maintenance.nonroutine.draft.deleted`（S:7692）、`maintenance.${reportType}.draft.saved`（S:7705）、`maintenance.nonroutine.saved`/`maintenance.${type}.submitted`（S:7729）、`maintenance.report.confirmation.saved`/`maintenance.report.finalized`（S:7742）、`maintenance.dispatch.imported`（S:7797）、`maintenance.subtasks.imported`（S:7890）、`maintenance.imported`（S:7940）、`maintenance.flight.created`（S:7951）、`maintenance.remark.updated`（S:7979）、`maintenance.review.saved`（S:7997）、`maintenance.flight.updated`（S:8037）、`maintenance.flight.deleted`（S:8048）、`maintenance.nonroutine.created/updated/deleted`（S:8065/8080/8092）、`maintenance.dispatched`（S:8110）、`maintenance.release.submitted`（S:8124）、`maintenance.rules.updated`（S:8186）、`maintenance.hours.adjusted`（S:8266）。
  - 前端：`maintenanceEventSource`（A:160、A:5639-5640 管理）；收到同步事件 → `refreshMaintenanceFromSync(version)`（A:5610-5626），**编辑器打开时挂起**（`maintenanceRefreshPending`），关闭后 `flushMaintenancePendingRefresh()` 统一刷（A:5628-5632）；信息页另有独立 EventSource（A:911-912）。

## 18. 主分支与开发线关系、CI 覆盖、正式部署状态

**现状（git 实测 + 配置文件；文档结论标注旁证）。**

- **分支关系**（git branch -vv / log 实测，2026-11-08）：
  - 权威主线 = `origin/main` @ `5e090b4`（PR #32 已合并）；**本地 `main` 分支落后 origin/main 50 个提交**（纯本地未更新，不影响权威性）。
  - 8788 工作树（本工作树）= `codex/maintenance-personnel`，已快进 = origin/main，**远端同名分支仍停在 PR #23 时的位置（本地 ahead 34）**——下次推送建议用新远端分支名，勿把 main 历史推回旧 PR 分支。
  - 8787 工作树 = `codex/info-rbac` @ `9ec6e67`（11-06 嵌入式浏览器弹窗替换），**有 16 个提交未合入 main**，且未设置上游分支。
  - 考勤线 8792 = `~/Documents/航线中心考勤统计项目` 的 `codex/attendance-leave`，已随 PR #24-32 全部进 main（docs/LOCAL_DEVELOPMENT_WORKTREES.md：考勤真实执行入口归属 8792，文档旁证）。
  - 开发入口与分支绑定：`LOCAL_DEVELOPMENT_PROFILES`（local-development.mjs）`maintenance-personnel → 端口 8788`（维修管控、人员能力、审计与备份）、`info-rbac → 8787`、`attendance-leave → 8792`；启动时校验「已登记 git 工作树 + 分支名匹配 profile」，**在本分支开发是工具链强制的正确选择**。
- **CI（.github/workflows/ci.yml）**：npm ci → `npm run check` → `npm run check:development` → 迁移策略校验（显式 baseline SHA）→ `npm run migrate` ×2 → `scripts/attendance-postgres-check-isolated.mjs` → **`npm test`（全量）** → `npm audit --omit=dev --audit-level=high` → 构建前端资产 → 打 release 包 → **用 PostgreSQL 验证 Linux 发布包**（ci.yml:40-59）。
- **发布（release-production.yml）**：仅手动触发、只允许 main 最新提交 + 该提交 push CI 成功 + production 环境审批（release-production.yml:44-50）；腾讯云轮询代理取包。
- **deploy/tencent 脚本族**：systemd `airline-operations-center.service`（node server.mjs）+ deploy/rollback/health-check/migrate/backup 脚本 + backup/deploy 定时器 + `release-poller.sh` 轮询 + `build-release.sh` 打包（含 node_modules）+ nginx 配置。
- **正式部署状态**（docs/DEPLOYMENT_HANDOVER_2026-10-27.md 与 docs/PRODUCTION_CUTOVER_CHECKLIST.md，**文档旁证**）：全量数据导入仅允许空业务目标或与检查点一致的重跑；发布失败自动回退代码链接但数据库不自动回退；云端读取/真实数据切换/手动生产发布/三个长期工作树切换均须按阶段另行授权，**文档明确「不宣称生产验收通过」**；交接文档记录当时全量测试 253 项中 1 项查询预算失败（后续该断言已在后续提交修复为 441/441 通过）。

---

## 附：负面结论汇总（源码中明确不存在的项）

| 项 | 结论 |
|---|---|
| 「退回/撤销/重派」独立 API | 未找到（等价路径见 §2） |
| 首页带参跳转维修页 | 未找到（仅模块内 data-maint-* 跳转） |
| 「八类」比例提法 | 未找到（实际 4 种 rule_type + 机型组） |
| `hourCategory` / `NONROUTINE` / `channel` 字段 | 未找到（现行 owner_type + source） |
| 非例行标准库（表/服务/API） | 未找到（类别硬编码 + Excel 导入） |
| 后端机型字典表 / 机型映射种子 | 未找到（前端常量 + 机型组 codes 精确匹配） |
| 「驳回」概念（复核） | 未找到（confirm/save 两动作 + invalidate 变通） |
| 模块级 feature 开关（维修） | 未找到（RBAC + 导航 + 机型组 enabled 三层门） |
| 非例行规则版本快照 | 未实现（例行侧已有 routine_hours_snapshot） |
| 派工时的资质/法定检验资格联动校验 | 未实现（字段未混用但也无校验） |
| 「全选/批量添加」按钮（人员选择器） | 未找到（多选勾选替代） |
| 报工人自助撤销放行报工 | 未找到（提交即锁） |
