import {createHash} from 'node:crypto';
import {normalizeMaintenanceStandardDefinition} from './maintenance-standard-management.mjs';
import {loadWorkStandardRecognition} from './maintenance-work-recognition-source.mjs';
import {STANDARD_PUBLICATION_SCHEMA} from './maintenance-standard-publication.mjs';
export const WORK_STANDARD_INTAKE_SCHEMA=`create table if not exists maintenance_standard_work_sources(
  version_id text primary key references maintenance_standard_versions(id),
  standard_id text not null references maintenance_standards(id),
  work_final_id text not null unique references maintenance_nonroutine_review_finals(id),
  work_case_id text not null unique references maintenance_nonroutine_review_cases(id),
  final_digest text not null,
  aircraft_json text not null,
  created_by text not null,
  client_id text not null,
  request_hash text not null,
  reason text not null,
  created_at text not null,
  unique(created_by,client_id)
);
${STANDARD_PUBLICATION_SCHEMA.replaceAll('maintenance_standard_admissions','maintenance_standard_work_admissions').replaceAll('maintenance_standard_publications','maintenance_standard_work_publications').replaceAll('maintenance_standard_review_finals','maintenance_nonroutine_review_finals').replaceAll('maintenance_standard_admission_history','maintenance_standard_work_admission_history')}`;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createWorkStandardIntake({db,transaction,can,clock,randomId,publicationView}){
  const authorize=user=>{if(!can(user,'maintenance.standard.publish'))throw fail('当前账户没有独立标准准入发布授权',403);};
  const binding=caseId=>db.prepare('select * from maintenance_standard_work_sources where work_case_id=?').get(caseId)||null;
  function view(caseId,user){
    authorize(user);const {item,final,decision}=loadWorkStandardRecognition(db,caseId),existing=binding(caseId);
    return {source:{kind:'WORK_FINAL',caseId:item.id,finalId:final.id,decision,reviewAdmissionIntent:final.admission_decision,workSource:{flightId:item.flight_id,subtaskId:item.subtask_id,reportBatchId:item.report_batch_id,approvedRevision:Number(final.approved_revision)}},canIntake:!existing,prepared:existing?{standardId:existing.standard_id,versionId:existing.version_id}:null};
  }
  function list(query,user){
    authorize(user);const search=String(query?.search||'').trim(),cursor=String(query?.cursor||'');if(search.length>100||cursor.length>128)throw fail('搜索或游标过长');
    // Search approved public fields, never private basis or original members' hours.
    const rows=db.prepare(`select c.id,f.decision_json,s.standard_id,s.version_id from maintenance_nonroutine_review_cases c
      join maintenance_nonroutine_review_finals f on f.case_id=c.id left join maintenance_standard_work_sources s on s.work_case_id=c.id
      where c.state='FINALIZED' and f.approved_revision=1 and c.id>? and lower(f.decision_json) like lower(?) order by c.id limit 51`).all(cursor,`%${search}%`);
    const items=[];
    for(const row of rows){const decision=JSON.parse(row.decision_json);
      items.push({caseId:row.id,title:decision.title,chapter:decision.chapter,category:decision.category,recognizedHours:decision.recognizedHours,prepared:row.version_id?{standardId:row.standard_id,versionId:row.version_id}:null});if(items.length===51)break;
    }
    return {items:items.slice(0,50),nextCursor:items.length>50?items[49].caseId:null};
  }
  function intake(caseId,payload,user){return transaction(()=>{
    authorize(user);if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!['finalId','aircraftCodes','genericAircraft','reason','clientId'].includes(key)))throw fail('施工认定转标准请求字段无效');
    const reason=typeof payload.reason==='string'?payload.reason.trim():'',clientId=typeof payload.clientId==='string'?payload.clientId:'';
    if(!reason||reason.length>2000||!/^[a-zA-Z0-9_-]{8,128}$/.test(clientId)||typeof payload.finalId!=='string'||!payload.finalId)throw fail('须明确来源认定、适用机型、操作依据及请求标识');
    const {final,decision}=loadWorkStandardRecognition(db,caseId,payload.finalId);
    const values=normalizeMaintenanceStandardDefinition({category:decision.category,chapter:decision.chapter,title:decision.title,workScope:decision.workScope,standardHours:decision.recognizedHours,aircraftCodes:payload.aircraftCodes,genericAircraft:payload.genericAircraft});
    const aircraft={aircraftCodes:values.aircraftCodes,genericAircraft:values.genericAircraft},digest=hash({caseId,finalId:final.id,aircraft,reason});
    const prior=db.prepare('select * from maintenance_standard_work_sources where created_by=? and client_id=?').get(user.id,clientId);
    if(prior){if(prior.request_hash!==digest)throw fail('同一请求标识不能用于不同施工认定或标准范围',409);return {replayed:true,result:publicationView(prior.standard_id,prior.version_id,user)};}
    if(binding(caseId))throw fail('本施工认定已转为标准草稿，请打开既有版本办理，不能重复生成',409);
    const stamp=clock(),standardId=randomId('mst'),versionId=randomId('msv');
    db.prepare("insert into maintenance_standards(id,status,revision,created_by,created_at,updated_at) values(?,'DRAFT',1,?,?,?)").run(standardId,user.id,stamp,stamp);
    db.prepare("insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,generic_aircraft,status,admission_decision,review_final_id,created_at) values(?,?,1,?,?,?,?,?,?,?,'DRAFT','PENDING',?,?)").run(versionId,standardId,values.category,values.chapter,values.title,values.workScope,values.standardHours,JSON.stringify(aircraft.aircraftCodes),aircraft.genericAircraft?1:0,final.id,stamp);
    db.prepare('insert into maintenance_standard_work_sources(version_id,standard_id,work_final_id,work_case_id,final_digest,aircraft_json,created_by,client_id,request_hash,reason,created_at) values(?,?,?,?,?,?,?,?,?,?,?)').run(versionId,standardId,final.id,caseId,final.input_digest,JSON.stringify(aircraft),user.id,clientId,digest,reason,stamp);
    return {replayed:false,result:publicationView(standardId,versionId,user)};
  });}
  return {list,view,intake};
}
