-- B7-4 历史组织快照（V1.1 §5.4/D04）：组织历史行补充变更原因与操作者，
-- 便于调组追溯。现有表已有 id/person_id/三列组织 id/changed_at。
alter table personnel_organization_history add column if not exists changed_by text not null default '';
alter table personnel_organization_history add column if not exists change_reason text not null default '';
