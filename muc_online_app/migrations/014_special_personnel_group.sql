-- Preset special personnel group. It is a dispatch source pool, not a fifth
-- administrative team or capability lane. Existing rows are left untouched
-- so an administrator rename is preserved.
insert into organization_units(
  id,code,name,unit_type,parent_id,status,maintenance_eligible,created_at,updated_at
)
select
  'org-fixed-group-line-special','GROUP-LINE-SPECIAL','特殊班组','personnel_group',
  department.id,'active',1,current_timestamp,current_timestamp
from organization_units department
where department.code='DEPT-LINE'
on conflict(code) do nothing;
