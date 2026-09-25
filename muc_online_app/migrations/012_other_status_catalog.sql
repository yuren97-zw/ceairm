-- Other-status names are maintained independently of deployment locations.
create table if not exists capability_other_status_options(
  id text primary key,
  workspace text not null,
  name text not null,
  status text not null default 'active' check(status in ('active','inactive')),
  created_by text,
  created_at text not null,
  updated_by text,
  updated_at text not null,
  unique(workspace,name)
);
create index if not exists capability_other_status_options_workspace_idx on capability_other_status_options(workspace,status,name);
alter table capability_status_records add column if not exists other_status_option_id text references capability_other_status_options(id) on delete restrict;

do $$ begin
  if exists(select 1 from capability_status_records where kind='OTHER' and trim(coalesce(label,''))='') then
    raise exception '存在空其他状态记录，无法建立标准状态目录';
  end if;
end $$;

insert into capability_other_status_options(id,workspace,name,status,created_by,created_at,updated_by,updated_at)
select 'other-status-'||md5(workspace||':'||trim(label)),workspace,trim(label),'active','migration',min(created_at),'migration',min(created_at)
from capability_status_records where kind='OTHER' and other_status_option_id is null
group by workspace,trim(label)
on conflict(workspace,name) do nothing;
update capability_status_records r set other_status_option_id=o.id
from capability_other_status_options o
where r.kind='OTHER' and r.other_status_option_id is null and r.workspace=o.workspace and trim(r.label)=o.name;
