# 审计模块后续设计草案（含授权决策日志）

日期：2026-11-25 · 状态：**设计草案（未实施）** · 作者：ZCode 会话
配套：`docs/DATA_SCOPE_SEMANTIC_TABLE.md`、`docs/BUSINESS_CONDITION_MATRIX.md`、RBAC #6 的 S1–S5 批次

## 1. 背景与目标

现状（已核实）：
- **业务操作审计**：`audit()` 写入 `audit_logs`（user_id / action / target_type / target_id / detail / created_at），覆盖人员、账户、维修、考勤等业务动作，权限拒绝以 `permission_denied` 记录。
- **登录审计**：`login-audit.mjs`（PR#66）提供登录事件查询与 Excel 导出，设置→审计页签当前主要展示这一类。
- **缺口**：只有"拒绝"被当普通操作记录；**允许决策、范围判定（模块/资源）、业务条件（C1–C8）维度缺失**；无统一查询/导出；审计页未覆盖业务操作审计与授权决策。

目标：把审计收敛为**单一审计域、四类事件、统一检索/导出/保留**，其中授权决策日志（本设计核心新增）让"为什么允许/拒绝"可追溯，同时保持对外 404 防探测不变（日志仅内部可查）。

## 2. 事件分类模型

| 类别 | event_class | 现状态 | 说明 |
|---|---|---|---|
| 业务操作审计 | `data_change` | ✅ 已有（audit_logs） | 谁改了哪个对象（字段级 old/new 在专门变更日志） |
| 登录/会话审计 | `auth_session` | ✅ 已有（login-audit） | 登录成功/失败/改密/踢会话 |
| **授权决策审计** | `authz_decision` | ❌ 本设计新增 | 每次权限/范围/条件判定的结果与原因 |
| 系统运维审计（可选） | `ops` | ❌ 远期 | 迁移执行、清理任务、发布版本 |

## 3. 授权决策事件字段（核心）

一条 `authz_decision` 事件至少包含：

| 字段 | 示例 | 说明 |
|---|---|---|
| `user_id` / `user_name` | `u-…` / `赵威` | 主体 |
| `roles_snapshot` | `manager,addon_nonroutine_review_finalizer` | 决策时的有效角色（快照，便于事后解释） |
| `permission` | `maintenance.nonroutine.review.finalize` | 动作（权限码） |
| `scope_module` / `resource` | `maintenance` / `review_case` | 来自 `ACTION_SCOPE_BINDINGS`（S4） |
| `target_type` / `target_id` | `flight` / `mtnf-…` | 对象标识（不落 payload） |
| `decision` | `allow` / `deny` / `not_found` | 结果（`not_found` 对应 404 防探测场景） |
| `reason_code` | `PERMISSION_MISSING` / `SCOPE_MISMATCH` / `CONDITION_FAILED` / `STATE_CONFLICT` | 原因码（枚举） |
| `condition_code` | `C1_SELF_APPROVAL_DENIED` / `C2_TEAM_LEADER_REQUIRED` / `C4_CAS_CONFLICT` | 业务条件（与 `BUSINESS_CONDITION_MATRIX.md` C1–C8 对应） |
| `scope_match` | `all` / `department` / `self` / `—` | 命中的范围类型（不落具体组织行，避免冗余） |
| `route` / `method` / `request_id` | `/api/maintenance/…` / `POST` / `req-…` | 调用上下文 |
| `source` | `ui` / `worker` / `system` | 入口类型 |
| `created_at` / `duration_ms` | ISO / 12 | 时间与判定耗时 |

**隐私红线**：不记录请求体、评审意见、工时数值、敏感字段值；只记录标识与原因码。

## 4. 写入策略（防日志爆炸）

| 决策类型 | 采样策略 |
|---|---|
| **拒绝**（权限/范围/条件/冲突） | **全量**记录（安全价值最高） |
| **写操作允许**（POST/PUT/DELETE/PATCH 的动作） | **全量**记录（audit 级要求） |
| **读操作允许** | **窗口去重**：同 `user + permission + resource` 每 60s 记录一次（可配 `MUC_AUTHZ_LOG_READ_WINDOW`）；命中窗口内的请求不落库 |

- 写入路径：拒绝同步写（与请求同生命周期，失败只告警不阻断业务）；读允许走进程内批量队列（flush 间隔 5s，`unref` 定时器），批量插入降低 IO。
- 与现有事务：授权审计**不加入业务事务**（避免回滚丢审计/审计失败回滚业务）；业务操作审计维持现状（服务内调用）。
- 404 防探测：对外响应不变（范围外仍 404）；`decision='not_found'` + `reason_code='SCOPE_MISMATCH'` 仅内部可见，查询权限 `audit.read`。

## 5. 存储方案

**推荐方案 A：扩展 `audit_logs`**
- 新增列（可空）：`event_class`（默认 `data_change`）、`permission`、`scope_module`、`resource`、`decision`、`reason_code`、`condition_code`、`scope_match`、`route`、`method`、`request_id`、`source`、`duration_ms`、`roles_snapshot`。
- 旧行回填 `event_class='data_change'`。
- 索引：`(event_class, created_at)`、`(user_id, created_at)`、`(permission, created_at)`、`(decision, created_at)`。
- 迁移编号顺延（当前 071），SQLite 由 `migrateIdentity` 风格重建或 `ensureColumn` 增量（列可空无重建必要，仅加列+索引）。
- 对比方案 B（独立 `authz_audit_logs` 表）：隔离更彻底但查询/导出/保留/界面全套要重复一遍；推荐 A，量级真正成为问题再迁出（PG 按月分区）。

**保留**：沿用 D07 审计 3 年；若授权决策量级大，可单列 1 年（需用户决策，见 §9）。

## 6. 查询与界面（设置 → 审计页重构）

- 三类页签：**操作审计 / 登录审计 / 授权决策**（统一 `audit.read` 查看、`audit.export` 导出）。
- 授权决策筛选：时间、主体（姓名/工号）、权限、资源、结果、原因码、条件码、对象。
- 详情面板：决策链路——命中角色 → 权限码 → 范围行（类型）→ 业务条件 → 结果。
- 统计卡片：拒绝 Top N 权限/用户（识别配置缺失或滥用）；404 命中趋势（防探测场景的可观测性）。
- 导出：CSV/Excel，列与筛选一致；**不含任何业务 payload**。

## 7. 运行时接入点（避免散点）

1. **中央决策包装**（新增）：在 `actionScope*` 五个 API 与 `requireRbacPermission/hasAnyRbac` 之上提供统一 `authorize({user, permission, target, route, method})`；拒绝时先记日志再抛错。已有调用点逐步迁移或通过包装保持兼容（S2 兼容原则）。
2. **错误对象统一 code**：业务条件拒绝在服务内抛出时携带 `code`（如 `SELF_APPROVAL_DENIED`、`TEAM_LEADER_REQUIRED`、`CAS_CONFLICT`），由顶层错误处理**记录一次**（避免每层重复记）。
3. **读允许去重**逻辑放中央包装，不散落各路由。
4. **超级账户**：超账决策照常记录（`roles_snapshot` 含 system_admin），便于审计"超账代操作"。

## 8. 分阶段实施

| 批次 | 内容 | 规模 |
|---|---|---|
| **A1** | 事件模型+迁移（扩展 audit_logs）；拒绝全量 + 写允许全量；审计页"授权决策"页签 + 筛选/导出 | 1 个 S 批次 |
| **A2** | 读允许窗口去重 + 批量队列；Top N 统计卡片；与 `BUSINESS_CONDITION_MATRIX` C1–C8 的 condition_code 全量接线 | 1 个 S 批次 |
| **A3** | 保留清理接入（清理工具增加 authz 组）、归档导出、性能压测（P95 增量 <5%）与大表索引/分区评估 | 0.5 个 S 批次 |

## 9. 待用户决策

| # | 决策点 | 建议 |
|---|---|---|
| D1 | 读允许是否记录 | 窗口去重记录（60s/用户/动作/资源）；可配置关闭 |
| D2 | 授权决策保留期限 | 与审计一致 3 年；若量级超预期再降为 1 年 |
| D3 | 业务用户是否可见"被拒原因" | 不可见（维持 404/403）；仅 `audit.read` 管理员可查 |
| D4 | 是否记录 detail（对象标识） | 记录 id 级标识，不记录任何业务字段值 |

## 10. 验收要点

1. 四类原因码（权限缺失/范围不匹配/条件失败/状态冲突）的拒绝事件 100% 落库；对外响应与现状一致（404/403/409 不变）。
2. 写操作允许全量；读允许不超采样预算（可通过配置断言单测验证窗口去重）。
3. 审计页三类页签的筛选/分页/导出与 `audit.read/export` 一致；导出无业务 payload。
4. 性能：读路径去重后写入 P95 增量 <5%（用 `scripts/benchmark-*` 模式压测）；清理工具覆盖 `authz_decision`。
5. 与 S5 矩阵联动：`condition_code` 与 C1–C8 一一对应，`tests/business-condition-audit.test.mjs` 断言映射存在。

## 11. 风险与未决

- **日志量**：读允许即使 60s 去重，多用户多权限仍可能可观——A1 先只做拒绝+写允许，A2 再评估读采样。
- **写放大**：批量队列在进程崩溃时可能丢失尾部（可接受，允许决策非关键）；拒绝为同步写不丢失。
- **多实例**：去重窗口是进程内状态，多实例会重复记录（可接受；如需精确需 Redis/DB 窗口）。
- **SQLite/PG 差异**：新列可空、索引独立，沿用双引擎兼容写法；量级大时仅 PG 需分区。
- **与其他会话的并行**：迁移编号与 `server.mjs` 写入口需与 Codex 线协调（沿用迁移编号避让惯例）。

## 12. 与现有文档关系

- 动作/范围：`ACTION_SCOPE_BINDINGS`（S1）、运行时绑定（S2）、资源级范围（S4）
- 业务条件：`docs/BUSINESS_CONDITION_MATRIX.md`（C1–C8，S5）
- 数据范围语义：`docs/DATA_SCOPE_SEMANTIC_TABLE.md`
- 保留：D07（审计 3 年）+ `scripts/retention-cleanup.mjs`
