import {mountLeaveView} from './attendance-leave-view.mjs';
import {attendanceRefreshColumns} from './attendance-presentation.mjs';
import {mountAttendanceView} from './attendance-view.mjs';
export function createAttendanceModule({host,api,hasPermission,isActive,onAuthExpired}){
 let view=null,month=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}).slice(0,7),sequence=0,poll=null,loading=false,viewMonth=null,viewCategories=new Set(),statusKey=null;
 const key=s=>JSON.stringify([s.dataVersion,s.approvalPlanVersion,s.leaveVersion,s.approvalReasonBackfill,s.clockBoundary,s.runs,s.hybrid?.pendingPeopleDays,s.hybrid?.stream?.connected,s.hybrid?.events,s.leaveTypes?.lastSyncedAt,new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})]);
 function schedulePoll(){clearTimeout(poll);if(isActive())poll=setTimeout(checkStatus,30000);}
 async function checkStatus(){
  if(!isActive())return;
  const seq=sequence;
  try{const status=await api('/attendance/status');if(seq!==sequence||!isActive())return;if(key(status)!==statusKey&&!host.querySelector('dialog[open]')&&!host.querySelector('[data-filter="query"]:focus')&&!host.querySelector('[data-lquery]:focus')){await load();return;}}catch(e){if(e.status===401)onAuthExpired?.(e);}
  schedulePoll();
 }
 async function load({resetDisplay=false}={}){
  if(!isActive())return;
  const seq=++sequence;loading=true;clearTimeout(poll);
  if(!view)host.textContent='正在读取考勤数据…';
  try{
   const requestedMonth=month,previousTab=view?.getState().tab;
   const statusResult=api('/attendance/status').then(value=>({value}),error=>({error}));
   const summary=hasPermission('attendance.stats.read')&&(!previousTab||['summary','sync','leave'].includes(previousTab));
   const data=await api(summary?'/attendance/summary?month='+requestedMonth+'&view=summary':'/attendance/days?month='+requestedMonth+'&view=compact');
   if(seq!==sequence||!isActive())return;
   const initialState=view?.getState();
   if(initialState&&resetDisplay){delete initialState.pageSize;initialState.displayMessage='';}
   if(initialState)initialState.columns=attendanceRefreshColumns(data.categories,viewCategories,initialState.columns,viewMonth!==data.month);
   viewMonth=data.month;viewCategories=new Set(data.categories);view?.destroy();
   view=mountAttendanceView(host,data,{initialState,onAuthExpired,onLoadOverview:()=>api('/attendance/days?month='+requestedMonth+'&view=compact'),onLoadPerson:personId=>api('/attendance/person?'+new URLSearchParams({month:requestedMonth,personId})).then(value=>value.people[0]),canStats:hasPermission('attendance.stats.read'),canSync:hasPermission('attendance.record.manage'),canExport:hasPermission('attendance.export'),onReload:()=>load({resetDisplay:true}),onLeaves:(content,initialState,onState,dialog)=>mountLeaveView(content,{api,approvalMonth:data.month,approvalPeople:data.detailLevel?[]:data.people,initialState,onState,dialog,pageSize:data.displaySettings.pageSize,canSync:hasPermission('attendance.record.manage'),canExport:hasPermission('attendance.export'),onExport:async(format,scope,filters)=>{const q=new URLSearchParams({year:filters.year,month,scope,...(scope==='filtered'?{query:filters.query,department:filters.department,team:filters.team}:{})});const blob=await api('/attendance/leave-balances/export/'+format+'?'+q),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`假期_${filters.year}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}}),onRetryPlanInventory:async()=>{await api('/attendance/approval-plans/refresh',{method:'POST',body:{retryInventory:true}});await load();},onRefreshPlan:async id=>{await api('/attendance/approval-plans/refresh',{method:'POST',body:{id}});await load();},onBackfillReasons:async()=>{const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});await api('/attendance/approval-reasons/backfill',{method:'POST',body:{from:month+'-01',to:data.dates.at(-1)<today?data.dates.at(-1):today}});await load();},onSaveDisplaySettings:settings=>api('/attendance/display-settings',{method:'POST',body:settings}),onRefreshLeaveTypes:async()=>{await api('/attendance/leave-types/refresh',{method:'POST',body:{}});await load();},onMonth:async value=>{month=value;await load();},onSync:async()=>{const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),to=data.dates.at(-1)<today?data.dates.at(-1):today;await api('/attendance/sync',{method:'POST',body:{from:month+'-01',to}});await load();},onExport:async(format,scope,filters)=>{const selected=scope==='filtered'?{...filters,...(filters.categories?{categories:JSON.stringify(filters.categories)}:{})}:{},q=new URLSearchParams({month,scope,...selected}),blob=await api('/attendance/export/'+format+'?'+q);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`考勤_${month}_${scope==='all'?'全部有权人员':'筛选人员'}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}});
   void statusResult.then(({value:status,error})=>{
    if(seq!==sequence||!isActive())return;
    if(error){if(error.status===401)onAuthExpired?.(error);else view?.setStatusError('同步状态读取失败，可刷新重试；考勤数据仍可查看。');schedulePoll();return;}
    statusKey=key(status);view?.setStatus(status);schedulePoll();
   });
  }catch(e){if(seq!==sequence||!isActive())return;if(e.status===401)onAuthExpired?.(e);else{view?.destroy();view=null;host.textContent='考勤读取失败：'+e.message;const b=document.createElement('button');b.textContent='重试';b.onclick=()=>load();host.append(b);}}
  finally{if(seq===sequence)loading=false;}
 }
 return {load,setActive(active){if(active){if(!loading)load();}else{sequence++;loading=false;clearTimeout(poll);view?.destroy();view=null;host.textContent='';}},destroy(){sequence++;loading=false;clearTimeout(poll);view?.destroy();view=null;}};
}
