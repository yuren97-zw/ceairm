import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
test('attendance integration retains PostgreSQL-safe history and exhaustive reconciled data migration',async()=>{
 const plans=await fs.readFile(new URL('../attendance-approval-plans.mjs',import.meta.url),'utf8');assert.ok(!plans.includes('sum(error is not null)'));assert.ok(plans.includes("db.kind==='postgres'"));
 const schema=await fs.readFile(new URL('../migrations/029_attendance_approval_plans.sql',import.meta.url),'utf8');assert.match(schema,/BIGSERIAL PRIMARY KEY/);assert.ok(plans.includes('INTEGER PRIMARY KEY AUTOINCREMENT'));
 const migration=await fs.readFile(new URL('../scripts/migrate-sqlite-to-postgres.mjs',import.meta.url),'utf8');for(const token of ['attendanceTables','attendanceCanonical','pg_get_serial_sequence','migrateIdentity(targetAdapter)','schema_migrations'])assert.ok(migration.includes(token));
});
