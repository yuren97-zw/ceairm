import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {GROUPS} from '../capability-core.mjs';
import {seedCapabilityFixture} from './capability-fixture.mjs';

const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'capability-scheduling-'));
Object.assign(process.env,{NODE_ENV:'test',MUC_NO_LISTEN:'1',DATABASE_URL:'',DB_PATH:path.join(temporary,'test.sqlite'),UPLOAD_DIR:path.join(temporary,'uploads')});
const {db,capabilityService:service}=await import('../server.mjs');
const {workspace}=await seedCapabilityFixture(db);
service.syncMaster();
const actor={id:'54002010',name:'超级管理员'};
const snapshot=()=>service.snapshot(actor,workspace);
const command=(operation,payload={})=>service.command(actor,workspace,operation,{operation,revision:snapshot().revision,requestId:crypto.randomUUID(),...payload});
const future=()=>new Date(Date.now()+60*60*1000).toISOString();
const makePlan=()=>{
  const before=snapshot(),person=before.people.find(p=>GROUPS.includes(before.states.find(s=>s.personId===p.id)?.workingGroup));
  const target=before.states.map(s=>({...s}));
  const moved=target.find(s=>s.personId===person.id);
  const destination=GROUPS.find(group=>group!==moved.workingGroup);
  moved.workingGroup=destination;moved.index=Math.max(-1,...target.filter(s=>s.workingGroup===destination).map(s=>s.index))+1;
  return {before,person,target,destination};
};
const due=id=>db.prepare("update capability_scenarios set effective_at='2000-01-01T00:00:00.000Z' where id=?").run(id);

try{
  const legacyId=crypto.randomUUID(),legacySnapshot=snapshot();
  db.prepare('insert into capability_scenarios(id,workspace,name,base_revision,payload,created_by,updated_at) values(?,?,?,?,?,?,?)').run(legacyId,workspace,'旧版方案',legacySnapshot.revision,JSON.stringify({states:legacySnapshot.states}),actor.id,new Date().toISOString());
  assert.deepEqual(snapshot().scenarios.find(s=>s.id===legacyId).baseline,[],'旧版方案没有基准时仍应正常显示');
  db.prepare("update capability_scenarios set schedule_status='pending',effective_at='2000-01-01T00:00:00.000Z' where id=?").run(legacyId);
  service.schedule();
  assert.equal(snapshot().scenarios.find(s=>s.id===legacyId).schedule_status,'conflict','没有基准的方案不得自动应用');
  let {before,person,target,destination}=makePlan();
  command('saveScenario',{name:'自动生效',baseRevision:before.revision,states:target,effectiveAt:future()});
  let scenario=snapshot().scenarios.find(s=>s.name==='自动生效');
  assert.equal(scenario.schedule_status,'pending');
  command('config',{config:snapshot().config}); // An unrelated revision must not invalidate the saved personnel intent.
  const unrelated=snapshot().people.find(candidate=>candidate.id!==person.id&&snapshot().states.find(state=>state.personId===candidate.id)?.status==='ON_DUTY');
  command('status',{personId:unrelated.id,kind:'TRAINING',label:'无关人员状态',startDate:new Date().toISOString().slice(0,10)});
  due(scenario.id);service.schedule();
  assert.equal(snapshot().scenarios.find(s=>s.id===scenario.id).schedule_status,'applied');
  assert.equal(snapshot().states.find(s=>s.personId===person.id).workingGroup,destination);
  const appliedHistory=snapshot().history.filter(h=>h.type==='SCENARIO_SCHEDULED_APPLIED').length;
  service.schedule();
  assert.equal(snapshot().history.filter(h=>h.type==='SCENARIO_SCHEDULED_APPLIED').length,appliedHistory);

  ({before,person,target,destination}=makePlan());
  command('saveScenario',{name:'覆盖实时调配',baseRevision:before.revision,states:target,effectiveAt:future()});
  scenario=snapshot().scenarios.find(s=>s.name==='覆盖实时调配');
  assert.equal(scenario.payload.intents.length,1);
  const conflictGroup=GROUPS.find(group=>group!==destination&&group!==before.states.find(s=>s.personId===person.id).workingGroup);
  command('move',{personId:person.id,targetGroup:conflictGroup});
  due(scenario.id);service.schedule();
  assert.equal(snapshot().scenarios.find(s=>s.id===scenario.id).schedule_status,'applied');
  assert.equal(snapshot().states.find(s=>s.personId===person.id).workingGroup,destination,'方案应覆盖保存后的实时班组变化');

  before=snapshot();
  const candidates=before.people.filter(p=>before.states.find(s=>s.personId===p.id)?.status==='ON_DUTY').slice(0,2),originalSecond=before.states.find(s=>s.personId===candidates[1].id),conflictTarget=before.states.map(s=>({...s}));
  for(const [offset,candidate] of candidates.entries()){const state=conflictTarget.find(s=>s.personId===candidate.id);state.workingGroup=GROUPS.find(group=>group!==state.workingGroup);state.index=20+offset;}
  command('saveScenario',{name:'状态冲突整批暂停',baseRevision:before.revision,states:conflictTarget,effectiveAt:future()});
  scenario=snapshot().scenarios.find(s=>s.name==='状态冲突整批暂停');
  command('status',{personId:candidates[0].id,kind:'TRAINING',label:'定时方案冲突测试',startDate:new Date().toISOString().slice(0,10)});
  due(scenario.id);service.schedule();
  const conflict=snapshot().scenarios.find(s=>s.id===scenario.id);
  assert.equal(conflict.schedule_status,'conflict');assert.equal(conflict.conflicts[0].personId,candidates[0].id);assert.equal(conflict.conflicts[0].status,'TRAINING');assert.ok(conflict.conflicts[0].recordId);
  assert.equal(snapshot().states.find(s=>s.personId===candidates[1].id).workingGroup,originalSecond.workingGroup,'任一状态冲突必须整批不执行');

  before=snapshot();person=before.people.find(p=>before.states.find(s=>s.personId===p.id)?.status==='ON_DUTY');
  const source=before.states.find(s=>s.personId===person.id).workingGroup,destinationOne=GROUPS.find(group=>group!==source),destinationTwo=GROUPS.find(group=>group!==source&&group!==destinationOne),firstTarget=before.states.map(s=>({...s})),secondTarget=before.states.map(s=>({...s}));
  Object.assign(firstTarget.find(s=>s.personId===person.id),{workingGroup:destinationOne,index:0});Object.assign(secondTarget.find(s=>s.personId===person.id),{workingGroup:destinationTwo,index:0});
  command('saveScenario',{name:'重叠方案一',baseRevision:before.revision,states:firstTarget,effectiveAt:future()});command('saveScenario',{name:'重叠方案二',baseRevision:before.revision,states:secondTarget,effectiveAt:future()});
  const overlapOne=snapshot().scenarios.find(s=>s.name==='重叠方案一'),overlapTwo=snapshot().scenarios.find(s=>s.name==='重叠方案二');
  db.prepare("update capability_scenarios set effective_at='2000-01-01T00:00:00.000Z',updated_at=? where id=?").run('2000-01-01T00:00:01.000Z',overlapOne.id);db.prepare("update capability_scenarios set effective_at='2000-01-01T00:00:00.000Z',updated_at=? where id=?").run('2000-01-01T00:00:02.000Z',overlapTwo.id);
  service.schedule();assert.equal(snapshot().states.find(s=>s.personId===person.id).workingGroup,destinationTwo,'相同生效时间时最近保存的方案应后执行并覆盖');

  ({before,target}=makePlan());
  command('saveScenario',{name:'取消改期',baseRevision:before.revision,states:target,effectiveAt:future()});
  scenario=snapshot().scenarios.find(s=>s.name==='取消改期');
  command('cancelScenario',{scenarioId:scenario.id});
  assert.equal(snapshot().scenarios.find(s=>s.id===scenario.id).schedule_status,'cancelled');
  command('rescheduleScenario',{scenarioId:scenario.id,effectiveAt:future()});
  assert.equal(snapshot().scenarios.find(s=>s.id===scenario.id).schedule_status,'pending');
  assert.throws(()=>command('deleteScenario',{scenarioId:scenario.id}),/先取消/);
  db.prepare("update users set status='disabled' where id='54002010'").run();
  due(scenario.id);service.schedule();
  assert.equal(snapshot().scenarios.find(s=>s.id===scenario.id).schedule_status,'conflict');
  assert.match(snapshot().scenarios.find(s=>s.id===scenario.id).conflicts[0].reason,/权限/);
  db.prepare("update users set status='active' where id='54002010'").run();
  ({before,target}=makePlan());
  command('saveScenario',{name:'提前手动应用',baseRevision:before.revision,states:target,effectiveAt:future()});
  scenario=snapshot().scenarios.find(s=>s.name==='提前手动应用');
  command('applyScenario',{states:target,baseRevision:before.revision,sourceScenarioId:scenario.id});
  assert.equal(snapshot().scenarios.find(s=>s.id===scenario.id).schedule_status,'applied');
  due(scenario.id);service.schedule();
  assert.equal(snapshot().scenarios.find(s=>s.id===scenario.id).schedule_status,'applied');
  console.log('通过：定时整批生效、无关版本变化、重复调度、冲突暂停、取消、改期、权限复核与提前应用。');
}finally{db.close();}
