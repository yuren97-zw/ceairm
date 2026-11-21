import {createHash} from 'node:crypto';
const kinds=new Set(['CHECK_RESULT','APPROVAL_RESULT','TASK_OUTCOME','NO_SETTLEMENT_RESULT']);
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=message=>{throw Object.assign(Error(message),{status:409});};
function definition(code,version,resultType){
 if(!/^extension_[a-z][a-z0-9_]{1,54}$/.test(code)||!Number.isSafeInteger(version)||version<1||!kinds.has(resultType))fail('Unsupported non-settlement extension definition');
 return {extensionContractVersion:1,moduleTypeCode:code,moduleVersion:version,resultType,countsAsFormalReportSubmission:false,requiredBeforePendingReview:false,requiredBeforeConfirmation:false,allowedAfterOpportunityConfirmed:false};
}
export function readMaintenanceExtensionInstances(db,opportunityId,instances,gateRuleVersion,coreCodes){
 return instances.filter(row=>!coreCodes.includes(row.module_code)).map(row=>{
  const stored=db.prepare('select * from maintenance_module_definitions where module_code=? and module_version=?').get(row.module_code,row.module_version);
  let value;try{value=JSON.parse(stored?.definition_json);}catch{fail('Extension definition missing');}
  const canonical=JSON.stringify(definition(row.module_code,Number(row.module_version),value?.resultType));
  if(stored.definition_json!==canonical||stored.content_sha256!==hash(canonical)||row.opportunity_key!==opportunityId||row.opportunity_id!==opportunityId||row.gate_rule_version!==gateRuleVersion||!/^[-a-zA-Z0-9_]{1,100}$/.test(row.instance_key)||row.id!==JSON.stringify([opportunityId,row.module_code,Number(row.module_version),row.instance_key]))fail('Extension identity or frozen definition mismatch');
  return {opportunityId,moduleInstanceId:row.id,...value,gateRuleVersion,applicability:'APPLICABLE',moduleBusinessState:'PENDING',completionAvailable:false,resultSource:null,identitySource:'PERSISTED'};
 });
}
// Internal service only: registration authority and the original transaction and
// identity reader must be supplied by the server. No role is implicitly granted.
export function createMaintenanceExtensionModules({db,transaction,readIdentity,authorize,audit,clock}){
 if([transaction,readIdentity,authorize,audit,clock].some(fn=>typeof fn!=='function'))throw TypeError('Missing extension registration authority');
 return {register(opportunityId,payload,user){return transaction(()=>{
  const flight=db.prepare('select * from maintenance_flights where id=?').get(opportunityId);
  if(!flight||authorize(user,flight)!==true)throw Object.assign(Error('Extension registration not authorized'),{status:403});
  if(!payload||Object.keys(payload).some(key=>!['moduleTypeCode','moduleVersion','resultType','instanceKey','expectedRuleSnapshot','reason'].includes(key)))fail('Invalid extension registration fields');
  const value=definition(payload.moduleTypeCode,payload.moduleVersion,payload.resultType),content=JSON.stringify(value),instanceKey=payload.instanceKey;
  if(typeof payload.reason!=='string'||!payload.reason.trim()||payload.reason.length>2000||typeof instanceKey!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(instanceKey))fail('Registration requires an explicit instance key and reason');
  const identity=readIdentity(db,opportunityId);
  if(!identity||payload.expectedRuleSnapshot!==identity.ruleSnapshotSha256)fail('Opportunity rule snapshot changed or unavailable');
  const stored=db.prepare('select * from maintenance_module_definitions where module_code=? and module_version=?').get(value.moduleTypeCode,value.moduleVersion);
  if(stored&&(stored.definition_json!==content||stored.content_sha256!==hash(content)))fail('Published module definition cannot be overwritten');
  const id=JSON.stringify([opportunityId,value.moduleTypeCode,value.moduleVersion,instanceKey]),prior=db.prepare('select * from maintenance_module_instances where id=?').get(id);
  if(prior)return {replayed:true,module:readMaintenanceExtensionInstances(db,opportunityId,[prior],identity.gateRuleVersion,[])[0]};
  if(flight.status==='已确认'||flight.archived_at)fail('Extensions cannot be attached to confirmed history');
  const stamp=clock();
  if(!stored)db.prepare('insert into maintenance_module_definitions(module_code,module_version,definition_json,content_sha256,created_at) values(?,?,?,?,?)').run(value.moduleTypeCode,value.moduleVersion,content,hash(content),stamp);
  db.prepare('insert into maintenance_module_instances(id,opportunity_key,opportunity_id,module_code,module_version,instance_key,gate_rule_version,created_at) values(?,?,?,?,?,?,?,?)').run(id,opportunityId,opportunityId,value.moduleTypeCode,value.moduleVersion,instanceKey,identity.gateRuleVersion,stamp);
  audit(user,{action:'register_nonsettlement_module',opportunityId,moduleInstanceId:id,definition:value,ruleSnapshot:identity.ruleSnapshotSha256,reason:payload.reason.trim()});
  return {replayed:false,module:readMaintenanceExtensionInstances(db,opportunityId,[db.prepare('select * from maintenance_module_instances where id=?').get(id)],identity.gateRuleVersion,[])[0]};
 });}};
}
