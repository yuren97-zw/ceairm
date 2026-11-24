-- S4（V1.1 §4.3 资源级数据范围，2026-11-25）：
-- rbac_user_scopes 增加 resource 列；resource='' 表示模块级范围（兼容存量），
-- 非空表示该范围仅对绑定表声明的该资源类别生效。
alter table rbac_user_scopes add column if not exists resource text not null default '';

-- 唯一键改为包含 resource（旧唯一键会阻止同模块同类型范围按资源拆分）。
do $$
declare
  rec record;
begin
  for rec in
    select conname from pg_constraint
    where conrelid = 'rbac_user_scopes'::regclass and contype = 'u'
  loop
    execute format('alter table rbac_user_scopes drop constraint %I', rec.conname);
  end loop;
end $$;

create unique index if not exists rbac_user_scopes_scope_resource_uidx
  on rbac_user_scopes(user_id, module, resource, scope_type, scope_id);
