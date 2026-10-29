import crypto from 'node:crypto';
const quote=name=>{if(!/^[a-z_][a-z0-9_]*$/.test(name))throw Error('Unsupported table identifier');return '"'+name+'"';};
const excluded=new Set(['schema_migrations','data_import_checkpoints','sqlite_sequence','sessions']);
const excludedTarget=new Set([...excluded].filter(name=>name!=='sessions'));
const canonical=rows=>rows.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))))).sort();
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function sourceImportFingerprint(db){const names=db.prepare("select name from sqlite_master where type='table' order by name").all().map(r=>r.name).filter(n=>!excluded.has(n));return digest(names.map(n=>[n,canonical(db.prepare('select * from '+quote(n)).all())]));}
async function tableNames(client){return (await client.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name")).rows.map(r=>r.table_name);}
export async function targetImportFingerprint(client){const names=(await tableNames(client)).filter(n=>!excludedTarget.has(n));const rows=[];for(const n of names)rows.push([n,canonical((await client.query('select * from '+quote(n))).rows)]);return digest(rows);}
export function validateImportDecision({checkpoint,sourceHash,targetHash,nonempty=[]}){
 if(checkpoint){if(checkpoint.source_sha!==sourceHash||checkpoint.target_sha!==targetHash)throw Error('迁移来源或目标已变化：禁止增量混库，请建立新空目标并重新对账');return 'repeat';}
 if(nonempty.length)throw Error('目标不是空业务库，禁止导入：'+nonempty.join(','));return 'fresh';
}
export async function assertDataImportTarget(client,sourceHash,{bootstrapHash=null}={}){
 const names=await tableNames(client);let checkpoint=null;
 if(names.includes('data_import_checkpoints'))checkpoint=(await client.query("select * from data_import_checkpoints where id='sqlite-full-import'")).rows[0]||null;
 if(checkpoint)return validateImportDecision({checkpoint,sourceHash,targetHash:await targetImportFingerprint(client)});
 if(bootstrapHash){if(await targetImportFingerprint(client)!==bootstrapHash)throw Error('目标在结构初始化后发生变化，禁止导入');return 'fresh';}
 const nonempty=[];
 for(const name of names.filter(n=>!excludedTarget.has(n))){
  const rows=(await client.query('select * from '+quote(name))).rows;if(!rows.length)continue;
  if(name==='maintenance_work_locations'){
   const expected=new Map([['maintenance-location-qingdao','青岛'],['maintenance-location-yanji','延吉'],['maintenance-location-shenyang','沈阳']]);
   if(rows.every(r=>expected.get(r.id)===r.name&&r.status==='active'))continue;
  }
  if(name==='info_sync_meta'&&rows.length===1&&Number(rows[0].id)===1&&Number(rows[0].version)===0&&!rows[0].cursor_key)continue;
  nonempty.push(name);
 }
 return validateImportDecision({sourceHash,nonempty});
}
export async function lockImportTables(client){const names=await tableNames(client);if(names.length)await client.query('lock table '+names.map(quote).join(',')+' in share row exclusive mode');}
export async function recordDataImport(client,sourceHash){const targetHash=await targetImportFingerprint(client);await client.query('create table if not exists data_import_checkpoints(id text primary key,source_sha text not null,target_sha text not null,completed_at text not null)');await client.query("insert into data_import_checkpoints values('sqlite-full-import',$1,$2,$3) on conflict(id) do update set source_sha=excluded.source_sha,target_sha=excluded.target_sha,completed_at=excluded.completed_at",[sourceHash,targetHash,new Date().toISOString()]);}
