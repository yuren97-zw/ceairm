# 导入→评议→终审→入账 全链贯通用例（2026-11-18）——I簇「正式评议闭环」要素

用例 `imported draft completes and closes the full review loop to posted hours`
（tests/server.test.mjs，2027-09 月专用账期）：

CSV 导入（files/preview→commit，created=1）→ 派工 → 草稿补全（类别/ATA/工时/参与人）→
正式提交 → 放行 → 报工确认 → 受理（12评议人+终审负责人）→ 12份意见 → SEALED → 终审预览
（policyToken）→ finalize **MERGED_CLOSED** → 复核树确认 → 机会已确认 → 工时行
主做 2h **已确认**（冻结比例 主做::主做=1）→ 导入来源 state=**SUBMITTED**。

验证：targeted.log + sqlite 双配置 **875/875**（npm exit=0）。此前各段分件覆盖，本用例把
「导入的草稿」到「正式入账」的接缝一次走通——I 簇样板残留中的"正式评议闭环"由此闭合。
