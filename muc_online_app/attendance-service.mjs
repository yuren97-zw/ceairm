import {createApprovalPlanService} from './attendance-approval-plans.mjs';
import {createLeaveService} from './attendance-leave-service.mjs';
import {directoryCacheUsable,directoryScopeKey,eventUserIds,eventOutsideDirectory,DIRECTORY_REFRESH_MIN_MS,DIRECTORY_EXCLUDED_NOTE} from './attendance-event-directory.mjs';
import {APPROVAL_DETAIL_VERSION,minimizeApprovalDetail,enrichApprovalReason,readApprovalReason} from './attendance-approval-reasons.mjs';
import {createHybridCoordinator,sourcePriority} from './attendance-hybrid.mjs';
import {createAttendanceStream} from './attendance-stream.mjs';
import {confirmEmptySchedule} from './attendance-response-validation.mjs';
import fs from 'node:fs';
import {attendanceCategoryAllowed,attendanceMatchesCategories,attendanceOrderedCategories,attendanceFixedCategoryOrder} from './public/attendance-presentation.mjs';
import crypto from 'node:crypto';
import {RULE_VERSION,dayOf,stamp,datesBetween,monthDates,classifyDay} from './attendance-rules.mjs';
import {configuration,configurationStatus,DingTalkClient,DingTalkError,normalizeDay,syncWindows} from './attendance-dingtalk.mjs';
const json=v=>JSON.stringify(v);
const parse=(v,fallback=null)=>{try{return JSON.parse(v);}catch{return fallback;}};
// Compare source meaning, not API list order or duplicate rows from two result endpoints.
const canonicalSource=value=>Array.isArray(value)?[...new Map(value.map(v=>{const normalized=canonicalSource(v===undefined?null:v);return [JSON.stringify(normalized),normalized];})).entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,v])=>v):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonicalSource(value[k])])):value;
const sourceHash=value=>crypto.createHash('sha256').update(JSON.stringify(canonicalSource(value))).digest('hex');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const iso=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
export function installAttendance(db){for(const file of ['022_attendance.sql','023_attendance_leave_catalog.sql','027_attendance_hybrid.sql','028_attendance_leave_balances.sql'])db.exec(fs.readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));}
export function createAttendanceService({db,personnelAccess,hasRbac,audit,isAdmin=()=>false,config=configuration(),client:customClient,clock=()=>Date.now()}){
 installAttendance(db);
 const iso=()=>new Date(clock()).toISOString();
 const owner=uid();let busy=false,timer;
 function countRequest({source='manual',endpoint='unknown',retry=false}={}){
  const month=dayOf(clock()).slice(0,7);
  db.prepare('insert into attendance_api_usage(month,request_count) values(?,0) on conflict(month) do nothing').run(month);
  const r=db.prepare('update attendance_api_usage set request_count=request_count+1 where month=? and request_count<?').run(month,config.monthlyBudget);
  if(!r.changes)throw new DingTalkError('本月钉钉API预算已用完，覆盖尚未完成','BUDGET');
  db.prepare('insert into attendance_api_counts(month,source,endpoint,request_count,retry_count) values(?,?,?,?,?) on conflict(month,source,endpoint) do update set request_count=attendance_api_counts.request_count+1,retry_count=attendance_api_counts.retry_count+excluded.retry_count').run(month,source,endpoint,1,retry?1:0);
 }
 const client=customClient||new DingTalkClient(config,{beforeRequest:async info=>{renew();countRequest(info);}});
 const hybrid=createHybridCoordinator({db,config,clock,enqueue});
 const stream=createAttendanceStream({db,config,coordinator:hybrid,clock,beforeRequest:countRequest});
 const runSource=id=>db.prepare('select source from attendance_run_meta where run_id=?').get(id)?.source||'manual';
 const permission=(user,code)=>{if(!user?.id)throw fail('请先登录',401);if(!hasRbac(user,code))throw fail('当前账号没有权限',403);};
 const scope=user=>personnelAccess.predicate(user,'attendance','p');
 const all=user=>personnelAccess.hasAll(user,'attendance');
 const tx=fn=>{db.exec('begin immediate');try{const result=fn();db.exec('commit');return result;}catch(e){db.exec('rollback');throw e;}};
 function acquire(){const at=iso(),expires=new Date(clock()+180000).toISOString();db.prepare("insert into attendance_leases(id,owner,expires_at) values('worker',?,?) on conflict(id) do update set owner=excluded.owner,expires_at=excluded.expires_at where attendance_leases.expires_at<? or attendance_leases.owner=?").run(owner,expires,at,owner);return db.prepare("select owner from attendance_leases where id='worker'").get()?.owner===owner;}
 function renew(){const r=db.prepare("update attendance_leases set expires_at=? where id='worker' and owner=?").run(new Date(clock()+180000).toISOString(),owner);if(!r.changes)throw fail('同步任务租约已失效',409);}
 function displaySettings(user){
  permission(user,'attendance.read');
  const row=db.prepare('select value,updated_at from settings where key=?').get('attendanceDisplay');
  const value=parse(row?.value,{})||{};
  return {categoryOrder:[...attendanceFixedCategoryOrder],pageSize:[20,50,100].includes(value.pageSize)?value.pageSize:20,updatedAt:row?.updated_at||null,canManage:isAdmin(user)};
 }
 function saveDisplaySettings(user,value){
  permission(user,'attendance.read');if(!isAdmin(user))throw fail('仅管理员可保存全员显示设置',403);
  if(!value||![20,50,100].includes(value.pageSize))throw fail('显示设置无效');
  tx(()=>{
   const row=db.prepare('select value from settings where key=?').get('attendanceDisplay');
   const previous=parse(row?.value,{})||{};
   // Preserve historical stored fields, but never accept new manual category order.
   const next={...previous,pageSize:value.pageSize};
   db.prepare('insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at').run('attendanceDisplay',json(next),iso());
   audit(user,'attendance_display_settings','attendance','display',json({pageSize:value.pageSize}));
  });
  return displaySettings(user);
 }
 function people(user,filters={}){
  const s=scope(user);let where=`(${s.sql}) and coalesce(p.data_status,'active')<>'deleted'`;const params=[...s.params];
  for(const [key,column] of [['department','department'],['team','home_team']])if(filters[key]){where+=` and coalesce(a.${key==='team'?'team':'department'},p.${column},'')=?`;params.push(filters[key]);}
  if(filters.personId){where+=' and p.id=?';params.push(filters.personId);}
  if(filters.query){where+=" and (p.name like ? escape '!' or p.employee_no like ? escape '!')";const q='%'+String(filters.query).replace(/[!%_]/g,'!$&')+'%';params.push(q,q);}
  return db.prepare(`select p.id as personId,p.employee_no as employeeNo,p.name,coalesce(a.department,p.department,'') as department,coalesce(a.team,p.home_team,'') as team,a.user_id as userId,a.identity_issue as identityIssue,a.seen_at as directorySeenAt from personnel p left join attendance_people a on a.person_id=p.id where ${where} order by p.employee_no`).all(...params);
 }
 function enqueue({from,to,user=null,id=uid(),system=false,source='manual',targets=null}){
  if(config.manualOnly&&source!=='manual')throw fail('当前阶段仅允许手动权威补查',409);
  if(['validation_initial','validation_recovery'].includes(source)&&(!system||!config.validation?.enabled))throw fail('验收初始同步仅限受控验收任务',409);
  if(config.validation?.enabled&&(!['event','validation_initial','validation_recovery'].includes(source)||!targets?.length||targets.some(t=>!config.validation.personIds.includes(t.personId)||t.date<config.validation.from||t.date>config.validation.to)))throw fail('隔离验收仅允许指定人员日期的事件或初始任务',409);
  datesBetween(from,to);if(from<config.startDate||to>dayOf(clock()))throw fail(`同步期间须在${config.startDate}至今天之间`);
  if(!system){permission(user,'attendance.record.manage');permission(user,'attendance.read');}
  if(!configurationStatus(config).configured)throw fail('钉钉应用尚未配置，请由管理员配置服务器环境变量',409);
  const selected=system||all(user)?null:people(user).map(p=>p.personId);
  if(selected&&selected.length===0)throw fail('当前考勤数据范围没有可同步人员',403);
  const at=iso();const exists=db.prepare('select id from attendance_runs where id=?').get(id);if(exists)return exists;
  tx(()=>{
   db.prepare('insert into attendance_runs(id,from_date,to_date,status,actor_id,scope_json,created_at,updated_at) values(?,?,?,?,?,?,?,?) on conflict(id) do nothing').run(id,from,to,'directory',user?.id||'scheduler',json(selected),at,at);
   db.prepare('insert into attendance_run_meta(run_id,source,priority,targets_json) values(?,?,?,?) on conflict(run_id) do nothing').run(id,source,sourcePriority[source]??2,targets?json(targets):null);
  });
  if(user)audit(user,'attendance_sync','attendance',id,json({from,to}));
  return {id,status:'directory'};
 }
 const approvalPlans=createApprovalPlanService({db,client,config,clock,hybrid,enqueue,people,permission,audit});
 const leave=createLeaveService({db,client,config,clock,people,permission,audit,hybrid});
 const needsDirectoryFetch=cached=>!directoryCacheUsable(cached,config,hybrid.state('directoryRevision'),clock())||!!hybrid.state('directoryRefreshRequest')&&clock()-Date.parse(cached.at)>=DIRECTORY_REFRESH_MIN_MS;
 async function loadDirectory(run){
  let cached=hybrid.state('directory');
  if(needsDirectoryFetch(cached)){
   const revision=hybrid.state('directoryRevision');
   hybrid.setState('directoryFetchAttemptAt',iso());
   const directory=await client.directory();
   if(!Array.isArray(directory?.users)||!Array.isArray(directory?.departments))throw new DingTalkError('通讯录列表缺失','SCHEMA');
   cached={at:iso(),directory,scopeKey:directoryScopeKey(config),revision:revision??null};
   if(hybrid.state('directoryRevision')===revision){hybrid.setState('directory',cached);hybrid.setState('directoryRefreshRequest',null);}
  }
  const directory=cached.directory, dep=new Map(directory.departments.map(d=>[d.id,d]));
  const master=db.prepare("select p.id,p.employee_no,p.name,p.department,p.home_team from personnel p where coalesce(p.data_status,'active')<>'deleted'").all();
  const byNo=new Map();for(const p of master){if(!byNo.has(p.employee_no))byNo.set(p.employee_no,[]);byNo.get(p.employee_no).push(p);}
  const counts=new Map();for(const u of directory.users)if(u.employeeNo)counts.set(u.employeeNo,(counts.get(u.employeeNo)||0)+1);
  const selected=parse(run.scope_json), users=[];let identityIssues=0;
  tx(()=>{
   for(const u of directory.users){
    const matches=byNo.get(u.employeeNo)||[];let issue='';
    if(!/^\d{8}$/.test(u.employeeNo))issue='钉钉工号为空或不是8位数字';
    else if(counts.get(u.employeeNo)!==1)issue='钉钉工号对应多个用户';
    else if(matches.length!==1)issue='工号未唯一匹配人员主数据';
    const p=issue?null:matches[0];
    const old=db.prepare('select person_id from attendance_people where user_id=?').get(u.userId);
    if(old?.person_id&&p&&old.person_id!==p.id)issue='钉钉用户与既有人员关联变化';
    const other=p&&db.prepare('select user_id from attendance_people where person_id=? and user_id<>?').get(p.id,u.userId);
    if(other)issue='同一人员已关联其他钉钉用户';
    const personId=issue?null:p?.id;if(issue)identityIssues++;
    db.prepare('insert into attendance_people(user_id,person_id,employee_no,name,department,team,department_ids,identity_issue,seen_at) values(?,?,?,?,?,?,?,?,?) on conflict(user_id) do update set person_id=excluded.person_id,employee_no=excluded.employee_no,name=excluded.name,department=excluded.department,team=excluded.team,department_ids=excluded.department_ids,identity_issue=excluded.identity_issue,seen_at=excluded.seen_at').run(u.userId,personId,u.employeeNo,u.name,u.departmentIds.map(id=>dep.get(id)?.name||id).join(' / '),p?.home_team||'',json(u.departmentIds),issue,iso());
    if(personId&&(!selected||selected.includes(personId)))users.push({...u,personId});
   }
   // Keep previously mapped historical members; absence from today's directory is not historical absence.
   const known=new Set(users.map(u=>u.personId));
   for(const a of db.prepare("select * from attendance_people where person_id is not null and coalesce(identity_issue,'')='' ").all())if(master.some(p=>p.id===a.person_id)&&!known.has(a.person_id)&&(!selected||selected.includes(a.person_id)))users.push({userId:a.user_id,personId:a.person_id});
   if(!users.length){db.prepare('update attendance_runs set status=?,error=?,updated_at=? where id=?').run('failed','没有工号唯一匹配的人员，请查看身份问题',iso(),run.id);return;}
   const meta=db.prepare('select * from attendance_run_meta where run_id=?').get(run.id),targets=parse(meta?.targets_json),source=meta?.source||'manual';
   const allowed=targets?new Set(targets.map(t=>t.personId+'|'+t.date)):null;
   let reused=0;
   for(const date of datesBetween(run.from_date,run.to_date)){
    const pending=users.filter(u=>!allowed||allowed.has(u.personId+'|'+date)).filter(u=>{
     const active=db.prepare("select t.id from attendance_tasks t join attendance_runs r on r.id=t.run_id where t.person_id=? and t.work_date=? and t.status='pending' and r.status='running' limit 1").get(u.personId,date);
     if(active){db.prepare('insert into attendance_task_links(run_id,task_id) values(?,?) on conflict(run_id,task_id) do nothing').run(run.id,active.id);reused++;return false;}
     if(['daily','weekly','monthly'].includes(source)&&hybrid.fresh(u.personId,date)){reused++;return false;}
     hybrid.ensure(u.personId,date);return true;
    });
    for(let i=0;i<pending.length;i+=10){
     const batchId=uid(),batch=pending.slice(i,i+10);
     db.prepare('insert into attendance_batches(id,run_id,from_date,to_date,users_json,status,next_at) values(?,?,?,?,?,?,?)').run(batchId,run.id,date,date,json(batch),'pending',iso());
     for(const u of batch)db.prepare('insert into attendance_tasks(id,run_id,batch_id,person_id,user_id,work_date,status,next_at) values(?,?,?,?,?,?,?,?)').run(uid(),run.id,batchId,u.personId,u.userId,date,'pending',iso());
    }
   }
   hybrid.setState('runStats:'+run.id,{reused});
   const validMembers=db.prepare("select a.user_id from attendance_people a join personnel p on p.id=a.person_id where coalesce(a.identity_issue,'')='' and coalesce(p.data_status,'active')<>'deleted'").all();
   for(const event of db.prepare("select id,status,payload_json from attendance_events where (status='unresolved' and error like '事件人员%') or status='directory_excluded'").all()){
    const p=parse(event.payload_json,{}),ids=eventUserIds(p);
    if(validMembers.some(u=>ids.includes(u.user_id))){
     db.prepare("update attendance_events set status='pending',error=null where id=?").run(event.id);
     const approval=p.processInstanceId||p.process_instance_id;if(approval)approvalPlans.queue(approval,'event');
    }else if(eventOutsideDirectory(ids,cached,config,hybrid.state('directoryRevision'),clock()))db.prepare("update attendance_events set status='directory_excluded',error=? where id=?").run(DIRECTORY_EXCLUDED_NOTE,event.id);
    else if(event.status==='directory_excluded')db.prepare("update attendance_events set status='unresolved',error=? where id=?").run('事件人员尚未唯一匹配授权人员；需核对通讯录或事件范围',event.id);
   }
   const missingSelected=selected?.some(id=>!users.some(u=>u.personId===id));db.prepare('update attendance_runs set status=?,updated_at=?,error=? where id=?').run('running',iso(),(!selected&&identityIssues)||missingSelected?'存在工号未匹配人员，人员覆盖未完成':null,run.id);
  });
 }
 async function cachedApproval(id,kind,runId,{force=false}={}){
  const cached=db.prepare('select * from attendance_approval_cache where id=?').get(id),previous=parse(cached?.detail_json);
  const sameRun=db.prepare('select * from attendance_approvals where id=? and run_id=?').get(id,runId);
  if(sameRun&&!cached?.invalidated_at)return {detail:parse(sameRun.detail_json),status:sameRun.status};
  const compatible=kind==='出差'||previous?.schemaVersion===APPROVAL_DETAIL_VERSION&&previous.kind===kind;
  if(compatible&&!cached?.invalidated_at&&(sameRun||!force&&cached?.status==='ok'&&['ok','empty'].includes(readApprovalReason(previous,kind,config).reasonStatus)&&clock()-Date.parse(cached.fetched_at)<86400000))return {detail:previous,status:cached.status};
  const invalidated=cached?.invalidated_at||null;let detail=null,status='ok';
  try{detail=minimizeApprovalDetail(await client.approval(id),kind,config);renew();}
  catch(e){if(e.retryable||e.code==='BUDGET')throw e;status=['60011','60020','Forbidden.AccessDenied','Forbidden','403','processSetupNoPermission'].includes(e.code)?'permission_denied':'detail_missing';detail=compatible?previous:null;}
  db.prepare('insert into attendance_approval_cache(id,detail_json,status,fetched_at,invalidated_at) values(?,?,?,?,?) on conflict(id) do update set detail_json=excluded.detail_json,status=excluded.status,fetched_at=excluded.fetched_at,invalidated_at=excluded.invalidated_at').run(id,json(detail),status,iso(),status==='ok'?null:invalidated);
  db.prepare('insert into attendance_approvals(id,run_id,detail_json,status,fetched_at) values(?,?,?,?,?) on conflict(id) do update set run_id=excluded.run_id,detail_json=excluded.detail_json,status=excluded.status,fetched_at=excluded.fetched_at').run(id,runId,json(detail),status,iso());
  return {detail,status};
 }
 async function detailsFor(day,runId){
  const details=new Map();for(const a of day.approve_list){if(!['出差','外出','请假'].includes(a.tag_name))continue;const id=String(a.procInst_id||a.proc_inst_id||a.procInstId||'');if(!id||details.has(id))continue;details.set(id,await cachedApproval(id,a.tag_name,runId,{force:runSource(runId)!=='event'}));}return details;
 }
 function enqueueApprovalReasons(user,{from=config.startDate,to=dayOf(clock())}={}){
  permission(user,'attendance.read');permission(user,'attendance.record.manage');if(!isAdmin(user))throw fail('仅管理员可补齐审批事由',403);datesBetween(from,to);if(from<config.startDate||to>dayOf(clock()))throw fail('事由补齐期间超出同步范围');
  const active=hybrid.state('reasonBackfillActive');if(active){const job=hybrid.state('reasonBackfill:'+active);if(job&&['pending','running'].includes(job.status))return job;}
  const predicate=scope(user),records=db.prepare(`select d.input_json from attendance_days d join personnel p on p.id=d.person_id where (${predicate.sql}) and d.work_date>=? and d.work_date<=?`).all(...predicate.params,from,to),instances=new Map();
  for(const row of records)for(const a of parse(row.input_json,{}).approvals||[])if(['外出','请假'].includes(a.kind)&&a.id&&a.approved&&!a.revoked)instances.set(a.id,{id:a.id,kind:a.kind});
  const job={id:'approval-reasons-'+uid(),from,to,actorId:user.id,status:instances.size?'pending':'completed',items:[...instances.values()],total:instances.size,index:0,success:0,failed:0,errors:[],createdAt:iso()};hybrid.setState('reasonBackfill:'+job.id,job);hybrid.setState('reasonBackfillActive',job.id);audit(user,'attendance_approval_reasons','attendance',job.id,json({from,to,total:job.total}));return job;
 }
 async function tickApprovalReasons(){
  const id=hybrid.state('reasonBackfillActive'),job=id&&hybrid.state('reasonBackfill:'+id);if(!job||!['pending','running'].includes(job.status)||job.nextAt&&Date.parse(job.nextAt)>clock())return false;
  const item=job.items[job.index];if(!item)return false;job.status='running';client.requestContext='approval_reason_backfill';
  try{const entry=await cachedApproval(item.id,item.kind,id);const read=readApprovalReason(entry.detail,item.kind,config);if(entry.status==='ok'&&['ok','empty'].includes(read.reasonStatus))job.success++;else{job.failed++;job.errors.push({id:item.id,status:entry.status==='ok'?read.reasonStatus:entry.status});}job.index++;job.attempts=0;job.nextAt=null;}
  catch(e){job.attempts=(job.attempts||0)+1;if(e.code==='BUDGET'){job.status='blocked';job.error='接口预算不足，保留未完成范围，待管理员重试';}else if(e.retryable&&job.attempts<4){job.nextAt=new Date(clock()+60000*job.attempts).toISOString();}else{job.failed++;job.errors.push({id:item.id,status:String(e.code||'ERROR')});job.index++;job.attempts=0;job.nextAt=null;}}
  if(job.index>=job.total)job.status=job.failed?'partial':'completed';job.updatedAt=iso();hybrid.setState('reasonBackfill:'+id,job);hybrid.setState('dataVersion',uid());return true;
 }
 function previousWorkDays(personId,date,byKey=null){
  const from=new Date(Date.parse(date+'T00:00:00Z')-3*86400000).toISOString().slice(0,10);
  const rows=byKey?[1,2,3].map(n=>byKey.get(personId+'|'+new Date(Date.parse(date+'T00:00:00Z')-n*86400000).toISOString().slice(0,10))).filter(Boolean):db.prepare('select work_date,input_json from attendance_days where person_id=? and work_date>=? and work_date<?').all(personId,from,date);
  return rows.map(r=>({...parse(r.input_json,{}),date:r.work_date}));
 }
 function saveDay(task,input,full=true){
  const person=db.prepare('select department,team,department_ids from attendance_people where user_id=?').get(task.user_id);
  input={...input,organizationSnapshot:person?{department:person.department,team:person.team,departmentIds:parse(person.department_ids,[])}:null};
  const sourceReadAt=db.prepare('select started_at from attendance_task_marks where task_id=?').get(task.id)?.started_at;
  const result=classifyDay(input,clock(),sourceReadAt,{previousWorkDays:previousWorkDays(task.person_id,task.work_date)});const hash=sourceHash(input),at=iso();
  tx(()=>{
   const old=db.prepare('select * from attendance_days where person_id=? and work_date=?').get(task.person_id,task.work_date);
   if(old&&old.source_hash!==hash&&sourceHash(parse(old.input_json,{}))!==hash)db.prepare('insert into attendance_changes(id,person_id,work_date,before_json,after_json,changed_at,run_id) values(?,?,?,?,?,?,?)').run(uid(),task.person_id,task.work_date,old.input_json,json(input),at,task.run_id);
   db.prepare('insert into attendance_days(person_id,work_date,input_json,result_json,source_hash,updated_at,run_id) values(?,?,?,?,?,?,?) on conflict(person_id,work_date) do update set input_json=excluded.input_json,result_json=excluded.result_json,source_hash=excluded.source_hash,updated_at=excluded.updated_at,run_id=excluded.run_id').run(task.person_id,task.work_date,json(input),json(result),hash,at,task.run_id);
   const complete=!result.purposes.some(p=>p.status!=='ok'&&p.status!=='conflict');
   if(complete&&input.raw?.scheduleReadEvidence?.status==='empty_confirmed')db.prepare('insert into attendance_schedule_cache(person_id,work_date,schedules_json,verified_at) values(?,?,?,?) on conflict(person_id,work_date) do update set schedules_json=excluded.schedules_json,verified_at=excluded.verified_at,invalidated_at=null').run(task.person_id,task.work_date,'[]',sourceReadAt||at);
   if(complete)for(const failed of db.prepare("select id,run_id from attendance_tasks where person_id=? and work_date=? and status in ('failed','incomplete') and updated_at<=? and id<>?").all(task.person_id,task.work_date,sourceReadAt||at,task.id))hybrid.setState('taskRecovery:'+failed.id,{failedTaskId:failed.id,failedRunId:failed.run_id,recoveredByTaskId:task.id,recoveredByRunId:task.run_id,recoveredAt:at});
   hybrid.complete(task,complete,full);
   hybrid.setState('dataVersion',uid());
   db.prepare('update attendance_runs set updated_at=? where id=?').run(at,task.run_id);
   db.prepare('update attendance_tasks set status=?,error=?,attempts=0,updated_at=? where id=?').run(result.purposes.some(p=>p.status!=='ok'&&p.status!=='conflict')?'incomplete':'done',result.purposes.some(p=>p.status!=='ok'&&p.status!=='conflict')?'审批事由资料未完整覆盖':null,at,task.id);
  });
 }
 function retry(table,item,e){
  const attempts=Number(item.attempts||0)+1,code=String(e.code||'ERROR').replace(/[^\w.:-]/g,'').slice(0,80);
  const terminal=attempts>=5||['BUDGET','TIMEZONE','60011','60020','403','SCHEDULE_CONFLICT'].includes(e.code);
  if(table==='attendance_tasks')hybrid.complete(item,false);
  const safe=(v,max=100)=>String(v||'').replace(/[^\w/.:_-]/g,'').slice(0,max);
  const context=[e.endpoint&&`接口 ${safe(e.endpoint)}`,e.field&&`字段 ${safe(e.field)}`,e.responseType&&`类型 ${safe(e.responseType,24)}`].filter(Boolean).join('；');
  const message=e.code==='BUDGET'?'本月API调用预算已用完':`同步失败（${code}${context?'；'+context:''}），${terminal?'请核对后重新同步':'稍后自动重试'}`;
  db.prepare(`update ${table} set status=?,attempts=?,next_at=?,error=?${table==='attendance_tasks'?',updated_at=?':''} where id=?`).run(terminal?'failed':'pending',attempts,new Date(clock()+Math.min(3600000,60000*2**attempts)).toISOString(),message,...(table==='attendance_tasks'?[iso()]:[]),item.id);
 }
 function finishRuns(){
  for(const run of db.prepare("select * from attendance_runs where status='running'").all()){
   const batches=db.prepare('select status,count(*) as n from attendance_batches where run_id=? group by status').all(run.id);
   const tasks=db.prepare('select status,count(*) as n from attendance_tasks where run_id=? group by status').all(run.id);
   const pending=db.prepare("select count(*) as n from attendance_tasks t join attendance_batches b on b.id=t.batch_id where t.run_id=? and t.status='pending' and b.status<>'failed'").get(run.id).n;
   const linked=db.prepare('select t.status from attendance_task_links l join attendance_tasks t on t.id=l.task_id where l.run_id=?').all(run.id);
   if(batches.some(r=>r.status==='pending')||Number(pending)>0||linked.some(t=>t.status==='pending'))continue;
   // A failed batch leaves its day tasks explicitly failed.
   db.prepare("update attendance_tasks set status='failed',error='批量排班或考勤结果未完整读取',updated_at=? where run_id=? and status='pending' and batch_id in (select id from attendance_batches where status='failed')").run(iso(),run.id);
   const incomplete=db.prepare("select count(*) as n from attendance_tasks where run_id=? and status<>'done'").get(run.id).n;
   db.prepare('update attendance_runs set status=?,updated_at=?,error=? where id=?').run(Number(incomplete)>0||run.error||linked.some(t=>t.status!=='done')?'partial':'completed',iso(),Number(incomplete)>0?'存在未完整覆盖人员日，请查看同步明细':run.error||null,run.id);
  }
 }
 function validationRunAllowed(id){
  if(!config.validation?.enabled)return true;
  const m=db.prepare('select source,targets_json from attendance_run_meta where run_id=?').get(id),targets=parse(m?.targets_json);
  return ['event','validation_initial','validation_recovery'].includes(m?.source)&&Array.isArray(targets)&&targets.length>0&&targets.every(t=>config.validation.personIds.includes(t.personId)&&t.date>=config.validation.from&&t.date<=config.validation.to);
 }
 async function tick(){
  if(busy||!configurationStatus(config).configured)return;
  busy=true;let acquired=false;
  try{
   acquired=acquire();if(!acquired)return;
   if(!config.manualOnly)hybrid.schedule();
   if(!config.workerEnabled)return;
   approvalPlans.due();
   const recovery=config.manualOnly?null:hybrid.state('recoveryNeeded');
   if(recovery&&!config.validation?.enabled){hybrid.recover(recovery.since,recovery.reason);hybrid.setState('recoveryNeeded',null);}
   if(recovery&&config.validation?.enabled){
    const stream=hybrid.state('stream'),date=dayOf(clock());
    if(stream?.connected&&stream.connectedAt&&date>=config.validation.from&&date<=config.validation.to){
     const key=crypto.createHash('sha256').update(json([stream.connectedAt,config.validation.personIds,date])).digest('hex').slice(0,24);
     const id='validation-recovery-'+key;
     if(hybrid.state('validationRecovery')?.id!==id){
     enqueue({id,from:date,to:date,source:'validation_recovery',system:true,targets:config.validation.personIds.map(personId=>({personId,date}))});
     hybrid.setState('validationRecovery',{id,date,people:config.validation.personIds.length,connectionAt:stream.connectedAt,reason:'仅补查验收人员当日；全量历史缺口继续保留'});
     }
    }
   }

   // Read independent future approvals without expanding all historical notifications.
   if(await approvalPlans.tick())return;
   // Attendance approval notifications may carry only an instance ID, without a staff ID.
   // Resolve that ID from the authorized workflow API; never infer personnel from a name or title.
   const event=db.prepare("select * from attendance_events where status='pending' and topic in ('attendance_approve_status_change','bpms_instance_change') order by received_at limit 1").get();
   if(event&&!config.validation?.enabled&&!config.manualOnly){
    const p=parse(event.payload_json,{}),id=String(p.processInstanceId||p.process_instance_id||'');
    const known=id&&db.prepare('select input_json from attendance_days').all().some(r=>(parse(r.input_json,{}).approvals||[]).some(a=>a.id===id));
    if(id&&!known&&!p.staffId&&!p.userId&&!p.userid&&!p.userIds){
     client.requestContext='event';
     try{const detail=await client.approval(id);renew();if(!detail.originatorUserId)throw new DingTalkError('审批人员字段缺失','SCHEMA');p.staffId=String(detail.originatorUserId);db.prepare('update attendance_events set payload_json=? where id=?').run(json(p),event.id);}
     catch(e){db.prepare("update attendance_events set status='unresolved',error=? where id=?").run('审批事件人员无法读取，保留周期核对；请核实实例权限或撤销后的可读性',event.id);}
    }
   }
   if(!config.manualOnly){try{client.requestContext='leave_event';await leave.observe();hybrid.setState('leaveEventError',null);}catch(e){hybrid.setState('leaveEventError','假期事件解析未完成，等待重试及周期核对');}hybrid.processEvents();hybrid.promote();leave.schedule();}
   if(config.enabled){client.requestContext='directory';await fetchLeaveCatalog();}
   const directory=hybrid.state('directory');
   const membershipCheck=!!hybrid.state('directoryRefreshRequest')&&(!directory||clock()-Date.parse(directory.at)>=DIRECTORY_REFRESH_MIN_MS);
   if(!config.manualOnly&&!config.validation?.enabled&&(config.enabled||config.eventsEnabled||hybrid.state('directoryRevision'))&&(!directoryCacheUsable(directory,config,hybrid.state('directoryRevision'),clock())||membershipCheck)){
    const scopeHash=crypto.createHash('sha256').update(directoryScopeKey(config)).digest('hex').slice(0,12);
    enqueue({from:dayOf(clock()),to:dayOf(clock()),id:'hybrid-directory-v2-'+dayOf(clock())+'-'+scopeHash+'-'+(hybrid.state('directoryRevision')||'ttl')+'-'+Math.floor(clock()/DIRECTORY_REFRESH_MIN_MS),targets:[],source:'directory',system:true});
   }


   if(!config.manualOnly&&!db.prepare("select r.id from attendance_runs r join attendance_run_meta m on m.run_id=r.id where r.status in ('directory','running') and m.source in ('event','validation_recovery','validation_initial') limit 1").get()&&await tickApprovalReasons())return;
   if((leave.hasDueEvent()||!db.prepare("select r.id from attendance_runs r join attendance_run_meta m on m.run_id=r.id where r.status in ('directory','running') and m.source in ('event','validation_recovery','validation_initial') limit 1").get())&&await leave.tick())return;
   const run=db.prepare("select r.* from attendance_runs r left join attendance_run_meta m on m.run_id=r.id where r.status='directory' and (r.next_at is null or r.next_at<=?) order by coalesce(m.priority,2),r.created_at limit 1").get(iso());
   if(run&&!validationRunAllowed(run.id))return;
   if(run&&needsDirectoryFetch(hybrid.state('directory'))){
    const last=Date.parse(hybrid.state('directoryFetchAttemptAt'));
    if(Number.isFinite(last)&&clock()<last+DIRECTORY_REFRESH_MIN_MS){
     db.prepare('update attendance_runs set next_at=? where id=?').run(new Date(last+DIRECTORY_REFRESH_MIN_MS).toISOString(),run.id);return;
    }
   }
   if(run){client.requestContext=runSource(run.id);try{await loadDirectory(run);finishRuns();}catch(e){const attempts=Number(run.attempts||0)+1;db.prepare('update attendance_runs set status=?,error=?,updated_at=?,attempts=?,next_at=? where id=?').run(e.retryable&&attempts<5?'directory':'failed',`通讯录读取或工号匹配失败${e.permissionCodes?.length?'；缺少读取权限：'+e.permissionCodes.join('、'):e.code?'（'+String(e.code).replace(/[^\w.:-]/g,'')+'）':''}；请检查配置、权限和额度`,iso(),attempts,new Date(clock()+60000*attempts).toISOString(),run.id);}return;}
   // Finish a day before loading more history batches; new events preempt on the next tick.
   const task=db.prepare("select t.*,b.payload_json from attendance_tasks t join attendance_batches b on b.id=t.batch_id join attendance_runs r on r.id=t.run_id left join attendance_run_meta m on m.run_id=r.id where t.status='pending' and t.next_at<=? and b.status='done' and r.status='running' order by coalesce(m.priority,2),r.created_at,t.work_date limit 1").get(iso());
   const batch=db.prepare("select b.* from attendance_batches b join attendance_runs r on r.id=b.run_id left join attendance_run_meta m on m.run_id=r.id where b.status='pending' and b.next_at<=? and r.status='running' order by coalesce(m.priority,2),r.created_at,b.from_date limit 1").get(iso());
   if((task&&!validationRunAllowed(task.run_id))||(batch&&!validationRunAllowed(batch.run_id)))return;
   const priority=id=>sourcePriority[runSource(id)]??2;
   if(batch&&(!task||priority(batch.run_id)<priority(task.run_id))){
    client.requestContext=runSource(batch.run_id);
    try{
     const users=parse(batch.users_json),ids=users.map(u=>u.userId);
     // Capture generation before ANY source read, so changes during I/O remain dirty.
     for(const t of db.prepare("select * from attendance_tasks where batch_id=? and status='pending'").all(batch.id))hybrid.begin(t);
     const startedAt=iso(),cached=users.map(u=>db.prepare('select * from attendance_schedule_cache where person_id=? and work_date=?').get(u.personId,batch.from_date));
     const detailOnly=runSource(batch.run_id)==='event'&&cached.every(r=>r&&!r.invalidated_at&&clock()-Date.parse(r.verified_at)<86400000);
     // getupdatedata provides the authoritative day's attendance result list; never merge stale result-list rows.
     const results=detailOnly?[]:await client.results(ids,batch.from_date,batch.to_date);
     const schedules=detailOnly?cached.flatMap(r=>parse(r.schedules_json,[])):await client.schedules(ids,batch.from_date,batch.to_date);
     const scheduleEvidence=schedules.scheduleEvidence||null;
     renew();
     if(!detailOnly&&!scheduleEvidence)for(const u of users){
      const rows=schedules.filter(r=>String(r.userid??r.userId)===u.userId&&dayOf(stamp(r.work_date??r.workDate))===batch.from_date).map(r=>Object.fromEntries(['userid','userId','work_date','workDate','check_type','is_rest','plan_check_time','id','shift_id','shift_version','time_zone_id'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])));
      db.prepare('insert into attendance_schedule_cache(person_id,work_date,schedules_json,verified_at) values(?,?,?,?) on conflict(person_id,work_date) do update set schedules_json=excluded.schedules_json,verified_at=excluded.verified_at,invalidated_at=null').run(u.personId,batch.from_date,json(rows),startedAt);
     }
     db.prepare('update attendance_batches set payload_json=?,status=?,error=null where id=?').run(json({results,schedules,detailOnly,...(scheduleEvidence?{scheduleEvidence}:{})}),'done',batch.id);
    }catch(e){retry('attendance_batches',batch,e);}finishRuns();return;
   }
   if(task){
    client.requestContext=runSource(task.run_id);
    // Legacy batches were loaded before the hybrid strategy: re-read before trusting freshness.
    if(!db.prepare('select task_id from attendance_task_marks where task_id=?').get(task.id)){db.prepare("update attendance_batches set status='pending' where id=?").run(task.batch_id);return;}
    try{const data=parse(task.payload_json),day=await client.day(task.user_id,task.work_date),evidence=confirmEmptySchedule(data.scheduleEvidence,day,data.results,task.user_id,task.work_date),details=await detailsFor(day,task.run_id);renew();const input=normalizeDay({date:task.work_date,userId:task.user_id,day,...data,details,config});if(evidence)input.raw.scheduleReadEvidence=evidence;saveDay(task,input,!data.detailOnly);}
    catch(e){retry('attendance_tasks',task,e);}
   }
   finishRuns();
  }finally{if(acquired)db.prepare("delete from attendance_leases where id='worker' and owner=?").run(owner);busy=false;}
 }
 function leaveCatalog(user){
  const row=db.prepare("select * from attendance_leave_catalog where id='enterprise'").get();
  const types=parse(row?.types_json,[])||[],known=new Set(types.map(v=>v.name).filter(attendanceCategoryAllowed)),s=scope(user);
  // Include historical approval names even when unused in the selected month.
  for(const r of db.prepare(`select d.input_json from attendance_days d join personnel p on p.id=d.person_id where (${s.sql})`).all(...s.params)){
   for(const a of parse(r.input_json,{}).approvals||[])if(a.kind==='请假'&&a.subType&&attendanceCategoryAllowed(a.subType))known.add(String(a.subType));
  }
  return {names:[...known],status:row?.last_synced_at?(row.error?'stale':'ready'):row?.error?'unavailable':'not_loaded',lastSyncedAt:row?.last_synced_at||null,lastAttemptAt:row?.last_attempt_at||null,error:row?.error||null};
 }
 async function fetchLeaveCatalog({force=false}={}){
  const old=db.prepare("select * from attendance_leave_catalog where id='enterprise'").get(),at=new Date(clock()).toISOString();
  if(!force&&old?.last_attempt_at&&clock()-Date.parse(old.last_attempt_at)<86400000)return;
  db.prepare("insert into attendance_leave_catalog(id,last_attempt_at) values('enterprise',?) on conflict(id) do update set last_attempt_at=excluded.last_attempt_at").run(at);
  try{
   const types=await client.leaveTypes();
   if(!Array.isArray(types)||types.some(t=>typeof t.name!=='string'||!t.name.trim()))throw new DingTalkError('假期类型目录响应不完整','SCHEMA');
   db.prepare("update attendance_leave_catalog set types_json=?,last_synced_at=?,error=null where id='enterprise'").run(json(types.filter(t=>attendanceCategoryAllowed(t.name))),at);
  }catch(e){
   const denied=e.code==='60011'||e.permissionCodes?.includes('qyapi_holiday_readonly');
   const message=denied?'缺少钉钉假期查询权限（qyapi_holiday_readonly），完整假期目录未更新':e.code==='BUDGET'?'钉钉API额度不足，完整假期目录未更新':'假期目录读取失败，保留上次成功目录；请检查网络、权限及接口响应';
   db.prepare("update attendance_leave_catalog set error=? where id='enterprise'").run(message);
  }
 }
 async function refreshLeaveTypes(user){
  permission(user,'attendance.record.manage');permission(user,'attendance.read');
  if(!configurationStatus(config).configured)throw fail('钉钉应用尚未配置',409);
  if(busy)throw fail('同步任务正在执行，请稍后刷新假期目录',409);
  busy=true;let acquired=false;
  try{acquired=acquire();if(!acquired)throw fail('其他实例正在同步，请稍后刷新假期目录',409);await fetchLeaveCatalog({force:true});return leaveCatalog(user);}
  finally{if(acquired)db.prepare("delete from attendance_leases where id='worker' and owner=?").run(owner);busy=false;}
 }
 function snapshot(user,filters={},permissionCode='attendance.read',{detailLevel='full',onTiming=()=>{}}={}){
  permission(user,permissionCode);permission(user,'attendance.read');
  if(!['full','summary','compact'].includes(detailLevel))throw fail('考勤明细级别无效');
  if(detailLevel==='summary')permission(user,'attendance.stats.read');
  const started=performance.now(),at=clock();
  const dates=monthDates(filters.month||dayOf(at).slice(0,7)), members=people(user,filters),ids=new Set(members.map(p=>p.personId));
  const contextFrom=new Date(Date.parse(dates[0]+'T00:00:00Z')-3*86400000).toISOString().slice(0,10);
  const contextTo=new Date(Date.parse(dates.at(-1)+'T00:00:00Z')+3*86400000).toISOString().slice(0,10);
  // Previous-workday context remains required by cross-midnight attribution, even for summaries.
  const contextDates=detailLevel==='full'?datesBetween(contextFrom,contextTo).filter(date=>date<dates[0]||date>dates.at(-1)):[];
  const s=scope(user);
  const personSql=filters.personId?' and d.person_id=?':'',personParams=filters.personId?[filters.personId]:[];
  const rows=db.prepare(`select d.person_id,d.work_date,d.input_json,d.updated_at,d.run_id,(select min(m.started_at) from attendance_tasks t join attendance_task_marks m on m.task_id=t.id where t.person_id=d.person_id and t.work_date=d.work_date and t.run_id=d.run_id) as source_queried_at from attendance_days d join personnel p on p.id=d.person_id where (${s.sql}) and d.work_date>=? and d.work_date<=?${personSql}`).all(...s.params,contextFrom,contextTo,...personParams);
  const reasonCache=new Map(db.prepare('select * from attendance_approval_cache').all().map(r=>[r.id,{detail:parse(r.detail_json),status:r.status,invalidated:!!r.invalidated_at}]));
  const overlay=input=>({...input,approvals:(input.approvals||[]).map(a=>enrichApprovalReason(a,reasonCache.get(a.id),config))});
  const byKey=new Map(rows.filter(r=>ids.has(r.person_id)).map(r=>[r.person_id+'|'+r.work_date,r]));
  const taskErrors=db.prepare(`select t.person_id,t.work_date,t.error,t.updated_at from attendance_tasks t join personnel p on p.id=t.person_id where (${s.sql}) and t.work_date>=? and t.work_date<=? and t.status in ('failed','incomplete') order by t.updated_at`).all(...s.params,contextFrom,contextTo);
  const errors=new Map(taskErrors.map(r=>[r.person_id+'|'+r.work_date,r]));
  const readAt=performance.now();onTiming('attendance_read',readAt-started);
  const peopleRows=members.map(p=>{
   const makeDay=date=>{const row=byKey.get(p.personId+'|'+date),input=row?overlay(parse(row.input_json)):{date,covered:false,identityIssue:p.identityIssue};const result=classifyDay(input,at,row?.source_queried_at||row?.updated_at,{previousWorkDays:previousWorkDays(p.personId,date,byKey).map(overlay),includePunchDetails:detailLevel!=='summary'});const taskError=errors.get(p.personId+'|'+date);const syncError=taskError && (!row || taskError.updated_at>=row.updated_at)?taskError.error:null;return {...result,input,sourceQueriedAt:row?.source_queried_at||null,updatedAt:row?.updated_at||null,runId:row?.run_id||null,syncError,stale:result.category==='待核实'||!!syncError&&!!row};};
   const days=dates.map(makeDay),contextDays=contextDates.map(makeDay);
   const counts={};for(const d of days)counts[d.category]=(counts[d.category]||0)+1;
   const computed=days.filter(d=>d.overtime.seconds!==null);
   return {...p,days,contextDays,counts,overtimeSeconds:computed.length?computed.reduce((n,d)=>n+d.overtime.seconds,0):null,computedDays:computed.length,uncomputableDays:days.filter(d=>d.overtime.status==='无法计算'&&!['未来日期','未同步'].includes(d.category)).length};
  });
  if(config.approvalPlansEnabled&&permissionCode!=='attendance.export')for(let i=0;i<peopleRows.length;i++)peopleRows[i]=approvalPlans.decorate(peopleRows[i],dates[0].slice(0,7));
  const classifiedAt=performance.now();onTiming('attendance_classify',classifiedAt-readAt);
  const leaveTypes=leaveCatalog(user);
  const settings=displaySettings(user);
  const categories=attendanceOrderedCategories([...new Set([...peopleRows.flatMap(p=>[...Object.keys(p.counts),...Object.keys(p.pendingCounts||{})]),...leaveTypes.names])]);
  const visiblePeople=peopleRows.filter(p=>attendanceMatchesCategories(p,filters.categories));
  const visibleIds=new Set(visiblePeople.map(p=>p.personId));
  const last=rows.filter(r=>visibleIds.has(r.person_id)&&r.work_date>=dates[0]&&r.work_date<=dates.at(-1)).map(r=>r.updated_at).sort().at(-1)||null;
  const reasonInstances=new Map(visiblePeople.flatMap(p=>p.days.flatMap(d=>(d.input.approvals||[]).filter(a=>['外出','请假'].includes(a.kind)&&a.approved&&!a.revoked).map(a=>[a.id,a]))));
  const approvalReasonCoverage={total:reasonInstances.size,unresolved:[...reasonInstances.values()].filter(a=>!['ok','empty'].includes(a.reasonStatus)).length};
  const projected=visiblePeople.map(p=>{
   if(detailLevel==='full')return p;
   const {days,contextDays,approvalPlans,...totals}=p;
   if(detailLevel==='summary')return {...totals,dayCount:days.length,issueCount:days.filter(d=>!['未同步','未来日期','尚未到下班时间'].includes(d.category)&&(d.category==='待核对'||d.category==='缺卡'||d.issues.length||d.syncError)).length};
   return {...totals,contextDays:[],days:days.map(({input,approvalPlans,...d})=>({...d,purposes:d.purposes.map(({category,status})=>({category,status})),punchDetails:d.punchDetails.map(({type,planned,actual,status,reason})=>({type,planned,actual,status,reason}))}))};
  });
  onTiming('attendance_metadata',performance.now()-classifiedAt);
  return {...(detailLevel==='full'?{}:{detailLevel}),approvalPlanStatus:all(user)&&hasRbac(user,'attendance.record.manage')?approvalPlans.status():config.approvalPlansEnabled?{enabled:true}:null,approvalReasonCoverage,month:dates[0].slice(0,7),dates,people:projected,categories,leaveTypes,displaySettings:settings,generatedAt:iso(),lastSyncedAt:last,ruleVersion:RULE_VERSION,historyWarning:'当前通讯录不能证明历史全员完整；历史缺失保持可见，不推断缺勤。',overtimeNote:'按末次计划下班点与对应有效实际打卡的差额累计，不代表审批认可时长。',capabilityStatusEnabled:false};
 }
 function status(user){
  permission(user,'attendance.read');const s=scope(user);
  const today=dayOf(clock()),yesterday=dayOf(clock()-86400000);
  const clockBoundary=db.prepare(`select d.input_json from attendance_days d join personnel p on p.id=d.person_id where (${s.sql}) and d.work_date>=? and d.work_date<=?`).all(...s.params,yesterday,today).reduce((n,r)=>Math.max(n,...(parse(r.input_json,{}).points||[]).map(p=>p.planned).filter(t=>t&&t<=clock())),0);
  const counts=db.prepare(`select t.run_id,t.status,count(*) as n from attendance_tasks t join personnel p on p.id=t.person_id where (${s.sql}) and t.run_id in (select id from attendance_runs order by created_at desc limit 40) group by t.run_id,t.status`).all(...s.params);
  const visible=new Set(counts.map(r=>r.run_id));
  const recovered=db.prepare(`select t.id,t.run_id from attendance_tasks t join personnel p on p.id=t.person_id where (${s.sql}) and t.run_id in (select id from attendance_runs order by created_at desc limit 40) and t.status in ('failed','incomplete')`).all(...s.params).filter(t=>hybrid.state('taskRecovery:'+t.id));
  const runs=db.prepare('select * from attendance_runs order by created_at desc limit 40').all().filter(r=>all(user)||visible.has(r.id)||r.actor_id===user.id).map(r=>{const recoveredCount=recovered.filter(t=>t.run_id===r.id).length;return {id:r.id,from:r.from_date,to:r.to_date,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at,error:r.error?`${r.error}${recoveredCount?`；历史失败中${recoveredCount}条已由后续权威补查恢复`:''}`:null,recoveredCount,source:runSource(r.id),reused:hybrid.state('runStats:'+r.id)?.reused||0,counts:Object.fromEntries(counts.filter(c=>c.run_id===r.id).map(c=>[c.status,Number(c.n)]))};});
  const reasonJobId=hybrid.state('reasonBackfillActive'),reasonJob=reasonJobId&&hybrid.state('reasonBackfill:'+reasonJobId);
  return {approvalPlanVersion:hybrid.state('approvalPlanVersion')||'',approvalPlans:all(user)&&hasRbac(user,'attendance.record.manage')?approvalPlans.status():null,approvalReasonBackfill:all(user)&&reasonJob?{id:reasonJob.id,status:reasonJob.status,total:reasonJob.total,processed:reasonJob.index,success:reasonJob.success,failed:reasonJob.failed,error:reasonJob.error||null,updatedAt:reasonJob.updatedAt}:null,clockBoundary,leaveVersion:hybrid.state('leaveVersion')||'',leaveEventError:hybrid.state('leaveEventError'),dataVersion:RULE_VERSION+':'+(hybrid.state('dataVersion')||''),hybrid:{validation:config.validation?.enabled?{enabled:true,people:config.validation.personIds.length,from:config.validation.from,to:config.validation.to}:null,...hybrid.summary(s),stream:stream.connectionStatus(),workerEnabled:!!config.workerEnabled,schedulerEnabled:!!config.enabled,recovery:all(user)?hybrid.state('recovery'):null,recoveryPending:!!hybrid.state('recoveryNeeded'),events:all(user)?db.prepare('select topic,status,count(*) as count from attendance_events group by topic,status').all():[],eventIssues:all(user)?db.prepare("select topic,status,error,received_at as receivedAt from attendance_events where status<>'directory_excluded' and (error is not null or status in ('unsupported','unresolved')) order by received_at desc limit 20").all():[],directoryExcluded:all(user)?db.prepare("select topic,count(*) as count from attendance_events where status='directory_excluded' group by topic").all():[],eventMetrics:all(user)?hybrid.metrics():[],verifiedEventTypes:[],eventCoverageNote:'连接成功不等于所有事件已覆盖；须完成真实样本及连续7天验证',apiCounts:all(user)?db.prepare('select source,endpoint,request_count as requests,retry_count as retries from attendance_api_counts where month=?').all(dayOf(clock()).slice(0,7)):[],requestWarning:all(user)&&Number(db.prepare('select request_count from attendance_api_usage where month=?').get(dayOf(clock()).slice(0,7))?.request_count)>=40000},configuration:configurationStatus(config),leaveTypes:leaveCatalog(user),runs,canSync:hasRbac(user,'attendance.record.manage'),canStats:hasRbac(user,'attendance.stats.read'),canExport:hasRbac(user,'attendance.export'),usage:all(user)?db.prepare('select * from attendance_api_usage where month=?').get(dayOf(clock()).slice(0,7))||null:null,identityIssues:all(user)?db.prepare("select employee_no as employeeNo,name,identity_issue as issue from attendance_people where coalesce(identity_issue,'')<>''").all():[],historyWarning:'历史组织名单完整性待核实；API无法取得的历史记录不填零。'};
 }
 function changes(user,filters){permission(user,'attendance.read');const members=people(user,filters),ids=new Set(members.map(p=>p.personId)),s=scope(user);const dates=monthDates(filters.month);return db.prepare(`select c.* from attendance_changes c join personnel p on p.id=c.person_id where (${s.sql}) and c.work_date>=? and c.work_date<=? order by c.changed_at`).all(...s.params,dates[0],dates.at(-1)).filter(r=>ids.has(r.person_id));}
 async function tickLeaves(){if(busy||!config.workerEnabled||!configurationStatus(config).configured)return false;busy=true;let acquired=false;try{acquired=acquire();if(!acquired)return false;return await leave.tick();}finally{if(acquired)db.prepare("delete from attendance_leases where id='worker' and owner=?").run(owner);busy=false;}}
 return {approvalPlans,approvalPlanRefresh(user,body){return approvalPlans.request({...user,attendancePlanAll:all(user)},body);},approvalPlanDetails(user,filters={}){permission(user,'attendance.read');const data=snapshot(user,filters);return {month:data.month,people:data.people.map(p=>({personId:p.personId,name:p.name,employeeNo:p.employeeNo,approvalPlans:p.approvalPlans||[]}))};},tickLeaves,leave,config,enqueue,enqueueApprovalReasons,tick,hybrid,snapshot,status,changes,refreshLeaveTypes,displaySettings,saveDisplaySettings,start(){if(config.eventsEnabled&&configurationStatus(config).configured)stream.start();if(!timer){timer=setInterval(()=>tick().catch(()=>{}),1000);timer.unref();tick().catch(()=>{});}},stop(){stream.stop();clearInterval(timer);timer=null;},capabilityStatuses(user,personId){permission(user,'attendance.read');personnelAccess.requirePerson(user,'attendance',personId);return {enabled:false,personId,records:[],supportedKinds:['DEPLOYED','TRAINING','OTHER'],fields:['personId','kind','startDate','endDate','recordId','version']};}};
}
