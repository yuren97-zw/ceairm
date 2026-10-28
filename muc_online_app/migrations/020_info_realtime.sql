create table if not exists info_sync_meta(id integer primary key,version bigint not null,cursor_key text);
insert into info_sync_meta(id,version) values(1,0) on conflict do nothing;
create table if not exists info_sync_changes(version bigint primary key,record_id text not null,actor_id text not null,kind text not null);
create index if not exists info_sync_record_idx on info_sync_changes(record_id,version);
create or replace function log_info_sync_change() returns trigger language plpgsql as $$
declare r jsonb; v bigint; rid text; actor text;
begin
  if TG_OP='DELETE' then r=to_jsonb(OLD); else r=to_jsonb(NEW); end if;
  if TG_TABLE_NAME='attachments' and r->>'owner_type'<>'record' then return null; end if;
  rid=r->>TG_ARGV[0]; actor=coalesce(r->>TG_ARGV[1],'');
  update info_sync_meta set version=version+1 where id=1 returning version into v;
  insert into info_sync_changes values(v,rid,actor,TG_ARGV[2]);
  delete from info_sync_changes where version<v-10000;
  return null;
end $$;
drop trigger if exists info_sync_records on records;
create trigger info_sync_records after insert or update or delete on records for each row execute function log_info_sync_change('id','','content');
drop trigger if exists info_sync_recipients on record_recipients;
create trigger info_sync_recipients after insert or update or delete on record_recipients for each row execute function log_info_sync_change('record_id','user_id','content');
drop trigger if exists info_sync_receipts on read_receipts;
create trigger info_sync_receipts after insert or update or delete on read_receipts for each row execute function log_info_sync_change('record_id','user_id','receipt');
drop trigger if exists info_sync_favorites on favorites;
create trigger info_sync_favorites after insert or update or delete on favorites for each row execute function log_info_sync_change('record_id','user_id','favorite');
drop trigger if exists info_sync_attachments on attachments;
create trigger info_sync_attachments after insert or update or delete on attachments for each row execute function log_info_sync_change('owner_id','','content');
