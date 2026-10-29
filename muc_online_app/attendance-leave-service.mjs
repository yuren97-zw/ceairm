import fs from 'node:fs';import {leaveGroups,leaveGroup,leaveNote,normalizeLeaveData,leaveCell} from './public/attendance-leave-model.mjs';
const parse=(s,f=null)=>{try{return JSON.parse(s);}catch{return f;}};
const failure=(m,status=400)=>Object.assign(Error(m),{status});
export function createLeaveService({db,client,config,clock,people,permission,audit,hybrid}){
 db.exec(fs.readFileSync(new URL('./migrations/028_attendance_leave_balances.sql',import.meta.url),'utf8'));
 const now=()=>new Date(clock()).toISOString();
 if(!hybrid.state('leaveEventsSince'))hybrid.setState('leaveEventsSince',now());
 const supportedTypes=()=>parse(db.prepare("select types_json from attendance_leave_catalog where id='enterprise'").get()?.types_json,[]).filter(t=>leaveGroup(t.name));
 function enqueueMembers(members,source='leave_manual',{delay=0,reuse=false}={}){
  for(const p of members){if(!p.userId||p.identityIssue)continue;const old=db.prepare('select * from attendance_leave_queue where person_id=?').get(p.personId);
   if(reuse&&old?.status==='ready'&&clock()-Date.parse(old.updated_at)<86400000)continue;
   const first=old&&old.generation>old.verified_generation?old.first_dirty_at:now();const due=new Date(Math.min(clock()+delay,Date.parse(first)+180000)).toISOString();
   db.prepare("insert into attendance_leave_queue(person_id,generation,verified_generation,first_dirty_at,due_at,source,status,updated_at) values(?,1,0,?,?,?,'pending',?) on conflict(person_id) do update set generation=attendance_leave_queue.generation+1,first_dirty_at=excluded.first_dirty_at,due_at=excluded.due_at,source=excluded.source,status='pending',error=null,attempts=0,updated_at=excluded.updated_at").run(p.personId,first,due,source,now());
  }
 }
 function refresh(user,filters={}){if(filters.scope!==undefined&&!['all','filtered'].includes(filters.scope))throw failure('刷新范围无效');permission(user,'attendance.read');permission(user,'attendance.record.manage');if(!client.config?.appKey&&!config.appKey)throw failure('钉钉应用未配置',409);const selected=people(user,filters.scope==='all'?{}:filters);enqueueMembers(selected);audit(user,'attendance_leave_refresh','attendance','leave',JSON.stringify({people:selected.length}));return {status:'queued',people:selected.filter(p=>p.userId&&!p.identityIssue).length};}
 function snapshot(user,filters={},perm='attendance.stats.read'){
  permission(user,'attendance.read');permission(user,perm);const current=Number(new Date(clock()+8*3600000).getUTCFullYear()),year=Number(filters.year||current);if(!Number.isInteger(year)||year<1900||year>current+10)throw failure('年度无效');
  const members=people(user,filters),years=new Set([current]),types=supportedTypes(),availableNames=new Set(types.map(t=>t.name));
  const rows=members.map(p=>{const saved=db.prepare('select * from attendance_leave_snapshots where person_id=?').all(p.personId);const sources=saved.filter(s=>types.some(t=>t.code===s.leave_code)).map(s=>({name:s.type_name,code:s.leave_code,quotas:parse(s.quotas_json,[]),records:parse(s.records_json,[]),syncedAt:s.synced_at}));sources.forEach(s=>s.quotas.forEach(q=>years.add(q.year)));const queue=db.prepare('select * from attendance_leave_queue where person_id=?').get(p.personId);const cells=leaveGroups.map(g=>{const cell=leaveCell(sources,year,g,clock());const needed=types.filter(t=>leaveGroup(t.name)===g);cell.coverage=needed.length?needed.every(t=>saved.some(s=>s.leave_code===t.code))?'complete':'partial':'catalog_missing';return cell;});
   return {...p,userId:undefined,identityIssue:p.identityIssue||(!p.userId?'人员尚未匹配钉钉用户':null),cells,syncedAt:sources.map(s=>s.syncedAt).sort()[0]||null,syncStatus:queue?.status||'not_synced',error:queue?.error||null};});
  return {year,years:[...years].sort((a,b)=>b-a),groups:leaveGroups,note:leaveNote,people:rows,generatedAt:now(),dataVersion:hybrid.state('leaveVersion')||'',eventError:hybrid.state('leaveEventError')||null,catalogMissing:leaveGroups.filter(g=>!types.some(t=>leaveGroup(t.name)===g)),catalogNames:[...availableNames],pageSize:20,historyWarning:'仅展示钉钉接口实际返回的额度年度；查询不到不代表历史余额为0。缺少额度关联的消费记录不强行归属年度。'};
 }
 function details(user,filters){permission(user,'attendance.read');if(!filters.personId||!leaveGroups.includes(filters.group))throw failure('人员或假期类别无效');const data=snapshot(user,filters,'attendance.read');const p=data.people.find(p=>p.personId===filters.personId);if(!p)throw failure('当前账号无权查看该人员',403);return {year:data.year,person:p,cell:p.cells.find(c=>c.group===filters.group),note:leaveNote};}
 async function observe(){
  if(!config.eventsEnabled)return;
  const events=db.prepare("select e.* from attendance_events e where e.received_at>=? and e.topic in ('attendance_approve_status_change','bpms_instance_change') and not exists(select 1 from attendance_leave_event_marks m where m.event_id=e.id) order by e.received_at limit 25").all(hybrid.state('leaveEventsSince'));
  for(const e of events){const retry=hybrid.state('leaveEventRetry:'+e.id);if(retry?.nextAt&&Date.parse(retry.nextAt)>clock())continue;try{let p=parse(e.payload_json,{});const instance=String(p.processInstanceId||p.process_instance_id||'');let ids=p.userIds??p.userId??p.userid??p.staffId??[];ids=Array.isArray(ids)?ids:String(ids).split(',');let members=db.prepare("select person_id as personId,user_id as userId from attendance_people where person_id is not null and coalesce(identity_issue,'')='' ").all();
   const known=instance?db.prepare('select person_id,input_json from attendance_days').all().filter(d=>(parse(d.input_json,{}).approvals||[]).some(a=>a.id===instance)).map(d=>d.person_id):[];
   if(!ids.filter(Boolean).length&&!known.length&&instance&&!config.validation?.enabled){const a=await client.approval(instance);if(a.originatorUserId)ids=[String(a.originatorUserId)];else throw failure('请假事件人员尚未解析',502);}
   members=members.filter(m=>ids.includes(m.userId)||known.includes(m.personId));if(config.validation?.enabled)members=members.filter(m=>config.validation.personIds.includes(m.personId));
   if(!members.length&&!config.validation?.enabled)throw failure('事件人员未匹配，等待通讯录或周期核对',502);
   db.exec('begin immediate');try{enqueueMembers(members,'leave_event',{delay:60000});db.prepare('insert into attendance_leave_event_marks(event_id,marked_at) values(?,?) on conflict(event_id) do nothing').run(e.id,now());db.exec('commit');}catch(e){db.exec('rollback');throw e;}hybrid.setState('leaveEventRetry:'+e.id,null);
   }catch(error){const attempts=(retry?.attempts||0)+1;hybrid.setState('leaveEventRetry:'+e.id,{attempts,nextAt:new Date(clock()+Math.min(3600000,60000*2**Math.min(attempts,6))).toISOString(),error:'人员或权限尚未核实，等待重试及周期核对'});throw error;}
  }
 }
 function schedule(){
  if(!config.enabled||config.validation?.enabled)return;
  // Existing durable run identifiers also cover startup catch-up; no new daily schedule.
  for(const r of db.prepare("select r.id from attendance_runs r join attendance_run_meta m on m.run_id=r.id where m.source in ('weekly','monthly') and r.created_at>=? order by r.created_at").all(hybrid.state('leaveEventsSince'))){
   const key='leavePeriod:'+r.id;if(hybrid.state(key))continue;enqueueMembers(db.prepare("select a.person_id as personId,a.user_id as userId from attendance_people a join personnel p on p.id=a.person_id where coalesce(a.identity_issue,'')='' and coalesce(p.data_status,'active')<>'deleted'").all(),'leave_periodic',{reuse:true});hybrid.setState(key,now());
  }
 }
 async function tick(){
  const tasks=db.prepare("select q.*,a.user_id from attendance_leave_queue q join attendance_people a on a.person_id=q.person_id join personnel p on p.id=q.person_id where q.status in ('pending','retry') and q.due_at<=? and coalesce(a.identity_issue,'')='' and coalesce(p.data_status,'active')<>'deleted' order by case when q.source='leave_event' then 0 else 1 end,q.due_at limit 50").all(now());if(!tasks.length)return false;
  const types=supportedTypes();client.requestContext=tasks.some(t=>t.source==='leave_event')?'leave_event':tasks[0].source;
  let error=null;
  try{
   if(!types.length||types.some(t=>!t.code)){const fresh=await client.leaveTypes();db.prepare("insert into attendance_leave_catalog(id,types_json,last_synced_at,last_attempt_at) values('enterprise',?,?,?) on conflict(id) do update set types_json=excluded.types_json,last_synced_at=excluded.last_synced_at,last_attempt_at=excluded.last_attempt_at,error=null").run(JSON.stringify(fresh),now(),now());}
   const catalog=supportedTypes();if(!catalog.length||catalog.some(t=>!t.code))throw failure('假期目录缺少唯一标识',502);
   for(const t of catalog){const quotas=await client.leaveQuotas(tasks.map(t=>t.user_id),t.code),records=await client.leaveRecords(tasks.map(t=>t.user_id),t.code);const users=new Set(tasks.map(t=>t.user_id));if(quotas.some(q=>!users.has(String(q.userid))||q.leave_code!==t.code)||records.some(r=>!users.has(String(r.userId))||r.leaveCode!==t.code))throw failure('假期响应超出查询范围',502);
    const normalized=tasks.map(task=>({task,data:normalizeLeaveData(quotas.filter(q=>String(q.userid)===task.user_id),records.filter(r=>String(r.userId)===task.user_id),t.code,task.user_id)}));
    db.exec('begin immediate');try{for(const {task,data} of normalized)db.prepare('insert into attendance_leave_snapshots(person_id,leave_code,type_name,quotas_json,records_json,synced_at) values(?,?,?,?,?,?) on conflict(person_id,leave_code) do update set type_name=excluded.type_name,quotas_json=excluded.quotas_json,records_json=excluded.records_json,synced_at=excluded.synced_at').run(task.person_id,t.code,t.name,JSON.stringify(data.quotas),JSON.stringify(data.records),now());db.exec('commit');}catch(e){db.exec('rollback');throw e;}
   }
  }catch(e){error=e;}
  for(const t of tasks){if(error){const attempts=t.attempts+1,code=String(error.code||'SCHEMA').replace(/[^\w.:-]/g,'').slice(0,80);db.prepare("update attendance_leave_queue set status=?,error=?,attempts=?,due_at=?,updated_at=? where person_id=? and generation=?").run(error.code==='BUDGET'?'blocked':error.retryable&&attempts<5?'retry':'failed','假期同步未完整（'+code+'）；保留上次成功数据',attempts,new Date(clock()+Math.min(3600000,60000*2**attempts)).toISOString(),now(),t.person_id,t.generation);}else db.prepare("update attendance_leave_queue set verified_generation=?,status='ready',error=null,attempts=0,updated_at=? where person_id=? and generation=?").run(t.generation,now(),t.person_id,t.generation);}
  hybrid.setState('leaveVersion',now());return true;
 }
 const hasDueEvent=()=>!!db.prepare("select person_id from attendance_leave_queue where source='leave_event' and status in ('pending','retry') and due_at<=? limit 1").get(now());
 return {refresh,snapshot,details,observe,schedule,tick,enqueueMembers,hasDueEvent};
}
