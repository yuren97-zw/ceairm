export const NONROUTINE_CROSS_PERIOD_SCHEMA=`create table if not exists maintenance_nonroutine_cross_period_tasks(
  id text primary key,
  case_id text not null unique references maintenance_nonroutine_review_cases(id),
  channel_id text not null unique references maintenance_nonroutine_review_channels(id),
  approved_revision integer not null,
  source_month text not null,
  source_period_json text not null,
  state text not null check(state in ('PENDING_AUTHORIZATION','AUTHORIZED','RESOLVED_SOURCE_REOPENED','COMPLETED')),
  revision integer not null,
  target_month text,
  authorized_by text,
  source_revision integer,
  target_revision integer,
  created_at text not null,
  updated_at text not null
);
create table if not exists maintenance_nonroutine_cross_period_history(
  id text primary key,
  task_id text not null references maintenance_nonroutine_cross_period_tasks(id),
  revision integer not null,
  actor_id text not null,
  reason text not null,
  authorization_json text not null,
  created_at text not null,
  unique(task_id,revision)
);`;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function createNonroutineCrossPeriod({db,transaction,can,qualifiedAccount,periodState,clock,randomId}){
  function cancelled(task){
    const source=db.prepare('select c.state case_state,h.state channel_state from maintenance_nonroutine_review_cases c join maintenance_nonroutine_review_channels h on h.id=? where c.id=?').get(task.channel_id,task.case_id);
    return source?.case_state==='CANCELLED'||source?.channel_state==='CANCELLED_CLOSED';
  }
  const projection=task=>cancelled(task)?{...task,recordedState:task.state,state:'CANCELLED'}:task;
  function requireOpenSource(task){if(cancelled(task))throw fail('原审核已取消，不能继续跨期授权或入账',409);}
  function ensure(item,final,channel,period){
    requireOpenSource({case_id:item.id,channel_id:channel.id});
    let task=db.prepare('select * from maintenance_nonroutine_cross_period_tasks where case_id=?').get(item.id);
    if(task){if(task.channel_id!==channel.id || Number(task.approved_revision)!==Number(final.approved_revision))throw fail('跨期任务来源不一致',409);return task;}
    if(period.state!=='CLOSED')throw fail('只有负责人确认封账后才建立跨期任务',409);
    const stamp=clock(),id=randomId('nrcp');
    db.prepare("insert into maintenance_nonroutine_cross_period_tasks(id,case_id,channel_id,approved_revision,source_month,source_period_json,state,revision,created_at,updated_at) values(?,?,?,?,?,?,'PENDING_AUTHORIZATION',1,?,?)")
      .run(id,item.id,channel.id,final.approved_revision,period.month,JSON.stringify(period),stamp,stamp);
    return db.prepare('select * from maintenance_nonroutine_cross_period_tasks where id=?').get(id);
  }
  function load(id,user,action){
    if(!can(user,`maintenance.hours.period.${action}`))throw fail('当前账户没有全维修范围的跨期处理权限',403);
    const task=db.prepare('select * from maintenance_nonroutine_cross_period_tasks where id=?').get(id);
    if(!task)throw fail('未找到跨期任务',404);return task;
  }
  function list(query,user){
    if(!can(user,'maintenance.hours.period.view'))throw fail('当前账户没有全维修范围的跨期处理权限',403);
    const source=periodState(query?.month),cursor=String(query?.cursor||'');
    const rows=db.prepare(`select t.id,t.case_id,t.channel_id,t.source_month,t.target_month,t.state,t.revision,c.application_json from maintenance_nonroutine_cross_period_tasks t join maintenance_nonroutine_review_cases c on c.id=t.case_id
      where t.source_month=? and t.id>? order by t.id limit 51`).all(source.month,cursor);
    return {items:rows.slice(0,50).map(({application_json,...row})=>({...projection(row),title:JSON.parse(application_json).title||row.case_id})),nextCursor:rows.length>50?rows[49].id:null};
  }
  function view(id,user){const task=load(id,user,'view'),sourcePeriod=periodState(task.source_month),qualification=qualifiedAccount(user.id,'maintenance.hours.period.cross_period.authorize');
    const channel=db.prepare('select state,approved_revision from maintenance_nonroutine_review_channels where id=?').get(task.channel_id);
    const authorization=cancelled(task)?{ok:false,code:'REVIEW_CANCELLED'}:task.state==='AUTHORIZED'?deliveryAuthorization(task,sourcePeriod):{ok:false,code:'PERIOD_CLOSED_CROSS_PERIOD_REQUIRED'};
    const eligible=Boolean(authorization.code!=='REVIEW_CANCELLED' && can(user,'maintenance.hours.period.cross_period.authorize') && qualification && sourcePeriod.responsible_account_id===user.id && sourcePeriod.responsible_person_id===qualification.personId && sourcePeriod.state==='CLOSED' && ['PENDING_AUTHORIZATION','AUTHORIZED'].includes(task.state) && channel?.state==='NEEDS_ATTENTION' && Number(channel.approved_revision)===Number(task.approved_revision) && !authorization.ok);
    return {task:projection(task),sourcePeriod,authorization,capabilities:{authorize:eligible},history:db.prepare('select revision,actor_id,reason,authorization_json,created_at from maintenance_nonroutine_cross_period_history where task_id=? order by revision desc').all(id)
    .map(row=>{const {qualification,...authorization}=JSON.parse(row.authorization_json);return {revision:Number(row.revision),actorId:row.actor_id,reason:row.reason,authorization,createdAt:row.created_at};})};}
  function authorize(id,payload,user){return transaction(()=>{
    const task=load(id,user,'cross_period.authorize');
    requireOpenSource(task);
    if(!['PENDING_AUTHORIZATION','AUTHORIZED'].includes(task.state) || !Number.isInteger(payload?.revision) || payload.revision!==Number(task.revision))throw fail('跨期任务状态或版本已变化',409);
    const channel=db.prepare('select * from maintenance_nonroutine_review_channels where id=?').get(task.channel_id);
    if(!channel || channel.state!=='NEEDS_ATTENTION' || Number(channel.approved_revision)!==Number(task.approved_revision))throw fail('原审核通道已变化或关闭',409);
    const source=periodState(task.source_month),target=periodState(payload.targetMonth);
    if(source.state!=='CLOSED' || target.state!=='OPEN' || source.month===target.month)throw fail('须原账期仍封账，并明确选择另一个已确认开放的目标账期',409);
    if(payload.sourceRevision!==Number(source.revision) || payload.targetRevision!==Number(target.revision))throw fail('原账期或目标账期版本已变化',409);
    const qualification=qualifiedAccount(user.id,'maintenance.hours.period.cross_period.authorize');
    if(!qualification || source.responsible_account_id!==user.id || source.responsible_person_id!==qualification.personId)throw fail('只有原账期指定且具有跨期授权权限的当前有效负责人可以授权',403);
    if(task.state==='AUTHORIZED'){
      const existingTarget=periodState(task.target_month);
      if(existingTarget.state==='OPEN' && Number(task.source_revision)===Number(source.revision) && Number(task.target_revision)===Number(existingTarget.revision))throw fail('已有有效跨期授权，不能覆盖；须走独立更正或撤销处理',409);
    }
    const reason=typeof payload.reason==='string'?payload.reason.trim():'';
    if(!reason || reason.length>2000)throw fail('跨期授权须填写不超过2000字的依据');
    const revision=Number(task.revision)+1,stamp=clock();
    db.prepare("update maintenance_nonroutine_cross_period_tasks set state='AUTHORIZED',revision=?,target_month=?,authorized_by=?,source_revision=?,target_revision=?,updated_at=? where id=?")
      .run(revision,target.month,user.id,source.revision,target.revision,stamp,id);
    db.prepare('insert into maintenance_nonroutine_cross_period_history(id,task_id,revision,actor_id,reason,authorization_json,created_at) values(?,?,?,?,?,?,?)')
      .run(randomId('nrcph'),id,revision,user.id,reason,JSON.stringify({sourcePeriod:source,targetPeriod:target,qualification,caseId:task.case_id,approvedRevision:task.approved_revision}),stamp);
    return view(id,user);
  });}
  function resolveReopened(caseId,actorId,period){
    const task=db.prepare("select * from maintenance_nonroutine_cross_period_tasks where case_id=? and state='PENDING_AUTHORIZATION'").get(caseId);
    if(!task)return;
    requireOpenSource(task);
    if(period.state!=='OPEN' || period.month!==task.source_month)throw fail('原账期尚未重新开放',409);
    const revision=Number(task.revision)+1,stamp=clock();
    db.prepare("update maintenance_nonroutine_cross_period_tasks set state='RESOLVED_SOURCE_REOPENED',revision=?,updated_at=? where id=?").run(revision,stamp,task.id);
    db.prepare('insert into maintenance_nonroutine_cross_period_history(id,task_id,revision,actor_id,reason,authorization_json,created_at) values(?,?,?,?,?,?,?)')
      .run(randomId('nrcph'),task.id,revision,actorId,'原账期重新开放后已通过原审核通道入账',JSON.stringify({sourcePeriod:period,resolution:'SOURCE_REOPENED',channelId:task.channel_id}),stamp);
  }
  function deliveryAuthorization(task,source){
    if(cancelled(task))return {ok:false,code:'REVIEW_CANCELLED'};
    if(task.state!=='AUTHORIZED')return {ok:false,code:'PERIOD_CLOSED_CROSS_PERIOD_REQUIRED'};
    const target=periodState(task.target_month);
    if(source.state!=='CLOSED' || Number(source.revision)!==Number(task.source_revision) || target.state!=='OPEN' || Number(target.revision)!==Number(task.target_revision))return {ok:false,code:'CROSS_PERIOD_AUTHORIZATION_STALE'};
    const person=qualifiedAccount(task.authorized_by,'maintenance.hours.period.cross_period.authorize');
    if(!person || source.responsible_account_id!==person.accountId || source.responsible_person_id!==person.personId)return {ok:false,code:'CROSS_PERIOD_AUTHORIZER_UNAVAILABLE'};
    return {ok:true,target};
  }
  function complete(task,actorId,receipt){
    requireOpenSource(task);
    if(task.state!=='AUTHORIZED')throw fail('跨期任务未经有效授权',409);
    const current=db.prepare('select state,revision from maintenance_nonroutine_cross_period_tasks where id=?').get(task.id);
    if(!current || current.state!=='AUTHORIZED' || Number(current.revision)!==Number(task.revision))throw fail('跨期任务已变化，不能重复完成',409);
    const revision=Number(task.revision)+1,stamp=clock();
    db.prepare("update maintenance_nonroutine_cross_period_tasks set state='COMPLETED',revision=?,updated_at=? where id=? and state='AUTHORIZED'").run(revision,stamp,task.id);
    db.prepare('insert into maintenance_nonroutine_cross_period_history(id,task_id,revision,actor_id,reason,authorization_json,created_at) values(?,?,?,?,?,?,?)')
      .run(randomId('nrcph'),task.id,revision,actorId,'已按原作业月份统计并另记办理账期',JSON.stringify({resolution:'CROSS_PERIOD_POSTED',...receipt}),stamp);
  }
  return {ensure,list,view,authorize,resolveReopened,deliveryAuthorization,complete};
}

export const NONROUTINE_POSTING_RECEIPTS_SCHEMA=`create table if not exists maintenance_nonroutine_posting_receipts(
  channel_id text primary key references maintenance_nonroutine_review_channels(id),
  case_id text not null unique references maintenance_nonroutine_review_cases(id),
  approved_revision integer not null,
  task_id text references maintenance_nonroutine_cross_period_tasks(id),
  task_revision integer,
  work_month text not null,
  handling_month text not null,
  statistical_month text not null,
  policy text not null check(policy='ORIGINAL_WORK_MONTH'),
  period_snapshot_json text not null,
  created_at text not null,
  check(statistical_month=work_month)
);`;
