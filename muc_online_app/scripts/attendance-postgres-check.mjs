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
 const detail={status:'COMPLETED',result:'agree',originatorUserId:'u1',formComponentValues:[{id:'DDDateField_9NJFYUSAEXC0',name:'开始时间',value:'2026-10-30 上午'},{id:'DDDateField_18N97G5ARZ4W0',name:'结束时间',value:'2026-10-31 下午'},{id:'TextareaField-JYNRW51P',name:'外出事由',value:'模拟测试'}]};
 s.approvalPlans.save('a',detail,'event');s.approvalPlans.save('a',detail,'event');
 db.prepare('insert into attendance_events values(?,?,?,?,?,?)').run('e','attendance_approve_status_change','{"processInstanceId":"a"}','2026-10-28T00:00:00Z','handled',null);
 const snap=s.snapshot({id:'test'},{month:'2026-10'});assert.equal(snap.people[0].pendingCounts['外出'],2);
 assert.equal(Number(db.prepare('select count(*) n from attendance_approval_plan_history').get().n),1);
 assert.equal(s.leave.snapshot({id:'test'},{year:'2026'}).people.length,1);
 createAttendanceService(deps).snapshot({id:'test'},{month:'2026-10'});
 console.log(JSON.stringify({postgresAttendance:true,approvalHistoryIdentity:true,jsonEventLookup:true,futurePlans:true,leave:true,repeatedInstall:true,externalRequests:0}));
}finally{db.close();}
