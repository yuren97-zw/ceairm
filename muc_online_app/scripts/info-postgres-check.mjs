// Isolated PostgreSQL 16 migration verification. Never prints credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import pg from 'pg';
const root=process.argv[2];
if(!root?.startsWith('/private/tmp/ceairm-info-pg16.'))throw new Error('仅允许本次隔离目录');
const bin=path.join(root,'runtime/bin'),data=path.join(root,'data'),socket=path.join(root,'socket');
await fs.mkdir(socket,{recursive:true});
const password=crypto.randomBytes(32).toString('base64url'),pw=path.join(root,'password');
await fs.writeFile(pw,password,{mode:0o600});
const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
if([5432,8787,8788].includes(port))throw new Error('不允许该端口');
execFileSync(path.join(bin,'initdb'),['-D',data,'--username=codex_info_test','--auth-host=scram-sha-256','--auth-local=scram-sha-256',`--pwfile=${pw}`],{stdio:'ignore'});
await fs.unlink(pw);
let client;
try{
  execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${socket}`,'-w','start'],{stdio:'ignore'});
  const options={host:'127.0.0.1',port,user:'codex_info_test',password,database:'postgres'};
  client=new pg.Client(options);await client.connect();await client.query('create database info_realtime_test');await client.end();
  client=new pg.Client({...options,database:'info_realtime_test'});await client.connect();
  assert.match((await client.query('show server_version')).rows[0].server_version,/^16\./);
  const files=(await fs.readdir(new URL('../migrations/',import.meta.url))).filter(f=>/^\d+_.+\.sql$/.test(f)).sort();
  await client.query('create table if not exists schema_migrations(version text primary key,applied_at text not null)');
  for(let pass=0;pass<2;pass++)for(const file of files){
    if((await client.query('select 1 from schema_migrations where version=$1',[file])).rowCount)continue;
    await client.query('begin');try{await client.query(await fs.readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));await client.query('insert into schema_migrations values($1,$2)',[file,new Date().toISOString()]);await client.query('commit');}catch(e){await client.query('rollback');throw e;}
  }
  assert.equal(Number((await client.query('select count(*) as n from schema_migrations')).rows[0].n),files.length);
  // Re-applying the new migration itself also remains safe.
  await client.query(await fs.readFile(new URL('../migrations/020_info_realtime.sql',import.meta.url),'utf8'));
  await client.query('begin');
  const baseline=Number((await client.query('select version from info_sync_meta')).rows[0].version);
  await client.query("insert into records(id,date,publisher,category,title,original,created_by,updated_by,created_at,updated_at) values('pg-sync-test','2026-10-09','test','其他','test','test','test','test','test','test')");
  assert.equal(Number((await client.query('select version from info_sync_meta')).rows[0].version),baseline+1);
  await client.query('rollback');assert.equal(Number((await client.query('select version from info_sync_meta')).rows[0].version),baseline);
  await client.end();client=null;
  execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-w','restart','-l',path.join(root,'postgres.log')],{stdio:'ignore'});
  client=new pg.Client({...options,database:'info_realtime_test'});await client.connect();
  assert.equal(Number((await client.query('select count(*) as n from schema_migrations')).rows[0].n),files.length);
  process.env.DATABASE_URL=`postgresql://codex_info_test:${password}@127.0.0.1:${port}/info_realtime_test`;
  process.env.DB_PATH=path.join(root,'unused.sqlite');process.env.UPLOAD_DIR=path.join(root,'uploads');process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';
  const {measuredRoute,db}=await import('../server.mjs');
  const server=http.createServer(measuredRoute);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;let cookie='',stream;
  const api=async(url,body,method=body?'POST':'GET')=>{const response=await fetch(origin+'/api'+url,{method,headers:{origin,cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();return{status:response.status,data,cookie:response.headers.get('set-cookie')};};
  try{
    const login=await api('/login',{username:'54002010',password:'muc2026'});assert.equal(login.status,200);cookie=login.cookie.split(';')[0];
    const before=await api('/records?summary=1');assert.equal(before.status,200);
    let notify;const notification=new Promise(resolve=>notify=resolve);
    await new Promise((resolve,reject)=>{
      stream=http.get(origin+'/api/info/events',{headers:{cookie}},res=>{assert.equal(res.statusCode,200);let buffer='';res.on('data',chunk=>{buffer+=chunk.toString();let index;while((index=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,index);buffer=buffer.slice(index+2);if(frame.includes('"kind":"connected"'))resolve();else if(frame.includes('"kind":"content"'))notify(performance.now());}});});stream.on('error',reject);
    });
    const start=performance.now();const created=await api('/records',{date:'2026-10-09',title:'PG realtime joint check',original:'test',category:'其他',allInScope:true});assert.equal(created.status,201);
    const notified=await Promise.race([notification,new Promise((_,reject)=>setTimeout(()=>reject(new Error('PostgreSQL notification timeout')),5000).unref())]);
    const delta=await api('/info/sync',{cursor:before.data.cursor,knownIds:[]});assert.equal(delta.status,200);assert.equal(delta.data.reset,false);assert.ok(delta.data.records.some(r=>r.id===created.data.record.id));
    const body={...created.data.record,title:'PG edited',expectedUpdatedAt:created.data.record.updatedAt};
    assert.equal((await api(`/records/${created.data.record.id}`,body,'PUT')).status,200);
    assert.equal((await api(`/records/${created.data.record.id}`,body,'PUT')).status,409);
    console.log(JSON.stringify({postgres:16,migrations:files.length,secondPass:'unchanged',rollback:'passed',restart:'passed',loopback:true,jointHttp:'passed',sse:'passed',notificationMs:Math.round(notified-start),incremental:'passed',editConflict:'passed'}));
  }finally{stream?.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}
}finally{
  await client?.end();
  execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{stdio:'ignore'});
}
