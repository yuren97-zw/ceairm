import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {createAttendanceService} from '../attendance-service.mjs';
import {configuration} from '../attendance-dingtalk.mjs';
const db=new DatabaseSync(':memory:');
db.exec('create table settings(key text primary key,value text,updated_at text);create table personnel(id text primary key,employee_no text,name text,department text,home_team text,data_status text)');
const user={id:'synthetic-benchmark',all:true},clock=()=>Date.parse('2026-10-31T23:00:00+08:00');
const service=createAttendanceService({db,clock,config:{...configuration({}),approvalPlansEnabled:true},hasRbac:()=>true,isAdmin:()=>true,audit:()=>{},personnelAccess:{predicate:()=>({sql:'1=1',params:[]}),hasAll:()=>true}});
const people=db.prepare('insert into personnel values(?,?,?,?,?,?)'),day=db.prepare('insert into attendance_days(person_id,work_date,input_json,result_json,source_hash,updated_at,run_id) values(?,?,?,?,?,?,?)');
db.exec('begin');
for(let i=0;i<200;i++){
 const id='synthetic-'+i;people.run(id,String(99000000+i),'合成人员'+i,'测试部门',['一组','二组','三组','四组'][i%4],'active');
 for(let n=1;n<=31;n++){
  const date='2026-10-'+String(n).padStart(2,'0');const input={date,covered:true,rest:true,points:[],approvals:[],punches:Array.from({length:8},(_,j)=>({time:date+'T08:'+String(j).padStart(2,'0')+':00+08:00',source:'synthetic-only',result:'Normal'}))};
  day.run(id,date,JSON.stringify(input),'{}','synthetic','2026-10-31T00:00:00Z','synthetic-run');
 }
}db.exec('commit');
const measure=detailLevel=>{const begin=performance.now(),data=service.snapshot(user,{month:'2026-10'},'attendance.stats.read',{detailLevel}),calculationMs=performance.now()-begin,json=JSON.stringify(data);return {data,calculationMs,bytes:Buffer.byteLength(json),gzipBytes:gzipSync(json).length};};
try{
 const full=measure('full'),summary=measure('summary'),compact=measure('compact');assert.equal(full.data.people.length,200);
 for(let i=0;i<200;i++){assert.deepEqual(summary.data.people[i].counts,full.data.people[i].counts);assert.deepEqual(compact.data.people[i].counts,full.data.people[i].counts);assert.equal(full.data.people[i].days.length,31);}
 console.log(JSON.stringify({syntheticPeople:200,storedDays:6200,equalCounts:true,externalRequests:0,...Object.fromEntries(Object.entries({full,summary,compact}).map(([k,{data,...metrics}])=>[k,metrics]))},null,2));
}finally{db.close();}
