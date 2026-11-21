import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {NONROUTINE_ADJUSTMENTS_SCHEMA} from '../nonroutine-delivery.mjs';
import {NONROUTINE_ROLE_RESULTS_SCHEMA} from '../nonroutine-role-results.mjs';
import {NONROUTINE_CORRECTIONS_SCHEMA,planNonroutineCorrection} from '../nonroutine-corrections.mjs';
const row=(id,person,role,hours)=>({id,owner_type:'subtask',owner_id:'task',flight_id:'flight',assignment_id:'assignment-'+person,person_id:person,user_name:person,team:'team',role,source:'非例行',hours,adjusted_hours:null,status:'已确认',confirmed_by:'manager',confirmed_at:'stamp',created_at:'stamp',updated_at:'stamp'});
const source=[row('one','p1','主做',0.7),row('two','p2','检验',0.3)];
const target=hours=>source.map((entry,index)=>({...entry,hours:hours[index]}));
const plan=(sourceRows,targetRows)=>planNonroutineCorrection({sourceRows,targetRows,subtaskId:'task',flightId:'flight'});
function fixture(t){const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(`pragma foreign_keys=on;create table maintenance_flights(id text primary key);create table maintenance_subtasks(id text primary key);insert into maintenance_flights values('flight');insert into maintenance_subtasks values('task');
create table maintenance_hour_results(id text primary key,owner_type text,owner_id text,flight_id text,assignment_id text,person_id text,user_name text,team text,role text,source text,hours real,adjusted_hours real,status text,confirmed_by text,confirmed_at text,created_at text,updated_at text);`);
 db.exec(NONROUTINE_ADJUSTMENTS_SCHEMA);db.exec(NONROUTINE_ROLE_RESULTS_SCHEMA);db.exec(NONROUTINE_CORRECTIONS_SCHEMA);
 const insert=(table,entry)=>db.prepare(`insert into ${table}(${Object.keys(entry).join(',')}) values(${Object.keys(entry).map(()=>'?').join(',')})`).run(...Object.values(entry));for(const entry of source)insert('maintenance_hour_results',entry);
 const approve=(id='correction',number=1)=>insert('maintenance_nonroutine_corrections',{id,subtask_id:'task',flight_id:'flight',correction_number:number,source_kind:'STANDARD',source_id:'standard',source_version:'1',source_digest:'frozen-source',source_snapshot_json:'{}',before_json:JSON.stringify(source),target_json:'[]',policy_json:'{}',target_hours:0.5,work_month:'2026-09',statistical_month:'2026-09',approved_by:'authorized-manager',approval_qualification_json:'{}',reason:'测试独立批准',client_id:'request-'+number,request_hash:'request-hash',state:'APPROVED_PENDING_PERIOD',created_at:'stamp'});
 return {db,insert,approve};}
test('correction planner emits only signed differences with immutable lineage and uses integer cents',()=>{
 const before=structuredClone(source),result=plan(source,target([0.35,0.15]));assert.equal(result.beforeHours,1);assert.equal(result.targetHours,0.5);assert.equal(result.deltaHours,-0.5);assert.equal(result.deltas.length,2);assert.deepEqual(result.deltas.map(entry=>entry.hours),[-0.35,-0.15]);assert.ok(result.deltas.every(entry=>entry.correctionOf.length));assert.deepEqual(source,before);
 assert.equal(plan(source,target([0,0])).deltaHours,-1);assert.throws(()=>plan(source,target([0.7,0.3])),{status:409});
});
test('subsequent corrections compare the current net and never re-add the full target',()=>{
 const previous=plan(source,target([0.35,0.15]));const effective=[...source,...previous.deltas.map((entry,index)=>({...row('delta-'+index,entry.personId,entry.role,entry.hours),source:'授权更正'}))];
 const next=plan(effective,target([0.49,0.21]));assert.equal(next.beforeHours,0.5);assert.equal(next.targetHours,0.7);assert.equal(next.deltaHours,0.2);assert.notEqual(next.token,previous.token);assert.throws(()=>plan(effective,target([0.35,0.15])),{status:409});
});
test('role reallocation keeps all original people and real assignment lineage without altering total',()=>{
 const shifted=target([0.7,0.3]).map((entry,index)=>({...entry,role:index?'主做':'检验'}));const result=plan(source,shifted);assert.equal(result.deltaHours,0);assert.equal(result.deltas.length,4);assert.ok(result.deltas.every(entry=>entry.correctionOf.length));
 for(const malformed of [shifted.slice(1),[...shifted,shifted[0]],shifted.map((entry,index)=>index?entry:{...entry,person_id:'outsider'}),shifted.map((entry,index)=>index?entry:{...entry,assignment_id:'fake-assignment'})])assert.throws(()=>plan(source,malformed),{status:409});
});
test('unconfirmed, duplicated, malformed and negative ordinary sources cannot create a correction plan',()=>{
 for(const malformed of [[...source,source[0]],source.map((entry,index)=>index?entry:{...entry,status:'待复核'}),source.map((entry,index)=>index?entry:{...entry,hours:-1}),source.map((entry,index)=>index?entry:{...entry,hours:0.333}),source.map((entry,index)=>index?entry:{...entry,flight_id:'other'})])assert.throws(()=>plan(malformed,target([0.35,0.15])),{status:409});
 const zero=source.map(entry=>({...entry,hours:0}));assert.equal(plan(zero,target([0.07,0.03])).deltaHours,0.1);assert.throws(()=>plan(source,target([NaN,0.3])),{status:409});
});
test('signed correction schema replays and the existing effective view shows only posted net without rewriting base results',async t=>{
 const f=fixture(t),{db}=f;assert.equal(NONROUTINE_CORRECTIONS_SCHEMA,await fs.readFile(new URL('../migrations/060_nonroutine_corrections.sql',import.meta.url),'utf8'));db.exec(NONROUTINE_CORRECTIONS_SCHEMA);
 const base=db.prepare('select * from maintenance_hour_results order by id').all();f.approve();assert.throws(()=>f.approve('conflicting',2));
 const result=plan(source,target([0.35,0.15]));for(const [index,entry]of result.deltas.entries())f.insert('maintenance_nonroutine_correction_deltas',{id:'delta-'+index,correction_id:'correction',assignment_id:entry.assignmentId,person_id:entry.personId,user_name:entry.userName,team:entry.team,role:entry.role,hours:entry.hours,before_hours:entry.beforeHours,target_hours:entry.targetHours,correction_of_json:JSON.stringify(entry.correctionOf),created_at:'stamp'});
 assert.equal(db.prepare('select sum(hours) total from maintenance_effective_hour_results').get().total,1);
 db.prepare("update maintenance_nonroutine_corrections set state='POSTED',handling_month='2026-11',posted_at='posted' where id='correction'").run();
 assert.equal(Math.round(db.prepare('select sum(hours) total from maintenance_effective_hour_results').get().total*100),50);assert.equal(db.prepare("select count(*) n from maintenance_effective_hour_results where source='授权更正'").get().n,2);
 assert.deepEqual(db.prepare('select * from maintenance_hour_results order by id').all(),base);assert.throws(()=>db.prepare("delete from maintenance_flights where id='flight'").run());assert.throws(()=>db.prepare("delete from maintenance_subtasks where id='task'").run());assert.throws(()=>db.prepare("delete from maintenance_nonroutine_corrections where id='correction'").run());
});
