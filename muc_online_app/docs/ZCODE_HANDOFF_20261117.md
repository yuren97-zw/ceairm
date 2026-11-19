# ZCode＋GLM-5.3 接管交接书

日期：2026-11-17（Asia/Shanghai）。项目：航线运行中心｜维修与人员；当前聊天原名“非例行工作数据库和导入”。

二次复查已补第10A节及独立接管提示词：旧临时原件和合成浏览器基库已不在原路径，必须按新记录识别可复现性边界；第1～10节的历史运行结果不代表本轮重新执行。

> 这是继续开发的交接，不是完成、上线或验收证明。用户要求ZCode＋GLM-5.3接管；Codex原开发目标仍为paused。本次只读取现状、整理文档与保全证据，没有恢复开发、启动服务、迁移业务库、合并或发布。交接MD不能单独代替整个工作目录及证据目录。

## 1. 接手后首先确认的事实

|项目|当前实查结果|证据|
|---|---|---|
|工作树|`/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息`|本机pwd及Git核对|
|应用目录|`/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app`|源码目录|
|分支|`codex/maintenance-personnel`|Git本地状态|
|HEAD|`4b56f438b81fb1ef73b22112721b9a9561f8448d`|Git本地状态；不包含未提交成果|
|本地上游比较|ahead 1；本次未fetch，不能断言远程此刻状态|Git本地引用|
|公共Git目录|`/Users/zhaowei/Documents/MUC收集信息/.git`|git-common-dir实查|
|原目标|按照方案执行；编码前先核对8788真实源码、解决冲突和不清晰事项|本聊天原用户指令及目标记录|
|目标暂停|paused；用户明确暂停；累计目标记录9,228,924 token、124,924秒|本次get_goal只读结果；不是账单，不含目标之前的全部历史|
|验收台账|210项；138 partial、72 pending、0 verified|[docs/MAINTENANCE_V10_1_ACCEPTANCE.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/MAINTENANCE_V10_1_ACCEPTANCE.json)|
|最新完整自动回归|默认与原协调器开启，各858通过、0失败|[sqlite-default.log](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/sqlite-default.log)、[sqlite-coordinator.log](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/sqlite-coordinator.log)|
|最新页面专项|19通过（含排队刷新）；原四阶段API专项1通过|[workbench.log](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/workbench.log)、[api-four-state.log](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/api-four-state.log)|
|最新完整PG16|118服务测试；148表8998行，数据及全部目录比对通过；集群停止|[postgres-summary.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/postgres-summary.json)、[postgres-service-tests.log](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/postgres-service-tests.log)|
|四阶段浏览器|只通过PENDING_ACCEPTANCE、IN_REVIEW各1280/390；SEALED入口等待失败，FINALIZED未验证|[browser-partial-proof.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/browser-partial-proof.json)、[browser-failure-state.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/browser-failure-state.json)|
|关键缺失|原V10.1方案全文目前不在原Downloads路径，搜索未找到摘要相符副本|[handoff-snapshot.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/handoff-snapshot.json) specification项|

“65.7%”只能表示138/210已有部分覆盖，不能叫开发完成率或可交付率。0 verified不等于没有实现，而是没有逐项闭合完整适用范围。此前工期/token估计是预算意见，不能作为验收依据。

## 2. 原方案、证据优先级与缺失处理

原文件名：`航线运行中心_维修管控模块_完整设计与Codex实施规范_V10.1_文字草稿安全导入与风险闭环.md`。

原路径：`/Users/zhaowei/Downloads/航线运行中心_维修管控模块_完整设计与Codex实施规范_V10.1_文字草稿安全导入与风险闭环.md`。

已记录原SHA256：`a1e7f567474b456ac4a33f7a2827a272eccf734b04e9cb154ad0f4d40ab4c57c`。**本次实查原文件不存在。** 已在Downloads/Documents/Codex相关目录检索文件名，并对可读临时/可视化/Trash中的合适Markdown核对摘要，未找到完全一致全文；这不等于证明所有磁盘上都不存在。

交接时无法交付不存在的原文。应首先请用户恢复原附件或提供权威副本，并核对上述摘要；若摘要不同，逐条确认版本差异。**不得从本交接、测试或210项台账反向编造全文。** 原方案未恢复前，可继续核对已明确、可复现的源码问题，但不得据猜测新增业务规则、缩减范围或宣布完成。既有traceability工具需要原文；本次没有伪造原文使它通过。最后一次原文挂接记录已保全为[last-known-source-traceability.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/last-known-source-traceability.json)：当时140项链接可读但范围未证明、70项未挂接；当前台账摘要仍匹配它，但部分源码/测试后来已变，这份记录的旧文件摘要不能冒充当前运行证明，且210条sourceRow不是完整方案。

来源顺序：最新明确用户决定→与摘要一致的原方案全文→当前源码及真实存储/请求证据→当前完整验收台账及测试→带时间和环境的旧审计。历史文档里的“待业务答复”“未实现”等不能覆盖后续用户决定或当前实现；反过来也不能把旧方案写成今天已上线。

必读文件：

1. 本交接；[handoff-snapshot.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/handoff-snapshot.json)记录本次只读实查。
2. [总交接索引原文副本](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/legacy-total-index.md)、[维修与人员模块原文副本](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/legacy-maintenance-module.md)。两者是2026-11-03上下文，旧HEAD/“仅讨论”等须按后来证据更新，不能据此删当前成果。
3. [docs/MAINTENANCE_V10_1_IMPLEMENTATION_AUDIT.md](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/MAINTENANCE_V10_1_IMPLEMENTATION_AUDIT.md)：历史审计，不是完整完工清单；首段并不保证最新，须读后面的追加记录。
4. [docs/MAINTENANCE_V10_1_ACCEPTANCE.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/MAINTENANCE_V10_1_ACCEPTANCE.json)：210个编号、原文定位、状态、证据及不足。
5. [docs/MAINTENANCE_V10_1_RECOVERY.md](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/MAINTENANCE_V10_1_RECOVERY.md)：恢复约束及分期验证边界。
6. [docs/MAINTENANCE_CONTROL_STATE_MAP_2026-11-08.md](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/MAINTENANCE_CONTROL_STATE_MAP_2026-11-08.md)：早期状态映射，仅作追溯，不能覆盖后续。
7. 本文末尾完整210项及93个原有证据目录索引；按需读实际断言，不要每轮重读全部旧日志。

历史审计曾引用原方案后部章节优先覆盖旧段落；**准确章节内容以恢复后的原文为准**，不要在原文缺失时凭记忆声称已完成全部风险表（R-01～R-22）或全部阶段门槛。

## 3. 用户已作出的决定——逐条抄录，不再当作待决事项

这些是本聊天用户直接回答，非模型自行制定。括号“建议”是当时选项文字，用户选择后构成本会话决定；不代表已向真实账号赋权。源码仅佐证实现，不能替代业务授权本身。原消息无法在ZCode直接访问时，以本段抄录和用户本人核对为来源，不虚构签批文件。

|决定|用户原回答|原消息定位|实现/核对入口|
|---|---|---|---|
|账期开放/封账权威来源|“负责人。”|call_2400d36963bb441b9a5556395d4f8175|maintenance-hour-periods.mjs、039迁移、原账期接口|
|跨期统计归属|“仍按原作业月份统计，另记办理账期”|call_98429f03716a4e5eb60c8e0c2411b616|nonroutine-cross-period.mjs、043回执迁移、对应恢复断言|
|标准正式准入/发布|“单独授权标准发布负责人（建议）”|call_3b5b2576c1264d76a2ba58dcb47996d6|maintenance-standard-publication-authority.mjs、rbac-policy.mjs|
|首页维修机会数量|“仅当前待办机会（沿用现有口径）”|call_bb41816c7ad34b9b981b1613b1da2aed|首页当前待办分页/地点统计；不能计入全部已确认历史|
|在途分配比例|“在途沿用提报时快照，新比例仅用于新提报（建议）”|call_dd4fb37019a046c4b9996c500274c913 问题1|nonroutine-frozen-policy.mjs、maintenance-rule-history.mjs|
|通用机型标准|“允许，由单独授权的标准发布负责人逐条批准通用范围”|同一call问题2|标准发布资格和generic范围逐条审批，不自动泛化|
|未入账评议独立取消|“单独授权评议取消负责人（建议）”|call_765b334d755e46c69cf38dacef8b3e12|nonroutine-source-cancellation.mjs、独立cancel权限；原删除关闭通道仍保留|
|接管工具与模型|“用 ZCode＋GLM-5.3接管”|本次用户交接请求|这是工具选择，不是本项目对该模型能力的实测结论|

用户还曾回答“原方案文件已回到原位。参考选择。”（call_5447e3ba50044b63a3bbf9b052a99cbc）。那是历史附件状态，**不能用它否认今天实查原文件缺失**。

## 4. 必须守住的业务不变量

- 保留原三类报工和原五态：未派工、已派工、已提报、待复核、已确认；整体机会是容器，单项/来源/评议/扩展模块分别有状态，不建平行的报工/统计系统。
- 例行小时、非例行小时与放行架次单位独立。放行只产合法架次，不能混进工时合计；维护原正常确认门槛。
- 复用server.mjs原`maintenanceCalculatedHours`及原整数分/尾差计算；不从标准库或终审页新造比例、不手工摊空角色预算。工卡指令和单项工作用同一七种实际角色组合配置；多人同角色依原算法均分。
- 当前新策略映射以maintenance-standards.mjs为准：工卡指令/单项工作ROLE_COMBINATION；拖机/三方附加/试车EQUAL；其他/人工除冰/联合除冰UNDECIDED。后三类未经批准不自行补算法；旧合法其他/拖机历史不能被新枚举重算或强制均分。拖机标准化过渡有单独门槛，不能只改类别名称。
- 新文件导入仅写原文字草稿；保存、反复打开、导入不创建正式工作、评议或工时。正式提报才建立评议/占位通道；缺失工时不是0，合法认定0要保留且可核对。
- 现有解析支持xlsx与UTF-8 CSV、3MiB/1000工作行等限制（以maintenance-import-file.mjs真实校验为准），不声称支持xls等其他格式。标准库项目导入与原机会文字导入是不同入口。
- 同文件改名/同批请求重放/跨批稳定来源不得重复创建；已删来源保留墓碑、不能重试复活。不同文件同机会近似项需要人工核对，跨机会同名不自动合并。缺clientId的旧归档只能匿名追溯，不能吹嘘可靠去重。
- 正式派工与实际报工参与分离：原派工ID/人/角色/来源不因实际报工或终审角色核实被替换；报工条目、冻结来源档案和独立核算角色可各自追溯。
- 普通评议员只见本人私有工时/依据/历史；授权审议者可见全部；12名唯一指定人员封闭后指定终审人一次裁定五项及必要角色核实。共享字段建议不含工时，不直接改原事实；不能开启第二轮来逃避同轮核实。
- 评议申请暂估不进入正式小时/绩效；不因未完成12人评议阻断原合法机会确认。终审在已提报/待复核/已确认按当时状态进入原路径；已确认只能独立一次性追加，不改原确认报工/参与快照。已入账更正走授权差额/冲销，不重开旧通道全额再记。
- 账期未知或封账、规则/来源/角色不能核实时，保存合法认定并挂起，不能假装开放或以最新比例补空；统计原作业月，办理月另存。通用机型必须逐条批准。
- 原授权复核事实修订与独立终审事实不同。原允许的修订应保留提报基线及新修订审计，终审显式核实；终审后原事实又变，不能静默用旧认定同步。不要为了测试方便对所有在途来源一律加锁，也不要绕过核实门槛。
- accountId认证账户与personId人员主档分开；姓名/实际岗级不推导身份或权限；功能权与当前数据范围都要服务端核对，必要时取得共享事务锁后重检。
- 本人正式派工的协作访问例外、同创建部门的未派工GET/派工共享属于现行边界，不能误收窄。干部可参与真实维修统计，但固定干部组不得进入能力沙盘/矩阵/调配/排名；实际岗级依独立查看权限及范围服务端脱敏。
- 标准库准入意向不等于正式发布；已发布标准不得被普通管理编辑无痕覆盖。当前maintenance-standard-management.mjs仅允许有最终评审权限者发起已发布版本修订，保留旧版本并重新走受控评议/发布；停用不重算历史引用。施工认定转标准也是独立受控草稿/准入来源，不等于自动公开标准。
- 未授权不自动分配发布、审议、取消等新增角色；独立取消只处理未入账评议，保留原工作/报工/意见/终审历史。原删除的来源关闭不是给删除人默认独立取消权。已入账或已有更正轨迹不可用删除抹账。
- 规则版本、报工来源、clientId/指纹、原参与事实、审批及回执均可追溯；审计失败与原业务事务整笔回滚；不以修复之名回填不明历史。

以上是有用户答复、交接原文及源码/测试入口的摘要，不替代缺失的完整方案。遇冲突必须列具体字段/SQL/调用链/证据及影响，先消歧，再编码。

## 5. 当前实现地图（已存在代码不等于全场景通过）

|领域|主要文件（应用目录内）|核对重点|
|---|---|---|
|原业务集成|server.mjs、public/app.js、rbac-policy.mjs|原三报工/五态、事务、范围、角色分离、接口与页面|
|标准匹配/文件解析|maintenance-standards.mjs、maintenance-import-file.mjs、maintenance-import-preview.mjs、maintenance-standard-references.mjs|当前版本/机型、歧义、后出现标准的明确引用|
|导入与草稿来源|maintenance-import-batches.mjs、maintenance-manual-sources.mjs|整份草稿CAS、原json/指纹、墓碑、失效选择重匹配|
|评议与认定|nonroutine-review.mjs、nonroutine-assessment.mjs、nonroutine-finalization.mjs、nonroutine-frozen-policy.mjs、nonroutine-source-facts.mjs|私密、12人、一次终审、原快照、来源变更核实|
|有效角色/入账|nonroutine-delivery.mjs、nonroutine-role-results.mjs、maintenance-work-recognition-source.mjs|真实参与与核算角色、原算法、唯一消费|
|账期/跨期|maintenance-hour-periods.mjs、nonroutine-cross-period.mjs|指定负责人、版本、统计月与办理月分离|
|更正与取消|nonroutine-corrections.mjs、nonroutine-correction-service.mjs、nonroutine-source-cancellation.mjs|差额/冲销、当前授权、未入账独立取消及原删除关闭|
|标准管理/准入|maintenance-standard-management.mjs、maintenance-standard-review.mjs、maintenance-standard-publication*.mjs、maintenance-work-standard-intake.mjs、maintenance-standard-import.mjs|草稿与发布独立、通用范围逐条批准、日常导入与标准修订|
|提醒|nonroutine-notifications.mjs、maintenance-standard-notifications.mjs|当前收件资格、封闭/取消后不再提醒、私密不进通知|
|原来源分离与历史|maintenance-report-participant-source.mjs、maintenance-result-dispatch.mjs、maintenance-report-source-journal.mjs、maintenance-rule-history.mjs|正式关联与实际报工、旧版本保留、原规则实质版本|
|旧复核/归档补录|maintenance-review-addition-sources.mjs、原saveMaintenanceReview|稳定来源到最终单项映射、旧路径同源防双计、删除保留|
|机会与扩展模块|maintenance-opportunity-modules.mjs、maintenance-module-instances.mjs、maintenance-extension-modules.mjs、maintenance-module-results.mjs|持久适用身份/冻结规则、非结算结果；不能当工时或放行结果|
|通用流程|maintenance-workflow-*.mjs、maintenance-workflow-templates.mjs|当前模拟CHECK_RESULT及审计/来源分发，不宣称所有正式业务模板可用|
|页面|public/maintenance-*-workbench.mjs、public/nonroutine-*.mjs|复用原入口，不另造平行报工页；未保存/重试/授权变化与异步安全|
|数据库|migrations/032～057及server运行时schema|增量、SQLite/PG同构、唯一键、恢复、显式SQLite→PG复制|
|验证|tests/、scripts/check-maintenance-v101-*.mjs、scripts/check-maintenance-package.mjs|真实接口/双服务等待/恢复/工件，不把计数当逐项验收|

本交接附件[source-manifest.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/source-manifest.json)有当前非忽略代码/配置/测试/文档文件SHA256；[git-status-at-handoff.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/git-status-at-handoff.json)列未提交/未跟踪文件，不能按上表裁剪项目。

## 6. 最新暂停点——优先接续，勿从头重写

### 6.1 已核对、尚未完整归档的最后一轮

- 原API新增用例：`archive authority stays separate across the original pending sealed and unposted review lifecycle while source revisions remain attested`（tests/server.test.mjs）。从原机会/派工/手工草稿/正式提报/放行/整体确认开始，同一来源覆盖四阶段；12人原意见，不是直接插入终审成品。
- 每阶段归档专用账号拒绝8种独立动作；临时审议权撤销后同cookie返回受限视图；私密历史拒绝，原业务不变。
- 原授权复核修订留SOURCE_FACTS_CHANGED，提报application/participants原快照不变；终审预览后必须显式核实来源token。终审一次锁定，未知账期挂起。
- 终审后原事实再次合法修订，原sync返回SOURCE_FACTS_CHANGED_AFTER_FINALIZATION；保留同一final、12意见和原申请，仍0有效工时/0回执。**这是防静默入账的验证，不能当作已解决所有人工异常处置政策。**
- 发现页面busy时丢弃外部refresh；旧私密读取完成后可能无后续资格核对。现public/nonroutine-review-workbench.mjs用refreshQueued/finishBusy合并并补查；失权清空排队和私密状态，destroy停止排队。所有原busy收尾路径统一调用finishBusy，保护原草稿/未知结果请求。
- 新专项名：`refresh received during an in-flight private read is rechecked after completion and cannot strand stale private drafts`。修复前断言失败，修复后与既有WORK/STANDARD精确重试体断言通过。
- 当前入口缓存shell **v55**；app query **20261116-review-queued-access**；工作台query **20261116-queued-access**。不能回退到前期v53/v54。安装态PWA升级尚未验证。
- 最新默认/协调器各858；页面专项19；PG118及148表8998行完整恢复已经完成。最后队列改动是前端限定；PG验证对应后台源码未改，不把它说成后续每个前端改动又新跑了一次PG。
- 历史审计/台账最后正式记录仍停留前一阶段，未写入本轮全部结论。本次保全日志和暂停点，**未擅自把台账升级或恢复原开发目标**。接管后应先把实际断言和当前源摘要核对清楚，再整理这一轮证据。

### 6.2 浏览器未完成，不猜根因

原本机演练脚本：`/private/tmp/muc-four-state-browser.mjs`。最新原现场目录：`/var/folders/h0/tmqh6fwn08b5y8ct0nn3w7q80000gn/T/muc-four-state-browser-xalBdg`。这些是临时位置，可能被清理，不可当永久唯一证据。

本次已保存：[browser-partial-proof.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/browser-partial-proof.json)、[browser-failure-state.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/browser-failure-state.json)、失败日志及[脱敏适配诊断配方](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/browser-diagnostic-adapted.mjs)。适配配方不是原执行脚本，本次没有执行它；原脚本摘要见snapshot。配方要求MUC_SYNTHETIC_BASE_SQLITE（绝对路径）、MUC_SYNTHETIC_TEST_PASSWORD及MUC_HANDOFF_APP_ROOT（应用目录；默认当前目录）从环境提供，先检查18888/18889空闲；原前端读密码的适配改为仅在测试请求中注入，不能指向开发/生产库，也不能把临时夹具密码复制成正式配置。

最新现场明确事实：

- 待受理、评议中，各1280/390，共4个组合通过；使用真实原应用与原SSE，角色撤销后私密内容不再显示，目标业务快照不变。
- SEALED 1280的新页面等待`[data-maint-tab=reviews]`超时。现场URL为four-state-SEALED-1280，document ready=complete，activePage=maintenancePage，reviewEnabled=false，tabs=[]。
- 没有证据证明是浏览器导航、前端能力加载、网络、权限、服务或其他原因；**根因未建立**。前序一次夹具写入database locked，后加busy_timeout；另曾调整页面加载等待。它们不能代替对最后失败的诊断。
- SEALED及FINALIZED的本轮浏览器成功证据缺失；不能据四阶段API通过声称四阶段页面通过。旧IN_REVIEW脏草稿1280/390成功证据在原dirty-review-access目录，与本轮不混记。
- 最新proof记录servicesStopped=true，PG summary stopped=true。本次只核对记录，没有新开服务；这些不是对所有系统进程/8788线上运行状态的全盘检查。

下一步建议：先恢复原方案；再在新的合成库/隔离端口复现，保留Console、网络请求/响应状态、当前/api身份与capability加载结果及源码摘要。先观察原请求，不要盲目重复业务POST；确认进程终止后才按明确原因重建夹具。原脚本不具备可直接断言“已验收”的资格。

## 7. 边界、开关、角色及数据安全

新增功能多为默认关闭/受控。**不得把“测试里全部开1”当作8788或生产推荐配置。** 具体组合先读源码与部署配置，不加载真实密钥来试错。

- 文字草稿/正式提报：MUC_MAINTENANCE_V101=draft、MUC_NONROUTINE_REVIEW_ENABLED=1、MUC_NONROUTINE_SUBMISSION_ENABLED=1；手工受控路径还需MUC_NONROUTINE_MANUAL_ENABLED=1。
- 终审：MUC_NONROUTINE_FINALIZATION_ENABLED；账期：MUC_MAINTENANCE_PERIODS_ENABLED；更正：MUC_NONROUTINE_CORRECTIONS_ENABLED。
- 标准管理/导入/评议/准入：MUC_STANDARDS_MANAGEMENT_ENABLED、MUC_STANDARDS_IMPORT_ENABLED、MUC_STANDARDS_REVIEW_ENABLED、MUC_STANDARDS_PUBLICATION_ENABLED；发布及转标准有组合门槛，不能只看单开关。
- 提醒：MUC_NONROUTINE_NOTIFICATIONS_ENABLED、MUC_STANDARDS_NOTIFICATIONS_ENABLED与对应评议开关共同约束。
- 协调器/模块：MUC_MAINTENANCE_COORDINATOR_ENABLED、MUC_MAINTENANCE_MODULE_SHADOW_ENABLED、MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED、MUC_NONSETTLEMENT_MODULES_ENABLED；通用流程MUC_WORKFLOW_TASKS_ENABLED/MUC_WORKFLOW_SIMULATION_ENABLED。模板和completionAvailable门槛以真实代码为准，不能把simulationOnly正式化。
- 拖机标准过渡：MUC_TOW_STANDARD_ONLY_ENABLED还有准备门槛，不能绕过原旧模式保护。
- 独立取消角色addon_nonroutine_review_cancel，标准发布addon_maintenance_standard_publisher；用户批准角色设计不等于系统已给某真实人授予。原addon_archive_modify不含独立评议/终审/私密意见权限。
- 不开启钉钉、真实考勤同步、COS/微信等真实外联来验收本任务；不拷贝真实人员明细、审批事由、令牌、私钥或数据库密码到交接或仓库。

## 8. 同机/跨机接管与版本保全

**同机优先直接用ZCode打开本工作树，避免重新clone。** 不能reset、clean、stash/reset后再猜恢复，也不要用main/另一工作树覆盖这里。当前工作树有大量未提交和未跟踪成果，已提交的HEAD不是完整当前版本。

Git结构是链接工作树：本目录.git是指向公共Git仓库的文件。单独复制这个文件不能得到独立可用的Git库；异机迁移要有公共Git历史或重新建立仓库/工作树，并把所有待提交/未跟踪源代码和证据完整迁入后核对清单。不要自动删除或改写公共仓库；本次没有制作完整业务数据备份或独立Git打包。

交接范围包括整个应用、测试、migrations、public、package/lock、CI、全部docs/evidence以及本MD和附件。node_modules可在明确环境下按锁文件重建；忽略的数据库、上传件、环境配置另行核对和保护，**source-manifest不是业务数据备份**。不要将被忽略的真实凭据当成需要共享的项目文件。

维护同一目录时只允许一个工具写。Codex原目标保持暂停；用户让ZCode开始接续后，由ZCode按本目标继续，不要让两边同时自主修改。此交接不授权任何合并、push、部署、重置业务数据、停写或切流。

最新HEAD仅为人员选择与手机布局提交（可用git show核对）；人员/UI、PPTX、其他公共改动也在WIP中，不能为提取本任务而删除它们。三线治理所有权沿用原索引：信息/RBAC/公共审计备份归治理线，考勤假期归考勤线，维修人员归本线。所有树包含完整系统，所有权不是删模块的理由。

## 9. 可复现检查与隔离环境

本机实查Node v24.19.0、npm 11.17.0；项目要求Node>=24且用node:sqlite；PG验证器要求PostgreSQL16，原结果是Postgres.app16.15。本机路径存在与否、可用端口、依赖应在ZCode接管时再核对。

以下为接管后使用的命令，不是本次交接重新执行过的测试；所有命令从应用目录运行。先确认空DATABASE_URL和NODE_ENV=test，防止继承业务数据库配置。

```sh
cd '/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app'
node --version
npm run check
DATABASE_URL='' NODE_ENV=test MUC_NO_LISTEN=1 npm test
DATABASE_URL='' NODE_ENV=test MUC_NO_LISTEN=1 MUC_MAINTENANCE_COORDINATOR_ENABLED=1 npm test
node scripts/check-migration-policy.mjs 4b56f438b81fb1ef73b22112721b9a9561f8448d
```

迁移检查要求显式基线；当前HEAD和台账baselineCommit（ecfd7378b772f9f0001cba74fb5fe37518f8cb5d）不同，不能偷偷改台账基线。该检查会核对迁移编号及已跟踪旧SQL不可修改，不能单凭git diff证明未跟踪032～057内容正确；还要运行schema同构/增量/双库恢复测试。不改旧基线SQL来凑绿。

针对本轮先跑：

```sh
DATABASE_URL='' NODE_ENV=test MUC_NO_LISTEN=1 node --test --test-name-pattern='archive authority stays separate across' tests/server.test.mjs
node --test tests/nonroutine-review-workbench.test.mjs tests/maintenance-standard-review-workbench.test.mjs
```

完整隔离PG演练（会创建并停止新临时集群，不使用现有业务库；确认15432及18890～18901没有他人服务，不自动kill）：

```sh
node scripts/check-maintenance-v101-postgres.mjs /Users/zhaowei/Applications/Postgres.app/Contents/Versions/16/bin --restore
```

恢复复用模式必须满足官方脚本的私有snapshot.dump、所有者/权限/完整summary条件；不能删除标记或绕过检查。fixture-only不是重跑全部118服务测试，不能把两者混称。临时PG密码由验证器随机生成并脱敏，不写进本交接。

方案恢复并核对摘要之后，才可做完整原文挂接检查，输出必须是一个新的绝对路径目录：

```sh
node scripts/check-maintenance-v101-traceability.mjs '/恢复后的原方案绝对路径.md' '/新的绝对路径证据目录'
```

本机开发入口为`npm run start:dev -- maintenance-personnel`；它会使用本工作树data/local-development.sqlite、uploads-local-development及8788，虽有隔离保护，也不能在没确认现有服务/数据时启动或换库。不要直接`npm start`、不要杀掉真实8788；当前交接未启动它。

发布包必须按现有CI与scripts/check-integration-package.mjs/check-maintenance-package.mjs核对真实Linux工件及合成PG业务链。该检查依赖明确归档路径、commit SHA、CI隔离配置；不能伪造环境变量去指向已有业务库。当前WIP未提交，不能把HEAD的包说成含这些新文件；未完成发布验收，不执行发布。

效率原则：先给当前变更选择有业务意义的针对性检查；共享代码/权限/迁移变化再跑适当全量/双库；同源码已通过且无新风险时不反复跑整套。测试输出不足时重新观察同一进程/请求，不能把观察超时当作执行失败后重放业务写入。

## 10. ZCode接管步骤和完成判据

1. 先只读核对目录、HEAD、Git链接、完整WIP清单及源码摘要；留存安全开发备份。确认没有另一个工具同时写。不得把本MD当作原方案全文。
2. 恢复并核对原V10.1全文；若无法恢复，向用户说明影响并继续已明确事项的独立工作，不臆造规则或结项。
3. 对照本次保全的日志、源码与最后尚未归档的四阶段/队列改动，整理证据。诊断浏览器SEALED入口失败，先取真实请求/页面状态，根因建立后再动代码。
4. 把210项逐一按原要求和适用范围建立可执行/人工验收依据。pending不等于一定没代码，partial不等于过了一半；逐条读断言、环境、版本、缺口。状态升级必须有相匹配证据。
5. 先处理会导致越权、双计、来源丢失、历史改写的缺口；同时闭合导入→草稿→正式提报→评议→终审→同步/挂起→更正/取消→统计/恢复的原业务链。不得换成更窄、更容易通过的目标。
6. 按原方案补齐标准管理/发布/通用范围、规则历史、扩展模块/流程、通知、原接口/编辑器/SSE/PWA、权限范围、格式安全、性能、双库迁移与恢复、Linux工件、真实设备及业务验收。原文未恢复前不凭本清单发明详细门槛。
7. 每轮报告：实际改动、为什么符合已批准要求、真实验证、仍缺范围、下一步证据。失败与环境限制单列，不能调低断言、重复做夹具、篡改历史状态来凑全绿。
8. 只有全部明确要求/编号/产物/不变量及适用验收都核实完成，才可建议目标complete。上线、正式赋权、push/merge/切流须有另行明确授权；测试全绿不是授权。

模型按用户指定GLM-5.3；当前没有本项目的GLM与其他模型对照实验，不能把“旗舰”“长上下文”当成正确性保证。复杂权限/工时/迁移选其可用较高思考强度；按具体验收项安排短而明确的执行批次，关键变更独立核对。不要把923万token历史聊天一次性塞入；用原方案、源码、台账和针对性证据管理上下文。

可直接交给ZCode的首条任务：

> 接管本工作树的“非例行工作数据库和导入”完整V10.1目标。先读此MD及所指证据，报告真实目录/HEAD/WIP、原方案是否找回、当前210项状态及最后验证缺口。不得reset/clean、遗失未跟踪文件、另造工时算法或默认授新角色。先诊断四阶段浏览器SEALED入口失败并整理暂停前新证据，再按原方案逐项继续，不凭测试数宣布完成，不擅自合并发布。用户已确认的业务决定沿用，不反复询问；新不清晰事项用当前源码和原方案证据消歧。Codex侧保持暂停。

## 10A. 二次复查补充——2026-11-17

本节是交接材料复查，不是恢复开发或新增业务验收。已再次核对HEAD、468份既有源文件摘要、210项台账及其742条证据引用。全部引用文件存在；其中336条源码测试名引用均能在对应文件找到。这里只证明引用可定位，不证明断言覆盖完整，也没有重跑858/118项测试。复查记录见[review-validation.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/review-validation.json)。

### A. 临时原件已不存在，不能按旧路径接着运行

本次再次检查，snapshot记录的六份原始临时日志、原PG运行目录summary、原浏览器脚本及现场目录均已不存在；这些结果只针对列明路径，没有搜索全盘。交接附件保留的是此前复制的证明与日志摘录。不能重新核验已消失原件的完整内容，也不能用附件摘要声称仍持有原始全日志或数据库dump。

浏览器配方原先依赖的合成基库`/private/var/folders/h0/tmqh6fwn08b5y8ct0nn3w7q80000gn/T/muc-preview-reset-browser-fnqf05lb/clean.sqlite`也已不存在，交接未附该库、原完整生成脚本或原现场截图。**所以适配脚本不是开箱可重跑的验收工具。** ZCode需要依据现有测试夹具、迁移及真实API建立新的可复现合成基库，记录生成步骤、源码/基库摘要及最少前置账号/角色/规则；不从8788业务库复制来补齐，不编造旧现场截图。新结果与旧结果分开归档。原PG私有snapshot不在时，不能直接使用restore-from-fixture模式；需要按正式验证器重新生成完整隔离演练。

### B. 诊断脚本的移植、环境与清理还需核对

`browser-diagnostic-adapted.mjs:10–24、39、61–63`表明：依赖本地node_modules/ws、macOS Google Chrome绝对路径、两个固定端口及外部合成SQLite；子进程默认继承调用者环境；当前前置检查只检查基库路径与测试密码，不验证基库的合成来源；清理记录来自子进程状态，不是端口释放的独立证明。这些是可读源码事实，尚未通过新运行证明是否导致故障。

接管时先把配方视为诊断参考：核实Chrome/依赖/路径；用最小环境启动，清除ATTENDANCE_ENV_FILE、真实外联凭据及不相关开关；明确设置隔离DB/上传目录并关闭同步；为新合成基库保留可核验的来源。确认异常、超时、启动失败时都能结束自己创建的进程并独立检查端口释放，不终止其他人的服务。保留Console与网络响应是下一轮新增观察项，旧配方只启用Network并计数部分写请求，未保存完整请求响应和Console证据。不要直接修改保全配方冒充旧执行版本；复制到新的诊断位置后再改。

### C. “清空DATABASE_URL”并不足以隔离全部测试环境

`server.mjs:89`可按ATTENDANCE_ENV_FILE加载环境文件；`tests/server.test.mjs:19–30`会设临时SQLite/上传目录但未负责清理调用者的所有环境；正式PG验证器已采用环境白名单。第9节简写测试命令需要以本段前置约束为准：**先使用干净测试环境，再运行命令**，不要继承生产.env、NODE_OPTIONS中的预加载或真实同步配置，不输出密钥内容。

可在应用目录的新测试终端定义下面的临时函数（不写入项目配置；只用于合成SQLite测试）：

```sh
muc_test() {
  env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" LANG="${LANG:-en_US.UTF-8}" TZ=Asia/Shanghai \
    NODE_ENV=test DATABASE_URL='' MUC_NO_LISTEN=1 ATTENDANCE_ENV_FILE='' \
    ATTENDANCE_SYNC_ENABLED=false ATTENDANCE_WORKER_ENABLED=false ATTENDANCE_EVENTS_ENABLED=false \
    ATTENDANCE_APPROVAL_PLANS_ENABLED=false ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED=false \
    ATTENDANCE_VALIDATION_ENABLED=false ATTENDANCE_MANUAL_ONLY=true "$@"
}
muc_test npm test
muc_test env MUC_MAINTENANCE_COORDINATOR_ENABLED=1 npm test
muc_test node --test --test-name-pattern='archive authority stays separate across' tests/server.test.mjs
```

以上函数本次未执行业务测试；先检查本机Node路径和各具体测试的临时库设置。它不是浏览器基库生成器，也不替代PG验证器自己的隔离配置。`npm run check`包含的脚本清单不覆盖所有新增maintenance/nonroutine模块，可对本轮实际改动的mjs显式做node --check；不能把总入口语法通过写成所有文件已检查。`npm run dev`实际启动考勤8792，**不是本维修线入口**；reset、migrate、package/release脚本也不是接管初始化步骤，不能因脚本存在就执行。

### D. 文档版本、证据保全与回退是三件事

- `PROJECT_DEVELOPMENT_RULES.md`仍写SQLite/8787、三个角色及旧附件方案；`.env.example`是生产形态并含DATABASE_URL占位。这些文件应阅读，但不能照抄到当前8788或恢复旧角色/架构。以最新用户决定、恢复核验后的方案、现行运行入口及RBAC/双库代码逐项辨别冲突。需求依据与实现现状要分别记录；当前代码不能自行推翻批准的需求。
- 当前HEAD和468份既有源摘要再次一致，但仓库仍有大量WIP，旧HEAD/远程分支不能恢复它。原source-manifest是交接前源码快照，不包含后来生成的交接文件、全部历史证据、被忽略的数据或环境文件。新增[evidence-manifest.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/evidence-manifest.json)保全93个原证据目录内全部1441个普通文件的当前摘要；它同样只证明此次文件内容，不证明旧运行结果仍适用。本次没有制作完整项目/业务数据备份。
- ZCode首次改动前应为当前源码WIP及未跟踪证据做私有、可核验的开发快照，记录基准摘要和恢复方法；不要自动git add .把全部日志/数据提交。开发源码快照、合成测试库、业务数据备份必须分别识别。业务库备份/恢复沿用治理责任与既有授权边界；不能在复制运行中SQLite时忽略WAL等一致性问题，也不能为做备份擅自停8788。
- 跨机时所有绝对链接、公共.git关系、Postgres/Chrome/Node路径、未提交文件及忽略数据都要重新核对；SHA256SUMS内是本机绝对路径，换目录不能直接原样校验。把旧根目录映射到新根，再按清单中的相对路径核对字节摘要，不伪造原路径。

### E. 接续优先级及未关闭的问题

1. **先建立可恢复开发起点**：只读核对和私有源码快照；核验原方案是否恢复及版本；确认仅ZCode写入。原文仍缺时明确报告，可以继续可独立证明的问题，不能凭本交接补业务制度。
2. **补暂停点的可复现材料**：新建合成夹具及诊断观察，复现SEALED入口；先区分能力加载、实际API、页面导航与权限状态，再决定修复哪一层。不以固定延时、强行显示页签或放宽权限代替根因证据。FINALIZED以及SEALED未保存草稿失权均仍需实际页面验证；busy排队仅有专项自动测试，不扩大为PWA/真机已通过。
3. **逐项闭合而非一直做局部加固**：原暂停点只是第一批工作，210项才是范围目录；按风险、依赖和证据缺口形成批次，每批列ID、当前实现、缺口、改动、合格标准和证据。发现台账“待实现”文字落后于新源码，应纠正事实但不得自动改verified。不要把所有pending都当全新功能重写，也不要只做目前已有测试能证明的范围。
4. **业务决策仍有粒度边界**：“负责人”仅确认维护责任来源，未明确真实账户、代理、例外、开封账操作制度；独立发布/取消角色也未指定实际人员。现有受控实现可继续核对，实际赋权及新增制度需取得具体授权。终审后来源变化的自动挂起已有验证，其人工解决规则不能从挂起代码猜出；遇到确切缺口才带证据提问，不重复询问已确认的统计月份/冻结比例等。
5. **交付前再分别验收**：功能、权限/范围、失败重试/并发、私密信息、SQLite/PG/恢复、实际打包产物、性能、真机/PWA及业务认可分别留证。当前macOS合成PG恢复不是Linux产物或生产数据升级证明；真实设备/业务负责人不可由模型自我签字代替。若受工具/原件/人工条件限制，只报告具体阻碍并继续其余已授权工作，不无限重复全套回归，也不宣布完成。

完整首条提示词另存为[ZCODE_TAKEOVER_PROMPT_20261117.md](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/ZCODE_TAKEOVER_PROMPT_20261117.md)。建议先让ZCode完成首轮只读接管报告，再按证据进入最小开发批次；不要求再次确认每个已授权可逆步骤。Codex保持暂停。

## 11. 证据、完整验收目录与附录

本次新保全的证据仅归档既有结果，没有启动开发/测试。摘要和来源路径见[handoff-snapshot.json](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-handoff-20261117/handoff-snapshot.json)；日志摘录保留测试名/总计，原完整日志SHA与原路径仍可核对。原PG summary/并发/恢复证明为完整合成验证资料，不含raw数据库备份。原浏览器脚本脱敏适配版未被执行、仍是失败场景诊断材料。

### 11.1 关键现行函数定位

- `maintenanceCalculatedHours`：[server.mjs:3982](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs:3982)。
- `saveMaintenanceReview`：[server.mjs:4564](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs:4564)。
- `maintenanceReviewPersonnelScope`：[server.mjs:4551](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs:4551)。
- `currentMaintenanceDeletionActor`：[server.mjs:4703](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs:4703)。
- `deleteMaintenanceFlight`：[server.mjs:4727](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs:4727)。
- `deleteMaintenanceSubtask`：[server.mjs:4784](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs:4784)。
- `retainMaintenanceReportSource`：[server.mjs:3386](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs:3386)。
- `maintenanceCurrentMutationActor`：[server.mjs:5830](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs:5830)。
- `maintenanceCancelReviewForSourceRemoval`：[server.mjs:6316](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs:6316)。

### 11.2 当前全部增量迁移

- [032_maintenance_standards.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/032_maintenance_standards.sql)
- [033_maintenance_draft_versions.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/033_maintenance_draft_versions.sql)
- [034_maintenance_import_provenance.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/034_maintenance_import_provenance.sql)
- [035_nonroutine_review.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/035_nonroutine_review.sql)
- [036_nonroutine_review_suggestions.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/036_nonroutine_review_suggestions.sql)
- [037_nonroutine_assessment.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/037_nonroutine_assessment.sql)
- [038_nonroutine_finalization.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/038_nonroutine_finalization.sql)
- [039_maintenance_hour_periods.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/039_maintenance_hour_periods.sql)
- [040_nonroutine_adjustments.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/040_nonroutine_adjustments.sql)
- [041_nonroutine_cross_period.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/041_nonroutine_cross_period.sql)
- [042_nonroutine_notifications.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/042_nonroutine_notifications.sql)
- [043_nonroutine_posting_receipts.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/043_nonroutine_posting_receipts.sql)
- [044_maintenance_standard_management.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/044_maintenance_standard_management.sql)
- [045_nonroutine_role_results.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/045_nonroutine_role_results.sql)
- [046_maintenance_standard_review.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/046_maintenance_standard_review.sql)
- [047_maintenance_standard_notifications.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/047_maintenance_standard_notifications.sql)
- [048_maintenance_standard_publication.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/048_maintenance_standard_publication.sql)
- [049_maintenance_manual_sources.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/049_maintenance_manual_sources.sql)
- [050_work_standard_intake.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/050_work_standard_intake.sql)
- [051_maintenance_standard_import.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/051_maintenance_standard_import.sql)
- [052_maintenance_module_instances.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/052_maintenance_module_instances.sql)
- [053_nonroutine_corrections.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/053_nonroutine_corrections.sql)
- [054_maintenance_workflow_tasks.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/054_maintenance_workflow_tasks.sql)
- [055_maintenance_rule_history.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/055_maintenance_rule_history.sql)
- [056_maintenance_report_source_journal.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/056_maintenance_report_source_journal.sql)
- [057_maintenance_review_addition_sources.sql](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/migrations/057_maintenance_review_addition_sources.sql)

### 11.3 全部210项状态快照

以下逐项来自当前台账，不做状态升级；每一项的完整evidence/limitation均须回读原JSON。原sourceLine是过去台账对原文的定位，在原文缺失时不是今天重新核对过的原文行号。

|编号|状态|场景|原要求|原文行|
|---|---|---|---|---:|
|P0-01|partial|同一机会多个分项，仅一个提报|整体可已提报，但不得误进待复核/已确认|1033|
|P0-02|partial|例行保存草稿|不生成正式报工/个人待复核工时|1034|
|P0-03|partial|例行正式提报|按当前分配规则生成待复核，已确认数保持不变|1035|
|P0-04|partial|维修机会整体已确认|该机会合法待复核工时恰好一次转已确认|1036|
|P0-05|partial|维修机会确认接口重复点击/网络重试|不重复计入个人已确认工时|1037|
|P0-06|partial|普通入口修改已确认报工|服务端拒绝、历史不变、有必要审计|1038|
|P0-07|partial|人员 A 多工种、多个人员同工种|关联完整且不重复，顺序无关|1039|
|P0-08|partial|取消勾选既有派工关联|不产生隐式删除|1040|
|P0-09|partial|草稿共享编辑并发|版本冲突有提示、无静默覆盖|1041|
|P0-10|partial|已锁定例行批次后变更派工|历史人员/工时快照不变|1042|
|P0-11|partial|非例行审核未完成但普通报工齐备|机会按正常规定可被复核确认，未定工时不入账|1043|
|P0-12|pending|审核在机会未确认前完成|审定工时进入待复核，不直接已确认|1044|
|P0-13|pending|审核在机会已确认后完成|通过一次性通道入账，不改写原报工|1045|
|P0-14|pending|同一审核单双击补记或并发请求|最多一次有效补记，通道关闭|1046|
|P0-15|partial|通道取消/已消费后重试|不能再次入账；已入账更正需新审批冲销|1047|
|P0-16|partial|首页点击同机号不同机会|按 `opportunityId` 进入正确执行记录|1048|
|P0-17|partial|首页本人机会统计|只计当前有效正式派工，按机会 ID 去重|1049|
|P0-18|partial|无派工/无授权/超范围访问|API 拒绝；前端提示；不泄露其他人数据|1050|
|P0-19|pending|放行权限不足者提交/核对|服务端阻止越权|1051|
|P0-20|pending|旧数据/旧客户端回归|历史已确认明细、现有操作与读取行为未遭破坏|1052|
|P0-21|pending|8类别兼容旧数据|原4类历史不变；新增4类独立稳定编码，不将类别当派工工种|1058|
|P0-22|partial|标准来源/五项锁定|标准五项不可被普通报工或复核直接修改；未收录只存申请五项|1059|
|P0-23|partial|人工指定12名资格人员|不自动选人/候补；功能权限及作用范围由服务端验证|1060|
|P0-24|partial|11人已提交时发起终审|服务端拒绝，不能通过前端绕过|1061|
|P0-25|partial|12名不同评议人全部提交|同事务封闭；不可出现第13条有效意见，旧轮锁定|1062|
|P0-26|partial|评议成员读取他人的工时及依据|所有API/导出/SSE均不泄露；自身意见可读|1063|
|P0-27|partial|非工时字段修改建议|可共享、留痕，但不更改原申请/正式字段、不重置其他人评价|1064|
|P0-28|partial|终审参考值|12人排序后去1高1低，均值分母10，中位数取第6/7；并列极值只各去1个|1065|
|P0-29|partial|终审变更类别影响分配|重走原合法核算策略；无法分配则待处理，不猜比例/人员|1066|
|P0-30|partial|未收录工作提报且工时未认定|只显示审核中暂估，不重复产生正式待复核及已确认工时|1067|
|P0-31|partial|维修机会待复核/已确认且工时仍在评议|机会按原业务正常流转，工时审核不阻塞；待审值不转正|1068|
|P0-32|partial|审核早于机会确认|认定结果产生唯一待复核来源；后续机会确认只转正一次|1069|
|P0-33|partial|审核晚于机会确认|旧报工快照/机会状态不变，唯一通道追加已确认补记|1070|
|P0-34|partial|最终审核与维修机会确认并发|只存在一条合法生效入账路径，不双计、不遗漏|1071|
|P0-35|partial|同一通道成功后重复请求、断网重试|恒定返回原消费结果，不重复补记；历史完整|1072|
|P0-36|partial|审核取消/补记后正式更正|关闭原通道，补记后的更正走新更正事项和冲销流水|1073|
|P0-37|pending|V1→V2相同工作仅工时变化，未确认|旧提报快照保留，当前待复核按明确适用条件重算|1074|
|P0-38|pending|V1→V2定义/适用范围改变或原工作已确认|不能静默更新已确认及不适用工作，产生核实或更正路径|1075|
|P0-39|partial|三方附加/试车/两种除冰核算|**V9.9覆盖：三方附加、试车确定按有效参与人员均分；两种除冰仍待定，未经批准不得启用其正式核算**；同时验证工时单位、精度、旧规则及尾差。|1076|
|P0-40|partial|24h/36h/48h提醒|正确收件人，不发72h提醒，任务完成后停止提醒|1077|
|P0-41|partial|审核期间维修机会复核改变工作事实|保留原快照并标记评议依据变更；不得静默按旧内容入账|1078|
|P0-42|partial|未审/零工时/空值|不用0表示未审，合法零值与未审不同，查询不假计|1079|
|P0-43|partial|账期已关闭|产生跨期调整待办，不直接改写历史结算累计|1080|
|P0-44|partial|12人并发提交同一评议轮|唯一不同成员、轮次封闭事务正确；进度和终审快照一致|1081|
|P0-45|pending|放行报工已提交|只生成合法**放行架次**结果；不能生成放行人员工时|1088|
|P0-46|pending|放行架次统计与工时账本同时查询|单位独立、来源可追溯，架次不计入工时合计|1089|
|P0-47|pending|非例行普通工时 + 评审补记工时|均计入`NONROUTINE`，按渠道下钻但非例行总计包含两者|1090|
|P0-48|partial|审核补记重复提交、重试及并发|同一认定对同一人员最多有效一次；重复不增加非例行工时|1091|
|P0-49|partial|新模块注册/禁用/版本升级|既有已确认机会状态不变；历史模块及规则快照可复核|1092|
|P0-50|partial|新模块向整体状态服务发请求|模块自身不能写整体状态；只允许服务端协调器按已批准规则流转|1093|
|P0-51|partial|非报工检查反馈模块提交|默认不能令维修机会从“已派工”变成“已提报”|1094|
|P0-52|pending|新模块阻断门槛作用于特定适用机会|适用性正确、规则版本固定；不适用机会不受阻断|1095|
|P0-53|partial|原三报工完整性及放行核对|加入通用协调器后，原状态迁移及放行核对条件不退化|1096|
|P0-54|pending|已确认机会后补录非阻断流程结果|只追加合规结果/事件，不能解锁或改写原报工|1097|
|P0-55|partial|通用工作流任务跨角色/数据范围访问|后端RBAC严格限制，跨人员/跨班组不泄露任务或评议依据|1098|
|P0-56|partial|模块事件重放/乱序/断网同步|只刷新最新投影、事件幂等，不重复写工时/放行架次|1099|
|P0-57|pending|一次外站过夜检查关联多机会|记录唯一来源，通过关系表引用，不复制相互冲突的检查事实|1100|
|P0-58|partial|模块输出无工时/架次的检查与审批结果|类型化API允许，不能虚构零工时或零架次入账|1101|
|P0-59|partial|旧 V1.0/已发布报工与老客户端|无新增模块或规则时行为与原实现一致，数据可读且写接口兼容|1102|
|P0-60|pending|新模块规则更改在进行中机会|默认冻结原规则；有权变更必须影响分析、版本审计并显式批准|1103|
|P0-61|partial|同一非例行类别配置比例|各类别策略独立版本化，后台改比例不无痕改变既有已确认记录|1111|
|P0-62|pending|单项工作多人同角色/空角色|根据原接口有效策略计算；重复角色、空角色、精度及尾差与原结果一致，禁止新算法|1112|
|P0-63|partial|拖机选择有效标准库工作|总工时来自有效标准库；个人分配依据拖机在原后台**实际生效策略**，当前如均分才均分；旧入口停新写但历史可追溯|1113|
|P0-64|partial|拖机未收录新项目|进入未收录12人评议，不回到旧手动设置工时功能|1114|
|P0-65|pending|拖机→单项工作，原/终审策略差异|不能只依据类别名判断；比较真实策略内容、比例及版本；需要角色时由终审人线下核实、同页按需确认|1115|
|P0-66|pending|已确认机会终审类别/策略变化|不改原参与人及报工；终审一次形成独立认定快照，原接口计算后一次性补记，缺事实/规则暂停|1116|
|P0-67|pending|仅ATA/名称/范围变化|字段变化自身不切换策略；仍核对后台合法适用策略版本，若发生独立版本变化不得仅凭类别相同忽略|1117|
|P0-68|pending|最终审批人调整五项正式字段|12/12后同轮直接终审，无第二轮任务；差异依据和原12人意见完整留痕|1118|
|P0-69|pending|原分配器输入不合法或规则版本缺失|按原接口的实际校验/错误处理挂起同步；空缺角色不是天然错误，禁止临时改比例或新算法|1119|
|P0-70|partial|标准库已认定工时由普通管理员请求直接编辑|服务端拒绝；仅终审权限能发起新版本修改评议|1120|
|P0-71|partial|终审权限发起标准库已认定工时变更|按新增项目12人评议；旧标准有效且旧确认工时不变；新版本单独发布|1121|
|P0-72|partial|维修机会机型为A320|自动匹配适用A320的全部有效标准项目；不得误将所有A319/A321自动视为等价|1122|
|P0-73|partial|机型缺失/解析失败/结果为空|显示全部并明确未匹配提示，允许手动核验，不悄悄认定适用性|1123|
|P0-74|partial|标准条目适用多机型与通用条目|匹配规则、版本快照和适用性校验准确，旧机型标准记录可读|1124|
|P0-75|partial|iOS搜索框获取焦点|页面不自动缩放、不关闭系统无障碍缩放，键盘打开仍可操作列表|1125|
|P0-76|partial|非例行标准条目底部抽屉|与父内容区同宽、从下弹出、顶部可点父页面关闭、滚动和返回草稿正确|1126|
|P0-77|partial|弹层内新增未收录工作|仍属于当前原工作单项/机会，不产生第二套报工或重复审核单|1127|
|P0-78|pending|角色/策略确认与机会确认并发|只有一个合法有效工时来源，缺角色不误入已确认；补记幂等|1128|
|P0-79|pending|后端工时分类汇总|审核补记仍属于NONROUTINE，拖机只是NONROUTINE子类别；放行只产架次|1129|
|P0-80|partial|可扩展模块与原系统回归|旧三报工、原五态、放行核对、已确认锁定、首页执行入口和历史工时保持一致|1130|
|P0-81|partial|目标8类别策略映射|两类角色组合比例共用原7组配置；拖机/试车/三方附加复用原均分算法；其他/人工除冰/联合除冰标待定，不造第二个比例权威源|1136|
|P0-82|pending|工卡指令与单项工作均为5:3:2|不因类别名不同而强制重新选角色，需比较策略语义和角色兼容性|1137|
|P0-83|partial|单项工作同类别由5:3:2改4:3:3|即使类别不变也发现策略差异，按已发布版本适用性合法处理并留快照|1138|
|P0-84|pending|原/最终类别不同但模式、角色、比例相同|输入兼容时自动复用原参与角色，不多做审批和不要求无效重选|1139|
|P0-85|pending|多人同角色（主做×3检验×1）|严格与原接口输出一致，不将角色数量误作角色种类，不重复计人|1140|
|P0-86|pending|某角色无人（辅助×0）|**原接口确定性处理**；前端不得强制空角色改0或人工把剩余比例重新分配|1141|
|P0-87|partial|空角色配置接口未实现/无适用策略|明确挂起并报警/记录，不偷偷猜测均分、比例重分配或伪造成功|1142|
|P0-88|partial|终审页面比例展示|只读；没有调整比例输入框；有权后台通过原接口改配置且留生效版本|1143|
|P0-89|partial|终审人线下确认必要人员角色|在同一终审动作确认、记录依据、无第二角色授权/审批，不能改原参与人|1144|
|P0-90|pending|非类别字段修改但适用策略版本变化|不能仅凭类别同名跳过分配影响校验；按实际适用版本对比|1145|
|P0-91|pending|已确认机会类别/策略变更，首次待审核未入账|原报工不变；终审独立快照 + 专属通道一次性补记 NONROUTINE|1146|
|P0-92|partial|已确认机会正式工时已经入账后更正|不重开一次性通道；独立授权更正事项与差额流水、原历史留存|1147|
|P0-93|pending|终审与后台策略发布并发|有效版本在事务中重检，不能将新版无提示覆盖已审定旧版，重复重试不双计|1148|
|P0-94|pending|已提报、待复核、已确认三时点|已提报/待复核按**当时实际状态**接入原合法转正链条，确认后仅受控补记；角色缺失保持审核已认定但未同步，机会照常流转|1149|
|P0-95|pending|工时单位/重复/尾差与原服务|原分配计算输出对账一致，未授权的策略改动不产生历史重算|1150|
|P0-96|pending|审核补记工时与正常非例行合并|`NONROUTINE`同类别、`postingChannel`区分来源，不建立额外累计账本|1151|
|P0-97|partial|非例行策略入口|原工时管理页保留7组组合比例及API，新增8类别摘要（5已定3待定）；改比例需后台授权与版本审计，终审只读|1152|
|P0-98|pending|回归维修机会容器与放行架次|原三报工/五态/扩展模块/放行架次独立结果不受新的策略适配影响|1153|
|P0-99|partial|真实规则四种`rule_type`映射|读取/保存旧4种规则不损失原值，`nonroutineCategoryHours`金额不得误当比例|2109|
|P0-100|pending|原4类别与新增4类别共存|旧数据类别、历史别名、旧查询不被新枚举破坏，新增4类按权威配置查询|2110|
|P0-101|partial|拖机旧金额与均分回归|旧3h默认及已有拖机数据按历史规则核对；停用金额入口不破坏统计|2111|
|P0-102|pending|按实际角色集合匹配七组合|非例行有主做/检验但无辅助时命中**“主做+检验”**而非三角色组；与原服务逐分一致。若正确组合运行后仍出现未分配预算，仅按服务端真实结果留痕，不作人工转赠|2112|
|P0-103|pending|重复角色均分|主做3人+检验1人，角色池按真实原算法均分，排序稳定、无重复行|2113|
|P0-104|pending|舍入与精度|`maintenance-hours-rounding.test.mjs`原案例及新增8类案例一致，整数分尾差逐人正确|2114|
|P0-105|partial|非例行规则历史快照缺口|旧历史无版本则标`legacy/unknown`，不伪造版本，已确认工时不被最新规则重算|2115|
|P0-106|partial|同类别新版比例差异|类别不变而5:3:2→4:3:3时识别生效规则变化；仅对合法适用的事项重新计算|2116|
|P0-107|pending|跨类别相同策略|两类别配置语义一致、人员角色相容时沿用映射，不强制二次审批|2117|
|P0-108|pending|工时金额与分配比例分离|标准库认定金额来自标准版本，分配必须调用原服务，不从标准库读取新的比例配置|2118|
|P0-109|partial|新标准库初次部署|旧非例行及拖机正常读写不受默认开启影响；特性开关只作用目标场景|2119|
|P0-110|partial|机型匹配精确|`A320`精确命中，`320/A319/A321`不自动当同码；失配清楚提示且显示全部可见有效条目|2120|
|P0-111|partial|12人评议与任务树复核隔离|原`maintenance.review.submit`不能越权读取/终审新私有意见；原复核API行为不变|2121|
|P0-112|pending|`已提报`工时状态|报工提报时正常结果可先`已提报`，不能提前直接升为`待复核`；正常finalize后才迁移|2122|
|P0-113|pending|非航后自动确认|新模块判定不能阻断或错误重复触发原`autoConfirmMaintenanceRoutine`特例|2123|
|P0-114|pending|已确认不降级|`preserveConfirmed`及归档保护依旧，任何审核/SSE重放不能把已确认变回待复核|2124|
|P0-115|pending|审核中暂估与正常结果隔离|未收录新申请正式提报后暂估不进入`maintenance_hour_results`有效合计或个人已确认统计|2125|
|P0-116|partial|原归档补录与新评议补记隔离|旧`review_save/归档补录`保留既有权限与历史，新`reviewCase`同源不得二次全额入账|2126|
|P0-117|pending|已确认后首次审定|原已确认报工及参与人快照逐字节不变，新补记作为非例行工时可追溯净额进入合计|2127|
|P0-118|pending|已入账后更正|同源有已确认结果仅差额/冲销，不用原通道再次全额计入|2128|
|P0-119|pending|唯一审核通道并发|两请求同时审定或网络重试，数据库唯一约束确保同一个人同一批准版本仅记一次|2129|
|P0-120|partial|账期关闭|不修改封账期，待跨期授权任务保留审计与唯一业务键|2130|
|P0-121|partial|任务树复核授权|`maintenance.archive.modify`原合法路径可用，新评议不可借该权限修改原确认快照|2131|
|P0-122|pending|放行架次独立|`maintenance_sortie_results`每机会有效人一次且恒1，正式工时没有放行来源，原报表两者区分|2132|
|P0-123|partial|首页进入执行定位|带机会ID仅跳原执行页；该功能上线前标未实现，不出现第二套报工|2133|
|P0-124|partial|底部抽屉iOS放大/SSE|搜索焦点≥16px、父页面点击关闭安全、键盘viewport与关闭后SSE刷新一致|2134|
|P0-125|partial|SQLite+PG迁移|新增迁移不修改001～029；双引擎唯一约束、重跑幂等、PG Linux包通过|2135|
|P0-126|partial|模块状态门槛对比|旁路门槛对齐原三类提交、finalize/autoConfirm、review save/confirm、已确认锁定及报工作废分支|2136|
|P0-127|partial|八类按5已定3待定展示|两角色组合/三均分/三待定；未知不自动填默认值|2227|
|P0-128|pending|工卡指令、单项工作共用7组|两类别读取同一个实际`nonroutineCombinationRatio`组合配置，无双写或第二比例副本|2228|
|P0-129|pending|七组角色集合完整映射|7种非空子集逐个命中正确组合；不误用三角色比例|2229|
|P0-130|pending|主做3人、检验1人、辅助0人|命中主做+检验组合，同角色内均分；结果与原服务逐分一致|2230|
|P0-131|pending|仅主做/仅检验/仅辅助|读取对应单角色组合并正常计算，空缺其他角色不人工摊派|2231|
|P0-132|pending|截图中的三角色组|三角色组0.4/0.3/0.3仅为该时点界面展示；保存/读取以后台真实值为准，其他六组不捏造|2232|
|P0-133|partial|角色组合配置被后台修改|新合法版本/快照和旧历史可追溯，已确认结果不重算|2233|
|P0-134|partial|拖机旧报工|默认金额与均分历史结果维持，未完成标准库迁移不关闭旧入口|2234|
|P0-135|partial|拖机新标准工时|新金额来自标准库/合法终审，个人均分，旧金额键不再新写，历史查询仍正常|2235|
|P0-136|partial|三方附加/试车均分|任意合法参与人数均分；稳定尾差、重复人排除，与统一计算器一致|2236|
|P0-137|pending|其他旧数据保护|业务策略待定但原生产规则/历史不损坏，新设计不得强制把旧数据改为均分|2237|
|P0-138|pending|两种除冰待定|未经负责人批准无正式新策略入账，草稿及提示与原机会状态分离|2238|
|P0-139|pending|角色组合→均分终审类别变化|比较实际策略、版本、人员和结果，终审无手工比例输入框|2239|
|P0-140|pending|工卡指令↔单项工作终审类别变化|共享七组不强制重选人员；配置版本不同仍判断影响并存快照|2240|
|P0-141|pending|终审修改ATA/名称/范围|不直接改变类别分配模式和比例，但版本适用性独立校验|2241|
|P0-142|pending|已确认机会评议结果追加|原报工锁定，首次经新通道按真实策略一次入账非例行；重试不双计|2242|
|P0-143|pending|已确认后再更正|新授权差额流水，不重开旧通道，原参与/报工不被覆盖|2243|
|P0-144|pending|权限与隐私|七组比例写仅原规则管理员；终审读只读/角色核实；普通评议员不能看他人小时及理由|2244|
|P0-145|pending|旧三报工及放行架次|例行工时、非例行工时、放行架次分立原账本；原五态、finalize/autoConfirm与SSE回归通过|2245|
|P0-146|pending|三类策略仅留扩展口、不阻塞其他范围|三类新策略保留未来扩展口、不可自行补值；已定5类及草稿、评议等其它已确定功能可独立实施和验收|2246|
|P0-147|partial|I-01 原Excel入口|旧上传入口仍可用，新预览正确进入；兼容旧合法文件|2722|
|P0-148|partial|I-02 批量唯一匹配|唯一已发布且适用标准自动绑定ID和版本，不取Excel参考工时|2723|
|P0-149|partial|I-03 多候选|多个候选不自动认定，必须人工单选且有审计|2724|
|P0-150|partial|I-04 模糊名称|工作范围不同不得仅名称相似自动选定|2725|
|P0-151|partial|I-05 机型校验|A320不能自动别名为320/A319/A321，不适用标准不得绑定|2726|
|P0-152|partial|I-06 未收录草稿|commit后原机会存在唯一原工作项/草稿关联，不生成评议|2727|
|P0-153|pending|I-07 不完整导入|可保留缺名称/范围/申请时长的非例行草稿，正式提交时拦截补齐|2728|
|P0-154|partial|I-08 派工前后可见性|未派工不会向执行者显示已接收任务；派工后原执行页有草稿|2729|
|P0-155|partial|I-09 原编辑组件|来源Excel/人工的草稿共用原报工弹窗、人员选择、保存流程|2730|
|P0-156|partial|I-10 草稿多人编辑|revision并发冲突明确提示，不能后写静默覆盖|2731|
|P0-157|pending|I-11 草稿无评议|连续保存/重复打开/跨端刷新均不创建评议case|2732|
|P0-158|partial|I-12 报工前重匹配|草稿修订后能唯一命中已发布标准，确认引用后不创建评议|2733|
|P0-159|partial|I-13 报工前多候选|阻断提交直到完成合法人工候选确认|2734|
|P0-160|partial|I-14 未收录提交|正式提报成功恰好创建1个review case，保存不可变申请快照|2735|
|P0-161|pending|I-15 防重复提报|并发/重试/刷新不能创建双批次、双评议或双工时|2736|
|P0-162|pending|I-16 暂估隔离|Excel申请工时不写有效`maintenance_hour_results`，不计绩效或已确认|2737|
|P0-163|partial|I-17 机会不阻塞|有已提报未收录review case时，原合格报工可按原流程finalize/确认|2738|
|P0-164|pending|I-18 审核终审|12名唯一评议、私密工时与依据、终审一次认定；标准库发布另由准入结论控制|2739|
|P0-165|partial|I-19 原锁定保护|已确认机会导入不得修改原 subtask、人员/工时；旧归档更正不受破坏|2740|
|P0-166|pending|I-20 审核后补记|已确认且此前未入账时一次性非例行补记；重试不重复|2741|
|P0-167|pending|I-21 已入账更正|只能走授权差额/冲销审计，不重复全额记账|2742|
|P0-168|partial|I-22 部分成功|100行中少量错误仍成功导入其他合规行，逐行回执清晰|2743|
|P0-169|partial|I-23 提交中断重试|同批次行ID/幂等键重试返回同一subtaskId，无孤儿数据|2744|
|P0-170|partial|I-24 二次导入相似|跨批次提示潜在重复，不擅自覆盖/删除另一有效工作|2745|
|P0-171|partial|I-25 权限|导入者/执行者/标准管理员/12人评议权限与作用范围隔离|2746|
|P0-172|partial|I-26 日常管理CRUD|草稿可修改；已发布需版本修订；被引用项只能停用不硬删除|2747|
|P0-173|partial|I-27 策略分类|2类共享原7组、3类均分、3类未定不臆造工时分配；比例按配置且和为1|2748|
|P0-174|partial|I-28 跨端/数据库|SSE/手机键盘/编辑延后刷新+SQLite/PG迁移和原441测试基线回归|2749|
|P0-175|partial|同机会三行+既存人工草稿|合并后四项全部存在，任何导入行失败/409不覆盖原草稿；成功与失败回执准确；支持原草稿CAS重试（R-03/R-11）|2750|
|P0-176|partial|未派工到已派工原执行可见|导入只创建原工作/合法草稿，未派工不能被执行者操作；真实派工后本人原执行页直接看到草稿，无第二界面（R-04）|2751|
|P0-177|partial|同一非例行批次多未收录项|一个原flight×nonroutine批次含3个不同subtask→3个隔离reviewCase；重试仅复用各自case（R-05）|2752|
|P0-178|partial|已发布+未收录混合批次|已发布项按标准来源生成有效小时；未收录项仅出审核暂估；任务树原有效工时检查不被全局放松（R-01/R-02）|2753|
|P0-179|pending|未收录+机会已确认|未收录待审时原任务树满足合法门槛后确认成功且未计申请小时；终审追加唯一非例行来源，原报工与架次完全不变（R-02/R-08）|2754|
|P0-180|partial|标准库准入未批准|12人终审认定可按合法策略入账；`不纳入/待定`不向通用标准搜索发布条目；仅合法`纳入`版本可供后续新引用（R-09）|2755|
|P0-181|partial|申请字段部分缺失草稿落库|真实数据库非例行draft保存成功且可续编辑，无伪ATA/工时；正式提报缺字段被拦截；回归原完整草稿（R-10）|2756|
|P0-182|partial|标准版本在预览后变化|提交前重新验证自动/人工选定的标准版本、机型及范围，失效时标记待人工确认；不会默默按过期版本入账（R-13）|2757|
|P0-183|partial|已提报批次遭Excel二次导入|不能通过重新匹配覆盖、作废原批次或修改已锁定人员；原授权归档更正路径继续可用（R-07）|2758|
|P0-184|partial|旧归档补录与新一次通道竞争|同工作来源双路径并发不能形成双份个人工时；如已入账只产生合法差额与审计（R-06）|2759|
|P0-185|partial|多端多用户并发导入|两个用户对同一机会相交行和整份draft竞争，version/唯一键生效；无重复subtask、无丢行、SSE关闭编辑器后刷新（R-03/R-15）|2760|
|P0-186|pending|三未决工时策略与旧其他共存|新除冰可暂存但未批准不能正式入账；旧其他历史合法工时仍展示；不伪造角色组合比例、独立比例来源或自动均分（R-19）|2761|
|P0-187|partial|仅文字预录入|导入未收录Excel后只新增原未提报草稿事实/来源，`maintenance_report_batches`、正式工时、正式标准、评议均无业务新增|2949|
|P0-188|partial|未收录Excel有工时/人员列|原始来源可审计但不自动绑定参与人、不作为正式申请工时或分配结果，执行者原页面重新确认|2950|
|P0-189|partial|不完整文字草稿|缺ATA/范围/工时可保存并在派工后续编；不填虚假值；正式提报缺必要项被阻断|2951|
|P0-190|partial|多次保存无评议|打开、修改、保存10次并切换终端后，仍只有草稿且评议case为零|2952|
|P0-191|partial|草稿正式提交后才评议|完成五项/人员/权限校验并正式报工才为每未收录单项创建唯一12人评议，未提前入正式工时|2953|
|P0-192|partial|草稿主动删除|有权执行人删除指定未提报工作，不影响其它已有草稿、派工或历史来源；保留删除审计|2954|
|P0-193|partial|删除后同请求重试|返回原来源已删除，无工作项复活，`subtaskId`及审计可追溯|2955|
|P0-194|partial|删除后同文件重新导入|稳定源指纹识别已处理并已删除，默认跳过；需新业务授权才能重新建草稿|2956|
|P0-195|partial|同文件名不同文件内容|以文件内容摘要+目标机会+行号核对，不将不同文件误判同源|2957|
|P0-196|partial|同文件内容不同文件名|相同机会相同行稳定识别同一来源，重传不产生第二草稿|2958|
|P0-197|partial|同Excel同机会重复行|预览列出可疑重复，commit仅明确选择的不同实际工作可新建，默认不重复|2959|
|P0-198|partial|不同Excel相同工作范围|比对同机会现有人工与导入草稿和正式项，默认阻断或待确认，不覆盖原数据|2960|
|P0-199|partial|相同名称但不同范围|显示差异与已存在单项，授权确认后允许建立新ID，不自动合并|2961|
|P0-200|partial|已提报项目再次出现|只读提示既有正式项目，不能通过导入改写、重置或复制已锁定工作|2962|
|P0-201|partial|同机会两个上传者并发|两个请求竞争CAS/唯一键，只有合法独立新增项持久化，无丢失人工草稿或重复正式工作|2963|
|P0-202|partial|同机会已有人工草稿|导入增加新单项后人工草稿仍完整，次序/数据不被整份PUT覆盖|2964|
|P0-203|partial|100行部分成功|行级成功/跳过/失败及批次合计一致，失败行重试安全，不留孤儿草稿|2965|
|P0-204|partial|预览后原草稿变动|commit重新读取当前版本与同机会工作集合，冲突409或待核实，不用旧预览覆写|2966|
|P0-205|partial|未派工与已派工可见性|未派工只管理可见，派工后合法执行人原执行列表出现草稿，可编辑删除，无第二工作台|2967|
|P0-206|partial|原草稿删除边界|处理最后单项/同机会多单项的安全删除，严格遵守原锁定与权限，其他人草稿不丢|2968|
|P0-207|partial|候选变化与提交重匹配|正式提报前若已经有适用标准，按候选/确认逻辑引用，未收录case仅在仍未收录时产生|2969|
|P0-208|partial|终审和正式工时隔离|导入/保存/待审不产生已确认小时；终审后正常待复核或唯一已确认补记，月度合计不重计|2970|
|P0-209|partial|三类留口不阻塞其它业务|其他/两除冰新增算法保持禁用、旧其他兼容；两比例类、三均分类与草稿能力可独立通过验收|2971|
|P0-210|partial|SQLite/PG、SSE、RBAC与审计|双数据库唯一键和迁移幂等、原权限/编辑器同步、导入来源/删除墓碑/确认记录完备|2972|

### 11.4 原有证据目录索引

以下为本次交接前已有目录，按名称列出，不代表逐目录/逐图今天重新验收。目录中的中途“running/pending”、旧计数与后续完成记录可能并存，须读实际文件和源码摘要，不能选一个绿数当全项目结论。

- [maintenance-v101-approved-policies-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-approved-policies-20261111)
- [maintenance-v101-archive-addition-identities-20261116](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-archive-addition-identities-20261116)
- [maintenance-v101-archive-independent-authority-20261116](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-archive-independent-authority-20261116)
- [maintenance-v101-archive-managed-source-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-archive-managed-source-20261115)
- [maintenance-v101-cancellation-real-races-and-browser-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-cancellation-real-races-and-browser-20261115)
- [maintenance-v101-cancelled-final-history-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-cancelled-final-history-20261115)
- [maintenance-v101-cancelled-mixed-projections-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-cancelled-mixed-projections-20261115)
- [maintenance-v101-category-summary-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-category-summary-20261111)
- [maintenance-v101-content-source-lock-20261113](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-content-source-lock-20261113)
- [maintenance-v101-core-report-current-authority-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-core-report-current-authority-20261114)
- [maintenance-v101-correction-foundation-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-correction-foundation-20261111)
- [maintenance-v101-correction-services-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-correction-services-20261111)
- [maintenance-v101-correction-workbench-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-correction-workbench-20261111)
- [maintenance-v101-direct-source-cancellation-20261113](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-direct-source-cancellation-20261113)
- [maintenance-v101-dirty-review-access-20261116](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-dirty-review-access-20261116)
- [maintenance-v101-dispatch-associations-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-dispatch-associations-20261114)
- [maintenance-v101-dispatch-snapshot-and-actual-ui-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-dispatch-snapshot-and-actual-ui-20261115)
- [maintenance-v101-extension-registration-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-extension-registration-20261111)
- [maintenance-v101-extension-registration-api-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-extension-registration-api-20261111)
- [maintenance-v101-home-full-set-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-home-full-set-20261111)
- [maintenance-v101-home-history-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-home-history-20261111)
- [maintenance-v101-home-navigation-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-home-navigation-20261111)
- [maintenance-v101-import-preview-rematch-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-import-preview-rematch-20261115)
- [maintenance-v101-imported-candidate-selection-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-imported-candidate-selection-20261115)
- [maintenance-v101-independent-publisher-20261110](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-independent-publisher-20261110)
- [maintenance-v101-independent-review-cancellation-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-independent-review-cancellation-20261115)
- [maintenance-v101-later-unique-reference-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-later-unique-reference-20261115)
- [maintenance-v101-legacy-coordinator-20261113](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-legacy-coordinator-20261113)
- [maintenance-v101-linux-artifact-gate-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-linux-artifact-gate-20261114)
- [maintenance-v101-locked-confirmation-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-locked-confirmation-20261111)
- [maintenance-v101-locked-import-history-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-locked-import-history-20261115)
- [maintenance-v101-locked-routine-dispatch-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-locked-routine-dispatch-20261115)
- [maintenance-v101-management-access-browser-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-management-access-browser-20261114)
- [maintenance-v101-management-access-clear-20261113](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-management-access-clear-20261113)
- [maintenance-v101-manual-execution-20261110](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-manual-execution-20261110)
- [maintenance-v101-mixed-report-browser-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-mixed-report-browser-20261115)
- [maintenance-v101-mixed-source-removal-20261113](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-mixed-source-removal-20261113)
- [maintenance-v101-module-gates-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-module-gates-20261111)
- [maintenance-v101-module-instances-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-module-instances-20261111)
- [maintenance-v101-module-result-contract-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-module-result-contract-20261111)
- [maintenance-v101-module-shadow-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-module-shadow-20261111)
- [maintenance-v101-multiprocess-concurrency-20261113](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-multiprocess-concurrency-20261113)
- [maintenance-v101-nonroutine-current-authority-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-nonroutine-current-authority-20261114)
- [maintenance-v101-nonroutine-dispatch-report-separation-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-nonroutine-dispatch-report-separation-20261115)
- [maintenance-v101-nonroutine-participant-draft-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-nonroutine-participant-draft-20261114)
- [maintenance-v101-nonroutine-participant-race-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-nonroutine-participant-race-20261114)
- [maintenance-v101-opportunity-edit-browser-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-opportunity-edit-browser-20261114)
- [maintenance-v101-opportunity-edit-version-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-opportunity-edit-version-20261114)
- [maintenance-v101-original-deletion-authority-20261116](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-original-deletion-authority-20261116)
- [maintenance-v101-original-lifecycle-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-original-lifecycle-20261114)
- [maintenance-v101-personal-review-estimates-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-personal-review-estimates-20261111)
- [maintenance-v101-pg16-20261110](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-pg16-20261110)
- [maintenance-v101-pg16-restore-20261110](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-pg16-restore-20261110)
- [maintenance-v101-publication-current-scope-20261113](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-publication-current-scope-20261113)
- [maintenance-v101-published-revision-20261110](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-published-revision-20261110)
- [maintenance-v101-recognized-identity-20261113](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-recognized-identity-20261113)
- [maintenance-v101-release-result-participant-source-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-release-result-participant-source-20261114)
- [maintenance-v101-report-authority-multiprocess-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-report-authority-multiprocess-20261114)
- [maintenance-v101-report-current-access-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-report-current-access-20261115)
- [maintenance-v101-report-participant-source-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-report-participant-source-20261114)
- [maintenance-v101-report-source-journal-foundation-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-report-source-journal-foundation-20261114)
- [maintenance-v101-report-source-lifecycle-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-report-source-lifecycle-20261115)
- [maintenance-v101-review-addition-transitions-20261116](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-review-addition-transitions-20261116)
- [maintenance-v101-review-authority-matrix-20261113](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-review-authority-matrix-20261113)
- [maintenance-v101-review-current-authority-20261113](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-review-current-authority-20261113)
- [maintenance-v101-review-result-source-identity-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-review-result-source-identity-20261114)
- [maintenance-v101-routine-dispatch-report-separation-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-routine-dispatch-report-separation-20261115)
- [maintenance-v101-routine-draft-dispatch-boundary-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-routine-draft-dispatch-boundary-20261114)
- [maintenance-v101-routine-draft-transaction-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-routine-draft-transaction-20261114)
- [maintenance-v101-routine-result-participant-source-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-routine-result-participant-source-20261114)
- [maintenance-v101-rule-history-20261113](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-rule-history-20261113)
- [maintenance-v101-source-cancellation-20261113](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-source-cancellation-20261113)
- [maintenance-v101-source-facts-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-source-facts-20261111)
- [maintenance-v101-standard-catalog-references-20261110](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-standard-catalog-references-20261110)
- [maintenance-v101-standard-choice-authority-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-standard-choice-authority-20261115)
- [maintenance-v101-standard-library-import-20261110](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-standard-library-import-20261110)
- [maintenance-v101-standard-management-authority-20261113](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-standard-management-authority-20261113)
- [maintenance-v101-standard-notifications-20261110](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-standard-notifications-20261110)
- [maintenance-v101-standard-publication-foundation-20261110](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-standard-publication-foundation-20261110)
- [maintenance-v101-standard-review-20261110](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-standard-review-20261110)
- [maintenance-v101-standard-review-ui-20261110](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-standard-review-ui-20261110)
- [maintenance-v101-task-tree-authority-multiprocess-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-task-tree-authority-multiprocess-20261115)
- [maintenance-v101-task-tree-current-authority-20261115](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-task-tree-current-authority-20261115)
- [maintenance-v101-tow-transition-20261111](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-tow-transition-20261111)
- [maintenance-v101-traceability-audit-20261114](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-traceability-audit-20261114)
- [maintenance-v101-twelve-reviewers-20261113](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-twelve-reviewers-20261113)
- [maintenance-v101-work-standard-intake-20261110](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-work-standard-intake-20261110)
- [maintenance-v101-workflow-actions-20261112](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-workflow-actions-20261112)
- [maintenance-v101-workflow-api-20261112](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-workflow-api-20261112)
- [maintenance-v101-workflow-audit-20261112](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-workflow-audit-20261112)
- [maintenance-v101-workflow-results-20261112](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-workflow-results-20261112)
- [maintenance-v101-workflow-storage-20261112](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-workflow-storage-20261112)
- [maintenance-v101-workflow-workbench-20261112](/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/maintenance-v101-workflow-workbench-20261112)

### 11.5 本交接的证据自检范围

生成后核对本MD指向的现存文件、210唯一编号/统计、源代码摘要、日志总计、PG stopped及浏览器未完成状态。缺失的原方案、raw临时夹具跨机可用性、真实环境/设备和未完成四阶段页面不会被自检补成成功。自检结果见附件validation.json。
