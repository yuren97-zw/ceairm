import fs from 'node:fs';
import crypto from 'node:crypto';
import {dayOf,stamp,datesBetween,monthDates,tripPurpose} from './attendance-rules.mjs';
import {readApprovalReason} from './attendance-approval-reasons.mjs';
const parse=(s,f=null)=>{try{return JSON.parse(s);}catch{return f;}};
const dayMs=86400000;
// Explicitly verified business templates. Similar test forms are not included.
const templateKind=name=>({'请假':'请假','请休假申请':'请假','外出':'外出','外出申请':'外出','出差':'出差','出差申请':'出差'})[name]||null;
const nextDate=d=>new Date(Date.parse(d+'T00:00:00Z')+dayMs).toISOString().slice(0,10);
const previousDate=d=>new Date(Date.parse(d+'T00:00:00Z')-dayMs).toISOString().slice(0,10);
const initialBaseline=(plan,input)=>plan.history?.length===1&&(plan.initialSnapshot||['initial_known','initial_inventory'].includes(plan.history[0].source))&&(input.approvals||[]).some(a=>a.id===plan.id&&a.kind===plan.kind&&a.approved&&!a.revoked&&(plan.kind!=='请假'||a.subType===plan.category));
export function approvalBusinessTime(value,end=false){
 if(typeof value==='string'&&/^\d{4}-\d\d-\d\d(?:\s*(上午|下午))?$/.test(value)){
  const date=value.slice(0,10),half=value.includes('上午')?'am':value.includes('下午')?'pm':null;
  return Date.parse(date+`T${end?(half==='am'?'12:00:00':'23:59:59'):(half==='pm'?'12:00:00':'00:00:00')}+08:00`);
 }
 return stamp(value);
}
// Only confirmed attendance form structures are read; titles and processing timestamps never supply business dates.
export function normalizeApprovalPlan(detail,config={}){
 const fields=detail?.formComponentValues||[];
 const get=(name,values=fields)=>{const a=values.filter(f=>(f.name??f.label)===name);return a.length===1?a[0].value:null;};
 let kind=null,category=null,segments=[],duration=null,issue=null,effect=null;
 const holiday=fields.filter(f=>f.componentType==='DDHolidayField'||f.id==='DDHolidayField-J2BWEN12');
 const table=fields.filter(f=>f.id==='TableField_LDYWW1RA5CG0');
 const correction=fields.filter(f=>f.id==='DDDateField-JYNRW51O');
 const repair=fields.filter(f=>f.name==='repairCheckTime');
 if(correction.length||repair.length){
  kind='补卡';effect='punch_correction';
  // Verified contract only. Never retain reasons/images or manufacture a punch from approval.
  const field=correction[0],value=field?.value;
  const exactDate=typeof value==='string'&&/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d)?$/.test(value);
  const at=exactDate?stamp(value):null;
  const roundTrip=at?new Date(at+8*3600000).toISOString().slice(0,value.length).replace('T',' '):null;
  const systemTime=repair.length===1&&/^\d{13}$/.test(String(repair[0].value))?stamp(repair[0].value):null;
  if(correction.length!==1||repair.length!==1||repair[0]?.id||repair[0]?.componentType!=null||field?.name!=='补卡时间'||field?.componentType!=='DDDateField'||!at||roundTrip!==value.replace('T',' ')||at!==systemTime||holiday.length||table.length||fields.some(f=>['DDDateField_9NJFYUSAEXC0','DDDateField_18N97G5ARZ4W0'].includes(f.id)))issue='补卡字段缺失、重复、时间不一致或混入其他审批结构';
  if(!issue)segments=[{start:at,end:at+1}];
 }else if(holiday.length===1){
  kind='请假';const v=parse(holiday[0].value,[]);
  if(Array.isArray(v)&&v.length>=5){category=typeof v[4]==='string'?v[4].trim():null;segments=[{start:approvalBusinessTime(v[0]),end:approvalBusinessTime(v[1],true)}];duration={value:v[2],unit:v[3]};}
 }else if(table.length===1){
  kind='出差';const rows=parse(table[0].value,[]);
  if(Array.isArray(rows))segments=rows.map(r=>({start:approvalBusinessTime(get('开始时间',r.rowValue||[])),end:approvalBusinessTime(get('结束时间',r.rowValue||[]),true)}));
  const purpose=tripPurpose(readApprovalReason(detail,kind,config).reason);category=purpose.category;
  duration={value:get('出差天数'),unit:'天'};
 }else if(fields.some(f=>f.id==='DDDateField_9NJFYUSAEXC0')&&fields.some(f=>f.id==='DDDateField_18N97G5ARZ4W0')){
  kind='外出';category='外出';segments=[{start:approvalBusinessTime(get('开始时间')),end:approvalBusinessTime(get('结束时间'),true)}];
  duration={value:get('时长'),unit:'原表时长'};
 }else return {state:'unsupported',error:'未适配的考勤审批表单；不根据标题推断',kind:null,category:null,segments:[]};
 const reason=effect?{reason:null,reasonStatus:'not_applicable'}:readApprovalReason(detail,kind,config);
 if(!effect&&(!category||category.length>100))issue='审批类别未唯一识别';
 if(!issue&&(!segments.length||segments.some(s=>!s.start||!s.end||s.end<=s.start||s.end-s.start>366*dayMs)))issue='审批业务日期缺失、无效或超出366天';
 const terminal=['TERMINATED','CANCELED','CANCELLED'].includes(detail.status)||detail.result==='refuse';
 const action=String(detail.bizAction||'NONE').toUpperCase(),mainId=String(detail.mainProcessInstanceId||'');
 const actionApproved=detail.status==='COMPLETED'&&detail.result==='agree';
 if(!['NONE','MODIFY','REVOKE'].includes(action)||action!=='NONE'&&!mainId)issue='关联审批动作或原申请标识不完整';
 const state=issue?'unresolved':terminal?'withdrawn':action==='REVOKE'?(actionApproved?'withdrawn':'pending'):actionApproved?'approved':'pending';
 const dates=issue?[]:[...new Set(segments.flatMap(s=>datesBetween(dayOf(s.start),dayOf(s.end-1))))].sort();
 return {kind,category,segments,dates,...(effect?{effect,recheckDates:dates.length?[previousDate(dates[0]),dates[0]]:[]}:{}),duration,reason:reason.reason,reasonStatus:reason.reasonStatus,state,error:issue,status:detail.status||null,result:detail.result||null,createdAt:detail.createTime||null,finishedAt:detail.finishTime||null,action,mainId,actionApproved,baseState:state,relationVersion:1,attachedIds:[...new Set((detail.attachedProcessInstanceIds||[]).filter(v=>typeof v==='string'&&v.length<=200))]};
}
// Resolve related business operations as one application; operation forms never count as new leave.
export function resolveApprovalGroups(rows){
 const items=rows.map(r=>({...r,plan:{...r.plan,state:r.plan.baseState||r.plan.state,error:r.plan.baseError??r.plan.error??null,effectReason:null}}));
 const byId=new Map(items.map(r=>[r.id,r]));
 const rootOf=r=>{const seen=new Set();while(r?.plan.mainId){if(seen.has(r.id))return null;seen.add(r.id);r=byId.get(r.plan.mainId);}return r;};
 const groups=new Map();
 for(const r of items){const root=rootOf(r),key=root?.id||r.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 for(const members of groups.values()){
  const root=rootOf(members[0]);
  const missing=!root||members.some(r=>!r.personId||r.personId!==root.personId||r.plan.kind!==root.plan.kind||r.plan.state==='unresolved'||r.plan.attachedIds?.some(id=>!byId.get(id)?.plan.relationVersion||rootOf(byId.get(id))?.id!==root.id));
  if(missing){for(const r of members){r.plan.state='unresolved';r.plan.effectReason='关联申请读取未完成、身份不一致或资料待核对';}continue;}
  const revokes=members.filter(r=>r.plan.action==='REVOKE'&&r.plan.actionApproved&&r.plan.baseState!=='unresolved');
  if(revokes.length){for(const r of members){r.plan.state='withdrawn';r.plan.effectReason='关联撤销已批准，原申请及修改记录均不再生效';}continue;}
  const modifications=members.filter(r=>r.plan.action==='MODIFY'&&r.plan.baseState==='approved').sort((a,b)=>String(b.plan.finishedAt||b.plan.createdAt||'').localeCompare(String(a.plan.finishedAt||a.plan.createdAt||'')));
  const winner=modifications[0]||root;
  const ambiguous=modifications.length>1&&(!winner.plan.finishedAt&&!winner.plan.createdAt||String(winner.plan.finishedAt||winner.plan.createdAt)===String(modifications[1].plan.finishedAt||modifications[1].plan.createdAt));
  for(const r of members){
   if(ambiguous){r.plan.state='unresolved';r.plan.effectReason='多份修改申请顺序无法唯一确定';}
   else if(r!==winner&&(r.plan.state==='approved'||r.plan.action==='MODIFY'&&r.plan.baseState==='approved')){r.plan.state='superseded';r.plan.effectReason='已由批准的关联修改申请替代';}
  }
 }
 return items;
}
export function createApprovalPlanService({db,client,config,clock,hybrid,enqueue,people,permission,audit}){
 const enabled=!!config.approvalPlansEnabled;
 if(enabled){let schema=fs.readFileSync(new URL('./migrations/029_attendance_approval_plans.sql',import.meta.url),'utf8');if(db.kind!=='postgres')schema=schema.replace('id BIGSERIAL PRIMARY KEY','id INTEGER PRIMARY KEY AUTOINCREMENT');db.exec(schema);}
 const now=()=>new Date(clock()).toISOString();
 const dueEnabled=()=>!!config.approvalPlanDueEnabled&&hybrid.state('approvalPlanDueEnabled')===true;
 const setVersion=()=>hybrid.setState('approvalPlanVersion',now());
 function queue(id,source='event'){
  if(!enabled||!id)return;
  db.prepare("insert into attendance_approval_plan_queue(id,due_at,source) values(?,?,?) on conflict(id) do update set generation=attendance_approval_plan_queue.generation+1,due_at=excluded.due_at,source=excluded.source,attempts=0,error=null").run(String(id),now(),source);
 }
 function seed(){
  if(!enabled||hybrid.state('approvalPlanSeed'))return;
  const since=config.startDate+'T00:00:00+08:00';
  // Inventory only, never replay existing notifications or expand attendance queries.
  for(const r of db.prepare("select id,payload_json from attendance_events where received_at>=? and topic in ('attendance_approve_status_change','bpms_instance_change')").all(new Date(since).toISOString())){const p=parse(r.payload_json,{});queue(p.processInstanceId||p.process_instance_id,'initial_known');db.prepare('insert or ignore into attendance_approval_plan_events values(?,?)').run(r.id,now());}
  for(const r of db.prepare('select distinct input_json from attendance_days where work_date>=?').all(config.startDate))for(const a of parse(r.input_json,{}).approvals||[])queue(a.id,'initial_known');
  hybrid.setState('approvalPlanSeed',{at:now(),from:config.startDate,coverage:'已接收通知及已知实例；完整模板清单待接口确认'});
 }
 function observe(){
  if(!enabled)return;seed();
  for(const e of db.prepare("select e.id,e.payload_json from attendance_events e where e.received_at>=? and e.topic in ('attendance_approve_status_change','bpms_instance_change') and not exists(select 1 from attendance_approval_plan_events m where m.event_id=e.id) order by e.received_at limit 50").all(new Date(config.startDate+'T00:00:00+08:00').toISOString())){
   const p=parse(e.payload_json,{});queue(p.processInstanceId||p.process_instance_id,'event');
   db.prepare('insert into attendance_approval_plan_events values(?,?)').run(e.id,now());
  }
 }
 function scheduleRecord(row,old){
  db.prepare("update attendance_approval_plan_due set status='cancelled' where instance_id=? and status='pending'").run(row.id);
  if(!config.approvalPlanDueEnabled)return;
  const plan=parse(row.plan_json,{}),previous=parse(old?.plan_json,{});
  const affected=new Map();
  for(const [p,id] of [[plan,row.person_id],[previous,old?.person_id]])if(id){
   if(p.effect==='punch_correction'&&(p.state!=='approved'||p.error))continue;
   for(const date of (p.effect==='punch_correction'?p.recheckDates:p.dates)||[])if(date>=config.startDate)affected.set(id+'|'+date,{personId:id,date,correction:p.effect==='punch_correction'});
  }
  for(const {personId,date,correction} of affected.values()){
   if(date>dayOf(clock())&&plan.state!=='approved')continue;
   const final=nextDate(date)+'T12:30:00+08:00';
   const phases=correction?[['correction',date>dayOf(clock())?date+'T00:05:00+08:00':now()],...(Date.parse(final)>clock()?[['final',final]]:[])]:[['initial',date+'T00:05:00+08:00'],['final',final]];
   for(const [phase,due] of phases){
    const id=crypto.createHash('sha256').update([row.id,row.revision,personId,date,phase].join('|')).digest('hex');
    db.prepare('insert or ignore into attendance_approval_plan_due(id,instance_id,revision,person_id,work_date,phase,due_at) values(?,?,?,?,?,?,?)').run(id,row.id,row.revision,personId,date,phase,new Date(due).toISOString());
   }
  }
 }
 function save(id,detail,source){
  const plan=normalizeApprovalPlan(detail,config);
  const matches=db.prepare("select a.person_id from attendance_people a join personnel p on p.id=a.person_id where a.user_id=? and coalesce(a.identity_issue,'')='' and coalesce(p.data_status,'active')<>'deleted'").all(String(detail.originatorUserId||''));
  const personId=matches.length===1?matches[0].person_id:null;
  if(!personId){plan.state='unresolved';plan.error='审批人员未唯一匹配授权名单';}
  plan.baseState=plan.state;plan.baseError=plan.error||null;
  const previous=db.prepare('select * from attendance_approval_plans').all(),oldById=new Map(previous.map(r=>[r.id,r]));
  const affected=new Set([id,plan.mainId,...(plan.attachedIds||[])]);
  let grew=true;while(grew){grew=false;for(const r of previous){const p=parse(r.plan_json,{}),links=[r.id,p.mainId,...(p.attachedIds||[])];if(links.some(v=>v&&affected.has(v)))for(const v of links)if(v&&!affected.has(v)){affected.add(v);grew=true;}}}
  const candidates=previous.filter(r=>r.id!==id&&affected.has(r.id)).map(r=>({id:r.id,personId:r.person_id,plan:parse(r.plan_json,{})}));
  candidates.push({id,personId,plan});
  db.exec('begin immediate');try{
   for(const item of resolveApprovalGroups(candidates)){
    const old=oldById.get(item.id),value=JSON.stringify(item.plan),changed=old?.plan_json!==value||old?.person_id!==item.personId;
    if(!changed&&item.id!==id)continue;
    const revision=Number(old?.revision||0)+(changed?1:0),p=item.plan;
    db.prepare('insert into attendance_approval_plans(id,person_id,kind,category,state,plan_json,revision,updated_at,error) values(?,?,?,?,?,?,?,?,?) on conflict(id) do update set person_id=excluded.person_id,kind=excluded.kind,category=excluded.category,state=excluded.state,plan_json=excluded.plan_json,revision=excluded.revision,updated_at=excluded.updated_at,error=excluded.error').run(item.id,item.personId,p.kind,p.category,p.state,value,revision,now(),p.error||null);
    if(changed){db.prepare('insert into attendance_approval_plan_history(instance_id,before_json,after_json,source,changed_at) values(?,?,?,?,?)').run(item.id,old?.plan_json||null,value,source,now());scheduleRecord({id:item.id,person_id:item.personId,plan_json:value,revision},old);}
   }
   // Only exact linked identifiers from authoritative detail are followed, never a broad inventory.
   for(const related of [...new Set([plan.mainId,...(plan.attachedIds||[])])].filter(v=>v&&v!==id)){
    const known=oldById.get(related),pending=db.prepare('select generation,applied_generation from attendance_approval_plan_queue where id=?').get(related);
    if(!parse(known?.plan_json,{})?.relationVersion&&!(pending&&pending.generation>pending.applied_generation))queue(related,'related_instance');
   }
   db.exec('commit');
  }catch(e){db.exec('rollback');throw e;}
  setVersion();return db.prepare('select * from attendance_approval_plans where id=?').get(id);
 }
 async function tick(){
  if(!enabled||config.manualOnly||config.validation?.enabled)return false;
  observe();
  const urgent=!!db.prepare("select id from attendance_events where status='pending' limit 1").get()||!!db.prepare("select r.id from attendance_runs r join attendance_run_meta m on m.run_id=r.id where r.status in ('directory','running') and m.source='event' limit 1").get();
  const q=db.prepare("select * from attendance_approval_plan_queue where generation>applied_generation and due_at<=? order by case when source='event' then 0 else 1 end,due_at limit 1").get(now());
  if(urgent&&q?.source!=='event')return false;
  if(q){client.requestContext='approval_plan';try{save(q.id,await client.approval(q.id),q.source);db.prepare('update attendance_approval_plan_queue set applied_generation=?,attempts=0,error=null where id=?').run(q.generation,q.id);}
   catch(e){const message='审批详情更新未完成，旧记录暂不计入待复核；等待重试（'+String(e.code||'NETWORK').replace(/[^\w.:-]/g,'')+'）';db.prepare('update attendance_approval_plan_queue set attempts=attempts+1,due_at=?,error=? where id=?').run(new Date(clock()+Math.min(3600000,60000*2**Math.min(q.attempts,6))).toISOString(),message,q.id);setVersion();}return true;}
  if(!hybrid.state('approvalPlanInventory')&&typeof client.approvalTemplates==='function'){
   hybrid.setState('approvalPlanInventory',{stage:'templates',offset:0,templates:[],from:Date.parse(config.startDate+'T00:00:00+08:00'),to:clock()});
  }
  const inventory=hybrid.state('approvalPlanInventory');
  if(inventory&&['templates','instances'].includes(inventory.stage)){
   client.requestContext='approval_plan_inventory';
   try{
    if(inventory.stage==='templates'){
     const page=await client.approvalTemplates(inventory.offset);
     const allowed=page.items.filter(t=>templateKind(t.name)&&t.process_code);
     for(const t of allowed)if(!inventory.templates.some(p=>p.code===t.process_code))inventory.templates.push({name:t.name,code:t.process_code,kind:templateKind(t.name)});
     if(page.next!==null&&Number(page.next)>=0){if(Number(page.next)<=inventory.offset)throw Object.assign(Error(),{code:'PAGINATION'});inventory.offset=Number(page.next);}
     else{inventory.stage='instances';inventory.index=0;inventory.cursor=0;inventory.userIndex=0;inventory.users=db.prepare("select a.user_id from attendance_people a join personnel p on p.id=a.person_id where coalesce(a.identity_issue,'')='' and coalesce(p.data_status,'active')<>'deleted'").all().map(r=>r.user_id);}
    }else{
     const template=inventory.templates[inventory.index];
     if(!template||!inventory.users?.length){
      inventory.stage='completed';const missingKinds=['请假','外出','出差'].filter(k=>!inventory.templates.some(t=>(t.kind||templateKind(t.name))===k));
      const complete=!missingKinds.length&&!!inventory.users?.length;
      hybrid.setState('approvalPlanCoverage',{state:complete?'complete':'incomplete',from:config.startDate,to:new Date(inventory.to).toISOString(),at:now(),templates:inventory.templates.map(t=>t.name),people:inventory.users?.length||0,missingKinds,note:complete?'已核对现有授权人员的请休假申请、外出申请和出差申请；不包含更早创建的申请':missingKinds.length?'未发现全部业务模板，缺少：'+missingKinds.join('、')+'；不能认定审批覆盖完整':'未匹配到授权人员；不能认定审批覆盖完整'});
     }
     else{
      // Respect the API's bounded time window; advancing the window is durable.
      inventory.windowFrom=inventory.windowFrom??inventory.from;const end=Math.min(inventory.to,inventory.windowFrom+120*dayMs-1);
      const page=await client.approvalInstanceIds(template.code,inventory.windowFrom,end,inventory.cursor,inventory.users.slice(inventory.userIndex,inventory.userIndex+10));
      for(const id of page.ids)queue(id,'initial_inventory');
      if(page.next!==null&&Number(page.next)>=0){if(Number(page.next)<=inventory.cursor)throw Object.assign(Error(),{code:'PAGINATION'});inventory.cursor=Number(page.next);}
      else if(end<inventory.to){inventory.windowFrom=end+1;inventory.cursor=0;}
      else{inventory.userIndex+=10;if(inventory.userIndex>=inventory.users.length){inventory.index++;inventory.userIndex=0;}inventory.cursor=0;inventory.windowFrom=inventory.from;}
     }
    }
   }catch(e){inventory.stage='blocked';hybrid.setState('approvalPlanCoverage',{state:'incomplete',from:config.startDate,at:now(),note:'审批模板或实例清单读取未完成；已知审批继续同步，不能声称初始覆盖完整',code:String(e.code||'NETWORK').replace(/[^\w.:-]/g,''),requiredScopes:e.permissionCodes||[]});}
   hybrid.setState('approvalPlanInventory',inventory);setVersion();return true;
  }
  return false;
 }
 function due(){
  if(!enabled||!dueEnabled()||config.manualOnly||config.validation?.enabled)return;
  // Persisted jobs are restart-safe; only targeted people/dates enter the existing worker.
  for(const job of db.prepare("select * from attendance_approval_plan_due where status='pending' and due_at<=? order by due_at limit 20").all(now())){
   if(job.work_date<config.startDate)continue;
   const existing=db.prepare('select d.*,(select min(m.started_at) from attendance_tasks t join attendance_task_marks m on m.task_id=t.id where t.person_id=d.person_id and t.work_date=d.work_date and t.run_id=d.run_id) as source_queried_at from attendance_days d where person_id=? and work_date=?').get(job.person_id,job.work_date);
   if(existing){
    const plan=plansFor(job.person_id,job.work_date.slice(0,7)).find(p=>p.id===job.instance_id),input=parse(existing.input_json,{}),result=parse(existing.result_json,{});
    const off=(input.points||[]).filter(p=>p.type==='OffDuty'&&p.planned).map(p=>p.planned),after=off.length?Math.max(...off):Date.parse(nextDate(job.work_date)+'T12:30:00+08:00');
    if(plan&&initialBaseline(plan,input)&&input.covered&&Date.parse(existing.source_queried_at||existing.updated_at)>=Math.max(after,Date.parse(job.due_at))&&!['待核对','待核实','未同步','未来日期','尚未到下班时间'].includes(result.category)){
     db.prepare("update attendance_approval_plan_due set status='reused' where id=?").run(job.id);continue;
    }
   }
   const id='approval-due-'+job.id;
   enqueue({id,from:job.work_date,to:job.work_date,targets:[{personId:job.person_id,date:job.work_date}],source:'approval_due',system:true});
   db.prepare("update attendance_approval_plan_due set status='queued',run_id=? where id=?").run(id,job.id);
  }
  for(const job of db.prepare("select d.id,r.status from attendance_approval_plan_due d join attendance_runs r on r.id=d.run_id where d.status='queued'").all())if(['completed','partial','failed','blocked'].includes(job.status))db.prepare('update attendance_approval_plan_due set status=? where id=?').run(job.status==='completed'?'done':'attention',job.id);
 }
 function plansFor(personId,month){
  if(!enabled)return [];
  monthDates(month);
  return db.prepare('select a.*,q.generation,q.applied_generation,q.error as queue_error from attendance_approval_plans a left join attendance_approval_plan_queue q on q.id=a.id where person_id=?').all(personId).map(r=>{
   const p=parse(r.plan_json,{}),dates=(p.dates||[]).filter(d=>d.startsWith(month));
   const history=db.prepare('select after_json,source,changed_at from attendance_approval_plan_history where instance_id=? order by id desc limit 20').all(r.id).map(h=>{const a=parse(h.after_json,{});return {state:a.state,category:a.category,dates:a.dates||[],changedAt:h.changed_at,source:h.source};});
   const eventQuery=db.kind==='postgres'?"select max(received_at) as at from attendance_events where payload_json::jsonb->>'processInstanceId'=? or payload_json::jsonb->>'process_instance_id'=?":"select max(received_at) as at from attendance_events where json_extract(payload_json,'$.processInstanceId')=? or json_extract(payload_json,'$.process_instance_id')=?";
   const lastEvent=history.length===1&&history[0].source==='event'?db.prepare(eventQuery).get(r.id,r.id)?.at:null;
   const initialSnapshot=!!lastEvent&&lastEvent<=(hybrid.state('approvalPlanSeed')?.at||'');
   return {...p,id:r.id,revision:r.revision,updatedAt:r.updated_at,error:r.queue_error||r.error,stale:r.generation>r.applied_generation,dates,history,initialSnapshot};
  }).filter(p=>p.dates.length);
 }
 function decorate(person,month){
  if(!enabled)return person;
  const plans=plansFor(person.personId,month),pendingCounts={},displayCounts={...person.counts};
  const correctionStatus=new Map();
  for(const p of plans.filter(p=>p.effect==='punch_correction')){
   const dates=(p.recheckDates||[]).filter(date=>date>=config.startDate);
   const changedAt=Date.parse(p.history?.[0]?.changedAt||p.updatedAt||'');
   const complete=p.state==='approved'&&!p.stale&&!p.error&&dates.length>0&&dates.every(date=>{
    let day=person.days.find(d=>d.date===date);
    // The adjacent attribution day can be in the preceding month. Read only this person's day,
    // return a completion flag, and never expose another month's private detail in this response.
    if(!day){const row=db.prepare('select d.*,(select min(m.started_at) from attendance_tasks t join attendance_task_marks m on m.task_id=t.id where t.person_id=d.person_id and t.work_date=d.work_date and t.run_id=d.run_id) as source_queried_at from attendance_days d where person_id=? and work_date=?').get(person.personId,date);if(row)day={input:parse(row.input_json,{}),...parse(row.result_json,{}),updatedAt:row.updated_at,sourceQueriedAt:row.source_queried_at};}
    if(!day?.input?.covered||day.syncError||['待核对','待核实','未同步','未来日期','尚未到下班时间'].includes(day.category))return false;
    const off=(day.input.points||[]).filter(point=>point.type==='OffDuty'&&point.planned).map(point=>point.planned),after=off.length?Math.max(...off):Date.parse(nextDate(date)+'T12:30:00+08:00'),sourceAt=Date.parse(day.sourceQueriedAt||day.updatedAt||'');
    return Number.isFinite(changedAt)&&clock()>=after&&sourceAt>=after&&sourceAt>=changedAt;
   });correctionStatus.set(p.id,complete);
  }
  const days=person.days.map(d=>{
   const records=plans.filter(p=>p.dates.includes(d.date));
   const off=(d.input.points||[]).filter(p=>p.type==='OffDuty'&&p.planned).map(p=>p.planned);
   const after=off.length?Math.max(...off):Date.parse(nextDate(d.date)+'T12:30:00+08:00');
   const sourceAt=Date.parse(d.sourceQueriedAt||d.updatedAt||'');
   const verified=!!d.input.covered&&!d.syncError&&clock()>=after&&sourceAt>=after&&!['待核对','待核实','未同步','未来日期','尚未到下班时间'].includes(d.category);
   const reconciled=p=>p.effect==='punch_correction'?correctionStatus.get(p.id)===true:verified&&(initialBaseline(p,d.input)||sourceAt>=Date.parse(p.history?.[0]?.changedAt||0));
   const pending=records.filter(p=>p.effect!=='punch_correction'&&p.state==='approved'&&!p.stale&&!p.error&&!reconciled(p));
   for(const c of new Set(pending.map(p=>p.category))){pendingCounts[c]=(pendingCounts[c]||0)+1;if(c!==d.category)displayCounts[c]=(displayCounts[c]||0)+1;}
   return {...d,approvalPlans:records.map(p=>({...p,reconciled:p.state==='approved'&&!p.stale&&reconciled(p)})),pendingCategories:[...new Set(pending.map(p=>p.category))],approvalConflict:new Set(pending.map(p=>p.category)).size>1};
  });
  return {...person,days,approvalPlans:plans.map(p=>({...p,reconciled:p.dates.every(date=>days.find(d=>d.date===date)?.approvalPlans.find(a=>a.id===p.id)?.reconciled)})),pendingCounts,displayCounts};
 }
 function request(user,{id,retryInventory=false,dueEnabled:enableDue}={}){permission(user,'attendance.read');permission(user,'attendance.record.manage');if(!enabled)throw Object.assign(Error('审批计划未启用'),{status:409});
  if(enableDue!==undefined){if(!user.attendancePlanAll||typeof enableDue!=='boolean')throw Object.assign(Error('无权修改到期复核开关'),{status:403});hybrid.setState('approvalPlanDueEnabled',enableDue);audit(user,'attendance_approval_due_setting','attendance','approval_due',JSON.stringify({enabled:enableDue}));setVersion();return {enabled:dueEnabled()};}
  if(retryInventory){if(!user.attendancePlanAll)throw Object.assign(Error('无权重试初始清单'),{status:403});hybrid.setState('approvalPlanInventory',null);return {status:'queued'};}if(typeof id!=='string'||!id.trim()||id.length>200)throw Object.assign(Error('审批标识无效'),{status:400});
  // Unknown instances can be resolved only by an administrator with the full attendance scope.
  const row=db.prepare('select person_id from attendance_approval_plans where id=?').get(id),allowed=new Set(people(user).map(p=>p.personId));
  if(row?.person_id&&!allowed.has(row.person_id)||!row?.person_id&&!user.attendancePlanAll)throw Object.assign(Error('无权刷新该审批'),{status:403});queue(id,'manual_instance');audit(user,'attendance_approval_plan_refresh','attendance',id,'{}');return {status:'queued'};
 }
 function status(){return !enabled?null:{enabled:true,dueEnabled:dueEnabled(),version:hybrid.state('approvalPlanVersion'),coverage:hybrid.state('approvalPlanCoverage')||hybrid.state('approvalPlanSeed'),queue:db.prepare('select count(*) pending,sum(case when error is not null then 1 else 0 end) errors from attendance_approval_plan_queue where generation>applied_generation').get(),due:db.prepare('select status,count(*) count from attendance_approval_plan_due group by status').all()};}
 return {tick,due,decorate,plansFor,request,status,queue,save};
}
