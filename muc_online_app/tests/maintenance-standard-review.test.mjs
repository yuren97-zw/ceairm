import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {MAINTENANCE_STANDARDS_SCHEMA,createMaintenanceStandards} from '../maintenance-standards.mjs';
import {STANDARD_MANAGEMENT_SCHEMA,createStandardManagement} from '../maintenance-standard-management.mjs';
import {STANDARD_REVIEW_SCHEMA,createStandardReview} from '../maintenance-standard-review.mjs';
function fixture(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('pragma foreign_keys=on');db.exec(MAINTENANCE_STANDARDS_SCHEMA);db.exec(STANDARD_MANAGEMENT_SCHEMA);db.exec(STANDARD_REVIEW_SCHEMA);
  db.exec('create table maintenance_flights(id text);create table maintenance_subtasks(id text);create table maintenance_hour_results(id text);create table maintenance_nonroutine_review_cases(id text);');
  let seq=0;const users=new Map(),actor=(id,permissions)=>{const user={id,personId:`person-${id}`,active:true,permissions};users.set(id,user);return user;},p=action=>`maintenance.nonroutine.review.${action}`;
  const admin=actor('admin',['maintenance.standard.manage',p('view'),p('assign'),p('opinions.view'),p('finalize')]),finalizer=actor('finalizer',[p('view'),p('finalize')]);
  const members=Array.from({length:12},(_,index)=>actor(`member-${index}`,[p('view'),p('opinion.submit')]));
  const common={referenceSnapshot:()=>({available:true,byVersion:new Map(),byStandard:new Map()}),db,can:(user,permission)=>user.active&&user.permissions.includes(permission),qualifiedAccount(id,permission){const user=users.get(id);return user?.active&&user.permissions.includes(permission)?{accountId:id,personId:user.personId,personName:id}:null;},clock:()=> '2026-11-10T00:00:00Z',randomId:prefix=>`${prefix}-${++seq}`,transaction(action){db.exec('begin immediate');try{const value=action();db.exec('commit');return value;}catch(error){db.exec('rollback');throw error;}}};
  const management=createStandardManagement({referenceSnapshot:()=>({available:true,byVersion:new Map(),byStandard:new Map()}),...common,versionUnderReview:id=>db.prepare('select id from maintenance_standard_review_cases where version_id=?').get(id),reviewEnabled:()=>true}),review=createStandardReview({...common,canAssignPerson:()=>true});
  const definition={category:'单项工作',chapter:'29',title:'标准评议样例',workScope:'左侧管路',standardHours:0,aircraftCodes:['A320'],genericAircraft:false};
  const draft=management.create({clientId:'create-standard',reason:'建立独立标准草稿',definition},admin);
  const request=()=>review.request(draft.standard.id,{clientId:'request-standard',revision:1,versionId:draft.versions[0].id,reason:'申请独立标准评议'},admin);
  const accept=id=>review.accept(id,{revision:1,accountIds:members.map(user=>user.id),finalizerAccountId:finalizer.id},admin);
  const seal=id=>{for(const [index,member] of members.entries())review.submitOpinion(id,{revision:0,hours:index/10,basis:`PRIVATE-STD-${index}`},member);return review.view(id,finalizer);};
  const decision={category:definition.category,chapter:definition.chapter,title:definition.title,workScope:definition.workScope,recognizedHours:0};
  return {db,common,admin,finalizer,members,actor,management,review,draft,request,accept,seal,decision};
}
test('standard review uses a typed version source, locks edits and never creates opportunity, work review or hour rows',t=>{
  const f=fixture(t),created=f.request(),id=created.review.id;assert.equal(created.review.purpose,'STANDARD');assert.equal(created.review.source.versionId,f.draft.versions[0].id);
  assert.equal(created.review.source.requestReason,'申请独立标准评议');assert.equal(created.review.source.baseDefinition,null);assert.equal(created.review.application.requestedHours,0);assert.equal(f.request().review.id,id);assert.equal(f.request().replayed,true);
  const managed=f.management.view(f.draft.standard.id,f.admin);assert.equal(managed.versions[0].reviewCaseId,id);assert.equal(managed.versions[0].capabilities.update,false);
  assert.throws(()=>f.management.update(f.draft.standard.id,{clientId:'update-locked',revision:2,versionId:f.draft.versions[0].id,reason:'不能改快照',definition:{category:'单项工作',chapter:'29',title:'改名',workScope:'右侧',standardHours:1,aircraftCodes:['A320'],genericAircraft:false}},f.admin),{status:409});
  for(const table of ['maintenance_flights','maintenance_subtasks','maintenance_hour_results','maintenance_nonroutine_review_cases'])assert.equal(f.db.prepare(`select count(*) n from ${table}`).get().n,0);
  const columns=f.db.prepare('pragma table_info(maintenance_standard_review_cases)').all().map(row=>row.name);assert.ok(!columns.includes('flight_id'));assert.ok(!columns.includes('report_batch_id'));
  const sql=fs.readFileSync(new URL('../migrations/053_maintenance_standard_review.sql',import.meta.url),'utf8');f.db.exec(sql);f.db.exec(sql);assert.equal(f.db.prepare('select count(*) n from maintenance_standard_review_cases').get().n,1);
});
test('standard round shares twelve-person privacy, seal and reference statistics but finalization never publishes or posts work',t=>{
  const f=fixture(t),id=f.request().review.id;assert.throws(()=>f.review.accept(id,{revision:1,accountIds:f.members.slice(1).map(user=>user.id),finalizerAccountId:f.finalizer.id},f.admin));f.accept(id);
  assert.equal(f.db.prepare("select count(*) n from maintenance_standard_review_outbox where event_type='REMINDER_24'").get().n,12);assert.equal(f.db.prepare("select count(*) n from maintenance_standard_review_outbox where event_type='REMINDER_72'").get().n,0);
  const input={revision:3,decision:f.decision,admissionDecision:'INCLUDE',reason:''};assert.throws(()=>f.review.finalize(id,input,f.finalizer),{status:409});
  f.review.submitOpinion(id,{revision:0,hours:0,basis:'PRIVATE-STD-0'},f.members[0]);assert.equal(f.review.view(id,f.members[1]).opinions.length,0);
  for(const [index,member] of f.members.slice(1).entries())f.review.submitOpinion(id,{revision:0,hours:(index+1)/10,basis:`PRIVATE-STD-${index+1}`},member);
  const sealed=f.review.view(id,f.finalizer);assert.equal(sealed.state,'SEALED');assert.equal(sealed.statistics.trimmedMean,0.55);assert.equal(sealed.capabilities.sync,false);
  assert.equal(f.review.view(id,f.members[0]).opinions.length,1);assert.throws(()=>f.review.submitOpinion(id,{revision:1,hours:1,basis:'封闭后修改'},f.members[0]),{status:409});assert.throws(()=>f.review.finalize(id,input,f.admin),{status:403});
  const result=f.review.finalize(id,input,f.finalizer);assert.equal(result.finalization.published,false);assert.equal(result.finalization.decision.recognizedHours,0);assert.equal(result.finalization.admissionDecision,'INCLUDE');assert.equal(result.review.state,'FINALIZED');
  assert.equal(f.review.finalize(id,input,f.finalizer).finalization.id,result.finalization.id);assert.throws(()=>f.review.finalize(id,{...input,reason:'不能改锁定值'},f.finalizer),{status:409});
  assert.equal(f.review.view(id,f.members[0]).capabilities.finalizationView,true);assert.equal(f.review.view(id,f.members[0]).statistics,undefined);assert.equal(f.review.finalization(id,f.members[0]).finalization.statistics,undefined);assert.equal(f.management.view(f.draft.standard.id,f.admin).versions[0].status,'DRAFT');assert.equal(createMaintenanceStandards({db:f.db}).list({aircraftCode:'A320'}).items.length,0);
  assert.equal(f.db.prepare('select count(*) n from maintenance_hour_results').get().n,0);assert.equal(f.db.prepare("select count(*) n from maintenance_standard_review_outbox where state='PENDING'").get().n,0);
});
test('published revision review retains explicit original version and prior published definition until a separate publication',t=>{
  const f=fixture(t),id=f.draft.standard.id;f.db.prepare("update maintenance_standards set status='PUBLISHED' where id=?").run(id);f.db.prepare("update maintenance_standard_versions set status='PUBLISHED',admission_decision='INCLUDE',published_by='publisher',published_at='2026-11-01',effective_at='2026-11-01' where standard_id=?").run(id);
  const original=f.db.prepare('select * from maintenance_standard_versions where standard_id=?').get(id);
  const next=f.management.revise(id,{clientId:'new-version',revision:1,baseVersion:1,reason:'修订标准',definition:{category:'单项工作',chapter:'29',title:'标准评议样例',workScope:'新范围',standardHours:1.2,aircraftCodes:['A320'],genericAircraft:false}},f.admin);
  const editor=f.actor('editor',['maintenance.standard.manage','maintenance.nonroutine.review.view']);assert.throws(()=>f.review.request(id,{clientId:'request-editor',revision:2,versionId:next.versions[0].id,reason:'无权发起已发布修订'},editor),{status:403});
  const created=f.review.request(id,{clientId:'request-revision',revision:2,versionId:next.versions[0].id,reason:'已授权人员发起'},f.admin);assert.equal(created.review.source.baseVersionId,original.id);assert.equal(created.review.source.baseDefinition.workScope,'左侧管路');assert.equal(created.review.source.baseDefinition.standardHours,0);f.accept(created.review.id);f.seal(created.review.id);
  f.review.finalize(created.review.id,{revision:3,decision:{...f.decision,workScope:'新范围',recognizedHours:1.2},admissionDecision:'PENDING',reason:''},f.finalizer);
  assert.deepEqual(f.db.prepare('select * from maintenance_standard_versions where id=?').get(original.id),original);assert.equal(createMaintenanceStandards({db:f.db,clock:()=> '2026-11-10'}).list({aircraftCode:'A320'}).items[0].version,1);
});
test('standard recognition rechecks source integrity and audit failure rolls back version, final and state',t=>{
  const f=fixture(t),id=f.request().review.id;f.accept(id);f.seal(id);const input={revision:3,decision:f.decision,admissionDecision:'EXCLUDE',reason:''};
  f.db.prepare('update maintenance_standard_versions set title=? where id=?').run('外部变更',f.draft.versions[0].id);assert.throws(()=>f.review.finalize(id,input,f.finalizer),{status:409});f.db.prepare('update maintenance_standard_versions set title=? where id=?').run(f.decision.title,f.draft.versions[0].id);
  f.db.exec("create trigger fail_standard_audit before insert on maintenance_standard_review_events when new.event_type='FINALIZED' begin select raise(abort,'standard audit failed'); end");assert.throws(()=>f.review.finalize(id,input,f.finalizer),/standard audit failed/);
  assert.equal(f.db.prepare('select count(*) n from maintenance_standard_review_finals').get().n,0);assert.equal(f.review.view(id,f.finalizer).state,'SEALED');assert.equal(f.db.prepare('select review_final_id from maintenance_standard_versions where id=?').get(f.draft.versions[0].id).review_final_id,null);
});
