import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { NONROUTINE_REVIEW_SCHEMA, NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA, createNonroutineReview } from '../nonroutine-review.mjs';
import { NONROUTINE_ASSESSMENT_SCHEMA } from '../nonroutine-assessment.mjs';
import { NONROUTINE_FINALIZATION_SCHEMA, createNonroutineFinalization } from '../nonroutine-finalization.mjs';

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
  const accept=()=>{review.submitOpinion(id,{revision:0,hours:1.5,basis:'finalization-0'},members[0]);};
  const seal=()=>{accept();for(let i=1;i<12;i++)review.submitOpinion(id,{revision:0,hours:i+1,basis:`PRIVATE-BASIS-${i}`},members[i]);};
  const payload=()=>({revision:Number(db.prepare('select revision from maintenance_nonroutine_review_cases where id=?').get(id).revision),decision:{category:application.category,chapter:application.chapter,title:application.title,workScope:application.workScope,recognizedHours:2},
    participantsVerified:true,participants:[...participants],reason:'',roleVerificationReason:'',admissionDecision:'PENDING'});
  return {db,service,review,id,boss,finalizer,members,accept,seal,payload,policy,calls:()=>calls,setOutcome:value=>{outcome=value;}};
}

test('finalization migration agrees with startup initialization and can be replayed', t=>{
  const {db}=fixture(t);const other=new DatabaseSync(':memory:');t.after(()=>other.close());
  for(const schema of [NONROUTINE_REVIEW_SCHEMA,NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA,NONROUTINE_ASSESSMENT_SCHEMA])other.exec(schema);
  const sql=fs.readFileSync(new URL('../migrations/045_nonroutine_finalization.sql',import.meta.url),'utf8');other.exec(sql);other.exec(sql);
  const schema=database=>database.prepare('select name,sql from sqlite_master order by name').all();
  assert.deepEqual(schema(db),schema(other));
});

test('only the current qualified named finalizer may act after all twelve distinct opinions seal',t=>{
  const f=fixture(t);f.accept();
  for(let i=1;i<11;i++)f.review.submitOpinion(f.id,{revision:0,hours:2,basis:'valid'},f.members[i]);
  assert.throws(()=>f.service.finalize(f.id,f.payload(),f.finalizer),{status:409});
  /* 新规则：权限+范围即资格，boss 有 finalize 权限，不再被 403 */
  f.review.submitOpinion(f.id,{revision:0,hours:2,basis:'last'},f.members[11]);
  assert.throws(()=>f.service.finalize(f.id,f.payload(),f.members[0]),{status:404});
  f.finalizer.active=false;
  assert.throws(()=>f.service.finalize(f.id,f.payload(),f.finalizer),{status:404});
  f.finalizer.active=true;
  assert.throws(()=>f.service.finalize(f.id,{...f.payload(),revision:999},f.finalizer),{status:409});
  assert.equal(f.calls(),0);
  assert.equal(Number(f.db.prepare('select count(*) n from maintenance_nonroutine_review_finals').get().n),0);
});

test('final decision freezes five fields, opinions and statistics and never silently publishes or continues reminders',t=>{
  const f=fixture(t);f.seal();
  const opinions=f.db.prepare('select * from maintenance_nonroutine_review_opinions order by person_id').all();
  const result=f.service.finalize(f.id,f.payload(),f.finalizer);
  assert.equal(result.channel.state,'NEEDS_ATTENTION');
  assert.deepEqual(result.statistics,{trimmedMean:6.5,median:6.5});
  assert.equal(result.opinionVersions.length,12);
  assert.equal(result.decision.recognizedHours,2); // reference statistics are not automatic recognition
  assert.equal(result.admissionDecision,'PENDING');
  assert.equal(f.db.prepare('select state from maintenance_nonroutine_review_cases where id=?').get(f.id).state,'FINALIZED');
  assert.equal(Number(f.db.prepare("select count(*) n from maintenance_nonroutine_review_outbox where state='PENDING'").get().n),0);
  assert.deepEqual(f.db.prepare('select * from maintenance_nonroutine_review_opinions order by person_id').all(),opinions);
  const publicView=f.service.view(f.id,f.members[0]);
  for(const key of ['reason','policy','statistics','opinionVersions','attempts'])assert.equal(publicView[key],undefined);
  assert.ok(!JSON.stringify(publicView).includes('PRIVATE-BASIS'));
  assert.equal(f.service.view(f.id,f.boss).opinionVersions.length,12);
});

test('finalization is immutable and replay does not consume a delivery channel twice',t=>{
  const f=fixture(t);f.seal();f.setOutcome({state:'MERGED_CLOSED',detail:{source:'isolated-test-adapter'}});
  const first=f.service.finalize(f.id,f.payload(),f.finalizer);
  assert.deepEqual(f.service.finalize(f.id,{...f.payload(),revision:1},f.finalizer),first);
  assert.deepEqual(f.service.retry(f.id,f.finalizer),first);
  assert.equal(f.calls(),1);
  assert.throws(()=>f.service.finalize(f.id,{...f.payload(),decision:{...f.payload().decision,recognizedHours:9},reason:'改写'},f.finalizer),{status:409});
  assert.equal(Number(f.db.prepare('select count(*) n from maintenance_nonroutine_review_finals').get().n),1);
});

test('changed definitions and roles require reasons and cannot invent or discard actual participants',t=>{
  const f=fixture(t);f.seal();const base=f.payload();
  assert.throws(()=>f.service.finalize(f.id,{...base,decision:{...base.decision,recognizedHours:3}},f.finalizer),{status:400});
  assert.throws(()=>f.service.finalize(f.id,{...base,participantsVerified:false},f.finalizer),{status:400});
  for(const participants of [[],[{personId:'invented',role:'主做'}],[...base.participants,...base.participants]])assert.throws(()=>f.service.finalize(f.id,{...base,participants},f.finalizer),{status:400});
  const roleChange={...base,participants:[{personId:'worker-one',role:'检验'}]};
  assert.throws(()=>f.service.finalize(f.id,roleChange,f.finalizer),{status:400});
  const result=f.service.finalize(f.id,{...roleChange,roleVerificationReason:'现场核对原参与人的实际角色'},f.finalizer);
  assert.equal(result.participants[0].role,'检验');
});

test('valid zero and undecided strategy recognition persist while unknown period or allocation prevents delivery',t=>{
  const f=fixture(t);f.seal();const base=f.payload();
  for(const recognizedHours of [null,true,' ',0.15,-1])assert.throws(()=>f.service.finalize(f.id,{...base,decision:{...base.decision,recognizedHours}},f.finalizer),{status:400});
  const result=f.service.finalize(f.id,{...base,decision:{...base.decision,category:'人工除冰',recognizedHours:0},reason:'认定0，策略待业务确认',admissionDecision:'EXCLUDE'},f.finalizer);
  assert.equal(result.decision.recognizedHours,0);
  assert.equal(result.policy.strategy,'UNDECIDED');
  assert.equal(result.channel.state,'NEEDS_ATTENTION');
  f.service.retry(f.id,f.finalizer);
  assert.equal(f.calls(),2);
  assert.equal(Number(f.db.prepare('select count(*) n from maintenance_nonroutine_review_finals').get().n),1);
});

test('failed delivery rolls the whole first finalization back and cancellation cannot reopen a channel',t=>{
  const f=fixture(t);f.seal();const before=f.db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(f.id);
  f.setOutcome(new Error('injected posting failure'));
  assert.throws(()=>f.service.finalize(f.id,f.payload(),f.finalizer),/injected/);
  assert.deepEqual(f.db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(f.id),before);
  assert.equal(Number(f.db.prepare('select count(*) n from maintenance_nonroutine_review_finals').get().n),0);
  assert.equal(f.db.prepare('select state from maintenance_nonroutine_review_channels').get().state,'WAITING_REVIEW');
  f.setOutcome({state:'NEEDS_ATTENTION',detail:{code:'PERIOD_STATUS_UNKNOWN'}});
  f.service.finalize(f.id,f.payload(),f.finalizer);
  f.db.prepare("update maintenance_nonroutine_review_channels set state='CANCELLED_CLOSED'").run();
  assert.throws(()=>f.service.retry(f.id,f.finalizer),{status:409});
});

test('terminal preview is read only and final submission rejects a stale complete policy token',t=>{
  const f=fixture(t);f.seal();const before=Number(f.db.prepare('select total_changes() n').get().n);
  const preview=f.service.preview(f.id,f.payload(),f.finalizer);
  assert.equal(preview.readOnly,true);assert.equal(preview.decision.recognizedHours,2);
  assert.equal(Number(f.db.prepare('select total_changes() n').get().n),before);assert.equal(f.calls(),0);
  /* 新规则：权限+范围即资格，boss 有 finalize 权限 → preview 不再 403 */
  f.policy.version='new-rule-version';
  assert.throws(()=>f.service.finalize(f.id,{...f.payload(),expectedPolicyToken:preview.policyToken},f.finalizer),{status:409}); void 0;
  assert.equal(Number(f.db.prepare('select count(*) n from maintenance_nonroutine_review_finals').get().n),0);
  const refreshed=f.service.preview(f.id,f.payload(),f.finalizer);assert.notEqual(refreshed.policyToken,preview.policyToken);assert.equal(refreshed.policyChanged,true);
  f.service.finalize(f.id,{...f.payload(),reason:'新版本已重新核实',expectedPolicyToken:refreshed.policyToken},f.finalizer);
});


test('changed construction facts require explicit current-version review in the same finalization and freeze the attestation',t=>{
 let current={available:true,changed:true,token:'a'.repeat(64),current:{title:'新范围'},baselineOrigin:'SUBMISSION_SNAPSHOT'};
 const f=fixture(t,{sourceFacts:()=>current});f.seal();const body={...f.payload(),reason:'核对范围变化后，本轮保留原人员和意见裁定'};
 assert.equal(f.service.preview(f.id,body,f.finalizer).sourceFacts.token,current.token);
 assert.throws(()=>f.service.finalize(f.id,body,f.finalizer),{status:409});
 assert.throws(()=>f.service.finalize(f.id,{...body,sourceFactsToken:current.token},f.finalizer),{status:409});
 assert.throws(()=>f.service.finalize(f.id,{...body,sourceFactsReviewed:true,sourceFactsToken:'b'.repeat(64)},f.finalizer),{status:409});
 const approved={...body,sourceFactsToken:current.token,sourceFactsReviewed:true};
 f.service.finalize(f.id,approved,f.finalizer);
 const event=JSON.parse(f.db.prepare("select detail_json from maintenance_nonroutine_review_events where case_id=? and event_type='FINALIZED'").get(f.id).detail_json);
 assert.equal(event.sourceFacts.token,current.token);assert.equal(event.sourceFacts.acknowledged,true);assert.deepEqual(event.sourceFacts.current,current.current);
 current={...current,token:'c'.repeat(64)};
 assert.equal(f.service.finalize(f.id,approved,f.finalizer).id,event.finalId);
 assert.throws(()=>f.service.finalize(f.id,{...approved,sourceFactsToken:current.token},f.finalizer),{status:409});
 assert.equal(f.db.prepare('select count(*) n from maintenance_nonroutine_review_finals').get().n,1);
});
