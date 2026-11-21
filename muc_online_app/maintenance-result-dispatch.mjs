import {MAINTENANCE_REPORT_DEFINITIONS} from './maintenance-opportunity-modules.mjs';
const fail=()=>{throw Object.assign(Error('模块结果类型与原专业服务不匹配'),{status:409});};
// Handlers are fixed host services, never request-supplied functions or scripts.
// Each handler retains its own transaction, authorization, locking and ledger.
export function createMaintenanceResultDispatcher(handlers){
 const names=['ROUTINE_HOUR','NONROUTINE_HOUR','RELEASE_COUNT','CHECK_RESULT','APPROVAL_RESULT','TASK_OUTCOME','NO_SETTLEMENT_RESULT'];
 if(!handlers||names.some(name=>typeof handlers[name]!=='function'))throw TypeError('Missing original maintenance result service');
 return {submit(module,payload,user){
  if(!module||typeof module.opportunityId!=='string'||!module.opportunityId||!module.moduleInstanceId)fail();
  const original=MAINTENANCE_REPORT_DEFINITIONS.find(item=>item.moduleTypeCode===module.moduleTypeCode);
  let target;
  if(original){
   if(module.moduleVersion!==original.moduleVersion||module.resultType!==original.resultType||module.category!==original.category||module.moduleInstanceId!==JSON.stringify([module.opportunityId,original.moduleTypeCode,original.moduleVersion]))fail();
   target=module.resultType==='HOUR'?module.category+'_HOUR':'RELEASE_COUNT';
  }else{
   if(!names.slice(3).includes(module.resultType)||!/^extension_[a-z][a-z0-9_]{1,54}$/.test(module.moduleTypeCode)||!Number.isSafeInteger(module.moduleVersion)||module.moduleVersion<1||module.countsAsFormalReportSubmission!==false||module.requiredBeforePendingReview!==false||module.requiredBeforeConfirmation!==false||payload?.result?.type!==module.resultType)fail();
   target=module.resultType;
  }
  return handlers[target](module,payload,user);
 }};
}
