// Isolated real HTTP attachment regression; never uses the 8788 database.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ceairm-info-upload-'));
process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';
process.env.DB_PATH=path.join(root,'test.sqlite');process.env.UPLOAD_DIR=path.join(root,'uploads');
for(const key of ['COS_SECRET_ID','COS_SECRET_KEY','COS_BUCKET','COS_REGION'])process.env[key]='';
const {measuredRoute,db}=await import('../server.mjs');
const session=crypto.randomBytes(24).toString('hex');
const account=db.prepare("select credential_version from users where id='54002010'").get();
db.prepare('insert into sessions(id,user_id,created_at,expires_at,credential_version) values(?,?,?,?,?)').run(session,'54002010',new Date().toISOString(),'2099-01-01T00:00:00Z',account.credential_version||1);
const server=http.createServer(measuredRoute);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,cookie=`muc_sid=${session}`;
const call=(route,options={})=>fetch(origin+route,{...options,headers:{cookie,origin,...options.headers},signal:AbortSignal.timeout(30000)});
const makeBody=(size,name='boundary.txt')=>{const form=new FormData();form.append('file',new Blob([Buffer.alloc(size,65)],{type:'text/plain'}),name);return form;};
try{
  const created=await call('/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:'2026-10-10',title:'isolated upload regression',original:'test only',category:'其他',allInScope:true})});
  assert.equal(created.status,201);const {record}=await created.json();
  const route=`/api/records/${record.id}/attachments`,limit=10*1024*1024;
  const exact=await call(route,{method:'POST',body:makeBody(limit)});
  assert.equal(exact.status,201);const boundary=(await exact.json()).attachments[0];assert.equal(boundary.size,limit);
  const downloaded=await call(`/api/attachments/${boundary.id}`,{headers:{Range:'bytes=0-31'}});
  assert.equal(downloaded.status,206);assert.equal((await downloaded.arrayBuffer()).byteLength,32);
  const fileNamesBefore=await fs.readdir(process.env.UPLOAD_DIR);
  const overflow=await call(route,{method:'POST',body:makeBody(limit+1,'over-limit.txt')});
  assert.equal(overflow.status,413);await overflow.text();
  assert.deepEqual((await fs.readdir(process.env.UPLOAD_DIR)).sort(),fileNamesBefore.sort());
  const empty=await call(route,{method:'POST',body:makeBody(0,'empty.txt')});assert.equal(empty.status,400);await empty.text();
  const prohibited=await call(route,{method:'POST',body:makeBody(32,'blocked.exe')});assert.equal(prohibited.status,415);await prohibited.text();
  const unauth=await call(route,{method:'POST',headers:{cookie:''},body:makeBody(32)});assert.equal(unauth.status,401);await unauth.text();
  const started=performance.now();
  const concurrent=await Promise.all(Array.from({length:10},async(_,i)=>{
    const result=await call(route,{method:'POST',body:makeBody(4*1024*1024,`parallel-${i}.txt`)});
    assert.equal(result.status,201);const item=(await result.json()).attachments[0];assert.equal(item.size,4*1024*1024);return item.id;
  }));
  assert.equal(new Set(concurrent).size,10);
  assert.equal(db.prepare('select count(*) n from attachments where owner_id=?').get(record.id).n,11);
  assert.equal((await fs.readdir(process.env.UPLOAD_DIR)).length,11);
  console.log(JSON.stringify({ok:true,database:'isolated SQLite',transport:'real HTTP',boundary10MiB:'passed',overflowCleanup:'passed',empty:'rejected',blockedType:'rejected',unauthenticated:'rejected',rangeDownload:'passed',concurrentUploads:10,sizeEachMiB:4,concurrentMs:Math.round(performance.now()-started),root}));
}finally{
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();
}
