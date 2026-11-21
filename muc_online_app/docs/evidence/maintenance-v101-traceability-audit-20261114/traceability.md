# V10.1 全方案证据挂接核对

本报告只核对原方案摘要、210个唯一编号、来源行及已挂接文件/测试名称；不运行测试，不把文件存在当成需求通过，也不修改验收状态。

方案来源：a1e7f567474b456ac4a33f7a2827a272eccf734b04e9cb154ad0f4d40ab4c57c
台账状态：{"pending":95,"partial":115}
证据挂接分类：{"NO_LINKED_EVIDENCE":95,"LINKS_READABLE_SCOPE_UNPROVEN":100,"TEST_LABEL_REQUIRES_REVIEW":15}

| 编号 | 场景 | 原状态 | 挂接核对 | 来源行匹配 |
|---|---|---|---|---|
| P0-01 | 同一机会多个分项，仅一个提报 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-02 | 例行保存草稿 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-03 | 例行正式提报 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-04 | 维修机会整体已确认 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-05 | 维修机会确认接口重复点击/网络重试 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-06 | 普通入口修改已确认报工 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-07 | 人员 A 多工种、多个人员同工种 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-08 | 取消勾选既有派工关联 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-09 | 草稿共享编辑并发 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-10 | 已锁定例行批次后变更派工 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-11 | 非例行审核未完成但普通报工齐备 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-12 | 审核在机会未确认前完成 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-13 | 审核在机会已确认后完成 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-14 | 同一审核单双击补记或并发请求 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-15 | 通道取消/已消费后重试 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-16 | 首页点击同机号不同机会 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-17 | 首页本人机会统计 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-18 | 无派工/无授权/超范围访问 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-19 | 放行权限不足者提交/核对 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-20 | 旧数据/旧客户端回归 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-21 | 8类别兼容旧数据 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-22 | 标准来源/五项锁定 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-23 | 人工指定12名资格人员 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-24 | 11人已提交时发起终审 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-25 | 12名不同评议人全部提交 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-26 | 评议成员读取他人的工时及依据 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-27 | 非工时字段修改建议 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-28 | 终审参考值 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-29 | 终审变更类别影响分配 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-30 | 未收录工作提报且工时未认定 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-31 | 维修机会待复核/已确认且工时仍在评议 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-32 | 审核早于机会确认 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-33 | 审核晚于机会确认 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-34 | 最终审核与维修机会确认并发 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-35 | 同一通道成功后重复请求、断网重试 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-36 | 审核取消/补记后正式更正 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-37 | V1→V2相同工作仅工时变化，未确认 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-38 | V1→V2定义/适用范围改变或原工作已确认 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-39 | 三方附加/试车/两种除冰核算 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-40 | 24h/36h/48h提醒 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-41 | 审核期间维修机会复核改变工作事实 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-42 | 未审/零工时/空值 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-43 | 账期已关闭 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-44 | 12人并发提交同一评议轮 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-45 | 放行报工已提交 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-46 | 放行架次统计与工时账本同时查询 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-47 | 非例行普通工时 + 评审补记工时 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-48 | 审核补记重复提交、重试及并发 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-49 | 新模块注册/禁用/版本升级 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-50 | 新模块向整体状态服务发请求 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-51 | 非报工检查反馈模块提交 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-52 | 新模块阻断门槛作用于特定适用机会 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-53 | 原三报工完整性及放行核对 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-54 | 已确认机会后补录非阻断流程结果 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-55 | 通用工作流任务跨角色/数据范围访问 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-56 | 模块事件重放/乱序/断网同步 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-57 | 一次外站过夜检查关联多机会 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-58 | 模块输出无工时/架次的检查与审批结果 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-59 | 旧 V1.0/已发布报工与老客户端 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-60 | 新模块规则更改在进行中机会 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-61 | 同一非例行类别配置比例 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-62 | 单项工作多人同角色/空角色 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-63 | 拖机选择有效标准库工作 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-64 | 拖机未收录新项目 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-65 | 拖机→单项工作，原/终审策略差异 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-66 | 已确认机会终审类别/策略变化 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-67 | 仅ATA/名称/范围变化 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-68 | 最终审批人调整五项正式字段 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-69 | 原分配器输入不合法或规则版本缺失 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-70 | 标准库已认定工时由普通管理员请求直接编辑 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-71 | 终审权限发起标准库已认定工时变更 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-72 | 维修机会机型为A320 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-73 | 机型缺失/解析失败/结果为空 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-74 | 标准条目适用多机型与通用条目 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-75 | iOS搜索框获取焦点 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-76 | 非例行标准条目底部抽屉 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-77 | 弹层内新增未收录工作 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-78 | 角色/策略确认与机会确认并发 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-79 | 后端工时分类汇总 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-80 | 可扩展模块与原系统回归 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-81 | 目标8类别策略映射 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-82 | 工卡指令与单项工作均为5:3:2 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-83 | 单项工作同类别由5:3:2改4:3:3 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-84 | 原/最终类别不同但模式、角色、比例相同 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-85 | 多人同角色（主做×3检验×1） | pending | NO_LINKED_EVIDENCE | 是 |
| P0-86 | 某角色无人（辅助×0） | pending | NO_LINKED_EVIDENCE | 是 |
| P0-87 | 空角色配置接口未实现/无适用策略 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-88 | 终审页面比例展示 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-89 | 终审人线下确认必要人员角色 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-90 | 非类别字段修改但适用策略版本变化 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-91 | 已确认机会类别/策略变更，首次待审核未入账 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-92 | 已确认机会正式工时已经入账后更正 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-93 | 终审与后台策略发布并发 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-94 | 已提报、待复核、已确认三时点 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-95 | 工时单位/重复/尾差与原服务 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-96 | 审核补记工时与正常非例行合并 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-97 | 非例行策略入口 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-98 | 回归维修机会容器与放行架次 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-99 | 真实规则四种`rule_type`映射 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-100 | 原4类别与新增4类别共存 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-101 | 拖机旧金额与均分回归 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-102 | 按实际角色集合匹配七组合 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-103 | 重复角色均分 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-104 | 舍入与精度 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-105 | 非例行规则历史快照缺口 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-106 | 同类别新版比例差异 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-107 | 跨类别相同策略 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-108 | 工时金额与分配比例分离 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-109 | 新标准库初次部署 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-110 | 机型匹配精确 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-111 | 12人评议与任务树复核隔离 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-112 | `已提报`工时状态 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-113 | 非航后自动确认 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-114 | 已确认不降级 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-115 | 审核中暂估与正常结果隔离 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-116 | 原归档补录与新评议补记隔离 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-117 | 已确认后首次审定 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-118 | 已入账后更正 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-119 | 唯一审核通道并发 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-120 | 账期关闭 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-121 | 任务树复核授权 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-122 | 放行架次独立 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-123 | 首页进入执行定位 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-124 | 底部抽屉iOS放大/SSE | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-125 | SQLite+PG迁移 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-126 | 模块状态门槛对比 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-127 | 八类按5已定3待定展示 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-128 | 工卡指令、单项工作共用7组 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-129 | 七组角色集合完整映射 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-130 | 主做3人、检验1人、辅助0人 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-131 | 仅主做/仅检验/仅辅助 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-132 | 截图中的三角色组 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-133 | 角色组合配置被后台修改 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-134 | 拖机旧报工 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-135 | 拖机新标准工时 | partial | TEST_LABEL_REQUIRES_REVIEW | 是 |
| P0-136 | 三方附加/试车均分 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-137 | 其他旧数据保护 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-138 | 两种除冰待定 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-139 | 角色组合→均分终审类别变化 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-140 | 工卡指令↔单项工作终审类别变化 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-141 | 终审修改ATA/名称/范围 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-142 | 已确认机会评议结果追加 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-143 | 已确认后再更正 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-144 | 权限与隐私 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-145 | 旧三报工及放行架次 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-146 | 三类策略仅留扩展口、不阻塞其他范围 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-147 | I-01 原Excel入口 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-148 | I-02 批量唯一匹配 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-149 | I-03 多候选 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-150 | I-04 模糊名称 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-151 | I-05 机型校验 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-152 | I-06 未收录草稿 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-153 | I-07 不完整导入 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-154 | I-08 派工前后可见性 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-155 | I-09 原编辑组件 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-156 | I-10 草稿多人编辑 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-157 | I-11 草稿无评议 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-158 | I-12 报工前重匹配 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-159 | I-13 报工前多候选 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-160 | I-14 未收录提交 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-161 | I-15 防重复提报 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-162 | I-16 暂估隔离 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-163 | I-17 机会不阻塞 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-164 | I-18 审核终审 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-165 | I-19 原锁定保护 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-166 | I-20 审核后补记 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-167 | I-21 已入账更正 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-168 | I-22 部分成功 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-169 | I-23 提交中断重试 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-170 | I-24 二次导入相似 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-171 | I-25 权限 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-172 | I-26 日常管理CRUD | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-173 | I-27 策略分类 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-174 | I-28 跨端/数据库 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-175 | 同机会三行+既存人工草稿 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-176 | 未派工到已派工原执行可见 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-177 | 同一非例行批次多未收录项 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-178 | 已发布+未收录混合批次 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-179 | 未收录+机会已确认 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-180 | 标准库准入未批准 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-181 | 申请字段部分缺失草稿落库 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-182 | 标准版本在预览后变化 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-183 | 已提报批次遭Excel二次导入 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-184 | 旧归档补录与新一次通道竞争 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-185 | 多端多用户并发导入 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-186 | 三未决工时策略与旧其他共存 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-187 | 仅文字预录入 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-188 | 未收录Excel有工时/人员列 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-189 | 不完整文字草稿 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-190 | 多次保存无评议 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-191 | 草稿正式提交后才评议 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-192 | 草稿主动删除 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-193 | 删除后同请求重试 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-194 | 删除后同文件重新导入 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-195 | 同文件名不同文件内容 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-196 | 同文件内容不同文件名 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-197 | 同Excel同机会重复行 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-198 | 不同Excel相同工作范围 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-199 | 相同名称但不同范围 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-200 | 已提报项目再次出现 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-201 | 同机会两个上传者并发 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-202 | 同机会已有人工草稿 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-203 | 100行部分成功 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-204 | 预览后原草稿变动 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-205 | 未派工与已派工可见性 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-206 | 原草稿删除边界 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-207 | 候选变化与提交重匹配 | pending | NO_LINKED_EVIDENCE | 是 |
| P0-208 | 终审和正式工时隔离 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-209 | 三类留口不阻塞其它业务 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |
| P0-210 | SQLite/PG、SSE、RBAC与审计 | partial | LINKS_READABLE_SCOPE_UNPROVEN | 是 |

NO_LINKED_EVIDENCE表示台账未挂接，不能推定功能不存在。MISSING_LINKED_FILE须先恢复或追溯证据。TEST_LABEL_REQUIRES_REVIEW可能是名称变动、参数化测试或原引用失配，不能仅据字面搜索否定实现。LINKS_READABLE_SCOPE_UNPROVEN仍必须人工核对实际断言、运行版本、数据库/权限/UI范围。
