import assert from 'node:assert/strict';
import test from 'node:test';
import { createSnapshotRefresh } from '../capability-ui/snapshot-refresh.js';

const snapshot = (revision, masterDataVersion = 1) => ({ revision, masterDataVersion });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('initial load, SSE greeting and duplicate notifications share one snapshot', async () => {
  const pending = deferred(), accepted = [];
  let calls = 0;
  const refresh = createSnapshotRefresh({ load: () => { calls++; return pending.promise; }, onSnapshot: value => accepted.push(value) });
  const initial = refresh.refresh();
  assert.equal(refresh.refresh(snapshot(8)), initial);
  assert.equal(refresh.refresh(snapshot(8)), initial);
  await Promise.resolve();
  assert.equal(calls, 1);
  pending.resolve(snapshot(8));
  await initial;
  for (let index = 0; index < 20; index++) await refresh.refresh(snapshot(8));
  await refresh.refresh(snapshot(7));
  assert.equal(calls, 1);
  assert.equal(accepted.length, 1);
});

test('a newer event during a load produces one follow-up and preserves the newest state', async () => {
  const first = deferred(), second = deferred(), accepted = [];
  let calls = 0;
  const refresh = createSnapshotRefresh({ load: () => (++calls === 1 ? first.promise : second.promise), onSnapshot: value => accepted.push(value.revision) });
  const initial = refresh.refresh();
  await Promise.resolve();
  refresh.refresh(snapshot(9));
  refresh.refresh(snapshot(9));
  first.resolve(snapshot(8));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  second.resolve(snapshot(9));
  assert.equal((await initial).revision, 9);
  assert.deepEqual(accepted, [8, 9]);
  await refresh.refresh(snapshot(9));
  assert.equal(calls, 2);
});

test('master-data-only changes refresh, but an already completed command does not refresh twice', async () => {
  let current = snapshot(8), calls = 0;
  const refresh = createSnapshotRefresh({ load: async () => { calls++; return current; }, onSnapshot() {} });
  await refresh.refresh();
  current = snapshot(8, 2);
  await refresh.refresh(current);
  assert.equal(calls, 2);
  current = snapshot(9, 2);
  const event = refresh.refresh(current);
  assert.equal(refresh.refresh(current), event);
  await event;
  await refresh.refresh(current);
  assert.equal(calls, 3);
});

test('forced conflict reconciliation does not reuse a request that began before the conflict', async () => {
  const pending = deferred();
  let calls = 0;
  const refresh = createSnapshotRefresh({ load: () => ++calls === 1 ? pending.promise : Promise.resolve(snapshot(9)), onSnapshot() {} });
  const initial = refresh.refresh();
  await Promise.resolve();
  assert.equal(refresh.refresh(null, { force: true }), initial);
  pending.resolve(snapshot(8));
  assert.equal((await initial).revision, 9);
  assert.equal(calls, 2);
});

test('leaving a workspace aborts its request and prevents stale responses from updating the page', async () => {
  const pending = deferred(), accepted = [];
  let signal;
  const refresh = createSnapshotRefresh({ load: value => { signal = value; return pending.promise; }, onSnapshot: value => accepted.push(value) });
  const initial = refresh.refresh();
  await Promise.resolve();
  refresh.dispose();
  assert.equal(signal.aborted, true);
  pending.resolve(snapshot(8));
  assert.equal(await initial, null);
  assert.equal(await refresh.refresh(snapshot(9)), null);
  assert.deepEqual(accepted, []);
});

test('a failed load can retry and an inconsistent version never spins indefinitely', async () => {
  let calls = 0;
  const refresh = createSnapshotRefresh({ load: async () => { if (++calls === 1) throw new Error('offline'); return snapshot(8); }, onSnapshot() {} });
  await assert.rejects(refresh.refresh(), /offline/);
  await refresh.refresh(snapshot(9));
  assert.equal(calls, 3);
});
