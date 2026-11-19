import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {publicationFixture} from './fixtures/maintenance-standard-publication.mjs';
import {createNonroutineReview} from '../nonroutine-review.mjs';
import {createNonroutineFinalization} from '../nonroutine-finalization.mjs';
import {createWorkStandardIntake} from '../maintenance-work-standard-intake.mjs';
function fixture(t){
  const f=publicationFixture(t),rounds=createNonroutineReview(f.common),policy={strategy:'ROLE_COMBINATION',category:'单项工作',ratios:{主做:1},valid:true,version:'frozen-work-policy'},participants=[{personId:'actual-worker',role:'主做'}];
  const id=rounds.create({flightId:'original-flight',subtaskId:'original-task',reportBatchId:'original-batch',applicationRevision:1,applicantId:f.admin.id,snapshot:{category:'单项工作',chapter:'29',title:'施工认定转标准',workScope:'原施工范围',requestedHours:2},participants,policySnapshot:policy});
  f.db.prepare("insert into maintenance_nonroutine_review_channels(id,case_id,subtask_id,state,created_at,updated_at) values('original-channel',?,'original-task','WAITING_REVIEW','t','t')").run(id);
  rounds.accept(id,{revision:1,accountIds:f.members.map(user=>user.id),finalizerAccountId:f.finalizer.id},f.admin);for(const user of f.members)rounds.submitOpinion(id,{revision:0,hours:0,basis:'PRIVATE-WORK-STANDARD-CANARY'},user);
  let posted=0;const finalization=createNonroutineFinalization({...f.common,capturePolicy:()=>policy,post(){posted++;return {state:'NEEDS_ATTENTION',detail:{code:'PERIOD_STATUS_UNKNOWN'}};}});
  const final=finalization.finalize(id,{revision:3,decision:{category:'单项工作',chapter:'29',title:'施工认定转标准',workScope:'原施工范围',recognizedHours:0},participantsVerified:true,participants,reason:'独立零认定',roleVerificationReason:'',admissionDecision:'PENDING'},f.finalizer);
  const intake=createWorkStandardIntake({...f.common,publicationView:(std,version,user)=>f.service.view(std,version,user)}),payload={finalId:final.id,clientId:'work-intake-client',reason:'明确施工认定作为新标准候选',aircraftCodes:['A320'],genericAircraft:false};
  const workTables=['maintenance_nonroutine_review_cases','maintenance_nonroutine_review_seats','maintenance_nonroutine_review_opinions','maintenance_nonroutine_review_opinion_history','maintenance_nonroutine_review_channels','maintenance_nonroutine_review_finals','maintenance_nonroutine_review_events','maintenance_nonroutine_review_outbox'];
  const facts=()=>workTables.map(table=>JSON.stringify(f.db.prepare(`select * from ${table}`).all()));
  return {...f,workId:id,workFinal:final,intake,payload,posted:()=>posted,facts};
}
test('work intake retains typed original final and zero without another standard round, publication or work-accounting change',t=>{
  const f=fixture(t),before=f.facts(),standardRounds=f.db.prepare('select count(*) n from maintenance_standard_review_cases').get().n;
  const created=f.intake.intake(f.workId,f.payload,f.publisher);assert.equal(created.result.source.kind,'WORK_FINAL');assert.equal(created.result.source.workSource.flightId,'original-flight');assert.equal(created.result.source.workSource.subtaskId,'original-task');assert.equal(created.result.source.decision.recognizedHours,0);assert.equal(created.result.admission,null);assert.equal(created.result.version.status,'DRAFT');assert.equal(created.result.source.reviewAdmissionIntent,'PENDING');assert.equal(created.result.source.aircraft.genericAircraft,false);
  assert.equal(f.db.prepare('select count(*) n from maintenance_standard_review_cases').get().n,standardRounds);assert.deepEqual(f.facts(),before);assert.equal(f.posted(),1);assert.ok(!JSON.stringify(created).includes('PRIVATE-WORK-STANDARD-CANARY'));assert.equal(f.catalog.list({aircraftCode:'A320'}).items.some(item=>item.id===created.result.standard.id),false);
  assert.equal(f.service.list({},f.publisher).items.find(item=>item.versionId===created.result.version.id).sourceKind,'WORK_FINAL');assert.equal(f.intake.view(f.workId,f.publisher).canIntake,false);
});
test('same work final is reusable only by exact idempotent replay and never silently duplicated or merged',t=>{
  const f=fixture(t),created=f.intake.intake(f.workId,f.payload,f.publisher);assert.equal(f.intake.intake(f.workId,f.payload,f.publisher).replayed,true);
  for(const changed of [{aircraftCodes:['A321']},{reason:'不同依据'}])assert.throws(()=>f.intake.intake(f.workId,{...f.payload,...changed},f.publisher),{status:409});assert.throws(()=>f.intake.intake(f.workId,{...f.payload,clientId:'another-client'},f.publisher),{status:409});
  assert.equal(f.intake.list({},f.publisher).items[0].prepared.versionId,created.result.version.id);assert.equal(f.db.prepare('select count(*) n from maintenance_standard_work_sources').get().n,1);
});
test('work-standard admission and publication use the same engine but typed work final foreign keys and never synchronize work again',t=>{
  const f=fixture(t),created=f.intake.intake(f.workId,f.payload,f.publisher),standardId=created.result.standard.id,versionId=created.result.version.id,before=f.facts();
  const admitted=f.service.admit(standardId,{revision:1,versionId,decision:'INCLUDE',reason:'独立纳入',clientId:'work-source-admit'},f.publisher);assert.equal(admitted.result.publication,null);assert.equal(f.db.prepare('select count(*) n from maintenance_standard_admissions').get().n,0);assert.equal(f.db.prepare('select final_id from maintenance_standard_work_admissions').get().final_id,f.workFinal.id);
  const publish={revision:2,versionId,admissionId:admitted.result.admission.id,effectiveAt:'IMMEDIATE',reason:'机型核对后独立发布',clientId:'work-source-publish'};
  f.service.publish(standardId,publish,f.publisher);assert.equal(f.service.publish(standardId,publish,f.publisher).replayed,true);assert.equal(f.catalog.list({aircraftCode:'A320'}).items.find(item=>item.id===standardId).standardHours,0);assert.equal(f.db.prepare('select final_id from maintenance_standard_work_publications').get().final_id,f.workFinal.id);assert.deepEqual(f.facts(),before);assert.equal(f.posted(),1);
});
test('intake requires explicit authority, final id and applicable scope and cannot edit the work recognition',t=>{
  const f=fixture(t);assert.throws(()=>f.intake.view(f.workId,f.admin),{status:403});for(const change of [{finalId:'wrong'},{aircraftCodes:[]},{recognizedHours:3},{approved:true}])assert.throws(()=>f.intake.intake(f.workId,{...f.payload,...change},f.publisher));
  f.db.prepare("update maintenance_nonroutine_review_cases set state='CANCELLED' where id=?").run(f.workId);assert.throws(()=>f.intake.intake(f.workId,f.payload,f.publisher),{status:409});
});
test('failure in provenance binding rolls back the candidate standard and retry uses the original work source',t=>{
  const f=fixture(t),count=f.db.prepare('select count(*) n from maintenance_standards').get().n,before=f.facts();f.db.exec("create trigger fail_work_binding before insert on maintenance_standard_work_sources begin select raise(abort,'work intake audit failed'); end");assert.throws(()=>f.intake.intake(f.workId,f.payload,f.publisher),/work intake audit failed/);assert.equal(f.db.prepare('select count(*) n from maintenance_standards').get().n,count);assert.deepEqual(f.facts(),before);f.db.exec('drop trigger fail_work_binding');f.intake.intake(f.workId,f.payload,f.publisher);
  const sql=fs.readFileSync(new URL('../migrations/050_work_standard_intake.sql',import.meta.url),'utf8');f.db.exec(sql);f.db.exec(sql);assert.equal(f.db.prepare('select count(*) n from maintenance_standard_work_sources').get().n,1);
});
test('tampered original work final or changed candidate fields cannot be admitted under the old provenance',t=>{
  const f=fixture(t),created=f.intake.intake(f.workId,f.payload,f.publisher),std=created.result.standard.id,version=created.result.version.id;
  f.db.prepare('update maintenance_standard_versions set standard_hours=1 where id=?').run(version);assert.throws(()=>f.service.view(std,version,f.publisher),{status:409});f.db.prepare('update maintenance_standard_versions set standard_hours=0 where id=?').run(version);
  f.db.prepare('update maintenance_nonroutine_review_finals set reason=? where id=?').run('外部改写',f.workFinal.id);assert.throws(()=>f.service.view(std,version,f.publisher),{status:409});
});
