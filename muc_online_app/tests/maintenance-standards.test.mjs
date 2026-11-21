import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { MAINTENANCE_STANDARDS_SCHEMA, createMaintenanceStandards } from "../maintenance-standards.mjs";

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(MAINTENANCE_STANDARDS_SCHEMA);
  const stamp = "2026-11-09T00:00:00Z";
  const service = createMaintenanceStandards({ db, clock: () => stamp });
  function add(id, overrides = {}) {
    db.prepare("insert or ignore into maintenance_standards(id,status,created_by,created_at,updated_at) values(?,'PUBLISHED','publisher',?,?)").run(id, stamp, stamp);
    const row = {
      id: `${id}-${overrides.version || 1}`, standard_id: id, version: 1,
      category: "单项工作", chapter: "29", title: "液压管路检查", work_scope: "左侧管路", standard_hours: 1.2,
      aircraft_codes_json: '["A320"]', generic_aircraft: 0, status: "PUBLISHED", admission_decision: "INCLUDE",
      effective_at: "2026-11-01T00:00:00Z", published_by: "publisher", published_at: "2026-11-01T00:00:00Z", created_at: stamp,
      ...overrides
    };
    db.prepare(`insert into maintenance_standard_versions(${Object.keys(row).join(",")}) values(${Object.keys(row).map(() => "?").join(",")})`).run(...Object.values(row));
  }
  const input = { category: "单项工作", chapter: "29", title: "液压管路检查", workScope: "左侧管路" };
  return { db, service, add, input };
}

test("standards migration and SQLite initialization have identical additive schema", t => {
  const { db } = fixture(t);
  const migrated = new DatabaseSync(":memory:");
  t.after(() => migrated.close());
  const migration = fs.readFileSync(new URL("../migrations/038_maintenance_standards.sql", import.meta.url), "utf8");
  migrated.exec(migration);
  migrated.exec(migration);
  const structure = database => database.prepare("select name,sql from sqlite_master where name like 'maintenance_standard%' order by name").all();
  assert.deepEqual(structure(migrated), structure(db));
});

test("standard matching uses exact aircraft and all four defining fields without writes", t => {
  const { db, service, add, input } = fixture(t);
  add("hydraulics");
  const before = db.prepare("select * from maintenance_standard_versions").all();
  assert.equal(service.match(input, " a320 ").status, "MATCHED");
  for (const aircraft of ["320", "A319", "A321", ""]) assert.equal(service.match(input, aircraft).status, "UNLISTED");
  for (const field of ["category", "chapter", "title", "workScope"]) {
    assert.notEqual(service.match({ ...input, [field]: "" }, "A320").status, "MATCHED");
  }
  assert.equal(service.match({ ...input, workScope: "右侧管路" }, "A320").status, "NEEDS_SELECTION");
  assert.deepEqual(db.prepare("select * from maintenance_standard_versions").all(), before);
});

test("multiple exact standards require selection and Excel hours cannot replace recognized hours", t => {
  const { service, add, input } = fixture(t);
  add("one");
  assert.equal(service.match({ ...input, standardHours: 9999 }, "A320").standard.standardHours, 1.2);
  add("two");
  const result = service.match(input, "A320");
  assert.equal(result.status, "NEEDS_SELECTION");
  assert.equal(result.candidates.length, 2);
  assert.equal(service.match({ standardId: "two", standardVersion: 1 }, "A320").status, "MATCHED");
});

test("effective publication requires admission and keeps the previous version until the next one is effective", t => {
  const { db, service, add, input } = fixture(t);
  add("one");
  add("one", { version: 2, effective_at: "2026-12-01T00:00:00Z" });
  add("draft", { status: "DRAFT" });
  add("pending", { admission_decision: "PENDING" });
  add("excluded", { admission_decision: "EXCLUDE" });
  add("no-publisher", { published_by: "" });
  add("disabled");
  db.prepare("update maintenance_standards set status='DISABLED' where id='disabled'").run();
  assert.deepEqual(service.list({ aircraftCode: "A320" }).items.map(item => [item.id, item.version]), [["one", 1]]);
  assert.equal(service.match({ ...input, standardId: "one", standardVersion: 2 }, "A320").status, "BLOCKED");
  add("one", { version: 3, effective_at: "2026-11-08T23:30:00-02:00" });
  // This timestamp is after the test clock despite its earlier calendar date.
  assert.equal(service.match(input, "A320").standard.version, 1);
  add("one", { version: 4, status: "WITHDRAWN" });
  assert.equal(service.match(input, "A320").status, "UNLISTED");
});

test("fallback lists visible standards for inspection but does not automatically match another aircraft", t => {
  const { service, add, input } = fixture(t);
  add("one");
  const list = service.list({ aircraftCode: "A319" });
  assert.equal(list.fallback, true);
  assert.equal(list.items.length, 1);
  assert.equal(service.match(input, "A319").status, "UNLISTED");
  assert.equal(service.match({ standardId: "one", standardVersion: 1 }, "A319").status, "BLOCKED");
  add("generic", { generic_aircraft: 1, aircraft_codes_json: "[]" });
  assert.equal(service.match(input, "A319").standard.id, "generic");
});

test("invalid stored aircraft applicability fails closed and null requests are rejected", t => {
  const { service, add } = fixture(t);
  add("broken", { aircraft_codes_json: "{}" });
  assert.throws(() => service.list({ aircraftCode: "A320" }), /机型配置无效/);
  assert.throws(() => service.match(null, "A320"), { status: 400 });
});

test("batch matching reads a single catalog snapshot and later requests see newly effective versions", t => {
  const { db, add, input } = fixture(t);
  add("one");
  let reads = 0;
  const service = createMaintenanceStandards({
    db: { prepare(sql) { reads++; return db.prepare(sql); } },
    clock: () => "2026-11-09T00:00:00Z"
  });
  const snapshot = service.snapshot();
  for (let index = 0; index < 1000; index++) assert.equal(snapshot.match(input, "A320").standard.version, 1);
  assert.equal(reads, 1);
  add("one", { version: 2 });
  assert.equal(snapshot.match(input, "A320").standard.version, 1);
  assert.equal(service.match(input, "A320").standard.version, 2);
});
