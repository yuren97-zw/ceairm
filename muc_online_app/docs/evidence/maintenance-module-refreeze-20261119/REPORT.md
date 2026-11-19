# P0-60 实现：进行中机会的模块规则有权变更（重冻结）路径（2026-11-19）

用户裁决（2026-11-19）：批准实现（P0-06 同时裁决维持零写入）。

## 实现（原文行1103：默认冻结；有权变更必须影响分析、版本审计并显式批准）

- `maintenance-module-instances.mjs` 新增 `refreezeMaintenanceModuleIdentity`：
  - 显式 `approved===true` 必填；影响分析 20–4000 字必填
  - 已确认/已归档机会 409 拒绝（须走更正/归档授权）
  - 快照重冻结到当前规则常量（snapshot_json/content_sha256/gate_rule_version），
    全部实例（含扩展实例）gate_rule_version 同步；全局规则行与定义行幂等确保
  - 返回前后快照指纹供审计
- `server.mjs` 路由 `POST /api/maintenance/flights/:id/module-rule-refreeze`：
  maintenanceExtensionAuthorized（模块管理权限）+ NONSETTLEMENT 开关；
  maintenanceTransaction 内执行；**双审计事件**（module_identity_refreeze 含
  actorQualification + module_rule_change_approved 批准事实）；版本 bump
- 默认冻结语义零变化（register 的 expectedRuleSnapshot 校验、快照不可变读取全部保持）

## 验证（877/877 双配置）

专项用例：身份损坏（旧规则）→读取失败；无权限 403/未批准 400/分析不足 400；
授权重冻结→快照恢复当前指纹+实例同步+身份读取 200+双审计；已确认机会 409。

## 台账

P0-60 → verified（行为=专项用例；界面不适用——管理 API 操作，原文行1103 无界面要求，
模块族工作台非阻断声明=r9）。
