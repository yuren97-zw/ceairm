import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { NONROUTINE_REVIEW_SCHEMA, NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA, createNonroutineReview, reviewStatistics } from '../nonroutine-review.mjs';

const code = action => `maintenance.nonroutine.review.${action}`;
function fixture(t) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec('pragma foreign_keys=on'); db.exec(NONROUTINE_REVIEW_SCHEMA);
  db.exec(NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA);
  const people = new Map();
  function user(id, actions, personId = id) {
    const account = { id, personId, scope: true, active: true, permissions: actions.map(code) };
    people.set(id, account); return account;
  }
  const boss = user('boss', ['view','assign','opinion.submit']);
  const finalizer = user('final', ['view','finalize']);
  const auditor = user('auditor', ['view','opinions.view']);
  const reviewers = Array.from({ length: 12 }, (_, index) => user(`account-${index}`, ['view','opinion.submit'], `person-${index}`));
  const can = (actor, permission, item) => actor.scope && actor.active && actor.permissions.includes(permission) && (!item || !actor.caseIds || actor.caseIds.has(item.id));
  let counter = 0;
  const service = createNonroutineReview({
    db, can, clock: () => '2026-11-09T00:00:00Z', randomId: prefix => `${prefix}-${++counter}`,
    candidateAccounts(search){return [...people.values()].filter(actor=>actor.id.includes(search)).map(actor=>({accountId:actor.id,personId:actor.personId,name:actor.id,employeeNo:actor.personId}));},
    canAssignPerson:(user,personId)=>!user.nominationPeople || user.nominationPeople.has(personId),
    finalizationEnabled:()=>true,
    qualifiedAccount(accountId, permission) { const actor = people.get(accountId); return actor && can(actor,permission) ? { accountId: actor.id, personId: actor.personId, permissionSnapshot: [...actor.permissions] } : null; },
    transaction(action) { db.exec('begin immediate'); try { const result = action(); db.exec('commit'); return result; } catch (error) { db.exec('rollback'); throw error; } }
  });
  const input = { flightId: 'flight-one', subtaskId: 'task-one', reportBatchId: 'batch-one', applicationRevision: 1, applicantId: 'applicant',
    snapshot: { category: '单项工作', chapter: '29', title: '液压检查', workScope: '左侧管路', requestedHours: 2 }, participants: [{ personId: 'worker', role: '主做' }] };
  const id = service.create(input);
  const accept = () => service.accept(id, { revision: 1, accountIds: reviewers.map(actor => actor.id), finalizerAccountId: finalizer.id }, boss);
  return { db, service, id, input, boss, finalizer, auditor, reviewers, accept, user };
}

test('review schema matches the additive migration and preserves one immutable application per source', t => {
  const { db, service, id, input } = fixture(t);
  const other = new DatabaseSync(':memory:'); t.after(() => other.close());
  const sql = fs.readFileSync(new URL('../migrations/041_nonroutine_review.sql',import.meta.url),'utf8');
  other.exec(sql); other.exec(sql);
  const suggestionsSql = fs.readFileSync(new URL('../migrations/042_nonroutine_review_suggestions.sql',import.meta.url),'utf8');
  other.exec(suggestionsSql); other.exec(suggestionsSql);
  const schema = database => database.prepare('select name,sql from sqlite_master order by name').all();
  assert.deepEqual(schema(db), schema(other));
  assert.equal(service.create(input),id);
  assert.throws(() => service.create({ ...input, snapshot: { ...input.snapshot, requestedHours: 3 } }), { status: 409 });
  assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases').get().n),1);
  const second = service.create({ ...input,subtaskId:'task-two' });
  const third = service.create({ ...input,subtaskId:'task-three' });
  assert.equal(new Set([id,second,third]).size,3);
  assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases').get().n),3);
});

test('acceptance requires twelve different qualified people and schedules only 24,36,48 hour reminders', t => {
  const { db, service, id, boss, finalizer, reviewers, accept, user } = fixture(t);
  assert.throws(() => service.accept(id, { revision: 1, accountIds: reviewers.slice(1).map(actor => actor.id), finalizerAccountId: finalizer.id }, boss), { status: 400 });
  const alias = user('alias-account', ['view','opinion.submit'],reviewers[0].personId);
  assert.throws(() => service.accept(id, { revision: 1, accountIds: [...reviewers.slice(0,11).map(actor => actor.id),alias.id], finalizerAccountId: finalizer.id }, boss), { status: 400 });
  assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_seats').get().n),0);
  const accepted = accept();
  assert.equal(accepted.state,'IN_REVIEW');
  const due = db.prepare('select event_type,due_at from maintenance_nonroutine_review_outbox order by due_at').all();
  assert.equal(due.filter(row => row.event_type==='REMINDER_24').length,12);
  assert.equal(due.filter(row => row.event_type==='REMINDER_36').length,1);
  assert.equal(due.filter(row => row.event_type==='REMINDER_48').length,1);
  assert.ok(due.every(row => !row.event_type.includes('72')));
});

test('ordinary reviewers see only their own hours and basis, including before and after sealing', t => {
  const { service, id, reviewers, auditor, finalizer, accept } = fixture(t); accept();
  for (let index=0;index<12;index++) {
    const result = service.submitOpinion(id,{ revision:0,hours:index+1,basis:`PRIVATE-BASIS-${index}` },reviewers[index]);
    assert.equal(result.opinions.length,1);
    assert.equal(result.opinions[0].personId,reviewers[index].personId);
    assert.equal(result.statistics,undefined);
    assert.equal(result.state,index===11?'SEALED':'IN_REVIEW');
  }
  const self = service.view(id,reviewers[0]);
  assert.ok(!JSON.stringify(self).includes('PRIVATE-BASIS-1'));
  const full = service.view(id,auditor);
  assert.equal(full.opinions.length,12);
  assert.deepEqual(full.statistics,{ trimmedMean:6.5,median:6.5 });
  assert.equal(service.view(id,finalizer).opinions.length,12);
  assert.throws(() => service.submitOpinion(id,{ revision:1,hours:9,basis:'changed' },reviewers[0]),{ status:409 });
});

test('opinion revisions and eligibility are rechecked, and an unassigned administrator cannot submit', t => {
  const { db, service, id, boss, reviewers, accept } = fixture(t); accept();
  assert.throws(() => service.submitOpinion(id,{ revision:0,hours:2,basis:'admin opinion' },boss),{ status:403 });
  service.submitOpinion(id,{ revision:0,hours:2,basis:'first' },reviewers[0]);
  assert.throws(() => service.submitOpinion(id,{ revision:0,hours:3,basis:'stale' },reviewers[0]),{ status:409 });
  service.submitOpinion(id,{ revision:1,hours:3,basis:'revised' },reviewers[0]);
  assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_opinion_history').get().n),2);
  reviewers[1].active=false;
  assert.throws(() => service.submitOpinion(id,{ revision:0,hours:2,basis:'inactive' },reviewers[1]),{ status:404 });
  reviewers[1].active=true;
  for (const value of ['',null,true,' ',0.15,-1]) assert.throws(() => service.submitOpinion(id,{ revision:0,hours:value,basis:'invalid' },reviewers[1]),{ status:400 });
  assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_opinions').get().n),1);
});

test('tied extremes remove exactly one high and one low, and zero is distinct from missing', () => {
  assert.deepEqual(reviewStatistics([0,0,1,1,2,2,3,3,4,4,5,5]),{ trimmedMean:2.5,median:2.5 });
  assert.deepEqual(reviewStatistics([0,0,1,1,2,2,3,3,4,5,5,5]),{ trimmedMean:2.6,median:2.5 });
  assert.deepEqual(reviewStatistics(Array.from({length:12},(_,index)=>(index+1)/10)),{ trimmedMean:0.65,median:0.65 });
  assert.throws(() => reviewStatistics([1,2]),{ status:409 });
});

test('only unsubmitted seats can be replaced, with twelve seats retained and original acceptance time frozen', t => {
  const { db, service, id, boss, reviewers, accept, user } = fixture(t); accept();
  assert.equal(service.view(id,boss).capabilities.replaceSeat,true);
  assert.throws(()=>service.replaceUnsubmittedSeat(id,{revision:2,personId:reviewers[1].personId,accountId:reviewers[1].id,reason:'相同席位'},boss),{status:409});
  service.submitOpinion(id,{ revision:0,hours:2,basis:'submitted immutable participant' },reviewers[0]);
  const replacement = user('replacement',['view','opinion.submit'],'replacement-person');
  assert.throws(() => service.replaceUnsubmittedSeat(id,{ revision:2,personId:reviewers[0].personId,accountId:replacement.id,reason:'not allowed' },boss),{status:409});
  const acceptedAt = db.prepare('select accepted_at from maintenance_nonroutine_review_cases where id=?').get(id).accepted_at;
  service.replaceUnsubmittedSeat(id,{ revision:2,personId:reviewers[1].personId,accountId:replacement.id,reason:'原人员请假' },boss);
  assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_seats where case_id=?').get(id).n),12);
  assert.equal(db.prepare('select accepted_at from maintenance_nonroutine_review_cases where id=?').get(id).accepted_at,acceptedAt);
  assert.throws(() => service.submitOpinion(id,{ revision:0,hours:3,basis:'old seat' },reviewers[1]),{status:403});
  service.submitOpinion(id,{ revision:0,hours:3,basis:'new seat' },replacement);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_review_outbox where recipient_account_id=? and state='PENDING'").get(reviewers[1].id).n),0);
  assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_opinions where case_id=?').get(id).n),2);
});

test('shared suggestions are append-only annotations from qualified seats and never mutate applications or opinions', t => {
  const { db, service, id, boss, reviewers, accept } = fixture(t); accept();
  service.submitOpinion(id,{revision:0,hours:2,basis:'PRIVATE-UNCHANGED'},reviewers[0]);
  const beforeCase = db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(id);
  const beforeOpinions = db.prepare('select * from maintenance_nonroutine_review_opinions where case_id=?').all(id);
  const make = (field, proposedValue) => ({ clientId:`suggest-${field}`, field, proposedValue, reason:'根据现场范围核对', privacyAcknowledged:true });
  for (const [field,value] of [['category','其他'],['chapter','29-10'],['title','液压管路功能检查'],['workScope','核对右侧管路标识']]) {
    const payload = make(field,value);
    const result = service.suggest(id,payload,reviewers[0]);
    assert.equal(result.suggestions.at(-1).field,field);
    assert.equal(result.suggestions.at(-1).originalValue,JSON.parse(beforeCase.application_json)[field]);
    assert.equal(result.suggestions.at(-1).personId,reviewers[0].personId);
    service.suggest(id,payload,reviewers[0]);
    assert.throws(() => service.suggest(id,{...payload,reason:'changed'},reviewers[0]),{status:409});
  }
  assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_suggestions').get().n),4);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_review_events where event_type='FIELD_SUGGESTED'").get().n),4);
  assert.deepEqual(db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(id),beforeCase);
  assert.deepEqual(db.prepare('select * from maintenance_nonroutine_review_opinions where case_id=?').all(id),beforeOpinions);
  const shared = service.view(id,reviewers[1]);
  assert.equal(shared.suggestions.length,4);
  assert.equal(shared.opinions.length,0);
  assert.ok(!JSON.stringify(shared).includes('PRIVATE-UNCHANGED'));
  assert.throws(() => service.suggest(id,make('title','无席位'),boss),{status:403});
  reviewers[0].scope=false;
  assert.throws(() => service.suggest(id,make('title','范围已失效'),reviewers[0]),{status:404});
});

test('public suggestion contract rejects hours, private fields and missing privacy acknowledgement and seals with the round', t => {
  const { db, service, id, reviewers, accept } = fixture(t); accept();
  const payload = { clientId:'suggest-valid',field:'workScope',proposedValue:'检查管路',reason:'范围遗漏',privacyAcknowledged:true };
  for (const change of [ {field:'hours'}, {hours:2}, {basis:'private'}, {privacyAcknowledged:false},
    {reason:'我认为2小时足够'}, {reason:'工时：2.5'}, {reason:'三小时'}, {reason:'2 hours'}, {proposedValue:'申请2人时'}, {field:'category',proposedValue:'invalid'} ]) {
    assert.throws(() => service.suggest(id,{...payload,...change},reviewers[0]),{status:400});
  }
  service.suggest(id,payload,reviewers[0]);
  for (let i=0;i<12;i++) service.submitOpinion(id,{revision:0,hours:i+1,basis:`PRIVATE-${i}`},reviewers[i]);
  assert.equal(service.suggest(id,payload,reviewers[0]).state,'SEALED'); // lost-response retry is read-only
  assert.throws(() => service.suggest(id,{...payload,clientId:'suggest-after'},reviewers[0]),{status:409});
  assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_suggestions').get().n),1);
});

test('private opinion history is restricted to self or authorized full readers, including pagination and post-seal finalizer access', t => {
  const { service, id, reviewers, finalizer, auditor, accept } = fixture(t); accept();
  for (let version=0;version<102;version++) service.submitOpinion(id,{revision:version,hours:2,basis:`PRIVATE-HISTORY-${version}`},reviewers[0]);
  service.submitOpinion(id,{revision:0,hours:3,basis:'OTHER-PRIVATE'},reviewers[1]);
  const first = service.opinionHistory(id,{},reviewers[0]);
  assert.equal(first.entries.length,100);
  assert.equal(first.entries[0].revision,102);
  assert.equal(first.nextBeforeRevision,3);
  const second = service.opinionHistory(id,{beforeRevision:first.nextBeforeRevision},reviewers[0]);
  assert.deepEqual(second.entries.map(row=>row.revision),[2,1]);
  assert.equal(second.nextBeforeRevision,null);
  assert.ok(!JSON.stringify(first).includes('OTHER-PRIVATE'));
  assert.ok(!JSON.stringify(first).includes('permissionSnapshot'));
  assert.throws(() => service.opinionHistory(id,{personId:reviewers[1].personId},reviewers[0]),{status:403});
  assert.throws(() => service.opinionHistory(id,{personId:reviewers[0].personId},finalizer),{status:403});
  assert.equal(service.opinionHistory(id,{personId:reviewers[1].personId},auditor).entries[0].basis,'OTHER-PRIVATE');
  for (let i=2;i<12;i++) service.submitOpinion(id,{revision:0,hours:2,basis:'remaining'},reviewers[i]);
  assert.equal(service.opinionHistory(id,{personId:reviewers[0].personId},finalizer).entries.length,100);
  reviewers[0].scope=false;
  assert.throws(() => service.opinionHistory(id,{},reviewers[0]),{status:404});
});

test('workbench list scopes before projection and cursor pagination never includes private opinions',t=>{
  const {service,input,boss,reviewers,id,accept}=fixture(t);accept();
  service.submitOpinion(id,{revision:0,hours:2,basis:'PRIVATE-LIST-CANARY'},reviewers[0]);
  const added=Array.from({length:55},(_,index)=>service.create({...input,subtaskId:`page-${index}`,snapshot:{...input.snapshot,title:`PAGE ${index}`}}));
  const first=service.list({search:'PAGE'},boss);assert.equal(first.items.length,50);
  const second=service.list({search:'PAGE',cursor:first.nextCursor},boss);assert.equal(second.items.length,5);assert.equal(second.nextCursor,null);
  assert.equal(new Set([...first.items,...second.items].map(row=>row.id)).size,55);
  reviewers[0].caseIds=new Set([id,added[0]]);
  const visible=service.list({},reviewers[0]);assert.equal(visible.items.length,2);
  assert.ok(!JSON.stringify(visible).includes('PRIVATE-LIST-CANARY'));
  assert.ok(visible.items.every(row=>row.opinions===undefined && row.statistics===undefined));
  assert.throws(()=>service.list({cursor:'bad'},boss),{status:400});
});

test('manual nomination candidates require assignment permission and current role, scope and identity qualification',t=>{
  const {service,id,boss,finalizer,reviewers,accept}=fixture(t);
  assert.throws(()=>service.candidates(id,{role:'opinion'},reviewers[0]),{status:404});
  reviewers[0].active=false;reviewers[1].scope=false;
  const members=service.candidates(id,{role:'opinion',search:'account-'},boss);
  assert.equal(members.items.length,10);assert.ok(members.items.every(item=>item.permissions===undefined));
  boss.nominationPeople=new Set(reviewers.slice(3).map(user=>user.personId));
  assert.equal(service.candidates(id,{role:'opinion',search:'account-'},boss).items.length,9);
  assert.throws(()=>accept(),{status:400});
  delete boss.nominationPeople;
  const finalizers=service.candidates(id,{role:'finalize'},boss);assert.deepEqual(finalizers.items.map(item=>item.accountId),[finalizer.id]);
  assert.throws(()=>service.candidates(id,{role:'system_admin'},boss),{status:400});
  reviewers[0].active=true;reviewers[1].scope=true;accept();
  for(let index=0;index<12;index++)service.submitOpinion(id,{revision:0,hours:2,basis:'valid'},reviewers[index]);
  assert.throws(()=>service.candidates(id,{role:'opinion'},boss),{status:409});
});

test('finalization inputs and full private opinions are only exposed to authorized readers after sealing',t=>{
  const {service,id,boss,finalizer,reviewers,accept}=fixture(t);accept();
  const before=service.view(id,finalizer);assert.equal(before.capabilities.finalize,false);assert.equal(before.sourceParticipants,undefined);
  for(let index=0;index<12;index++)service.submitOpinion(id,{revision:0,hours:2,basis:'private'},reviewers[index]);
  const final=service.view(id,finalizer);assert.equal(final.capabilities.finalize,true);assert.equal(final.sourceParticipants[0].personId,'worker');
  const member=service.view(id,reviewers[0]);assert.equal(member.capabilities.readAllOpinions,false);assert.equal(member.sourceParticipants,undefined);assert.equal(member.capabilities.finalize,false);
  assert.equal(service.view(id,boss).capabilities.finalize,false);
});
