import crypto from 'node:crypto';
import {dayOf,datesBetween} from './attendance-rules.mjs';
const DAY=86400000;
export function *attendanceDates(from,to){
 for(let cursor=from;cursor<=to;){const end=shiftDate(cursor,365)<to?shiftDate(cursor,365):to;yield* datesBetween(cursor,end);cursor=shiftDate(end,1);}
}
const encode=JSON.stringify;
const decode=(v,f=null)=>{try{return JSON.parse(v);}catch{return f;}};
export const shiftDate=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
export const sourcePriority={approval_due:1,event:0,validation_initial:1,validation_recovery:1,recovery:1,manual:2,daily:3,weekly:4,monthly:5,initial:6};
// Calendar dates are Beijing dates; UTC is used only for date arithmetic.
export function attendancePeriods(date){
 const yesterday=shiftDate(date,-1),dow=new Date(date+'T00:00:00Z').getUTCDay();
 const monday=shiftDate(date,-((dow+6)%7));
 const [y,m]=date.split('-').map(Number),prev=new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,10);
 return {daily:{from:yesterday,to:yesterday,minute:750},weekly:{from:shiftDate(monday,-7),to:shiftDate(monday,-1),minute:600,eligible:dow===2},monthly:{from:prev,to:shiftDate(date.slice(0,7)+'-01',-1),minute:690,eligible:date.endsWith('-03')}};
}
const topics=new Set(['attendance_check_record','attendance_schedule_change','bpms_instance_change','attendance_approve_status_change','user_add_org','user_modify_org','user_leave_org','org_dept_modify','org_dept_create','org_dept_remove']);
export function sanitizeAttendanceEvent(frame,config={},batchDepth=0){
 const h=frame.headers||frame.header||{},topic=String(h.eventType||''),id=String(h.eventId||h.messageId||'');
 if(!id||id.length>250||!topic)throw Error('EVENT_SCHEMA');
 if(config.corpId&&h.eventCorpId!==config.corpId||config.unifiedAppId&&h.eventUnifiedAppId!==config.unifiedAppId)throw Error('EVENT_SCOPE');
 let data=frame.data||{};
 for(let i=0;i<2&&typeof data==='string';i++)data=JSON.parse(data);
 // Only designated transport envelopes are inspected. Never scan form values,
 // titles, comments, arbitrary JSON strings, GPS or device fields.
 const canonical=['userId','userIds','staffId','processInstanceId','checkTime','workDate','workDateBegin','workDateEnd','beginTime','endTime','startTime','finishTime','approveType','status','type','result'];
 const fold=k=>String(k).replace(/_/g,'').toLowerCase();
 const names=new Map(canonical.map(k=>[fold(k),k]));names.set('useridlist','userIds');
 const envelopes=new Set(['data','eventdata','payload','bizdata','checkrecord','checkrecords','record']);
 const payload={},conflicts=new Set(),schema=[];let batch=null,batchInvalid=false;
 function visit(value,depth,path){
  if(depth>3)return;
  if(typeof value==='string'){try{value=JSON.parse(value);}catch{return;}}
  if(Array.isArray(value)){for(const v of value.slice(0,100))visit(v,depth+1,path+'[]');return;}
  if(!value||typeof value!=='object')return;
  for(const [key,v] of Object.entries(value)){
   const normalized=fold(key),target=names.get(normalized);
   if(schema.length<60&&/^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(key)&&!['latitude','longitude','address','useraddress','device','deviceid','coordinates','location','title','comment','formcomponentvalues','attachments','reason'].includes(normalized))schema.push((path+key).slice(0,100));
   if(normalized==='datalist'){if(batchDepth>0||!Array.isArray(v)||v.length===0||v.length>1000||batch!==null)batchInvalid=true;else batch=v;continue;}
   if(target&&(typeof v==='string'||typeof v==='number'||Array.isArray(v)&&v.every(x=>typeof x==='string'))){
    if(payload[target]!==undefined&&JSON.stringify(payload[target])!==JSON.stringify(v))conflicts.add(target);
    else payload[target]=v;
   }else if(envelopes.has(normalized))visit(v,depth+1,path+key+'.');
  }
 }
 visit(data,0,'');
 for(const k of conflicts)delete payload[k];
 payload._schemaKeys=[...new Set(schema)];
 if(conflicts.size)payload._schemaConflicts=[...conflicts];

 const born=Number(h.eventBornTime);if(Number.isFinite(born)&&born>0)payload._eventBornAt=born;
 if(batch!==null){
  payload.records=batch.map(record=>sanitizeAttendanceEvent({...frame,data:record},config,batchDepth+1)).map(e=>({payload:e.payload,usable:e.usable}));
 }
 const hasUsers=payload.userId||payload.userIds?.length||payload.staffId;
 const usable=topic==='attendance_check_record'?!!(hasUsers&&payload.checkTime):topic==='attendance_schedule_change'?!!(hasUsers&&(payload.workDate||payload.workDateBegin)&&(payload.workDate||payload.workDateEnd)):['bpms_instance_change','attendance_approve_status_change'].includes(topic)?!!payload.processInstanceId:true;
 return {id,topic,payload,supported:topics.has(topic),usable:!batchInvalid&&(batch!==null?payload.records.every(r=>r.usable):usable&&!conflicts.size)};
}
export function createHybridCoordinator({db,config,clock,enqueue}){
 const now=()=>new Date(clock()).toISOString();
 const state=id=>decode(db.prepare('select value_json from attendance_sync_state where id=?').get(id)?.value_json);
 function setState(id,value){db.prepare('insert into attendance_sync_state(id,value_json,updated_at) values(?,?,?) on conflict(id) do update set value_json=excluded.value_json,updated_at=excluded.updated_at').run(id,encode(value),now());}
 function ensure(person,date){db.prepare('insert into attendance_refresh(person_id,work_date) values(?,?) on conflict(person_id,work_date) do nothing').run(person,date);return db.prepare('select * from attendance_refresh where person_id=? and work_date=?').get(person,date);}
 function dirty(person,date){
  if(date<config.startDate||date>dayOf(clock()))return;
  const r=ensure(person,date),at=clock(),first=r.first_dirty_at?Date.parse(r.first_dirty_at):at;
  db.prepare('update attendance_refresh set generation=generation+1,first_dirty_at=?,due_at=?,error=null where person_id=? and work_date=?').run(new Date(first).toISOString(),new Date(Math.min(at+60000,first+180000)).toISOString(),person,date);
  return Number(r.generation)+1;
 }
 function begin(task){const r=ensure(task.person_id,task.work_date);db.prepare('insert into attendance_task_marks(task_id,generation,started_at) values(?,?,?) on conflict(task_id) do update set generation=excluded.generation,started_at=excluded.started_at').run(task.id,r.generation,now());}
 function complete(task,complete,full=true){
  const mark=db.prepare('select * from attendance_task_marks where task_id=?').get(task.id);if(!mark)return;
  if(complete)db.prepare('update attendance_refresh set verified_generation=?,verified_at=case when ?=1 then ? else verified_at end,first_dirty_at=case when generation=? then null else first_dirty_at end,due_at=case when generation=? then null else due_at end,error=null where person_id=? and work_date=?').run(mark.generation,full?1:0,mark.started_at,mark.generation,mark.generation,task.person_id,task.work_date);
  if(complete)db.prepare('update attendance_event_targets set source_read_at=?,applied_at=? where person_id=? and work_date=? and generation<=? and applied_at is null').run(mark.started_at,now(),task.person_id,task.work_date,mark.generation);
  else db.prepare('update attendance_refresh set error=? where person_id=? and work_date=?').run('源数据或审批资料未完整读取',task.person_id,task.work_date);
 }
 function fresh(person,date){
  const r=ensure(person,date),input=decode(db.prepare('select input_json from attendance_days where person_id=? and work_date=?').get(person,date)?.input_json,{});
  const ends=(input.points||[]).filter(p=>p.type==='OffDuty').map(p=>p.planned).filter(Number.isFinite);
  const closedAt=ends.length?Math.max(...ends):Date.parse(shiftDate(date,1)+'T00:00:00+08:00');
  // A successful morning query cannot exempt an unfinished night shift from tomorrow's audit.
  return r.verified_at&&Date.parse(r.verified_at)>=closedAt&&clock()-Date.parse(r.verified_at)<DAY&&r.generation===r.verified_generation&&!r.error;
 }
 function inFlight(person,date){return !!db.prepare("select t.id from attendance_tasks t join attendance_runs r on r.id=t.run_id where t.person_id=? and t.work_date=? and t.status='pending' and r.status in ('running','directory') limit 1").get(person,date);}
 function receive(frame){
  const e=sanitizeAttendanceEvent(frame,config);
  const save=(id,payload,status)=>db.prepare("insert into attendance_events(id,topic,payload_json,received_at,status,error) values(?,?,?,?,?,?) on conflict(id) do update set payload_json=excluded.payload_json,status=excluded.status,error=excluded.error where attendance_events.status='schema_missing'").run(id,e.topic,encode(payload),now(),status,status==='schema_missing'?'事件关键字段缺失或冲突；未生成考勤任务，等待重投及源数据补偿核对':null);
  db.exec('begin immediate');try{
   const status=!e.supported?'unsupported':e.usable?(e.payload.records?'expanded':'pending'):'schema_missing';
   save(e.id,e.payload,status);
   if(e.supported&&e.payload.records)for(const [index,record] of e.payload.records.entries()){
    // Each list member retains its own identity/time pair and retry identity.
    const child='record-'+crypto.createHash('sha256').update(e.id+'#'+index).digest('hex');
    save(child,{...record.payload,_parentEventId:e.id},record.usable?'pending':'schema_missing');
   }
   if(status==='schema_missing')setState('recoveryNeeded',{since:null,reason:'事件关键字段缺失，不能证明范围；待当月及上月补偿核对'});
   db.exec('commit');
  }catch(error){db.exec('rollback');throw error;}
  if(e.supported&&!e.usable)throw Error('EVENT_FIELDS_MISSING');
  return e.id;
 }
 function processEvents(){
  for(const e of db.prepare("select * from attendance_events where status='pending' order by received_at limit 25").all()){
   const p=decode(e.payload_json,{});
   if(config.validation?.enabled&&!['attendance_check_record','attendance_schedule_change'].includes(e.topic)){db.prepare("update attendance_events set status='validation_held',error=? where id=?").run('当前验收阶段仅验证打卡及排班；审批等事件保留后续验证',e.id);continue;}
   if(e.topic.startsWith('user_')||e.topic.startsWith('org_')){setState('directory',null);setState('directoryRevision',e.id);db.prepare("update attendance_events set status='handled' where id=?").run(e.id);continue;}
   let ids=p.userIds??p.userId??p.userid??p.staffId??[];ids=Array.isArray(ids)?ids:String(ids).split(',').filter(Boolean);
   const approval=String(p.processInstanceId||p.process_instance_id||'');
   const old=[];
   if(approval){
    db.prepare('insert into attendance_approval_cache(id,status,fetched_at,invalidated_at) values(?,?,?,?) on conflict(id) do update set invalidated_at=excluded.invalidated_at').run(approval,'invalidated',now(),now()+'#'+e.id);
    for(const d of db.prepare('select person_id,work_date,input_json from attendance_days').all())if((decode(d.input_json,{}).approvals||[]).some(a=>a.id===approval))old.push({personId:d.person_id,date:d.work_date});
   }
   const members=db.prepare("select a.person_id,a.user_id from attendance_people a join personnel p on p.id=a.person_id where coalesce(a.identity_issue,'')='' and coalesce(p.data_status,'active')<>'deleted'").all();
   if(approval&&!ids.length&&!old.length)continue; // Resolve the instance owner before matching scope.
   let selected=members.filter(m=>ids.includes(m.user_id)||old.some(d=>d.personId===m.person_id));
   if(config.validation?.enabled){selected=selected.filter(m=>config.validation.personIds.includes(m.person_id));if(!selected.length){db.prepare("update attendance_events set status='validation_held',error=? where id=?").run('隔离验收范围外，未执行同步；保留后续补偿核对',e.id);continue;}}
   if(!selected.length){setState('directory',null);setState('directoryRevision',e.id);db.prepare("update attendance_events set status='unresolved',error=? where id=?").run('事件人员尚未唯一匹配授权人员；需核对通讯录或事件范围',e.id);continue;}
   const asDate=v=>{if(v===undefined||v===null||v==='')return null;const t=typeof v==='number'||/^\d{13}$/.test(String(v))?Number(v):Date.parse(String(v).replace(' ','T')+( /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d)?$/.test(String(v))?'+08:00':''));return Number.isFinite(t)?dayOf(t):null;};
   let from=asDate(p.workDateBegin??p.workDate),to=asDate(p.workDateEnd??p.workDate);
   let note=null;
   if(e.topic==='attendance_check_record'){
    const date=asDate(p.checkTime);if(date){
     from=date;to=date;
     // Only omit the adjacent day when a recent verified schedule rules out cross-night attribution.
     const previous=shiftDate(date,-1);
     const ambiguous=selected.some(m=>{
      const cache=db.prepare('select * from attendance_schedule_cache where person_id=? and work_date=?').get(m.person_id,previous);
      if(!cache||cache.invalidated_at||clock()-Date.parse(cache.verified_at)>=DAY)return true;
      const rows=decode(cache.schedules_json,[]);
      return !rows.length||rows.some(r=>r.is_rest!=='Y'&&asDate(r.plan_check_time)===date);
     });
     if(ambiguous)from=previous;
    } // includes previous attribution day for cross-night; never guesses earliest/latest punch
   }
   if(['bpms_instance_change','attendance_approve_status_change'].includes(e.topic)){
    // startTime/finishTime describe instance processing, not leave/trip duration.
    from=asDate(p.beginTime);to=asDate(p.endTime);
    if(config.approvalPlansEnabled&&approval){
     const row=db.prepare('select a.plan_json,a.person_id,q.generation,q.applied_generation from attendance_approval_plans a left join attendance_approval_plan_queue q on q.id=a.id where a.id=?').get(approval);
     const plan=decode(row?.plan_json,{});
     if(row&&!(row.generation>row.applied_generation)&&plan.dates?.length&&!plan.error&&selected.some(m=>m.person_id===row.person_id)){
      from=plan.dates[0];to=plan.dates.at(-1);
      if(old.length){from=[from,...old.map(d=>d.date)].sort()[0];to=[to,...old.map(d=>d.date)].sort().at(-1);}
      note='审批业务日期已从权威详情解析；未来计划独立保存，到期按人员日期复核';
     }
    }
    if(!from||!to){from=config.startDate;to=dayOf(clock());note='审批事件未提供可靠业务期间；已扩大至该人员全部已发生期间，避免漏改旧日期';}
   }
   if(!from||!to||from>to){db.prepare("update attendance_events set status='unresolved',error=? where id=?").run('事件未提供可靠日期范围，依靠周期核对并需验证事件字段',e.id);continue;}
   from=from<config.startDate?config.startDate:from;to=to>dayOf(clock())?dayOf(clock()):to;
   if(config.validation?.enabled){from=from<config.validation.from?config.validation.from:from;to=to>config.validation.to?config.validation.to:to;}
   if(from>to){db.prepare("update attendance_events set status='deferred',error=? where id=?").run('未来日期尚未到期，待对应日期的周期核对，不宣称已读取',e.id);continue;}
   db.exec('begin immediate');try{
    for(const m of selected)if(from<=to)for(const date of attendanceDates(from,to)){
     const generation=dirty(m.person_id,date);
     db.prepare('insert into attendance_event_targets(event_id,person_id,work_date,generation) values(?,?,?,?) on conflict(event_id,person_id,work_date) do update set generation=excluded.generation').run(e.id,m.person_id,date,generation);
     if(e.topic==='attendance_schedule_change')db.prepare('update attendance_schedule_cache set invalidated_at=? where person_id=? and work_date=?').run(now()+'#'+e.id,m.person_id,date);
    }
    for(const d of old){const generation=dirty(d.personId,d.date);if(generation!==undefined)db.prepare('insert into attendance_event_targets(event_id,person_id,work_date,generation) values(?,?,?,?) on conflict(event_id,person_id,work_date) do update set generation=excluded.generation').run(e.id,d.personId,d.date,generation);}
    db.prepare("update attendance_events set status='handled',error=? where id=?").run(note,e.id);db.exec('commit');
   }catch(error){db.exec('rollback');throw error;}
  }
 }
 function promote(){
  const due=db.prepare("select f.* from attendance_refresh f where f.due_at<=? and f.work_date>=? and f.work_date<=? and f.generation>f.verified_generation and f.error is null and not exists (select 1 from attendance_tasks t join attendance_runs r on r.id=t.run_id where t.person_id=f.person_id and t.work_date=f.work_date and t.status='pending' and r.status in ('running','directory')) order by f.due_at limit 100").all(now(),config.startDate,dayOf(clock()));
  const targets=due.filter(r=>!r.error&&!inFlight(r.person_id,r.work_date)).map(r=>({personId:r.person_id,date:r.work_date}));
  const months=new Map();for(const t of targets){const month=t.date.slice(0,7);if(!months.has(month))months.set(month,[]);months.get(month).push(t);}
  for(const group of months.values())enqueue({from:group.map(t=>t.date).sort()[0],to:group.map(t=>t.date).sort().at(-1),targets:group,source:'event',system:true});
 }
 function schedule(){
  if(!config.enabled||config.validation?.enabled)return;
  const date=dayOf(clock());if(date<config.startDate)return;
  const baseline=state('schedulerSince');
  // Upgrade baseline starts today; old successful history is not backfilled again.
  const first=state('schedulerCursor')||baseline||date;
  if(!baseline)setState('schedulerSince',date);
  const scanKey=new Date(clock()).toISOString().slice(0,16);
  if(state('schedulerScan')===scanKey)return;
  const needsInitial=!db.prepare('select id from attendance_runs limit 1').get()&&!db.prepare('select person_id from attendance_days limit 1').get();
  const local=new Date(clock()+8*3600000),minute=local.getUTCHours()*60+local.getUTCMinutes();
  for(const d of attendanceDates(first,date))for(const [source,p] of Object.entries(attendancePeriods(d))){
   if(p.eligible===false||d===date&&minute<p.minute||p.to<config.startDate)continue;
   const from=p.from<config.startDate?config.startDate:p.from;
   enqueue({from,to:p.to,id:`hybrid-${source}-${p.from}-${p.to}`,source,system:true});
  }
  // Retain first-install backfill, but don't duplicate any existing attendance history/run.
  if(needsInitial)for(let from=config.startDate;from<=date;){const to=shiftDate(from,365)<date?shiftDate(from,365):date;enqueue({from,to,id:from===config.startDate?'initial-backfill':'initial-backfill-'+from,source:'initial',system:true});from=shiftDate(to,1);}
  setState('schedulerCursor',date);setState('schedulerScan',scanKey);
 }
 function recover(since,reason='Stream断线，待补偿核对'){
  const today=dayOf(clock()),prior=attendancePeriods(today).monthly.from;
  let from=since?shiftDate(dayOf(since),-1):prior;from=from<config.startDate?config.startDate:from;
  if(from>today)from=today;
  const ids=[];
  for(let cursor=from;cursor<=today;){
   const monthEnd=new Date(Date.UTC(Number(cursor.slice(0,4)),Number(cursor.slice(5,7)),0)).toISOString().slice(0,10),to=monthEnd<today?monthEnd:today;
   const id=`hybrid-recovery-${since||prior}-${cursor}-${to}`;ids.push(id);enqueue({from:cursor,to,id,source:'recovery',system:true});cursor=shiftDate(to,1);
  }
  setState('recovery',{ids,from,to:today,reason,createdAt:now()});
 }
 function metrics(){
  const rows=db.prepare('select e.id,e.topic,e.received_at,count(t.event_id) as targets,max(t.applied_at) as applied_at,sum(case when t.applied_at is null then 1 else 0 end) as pending from attendance_events e left join attendance_event_targets t on t.event_id=e.id where e.received_at>=? group by e.id,e.topic,e.received_at').all(new Date(clock()-7*DAY).toISOString());
  const groups=new Map();for(const r of rows){if(!groups.has(r.topic))groups.set(r.topic,{topic:r.topic,received:0,completed:0,maxApplySeconds:null});const g=groups.get(r.topic);g.received++;if(Number(r.targets)>0&&Number(r.pending)===0){g.completed++;const seconds=Math.max(0,(Date.parse(r.applied_at)-Date.parse(r.received_at))/1000);g.maxApplySeconds=Math.max(g.maxApplySeconds||0,seconds);}}
  return [...groups.values()];
 }
 function summary(userPredicate){
  const s=userPredicate;
  const pending=db.prepare(`select count(*) as n from attendance_refresh f join personnel p on p.id=f.person_id where (${s.sql}) and f.generation>f.verified_generation`).get(...s.params).n;
  const missing=db.prepare(`select f.work_date as date,count(*) as people from attendance_refresh f join personnel p on p.id=f.person_id where (${s.sql}) and (f.error is not null or f.generation>f.verified_generation) group by f.work_date order by f.work_date`).all(...s.params);
  return {pendingPeopleDays:Number(pending),missing:missing.map(r=>({...r,people:Number(r.people)})),observationDaysRequired:7};
 }
 for(const e of db.prepare("select id,payload_json from attendance_events where status='pending' and topic='attendance_check_record'").all()){
  const p=decode(e.payload_json,{});
  if(!(p.userId||p.userid||p.staffId||p.userIds?.length)||!p.checkTime){
   db.prepare("update attendance_events set status='schema_missing',error=? where id=?").run('旧版通知未保留人员或打卡时间，无法还原；需要源数据补偿核对',e.id);
   setState('recoveryNeeded',{since:null,reason:'旧版打卡通知缺少关键字段，待当月及上月补偿核对'});
  }
 }
 return {state,setState,ensure,dirty,begin,complete,fresh,inFlight,receive,processEvents,promote,schedule,recover,summary,metrics};
}
