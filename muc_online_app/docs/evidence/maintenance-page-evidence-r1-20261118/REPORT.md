# page-evidence-r1 页面取证报告（2026-11-18）——P0-84/132/139 → verified

驱动：`page-evidence-r1.mjs`（本目录，r2 配方改编）；通过轮：`run1/`（SHA256SUMS 校验）。
合成环境专用（base-r2 快照→临时 qa.sqlite），真实应用 server.mjs + 真实 Chrome headless
（CDP 驱动）；物理设备未验（physicalDeviceVerified:false，属全局交付外部项）。

## 场景（真实业务流 API 建案）

建航班(停场)→派工(放行)→非例行草稿+提交(单项工作/ATA968/1人主做/2h)→报工放行+确认→
评议树确认→受理(12评议人+终审负责人)→12份意见→**SEALED**；随后浏览器会话1=终审负责人
（真实 addon_nonroutine_review_finalizer 权限）打开评议工作台，会话2=root 打开工时页。
导航前显式 stopMaintenanceSync/stopInfoSync + 注销 ServiceWorker + CDP 自动接受
javascript 对话框（dirty 表单 beforeunload 守卫不阻塞取证）+ 25s CDP 看门狗。

## P0-139 终审表单无比例输入（ok）

终审表单共 12 个字段：final_category/final_chapter/final_title/final_workScope/
final_recognizedHours/final_reason/final_roleVerificationReason/final_admissionDecision/
final_participantsVerified + finalRoleSet_0_0..2（角色勾选，主做预选）。
**比例字段匹配 0、比例标签匹配 0**；唯一数字输入=final_recognizedHours（占位"负责人明确
认定，不自动套用参考值"）；表单明示"不能增加或删除人员，不编辑后台比例"。截图
p139-final-form-no-ratio.png。

## P0-84 类别切换不强制重选（ok）

终审类别 单项工作→工卡指令（change+input 事件）：
- 参与人勾选 before/after 逐项相等（主做=true 检验/辅助=false），无"重新选择/重新勾选/
  请重选"任何提示；
- 预览节点即时提示"终审输入已变化，请重新预览"，hasUnsaved()=true；
- 按真实交互补齐三项预览必填（认定工时2.5、参与核实、准入意向PENDING）后预览：
  **"策略 ROLE_COMBINATION · 版本 4af70e80… 完整策略有变化；参与角色无变化；
  类别：单项工作 → 工卡指令；认定工时：2 → 2.5；赵威 · 核算角色 主做 · 2.5 小时；
  原账期 2023-06 · 未确认；预览不是入账凭据"**——类别差异如实呈现、参与角色不变、
  分配版本沿用提报快照（后台新比例仅用于新提报）。截图 p84-category-switch-preview.png。

## P0-132 工时页七组展示与后台一致（ok）

root 工时页渲染 **恰好 7 个非例行组合组**（主做+检验+辅助 / 主做+检验 / 主做+辅助 /
检验+辅助 / 主做 / 检验 / 辅助），75 个规则输入**逐项与 maintenance_hour_rules 当前值
对账 0 不一致**（mismatches=[]），七组各自比例和均为 1。页面按业务分组有意渲染精选集，
不等于全表 99 行——以逐输入值对账为准。截图 p132-hours-seven-groups.png。

## 不变性

- 页面操作全程（含预览 POST）后：maintenance_flights/hour_results/sortie_results/
  effective_hour_results/report_batches/report_entries **字节不变**（settlementUnchanged）
- 案件保持 SEALED；浏览器 API 写操作 7 次均为登录/预览类，无结算写入
- 全部服务进程正常停止（servicesStopped:true）

## 过程修正（保留在驱动内，失败轮现场在 /private/tmp 各 run 目录）

1. 首导航等待条件误含"loginPage hidden"（未登录必然可见）→ 改两段式（壳页→登录→再导航）
2. 断言正则优先级 bug（test()+(label) 拼接恒真）与夹具文案"无比例输入"自污染 → 修正
3. 字段实名 final_recognizedHours（早前笔记误记 recogned）
4. dirty 表单 beforeunload 守卫阻塞二次导航（netlog 停在 sw.js）→ SW 注销+对话框自动接受
5. 看门狗败者 timer 未清导致进程崩溃 → 结算即清 timer
