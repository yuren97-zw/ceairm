# P0-37/38 只读梳理：标准版本、分配比例版本、原提报快照与当前重算路径（2026-11-17）

> 只读梳理档案，零代码改动。原 V10.1 方案未恢复；本文只记录当前实现事实与既有证据，不推定新规则、不修改版本适用或重算策略。「在途比例冻结」按用户既有决定理解，**不泛化**到其他规则场景。

## 一、四体系代码地图

| 体系 | 关键位置 | 事实 |
|---|---|---|
| 在途分配快照冻结 | `nonroutine-frozen-policy.mjs:7-19`（frozenNonroutineFinalPolicy）；接线 `server.mjs:2490`（capturePolicy） | 终审分配**只读评议案建立时存的 `policy_json`**（提交时快照），文件头注释明确"Never read"当前规则；ROLE_COMBINATION 的 ratios/combinations 也取自冻结快照而非当前配置库 |
| 原提报快照 | 评议案创建 `nonroutine-review.mjs:141`（application_json/participants_json/policy_json 随案落库）；认定 `server.mjs:6301`（assessments 同存）；批次/条目版本化（`upsertMaintenanceReportBatch` version 递增）；来源档案 056 观察留存 | 提报时刻的五项、人员、策略全文快照多层留存；修订=新批次版本，旧版本不覆盖 |
| 分配比例版本 | `maintenance_hour_rules`（nonroutineCombinationRatio 七组，运行权威）；变更历史 055 `maintenance_rule-history.mjs`（前后 JSON、操作者、原因）；`configurationVersion` 仅属新提报冻结出处 | 后台改比例不影响任何在途/已确认事项；未知历史维持未知（恢复文档 055 节明确不得倒填） |
| 标准库版本 | `maintenance_standards`/`maintenance_standard_versions`（草稿→评议→发布）；匹配项锁定 standardId+standardVersion；引用量只读投影 | 已绑定项锁版本；后出现唯一标准→提交前 409 需人工确认（I-12，evidence/maintenance-v101-later-unique-reference-20261115）；预览后版本失效→resetStandardChoice 重匹配（v53，evidence/maintenance-v101-import-preview-rematch-20261115） |

## 二、当前行为矩阵（按 P0-37/38 场景）

### P0-37「V1→V2 相同工作仅工时变化，未确认」

| 变化来源 | 当前行为 | 证据 |
|---|---|---|
| 标准库发布 V2（同定义、工时不同） | 已提交/在途项**不自动采用** V2：工时来自提报快照；草稿在提交时重校验版本，失效即阻断/要求重选（409） | later-unique-reference、import-preview-rematch 两证据目录 |
| 报工人修订工时（重新提交） | 新批次版本+新快照，旧版本保留；CAS/版本冲突 409 | 既有批次版本化用例（如 locked-import-history） |
| 后台改分配比例 | 在途**沿用提报时快照**（用户已决定，frozenNonroutineFinalPolicy）；已确认不重算 | approved-policies-20261111、rule-history-20261113 |
| 已确认后比例变化 | 不重算；更正走独立授权差额（053） | correction-foundation/services 两证据目录 |

**解读分歧（须原方案澄清）**：P0-37"当前待复核按明确适用条件重算"一句中的"明确适用条件"在原文缺失状态下**无法确定**——当前实现中不存在对 pending 项的自动重算路径（唯一"重算"是报工人重新提报=新版本，或终审时用冻结快照分配）。不据此新增重算逻辑。

### P0-38「V1→V2 定义/适用范围改变或原工作已确认」

| 场景 | 当前行为 | 证据 |
|---|---|---|
| 定义/范围变化（不同标准/内容） | 视为新工作身份；已提交项内容锁（通用内容维护对已提报来源 409、审计失败整笔回滚）；预览后范围变化重匹配 | content-source-lock-20261113、import-preview-rematch |
| 审核期间原工作事实被改 | 终审预览显示 SOURCE_FACTS_CHANGED，须显式核实 token；终审后事实再变→SOURCE_FACTS_CHANGED_AFTER_FINALIZATION 挂起，不静默入账 | T5b/四阶段 API 用例（本轮）、source-facts-20261111 |
| 已确认 + 类别/策略变化 | 终审独立快照 + **一次性追加渠道**（ADJUSTED_CLOSED、adjustments 表净额），原报工/架次逐字节不变；MERGED 通道不重开 | 本轮 T5b 用例（finalization-timing-20261117） |
| 已确认 + 已入账后更正 | 独立授权差额/冲销，不重开原通道 | corrections 系列（053） |
| 状态机保护 | preserveConfirmed：任何 reconcile/SSE 重放不把已确认降级 | server.mjs:4081/4096；恢复文档各节 |

## 三、已明确事项（不再当待决）

- 在途终审用提报时比例快照（用户决定 call_dd4fb370…）。
- 已确认不可降级、不可静默重算；变更走终审快照/一次性追加或授权更正。
- 未知历史（无版本/版本0）维持未知，不倒填、不重算。
- configurationVersion 只作为新提报冻结出处。

## 四、待原方案恢复后需逐条对照的开放点

1. P0-37"明确适用条件重算"的确切条件与触发方（报工人/负责人/终审人）。
2. "相同工作"的判定口径（同标准ID+版本？同 fingerprint？人工确认？）。
3. V1→V2 仅工时变化时，pending 项是否允许/要求在新提交时自动升级引用（当前：阻断+人工重选）。
4. 类别变化与策略版本变化的组合门槛（P0-65/90/93 相关联动）。

## 五、本轮改动清单

零业务源码改动。本文件为唯一产物；台账 P0-37/38 维持 pending（只读梳理不构成适用范围证据）。
