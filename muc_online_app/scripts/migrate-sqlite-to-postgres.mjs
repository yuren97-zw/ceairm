import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const sqlitePath = process.env.SQLITE_PATH || path.join(appDir, "data", "muc.sqlite");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("请先设置 DATABASE_URL");

const schema = await fs.readFile(path.join(appDir, "migrations", "001_init_postgres.sql"), "utf8");
const sqlite = new DatabaseSync(sqlitePath);
const client = new Client({ connectionString: databaseUrl, ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false } });
await client.connect();
await client.query(schema);

const tables = [
  "users",
  "people",
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
  "maintenance_logs"
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
