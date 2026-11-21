import {reviewStorage} from './review-storage.mjs';
export const NONROUTINE_NOTIFICATIONS_SCHEMA=`create table if not exists maintenance_nonroutine_review_notifications(
  id text primary key,
  outbox_id text not null unique references maintenance_nonroutine_review_outbox(id),
  case_id text not null references maintenance_nonroutine_review_cases(id),
  recipient_account_id text not null,
  event_type text not null,
  payload_json text not null,
  created_at text not null,
  read_at text
);
create index if not exists maintenance_nonroutine_notification_recipient on maintenance_nonroutine_review_notifications(recipient_account_id,created_at,id);`;
const permission=action=>`maintenance.nonroutine.review.${action}`;
const fail=(message,status)=>Object.assign(new Error(message),{status});
export function createNonroutineNotifications({db:database,transaction,qualifiedAccount,can,clock,randomId,purpose='WORK'}){
  const db=reviewStorage(database,purpose),label=purpose==='STANDARD'?'标准':'非例行';
  const title=eventType=>eventType==='ASSIGNED'?`新增${label}评议任务`:['REMINDER_36','REMINDER_48'].includes(eventType)?`${label}评议协调及终审提醒`:`${label}评议待提交提醒`;
  function eligibility(outbox,item){
    if(!item || !['IN_REVIEW','SEALED'].includes(item.state))return false;
    if(['ASSIGNED','REMINDER_24'].includes(outbox.event_type)){
      if(item.state!=='IN_REVIEW')return false;
      const person=qualifiedAccount(outbox.recipient_account_id,permission('opinion.submit'),item);
      if(!person || !db.prepare('select 1 from maintenance_nonroutine_review_seats where case_id=? and account_id=? and person_id=?').get(item.id,person.accountId,person.personId))return false;
      return !db.prepare('select 1 from maintenance_nonroutine_review_opinions where case_id=? and person_id=?').get(item.id,person.personId);
    }
    return ['REMINDER_36','REMINDER_48'].includes(outbox.event_type) && item.finalizer_account_id===outbox.recipient_account_id && Boolean(qualifiedAccount(outbox.recipient_account_id,permission('finalize'),item));
  }
  function pump(){return transaction(()=>{
    const stamp=clock(),time=Date.parse(stamp);if(!Number.isFinite(time))throw fail('通知时钟无效',500);
    const rows=db.prepare("select * from maintenance_nonroutine_review_outbox where state='PENDING' order by due_at,id limit 100").all();
    let delivered=0,cancelled=0;
    for(const row of rows){
      if(Date.parse(row.due_at)>time)continue;
      const item=db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(row.case_id);
      if(!Number.isFinite(Date.parse(row.due_at)) || !eligibility(row,item)){
        db.prepare("update maintenance_nonroutine_review_outbox set state='CANCELLED' where id=? and state='PENDING'").run(row.id);cancelled++;continue;
      }
      const finalizer=['REMINDER_36','REMINDER_48'].includes(row.event_type);
      const payload={caseId:item.id,eventType:row.event_type,title:title(row.event_type)};
      if(finalizer){
        const seats=db.prepare(`select s.person_id from maintenance_nonroutine_review_seats s where s.case_id=? and not exists
          (select 1 from maintenance_nonroutine_review_opinions o where o.case_id=s.case_id and o.person_id=s.person_id) order by s.person_id`).all(item.id);
        payload.submittedCount=Number(db.prepare('select count(*) n from maintenance_nonroutine_review_opinions where case_id=?').get(item.id).n);payload.pendingPersonIds=seats.map(seat=>seat.person_id);payload.awaitingFinalization=item.state==='SEALED';
      }
      const inserted=db.prepare('insert into maintenance_nonroutine_review_notifications(id,outbox_id,case_id,recipient_account_id,event_type,payload_json,created_at) values(?,?,?,?,?,?,?) on conflict(outbox_id) do nothing')
        .run(randomId('nrn'),row.id,item.id,row.recipient_account_id,row.event_type,JSON.stringify(payload),stamp);
      db.prepare("update maintenance_nonroutine_review_outbox set state='SENT' where id=? and state='PENDING'").run(row.id);
      delivered+=Number(inserted.changes || 0);
    }
    return {delivered,cancelled};
  });}
  function visible(row,user){
    const item=db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(row.case_id);
    return row.recipient_account_id===user.id && item && can(user,permission('view'),item) && eligibility(row,item);
  }
  function currentPayload(row){
    const payload={caseId:row.case_id,eventType:row.event_type,title:title(row.event_type)};
    if(['REMINDER_36','REMINDER_48'].includes(row.event_type)){
      const seats=db.prepare(`select s.person_id,s.qualification_json from maintenance_nonroutine_review_seats s where s.case_id=? and not exists
        (select 1 from maintenance_nonroutine_review_opinions o where o.case_id=s.case_id and o.person_id=s.person_id) order by s.person_id`).all(row.case_id);
      payload.submittedCount=Number(db.prepare('select count(*) n from maintenance_nonroutine_review_opinions where case_id=?').get(row.case_id).n);
      payload.pendingPeople=seats.map(seat=>{const person=JSON.parse(seat.qualification_json);return {personId:seat.person_id,name:person.personName||seat.person_id,employeeNo:person.employeeNo||''};});
      payload.pendingPersonIds=seats.map(seat=>seat.person_id);
      payload.awaitingFinalization=db.prepare('select state from maintenance_nonroutine_review_cases where id=?').get(row.case_id).state==='SEALED';
    }
    return payload;
  }
  function list(user){
    return db.prepare('select * from maintenance_nonroutine_review_notifications where recipient_account_id=? order by created_at desc,id desc').all(user.id)
      .filter(row=>visible(row,user)).slice(0,100).map(row=>({id:row.id,caseId:row.case_id,eventType:row.event_type,payload:currentPayload(row),createdAt:row.created_at,readAt:row.read_at}));
  }
  function markRead(id,user){return transaction(()=>{
    const row=db.prepare('select * from maintenance_nonroutine_review_notifications where id=? and recipient_account_id=?').get(id,user.id);
    if(!row || !visible(row,user))throw fail('未找到可访问的评议通知',404);
    const stamp=row.read_at || clock();
    if(!row.read_at)db.prepare('update maintenance_nonroutine_review_notifications set read_at=? where id=? and read_at is null').run(stamp,id);
    return {id,readAt:stamp};
  });}
  return {pump,list,markRead};
}
