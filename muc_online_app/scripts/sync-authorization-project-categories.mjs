import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const [dbPath, mode = "preview", backupPath = ""] = process.argv.slice(2);
assert(dbPath, "Usage: node scripts/sync-authorization-project-categories.mjs DB [preview|rehearse|apply] [BACKUP]");
assert(["preview", "rehearse", "apply"].includes(mode), "Invalid mode");
if (mode === "apply") assert(backupPath && fs.existsSync(backupPath), "A verified database backup is required");

const sourcePath = path.resolve(import.meta.dirname, "../data/authorization-project-classification.json");
const rows = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const categories = new Set(["release", "test_run", "maintenance", "special", "third_party", "other"]);
assert.equal(rows.length, 136);
assert.equal(new Set(rows.map(row => row.projectCode)).size, 136);
assert(rows.every(row => row.projectCode && row.projectName && categories.has(row.category)));

const db = new DatabaseSync(dbPath, { readOnly: mode === "preview" });
db.exec("pragma busy_timeout=10000");
const columns = () => new Set(db.prepare("pragma table_info(capability_catalog)").all().map(row => row.name));
const ensureColumns = () => {
  const names = columns();
  if (!names.has("project_category")) db.exec("alter table capability_catalog add column project_category text not null default ''");
  if (!names.has("category_source")) db.exec("alter table capability_catalog add column category_source text not null default ''");
  if (!names.has("category_updated_by")) db.exec("alter table capability_catalog add column category_updated_by text not null default ''");
  if (!names.has("category_updated_at")) db.exec("alter table capability_catalog add column category_updated_at text not null default ''");
};
const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
let inTransaction = false;
try {
  if (mode !== "preview") { db.exec("begin immediate"); inTransaction = true; ensureColumns(); }
  const existingColumns = columns();
  const catalog = db.prepare(`select id,project_code,project_name${existingColumns.has("project_category") ? ",project_category,category_source" : ""} from capability_catalog order by project_code`).all();
  const existing = new Map(catalog.map(row => [row.project_code, row]));
  assert.equal(existing.size, 136, "Current catalog must contain exactly 136 projects");
  assert.deepEqual([...existing.keys()].sort(), rows.map(row => row.projectCode).sort(), "Workbook and database project-code sets differ");
  const changes = rows.map(row => {
    const old = existing.get(row.projectCode);
    return { ...row, id: old.id, oldName: old.project_name, oldCategory: old.project_category || "", oldSource: old.category_source || "",
      nameChanged: old.project_name !== row.projectName, categoryChanged: old.project_category !== row.category };
  }).filter(row => row.nameChanged || row.categoryChanged);
  const report = {
    database: path.resolve(dbPath), source: sourcePath, sourceHash, mode,
    namesChanged: changes.filter(row => row.nameChanged).length,
    categoriesChanged: changes.filter(row => row.categoryChanged).length,
    unchangedNames: 136 - changes.filter(row => row.nameChanged).length,
    categoryCounts: Object.fromEntries([...categories].map(category => [category, rows.filter(row => row.category === category).length]))
  };
  if (mode !== "preview") {
    const admin = db.prepare("select id,name from users where username='54002010'").get();
    assert(admin, "Super administrator 54002010 was not found");
    const stamp = new Date().toISOString();
    for (const change of changes) {
      db.prepare("update capability_catalog set project_name=?,project_category=?,category_source='xlsx_initial',category_updated_by=?,category_updated_at=?,status='active',updated_at=? where id=?")
        .run(change.projectName, change.category, admin.id, stamp, change.nameChanged ? stamp : db.prepare("select updated_at from capability_catalog where id=?").get(change.id).updated_at, change.id);
      db.prepare("insert into audit_logs(id,user_id,user_name,action,target_type,target_id,detail,created_at) values(?,?,?,?,?,?,?,?)")
        .run(`audit_${crypto.randomUUID()}`, admin.id, admin.name, "initialize_authorization_project_category", "authorizationProject", change.id,
          JSON.stringify({ projectCode: change.projectCode, previousName: change.oldName, projectName: change.projectName, previousCategory: change.oldCategory, category: change.category, source: "机型分类.xlsx", sourceHash, backupPath }), stamp);
    }
    const after = db.prepare("select id,project_code,project_name,project_category from capability_catalog order by project_code").all();
    assert.equal(after.length, 136);
    for (const expected of rows) {
      const actual = after.find(row => row.project_code === expected.projectCode);
      assert(actual && actual.project_name === expected.projectName && actual.project_category === expected.category);
      assert.equal(actual.id, existing.get(expected.projectCode).id);
    }
    if (mode === "rehearse") { db.exec("rollback"); inTransaction = false; report.rollbackVerified = true; }
    else { db.exec("commit"); inTransaction = false; report.applied = changes.length; }
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (inTransaction) db.exec("rollback");
  throw error;
} finally { db.close(); }

