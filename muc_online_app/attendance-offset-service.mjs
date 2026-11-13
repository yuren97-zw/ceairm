import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createOffsetRegister} from './attendance-offset-register.mjs';
import {createActionTaskService} from './action-task-service.mjs';
import {resolveOffsetFacts,accumulatedCoverage,exchangeSeconds,offsetDayLabel} from './attendance-offset-facts.mjs';
import {monthDates,dayOf,classifyDay,plannedShift} from './attendance-rules.mjs';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const nextMonth=month=>{const [y,m]=month.split('-').map(Number);return `${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}`;};
export function hoursToSeconds(value){
 const match=/^(\d+)(?:\.(\d{1,12}))?$/.exec(String(value));
 if(!match)throw fail('小时数格式无效');
 const denominator=10n**BigInt((match[2]||'').length),numerator=BigInt(match[1])*denominator+BigInt(match[2]||0),seconds=numerator*3600n;
 if(seconds%denominator||seconds/denominator>BigInt(Number.MAX_SAFE_INTEGER)||seconds<=0n)throw fail('小时数必须精确对应正整数秒');
 return Number(seconds/denominator);
}
export function createOffsetService({db,clock=Date.now,hasPermission,canViewPerson,loadUser,readDays,writesEnabled=false,existingActionsEnabled=writesEnabled,listPeople=()=>[],allowLegacySettlement=false,listApproverIds=()=>db.prepare("select id from users where status='active'").all().map(r=>r.id)}){
 const register=createOffsetRegister({db,clock});
 db.exec(fs.readFileSync(new URL('./migrations/033_attendance_monthly_exchange.sql',import.meta.url),'utf8'));
 const monthlyRule=sourceMonth=>sourceMonth>='2026-10'?db.prepare('select * from attendance_monthly_exchange_rules where source_month<=? order by source_month desc,created_at desc,id desc').get(sourceMonth):null;
 const allPeople=()=>[...new Set(listPeople())];
 const at=()=>new Date(clock()).toISOString();
 const requirePermission=(user,code)=>{if(!user?.id)throw fail('请先登录',401);if(!hasPermission(user,code))throw fail('当前账号没有权限',403);};
 const existingWritable=()=>{if(!existingActionsEnabled)throw fail('历史申请办理尚未启用',409);};
 const writable=()=>{if(!writesEnabled)throw fail('抵消写操作尚未启用，当前仅可只读核对',409);};
 const audit=(user,action,id,detail)=>db.prepare('insert into attendance_offset_audit values(?,?,?,?,?,?)').run(randomUUID(),user.id,action,id,JSON.stringify(detail),at());
 const bump=()=>{for(const id of ['offsetVersion','ledgerVersion'])db.prepare('insert into attendance_offset_state(id,version) values(?,1) on conflict(id) do update set version=attendance_offset_state.version+1').run(id);};
 const tx=fn=>{db.exec('begin immediate');try{const result=fn();db.exec('commit');return result;}catch(error){db.exec('rollback');throw error;}};
 const op=(user,action,key,body,fn)=>{
  if(!key||typeof key!=='string'||key.length>160)throw fail('缺少有效操作幂等键');
  try{return tx(()=>{requirePermission(user,({submit:'attendance.offset.submit',withdraw:'attendance.offset.submit',decide:'attendance.offset.approve',transfer:'attendance.offset.responsibility.manage',responsibility:'attendance.offset.responsibility.manage',reconcile:'attendance.offset.responsibility.manage',rule:'attendance.offset.rules.manage',issue:'attendance.offset.rules.manage',initialize:'attendance.offset.rules.manage',initial_scope:'attendance.offset.rules.manage',initial_issue:'attendance.offset.rules.manage'})[action]);const digest=hash(body),old=db.prepare('select * from attendance_offset_operations where actor_id=? and action=? and operation_key=?').get(user.id,action,key);
   if(old){if(old.request_hash!==digest)throw fail('相同操作键内容不同',409);return JSON.parse(old.result_json);}
   const result=fn();db.prepare('insert into attendance_offset_operations values(?,?,?,?,?)').run(user.id,action,key,digest,JSON.stringify(result));if(!result.unchanged&&(action!=='reconcile'||result.changed))bump();return result;
  });}catch(error){
   const unique=error.code==='23505'||(Number(error.errcode)&255)===19||/UNIQUE constraint failed/.test(error.message||'');
   if(unique){
    const saved=db.prepare('select request_hash,result_json from attendance_offset_operations where actor_id=? and action=? and operation_key=?').get(user.id,action,key);
    if(saved){if(saved.request_hash!==hash(body))throw fail('相同操作键内容不同',409);return JSON.parse(saved.result_json);}
    throw fail('数据已由其他操作保存，请刷新后重试',409);
   }
   throw error;
  }
 };
 const account=(personId,month)=>db.prepare('select * from attendance_offset_accounts where person_id=? and usage_month=?').get(personId,month);
 const ledger=(personId,month,kind,amount,ref)=>db.prepare('insert into attendance_offset_ledger values(?,?,?,?,?,?,?)').run(randomUUID(),personId,month,kind,amount,ref,at());
 const request=id=>db.prepare('select * from attendance_offset_requests where id=?').get(id);
 const requestForUpdate=id=>db.prepare('select * from attendance_offset_requests where id=?'+(db.kind==='postgres'?' for update':'')).get(id);
 const items=id=>db.prepare('select * from attendance_offset_items where request_id=? order by id').all(id);
 const assigneeAllowed=(user,row)=>!!user&&row.status==='pending'&&row.assignee_user_id===user.id&&row.person_id!==user.personId&&user.status!=='disabled'&&hasPermission(user,'attendance.offset.approve');
 const tasks=createActionTaskService({db,clock,selectVisible:user=>hasPermission(user,'attendance.offset.approve')?db.prepare("select t.* from action_tasks t join attendance_offset_requests r on r.id=t.source_id where t.source_module='attendance' and t.source_type='offset_approval' and t.status='pending' and r.status='pending' and t.assignee_user_id=? and r.assignee_user_id=? and r.person_id<>? order by t.created_at desc,t.id desc").all(user.id,user.id,user.personId||''):[],canAct:(user,task)=>{const row=request(task.source_id);return !!row&&assigneeAllowed(user,row);}});
 function adjust(personId,month,kind,itemId){
  const expressions={freeze:'frozen=frozen+1',approve:'frozen=frozen-1,used=used+1',release:'frozen=frozen-1',refund:'used=used-1'};
  const conditions={freeze:"status='issued' and granted-used-frozen>=1",approve:"frozen>=1 and status='issued'",release:'frozen>=1',refund:'used>=1'};
  const result=db.prepare(`update attendance_offset_accounts set ${expressions[kind]},version=version+1 where person_id=? and usage_month=? and ${conditions[kind]}`).run(personId,month);
  if(!result.changes)throw fail('额度不足或账本状态冲突',409);
  ledger(personId,month,kind,1,itemId);
 }
 function verifyLeader(row,employee){
  const leader=loadUser(row?.assignee_user_id);
  if(!row||!leader||leader.status==='disabled'||leader.personId!==row.leader_person_id||leader.personId===employee||!hasPermission(leader,'attendance.offset.approve'))throw fail('当班负责人或授权待核实',409);
  return leader;
 }
 function sourceItem(event){
  const days=readDays(event.person_id,event.work_date,event.work_date,{lock:true}),day=days.find(d=>d.date===event.work_date);
  if(!day)return {status:'unresolved'};
  const facts=resolveOffsetFacts(event.person_id,day.input,{now:clock(),sourceReadAt:day.sourceReadAt});
  if(facts.eligibility==='unresolved')return {status:'unresolved'};
  const current=facts.items.find(i=>i.eventId===event.id);
  return current?{status:'active',...current}:{status:'invalid'};
 }
 function reconcileClaim(item,event,source,actor){
  const req=requestForUpdate(item.request_id);
  item=db.prepare('select * from attendance_offset_items where id=?').get(item.id);
  source=sourceItem(event);
  if(source.status==='active'&&item.decision==='pending'&&(source.evidenceHash!==item.evidence_hash||event.revision!==item.event_revision)){
   audit(actor,'source_evidence_changed',req.id,{itemId:item.id,beforeRevision:item.event_revision,afterRevision:event.revision,beforeHash:item.evidence_hash,afterHash:source.evidenceHash});
   db.prepare('update attendance_offset_items set evidence_hash=?,event_revision=? where id=?').run(source.evidenceHash,event.revision,item.id);
   db.prepare('update attendance_offset_requests set version=version+1,updated_at=? where id=?').run(at(),req.id);return true;
  }
  if(source.status!=='invalid')return false;
  if(item.decision==='pending')adjust(req.person_id,req.usage_month,'release',item.id);
  else if(item.decision==='approved'&&item.effective)adjust(req.person_id,req.usage_month,'refund',item.id);
  else return false;
  audit(actor,'source_invalidated',req.id,{itemId:item.id,eventId:event.id,workDate:event.work_date,usageMonth:req.usage_month,ledgerAction:item.decision==='pending'?'release':'refund',previousDecision:item.decision});
  db.prepare("update attendance_offset_items set decision=case when decision='pending' then 'source_invalid' else decision end,effective=0 where id=?").run(item.id);
  db.prepare('delete from attendance_offset_claims where item_id=?').run(item.id);
  db.prepare('update attendance_offset_requests set version=version+1,updated_at=? where id=?').run(at(),req.id);
  if(!items(req.id).some(i=>i.decision==='pending')&&req.status==='pending'){
   db.prepare("update attendance_offset_requests set status='source_invalid' where id=?").run(req.id);tasks.close(req.id,'invalidated');
  }
  return true;
 }
 function ruleValues(user,body){
  const seconds=hoursToSeconds(body.hours);
  if(seconds>2147483647||body.count>2147483647||body.cap>2147483647)throw fail('参数超出当前数据库整数范围');
  if(!Number.isSafeInteger(body.count)||body.count<=0||!Number.isSafeInteger(body.cap)||body.cap<0||!Array.isArray(body.personIds)||!body.personIds.length||new Set(body.personIds).size!==body.personIds.length||body.personIds.some(id=>typeof id!=='string'||!canViewPerson(user,id)))throw fail('次数、上限或人员范围无效');
  return {threshold_seconds:seconds,unit_count:body.count,monthly_cap:body.cap,people_json:JSON.stringify([...body.personIds].sort())};
 }
 function fixedInitialization(){
  const row=db.prepare("select * from attendance_offset_audit where action='initialize_fixed' order by created_at limit 1").get();if(!row)return null;
  const config=JSON.parse(row.detail_json),additions=db.prepare("select detail_json from attendance_offset_audit where action='initialize_fixed_scope_add' and reference_id=? order by created_at,id").all(row.reference_id).map(r=>JSON.parse(r.detail_json));
  return {...row,config:{...config,personIds:[...new Set([...config.personIds,...additions.filter(r=>r.usageMonth===config.usageMonth&&r.fixedCount===2).flatMap(r=>r.personIds)])].sort()}};
 }
 function legacyInitialization(){const row=db.prepare("select * from attendance_offset_audit where action='initialize' order by created_at limit 1").get();return row?{...row,config:JSON.parse(row.detail_json)}:null;}
 function initializationProgress(user){
  const fixed=fixedInitialization(),legacy=legacyInitialization(),row=fixed||legacy;if(!row)return {status:'not_configured'};
  const saved=row.config,people=saved.personIds.filter(id=>canViewPerson(user,id));
  return {status:fixed?'configured':'requires_fixed_revision',mode:fixed?'fixed_initial':'legacy_earned',fixedCount:fixed?2:null,sourceMonth:saved.sourceMonth,usageMonth:saved.usageMonth,configuredAt:row.created_at,total:people.length,personIds:people,people:people.map(personId=>{const a=account(personId,saved.usageMonth);return {personId,status:a?.status||(fixed?'queued':'requires_fixed_revision'),granted:a?.granted??null,coverage:null};})};
 }

 return {
  tasks,register,
  routingIssues(user){
   requirePermission(user,'attendance.offset.responsibility.manage');
   return db.prepare("select id,person_id,assignee_user_id,version,created_at,status from attendance_offset_requests where status='pending' order by created_at,id").all().filter(row=>canViewPerson(user,row.person_id)&&!assigneeAllowed(loadUser(row.assignee_user_id),row)).map(row=>({...row,reason:'原受派账号不可用、无审批权限或存在本人审批冲突；需要明确授权转办'}));
  },
  approvalCandidates(user){
   requirePermission(user,'attendance.offset.submit');
   if(!user.personId)throw fail('账号尚未绑定人员',409);
   const date=dayOf(clock());
   const shiftFor=personId=>{const input=readDays(personId,date,date).find(d=>d?.date===date)?.input;return input?.covered&&!input.rest&&!input.scheduleConflict&&!input.identityIssue?plannedShift(input.points):null;};
   const shift=shiftFor(user.personId);
   const candidates=listApproverIds().map(id=>loadUser(id)).filter(u=>u&&u.status!=='disabled'&&u.id!==user.id&&u.personId!==user.personId&&hasPermission(u,'attendance.offset.approve')).map(u=>({id:u.id,personId:u.personId,name:u.name,employeeNo:u.employeeNo,recommended:!!shift&&!!u.personId&&u.position==='班组长'&&shiftFor(u.personId)===shift}));
   candidates.sort((a,b)=>Number(b.recommended)-Number(a.recommended)||String(a.name).localeCompare(String(b.name),'zh-CN'));
   const recommended=candidates.filter(c=>c.recommended);
   return {date,shift,candidates,defaultUserId:recommended.length===1?recommended[0].id:null};
  },
  saveMonthlyRule(user,body,key){
   requirePermission(user,'attendance.offset.rules.manage');writable();
   const seconds=hoursToSeconds(body.hours);
   if(seconds>2147483647||!Number.isSafeInteger(body.count)||body.count<1||body.count>2147483647||!Number.isSafeInteger(body.cap)||body.cap<0||body.cap>2147483647)throw fail('次数或月上限无效');
   return op(user,'rule',key,body,()=>{
    const previous=db.prepare('select * from attendance_monthly_exchange_rules order by source_month desc,created_at desc,id desc').get();
    if(previous&&previous.threshold_seconds===seconds&&previous.unit_count===body.count&&previous.monthly_cap===body.cap)return {id:previous.id,sourceMonth:previous.source_month,usageMonth:nextMonth(previous.source_month),unchanged:true};
    const current=dayOf(clock()).slice(0,7),sourceMonth=previous?(current<'2026-10'?'2026-10':current):'2026-10';
    const id='monthly:'+randomUUID();
    db.prepare('insert into attendance_monthly_exchange_rules values(?,?,?,?,?,?,?)').run(id,sourceMonth,seconds,body.count,body.cap,user.id,new Date(Math.max(clock(),Date.parse(previous?.created_at||'1970-01-01')+1)).toISOString());
    audit(user,'monthly_rule',id,{...body,sourceMonth,usageMonth:nextMonth(sourceMonth),scope:'all'});
    return {id,sourceMonth,usageMonth:nextMonth(sourceMonth)};
   });
  },
  exchangeRuleForSource(user,sourceMonth){
   requirePermission(user,'attendance.read');monthDates(sourceMonth);
   const rule=monthlyRule(sourceMonth);
   return rule?{sourceMonth,usageMonth:nextMonth(sourceMonth),hours:rule.threshold_seconds/3600,count:rule.unit_count,cap:rule.monthly_cap}:null;
  },
  monthlyRules(user){requirePermission(user,'attendance.offset.rules.manage');return db.prepare('select * from attendance_monthly_exchange_rules order by source_month desc,created_at desc,id desc').all();},
  responsibilityCandidates(user){
   requirePermission(user,'attendance.offset.responsibility.manage');
   return db.prepare("select id from users where status='active' and person_id is not null").all().map(row=>loadUser(row.id)).filter(u=>u&&canViewPerson(user,u.personId)&&hasPermission(u,'attendance.offset.approve')).map(({id,personId,name,employeeNo})=>({id,personId,name,employeeNo}));
  },
  state(user){
   requirePermission(user,'attendance.offset.rules.manage');
   const currentMonth=dayOf(clock()).slice(0,7),people=allPeople(),months=[];
   for(let month='2026-10';month<currentMonth;month=nextMonth(month))if(monthlyRule(month))months.push(month);
   const accounts=db.prepare('select person_id,usage_month,status from attendance_offset_accounts').all();
   const assessments=db.prepare('select person_id,source_month,status from attendance_offset_assessments').all();
   const done=new Set(accounts.map(r=>r.person_id+'|'+r.usage_month)),checked=new Set(assessments.map(r=>r.person_id+'|'+nextMonth(r.source_month)));
   const queuedAccounts=months.reduce((n,month)=>n+people.filter(id=>!done.has(id+'|'+nextMonth(month))&&!checked.has(id+'|'+nextMonth(month))).length,0);
   const sourceDate=new Date(currentMonth+'-01T00:00:00Z');sourceDate.setUTCMonth(sourceDate.getUTCMonth()-1);const currentSourceMonth=sourceDate.toISOString().slice(0,7),activeRule=monthlyRule(currentSourceMonth);
   return {writesEnabled,existingActionsEnabled,initialization:initializationProgress(user),currentMonth,currentSourceMonth,activeRule,queuedAccounts,issuedAccounts:accounts.filter(r=>r.status==='issued').length,pendingAccounts:assessments.filter(r=>r.source_month>='2026-10'&&['pending_review','not_closed'].includes(r.status)&&!done.has(r.person_id+'|'+nextMonth(r.source_month))).length,dirtyRanges:Number(db.prepare('select count(*) as n from attendance_offset_dirty where generation>processed_generation').get().n),differenceAccounts:accounts.filter(r=>r.status==='difference_review').length,...this.versions()};
  },
  repairTasks(systemUser){
   requirePermission(systemUser,'attendance.offset.responsibility.manage');
   if(!writesEnabled&&!existingActionsEnabled)return {disabled:true};
   return tx(()=>{
    const staleRecipients=db.prepare("select distinct assignee_user_id from action_tasks where source_module='attendance' and source_type='offset_approval' and status='pending' and not exists(select 1 from attendance_offset_requests r where r.id=action_tasks.source_id and r.status='pending' and r.assignee_user_id=action_tasks.assignee_user_id)").all();
    const stale=db.prepare("update action_tasks set status='invalidated',updated_at=? where source_module='attendance' and source_type='offset_approval' and status='pending' and not exists(select 1 from attendance_offset_requests r where r.id=action_tasks.source_id and r.status='pending' and r.assignee_user_id=action_tasks.assignee_user_id)").run(at());
    if(Number(stale.changes))tasks.touchRecipients(staleRecipients.map(row=>row.assignee_user_id));
    const missing=db.prepare("select r.* from attendance_offset_requests r where r.status='pending' and not exists(select 1 from action_tasks t where t.source_module='attendance' and t.source_type='offset_approval' and t.source_id=r.id and t.assignee_user_id=r.assignee_user_id and t.status='pending') order by r.created_at,r.id limit 50").all();
    let restored=0;
    for(const row of missing){
     const current=requestForUpdate(row.id);if(!current||current.status!=='pending')continue;
     db.prepare("update action_tasks set status='invalidated',updated_at=? where source_module='attendance' and source_type='offset_approval' and source_id=? and assignee_user_id=? and status in ('completed','cancelled')").run(at(),current.id,current.assignee_user_id);
     const actor=db.prepare("select actor_id from attendance_offset_audit where action='submit' and reference_id=? order by created_at,id limit 1").get(row.id);
     const name=actor?loadUser(actor.actor_id)?.name:null;
     tasks.upsert({sourceModule:'attendance',sourceType:'offset_approval',sourceId:current.id,assigneeUserId:current.assignee_user_id,title:`考勤 · 抵消审批 · ${name||'员工'} · ${JSON.parse(current.responsibility_json).work_date||''}`,createdAt:current.created_at});restored++;
    }
    return {invalidated:Number(stale.changes),restored};
   });
  },
  settleDue(systemUser){
   if(!writesEnabled)return {disabled:true};
   const monthly=!!monthlyRule('9999-12');if(!monthly&&!allowLegacySettlement)return {processed:0,status:'not_configured'};const fixed=monthly?null:fixedInitialization();let fixedProcessed=0;if(fixed)for(const personId of fixed.config.personIds.filter(id=>!account(id,fixed.config.usageMonth)).slice(0,50)){this.issueInitialFixed(systemUser,personId,'initial-fixed:'+fixed.id+':'+personId);fixedProcessed++;}
   const legacy=legacyInitialization();
   let rules=db.prepare('select * from attendance_offset_rules where source_month<? order by source_month').all(dayOf(clock()).slice(0,7)).filter(r=>r.id!==legacy?.reference_id);
   if(monthly){rules=[];for(let month='2026-10';month<dayOf(clock()).slice(0,7);month=nextMonth(month)){const rule=monthlyRule(month);if(rule)rules.push({...rule,source_month:month,people_json:JSON.stringify(allPeople())});}}
   if(monthly){for(const old of db.prepare("select * from attendance_offset_accounts where usage_month>='2026-11' and status<>'difference_review'").all()){const source=new Date(old.usage_month+'-01T00:00:00Z');source.setUTCMonth(source.getUTCMonth()-1);const rule=monthlyRule(source.toISOString().slice(0,7));if(rule&&old.rule_id!==rule.id){tx(()=>{db.prepare("update attendance_offset_accounts set status='difference_review',version=version+1 where person_id=? and usage_month=?").run(old.person_id,old.usage_month);audit(systemUser,'monthly_policy_difference',old.person_id,{usageMonth:old.usage_month,previousRuleId:old.rule_id,ruleId:rule.id});bump();});}}}
   const existing=new Set(db.prepare('select person_id,usage_month from attendance_offset_accounts').all().map(r=>r.person_id+'|'+r.usage_month));
   const assessments=new Map(db.prepare('select person_id,source_month,checked_at from attendance_offset_assessments').all().map(r=>[r.person_id+'|'+r.source_month,r.checked_at]));
   const jobs=rules.flatMap(rule=>JSON.parse(rule.people_json).map(personId=>({personId,sourceMonth:rule.source_month,checkedAt:assessments.get(personId+'|'+rule.source_month)||''}))).filter(j=>!existing.has(j.personId+'|'+nextMonth(j.sourceMonth))&&(!j.checkedAt||clock()-Date.parse(j.checkedAt)>=300000)).sort((a,b)=>a.checkedAt.localeCompare(b.checkedAt)).slice(0,5);
   let processed=0;
   for(const job of jobs){
    const trial=this.trial(systemUser,job);
    if(trial.status==='ready'){this.issue(systemUser,{personId:job.personId,sourceMonth:job.sourceMonth},`auto:${monthly?monthlyRule(job.sourceMonth).id+':':''}${job.personId}:${job.sourceMonth}`);processed++;}
    else db.prepare('insert into attendance_offset_assessments values(?,?,?,?,?,?,?) on conflict(person_id,source_month) do update set status=excluded.status,coverage_json=excluded.coverage_json,source_seconds=excluded.source_seconds,source_version=excluded.source_version,checked_at=excluded.checked_at').run(job.personId,job.sourceMonth,trial.status,JSON.stringify(trial.coverage),trial.coverage.seconds,trial.sourceVersion,at());
   }
   return {processed:processed+fixedProcessed,assessed:jobs.length};
  },
  markDirty(personId,date){db.prepare('insert into attendance_offset_dirty(person_id,work_date,generation) values(?,?,1) on conflict(person_id,work_date) do update set generation=attendance_offset_dirty.generation+1').run(personId,date);},
  drain(systemUser){
   if(!writesEnabled&&!existingActionsEnabled)return {disabled:true};
   const dirty=db.prepare('select * from attendance_offset_dirty where generation>processed_generation order by work_date,person_id limit 5').all();
   for(const row of dirty){
    this.reconcile(systemUser,row.person_id,row.work_date,`source:${row.person_id}:${row.work_date}:${row.generation}`);
    const credited=db.prepare('select usage_month,rule_id from attendance_offset_accounts where person_id=? and source_month=?').get(row.person_id,row.work_date.slice(0,7));
    if(credited&&writesEnabled&&!credited.rule_id.startsWith('initial-fixed:'))this.issue(systemUser,{personId:row.person_id,sourceMonth:row.work_date.slice(0,7)},`difference:${row.person_id}:${row.work_date}:${row.generation}`);
    db.prepare('update attendance_offset_dirty set processed_generation=generation where person_id=? and work_date=? and generation=?').run(row.person_id,row.work_date,row.generation);
   }
   return {processed:dirty.length};
  },
  effectiveMissingDates(user,month){
   if(!user?.id)throw fail('请先登录',401);const dates=monthDates(month);if(!user.personId)return [];
   return db.prepare("select distinct e.work_date from attendance_offset_events e join attendance_offset_claims c on c.event_id=e.id join attendance_offset_items i on i.id=c.item_id where e.person_id=? and e.work_date>=? and e.work_date<=? and e.kind='day_off_missing' and e.active=1 and i.decision='approved' and i.effective=1 order by e.work_date").all(user.personId,dates[0],dates.at(-1)).map(r=>r.work_date);
  },
  effectiveExceptionDates(user,month){
   if(!user?.id)throw fail('请先登录',401);const dates=monthDates(month);if(!user.personId)return [];
   return db.prepare("select distinct e.work_date from attendance_offset_events e join attendance_offset_claims c on c.event_id=e.id join attendance_offset_items i on i.id=c.item_id where e.person_id=? and e.work_date>=? and e.work_date<=? and e.active=1 and i.decision='approved' and i.effective=1 order by e.work_date").all(user.personId,dates[0],dates.at(-1)).map(r=>r.work_date);
  },
  decorate(data){
   const people=data.people||[];if(!people.length)return {...data,offsetWritesEnabled:writesEnabled,...this.versions()};
   const marks=people.map(()=>'?').join(',');
   const historyRows=db.prepare(`select e.*,case when c.item_id=i.id then 1 else 0 end as is_claim,r.created_at as request_created,i.decision,i.effective,i.request_id,i.decided_at,r.status as request_status,coalesce(sp.name,su.name) as assignee_name,coalesce(ap.name,au.name) as approver_name,sd.result_json as day_result from attendance_offset_events e left join attendance_days sd on sd.person_id=e.person_id and sd.work_date=e.work_date left join attendance_offset_claims c on c.event_id=e.id left join attendance_offset_items i on i.event_id=e.id left join attendance_offset_requests r on r.id=i.request_id left join users su on su.id=r.assignee_user_id left join personnel sp on sp.id=su.person_id left join users au on au.id=i.decided_by left join personnel ap on ap.id=au.person_id where e.person_id in (${marks}) and e.work_date>=? and e.work_date<=?`).all(...people.map(p=>p.personId),data.dates[0],data.dates.at(-1));
   const grouped=new Map();for(const row of historyRows){if(!grouped.has(row.id))grouped.set(row.id,[]);grouped.get(row.id).push(row);}
   const rows=[...grouped.values()].map(items=>{const claimed=items.find(i=>i.is_claim);if(claimed)return claimed;items.sort((a,b)=>String(b.request_created||'').localeCompare(String(a.request_created||'')));const latest=items[0];return latest.request_id&&items.filter(i=>i.request_created===latest.request_created&&i.request_id).length>1?{...latest,decision:null,effective:0,request_status:'ambiguous',approver_name:null,assignee_name:null}:latest;});
   return {...data,offsetWritesEnabled:writesEnabled,...this.versions(),people:people.map(p=>({...p,offsetCounts:Object.fromEntries(['缺卡','早退'].map(category=>[category,rows.filter(r=>r.person_id===p.personId&&r.decision==='approved'&&r.effective&&r.active&&r.kind===(category==='缺卡'?'day_off_missing':'day_off_early')&&((p.days||[]).some(d=>d.date===r.work_date&&d.category===category)||!p.days&&JSON.parse(r.day_result||'{}').category===category)).length])),offsetTotal:rows.filter(r=>r.person_id===p.personId&&r.decision==='approved'&&r.effective&&r.active).length,...(p.days?{days:p.days.map(d=>{
    const relevant=rows.filter(r=>r.person_id===p.personId&&r.work_date===d.date&&(r.active||r.request_id));
    const approved=relevant.filter(r=>r.active&&r.decision==='approved'&&r.effective).length,pending=relevant.filter(r=>r.active&&r.decision==='pending'&&r.request_status==='pending').length;
    return {...d,offset:{approved,pending,label:offsetDayLabel(d,{approved,pending,eligibleCount:relevant.filter(r=>r.active).length}),items:relevant.map(r=>({eventId:r.id,type:r.kind,requestId:r.request_id,decision:r.decision,effective:r.effective,approverName:r.approver_name,decidedAt:r.decided_at,assigneeName:r.assignee_name,requestStatus:r.request_status,active:r.active,planned:r.planned}))}};
   })}:{} )}))};
  },
  transfer(user,id,body,key){
   requirePermission(user,'attendance.offset.responsibility.manage');existingWritable();
   return op(user,'transfer',key,{id,...body},()=>{
    const row=requestForUpdate(id);if(!row||!canViewPerson(user,row.person_id))throw fail('无权转办',403);
    if(row.status!=='pending'||row.version!==body.version||!body.reason?.trim())throw fail('申请已变化或缺少转办依据',409);
    const leader=loadUser(body.assigneeUserId);verifyLeader({assignee_user_id:body.assigneeUserId,leader_person_id:leader?.personId},row.person_id);
    const result=db.prepare('update attendance_offset_requests set assignee_user_id=?,version=version+1,updated_at=? where id=? and version=?').run(leader.id,at(),id,body.version);
    if(!result.changes)throw fail('申请已变化',409);
    tasks.close(id,'invalidated');tasks.upsert({sourceModule:'attendance',sourceType:'offset_approval',sourceId:id,assigneeUserId:leader.id,title:db.prepare('select title from action_tasks where source_id=? order by created_at desc limit 1').get(id)?.title||'考勤抵消审批'});
    audit(user,'transfer',id,{from:row.assignee_user_id,to:leader.id,reason:body.reason});return {id,assigneeUserId:leader.id};
   });
  },
  ownRequests(user,{month=dayOf(clock()).slice(0,7),limit=20,cursor=null}={}){
   if(!user?.id)throw fail('请先登录',401);monthDates(month);
   if(!Number.isInteger(limit)||limit<1||limit>100)throw fail('分页参数无效');
   if(!user.personId)return {items:[],count:0,nextCursor:null};
   const params=[user.personId,month];let condition='';
   if(cursor){const point=db.prepare('select id,created_at from attendance_offset_requests where id=? and person_id=? and usage_month=?').get(cursor,user.personId,month);if(!point)throw fail('列表已变化，请刷新',409);condition=' and (created_at<? or (created_at=? and id<?))';params.push(point.created_at,point.created_at,point.id);}
   const rows=db.prepare('select id,status,version,created_at from attendance_offset_requests where person_id=? and usage_month=?'+condition+' order by created_at desc,id desc limit ?').all(...params,limit+1);
   const count=Number(db.prepare('select count(*) n from attendance_offset_requests where person_id=? and usage_month=?').get(user.personId,month).n);
   const result=rows.slice(0,limit);return {items:result,count,nextCursor:rows.length>limit?result.at(-1).id:null};
  },

  versions(){return Object.fromEntries(db.prepare('select id,version from attendance_offset_state order by id').all().map(r=>[r.id,r.version]));},
  confirmResponsibility(user,body,key){
   requirePermission(user,'attendance.offset.responsibility.manage');writable();
   if(!canViewPerson(user,body.personId)||!body.team?.trim()||!body.evidence?.trim()||body.evidence.length>4000)throw fail('责任核实范围或证据无效',403);
   monthDates(String(body.workDate).slice(0,7));if(!monthDates(body.workDate.slice(0,7)).includes(body.workDate))throw fail('日期无效');
   verifyLeader({assignee_user_id:body.assigneeUserId,leader_person_id:body.leaderPersonId},body.personId);
   return op(user,'responsibility',key,body,()=>{
    const old=register.responsibility(body.personId,body.workDate);if(old.status==='verified'&&old.assignee_user_id!==body.assigneeUserId&&db.prepare("select r.id from attendance_offset_requests r join attendance_offset_items i on i.request_id=r.id join attendance_offset_events e on e.id=i.event_id where r.person_id=? and e.work_date=? and r.status='pending'").get(body.personId,body.workDate))throw fail('存在待审申请，请先明确转办，不可覆盖责任',409);if(old.status==='verified'&&old.version!==body.version)throw fail('责任记录已变化',409);
    const row={id:old.id||randomUUID(),personId:body.personId,date:body.workDate,team:body.team,leader:body.leaderPersonId,assignee:body.assigneeUserId};
    db.prepare('insert into attendance_shift_responsibilities values(?,?,?,?,?,?,?,?,?,1) on conflict(person_id,work_date) do update set team=excluded.team,leader_person_id=excluded.leader_person_id,assignee_user_id=excluded.assignee_user_id,evidence=excluded.evidence,confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,version=attendance_shift_responsibilities.version+1').run(row.id,row.personId,row.date,row.team,row.leader,row.assignee,body.evidence,user.id,at());
    audit(user,'responsibility',row.id,{before:old,after:body});return register.responsibility(body.personId,body.workDate);
   });
  },
  initializationPreview(user,body){
   requirePermission(user,'attendance.offset.rules.manage');const usageMonth=dayOf(clock()).slice(0,7);
   if(body.sourceMonth!==undefined||body.usageMonth&&body.usageMonth!==usageMonth||body.count!==undefined&&body.count!==2||body.hours!==undefined||body.cap!==undefined)throw fail('首期固定每人2次，不按累计换算');
   if(!Array.isArray(body.personIds)||!body.personIds.length||new Set(body.personIds).size!==body.personIds.length||body.personIds.some(id=>typeof id!=='string'||!canViewPerson(user,id)))throw fail('人员范围无效',403);
   const personIds=[...body.personIds].sort(),legacy=legacyInitialization(),fixed=fixedInitialization();
   const data={mode:'fixed_initial',fixedCount:2,sourceMonth:usageMonth,usageMonth,personIds,legacyRuleId:legacy?.reference_id||null,people:personIds.map(personId=>({personId,status:'ready',earned:2,coverage:null,existingAccount:!!account(personId,usageMonth)}))};return {...data,previewHash:hash(data),alreadyInitialized:!!fixed};
  },
  initializationConfirm(user,body,key){
   requirePermission(user,'attendance.offset.rules.manage');writable();if(typeof body.previewHash!=='string'||!body.previewHash)throw fail('请先预览首期固定额度');
   return op(user,'initialize',key,body,()=>{
    if(db.kind==='postgres')db.prepare('select pg_advisory_xact_lock(?)').get(864031032);
    const preview=this.initializationPreview(user,body);
    if(preview.alreadyInitialized)throw fail('首期固定额度已确认，不能重复初始化',409);
    if(preview.previewHash!==body.previewHash)throw fail('预览范围或月份已变化，请重新预览',409);
    if(preview.people.some(p=>p.existingAccount)||preview.legacyRuleId&&db.prepare('select person_id from attendance_offset_accounts where rule_id=? limit 1').get(preview.legacyRuleId))throw fail('已存在额度账户，须核对后处理，禁止覆盖',409);
    const id=randomUUID();audit(user,'initialize_fixed',id,{mode:'fixed_initial',fixedCount:2,sourceMonth:preview.usageMonth,usageMonth:preview.usageMonth,personIds:preview.personIds,legacyRuleId:preview.legacyRuleId,previewHash:preview.previewHash,policy:'首期固定2次，不依据累计时间；保留旧首期确认，不复用旧换算规则'});
    return {id,status:'queued',mode:'fixed_initial',fixedCount:2,usageMonth:preview.usageMonth,total:preview.personIds.length};
   });
  },
  supplementInitialFixed(user,body,key){
   requirePermission(user,'attendance.offset.rules.manage');writable();
   if(!Array.isArray(body.personIds)||!body.personIds.length||new Set(body.personIds).size!==body.personIds.length||body.personIds.some(id=>typeof id!=='string'||!canViewPerson(user,id))||!body.reason?.trim()||body.reason.length>4000)throw fail('补充范围或依据无效',403);
   return op(user,'initial_scope',key,body,()=>{
    if(db.kind==='postgres')db.prepare('select pg_advisory_xact_lock(?)').get(864031032);
    const initial=fixedInitialization();if(!initial||initial.config.usageMonth!==dayOf(clock()).slice(0,7))throw fail('仅可补充当前首期月份的固定2次范围',409);
    const added=body.personIds.filter(id=>!initial.config.personIds.includes(id));if(!added.length)return {unchanged:true,added:0};
    if(added.some(id=>account(id,initial.config.usageMonth)))throw fail('已有额度账户，禁止覆盖或叠加',409);
    audit(user,'initialize_fixed_scope_add',initial.reference_id,{usageMonth:initial.config.usageMonth,fixedCount:2,personIds:[...added].sort(),reason:body.reason});
    return {status:'queued',added:added.length,usageMonth:initial.config.usageMonth,fixedCount:2};
   });
  },
  issueInitialFixed(user,personId,key){
   requirePermission(user,'attendance.offset.rules.manage');writable();return op(user,'initial_issue',key,{personId},()=>{
    const initial=fixedInitialization();if(!initial||!initial.config.personIds.includes(personId)||!canViewPerson(user,personId))throw fail('人员不在已确认首期范围',403);
    const month=initial.config.usageMonth,marker='initial-fixed:'+initial.reference_id,old=account(personId,month);if(old){if(old.rule_id!==marker)throw fail('已有其他额度，禁止覆盖',409);return {status:old.status,unchanged:true};}
    db.prepare("insert into attendance_offset_accounts(person_id,usage_month,source_month,rule_id,source_seconds,source_version,status,granted) values(?,?,?,?,0,?,'issued',2)").run(personId,month,month,marker,initial.config.previewHash);
    ledger(personId,month,'grant',2,personId+'|'+month);audit(user,'issue_initial_fixed',personId,{usageMonth:month,granted:2,initializationId:initial.reference_id});return {status:'issued',granted:2,sourceKind:'initial_fixed'};
   });
  },
  saveRule(user,body,key){
   requirePermission(user,'attendance.offset.rules.manage');writable();
   monthDates(body.sourceMonth);if(body.sourceMonth<=dayOf(clock()).slice(0,7))throw fail('规则只能从未来来源月生效');
   const values=ruleValues(user,body),seconds=values.threshold_seconds;
   return op(user,'rule',key,body,()=>{if(db.prepare('select id from attendance_offset_rules where source_month=?').get(body.sourceMonth))throw fail('该来源月规则已保存，禁止覆盖版本',409);
    const id=randomUUID();db.prepare('insert into attendance_offset_rules values(?,?,?,?,?,?,?,?)').run(id,body.sourceMonth,seconds,body.count,body.cap,JSON.stringify(body.personIds),user.id,at());audit(user,'rule',id,body);return {id,thresholdSeconds:seconds};
   });
  },
  trial(user,{personId,sourceMonth},{lock=false,ruleOverride=null}={}){
   requirePermission(user,'attendance.offset.rules.manage');if(!canViewPerson(user,personId))throw fail('人员不在数据范围',403);
   const dates=monthDates(sourceMonth),days=readDays(personId,dates[0],dates.at(-1),{lock});
   const coverage=accumulatedCoverage(days,clock(),{expectedDates:dates});
   const rule=ruleOverride||monthlyRule(sourceMonth)||db.prepare('select * from attendance_offset_rules where source_month=?').get(sourceMonth);
   const applicable=rule&&(rule.id.startsWith('monthly:')||JSON.parse(rule.people_json).includes(personId));
   return {personId,sourceMonth,usageMonth:nextMonth(sourceMonth),coverage,ruleId:applicable?rule.id:null,sourceVersion:hash({facts:days.map(d=>[d.date,d.sourceRevision||hash(d.input)]),coverage}),earned:applicable?exchangeSeconds(coverage.seconds,rule.threshold_seconds,rule.unit_count,rule.monthly_cap):null,status:!applicable?'not_configured':sourceMonth>=dayOf(clock()).slice(0,7)?'not_closed':coverage.status==='complete'?'ready':'pending_review'};
  },
  issue(user,body,key){
   requirePermission(user,'attendance.offset.rules.manage');writable();
   return op(user,'issue',key,body,()=>{
    const legacy=legacyInitialization();if(!monthlyRule(body.sourceMonth)&&legacy?.config.sourceMonth===body.sourceMonth)throw fail('旧首期换算规则已停用，首期改为固定2次',409);
    const trial=this.trial(user,body,{lock:true});
    const old=account(body.personId,trial.usageMonth);
    if(!old&&trial.status==='ready'){
     const initial=db.prepare("select reference_id,detail_json from attendance_offset_audit where action='initialize' limit 1").get();
     const expected=initial&&initial.reference_id===trial.ruleId?JSON.parse(initial.detail_json).sourceVersions.find(p=>p.personId===body.personId):null;
     if(expected?.status==='ready'&&expected.sourceVersion!==trial.sourceVersion){db.prepare('insert into attendance_offset_assessments values(?,?,?,?,?,?,?) on conflict(person_id,source_month) do update set status=excluded.status,coverage_json=excluded.coverage_json,source_seconds=excluded.source_seconds,source_version=excluded.source_version,checked_at=excluded.checked_at').run(body.personId,body.sourceMonth,'difference_review',JSON.stringify(trial.coverage),trial.coverage.seconds,trial.sourceVersion,at());return {status:'difference_review',granted:null};}
    }
    if(!old&&trial.status!=='ready'){
     db.prepare('insert into attendance_offset_assessments values(?,?,?,?,?,?,?) on conflict(person_id,source_month) do update set status=excluded.status,coverage_json=excluded.coverage_json,source_seconds=excluded.source_seconds,source_version=excluded.source_version,checked_at=excluded.checked_at').run(body.personId,body.sourceMonth,trial.status,JSON.stringify(trial.coverage),trial.coverage.seconds,trial.sourceVersion,at());
     return {status:trial.status,coverage:trial.coverage,granted:null};
    }
    if(old){if(old.source_version!==trial.sourceVersion||old.rule_id!==trial.ruleId){db.prepare("update attendance_offset_accounts set status='difference_review',version=version+1 where person_id=? and usage_month=?").run(body.personId,trial.usageMonth);audit(user,'settlement_difference',body.personId,{sourceMonth:body.sourceMonth,previousSourceVersion:old.source_version,currentSourceVersion:trial.sourceVersion,previousGranted:old.granted,trialGranted:trial.earned});return {status:'difference_review'};}return {status:old.status,unchanged:true};}
    db.prepare("insert into attendance_offset_accounts(person_id,usage_month,source_month,rule_id,source_seconds,source_version,status,granted) values(?,?,?,?,?,?,'issued',?)").run(body.personId,trial.usageMonth,body.sourceMonth,trial.ruleId,trial.coverage.seconds,trial.sourceVersion,trial.earned);
    db.prepare('delete from attendance_offset_assessments where person_id=? and source_month=?').run(body.personId,body.sourceMonth);
    ledger(body.personId,trial.usageMonth,'grant',trial.earned,body.personId+'|'+trial.usageMonth);audit(user,'issue',body.personId,trial);return {status:'issued',granted:trial.earned};
   });
  },
  balance(user,month=dayOf(clock()).slice(0,7)){
   if(!user?.id)throw fail('请先登录',401);monthDates(month);
   if(!user.personId)return {status:'identity_unbound',available:null};
   const value=account(user.personId,month);
   const previous=new Date(month+'-01T00:00:00Z');previous.setUTCMonth(previous.getUTCMonth()-1);
   const assessment=!value?db.prepare('select status,coverage_json,checked_at from attendance_offset_assessments where person_id=? and source_month=?').get(user.personId,previous.toISOString().slice(0,7)):null;
   const globalRule=monthlyRule(previous.toISOString().slice(0,7));
   const configured=!value&&!assessment?db.prepare('select people_json from attendance_offset_rules where source_month=?').get(previous.toISOString().slice(0,7)):null;
   return value?{...value,sourceKind:value.rule_id.startsWith('initial-fixed:')?'initial_fixed':'earned',available:month===dayOf(clock()).slice(0,7)&&value.status==='issued'?value.granted-value.frozen-value.used:null}:{status:assessment?.status||(globalRule||configured&&JSON.parse(configured.people_json).includes(user.personId)?'queued':'not_configured'),available:null,coverage:assessment?JSON.parse(assessment.coverage_json):null};
  },
  ledger(user,month){if(!user?.id)throw fail('请先登录',401);monthDates(month);return db.prepare('select * from attendance_offset_ledger where person_id=? and usage_month=? order by created_at,id').all(user.personId||'',month);},
  rules(user){requirePermission(user,'attendance.offset.rules.manage');return db.prepare('select * from attendance_offset_rules order by source_month desc').all();},
  submit(user,body,key){
   requirePermission(user,'attendance.offset.submit');writable();if(!user.personId)throw fail('账号尚未绑定人员',409);
   const month=dayOf(clock()).slice(0,7);
   if(monthlyRule('9999-12')&&month<'2026-11')throw fail('兑换额度从2026年11月开始使用',409);
   if(!Array.isArray(body.events)||!body.events.length||body.events.length>20||new Set(body.events).size!==body.events.length||typeof body.note!=='string'||!body.note.trim()||body.note.length>2000)throw fail('请选择独立异常并填写说明');
   return op(user,'submit',key,body,()=>{
    if(body.events.some(id=>!db.prepare('select id from attendance_offset_events where id=?').get(id))){
     for(const day of readDays(user.personId,month+'-01',dayOf(clock()))){
      const facts=resolveOffsetFacts(user.personId,day.input,{now:clock(),sourceReadAt:day.sourceReadAt});
      if(facts.items.some(i=>body.events.includes(i.eventId)))register.reconcile(user.personId,day.input,day.sourceReadAt,{withinTransaction:true});
     }
    }
    const events=body.events.map(id=>db.prepare('select * from attendance_offset_events where id=?').get(id));
    if(events.some(e=>!e||e.person_id!==user.personId||e.work_date.slice(0,7)!==month||!e.active))throw fail('异常不属于本人当月有效事项',409);
    // Cross-day batching policy is unresolved: allow multiple independent points on one day only.
    if(new Set(events.map(e=>e.work_date)).size!==1)throw fail('跨日合并政策尚未启用',409);
    for(const event of events){const src=sourceItem(event);if(src.status!=='active'||src.evidenceHash!==event.evidence_hash)throw fail('异常依据已变化，请重新核对',409);}
    const selection=this.approvalCandidates(user),selected=selection.candidates.find(c=>c.id===body.assigneeUserId);
    if(!selected)throw fail('请选择有效且有审批权限的审批人',409);
    const responsibility={status:'applicant_selected',work_date:events[0].work_date,applicationDate:selection.date,shift:selection.shift,team:selection.shift||'未取得当日排班',recommendedUserIds:selection.candidates.filter(c=>c.recommended).map(c=>c.id),assignee_user_id:selected.id,leader_person_id:selected.personId||null,assigneeName:selected.name};
    const id=randomUUID();db.prepare("insert into attendance_offset_requests values(?,?,?,?,?,?,'pending',1,?,?)").run(id,user.personId,month,responsibility.assignee_user_id,JSON.stringify(responsibility),body.note,at(),at());
    for(const event of events){const itemId=randomUUID();db.prepare('insert into attendance_offset_claims values(?,?)').run(event.id,itemId);adjust(user.personId,month,'freeze',itemId);db.prepare("insert into attendance_offset_items values(?,?,?,?,?,'pending',0,null,null,null)").run(itemId,id,event.id,event.evidence_hash,event.revision);}
    tasks.upsert({sourceModule:'attendance',sourceType:'offset_approval',sourceId:id,assigneeUserId:responsibility.assignee_user_id,title:`考勤 · 抵消审批 · ${user.name||user.employeeNo||'员工'} · ${events[0].work_date} · ${events.length}项`});audit(user,'submit',id,{applicant:{personId:user.personId,userId:user.id,name:user.name||user.employeeNo||user.id,employeeNo:user.employeeNo||null},events:body.events,submittedEvidence:events.map(event=>({eventId:event.id,revision:event.revision,evidenceHash:event.evidence_hash,evidence:JSON.parse(event.evidence_json)}))});return {id,status:'pending',version:1};
   });
  },
  detail(user,id){
   if(!user?.id)throw fail('请先登录',401);const row=request(id);
   if(!row||!(row.person_id===user.personId||row.assignee_user_id===user.id&&hasPermission(user,'attendance.offset.approve')||hasPermission(user,'attendance.offset.responsibility.manage')&&canViewPerson(user,row.person_id)))throw fail('无权读取该申请',403);
   const requestItems=items(id);
   const history=db.prepare('select actor_id,action,detail_json,created_at from attendance_offset_audit where reference_id=? order by created_at,id').all(id);
   const submitted=history.find(entry=>entry.action==='submit');
   const submittedEvidence=submitted?JSON.parse(submitted.detail_json).submittedEvidence||null:null;
   const evidenceDates=[...new Set(requestItems.map(i=>db.prepare('select work_date from attendance_offset_events where id=?').get(i.event_id)?.work_date).filter(Boolean))];
   const applicant=submitted?(JSON.parse(submitted.detail_json).applicant||{personId:row.person_id,userId:submitted.actor_id,name:loadUser(submitted.actor_id)?.name||row.person_id}):{personId:row.person_id,name:row.person_id};
   return {...row,applicant,assignee:{id:row.assignee_user_id,name:loadUser(row.assignee_user_id)?.name||row.assignee_user_id},submittedEvidence,history,creditStatus:account(row.person_id,row.usage_month)?.status||'not_issued',dayEvidence:evidenceDates.flatMap(date=>readDays(row.person_id,date,date)).map(d=>({date:d.date,sourceReadAt:d.sourceReadAt,result:classifyDay(d.input,clock(),d.sourceReadAt),approvals:(d.input.approvals||[]).map(({id,kind,subType,approved,revoked,start,end,reason,reasonStatus})=>({id,kind,subType,approved,revoked,start,end,reason,reasonStatus}))})),items:requestItems.map(item=>({...item,event:db.prepare('select * from attendance_offset_events where id=?').get(item.event_id)})),canApprove:existingActionsEnabled&&assigneeAllowed(user,row),canWithdraw:existingActionsEnabled&&row.status==='pending'&&row.person_id===user.personId&&hasPermission(user,'attendance.offset.submit')};
  },
  decide(user,id,body,key){
   requirePermission(user,'attendance.offset.approve');existingWritable();
   return op(user,'decide',key,{id,...body},()=>{
    const row=requestForUpdate(id);if(!row||!assigneeAllowed(user,row))throw fail('不是当前受派审批人',403);
    if(row.version!==body.version)throw fail('申请已变化，请刷新后确认',409);
    const pending=items(id).filter(i=>i.decision==='pending');
    if(!Array.isArray(body.decisions)||body.decisions.length!==pending.length||new Set(body.decisions.map(d=>d.id)).size!==pending.length)throw fail('必须逐项作出决定');
    for(const item of pending){const event=db.prepare('select * from attendance_offset_events where id=?').get(item.event_id),src=sourceItem(event);
     if(src.status!=='active'||src.evidenceHash!==item.evidence_hash||event.revision!==item.event_revision)throw fail('源事实已变化，需刷新核对后重新审批',409);}
    let approved=0;
    for(const item of pending){const decision=body.decisions.find(d=>d.id===item.id);if(!decision||!['approved','rejected'].includes(decision.decision)||decision.decision==='rejected'&&!decision.reason?.trim()||String(decision.reason||'').length>2000)throw fail('批准或拒绝选择无效，拒绝须填原因');
     adjust(row.person_id,row.usage_month,decision.decision==='approved'?'approve':'release',item.id);
     db.prepare('update attendance_offset_items set decision=?,effective=?,reason=?,decided_by=?,decided_at=? where id=?').run(decision.decision,decision.decision==='approved'?1:0,decision.reason||'',user.id,at(),item.id);
     if(decision.decision==='approved')approved++;else db.prepare('delete from attendance_offset_claims where item_id=?').run(item.id);
    }
    const status=approved===pending.length?'approved':approved?'partial':'rejected';
    const updated=db.prepare("update attendance_offset_requests set status=?,version=version+1,updated_at=? where id=? and version=? and status='pending'").run(status,at(),id,body.version);if(!updated.changes)throw fail('申请已被处理',409);
    tasks.close(id);audit(user,'decide',id,body);return {id,status};
   });
  },
  withdraw(user,id,body,key){
   requirePermission(user,'attendance.offset.submit');existingWritable();return op(user,'withdraw',key,{id,...body},()=>{
    const row=requestForUpdate(id);if(!row||row.person_id!==user.personId)throw fail('只能撤回本人申请',403);
    if(row.status!=='pending'||row.version!==body.version)throw fail('申请已变化',409);
    for(const item of items(id).filter(i=>i.decision==='pending')){adjust(row.person_id,row.usage_month,'release',item.id);db.prepare("update attendance_offset_items set decision='withdrawn' where id=?").run(item.id);db.prepare('delete from attendance_offset_claims where item_id=?').run(item.id);}
    const changed=db.prepare("update attendance_offset_requests set status='withdrawn',version=version+1,updated_at=? where id=? and version=? and status='pending'").run(at(),id,body.version);if(!changed.changes)throw fail('申请已被处理',409);tasks.close(id,'cancelled');audit(user,'withdraw',id,body);return {id,status:'withdrawn'};
   });
  },
  reconcile(user,personId,date,key){
   requirePermission(user,'attendance.offset.responsibility.manage');existingWritable();if(!canViewPerson(user,personId))throw fail('人员不在范围',403);
   return op(user,'reconcile',key,{personId,date},()=>{
    const related=db.prepare('select distinct r.id from attendance_offset_requests r join attendance_offset_items i on i.request_id=r.id join attendance_offset_events e on e.id=i.event_id where e.person_id=? and e.work_date=? and (i.decision=\'pending\' or i.effective=1) order by r.id').all(personId,date);
    for(const row of related)requestForUpdate(row.id);
    const day=readDays(personId,date,date,{lock:true})[0];if(!day)throw fail('源记录未完成',409);
    const facts=register.reconcile(personId,day.input,day.sourceReadAt,{withinTransaction:true});
    const claims=db.prepare('select i.*,e.person_id,e.work_date from attendance_offset_items i join attendance_offset_events e on e.id=i.event_id where e.person_id=? and e.work_date=? and (i.decision=\'pending\' or i.effective=1)').all(personId,date);
    let changed=!!facts.changed;
    for(const item of claims){const event=db.prepare('select * from attendance_offset_events where id=?').get(item.event_id);changed=reconcileClaim(item,event,sourceItem(event),user)||changed;}
    if(changed)audit(user,'reconcile',personId,{date,eligibility:facts.eligibility});return {...facts,changed};
   });
  }
 };
}
