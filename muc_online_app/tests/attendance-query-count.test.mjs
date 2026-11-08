import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAttendanceService} from '../attendance-service.mjs';
import {configuration} from '../attendance-dingtalk.mjs';

// 回归守卫：汇总/假期/状态读取曾按人员、按审批单逐条查询，生产一次页面加载
// 放大到 480～749 次同步 Postgres 往返（3～4 秒并冻结事件循环）。这里用查询计数
// 保证批量读取后不再随人数/审批数线性增长。
function countingDatabase(db){
 let count=0;
 const wrap=statement=>({
  get:(...params)=>{count++;return statement.get(...params);},
  all:(...params)=>{count++;return statement.all(...params);},
  run:(...params)=>{count++;return statement.run(...params);}
 });
 return {
  kind:db.kind,
  prepare(sql){return wrap(db.prepare(sql));},
  exec(sql){count++;return db.exec(sql);},
  queryStats(){return {};},
  get count(){return count;},
  reset(){count=0;},
  close(){return db.close();}
 };
}

test('summary and status query counts stay bounded as people and approvals grow',()=>{
 const raw=new DatabaseSync(':memory:');
 raw.exec("create table settings(key text primary key,value text,updated_at text);create table personnel(id text primary key,employee_no text,name text,department text,home_team text,data_status text)");
 const db=countingDatabase(raw);
 const clock=()=>Date.parse('2026-10-22T22:00:00+08:00');
 const config={...configuration({}),approvalPlansEnabled:true,workerEnabled:false,eventsEnabled:false};
 const service=createAttendanceService({db,clock,config,client:{},personnelAccess:{predicate:()=>({sql:'1=1',params:[]}),hasAll:()=>true,requirePerson(){}},hasRbac:()=>true,isAdmin:()=>true,audit:()=>{}});
 for(let i=1;i<=30;i++){
  const id='p'+i,no='5400'+String(i).padStart(4,'0');
  raw.prepare('insert into personnel values(?,?,?,?,?,?)').run(id,no,'人员'+i,'航线','一组','active');
  raw.prepare('insert into attendance_people(user_id,person_id,employee_no,name,department_ids,seen_at) values(?,?,?,?,?,?)').run('u'+i,id,no,'人员'+i,'[]','2026-10-01T00:00:00.000Z');
  for(const n of [1,2]){
   const plan={dates:['2026-10-30'],kind:'外出',category:'外出',state:'approved',segments:[],history:[],duration:null,reason:null,reasonStatus:'not_applicable',effect:null,error:null,stale:false};
   raw.prepare('insert into attendance_approval_plans(id,person_id,kind,category,state,plan_json,revision,updated_at,error) values(?,?,?,?,?,?,?,?,?)').run(id+'-plan-'+n,id,'外出','外出','approved',JSON.stringify(plan),1,'2026-10-20T00:00:00.000Z',null);
  }
 }
 db.reset();
 const summary=service.snapshot({id:'admin',all:true},{month:'2026-10'},'attendance.stats.read',{detailLevel:'summary'});
 const summaryQueries=db.count;
 db.reset();
 const status=service.status({id:'admin',all:true});
 const statusQueries=db.count;
 db.reset();const statusAgain=service.status({id:'admin',all:true});const cachedStatusQueries=db.count;
 assert.equal(summary.people.length,30);
 assert.equal(summaryQueries<=20,true,`summary queries ${summaryQueries}`);
 assert.equal(statusQueries<=25,true,`status queries ${statusQueries}`);
 assert.equal(cachedStatusQueries,0,`cached status queries ${cachedStatusQueries}`);
 assert.equal(statusAgain.dataVersion,status.dataVersion);
 db.reset();const details=service.approvalPlanDetails({id:'admin',all:true},{month:'2026-10'});const detailsQueries=db.count;
 assert.equal(details.people[0].approvalPlans.length,2);
 assert.equal(detailsQueries<=6,true,`approval detail queries ${detailsQueries}`);
 db.close();
});
