# P0-67/90/141 裁决A实现：终审预览只读配置版本漂移提示（2026-11-18）

用户裁决（2026-11-18 会话，上文 A）：保持在途冻结计算，终审预览增加只读提示。

## 实现

- `nonroutine-finalization.mjs`：新增可选注入 `currentRuleVersion`（缺省 `()=>null` →
  configDrift=null 不提示，隔离夹具不受影响）；preview 返回 `configDrift`
  （boolean|null）=冻结快照版本哈希（`policy.version`，64位hex）≠当前规则内容哈希。
  计算路径零变化——`frozenNonroutineFinalPolicy` 仍不读当前规则；configDrift 不参与
  policyChanged/policyToken/入账语义。
- `server.mjs` 接线：`currentRuleVersion` = sha256(当前 nonroutineCombinationRatio 全表行
  JSON)——与 captureMaintenanceNonroutinePolicy 提报时哈希同公式（行430 快照可比较性）。
- `public/nonroutine-finalization-view.mjs`：预览卡在漂移时显示"配置版本已独立变化
  （只读提示）：分配仍按原提报冻结比例执行；启用新版本须按制度另行批准。"

## 验证

- 专项用例 `finalization preview surfaces read-only config version drift while allocation
  stays frozen`（2027-08 月）：未变规则→configDrift=false；直接改规则行（模拟有权调比发布）
  →configDrift=true 且 policyChanged/rolesChanged 语义不变、预览分配金额=冻结比例；
  终审 MERGED_CLOSED 且入账工时=冻结比例（非新规则值）；finally 恢复规则行。
- 单测模块文件 9/9（DI 缺省路径）；sqlite 双配置 **874/874**（npm exit=0）。
- 修复过程：初版直查 maintenance_hour_rules 使模块隔离单测夹具（无该表）失败
  （874/872）——按模块 DI 惯例改注入后全绿；教训记录：跨域表读取一律注入。

## 残留

漂移提示的**页面显示**（视图文案在真实浏览器中的呈现）归 page-evidence-r2 取证后，
P0-67/90/141 可随共享界面证据升级。
