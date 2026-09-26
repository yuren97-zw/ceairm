-- Four-level formal organization and cadre branch.
-- PostgreSQL structure is maintained here; this repository has not connected to
-- a production PostgreSQL instance, so execution still requires environment QA.
alter table personnel add column if not exists organization_branch_id text;
alter table personnel add column if not exists administrative_team_id text;
alter table personnel_organization_history add column if not exists organization_branch_id text;
alter table personnel_organization_history add column if not exists administrative_team_id text;
alter table capability_current_states add column if not exists working_team_id text;
alter table capability_current_states add column if not exists administrative_team_id text;

create index if not exists personnel_branch_idx on personnel(organization_branch_id);
create index if not exists personnel_administrative_team_idx on personnel(administrative_team_id);
create index if not exists capability_current_working_team_idx on capability_current_states(working_team_id);

-- Fixed nodes use deterministic IDs so the SQL migration is idempotent.
insert into organization_units(id,code,name,unit_type,parent_id,status,created_at,updated_at) values
  ('org-fixed-dept-line','DEPT-LINE','航线维修车间','department',null,'active',current_timestamp,current_timestamp),
  ('org-fixed-cat-line-cadre','CAT-LINE-CADRE','干部','personnel_category','org-fixed-dept-line','active',current_timestamp,current_timestamp),
  ('org-fixed-ws-line-1','WS-LINE-1','一车间','workshop','org-fixed-dept-line','active',current_timestamp,current_timestamp),
  ('org-fixed-ws-line-2','WS-LINE-2','二车间','workshop','org-fixed-dept-line','active',current_timestamp,current_timestamp),
  ('org-fixed-team-line-3','TEAM-LINE-3','三组','administrative_team','org-fixed-ws-line-1','active',current_timestamp,current_timestamp),
  ('org-fixed-team-line-4','TEAM-LINE-4','四组','administrative_team','org-fixed-ws-line-1','active',current_timestamp,current_timestamp),
  ('org-fixed-team-line-1','TEAM-LINE-1','一组','administrative_team','org-fixed-ws-line-2','active',current_timestamp,current_timestamp),
  ('org-fixed-team-line-2','TEAM-LINE-2','二组','administrative_team','org-fixed-ws-line-2','active',current_timestamp,current_timestamp)
on conflict(code) do nothing;

update personnel set
  department_id=(select id from organization_units where code='DEPT-LINE'),
  organization_branch_id=(select id from organization_units where code='CAT-LINE-CADRE'),
  administrative_team_id=null,workshop_id=null,home_team_id=null,
  department='航线维修车间',home_team=''
where employee_no='54002010';

update personnel set department_id=null,organization_branch_id=null,
  administrative_team_id=null,workshop_id=null,home_team_id=null,
  department='',home_team=''
where employee_no in ('54005955','34020592');

update rbac_user_scopes set scope_type=case scope_type
  when 'home_team' then 'administrative_team'
  when 'managed_teams' then 'specified_teams'
  when 'workshop' then 'specified_workshops'
  else scope_type end;
