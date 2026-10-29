import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const app=fileURLToPath(new URL('../',import.meta.url));
if(process.env.ATTENDANCE_TEST_DATABASE!=='true')throw Error('Requires an explicitly isolated empty PostgreSQL test database');
const {createDatabase}=await import(app+'/db.mjs');
const {createAttendanceService}=await import(app+'/attendance-service.mjs');
const {configuration}=await import(app+'/attendance-dingtalk.mjs');
const db=await createDatabase({databaseUrl:process.env.DATABASE_URL});
try{
 db.exec("create table personnel(id text primary key,employee_no text,name text,department text,home_team text,data_status text);create table settings(key text primary key,value text,updated_at text);insert into personnel values('p1','54000001','模拟人员','测试部门','一组','active')");
 const config={...configuration({}),approvalPlansEnabled:true,startDate:'2026-10-01'};
 const deps={db,config,clock:()=>Date.parse('2026-10-28T12:00:00+08:00'),hasRbac:()=>true,isAdmin:()=>true,audit:()=>{},personnelAccess:{predicate:()=>({sql:'1=1',params:[]}),hasAll:()=>true,requirePerson:()=>{}}};
 const s=createAttendanceService(deps);db.prepare('insert into attendance_people(user_id,person_id,employee_no,department_ids,seen_at) values(?,?,?,?,?)').run('u1','p1','54000001','[]','2026-10-28T00:00:00Z');
 // A second notification must increment the stored generation, not the
 // excluded row's default. PostgreSQL rejects an unqualified RHS here.
 s.approvalPlans.queue('repeat-notification','event');
 db.prepare("update attendance_approval_plan_queue set generation=7,applied_generation=7,attempts=3,error='simulated retry' where id=?").run('repeat-notification');
 s.approvalPlans.queue('repeat-notification','event');
 const repeated=db.prepare('select * from attendance_approval_plan_queue where id=?').get('repeat-notification');
 assert.equal(Number(repeated.generation),8);assert.equal(Number(repeated.applied_generation),7);
 assert.equal(Number(repeated.attempts),0);assert.equal(repeated.error,null);
 const detail={status:'COMPLETED',result:'agree',originatorUserId:'u1',formComponentValues:[{id:'DDDateField_9NJFYUSAEXC0',name:'开始时间',value:'2026-10-30 上午'},{id:'DDDateField_18N97G5ARZ4W0',name:'结束时间',value:'2026-10-31 下午'},{id:'TextareaField-JYNRW51P',name:'外出事由',value:'模拟测试'}]};
 s.approvalPlans.save('a',detail,'event');s.approvalPlans.save('a',detail,'event');
 db.prepare('insert into attendance_events values(?,?,?,?,?,?)').run('e','attendance_approve_status_change','{"processInstanceId":"a"}','2026-10-28T00:00:00Z','handled',null);
 const snap=s.snapshot({id:'test'},{month:'2026-10'});assert.equal(snap.people[0].pendingCounts['外出'],2);
 assert.equal(Number(db.prepare('select count(*) n from attendance_approval_plan_history').get().n),1);
 assert.equal(s.leave.snapshot({id:'test'},{year:'2026'}).people.length,1);
 createAttendanceService(deps).snapshot({id:'test'},{month:'2026-10'});
 // Drive the actual worker with synthetic approval notifications. Previously
 // observe() threw before marks/processEvents(), leaving every later event stuck.
 db.prepare('delete from attendance_approval_plan_queue where id=?').run('repeat-notification');
 let approvalReads=0;
 const worker=createAttendanceService({...deps,config:{...config,appKey:'test',appSecret:'test',operatorId:'test',rootDepartmentId:'1',workerEnabled:true,eventsEnabled:true},client:{approval:async()=>{approvalReads++;return detail;}}});
 worker.hybrid.setState('approvalPlanSeed',{at:'2026-10-28T00:00:00Z'});
 db.prepare('insert into attendance_approval_plan_events values(?,?)').run('e',new Date(deps.clock()).toISOString());
 worker.hybrid.setState('directory',{at:new Date(deps.clock()).toISOString(),directory:{departments:[],users:[]}});
 const notify=id=>db.prepare('insert into attendance_events values(?,?,?,?,?,?)').run(id,'attendance_approve_status_change',JSON.stringify({processInstanceId:'a',staffId:'u1'}),new Date(deps.clock()).toISOString(),'pending',null);
 notify('worker-first');await worker.tick();await worker.tick();
 notify('worker-second');await worker.tick();await worker.tick();
 assert.equal(approvalReads,2);
 assert.equal(Number(db.prepare("select count(*) n from attendance_events where status='pending'").get().n),0);
 assert.equal(Number(db.prepare("select count(*) n from attendance_approval_plan_events where event_id in ('worker-first','worker-second')").get().n),2);
 const consumed=db.prepare('select generation,applied_generation from attendance_approval_plan_queue where id=?').get('a');
 assert.equal(Number(consumed.generation),2);assert.equal(Number(consumed.applied_generation),2);
 console.log(JSON.stringify({postgresAttendance:true,repeatedApprovalNotification:true,workerConsumesRepeatedEvents:true,approvalHistoryIdentity:true,jsonEventLookup:true,futurePlans:true,leave:true,repeatedInstall:true,externalRequests:0}));
}finally{db.close();}
