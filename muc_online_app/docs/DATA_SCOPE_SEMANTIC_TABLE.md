# 数据范围语义表（V1.1 §4.3/层③）

日期：2026-11-22 · 状态：**设计交付** · 覆盖 6 个数据范围模块

## 总则

- 数据范围绑定 **用户+模块**（运行时执行层）；**动作→范围的绑定声明登记在 `rbac-policy.mjs` 的 `ACTION_SCOPE_BINDINGS`**（S1，2026-11-25）：每个权限码声明其检查的 `scopeModule` 与 `resource`。
- **S2（2026-11-25）运行时绑定 API**：`actionScopeAllows / actionScopeHasAll / actionScopePredicate / requireActionScope`（server.mjs）——范围模块由绑定表推导，调用点不再手写模块；核心检查函数（评审/变更/派工/更正/跨期/工作流/统计/导出/导入/账户校验）已迁移。未配对动作性检查点预算=0（仅剩通用守卫豁免）。
- 同一模块多范围 **OR 合并**（并集），无有效范围时 **fail-closed**（`0=1`）。
- 缺功能权限 → 403；范围外目标 → 404（不泄露存在性）。
- 超级账户（54002010）在 `activeScopes` 直接返回 `all`，但业务身份限制（自审禁止、班组长资格、独立终审）**不豁免**（V1.1 §4.2）。

## 语义矩阵

| 模块 | 行实体 | 过滤列 | 特殊维度 | 导出/列表一致性 |
|---|---|---|---|---|
| **personnel**（人员与能力） | `personnel` 表全体行 | `id`（self）/ `administrative_team_id` / `personnel_group_id` / `department_id` | 岗级字段（actual_grade）有独立权限三码（view/manage/export）+ 范围内才能看值 | 导出接口与列表共用 `predicate()`；实际岗级遮罩（`redact`）在序列化层 |
| **accounts**（登录账户管理） | `users` 表（通过 `person_id` 关联 personnel） | 同 personnel（账户无独立行级过滤，按关联人员的位置过滤） | 账户停用/密码重置只查权限码，不额外查范围（操作者已在范围内） | 列表接口 `adminUser` 过滤；无导出 |
| **info**（信息传达） | `records` 表（信息卡片） | 行级维度是**发布者账户**（`created_by`），通过 `dataScopeAllowsUser(user, created_by, 'info')` 判定 | 收件人列表（`record_recipients`）独立于数据范围——收件人可见不等于发布者范围内可见 | 导出接口与列表共用范围判定 |
| **maintenance**（维修管控） | `maintenance_flights`（机会）+ `maintenance_assignments`（派工）+ `maintenance_hour_results`（工时） | 机会按**派工参与人**过滤（`maintenanceVisibleFlights`）；派工按参与人+管理范围；工时按 `person_id` | 维修 V10.1 增强后：非例行评议/终审有独立参与者范围（`nonroutineReviewCan`），不走 personnel predicate | 导出（xlsx/html）与列表共用范围；工时确认/复核走 `requirePerson(manager, "maintenance", hour.person_id)` |
| **hours**（工时统计） | `maintenance_hour_results`（汇总视图） | 汇总视图的 `person_id` | **hours 模块当前无运行时范围检查点**（`hours.*` 五码为登记兼容码，代码零引用，见 action-scope-binding-audit 测试）；工时统计实际复用 maintenance 范围 | 导出与列表共用 maintenance 范围 |
| **attendance**（考勤管理） | `attendance_days` + `attendance_offset_*` | `attendance_days.person_id` 通过 `personnelAccess.predicate(user, "attendance")` | 考勤抵消审批人可见性=申请人范围内+审批待办；考勤导出双重校验（权限+fresh 范围快照） | 导出接口在生成前重新读取当前授权（`watermark()` 三次一致性检查） |

## 与角色权限的交互

| 场景 | 判定顺序 | 结果 |
|---|---|---|
| 有权限码 + 范围内 | `hasRbac` ✅ + `allows` ✅ | 200 正常返回 |
| 有权限码 + 范围外 | `hasRbac` ✅ + `allows` ❌ | 404（不是 403——不泄露存在性） |
| 无权限码 + 范围内 | `hasRbac` ❌ | 403（明确告知缺权限） |
| 无权限码 + 范围外 | `hasRbac` ❌ | 403（先撞权限码） |
| 权限来自 addon + 范围来自基础角色 | 权限并集 × 范围并集 | 生效（S1 已用声明+静态审计约束配对；逐动作运行时强制=S2） |

## 已识别的组合风险（V1.1 §4.2 遗留）

**"高权限角色借用另一范围"的组合效果**（审计 M1）：权限并集与范围并集分开计算，可能产生"A 路径的动作借 B 路径的范围"。

S1+S2（2026-11-25）处置：
- 新增 `ACTION_SCOPE_BINDINGS`（116 权限码 → scopeModule/resource，`hours.*` 显式登记为 maintenance，纯系统动作登记 null+原因）；
- 新增 `tests/action-scope-binding-audit.test.mjs`：完整性/hours 登记/静态配对（未配对预算 12 处，S2 须清零）/关键写动作配对（22 个写操作必须有同模块范围配对）/防退化；
- S2 已把动作性未配对点从 12 处降到 **0**（统计/导出/个人统计/阅读统计/导入校验/账户校验改为绑定驱动 API）；仅剩 4 类通用守卫豁免（路由级守卫、payload 人员过滤、事务后置安全网、工具函数定义行），在审计测试中逐条注明原因。

## 交叉引用

- 范围实现：`personnel-access.mjs` `predicate()` / `allows()` / `requirePerson()`
- 权限并集：`server.mjs` `rbacSnapshot()`
- 权限矩阵：`scripts/rbac-permission-matrix-tests.mjs`（114/39）
- 路由审计：`tests/api-route-permission-audit.test.mjs`（层②兜底网）
- 组合权限测试：`tests/server.test.mjs` A16 用例
