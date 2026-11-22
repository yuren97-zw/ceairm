-- B7 临时授权治理（V1.1 §5.5）：数据范围条目增加原因与授权人字段，
-- 用于变更溯源和高风险授权审计。非必填（存量行为不受影响）。
alter table rbac_user_scopes add column if not exists grant_reason text not null default '';
alter table rbac_user_scopes add column if not exists granted_by text not null default '';
