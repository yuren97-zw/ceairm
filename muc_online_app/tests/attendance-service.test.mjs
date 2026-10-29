import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAttendanceService} from '../attendance-service.mjs';
import {configuration,DingTalkError} from '../attendance-dingtalk.mjs';
const clock=()=>Date.parse('2026-10-22T22:00:00+08:00');
const admin={id:'admin',all:true,permissions:['attendance.read','attendance.stats.read','attendance.record.manage','attendance.export']};
const reader={id:'reader',personId:'p1',permissions:['attendance.read']};
function fixture(options={}){
 const db=new DatabaseSync(':memory:');db.exec("create table settings(key text primary key,value text,updated_at text);create table personnel(id text primary key,employee_no text,name text,department text,home_team text,data_status text);insert into personnel values('p1','54000001','人员一','航线','一组','active'),('p2','54000002','人员二','航线','二组','active');");
 let purpose='培训',calls=0;
 const client={directory:async()=>({departments:[{id:'1',name:'青岛航线维修车间'}],users:[{userId:'u1',employeeNo:'54000001',name:'人员一',departmentIds:['1']},{userId:'u2',employeeNo:'54000002',name:'人员二',departmentIds:['1']}]}),results:async()=>[],schedules:async()=>[],day:async(user,date)=>{calls++;return {userid:user,work_date:Date.parse(date+'T00:00:00+08:00'),attendance_result_list:[],check_record_list:[],approve_list:[{procInst_id:'a',tag_name:'出差',begin_time:Date.parse('2026-09-01T00:00:00+08:00'),end_time:Date.parse('2026-10-01T00:00:00+08:00')}]};},approval:async()=>({status:'COMPLETED',result:'agree',formComponentValues:[{name:'出差事由',value:purpose}]}),...options.client};
 const personnelAccess={predicate:u=>u.all?{sql:'1=1',params:[]}:{sql:'p.id=?',params:[u.personId]},hasAll:u=>!!u.all,requirePerson(u,m,id){if(!u.all&&id!==u.personId)throw Object.assign(Error('not found'),{status:404});}};
 const config={...configuration({DINGTALK_APP_KEY:'test',DINGTALK_APP_SECRET:'test',DINGTALK_OP_USER_ID:'op',DINGTALK_ROOT_DEPT_ID:'1',ATTENDANCE_WORKER_ENABLED:'true'}),...options.config};
 const deps={db,client,personnelAccess,isAdmin:u=>u.id==='admin',hasRbac:(u,p)=>u.permissions.includes(p),audit:()=>{},clock,config};
 return {db,service:createAttendanceService(deps),deps,setPurpose:v=>purpose=v,get calls(){return calls;}};
}
async function drain(service,max=50){for(let i=0;i<max;i++)await service.tick();}
test('status masks persisted Stream connection without modifying stored history or invoking synchronization',()=>{
 const f=fixture({config:{eventsEnabled:false}}),saved={enabled:true,connected:true,lastEventAt:'2026-10-28T11:15:51Z'};f.service.hybrid.setState('stream',saved);
 const before=f.db.prepare('select * from attendance_sync_state').all();
 for(const user of [admin,reader]){const value=f.service.status(user).hybrid.stream;assert.equal(value.enabled,false);assert.equal(value.connected,false);assert.equal(value.lastEventAt,saved.lastEventAt);}
 assert.deepEqual(f.db.prepare('select * from attendance_sync_state').all(),before);assert.equal(f.calls,0);f.db.close();
});
test('full sync persists unique people-days, repeat is idempotent and source change is audited',async()=>{
 const f=fixture();f.service.enqueue({from:'2026-09-01',to:'2026-09-02',user:admin});await drain(f.service);
 assert.equal(f.db.prepare('select count(*) as n from attendance_days').get().n,4);assert.equal(f.service.status(admin).runs[0].status,'completed');
 let s=f.service.snapshot(reader,{month:'2026-09'});assert.equal(s.people.length,1);assert.equal(s.people[0].counts['培训'],2);assert.equal(s.people[0].counts['未同步'],28);assert.equal(s.people[0].overtimeSeconds,null);
 f.service.enqueue({from:'2026-09-01',to:'2026-09-02',user:admin});await drain(f.service);assert.equal(f.db.prepare('select count(*) as n from attendance_changes').get().n,0);
 f.setPurpose('派驻');f.service.enqueue({from:'2026-09-01',to:'2026-09-02',user:admin});await drain(f.service);
 assert.equal(f.db.prepare('select count(*) as n from attendance_days').get().n,4);assert.equal(f.db.prepare('select count(*) as n from attendance_changes').get().n,4);assert.equal(f.service.snapshot(reader,{month:'2026-09'}).people[0].counts['派驻'],2);
 assert.equal(f.service.changes(reader,{month:'2026-09'}).length,2);f.db.close();
});
test('worker resumes after service recreation, same approval read once per run',async()=>{
 let approvals=0;const f=fixture({client:{approval:async()=>{approvals++;return {status:'COMPLETED',result:'agree',formComponentValues:[{name:'出差事由',value:'培训'}]};}}});f.service.enqueue({from:'2026-09-01',to:'2026-09-02',user:admin});await f.service.tick();await f.service.tick();await f.service.tick();
 const second=createAttendanceService(f.deps);await drain(second);assert.equal(f.db.prepare("select count(*) as n from attendance_tasks where status='done'").get().n,4);assert.equal(approvals,1);f.db.close();
});
test('failed refresh keeps previous data, missing details mark partial instead of success',async()=>{
 const f=fixture();f.service.enqueue({from:'2026-09-01',to:'2026-09-01',user:admin});await drain(f.service);f.deps.client.day=async()=>{throw new DingTalkError('budget','BUDGET');};
 f.service.enqueue({from:'2026-09-01',to:'2026-09-01',user:admin});await drain(f.service);assert.equal(f.db.prepare('select count(*) as n from attendance_days').get().n,2);assert.ok(f.service.status(admin).runs.some(r=>r.status==='partial'));assert.ok(f.service.snapshot(reader,{month:'2026-09'}).people[0].days[0].stale);f.db.close();
 const g=fixture({client:{approval:async()=>{throw new DingTalkError('denied','403');}}});g.service.enqueue({from:'2026-09-01',to:'2026-09-01',user:admin});await drain(g.service);assert.equal(g.service.status(admin).runs[0].status,'partial');assert.equal(g.service.snapshot(reader,{month:'2026-09'}).people[0].days[0].category,'待核对');g.db.close();
});
test('scopes protect list, guessed person ID, changes and manual sync, stats/export permissions separate',async()=>{
 const f=fixture();assert.equal(f.service.snapshot(reader,{month:'2026-09',personId:'p2'}).people.length,0);assert.throws(()=>f.service.snapshot(reader,{month:'2026-09'},'attendance.stats.read'),{status:403});assert.throws(()=>f.service.enqueue({from:'2026-09-01',to:'2026-09-01',user:reader}),{status:403});assert.throws(()=>f.service.capabilityStatuses(reader,'p2'),{status:404});
 const scoped={...reader,permissions:[...reader.permissions,'attendance.record.manage']};f.service.enqueue({from:'2026-09-01',to:'2026-09-01',user:scoped});await drain(f.service);assert.equal(f.db.prepare('select count(*) as n from attendance_tasks').get().n,1);f.db.close();
});
test('two worker instances cannot process same leased unit',async()=>{
 let release,entered;const wait=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const f=fixture({client:{directory:async()=>{entered();await gate;return {departments:[],users:[{userId:'u1',employeeNo:'54000001',name:'人员一',departmentIds:[]}]};}}});
 f.service.enqueue({from:'2026-09-01',to:'2026-09-01',user:admin});const first=f.service.tick();await wait;await createAttendanceService(f.deps).tick();assert.equal(f.db.prepare('select count(*) as n from attendance_batches').get().n,0);release();await first;assert.equal(f.db.prepare('select count(*) as n from attendance_batches').get().n,1);f.db.close();
});
test('duplicate employee IDs do not silently merge users',async()=>{
 const f=fixture({client:{directory:async()=>({departments:[],users:[{userId:'u1',employeeNo:'54000001',name:'同名',departmentIds:[]},{userId:'u2',employeeNo:'54000001',name:'同名',departmentIds:[]}]})}});f.service.enqueue({from:'2026-09-01',to:'2026-09-01',user:admin});await drain(f.service);assert.equal(f.db.prepare('select count(*) as n from attendance_days').get().n,0);assert.equal(f.service.status(admin).identityIssues.length,2);assert.equal(f.service.status(admin).runs[0].status,'failed');f.db.close();
});
test('adjacent context crosses month boundaries without changing monthly totals, timestamps or access scope',()=>{
 const f=fixture();const insert=f.db.prepare('insert into attendance_days(person_id,work_date,input_json,result_json,source_hash,updated_at,run_id) values(?,?,?,?,?,?,?)');
 for(const [personId,date,updatedAt] of [['p1','2026-09-30','2026-10-01T00:00:00Z'],['p1','2026-10-01','2026-10-02T00:00:00Z'],['p2','2026-10-01','2026-10-04T00:00:00Z']])insert.run(personId,date,JSON.stringify({date,covered:true,rest:true,points:[],punches:[],approvals:[]}), '{}','hash',updatedAt,'test-run');
 const s=f.service.snapshot(reader,{month:'2026-09'}),p=s.people[0];assert.equal(p.days.length,30);assert.equal(p.counts['休息'],1);assert.equal(p.contextDays.length,6);assert.equal(p.contextDays.find(d=>d.date==='2026-10-01').category,'休息');assert.equal(p.contextDays.find(d=>d.date==='2026-10-02').category,'未同步');assert.equal(s.lastSyncedAt,'2026-10-01T00:00:00Z');assert.equal(s.people.length,1);assert.equal(s.people[0].personId,'p1');assert.equal(Object.values(p.counts).reduce((a,b)=>a+b,0),30);assert.equal(f.service.snapshot(reader,{month:'2026-09',personId:'p2'}).people.length,0);assert.equal(f.calls,0);f.db.close();
});
test('category export scope filters completed monthly counts with OR, preserves all days and authorization',()=>{
 const f=fixture();const insert=f.db.prepare('insert into attendance_days(person_id,work_date,input_json,result_json,source_hash,updated_at,run_id) values(?,?,?,?,?,?,?)');
 insert.run('p1','2026-09-01',JSON.stringify({date:'2026-09-01',covered:true,rest:true,points:[],punches:[],approvals:[]}), '{}','hash','2026-10-01T00:00:00Z','test');
 const base=f.service.snapshot(admin,{month:'2026-09'});
 const selected=f.service.snapshot(admin,{month:'2026-09',categories:['休息','不存在']},'attendance.export');assert.equal(selected.people.length,1);assert.deepEqual(selected.people[0],base.people[0]);assert.deepEqual(selected.categories,base.categories);assert.equal(selected.people[0].days.length,30);
 assert.equal(f.service.snapshot(admin,{month:'2026-09',categories:['休息','未同步']}).people.length,2);
 assert.equal(f.service.snapshot(admin,{month:'2026-09',categories:[]}).people.length,2);
 assert.equal(f.service.snapshot(admin,{month:'2026-09',categories:['不存在']}).people.length,0);
 assert.equal(f.service.snapshot(admin,{month:'2026-09',query:'人员二',categories:['休息']}).people.length,0);
 assert.equal(f.service.snapshot(reader,{month:'2026-09',categories:['未同步']}).people.length,1);
 assert.throws(()=>f.service.snapshot(reader,{month:'2026-09',categories:['未同步']},'attendance.export'),{status:403});assert.equal(f.calls,0);f.db.close();
});
test('enterprise leave catalog fixes unused columns across months without changing any person-day calculation',async()=>{
 const f=fixture({client:{leaveTypes:async()=>[{name:'公休假'},{name:'病假'},{name:'事假'}]}});
 const insert=f.db.prepare('insert into attendance_days(person_id,work_date,input_json,result_json,source_hash,updated_at,run_id) values(?,?,?,?,?,?,?)');
 insert.run('p1','2026-10-23',JSON.stringify({date:'2026-10-23',covered:true,points:[],punches:[],approvals:[{kind:'请假',subType:'历史假种',approved:true,revoked:false,start:1,end:2}]}),'{}','hash','2026-10-23T00:00:00Z','test');
 const before=f.service.snapshot(reader,{month:'2026-09'});assert.ok(before.categories.includes('历史假种'));assert.equal(before.leaveTypes.status,'not_loaded');
 const types=await f.service.refreshLeaveTypes(admin);assert.equal(types.status,'ready');assert.ok(types.names.includes('病假'));
 const after=f.service.snapshot(reader,{month:'2026-09'});assert.deepEqual(after.people,before.people);assert.ok(after.categories.includes('公休假'));assert.ok(after.categories.includes('病假'));assert.ok(after.categories.includes('事假'));assert.equal(after.people[0].counts['病假']||0,0);
 assert.ok(f.service.snapshot(reader,{month:'2026-10'}).categories.includes('病假'));assert.equal(f.service.snapshot(reader,{month:'2026-09',categories:['病假']}).people.length,0);
 const p2={...reader,personId:'p2'};assert.ok(!f.service.snapshot(p2,{month:'2026-09'}).leaveTypes.names.includes('历史假种'));
 const second=createAttendanceService(f.deps);assert.equal(second.snapshot(reader,{month:'2026-09'}).leaveTypes.status,'ready');assert.equal(f.calls,0);f.db.close();
});
test('catalog permission failure, invalid response and network failure retain last good catalog and read permissions remain separate',async()=>{
 const f=fixture({client:{leaveTypes:async()=>[{name:'病假'}]}});await assert.rejects(()=>f.service.refreshLeaveTypes(reader),{status:403});
 await f.service.refreshLeaveTypes(admin);const good=f.service.status(admin).leaveTypes;
 f.deps.client.leaveTypes=async()=>{throw new DingTalkError('private vendor content','60011');};const stale=await f.service.refreshLeaveTypes(admin);assert.equal(stale.status,'stale');assert.deepEqual(stale.names,good.names);assert.equal(stale.lastSyncedAt,good.lastSyncedAt);assert.match(stale.error,/qyapi_holiday_readonly/);assert.ok(!stale.error.includes('private'));
 f.deps.client.leaveTypes=async()=>({});assert.equal((await f.service.refreshLeaveTypes(admin)).status,'stale');assert.deepEqual(f.service.status(admin).leaveTypes.names,['病假']);f.db.close();
 const g=fixture({client:{leaveTypes:async()=>{throw new DingTalkError('denied','60011');}}});assert.equal((await g.service.refreshLeaveTypes(admin)).status,'unavailable');assert.equal(g.service.snapshot(reader,{month:'2026-09'}).leaveTypes.lastSyncedAt,null);g.db.close();
});
test('automatic catalog query is cached daily, disabled scheduling causes no query, and shared lease prevents concurrent manual refresh',async()=>{
 let calls=0,now=clock();const f=fixture({config:{enabled:true},client:{leaveTypes:async()=>{calls++;return [{name:'病假'}];}}});
 const service=createAttendanceService({...f.deps,clock:()=>now});await service.tick();await service.tick();assert.equal(calls,1);now+=86400000;await service.tick();assert.equal(calls,2);assert.equal(f.calls,0);f.db.close();
 const g=fixture({client:{leaveTypes:async()=>{calls++;return [];}}});await g.service.tick();assert.equal(calls,2);g.db.close();
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);const h=fixture({client:{leaveTypes:async()=>{entered();await gate;return [{name:'病假'}];}}});const pending=h.service.refreshLeaveTypes(admin);await started;await assert.rejects(()=>createAttendanceService(h.deps).refreshLeaveTypes(admin),{status:409});release();await pending;h.db.close();
});

test('shared page size remains admin-only and durable while historical manual order is ignored and preserved',()=>{
 const f=fixture();assert.equal(f.service.displaySettings(reader).pageSize,20);assert.equal(f.service.displaySettings(reader).canManage,false);
 assert.throws(()=>f.service.saveDisplaySettings(reader,{pageSize:50}),{status:403});
 for(const pageSize of [30,0,'50',null])assert.throws(()=>f.service.saveDisplaySettings(admin,{pageSize}),{status:400});
 const legacy={categoryOrder:['未同步','白班'],pageSize:20};f.db.prepare('insert into settings values(?,?,?)').run('attendanceDisplay',JSON.stringify(legacy),'old');
 const before=f.service.snapshot(admin,{month:'2026-09'});
 const saved=f.service.saveDisplaySettings(admin,{categoryOrder:'ignored legacy payload',pageSize:50});assert.equal(saved.categoryOrder[0],'白班');assert.ok(saved.updatedAt);
 assert.deepEqual(JSON.parse(f.db.prepare("select value from settings where key='attendanceDisplay'").get().value).categoryOrder,legacy.categoryOrder);
 const restarted=createAttendanceService(f.deps);assert.equal(restarted.displaySettings(reader).pageSize,50);
 const after=restarted.snapshot(admin,{month:'2026-09'});assert.deepEqual(after.people,before.people);assert.equal(f.calls,0);f.db.close();
});
test('new API leave types automatically appear before no-record/future, remain zero across months and keep classification unchanged',async()=>{
 const f=fixture({client:{leaveTypes:async()=>[{name:'新增护理假'},{name:'病假'}]}});const before=f.service.snapshot(admin,{month:'2026-09'});
 await f.service.refreshLeaveTypes(admin);
 for(const month of ['2026-09','2026-10']){const s=f.service.snapshot(admin,{month});assert.ok(s.categories.includes('新增护理假'));assert.ok(s.categories.indexOf('病假')<s.categories.indexOf('新增护理假'));if(s.categories.includes('未来日期'))assert.ok(s.categories.indexOf('新增护理假')<s.categories.indexOf('未来日期'));assert.ok(s.people.every(p=>!p.counts['新增护理假']));}
 assert.deepEqual(f.service.snapshot(admin,{month:'2026-09'}).people,before.people);assert.equal(f.calls,0);f.db.close();
});

test('excluded leave is not stored by catalog refresh and old persisted catalog cannot rediscover it',async()=>{const f=fixture({client:{leaveTypes:async()=>[{name:'新冠关爱假',code:'excluded'},{name:'婚假',code:'marriage'}]}});await f.service.refreshLeaveTypes(admin);assert.deepEqual(f.service.status(admin).leaveTypes.names,['婚假']);assert.ok(!f.db.prepare("select types_json from attendance_leave_catalog where id='enterprise'").get().types_json.includes('新冠关爱假'));f.db.prepare("update attendance_leave_catalog set types_json=? where id='enterprise'").run(JSON.stringify([{name:'新冠关爱假'},{name:'婚假'}]));assert.deepEqual(f.service.status(admin).leaveTypes.names,['婚假']);f.db.close();});

 test('global approval operations are hidden from scoped and non-managing viewers',()=>{
 const f=fixture({config:{approvalPlansEnabled:true}});f.service.approvalPlans.queue('outside-instance');
 for(const user of [reader,{...reader,all:true},{...reader,permissions:[...reader.permissions,'attendance.stats.read','attendance.record.manage']}]){
  assert.deepEqual(f.service.snapshot(user,{month:'2026-10'}).approvalPlanStatus,{enabled:true});assert.equal(f.service.status(user).approvalPlans,null);
 }
 assert.equal(Number(f.service.snapshot(admin,{month:'2026-10'}).approvalPlanStatus.queue.pending),1);f.db.close();
 });
