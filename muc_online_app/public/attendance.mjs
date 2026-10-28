import {attendanceRefreshColumns} from './attendance-presentation.mjs';
import {mountAttendanceView} from './attendance-view.mjs';
export function createAttendanceModule({host,api,hasPermission,isActive,onAuthExpired}){
 let view=null,month=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}).slice(0,7),sequence=0,poll=null,loading=false,viewMonth=null,viewCategories=new Set();
 async function load({resetDisplay=false}={}){
  if(!isActive())return;
  const seq=++sequence;loading=true;
  if(!view)host.textContent='正在读取考勤数据…';
  try{
   const [status,data]=await Promise.all([api('/attendance/status'),api('/attendance/days?month='+month)]);
   if(seq!==sequence||!isActive())return;
   const initialState=view?.getState();
   if(initialState&&resetDisplay){delete initialState.pageSize;initialState.displayMessage='';}
   if(initialState)initialState.columns=attendanceRefreshColumns(data.categories,viewCategories,initialState.columns,viewMonth!==data.month);
   viewMonth=data.month;viewCategories=new Set(data.categories);view?.destroy();
   view=mountAttendanceView(host,data,{initialState,status,canStats:hasPermission('attendance.stats.read'),canSync:status.canSync,canExport:status.canExport,onReload:()=>load({resetDisplay:true}),onSaveDisplaySettings:settings=>api('/attendance/display-settings',{method:'POST',body:settings}),onRefreshLeaveTypes:async()=>{await api('/attendance/leave-types/refresh',{method:'POST',body:{}});await load();},onMonth:async value=>{month=value;await load();},onSync:async()=>{const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),to=data.dates.at(-1)<today?data.dates.at(-1):today;await api('/attendance/sync',{method:'POST',body:{from:month+'-01',to}});await load();},onExport:async(format,scope,filters)=>{const selected=scope==='filtered'?{...filters,...(filters.categories?{categories:JSON.stringify(filters.categories)}:{})}:{},q=new URLSearchParams({month,scope,...selected}),blob=await api('/attendance/export/'+format+'?'+q);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`考勤_${month}_${scope==='all'?'全部有权人员':'筛选人员'}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}});
   clearTimeout(poll);if(status.runs.some(r=>['directory','running'].includes(r.status)))poll=setTimeout(()=>load(),30000);
  }catch(e){if(e.status===401)onAuthExpired?.(e);else{view?.destroy();view=null;host.textContent='考勤读取失败：'+e.message;const b=document.createElement('button');b.textContent='重试';b.onclick=load;host.append(b);}}
  finally{loading=false;}
 }
 return {load,setActive(active){if(active){if(!loading)load();}else{sequence++;clearTimeout(poll);view?.destroy();view=null;host.textContent='';}},destroy(){sequence++;clearTimeout(poll);view?.destroy();}};
}
