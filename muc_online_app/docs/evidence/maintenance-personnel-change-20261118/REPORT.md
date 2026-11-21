# P0-36/41/92 行596 人员变更来源更正——场景贯通验收（2026-11-18）

原文行596：审批已认定但机会未确认后发生撤回/人员变更——应在原事务处理实际变更、审定工时
可保持、个人分配投影按有权变更结果重新核对；工作事实变更暂停后续转正按5.13。

## 发现与结论

**该功能链路实现已存在**（裁决三曾判②待实现——经查为①已实现缺场景验收）：
- `maintenanceRecognitionAssignments`（server.mjs:2681）把当前参与事实映射到终审核实角色
- 树保存路径在**原事务**内重写投影（delete+insert），经 `projectRecognitionAllocations`
  按人重挂认定分配；无法映射→409"当前参与事实与终审核实角色无法合法关联"
- 终审锁定（改写409）、更正域（差额/冲销）承接无法映射场景

## 贯通用例（targeted + 双配置 876/876）

`post-finalization personnel change keeps the approved finalization and pauses promotion
until authorized correction`（2027-10 月）：
1. 建案至 MERGED_CLOSED（2人 主做1.2/检验0.8、待复核）
2. **角色变化**（检验→辅助）树保存=200：原事务处理 ✓；finals 行逐字节保持（审定保持 ✓）；
   投影按新参与事实重写且**认定金额保持**（同人同额1.2/0.8）✓；保存不转正（仍待复核）✓；
   sourceFacts.changed+participantsChanged 检出 ✓；不产生更正行 ✓
3. **删除参与人**（主做）树保存=409 无法合法关联（暂停+指向人工核对）✓；整批确认亦 409 ✓；
   拦截后 finals/投影/状态全部不变、零更正行 ✓
4. 授权更正通道可达（nonroutine-corrections/sources）✓

## 台账动作

P0-36/92/41 的"实际施工人员变化来源更正"残留闭合（①场景验收补齐）；剩余=局部范围/跨进程
开放矩阵与外部项。
