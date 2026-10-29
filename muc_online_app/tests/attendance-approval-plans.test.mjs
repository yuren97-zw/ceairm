import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {createAttendanceService} from '../attendance-service.mjs';
import {configuration,DingTalkClient} from '../attendance-dingtalk.mjs';
import {normalizeApprovalPlan,approvalBusinessTime} from '../attendance-approval-plans.mjs';
import {classifyDay} from '../attendance-rules.mjs';
import {attendanceMatchesCategories} from '../public/attendance-presentation.mjs';
import {approvalDisplayCount,approvalPlansHtml} from '../public/attendance-approval-plan-view.mjs';
import {exportTables,exportHtml} from '../attendance-export.mjs';
const admin={id:'admin',all:true},reader={id:'reader',personId:'p1'};
const outing=(extra={})=>({status:'COMPLETED',result:'agree',originatorUserId:'u1',createTime:'2026-10-26T10:00:00+08:00',formComponentValues:[{id:'DDDateField_9NJFYUSAEXC0',name:'开始时间',value:'2026-10-30 上午'},{id:'DDDateField_18N97G5ARZ4W0',name:'结束时间',value:'2026-10-31 下午'},{id:'TextareaField-JYNRW51P',name:'外出事由',value:'<script>private</script>'},{name:'时长',value:'2'}],...extra});
const correction=(date='2026-10-20 08:30:00',extra={})=>outing({formComponentValues:[{id:'DDDateField-JYNRW51O',name:'补卡时间',componentType:'DDDateField',value:date},{name:'repairCheckTime',value:String(Date.parse(date.replace(' ','T')+'+08:00'))},{id:'TextareaField-JYNRW51P',name:'补卡理由',value:'private reason must not be retained'}],...extra});
function fixture(){const db=new DatabaseSync(':memory:');db.exec("create table personnel(id text primary key,employee_no text,name text,department text,home_team text,data_status text);create table settings(key text primary key,value text,updated_at text);insert into personnel values('p1','54000001','同名','部门','班组',null),('p2','54000002','同名','部门','班组',null)");let time=Date.parse('2026-10-28T01:00:00+08:00'),detail=outing(),reads=0;const config={...configuration({}),startDate:'2026-10-01',approvalPlansEnabled:true,approvalPlanDueEnabled:true,workerEnabled:true,eventsEnabled:true,appKey:'test',appSecret:'test',operatorId:'op',rootDepartmentId:'1',monthlyBudget:500000};
 const client={approval:async()=>{reads++;return detail;},directory:async()=>({departments:[],users:[{userId:'u1',employeeNo:'54000001',departmentIds:[]},{userId:'u2',employeeNo:'54000002',departmentIds:[]}]}),results:async()=>[],schedules:async()=>[],day:async(u,date)=>({userid:u,work_date:Date.parse(date+'T00:00:00+08:00'),attendance_result_list:[],check_record_list:[],approve_list:[]})};const access={predicate:u=>u.all?{sql:'1=1',params:[]}:{sql:'p.id=?',params:[u.personId]},hasAll:u=>!!u.all,requirePerson(){}};
 const deps={db,config,client,clock:()=>time,personnelAccess:access,hasRbac:()=>true,audit:()=>{}};const service=createAttendanceService(deps);service.hybrid.setState('approvalPlanDueEnabled',true);
 for(const n of [1,2])db.prepare('insert into attendance_people(user_id,person_id,employee_no,name,department_ids,seen_at) values(?,?,?,?,?,?)').run('u'+n,'p'+n,'5400000'+n,'同名','[]',new Date(time).toISOString());
 service.hybrid.setState('directory',{at:new Date(time).toISOString(),directory:{departments:[],users:[{userId:'u1',employeeNo:'54000001',departmentIds:[]},{userId:'u2',employeeNo:'54000002',departmentIds:[]}]}});
 return {db,deps,service,setTime:v=>time=Date.parse(v),setDetail:v=>detail=v,get reads(){return reads;}};
}
test('business dates, native leave category, travel segments and terminal states use exact fields, not event enums',()=>{
 assert.equal(normalizeApprovalPlan(outing()).kind,'外出');assert.deepEqual(normalizeApprovalPlan(outing()).dates,['2026-10-30','2026-10-31']);
 const leave=normalizeApprovalPlan(outing({formComponentValues:[{id:'DDHolidayField-J2BWEN12',value:JSON.stringify(['2026-10-30 上午','2026-11-02 下午',2,'halfDay','公休假'])},{name:'假期类型（请选择）',value:'其他假期'}]}));assert.equal(leave.category,'公休假');assert.equal(leave.dates.length,4);
 const travel=normalizeApprovalPlan(outing({formComponentValues:[{id:'TableField_LDYWW1RA5CG0',value:JSON.stringify([{rowValue:[{label:'开始时间',value:'2026-10-30 上午'},{label:'结束时间',value:'2026-10-31 下午'}]}])},{name:'出差事由',value:'培训'}]}));assert.equal(travel.category,'培训');assert.equal(travel.kind,'出差');
 for(const extra of [{status:'TERMINATED'},{result:'refuse'}])assert.equal(normalizeApprovalPlan(outing(extra)).state,'withdrawn');
 assert.equal(normalizeApprovalPlan(outing({status:'RUNNING'})).state,'pending');assert.equal(normalizeApprovalPlan({formComponentValues:[],title:'请假2026-10-30',createTime:'2026-10-30'}).state,'unsupported');
 assert.equal(approvalBusinessTime('2026-10-30 上午',true),Date.parse('2026-10-30T12:00:00+08:00'));
});
test('verified punch correction is independent of leave, retains no reason and uses two attribution dates',()=>{
 const p=normalizeApprovalPlan(correction());assert.equal(p.state,'approved');assert.equal(p.kind,'补卡');assert.equal(p.effect,'punch_correction');assert.equal(p.category,null);assert.equal(p.reason,null);assert.equal(p.duration,null);
 assert.deepEqual(p.dates,['2026-10-20']);assert.deepEqual(p.recheckDates,['2026-10-19','2026-10-20']);assert.ok(!JSON.stringify(p).includes('private reason'));
 assert.deepEqual(normalizeApprovalPlan(correction('2026-11-01 00:00:00')).recheckDates,['2026-10-31','2026-11-01']);
 const fake=correction();fake.formComponentValues[0].id='unverified';assert.equal(normalizeApprovalPlan(fake).state,'unresolved');
 assert.equal(normalizeApprovalPlan({title:'补卡申请',formComponentValues:[]}).state,'unsupported');
 for(const mutate of [
  d=>d.formComponentValues.push({...d.formComponentValues[0]}),
  d=>d.formComponentValues.pop()&&d.formComponentValues.pop(),
  d=>d.formComponentValues[0].name='日期',
  d=>d.formComponentValues[0].componentType='TextField',
  d=>d.formComponentValues[1].id='user-editable-field',
  d=>d.formComponentValues[1].value=String(Number(d.formComponentValues[1].value)+60000),
  d=>d.formComponentValues.push(...outing().formComponentValues),
  d=>d.formComponentValues[0].value='2026-02-30 08:30:00'
 ]){const d=correction();mutate(d);assert.equal(normalizeApprovalPlan(d).state,'unresolved');assert.deepEqual(normalizeApprovalPlan(d).dates,[]);}
});
test('approved correction cannot excuse a missing punch or create attendance hours',()=>{
 const date='2026-10-20',now=Date.parse('2026-10-22T00:00:00+08:00'),on=Date.parse(date+'T08:30:00+08:00'),off=Date.parse(date+'T17:30:00+08:00');
 const input={date,covered:true,rest:false,points:[{type:'OnDuty',planned:on},{type:'OffDuty',planned:off}],punches:[],approvals:[{id:'repair',kind:'补卡',approved:true,start:on,end:off}]};
 assert.equal(classifyDay(input,now).category,'缺卡');
 assert.equal(classifyDay({...input,punches:[{type:'OnDuty',planned:on,actual:on,valid:true,recordId:'on'},{type:'OffDuty',planned:off,actual:off,valid:true,recordId:'off'}]},now).category,'白班');
});
test('current-day correction keeps a final verification job and never merges into a leave conflict',()=>{
 const f=fixture();try{
  f.setTime('2026-10-30T10:00:00+08:00');f.service.approvalPlans.save('repair',correction('2026-10-30 08:30:00'),'test');f.service.approvalPlans.save('out',outing(),'test');
  const rows=f.db.prepare("select work_date,phase,due_at from attendance_approval_plan_due where instance_id='repair' order by work_date,phase").all();assert.equal(rows.length,4);assert.ok(rows.some(r=>r.work_date==='2026-10-30'&&r.phase==='final'&&r.due_at==='2026-10-31T04:30:00.000Z'));
  const p=f.service.snapshot(admin,{month:'2026-10'}).people[0];assert.equal(p.pendingCounts['外出'],2);assert.ok(p.days.every(d=>!d.approvalConflict));
 }finally{f.db.close();}
});
test('correction schedules only authoritative reads; duplicates, withdrawal and scope do not alter attendance or balances',()=>{
 const f=fixture();try{
  f.service.approvalPlans.save('repair',correction(),'test');f.service.approvalPlans.save('repair',correction(),'test');
  let p=f.service.snapshot(admin,{month:'2026-10'}).people[0];assert.deepEqual(p.pendingCounts,{});assert.deepEqual(p.displayCounts,p.counts);assert.ok(p.days.every(d=>!d.approvalConflict&&!d.pendingCategories.length));
  assert.equal(f.service.snapshot({...reader,personId:'p2'},{month:'2026-10'}).people[0].approvalPlans.length,0);
  const html=approvalPlansHtml(p.approvalPlans,'2026-10');assert.match(html,/补卡核对1单/);assert.match(html,/有效申请0单/);assert.doesNotMatch(html,/private reason/);
  assert.equal(f.db.prepare('select count(*) n from attendance_approval_plan_history').get().n,1);
  assert.deepEqual(f.db.prepare('select work_date,phase from attendance_approval_plan_due order by work_date').all().map(r=>({...r})),[{work_date:'2026-10-19',phase:'correction'},{work_date:'2026-10-20',phase:'correction'}]);
  f.service.approvalPlans.due();f.service.approvalPlans.due();assert.equal(f.db.prepare('select count(*) n from attendance_runs').get().n,2);assert.equal(f.db.prepare('select count(*) n from attendance_days').get().n,0);
  f.service.approvalPlans.save('repair',correction('2026-10-20 08:30:00',{status:'TERMINATED'}),'withdraw');
  assert.equal(f.db.prepare("select count(*) n from attendance_approval_plan_due where status='pending'").get().n,2);
  assert.equal(f.db.prepare('select count(*) n from attendance_days').get().n,0);
 }finally{f.db.close();}
});
test('unapproved corrections do not schedule, changed corrections recheck old and new dates and start boundary is respected',()=>{
 const f=fixture();try{
  f.service.approvalPlans.save('pending',correction('2026-10-20 08:30:00',{status:'RUNNING'}),'test');assert.equal(f.db.prepare('select count(*) n from attendance_approval_plan_due').get().n,0);
  f.service.approvalPlans.save('repair',correction('2026-10-01 08:30:00'),'test');assert.deepEqual(f.db.prepare("select work_date from attendance_approval_plan_due where status='pending'").all().map(r=>r.work_date),['2026-10-01']);
  f.service.approvalPlans.save('repair',correction('2026-10-05 08:30:00'),'test');assert.deepEqual(f.db.prepare("select work_date from attendance_approval_plan_due where status='pending' order by work_date").all().map(r=>r.work_date),['2026-10-01','2026-10-04','2026-10-05']);
  f.service.approvalPlans.save('outsider',correction('2026-10-20 08:30:00',{originatorUserId:'outsider'}),'test');assert.equal(f.db.prepare("select state from attendance_approval_plans where id='outsider'").get().state,'unresolved');assert.equal(f.db.prepare("select count(*) n from attendance_approval_plan_due where instance_id='outsider'").get().n,0);
 }finally{f.db.close();}
});
test('correction event targets only the correction day and previous attribution day, not the entire person-month',()=>{
 const f=fixture();try{
  f.service.approvalPlans.save('repair',correction(),'test');f.db.prepare('insert into attendance_events values(?,?,?,?,?,?)').run('repair-event','attendance_approve_status_change',JSON.stringify({processInstanceId:'repair',staffId:'u1'}),'2026-10-28T00:00:00Z','pending',null);
  f.service.hybrid.processEvents();assert.equal(f.db.prepare("select status from attendance_events where id='repair-event'").get().status,'handled');assert.deepEqual(f.db.prepare('select person_id,work_date from attendance_event_targets order by work_date').all().map(r=>({...r})),[{person_id:'p1',work_date:'2026-10-19'},{person_id:'p1',work_date:'2026-10-20'}]);assert.equal(f.db.prepare('select count(*) n from attendance_days').get().n,0);
 }finally{f.db.close();}
});
test('future approved application is two pending days and one instance; duplicates preserve actual month and history',()=>{
 const f=fixture();f.service.approvalPlans.save('a',outing(),'test');f.service.approvalPlans.save('a',outing(),'test');const s=f.service.snapshot(admin,{month:'2026-10'}),p=s.people[0];assert.equal(p.pendingCounts['外出'],2);assert.equal(approvalDisplayCount(p,'外出'),2);assert.equal(p.approvalPlans.length,1);assert.equal(p.days.filter(d=>d.pendingCategories.includes('外出')).length,2);assert.equal(Object.values(p.counts).reduce((a,b)=>a+b),31);assert.equal(f.db.prepare('select count(*) n from attendance_days').get().n,0);assert.equal(f.db.prepare('select count(*) n from attendance_approval_plan_history').get().n,1);assert.equal(f.db.prepare('select count(*) n from attendance_approval_plan_due').get().n,4);
 assert.equal(f.service.snapshot(admin,{month:'2026-10',categories:['外出']}).people.length,1);assert.equal(f.service.snapshot({...reader,personId:'p2'},{month:'2026-10'}).people[0].approvalPlans.length,0);assert.equal(attendanceMatchesCategories(p,['病假','外出']),true);
 assert.match(approvalPlansHtml(p.approvalPlans,'2026-10'),/1单 · 涉及2个日期/);assert.doesNotMatch(approvalPlansHtml(p.approvalPlans),/<script>/);f.db.close();
});
test('withdrawal, changed dates, cross-month, overlap and stale reads update plans without changing attendance or quotas',async()=>{
 const f=fixture();f.service.approvalPlans.save('a',outing(),'test');f.service.approvalPlans.save('b',outing(),'test');assert.equal(f.service.snapshot(admin,{month:'2026-10'}).people[0].pendingCounts['外出'],2);
 const change=outing();change.formComponentValues=change.formComponentValues.map(v=>v.name==='结束时间'?{...v,value:'2026-11-02 下午'}:v);f.service.approvalPlans.save('a',change,'modify');assert.equal(f.service.snapshot(admin,{month:'2026-11'}).people[0].pendingCounts['外出'],2);
 f.service.approvalPlans.save('b',outing({status:'TERMINATED'}),'withdraw');assert.equal(f.service.snapshot(admin,{month:'2026-10'}).people[0].pendingCounts['外出'],2);
 f.service.approvalPlans.queue('a');f.deps.client.approval=async()=>{throw Object.assign(Error('secret'),{code:'403'});};await f.service.approvalPlans.tick();assert.equal(f.service.snapshot(admin,{month:'2026-10'}).people[0].pendingCounts['外出']||0,0);assert.ok(!f.service.approvalPlans.status().queue.error?.includes('secret'));f.db.close();
});
test('persistent due jobs enqueue only selected dates, remain off globally, and resume without duplication',()=>{
 const f=fixture();f.service.approvalPlans.save('a',outing(),'test');f.service.approvalPlans.due();assert.equal(f.db.prepare('select count(*) n from attendance_runs').get().n,0);
 f.setTime('2026-10-30T00:05:00+08:00');f.service.approvalPlans.due();assert.equal(f.db.prepare('select count(*) n from attendance_runs').get().n,1);createAttendanceService(f.deps).approvalPlans.due();assert.equal(f.db.prepare('select count(*) n from attendance_runs').get().n,1);
 const run=f.db.prepare('select * from attendance_run_meta').get();assert.equal(run.source,'approval_due');assert.deepEqual(JSON.parse(run.targets_json),[{personId:'p1',date:'2026-10-30'}]);assert.equal(f.deps.config.enabled,false);
 f.setTime('2026-10-31T12:30:00+08:00');f.service.approvalPlans.due();assert.equal(f.db.prepare('select count(*) n from attendance_runs').get().n,3);f.db.close();
});
test('final shift read replaces pending, stale source cannot and same category is not double counted',()=>{
 const f=fixture();f.service.approvalPlans.save('a',outing(),'test');f.setTime('2026-10-30T20:30:00+08:00');const plan=f.service.approvalPlans;
 const day={date:'2026-10-30',category:'白班',input:{covered:true,points:[{type:'OffDuty',planned:Date.parse('2026-10-30T19:40:00+08:00')}]},updatedAt:'2026-10-30T20:00:00+08:00',sourceQueriedAt:'2026-10-30T20:00:00+08:00'};
 const person={personId:'p1',days:[day],counts:{白班:1}};assert.equal(plan.decorate(person,'2026-10').pendingCounts['外出']||0,0);
 const old=plan.decorate({...person,days:[{...day,sourceQueriedAt:'2026-10-30T19:00:00+08:00'}]},'2026-10');assert.equal(old.pendingCounts['外出'],1);
 const same=plan.decorate({...person,counts:{外出:1},days:[{...day,category:'外出',sourceQueriedAt:'2026-10-30T19:00:00+08:00'}]},'2026-10');assert.equal(same.displayCounts['外出'],1);f.db.close();
});
test('Excel stays actual-only; HTML contains safe pending details, and scoped manual refresh blocks unknown identifiers',()=>{
 const f=fixture();f.service.approvalPlans.save('a',outing(),'test');const plain=f.service.snapshot(admin,{month:'2026-10'},'attendance.export');assert.equal(plain.people[0].pendingCounts,undefined);assert.ok(!JSON.stringify(exportTables(plain)).includes('private'));
 const html=exportHtml(f.service.snapshot(admin,{month:'2026-10'}));assert.match(html,/approvalPlans/);assert.doesNotMatch(html,/<script>private<\/script>/);
 assert.throws(()=>f.service.approvalPlanRefresh(reader,{id:'unknown'}),{status:403});assert.throws(()=>f.service.approvalPlanRefresh({...reader,personId:'p2'},{id:'a'}),{status:403});assert.equal(f.service.approvalPlanRefresh(admin,{id:'unknown'}).status,'queued');f.db.close();
});
test('event queue and response generation survive restart; unauthorized people and missing fields never contribute',async()=>{
 const f=fixture();f.db.prepare('insert into attendance_events values(?,?,?,?,?,?)').run('e','attendance_approve_status_change',JSON.stringify({processInstanceId:'a'}),'2026-10-28T00:00:00Z','handled',null);await f.service.approvalPlans.tick();assert.equal(f.reads,1);await createAttendanceService(f.deps).approvalPlans.tick();assert.equal(f.reads,1);
 f.service.approvalPlans.save('b',outing({originatorUserId:'outsider'}),'test');assert.equal(f.service.snapshot(admin,{month:'2026-10'}).people[0].pendingCounts['外出'],2);assert.equal(f.db.prepare("select state from attendance_approval_plans where id='b'").get().state,'unresolved');f.db.close();
});
test('repeated approval notifications increment stored generation and preserve verified progress',()=>{
 const f=fixture();
 try{
  f.service.approvalPlans.queue('repeat','event');
  f.db.prepare("update attendance_approval_plan_queue set generation=7,applied_generation=7,attempts=3,error='simulated retry' where id=?").run('repeat');
  f.service.approvalPlans.queue('repeat','event');
  const row=f.db.prepare('select * from attendance_approval_plan_queue where id=?').get('repeat');
  assert.equal(row.generation,8);assert.equal(row.applied_generation,7);
  assert.equal(row.attempts,0);assert.equal(row.error,null);assert.equal(row.source,'event');
 }finally{f.db.close();}
});
test('template and instance client APIs enforce arrays and explicit pagination',async()=>{const c=new DingTalkClient(configuration({}));let body;c.call=async(p,b)=>{body=b;return {result:{list:['a'],nextToken:20}};};assert.deepEqual(await c.approvalInstanceIds('code',1,2,0,['u1']),{ids:['a'],next:20});assert.deepEqual(body.userIds,['u1']);c.call=async()=>({result:{}});await assert.rejects(()=>c.approvalTemplates(),{code:'SCHEMA'});});

test('overlapping distinct categories flag conflicts; calendar month lengths and disabled compatibility stay intact',()=>{
 const f=fixture();f.service.approvalPlans.save('a',outing(),'test');const leave=outing({formComponentValues:[{id:'DDHolidayField-J2BWEN12',value:JSON.stringify(['2026-10-30 上午','2026-10-31 下午',2,'day','病假'])}]});f.service.approvalPlans.save('b',leave,'test');const p=f.service.snapshot(admin,{month:'2026-10'}).people[0];assert.equal(p.days.find(d=>d.date==='2026-10-30').approvalConflict,true);assert.equal(p.pendingCounts['病假'],2);
 for(const [m,n] of [['2026-02',28],['2028-02',29],['2026-04',30],['2026-10',31]])assert.equal(f.service.snapshot(reader,{month:m}).people[0].days.length,n);
 const other=createAttendanceService({...f.deps,config:{...f.deps.config,approvalPlansEnabled:false}});assert.equal(other.snapshot(admin,{month:'2026-10'}).people[0].pendingCounts,undefined);assert.equal(other.approvalPlans.status(),null);f.db.close();
});
test('inventory pagination is scoped to matched users, records API permission gaps, and supports safe retry',async()=>{
 const f=fixture();let templates=0,list=0;f.deps.client.approvalTemplates=async()=>{templates++;throw Object.assign(Error(),{code:'60011'});};await f.service.approvalPlans.tick();assert.equal(f.service.approvalPlans.status().coverage.state,'incomplete');await f.service.approvalPlans.tick();assert.equal(templates,1);
 f.deps.client.approvalTemplates=async()=>({items:[{name:'外出',process_code:'code'},{name:'采购',process_code:'ignored'}],next:null});f.deps.client.approvalInstanceIds=async(code,from,to,cursor,users)=>{assert.equal(code,'code');assert.deepEqual(users,['u1','u2']);assert.ok(from>=Date.parse('2026-10-01T00:00:00+08:00'));list++;return {ids:['a'],next:null};};f.service.approvalPlanRefresh(admin,{retryInventory:true});for(let i=0;i<5;i++)await f.service.approvalPlans.tick();assert.equal(list,1);assert.equal(f.service.approvalPlans.status().coverage.state,'incomplete');assert.deepEqual(f.service.approvalPlans.status().coverage.missingKinds,['请假','出差']);assert.equal(f.service.snapshot(admin,{month:'2026-10'}).people[0].pendingCounts['外出'],2);f.db.close();
});

test('end-exclusive midnight does not invent an extra day and malformed intervals remain unresolved',()=>{
 const d=outing();d.formComponentValues=d.formComponentValues.map(f=>f.name==='开始时间'?{...f,value:'2026-10-30 00:00:00'}:f.name==='结束时间'?{...f,value:'2026-11-01 00:00:00'}:f);assert.deepEqual(normalizeApprovalPlan(d).dates,['2026-10-30','2026-10-31']);d.formComponentValues=d.formComponentValues.map(f=>f.name==='结束时间'?{...f,value:'bad'}:f);assert.equal(normalizeApprovalPlan(d).state,'unresolved');
});
test('resolved future approval events do not expand into historical person-month reads',async()=>{
 const f=fixture();const p=outing();f.service.approvalPlans.save('a',p,'test');f.db.prepare('insert into attendance_events values(?,?,?,?,?,?)').run('future','attendance_approve_status_change',JSON.stringify({processInstanceId:'a',staffId:'u1'}),'2026-10-28T00:00:00Z','pending',null);f.service.hybrid.processEvents();assert.equal(f.db.prepare("select status from attendance_events where id='future'").get().status,'deferred');assert.equal(f.db.prepare('select count(*) n from attendance_event_targets').get().n,0);assert.equal(f.db.prepare('select count(*) n from attendance_days').get().n,0);f.db.close();
});

test('initial inventory keeps already verified historical approvals reconciled; new changes still need a fresh read',()=>{
 const f=fixture();const old=outing();old.formComponentValues=old.formComponentValues.map(v=>v.name==='开始时间'?{...v,value:'2026-10-20 上午'}:v.name==='结束时间'?{...v,value:'2026-10-20 下午'}:v);f.service.approvalPlans.save('a',old,'initial_known');
 const input={date:'2026-10-20',covered:true,points:[],punches:[],approvals:[{id:'a',kind:'外出',approved:true,revoked:false}]},day={date:'2026-10-20',category:'外出',input,updatedAt:'2026-10-22T00:00:00Z'};
 assert.equal(f.service.approvalPlans.decorate({personId:'p1',days:[day],counts:{外出:1}},'2026-10').pendingCounts['外出']||0,0);
 f.db.prepare('insert into attendance_days values(?,?,?,?,?,?,?)').run('p1','2026-10-20',JSON.stringify(input),JSON.stringify({category:'外出'}),'h',day.updatedAt,'old');f.service.approvalPlans.due();assert.equal(f.db.prepare("select count(*) n from attendance_approval_plan_due where status='reused'").get().n,2);assert.equal(f.db.prepare('select count(*) n from attendance_runs').get().n,0);
 const changed=structuredClone(old);changed.formComponentValues.push({id:'TextareaField-JYNRW51P',name:'外出事由',value:'changed'});f.service.approvalPlans.save('a',changed,'event');assert.equal(f.service.approvalPlans.decorate({personId:'p1',days:[day],counts:{外出:1}},'2026-10').pendingCounts['外出'],1);f.db.close();
});

test('verified enterprise aliases cover all three kinds, exclude lookalike forms and let live punch work preempt inventory',async()=>{
 const f=fixture();const visited=[];f.deps.client.approvalTemplates=async()=>({items:[{name:'请休假申请',process_code:'leave'},{name:'外出申请',process_code:'out'},{name:'出差申请',process_code:'trip'},{name:'外出表单模板',process_code:'test-form'}],next:null});f.deps.client.approvalInstanceIds=async code=>{visited.push(code);return {ids:[],next:null};};
 f.db.prepare('insert into attendance_events values(?,?,?,?,?,?)').run('live','attendance_check_record','{}','2026-10-28T00:00:00Z','pending',null);assert.equal(await f.service.approvalPlans.tick(),false);assert.deepEqual(visited,[]);f.db.prepare("update attendance_events set status='handled' where id='live'").run();for(let i=0;i<7;i++)await f.service.approvalPlans.tick();assert.deepEqual(visited,['leave','out','trip']);assert.equal(f.service.approvalPlans.status().coverage.state,'complete');assert.equal(f.service.approvalPlans.status().coverage.people,2);f.db.close();
});

// Vendor-approved revoke/modify operations keep COMPLETED/agree on their parent.
const modified=(extra={})=>{const a=outing({bizAction:'MODIFY',mainProcessInstanceId:'root',finishTime:'2026-10-28T12:00Z',...extra});a.formComponentValues=a.formComponentValues.map(v=>v.name==='开始时间'?{...v,value:'2026-10-29 上午'}:v.name==='结束时间'?{...v,value:'2026-10-30 下午'}:v);return a;};
test('approved linked modification replaces dates; approved revoke removes group without deleting history',()=>{
 const f=fixture(),ap=f.service.approvalPlans;
 ap.save('root',outing(),'test');ap.save('unrelated',outing({originatorUserId:'u2'}),'test');
 const other=f.db.prepare("select revision,plan_json from attendance_approval_plans where id='unrelated'").get();
 ap.save('mod',modified(),'event');let p=f.service.snapshot(admin,{month:'2026-10'}).people[0];
 assert.equal(p.pendingCounts['外出'],2);assert.deepEqual(p.days.filter(d=>d.pendingCategories.includes('外出')).map(d=>d.date),['2026-10-29','2026-10-30']);
 assert.equal(p.approvalPlans.find(a=>a.id==='root').state,'superseded');
 ap.save('revoke',modified({bizAction:'REVOKE'}),'event');p=f.service.snapshot(admin,{month:'2026-10'}).people[0];assert.equal(p.pendingCounts['外出']||0,0);
 assert.ok(p.approvalPlans.every(a=>a.state==='withdrawn'));assert.match(approvalPlansHtml(p.approvalPlans),/有效申请0单/);
 assert.equal(f.db.prepare("select count(*) n from attendance_approval_plan_due where status='pending' and instance_id in ('root','mod','revoke')").get().n,0);
 const history=f.db.prepare('select count(*) n from attendance_approval_plan_history').get().n;
 ap.save('root',outing(),'event');ap.save('mod',modified(),'event');ap.save('revoke',modified({bizAction:'REVOKE'}),'event');
 assert.equal(f.db.prepare('select count(*) n from attendance_approval_plan_history').get().n,history);
 assert.deepEqual(f.db.prepare("select revision,plan_json from attendance_approval_plans where id='unrelated'").get(),other);
 assert.equal(createAttendanceService(f.deps).snapshot(admin,{month:'2026-10'}).people[0].pendingCounts['外出']||0,0);
 assert.equal(Object.values(p.counts).reduce((a,b)=>a+b),31);assert.equal(f.db.prepare('select count(*) n from attendance_days').get().n,0);f.db.close();
});
test('pending or rejected revoke does not cancel original; approved revoke arriving before parent is safely linked',()=>{
 const f=fixture(),ap=f.service.approvalPlans;ap.save('root',outing(),'test');
 for(const extra of [{status:'RUNNING'},{result:'refuse'},{status:'TERMINATED'}]){ap.save('r',modified({bizAction:'REVOKE',...extra}),'event');assert.equal(f.service.snapshot(admin,{month:'2026-10'}).people[0].pendingCounts['外出'],2);}
 ap.save('early',modified({bizAction:'REVOKE',mainProcessInstanceId:'late'}),'event');assert.equal(ap.plansFor('p1','2026-10').find(a=>a.id==='early').state,'unresolved');
 assert.ok(f.db.prepare("select id from attendance_approval_plan_queue where id='late'").get());
 ap.save('late',outing(),'related_instance');assert.equal(ap.plansFor('p1','2026-10').find(a=>a.id==='late').state,'withdrawn');f.db.close();
});
test('unknown relations, cross-person operation and unfinished linked reads never infer an effective approval',()=>{
 const f=fixture(),ap=f.service.approvalPlans;
 assert.equal(normalizeApprovalPlan(modified({mainProcessInstanceId:''})).state,'unresolved');
 assert.equal(normalizeApprovalPlan(outing({bizAction:'UNKNOWN'})).state,'unresolved');
 ap.save('root',outing({attachedProcessInstanceIds:['missing']}),'test');assert.equal(f.service.snapshot(admin,{month:'2026-10'}).people[0].pendingCounts['外出']||0,0);
 ap.save('missing',modified(),'related_instance');f.db.prepare("update attendance_approval_plan_queue set applied_generation=generation where id='missing'").run();assert.equal(f.service.snapshot(admin,{month:'2026-10'}).people[0].pendingCounts['外出'],2);
 ap.save('bad',modified({bizAction:'REVOKE',originatorUserId:'u2'}),'event');
 for(const p of f.service.snapshot(admin,{month:'2026-10'}).people)assert.equal(p.pendingCounts['外出']||0,0);
 assert.equal(ap.plansFor('p1','2026-10').find(a=>a.id==='root').state,'unresolved');f.db.close();
});
