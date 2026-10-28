import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import vm from "node:vm";
import { requestQueryStats } from "../db.mjs";
import { seedCapabilityFixture } from "../scripts/capability-fixture.mjs";
import { createPersonnelAccess } from "../personnel-access.mjs";
import { createCapabilityService } from "../capability-service.mjs";
import { importHistoryContext } from "../personnel-import-history.mjs";
import { pptxFixture } from './fixtures/pptx-fixture.mjs';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ceairm-test-"));
process.env.MUC_NO_LISTEN = "1";
process.env.DB_PATH = path.join(tempDir, "test.sqlite");
process.env.UPLOAD_DIR = path.join(tempDir, 'uploads');
process.env.APP_VERSION = "test-version";
process.env.COS_SECRET_ID = "test-secret-id";
process.env.COS_SECRET_KEY = "test-secret-key";
process.env.COS_BUCKET = "test-bucket-1234567890";
process.env.COS_REGION = "ap-shanghai";

const { measuredRoute, pumpInfoSync, parseRangeHeader, cosSignedUrl, verifyCosUploadedAttachment, attachmentDisposition, db, capabilityService } = await import("../server.mjs");
test('dispatch import previews without writes, commits partial successes and replays idempotently',async()=>{
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}});
  const cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
  const template=db.prepare("select * from users where id='54002010'").get();
  const release=createMaintenanceTestAccount(template,{id:'import-release',name:'导入放行员'});
  const mechanic=createMaintenanceTestAccount(template,{id:'import-mechanic',name:'导入维修员'});
  const created=await request('/api/maintenance/flights',{method:'POST',cookie,body:{date:'2026-10-09',flightNo:'MU-IMP-IN',departureFlightNo:'MU-IMP-OUT',aircraftNo:'BIMP',aircraftType:'A320',workKind:'短停'}});
  assert.equal(created.res.statusCode,201,JSON.stringify(created.payload));
  const flightId=created.payload.flight.id;
  const rows=[{date:'2026-10-09',workKind:'短停',flightNo:'MU-IMP-IN/MU-IMP-OUT',releaseNames:release.name,mechanicNames:mechanic.name},{date:'2026-10-09',workKind:'航后',flightNo:'NOT-FOUND',releaseNames:release.name,mechanicNames:mechanic.name}];
  const preview=await request('/api/maintenance/dispatch-import/preview',{method:'POST',cookie,body:{rows}});
  assert.equal(preview.res.statusCode,200,JSON.stringify(preview.payload));assert.equal(preview.payload.success,1);assert.equal(preview.payload.failed,1);
  assert.equal(Number(db.prepare('select count(*) as n from maintenance_assignments where flight_id=?').get(flightId).n),0);
  rows.forEach((row,i)=>Object.assign(row,{matchedFlightId:preview.payload.results[i].flightId,expectedUpdatedAt:preview.payload.results[i].expectedUpdatedAt}));
  const body={requestId:'test_import_batch_001',rows};
  const committed=await request('/api/maintenance/dispatch-import/commit',{method:'POST',cookie,body});
  assert.equal(committed.payload.success,1,JSON.stringify(committed.payload));assert.equal(committed.payload.failed,1);
  assert.equal(db.prepare('select status from maintenance_flights where id=?').get(flightId).status,'已派工');
  const assignments=db.prepare('select person_id,role from maintenance_assignments where flight_id=?').all(flightId);
  assert.deepEqual(assignments.filter(a=>a.person_id===release.personId).map(a=>a.role).sort(),['放行','例行检查','接机','送机'].sort());
  assert.deepEqual(assignments.filter(a=>a.person_id===mechanic.personId).map(a=>a.role).sort(),['接机','送机'].sort());
  const replay=await request('/api/maintenance/dispatch-import/commit',{method:'POST',cookie,body});assert.equal(replay.payload.success,1);
  assert.equal(Number(db.prepare('select count(*) as n from maintenance_assignments where flight_id=?').get(flightId).n),6);
  const again=await request('/api/maintenance/dispatch-import/preview',{method:'POST',cookie,body:{rows}});assert.equal(again.payload.success,0);
  const create=async(number,kind='航后',aircraft='BIMP2')=>(await request('/api/maintenance/flights',{method:'POST',cookie,body:{date:'2026-10-09',flightNo:kind==='航前'?'':number,departureFlightNo:kind==='航前'?number:'',aircraftNo:aircraft,aircraftType:'A320',workKind:kind}})).payload.flight;
  const pre=await create('MU-IMP-PRE','航前');
  const preRow={...rows[0],workKind:'航前',flightNo:'/MU-IMP-PRE'};
  const check=async(items)=> (await request('/api/maintenance/dispatch-import/preview',{method:'POST',cookie,body:{rows:items}})).payload;
  const duplicate=await check([preRow,preRow]);assert.equal(duplicate.failed,2);
  const missing=await check([{...preRow,releaseNames:''}]);assert.equal(missing.failed,1);
  const stalePreview=await check([preRow]);assert.equal(stalePreview.success,1);
  db.prepare('update maintenance_flights set updated_at=? where id=?').run('2099-01-01T00:00:00Z',pre.id);
  const stale=await request('/api/maintenance/dispatch-import/commit',{method:'POST',cookie,body:{requestId:'test_import_stale_001',rows:[{...preRow,matchedFlightId:pre.id,expectedUpdatedAt:stalePreview.results[0].expectedUpdatedAt}]}});
  assert.equal(stale.payload.failed,1);assert.equal(Number(db.prepare('select count(*) as n from maintenance_assignments where flight_id=?').get(pre.id).n),0);
  await create('MU-IMP-AMB','航后','BAMB1');await create('MU-IMP-AMB','航后','BAMB2');
  const ambiguous=await check([{...preRow,workKind:'航后',flightNo:'/MU-IMP-AMB'}]);assert.match(ambiguous.results[0].error,/多个/);
  const workerLogin=await request('/api/login',{method:'POST',body:{username:mechanic.username,password:'muc2026'}});
  const denied=await request('/api/maintenance/dispatch-import/preview',{method:'POST',cookie:String(workerLogin.res.headers['Set-Cookie']).split(';')[0],body:{rows:[preRow]}});assert.equal(denied.res.statusCode,403);
  const post=await create('MU-IMP-POST');
  const postPreview=await check([{...preRow,workKind:'航后',flightNo:'/MU-IMP-POST'}]);
  const postCommit=await request('/api/maintenance/dispatch-import/commit',{method:'POST',cookie,body:{requestId:'test_import_post_001',rows:[{...preRow,workKind:'航后',flightNo:'/MU-IMP-POST',matchedFlightId:post.id,expectedUpdatedAt:postPreview.results[0].expectedUpdatedAt}]}});assert.equal(postCommit.payload.success,1,JSON.stringify(postCommit.payload));
  const postAssignments=db.prepare('select person_id,role from maintenance_assignments where flight_id=?').all(post.id);
  assert.deepEqual(postAssignments.filter(a=>a.person_id===release.personId).map(a=>a.role).sort(),['放行','例行机外','例行发动机','例行L/G','接机'].sort());assert.equal(postAssignments.filter(a=>a.person_id===mechanic.personId).length,4);
  const flightDry=await request('/api/maintenance/flights/import',{method:'POST',cookie,body:{validateOnly:true,rows:[{date:'2026-10-09',flightNo:'MU-DRY',aircraftNo:'BDRY',aircraftType:'A320',workKind:'航后'}]}});
  assert.equal(flightDry.res.statusCode,200);assert.equal(Number(db.prepare("select count(*) as n from maintenance_flights where flight_no='MU-DRY'").get().n),0);
});
// Explicit test-only configuration; production must not infer aircraft groups.
db.prepare("insert into settings(key,value,updated_at) values(?,?,?)").run("maintenance_aircraft_hours_v1", JSON.stringify({ version: 1, groups: [{ id: "test-models", name: "测试机型组", codes: ["A319", "A320", "A321", "A330", "B737", "B787"], enabled: true, hours: Object.fromEntries(db.prepare("select name,value from maintenance_hour_rules where rule_type='workType'").all().map(row => [row.name, row.value])) }] }), new Date().toISOString());

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

async function reportVersion(flightId, cookie) {
  const opened = await request(`/api/maintenance/flights/${flightId}/reports`, { cookie });
  assert.equal(opened.res.statusCode, 200, JSON.stringify(opened.payload));
  assert.ok(opened.payload.report.flight.updatedAt, "报工接口必须返回版本，不能从数据库代填");
  return opened.payload.report.flight.updatedAt;
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
  const flight = await request("/api/maintenance/flights", { method: "POST", cookie: adminCookie, body: { date: "2026-09-01", flightNo: "MUCAND", aircraftNo: "BCAND", aircraftType: "A320", workKind: "短停", standardHours: 2 } });
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
  const outside = await request(`/api/maintenance/flights/${flightId}/reports/routine`, { method: "PUT", cookie, body: { entries, draftVersion: version, expectedUpdatedAt: updated.payload.report.flight.updatedAt } });
  assert.equal(outside.res.statusCode, 400);
  db.prepare("update personnel set personnel_group_id=? where id=?").run(groupId, colleague.personId);
  db.prepare("update personnel set employment_status='停职' where id=?").run(colleague.personId);
  const rejected = await request(`/api/maintenance/flights/${flightId}/reports/routine`, { method: "PUT", cookie, body: { entries, draftVersion: version, expectedUpdatedAt: updated.payload.report.flight.updatedAt } });
  assert.equal(rejected.res.statusCode, 400, JSON.stringify(rejected.payload));
  db.prepare("update personnel set employment_status='在职' where id=?").run(colleague.personId);
  const submitted = await request(`/api/maintenance/flights/${flightId}/reports/routine`, { method: "PUT", cookie, body: { entries, draftVersion: version, expectedUpdatedAt: updated.payload.report.flight.updatedAt } });
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

test('information incremental sync, scoped summaries, edit conflicts and 10MiB limits',async()=>{
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}});
  const cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
  const initial=await request('/api/records?summary=1',{cookie});
  const created=await request('/api/records',{method:'POST',cookie,body:{date:'2026-10-09',title:'realtime test',original:'safe test',category:'其他',allInScope:true}});
  assert.equal(created.res.statusCode,201);const record=created.payload.record;
  const sync=await request('/api/info/sync',{method:'POST',cookie,body:{cursor:initial.payload.cursor,knownIds:[]}});
  assert.equal(sync.res.statusCode,200);assert.equal(sync.payload.reset,false);
  assert.ok(sync.payload.records.some(r=>r.id===record.id));assert.ok(sync.payload.records.every(r=>r.receipts.every(x=>x.userId==='54002010')));
  const body={date:record.date,title:'edited',original:record.original,category:record.category,expectedUpdatedAt:record.updatedAt};
  assert.equal((await request(`/api/records/${record.id}`,{method:'PUT',cookie,body})).res.statusCode,200);
  assert.equal((await request(`/api/records/${record.id}`,{method:'PUT',cookie,body})).res.statusCode,409);
  const sign=size=>request(`/api/records/${record.id}/attachments/presign`,{method:'POST',cookie,body:{name:'limit.txt',type:'text/plain',size}});
  assert.equal((await sign(10*1024*1024)).res.statusCode,200);
  assert.equal((await sign(10*1024*1024+1)).res.statusCode,413);
  const fake=await request(`/api/records/${record.id}/attachments/complete`,{method:'POST',cookie,body:{attachmentId:'att-limit',objectKey:`attachments/record/${record.id}/att-limit-limit.txt`,name:'limit.txt',size:10*1024*1024+1}});
  assert.equal(fake.res.statusCode,413);assert.equal(db.prepare('select 1 from attachments where id=?').get('att-limit'),undefined);
  const denied=await request('/api/info/sync',{method:'POST',body:{cursor:sync.payload.cursor,knownIds:[]}});assert.equal(denied.res.statusCode,401);
});

test('information SSE delivers only lightweight signals and closes revoked sessions',async t=>{
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
  const req=Readable.from([]);req.method='GET';req.url='/api/info/events';req.headers={host:'127.0.0.1:8788',cookie};
  const res=new MockResponse();t.after(()=>res.emit('close'));
  await measuredRoute(req,res);assert.equal(res.statusCode,200);assert.equal(res.headers['X-Accel-Buffering'],'no');
  const created=await request('/api/records',{method:'POST',cookie,body:{date:'2026-10-09',title:'private SSE title',original:'private original',category:'其他',allInScope:true}});
  pumpInfoSync();assert.match(res.body.toString(),/"kind":"content"/);assert.ok(!res.body.toString().includes(created.payload.record.id));assert.ok(!res.body.toString().includes('private SSE title'));
  req.headers.cookie='';pumpInfoSync(true);assert.match(res.body.toString(),/access-revoked/);
});

test('new recipients receive publication signals without waiting for the permission heartbeat',async t=>{
  const template=db.prepare("select * from users where id='54002010'").get();
  const reader=createMaintenanceTestAccount(template,{id:'info-new-recipient',name:'实时新接收人'});
  const outsider=createMaintenanceTestAccount(template,{id:'info-not-recipient',name:'实时非接收人'});
  const connect=async account=>{
    const login=await request('/api/login',{method:'POST',body:{username:account.username,password:'muc2026'}});
    const req=Readable.from([]);req.method='GET';req.url='/api/info/events';req.headers={host:'127.0.0.1:8788',cookie:String(login.res.headers['Set-Cookie']).split(';')[0]};
    const res=new MockResponse();await measuredRoute(req,res);assert.equal(res.statusCode,200);t.after(()=>res.emit('close'));return res;
  };
  pumpInfoSync();const received=await connect(reader),notReceived=await connect(outsider);
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
  const published=await request('/api/records',{method:'POST',cookie,body:{date:'2026-10-09',title:'recipient cache regression',original:'test',category:'其他',recipients:[reader.personId]}});
  assert.equal(published.res.statusCode,201);
  pumpInfoSync();
  assert.match(received.body.toString(),/"kind":"content"/);
  assert.ok(!notReceived.body.toString().includes('"kind":"content"'));
  assert.ok(!received.body.toString().includes(published.payload.record.id));
});

test('200 scoped accounts and 500 historical records use bounded incremental queries',async t=>{
  db.exec('begin');let transactionOpen=true;
  t.after(()=>{if(transactionOpen)db.exec('rollback');});
  const template=db.prepare("select * from users where id='54002010'").get(),stamp=new Date().toISOString();
  const people=Array.from({length:200},(_,i)=>createMaintenanceTestAccount(template,{id:`info-load-${i}`,name:`同步测试${i}`}));
  try{
    for(const person of people){
      db.prepare("insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at) values(?,?,'info','self','','','',?,?)").run(`info-scope-${person.id}`,person.id,stamp,stamp);
      db.prepare('insert into sessions(id,user_id,created_at,expires_at,credential_version) values(?,?,?,?,?)').run(`test-session-${person.id}`,person.id,stamp,'2099-01-01T00:00:00Z',person.credential_version||1);
    }
    for(let n=0;n<500;n++){
      const id=`info-history-${n}`;
      db.prepare("insert into records(id,date,publisher,category,title,original,created_by,updated_by,created_at,updated_at,publisher_id) values(?,'2026-10-09','test','其他',?,'test','54002010','54002010',?,?,'54002010')").run(id,id,stamp,stamp);
      // Preserve the 100,000-row workload without 100,000 client/worker round trips on PostgreSQL.
      db.prepare('insert into record_recipients(record_id,user_id,person_id,name,department,team) values '+people.map(()=>'(?,?,?,?,?,?)').join(',')).run(...people.flatMap(person=>[id,person.id,person.personId,person.name,'test','test']));
    }
  }catch(error){db.exec('rollback');transactionOpen=false;throw error;}
  const snapshots=[],loadStarted=performance.now();
  for(const person of people){
    const cookie=`muc_sid=test-session-${person.id}`;
    const response=await request('/api/records?summary=1',{cookie});assert.equal(response.res.statusCode,200);
    assert.equal(response.payload.records.length,500);
    assert.ok(response.payload.records.every(r=>r.recipients.length===1 && r.recipients[0].id===person.id));
    snapshots.push({cookie,cursor:response.payload.cursor,knownIds:response.payload.records.map(r=>r.id)});
  }
  const initialMs=performance.now()-loadStarted;
  pumpInfoSync();
  const streams=[];
  t.after(()=>streams.forEach(stream=>stream.emit('close')));
  for(const snapshot of snapshots){
    const req=Readable.from([]);req.method='GET';req.url='/api/info/events';req.headers={host:'127.0.0.1:8788',cookie:snapshot.cookie};
    const res=new MockResponse();await measuredRoute(req,res);assert.equal(res.statusCode,200);streams.push(res);
  }
  for(const person of people)db.prepare("insert into read_receipts(record_id,user_id,read_at,is_overdue,remind_count,last_reminded_at) values('info-history-0',?,?,0,0,'')").run(person.id,stamp);
  const fanoutStarted=performance.now();pumpInfoSync();const fanoutMs=performance.now()-fanoutStarted;
  assert.ok(streams.every(stream=>(stream.body.toString().match(/event: info/g)||[]).length>=2));
  assert.ok(streams.every(stream=>!stream.body.toString().includes('info-history-')));
  const started=performance.now(),before=db.queryStats().count;
  for(const snapshot of snapshots){
    const response=await request('/api/info/sync',{method:'POST',cookie:snapshot.cookie,body:{cursor:snapshot.cursor,knownIds:snapshot.knownIds}});
    assert.equal(response.res.statusCode,200);assert.equal(response.payload.reset,false);assert.equal(response.payload.records.length,0);assert.equal(response.payload.updates.length,1);assert.equal(response.payload.updates[0].ownReceipts.length,1);
  }
  const queries=db.queryStats().count-before;
  assert.ok(queries<=200*50,`unexpected query amplification: ${queries}`);
  console.log(JSON.stringify({infoAccounts:200,history:500,recipientRelations:100000,initialMs:Math.round(initialMs),fanoutMs:Math.round(fanoutMs),deltaMs:Math.round(performance.now()-started),queries,fullReloads:0,network:'mock streams, not live sockets'}));
});

test("COS upload verification distinguishes authorization, missing objects, service failures and size mismatches", async () => {
  const response = (status, length = "12") => new Response(null, { status, headers: { "content-length": length, "x-cos-request-id": "cos-test-request" } });
  const check = (status, length) => verifyCosUploadedAttachment("attachments/record/test/att-test-中文.xlsx", 12, async (url, options) => {
    assert.equal(options.method, "HEAD");
    assert.ok(options.signal);
    assert.match(new URL(url).pathname, /attachments\/record\/test/);
    return response(status, length);
  });
  assert.deepEqual(await check(200), { ok: true });
  const forbidden = await check(403);
  assert.equal(forbidden.status, 502);
  assert.equal(forbidden.code, "COS_UPLOAD_CHECK_FORBIDDEN");
  assert.match(forbidden.error, /HeadObject/);
  assert.ok(!forbidden.error.includes("未找到"));
  assert.equal(forbidden.requestId, "cos-test-request");
  const missing = await check(404);
  assert.equal(missing.status, 409);
  assert.equal(missing.code, "COS_UPLOAD_OBJECT_NOT_FOUND");
  assert.equal((await check(500)).code, "COS_UPLOAD_CHECK_FAILED");
  assert.equal((await check(200, "11")).code, "COS_UPLOAD_SIZE_MISMATCH");
  const unavailable = await verifyCosUploadedAttachment("test", 12, async () => { throw new Error("secret-bearing network error"); });
  assert.equal(unavailable.code, "COS_UPLOAD_CHECK_UNAVAILABLE");
  assert.ok(!JSON.stringify(unavailable).includes("secret-bearing"));
});

test("COS download signature includes response metadata", () => {
  const disposition = attachmentDisposition({ name: "维修 说明.txt", type: "text/plain" });
  assert.match(disposition, /^inline; filename\*=UTF-8''/);
  assert.match(attachmentDisposition({ name: "维修 说明.txt", type: "text/plain" }, true), /^attachment; filename\*=UTF-8''/);
  const url = new URL(cosSignedUrl("GET", "attachments/record/1/维修 说明.txt", 300, {
    "response-content-type": "text/plain; charset=utf-8",
    "response-content-disposition": disposition
  }));
  assert.equal(url.searchParams.get("response-content-type"), "text/plain; charset=utf-8");
  assert.match(url.searchParams.get("q-url-param-list") || "", /response-content-disposition/);
});

test('attachment preview and original download reauthorize and sign distinct dispositions', async () => {
  const login = await request('/api/login', { method: 'POST', body: { username: '54002010', password: 'muc2026' } });
  const cookie = String(login.res.headers['Set-Cookie']).split(';')[0];
  const template = db.prepare("select * from users where id='54002010'").get();
  const reader = createMaintenanceTestAccount(template, { id: 'attachment-reader', name: '附件接收者' });
  const created = await request('/api/records', { method: 'POST', cookie, body: { date: '2026-10-11', title: '附件权限测试', original: 'test', category: '其他', recipients: [reader.personId] } });
  assert.equal(created.res.statusCode, 201);
  const record = created.payload.record;
  db.prepare('insert into attachments(id,owner_type,owner_id,name,type,size,storage,path,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?)')
    .run('viewer-download-test', 'record', record.id, '中文 原文件.pdf', 'application/pdf', 100, 'cos', `attachments/record/${record.id}/viewer-download-test.pdf`, '54002010', new Date().toISOString());
  const readerLogin = await request('/api/login', { method: 'POST', body: { username: reader.username, password: 'muc2026' } });
  const readerCookie = String(readerLogin.res.headers['Set-Cookie']).split(';')[0];
  const base = '/api/attachments/viewer-download-test';
  const preview = await request(`${base}/access`, { cookie: readerCookie });
  assert.equal(preview.res.statusCode, 200);
  assert.match(new URL(preview.payload.url).searchParams.get('response-content-disposition'), /^inline;/);
  const access = await request(`${base}/access?download=1`, { cookie: readerCookie });
  assert.equal(access.res.statusCode, 200);
  assert.match(new URL(access.payload.url).searchParams.get('response-content-disposition'), /^attachment;/);
  const download = await request(`${base}?download=1`, { cookie: readerCookie });
  assert.equal(download.res.statusCode, 302);
  assert.match(new URL(download.res.headers.Location).searchParams.get('response-content-disposition'), /^attachment;/);
  assert.equal((await request(`${base}?download=1`)).res.statusCode, 401);
  db.prepare('delete from record_recipients where record_id=? and user_id=?').run(record.id, reader.id);
  assert.equal((await request(`${base}/access`, { cookie: readerCookie })).res.statusCode, 403);
  assert.equal((await requestRaw(`${base}?download=1`, { cookie: readerCookie })).statusCode, 403);
});

test('PPTX local upload and COS signing retain limits and block legacy and macro formats', async t => {
  const login = await request('/api/login', { method: 'POST', body: { username: '54002010', password: 'muc2026' } });
  const cookie = String(login.res.headers['Set-Cookie']).split(';')[0];
  const created = await request('/api/records', { method: 'POST', cookie, body: { date: '2026-10-12', title: 'PPTX上传测试', original: 'test', category: '其他', allInScope: true } });
  assert.equal(created.res.statusCode, 201);
  const base = `/api/records/${created.payload.record.id}/attachments`;
  const mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  for (const name of ['课件.ppt', '课件.pptm']) {
    assert.equal((await request(`${base}/presign`, { method: 'POST', cookie, body: { name, size: 100, type: mime } })).res.statusCode, 415);
    assert.equal((await request(`${base}/complete`, { method: 'POST', cookie, body: { name, size: 100, type: mime, attachmentId: 'att-test', objectKey: `attachments/record/${created.payload.record.id}/att-test-${name}` } })).res.statusCode, 415);
  }
  const signed = await request(`${base}/presign`, { method: 'POST', cookie, body: { name: '课件.pptx', size: 1024, type: mime } });
  assert.equal(signed.res.statusCode, 200);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, headers: new Headers({ 'content-length': '1024' }) }));
  const completed = await request(`${base}/complete`, { method: 'POST', cookie, body: { name: '课件.pptx', size: 1024, type: mime, attachmentId: signed.payload.attachmentId, objectKey: signed.payload.objectKey } });
  assert.equal(completed.res.statusCode, 201, JSON.stringify(completed.payload));
  assert.equal((await request(`${base}/presign`, { method: 'POST', cookie, body: { name: '课件.pptx', size: 10 * 1024 ** 2 + 1, type: mime } })).res.statusCode, 413);
  const bytes = pptxFixture(), boundary = 'pptx-test-boundary';
  const data = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="课件.pptx"\r\nContent-Type: ${mime}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const req = Readable.from([data]); req.method = 'POST'; req.url = base;
  req.headers = { host: '127.0.0.1:8788', origin: 'http://127.0.0.1:8788', cookie, 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(data.length) };
  const res = new MockResponse(); await measuredRoute(req, res);
  assert.equal(res.statusCode, 201, res.body.toString());
  const attachment = JSON.parse(res.body).attachments[0];
  assert.equal(attachment.name, '课件.pptx');
  const row = db.prepare('select * from attachments where id=?').get(attachment.id);
  assert.deepEqual(await fs.readFile(path.join(process.env.UPLOAD_DIR, row.path)), bytes);
  assert.match(attachmentDisposition(row, true), /^attachment;/);
});

test('integration retains hostile-MIME and contradictory-extension upload protection',async()=>{
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
  const created=await request('/api/records',{method:'POST',cookie,body:{date:'2026-10-28',title:'隔离附件安全测试',original:'test',category:'其他',allInScope:true}});
  assert.equal(created.res.statusCode,201);
  const upload=async(name,type,bytes)=>{
    const boundary='integration-attachment-security',data=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const req=Readable.from([data]);req.method='POST';req.url=`/api/records/${created.payload.record.id}/attachments`;req.headers={host:'127.0.0.1:8788',origin:'http://127.0.0.1:8788',cookie,'content-type':`multipart/form-data; boundary=${boundary}`,'content-length':String(data.length)};
    const res=new MockResponse();await measuredRoute(req,res);return {status:res.statusCode,payload:JSON.parse(res.body)};
  };
  assert.equal((await upload('fake.png','image/png',Buffer.from('<html>not a PNG</html>'))).status,415);
  const text=await upload('note.txt','text/html',Buffer.from('<script>test-only</script>'));assert.equal(text.status,201);
  const row=db.prepare('select * from attachments where id=?').get(text.payload.attachments[0].id);assert.match(row.type,/^text\/plain/);
});

test('integration rejects legacy direct confirmation of unfinalized hours atomically',async()=>{
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
  const user=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'integration-state-guard',name:'确认保护测试'}),stamp=new Date().toISOString();
  const insert=db.prepare("insert into maintenance_hour_results(id,owner_type,owner_id,assignment_id,person_id,user_name,hours,status,created_at,updated_at) values(?,'flight','integration-owner',?,?,?,1,?,?,?)");
  insert.run('integration-pending','integration-assignment-1',user.personId,user.name,'待复核',stamp,stamp);
  insert.run('integration-unfinalized','integration-assignment-2',user.personId,user.name,'已提报',stamp,stamp);
  assert.equal((await request('/api/maintenance/hours/integration-unfinalized/confirm',{method:'POST',cookie,body:{}})).res.statusCode,409);
  assert.equal((await request('/api/maintenance/hours/confirm-batch',{method:'POST',cookie,body:{ids:['integration-pending','integration-unfinalized']}})).res.statusCode,409);
  assert.equal(db.prepare("select status from maintenance_hour_results where id='integration-pending'").get().status,'待复核');
  assert.equal(db.prepare("select status from maintenance_hour_results where id='integration-unfinalized'").get().status,'已提报');
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
    assert.equal(dispatchDirectory.payload.items.find(person => person.personId === cadre.personId).personnelGroupCode, "GROUP-LINE-CADRE");
    const adminCookie = String(adminLogin.res.headers["Set-Cookie"] || adminLogin.res.headers["set-cookie"] || "").split(";")[0];
    const infoDirectory = await request("/api/personnel/directory?purpose=info&pageSize=200", { cookie: adminCookie });
    assert.equal(infoDirectory.res.statusCode, 200);
    assert.equal(infoDirectory.payload.items.find(person => person.personId === cadre.personId).personnelGroupCode, "GROUP-LINE-CADRE");
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
    db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=? and module='maintenance'").run(dispatcher.id);
    const selfStats = await request("/api/maintenance/stats/personal?month=2026-10", { cookie:dispatchLogin.cookie });
    assert.equal(selfStats.res.statusCode,200);
    assert.equal(selfStats.payload.teamComparison.available,false);
    assert.equal(selfStats.payload.teamComparison.reason,'incomplete_scope');
    assert.equal(selfStats.payload.teamComparison.memberCount,undefined);
    assert.equal(selfStats.payload.teamComparison.contributionPercent,undefined);
    assert.equal(selfStats.payload.teamRanking.available,false);
    assert.equal(selfStats.payload.teamRanking.reason,'incomplete_scope');
    for (const key of ['rank','teamCount','totalHours','gapHours']) assert.equal(selfStats.payload.teamRanking[key],undefined);
    const restrictedDirectory = await request("/api/personnel/directory?purpose=maintenance_dispatch&pageSize=200", { cookie:dispatchLogin.cookie });
    assert.equal(restrictedDirectory.res.statusCode, 200);
    assert.ok(!restrictedDirectory.payload.items.some(person => person.personId === cadre.personId));

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

test("departure-only preflights support editing, repeat imports and additional work without merging distinct departures", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const base = { date: "2026-10-06", flightNo: "", departureFlightNo: "MU-PRE-1", aircraftNo: "B-PRE-TEST", workKind: "航前" };
  const created = await request("/api/maintenance/flights", { method: "POST", cookie, body: base });
  assert.equal(created.res.statusCode, 201, JSON.stringify(created.payload));
  const id = created.payload.flight.id;
  assert.equal(created.payload.flight.flightNo, "");
  assert.equal(created.payload.flight.departureFlightNo, base.departureFlightNo);
  const updated = await request(`/api/maintenance/flights/${id}`, { method: "PUT", cookie, body: { ...base, stand: "123" } });
  assert.equal(updated.res.statusCode, 200, JSON.stringify(updated.payload));
  const invalid = await request(`/api/maintenance/flights/${id}`, { method: "PUT", cookie, body: { ...base, departureFlightNo: "" } });
  assert.equal(invalid.res.statusCode, 400);
  assert.equal(db.prepare("select departure_flight_no from maintenance_flights where id=?").get(id).departure_flight_no, base.departureFlightNo);
  const rows = [base, { ...base, departureFlightNo: "MU-PRE-2" }];
  const imported = await request("/api/maintenance/flights/import", { method: "POST", cookie, body: { rows } });
  assert.equal(imported.res.statusCode, 200, JSON.stringify(imported.payload));
  assert.equal(imported.payload.created, 1);
  const repeated = await request("/api/maintenance/flights/import", { method: "POST", cookie, body: { rows } });
  assert.equal(repeated.payload.created, 0);
  assert.equal(Number(db.prepare("select count(*) as n from maintenance_flights where aircraft_no=?").get(base.aircraftNo).n), 2);
  const extra = await request("/api/maintenance/subtasks/import", { method: "POST", cookie, body: { rows: [
    { ...base, chapter: "05", title: "航前检查", category: "单项工作", standardHours: 1 }
  ] } });
  assert.equal(extra.res.statusCode, 200, JSON.stringify(extra.payload));
  assert.equal(db.prepare("select flight_id from maintenance_subtasks where flight_id=? and card_no='05' and title='航前检查'").get(id).flight_id, id);
  const missing = await request("/api/maintenance/flights/import", { method: "POST", cookie, body: { rows: [
    { ...base, departureFlightNo: "MU-PRE-NOT-WRITTEN" }, { ...base, departureFlightNo: "" }
  ] } });
  assert.equal(missing.res.statusCode, 400);
  assert.equal(Number(db.prepare("select count(*) as n from maintenance_flights where departure_flight_no='MU-PRE-NOT-WRITTEN'").get().n), 0);
  const ground = await request("/api/maintenance/flights", { method: "POST", cookie, body: { ...base, workKind: "停场", departureFlightNo: "" } });
  assert.equal(ground.res.statusCode, 201, JSON.stringify(ground.payload));
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
    assert.equal(failed.payload.errors[0].rowNumber,2);
    assert.match(failed.payload.errors[0].detail,/日期/);
    assert.equal(count(), before);
  }
  const imported = await request("/api/maintenance/flights/import", { method: "POST", cookie, body: { rows: [valid] } });
  assert.equal(imported.res.statusCode, 200);
  assert.equal(imported.payload.created, 1);
  const list = await request("/api/maintenance/flights?scope=dispatch&view=summary&dateFrom=2026-09-01&dateTo=2026-09-01", { cookie });
  assert.ok(list.payload.flights.some(flight => flight.aircraftNo === "BIMPORT" && flight.date === "2026-09-01"));
});

test('flight plan preview counts unique opportunities, lists original error rows and protects existing work',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}});
 const cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
 const base={date:'2026-10-11',flightNo:'MU-SUMMARY',aircraftNo:'B-SUMMARY',aircraftType:'A320',workKind:'航后'};
 const created=await request('/api/maintenance/flights',{method:'POST',cookie,body:base});const id=created.payload.flight.id;
 const worker=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'summary-worker',name:'汇总测试人'});
 const dispatch=await request(`/api/maintenance/flights/${id}/dispatch`,{method:'POST',cookie,body:{expectedUpdatedAt:created.payload.flight.updatedAt,assignments:[{personId:worker.personId,role:'放行'}]}});assert.equal(dispatch.res.statusCode,200);
 const assignmentsBefore=db.prepare('select * from maintenance_assignments where flight_id=?').all(id);
 const rows=[{...base,rowNumber:3,departureFlightNo:'MU-FILL'},{...base,rowNumber:5,departureFlightNo:'MU-FILL'},{...base,rowNumber:8,flightNo:'MU-NEW-SUM',aircraftNo:'B-NEW-SUM'}];
 const call=body=>request('/api/maintenance/flights/import',{method:'POST',cookie,body});
 const preview=await call({validateOnly:true,rows});assert.equal(preview.payload.valid,true);
 assert.deepEqual(preview.payload.summary,{dataRows:3,total:2,matched:1,updated:1,created:1,abnormal:0});
 assert.equal(preview.payload.flights,undefined);assert.equal(preview.payload.rows,undefined);
 assert.equal(db.prepare('select departure_flight_no from maintenance_flights where id=?').get(id).departure_flight_no,'');
 const errors=await call({validateOnly:true,rows:[{...base,rowNumber:14,date:'bad'},{...base,rowNumber:20,locationName:'不存在地点'}]});
 assert.equal(errors.payload.valid,false);assert.deepEqual(errors.payload.errors.map(e=>e.rowNumber),[14,20]);assert.equal(errors.payload.summary.abnormal,2);
 const rejected=await call({rows:[rows[2],{...base,rowNumber:20,date:'bad'}]});assert.equal(rejected.res.statusCode,400);
 assert.equal(Number(db.prepare("select count(*) as n from maintenance_flights where flight_no='MU-NEW-SUM'").get().n),0);
 const done=await call({rows});assert.equal(done.res.statusCode,200);assert.equal(done.payload.created,1);assert.equal(done.payload.summary.updated,1);
 assert.deepEqual(db.prepare('select * from maintenance_assignments where flight_id=?').all(id),assignmentsBefore);
 assert.equal(db.prepare('select status from maintenance_flights where id=?').get(id).status,'已派工');
 const second=await call({validateOnly:true,rows:[{...base,departureFlightNo:'DO-NOT-OVERWRITE'}]});assert.equal(second.payload.summary.updated,0);
 const existing=await call({rows:[{...base,departureFlightNo:'DO-NOT-OVERWRITE'}]});assert.equal(existing.payload.created,0);
 assert.equal(db.prepare('select departure_flight_no from maintenance_flights where id=?').get(id).departure_flight_no,'MU-FILL');
});

test("additional work import requires chapters, skips duplicate projects and rolls back the whole file on errors", async () => {
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
  const stored = db.prepare("select * from maintenance_subtasks where flight_id=? order by card_no").all(flightId);
  assert.ok(stored.every(row => row.external_work_no === ''));
  assert.deepEqual(stored.map(row => row.card_no), ['09','25','26','27']);
  assert.ok(stored.every(row => row.status === "未派工"));
  assert.equal(stored[3].content, "说明");
  const flightAfter = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  assert.ok(flightAfter.updated_at > flightBefore.updated_at, "新增工作必须使已打开报工页面的版本失效");
  assert.deepEqual({ ...flightAfter, updated_at: flightBefore.updated_at }, { ...flightBefore });

  const duplicate = await request("/api/maintenance/subtasks/import", { method: "POST", cookie, body: { rows: [rows[0]] } });
  assert.equal(duplicate.res.statusCode, 200);
  assert.equal(duplicate.payload.created,0);assert.equal(duplicate.payload.skipped,1);
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_subtasks where flight_id=?").get(flightId).total), 4);
  const sameFile = await request('/api/maintenance/subtasks/import',{method:'POST',cookie,body:{rows:[rows[0],rows[0]]}});
  assert.equal(sameFile.res.statusCode,200);
  assert.equal(sameFile.payload.created,0);assert.equal(sameFile.payload.skipped,2);
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_subtasks where flight_id=?").get(flightId).total), 4);
  const missingChapter=await request('/api/maintenance/subtasks/import',{method:'POST',cookie,body:{validateOnly:true,rows:[{...rows[0],chapter:' '}]}});
  assert.equal(missingChapter.res.statusCode,200);assert.equal(missingChapter.payload.valid,false);assert.match(missingChapter.payload.errors[0].detail,/章节/);
  const checked=await request('/api/maintenance/subtasks/import',{method:'POST',cookie,body:{validateOnly:true,rows:[rows[0]]}});
  assert.equal(checked.res.statusCode,200);
  assert.deepEqual(checked.payload.summary,{total:1,matched:1,created:0,skipped:1,abnormal:0});
  const fresh={...rows[0],chapter:'28',title:'新项目',rowNumber:9};
  const freshPreview=await request('/api/maintenance/subtasks/import',{method:'POST',cookie,body:{validateOnly:true,rows:[fresh,fresh]}});
  assert.deepEqual(freshPreview.payload.summary,{total:2,matched:2,created:1,skipped:1,abnormal:0});
  assert.equal(Number(db.prepare('select count(*) as n from maintenance_subtasks where flight_id=?').get(flightId).n),4);
  const freshCommit=await request('/api/maintenance/subtasks/import',{method:'POST',cookie,body:{rows:[fresh,fresh]}});
  assert.equal(freshCommit.payload.created,1);assert.equal(freshCommit.payload.skipped,1);
  const mismatch=await request('/api/maintenance/subtasks/import',{method:'POST',cookie,body:{rows:[{...fresh,standardHours:2}]}});
  assert.equal(mismatch.res.statusCode,400);assert.equal(mismatch.payload.errors[0].rowNumber,9);assert.match(mismatch.payload.errors[0].detail,/工时不一致/);
  const fileMismatch=await request('/api/maintenance/subtasks/import',{method:'POST',cookie,body:{rows:[{...fresh,title:'同批冲突'},{...fresh,title:'同批冲突',standardHours:2}]}});
  assert.equal(fileMismatch.res.statusCode,400);assert.equal(Number(db.prepare('select count(*) as n from maintenance_subtasks where flight_id=?').get(flightId).n),5);
  const rowErrors=await request('/api/maintenance/subtasks/import',{method:'POST',cookie,body:{validateOnly:true,rows:[{...fresh,date:'bad',rowNumber:7},{...fresh,chapter:'',rowNumber:12}]}});
  assert.deepEqual(rowErrors.payload.errors.map(r=>r.rowNumber),[7,12]);assert.equal(rowErrors.payload.valid,false);
  const secondFlight=await request('/api/maintenance/flights',{method:'POST',cookie,body:{...flightPayload,aircraftNo:'B-ADD2'}});
  const independent=await request('/api/maintenance/subtasks/import',{method:'POST',cookie,body:{rows:[{...rows[0],aircraftNo:'B-ADD2'}]}});
  assert.equal(independent.payload.created,1);assert.equal(Number(db.prepare('select count(*) as n from maintenance_subtasks where flight_id=?').get(secondFlight.payload.flight.id).n),1);

  const atomic = await request("/api/maintenance/subtasks/import", {
    method: "POST", cookie, body: { rows: [
      { ...base, chapter: "25", title: "应回滚", category: "其他", standardHours: 0.5 },
      { ...base, chapter: "25", title: "非法工时", category: "其他", standardHours: 0.55 }
    ] }
  });
  assert.equal(atomic.res.statusCode, 400);
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_subtasks where flight_id=?").get(flightId).total), 5);

  db.prepare("update maintenance_flights set status='待复核' where id=?").run(flightId);
  const protectedImport = await request("/api/maintenance/subtasks/import", {
    method: "POST", cookie, body: { rows: [{ ...base, chapter: "25", title: "状态保护", category: "其他", standardHours: 0.5 }] }
  });
  assert.equal(protectedImport.res.statusCode, 409);
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_subtasks where flight_id=?").get(flightId).total), 5);
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
  const putReview = async fields => {
    const opened = (await request(endpoint, { cookie })).payload.review;
    assert.ok(opened.flight.updatedAt);
    return request(endpoint, { method: "PUT", cookie, body: { mode: "save", tasks: reviewTasks, expectedUpdatedAt: opened.flight.updatedAt, ...fields } });
  };
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
    body: { mode: "confirm", tasks: reviewTasks, expectedUpdatedAt: (await request(endpoint, { cookie })).payload.review.flight.updatedAt }
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
  const saved = await request(url, { method: "PUT", cookie, body: { mode: "save", tasks, routineElectronicSigned: false, nonroutineElectronicSigned: false, expectedUpdatedAt: tree.flight.updatedAt } });
  assert.equal(saved.res.statusCode,200,JSON.stringify(saved.payload));
  const confirmed = await request(url, { method: "PUT", cookie, body: { mode: "confirm", tasks, expectedUpdatedAt: saved.payload.review.flight.updatedAt } });
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
    assert.ok(tree.flight.updatedAt);
    return request(`/api/maintenance/flights/${id}/review`, { method: "PUT", cookie, body: { mode: "save", tasks, expectedUpdatedAt: tree.flight.updatedAt, ...fields } });
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
  try {
    for (const [kind,incoming,outgoing,expected] of [
      ['航前','','QA-DEPART','QA-DEPART'],
      ['航后','QA-ARRIVE','','QA-ARRIVE'],
      ['短停','QA-IN','QA-OUT','QA-IN']
    ]) {
      db.prepare('update maintenance_flights set work_kind=?,flight_no=?,departure_flight_no=? where id=?').run(kind,incoming,outgoing,routineFlight);
      const detail=await request(`${base}&view=personDetails&personId=${encodeURIComponent(user.personId)}`,{cookie});
      assert.equal(detail.res.statusCode,200);
      const actualHours=detail.payload.hours.filter(row=>row.flightId===routineFlight);
      const actualSorties=detail.payload.sorties.filter(row=>row.flightId===routineFlight);
      assert.equal(actualHours.length,2);assert.equal(actualSorties.length,1);
      assert.ok(actualHours.every(row=>row.flightNo===expected),JSON.stringify(actualHours));
      assert.equal(actualSorties[0].flightNo,expected);
      assert.equal(Number(actualHours.reduce((sum,row)=>sum+row.finalHours,0).toFixed(2)),1.7);
    }
  } finally {
    db.prepare("update maintenance_flights set work_kind='短停',flight_no='MUREPORT1',departure_flight_no='' where id=?").run(routineFlight);
  }
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
      assert.deepEqual(expanded.value.returnTargets,baseline.value.returnTargets);
      const expandedStates=new Map(expanded.value.states.map(s=>[s.personId,s]));
      for(const scopes of [
        [{module:"personnel",scopeType:"self"}],
        [{module:"personnel",scopeType:"department"}],
        [{module:"personnel",scopeType:"administrative_team"}],
        [{module:"personnel",scopeType:"specified_groups",scopeId:template.personnel_group_id}],
        [{module:"personnel",scopeType:"self"},{module:"personnel",scopeType:"all",validTo:"2000-01-01T00:00:00Z"}]
      ]) {
        const actor={id:"query-test-account",personId:template.id,dataScopes:scopes};
        const expected=expanded.value.people.filter(p=>access.allows(actor,"personnel",p.id)).map(p=>p.id);
        const scopedRead=measured(actor),scoped=scopedRead.value;
        assert.ok(scopedRead.count<=21,`scoped snapshot used ${scopedRead.count} queries`);
        assert.deepEqual(scoped.people.map(p=>p.id),expected);
        assert.ok(scoped.states.every(s=>expected.includes(s.personId)));
        assert.ok(scoped.records.every(r=>expected.includes(r.person_id)));
        const expectedTargets=expanded.value.returnTargets.filter(target=>{
          const group=['一组','二组','三组','四组'].includes(target)?target:null;
          const members=expanded.value.people.filter(p=>p.administrativeGroup===group||expandedStates.get(p.id)?.workingGroup===group);
          return members.every(p=>expected.includes(p.id))&&(members.length>0||!scoped.partial);
        });
        assert.deepEqual(scoped.returnTargets,expectedTargets,'target visibility must still require every target member in scope');
      }
      const noAllocation=createCapabilityService({db,hasRbac:(actor,permission)=>permission!=='capability.allocation.submit',personnelAccess:access,audit:()=>{}});
      assert.deepEqual(noAllocation.snapshot(admin,workspace).returnTargets,[]);
      assert.throws(()=>service.snapshot({id:"query-denied",dataScopes:[]},workspace),e=>e.status===403);
      console.log(`快照查询预算：${baseline.count} → ${expanded.count}（增加120人），权限范围一致`);
    } finally {db.exec("rollback");}
  } finally {if(previousEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousEnv;}
});

test('routine report and review persist exactly the postflight budget without rounding inflation', async () => {
  const login = await request('/api/login', { method: 'POST', body: { username: '54002010', password: 'muc2026' } });
  const cookie = String(login.res.headers['Set-Cookie']).split(';')[0];
  const person = maintenancePerson(login.payload.user);
  const created = await request('/api/maintenance/flights', { method: 'POST', cookie, body: {
    date: '2026-10-15', flightNo: 'ROUND500', aircraftNo: 'B-ROUND500', aircraftType: 'A319', workKind: '航后'
  } });
  assert.equal(created.res.statusCode, 201, JSON.stringify(created.payload));
  const id = created.payload.flight.id;
  const roles = ['接机', '勤务', '例行机内', '例行L/G', '例行发动机', '例行机外', '例行电子'];
  const ratios = Object.fromEntries(roles.map((role, i) => [role, [0.08, 0.24, 0.34, 0.085, 0.085, 0.085, 0.085][i]]));
  db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?')
    .run(JSON.stringify({ baseHours: 5, ratios, aircraftCode: 'A319', opportunity: '航后', version: 5 }), id);
  const entries = roles.map(role => ({ role, personId: person.personId }));
  const dispatch = await request(`/api/maintenance/flights/${id}/dispatch`, { method: 'POST', cookie, body: {
    expectedUpdatedAt: created.payload.flight.updatedAt, assignments: [{ role: '放行', personId: person.personId }, ...entries]
  } });
  assert.equal(dispatch.res.statusCode, 200, JSON.stringify(dispatch.payload));
  const submit = async (type, fields = {}) => request(`/api/maintenance/flights/${id}/reports/${type}`, {
    method: 'PUT', cookie, body: { expectedUpdatedAt: await reportVersion(id, cookie), ...fields }
  });
  assert.equal((await submit('release')).res.statusCode, 200);
  const routine = await submit('routine', { entries });
  assert.equal(routine.res.statusCode, 200, JSON.stringify(routine.payload));
  const saved = () => db.prepare('select role,hours,status from maintenance_hour_results where flight_id=? order by role').all(id);
  const sumCents = () => saved().reduce((sum, row) => sum + Math.round(row.hours * 100), 0);
  assert.equal(sumCents(), 500);
  const confirmation = await request(`/api/maintenance/flights/${id}/report-confirmation`, { method: 'POST', cookie, body: { routineEntries: entries } });
  assert.equal(confirmation.res.statusCode, 200, JSON.stringify(confirmation.payload));
  const view = (await request(`/api/maintenance/flights/${id}/review`, { cookie })).payload.review;
  const tasks = view.tasks.map(task => ({ ownerType: task.ownerType, ownerId: task.ownerId,
    assignments: task.assignments.map(item => ({ role: item.role, personId: item.personId })) }));
  const confirmed = await request(`/api/maintenance/flights/${id}/review`, { method: 'PUT', cookie, body: {
    mode: 'confirm', tasks, routineElectronicSigned: true, expectedUpdatedAt: view.flight.updatedAt
  } });
  assert.equal(confirmed.res.statusCode, 200, JSON.stringify(confirmed.payload));
  assert.equal(confirmed.payload.review.flight.status, '已确认');
  assert.equal(sumCents(), 500);
  assert.ok(saved().every(row => row.status === '已确认'));
});

test('aircraft matrix saves atomically, freezes reported hours and blocks unmatched models', async () => {
  const login = await request('/api/login', { method: 'POST', body: { username: '54002010', password: 'muc2026' } });
  const cookie = String(login.res.headers['Set-Cookie']).split(';')[0];
  const user = maintenancePerson(login.payload.user);
  const original = db.prepare("select value from settings where key='maintenance_aircraft_hours_v1'").get().value;
  const initial = (await request('/api/maintenance/rules', { cookie })).payload;
  assert.ok(initial.rules.every(rule => rule.rule_type !== 'workType'));
  try {
    const create = async aircraftType => (await request('/api/maintenance/flights', { method: 'POST', cookie, body: { date: '2026-10-06', flightNo: `MU-${aircraftType || 'EMPTY'}`, aircraftNo: 'B-AIRHOUR', aircraftType, workKind: '短停' } })).payload.flight;
    const flight = await create('320');
    const config = { ...initial.aircraftHours, groups: [...initial.aircraftHours.groups, { id: 'multi-model', name: '同工时组', codes: '32n 320 32N 325', enabled: true, hours: { 短停: 4, 航前: 2 } }] };
    const save = (aircraftHours, fields = {}) => request('/api/maintenance/rules', { method: 'PUT', cookie, body: { rules: initial.rules, aircraftHours, reason: '机型规则验收', ...fields } });
    const legacyBefore = db.prepare("select * from maintenance_hour_rules where rule_type='workType' and name='短停'").get();
    for (const key of ['rule_type', 'ruleType']) {
      const rejected = await save(config, { rules: [...initial.rules, { [key]: 'workType', name: '短停', value: 999 }] });
      assert.equal(rejected.res.statusCode, 400);
      assert.match(rejected.payload.error, /旧标准工时已停止维护/);
      assert.deepEqual(db.prepare("select * from maintenance_hour_rules where rule_type='workType' and name='短停'").get(), legacyBefore);
      assert.equal(db.prepare("select value from settings where key='maintenance_aircraft_hours_v1'").get().value, original);
    }
    assert.equal((await save(config)).res.statusCode, 409);
    assert.equal(db.prepare("select value from settings where key='maintenance_aircraft_hours_v1'").get().value, original);
    const preview = await request('/api/maintenance/rules/aircraft-preview', { method: 'POST', cookie, body: { aircraftHours: config } });
    assert.ok(preview.payload.affected.some(item => item.id === flight.id));
    const saved = await save(config, { confirmation: preview.payload.confirmation });
    assert.equal(saved.res.statusCode, 200, JSON.stringify(saved.payload));
    assert.deepEqual(saved.payload.aircraftHours.groups.at(-1).codes, ['32N', '320', '325']);
    const duplicated = { ...saved.payload.aircraftHours, groups: [...saved.payload.aircraftHours.groups, { id: 'duplicate', name: '重复组', codes: '320', hours: {} }] };
    assert.equal((await save(duplicated)).res.statusCode, 400);
    const savedJson = db.prepare("select value from settings where key='maintenance_aircraft_hours_v1'").get().value;
    const dispatch = async id => {
      const current = (await request(`/api/maintenance/flights/${id}`, { cookie })).payload.flight;
      const result = await request(`/api/maintenance/flights/${id}/dispatch`, { method: 'POST', cookie, body: { expectedUpdatedAt: current.updatedAt, assignments: [{ personId: user.personId, role: '接机' }, { personId: user.personId, role: '放行' }] } });
      assert.equal(result.res.statusCode, 200, JSON.stringify(result.payload));
    };
    const report = async id => request(`/api/maintenance/flights/${id}/reports/routine`, { method: 'PUT', cookie, body: { entries: [{ personId: user.personId, role: '接机' }], expectedUpdatedAt: await reportVersion(id, cookie) } });
    await dispatch(flight.id);
    assert.equal((await report(flight.id)).res.statusCode, 200);
    const snapshot = JSON.parse(db.prepare('select routine_hours_snapshot from maintenance_flights where id=?').get(flight.id).routine_hours_snapshot);
    assert.equal(snapshot.baseHours, 4);
    assert.equal(snapshot.aircraftCode, '320');
    const resultBefore = db.prepare("select hours from maintenance_hour_results where owner_type='flight' and owner_id=?").all(flight.id);
    const changed = structuredClone(saved.payload.aircraftHours);
    changed.groups.at(-1).hours.短停 = 8;
    const repreview = (await request('/api/maintenance/rules/aircraft-preview', { method: 'POST', cookie, body: { aircraftHours: changed } })).payload;
    assert.ok(!repreview.affected.some(item => item.id === flight.id));
    assert.equal((await save(changed, { confirmation: repreview.confirmation })).res.statusCode, 200);
    assert.deepEqual(db.prepare("select hours from maintenance_hour_results where owner_type='flight' and owner_id=?").all(flight.id), resultBefore);
    assert.equal((await save(config)).res.statusCode, 409);
    assert.notEqual(savedJson, original);
    for (const model of ['UNKNOWN', '']) {
      const missing = await create(model);
      assert.equal(missing.aircraftType, model);
      await dispatch(missing.id);
      const blocked = await report(missing.id);
      assert.equal(blocked.res.statusCode, 400);
      assert.match(blocked.payload.error, /未配置/);
      assert.equal(db.prepare('select routine_hours_snapshot from maintenance_flights where id=?').get(missing.id).routine_hours_snapshot, null);
      assert.equal(Number(db.prepare('select count(*) as total from maintenance_hour_results where flight_id=?').get(missing.id).total), 0);
    }
  } finally {
    db.prepare("update settings set value=? where key='maintenance_aircraft_hours_v1'").run(original);
  }
});

test("work locations default to Qingdao, separate import identities and reject invalid sites atomically", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"] || "").split(";")[0];
  const locations = await request("/api/maintenance/locations", { cookie });
  assert.equal(locations.res.statusCode, 200);
  const qingdao = locations.payload.locations.find(item => item.name === "青岛");
  const yanji = locations.payload.locations.find(item => item.name === "延吉");
  assert.ok(qingdao && yanji);
  const base = { date: "2099-11-16", flightNo: "MU-LOC-TEST", aircraftNo: "B-LOC-TEST", workKind: "航后" };
  const invalid = await request("/api/maintenance/flights/import", { method: "POST", cookie, body: { rows: [base, { ...base, locationName: "拼错地点" }] } });
  assert.equal(invalid.res.statusCode, 400);
  assert.equal(Number(db.prepare("select count(*) as n from maintenance_flights where flight_no=?").get(base.flightNo).n), 0);
  const invalidChoice = await request("/api/maintenance/flights", { method: "POST", cookie, body: { ...base, locationId: "", locationName: "拼错地点" } });
  assert.equal(invalidChoice.res.statusCode, 400);
  assert.equal(Number(db.prepare("select count(*) as n from maintenance_flights where flight_no=?").get(base.flightNo).n), 0);
  const imported = await request("/api/maintenance/flights/import", { method: "POST", cookie, body: { rows: [base, { ...base, locationName: "延吉" }] } });
  assert.equal(imported.res.statusCode, 200);
  assert.equal(imported.payload.created, 2);
  const rows = db.prepare("select location_id from maintenance_flights where flight_no=?").all(base.flightNo);
  assert.deepEqual(new Set(rows.map(row => row.location_id)), new Set([qingdao.id, yanji.id]));
  const additional={...base,chapter:'27',title:'地点独立附加',category:'其他',standardHours:1};
  const both=await request('/api/maintenance/subtasks/import',{method:'POST',cookie,body:{rows:[additional,{...additional,locationName:'延吉'}]}});
  assert.equal(both.res.statusCode,200,JSON.stringify(both.payload));assert.equal(both.payload.created,2);assert.equal(both.payload.matchedFlights,2);
  const repeat=await request('/api/maintenance/subtasks/import',{method:'POST',cookie,body:{rows:[{...additional,locationName:'延吉'}]}});
  assert.equal(repeat.payload.created,0);assert.equal(repeat.payload.skipped,1);
  const atLocations=db.prepare('select f.location_id,count(s.id) as n from maintenance_flights f join maintenance_subtasks s on s.flight_id=f.id where f.flight_no=? group by f.location_id').all(base.flightNo);
  assert.equal(atLocations.length,2);assert.ok(atLocations.every(row=>Number(row.n)===1));
  const filtered = await request(`/api/maintenance/flights?scope=dispatch&dateFrom=${base.date}&dateTo=${base.date}&locationId=${encodeURIComponent(yanji.id)}&view=summary`, { cookie });
  assert.equal(filtered.payload.flights.length, 1);
  assert.equal(filtered.payload.flights[0].locationName, "延吉");
  const newLocation = await request("/api/maintenance/locations", { method: "POST", cookie, body: { name: "地点目录测试" } });
  assert.equal(newLocation.res.statusCode, 201);
  const custom = newLocation.payload.locations.find(item => item.name === "地点目录测试");
  const changed = await request(`/api/maintenance/locations/${custom.id}`, { method: "PUT", cookie, body: { name: "地点目录测试改名", reason: "验证目录变更" } });
  assert.equal(changed.res.statusCode, 200);
  assert.equal(changed.payload.locations.find(item => item.id === custom.id).name, "地点目录测试改名");
  const using = await request("/api/maintenance/flights", { method: "POST", cookie, body: { ...base, flightNo: "MU-LOC-CUSTOM", locationId: custom.id } });
  assert.equal(using.res.statusCode, 201);
  const protectedDelete = await request(`/api/maintenance/locations/${custom.id}`, { method: "DELETE", cookie });
  assert.equal(protectedDelete.res.statusCode, 409);
  db.prepare("update maintenance_flights set location_id=null,location_name_snapshot=null where id=?").run(using.payload.flight.id);
  const missingReason = await request(`/api/maintenance/flights/${using.payload.flight.id}/location`, { method: "PUT", cookie, body: { locationId: qingdao.id } });
  assert.equal(missingReason.res.statusCode, 400);
  const corrected = await request(`/api/maintenance/flights/${using.payload.flight.id}/location`, { method: "PUT", cookie, body: { locationId: qingdao.id, reason: "补录历史作业地点" } });
  assert.equal(corrected.res.statusCode, 200);
  assert.equal(corrected.payload.flight.locationName, "青岛");
  assert.equal(db.prepare("select location_id from maintenance_flights where id=?").get(using.payload.flight.id).location_id, qingdao.id);
});

test("pure routine auto confirmation shares finalization, exclusions, rollback and concurrency", async () => {
  // Execute the actual frontend request builder against the real route, without adding fields.
  const frontend = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const serviceStart = frontend.indexOf("  async saveReview(flightId,");
  const serviceEnd = frontend.indexOf("  async getReports(", serviceStart);
  assert.ok(serviceStart >= 0 && serviceEnd > serviceStart);
  const browserReview = async (review, cookie, mode, tasks) => {
    const context = vm.createContext({ state: { maintenanceReviewDraft: { review } }, apiRequest: (url, options) => request(`/api${url}`, { method: options.method, body: options.body, cookie }) });
    vm.runInContext(`service = {${frontend.slice(serviceStart, serviceEnd)}}`, context);
    return context.service.saveReview(review.flight.id, mode, tasks, "", [], { routineElectronicSigned: true });
  };
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"]).split(";")[0];
  const person = maintenancePerson(login.payload.user);
  let sequence = 0;
  const create = async (kind = "短停") => {
    const result = await request("/api/maintenance/flights", { method: "POST", cookie, body: { date: "2026-10-11", flightNo: `MUAUTO${++sequence}`, departureFlightNo: "MUAUTOOUT", aircraftNo: "BAUTO", aircraftType: "A320", workKind: kind } });
    assert.equal(result.res.statusCode, 201, JSON.stringify(result.payload));
    const id = result.payload.flight.id;
    const assigned = await request(`/api/maintenance/flights/${id}/dispatch`, { method: "POST", cookie, body: { expectedUpdatedAt: result.payload.flight.updatedAt, assignments: [{ role: "放行", personId: person.personId }, { role: "接机", personId: person.personId }] } });
    assert.equal(assigned.res.statusCode, 200, JSON.stringify(assigned.payload));
    return id;
  };
  const submit = async (id, type, extra = {}) => request(`/api/maintenance/flights/${id}/reports/${type}`, { method: "PUT", cookie, body: { ...(type === "routine" ? { entries: [{ role: "接机", personId: person.personId }] } : {}), expectedUpdatedAt: await reportVersion(id, cookie), ...extra } });
  for (const first of ["release", "routine"]) {
    const id = await create();
    const initial = await submit(id, first);
    assert.equal(initial.res.statusCode, 200, JSON.stringify(initial.payload));
    assert.equal(initial.payload.flight.status, "已提报");
    const stale = initial.payload.flight.updatedAt;
    const final = await submit(id, first === "release" ? "routine" : "release");
    assert.equal(final.res.statusCode, 200, JSON.stringify(final.payload));
    assert.equal(final.payload.flight.status, "待复核");
    assert.equal(final.payload.flight.reportFinalizationMode, "automatic");
    assert.equal(final.payload.flight.reportFinalizedBy, "");
    assert.equal(final.payload.flight.archivedAt, "");
    assert.equal(Number(db.prepare("select count(*) as n from maintenance_logs where flight_id=? and action='report_auto_finalize'").get(id).n), 1);
    assert.ok(db.prepare("select status from maintenance_report_batches where flight_id=?").all(id).every(row => row.status === "待复核"));
    assert.ok(db.prepare("select status from maintenance_hour_results where flight_id=?").all(id).every(row => row.status === "待复核"));
    assert.equal((await submit(id, "routine", { expectedUpdatedAt: stale })).res.statusCode, 409);
    const view = await request(`/api/maintenance/flights/${id}/review`, { cookie });
    const tasks = view.payload.review.tasks.map(task => ({ ownerType: task.ownerType, ownerId: task.ownerId, assignments: task.assignments.map(item => ({ role: item.role, personId: item.personId })) }));
    assert.ok(view.payload.review.flight.updatedAt, "复核版本必须由打开页面的接口提供");
    const missingVersion = await request(`/api/maintenance/flights/${id}/review`, { method: "PUT", cookie, body: { mode: "confirm", tasks, routineElectronicSigned: true } });
    assert.equal(missingVersion.res.statusCode, 409, "通用请求辅助逻辑不得补填版本");
    assert.equal(missingVersion.payload.code, "MAINTENANCE_REPORT_CONFLICT");
    const saved = await browserReview(view.payload.review, cookie, "save", tasks);
    assert.equal(saved.res.statusCode, 200, JSON.stringify(saved.payload));
    assert.notEqual(saved.payload.review.flight.updatedAt, view.payload.review.flight.updatedAt);
    const staleSaved = await request(`/api/maintenance/flights/${id}/review`, { method: "PUT", cookie, body: { mode: "confirm", tasks, routineElectronicSigned: true, expectedUpdatedAt: view.payload.review.flight.updatedAt } });
    assert.equal(staleSaved.res.statusCode, 409);
    assert.equal(db.prepare("select status from maintenance_flights where id=?").get(id).status, "待复核");
    const confirmed = await browserReview(saved.payload.review, cookie, "confirm", tasks);
    assert.equal(confirmed.res.statusCode, 200, JSON.stringify(confirmed.payload));
    assert.equal(confirmed.payload.review.flight.status, "已确认");
    assert.equal((await request(`/api/maintenance/flights/${id}/review`, { method: "PUT", cookie, body: { mode: "save", tasks, reason: "并发校验", expectedUpdatedAt: stale } })).res.statusCode, 409);
  }
  for (const kind of ["航后", "三方航后", "航后/航前"]) {
    const id = await create(kind);
    assert.equal((await submit(id, "release")).res.statusCode, 200);
    const routine = await submit(id, "routine", { automatic: true });
    assert.equal(routine.res.statusCode, 200, JSON.stringify(routine.payload));
    assert.equal(routine.payload.flight.status, "已提报");
    assert.equal(routine.payload.flight.reportFinalizedAt, "");
    const manual = await request(`/api/maintenance/flights/${id}/report-confirmation`, { method: "POST", cookie, body: { routineEntries: [{ role: "接机", personId: person.personId }] } });
    assert.equal(manual.res.statusCode, 200, JSON.stringify(manual.payload));
    assert.equal(manual.payload.flight.status, "待复核");
    assert.equal(manual.payload.flight.reportFinalizationMode, "manual");
  }
  const peer = createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(), { id: "auto-routine-peer", name: "自动确认例行人员" });
  const peerLogin = await request("/api/login", { method: "POST", body: { username: peer.username, password: "muc2026" } });
  const peerCookie = String(peerLogin.res.headers["Set-Cookie"]).split(";")[0];
  const shared = await create();
  db.prepare("update maintenance_assignments set person_id=?,user_name=? where flight_id=? and role='接机'").run(peer.personId, peer.name, shared);
  assert.equal((await submit(shared, "release")).res.statusCode, 200);
  const peerResult = await request(`/api/maintenance/flights/${shared}/reports/routine`, { method: "PUT", cookie: peerCookie, body: { entries: [{ role: "接机", personId: peer.personId }], expectedUpdatedAt: await reportVersion(shared, peerCookie) } });
  assert.equal(peerResult.res.statusCode, 200, JSON.stringify(peerResult.payload));
  assert.equal(peerResult.payload.flight.status, "待复核");
  const autoLog = db.prepare("select * from maintenance_logs where flight_id=? and action='report_auto_finalize'").get(shared);
  assert.equal(autoLog.user_id, "");
  assert.equal(JSON.parse(autoLog.detail).triggerUserId, peer.id);
  assert.equal(JSON.parse(autoLog.detail).originalReleaseReporter, login.payload.user.id);

  const drafted = await create();
  db.prepare("insert into maintenance_report_drafts(id,flight_id,report_type,payload_json,version,created_at,updated_at) values(?,?,'nonroutine',?,1,'test',?)")
    .run(`draft-${drafted}`, drafted, JSON.stringify({ items: [{ title: "待录入工作" }] }), new Date().toISOString());
  assert.equal((await submit(drafted, "release")).res.statusCode, 200);
  assert.equal((await submit(drafted, "routine")).payload.flight.status, "已提报");
  assert.equal(Number(db.prepare("select count(*) as n from maintenance_report_drafts where flight_id=?").get(drafted).n), 1);

  const broken = await create();
  assert.equal((await submit(broken, "routine")).res.statusCode, 200);
  db.prepare("update personnel set employment_status='停职' where id=?").run(person.personId);
  try {
    const release = await submit(broken, "release");
    assert.ok(release.res.statusCode >= 400, JSON.stringify(release.payload));
    assert.equal(Number(db.prepare("select count(*) as n from maintenance_report_batches where flight_id=? and report_type='release'").get(broken).n), 0);
    assert.equal(Number(db.prepare("select count(*) as n from maintenance_sortie_results where flight_id=?").get(broken).n), 0);
    assert.equal(db.prepare("select report_finalized_at from maintenance_flights where id=?").get(broken).report_finalized_at || "", "");
  } finally { db.prepare("update personnel set employment_status='在职' where id=?").run(person.personId); }
  const blocked = await create();
  const sub = await request(`/api/maintenance/flights/${blocked}/subtasks`, { method: "POST", cookie, body: { title: "非例行", category: "其他", standardHours: 1 } });
  assert.equal(sub.res.statusCode, 201, JSON.stringify(sub.payload));
  assert.equal((await submit(blocked, "release")).res.statusCode, 200);
  assert.equal((await submit(blocked, "routine")).payload.flight.status, "已提报");
});

test('attendance endpoints enforce login and distinguish real missing coverage',async()=>{
  assert.equal((await request('/api/attendance/status')).res.statusCode,401);
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
  const status=await request('/api/attendance/status',{cookie});assert.equal(status.res.statusCode,200);assert.equal(typeof status.payload.configuration.configured,'boolean');assert.ok(!JSON.stringify(status.payload).includes('appSecret'));
  const days=await request('/api/attendance/days?month=2026-09',{cookie});assert.equal(days.res.statusCode,200);assert.equal(days.payload.dates.length,30);assert.ok(days.payload.people.every(p=>p.days.length===30));
  assert.equal((await request('/api/attendance/days?month=2026-13',{cookie})).res.statusCode,400);
  const excel=await requestRaw('/api/attendance/export/xlsx?month=2026-09&scope=all',{cookie});assert.equal(excel.statusCode,200);assert.equal(excel.body.readUInt32LE(0),0x04034b50);assert.match(excel.headers['Content-Disposition'],/attachment/);
  const html=await requestRaw('/api/attendance/export/html?month=2026-09&scope=all',{cookie});assert.equal(html.statusCode,200);assert.ok(html.body.toString().includes('offline:true'));assert.equal(html.headers['Cache-Control'],'no-store');
  const stranger=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'attendance-denied-user',name:'考勤无权用户'});
  const other=await request('/api/login',{method:'POST',body:{username:stranger.username,password:'muc2026'}}),otherCookie=String(other.res.headers['Set-Cookie']).split(';')[0];
  assert.equal((await request('/api/attendance/days?month=2026-09',{cookie:otherCookie})).res.statusCode,403);
});
test('attendance export category filter validates input, keeps complete month and all scope ignores it',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
 const seed=response=>JSON.parse(response.body.toString().match(/<script id="attendanceSeed" type="application\/json">(.*?)<\/script>/s)[1]);
 const filtered=await requestRaw('/api/attendance/export/html?month=2026-09&scope=filtered&categories='+encodeURIComponent(JSON.stringify(['未同步','不存在'])),{cookie});assert.equal(filtered.statusCode,200);const data=seed(filtered);assert.ok(data.people.length>0);assert.ok(data.people.every(p=>p.days.length===30&&p.counts['未同步']>0));assert.deepEqual(data.filters.categories,['未同步','不存在']);
 const empty=await requestRaw('/api/attendance/export/html?month=2026-09&scope=filtered&categories='+encodeURIComponent('["不存在"]'),{cookie});assert.equal(seed(empty).people.length,0);assert.ok(seed(empty).categories.length>0);
 const all=await requestRaw('/api/attendance/export/html?month=2026-09&scope=all&query=does-not-exist&categories=invalid',{cookie});assert.equal(all.statusCode,200);assert.ok(seed(all).people.length>0);assert.equal(seed(all).filters.categories,undefined);
 for(const value of ['invalid','{}','[1]','[""]'])assert.equal((await requestRaw('/api/attendance/export/html?month=2026-09&scope=filtered&categories='+encodeURIComponent(value),{cookie})).statusCode,400);
});
test('leave directory metadata is visible to attendance readers and refresh cannot bypass maintenance permission',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
 const days=await request('/api/attendance/days?month=2026-09',{cookie});assert.equal(days.res.statusCode,200);assert.ok(Array.isArray(days.payload.leaveTypes.names));assert.equal((await request('/api/attendance/status',{cookie})).payload.leaveTypes.status,'not_loaded');
 assert.equal((await request('/api/attendance/leave-types/refresh',{method:'POST',cookie,body:{}})).res.statusCode,409);
 const user=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'leave-refresh-no-access',name:'假期目录无权用户'});const other=await request('/api/login',{method:'POST',body:{username:user.username,password:'muc2026'}}),otherCookie=String(other.res.headers['Set-Cookie']).split(';')[0];assert.equal((await request('/api/attendance/leave-types/refresh',{method:'POST',cookie:otherCookie,body:{}})).res.statusCode,403);
});
