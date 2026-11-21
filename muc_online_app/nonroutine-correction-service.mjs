import {createHash} from 'node:crypto';
import {planNonroutineCorrection} from './nonroutine-corrections.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const approvalPermission='maintenance.archive.modify',periodPermission='maintenance.hours.period.cross_period.authorize';
const text=(value,label,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(`${label}须明确填写且不超过${max}字`,400);return value.trim();};
const month=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const roleOrder=['主做','检验','辅助'];
const pairs=people=>people.map(row=>JSON.stringify([row.personId,row.role])).sort().join('|');

// Original maintenance transaction/allocator, account authority and immutable
// source adapters are supplied by the server. This service never writes them.
export function createNonroutineCorrections({db,transaction,can,qualifiedAccount,loadSource,allocate,periodState,clock,randomId,audit=()=>{}}){
 const qualify=(user,permission)=>{
  const current=user?.id&&can(user,permission)&&qualifiedAccount(user.id,permission);
  if(!current||!current.personId||current.personId!==user.personId)fail('当前有效人员、授权或维修数据范围不满足更正办理要求',403);
  return current;
 };
 const read=id=>{const row=db.prepare('select * from maintenance_nonroutine_corrections where id=?').get(id);if(!row)fail('未找到可访问的更正事项',404);return row;};
 function access(row,user){
  if(can(user,approvalPermission)){qualify(user,approvalPermission);return true;}
  const qualified=qualify(user,periodPermission),period=periodState(row.work_month);
  if(period.responsible_account_id!==user.id||period.responsible_person_id!==qualified.personId)fail('未找到可访问的更正事项',404);
  return false;
 }
 function view(id,user){
  const row=read(id),full=access(row,user),source=periodState(row.work_month),authorizations=db.prepare('select * from maintenance_nonroutine_correction_period_authorizations where correction_id=? order by revision').all(id);
  const periodQualification=can(user,periodPermission)&&qualifiedAccount(user.id,periodPermission),latest=authorizations.at(-1),latestTarget=latest&&periodState(latest.target_month),latestActor=latest&&qualifiedAccount(latest.actor_id,periodPermission);
  const authorizationValid=Boolean(source.state==='CLOSED'&&latestActor&&source.responsible_account_id===latest.actor_id&&source.responsible_person_id===latestActor.personId&&latestTarget.state==='OPEN'&&Number(source.revision)===Number(latest.source_revision)&&Number(latestTarget.revision)===Number(latest.target_revision));
  const frozenSource=JSON.parse(row.source_snapshot_json);
  const beforeHours=Math.round(JSON.parse(row.before_json).reduce((sum,entry)=>sum+Number(entry.adjusted_hours??entry.hours),0)*100)/100;
  return {id:row.id,subtaskId:row.subtask_id,opportunityId:row.flight_id,number:Number(row.correction_number),state:row.state,context:{...frozenSource.opportunity,title:frozenSource.subtask?.title||frozenSource.decision?.title||''},workMonth:row.work_month,handlingMonth:row.handling_month,statisticalMonth:row.statistical_month,
   beforeHours,targetHours:Number(row.target_hours),deltaHours:Math.round((Number(row.target_hours)-beforeHours)*100)/100,approvedBy:row.approved_by,createdAt:row.created_at,postedAt:row.posted_at,sourcePeriod:{month:source.month,state:source.state,revision:Number(source.revision)},
   authorizationValid,capabilities:{newCorrection:full&&row.state==='POSTED',retry:full&&row.state==='APPROVED_PENDING_PERIOD',authorizePeriod:Boolean(row.state==='APPROVED_PENDING_PERIOD'&&source.state==='CLOSED'&&!authorizationValid&&periodQualification&&source.responsible_account_id===user.id&&source.responsible_person_id===periodQualification.personId)},
   authorizations:authorizations.map(entry=>({id:entry.id,revision:Number(entry.revision),targetMonth:entry.target_month,actorId:entry.actor_id,reason:entry.reason,createdAt:entry.created_at})),
   ...(full?{reason:row.reason,source:frozenSource,target:JSON.parse(row.target_json),before:JSON.parse(row.before_json),policy:JSON.parse(row.policy_json),deltas:db.prepare('select * from maintenance_nonroutine_correction_deltas where correction_id=? order by person_id,role').all(id)}:{})};
 }
 function normalized(source,payload){
  const allowed=['recognizedHours','participants','participantsVerified','roleVerificationReason'];
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!allowed.includes(key)))fail('更正预览字段无效',400);
  if(!['number','string'].includes(typeof payload.recognizedHours)||String(payload.recognizedHours).trim()==='')fail('请明确填写目标认定工时',400);
  const recognizedHours=Number(payload.recognizedHours);
  if(!Number.isFinite(recognizedHours)||recognizedHours<0||recognizedHours>10000||Math.abs(recognizedHours*10-Math.round(recognizedHours*10))>1e-8)fail('目标认定工时须为0至10000且以0.1小时为单位',400);
  if(payload.participantsVerified!==true)fail('请明确核实原参与人员及核算角色',400);
  if(Array.isArray(payload.participants)&&payload.participants.some(person=>!person||typeof person!=='object'||Array.isArray(person)||Object.keys(person).some(key=>!['personId','role'].includes(key))))fail('人员核算角色字段无效',400);
  const people=(Array.isArray(payload.participants)?payload.participants:[]).map(person=>({personId:String(person?.personId||''),role:String(person?.role||'')})).sort((a,b)=>a.personId.localeCompare(b.personId)||roleOrder.indexOf(a.role)-roleOrder.indexOf(b.role));
  const originals=new Set(source.participants.map(person=>person.personId)),selected=new Set(people.map(person=>person.personId));
  if(!people.length||selected.size!==originals.size||[...selected].some(person=>!originals.has(person))||new Set(people.map(person=>JSON.stringify(person))).size!==people.length||people.some(person=>!roleOrder.includes(person.role)||source.decision.category==='拖机'&&person.role!=='主做'))fail('更正只能核实原参与人的合法核算角色，不能增删人员或重复角色',400);
  const roleVerificationReason=typeof payload.roleVerificationReason==='string'?payload.roleVerificationReason.trim():'';
  if(roleVerificationReason.length>2000||pairs(people)!==pairs(source.participants)&&!roleVerificationReason)fail('核算角色变化须明确填写不超过2000字的核实依据',400);
  return {recognizedHours,participants:people,participantsVerified:true,roleVerificationReason};
 }
 function calculate(subtaskId,payload,user){
  qualify(user,approvalPermission);
  const source=loadSource(subtaskId);
  if(!source||source.subtaskId!==subtaskId||!source.digest||!['REVIEW','STANDARD'].includes(source.kind)||!source.sourceId||!source.sourceVersion||!month(source.workMonth))fail('原已确认工时来源或版本不完整');
  if(db.prepare("select id from maintenance_nonroutine_corrections where subtask_id=? and state='APPROVED_PENDING_PERIOD'").get(subtaskId))fail('本来源已有待办理账期的更正，不能重复批准');
  const input=normalized(source,payload),allocated=allocate(source,input);
  if(!allocated||!Array.isArray(allocated.rows)||!allocated.policy)fail('原冻结策略或实际参与事实无法合法分配');
  const plan=planNonroutineCorrection({sourceRows:source.rows,targetRows:allocated.rows,subtaskId,flightId:source.flightId});
  if(Math.round(plan.targetHours*100)!==Math.round(input.recognizedHours*100))fail('原分配器未返回完整目标金额，请先核对原规则和输入');
  const number=Number(db.prepare('select max(correction_number) n from maintenance_nonroutine_corrections where subtask_id=?').get(subtaskId).n||0);
  const token=hash({sourceDigest:source.digest,number,input,policy:allocated.policy,planToken:plan.token});
  return {source,input,allocated,plan,number,token};
 }
 function preview(subtaskId,payload,user){return transaction(()=>{
  const value=calculate(subtaskId,payload,user),period=periodState(value.source.workMonth);
  return {readOnly:true,subtaskId,sourceKind:value.source.kind,sourceId:value.source.sourceId,sourceVersion:value.source.sourceVersion,number:value.number,token:value.token,input:value.input,policy:value.allocated.policy,plan:value.plan,period:{month:period.month,state:period.state,revision:Number(period.revision)}};
 });}
 function tryPost(row,user){
  if(row.state==='POSTED')return;
  const source=loadSource(row.subtask_id);
  if(source.digest!==row.source_digest||source.flightId!==row.flight_id||source.workMonth!==row.work_month)fail('批准后原工作或已入账来源发生变化，请核对独立更正来源');
  const target=JSON.parse(row.target_json),plan=planNonroutineCorrection({sourceRows:source.rows,targetRows:target.rows,subtaskId:row.subtask_id,flightId:row.flight_id});
  if(plan.token!==target.planToken||Math.round(plan.targetHours*100)!==Math.round(Number(row.target_hours)*100))fail('批准后原净额或目标来源已变化，不能按旧预览入账');
  const sourcePeriod=periodState(row.work_month);let handlingMonth,periodReference=null;
  if(sourcePeriod.state==='OPEN')handlingMonth=row.work_month;
  else if(sourcePeriod.state==='CLOSED'){
   const authorization=db.prepare('select * from maintenance_nonroutine_correction_period_authorizations where correction_id=? order by revision desc limit 1').get(row.id);
   if(!authorization)return;
   const qualified=qualifiedAccount(authorization.actor_id,periodPermission),targetPeriod=periodState(authorization.target_month);
   if(!qualified||sourcePeriod.responsible_account_id!==authorization.actor_id||sourcePeriod.responsible_person_id!==qualified.personId||targetPeriod.state!=='OPEN'||Number(sourcePeriod.revision)!==Number(authorization.source_revision)||Number(targetPeriod.revision)!==Number(authorization.target_revision))return;
   handlingMonth=authorization.target_month;periodReference=authorization.id;
  }else return;
  const stamp=clock(),insert=db.prepare('insert into maintenance_nonroutine_correction_deltas(id,correction_id,assignment_id,person_id,user_name,team,role,hours,before_hours,target_hours,correction_of_json,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?)');
  for(const delta of plan.deltas)insert.run(randomId('nrcd'),row.id,delta.assignmentId,delta.personId,delta.userName,delta.team,delta.role,delta.hours,delta.beforeHours,delta.targetHours,JSON.stringify(delta.correctionOf),stamp);
  const changed=db.prepare("update maintenance_nonroutine_corrections set state='POSTED',handling_month=?,posted_at=? where id=? and state='APPROVED_PENDING_PERIOD'").run(handlingMonth,stamp,row.id);
  if(!changed.changes)fail('更正事项已被其他办理更新');
  audit('POSTED',user,{correctionId:row.id,subtaskId:row.subtask_id,handlingMonth,workMonth:row.work_month,periodReference,sourcePeriod,deltaHours:plan.deltaHours});
 }
 function approve(subtaskId,payload,user){return transaction(()=>{
  const qualification=qualify(user,approvalPermission);
  const allowed=['recognizedHours','participants','participantsVerified','roleVerificationReason','expectedToken','expectedNumber','clientId','reason'];
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!allowed.includes(key)))fail('更正批准字段无效',400);
  const clientId=text(payload.clientId,'请求标识',128),reason=text(payload.reason,'更正批准依据',4000);
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(clientId)||!Number.isInteger(payload.expectedNumber))fail('更正请求标识或版本无效',400);
  const input={recognizedHours:payload.recognizedHours,participants:payload.participants,participantsVerified:payload.participantsVerified,...(payload.roleVerificationReason!==undefined?{roleVerificationReason:payload.roleVerificationReason}:{})};
  const requestHash=hash({subtaskId,input,expectedToken:payload.expectedToken,expectedNumber:payload.expectedNumber,reason});
  const prior=db.prepare('select * from maintenance_nonroutine_corrections where approved_by=? and client_id=?').get(user.id,clientId);
  if(prior){if(prior.request_hash!==requestHash)fail('同一请求标识不能用于不同更正内容');return {replayed:true,correction:view(prior.id,user)};}
  const value=calculate(subtaskId,input,user);
  if(payload.expectedToken!==value.token||payload.expectedNumber!==value.number)fail('更正预览或来源版本已变化，请重新核对');
  const id=randomId('nrc'),stamp=clock();
  db.prepare("insert into maintenance_nonroutine_corrections(id,subtask_id,flight_id,correction_number,source_kind,source_id,source_version,source_digest,source_snapshot_json,before_json,target_json,policy_json,target_hours,work_month,statistical_month,approved_by,approval_qualification_json,reason,client_id,request_hash,state,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'APPROVED_PENDING_PERIOD',?)")
   .run(id,subtaskId,value.source.flightId,value.number+1,value.source.kind,value.source.sourceId,String(value.source.sourceVersion),value.source.digest,JSON.stringify(value.source.snapshot),JSON.stringify(value.source.rows),JSON.stringify({request:{...input,clientId,reason,expectedToken:payload.expectedToken,expectedNumber:payload.expectedNumber},input:value.input,rows:value.allocated.rows,planToken:value.plan.token}),JSON.stringify(value.allocated.policy),value.plan.targetHours,value.source.workMonth,value.source.workMonth,user.id,JSON.stringify(qualification),reason,clientId,requestHash,stamp);
  audit('APPROVED',user,{correctionId:id,subtaskId,sourceDigest:value.source.digest});
  tryPost(read(id),user);return {replayed:false,correction:view(id,user)};
 });}
 function authorize(id,payload,user){return transaction(()=>{
  const qualification=qualify(user,periodPermission),row=read(id);access(row,user);
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!['clientId','sourceRevision','targetRevision','targetMonth','reason'].includes(key)))fail('更正账期授权字段无效',400);
  const clientId=text(payload.clientId,'请求标识',128),reason=text(payload.reason,'跨期办理依据',2000);
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(clientId)||!month(payload.targetMonth))fail('请求标识或目标账期无效',400);
  const requestHash=hash({id,clientId,sourceRevision:payload.sourceRevision,targetRevision:payload.targetRevision,targetMonth:payload.targetMonth,reason}),authorizationId='nrcpa_'+hash([id,user.id,clientId]);
  const prior=db.prepare('select * from maintenance_nonroutine_correction_period_authorizations where id=?').get(authorizationId);
  if(prior){if(JSON.parse(prior.snapshot_json).requestHash!==requestHash)fail('同一授权请求不能用于不同内容');return {replayed:true,correction:view(id,user)};}
  if(row.state!=='APPROVED_PENDING_PERIOD')fail('该更正已完成入账，不能重复授权');
  const source=periodState(row.work_month),target=periodState(payload.targetMonth);
  if(source.state!=='CLOSED'||target.state!=='OPEN'||source.month===target.month||source.responsible_account_id!==user.id||source.responsible_person_id!==qualification.personId)fail('须由原封账月份的当前负责人授权另一开放账期',403);
  if(payload.sourceRevision!==Number(source.revision)||payload.targetRevision!==Number(target.revision))fail('原账期或办理账期版本已变化');
  const existing=db.prepare('select * from maintenance_nonroutine_correction_period_authorizations where correction_id=? order by revision desc limit 1').get(id);
  if(existing){
   const previousTarget=periodState(existing.target_month),previousActor=qualifiedAccount(existing.actor_id,periodPermission);
   if(previousActor&&source.responsible_account_id===existing.actor_id&&source.responsible_person_id===previousActor.personId&&previousTarget.state==='OPEN'&&Number(source.revision)===Number(existing.source_revision)&&Number(previousTarget.revision)===Number(existing.target_revision))fail('已有有效办理授权，请重试入账，不能用新请求覆盖');
  }
  const revision=Number(db.prepare('select max(revision) n from maintenance_nonroutine_correction_period_authorizations where correction_id=?').get(id).n||0)+1;
  db.prepare('insert into maintenance_nonroutine_correction_period_authorizations(id,correction_id,revision,source_month,target_month,source_revision,target_revision,actor_id,qualification_json,reason,snapshot_json,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?)')
   .run(authorizationId,id,revision,source.month,target.month,source.revision,target.revision,user.id,JSON.stringify(qualification),reason,JSON.stringify({requestHash,clientId,source,target}),clock());
  audit('PERIOD_AUTHORIZED',user,{correctionId:id,authorizationId});tryPost(read(id),user);return {replayed:false,correction:view(id,user)};
 });}
 function retry(id,user){return transaction(()=>{qualify(user,approvalPermission);const row=read(id);tryPost(row,user);return view(id,user);});}
 function source(subtaskId,user){
  qualify(user,approvalPermission);const value=loadSource(subtaskId);
  const latest=db.prepare('select * from maintenance_nonroutine_corrections where subtask_id=? order by correction_number desc limit 1').get(subtaskId);
  const previous=latest&&JSON.parse(latest.target_json);
  return {subtaskId,opportunityId:value.flightId,kind:value.kind,sourceId:value.sourceId,sourceVersion:value.sourceVersion,workMonth:value.workMonth,decision:value.decision,context:value.context||value.snapshot.opportunity,originalParticipants:value.participants.map(person=>({personId:person.personId,role:person.role})),roleVerificationReason:previous?.input?.roleVerificationReason||'',
   participants:(previous?.input?.participants||value.participants).map(person=>({personId:person.personId,role:person.role})),
   people:[...new Map(value.participants.map(person=>[person.personId,{personId:person.personId,name:value.snapshot.baseResults?.find(row=>row.person_id===person.personId)?.user_name||person.personName||person.personId}])).values()],
   currentHours:Math.round(value.rows.reduce((sum,row)=>sum+Number(row.adjusted_hours??row.hours),0)*100)/100,number:Number(latest?.correction_number||0),pendingCorrectionId:latest?.state==='APPROVED_PENDING_PERIOD'?latest.id:null};
 }
 function list(query,user){
  const full=can(user,approvalPermission),qualification=qualify(user,full?approvalPermission:periodPermission);
  if(Object.keys(query||{}).some(key=>!['cursor','state'].includes(key))||query?.state&&!['APPROVED_PENDING_PERIOD','POSTED'].includes(query.state)||String(query?.cursor||'').length>128)fail('更正查询条件无效',400);
  const rows=db.prepare(`select c.id,c.subtask_id,c.flight_id,c.work_month,c.target_hours,c.state,c.created_at,c.correction_number,s.title,f.date,f.flight_no,f.departure_flight_no,f.aircraft_no from maintenance_nonroutine_corrections c join maintenance_subtasks s on s.id=c.subtask_id join maintenance_flights f on f.id=c.flight_id ${full?'': 'join maintenance_hour_periods p on p.month=c.work_month'} where c.id>? ${query?.state?'and c.state=?':''} ${full?'':'and p.responsible_account_id=? and p.responsible_person_id=?'} order by c.id limit 51`)
   .all(String(query?.cursor||''),...(query?.state?[query.state]:[]),...(full?[]:[user.id,qualification.personId]));
  return {items:rows.slice(0,50).map(row=>({id:row.id,subtaskId:row.subtask_id,opportunityId:row.flight_id,workMonth:row.work_month,targetHours:Number(row.target_hours),state:row.state,createdAt:row.created_at,number:Number(row.correction_number),title:row.title,date:row.date,flightNo:row.flight_no||row.departure_flight_no,aircraftNo:row.aircraft_no})),nextCursor:rows.length>50?rows[49].id:null};
 }
 function sources(query,user){
  qualify(user,approvalPermission);
  if(Object.keys(query||{}).some(key=>!['search','cursor'].includes(key))||String(query?.search||'').length>100||String(query?.cursor||'').length>128)fail('来源查询条件无效',400);
  const term='%'+String(query?.search||'').trim().toLowerCase()+'%';
  const rows=db.prepare(`select a.subtask_id,a.source_kind,s.title,f.id as flight_id,f.date,f.flight_no,f.departure_flight_no,f.aircraft_no,
    (select c.id from maintenance_nonroutine_corrections c where c.subtask_id=s.id and c.state='APPROVED_PENDING_PERIOD') as pending_id
    from maintenance_nonroutine_assessments a join maintenance_subtasks s on s.id=a.subtask_id and s.flight_id=a.flight_id join maintenance_flights f on f.id=a.flight_id
    where f.status='已确认' and s.status='已确认' and a.effective_hours is not null and s.id>?
      and (a.source_kind='STANDARD' or exists(select 1 from maintenance_nonroutine_review_channels ch join maintenance_nonroutine_review_cases r on r.id=ch.case_id where ch.case_id=a.review_case_id and ch.subtask_id=s.id and r.state='FINALIZED' and ch.state in ('MERGED_CLOSED','ADJUSTED_CLOSED')))
      and (lower(s.title) like ? or lower(f.aircraft_no) like ? or lower(f.flight_no) like ? or lower(f.departure_flight_no) like ?) order by s.id limit 51`).all(String(query?.cursor||''),term,term,term,term);
  return {items:rows.slice(0,50).map(row=>({subtaskId:row.subtask_id,opportunityId:row.flight_id,kind:row.source_kind,title:row.title,date:row.date,flightNo:row.flight_no||row.departure_flight_no,aircraftNo:row.aircraft_no,pendingCorrectionId:row.pending_id})),nextCursor:rows.length>50?rows[49].subtask_id:null};
 }
 function targetPeriod(id,query,user){
  const qualification=qualify(user,periodPermission),row=read(id);access(row,user);
  const original=periodState(row.work_month);
  if(original.responsible_account_id!==user.id||original.responsible_person_id!==qualification.personId)fail('只有原月份当前指定负责人可以核对办理账期',403);
  if(Object.keys(query||{}).some(key=>key!=='month')||!month(query?.month)||query.month===row.work_month)fail('请明确选择另一办理月份',400);
  const value=periodState(query.month);return {month:value.month,state:value.state,revision:Number(value.revision)};
 }
 return {preview,approve,authorize,retry,view,source,list,sources,targetPeriod};
}
