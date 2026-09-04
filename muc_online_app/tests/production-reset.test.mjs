import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { inspect, clearDatabase, validateAdmin, validateAttachment, BUSINESS_TABLES } from "../scripts/reset-production-data.mjs";

const permissions = ["view", "create", "edit", "delete", "remind", "fixedManage"];
const tabs = ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage", "settingsPage"];
const sqliteSchema = fs.readFileSync(new URL("../migrations/001_init_postgres.sql", import.meta.url), "utf8").replace("add column if not exists", "add column");
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(sqliteSchema);
  const stamp = new Date().toISOString();
  const admin = { id: "54002010", username: "54002010", name: "正式人员", role: "admin", salt: "test-only-salt", password_hash: crypto.scryptSync("fixture-new-password", "test-only-salt", 64).toString("hex"), permissions: JSON.stringify(permissions), allowed_tabs: JSON.stringify(tabs), department: "车间", team: "一组", status: "active", created_at: stamp, updated_at: stamp, function_category: "放行" };
  for (const user of [admin, { ...admin, id: "other", username: "other", role: "receiver" }]) {
    db.prepare(`insert into users(${Object.keys(user).join(",")}) values(${Object.keys(user).map(() => "?")})`).run(...Object.values(user));
    db.prepare("insert into people values(?,?,?,?,?,?)").run(user.id, user.name, user.department, user.team, stamp, stamp);
    db.prepare("insert into sessions values(?,?,?,?)").run(user.id, user.id, stamp, stamp);
  }
  db.prepare("insert into settings values(?,?,?)").run("categories", JSON.stringify(["正式分类"]), stamp);
  db.prepare("insert into maintenance_hour_rules values(?,?,?,?,?,?)").run("rule", "workType", "短停", 2, stamp, stamp);
  db.prepare("insert into fixed_projects(id,ata,title,created_at,updated_at) values(?,?,?,?,?)").run("fp", "32", "测试固化项目", stamp, stamp);
  db.prepare("insert into maintenance_sync_state values(1,42,?)").run(stamp);
  let failAt = "";
  const client = { query: async (sql, params = []) => {
    if (sql === failAt) throw new Error("injected failure");
    if (sql.startsWith("select tablename from pg_tables")) return { rows: db.prepare("select name as tablename from sqlite_master where type='table' order by name").all() };
    if (sql.startsWith("select current_database()")) return { rows: [{ database: "test", username: "tester", address: "127.0.0.1", port: 5432 }] };
    if (sql.startsWith("lock table")) return { rows: [] };
    if (["begin", "commit", "rollback"].includes(sql)) { db.exec(sql); return { rows: [] }; }
    const statement = db.prepare(sql.replace(/\$\d+/g, "?"));
    if (/^select /i.test(sql)) return { rows: statement.all(...params) };
    statement.run(...params); return { rows: [] };
  } };
  return { db, client, admin, fail: sql => { failAt = sql; } };
}

test("production cleanup rejects default credentials, wrong admins and unsafe attachment paths", () => {
  const f = fixture();
  try {
    assert.doesNotThrow(() => validateAdmin(f.admin));
    assert.throws(() => validateAdmin({ ...f.admin, id: "different" }));
    assert.throws(() => validateAdmin({ ...f.admin, status: "disabled" }));
    assert.throws(() => validateAdmin({ ...f.admin, password_hash: crypto.scryptSync("muc2026", f.admin.salt, 64).toString("hex") }));
    const file = { id: "att", storage: "cos", owner_type: "record", owner_id: "r", path: "attachments/record/r/att-file.pdf" };
    assert.doesNotThrow(() => validateAttachment(file));
    for (const p of ["backups/database.dump", "attachments/record/r/../other", "/etc/passwd"]) assert.throws(() => validateAttachment({ ...file, path: p }));
    assert.doesNotThrow(() => validateAttachment({ ...file, storage: "server", path: "file.pdf" }));
    assert.throws(() => validateAttachment({ ...file, storage: "unknown" }));
  } finally { f.db.close(); }
});

test("production cleanup keeps the exact administrator and configuration, clears business data and invalidates sessions", async () => {
  const f = fixture();
  try {
    const before = await inspect(f.client);
    await clearDatabase(f.client, before, { file: "test.dump", sha256: "verified-test" });
    assert.deepEqual({ ...f.db.prepare("select * from users").get() }, f.admin);
    assert.equal(f.db.prepare("select count(*) n from people").get().n, 1);
    for (const table of BUSINESS_TABLES.filter(t => t !== "audit_logs")) assert.equal(f.db.prepare(`select count(*) n from ${table}`).get().n, 0, table);
    assert.equal(f.db.prepare("select count(*) n from audit_logs").get().n, 1);
    assert.equal(f.db.prepare("select version from maintenance_sync_state").get().version, 43);
    const after = await inspect(f.client);
    assert.equal(after.fingerprints.settings, before.fingerprints.settings);
    assert.equal(after.fingerprints.maintenance_hour_rules, before.fingerprints.maintenance_hour_rules);
  } finally { f.db.close(); }
});

test("production cleanup rolls back partial deletion and refuses stale manifests or unknown settings", async () => {
  const f = fixture();
  try {
    const before = await inspect(f.client);
    f.fail("delete from users where id<>$1");
    await assert.rejects(clearDatabase(f.client, before, {}), /injected failure/);
    assert.deepEqual(await inspect(f.client), before);
    f.fail("");
    f.db.prepare("update fixed_projects set title='changed'").run();
    await assert.rejects(clearDatabase(f.client, before, {}), /数据自清单生成后已变化/);
    assert.equal(f.db.prepare("select count(*) n from users").get().n, 2);
    f.db.prepare("insert into settings values('unknown_user_mapping','{}','now')").run();
    await assert.rejects(inspect(f.client), /未审核的系统设置/);
  } finally { f.db.close(); }
});

test("production restart does not create demo accounts or reset the retained administrator password", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "launch-production-test-"));
  const dbPath = path.join(directory, "production.sqlite");
  const seed = fixture();
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(sqliteSchema);
    db.prepare(`insert into users(${Object.keys(seed.admin).join(",")}) values(${Object.keys(seed.admin).map(() => "?")})`).run(...Object.values(seed.admin));
  } finally { db.close(); seed.db.close(); }
  const code = `const {db}=await import('./server.mjs'); console.log(JSON.stringify({users:db.prepare('select id,username,password_hash,department,team from users').all(),records:db.prepare('select count(*) n from records').get().n})); await db.close?.();`;
  try {
    for (let i = 0; i < 2; i++) {
      const output = execFileSync(process.execPath, ["--input-type=module", "-e", code], { cwd: fileURLRoot(), encoding: "utf8", env: { ...process.env, NODE_ENV: "production", MUC_NO_LISTEN: "1", DATABASE_URL: "", DB_PATH: dbPath, UPLOAD_DIR: path.join(directory, "uploads") } });
      const result = JSON.parse(output.trim().split("\n").at(-1));
      assert.equal(result.users.length, 1);
      assert.equal(result.users[0].id, "54002010");
      assert.equal(result.users[0].password_hash, seed.admin.password_hash);
      assert.equal(result.users[0].team, "一组");
      assert.equal(result.records, 0);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

function fileURLRoot() { return new URL("../", import.meta.url); }

test("login assets contain no demo login buttons, embedded credentials or synthetic recipient injection", () => {
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /demo-login|demoLoginActions|data-demo-user/);
  assert.doesNotMatch(js, /demoUsers|muc2026|fallbackRecords|seedFixedProjects/);
});
