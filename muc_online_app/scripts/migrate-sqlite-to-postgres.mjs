import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { postgresConnectionOptions } from "../postgres-connection.mjs";
import {createDatabase} from '../db.mjs';
import {migrateIdentity,PERSON_TABLES} from '../personnel-identity.mjs';
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
await client.query('create table if not exists schema_migrations(version text primary key,applied_at text not null)');
for(let index=0;index<schemas.length;index++){
  const version=migrationFiles[index];if((await client.query('select 1 from schema_migrations where version=$1',[version])).rowCount)continue;
  await client.query('begin');try{await client.query(schemas[index]);await client.query('insert into schema_migrations values($1,$2)',[version,new Date().toISOString()]);await client.query('commit');}catch(error){await client.query('rollback');throw new Error('目标结构迁移失败: '+version+' / '+error.message);}
}
// Early historical migrations create account-based columns before the reviewed runtime identity migration.
// Normalize only empty legacy target tables; never guess identities in a populated target.
const targetAdapter=await createDatabase({databaseUrl});
try{
  for(const table of PERSON_TABLES){const columns=targetAdapter.prepare('pragma table_info('+table+')').all().map(row=>row.name);if(columns.includes('user_id')&&Number(targetAdapter.prepare('select count(*) n from '+table).get().n)>0)throw new Error('目标含旧人员身份业务数据，禁止自动覆盖: '+table);}
  migrateIdentity(targetAdapter);
}finally{targetAdapter.close();}

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
  "maintenance_work_locations",
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

// Discover all attendance tables, including durable queues and source history. Never silently omit a newly added table.
const attendanceTables=sqlite.prepare("select name from sqlite_master where type='table' and name glob 'attendance_*' order by name").all().map(row=>row.name);
for(const table of attendanceTables){if(!/^attendance_[a-z_]+$/.test(table))throw new Error('Invalid attendance table');tables.push(table);}
const attendanceCanonical=rows=>rows.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,value==null?null:String(value)])))).sort().join('\n');

function placeholders(count) {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(",");
}

await client.query("begin");
try {
  for (const table of tables) {
    const exists = sqlite.prepare("select 1 from sqlite_master where type='table' and name=?").get(table);
    if (!exists) continue;
    const rows = sqlite.prepare(`select * from ${table}`).all();
    if (!rows.length){if(table.startsWith('attendance_')&&Number((await client.query('select count(*) n from "'+table+'"')).rows[0].n)!==0)throw new Error('考勤目标存在额外数据: '+table);continue;}
    const targetResult = await client.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name=$1",
      [table]
    );
    const targetColumns = new Set(targetResult.rows.map(row => row.column_name));
    const sourceColumns = Object.keys(rows[0]);
    const columns = sourceColumns.filter(column => targetColumns.has(column));
    const skippedColumns = sourceColumns.filter(column => !targetColumns.has(column));
    if(table.startsWith('attendance_')&&skippedColumns.length)throw new Error('考勤迁移字段不完整: '+table);
    if (!columns.length) {
      console.warn(`${table}: 未发现可迁移的共同字段，已跳过`);
      continue;
    }
    if (skippedColumns.length) console.warn(`${table}: 跳过旧字段 ${skippedColumns.join(", ")}`);
    const quoted = columns.map(column => `"${column}"`).join(",");
    const conflict = table === "settings" ? " on conflict(key) do nothing" : table === "maintenance_work_locations" ? ' on conflict(id) do update set '+columns.filter(c=>c!=='id').map(c=>'"'+c+'"=excluded."'+c+'"').join(',') : " on conflict do nothing";
    const sql = `insert into ${table}(${quoted}) values(${placeholders(columns.length)})${conflict}`;
    if(table.startsWith('attendance_')){
      for(let offset=0;offset<rows.length;offset+=200){
        const batch=rows.slice(offset,offset+200),values=batch.flatMap(row=>columns.map(column=>row[column]));
        const groups=batch.map((row,index)=>'('+columns.map((column,c)=>'$'+(index*columns.length+c+1)).join(',')+')').join(',');
        await client.query(`insert into "${table}"(${quoted}) values${groups} on conflict do nothing`,values);
      }
      const copied=(await client.query(`select ${quoted} from "${table}"`)).rows;
      if(attendanceCanonical(rows)!==attendanceCanonical(copied))throw new Error('考勤迁移对账失败，事务已拒绝提交: '+table);
    }else for (const row of rows) await client.query(sql, columns.map(column => row[column]));
    console.log(`${table}: ${rows.length}`);
  }
  if(attendanceTables.includes('attendance_approval_plan_history'))await client.query("select setval(pg_get_serial_sequence('attendance_approval_plan_history','id'), greatest(coalesce(max(id),0),1), count(*)>0) from attendance_approval_plan_history");
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw Object.assign(new Error("迁移失败，业务事务已回滚："+error.message),{code:error.code});
} finally {
  await client.end();
}
console.log("SQLite 业务数据已迁移到 PostgreSQL。请继续执行附件迁移脚本，将本地附件转存到私有 COS。");
