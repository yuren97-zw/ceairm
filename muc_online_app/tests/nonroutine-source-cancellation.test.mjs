import assert from 'node:assert/strict';
import {cancelNonroutineReviewForSourceRemoval,createNonroutineReviewCancellation} from '../nonroutine-source-cancellation.mjs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { NONROUTINE_REVIEW_SCHEMA, NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA, createNonroutineReview } from '../nonroutine-review.mjs';
import { NONROUTINE_ASSESSMENT_SCHEMA } from '../nonroutine-assessment.mjs';
import { NONROUTINE_FINALIZATION_SCHEMA, createNonroutineFinalization } from '../nonroutine-finalization.mjs';
import {RBAC_ROLE_DEFINITIONS,permissionDependencyErrors} from '../rbac-policy.mjs';

test('cancellation owner role is separate from acceptance finalization and correction authority',()=>{
 const role=RBAC_ROLE_DEFINITIONS.addon_nonroutine_review_cancel;assert.ok(role.includes('maintenance.nonroutine.review.cancel'));assert.deepEqual(permissionDependencyErrors(role),[]);
 for(const code of ['worker','dispatcher','manager','addon_nonroutine_review_assign','addon_nonroutine_review_finalizer'])assert.ok(!RBAC_ROLE_DEFINITIONS[code].includes('maintenance.nonroutine.review.cancel'));
 assert.deepEqual(role,['maintenance.view','maintenance.nonroutine.review.view','maintenance.nonroutine.review.cancel']);
});

function fixture(t,{sourceFacts=()=>null}={}) {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec('pragma foreign_keys=on');
  for(const schema of [NONROUTINE_REVIEW_SCHEMA,NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA,NONROUTINE_ASSESSMENT_SCHEMA,NONROUTINE_FINALIZATION_SCHEMA])db.exec(schema);
  const accounts=new Map();
  const actor=(id,actions)=>{const user={id,personId:`person-${id}`,active:true,scope:true,permissions:actions.map(action=>`maintenance.nonroutine.review.${action}`)};accounts.set(id,user);return user;};
  const boss=actor('boss',['view','assign','finalize','opinions.view']);
  const finalizer=actor('finalizer',['view','finalize']);
  const members=Array.from({length:12},(_,index)=>actor(`reviewer-${index}`,['view','opinion.submit']));
  const can=(user,permission)=>user.active && user.scope && user.permissions.includes(permission);
  const qualifiedAccount=(id,permission)=>{const user=accounts.get(id);return user && can(user,permission)?{accountId:id,personId:user.personId}:null;};
  let counter=0,calls=0;
  let outcome={state:'NEEDS_ATTENTION',detail:{code:'PERIOD_STATUS_UNKNOWN'}};
  const transaction=action=>{db.exec('begin immediate');try{const result=action();db.exec('commit');return result;}catch(error){db.exec('rollback');throw error;}};
  const common={db,transaction,can,qualifiedAccount,clock:()=> '2026-11-09T00:00:00Z',randomId:prefix=>`${prefix}-${++counter}`};
  const policy={strategy:'ROLE_COMBINATION',category:'单项工作',ratios:{主做:1},valid:true,version:'source-rule',capturedAt:'t'};
  const review=createNonroutineReview(common);
  const application={category:'单项工作',chapter:'29',title:'检查管路',workScope:'左侧管路检查',requestedHours:2};
  const participants=[{personId:'worker-one',role:'主做'}];
  const id=review.create({flightId:'flight-one',subtaskId:'task-one',reportBatchId:'batch-one',applicationRevision:1,applicantId:'applicant',snapshot:application,participants,policySnapshot:policy});
  db.prepare("insert into maintenance_nonroutine_review_channels(id,case_id,subtask_id,state,created_at,updated_at) values('channel-one',?,'task-one','WAITING_REVIEW','t','t')").run(id);
  const service=createNonroutineFinalization({...common,sourceFacts,capturePolicy:category=>category==='人工除冰'?{strategy:'UNDECIDED',category}:({...policy,category,capturedAt:'later'}),
    post(input){calls++;if(outcome instanceof Error)throw outcome;assert.equal(input.item.id,id);assert.equal(input.channel.id,'channel-one');return outcome;}});
  const accept=()=>review.accept(id,{revision:1,accountIds:members.map(user=>user.id),finalizerAccountId:finalizer.id},boss);
  const seal=()=>{accept();for(let i=0;i<12;i++)review.submitOpinion(id,{revision:0,hours:i+1,basis:`PRIVATE-BASIS-${i}`},members[i]);};
  const payload=()=>({revision:3,decision:{category:application.category,chapter:application.chapter,title:application.title,workScope:application.workScope,recognizedHours:2},
    participantsVerified:true,participants:[...participants],reason:'',roleVerificationReason:'',admissionDecision:'PENDING'});
  return {db,transaction,common,service,review,id,boss,finalizer,members,accept,seal,payload,policy,calls:()=>calls,setOutcome:value=>{outcome=value;}};
}

function cancellationFixture(t,{finalized=false}={}){
 const f=fixture(t);
 f.db.exec(`create table maintenance_nonroutine_posting_receipts(case_id text);
 create table maintenance_nonroutine_hour_adjustments(case_id text);
 create table maintenance_nonroutine_role_results(case_id text);
 create table maintenance_hour_results(owner_type text,owner_id text,hours real);
 create table source_work(id text primary key);insert into source_work values('task-one');`);
 if(finalized){f.seal();f.service.finalize(f.id,f.payload(),f.finalizer);}
 f.cancel=(overrides={})=>f.transaction(()=>{
  const result=cancelNonroutineReviewForSourceRemoval({...f.common,caseId:f.id,flightId:'flight-one',subtaskId:'task-one',user:f.boss,sourceAction:'OPPORTUNITY_REMOVAL',reason:'authorized removal',qualify:user=>user.active?{accountId:user.id,personId:user.personId}:null,...overrides});
  f.db.prepare("delete from source_work where id='task-one'").run();return result;
 });
 f.snapshot=()=>Object.fromEntries(['maintenance_nonroutine_review_cases','maintenance_nonroutine_review_channels','maintenance_nonroutine_review_events','maintenance_nonroutine_review_outbox','maintenance_nonroutine_review_finals','maintenance_nonroutine_review_opinions','source_work'].map(table=>[table,f.db.prepare(`select * from ${table} order by 1`).all()]));
 return f;
}

function independentFixture(t,options){
 const f=cancellationFixture(t,options),owner={id:'cancel-owner',personId:'cancel-person'};
 let authorized=true,available=true;
 const service=createNonroutineReviewCancellation({...f.common,can:(user,permission)=>authorized&&user.id===owner.id&&permission==='maintenance.nonroutine.review.cancel',qualifiedAccount:id=>authorized&&id===owner.id?{accountId:id,personId:owner.personId}:null,sourceFacts:()=>({available})});
 const payload={revision:Number(f.db.prepare('select revision from maintenance_nonroutine_review_cases where id=?').get(f.id).revision),reason:'Independent authorized cancellation',clientId:'cancel-request-1'};
 return {...f,owner,payload,independent:(body=payload,user=owner)=>service.cancel(f.id,body,user),revoke:()=>{authorized=false;},hideSource:()=>{available=false;}};
}
test('independent cancellation requires separate authority and preserves work decisions and opinions on exact retry',t=>{
 const f=independentFixture(t,{finalized:true}),before=f.snapshot();
 assert.throws(()=>f.independent(f.payload,f.boss),{status:404});assert.deepEqual(f.snapshot(),before);
 const result=f.independent(),after=f.snapshot();assert.equal(result.replayed,false);assert.deepEqual(after.source_work,before.source_work);assert.deepEqual(after.maintenance_nonroutine_review_finals,before.maintenance_nonroutine_review_finals);assert.deepEqual(after.maintenance_nonroutine_review_opinions,before.maintenance_nonroutine_review_opinions);
 const event=after.maintenance_nonroutine_review_events.find(row=>row.id===result.eventId);assert.equal(event.event_type,'CANCELLED_BY_AUTHORIZED_OWNER');assert.equal(event.actor_id,f.owner.id);assert.equal(JSON.parse(event.detail_json).cause,'AUTHORIZED_REVIEW_CANCELLATION');
 assert.equal(f.independent().replayed,true);assert.deepEqual(f.snapshot(),after);
 assert.throws(()=>f.independent({...f.payload,reason:'changed'}),{status:409});assert.deepEqual(f.snapshot(),after);
 f.revoke();assert.throws(()=>f.independent(),{status:404});assert.deepEqual(f.snapshot(),after);
});
test('independent cancellation rejects stale incomplete and out of scope sources without changes',t=>{
 for(const variant of ['stale','reason','client','source']){const f=independentFixture(t),before=f.snapshot(),body={...f.payload};if(variant==='stale')body.revision++;if(variant==='reason')body.reason=' ';if(variant==='client')body.clientId='';if(variant==='source')f.hideSource();assert.throws(()=>f.independent(body),{status:['reason','client'].includes(variant)?400:409});assert.deepEqual(f.snapshot(),before);}
});
test('independent cancellation refuses every posting evidence including zero and rolls back audit failure',t=>{
 for(const sql of ["insert into maintenance_nonroutine_posting_receipts values(?)","insert into maintenance_nonroutine_hour_adjustments values(?)","insert into maintenance_nonroutine_role_results values(?)","insert into maintenance_hour_results values('subtask','task-one',0)","update maintenance_nonroutine_review_channels set state='MERGED_CLOSED'"]){const f=independentFixture(t,{finalized:true});f.db.prepare(sql).run(...(sql.includes('?')?[f.id]:[]));const before=f.snapshot();assert.throws(()=>f.independent(),{status:409});assert.deepEqual(f.snapshot(),before);}
 const f=independentFixture(t);f.accept();f.payload.revision=2;f.db.exec("create trigger reject_independent before insert on maintenance_nonroutine_review_events when new.event_type='CANCELLED_BY_AUTHORIZED_OWNER' begin select raise(abort,'audit unavailable');end");const before=f.snapshot();assert.throws(()=>f.independent(),/audit unavailable/);assert.deepEqual(f.snapshot(),before);
});
test('cancelled finalized work retains authorized read-only recognition history and current finalizer privacy access',t=>{
 const f=independentFixture(t,{finalized:true}),review=createNonroutineReview({...f.common,finalizationEnabled:()=>true}),before=f.snapshot();
 f.independent();const history=review.view(f.id,f.finalizer);assert.equal(history.state,'CANCELLED');assert.equal(history.capabilities.readAllOpinions,true);assert.equal(history.capabilities.finalizationView,true);assert.equal(history.capabilities.finalize,false);assert.equal(history.capabilities.sync,false);assert.equal(history.opinions.length,12);
 assert.equal(f.service.view(f.id,f.finalizer).channel.state,'CANCELLED_CLOSED');assert.deepEqual(f.snapshot().maintenance_nonroutine_review_finals,before.maintenance_nonroutine_review_finals);assert.throws(()=>f.service.retry(f.id,f.finalizer),{status:409});
 f.finalizer.permissions=f.finalizer.permissions.filter(p=>!p.endsWith('.finalize'));const revoked=review.view(f.id,f.finalizer);assert.equal(revoked.capabilities.readAllOpinions,false);assert.equal(revoked.capabilities.finalizationView,false);assert.equal(revoked.opinions.length,0);
});
test('cancellation before sealing does not expose unfinished private opinions to the named finalizer',t=>{
 const f=independentFixture(t),review=createNonroutineReview({...f.common,finalizationEnabled:()=>true});f.accept();f.review.submitOpinion(f.id,{revision:0,hours:2,basis:'UNSEALED-PRIVATE'},f.members[0]);f.payload.revision=2;f.independent();const history=review.view(f.id,f.finalizer);assert.equal(history.capabilities.readAllOpinions,false);assert.equal(history.capabilities.finalizationView,false);assert.equal(history.opinions.length,0);
});

test('source removal closes pending review and only pending reminders, with current actor audit and exact replay',t=>{
 const f=cancellationFixture(t);f.accept();
 f.db.prepare("update maintenance_nonroutine_review_outbox set state='SENT' where id=(select id from maintenance_nonroutine_review_outbox limit 1)").run();
 const before=f.snapshot(),first=f.cancel();assert.equal(first.replayed,false);
 const after=f.snapshot();assert.equal(after.maintenance_nonroutine_review_cases[0].state,'CANCELLED');assert.equal(after.maintenance_nonroutine_review_channels[0].state,'CANCELLED_CLOSED');
 assert.equal(after.source_work.length,0);assert.equal(after.maintenance_nonroutine_review_outbox.filter(row=>row.state==='PENDING').length,0);
 assert.equal(after.maintenance_nonroutine_review_outbox.filter(row=>row.state==='SENT').length,before.maintenance_nonroutine_review_outbox.filter(row=>row.state==='SENT').length);
 const event=after.maintenance_nonroutine_review_events.find(row=>row.id===first.eventId),detail=JSON.parse(event.detail_json);
 assert.equal(event.actor_id,f.boss.id);assert.equal(detail.qualification.personId,f.boss.personId);assert.equal(detail.reason,'authorized removal');assert.equal(detail.ledgerChanged,false);
 assert.equal(f.cancel().replayed,true);assert.deepEqual(f.snapshot(),after);
 assert.throws(()=>f.service.retry(f.id,f.finalizer),{status:409});
});

test('finalized pending synchronization can close without changing immutable decisions or twelve opinions',t=>{
 const f=cancellationFixture(t,{finalized:true}),before=f.snapshot();f.cancel();const after=f.snapshot();
 assert.deepEqual(after.maintenance_nonroutine_review_finals,before.maintenance_nonroutine_review_finals);
 assert.equal(after.maintenance_nonroutine_review_opinions.length,12);assert.deepEqual(after.maintenance_nonroutine_review_opinions,before.maintenance_nonroutine_review_opinions);
 assert.equal(after.maintenance_nonroutine_review_cases[0].revision,before.maintenance_nonroutine_review_cases[0].revision+1);
 assert.throws(()=>f.service.retry(f.id,f.finalizer),{status:409});
});

test('consumed channels and every independent posting evidence including zero hours forbid source removal',t=>{
 const checks=["update maintenance_nonroutine_review_channels set state='MERGED_CLOSED'", "update maintenance_nonroutine_review_channels set state='ADJUSTED_CLOSED'", "insert into maintenance_nonroutine_posting_receipts values(?)", "insert into maintenance_nonroutine_hour_adjustments values(?)", "insert into maintenance_nonroutine_role_results values(?)", "insert into maintenance_hour_results values('subtask','task-one',0)", "insert into maintenance_nonroutine_assessments(subtask_id,flight_id,report_batch_id,source_kind,source_fingerprint,application_json,participants_json,policy_json,review_case_id,effective_hours,created_at) values('task-one','flight-one','batch-one','REVIEW','fingerprint','{}','[]','{}',?,0,'t')"];
 for(const sql of checks){const f=cancellationFixture(t,{finalized:true});f.db.prepare(sql).run(...(sql.includes('?')?[f.id]:[]));const before=f.snapshot();assert.throws(()=>f.cancel(),{status:409});assert.deepEqual(f.snapshot(),before);}
});

test('revoked actor, mismatched source and inconsistent final versions cannot cancel',t=>{
 const f=cancellationFixture(t,{finalized:true});let before=f.snapshot();f.boss.active=false;assert.throws(()=>f.cancel(),{status:403});f.boss.active=true;
 assert.throws(()=>f.cancel({subtaskId:'other'}),{status:409});assert.deepEqual(f.snapshot(),before);
 f.db.prepare('update maintenance_nonroutine_review_channels set approved_revision=2').run();before=f.snapshot();assert.throws(()=>f.cancel(),{status:409});assert.deepEqual(f.snapshot(),before);
});

test('audit insertion or review CAS failure rolls back channel, reminders and original source deletion together',t=>{
 for(const trigger of ["create trigger reject_cancel before insert on maintenance_nonroutine_review_events when new.event_type='CANCELLED_BY_SOURCE_REMOVAL' begin select raise(abort,'audit unavailable');end", "create trigger reject_case before update on maintenance_nonroutine_review_cases when new.state='CANCELLED' begin select raise(ignore);end"]){
  const f=cancellationFixture(t);f.accept();f.db.exec(trigger);const before=f.snapshot();assert.throws(()=>f.cancel());assert.deepEqual(f.snapshot(),before);
 }
});
