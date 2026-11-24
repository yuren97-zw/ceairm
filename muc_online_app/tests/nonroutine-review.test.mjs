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
  const reviewers = Array.from({ length: 14 }, (_, index) => user(`account-${index}`, ['view','opinion.submit'], `person-${index}`));
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
  // 新规则：立案即 IN_REVIEW，评议人动态占席（前 12 个提交者）
  const accept = () => { for (let i = 0; i < 12; i++) service.submitOpinion(id, { revision: 0, hours: 1.5 + i * 0.1, basis: `评议依据-${i}` }, reviewers[i]); };
  return { db, service, id, input, boss, finalizer, auditor, reviewers, accept, user };
}

test('review schema matches the additive migration and preserves one immutable application per source', t => {
  const { db, service, id, input } = fixture(t);
  const other = new DatabaseSync(':memory:'); t.after(() => other.close());
  other.exec(NONROUTINE_REVIEW_SCHEMA);
  assert.equal(id, service.create(input));
  assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases').get().n),1);
  assert.equal(service.create({...input, applicationRevision: 2, snapshot: { ...input.snapshot, title: 'second' } }) !== id, true);
  input.snapshot.title = 'changed';
  assert.throws(() => service.create({...input, applicationRevision: 2}), { status: 409 });
  assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases').get().n),2);
});

test('auto-review: case starts IN_REVIEW, first 12 dynamic seats fill and seal, 13th gets 409', t => {
  const { db, service, id, reviewers } = fixture(t);
  assert.equal(service.view(id, reviewers[0]).state, 'IN_REVIEW');
  assert.equal(service.view(id, reviewers[0]).seatsFilled, 0);
  for (let i = 0; i < 12; i++) {
    const result = service.submitOpinion(id, { revision: 0, hours: i + 1, basis: `basis-${i}` }, reviewers[i]);
    assert.equal(result.state, i === 11 ? 'SEALED' : 'IN_REVIEW');
    assert.equal(result.seatsFilled, i + 1);
  }
  assert.equal(service.view(id, reviewers[0]).seatsRemaining, 0);
  // 封轮后第 13 人提交 → "已封轮"
  assert.throws(() => service.submitOpinion(id, { revision: 0, hours: 3, basis: 'too late' }, reviewers[12]), { status: 409, message: /本轮评议已封轮或未开放/ });
});

test('accept is rejected for WORK purpose (auto-review)', t => {
  const { service, id, boss, reviewers, finalizer } = fixture(t);
  assert.throws(() => service.accept(id, { revision: 1, accountIds: reviewers.slice(0,12).map(a => a.id), finalizerAccountId: finalizer.id }, boss), { status: 409, message: /已自动进入评议阶段/ });
});

test('ordinary reviewers see only their own hours and basis, including before and after sealing', t => {
  const { service, id, reviewers, auditor, finalizer, accept } = fixture(t); accept();
  const self = service.view(id, reviewers[0]);
  assert.ok(!JSON.stringify(self).includes('评议依据-1'));
  const full = service.view(id, auditor);
  assert.equal(full.opinions.length, 12);
  assert.ok(full.statistics);
  assert.equal(service.view(id, finalizer).opinions.length, 12);
  assert.throws(() => service.submitOpinion(id, { revision: 1, hours: 9, basis: 'changed' }, reviewers[0]), { status: 409 });
});

test('opinion revisions and eligibility are rechecked, and unqualified cannot submit', t => {
  const { db, service, id, boss, reviewers } = fixture(t);
  service.submitOpinion(id, { revision: 0, hours: 2, basis: 'first' }, reviewers[0]);
  assert.throws(() => service.submitOpinion(id, { revision: 0, hours: 3, basis: 'stale' }, reviewers[0]), { status: 409 });
  service.submitOpinion(id, { revision: 1, hours: 3, basis: 'revised' }, reviewers[0]);
  assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_opinion_history').get().n), 2);
  reviewers[1].active = false;
  assert.throws(() => service.submitOpinion(id, { revision: 0, hours: 2, basis: 'inactive' }, reviewers[1]), { status: 404 });
  reviewers[1].active = true;
  for (const value of ['', null, true, ' ', 0.15, -1]) assert.throws(() => service.submitOpinion(id, { revision: 0, hours: value, basis: 'invalid' }, reviewers[1]), { status: 400 });
  assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_opinions').get().n), 1);
});

test('tied extremes remove exactly one high and one low, and zero is distinct from missing', () => {
  assert.deepEqual(reviewStatistics([0,0,1,1,2,2,3,3,4,4,5,5]), { trimmedMean: 2.5, median: 2.5 });
  assert.deepEqual(reviewStatistics([0,0,1,1,2,2,3,3,4,5,5,5]), { trimmedMean: 2.6, median: 2.5 });
  assert.deepEqual(reviewStatistics(Array.from({ length: 12 }, (_, index) => (index + 1) / 10)), { trimmedMean: 0.65, median: 0.65 });
  assert.throws(() => reviewStatistics([1,2]), { status: 409 });
});

test('shared suggestions are append-only annotations from qualified participants', t => {
  const { db, service, id, reviewers } = fixture(t);
  service.submitOpinion(id, { revision: 0, hours: 1.5, basis: 'open' }, reviewers[0]);
  const beforeCase = db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(id);
  const beforeOpinions = db.prepare('select * from maintenance_nonroutine_review_opinions where case_id=?').all(id);
  const make = (field, proposedValue) => ({ clientId: `suggest-${field}`, field, proposedValue, reason: '根据现场范围核对', privacyAcknowledged: true });
  service.suggest(id, make('title', '更新后名称'), reviewers[0]);
  assert.deepEqual(db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(id), beforeCase);
  assert.deepEqual(db.prepare('select * from maintenance_nonroutine_review_opinions where case_id=?').all(id), beforeOpinions);
  assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_suggestions').get().n), 1);
});

test('public suggestion contract rejects hours, private fields and missing privacy acknowledgement', t => {
  const { service, id, reviewers, user } = fixture(t);
  service.submitOpinion(id, { revision: 0, hours: 1.5, basis: 'open' }, reviewers[0]);
  const outsider = user('outsider', ['view']);
  assert.throws(() => service.suggest(id, { clientId:'x'.repeat(8), field:'title', proposedValue:'test', reason:'r', privacyAcknowledged:true }, outsider), { status: 404 });
  assert.throws(() => service.suggest(id, { clientId:'x'.repeat(8), field:'title', proposedValue:'test', reason:'r' }, reviewers[0]), { status: 400 });
  assert.throws(() => service.suggest(id, { clientId:'x'.repeat(8), field:'title', proposedValue:'含 5 小时', reason:'r', privacyAcknowledged:true }, reviewers[0]), { status: 400 });
});

test('private opinion history is restricted to self or authorized full readers', t => {
  const { service, id, reviewers, auditor, accept } = fixture(t); accept();
  const own = service.opinionHistory(id, {}, reviewers[0]);
  assert.equal(own.entries.length, 1);
  assert.throws(() => service.opinionHistory(id, { personId: reviewers[1].personId }, reviewers[0]), { status: 403 });
  const full = service.opinionHistory(id, { personId: reviewers[1].personId }, auditor);
  assert.equal(full.entries.length, 1);
});

test('workbench list scopes before projection and cursor pagination never includes private opinions', t => {
  const { service, boss, reviewers, accept } = fixture(t); accept();
  const page = service.list({}, boss);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].submittedCount, 12);
  assert.ok(!JSON.stringify(page).includes('评议依据-'));
});

test('cancellation before sealing does not expose unfinished private opinions', t => {
  const { service, id, reviewers, auditor, user } = fixture(t);
  for (let i = 0; i < 3; i++) service.submitOpinion(id, { revision: 0, hours: 1, basis: `partial-${i}` }, reviewers[i]);
  const view = service.view(id, auditor);
  assert.equal(view.opinions.length, 3);
  assert.equal(view.state, 'IN_REVIEW');
});

test('seats remaining field is accurate throughout the lifecycle', t => {
  const { service, id, reviewers } = fixture(t);
  const initial = service.view(id, reviewers[0]);
  assert.equal(initial.seatsRemaining, 12);
  assert.equal(initial.seatsFilled, 0);
  service.submitOpinion(id, { revision: 0, hours: 1, basis: 'one' }, reviewers[0]);
  const mid = service.view(id, reviewers[0]);
  assert.equal(mid.seatsRemaining, 11);
  assert.equal(mid.seatsFilled, 1);
  for (let i = 1; i < 12; i++) service.submitOpinion(id, { revision: 0, hours: 1, basis: `fill-${i}` }, reviewers[i]);
  const sealed = service.view(id, reviewers[0]);
  assert.equal(sealed.seatsRemaining, 0);
  assert.equal(sealed.seatsFilled, 12);
  assert.equal(sealed.state, 'SEALED');
});
