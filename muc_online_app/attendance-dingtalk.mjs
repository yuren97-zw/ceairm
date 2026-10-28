import {attendanceCategoryAllowed} from './public/attendance-presentation.mjs';
import {scheduleResponse,responseFailure} from './attendance-response-validation.mjs';
import {setTimeout as delay} from 'node:timers/promises';
import {enrichApprovalReason} from './attendance-approval-reasons.mjs';
import {stamp,dayOf,datesBetween} from './attendance-rules.mjs';
const text=v=>String(v??'').trim();
const field=(r,...names)=>names.map(k=>r?.[k]).find(v=>v!==undefined&&v!==null);
export function configuration(env=process.env){
  const startDate=text(env.ATTENDANCE_START_DATE)||'2026-09-01';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!Number.isFinite(Date.parse(startDate+'T00:00:00Z'))||new Date(startDate+'T00:00:00Z').toISOString().slice(0,10)!==startDate||startDate<'2026-09-01')throw Error('ATTENDANCE_START_DATE_INVALID');
  const validation={enabled:env.ATTENDANCE_VALIDATION_ENABLED==='true',personIds:text(env.ATTENDANCE_VALIDATION_PERSON_IDS).split(',').map(v=>v.trim()).filter(Boolean),from:text(env.ATTENDANCE_VALIDATION_FROM),to:text(env.ATTENDANCE_VALIDATION_TO)};
  if(validation.enabled&&(!validation.personIds.length||validation.personIds.length>13||!/^\d{4}-\d{2}-\d{2}$/.test(validation.from)||!/^\d{4}-\d{2}-\d{2}$/.test(validation.to)||!Number.isFinite(Date.parse(validation.from+'T00:00:00Z'))||!Number.isFinite(Date.parse(validation.to+'T00:00:00Z'))||validation.from>validation.to||Date.parse(validation.to+'T00:00:00Z')-Date.parse(validation.from+'T00:00:00Z')>3*86400000))throw Error('ATTENDANCE_VALIDATION_SCOPE_INVALID');
  return {approvalPlansEnabled:env.ATTENDANCE_APPROVAL_PLANS_ENABLED==='true',approvalPlanDueEnabled:env.ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED==='true',validation,appKey:text(env.DINGTALK_APP_KEY),appSecret:text(env.DINGTALK_APP_SECRET),operatorId:text(env.DINGTALK_OP_USER_ID),rootDepartmentId:text(env.DINGTALK_ROOT_DEPT_ID),reasonFieldId:text(env.DINGTALK_TRIP_REASON_FIELD_ID),reasonFieldName:text(env.DINGTALK_TRIP_REASON_FIELD_NAME)||'出差事由',enabled:env.ATTENDANCE_SYNC_ENABLED==='true',workerEnabled:env.ATTENDANCE_WORKER_ENABLED==='true',eventsEnabled:env.ATTENDANCE_EVENTS_ENABLED==='true',manualOnly:env.ATTENDANCE_MANUAL_ONLY==='true',corpId:text(env.DINGTALK_CORP_ID),unifiedAppId:text(env.DINGTALK_UNIFIED_APP_ID),monthlyBudget:Number(env.DINGTALK_MONTHLY_API_BUDGET)||8000,requestGapMs:Math.max(200,Number(env.DINGTALK_REQUEST_GAP_MS)||500),startDate};
}
export function configurationStatus(c){return {enabled:c.enabled,workerEnabled:!!c.workerEnabled,eventsEnabled:!!c.eventsEnabled,eventScopeConfigured:!!(c.corpId&&c.unifiedAppId),configured:!!(c.appKey&&c.appSecret&&c.operatorId&&c.rootDepartmentId),missing:[['DINGTALK_APP_KEY',c.appKey],['DINGTALK_APP_SECRET',c.appSecret],['DINGTALK_OP_USER_ID',c.operatorId],['DINGTALK_ROOT_DEPT_ID',c.rootDepartmentId]].filter(([,v])=>!v).map(([k])=>k),reasonFieldName:c.reasonFieldName,reasonFieldIdConfigured:!!c.reasonFieldId,monthlyBudget:c.monthlyBudget,schedule:'Asia/Shanghai 每日12:30核对昨天；周二10:00核对上周一至周日；每月3日11:30核对上月；无班次收尾任务'};}
export class DingTalkError extends Error {
 constructor(message,code,retryable=false){super(message);this.code=String(code);this.retryable=retryable;this.status=502;}
}
export class DingTalkClient {
 constructor(config,{fetchImpl=fetch,beforeRequest=async()=>{},sleep=delay}={}){this.config=config;this.fetch=fetchImpl;this.beforeRequest=beforeRequest;this.sleep=sleep;this.token=null;this.tokenUntil=0;this.nextRequest=0;}
 async transport(url,init,attempt=0){
  await this.beforeRequest({source:this.requestContext||'manual',endpoint:new URL(url).pathname,retry:attempt>0});
  await this.sleep(Math.max(0,this.nextRequest-Date.now()));this.nextRequest=Date.now()+this.config.requestGapMs;
  let response;
  try{response=await this.fetch(url,{...init,signal:AbortSignal.timeout(25000)});}catch{throw new DingTalkError('钉钉请求超时或网络不可达','NETWORK',true);}
  if(!response.ok){
   const data=await response.json().catch(()=>({}));
   const error=new DingTalkError(`钉钉HTTP错误 ${response.status}`,response.status,[429,500,502,503,504].includes(response.status));
   // Retain only explicit permission codes, never vendor text, identifiers or tokens.
   error.permissionCodes=[...new Set(String(data.message||'').match(/Workflow\.[A-Za-z]+\.(?:Read|Write|Manage)/g)||[])];
   throw error;
  }
  const data=await response.json();
  if(data.errcode!==undefined&&Number(data.errcode)!==0 || data.success===false || data.code&&data.code!=='0'&&data.code!=='OK'){
   const nested=String(data.errmsg||'').match(/subcode=(\d+)/);const code=String(nested?.[1]??data.errcode??data.code??'UNKNOWN');
   // Never return vendor messages: they may include tokens or private form content.
   const error=new DingTalkError(`钉钉接口未成功（错误码 ${code.replace(/[^\w.:-]/g,'').slice(0,80)}）`,code,['-1','88','90018','90002','130101','429','Throttling','ServiceUnavailable'].includes(code));
   error.permissionCodes=(String(data.errmsg||'').match(/requiredScopes=\[([A-Za-z0-9_., ]+)\]/)?.[1]||'').split(',').map(v=>v.trim()).filter(Boolean);
   throw error;
  }
  return data;
 }
 async accessToken(attempt=0){
  if(this.token&&Date.now()<this.tokenUntil)return this.token;
  const q=new URLSearchParams({appkey:this.config.appKey,appsecret:this.config.appSecret});
  const d=await this.transport('https://oapi.dingtalk.com/gettoken?'+q,{},attempt);
  if(!d.access_token)throw new DingTalkError('钉钉未返回访问令牌','TOKEN_MISSING');
  this.token=d.access_token;this.tokenUntil=Date.now()+Math.max(60,Number(d.expires_in||7200)-120)*1000;return this.token;
 }
 async call(path,body,{workflow=false,modern=false,method='POST'}={}){
  for(let attempt=0;attempt<4;attempt++){
   try{
    const token=await this.accessToken(attempt);
    if(workflow){const q=new URLSearchParams(body);return await this.transport('https://api.dingtalk.com/v1.0/workflow/processInstances?'+q,{headers:{'x-acs-dingtalk-access-token':token}},attempt);}
    if(modern)return await this.transport('https://api.dingtalk.com'+path+(method==='GET'?'?'+new URLSearchParams(body):''),{method,headers:{'Content-Type':'application/json','x-acs-dingtalk-access-token':token},...(method==='GET'?{}:{body:JSON.stringify(body)})},attempt);
    return await this.transport('https://oapi.dingtalk.com'+path+'?access_token='+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},attempt);
   }catch(e){
    if(e&&typeof e==='object'&&!e.endpoint)e.endpoint=workflow?'/v1.0/workflow/processInstances':path;
    if(['40014','42001','InvalidAuthentication','401'].includes(e.code)&&attempt<3){this.token=null;continue;}
    if(!e.retryable||attempt===3)throw e;
    await this.sleep(Math.min(60000,2000*2**attempt));
   }
  }
 }
 async directory(){
  const departments=[],users=new Map(),visited=new Set(),queue=[String(this.config.rootDepartmentId)];
  while(queue.length){
   const id=queue.shift();if(visited.has(id))continue;visited.add(id);
   const detail=await this.call('/topapi/v2/department/get',{dept_id:id});
   const dep=detail.result;if(!dep?.name)throw responseFailure('部门信息响应不完整','/topapi/v2/department/get','result.name',dep?.name,{missing:dep?.name===undefined});
   departments.push({id,name:dep.name,parentId:String(dep.parent_id??'')});
   const children=await this.call('/topapi/v2/department/listsub',{dept_id:id});
   if(!Array.isArray(children.result))throw responseFailure('下属部门响应不完整','/topapi/v2/department/listsub','result',children.result,{missing:children.result===undefined});
   queue.push(...children.result.map(d=>String(d.dept_id)));
   let cursor=0;const cursors=new Set();
   while(true){
    if(cursors.has(cursor))throw new DingTalkError('通讯录分页重复','PAGINATION');cursors.add(cursor);
    const d=await this.call('/topapi/v2/user/list',{dept_id:id,cursor,size:100,order_field:'entry_asc',contain_access_limit:false});
    if(!Array.isArray(d.result?.list))throw responseFailure('人员响应不完整','/topapi/v2/user/list','result.list',d.result?.list,{missing:d.result?.list===undefined});
    for(const u of d.result.list){const uid=text(u.userid);if(!uid)throw new DingTalkError('人员缺少用户ID','SCHEMA');const old=users.get(uid);users.set(uid,{userId:uid,employeeNo:text(u.job_number),name:text(u.name),departmentIds:[...new Set([...(old?.departmentIds||[]),id])]});}
    if(d.result.has_more===false)break;
    if(d.result.has_more!==true||d.result.next_cursor===undefined)throw new DingTalkError('通讯录分页状态缺失','SCHEMA');cursor=d.result.next_cursor;
   }
  }
  return {departments,users:[...users.values()]};
 }
 async results(userIds,from,to){
  const rows=[];let offset=0;
  for(let page=0;page<10000;page++){
   const d=await this.call('/attendance/list',{userIdList:userIds,workDateFrom:from+' 00:00:00',workDateTo:to+' 23:59:59',offset,limit:50,isI18n:false});
   if(!Array.isArray(d.recordresult))throw responseFailure('考勤结果响应结构不完整','/attendance/list','recordresult',d.recordresult,{missing:d.recordresult===undefined});rows.push(...d.recordresult);
   if(d.hasMore===false)return rows;
   if(d.hasMore!==true||d.recordresult.length===0)throw responseFailure('考勤结果分页状态异常','/attendance/list','hasMore/recordresult',d.hasMore,{missing:d.hasMore===undefined,code:'PAGINATION'});offset+=50;
  }
  throw new DingTalkError('分页数量超限','PAGINATION');
 }
 async leaveTypes(){
  const d=await this.call('/topapi/attendance/vacation/type/list',{op_userid:this.config.operatorId,vacation_source:'all'});
  if(!Array.isArray(d.result)||d.result.some(r=>!text(r.leave_name)))throw responseFailure('假期类型目录响应不完整','/topapi/attendance/vacation/type/list','result/leave_name',d.result,{missing:d.result===undefined});
  return [...new Map(d.result.filter(r=>attendanceCategoryAllowed(r.leave_name)).map(r=>[text(r.leave_code)||text(r.leave_name),{code:text(r.leave_code),name:text(r.leave_name),source:text(r.source),bizType:text(r.biz_type),unit:text(r.leave_view_unit)}])).values()];
 }
 async leaveQuotas(userIds,code){
  const rows=[],seenPages=new Set();let offset=0;
  for(let page=0;page<500;page++){
   const d=await this.call('/topapi/attendance/vacation/quota/list',{op_userid:this.config.operatorId,userids:userIds.join(','),leave_code:code,offset,size:50});
   if(!Array.isArray(d.result?.leave_quotas))throw responseFailure('假期额度响应不完整','/topapi/attendance/vacation/quota/list','result.leave_quotas',d.result?.leave_quotas,{missing:d.result?.leave_quotas===undefined});const key=JSON.stringify(d.result.leave_quotas.map(q=>[q.userid,q.quota_id]).sort());if(seenPages.has(key))throw new DingTalkError('假期额度返回重复页','PAGINATION');seenPages.add(key);rows.push(...d.result.leave_quotas);
   if(d.result.has_more===false)return rows;
   if(d.result.has_more!==true||!d.result.leave_quotas.length)throw new DingTalkError('假期额度分页状态异常','PAGINATION');offset+=50;
  }throw new DingTalkError('假期额度分页超限','PAGINATION');
 }
 async leaveRecords(userIds,code){
  const rows=[],seenPages=new Set(),seenRecords=new Set();
  // The live API interprets pageNumber as a record offset (0, 200, ...).
  for(let pageNumber=0;pageNumber<100000;pageNumber+=200){
   const d=await this.call('/v1.0/attendance/vacations/records/query',{opUserId:this.config.operatorId,leaveCode:code,userIds: userIds,pageNumber,pageSize:200},{modern:true});
   if(!Array.isArray(d.result?.leaveRecords))throw responseFailure('假期变更记录响应不完整','/v1.0/attendance/vacations/records/query','result.leaveRecords',d.result?.leaveRecords,{missing:d.result?.leaveRecords===undefined});const key=JSON.stringify(d.result.leaveRecords.map(r=>r.recordId).sort());if(seenPages.has(key))throw new DingTalkError('假期记录返回重复页','PAGINATION');seenPages.add(key);if(d.result.leaveRecords.some(r=>seenRecords.has(r.recordId)))throw new DingTalkError('假期记录分页重叠，未声明完整','PAGINATION');for(const r of d.result.leaveRecords)seenRecords.add(r.recordId);rows.push(...d.result.leaveRecords);
   if(d.result.hasMore===false)return rows;
   if(d.result.hasMore!==true||!d.result.leaveRecords.length)throw new DingTalkError('假期变更记录分页状态异常','PAGINATION');
  }throw new DingTalkError('假期记录分页超限','PAGINATION');
 }
 async schedules(userIds,from,to){
  const d=await this.call('/topapi/attendance/schedule/listbyusers',{op_user_id:this.config.operatorId,userids:userIds.join(','),from_date_time:Date.parse(from+'T00:00:00+08:00'),to_date_time:Date.parse(to+'T23:59:59+08:00')});
  return scheduleResponse(d);
 }
 async day(userId,date){
  const d=await this.call('/topapi/attendance/getupdatedata',{userid:userId,work_date:date+' 00:00:00'});
  const r=d.result;
  if(!r)throw responseFailure('逐日考勤响应不完整，不作为空记录保存','/topapi/attendance/getupdatedata','result',r,{missing:!Object.hasOwn(d,'result')});
  for(const key of ['attendance_result_list','approve_list','check_record_list'])if(!Array.isArray(r[key]))throw responseFailure('逐日考勤响应不完整，不作为空记录保存','/topapi/attendance/getupdatedata',key,r[key],{missing:!Object.hasOwn(r,key)});
  if(text(r.userid)!==userId||!stamp(r.work_date)||dayOf(stamp(r.work_date))!==date)throw responseFailure('逐日考勤人员或日期不匹配','/topapi/attendance/getupdatedata','userid/work_date',undefined);
  return r;
 }
 async approvalTemplates(offset=0){
  const endpoint='/v1.0/workflow/processes/userVisibilities/templates';
  const d=await this.call(endpoint,{userId:this.config.operatorId,maxResults:100,nextToken:offset},{modern:true,method:'GET'});
  if(!Array.isArray(d.result?.processList)||d.result.processList.some(v=>!v||typeof v.processCode!=='string'||typeof v.name!=='string'))throw responseFailure('审批模板清单不完整',endpoint,'result.processList',d.result?.processList);
  return {items:d.result.processList.map(v=>({name:v.name,process_code:v.processCode})),next:d.result.nextToken??null};
 }
 async approvalInstanceIds(code,from,to,cursor=0,userIds=[]){
  const endpoint='/v1.0/workflow/processes/instanceIds/query';
  const d=await this.call(endpoint,{processCode:code,startTime:from,endTime:to,maxResults:20,nextToken:cursor,...(userIds.length?{userIds}:{})},{modern:true});
  if(!Array.isArray(d.result?.list)||d.result.list.some(id=>typeof id!=='string'||!id))throw responseFailure('审批实例清单不完整',endpoint,'result.list',d.result?.list);
  const next=d.result.nextToken??null;
  if(next!==null&&(!Number.isSafeInteger(Number(next))||Number(next)<-1))throw new DingTalkError('审批清单分页标识无效','PAGINATION');
  return {ids:d.result.list,next};
 }
 async approval(id){const d=await this.call('',{processInstanceId:id},{workflow:true});if(!d.result||!Array.isArray(d.result.formComponentValues))throw responseFailure('审批详情缺少表单字段','/v1.0/workflow/processInstances','result.formComponentValues',d.result?.formComponentValues,{missing:d.result?.formComponentValues===undefined});return d.result;}
 async reportColumns(){const d=await this.call('/topapi/attendance/getattcolumns',{});return d.result;}
 async reportValues(userId,ids,from,to){const d=await this.call('/topapi/attendance/getcolumnval',{userid:userId,column_id_list:ids.join(','),from_date:from+' 00:00:00',to_date:to+' 23:59:59'});return d.result;}
}
export function extractReason(detail,config){
 const values=detail?.formComponentValues||[];
 const found=values.filter(v=>config.reasonFieldId?text(v.id)===config.reasonFieldId:text(v.name)===config.reasonFieldName);
 return found.length===1&&typeof found[0].value==='string'?found[0].value:null;
}
export function normalizeDay({date,userId,day,schedules,results=[],details=new Map(),config}){
 const schedule=schedules.filter(r=>text(field(r,'userid','userId'))===userId&&dayOf(stamp(field(r,'work_date','workDate')))===date);
 if(schedule.some(r=>r.time_zone_id&&r.time_zone_id!=='Asia/Shanghai'))throw new DingTalkError('排班时区与当前计算口径不一致','TIMEZONE');
 const rest=schedule.some(r=>r.is_rest==='Y');
 const scheduleConflict=rest&&schedule.some(r=>r.is_rest==='N');
 const points=schedule.filter(r=>r.is_rest!=='Y'&&stamp(r.plan_check_time)).map(r=>({type:r.check_type,planned:stamp(r.plan_check_time),planId:text(r.id),shiftId:text(r.shift_id),shiftVersion:text(r.shift_version)}));
 const raw=day.check_record_list;
 const all=[...day.attendance_result_list,...results.filter(r=>text(r.userId)===userId&&dayOf(stamp(r.workDate))===date)];
 const punches=all.map(r=>{
  const recordId=text(field(r,'record_id','recordId'));
  const rec=raw.find(p=>text(field(p,'record_id','recordId'))===recordId);
  return {type:field(r,'check_type','checkType'),planned:stamp(field(r,'plan_check_time','baseCheckTime','planCheckTime')),actual:stamp(field(r,'user_check_time','userCheckTime')),planId:text(field(r,'plan_id','planId')),recordId,source:field(r,'source_type','sourceType'),timeResult:field(r,'time_result','timeResult'),valid:!rec?.invalid_record_type&&field(r,'isLegal','is_legal')!==false,approvalId:text(field(r,'procInst_id','procInstId'))};
 });
 const approvals=day.approve_list.map(r=>{
  const id=text(field(r,'procInst_id','proc_inst_id','procInstId'));const entry=details.get(id);const detail=entry?.detail;
  const kind=r.tag_name==='出差'?'出差':r.tag_name==='外出'?'外出':r.tag_name==='请假'?'请假':r.tag_name;
  const revoked=detail&&(['TERMINATED','CANCELED','CANCELLED'].includes(detail.status)||detail.result==='refuse');
  const approved=detail?detail.status==='COMPLETED'&&detail.result==='agree':true;
  return enrichApprovalReason({id,kind,subType:text(r.sub_type),start:stamp(r.begin_time),end:stamp(r.end_time),approved,revoked:!!revoked,reason:kind==='出差'&&detail?extractReason(detail,config):null,detailStatus:entry?.status||'detail_missing'},entry,config);
 });
 // Only the necessary original fields are retained: no addresses, coordinates or device identifiers.
 return {date,covered:true,rest,scheduleConflict,scheduleRestFlags:schedule.map(r=>r.is_rest),points,punches,approvals,raw:{schedule:points,attendance:punches,approvals:approvals.map(a=>({...a})),source:'DingTalk API'}};
}
export function syncWindows(from,to){const dates=datesBetween(from,to),out=[];for(let i=0;i<dates.length;i+=7)out.push({from:dates[i],to:dates[Math.min(i+6,dates.length-1)]});return out;}
