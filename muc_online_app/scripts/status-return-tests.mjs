import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {today,GROUPS} from '../capability-core.mjs';
import {createCapabilityService} from '../capability-service.mjs';
import {seedCapabilityFixture} from './capability-fixture.mjs';

const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'status-return-'));
Object.assign(process.env,{NODE_ENV:'test',MUC_NO_LISTEN:'1',DATABASE_URL:'',DB_PATH:path.join(tmp,'test.sqlite'),UPLOAD_DIR:path.join(tmp,'uploads')});
const {db}=await import('../server.mjs');
try{
  const {workspace}=await seedCapabilityFixture(db);
  const service=createCapabilityService({db,hasRbac:(a,p)=>!a.denied?.includes(p),personnelAccess:{allows:(a,m,id)=>!a.ids||a.ids.includes(id)},audit:()=>{},superAccountId:'tester'});
  service.init();service.init();service.syncMaster();
  const actor={id:'tester'},manager={id:'manager',denied:['capability.allocation.submit']};
  const snap=()=>service.snapshot(actor,workspace);
  const command=(operation,payload={},a=actor)=>service.command(a,workspace,operation,{requestId:crypto.randomUUID(),revision:service.revision(),...payload});
  const state=id=>snap().states.find(s=>s.personId===id);
  const person=snap().people.find(p=>p.administrativeGroup==='一组'),id=person.id;
  const adminBefore=db.prepare('select administrative_team_id,personnel_group_id,department_id from personnel where id=?').get(id);
  command('createDeploymentLocation',{name:'返回测试地点'});
  command('createOtherStatusOption',{name:'返回测试其他'});
  const location=snap().deploymentLocations.find(l=>l.name==='返回测试地点'),other=snap().otherStatusOptions.find(o=>o.name==='返回测试其他');
  const data=(kind,target)=>({personId:id,kind,startDate:today(),label:'返回测试培训',deploymentLocationId:location.id,otherStatusOptionId:other.id,returnTarget:target});
  const record=()=>db.prepare("select * from capability_status_records where person_id=? and phase='ACTIVE' and data_status='active'").get(id);
  const yesterday=new Date(Date.parse(today()+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  const forceDue=r=>db.prepare('update capability_status_records set start_date=?,end_date=? where id=?').run(yesterday,yesterday,r.id);
  let checks=0;
  for(const kind of ['DEPLOYED','TRAINING','OTHER'])for(const target of [null,...GROUPS,'SPECIAL','WAITING']){
    command('status',data(kind,target));let r=record();assert.equal(r.return_target,target);
    service.schedule();assert.equal(state(id).status,kind); // Open ended remains active.
    db.prepare('update capability_status_records set end_date=? where id=?').run(today(),r.id);
    service.schedule();assert.equal(state(id).status,kind); // End date is inclusive.
    if(checks%2===0){forceDue(r);service.schedule();}else command('end',{recordId:r.id});
    assert.equal(state(id).status,'ON_DUTY');
    assert.equal(state(id).workingGroup,GROUPS.includes(target)?target:target===null?'一组':null);
    if(target==='SPECIAL'||target==='WAITING')assert.equal(state(id).allocationPool,target);
    const support=db.prepare('select * from capability_supports where person_id=? and ended_at is null').get(id);
    assert.equal(!!support,GROUPS.includes(target)&&target!=='一组');
    const n=db.prepare("select count(*) n from capability_history where person_id=? and type='PERSON_STATUS_ENDED'").get(id).n;
    service.schedule();assert.equal(db.prepare("select count(*) n from capability_history where person_id=? and type='PERSON_STATUS_ENDED'").get(id).n,n);
    assert.deepEqual(db.prepare('select administrative_team_id,personnel_group_id,department_id from personnel where id=?').get(id),adminBefore);
    checks++;
  }
  assert.throws(()=>command('status',data('TRAINING','invalid')),e=>e.status===400);
  assert.throws(()=>command('status',data('TRAINING','二组'),manager),e=>e.status===403);
  const restricted={id:'limited',ids:[id]};
  assert.throws(()=>command('status',data('TRAINING','二组'),restricted),e=>e.status===403);
  command('status',data('TRAINING',null),manager);command('end',{recordId:record().id},manager);
  command('status',data('TRAINING','二组'));let r=record();
  const update={recordId:r.id,startDate:r.start_date,endDate:'',label:r.label,remark:'仅修改备注'};
  command('updateStatus',update,manager);assert.equal(record().return_target,'二组');
  assert.throws(()=>command('updateStatus',{...update,returnTarget:null},manager),e=>e.status===403);
  assert.equal(record().return_target,'二组');
  const auditsBefore=db.prepare("select count(*) n from capability_history where type='STATUS_RETURN_TARGET_CHANGED'").get().n;
  assert.throws(()=>command('updateStatus',{...update,startDate:'2099-01-01',returnTarget:'SPECIAL'}),e=>e.status===400);
  assert.equal(record().return_target,'二组');
  assert.equal(db.prepare("select count(*) n from capability_history where type='STATUS_RETURN_TARGET_CHANGED'").get().n,auditsBefore);
  command('updateStatus',{...update,returnTarget:'SPECIAL'});
  assert.equal(record().return_target,'SPECIAL');command('end',{recordId:r.id},manager);assert.equal(state(id).allocationPool,'SPECIAL');
  // Invalidated targets fall back; current administrative affiliation is authoritative.
  command('status',data('TRAINING','二组'));r=record();
  const team2=db.prepare("select * from organization_units where code='TEAM-LINE-2'").get();
  db.prepare("update organization_units set status='inactive' where id=?").run(team2.id);
  forceDue(r);service.schedule();assert.equal(state(id).workingGroup,'一组');
  assert.match(JSON.parse(db.prepare("select payload from capability_history where person_id=? and type='PERSON_STATUS_ENDED' order by occurred_at desc,id desc").all(id).find(h=>JSON.parse(h.payload).recordId===r.id).payload).fallbackReason,/失效/);
  db.prepare("update organization_units set status='active' where id=?").run(team2.id);
  command('status',data('TRAINING',null));r=record();
  db.prepare('update personnel set administrative_team_id=? where id=?').run(team2.id,id);service.syncMaster();
  forceDue(r);service.schedule();assert.equal(state(id).workingGroup,'二组');
  db.prepare('update personnel set administrative_team_id=? where id=?').run(adminBefore.administrative_team_id,id);service.syncMaster();
  // A newer live status must not be overwritten by stale expiry.
  command('status',data('TRAINING','四组'));r=record();
  db.prepare('update capability_current_states set record_id=? where person_id=?').run('newer-record',id);
  forceDue(r);service.schedule();assert.equal(state(id).recordId,'newer-record');assert.equal(state(id).status,'TRAINING');
  db.prepare('update capability_current_states set record_id=? where person_id=?').run(r.id,id);
  db.prepare("update capability_status_records set phase='ACTIVE',end_date=? where id=?").run(today(),r.id);command('end',{recordId:r.id});
  // Planned cancellation and safe deletion do not apply the configured placement.
  command('status',{...data('TRAINING','三组'),startDate:'2099-01-01'});
  r=db.prepare("select * from capability_status_records where person_id=? and phase='PLANNED'").get(id);
  const prior=state(id);command('end',{recordId:r.id});assert.equal(state(id).workingGroup,prior.workingGroup);
  command('status',data('TRAINING','三组'));r=record();command('deleteStatus',{recordId:r.id,reason:'测试删除'});assert.equal(state(id).workingGroup,'一组');
  // Handover preserves the outgoing person's target; incoming does not inherit it.
  command('status',data('DEPLOYED','WAITING'));const outgoing=record(),incoming=snap().people.find(p=>p.id!==id&&state(p.id).status==='ON_DUTY');
  command('replaceDeployment',{personId:incoming.id,deploymentLocationId:location.id,startDate:today(),replacesRecordId:outgoing.id});
  assert.equal(db.prepare("select return_target from capability_status_records where person_id=? and phase='ACTIVE'").get(incoming.id).return_target,null);
  forceDue(outgoing);service.schedule();assert.equal(state(id).allocationPool,'WAITING');assert.equal(state(id).workingGroup,null);
  // Duplicate and stale requests do not create extra placements or audits.
  const incomingRecord=db.prepare("select * from capability_status_records where person_id=? and phase='ACTIVE'").get(incoming.id);
  const request={recordId:incomingRecord.id,requestId:crypto.randomUUID(),revision:service.revision()};
  const result=service.command(actor,workspace,'end',request);assert.deepEqual(service.command(actor,workspace,'end',request),result);
  assert.throws(()=>command('status',{...data('TRAINING',null),revision:0}),e=>e.status===409);
  // With no usable administrative destination, completion is safe and traceable.
  command('status',data('TRAINING',null));r=record();
  db.prepare("update organization_units set status='inactive' where id=?").run(adminBefore.administrative_team_id);
  forceDue(r);service.schedule();
  const waiting=db.prepare('select * from capability_current_states where person_id=?').get(id);
  assert.equal(waiting.status,'ON_DUTY');assert.equal(waiting.working_group,null);assert.equal(waiting.allocation_pool,'WAITING');
  db.prepare("update organization_units set status='active' where id=?").run(adminBefore.administrative_team_id);service.syncMaster();
  // Even a valid target is ignored after a move to a different workspace.
  command('status',data('TRAINING','二组'));r=record();
  const at=new Date().toISOString(),departmentId='return-test-department';
  db.prepare("insert into organization_units(id,code,name,unit_type,parent_id,status,created_at,updated_at) values(?,?,?,'department',null,'active',?,?)").run(departmentId,'DEPT-RETURN-TEST','返回测试部门',at,at);
  db.prepare('update personnel set department_id=? where id=?').run(departmentId,id);service.syncMaster();
  forceDue(r);service.schedule();
  const moved=db.prepare('select * from capability_current_states where person_id=?').get(id);
  assert.equal(moved.workspace,'department:'+departmentId);assert.equal(moved.working_group,null);assert.equal(moved.allocation_pool,'WAITING');
  db.prepare('update personnel set department_id=? where id=?').run(adminBefore.department_id,id);service.syncMaster();
  console.log(JSON.stringify({ok:true,returnCombinations:checks,tests:'inclusive expiry, open ended, manual, all destinations, support, immutable organization, permissions, partial scope, preserve settings, fallback, administrative changes, newer state, cancel, delete, handover, concurrency, idempotency',database:tmp},null,2));
}finally{db.close();}
