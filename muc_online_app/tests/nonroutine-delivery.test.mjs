import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {NONROUTINE_ADJUSTMENTS_SCHEMA,deliverNonroutineRecognition,mapRecognitionAssignments,projectRecognitionAllocations} from '../nonroutine-delivery.mjs';
import {NONROUTINE_ROLE_RESULTS_SCHEMA} from '../nonroutine-role-results.mjs';
const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const context=vm.createContext({maintenanceBaseHours:(_type,owner)=>owner._nonroutineEstimateBase,maintenanceNonroutineEffectivePolicy:()=>null,
  maintenanceNonroutineRoleOrder:['主做','检验','辅助'],normalizeMaintenanceSubtaskRole:role=>role,
  maintenanceRatioForOwner:(_type,owner,role)=>owner._nonroutinePolicy.ratios[role],maintenanceRatioRuleForOwner:(_type,owner,role)=>owner._nonroutinePolicy.ratios[role]});
const start=source.indexOf('function maintenanceCalculatedHours(');vm.runInContext(source.slice(start,source.indexOf('\n}\n',start)+2),context);
function fixture(t,status='已提报'){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(`create table maintenance_assignments(id text,owner_type text,owner_id text,person_id text,user_name text,team text,role text,status text,assigned_at text);
    create table maintenance_nonroutine_assessments(subtask_id text,review_case_id text,effective_hours real);
    insert into maintenance_nonroutine_assessments values('task','case',null);
    create table maintenance_hour_results(id text primary key,owner_type text,owner_id text,flight_id text,assignment_id text,person_id text,user_name text,team text,role text,source text,hours real,adjusted_hours real,status text,confirmed_by text,confirmed_at text,created_at text,updated_at text,unique(owner_type,owner_id,assignment_id));`);
  db.exec("create table maintenance_nonroutine_review_channels(id text primary key);insert into maintenance_nonroutine_review_channels values('channel');create table maintenance_nonroutine_review_cases(id text primary key);insert into maintenance_nonroutine_review_cases values('case');");
  db.exec(NONROUTINE_ADJUSTMENTS_SCHEMA);
  db.exec(NONROUTINE_ROLE_RESULTS_SCHEMA);
  const participants=[{personId:'a',role:'主做'},{personId:'b',role:'主做'},{personId:'a',role:'检验'}];
  participants.forEach((person,index)=>db.prepare("insert into maintenance_assignments values(?,'subtask','task',?,?,?,?,?,'t')").run(`assignment-${index}`,person.personId,person.personId,'team',person.role,status));
  let counter=0;
  const input={db,item:{id:'case',participants_json:JSON.stringify(participants)},final:{approved_revision:1,finalized_by:'finalizer',participants_json:JSON.stringify(participants),decision_json:JSON.stringify({recognizedHours:2.1}),policy_json:JSON.stringify({strategy:'EQUAL'})},
    channel:{id:'channel'},flight:{id:'flight',status},subtask:{id:'task',category:'三方附加'},period:{month:'2026-09',state:'OPEN',revision:2},
    clock:()=> '2026-11-09T00:00:00Z',randomId:prefix=>`${prefix}-${++counter}`,allocate:(owner,rows)=>context.maintenanceCalculatedHours('subtask',owner,rows)};
  return {db,input,deliver:()=>deliverNonroutineRecognition(input)};
}
test('real original allocator posts exact unique-person budgets in the current stage, without changing assignment facts',t=>{
  for(const status of ['已提报','待复核']){
    const f=fixture(t,status);const before=f.db.prepare('select * from maintenance_assignments').all();
    const result=f.deliver();assert.equal(result.state,'MERGED_CLOSED');assert.equal(result.detail.resultStatus,status);
    const rows=f.db.prepare('select * from maintenance_hour_results').all();assert.equal(rows.length,3);
    assert.equal(Math.round(rows.reduce((sum,row)=>sum+row.hours,0)*100),210);
    assert.equal(rows.filter(row=>row.person_id==='a').reduce((sum,row)=>sum+row.hours,0),1.05);
    assert.equal(f.db.prepare('select effective_hours from maintenance_nonroutine_assessments').get().effective_hours,2.1);
    assert.deepEqual(f.db.prepare('select * from maintenance_assignments').all(),before);
    assert.equal(f.deliver().detail.code,'EXISTING_RESULT_REQUIRES_RECONCILIATION');
  }
});
test('unknown or closed periods, changed people and confirmed opportunities cannot take the normal-result path',t=>{
  const f=fixture(t);
  for(const state of ['UNKNOWN','CLOSED']){f.input.period.state=state;assert.equal(f.deliver().state,'NEEDS_ATTENTION');}
  f.input.period.state='OPEN';f.db.prepare("update maintenance_assignments set person_id='outsider' where id='assignment-0'").run();
  assert.equal(f.deliver().detail.code,'PARTICIPANTS_REQUIRE_VERIFICATION');
  assert.equal(f.db.prepare('select count(*) n from maintenance_hour_results').get().n,0);
});

test('confirmed recognition appends immutable adjustment facts and a unified read without touching original results or assignments',t=>{
  const f=fixture(t,'已确认');const before=f.db.prepare('select * from maintenance_assignments').all();
  const result=f.deliver();assert.equal(result.state,'ADJUSTED_CLOSED');
  assert.equal(f.db.prepare('select count(*) n from maintenance_hour_results').get().n,0);
  const adjustments=f.db.prepare('select * from maintenance_nonroutine_hour_adjustments').all();assert.equal(adjustments.length,3);
  assert.equal(Math.round(adjustments.reduce((sum,row)=>sum+row.hours,0)*100),210);
  assert.deepEqual(f.db.prepare('select * from maintenance_assignments').all(),before);
  assert.equal(f.db.prepare('select count(*) n from maintenance_effective_hour_results').get().n,3);
  assert.equal(f.deliver().detail.code,'EXISTING_RESULT_REQUIRES_RECONCILIATION');
  const sql=fs.readFileSync(new URL('../migrations/040_nonroutine_adjustments.sql',import.meta.url),'utf8');f.db.exec(sql);f.db.exec(sql);
  assert.equal(f.db.prepare('select count(*) n from maintenance_effective_hour_results').get().n,3);
});
test('a failed result write rolls back the original result rows and the effective source together',t=>{
  const f=fixture(t);f.db.exec("create trigger fail_delivery before insert on maintenance_hour_results when new.assignment_id='assignment-2' begin select raise(abort,'injected delivery failure'); end");
  f.db.exec('begin immediate');assert.throws(()=>f.deliver(),/injected/);f.db.exec('rollback');
  assert.equal(f.db.prepare('select count(*) n from maintenance_hour_results').get().n,0);
  assert.equal(f.db.prepare('select effective_hours from maintenance_nonroutine_assessments').get().effective_hours,null);
});

test('verified roles map deterministically onto original identities without editing actual roles in either delivery path',t=>{
  for(const status of ['已提报','待复核','已确认']){
    const f=fixture(t,status);const original=f.db.prepare('select * from maintenance_assignments').all();
    const participants=[{personId:'a',role:'主做'},{personId:'a',role:'辅助'},{personId:'b',role:'检验'}];
    f.input.final.participants_json=JSON.stringify(participants);
    f.input.final.policy_json=JSON.stringify({strategy:'ROLE_COMBINATION',valid:true,ratios:{主做:0.6,检验:0.3,辅助:0.1}});
    const result=f.deliver();assert.equal(result.state,status==='已确认'?'ADJUSTED_CLOSED':'MERGED_CLOSED');
    const rows=f.db.prepare('select * from maintenance_effective_hour_results').all();
    assert.deepEqual(rows.map(row=>[row.role,row.hours]).sort(),[['主做',1.26],['检验',0.63],['辅助',0.21]].sort());
    assert.deepEqual(f.db.prepare('select * from maintenance_assignments').all(),original);
    const mapped=mapRecognitionAssignments([...original].reverse(),[...participants].reverse());
    assert.deepEqual(mapped.map(row=>[row.id,row.role]).sort(),rows.map(row=>[row.assignment_id,row.role]).sort());
    assert.equal(mapRecognitionAssignments(original,[...participants,{personId:'a',role:'检验'}]),null);
  }
});
test('role-count projection uses the original allocator and real source lineage without altering participants',t=>{
  const f=fixture(t),original=f.db.prepare('select * from maintenance_assignments order by id').all(),changes=f.db.prepare('select total_changes() n').get().n;
  const desired=[{personId:'a',role:'主做'},{personId:'a',role:'检验'},{personId:'a',role:'辅助'},{personId:'b',role:'主做'}];
  const projected=projectRecognitionAllocations(original,desired);assert.equal(projected.length,4);assert.equal(new Set(projected.map(row=>row.id)).size,4);
  assert.ok(projected.every(row=>original.some(source=>source.id===row.sourceAssignmentId&&source.person_id===row.person_id)));
  assert.deepEqual(projectRecognitionAllocations([...original].reverse(),[...desired].reverse()),projected);
  const calculated=f.input.allocate({_nonroutineEstimateBase:2.1,_nonroutinePolicy:{strategy:'ROLE_COMBINATION',valid:true,ratios:{主做:0.6,检验:0.3,辅助:0.1}}},projected);
  assert.equal(Math.round([...calculated.values()].reduce((sum,value)=>sum+value,0)*100),210);
  assert.deepEqual(projected.map(row=>[row.person_id,row.role,calculated.get(row.id)]),[['a','主做',0.63],['a','检验',0.63],['a','辅助',0.21],['b','主做',0.63]]);
  assert.equal(f.db.prepare('select total_changes() n').get().n,changes);assert.deepEqual(f.db.prepare('select * from maintenance_assignments order by id').all(),original);
  f.input.final.participants_json=JSON.stringify(desired);assert.equal(f.deliver().state,'MERGED_CLOSED');assert.equal(f.db.prepare('select count(*) n from maintenance_effective_hour_results').get().n,4);
});
test('collapsed and equal role projections retain all original people, reject duplicate roles and never invent an outsider',t=>{
  const f=fixture(t),original=f.db.prepare('select * from maintenance_assignments order by id').all();
  const desired=[{personId:'a',role:'辅助'},{personId:'b',role:'检验'}],projected=projectRecognitionAllocations(original,desired);
  assert.equal(projected.length,2);const hours=f.input.allocate({_nonroutineEstimateBase:2.1,_nonroutinePolicy:{strategy:'EQUAL'}},projected);assert.deepEqual([...hours.values()],[1.05,1.05]);
  assert.equal(projectRecognitionAllocations(original,desired.slice(0,1)),null);assert.equal(projectRecognitionAllocations(original,[...desired,desired[0]]),null);assert.equal(projectRecognitionAllocations(original,[...desired,{personId:'outsider',role:'主做'}]),null);
});
test('confirmed role expansion and collapse post distinct role facts against real unchanged assignments exactly once',t=>{
  for(const participants of [
    [{personId:'a',role:'主做'},{personId:'a',role:'检验'},{personId:'a',role:'辅助'},{personId:'b',role:'主做'}],
    [{personId:'a',role:'辅助'},{personId:'b',role:'检验'}]
  ]){
    const f=fixture(t,'已确认'),before=f.db.prepare('select * from maintenance_assignments order by id').all();f.input.final.participants_json=JSON.stringify(participants);
    const delivered=f.deliver();assert.equal(delivered.state,'ADJUSTED_CLOSED');
    const facts=f.db.prepare('select * from maintenance_nonroutine_hour_adjustments order by person_id,role').all();assert.equal(facts.length,participants.length);
    assert.ok(facts.every(row=>before.some(source=>source.id===row.assignment_id&&source.person_id===row.person_id)));assert.ok(facts.every(row=>!row.assignment_id.startsWith('nrpreview_')));
    assert.equal(Math.round(facts.reduce((sum,row)=>sum+row.hours,0)*100),210);assert.equal(new Set(facts.map(row=>`${row.person_id}:${row.role}`)).size,participants.length);
    assert.deepEqual(f.db.prepare('select * from maintenance_assignments order by id').all(),before);assert.equal(f.db.prepare('select count(*) n from maintenance_hour_results').get().n,0);
    assert.equal(f.deliver().detail.code,'EXISTING_RESULT_REQUIRES_RECONCILIATION');assert.deepEqual(f.db.prepare('select * from maintenance_nonroutine_hour_adjustments order by person_id,role').all(),facts);
  }
});
test('audit display keeps actual construction and recognized accounting roles distinct for the same real assignment',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const ui=vm.createContext({escapeHtml:value=>String(value??'').replace(/</g,'&lt;'),maintenanceHoursLabel:value=>String(value)});
  for(const name of ['maintenanceNonroutineStandardLabel','maintenanceNonroutineAuditHtml']){const start=app.indexOf(`function ${name}(`);vm.runInContext(app.slice(start,app.indexOf('\n}\n',start)+2),ui);}
  const html=ui.maintenanceNonroutineAuditHtml({hasResults:true,actualHours:1.5,people:[{userName:'<人员>',assignmentRole:'主做',role:'检验',assignmentStatus:'已确认',resultHours:1.5,finalHours:1.5}]});
  assert.match(html,/原施工 主做 · 核算 检验/);assert.match(html,/&lt;人员>/);assert.match(html,/最终 1.5h/);
});
test('startup category normalization preserves all eight V10 categories and recognized facts',t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('create table maintenance_subtasks(id text,category text,standard_hours real,status text)');
  const categories=['工卡指令','单项工作','拖机','三方附加','试车','其他','人工除冰','联合除冰'];
  for(const [index,category] of categories.entries())db.prepare('insert into maintenance_subtasks values(?,?,?,?)').run(String(index),category,index/10,'已确认');
  const before=db.prepare('select * from maintenance_subtasks order by id').all(),start=source.indexOf('function normalizeMaintenanceNonroutineCategories('),vmContext=vm.createContext({db,NONROUTINE_CATEGORY_STRATEGIES:Object.fromEntries(categories.map(category=>[category,{}]))});
  vm.runInContext(source.slice(start,source.indexOf('\n}\n',start)+2),vmContext);vmContext.normalizeMaintenanceNonroutineCategories();vmContext.normalizeMaintenanceNonroutineCategories();
  assert.deepEqual(db.prepare('select * from maintenance_subtasks order by id').all(),before);
});
test('normal-stage expanded and collapsed accounting roles share real parents, count once, cascade and migrate without loss',t=>{
  for(const status of ['已提报','待复核'])for(const participants of [
    [{personId:'a',role:'主做'},{personId:'a',role:'检验'},{personId:'a',role:'辅助'},{personId:'b',role:'主做'}],
    [{personId:'a',role:'辅助'},{personId:'b',role:'检验'}]
  ]){
    const f=fixture(t,status),before=f.db.prepare('select * from maintenance_assignments order by id').all();f.input.final.participants_json=JSON.stringify(participants);
    if(participants.length===4)f.input.final.policy_json=JSON.stringify({strategy:'ROLE_COMBINATION',valid:true,ratios:{主做:0.6,检验:0.3,辅助:0.1}});
    assert.equal(f.deliver().state,'MERGED_CLOSED');
    const parents=f.db.prepare('select * from maintenance_hour_results').all(),children=f.db.prepare('select * from maintenance_nonroutine_role_results').all(),effective=f.db.prepare('select * from maintenance_effective_hour_results').all();
    assert.equal(children.length,participants.length);assert.equal(effective.length,children.length);assert.equal(Math.round(effective.reduce((sum,row)=>sum+row.hours,0)*100),210);
    assert.ok(parents.every(row=>before.some(actual=>actual.id===row.assignment_id&&actual.person_id===row.person_id)));assert.equal(new Set(parents.map(row=>row.assignment_id)).size,parents.length);
    assert.ok(children.every(row=>parents.some(parent=>parent.id===row.result_id&&parent.assignment_id===row.source_assignment_id)));
    assert.deepEqual(f.db.prepare('select * from maintenance_assignments order by id').all(),before);
    const migration=fs.readFileSync(new URL('../migrations/045_nonroutine_role_results.sql',import.meta.url),'utf8');f.db.exec(migration);f.db.exec(migration);assert.equal(f.db.prepare('select count(*) n from maintenance_effective_hour_results').get().n,children.length);
    f.db.prepare("update maintenance_hour_results set status='待复核'").run();assert.ok(f.db.prepare('select status from maintenance_effective_hour_results').all().every(row=>row.status==='待复核'));
    f.db.exec('delete from maintenance_hour_results');assert.equal(f.db.prepare('select count(*) n from maintenance_nonroutine_role_results').get().n,0);assert.equal(f.db.prepare('select count(*) n from maintenance_effective_hour_results').get().n,0);
  }
});
test('failed normal role child write rolls back parent, role lineage and effective source together',t=>{
  const f=fixture(t);f.input.final.participants_json=JSON.stringify([{personId:'a',role:'主做'},{personId:'a',role:'辅助'},{personId:'a',role:'检验'},{personId:'b',role:'主做'}]);
  f.db.exec("create trigger fail_role before insert on maintenance_nonroutine_role_results when new.role='检验' begin select raise(abort,'injected role failure'); end");
  f.db.exec('begin immediate');assert.throws(()=>f.deliver(),/injected role failure/);f.db.exec('rollback');
  for(const table of ['maintenance_hour_results','maintenance_nonroutine_role_results','maintenance_effective_hour_results'])assert.equal(f.db.prepare(`select count(*) n from ${table}`).get().n,0);
  assert.equal(f.db.prepare('select effective_hours from maintenance_nonroutine_assessments').get().effective_hours,null);
});

test('recognition delivers expanded accounting roles from actual report sources without using different dispatch identities',t=>{
 for(const status of ['已提报','待复核','已确认']){
  const f=fixture(t,status),actual=f.db.prepare('select * from maintenance_assignments order by id').all().map(row=>({...row,id:'report-'+row.id,sourceType:'REPORT_ENTRY'}));
  f.input.readParticipants=()=>actual;f.db.exec("update maintenance_assignments set person_id='unrelated-dispatch',role='辅助'");const before=f.db.prepare('select * from maintenance_assignments order by id').all();
  f.input.final.participants_json=JSON.stringify([{personId:'a',role:'主做'},{personId:'a',role:'检验'},{personId:'a',role:'辅助'},{personId:'b',role:'主做'}]);
  const result=f.deliver();assert.equal(result.state,status==='已确认'?'ADJUSTED_CLOSED':'MERGED_CLOSED');assert.deepEqual(f.db.prepare('select * from maintenance_assignments order by id').all(),before);
  const rows=f.db.prepare('select * from maintenance_effective_hour_results order by id').all();assert.equal(rows.length,4);assert.equal(Math.round(rows.reduce((sum,row)=>sum+row.hours,0)*100),210);assert.ok(rows.every(row=>['a','b'].includes(row.person_id)&&row.assignment_id.startsWith('report-')));assert.equal(f.deliver().detail.code,'EXISTING_RESULT_REQUIRES_RECONCILIATION');
 }
});
