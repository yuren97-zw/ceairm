// Seed only an empty, dedicated loopback PostgreSQL acceptance database.
import assert from "node:assert/strict";

const url = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
assert.equal(url.hostname, "127.0.0.1", "fixture requires loopback PostgreSQL");
assert.match(url.pathname, /^\/muc_security_stress_/, "fixture requires a dedicated stress database");
assert.equal(process.env.MUC_NO_LISTEN, "1", "fixture must not start a listener");
assert.ok(process.env.STRESS_TEST_PASSWORD, "STRESS_TEST_PASSWORD is required");
assert.equal(process.env.STRESS_TEST_PASSWORD, process.env.INITIAL_ADMIN_PASSWORD,
  "the isolated admin and worker fixture must use the same temporary password");

const { db } = await import("../server.mjs");
assert.equal(db.kind, "postgres");
assert.equal(Number(db.prepare("select count(*) as n from maintenance_flights").get().n), 0,
  "fixture database must contain no business flights");
assert.equal(Number(db.prepare("select count(*) as n from users").get().n), 1,
  "fixture database must contain only its new super account");

const admin = db.prepare("select * from users where id='54002010'").get();
assert.ok(admin?.salt && admin?.password_hash && admin?.person_id);
const group = db.prepare("select id,parent_id from organization_units where unit_type='personnel_group' and maintenance_eligible=1 order by code limit 1").get();
assert.ok(group, "no maintenance-eligible personnel group");
const team = db.prepare("select id from organization_units where unit_type='administrative_team' and parent_id=? order by code limit 1").get(group.id);
const workerRole = db.prepare("select id from rbac_roles where code='worker'").get();
assert.ok(workerRole, "worker role missing");
const stamp = new Date().toISOString();

for (let index = 0; index < 20; index++) {
  const id = `audit-worker-${index}`;
  const personId = `audit-person-${index}`;
  const name = `隔离并发人员${index + 1}`;
  db.prepare(`insert into personnel(id,employee_no,name,department,home_team,employment_status,data_status,
    department_id,personnel_group_id,administrative_team_id,created_at,updated_at)
    values(?,?,?,?,?,'在职','active',?,?,?,?,?)`)
    .run(personId, String(99010000 + index), name, "隔离测试", "一组", group.parent_id,
      group.id, team?.id || null, stamp, stamp);
  db.prepare(`insert into users(id,username,name,role,salt,password_hash,permissions,allowed_tabs,department,team,
    function_category,status,person_id,must_change_password,credential_version,created_at,updated_at)
    values(?,?,?,'rbac',?,?,'[]','[]','隔离测试','一组','维修','active',?,0,1,?,?)`)
    .run(id, id, name, admin.salt, admin.password_hash, personId, stamp, stamp);
  db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)")
    .run(id, workerRole.id, stamp);
  db.prepare(`insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at)
    values(?,?,?,'self','','','',?,?)`)
    .run(`audit-scope-${index}`, id, "maintenance", stamp, stamp);
  const flightId = `audit-load-flight-${index}`;
  db.prepare(`insert into maintenance_flights(id,date,flight_no,aircraft_no,work_kind,standard_hours,status,
    source,created_by,updated_by,created_at,updated_at)
    values(?,?,?,?,?,2,'已派工','isolated-stress',?,?,?,?)`)
    .run(flightId, "2026-09-29", `AUD-LOAD-${index}`, `TEST-${index}`, "短停", admin.id, admin.id, stamp, stamp);
  for (const [suffix, assigneeId, assigneePersonId, assigneeName, role] of [
    ["worker", id, personId, name, "接机"],
    ["release", admin.id, admin.person_id, admin.name, "放行"]
  ]) {
    db.prepare(`insert into maintenance_assignments(id,owner_type,owner_id,flight_id,person_id,
      user_name,team,role,status,assigned_by,assigned_at)
      values(?,'flight',?,?,?,?,?,?,'已派工',?,?)`)
      .run(`audit-assignment-${index}-${suffix}`, flightId, flightId, assigneePersonId,
        assigneeName, "一组", role, admin.id, stamp);
  }
}

console.log(JSON.stringify({ seededWorkers: 20, seededFlights: 20, database: url.pathname.slice(1) }));
await db.close?.();
