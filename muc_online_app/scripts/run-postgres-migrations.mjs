import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { postgresConnectionOptions } from "../postgres-connection.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "migrations");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL 未配置");

const client = new pg.Client(postgresConnectionOptions(databaseUrl));

await client.connect();
try {
  await client.query("create table if not exists schema_migrations(version text primary key, applied_at text not null)");
  const files = (await fs.readdir(migrationsDir))
    .filter(name => /^\d+_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b));
  for (const file of files) {
    const applied = await client.query("select 1 from schema_migrations where version=$1", [file]);
    if (applied.rowCount) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await client.query("begin");
    try {
      // 001 creates the legacy user_id table; 007's CREATE IF NOT EXISTS does
      // not replace it. The accounting view requires normalized identity.
      // Empty fresh/upgrade targets have no identities to guess. Populated
      // legacy tables must use the reviewed application identity migration.
      if(file==='040_nonroutine_adjustments.sql'){
        await client.query('lock table maintenance_hour_results in access exclusive mode');
        const columns=(await client.query("select column_name from information_schema.columns where table_schema=current_schema() and table_name='maintenance_hour_results'")).rows.map(row=>row.column_name);
        if(!columns.includes('person_id')){
          if(!columns.includes('user_id'))throw new Error('工时结果缺少可识别的身份列，不能建立统一统计视图');
          if((await client.query('select 1 from maintenance_hour_results limit 1')).rowCount)throw new Error('历史工时仍使用user_id；须先执行受控人员身份迁移并核对映射，不能猜测person_id或继续建立统一视图');
          await client.query('alter table maintenance_hour_results rename column user_id to person_id');
        }
      }
      await client.query(sql);
      await client.query("insert into schema_migrations(version,applied_at) values($1,$2)", [file, new Date().toISOString()]);
      await client.query("commit");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.end();
}
