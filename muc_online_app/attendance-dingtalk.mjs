import {setTimeout as delay} from 'node:timers/promises';
import {stamp,dayOf,datesBetween} from './attendance-rules.mjs';
const text=v=>String(v??'').trim();
const field=(r,...names)=>names.map(k=>r?.[k]).find(v=>v!==undefined&&v!==null);
export function configuration(env=process.env){
  return {appKey:text(env.DINGTALK_APP_KEY),appSecret:text(env.DINGTALK_APP_SECRET),operatorId:text(env.DINGTALK_OP_USER_ID),rootDepartmentId:text(env.DINGTALK_ROOT_DEPT_ID),reasonFieldId:text(env.DINGTALK_TRIP_REASON_FIELD_ID),reasonFieldName:text(env.DINGTALK_TRIP_REASON_FIELD_NAME)||'出差事由',enabled:env.ATTENDANCE_SYNC_ENABLED==='true',monthlyBudget:Number(env.DINGTALK_MONTHLY_API_BUDGET)||8000,requestGapMs:Math.max(200,Number(env.DINGTALK_REQUEST_GAP_MS)||500),startDate:'2026-09-01'};
}
export function configurationStatus(c){return {enabled:c.enabled,configured:!!(c.appKey&&c.appSecret&&c.operatorId&&c.rootDepartmentId),missing:[['DINGTALK_APP_KEY',c.appKey],['DINGTALK_APP_SECRET',c.appSecret],['DINGTALK_OP_USER_ID',c.operatorId],['DINGTALK_ROOT_DEPT_ID',c.rootDepartmentId]].filter(([,v])=>!v).map(([k])=>k),reasonFieldName:c.reasonFieldName,reasonFieldIdConfigured:!!c.reasonFieldId,monthlyBudget:c.monthlyBudget,schedule:'Asia/Shanghai 每日10:00、21:00'};}
export class DingTalkError extends Error {
 constructor(message,code,retryable=false){super(message);this.code=String(code);this.retryable=retryable;this.status=502;}
}
export class DingTalkClient {
 constructor(config,{fetchImpl=fetch,beforeRequest=async()=>{},sleep=delay}={}){this.config=config;this.fetch=fetchImpl;this.beforeRequest=beforeRequest;this.sleep=sleep;this.token=null;this.tokenUntil=0;this.nextRequest=0;}
 async transport(url,init){
  await this.beforeRequest();
  await this.sleep(Math.max(0,this.nextRequest-Date.now()));this.nextRequest=Date.now()+this.config.requestGapMs;
  let response;
  try{response=await this.fetch(url,{...init,signal:AbortSignal.timeout(25000)});}catch{throw new DingTalkError('钉钉请求超时或网络不可达','NETWORK',true);}
  if(!response.ok)throw new DingTalkError(`钉钉HTTP错误 ${response.status}`,response.status,[429,500,502,503,504].includes(response.status));
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
 async accessToken(){
  if(this.token&&Date.now()<this.tokenUntil)return this.token;
  const q=new URLSearchParams({appkey:this.config.appKey,appsecret:this.config.appSecret});
  const d=await this.transport('https://oapi.dingtalk.com/gettoken?'+q,{});
  if(!d.access_token)throw new DingTalkError('钉钉未返回访问令牌','TOKEN_MISSING');
  this.token=d.access_token;this.tokenUntil=Date.now()+Math.max(60,Number(d.expires_in||7200)-120)*1000;return this.token;
 }
 async call(path,body,{workflow=false}={}){
  for(let attempt=0;attempt<4;attempt++){
   try{
    const token=await this.accessToken();
    if(workflow){const q=new URLSearchParams(body);return await this.transport('https://api.dingtalk.com/v1.0/workflow/processInstances?'+q,{headers:{'x-acs-dingtalk-access-token':token}});}
    return await this.transport('https://oapi.dingtalk.com'+path+'?access_token='+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   }catch(e){
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
   const dep=detail.result;if(!dep?.name)throw new DingTalkError('部门信息响应不完整','SCHEMA');
   departments.push({id,name:dep.name,parentId:String(dep.parent_id??'')});
   const children=await this.call('/topapi/v2/department/listsub',{dept_id:id});
   if(!Array.isArray(children.result))throw new DingTalkError('下属部门响应不完整','SCHEMA');
   queue.push(...children.result.map(d=>String(d.dept_id)));
   let cursor=0;const cursors=new Set();
   while(true){
    if(cursors.has(cursor))throw new DingTalkError('通讯录分页重复','PAGINATION');cursors.add(cursor);
    const d=await this.call('/topapi/v2/user/list',{dept_id:id,cursor,size:100,order_field:'entry_asc',contain_access_limit:false});
    if(!Array.isArray(d.result?.list))throw new DingTalkError('人员响应不完整','SCHEMA');
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
   if(!Array.isArray(d.recordresult))throw new DingTalkError('考勤结果响应结构不完整','SCHEMA');rows.push(...d.recordresult);
   if(d.hasMore===false)return rows;
   if(d.hasMore!==true||d.recordresult.length===0)throw new DingTalkError('考勤结果分页状态异常','PAGINATION');offset+=50;
  }
  throw new DingTalkError('分页数量超限','PAGINATION');
 }
 async leaveTypes(){
  const d=await this.call('/topapi/attendance/vacation/type/list',{op_userid:this.config.operatorId,vacation_source:'all'});
  if(!Array.isArray(d.result)||d.result.some(r=>!text(r.leave_name)))throw new DingTalkError('假期类型目录响应不完整','SCHEMA');
  return [...new Map(d.result.map(r=>[text(r.leave_name),{name:text(r.leave_name),source:text(r.source),bizType:text(r.biz_type),unit:text(r.leave_view_unit)}])).values()];
 }
 async schedules(userIds,from,to){
  const d=await this.call('/topapi/attendance/schedule/listbyusers',{op_user_id:this.config.operatorId,userids:userIds.join(','),from_date_time:Date.parse(from+'T00:00:00+08:00'),to_date_time:Date.parse(to+'T23:59:59+08:00')});
  if(!Array.isArray(d.result))throw new DingTalkError('排班响应结构不完整','SCHEMA');return d.result;
 }
 async day(userId,date){
  const d=await this.call('/topapi/attendance/getupdatedata',{userid:userId,work_date:date+' 00:00:00'});
  const r=d.result;
  if(!r||!Array.isArray(r.attendance_result_list)||!Array.isArray(r.approve_list)||!Array.isArray(r.check_record_list))throw new DingTalkError('逐日考勤响应不完整，不作为空记录保存','SCHEMA');
  if(text(r.userid)!==userId||!stamp(r.work_date)||dayOf(stamp(r.work_date))!==date)throw new DingTalkError('逐日考勤人员或日期不匹配','SCHEMA');
  return r;
 }
 async approval(id){const d=await this.call('',{processInstanceId:id},{workflow:true});if(!d.result||!Array.isArray(d.result.formComponentValues))throw new DingTalkError('审批详情缺少表单字段','SCHEMA');return d.result;}
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
  return {id,kind,subType:text(r.sub_type),start:stamp(r.begin_time),end:stamp(r.end_time),approved,revoked:!!revoked,reason:detail?extractReason(detail,config):null,detailStatus:entry?.status||'detail_missing'};
 });
 // Only the necessary original fields are retained: no addresses, coordinates or device identifiers.
 return {date,covered:true,rest,scheduleConflict,scheduleRestFlags:schedule.map(r=>r.is_rest),points,punches,approvals,raw:{schedule:points,attendance:punches,approvals:approvals.map(a=>({...a})),source:'DingTalk API'}};
}
export function syncWindows(from,to){const dates=datesBetween(from,to),out=[];for(let i=0;i<dates.length;i+=7)out.push({from:dates[i],to:dates[Math.min(i+6,dates.length-1)]});return out;}
