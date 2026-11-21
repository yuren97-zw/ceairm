import {standardUsage} from './maintenance-standard-references.mjs';
import {createHash} from 'node:crypto';
import {NONROUTINE_REVIEW_SCHEMA,NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA,createNonroutineReview,reviewStatistics} from './nonroutine-review.mjs';
import {normalizeMaintenanceStandardDefinition} from './maintenance-standard-management.mjs';
const children=NONROUTINE_REVIEW_SCHEMA.slice(NONROUTINE_REVIEW_SCHEMA.indexOf('create table if not exists maintenance_nonroutine_review_seats'))
  .replace(/create index if not exists maintenance_nonroutine_review_flight[^;]+;/,'');
export const STANDARD_REVIEW_SCHEMA=`create table if not exists maintenance_standard_review_cases(
  id text primary key,
  standard_id text not null references maintenance_standards(id),
  version_id text not null unique references maintenance_standard_versions(id),
  base_version_id text references maintenance_standard_versions(id),
  source_revision integer not null,
  application_json text not null,
  aircraft_json text not null,
  applicant_account_id text not null,
  client_id text not null,
  request_hash text not null,
  reason text not null,
  state text not null check(state in ('PENDING_ACCEPTANCE','IN_REVIEW','SEALED','FINALIZED','CANCELLED')),
  revision integer not null default 1,
  finalizer_account_id text,
  accepted_at text,
  sealed_at text,
  created_at text not null,
  updated_at text not null,
  unique(applicant_account_id,client_id)
);
${(children+NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA).replaceAll('maintenance_nonroutine_review_','maintenance_standard_review_')}
create table if not exists maintenance_standard_review_finals(
  id text primary key,
  case_id text not null unique references maintenance_standard_review_cases(id),
  version_id text not null unique references maintenance_standard_versions(id),
  input_digest text not null,
  decision_json text not null,
  aircraft_json text not null,
  opinion_versions_json text not null,
  statistics_json text not null,
  admission_decision text not null check(admission_decision in ('PENDING','INCLUDE','EXCLUDE')),
  reason text not null,
  finalized_by text not null,
  created_at text not null
);`;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const permission=action=>`maintenance.nonroutine.review.${action}`;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createStandardReview(options){
  const {db,transaction,can,qualifiedAccount,clock,randomId}=options;
  const rounds=createNonroutineReview({...options,purpose:'STANDARD',finalizationEnabled:()=>true,sourceContext(item){
    const base=item.base_version_id&&db.prepare('select * from maintenance_standard_versions where id=? and standard_id=?').get(item.base_version_id,item.standard_id);
    if(item.base_version_id&&!base)throw fail('原标准版本来源不存在，请核对',409);
    const baseDefinition=base?{version:Number(base.version),...normalizeMaintenanceStandardDefinition({category:base.category,chapter:base.chapter,title:base.title,workScope:base.work_scope,standardHours:Number(base.standard_hours),aircraftCodes:JSON.parse(base.aircraft_codes_json),genericAircraft:Number(base.generic_aircraft)===1})}:null;
    return {requestReason:item.reason,baseDefinition};
  }});
  function request(standardId,payload,user){return transaction(()=>{
    if(!can(user,'maintenance.standard.manage',null))throw fail('当前账户没有全维修范围标准申请权限',403);
    if(!payload||Object.keys(payload).some(key=>!['revision','versionId','clientId','reason'].includes(key))||!Number.isInteger(payload.revision))throw fail('标准申请字段或版本无效');
    const reason=typeof payload.reason==='string'?payload.reason.trim():'',clientId=typeof payload.clientId==='string'?payload.clientId:'';
    if(!reason||reason.length>2000||!/^[a-zA-Z0-9_-]{8,128}$/.test(clientId))throw fail('请填写申请依据及有效请求标识');
    const digest=hash({standardId,versionId:payload.versionId,revision:payload.revision,reason});
    const prior=db.prepare('select * from maintenance_standard_review_cases where applicant_account_id=? and client_id=?').get(user.id,clientId);
    if(prior){if(prior.request_hash!==digest)throw fail('同一请求标识不能用于不同标准申请',409);return {review:rounds.view(prior.id,user),replayed:true};}
    const standard=db.prepare('select * from maintenance_standards where id=?').get(standardId),version=db.prepare('select * from maintenance_standard_versions where id=? and standard_id=?').get(payload.versionId,standardId);
    if(!standard||!version)throw fail('未找到标准版本',404);
    if(standard.status==='DISABLED'||Number(standard.revision)!==payload.revision||version.status!=='DRAFT'||version.review_final_id||version.published_at||version.admission_decision!=='PENDING')throw fail('标准状态或版本已变化，不能申请评议',409);
    const usage=standardUsage(options.referenceSnapshot?.(),'byVersion',version.id);if(!usage.available||usage.workItems>0)throw fail(usage.available?'标准草稿已有工作引用，请先核对来源':'标准引用量未核实，暂不能申请评议',409);
    if(db.prepare('select 1 from maintenance_standard_review_cases where version_id=?').get(version.id))throw fail('该标准版本已存在评议申请',409);
    let base=null;
    if(standard.status==='PUBLISHED'){
      if(!can(user,permission('finalize'),null))throw fail('只有最终评审权限可以发起已发布标准修订评议',403);
      const event=db.prepare("select snapshot_json from maintenance_standard_management_events where version_id=? and action='VERSION_DRAFT' order by revision desc limit 1").get(version.id);
      const baseVersion=event&&JSON.parse(event.snapshot_json).request?.baseVersion;
      base=baseVersion&&db.prepare("select id from maintenance_standard_versions where standard_id=? and version=? and status='PUBLISHED'").get(standardId,baseVersion);
      if(!base)throw fail('修订申请缺少原已发布标准版本关联',409);
    }
    const definition=normalizeMaintenanceStandardDefinition({category:version.category,chapter:version.chapter,title:version.title,workScope:version.work_scope,standardHours:Number(version.standard_hours),aircraftCodes:JSON.parse(version.aircraft_codes_json),genericAircraft:Number(version.generic_aircraft)===1});
    const application={category:definition.category,chapter:definition.chapter,title:definition.title,workScope:definition.workScope,requestedHours:definition.standardHours},aircraft={aircraftCodes:definition.aircraftCodes,genericAircraft:definition.genericAircraft};
    const id=randomId('stdreview'),stamp=clock();
    db.prepare(`insert into maintenance_standard_review_cases(id,standard_id,version_id,base_version_id,source_revision,application_json,aircraft_json,applicant_account_id,client_id,request_hash,reason,state,revision,created_at,updated_at)
      values(?,?,?,?,?,?,?,?,?,?,?,'PENDING_ACCEPTANCE',1,?,?)`).run(id,standardId,version.id,base?.id||null,standard.revision,JSON.stringify(application),JSON.stringify(aircraft),user.id,clientId,digest,reason,stamp,stamp);
    db.prepare('update maintenance_standards set revision=revision+1,updated_at=? where id=?').run(stamp,standardId);
    db.prepare("insert into maintenance_standard_review_events(id,case_id,actor_id,event_type,detail_json,created_at) values(?,?,?,'REQUESTED',?,?)").run(randomId('stdre'),id,user.id,JSON.stringify({standardId,versionId:version.id,baseVersionId:base?.id||null,sourceRevision:Number(standard.revision),reason}),stamp);
    return {review:rounds.view(id,user),replayed:false};
  });}
  function finalization(id,user){
    const review=rounds.view(id,user),row=db.prepare('select * from maintenance_standard_review_finals where case_id=?').get(id);if(!row)return {review,finalization:null};
    const publication=db.prepare('select v.status as version_status,s.status as standard_status from maintenance_standard_versions v join maintenance_standards s on s.id=v.standard_id where v.id=?').get(row.version_id);
    return {review,finalization:{id:row.id,decision:JSON.parse(row.decision_json),aircraft:JSON.parse(row.aircraft_json),admissionDecision:row.admission_decision,finalizedBy:row.finalized_by,createdAt:row.created_at,published:publication?.version_status==='PUBLISHED'&&publication?.standard_status==='PUBLISHED',
      ...(review.capabilities.readAllOpinions?{statistics:JSON.parse(row.statistics_json),opinionVersions:JSON.parse(row.opinion_versions_json),reason:row.reason}:{})}};
  }
  function finalize(id,payload,user){return transaction(()=>{
    const item=db.prepare('select * from maintenance_standard_review_cases where id=?').get(id);
    if(!item||!can(user,permission('finalize'),item)||item.finalizer_account_id!==user.id||qualifiedAccount(user.id,permission('finalize'),item)?.personId!==user.personId)throw fail('只有本标准事项当前有效的指定终审人可以认定',403);
    if(!payload||Object.keys(payload).some(key=>!['revision','decision','admissionDecision','reason'].includes(key))||!payload.decision||Object.keys(payload.decision).some(key=>!['category','chapter','title','workScope','recognizedHours'].includes(key)))throw fail('标准终审仅接受五项认定及准入意向');
    const aircraft=JSON.parse(item.aircraft_json),values=normalizeMaintenanceStandardDefinition({category:payload.decision.category,chapter:payload.decision.chapter,title:payload.decision.title,workScope:payload.decision.workScope,standardHours:payload.decision.recognizedHours,...aircraft});
    const decision={category:values.category,chapter:values.chapter,title:values.title,workScope:values.workScope,recognizedHours:values.standardHours},admissionDecision=payload.admissionDecision,reason=String(payload.reason||'').trim();
    if(!['PENDING','INCLUDE','EXCLUDE'].includes(admissionDecision)||reason.length>4000)throw fail('请明确准入意向并限制裁定依据长度');
    const original=JSON.parse(item.application_json),changed=['category','chapter','title','workScope'].some(key=>original[key]!==decision[key])||Number(original.requestedHours)!==decision.recognizedHours;
    if(changed&&!reason)throw fail('五项认定存在差异，请说明裁定依据');
    const digest=hash({decision,admissionDecision,reason}),prior=db.prepare('select input_digest from maintenance_standard_review_finals where case_id=?').get(id);
    if(prior){if(prior.input_digest!==digest)throw fail('本版本认定已锁定，不能改写或开启第二轮',409);return finalization(id,user);}
    if(item.state!=='SEALED'||!Number.isInteger(payload.revision)||Number(item.revision)!==payload.revision)throw fail('须12份封闭且事项版本一致后终审',409);
    const opinions=db.prepare('select * from maintenance_standard_review_opinions where case_id=? order by person_id').all(id),statistics=reviewStatistics(opinions.map(row=>Number(row.hours)));
    const standard=db.prepare('select * from maintenance_standards where id=?').get(item.standard_id),version=db.prepare('select * from maintenance_standard_versions where id=?').get(item.version_id);
    if(!standard||standard.status==='DISABLED'||Number(standard.revision)!==Number(item.source_revision)+1||version.status!=='DRAFT'||version.review_final_id||version.published_at)throw fail('原标准版本状态已变化，请核对来源',409);
    const currentDefinition=normalizeMaintenanceStandardDefinition({category:version.category,chapter:version.chapter,title:version.title,workScope:version.work_scope,standardHours:Number(version.standard_hours),aircraftCodes:JSON.parse(version.aircraft_codes_json),genericAircraft:Number(version.generic_aircraft)===1});
    const originalDefinition=normalizeMaintenanceStandardDefinition({category:original.category,chapter:original.chapter,title:original.title,workScope:original.workScope,standardHours:Number(original.requestedHours),...aircraft});
    if(JSON.stringify(currentDefinition)!==JSON.stringify(originalDefinition))throw fail('标准草稿定义已变化，请核对原申请来源',409);
    const finalId=randomId('std-final'),stamp=clock();
    db.prepare('insert into maintenance_standard_review_finals(id,case_id,version_id,input_digest,decision_json,aircraft_json,opinion_versions_json,statistics_json,admission_decision,reason,finalized_by,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(finalId,id,item.version_id,digest,JSON.stringify(decision),item.aircraft_json,JSON.stringify(opinions.map(row=>({personId:row.person_id,accountId:row.account_id,revision:Number(row.revision)}))),JSON.stringify(statistics),admissionDecision,reason,user.id,stamp);
    db.prepare('update maintenance_standard_versions set category=?,chapter=?,title=?,work_scope=?,standard_hours=?,admission_decision=?,review_final_id=? where id=?')
      .run(values.category,values.chapter,values.title,values.workScope,values.standardHours,admissionDecision,finalId,item.version_id);
    db.prepare('update maintenance_standards set revision=revision+1,updated_at=? where id=?').run(stamp,item.standard_id);
    db.prepare("update maintenance_standard_review_cases set state='FINALIZED',revision=revision+1,updated_at=? where id=?").run(stamp,id);
    db.prepare("update maintenance_standard_review_outbox set state='CANCELLED' where case_id=? and state='PENDING'").run(id);
    db.prepare("insert into maintenance_standard_review_events(id,case_id,actor_id,event_type,detail_json,created_at) values(?,?,?,'FINALIZED',?,?)").run(randomId('stdre'),id,user.id,JSON.stringify({finalId,admissionDecision,published:false}),stamp);
    return finalization(id,user);
  });}
  const {create,...methods}=rounds;return {...methods,request,finalization,finalize};
}
