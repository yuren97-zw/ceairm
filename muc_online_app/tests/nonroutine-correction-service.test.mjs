import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {NONROUTINE_ADJUSTMENTS_SCHEMA} from '../nonroutine-delivery.mjs';
import {NONROUTINE_ROLE_RESULTS_SCHEMA} from '../nonroutine-role-results.mjs';
import {NONROUTINE_CORRECTIONS_SCHEMA} from '../nonroutine-corrections.mjs';
import {MAINTENANCE_HOUR_PERIODS_SCHEMA} from '../maintenance-hour-periods.mjs';
import {createNonroutineCorrections} from '../nonroutine-correction-service.mjs';
function fixture(t,state='OPEN'){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(`pragma foreign_keys=on;create table maintenance_flights(id text primary key,date text,flight_no text,departure_flight_no text,aircraft_no text);create table maintenance_subtasks(id text primary key,title text);insert into maintenance_flights(id) values('flight');insert into maintenance_subtasks(id) values('task');create table maintenance_hour_results(id text primary key,owner_type text,owner_id text,flight_id text,assignment_id text,person_id text,user_name text,team text,role text,source text,hours real,adjusted_hours real,status text,confirmed_by text,confirmed_at text,created_at text,updated_at text);`);
 for(const schema of [NONROUTINE_ADJUSTMENTS_SCHEMA,NONROUTINE_ROLE_RESULTS_SCHEMA,NONROUTINE_CORRECTIONS_SCHEMA,MAINTENANCE_HOUR_PERIODS_SCHEMA])db.exec(schema);
 const base=[{id:'h1',owner_type:'subtask',owner_id:'task',flight_id:'flight',assignment_id:'a1',person_id:'p1',user_name:'甲',team:'team',role:'主做',source:'非例行',hours:0.7,adjusted_hours:null,status:'已确认',confirmed_by:'old',confirmed_at:'old',created_at:'old',updated_at:'old'}, {id:'h2',owner_type:'subtask',owner_id:'task',flight_id:'flight',assignment_id:'a2',person_id:'p2',user_name:'乙',team:'team',role:'检验',source:'非例行',hours:0.3,adjusted_hours:null,status:'已确认',confirmed_by:'old',confirmed_at:'old',created_at:'old',updated_at:'old'}];
 for(const row of base)db.prepare(`insert into maintenance_hour_results(${Object.keys(row).join(',')}) values(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
 const actor=(id,permissions)=>({id,personId:id+'-person',active:true,permissions});
 const approver=actor('approver',['maintenance.archive.modify']),owner=actor('owner',['maintenance.hours.period.cross_period.authorize']),other=actor('other',['maintenance.hours.period.cross_period.authorize']),worker=actor('worker',[]),actors=new Map([approver,owner,other,worker].map(user=>[user.id,user]));
 const periods=new Map([['2026-09',{month:'2026-09',state,revision:1,responsible_account_id:owner.id,responsible_person_id:owner.personId}],['2026-11',{month:'2026-11',state:'OPEN',revision:1,responsible_account_id:other.id,responsible_person_id:other.personId}]]);
 for(const period of periods.values())db.prepare('insert into maintenance_hour_periods(month,responsible_account_id,responsible_person_id,state,revision,updated_at) values(?,?,?,?,?,?)').run(period.month,period.responsible_account_id,period.responsible_person_id,period.state,period.revision,'stamp');
 const policy={strategy:'ROLE_COMBINATION',category:'单项工作',combination:'主做+检验',ratios:{主做:0.7,检验:0.3},combinations:{'主做+检验':{主做:0.7,检验:0.3}},valid:true,version:'source-policy'};
 const snapshot={decision:{category:'单项工作',recognizedHours:1},policy,baseResults:base},digest=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');let serial=0,failAudit='',changedSource=false;
 const source=()=>({subtaskId:'task',flightId:'flight',kind:'STANDARD',sourceId:'standard-version',sourceVersion:'1',workMonth:'2026-09',digest:changedSource?'changed-source':digest,snapshot,decision:snapshot.decision,policy,participants:base.map(row=>({personId:row.person_id,role:row.role})),rows:db.prepare("select * from maintenance_effective_hour_results where owner_id='task' order by id").all()});
 const can=(user,permission)=>Boolean(user?.active&&user.permissions.includes(permission));
 const service=createNonroutineCorrections({db,can,qualifiedAccount(id,permission){const user=actors.get(id);return can(user,permission)?{accountId:id,personId:user.personId}:null;},loadSource:source,
  allocate(source,input){return {policy:source.policy,rows:base.map(row=>({assignment_id:row.assignment_id,person_id:row.person_id,user_name:row.user_name,team:row.team,role:row.role,hours:Math.round(input.recognizedHours*source.policy.ratios[row.role]*100)/100}))};},periodState:month=>periods.get(month)||{month,state:'UNKNOWN',revision:0},clock:()=> '2026-11-11T00:00:00Z',randomId:kind=>kind+'-'+(++serial),audit(action){if(action===failAudit)throw Error('injected correction audit failure');},transaction(fn){db.exec('begin immediate');try{const result=fn();db.exec('commit');return result;}catch(error){db.exec('rollback');throw error;}}});
 const input=hours=>({recognizedHours:hours,participants:base.map(row=>({personId:row.person_id,role:row.role})),participantsVerified:true});
 const payload=(hours=0.5,clientId='approve-request-one')=>{const preview=service.preview('task',input(hours),approver);return {...input(hours),clientId,reason:'明确核对原认定及独立差额批准',expectedToken:preview.token,expectedNumber:preview.number};};
 const authorize=(id,clientId='authorize-request-one')=>service.authorize(id,{clientId,reason:'原负责人授权在另一开放月份办理',sourceRevision:periods.get('2026-09').revision,targetRevision:periods.get('2026-11').revision,targetMonth:'2026-11'},owner);
 return {db,base,service,approver,owner,other,worker,periods,input,payload,authorize,fail:action=>failAudit=action,change:value=>changedSource=value,total:()=>Math.round(db.prepare('select sum(coalesce(adjusted_hours,hours)) n from maintenance_effective_hour_results').get().n*100)/100};
}
test('authorized original open-period approval posts only the delta, retries exactly and keeps base sources unchanged',t=>{
 const f=fixture(t),body=f.payload(),before=f.db.prepare('select * from maintenance_hour_results order by id').all();
 const result=f.service.approve('task',body,f.approver);assert.equal(result.correction.state,'POSTED');assert.equal(result.correction.handlingMonth,'2026-09');assert.equal(f.total(),0.5);assert.equal(result.correction.deltas.length,2);
 assert.equal(f.service.approve('task',body,f.approver).replayed,true);assert.equal(f.service.retry(result.correction.id,f.approver).state,'POSTED');assert.equal(f.total(),0.5);
 assert.throws(()=>f.service.approve('task',{...body,recognizedHours:0.6},f.approver),{status:409});assert.deepEqual(f.db.prepare('select * from maintenance_hour_results order by id').all(),before);
 const second=f.service.approve('task',f.payload(0.8,'approve-request-two'),f.approver);assert.equal(second.correction.number,2);assert.equal(f.total(),0.8);assert.equal(Math.round(second.correction.deltas.reduce((sum,row)=>sum+row.hours,0)*100),30);
});
test('closed-period approval waits for the designated valid owner and retains original statistical month',t=>{
 const f=fixture(t,'CLOSED'),approved=f.service.approve('task',f.payload(),f.approver).correction;assert.equal(approved.state,'APPROVED_PENDING_PERIOD');assert.equal(f.total(),1);assert.equal(f.service.view(approved.id,f.owner).before,undefined);
 assert.throws(()=>f.service.authorize(approved.id,{clientId:'wrong-owner-request',targetMonth:'2026-11',sourceRevision:1,targetRevision:1,reason:'无权人员'},f.other),{status:404});
 assert.throws(()=>f.service.preview('task',f.input(0),f.approver),{status:409});
 const done=f.authorize(approved.id);assert.equal(done.correction.state,'POSTED');assert.equal(done.correction.handlingMonth,'2026-11');assert.equal(done.correction.statisticalMonth,'2026-09');assert.equal(f.total(),0.5);assert.equal(done.correction.deltas,undefined);
 assert.equal(f.authorize(approved.id).replayed,true);assert.equal(f.db.prepare('select count(*) n from maintenance_nonroutine_correction_period_authorizations').get().n,1);assert.equal(f.service.list({},f.owner).items.length,1);assert.equal(f.service.list({},f.other).items.length,0);
});
test('unknown or changed periods keep the approved financial decision without counting pending rows',t=>{
 const f=fixture(t,'UNKNOWN'),row=f.service.approve('task',f.payload(),f.approver).correction;assert.equal(f.total(),1);assert.equal(f.service.retry(row.id,f.approver).state,'APPROVED_PENDING_PERIOD');f.periods.get('2026-09').state='OPEN';f.periods.get('2026-09').revision++;assert.equal(f.service.retry(row.id,f.approver).state,'POSTED');assert.equal(f.total(),0.5);
});
test('stale previews, unqualified actors, client amounts and participant changes cannot approve',t=>{
 const f=fixture(t),body=f.payload();assert.throws(()=>f.service.preview('task',f.input(0.5),f.worker),{status:403});
 assert.throws(()=>f.service.approve('task',{...body,expectedToken:'stale'},f.approver),{status:409});assert.throws(()=>f.service.approve('task',{...body,targetRows:[{hours:99}]},f.approver),{status:400});
 assert.throws(()=>f.service.preview('task',{...f.input(0.5),participants:[{personId:'outsider',role:'主做'}]},f.approver),{status:400});f.approver.active=false;assert.throws(()=>f.service.approve('task',body,f.approver),{status:403});assert.equal(f.db.prepare('select count(*) n from maintenance_nonroutine_corrections').get().n,0);
});
test('failures roll back the entire approval or period authorization and immutable pending decisions can retry safely',t=>{
 const f=fixture(t),body=f.payload();f.fail('POSTED');assert.throws(()=>f.service.approve('task',body,f.approver),/audit failure/);assert.equal(f.total(),1);assert.equal(f.db.prepare('select count(*) n from maintenance_nonroutine_corrections').get().n,0);
 f.fail('');f.periods.get('2026-09').state='CLOSED';const approved=f.service.approve('task',body,f.approver).correction;
 f.fail('POSTED');assert.throws(()=>f.authorize(approved.id),/audit failure/);assert.equal(f.total(),1);assert.equal(f.db.prepare('select count(*) n from maintenance_nonroutine_correction_period_authorizations').get().n,0);assert.equal(f.service.view(approved.id,f.approver).state,'APPROVED_PENDING_PERIOD');
 f.fail('');assert.equal(f.authorize(approved.id).correction.state,'POSTED');assert.equal(f.total(),0.5);
});
test('source changes after approval cannot silently reprice or post an old decision',t=>{
 const f=fixture(t,'CLOSED'),row=f.service.approve('task',f.payload(),f.approver).correction;f.change(true);assert.throws(()=>f.authorize(row.id),{status:409});assert.equal(f.total(),1);assert.equal(f.db.prepare('select count(*) n from maintenance_nonroutine_correction_period_authorizations').get().n,0);
});

test('a still-valid period authorization is retained instead of being overwritten by another request',t=>{
 const f=fixture(t,'CLOSED'),row=f.service.approve('task',f.payload(),f.approver).correction;
 f.db.prepare('insert into maintenance_nonroutine_correction_period_authorizations(id,correction_id,revision,source_month,target_month,source_revision,target_revision,actor_id,qualification_json,reason,snapshot_json,created_at) values(?,?,1,?,?,1,1,?,?,?,?,?)').run('existing-authorization',row.id,'2026-09','2026-11',f.owner.id,JSON.stringify({personId:f.owner.personId}),'原负责人仍有效的批准','{}','stamp');
 assert.throws(()=>f.authorize(row.id,'new-authorization-request'),{status:409});assert.equal(f.db.prepare('select count(*) n from maintenance_nonroutine_correction_period_authorizations').get().n,1);
 assert.equal(f.service.retry(row.id,f.approver).state,'POSTED');assert.equal(f.total(),0.5);
});

test('the immutable approval retains exact replay inputs including numeric strings and participant order',t=>{
 const f=fixture(t),body=f.payload(0.5,'restore-string-request');body.recognizedHours='0.5';body.participants.reverse();
 const result=f.service.approve('task',body,f.approver),stored=JSON.parse(f.db.prepare('select target_json from maintenance_nonroutine_corrections where id=?').get(result.correction.id).target_json);
 assert.equal(stored.request.recognizedHours,'0.5');assert.deepEqual(stored.request.participants,body.participants);
 assert.equal(f.service.approve('task',JSON.parse(JSON.stringify(stored.request)),f.approver).replayed,true);assert.equal(f.total(),0.5);assert.equal(f.db.prepare('select count(*) n from maintenance_nonroutine_corrections').get().n,1);
});
