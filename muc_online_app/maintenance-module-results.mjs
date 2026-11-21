export const MAINTENANCE_RESULT_TYPES=Object.freeze(['HOUR','RELEASE_COUNT','CHECK_RESULT','APPROVAL_RESULT','TASK_OUTCOME','NO_SETTLEMENT_RESULT']);
const types=new Set(MAINTENANCE_RESULT_TYPES);
const fail=message=>{throw new TypeError(message);};
// References describe results owned by the original service. They never carry
// monetary values or manufacture zero-valued entries for non-settlement work.
export function maintenanceModuleResultReference(definition,source){
 if(!definition||!types.has(definition.resultType))fail('Unsupported maintenance result definition');
 if(source===null)return null;
 if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).some(key=>!['type','sourceId','sourceVersion','category','unit'].includes(key)))fail('Invalid maintenance result reference fields');
 if(source.type!==definition.resultType||typeof source.sourceId!=='string'||!source.sourceId.trim())fail('Maintenance result identity or type mismatch');
 if(!(Number.isSafeInteger(source.sourceVersion)&&source.sourceVersion>=0)&&!(typeof source.sourceVersion==='string'&&source.sourceVersion.trim()&&source.sourceVersion.length<=128))fail('Missing maintenance result source version');
 const result={type:source.type,sourceId:source.sourceId,sourceVersion:source.sourceVersion};
 if(source.type==='HOUR'){
  if(!['ROUTINE','NONROUTINE'].includes(definition.category)||source.category!==definition.category||Object.hasOwn(source,'unit'))fail('Maintenance hour category mismatch');
  result.category=definition.category;
 }else if(source.type==='RELEASE_COUNT'){
  if(source.unit!=='架次'||Object.hasOwn(source,'category'))fail('Release counts cannot be hour results');result.unit='架次';
 }else if(Object.hasOwn(source,'category')||Object.hasOwn(source,'unit'))fail('Non-settlement results cannot carry ledger dimensions');
 return result;
}
