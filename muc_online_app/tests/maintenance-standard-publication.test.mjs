import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {publicationFixture} from './fixtures/maintenance-standard-publication.mjs';
import {createStandardPublication} from '../maintenance-standard-publication.mjs';

test('standard admission is explicit, append-only, separately authorized and does not publish or expose private opinions',t=>{
  const f=publicationFixture(t);assert.throws(()=>f.service.view(f.id,f.versionId,f.admin),{status:403});assert.equal(f.catalog.list({aircraftCode:'A320'}).items.length,0);
  for(const [index,decision]of ['PENDING','EXCLUDE','INCLUDE'].entries()){const result=f.admit(decision,`admit-${decision}`);assert.equal(result.result.admission.sequence,index+1);assert.equal(result.result.admission.decision,decision);assert.equal(result.result.publication,null);assert.ok(!JSON.stringify(result).includes('PRIVATE-PUBLICATION-CANARY'));assert.equal(f.catalog.list({aircraftCode:'A320'}).items.length,0);}
  assert.equal(f.service.view(f.id,f.versionId,f.publisher).admissionHistory.length,3);assert.equal(f.rounds.finalization(f.final.review.id,f.finalizer).finalization.admissionDecision,'PENDING');assert.equal(f.db.prepare('select status from maintenance_standard_versions where id=?').get(f.versionId).status,'DRAFT');
});
test('explicit zero publication requires the latest INCLUDE and approved frozen aircraft, then retries without rewriting records',t=>{
  const f=publicationFixture(t);const before=f.getRevision();assert.throws(()=>f.publish('no-admission'),{status:409});
  let result=f.admit('EXCLUDE'),admission=result.result.admission;assert.throws(()=>f.publish(admission.id),{status:409});result=f.admit('INCLUDE','admit-include');admission=result.result.admission;
  f.approval(false);assert.throws(()=>f.publish(admission.id),{status:409});f.approval(true);const revision=f.getRevision(),payload={revision,versionId:f.versionId,clientId:'publish-zero',admissionId:admission.id,effectiveAt:'2026-11-10T00:00:00Z',reason:'明确发布0小时'};
  const published=f.service.publish(f.id,payload,f.publisher);assert.equal(published.replayed,false);assert.equal(published.result.source.decision.recognizedHours,0);assert.equal(f.catalog.list({aircraftCode:'A320'}).items[0].standardHours,0);assert.equal(f.getRevision(),before+3);
  const rows=JSON.stringify(f.db.prepare('select * from maintenance_standard_publications').all());assert.equal(f.service.publish(f.id,payload,f.publisher).replayed,true);assert.equal(JSON.stringify(f.db.prepare('select * from maintenance_standard_publications').all()),rows);assert.equal(f.getRevision(),revision+1);assert.throws(()=>f.service.publish(f.id,{...payload,reason:'改写重试'},f.publisher),{status:409});assert.throws(()=>f.admit('EXCLUDE','admit-after-publish'),{status:409});
});
test('stale source revisions, old admission and reused identities cannot overwrite newer publication decisions',t=>{
  const f=publicationFixture(t),revision=f.getRevision(),payload={revision,versionId:f.versionId,clientId:'admit-first',reason:'第一份准入',decision:'INCLUDE'};
  const first=f.service.admit(f.id,payload,f.publisher);assert.equal(f.service.admit(f.id,payload,f.publisher).replayed,true);assert.throws(()=>f.service.admit(f.id,{...payload,clientId:'admit-stale'},f.publisher),{status:409});
  f.admit('PENDING','admit-pending');assert.throws(()=>f.publish(first.result.admission.id),{status:409});const last=f.admit('INCLUDE','admit-latest');assert.throws(()=>f.publish(last.result.admission.id,'admit-first'),{status:409});assert.throws(()=>f.service.admit(f.id,{...payload,decision:'EXCLUDE'},f.publisher),{status:409});
});
test('published revision remains on the old effective version until explicit future activation, while old snapshots and review finals stay unchanged',t=>{
  const f=publicationFixture(t),first=f.admit();f.publish(first.result.admission.id);const oldVersion=f.db.prepare('select * from maintenance_standard_versions where id=?').get(f.versionId),oldFinal=f.db.prepare('select * from maintenance_standard_review_finals where id=?').get(f.final.finalization.id),snapshot=f.catalog.snapshot();
  const revised=f.management.revise(f.id,{revision:f.getRevision(),baseVersion:1,clientId:'revise-published',reason:'修订标准新版本',definition:{...f.definition,workScope:'新版范围',standardHours:1.2}},f.admin),next=revised.versions[0].id;
  f.seal(next,f.getRevision(),'request-revision');const admitted=f.admit('INCLUDE','admit-revision',next);f.publish(admitted.result.admission.id,'publish-revision','2026-11-11T00:00:00Z',next);
  assert.equal(f.catalog.list({aircraftCode:'A320'}).items[0].version,1);assert.equal(f.service.view(f.id,f.versionId,f.publisher).version.lifecycle,'EFFECTIVE');assert.equal(f.service.view(f.id,next,f.publisher).version.lifecycle,'SCHEDULED');assert.equal(f.management.view(f.id,f.admin).versions[0].lifecycle,'SCHEDULED');f.time('2026-11-11T00:00:00Z');assert.equal(f.service.view(f.id,f.versionId,f.publisher).version.lifecycle,'SUPERSEDED');assert.equal(f.service.view(f.id,next,f.publisher).version.lifecycle,'EFFECTIVE');assert.equal(f.catalog.list({aircraftCode:'A320'}).items[0].version,2);assert.equal(snapshot.list({aircraftCode:'A320'}).items[0].standardHours,0);assert.deepEqual(f.db.prepare('select * from maintenance_standard_versions where id=?').get(f.versionId),oldVersion);assert.deepEqual(f.db.prepare('select * from maintenance_standard_review_finals where id=?').get(oldFinal.id),oldFinal);
});
test('publication requires a real timezone date and explicit non-retroactive activation, and rejects client approval or definition fields',t=>{
  const f=publicationFixture(t),admission=f.admit().result.admission,base={revision:f.getRevision(),versionId:f.versionId,clientId:'invalid-publication',reason:'日期验证',admissionId:admission.id,effectiveAt:'2026-11-10T00:00:00Z'};
  for(const value of ['',null,'2026-11-11T08:00','2026-02-30T00:00:00Z','2026-11-11T24:00:00Z','2026-11-09T23:59:59Z'])assert.throws(()=>f.service.publish(f.id,{...base,effectiveAt:value},f.publisher));
  for(const extra of [{approved:true},{definition:f.definition},{standardHours:99}])assert.throws(()=>f.service.publish(f.id,{...base,...extra},f.publisher),{status:400});
  f.approvalOverride({approved:true,reference:'wrong-scope',aircraftCodes:['A321'],genericAircraft:false});assert.throws(()=>f.service.publish(f.id,base,f.publisher),{status:409});
  const noApproval=createStandardPublication(f.common);assert.throws(()=>noApproval.publish(f.id,base,f.publisher),{status:409});assert.equal(f.db.prepare('select count(*) n from maintenance_standard_publications').get().n,0);
});
test('tampered standard or locked final prevents admission and publication rather than silently changing the public standard',t=>{
  const f=publicationFixture(t);f.db.prepare('update maintenance_standard_versions set standard_hours=1 where id=?').run(f.versionId);assert.throws(()=>f.admit(),{status:409});f.db.prepare('update maintenance_standard_versions set standard_hours=0 where id=?').run(f.versionId);
  const admission=f.admit().result.admission;f.db.prepare('update maintenance_standard_review_finals set reason=? where id=?').run('外部改写',f.final.finalization.id);assert.throws(()=>f.publish(admission.id),{status:409});assert.equal(f.catalog.list({aircraftCode:'A320'}).items.length,0);
});
test('admission and publication audit failures roll back all status changes and migration replay retains unique source receipts',t=>{
  const f=publicationFixture(t),before=f.getRevision();f.db.exec("create trigger fail_admission before insert on maintenance_standard_admissions begin select raise(abort,'admission audit failed'); end");assert.throws(()=>f.admit(),/admission audit failed/);assert.equal(f.getRevision(),before);assert.equal(f.db.prepare('select admission_decision from maintenance_standard_versions where id=?').get(f.versionId).admission_decision,'PENDING');f.db.exec('drop trigger fail_admission');const admission=f.admit().result.admission;
  f.db.exec("create trigger fail_publication_update before update on maintenance_standards begin select raise(abort,'publication status failed'); end");assert.throws(()=>f.publish(admission.id),/publication status failed/);assert.equal(f.db.prepare('select count(*) n from maintenance_standard_publications').get().n,0);assert.equal(f.db.prepare('select published_at from maintenance_standard_versions where id=?').get(f.versionId).published_at,null);f.db.exec('drop trigger fail_publication_update');f.publish(admission.id);
  const sql=fs.readFileSync(new URL('../migrations/048_maintenance_standard_publication.sql',import.meta.url),'utf8');f.db.exec(sql);f.db.exec(sql);assert.equal(f.db.prepare('select count(*) n from maintenance_standard_publications').get().n,1);
});

test('generic applicability requires an explicit approval for the same frozen generic scope',t=>{
  const f=publicationFixture(t,{genericAircraft:true,aircraftCodes:[]});assert.throws(()=>f.admit(),{status:400});
  const admission=f.service.admit(f.id,{revision:f.getRevision(),versionId:f.versionId,clientId:'generic-scope-consent',reason:'逐条核验并批准通用范围',decision:'INCLUDE',genericScopeApproved:true},f.publisher).result.admission;
  assert.equal(admission.genericScopeApproval.actorId,f.publisher.id);
  f.approvalOverride({approved:true,reference:'exact-only',aircraftCodes:['A320'],genericAircraft:false});assert.throws(()=>f.publish(admission.id),{status:409});
  f.approvalOverride({approved:true,reference:'synthetic-generic-approval',aircraftCodes:[],genericAircraft:true});f.publish(admission.id);assert.equal(f.catalog.list({aircraftCode:'A321'}).items[0].genericAircraft,true);
});

test('explicit immediate activation resolves the transaction time once and remains stable on later retries',t=>{
  const f=publicationFixture(t),admission=f.admit().result.admission,body={revision:f.getRevision(),versionId:f.versionId,clientId:'publish-immediate',reason:'明确立即生效',admissionId:admission.id,effectiveAt:'IMMEDIATE'};
  const first=f.service.publish(f.id,body,f.publisher);assert.equal(first.result.publication.effectiveAt,'2026-11-10T00:00:00.000Z');f.time('2026-11-11T00:00:00.000Z');const replay=f.service.publish(f.id,body,f.publisher);assert.equal(replay.replayed,true);assert.equal(replay.result.publication.effectiveAt,first.result.publication.effectiveAt);assert.equal(f.db.prepare('select count(*) n from maintenance_standard_publications').get().n,1);
  const listed=f.service.list({search:'独立发布标准'},f.publisher);assert.equal(listed.items.length,1);assert.equal(listed.items[0].admissionDecision,'INCLUDE');assert.ok(!JSON.stringify(listed).includes('PRIVATE-PUBLICATION-CANARY'));
});
