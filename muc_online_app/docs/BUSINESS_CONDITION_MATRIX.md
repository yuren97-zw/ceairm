# 业务条件矩阵（V1.1 §4.2 授权路径的"业务条件"要素）

日期：2026-11-25 · 状态：**落地矩阵 + 静态守卫**（S5）· 配套：`tests/business-condition-audit.test.mjs`

## 背景

V1.1 §4.2 要求每条授权路径 = `主体/来源角色 + 资源类别 + 动作 + 对象范围 + 业务条件 + 字段范围 + 有效期`。
其中 **动作**（权限码 → 绑定表）与 **对象范围**（模块 + 资源级 scope）已由 #6 的 S1–S4 实现；
**业务条件**按其性质由各服务在动作执行处强制，本矩阵把它们逐条登记到代码位置，并用静态守卫测试防止被删除或绕过。

原则（§4.2）：**强制限制先于普通允许**；超级账户不豁免业务身份限制（业务函数独立校验，不因 `system_admin` 放行）。

## 业务条件矩阵

| # | 业务条件 | 语义 | 强制执行点 | 守卫测试断言 |
|---|---|---|---|---|
| C1 | **禁止自审** | 考勤抵消/责任核实中申请人不得审批本人；责任核实的组长不得是本人 | `attendance-offset-service.mjs` decide 可见性（`row.person_id===user.personId` 排除）；`verifyLeader`（`leader.personId===employee` 拒绝）；转办/责任核实自审限制 | 服务源码含上述两处判定 |
| C2 | **班组长资格** | 交接创建/草稿/提交/接收全部要求"当前有效班组长"（精确职位，超账不豁免） | `handover-service.mjs` `requireTeamLeader`（6 个办理入口）；接收人 SQL `position_code='班组长'` | `requireTeamLeader` 出现 ≥5 次；班组长过滤 SQL ≥2 处；实现内无 system_admin 旁路 |
| C3 | **任职资格每请求重读** | 资格失效（离职/停职/账户停用）立即生效，不等 session 过期 | `server.mjs` `currentMaintenanceReviewActor`（重读 users+personnel active）、`currentOffsetActor`；`maintenanceWorkflowPerson`；`maintenance-standard-publication-authority.mjs` `standardPublicationAuthorized`（排除离职/停职且**显式排除 system_admin 角色**） | 上述函数存在；发布资格含 `employment_status not in ('离职','停职')` 与 `r.code<>'system_admin'` |
| C4 | **原业务状态 + 并发（CAS）** | 版本/令牌不匹配一律 409，不覆盖他人修改 | 维修：`expectedUpdatedAt`、`MAINTENANCE_REPORT_CONFLICT`（409）、评议 `revision`/`expectedPolicyToken`/`sourceFactsToken`；考勤抵消 `version`（`申请已变化` 409） | `MAINTENANCE_REPORT_CONFLICT`、`expectedUpdatedAt` ≥10 处、`申请已变化` 存在 |
| C5 | **强制限制先于允许** | 身份/资格校验先于权限判定或与之并列，拒绝语义不因高权限放宽 | 交接 `requireTeamLeader` 在权限判定之前；发布资格独立于 `hasRbac`；超账在 `activeScopes` 得 `all` 但业务函数仍拒绝 | `standardPublicationAuthorized` 源码包含 `r.code<>'system_admin'` |
| C6 | **字段范围** | 敏感字段按权限+范围遮罩，不返回再前端过滤 | `personnel-access.mjs` `redact` + `ACTUAL_GRADE_MASK`（岗级）；无 `personnel.qualification.view` 时删授权/培训计数 | `redact` 存在；`ACTUAL_GRADE_MASK` 使用 |
| C7 | **有效期** | 范围行 `valid_from`/`valid_to` 内存过滤，空串=不限 | `personnel-access.mjs` `activeScopes` 的 `Date.parse` 过滤；`scopeDate` 时区归一 | `activeScopes` 含 `validFrom`/`validTo` 解析 |
| C8 | **超账不豁免业务限制** | 超级账户保留系统维护能力，但不因超管身份通过业务身份校验 | 见 C2/C3/C5：交接身份、发布资格、在职检查均不查 super | 发布资格排除 `system_admin`；交接资格无超级旁路 |

## 未统一项（诚实登记）

1. 业务条件目前**不在绑定表结构中表达**（绑定表覆盖 动作→模块/资源），条件以代码+本矩阵+静态守卫维护；若未来需要"规则可配置"，应单独立项（V1.1 第一阶段明确不引入通用 deny 规则编辑器）。
2. 非例行评议的"参与人不得终审"属于**用户明确不做**的避席硬校验（2026-11-22 定稿：靠线下制度），不作为本矩阵守卫项。
3. 条件拒绝的审计粒度：权限拒绝有 `audit("permission_denied")`；范围拒绝为 404 防探测、业务条件拒绝为 403/409 带业务文案，未统一为"授权决策日志"（远期项）。

## 交叉引用

- 动作与范围：`rbac-policy.mjs` `ACTION_SCOPE_BINDINGS`；`personnel-access.mjs` 资源级 scope（S4）
- 静态守卫：`tests/business-condition-audit.test.mjs`（本矩阵逐条断言）
- 语义表：`docs/DATA_SCOPE_SEMANTIC_TABLE.md`
