import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { postgresConnectionOptions } from "../postgres-connection.mjs";
import { preflightCapabilityIntegrity } from "../capability-integrity.mjs";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const sqlitePath = process.env.SQLITE_PATH || path.join(appDir, "data", "muc.sqlite");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("请先设置 DATABASE_URL");

const migrationFiles = (await fs.readdir(path.join(appDir, "migrations")))
  .filter(name => /^\d+.*\.sql$/.test(name))
  .sort();
const schemas = await Promise.all(migrationFiles.map(name => fs.readFile(path.join(appDir, "migrations", name), "utf8")));
const sqlite = new DatabaseSync(sqlitePath,{readOnly:true});
if(!sqlite.prepare("pragma table_info(rbac_user_scopes)").all().some(c=>c.name==="module"))throw new Error("先在SQLite副本完成身份与分模块范围迁移，禁止直接导入旧格式");
const capabilityIntegrity=preflightCapabilityIntegrity(sqlite);
if(!capabilityIntegrity.ok)throw Object.assign(new Error("能力与人员身份预检未通过，禁止迁移到PostgreSQL"),{details:capabilityIntegrity.issues});
const client = new Client(postgresConnectionOptions(databaseUrl));
await client.connect();
for (const schema of schemas) await client.query(schema);

const tables = [
  "users",
  "records",
  "record_recipients",
  "read_receipts",
  "fixed_projects",
  "attachments",
  "favorites",
  "settings",
  "audit_logs",
  "audit",
  "maintenance_flights",
  "maintenance_subtasks",
  "maintenance_assignments",
  "maintenance_feedback",
  "maintenance_hour_rules",
  "maintenance_hour_results",
  "maintenance_sortie_results",
  "maintenance_work_reports",
  "maintenance_work_report_entries",
  "maintenance_report_batches",
  "maintenance_report_entries",
  "maintenance_report_drafts",
  "maintenance_sync_state",
  "maintenance_logs",
  "personnel",
  "organization_units",
  "personnel_licenses",
  "capability_catalog",
  "personnel_authorizations",
  "personnel_authorization_versions",
  "course_catalog",
  "personnel_training_records",
  "personnel_import_batches",
  "personnel_import_workspaces",
  "personnel_import_issues",
  "personnel_change_logs",
  "personnel_field_overrides",
  "master_data_dictionary_values",
  "rbac_roles",
  "rbac_permissions",
  "rbac_role_permissions",
  "rbac_user_roles",
  "rbac_user_scopes",
  "personnel_identity_migrations",
  "personnel_organization_history",
  "capability_meta", "capability_current_states", "capability_supports", "capability_deployment_locations", "capability_other_status_options", "capability_status_records",
  "capability_history", "capability_scenarios", "capability_configuration", "capability_events", "capability_commands"
];

function placeholders(count) {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(",");
}

await client.query("begin");
try {
  for (const table of tables) {
    const exists = sqlite.prepare("select 1 from sqlite_master where type='table' and name=?").get(table);
    if (!exists) continue;
    const rows = sqlite.prepare(`select * from ${table}`).all();
    if (!rows.length) continue;
    const targetResult = await client.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name=$1",
      [table]
    );
    const targetColumns = new Set(targetResult.rows.map(row => row.column_name));
    const sourceColumns = Object.keys(rows[0]);
    const columns = sourceColumns.filter(column => targetColumns.has(column));
    const skippedColumns = sourceColumns.filter(column => !targetColumns.has(column));
    if (!columns.length) {
      console.warn(`${table}: 未发现可迁移的共同字段，已跳过`);
      continue;
    }
    if (skippedColumns.length) console.warn(`${table}: 跳过旧字段 ${skippedColumns.join(", ")}`);
    const quoted = columns.map(column => `"${column}"`).join(",");
    const conflict = table === "settings" ? " on conflict(key) do nothing" : " on conflict do nothing";
    const sql = `insert into ${table}(${quoted}) values(${placeholders(columns.length)})${conflict}`;
    for (const row of rows) await client.query(sql, columns.map(column => row[column]));
    console.log(`${table}: ${rows.length}`);
  }
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
console.log("SQLite 业务数据已迁移到 PostgreSQL。请继续执行附件迁移脚本，将本地附件转存到私有 COS。");
