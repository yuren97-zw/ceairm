# B5 维修线整合方案（设计稿，待批准）

日期：2026-11-21 · 作者：ZCode（RBAC V1.1 执行线）· 状态：**设计交付，未实施**

## 1. 事实基线（本次实测）

- B 工作树 `codex/maintenance-personnel` @ `2466880f`，相对 main@89b748a：**1137 个文件变更、+791,647/-5,501 行、1063 个新增文件、B 独有 8 提交**（main 领先 B 56 提交）。
- B 是完整的维修管控 V10.1 业务线：非例行 12 人评议/终审、标准库与独立发布、工时账期/跨期授权、非结算 workflow、更正工作台、导入导出、验收证据（docs/evidence/）。
- B 的 `local-development.mjs` 仍有未提交修改（**活跃开发中，未冻结**）。
- 迁移：main ≤035 + 本线 037（B4 候选表，036 预留 C 线）；B 独有 036-059 共 24 个。
- 权限：main 97 + B1-B4 未新增；B 目录 105（17 项维修增强、缺 main 的 9 项交接/考勤抵消码）。
- 本线 B1-B4 四个提交（599944e/19b5c4b/f5d054e/c38d560）**尚未推送、未进 main**。

## 2. 路径选择

| 路径 | 说明 | 判断 |
|---|---|---|
| **A. B 合并 main（推荐）** | 本线 B1-B4 先进 main → B 线冻结收尾 → 在 B 分支 merge main 解冲突 → 全量回归后合 main | 80 万行只能走 git 合并；冲突集中在 4 个文件（见 §4） |
| B. main 逐块摘取 | 手工移植 B 功能 | 不现实（体量与业务耦合） |
| C. 维持双线 | 各自演进 | 权限目录/迁移编号持续漂移，与 V1.1"生产期一套统一系统"相悖 |

## 3. 前置条件（缺一不可）

1. 本线 B1-B4 推送 + PR + 合并 main（需授权；PR 前建议先让 C 线的 2 提交进 main，本线 rebase 消 036/037 编号顾虑——037 已物理占用，C 的 036 合入时若与本线 037 冲突以先合者为准，迁移文件名不冲突）。
2. B 线冻结：Codex 会话提交 `local-development.mjs` 修改并推送 B 分支（**由用户协调，本线不动 B 工作树**）。
3. 用户确认合并窗口（避开两条活跃线同时在改 db.mjs/public/app.js）。

## 4. 合并热点与处理

| 文件 | 冲突源 | 处理 |
|---|---|---|
| `rbac-policy.mjs` | B 新增 17 权限码 + 13 预置角色 vs main 的 B1-B4 无权限变更 | 机械并集：97+17=114 码；B 缺的 9 项（交接 5 + 考勤抵消 4）以 main 为准自动保留；矩阵测试基线更新为 114/38 |
| `migrations/` | B 036-059 与 main 036(C)/037(B4) 撞号 | **B 的 24 个重编号为 038-061**（映射表见 §5），文件内容不变；合并前在 B 侧重命名并跑一次全量迁移验证 |
| `server.mjs` | B 的路由段 vs main 的交接/考勤/RBAC B1-B4 改动 | 逐路由段手工合并；重点保护 B3 的 requireTeamLeader 五入口与 B4 的 offset 路由段 |
| `db.mjs` / `public/app.js` / `deploy/*` | 双线共改 | 以 main（含 B1-B4）为基准，B 侧改动逐 hunk 审 |

## 5. 迁移重编号映射（B → 目标）

| B | 目标 | 内容 |
|---|---|---|
| 036_nonroutine_review_suggestions | 038 | 评议建议 |
| 037_nonroutine_assessment | 039 | 评议 |
| 038_nonroutine_finalization | 040 | 终审 |
| 039_maintenance_hour_periods | 041 | 工时账期 |
| 040_nonroutine_adjustments | 042 | 更正 |
| 041_nonroutine_cross_period | 043 | 跨期授权 |
| 042_nonroutine_notifications | 044 | 通知 |
| 043_nonroutine_posting_receipts | 045 | 入账回执 |
| 044_maintenance_standard_management | 046 | 标准库 |
| 045_nonroutine_role_results | 047 | 角色结果 |
| 046_maintenance_standard_review | 048 | 标准评审 |
| 047_maintenance_standard_notifications | 049 | 标准通知 |
| 048_maintenance_standard_publication | 050 | 独立发布 |
| 049_maintenance_manual_sources | 051 | 手册来源 |
| 050_work_standard_intake | 052 | 工作标准接入 |
| 051_maintenance_standard_import | 053 | 标准导入 |
| 052_maintenance_module_instances | 054 | 模块实例 |
| 053_nonroutine_corrections | 055 | 更正工作台 |
| 054_maintenance_workflow_tasks | 056 | 非结算任务 |
| 055_maintenance_rule_history | 057 | 规则历史 |
| 056_maintenance_report_source_journal | 058 | 报告来源日志 |
| 057_maintenance_review_addition_sources | 059 | 评议增补来源 |
| 058_standard_effective_refresh | 060 | 标准生效刷新 |
| 059_overnight_feedback | 061 | 隔夜反馈 |

（B 代码内若按文件名引用迁移需同步改名引用；`createOffsetService` 等按文件路径读迁移的调用点一并核对。）

## 6. 分批实施（批准后）

| 批 | 内容 | 验收 |
|---|---|---|
| B5-0 | B1-B4 推送+PR+合 main | CI 绿、矩阵 97/25、生产发布后 health 正常 |
| B5-1 | B 线冻结（用户协调 Codex 会话） | B 工作区 clean、分支已推送 |
| B5-2 | B 侧迁移重编号 038-061 + 全量迁移跑通（隔离库） | 迁移唯一性测试 |
| B5-3 | B merge main，解 §4 冲突 | 全量 npm test + 三冒烟 + 矩阵 114/38 |
| B5-4 | PG 路径验证（隔离 PG 库）+ A20 业务回归（12 人评议/终审/发布/账期） | 验收清单记录 |
| B5-5 | 合并 PR → main → 生产发布 | 生产 health/回归 |

## 7. 风险与停止条件

- B 未冻结即合并 → 覆盖他人工作（V1.1 §12 停止条件），**B5-1 是硬前置**。
- 036 撞号若 C 线先合：C 的 036_attendance_single_cap 与 B 重编号后的 038 不冲突，无需再动。
- 评议/终审的实时资格（currentMaintenanceReviewActor）与 B3/B4 的职位身份校验并存——合并后需专项核对"维修增强不绕过新身份规则"（A16/A21）。
- 回退：合并 PR revert；迁移重编号在 B5-2 阶段可整体还原。
