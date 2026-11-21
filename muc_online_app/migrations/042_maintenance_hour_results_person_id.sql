-- B5-4 混合区统一：迁移 001 以 user_id 建表，而身份重构后（服务级 rename 已在存量库执行，如生产）
-- 与维修 V10.1 迁移（047+）都使用 person_id。全新库在迁移阶段完成改名；已有 person_id 的库幂等跳过。
do $$
begin
  if exists (select 1 from information_schema.columns where table_name='maintenance_hour_results' and column_name='user_id')
     and not exists (select 1 from information_schema.columns where table_name='maintenance_hour_results' and column_name='person_id') then
    alter table maintenance_hour_results rename column user_id to person_id;
  end if;
end $$;
alter table maintenance_hour_results add column if not exists person_id text;
