import crypto from 'node:crypto';
export async function postgresFingerprint(client,{businessOnly=false}={}){
  const names=(await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(row=>row.tablename)
    .filter(name=>!businessOnly||name.startsWith('maintenance_')&&name!=='maintenance_sync_state');
  const tables={};
  for(const name of names){const quoted='"'+name.replaceAll('"','""')+'"';const rows=(await client.query(`select to_jsonb(t)::text as value from public.${quoted} t order by to_jsonb(t)::text`)).rows;tables[name]={rows:rows.length,sha256:crypto.createHash('sha256').update(rows.map(row=>row.value).join('\n')).digest('hex')};}
  if(businessOnly)return {tables};
  const indexes=(await client.query("select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname")).rows;
  const constraints=(await client.query("select cl.relname as table_name,c.conname,pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_namespace n on c.connamespace=n.oid join pg_class cl on cl.oid=c.conrelid where n.nspname='public' order by cl.relname,c.conname,definition")).rows;
  const views=(await client.query("select viewname,definition from pg_views where schemaname='public' order by viewname")).rows;
  const functions=(await client.query("select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p') order by p.proname,arguments")).rows;
  const triggers=(await client.query("select c.relname as table_name,t.tgname,pg_get_triggerdef(t.oid,true) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname")).rows;
  const sequences=(await client.query("select sequencename,data_type,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value from pg_sequences where schemaname='public' order by sequencename")).rows;
  return {tables,indexes,constraints,views,functions,triggers,sequences};
}
