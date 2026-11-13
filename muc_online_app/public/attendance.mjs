import {openOffsetAdministration} from './attendance-offset-ui.mjs';
import {mountLeaveView} from './attendance-leave-view.mjs';
import {attendanceRefreshColumns} from './attendance-presentation.mjs';
import {mountAttendanceView} from './attendance-view.mjs';
export function createAttendanceModule({host,api,hasPermission,isActive,onAuthExpired}){
 let savedViewState=null,view=null,month=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}).slice(0,7),sequence=0,poll=null,loading=false,viewMonth=null,viewCategories=new Set(),statusKey=null,leaveVersion='';
 // 自动重载仅在真正影响页面数据的版本变化时触发；clockBoundary/runs/events 等展示性字段
 // 由 30 秒轮询的 setStatus 直接更新（同步状态页签实时），不再引发整页销毁重建。
 const key=s=>JSON.stringify([s.dataVersion,s.offsetVersion,s.ledgerVersion,s.approvalPlanVersion,s.leaveVersion,s.approvalReasonBackfill?{status:s.approvalReasonBackfill.status,processed:s.approvalReasonBackfill.processed}:null,s.leaveTypes?.lastSyncedAt,new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})]);
 // 子页签大载荷记忆：同一数据版本内，逐日总览与假期在切换/自动重载时复用已取数据，不再重复下载。
 const overviewMemo={key:'',promise:null},leaveMemo={key:'',promise:null};
 function schedulePoll(){clearTimeout(poll);if(isActive())poll=setTimeout(checkStatus,30000);}
 async function checkStatus(){
  if(!isActive())return;
  const seq=sequence;
  try{const status=await api('/attendance/status');if(seq!==sequence||!isActive())return;if(key(status)!==statusKey&&!host.querySelector('dialog[open]')&&!host.querySelector('[data-filter="query"]:focus')&&!host.querySelector('[data-lquery]:focus')){statusKey=key(status);leaveVersion=status.leaveVersion||'';await load();return;}}catch(e){if(e.status===401)onAuthExpired?.(e);}
  schedulePoll();
 }
 async function load({target=null}={}){
  if(!isActive())return;
  const seq=++sequence;loading=true;clearTimeout(poll);
  if(!view)host.textContent='正在读取考勤数据…';
  try{
   const requestedMonth=month,previousTab=view?.getState().tab;
   const statusResult=api('/attendance/status').then(value=>({value}),error=>({error}));
   const summary=hasPermission('attendance.stats.read')&&(!previousTab||['summary','sync','leave'].includes(previousTab));
   const data=await api(target?'/attendance/person?'+new URLSearchParams({month:requestedMonth,personId:target.personId}):summary?'/attendance/summary?month='+requestedMonth+'&view=summary':'/attendance/days?month='+requestedMonth+'&view=compact');
   if(seq!==sequence||!isActive())return;
   const initialState=view?.getState()||savedViewState||{};initialState.columns ||= new Set(data.categories);if(target)Object.assign(initialState,{tab:'person',personId:target.personId,query:'',queryDraft:'',department:'',team:'',page:1});
   if(initialState)initialState.columns=attendanceRefreshColumns(data.categories,viewCategories,initialState.columns,viewMonth!==data.month);
   viewMonth=data.month;viewCategories=new Set(data.categories);view?.destroy();
   view=mountAttendanceView(host,data,{initialState,onAuthExpired,onLoadOverview:()=>{const memoKey='overview|'+requestedMonth+'|'+(data.dataVersion||'')+'|'+(data.offsetVersion||'')+'|'+(data.ledgerVersion||'');if(overviewMemo.key!==memoKey){overviewMemo.key=memoKey;overviewMemo.promise=api('/attendance/days?month='+requestedMonth+'&view=compact').catch(error=>{overviewMemo.key='';throw error;});}return overviewMemo.promise;},onLoadPerson:personId=>api('/attendance/person?'+new URLSearchParams({month:requestedMonth,personId})).then(value=>value.people[0]),onOffsetSettings:()=>openOffsetAdministration(api,data.people,['attendance.offset.rules.manage','attendance.offset.responsibility.manage'].filter(hasPermission)),canOffsetSettings:hasPermission('attendance.offset.rules.manage'),canStats:hasPermission('attendance.stats.read'),canSync:hasPermission('attendance.record.manage'),canExport:hasPermission('attendance.export'),onLeaves:(content,initialState,onState,dialog)=>mountLeaveView(content,{api:(path,init)=>{if(!init&&path.startsWith('/attendance/leave-balances?')){const memoKey='leave|'+path+'|'+leaveVersion;if(leaveMemo.key!==memoKey){leaveMemo.key=memoKey;leaveMemo.promise=api(path).catch(error=>{leaveMemo.key='';throw error;});}return leaveMemo.promise;}return api(path,init);},approvalMonth:data.month,approvalPeople:data.detailLevel?[]:data.people,initialState,onState,dialog,pageSize:data.displaySettings.pageSize,canSync:hasPermission('attendance.record.manage'),canExport:hasPermission('attendance.export'),onExport:async(format,scope,filters)=>{const q=new URLSearchParams({year:filters.year,month,scope,...(scope==='filtered'?{query:filters.query,department:filters.department,team:filters.team}:{})});const blob=await api('/attendance/leave-balances/export/'+format+'?'+q),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`假期_${filters.year}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}}),onRetryPlanInventory:async()=>{await api('/attendance/approval-plans/refresh',{method:'POST',body:{retryInventory:true}});await load();},onRefreshPlan:async id=>{await api('/attendance/approval-plans/refresh',{method:'POST',body:{id}});await load();},onBackfillReasons:async()=>{const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});await api('/attendance/approval-reasons/backfill',{method:'POST',body:{from:month+'-01',to:data.dates.at(-1)<today?data.dates.at(-1):today}});await load();},onSaveDisplaySettings:settings=>api('/attendance/display-settings',{method:'POST',body:settings}),onRefreshLeaveTypes:async()=>{await api('/attendance/leave-types/refresh',{method:'POST',body:{}});await load();},onMonth:async value=>{month=value;await load();},onSync:async()=>{const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),to=data.dates.at(-1)<today?data.dates.at(-1):today;await api('/attendance/sync',{method:'POST',body:{from:month+'-01',to}});await load();},onExport:async(format,scope,filters)=>{const selected=scope==='filtered'?{...filters,...(filters.categories?{categories:JSON.stringify(filters.categories)}:{})}:{},q=new URLSearchParams({month,scope,...selected}),blob=await api('/attendance/export/'+format+'?'+q);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`考勤_${month}_${scope==='all'?'全部有权人员':'筛选人员'}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}});
   if(target)await view.openPersonDay(target);
   void statusResult.then(({value:status,error})=>{
    if(seq!==sequence||!isActive())return;
    if(error){if(error.status===401)onAuthExpired?.(error);else view?.setStatusError('同步状态读取失败，可刷新重试；考勤数据仍可查看。');schedulePoll();return;}
    statusKey=key(status);leaveVersion=status.leaveVersion||'';view?.setStatus(status);schedulePoll();
   });
  }catch(e){if(seq!==sequence||!isActive())return;if(e.status===401)onAuthExpired?.(e);else{savedViewState=view?.getState()||savedViewState;view?.destroy();view=null;host.textContent='考勤读取失败：'+e.message;const b=document.createElement('button');b.textContent='重试';b.onclick=()=>load({target});host.append(b);}}
  finally{if(seq===sequence)loading=false;}
 }
 return {load,async openPersonDay(target){if(!target?.personId||!/^\d{4}-\d{2}-\d{2}$/.test(target.date)||Number.isNaN(Date.parse(target.date+'T00:00:00Z'))||new Date(target.date+'T00:00:00Z').toISOString().slice(0,10)!==target.date)throw Error('人员或日期无效');month=target.date.slice(0,7);await load({target});},setActive(active){if(active){if(!loading)load();}else{savedViewState=null;sequence++;loading=false;clearTimeout(poll);view?.destroy();view=null;host.textContent='';}},destroy(){savedViewState=null;sequence++;loading=false;clearTimeout(poll);view?.destroy();view=null;}};
}
