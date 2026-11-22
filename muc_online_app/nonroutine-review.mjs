import { NONROUTINE_CATEGORY_STRATEGIES } from "./maintenance-standards.mjs";
import {reviewStorage} from './review-storage.mjs';

export const NONROUTINE_REVIEW_SCHEMA = `create table if not exists maintenance_nonroutine_review_cases(
  id text primary key,
  flight_id text not null,
  subtask_id text not null,
  report_batch_id text not null,
  application_revision integer not null,
  application_json text not null,
  participants_json text not null,
  policy_json text,
  applicant_account_id text not null,
  state text not null check(state in ('PENDING_ACCEPTANCE','IN_REVIEW','SEALED','FINALIZED','CANCELLED')),
  revision integer not null default 1,
  finalizer_account_id text,
  accepted_at text,
  sealed_at text,
  created_at text not null,
  updated_at text not null,
  unique(subtask_id,report_batch_id,application_revision)
);
create table if not exists maintenance_nonroutine_review_seats(
  id text primary key,
  case_id text not null references maintenance_nonroutine_review_cases(id),
  person_id text not null,
  account_id text not null,
  qualification_json text not null,
  assigned_by text not null,
  assigned_at text not null,
  unique(case_id,person_id),
  unique(case_id,account_id),
  unique(case_id,person_id,account_id)
);
create table if not exists maintenance_nonroutine_review_opinions(
  case_id text not null references maintenance_nonroutine_review_cases(id),
  person_id text not null,
  account_id text not null,
  hours real not null check(hours>=0),
  basis text not null,
  revision integer not null,
  qualification_json text not null,
  submitted_at text not null,
  updated_at text not null,
  primary key(case_id,person_id),
  foreign key(case_id,person_id,account_id) references maintenance_nonroutine_review_seats(case_id,person_id,account_id)
);
create table if not exists maintenance_nonroutine_review_opinion_history(
  id text primary key,
  case_id text not null,
  person_id text not null,
  account_id text not null,
  revision integer not null,
  opinion_json text not null,
  created_at text not null,
  unique(case_id,person_id,revision)
);
create table if not exists maintenance_nonroutine_review_events(
  id text primary key,
  case_id text not null,
  actor_id text not null,
  event_type text not null,
  detail_json text not null,
  created_at text not null
);
create table if not exists maintenance_nonroutine_review_outbox(
  id text primary key,
  case_id text not null,
  event_type text not null,
  recipient_account_id text not null,
  due_at text not null,
  state text not null default 'PENDING',
  generation integer not null default 1,
  created_at text not null,
  unique(case_id,event_type,recipient_account_id,generation)
);
create index if not exists maintenance_nonroutine_review_flight on maintenance_nonroutine_review_cases(flight_id,state);
create index if not exists maintenance_nonroutine_review_recipient on maintenance_nonroutine_review_seats(account_id,case_id);
create index if not exists maintenance_nonroutine_review_due on maintenance_nonroutine_review_outbox(state,due_at);
`;

const permission = action => `maintenance.nonroutine.review.${action}`;
export const NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA = `create table if not exists maintenance_nonroutine_review_suggestions(
  id text primary key,
  case_id text not null references maintenance_nonroutine_review_cases(id),
  person_id text not null,
  account_id text not null,
  client_id text not null,
  field text not null check(field in ('category','chapter','title','workScope')),
  original_value text not null,
  proposed_value text not null,
  reason text not null,
  created_at text not null,
  unique(case_id,account_id,client_id)
);
create index if not exists maintenance_nonroutine_review_suggestion_case on maintenance_nonroutine_review_suggestions(case_id,created_at,id);
`;
export const NONROUTINE_REVIEW_SUGGESTION_NOTICE = '共享建议仅用于类别、ATA、名称及范围；禁止填写本人或他人的具体工时、工时评价依据。';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function hours(value) {
  if (!['number','string'].includes(typeof value) || typeof value === 'string' && !value.trim()) throw fail('请填写评议工时');
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 10000 || Math.abs(number * 10 - Math.round(number * 10)) > 1e-8) throw fail('工时须为0至10000小时，且以0.1小时为单位');
  return number;
}
export function reviewStatistics(values) {
  if (values.length !== 12 || values.some(value => !Number.isFinite(value) || value < 0 || value > 10000 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-8)) throw fail('必须具有12份有效意见', 409);
  const tenths = values.map(value => Math.round(value * 10)).sort((left, right) => left - right);
  return { trimmedMean: tenths.slice(1, 11).reduce((sum, value) => sum + value, 0) / 100, median: (tenths[5] + tenths[6]) / 20 };
}

export function createNonroutineReview({ db:database, transaction, can, qualifiedAccount, clock, randomId, candidateAccounts=()=>[],canAssignPerson=()=>true,finalizationEnabled=()=>false,purpose='WORK',sourceContext=()=>({}),sourceFacts=()=>null }) {
  const db=reviewStorage(database,purpose);
  function load(id, user, action = 'view') {
    const item = db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(id);
    if (!item || !can(user, permission(action), item)) throw fail('未找到可访问的非例行评议', 404);
    return item;
  }
  function event(item, user, type, detail = {}) {
    db.prepare('insert into maintenance_nonroutine_review_events(id,case_id,actor_id,event_type,detail_json,created_at) values(?,?,?,?,?,?)')
      .run(randomId('nre'), item.id, user.id, type, JSON.stringify(detail), clock());
  }
  // The report service owns the transaction that creates a case and its source snapshot.
  function create(input) {
    if(purpose!=='WORK')throw fail('标准版本评议须从独立的标准来源申请入口建立');
    if (!input.flightId || !input.subtaskId || !input.reportBatchId || !Number.isInteger(input.applicationRevision) || input.applicationRevision < 1) throw fail('评议来源身份不完整');
    const raw = input.snapshot || {};
    const snapshot = { category: String(raw.category || ''), chapter: String(raw.chapter || '').trim(), title: String(raw.title || '').trim(), workScope: String(raw.workScope || '').trim(), requestedHours: hours(raw.requestedHours) };
    if (!Object.hasOwn(NONROUTINE_CATEGORY_STRATEGIES, snapshot.category) || !snapshot.chapter || !snapshot.title || !snapshot.workScope || snapshot.chapter.length > 200 || snapshot.title.length > 500 || snapshot.workScope.length > 4000) throw fail('申请类别、ATA、名称及工作范围必须完整且在长度限制内');
    if (!(hours(snapshot.requestedHours) > 0)) throw fail('申请工时须大于0');
    if (!input.applicantId || !Array.isArray(input.participants) || !input.participants.length || input.participants.some(person => !person?.personId || !['主做','检验','辅助'].includes(person.role))) throw fail('缺少实际参与人员快照');
    if (new Set(input.participants.map(person => JSON.stringify([person.personId,person.role]))).size !== input.participants.length) throw fail('实际人员工种快照重复');
    const application = JSON.stringify(snapshot), participants = JSON.stringify(input.participants);
    const previous = db.prepare('select * from maintenance_nonroutine_review_cases where subtask_id=? and report_batch_id=? and application_revision=?')
      .get(input.subtaskId, input.reportBatchId, input.applicationRevision);
    if (previous) {
      if (previous.flight_id !== input.flightId || previous.applicant_account_id !== input.applicantId || previous.application_json !== application || previous.participants_json !== participants || previous.policy_json !== (input.policySnapshot ? JSON.stringify(input.policySnapshot) : null)) throw fail('同一报工来源的申请快照不一致', 409);
      return previous.id;
    }
    const id = randomId('nrc'), stamp = clock();
    db.prepare(`insert into maintenance_nonroutine_review_cases(id,flight_id,subtask_id,report_batch_id,application_revision,application_json,participants_json,policy_json,applicant_account_id,state,revision,created_at,updated_at)
      values(?,?,?,?,?,?,?,?,?,?,1,?,?)`)
      .run(id, input.flightId, input.subtaskId, input.reportBatchId, input.applicationRevision, application, participants, input.policySnapshot ? JSON.stringify(input.policySnapshot) : null, input.applicantId, purpose==='WORK' ? 'IN_REVIEW' : 'PENDING_ACCEPTANCE', stamp, stamp);
    return id;
  }
  function view(id, user) {
    const item = load(id, user);
    const seats = db.prepare('select person_id,account_id,qualification_json from maintenance_nonroutine_review_seats where case_id=? order by assigned_at,id').all(id);
    const opinions = db.prepare('select * from maintenance_nonroutine_review_opinions where case_id=? order by person_id').all(id);
    const readAll = canReadAllOpinions(item, user);
    const visible = readAll ? opinions : opinions.filter(opinion => opinion.person_id === user.personId && opinion.account_id === user.id);
    const ownSeat=seats.some(seat=>seat.person_id===user.personId && seat.account_id===user.id);
    const facts=purpose==='WORK'?sourceFacts(item,user):null;
    const namedFinalizer=purpose==='WORK' ? Boolean(qualifiedAccount(user.id,permission('finalize'),item)) : item.finalizer_account_id===user.id && Boolean(qualifiedAccount(user.id,permission('finalize'),item));
    return {
      id, state: item.state, revision: Number(item.revision), application: JSON.parse(item.application_json),
      ...(purpose==='STANDARD'?{purpose,source:{kind:'STANDARD_VERSION',standardId:item.standard_id,versionId:item.version_id,baseVersionId:item.base_version_id,aircraft:JSON.parse(item.aircraft_json),...sourceContext(item)}}:{}),
      ...(facts?{sourceFacts:readAll?facts:{available:facts.available,changed:facts.changed,fields:(facts.differences||[]).map(row=>row.field),participantsChanged:facts.participantsChanged,participantIdentityChanged:facts.participantIdentityChanged}}:{}),
      acceptedAt: item.accepted_at, sealedAt: item.sealed_at, submittedCount: opinions.length, seatsFilled: seats.length, seatsRemaining: Math.max(0, 12 - seats.length),
      capabilities:{cancel:purpose==='WORK' && ['PENDING_ACCEPTANCE','IN_REVIEW','SEALED','FINALIZED'].includes(item.state) && can(user,permission('cancel'),item),submitOpinion:item.state==='IN_REVIEW' && (purpose==='WORK' ? Boolean(qualifiedAccount(user.id,permission('opinion.submit'),item)) : ownSeat && Boolean(qualifiedAccount(user.id,permission('opinion.submit'),item))),assign:purpose!=='WORK'&&item.state==='PENDING_ACCEPTANCE'&&can(user,permission('assign'),item),replaceSeat:purpose!=='WORK'&&item.state==='IN_REVIEW'&&can(user,permission('assign'),item),
        
        readAllOpinions:readAll,finalizationView:finalizationEnabled() && ((readAll && (['SEALED','FINALIZED'].includes(item.state)||purpose==='WORK'&&item.state==='CANCELLED'&&Boolean(item.sealed_at)))||(purpose==='STANDARD'&&item.state==='FINALIZED')),
        finalize:finalizationEnabled() && item.state==='SEALED' && namedFinalizer,sync:purpose==='WORK' && finalizationEnabled() && item.state==='FINALIZED' && namedFinalizer},
      ...(readAll&&purpose==='WORK'?{sourceParticipants:JSON.parse(item.participants_json),sourcePolicy:JSON.parse(item.policy_json||'null')}:{}),
      seats: seats.map(seat => {const person=JSON.parse(seat.qualification_json);return { personId: seat.person_id, accountId: seat.account_id,personName:person.personName||seat.person_id,employeeNo:person.employeeNo||'', submitted: opinions.some(opinion => opinion.person_id === seat.person_id) };}),
      opinions: visible.map(opinion => ({ personId: opinion.person_id, accountId: opinion.account_id, hours: Number(opinion.hours), basis: opinion.basis, revision: Number(opinion.revision) })),
      suggestionNotice: NONROUTINE_REVIEW_SUGGESTION_NOTICE,
      suggestions: db.prepare('select * from maintenance_nonroutine_review_suggestions where case_id=? order by created_at,id').all(id)
        .map(row => ({ id: row.id, personId: row.person_id, accountId: row.account_id, field: row.field, originalValue: row.original_value, proposedValue: row.proposed_value, reason: row.reason, createdAt: row.created_at })),
      ...(readAll && opinions.length === 12 ? { statistics: reviewStatistics(opinions.map(opinion => Number(opinion.hours))) } : {})
    };
  }
  function list(payload,user){
    const state=String(payload?.state || ''),search=String(payload?.search || '').trim().toLowerCase().slice(0,200);
    if(state && !['PENDING_ACCEPTANCE','IN_REVIEW','SEALED','FINALIZED','CANCELLED'].includes(state))throw fail('评议状态筛选无效');
    let after=null;
    if(payload?.cursor){try{after=JSON.parse(payload.cursor);}catch{throw fail('评议分页标识无效');}
      if(!Array.isArray(after)||after.length!==2||after.some(value=>typeof value!=='string'||!value||value.length>200))throw fail('评议分页标识无效');}
    const rows=db.prepare('select * from maintenance_nonroutine_review_cases order by created_at desc,id desc').all()
      .filter(item=>can(user,permission('view'),item) && (!state || item.state===state) && (!after || item.created_at<after[0] || item.created_at===after[0]&&item.id<after[1]))
      .filter(item=>!search || Object.values(JSON.parse(item.application_json)).some(value=>String(value).toLowerCase().includes(search)));
    const counts=new Map(db.prepare('select case_id,count(*) n from maintenance_nonroutine_review_opinions group by case_id').all().map(row=>[row.case_id,Number(row.n)]));
    const visible=rows.slice(0,50);
    return {items:visible.map(item=>{const application=JSON.parse(item.application_json);return {id:item.id,...(purpose==='STANDARD'?{purpose,standardId:item.standard_id,versionId:item.version_id}:{flightId:item.flight_id}),state:item.state,
      title:application.title,category:application.category,chapter:application.chapter,workScope:application.workScope,submittedCount:counts.get(item.id)||0,createdAt:item.created_at};}),
      nextCursor:rows.length>50?JSON.stringify([visible.at(-1).created_at,visible.at(-1).id]):null};
  }
  function canReadAllOpinions(item, user) {
    return can(user, permission('opinions.view'), item) || (purpose==='WORK' ? (['SEALED','FINALIZED'].includes(item.state)||item.state==='CANCELLED'&&Boolean(item.sealed_at)) && can(user, permission('finalize'), item) : item.finalizer_account_id === user.id && (['SEALED','FINALIZED'].includes(item.state)||purpose==='WORK'&&item.state==='CANCELLED'&&Boolean(item.sealed_at)) && can(user, permission('finalize'), item));
  }
  function opinionHistory(id, payload, user) {
    const item = load(id, user);
    const personId = payload?.personId || user.personId;
    if (!personId || personId !== user.personId && !canReadAllOpinions(item, user)) throw fail('无权读取他人的工时意见历史', 403);
    const before = payload?.beforeRevision == null ? 2147483647 : Number(payload.beforeRevision);
    if (!Number.isInteger(before) || before < 1 || before > 2147483647) throw fail('意见历史游标无效');
    // Filter private rows in the query, including the account identity for self reads.
    const rows = canReadAllOpinions(item, user)
      ? db.prepare('select * from maintenance_nonroutine_review_opinion_history where case_id=? and person_id=? and revision<? order by revision desc limit 101').all(id, personId, before)
      : db.prepare('select * from maintenance_nonroutine_review_opinion_history where case_id=? and person_id=? and account_id=? and revision<? order by revision desc limit 101').all(id, personId, user.id, before);
    const entries = rows.slice(0,100).map(row => {
      const opinion = JSON.parse(row.opinion_json);
      return { personId: row.person_id, accountId: row.account_id, revision: Number(row.revision), hours: Number(opinion.hours), basis: opinion.basis, createdAt: row.created_at };
    });
    return { entries, nextBeforeRevision: rows.length > 100 ? entries.at(-1).revision : null };
  }
  function suggest(id, payload, user) {
    return transaction(() => {
      const item = load(id, user, 'opinion.submit');
      const seat = db.prepare('select * from maintenance_nonroutine_review_seats where case_id=? and account_id=? and person_id=?').get(id,user.id,user.personId);
      const qualified = seat && qualifiedAccount(user.id, permission('opinion.submit'), item);
      if (!qualified || qualified.personId !== seat.person_id) throw fail('当前账户不是本轮有效指定评议人',403);
      if (!payload || Object.keys(payload).some(key => !['clientId','field','proposedValue','reason','privacyAcknowledged'].includes(key))) throw fail('共享建议仅接受四项非工时字段');
      const field = payload.field;
      const limits = { category: 100, chapter: 200, title: 500, workScope: 4000 };
      if (!Object.hasOwn(limits,field)) throw fail('共享建议仅接受类别、ATA、名称及范围');
      const value = typeof payload.proposedValue === 'string' ? payload.proposedValue.trim() : '';
      const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
      const clientId = typeof payload.clientId === 'string' ? payload.clientId : '';
      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(clientId)) throw fail('共享建议请求标识无效');
      if (!value || value.length > limits[field] || !reason || reason.length > 1000) throw fail('建议值或理由为空、或超过长度限制');
      if (field === 'category' && !Object.hasOwn(NONROUTINE_CATEGORY_STRATEGIES,value)) throw fail('请选择有效的非例行类别');
      if (payload.privacyAcknowledged !== true) throw fail(NONROUTINE_REVIEW_SUGGESTION_NOTICE);
      // Catch explicit hour amounts; the required notice also covers prose that cannot be classified reliably.
      const hourAmount = /(?:\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万半]+)\s*(?:个?小时|工时|人时|hours?\b|hrs?\b)|(?:工时|小时|hours?)\s*[:：=为是]?\s*\d/i;
      if (hourAmount.test(`${value}\n${reason}`)) throw fail(NONROUTINE_REVIEW_SUGGESTION_NOTICE);
      const previous = db.prepare('select * from maintenance_nonroutine_review_suggestions where case_id=? and account_id=? and client_id=?').get(id,user.id,clientId);
      if (previous) {
        if (previous.field !== field || previous.proposed_value !== value || previous.reason !== reason) throw fail('同一请求标识的共享建议内容不一致',409);
        return view(id,user);
      }
      if (item.state !== 'IN_REVIEW') throw fail('本轮评议未开放或已封闭',409);
      const original = JSON.parse(item.application_json)[field];
      if (value === original) throw fail('建议值与原申请相同');
      const suggestionId = randomId('nrg');
      db.prepare('insert into maintenance_nonroutine_review_suggestions(id,case_id,person_id,account_id,client_id,field,original_value,proposed_value,reason,created_at) values(?,?,?,?,?,?,?,?,?,?)')
        .run(suggestionId,id,user.personId,user.id,clientId,field,original,value,reason,clock());
      // Public event and SSE carry only identity; suggestion text never copies private opinion fields.
      event(item,user,'FIELD_SUGGESTED',{ suggestionId,field });
      return view(id,user);
    });
  }
  function outbox(caseId, type, accountId, dueAt, generation = 1) {
    db.prepare('insert into maintenance_nonroutine_review_outbox(id,case_id,event_type,recipient_account_id,due_at,state,generation,created_at) values(?,?,?,?,?,\'PENDING\',?,?)')
      .run(randomId('nro'), caseId, type, accountId, dueAt, generation, clock());
  }
  function submitOpinion(id, payload, user) {
    return transaction(() => {
      const item = load(id, user, 'opinion.submit');
      if (item.state !== 'IN_REVIEW') throw fail('本轮评议已封轮或未开放', 409);
      const seat = db.prepare('select * from maintenance_nonroutine_review_seats where case_id=? and account_id=? and person_id=?').get(id, user.id, user.personId);
      const qualified = qualifiedAccount(user.id, permission('opinion.submit'), item);
      if (!qualified || qualified.personId !== user.personId) throw fail('当前账户不具备评议资格或数据范围', 403);
      if (purpose === 'WORK') {
        // 权限即资格+动态占席（用户定稿 2026-11-22）：无席位且未满 12 席时创建席位记录
        if (!seat) {
          const seatCount = Number(db.prepare('select count(*) n from maintenance_nonroutine_review_seats where case_id=?').get(id).n);
          if (seatCount >= 12) throw fail('本轮评议已满 12 席', 409);
          db.prepare('insert into maintenance_nonroutine_review_seats(id,case_id,person_id,account_id,qualification_json,assigned_by,assigned_at) values(?,?,?,?,?,?,?)')
            .run(randomId('nrs'), id, user.personId, user.id, JSON.stringify(qualified), user.id, clock());
        }
      } else if (!seat) {
        throw fail('当前账户不是本轮有效指定评议人', 403);
      }
      const current = db.prepare('select * from maintenance_nonroutine_review_opinions where case_id=? and person_id=?').get(id, user.personId);
      if (Number(payload?.revision) !== Number(current?.revision || 0)) throw fail('本人意见已更新，请刷新后重试', 409);
      const amount = hours(payload.hours), basis = String(payload.basis || '').trim();
      if (!basis || basis.length > 4000) throw fail('请填写不超过4000字的工时评议依据');
      const version = Number(current?.revision || 0) + 1, stamp = clock();
      db.prepare(`insert into maintenance_nonroutine_review_opinions(case_id,person_id,account_id,hours,basis,revision,qualification_json,submitted_at,updated_at) values(?,?,?,?,?,?,?,?,?)
        on conflict(case_id,person_id) do update set hours=excluded.hours,basis=excluded.basis,revision=excluded.revision,qualification_json=excluded.qualification_json,updated_at=excluded.updated_at`)
        .run(id, user.personId, user.id, amount, basis, version, JSON.stringify(qualified), current?.submitted_at || stamp, stamp);
      db.prepare('insert into maintenance_nonroutine_review_opinion_history(id,case_id,person_id,account_id,revision,opinion_json,created_at) values(?,?,?,?,?,?,?)')
        .run(randomId('nrh'), id, user.personId, user.id, version, JSON.stringify({ hours: amount, basis, qualification: qualified }), stamp);
      db.prepare("update maintenance_nonroutine_review_outbox set state='CANCELLED' where case_id=? and recipient_account_id=? and event_type='REMINDER_24' and state='PENDING'").run(id, user.id);
      const count = Number(db.prepare('select count(*) n from maintenance_nonroutine_review_opinions where case_id=?').get(id).n);
      if (count === 12) db.prepare("update maintenance_nonroutine_review_cases set state='SEALED',revision=revision+1,sealed_at=?,updated_at=? where id=?").run(stamp, stamp, id);
      event(item, user, count === 12 ? 'SEALED' : 'OPINION_SUBMITTED', { personId: user.personId, revision: version, count });
      return view(id, user);
    });
  }
  function accept(id, payload, user) {
    return transaction(() => {
      const item = load(id, user, 'assign');
      if (purpose === 'WORK') throw fail('非例行评议已自动进入评议阶段，无需人工受理', 409);
      if (item.state !== 'PENDING_ACCEPTANCE' || Number(payload?.revision) !== Number(item.revision)) throw fail('评议状态或版本已变化', 409);
      const accounts = payload.accountIds;
      if (!Array.isArray(accounts) || accounts.length !== 12 || new Set(accounts).size !== 12) throw fail('请人工指定12名不同的有效评议人员');
      const people = accounts.map(accountId => qualifiedAccount(accountId, permission('opinion.submit'), item));
      if (people.some(person => !person || !canAssignPerson(user,person.personId)) || new Set(people.map(person => person.personId)).size !== 12) throw fail('评议人员身份、资格或数据范围无效');
      const finalizer = qualifiedAccount(payload.finalizerAccountId, permission('finalize'), item);
      if (!finalizer || !canAssignPerson(user,finalizer.personId)) throw fail('终审负责人资格或数据范围无效');
      const stamp = clock();
      for (const person of people) {
        db.prepare('insert into maintenance_nonroutine_review_seats(id,case_id,person_id,account_id,qualification_json,assigned_by,assigned_at) values(?,?,?,?,?,?,?)')
          .run(randomId('nrs'), id, person.personId, person.accountId, JSON.stringify(person), user.id, stamp);
        outbox(id, 'ASSIGNED', person.accountId, stamp);
        outbox(id, 'REMINDER_24', person.accountId, new Date(Date.parse(stamp) + 24 * 3600000).toISOString());
      }
      for (const delay of [36,48]) outbox(id, `REMINDER_${delay}`, finalizer.accountId, new Date(Date.parse(stamp) + delay * 3600000).toISOString());
      db.prepare("update maintenance_nonroutine_review_cases set state='IN_REVIEW',revision=revision+1,finalizer_account_id=?,accepted_at=?,updated_at=? where id=?")
        .run(finalizer.accountId, stamp, stamp, id);
      event(item, user, 'ACCEPTED', { personIds: people.map(person => person.personId), finalizerAccountId: finalizer.accountId });
      return view(id, user);
    });
  }
  function candidates(id,payload,user){
    const item=load(id,user,'assign');
    if(!['PENDING_ACCEPTANCE','IN_REVIEW'].includes(item.state))throw fail('本轮已封闭，不能再指定人员',409);
    if(!['opinion','finalize'].includes(payload?.role))throw fail('候选角色无效');
    const action=payload.role==='opinion'?'opinion.submit':'finalize';
    const search=String(payload.search || '').trim().slice(0,100);
    const eligible=candidateAccounts(search,user).filter(account=>canAssignPerson(user,account.personId) && qualifiedAccount(account.accountId,permission(action),item));
    return {items:eligible.slice(0,100).map(account=>({accountId:account.accountId,personId:account.personId,name:account.name,employeeNo:account.employeeNo})),truncated:eligible.length>100};
  }
  function replaceUnsubmittedSeat(id, payload, user) {
    return transaction(() => {
      const item = load(id, user, 'assign');
      if (purpose === 'WORK') throw fail('非例行评议席位为动态占席，不支持人工替换', 409);
      if (item.state !== 'IN_REVIEW' || Number(payload?.revision) !== Number(item.revision)) throw fail('评议状态或版本已变化',409);
      const reason = String(payload.reason || '').trim();
      if (!reason || reason.length > 1000) throw fail('替换席位必须填写不超过1000字的原因');
      const seat = db.prepare('select * from maintenance_nonroutine_review_seats where case_id=? and person_id=?').get(id,payload.personId);
      if (!seat) throw fail('未找到该评议席位',404);
      if (db.prepare('select 1 from maintenance_nonroutine_review_opinions where case_id=? and person_id=?').get(id,seat.person_id)) throw fail('已提交意见的席位不能替换',409);
      const person = qualifiedAccount(payload.accountId,permission('opinion.submit'),item);
      if (!person || !canAssignPerson(user,person.personId)) throw fail('新评议人员资格或数据范围无效');
      if(person.personId===seat.person_id && person.accountId===seat.account_id)throw fail('该人员账户已占用此席位，无需替换',409);
      if (db.prepare('select 1 from maintenance_nonroutine_review_seats where case_id=? and id<>? and (person_id=? or account_id=?)').get(id,seat.id,person.personId,person.accountId)) throw fail('新评议人员已占用本轮席位',409);
      const stamp = clock(), generation = Number(item.revision)+1;
      db.prepare('update maintenance_nonroutine_review_seats set person_id=?,account_id=?,qualification_json=?,assigned_by=?,assigned_at=? where id=?')
        .run(person.personId,person.accountId,JSON.stringify(person),user.id,stamp,seat.id);
      db.prepare("update maintenance_nonroutine_review_outbox set state='CANCELLED' where case_id=? and recipient_account_id=? and event_type in ('ASSIGNED','REMINDER_24') and state='PENDING'").run(id,seat.account_id);
      outbox(id,'ASSIGNED',person.accountId,stamp,generation);
      const due = new Date(Date.parse(item.accepted_at)+24*3600000).toISOString();
      outbox(id,'REMINDER_24',person.accountId,due,generation);
      db.prepare('update maintenance_nonroutine_review_cases set revision=revision+1,updated_at=? where id=?').run(stamp,id);
      event(item,user,'SEAT_REPLACED',{ previousPersonId:seat.person_id,previousAccountId:seat.account_id,personId:person.personId,accountId:person.accountId,reason });
      return view(id,user);
    });
  }
  return { create, view, list, candidates, accept, submitOpinion, replaceUnsubmittedSeat, suggest, opinionHistory };
}
