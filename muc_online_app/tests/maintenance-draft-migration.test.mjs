import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

test("draft revision migration preserves historical high-water marks and is safe to rerun", t => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("create table maintenance_report_drafts(flight_id text,report_type text,version integer)");
  db.prepare("insert into maintenance_report_drafts values('flight-one','nonroutine',99)").run();
  db.prepare("insert into maintenance_report_drafts values('flight-one','routine',8)").run();
  const sql = fs.readFileSync(new URL("../migrations/039_maintenance_draft_versions.sql", import.meta.url), "utf8");
  db.exec(sql);
  db.prepare("update maintenance_report_drafts set version=1 where report_type='nonroutine'").run();
  db.exec(sql);
  assert.deepEqual({ ...db.prepare("select * from maintenance_report_draft_versions").get() }, {
    flight_id: "flight-one", report_type: "nonroutine", version: 99
  });
  assert.equal(Number(db.prepare("select count(*) n from maintenance_report_draft_versions").get().n), 1);
  db.prepare("delete from maintenance_report_drafts where report_type='nonroutine'").run();
  db.exec(sql);
  assert.equal(db.prepare("select version from maintenance_report_draft_versions").get().version, 99);
});
