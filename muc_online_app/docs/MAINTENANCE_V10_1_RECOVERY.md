# V10.1 备份、恢复与功能回退边界

055规则变更版本须完整保留maintenance_rule_change_history的前后JSON/摘要、连续修订、当前操作者资格、原因/时间、缺口标识及版本化/旧签名标识。记录从实际观察到的变更开始，不按当前配置倒填旧历史或旧提报policy_json。configurationVersion属于新提报冻结出处，未知历史和未记录变化必须维持未知，不能在恢复时补成某个已记录版本。运行配置仍以原maintenance_hour_rules为权威，变更日志仅供追溯，不作为第二份可写规则。

本轮77项PG与146表3821行及全部目录对象恢复一致，3条实际变更、13份配置出处、原冻结策略与业务指纹核对通过，临时集群停止，证据见evidence/maintenance-v101-rule-history-20261113。回退前端时保留日志；旧签名规则请求按原权限兼容并明确留痕，不能宣称未带版本的请求已执行读取版本校验。

固定原规则协调器：应用MUC_MAINTENANCE_COORDINATOR_ENABLED默认关闭，不能随恢复擅自开启；隔离PG验证器明确开启用于演练。恢复必须保留coordinator_transition原决策、规则版本、模块ID、真实快照摘要/旧适配器标识、谓词及当时资格，不能用恢复时当前权限倒填历史。恢复后的当前源规则与持久/旧适配器审计须可核对，业务指纹不变。合成库准备阶段若原启动核对需要调整旧兼容状态，只允许追加经核验的协调审计，全部原审计逐字保持；不得借准备恢复之名重算已确认工时或重写冻结来源。默认回退开关只恢复原判断，不删除既有规则/来源/决策审计。新扩展门槛及正式规则发布不在本阶段批准范围。

通用内容入口保护必须随真实来源数据恢复：当前subtask关联assessment即不能通过通用新增/修改作废其已提报批次，关闭功能开关也不能解锁。旧合法批次的内容维护使用原维修事务，作废、写入与审计失败必须全部回滚。恢复演练新增实际POST/PUT拒绝检查，并在随后业务指纹核对中证明剩余评议及0工时未被改写；不将响应409本身当作无写入证据。对应目录evidence/maintenance-v101-content-source-lock-20261113。

单项删除的混合来源隔离：不得恢复成“取消一个待审事项即作废同批所有报工”的行为。保留剩余已提报单项、原派工、原审核通道及有效0工时结果，不能用重新生成的近似记录代替原始ID/版本。整机会删除的手工来源墓碑须保留原fingerprint、clientId、subtaskId，原ACTIVE/SUBMITTED状态保存在删除审计manualSources中；DELETED不能因再次上传/恢复而自动回到ACTIVE。最新演练核对剩余混合批次、0结果及两类手工墓碑，证据目录为evidence/maintenance-v101-mixed-source-removal-20261113。全量业务适配及上线验收仍未完成。

直接删除非例行单项的取消事件使用SUBTASK_REMOVAL，权限来源为原工作内容维护权限，不能恢复后替换成机会删除授权。保留原取消依据、当前资格快照、来源墓碑；之后删除同机会只为其余通道新增取消事件。恢复核对同时覆盖SUBTASK_REMOVAL与OPPORTUNITY_REMOVAL，不以所有通道显示已取消代替逐事件核验。本阶段完整证据目录为evidence/maintenance-v101-direct-source-cancellation-20261113；未确认批次其他评议与报工作废衔接仍需继续验证。

本说明针对本分支新增标准库、评议、账期、补记及角色明细。实际执行限于新建临时 PostgreSQL16 和合成数据，未备份、覆盖或切换业务库，未部署。测试结果及源文件指纹以 `evidence/maintenance-v101-pg16-restore-20261110/` 中的记录为准。

## 可重复执行的隔离演练

```sh
node scripts/check-maintenance-v101-postgres.mjs /绝对路径/PostgreSQL16/bin --restore
```

脚本拒绝占用的15432端口，每次新建私有临时目录和集群，不采用现有集群。新建普通应用账户、源测试库及另一个普通恢复账户/恢复库；只监听回环。密码不写命令行或报告，日志脱敏，备份文件0600，目录0700。结束删除本次恢复库/角色并停止本次集群，保留私有合成快照和证明。

执行顺序：旧身份有数据时拒绝迁移且保留原值；空旧结构升级全部当前迁移（现至053）并重复执行；运行完整服务端接口集；检查合成旧称谓/草稿兼容处理不改变金额及V10锁定事实；静止状态取指纹和 `pg_dump` 自定义格式备份；`pg_restore --exit-on-error --no-owner --no-acl` 至新库；逐表与目录对象比对；事务内测试角色唯一约束及父子级联并回滚；启动恢复库服务并两次重试每种已关闭通道及已锁定标准认定，以及两类真实来源的标准发布；再次检查原测试库不变。

`--restore-from-fixture` 仅用于复验此前本验证器产生、已停止且通过接口集的私有合成快照。它不重新执行接口集或迁移，摘要明确 `fixtureOnly`；不能把该模式当作完整回归。

## 检查内容

- 每张public表按行JSON排序计算SHA256，同时核对行数。
- 比对索引、约束、视图、函数、非内部触发器及序列状态。
- 原工时父行与角色明细应只通过统一视图计入一次；角色唯一键及父删除级联在恢复库实际执行后回滚，原数据指纹应完全恢复。
- 恢复服务启动不得改写稳定基线中的维修业务事实；`MERGED_CLOSED`、`ADJUSTED_CLOSED` 重试不得重开、重复生成结果、改写回执或原归档。已锁定标准认定重放也不得新增认定、修改版本或发布。仅允许正常刷新版本、登录/会话控制数据变化，业务表仍逐表比较。
- 源库在取备份基线之后必须保持全表及目录指纹不变。为合成旧夹具补齐的兼容状态单独记录，不能默默忽略未知差异。

## 业务库使用前仍需完成

本演练不覆盖实际历史人员映射、业务附件或COS对象、部署配置/密钥、持续写入中的备份、全并发、跨机器恢复、Linux运行及切流。业务备份须另覆盖附件和配置，验证可用性并核对工时/架次、来源与账期；不能用本机合成数据证明生产恢复完成。

现有人员身份仍为 `user_id` 且已有工时的库，040前置检查会拒绝继续；先执行项目既有受控人员身份预检/迁移，解决歧义并保留备份及映射证据。不得仅改列名把账户ID当人员ID，也不得删除旧行以通过检查。只有空旧工时表才允许在同一迁移事务及表锁下规范列名。

## 功能回退与数据库恢复

灰度前保留独立业务备份和原配置，记录待审事项、正式工时、补记、回执及放行架次基线。关闭新导入/评议/标准管理等入口开关只暂停新增路径，不删除已建立草稿、审核、已记结果或审计；当前兼容代码仍须保留统一工时读链。

新版本已写入角色明细或不可变补记后，直接启动旧代码/旧视图未验收，不能当成安全回退。需要数据回退时，先明确停写窗口及新增业务如何保留，在另一个隔离库恢复已验证快照，完成业务对账后再按授权切换连接；原库保留以便追溯，不原地删除045/子表/补记或重开关闭通道。

正式发布、停写、业务库恢复和切流均未在本次本机演练中执行，须作为实际发布验收的一部分单独确认。

标准站内通知由独立MUC_STANDARDS_NOTIFICATIONS_ENABLED开关控制，同时要求标准评议开关。关闭仅停止该通知消费与入口，不删除其outbox/已读回执；047通知表也属于完整备份指纹范围。当前本轮证据见evidence/maintenance-v101-standard-notifications-20261110，结论以该目录最终摘要为准。

macOS本机长时间测试可用caffeinate -is包裹上述命令，只在该测试进程期间保持唤醒。本轮曾观察到161秒系统睡眠与查询超时重合；失败日志保留，复跑不修改查询超时或用例门槛。

048独立标准版本准入/发布基础新增两张审计表，仍无可用发布HTTP入口或真实RBAC默认赋权；本轮127表恢复证据见evidence/maintenance-v101-standard-publication-foundation-20261110。合成发布权和机型审批回调不代表业务授权。

049手工原草稿来源纳入完整备份指纹；MUC_NONROUTINE_MANUAL_ENABLED默认关闭，已登记来源不会因关闭开关降级为旧直接入账。当前128表恢复证据见evidence/maintenance-v101-manual-execution-20261110。

独立发布功能由MUC_STANDARDS_PUBLICATION_ENABLED及标准评议开关共同控制，默认关闭。新增角色不自动分配给任何实际用户，系统通用权限不替代非系统角色的明确发布授权；停职、授权撤销或范围不全会拒绝。精确机型以现有维护配置当前有效唯一代码核验并保存版本；通用适用范围暂不发布。当前发布角色/API与128表恢复证据见evidence/maintenance-v101-independent-publisher-20261110。

050施工终审转标准新增来源绑定及WORK类型独立准入/发布表，外键指向真实施工终审，不伪造标准评议，保留原锁定五项、操作依据与明确机型。三表纳入完整指纹及迁移；与独立STANDARD来源共用准入发布引擎但各自保持真实final外键。恢复后对两类真实账户发布的原请求各重放两次，摘要与回执应不变，不能因此再次同步施工工时。默认仍要求标准发布及标准评议开关，关闭入口不删除来源、审计或发布记录。本轮完整恢复结果以evidence/maintenance-v101-work-standard-intake-20261110为准。

已发布修订完整接口夹具包含真实原草稿/正式提交/复核确认形成的V1=0引用，再独立评议并发布V2=1.2；恢复指纹包括两代认定/发布与旧工时来源。最新131表3092行证明见evidence/maintenance-v101-published-revision-20261110；恢复重放不能把新版认定回推已确认V1报工。版本页面的生效标识与检索共用时间门槛，只读投影不应改动备份内标准事实。

051新增标准库文件维护批次、来源行、标准关联与请求回执四表，仅用于独立标准管理，不与维修机会导入共表。来源关联外键指向原标准/版本，原输入、逐行对照与维护事件保留；全部纳入完整备份指纹。恢复后按request_json及request_hash验证原请求并各重放两次，返回原结果（包括原部分失败/冲突），不能重新执行旧文件或覆盖恢复后的新草稿。开关MUC_STANDARDS_IMPORT_ENABLED与标准管理开关均默认关闭；关闭不删除已有批次、来源或回执。最新证据见evidence/maintenance-v101-standard-library-import-20261110，最终恢复结论以该目录摘要为准。

标准管理引用量为既有工作/来源的只读去重投影，不另建维护计数表。恢复后须保留subtask与flight/client关系、共享草稿及来源快照；相关引用未知不能当0，也不能为恢复验收删除遗留失效来源。当前135表3153行、68项接口及留痕撤回/停用证明见evidence/maintenance-v101-standard-catalog-references-20261110。


052新增三个原报工模块的定义、规则版本、机会规则快照及实例四表。仅开关开启后的原新建服务创建，关闭MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED暂停新增实例，不删除已有身份/元数据。已有实例使用原服务读取动态完成事实；旧机会查询不能自动回填。授权删除原机会后opportunity_id置空，opportunity_key及原实例/规则快照保留；原删除日志包括完整模块身份快照。迁移需先导入原maintenance_flights，再导入模块定义/规则/机会快照/实例，不能重建成另一组实例ID。当前恢复验证明确要求活动与已删除机会两类快照，旧私有夹具若无这些表/数据不能作为052完整演练证据。

052完整演练结果：139表3225行及全部目录对象恢复一致，68项接口通过；活动及源机会已删除模块快照均通过恢复校验。证据见evidence/maintenance-v101-module-instances-20261111。

2026-11-11业务补充：在途终审使用case原提报策略快照，不能以恢复时当前后台比例填历史缺口；新均分/待定来源另冻结角色配置库，JSON完整保留。通用范围逐条准入批准保存于原admissions.snapshot_json，绑定原sourceDigest及批准人/依据/时间；发布恢复必须保留该记录，不自动为旧无批准通用版本补批。精确机型旧请求摘要保持兼容。证据见evidence/maintenance-v101-approved-policies-20261111。


053独立工时更正三表及有符号净额视图属于完整备份范围。原批准/分配/策略/资格快照、账期授权及correctionOf源ID不可省略，不能在恢复时把冲销当普通负申请，也不能重开原同步通道。恢复核对仅POSTED差额进入原统计，净额等于最新批准目标，原统计月保持原作业月；原机会/单项被差额来源外键保护。当前只有底层与隔离fixtureOnly批准/冲销验证，尚无外部更正批准及账期办理接口；恢复证明不等于授权业务验收。证据见evidence/maintenance-v101-correction-foundation-20261111。

更正服务新增默认关闭MUC_NONROUTINE_CORRECTIONS_ENABLED，关闭不删除批准、账期授权、差额或原净额读链。原批准请求保存于target_json.request，规范目标在input/rows，恢复须按原请求各重放两次，并重放独立账期授权；同内容返回原事项，不重开关闭通道或重复差额。待办理批准只因关闭入口暂停，不当作已入账。原更正审计不得touch原机会时间。当前仅接口服务，办理页及批准撤销未完成。证据见evidence/maintenance-v101-correction-services-20261111。


工时更正办理页已接入原维修导航，仍由MUC_NONROUTINE_CORRECTIONS_ENABLED默认关闭；来源列表、办理月只读查询和界面本身不新增持久表。账期管理入口关闭时，更正负责人仍可按原权限核对另一办理月份，但不能改变账期。恢复须继续保留053全部批准/原请求/账期授权/差额及源ID。最新691项SQLite、70项PG接口、142表3464行完整恢复及桌面/手机合成浏览器证明见evidence/maintenance-v101-correction-workbench-20261111；待处理撤销及实际人员变化来源重关联仍未实现，不能据此执行生产切流。
评议事实版本沿用review_events保存SOURCE_FACTS_BASELINE、SOURCE_FACTS_CHANGED和FINALIZED.sourceFacts，没有新增迁移或表。备份须保留case/application/participants、原实际来源及完整事件；不能只恢复终审金额/摘要而丢失核实事件。旧无基线事项不回填历史日期/机型。新核实输入从匹配finalId的冻结事件恢复，用于认定摘要、同步版本及转标准来源校验，重试不能更新批准事实版本或重开消费通道。最新142表3470行、4份基线/1次变化/2次核实终审重放证明见evidence/maintenance-v101-source-facts-20261111。


拖机金额停写由MUC_TOW_STANDARD_ONLY_ENABLED控制，默认关闭，必须先完成真实拖机标准与旧数据迁移核对再配置；技术ready不能替代业务批准。恢复保留旧nonroutineCategoryHours拖机键、历史结果、冻结标准及手工来源，不删除或以当前默认值重算。停写后新链不可用不得自动降回旧金额写入。明确手工未收录选择的MANUAL_UNLISTED_CONFIRMED审计随原事件完整备份。最新142表3524行、旧3h/标准/未收录及恢复后停写拒绝证明见evidence/maintenance-v101-tow-transition-20261111。
054新增的工作流实例、任务及事件必须随原模块身份完整恢复，不能只备份提交结果。模板版本/JSON/摘要、责任账户与人员及资格、任务修订/状态、原请求键/摘要/回执、改派和取消前后事实均属恢复范围。取消只关闭未提交任务，不能删除已提交异常反馈。内部办理服务恢复重放沿用原请求内容，重检当前资格后返回原回执，不重写任务、事件、原机会或工时。

2026-11-12：054存储阶段PG73项、145表3554行及目录对象恢复通过，临时集群已停止。新增内部任务服务已通过729项SQLite；其独立跨数据库演练正在进行，恢复增加明确fixtureOnly的认领/失败提交完成事实与两次重放检查。它不代表公开工作流接口、真实角色授权或业务模板批准；扩展完成服务及状态门槛仍未启用。证据见evidence/maintenance-v101-workflow-actions-20261112，完整目标尚未完成，不据此切流。
内部任务服务阶段恢复演练已收齐：PG74项、145表3561行及全部目录对象一致；异常反馈保持SUBMITTED、工作流保持COMPLETED，原提交请求两次重放不写新任务/事件/工时，业务指纹不变，临时集群已停止。最新证明见evidence/maintenance-v101-workflow-actions-20261112。
流程接口阶段新增权限及角色由原RBAC初始化，不能在恢复时把模块维护角色或系统通用权限自动当成流程授权。MUC_WORKFLOW_TASKS_ENABLED和MUC_WORKFLOW_SIMULATION_ENABLED默认关闭，不随数据恢复擅自打开。模拟nonsettlement_simulation v1只绑定extension_workflow_simulation v1，不是正式业务模板或维修签署。恢复须原样保留054模板快照、人员资格、改派/取消前后事实、请求摘要与回执；真实HTTP提交和取消各两次恢复重放不得重复事件、审计或结算，也不重新开放已取消/完成流程。专用事件中的资格与正文不复制到普通审计或SSE。
模拟流程接口阶段恢复已通过：PG75项、145表3633行及目录对象一致，真实提交和取消各重放两次，业务指纹不变，临时集群停止。证据见evidence/maintenance-v101-workflow-api-20261112；这只证明明确开启的模拟任务机制，不代替正式检查业务和页面验收。
模拟办理页没有新增表，仍完整保留054的事实和回执。新模块选择及机会/责任人基础信息均为原来源只读投影，恢复不复制第二套机会记录。手机浏览器“服务端已提交但响应丢失”经原请求键重试，仅保留一次SUBMIT，原机会和工时不变；PG75项及145表3633行恢复、提交/取消各两次重放证明见evidence/maintenance-v101-workflow-workbench-20261112。功能仍默认关闭，页面不代表正式检查业务已获准，也不作为生产切流依据。
完成来源核验和固定专业分发不增加持久表：原HOUR/RELEASE_COUNT仍走原提交和账本，模拟CHECK_RESULT来源为原工作流ID及修订。恢复必须完整保留模板全文/摘要、任务结果与归属/资格、连续修订及每条事件的请求摘要/回执/前后事实；仅恢复一个COMPLETED状态不足以形成有效来源。结果被改动、历史链缺失或来源换模块时，完成引用不可用并显示待核对，不能补造零小时或当前人员资格。历史提交人之后停职/撤权不擦除原有效事实，当前读取/重试仍核对当前授权。未完成与已取消无完成结果引用，不代表零结算记录。相关证明见evidence/maintenance-v101-workflow-results-20261112。
完成来源阶段最终恢复：75项PG、145表3633行及全部目录对象一致，恢复后1份真实CHECK_RESULT完成引用/版本有效，已取消仍无结果引用；实际提交/取消各重放2次，原业务指纹不变，临时集群停止。证据见evidence/maintenance-v101-workflow-results-20261112；正式模板/其他结果语义与门槛发布尚未批准或启用，不能据此执行生产切流。
办理历史不新增表或改写旧事件；必须保留054原事件及全部资格/请求/回执/前后事实，不能仅恢复页面上的脱敏投影。管理者依据与责任人本人历史由恢复后的当前资格/范围/任务归属重新投影；旧翻页游标因修订/可见性变化失效，不作为授权凭据。损坏模板/结果/事件仍保留只读核查入口，不自动重建历史；来源核验失败则暂停后续办理。最新75项PG、145表3633行及目录对象恢复一致，2份当前权限历史核对、提交/取消各2次重放不改业务指纹，临时集群停止；证据见evidence/maintenance-v101-workflow-audit-20261112。浏览器演练中的恢复只回写合成模板的原字节，不代表生产记录修复获准。
2026-11-13 原来源删除取消：恢复须保留CANCELLED_BY_SOURCE_REMOVAL原事件、操作者资格/删除依据、取消前审核及通道状态、原终审和12人意见。不能只恢复CANCELLED状态或从当前身份补造旧资格。跨期任务保留原state和全部授权历史，由原审核/通道取消状态投影为取消，不能重新授权、重开或写账；已消费及真实0工时均阻止取消抹账。75项PG接口检查、145表3636行及全部目录对象一致，恢复后3条实际原来源取消记录、来源删除、待发提醒关闭、无入账凭据核验通过，原业务指纹不变，临时集群停止。证据见evidence/maintenance-v101-source-cancellation-20261113。独立取消负责人尚待业务答复，本阶段没有开放独立取消入口，也没有生产记录修复或切流。

2026-11-13并发补充：check-maintenance-v101-concurrency.mjs仅接受私有muc-v101-pg16临时目录、NODE_ENV=test、127.0.0.1:15432/muc_v101_qa及隔离账号。原--restore完整模式现在在全量server-tests后执行实际双进程并发；--concurrency-from-fixture PRIVATE_TEST_DUMP仅复用经私有权限/所有者/原完成summary核验的合成备份，明确fixtureOnly=true及serverTests=false，不把备份复用记为重新跑迁移/全量。该模式需选不含V101RACE夹具的原始合成备份；不自动清理/覆写已有业务来源或旧并发夹具。两个API使用18890/18891，结束后正常关闭，备份前删除仅用于原确认事实观察的临时表/函数/触发器。完整原事实观察及三项并发、7次锁等待证明见evidence/maintenance-v101-multiprocess-concurrency-20261113，146表4301行恢复一致，临时集群已停。该冷恢复不替代生产在线切流或完整并发矩阵。

2026-11-13十二人并发补充：并发检查现另含ROUND12真实轮次，临时HTTP端口扩展为18890–18901；12个Node进程/PG后端全部到达原事务锁再放行。恢复核验兼容旧三项夹具，新四项时必须再核对ROUND12原12人意见版本、单次SEALED、12份意见历史及2.6/2.5参考值。最新演练146表4475行恢复一致，四项有效8小时/4架次，12个服务正常退出、集群停止。证据见evidence/maintenance-v101-twelve-reviewers-20261113；原三项4301行证据保留其历史阶段含义，不覆盖或冒称同一备份。

2026-11-13当前受理资格补充：新currentMaintenanceReviewActor按原账户/人员绑定及当前有效状态重读原RBAC/范围；恢复不补旧角色、不重建历史权限。最新完整演练并非复用备份：旧身份拒绝/升级重放、77项PG及真实撤权竞争、12进程封轮、146表4479行恢复全部通过。三个受理拒绝保留原审核/提醒/通道事实；其合成权限变更只在测试事务中按明确步骤恢复，不能解释为产品提供历史授权修复能力。默认/开启各771项SQLite通过，服务和集群均停，证据evidence/maintenance-v101-review-current-authority-20261113。

2026-11-13权限矩阵补充：最新合成恢复146表4532行，新增未发布V101RACE-STD-AUTH独立评议夹具，须保留12个不同席位、修订3、一次SEAT_REPLACED及旧成员两条取消提醒；恢复后旧/新成员真实读取分别404/200。施工/标准accept/seats四类各三种资格变化均拒绝且原事实不变，正常标准替换不改施工账本。证据evidence/maintenance-v101-review-authority-matrix-20261113，fixtureOnly=true不混同上一完整回归。新增并发前置检查遇旧v101-race人员或机会直接拒绝，复用并发基线必须选原始不含这些夹具的私有合成备份，不能清理业务来源或静默重编号。

2026-11-13原月份保护补充：最新完整演练146表4650行、五项有效10小时/5架次。EARLY夹具在整体最终报工前先认定，普通跨月改期拒绝，后续原确认不重复；恢复核对date月=回执work_month=statistical_month，机位QA-NEW-STAND保留。新保护不回填历史月份，不提供日期身份更正能力。证据evidence/maintenance-v101-recognized-identity-20261113；服务/集群均已停止。

2026-11-14原报工生命周期补充：PG81项、146表4816行及全部目录对象恢复一致；新增单人航后纸签真实路由链确认5小时/1架次，重复确认不重记。默认/协调器开启各781项通过，12服务正常退出、临时集群停止。本轮只新增回归，未改状态链；新用例使用进程内请求适配器，不替代浏览器/真机或完整业务验收。证据evidence/maintenance-v101-original-lifecycle-20261114。

2026-11-14正式派工关联补充：原派工仅去重新增，独立删除审计保存原关联及明确原因，未删除草稿或历史报工。恢复须保留原关联ID/来源、删除事件及草稿版本，不从剩余派工推定草稿人员已改变。最终PG83项、13次实际竞争、146表4868行和全部目录对象一致；ASSOC-CAS-QA仅余原放行，一次接机删除审计、无工时。首轮旧计数失败未恢复且已停止，最终完整复跑与12服务/集群正常停止见evidence/maintenance-v101-dispatch-associations-20261114。未迁移业务库或生产切流。

2026-11-14例行草稿边界补充：草稿人员/放行选择与正式派工各自恢复，不从草稿反向补派工或赋予报工资格。当前完整演练PG84项、146表4887行及全部目录对象一致，草稿不同人员/正式两条原人员再核验通过。12服务正常退出、集群停止，证据evidence/maintenance-v101-routine-draft-dispatch-boundary-20261114。未自动修复旧派工，正式提报和非例行旧保存边界尚未完成。

2026-11-14非例行当前操作者补充：资格变更不补造旧角色或修改既有草稿。完整PG86项、146表5120行及全部目录对象恢复一致，14项原实际竞争通过，12服务/集群正常停止；当前读取/变更沿实时资格重新鉴权。证据evidence/maintenance-v101-nonroutine-current-authority-20261114，不代表整体确认/其他入口权限矩阵完备或生产切流。

2026-11-14原报工当前资格补充：恢复后例行/放行/整体确认仍依当前账户与人员资格，不从历史批次恢复旧权限。PG87项、146表5344行和全部目录对象恢复一致，14项既有实际竞争通过，12服务/集群正常停止；证据evidence/maintenance-v101-core-report-current-authority-20261114。原内部自动完成条件及历史签署来源保留，未生产切流。

2026-11-14报工撤权矩阵补充：合成账户原资格在每次真实撤权检查后按原行恢复，备份不携带临时停用或丢失角色。24次403业务/日志不变，14次既有竞争通过；本次fixtureOnly恢复146表4883行及目录对象一致，12服务和集群正常停止，证据evidence/maintenance-v101-report-authority-multiprocess-20261114。没有修改实际账户权限或生产切流。

2026-11-14例行实际来源补充：正式批次及条目版本/身份与实际结果一并恢复；无匹配原关联时结果可按报工条目身份持有，不从当前派工改写其人员。原无批次历史不补造来源。PG89项、146表5491行及全部目录对象恢复一致，14项原竞争/24项撤权通过，12服务/集群停止，证据evidence/maintenance-v101-routine-result-participant-source-20261114。旧代码不一定识别新结果身份，不能直接视为安全回退，正式切换仍需独立验收。

2026-11-14放行实际来源补充：release批次/条目、原签署账户及结果身份一并恢复，不因当前正式派工不同重记架次。PG90项、146表5509行及全部目录对象恢复一致，14项原竞争/24项撤权通过，12服务/集群停止；证据evidence/maintenance-v101-release-result-participant-source-20261114。整体确认/复核尚未全部适配独立结果身份，不能视为已可切流或直接用旧代码安全回退。

2026-11-14独立结果身份复核补充：恢复须保留结果ID、来源assignment_id及创建时间，不从当前正式派工ID强行重建；当前同人员工种唯一结果可由原复核继续确认，歧义拒绝。PG91项、146表5531行及全部目录对象恢复一致，14项原竞争/24项撤权通过，12服务/集群停止。证据evidence/maintenance-v101-review-result-source-identity-20261114。来源历史版本及实际参与人分离仍待完成，不能视为已可切流或用旧代码安全回退。

2026-11-14来源档案056基础：新表保存观察事实及摘要/资格，不随可变批次/条目级联删除；完整恢复必须保留全部原字节和观察时间，不能仅恢复当前参与人。PG92项、147表5546行及目录对象一致，恢复两份来源摘要/绑定核验、当前观察内部重放两次无新档案/业务指纹变化，12服务/集群停止，证据evidence/maintenance-v101-report-source-journal-foundation-20261114。尚未接入实际生命周期，不自动回补056之前历史或开放历史访问，生产切流未执行。

2026-11-15来源生命周期补充：原提交/修订/删除自动留存可观察正式版本，必须恢复原观察方式/时间/资格/摘要和字节，不以当前人员或派工重建。已观察档案不被同版本在途编辑覆盖；未知旧历史/版本0不补造。整体确认保留原提报放行姓名班组。完整PG95项、147表5722行及全部目录对象一致，恢复125份来源摘要/绑定，专用夹具内部重放两次无新增，12服务及临时集群正常停止，见evidence/maintenance-v101-report-source-lifecycle-20261115。无生产切流或公开档案接口，完整实际参与人分离尚未完成。

2026-11-15例行正式关联分离补充：恢复必须分别保留正式派工身份/来源、有效routine/release批次修订、原提报来源档案及实际工时/架次，不以其中一份覆盖其他事实。授权复核修订只产生报工新版本和实际结果，原派工可按原任务推进状态；无批次旧历史仍原适配，不补造版本。当前PG96项、147表5765行及全部目录对象一致，130份来源摘要/绑定与专用夹具两次重放通过，12服务和临时集群停止，见evidence/maintenance-v101-routine-dispatch-report-separation-20261115。无生产迁移/切流；非例行仍原桥接，不据此称完整分离或旧代码可安全回退。

2026-11-15非例行来源贯通补充：实际batch/entry、认定参与快照、评议原事实基线与终审角色、原结果身份/来源及正式派工分别恢复；不能把当前派工倒填为实际人。批次先落库、认定/评议后冻结，原核算最后生成；复核确认先推进批次，再推导工作状态。无批次/版本0未知历史仍旧适配，不回补。完整PG99项、147表5843行/全部目录对象一致，150份来源摘要/绑定及专用夹具两次重放通过，12服务/集群停止，见evidence/maintenance-v101-nonroutine-dispatch-report-separation-20261115。首轮旧拖机断言失败的隔离库已停止且未执行恢复；以最终完整重跑为准。无生产迁移、切流或新浏览器/设备验收。

2026-11-15放行原派工快照补充：整体确认只推进原锁定放行派工行status/modified_at，恢复后不能用当前人员目录名称/班组刷新历史派工来源。改名回归覆盖其他原字段完整保留。当前PG99项、147表5843行及全部目录对象一致，12服务/临时PG停止；原页面完整甲5h/乙2h/原人1架次及1280/390截图已核验，临时Chrome130/服务0正常清理，见evidence/maintenance-v101-dispatch-snapshot-and-actual-ui-20261115。仍无真机/PWA或生产切流，旧无批次/当前权限矩阵及其他范围未完。

2026-11-15任务树当前权限补充：恢复保留原人员不可变绑定；复核当前操作在原锁内重新核验账户/在职/明确复核及归档权限，并要求整树原关联/实际参与/有效结果均在当前范围。部分范围只读，不能用被脱敏的缺人载荷覆盖原事实。完整范围的办理默认值不替代完整规则查看授权。当前PG101项、147表6194行/全部目录对象一致，166份来源摘要/绑定及两次重放通过，12服务/集群停止；1280/390局部范围只读原页面及无完整rules请求已验证，Chrome130/服务0停止，见evidence/maintenance-v101-task-tree-current-authority-20261115。无新任务树专属真实竞争、真机/PWA或生产切流。

2026-11-15任务树实际撤权恢复补充：真实锁等待后的13次资格撤销必须保留原业务、来源观察及日志不变，临时tree review/archive测试角色退出前恢复原值，不能带入备份。最终PG101项、147表6277行及全部目录对象一致，175份来源摘要/绑定及两次重放通过，恢复3个分离实际人/派工的5h/1架次机会正常，已撤角色原账户读写各3次403，12服务/集群停止，见evidence/maintenance-v101-task-tree-authority-multiprocess-20261115。本轮只扩验证器，应用未变，无生产切流或新增设备验收。

2026-11-15 independent cancellation recovery: preserved original source and immutable review history, CANCELLED/CANCELLED_CLOSED unposted pair, no effective zero hours. PG 103 service tests; complete 147-table/6337-row and catalog restore equality; revoked owner role absent and two retries denied; personal stats readable; 177 source observations verified and two internal replays unchanged. Worker cleanup and cluster stop verified. Evidence: docs/evidence/maintenance-v101-independent-review-cancellation-20261115. No authorized cancellation replay or cancellation-versus-posting race is claimed.

2026-11-15 cancellation race recovery: final PG103,147 tables/6915 rows and all catalog objects equal; five new race cases recover as three cancelled/no effective rows and two finalized/one2h row each, source/twelve opinions retained. Six authorized exact cancellation replays after temporary synthetic recovery-only role grant reuse original event; role removed afterwards and whole business fingerprint unchanged. Source journal192 observations/two internal replays verified, twelve workers and cluster stopped. Browser synthetic service also stopped. Evidence: docs/evidence/maintenance-v101-cancellation-real-races-and-browser-20261115.

2026-11-15 mixed cancellation/recognition restore: PG104,147 tables/7286 rows and all catalog objects equal. Real restored report queries retain cancelled/in-review null hours, true zero and positive2h rows; ascending/descending sort places missing last. Restored review cancellation rule/reported hours remain null, and personal under-review list contains only the uncancelled pending item of that batch. Original business fingerprint unchanged after all recovered reads/retries. Twelve workers and cluster stopped. Evidence: docs/evidence/maintenance-v101-cancelled-mixed-projections-20261115.


## Cancelled final history — 2026-11-15

取消后保留已封存历史终审认定及原意见，只读并明确未入账；封存前私有意见不提前公开。待授权和已授权未入账的跨期任务均拒绝再授权/同步，保留原记录和原终审重放。撤销私有审议资格但仍有一般查看权限时，成功的受限响应也会清除页面旧私有意见；退出清理评议工作台。两配置各831/831；前置PG105服务测试及并发通过，最新fixture-only恢复147表7625行与目录一致并核对当前完整/受限读取，不声称最新恢复重跑105项。1280/390真实浏览器验证撤权/恢复/退出，原来源历史账本摘要不变。证据：evidence/maintenance-v101-cancelled-final-history-20261115。整体验收仍126部分/84待做/0全验收；未合并或部署。


## Locked original import history — 2026-11-15

P0-200补齐原接口证据：文字导入→正式提报→整体待复核→已确认，三阶段分别重试旧回执、同文件改名、换字节文件、伪造不同工作确认及提报前独立预览提交。既有服务端写保护有效，原来源/参与人/草稿/批次/条目/来源档案/评议/账本逐项不变；仅补齐锁定行只读说明，不声称修复重复入账。两配置各833/833，后增页面只读专项连同预览11/11；PG106/106、原并发及147表7681行/目录完整恢复通过。恢复后4只读提交批次、4阻断批次仍拒绝修改，原单项/评议各1，有效小时0。12服务及集群已停止。证据：evidence/maintenance-v101-locked-import-history-20261115。P0-200仅pending→partial；整体127 partial/83 pending/0 verified，本轮未做真实浏览器/真机/全权限组合，不据此发布。


## Imported source selects later published standard — 2026-11-15

真实原API复现：导入草稿后出现多候选，提交正确阻断，但明确选择在保存时被丢弃，原执行页也未开放导入来源选择入口。现复用原标准选择器，在原草稿/正式提报事务内保存经当前版本及机型校验的引用，保留来源fingerprint/clientId/original_json与原人员，原审计记录前后选择。CAS/失效版本/篡改标准五项/审计失败整笔回滚。保存10次不启动评议；选择后原提报采用标准1.5小时，不创建评议。返回未收录继续当前原项，标签立即随本地选择更新。两配置最新各836/836，PG107/107、原并发及147表7722行/目录恢复通过；最后标签调整为前端限定，后台未变。新合成库1280/390原页面选择/保存/重开/返回/提报完整通过，4截图已检查，原派工不变。v51；证据evidence/maintenance-v101-imported-candidate-selection-20261115。整体130 partial/80 pending/0 verified；单一精确匹配、完整权限/机型及真机仍未验收。服务、浏览器、PG集群均已停止；未合并部署。


## Later unique standard requires original reference confirmation — 2026-11-15

I-12/P0-158补充：原API复现未收录草稿在后来唯一标准且申请工时恰好相同的情况下，未确认引用也直接转标准报工。仅对IMPORT且无既存标准引用、现已MATCHED的正式提交增加409及原选择器确认提示；初始预览唯一标准自动关联、已绑定标准及手工旧行为保持。原API验证撤回、版本替代、机型变化、停用账户、草稿CAS及事务入口标准失效时，原草稿/来源/报工/人员/评议/账本/日志逐项不变；事务入口为受控注入，不冒称实际等待并发。两配置837/837，PG108/108及原真实并发通过；147表7752行与全部目录完整恢复，保留标准v1、另存v2草稿、选择审计1与评议0。原页面1280/390未确认拒绝、确认/保存/重开/提交通过，5截图检查；Chrome130/服务0，12PG服务正常退出与集群停止。证据evidence/maintenance-v101-later-unique-reference-20261115。整体131 partial/79 pending/0 verified；文字修订匹配既有标准/完整非超级角色范围和真机矩阵仍未覆盖；未合并部署。


## Current standard-choice authority — 2026-11-15

原普通worker/self范围用例复现：撤销standard.view后标准列表403，但旧页面凭ID新选标准保存200。现原草稿/正式提报事务对新增/变更标准引用验证当前catalog查看权；共享来源管线的无原引用自动命中新标准也校验，不要求已存未变引用重新获取catalog权。保留本人正式派工的协作访问例外。原API验证catalog/修改/提交三权限撤销，在请求及事务入口均拒绝、草稿/来源/业务账本/日志不变；入口为受控注入，不冒称新增实际等待并发。无关机会读取与草稿写404；文字修订匹配既有标准并确认后正常采用，提示改为当前有效标准。真实worker页面1280/390撤权拒新增引用、刷新禁用选择器，既存引用可维护并提报；原输入/派工不变、1.5标准小时、无评议。两配置839/839，PG109/109及原并发、147表7822行/目录完整恢复通过；恢复原worker读取与范围边界。v52，证据evidence/maintenance-v101-standard-choice-authority-20261115；截图2已检查，Chrome130/服务0/12PG服务/集群均清理。整体132 partial/78 pending/0 verified；全模块权限矩阵及真机未闭合，未合并部署。


## Expired import preview re-match — 2026-11-15

共享HEAD已观察为人员/UI提交4b56f43；进入本轮时上一轮维修模块摘要均未变化，保留该提交，不合并/推送/部署。原commit的当前版本/机型/候选/CAS保护有效；实际缺口是人工选定版本失效后变BLOCKED，原行决策拒绝修改导致无法恢复。现原行API新增显式resetStandardChoice，原事务内重查授权/锁定及不带过期引用的匹配，原文字/指纹不变、批次CAS递增与前后审计保留；原文件显式旧引用亦可核对后重选。已处理来源/锁定/失权仍拒绝，不通过reset创建正式工作或账本。原工作台详情新增清除失效选择并重新匹配，复用原候选及commit。v53。两配置843/843、专项22/22；PG110/110、原并发及147表7879行/目录完整恢复通过。原CSV控件1280/390失效拒绝→重匹配→选v2→一份原草稿完整核验，原派工/文字/审计保留，正式工作/评议/工时0。最终观察器继续等待同一已发出请求，不重放业务；4截图已检查，服务/浏览器/12PG服务/集群均关闭。证据evidence/maintenance-v101-import-preview-rematch-20261115；整体133 partial/77 pending/0 verified；发布重匹配真实等待并发及全机型/权限/真机矩阵仍缺，未部署。


## Archive managed-source isolation — completed2026-11-16

原API复现旧归档新增忽略已有来源clientId，另建工作并提前生成工时，而原评议仍可补记。现原复核事务在新增前拒绝已有工作/评议/来源/批次标识及显式原项字段；不凭同名推断同一工作，不关闭原通道，不另造账本。6类身份在未入账/已入账均409且原来源/人员/批次/档案/原工时架次/补记不变；独立旧归档1小时合法。两配置844/844；PG111服务与原14等待重叠通过，新增2条归档先/终审先真实等待分别409/200，唯一工作/回执/2小时且原来源不变。最新fixture-only完整恢复147表8360行及目录一致，原5取消场景与新增3归档场景分别检查、每例两次复制拒绝；复用已完成服务/并发快照，不声称最新恢复重跑111项。初次账期夹具冲突和恢复前缀计数问题单独保留，未削弱原断言。12服务和两集群已停止。证据evidence/maintenance-v101-archive-managed-source-20261115。整体135 partial/75 pending/0 verified；无稳定身份或新ID旧归档重复与完整R-06尚未闭合，本轮无原生浏览器/真机检查；未合并推送部署。


057补录来源恢复：maintenance_review_addition_sources须与原工作/批次/条目/工时/审计整体备份、恢复并显式纳入SQLite→PG复制。不得按当前名称重建旧来源，不补造历史映射、不删除原项已删除后保留的映射；同键改变事实或已删除原项必须拒绝。保存摘要核对原始字节，重试事实比较兼容参与人排列但不改写原快照。2026-11-16完整PG112服务/新增真实等待并发及148表8425行恢复通过；最终序列化兼容修正后的fixture-only当前读取恢复148表8431行、全目录及业务指纹不变，不声称该恢复重跑112项。来源证据见evidence/maintenance-v101-archive-addition-identities-20261116，所有隔离服务及集群已停止；未执行业务库迁移或发布。


原补录删除审计恢复：保留maintenance_review_addition_sources与原maintenance_logs删除事件；审计before.reviewAdditionSources是当时完整映射，原单项/机会已删除也不可依旧补录请求重建。2026-11-16最新完整服务114测试、实际并发及148表8498行/全目录恢复通过；恢复后的两份已删除来源与两份删除审计保持、旧PUT两次404；两个self范围账号的范围外新增各两次拒绝、原各1小时保持，业务指纹不变。证据evidence/maintenance-v101-review-addition-transitions-20261116，12服务及隔离集群均停止；未对业务库执行恢复或迁移。


原删除实时资格恢复：原机会/单项删除在共享锁后重读当前有效账户/人员、具体主权限、阶段权限与受影响人员范围；不可因恢复出旧会话、旧报工来源档案或仍有其他权限而跳过。独立评议取消与已入账更正保护不被旧删除路径替代。2026-11-16完整PG116服务测试、20实际锁等待撤权全403、148表8753行及目录恢复通过，四个恢复后的删除权限案例各拒绝两次旧请求，原来源/2小时/档案不变、临时删除角色未恢复；全部服务和集群停止。证据evidence/maintenance-v101-original-deletion-authority-20261116。未执行业务库迁移、停写或恢复。


归档与独立评议角色恢复边界：不能因为恢复了addon_archive_modify便赋予独立评议或私密意见权限。2026-11-16专用worker+归档角色的完整PG117服务/148表8764行及目录恢复通过；恢复后两案例32次独立动作及两次原来源修改被拒绝、私密字段仍脱敏、合法授权更正来源仍可读取，原业务指纹不变。证据evidence/maintenance-v101-archive-independent-authority-20261116；业务实现本轮未变、12隔离服务及集群已停止，不代表真实账户已赋权或业务库恢复已执行。


前端恢复须携带shellv54及20261116-review-dirty-access的app入口、20261116-dirty-access工作台。脏草稿不能阻止当前事项查看资格核对；仅GET且不替换原输入或版本，已失私密查看权或明确失权响应须清除旧私密与输入，暂时读取失败保留草稿。原标准终审未知结果重试仍用原相同请求。2026-11-16原页面1280/390真实SSE撤权检查、856两配置/18专项通过；后台摘要未变，引用前轮PG117/完整148表8764行恢复，不声称本轮重跑。浏览器及合成服务均停止，4截图已查看；已安装PWA热升级/真机未验收。证据evidence/maintenance-v101-dirty-review-access-20261116。
