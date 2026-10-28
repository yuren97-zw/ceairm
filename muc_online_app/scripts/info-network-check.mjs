// Real HTTP/SSE sockets against a disposable database, never production.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ceairm-info-network-'));
const participantCount=Number(process.env.INFO_TEST_READERS||200),historyCount=Number(process.env.INFO_TEST_HISTORY||500);
if(![2,200].includes(participantCount)||historyCount<1||historyCount>500)throw new Error('unsupported isolated test size');
process.env.MUC_NO_LISTEN='1';process.env.DB_PATH=path.join(root,'test.sqlite');process.env.UPLOAD_DIR=path.join(root,'uploads');
process.env.DATABASE_URL='';process.env.NODE_ENV='test';
const {measuredRoute,pumpInfoSync,db}=await import('../server.mjs');
const template=db.prepare("select * from users where id='54002010'").get(),stamp=new Date().toISOString();
const group=db.prepare("select * from organization_units where unit_type='personnel_group' and maintenance_eligible=1 order by code limit 1").get();
const team=db.prepare("select id from organization_units where unit_type='administrative_team' and parent_id=? order by code limit 1").get(group.id);
const workerRole=db.prepare("select id from rbac_roles where code='worker'").get().id;
const people=[];
db.exec('begin');
for(let i=0;i<participantCount;i++){
  const id=`network-reader-${i}`,personId=`network-person-${i}`,sid=crypto.randomBytes(24).toString('hex');
  db.prepare("insert into personnel(id,employee_no,name,department,home_team,employment_status,data_status,department_id,personnel_group_id,administrative_team_id,created_at,updated_at) values(?,?,?,'test','一组','在职','active',?,?,?,?,?)").run(personId,String(98000000+i),`测试${i}`,group.parent_id,group.id,team.id,stamp,stamp);
  const row={...template,id,username:id,name:`测试${i}`,person_id:personId,role:'receiver',status:'active'};
  db.prepare(`insert into users(${Object.keys(row).join(',')}) values(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
  db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(id,workerRole,stamp);
  db.prepare("insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at) values(?,?,'info','self','','','',?,?)").run(`scope-${id}`,id,stamp,stamp);
  db.prepare('insert into sessions(id,user_id,created_at,expires_at,credential_version) values(?,?,?,?,?)').run(sid,id,stamp,'2099-01-01T00:00:00Z',row.credential_version||1);
  people.push({id,personId,cookie:`muc_sid=${sid}`});
}
for(let i=0;i<historyCount;i++){
  const id=`network-history-${i}`;
  db.prepare("insert into records(id,date,publisher,category,title,original,created_by,updated_by,created_at,updated_at,publisher_id) values(?,'2026-10-09','test','其他',?,'test','54002010','54002010',?,?,'54002010')").run(id,id,stamp,stamp);
  for(const person of people)db.prepare('insert into record_recipients(record_id,user_id,person_id,name,department,team) values(?,?,?,?,?,?)').run(id,person.id,person.personId,'test','test','test');
}
const sid=crypto.randomBytes(24).toString('hex');
db.prepare('insert into sessions(id,user_id,created_at,expires_at,credential_version) values(?,?,?,?,?)').run(sid,template.id,stamp,'2099-01-01T00:00:00Z',template.credential_version||1);
db.exec('commit');pumpInfoSync();
const server=http.createServer(measuredRoute);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port,origin=`http://127.0.0.1:${port}`;
const api=async(url,cookie,body)=>{
  const start=performance.now();const response=await fetch(origin+'/api'+url,{method:body?'POST':'GET',headers:{cookie,origin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json();assert.equal(response.status,url==='/records'&&body?201:200,JSON.stringify(data));return{data,ms:performance.now()-start};
};
const streams=[];const heartbeat=setInterval(()=>pumpInfoSync(),Number(process.env.INFO_TEST_POLL_MS||2000));
const percentile=(values,p)=>Math.round([...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]*10)/10;
try{
  const snapshots=await Promise.all(people.map(async person=>{const result=await api('/records?summary=1',person.cookie);assert.equal(result.data.records.length,historyCount);return{...person,cursor:result.data.cursor,knownIds:result.data.records.map(r=>r.id),initialMs:result.ms};}));
  for(const snapshot of snapshots){
    await new Promise((resolve,reject)=>{
      const req=http.get(origin+'/api/info/events',{headers:{cookie:snapshot.cookie}},res=>{
        if(res.statusCode!==200)return reject(new Error(`SSE status ${res.statusCode}`));
        const stream={req,res,snapshot,buffer:'',next:null};streams.push(stream);
        res.on('data',chunk=>{stream.buffer+=chunk.toString();let boundary;while((boundary=stream.buffer.indexOf('\n\n'))>=0){const frame=stream.buffer.slice(0,boundary);stream.buffer=stream.buffer.slice(boundary+2);if(frame.includes('"kind":"connected"'))resolve();else if(frame.includes('event: info') && stream.next){const done=stream.next;stream.next=null;done({at:performance.now(),frame});}}});
      });req.on('error',reject);
    });
  }
  const rounds=[];
  for(let round=0;round<3;round++){
    const times=streams.map(stream=>new Promise(resolve=>stream.next=resolve));
    const start=performance.now();const created=await api('/records',`muc_sid=${sid}`,{date:'2026-10-09',title:`network-test-${round}`,original:'local disposable test',category:'其他',recipients:people.map(p=>p.personId)});
    const notices=await Promise.race([Promise.all(times),new Promise((_,reject)=>setTimeout(()=>reject(new Error('notification deadline exceeded')),10000).unref())]);
    const sync=await Promise.all(streams.map(stream=>api('/info/sync',stream.snapshot.cookie,{cursor:stream.snapshot.cursor,knownIds:stream.snapshot.knownIds})));
    for(let i=0;i<sync.length;i++){
      assert.equal(sync[i].data.reset,false);assert.ok(sync[i].data.records.some(r=>r.id===created.data.record.id));
      streams[i].snapshot.cursor=sync[i].data.cursor;streams[i].snapshot.knownIds.push(created.data.record.id);
      assert.ok(!notices[i].frame.includes(created.data.record.id));
    }
    rounds.push({publishMs:Math.round(created.ms),notificationP50:percentile(notices.map(n=>n.at-start),.5),notificationP95:percentile(notices.map(n=>n.at-start),.95),incrementalP95:percentile(sync.map(s=>s.ms),.95)});
  }
  // Disconnect all readers, publish while offline, then recover with saved cursors.
  for(const stream of streams)stream.req.destroy();
  streams.length=0;
  const offline=await api('/records',`muc_sid=${sid}`,{date:'2026-10-09',title:'network-offline-recovery',original:'local disposable test',category:'其他',recipients:people.map(p=>p.personId)});
  const recovered=await Promise.all(snapshots.map(snapshot=>api('/info/sync',snapshot.cookie,{cursor:snapshot.cursor,knownIds:snapshot.knownIds})));
  for(let i=0;i<recovered.length;i++){
    assert.equal(recovered[i].data.reset,false);
    assert.ok(recovered[i].data.records.some(r=>r.id===offline.data.record.id));
    snapshots[i].cursor=recovered[i].data.cursor;snapshots[i].knownIds.push(offline.data.record.id);
  }
  await Promise.all(snapshots.map(snapshot=>new Promise((resolve,reject)=>{
    const req=http.get(origin+'/api/info/events',{headers:{cookie:snapshot.cookie}},res=>{
      if(res.statusCode!==200)return reject(new Error(`reconnect status ${res.statusCode}`));
      const stream={req,res,snapshot,buffer:'',next:null};streams.push(stream);
      res.on('data',chunk=>{stream.buffer+=chunk.toString();let boundary;while((boundary=stream.buffer.indexOf('\n\n'))>=0){const frame=stream.buffer.slice(0,boundary);stream.buffer=stream.buffer.slice(boundary+2);if(frame.includes('"kind":"connected"'))resolve();else if(frame.includes('event: info')&&stream.next){const done=stream.next;stream.next=null;done({at:performance.now(),frame});}}});
    });req.on('error',reject);
  })));
  const reconnectNotices=streams.map(stream=>new Promise(resolve=>stream.next=resolve));
  const reconnectStart=performance.now();
  const afterReconnect=await api('/records',`muc_sid=${sid}`,{date:'2026-10-09',title:'network-after-reconnect',original:'local disposable test',category:'其他',recipients:people.map(p=>p.personId)});
  const reconnectSignals=await Promise.race([Promise.all(reconnectNotices),new Promise((_,reject)=>setTimeout(()=>reject(new Error('reconnect notification deadline exceeded')),10000).unref())]);
  const finalSync=await Promise.all(streams.map(stream=>api('/info/sync',stream.snapshot.cookie,{cursor:stream.snapshot.cursor,knownIds:stream.snapshot.knownIds})));
  for(const result of finalSync){assert.equal(result.data.reset,false);assert.ok(result.data.records.some(r=>r.id===afterReconnect.data.record.id));}
  console.log(JSON.stringify({ok:true,transport:`real HTTP and ${participantCount} SSE sockets`,database:'SQLite',history:historyCount,recipientRelations:participantCount*historyCount,initialP95:percentile(snapshots.map(s=>s.initialMs),.95),rounds,reconnect:{readers:streams.length,missedRecordRecovery:'passed',resubscribedPush:'passed',notificationP95:percentile(reconnectSignals.map(n=>n.at-reconnectStart),.95)},root}));
}finally{
  clearInterval(heartbeat);for(const stream of streams)stream.req.destroy();
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();
}
