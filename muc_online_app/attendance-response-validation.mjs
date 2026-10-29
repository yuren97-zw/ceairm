import {stamp,dayOf} from './attendance-rules.mjs';
export const scheduleEndpoint='/topapi/attendance/schedule/listbyusers';
export function responseFailure(message,endpoint,field,value,{missing=false,code='SCHEMA'}={}){
 const error=Object.assign(new Error(message),{code,retryable:false,status:502,endpoint,field,responseType:missing?'missing':value===null?'null':Array.isArray(value)?'array':typeof value});
 return error;
}
export function scheduleResponse(data){
 if(Array.isArray(data.result))return data.result;
 if(data.errcode===0&&data.success===true&&!Object.hasOwn(data,'result')){
  const rows=[];
  Object.defineProperty(rows,'scheduleEvidence',{value:{endpoint:scheduleEndpoint,status:'empty_candidate',basis:'explicit_success_omitted_result'},enumerable:false});
  return rows;
 }
 throw responseFailure('排班响应结构不完整',scheduleEndpoint,'result',data.result,{missing:!Object.hasOwn(data,'result')});
}
export function confirmEmptySchedule(evidence,day,results,userId,date){
 if(!evidence)return null;
 if(evidence.status!=='empty_candidate'||evidence.endpoint!==scheduleEndpoint)throw responseFailure('排班兼容依据无效',scheduleEndpoint,'scheduleEvidence',evidence);
 for(const field of ['attendance_result_list','approve_list','check_record_list'])if(!Array.isArray(day?.[field]))throw responseFailure('逐日资料不完整，不能确认空排班','/topapi/attendance/getupdatedata',field,day?.[field],{missing:!Object.hasOwn(day||{},field)});
 if(String(day.userid)!==userId||!stamp(day.work_date)||dayOf(stamp(day.work_date))!==date)throw responseFailure('逐日人员或日期不符，不能确认空排班','/topapi/attendance/getupdatedata','userid/work_date',undefined,{code:'SCHEMA'});
 const batchRows=(results||[]).filter(r=>String(r.userId??r.userid)===userId&&dayOf(stamp(r.workDate??r.work_date))===date);
 const hasPlan=[...day.attendance_result_list,...day.check_record_list,...batchRows].some(r=>[r.plan_check_time,r.planCheckTime,r.baseCheckTime].some(v=>!!stamp(v)));
 if(hasPlan)throw responseFailure('排班为空但逐日或打卡结果存在计划卡点；保留旧排班并待核对',scheduleEndpoint,'plan_check_time',true,{code:'SCHEDULE_CONFLICT'});
 return {endpoint:scheduleEndpoint,status:'empty_confirmed',basis:'explicit_success_omitted_result_and_validated_day'};
}
