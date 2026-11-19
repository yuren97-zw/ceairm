import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readNonroutineSourceFacts,saveNonroutineSourceBaseline,snapshotNonroutineSourceFacts,recordNonroutineSourceFactsChanges,approvedNonroutineSourceFacts} from '../nonroutine-source-facts.mjs';
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(`create table maintenance_flights(id text,date text,aircraft_no text,aircraft_type text,status text);create table maintenance_subtasks(id text,flight_id text,category text,card_no text,title text,content text,status text);create table maintenance_assignments(id text,owner_type text,owner_id text,flight_id text,person_id text,role text,status text);create table maintenance_nonroutine_review_cases(id text,flight_id text,subtask_id text,report_batch_id text,application_json text,participants_json text,state text);create table maintenance_nonroutine_review_events(id text,case_id text,actor_id text,event_type text,detail_json text,created_at text);insert into maintenance_flights values('flight','2026-09-04','BTEST','A320','已提报');insert into maintenance_subtasks values('task','flight','单项工作','29','管路检查','原范围','已提报');insert into maintenance_assignments values('assignment','subtask','task','flight','person','主做','已提报');`);
 const item={id:'case',flight_id:'flight',subtask_id:'task',report_batch_id:'batch',application_json:JSON.stringify({category:'单项工作',chapter:'29',title:'管路检查',workScope:'原范围',requestedHours:2}),participants_json:JSON.stringify([{personId:'person',role:'主做'}]),state:'IN_REVIEW'};
 db.prepare('insert into maintenance_nonroutine_review_cases values(?,?,?,?,?,?,?)').run(...Object.values(item));let id=0;
 const common={db,actorId:'actor',clock:()=> '2026-11-11T00:00:00Z',randomId:()=>String(++id)};
 const facts=()=>readNonroutineSourceFacts(db,item),baseline=()=>saveNonroutineSourceBaseline({...common,item});
 const approve=()=>{const current=facts();db.prepare('insert into maintenance_nonroutine_review_events values(?,?,?,?,?,?)').run('final','case','actor','FINALIZED',JSON.stringify({finalId:'approval',sourceFacts:{token:current.token,current:current.current}}),'later');return {id:'approval'};};
 return {db,item,facts,baseline,common,approve};
}
test('submission baseline is immutable and read projections ignore normal status progression',t=>{
 const f=fixture(t);f.baseline();const before=f.db.prepare('select * from maintenance_nonroutine_review_events').all();f.baseline();assert.deepEqual(f.db.prepare('select * from maintenance_nonroutine_review_events').all(),before);
 const original=f.facts();assert.equal(original.changed,false);assert.equal(original.baselineOrigin,'SUBMISSION_SNAPSHOT');f.db.exec("update maintenance_flights set status='已确认';update maintenance_subtasks set status='已确认';update maintenance_assignments set status='已确认'");
 assert.equal(f.facts().token,original.token);assert.equal(f.facts().changed,false);assert.deepEqual(f.db.prepare('select * from maintenance_nonroutine_review_events').all(),before);
});
test('field, opportunity and participation changes retain original facts and append audit only for real changes',t=>{
 const f=fixture(t);f.baseline();const before=snapshotNonroutineSourceFacts(f.db,'flight');recordNonroutineSourceFactsChanges({...f.common,before,reason:'复核核实'});assert.equal(f.db.prepare('select count(*) n from maintenance_nonroutine_review_events').get().n,1);
 f.db.exec("update maintenance_subtasks set content='当前新范围';update maintenance_flights set date='2026-10-01';update maintenance_assignments set role='检验'");
 recordNonroutineSourceFactsChanges({...f.common,before,reason:'合法原复核事实变更'});const facts=f.facts();assert.equal(facts.changed,true);assert.equal(facts.participantsChanged,true);assert.equal(facts.participantIdentityChanged,false);assert.equal(facts.baseline.fields.workScope,'原范围');assert.equal(facts.current.fields.workScope,'当前新范围');assert.ok(facts.differences.some(row=>row.field==='date'));
 const event=JSON.parse(f.db.prepare("select detail_json from maintenance_nonroutine_review_events where event_type='SOURCE_FACTS_CHANGED'").get().detail_json);assert.equal(event.previous.fields.workScope,'原范围');assert.equal(event.current.fields.workScope,'当前新范围');assert.equal(event.reason,'合法原复核事实变更');
 f.db.exec("update maintenance_assignments set person_id='another'");assert.equal(f.facts().participantIdentityChanged,true);
});
test('approved fact identity blocks later drift and actual person replacement without rewriting the decision',t=>{
 const f=fixture(t);f.baseline();f.db.exec("update maintenance_subtasks set title='本轮核实的新名称'");const final=f.approve();assert.equal(approvedNonroutineSourceFacts(f.db,f.item,final).ok,true);
 f.db.exec("update maintenance_subtasks set content='终审后范围变化'");assert.equal(approvedNonroutineSourceFacts(f.db,f.item,final).code,'SOURCE_FACTS_CHANGED_AFTER_FINALIZATION');
 f.db.exec("update maintenance_subtasks set content='原范围';update maintenance_assignments set person_id='another'");f.db.exec("delete from maintenance_nonroutine_review_events where event_type='FINALIZED'");const changed=f.approve();assert.equal(approvedNonroutineSourceFacts(f.db,f.item,changed).code,'PARTICIPANTS_REQUIRE_VERIFICATION');
});
test('legacy applications disclose missing opportunity baseline and cannot silently attest changed sources',t=>{
 const f=fixture(t),final={id:'old-final'};assert.equal(f.facts().baselineOrigin,'APPLICATION_FIELDS_AND_PARTICIPANTS');assert.equal(f.facts().baseline.opportunity,undefined);assert.equal(approvedNonroutineSourceFacts(f.db,f.item,final).ok,true);
 f.db.exec("update maintenance_subtasks set title='旧认定后的变化'");assert.equal(approvedNonroutineSourceFacts(f.db,f.item,final).code,'SOURCE_FACTS_REQUIRE_VERIFICATION');
});
test('missing and corrupted baselines fail closed without mutating sources or audit',t=>{
 const f=fixture(t);f.baseline();const baseline=f.db.prepare('select detail_json from maintenance_nonroutine_review_events').get().detail_json;
 f.db.prepare("update maintenance_nonroutine_review_events set detail_json='{}'").run();assert.equal(f.facts().available,false);f.db.prepare('update maintenance_nonroutine_review_events set detail_json=?').run(baseline);
 f.db.exec("insert into maintenance_nonroutine_review_events select 'duplicate',case_id,actor_id,event_type,detail_json,created_at from maintenance_nonroutine_review_events");assert.equal(f.facts().available,false);f.db.exec("delete from maintenance_nonroutine_review_events where id='duplicate';delete from maintenance_subtasks");assert.equal(f.facts().available,false);
});

test('injected actual report sources ignore dispatch changes and still detect actual participation drift',t=>{
 const f=fixture(t);let rows=[{id:'report-entry-source',person_id:'actual-worker',role:'主做'}];const options={readParticipants:()=>rows};
 saveNonroutineSourceBaseline({...f.common,item:f.item,...options});const initial=readNonroutineSourceFacts(f.db,f.item,options);assert.equal(initial.changed,false);assert.equal(initial.current.participants[0].personId,'actual-worker');
 f.db.exec("update maintenance_assignments set person_id='changed-dispatch',role='辅助'");const preserved=readNonroutineSourceFacts(f.db,f.item,options);assert.equal(preserved.token,initial.token);assert.equal(preserved.changed,false);
 rows=[{id:'another-report-source',person_id:'another-actual-worker',role:'检验'}];const changed=readNonroutineSourceFacts(f.db,f.item,options);assert.equal(changed.participantIdentityChanged,true);assert.equal(changed.changed,true);assert.equal(changed.baseline.participants[0].personId,'actual-worker');
});
