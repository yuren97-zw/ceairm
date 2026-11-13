import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createOffsetService,hoursToSeconds} from '../attendance-offset-service.mjs';
import {datesBetween} from '../attendance-rules.mjs';
const perms=['attendance.offset.rules.manage','attendance.offset.submit','attendance.offset.approve','attendance.offset.responsibility.manage'];
function fixture(){
 const db=new DatabaseSync(':memory:');let now=Date.parse('2026-09-30T23:00:00+08:00');
 const employee={id:'employee',personId:'p',permissions:['attendance.offset.submit']};
 const leader={id:'leader',personId:'l',permissions:['attendance.offset.approve']};
 const admin={id:'admin',personId:'admin',permissions:perms};const users=[employee,leader,admin];const sources=new Map();
 const day=date=>sources.get(date)||{date,input:{date,covered:true,rest:true,points:[],punches:[],approvals:[]},sourceReadAt:Date.parse(date+'T23:59:00+08:00')};
 const deps={db,allowLegacySettlement:true,clock:()=>now,hasPermission:(u,p)=>u.permissions.includes(p),canViewPerson:()=>true,loadUser:id=>users.find(u=>u.id===id),listApproverIds:()=>users.map(u=>u.id),readDays:(p,from,to)=>datesBetween(from,to).map(day),writesEnabled:true};
 const service=createOffsetService(deps);
 const at=(date,time)=>Date.parse(`${date}T${time}+08:00`);
 function abnormal(date='2026-11-09'){
  const input={date,covered:true,points:[{type:'OnDuty',planId:'on',planned:at(date,'08:30:00')},{type:'OffDuty',planId:'off1',planned:at(date,'12:00:00')},{type:'OnDuty',planId:'on2',planned:at(date,'13:00:00')},{type:'OffDuty',planId:'off2',planned:at(date,'19:40:00')}],punches:[],approvals:[]};
  sources.set(date,{date,input,sourceReadAt:at(date,'23:59:00')});return input;
 }
 function setup(){
  service.saveRule(admin,{sourceMonth:'2026-10',hours:'4',count:1,cap:3,personIds:['p']},'rule');
  now=at('2026-11-20','12:00:00');const input=abnormal('2026-10-05');input.punches=[{...input.points.at(-1),actual:input.points.at(-1).planned+12*3600000,source:'USER',timeResult:'Normal'}];
  assert.equal(service.issue(admin,{personId:'p',sourceMonth:'2026-10'},'issue').granted,3);
  const a=abnormal();service.confirmResponsibility(admin,{personId:'p',workDate:a.date,team:'实际二班',leaderPersonId:'l',assigneeUserId:'leader',evidence:'已核实支援排班记录'},'responsibility');
  service.reconcile(admin,'p',a.date,'reconcile');
  const ids=db.prepare("select id from attendance_offset_events where person_id='p' and work_date=? order by planned").all(a.date).map(r=>r.id);
  return {a,ids};
 }
 return {db,service,admin,employee,leader,setup,sources,deps,setNow:v=>now=v};
}
test('hours parse exactly and never truncate fractions of a second',()=>{assert.throws(()=>hoursToSeconds('0.0005'));assert.equal(hoursToSeconds('0.0025'),9);assert.equal(hoursToSeconds('4'),14400);});
test('B05/B06 transaction freezes, partial decision consumes/releases, idempotent replay retains source and task count',()=>{
 const f=fixture(),{ids,a}=f.setup(),before=JSON.stringify(a);const body={assigneeUserId:'leader',events:ids,note:'本人申请'};
 const req=f.service.submit(f.employee,body,'submit');assert.deepEqual(f.service.submit(f.employee,body,'submit'),req);assert.equal(f.service.balance(f.employee).frozen,2);assert.equal(f.service.tasks.count(f.leader).count,1);assert.equal(f.service.tasks.count(f.employee).count,0);
 const detail=f.service.detail(f.leader,req.id);assert.equal(detail.applicant.personId,f.employee.personId);assert.equal(detail.applicant.userId,f.employee.id);const decision={version:detail.version,decisions:detail.items.map((i,n)=>({id:i.id,decision:n?'rejected':'approved',reason:n?'证据不足':''}))};
 const result=f.service.decide(f.leader,req.id,decision,'decide');assert.equal(result.status,'partial');assert.deepEqual(f.service.decide(f.leader,req.id,decision,'decide'),result);
 assert.equal(f.service.balance(f.employee).used,1);assert.equal(f.service.balance(f.employee).available,2);assert.equal(f.service.tasks.count(f.leader).count,0);assert.equal(JSON.stringify(a),before);
 const rejected=f.service.detail(f.employee,req.id).items.find(i=>i.decision==='rejected');assert.notEqual(f.service.submit(f.employee,{assigneeUserId:'leader',events:[rejected.event_id],note:'补充说明重新申请'},'new').id,req.id);f.db.close();
});
test('invalid selected approver and request replay cannot leave partial data',()=>{
 const f=fixture(),{ids}=f.setup();
 assert.throws(()=>f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:'申请'},''));
 f.db.prepare('delete from attendance_shift_responsibilities').run();assert.throws(()=>f.service.submit(f.employee,{assigneeUserId:'invalid',events:ids,note:'申请'},'x'),{status:409});
 assert.equal(f.service.balance(f.employee).frozen,0);assert.equal(f.db.prepare('select count(*) n from attendance_offset_requests').get().n,0);f.db.close();
});
test('source invalidation refunds approved items once without changing decision or allocating another item',()=>{
 const f=fixture(),{ids,a}=f.setup();const req=f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:'申请'},'submit');
 const d=f.service.detail(f.leader,req.id);f.service.decide(f.leader,req.id,{version:d.version,decisions:[{id:d.items[0].id,decision:'approved'}]},'approve');
 a.punches=a.points.filter(p=>p.type==='OffDuty').map(p=>({...p,actual:p.planned,source:'USER',timeResult:'Normal'}));
 f.service.reconcile(f.admin,'p',a.date,'sync2');f.service.reconcile(f.admin,'p',a.date,'sync3');
 assert.equal(f.service.balance(f.employee).used,0);assert.equal(f.service.detail(f.employee,req.id).items[0].decision,'approved');assert.equal(f.service.detail(f.employee,req.id).items[0].effective,0);assert.equal(f.db.prepare("select count(*) n from attendance_offset_ledger where kind='refund'").get().n,1);f.db.close();
});
test('source changes invalidate stale form and partial invalidation preserves one task',()=>{
 const f=fixture(),{ids,a}=f.setup(),req=f.service.submit(f.employee,{assigneeUserId:'leader',events:ids,note:'申请'},'submit');const d=f.service.detail(f.leader,req.id);
 a.punches=[{...a.points[1],actual:a.points[1].planned,source:'USER',timeResult:'Normal'}];
 assert.throws(()=>f.service.decide(f.leader,req.id,{version:d.version,decisions:d.items.map(i=>({id:i.id,decision:'approved'}))},'stale'),{status:409});
 f.service.reconcile(f.admin,'p',a.date,'changed');assert.equal(f.service.balance(f.employee).frozen,1);assert.equal(f.service.tasks.count(f.leader).count,1);f.db.close();
});
test('write switch and permission gates fail closed',()=>{
 const f=fixture();const disabled=createOffsetService({...f.deps,writesEnabled:false});assert.throws(()=>disabled.saveRule(f.admin,{sourceMonth:'2026-10'},'x'),{status:409});assert.throws(()=>f.service.rules(f.employee),{status:403});f.db.close();
});

test('automatic closed-month issuance is idempotent and inactive switch performs no issuance',()=>{
 const f=fixture();f.service.saveRule(f.admin,{sourceMonth:'2026-10',hours:'4',count:1,cap:0,personIds:['p']},'rule');f.setNow(Date.parse('2026-11-20T12:00:00+08:00'));
 assert.equal(f.service.settleDue(f.admin).processed,1);assert.equal(f.service.settleDue(f.admin).processed,0);assert.equal(f.service.balance(f.employee).granted,0);f.db.close();
});
test('authorization transfer revokes old action, never lets employee approve self, and keeps one effective task',()=>{
 const f=fixture(),{ids}=f.setup(),r=f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:'申请'},'submit');
 assert.throws(()=>f.service.transfer(f.admin,r.id,{version:1,assigneeUserId:f.employee.id,reason:'不能本人审批'},'bad'),{status:409});
 f.service.transfer(f.admin,r.id,{version:1,assigneeUserId:f.admin.id,reason:'授权代审记录'},'move');
 assert.equal(f.service.tasks.count(f.leader).count,0);assert.equal(f.service.tasks.count(f.admin).count,1);
 assert.throws(()=>f.service.decide(f.leader,r.id,{version:1,decisions:[]},'old'),{status:403});f.db.close();
});
test('reconcile dirty generations never reset and source invalidation remains retryable',()=>{
 const f=fixture(),{ids,a}=f.setup(),r=f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:'申请'},'submit');
 f.service.markDirty('p',a.date);f.service.drain(f.admin);
 a.punches=a.points.filter(p=>p.type==='OffDuty').map(p=>({...p,actual:p.planned,source:'USER',timeResult:'Normal'}));
 f.service.markDirty('p',a.date);f.service.drain(f.admin);assert.equal(f.service.balance(f.employee).frozen,0);
 const d=f.db.prepare('select * from attendance_offset_dirty').get();assert.equal(d.generation,2);assert.equal(d.processed_generation,2);assert.equal(f.service.detail(f.employee,r.id).status,'source_invalid');f.db.close();
});
test('month rollover keeps the old frozen account and does not permit historical credits in new month',()=>{
 const f=fixture(),{ids}=f.setup();const r=f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:'申请'},'submit');f.setNow(Date.parse('2026-12-02T12:00:00+08:00'));
 assert.equal(f.service.balance(f.employee,'2026-11').available,null);assert.equal(f.service.balance(f.employee).available,null);
 f.service.withdraw(f.employee,r.id,{version:1},'withdraw');assert.equal(f.service.balance(f.employee,'2026-11').frozen,0);assert.equal(f.service.balance(f.employee).status,'not_configured');f.db.close();
});

import {Worker} from 'node:worker_threads';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('R09 two independent SQLite connections race for the same anomalies without double freeze or orphan requests',async()=>{
 const f=fixture(),{ids}=f.setup(),directory=mkdtempSync(path.join(tmpdir(),'offset-race-')),file=path.join(directory,'test.sqlite');
 f.db.prepare('vacuum into ?').run(file);
 const workers=[];
 try{
  const data={path:file,users:[f.employee,f.leader,f.admin],employee:f.employee,body:{assigneeUserId:'leader',events:ids,note:'并发申请'},sources:[...f.sources.values()]};
  const ready=[];
  for(let n=0;n<2;n++){
   const worker=new Worker(new URL('./fixtures/offset-concurrent-worker.mjs',import.meta.url),{workerData:{...data,key:'race-'+n}});workers.push(worker);
   ready.push(new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);}));
  }
  await Promise.all(ready);const results=await Promise.all(workers.map(worker=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage('go');})));
  assert.equal(results.filter(r=>r.ok).length,1);const saved=new DatabaseSync(file);assert.equal(saved.prepare('select frozen from attendance_offset_accounts').get().frozen,2);assert.equal(saved.prepare('select count(*) n from attendance_offset_requests').get().n,1);assert.equal(saved.prepare('select count(*) n from attendance_offset_claims').get().n,2);saved.close();
 }finally{await Promise.all(workers.map(w=>w.terminate()));f.db.close();rmSync(directory,{recursive:true,force:true});}
});

test('stable event lifecycle records retain every revision and do not revive a previous approval',()=>{
 const f=fixture(),{a}=f.setup();const first=f.db.prepare('select id from attendance_offset_events where work_date=? order by planned').get(a.date).id;
 a.punches=a.points.filter(p=>p.type==='OffDuty').map(p=>({...p,actual:p.planned,source:'USER',timeResult:'Normal'}));f.service.reconcile(f.admin,'p',a.date,'removed');a.punches=[];f.service.reconcile(f.admin,'p',a.date,'returned');
 const rows=f.db.prepare('select revision,active from attendance_offset_event_history where event_id=? order by revision').all(first);assert.deepEqual(rows.map(r=>[r.revision,r.active]),[[1,1],[2,0],[3,1]]);f.db.close();
});

test('R20 disabling new writes can retain separately authorized withdrawal of old frozen applications',()=>{
 const f=fixture(),{ids}=f.setup(),request=f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:'申请'},'submit');
 const recovery=createOffsetService({...f.deps,writesEnabled:false,existingActionsEnabled:true});
 assert.throws(()=>recovery.submit(f.employee,{assigneeUserId:'leader',events:[ids[1]],note:'新增'},'blocked'),{status:409});recovery.withdraw(f.employee,request.id,{version:1},'release');assert.equal(recovery.balance(f.employee).frozen,0);f.db.close();
});

test('revoked assignee permission hides an executable task but leaves an authorized routing issue',()=>{
 const f=fixture(),{ids}=f.setup();f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:'申请'},'submit');f.leader.permissions=[];
 assert.equal(f.service.tasks.count(f.leader).count,0);assert.equal(f.service.routingIssues(f.admin).length,1);assert.equal(f.service.balance(f.employee).frozen,1);f.db.close();
});

test('settlement differences block approval and new freezes while keeping rejection/release available',()=>{
 const f=fixture(),{ids}=f.setup(),request=f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:'申请'},'submit'),detail=f.service.detail(f.leader,request.id);
 f.db.prepare("update attendance_offset_accounts set status='difference_review'").run();
 assert.throws(()=>f.service.decide(f.leader,request.id,{version:detail.version,decisions:[{id:detail.items[0].id,decision:'approved'}]},'approve'),{status:409});assert.equal(f.service.balance(f.employee).frozen,1);
 f.service.decide(f.leader,request.id,{version:detail.version,decisions:[{id:detail.items[0].id,decision:'rejected',reason:'等待月度复核'}]},'reject');assert.equal(f.service.balance(f.employee).frozen,0);f.db.close();
});

test('unchanged authoritative reconciliation preserves business versions and submission evidence survives refresh',()=>{
 const f=fixture(),{ids,a}=f.setup();const before=f.service.versions();f.service.reconcile(f.admin,'p',a.date,'unchanged');assert.deepEqual(f.service.versions(),before);
 const r=f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:'证据快照'},'submit');
 const submitted=f.service.detail(f.employee,r.id).submittedEvidence[0];
 a.punches=[{...a.points[1],actual:a.points[1].planned,source:'SYSTEM',timeResult:'NotSigned',recordId:'placeholder'}];
 f.service.reconcile(f.admin,'p',a.date,'updated-evidence');
 const after=f.service.detail(f.employee,r.id);assert.deepEqual(after.submittedEvidence[0],submitted);assert.ok(after.items[0].event_revision>submitted.revision);assert.ok(after.history.some(h=>h.action==='source_evidence_changed'));f.db.close();
});
test('own request history is complete via stable monthly pagination and never exposes another person',()=>{
 const f=fixture(),{ids}=f.setup();
 for(let i=0;i<25;i++){const r=f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:'历史'+i},'submit-'+i),d=f.service.detail(f.leader,r.id);f.service.decide(f.leader,r.id,{version:d.version,decisions:[{id:d.items[0].id,decision:'rejected',reason:'历史结案'}]},'reject-'+i);}
 const seen=[];let cursor=null;
 do{const page=f.service.ownRequests(f.employee,{limit:7,cursor});assert.equal(page.count,25);seen.push(...page.items.map(i=>i.id));cursor=page.nextCursor;}while(cursor);
 assert.equal(new Set(seen).size,25);assert.equal(f.service.ownRequests(f.leader).count,0);f.db.close();
});

test('permission revoked between initial validation and transaction entry prevents all writes',()=>{
 const f=fixture(),{ids}=f.setup(),original=f.db.exec.bind(f.db);
 f.db.exec=sql=>{const result=original(sql);if(sql==='begin immediate')f.employee.permissions=[];return result;};
 assert.throws(()=>f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:'不得沿用旧权限'},'revoked'),{status:403});assert.equal(f.service.balance(f.employee).frozen,0);assert.equal(f.db.prepare('select count(*) n from attendance_offset_requests').get().n,0);f.db.close();
});

test('T13 missing task index is repaired from pending source without completing or duplicating business',()=>{
 const f=fixture(),{ids}=f.setup(),r=f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:'待办故障恢复'},'submit');f.db.prepare('delete from action_tasks').run();
 assert.equal(f.service.tasks.count(f.leader).count,0);assert.equal(f.service.repairTasks(f.admin).restored,1);assert.equal(f.service.tasks.count(f.leader).count,1);assert.equal(f.service.repairTasks(f.admin).restored,0);f.db.prepare("update action_tasks set status='completed'").run();assert.equal(f.service.repairTasks(f.admin).restored,1);assert.equal(f.service.balance(f.employee).frozen,1);
 f.service.withdraw(f.employee,r.id,{version:1},'withdraw');f.db.prepare("update action_tasks set status='pending'").run();assert.equal(f.service.tasks.count(f.leader).count,0);assert.equal(f.service.repairTasks(f.admin).invalidated,1);f.db.close();
});

test('B03/B13 Early is a separate paired white-shift event and can be approved without changing raw punches',()=>{
 const f=fixture(),{a}=f.setup();a.punches=a.points.map(p=>({...p,actual:p.planned,source:'USER',recordId:p.planId,timeResult:'Normal'}));a.punches.at(-1).actual-=1000;a.punches.at(-1).timeResult='Early';
 f.service.reconcile(f.admin,'p',a.date,'early');const event=f.db.prepare("select id from attendance_offset_events where active=1 and kind='day_off_early'").get();assert.ok(event);
 const before=JSON.stringify(a),r=f.service.submit(f.employee,{assigneeUserId:'leader',events:[event.id],note:'白班早退'},'apply-early'),d=f.service.detail(f.leader,r.id);f.service.decide(f.leader,r.id,{version:d.version,decisions:[{id:d.items[0].id,decision:'approved'}]},'approve-early');assert.equal(f.service.balance(f.employee).used,1);assert.equal(JSON.stringify(a),before);f.db.close();
});
test('T02/T06 two requests are two tasks, paged in stable order; merely reading never completes them',()=>{
 const f=fixture(),{ids}=f.setup();for(const id of ids)f.service.submit(f.employee,{assigneeUserId:'leader',events:[id],note:'独立申请'},'submit-'+id);
 const first=f.service.tasks.list(f.leader,{limit:1});assert.equal(first.count,2);assert.equal(first.items.length,1);f.service.detail(f.leader,first.items[0].sourceId);const next=f.service.tasks.list(f.leader,{limit:1,cursor:first.nextCursor});assert.equal(next.count,2);assert.notEqual(first.items[0].id,next.items[0].id);assert.equal(f.service.tasks.count(f.leader).count,2);f.db.close();
});

test('B07/T07 whole approval and whole rejection close exactly once with two independent items',()=>{
 for(const decision of ['approved','rejected']){
  const f=fixture(),{ids}=f.setup(),request=f.service.submit(f.employee,{assigneeUserId:'leader',events:ids,note:'整单决定'},'submit'),detail=f.service.detail(f.leader,request.id);
  const body={version:detail.version,decisions:detail.items.map(item=>({id:item.id,decision,reason:decision==='rejected'?'不符合本次申请依据':''}))};
  const result=f.service.decide(f.leader,request.id,body,'decide');assert.equal(result.status,decision);assert.deepEqual(f.service.decide(f.leader,request.id,body,'decide'),result);
  assert.throws(()=>f.service.decide(f.leader,request.id,body,'another-decision'),{status:403,message:'不是当前受派审批人'});
  const balance=f.service.balance(f.employee);assert.equal(balance.frozen,0);assert.equal(balance.used,decision==='approved'?2:0);assert.equal(balance.available,decision==='approved'?1:3);assert.equal(f.service.tasks.count(f.leader).count,0);
  assert.equal(f.db.prepare('select count(*) n from attendance_offset_claims').get().n,decision==='approved'?2:0);f.db.close();
 }
});
test('B04 server revalidates previously eligible IDs against authoritative source and never freezes an ineligible exception',()=>{
 const cases=[
  ['on-duty missing only',a=>{a.punches=a.points.filter(p=>p.type==='OffDuty').map(p=>({...p,actual:p.planned,source:'USER',timeResult:'Normal'}));}],
  ['night',a=>{a.points=a.points.slice(0,2);a.points[0].planned=Date.parse(a.date+'T20:00:00+08:00');a.points[1].planned=a.points[0].planned+12*3600000;}],
  ['24 hour',a=>{a.points=a.points.slice(0,2);a.points[1].planned=a.points[0].planned+24*3600000;}],
  ['late only',a=>{a.punches=a.points.map(p=>({...p,actual:p.planned+(p.type==='OnDuty'?600000:0),source:'USER',timeResult:p.type==='OnDuty'?'Late':'Normal'}));}],
  ['uncovered',a=>{a.covered=false;}]
 ];
 for(const [name,change] of cases){const f=fixture(),{ids,a}=f.setup();change(a);
  assert.throws(()=>f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:name},'forged-'+name),{status:409});assert.equal(f.service.balance(f.employee).frozen,0);assert.equal(f.db.prepare('select count(*) n from attendance_offset_requests').get().n,0);f.db.close();
 }
});

test('fixed initialization is read-only, requires no overtime, confirms once and resumes after restart',()=>{
 const f=fixture();f.setNow(Date.parse('2026-11-20T12:00:00+08:00'));
 const service=createOffsetService({...f.deps,readDays:()=>{throw Error('must not read overtime');}}),body={personIds:['p']},preview=service.initializationPreview(f.admin,body);
 assert.equal(preview.usageMonth,'2026-11');assert.equal(preview.fixedCount,2);assert.equal(preview.people[0].earned,2);assert.equal(f.db.prepare('select count(*) n from attendance_offset_audit').get().n,0);
 const confirmed={...body,previewHash:preview.previewHash},result=service.initializationConfirm(f.admin,confirmed,'first');assert.deepEqual(service.initializationConfirm(f.admin,confirmed,'first'),result);
 const restarted=createOffsetService({...f.deps,readDays:()=>{throw Error('must not read overtime');}});assert.equal(restarted.settleDue(f.admin).processed,1);assert.equal(restarted.settleDue(f.admin).processed,0);assert.equal(restarted.balance(f.employee).granted,2);assert.equal(restarted.balance(f.employee).sourceKind,'initial_fixed');assert.equal(restarted.state(f.admin).initialization.people[0].status,'issued');assert.equal(f.db.prepare("select count(*) n from attendance_offset_ledger where kind='grant'").get().n,1);assert.equal(f.db.prepare('select count(*) n from attendance_offset_rules').get().n,0);
 assert.throws(()=>restarted.initializationConfirm(f.admin,confirmed,'second'),{status:409});f.setNow(Date.parse('2026-12-20T12:00:00+08:00'));assert.equal(restarted.settleDue(f.admin).processed,0);assert.equal(restarted.balance(f.employee).available,null);f.db.close();
});
test('fixed initialization rejects stale scope, other periods, missing permission and existing accounts',()=>{
 const f=fixture();f.setNow(Date.parse('2026-11-20T12:00:00+08:00'));const body={personIds:['p']};
 assert.throws(()=>f.service.initializationPreview(f.employee,body),{status:403});for(const bad of [{sourceMonth:'2026-10'},{usageMonth:'2026-10'},{hours:'4'},{count:3},{cap:0}])assert.throws(()=>f.service.initializationPreview(f.admin,{...body,...bad}));
 const preview=f.service.initializationPreview(f.admin,body);assert.throws(()=>f.service.initializationConfirm(f.admin,{personIds:['q'],previewHash:preview.previewHash},'stale'),{status:409});assert.equal(f.db.prepare('select count(*) n from attendance_offset_audit').get().n,0);f.db.close();
 const g=fixture();g.setup();const p=g.service.initializationPreview(g.admin,body);assert.equal(p.people[0].existingAccount,true);assert.throws(()=>g.service.initializationConfirm(g.admin,{...body,previewHash:p.previewHash},'overwrite'),{status:409});assert.equal(g.service.balance(g.employee).granted,3);g.db.close();
});
test('fixed initialization handles year boundary, write switch and actor scope',()=>{
 const f=fixture();f.setNow(Date.parse('2027-01-02T12:00:00+08:00'));const body={personIds:['p']},p=f.service.initializationPreview(f.admin,body);assert.equal(p.sourceMonth,'2027-01');assert.equal(p.usageMonth,'2027-01');assert.equal(p.people[0].earned,2);
 const disabled=createOffsetService({...f.deps,writesEnabled:false});assert.throws(()=>disabled.initializationConfirm(f.admin,{...body,previewHash:p.previewHash},'disabled'),{status:409});const scoped=createOffsetService({...f.deps,canViewPerson:()=>false});assert.throws(()=>scoped.initializationPreview(f.admin,body));f.db.close();
});
test('SQLite independent connections serialize fixed initialization confirmations',async()=>{
 const f=fixture();f.setNow(Date.parse('2026-11-20T12:00:00+08:00'));const values={personIds:['p']},preview=f.service.initializationPreview(f.admin,values),directory=mkdtempSync(path.join(tmpdir(),'offset-initial-race-')),file=path.join(directory,'test.sqlite');f.db.prepare('vacuum into ?').run(file);const workers=[];
 try{for(let n=0;n<2;n++)workers.push(new Worker(new URL('./fixtures/offset-concurrent-worker.mjs',import.meta.url),{workerData:{path:file,users:[f.admin,f.employee],actor:f.admin,employee:f.employee,action:'initializationConfirm',body:{...values,previewHash:preview.previewHash},key:'initial-'+n,sources:[]}}));await Promise.all(workers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);})));const results=await Promise.all(workers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);w.postMessage('go');})));assert.equal(results.filter(r=>r.ok).length,1);const saved=new DatabaseSync(file);assert.equal(saved.prepare('select count(*) n from attendance_offset_rules').get().n,0);assert.equal(saved.prepare("select count(*) n from attendance_offset_audit where action='initialize_fixed'").get().n,1);saved.close();}finally{await Promise.all(workers.map(w=>w.terminate()));f.db.close();rmSync(directory,{recursive:true,force:true});}
});
test('fixed allowance ignores overtime source changes and never mutates raw inputs',()=>{
 const f=fixture();f.setNow(Date.parse('2026-11-20T12:00:00+08:00'));const values={personIds:['p']},preview=f.service.initializationPreview(f.admin,values);
 const input={date:'2026-11-01',covered:false,points:[],punches:[],approvals:[]};f.sources.set(input.date,{date:input.date,input,sourceReadAt:null});const before=JSON.stringify(input);
 f.service.initializationConfirm(f.admin,{...values,previewHash:preview.previewHash},'first');f.service.settleDue(f.admin);f.service.markDirty('p',input.date);f.service.drain(f.admin);assert.equal(f.service.balance(f.employee).granted,2);assert.equal(f.service.balance(f.employee).status,'issued');assert.equal(JSON.stringify(input),before);f.db.close();
});
test('legacy initialization remains auditable and cannot issue after fixed-policy revision',()=>{
 const f=fixture();f.service.saveRule(f.admin,{sourceMonth:'2026-10',hours:'4',count:1,cap:3,personIds:['p']},'old-rule');const rule=f.db.prepare('select * from attendance_offset_rules').get();f.db.prepare('insert into attendance_offset_audit values(?,?,?,?,?,?)').run('legacy','admin','initialize',rule.id,JSON.stringify({sourceMonth:'2026-10',usageMonth:'2026-11',personIds:['p']}),'2026-11-01T00:00:00Z');f.setNow(Date.parse('2026-11-20T12:00:00+08:00'));
 assert.equal(f.service.state(f.admin).initialization.status,'requires_fixed_revision');assert.equal(f.service.settleDue(f.admin).processed,0);assert.throws(()=>f.service.issue(f.admin,{personId:'p',sourceMonth:'2026-10'},'old-issue'),{status:409});const preview=f.service.initializationPreview(f.admin,{personIds:['p']});f.service.initializationConfirm(f.admin,{personIds:['p'],previewHash:preview.previewHash},'revision');f.service.settleDue(f.admin);assert.equal(f.service.balance(f.employee).granted,2);assert.deepEqual(f.db.prepare('select * from attendance_offset_rules').get(),rule);assert.equal(f.db.prepare("select count(*) n from attendance_offset_audit where action='initialize'").get().n,1);f.db.close();
});
test('fixed issuance resumes batches and is independent from future regular conversion rules',()=>{
 const f=fixture();f.setNow(Date.parse('2026-11-20T12:00:00+08:00'));const values={personIds:Array.from({length:53},(_,i)=>'person'+i)},preview=f.service.initializationPreview(f.admin,values);f.service.initializationConfirm(f.admin,{...values,previewHash:preview.previewHash},'batch');assert.equal(f.service.settleDue(f.admin).processed,50);assert.equal(createOffsetService(f.deps).settleDue(f.admin).processed,3);assert.equal(f.service.settleDue(f.admin).processed,0);assert.equal(f.db.prepare('select count(*) n from attendance_offset_accounts where granted=2').get().n,53);
 f.service.saveRule(f.admin,{sourceMonth:'2026-12',hours:'4',count:1,cap:3,personIds:['p']},'future');f.setNow(Date.parse('2027-01-20T12:00:00+08:00'));assert.equal(f.service.settleDue(f.admin).processed,1);assert.equal(f.service.balance(f.employee).granted,0);assert.equal(f.service.balance(f.employee).sourceKind,'earned');f.db.close();
});

test('explicit fixed-scope supplement preserves original audit and balances, resumes idempotently',()=>{
 const f=fixture();f.setNow(Date.parse('2026-11-20T12:00:00+08:00'));const preview=f.service.initializationPreview(f.admin,{personIds:['p']});f.service.initializationConfirm(f.admin,{personIds:['p'],previewHash:preview.previewHash},'init');f.service.settleDue(f.admin);const original=f.db.prepare("select * from attendance_offset_audit where action='initialize_fixed'").get(),before=f.service.balance(f.employee);
 const body={personIds:['new'],reason:'用户明确更换模拟员工并授权首期2次'};const result=f.service.supplementInitialFixed(f.admin,body,'add');assert.deepEqual(f.service.supplementInitialFixed(f.admin,body,'add'),result);assert.equal(createOffsetService(f.deps).settleDue(f.admin).processed,1);assert.equal(f.service.settleDue(f.admin).processed,0);assert.equal(f.service.balance({id:'new-user',personId:'new'}).available,2);assert.deepEqual(f.service.balance(f.employee),before);assert.deepEqual(f.db.prepare("select * from attendance_offset_audit where action='initialize_fixed'").get(),original);assert.equal(f.db.prepare("select count(*) n from attendance_offset_ledger where kind='grant'").get().n,2);assert.equal(f.service.supplementInitialFixed(f.admin,body,'different-key').unchanged,true);f.db.close();
});
test('fixed-scope supplement rejects unauthorized, disabled, existing-account and other-month cases',()=>{
 const f=fixture();f.setup();const body={personIds:['p'],reason:'明确依据'};assert.throws(()=>f.service.supplementInitialFixed(f.employee,body,'x'),{status:403});assert.throws(()=>createOffsetService({...f.deps,writesEnabled:false}).supplementInitialFixed(f.admin,body,'x'),{status:409});const p=f.service.initializationPreview(f.admin,{personIds:['other']});f.service.initializationConfirm(f.admin,{personIds:['other'],previewHash:p.previewHash},'init');assert.throws(()=>f.service.supplementInitialFixed(f.admin,body,'overwrite'),{status:409});assert.equal(f.service.balance(f.employee).granted,3);f.setNow(Date.parse('2026-12-20T12:00:00+08:00'));assert.throws(()=>f.service.supplementInitialFixed(f.admin,{personIds:['new'],reason:'明确依据'},'later'),{status:409});assert.equal(f.db.prepare("select count(*) n from attendance_offset_audit where action='initialize_fixed_scope_add'").get().n,0);f.db.close();
});

test('own home missing offsets count distinct effective dates, isolate people and months, exclude early and invalidated',()=>{
 const f=fixture(),{ids,a}=f.setup();assert.deepEqual(f.service.effectiveMissingDates(f.employee,'2026-11'),[]);const req=f.service.submit(f.employee,{assigneeUserId:'leader',events:ids,note:'申请'},'submit');const d=f.service.detail(f.leader,req.id);f.service.decide(f.leader,req.id,{version:d.version,decisions:d.items.map(i=>({id:i.id,decision:'approved'}))},'approved');assert.deepEqual(f.service.effectiveMissingDates(f.employee,'2026-11'),['2026-11-09']);assert.deepEqual(f.service.effectiveMissingDates(f.leader,'2026-11'),[]);assert.deepEqual(f.service.effectiveMissingDates(f.employee,'2026-10'),[]);assert.throws(()=>f.service.effectiveMissingDates(null,'2026-11'),{status:401});f.db.prepare("update attendance_offset_events set kind='day_off_early'").run();assert.deepEqual(f.service.effectiveMissingDates(f.employee,'2026-11'),[]);f.db.prepare("update attendance_offset_events set kind='day_off_missing',active=0").run();assert.deepEqual(f.service.effectiveMissingDates(f.employee,'2026-11'),[]);f.db.close();
});
test('decorated day keeps latest rejected/withdrawn decisions and assigned/actual approver without N+1 reads',()=>{
 const f=fixture(),{ids,a}=f.setup();f.db.exec("create table users(id text,person_id text,name text);create table personnel(id text,name text);create table attendance_days(person_id text,work_date text,result_json text);");f.db.prepare('insert into users values(?,?,?)').run('leader','l','负责人');f.db.prepare('insert into personnel values(?,?)').run('l','实际负责人');
 const decorate=()=>f.service.decorate({dates:[a.date],people:[{personId:'p',days:[{date:a.date,category:'缺卡',punchDetails:[]}]}]}).people[0].days[0];
 const first=f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:'首次'},'first');assert.equal(decorate().offset.items.find(i=>i.requestId).assigneeName,'实际负责人');let d=f.service.detail(f.leader,first.id);f.service.decide(f.leader,first.id,{version:d.version,decisions:[{id:d.items[0].id,decision:'rejected',reason:'不符合'}]},'reject');assert.equal(decorate().offset.items.find(i=>i.requestId).decision,'rejected');assert.equal(decorate().offset.items.find(i=>i.requestId).approverName,'实际负责人');
 f.setNow(Date.parse('2026-11-20T12:00:01+08:00'));const second=f.service.submit(f.employee,{assigneeUserId:'leader',events:[ids[0]],note:'重新申请'},'second');d=f.service.detail(f.employee,second.id);f.service.withdraw(f.employee,second.id,{version:d.version},'withdraw');const latest=decorate().offset.items.find(i=>i.requestId);assert.equal(latest.requestId,second.id);assert.equal(latest.requestStatus,'withdrawn');f.db.prepare('update attendance_offset_requests set created_at=? where id=?').run(f.db.prepare('select created_at from attendance_offset_requests where id=?').get(first.id).created_at,second.id);assert.equal(decorate().offset.items.find(i=>i.requestId).requestStatus,'ambiguous');assert.equal(f.service.effectiveExceptionDates(f.employee,'2026-11').length,0);f.db.close();
});

test('global rule starts October 2026, issues all people automatically and preserves historical versions',()=>{
 const f=fixture();f.setNow(Date.parse('2026-11-20T12:00:00+08:00'));
 const service=createOffsetService({...f.deps,listPeople:()=>['p','l']});
 const body={hours:'4',count:1,cap:3};const saved=service.saveMonthlyRule(f.admin,body,'monthly');
 assert.equal(saved.sourceMonth,'2026-10');assert.equal(saved.usageMonth,'2026-11');assert.deepEqual(service.saveMonthlyRule(f.admin,body,'monthly'),saved);
 assert.equal(service.balance(f.employee).status,'queued');assert.equal(service.settleDue(f.admin).processed,2);assert.equal(service.settleDue(f.admin).processed,0);
 assert.equal(service.balance(f.employee).granted,0);assert.equal(service.balance(f.leader).granted,0);assert.equal(service.balance(f.employee,'2026-10').status,'not_configured');
 const revised=service.saveMonthlyRule(f.admin,{hours:'2',count:2,cap:5},'change');assert.equal(revised.usageMonth,'2026-12');assert.equal(service.trial(f.admin,{personId:'p',sourceMonth:'2026-10'}).ruleId,saved.id);assert.equal(service.trial(f.admin,{personId:'p',sourceMonth:'2026-11'}).ruleId,revised.id);
 assert.equal(service.balance(f.employee).granted,0);f.db.close();
});
test('global rule keeps incomplete months pending and retries after data becomes complete',()=>{
 const f=fixture();f.setNow(Date.parse('2026-12-20T12:00:00+08:00'));let complete=false;
 const service=createOffsetService({...f.deps,listPeople:()=>['p'],readDays:(p,from,to)=>f.deps.readDays(p,from,to).map(d=>({...d,input:{...d.input,covered:complete}}))});
 service.saveMonthlyRule(f.admin,{hours:'4',count:1,cap:3},'monthly');assert.equal(service.settleDue(f.admin).processed,0);assert.equal(service.balance(f.employee).status,'pending_review');assert.equal(service.balance(f.employee).available,null);
 complete=true;f.setNow(Date.parse('2026-12-20T12:06:00+08:00'));assert.equal(service.settleDue(f.admin).processed,2);assert.equal(service.balance(f.employee).granted,0);assert.equal(service.settleDue(f.admin).processed,0);f.db.close();
});
test('same-day DingTalk planned shift recommends only authorized leaders, allows override and rejects stale permission',()=>{
 const f=fixture(),{ids}=f.setup();f.leader.position='班组长';f.admin.position='班组长';
 const date='2026-11-20',point=(type,time)=>({type,planned:Date.parse(date+'T'+time+'+08:00')});
 const day={date,input:{date,covered:true,points:[point('OnDuty','08:00:00'),point('OffDuty','17:00:00')],approvals:[]}};
 const service=createOffsetService({...f.deps,readDays:(p,from,to)=>from===date&&to===date?[p==='admin'?{...day,input:{...day.input,points:[point('OnDuty','20:00:00'),{type:'OffDuty',planned:Date.parse('2026-11-21T08:00:00+08:00')}]}}:day]:f.deps.readDays(p,from,to)});
 let selection=service.approvalCandidates(f.employee);assert.equal(selection.shift,'白班');assert.equal(selection.defaultUserId,'leader');assert.equal(selection.candidates.find(c=>c.id==='admin').recommended,false);assert.equal(selection.candidates.some(c=>c.id==='employee'),false);
 f.db.prepare('delete from attendance_shift_responsibilities').run();const request=service.submit(f.employee,{events:[ids[0]],note:'自选其他审批人',assigneeUserId:'admin'},'selected');assert.equal(service.detail(f.employee,request.id).assignee_user_id,'admin');assert.equal(service.tasks.count(f.admin).count,1);
 f.leader.permissions=[];selection=service.approvalCandidates(f.employee);assert.equal(selection.defaultUserId,null);assert.throws(()=>service.submit(f.employee,{events:[ids[1]],note:'旧名单',assigneeUserId:'leader'},'revoked-selection'),{status:409});assert.equal(service.balance(f.employee).frozen,1);f.db.close();
});
test('existing fixed credits are held for reconciliation and never double granted',()=>{
 const f=fixture();f.setNow(Date.parse('2026-11-20T12:00:00+08:00'));
 const preview=f.service.initializationPreview(f.admin,{personIds:['p']});f.service.initializationConfirm(f.admin,{personIds:['p'],previewHash:preview.previewHash},'fixed');f.service.settleDue(f.admin);
 const service=createOffsetService({...f.deps,listPeople:()=>['p']});service.saveMonthlyRule(f.admin,{hours:'4',count:1,cap:3},'monthly');service.settleDue(f.admin);
 assert.equal(service.balance(f.employee).status,'difference_review');assert.equal(service.balance(f.employee).granted,2);assert.equal(f.db.prepare("select count(*) n from attendance_offset_ledger where kind='grant'").get().n,1);f.db.close();
});
test('ambiguous same-shift leaders and missing schedules never silently choose an approver',()=>{
 const f=fixture();f.setNow(Date.parse('2026-11-20T12:00:00+08:00'));f.leader.position='班组长';f.admin.position='班组长';let covered=true;
 const date='2026-11-20',service=createOffsetService({...f.deps,readDays:()=>[{date,input:{date,covered,points:[{type:'OnDuty',planned:Date.parse(date+'T08:00:00+08:00')},{type:'OffDuty',planned:Date.parse(date+'T17:00:00+08:00')}]}}]});
 let selection=service.approvalCandidates(f.employee);assert.equal(selection.candidates.filter(c=>c.recommended).length,2);assert.equal(selection.defaultUserId,null);
 covered=false;selection=service.approvalCandidates(f.employee);assert.equal(selection.shift,null);assert.equal(selection.candidates.length,2);assert.equal(selection.candidates.some(c=>c.recommended),false);assert.equal(selection.defaultUserId,null);f.db.close();
});
test('monthly mode never resumes legacy fixed grants before a global rule is configured',()=>{
 const f=fixture();f.setNow(Date.parse('2026-11-20T12:00:00+08:00'));const preview=f.service.initializationPreview(f.admin,{personIds:['p']});f.service.initializationConfirm(f.admin,{personIds:['p'],previewHash:preview.previewHash},'old');
 const service=createOffsetService({...f.deps,allowLegacySettlement:false});assert.equal(service.settleDue(f.admin).processed,0);assert.equal(f.db.prepare('select count(*) n from attendance_offset_accounts').get().n,0);f.db.close();
});
test('identical monthly saves do not create a future revision; state exposes active October rule and queued people',()=>{
 const f=fixture();f.setNow(Date.parse('2026-11-13T18:00:00+08:00'));const service=createOffsetService({...f.deps,listPeople:()=>['p','l']});
 const body={hours:'2',count:1,cap:2},first=service.saveMonthlyRule(f.admin,body,'first');
 const repeated=service.saveMonthlyRule(f.admin,body,'again');assert.equal(repeated.unchanged,true);assert.equal(repeated.id,first.id);assert.equal(repeated.usageMonth,'2026-11');assert.equal(service.monthlyRules(f.admin).length,1);
 let state=service.state(f.admin);assert.equal(state.currentSourceMonth,'2026-10');assert.equal(state.currentMonth,'2026-11');assert.equal(state.activeRule.id,first.id);assert.equal(state.queuedAccounts,2);
 service.settleDue(f.admin);state=service.state(f.admin);assert.equal(state.queuedAccounts,0);assert.equal(state.issuedAccounts,2);assert.equal(state.pendingAccounts,0);f.db.close();
});
test('read-only accumulation rule uses displayed source month without management permission or ledger writes',()=>{
 const f=fixture();f.setNow(Date.parse('2026-11-13T18:00:00+08:00'));
 f.service.saveMonthlyRule(f.admin,{hours:'2',count:1,cap:3},'oct-rule');
 f.service.saveMonthlyRule(f.admin,{hours:'2.5',count:2,cap:4},'nov-rule');
 const reader={...f.employee,permissions:['attendance.read']};
 const counts=()=>['attendance_offset_accounts','attendance_offset_ledger','attendance_offset_assessments','attendance_offset_audit'].map(t=>f.db.prepare('select count(*) n from '+t).get().n),before=counts();
 assert.deepEqual(f.service.exchangeRuleForSource(reader,'2026-10'),{sourceMonth:'2026-10',usageMonth:'2026-11',hours:2,count:1,cap:3});
 assert.deepEqual(f.service.exchangeRuleForSource(reader,'2026-11'),{sourceMonth:'2026-11',usageMonth:'2026-12',hours:2.5,count:2,cap:4});
 assert.equal(f.service.exchangeRuleForSource(reader,'2026-09'),null);assert.deepEqual(counts(),before);
 assert.throws(()=>f.service.exchangeRuleForSource(f.employee,'2026-11'),{status:403});assert.throws(()=>f.service.exchangeRuleForSource(null,'2026-11'),{status:401});f.db.close();
});
