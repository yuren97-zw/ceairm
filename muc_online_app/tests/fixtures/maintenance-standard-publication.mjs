import {NONROUTINE_REVIEW_SCHEMA,NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA} from '../../nonroutine-review.mjs';
import {NONROUTINE_ASSESSMENT_SCHEMA} from '../../nonroutine-assessment.mjs';
import {NONROUTINE_FINALIZATION_SCHEMA} from '../../nonroutine-finalization.mjs';
import {WORK_STANDARD_INTAKE_SCHEMA} from '../../maintenance-work-standard-intake.mjs';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {MAINTENANCE_STANDARDS_SCHEMA,createMaintenanceStandards} from '../../maintenance-standards.mjs';
import {STANDARD_MANAGEMENT_SCHEMA,createStandardManagement} from '../../maintenance-standard-management.mjs';
import {STANDARD_REVIEW_SCHEMA,createStandardReview} from '../../maintenance-standard-review.mjs';
import {STANDARD_PUBLICATION_SCHEMA,createStandardPublication} from '../../maintenance-standard-publication.mjs';
export function publicationFixture(t,{db:external,accounts={},genericAircraft=false,aircraftCodes=['A320']}={}){
  const db=external||new DatabaseSync(':memory:');if(!external){t.after(()=>db.close());db.exec('pragma foreign_keys=on');}
  for(const schema of [MAINTENANCE_STANDARDS_SCHEMA,STANDARD_MANAGEMENT_SCHEMA,STANDARD_REVIEW_SCHEMA,STANDARD_PUBLICATION_SCHEMA,NONROUTINE_REVIEW_SCHEMA,NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA,NONROUTINE_ASSESSMENT_SCHEMA,NONROUTINE_FINALIZATION_SCHEMA,WORK_STANDARD_INTAKE_SCHEMA])db.exec(schema);
  const prefix=randomUUID(),users=new Map(),p=action=>`maintenance.nonroutine.review.${action}`;
  const actor=(id,permissions)=>{const user={id:accounts[id]?.id||`pub-test-${prefix}-${id}`,personId:accounts[id]?.personId||`person-${prefix}-${id}`,active:true,permissions};users.set(user.id,user);return user;};
  const admin=actor('admin',['maintenance.standard.manage',p('view'),p('assign'),p('finalize')]),finalizer=actor('finalizer',[p('view'),p('finalize')]),publisher=actor('publisher',['maintenance.standard.publish']);
  const members=Array.from({length:12},(_,i)=>actor(`member-${i}`,[p('view'),p('opinion.submit')]));
  let sequence=0,stamp='2026-11-10T00:00:00.000Z';const common={referenceSnapshot:()=>({available:true,byVersion:new Map(),byStandard:new Map()}),db,can:(user,permission)=>Boolean(user?.active&&user.permissions.includes(permission)),qualifiedAccount(id,permission){const user=users.get(id);return user?.active&&user.permissions.includes(permission)?{accountId:id,personId:user.personId}:null;},clock:()=>stamp,randomId:kind=>`${kind}-${prefix}-${++sequence}`,transaction(fn){db.exec('begin');try{const value=fn();db.exec('commit');return value;}catch(error){db.exec('rollback');throw error;}}};
  const management=createStandardManagement({referenceSnapshot:()=>({available:true,byVersion:new Map(),byStandard:new Map()}),...common,reviewEnabled:()=>true,versionUnderReview:id=>db.prepare('select id from maintenance_standard_review_cases where version_id=?').get(id)}),rounds=createStandardReview(common);
  let approvalEnabled=true,approvalOverride=null;const approveApplicability=aircraft=>approvalEnabled?approvalOverride||{approved:true,reference:'synthetic-aircraft-approval',...aircraft}:null;
  const service=createStandardPublication({...common,approveApplicability}),definition={category:'单项工作',chapter:'29',title:'独立发布标准',workScope:'左侧',standardHours:0,aircraftCodes,genericAircraft};
  const draft=management.create({clientId:'create-foundation',reason:'标准基础测试',definition},admin),id=draft.standard.id,versionId=draft.versions[0].id;
  const seal=(versionId,revision,clientId)=>{const created=rounds.request(id,{revision,versionId,clientId,reason:'发布基础评议'},admin);rounds.accept(created.review.id,{revision:1,accountIds:members.map(user=>user.id),finalizerAccountId:finalizer.id},admin);for(const user of members)rounds.submitOpinion(created.review.id,{revision:0,hours:0,basis:'PRIVATE-PUBLICATION-CANARY'},user);const row=db.prepare('select * from maintenance_standard_versions where id=?').get(versionId);return rounds.finalize(created.review.id,{revision:3,decision:{category:row.category,chapter:row.chapter,title:row.title,workScope:row.work_scope,recognizedHours:Number(row.standard_hours)},admissionDecision:'PENDING',reason:''},finalizer);};
  const final=seal(versionId,1,'request-foundation');
  const getRevision=()=>Number(db.prepare('select revision from maintenance_standards where id=?').get(id).revision);
  const admit=(decision='INCLUDE',clientId='admit-foundation',target=versionId)=>service.admit(id,{revision:getRevision(),versionId:target,clientId,reason:'独立准入明确依据',decision},publisher);
  const publish=(admissionId,clientId='publish-foundation',effectiveAt=stamp,target=versionId)=>service.publish(id,{revision:getRevision(),versionId:target,clientId,reason:'独立发布明确依据',admissionId,effectiveAt},publisher);
  const catalog=createMaintenanceStandards({db,clock:()=>stamp});
  return {db,common,admin,finalizer,publisher,members,service,management,rounds,definition,id,versionId,final,seal,admit,publish,catalog,getRevision,time:value=>{stamp=value;},approval:value=>{approvalEnabled=value;},approvalOverride:value=>{approvalOverride=value;}};
}
