# ZCode 执行台账（持久化）— V10.1 剩余范围工作视图

> 目的：总目标第三/六节要求的持久化执行视图。**逐项权威状态以 `docs/MAINTENANCE_V10_1_ACCEPTANCE.json` 为准**；本文件是工作队列（风险排序、分类、批次指派、证据交叉映射），每批更新。生成于 2026-11-17；当前 **155 partial / 55 pending / 0 verified**（verified 需逐项完整适用范围+证据，未凭 partial 比例升级）。

## 四态分类总览

- **A 已实现且证据充分**：0（对应 verified；待逐项完整闭合后由 partial 升级）
- **B 已实现但缺验证**：全部 155 partial + 大部分 pending（见下簇）
- **C 缺功能或存在可复现缺陷**：本日五批源码核对**未发现新 C 类**；历史遗留 C 类候选（若验证中暴露）按"先复现再最小修复"
- **D 缺需求依据/外部条件**：P0-37、P0-38（指示保持待决）；P0-67/141 的"版本适用性独立校验"残留（待原文）；真机/PWA/导出页面/业务认可类外部验收

## 阻塞清单（等待外部条件，不重复空跑）

| 事项 | 依赖 | 状态 |
|---|---|---|
| V10.1 原文全文 | 用户恢复或提供权威副本（SHA256 `a1e7f5…c57c`；2026-11-17 两轮检索：原路径/mdfind/Trash/iCloud/.codex 内容 SHA 均无命中） | **缺失** |
| P0-37/38 重算适用条件 | 原文（梳理档已就绪） | 待决（按指示） |
| 真机/PWA 热升级/正式业务认可 | 真实设备与人工验收 | 未开始 |
| 浏览器连接滞留真实影响 | 实际用户导航验证（用户指示保留为开放事项） | 开放 |

## 已完成批次（证据目录索引）

| 批 | 内容 | 证据 |
|---|---|---|
| SEALED 根因 | 四格矩阵+r2驱动（复核修正后） | evidence/zcode-sealed-20261117 |
| T5a | P0-45/46/47（+本轮交叉映射 P0-96/122） | evidence/maintenance-v101-ledger-units-20261117 |
| T5b | P0-12/13/14 | evidence/maintenance-v101-finalization-timing-20261117 |
| T5c | P0-19 | evidence/maintenance-v101-release-authority-20261117 |
| T4a | P0-20/21 | evidence/maintenance-v101-category-compat-20261117 |
| T5d | P0-65/66/67（+交叉映射 P0-91/141/142） | evidence/maintenance-v101-policy-compare-20261117 |
| 护栏 | build-base v3+反验证 | evidence/zcode-sealed-20261117/guard-validation.log |
| 梳理 | P0-37/38 只读地图 | docs/MAINTENANCE_P0_37_38_READONLY_MAP_2026-11-17.md |
| D1 | P0-37 实现（effective-refresh 模块+058+三路挂点+启动对账，裁决 docs/MAINTENANCE_V101_ADJUDICATION_20261118.md） | evidence/maintenance-v101-effective-refresh-20261118 |
| D2 | P0-57 实现（迁移059 过夜事实/关联表+隔离服务+真实扩展注册挂载，872/872 双配置） | evidence/maintenance-p057-overnight-20261118 |
| page-evidence-r1 | P0-84/132/139 页面取证→**verified×3**（合成Chrome+真实权限+结算零写入） | evidence/maintenance-page-evidence-r1-20261118 |
| P0-38 专项 | 类别/范围实质变化不自动重分类+字段锁409零写入+显式重选通道（873/873） | evidence/maintenance-p038-definition-20261118 |
| PG 演练 | PG16一次性集群：058/059应用+幂等+873用例全绿+12进程并发锁；修4处PG count方言 | evidence/maintenance-pg-058-059-20261118 |
| 分诊+裁决附录二 | 207 partial 六类分诊；P0-67/90/141版本校验义务裁决（用户选A）；P0-100原文无别名定义 | docs/ZCODE_PARTIAL_TRIAGE_20261118.md + docs/MAINTENANCE_V101_ADJUDICATION_ADDENDUM_20261118.md |
| 裁决A实现 | 终审预览只读configDrift（冻结vs当前规则哈希，DI注入currentRuleVersion）+视图提示行；专项用例+874/874 | evidence/maintenance-drift-hint-20261118 |
| page-evidence-r2 | EQUAL均分/UNDECIDED挂起/漂移显示/SSE列表重算 四断言→**P0-67/90/141/107/138/146/186 verified×7** | evidence/maintenance-page-evidence-r2-20261118 |
| page-evidence-r3 | 导入批次工作台（真实对话框+CDP文件注入+预览/提交/已导入回显）| evidence/maintenance-page-evidence-r3-20261118 |
| import-loop | 导入→补全→提交→评议→终审→已确认入账贯通用例（875/875）→**I簇纯样板21项 verified×21** | evidence/maintenance-import-loop-20261118 |
| page-evidence-r4 | 首页三面+统计双单位/明细/API-DB对账+八类策略 六断言→**P0-16/17/123/127 verified×4**（45/46/47缩窄） | evidence/maintenance-page-evidence-r4-20261118 |

## 剩余 55 项 pending 分簇与批次计划（风险序：重复入账→历史改写→来源丢失→越权/隐私→计算一致性→业务链/导入→模块→页面/导出/交付）

| 簇 | 项 | 分类 | 批次 |
|---|---|---|---|
| F2 重复入账/通道 | P0-119(唯一审核通道DB约束), P0-114(已确认不降级), P0-93(终审与策略发布并发) | B | **下一批** |
| F3 计算一致性 | P0-62/82/85/86/95/102/103/104/128/129/130/131 | B | F3 |
| F4 已确认/更正链 | P0-117/118/143, P0-115/112 | B | F4 |
| F5 终审变化残余 | P0-84/90/107/108/139/140, P0-132/137/138/100(别名残缺口) | B/D(132/137/138含D面) | F5 |
| F6 审核链导入簇 | P0-153/157/161/162/164/166/167/179 | B | F6 |
| F7 回归簇 | P0-94(已提报时点缺)/98/113/145 | B | F7 |
| F8 模块簇 | P0-52/54/60/146（P0-57 已由 D2 闭合） | B | F8 |
| F9 权限/隐私/汇总 | P0-68/78/79/144 | B | F9 |
| D 类 | P0-37/38 | D | 已闭合：P0-37=D1、P0-38=裁决升 partial（补专项用例可再升级） |

## 未被 210 编号完整表达的要求（交接§4 不变量等）

- 全部不变量逐条验收未做（当前靠分散用例覆盖）→ 计入 F7 回归簇口径
- traceability 工具需原文（阻塞）；发布包/CI 检查沿用既有脚本，交付批再跑

## 更新规则

每批完成后：①ACCEPTANCE.json 逐项更新；②本表批次状态与 pending 数更新；③续接记录 `docs/ZCODE_CONTINUATION_RECORD.md` 同步；④审计追加。不凭测试总数升级 verified。
