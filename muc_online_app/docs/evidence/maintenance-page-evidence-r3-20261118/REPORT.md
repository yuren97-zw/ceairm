# page-evidence-r3 报告（2026-11-18）——导入批次工作台界面取证（I簇）

驱动 `page-evidence-r3.mjs`（r1/r2 配方+CDP DOM.setFileInputFiles 文件注入）；通过轮 `run1/`
（SHA256SUMS）。合成环境；真实统一导入对话框（[data-maint-import] 开启→类型=附加工作）+
真实 root 导入权限 + 真实提交路径。

## 断言（全部 ok）

**预览段**：CSV 注入 → 检查预览 → 工作台渲染 2 行"作为草稿导入"（第2/3行，类别/ATA 待填
如实显示）、确认按钮"导入所选 2 行草稿"、READY 行预选（disabled=false）、**预览零写入**
（import_sources 计数不变）。

**提交段**：确认导入 → 进度"草稿处理结果已保存，可继续处理异常行或到原执行页查看"，
工作台行变"已导入"，DB 恰好 2 条 ACTIVE 导入草稿（original_json 命中）。

截图：r3-import-workbench-preview.png / r3-import-workbench-committed.png。

## 附注

- 同文件两行同标题 → 双双"重复项待核对"（I-24 行内判重语义，首轮现场保留于临时目录）
- 提交后文案为"草稿处理结果已保存…"（非"成功"），失败采集默认抓 #maintenancePage 需注意
- 21 项 I 簇"批次工作台"界面要素由此轮闭合（正式评议闭环由 import-loop 专项用例闭合，
  见 evidence/maintenance-import-loop-20261118；PG 由 PG16 演练闭合）
