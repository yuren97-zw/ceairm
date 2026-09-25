-- Unified personnel organization and RBAC scope model.
-- PostgreSQL schema parity only; an actual PostgreSQL database still requires QA.
alter table organization_units add column if not exists maintenance_eligible integer not null default 0;

do $$
begin
  if exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name='personnel' and column_name='organization_branch_id')
     and not exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name='personnel' and column_name='personnel_group_id') then
    alter table personnel rename column organization_branch_id to personnel_group_id;
  elsif not exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name='personnel' and column_name='personnel_group_id') then
    alter table personnel add column personnel_group_id text;
  end if;
  if exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name='personnel_organization_history' and column_name='organization_branch_id')
     and not exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name='personnel_organization_history' and column_name='personnel_group_id') then
    alter table personnel_organization_history rename column organization_branch_id to personnel_group_id;
  elsif not exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name='personnel_organization_history' and column_name='personnel_group_id') then
    alter table personnel_organization_history add column personnel_group_id text;
  end if;
end $$;

drop index if exists personnel_branch_idx;
create index if not exists personnel_group_idx on personnel(personnel_group_id);

update organization_units set code='GROUP-LINE-CADRE',unit_type='personnel_group',maintenance_eligible=0,updated_at=current_timestamp where code='CAT-LINE-CADRE';
update organization_units set code='GROUP-LINE-1',unit_type='personnel_group',maintenance_eligible=1,updated_at=current_timestamp where code='WS-LINE-1';
update organization_units set code='GROUP-LINE-2',unit_type='personnel_group',maintenance_eligible=1,updated_at=current_timestamp where code='WS-LINE-2';
update organization_units set unit_type='personnel_group' where unit_type in ('workshop','personnel_category');

update personnel set
  department_id=(select id from organization_units where code='DEPT-LINE'),
  personnel_group_id=(select id from organization_units where code='GROUP-LINE-CADRE'),
  administrative_team_id=null,department='航线维修车间',home_team=''
where employee_no='54002010';

update rbac_user_scopes set scope_type=case scope_type
  when 'home_team' then 'administrative_team'
  when 'managed_teams' then 'specified_teams'
  when 'workshop' then 'personnel_group'
  when 'personnel_category' then 'personnel_group'
  when 'specified_workshops' then 'specified_groups'
  when 'specified_categories' then 'specified_groups'
  else scope_type end;
delete from rbac_user_scopes a using rbac_user_scopes b
where a.ctid>b.ctid and a.user_id=b.user_id and a.module=b.module and a.scope_type=b.scope_type and a.scope_id=b.scope_id;

alter table personnel drop column if exists gender;
alter table personnel drop column if exists age;
alter table personnel drop column if exists demand_unit;
alter table personnel drop column if exists highest_education;
alter table personnel drop column if exists english_level;
alter table personnel drop column if exists entry_channel;
alter table personnel drop column if exists dispatch_flag;
alter table personnel drop column if exists workshop_id;
alter table personnel drop column if exists home_team_id;
alter table personnel drop column if exists work_category;
drop table if exists people;
