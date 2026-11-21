import {createHash} from 'node:crypto';
import {normalizeMaintenanceStandardDefinition} from './maintenance-standard-management.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function loadWorkStandardRecognition(db,caseId,expectedFinalId=null){
  const item=db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(caseId),final=db.prepare('select * from maintenance_nonroutine_review_finals where case_id=?').get(caseId);
  if(!item||!final||item.state!=='FINALIZED'||Number(final.approved_revision)!==1)throw fail('施工事项尚无可用的锁定终审认定',409);
  if(expectedFinalId&&expectedFinalId!==final.id)throw fail('施工认定来源已变化，请重新核对',409);
  const decision=JSON.parse(final.decision_json),input={decision,participants:JSON.parse(final.participants_json),reason:final.reason,roleReason:final.role_verification_reason,admissionDecision:final.admission_decision};
  if(hash(input)!==final.input_digest){
    const event=db.prepare("select detail_json from maintenance_nonroutine_review_events where case_id=? and event_type='FINALIZED' order by created_at,id").all(caseId).map(row=>JSON.parse(row.detail_json)).find(row=>row.finalId===final.id);
    const attestation=event?.sourceFacts;
    if(!attestation?.attestationIncluded||!attestation.current||hash(attestation.current)!==attestation.token||typeof attestation.acknowledged!=='boolean')throw fail('施工终审依据核实快照缺失或不一致，请人工核对',409);
    input.sourceFactsToken=attestation.token;input.sourceFactsReviewed=attestation.acknowledged;
    if(hash(input)!==final.input_digest)throw fail('施工终审认定快照不一致，请人工核对',409);
  }
  return {item,final,decision};
}
export function workStandardPublicationSource(db,standardId,version){
  const binding=db.prepare('select * from maintenance_standard_work_sources where version_id=?').get(version.id);if(!binding)return null;
  if(binding.standard_id!==standardId||version.review_final_id!==binding.work_final_id)throw fail('标准与施工认定关联不一致',409);
  const {item,final,decision}=loadWorkStandardRecognition(db,binding.work_case_id,binding.work_final_id),aircraft=JSON.parse(binding.aircraft_json);
  if(final.input_digest!==binding.final_digest)throw fail('原施工锁定认定已变化，不能使用旧关联发布',409);
  const values=normalizeMaintenanceStandardDefinition({category:decision.category,chapter:decision.chapter,title:decision.title,workScope:decision.workScope,standardHours:decision.recognizedHours,...aircraft});
  const stored=normalizeMaintenanceStandardDefinition({category:version.category,chapter:version.chapter,title:version.title,workScope:version.work_scope,standardHours:Number(version.standard_hours),aircraftCodes:JSON.parse(version.aircraft_codes_json),genericAircraft:Number(version.generic_aircraft)===1});
  if(JSON.stringify(values)!==JSON.stringify(stored))throw fail('标准草稿已偏离施工认定五项或冻结机型',409);
  const snapshot={kind:'WORK_FINAL',standardId,versionId:version.id,caseId:item.id,finalId:final.id,decision,aircraft,reviewAdmissionIntent:final.admission_decision,workSource:{flightId:item.flight_id,subtaskId:item.subtask_id,reportBatchId:item.report_batch_id,approvedRevision:Number(final.approved_revision)}};
  return {version,final,snapshot,digest:hash(snapshot)};
}
