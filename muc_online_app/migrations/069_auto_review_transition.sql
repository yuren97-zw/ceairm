-- 非例行评议自动化改造（用户 2026-11-22 定稿）：
-- 存量 PENDING_ACCEPTANCE 案子一次性过渡为 IN_REVIEW。
-- 已有席位/终审人字段的案子保持原值（终审人字段已不参与判定，仅留审计痕迹）。
update maintenance_nonroutine_review_cases set state='IN_REVIEW', updated_at=now() where state='PENDING_ACCEPTANCE';
