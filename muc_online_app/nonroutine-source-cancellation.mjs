const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const actions=new Set(['REPORT_ITEM_REMOVAL','OPPORTUNITY_REMOVAL','SUBTASK_REMOVAL']);
const cancelPermission='maintenance.nonroutine.review.cancel';
// The original transaction coordinator serializes this operation with finalization/posting.
export function createNonroutineReviewCancellation({db,transaction,can,qualifiedAccount,sourceFacts,clock,randomId}){
 return {cancel(caseId,payload,user){return transaction(()=>{
  const item=db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(caseId);
  if(!item||!can(user,cancelPermission,item))fail('未找到可取消的非例行评议',404);
  const qualification=qualifiedAccount(user?.id,cancelPermission,item);
  if(!qualification||qualification.personId!==user?.personId)fail('当前取消评议资格已失效',403);
  const reason=typeof payload?.reason==='string'?payload.reason.trim():'';
  const clientId=typeof payload?.clientId==='string'?payload.clientId.trim():'';
  const revision=payload?.revision;
  if(!reason||reason.length>4000||!clientId||clientId.length>200||!Number.isInteger(revision)||revision<1)fail('请提供取消原因、请求标识和当前事项版本',400);
  const request={clientId,revision,reason};
  const events=db.prepare("select * from maintenance_nonroutine_review_events where case_id=? and event_type='CANCELLED_BY_AUTHORIZED_OWNER' order by id").all(caseId);
  const prior=events.find(row=>{try{return JSON.parse(row.detail_json).request?.clientId===clientId;}catch{return false;}});
  if(prior){
   const detail=JSON.parse(prior.detail_json),channel=db.prepare('select * from maintenance_nonroutine_review_channels where case_id=?').get(caseId);
   if(prior.actor_id!==user.id||JSON.stringify(detail.request)!==JSON.stringify(request)||item.state!=='CANCELLED'||channel?.state!=='CANCELLED_CLOSED'||Number(item.revision)!==Number(detail.after.caseRevision))fail('取消请求或关闭状态不一致，请核对原记录');
   closeReview({db,caseId,flightId:item.flight_id,subtaskId:item.subtask_id,user,reason,qualify:()=>qualification,clock,randomId});
   return {caseId,channelId:channel.id,eventId:prior.id,replayed:true};
  }
  if(Number(item.revision)!==revision||item.state==='CANCELLED')fail('事项版本已变化，请刷新后重新核对');
  // Cancellation must cover both frozen and current participants without disclosing a diff.
  const facts=sourceFacts(item,user);
  if(!facts?.available)fail('当前原工作来源或人员范围无法核对，不能取消');
  return closeReview({db,caseId,flightId:item.flight_id,subtaskId:item.subtask_id,user,reason,qualify:()=>qualification,clock,randomId,eventType:'CANCELLED_BY_AUTHORIZED_OWNER',cause:'AUTHORIZED_REVIEW_CANCELLATION',request});
 });}};
}
// Called only inside an already-authorized original source-removal transaction.
// This is not an independent cancellation permission or a financial reversal.
export function cancelNonroutineReviewForSourceRemoval({db,caseId,flightId,subtaskId,user,sourceAction,reason='',qualify,clock,randomId}){
 if(!actions.has(sourceAction)||[qualify,clock,randomId].some(fn=>typeof fn!=='function'))throw TypeError('Missing original source cancellation authority');
 return closeReview({db,caseId,flightId,subtaskId,user,sourceAction,reason,qualify,clock,randomId,eventType:'CANCELLED_BY_SOURCE_REMOVAL',cause:'AUTHORIZED_SOURCE_REMOVAL'});
}
function closeReview({db,caseId,flightId,subtaskId,user,sourceAction,reason,qualify,clock,randomId,eventType,cause,request}){
 const item=db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(caseId),channel=db.prepare('select * from maintenance_nonroutine_review_channels where case_id=?').get(caseId);
 if(!item||!channel||item.flight_id!==flightId||item.subtask_id!==subtaskId||channel.subtask_id!==subtaskId)fail('待取消审核与原工作或唯一通道关联异常');
 const qualification=qualify(user,{item,sourceAction});
 if(!qualification?.accountId||!qualification.personId||qualification.accountId!==user?.id||qualification.personId!==user?.personId)fail('原删除操作者的当前身份或权限已失效',403);
 const basis=typeof reason==='string'?reason.trim():'';if(basis.length>4000)fail('删除取消依据不能超过4000字',400);
 if(['MERGED_CLOSED','ADJUSTED_CLOSED'].includes(channel.state))fail('审核工时通道已消费，只能使用独立授权更正，不能取消抹账');
 const posted=db.prepare(`select 1 from maintenance_nonroutine_posting_receipts where case_id=?
 union all select 1 from maintenance_nonroutine_hour_adjustments where case_id=?
 union all select 1 from maintenance_nonroutine_role_results where case_id=?
 union all select 1 from maintenance_hour_results where owner_type='subtask' and owner_id=?
 union all select 1 from maintenance_nonroutine_assessments where subtask_id=? and effective_hours is not null limit 1`).get(caseId,caseId,caseId,subtaskId,subtaskId);
 if(posted)fail('原来源已有正式工时或入账凭据，须保留原记录并走独立更正');
 if(item.state==='CANCELLED'&&channel.state==='CANCELLED_CLOSED')return {caseId,channelId:channel.id,replayed:true};
 if(item.state==='CANCELLED'||channel.state==='CANCELLED_CLOSED'||!['WAITING_REVIEW','APPROVED_PENDING_SYNC','NEEDS_ATTENTION'].includes(channel.state)||!['PENDING_ACCEPTANCE','IN_REVIEW','SEALED','FINALIZED'].includes(item.state))fail('审核与通道终态不一致，请核对原来源');
 const final=db.prepare('select approved_revision from maintenance_nonroutine_review_finals where case_id=?').get(caseId);
 if(item.state==='FINALIZED' ? (!final||channel.state==='WAITING_REVIEW'||Number(final.approved_revision)!==Number(channel.approved_revision)) : (final||channel.state!=='WAITING_REVIEW'||channel.approved_revision!==null))fail('审核认定与通道版本不一致，取消未完成');
 const stamp=clock(),eventId=randomId('nre');
 const changed=db.prepare("update maintenance_nonroutine_review_channels set state='CANCELLED_CLOSED',updated_at=? where id=? and state=?").run(stamp,channel.id,channel.state);
 if(Number(changed.changes)!==1)fail('工时通道已变化，取消未完成');
 const caseChanged=db.prepare("update maintenance_nonroutine_review_cases set state='CANCELLED',revision=revision+1,updated_at=? where id=? and revision=? and state=?").run(stamp,item.id,item.revision,item.state);
 if(Number(caseChanged.changes)!==1)fail('审核事项已变化，取消未完成');
 db.prepare("update maintenance_nonroutine_review_outbox set state='CANCELLED' where case_id=? and state='PENDING'").run(caseId);
 db.prepare('insert into maintenance_nonroutine_review_events(id,case_id,actor_id,event_type,detail_json,created_at) values(?,?,?,?,?,?)').run(eventId,caseId,user.id,eventType,JSON.stringify({sourceAction,cause,...(request?{request}:{}),reason:basis||null,qualification,flightId,subtaskId,channelId:channel.id,before:{caseState:item.state,caseRevision:Number(item.revision),channelState:channel.state,approvedRevision:channel.approved_revision},after:{caseState:'CANCELLED',caseRevision:Number(item.revision)+1,channelState:'CANCELLED_CLOSED'},finalDecisionRetained:true,ledgerChanged:false}),stamp);
 return {caseId,channelId:channel.id,eventId,replayed:false};
}
