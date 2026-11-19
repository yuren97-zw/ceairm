export const MAINTENANCE_HOUR_PERIODS_SCHEMA=`create table if not exists maintenance_hour_periods(
  month text primary key,
  responsible_account_id text not null,
  responsible_person_id text not null,
  state text not null check(state in ('UNKNOWN','OPEN','CLOSED')),
  revision integer not null,
  confirmed_by text,
  confirmed_at text,
  updated_at text not null
);
create table if not exists maintenance_hour_period_history(
  id text primary key,
  month text not null references maintenance_hour_periods(month),
  revision integer not null,
  action text not null check(action in ('ASSIGNED','CONFIRMED')),
  actor_id text not null,
  reason text not null,
  snapshot_json text not null,
  qualification_json text not null,
  created_at text not null,
  unique(month,revision)
);`;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const monthKey=value=>{if(typeof value!=='string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || Number(value.slice(0,4))<1900)throw fail('账期须为有效年月');return value;};
export function createMaintenanceHourPeriods({db,transaction,can,qualifiedAccount,listAccounts=()=>[],clock,randomId}) {
  function state(month){monthKey(month);return db.prepare('select * from maintenance_hour_periods where month=?').get(month) || {month,state:'UNKNOWN',revision:0};}
  function authorize(user,action){if(!can(user,`maintenance.hours.period.${action}`))throw fail('当前账户没有全维修范围的账期操作权限',403);}
  function capabilities(user){return {view:can(user,'maintenance.hours.period.view'),assign:can(user,'maintenance.hours.period.assign'),confirm:can(user,'maintenance.hours.period.confirm')};}
  function candidates(query,user){
    authorize(user,'assign');const search=String(query?.search||'').trim();if(search.length>100)throw fail('查询内容不能超过100字');
    const people=listAccounts(search).map(person=>({person,qualification:qualifiedAccount(person.accountId,'maintenance.hours.period.confirm')})).filter(item=>item.qualification);
    return {items:people.slice(0,100).map(({person,qualification})=>({accountId:qualification.accountId,personId:qualification.personId,name:person.name,employeeNo:person.employeeNo})),truncated:people.length>100};
  }
  function view(month,user){authorize(user,'view');const period=state(month),qualification=qualifiedAccount(user.id,'maintenance.hours.period.confirm');return {period,capabilities:{assign:can(user,'maintenance.hours.period.assign'),confirm:Boolean(qualification && can(user,'maintenance.hours.period.confirm') && period.responsible_account_id===user.id && period.responsible_person_id===qualification.personId)},history:db.prepare('select revision,action,actor_id,reason,snapshot_json,created_at from maintenance_hour_period_history where month=? order by revision desc').all(month)
    .map(row=>({revision:Number(row.revision),action:row.action,actorId:row.actor_id,reason:row.reason,snapshot:JSON.parse(row.snapshot_json),createdAt:row.created_at}))};}
  function mutate(month,payload,user,assigning){return transaction(()=>{
    authorize(user,assigning?'assign':'confirm');const current=state(month);
    if(!Number.isInteger(payload?.revision) || payload.revision!==Number(current.revision))throw fail('账期版本已变化，请刷新后重试',409);
    const reason=typeof payload.reason==='string'?payload.reason.trim():'';
    if(!reason || reason.length>2000)throw fail('请填写不超过2000字的账期操作依据');
    const qualification=qualifiedAccount(assigning?payload.accountId:user.id,'maintenance.hours.period.confirm');
    if(!qualification)throw fail('负责人须为当前有效且具有全维修范围账期确认权限的人员');
    if(!assigning && (current.responsible_account_id!==user.id || current.responsible_person_id!==qualification.personId))throw fail('只有该月份指定负责人可以确认账期',403);
    if(!assigning && !['OPEN','CLOSED'].includes(payload.state))throw fail('请明确确认账期开放或封账');
    if(assigning && current.responsible_account_id===qualification.accountId && current.responsible_person_id===qualification.personId)throw fail('该人员已是本月负责人，无需重复指定',409);
    const stamp=clock(),revision=Number(current.revision)+1;
    const next={month,responsible_account_id:qualification.accountId,responsible_person_id:qualification.personId,state:assigning?'UNKNOWN':payload.state,
      revision,confirmed_by:assigning?null:user.id,confirmed_at:assigning?null:stamp,updated_at:stamp};
    db.prepare(`insert into maintenance_hour_periods(month,responsible_account_id,responsible_person_id,state,revision,confirmed_by,confirmed_at,updated_at) values(?,?,?,?,?,?,?,?)
      on conflict(month) do update set responsible_account_id=excluded.responsible_account_id,responsible_person_id=excluded.responsible_person_id,state=excluded.state,revision=excluded.revision,confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,updated_at=excluded.updated_at`)
      .run(...Object.values(next));
    db.prepare('insert into maintenance_hour_period_history(id,month,revision,action,actor_id,reason,snapshot_json,qualification_json,created_at) values(?,?,?,?,?,?,?,?,?)')
      .run(randomId('mhph'),month,revision,assigning?'ASSIGNED':'CONFIRMED',user.id,reason,JSON.stringify({before:current,after:next}),JSON.stringify(qualification),stamp);
    return view(month,user);
  });}
  return {state,view,capabilities,candidates,assign:(month,payload,user)=>mutate(month,payload,user,true),confirm:(month,payload,user)=>mutate(month,payload,user,false)};
}
