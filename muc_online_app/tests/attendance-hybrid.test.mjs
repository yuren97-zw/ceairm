import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {configuration,DingTalkError} from '../attendance-dingtalk.mjs';
import {createAttendanceService} from '../attendance-service.mjs';
import {attendancePeriods,sanitizeAttendanceEvent,attendanceDates} from '../attendance-hybrid.mjs';
import {createAttendanceStream,streamReply} from '../attendance-stream.mjs';
const admin={id:'admin',all:true},reader={id:'reader',personId:'p1'};
function fixture(options={}){
 const db=new DatabaseSync(':memory:');db.exec("create table settings(key text primary key,value text,updated_at text);create table personnel(id text primary key,employee_no text,name text,department text,home_team text,data_status text);insert into personnel values('p1','54000001','一','航线','一组','active'),('p2','54000002','二','航线','二组','active');");
 let time=Date.parse('2026-10-24T12:29:00+08:00');const calls=[];
 const client={directory:async()=>{calls.push(['directory']);return {departments:[],users:[1,2].map(n=>({userId:'u'+n,employeeNo:'5400000'+n,name:String(n),departmentIds:[]}))};},leaveTypes:async()=>[],results:async(ids,from,to)=>{calls.push(['results',ids,from,to]);return [];},schedules:async(ids,from,to)=>{calls.push(['schedules',ids,from,to]);return [];},day:async(id,date)=>{calls.push(['day',id,date]);return {userid:id,work_date:Date.parse(date+'T00:00:00+08:00'),attendance_result_list:[],approve_list:[],check_record_list:[]};},approval:async()=>({status:'COMPLETED',result:'agree',formComponentValues:[{name:'出差事由',value:'培训'}]}),...options.client};
 const deps={db,client,clock:()=>time,config:{...configuration({DINGTALK_APP_KEY:'test',DINGTALK_APP_SECRET:'private-secret',DINGTALK_OP_USER_ID:'op',DINGTALK_ROOT_DEPT_ID:'1',ATTENDANCE_WORKER_ENABLED:'true',DINGTALK_CORP_ID:'corp',DINGTALK_UNIFIED_APP_ID:'app'}),...options.config},personnelAccess:{predicate:u=>u.all?{sql:'1=1',params:[]}:{sql:'p.id=?',params:[u.personId]},hasAll:u=>!!u.all},hasRbac:()=>true,isAdmin:options.isAdmin||(()=>false),audit:()=>{}};
 const service=createAttendanceService(deps);
 return {db,service,deps,calls,get time(){return time;},set time(v){time=typeof v==='string'?Date.parse(v):v;},async drain(n=40){for(let i=0;i<n;i++)await service.tick();},close(){service.stop();db.close();}};
}
const frame=(id,topic,payload)=>({type:'EVENT',headers:{eventId:id,messageId:'m-'+id,eventType:topic,eventCorpId:'corp',eventUnifiedAppId:'app'},data:JSON.stringify(payload)});
test('schedule omission waits for complete day and retains provenance without guessing rest',async()=>{
 const {scheduleResponse}=await import('../attendance-response-validation.mjs');
 const f=fixture({client:{schedules:async()=>scheduleResponse({errcode:0,success:true})}});
 f.service.enqueue({from:'2026-10-23',to:'2026-10-23',user:admin});await f.service.tick();await f.service.tick();
 assert.equal(f.db.prepare('select count(*) as n from attendance_schedule_cache').get().n,0);
 await f.drain();const row=f.db.prepare("select input_json,result_json from attendance_days where person_id='p1'").get();
 assert.equal(JSON.parse(row.result_json).category,'无记录');assert.equal(JSON.parse(row.input_json).rest,false);
 assert.equal(JSON.parse(row.input_json).raw.scheduleReadEvidence.status,'empty_confirmed');
 assert.equal(f.db.prepare('select count(*) as n from attendance_schedule_cache').get().n,2);f.close();
});
test('omitted schedule conflicts with authoritative planned points and never overwrites saved source or cache',async()=>{
 const {scheduleResponse}=await import('../attendance-response-validation.mjs');const f=fixture();await seed(f);
 const before=f.db.prepare("select * from attendance_days where person_id='p1'").get();
 f.deps.client.schedules=async()=>scheduleResponse({errcode:0,success:true});
 f.deps.client.day=async(id,date)=>({userid:id,work_date:Date.parse(date+'T00:00:00+08:00'),attendance_result_list:[{plan_check_time:Date.parse(date+'T09:00:00+08:00')}],approve_list:[],check_record_list:[]});
 f.db.prepare("update attendance_schedule_cache set schedules_json='[{\"id\":\"keep\"}]' where person_id='p1'").run();
 f.service.enqueue({from:'2026-10-23',to:'2026-10-23',user:admin});await f.drain();
 assert.deepEqual(f.db.prepare("select * from attendance_days where person_id='p1'").get(),before);
 assert.equal(f.db.prepare("select schedules_json from attendance_schedule_cache where person_id='p1'").get().schedules_json,'[{"id":"keep"}]');
 const failed=f.db.prepare("select error from attendance_tasks where person_id='p1' and status='failed'").get();assert.match(failed.error,/SCHEDULE_CONFLICT/);assert.match(failed.error,/接口/);assert.match(failed.error,/字段 plan_check_time/);f.close();
});
test('later successful targeted read links old failure without rewriting history',async()=>{
 const f=fixture({client:{schedules:async()=>{throw Object.assign(Error('bad schema'),{code:'SCHEMA',endpoint:'/topapi/attendance/schedule/listbyusers',field:'result',responseType:'missing'});}}});
 const old=f.service.enqueue({from:'2026-10-23',to:'2026-10-23',user:admin});for(let i=0;i<6;i++){await f.drain(5);f.time+=3600001;}
 const failed=f.db.prepare("select * from attendance_tasks where run_id=? and person_id='p1'").get(old.id);assert.equal(failed.status,'failed');
 f.deps.client.schedules=async()=>[];const next=f.service.enqueue({from:'2026-10-23',to:'2026-10-23',user:admin});await f.drain();
 assert.deepEqual(f.db.prepare('select * from attendance_tasks where id=?').get(failed.id),failed);
 assert.equal(f.service.hybrid.state('taskRecovery:'+failed.id).recoveredByRunId,next.id);
 assert.equal(f.service.status(admin).runs.find(r=>r.id===old.id).recoveredCount,2);
 assert.match(f.service.status(admin).runs.find(r=>r.id===old.id).error,/后续权威补查恢复/);f.close();
});
test('October manual-only stage preserves pending events and recovery while running manual work',async()=>{
 assert.equal(configuration({ATTENDANCE_START_DATE:'2026-10-01'}).startDate,'2026-10-01');
 for(const date of ['2026-02-30','2026-09-31','2026-08-01','bad'])assert.throws(()=>configuration({ATTENDANCE_START_DATE:date}));
 const f=fixture({config:{startDate:'2026-10-01',manualOnly:true,enabled:true}});
 f.service.hybrid.setState('recoveryNeeded',{since:'2026-09-01',reason:'old gap'});
 f.service.hybrid.receive(frame('held','attendance_check_record',{userId:'u1',checkTime:Date.parse('2026-10-24T08:00:00+08:00')}));
 assert.throws(()=>f.service.enqueue({from:'2026-09-30',to:'2026-10-01',system:true}),/2026-10-01/);
 assert.throws(()=>f.service.enqueue({from:'2026-10-01',to:'2026-10-01',system:true,source:'event'}),/仅允许手动/);
 f.service.enqueue({from:'2026-10-23',to:'2026-10-23',system:true});await f.drain();
 assert.equal(f.db.prepare("select status from attendance_events where id='held'").get().status,'pending');
 assert.ok(f.service.hybrid.state('recoveryNeeded'));
 assert.equal(f.db.prepare("select count(*) as n from attendance_run_meta where source<>'manual'").get().n,0);
 assert.ok(f.calls.some(c=>c[0]==='day'));f.close();
});
async function seed(f){f.service.enqueue({from:'2026-10-23',to:'2026-10-23',user:admin});await f.drain();f.calls.length=0;}
test('October real-time scope excludes legacy dirty September and bounds recovery and scheduled periods',()=>{
 const f=fixture({config:{startDate:'2026-10-01',enabled:true}});
 f.db.prepare("insert into attendance_refresh(person_id,work_date,generation,due_at) values('p1','2026-09-30',1,'2026-09-30T00:00:00Z')").run();
 f.db.prepare("insert into attendance_refresh(person_id,work_date,generation,due_at) values('p1','2026-10-01',1,'2026-10-01T00:00:00Z')").run();
 f.service.hybrid.promote();
 assert.deepEqual(f.db.prepare("select from_date,to_date from attendance_runs").all().map(r=>({...r})),[{from_date:'2026-10-01',to_date:'2026-10-01'}]);
 f.service.hybrid.recover(null);assert.equal(f.service.hybrid.state('recovery').from,'2026-10-01');
 f.time='2026-10-03T12:00:00+08:00';f.service.hybrid.schedule();
 assert.equal(f.db.prepare("select count(*) as n from attendance_runs where from_date<'2026-10-01'").get().n,0);
 assert.equal(f.db.prepare("select count(*) as n from attendance_runs where id like 'hybrid-monthly%'").get().n,0);f.close();
});
test('Beijing daily, previous calendar week and previous month cross year/leap boundaries',()=>{
 assert.deepEqual(attendancePeriods('2027-01-05').weekly,{from:'2026-12-28',to:'2027-01-03',minute:600,eligible:true});
 assert.equal(attendancePeriods('2026-10-27').daily.from,'2026-10-26');
 assert.equal(attendancePeriods('2026-10-26').daily.from,'2026-10-25');
 assert.deepEqual(attendancePeriods('2028-03-03').monthly,{from:'2028-02-01',to:'2028-02-29',minute:690,eligible:true});
});
test('three switches default off; scheduler can create tasks with worker paused, never executes APIs',async()=>{
 const defaults=configuration({});assert.equal(defaults.workerEnabled,false);assert.equal(defaults.eventsEnabled,false);assert.equal(defaults.enabled,false);
 const f=fixture({config:{enabled:true,workerEnabled:false}});f.time='2026-10-27T10:00:00+08:00';await f.service.tick();
 assert.equal(f.calls.length,0);assert.ok(f.db.prepare("select id from attendance_runs where id like 'hybrid-weekly%'").get());
 assert.equal(f.db.prepare('select count(*) as n from attendance_tasks').get().n,0);f.close();
});
test('daily exact 12:30; Tuesday exact 10:00; month day3 exact11:30, no old timers or shift-close',()=>{
 const f=fixture({config:{enabled:true}});const h=f.service.hybrid;
 h.schedule();assert.equal(f.db.prepare("select id from attendance_runs where id like 'hybrid-daily%'").get(),undefined);
 f.time='2026-10-24T12:30:00+08:00';h.schedule();h.schedule();assert.equal(f.db.prepare("select count(*) as n from attendance_runs where id like 'hybrid-daily%'").get().n,1);
 f.time='2026-10-27T09:59:00+08:00';h.schedule();assert.equal(f.db.prepare("select id from attendance_runs where id like 'hybrid-weekly%'").get(),undefined);
 f.time='2026-10-27T10:00:00+08:00';h.schedule();assert.deepEqual({...f.db.prepare("select from_date,to_date from attendance_runs where id like 'hybrid-weekly%'").get()},{from_date:'2026-10-19',to_date:'2026-10-25'});
 f.time='2026-11-03T11:29:00+08:00';h.schedule();assert.equal(f.db.prepare("select id from attendance_runs where id like 'hybrid-monthly%'").get(),undefined);
 f.time='2026-11-03T11:30:00+08:00';h.schedule();assert.deepEqual({...f.db.prepare("select from_date,to_date from attendance_runs where id like 'hybrid-monthly%'").get()},{from_date:'2026-10-01',to_date:'2026-10-31'});
 assert.equal(f.db.prepare("select id from attendance_runs where id like 'scheduled-%' or id like '%close%'").get(),undefined);f.close();
});
test('restart schedules missed days once; existing data prevents initial-backfill duplication',async()=>{
 const f=fixture({config:{enabled:false}});await seed(f);f.deps.config.enabled=true;f.service.hybrid.schedule();
 f.time='2026-10-28T13:00:00+08:00';const second=createAttendanceService(f.deps);second.hybrid.schedule();second.hybrid.schedule();
 assert.equal(f.db.prepare("select count(*) as n from attendance_runs where id like 'hybrid-daily%'").get().n,5);
 assert.equal(f.db.prepare("select id from attendance_runs where id='initial-backfill'").get(),undefined);second.stop();f.close();
});
test('durable dedup, data minimization, scope validation, ACK protocol and unsupported event visibility',()=>{
 const f=fixture();const e=frame('one','attendance_check_record',{userId:'u1',checkTime:123,latitude:111,title:'private',deviceId:'secret'});
 f.service.hybrid.receive(e);f.service.hybrid.receive(e);const row=f.db.prepare('select * from attendance_events').get();assert.equal(f.db.prepare('select count(*) as n from attendance_events').get().n,1);assert.ok(!row.payload_json.includes('private'));assert.ok(!row.payload_json.includes('latitude'));
 assert.throws(()=>sanitizeAttendanceEvent({...e,headers:{...e.headers,eventCorpId:'other'}},f.deps.config),/EVENT_SCOPE/);
 assert.equal(JSON.parse(streamReply(e).data).status,'SUCCESS');assert.equal(JSON.parse(streamReply(e,false).data).status,'LATER');
 f.service.hybrid.receive(frame('unsupported','other_topic',{}));assert.equal(f.service.status(admin).hybrid.events.find(r=>r.topic==='other_topic').status,'unsupported');f.close();
});
test('60-second trailing debounce, maximum 3min, cross-night targeted days and restart persistence',async()=>{
 const f=fixture();await seed(f);const h=f.service.hybrid;
 h.receive(frame('punch1','attendance_check_record',{userId:'u1',checkTime:Date.parse('2026-10-24T07:00:00+08:00')}));h.processEvents();h.promote();assert.equal(f.calls.length,0);
 const due1=f.db.prepare("select due_at from attendance_refresh where person_id='p1' and work_date='2026-10-23'").get().due_at;
 f.time+=50000;h.receive(frame('punch2','attendance_check_record',{userId:'u1',checkTime:Date.parse('2026-10-24T07:02:00+08:00')}));h.processEvents();
 const due2=f.db.prepare("select due_at from attendance_refresh where person_id='p1' and work_date='2026-10-23'").get().due_at;assert.ok(due2>due1);
 f.time+=140000;h.receive(frame('punch3','attendance_check_record',{userId:'u1',checkTime:Date.parse('2026-10-24T07:03:00+08:00')}));h.processEvents();
 const second=createAttendanceService(f.deps);await second.tick();await f.drain();
 assert.deepEqual(f.calls.filter(c=>c[0]==='day').map(c=>c.slice(1)).sort(),[['u1','2026-10-23'],['u1','2026-10-24']]);assert.equal(f.calls.filter(c=>c[0]==='directory').length,0);assert.equal(f.service.hybrid.metrics()[0].completed,3);assert.ok(f.service.hybrid.metrics()[0].maxApplySeconds>=180);
 second.stop();f.close();
});
test('fresh completed period is reused for 24h; new event invalidates it and incomplete data never fresh',async()=>{
 const f=fixture();await seed(f);assert.equal(f.service.hybrid.fresh('p1','2026-10-23'),true);
 f.service.enqueue({from:'2026-10-23',to:'2026-10-23',source:'daily',system:true});await f.drain();assert.equal(f.calls.filter(c=>c[0]==='day').length,0);
 f.service.hybrid.dirty('p1','2026-10-23');assert.equal(f.service.hybrid.fresh('p1','2026-10-23'),false);
 f.time+=61000;await f.drain();assert.equal(f.calls.filter(c=>c[0]==='day').length,1);assert.equal(f.service.hybrid.fresh('p1','2026-10-23'),true);
 f.time+=86400001;assert.equal(f.service.hybrid.fresh('p1','2026-10-23'),false);f.close();
});
test('generation change during source read cannot be cleared by completing the older read',async()=>{
 const f=fixture();await seed(f);let change=true;
 f.db.prepare('update attendance_schedule_cache set invalidated_at=?').run('changed');
 f.deps.client.schedules=async()=>{if(change){f.service.hybrid.dirty('p1','2026-10-23');change=false;}return [];};
 f.service.enqueue({from:'2026-10-23',to:'2026-10-23',source:'event',targets:[{personId:'p1',date:'2026-10-23'}],system:true});await f.drain();
 assert.equal(f.service.hybrid.fresh('p1','2026-10-23'),false);f.time+=61000;await f.drain();assert.equal(f.service.hybrid.fresh('p1','2026-10-23'),true);f.close();
});
test('approval changes dirty union of old and new dates; unknown business period broadens safely',async()=>{
 const f=fixture();await seed(f);const old={date:'2026-09-01',covered:true,approvals:[{id:'approval',kind:'出差'}]};
 f.db.prepare('insert into attendance_days values(?,?,?,?,?,?,?)').run('p1','2026-09-01',JSON.stringify(old),'{}','h','2026-09-01T00:00:00Z','old');
 f.service.hybrid.receive(frame('a1','bpms_instance_change',{staffId:'u1',processInstanceId:'approval',beginTime:'2026-10-20 09:00:00',endTime:'2026-10-21 18:00:00'}));f.service.hybrid.processEvents();
 for(const date of ['2026-09-01','2026-10-20','2026-10-21'])assert.ok(f.db.prepare('select due_at from attendance_refresh where person_id=? and work_date=?').get('p1',date).due_at);
 f.service.hybrid.receive(frame('a2','bpms_instance_change',{staffId:'u1',processInstanceId:'approval',startTime:1,finishTime:2}));f.service.hybrid.processEvents();
 assert.match(f.db.prepare('select error from attendance_events where id=?').get('a2').error,/全部已发生期间/);assert.ok(f.db.prepare("select due_at from attendance_refresh where person_id='p1' and work_date='2026-10-24'").get().due_at);f.close();
});
test('cross-run event approval cache reused and invalidated, manual audits revalidate',async()=>{
 let approvals=0;const f=fixture({client:{approval:async()=>{approvals++;return {status:'COMPLETED',result:'agree',formComponentValues:[{name:'出差事由',value:'培训'}]};},day:async()=>({attendance_result_list:[],check_record_list:[],approve_list:[{tag_name:'出差',procInst_id:'a',begin_time:1,end_time:9999999999999}]})}});
 const run=async source=>{f.service.enqueue({from:'2026-10-23',to:'2026-10-23',source,targets:[{personId:'p1',date:'2026-10-23'}],system:true});await f.drain();};
 await run('manual');assert.equal(approvals,1);await run('event');assert.equal(approvals,1);await run('weekly');assert.equal(approvals,1); // fresh full source verification reused
 await run('manual');assert.equal(approvals,2);
 f.service.hybrid.receive(frame('invalidate','bpms_instance_change',{staffId:'u1',processInstanceId:'a',beginTime:'2026-10-23',endTime:'2026-10-23'}));f.service.hybrid.processEvents();await run('event');assert.equal(approvals,3);f.close();
});
test('partial failures retain good data, block freshness and do not retry forever',async()=>{
 const f=fixture();await seed(f);f.deps.client.day=async()=>{throw new DingTalkError('private','60011');};f.service.hybrid.dirty('p1','2026-10-23');f.time+=61000;await f.drain();
 assert.equal(f.db.prepare('select count(*) as n from attendance_days').get().n,2);assert.equal(f.service.hybrid.fresh('p1','2026-10-23'),false);assert.ok(f.service.status(admin).hybrid.missing.length);const runs=f.db.prepare('select count(*) as n from attendance_runs').get().n;await f.drain();assert.equal(f.db.prepare('select count(*) as n from attendance_runs').get().n,runs);f.close();
});
test('pending task dedup links runs until authoritative task finishes, and respects visibility',async()=>{
 const f=fixture();await seed(f);f.service.enqueue({from:'2026-10-23',to:'2026-10-23',user:admin});await f.service.tick();
 f.service.enqueue({from:'2026-10-23',to:'2026-10-23',user:admin});await f.service.tick();
 assert.equal(f.db.prepare('select count(*) as n from attendance_task_links').get().n,2);await f.drain();assert.equal(f.calls.filter(c=>c[0]==='day').length,2);
 f.service.hybrid.dirty('p2','2026-10-23');assert.equal(f.service.status(reader).hybrid.pendingPeopleDays,0);assert.deepEqual(f.service.status(reader).hybrid.apiCounts,[]);f.close();
});
test('recovery includes previous attribution date, unknown gap uses prior/current month, retains explicit range',()=>{
 const f=fixture();f.service.hybrid.recover(Date.parse('2026-10-23T21:00:00+08:00'));assert.equal(f.service.hybrid.state('recovery').from,'2026-10-22');
 f.service.hybrid.recover(null);assert.equal(f.service.hybrid.state('recovery').from,'2026-09-01');f.close();
});
test('Stream ACK only after durable receive and failure returns LATER; ping echoes opaque',async()=>{
 const f=fixture(),sent=[];let socket;
 class FakeSocket{constructor(){socket=this;}send(v){sent.push(JSON.parse(v));}close(){}}
 const stream=createAttendanceStream({db:f.db,config:{...f.deps.config,eventsEnabled:true},coordinator:f.service.hybrid,clock:f.deps.clock,WebSocketImpl:FakeSocket,fetchImpl:async()=>({ok:true,json:async()=>({endpoint:'wss://wss-open-connection.dingtalk.com/connect',ticket:'private-ticket'})})});
 stream.start();await new Promise(r=>setImmediate(r));socket.onopen();
 await stream.handle(frame('persist','attendance_check_record',{userId:'u1',checkTime:f.time}));assert.ok(f.db.prepare("select id from attendance_events where id='persist'").get());assert.equal(JSON.parse(sent.at(-1).data).status,'SUCCESS');
 await stream.handle({...frame('bad','attendance_check_record',{userId:'u1'}),headers:{eventType:'attendance_check_record',messageId:'bad',eventCorpId:'other'}});assert.equal(JSON.parse(sent.at(-1).data).status,'LATER');assert.equal(f.db.prepare("select id from attendance_events where id='bad'").get(),undefined);
 await stream.handle({type:'SYSTEM',headers:{topic:'ping',messageId:'ping'},data:'{"opaque":"echo"}'});assert.equal(JSON.parse(sent.at(-1).data).opaque,'echo');
 assert.ok(!JSON.stringify(f.service.hybrid.state('stream')).includes('private-ticket'));assert.ok(f.service.hybrid.state('recoveryNeeded'));stream.stop();f.close();
});

test('punch refresh reuses recent schedule only, never extends full-audit freshness; schedule changes invalidate cache',async()=>{
 const f=fixture();await seed(f);const verified=f.db.prepare("select verified_at from attendance_refresh where person_id='p1' and work_date='2026-10-23'").get().verified_at;
 f.time+=61000;f.service.hybrid.dirty('p1','2026-10-23');f.time+=61000;await f.drain();
 assert.equal(f.calls.filter(c=>c[0]==='day').length,1);assert.equal(f.calls.filter(c=>c[0]==='schedules'||c[0]==='results').length,0);
 assert.equal(f.db.prepare("select verified_at from attendance_refresh where person_id='p1' and work_date='2026-10-23'").get().verified_at,verified);
 f.calls.length=0;f.service.hybrid.receive(frame('schedule','attendance_schedule_change',{userIds:['u1'],workDateBegin:'2026-10-23',workDateEnd:'2026-10-23',type:'delete'}));f.service.hybrid.processEvents();f.time+=61000;await f.drain();assert.equal(f.calls.filter(c=>c[0]==='schedules').length,1);assert.equal(f.calls.filter(c=>c[0]==='results').length,1);f.close();
});

test('internal recovery dates can span years, while individual manual jobs remain bounded',()=>{
 assert.equal([...attendanceDates('2026-09-01','2028-09-01')].length,732);
 const f=fixture();f.time='2028-09-01T12:00:00+08:00';f.service.hybrid.recover(Date.parse('2026-09-02T00:00:00+08:00'));assert.equal(f.service.hybrid.state('recovery').ids.length,25);f.close();
});
test('attendance-specific approval event resolves user from workflow without retaining unrelated form fields',async()=>{
 const f=fixture({client:{approval:async()=>({originatorUserId:'u1',formComponentValues:[{name:'private',value:'do-not-retain'}]})}});await seed(f);
 f.service.hybrid.receive(frame('attendance-approval','attendance_approve_status_change',{processInstanceId:'new-instance',status:'finish',approveType:'LEAVE'}));await f.service.tick();
 const row=f.db.prepare("select * from attendance_events where id='attendance-approval'").get();assert.equal(row.status,'handled');assert.ok(!row.payload_json.includes('do-not-retain'));assert.equal(JSON.parse(row.payload_json).staffId,'u1');f.close();
});

test('real ping/pong keeps quiet connection alive, second instance cannot replace it, stop releases lease',async()=>{
 const f=fixture();let creates=0,ws;const handlers={};
 class Socket{constructor(){creates++;ws=this;this.readyState=1;}on(name,fn){handlers[name]=fn;}ping(){handlers.pong();}close(){}removeAllListeners(){}terminate(){}}
 const args={db:f.db,config:{...f.deps.config,eventsEnabled:true},coordinator:f.service.hybrid,clock:f.deps.clock,WebSocketImpl:Socket,fetchImpl:async()=>({ok:true,json:async()=>({endpoint:'wss://wss-open-connection.dingtalk.com/connect',ticket:'private'})})};
 const first=createAttendanceStream(args);first.start();await new Promise(r=>setImmediate(r));ws.onopen();
 for(let n=0;n<4;n++){f.time+=31000;await first.tick();}assert.equal(creates,1);assert.equal(f.service.hybrid.state('stream').connected,true);assert.equal(f.service.hybrid.state('stream').heartbeatAt,new Date(f.time).toISOString());
 const second=createAttendanceStream(args);second.start();await new Promise(r=>setImmediate(r));assert.equal(creates,1);second.stop();assert.equal(f.service.hybrid.state('stream').connected,true);
 first.stop();assert.equal(f.db.prepare("select owner from attendance_leases where id='stream'").get(),undefined);assert.equal(f.service.hybrid.state('stream').connected,false);f.close();
});
test('local scheduled endpoint changes status clockBoundary without calling DingTalk',async()=>{
 const f=fixture();await seed(f);const row=f.db.prepare("select * from attendance_days where person_id='p1' and work_date='2026-10-23'").get();const input=JSON.parse(row.input_json);input.points=[{planned:f.time+1000,type:'OffDuty'}];f.db.prepare('update attendance_days set input_json=? where person_id=? and work_date=?').run(JSON.stringify(input),'p1','2026-10-23');
 assert.equal(f.service.status(reader).clockBoundary,0);f.time+=1001;assert.equal(f.service.status(reader).clockBoundary,input.points[0].planned);assert.equal(f.calls.length,0);f.close();
});

test('identical source rows reordered or duplicated by full/result endpoints do not create false change history',async()=>{
 const date='2026-10-23',on=Date.parse(date+'T08:30:00+08:00'),off=Date.parse(date+'T17:00:00+08:00');
 const dayRows=[{check_type:'OnDuty',plan_check_time:on,user_check_time:on,plan_id:'a',record_id:'ra',source_type:'USER',time_result:'Normal'},{check_type:'OffDuty',plan_check_time:off,user_check_time:off+1000,plan_id:'b',record_id:'rb',source_type:'USER',time_result:'Normal'}];
 const f=fixture({client:{day:async()=>({attendance_result_list:dayRows,check_record_list:[],approve_list:[]}),results:async()=>dayRows.map(r=>({userId:'u1',workDate:on,checkType:r.check_type,baseCheckTime:r.plan_check_time,userCheckTime:r.user_check_time,planId:r.plan_id,recordId:r.record_id,sourceType:r.source_type,timeResult:r.time_result})),schedules:async()=>dayRows.map(r=>({userid:'u1',work_date:on,id:r.plan_id,is_rest:'N',check_type:r.check_type,plan_check_time:r.plan_check_time}))}});
 const enqueue=()=>f.service.enqueue({from:date,to:date,source:'event',targets:[{personId:'p1',date}],system:true});enqueue();await f.drain();dayRows.reverse();enqueue();await f.drain();assert.equal(f.db.prepare('select count(*) as n from attendance_changes').get().n,0);f.close();
});

test('a successful query before a shift closes cannot skip the next full audit, including rest/no-schedule days',async()=>{
 const f=fixture();f.service.enqueue({from:'2026-10-24',to:'2026-10-24',user:admin});await f.drain();assert.equal(f.service.hybrid.fresh('p1','2026-10-24'),false);
 const row=f.db.prepare("select input_json from attendance_days where person_id='p1' and work_date='2026-10-24'").get();const input=JSON.parse(row.input_json);input.points=[{type:'OffDuty',planned:Date.parse('2026-10-25T08:30:00+08:00')}];f.db.prepare("update attendance_days set input_json=? where person_id='p1' and work_date='2026-10-24'").run(JSON.stringify(input));
 f.time='2026-10-25T12:30:00+08:00';assert.equal(f.service.hybrid.fresh('p1','2026-10-24'),false);f.close();
});

test('PostgreSQL-style int8 count strings do not keep zero-pending runs stuck or mark them partial',async()=>{
 const f=fixture();const row=r=>r&&Object.fromEntries(Object.entries(r).map(([k,v])=>[k,k==='n'?String(v):v]));
 const db={exec:sql=>f.db.exec(sql),prepare(sql){const stmt=f.db.prepare(sql);return {get:(...p)=>row(stmt.get(...p)),all:(...p)=>stmt.all(...p).map(row),run:(...p)=>stmt.run(...p)};}};
 const service=createAttendanceService({...f.deps,db});service.enqueue({from:'2026-10-23',to:'2026-10-23',user:admin});for(let i=0;i<20;i++)await service.tick();assert.equal(service.status(admin).runs[0].status,'completed');service.stop();f.close();
});

test('event parser accepts canonical case and designated nested transport envelopes',()=>{
 const f=fixture();for(const data of [{UserId:'u1',CheckTime:123},{Data:{user_id:'u1',check_time:123}},{data:JSON.stringify({UserID:'u1',Check_Time:123})}]){const e=sanitizeAttendanceEvent(frame('case','attendance_check_record',data),f.deps.config);assert.equal(e.usable,true);assert.equal(e.payload.userId,'u1');assert.equal(e.payload.checkTime,123);}f.close();
});
test('event parser rejects conflicting identities and never scans arbitrary form or title JSON',()=>{
 const f=fixture();const e=sanitizeAttendanceEvent(frame('conflict','attendance_check_record',{userId:'u1',Data:{UserId:'u2'},checkTime:123,title:'{"userId":"u3"}',formComponentValues:[{userId:'u4'}]}),f.deps.config);assert.equal(e.usable,false);assert.equal(e.payload.userId,undefined);assert.ok(!JSON.stringify(e.payload).includes('u3'));assert.ok(!JSON.stringify(e.payload).includes('u4'));f.close();
});
test('missing event fields persist before LATER and corrected retries replace only the failed event',()=>{
 const f=fixture();assert.throws(()=>f.service.hybrid.receive(frame('broken','attendance_check_record',{unknownValue:1})),/EVENT_FIELDS_MISSING/);assert.equal(f.db.prepare("select status from attendance_events where id='broken'").get().status,'schema_missing');assert.equal(f.service.hybrid.state('recoveryNeeded').since,null);f.service.hybrid.receive(frame('broken','attendance_check_record',{Data:{UserId:'u1',CheckTime:123}}));assert.equal(f.db.prepare('select count(*) as n from attendance_events').get().n,1);assert.equal(f.db.prepare("select status from attendance_events where id='broken'").get().status,'pending');f.close();
});
test('legacy incomplete acknowledged events become visible recovery gaps without source changes',async()=>{
 const f=fixture();await seed(f);f.db.prepare('insert into attendance_events(id,topic,payload_json,received_at,status) values(?,?,?,?,?)').run('legacy','attendance_check_record','{"_eventBornAt":123}',new Date(f.time).toISOString(),'pending');const second=createAttendanceService(f.deps);assert.equal(f.db.prepare("select status from attendance_events where id='legacy'").get().status,'schema_missing');assert.equal(f.db.prepare('select count(*) as n from attendance_days').get().n,2);assert.equal(f.db.prepare('select count(*) as n from attendance_run_meta').get().n,1);second.stop();f.close();
});

test('real dataList batches retain each identity/time pair and duplicate delivery does not redirty',async()=>{
 const f=fixture();await seed(f);const msg=frame('real-list','attendance_check_record',{eventId:'vendor',dataList:[{userId:'u1',checkTime:Date.parse('2026-10-23T12:00:00+08:00'),latitude:12},{userId:'u2',checkTime:Date.parse('2026-10-24T08:00:00+08:00')} ]});
 f.service.hybrid.receive(msg);f.service.hybrid.processEvents();const before=f.db.prepare('select * from attendance_refresh order by person_id,work_date').all();assert.ok(before.some(r=>r.person_id==='p1'&&r.work_date==='2026-10-23'));assert.ok(!before.some(r=>r.person_id==='p1'&&r.work_date==='2026-10-24'));assert.ok(!before.some(r=>r.person_id==='p2'&&r.work_date==='2026-10-22'));f.service.hybrid.receive(msg);f.service.hybrid.processEvents();assert.deepEqual(f.db.prepare('select * from attendance_refresh order by person_id,work_date').all(),before);assert.ok(!f.db.prepare("select payload_json from attendance_events where id='real-list'").get().payload_json.includes('latitude'));f.close();
});
test('same employee multiple punch times stay separate, including DataList alias',()=>{
 const f=fixture();const e=sanitizeAttendanceEvent(frame('times','attendance_check_record',{DataList:[{userId:'u1',checkTime:123},{userId:'u1',checkTime:456}]}),f.deps.config);assert.equal(e.usable,true);assert.deepEqual(e.payload.records.map(r=>r.payload.checkTime),[123,456]);f.close();
});
test('partial invalid batch persists valid children, rejects ACK and retries without duplicating them',()=>{
 const f=fixture();const bad=frame('partial','attendance_check_record',{dataList:[{userId:'u1',checkTime:123},{userId:'u2'}]});assert.throws(()=>f.service.hybrid.receive(bad),/EVENT_FIELDS_MISSING/);assert.equal(f.db.prepare("select count(*) as n from attendance_events where status='pending'").get().n,1);f.service.hybrid.receive(frame('partial','attendance_check_record',{dataList:[{userId:'u1',checkTime:123},{userId:'u2',checkTime:456}]}));assert.equal(f.db.prepare('select count(*) as n from attendance_events').get().n,3);assert.equal(f.db.prepare("select count(*) as n from attendance_events where status='pending'").get().n,2);f.close();
});
test('empty oversized and nested batches cannot be silently truncated or ACKed',()=>{
 const f=fixture();for(const dataList of [[],Array(1001).fill({userId:'u1',checkTime:123}),[{dataList:[{userId:'u1',checkTime:123}]}]])assert.equal(sanitizeAttendanceEvent(frame('invalid','attendance_check_record',{dataList}),f.deps.config).usable,false);f.close();
});
test('validation mode fails closed, suppresses recovery and timers, holds excluded people',async()=>{
 assert.throws(()=>configuration({ATTENDANCE_VALIDATION_ENABLED:'true'}),/VALIDATION_SCOPE/);
 const f=fixture();await seed(f);Object.assign(f.deps.config,{enabled:true,eventsEnabled:true,validation:{enabled:true,personIds:['p1'],from:'2026-10-23',to:'2026-10-24'}});f.service.hybrid.setState('recoveryNeeded',{since:null});
 f.service.hybrid.receive(frame('scope','attendance_check_record',{dataList:[{userId:'u1',checkTime:Date.parse('2026-10-24T08:00:00+08:00')},{userId:'u2',checkTime:Date.parse('2026-10-24T08:00:00+08:00')}]}));f.time+=61000;await f.drain();f.time+=61000;await f.drain();
 assert.ok(f.db.prepare("select id from attendance_events where status='validation_held'").get());assert.ok(f.service.hybrid.state('recoveryNeeded'));assert.equal(f.db.prepare("select count(*) as n from attendance_run_meta where source<>'event'").get().n,1);assert.ok(f.calls.filter(c=>c[0]==='day').every(c=>c[1]==='u1'&&c[2]>='2026-10-23'));assert.throws(()=>f.service.enqueue({from:'2026-10-23',to:'2026-10-24',user:admin}),/隔离验收/);f.close();
});
test('validation worker cannot execute previously queued out-of-scope work',async()=>{
 const f=fixture();await seed(f);f.service.enqueue({from:'2026-10-23',to:'2026-10-23',source:'event',system:true,targets:[{personId:'p2',date:'2026-10-23'}]});f.deps.config.validation={enabled:true,personIds:['p1'],from:'2026-10-23',to:'2026-10-24'};await f.drain();assert.equal(f.calls.length,0);f.close();
});

test('validation guard also blocks an already prepared out-of-scope batch',async()=>{
 const f=fixture();await seed(f);f.service.enqueue({from:'2026-10-23',to:'2026-10-23',source:'event',system:true,targets:[{personId:'p2',date:'2026-10-23'}]});await f.service.tick();f.calls.length=0;f.deps.config.validation={enabled:true,personIds:['p1'],from:'2026-10-23',to:'2026-10-24'};await f.drain();assert.equal(f.calls.length,0);f.close();
});

test('limited validation holds approvals without fetching workflows or dirtying old history',async()=>{
 const f=fixture();await seed(f);f.deps.config.validation={enabled:true,personIds:['p1'],from:'2026-10-23',to:'2026-10-24'};f.deps.client.approval=async()=>{throw Error('must not query');};f.service.hybrid.receive(frame('held-approval','attendance_approve_status_change',{processInstanceId:'old',staffId:'u1',beginTime:'2026-09-01',endTime:'2026-10-24'}));await f.drain();assert.equal(f.db.prepare("select status from attendance_events where id='held-approval'").get().status,'validation_held');assert.equal(f.db.prepare('select count(*) as n from attendance_refresh where generation>verified_generation').get().n,0);assert.equal(f.calls.length,0);f.close();
});

test('expanded validation accepts exactly thirteen distinct people and rejects fourteen',()=>{
 const env={ATTENDANCE_VALIDATION_ENABLED:'true',ATTENDANCE_VALIDATION_FROM:'2026-10-24',ATTENDANCE_VALIDATION_TO:'2026-10-25',ATTENDANCE_VALIDATION_PERSON_IDS:Array.from({length:13},(_,i)=>'p'+i).join(',')};assert.equal(configuration(env).validation.personIds.length,13);assert.throws(()=>configuration({...env,ATTENDANCE_VALIDATION_PERSON_IDS:env.ATTENDANCE_VALIDATION_PERSON_IDS+',extra'}),/VALIDATION_SCOPE/);
});

test('validation initial sync has its own source, updates only scoped targets and cannot bypass system gate',async()=>{
 const f=fixture();await seed(f);f.deps.config.validation={enabled:true,personIds:['p1'],from:'2026-10-23',to:'2026-10-24'};const targets=[{personId:'p1',date:'2026-10-24'}];assert.throws(()=>f.service.enqueue({from:'2026-10-24',to:'2026-10-24',source:'validation_initial',targets,user:admin}),/受控验收/);assert.throws(()=>f.service.enqueue({from:'2026-10-24',to:'2026-10-24',source:'validation_initial',targets:[{personId:'p2',date:'2026-10-24'}],system:true}),/隔离验收/);const run=f.service.enqueue({from:'2026-10-24',to:'2026-10-24',source:'validation_initial',targets,system:true});await f.drain();assert.equal(f.db.prepare('select status from attendance_runs where id=?').get(run.id).status,'completed');assert.equal(f.db.prepare('select source from attendance_run_meta where run_id=?').get(run.id).source,'validation_initial');assert.ok(f.db.prepare("select person_id from attendance_days where person_id='p1' and work_date='2026-10-24'").get());assert.equal(f.db.prepare("select person_id from attendance_days where person_id='p2' and work_date='2026-10-24'").get(),undefined);assert.equal(f.db.prepare('select count(*) as n from attendance_events').get().n,0);f.close();
});

test('validation reconnect audits today only once per connection and retains global recovery gap',async()=>{
 const f=fixture();await seed(f);f.deps.config.validation={enabled:true,personIds:['p1'],from:'2026-10-23',to:'2026-10-24'};f.service.hybrid.setState('recoveryNeeded',{since:null});f.service.hybrid.setState('stream',{connected:true,connectedAt:new Date(f.time).toISOString()});await f.drain();await f.drain();const runs=f.db.prepare("select r.* from attendance_runs r join attendance_run_meta m on m.run_id=r.id where m.source='validation_recovery'").all();assert.equal(runs.length,1);assert.equal(runs[0].from_date,'2026-10-24');assert.equal(runs[0].to_date,'2026-10-24');assert.equal(runs[0].status,'completed');assert.ok(f.service.hybrid.state('recoveryNeeded'));assert.ok(f.calls.filter(c=>c[0]==='day').every(c=>c[1]==='u1'&&c[2]==='2026-10-24'));f.time+=1000;f.service.hybrid.setState('stream',{connected:true,connectedAt:new Date(f.time).toISOString()});await f.drain();assert.equal(f.db.prepare("select count(*) as n from attendance_run_meta where source='validation_recovery'").get().n,2);f.close();
});
test('snapshot reports source freshness without changing saved source rows or overtime totals',async()=>{
 const f=fixture();await seed(f);const on=Date.parse('2026-10-23T08:30:00+08:00'),off=Date.parse('2026-10-23T19:40:00+08:00');const row=f.db.prepare("select input_json from attendance_days where person_id='p1' and work_date='2026-10-23'").get();const data=JSON.parse(row.input_json);data.points=[{type:'OnDuty',planned:on,planId:'on'},{type:'OffDuty',planned:off,planId:'off'}];data.punches=[{type:'OnDuty',planned:on,actual:on,planId:'on',source:'USER',recordId:'on',valid:true,timeResult:'Normal'}];f.db.prepare("update attendance_days set input_json=?,updated_at=? where person_id='p1' and work_date='2026-10-23'").run(JSON.stringify(data),'2026-10-23T04:00:00Z');f.db.prepare("update attendance_task_marks set started_at='2026-10-23T04:00:00Z'").run();const snapshot=f.service.snapshot(admin,{month:'2026-10'});const day=snapshot.people.find(p=>p.personId==='p1').days.find(d=>d.date==='2026-10-23');assert.equal(day.category,'待核实');assert.equal(day.stale,true);assert.equal(f.db.prepare("select input_json from attendance_days where person_id='p1' and work_date='2026-10-23'").get().input_json,JSON.stringify(data));f.close();
});

test('month snapshots use authorized prior-month context for outing carry and invalidate versions',async()=>{
 const f=fixture();await seed(f);const on=Date.parse('2026-09-30T19:40:00+08:00'),off=Date.parse('2026-10-01T08:30:00+08:00');const a={id:'cross-month',kind:'外出',approved:true,revoked:false,start:on-86400000,end:off-3600000};const prev={date:'2026-09-30',covered:true,points:[{type:'OnDuty',planned:on},{type:'OffDuty',planned:off}],punches:[],approvals:[a]},rest={date:'2026-10-01',covered:true,rest:true,points:[],punches:[],approvals:[a]};for(const d of [prev,rest])f.db.prepare('insert into attendance_days values(?,?,?,?,?,?,?)').run('p1',d.date,JSON.stringify(d),'{}','old',new Date(f.time).toISOString(),'old');const snap=f.service.snapshot(reader,{month:'2026-10'});assert.equal(snap.people.length,1);assert.equal(snap.people[0].days.find(d=>d.date==='2026-10-01').category,'休息');assert.match(f.service.status(reader).dataVersion,/^attendance-api-1\.2:/);f.close();
});

test('approval reason job deduplicates instances, resumes without attendance queries and respects admin/scope',async()=>{
 let reads=0;const f=fixture({isAdmin:u=>u.id==='admin',client:{approval:async()=>{reads++;return {status:'COMPLETED',result:'agree',formComponentValues:[{id:'TextareaField-JYNRW51P',name:'外出事由',value:'跟班保障'},{name:'图片',value:'private-attachment'}]};}}});await seed(f);for(const row of f.db.prepare('select person_id,work_date,input_json from attendance_days').all()){const input=JSON.parse(row.input_json);input.approvals=[{id:'shared',kind:'外出',approved:true,start:1,end:9999999999999}];f.db.prepare('update attendance_days set input_json=? where person_id=? and work_date=?').run(JSON.stringify(input),row.person_id,row.work_date);}assert.throws(()=>f.service.enqueueApprovalReasons(reader),/管理员/);const job=f.service.enqueueApprovalReasons(admin,{from:'2026-10-23',to:'2026-10-23'});assert.equal(job.total,1);assert.equal(f.service.enqueueApprovalReasons(admin).id,job.id);await f.drain();assert.equal(reads,1);assert.equal(f.calls.length,0);assert.equal(f.service.status(admin).approvalReasonBackfill.status,'completed');assert.ok(!f.db.prepare("select detail_json from attendance_approval_cache where id='shared'").get().detail_json.includes('private-attachment'));const snap=f.service.snapshot(reader,{month:'2026-10'});assert.equal(snap.people.length,1);assert.equal(snap.people[0].days.find(d=>d.date==='2026-10-23').category,'跟班');assert.equal(snap.people[0].counts['外出']||0,0);assert.equal(snap.people[0].counts['跟班'],1);f.close();
});
test('approval reason partial failures retain successful reasons and expose incomplete coverage',async()=>{
 const f=fixture({isAdmin:()=>true,client:{approval:async()=>{throw new DingTalkError('denied','403');}}});await seed(f);const row=f.db.prepare("select input_json from attendance_days where person_id='p1' and work_date='2026-10-23'").get();const input=JSON.parse(row.input_json);input.approvals=[{id:'denied',kind:'请假',subType:'病假',approved:true,start:1,end:9999999999999}];f.db.prepare("update attendance_days set input_json=? where person_id='p1' and work_date='2026-10-23'").run(JSON.stringify(input));f.service.enqueueApprovalReasons(admin);await f.drain();assert.equal(f.service.status(admin).approvalReasonBackfill.failed,1);const day=f.service.snapshot(reader,{month:'2026-10'}).people[0].days.find(d=>d.date==='2026-10-23');assert.equal(day.input.approvals[0].reasonStatus,'permission_denied');assert.equal(day.category,'病假');assert.equal(f.service.snapshot(reader,{month:'2026-10'}).approvalReasonCoverage.unresolved,1);f.close();
});
test('approval reason backfill survives restart and repeated backfill reuses compatible cache',async()=>{
 let reads=0;const f=fixture({isAdmin:()=>true,client:{approval:async()=>{reads++;return {status:'COMPLETED',result:'agree',formComponentValues:[{name:'外出事由',value:'跟班'}]};}}});await seed(f);for(const row of f.db.prepare('select * from attendance_days').all()){const i=JSON.parse(row.input_json);i.approvals=[{id:row.person_id,kind:'外出',approved:true,start:1,end:9999999999999}];f.db.prepare('update attendance_days set input_json=? where person_id=? and work_date=?').run(JSON.stringify(i),row.person_id,row.work_date);}f.service.enqueueApprovalReasons(admin);await f.service.tick();assert.equal(reads,1);f.time+=180001;const second=createAttendanceService(f.deps);for(let n=0;n<5;n++)await second.tick();assert.equal(reads,2);assert.equal(second.status(admin).approvalReasonBackfill.status,'completed');second.enqueueApprovalReasons(admin);for(let n=0;n<5;n++)await second.tick();assert.equal(reads,2);second.stop();f.close();
});
test('permission-denied shared leave instance is queried once per manual run, not per person-day',async()=>{
 let reads=0;const f=fixture({client:{day:async()=>({attendance_result_list:[],check_record_list:[],approve_list:[{procInst_id:'leave',tag_name:'请假',sub_type:'事假',begin_time:1,end_time:9999999999999}]}),approval:async()=>{reads++;throw new DingTalkError('denied','403');}}});await seed(f);assert.equal(reads,1);f.close();
});
test('reason backfill respects personnel predicate even for a scoped administrator',async()=>{
 const queried=[];const f=fixture({isAdmin:()=>true,client:{approval:async id=>{queried.push(id);return {status:'COMPLETED',result:'agree',formComponentValues:[{name:'外出事由',value:'办事'}]};}}});await seed(f);for(const row of f.db.prepare('select * from attendance_days').all()){const i=JSON.parse(row.input_json);i.approvals=[{id:row.person_id,kind:'外出',approved:true,start:1,end:9999999999999}];f.db.prepare('update attendance_days set input_json=? where person_id=? and work_date=?').run(JSON.stringify(i),row.person_id,row.work_date);}const job=f.service.enqueueApprovalReasons(reader);assert.equal(job.total,1);await f.drain();assert.deepEqual(queried,['p1']);assert.equal(f.service.snapshot(reader,{month:'2026-10'}).people.length,1);f.close();
});
test('approval reason budget exhaustion stops the job without consuming or failing remaining instances',async()=>{
 let reads=0;const f=fixture({isAdmin:()=>true,client:{approval:async()=>{reads++;throw new DingTalkError('budget','BUDGET');}}});await seed(f);for(const row of f.db.prepare('select * from attendance_days').all()){const i=JSON.parse(row.input_json);i.approvals=[{id:row.person_id,kind:'外出',approved:true,start:1,end:9999999999999}];f.db.prepare('update attendance_days set input_json=? where person_id=? and work_date=?').run(JSON.stringify(i),row.person_id,row.work_date);}f.service.enqueueApprovalReasons(admin);await f.drain();const j=f.service.status(admin).approvalReasonBackfill;assert.equal(j.status,'blocked');assert.equal(j.processed,0);assert.equal(j.failed,0);assert.equal(reads,1);f.close();
});
test('manual retry refetches missing reason fields after the template is fixed, while successful cache stays reusable',async()=>{
 let reads=0,ready=false;const f=fixture({isAdmin:()=>true,client:{approval:async()=>{reads++;return {status:'COMPLETED',result:'agree',formComponentValues:ready?[{name:'外出事由',value:'跟班'}]:[]};}}});await seed(f);const row=f.db.prepare("select input_json from attendance_days where person_id='p1' and work_date='2026-10-23'").get();const i=JSON.parse(row.input_json);i.approvals=[{id:'fixed',kind:'外出',approved:true,start:1,end:9999999999999}];f.db.prepare("update attendance_days set input_json=? where person_id='p1' and work_date='2026-10-23'").run(JSON.stringify(i));f.service.enqueueApprovalReasons(admin);await f.drain();assert.equal(f.service.status(admin).approvalReasonBackfill.failed,1);ready=true;f.service.enqueueApprovalReasons(admin);await f.drain();assert.equal(reads,2);assert.equal(f.service.status(admin).approvalReasonBackfill.success,1);f.close();
});
