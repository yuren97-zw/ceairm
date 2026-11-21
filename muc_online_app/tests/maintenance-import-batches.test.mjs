import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { NONROUTINE_IMPORT_SCHEMA, createNonroutineImportBatches, nonroutineSourceFingerprint } from "../maintenance-import-batches.mjs";
import { previewNonroutineImport } from "../maintenance-import-preview.mjs";

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("pragma foreign_keys=on");
  db.exec(NONROUTINE_IMPORT_SCHEMA);
  db.exec("create table test_drafts(flight_id text primary key,payload_json text not null,version integer not null)");
  const user = { id: "importer" };
  let sequence = 0;
  let accessible = true;
  let locked = false;
  const events = [];
  const failFlights = new Set();
  const standards = ["one", "two"].map(id => ({ id, version: 1, standardHours: 1.2 }));
  const matchStandard = item => item.standardId
    ? standards.some(standard => standard.id === item.standardId && standard.version === Number(item.standardVersion))
      ? { status: "MATCHED", standard: standards.find(standard => standard.id === item.standardId), candidates: standards }
      : { status: "BLOCKED", candidates: [] }
    : String(item.title).startsWith("未收录") ? { status: "UNLISTED", candidates: [] } : { status: "NEEDS_SELECTION", candidates: standards };
  const preview = (payload, viewer, options = {}) => previewNonroutineImport({
    rows: payload.rows,
    excludedRows: options.excludedRows,
    resolveFlight: raw => {
      if (!accessible || viewer.id !== user.id) throw Object.assign(new Error("private-opportunity"), { status: 403 });
      const id = raw.flightId || "flight-one";
      return { id, aircraft_type: "A320", updated_at: "r1", importLocked: locked, draftVersion: db.prepare("select version from test_drafts where flight_id=?").get(id)?.version || 0 };
    }, existingWork: () => [], matchStandard
  });
  const batches = createNonroutineImportBatches({
    db, preview, matchStandard,
    appendDraft(flightId, items) {
      const current = db.prepare("select * from test_drafts where flight_id=?").get(flightId);
      const original = current ? JSON.parse(current.payload_json) : { items: [] };
      const version = (current?.version || 0) + 1;
      db.prepare(`insert into test_drafts(flight_id,payload_json,version) values(?,?,?)
        on conflict(flight_id) do update set payload_json=excluded.payload_json,version=excluded.version`)
        .run(flightId, JSON.stringify({ ...original, items: [...original.items, ...items] }), version);
      if (failFlights.has(flightId)) throw new Error("injected failure after draft write");
      return version;
    },
    transaction: action => {
      db.exec("begin immediate");
      try { const result = action(); db.exec("commit"); return result; }
      catch (error) { db.exec("rollback"); throw error; }
    },
    clock: () => "2026-11-09T00:00:00Z", randomId: prefix => `${prefix}-${++sequence}`,
    log: (...args) => events.push(args)
  });
  const file = { filename: "one.csv", fileSha256: "a".repeat(64), sheetName: "CSV", rows: [{ title: "检查", chapter: "29", category: "单项工作", rowNumber: 9, sheetName: "CSV" }] };
  return { db, batches, user, file, events, failFlights, standards, lock: () => { locked = true; }, revoke: () => { accessible = false; } };
}

test("import batch schema is additive, repeatable and identical to its PostgreSQL migration", t => {
  const { db } = fixture(t);
  const other = new DatabaseSync(":memory:");
  t.after(() => other.close());
  const sql = fs.readFileSync(new URL("../migrations/040_maintenance_import_provenance.sql", import.meta.url), "utf8");
  other.exec(sql); other.exec(sql);
  const schema = database => database.prepare("select name,sql from sqlite_master where name not like '%test_drafts%' order by name").all();
  assert.deepEqual(schema(other), schema(db));
});

test("persisted previews reopen only for the owner and reauthorize every opportunity", t => {
  const { batches, user, file, revoke } = fixture(t);
  const created = batches.create(file, user);
  assert.equal(created.results[0].status, "NEEDS_SELECTION");
  assert.deepEqual(batches.view(created.batchId, user), created);
  assert.throws(() => batches.view(created.batchId, { id: "another-importer" }), { status: 404 });
  revoke();
  const hidden = batches.view(created.batchId, user);
  assert.equal(hidden.results[0].status, "BLOCKED");
  assert.equal(hidden.results[0].flightId, undefined);
  assert.equal(hidden.results[0].item, undefined);
  assert.equal(hidden.results[0].decision, undefined);
  assert.ok(!JSON.stringify(hidden).includes("private-opportunity"));
});

test("candidate choices are versioned and audited, including changing a previous choice", t => {
  const { db, batches, user, file, events } = fixture(t);
  const created = batches.create(file, user);
  const selected = batches.decide(created.batchId, 9, { revision: 1, standardId: "two", standardVersion: 1 }, user);
  assert.equal(selected.revision, 2);
  assert.equal(selected.results[0].match.standard.id, "two");
  const before = db.prepare("select * from maintenance_subtask_import_rows").all();
  assert.throws(() => batches.decide(created.batchId, 9, { revision: 1, skip: true }, user), { status: 409 });
  assert.deepEqual(db.prepare("select * from maintenance_subtask_import_rows").all(), before);
  const changed = batches.decide(created.batchId, 9, { revision: 2, standardId: "one", standardVersion: 1 }, user);
  assert.equal(changed.results[0].match.standard.id, "one");
  assert.equal(events.filter(event => event[1] === "nonroutine_import_decision").length, 2);
  assert.throws(() => batches.decide(created.batchId, 9, { revision: 3, standardId: "invalid", standardVersion: 1 }, user), { status: 409 });
});

test("source fingerprints survive file renaming and preserve deleted or submitted state across new batches", t => {
  const { db, batches, user, file } = fixture(t);
  const created = batches.create(file, user);
  const row = file.rows[0];
  const identity = { file_sha256: file.fileSha256, sheet_name: file.sheetName };
  const fingerprint = nonroutineSourceFingerprint(identity, row, "flight-one");
  assert.equal(created.results[0].sourceFingerprint, fingerprint);
  assert.notEqual(nonroutineSourceFingerprint(identity, row, "flight-two"), fingerprint);
  assert.notEqual(nonroutineSourceFingerprint({ ...identity, file_sha256: "b".repeat(64) }, row, "flight-one"), fingerprint);
  db.prepare(`insert into maintenance_nonroutine_import_sources(fingerprint,flight_id,client_id,first_batch_id,row_number,original_json,state,created_by,created_at,updated_at)
    values(?,'flight-one','draft-one',?,9,?,'ACTIVE','importer','stamp','stamp')`).run(fingerprint, created.batchId, JSON.stringify(row));
  const renamed = batches.create({ ...file, filename: "renamed.csv" }, user);
  assert.equal(renamed.results[0].status, "ALREADY_IMPORTED");
  db.prepare("update maintenance_nonroutine_import_sources set state='DELETED'").run();
  assert.equal(batches.view(renamed.batchId, user).results[0].status, "DELETED");
  assert.throws(() => batches.decide(renamed.batchId, 9, { revision: 1, skip: false }, user), { status: 409 });
  db.prepare("update maintenance_nonroutine_import_sources set state='SUBMITTED',subtask_id='formal-one'").run();
  const submitted = batches.view(renamed.batchId, user).results[0];
  assert.equal(submitted.status, "SUBMITTED");
  assert.equal(submitted.subtaskId, "formal-one");
});

test("skipping one upload duplicate allows the retained row to proceed to candidate selection", t => {
  const { batches, user, file } = fixture(t);
  file.rows.push({ ...file.rows[0], rowNumber: 10 });
  const created = batches.create(file, user);
  assert.equal(created.summary.possibleDuplicates, 2);
  const skipped = batches.decide(created.batchId, 10, { revision: 1, skip: true }, user);
  assert.deepEqual(skipped.results.map(row => row.status), ["NEEDS_SELECTION", "SKIPPED"]);
});

function commitPayload(view, requestId) {
  return {
    requestId, revision: view.revision,
    rows: view.results.map(({ rowNumber, flightId, expectedUpdatedAt, draftVersion, matchDigest }) => ({ rowNumber, flightId, expectedUpdatedAt, draftVersion, matchDigest }))
  };
}

test("commit appends a whole opportunity atomically and replays without duplicating original manual content", t => {
  const { db, batches, user, file } = fixture(t);
  const manual = { clientId: "original-manual", title: "人工内容", entries: [{ personId: "existing-person", role: "主做" }], extraLegacy: "preserved" };
  db.prepare("insert into test_drafts values('flight-one',?,7)").run(JSON.stringify({ items: [manual], legacyProperty: "retained" }));
  file.rows = Array.from({ length: 100 }, (_, index) => ({ title: `未收录工作${index}`, rowNumber: index + 2 }));
  const view = batches.create(file, user);
  const payload = commitPayload(view, "commit-one");
  const result = batches.commit(view.batchId, payload, user);
  assert.equal(result.summary.created, 100);
  const draft = db.prepare("select * from test_drafts").get();
  assert.equal(draft.version, 8);
  const stored = JSON.parse(draft.payload_json);
  assert.equal(stored.items.length, 101);
  assert.deepEqual(stored.items[0], manual);
  assert.equal(stored.legacyProperty, "retained");
  assert.equal(stored.items[1].standardHours, "");
  assert.deepEqual(stored.items[1].entries, []);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_import_sources").get().n), 100);
  const replay = batches.commit(view.batchId, payload, user);
  assert.equal(replay.replayed, true);
  assert.equal(replay.summary.created, 100);
  assert.deepEqual(db.prepare("select * from test_drafts").get(), draft);
  assert.throws(() => batches.commit(view.batchId, { ...payload, rows: payload.rows.slice(1) }, user), { status: 409 });
  const renamed = batches.create({ ...file, filename: "renamed.csv" }, user);
  assert.equal(renamed.summary.alreadyImported, 100);
});

test("per-opportunity savepoints roll back failed draft, source and receipt writes while other opportunities succeed", t => {
  const { db, batches, user, file, failFlights } = fixture(t);
  file.rows = [
    { title: "未收录工作A", rowNumber: 2, flightId: "flight-one" },
    { title: "未收录工作B", rowNumber: 3, flightId: "flight-two" },
    { title: "未收录工作C", rowNumber: 4, flightId: "flight-two" }
  ];
  failFlights.add("flight-two");
  const view = batches.create(file, user);
  const result = batches.commit(view.batchId, commitPayload(view, "partial-one"), user);
  assert.deepEqual(result.results.map(row => row.status), ["SUCCESS", "FAILED", "FAILED"]);
  assert.equal(db.prepare("select * from test_drafts where flight_id='flight-two'").get(), undefined);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_import_sources").get().n), 1);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_subtask_import_rows where receipt_json is not null").get().n), 1);
  failFlights.clear();
  const fresh = batches.view(view.batchId, user);
  const retry = batches.commit(view.batchId, commitPayload(fresh, "partial-two"), user);
  assert.deepEqual(retry.results.map(row => row.status), ["ALREADY_IMPORTED", "SUCCESS", "SUCCESS"]);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_import_sources").get().n), 3);
  assert.equal(db.prepare("select status from maintenance_subtask_import_batches where id=?").get(view.batchId).status, "COMMITTED");
  const replay = batches.commit(view.batchId, commitPayload(view, "partial-one"), user);
  assert.deepEqual(replay.results.map(row => row.status), ["SUCCESS", "ALREADY_IMPORTED", "ALREADY_IMPORTED"]);
});

test("changed draft versions conflict without overwriting data and deleted sources override replay receipts", t => {
  const { db, batches, user, file } = fixture(t);
  file.rows = [{ title: "未收录工作", rowNumber: 2 }];
  const view = batches.create(file, user);
  db.prepare("insert into test_drafts values('flight-one','{\"items\":[]}',1)").run();
  const conflict = batches.commit(view.batchId, commitPayload(view, "stale-one"), user);
  assert.equal(conflict.results[0].status, "CONFLICT");
  assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_import_sources").get().n), 0);
  const fresh = batches.view(view.batchId, user);
  const payload = commitPayload(fresh, "fresh-one");
  const created = batches.commit(view.batchId, payload, user);
  assert.equal(created.results[0].status, "SUCCESS");
  db.prepare("update maintenance_nonroutine_import_sources set state='DELETED'").run();
  const replay = batches.commit(view.batchId, payload, user);
  assert.equal(replay.results[0].status, "DELETED");
  assert.equal(replay.summary.created, 0);
  const next = batches.create({ ...file, filename: "renamed.csv" }, user);
  assert.equal(next.results[0].status, "DELETED");
  assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_import_sources").get().n), 1);
});


test("expired manual standard decisions can be reset and reselected without losing original import identity", t => {
  const { db, batches, user, file, standards, events } = fixture(t);
  const created=batches.create(file,user),chosen=batches.decide(created.batchId,9,{revision:1,standardId:'one',standardVersion:1},user);
  standards.splice(0,1);
  const blocked=batches.view(created.batchId,user);assert.equal(blocked.results[0].status,'BLOCKED');
  const original=db.prepare('select original_json from maintenance_subtask_import_rows where batch_id=?').get(created.batchId).original_json;
  const reset=batches.decide(created.batchId,9,{revision:chosen.revision,resetStandardChoice:true},user);
  assert.equal(reset.results[0].status,'NEEDS_SELECTION');assert.equal(reset.results[0].decision.standardId,undefined);assert.equal(reset.results[0].sourceFingerprint,blocked.results[0].sourceFingerprint);
  assert.equal(db.prepare('select original_json from maintenance_subtask_import_rows where batch_id=?').get(created.batchId).original_json,original);
  assert.throws(()=>batches.decide(created.batchId,9,{revision:chosen.revision,resetStandardChoice:true},user),{status:409});
  const selected=batches.decide(created.batchId,9,{revision:reset.revision,standardId:'two',standardVersion:1},user);
  const saved=batches.commit(created.batchId,commitPayload(selected,'reset-choice-commit'),user);assert.equal(saved.summary.created,1);
  const source=db.prepare('select * from maintenance_nonroutine_import_sources').get();assert.equal(JSON.parse(source.standard_snapshot_json).id,'two');assert.equal(source.fingerprint,blocked.results[0].sourceFingerprint);
  assert.ok(events.some(event=>event[1]==='nonroutine_import_decision'&&event[3].before.standardId==='one'&&event[3].decision.resetStandardChoice===true));
});


test("resetting an expired file reference preserves original text and refuses lost access or locked opportunities", t => {
  const { db, batches, user, file, standards, lock, revoke }=fixture(t);file.rows[0].standardId='one';file.rows[0].standardVersion=1;
  const created=batches.create(file,user);standards.splice(0,1);const stale=batches.view(created.batchId,user);assert.equal(stale.results[0].canResetStandardChoice,true);
  const reset=batches.decide(created.batchId,9,{revision:stale.revision,resetStandardChoice:true},user);assert.equal(reset.results[0].item.standardId,'');assert.equal(reset.results[0].status,'NEEDS_SELECTION');
  const original=JSON.parse(db.prepare('select original_json from maintenance_subtask_import_rows where batch_id=?').get(created.batchId).original_json);assert.equal(original.standardId,'one');
  const chosen=batches.decide(created.batchId,9,{revision:reset.revision,standardId:'two',standardVersion:1},user);standards.splice(0,1);lock();const locked=batches.view(created.batchId,user);assert.equal(locked.results[0].canResetStandardChoice,false);
  const before=db.prepare('select * from maintenance_subtask_import_rows where batch_id=?').all(created.batchId);assert.throws(()=>batches.decide(created.batchId,9,{revision:chosen.revision,resetStandardChoice:true},user),{status:409});assert.deepEqual(db.prepare('select * from maintenance_subtask_import_rows where batch_id=?').all(created.batchId),before);
  revoke();const hidden=batches.view(created.batchId,user);assert.equal(hidden.results[0].flightId,undefined);assert.equal(hidden.results[0].item,undefined);assert.throws(()=>batches.decide(created.batchId,9,{revision:chosen.revision,resetStandardChoice:true},user),{status:409});assert.deepEqual(db.prepare('select * from maintenance_subtask_import_rows where batch_id=?').all(created.batchId),before);
});
