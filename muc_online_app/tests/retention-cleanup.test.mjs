import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { runRetentionCleanup } from "../scripts/retention-cleanup.mjs";
import { retentionCutoff } from "../retention-policy.mjs";

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(`
    create table audit_logs(id text primary key, created_at text not null);
    create table maintenance_nonroutine_role_results(id text primary key, result_id text not null, created_at text not null);
    create table maintenance_hour_results(id text primary key, created_at text not null);
    create table attendance_days(person_id text not null, work_date text not null, primary key(person_id, work_date));
  `);
  const groups = {
    audit: { years: 3, tables: [{ table: "audit_logs", timeColumn: "created_at", pk: ["id"] }] },
    raw: {
      years: 5,
      tables: [
        { table: "maintenance_nonroutine_role_results", timeColumn: "created_at", pk: ["id"] },
        {
          table: "maintenance_hour_results",
          timeColumn: "created_at",
          pk: ["id"],
          guard: "not exists (select 1 from maintenance_nonroutine_role_results c where c.result_id = maintenance_hour_results.id)",
        },
        { table: "attendance_days", timeColumn: "work_date", pk: ["person_id", "work_date"], dateOnly: true },
        { table: "missing_table", timeColumn: "created_at", pk: ["id"] },
      ],
    },
  };
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), "retention-test-"));
  t.after(() => fs.rmSync(archiveDir, { recursive: true, force: true }));
  return { db, groups, archiveDir };
}

const now = new Date("2026-11-24T00:00:00Z");

test("dry run reports expired rows and leaves data untouched", t => {
  const { db, groups, archiveDir } = fixture(t);
  db.exec(`
    insert into audit_logs values ('audit-old','2019-01-01T00:00:00.000Z'),('audit-new','2025-01-01T00:00:00.000Z');
    insert into maintenance_hour_results values ('hr-old','2019-01-01T00:00:00.000Z');
    insert into attendance_days values ('p1','2019-01-01'),('p1','2022-01-01');
  `);
  const results = runRetentionCleanup(db, { groups, now, archiveDir });
  assert.equal(Number(db.prepare("select count(*) n from audit_logs").get().n), 2);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_hour_results").get().n), 1);
  const audit = results.find(item => item.table === "audit_logs");
  assert.equal(audit.status, "DRY_RUN");
  assert.equal(audit.expired, 1);
  assert.equal(results.find(item => item.table === "missing_table").status, "SKIPPED_MISSING");
  assert.deepEqual(fs.readdirSync(archiveDir), [], "干跑不得产生归档");
});

test("apply archives then deletes only expired rows, respecting children guard and date-only cutoff", t => {
  const { db, groups, archiveDir } = fixture(t);
  db.exec(`
    insert into audit_logs values ('audit-old','2019-01-01T00:00:00.000Z'),('audit-new','2025-01-01T00:00:00.000Z');
    insert into maintenance_hour_results values ('hr-old','2019-01-01T00:00:00.000Z'),('hr-guarded','2019-01-01T00:00:00.000Z'),('hr-new','2025-01-01T00:00:00.000Z');
    insert into maintenance_nonroutine_role_results values ('rr-old','hr-old','2019-01-01T00:00:00.000Z'),('rr-newchild','hr-guarded','2025-06-01T00:00:00.000Z');
    insert into attendance_days values ('p1','2019-01-01'),('p1','2022-01-01');
  `);
  const results = runRetentionCleanup(db, { groups, now, archiveDir, apply: true });
  // 审计：老行删，新行留
  assert.deepEqual(db.prepare("select id from audit_logs order by id").all().map(row => row.id), ["audit-new"]);
  // 子表先删；父表 hr-old 因无剩余子行被删，hr-guarded 因仍有新子行被守卫保留
  assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_role_results").get().n), 1);
  assert.deepEqual(db.prepare("select id from maintenance_hour_results order by id").all().map(row => row.id), ["hr-guarded", "hr-new"]);
  // 日期列按 YYYY-MM-DD 截止（2021-11-24）
  assert.deepEqual(db.prepare("select work_date from attendance_days").all().map(row => row.work_date), ["2022-01-01"]);
  const audit = results.find(item => item.table === "audit_logs");
  assert.equal(audit.status, "DONE");
  assert.equal(audit.deleted, 1);
  assert.equal(audit.remaining, 0);
  // 归档文件存在且内容可回读
  const archiveFile = path.join(archiveDir, "audit_logs-2023-11-24.jsonl");
  assert.ok(fs.existsSync(archiveFile), archiveFile);
  assert.equal(JSON.parse(fs.readFileSync(archiveFile, "utf8").trim()).id, "audit-old");
  // retentionCutoff 语义
  assert.equal(retentionCutoff(5, { now, dateOnly: true }), "2021-11-24");
  assert.equal(retentionCutoff(3, { now }), "2023-11-24T00:00:00.000Z");
});
