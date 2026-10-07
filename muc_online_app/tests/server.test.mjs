import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { requestQueryStats } from "../db.mjs";
import { seedCapabilityFixture } from "../scripts/capability-fixture.mjs";
import { createPersonnelAccess } from "../personnel-access.mjs";
import { createCapabilityService } from "../capability-service.mjs";
import { importHistoryContext } from "../personnel-import-history.mjs";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ceairm-test-"));
process.env.MUC_NO_LISTEN = "1";
process.env.DB_PATH = path.join(tempDir, "test.sqlite");
process.env.APP_VERSION = "test-version";
process.env.COS_SECRET_ID = "test-secret-id";
process.env.COS_SECRET_KEY = "test-secret-key";
process.env.COS_BUCKET = "test-bucket-1234567890";
process.env.COS_REGION = "ap-shanghai";

const { measuredRoute, parseRangeHeader, cosSignedUrl, attachmentDisposition, db, capabilityService } = await import("../server.mjs");

class MockResponse extends EventEmitter {
  headers = {};
  statusCode = 200;
  body = Buffer.alloc(0);
  writeHead(status, headers = {}) {
    this.statusCode = status;
    this.headers = headers;
    return this;
  }
  write(body = "") {
    this.body = Buffer.concat([this.body, Buffer.isBuffer(body) ? body : Buffer.from(String(body))]);
    return true;
  }
  end(body = "") {
    this.write(body);
    this.emit("finish");
  }
}

test("capability SSE sends changed versions only, keeps heartbeats and revokes expired access", async t => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const req = Readable.from([]);
  req.method = "GET";
  req.url = "/api/capability/events";
  req.headers = { host: "127.0.0.1:8788", cookie: String(login.res.headers["Set-Cookie"]).split(";")[0] };
  const res = new MockResponse();
  t.mock.timers.enable({ apis: ["setInterval"] });
  try {
    await measuredRoute(req, res);
    assert.equal(res.statusCode, 200);
    const messages = () => [...res.body.toString().matchAll(/^data: (.+)$/gm)].map(match => JSON.parse(match[1]));
    assert.equal(messages().length, 1);
    t.mock.timers.tick(3000);
    assert.equal(messages().length, 1);
    assert.match(res.body.toString(), /: heartbeat/);
    // Simulate a commit by a second server sharing the database.
    db.prepare("update capability_meta set revision=revision+1,master_revision=master_revision+1 where id=1").run();
    t.mock.timers.tick(3000);
    assert.equal(messages().length, 2);
    assert.equal(messages()[1].revision, messages()[0].revision + 1);
    assert.equal(messages()[1].masterDataVersion, messages()[0].masterDataVersion + 1);
    t.mock.timers.tick(3000);
    assert.equal(messages().length, 2);
    req.headers.cookie = "";
    t.mock.timers.tick(3000);
    assert.match(res.body.toString(), /event: access-revoked/);
  } finally {
    res.emit("close");
    t.mock.timers.reset();
  }
});

async function request(url, { method = "GET", body, cookie = "", headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  req.headers = { host: "127.0.0.1:8788", origin: "http://127.0.0.1:8788", "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers };
  const res = new MockResponse();
  await measuredRoute(req, res);
  const payload = res.body.length ? JSON.parse(res.body.toString("utf8")) : null;
  return { res, payload };
}

async function requestRaw(url, { method = "GET", body, cookie = "", headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  req.headers = { host: "127.0.0.1:8788", origin: "http://127.0.0.1:8788", "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers };
  const res = new MockResponse();
  await measuredRoute(req, res);
  return res;
}

test("unsafe requests reject cross-origin and simple text bodies before writing", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  assert.equal(login.res.statusCode, 200);
  const cookie = String(login.res.headers["Set-Cookie"] || "").split(";")[0];
  assert.match(String(login.res.headers["Set-Cookie"]), /SameSite=Lax/);
  const before = db.prepare("select count(*) as n from maintenance_flights").get().n;
  const payload = { flightNo: "CSRF-TEST", flightDate: "2026-09-29" };
  const crossed = await request("/api/maintenance/flights", { method: "POST", cookie, body: payload,
    headers: { origin: "https://untrusted.example", "content-type": "text/plain" } });
  assert.equal(crossed.res.statusCode, 403);
  const unknown = await request("/api/maintenance/flights", { method: "POST", cookie, body: payload,
    headers: { origin: "null" } });
  assert.equal(unknown.res.statusCode, 403);
  const wrongType = await request("/api/maintenance/flights", { method: "POST", cookie, body: payload,
    headers: { "content-type": "text/plain" } });
  assert.equal(wrongType.res.statusCode, 415);
  assert.equal(db.prepare("select count(*) as n from maintenance_flights").get().n, before);
});

test("API login throttles repeated bad credentials without blocking other accounts", async () => {
  for (let index = 0; index < 6; index++) {
    const attempt = await request("/api/login", { method: "POST", body: { username: "no-such-login-test", password: "wrong" } });
    assert.equal(attempt.res.statusCode, 401);
  }
  const blocked = await request("/api/login", { method: "POST", body: { username: "no-such-login-test", password: "wrong" } });
  assert.equal(blocked.res.statusCode, 429);
  assert.ok(Number(blocked.res.headers["Retry-After"]) > 0);
  const real = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  assert.equal(real.res.statusCode, 200);
});

test("form login uses the same throttling rule", async () => {
  const form = new URLSearchParams({ username: "no-such-form-test", password: "wrong" }).toString();
  const attempt = async () => {
    const req = Readable.from([Buffer.from(form)]);
    req.method = "POST";
    req.url = "/login";
    req.headers = { host: "127.0.0.1:8788", origin: "http://127.0.0.1:8788", "content-type": "application/x-www-form-urlencoded" };
    const res = new MockResponse();
    await measuredRoute(req, res);
    return res;
  };
  for (let index = 0; index < 6; index++) assert.equal((await attempt()).statusCode, 303);
  const blocked = await attempt();
  assert.equal(blocked.statusCode, 429);
  assert.ok(Number(blocked.headers["Retry-After"]) > 0);
});

function maintenancePerson(user) {
  const linkedId = String(user?.personId || "").trim();
  const eligible = linkedId && db.prepare(`select p.id from personnel p join organization_units g on g.id=p.personnel_group_id
    where p.id=? and p.data_status='active' and g.maintenance_eligible=1`).get(linkedId);
  if (eligible) return user;
  if (linkedId) {
    const group = db.prepare("select id,parent_id from organization_units where unit_type='personnel_group' and maintenance_eligible=1 order by code limit 1").get();
    const team = group ? db.prepare("select id from organization_units where unit_type='administrative_team' and parent_id=? order by code limit 1").get(group.id) : null;
    db.prepare("update personnel set department_id=?,personnel_group_id=?,administrative_team_id=?,department=?,home_team=?,updated_at=? where id=?")
      .run(group?.parent_id || null, group?.id || null, team?.id || null, "维修部", "一组", new Date().toISOString(), linkedId);
    return user;
  }
  const personId = `maintenance-test-${user.id}`;
  const existing = db.prepare("select id from personnel where id=?").get(personId);
  if (!existing) {
    const group = db.prepare("select id,parent_id from organization_units where unit_type='personnel_group' and maintenance_eligible=1 order by code limit 1").get();
    const team = group ? db.prepare("select id from organization_units where unit_type='administrative_team' and parent_id=? order by code limit 1").get(group.id) : null;
    const stamp = new Date().toISOString();
    db.prepare(`insert into personnel(id,employee_no,name,department,home_team,employment_status,data_status,department_id,personnel_group_id,administrative_team_id,created_at,updated_at)
      values(?,?,?,?,?,'在职','active',?,?,?,?,?)`).run(personId, String(testEmployeeSequence++), user.name, "维修部", "一组", group?.parent_id || null, group?.id || null, team?.id || null, stamp, stamp);
  }
  return { ...user, personId };
}

let testEmployeeSequence = 99000000;
function createMaintenanceTestAccount(template, { id, username = id, name }) {
  const personId = `person-${id}`;
  const stamp = new Date().toISOString();
  const employeeNo = String(testEmployeeSequence++);
  const group = db.prepare("select id,parent_id from organization_units where unit_type='personnel_group' and maintenance_eligible=1 order by code limit 1").get();
  const team = group ? db.prepare("select id from organization_units where unit_type='administrative_team' and parent_id=? order by code limit 1").get(group.id) : null;
  db.prepare(`insert into personnel(id,employee_no,name,department,home_team,employment_status,data_status,department_id,personnel_group_id,administrative_team_id,created_at,updated_at)
    values(?,?,?,?,?,'在职','active',?,?,?,?,?)`).run(personId, employeeNo, name, template.department || "维修部", "一组", group?.parent_id || null, group?.id || null, team?.id || null, stamp, stamp);
  const row = { ...template, id, username, name, role: "receiver", status: "active", person_id: personId };
  db.prepare(`insert into users(${Object.keys(row).join(",")}) values(${Object.keys(row).map(() => "?").join(",")})`).run(...Object.values(row));
  const workerRole = db.prepare("select id from rbac_roles where code='worker'").get();
  if (workerRole) db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)").run(id, workerRole.id, stamp);
  db.prepare(`insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at)
    values(?,?,?,?,?,'','',?,?)`).run(`scope-${id}`, id, "maintenance", "administrative_team", team?.id || "", stamp, stamp);
  return { ...row, personId };
}

test("maintenance hour rules are hidden from workers and dispatchers unless explicitly authorized", async () => {
  const template = db.prepare("select * from users where id='54002010'").get();
  const worker = createMaintenanceTestAccount(template, { id: "hour-rule-worker", name: "规则工作者" });
  const dispatcher = createMaintenanceTestAccount(template, { id: "hour-rule-dispatcher", name: "规则派工人" });
  const manager = createMaintenanceTestAccount(template, { id: "hour-rule-manager", name: "规则管理者" });
  const assignRole = (id, code) => {
    const roleId = db.prepare("select id from rbac_roles where code=?").get(code).id;
    db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)").run(id, roleId, new Date().toISOString());
  };
  assignRole(dispatcher.id, "dispatcher");
  assignRole(manager.id, "manager");
  const login = async account => {
    const response = await request("/api/login", { method: "POST", body: { username: account.username, password: "muc2026" } });
    assert.equal(response.res.statusCode, 200);
    return String(response.res.headers["Set-Cookie"]).split(";")[0];
  };
  const workerCookie = await login(worker);
  const dispatcherCookie = await login(dispatcher);
  const managerCookie = await login(manager);
  assert.equal((await request("/api/maintenance/rules", { cookie: workerCookie })).res.statusCode, 403);
  assert.equal((await request("/api/maintenance/rules", { cookie: dispatcherCookie })).res.statusCode, 403);
  assert.equal((await request("/api/maintenance/rules", { cookie: managerCookie })).res.statusCode, 200);
  assert.equal((await request("/api/maintenance/rules", { method: "PUT", cookie: managerCookie, body: { rules: [] } })).res.statusCode, 403);
  assignRole(worker.id, "addon_maintenance_rules");
  const authorizedCookie = await login(worker);
  assert.equal((await request("/api/maintenance/rules", { cookie: authorizedCookie })).res.statusCode, 200);
  const authorizedRules = (await request("/api/maintenance/rules", { cookie: authorizedCookie })).payload.rules;
  assert.equal((await request("/api/maintenance/rules", { method: "PUT", cookie: authorizedCookie, body: { rules: authorizedRules } })).res.statusCode, 200);
});

test("read-only personnel authorization overview searches within current personnel scope", async () => {
  const template = db.prepare("select * from users where id='54002010'").get();
  const viewer = createMaintenanceTestAccount(template, { id: "auth-overview-viewer", name: "授权查询甲" });
  const empty = createMaintenanceTestAccount(template, { id: "auth-overview-empty", name: "无授权人员" });
  const outsider = createMaintenanceTestAccount(template, { id: "auth-overview-outsider", name: "授权范围外" });
  const otherTeam = db.prepare("select id from organization_units where unit_type='administrative_team' and id<>(select administrative_team_id from personnel where id=?) limit 1").get(viewer.personId);
  assert.ok(otherTeam);
  db.prepare("update personnel set administrative_team_id=? where id=?").run(otherTeam.id, outsider.personId);
  const managerRole = db.prepare("select id from rbac_roles where code='manager'").get().id;
  db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)").run(viewer.id, managerRole, new Date().toISOString());
  const viewerTeam = db.prepare("select administrative_team_id from personnel where id=?").get(viewer.personId).administrative_team_id;
  db.prepare("insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at) values(?,?,?,?,?,'','',?,?)")
    .run("auth-overview-personnel-scope", viewer.id, "personnel", "specified_teams", viewerTeam, new Date().toISOString(), new Date().toISOString());
  const project = { project_code: "WX-AUTH-OVERVIEW", project_name: "授权检索测试机型", project_category: "release" };
  const stamp = new Date().toISOString();
  db.prepare("insert into capability_catalog(id,project_code,project_name,project_category,created_at,updated_at) values(?,?,?,?,?,?)")
    .run("auth-overview-project", project.project_code, project.project_name, project.project_category, stamp, stamp);
  const insert = db.prepare(`insert into personnel_authorizations(id,person_id,employee_no,project_code,project_name,authorization_type,authorization_unit,authorization_status,created_at,updated_at)
    values(?,?,?,?,?,?,?,'有效',?,?)`);
  insert.run("auth-overview-in", viewer.personId, db.prepare("select employee_no from personnel where id=?").get(viewer.personId).employee_no, project.project_code, project.project_name, "放行", "测试单位", stamp, stamp);
  insert.run("auth-overview-out", outsider.personId, db.prepare("select employee_no from personnel where id=?").get(outsider.personId).employee_no, project.project_code, project.project_name, "放行", "测试单位", stamp, stamp);
  db.prepare(`insert into personnel_authorizations(id,person_id,employee_no,project_code,project_name,authorization_type,authorization_unit,authorization_status,created_at,updated_at)
    values(?,?,?,?,?,?,?,'待核实',?,?)`).run("auth-overview-pending", viewer.personId,
    db.prepare("select employee_no from personnel where id=?").get(viewer.personId).employee_no,
    project.project_code, project.project_name, "放行", "待核实单位", stamp, stamp);
  const login = async account => {
    const response = await request("/api/login", { method: "POST", body: { username: account.username, password: "muc2026" } });
    assert.equal(response.res.statusCode, 200);
    return String(response.res.headers["Set-Cookie"]).split(";")[0];
  };
  const cookie = await login(viewer);
  const overview = await request("/api/personnel/authorizations/overview?pageSize=100", { cookie });
  assert.equal(overview.res.statusCode, 200);
  const emptyResult = await request(`/api/personnel/authorizations/overview?q=${encodeURIComponent(empty.name)}`, { cookie });
  assert.equal(emptyResult.payload.items.find(item => item.personId === empty.personId)?.displayCount, 0);
  const viewerResult = await request(`/api/personnel/authorizations/overview?q=${encodeURIComponent(viewer.name)}`, { cookie });
  assert.equal(viewerResult.payload.items.find(item => item.personId === viewer.personId)?.displayCount, 1);
  assert.ok(!overview.payload.items.some(item => item.personId === outsider.personId));
  for (const query of [viewer.name, db.prepare("select employee_no from personnel where id=?").get(viewer.personId).employee_no.slice(-4), project.project_name, project.project_code]) {
    const response = await request(`/api/personnel/authorizations/overview?q=${encodeURIComponent(query)}`, { cookie });
    assert.equal(response.res.statusCode, 200);
    assert.ok(response.payload.items.some(item => item.personId === viewer.personId));
    assert.ok(!response.payload.items.some(item => item.personId === outsider.personId));
  }
  const filtered = await request(`/api/personnel/authorizations/overview?q=${encodeURIComponent(project.project_code)}&category=release&onlyWith=true`, { cookie });
  assert.equal(filtered.payload.items.find(item => item.personId === viewer.personId)?.displayCount, 1);
  const pending = await request("/api/personnel/authorizations/overview?status=待核实", { cookie });
  assert.equal(pending.payload.items.find(item => item.personId === viewer.personId)?.displayCount, 1);
  assert.ok(!pending.payload.items.some(item => item.personId === empty.personId));
  const allStatuses = await request(`/api/personnel/authorizations/overview?q=${encodeURIComponent(viewer.name)}&status=all`, { cookie });
  assert.equal(allStatuses.payload.items.find(item => item.personId === viewer.personId)?.displayCount, 2);
  const detail = await request(`/api/personnel/${viewer.personId}/qualifications?type=authorization&q=${encodeURIComponent(project.project_code)}&status=有效`, { cookie });
  assert.equal(detail.payload.total, 1);
  const byUnit = await request(`/api/personnel/${viewer.personId}/qualifications?type=authorization&q=${encodeURIComponent("待核实单位")}`, { cookie });
  assert.equal(byUnit.payload.total, 1);
  assert.equal((await request(`/api/personnel/${outsider.personId}/qualifications?type=authorization`, { cookie })).res.statusCode, 404);
  const workerCookie = await login(empty);
  assert.equal((await request("/api/personnel/authorizations/overview", { cookie: workerCookie })).res.statusCode, 403);
});

test("self-scoped participants can report eligible people across teams without widening dispatch", async () => {
  const adminLogin = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const adminCookie = String(adminLogin.res.headers["Set-Cookie"]).split(";")[0];
  const template = db.prepare("select * from users where id='54002010'").get();
  const worker = createMaintenanceTestAccount(template, { id: "candidate-worker", name: "候选测试" });
  const secondWorker = createMaintenanceTestAccount(template, { id: "candidate-second-worker", name: "第二参与人" });
  const outsider = createMaintenanceTestAccount(template, { id: "candidate-outsider", name: "未参与人员" });
  const colleague = createMaintenanceTestAccount(template, { id: "candidate-colleague", name: "无账户跨组人员" });
  db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=?").run(worker.id);
  db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=?").run(secondWorker.id);
  const otherTeam = db.prepare("select id from organization_units where unit_type='administrative_team' and id<>(select administrative_team_id from personnel where id=?) limit 1").get(worker.personId);
  assert.ok(otherTeam);
  db.prepare("update personnel set administrative_team_id=? where id=?").run(otherTeam.id, colleague.personId);
  db.prepare("delete from rbac_user_roles where user_id=?").run(colleague.id);
  db.prepare("delete from rbac_user_scopes where user_id=?").run(colleague.id);
  db.prepare("delete from users where id=?").run(colleague.id);
  const flight = await request("/api/maintenance/flights", { method: "POST", cookie: adminCookie, body: { date: "2026-09-01", flightNo: "MUCAND", aircraftNo: "BCAND", workKind: "短停", standardHours: 2 } });
  const flightId = flight.payload.flight.id;
  const stamp = new Date().toISOString();
  for (const role of ["放行", "接机"]) db.prepare(`insert into maintenance_assignments(id,owner_type,owner_id,flight_id,person_id,user_name,team,role,status,assigned_by,assigned_at)
    values(?,'flight',?,?,?,?,?,?,'已派工',?,?)`).run(`candidate-${role}`, flightId, flightId, worker.personId, worker.name, "一组", role, template.id, stamp);
  db.prepare(`insert into maintenance_assignments(id,owner_type,owner_id,flight_id,person_id,user_name,team,role,status,assigned_by,assigned_at)
    values(?,'flight',?,?,?,?,?,?,'已派工',?,?)`).run("candidate-second", flightId, flightId, secondWorker.personId, secondWorker.name, "二组", "送机", template.id, stamp);
  db.prepare("update maintenance_flights set status='已派工' where id=?").run(flightId);
  const login = await request("/api/login", { method: "POST", body: { username: worker.username, password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"]).split(";")[0];
  const directory = await request("/api/personnel/directory?purpose=maintenance", { cookie });
  assert.deepEqual(directory.payload.items.map(p => p.personId), [worker.personId]);
  const reports = await request(`/api/maintenance/flights/${flightId}/reports`, { cookie });
  assert.equal(reports.res.statusCode, 200, JSON.stringify(reports.payload));
  assert.equal(reports.payload.report.canSubmit, true);
  assert.equal(reports.payload.report.defaults.towStandardHours, Number(db.prepare("select value from maintenance_hour_rules where rule_type='nonroutineCategoryHours' and name='拖机'").get().value));
  assert.equal((await request("/api/maintenance/rules", { cookie })).res.statusCode, 403);
  assert.ok(reports.payload.report.people.some(p => p.id === colleague.personId && p.employeeNo && !p.accountId));
  assert.ok(reports.payload.report.routine.people.some(p => p.id === colleague.personId && p.employeeNo && !p.accountId), JSON.stringify({ candidates: reports.payload.report.routine.people, colleague: db.prepare('select id,data_status,personnel_group_id from personnel where id=?').get(colleague.personId), permissions: login.payload.user.rbacPermissions, scopes: login.payload.user.dataScopes }));
  const execute = await request("/api/maintenance/flights?scope=execute", { cookie });
  const visibleFlight = execute.payload.flights.find(item => item.id === flightId);
  assert.ok(visibleFlight?.assignments.some(item => item.personId === secondWorker.personId));
  const detail = await request(`/api/maintenance/flights/${flightId}?scope=execute`, { cookie });
  assert.ok(detail.payload.flight.assignments.some(item => item.personId === secondWorker.personId));
  const secondLogin = await request("/api/login", { method: "POST", body: { username: secondWorker.username, password: "muc2026" } });
  const secondCookie = String(secondLogin.res.headers["Set-Cookie"]).split(";")[0];
  assert.equal((await request(`/api/maintenance/flights/${flightId}/reports`, { cookie: secondCookie })).res.statusCode, 200);
  assert.equal((await request("/api/maintenance/rules", { cookie: secondCookie })).res.statusCode, 403);
  assert.equal((await request(`/api/maintenance/flights/${flightId}/reports/release`, { method: "PUT", cookie: secondCookie, body: {} })).res.statusCode, 400);
  const outsiderLogin = await request("/api/login", { method: "POST", body: { username: outsider.username, password: "muc2026" } });
  const outsiderCookie = String(outsiderLogin.res.headers["Set-Cookie"]).split(";")[0];
  assert.equal((await request(`/api/maintenance/flights/${flightId}/reports`, { cookie: outsiderCookie })).res.statusCode, 400);
  assert.equal((await request(`/api/maintenance/flights/${flightId}/reports/routine/draft`, { method: "PUT", cookie: outsiderCookie, body: { entries: [], version: 0 } })).res.statusCode, 400);
  assert.equal((await request(`/api/maintenance/flights/${flightId}/reports/routine`, { method: "PUT", cookie: outsiderCookie, body: { entries: [] } })).res.statusCode, 400);
  const viewer = createMaintenanceTestAccount(template, { id: "candidate-view-only", name: "只读参与人" });
  const viewerRoleId = "candidate-view-only-role";
  db.prepare("delete from rbac_user_roles where user_id=?").run(viewer.id);
  db.prepare("insert into rbac_roles(id,code,name,created_at,updated_at) values(?,?,?,?,?)")
    .run(viewerRoleId, viewerRoleId, "维修执行只读", stamp, stamp);
  const assignViewerPermission = db.prepare(`insert into rbac_role_permissions(role_id,permission_id)
    select ?,id from rbac_permissions where code=?`);
  for (const permission of ["maintenance.view", "maintenance.execute.view"]) assignViewerPermission.run(viewerRoleId, permission);
  db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)").run(viewer.id, viewerRoleId, stamp);
  db.prepare(`insert into maintenance_assignments(id,owner_type,owner_id,flight_id,person_id,user_name,team,role,status,assigned_by,assigned_at)
    values(?,'flight',?,?,?,?,?,?,'已派工',?,?)`).run("candidate-viewer", flightId, flightId, viewer.personId, viewer.name, "一组", "勤务", template.id, stamp);
  const viewerLogin = await request("/api/login", { method: "POST", body: { username: viewer.username, password: "muc2026" } });
  const viewerCookie = String(viewerLogin.res.headers["Set-Cookie"]).split(";")[0];
  const viewerReport = await request(`/api/maintenance/flights/${flightId}/reports`, { cookie: viewerCookie });
  assert.equal(viewerReport.res.statusCode, 200);
  assert.equal(viewerReport.payload.report.canSubmit, false);
  assert.equal((await request(`/api/maintenance/flights/${flightId}/reports/routine/draft`, { method: "PUT", cookie: viewerCookie, body: { entries: [], version: 0 } })).res.statusCode, 403);
  assert.equal((await request(`/api/maintenance/flights/${flightId}/reports/routine`, { method: "PUT", cookie: viewerCookie, body: { entries: [] } })).res.statusCode, 403);
  const entries = [{ role: "接机", personId: worker.personId }, { role: "送机", personId: secondWorker.personId }, { role: "接机", personId: colleague.personId }];
  const saved = await request(`/api/maintenance/flights/${flightId}/reports/routine/draft`, { method: "PUT", cookie, body: { entries, version: 0 } });
  assert.equal(saved.res.statusCode, 200, JSON.stringify(saved.payload));
  const updated = await request(`/api/maintenance/flights/${flightId}/reports`, { cookie });
  assert.ok(updated.payload.report.routine.entries.some(p => p.personId === colleague.personId && p.userName === colleague.name));
  const version = updated.payload.report.routine.draft.version;
  const groupId = db.prepare("select personnel_group_id from personnel where id=?").get(colleague.personId).personnel_group_id;
  db.prepare("update personnel set personnel_group_id=null where id=?").run(colleague.personId);
  const outside = await request(`/api/maintenance/flights/${flightId}/reports/routine`, { method: "PUT", cookie, body: { entries, draftVersion: version } });
  assert.equal(outside.res.statusCode, 400);
  db.prepare("update personnel set personnel_group_id=? where id=?").run(groupId, colleague.personId);
  db.prepare("update personnel set employment_status='停职' where id=?").run(colleague.personId);
  const rejected = await request(`/api/maintenance/flights/${flightId}/reports/routine`, { method: "PUT", cookie, body: { entries, draftVersion: version } });
  assert.equal(rejected.res.statusCode, 400, JSON.stringify(rejected.payload));
  db.prepare("update personnel set employment_status='在职' where id=?").run(colleague.personId);
  const submitted = await request(`/api/maintenance/flights/${flightId}/reports/routine`, { method: "PUT", cookie, body: { entries, draftVersion: version } });
  assert.equal(submitted.res.statusCode, 200, JSON.stringify(submitted.payload));
  const nonroutineItems = [{ temporary: true, title: "跨范围非例行", category: "其他", standardHours: 2, entries: [{ role: "主做", personId: colleague.personId }] }];
  const draft = await request(`/api/maintenance/flights/${flightId}/reports/nonroutine/draft`, { method: "PUT", cookie: secondCookie, body: { items: nonroutineItems, version: 0 } });
  assert.equal(draft.res.statusCode, 200, JSON.stringify(draft.payload));
  const beforeNonroutine = await request(`/api/maintenance/flights/${flightId}/reports`, { cookie: secondCookie });
  const savedNonroutine = await request(`/api/maintenance/flights/${flightId}/reports/nonroutine`, { method: "PUT", cookie: secondCookie, body: { mode: "save", items: nonroutineItems, revision: beforeNonroutine.payload.report.nonroutine.revision } });
  assert.equal(savedNonroutine.res.statusCode, 200, JSON.stringify(savedNonroutine.payload));
  const formal = db.prepare("select id from maintenance_subtasks where flight_id=?").get(flightId);
  const latest = await request(`/api/maintenance/flights/${flightId}/reports`, { cookie: secondCookie });
  const submittedNonroutine = await request(`/api/maintenance/flights/${flightId}/reports/nonroutine`, { method: "PUT", cookie: secondCookie, body: { mode: "submit", items: [{ ...nonroutineItems[0], temporary: false, id: formal.id }], revision: latest.payload.report.nonroutine.revision, draftVersion: latest.payload.report.nonroutine.draft?.version } });
  assert.equal(submittedNonroutine.res.statusCode, 200, JSON.stringify(submittedNonroutine.payload));
});

test("dispatch and report picker search includes independent employee numbers", async () => {
  const source = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
  for (const name of ["renderMaintenanceDispatchPicker", "renderMaintenanceWorkReportPicker"]) {
    const start = source.indexOf(`function ${name}()`);
    const end = source.indexOf("\nfunction ", start + 1);
    const code = source.slice(start, end);
    assert.match(code, /person\.employeeNo/);
  }
});

test("every execution report dialog uses participant report data without loading full hour rules", async () => {
  const source = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const start = source.indexOf("async function openMaintenanceWorkReportDialog(");
  const end = source.indexOf("\nfunction maintenanceWorkActiveContext(", start);
  const dialog = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(dialog, /maintenanceService\.getReports\(flightId\)/);
  assert.match(dialog, /report\.defaults\?\.towStandardHours/);
  assert.doesNotMatch(dialog, /ensureMaintenanceRules\(|\/maintenance\/rules/);
  assert.match(source.slice(source.indexOf("const mainWorkHtml ="), source.indexOf("const flightCardHtml =")), /hasRbac\("maintenance\.execute\.submit"\)/);
});

test("nonroutine-only participant sees peer dispatch in execution list and detail", async () => {
  const admin = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const adminCookie = String(admin.res.headers["Set-Cookie"]).split(";")[0];
  const template = db.prepare("select * from users where id='54002010'").get();
  const release = createMaintenanceTestAccount(template, { id: "execute-peer-release", name: "放行同事" });
  const routine = createMaintenanceTestAccount(template, { id: "execute-peer-routine", name: "例行同事" });
  const nonroutine = createMaintenanceTestAccount(template, { id: "execute-peer-nonroutine", name: "非例行本人" });
  const outsider = createMaintenanceTestAccount(template, { id: "execute-peer-outsider", name: "机会外人员" });
  for (const person of [release, routine, nonroutine, outsider]) {
    db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=?").run(person.id);
  }
  const created = await request("/api/maintenance/flights", { method: "POST", cookie: adminCookie, body: {
    date: "2026-09-02", flightNo: "MUCPEER", aircraftNo: "BPEER", workKind: "短停", standardHours: 2
  } });
  assert.equal(created.res.statusCode, 201);
  const flightId = created.payload.flight.id;
  const subtaskId = "execute-peer-subtask";
  const stamp = new Date().toISOString();
  db.prepare("insert into maintenance_subtasks(id,flight_id,title,category,standard_hours,status,created_at,updated_at) values(?,?,?,?,?,?,?,?)")
    .run(subtaskId, flightId, "同机非例行", "其他", 1, "已派工", stamp, stamp);
  const insert = db.prepare(`insert into maintenance_assignments(id,owner_type,owner_id,flight_id,person_id,user_name,team,role,status,assigned_by,assigned_at)
    values(?,?,?,?,?,?,?,?,'已派工',?,?)`);
  insert.run("execute-peer-a1", "flight", flightId, flightId, release.personId, release.name, "一组", "放行", template.id, stamp);
  insert.run("execute-peer-a2", "flight", flightId, flightId, routine.personId, routine.name, "二组", "接机", template.id, stamp);
  insert.run("execute-peer-a3", "subtask", subtaskId, flightId, nonroutine.personId, nonroutine.name, "三组", "主作", template.id, stamp);
  db.prepare("update maintenance_flights set status='已派工' where id=?").run(flightId);
  const login = await request("/api/login", { method: "POST", body: { username: nonroutine.username, password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"]).split(";")[0];
  for (const suffix of ["?scope=execute", "?scope=execute&view=summary"]) {
    const listed = await request(`/api/maintenance/flights${suffix}`, { cookie });
    assert.equal(listed.res.statusCode, 200);
    const visible = listed.payload.flights.find(item => item.id === flightId);
    assert.ok(visible);
    assert.deepEqual(new Set(visible.assignments.map(item => item.personId)), new Set([release.personId, routine.personId]));
    assert.ok(visible.subtasks.some(item => item.assignments.some(entry => entry.personId === nonroutine.personId)));
    assert.ok(!visible.assignments.some(item => item.personId === outsider.personId));
  }
  const detail = await request(`/api/maintenance/flights/${flightId}?scope=execute`, { cookie });
  assert.equal(detail.res.statusCode, 200);
  assert.deepEqual(new Set(detail.payload.flight.assignments.map(item => item.personId)), new Set([release.personId, routine.personId]));
  const outsiderLogin = await request("/api/login", { method: "POST", body: { username: outsider.username, password: "muc2026" } });
  const outsiderCookie = String(outsiderLogin.res.headers["Set-Cookie"]).split(";")[0];
  assert.equal((await request(`/api/maintenance/flights/${flightId}?scope=execute`, { cookie: outsiderCookie })).res.statusCode, 404);
});

test.after(async () => {
  await db.close?.();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("remarks validate permission, state and conflicts without changing business results", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const created = await request("/api/maintenance/flights", { method: "POST", cookie, body: { date: "2026-09-04", flightNo: "MUNOTE", aircraftNo: "BNOTE", workKind: "短停", remark: "导入备注" } });
  const id = created.payload.flight.id;
  const endpoint = `/api/maintenance/flights/${id}/remark`;
  const row = () => db.prepare("select * from maintenance_flights where id=?").get(id);
  const before = row();
  const save = (remark, originalRemark = row().remark || "") => request(endpoint, { method: "PUT", cookie, body: { remark, originalRemark } });
  assert.equal((await request(endpoint, { method: "PUT", body: { remark: "x", originalRemark: "" } })).res.statusCode, 401);
  assert.equal((await save("第一行\n<script>纯文本</script>")).res.statusCode, 200);
  const current = row();
  for (const key of Object.keys(before).filter(key => !["remark", "updated_by", "updated_at"].includes(key))) assert.equal(current[key], before[key]);
  assert.equal((await save("冲突内容", "导入备注")).res.statusCode, 409);
  assert.equal(row().remark, current.remark);
  assert.equal((await save("x".repeat(2001))).res.statusCode, 400);
  assert.equal((await request(endpoint, { method: "PUT", cookie, body: { remark: "x" } })).res.statusCode, 400);
  assert.equal((await save(42)).res.statusCode, 400);
  assert.equal((await save("")).res.statusCode, 200);
  assert.equal(row().remark, "");
  for (const status of ["已派工", "已提报"]) {
    db.prepare("update maintenance_flights set status=? where id=?").run(status, id);
    assert.equal((await save(status)).res.statusCode, 200);
  }
  for (const status of ["待复核", "已确认"]) {
    db.prepare("update maintenance_flights set status=? where id=?").run(status, id);
    assert.equal((await save("不得覆盖")).res.statusCode, 409);
    assert.equal(row().remark, "已提报");
  }
  db.prepare("update maintenance_flights set status='已提报',archived_at=? where id=?").run(new Date().toISOString(), id);
  assert.equal((await save("归档保护")).res.statusCode, 409);
  const logs = db.prepare("select * from audit_logs where target_id=? and action='maintenance_update_remark'").all(id);
  assert.equal(logs.length, 4);
  assert.equal(JSON.parse(logs[0].detail).before, "导入备注");
  const adminRow = db.prepare("select * from users where id=?").get(login.payload.user.id);
  createMaintenanceTestAccount(adminRow, { id: "remark-limited", name: "备注受限人员" });
  const limitedLogin = await request("/api/login", { method: "POST", body: { username: "remark-limited", password: "muc2026" } });
  const limitedCookie = String(limitedLogin.res.headers["Set-Cookie"] || limitedLogin.res.headers["set-cookie"] || "").split(";")[0];
  assert.equal((await request(endpoint, { method: "PUT", cookie: limitedCookie, body: { remark: "越权", originalRemark: row().remark || "" } })).res.statusCode, 404);
});

test("range requests are parsed safely", () => {
  assert.deepEqual(parseRangeHeader("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(parseRangeHeader("bytes=-10", 100), { start: 90, end: 99 });
  assert.equal(parseRangeHeader("bytes=100-120", 100), null);
});

test("COS download signature includes response metadata", () => {
  const disposition = attachmentDisposition({ name: "维修 说明.txt", type: "text/plain" });
  assert.match(disposition, /^inline; filename\*=UTF-8''/);
  const url = new URL(cosSignedUrl("GET", "attachments/record/1/维修 说明.txt", 300, {
    "response-content-type": "text/plain; charset=utf-8",
    "response-content-disposition": disposition
  }));
  assert.equal(url.searchParams.get("response-content-type"), "text/plain; charset=utf-8");
  assert.match(url.searchParams.get("q-url-param-list") || "", /response-content-disposition/);
});

test("health endpoint reports version and protected APIs require login", async () => {
  const health = await request("/api/health");
  assert.equal(health.res.statusCode, 200);
  assert.equal(health.payload.ok, true);
  assert.equal(health.payload.version, "test-version");
  const maintenance = await request("/api/maintenance/flights?view=summary");
  assert.equal(maintenance.res.statusCode, 401);
});

test("maintenance summaries paginate and full details remain available", async () => {
  const login = await request("/api/login", {
    method: "POST",
    body: { username: "54002010", password: "muc2026" }
  });
  assert.equal(login.res.statusCode, 200);
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  assert.ok(cookie);
  const ids = [];
  for (const [flightNo, aircraftNo] of [["MU1001", "B1001"], ["MU1002", "B1002"]]) {
    const created = await request("/api/maintenance/flights", {
      method: "POST",
      cookie,
      body: {
        date: "2026-08-27",
        flightNo,
        aircraftNo,
        aircraftType: "A320",
        workKind: "短停",
        standardHours: 2
      }
    });
    assert.equal(created.res.statusCode, 201);
    ids.push(created.payload.flight.id);
  }
  const summary = await request("/api/maintenance/flights?scope=dispatch&view=summary&limit=1", { cookie });
  assert.equal(summary.res.statusCode, 200);
  assert.equal(summary.payload.flights.length, 1);
  assert.equal(summary.payload.flights[0].summary, true);
  assert.equal(summary.payload.nextCursor, "1");
  const detail = await request(`/api/maintenance/flights/${encodeURIComponent(ids[0])}?scope=dispatch`, { cookie });
  assert.equal(detail.res.statusCode, 200);
  assert.equal(detail.payload.flight.id, ids[0]);
  assert.equal(detail.payload.flight.summary, undefined);
});

test("same-department dispatchers share unassigned flights while personnel scope and stale saves remain protected", async () => {
  const template = db.prepare("select * from users where id='54002010'").get();
  const creator = createMaintenanceTestAccount(template, { id: "shared-flight-creator", name: "同部门录入人" });
  const dispatcher = createMaintenanceTestAccount(template, { id: "shared-flight-dispatcher", name: "同部门派工人" });
  const outsideCandidate = createMaintenanceTestAccount(template, { id: "shared-flight-candidate", name: "范围外候选人" });
  const otherDepartment = createMaintenanceTestAccount(template, { id: "shared-flight-other-dept", name: "其他部门派工人" });
  const accountIds = [creator.id, dispatcher.id, outsideCandidate.id, otherDepartment.id];
  const personIds = [creator.personId, dispatcher.personId, outsideCandidate.personId, otherDepartment.personId];
  const organizationIds = ["test-dept-shared-other", "test-group-shared-other", "test-team-shared-other", "test-team-shared-peer"];
  let flightId = "";
  try {
    const stamp = new Date().toISOString();
    const dispatcherRole = db.prepare("select id from rbac_roles where code='dispatcher'").get();
    for (const account of [creator, dispatcher, outsideCandidate, otherDepartment]) {
      db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)").run(account.id, dispatcherRole.id, stamp);
    }
    const creatorOrg = db.prepare("select department_id,personnel_group_id,administrative_team_id from personnel where id=?").get(creator.personId);
    db.prepare("insert into organization_units(id,code,name,unit_type,parent_id,status,maintenance_eligible,created_at,updated_at) values(?,?,?,?,?,'active',0,?,?)")
      .run(organizationIds[0], "TEST-DEPT-SHARED-OTHER", "其他维修部", "department", null, stamp, stamp);
    db.prepare("insert into organization_units(id,code,name,unit_type,parent_id,status,maintenance_eligible,created_at,updated_at) values(?,?,?,?,?,'active',1,?,?)")
      .run(organizationIds[1], "TEST-GROUP-SHARED-OTHER", "其他维修组", "personnel_group", organizationIds[0], stamp, stamp);
    db.prepare("insert into organization_units(id,code,name,unit_type,parent_id,status,maintenance_eligible,created_at,updated_at) values(?,?,?,?,?,'active',0,?,?)")
      .run(organizationIds[2], "TEST-TEAM-SHARED-OTHER", "其他部门一组", "administrative_team", organizationIds[1], stamp, stamp);
    db.prepare("insert into organization_units(id,code,name,unit_type,parent_id,status,maintenance_eligible,created_at,updated_at) values(?,?,?,?,?,'active',0,?,?)")
      .run(organizationIds[3], "TEST-TEAM-SHARED-PEER", "同部门二组", "administrative_team", creatorOrg.personnel_group_id, stamp, stamp);
    db.prepare("update personnel set administrative_team_id=?,home_team=?,updated_at=? where id=?")
      .run(organizationIds[3], "同部门二组", stamp, outsideCandidate.personId);
    db.prepare("update rbac_user_scopes set scope_id=? where user_id=? and module='maintenance'")
      .run(organizationIds[3], outsideCandidate.id);
    db.prepare("update personnel set department_id=?,personnel_group_id=?,administrative_team_id=?,department=?,home_team=?,updated_at=? where id=?")
      .run(organizationIds[0], organizationIds[1], organizationIds[2], "其他维修部", "其他部门一组", stamp, otherDepartment.personId);
    db.prepare("update rbac_user_scopes set scope_id=? where user_id=? and module='maintenance'")
      .run(organizationIds[2], otherDepartment.id);

    const login = async account => {
      const response = await request("/api/login", { method: "POST", body: { username: account.username, password: "muc2026" } });
      assert.equal(response.res.statusCode, 200);
      return String(response.res.headers["Set-Cookie"] || response.res.headers["set-cookie"] || "").split(";")[0];
    };
    const creatorCookie = await login(creator);
    const dispatcherCookie = await login(dispatcher);
    const peerDispatcherCookie = await login(outsideCandidate);
    const otherDepartmentCookie = await login(otherDepartment);
    const created = await request("/api/maintenance/flights", {
      method: "POST",
      cookie: creatorCookie,
      body: { date: "2026-10-06", flightNo: "SHARED-DEPT", aircraftNo: "B-SHARED", aircraftType: "A320", workKind: "航后", standardHours: 2 }
    });
    assert.equal(created.res.statusCode, 201, JSON.stringify(created.payload));
    flightId = created.payload.flight.id;

    const sharedList = await request("/api/maintenance/flights?scope=dispatch&view=summary&dateFrom=2026-10-06&dateTo=2026-10-06", { cookie: dispatcherCookie });
    assert.equal(sharedList.res.statusCode, 200);
    assert.ok(sharedList.payload.flights.some(item => item.id === flightId));
    const hiddenList = await request("/api/maintenance/flights?scope=dispatch&view=summary&dateFrom=2026-10-06&dateTo=2026-10-06", { cookie: otherDepartmentCookie });
    assert.equal(hiddenList.res.statusCode, 200);
    assert.ok(!hiddenList.payload.flights.some(item => item.id === flightId));
    assert.equal((await request(`/api/maintenance/flights/${encodeURIComponent(flightId)}?scope=dispatch`, { cookie: otherDepartmentCookie })).res.statusCode, 404);

    const detail = await request(`/api/maintenance/flights/${encodeURIComponent(flightId)}?scope=dispatch`, { cookie: dispatcherCookie });
    assert.equal(detail.res.statusCode, 200);
    const expectedUpdatedAt = detail.payload.flight.updatedAt;
    const rejected = await request(`/api/maintenance/flights/${encodeURIComponent(flightId)}/dispatch`, {
      method: "POST", cookie: dispatcherCookie,
      body: { expectedUpdatedAt, assignments: [{ personId: outsideCandidate.personId, role: "例行机内" }] }
    });
    assert.equal(rejected.res.statusCode, 400);
    assert.match(rejected.payload.error, /维修管控范围/);
    assert.equal(Number(db.prepare("select count(*) as total from maintenance_assignments where flight_id=?").get(flightId).total), 0);
    assert.equal(db.prepare("select updated_at from maintenance_flights where id=?").get(flightId).updated_at, expectedUpdatedAt);

    const assigned = await request(`/api/maintenance/flights/${encodeURIComponent(flightId)}/dispatch`, {
      method: "POST", cookie: dispatcherCookie,
      body: { expectedUpdatedAt, assignments: [{ personId: dispatcher.personId, role: "例行机内" }] }
    });
    assert.equal(assigned.res.statusCode, 200, JSON.stringify(assigned.payload));
    assert.notEqual(assigned.payload.flight.updatedAt, expectedUpdatedAt);
    const stale = await request(`/api/maintenance/flights/${encodeURIComponent(flightId)}/dispatch`, {
      method: "POST", cookie: peerDispatcherCookie,
      body: { expectedUpdatedAt, assignments: [{ personId: outsideCandidate.personId, role: "例行机内" }] }
    });
    assert.equal(stale.res.statusCode, 409);
    assert.equal(stale.payload.code, "maintenance_dispatch_stale");
    assert.equal(Number(db.prepare("select count(*) as total from maintenance_assignments where flight_id=? and person_id=?").get(flightId, dispatcher.personId).total), 1);
  } finally {
    if (flightId) {
      db.prepare("delete from maintenance_assignments where flight_id=?").run(flightId);
      db.prepare("delete from maintenance_subtasks where flight_id=?").run(flightId);
      db.prepare("delete from maintenance_logs where flight_id=?").run(flightId);
      db.prepare("delete from maintenance_flights where id=?").run(flightId);
    }
    for (const id of accountIds) {
      db.prepare("delete from sessions where user_id=?").run(id);
      db.prepare("delete from rbac_user_scopes where user_id=?").run(id);
      db.prepare("delete from rbac_user_roles where user_id=?").run(id);
      db.prepare("delete from users where id=?").run(id);
    }
    for (const id of personIds) db.prepare("delete from personnel where id=?").run(id);
    for (const id of [...organizationIds].reverse()) db.prepare("delete from organization_units where id=?").run(id);
  }
});

test("cadres are dispatchable and reportable but remain outside capability and department ranking populations", async () => {
  const template = db.prepare("select * from users where id='54002010'").get();
  const dispatcher = createMaintenanceTestAccount(template, { id: "cadre-policy-dispatcher", name: "干部派工测试调度" });
  const cadre = createMaintenanceTestAccount(template, { id: "cadre-policy-worker", name: "干部派工测试人员" });
  let flightId = "";
  try {
    const stamp = new Date().toISOString();
    const dispatcherRole = db.prepare("select id from rbac_roles where code='dispatcher'").get();
    db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)").run(dispatcher.id, dispatcherRole.id, stamp);
    const departmentId = db.prepare("select department_id from personnel where id=?").get(dispatcher.personId).department_id;
    const cadreGroup = db.prepare("select id,maintenance_eligible from organization_units where code='GROUP-LINE-CADRE'").get();
    assert.equal(Number(cadreGroup.maintenance_eligible), 0);
    db.prepare("update personnel set department_id=?,personnel_group_id=?,administrative_team_id=null,department='维修部',home_team='',updated_at=? where id=?")
      .run(departmentId, cadreGroup.id, stamp, cadre.personId);
    for (const account of [dispatcher, cadre]) db.prepare("update rbac_user_scopes set scope_type='department',scope_id='' where user_id=? and module='maintenance'").run(account.id);

    const login = async account => {
      const response = await request("/api/login", { method: "POST", body: { username: account.username, password: "muc2026" } });
      assert.equal(response.res.statusCode, 200);
      return { cookie:String(response.res.headers["Set-Cookie"] || response.res.headers["set-cookie"] || "").split(";")[0], user:response.payload.user };
    };
    const dispatchLogin = await login(dispatcher);
    const cadreLogin = await login(cadre);
    const adminLogin = await request("/api/login", { method:"POST", body:{username:"54002010",password:"muc2026"} });
    assert.equal(adminLogin.res.statusCode, 200);
    const dispatchDirectory = await request("/api/personnel/directory?purpose=maintenance_dispatch&pageSize=200", { cookie: dispatchLogin.cookie });
    assert.equal(dispatchDirectory.res.statusCode, 200);
    assert.ok(dispatchDirectory.payload.items.some(person => person.personId === cadre.personId));
    const capabilityDirectory = await request("/api/personnel/directory?purpose=maintenance&pageSize=200", { cookie: dispatchLogin.cookie });
    assert.ok(!capabilityDirectory.payload.items.some(person => person.personId === cadre.personId));

    const created = await request("/api/maintenance/flights", {
      method:"POST", cookie:dispatchLogin.cookie,
      body:{date:"2026-10-06",flightNo:"CADRE-POLICY",aircraftNo:"B-CADRE",aircraftType:"A320",workKind:"短停",standardHours:1}
    });
    assert.equal(created.res.statusCode, 201, JSON.stringify(created.payload));
    flightId = created.payload.flight.id;
    const assigned = await request(`/api/maintenance/flights/${flightId}/dispatch`, {
      method:"POST", cookie:dispatchLogin.cookie,
      body:{expectedUpdatedAt:created.payload.flight.updatedAt,assignments:[{personId:cadre.personId,role:"接机"}]}
    });
    assert.equal(assigned.res.statusCode, 200, JSON.stringify(assigned.payload));
    assert.equal(db.prepare("select person_id from maintenance_assignments where flight_id=?").get(flightId).person_id, cadre.personId);

    db.prepare(`insert into maintenance_hour_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,status,created_at,updated_at)
      values(?,'flight',?,?,?,?,?,?,?,?,?,'已确认',?,?)`).run(`cadre-hours-${flightId}`,flightId,flightId,`cadre-assignment-${flightId}`,cadre.personId,cadre.name,"干部","接机","维修机会",1.25,stamp,stamp);
    const cadreStats = await request("/api/maintenance/stats/personal?month=2026-10", { cookie:cadreLogin.cookie });
    assert.equal(cadreStats.res.statusCode, 200);
    assert.equal(cadreStats.payload.metrics.monthHours, 1.25);
    assert.equal(cadreStats.payload.departmentComparison.available, false);
    assert.equal(cadreStats.payload.departmentComparison.reason, "not_participant");

    const dispatcherStats = await request("/api/maintenance/stats/personal?month=2026-10", { cookie:dispatchLogin.cookie });
    const expectedDepartmentPopulation = Number(db.prepare(`select count(*) as n from personnel p
      join organization_units d on d.id=p.department_id
      join organization_units g on g.id=p.personnel_group_id
      where p.department_id=? and p.data_status='active' and p.employment_status not in ('离职','停职')
        and d.unit_type='department' and d.status='active' and g.unit_type='personnel_group' and g.status='active'
        and g.maintenance_eligible=1 and g.code<>'GROUP-LINE-CADRE'`).get(departmentId).n);
    assert.equal(dispatcherStats.payload.departmentComparison.available, true);
    assert.equal(dispatcherStats.payload.departmentComparison.memberCount, expectedDepartmentPopulation);
    const dispatcherTeamId=db.prepare("select administrative_team_id from personnel where id=?").get(dispatcher.personId).administrative_team_id;
    db.prepare("update rbac_user_scopes set scope_type='administrative_team',scope_id=? where user_id=? and module='maintenance'").run(dispatcherTeamId,dispatcher.id);
    const partialStats = await request("/api/maintenance/stats/personal?month=2026-10", { cookie:dispatchLogin.cookie });
    assert.equal(partialStats.payload.departmentComparison.available, false);
    assert.equal(partialStats.payload.departmentComparison.reason, "incomplete_scope");

    capabilityService.syncMaster();
    const spaces = capabilityService.spaces(adminLogin.payload.user);
    const departmentSpace = spaces.find(item => item.id === `department:${departmentId}`);
    assert.ok(departmentSpace);
    assert.ok(!capabilityService.snapshot(adminLogin.payload.user, departmentSpace.id).people.some(person => person.id === cadre.personId));
  } finally {
    if (flightId) {
      db.prepare("delete from maintenance_hour_results where flight_id=?").run(flightId);
      db.prepare("delete from maintenance_assignments where flight_id=?").run(flightId);
      db.prepare("delete from maintenance_logs where flight_id=?").run(flightId);
      db.prepare("delete from maintenance_flights where id=?").run(flightId);
    }
    for (const account of [dispatcher, cadre]) {
      db.prepare("delete from sessions where user_id=?").run(account.id);
      db.prepare("delete from rbac_user_scopes where user_id=?").run(account.id);
      db.prepare("delete from rbac_user_roles where user_id=?").run(account.id);
      db.prepare("delete from users where id=?").run(account.id);
      db.prepare("delete from capability_current_states where person_id=?").run(account.personId);
      db.prepare("delete from capability_history where person_id=?").run(account.personId);
      db.prepare("delete from personnel where id=?").run(account.personId);
    }
  }
});

test("flight import rejects shifted columns before inserting any rows and normalizes dates", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const valid = { date: "2026/9/1", flightNo: "MUIMPORT", aircraftNo: "BIMPORT", workKind: "短停" };
  const count = () => db.prepare("select count(*) as total from maintenance_flights").get().total;
  const before = count();
  for (const date of ["机号", "B6886", "2026-02-30", "2026-13-01", ""]) {
    const failed = await request("/api/maintenance/flights/import", {
      method: "POST", cookie, body: { rows: [valid, { ...valid, date, aircraftNo: "BINVALID" }] }
    });
    assert.equal(failed.res.statusCode, 400);
    assert.match(failed.payload.error, /第 2 条.*日期/);
    assert.equal(count(), before);
  }
  const imported = await request("/api/maintenance/flights/import", { method: "POST", cookie, body: { rows: [valid] } });
  assert.equal(imported.res.statusCode, 200);
  assert.equal(imported.payload.created, 1);
  const list = await request("/api/maintenance/flights?scope=dispatch&view=summary&dateFrom=2026-09-01&dateTo=2026-09-01", { cookie });
  assert.ok(list.payload.flights.some(flight => flight.aircraftNo === "BIMPORT" && flight.date === "2026-09-01"));
});

test("additional work import only appends unique subtasks and rolls back the whole file on errors", async () => {
  const unauthorized = await request("/api/maintenance/subtasks/import", { method: "POST", body: { rows: [{}] } });
  assert.equal(unauthorized.res.statusCode, 401);
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const flightPayload = {
    date: "2026-09-22", flightNo: "MUADD88", departureFlightNo: "MUADD89", aircraftNo: "B-ADD",
    aircraftType: "A321", stand: "118", plannedArrival: "0043+", plannedDeparture: "0130", workKind: "航后", remark: "不得修改"
  };
  const createdFlight = await request("/api/maintenance/flights", { method: "POST", cookie, body: flightPayload });
  assert.equal(createdFlight.res.statusCode, 201, JSON.stringify(createdFlight.payload));
  const flightId = createdFlight.payload.flight.id;
  const flightBefore = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  const base = { date: "2026-09-22", flightNo: " muadd88 ", departureFlightNo: "MUADD89", aircraftNo: "b-add", workKind: "航后" };
  const rows = [
    { ...base, externalWorkNo: "nr-001", chapter: "25", title: "工卡工作", category: "工卡指令", standardHours: 1.2 },
    { ...base, externalWorkNo: "NR-002", chapter: "26", title: "单项工作", category: "单项工作", standardHours: 0.5 },
    { ...base, externalWorkNo: "NR-003", chapter: "09", title: "拖机", category: "拖机", standardHours: 3 },
    { ...base, externalWorkNo: "NR-004", chapter: "27", title: "其他工作", category: "其他", standardHours: 0.4, reportExplanation: "说明", priority: "重要", remark: "备注" }
  ];
  const imported = await request("/api/maintenance/subtasks/import", { method: "POST", cookie, body: { rows } });
  assert.equal(imported.res.statusCode, 200, JSON.stringify(imported.payload));
  assert.equal(imported.payload.created, 4);
  assert.equal(imported.payload.matchedFlights, 1);
  assert.ok(imported.payload.auditId);
  const stored = db.prepare("select * from maintenance_subtasks where flight_id=? order by external_work_no").all(flightId);
  assert.deepEqual(stored.map(row => row.external_work_no), ["NR-001", "NR-002", "NR-003", "NR-004"]);
  assert.deepEqual(stored.map(row => row.category), ["工卡指令", "单项工作", "拖机", "其他"]);
  assert.ok(stored.every(row => row.status === "未派工"));
  assert.equal(stored[3].content, "说明");
  const flightAfter = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  assert.deepEqual(flightAfter, flightBefore);

  const duplicate = await request("/api/maintenance/subtasks/import", { method: "POST", cookie, body: { rows: [rows[0]] } });
  assert.equal(duplicate.res.statusCode, 400);
  assert.match(duplicate.payload.error, /工作编号已存在/);
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_subtasks where flight_id=?").get(flightId).total), 4);

  const atomic = await request("/api/maintenance/subtasks/import", {
    method: "POST", cookie, body: { rows: [
      { ...base, externalWorkNo: "NR-005", title: "应回滚", category: "其他", standardHours: 0.5 },
      { ...base, externalWorkNo: "NR-006", title: "非法工时", category: "其他", standardHours: 0.55 }
    ] }
  });
  assert.equal(atomic.res.statusCode, 400);
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_subtasks where flight_id=?").get(flightId).total), 4);

  db.prepare("update maintenance_flights set status='待复核' where id=?").run(flightId);
  const protectedImport = await request("/api/maintenance/subtasks/import", {
    method: "POST", cookie, body: { rows: [{ ...base, externalWorkNo: "NR-007", title: "状态保护", category: "其他", standardHours: 0.5 }] }
  });
  assert.equal(protectedImport.res.statusCode, 409);
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_subtasks where flight_id=?").get(flightId).total), 4);
  const adminId = login.payload.user.id;
  const adminTemplate = db.prepare("select * from users where id=?").get(adminId);
  const worker = createMaintenanceTestAccount(adminTemplate, { id: "subtask-import-worker", name: "附加工作只读测试" });
  const workerLogin = await request("/api/login", { method: "POST", body: { username: worker.username, password: "muc2026" } });
  const workerCookie = String(workerLogin.res.headers["Set-Cookie"] || workerLogin.res.headers["set-cookie"] || "").split(";")[0];
  try {
    const forbidden = await request("/api/maintenance/subtasks/import", { method: "POST", cookie: workerCookie, body: { rows: [rows[0]] } });
    assert.equal(forbidden.res.statusCode, 403);
  } finally {
    db.prepare("delete from sessions where user_id=?").run(worker.id);
    db.prepare("delete from rbac_user_scopes where user_id=?").run(worker.id);
    db.prepare("delete from rbac_user_roles where user_id=?").run(worker.id);
    db.prepare("delete from users where id=?").run(worker.id);
    db.prepare("delete from personnel where id=?").run(worker.personId);
  }
});

test("departure flight number survives old updates and import only fills an empty value", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const base = { date: "2026-07-12", flightNo: "MU6406&", aircraftNo: "B-6406", aircraftType: "A321", stand: "117", plannedArrival: "0043+", plannedDeparture: "0130", workKind: "航后" };
  const created = await request("/api/maintenance/flights", { method: "POST", cookie, body: { ...base, departureFlightNo: "MU6407" } });
  assert.equal(created.res.statusCode, 201, JSON.stringify(created.payload));
  const id = created.payload.flight.id;
  assert.equal(created.payload.flight.departureFlightNo, "MU6407");
  const listUrl = "/api/maintenance/flights?scope=dispatch&view=summary&dateFrom=2026-07-12&dateTo=2026-07-12";
  const search = await request(`${listUrl}&search=MU6407`, { cookie });
  assert.ok(search.payload.flights.some(row => row.id === id && row.departureFlightNo === "MU6407"));
  const legacyUpdate = await request(`/api/maintenance/flights/${id}`, { method: "PUT", cookie, body: base });
  assert.equal(legacyUpdate.res.statusCode, 200, JSON.stringify(legacyUpdate.payload));
  assert.equal(db.prepare("select departure_flight_no from maintenance_flights where id=?").get(id).departure_flight_no, "MU6407");
  const cleared = await request(`/api/maintenance/flights/${id}`, { method: "PUT", cookie, body: { ...base, departureFlightNo: "" } });
  assert.equal(cleared.res.statusCode, 200);
  db.prepare("update maintenance_flights set status='已派工' where id=?").run(id);
  const before = db.prepare("select * from maintenance_flights where id=?").get(id);
  const imported = await request("/api/maintenance/flights/import", { method: "POST", cookie, body: { rows: [{ ...base, plannedArrival: "2222", departureFlightNo: "MU6408" }] } });
  assert.equal(imported.res.statusCode, 200);
  assert.equal(imported.payload.created, 0);
  const after = db.prepare("select * from maintenance_flights where id=?").get(id);
  assert.equal(after.departure_flight_no, "MU6408");
  for (const key of Object.keys(before).filter(key => !["departure_flight_no", "updated_by", "updated_at"].includes(key))) assert.equal(after[key], before[key]);
  const repeated = await request("/api/maintenance/flights/import", { method: "POST", cookie, body: { rows: [{ ...base, departureFlightNo: "MU6409" }] } });
  assert.equal(repeated.res.statusCode, 200);
  assert.equal(db.prepare("select departure_flight_no from maintenance_flights where id=?").get(id).departure_flight_no, "MU6408");
});

test("release-only report confirmation always waits for task-tree review", async () => {
  const login = await request("/api/login", {
    method: "POST",
    body: { username: "54002010", password: "muc2026" }
  });
  assert.equal(login.res.statusCode, 200);
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const user = maintenancePerson(login.payload.user);

  const created = await request("/api/maintenance/flights", {
    method: "POST",
    cookie,
    body: {
      date: "2026-09-01",
      flightNo: "MUREVIEW",
      aircraftNo: "BREVIEW",
      aircraftType: "A320",
      workKind: "停场",
      standardHours: 0
    }
  });
  assert.equal(created.res.statusCode, 201);
  const flightId = created.payload.flight.id;
  const assignmentId = `assignment-${flightId}`;
  const batchId = `batch-${flightId}`;
  const stamp = new Date().toISOString();

  db.prepare(`insert into maintenance_assignments(
      id,owner_type,owner_id,flight_id,person_id,user_name,team,role,status,feedback,
      assigned_by,assigned_at,received_at,started_at,completed_at,submitted_at,modified_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(assignmentId, "flight", flightId, flightId, user.personId, user.name, user.team || "管理员", "放行", "已提报", "", user.id, stamp, stamp, stamp, stamp, stamp, stamp);
  db.prepare(`insert into maintenance_report_batches(
      id,flight_id,report_type,status,feedback,version,submitted_by,submitted_by_name,submitted_at,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(batchId, flightId, "release", "已提报", "", 1, user.id, user.name, stamp, stamp, stamp);
  db.prepare(`insert into maintenance_report_entries(
      id,batch_id,flight_id,owner_type,owner_id,role,person_id,user_name,team,standard_hours,source,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(`entry-${flightId}`, batchId, flightId, "flight", flightId, "放行", user.personId, user.name, user.team || "管理员", 0, "放行架次", stamp, stamp);
  db.prepare(`insert into maintenance_sortie_results(
      id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,sorties,status,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(`sortie-${flightId}`, "flight", flightId, flightId, assignmentId, user.personId, user.name, user.team || "管理员", "放行", "放行架次", 1, "已提报", stamp, stamp);
  db.prepare("update maintenance_flights set status='已提报',updated_by=?,updated_at=? where id=?").run(user.id, stamp, flightId);

  const finalized = await request(`/api/maintenance/flights/${encodeURIComponent(flightId)}/report-confirmation`, {
    method: "POST",
    cookie,
    body: {}
  });
  assert.equal(finalized.res.statusCode, 200, JSON.stringify(finalized.payload));
  assert.equal(finalized.payload.flight.status, "待复核");
  assert.equal(finalized.payload.flight.archivedAt, "");
  assert.equal(db.prepare("select status from maintenance_assignments where id=?").get(assignmentId).status, "待复核");
  assert.equal(db.prepare("select status from maintenance_sortie_results where assignment_id=?").get(assignmentId).status, "待复核");
  assert.equal(db.prepare("select status from maintenance_report_batches where id=?").get(batchId).status, "待复核");
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_sortie_results where flight_id=?").get(flightId).total), 1);

  const reviewView = await request(`/api/maintenance/flights/${encodeURIComponent(flightId)}/review`, { cookie });
  assert.equal(reviewView.res.statusCode, 200);
  const reviewTasks = reviewView.payload.review.tasks.map(task => ({
    ownerType: task.ownerType,
    ownerId: task.ownerId,
    assignments: task.assignments.map(item => ({ personId: item.personId, role: item.role }))
  }));
  const endpoint = `/api/maintenance/flights/${encodeURIComponent(flightId)}/review`;
  const putReview = fields => request(endpoint, { method: "PUT", cookie, body: { mode: "save", tasks: reviewTasks, ...fields } });
  assert.equal(reviewView.payload.review.flight.routineElectronicSigned, null);
  assert.equal((await putReview({})).res.statusCode, 200);
  const missingSignature = await putReview({ mode: "confirm" });
  assert.equal(missingSignature.res.statusCode, 400);
  assert.match(missingSignature.payload.error, /请选择例行签署方式/);
  for (const value of [0, 1, "false", "true", {}, []]) {
    assert.equal((await putReview({ routineElectronicSigned: value })).res.statusCode, 400);
  }
  assert.equal(db.prepare("select routine_electronic_signed from maintenance_flights where id=?").get(flightId).routine_electronic_signed, null);
  assert.equal((await putReview({ routineElectronicSigned: false })).res.statusCode, 200);
  const preserved = await putReview({});
  assert.equal(preserved.payload.review.flight.routineElectronicSigned, false);
  const subId = `electronic-sub-${flightId}`;
  db.prepare("insert into maintenance_subtasks(id,flight_id,title,category,standard_hours,status,created_at,updated_at) values(?,?,?,?,?,?,?,?)").run(subId, flightId, "电签测试", "其他", 1, "待复核", stamp, stamp);
  const subTasks = [...reviewTasks, { ownerType: "subtask", ownerId: subId, assignments: [{ personId: user.personId, role: "主作" }] }];
  const missingNonroutine = await putReview({ mode: "confirm", tasks: subTasks });
  assert.match(missingNonroutine.payload.error, /请选择非例行签署方式/);
  const selected = await putReview({ tasks: subTasks, nonroutineElectronicSigned: false });
  assert.equal(selected.res.statusCode, 200);
  assert.equal(selected.payload.review.flight.nonroutineElectronicSigned, false);
  db.prepare("update maintenance_subtasks set standard_hours=0 where id=?").run(subId);
  const blocked = await putReview({ mode: "confirm", tasks: subTasks, routineElectronicSigned: true });
  assert.equal(blocked.res.statusCode, 409);
  assert.equal(db.prepare("select routine_electronic_signed from maintenance_flights where id=?").get(flightId).routine_electronic_signed, 0);
  const deleted = await request(`/api/maintenance/subtasks/${subId}`, { method: "DELETE", cookie, body: { reason: "删除测试项目" } });
  assert.equal(deleted.res.statusCode, 200);
  assert.equal(db.prepare("select nonroutine_electronic_signed from maintenance_flights where id=?").get(flightId).nonroutine_electronic_signed, null);
  const confirmed = await request(`/api/maintenance/flights/${encodeURIComponent(flightId)}/review`, {
    method: "PUT",
    cookie,
    body: { mode: "confirm", tasks: reviewTasks }
  });
  assert.equal(confirmed.res.statusCode, 200);
  assert.equal(confirmed.payload.review.flight.status, "已确认");
  assert.equal(confirmed.payload.review.flight.routineElectronicSigned, false);
  assert.ok(confirmed.payload.review.flight.archivedAt);
  assert.equal(db.prepare("select status from maintenance_assignments where id=?").get(assignmentId).status, "已确认");
  assert.equal(db.prepare("select status from maintenance_sortie_results where assignment_id=?").get(assignmentId).status, "已确认");
  assert.equal(db.prepare("select status from maintenance_report_batches where id=?").get(batchId).status, "已确认");
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_sortie_results where flight_id=?").get(flightId).total), 1);
  db.prepare("update maintenance_flights set routine_electronic_signed=null where id=?").run(flightId);
  const historical = await putReview({ reason: "历史归档校验" });
  assert.equal(historical.res.statusCode, 200);
  assert.equal(historical.payload.review.flight.routineElectronicSigned, null);
  const signatureLogs = db.prepare("select detail from maintenance_logs where flight_id=?").all(flightId);
  assert.ok(signatureLogs.some(log => log.detail.includes('routineElectronicSigned')));
});

test("routine report without nonroutine work also waits for review", async () => {
  const login = await request("/api/login", {
    method: "POST",
    body: { username: "54002010", password: "muc2026" }
  });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const user = maintenancePerson(login.payload.user);
  const created = await request("/api/maintenance/flights", {
    method: "POST",
    cookie,
    body: { date: "2026-09-01", flightNo: "MURTN", aircraftNo: "BRTN", aircraftType: "A320", workKind: "短停", standardHours: 2 }
  });
  assert.equal(created.res.statusCode, 201);
  const flightId = created.payload.flight.id;
  const releaseAssignmentId = `release-${flightId}`;
  const routineAssignmentId = `routine-${flightId}`;
  const releaseBatchId = `release-batch-${flightId}`;
  const routineBatchId = `routine-batch-${flightId}`;
  const hourResultId = `hour-${flightId}`;
  const stamp = new Date().toISOString();
  const insertAssignment = db.prepare(`insert into maintenance_assignments(
      id,owner_type,owner_id,flight_id,person_id,user_name,team,role,status,feedback,
      assigned_by,assigned_at,received_at,started_at,completed_at,submitted_at,modified_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertAssignment.run(releaseAssignmentId, "flight", flightId, flightId, user.personId, user.name, user.team || "管理员", "放行", "已提报", "", user.id, stamp, stamp, stamp, stamp, stamp, stamp);
  insertAssignment.run(routineAssignmentId, "flight", flightId, flightId, user.personId, user.name, user.team || "管理员", "接机", "已提报", "", user.id, stamp, stamp, stamp, stamp, stamp, stamp);
  const insertBatch = db.prepare(`insert into maintenance_report_batches(
      id,flight_id,report_type,status,feedback,version,submitted_by,submitted_by_name,submitted_at,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?)`);
  insertBatch.run(releaseBatchId, flightId, "release", "已提报", "", 1, user.id, user.name, stamp, stamp, stamp);
  insertBatch.run(routineBatchId, flightId, "routine", "已提报", "", 1, user.id, user.name, stamp, stamp, stamp);
  const insertEntry = db.prepare(`insert into maintenance_report_entries(
      id,batch_id,flight_id,owner_type,owner_id,role,person_id,user_name,team,standard_hours,source,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertEntry.run(`release-entry-${flightId}`, releaseBatchId, flightId, "flight", flightId, "放行", user.personId, user.name, user.team || "管理员", 0, "放行架次", stamp, stamp);
  insertEntry.run(`routine-entry-${flightId}`, routineBatchId, flightId, "flight", flightId, "接机", user.personId, user.name, user.team || "管理员", 2, "维修机会", stamp, stamp);
  db.prepare(`insert into maintenance_sortie_results(
      id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,sorties,status,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(`sortie-${flightId}`, "flight", flightId, flightId, releaseAssignmentId, user.personId, user.name, user.team || "管理员", "放行", "放行架次", 1, "已提报", stamp, stamp);
  db.prepare(`insert into maintenance_hour_results(
      id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,status,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(hourResultId, "flight", flightId, flightId, routineAssignmentId, user.personId, user.name, user.team || "管理员", "接机", "维修机会", 0.7, "已提报", stamp, stamp);
  db.prepare("update maintenance_flights set status='已提报',updated_by=?,updated_at=? where id=?").run(user.id, stamp, flightId);

  const finalized = await request(`/api/maintenance/flights/${encodeURIComponent(flightId)}/report-confirmation`, {
    method: "POST",
    cookie,
    body: { routineEntries: [{ role: "接机", personId: user.personId }], feedback: "例行报工完成" }
  });
  assert.equal(finalized.res.statusCode, 200, JSON.stringify(finalized.payload));
  assert.equal(finalized.payload.flight.status, "待复核");
  assert.equal(finalized.payload.flight.archivedAt, "");
  assert.equal(db.prepare("select status from maintenance_hour_results where id=?").get(hourResultId).status, "待复核");
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_hour_results where flight_id=?").get(flightId).total), 1);
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_sortie_results where flight_id=?").get(flightId).total), 1);
});

test("both signature groups may select paper signing when confirming a complete tree", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const user = maintenancePerson(login.payload.user);
  const flight = db.prepare("select * from maintenance_flights where flight_no='MURTN'").get();
  const subId = `signature-${flight.id}`;
  const stamp = new Date().toISOString();
  db.prepare("insert into maintenance_subtasks(id,flight_id,title,category,standard_hours,status,created_at,updated_at) values(?,?,?,?,?,?,?,?)").run(subId, flight.id, "电签确认测试", "其他", 1, "待复核", stamp, stamp);
  const url = `/api/maintenance/flights/${flight.id}/review`;
  const tree = (await request(url, { cookie })).payload.review;
  const tasks = tree.tasks.map(task => ({ ownerType: task.ownerType, ownerId: task.ownerId, assignments: task.ownerType === "subtask" ? [{personId:user.personId,role:"主作"}] : task.assignments.map(a=>({personId:a.personId,role:a.role})) }));
  const saved = await request(url, { method: "PUT", cookie, body: { mode: "save", tasks, routineElectronicSigned: false, nonroutineElectronicSigned: false } });
  assert.equal(saved.res.statusCode,200,JSON.stringify(saved.payload));
  const confirmed = await request(url, { method: "PUT", cookie, body: { mode: "confirm", tasks } });
  assert.equal(confirmed.res.statusCode,200);
  assert.equal(confirmed.payload.review.flight.status,"已确认");
  assert.equal(confirmed.payload.review.flight.routineElectronicSigned,false);
  assert.equal(confirmed.payload.review.flight.nonroutineElectronicSigned,false);
});

async function supplementalWorkFixture(name) {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const created = await request("/api/maintenance/flights", { method: "POST", cookie, body: { date: "2026-09-04", flightNo: name, aircraftNo: "BTEST", workKind: "停场" } });
  assert.equal(created.res.statusCode, 201);
  const id = created.payload.flight.id;
  const source = db.prepare("select id from maintenance_flights where flight_no='MUREVIEW'").get().id;
  const assignmentId = `supp-assignment-${id}`;
  const batchId = `supp-batch-${id}`;
  for (const table of ["maintenance_assignments", "maintenance_report_batches", "maintenance_report_entries", "maintenance_sortie_results"]) {
    const original = db.prepare(`select * from ${table} where flight_id=? limit 1`).get(source);
    const row = { ...original, id: table === "maintenance_assignments" ? assignmentId : table === "maintenance_report_batches" ? batchId : `${table}-${id}`, flight_id: id };
    if ("owner_id" in row) row.owner_id = id;
    if ("assignment_id" in row) row.assignment_id = assignmentId;
    if ("batch_id" in row) row.batch_id = batchId;
    if ("status" in row) row.status = "已提报";
    if ("confirmed_at" in row) row.confirmed_at = "";
    if ("confirmed_by" in row) row.confirmed_by = "";
    db.prepare(`insert into ${table}(${Object.keys(row).join(",")}) values(${Object.keys(row).map(() => "?").join(",")})`).run(...Object.values(row));
  }
  db.prepare("update maintenance_flights set status='已提报' where id=?").run(id);
  const user = maintenancePerson(login.payload.user);
  const item = title => ({ temporary: true, title, category: "其他", standardHours: 2, entries: [{ personId: user.personId, role: "主作" }] });
  const report = body => request(`/api/maintenance/flights/${id}/report-confirmation`, { method: "POST", cookie, body });
  const getReview = async () => (await request(`/api/maintenance/flights/${id}/review`, { cookie })).payload.review;
  const putReview = async fields => {
    const tree = await getReview();
    const tasks = tree.tasks.map(t => ({ ownerType: t.ownerType, ownerId: t.ownerId, assignments: t.assignments.map(a => ({ personId: a.personId, role: a.role })) }));
    return request(`/api/maintenance/flights/${id}/review`, { method: "PUT", cookie, body: { mode: "save", tasks, ...fields } });
  };
  return { id, cookie, user, item, report, getReview, putReview };
}

test("report confirmation persists first nonroutine work and replacement of the last item atomically", async () => {
  const f = await supplementalWorkFixture("MUSUPPREPORT");
  const invalid = await f.report({ nonroutineItems: [{ ...f.item("invalid"), entries: [] }] });
  assert.equal(invalid.res.statusCode, 400);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_subtasks where flight_id=?").get(f.id).n), 0);
  assert.equal(db.prepare("select status from maintenance_flights where id=?").get(f.id).status, "已提报");
  const saved = await f.report({ mode: "save", nonroutineItems: [f.item("first")] });
  assert.equal(saved.res.statusCode, 200, JSON.stringify(saved.payload));
  const first = db.prepare("select * from maintenance_subtasks where flight_id=?").get(f.id);
  assert.equal(first.status, "已提报");
  assert.equal(Number(db.prepare("select count(*) n from maintenance_report_entries where flight_id=? and owner_type='subtask'").get(f.id).n), 1);
  const replacement = { deletedSubtaskIds: [first.id], nonroutineItems: [f.item("replacement")] };
  const rejected = await f.report({ ...replacement, nonroutineItems: [{ ...f.item("bad replacement"), standardHours: 0 }] });
  assert.equal(rejected.res.statusCode, 400);
  assert.ok(db.prepare("select id from maintenance_subtasks where id=?").get(first.id));
  const confirmed = await f.report(replacement);
  assert.equal(confirmed.res.statusCode, 200, JSON.stringify(confirmed.payload));
  assert.equal(confirmed.payload.flight.status, "待复核");
  const rows = db.prepare("select * from maintenance_subtasks where flight_id=?").all(f.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "replacement");
  for (const table of ["maintenance_assignments", "maintenance_hour_results", "maintenance_sortie_results", "maintenance_report_batches", "maintenance_subtasks"]) {
    assert.ok(db.prepare(`select status from ${table} where flight_id=?`).all(f.id).every(r => r.status === "待复核"));
  }
  assert.equal(Number(db.prepare("select count(*) n from maintenance_hour_results where flight_id=?").get(f.id).n), 1);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_sortie_results where flight_id=?").get(f.id).n), 1);
  assert.notEqual((await f.report(replacement)).res.statusCode, 200);
});

test("pending review supplemental work validates reason and signatures then follows the normal review lifecycle", async () => {
  const f = await supplementalWorkFixture("MUSUPPREVIEW");
  const newSubtask = { title: "漏报已完成工作", category: "其他", standardHours: 2, assignments: [{ personId: f.user.personId, role: "主作" }] };
  assert.equal((await f.putReview({ reason: "漏报", newSubtasks: [newSubtask] })).res.statusCode, 409);
  assert.equal((await f.report({})).res.statusCode, 200);
  const fields = { newSubtasks: [newSubtask] };
  assert.equal((await f.putReview(fields)).res.statusCode, 400);
  assert.equal((await f.putReview({ ...fields, reason: "复核发现漏项", mode: "confirm", routineElectronicSigned: false })).res.statusCode, 400);
  for (const change of [{ standardHours: 0.05 }, { category: "invalid" }, { assignments: [] }]) {
    assert.equal((await f.putReview({ reason: "漏报", newSubtasks: [{ ...newSubtask, ...change }] })).res.statusCode, 400);
  }
  assert.equal(Number(db.prepare("select count(*) n from maintenance_subtasks where flight_id=?").get(f.id).n), 0);
  const saved = await f.putReview({ ...fields, reason: "复核发现漏项", routineElectronicSigned: false });
  assert.equal(saved.res.statusCode, 200, JSON.stringify(saved.payload));
  assert.equal(saved.payload.review.flight.status, "待复核");
  assert.equal(saved.payload.review.flight.nonroutineElectronicSigned, null);
  const hour = db.prepare("select * from maintenance_hour_results where flight_id=?").get(f.id);
  assert.equal(hour.status, "待复核");
  assert.equal(hour.hours, 2);
  assert.equal(db.prepare("select status from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(f.id).status, "待复核");
  assert.equal(Number(db.prepare("select count(*) n from maintenance_report_entries where flight_id=? and owner_type='subtask'").get(f.id).n), 1);
  assert.equal((await f.putReview({ mode: "confirm" })).res.statusCode, 400);
  const final = await f.putReview({ mode: "confirm", nonroutineElectronicSigned: false });
  assert.equal(final.res.statusCode, 200, JSON.stringify(final.payload));
  assert.equal(final.payload.review.flight.status, "已确认");
  assert.ok(final.payload.review.flight.archivedAt);
  const finalHours = db.prepare("select * from maintenance_hour_results where flight_id=?").all(f.id);
  assert.equal(finalHours.length, 1);
  assert.equal(finalHours[0].id, hour.id);
  assert.equal(finalHours[0].status, "已确认");
  const archived = await f.putReview({ reason: "归档补录", newSubtasks: [{ ...newSubtask, title: "归档漏项" }] });
  assert.equal(archived.res.statusCode, 200, JSON.stringify(archived.payload));
  assert.equal(archived.payload.review.flight.status, "已确认");
  assert.equal(Number(db.prepare("select count(*) n from maintenance_hour_results where flight_id=? and status='已确认'").get(f.id).n), 2);
});

test("tow nonroutine work uses main-do only and preserves total hours when shared", async () => {
  const f = await supplementalWorkFixture("MUTOW");
  const rules = await request("/api/maintenance/rules", { cookie: f.cookie });
  const towRule = rules.payload.rules.find(row => row.rule_type === "nonroutineCategoryHours" && row.name === "拖机");
  assert.equal(towRule.value, 3);
  assert.ok(rules.payload.rules.some(row => row.rule_type === "roleRatio" && row.name === "主做"));
  assert.ok(!rules.payload.rules.some(row => row.rule_type === "roleRatio" && row.name === "主作"));

  assert.equal((await f.report({})).res.statusCode, 200);
  const admin = db.prepare("select * from users where id=?").get(f.user.id);
  const createdPeople = [["tow-user-2", "tow-user-2", "拖机人员二"], ["tow-user-3", "tow-user-3", "拖机人员三"]]
    .map(([id, username, name]) => createMaintenanceTestAccount(admin, { id, username, name }));
  const people = [{ personId: f.user.personId }, ...createdPeople];
  assert.equal(people.length, 3);
  const base = {
    chapter: "09",
    title: "拖机测试",
    category: "拖机",
    standardHours: 1,
    assignments: people.map(person => ({ personId: person.personId, role: "主做" }))
  };
  const invalid = await f.putReview({ reason: "拖机补录", newSubtasks: [{ ...base, assignments: [{ personId: people[0].personId, role: "检验" }] }] });
  assert.equal(invalid.res.statusCode, 400);

  const saved = await f.putReview({ reason: "拖机补录", newSubtasks: [base] });
  assert.equal(saved.res.statusCode, 200, JSON.stringify(saved.payload));
  const subtask = db.prepare("select * from maintenance_subtasks where flight_id=? and category='拖机'").get(f.id);
  assert.equal(subtask.card_no, "09");
  const assignments = db.prepare("select role from maintenance_assignments where owner_type='subtask' and owner_id=?").all(subtask.id);
  assert.deepEqual(new Set(assignments.map(row => row.role)), new Set(["主做"]));
  const hours = db.prepare("select hours from maintenance_hour_results where owner_type='subtask' and owner_id=? order by hours").all(subtask.id).map(row => Number(row.hours));
  assert.equal(hours.length, 3);
  assert.equal(Number(hours.reduce((sum, value) => sum + value, 0).toFixed(2)), 1);
  assert.ok(hours.at(-1) - hours[0] <= 0.010001);

  const details = await request("/api/maintenance/stats/personal/details?month=2026-09&period=month&type=nonroutine&status=pending", { cookie: f.cookie });
  assert.equal(details.res.statusCode, 200);
  const towDetail = details.payload.rows.find(row => row.flightId === f.id && row.taskName === "拖机测试");
  assert.equal(towDetail?.category, "拖机");
  assert.equal(towDetail?.role, "主做");
  const stats = await request("/api/maintenance/stats/personal?month=2026-09", { cookie: f.cookie });
  assert.equal(stats.res.statusCode, 200);
  assert.ok(stats.payload.composition.month.items.some(item => item.category === "拖机" && item.pendingHours > 0));
});

test("nonroutine combination rules allocate full task hours and preserve existing results", async () => {
  const f = await supplementalWorkFixture("MUCOMBORULE");
  const initial = (await request("/api/maintenance/rules", { cookie: f.cookie })).payload.rules;
  const combinations = initial.filter(row => row.rule_type === "nonroutineCombinationRatio");
  assert.equal(combinations.length, 12);
  for (const name of ["主做+检验+辅助", "主做+检验", "主做+辅助", "检验+辅助", "主做", "检验", "辅助"]) {
    assert.equal(Number(combinations.filter(row => row.combination === name).reduce((sum, row) => sum + row.value, 0).toFixed(2)), 1);
  }
  const admin = db.prepare("select * from users where id=?").get(f.user.id);
  const ids = ["combo-worker-1", "combo-worker-2", "combo-worker-3"].map(id => createMaintenanceTestAccount(admin, { id, name: id }).personId);
  assert.equal((await f.report({})).res.statusCode, 200);
  const task = (title, roles) => ({ title, category: "其他", standardHours: 1, assignments: roles.map(([personId, role]) => ({ personId, role })) });
  const added = await f.putReview({ reason: "核对组合", newSubtasks: [
    task("三工种", [[f.user.personId, "主做"], [ids[0], "检验"], [ids[1], "辅助"]]),
    task("主做检验", [[f.user.personId, "主做"], [ids[0], "检验"]]),
    task("仅主做", [[f.user.personId, "主做"], [ids[0], "主做"], [ids[1], "主做"]]),
    task("检验辅助", [[ids[0], "检验"], [ids[1], "辅助"]])
  ] });
  assert.equal(added.res.statusCode, 200, JSON.stringify(added.payload));
  const results = title => db.prepare(`select h.role,h.hours from maintenance_hour_results h join maintenance_subtasks s on s.id=h.owner_id
    where s.flight_id=? and s.title=? order by h.role,h.hours`).all(f.id, title);
  assert.deepEqual(results("三工种").map(row => row.hours).sort(), [0.3, 0.3, 0.4]);
  assert.deepEqual(results("主做检验").map(row => row.hours).sort(), [0.4, 0.6]);
  assert.deepEqual(results("仅主做").map(row => row.hours).sort(), [0.33, 0.33, 0.34]);
  assert.deepEqual(results("检验辅助").map(row => row.hours).sort(), [0.5, 0.5]);
  const before = results("主做检验");
  const changed = combinations.map(row => row.combination === "主做+检验" ? { ...row, value: row.role === "主做" ? 0.55 : 0.45 } : row);
  const invalid = changed.map(row => row.combination === "主做+检验" && row.role === "主做" ? { ...row, value: 0.56 } : row);
  const withRules = items => initial.map(row => row.rule_type === "nonroutineCombinationRatio" ? items.find(item => item.id === row.id) : row);
  assert.equal((await request("/api/maintenance/rules", { method: "PUT", cookie: f.cookie, body: { rules: withRules(invalid) } })).res.statusCode, 400);
  assert.equal((await request("/api/maintenance/rules", { method: "PUT", cookie: f.cookie, body: { rules: withRules(changed) } })).res.statusCode, 200);
  assert.deepEqual(results("主做检验"), before);
  const after = await f.putReview({ reason: "新增使用新比例", newSubtasks: [task("更新后组合", [[f.user.personId, "主做"], [ids[0], "检验"]])] });
  assert.equal(after.res.statusCode, 200, JSON.stringify(after.payload));
  assert.deepEqual(results("更新后组合").map(row => row.hours).sort(), [0.45, 0.55]);
});

test("first temporary work may be finalized directly and pending supplements may be confirmed in one transaction", async () => {
  const f = await supplementalWorkFixture("MUSUPPDIRECT");
  const finalized = await f.report({ nonroutineItems: [f.item("放行确认新增")] });
  assert.equal(finalized.res.statusCode, 200, JSON.stringify(finalized.payload));
  assert.equal(finalized.payload.flight.status, "待复核");
  const original = db.prepare("select * from maintenance_hour_results where flight_id=?").get(f.id);
  const batch = db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(f.id);
  const confirmed = await f.putReview({
    mode: "confirm", reason: "复核补充遗漏工作", routineElectronicSigned: false, nonroutineElectronicSigned: false,
    newSubtasks: [{ title: "复核新增", category: "其他", standardHours: 3, assignments: [{ personId: f.user.personId, role: "检验" }] }]
  });
  assert.equal(confirmed.res.statusCode, 200, JSON.stringify(confirmed.payload));
  const rows = db.prepare("select * from maintenance_hour_results where flight_id=?").all(f.id);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.status === "已确认"));
  assert.equal(rows.find(row => row.id === original.id).hours, original.hours);
  const afterBatch = db.prepare("select * from maintenance_report_batches where id=?").get(batch.id);
  assert.equal(afterBatch.submitted_by, batch.submitted_by);
  assert.equal(afterBatch.submitted_at, batch.submitted_at);
  assert.equal(afterBatch.status, "已确认");
  assert.equal(Number(db.prepare("select count(*) n from maintenance_report_entries where batch_id=?").get(batch.id).n), 2);
});

test("personal hour details expose a stable flight id for display grouping", async () => {
  const login = await request("/api/login", {
    method: "POST",
    body: { username: "54002010", password: "muc2026" }
  });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const user = maintenancePerson(login.payload.user);
  const created = await request("/api/maintenance/flights", {
    method: "POST",
    cookie,
    body: { date: "2026-09-02", flightNo: "MUGROUP", aircraftNo: "BGROUP", aircraftType: "A320", workKind: "短停", standardHours: 2 }
  });
  assert.equal(created.res.statusCode, 201);
  const flightId = created.payload.flight.id;
  const stamp = new Date().toISOString();
  const insertHour = db.prepare(`insert into maintenance_hour_results(
      id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,status,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertHour.run(`group-receive-${flightId}`, "flight", flightId, flightId, `group-receive-assignment-${flightId}`, user.personId, user.name, user.team || "管理员", "接机", "维修机会", 0.7, "已提报", stamp, stamp);
  insertHour.run(`group-check-${flightId}`, "flight", flightId, flightId, `group-check-assignment-${flightId}`, user.personId, user.name, user.team || "管理员", "例行检查", "维修机会", 0.6, "已提报", stamp, stamp);

  const details = await request("/api/maintenance/stats/personal/details?month=2026-09&period=month&type=all&status=pending", { cookie });
  assert.equal(details.res.statusCode, 200);
  const groupedRows = details.payload.rows.filter(row => row.flightId === flightId);
  assert.equal(groupedRows.length, 2);
  assert.deepEqual(groupedRows.map(row => row.role).sort(), ["例行检查", "接机"].sort());
  assert.equal(Number(groupedRows.reduce((sum, row) => sum + row.hours, 0).toFixed(2)), 1.3);
});

test("maintenance report separates data grains, signatures and selective export", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const user = maintenancePerson(login.payload.user);
  const create = async (flightNo, aircraftNo, workKind) => {
    const result = await request("/api/maintenance/flights", { method: "POST", cookie, body: { date: "2026-09-08", flightNo, aircraftNo, aircraftType: "A320", workKind } });
    assert.equal(result.res.statusCode, 201);
    return result.payload.flight.id;
  };
  const routineFlight = await create("MUREPORT1", "BREPORT1", "短停");
  const mixedFlight = await create("MUREPORT2", "BREPORT2", "航后");
  const stamp = new Date().toISOString();
  db.prepare("update maintenance_flights set status='已确认',routine_electronic_signed=1 where id=?").run(routineFlight);
  db.prepare("update maintenance_flights set status='已确认',routine_electronic_signed=0,nonroutine_electronic_signed=1 where id=?").run(mixedFlight);
  const subtaskId = `report-subtask-${mixedFlight}`;
  db.prepare(`insert into maintenance_subtasks(id,flight_id,title,category,status,created_at,updated_at) values(?,?,?,?,?,?,?)`)
    .run(subtaskId, mixedFlight, "测试非例行", "其他", "已确认", stamp, stamp);
  const hour = db.prepare(`insert into maintenance_hour_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  hour.run(`report-hour-1-${routineFlight}`, "flight", routineFlight, routineFlight, `report-assignment-1-${routineFlight}`, user.personId, user.name, user.team || "管理员", "接机", "维修机会", 0.7, "已确认", stamp, stamp);
  hour.run(`report-hour-2-${routineFlight}`, "flight", routineFlight, routineFlight, `report-assignment-2-${routineFlight}`, user.personId, user.name, user.team || "管理员", "送机", "维修机会", 0.7, "已确认", stamp, stamp);
  hour.run(`report-hour-3-${mixedFlight}`, "subtask", subtaskId, mixedFlight, `report-assignment-3-${mixedFlight}`, user.personId, user.name, user.team || "管理员", "主作", "非例行", 1.5, "已确认", stamp, stamp);
  db.prepare("update maintenance_hour_results set adjusted_hours=1 where id=?").run(`report-hour-1-${routineFlight}`);
  db.prepare(`insert into maintenance_sortie_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,sorties,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(`report-sortie-${routineFlight}`, "flight", routineFlight, routineFlight, `report-release-${routineFlight}`, user.personId, user.name, user.team || "管理员", "放行", "放行架次", 1, "已确认", stamp, stamp);

  const base = "/api/maintenance/report?dateFrom=2026-09-08&dateTo=2026-09-08&status=%E5%B7%B2%E7%A1%AE%E8%AE%A4";
  const dashboard = await request(`${base}&view=dashboard`, { cookie });
  assert.equal(dashboard.res.statusCode, 200, JSON.stringify(dashboard.payload));
  assert.deepEqual({ routine: dashboard.payload.summary.routineHours, nonroutine: dashboard.payload.summary.nonroutineHours, total: dashboard.payload.summary.totalHours }, { routine: 1.7, nonroutine: 1.5, total: 3.2 });
  assert.equal(dashboard.payload.summary.opportunityCount, 2);
  assert.equal(dashboard.payload.summary.sorties, 1);
  assert.deepEqual(dashboard.payload.summary.routineSignature, { electronic: 1, paper: 1, total: 2, electronicPercent: 50, paperPercent: 50 });
  assert.equal(dashboard.payload.summary.nonroutineSignature.electronic, 1);
  assert.equal(dashboard.payload.summary.nonroutineSignature.total, 1);

  const people = await request(`${base}&view=people&page=1&pageSize=10`, { cookie });
  assert.equal(people.payload.pagination.total, 1);
  assert.equal(people.payload.rows[0].opportunityCount, 2);
  assert.equal(people.payload.rows[0].totalHours, 3.2);
  const opportunities = await request(`${base}&view=opportunities`, { cookie });
  assert.equal(opportunities.payload.pagination.total, 2);
  assert.equal(opportunities.payload.rows.find(row => row.id === routineFlight).nonroutineSignature, "不适用");
  const routineAudit = await request(`/api/maintenance/flights/${routineFlight}/report-detail`, { cookie });
  assert.equal(routineAudit.res.statusCode, 200);
  assert.equal(routineAudit.payload.detail.routineHours, 1.7);
  assert.equal(routineAudit.payload.detail.sorties, 1);
  assert.equal(routineAudit.payload.detail.people.filter(row => row.role === "放行").length, 1);
  const personDetails = await request(`${base}&view=personDetails&personId=${encodeURIComponent(user.personId)}`, { cookie });
  assert.deepEqual(personDetails.payload.hours.map(row => row.flightId), [routineFlight, routineFlight, mixedFlight]);
  assert.equal(personDetails.payload.hours.find(row => row.id === `report-hour-1-${routineFlight}`).finalHours, 1);
  assert.equal(personDetails.payload.sorties[0].flightId, routineFlight);
  const olderCreated = await request("/api/maintenance/flights", { method: "POST", cookie, body: { date: "2026-09-07", flightNo: "MUREPORT0", aircraftNo: "BREPORT0", aircraftType: "A320", workKind: "短停" } });
  const olderFlight = olderCreated.payload.flight.id;
  db.prepare("update maintenance_flights set status='已确认',routine_electronic_signed=1 where id=?").run(olderFlight);
  hour.run(`report-hour-old-${olderFlight}`, "flight", olderFlight, olderFlight, `report-assignment-old-${olderFlight}`, user.personId, user.name, user.team || "管理员", "例行检查", "维修机会", 0.3, "已确认", stamp, stamp);
  const chronological = await request(`/api/maintenance/report?dateFrom=2026-09-07&dateTo=2026-09-08&status=%E5%B7%B2%E7%A1%AE%E8%AE%A4&view=personDetails&personId=${encodeURIComponent(user.personId)}`, { cookie });
  assert.equal(chronological.payload.hours[0].date, "2026-09-08");
  assert.equal(chronological.payload.hours.at(-1).date, "2026-09-07");

  const emptyExport = await request(`${base.replace("/report?", "/report/export.xlsx?")}&sections=`, { cookie });
  assert.equal(emptyExport.res.statusCode, 400);
  const exportResponse = await requestRaw(`${base.replace("/report?", "/report/export.xlsx?")}&sections=people,signatures,sorties`, { cookie });
  assert.equal(exportResponse.statusCode, 200);
  assert.equal(exportResponse.body.subarray(0, 2).toString(), "PK");
});

test("maintenance report options and every report view stay within current maintenance scope", async () => {
  const adminLogin = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const adminCookie = String(adminLogin.res.headers["Set-Cookie"]).split(";")[0];
  const template = db.prepare("select * from users where id='54002010'").get();
  const manager = createMaintenanceTestAccount(template, { id: "report-scope-manager", name: "范围管理者" });
  const colleague = createMaintenanceTestAccount(template, { id: "report-scope-colleague", name: "历史范围甲" });
  const outsider = createMaintenanceTestAccount(template, { id: "report-scope-outsider", name: "范围外乙" });
  const teams = db.prepare("select id,name from organization_units where unit_type='administrative_team' order by code").all();
  assert.ok(teams.length >= 2);
  const ownTeam = db.prepare("select administrative_team_id from personnel where id=?").get(manager.personId).administrative_team_id;
  const otherTeam = teams.find(team => team.id !== ownTeam);
  db.prepare("update personnel set administrative_team_id=?,home_team=? where id=?").run(otherTeam.id, otherTeam.name, outsider.personId);
  const dispatcherRole = db.prepare("select id from rbac_roles where code='dispatcher'").get().id;
  db.prepare("delete from rbac_user_roles where user_id=?").run(manager.id);
  db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)").run(manager.id, dispatcherRole, new Date().toISOString());
  const managerLogin = await request("/api/login", { method: "POST", body: { username: manager.username, password: "muc2026" } });
  const managerCookie = String(managerLogin.res.headers["Set-Cookie"]).split(";")[0];
  const outsiderLogin = await request("/api/login", { method: "POST", body: { username: outsider.username, password: "muc2026" } });
  const outsiderCookie = String(outsiderLogin.res.headers["Set-Cookie"]).split(";")[0];
  const createFlight = async number => {
    const response = await request("/api/maintenance/flights", { method: "POST", cookie: adminCookie,
      body: { date: "2026-11-11", flightNo: number, aircraftNo: `B-${number}`, workKind: "航后" } });
    assert.equal(response.res.statusCode, 201);
    db.prepare("update maintenance_flights set status='已确认' where id=?").run(response.payload.flight.id);
    return response.payload.flight.id;
  };
  const mixedId = await createFlight("MUSCOPE1");
  const outsideId = await createFlight("MUSCOPE2");
  const stamp = new Date().toISOString();
  const subtaskId = `scope-subtask-${mixedId}`;
  db.prepare("insert into maintenance_subtasks(id,flight_id,title,category,status,created_at,updated_at) values(?,?,'混合任务','其他','已确认',?,?)").run(subtaskId, mixedId, stamp, stamp);
  const assignment = db.prepare(`insert into maintenance_assignments(id,owner_type,owner_id,flight_id,person_id,user_name,team,role,status,assigned_at)
    values(?,?,?,?,?,?,?,'接机','已确认',?)`);
  const hour = db.prepare(`insert into maintenance_hour_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,status,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,'维修机会',?,'已确认',?,?)`);
  for (const [index, person, flightId, ownerType, ownerId, team, value] of [
    [1, colleague, mixedId, "flight", mixedId, "一组", 1],
    [2, outsider, mixedId, "flight", mixedId, "二组", 2],
    [3, colleague, mixedId, "subtask", subtaskId, "一组", 1.5],
    [4, outsider, mixedId, "subtask", subtaskId, "二组", 3],
    [5, outsider, outsideId, "flight", outsideId, "二组", 4]
  ]) {
    const assignmentId = `report-scope-assignment-${index}`;
    assignment.run(assignmentId, ownerType, ownerId, flightId, person.personId, person.name, team, stamp);
    hour.run(`report-scope-hour-${index}`, ownerType, ownerId, flightId, assignmentId, person.personId, person.name, team, "接机", value, stamp, stamp);
  }
  db.prepare("update personnel set employment_status='离职' where id=?").run(colleague.personId);
  const query = "dateFrom=2026-11-11&dateTo=2026-11-11&status=%E5%B7%B2%E7%A1%AE%E8%AE%A4";
  const options = await request(`/api/maintenance/report/options?${query}`, { cookie: managerCookie });
  assert.equal(options.res.statusCode, 200);
  assert.deepEqual(options.payload.people.map(person => person.personId), [colleague.personId]);
  assert.deepEqual(options.payload.teams, ["一组"]);
  const employeeNo = db.prepare("select employee_no from personnel where id=?").get(colleague.personId).employee_no;
  assert.equal(options.payload.people[0].employeeNo, employeeNo);
  const adminReport = await request(`/api/maintenance/report?${query}&view=dashboard`, { cookie: adminCookie });
  assert.equal(adminReport.payload.summary.totalHours, 11.5);
  const dashboard = await request(`/api/maintenance/report?${query}&view=dashboard`, { cookie: managerCookie });
  assert.equal(dashboard.res.statusCode, 200);
  assert.equal(dashboard.payload.summary.totalHours, 2.5);
  assert.equal(dashboard.payload.summary.opportunityCount, 1);
  const people = await request(`/api/maintenance/report?${query}&view=people`, { cookie: managerCookie });
  assert.deepEqual(people.payload.rows.map(person => person.personId), [colleague.personId]);
  const searched = await request(`/api/maintenance/report?${query}&view=people&search=${employeeNo.slice(-4)}`, { cookie: managerCookie });
  assert.equal(searched.payload.rows.length, 1);
  const outsideFilter = await request(`/api/maintenance/report?${query}&view=people&personId=${outsider.personId}`, { cookie: managerCookie });
  assert.equal(outsideFilter.payload.pagination.total, 0);
  const outsideSearch = await request(`/api/maintenance/report?${query}&view=people&search=${encodeURIComponent(outsider.name)}`, { cookie: managerCookie });
  assert.equal(outsideSearch.payload.pagination.total, 0);
  const opportunities = await request(`/api/maintenance/report?${query}&view=opportunities`, { cookie: managerCookie });
  assert.deepEqual(opportunities.payload.rows.map(row => row.id), [mixedId]);
  assert.equal(opportunities.payload.rows[0].totalHours, 2.5);
  assert.deepEqual(opportunities.payload.rows[0].participants.map(row => row.personId), [colleague.personId]);
  const nonroutine = await request(`/api/maintenance/report?${query}&view=nonroutine`, { cookie: managerCookie });
  assert.equal(nonroutine.res.statusCode, 200, JSON.stringify(nonroutine.payload));
  assert.equal(nonroutine.payload.rows[0].actualHours, 1.5);
  assert.deepEqual(nonroutine.payload.rows[0].people.map(row => row.personId), [colleague.personId]);
  const nonroutineEmployeeSearch = await request(`/api/maintenance/report?${query}&view=nonroutine&search=${employeeNo.slice(-4)}`, { cookie: managerCookie });
  assert.equal(nonroutineEmployeeSearch.payload.pagination.total, 1);
  const nonroutineOutside = await request(`/api/maintenance/report?${query}&view=nonroutine&personId=${outsider.personId}`, { cookie: managerCookie });
  assert.equal(nonroutineOutside.payload.pagination.total, 0);
  const nonroutineSearch = await request(`/api/maintenance/report?${query}&view=nonroutine&search=${encodeURIComponent(outsider.name)}`, { cookie: managerCookie });
  assert.equal(nonroutineSearch.payload.pagination.total, 0);
  const nonroutineDetail = await request(`/api/maintenance/subtasks/${subtaskId}/hour-audit`, { cookie: managerCookie });
  assert.deepEqual(nonroutineDetail.payload.detail.people.map(row => row.personId), [colleague.personId]);
  const detail = await request(`/api/maintenance/flights/${mixedId}/report-detail`, { cookie: managerCookie });
  assert.equal(detail.payload.detail.totalHours, 2.5);
  assert.deepEqual(detail.payload.detail.people.map(row => row.personId), [colleague.personId]);
  assert.equal((await request(`/api/maintenance/flights/${outsideId}/report-detail`, { cookie: managerCookie })).res.statusCode, 404);
  const exportResponse = await requestRaw(`/api/maintenance/report/export.xlsx?${query}&sections=people,opportunities,nonroutine`, { cookie: managerCookie });
  assert.equal(exportResponse.statusCode, 200);
  assert.ok(!exportResponse.body.includes(Buffer.from(outsider.name)));
  assert.equal((await request(`/api/maintenance/report/options?${query}`, { cookie: outsiderCookie })).res.statusCode, 403);
  assert.equal((await request(`/api/maintenance/report?${query}`, { cookie: outsiderCookie })).res.statusCode, 403);
  db.prepare("update personnel set administrative_team_id=?,home_team=? where id=?").run(otherTeam.id, otherTeam.name, colleague.personId);
  const afterTransfer = await request(`/api/maintenance/report/options?${query}`, { cookie: managerCookie });
  assert.equal(afterTransfer.payload.people.length, 0);
  const afterTransferReport = await request(`/api/maintenance/report?${query}&view=dashboard`, { cookie: managerCookie });
  assert.equal(afterTransferReport.payload.summary.totalHours, 0);
});

test("nonroutine audit keeps each task and its full assignment hours with scoped detail access", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const admin = db.prepare("select * from users where id=?").get(login.payload.user.id);
  const workers = ["audit-worker-a", "audit-worker-b", "audit-worker-other"]
    .map((id, index) => createMaintenanceTestAccount(admin, { id, name: `核对人员${index + 1}` }));
  const created = await request("/api/maintenance/flights", { method: "POST", cookie, body: { date: "2026-09-10", flightNo: "MUAUDIT", aircraftNo: "BAUDIT", workKind: "航后" } });
  assert.equal(created.res.statusCode, 201);
  const flightId = created.payload.flight.id;
  db.prepare("update maintenance_flights set status='已确认',nonroutine_electronic_signed=1 where id=?").run(flightId);
  const stamp = new Date().toISOString();
  const task = (id, title, category, status, hours) => db.prepare(`insert into maintenance_subtasks(id,flight_id,card_no,title,category,standard_hours,status,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?)`).run(id, flightId, "09", title, category, hours, status, stamp, stamp);
  const confirmedId = `audit-confirmed-${flightId}`;
  const secondId = `audit-second-${flightId}`;
  const emptyId = `audit-empty-${flightId}`;
  task(confirmedId, "两人拖机", "拖机", "已确认", 3);
  task(secondId, "同航班另一项", "工卡指令", "已确认", 2);
  task(emptyId, "尚未派工", "单项工作", "未派工", 2);
  const assignment = db.prepare(`insert into maintenance_assignments(id,owner_type,owner_id,flight_id,person_id,user_name,team,role,status,assigned_at)
    values(?,'subtask',?,?,?,?,?,?,?,?)`);
  const result = db.prepare(`insert into maintenance_hour_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,hours,adjusted_hours,status,created_at,updated_at)
    values(?,'subtask',?,?,?,?,?,?,?,?,?,?,?,?)`);
  workers.slice(0, 2).forEach((person, index) => {
    const assignmentId = `audit-assignment-${index}-${flightId}`;
    assignment.run(assignmentId, confirmedId, flightId, person.personId, person.name, "一组", "主做", "已确认", stamp);
    result.run(`audit-hour-${index}-${flightId}`, confirmedId, flightId, assignmentId, person.personId, person.name, "一组", "主做", 1.5, index === 0 ? 1.25 : null, "已确认", stamp, stamp);
  });
  const secondAssignment = `audit-second-assignment-${flightId}`;
  assignment.run(secondAssignment, secondId, flightId, workers[1].personId, workers[1].name, "一组", "检验", "已确认", stamp);
  result.run(`audit-second-hour-${flightId}`, secondId, flightId, secondAssignment, workers[1].personId, workers[1].name, "一组", "检验", 0.8, null, "已确认", stamp, stamp);
  const base = "/api/maintenance/report?view=nonroutine&dateFrom=2026-09-10&dateTo=2026-09-10";
  const confirmed = await request(`${base}&status=%E5%B7%B2%E7%A1%AE%E8%AE%A4`, { cookie });
  assert.equal(confirmed.res.statusCode, 200, JSON.stringify(confirmed.payload));
  assert.equal(confirmed.payload.pagination.total, 2);
  assert.deepEqual(new Set(confirmed.payload.rows.map(row => row.id)), new Set([confirmedId, secondId]));
  assert.equal(confirmed.payload.rows.find(row => row.id === confirmedId).actualHours, 2.75);
  assert.equal(confirmed.payload.rows.find(row => row.id === confirmedId).assignedCount, 2);
  const filtered = await request(`${base}&status=%E5%B7%B2%E7%A1%AE%E8%AE%A4&personId=${workers[0].personId}&nonroutineCategory=%E6%8B%96%E6%9C%BA`, { cookie });
  assert.equal(filtered.payload.rows.length, 1);
  assert.equal(filtered.payload.rows[0].actualHours, 2.75);
  const opportunities = await request(`/api/maintenance/report?view=opportunities&dateFrom=2026-09-10&dateTo=2026-09-10&status=%E5%B7%B2%E7%A1%AE%E8%AE%A4&personId=${workers[0].personId}`, { cookie });
  assert.equal(opportunities.payload.rows.length, 1);
  assert.equal(opportunities.payload.rows[0].totalHours, 3.55);
  assert.equal(opportunities.payload.rows[0].participants.length, 2);
  const opportunityDetailUrl = `/api/maintenance/flights/${flightId}/report-detail`;
  assert.equal((await request(opportunityDetailUrl)).res.statusCode, 401);
  const opportunityDetail = await request(opportunityDetailUrl, { cookie });
  assert.equal(opportunityDetail.res.statusCode, 200);
  assert.equal(opportunityDetail.payload.detail.totalHours, 3.55);
  assert.equal(opportunityDetail.payload.detail.subtasks.length, 3);
  const searched = await request(`${base}&status=%E5%B7%B2%E7%A1%AE%E8%AE%A4&search=${workers[0].username}`, { cookie });
  assert.deepEqual(searched.payload.rows.map(row => row.id), [confirmedId]);
  const literalWildcard = await request(`${base}&status=%E5%B7%B2%E7%A1%AE%E8%AE%A4&search=%25`, { cookie });
  assert.equal(literalWildcard.payload.pagination.total, 0);
  const unassigned = await request(`${base}&status=%E6%9C%AA%E6%B4%BE%E5%B7%A5`, { cookie });
  assert.equal(unassigned.payload.rows[0].id, emptyId);
  assert.equal(unassigned.payload.rows[0].hasResults, false);
  const endpoint = `/api/maintenance/subtasks/${confirmedId}/hour-audit`;
  assert.equal((await request(endpoint)).res.statusCode, 401);
  const ownLogin = await request("/api/login", { method: "POST", body: { username: workers[0].username, password: "muc2026" } });
  const ownCookie = String(ownLogin.res.headers["Set-Cookie"] || ownLogin.res.headers["set-cookie"] || "").split(";")[0];
  assert.equal((await request(opportunityDetailUrl, { cookie: ownCookie })).res.statusCode, 403);
  const detail = await request(endpoint, { cookie: ownCookie });
  assert.equal(detail.res.statusCode, 200, JSON.stringify(detail.payload));
  assert.equal(detail.payload.detail.people.length, 2);
  assert.equal(detail.payload.detail.people[0].resultHours, 1.5);
  assert.equal(detail.payload.detail.people[0].finalHours, 1.25);
  const outsiderLogin = await request("/api/login", { method: "POST", body: { username: workers[2].username, password: "muc2026" } });
  const outsiderCookie = String(outsiderLogin.res.headers["Set-Cookie"] || outsiderLogin.res.headers["set-cookie"] || "").split(";")[0];
  assert.equal((await request(endpoint, { cookie: outsiderCookie })).res.statusCode, 403);
  assert.equal((await request(`/api/maintenance/subtasks/${secondId}/hour-audit`, { cookie: ownCookie })).res.statusCode, 403);
  assert.equal((await request(`/api/maintenance/subtasks/${emptyId}/hour-audit`, { cookie: ownCookie })).res.statusCode, 403);
  const ownDetails = await request("/api/maintenance/stats/personal/details?month=2026-09&period=month&type=nonroutine&status=confirmed", { cookie: ownCookie });
  assert.equal(ownDetails.payload.rows.find(row => row.subtaskId === confirmedId)?.hours, 1.25);
  const exported = await requestRaw(`${base.replace("/report?", "/report/export.xlsx?")}&status=%E5%B7%B2%E7%A1%AE%E8%AE%A4&sections=nonroutine`, { cookie });
  assert.equal(exported.statusCode, 200);
  assert.ok(exported.body.includes(Buffer.from("非例行任务")));
  assert.ok(exported.body.includes(Buffer.from("非例行人员工时")));
  const opportunityExport = await requestRaw(`/api/maintenance/report/export.xlsx?view=opportunities&dateFrom=2026-09-10&dateTo=2026-09-10&status=%E5%B7%B2%E7%A1%AE%E8%AE%A4&personId=${workers[0].personId}&sections=opportunities`, { cookie });
  assert.equal(opportunityExport.statusCode, 200);
  assert.ok(opportunityExport.body.includes(Buffer.from("维修机会核对")));
});

test("login and current session expose only the linked person's own position and grade", async () => {
  const template = db.prepare("select * from users where id='54002010'").get();
  const first = createMaintenanceTestAccount(template, { id: "home-identity-first", name: "首页身份甲" });
  const second = createMaintenanceTestAccount(template, { id: "home-identity-second", name: "首页身份乙" });
  db.prepare("update personnel set position_code=?,actual_grade=? where id=?").run("工程师", "GRADE-OWN", first.personId);
  db.prepare("update personnel set position_code=?,actual_grade=? where id=?").run("主管", "GRADE-OTHER", second.personId);
  const firstLogin = await request("/api/login", { method: "POST", body: { username: first.username, password: "muc2026" } });
  assert.equal(firstLogin.res.statusCode, 200);
  assert.ok(!firstLogin.payload.user.rbacPermissions.includes("personnel.actual_grade.view"));
  assert.equal(firstLogin.payload.user.employeeNo, db.prepare("select employee_no from personnel where id=?").get(first.personId).employee_no);
  assert.equal(firstLogin.payload.user.position, "工程师");
  assert.equal(firstLogin.payload.user.actualGrade, "GRADE-OWN");
  assert.equal(firstLogin.payload.user.actualGradeMasked, false);
  assert.ok(!JSON.stringify(firstLogin.payload).includes("GRADE-OTHER"));
  const cookie = String(firstLogin.res.headers["Set-Cookie"]).split(";")[0];
  const current = await request("/api/me", { cookie });
  assert.equal(current.res.statusCode, 200);
  assert.equal(current.payload.user.actualGrade, "GRADE-OWN");
  assert.equal(current.payload.user.actualGradeMasked, false);
  const administrator = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const administratorCookie = String(administrator.res.headers["Set-Cookie"]).split(";")[0];
  const accounts = await request("/api/admin/accounts", { cookie: administratorCookie });
  assert.equal(accounts.res.statusCode, 200);
  const listed = accounts.payload.accounts.find(account => account.id === second.id);
  assert.ok(listed);
  assert.ok(!("position" in listed));
  assert.ok(!("actualGrade" in listed));
  const unlinked = { ...template, id: "home-identity-unlinked", username: "home-identity-unlinked", name: "仅登录账户", person_id: null, role: "receiver", status: "active" };
  db.prepare(`insert into users(${Object.keys(unlinked).join(",")}) values(${Object.keys(unlinked).map(() => "?").join(",")})`).run(...Object.values(unlinked));
  const unlinkedLogin = await request("/api/login", { method: "POST", body: { username: unlinked.username, password: "muc2026" } });
  assert.equal(unlinkedLogin.res.statusCode, 200);
  assert.equal(unlinkedLogin.payload.user.personId, "");
  assert.equal(unlinkedLogin.payload.user.employeeNo, "");
  assert.equal(unlinkedLogin.payload.user.position, "");
  assert.equal(unlinkedLogin.payload.user.actualGrade, "");
  assert.equal(unlinkedLogin.payload.user.actualGradeMasked, false);
});

test("import history batches permission lookups and paginates only visible results", async () => {
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}});
  const cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
  const template=db.prepare('select * from personnel where employee_no=?').get('54002010');
  assert.ok(template);
  const access=createPersonnelAccess({db,hasRbac:()=>true,randomId:()=>'',now:()=>new Date().toISOString(),audit:()=>{},superAccountId:'54002010'});
  const rows=Array.from({length:1000},()=>({'工号':template.employee_no}));
  const batches=[{id:'budget',rows_json:JSON.stringify(rows)}];
  for(const actor of [{id:'54002010'}, {id:'scoped',personId:template.id,dataScopes:[{module:'personnel',scopeType:'self'}]}, {id:'expired',personId:template.id,dataScopes:[{module:'personnel',scopeType:'all',validTo:'2000-01-01T00:00:00Z'}]}]) {
    const stats={count:0,totalMs:0,slowCount:0};
    const context=requestQueryStats.run(stats,()=>importHistoryContext(db,access,actor,batches,row=>row['工号']));
    assert.ok(stats.count<=3,`1000 repeated import rows used ${stats.count} queries`);
    assert.equal(context.allowed.has(template.id),access.allows(actor,'personnel',template.id));
    assert.equal(context.rows.get('budget').length,1000);
  }
  db.exec('begin immediate');
  try {
    db.prepare('delete from personnel_import_batches').run();
    for(let i=0;i<3;i++)db.prepare('insert into personnel_import_batches(id,import_type,file_name,file_hash,status,rows_json,summary_json,created_by,created_by_name,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)').run(`history-${i}`,'personnel',`test${i}.xlsx`,'hash','pending',JSON.stringify(rows),JSON.stringify({total:1000,errors:i}),'54002010','测试','2026-10-07T00:00:00Z','2026-10-07T00:00:00Z');
    const first=await request('/api/personnel/imports?page=1&pageSize=2',{cookie});
    const second=await request('/api/personnel/imports?page=2&pageSize=2',{cookie});
    assert.equal(first.res.statusCode,200);
    assert.equal(first.payload.total,3);assert.equal(first.payload.batches.length,2);
    assert.equal(second.payload.batches.length,1);
    assert.equal(new Set([...first.payload.batches,...second.payload.batches].map(b=>b.id)).size,3);
    assert.deepEqual(first.payload.summary,{pending:3,errors:3});
    assert.ok(first.payload.batches.every(b=>!('rows_json' in b)));
    assert.equal((await request('/api/personnel/imports')).res.statusCode,401);
    const account=createMaintenanceTestAccount(db.prepare('select * from users where id=?').get('54002010'),{id:'import-history-viewer',name:'导入范围测试'});
    const role={...db.prepare('select * from rbac_roles where code=?').get('manager'),id:'import-history-role',code:'import-history-test-role',system_role:0};
    db.prepare(`insert into rbac_roles(${Object.keys(role).join(',')}) values(${Object.keys(role).map(()=>'?').join(',')})`).run(...Object.values(role));
    for(const code of ['personnel.import.view','personnel.qualification.view']) {
      const permission=db.prepare('select id from rbac_permissions where code=?').get(code);
      db.prepare('insert into rbac_role_permissions(role_id,permission_id) values(?,?)').run(role.id,permission.id);
    }
    db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(account.id,role.id,new Date().toISOString());
    db.prepare("insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at) values(?,?,?,'self','','','',?,?)").run('import-history-scope',account.id,'personnel',new Date().toISOString(),new Date().toISOString());
    const ownNumber=db.prepare('select employee_no from personnel where id=?').get(account.personId).employee_no;
    const add=(id,type,items,creator=account.id)=>db.prepare('insert into personnel_import_batches(id,import_type,file_name,file_hash,status,rows_json,summary_json,created_by,created_by_name,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)').run(id,type,`${id}.xlsx`,'hash','pending',JSON.stringify(items),'{}',creator,'测试','2026-10-07T00:00:00Z','2026-10-07T00:00:00Z');
    add('visible-own','personnel',[{'工号':ownNumber}]);
    add('hidden-sensitive','personnel',[{'工号':ownNumber,'实际岗级':'private'}]);
    add('visible-qualification','authorization',[{'工号':ownNumber}]);
    add('visible-unknown-own','personnel',[{'工号':'unknown-number'}]);
    add('hidden-unknown-other','personnel',[{'工号':'unknown-number'}],'54002010');
    const actorLogin=await request('/api/login',{method:'POST',body:{username:account.username,password:'muc2026'}});
    const actorCookie=String(actorLogin.res.headers['Set-Cookie']).split(';')[0];
    const scoped=await request('/api/personnel/imports',{cookie:actorCookie});
    assert.equal(scoped.res.statusCode,200);
    assert.deepEqual(scoped.payload.batches.map(b=>b.id).sort(),['visible-own','visible-qualification','visible-unknown-own'].sort());
    assert.equal(scoped.payload.total,3);
  } finally {db.exec('rollback');}
});

test("capability reads batch states and scopes with a bounded query count and unchanged scope semantics", async () => {
  const previousEnv=process.env.NODE_ENV;
  process.env.NODE_ENV="test";
  try {
    const {workspace}=await seedCapabilityFixture(db);
    capabilityService.syncMaster();
    const access=createPersonnelAccess({db,hasRbac:()=>true,randomId:()=>"unused",now:()=>new Date().toISOString(),audit:()=>{},superAccountId:"54002010"});
    const service=createCapabilityService({db,hasRbac:()=>true,personnelAccess:access,audit:()=>{}});
    const admin={id:"54002010"};
    const measured=actor=>{const stats={count:0,totalMs:0,slowCount:0};const value=requestQueryStats.run(stats,()=>service.snapshot(actor,workspace));return {value,count:stats.count};};
    const baseline=measured(admin);
    const template=db.prepare("select * from personnel where id=?").get(baseline.value.people[0].id);
    const state=db.prepare("select * from capability_current_states where person_id=?").get(template.id);
    db.exec("begin immediate");
    try {
      for(let i=0;i<120;i++) {
        const person={...template,id:`query-budget-person-${i}`,employee_no:String(79000000+i),name:`查询测试${i}`};
        db.prepare(`insert into personnel(${Object.keys(person).join(",")}) values(${Object.keys(person).map(()=>"?").join(",")})`).run(...Object.values(person));
        const current={...state,person_id:person.id,sort_index:100+i};
        db.prepare(`insert into capability_current_states(${Object.keys(current).join(",")}) values(${Object.keys(current).map(()=>"?").join(",")})`).run(...Object.values(current));
      }
      const expanded=measured(admin);
      assert.equal(expanded.value.people.length,baseline.value.people.length+120);
      assert.equal(expanded.count,baseline.count,"adding 120 people must not add per-person queries");
      assert.ok(expanded.count<=20,`snapshot used ${expanded.count} queries`);
      assert.equal(expanded.value.states.length,baseline.value.states.length+120);
      for(const scopes of [
        [{module:"personnel",scopeType:"self"}],
        [{module:"personnel",scopeType:"department"}],
        [{module:"personnel",scopeType:"administrative_team"}],
        [{module:"personnel",scopeType:"specified_groups",scopeId:template.personnel_group_id}],
        [{module:"personnel",scopeType:"self"},{module:"personnel",scopeType:"all",validTo:"2000-01-01T00:00:00Z"}]
      ]) {
        const actor={id:"query-test-account",personId:template.id,dataScopes:scopes};
        const expected=expanded.value.people.filter(p=>access.allows(actor,"personnel",p.id)).map(p=>p.id);
        const scoped=measured(actor).value;
        assert.deepEqual(scoped.people.map(p=>p.id),expected);
        assert.ok(scoped.states.every(s=>expected.includes(s.personId)));
        assert.ok(scoped.records.every(r=>expected.includes(r.person_id)));
      }
      assert.throws(()=>service.snapshot({id:"query-denied",dataScopes:[]},workspace),e=>e.status===403);
      console.log(`快照查询预算：${baseline.count} → ${expanded.count}（增加120人），权限范围一致`);
    } finally {db.exec("rollback");}
  } finally {if(previousEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousEnv;}
});
