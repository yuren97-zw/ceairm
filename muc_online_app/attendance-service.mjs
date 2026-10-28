import fs from 'node:fs';
import {attendanceMatchesCategories,attendanceOrderedCategories,attendanceFixedCategoryOrder} from './public/attendance-presentation.mjs';
import crypto from 'node:crypto';
import {RULE_VERSION,dayOf,datesBetween,monthDates,classifyDay} from './attendance-rules.mjs';
import {configuration,configurationStatus,DingTalkClient,DingTalkError,normalizeDay,syncWindows} from './attendance-dingtalk.mjs';
const json=v=>JSON.stringify(v);
const parse=(v,fallback=null)=>{try{return JSON.parse(v);}catch{return fallback;}};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const iso=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
export function installAttendance(db){for(const file of ['022_attendance.sql','023_attendance_leave_catalog.sql'])db.exec(fs.readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));}
export function createAttendanceService({db,personnelAccess,hasRbac,audit,isAdmin=()=>false,config=configuration(),client:customClient,clock=()=>Date.now()}){
 installAttendance(db);
 const owner=uid();let busy=false,timer;
 const client=customClient||new DingTalkClient(config,{beforeRequest:async()=>{
  renew();const month=dayOf(clock()).slice(0,7);
  db.prepare('insert into attendance_api_usage(month,request_count) values(?,0) on conflict(month) do nothing').run(month);
  const r=db.prepare('update attendance_api_usage set request_count=request_count+1 where month=? and request_count<?').run(month,config.monthlyBudget);
  if(!r.changes)throw new DingTalkError('本月钉钉API预算已用完，覆盖尚未完成','BUDGET');
 }});
 const permission=(user,code)=>{if(!user?.id)throw fail('请先登录',401);if(!hasRbac(user,code))throw fail('当前账号没有权限',403);};
 const scope=user=>personnelAccess.predicate(user,'attendance','p');
 const all=user=>personnelAccess.hasAll(user,'attendance');
 const tx=fn=>{db.exec('begin immediate');try{const result=fn();db.exec('commit');return result;}catch(e){db.exec('rollback');throw e;}};
 function acquire(){const at=iso(),expires=new Date(Date.now()+180000).toISOString();db.prepare("insert into attendance_leases(id,owner,expires_at) values('worker',?,?) on conflict(id) do update set owner=excluded.owner,expires_at=excluded.expires_at where attendance_leases.expires_at<? or attendance_leases.owner=?").run(owner,expires,at,owner);return db.prepare("select owner from attendance_leases where id='worker'").get()?.owner===owner;}
 function renew(){const r=db.prepare("update attendance_leases set expires_at=? where id='worker' and owner=?").run(new Date(Date.now()+180000).toISOString(),owner);if(!r.changes)throw fail('同步任务租约已失效',409);}
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
 function enqueue({from,to,user=null,id=uid(),system=false}){
  datesBetween(from,to);if(from<config.startDate||to>dayOf(clock()))throw fail('同步期间须在2026-09-01至今天之间');
  if(!system){permission(user,'attendance.record.manage');permission(user,'attendance.read');}
  if(!configurationStatus(config).configured)throw fail('钉钉应用尚未配置，请由管理员配置服务器环境变量',409);
  const selected=system||all(user)?null:people(user).map(p=>p.personId);
  if(selected&&selected.length===0)throw fail('当前考勤数据范围没有可同步人员',403);
  const at=iso();const exists=db.prepare('select id from attendance_runs where id=?').get(id);if(exists)return exists;
  db.prepare('insert into attendance_runs(id,from_date,to_date,status,actor_id,scope_json,created_at,updated_at) values(?,?,?,?,?,?,?,?) on conflict(id) do nothing').run(id,from,to,'directory',user?.id||'scheduler',json(selected),at,at);
  if(user)audit(user,'attendance_sync','attendance',id,json({from,to}));
  return {id,status:'directory'};
 }
 async function loadDirectory(run){
  const directory=await client.directory(), dep=new Map(directory.departments.map(d=>[d.id,d]));
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
   for(const a of db.prepare("select * from attendance_people where person_id is not null and coalesce(identity_issue,'')='' ").all())if(!known.has(a.person_id)&&(!selected||selected.includes(a.person_id)))users.push({userId:a.user_id,personId:a.person_id});
   if(!users.length){db.prepare('update attendance_runs set status=?,error=?,updated_at=? where id=?').run('failed','没有工号唯一匹配的人员，请查看身份问题',iso(),run.id);return;}
   for(const w of syncWindows(run.from_date,run.to_date))for(let i=0;i<users.length;i+=10){
    const batchId=uid(),batch=users.slice(i,i+10);
    db.prepare('insert into attendance_batches(id,run_id,from_date,to_date,users_json,status,next_at) values(?,?,?,?,?,?,?)').run(batchId,run.id,w.from,w.to,json(batch),'pending',iso());
    for(const u of batch)for(const date of datesBetween(w.from,w.to))db.prepare('insert into attendance_tasks(id,run_id,batch_id,person_id,user_id,work_date,status,next_at) values(?,?,?,?,?,?,?,?)').run(uid(),run.id,batchId,u.personId,u.userId,date,'pending',iso());
   }
   const missingSelected=selected?.some(id=>!users.some(u=>u.personId===id));db.prepare('update attendance_runs set status=?,updated_at=?,error=? where id=?').run('running',iso(),(!selected&&identityIssues)||missingSelected?'存在工号未匹配人员，人员覆盖未完成':null,run.id);
  });
 }
 async function detailsFor(day,runId){
  const details=new Map();
  for(const a of day.approve_list){
   if(a.tag_name!=='出差')continue;
   const id=String(a.procInst_id||a.proc_inst_id||a.procInstId||'');if(!id)continue;
   const old=db.prepare('select * from attendance_approvals where id=? and run_id=?').get(id,runId);
   if(old){details.set(id,{detail:parse(old.detail_json),status:old.status});continue;}
   let detail=null,status='ok';
   try{const d=await client.approval(id);detail={status:d.status,result:d.result,formComponentValues:(d.formComponentValues||[]).filter(v=>config.reasonFieldId?String(v.id)===config.reasonFieldId:v.name===config.reasonFieldName).map(v=>({id:v.id,name:v.name,value:v.value}))};}
   catch(e){if(e.retryable||e.code==='BUDGET')throw e;status=['60011','60020','Forbidden.AccessDenied','Forbidden','403','processSetupNoPermission'].includes(e.code)?'permission_denied':'detail_missing';}
   db.prepare('insert into attendance_approvals(id,run_id,detail_json,status,fetched_at) values(?,?,?,?,?) on conflict(id) do update set run_id=excluded.run_id,detail_json=excluded.detail_json,status=excluded.status,fetched_at=excluded.fetched_at').run(id,runId,json(detail),status,iso());details.set(id,{detail,status});
  }
  return details;
 }
 function saveDay(task,input){
  const person=db.prepare('select department,team,department_ids from attendance_people where user_id=?').get(task.user_id);
  input={...input,organizationSnapshot:person?{department:person.department,team:person.team,departmentIds:parse(person.department_ids,[])}:null};
  const result=classifyDay(input,clock());const hash=crypto.createHash('sha256').update(json(input)).digest('hex'),at=iso();
  tx(()=>{
   const old=db.prepare('select * from attendance_days where person_id=? and work_date=?').get(task.person_id,task.work_date);
   if(old&&old.source_hash!==hash)db.prepare('insert into attendance_changes(id,person_id,work_date,before_json,after_json,changed_at,run_id) values(?,?,?,?,?,?,?)').run(uid(),task.person_id,task.work_date,old.input_json,json(input),at,task.run_id);
   db.prepare('insert into attendance_days(person_id,work_date,input_json,result_json,source_hash,updated_at,run_id) values(?,?,?,?,?,?,?) on conflict(person_id,work_date) do update set input_json=excluded.input_json,result_json=excluded.result_json,source_hash=excluded.source_hash,updated_at=excluded.updated_at,run_id=excluded.run_id').run(task.person_id,task.work_date,json(input),json(result),hash,at,task.run_id);
   db.prepare('update attendance_tasks set status=?,error=?,attempts=0,updated_at=? where id=?').run(result.purposes.some(p=>p.status!=='ok'&&p.status!=='conflict')?'incomplete':'done',result.purposes.some(p=>p.status!=='ok'&&p.status!=='conflict')?'审批事由资料未完整覆盖':null,at,task.id);
  });
 }
 function retry(table,item,e){
  const attempts=Number(item.attempts||0)+1,code=String(e.code||'ERROR').replace(/[^\w.:-]/g,'').slice(0,80);
  const terminal=attempts>=5||['BUDGET','TIMEZONE','60011','60020','403'].includes(e.code);
  const message=e.code==='BUDGET'?'本月API调用预算已用完':`同步失败（${code}），${terminal?'请重新同步':'稍后自动重试'}`;
  db.prepare(`update ${table} set status=?,attempts=?,next_at=?,error=?${table==='attendance_tasks'?',updated_at=?':''} where id=?`).run(terminal?'failed':'pending',attempts,new Date(Date.now()+Math.min(3600000,60000*2**attempts)).toISOString(),message,...(table==='attendance_tasks'?[iso()]:[]),item.id);
 }
 function finishRuns(){
  for(const run of db.prepare("select * from attendance_runs where status='running'").all()){
   const batches=db.prepare('select status,count(*) as n from attendance_batches where run_id=? group by status').all(run.id);
   const tasks=db.prepare('select status,count(*) as n from attendance_tasks where run_id=? group by status').all(run.id);
   const pending=db.prepare("select count(*) as n from attendance_tasks t join attendance_batches b on b.id=t.batch_id where t.run_id=? and t.status='pending' and b.status<>'failed'").get(run.id).n;
   if(batches.some(r=>r.status==='pending')||pending)continue;
   // A failed batch leaves its day tasks explicitly failed.
   db.prepare("update attendance_tasks set status='failed',error='批量排班或考勤结果未完整读取',updated_at=? where run_id=? and status='pending' and batch_id in (select id from attendance_batches where status='failed')").run(iso(),run.id);
   const incomplete=db.prepare("select count(*) as n from attendance_tasks where run_id=? and status<>'done'").get(run.id).n;
   db.prepare('update attendance_runs set status=?,updated_at=?,error=? where id=?').run(incomplete||run.error?'partial':'completed',iso(),incomplete?'存在未完整覆盖人员日，请查看同步明细':run.error||null,run.id);
  }
 }
 function schedule(){
  if(!config.enabled||!configurationStatus(config).configured)return;
  const at=clock(),date=dayOf(at),local=new Date(at+8*3600000),hour=local.getUTCHours();
  if(date<config.startDate)return;
  if(!db.prepare("select id from attendance_runs where actor_id='initial'").get()){
   const run=enqueue({from:config.startDate,to:date,id:'initial-backfill',system:true});db.prepare("update attendance_runs set actor_id='initial' where id=?").run(run.id);
  }
  for(const h of [10,21])if(hour>=h){
   let from;
   if(h===21){const [y,m]=date.split('-').map(Number);from=new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,10);}
   else{let d=Date.parse(date+'T00:00:00Z'),n=0;while(n<3){d-=86400000;const dow=new Date(d).getUTCDay();if(dow!==0&&dow!==6)n++;}from=new Date(d).toISOString().slice(0,10);}
   enqueue({from:from<config.startDate?config.startDate:from,to:date,id:`scheduled-${date}-${h}`,system:true});
  }
 }
 async function tick(){
  if(busy||!configurationStatus(config).configured)return;
  busy=true;let acquired=false;
  try{
   acquired=acquire();if(!acquired)return;
   if(config.enabled)await fetchLeaveCatalog();
   schedule();
   const run=db.prepare("select * from attendance_runs where status='directory' and (next_at is null or next_at<=?) order by created_at limit 1").get(iso());
   if(run){try{await loadDirectory(run);}catch(e){const attempts=Number(run.attempts||0)+1;db.prepare('update attendance_runs set status=?,error=?,updated_at=?,attempts=?,next_at=? where id=?').run(e.retryable&&attempts<5?'directory':'failed',`通讯录读取或工号匹配失败${e.permissionCodes?.length?'；缺少读取权限：'+e.permissionCodes.join('、'):e.code?'（'+String(e.code).replace(/[^\w.:-]/g,'')+'）':''}；请检查配置、权限和额度`,iso(),attempts,new Date(Date.now()+60000*attempts).toISOString(),run.id);}return;}
   const batch=db.prepare("select b.* from attendance_batches b join attendance_runs r on r.id=b.run_id where b.status='pending' and b.next_at<=? and r.status='running' order by r.created_at,b.from_date limit 1").get(iso());
   if(batch){try{const users=parse(batch.users_json),ids=users.map(u=>u.userId);const results=await client.results(ids,batch.from_date,batch.to_date),schedules=await client.schedules(ids,batch.from_date,batch.to_date);renew();db.prepare('update attendance_batches set payload_json=?,status=?,error=null where id=?').run(json({results,schedules}),'done',batch.id);}catch(e){retry('attendance_batches',batch,e);}finishRuns();return;}
   const task=db.prepare("select t.*,b.payload_json from attendance_tasks t join attendance_batches b on b.id=t.batch_id join attendance_runs r on r.id=t.run_id where t.status='pending' and t.next_at<=? and b.status='done' and r.status='running' order by r.created_at,t.work_date limit 1").get(iso());
   if(task){try{const data=parse(task.payload_json),day=await client.day(task.user_id,task.work_date),details=await detailsFor(day,task.run_id);renew();saveDay(task,normalizeDay({date:task.work_date,userId:task.user_id,day,...data,details,config}));}catch(e){retry('attendance_tasks',task,e);}}
   finishRuns();
  }finally{if(acquired)db.prepare("delete from attendance_leases where id='worker' and owner=?").run(owner);busy=false;}
 }
 function leaveCatalog(user){
  const row=db.prepare("select * from attendance_leave_catalog where id='enterprise'").get();
  const types=parse(row?.types_json,[])||[],known=new Set(types.map(v=>v.name)),s=scope(user);
  // Include historical approval names even when unused in the selected month.
  for(const r of db.prepare(`select d.input_json from attendance_days d join personnel p on p.id=d.person_id where (${s.sql})`).all(...s.params)){
   for(const a of parse(r.input_json,{}).approvals||[])if(a.kind==='请假'&&a.subType)known.add(String(a.subType));
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
   db.prepare("update attendance_leave_catalog set types_json=?,last_synced_at=?,error=null where id='enterprise'").run(json(types),at);
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
 function snapshot(user,filters={},permissionCode='attendance.read'){
  permission(user,permissionCode);permission(user,'attendance.read');
  const dates=monthDates(filters.month||dayOf(clock()).slice(0,7)), members=people(user,filters),ids=new Set(members.map(p=>p.personId));
  const contextFrom=new Date(Date.parse(dates[0]+'T00:00:00Z')-3*86400000).toISOString().slice(0,10);
  const contextTo=new Date(Date.parse(dates.at(-1)+'T00:00:00Z')+3*86400000).toISOString().slice(0,10);
  const contextDates=datesBetween(contextFrom,contextTo).filter(date=>date<dates[0]||date>dates.at(-1));
  const s=scope(user);
  const rows=db.prepare(`select d.* from attendance_days d join personnel p on p.id=d.person_id where (${s.sql}) and d.work_date>=? and d.work_date<=?`).all(...s.params,contextFrom,contextTo);
  const byKey=new Map(rows.filter(r=>ids.has(r.person_id)).map(r=>[r.person_id+'|'+r.work_date,r]));
  const taskErrors=db.prepare(`select t.person_id,t.work_date,t.error,t.updated_at from attendance_tasks t join personnel p on p.id=t.person_id where (${s.sql}) and t.work_date>=? and t.work_date<=? and t.status in ('failed','incomplete') order by t.updated_at`).all(...s.params,contextFrom,contextTo);
  const errors=new Map(taskErrors.map(r=>[r.person_id+'|'+r.work_date,r]));
  const peopleRows=members.map(p=>{
   const makeDay=date=>{const row=byKey.get(p.personId+'|'+date),input=row?parse(row.input_json):{date,covered:false,identityIssue:p.identityIssue};const result=classifyDay(input,clock());const taskError=errors.get(p.personId+'|'+date);const syncError=taskError && (!row || taskError.updated_at>=row.updated_at)?taskError.error:null;return {...result,input,updatedAt:row?.updated_at||null,runId:row?.run_id||null,syncError,stale:!!syncError&&!!row};};
   const days=dates.map(makeDay),contextDays=contextDates.map(makeDay);
   const counts={};for(const d of days)counts[d.category]=(counts[d.category]||0)+1;
   const computed=days.filter(d=>d.overtime.seconds!==null);
   return {...p,days,contextDays,counts,overtimeSeconds:computed.length?computed.reduce((n,d)=>n+d.overtime.seconds,0):null,computedDays:computed.length,uncomputableDays:days.filter(d=>d.overtime.status==='无法计算'&&!['未来日期','未同步'].includes(d.category)).length};
  });
  const leaveTypes=leaveCatalog(user);
  const settings=displaySettings(user);
  const categories=attendanceOrderedCategories([...new Set([...peopleRows.flatMap(p=>Object.keys(p.counts)),...leaveTypes.names])]);
  const visiblePeople=peopleRows.filter(p=>attendanceMatchesCategories(p,filters.categories));
  const visibleIds=new Set(visiblePeople.map(p=>p.personId));
  const last=rows.filter(r=>visibleIds.has(r.person_id)&&r.work_date>=dates[0]&&r.work_date<=dates.at(-1)).map(r=>r.updated_at).sort().at(-1)||null;
  return {month:dates[0].slice(0,7),dates,people:visiblePeople,categories,leaveTypes,displaySettings:settings,generatedAt:iso(),lastSyncedAt:last,ruleVersion:RULE_VERSION,historyWarning:'当前通讯录不能证明历史全员完整；历史缺失保持可见，不推断缺勤。',overtimeNote:'按末次计划下班点与对应有效实际打卡的差额累计，不代表审批认可时长。',capabilityStatusEnabled:false};
 }
 function status(user){
  permission(user,'attendance.read');const s=scope(user);
  const counts=db.prepare(`select t.run_id,t.status,count(*) as n from attendance_tasks t join personnel p on p.id=t.person_id where (${s.sql}) group by t.run_id,t.status`).all(...s.params);
  const visible=new Set(counts.map(r=>r.run_id));
  const runs=db.prepare('select * from attendance_runs order by created_at desc limit 40').all().filter(r=>all(user)||visible.has(r.id)||r.actor_id===user.id).map(r=>({id:r.id,from:r.from_date,to:r.to_date,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at,error:r.error,counts:Object.fromEntries(counts.filter(c=>c.run_id===r.id).map(c=>[c.status,Number(c.n)]))}));
  return {configuration:configurationStatus(config),leaveTypes:leaveCatalog(user),runs,canSync:hasRbac(user,'attendance.record.manage'),canStats:hasRbac(user,'attendance.stats.read'),canExport:hasRbac(user,'attendance.export'),usage:all(user)?db.prepare('select * from attendance_api_usage where month=?').get(dayOf(clock()).slice(0,7))||null:null,identityIssues:all(user)?db.prepare("select employee_no as employeeNo,name,identity_issue as issue from attendance_people where coalesce(identity_issue,'')<>''").all():[],historyWarning:'历史组织名单完整性待核实；API无法取得的历史记录不填零。'};
 }
 function changes(user,filters){permission(user,'attendance.read');const members=people(user,filters),ids=new Set(members.map(p=>p.personId)),s=scope(user);const dates=monthDates(filters.month);return db.prepare(`select c.* from attendance_changes c join personnel p on p.id=c.person_id where (${s.sql}) and c.work_date>=? and c.work_date<=? order by c.changed_at`).all(...s.params,dates[0],dates.at(-1)).filter(r=>ids.has(r.person_id));}
 return {config,enqueue,tick,snapshot,status,changes,refreshLeaveTypes,displaySettings,saveDisplaySettings,start(){if(!timer){timer=setInterval(()=>tick().catch(()=>{}),1000);timer.unref();tick().catch(()=>{});}},stop(){clearInterval(timer);timer=null;},capabilityStatuses(user,personId){permission(user,'attendance.read');personnelAccess.requirePerson(user,'attendance',personId);return {enabled:false,personId,records:[],supportedKinds:['DEPLOYED','TRAINING','OTHER'],fields:['personId','kind','startDate','endDate','recordId','version']};}};
}
