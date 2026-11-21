import {createHash} from 'node:crypto';
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
import {publicationFixture} from './fixtures/maintenance-standard-publication.mjs';
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

const { measuredRoute, pumpInfoSync, pumpNonroutineNotifications, pumpStandardReviewNotifications, parseRangeHeader, cosSignedUrl, verifyCosUploadedAttachment, attachmentDisposition, db, capabilityService } = await import("../server.mjs");
function installFailureTrigger(name,table,event,condition,message){
  if(![name,table].every(value=>/^[a-z_]+$/.test(value))||!['insert','update'].includes(event))throw Error('Invalid failure fixture identity');
  const literal=message.replaceAll("'","''");
  if(db.kind==='postgres'){
    db.exec(`create function ${name}_fn() returns trigger language plpgsql as $$ begin raise exception '${literal}'; end $$`);
    db.exec(`create trigger ${name} before ${event} on ${table} for each row when (${condition}) execute function ${name}_fn()`);
    return ()=>db.exec(`drop trigger ${name} on ${table};drop function ${name}_fn()`);
  }
  db.exec(`create trigger ${name} before ${event} on ${table} when ${condition} begin select raise(abort,'${literal}'); end`);
  return ()=>db.exec(`drop trigger ${name}`);
}
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
  // 交接待办以班组长身份办理（V1.1 §5.1）：把超账人员临时设为一组班组长，以便本用例通过交接单读取维修装配。
  db.prepare("update personnel set position_code='班组长',administrative_team_id=(select id from organization_units where code='TEAM-LINE-1') where id=(select person_id from users where id='54002010')").run();
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
  assert.equal((await request('/api/maintenance/nonroutine-options')).res.statusCode,401);
  assert.equal((await request('/api/maintenance/nonroutine-options',{cookie:workerCookie})).res.statusCode,403);
  const formOptions=await request('/api/maintenance/nonroutine-options',{cookie:dispatcherCookie});
  assert.equal(formOptions.res.statusCode,200,JSON.stringify(formOptions.payload));
  assert.deepEqual(Object.keys(formOptions.payload),['towDefaultHours']);
  assert.ok(formOptions.payload.towDefaultHours>0);
  const newFlight=await request('/api/maintenance/flights',{method:'POST',cookie:dispatcherCookie,body:{date:'2026-11-16',flightNo:'MUNONROUTINE',aircraftNo:'B-NRO',aircraftType:'A320',workKind:'短停'}});
  assert.equal(newFlight.res.statusCode,201,JSON.stringify(newFlight.payload));
  const newWork=await request(`/api/maintenance/flights/${newFlight.payload.flight.id}/subtasks`,{method:'POST',cookie:dispatcherCookie,body:{cardNo:'05',title:'未提交工作',category:'其他',standardHours:1}});
  assert.equal(newWork.res.statusCode,201,JSON.stringify(newWork.payload));
  const initialAdmin=await login(template);
  const workHandover=await request('/api/handover',{method:'POST',cookie:initialAdmin,body:{fromTeamId:'TEAM-LINE-1',opportunities:[{flightId:newFlight.payload.flight.id,note:'未提交也可见'}]}});
  assert.equal(workHandover.res.statusCode,200,JSON.stringify(workHandover.payload));
  assert.ok(workHandover.payload.opportunities[0].live.subtasks.some(item=>item.title==='未提交工作'&&item.status==='未派工'));
  const createdSubtask=newWork.payload.flight.subtasks.find(item=>item.title==='未提交工作');
  const assignmentBody={assignments:[{personId:dispatcher.personId,role:'主做'}],expectedUpdatedAt:newWork.payload.flight.updatedAt};
  const deniedAssignment=await request(`/api/maintenance/subtasks/${createdSubtask.id}/dispatch`,{method:'POST',cookie:workerCookie,body:assignmentBody});
  assert.equal(deniedAssignment.res.statusCode,403);
  const savedAssignment=await request(`/api/maintenance/subtasks/${createdSubtask.id}/dispatch`,{method:'POST',cookie:dispatcherCookie,body:assignmentBody});
  assert.equal(savedAssignment.res.statusCode,200,JSON.stringify(savedAssignment.payload));
  const dispatchedHandover=await request(`/api/handover/${workHandover.payload.handover.id}`,{cookie:initialAdmin});
  const dispatchedWork=dispatchedHandover.payload.opportunities[0].live.subtasks.find(item=>item.id===createdSubtask.id);
  assert.equal(dispatchedWork.status,'已派工');assert.equal(dispatchedWork.assignments[0].userName,dispatcher.name);
  const staleAssignment=await request(`/api/maintenance/subtasks/${createdSubtask.id}/dispatch`,{method:'POST',cookie:dispatcherCookie,body:{...assignmentBody,expectedUpdatedAt:'stale-version'}});
  assert.equal(staleAssignment.res.statusCode,409);


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
  // 同上：超账人员临时设为班组长以满足交接办理身份。
  db.prepare("update personnel set position_code='班组长',administrative_team_id=(select id from organization_units where code='TEAM-LINE-1') where id=(select person_id from users where id='54002010')").run();
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
  const saved = await request(`/api/maintenance/flights/${flightId}/reports/routine/draft`, { method: "PUT", cookie, body: { entries, feedback:"例行草稿说明", version: 0 } });
  assert.equal(saved.res.statusCode, 200, JSON.stringify(saved.payload));
  const routineHandover=await request('/api/handover',{method:'POST',cookie:adminCookie,body:{fromTeamId:'TEAM-LINE-1',opportunities:[{flightId,note:'例行说明同步测试'}]}});
  assert.equal(routineHandover.res.statusCode,200,JSON.stringify(routineHandover.payload));
  assert.equal(routineHandover.payload.opportunities[0].live.routineReport.feedback,'例行草稿说明');
  assert.equal(routineHandover.payload.opportunities[0].live.routineReport.source,'draft');

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
  const submitted = await request(`/api/maintenance/flights/${flightId}/reports/routine`, { method: "PUT", cookie, body: { entries, feedback:"例行正式说明", draftVersion: version, expectedUpdatedAt: updated.payload.report.flight.updatedAt } });
  assert.equal(submitted.res.statusCode, 200, JSON.stringify(submitted.payload));
  const routineAfter=await request(`/api/handover/${routineHandover.payload.handover.id}`,{cookie:adminCookie});
  const executionAfter=await request(`/api/maintenance/flights/${flightId}/reports`,{cookie});
  assert.equal(routineAfter.payload.opportunities[0].live.routineReport.feedback,executionAfter.payload.report.routine.feedback);
  assert.equal(routineAfter.payload.opportunities[0].live.routineReport.source,'report');
  assert.equal(routineAfter.payload.opportunities[0].note,'例行说明同步测试');
  db.prepare("update maintenance_report_batches set feedback='' where flight_id=? and report_type='routine'").run(flightId);
  const clearedRoutine=await request(`/api/handover/${routineHandover.payload.handover.id}`,{cookie:adminCookie});
  assert.equal(clearedRoutine.payload.opportunities[0].live.routineReport.feedback,'','正式说明清空后不回退到旧草稿');

  const nonroutineItems = [{ temporary: true, title: "跨范围非例行", reportExplanation:"草稿工作内容需可查看", category: "其他", standardHours: 2, entries: [{ role: "主做", personId: colleague.personId }] }];
  const draft = await request(`/api/maintenance/flights/${flightId}/reports/nonroutine/draft`, { method: "PUT", cookie: secondCookie, body: { items: nonroutineItems, version: 0 } });
  const handoverRead = await request('/api/handover', {method:'POST',cookie:adminCookie,body:{fromTeamId:'TEAM-LINE-1',opportunities:[{flightId,note:'保留交接说明'}]}});
  assert.equal(handoverRead.res.statusCode,200,JSON.stringify(handoverRead.payload));
  const liveDraft=handoverRead.payload.opportunities[0].live.nonroutineDraft;
  assert.equal(liveDraft.items.length,nonroutineItems.length,'交接只读数据包含同一共享草稿');
  assert.equal(liveDraft.items[0].reportExplanation,'草稿工作内容需可查看');
  assert.ok(liveDraft.items[0].entries.every(entry=>typeof entry.userName==='string'));
  assert.equal(draft.res.statusCode, 200, JSON.stringify(draft.payload));
  const beforeNonroutine = await request(`/api/maintenance/flights/${flightId}/reports`, { cookie: secondCookie });
  const savedNonroutine = await request(`/api/maintenance/flights/${flightId}/reports/nonroutine`, { method: "PUT", cookie: secondCookie, body: { mode: "save", items: nonroutineItems, revision: beforeNonroutine.payload.report.nonroutine.revision } });
  assert.equal(savedNonroutine.res.statusCode, 200, JSON.stringify(savedNonroutine.payload));
  const formal = db.prepare("select id from maintenance_subtasks where flight_id=?").get(flightId);
  const handoverBeforeSubmit=await request(`/api/handover/${handoverRead.payload.handover.id}`,{cookie:adminCookie});
  const unsubmittedWork=handoverBeforeSubmit.payload.opportunities[0].live.subtasks.find(item=>item.id===formal.id);
  assert.ok(unsubmittedWork,'保存但尚未提报的非例行出现在交接明细');
  assert.ok(['未派工','已派工'].includes(unsubmittedWork.status),unsubmittedWork.status);
  assert.equal(unsubmittedWork.content,'草稿工作内容需可查看');
  assert.ok(unsubmittedWork.assignments.length>0,'未提报工作也包含派工人员');

  const latest = await request(`/api/maintenance/flights/${flightId}/reports`, { cookie: secondCookie });
  const submittedNonroutine = await request(`/api/maintenance/flights/${flightId}/reports/nonroutine`, { method: "PUT", cookie: secondCookie, body: { mode: "submit", items: [{ ...nonroutineItems[0], temporary: false, id: formal.id }], revision: latest.payload.report.nonroutine.revision, draftVersion: latest.payload.report.nonroutine.draft?.version } });
  const handoverAfterSubmit=await request(`/api/handover/${handoverRead.payload.handover.id}`,{cookie:adminCookie});
  assert.equal(handoverAfterSubmit.res.statusCode,200);
  assert.equal(handoverAfterSubmit.payload.opportunities[0].live.nonroutineDraft,null,'提交后草稿不重复计数');
  assert.ok(handoverAfterSubmit.payload.opportunities[0].live.subtasks.some(item=>item.id===formal.id));
  assert.equal(handoverAfterSubmit.payload.opportunities[0].note,'保留交接说明');
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

test("nonroutine import shadow preview matches standards and detects drafts without changing business tables", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"]).split(";")[0];
  const identity = { date: "2026-09-04", flightNo: "MUIMPSHADOW", aircraftNo: "BIMPSHADOW", aircraftType: "A320", workKind: "停场" };
  const created = await request("/api/maintenance/flights", { method: "POST", cookie, body: identity });
  assert.equal(created.res.statusCode, 201);
  const flightId = created.payload.flight.id;
  const stamp = "2026-11-01T00:00:00Z";
  db.prepare(`insert into maintenance_report_drafts(id,flight_id,report_type,payload_json,version,created_at,updated_at)
    values(?,?,'nonroutine',?,3,?,?)`).run(`import-shadow-draft-${flightId}`, flightId,
      JSON.stringify({ items: [{ clientId: "manual-draft", title: "人工已录入工作", chapter: "25", category: "其他", reportExplanation: "客舱", entries: [] }] }), stamp, stamp);
  db.prepare(`insert into maintenance_subtasks(id,flight_id,title,category,status,created_by,updated_by,created_at,updated_at)
    values(?,?,'已创建工作','其他','未派工','54002010','54002010',?,?)`).run(`import-shadow-task-${flightId}`, flightId, stamp, stamp);
  db.prepare("insert into maintenance_standards(id,status,created_by,created_at,updated_at) values('import-shadow-standard','PUBLISHED','54002010',?,?)").run(stamp, stamp);
  db.prepare(`insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,status,admission_decision,effective_at,published_by,published_at,created_at)
    values('import-shadow-version','import-shadow-standard',1,'单项工作','29','标准检查','左侧管路',1.2,'["A320"]','PUBLISHED','INCLUDE',?,'54002010',?,?)`).run(stamp, stamp, stamp);
  const tables = ["maintenance_flights", "maintenance_subtasks", "maintenance_assignments", "maintenance_report_drafts", "maintenance_report_batches", "maintenance_hour_results", "maintenance_sortie_results", "maintenance_standards", "maintenance_standard_versions"];
  const snapshot = () => tables.map(table => db.prepare(`select * from ${table} order by id`).all());
  const before = snapshot();
  const flag = process.env.MUC_MAINTENANCE_V101;
  const url = "/api/maintenance/subtasks/import/preview";
  const body = { rows: [
    { ...identity, title: "新的文字草稿", standardHours: 9999, rowNumber: 7 },
    { ...identity, title: "人工已录入工作", content: "不同位置需人工确认", rowNumber: 11 },
    { ...identity, title: "已创建工作", rowNumber: 12 },
    { ...identity, category: "单项工作", chapter: "29", title: "标准检查", content: "左侧管路", standardHours: 9999, rowNumber: 13 },
    { ...identity, flightNo: "NOTFOUND", title: "无法定位工作", rowNumber: 14 }
  ] };
  try {
    delete process.env.MUC_MAINTENANCE_V101;
    assert.equal((await request(url, { method: "POST", cookie, body })).res.statusCode, 404);
    process.env.MUC_MAINTENANCE_V101 = "shadow";
    assert.equal((await request(url, { method: "POST", body })).res.statusCode, 401);
    const result = await request(url, { method: "POST", cookie, body });
    assert.equal(result.res.statusCode, 200, JSON.stringify(result.payload));
    assert.deepEqual(result.payload.results.map(row => row.status), ["READY_NEW_DRAFT", "POSSIBLE_DUPLICATE", "POSSIBLE_DUPLICATE", "READY_STANDARD", "BLOCKED"]);
    assert.deepEqual(result.payload.results.map(row => row.rowNumber), [7, 11, 12, 13, 14]);
    assert.equal(result.payload.results[0].item.standardHours, undefined);
    assert.equal(result.payload.results[0].draftVersion, 3);
    assert.equal(result.payload.results[3].match.standard.standardHours, 1.2);
    assert.equal(result.payload.summary.ready, 2);
    assert.deepEqual(snapshot(), before);
    const blocked = await request(url, { method: "POST", cookie, body: { rows: [{ ...body.rows[0], flightId: "forged-flight-id" }] } });
    assert.equal(blocked.payload.results[0].status, "BLOCKED");
    assert.deepEqual(snapshot(), before);
    const content = [
      "date,aircraftNo,workKind,flightNo,title,standardHours",
      `${identity.date},${identity.aircraftNo},${identity.workKind},${identity.flightNo},新的文字草稿,9999`,
      `${identity.date},${identity.aircraftNo},${identity.workKind},${identity.flightNo},人工已录入工作,9999`,
      `${identity.date},${identity.aircraftNo},${identity.workKind},${identity.flightNo},=1+2,9999`
    ].join("\n");
    const fileBody = { filename: "预录入.csv", contentBase64: Buffer.from(content).toString("base64"), fileSha256: "client-forgery" };
    const batch = await request("/api/maintenance/subtasks/import/files/preview", { method: "POST", cookie, body: fileBody });
    assert.equal(batch.res.statusCode, 200, JSON.stringify(batch.payload));
    assert.match(batch.payload.fileSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(batch.payload.results.map(row => row.status), ["READY_NEW_DRAFT", "POSSIBLE_DUPLICATE", "BLOCKED"]);
    const batchUrl = `/api/maintenance/subtasks/import/batches/${batch.payload.batchId}`;
    const reopened = await request(batchUrl, { cookie });
    assert.equal(reopened.res.statusCode, 200);
    assert.deepEqual(reopened.payload, batch.payload);
    const renamed = await request("/api/maintenance/subtasks/import/files/preview", { method: "POST", cookie, body: { ...fileBody, filename: "另一个名字.csv" } });
    assert.equal(renamed.payload.fileSha256, batch.payload.fileSha256);
    const selected = await request(`${batchUrl}/rows/3`, { method: "PUT", cookie, body: { revision: 1, skip: true } });
    assert.equal(selected.res.statusCode, 200, JSON.stringify(selected.payload));
    assert.equal(selected.payload.revision, 2);
    assert.equal(selected.payload.results[1].status, "SKIPPED");
    assert.equal((await request(`${batchUrl}/rows/3`, { method: "PUT", cookie, body: { revision: 1, skip: false } })).res.statusCode, 409);
    assert.deepEqual(snapshot(), before);
  } finally {
    if (flag === undefined) delete process.env.MUC_MAINTENANCE_V101;
    else process.env.MUC_MAINTENANCE_V101 = flag;
    db.prepare("delete from maintenance_standard_versions where standard_id='import-shadow-standard'").run();
    db.prepare("delete from maintenance_standards where id='import-shadow-standard'").run();
  }
});

test("file import commits into the original shared draft, survives replay and cannot restore deleted sources", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"]).split(";")[0];
  const person = maintenancePerson(login.payload.user);
  const identity = { date: "2026-09-04", flightNo: "MUIMPCOMMIT", aircraftNo: "BIMPCOMMIT", aircraftType: "A320", workKind: "停场" };
  const created = await request("/api/maintenance/flights", { method: "POST", cookie, body: identity });
  assert.equal(created.res.statusCode, 201);
  const flightId = created.payload.flight.id;
  const manual = { clientId: "original-manual", category: "其他", title: "原人工项目", chapter: "25", standardHours: "", reportExplanation: "原文字", entries: [], legacyDetail: "保留" };
  const stamp = new Date().toISOString();
  db.prepare(`insert into maintenance_report_drafts(id,flight_id,report_type,payload_json,version,created_at,updated_at)
    values(?,?,'nonroutine',?,4,?,?)`).run(`import-commit-draft-${flightId}`, flightId, JSON.stringify({ items: [manual], legacyTopLevel: true }), stamp, stamp);
  const content = ["date,aircraftNo,workKind,flightNo,title,standardHours",
    `${identity.date},${identity.aircraftNo},${identity.workKind},${identity.flightNo},预录入一号工作,9999`,
    `${identity.date},${identity.aircraftNo},${identity.workKind},${identity.flightNo},预录入二号工作,9999`].join("\n");
  const file = { filename: "commit.csv", contentBase64: Buffer.from(content).toString("base64") };
  const flag = process.env.MUC_MAINTENANCE_V101;
  const businessTables = ["maintenance_subtasks", "maintenance_assignments", "maintenance_report_batches", "maintenance_hour_results", "maintenance_sortie_results", "maintenance_nonroutine_review_cases"];
  const snapshot = () => businessTables.map(table => db.prepare(`select * from ${table} where flight_id=? order by id`).all(flightId));
  const before = snapshot();
  try {
    process.env.MUC_MAINTENANCE_V101 = "shadow";
    const preview = await request("/api/maintenance/subtasks/import/files/preview", { method: "POST", cookie, body: file });
    assert.equal(preview.res.statusCode, 200, JSON.stringify(preview.payload));
    const batchUrl = `/api/maintenance/subtasks/import/batches/${preview.payload.batchId}`;
    const payload = {
      requestId: "integration-commit-one", revision: preview.payload.revision,
      rows: preview.payload.results.map(({ rowNumber, flightId, expectedUpdatedAt, draftVersion, matchDigest }) => ({ rowNumber, flightId, expectedUpdatedAt, draftVersion, matchDigest }))
    };
    assert.equal((await request(`${batchUrl}/commit`, { method: "POST", cookie, body: payload })).res.statusCode, 409);
    process.env.MUC_MAINTENANCE_V101 = "draft";
    const committed = await request(`${batchUrl}/commit`, { method: "POST", cookie, body: payload });
    assert.equal(committed.res.statusCode, 200, JSON.stringify(committed.payload));
    assert.equal(committed.payload.summary.created, 2, JSON.stringify(committed.payload));
    let saved = db.prepare("select * from maintenance_report_drafts where flight_id=?").get(flightId);
    const originalSaved = saved;
    const draft = JSON.parse(saved.payload_json);
    assert.equal(saved.version, 5);
    assert.equal(draft.items.length, 3);
    assert.deepEqual(draft.items[0], manual);
    assert.equal(draft.legacyTopLevel, true);
    assert.equal(draft.items[1].category, "");
    assert.equal(draft.items[1].standardHours, "");
    assert.deepEqual(draft.items[1].entries, []);
    assert.equal(db.prepare("select status from maintenance_flights where id=?").get(flightId).status, "未派工");
    assert.deepEqual(snapshot(), before);
    const replay = await request(`${batchUrl}/commit`, { method: "POST", cookie, body: payload });
    assert.equal(replay.payload.replayed, true);
    assert.deepEqual(db.prepare("select * from maintenance_report_drafts where flight_id=?").get(flightId), originalSaved);
    const beforeDispatch = await request("/api/maintenance/flights?scope=execute", { cookie });
    assert.ok(!beforeDispatch.payload.flights.some(flight => flight.id === flightId));
    const currentFlight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
    const dispatched = await request(`/api/maintenance/flights/${flightId}/dispatch`, { method: "POST", cookie, body: {
      expectedUpdatedAt: currentFlight.updated_at, assignments: [{ personId: person.personId, role: "放行" }]
    } });
    assert.equal(dispatched.res.statusCode, 200, JSON.stringify(dispatched.payload));
    const manualAdded = await request(`/api/maintenance/flights/${flightId}/subtasks`, { method: "POST", cookie, body: {
      title: "已有正式工作", category: "其他", chapter: "25", standardHours: 2
    } });
    assert.equal(manualAdded.res.statusCode, 201, JSON.stringify(manualAdded.payload));
    assert.deepEqual(db.prepare("select * from maintenance_report_drafts where flight_id=?").get(flightId), originalSaved);
    const formalBefore = db.prepare("select * from maintenance_subtasks where flight_id=?").all(flightId);
    const report = await request(`/api/maintenance/flights/${flightId}/reports`, { cookie });
    assert.equal(report.res.statusCode, 200, JSON.stringify(report.payload));
    assert.equal(report.payload.report.nonroutine.draft.items.length, 3);
    assert.equal(report.payload.report.nonroutine.draft.items[1].category, "");
    const editedItems = report.payload.report.nonroutine.draft.items.map((item, index) => index === 1 ? { ...item, title: "执行人补充后的工作名称" } : item);
    const edited = await request(`/api/maintenance/flights/${flightId}/reports/nonroutine/draft`, { method: "PUT", cookie, body: { items: editedItems, version: 5 } });
    assert.equal(edited.res.statusCode, 200, JSON.stringify(edited.payload));
    assert.equal(edited.payload.draft.items[1].category, "");
    assert.equal(edited.payload.draft.items[1].title, "执行人补充后的工作名称");
    assert.deepEqual(db.prepare("select * from maintenance_subtasks where flight_id=?").all(flightId), formalBefore);
    const latestReport = await request(`/api/maintenance/flights/${flightId}/reports`, { cookie });
    const submitted = await request(`/api/maintenance/flights/${flightId}/reports/nonroutine`, { method: "PUT", cookie, body: {
      items: draft.items.map(item => ({ ...item, temporary: true, standardHours: 9999, entries: [{ personId: person.personId, role: "主做" }] })),
      draftVersion: 6, revision: latestReport.payload.report.nonroutine.revision
    } });
    assert.equal(submitted.res.statusCode, 409);
    assert.match(submitted.payload.error, /评议/);
    assert.equal(Number(db.prepare("select count(*) n from maintenance_hour_results where flight_id=?").get(flightId).n), 0);
    const removedId = draft.items[1].clientId;
    const removed = await request(`/api/maintenance/flights/${flightId}/reports/nonroutine/draft/items/${removedId}`, { method: "DELETE", cookie, body: { version: 6 } });
    assert.equal(removed.res.statusCode, 200, JSON.stringify(removed.payload));
    assert.equal(removed.payload.draft.items.length, 2);
    const replayDeleted = await request(`${batchUrl}/commit`, { method: "POST", cookie, body: payload });
    assert.equal(replayDeleted.payload.results[0].status, "DELETED");
    const renamed = await request("/api/maintenance/subtasks/import/files/preview", { method: "POST", cookie, body: { ...file, filename: "renamed.csv" } });
    assert.deepEqual(renamed.payload.results.map(row => row.status), ["DELETED", "ALREADY_IMPORTED"]);
    saved = db.prepare("select * from maintenance_report_drafts where flight_id=?").get(flightId);
    assert.equal(JSON.parse(saved.payload_json).items.length, 2);
    assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_import_sources where flight_id=?").get(flightId).n), 2);
    const standardStamp = "2026-11-01T00:00:00Z";
    db.prepare("insert into maintenance_standards(id,status,created_by,created_at,updated_at) values('commit-known-standard','PUBLISHED','54002010',?,?)").run(standardStamp, standardStamp);
    db.prepare(`insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,status,admission_decision,effective_at,published_by,published_at,created_at)
      values('commit-known-version','commit-known-standard',1,'单项工作','29','有效标准检查','机身外侧',1.5,'["A320"]','PUBLISHED','INCLUDE',?,'54002010',?,?)`).run(standardStamp, standardStamp, standardStamp);
    const knownContent = `date,aircraftNo,workKind,flightNo,title,chapter,category,content,standardHours\n${identity.date},${identity.aircraftNo},${identity.workKind},${identity.flightNo},有效标准检查,29,单项工作,机身外侧,9999`;
    const known = await request("/api/maintenance/subtasks/import/files/preview", { method: "POST", cookie, body: {
      filename: "known.csv", contentBase64: Buffer.from(knownContent).toString("base64")
    } });
    assert.equal(known.payload.results[0].status, "READY_STANDARD");
    const knownPayload = { requestId: "known-standard-one", revision: known.payload.revision,
      rows: known.payload.results.map(({ rowNumber, flightId, expectedUpdatedAt, draftVersion, matchDigest }) => ({ rowNumber, flightId, expectedUpdatedAt, draftVersion, matchDigest })) };
    const knownCommit = await request(`/api/maintenance/subtasks/import/batches/${known.payload.batchId}/commit`, { method: "POST", cookie, body: knownPayload });
    assert.equal(knownCommit.payload.summary.created, 1, JSON.stringify(knownCommit.payload));
    saved = db.prepare("select * from maintenance_report_drafts where flight_id=?").get(flightId);
    const protectedDraft = saved;
    const retained = JSON.parse(saved.payload_json).items;
    assert.equal(retained.at(-1).standardHours, 1.5);
    assert.equal(retained.at(-1).standardSnapshot.version, 1);
    const tampered = retained.map((item, index) => index === retained.length - 1 ? { ...item, title: "尝试覆盖标准" } : item);
    assert.equal((await request(`/api/maintenance/flights/${flightId}/reports/nonroutine/draft`, { method: "PUT", cookie,
      body: { items: tampered, version: saved.version } })).res.statusCode, 409);
    assert.deepEqual(db.prepare("select * from maintenance_report_drafts where flight_id=?").get(flightId), protectedDraft);
    const bulkContent = ["date,aircraftNo,workKind,flightNo,title", ...Array.from({ length: 100 }, (_, index) =>
      `${identity.date},${identity.aircraftNo},${identity.workKind},${identity.flightNo},独立预录入项目${index}`)].join("\n");
    const bulk = await request("/api/maintenance/subtasks/import/files/preview", { method: "POST", cookie, body: {
      filename: "bulk.csv", contentBase64: Buffer.from(bulkContent).toString("base64")
    } });
    assert.equal(bulk.res.statusCode, 200);
    assert.equal(bulk.payload.summary.ready, 100);
    const bulkPayload = { requestId: "bulk-concurrent-one", revision: bulk.payload.revision,
      rows: bulk.payload.results.map(({ rowNumber, flightId, expectedUpdatedAt, draftVersion, matchDigest }) => ({ rowNumber, flightId, expectedUpdatedAt, draftVersion, matchDigest })) };
    const bulkUrl = `/api/maintenance/subtasks/import/batches/${bulk.payload.batchId}/commit`;
    const concurrent = await Promise.all([
      request(bulkUrl, { method: "POST", cookie, body: bulkPayload }),
      request(bulkUrl, { method: "POST", cookie, body: bulkPayload })
    ]);
    assert.ok(concurrent.every(result => result.res.statusCode === 200), JSON.stringify(concurrent.map(result => result.payload)));
    assert.deepEqual(concurrent.map(result => result.payload.replayed).sort(), [false, true]);
    const combined = JSON.parse(db.prepare("select payload_json from maintenance_report_drafts where flight_id=?").get(flightId).payload_json);
    assert.equal(combined.items.length, 103);
    assert.deepEqual(combined.items.slice(0, 3), retained);
    assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_import_sources where flight_id=?").get(flightId).n), 103);
    assert.equal(Number(db.prepare("select count(*) n from maintenance_hour_results where flight_id=?").get(flightId).n), 0);
    const deletedFlight = await request(`/api/maintenance/flights/${flightId}`, { method: "DELETE", cookie, body: { reason: "验证机会删除后的来源保护" } });
    assert.equal(deletedFlight.res.statusCode, 200, JSON.stringify(deletedFlight.payload));
    assert.ok(db.prepare("select state from maintenance_nonroutine_import_sources where flight_id=?").all(flightId).every(row => row.state === "DELETED"));
    const replacementFlight = await request("/api/maintenance/flights", { method: "POST", cookie, body: identity });
    assert.equal(replacementFlight.res.statusCode, 201);
    assert.notEqual(replacementFlight.payload.flight.id, flightId);
    const replaced = await request(`${batchUrl}/commit`, { method: "POST", cookie, body: payload });
    assert.ok(replaced.payload.results.every(row => row.status === "BLOCKED"), JSON.stringify(replaced.payload));
    assert.equal(db.prepare("select * from maintenance_report_drafts where flight_id=?").get(replacementFlight.payload.flight.id), undefined);
  } finally {
    if (flag === undefined) delete process.env.MUC_MAINTENANCE_V101;
    else process.env.MUC_MAINTENANCE_V101 = flag;
    db.prepare("delete from maintenance_standard_versions where standard_id='commit-known-standard'").run();
    db.prepare("delete from maintenance_standards where id='commit-known-standard'").run();
  }
});

test("standard shadow preview is disabled by default, scoped and free of business writes", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"]).split(";")[0];
  const created = await request("/api/maintenance/flights", { method: "POST", cookie, body: {
    date: "2026-09-04", flightNo: "MUSTDSHADOW", aircraftNo: "BSTDSHADOW", aircraftType: "A320", workKind: "停场"
  } });
  assert.equal(created.res.statusCode, 201);
  const flightId = created.payload.flight.id;
  const url = `/api/maintenance/flights/${flightId}/standards`;
  const flag = process.env.MUC_MAINTENANCE_V101;
  try {
    delete process.env.MUC_MAINTENANCE_V101;
    assert.equal((await request(url, { cookie })).res.statusCode, 404);
    assert.equal((await request("/api/maintenance/import-capabilities", { cookie })).payload.mode, "off");
    process.env.MUC_MAINTENANCE_V101 = "shadow";
    assert.equal((await request("/api/maintenance/import-capabilities", { cookie })).payload.mode, "shadow");
    assert.equal((await request("/api/maintenance/import-capabilities")).res.statusCode, 401);
    assert.equal((await request(url)).res.statusCode, 401);
    const tables = ["maintenance_flights", "maintenance_subtasks", "maintenance_assignments", "maintenance_report_drafts", "maintenance_report_batches", "maintenance_hour_results", "maintenance_sortie_results"];
    const snapshot = () => tables.map(table => db.prepare(`select * from ${table} where ${table === "maintenance_flights" ? "id" : "flight_id"}=? order by id`).all(flightId));
    const before = snapshot();
    const listed = await request(url, { cookie });
    assert.equal(listed.res.statusCode, 200, JSON.stringify(listed.payload));
    assert.deepEqual(listed.payload.items, []);
    const matched = await request(`${url}/match`, { method: "POST", cookie, body: { title: "尚未收录的工作" } });
    assert.equal(matched.res.statusCode, 200);
    assert.equal(matched.payload.status, "UNLISTED");
    const template = db.prepare("select * from users where id='54002010'").get();
    const outsider = createMaintenanceTestAccount(template, { id: "standard-outsider", name: "标准范围测试" });
    db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=?").run(outsider.id);
    const outsideLogin = await request("/api/login", { method: "POST", body: { username: outsider.username, password: "muc2026" } });
    const outsideCookie = String(outsideLogin.res.headers["Set-Cookie"]).split(";")[0];
    assert.equal((await request(url, { cookie: outsideCookie })).res.statusCode, 404);
    assert.equal((await request(`${url}/match`, { method: "POST", cookie: outsideCookie, body: {} })).res.statusCode, 404);
    assert.deepEqual(snapshot(), before);
  } finally {
    if (flag === undefined) delete process.env.MUC_MAINTENANCE_V101;
    else process.env.MUC_MAINTENANCE_V101 = flag;
  }
});

test("nonroutine shared draft keeps incomplete text, rejects stale saves and deletes without posting", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"]).split(";")[0];
  const person = maintenancePerson(login.payload.user);
  const created = await request("/api/maintenance/flights", { method: "POST", cookie, body: {
    date: "2026-09-04", flightNo: "MUDRAFTGOLD", aircraftNo: "BDRAFT", workKind: "停场"
  } });
  assert.equal(created.res.statusCode, 201);
  const flightId = created.payload.flight.id;
  db.prepare(`insert into maintenance_assignments(id,owner_type,owner_id,flight_id,person_id,user_name,team,role,status,assigned_by,assigned_at)
    values(?,'flight',?,?,?,?,?,'例行检查','已派工',?,?)`)
    .run(`draft-gold-${flightId}`, flightId, flightId, person.personId, person.name, "一组", person.id, new Date().toISOString());
  db.prepare("update maintenance_flights set status='已派工' where id=?").run(flightId);
  const url = `/api/maintenance/flights/${flightId}/reports/nonroutine/draft`;
  const tables = ["maintenance_flights", "maintenance_assignments", "maintenance_subtasks", "maintenance_report_batches", "maintenance_hour_results", "maintenance_sortie_results"];
  const snapshot = () => tables.map(table => {
    const rows = db.prepare(`select * from ${table} where ${table === "maintenance_flights" ? "id" : "flight_id"}=? order by id`).all(flightId);
    // Draft notifications legitimately advance the opportunity's refresh revision.
    return table === "maintenance_flights" ? rows.map(({ updated_at, ...facts }) => facts) : rows;
  });
  const original = snapshot();
  const items = [
    { clientId: "manual-one", title: "液压管路检查", chapter: "", category: "单项工作", standardHours: "", reportExplanation: "", entries: [] },
    { clientId: "manual-two", title: "客舱设备检查", chapter: "25", category: "其他", standardHours: "", reportExplanation: "检查范围待补充", entries: [] }
  ];
  const save = body => request(url, { method: "PUT", cookie, body });
  const first = await save({ items, version: 0 });
  assert.equal(first.res.statusCode, 200, JSON.stringify(first.payload));
  assert.equal(first.payload.draft.version, 1);
  assert.deepEqual(first.payload.draft.items, items);
  assert.deepEqual(snapshot(), original);
  const second = await save({ items: [...items].reverse(), version: 1 });
  assert.equal(second.res.statusCode, 200);
  assert.equal(second.payload.draft.version, 2);
  const persisted = db.prepare("select * from maintenance_report_drafts where flight_id=?").get(flightId);
  assert.equal((await save({ items: [], version: 1 })).res.statusCode, 409);
  assert.deepEqual(db.prepare("select * from maintenance_report_drafts where flight_id=?").get(flightId), persisted);
  const staleDelete = await request(url, { method: "DELETE", cookie, body: { version: 1 } });
  assert.equal(staleDelete.res.statusCode, 409);
  const reports = await request(`/api/maintenance/flights/${flightId}/reports`, { cookie });
  assert.equal(reports.res.statusCode, 200);
  assert.deepEqual(reports.payload.report.nonroutine.draft.items, [...items].reverse());
  const deleted = await request(url, { method: "DELETE", cookie, body: { version: 2 } });
  assert.equal(deleted.res.statusCode, 200);
  assert.equal(db.prepare("select * from maintenance_report_drafts where flight_id=?").get(flightId), undefined);
  assert.deepEqual(snapshot(), original);
  const recreated = await save({ items, version: 0 });
  assert.equal(recreated.res.statusCode, 200);
  assert.equal(recreated.payload.draft.version, 3);
  assert.equal((await save({ items: [], version: 2 })).res.statusCode, 409);
  const sourceBatch = `draft-source-${flightId}`;
  const sourceStamp = new Date().toISOString();
  db.prepare(`insert into maintenance_subtask_import_batches(id,created_by,filename,file_sha256,sheet_name,created_at,updated_at)
    values(?,'54002010','source.csv',?,'CSV',?,?)`).run(sourceBatch, "a".repeat(64), sourceStamp, sourceStamp);
  items.forEach((item, index) => {
    const rowNumber = index + 2;
    db.prepare(`insert into maintenance_subtask_import_rows(batch_id,row_number,original_json,preview_json,updated_at)
      values(?,?,?,'{}',?)`).run(sourceBatch, rowNumber, JSON.stringify(item), sourceStamp);
    db.prepare(`insert into maintenance_nonroutine_import_sources(fingerprint,flight_id,client_id,first_batch_id,row_number,original_json,state,created_by,created_at,updated_at)
      values(?,?,?,?,?,?,'ACTIVE','54002010',?,?)`).run(`${flightId}-${item.clientId}`, flightId, item.clientId, sourceBatch, rowNumber, JSON.stringify(item), sourceStamp, sourceStamp);
  });
  const oneDeleted = await request(`${url}/items/manual-one`, { method: "DELETE", cookie, body: { version: 3 } });
  assert.equal(oneDeleted.res.statusCode, 200, JSON.stringify(oneDeleted.payload));
  assert.equal(oneDeleted.payload.draft.version, 4);
  assert.deepEqual(oneDeleted.payload.draft.items, [items[1]]);
  assert.equal(db.prepare("select state from maintenance_nonroutine_import_sources where flight_id=? and client_id='manual-one'").get(flightId).state, "DELETED");
  assert.equal(db.prepare("select state from maintenance_nonroutine_import_sources where flight_id=? and client_id='manual-two'").get(flightId).state, "ACTIVE");
  assert.equal((await save({ items, version: 4 })).res.statusCode, 409);
  assert.equal((await request(`${url}/items/manual-two`, { method: "DELETE", cookie, body: { version: 3 } })).res.statusCode, 409);
  assert.equal((await request(`${url}/items/manual-two`, { method: "DELETE", cookie, body: { version: 4 } })).res.statusCode, 200);
  assert.ok(db.prepare("select state from maintenance_nonroutine_import_sources where flight_id=?").all(flightId).every(row => row.state === "DELETED"));
  const manyItems = Array.from({ length: 100 }, (_, index) => ({ ...items[0], clientId: `manual-${index}`, title: `工作${index}` }));
  const many = await save({ items: manyItems, version: 0 });
  assert.equal(many.res.statusCode, 200);
  assert.equal(many.payload.draft.version, 5);
  assert.equal(many.payload.draft.items.length, 100);
  const concurrent = await Promise.all([
    save({ items: manyItems, version: 5 }),
    save({ items: [items[0]], version: 5 })
  ]);
  assert.deepEqual(concurrent.map(result => result.res.statusCode).sort(), [200, 409]);
  const winner = db.prepare("select * from maintenance_report_drafts where flight_id=?").get(flightId);
  assert.equal(winner.version, 6);
  assert.equal((await save({ items: [null], version: 6 })).res.statusCode, 400);
  assert.equal((await save({ items: [items[0], items[0]], version: 6 })).res.statusCode, 409);
  assert.equal((await save({ items: Array.from({ length: 1001 }, (_, index) => ({ ...items[0], clientId: `too-many-${index}` })), version: 6 })).res.statusCode, 400);
  assert.deepEqual(db.prepare("select * from maintenance_report_drafts where flight_id=?").get(flightId), winner);
  db.prepare("update maintenance_flights set status='待复核' where id=?").run(flightId);
  const blockedDelete = await request(`${url}/items/manual-0`, { method: "DELETE", cookie, body: { version: 6 } });
  assert.equal(blockedDelete.res.statusCode, 409);
  assert.deepEqual(db.prepare("select * from maintenance_report_drafts where flight_id=?").get(flightId), winner);
  db.prepare("update maintenance_flights set status='已派工' where id=?").run(flightId);
  assert.deepEqual(snapshot(), original);
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

test('manual rollout preserves preexisting draft origins and saving beside legacy formal work does not rewrite assignments',async()=>{
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED'],previous=flags.map(key=>process.env[key]);
  try{
    process.env.MUC_MAINTENANCE_V101='draft';process.env.MUC_NONROUTINE_REVIEW_ENABLED='1';process.env.MUC_NONROUTINE_SUBMISSION_ENABLED='1';delete process.env.MUC_NONROUTINE_MANUAL_ENABLED;
    const f=await supplementalWorkFixture('MUMANUALMIXED');db.prepare("update maintenance_flights set status='已派工',aircraft_type='A320' where id=?").run(f.id);
    const url=`/api/maintenance/flights/${f.id}/reports/nonroutine`,draftUrl=url+'/draft',call=(path,body,method='PUT')=>request(path,{method,cookie:f.cookie,body});
    assert.equal((await call(url,{mode:'save',items:[f.item('原合法正式工作')]})).res.statusCode,200);
    const existing=db.prepare('select * from maintenance_subtasks where flight_id=?').get(f.id),assignments=db.prepare("select * from maintenance_assignments where owner_type='subtask' and owner_id=? order by id").all(existing.id);
    const legacy={id:existing.id,temporary:false,category:existing.category,chapter:existing.card_no,title:existing.title,reportExplanation:existing.content,standardHours:existing.standard_hours,entries:JSON.parse(db.prepare("select payload_json from maintenance_report_drafts where flight_id=?").get(f.id).payload_json).participantDrafts[0].entries};
    process.env.MUC_NONROUTINE_MANUAL_ENABLED='1';
    const temporary={clientId:'new-manual-draft',temporary:true,title:'旁边新增文字',category:'',chapter:'',standardHours:'',reportExplanation:'',entries:[]};
    const saved=await call(url,{mode:'save',items:[legacy,temporary],draftVersion:Number(db.prepare('select version from maintenance_report_drafts where flight_id=?').get(f.id).version)});assert.equal(saved.res.statusCode,200,JSON.stringify(saved.payload));
    assert.deepEqual(db.prepare('select * from maintenance_subtasks where flight_id=?').get(f.id),existing);assert.deepEqual(db.prepare("select * from maintenance_assignments where owner_type='subtask' and owner_id=? order by id").all(existing.id),assignments);
    const draft=JSON.parse(db.prepare('select payload_json from maintenance_report_drafts where flight_id=?').get(f.id).payload_json),version=Number(db.prepare('select version from maintenance_report_drafts where flight_id=?').get(f.id).version);assert.equal(draft.items.length,1);assert.equal(draft.items[0].sourceKind,'MANUAL');
    assert.equal((await call(url,{mode:'save',items:[legacy,temporary],draftVersion:0})).res.statusCode,409);
    const removed=await call(`${draftUrl}/items/new-manual-draft`,{version},'DELETE');assert.equal(removed.res.statusCode,200);assert.equal(db.prepare('select state from maintenance_nonroutine_manual_sources where flight_id=?').get(f.id).state,'DELETED');assert.equal((await call(draftUrl,{items:[temporary],version:0})).res.statusCode,409);
    const old=await supplementalWorkFixture('MUMANUALOLD');db.prepare("update maintenance_flights set status='已派工' where id=?").run(old.id);delete process.env.MUC_NONROUTINE_MANUAL_ENABLED;
    const original={...old.item('启用前人工草稿'),clientId:'legacy:preserved'},oldDraft=`/api/maintenance/flights/${old.id}/reports/nonroutine/draft`;
    const before=await request(oldDraft,{method:'PUT',cookie:old.cookie,body:{items:[original],version:0}});assert.equal(before.res.statusCode,200);process.env.MUC_NONROUTINE_MANUAL_ENABLED='1';
    const submitted=await request(`/api/maintenance/flights/${old.id}/reports/nonroutine`,{method:'PUT',cookie:old.cookie,body:{mode:'submit',items:[original],draftVersion:before.payload.draft.version}});assert.equal(submitted.res.statusCode,200,JSON.stringify(submitted.payload));assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_manual_sources where flight_id=?').get(old.id).n),0);assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_assessments where flight_id=?').get(old.id).n),0);assert.ok(Number(db.prepare('select sum(hours) n from maintenance_hour_results where flight_id=?').get(old.id).n)>0);
  }finally{for(const [index,key]of flags.entries())if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];}
});

test('manual source drafts save without formal work and submit through the original assessment and matching pipeline',async()=>{
  const f=await supplementalWorkFixture('MUMANUALSOURCE');db.prepare("update maintenance_flights set status='已派工',aircraft_type='A320' where id=?").run(f.id);
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED'],previous=flags.map(key=>process.env[key]);
  const draftUrl=`/api/maintenance/flights/${f.id}/reports/nonroutine/draft`,reportUrl=`/api/maintenance/flights/${f.id}/reports/nonroutine`;
  const call=(path,body,method='PUT')=>request(path,{method,cookie:f.cookie,body});
  const tables=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results'];
  const facts=()=>tables.map(table=>db.prepare(`select * from ${table} where ${table==='maintenance_flights'?'id':'flight_id'}=? order by id`).all(f.id).map(row=>table==='maintenance_flights'?Object.fromEntries(Object.entries(row).filter(([key])=>key!=='updated_at')):row));
  try{
    process.env.MUC_MAINTENANCE_V101='draft';process.env.MUC_NONROUTINE_REVIEW_ENABLED='1';process.env.MUC_NONROUTINE_SUBMISSION_ENABLED='1';delete process.env.MUC_NONROUTINE_MANUAL_ENABLED;
    const before=facts(),base={clientId:'manual-unlisted',temporary:true,title:'手工未收录独立测试',chapter:'998',category:'单项工作',standardHours:'',reportExplanation:'',entries:[]};
    assert.equal((await call(draftUrl,{items:[{...base,manualManaged:true}],version:0})).res.statusCode,409);
    process.env.MUC_NONROUTINE_MANUAL_ENABLED='1';const saved=await call(draftUrl,{items:[base],version:0});assert.equal(saved.res.statusCode,200,JSON.stringify(saved.payload));assert.deepEqual(facts(),before);
    assert.equal(saved.payload.draft.items[0].sourceKind,'MANUAL');assert.equal(saved.payload.draft.items[0].standardHours,'');assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_import_sources where flight_id=?').get(f.id).n),0);
    const originalSource=db.prepare('select * from maintenance_nonroutine_manual_sources where flight_id=?').get(f.id);
    const complete={...base,standardHours:2,reportExplanation:'手工范围',entries:[{personId:f.user.personId,role:'主做'}]};
    const second={...complete,clientId:'manual-second',title:'SECOND-INDEPENDENT-REVIEW'};
    const stale=await call(draftUrl,{items:[complete],version:0});assert.equal(stale.res.statusCode,409);assert.deepEqual(db.prepare('select * from maintenance_nonroutine_manual_sources where flight_id=?').get(f.id),originalSource);
    const standardId=`manual-zero-${f.id}`,versionId=`manual-zero-version-${f.id}`;
    db.prepare("insert into maintenance_standards(id,status,revision,created_by,created_at,updated_at) values(?,'PUBLISHED',1,'fixture','2026-01-01','2026-01-01')").run(standardId);
    db.prepare("insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,generic_aircraft,status,admission_decision,effective_at,published_by,published_at,created_at) values(?,?,1,'试车','995','手工有效零工时','有效零标准范围',0,'[\"A320\"]',0,'PUBLISHED','INCLUDE','2026-01-01','fixture','2026-01-01','2026-01-01')").run(versionId,standardId);
    const zero={clientId:'manual-zero',temporary:true,standardId,standardVersion:1,chapter:'995',category:'试车',title:'手工有效零工时',reportExplanation:'有效零标准范围',standardHours:0,entries:[{personId:f.user.personId,role:'主做'}]};
    const mixed=await call(draftUrl,{items:[complete,second,zero],version:saved.payload.draft.version});assert.equal(mixed.res.statusCode,200,JSON.stringify(mixed.payload));assert.deepEqual(facts(),before);assert.equal(mixed.payload.draft.items[2].standardSnapshot.standardHours,0);
    delete process.env.MUC_NONROUTINE_MANUAL_ENABLED;assert.equal((await call(reportUrl,{mode:'submit',items:[complete,second,zero],draftVersion:mixed.payload.draft.version})).res.statusCode,409);assert.deepEqual(facts(),before);process.env.MUC_NONROUTINE_MANUAL_ENABLED='1';
    assert.equal((await f.report({nonroutineItems:[complete]})).res.statusCode,409);
    assert.equal((await call(reportUrl,{mode:'submit',items:[complete],draftVersion:mixed.payload.draft.version})).res.statusCode,409);
    assert.equal((await call(reportUrl,{mode:'submit',items:[complete,second,{...zero,standardHours:9}],draftVersion:mixed.payload.draft.version})).res.statusCode,409);
    const fail=installFailureTrigger('fail_manual_submission','maintenance_nonroutine_manual_sources','update',"new.state='SUBMITTED'",'injected manual receipt failure');
    try{assert.ok((await call(reportUrl,{mode:'submit',items:[complete,second,zero],draftVersion:mixed.payload.draft.version})).res.statusCode>=400);assert.deepEqual(facts(),before);assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_assessments where flight_id=?').get(f.id).n),0);}finally{fail();}
    const submitted=await call(reportUrl,{mode:'submit',items:[complete,second,zero],draftVersion:mixed.payload.draft.version});assert.equal(submitted.res.statusCode,200,JSON.stringify(submitted.payload));
    const capturedConfiguration=(await request('/api/maintenance/rules',{cookie:f.cookie})).payload.ruleVersion;
    for(const assessment of db.prepare('select policy_json from maintenance_nonroutine_assessments where flight_id=?').all(f.id))assert.deepEqual(JSON.parse(assessment.policy_json).configurationVersion,capturedConfiguration);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases where flight_id=?').get(f.id).n),2);assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_assessments where flight_id=?').get(f.id).n),3);
    assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_manual_sources where flight_id=? and state='SUBMITTED'").get(f.id).n),3);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_report_drafts where flight_id=?').get(f.id).n),0);
    const pending=db.prepare("select * from maintenance_subtasks where flight_id=? and title='手工未收录独立测试'").get(f.id);assert.equal(pending.standard_hours,null);assert.equal(Number(db.prepare("select count(*) n from maintenance_hour_results where owner_type='subtask' and owner_id=?").get(pending.id).n),0);
    const actual=db.prepare('select hours from maintenance_effective_hour_results where flight_id=?').all(f.id);assert.ok(actual.length>0);assert.ok(actual.every(row=>Number(row.hours)===0));
    assert.equal((await call(reportUrl,{mode:'submit',items:[complete,second,zero],draftVersion:mixed.payload.draft.version})).res.statusCode,409);
    const lockedSourceFacts=()=>Object.fromEntries(['maintenance_subtasks','maintenance_assignments','maintenance_hour_results','maintenance_sortie_results','maintenance_report_batches','maintenance_report_entries','maintenance_nonroutine_review_cases','maintenance_nonroutine_assessments','maintenance_nonroutine_manual_sources','maintenance_logs'].map(table=>[table,db.prepare(`select * from ${table} where flight_id=? order by ${table==='maintenance_nonroutine_assessments'?'subtask_id':table==='maintenance_nonroutine_manual_sources'?'fingerprint':'id'}`).all(f.id)]));
    const lockedBefore=lockedSourceFacts(),zeroTask=db.prepare('select id from maintenance_subtasks where flight_id=? and title=?').get(f.id,zero.title);
    for(const change of [{path:`/api/maintenance/flights/${f.id}/subtasks`,method:'POST',body:{title:'不能作废既有已提报批次的新内容',category:'其他',standardHours:7}},{path:`/api/maintenance/subtasks/${pending.id}`,method:'PUT',body:{title:'不能覆盖待审施工事实',category:'其他',standardHours:7}},{path:`/api/maintenance/subtasks/${zeroTask.id}`,method:'PUT',body:{title:'不能覆盖已收录零工时事实',category:'其他',standardHours:7}}]){
      const blocked=await call(change.path,change.body,change.method);assert.equal(blocked.res.statusCode,409,'Generic content maintenance must not invalidate or overwrite submitted managed sources');assert.deepEqual(lockedSourceFacts(),lockedBefore);
    }
    const enabledFlags=flags.map(key=>process.env[key]);flags.forEach(key=>delete process.env[key]);
    try{
      assert.equal((await call(`/api/maintenance/subtasks/${pending.id}`,{title:'关闭开关不能解锁既有提报',category:'其他',standardHours:7},'PUT')).res.statusCode,409);assert.deepEqual(lockedSourceFacts(),lockedBefore);
      const flightBefore=db.prepare('select * from maintenance_flights where id=?').get(f.id),identity={date:flightBefore.date,flightNo:flightBefore.flight_no,departureFlightNo:flightBefore.departure_flight_no,aircraftNo:flightBefore.aircraft_no,aircraftType:flightBefore.aircraft_type,workKind:flightBefore.work_kind};
      for(const change of [{date:'2027-01-10'},{aircraftNo:'B-OTHER'},{aircraftType:'A321'}]){const result=await call(`/api/maintenance/flights/${f.id}`,{...identity,...change});assert.equal(result.res.statusCode,409,JSON.stringify(result.payload));assert.deepEqual(db.prepare('select * from maintenance_flights where id=?').get(f.id),flightBefore);assert.deepEqual(lockedSourceFacts(),lockedBefore);}
    }finally{flags.forEach((key,index)=>{if(enabledFlags[index]===undefined)delete process.env[key];else process.env[key]=enabledFlags[index];});}
    const preservedWork=()=>Object.fromEntries(['maintenance_assignments','maintenance_hour_results','maintenance_sortie_results','maintenance_subtasks'].map(table=>[table,db.prepare(`select * from ${table} where flight_id=? ${table==='maintenance_subtasks'?'and id<>?':"and not (owner_type='subtask' and owner_id=?)"} order by id`).all(f.id,pending.id)]));
    const preserved=()=>({...preservedWork(),reviews:db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=? and subtask_id<>? order by id').all(f.id,pending.id),channels:db.prepare('select * from maintenance_nonroutine_review_channels where case_id in (select id from maintenance_nonroutine_review_cases where flight_id=? and subtask_id<>?) order by id').all(f.id,pending.id),entries:db.prepare("select * from maintenance_report_entries where flight_id=? and not (owner_type='subtask' and owner_id=?) order by id").all(f.id,pending.id)});
    const otherBefore=preserved(),batchBefore=db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(f.id);
    const removed=await call(`/api/maintenance/subtasks/${pending.id}`,{reason:'取消未入账的手工单项，保留同批已收录结果'},'DELETE');assert.equal(removed.res.statusCode,200,JSON.stringify(removed.payload));
    assert.deepEqual(preserved(),otherBefore,'Cancelling one review must preserve other formal work and actual zero-hour results');
    assert.deepEqual(db.prepare('select * from maintenance_report_batches where id=?').get(batchBefore.id),batchBefore);
    assert.equal(db.prepare('select state from maintenance_nonroutine_manual_sources where subtask_id=?').get(pending.id).state,'DELETED');
    for(const submitSource of [false,true]){
      const extra=await supplementalWorkFixture(submitSource?'MUMANUALDELSUBMITTED':'MUMANUALDELACTIVE');db.prepare("update maintenance_flights set status='已派工',aircraft_type='A320' where id=?").run(extra.id);
      const path=`/api/maintenance/flights/${extra.id}/reports/nonroutine`,input={...complete,clientId:'manual-removal-fixture',title:'独立删除来源测试'};
      const draft=await call(`${path}/draft`,{items:[input],version:0});assert.equal(draft.res.statusCode,200,JSON.stringify(draft.payload));
      if(submitSource){const response=await call(path,{mode:'submit',items:[input],draftVersion:draft.payload.draft.version});assert.equal(response.res.statusCode,200,JSON.stringify(response.payload));}
      const sourceBefore=db.prepare('select * from maintenance_nonroutine_manual_sources where flight_id=?').get(extra.id);assert.equal(sourceBefore.state,submitSource?'SUBMITTED':'ACTIVE');
      const failure=installFailureTrigger('fail_manual_removal','maintenance_nonroutine_manual_sources','update',`new.flight_id='${extra.id}' and new.state='DELETED'`,'injected manual removal failure');
      try{assert.equal((await call(`/api/maintenance/flights/${extra.id}`,{reason:'删除手工来源演练'},'DELETE')).res.statusCode,500);assert.ok(db.prepare('select id from maintenance_flights where id=?').get(extra.id));assert.deepEqual(db.prepare('select * from maintenance_nonroutine_manual_sources where flight_id=?').get(extra.id),sourceBefore);if(submitSource)assert.equal(db.prepare('select state from maintenance_nonroutine_review_cases where flight_id=?').get(extra.id).state,'PENDING_ACCEPTANCE');}finally{failure();}
      const deleted=await call(`/api/maintenance/flights/${extra.id}`,{reason:'删除手工来源演练'},'DELETE');assert.equal(deleted.res.statusCode,200,JSON.stringify(deleted.payload));
      const tombstone=db.prepare('select * from maintenance_nonroutine_manual_sources where flight_id=?').get(extra.id);assert.equal(tombstone.state,'DELETED');assert.equal(tombstone.fingerprint,sourceBefore.fingerprint);assert.equal(tombstone.client_id,sourceBefore.client_id);
      const removalAudit=db.prepare("select detail from maintenance_logs where flight_id=? and action='delete_flight'").get(extra.id);assert.ok(removalAudit);assert.deepEqual(JSON.parse(removalAudit.detail).before.manualSources,[{fingerprint:sourceBefore.fingerprint,client_id:sourceBefore.client_id,subtask_id:sourceBefore.subtask_id,state:sourceBefore.state}]);
      if(submitSource)assert.equal(db.prepare('select state from maintenance_nonroutine_review_cases where flight_id=?').get(extra.id).state,'CANCELLED');
      assert.equal((await call(`/api/maintenance/flights/${extra.id}`,{reason:'重复删除'},'DELETE')).res.statusCode,404);
    }
  }finally{for(const [index,key]of flags.entries())if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];}
});

test('generic legacy content mutations roll back report invalidation on audit failure and recheck actor and finalization under the original transaction lock',async()=>{
 const f=await supplementalWorkFixture('MUCONTENTATOMIC');
 const saved=await f.report({mode:'save',nonroutineItems:[f.item('legacy-atomic-source')]});assert.equal(saved.res.statusCode,200,JSON.stringify(saved.payload));
 const task=db.prepare('select * from maintenance_subtasks where flight_id=?').get(f.id),snapshot=()=>Object.fromEntries(['maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_logs'].map(table=>[table,db.prepare(`select * from ${table} where flight_id=? order by id`).all(f.id)]));
 const variants=[{path:`/api/maintenance/flights/${f.id}/subtasks`,method:'POST',action:'create_subtask'},{path:`/api/maintenance/subtasks/${task.id}`,method:'PUT',action:'update_subtask'}];
 for(const variant of variants){
  const before=snapshot(),flightBefore=db.prepare('select * from maintenance_flights where id=?').get(f.id),payload={title:'原内容维护事务测试',category:'其他',standardHours:2};
  const drop=installFailureTrigger('fail_content_audit','maintenance_logs','insert',`new.action='${variant.action}'`,'injected content audit failure');
  try{const result=await request(variant.path,{method:variant.method,cookie:f.cookie,body:payload});assert.equal(result.res.statusCode,500);assert.deepEqual(snapshot(),before);assert.deepEqual(db.prepare('select * from maintenance_flights where id=?').get(f.id),flightBefore);}finally{drop();}
  for(const change of ['actor','finalized']){
   const originalExec=db.exec,userBefore=db.prepare('select status from users where id=?').get(f.user.id);let injected=false;
   db.exec=sql=>{if(!injected&&/^begin immediate$/i.test(String(sql).trim())){injected=true;if(change==='actor')db.prepare("update users set status='inactive' where id=?").run(f.user.id);else db.prepare("update maintenance_flights set report_finalized_at='concurrent-fixture-finalization',status='待复核' where id=?").run(f.id);}return originalExec(sql);};
   try{const result=await request(variant.path,{method:variant.method,cookie:f.cookie,body:payload});assert.equal(injected,true);assert.equal(result.res.statusCode,change==='actor'?403:409,JSON.stringify(result.payload));assert.deepEqual(snapshot(),before);}finally{db.exec=originalExec;db.prepare('update users set status=? where id=?').run(userBefore.status,f.user.id);db.prepare('update maintenance_flights set report_finalized_at=?,status=? where id=?').run(flightBefore.report_finalized_at,flightBefore.status,f.id);}
  }
 }
});

test("import commit revalidates changed standards and reopens expired decisions without restoring locked or inaccessible work", async () => {
  const logged=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),rootCookie=String(logged.res.headers['Set-Cookie']).split(';')[0],actor=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'preview-standard-importer',name:'导入预览复核人'});
  db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(actor.id,db.prepare("select id from rbac_roles where code='dispatcher'").get().id,new Date().toISOString());db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(actor.id);
  db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(actor.id,db.prepare("select id from rbac_roles where code='addon_maintenance_import'").get().id,new Date().toISOString());
  const signed=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}}),cookie=String(signed.res.headers['Set-Cookie']).split(';')[0];assert.equal(signed.res.statusCode,200);
  const api=(path,body={},method='POST',auth=cookie)=>request(path,{method,cookie:auth,body}),flags=['MUC_MAINTENANCE_V101'],previous=flags.map(k=>process.env[k]);
  const payload=(view,requestId)=>({requestId,revision:view.revision,rows:view.results.map(({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest})=>({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest}))});
  const createStandard=(id,title,chapter,scope,hours)=>{const stamp='2026-01-01T00:00:00Z';db.prepare("insert into maintenance_standards(id,status,created_by,created_at,updated_at) values(?,'PUBLISHED','54002010',?,?)").run(id,stamp,stamp);for(const version of [1,2])db.prepare(`insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,status,admission_decision,effective_at,published_by,published_at,created_at) values(?,?,?,'试车',?,?,?,?, '["A320"]',?,'INCLUDE',?,'54002010',?,?)`).run(id+'-v'+version,id,version,chapter,title,version===1?scope:scope+'修订',version===1?hours:hours+1,version===1?'PUBLISHED':'DRAFT',stamp,stamp,stamp);};
  const facts=id=>Object.fromEntries(['maintenance_report_drafts','maintenance_nonroutine_import_sources','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_nonroutine_review_cases'].map(t=>[t,db.prepare(`select * from ${t} where flight_id=? order by ${t==='maintenance_nonroutine_import_sources'?'fingerprint':'id'}`).all(id)]));
  try{
    process.env.MUC_MAINTENANCE_V101='draft';
    for(const kind of ['auto','manual']){
      const number='MUIMPREMATCH'+kind.toUpperCase(),title=kind==='auto'?'自动匹配原标准':'人工候选标准',chapter=kind==='auto'?'979':'978',standardId='preview-rematch-'+kind;
      createStandard(standardId,title,chapter,'标准原范围',1.5);if(kind==='manual')createStandard(standardId+'-alternative',title,chapter,'另一个标准范围',4.5);
      const made=await api('/api/maintenance/flights',{date:'2026-09-04',flightNo:number,aircraftNo:'B-REMATCH-'+kind,aircraftType:'A320',workKind:'停场'},'POST',rootCookie);assert.equal(made.res.statusCode,201);const id=made.payload.flight.id;const dispatched=await api(`/api/maintenance/flights/${id}/dispatch`,{expectedUpdatedAt:made.payload.flight.updatedAt,assignments:[{personId:logged.payload.user.personId,role:'放行'}]},'POST',rootCookie);assert.equal(dispatched.res.statusCode,200,JSON.stringify(dispatched.payload));
      const text=kind==='auto'?'标准原范围':'原文字待核对',csv=`date,aircraftNo,workKind,flightNo,title,chapter,category,content,standardHours\n2026-09-04,B-REMATCH-${kind},停场,${number},${title},${chapter},试车,${text},9999`;
      const opened=await api('/api/maintenance/subtasks/import/files/preview',{filename:'rematch-'+kind+'.csv',contentBase64:Buffer.from(csv).toString('base64')});assert.equal(opened.res.statusCode,200,JSON.stringify(opened.payload));let view=opened.payload;assert.equal(view.results[0].status,kind==='auto'?'READY_STANDARD':'NEEDS_SELECTION');const url=`/api/maintenance/subtasks/import/batches/${view.batchId}`;
      if(kind==='manual'){const chosen=await api(url+'/rows/2',{revision:view.revision,standardId,standardVersion:1},'PUT');assert.equal(chosen.res.statusCode,200,JSON.stringify(chosen.payload));view=chosen.payload;}
      const original=db.prepare('select * from maintenance_subtask_import_rows where batch_id=?').get(view.batchId),oldPayload=payload(view,'rematch-stale-'+kind),before=facts(id);
      db.prepare("update maintenance_standard_versions set status='PUBLISHED' where id=?").run(standardId+'-v2');
      const stale=await api(url+'/commit',oldPayload);assert.equal(stale.res.statusCode,200,JSON.stringify(stale.payload));assert.equal(stale.payload.summary.created,0);assert.equal(stale.payload.results[0].status,kind==='auto'?'NEEDS_REVIEW':'NEEDS_REVIEW');assert.deepEqual(facts(id),before);
      view=(await api(url,{},'GET')).payload;
      if(kind==='manual'){
        assert.equal(view.results[0].status,'BLOCKED');assert.equal(view.results[0].canResetStandardChoice,true);
        const beforeRows=db.prepare('select * from maintenance_subtask_import_rows where batch_id=?').all(view.batchId);
        db.prepare("update rbac_user_scopes set scope_type='self' where user_id=? and module='maintenance'").run(actor.id);
        try{const hidden=await api(url,{},'GET');assert.equal(hidden.res.statusCode,200);assert.equal(hidden.payload.results[0].flightId,undefined);assert.equal(hidden.payload.results[0].item,undefined);const denied=await api(url+'/rows/2',{revision:view.revision,resetStandardChoice:true},'PUT');assert.equal(denied.res.statusCode,409);assert.deepEqual(db.prepare('select * from maintenance_subtask_import_rows where batch_id=?').all(view.batchId),beforeRows);}finally{db.prepare("update rbac_user_scopes set scope_type='all' where user_id=? and module='maintenance'").run(actor.id);}
        db.prepare("update maintenance_flights set status='已提报' where id=?").run(id);
        try{const locked=(await api(url,{},'GET')).payload;assert.equal(locked.results[0].canResetStandardChoice,false);assert.equal((await api(url+'/rows/2',{revision:view.revision,resetStandardChoice:true},'PUT')).res.statusCode,409);assert.deepEqual(facts(id),before);}finally{db.prepare("update maintenance_flights set status='已派工' where id=?").run(id);}
        const reset=await api(url+'/rows/2',{revision:view.revision,resetStandardChoice:true},'PUT');assert.equal(reset.res.statusCode,200,JSON.stringify(reset.payload));assert.equal(reset.payload.results[0].status,'NEEDS_SELECTION');view=reset.payload;
        assert.equal((await api(url+'/rows/2',{revision:view.revision-1,resetStandardChoice:true},'PUT')).res.statusCode,409);
        const chosen=await api(url+'/rows/2',{revision:view.revision,standardId,standardVersion:2},'PUT');assert.equal(chosen.res.statusCode,200,JSON.stringify(chosen.payload));view=chosen.payload;assert.deepEqual(facts(id),before);
      }else{assert.equal(view.results[0].status,'NEEDS_SELECTION');const selected=await api(url+'/rows/2',{revision:view.revision,standardId,standardVersion:2},'PUT');assert.equal(selected.res.statusCode,200,JSON.stringify(selected.payload));view=selected.payload;}
      const committed=await api(url+'/commit',payload(view,'rematch-current-'+kind));assert.equal(committed.res.statusCode,200);assert.equal(committed.payload.summary.created,1,JSON.stringify(committed.payload));
      const source=db.prepare('select * from maintenance_nonroutine_import_sources where flight_id=?').get(id),draft=JSON.parse(db.prepare("select payload_json from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").get(id).payload_json);assert.equal(source.original_json,original.original_json);assert.equal(JSON.parse(source.standard_snapshot_json).version,2);assert.equal(draft.items.length,1);assert.equal(draft.items[0].standardHours,2.5);assert.equal(draft.items[0].reportExplanation,'标准原范围修订');assert.equal(draft.items[0].standardSnapshot.version,2);
      assert.deepEqual(db.prepare('select * from maintenance_assignments where flight_id=? order by id').all(id),before.maintenance_assignments);
      const after=facts(id),replayed=await api(url+'/commit',oldPayload);assert.equal(replayed.res.statusCode,200);assert.equal(replayed.payload.replayed,true);assert.equal(replayed.payload.summary.created,0);assert.deepEqual(facts(id),after);
      for(const t of ['maintenance_subtasks','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_nonroutine_review_cases'])assert.equal(Number(db.prepare(`select count(*) n from ${t} where flight_id=?`).get(id).n),0);
    }
  }finally{flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});

test("ordinary imported draft standard choices recheck catalog and execution permissions without expanding own-task visibility", async () => {
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),rootCookie=String(login.res.headers['Set-Cookie']).split(';')[0],template=db.prepare("select * from users where id='54002010'").get(),actor=createMaintenanceTestAccount(template,{id:'import-choice-worker',name:'导入标准普通执行者'});
  db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=? and module='maintenance'").run(actor.id);
  const signed=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}}),cookie=String(signed.res.headers['Set-Cookie']).split(';')[0];assert.equal(signed.res.statusCode,200);
  const api=(path,body,method='POST',auth=cookie)=>request(path,{method,cookie:auth,body}),root=(path,body,method='POST')=>api(path,body,method,rootCookie);
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED'],previous=flags.map(k=>process.env[k]);
  const workerRole=db.prepare("select * from rbac_roles where code='worker'").get(),limited={...workerRole,id:'import-choice-no-catalog',code:'import_choice_no_catalog',system_role:0};db.prepare(`insert into rbac_roles(${Object.keys(limited).join(',')}) values(${Object.keys(limited).map(()=>'?').join(',')})`).run(...Object.values(limited));
  db.prepare("insert into rbac_role_permissions(role_id,permission_id) select ?,rp.permission_id from rbac_role_permissions rp join rbac_permissions p on p.id=rp.permission_id where rp.role_id=? and p.code<>'maintenance.standard.view'").run(limited.id,workerRole.id);
  const revokedRoles=[limited.id];
  for(const [suffix,permission] of [['update','maintenance.nonroutine.update.own'],['execute','maintenance.execute.submit']]){
    const row={...limited,id:'import-choice-no-'+suffix,code:'import_choice_no_'+suffix};db.prepare(`insert into rbac_roles(${Object.keys(row).join(',')}) values(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));db.prepare("insert into rbac_role_permissions(role_id,permission_id) select ?,rp.permission_id from rbac_role_permissions rp join rbac_permissions p on p.id=rp.permission_id where rp.role_id=? and p.code<>?").run(row.id,workerRole.id,permission);revokedRoles.push(row.id);
  }
  const role=roleId=>{db.prepare('delete from rbac_user_roles where user_id=?').run(actor.id);db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(actor.id,roleId,new Date().toISOString());};
  try{
    process.env.MUC_MAINTENANCE_V101='draft';process.env.MUC_NONROUTINE_REVIEW_ENABLED='1';process.env.MUC_NONROUTINE_SUBMISSION_ENABLED='1';
    const made=await root('/api/maintenance/flights',{date:'2026-09-04',flightNo:'MUIMPORTCHOICEAUTH',aircraftNo:'B-CHOICE',aircraftType:'A320',workKind:'停场'});assert.equal(made.res.statusCode,201,JSON.stringify(made.payload));const flight=made.payload.flight,base=`/api/maintenance/flights/${flight.id}`;
    const dispatched=await root(base+'/dispatch',{expectedUpdatedAt:flight.updatedAt,assignments:[{personId:actor.personId,role:'放行'}]});assert.equal(dispatched.res.statusCode,200,JSON.stringify(dispatched.payload));
    const stamp='2026-01-01T00:00:00Z';db.prepare("insert into maintenance_standards(id,status,created_by,created_at,updated_at) values('worker-existing-standard','PUBLISHED','54002010',?,?)").run(stamp,stamp);db.prepare(`insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,status,admission_decision,effective_at,published_by,published_at,created_at) values('worker-existing-standard-v1','worker-existing-standard',1,'试车','982','修订后对应既有标准','标准右侧范围',1.5,'["A320"]','PUBLISHED','INCLUDE',?,'54002010',?,?)`).run(stamp,stamp,stamp);
    const csv='date,aircraftNo,workKind,flightNo,title,chapter,category,content\n2026-09-04,B-CHOICE,停场,MUIMPORTCHOICEAUTH,原始未收录文字,983,试车,原始文字范围';const preview=await root('/api/maintenance/subtasks/import/files/preview',{filename:'worker-choice.csv',contentBase64:Buffer.from(csv).toString('base64')});assert.equal(preview.payload.results[0].status,'READY_NEW_DRAFT');
    const commit=await root(`/api/maintenance/subtasks/import/batches/${preview.payload.batchId}/commit`,{requestId:'worker-choice-import',revision:preview.payload.revision,rows:preview.payload.results.map(({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest})=>({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest}))});assert.equal(commit.payload.summary.created,1);
    let report=(await api(base+'/reports',{},'GET')).payload.report;const draft=report.nonroutine.draft,originalSource=db.prepare('select * from maintenance_nonroutine_import_sources where flight_id=?').get(flight.id);
    const revised=draft.items.map(item=>({...item,chapter:'982',title:'修订后对应既有标准',reportExplanation:'标准右侧范围',standardHours:1.5,entries:[{personId:actor.personId,role:'主做'}]}));
    const edited=await api(base+'/reports/nonroutine/draft',{version:draft.version,items:revised},'PUT');assert.equal(edited.res.statusCode,200,JSON.stringify(edited.payload));assert.equal(edited.payload.draft.items[0].standardId,'');report=(await api(base+'/reports',{},'GET')).payload.report;
    const items=revised.map(item=>({...item,temporary:true,standardId:'worker-existing-standard',standardVersion:1}));
    const snapshot=()=>Object.fromEntries(['maintenance_flights','maintenance_report_drafts','maintenance_nonroutine_import_sources','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_nonroutine_review_cases','maintenance_nonroutine_assessments','maintenance_logs'].map(table=>[table,db.prepare(`select * from ${table} where ${table==='maintenance_flights'?'id':'flight_id'}=? order by ${table==='maintenance_nonroutine_import_sources'?'fingerprint':table==='maintenance_nonroutine_assessments'?'subtask_id':'id'}`).all(flight.id)]));
    const before=snapshot();role(limited.id);assert.equal((await api(base+'/standards',{},'GET')).res.statusCode,403);
    const denied=await api(base+'/reports/nonroutine/draft',{version:edited.payload.draft.version,items},'PUT');assert.equal(denied.res.statusCode,403);assert.deepEqual(snapshot(),before);role(workerRole.id);
    for(const revoked of revokedRoles){
      role(revoked);const denied=await api(base+'/reports/nonroutine/draft',{version:edited.payload.draft.version,items},'PUT');assert.equal(denied.res.statusCode,403,JSON.stringify(denied.payload));assert.deepEqual(snapshot(),before);role(workerRole.id);
      const originalExec=db.exec;let injected=false;db.exec=sql=>{if(!injected&&/^begin immediate$/i.test(String(sql).trim())){injected=true;role(revoked);}return originalExec(sql);};
      try{const denied=await api(base+'/reports/nonroutine/draft',{version:edited.payload.draft.version,items},'PUT');assert.equal(injected,true);assert.equal(denied.res.statusCode,403,JSON.stringify(denied.payload));assert.deepEqual(snapshot(),before);}finally{db.exec=originalExec;role(workerRole.id);}
    }
    role(limited.id);const deniedSubmit=await api(base+'/reports/nonroutine',{mode:'submit',items,draftVersion:edited.payload.draft.version,revision:report.nonroutine.revision},'PUT');assert.equal(deniedSubmit.res.statusCode,403,JSON.stringify(deniedSubmit.payload));assert.deepEqual(snapshot(),before);role(workerRole.id);
    const unconfirmed=await api(base+'/reports/nonroutine',{mode:'submit',items:revised.map(item=>({...item,temporary:true})),draftVersion:edited.payload.draft.version,revision:report.nonroutine.revision},'PUT');assert.equal(unconfirmed.res.statusCode,409);assert.match(unconfirmed.payload.error,/确认.*标准/);assert.ok(!unconfirmed.payload.error.includes('后来发布'));assert.deepEqual(snapshot(),before);
    const outside=await root('/api/maintenance/flights',{date:'2026-09-04',flightNo:'MUIMPORTCHOICEOUT',aircraftNo:'B-OUTCHOICE',aircraftType:'A320',workKind:'停场'});assert.equal(outside.res.statusCode,201);assert.equal((await api(`/api/maintenance/flights/${outside.payload.flight.id}/standards`,{},'GET')).res.statusCode,404);const outsideBefore=db.prepare('select * from maintenance_flights where id=?').get(outside.payload.flight.id);const outsideWrite=await api(`/api/maintenance/flights/${outside.payload.flight.id}/reports/nonroutine/draft`,{version:0,items},'PUT');assert.equal(outsideWrite.res.statusCode,404);assert.deepEqual(db.prepare('select * from maintenance_flights where id=?').get(outside.payload.flight.id),outsideBefore);assert.equal(db.prepare('select id from maintenance_report_drafts where flight_id=?').get(outside.payload.flight.id),undefined);
    const saved=await api(base+'/reports/nonroutine/draft',{version:edited.payload.draft.version,items},'PUT');assert.equal(saved.res.statusCode,200,JSON.stringify(saved.payload));assert.equal(saved.payload.draft.items[0].standardId,'worker-existing-standard');
    const currentSource=db.prepare('select * from maintenance_nonroutine_import_sources where flight_id=?').get(flight.id);assert.equal(currentSource.fingerprint,originalSource.fingerprint);assert.equal(currentSource.original_json,originalSource.original_json);assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id).n),0);
    role(limited.id);assert.equal((await api(base+'/standards',{},'GET')).res.statusCode,403);const unchangedReference=await api(base+'/reports/nonroutine/draft',{version:saved.payload.draft.version,items},'PUT');assert.equal(unchangedReference.res.statusCode,200,JSON.stringify(unchangedReference.payload));
    const reopened=(await api(base+'/reports',{},'GET')).payload.report;const submitExisting=await api(base+'/reports/nonroutine',{mode:'submit',items,draftVersion:unchangedReference.payload.draft.version,revision:reopened.nonroutine.revision},'PUT');assert.equal(submitExisting.res.statusCode,200,JSON.stringify(submitExisting.payload));const assessment=db.prepare('select * from maintenance_nonroutine_assessments where flight_id=?').get(flight.id);assert.equal(assessment.source_kind,'STANDARD');assert.equal(Number(assessment.effective_hours),1.5);assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id).n),0);
  }finally{role(workerRole.id);flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});

test("later exact standard requires explicit imported reference and invalidation rejects without changing the original draft", async () => {
  const f=await supplementalWorkFixture('MUUNIQUESTANDARD');db.prepare("update maintenance_flights set status='已派工',aircraft_type='A320' where id=?").run(f.id);
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED'],previous=flags.map(k=>process.env[k]);
  const api=(path,body,method='POST')=>request(path,{method,cookie:f.cookie,body});
  const snapshot=()=>Object.fromEntries(['maintenance_report_drafts','maintenance_nonroutine_import_sources','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_nonroutine_review_cases','maintenance_nonroutine_assessments','maintenance_logs','maintenance_report_source_journal'].map(table=>[table,db.prepare(`select * from ${table} where flight_id=? order by ${table==='maintenance_nonroutine_import_sources'?'fingerprint':table==='maintenance_nonroutine_assessments'?'subtask_id':'id'}`).all(f.id)]));
  try{
    process.env.MUC_MAINTENANCE_V101='draft';process.env.MUC_NONROUTINE_REVIEW_ENABLED='1';process.env.MUC_NONROUTINE_SUBMISSION_ENABLED='1';
    const content='date,aircraftNo,workKind,flightNo,title,chapter,category,content\n2026-09-04,BTEST,停场,MUUNIQUESTANDARD,唯一后来发布标准,984,试车,右侧独立范围';
    const preview=await api('/api/maintenance/subtasks/import/files/preview',{filename:'unique-standard.csv',contentBase64:Buffer.from(content).toString('base64')});assert.equal(preview.payload.results[0].status,'READY_NEW_DRAFT');
    const committed=await api(`/api/maintenance/subtasks/import/batches/${preview.payload.batchId}/commit`,{requestId:'unique-standard-import',revision:preview.payload.revision,rows:preview.payload.results.map(({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest})=>({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest}))});assert.equal(committed.payload.summary.created,1);
    let report=(await api(`/api/maintenance/flights/${f.id}/reports`,{},'GET')).payload.report;
    const draft=report.nonroutine.draft,items=draft.items.map(item=>({...item,temporary:true,standardHours:1.5,entries:[{personId:f.user.personId,role:'主做'}]}));
    const stamp='2026-01-01T00:00:00Z';db.prepare("insert into maintenance_standards(id,status,created_by,created_at,updated_at) values('unique-import-late-standard','PUBLISHED','54002010',?,?)").run(stamp,stamp);
    db.prepare(`insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,status,admission_decision,effective_at,published_by,published_at,created_at) values('unique-import-late-standard-v1','unique-import-late-standard',1,'试车','984','唯一后来发布标准','右侧独立范围',1.5,'["A320"]','PUBLISHED','INCLUDE',?,'54002010',?,?)`).run(stamp,stamp,stamp);
    const submit=(next,version=draft.version)=>api(`/api/maintenance/flights/${f.id}/reports/nonroutine`,{mode:'submit',items:next,draftVersion:version,revision:report.nonroutine.revision},'PUT');
    const before=snapshot();const unconfirmed=await submit(items);assert.equal(unconfirmed.res.statusCode,409);assert.match(unconfirmed.payload.error,/确认.*标准/);assert.deepEqual(snapshot(),before);
    const chosen=items.map(item=>({...item,standardId:'unique-import-late-standard',standardVersion:1}));
    const saved=await api(`/api/maintenance/flights/${f.id}/reports/nonroutine/draft`,{version:draft.version,items:chosen},'PUT');assert.equal(saved.res.statusCode,200,JSON.stringify(saved.payload));assert.equal(saved.payload.draft.items[0].standardId,'unique-import-late-standard');
    report=(await api(`/api/maintenance/flights/${f.id}/reports`,{},'GET')).payload.report;
    const savedFacts=snapshot();
    db.prepare("update maintenance_standard_versions set status='WITHDRAWN' where id='unique-import-late-standard-v1'").run();
    try{const rejected=await submit(chosen,saved.payload.draft.version);assert.equal(rejected.res.statusCode,409,JSON.stringify(rejected.payload));assert.deepEqual(snapshot(),savedFacts);}finally{db.prepare("update maintenance_standard_versions set status='PUBLISHED' where id='unique-import-late-standard-v1'").run();}
    db.prepare("update maintenance_flights set aircraft_type='B737' where id=?").run(f.id);
    try{const rejected=await submit(chosen,saved.payload.draft.version);assert.equal(rejected.res.statusCode,409,JSON.stringify(rejected.payload));assert.deepEqual(snapshot(),savedFacts);}finally{db.prepare("update maintenance_flights set aircraft_type='A320' where id=?").run(f.id);}
    const account=db.prepare('select status from users where id=?').get(f.user.id);db.prepare("update users set status='inactive' where id=?").run(f.user.id);
    try{const rejected=await submit(chosen,saved.payload.draft.version);assert.equal(rejected.res.statusCode,403,JSON.stringify(rejected.payload));assert.deepEqual(snapshot(),savedFacts);}finally{db.prepare('update users set status=? where id=?').run(account.status,f.user.id);}
    db.prepare(`insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,status,admission_decision,effective_at,published_by,published_at,created_at) values('unique-import-late-standard-v2','unique-import-late-standard',2,'试车','984','唯一后来发布标准','右侧独立范围',2.5,'["A320"]','PUBLISHED','INCLUDE',?,'54002010',?,?)`).run(stamp,stamp,stamp);
    try{const rejected=await submit(chosen,saved.payload.draft.version);assert.equal(rejected.res.statusCode,409,JSON.stringify(rejected.payload));assert.deepEqual(snapshot(),savedFacts);}finally{db.prepare("update maintenance_standard_versions set status='DRAFT' where id='unique-import-late-standard-v2'").run();}
    const originalExec=db.exec;let injected=false;
    db.exec=sql=>{if(!injected&&/^begin immediate$/i.test(String(sql).trim())){injected=true;db.prepare("update maintenance_standard_versions set status='WITHDRAWN' where id='unique-import-late-standard-v1'").run();}return originalExec(sql);};
    try{const rejected=await submit(chosen,saved.payload.draft.version);assert.equal(injected,true);assert.equal(rejected.res.statusCode,409,JSON.stringify(rejected.payload));assert.deepEqual(snapshot(),savedFacts);}finally{db.exec=originalExec;db.prepare("update maintenance_standard_versions set status='PUBLISHED' where id='unique-import-late-standard-v1'").run();}
    const stale=await submit(chosen,draft.version);assert.equal(stale.res.statusCode,409);assert.deepEqual(snapshot(),savedFacts);
    const submitted=await submit(chosen,saved.payload.draft.version);assert.equal(submitted.res.statusCode,200,JSON.stringify(submitted.payload));
    const assessment=db.prepare('select * from maintenance_nonroutine_assessments where flight_id=?').get(f.id);assert.equal(assessment.source_kind,'STANDARD');assert.equal(Number(assessment.effective_hours),1.5);assert.equal(JSON.parse(assessment.standard_json).id,'unique-import-late-standard');assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases where flight_id=?').get(f.id).n),0);
  }finally{flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});

test("imported unlisted text can confirm a newly published candidate in the original draft without starting a review", async () => {
  const f=await supplementalWorkFixture('MULATERSTANDARD');db.prepare("update maintenance_flights set status='已派工',aircraft_type='A320' where id=?").run(f.id);
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED'],previous=flags.map(k=>process.env[k]);
  const api=(path,body,method='POST')=>request(path,{method,cookie:f.cookie,body});
  const noFormal=()=>{for(const table of ['maintenance_subtasks','maintenance_hour_results','maintenance_nonroutine_review_cases','maintenance_nonroutine_assessments'])assert.equal(Number(db.prepare(`select count(*) n from ${table} where flight_id=?`).get(f.id).n),0);};
  try{
    process.env.MUC_MAINTENANCE_V101='draft';process.env.MUC_NONROUTINE_REVIEW_ENABLED='1';process.env.MUC_NONROUTINE_SUBMISSION_ENABLED='1';
    const content='date,aircraftNo,workKind,flightNo,title,chapter,category,content\n2026-09-04,BTEST,停场,MULATERSTANDARD,后来发布的导入标准,987,试车,左侧独立范围';
    const preview=await api('/api/maintenance/subtasks/import/files/preview',{filename:'later-standard.csv',contentBase64:Buffer.from(content).toString('base64')});assert.equal(preview.res.statusCode,200);assert.equal(preview.payload.results[0].status,'READY_NEW_DRAFT');
    const commit=await api(`/api/maintenance/subtasks/import/batches/${preview.payload.batchId}/commit`,{requestId:'later-standard-import',revision:preview.payload.revision,rows:preview.payload.results.map(({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest})=>({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest}))});assert.equal(commit.payload.summary.created,1);
    let draft=(await api(`/api/maintenance/flights/${f.id}/reports`,{},'GET')).payload.report.nonroutine.draft;
    const originalSource=db.prepare('select * from maintenance_nonroutine_import_sources where flight_id=?').get(f.id),assignments=db.prepare('select * from maintenance_assignments where flight_id=? order by id').all(f.id);
    for(let n=0;n<10;n++){const saved=await api(`/api/maintenance/flights/${f.id}/reports/nonroutine/draft`,{version:draft.version,items:draft.items},'PUT');assert.equal(saved.res.statusCode,200,JSON.stringify(saved.payload));draft=saved.payload.draft;noFormal();}
    const stamp='2026-01-01T00:00:00Z';
    for(const [id,hours] of [['later-import-standard-a',1.5],['later-import-standard-b',2.5]]){
      db.prepare("insert into maintenance_standards(id,status,created_by,created_at,updated_at) values(?,'PUBLISHED','54002010',?,?)").run(id,stamp,stamp);
      db.prepare(`insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,status,admission_decision,effective_at,published_by,published_at,created_at) values(?,?,1,'试车','987','后来发布的导入标准','左侧独立范围',?,'["A320"]','PUBLISHED','INCLUDE',?,'54002010',?,?)`).run(id+'-v1',id,hours,stamp,stamp,stamp);
    }
    const current=(await api(`/api/maintenance/flights/${f.id}/reports`,{},'GET')).payload.report;
    const submitItems=draft.items.map(item=>({...item,temporary:true,standardHours:1.5,entries:[{personId:f.user.personId,role:'主做'}]}));
    const ambiguous=await api(`/api/maintenance/flights/${f.id}/reports/nonroutine`,{mode:'submit',items:submitItems,draftVersion:draft.version,revision:current.nonroutine.revision},'PUT');assert.equal(ambiguous.res.statusCode,409);noFormal();
    const chosen=submitItems.map(item=>({...item,standardId:'later-import-standard-a',standardVersion:1}));
    const beforeChoice=db.prepare('select * from maintenance_nonroutine_import_sources where flight_id=?').get(f.id),draftBeforeChoice=db.prepare("select * from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").get(f.id);
    const unchanged=()=>{assert.deepEqual(db.prepare('select * from maintenance_nonroutine_import_sources where flight_id=?').get(f.id),beforeChoice);assert.deepEqual(db.prepare("select * from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").get(f.id),draftBeforeChoice);noFormal();};
    for(const [items,version] of [[chosen,draft.version-1],[chosen.map(item=>({...item,standardVersion:9})),draft.version],[chosen.map(item=>({...item,title:'伪造标准名称'})),draft.version]]){
      const denied=await api(`/api/maintenance/flights/${f.id}/reports/nonroutine/draft`,{version,items},'PUT');assert.equal(denied.res.statusCode,409,JSON.stringify(denied.payload));unchanged();
    }
    const drop=installFailureTrigger('fail_import_standard_choice_audit','maintenance_logs','insert',"new.action='nonroutine_draft_standard_selected'",'injected import standard choice audit failure');
    try{const denied=await api(`/api/maintenance/flights/${f.id}/reports/nonroutine/draft`,{version:draft.version,items:chosen},'PUT');assert.equal(denied.res.statusCode,500,JSON.stringify(denied.payload));unchanged();}finally{drop();}
    const saved=await api(`/api/maintenance/flights/${f.id}/reports/nonroutine/draft`,{version:draft.version,items:chosen},'PUT');assert.equal(saved.res.statusCode,200,JSON.stringify(saved.payload));
    assert.equal(saved.payload.draft.items[0].standardId,'later-import-standard-a');assert.equal(saved.payload.draft.items[0].standardSnapshot.standardHours,1.5);noFormal();
    const selectedSource=db.prepare('select * from maintenance_nonroutine_import_sources where flight_id=?').get(f.id);assert.equal(selectedSource.fingerprint,originalSource.fingerprint);assert.equal(selectedSource.client_id,originalSource.client_id);assert.equal(selectedSource.original_json,originalSource.original_json);assert.equal(selectedSource.state,'ACTIVE');assert.equal(JSON.parse(selectedSource.standard_snapshot_json).id,'later-import-standard-a');
    const reopened=(await api(`/api/maintenance/flights/${f.id}/reports`,{},'GET')).payload.report;assert.equal(reopened.nonroutine.draft.items[0].standardId,'later-import-standard-a');
    const submitted=await api(`/api/maintenance/flights/${f.id}/reports/nonroutine`,{mode:'submit',items:chosen,draftVersion:saved.payload.draft.version,revision:reopened.nonroutine.revision},'PUT');assert.equal(submitted.res.statusCode,200,JSON.stringify(submitted.payload));
    const assessment=db.prepare('select * from maintenance_nonroutine_assessments where flight_id=?').get(f.id);assert.equal(assessment.source_kind,'STANDARD');assert.equal(Number(assessment.effective_hours),1.5);assert.equal(JSON.parse(assessment.standard_json).id,'later-import-standard-a');assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases where flight_id=?').get(f.id).n),0);
    assert.deepEqual(db.prepare('select * from maintenance_assignments where flight_id=? order by id').all(f.id),assignments);
  }finally{flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});

test("locked imported reports reject stale previews and new files without changing submitted or confirmed source history", async () => {
  const f = await supplementalWorkFixture("MUIMPORTLOCKHISTORY");
  db.prepare("update maintenance_flights set status='已派工',aircraft_type='A320' where id=?").run(f.id);
  const flags = ["MUC_MAINTENANCE_V101", "MUC_NONROUTINE_REVIEW_ENABLED", "MUC_NONROUTINE_SUBMISSION_ENABLED"];
  const previous = flags.map(key => process.env[key]);
  const post = (url, body) => request(url, { method: "POST", cookie: f.cookie, body });
  const importUrl = "/api/maintenance/subtasks/import/files/preview";
  const batchUrl = id => `/api/maintenance/subtasks/import/batches/${id}`;
  const content = "date,aircraftNo,workKind,flightNo,title,chapter,category,content\n2026-09-04,BTEST,停场,MUIMPORTLOCKHISTORY,导入锁定历史检查,991,单项工作,唯一左侧检查范围";
  const file = { filename: "locked-history.csv", contentBase64: Buffer.from(content).toString("base64") };
  const payload = (view, requestId) => ({ requestId, revision: view.revision,
    rows: view.results.map(({ rowNumber, flightId, expectedUpdatedAt, draftVersion, matchDigest }) => ({ rowNumber, flightId, expectedUpdatedAt, draftVersion, matchDigest })) });
  const snapshot = () => {
    const result = Object.fromEntries(["maintenance_flights", "maintenance_subtasks", "maintenance_assignments", "maintenance_report_drafts", "maintenance_report_batches", "maintenance_report_entries", "maintenance_hour_results", "maintenance_sortie_results", "maintenance_nonroutine_import_sources", "maintenance_nonroutine_review_cases", "maintenance_nonroutine_assessments", "maintenance_report_source_journal"]
      .map(table => [table, db.prepare(`select * from ${table} where ${table === "maintenance_flights" ? "id" : "flight_id"}=? order by ${table === "maintenance_nonroutine_import_sources" ? "fingerprint" : table === "maintenance_nonroutine_assessments" ? "subtask_id" : "id"}`).all(f.id)]));
    for (const table of ["maintenance_nonroutine_review_channels", "maintenance_nonroutine_review_events"])
      result[table] = db.prepare(`select * from ${table} where case_id in (select id from maintenance_nonroutine_review_cases where flight_id=?) order by id`).all(f.id);
    return result;
  };
  try {
    process.env.MUC_MAINTENANCE_V101 = "draft";
    process.env.MUC_NONROUTINE_REVIEW_ENABLED = "1";
    process.env.MUC_NONROUTINE_SUBMISSION_ENABLED = "1";
    const first = await post(importUrl, file);
    assert.equal(first.res.statusCode, 200, JSON.stringify(first.payload));
    const commitBody = payload(first.payload, "locked-history-first");
    const committed = await post(`${batchUrl(first.payload.batchId)}/commit`, commitBody);
    assert.equal(committed.payload.summary.created, 1, JSON.stringify(committed.payload));
    const stale = await post(importUrl, { ...file, filename: "before-submit.csv", contentBase64: Buffer.from(content.replace("导入锁定历史检查", "提报前独立预览工作").replace("唯一左侧检查范围", "独立右侧电气检查范围").replace(",991,", ",992,")).toString("base64") });
    assert.equal(stale.payload.summary.ready, 1, JSON.stringify(stale.payload));
    const staleBody = payload(stale.payload, "locked-history-stale");
    const report = (await request(`/api/maintenance/flights/${f.id}/reports`, { cookie: f.cookie })).payload.report;
    const items = report.nonroutine.draft.items.map(item => ({ ...item, temporary: true, standardHours: 2, entries: [{ personId: f.user.personId, role: "主做" }] }));
    const submitted = await request(`/api/maintenance/flights/${f.id}/reports/nonroutine`, { method: "PUT", cookie: f.cookie,
      body: { mode: "submit", items, draftVersion: report.nonroutine.draft.version, revision: report.nonroutine.revision } });
    assert.equal(submitted.res.statusCode, 200, JSON.stringify(submitted.payload));
    const source = db.prepare("select * from maintenance_nonroutine_import_sources where flight_id=?").get(f.id);
    assert.equal(source.state, "SUBMITTED");
    assert.ok(source.subtask_id);
    const assertLocked = async phase => {
      const before = snapshot();
      const replay = await post(`${batchUrl(first.payload.batchId)}/commit`, commitBody);
      assert.equal(replay.res.statusCode, 200, JSON.stringify(replay.payload));
      assert.equal(replay.payload.replayed, true);
      assert.equal(replay.payload.results[0].status, "SUBMITTED");
      assert.equal(replay.payload.results[0].subtaskId, source.subtask_id);
      const renamed = await post(importUrl, { ...file, filename: `${phase}-renamed.csv` });
      assert.equal(renamed.payload.results[0].status, "SUBMITTED");
      assert.equal(renamed.payload.results[0].subtaskId, source.subtask_id);
      const changedFile = await post(importUrl, { ...file, contentBase64: Buffer.from(content + "\n").toString("base64") });
      assert.equal(changedFile.payload.results[0].status, "BLOCKED");
      assert.match(changedFile.payload.results[0].reason, /已锁定.*只读.*不能.*导入/);
      assert.ok(changedFile.payload.results[0].duplicates.some(row => row.id === source.subtask_id));
      const decide = await request(`${batchUrl(changedFile.payload.batchId)}/rows/2`, { method: "PUT", cookie: f.cookie, body: { revision: changedFile.payload.revision, distinctWorkReason: "试图绕过已提报锁定" } });
      assert.equal(decide.res.statusCode, 409, JSON.stringify(decide.payload));
      const rejected = await post(`${batchUrl(changedFile.payload.batchId)}/commit`, payload(changedFile.payload, `locked-history-${phase}`));
      assert.equal(rejected.res.statusCode, 200, JSON.stringify(rejected.payload));
      assert.equal(rejected.payload.summary.created, 0);
      assert.equal(rejected.payload.results[0].status, "NEEDS_REVIEW");
      const staleCommit = await post(`${batchUrl(stale.payload.batchId)}/commit`, staleBody);
      assert.equal(staleCommit.res.statusCode, 200, JSON.stringify(staleCommit.payload));
      assert.equal(staleCommit.payload.summary.created, 0);
      assert.equal(staleCommit.payload.results[0].status, "NEEDS_REVIEW");
      assert.deepEqual(snapshot(), before);
    };
    await assertLocked("submitted");
    const current = (await request(`/api/maintenance/flights/${f.id}/reports`, { cookie: f.cookie })).payload.report;
    const finalized = await f.report({ nonroutineItems: current.nonroutine.items.map(item => ({ ...item, standardHours: item.hourAssessment.requestedHours })) });
    assert.equal(finalized.res.statusCode, 200, JSON.stringify(finalized.payload));
    assert.equal(finalized.payload.flight.status, "待复核");
    await assertLocked("reviewing");
    const confirmed = await f.putReview({ mode: "confirm", routineElectronicSigned: false, nonroutineElectronicSigned: false });
    assert.equal(confirmed.res.statusCode, 200, JSON.stringify(confirmed.payload));
    assert.equal(confirmed.payload.review.flight.status, "已确认");
    await assertLocked("confirmed");
  } finally {
    flags.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});

test("imported formal reports create one case and reserved channel per unlisted item without posting pending hours through finalization and review", async () => {
  const f = await supplementalWorkFixture("MUNRFORMAL");
  db.prepare("update maintenance_flights set status='已派工',aircraft_type='A320' where id=?").run(f.id);
  const flags = ["MUC_MAINTENANCE_V101","MUC_NONROUTINE_REVIEW_ENABLED","MUC_NONROUTINE_SUBMISSION_ENABLED"];
  const previous = flags.map(key=>process.env[key]);
  const call = (url,body) => request(url,{method:"POST",cookie:f.cookie,body});
  try {
    process.env.MUC_MAINTENANCE_V101="draft";
    process.env.MUC_NONROUTINE_REVIEW_ENABLED="1";
    process.env.MUC_NONROUTINE_SUBMISSION_ENABLED="1";
    const content = ["date,aircraftNo,workKind,flightNo,title,chapter,category,content,standardHours",
      `2026-09-04,BTEST,停场,MUNRFORMAL,新液压功能测试,991,单项工作,左侧独立测试,9999`,
      `2026-09-04,BTEST,停场,MUNRFORMAL,新三方独立测试,992,三方附加,右侧独立测试,9999`,
      `2026-09-04,BTEST,停场,MUNRFORMAL,新除冰独立测试,993,人工除冰,外侧独立测试,9999`].join("\n");
    const preview = await call("/api/maintenance/subtasks/import/files/preview",{filename:"formal.csv",contentBase64:Buffer.from(content).toString("base64")});
    assert.equal(preview.res.statusCode,200,JSON.stringify(preview.payload));
    const commit = await call(`/api/maintenance/subtasks/import/batches/${preview.payload.batchId}/commit`,{requestId:"formal-commit-one",revision:preview.payload.revision,
      rows:preview.payload.results.map(({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest})=>({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest}))});
    assert.equal(commit.payload.summary.created,3,JSON.stringify(commit.payload));
    const view = (await request(`/api/maintenance/flights/${f.id}/reports`,{cookie:f.cookie})).payload.report;
    assert.equal(view.nonroutine.importedDraftSubmissionReady,true);
    const draft = view.nonroutine.draft;
    const submit = items => request(`/api/maintenance/flights/${f.id}/reports/nonroutine`,{method:"PUT",cookie:f.cookie,
      body:{mode:"submit",items,draftVersion:draft.version,revision:view.nonroutine.revision}});
    const items = draft.items.map((item,index)=>({...item,temporary:true,standardHours:index+2,
      entries:[{personId:f.user.personId,role:"主做"},...(index===1?[{personId:f.user.personId,role:"检验"}]:[])]}));
    assert.equal((await submit(items.slice(1))).res.statusCode,409);
    assert.equal((await submit(items.map((item,index)=>index===2?{...item,reportExplanation:""}:item))).res.statusCode,400);
    assert.equal(Number(db.prepare("select count(*) n from maintenance_subtasks where flight_id=?").get(f.id).n),0);
    assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_review_cases where flight_id=?").get(f.id).n),0);
    const dropFormalFailure=installFailureTrigger('fail_formal_source','maintenance_nonroutine_import_sources','update',`new.flight_id='${f.id}' and new.client_id='${items[2].clientId}' and new.state='SUBMITTED'`,'injected formal source failure');
    try {
      assert.ok((await submit(items)).res.statusCode>=400);
      assert.equal(Number(db.prepare("select count(*) n from maintenance_subtasks where flight_id=?").get(f.id).n),0);
      assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_review_cases where flight_id=?").get(f.id).n),0);
      assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_assessments where flight_id=?").get(f.id).n),0);
      assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_review_channels ch join maintenance_nonroutine_review_cases c on c.id=ch.case_id where c.flight_id=?").get(f.id).n),0);
      assert.ok(db.prepare("select state from maintenance_nonroutine_import_sources where flight_id=?").all(f.id).every(item=>item.state==='ACTIVE'));
      assert.equal(Number(db.prepare("select version from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").get(f.id).version),draft.version);
    } finally { dropFormalFailure(); }
    const metricsBeforeEstimates = (await request("/api/maintenance/stats/personal?month=2026-09", { cookie: f.cookie })).payload.metrics;
    const submitted = await submit(items);
    assert.equal(submitted.res.statusCode,200,JSON.stringify(submitted.payload));
    const cases = db.prepare("select * from maintenance_nonroutine_review_cases where flight_id=? order by subtask_id").all(f.id);
    assert.equal(cases.length,3);
    const personalReview = await request("/api/maintenance/stats/personal?month=2026-09", { cookie: f.cookie });
    assert.equal(personalReview.res.statusCode, 200, JSON.stringify(personalReview.payload));
    assert.deepEqual(personalReview.payload.metrics, metricsBeforeEstimates);
    const ownApplications = personalReview.payload.underReview.items.filter(item => item.opportunityId === f.id);
    assert.equal(ownApplications.length, 3);
    assert.ok(ownApplications.every(item => item.submittedOpinions === 0 && item.requiredOpinions === 12));
    assert.ok(ownApplications.every(item => item.estimatedHours === null || Number.isFinite(item.estimatedHours)));
    assert.ok(!JSON.stringify(ownApplications).includes("participants_json"));

    assert.equal(new Set(cases.map(item=>item.subtask_id)).size,3);
    assert.ok(cases.every(item=>item.state==='PENDING_ACCEPTANCE' && item.accepted_at===null));
    assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_review_channels where case_id in (select id from maintenance_nonroutine_review_cases where flight_id=?) and state='WAITING_REVIEW'").get(f.id).n),3);
    assert.ok(db.prepare("select standard_hours from maintenance_subtasks where flight_id=?").all(f.id).every(item=>item.standard_hours===null));
    assert.ok(db.prepare("select standard_hours from maintenance_report_entries where flight_id=? and owner_type='subtask'").all(f.id).every(item=>item.standard_hours===null));
    assert.ok(db.prepare("select state,subtask_id from maintenance_nonroutine_import_sources where flight_id=?").all(f.id).every(item=>item.state==='SUBMITTED' && item.subtask_id));
    assert.equal((await submit(items)).res.statusCode,409);
    const assertNoHours = () => assert.equal(Number(db.prepare("select count(*) n from maintenance_hour_results where flight_id=?").get(f.id).n),0);
    assertNoHours();
    const report = (await request(`/api/maintenance/flights/${f.id}/reports`,{cookie:f.cookie})).payload.report;
    assert.ok(report.nonroutine.items.every(item=>item.standardHours===null && item.hourAssessment.pending));
    const equal = report.nonroutine.items.find(item=>item.category==='三方附加').hourAssessment;
    assert.deepEqual(equal.personalEstimates,[{personId:f.user.personId,hours:3}]);
    const undecided = report.nonroutine.items.find(item=>item.category==='人工除冰').hourAssessment;
    assert.equal(undecided.estimateUnavailable,true);
    assert.deepEqual(undecided.personalEstimates,[{personId:f.user.personId,hours:null}]);
    const finalized = await f.report({nonroutineItems:report.nonroutine.items.map(item=>({...item,standardHours:item.hourAssessment.requestedHours}))});
    assert.equal(finalized.res.statusCode,200,JSON.stringify(finalized.payload));
    assert.equal(finalized.payload.flight.status,'待复核');
    assertNoHours();
    const confirmed = await f.putReview({mode:'confirm',routineElectronicSigned:false,nonroutineElectronicSigned:false});
    assert.equal(confirmed.res.statusCode,200,JSON.stringify(confirmed.payload));
    assert.equal(confirmed.payload.review.flight.status,'已确认');
    assertNoHours();
    assert.ok(db.prepare("select status from maintenance_assignments where flight_id=?").all(f.id).every(item=>item.status==='已确认'));
    assert.deepEqual(db.prepare("select * from maintenance_nonroutine_review_cases where flight_id=? order by subtask_id").all(f.id),cases);
    assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_assessments where flight_id=? and effective_hours is null").get(f.id).n),3);
    const tree = await f.getReview();
    const tasks = tree.tasks.map(task=>({ownerType:task.ownerType,ownerId:task.ownerId,assignments:task.assignments.map(person=>({personId:person.personId,role:person.role}))}));
    const changed = tasks.find(task=>task.ownerType==='subtask' && task.assignments.length===1);
    changed.assignments[0].role='检验';
    const sourceAssignmentsBefore=db.prepare('select * from maintenance_assignments where flight_id=? order by id').all(f.id);
    const auditRollback=installFailureTrigger('fail_source_fact_audit','maintenance_nonroutine_review_events','insert',"new.event_type='SOURCE_FACTS_CHANGED'",'injected source fact audit failure');
    try{assert.equal((await f.putReview({reason:'核对实际角色',tasks})).res.statusCode,500);assert.deepEqual(db.prepare('select * from maintenance_assignments where flight_id=? order by id').all(f.id),sourceAssignmentsBefore);}finally{auditRollback();}
    const archive = await f.putReview({reason:'核对实际角色',tasks});
    assert.equal(archive.res.statusCode,200,JSON.stringify(archive.payload));
    assertNoHours();
    assert.deepEqual(db.prepare("select * from maintenance_nonroutine_review_cases where flight_id=? order by subtask_id").all(f.id),cases);
    const changedCase=cases.find(item=>item.subtask_id===changed.ownerId),baselineEvents=db.prepare("select * from maintenance_nonroutine_review_events where case_id=? and event_type='SOURCE_FACTS_BASELINE'").all(changedCase.id);assert.equal(baselineEvents.length,1);
    const sourceChanges=db.prepare("select * from maintenance_nonroutine_review_events where case_id=? and event_type='SOURCE_FACTS_CHANGED'").all(changedCase.id);assert.equal(sourceChanges.length,1);assert.equal(JSON.parse(sourceChanges[0].detail_json).reason,'核对实际角色');
    const changedProjection=await request(`/api/maintenance/nonroutine-reviews/${changedCase.id}`,{cookie:f.cookie});assert.equal(changedProjection.res.statusCode,200);assert.equal(changedProjection.payload.review.sourceFacts.changed,true);assert.equal(changedProjection.payload.review.sourceFacts.participantsChanged,true);assert.equal(changedProjection.payload.review.application.title,JSON.parse(changedCase.application_json).title);

    db.prepare("update maintenance_nonroutine_review_channels set state='CANCELLED_CLOSED' where case_id=?").run(cases[0].id);
    const invalidSource = await request(`/api/maintenance/flights/${f.id}/review`,{cookie:f.cookie});
    assert.equal(invalidSource.res.statusCode,409);
  db.prepare("update maintenance_nonroutine_review_channels set state='WAITING_REVIEW' where case_id=?").run(cases[0].id);
    const cancellationBefore={flight:db.prepare('select * from maintenance_flights where id=?').get(f.id),tasks:db.prepare('select * from maintenance_subtasks where flight_id=? order by id').all(f.id),cases:db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=? order by id').all(f.id),channels:db.prepare('select * from maintenance_nonroutine_review_channels where case_id in (select id from maintenance_nonroutine_review_cases where flight_id=?) order by id').all(f.id)};
    const cancelRollback=installFailureTrigger('fail_source_cancel_audit','maintenance_nonroutine_review_events','insert',"new.event_type='CANCELLED_BY_SOURCE_REMOVAL'",'injected cancellation audit failure');
    try{
      const failed=await request(`/api/maintenance/flights/${f.id}`,{method:'DELETE',cookie:f.cookie,body:{reason:'隔离库验证取消审计失败回滚'}});assert.equal(failed.res.statusCode,500);
      assert.deepEqual(db.prepare('select * from maintenance_flights where id=?').get(f.id),cancellationBefore.flight);
      assert.deepEqual(db.prepare('select * from maintenance_subtasks where flight_id=? order by id').all(f.id),cancellationBefore.tasks);
      assert.deepEqual(db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=? order by id').all(f.id),cancellationBefore.cases);
      assert.deepEqual(db.prepare('select * from maintenance_nonroutine_review_channels where case_id in (select id from maintenance_nonroutine_review_cases where flight_id=?) order by id').all(f.id),cancellationBefore.channels);
    }finally{cancelRollback();}
    const directCase=cases[0],directPath=`/api/maintenance/subtasks/${directCase.subtask_id}`,directReason='隔离库验证待审单项单独作废';
    db.prepare('update maintenance_nonroutine_assessments set effective_hours=0 where subtask_id=?').run(directCase.subtask_id);
    try{assert.equal((await request(directPath,{method:'DELETE',cookie:f.cookie,body:{reason:directReason}})).res.statusCode,409);assert.ok(db.prepare('select id from maintenance_subtasks where id=?').get(directCase.subtask_id));}finally{db.prepare('update maintenance_nonroutine_assessments set effective_hours=null where subtask_id=?').run(directCase.subtask_id);}
    const directRollback=installFailureTrigger('fail_direct_cancel_audit','maintenance_nonroutine_review_events','insert',"new.event_type='CANCELLED_BY_SOURCE_REMOVAL'",'injected direct cancellation audit failure');
    try{
      assert.equal((await request(directPath,{method:'DELETE',cookie:f.cookie,body:{reason:directReason}})).res.statusCode,500);
      assert.deepEqual(db.prepare('select * from maintenance_subtasks where flight_id=? order by id').all(f.id),cancellationBefore.tasks);
      assert.deepEqual(db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=? order by id').all(f.id),cancellationBefore.cases);
      assert.deepEqual(db.prepare('select * from maintenance_nonroutine_review_channels where case_id in (select id from maintenance_nonroutine_review_cases where flight_id=?) order by id').all(f.id),cancellationBefore.channels);
      assert.equal(db.prepare('select state from maintenance_nonroutine_import_sources where subtask_id=?').get(directCase.subtask_id).state,'SUBMITTED');
    }finally{directRollback();}
    const directlyDeleted=await request(directPath,{method:'DELETE',cookie:f.cookie,body:{reason:directReason}});assert.equal(directlyDeleted.res.statusCode,200,JSON.stringify(directlyDeleted.payload));assert.equal(directlyDeleted.payload.flight.status,'已确认');
    assert.equal(db.prepare('select id from maintenance_subtasks where id=?').get(directCase.subtask_id),undefined);
    assert.equal(db.prepare('select state from maintenance_nonroutine_import_sources where subtask_id=?').get(directCase.subtask_id).state,'DELETED');
    const deleted = await request(`/api/maintenance/flights/${f.id}`,{method:'DELETE',cookie:f.cookie,body:{reason:'隔离库验证待审来源随机会作废'}});
    assert.equal(deleted.res.statusCode,200,JSON.stringify(deleted.payload));
    assert.ok(db.prepare("select state from maintenance_nonroutine_review_cases where flight_id=?").all(f.id).every(item=>item.state==='CANCELLED'));
    assert.ok(db.prepare("select state from maintenance_nonroutine_review_channels where case_id in (select id from maintenance_nonroutine_review_cases where flight_id=?)").all(f.id).every(item=>item.state==='CANCELLED_CLOSED'));
    assert.ok(db.prepare("select state from maintenance_nonroutine_import_sources where flight_id=?").all(f.id).every(item=>item.state==='DELETED'));
    for(const item of cases){const cancelled=db.prepare("select * from maintenance_nonroutine_review_events where case_id=? and event_type='CANCELLED_BY_SOURCE_REMOVAL'").all(item.id);assert.equal(cancelled.length,1);const detail=JSON.parse(cancelled[0].detail_json);assert.equal(detail.sourceAction,item.id===directCase.id?'SUBTASK_REMOVAL':'OPPORTUNITY_REMOVAL');assert.equal(detail.qualification.accountId,f.user.id);assert.equal(detail.reason,item.id===directCase.id?directReason:'隔离库验证待审来源随机会作废');assert.equal(detail.ledgerChanged,false);}
  } finally {
    flags.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});
  }
});

test("imported published standards keep frozen values, equal unique people and explicit zero alongside legacy work", async () => {
  const f = await supplementalWorkFixture("MUNRSTANDARD");
  db.prepare("update maintenance_flights set status='已派工',aircraft_type='A320' where id=?").run(f.id);
  const legacy = await request(`/api/maintenance/flights/${f.id}/subtasks`,{method:'POST',cookie:f.cookie,body:{title:'原正式项目',category:'其他',standardHours:2}});
  assert.equal(legacy.res.statusCode,201,JSON.stringify(legacy.payload));
  const legacyTask = db.prepare("select * from maintenance_subtasks where flight_id=?").get(f.id);
  db.prepare("update maintenance_flights set status='已派工' where id=?").run(f.id);
  const other = createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'nr-standard-other',name:'标准参与人'});
  const flags = ['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED'];
  const previous = flags.map(key=>process.env[key]);
  const standards = ['拖机','三方附加','试车'].map((category,index)=>({id:`formal-standard-${index}`,category,chapter:`99${index+5}`,title:`独立已收录项目${index}`,scope:`标准施工范围${index}`,hours:index===2?0:1.5}));
  try {
    process.env.MUC_MAINTENANCE_V101='draft';process.env.MUC_NONROUTINE_REVIEW_ENABLED='1';process.env.MUC_NONROUTINE_SUBMISSION_ENABLED='1';
    const stamp='2026-01-01T00:00:00Z';
    for(const item of standards) {
      db.prepare("insert into maintenance_standards(id,status,created_by,created_at,updated_at) values(?,'PUBLISHED','54002010',?,?)").run(item.id,stamp,stamp);
      db.prepare(`insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,status,admission_decision,effective_at,published_by,published_at,created_at)
        values(?,?,1,?,?,?,?,?,'["A320"]','PUBLISHED','INCLUDE',?,'54002010',?,?)`).run(`${item.id}-v1`,item.id,item.category,item.chapter,item.title,item.scope,item.hours,stamp,stamp,stamp);
    }
    const content=['date,aircraftNo,workKind,flightNo,title,chapter,category,content',...standards.map(item=>`2026-09-04,BTEST,停场,MUNRSTANDARD,${item.title},${item.chapter},${item.category},${item.scope}`)].join('\n');
    const preview=await request('/api/maintenance/subtasks/import/files/preview',{method:'POST',cookie:f.cookie,body:{filename:'standard.csv',contentBase64:Buffer.from(content).toString('base64')}});
    assert.ok(preview.payload.results.every(item=>item.status==='READY_STANDARD'),JSON.stringify(preview.payload));
    const commit=await request(`/api/maintenance/subtasks/import/batches/${preview.payload.batchId}/commit`,{method:'POST',cookie:f.cookie,body:{requestId:'standard-formal-commit',revision:preview.payload.revision,
      rows:preview.payload.results.map(({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest})=>({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest}))}});
    assert.equal(commit.payload.summary.created,3,JSON.stringify(commit.payload));
    const report=(await request(`/api/maintenance/flights/${f.id}/reports`,{cookie:f.cookie})).payload.report;
    const imported=report.nonroutine.draft.items.map(item=>({...item,temporary:true,entries:[{personId:f.user.personId,role:'主做'},{personId:other.personId,role:'主做'},...(item.category==='三方附加'?[{personId:f.user.personId,role:'检验'}]:[])]}));
    const items=[{id:legacyTask.id,title:legacyTask.title,category:'其他',standardHours:2,entries:[{personId:f.user.personId,role:'主做'}]},...imported];
    const submit=next=>request(`/api/maintenance/flights/${f.id}/reports/nonroutine`,{method:'PUT',cookie:f.cookie,body:{mode:'submit',items:next,draftVersion:report.nonroutine.draft.version,revision:report.nonroutine.revision}});
    assert.equal((await submit(items.map((item,index)=>index===1?{...item,standardHours:9999}:item))).res.statusCode,409);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_assessments where flight_id=?').get(f.id).n),0);
    const submitted=await submit(items);
    assert.equal(submitted.res.statusCode,200,JSON.stringify(submitted.payload));
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases where flight_id=?').get(f.id).n),0);
    assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_assessments where flight_id=? and source_kind='STANDARD'").get(f.id).n),3);
    const assertBudget=()=>assert.equal(Number(db.prepare('select sum(hours) hours from maintenance_hour_results where flight_id=?').get(f.id).hours),5);
    assertBudget();
    const equalTask=db.prepare("select id from maintenance_subtasks where flight_id=? and category='三方附加'").get(f.id);
    const personTotals=db.prepare("select person_id,sum(hours) hours from maintenance_hour_results where owner_type='subtask' and owner_id=? group by person_id").all(equalTask.id);
    assert.ok(personTotals.every(item=>Number(item.hours)===0.75));
    const current=(await request(`/api/maintenance/flights/${f.id}/reports`,{cookie:f.cookie})).payload.report;
    const zero=current.nonroutine.items.find(item=>item.category==='试车');
    assert.equal(zero.standardHours,0);assert.equal(zero.hourAssessment.pending,false);
    assert.equal((await f.report({nonroutineItems:current.nonroutine.items.map(item=>item.id===zero.id?{...item,title:'偷偷改标准'}:item)})).res.statusCode,409);
    assert.equal((await f.report({nonroutineItems:current.nonroutine.items})).res.statusCode,200);
    assertBudget();
    const confirmed=await f.putReview({mode:'confirm',routineElectronicSigned:false,nonroutineElectronicSigned:false});
    assert.equal(confirmed.res.statusCode,200,JSON.stringify(confirmed.payload));assertBudget();
    assert.ok(db.prepare('select status from maintenance_hour_results where flight_id=?').all(f.id).every(item=>item.status==='已确认'));
  } finally {
    flags.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});
    for(const standard of standards)db.prepare("update maintenance_standards set status='DISABLED' where id=?").run(standard.id);
  }
});

test('standard management APIs default off and enforce full scope, immutable publication gates and request replay',async()=>{
  const flag=process.env.MUC_STANDARDS_MANAGEMENT_ENABLED;
  const rootLogin=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}});
  const cookie=String(rootLogin.res.headers['Set-Cookie']).split(';')[0];
  const template=db.prepare("select * from users where id='54002010'").get(),worker=createMaintenanceTestAccount(template,{id:'standard-management-worker',name:'标准管理隔离测试'});
  const loginWorker=async()=>{const result=await request('/api/login',{method:'POST',body:{username:worker.username,password:'muc2026'}});return String(result.res.headers['Set-Cookie']).split(';')[0];};
  const url='/api/maintenance/standard-management';
  try{
    delete process.env.MUC_STANDARDS_MANAGEMENT_ENABLED;assert.equal((await request(url,{cookie})).res.statusCode,404);
    assert.equal((await request('/api/maintenance/standard-management-capabilities',{cookie})).payload.enabled,false);
    process.env.MUC_STANDARDS_MANAGEMENT_ENABLED='1';assert.equal((await request(url)).res.statusCode,401);
    assert.equal((await request(url,{cookie:await loginWorker()})).res.statusCode,403);
    assert.equal((await request('/api/maintenance/standard-management-capabilities',{cookie:await loginWorker()})).res.statusCode,403);
    const role=db.prepare("select id from rbac_roles where code='addon_maintenance_standard_manager'").get();assert.ok(role);
    db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(worker.id,role.id,new Date().toISOString());
    db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=? and module='maintenance'").run(worker.id);
    assert.equal((await request(url,{cookie:await loginWorker()})).res.statusCode,403);
    db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(worker.id);
    const managerCookie=await loginWorker();assert.equal((await request(url,{cookie:managerCookie})).res.statusCode,200);
    assert.equal((await request('/api/maintenance/standard-management-capabilities',{cookie:managerCookie})).payload.enabled,true);
    const body={clientId:'api-standard-create',reason:'测试标准草稿',definition:{category:'单项工作',chapter:'29',title:'标准日常管理API隔离样例',workScope:'左侧',standardHours:0,aircraftCodes:['A320'],genericAircraft:false}};
    const created=await request(url,{method:'POST',cookie:managerCookie,body});assert.equal(created.res.statusCode,200,JSON.stringify(created.payload));
    assert.equal(created.payload.standard.status,'DRAFT');assert.equal(created.payload.versions[0].admission_decision,'PENDING');assert.equal(created.payload.versions[0].published_at,null);
    assert.equal(created.payload.versions[0].capabilities.update,true);assert.equal(created.payload.versions[0].capabilities.revise,false);
    const replay=await request(url,{method:'POST',cookie:managerCookie,body});assert.equal(replay.payload.standard.id,created.payload.standard.id);assert.equal(replay.payload.operation.replayed,true);
    const id=created.payload.standard.id,versionId=created.payload.versions[0].id;
    const update={clientId:'api-standard-update',revision:1,versionId,reason:'规范范围',definition:{...body.definition,workScope:'右侧'}};
    assert.equal((await request(`${url}/${id}/update`,{method:'POST',cookie:managerCookie,body:update})).res.statusCode,200);
    assert.equal((await request(`${url}/${id}/update`,{method:'POST',cookie:managerCookie,body:{...update,clientId:'api-stale'}})).res.statusCode,409);
    assert.equal((await request(`${url}/${id}/update`,{method:'POST',cookie:managerCookie,body:{...update,revision:2,clientId:'api-inject',published_by:worker.id}})).res.statusCode,400);
    const listed=await request(`${url}?search=${encodeURIComponent(body.definition.title)}`,{cookie:managerCookie});assert.ok(listed.payload.items.some(item=>item.id===id));
    const withdrawn=await request(`${url}/${id}/withdraw`,{method:'POST',cookie:managerCookie,body:{clientId:'api-withdraw',revision:2,versionId,reason:'撤回隔离测试草稿'}});assert.equal(withdrawn.res.statusCode,200);assert.equal(withdrawn.payload.standard.status,'DISABLED');
    assert.equal(withdrawn.payload.history.length,3);assert.equal(withdrawn.payload.versions[0].status,'WITHDRAWN');
  }finally{if(flag===undefined)delete process.env.MUC_STANDARDS_MANAGEMENT_ENABLED;else process.env.MUC_STANDARDS_MANAGEMENT_ENABLED=flag;}
});

test('standard publication foundation uses explicit synthetic authority while publisher role remains unassigned and public writes default off',async t=>{
  const tables=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_nonroutine_hour_adjustments','maintenance_nonroutine_role_results','maintenance_nonroutine_review_cases','maintenance_nonroutine_review_channels'];
  const facts=()=>tables.map(table=>JSON.stringify(db.prepare(`select * from ${table} order by id`).all()));
  const finalizer=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'publication-foundation-finalizer',name:'发布基础隔离终审'});
  db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(finalizer.id,db.prepare("select id from rbac_roles where code='addon_nonroutine_review_finalizer'").get().id,new Date().toISOString());
  db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(finalizer.id);
  const before=facts(),f=publicationFixture(t,{db,accounts:{finalizer}}),admitted=f.admit();
  assert.equal(f.catalog.list({aircraftCode:'A320'}).items.some(item=>item.id===f.id),false);
  const publication=f.publish(admitted.result.admission.id);assert.equal(publication.result.source.decision.recognizedHours,0);
  assert.equal(f.catalog.list({aircraftCode:'A320'}).items.find(item=>item.id===f.id).standardHours,0);
  const payload={revision:f.getRevision(),versionId:f.versionId,clientId:'must-not-reuse-source',reason:'锁定后不可变更',decision:'EXCLUDE'};
  assert.throws(()=>f.service.admit(f.id,payload,f.publisher),{status:409});assert.deepEqual(facts(),before);
  assert.equal(Number(db.prepare("select count(*) n from rbac_permissions where code='maintenance.standard.publish'").get().n),1);
  assert.equal(Number(db.prepare("select count(*) n from rbac_user_roles ur join rbac_roles r on r.id=ur.role_id where r.code='addon_maintenance_standard_publisher'").get().n),0);
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
  assert.equal((await request(`/api/maintenance/standard-publications/${f.id}`,{method:'POST',cookie,body:{}})).res.statusCode,404);
  f.publisher.active=false;assert.throws(()=>f.service.view(f.id,f.versionId,f.publisher),{status:403});
});

test('independent standard review APIs reuse private twelve-person rounds without opportunity or ledger writes or automatic publication',async()=>{
  const standardFlags=['MUC_STANDARDS_MANAGEMENT_ENABLED','MUC_STANDARDS_REVIEW_ENABLED','MUC_STANDARDS_NOTIFICATIONS_ENABLED','MUC_STANDARDS_PUBLICATION_ENABLED'],previous=standardFlags.map(key=>process.env[key]),template=db.prepare("select * from users where id='54002010'").get();
  const login=async username=>{const result=await request('/api/login',{method:'POST',body:{username,password:'muc2026'}});assert.equal(result.res.statusCode,200);return String(result.res.headers['Set-Cookie']).split(';')[0];};
  const cookie=await login('54002010');
  const assign=(account,code,full=false)=>{db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(account.id,db.prepare('select id from rbac_roles where code=?').get(code).id,new Date().toISOString());if(full)db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(account.id);};
  const members=Array.from({length:12},(_,index)=>{const user=createMaintenanceTestAccount(template,{id:`std-review-member-${index}`,name:`独立标准评议${index}`});assign(user,'addon_nonroutine_reviewer');return user;});
  const finalizer=createMaintenanceTestAccount(template,{id:'std-review-finalizer',name:'独立标准终审'});assign(finalizer,'addon_nonroutine_review_finalizer',true);
  const outsider=createMaintenanceTestAccount(template,{id:'std-review-outsider',name:'独立标准无关账户'});
  const publisher=createMaintenanceTestAccount(template,{id:'standard-publisher-api',name:'独立标准发布负责人'});assign(publisher,'addon_maintenance_standard_publisher',true);
  const narrowPublisher=createMaintenanceTestAccount(template,{id:'standard-narrow-publisher-api',name:'窄范围发布账户'});assign(narrowPublisher,'addon_maintenance_standard_publisher');
  const draftManager=createMaintenanceTestAccount(template,{id:'standard-draft-manager-api',name:'仅草稿管理员'});assign(draftManager,'addon_maintenance_standard_manager',true);
  const aircraftBefore=db.prepare("select * from settings where key='maintenance_aircraft_hours_v1'").get();
  const workTables=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_nonroutine_hour_adjustments','maintenance_nonroutine_role_results','maintenance_nonroutine_review_cases','maintenance_nonroutine_review_channels'];
  const snapshot=()=>workTables.map(table=>JSON.stringify(db.prepare(`select * from ${table} order by id`).all()));
  // Role result identity is id too; all the selected work facts must remain unchanged.
  try{
    process.env.MUC_STANDARDS_MANAGEMENT_ENABLED='1';delete process.env.MUC_STANDARDS_REVIEW_ENABLED;delete process.env.MUC_STANDARDS_NOTIFICATIONS_ENABLED;delete process.env.MUC_STANDARDS_PUBLICATION_ENABLED;
    assert.deepEqual(pumpStandardReviewNotifications(),{delivered:0,cancelled:0});
    assert.equal((await request('/api/maintenance/standard-review-capabilities',{cookie})).payload.enabled,false);
    assert.equal((await request('/api/maintenance/standard-reviews',{cookie})).res.statusCode,404);
    const created=await request('/api/maintenance/standard-management',{method:'POST',cookie,body:{clientId:'std-review-create-api',reason:'建立独立标准',definition:{category:'单项工作',chapter:'29',title:'独立标准API样例',workScope:'左侧',standardHours:0,aircraftCodes:['A320'],genericAircraft:false}}});assert.equal(created.res.statusCode,200);
    const standardId=created.payload.standard.id,versionId=created.payload.versions[0].id,body={revision:1,versionId,clientId:'std-review-request-api',reason:'申请独立标准评议'};
    assert.equal((await request(`/api/maintenance/standard-management/${standardId}/request-review`,{method:'POST',cookie,body})).res.statusCode,404);
    process.env.MUC_STANDARDS_REVIEW_ENABLED='1';const before=snapshot();
    const requested=await request(`/api/maintenance/standard-management/${standardId}/request-review`,{method:'POST',cookie,body});assert.equal(requested.res.statusCode,200,JSON.stringify(requested.payload));assert.equal(requested.payload.review.purpose,'STANDARD');
    const id=requested.payload.review.id,url=`/api/maintenance/standard-reviews/${id}`;
    assert.equal((await request(`/api/maintenance/standard-management/${standardId}/request-review`,{method:'POST',cookie,body})).payload.replayed,true);
    const outsiderCookie=await login(outsider.username);assert.equal((await request(url,{cookie:outsiderCookie})).res.statusCode,404);assert.equal((await request('/api/maintenance/standard-reviews',{cookie:outsiderCookie})).payload.items.length,0);
    assert.equal((await request(`/api/maintenance/standard-management/${standardId}/update`,{method:'POST',cookie,body:{revision:2,versionId,clientId:'std-review-edit-locked',reason:'不能改申请',definition:{category:'单项工作',chapter:'29',title:'修改',workScope:'右侧',standardHours:1,aircraftCodes:['A320'],genericAircraft:false}}})).res.statusCode,409);
    const accepted=await request(`${url}/accept`,{method:'POST',cookie,body:{revision:1,accountIds:members.map(user=>user.id),finalizerAccountId:finalizer.id}});assert.equal(accepted.res.statusCode,200,JSON.stringify(accepted.payload));
    const first=await login(members[0].username),second=await login(members[1].username),finalCookie=await login(finalizer.username);
    assert.equal((await request('/api/maintenance/standard-review-capabilities',{cookie:first})).payload.enabled,true);
    assert.equal((await request('/api/maintenance/standard-review-capabilities',{cookie:outsiderCookie})).payload.enabled,true);
    const priorEmployment=db.prepare('select employment_status from personnel where id=?').get(outsider.personId).employment_status;
    db.prepare("update personnel set employment_status='停职' where id=?").run(outsider.personId);
    try{assert.equal((await request('/api/maintenance/standard-review-capabilities',{cookie:outsiderCookie})).res.statusCode,403);}finally{db.prepare('update personnel set employment_status=? where id=?').run(priorEmployment,outsider.personId);}
    const noticeUrl='/api/maintenance/standard-review-notifications';
    assert.equal((await request(noticeUrl,{cookie:first})).res.statusCode,404);
    assert.equal((await request('/api/maintenance/standard-review-capabilities',{cookie:first})).payload.notificationsEnabled,false);
    process.env.MUC_STANDARDS_NOTIFICATIONS_ENABLED='1';
    const workInboxBefore=JSON.stringify(db.prepare('select * from maintenance_nonroutine_review_notifications order by id').all());
    const failNotice=installFailureTrigger('fail_standard_notification_api','maintenance_standard_review_notifications','insert',"new.event_type='ASSIGNED'",'injected standard notification failure');
    try{assert.throws(()=>pumpStandardReviewNotifications(),/injected standard notification failure/);assert.equal(Number(db.prepare('select count(*) n from maintenance_standard_review_notifications where case_id=?').get(id).n),0);}finally{failNotice();}
    assert.equal(pumpStandardReviewNotifications().delivered,12);assert.equal(pumpStandardReviewNotifications().delivered,0);
    const notices=await request(noticeUrl,{cookie:first});assert.equal(notices.payload.notifications.length,1);assert.equal(notices.payload.notifications[0].payload.title,'新增标准评议任务');
    const noticeId=notices.payload.notifications[0].id;
    assert.equal((await request(`${noticeUrl}/${noticeId}/read`,{method:'POST',cookie:second,body:{}})).res.statusCode,404);
    assert.equal((await request(`${noticeUrl}/${noticeId}/read`,{method:'POST',cookie:first,body:{}})).res.statusCode,200);
    assert.equal((await request('/api/maintenance/standard-review-capabilities',{cookie:first})).payload.notificationsEnabled,true);
    assert.equal(JSON.stringify(db.prepare('select * from maintenance_nonroutine_review_notifications order by id').all()),workInboxBefore);
    assert.equal((await request(`${url}/opinion`,{method:'POST',cookie:first,body:{revision:0,hours:0,basis:'PRIVATE-STANDARD-0'}})).res.statusCode,200);
    assert.equal((await request(noticeUrl,{cookie:first})).payload.notifications.length,0);
    assert.equal((await request(`${noticeUrl}/${noticeId}/read`,{method:'POST',cookie:first,body:{}})).res.statusCode,404);
    const privateView=await request(url,{cookie:second});assert.equal(privateView.payload.review.opinions.length,0);assert.ok(!JSON.stringify(privateView.payload).includes('PRIVATE-STANDARD-0'));
    for(const [index,member] of members.slice(1).entries()){const saved=await request(`${url}/opinion`,{method:'POST',cookie:await login(member.username),body:{revision:0,hours:(index+1)/10,basis:`PRIVATE-STANDARD-${index+1}`}});assert.equal(saved.res.statusCode,200,JSON.stringify(saved.payload));}
    const sealed=await request(url,{cookie:finalCookie});assert.equal(sealed.payload.review.state,'SEALED');assert.equal(sealed.payload.review.opinions.length,12);assert.equal(sealed.payload.review.capabilities.sync,false);
    const decision={revision:3,decision:{category:'单项工作',chapter:'29',title:'独立标准API样例',workScope:'左侧',recognizedHours:0},admissionDecision:'INCLUDE',reason:''};
    assert.equal((await request(`${url}/finalize`,{method:'POST',cookie,body:decision})).res.statusCode,403);
    const dropFailure=installFailureTrigger('fail_standard_final','maintenance_standard_review_events','insert',"new.event_type='FINALIZED'",'injected standard final failure');
    try{assert.ok((await request(`${url}/finalize`,{method:'POST',cookie:finalCookie,body:decision})).res.statusCode>=400);assert.equal(Number(db.prepare('select count(*) n from maintenance_standard_review_finals where case_id=?').get(id).n),0);assert.equal(db.prepare('select review_final_id from maintenance_standard_versions where id=?').get(versionId).review_final_id,null);}finally{dropFailure();}
    const finalized=await request(`${url}/finalize`,{method:'POST',cookie:finalCookie,body:decision});assert.equal(finalized.res.statusCode,200,JSON.stringify(finalized.payload));assert.equal(finalized.payload.finalization.published,false);
    assert.equal((await request(`${url}/finalize`,{method:'POST',cookie:finalCookie,body:decision})).payload.finalization.id,finalized.payload.finalization.id);
    const own=await request(`${url}/finalization`,{cookie:first});assert.equal(own.payload.review.capabilities.finalizationView,true);assert.equal(own.payload.review.opinions.length,1);assert.equal(own.payload.finalization.statistics,undefined);assert.ok(!JSON.stringify(own.payload).includes('PRIVATE-STANDARD-1'));
    assert.equal(db.prepare('select status from maintenance_standard_versions where id=?').get(versionId).status,'DRAFT');assert.equal(db.prepare('select published_at from maintenance_standard_versions where id=?').get(versionId).published_at,null);
    const publisherCookie=await login(publisher.username),narrowCookie=await login(narrowPublisher.username),managerCookie=await login(draftManager.username),publicationUrl=`/api/maintenance/standard-publications/${standardId}/versions/${versionId}`;
    assert.equal((await request('/api/maintenance/standard-publication-capabilities',{cookie:publisherCookie})).payload.enabled,false);
    assert.equal((await request(publicationUrl,{cookie:publisherCookie})).res.statusCode,404);process.env.MUC_STANDARDS_PUBLICATION_ENABLED='1';
    for(const blocked of [cookie,finalCookie,managerCookie,narrowCookie]){assert.equal((await request('/api/maintenance/standard-publication-capabilities',{cookie:blocked})).res.statusCode,403);assert.equal((await request(publicationUrl,{cookie:blocked})).res.statusCode,403);}
    assert.equal((await request('/api/maintenance/standard-publication-capabilities',{cookie:publisherCookie})).payload.enabled,true);
    assert.equal((await request(url,{cookie:publisherCookie})).res.statusCode,404);
    const initialPubView=await request(publicationUrl,{cookie:publisherCookie});assert.equal(initialPubView.payload.result.admission,null);assert.ok(!JSON.stringify(initialPubView.payload).includes('PRIVATE-STANDARD'));
    const pubList=await request(`/api/maintenance/standard-publications?search=${encodeURIComponent('独立标准API样例')}`,{cookie:publisherCookie});assert.equal(pubList.payload.items.length,1);
    const admissionBody={revision:initialPubView.payload.result.standard.revision,versionId,clientId:'actual-publisher-admit',reason:'独立发布负责人明确准入',decision:'INCLUDE'};
    const failAdmission=installFailureTrigger('fail_publication_admission_api','maintenance_standard_admissions','insert',`new.version_id='${versionId}'`,'injected admission failure');
    try{assert.ok((await request(`${publicationUrl}/admit`,{method:'POST',cookie:publisherCookie,body:admissionBody})).res.statusCode>=400);assert.equal(Number(db.prepare('select count(*) n from maintenance_standard_admissions where version_id=?').get(versionId).n),0);}finally{failAdmission();}
    const admitted=await request(`${publicationUrl}/admit`,{method:'POST',cookie:publisherCookie,body:admissionBody});assert.equal(admitted.res.statusCode,200,JSON.stringify(admitted.payload));assert.equal((await request(`${publicationUrl}/admit`,{method:'POST',cookie:publisherCookie,body:admissionBody})).payload.replayed,true);
    const publicationBody={revision:admitted.payload.result.standard.revision,versionId,admissionId:admitted.payload.result.admission.id,clientId:'actual-publisher-publish',reason:'核对冻结机型并独立发布',effectiveAt:'IMMEDIATE'};
    const config={version:9876,groups:[{id:'publication-aircraft-fixture',name:'发布测试机型',codes:['A320'],enabled:false,hours:{}}]};
    db.prepare("insert into settings(key,value,updated_at) values('maintenance_aircraft_hours_v1',?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at").run(JSON.stringify(config),new Date().toISOString());
    assert.equal((await request(`${publicationUrl}/publish`,{method:'POST',cookie:publisherCookie,body:publicationBody})).res.statusCode,409);
    config.groups[0].enabled=true;db.prepare("update settings set value=? where key='maintenance_aircraft_hours_v1'").run(JSON.stringify(config));
    const grant=db.prepare('select * from rbac_user_roles where user_id=? and role_id=?').get(publisher.id,db.prepare("select id from rbac_roles where code='addon_maintenance_standard_publisher'").get().id);db.prepare('delete from rbac_user_roles where user_id=? and role_id=?').run(grant.user_id,grant.role_id);
    assert.equal((await request(`${publicationUrl}/publish`,{method:'POST',cookie:publisherCookie,body:publicationBody})).res.statusCode,403);db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(grant.user_id,grant.role_id,grant.created_at);
    const failPublish=installFailureTrigger('fail_publication_receipt_api','maintenance_standard_publications','insert',`new.version_id='${versionId}'`,'injected publication failure');
    try{assert.ok((await request(`${publicationUrl}/publish`,{method:'POST',cookie:publisherCookie,body:publicationBody})).res.statusCode>=400);assert.equal(db.prepare('select published_at from maintenance_standard_versions where id=?').get(versionId).published_at,null);}finally{failPublish();}
    const published=await request(`${publicationUrl}/publish`,{method:'POST',cookie:publisherCookie,body:publicationBody});assert.equal(published.res.statusCode,200,JSON.stringify(published.payload));assert.equal(published.payload.result.publication.actorId,publisher.id);assert.equal(published.payload.result.source.decision.recognizedHours,0);assert.equal(published.payload.result.version.status,'PUBLISHED');
    const locked=db.prepare('select * from maintenance_standard_publications where version_id=?').get(versionId);assert.equal(JSON.parse(locked.snapshot_json).applicabilityApproval.dictionaryVersion,9876);assert.equal((await request(`${publicationUrl}/publish`,{method:'POST',cookie:publisherCookie,body:publicationBody})).payload.replayed,true);assert.deepEqual(db.prepare('select * from maintenance_standard_publications where version_id=?').get(versionId),locked);
    const {createMaintenanceStandards}=await import('../maintenance-standards.mjs');assert.equal(createMaintenanceStandards({db}).list({aircraftCode:'A320'}).items.find(item=>item.id===standardId).standardHours,0);
    assert.equal((await request(`${url}/finalization`,{cookie:first})).payload.finalization.published,true);
    assert.deepEqual(snapshot(),before);
    await verifyPublishedStandardRevisionApi({standardId,versionId,cookie,managerCookie,publisherCookie,finalCookie,members,finalizer,login});
    const genericFacts=snapshot(),generic=publicationFixture({after(){}},{db,accounts:{publisher,finalizer},genericAircraft:true,aircraftCodes:[]});
    const genericUrl=`/api/maintenance/standard-publications/${generic.id}/versions/${generic.versionId}`;
    const genericBody={revision:generic.getRevision(),versionId:generic.versionId,clientId:'generic-api-consent-v1',reason:'逐条核验并批准本版本通用机型',decision:'INCLUDE'};
    assert.equal((await request(`${genericUrl}/admit`,{method:'POST',cookie:publisherCookie,body:genericBody})).res.statusCode,400);
    assert.equal((await request(`${genericUrl}/admit`,{method:'POST',cookie,body:{...genericBody,genericScopeApproved:true}})).res.statusCode,403);
    const genericAdmission=await request(`${genericUrl}/admit`,{method:'POST',cookie:publisherCookie,body:{...genericBody,genericScopeApproved:true}});
    assert.equal(genericAdmission.res.statusCode,200,JSON.stringify(genericAdmission.payload));
    assert.equal(genericAdmission.payload.result.admission.genericScopeApproval.actorId,publisher.id);
    assert.equal(genericAdmission.payload.result.capabilities.publish,true);
    const genericPublishBody={revision:genericAdmission.payload.result.standard.revision,versionId:generic.versionId,clientId:'generic-api-publish-v1',reason:'按已批准通用范围发布',admissionId:genericAdmission.payload.result.admission.id,effectiveAt:'IMMEDIATE'};
    const genericPublished=await request(`${genericUrl}/publish`,{method:'POST',cookie:publisherCookie,body:genericPublishBody});
    assert.equal(genericPublished.res.statusCode,200,JSON.stringify(genericPublished.payload));
    assert.equal(genericPublished.payload.result.source.aircraft.genericAircraft,true);
    assert.equal((await request(`${genericUrl}/publish`,{method:'POST',cookie:publisherCookie,body:genericPublishBody})).payload.replayed,true);
    assert.ok(createMaintenanceStandards({db}).list({aircraftCode:'A321'}).items.some(item=>item.id===generic.id&&item.genericAircraft));
    assert.deepEqual(snapshot(),genericFacts);

  }finally{if(aircraftBefore)db.prepare("update settings set value=?,updated_at=? where key='maintenance_aircraft_hours_v1'").run(aircraftBefore.value,aircraftBefore.updated_at);else db.prepare("delete from settings where key='maintenance_aircraft_hours_v1'").run();for(const [index,key] of standardFlags.entries())if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];}
});

test("nonroutine review APIs enforce real account scopes, nominated seats and private opinions", async () => {
  const actualSourceExists=(sourceId,personId,ownerId)=>{
    if(db.prepare("select id from maintenance_assignments where id=? and person_id=? and owner_type='subtask' and owner_id=?").get(sourceId,personId,ownerId))return true;
    const [kind,batchId,entryId]=JSON.parse(sourceId);
    return kind==='REPORT_ENTRY' && db.prepare("select id from maintenance_report_entries where id=? and batch_id=? and person_id=? and owner_type='subtask' and owner_id=?").get(entryId,batchId,personId,ownerId);
  };
  const f = await supplementalWorkFixture("MUNRPERMISSION");
  const reported = await f.report({ nonroutineItems: [f.item("评议权限样例")] });
  assert.equal(reported.res.statusCode, 200, JSON.stringify(reported.payload));
  const task = db.prepare("select * from maintenance_subtasks where flight_id=?").get(f.id);
  const batch = db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(f.id);
  assert.ok(task && batch);
  const caseId = `review-api-${f.id}`;
  const stamp = new Date().toISOString();
  const sourceCombinationRows=db.prepare("select name,value from maintenance_hour_rules where rule_type='nonroutineCombinationRatio' order by name").all();
  const sourceCombinations={};
  for(const row of sourceCombinationRows){const [key,role]=row.name.split('::');(sourceCombinations[key]||={})[role]=Number(row.value);}
  const sourcePolicy={strategy:'UNDECIDED',category:'其他',version:1,roleCombinationSnapshot:{version:'fixture-submission-version',combinations:sourceCombinations}};
  db.prepare(`insert into maintenance_nonroutine_review_cases(id,flight_id,subtask_id,report_batch_id,application_revision,application_json,participants_json,policy_json,applicant_account_id,state,revision,created_at,updated_at)
    values(?,?,?,?,1,?,?,?,?,'PENDING_ACCEPTANCE',1,?,?)`).run(caseId,f.id,task.id,batch.id,
      JSON.stringify({ category:"其他",chapter:"29",title:task.title,workScope:"隔离测试范围",requestedHours:2 }),
      JSON.stringify([{personId:f.user.personId,role:"主做"}]),JSON.stringify(sourcePolicy),f.user.id,stamp,stamp);
  const template = db.prepare("select * from users where id='54002010'").get();
  const assignRole = (account, code) => {
    const role = db.prepare("select id from rbac_roles where code=?").get(code);
    assert.ok(role,code);
    db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)").run(account.id,role.id,stamp);
    db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(account.id);
  };
  const reviewers = Array.from({length:12},(_,index) => {
    const account = createMaintenanceTestAccount(template,{id:`nr-review-${index}`,name:`评议测试${index}`});
    assignRole(account,"addon_nonroutine_reviewer"); return account;
  });
  const finalizer = createMaintenanceTestAccount(template,{id:"nr-finalizer",name:"终审测试"});
  assignRole(finalizer,"addon_nonroutine_review_finalizer");
  const oldManager = createMaintenanceTestAccount(template,{id:"nr-old-review",name:"原复核测试"});
  assignRole(oldManager,"addon_maintenance_review");
  const login = async account => {
    const result = await request("/api/login",{method:"POST",body:{username:account.username,password:"muc2026"}});
    assert.equal(result.res.statusCode,200);
    return String(result.res.headers["Set-Cookie"]).split(";")[0];
  };
  const flag = process.env.MUC_NONROUTINE_REVIEW_ENABLED;
  const finalFlag = process.env.MUC_NONROUTINE_FINALIZATION_ENABLED;
  const periodFlag = process.env.MUC_MAINTENANCE_PERIODS_ENABLED;
  const notificationFlag=process.env.MUC_NONROUTINE_NOTIFICATIONS_ENABLED;
  const url = `/api/maintenance/nonroutine-reviews/${caseId}`;
  try {
    delete process.env.MUC_NONROUTINE_REVIEW_ENABLED;
    assert.equal((await request(url,{cookie:f.cookie})).res.statusCode,404);
    const disabledCapabilities=await request('/api/maintenance/nonroutine-review-capabilities',{cookie:f.cookie});
    assert.equal(disabledCapabilities.payload.enabled,false);
    assert.equal((await request('/api/maintenance/nonroutine-reviews',{cookie:f.cookie})).res.statusCode,404);
    process.env.MUC_NONROUTINE_REVIEW_ENABLED="1";
    assert.equal((await request(url)).res.statusCode,401);
    db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=?").run(reviewers[0].id);
    const narrowCookie=await login(reviewers[0]);
    const narrowList=await request(`/api/maintenance/nonroutine-reviews?search=${encodeURIComponent(task.title)}`,{cookie:narrowCookie});
    assert.equal(narrowList.res.statusCode,200);assert.equal(narrowList.payload.items.length,0);
    const candidatesUrl=`${url}/candidates?role=opinion&search=nr-review-`;
    assert.equal((await request(candidatesUrl,{cookie:narrowCookie})).res.statusCode,404);
    const currentCandidates=await request(candidatesUrl,{cookie:f.cookie});
    assert.equal(currentCandidates.res.statusCode,200);assert.equal(currentCandidates.payload.items.length,11);
    assert.ok(currentCandidates.payload.items.every(item=>item.grade===undefined && item.permissions===undefined));
    const employment=db.prepare('select employment_status from personnel where id=?').get(reviewers[1].personId).employment_status;
    db.prepare("update personnel set employment_status='离职' where id=?").run(reviewers[1].personId);
    assert.equal((await request(candidatesUrl,{cookie:f.cookie})).payload.items.length,10);
    db.prepare('update personnel set employment_status=? where id=?').run(employment,reviewers[1].personId);
    const nomination = {revision:1,accountIds:reviewers.map(account=>account.id),finalizerAccountId:finalizer.id};
    const invalid = await request(`${url}/accept`,{method:"POST",cookie:f.cookie,body:nomination});
    assert.equal(invalid.res.statusCode,400,JSON.stringify(invalid.payload));
    assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_review_seats where case_id=?").get(caseId).n),0);
    db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=?").run(reviewers[0].id);
    const acceptingAdmin=createMaintenanceTestAccount(template,{id:'nr-accept-current-authority',name:'受理锁内资格核对'});assignRole(acceptingAdmin,'addon_nonroutine_review_assign');const acceptingCookie=await login(acceptingAdmin);
    const acceptanceFacts=()=>Object.fromEntries(['maintenance_nonroutine_review_cases','maintenance_nonroutine_review_seats','maintenance_nonroutine_review_events','maintenance_nonroutine_review_outbox','maintenance_nonroutine_review_finals'].map(table=>[table,db.prepare(`select * from ${table} where ${table==='maintenance_nonroutine_review_cases'?'id':'case_id'}=?`).all(caseId)]));
    for(const change of ['role','scope','person']){
      const before=acceptanceFacts(),originalExec=db.exec,role=db.prepare("select id from rbac_roles where code='addon_nonroutine_review_assign'").get(),person=db.prepare('select employment_status from personnel where id=?').get(acceptingAdmin.personId);let injected=false;
      db.exec=sql=>{if(!injected&&/^begin immediate$/i.test(String(sql).trim())){injected=true;if(change==='role')db.prepare('delete from rbac_user_roles where user_id=? and role_id=?').run(acceptingAdmin.id,role.id);else if(change==='scope')db.prepare("update rbac_user_scopes set scope_type='self' where user_id=? and module='maintenance'").run(acceptingAdmin.id);else db.prepare("update personnel set employment_status='停职' where id=?").run(acceptingAdmin.personId);}return originalExec(sql);};
      try{const result=await request(`${url}/accept`,{method:'POST',cookie:acceptingCookie,body:nomination});assert.equal(injected,true);assert.equal(result.res.statusCode,404,JSON.stringify(result.payload));assert.deepEqual(acceptanceFacts(),before);}finally{db.exec=originalExec;if(change==='role')db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(acceptingAdmin.id,role.id,stamp);db.prepare("update rbac_user_scopes set scope_type='all' where user_id=? and module='maintenance'").run(acceptingAdmin.id);db.prepare('update personnel set employment_status=? where id=?').run(person.employment_status,acceptingAdmin.personId);}
    }
    const accepted = await request(`${url}/accept`,{method:"POST",cookie:f.cookie,body:nomination});
    assert.equal(accepted.res.statusCode,200,JSON.stringify(accepted.payload));
    assert.equal(accepted.payload.review.seats.length,12);
    const oldReviewer=reviewers[11];
    const replacementReviewer=createMaintenanceTestAccount(template,{id:'nr-review-replacement',name:'人工替换评议人'});
    assignRole(replacementReviewer,'addon_nonroutine_reviewer');
    const replacedSeat=await request(`${url}/seats`,{method:'POST',cookie:f.cookie,body:{revision:accepted.payload.review.revision,personId:oldReviewer.personId,accountId:replacementReviewer.id,reason:'原人员无法参加，人工替换尚未提交席位'}});
    assert.equal(replacedSeat.res.statusCode,200,JSON.stringify(replacedSeat.payload));
    assert.equal(replacedSeat.payload.review.seats.length,12);
    assert.equal(replacedSeat.payload.review.acceptedAt,accepted.payload.review.acceptedAt);
    assert.ok(replacedSeat.payload.review.seats.some(seat=>seat.personId===replacementReviewer.personId && seat.personName==='人工替换评议人'));
    assert.equal((await request(`${url}/opinion`,{method:'POST',cookie:await login(oldReviewer),body:{revision:0,hours:2,basis:'原席位不能提交'}})).res.statusCode,403);
    reviewers[11]=replacementReviewer;
    assert.equal((await request(`${url}/opinion`,{method:"POST",cookie:f.cookie,body:{revision:0,hours:2,basis:"管理员无席位"}})).res.statusCode,403);
    const oldCookie = await login(oldManager);
    assert.equal((await request(`${url}/accept`,{method:"POST",cookie:oldCookie,body:nomination})).res.statusCode,404);
    const reviewerCookie = await login(reviewers[0]);
    const notificationUrl='/api/maintenance/nonroutine-review-notifications';
    delete process.env.MUC_NONROUTINE_NOTIFICATIONS_ENABLED;
    assert.equal((await request(notificationUrl,{cookie:reviewerCookie})).res.statusCode,404);
    process.env.MUC_NONROUTINE_NOTIFICATIONS_ENABLED='1';
    assert.ok(pumpNonroutineNotifications().delivered>=12);
    const inbox=await request(notificationUrl,{cookie:reviewerCookie});
    assert.equal(inbox.res.statusCode,200);assert.equal(inbox.payload.notifications.length,1);
    const notificationId=inbox.payload.notifications[0].id;
    assert.equal((await request(`${notificationUrl}/${notificationId}/read`,{method:'POST',cookie:oldCookie,body:{}})).res.statusCode,404);
    assert.equal((await request(`${notificationUrl}/${notificationId}/read`,{method:'POST',cookie:reviewerCookie,body:{}})).res.statusCode,200);
    const finalizerCookie = await login(finalizer);
    const suggestion = {clientId:"real-api-suggestion",field:"chapter",proposedValue:"29-10",reason:"核对实际系统章节",privacyAcknowledged:true};
    assert.equal((await request(`${url}/suggestions`,{method:"POST",cookie:oldCookie,body:suggestion})).res.statusCode,404);
    const suggested = await request(`${url}/suggestions`,{method:"POST",cookie:reviewerCookie,body:suggestion});
    assert.equal(suggested.res.statusCode,200,JSON.stringify(suggested.payload));
    assert.equal(suggested.payload.review.suggestions[0].proposedValue,"29-10");
    assert.equal(suggested.payload.review.application.chapter,"29");
    assert.equal((await request(`${url}/suggestions`,{method:"POST",cookie:reviewerCookie,body:{...suggestion,hours:2}})).res.statusCode,400);
    for (const [index, reviewer] of reviewers.entries()) {
      const cookie = await login(reviewer);
      const result = await request(`${url}/opinion`,{method:"POST",cookie,body:{revision:0,hours:index+1,basis:`PRIVATE-REAL-${index}`}});
      assert.equal(result.res.statusCode,200,JSON.stringify(result.payload));
      assert.equal(result.payload.review.opinions.length,1);
      assert.equal(result.payload.review.statistics,undefined);
      if(index===0) {
        const ownHistory = await request(`${url}/opinion-history`,{cookie});
        assert.equal(ownHistory.res.statusCode,200);
        assert.equal(ownHistory.payload.history.entries[0].basis,"PRIVATE-REAL-0");
        assert.equal((await request(`${url}/opinion-history?personId=${reviewer.personId}`,{cookie:finalizerCookie})).res.statusCode,403);
      }
      if(index===1) {
        assert.equal((await request(`${url}/opinion-history?personId=${reviewers[0].personId}`,{cookie})).res.statusCode,403);
      }
    }
    const oldView = await request(url,{cookie:oldCookie});
    assert.equal(oldView.res.statusCode,200);
    assert.equal(oldView.payload.review.opinions.length,0);
    assert.equal(oldView.payload.review.suggestions.length,1);
    assert.ok(!JSON.stringify(oldView.payload).includes("PRIVATE-REAL"));
    const listed=await request(`/api/maintenance/nonroutine-reviews?search=${encodeURIComponent(task.title)}`,{cookie:f.cookie});
    assert.ok(listed.payload.items.some(item=>item.id===caseId));
    assert.ok(!JSON.stringify(listed.payload).includes('PRIVATE-REAL'));
    const finalView = await request(url,{cookie:finalizerCookie});
    assert.equal(finalView.payload.review.state,"SEALED");
    assert.equal(finalView.payload.review.opinions.length,12);
    assert.deepEqual(finalView.payload.review.statistics,{trimmedMean:6.5,median:6.5});
    const finalHistory = await request(`${url}/opinion-history?personId=${reviewers[0].personId}`,{cookie:finalizerCookie});
    assert.equal(finalHistory.res.statusCode,200);
    assert.equal(finalHistory.payload.history.entries[0].basis,"PRIVATE-REAL-0");
    assert.equal((await request(`${url}/opinion-history?personId=${reviewers[0].personId}`,{cookie:oldCookie})).res.statusCode,403);
    assert.equal((await request(`${url}/opinion-history?beforeRevision=oops`,{cookie:reviewerCookie})).res.statusCode,400);
    assert.equal((await request(`${url}/suggestions`,{method:"POST",cookie:reviewerCookie,body:{...suggestion,clientId:"real-api-after-seal"}})).res.statusCode,409);
    const firstCookie = await login(reviewers[0]);
    assert.equal((await request(`${url}/opinion`,{method:"POST",cookie:firstCookie,body:{revision:1,hours:3,basis:"封闭后修改"}})).res.statusCode,409);
    delete process.env.MUC_NONROUTINE_FINALIZATION_ENABLED;
    assert.equal((await request(`${url}/finalization`,{cookie:finalizerCookie})).res.statusCode,404);
    process.env.MUC_NONROUTINE_FINALIZATION_ENABLED='1';
    db.prepare("delete from maintenance_hour_results where owner_type='subtask' and owner_id=?").run(task.id);
    db.prepare("update maintenance_subtasks set standard_hours=null where id=?").run(task.id);
    db.prepare(`insert into maintenance_nonroutine_assessments(subtask_id,flight_id,report_batch_id,source_kind,source_fingerprint,application_json,participants_json,policy_json,review_case_id,effective_hours,created_at)
      select subtask_id,flight_id,report_batch_id,'REVIEW',?,application_json,participants_json,policy_json,id,null,created_at from maintenance_nonroutine_review_cases where id=?`).run(`fixture-${caseId}`,caseId);
    db.prepare("insert into maintenance_nonroutine_review_channels(id,case_id,subtask_id,state,created_at,updated_at) values(?,?,?,'WAITING_REVIEW',?,?)").run(`channel-${caseId}`,caseId,task.id,stamp,stamp);
    const sourceBefore=db.prepare('select * from maintenance_subtasks where id=?').get(task.id);
    const decision={revision:finalView.payload.review.revision,decision:{category:'单项工作',chapter:'29',title:task.title,workScope:'隔离测试范围',recognizedHours:0},
      participantsVerified:true,participants:[{personId:f.user.personId,role:'检验'}],roleVerificationReason:'核实原参与人本次分配角色为检验',reason:'现场核对后认定零值',admissionDecision:'EXCLUDE'};
    const previewTables=['maintenance_nonroutine_review_finals','maintenance_nonroutine_review_events','maintenance_nonroutine_review_outbox','maintenance_nonroutine_review_channels','maintenance_nonroutine_assessments','maintenance_hour_results','maintenance_subtasks','maintenance_assignments'];
    const previewSnapshot=()=>previewTables.map(table=>JSON.stringify(db.prepare(`select * from ${table}`).all()));
    const beforePreview=previewSnapshot();
    assert.equal((await request(`${url}/preview`,{method:'POST',cookie:f.cookie,body:decision})).res.statusCode,403);
    const terminalPreview=await request(`${url}/preview`,{method:'POST',cookie:finalizerCookie,body:decision});
    assert.equal(terminalPreview.res.statusCode,200,JSON.stringify(terminalPreview.payload));
    assert.equal(terminalPreview.payload.preview.allocation.available,true);
    assert.equal(terminalPreview.payload.preview.allocation.allocations[0].role,'检验');
    const expandedPreview=await request(`${url}/preview`,{method:'POST',cookie:finalizerCookie,body:{...decision,participants:[{personId:f.user.personId,role:'主做'},{personId:f.user.personId,role:'检验'}]}});
    assert.equal(expandedPreview.res.statusCode,200,JSON.stringify(expandedPreview.payload));assert.equal(expandedPreview.payload.preview.allocation.available,true);assert.equal(expandedPreview.payload.preview.allocation.deliveryCompatible,true);assert.equal(expandedPreview.payload.preview.allocation.allocations.length,2);
    assert.ok(expandedPreview.payload.preview.allocation.allocations.every(row=>actualSourceExists(row.sourceAssignmentId,row.personId,task.id)));
    const changingRule=sourceCombinationRows.find(row=>row.name==='主做+检验::主做');
    assert.ok(changingRule);
    db.prepare("update maintenance_hour_rules set value=0.99 where rule_type='nonroutineCombinationRatio' and name=?").run(changingRule.name);
    try {
      const unchanged=await request(`${url}/preview`,{method:'POST',cookie:finalizerCookie,body:{...decision,participants:[{personId:f.user.personId,role:'主做'},{personId:f.user.personId,role:'检验'}]}});
      assert.equal(unchanged.res.statusCode,200,JSON.stringify(unchanged.payload));
      assert.equal(unchanged.payload.preview.policyToken,expandedPreview.payload.preview.policyToken);
      assert.deepEqual(unchanged.payload.preview.policy,expandedPreview.payload.preview.policy);
    } finally { db.prepare("update maintenance_hour_rules set value=? where rule_type='nonroutineCombinationRatio' and name=?").run(changingRule.value,changingRule.name); }
    assert.deepEqual(previewSnapshot(),beforePreview);
    assert.equal(terminalPreview.payload.preview.allocation.allocations[0].hours,0);
    assert.deepEqual(previewSnapshot(),beforePreview);
    assert.equal((await request(`${url}/finalize`,{method:'POST',cookie:finalizerCookie,body:{...decision,expectedPolicyToken:'stale'}})).res.statusCode,409);
    assert.deepEqual(previewSnapshot(),beforePreview);
    decision.participants=[{personId:f.user.personId,role:'主做'},{personId:f.user.personId,role:'检验'}];decision.expectedPolicyToken=expandedPreview.payload.preview.policyToken;
    assert.equal((await request(`${url}/finalize`,{method:'POST',cookie:f.cookie,body:decision})).res.statusCode,403);
    assert.equal(expandedPreview.payload.preview.sourceFacts.changed,true);
    assert.equal((await request(`${url}/finalize`,{method:'POST',cookie:finalizerCookie,body:decision})).res.statusCode,409);
    decision.sourceFactsToken=expandedPreview.payload.preview.sourceFacts.token;decision.sourceFactsReviewed=true;
    const finalized=await request(`${url}/finalize`,{method:'POST',cookie:finalizerCookie,body:decision});
    assert.equal(finalized.res.statusCode,200,JSON.stringify(finalized.payload));
    assert.equal(finalized.payload.finalization.channel.state,'NEEDS_ATTENTION');
    assert.equal(finalized.payload.finalization.attempts[0].detail.code,'PERIOD_STATUS_UNKNOWN');
    const frozenEvent=JSON.parse(db.prepare("select detail_json from maintenance_nonroutine_review_events where case_id=? and event_type='FINALIZED'").get(caseId).detail_json);
    assert.equal(frozenEvent.sourceFacts.token,decision.sourceFactsToken);assert.equal(frozenEvent.sourceFacts.acknowledged,true);
    const originalOpinions=JSON.stringify(db.prepare('select * from maintenance_nonroutine_review_opinions where case_id=? order by person_id').all(caseId));
    db.prepare('update maintenance_subtasks set content=? where id=?').run('终审后发生另一范围事实变化',task.id);
    const blockedSource=await request(`${url}/sync`,{method:'POST',cookie:finalizerCookie,body:{}});assert.equal(blockedSource.res.statusCode,200,JSON.stringify(blockedSource.payload));assert.equal(blockedSource.payload.finalization.attempts.at(-1).detail.code,'SOURCE_FACTS_CHANGED_AFTER_FINALIZATION');
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where owner_id=?').get(task.id).n),0);assert.equal(JSON.stringify(db.prepare('select * from maintenance_nonroutine_review_opinions where case_id=? order by person_id').all(caseId)),originalOpinions);
    db.prepare('update maintenance_subtasks set content=? where id=?').run(sourceBefore.content,task.id);
    await verifyWorkStandardIntakeApi(caseId,f.cookie,finalizerCookie);
    assert.equal(finalized.payload.finalization.decision.recognizedHours,0);
    assert.equal((await request(`${url}/finalize`,{method:'POST',cookie:finalizerCookie,body:decision})).res.statusCode,200);
    assert.equal((await request(`${url}/finalize`,{method:'POST',cookie:finalizerCookie,body:{...decision,reason:'尝试改写'}})).res.statusCode,409);
    assert.equal((await request(`${url}/sync`,{method:'POST',cookie:finalizerCookie,body:{}})).res.statusCode,200);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_finals where case_id=?').get(caseId).n),1);
    assert.deepEqual(db.prepare('select * from maintenance_subtasks where id=?').get(task.id),sourceBefore);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where owner_id=?').get(task.id).n),0);
    const publicFinal=await request(`${url}/finalization`,{cookie:firstCookie});
    assert.equal(publicFinal.res.statusCode,200);
    assert.equal(publicFinal.payload.finalization.statistics,undefined);
    assert.equal(publicFinal.payload.finalization.reason,undefined);
    assert.equal(publicFinal.payload.finalization.sourceFacts,undefined);const publicFacts=(await request(url,{cookie:firstCookie})).payload.review.sourceFacts;assert.equal(publicFacts.current,undefined);assert.equal(publicFacts.baseline,undefined);
    const recognizedReport=(await request(`/api/maintenance/flights/${f.id}/reports`,{cookie:f.cookie})).payload.report.nonroutine.items[0].hourAssessment;
    assert.equal(recognizedReport.syncPending,true);
    assert.equal(recognizedReport.reviewPending,false);
    assert.equal(recognizedReport.personalEstimates,undefined);
    const periodUrl='/api/maintenance/hour-periods/2026-09';
    delete process.env.MUC_MAINTENANCE_PERIODS_ENABLED;
    assert.equal((await request(periodUrl,{cookie:f.cookie})).res.statusCode,404);
    assert.equal((await request('/api/maintenance/hour-period-capabilities',{cookie:f.cookie})).payload.enabled,false);
    process.env.MUC_MAINTENANCE_PERIODS_ENABLED='1';
    assert.equal((await request(periodUrl,{cookie:oldCookie})).res.statusCode,403);
    assert.equal((await request('/api/maintenance/hour-period-capabilities',{cookie:oldCookie})).res.statusCode,403);
    assert.equal((await request('/api/maintenance/hour-period-capabilities',{cookie:f.cookie})).payload.enabled,true);
    assignRole(finalizer,'addon_maintenance_period_responsible');
    const periodCandidates=await request(`/api/maintenance/hour-period-responsible-candidates?search=${encodeURIComponent(finalizer.id)}`,{cookie:f.cookie});
    assert.equal(periodCandidates.res.statusCode,200);assert.ok(periodCandidates.payload.items.some(person=>person.accountId===finalizer.id));
    assert.deepEqual(Object.keys(periodCandidates.payload.items[0]).sort(),['accountId','personId','name','employeeNo'].sort());
    const assigned=await request(`${periodUrl}/assign`,{method:'POST',cookie:f.cookie,body:{revision:0,accountId:finalizer.id,reason:'指定本月账期负责人'}});
    assert.equal(assigned.res.statusCode,200,JSON.stringify(assigned.payload));
    assert.equal(assigned.payload.period.state,'UNKNOWN');
    assert.equal(assigned.payload.capabilities.confirm,false);
    assert.equal((await request(periodUrl,{cookie:finalizerCookie})).payload.capabilities.confirm,true);
    const confirmation={revision:1,state:'CLOSED',reason:'负责人核实本月已封账'};
    assert.equal((await request(`${periodUrl}/confirm`,{method:'POST',cookie:f.cookie,body:confirmation})).res.statusCode,403);
    const opened=await request(`${periodUrl}/confirm`,{method:'POST',cookie:finalizerCookie,body:confirmation});
    assert.equal(opened.res.statusCode,200,JSON.stringify(opened.payload));
    assert.equal(opened.payload.period.state,'CLOSED');
    const syncClosed=await request(`${url}/sync`,{method:'POST',cookie:finalizerCookie,body:{}});
    assert.equal(syncClosed.payload.finalization.attempts.at(-1).detail.code,'PERIOD_CLOSED_CROSS_PERIOD_REQUIRED');
    const crossTaskId=syncClosed.payload.finalization.attempts.at(-1).detail.taskId;
    assert.ok(crossTaskId);
    const crossUrl=`/api/maintenance/cross-period-tasks/${crossTaskId}`;
    assert.equal((await request(crossUrl,{cookie:oldCookie})).res.statusCode,403);
    const crossTask=await request(crossUrl,{cookie:f.cookie});
    assert.equal(crossTask.res.statusCode,200);
    assert.equal(crossTask.payload.capabilities.authorize,false);
    assert.equal(crossTask.payload.sourcePeriod.state,'CLOSED');
    assert.equal((await request('/api/maintenance/cross-period-tasks?month=2026-09',{cookie:oldCookie})).res.statusCode,403);
    const crossTasks=await request('/api/maintenance/cross-period-tasks?month=2026-09',{cookie:f.cookie});
    assert.equal(crossTasks.res.statusCode,200);assert.ok(crossTasks.payload.items.some(item=>item.id===crossTaskId));
    assert.equal(crossTasks.payload.items[0].application_json,undefined);assert.equal(crossTasks.payload.items[0].opinions,undefined);
    assert.equal(crossTask.payload.task.source_month,'2026-09');
    assert.equal(crossTask.payload.task.state,'PENDING_AUTHORIZATION');
    const targetPeriodUrl='/api/maintenance/hour-periods/2026-10';
    assert.equal((await request(`${targetPeriodUrl}/assign`,{method:'POST',cookie:f.cookie,body:{revision:0,accountId:finalizer.id,reason:'指定跨期目标月份负责人'}})).res.statusCode,200);
    assert.equal((await request(`${targetPeriodUrl}/confirm`,{method:'POST',cookie:finalizerCookie,body:{revision:1,state:'OPEN',reason:'确认目标月份开放'}})).res.statusCode,200);
    const crossPayload={revision:1,targetMonth:'2026-10',sourceRevision:2,targetRevision:2,reason:'测试跨期授权依据'};
    assert.equal((await request(`${crossUrl}/authorize`,{method:'POST',cookie:f.cookie,body:crossPayload})).res.statusCode,403);
    assert.equal((await request(`${crossUrl}/authorize`,{method:'POST',cookie:finalizerCookie,body:crossPayload})).res.statusCode,403);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where owner_id=?').get(task.id).n),0);
    const reopened=await request(`${periodUrl}/confirm`,{method:'POST',cookie:finalizerCookie,body:{revision:2,state:'OPEN',reason:'负责人确认重新开放'}});
    assert.equal(reopened.res.statusCode,200);
    const syncOpen=await request(`${url}/sync`,{method:'POST',cookie:finalizerCookie,body:{}});
    assert.equal(syncOpen.res.statusCode,200,JSON.stringify(syncOpen.payload));
    assert.equal(syncOpen.payload.finalization.channel.state,'MERGED_CLOSED');
    const resolvedCross=await request(crossUrl,{cookie:f.cookie});
    assert.equal(resolvedCross.payload.task.state,'RESOLVED_SOURCE_REOPENED');
    assert.equal(JSON.parse(resolvedCross.payload.task.source_period_json).state,'CLOSED');
    const results=db.prepare('select * from maintenance_hour_results where owner_id=?').all(task.id);
    assert.equal(results.length,1);assert.equal(results[0].hours,0);assert.equal(results[0].status,'待复核');assert.equal(results[0].role,'主做');
    const roleRows=db.prepare('select * from maintenance_nonroutine_role_results where case_id=?').all(caseId);assert.equal(roleRows.length,2);
    assert.equal((await request(`/api/maintenance/hours/${roleRows[0].id}/confirm`,{method:'POST',cookie:f.cookie,body:{}})).res.statusCode,409);
    assert.equal((await request(`/api/maintenance/hours/${roleRows[0].id}`,{method:'PUT',cookie:f.cookie,body:{adjustedHours:9}})).res.statusCode,409);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_effective_hour_results where owner_id=?').get(task.id).n),2);
    assert.deepEqual(db.prepare('select * from maintenance_subtasks where id=?').get(task.id),sourceBefore);
    await request(`${url}/sync`,{method:'POST',cookie:finalizerCookie,body:{}});
    assert.deepEqual(db.prepare('select * from maintenance_hour_results where owner_id=?').all(task.id),results);
    const confirmedRecognition=await f.putReview({mode:'confirm',routineElectronicSigned:false,nonroutineElectronicSigned:false});
    assert.equal(confirmedRecognition.res.statusCode,200,JSON.stringify(confirmedRecognition.payload));
    const confirmedResults=db.prepare('select * from maintenance_hour_results where owner_id=?').all(task.id);
    assert.equal(confirmedResults.length,1);assert.equal(confirmedResults[0].hours,0);assert.equal(confirmedResults[0].status,'已确认');
    assert.equal(confirmedResults[0].role,'主做');
    assert.equal(Number(db.prepare("select count(*) n from maintenance_effective_hour_results where owner_id=? and status='已确认'").get(task.id).n),2);assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_role_results where case_id=?').get(caseId).n),2);
    const roleFactsBefore=db.prepare('select * from maintenance_nonroutine_role_results where case_id=? order by id').all(caseId);
    assert.equal((await f.putReview({reason:'保持原事实的归档保存'})).res.statusCode,200);
    assert.deepEqual(db.prepare('select * from maintenance_nonroutine_role_results where case_id=? order by id').all(caseId),roleFactsBefore);
    const protectedTree=await f.getReview(),changedTasks=protectedTree.tasks.map(row=>({ownerType:row.ownerType,ownerId:row.ownerId,assignments:row.assignments.map(assignment=>({personId:assignment.personId,role:row.ownerId===task.id?'检验':assignment.role}))}));
    assert.equal((await f.putReview({reason:'不能通过旧归档修改绕过核算角色更正',tasks:changedTasks})).res.statusCode,409);
    assert.deepEqual(db.prepare('select * from maintenance_nonroutine_role_results where case_id=? order by id').all(caseId),roleFactsBefore);
    assert.equal(db.prepare("select role from maintenance_report_entries where owner_type='subtask' and owner_id=?").get(task.id).role,'主做');
    assert.equal(Number(db.prepare("select count(*) n from maintenance_assignments where owner_type='subtask' and owner_id=?").get(task.id).n),0,'reporting and recognition must not fabricate dispatch');
    const archived=await supplementalWorkFixture('MUNRIMMUTABLE');
    assert.equal((await archived.report({nonroutineItems:[archived.item('已确认补记隔离样例')]})).res.statusCode,200);
    assert.equal((await archived.putReview({mode:'confirm',routineElectronicSigned:false,nonroutineElectronicSigned:false})).res.statusCode,200);
    const archivedTask=db.prepare('select * from maintenance_subtasks where flight_id=?').get(archived.id);
    const archivedBatch=db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(archived.id);
    // Isolated fixture: model the same submitted source still awaiting recognition at opportunity confirmation.
    db.prepare('delete from maintenance_hour_results where owner_id=?').run(archivedTask.id);
    db.prepare('update maintenance_subtasks set standard_hours=null where id=?').run(archivedTask.id);
    const clone=(table,row,changes)=>{const value={...row,...changes};db.prepare(`insert into ${table}(${Object.keys(value).join(',')}) values(${Object.keys(value).map(()=>'?').join(',')})`).run(...Object.values(value));return value;};
    const appendCase=`append-${caseId}`;
    const sourceCase=db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(caseId);
    const appendApplication=JSON.stringify({category:archivedTask.category,chapter:archivedTask.card_no||'',title:archivedTask.title,workScope:archivedTask.content||'',requestedHours:archivedTask.standard_hours});
    clone('maintenance_nonroutine_review_cases',sourceCase,{id:appendCase,flight_id:archived.id,subtask_id:archivedTask.id,report_batch_id:archivedBatch.id,application_json:appendApplication});
    const originalFinal=db.prepare('select * from maintenance_nonroutine_review_finals where case_id=?').get(caseId);
    const appendDecision={...JSON.parse(originalFinal.decision_json),title:archivedTask.title,recognizedHours:1.5},appendParticipants=[{personId:archived.user.personId,role:'主做'},{personId:archived.user.personId,role:'检验'}];
    const appendDigest=createHash('sha256').update(JSON.stringify({decision:appendDecision,participants:appendParticipants,reason:originalFinal.reason,roleReason:originalFinal.role_verification_reason,admissionDecision:originalFinal.admission_decision})).digest('hex');
    clone('maintenance_nonroutine_review_finals',originalFinal,{id:`append-${originalFinal.id}`,case_id:appendCase,decision_json:JSON.stringify(appendDecision),participants_json:JSON.stringify(appendParticipants),input_digest:appendDigest,policy_json:JSON.stringify(expandedPreview.payload.preview.policy)});
    const originalAssessment=db.prepare('select * from maintenance_nonroutine_assessments where review_case_id=?').get(caseId);
    clone('maintenance_nonroutine_assessments',originalAssessment,{subtask_id:archivedTask.id,flight_id:archived.id,report_batch_id:archivedBatch.id,review_case_id:appendCase,source_fingerprint:`append-${caseId}`,application_json:appendApplication,effective_hours:null});
    const originalChannel=db.prepare('select * from maintenance_nonroutine_review_channels where case_id=?').get(caseId);
    clone('maintenance_nonroutine_review_channels',originalChannel,{id:`append-${originalChannel.id}`,case_id:appendCase,subtask_id:archivedTask.id,state:'APPROVED_PENDING_SYNC'});
    const originalTables=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_sortie_results'];
    const snapshot=()=>originalTables.map(table=>db.prepare(`select * from ${table} where ${table==='maintenance_flights'?'id':'flight_id'}=? order by id`).all(archived.id));
    const factsBefore=snapshot();
    assert.equal((await request(`${periodUrl}/confirm`,{method:'POST',cookie:finalizerCookie,body:{revision:3,state:'CLOSED',reason:'跨期测试确认原月份封账'}})).res.statusCode,200);
    const appendUrl=`/api/maintenance/nonroutine-reviews/${appendCase}/sync`;
    const waitingCross=await request(appendUrl,{method:'POST',cookie:finalizerCookie,body:{}});
    assert.equal(waitingCross.payload.finalization.channel.state,'NEEDS_ATTENTION');
    const appendTaskId=waitingCross.payload.finalization.attempts.at(-1).detail.taskId;
    const appendCrossUrl=`/api/maintenance/cross-period-tasks/${appendTaskId}/authorize`;
    assignRole(finalizer,'addon_maintenance_cross_period');
    const grant={revision:1,targetMonth:'2026-10',sourceRevision:4,targetRevision:2,reason:'按原作业月份统计，目标月份办理跨期补记'};
    assert.equal((await request(appendCrossUrl,{method:'POST',cookie:finalizerCookie,body:grant})).res.statusCode,200);
    assert.equal((await request(`${targetPeriodUrl}/confirm`,{method:'POST',cookie:finalizerCookie,body:{revision:2,state:'CLOSED',reason:'授权后目标月份封账测试'}})).res.statusCode,200);
    const staleCross=await request(appendUrl,{method:'POST',cookie:finalizerCookie,body:{}});
    assert.equal(staleCross.payload.finalization.attempts.at(-1).detail.code,'CROSS_PERIOD_AUTHORIZATION_STALE');
    assert.equal((await request(`${targetPeriodUrl}/confirm`,{method:'POST',cookie:finalizerCookie,body:{revision:3,state:'OPEN',reason:'目标月份重新开放'}})).res.statusCode,200);
    assert.equal((await request(appendCrossUrl,{method:'POST',cookie:finalizerCookie,body:{...grant,revision:2,targetRevision:4,reason:'重新核对目标账期版本并授权'}})).res.statusCode,200);
    const dropCrossFailure=installFailureTrigger('fail_cross_receipt','maintenance_nonroutine_posting_receipts','insert',`new.case_id='${appendCase}'`,'injected cross-period receipt failure');
    try{
      assert.ok((await request(appendUrl,{method:'POST',cookie:finalizerCookie,body:{}})).res.statusCode>=400);
      assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_hour_adjustments where case_id=?').get(appendCase).n),0);
      assert.equal(db.prepare('select effective_hours from maintenance_nonroutine_assessments where review_case_id=?').get(appendCase).effective_hours,null);
      assert.equal(db.prepare('select state from maintenance_nonroutine_cross_period_tasks where id=?').get(appendTaskId).state,'AUTHORIZED');
    }finally{dropCrossFailure();}
    const appended=await request(`/api/maintenance/nonroutine-reviews/${appendCase}/sync`,{method:'POST',cookie:finalizerCookie,body:{}});
    assert.equal(appended.res.statusCode,200,JSON.stringify(appended.payload));
    assert.equal(appended.payload.finalization.channel.state,'ADJUSTED_CLOSED');
    assert.deepEqual(appended.payload.finalization.postingReceipt,{workMonth:'2026-09',handlingMonth:'2026-10',statisticalMonth:'2026-09',policy:'ORIGINAL_WORK_MONTH',taskId:appendTaskId});
    assert.equal(db.prepare('select state from maintenance_nonroutine_cross_period_tasks where id=?').get(appendTaskId).state,'COMPLETED');
    assert.deepEqual(snapshot(),factsBefore);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(archived.id).n),0);
    const adjustments=db.prepare('select * from maintenance_nonroutine_hour_adjustments where flight_id=?').all(archived.id);
    assert.equal(adjustments.length,2);assert.equal(Math.round(adjustments.reduce((sum,row)=>sum+row.hours,0)*100),150);
    assert.deepEqual(adjustments.map(row=>row.role).sort(),['主做','检验']);
    assert.ok(adjustments.every(row=>actualSourceExists(row.assignment_id,row.person_id,archivedTask.id)));assert.equal(new Set(adjustments.map(row=>row.assignment_id)).size,1);
    assert.equal((await request(`/api/maintenance/hours/${adjustments[0].id}`,{method:'PUT',cookie:f.cookie,body:{adjustedHours:9}})).res.statusCode,409);
    const personal=await request('/api/maintenance/stats/personal/details?month=2026-09&period=month&type=nonroutine&status=confirmed',{cookie:f.cookie});
    assert.equal(Math.round(personal.payload.rows.filter(row=>row.subtaskId===archivedTask.id).reduce((sum,row)=>sum+row.hours,0)*100),150);
    const recognizedTree=await archived.getReview(),recognizedAssignment=recognizedTree.tasks.find(row=>row.ownerId===archivedTask.id).assignments[0];
    assert.equal(recognizedAssignment.role,'主做');assert.equal(recognizedAssignment.reportedHours,1.5);assert.equal(recognizedAssignment.ruleHours,1.5);assert.equal(recognizedAssignment.allocationDetails.length,2);
    const recognizedAudit=await request(`/api/maintenance/subtasks/${archivedTask.id}/hour-audit`,{cookie:f.cookie});
    assert.equal(recognizedAudit.res.statusCode,200);assert.equal(recognizedAudit.payload.detail.people.length,2);assert.equal(recognizedAudit.payload.detail.actualHours,1.5);
    assert.equal(Math.round(recognizedAudit.payload.detail.people.reduce((sum,row)=>sum+row.finalHours,0)*100),150);assert.ok(recognizedAudit.payload.detail.people.every(row=>row.assignmentRole==='主做'));
    const october=await request('/api/maintenance/stats/personal/details?month=2026-10&period=month&type=nonroutine&status=confirmed',{cookie:f.cookie});
    assert.equal(october.payload.rows.find(row=>row.subtaskId===archivedTask.id),undefined);
    await request(`/api/maintenance/nonroutine-reviews/${appendCase}/sync`,{method:'POST',cookie:finalizerCookie,body:{}});
    assert.deepEqual(db.prepare('select * from maintenance_nonroutine_hour_adjustments where flight_id=?').all(archived.id),adjustments);
    assert.equal((await archived.putReview({reason:'不变的归档保存'})).res.statusCode,200);
    assert.deepEqual(db.prepare('select * from maintenance_nonroutine_hour_adjustments where flight_id=?').all(archived.id),adjustments);
  } finally {
    if(flag===undefined)delete process.env.MUC_NONROUTINE_REVIEW_ENABLED;
    else process.env.MUC_NONROUTINE_REVIEW_ENABLED=flag;
    if(finalFlag===undefined)delete process.env.MUC_NONROUTINE_FINALIZATION_ENABLED;
    else process.env.MUC_NONROUTINE_FINALIZATION_ENABLED=finalFlag;
    if(periodFlag===undefined)delete process.env.MUC_MAINTENANCE_PERIODS_ENABLED;
    else process.env.MUC_MAINTENANCE_PERIODS_ENABLED=periodFlag;
    if(notificationFlag===undefined)delete process.env.MUC_NONROUTINE_NOTIFICATIONS_ENABLED;
    else process.env.MUC_NONROUTINE_NOTIFICATIONS_ENABLED=notificationFlag;
  }
});

test('archive-only authority cannot expose private review data or overwrite merged and adjusted confirmed source facts',async()=>{
 const actor=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'archive-boundary-only',name:'仅归档授权核对员'});db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(actor.id,db.prepare("select id from rbac_roles where code='addon_archive_modify'").get().id,new Date().toISOString());db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(actor.id);
 const signed=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}}),cookie=String(signed.res.headers['Set-Cookie']).split(';')[0],flags=['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_NONROUTINE_CORRECTIONS_ENABLED'],previous=flags.map(k=>process.env[k]);
 const cases=db.prepare("select c.*,f.flight_no,ch.state as channel_state from maintenance_nonroutine_review_cases c join maintenance_flights f on f.id=c.flight_id join maintenance_nonroutine_review_channels ch on ch.case_id=c.id where f.flight_no in ('MUNRPERMISSION','MUNRIMMUTABLE') order by f.flight_no").all();assert.equal(cases.length,2);assert.deepEqual(new Set(cases.map(c=>c.channel_state)),new Set(['MERGED_CLOSED','ADJUSTED_CLOSED']));
 try{for(const k of flags)process.env[k]='1';
  for(const item of cases){
   const original=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_report_source_journal','maintenance_logs'],review=['maintenance_nonroutine_review_cases','maintenance_nonroutine_review_seats','maintenance_nonroutine_review_opinions','maintenance_nonroutine_review_events','maintenance_nonroutine_review_finals','maintenance_nonroutine_review_channels','maintenance_nonroutine_role_results','maintenance_nonroutine_hour_adjustments','maintenance_nonroutine_posting_receipts'],facts=()=>JSON.stringify([...original.map(t=>db.prepare(`select * from ${t} where ${t==='maintenance_flights'?'id':'flight_id'}=? order by id`).all(item.flight_id)),...review.map(t=>db.prepare(`select * from ${t} where ${t==='maintenance_nonroutine_review_cases'?'id':'case_id'}=? order by ${t==='maintenance_nonroutine_review_opinions'?'person_id':t==='maintenance_nonroutine_posting_receipts'?'channel_id':'id'}`).all(item.id))]),before=facts(),base=`/api/maintenance/nonroutine-reviews/${item.id}`;
   const view=await request(base,{cookie});assert.equal(view.res.statusCode,200);assert.equal(view.payload.review.opinions.length,0);assert.equal(view.payload.review.statistics,undefined);assert.ok(!JSON.stringify(view.payload).includes('PRIVATE-REAL'));assert.equal(view.payload.review.capabilities.finalize,false);
   const final=await request(base+'/finalization',{cookie});assert.equal(final.res.statusCode,200);assert.equal(final.payload.finalization.canReadPrivate,false);for(const key of ['participants','policy','reason','roleVerificationReason','statistics','opinionVersions','attempts','sourceFacts','sourceFactsAttestation'])assert.equal(final.payload.finalization[key],undefined,key);assert.ok(!JSON.stringify(final.payload).includes('PRIVATE-REAL'));
   for(const action of ['accept','opinion','seats','suggestions','preview','finalize','sync','cancel']){const result=await request(base+'/'+action,{method:'POST',cookie,body:{revision:Number(item.revision),hours:99,basis:'不得冒用归档权限',reason:'独立评议权限隔离',clientId:'archive-only-denied-'+action}});assert.ok([403,404].includes(result.res.statusCode),`${action}: ${JSON.stringify(result.payload)}`);assert.equal(facts(),before);}
   const opinion=db.prepare('select person_id from maintenance_nonroutine_review_opinions where case_id=? limit 1').get(item.id);if(opinion)assert.equal((await request(base+`/opinion-history?personId=${encodeURIComponent(opinion.person_id)}`,{cookie})).res.statusCode,403);
   assert.equal((await request('/api/maintenance/nonroutine-correction-capabilities',{cookie})).payload.approve,true);const correction=await request(`/api/maintenance/nonroutine-corrections/sources/${item.subtask_id}`,{cookie});assert.equal(correction.res.statusCode,200,JSON.stringify(correction.payload));assert.ok(!JSON.stringify(correction.payload).includes('PRIVATE-REAL'));assert.equal(facts(),before);
   const reviewUrl=`/api/maintenance/flights/${item.flight_id}/review`,tree=(await request(reviewUrl,{cookie})).payload.review,body={mode:'save',reason:'不得借原归档覆盖已认定来源',expectedUpdatedAt:tree.flight.updatedAt,tasks:tree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:t.ownerId===item.subtask_id?'检验':a.role}))}))};assert.equal((await request(reviewUrl,{method:'PUT',cookie,body})).res.statusCode,409);assert.equal(facts(),before);
   const frozen=()=>JSON.stringify([...original.filter(t=>!['maintenance_flights','maintenance_logs'].includes(t)).map(t=>db.prepare(`select * from ${t} where flight_id=? order by id`).all(item.flight_id)),...review.map(t=>db.prepare(`select * from ${t} where ${t==='maintenance_nonroutine_review_cases'?'id':'case_id'}=? order by ${t==='maintenance_nonroutine_review_opinions'?'person_id':t==='maintenance_nonroutine_posting_receipts'?'channel_id':'id'}`).all(item.id))]),stored=frozen(),unchanged={...body,tasks:tree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))};const allowed=await request(reviewUrl,{method:'PUT',cookie,body:unchanged});assert.equal(allowed.res.statusCode,200,JSON.stringify(allowed.payload));assert.equal(frozen(),stored);assert.equal(allowed.payload.review.flight.status,'已确认');
  }
 }finally{for(const [i,k]of flags.entries())if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}
});

test('archive authority stays separate across the original pending sealed and unposted review lifecycle while source revisions remain attested',async()=>{
 const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'],previous=flags.map(k=>process.env[k]);
 try{
  for(const k of flags)process.env[k]='1';process.env.MUC_MAINTENANCE_V101='draft';
  const login=async username=>{const r=await request('/api/login',{method:'POST',body:{username,password:'muc2026'}});assert.equal(r.res.statusCode,200);return {cookie:String(r.res.headers['Set-Cookie']).split(';')[0],user:r.payload.user};},root=await login('54002010'),template=db.prepare("select * from users where id='54002010'").get(),grant=(actor,code)=>db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(actor.id,db.prepare('select id from rbac_roles where code=?').get(code).id,new Date().toISOString()),scope=actor=>db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(actor.id),actor=createMaintenanceTestAccount(template,{id:'archive-lifecycle-only',name:'在途归档隔离核对'});grant(actor,'addon_archive_modify');scope(actor);const archive=await login(actor.username);
  const call=async(url,method='GET',body,cookie=root.cookie)=>{const r=await request(url,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify({url,status:r.res.statusCode,payload:r.payload}));return r.payload;};
  const flight=(await call('/api/maintenance/flights','POST',{date:'2023-05-10',flightNo:'ARCHIVE-LIFECYCLE',aircraftNo:'B-ARCLIFE',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${flight.id}`,version=async()=>(await call(base)).flight.updatedAt;
  assert.equal(db.prepare("select month from maintenance_hour_periods where month='2023-05'").get(),undefined);await call(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[{personId:root.user.personId,role:'放行'}]});
  const item={clientId:'archive-lifecycle-original',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'966',title:'归档权限全阶段原工作',reportExplanation:'原评议来源和原复核修订隔离',standardHours:2,entries:[{personId:root.user.personId,role:'主做'}]},draft=(await call(base+'/reports/nonroutine/draft','PUT',{version:0,items:[item]})).draft;await call(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft.version,items:[item]});await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});if(!(await call(base)).flight.reportFinalizedAt){const report=(await call(base+'/reports')).report;await call(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:root.user.personId});}
  const treeBody=(tree,mode='save',role=null)=>({mode,reason:'原授权复核事实修订留痕',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:t.ownerType==='subtask'&&role?role:a.role}))}))});await call(base+'/review','PUT',treeBody((await call(base+'/review')).review,'confirm'));
  const original=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id),caseId=original.id,url=`/api/maintenance/nonroutine-reviews/${caseId}`,read=()=>db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(caseId),reviewers=[];
  for(let i=0;i<12;i++){const user=createMaintenanceTestAccount(template,{id:`archive-lifecycle-reviewer-${i}`,name:`全阶段唯一评议${i}`});grant(user,'addon_nonroutine_reviewer');scope(user);reviewers.push({...user,...await login(user.username)});}
  const workTables=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_report_source_journal','maintenance_logs'],caseTables=['maintenance_nonroutine_review_cases','maintenance_nonroutine_review_seats','maintenance_nonroutine_review_opinions','maintenance_nonroutine_review_opinion_history','maintenance_nonroutine_review_events','maintenance_nonroutine_review_finals','maintenance_nonroutine_review_channels','maintenance_nonroutine_review_sync_attempts'],facts=()=>JSON.stringify([...workTables.map(t=>db.prepare(`select * from ${t} where ${t==='maintenance_flights'?'id':'flight_id'}=? order by id`).all(flight.id)),...caseTables.filter(t=>t!=='maintenance_nonroutine_review_sync_attempts').map(t=>db.prepare(`select * from ${t} where ${t.endsWith('_cases')?'id':'case_id'}=? order by ${t.endsWith('_opinions')?'person_id':'id'}`).all(caseId)),db.prepare('select * from maintenance_nonroutine_review_sync_attempts where channel_id=(select id from maintenance_nonroutine_review_channels where case_id=?) order by id').all(caseId)]);
  const assertStage=async(state,count)=>{
   assert.equal(read().state,state);const before=facts(),bounded=await call(url,'GET',undefined,archive.cookie);assert.equal(bounded.review.opinions.length,0);assert.equal(bounded.review.capabilities.readAllOpinions,false);assert.equal(bounded.review.capabilities.finalize,false);assert.equal(bounded.review.capabilities.sync,false);assert.equal(bounded.review.sourcePolicy,undefined);assert.equal(bounded.review.sourceParticipants,undefined);assert.equal(bounded.review.sourceFacts.token,undefined);assert.ok(!JSON.stringify(bounded).includes('LIFECYCLE-PRIVATE'));
   for(const action of ['accept','opinion','seats','suggestions','preview','finalize','sync','cancel']){const r=await request(url+'/'+action,{method:'POST',cookie:archive.cookie,body:{revision:Number(read().revision),hours:99,basis:'LIFECYCLE-PRIVATE-DENIED',clientId:'lifecycle-denied-'+state+'-'+action,reason:'原归档不是独立评议授权'}});assert.ok([403,404].includes(r.res.statusCode),JSON.stringify({state,action,payload:r.payload}));assert.equal(facts(),before);}assert.equal((await request(url+`/opinion-history?personId=${reviewers[0].personId}`,{cookie:archive.cookie})).res.statusCode,403);
   grant(actor,'addon_nonroutine_review_auditor');try{const full=await call(url,'GET',undefined,archive.cookie);assert.equal(full.review.capabilities.readAllOpinions,true);assert.equal(full.review.opinions.length,count);assert.ok(full.review.sourcePolicy);if(count)assert.ok(JSON.stringify(full).includes('LIFECYCLE-PRIVATE'));}finally{db.prepare("delete from rbac_user_roles where user_id=? and role_id=(select id from rbac_roles where code='addon_nonroutine_review_auditor')").run(actor.id);}const withdrawn=await call(url,'GET',undefined,archive.cookie);assert.equal(withdrawn.review.capabilities.readAllOpinions,false);assert.equal(withdrawn.review.opinions.length,0);assert.ok(!JSON.stringify(withdrawn).includes('LIFECYCLE-PRIVATE'));
   const final=(await call(url+'/finalization','GET',undefined,archive.cookie)).finalization;if(state==='FINALIZED'){assert.equal(final.canReadPrivate,false);assert.equal(final.reason,undefined);assert.equal(final.policy,undefined);assert.equal(final.sourceFacts,undefined);assert.ok(!JSON.stringify(final).includes('LIFECYCLE-PRIVATE'));}else assert.equal(final,null);assert.equal(facts(),before);assert.equal(Number(db.prepare('select count(*) n from maintenance_effective_hour_results where flight_id=?').get(flight.id).n),0);
  };
  await assertStage('PENDING_ACCEPTANCE',0);
  await call(base+'/review','PUT',treeBody((await call(base+'/review','GET',undefined,archive.cookie)).review,'save','检验'),archive.cookie);assert.equal(read().application_json,original.application_json);assert.equal(read().participants_json,original.participants_json);assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_review_events where case_id=? and event_type='SOURCE_FACTS_CHANGED'").get(caseId).n),1);
  await call(url+'/accept','POST',{revision:Number(read().revision),accountIds:reviewers.map(r=>r.id),finalizerAccountId:root.user.id});await call(url+'/opinion','POST',{revision:0,hours:1,basis:'LIFECYCLE-PRIVATE-0'},reviewers[0].cookie);await assertStage('IN_REVIEW',1);for(let i=1;i<12;i++)await call(url+'/opinion','POST',{revision:0,hours:i+1,basis:'LIFECYCLE-PRIVATE-'+i},reviewers[i].cookie);await assertStage('SEALED',12);
  const decision={revision:Number(read().revision),decision:{category:'单项工作',chapter:'966',title:item.title,workScope:item.reportExplanation,recognizedHours:2.5},participants:[{personId:root.user.personId,role:'检验'}],participantsVerified:true,roleVerificationReason:'原复核已核实角色修订，本轮使用实际角色',reason:'LIFECYCLE-PRIVATE-FINAL，核对原申请与来源事实差异',admissionDecision:'PENDING'},preview=(await call(url+'/preview','POST',decision)).preview;assert.equal(preview.sourceFacts.changed,true);const unverified=await request(url+'/finalize',{method:'POST',cookie:root.cookie,body:decision});assert.equal(unverified.res.statusCode,409);const finalized=(await call(url+'/finalize','POST',{...decision,expectedPolicyToken:preview.policyToken,sourceFactsToken:preview.sourceFacts.token,sourceFactsReviewed:true})).finalization;assert.equal(finalized.channel.state,'NEEDS_ATTENTION');assert.equal(finalized.attempts.at(-1).detail.code,'PERIOD_STATUS_UNKNOWN');await assertStage('FINALIZED',12);
  const finalRow=db.prepare('select * from maintenance_nonroutine_review_finals where case_id=?').get(caseId),opinions=db.prepare('select * from maintenance_nonroutine_review_opinions where case_id=? order by person_id').all(caseId);await call(base+'/review','PUT',treeBody((await call(base+'/review','GET',undefined,archive.cookie)).review,'save','主做'),archive.cookie);const retry=(await call(url+'/sync','POST',{})).finalization;assert.equal(retry.channel.state,'NEEDS_ATTENTION');assert.equal(retry.attempts.at(-1).detail.code,'SOURCE_FACTS_CHANGED_AFTER_FINALIZATION');assert.deepEqual(db.prepare('select * from maintenance_nonroutine_review_finals where case_id=?').get(caseId),finalRow);assert.deepEqual(db.prepare('select * from maintenance_nonroutine_review_opinions where case_id=? order by person_id').all(caseId),opinions);assert.equal(read().application_json,original.application_json);assert.equal(read().participants_json,original.participants_json);assert.equal(Number(db.prepare('select count(*) n from maintenance_effective_hour_results where flight_id=?').get(flight.id).n),0);assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_posting_receipts where case_id=?').get(caseId).n),0);
 }finally{for(const [i,k]of flags.entries())if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}
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
  const actualParticipants = db.prepare("select role from maintenance_report_entries where owner_type='subtask' and owner_id=?").all(subtask.id);
  assert.equal(actualParticipants.length,3);assert.deepEqual(new Set(actualParticipants.map(row => row.role)),new Set(['主做']));
  assert.equal(Number(db.prepare("select count(*) n from maintenance_assignments where owner_type='subtask' and owner_id=?").get(subtask.id).n),0,'review supplementation must not manufacture dispatch');
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

test('original rule updates journal actual versions, preserve old accounting, reject stale saves and roll audit or qualification failure back',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],actor=maintenancePerson(login.payload.user);
 const get=async()=>(await request('/api/maintenance/rules',{cookie})).payload;
 const write=(rules,ruleVersion,reason='规则版本及冻结核算验收')=>request('/api/maintenance/rules',{method:'PUT',cookie,body:{rules,...(ruleVersion===undefined?{}:{ruleVersion}),reason}});
 const snapshot=()=>({rules:db.prepare('select * from maintenance_hour_rules order by id').all(),history:db.prepare('select * from maintenance_rule_change_history order by revision').all()});
 const initial=await get(),original=initial.rules,changed=original.map(row=>row.rule_type==='nonroutineCombinationRatio'&&row.combination==='主做+检验'?{...row,value:row.role==='主做'?0.51:0.49}:row),money=db.prepare('select * from maintenance_hour_results order by id').all();
 const frozenPolicies=db.prepare('select subtask_id,policy_json from maintenance_nonroutine_assessments order by subtask_id').all();
 const beforeRead=snapshot();const read=await request('/api/maintenance/rules/history',{cookie});assert.equal(read.res.statusCode,200);assert.deepEqual(snapshot(),beforeRead);assert.ok(!JSON.stringify(read.payload).includes('qualification_json'));
 try{
  const saved=await write(changed,initial.ruleVersion);assert.equal(saved.res.statusCode,200,JSON.stringify(saved.payload));assert.equal(saved.payload.ruleVersion.revision,initial.ruleVersion.revision+1);assert.deepEqual(db.prepare('select * from maintenance_hour_results order by id').all(),money);
  assert.deepEqual(db.prepare('select subtask_id,policy_json from maintenance_nonroutine_assessments order by subtask_id').all(),frozenPolicies);
  const after=snapshot();assert.equal((await write(original,initial.ruleVersion)).res.statusCode,409);assert.deepEqual(snapshot(),after);
  const noChange=await write(changed,saved.payload.ruleVersion);assert.equal(noChange.res.statusCode,200);assert.equal(noChange.payload.ruleVersion.revision,saved.payload.ruleVersion.revision);
  const legacy=await write(original,undefined);assert.equal(legacy.res.statusCode,200);const latest=(await request('/api/maintenance/rules/history',{cookie})).payload;assert.equal(latest.items[0].writeMode,'LEGACY_UNVERSIONED');assert.ok(latest.items[0].changes.some(row=>row.name==='主做+检验::主做'&&row.beforeValue===0.51));
  for(const table of ['maintenance_rule_change_history','audit_logs']){
   const before=snapshot(),drop=installFailureTrigger('fail_rule_journal',table,'insert',table==='audit_logs'?"new.action='maintenance_update_rules'":'1=1','injected rule version audit failure');
   try{assert.equal((await write(changed,(await get()).ruleVersion)).res.statusCode,500);assert.deepEqual(snapshot(),before);}finally{drop();}
  }
  const originalExec=db.exec,before=snapshot(),oldStatus=db.prepare('select status from users where id=?').get(actor.id).status;let injected=false;
  db.exec=sql=>{if(!injected&&/^begin immediate$/i.test(String(sql).trim())){injected=true;db.prepare("update users set status='inactive' where id=?").run(actor.id);}return originalExec(sql);};
  try{const blocked=await write(changed,legacy.payload.ruleVersion);assert.equal(injected,true);assert.equal(blocked.res.statusCode,403,JSON.stringify(blocked.payload));assert.deepEqual(snapshot(),before);}finally{db.exec=originalExec;db.prepare('update users set status=? where id=?').run(oldStatus,actor.id);}
  const worker=createMaintenanceTestAccount(db.prepare('select * from users where id=?').get(actor.id),{id:'rule-history-worker',name:'规则历史无权人员'}),workerLogin=await request('/api/login',{method:'POST',body:{username:worker.username,password:'muc2026'}});assert.equal((await request('/api/maintenance/rules/history',{cookie:String(workerLogin.res.headers['Set-Cookie']).split(';')[0]})).res.statusCode,403);
 }finally{const current=await get();assert.equal((await write(original,current.ruleVersion,'恢复隔离验收原配置')).res.statusCode,200);}
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

test("pure routine auto confirmation shares finalization, exclusions, rollback and concurrency", async t => {
  const priorShadow = process.env.MUC_MAINTENANCE_MODULE_SHADOW_ENABLED;
  const priorInstances = process.env.MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED;
  const priorCoordinator=process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED;
  process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED='1';
  process.env.MUC_MAINTENANCE_MODULE_SHADOW_ENABLED = "1";
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => {
    if (String(args[0]).includes("maintenance_transition_shadow_")) warnings.push(args[0]);
    else warn(...args);
  };
  t.after(() => {
    if(priorCoordinator===undefined)delete process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED;else process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED=priorCoordinator;
    console.warn = warn;
    if (priorShadow === undefined) delete process.env.MUC_MAINTENANCE_MODULE_SHADOW_ENABLED;
    else process.env.MUC_MAINTENANCE_MODULE_SHADOW_ENABLED = priorShadow;
    if (priorInstances === undefined) delete process.env.MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED;
    else process.env.MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED = priorInstances;
    assert.deepEqual(warnings, []);
  });
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
  delete process.env.MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED;
  const legacyId = await create();
  assert.equal(db.prepare("select opportunity_key from maintenance_opportunity_rule_snapshots where opportunity_key=?").get(legacyId), undefined);
  process.env.MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED = "1";
  const legacyModules = await request(`/api/maintenance/flights/${legacyId}/report-modules`, { cookie });
  assert.ok(legacyModules.payload.modules.every(module => module.identitySource === "LEGACY_ADAPTER"));
  assert.equal(db.prepare("select opportunity_key from maintenance_opportunity_rule_snapshots where opportunity_key=?").get(legacyId), undefined);
  const failModuleCreation = installFailureTrigger("fail_module_creation", "maintenance_module_instances", "insert", "new.module_code='routine_report'", "injected module creation failure");
  const flightCount = Number(db.prepare("select count(*) n from maintenance_flights").get().n);
  const snapshotCount = Number(db.prepare("select count(*) n from maintenance_opportunity_rule_snapshots").get().n);
  try {
    const failed = await request("/api/maintenance/flights", { method:"POST",cookie,body:{date:"2026-10-11",flightNo:"MODULE_ROLLBACK",aircraftNo:"BROLLBACK",aircraftType:"A320",workKind:"短停"} });
    assert.equal(failed.res.statusCode, 500);
    assert.equal(Number(db.prepare("select count(*) n from maintenance_flights").get().n), flightCount);
    assert.equal(Number(db.prepare("select count(*) n from maintenance_opportunity_rule_snapshots").get().n), snapshotCount);
  } finally { failModuleCreation(); }
  const deletableModuleFlight = await create();
  const deletedModuleFlight = await request(`/api/maintenance/flights/${deletableModuleFlight}`, {method:"DELETE",cookie,body:{reason:"合成模块留痕删除验证"}});
  assert.equal(deletedModuleFlight.res.statusCode,200,JSON.stringify(deletedModuleFlight.payload));
  assert.equal(db.prepare("select opportunity_id from maintenance_opportunity_rule_snapshots where opportunity_key=?").get(deletableModuleFlight).opportunity_id,null);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_module_instances where opportunity_key=? and opportunity_id is null").get(deletableModuleFlight).n),3);
  const deletionTrace=JSON.parse(db.prepare("select detail from maintenance_logs where flight_id=? and action='delete_flight'").get(deletableModuleFlight).detail);
  assert.equal(deletionTrace.before.moduleInstances.length,3);
  assert.equal((await request(`/api/maintenance/flights/${deletableModuleFlight}/report-modules`,{cookie})).res.statusCode,404);
  const moduleImportRow={date:"2026-10-11",flightNo:"MODULE_IMPORT",aircraftNo:"BMODIMPORT",aircraftType:"A320",workKind:"短停"};
  for (const created of [1,0]) {
    const imported=await request("/api/maintenance/flights/import",{method:"POST",cookie,body:{rows:[moduleImportRow]}});
    assert.equal(imported.res.statusCode,200,JSON.stringify(imported.payload));
    assert.equal(imported.payload.created,created);
  }
  const moduleImportId=db.prepare("select id from maintenance_flights where flight_no='MODULE_IMPORT'").get().id;
  assert.equal(Number(db.prepare("select count(*) n from maintenance_module_instances where opportunity_id=?").get(moduleImportId).n),3);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_logs where flight_id=? and action='create_module_instances'").get(moduleImportId).n),1);
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
    const path = `/api/maintenance/flights/${id}/report-modules`;
    const moduleView = await request(path, { cookie });
    assert.equal(moduleView.res.statusCode, 200, JSON.stringify(moduleView.payload));
    const modules = moduleView.payload.modules;
    assert.equal(modules.length, 3);
    assert.ok(modules.every(module => module.identitySource === "PERSISTED" && module.ruleSnapshotSha256.length === 64));
    assert.equal(Number(db.prepare("select count(*) n from maintenance_module_instances where opportunity_id=?").get(id).n),3);
    assert.equal(modules.find(module => module.moduleTypeCode === "release_report").resultSource.type, "RELEASE_COUNT");
    assert.equal(modules.find(module => module.moduleTypeCode === "routine_report").resultSource.category, "ROUTINE");
    assert.equal(modules.find(module => module.moduleTypeCode === "nonroutine_report").applicability, "NOT_APPLICABLE");
    assert.deepEqual((await request(path, { cookie })).payload, moduleView.payload);
    delete process.env.MUC_MAINTENANCE_MODULE_SHADOW_ENABLED;
    try { assert.equal((await request(path, { cookie })).res.statusCode, 404); }
    finally { process.env.MUC_MAINTENANCE_MODULE_SHADOW_ENABLED = "1"; }

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
    const gateEvents=db.prepare("select detail from maintenance_logs where flight_id=? and action='coordinator_transition'").all(id).map(row=>JSON.parse(row.detail));
    for(const action of ['RECONCILE','APPLY_FINALIZE_REPORT','CONFIRM_REVIEW'])assert.ok(gateEvents.some(event=>event.action===action));
    assert.ok(gateEvents.every(event=>event.gateRuleVersion==='legacy-report-gates-v1'&&event.predicates.every(predicate=>typeof predicate.satisfied==='boolean')));
    assert.equal((await request(`/api/maintenance/flights/${id}/review`, { method: "PUT", cookie, body: { mode: "save", tasks, reason: "并发校验", expectedUpdatedAt: stale } })).res.statusCode, 409);
  }
  for (const kind of ["航后", "三方航后", "航后/航前"]) {
    const id = await create(kind);
    assert.equal((await submit(id, "release")).res.statusCode, 200);
    const routine = await submit(id, "routine", { automatic: true });
    assert.equal(routine.res.statusCode, 200, JSON.stringify(routine.payload));
    assert.equal(routine.payload.flight.status, "已提报");
    assert.equal(routine.payload.flight.reportFinalizedAt, "");
    const beforeReleaseCheck = db.prepare("select * from maintenance_flights where id=?").get(id);
    const wrongRelease = await request(`/api/maintenance/flights/${id}/report-confirmation`, {method:"POST",cookie,body:{routineEntries:[{role:"接机",personId:person.personId}],releasePersonId:"synthetic-wrong-person"}});
    assert.equal(wrongRelease.res.statusCode,409,JSON.stringify(wrongRelease.payload));
    assert.deepEqual(db.prepare("select * from maintenance_flights where id=?").get(id),beforeReleaseCheck);
    if (kind === "航后") {
      const mismatchPerson = createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(), {id:"release-mismatch-peer",name:"放行核对合成人员"});
      db.prepare("update maintenance_assignments set person_id=?,user_name=? where owner_type='flight' and owner_id=? and role='放行'").run(mismatchPerson.personId,mismatchPerson.name,id);
      try {
        const mismatched = await request(`/api/maintenance/flights/${id}/report-confirmation`, {method:"POST",cookie,body:{routineEntries:[{role:"接机",personId:person.personId}]}});
        assert.equal(mismatched.res.statusCode,409,JSON.stringify(mismatched.payload));
        assert.deepEqual(db.prepare("select * from maintenance_flights where id=?").get(id),beforeReleaseCheck);
      } finally { db.prepare("update maintenance_assignments set person_id=?,user_name=? where owner_type='flight' and owner_id=? and role='放行'").run(person.personId,person.name,id); }
    }
    const manual = await request(`/api/maintenance/flights/${id}/report-confirmation`, { method: "POST", cookie, body: { routineEntries: [{ role: "接机", personId: person.personId }] } });
    assert.equal(manual.res.statusCode, 200, JSON.stringify(manual.payload));
    assert.equal(manual.payload.flight.status, "待复核");
    assert.equal(manual.payload.flight.reportFinalizationMode, "manual");
  }
  // Change authoritative data just before the real transaction begins. These
  // are committed fixture changes, not mutations inside the rolled-back call.
  for (const change of ["reporter", "routine-status", "finalized", "draft"]) {
    const id = await create("航后");
    assert.equal((await submit(id,"release")).res.statusCode,200);
    assert.equal((await submit(id,"routine")).res.statusCode,200);
    const before=db.prepare("select * from maintenance_flights where id=?").get(id);
    const resultFacts = () => Object.fromEntries(["maintenance_assignments","maintenance_hour_results","maintenance_sortie_results","maintenance_report_entries"].map(table=>[table,db.prepare(`select * from ${table} where flight_id=? order by id`).all(id)]));
    const beforeResults=resultFacts();
    const originalExec=db.exec;
    let injected=false;
    db.exec=sql=>{
      if (!injected && /^begin immediate$/i.test(String(sql).trim())) {
        injected=true;
        if (change === "reporter") db.prepare("update maintenance_report_batches set submitted_by='release-mismatch-peer' where flight_id=? and report_type='release'").run(id);
        if (change === "routine-status") db.prepare("update maintenance_report_batches set status='未提报' where flight_id=? and report_type='routine'").run(id);
        if (change === "finalized") db.prepare("update maintenance_flights set status='待复核',report_finalized_at='2026-10-11T01:00:00Z' where id=?").run(id);
        if (change === "draft") db.prepare("insert into maintenance_report_drafts(id,flight_id,report_type,payload_json,version,created_at,updated_at) values(?,?,'nonroutine',?,1,'test','test')").run('locked-draft-'+id,id,JSON.stringify({items:[{title:'并发新增未提报草稿'}]}));
      }
      return originalExec(sql);
    };
    try {
      const result=await request(`/api/maintenance/flights/${id}/report-confirmation`,{method:"POST",cookie,body:{routineEntries:[{role:"接机",personId:person.personId}]}});
      assert.equal(injected,true);
      assert.equal(result.res.statusCode,change === "draft" || change === "finalized" ? 409 : 400,JSON.stringify(result.payload));
      assert.equal(Number(db.prepare("select count(*) n from maintenance_logs where flight_id=? and action='report_finalize'").get(id).n),0);
      assert.deepEqual(resultFacts(),beforeResults);
      if (change === "finalized") {
        assert.equal(db.prepare("select report_finalized_at from maintenance_flights where id=?").get(id).report_finalized_at,'2026-10-11T01:00:00Z');
      } else assert.deepEqual(db.prepare("select * from maintenance_flights where id=?").get(id),before);
    } finally { db.exec=originalExec; }
    if (change === "reporter") db.prepare("update maintenance_report_batches set submitted_by=? where flight_id=? and report_type='release'").run(login.payload.user.id,id);
    if (change === "routine-status") db.prepare("update maintenance_report_batches set status='已提报' where flight_id=? and report_type='routine'").run(id);
    if (change === "finalized") db.prepare("update maintenance_flights set status=?,report_finalized_at=? where id=?").run(before.status,before.report_finalized_at,id);
    if (change === "draft") db.prepare("delete from maintenance_report_drafts where id=?").run('locked-draft-'+id);
    const retried=await request(`/api/maintenance/flights/${id}/report-confirmation`,{method:"POST",cookie,body:{routineEntries:[{role:"接机",personId:person.personId}]}});
    assert.equal(retried.res.statusCode,200,JSON.stringify(retried.payload));
    assert.equal(retried.payload.flight.status,'待复核');
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
  const draftModulePath = `/api/maintenance/flights/${drafted}/report-modules`;
  assert.equal((await request(draftModulePath)).res.statusCode, 401);
  const draftModules = await request(draftModulePath, { cookie });
  const nonroutine = draftModules.payload.modules.find(module => module.moduleTypeCode === "nonroutine_report");
  assert.equal(nonroutine.moduleBusinessState, "DRAFT");
  assert.equal(nonroutine.countsAsFormalReportSubmission, false);
  assert.equal(nonroutine.resultSource, null);


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
  const guarded=await create(),guardedSnapshot=()=>Object.fromEntries(['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_logs'].map(table=>[table,db.prepare(`select * from ${table} where ${table==='maintenance_flights'?'id':'flight_id'}=? order by id`).all(guarded)]));
  const guardedBefore=guardedSnapshot(),frozen=db.prepare('select * from maintenance_opportunity_rule_snapshots where opportunity_key=?').get(guarded);
  db.prepare("update maintenance_opportunity_rule_snapshots set content_sha256='tampered-fixture' where opportunity_key=?").run(guarded);
  try{
    assert.equal((await submit(guarded,'routine')).res.statusCode,409);assert.deepEqual(guardedSnapshot(),guardedBefore);
    const row=guardedBefore.maintenance_flights[0],edited=await request(`/api/maintenance/flights/${guarded}`,{method:'PUT',cookie,body:{date:row.date,flightNo:row.flight_no,departureFlightNo:row.departure_flight_no,aircraftNo:row.aircraft_no,aircraftType:row.aircraft_type,workKind:row.work_kind,remark:'不得在规则失败后残留'}});assert.equal(edited.res.statusCode,409,JSON.stringify(edited.payload));assert.deepEqual(guardedSnapshot(),guardedBefore);
  }finally{db.prepare('update maintenance_opportunity_rule_snapshots set content_sha256=? where opportunity_key=?').run(frozen.content_sha256,guarded);}
  const rejectGateAudit=installFailureTrigger('fail_coordinator_audit','maintenance_logs','insert',"new.action='coordinator_transition'",'injected coordinator audit failure');
  try{assert.equal((await submit(guarded,'routine')).res.statusCode,500);assert.deepEqual(guardedSnapshot(),guardedBefore);}finally{rejectGateAudit();}
  assert.equal((await submit(guarded,'routine')).res.statusCode,200);assert.equal((await submit(guarded,'release')).payload.flight.status,'待复核');
});

test('attendance endpoints enforce login and distinguish real missing coverage',async()=>{
  assert.equal((await request('/api/attendance/status')).res.statusCode,401);
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
  const status=await request('/api/attendance/status',{cookie});assert.equal(status.res.statusCode,200);assert.equal(typeof status.payload.configuration.configured,'boolean');assert.ok(!JSON.stringify(status.payload).includes('appSecret'));
  const days=await request('/api/attendance/days?month=2026-09',{cookie});assert.equal(days.res.statusCode,200);assert.equal(days.payload.dates.length,30);assert.ok(days.payload.people.every(p=>p.days.length===30));
  const summary=await request('/api/attendance/summary?month=2026-09&view=summary',{cookie});assert.equal(summary.res.statusCode,200);assert.equal(summary.payload.detailLevel,'summary');assert.ok(summary.payload.people.every(p=>!p.days&&p.dayCount===30));assert.deepEqual(summary.payload.people.map(p=>p.counts),days.payload.people.map(p=>p.counts));assert.match(summary.res.headers['Server-Timing'],/attendance_read;dur=.*attendance_classify;dur=.*attendance_metadata;dur=.*attendance_serialize;dur=.*db;dur=.*app;dur=/);
  const compact=await request('/api/attendance/days?month=2026-09&view=compact',{cookie});assert.equal(compact.res.statusCode,200);assert.ok(compact.payload.people.every(p=>p.days.every(d=>!('input' in d))));
  assert.equal((await request('/api/attendance/person?month=2026-09',{cookie})).res.statusCode,400);
  assert.equal((await request('/api/attendance/days?month=2026-09&view=invalid',{cookie})).res.statusCode,400);
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


async function verifyWorkStandardIntakeApi(caseId,rootCookie,finalizerCookie){
  const keys=['MUC_STANDARDS_REVIEW_ENABLED','MUC_STANDARDS_PUBLICATION_ENABLED'],previous=keys.map(key=>process.env[key]),configBefore=db.prepare("select * from settings where key='maintenance_aircraft_hours_v1'").get();
  const account=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'work-standard-intake-publisher',name:'施工转标准独立发布负责人'});
  db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(account.id,db.prepare("select id from rbac_roles where code='addon_maintenance_standard_publisher'").get().id,new Date().toISOString());
  db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(account.id);
  const login=await request('/api/login',{method:'POST',body:{username:account.username,password:'muc2026'}});assert.equal(login.res.statusCode,200);const cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
  const tables=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_nonroutine_hour_adjustments','maintenance_nonroutine_role_results','maintenance_nonroutine_review_cases','maintenance_nonroutine_review_channels','maintenance_nonroutine_review_finals','maintenance_nonroutine_review_opinions','maintenance_nonroutine_review_events','maintenance_nonroutine_posting_receipts'];
  const facts=()=>tables.map(table=>JSON.stringify(db.prepare(`select * from ${table} order by ${table==='maintenance_nonroutine_posting_receipts'?'channel_id':table==='maintenance_nonroutine_review_opinions'?'case_id,person_id':'id'}`).all())),before=facts(),roundCount=Number(db.prepare('select count(*) n from maintenance_standard_review_cases').get().n);
  const url=`/api/maintenance/standard-publication-work-sources/${caseId}`;
  try{
    process.env.MUC_STANDARDS_REVIEW_ENABLED='1';delete process.env.MUC_STANDARDS_PUBLICATION_ENABLED;
    assert.equal((await request(url,{cookie})).res.statusCode,404);process.env.MUC_STANDARDS_PUBLICATION_ENABLED='1';
    for(const blocked of [rootCookie,finalizerCookie]){assert.equal((await request(url,{cookie:blocked})).res.statusCode,403);assert.equal((await request(`${url}/intake`,{method:'POST',cookie:blocked,body:{}})).res.statusCode,403);}
    const source=await request(url,{cookie});assert.equal(source.res.statusCode,200,JSON.stringify(source.payload));assert.equal(source.payload.workSource.canIntake,true);assert.equal(source.payload.workSource.source.decision.recognizedHours,0);assert.equal(source.payload.workSource.source.statistics,undefined);assert.equal(source.payload.workSource.source.participants,undefined);assert.equal(source.payload.workSource.source.reason,undefined);
    const body={finalId:source.payload.workSource.source.finalId,aircraftCodes:['A320'],genericAircraft:false,reason:'施工终审锁定五项作为独立标准候选',clientId:'work-intake-api-client'};
    assert.equal((await request(`${url}/intake`,{method:'POST',cookie,body:{...body,recognizedHours:99}})).res.statusCode,400);
    const count=Number(db.prepare('select count(*) n from maintenance_standards').get().n),drop=installFailureTrigger('fail_work_intake_api','maintenance_standard_work_sources','insert',"new.client_id='work-intake-api-client'",'injected work intake failure');
    try{assert.ok((await request(`${url}/intake`,{method:'POST',cookie,body})).res.statusCode>=400);assert.equal(Number(db.prepare('select count(*) n from maintenance_standards').get().n),count);assert.deepEqual(facts(),before);}finally{drop();}
    const created=await request(`${url}/intake`,{method:'POST',cookie,body});assert.equal(created.res.statusCode,200,JSON.stringify(created.payload));assert.equal(created.payload.result.source.kind,'WORK_FINAL');assert.equal(created.payload.result.admission,null);assert.equal(created.payload.result.publication,null);
    assert.equal((await request(`${url}/intake`,{method:'POST',cookie,body})).payload.replayed,true);assert.equal((await request(`${url}/intake`,{method:'POST',cookie,body:{...body,reason:'改变重试内容'}})).res.statusCode,409);assert.equal((await request(`${url}/intake`,{method:'POST',cookie,body:{...body,clientId:'work-intake-other'}})).res.statusCode,409);
    const versionId=created.payload.result.version.id,standardId=created.payload.result.standard.id,pubUrl=`/api/maintenance/standard-publications/${standardId}/versions/${versionId}`;
    const list=await request(`/api/maintenance/standard-publication-work-sources?search=${encodeURIComponent(source.payload.workSource.source.decision.title)}`,{cookie});assert.ok(list.payload.items.some(item=>item.caseId===caseId&&item.prepared.versionId===versionId));
    let current=created.payload.result;
    for(const decision of ['PENDING','EXCLUDE','INCLUDE']){
      const admission=await request(`${pubUrl}/admit`,{method:'POST',cookie,body:{revision:current.standard.revision,versionId,decision,reason:`独立准入结论 ${decision}`,clientId:`work-intake-admit-${decision}`}});assert.equal(admission.res.statusCode,200,JSON.stringify(admission.payload));current=admission.payload.result;assert.equal(current.publication,null);
      if(decision!=='INCLUDE')assert.equal((await request(`${pubUrl}/publish`,{method:'POST',cookie,body:{revision:current.standard.revision,versionId,admissionId:current.admission.id,reason:'尚不能发布',clientId:`work-intake-reject-${decision}`,effectiveAt:'IMMEDIATE'}})).res.statusCode,409);
    }
    db.prepare("insert into settings(key,value,updated_at) values('maintenance_aircraft_hours_v1',?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at").run(JSON.stringify({version:9988,groups:[{id:'work-source-exact',name:'施工转标准核验',codes:['A320'],enabled:true,hours:{}}]}),new Date().toISOString());
    const publishBody={revision:current.standard.revision,versionId,admissionId:current.admission.id,reason:'负责人独立核验机型并发布',clientId:'work-intake-publish-api',effectiveAt:'IMMEDIATE'};
    const published=await request(`${pubUrl}/publish`,{method:'POST',cookie,body:publishBody});assert.equal(published.res.statusCode,200,JSON.stringify(published.payload));assert.equal(published.payload.result.version.status,'PUBLISHED');assert.equal(published.payload.result.source.decision.recognizedHours,0);assert.equal((await request(`${pubUrl}/publish`,{method:'POST',cookie,body:publishBody})).payload.replayed,true);
    assert.equal(db.prepare('select final_id from maintenance_standard_work_publications where version_id=?').get(versionId).final_id,body.finalId);assert.equal(Number(db.prepare('select count(*) n from maintenance_standard_review_cases').get().n),roundCount);assert.deepEqual(facts(),before);
  }finally{for(const [index,key] of keys.entries())if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];if(configBefore)db.prepare("update settings set value=?,updated_at=? where key='maintenance_aircraft_hours_v1'").run(configBefore.value,configBefore.updated_at);else db.prepare("delete from settings where key='maintenance_aircraft_hours_v1'").run();}
}


async function verifyPublishedStandardRevisionApi({standardId,versionId,cookie,managerCookie,publisherCookie,finalCookie,members,finalizer,login}){
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED'],previous=flags.map(key=>process.env[key]);
  const {createMaintenanceStandards}=await import('../maintenance-standards.mjs'),catalog=createMaintenanceStandards({db}),url=`/api/maintenance/standard-management/${standardId}`;
  const oldVersion=db.prepare('select * from maintenance_standard_versions where id=?').get(versionId),oldFinal=db.prepare('select * from maintenance_standard_review_finals where version_id=?').get(versionId),oldPublication=db.prepare('select * from maintenance_standard_publications where version_id=?').get(versionId);
  try{
    process.env.MUC_MAINTENANCE_V101='draft';for(const key of flags.slice(1))process.env[key]='1';
    const work=await supplementalWorkFixture('MUPUBLISHEDREF');db.prepare("update maintenance_flights set status='已派工',aircraft_type='A320' where id=?").run(work.id);
    const reportUrl=`/api/maintenance/flights/${work.id}/reports/nonroutine`,item={clientId:'old-standard-reference',temporary:true,standardId,standardVersion:1,category:oldVersion.category,chapter:oldVersion.chapter,title:oldVersion.title,reportExplanation:oldVersion.work_scope,standardHours:0,entries:[{personId:work.user.personId,role:'主做'}]};
    const saved=await request(`${reportUrl}/draft`,{method:'PUT',cookie:work.cookie,body:{items:[item],version:0}});assert.equal(saved.res.statusCode,200,JSON.stringify(saved.payload));
    const submitted=await request(reportUrl,{method:'PUT',cookie:work.cookie,body:{mode:'submit',items:[item],draftVersion:saved.payload.draft.version}});assert.equal(submitted.res.statusCode,200,JSON.stringify(submitted.payload));
    const current=(await request(`/api/maintenance/flights/${work.id}/reports`,{cookie:work.cookie})).payload.report;
    assert.equal((await work.report({nonroutineItems:current.nonroutine.items})).res.statusCode,200);
    const confirmed=await work.putReview({mode:'confirm',routineElectronicSigned:false,nonroutineElectronicSigned:false});assert.equal(confirmed.res.statusCode,200,JSON.stringify(confirmed.payload));
    const tables=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_nonroutine_assessments','maintenance_nonroutine_review_cases','maintenance_nonroutine_manual_sources'];
    const facts=()=>tables.map(table=>db.prepare(`select * from ${table}`).all().map(row=>JSON.stringify(row)).sort()),before=facts();
    assert.ok(db.prepare("select 1 from maintenance_hour_results where flight_id=? and status='已确认' and hours=0").get(work.id));
    const source=db.prepare('select * from maintenance_nonroutine_manual_sources where flight_id=?').get(work.id);assert.equal(JSON.parse(source.standard_snapshot_json).version,1);
    const initial=(await request(url,{cookie})).payload;assert.equal(initial.versions[0].lifecycle,'EFFECTIVE');
    const definition={category:oldVersion.category,chapter:oldVersion.chapter,title:oldVersion.title,workScope:oldVersion.work_scope,standardHours:1.2,aircraftCodes:['A320'],genericAircraft:false};
    const base={revision:initial.standard.revision,baseVersion:1,definition,reason:'已发布工时从0修订为1.2，独立12人评议',clientId:'published-revision-race-a'};
    for(const blocked of [managerCookie,publisherCookie])assert.equal((await request(`${url}/revise`,{method:'POST',cookie:blocked,body:base})).res.statusCode,403);
    const requests=[base,{...base,clientId:'published-revision-race-b'}],raced=await Promise.all(requests.map(body=>request(`${url}/revise`,{method:'POST',cookie,body})));assert.deepEqual(raced.map(item=>item.res.statusCode).sort(),[200,409]);const winner=raced.findIndex(item=>item.res.statusCode===200),draft=raced[winner].payload,newVersion=draft.versions[0].id;
    assert.equal((await request(`${url}/revise`,{method:'POST',cookie,body:requests[winner]})).payload.operation.replayed,true);assert.equal(draft.versions[0].version,2);assert.equal(draft.versions[0].lifecycle,'DRAFT');assert.equal(catalog.list({aircraftCode:'A320'}).items.find(item=>item.id===standardId).version,1);
    const reviewBody={revision:draft.standard.revision,versionId:newVersion,reason:'申请与新增标准同样的12人封闭评议',clientId:'published-revision-request'};
    assert.equal((await request(`${url}/request-review`,{method:'POST',cookie:managerCookie,body:reviewBody})).res.statusCode,403);
    const requested=await request(`${url}/request-review`,{method:'POST',cookie,body:reviewBody});assert.equal(requested.res.statusCode,200,JSON.stringify(requested.payload));assert.equal((await request(`${url}/request-review`,{method:'POST',cookie,body:reviewBody})).payload.replayed,true);
    const caseId=requested.payload.review.id,reviewUrl=`/api/maintenance/standard-reviews/${caseId}`;assert.equal(db.prepare('select base_version_id from maintenance_standard_review_cases where id=?').get(caseId).base_version_id,versionId);
    assert.equal((await request(`${reviewUrl}/accept`,{method:'POST',cookie,body:{revision:1,accountIds:members.map(member=>member.id),finalizerAccountId:finalizer.id}})).res.statusCode,200);
    for(const member of members){const opinion=await request(`${reviewUrl}/opinion`,{method:'POST',cookie:await login(member.username),body:{revision:0,hours:1.2,basis:'PRIVATE-PUBLISHED-REVISION'}});assert.equal(opinion.res.statusCode,200,JSON.stringify(opinion.payload));}
    const decision={revision:3,decision:{category:definition.category,chapter:definition.chapter,title:definition.title,workScope:definition.workScope,recognizedHours:1.2},admissionDecision:'INCLUDE',reason:'独立认定新版工时'};
    const finalized=await request(`${reviewUrl}/finalize`,{method:'POST',cookie:finalCookie,body:decision});assert.equal(finalized.res.statusCode,200,JSON.stringify(finalized.payload));assert.equal(finalized.payload.finalization.published,false);assert.equal(catalog.list({aircraftCode:'A320'}).items.find(item=>item.id===standardId).version,1);
    const publicationUrl=`/api/maintenance/standard-publications/${standardId}/versions/${newVersion}`,locked=await request(publicationUrl,{cookie:publisherCookie});assert.equal(locked.payload.result.admission,null);assert.equal(locked.payload.result.source.reviewAdmissionIntent,'INCLUDE');assert.ok(!JSON.stringify(locked.payload).includes('PRIVATE-PUBLISHED-REVISION'));
    const admission=await request(`${publicationUrl}/admit`,{method:'POST',cookie:publisherCookie,body:{revision:locked.payload.result.standard.revision,versionId:newVersion,decision:'INCLUDE',reason:'新版独立准入',clientId:'published-revision-admit'}});assert.equal(admission.res.statusCode,200,JSON.stringify(admission.payload));
    const publishBody={revision:admission.payload.result.standard.revision,versionId:newVersion,admissionId:admission.payload.result.admission.id,reason:'精确机型核验后发布修订版本',clientId:'published-revision-publish',effectiveAt:'IMMEDIATE'};
    const published=await request(`${publicationUrl}/publish`,{method:'POST',cookie:publisherCookie,body:publishBody});assert.equal(published.res.statusCode,200,JSON.stringify(published.payload));assert.equal(published.payload.result.version.lifecycle,'EFFECTIVE');assert.equal((await request(`${publicationUrl}/publish`,{method:'POST',cookie:publisherCookie,body:publishBody})).payload.replayed,true);
    const versions=(await request(url,{cookie})).payload.versions;assert.equal(versions.find(item=>item.id===versionId).lifecycle,'SUPERSEDED');assert.equal(versions.find(item=>item.id===newVersion).lifecycle,'EFFECTIVE');assert.equal(catalog.list({aircraftCode:'A320'}).items.find(item=>item.id===standardId).standardHours,1.2);
    assert.deepEqual(db.prepare('select * from maintenance_standard_versions where id=?').get(versionId),oldVersion);assert.deepEqual(db.prepare('select * from maintenance_standard_review_finals where id=?').get(oldFinal.id),oldFinal);assert.deepEqual(db.prepare('select * from maintenance_standard_publications where id=?').get(oldPublication.id),oldPublication);assert.deepEqual(facts(),before);assert.deepEqual(db.prepare('select * from maintenance_nonroutine_manual_sources where flight_id=?').get(work.id),source);
  }finally{for(const [index,key]of flags.entries())if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];}
}

test('standard file maintenance is separate, source-idempotent and atomic per row without work, review or publication writes',async()=>{
 const keys=['MUC_STANDARDS_MANAGEMENT_ENABLED','MUC_STANDARDS_IMPORT_ENABLED'],previous=keys.map(key=>process.env[key]),template=db.prepare("select * from users where id='54002010'").get();
 const login=async username=>{const result=await request('/api/login',{method:'POST',body:{username,password:'muc2026'}});assert.equal(result.res.statusCode,200);return String(result.res.headers['Set-Cookie']).split(';')[0];};
 const makeManager=id=>{const account=createMaintenanceTestAccount(template,{id,name:'标准文件维护'+id});db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(account.id,db.prepare("select id from rbac_roles where code='addon_maintenance_standard_manager'").get().id,new Date().toISOString());db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(account.id);return account;};
 const manager=makeManager('file-standard-manager'),other=makeManager('file-standard-other'),worker=createMaintenanceTestAccount(template,{id:'file-standard-worker',name:'无标准维护授权'}),cookie=await login(manager.username),otherCookie=await login(other.username),workerCookie=await login(worker.username);
 const tables=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_nonroutine_assessments','maintenance_nonroutine_review_cases','maintenance_nonroutine_review_finals','maintenance_standard_review_cases','maintenance_standard_review_finals','maintenance_standard_publications','maintenance_standard_work_publications'];
 const facts=()=>tables.map(table=>db.prepare(`select * from ${table}`).all().map(row=>JSON.stringify(row)).sort()),before=facts(),prefix='/api/maintenance/standard-import',header='类别,ATA,工作名称,工作范围,草稿工时,适用机型,通用适用,标准ID,标准版本';
 const file=content=>({filename:'标准维护.csv',contentBase64:Buffer.from(content).toString('base64')}),payload=file(`${header}\n单项工作,29,批量标准API新建,明确范围,0,A320,否,,\n单项工作,29,不完整标准,缺工时,,A320,否,,\n单项工作,29,独立标准API样例,不同工作范围,1,A320,否,,`);
 try{
  process.env.MUC_STANDARDS_MANAGEMENT_ENABLED='1';delete process.env.MUC_STANDARDS_IMPORT_ENABLED;
  assert.equal((await request('/api/maintenance/standard-management-capabilities',{cookie})).payload.importEnabled,false);assert.equal((await request(prefix+'/preview',{method:'POST',cookie,body:payload})).res.statusCode,404);process.env.MUC_STANDARDS_IMPORT_ENABLED='1';assert.equal((await request('/api/maintenance/standard-management-capabilities',{cookie})).payload.importEnabled,true);
  assert.equal((await request(prefix+'/preview',{method:'POST',cookie:workerCookie,body:payload})).res.statusCode,403);assert.equal((await request(prefix+'/preview',{method:'POST',cookie,body:{...payload,published_by:manager.id}})).res.statusCode,400);assert.equal((await request(prefix+'/preview',{method:'POST',cookie,body:file('日期,机号,维修机会,工作名称\n2026-01-01,BTEST,停场,维修项目')})).res.statusCode,400);
  const count=Number(db.prepare('select count(*) n from maintenance_standards').get().n),preview=await request(prefix+'/preview',{method:'POST',cookie,body:payload});assert.equal(preview.res.statusCode,200,JSON.stringify(preview.payload));assert.equal(preview.payload.summary.ready,1);assert.equal(preview.payload.summary.blocked,1);assert.equal(preview.payload.summary.needsReview,1);assert.equal(Number(db.prepare('select count(*) n from maintenance_standards').get().n),count);assert.deepEqual(facts(),before);
  const url=prefix+'/batches/'+preview.payload.batchId;assert.equal((await request(url,{cookie:otherCookie})).res.statusCode,404);assert.equal((await request(url,{cookie:workerCookie})).res.statusCode,403);
  const rows=preview.payload.items.filter(row=>row.digest).map(row=>({rowNumber:row.rowNumber,digest:row.digest,...(row.status==='NEEDS_REVIEW'?{distinctReason:'已逐项比较，范围不同的独立标准'}:{})})),body={revision:1,requestId:'standard-file-api-commit',reason:'合成数据核对标准库草稿',rows};
  const drop=installFailureTrigger('fail_standard_import_source_api','maintenance_standard_import_sources','insert',`new.batch_id='${preview.payload.batchId}' and new.row_number=2`,'injected standard import source failure');
  let saved;try{saved=await request(url+'/commit',{method:'POST',cookie,body});assert.equal(saved.res.statusCode,200,JSON.stringify(saved.payload));assert.equal(saved.payload.summary.success,1);assert.equal(saved.payload.summary.failed,1);assert.equal(Number(db.prepare('select count(*) n from maintenance_standards').get().n),count+1);}finally{drop();}
  assert.equal((await request(url+'/commit',{method:'POST',cookie,body})).payload.replayed,true);assert.equal((await request(url+'/commit',{method:'POST',cookie,body:{...body,reason:'改变内容'}})).res.statusCode,409);
  const refreshed=(await request(url,{cookie})).payload,retry={...body,revision:refreshed.revision,requestId:'standard-file-api-retry',rows:refreshed.items.filter(row=>row.status==='READY').map(row=>({rowNumber:row.rowNumber,digest:row.digest}))};
  const retried=await request(url+'/commit',{method:'POST',cookie,body:retry});assert.equal(retried.payload.summary.success,1);const created=retried.payload.results[0],draft=db.prepare('select * from maintenance_standard_versions where id=?').get(created.versionId);assert.equal(Number(draft.standard_hours),0);assert.equal(draft.status,'DRAFT');assert.equal(draft.review_final_id,null);assert.equal(draft.published_at,null);
  const repeated=await request(prefix+'/preview',{method:'POST',cookie:otherCookie,body:payload});assert.equal(repeated.payload.summary.imported,2);assert.equal(repeated.payload.summary.blocked,1);assert.equal(Number(db.prepare('select count(*) n from maintenance_standards').get().n),count+2);
  const nextFile=file(`${header}\n单项工作,29,批量标准API新建,修改后范围,1.2,A320,否,${created.standardId},1`),next=(await request(prefix+'/preview',{method:'POST',cookie,body:nextFile})).payload,nextUrl=prefix+'/batches/'+next.batchId;assert.equal(next.items[0].action,'UPDATE_DRAFT');
  const updated=await request(nextUrl+'/commit',{method:'POST',cookie,body:{revision:1,requestId:'standard-file-update',reason:'仅更新未评议草稿',rows:[{rowNumber:2,digest:next.items[0].digest}]}});assert.equal(updated.payload.summary.success,1);assert.equal(Number(db.prepare('select standard_hours from maintenance_standard_versions where id=?').get(created.versionId).standard_hours),1.2);
  const stale=(await request(prefix+'/preview',{method:'POST',cookie,body:file(`${header}\n单项工作,29,批量标准API新建,并发文件范围,2.1,A320,否,${created.standardId},1`)})).payload;
  const detail=(await request('/api/maintenance/standard-management/'+created.standardId,{cookie})).payload,definition={category:draft.category,chapter:draft.chapter,title:draft.title,workScope:'他人已修改范围',standardHours:1.3,aircraftCodes:['A320'],genericAircraft:false};assert.equal((await request('/api/maintenance/standard-management/'+created.standardId+'/update',{method:'POST',cookie,body:{revision:detail.standard.revision,versionId:created.versionId,definition,reason:'模拟预览后修改',clientId:'standard-file-api-concurrent'}})).res.statusCode,200);
  const conflict=await request(prefix+'/batches/'+stale.batchId+'/commit',{method:'POST',cookie,body:{revision:1,requestId:'standard-file-api-stale',reason:'不能覆盖他人修改',rows:[{rowNumber:2,digest:stale.items[0].digest}]}});assert.equal(conflict.payload.summary.conflicts,1);assert.equal(Number(db.prepare('select standard_hours from maintenance_standard_versions where id=?').get(created.versionId).standard_hours),1.3);
  const person=db.prepare('select employment_status from personnel where id=?').get(manager.personId);db.prepare("update personnel set employment_status='停职' where id=?").run(manager.personId);try{assert.equal((await request(url,{cookie})).res.statusCode,403);}finally{db.prepare('update personnel set employment_status=? where id=?').run(person.employment_status,manager.personId);}
  delete process.env.MUC_STANDARDS_IMPORT_ENABLED;assert.equal((await request(url,{cookie})).res.statusCode,404);assert.deepEqual(facts(),before);
 }finally{for(const [index,key]of keys.entries())if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];}
});

test('standard catalog filters, deduplicated references and live withdrawal guards preserve historical work and source audits',async()=>{
 const prior=process.env.MUC_STANDARDS_MANAGEMENT_ENABLED;process.env.MUC_STANDARDS_MANAGEMENT_ENABLED='1';const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],url='/api/maintenance/standard-management';
 try{
  const query=new URLSearchParams({search:'独立标准API样例',category:'单项工作',chapter:'29',aircraftCode:'A320',lifecycle:'SUPERSEDED',references:'HAS_WORK'}),filtered=await request(url+'?'+query,{cookie});assert.equal(filtered.res.statusCode,200,JSON.stringify(filtered.payload));assert.equal(filtered.payload.items.length,1);const item=filtered.payload.items[0];assert.ok(item.matchedVersions.some(row=>row.version===1));assert.equal(item.references.workItems,1);assert.equal(item.references.formalWorkItems,1);assert.equal(item.references.draftWorkItems,0);assert.equal((await request(url+'?category='+encodeURIComponent('不存在的类别'),{cookie})).res.statusCode,400);
  const protectedTables=['maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_nonroutine_assessments','maintenance_nonroutine_manual_sources','maintenance_standard_versions'];const facts=()=>protectedTables.map(table=>db.prepare(`select * from ${table}`).all().map(row=>JSON.stringify(row)).sort());
  const current=(await request(url+'/'+item.id,{cookie})).payload,before=facts(),selected=current.versions.find(row=>row.status==='PUBLISHED');assert.equal(current.references.workItems,1);assert.equal((await request(url+'/'+item.id,{method:'DELETE',cookie,body:{}})).res.statusCode,404);
  const disabled=await request(url+'/'+item.id+'/disable',{method:'POST',cookie,body:{revision:current.standard.revision,versionId:selected.id,clientId:'reference-safe-disable',reason:'停止后续新引用，保留旧确认报工'}});assert.equal(disabled.res.statusCode,200,JSON.stringify(disabled.payload));assert.equal(disabled.payload.references.workItems,1);assert.deepEqual(facts(),before);const {createMaintenanceStandards}=await import('../maintenance-standards.mjs');assert.ok(!createMaintenanceStandards({db}).list({aircraftCode:'A320'}).items.some(row=>row.id===item.id));
  const stopped=await request(url+'?'+new URLSearchParams({search:'独立标准API样例',references:'HAS_WORK',lifecycle:'DISABLED'}),{cookie});assert.ok(stopped.payload.items.some(row=>row.id===item.id));
  const created=await request(url,{method:'POST',cookie,body:{clientId:'reference-guard-create',reason:'引用保护隔离草稿',definition:{category:'单项工作',chapter:'29',title:'引用保护API草稿',workScope:'明确范围',standardHours:0,aircraftCodes:['A320'],genericAircraft:false}}});assert.equal(created.res.statusCode,200);const id=created.payload.standard.id,version=created.payload.versions[0].id;assert.equal(created.payload.versions[0].capabilities.withdraw,true);
  db.prepare("insert into maintenance_report_drafts(id,flight_id,report_type,payload_json,created_at,updated_at) values('standard-reference-guard-draft','reference-guard-flight','nonroutine',?,'t','t')").run(JSON.stringify({items:[{clientId:'legacy-linked-item',standardId:id,standardVersion:1}]}));const bound=(await request(url+'/'+id,{cookie})).payload;assert.equal(bound.references.workItems,1);assert.equal(bound.references.draftWorkItems,1);assert.equal(bound.versions[0].capabilities.withdraw,false);
  const withdraw={revision:1,versionId:version,clientId:'reference-guard-withdraw',reason:'必须重新核对无工作引用'};assert.equal((await request(url+'/'+id+'/withdraw',{method:'POST',cookie,body:withdraw})).res.statusCode,409);assert.equal(db.prepare('select status from maintenance_standard_versions where id=?').get(version).status,'DRAFT');
  db.prepare("update maintenance_report_drafts set payload_json='{bad' where id='standard-reference-guard-draft'").run();const unknown=(await request(url+'/'+id,{cookie})).payload;assert.equal(unknown.references.available,false);assert.equal(unknown.references.workItems,null);assert.equal((await request(url+'/'+id+'/withdraw',{method:'POST',cookie,body:withdraw})).res.statusCode,409);
  db.prepare("delete from maintenance_report_drafts where id='standard-reference-guard-draft'").run();const drop=installFailureTrigger('reference_guard_withdraw_failure','maintenance_standard_management_events','insert',`new.standard_id='${id}' and new.action='WITHDRAWN'`,'withdraw audit must survive');try{assert.ok((await request(url+'/'+id+'/withdraw',{method:'POST',cookie,body:withdraw})).res.statusCode>=400);assert.equal(db.prepare('select status from maintenance_standard_versions where id=?').get(version).status,'DRAFT');}finally{drop();}
  const done=await request(url+'/'+id+'/withdraw',{method:'POST',cookie,body:withdraw});assert.equal(done.res.statusCode,200,JSON.stringify(done.payload));assert.equal(done.payload.versions[0].status,'WITHDRAWN');assert.equal((await request(url+'/'+id+'/withdraw',{method:'POST',cookie,body:withdraw})).payload.operation.replayed,true);
 }finally{db.prepare("delete from maintenance_report_drafts where id='standard-reference-guard-draft'").run();if(prior===undefined)delete process.env.MUC_STANDARDS_MANAGEMENT_ENABLED;else process.env.MUC_STANDARDS_MANAGEMENT_ENABLED=prior;}
});

test('correction foundation overlays a posted reversal in original statistics and protects its original source without reopening the channel',async()=>{
  const {planNonroutineCorrection}=await import('../nonroutine-corrections.mjs');
  const item=db.prepare("select a.* from maintenance_nonroutine_assessments a join maintenance_flights f on f.id=a.flight_id join maintenance_nonroutine_review_channels ch on ch.case_id=a.review_case_id where a.source_kind='REVIEW' and a.effective_hours>0 and ch.state='ADJUSTED_CLOSED' and f.status='已确认' order by a.subtask_id limit 1").get();
  assert.ok(item,'Existing real review posting fixture is required');
  const originalTables=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_hour_results','maintenance_nonroutine_role_results','maintenance_nonroutine_hour_adjustments','maintenance_nonroutine_review_finals','maintenance_nonroutine_review_channels'];
  const originals=()=>originalTables.map(table=>JSON.stringify(db.prepare(`select * from ${table} order by id`).all()));
  const before=originals(),sourceRows=db.prepare("select * from maintenance_effective_hour_results where owner_type='subtask' and owner_id=? order by id").all(item.subtask_id);
  const targetRows=sourceRows.map(row=>({...row,hours:0}));const plan=planNonroutineCorrection({sourceRows,targetRows,subtaskId:item.subtask_id,flightId:item.flight_id});
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}});const cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
  const statsBefore=await request('/api/maintenance/stats/personal?month=2026-09',{cookie});assert.equal(statsBefore.res.statusCode,200);
  const id='correction-foundation-fixture',stamp=new Date().toISOString(),insert=(table,row)=>db.prepare(`insert into ${table}(${Object.keys(row).join(',')}) values(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
  db.exec('begin');try{
    insert('maintenance_nonroutine_corrections',{id,subtask_id:item.subtask_id,flight_id:item.flight_id,correction_number:1,source_kind:'REVIEW',source_id:item.review_case_id,source_version:'1',source_digest:plan.token,source_snapshot_json:JSON.stringify({fixtureOnly:true,assessment:item}),before_json:JSON.stringify(sourceRows),target_json:JSON.stringify(targetRows),policy_json:item.policy_json,target_hours:0,work_month:'2026-09',statistical_month:'2026-09',approved_by:login.payload.user.id,approval_qualification_json:JSON.stringify({fixtureOnly:true}),reason:'隔离夹具：验证完整冲销的净额投影，非业务授权流程验收',client_id:'correction-foundation-fixture',request_hash:plan.token,state:'APPROVED_PENDING_PERIOD',created_at:stamp});
    for(const [index,entry]of plan.deltas.entries())insert('maintenance_nonroutine_correction_deltas',{id:id+'-'+index,correction_id:id,assignment_id:entry.assignmentId,person_id:entry.personId,user_name:entry.userName,team:entry.team,role:entry.role,hours:entry.hours,before_hours:entry.beforeHours,target_hours:entry.targetHours,correction_of_json:JSON.stringify(entry.correctionOf),created_at:stamp});
    assert.equal(Math.round(db.prepare("select sum(hours) total from maintenance_effective_hour_results where owner_type='subtask' and owner_id=?").get(item.subtask_id).total*100),Math.round(plan.beforeHours*100));
    db.prepare("update maintenance_nonroutine_corrections set state='POSTED',handling_month='2026-11',posted_at=? where id=?").run(stamp,id);db.exec('commit');
  }catch(error){db.exec('rollback');throw error;}
  assert.equal(Math.round(db.prepare("select sum(hours) total from maintenance_effective_hour_results where owner_type='subtask' and owner_id=?").get(item.subtask_id).total*100),0);
  const statsAfter=await request('/api/maintenance/stats/personal?month=2026-09',{cookie});assert.equal(statsAfter.res.statusCode,200);
  const ownDelta=plan.deltas.filter(row=>row.personId===login.payload.user.personId).reduce((sum,row)=>sum+Math.round(row.hours*100),0);
  assert.equal(Math.round((statsAfter.payload.metrics.monthHours-statsBefore.payload.metrics.monthHours)*100),ownDelta);
  assert.equal((await request(`/api/maintenance/hours/${sourceRows[0].id}`,{method:'PUT',cookie,body:{adjustedHours:9}})).res.statusCode,409);
  assert.equal((await request(`/api/maintenance/subtasks/${item.subtask_id}`,{method:'DELETE',cookie,body:{reason:'不得删除独立差额来源'}})).res.statusCode,409);
  assert.equal((await request(`/api/maintenance/flights/${item.flight_id}`,{method:'DELETE',cookie,body:{reason:'不得删除独立差额来源'}})).res.statusCode,409);
  assert.deepEqual(originals(),before);
});

test('independent correction APIs approve frozen allocated deltas, require the period owner and replay without rewriting original work',async()=>{
 const template=db.prepare("select * from users where id='54002010'").get(),approver=createMaintenanceTestAccount(template,{id:'correction-api-approver',name:'隔离更正批准人'}),owner=createMaintenanceTestAccount(template,{id:'correction-api-period-owner',name:'隔离更正账期负责人'}),worker=createMaintenanceTestAccount(template,{id:'correction-api-worker',name:'无更正权限人员'});
 const grant=(user,code)=>{db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(user.id,db.prepare('select id from rbac_roles where code=?').get(code).id,new Date().toISOString());db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(user.id);};
 grant(approver,'addon_archive_modify');grant(owner,'addon_maintenance_period_responsible');grant(owner,'addon_maintenance_cross_period');
 const login=async username=>{const result=await request('/api/login',{method:'POST',body:{username,password:'muc2026'}});assert.equal(result.res.statusCode,200);return String(result.res.headers['Set-Cookie']).split(';')[0];};
 const rootCookie=await login('54002010'),cookie=await login(approver.username),ownerCookie=await login(owner.username),workerCookie=await login(worker.username);
 const foundation=db.prepare("select * from maintenance_nonroutine_corrections where client_id='correction-foundation-fixture'").get();assert.ok(foundation);
 const subtaskId=foundation.subtask_id,flightId=foundation.flight_id,sourceUrl=`/api/maintenance/nonroutine-corrections/sources/${subtaskId}`;
 const originalTables=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_hour_results','maintenance_nonroutine_role_results','maintenance_nonroutine_hour_adjustments','maintenance_nonroutine_review_finals','maintenance_nonroutine_review_channels'];
 const originalFacts=()=>originalTables.map(table=>JSON.stringify(db.prepare(`select * from ${table} order by id`).all()));const before=originalFacts();
 const prior=[process.env.MUC_NONROUTINE_CORRECTIONS_ENABLED,process.env.MUC_MAINTENANCE_PERIODS_ENABLED];
 try{
  delete process.env.MUC_NONROUTINE_CORRECTIONS_ENABLED;
  assert.equal((await request(sourceUrl,{cookie})).res.statusCode,404);process.env.MUC_NONROUTINE_CORRECTIONS_ENABLED='1';process.env.MUC_MAINTENANCE_PERIODS_ENABLED='1';
  assert.equal((await request(sourceUrl)).res.statusCode,401);assert.equal((await request(sourceUrl,{cookie:workerCookie})).res.statusCode,403);assert.equal((await request(sourceUrl,{cookie:ownerCookie})).res.statusCode,403);
  assert.equal((await request('/api/maintenance/nonroutine-correction-capabilities',{cookie})).payload.approve,true);
  assert.equal((await request('/api/maintenance/nonroutine-correction-capabilities',{cookie:ownerCookie})).payload.authorizePeriod,true);
  const source=await request(sourceUrl,{cookie});assert.equal(source.res.statusCode,200,JSON.stringify(source.payload));assert.equal(source.payload.source.currentHours,0);assert.ok(!JSON.stringify(source.payload).includes('PRIVATE'));
  const candidatesUrl='/api/maintenance/nonroutine-corrections/sources';
  assert.equal((await request(candidatesUrl,{cookie:ownerCookie})).res.statusCode,403);
  assert.equal((await request(candidatesUrl,{cookie:workerCookie})).res.statusCode,403);
  assert.equal((await request(candidatesUrl+'?unexpected=1',{cookie})).res.statusCode,400);
  const candidates=await request(candidatesUrl,{cookie});assert.equal(candidates.res.statusCode,200);assert.ok(candidates.payload.items.some(item=>item.subtaskId===subtaskId));assert.ok(!JSON.stringify(candidates.payload).includes('PRIVATE'));
  const sourceTitle=db.prepare('select title from maintenance_subtasks where id=?').get(subtaskId).title;
  assert.ok((await request(candidatesUrl+'?'+new URLSearchParams({search:sourceTitle}),{cookie})).payload.items.some(item=>item.subtaskId===subtaskId));
  assert.equal((await request(candidatesUrl+'?search=NO_SUCH_CORRECTION_SOURCE_84927',{cookie})).payload.items.length,0);
  const input=amount=>({recognizedHours:amount,participants:source.payload.source.participants,participantsVerified:true});
  const preview=await request(`${sourceUrl}/preview`,{method:'POST',cookie,body:input(1)});assert.equal(preview.res.statusCode,200,JSON.stringify(preview.payload));assert.equal(preview.payload.preview.plan.deltaHours,1);
  const body={...input(1),clientId:'correction-api-approve-one',reason:'原归档授权下独立批准冻结分配差额',expectedToken:preview.payload.preview.token,expectedNumber:preview.payload.preview.number};
  assert.equal((await request(`${sourceUrl}/approve`,{method:'POST',cookie,body:{...body,expectedToken:'stale'}})).res.statusCode,409);
  assert.equal((await request(`${sourceUrl}/approve`,{method:'POST',cookie,body:{...body,hoursByPerson:{outsider:99}}})).res.statusCode,400);
  db.prepare("update personnel set employment_status='停职' where id=?").run(approver.personId);
  try{assert.equal((await request(`${sourceUrl}/approve`,{method:'POST',cookie,body})).res.statusCode,403);}finally{db.prepare("update personnel set employment_status='在职' where id=?").run(approver.personId);}
  const openPeriod=async month=>{
    const url=`/api/maintenance/hour-periods/${month}`,current=await request(url,{cookie:rootCookie});assert.equal(current.res.statusCode,200);
    const assigned=current.payload.period.responsible_account_id===owner.id?current:await request(`${url}/assign`,{method:'POST',cookie:rootCookie,body:{revision:current.payload.period.revision,accountId:owner.id,reason:'隔离更正指定有效账期负责人'}});assert.equal(assigned.res.statusCode,200,JSON.stringify(assigned.payload));
    const opened=await request(`${url}/confirm`,{method:'POST',cookie:ownerCookie,body:{revision:assigned.payload.period.revision,state:'OPEN',reason:'负责人核对后开放测试账期'}});assert.equal(opened.res.statusCode,200,JSON.stringify(opened.payload));return opened.payload.period;
  };
  await openPeriod(source.payload.source.workMonth);const target=await openPeriod('2026-12');
  const dropFailure=installFailureTrigger('fail_correction_api','maintenance_nonroutine_correction_deltas','insert','new.hours>0','injected correction delta failure');
  const count=Number(db.prepare('select count(*) n from maintenance_nonroutine_corrections').get().n);
  try{assert.equal((await request(`${sourceUrl}/approve`,{method:'POST',cookie,body})).res.statusCode,500);assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_corrections').get().n),count);}finally{dropFailure();}
  const approved=await request(`${sourceUrl}/approve`,{method:'POST',cookie,body});assert.equal(approved.res.statusCode,200,JSON.stringify(approved.payload));assert.equal(approved.payload.correction.state,'POSTED');assert.equal(approved.payload.correction.handlingMonth,source.payload.source.workMonth);assert.ok(!JSON.stringify(approved.payload).includes('PRIVATE'));
  const id=approved.payload.correction.id;
  assert.equal((await request(`${sourceUrl}/approve`,{method:'POST',cookie,body})).payload.replayed,true);assert.equal((await request(`/api/maintenance/nonroutine-corrections/${id}/retry`,{method:'POST',cookie,body:{}})).payload.correction.state,'POSTED');
  assert.equal(Math.round(db.prepare("select sum(coalesce(adjusted_hours,hours)) n from maintenance_effective_hour_results where owner_type='subtask' and owner_id=?").get(subtaskId).n*100),100);
  const review=await request(`/api/maintenance/flights/${flightId}/review`,{cookie:rootCookie});assert.equal(review.res.statusCode,200);const task=review.payload.review.tasks.find(task=>task.ownerId===subtaskId);assert.equal(Math.round(task.assignments.reduce((sum,row)=>sum+row.reportedHours,0)*100),100);
  const monthUrl=`/api/maintenance/hour-periods/${source.payload.source.workMonth}`,current=await request(monthUrl,{cookie:ownerCookie});
  const closed=await request(`${monthUrl}/confirm`,{method:'POST',cookie:ownerCookie,body:{revision:current.payload.period.revision,state:'CLOSED',reason:'负责人核对封账后更正须独立跨期'}});assert.equal(closed.res.statusCode,200);
  const nextPreview=await request(`${sourceUrl}/preview`,{method:'POST',cookie,body:input(0.5)});assert.equal(nextPreview.res.statusCode,200,JSON.stringify(nextPreview.payload));
  const pending=await request(`${sourceUrl}/approve`,{method:'POST',cookie,body:{...input(0.5),clientId:'correction-api-approve-two',reason:'封账后独立减记，等负责人授权办理账期',expectedToken:nextPreview.payload.preview.token,expectedNumber:nextPreview.payload.preview.number}});assert.equal(pending.res.statusCode,200,JSON.stringify(pending.payload));assert.equal(pending.payload.correction.state,'APPROVED_PENDING_PERIOD');
  const pendingId=pending.payload.correction.id,periodBody={clientId:'correction-api-period-one',sourceRevision:closed.payload.period.revision,targetRevision:target.revision,targetMonth:'2026-12',reason:'原负责人明确授权在十二月办理，统计保留原作业月'};
  const redacted=await request(`/api/maintenance/nonroutine-corrections/${pendingId}`,{cookie:ownerCookie});assert.equal(redacted.res.statusCode,200);assert.equal(redacted.payload.correction.before,undefined);assert.equal(redacted.payload.correction.target,undefined);
  assert.equal((await request(`/api/maintenance/nonroutine-corrections/${pendingId}/authorize-period`,{method:'POST',cookie,body:periodBody})).res.statusCode,403);
  assert.equal((await request('/api/maintenance/nonroutine-corrections?state=APPROVED_PENDING_PERIOD',{cookie:ownerCookie})).payload.items.some(item=>item.id===pendingId),true);
  assert.equal(redacted.payload.correction.capabilities.authorizePeriod,true);assert.equal(redacted.payload.correction.capabilities.retry,false);
  const targetUrl=`/api/maintenance/nonroutine-corrections/${pendingId}/target-period`,periodBefore=JSON.stringify(db.prepare('select * from maintenance_hour_periods order by month').all());
  delete process.env.MUC_MAINTENANCE_PERIODS_ENABLED;
  assert.equal((await request('/api/maintenance/hour-period-capabilities',{cookie:ownerCookie})).payload.enabled,false);
  const checked=await request(targetUrl+'?month=2026-12',{cookie:ownerCookie});assert.equal(checked.res.statusCode,200,JSON.stringify(checked.payload));assert.deepEqual(checked.payload.target,{month:'2026-12',state:'OPEN',revision:target.revision});
  assert.equal((await request(targetUrl+'?month=2026-12',{cookie})).res.statusCode,403);
  assert.equal((await request(targetUrl+'?month=2026-12',{cookie:workerCookie})).res.statusCode,403);
  assert.equal((await request(targetUrl+'?month='+source.payload.source.workMonth,{cookie:ownerCookie})).res.statusCode,400);
  assert.equal((await request(targetUrl+'?month=2026-12&extra=1',{cookie:ownerCookie})).res.statusCode,400);
  assert.equal(JSON.stringify(db.prepare('select * from maintenance_hour_periods order by month').all()),periodBefore);
  process.env.MUC_MAINTENANCE_PERIODS_ENABLED='1';
  const dropAudit=installFailureTrigger('fail_correction_period_audit','maintenance_logs','insert',"new.action='hour_correction_posted'",'injected correction posting audit failure');
  try{assert.equal((await request(`/api/maintenance/nonroutine-corrections/${pendingId}/authorize-period`,{method:'POST',cookie:ownerCookie,body:periodBody})).res.statusCode,500);assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_correction_period_authorizations where correction_id=?').get(pendingId).n),0);}finally{dropAudit();}
  const posted=await request(`/api/maintenance/nonroutine-corrections/${pendingId}/authorize-period`,{method:'POST',cookie:ownerCookie,body:periodBody});assert.equal(posted.res.statusCode,200,JSON.stringify(posted.payload));assert.equal(posted.payload.correction.state,'POSTED');assert.equal(posted.payload.correction.handlingMonth,'2026-12');assert.equal(posted.payload.correction.statisticalMonth,source.payload.source.workMonth);
  assert.equal((await request(`/api/maintenance/nonroutine-corrections/${pendingId}/authorize-period`,{method:'POST',cookie:ownerCookie,body:periodBody})).payload.replayed,true);
  assert.equal(Math.round(db.prepare("select sum(coalesce(adjusted_hours,hours)) n from maintenance_effective_hour_results where owner_type='subtask' and owner_id=?").get(subtaskId).n*100),50);
  const lastPeriod=await request(monthUrl,{cookie:ownerCookie});
  assert.equal((await request(`${monthUrl}/confirm`,{method:'POST',cookie:ownerCookie,body:{revision:lastPeriod.payload.period.revision,state:'OPEN',reason:'隔离边界验证重新开放原作业月份'}})).res.statusCode,200);
  for(const [index,amount]of [9999.9,0.1].entries()){
    const edge=await request(`${sourceUrl}/preview`,{method:'POST',cookie,body:input(amount)});assert.equal(edge.res.statusCode,200,JSON.stringify(edge.payload));
    const applied=await request(`${sourceUrl}/approve`,{method:'POST',cookie,body:{...input(amount),expectedToken:edge.payload.preview.token,expectedNumber:edge.payload.preview.number,clientId:'correction-api-large-edge-'+index,reason:'验证上限附近增减后净额按批准目标，不能累计浮点误差'}});
    assert.equal(applied.res.statusCode,200,JSON.stringify(applied.payload));
    const net=db.prepare("select sum(coalesce(adjusted_hours,hours)) n from maintenance_effective_hour_results where owner_type='subtask' and owner_id=?").get(subtaskId).n;assert.equal(Math.round(Number(net)*100),Math.round(amount*100));
  }
  const standard=db.prepare("select a.subtask_id,h.id as hour_id from maintenance_nonroutine_assessments a join maintenance_hour_results h on h.owner_type='subtask' and h.owner_id=a.subtask_id join maintenance_flights f on f.id=a.flight_id where a.source_kind='STANDARD' and h.status='已确认' and f.status='已确认' order by a.subtask_id limit 1").get();assert.ok(standard);
  assert.equal((await request(`/api/maintenance/hours/${standard.hour_id}`,{method:'PUT',cookie:rootCookie,body:{adjustedHours:99}})).res.statusCode,409);
  const standardUrl=`/api/maintenance/nonroutine-corrections/sources/${standard.subtask_id}`,standardSource=await request(standardUrl,{cookie});assert.equal(standardSource.res.statusCode,200,JSON.stringify(standardSource.payload));assert.equal(standardSource.payload.source.kind,'STANDARD');
  const standardMonth=standardSource.payload.source.workMonth;
  const standardPeriod=await request(`/api/maintenance/hour-periods/${standardMonth}`,{cookie:rootCookie});
  if(standardPeriod.payload.period.state!=='OPEN')await openPeriod(standardMonth);
  const standardInput={recognizedHours:standardSource.payload.source.currentHours===0.1?0.2:0.1,participants:standardSource.payload.source.participants,participantsVerified:true};
  const standardPreview=await request(`${standardUrl}/preview`,{method:'POST',cookie,body:standardInput});assert.equal(standardPreview.res.statusCode,200,JSON.stringify(standardPreview.payload));
  const standardBody={...standardInput,clientId:'correction-api-standard-one',reason:'独立更正原标准来源，不改原标准或已确认记录',expectedToken:standardPreview.payload.preview.token,expectedNumber:standardPreview.payload.preview.number};
  const standardDone=await request(`${standardUrl}/approve`,{method:'POST',cookie,body:standardBody});assert.equal(standardDone.res.statusCode,200,JSON.stringify(standardDone.payload));assert.equal(standardDone.payload.correction.state,'POSTED');assert.equal(standardDone.payload.correction.source.kind,'STANDARD');
  assert.equal((await request(`${standardUrl}/approve`,{method:'POST',cookie,body:standardBody})).payload.replayed,true);
  const after=originalFacts();
  for(const [index,table]of originalTables.entries()){
    if(after[index]===before[index])continue;
    const oldRows=JSON.parse(before[index]),newRows=JSON.parse(after[index]),oldById=new Map(oldRows.map(row=>[row.id,row]));
    const changed=newRows.find(row=>JSON.stringify(oldById.get(row.id))!==JSON.stringify(row));
    const prior=changed&&oldById.get(changed.id);
    assert.ok(false,JSON.stringify({table,oldCount:oldRows.length,newCount:newRows.length,id:changed?.id,fields:changed?Object.keys(changed).filter(key=>JSON.stringify(prior?.[key])!==JSON.stringify(changed[key])):[]}));
  }
 }finally{for(const [key,index]of [['MUC_NONROUTINE_CORRECTIONS_ENABLED',0],['MUC_MAINTENANCE_PERIODS_ENABLED',1]])if(prior[index]===undefined)delete process.env[key];else process.env[key]=prior[index];}
});

test('tow monetary retirement preserves legacy work, rejects new legacy bypasses atomically and sends new work through original standard/review sources',async()=>{
 const flags=['MUC_TOW_STANDARD_ONLY_ENABLED','MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED'],previous=flags.map(key=>process.env[key]);
 const f=await supplementalWorkFixture('MUTOWTRANS'),call=(path,body,method='POST')=>request(path,{method,cookie:f.cookie,body});
 const beforeStandards=db.prepare("select count(*) n from maintenance_standards").get().n,standardId='tow-transition-standard';
 try{
  delete process.env.MUC_TOW_STANDARD_ONLY_ENABLED;
  const initial=await request('/api/maintenance/rules',{cookie:f.cookie}),oldRule=initial.payload.rules.find(row=>row.rule_type==='nonroutineCategoryHours'&&row.name==='拖机');assert.equal(initial.payload.towTransition.mode,'LEGACY');assert.deepEqual(initial.payload.categoryStrategies,{'工卡指令':'ROLE_COMBINATION','单项工作':'ROLE_COMBINATION','拖机':'EQUAL','三方附加':'EQUAL','试车':'EQUAL','其他':'UNDECIDED','人工除冰':'UNDECIDED','联合除冰':'UNDECIDED'});
  assert.equal((await call('/api/maintenance/rules',{rules:initial.payload.rules},'PUT')).res.statusCode,200);
  const oldBody={title:'切换前原拖机',chapter:'09',category:'拖机',standardHours:3,reportExplanation:'原合法在途来源'};
  const original=await call(`/api/maintenance/flights/${f.id}/subtasks`,oldBody);assert.equal(original.res.statusCode,201,JSON.stringify(original.payload));
  const oldTask=db.prepare("select * from maintenance_subtasks where flight_id=? and category='拖机'").get(f.id);
  const otherBody={title:'切换前其他工作',chapter:'27',category:'单项工作',standardHours:1,reportExplanation:'原其他来源'};
  assert.equal((await call(`/api/maintenance/flights/${f.id}/subtasks`,otherBody)).res.statusCode,201);
  const otherTask=db.prepare("select * from maintenance_subtasks where flight_id=? and category='单项工作'").get(f.id);
  const ruleSnapshot=()=>JSON.stringify(db.prepare('select * from maintenance_hour_rules order by id').all()),rulesBefore=ruleSnapshot();
  process.env.MUC_TOW_STANDARD_ONLY_ENABLED='1';delete process.env.MUC_NONROUTINE_MANUAL_ENABLED;
  const notReady=(await request('/api/maintenance/rules',{cookie:f.cookie})).payload.towTransition;assert.equal(notReady.mode,'STANDARD_ONLY');assert.equal(notReady.ready,false);assert.equal(notReady.legacyAmountWritable,false);
  const ratio=initial.payload.rules.find(row=>row.rule_type==='roleRatio'&&row.name!=='放行');
  assert.equal((await call('/api/maintenance/rules',{rules:[{...ratio,value:0.9},{...oldRule,value:4}]},'PUT')).res.statusCode,409);assert.equal(ruleSnapshot(),rulesBefore);
  assert.equal((await call('/api/maintenance/rules',{rules:[{ruleType:' nonroutineCategoryHours ',name:' 拖机 ',value:oldRule.value}]},'PUT')).res.statusCode,409);assert.equal(ruleSnapshot(),rulesBefore);
  process.env.MUC_MAINTENANCE_V101='draft';for(const key of flags.slice(2))process.env[key]='1';
  const stamp='2026-01-01T00:00:00Z';db.prepare("insert into maintenance_standards(id,status,revision,created_by,created_at,updated_at) values(?,'PUBLISHED',1,?,?,?)").run(standardId,f.user.id,stamp,stamp);
  db.prepare("insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,generic_aircraft,status,admission_decision,effective_at,published_by,published_at,created_at) values(?,?,1,'拖机','09','切换后标准拖机','标准拖机范围',1.2,'[\"A320\"]',0,'PUBLISHED','INCLUDE',?,?,?,?)").run(standardId+'-v1',standardId,stamp,f.user.id,stamp,stamp);
  assert.equal((await request('/api/maintenance/rules',{cookie:f.cookie})).payload.towTransition.ready,true);
  assert.equal((await call('/api/maintenance/rules',{rules:initial.payload.rules.filter(row=>!(row.rule_type==='nonroutineCategoryHours'&&row.name==='拖机'))},'PUT')).res.statusCode,200);assert.deepEqual(db.prepare("select value from maintenance_hour_rules where rule_type='nonroutineCategoryHours' and name='拖机'").get().value,oldRule.value);
  const sourceBefore=JSON.stringify(db.prepare('select * from maintenance_subtasks where flight_id=? order by id').all(f.id));
  assert.equal((await call(`/api/maintenance/flights/${f.id}/subtasks`,{...oldBody,title:'不得创建新旧拖机'})).res.statusCode,409);
  assert.equal((await call(`/api/maintenance/subtasks/${otherTask.id}`,{...otherBody,category:'拖机'},'PUT')).res.statusCode,409);assert.equal(JSON.stringify(db.prepare('select * from maintenance_subtasks where flight_id=? order by id').all(f.id)),sourceBefore);
  assert.equal((await call(`/api/maintenance/subtasks/${oldTask.id}`,{...oldBody,title:'原在途拖机维护'},'PUT')).res.statusCode,200);
  const importRow={date:'2026-09-04',aircraftNo:'BTEST',aircraftType:'A320',flightNo:'TOWBLOCK',workKind:'停场',chapter:'09',title:'不得由旧导入创建拖机',category:'拖机',standardHours:3};
  const flightCount=Number(db.prepare('select count(*) n from maintenance_flights').get().n);
  const checked=await call('/api/maintenance/flights/import',{validateOnly:true,rows:[importRow]});assert.equal(checked.payload.valid,false);
  assert.ok((await call('/api/maintenance/flights/import',{rows:[importRow]})).res.statusCode>=400);assert.equal(Number(db.prepare('select count(*) n from maintenance_flights').get().n),flightCount);
  const legacyItems={nonroutineItems:[{id:oldTask.id,...oldBody,title:'原在途拖机维护',entries:[{personId:f.user.personId,role:'主做'}]},{id:otherTask.id,...otherBody,entries:[{personId:f.user.personId,role:'主做'}]}]};const legacyView=(await request(`/api/maintenance/flights/${f.id}/reports`,{cookie:f.cookie})).payload.report;
  const legacySubmitted=await call(`/api/maintenance/flights/${f.id}/reports/nonroutine`,{mode:'submit',items:legacyItems.nonroutineItems,draftVersion:0,revision:legacyView.nonroutine.revision},'PUT');assert.equal(legacySubmitted.res.statusCode,200,JSON.stringify(legacySubmitted.payload));
  const legacyReport=await f.report({nonroutineItems:[{id:oldTask.id,...oldBody,title:'原在途拖机维护',entries:[{personId:f.user.personId,role:'主做'}]},{id:otherTask.id,...otherBody,entries:[{personId:f.user.personId,role:'主做'}]}]});assert.equal(legacyReport.res.statusCode,200,JSON.stringify(legacyReport.payload));
  const confirmed=await f.putReview({mode:'confirm',routineElectronicSigned:false,nonroutineElectronicSigned:false});assert.equal(confirmed.res.statusCode,200,JSON.stringify(confirmed.payload));
  const oldHours=db.prepare('select * from maintenance_hour_results where owner_id=? order by id').all(oldTask.id);assert.equal(oldHours.reduce((sum,row)=>sum+Number(row.hours),0),3);
  assert.equal((await f.putReview({reason:'不能新增旧金额拖机',newSubtasks:[{...oldBody,assignments:[{personId:f.user.personId,role:'主做'}]}]})).res.statusCode,409);assert.deepEqual(db.prepare('select * from maintenance_hour_results where owner_id=? order by id').all(oldTask.id),oldHours);
  const g=await supplementalWorkFixture('MUTOWNEWSOURCE');db.prepare("update maintenance_flights set status='已派工',aircraft_type='A320' where id=?").run(g.id);
  const reportUrl=`/api/maintenance/flights/${g.id}/reports`,submitUrl=reportUrl+'/nonroutine',report=(await request(reportUrl,{cookie:g.cookie})).payload.report;
  assert.equal(report.defaults.towTransition.mode,'STANDARD_ONLY');assert.equal(report.nonroutine.manualDraftSubmissionReady,true);
  const items=[{clientId:'tow-new-standard',temporary:true,manualManaged:true,standardId,standardVersion:1,category:'拖机',chapter:'09',title:'切换后标准拖机',reportExplanation:'标准拖机范围',standardHours:1.2,entries:[{personId:g.user.personId,role:'主做'}]},
   {clientId:'tow-new-unlisted',temporary:true,manualManaged:true,standardId:'',category:'拖机',chapter:'09',title:'同ATA下尚未收录的独立拖机',reportExplanation:'全新独立施工范围',standardHours:2.3,entries:[{personId:g.user.personId,role:'主做'}]}];
  const submitted=await request(submitUrl,{method:'PUT',cookie:g.cookie,body:{mode:'submit',items,draftVersion:0,revision:report.nonroutine.revision}});assert.equal(submitted.res.statusCode,200,JSON.stringify(submitted.payload));
  const assessments=db.prepare('select * from maintenance_nonroutine_assessments where flight_id=? order by source_kind').all(g.id);assert.deepEqual(assessments.map(row=>row.source_kind),['REVIEW','STANDARD']);
  const standard=assessments.find(row=>row.source_kind==='STANDARD'),unlisted=assessments.find(row=>row.source_kind==='REVIEW');assert.equal(standard.effective_hours,1.2);assert.equal(unlisted.effective_hours,null);assert.equal(JSON.parse(unlisted.application_json).requestedHours,2.3);
  assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where owner_id=?').get(unlisted.subtask_id).n),0);assert.equal(db.prepare('select state from maintenance_nonroutine_review_cases where id=?').get(unlisted.review_case_id).state,'PENDING_ACCEPTANCE');assert.equal(JSON.parse(unlisted.policy_json).strategy,'EQUAL');assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_review_events where case_id=? and event_type='MANUAL_UNLISTED_CONFIRMED'").get(unlisted.review_case_id).n),1);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_standards").get().n),Number(beforeStandards)+1);
 }finally{flags.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});db.prepare("update maintenance_standards set status='DISABLED' where id=?").run(standardId);}
});

test('non-settlement registration API needs explicit current authority and appends audited instances without rewriting core opportunity facts',async()=>{
 const keys=['MUC_NONSETTLEMENT_MODULES_ENABLED','MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED','MUC_MAINTENANCE_MODULE_SHADOW_ENABLED'],old=keys.map(key=>process.env[key]);
 const login=async username=>{const r=await request('/api/login',{method:'POST',body:{username,password:'muc2026'}});assert.equal(r.res.statusCode,200);return String(r.res.headers['Set-Cookie']).split(';')[0];};
 const root=await login('54002010'),template=db.prepare("select * from users where id='54002010'").get(),manager=createMaintenanceTestAccount(template,{id:'extension-manager',name:'Synthetic module manager'});
 db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(manager.id,db.prepare("select id from rbac_roles where code='addon_maintenance_module_manager'").get().id,new Date().toISOString());
 db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(manager.id);const cookie=await login(manager.username);
 try{
  process.env.MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED='1';process.env.MUC_MAINTENANCE_MODULE_SHADOW_ENABLED='1';
  const created=await request('/api/maintenance/flights',{method:'POST',cookie:root,body:{date:'2026-11-11',flightNo:'EXT001',aircraftNo:'B-EXT',aircraftType:'A320',workKind:'停场'}});assert.equal(created.res.statusCode,201,JSON.stringify(created.payload));const id=created.payload.flight.id,path=`/api/maintenance/flights/${id}/extension-modules`;
  delete process.env.MUC_NONSETTLEMENT_MODULES_ENABLED;assert.equal((await request(path,{cookie})).res.statusCode,404);process.env.MUC_NONSETTLEMENT_MODULES_ENABLED='1';
  assert.equal((await request(path)).res.statusCode,401);assert.equal((await request(path,{cookie:root})).res.statusCode,403);assert.equal((await request('/api/maintenance/extension-module-capabilities',{cookie:root})).payload.manage,false);
  const view=await request(path,{cookie});assert.equal(view.res.statusCode,200);assert.deepEqual(view.payload.modules,[]);
  const body={moduleTypeCode:'extension_api_check',moduleVersion:1,resultType:'CHECK_RESULT',instanceKey:'first',expectedRuleSnapshot:view.payload.ruleSnapshotSha256,reason:'Synthetic explicit registration'};
  const sourceBefore=JSON.stringify(db.prepare('select * from maintenance_flights where id=?').get(id)),coreBefore=JSON.stringify(db.prepare('select * from maintenance_module_instances where opportunity_key=? order by id').all(id));
  const write=payload=>request(path,{method:'POST',cookie,body:payload});assert.equal((await write({...body,hours:0})).res.statusCode,409);assert.equal((await write({...body,expectedRuleSnapshot:'stale'})).res.statusCode,409);
  const drop=installFailureTrigger('fail_extension_audit','maintenance_logs','insert',"new.action='register_nonsettlement_module'",'injected extension audit failure');
  try{assert.equal((await write(body)).res.statusCode,500);assert.equal(JSON.stringify(db.prepare('select * from maintenance_module_instances where opportunity_key=? order by id').all(id)),coreBefore);}finally{drop();}
  const result=await write(body);assert.equal(result.res.statusCode,200,JSON.stringify(result.payload));assert.equal(result.payload.module.completionAvailable,false);assert.equal(result.payload.module.resultSource,null);assert.equal((await write(body)).payload.replayed,true);
  const projection=await request(`/api/maintenance/flights/${id}/report-modules`,{cookie:root});assert.equal(projection.res.statusCode,200);assert.equal(projection.payload.modules.length,4);assert.equal(projection.payload.modules.find(row=>row.moduleTypeCode==='extension_api_check').requiredBeforePendingReview,false);
  assert.equal(JSON.stringify(db.prepare('select * from maintenance_flights where id=?').get(id)),sourceBefore);assert.equal(Number(db.prepare("select count(*) n from maintenance_logs where flight_id=? and action='register_nonsettlement_module'").get(id).n),1);
  db.prepare("update personnel set employment_status='停职' where id=?").run(manager.personId);try{assert.equal((await write({...body,instanceKey:'second'})).res.statusCode,403);}finally{db.prepare("update personnel set employment_status='在职' where id=?").run(manager.personId);}
  db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=? and module='maintenance'").run(manager.id);assert.equal((await request(path,{cookie})).res.statusCode,404);db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(manager.id);
 }finally{keys.forEach((key,index)=>{if(old[index]===undefined)delete process.env[key];else process.env[key]=old[index];});}
});

test('workflow storage retains typed failure facts and task audit lineage without producing settlement rows',()=>{
 const module=db.prepare("select * from maintenance_module_instances where module_code='extension_api_check' order by id limit 1").get();assert.ok(module);
 const before=JSON.stringify(db.prepare('select * from maintenance_effective_hour_results order by id').all());
 const template=JSON.stringify({fixtureOnly:true,code:'schema-contract',version:1,tasks:['inspection']}),digest=createHash('sha256').update(template).digest('hex');
 db.prepare("insert into maintenance_workflow_instances values('workflow-storage-fixture',?,'schema-contract',1,?,?,'CHECK_RESULT','OPEN',1,'extension-manager','t','t')").run(module.id,template,digest);
 db.prepare("insert into maintenance_workflow_tasks values('workflow-storage-task','workflow-storage-fixture','inspection','Synthetic check','extension-manager','extension-manager-person','{\"fixtureOnly\":true}','ASSIGNED',1,null,null,'t','t')").run();
 assert.throws(()=>db.prepare("update maintenance_workflow_tasks set state='SUBMITTED' where id='workflow-storage-task'").run());
 db.prepare("update maintenance_workflow_tasks set state='SUBMITTED',revision=2,result_json='{\"outcome\":\"FAIL\",\"fixtureOnly\":true}',submitted_at='t' where id='workflow-storage-task'").run();
 db.prepare("insert into maintenance_workflow_events values('workflow-storage-event','workflow-storage-fixture','workflow-storage-task','SUBMITTED','extension-manager','{\"fixtureOnly\":true}','schema-fixture-request','fixture-hash','{}','{\"fixtureOnly\":true}','t')").run();
 assert.equal(db.prepare("select state from maintenance_workflow_tasks where id='workflow-storage-task'").get().state,'SUBMITTED');assert.equal(JSON.stringify(db.prepare('select * from maintenance_effective_hour_results order by id').all()),before);
});

test('overnight feedback stores one fact linked to many opportunities and mounts a CHECK_RESULT module without settlement writes',async()=>{
 const {createMaintenanceOvernightFeedback}=await import('../maintenance-overnight-feedback.mjs');
 const {createMaintenanceExtensionModules}=await import('../maintenance-extension-modules.mjs');
 const {readMaintenanceModuleIdentity}=await import('../maintenance-module-instances.mjs');
 const transaction=fn=>{db.exec('begin immediate');try{const result=fn();db.exec('commit');return result;}catch(e){db.exec('rollback');throw e;}};
 const keys=['MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED','MUC_MAINTENANCE_MODULE_SHADOW_ENABLED','MUC_NONSETTLEMENT_MODULES_ENABLED'],old=keys.map(key=>process.env[key]);
 process.env.MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED='1';process.env.MUC_MAINTENANCE_MODULE_SHADOW_ENABLED='1';process.env.MUC_NONSETTLEMENT_MODULES_ENABLED='1';
 const login=async username=>{const r=await request('/api/login',{method:'POST',body:{username,password:'muc2026'}});assert.equal(r.res.statusCode,200);return String(r.res.headers['Set-Cookie']).split(';')[0];};
 const root=await login('54002010');
 try{
  const ids=[];
  for(let index=1;index<=3;index++){const created=await request('/api/maintenance/flights',{method:'POST',cookie:root,body:{date:'2026-11-18',flightNo:'OVN'+index,aircraftNo:'B-OVN'+index,aircraftType:'A320',workKind:'停场'}});assert.equal(created.res.statusCode,201,JSON.stringify(created.payload));ids.push(created.payload.flight.id);}
  const register=createMaintenanceExtensionModules({db,transaction,readIdentity:readMaintenanceModuleIdentity,authorize:()=>true,audit:()=>{},clock:()=>'t'}).register;
  const audits=[];let seq=0;
  const service=createMaintenanceOvernightFeedback({db,transaction,clock:()=>'t',randomId:prefix=>`${prefix}-${++seq}`,authorize:user=>{assert.equal(user.id,'overnight-fixture-actor');return true;},audit:(user,event)=>audits.push(event),
   mountInstance:(opportunityId,instanceKey,reason,user)=>register(opportunityId,{moduleTypeCode:'extension_overnight_feedback',moduleVersion:1,resultType:'CHECK_RESULT',instanceKey,expectedRuleSnapshot:readMaintenanceModuleIdentity(db,opportunityId).ruleSnapshotSha256,reason},user)});
  const actor={id:'overnight-fixture-actor',personId:'overnight-fixture-person'};
  const settlementBefore=JSON.stringify([db.prepare('select * from maintenance_effective_hour_results order by id').all(),db.prepare('select * from maintenance_sortie_results order by id').all()]);
  assert.throws(()=>service.recordFact({clientId:'ovn-a',checkedAt:'2026-11-18 02:30',station:'外站X',summary:'s'},actor),/核实依据/);
  assert.throws(()=>service.recordFact({clientId:'ovn-a',checkedAt:'2026-11-18 02:30',station:'外站X',summary:'s',applicabilityBasis:'排班与外站保障规则核实'},actor),/至少关联一个/);
  assert.throws(()=>service.recordFact({clientId:'ovn-a',checkedAt:'2026-11-18 02:30',station:'外站X',summary:'s',applicabilityBasis:'b',opportunityIds:['missing']},actor),/不存在/);
  const first=service.recordFact({clientId:'ovn-fact-a',checkedAt:'2026-11-18 02:30',station:'外站X',summary:'一次过夜检查覆盖三个机会',applicabilityBasis:'排班与外站保障规则核实：非基地站过夜',opportunityIds:ids,mount:true},actor);
  assert.equal(first.replayed,false);assert.equal(first.fact.links.length,3);assert.equal(first.mounted.length,3);assert.ok(first.mounted.every(row=>row.replayed===false));
  assert.equal(Number(db.prepare('select count(*) n from maintenance_overnight_facts').get().n),1);
  assert.equal(Number(db.prepare('select count(*) n from maintenance_overnight_fact_opportunities').get().n),3);
  const instanceKey='mof_'+createHash('sha256').update('ovn-fact-a').digest('hex').slice(0,32);
  const instances=db.prepare("select * from maintenance_module_instances where module_code='extension_overnight_feedback'").all();
  assert.equal(instances.length,3);assert.ok(instances.every(row=>row.instance_key===instanceKey&&ids.includes(row.opportunity_id)));
  const definition=JSON.parse(db.prepare("select definition_json from maintenance_module_definitions where module_code='extension_overnight_feedback'").get().definition_json);
  assert.equal(definition.resultType,'CHECK_RESULT');assert.equal(definition.requiredBeforePendingReview,false);assert.equal(definition.countsAsFormalReportSubmission,false);
  const replay=service.recordFact({clientId:'ovn-fact-a',mount:true},actor);
  assert.equal(replay.replayed,true);assert.equal(replay.mounted.length,3);assert.ok(replay.mounted.every(row=>row.replayed===true));
  assert.equal(Number(db.prepare('select count(*) n from maintenance_overnight_facts').get().n),1);
  assert.equal(Number(db.prepare('select count(*) n from maintenance_overnight_fact_opportunities').get().n),3);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_module_instances where module_code='extension_overnight_feedback'").get().n),3);
  const second=service.recordFact({clientId:'ovn-fact-b',checkedAt:'2026-11-19 03:00',station:'外站Y',summary:'次日另一场过夜检查',applicabilityBasis:'外站过夜保障规则核实',opportunityIds:[ids[0]]},actor);
  assert.equal(second.replayed,false);assert.equal(second.mounted.length,0);
  assert.equal(Number(db.prepare('select count(*) n from maintenance_overnight_facts').get().n),2);
  const listed=service.listByOpportunity(ids[0],actor);
  assert.equal(listed.facts.length,2);assert.deepEqual(listed.facts.map(row=>row.client_id).sort(),['ovn-fact-a','ovn-fact-b']);
  assert.equal(service.view(second.fact.id,actor).fact.links.length,1);
  assert.equal(service.view(first.fact.id,actor).module.resultType,'CHECK_RESULT');
  assert.equal(audits.length,4);assert.ok(audits.every(event=>event.action==='overnight_feedback_fact'&&event.definition.resultType==='CHECK_RESULT'));
  const projection=await request(`/api/maintenance/flights/${ids[0]}/report-modules`,{cookie:root});
  assert.equal(projection.res.statusCode,200,JSON.stringify(projection.payload));
  const projected=projection.payload.modules.find(row=>row.moduleTypeCode==='extension_overnight_feedback');
  assert.equal(projected.requiredBeforePendingReview,false);assert.equal(projected.resultSource,null);assert.equal(projected.completionAvailable,false);
  assert.equal(JSON.stringify([db.prepare('select * from maintenance_effective_hour_results order by id').all(),db.prepare('select * from maintenance_sortie_results order by id').all()]),settlementBefore);
 }finally{keys.forEach((key,index)=>{if(old[index]===undefined)delete process.env[key];else process.env[key]=old[index];});}
});

test('isolated workflow action fixture preserves original facts and atomically records typed failure completion',async()=>{
 const {createMaintenanceWorkflowActions}=await import('../maintenance-workflow-actions.mjs');
 const {createMaintenanceExtensionModules}=await import('../maintenance-extension-modules.mjs');
 const {readMaintenanceModuleIdentity}=await import('../maintenance-module-instances.mjs');
 const transaction=fn=>{db.exec('begin immediate');try{const result=fn();db.exec('commit');return result;}catch(e){db.exec('rollback');throw e;}};
 const origin=db.prepare("select * from maintenance_module_instances where module_code='extension_api_check' order by id limit 1").get(),identity=readMaintenanceModuleIdentity(db,origin.opportunity_id);
 const module=createMaintenanceExtensionModules({db,transaction,readIdentity:readMaintenanceModuleIdentity,authorize:()=>true,audit:()=>{},clock:()=> 't'}).register(origin.opportunity_id,{moduleTypeCode:'extension_workflow_fixture',moduleVersion:1,resultType:'CHECK_RESULT',instanceKey:'fixture_only',expectedRuleSnapshot:identity.ruleSnapshotSha256,reason:'Isolated action-service fixture; no business authority granted'},{}).module;
 const frozen={code:'workflow_action_fixture_only',version:1,resultType:'CHECK_RESULT',tasks:[{key:'inspection',title:'Isolated test finding'}],outcomes:['PASS','FAIL']};
 const qualify=accountId=>accountId==='fixture-only-actor'?{accountId,personId:'fixture-only-person',fixtureOnly:true}:null;
 const service=createMaintenanceWorkflowActions({db,transaction,authorize:user=>qualify(user),qualifyAssignee:qualify,resolveTemplate:()=>frozen,audit:()=>{},clock:()=> 't'});
 const original=()=>JSON.stringify([db.prepare('select * from maintenance_flights order by id').all(),db.prepare('select * from maintenance_effective_hour_results order by id').all()]),before=original();
 const created=service.create(module.moduleInstanceId,{clientId:'workflow-fixture-create',expectedRuleSnapshot:identity.ruleSnapshotSha256,templateCode:frozen.code,templateVersion:1,assignments:[{taskKey:'inspection',accountId:'fixture-only-actor'}],reason:'Explicit isolated contract fixture'},'fixture-only-actor');
 const task=db.prepare('select * from maintenance_workflow_tasks where workflow_id=?').get(created.workflowId),claim={clientId:'workflow-fixture-claim',expectedRevision:1,taskId:task.id,expectedTaskRevision:1};
 const drop=installFailureTrigger('fail_workflow_action_event','maintenance_workflow_events','insert',"new.event_type='CLAIM'",'injected workflow event failure');
 try{assert.throws(()=>service.claim(created.workflowId,claim,'fixture-only-actor'),/injected workflow event failure/);assert.equal(db.prepare('select revision from maintenance_workflow_instances where id=?').get(created.workflowId).revision,1);assert.equal(db.prepare('select state from maintenance_workflow_tasks where id=?').get(task.id).state,'ASSIGNED');}finally{drop();}
 service.claim(created.workflowId,claim,'fixture-only-actor');
 const request={clientId:'workflow-fixture-submit',expectedRevision:2,taskId:task.id,expectedTaskRevision:2,result:{type:'CHECK_RESULT',outcome:'FAIL',note:'Explicit fixture, not business approval'}};
 const completed=service.submit(created.workflowId,request,'fixture-only-actor');assert.equal(completed.state,'COMPLETED');assert.equal(completed.taskState,'SUBMITTED');assert.equal(service.submit(created.workflowId,request,'fixture-only-actor').replayed,true);
 assert.equal(Number(db.prepare('select count(*) n from maintenance_workflow_events where workflow_id=?').get(created.workflowId).n),3);assert.equal(original(),before);
});

test('workflow HTTP uses independent current authority, private task projections and audited simulation-only actions',async()=>{
 const flags=['MUC_WORKFLOW_TASKS_ENABLED','MUC_WORKFLOW_SIMULATION_ENABLED','MUC_NONSETTLEMENT_MODULES_ENABLED','MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED','MUC_MAINTENANCE_MODULE_SHADOW_ENABLED'],prior=flags.map(key=>process.env[key]);
 const login=async username=>{const result=await request('/api/login',{method:'POST',body:{username,password:'muc2026'}});assert.equal(result.res.statusCode,200);return String(result.res.headers['Set-Cookie']).split(';')[0];};
 const root=await login('54002010'),template=db.prepare("select * from users where id='54002010'").get();
 const manager=createMaintenanceTestAccount(template,{id:'workflow-api-manager',name:'Synthetic workflow manager'}),worker=createMaintenanceTestAccount(template,{id:'workflow-api-worker',name:'Synthetic workflow worker'}),other=createMaintenanceTestAccount(template,{id:'workflow-api-other',name:'Other workflow worker'});
 const grant=(user,code)=>db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(user.id,db.prepare('select id from rbac_roles where code=?').get(code).id,new Date().toISOString());
 grant(manager,'addon_maintenance_module_manager');grant(manager,'addon_maintenance_workflow_manager');grant(worker,'addon_maintenance_workflow_participant');grant(other,'addon_maintenance_workflow_participant');
 db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(manager.id);
 for(const actor of [worker,other])db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=? and module='maintenance'").run(actor.id);
 const managerCookie=await login(manager.username),workerCookie=await login(worker.username),otherCookie=await login(other.username);
 const get=(path,cookie=managerCookie)=>request(path,{cookie}),post=(path,body,cookie=managerCookie)=>request(path,{method:'POST',cookie,body});
 try{
  delete process.env.MUC_WORKFLOW_TASKS_ENABLED;assert.equal((await get('/api/maintenance/workflow-tasks',workerCookie)).res.statusCode,404);assert.equal((await get('/api/maintenance/workflow-capabilities',workerCookie)).payload.enabled,false);
  process.env.MUC_WORKFLOW_TASKS_ENABLED='1';delete process.env.MUC_WORKFLOW_SIMULATION_ENABLED;assert.equal((await get('/api/maintenance/workflow-templates')).res.statusCode,409);
  process.env.MUC_WORKFLOW_SIMULATION_ENABLED='1';process.env.MUC_NONSETTLEMENT_MODULES_ENABLED='1';process.env.MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED='1';process.env.MUC_MAINTENANCE_MODULE_SHADOW_ENABLED='1';
  assert.equal((await request('/api/maintenance/workflow-tasks')).res.statusCode,401);assert.equal((await get('/api/maintenance/workflow-tasks',root)).res.statusCode,403);assert.equal((await get('/api/maintenance/workflow-capabilities',root)).payload.manage,false);
  assert.equal((await get('/api/maintenance/workflow-templates',workerCookie)).res.statusCode,403);
  const templates=(await get('/api/maintenance/workflow-templates')).payload;assert.equal(templates.simulationOnly,true);assert.equal(templates.templates.length,1);
  const candidates=(await get('/api/maintenance/workflow-assignees?search=workflow-api')).payload.candidates;assert.deepEqual(candidates.map(row=>row.accountId).sort(),[worker.id,other.id].sort());
  const created=await post('/api/maintenance/flights',{date:'2026-11-12',flightNo:'WORKFLOWAPI',aircraftNo:'B-WFLOW',aircraftType:'A320',workKind:'停场'},root);assert.equal(created.res.statusCode,201);const flightId=created.payload.flight.id,path=`/api/maintenance/flights/${flightId}`;
  const identity=(await get(path+'/extension-modules')).payload;
  const registration=await post(path+'/extension-modules',{moduleTypeCode:'extension_workflow_simulation',moduleVersion:1,resultType:'CHECK_RESULT',instanceKey:'api_first',expectedRuleSnapshot:identity.ruleSnapshotSha256,reason:'Explicit isolated simulation module'});assert.equal(registration.res.statusCode,200);
  const original=()=>JSON.stringify([db.prepare('select * from maintenance_flights where id=?').get(flightId),db.prepare('select * from maintenance_effective_hour_results order by id').all()]),before=original();
  const body={moduleInstanceId:registration.payload.module.moduleInstanceId,clientId:'workflow-http-create',expectedRuleSnapshot:identity.ruleSnapshotSha256,templateCode:'nonsettlement_simulation',templateVersion:1,assignments:[{taskKey:'feedback',accountId:worker.id}],reason:'Explicit isolated workflow API simulation'};
  assert.equal((await post(path+'/workflows',{...body,template:{outcomes:['FORGED']}})).res.statusCode,409);
  assert.equal((await post(path+'/workflows',{...body,templateVersion:2})).res.statusCode,409);
  assert.equal((await post(path+'/workflows',{...body,assignments:[{taskKey:'feedback',accountId:manager.id}]})).res.statusCode,403);
  const start=await post(path+'/workflows',body);assert.equal(start.res.statusCode,200,JSON.stringify(start.payload));assert.equal(start.payload.simulationOnly,true);assert.equal((await post(path+'/workflows',body)).payload.replayed,true);
  const workflowId=start.payload.workflowId,url=`/api/maintenance/workflows/${workflowId}`;
  const own=(await get(url,workerCookie)).payload;assert.equal(own.tasks.length,1);assert.equal(own.manage,false);assert.equal('qualification_json' in own.tasks[0],false);assert.equal('template_json' in own,false);
  assert.equal(own.completion.available,true);assert.equal(own.completion.complete,false);assert.equal((await get(url+'/result',workerCookie)).res.statusCode,409);
  assert.equal((await get(url,otherCookie)).res.statusCode,404);assert.deepEqual((await get('/api/maintenance/workflow-tasks',otherCookie)).payload.tasks,[]);
  const list=await get('/api/maintenance/workflow-tasks?limit=1',workerCookie);assert.equal(list.payload.tasks.length,1);assert.equal(list.payload.nextCursor,null);assert.equal((await get('/api/maintenance/workflow-tasks?limit=0',workerCookie)).res.statusCode,400);
  const claim={clientId:'workflow-http-claim',expectedRevision:1,taskId:own.tasks[0].taskId,expectedTaskRevision:1};
  assert.equal((await post(url+'/claim',claim)).res.statusCode,403);assert.equal((await post(url+'/claim',claim,workerCookie)).res.statusCode,200);
  const claimedHistory=await get(url+'/audit?limit=1',workerCookie);assert.equal(claimedHistory.res.statusCode,200);assert.ok(claimedHistory.payload.nextCursor);assert.equal(claimedHistory.payload.events[0].eventType,'CREATE');assert.equal(claimedHistory.payload.events[0].reason,null);
  assert.equal((await post(url+'/claim',{...claim,clientId:'workflow-http-stale'},workerCookie)).res.statusCode,409);
  const submission={clientId:'workflow-http-submit',expectedRevision:2,taskId:own.tasks[0].taskId,expectedTaskRevision:2,result:{type:'CHECK_RESULT',outcome:'FAIL',note:'Private simulation finding'}};
  assert.equal((await post(url+'/submit',{...submission,result:{...submission.result,hours:0}},workerCookie)).res.statusCode,409);
  const drop=installFailureTrigger('fail_workflow_http_audit','maintenance_logs','insert',"new.action='workflow_submit'",'injected workflow HTTP audit failure');
  try{assert.equal((await post(url+'/submit',submission,workerCookie)).res.statusCode,500);assert.equal((await get(url,workerCookie)).payload.tasks[0].state,'CLAIMED');}finally{drop();}
  const submitted=await post(url+'/submit',submission,workerCookie);assert.equal(submitted.res.statusCode,200);assert.equal(submitted.payload.state,'COMPLETED');assert.equal(submitted.payload.taskState,'SUBMITTED');assert.equal((await post(url+'/submit',submission,workerCookie)).payload.replayed,true);
  const typed=await get(url+'/result?expectedVersion=3',workerCookie);assert.equal(typed.res.statusCode,200,JSON.stringify(typed.payload));assert.equal(typed.payload.type,'CHECK_RESULT');assert.equal(typed.payload.sourceId,workflowId);assert.equal(typed.payload.sourceVersion,3);assert.equal(typed.payload.outcome,'FAIL');assert.equal('hours' in typed.payload,false);assert.equal('count' in typed.payload,false);
  const workerHistory=await get(url+'/audit',workerCookie),managerHistory=await get(url+'/audit');assert.equal(workerHistory.res.statusCode,200);assert.equal(workerHistory.payload.sourceIntegrity,'VERIFIED');assert.deepEqual(workerHistory.payload.events.map(event=>event.eventType),['CREATE','CLAIM','SUBMIT']);assert.equal(managerHistory.payload.events[0].reason,body.reason);assert.equal(managerHistory.payload.events[0].actor.person.name,manager.name);
  for(const text of [body.reason,manager.name,manager.personId,'Private simulation finding','request_hash','qualification_json','workflow.manage'])assert.equal(JSON.stringify(workerHistory.payload).includes(text),false,text);
  assert.equal(JSON.stringify(managerHistory.payload).includes('Private simulation finding'),false);assert.equal((await get(url+'/audit',otherCookie)).res.statusCode,404);assert.equal((await get(url+'/audit',root)).res.statusCode,403);assert.equal((await get(url+'/audit?manage=true',workerCookie)).res.statusCode,400);
  assert.equal((await get(url+'/audit?cursor='+encodeURIComponent(claimedHistory.payload.nextCursor),workerCookie)).res.statusCode,409);
  const page1=(await get(url+'/audit?limit=1',workerCookie)).payload,page2=(await get(url+'/audit?limit=1&cursor='+encodeURIComponent(page1.nextCursor),workerCookie)).payload,page3=(await get(url+'/audit?limit=1&cursor='+encodeURIComponent(page2.nextCursor),workerCookie)).payload;assert.deepEqual([page1,page2,page3].map(page=>page.events[0].revision),[1,2,3]);assert.equal(page3.nextCursor,null);
  assert.equal((await get(url+'/result?expectedVersion=1',workerCookie)).res.statusCode,409);assert.equal((await get(url+'/result?type=HOUR',workerCookie)).res.statusCode,400);assert.equal((await get(url+'/result',otherCookie)).res.statusCode,404);
  const projected=await get(path+'/report-modules',root),completedModule=projected.payload.modules.find(item=>item.moduleInstanceId===body.moduleInstanceId);assert.equal(projected.res.statusCode,200);assert.equal(completedModule.completionAvailable,true);assert.equal(completedModule.moduleBusinessState,'SUBMITTED');assert.equal(completedModule.resultSource.type,'CHECK_RESULT');assert.equal(completedModule.countsAsFormalReportSubmission,false);assert.equal(completedModule.requiredBeforePendingReview,false);assert.equal(completedModule.requiredBeforeConfirmation,false);assert.equal(JSON.stringify(projected.payload).includes('Private simulation finding'),false);assert.equal(JSON.stringify(projected.payload).includes('permissionSnapshot'),false);
  const originalResult=db.prepare('select result_json from maintenance_workflow_tasks where id=?').get(own.tasks[0].taskId).result_json;
  db.prepare('update maintenance_workflow_tasks set result_json=? where id=?').run(JSON.stringify({type:'CHECK_RESULT',outcome:'FAIL',note:'Tampered note'}),own.tasks[0].taskId);
  try{assert.equal((await get(url+'/result',workerCookie)).res.statusCode,409);const invalid=(await get(path+'/report-modules',root)).payload.modules.find(item=>item.moduleInstanceId===body.moduleInstanceId);assert.equal(invalid.resultSource,null);assert.equal(invalid.completionAvailable,false);assert.equal(invalid.completionError,'WORKFLOW_SOURCE_INVALID');}finally{db.prepare('update maintenance_workflow_tasks set result_json=? where id=?').run(originalResult,own.tasks[0].taskId);}
  db.prepare('update maintenance_workflow_tasks set result_json=? where id=?').run('not-json',own.tasks[0].taskId);
  try{const invalidView=await get(url,workerCookie);assert.equal(invalidView.res.statusCode,200);assert.equal(invalidView.payload.tasks[0].result,null);assert.equal(invalidView.payload.tasks[0].resultUnavailable,true);assert.equal(invalidView.payload.completion.error,'WORKFLOW_SOURCE_INVALID');const audit=await get(url+'/audit');assert.equal(audit.res.statusCode,200);assert.equal(audit.payload.sourceIntegrity,'UNVERIFIED');assert.equal((await post(url+'/submit',submission,workerCookie)).res.statusCode,409);}finally{db.prepare('update maintenance_workflow_tasks set result_json=? where id=?').run(originalResult,own.tasks[0].taskId);}
  const originalTemplate=db.prepare('select template_json from maintenance_workflow_instances where id=?').get(workflowId).template_json;db.prepare('update maintenance_workflow_instances set template_json=? where id=?').run('not-json',workflowId);
  try{assert.equal((await get(url,workerCookie)).res.statusCode,200);const list=await get('/api/maintenance/workflow-tasks?state=ALL',workerCookie);assert.equal(list.res.statusCode,200);assert.equal(list.payload.tasks.some(task=>task.workflowId===workflowId),true);const audit=await get(url+'/audit');assert.equal(audit.res.statusCode,200);assert.equal(audit.payload.sourceIntegrity,'UNVERIFIED');assert.equal(audit.payload.events.length,3);}finally{db.prepare('update maintenance_workflow_instances set template_json=? where id=?').run(originalTemplate,workflowId);}
  assert.equal((await post(url+'/submit',{...submission,result:{type:'CHECK_RESULT',outcome:'PASS'}},workerCookie)).res.statusCode,409);
  assert.deepEqual((await get('/api/maintenance/workflow-tasks',workerCookie)).payload.tasks,[]);assert.equal((await get('/api/maintenance/workflow-tasks?state=ALL',workerCookie)).payload.tasks.length,1);
  assert.equal((await get(url,otherCookie)).res.statusCode,404);assert.equal((await get(url)).payload.tasks[0].result.note,'Private simulation finding');
  const publicAudit=db.prepare("select detail from maintenance_logs where flight_id=? and action='workflow_submit'").get(flightId).detail;assert.equal(publicAudit.includes('Private simulation finding'),false);assert.equal(publicAudit.includes('person-'),false);
  db.prepare("update personnel set employment_status='停职' where id=?").run(worker.personId);try{assert.equal((await get(url,workerCookie)).res.statusCode,403);assert.equal((await get(url+'/audit',workerCookie)).res.statusCode,403);assert.equal((await post(url+'/submit',submission,workerCookie)).res.statusCode,403);}finally{db.prepare("update personnel set employment_status='在职' where id=?").run(worker.personId);}
  db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=? and module='maintenance'").run(manager.id);try{assert.equal((await get(url)).res.statusCode,404);assert.equal((await get(url+'/audit')).res.statusCode,404);}finally{db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(manager.id);}
  const secondModule=await post(path+'/extension-modules',{moduleTypeCode:'extension_workflow_simulation',moduleVersion:1,resultType:'CHECK_RESULT',instanceKey:'api_cancel',expectedRuleSnapshot:identity.ruleSnapshotSha256,reason:'Isolated transfer and cancellation simulation'});assert.equal(secondModule.res.statusCode,200);
  const secondStart=await post(path+'/workflows',{...body,moduleInstanceId:secondModule.payload.module.moduleInstanceId,clientId:'workflow-http-create-cancel',assignments:[{taskKey:'feedback',accountId:other.id}]});assert.equal(secondStart.res.statusCode,200);
  const secondUrl=`/api/maintenance/workflows/${secondStart.payload.workflowId}`,secondView=(await get(secondUrl)).payload;
  const transfer={clientId:'workflow-http-transfer',expectedRevision:1,taskId:secondView.tasks[0].taskId,expectedTaskRevision:1,accountId:worker.id,reason:'Explicit test transfer'};
  assert.equal((await post(secondUrl+'/reassign',transfer,otherCookie)).res.statusCode,403);assert.equal((await post(secondUrl+'/reassign',transfer)).res.statusCode,200);
  assert.equal((await get(secondUrl,otherCookie)).res.statusCode,404);assert.equal((await get(secondUrl,workerCookie)).payload.tasks[0].state,'ASSIGNED');
  assert.equal((await get(secondUrl+'/audit',otherCookie)).res.statusCode,404);const recipientHistory=(await get(secondUrl+'/audit',workerCookie)).payload;assert.deepEqual(recipientHistory.events.map(event=>event.eventType),['REASSIGN']);assert.equal(JSON.stringify(recipientHistory).includes(other.personId),false);assert.equal(JSON.stringify(recipientHistory).includes(transfer.reason),false);
  const cancellation={clientId:'workflow-http-cancel',expectedRevision:2,reason:'Explicit simulation cancellation'};
  assert.equal((await post(secondUrl+'/cancel',cancellation,workerCookie)).res.statusCode,403);assert.equal((await post(secondUrl+'/cancel',cancellation)).payload.state,'CANCELLED');assert.equal((await post(secondUrl+'/cancel',cancellation)).payload.replayed,true);
  assert.equal((await get(secondUrl,workerCookie)).payload.tasks[0].state,'CANCELLED');
  const cancelled=(await get(secondUrl)).payload.completion;assert.equal(cancelled.available,true);assert.equal(cancelled.complete,false);assert.equal(cancelled.state,'CANCELLED');assert.equal(cancelled.resultSource,null);assert.equal((await get(secondUrl+'/result')).res.statusCode,409);
  assert.equal((await get('/api/maintenance/workflow-modules',workerCookie)).res.statusCode,403);assert.equal((await get('/api/maintenance/workflow-modules',root)).res.statusCode,403);
  const moduleRole=db.prepare("select ur.* from rbac_user_roles ur join rbac_roles r on r.id=ur.role_id where ur.user_id=? and r.code='addon_maintenance_module_manager'").get(manager.id);
  db.prepare('delete from rbac_user_roles where user_id=? and role_id=?').run(manager.id,moduleRole.role_id);
  try{const modules=await get('/api/maintenance/workflow-modules?search=WORKFLOWAPI');assert.equal(modules.res.statusCode,200);assert.equal(modules.payload.modules.length,2);assert.equal(modules.payload.modules[0].opportunity.flightNo,'WORKFLOWAPI');assert.equal(modules.payload.modules[0].ruleSnapshotSha256,identity.ruleSnapshotSha256);assert.equal(modules.payload.modules.some(row=>row.moduleInstanceId===body.moduleInstanceId),true);assert.equal(modules.payload.nextCursor,null);assert.equal('result' in modules.payload.modules[0],false);}finally{db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(moduleRole.user_id,moduleRole.role_id,moduleRole.created_at);}
  assert.equal((await get('/api/maintenance/workflow-modules?search='+encodeURIComponent('a'.repeat(101)))).res.statusCode,400);
  assert.equal(original(),before);assert.equal(Number(db.prepare('select count(*) n from maintenance_workflow_events where workflow_id=?').get(workflowId).n),3);
 }finally{flags.forEach((key,index)=>{if(prior[index]===undefined)delete process.env[key];else process.env[key]=prior[index];});}
});

test('CI artifact maintenance scenario exercises original routes without promoting pending review hours (source adapter only)',async()=>{
 const {verifyMaintenancePackage}=await import('../scripts/check-maintenance-package.mjs');
 const keys=['CI','ATTENDANCE_TEST_DATABASE','MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED'],old=keys.map(k=>process.env[k]),originalFetch=globalThis.fetch;
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}});assert.equal(login.res.statusCode,200);const cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
 try{
  for(const k of ['CI','ATTENDANCE_TEST_DATABASE'])process.env[k]='true';process.env.MUC_MAINTENANCE_V101='draft';for(const k of keys.slice(3))process.env[k]='1';
  globalThis.fetch=async(url,options={})=>{const parsed=new URL(url);assert.equal(parsed.origin,'http://127.0.0.1:18888');const result=await request(parsed.pathname+parsed.search,{method:options.method||'GET',cookie:options.headers.cookie,...(options.body?{body:JSON.parse(options.body)}:{})});return new Response(JSON.stringify(result.payload),{status:result.res.statusCode,headers:{'content-type':'application/json'}});};
  const proof=await verifyMaintenancePackage({origin:'http://127.0.0.1:18888',cookie,personId:login.payload.user.personId});assert.equal(proof.addedConfirmedHours,0);assert.equal(proof.addedReleaseSorties,1);
 }finally{globalThis.fetch=originalFetch;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});

test('ordinary opportunity edits reject stale explicit versions and advance versions even at a fixed clock',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
 const body={date:'2026-11-14',flightNo:'EDIT-CAS',aircraftNo:'B-CAS',aircraftType:'A320',workKind:'停场'},created=await request('/api/maintenance/flights',{method:'POST',cookie,body});assert.equal(created.res.statusCode,201);const path=`/api/maintenance/flights/${created.payload.flight.id}`,version=created.payload.flight.updatedAt;
 const first=await request(path,{method:'PUT',cookie,body:{...body,stand:'A',expectedUpdatedAt:version}});assert.equal(first.res.statusCode,200);assert.notEqual(first.payload.flight.updatedAt,version);
 const before=db.prepare('select * from maintenance_flights where id=?').get(created.payload.flight.id),logs=Number(db.prepare('select count(*) n from maintenance_logs where flight_id=?').get(before.id).n);
 const stale=await request(path,{method:'PUT',cookie,body:{...body,stand:'B',expectedUpdatedAt:version}});assert.equal(stale.res.statusCode,409);assert.deepEqual(db.prepare('select * from maintenance_flights where id=?').get(before.id),before);assert.equal(Number(db.prepare('select count(*) n from maintenance_logs where flight_id=?').get(before.id).n),logs);
 const legacy=await request(path,{method:'PUT',cookie,body:{...body,stand:'LEGACY'}});assert.equal(legacy.res.statusCode,200);
});

test('routine shared draft rechecks the committed version after entering its transaction',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
 const created=await request('/api/maintenance/flights',{method:'POST',cookie,body:{date:'2026-11-14',flightNo:'ROUTINE-CAS',aircraftNo:'B-RCAS',aircraftType:'A320',workKind:'航后'}});assert.equal(created.res.statusCode,201);const id=created.payload.flight.id;
 assert.equal((await request(`/api/maintenance/flights/${id}/dispatch`,{method:'POST',cookie,body:{expectedUpdatedAt:created.payload.flight.updatedAt,assignments:[{role:'放行',personId},{role:'接机',personId}]}})).res.statusCode,200);
 const url=`/api/maintenance/flights/${id}/reports/routine/draft`,body={version:0,entries:[{role:'接机',personId}],releasePersonId:personId,feedback:'FIRST'};
 const first=await request(url,{method:'PUT',cookie,body});assert.equal(first.res.statusCode,200);const current=db.prepare("select * from maintenance_report_drafts where flight_id=? and report_type='routine'").get(id),peerJson=JSON.stringify({...JSON.parse(current.payload_json),feedback:'PEER'}),originalExec=db.exec;let injected=false;
 db.exec=sql=>{if(!injected&&/^begin immediate$/i.test(String(sql).trim())){injected=true;db.prepare('update maintenance_report_drafts set version=version+1,payload_json=? where id=?').run(peerJson,current.id);}return originalExec(sql);};
 try{const stale=await request(url,{method:'PUT',cookie,body:{...body,version:current.version,feedback:'STALE'}});assert.equal(injected,true);assert.equal(stale.res.statusCode,409,JSON.stringify(stale.payload));const saved=db.prepare('select * from maintenance_report_drafts where id=?').get(current.id);assert.equal(Number(saved.version),Number(current.version)+1);assert.equal(saved.payload_json,peerJson);}finally{db.exec=originalExec;}
});

test('original manual postflight lifecycle keeps drafts and partial reports separate and confirms each result once',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
 const ok=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify({path,status:r.res.statusCode,payload:r.payload}));return r.payload;};
 const before=(await ok('/api/maintenance/stats/personal?month=2026-11')).metrics;
 const input={date:'2026-11-14',flightNo:'LIFECYCLE-QA',aircraftNo:'B-LIFEQA',aircraftType:'A320',workKind:'航后'},created=(await ok('/api/maintenance/flights','POST',input)).flight,id=created.id,base=`/api/maintenance/flights/${id}`;
 // Explicit frozen rule fixture only; all statuses, assignments, batches and results below use original APIs.
 db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),id);
 const version=async()=>(await ok(base)).flight.updatedAt,entries=[{role:'接机',personId}];
 const facts=()=>({hours:db.prepare('select * from maintenance_hour_results where flight_id=? order by id').all(id),sorties:db.prepare('select * from maintenance_sortie_results where flight_id=? order by id').all(id)});
 await ok(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[{role:'放行',personId},...entries]});
 const draft=await ok(base+'/reports/routine/draft','PUT',{version:0,entries,releasePersonId:personId});assert.deepEqual(facts().hours,[]);assert.equal(Number(db.prepare('select count(*) n from maintenance_report_batches where flight_id=?').get(id).n),0);
 await ok(base+'/reports/routine','PUT',{expectedUpdatedAt:await version(),draftVersion:draft.draft.version,entries});assert.equal((await ok(base)).flight.status,'已提报');assert.equal(facts().hours.reduce((n,r)=>n+Number(r.hours),0),5);assert.ok(facts().hours.every(r=>r.status!=='已确认'));assert.equal((await ok('/api/maintenance/stats/personal?month=2026-11')).metrics.monthHours,before.monthHours);
 await ok(base+'/reports/release','PUT',{expectedUpdatedAt:await version(),releasePersonId:personId});assert.equal((await ok(base)).flight.status,'已提报');
 await ok(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:entries,nonroutineItems:[],releasePersonId:personId});assert.equal((await ok(base)).flight.status,'待复核');assert.ok(facts().hours.every(r=>r.status==='待复核'));
 const tree=(await ok(base+'/review')).review,confirm={mode:'confirm',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(p=>({personId:p.personId,role:p.role}))}))};
 await ok(base+'/review','PUT',confirm);assert.equal((await ok(base)).flight.status,'已确认');const frozen=facts();assert.ok(frozen.hours.every(r=>r.status==='已确认'));assert.equal(frozen.hours.reduce((n,r)=>n+Number(r.hours),0),5);
 const retry=await request(base+'/review',{method:'PUT',cookie,body:confirm});assert.ok([400,409].includes(retry.res.statusCode));assert.deepEqual(facts(),frozen);
 const edit=await request(base,{method:'PUT',cookie,body:{...input,stand:'BLOCKED'}});assert.equal(edit.res.statusCode,409);assert.deepEqual(facts(),frozen);
 const after=(await ok('/api/maintenance/stats/personal?month=2026-11')).metrics;assert.equal(after.monthHours-before.monthHours,5);assert.equal(after.monthSorties-before.monthSorties,1);
});

test('dispatch additions preserve existing association identities and unchecking never removes a persisted assignment',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
 const peer=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'dispatch-retain-peer',name:'派工保留验收'});
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const flight=(await call('/api/maintenance/flights','POST',{date:'2026-11-14',flightNo:'ASSOC-RETAIN-QA',aircraftNo:'B-ASSOC',aircraftType:'A320',workKind:'航后'})).flight,base=`/api/maintenance/flights/${flight.id}`;
 const assignments=[{role:'放行',personId},{role:'接机',personId},{role:'接机',personId:peer.personId}],rows=()=>db.prepare('select * from maintenance_assignments where flight_id=? order by id').all(flight.id),version=async()=>(await call(base)).flight.updatedAt;
 await call(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments});const original=rows();assert.equal(original.length,3);
 await call(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[...assignments.slice().reverse(),assignments[1]]});assert.deepEqual(rows(),original,'duplicate/reordered selections must retain the persisted association records');
 await call(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[assignments[0],assignments[2]]});assert.deepEqual(rows(),original,'omitting an existing selection must not implicitly delete it');
});

test('explicit dispatch removal previews one association, rechecks impact and preserves drafts and locked facts',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
 const peer=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'dispatch-remove-peer',name:'独立删除验收'});
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify({path,status:r.res.statusCode,payload:r.payload}));return r.payload;};
 const flight=(await call('/api/maintenance/flights','POST',{date:'2026-11-14',flightNo:'ASSOC-REMOVE-QA',aircraftNo:'B-REMOVE',aircraftType:'A320',workKind:'航后'})).flight,base=`/api/maintenance/flights/${flight.id}`,version=async()=>(await call(base)).flight.updatedAt;
 db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flight.id);
 await call(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[{role:'放行',personId},{role:'接机',personId},{role:'接机',personId:peer.personId}]});
 const rows=()=>db.prepare('select * from maintenance_assignments where flight_id=? order by id').all(flight.id),target=rows().find(row=>row.person_id===peer.personId),url=`/api/maintenance/assignments/${target.id}`;
 const before=rows(),openedVersion=await version(),preview=(await call(url+'/removal-preview','POST',{expectedUpdatedAt:openedVersion})).impact;assert.deepEqual(rows(),before);assert.equal(await version(),openedVersion);assert.equal(preview.assignment.id,target.id);
 for(const body of [{expectedUpdatedAt:openedVersion,reason:'确认删除'},{expectedUpdatedAt:openedVersion,confirmation:preview.confirmation}]){const r=await request(url,{method:'DELETE',cookie,body});assert.ok([400,409].includes(r.res.statusCode));assert.deepEqual(rows(),before);}
 const draft=await call(base+'/reports/routine/draft','PUT',{version:0,entries:[{role:'接机',personId},{role:'接机',personId:peer.personId}],releasePersonId:personId});
 const stale=await request(url,{method:'DELETE',cookie,body:{expectedUpdatedAt:openedVersion,confirmation:preview.confirmation,reason:'旧预览'}});assert.equal(stale.res.statusCode,409);assert.deepEqual(rows(),before);
 const current=(await call(url+'/removal-preview','POST',{expectedUpdatedAt:await version()})).impact;assert.equal(current.drafts[0].version,draft.draft.version);
 const draftRows=()=>db.prepare('select * from maintenance_report_drafts where flight_id=? order by id').all(flight.id),savedDrafts=draftRows(),body={expectedUpdatedAt:current.expectedUpdatedAt,confirmation:current.confirmation,reason:'仅移除该正式派工关联'};
 const cleanup=installFailureTrigger('dispatch_remove_rollback','maintenance_logs','insert',"new.action='dispatch_assignment_removed'",'dispatch remove audit failure');
 try{const failed=await request(url,{method:'DELETE',cookie,body});assert.equal(failed.res.statusCode,500);assert.deepEqual(rows(),before);assert.deepEqual(draftRows(),savedDrafts);assert.equal(await version(),current.expectedUpdatedAt);}finally{cleanup();}
 const worker=await request('/api/login',{method:'POST',body:{username:peer.username,password:'muc2026'}}),workerCookie=String(worker.res.headers['Set-Cookie']).split(';')[0];
 const denied=await request(url,{method:'DELETE',cookie:workerCookie,body});assert.ok([403,404].includes(denied.res.statusCode));assert.deepEqual(rows(),before);
 await call(url,'DELETE',body);assert.deepEqual(rows(),before.filter(row=>row.id!==target.id));assert.deepEqual(draftRows(),savedDrafts);
 const audit=db.prepare("select detail from maintenance_logs where flight_id=? and action='dispatch_assignment_removed'").all(flight.id);assert.equal(audit.length,1);assert.equal(JSON.parse(audit[0].detail).removed.id,target.id);assert.equal(JSON.parse(audit[0].detail).reason,body.reason);
 await call(base+'/reports/routine','PUT',{expectedUpdatedAt:await version(),draftVersion:draft.draft.version,entries:[{role:'接机',personId}]});
 const locked=rows().find(row=>row.role==='接机'),facts=JSON.stringify({rows:rows(),hours:db.prepare('select * from maintenance_hour_results where flight_id=? order by id').all(flight.id)});
 const blocked=await request(`/api/maintenance/assignments/${locked.id}/removal-preview`,{method:'POST',cookie,body:{expectedUpdatedAt:await version()}});assert.equal(blocked.res.statusCode,409);assert.equal(JSON.stringify({rows:rows(),hours:db.prepare('select * from maintenance_hour_results where flight_id=? order by id').all(flight.id)}),facts);
});

test('archive addition client identities survive refresh retries and reject reuse for different facts',async()=>{
 const f=await supplementalWorkFixture('ARCHIVE-RETRY-SOURCE');assert.equal((await f.report({})).res.statusCode,200);assert.equal((await f.putReview({mode:'confirm',routineElectronicSigned:false,nonroutineElectronicSigned:false})).res.statusCode,200);
 const addition={clientId:'archive-stable-addition',chapter:'974',title:'稳定来源归档漏项',category:'工卡指令',standardHours:2,reportExplanation:'一项真实漏报工作',assignments:[{personId:f.user.personId,role:'主做'}]};
 const write=items=>f.putReview({reason:'合成归档重试来源验证',newSubtasks:items});
 const duplicated=await write([addition,addition]);assert.equal(duplicated.res.statusCode,409);assert.equal(Number(db.prepare('select count(*) n from maintenance_subtasks where flight_id=?').get(f.id).n),0);
 const before=()=>Object.fromEntries(['maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_report_source_journal','maintenance_logs','maintenance_review_addition_sources'].map(t=>[t,db.prepare(`select * from ${t} where flight_id=? order by ${t==='maintenance_review_addition_sources'?'client_id':'id'}`).all(f.id)]));
 for(const [table,event,condition] of [['maintenance_review_addition_sources','insert',`new.flight_id='${f.id}'`],['maintenance_logs','insert',"new.action='confirmed_data_correct'"]]){const facts=before(),drop=installFailureTrigger('fail_archive_source_atomic',table,event,condition,'injected archive source atomic failure');try{assert.equal((await write([addition])).res.statusCode,500);assert.deepEqual(before(),facts);}finally{drop();}}
 const first=await write([addition]);assert.equal(first.res.statusCode,200,JSON.stringify(first.payload));const source=db.prepare('select * from maintenance_review_addition_sources where flight_id=?').get(f.id),hours=db.prepare('select * from maintenance_hour_results where flight_id=? order by id').all(f.id),entries=db.prepare('select * from maintenance_report_entries where flight_id=? order by id').all(f.id);assert.equal(source.client_id,addition.clientId);assert.equal(source.source_kind,'ARCHIVE_ADDITION');assert.equal(source.anonymous,0);assert.equal(hours.length,1);assert.equal(Number(hours[0].hours),2);
 const retry=await write([addition]);assert.equal(retry.res.statusCode,200,JSON.stringify(retry.payload));assert.equal(Number(db.prepare('select count(*) n from maintenance_subtasks where flight_id=?').get(f.id).n),1);assert.deepEqual(db.prepare('select * from maintenance_hour_results where flight_id=? order by id').all(f.id),hours);assert.deepEqual(db.prepare('select * from maintenance_report_entries where flight_id=? order by id').all(f.id),entries);assert.deepEqual(db.prepare('select * from maintenance_review_addition_sources where flight_id=?').get(f.id),source);
 for(const changed of [{...addition,standardHours:3},{...addition,title:'改名冒用同一来源'}]){const facts=before();assert.equal((await write([changed])).res.statusCode,409);assert.deepEqual(before(),facts);}
 const oldClient={...addition,title:'旧客户端独立漏项',standardHours:1};delete oldClient.clientId;const legacy=await write([oldClient]);assert.equal(legacy.res.statusCode,200,JSON.stringify(legacy.payload));const sources=db.prepare('select * from maintenance_review_addition_sources where flight_id=? order by client_id').all(f.id);assert.equal(sources.length,2);assert.equal(sources.filter(row=>Number(row.anonymous)===1).length,1);assert.equal(Number(db.prepare('select sum(hours) n from maintenance_hour_results where flight_id=?').get(f.id).n),3);
});

test('review addition identities survive confirmation and authorized removal without resurrecting deleted work',async()=>{
 const f=await supplementalWorkFixture('REVIEW-ADDITION-TRANSITION');assert.equal((await f.report({})).res.statusCode,200);
 const addition={clientId:'review-transition-deleted-source',chapter:'973',title:'复核补录待核对工作',category:'工卡指令',standardHours:2,assignments:[{personId:f.user.personId,role:'主做'}]},survivor={...addition,clientId:'review-transition-survivor-source',title:'独立保留工作',standardHours:1};
 const write=fields=>f.putReview({reason:'合成复核来源流转核对',...fields}),sources=()=>db.prepare('select * from maintenance_review_addition_sources where flight_id=? order by client_id').all(f.id),hours=()=>db.prepare('select * from maintenance_hour_results where flight_id=? order by id').all(f.id);
 assert.equal((await write({newSubtasks:[addition,survivor]})).res.statusCode,200);const originalSources=sources();assert.equal(originalSources.length,2);assert.ok(originalSources.every(row=>row.source_kind==='REVIEW_ADDITION'));assert.equal((await f.getReview()).flight.status,'待复核');assert.equal(hours().length,2);assert.ok(hours().every(row=>row.status==='待复核'));assert.equal(Number(hours().reduce((sum,row)=>sum+Number(row.hours),0)),3);
 assert.equal((await write({newSubtasks:[addition,survivor]})).res.statusCode,200);assert.deepEqual(sources(),originalSources);assert.equal(hours().length,2);
 const confirmed=await write({mode:'confirm',newSubtasks:[addition,survivor],routineElectronicSigned:false,nonroutineElectronicSigned:false});assert.equal(confirmed.res.statusCode,200,JSON.stringify(confirmed.payload));assert.equal(confirmed.payload.review.flight.status,'已确认');assert.deepEqual(sources(),originalSources);assert.equal(hours().length,2);assert.ok(hours().every(row=>row.status==='已确认'));
 const savedHours=hours(),savedEntries=db.prepare('select * from maintenance_report_entries where flight_id=? order by id').all(f.id);assert.equal((await write({newSubtasks:[addition,survivor]})).res.statusCode,200);assert.deepEqual(hours(),savedHours);assert.deepEqual(db.prepare('select * from maintenance_report_entries where flight_id=? order by id').all(f.id),savedEntries);
 const removed=originalSources.find(row=>row.client_id===addition.clientId),kept=originalSources.find(row=>row.client_id===survivor.clientId),facts=()=>Object.fromEntries(['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_report_source_journal','maintenance_logs'].map(t=>[t,db.prepare(`select * from ${t} where ${t==='maintenance_flights'?'id':'flight_id'}=? order by id`).all(f.id)])),url=`/api/maintenance/subtasks/${removed.subtask_id}`;
 const before=facts(),drop=installFailureTrigger('fail_review_addition_removal','maintenance_logs','insert',"new.action='confirmed_subtask_delete'",'injected removal audit failure');try{assert.equal((await request(url,{method:'DELETE',cookie:f.cookie,body:{reason:'合成删除回滚检查'}})).res.statusCode,500);assert.deepEqual(facts(),before);assert.deepEqual(sources(),originalSources);}finally{drop();}
 const deleted=await request(url,{method:'DELETE',cookie:f.cookie,body:{reason:'仅删除指定补录工作'}});assert.equal(deleted.res.statusCode,200,JSON.stringify(deleted.payload));assert.deepEqual(sources(),originalSources);assert.equal(db.prepare('select id from maintenance_subtasks where id=?').get(removed.subtask_id),undefined);assert.deepEqual(hours(),savedHours.filter(row=>row.owner_id===kept.subtask_id));assert.equal((await f.getReview()).flight.status,'已确认');
 const audit=JSON.parse(db.prepare("select detail from maintenance_logs where flight_id=? and action='confirmed_subtask_delete'").get(f.id).detail);assert.deepEqual(audit.before.reviewAdditionSources,JSON.parse(JSON.stringify(originalSources)));
 const after=facts();for(let i=0;i<2;i++){const replay=await write({newSubtasks:[addition]});assert.equal(replay.res.statusCode,409,JSON.stringify(replay.payload));assert.match(replay.payload.error,/已删除|不可用/);assert.deepEqual(facts(),after);assert.deepEqual(sources(),originalSources);}
 assert.equal((await request(`/api/maintenance/flights/${f.id}`,{method:'DELETE',cookie:f.cookie,body:{reason:'合成整机会删除保留来源验证'}})).res.statusCode,200);assert.deepEqual(sources(),originalSources);assert.equal(hours().length,0);const flightAudit=JSON.parse(db.prepare("select detail from maintenance_logs where flight_id=? and action='confirmed_flight_delete'").get(f.id).detail);assert.deepEqual(flightAudit.before.reviewAdditionSources,JSON.parse(JSON.stringify(originalSources)));assert.equal((await request(`/api/maintenance/flights/${f.id}/review`,{method:'PUT',cookie:f.cookie,body:{mode:'save',reason:'旧请求不得重建已删除机会',newSubtasks:[survivor]}})).res.statusCode,404);assert.deepEqual(sources(),originalSources);
});

test('review additions and replacement participants recheck narrowed scope at transaction entry',async()=>{
 const template=db.prepare("select * from users where id='54002010'").get();
 for(const kind of ['addition','replacement']){
  const f=await supplementalWorkFixture(`REVIEW-NEW-PERSON-${kind}`);assert.equal((await f.report({})).res.statusCode,200);const actor=createMaintenanceTestAccount(template,{id:`review-new-person-${kind}`,name:'新增人员范围核对'}),grant=code=>db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(actor.id,db.prepare('select id from rbac_roles where code=?').get(code).id,new Date().toISOString());grant('addon_maintenance_review');db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(actor.id);
  // Isolated original report fixture: the existing tree remains wholly in self scope.
  for(const table of ['maintenance_assignments','maintenance_report_entries','maintenance_sortie_results'])db.prepare(`update ${table} set person_id=? where flight_id=?`).run(actor.personId,f.id);
  const signed=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}}),cookie=String(signed.res.headers['Set-Cookie']).split(';')[0],tree=(await request(`/api/maintenance/flights/${f.id}/review`,{cookie})).payload.review,body={mode:'save',reason:'合成新增人员范围重检',expectedUpdatedAt:tree.flight.updatedAt,tasks:tree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))};
  if(kind==='addition')body.newSubtasks=[{clientId:'review-narrowed-new-source',chapter:'972',title:'新增范围外人员不得入账',category:'工卡指令',standardHours:2,assignments:[{personId:f.user.personId,role:'主做'}]}];else body.tasks[0].assignments=[{personId:f.user.personId,role:'放行'}];
  const tables=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_report_source_journal','maintenance_review_addition_sources','maintenance_logs'],facts=()=>JSON.stringify(tables.map(t=>db.prepare(`select * from ${t} where ${t==='maintenance_flights'?'id':'flight_id'}=? order by ${t==='maintenance_review_addition_sources'?'client_id':'id'}`).all(f.id))),before=facts(),original=db.exec.bind(db);let injected=false;
  db.exec=sql=>{if(!injected&&/^begin immediate$/i.test(String(sql).trim())){injected=true;db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=? and module='maintenance'").run(actor.id);}return original(sql);};
  try{const result=await request(`/api/maintenance/flights/${f.id}/review`,{method:'PUT',cookie,body});assert.equal(injected,true);assert.ok([400,403].includes(result.res.statusCode),`${kind}: ${JSON.stringify(result.payload)}`);assert.equal(facts(),before);}finally{db.exec=original;}
  const selfTree=(await request(`/api/maintenance/flights/${f.id}/review`,{cookie})).payload.review;assert.equal(selfTree.canEditEntireTree,true);const allowed={...body,expectedUpdatedAt:selfTree.flight.updatedAt,tasks:selfTree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))})),newSubtasks:[{clientId:`review-narrowed-own-${kind}`,chapter:'972',title:'当前范围内独立工作',category:'工卡指令',standardHours:1,assignments:[{personId:actor.personId,role:'主做'}]}]};assert.equal((await request(`/api/maintenance/flights/${f.id}/review`,{method:'PUT',cookie,body:allowed})).res.statusCode,200);assert.equal(Number(db.prepare('select sum(hours) n from maintenance_hour_results where flight_id=?').get(f.id).n),1);
 }
});

test('original subtask and opportunity deletions recheck current specific permissions and scope before removing legacy results',async()=>{
 const template=db.prepare("select * from users where id='54002010'").get();
 for(const target of ['subtask','flight'])for(const state of ['pending','confirmed']){
  const f=await supplementalWorkFixture(`DELETE-AUTH-${target}-${state}`);assert.equal((await f.report({})).res.statusCode,200);assert.equal((await f.putReview({reason:'合成原删除权限核对来源',newSubtasks:[{clientId:`delete-auth-${target}-${state}`,chapter:'971',title:'原删除事务保护',category:'工卡指令',standardHours:2,assignments:[{personId:f.user.personId,role:'主做'}]}]})).res.statusCode,200);if(state==='confirmed')assert.equal((await f.putReview({mode:'confirm',routineElectronicSigned:false,nonroutineElectronicSigned:false})).res.statusCode,200);
  const source=db.prepare('select * from maintenance_review_addition_sources where flight_id=?').get(f.id),actor=createMaintenanceTestAccount(template,{id:`delete-auth-${target}-${state}`,name:'原删除权限核对员'});for(const code of ['dispatcher','addon_maintenance_delete','addon_maintenance_review','addon_archive_modify'])db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(actor.id,db.prepare('select id from rbac_roles where code=?').get(code).id,new Date().toISOString());db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(actor.id);
  const login=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],url=target==='flight'?`/api/maintenance/flights/${f.id}`:`/api/maintenance/subtasks/${source.subtask_id}`,roles=db.prepare('select * from rbac_user_roles where user_id=?').all(actor.id),tables=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_report_source_journal','maintenance_review_addition_sources','maintenance_logs'],facts=()=>JSON.stringify(tables.map(t=>db.prepare(`select * from ${t} where ${t==='maintenance_flights'?'id':'flight_id'}=? order by ${t==='maintenance_review_addition_sources'?'client_id':'id'}`).all(f.id)));
  for(const change of ['primary-permission','state-permission','scope','account','personnel']){
   const before=facts(),original=db.exec.bind(db);let injected=false;
   db.exec=sql=>{if(!injected&&/^begin immediate$/i.test(String(sql).trim())){injected=true;if(change==='primary-permission')db.prepare('delete from rbac_user_roles where user_id=? and role_id=(select id from rbac_roles where code=?)').run(actor.id,target==='flight'?'addon_maintenance_delete':'dispatcher');if(change==='state-permission')db.prepare(`delete from rbac_user_roles where user_id=? and role_id in (select id from rbac_roles where code in (${state==='confirmed'?"'addon_archive_modify'":"'addon_maintenance_review','addon_archive_modify'"}))`).run(actor.id);if(change==='scope')db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=? and module='maintenance'").run(actor.id);if(change==='account')db.prepare("update users set status='inactive' where id=?").run(actor.id);if(change==='personnel')db.prepare("update personnel set employment_status='停职' where id=?").run(actor.personId);}return original(sql);};
   try{const result=await request(url,{method:'DELETE',cookie,body:{reason:'等待期间资格变化不得删除'}});assert.equal(injected,true);assert.ok([403,404].includes(result.res.statusCode),`${target}/${state}/${change}: ${JSON.stringify(result.payload)}`);assert.equal(facts(),before);}finally{db.exec=original;db.prepare("update users set status='active' where id=?").run(actor.id);db.prepare("update personnel set employment_status='在职' where id=?").run(actor.personId);db.prepare('delete from rbac_user_roles where user_id=?').run(actor.id);for(const row of roles)db.prepare(`insert into rbac_user_roles(${Object.keys(row).join(',')}) values(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(actor.id);}
  }
  assert.equal((await request(url,{method:'DELETE',cookie,body:{reason:'当前授权完整时保留原合法删除'}})).res.statusCode,200);assert.deepEqual(db.prepare('select * from maintenance_review_addition_sources where flight_id=?').get(f.id),source);assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(f.id).n),0);
 }
});

test('scoped original deletion keeps unrelated sibling work and rechecks access to empty opportunities',async()=>{
 const f=await supplementalWorkFixture('DELETE-SELF-SIBLING');assert.equal((await f.report({})).res.statusCode,200);const actor=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'delete-self-sibling',name:'指定单项删除员'});for(const code of ['dispatcher','addon_maintenance_review','addon_maintenance_delete'])db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(actor.id,db.prepare('select id from rbac_roles where code=?').get(code).id,new Date().toISOString());db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=? and module='maintenance'").run(actor.id);
 const additions=[{clientId:'delete-own-sibling-source',chapter:'970',title:'本人指定工作',category:'工卡指令',standardHours:1,assignments:[{personId:actor.personId,role:'主做'}]},{clientId:'delete-other-sibling-source',chapter:'970',title:'其他人员独立工作',category:'工卡指令',standardHours:2,assignments:[{personId:f.user.personId,role:'主做'}]}];assert.equal((await f.putReview({reason:'原范围内指定删除正向检查',newSubtasks:additions})).res.statusCode,200);const sources=db.prepare('select * from maintenance_review_addition_sources where flight_id=? order by client_id').all(f.id),own=sources.find(row=>row.client_id===additions[0].clientId),other=sources.find(row=>row.client_id===additions[1].clientId),kept=db.prepare('select * from maintenance_hour_results where owner_id=?').get(other.subtask_id);
 // Isolated creator access preserves the original route boundary; actual participants alone do not grant deletion access.
 db.prepare('update maintenance_flights set created_by=? where id=?').run(actor.id,f.id);
 const signed=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}}),cookie=String(signed.res.headers['Set-Cookie']).split(';')[0];assert.equal((await request(`/api/maintenance/subtasks/${own.subtask_id}`,{method:'DELETE',cookie,body:{reason:'仅删除本人范围内工作'}})).res.statusCode,200);assert.deepEqual(db.prepare('select * from maintenance_hour_results where owner_id=?').get(other.subtask_id),kept);assert.deepEqual(db.prepare('select * from maintenance_review_addition_sources where flight_id=? order by client_id').all(f.id),sources);assert.equal((await request(`/api/maintenance/flights/${f.id}`,{method:'DELETE',cookie,body:{reason:'不能删除范围外兄弟工作'}})).res.statusCode,403);
 const empty=await request('/api/maintenance/flights',{method:'POST',cookie:f.cookie,body:{date:'2026-09-04',flightNo:'DELETE-EMPTY-AUTH',aircraftNo:'B-EMPTY',workKind:'停场'}});assert.equal(empty.res.statusCode,201);const flight=empty.payload.flight;db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(actor.id);const original=db.exec.bind(db);let injected=false;db.exec=sql=>{if(!injected&&/^begin immediate$/i.test(String(sql).trim())){injected=true;db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=? and module='maintenance'").run(actor.id);}return original(sql);};try{const denied=await request(`/api/maintenance/flights/${flight.id}`,{method:'DELETE',cookie,body:{}});assert.equal(injected,true);assert.equal(denied.res.statusCode,404);assert.equal(db.prepare('select id from maintenance_flights where id=?').get(flight.id).id,flight.id);}finally{db.exec=original;}assert.equal(Number(db.prepare('select count(*) n from maintenance_logs where flight_id=? and action=?').get(flight.id,'delete_flight').n),0);
 const ownEmpty=await request('/api/maintenance/flights',{method:'POST',cookie,body:{date:'2026-09-04',flightNo:'DELETE-OWN-EMPTY',aircraftNo:'B-EMPTY2',workKind:'停场'}});assert.equal(ownEmpty.res.statusCode,201);assert.equal((await request(`/api/maintenance/flights/${ownEmpty.payload.flight.id}`,{method:'DELETE',cookie,body:{}})).res.statusCode,200);
});

test('archive additions cannot reuse managed review identities before or after recognition posting',async()=>{
 const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'],previous=flags.map(k=>process.env[k]);
 try{
  for(const k of flags)process.env[k]='1';process.env.MUC_MAINTENANCE_V101='draft';
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId,template=db.prepare("select * from users where id='54002010'").get();
  const call=async(path,method='GET',body,auth=cookie)=>{const r=await request(path,{method,cookie:auth,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify({path,status:r.res.statusCode,payload:r.payload}));return r.payload;};
  const period=(await call('/api/maintenance/hour-periods/2022-10/assign','POST',{revision:0,accountId:login.payload.user.id,reason:'合成同源归档隔离账期负责人'})).period;await call('/api/maintenance/hour-periods/2022-10/confirm','POST',{revision:period.revision,state:'OPEN',reason:'明确开放独立测试账期'});
  const flight=(await call('/api/maintenance/flights','POST',{date:'2022-10-10',flightNo:'ARCHIVE-MANAGED-SOURCE',aircraftNo:'B-AMSC',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${flight.id}`,version=async()=>(await call(base)).flight.updatedAt;
  await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]});
  const item={clientId:'archive-managed-original',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'975',title:'同源归档边界工作',reportExplanation:'原工作范围不能伪装成新增补录',standardHours:2,entries:[{personId,role:'主做'}]},draft=(await call(base+'/reports/nonroutine/draft','PUT',{version:0,items:[item]})).draft;
  await call(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft.version,items:[item]});await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});const report=(await call(base+'/reports')).report;await call(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:personId});
  const save=async(extra)=>{const tree=(await call(base+'/review')).review;return request(base+'/review',{method:'PUT',cookie,body:{mode:'save',expectedUpdatedAt:tree.flight.updatedAt,reason:'验证原工作来源不能再次按归档新项计时',tasks:tree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))})),...extra}});};
  let tree=(await call(base+'/review')).review;await call(base+'/review','PUT',{mode:'confirm',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))});
  const c=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id),source=db.prepare('select * from maintenance_nonroutine_manual_sources where flight_id=?').get(flight.id),url=`/api/maintenance/nonroutine-reviews/${c.id}`;
  const facts=()=>Object.fromEntries(['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_nonroutine_review_cases','maintenance_nonroutine_assessments','maintenance_nonroutine_manual_sources','maintenance_report_source_journal','maintenance_nonroutine_hour_adjustments','maintenance_logs'].map(t=>[t,db.prepare(`select * from ${t} where ${t==='maintenance_flights'?'id':'flight_id'}=? order by ${['maintenance_nonroutine_manual_sources'].includes(t)?'fingerprint':t==='maintenance_nonroutine_assessments'?'subtask_id':'id'}`).all(flight.id)]));
  const rejectCopies=async()=>{
   const before=facts(),identities=[{clientId:source.client_id},{clientId:c.subtask_id},{clientId:'copy-subtask',subtaskId:c.subtask_id},{clientId:'copy-review',reviewCaseId:c.id},{clientId:'copy-fingerprint',sourceFingerprint:source.fingerprint},{clientId:'copy-owner',ownerId:c.subtask_id}];
   for(const identity of identities){const r=await save({newSubtasks:[{...identity,chapter:item.chapter,title:item.title,reportExplanation:item.reportExplanation,category:item.category,standardHours:2,assignments:[{personId,role:'主做'}]}]});assert.equal(r.res.statusCode,409);assert.match(r.payload.error,/来源|原项/);assert.deepEqual(facts(),before);}
  };
  await rejectCopies();
  const reviewers=[];for(let i=0;i<12;i++){const actor=createMaintenanceTestAccount(template,{id:'archive-source-reviewer-'+i,name:'同源边界评议员'+i});db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(actor.id,db.prepare("select id from rbac_roles where code='addon_nonroutine_reviewer'").get().id,new Date().toISOString());db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(actor.id);const r=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}});reviewers.push({...actor,cookie:String(r.res.headers['Set-Cookie']).split(';')[0]});}
  await call(url+'/accept','POST',{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:login.payload.user.id});for(const r of reviewers)await call(url+'/opinion','POST',{revision:0,hours:2,basis:'合成来源独立工时意见'},r.cookie);const sealed=(await call(url)).review;await call(url+'/finalize','POST',{revision:sealed.revision,decision:{...sealed.application,recognizedHours:2},participantsVerified:true,participants:[{personId,role:'主做'}],reason:'十二份意见独立认定原来源工时',roleVerificationReason:'',admissionDecision:'PENDING'});
  assert.equal(db.prepare('select state from maintenance_nonroutine_review_channels where case_id=?').get(c.id).state,'ADJUSTED_CLOSED');await rejectCopies();
  const posted=db.prepare('select * from maintenance_nonroutine_hour_adjustments where case_id=? order by id').all(c.id);assert.equal(posted.length,1);assert.equal(Number(posted[0].hours),2);assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(flight.id).n),0);await call(url+'/sync','POST',{});assert.deepEqual(db.prepare('select * from maintenance_nonroutine_hour_adjustments where case_id=? order by id').all(c.id),posted);
  const legacy=await supplementalWorkFixture('ARCHIVE-INDEPENDENT-LEGACY');assert.equal((await legacy.report({})).res.statusCode,200);assert.equal((await legacy.putReview({mode:'confirm',routineElectronicSigned:false,nonroutineElectronicSigned:false})).res.statusCode,200);const added=await legacy.putReview({reason:'独立漏报工作保留原合法归档路径',newSubtasks:[{clientId:'independent-legacy-addition',chapter:'976',title:'独立归档漏项',category:'工卡指令',standardHours:1,assignments:[{personId,role:'主做'}]}]});assert.equal(added.res.statusCode,200,JSON.stringify(added.payload));assert.equal(Number(db.prepare('select sum(hours) n from maintenance_hour_results where flight_id=?').get(legacy.id).n),1);
 }finally{flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});

test('cancelled pending cross-period authorization retains immutable final history and cannot be reused',async()=>{
 const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'],old=flags.map(k=>process.env[k]);
 try{
  for(const key of flags)process.env[key]='1';process.env.MUC_MAINTENANCE_V101='draft';
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId,template=db.prepare("select * from users where id='54002010'").get();
  const call=async(path,method='GET',body,actorCookie=cookie)=>{const r=await request(path,{method,cookie:actorCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify({path,status:r.res.statusCode,payload:r.payload}));return r.payload;};
  const make=async(id,role)=>{const actor=createMaintenanceTestAccount(template,{id,name:id});db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(actor.id,db.prepare('select id from rbac_roles where code=?').get(role).id,new Date().toISOString());db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(actor.id);const logged=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}});return {...actor,cookie:String(logged.res.headers['Set-Cookie']).split(';')[0]};};
  const finalizer=await make('cancel-history-finalizer','addon_nonroutine_review_finalizer'),reviewers=[];for(let i=0;i<12;i++)reviewers.push(await make('cancel-history-reviewer-'+i,'addon_nonroutine_reviewer'));
  const periods={};for(const [month,state] of [['2023-11','CLOSED'],['2023-12','OPEN']]){const assigned=(await call(`/api/maintenance/hour-periods/${month}/assign`,'POST',{revision:0,accountId:login.payload.user.id,reason:'独立取消历史验证负责人'})).period;periods[month]=(await call(`/api/maintenance/hour-periods/${month}/confirm`,'POST',{revision:assigned.revision,state,reason:'明确测试账期状态'})).period;}
  for(const authorized of [false,true]){
   const flight=(await call('/api/maintenance/flights','POST',{date:'2023-11-10',flightNo:'CANCEL-HISTORY-'+(authorized?'AUTHORIZED':'PENDING'),aircraftNo:'B-CHIS',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${flight.id}`;
   await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]});const item={clientId:'cancel-history-'+authorized,temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'29',title:'取消后历史认定-'+authorized,reportExplanation:'原工作和封账授权历史必须保留',standardHours:3,entries:[{role:'主做',personId}]};
   const draft=(await call(base+'/reports/nonroutine/draft','PUT',{version:0,items:[item]})).draft;await call(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft.version,items:[item]});const c=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id),url=`/api/maintenance/nonroutine-reviews/${c.id}`;
   await call(url+'/accept','POST',{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:finalizer.id});for(const reviewer of reviewers)await call(url+'/opinion','POST',{revision:0,hours:2,basis:'HISTORY-PRIVATE-'+reviewer.id},reviewer.cookie);
   const sealed=(await call(url,'GET',undefined,finalizer.cookie)).review,body={revision:sealed.revision,decision:{...sealed.application,recognizedHours:2},participantsVerified:true,participants:[{personId,role:'主做'}],reason:'保留的历史裁定依据',roleVerificationReason:'',admissionDecision:'PENDING'};
   const final=(await call(url+'/finalize','POST',body,finalizer.cookie)).finalization;assert.equal(final.channel.state,'NEEDS_ATTENTION');let task=db.prepare('select * from maintenance_nonroutine_cross_period_tasks where case_id=?').get(c.id);assert.ok(task);
   const authorization={revision:Number(task.revision),sourceRevision:periods['2023-11'].revision,targetRevision:periods['2023-12'].revision,targetMonth:'2023-12',reason:'单独授权但尚未同步入账'};if(authorized){await call(`/api/maintenance/cross-period-tasks/${task.id}/authorize`,'POST',authorization);task=db.prepare('select * from maintenance_nonroutine_cross_period_tasks where id=?').get(task.id);}
   const facts=()=>({task:db.prepare('select * from maintenance_nonroutine_cross_period_tasks where id=?').get(task.id),history:db.prepare('select * from maintenance_nonroutine_cross_period_history where task_id=? order by id').all(task.id),final:db.prepare('select * from maintenance_nonroutine_review_finals where case_id=?').get(c.id),opinions:db.prepare('select * from maintenance_nonroutine_review_opinions where case_id=? order by person_id').all(c.id),attempts:db.prepare('select * from maintenance_nonroutine_review_sync_attempts where channel_id=? order by id').all(task.channel_id),source:db.prepare('select * from maintenance_subtasks where id=?').get(c.subtask_id),entries:db.prepare('select * from maintenance_report_entries where batch_id=? order by id').all(c.report_batch_id)}),frozen=facts();
   const revision=(await call(url)).review.revision;await call(url+'/cancel','POST',{revision,clientId:'close-cancel-history-'+authorized,reason:'取消未入账评议，保留全部认定及跨期历史'});
   const view=(await call(url,'GET',undefined,finalizer.cookie)).review;assert.equal(view.capabilities.finalizationView,true);assert.equal(view.capabilities.readAllOpinions,true);assert.equal(view.opinions.length,12);assert.equal(view.capabilities.sync,false);assert.equal(view.capabilities.finalize,false);const retained=(await call(url+'/finalization','GET',undefined,finalizer.cookie)).finalization;assert.equal(retained.id,final.id);assert.equal(retained.channel.state,'CANCELLED_CLOSED');assert.equal(retained.reason,'保留的历史裁定依据');assert.equal(retained.canReadPrivate,true);
   const projected=await call(`/api/maintenance/cross-period-tasks/${task.id}`);assert.equal(projected.task.state,'CANCELLED');assert.equal(projected.task.recordedState,authorized?'AUTHORIZED':'PENDING_AUTHORIZATION');assert.equal(projected.authorization.code,'REVIEW_CANCELLED');assert.equal(projected.capabilities.authorize,false);
   for(const [path,input,actorCookie] of [[url+'/sync',{},finalizer.cookie],[`/api/maintenance/cross-period-tasks/${task.id}/authorize`,{...authorization,revision:Number(task.revision)},cookie]])assert.equal((await request(path,{method:'POST',cookie:actorCookie,body:input})).res.statusCode,409);
   assert.equal((await call(url+'/finalize','POST',body,finalizer.cookie)).finalization.id,final.id);assert.deepEqual(facts(),frozen);assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(flight.id).n),0);assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_posting_receipts where case_id=?').get(c.id).n),0);
   const member=(await call(url,'GET',undefined,reviewers[0].cookie)).review;assert.equal(member.capabilities.readAllOpinions,false);assert.equal(member.capabilities.finalizationView,false);assert.equal(member.opinions.length,1);const bounded=(await call(url+'/finalization','GET',undefined,reviewers[0].cookie)).finalization;assert.equal(bounded.canReadPrivate,false);for(const key of ['statistics','opinionVersions','participants','policy','reason','attempts'])assert.equal(Object.hasOwn(bounded,key),false);
  }
 }finally{flags.forEach((key,i)=>{if(old[i]===undefined)delete process.env[key];else process.env[key]=old[i];});}
});

test('mixed report keeps cancelled pending legitimate zero and positive recognized hours distinct through confirmation and export',async()=>{
 const keys=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'],old=keys.map(k=>process.env[k]);
 try{
  for(const key of keys)process.env[key]='1';process.env.MUC_MAINTENANCE_V101='draft';
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
  const call=async(path,method='GET',body,actorCookie=cookie)=>{const r=await request(path,{method,cookie:actorCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify({path,status:r.res.statusCode,payload:r.payload}));return r.payload;};
  const month='2024-11',period=(await call(`/api/maintenance/hour-periods/${month}/assign`,'POST',{revision:0,accountId:login.payload.user.id,reason:'独立混合批次测试账期负责人'})).period;await call(`/api/maintenance/hour-periods/${month}/confirm`,'POST',{revision:period.revision,state:'OPEN',reason:'明确开放混合批次测试账期'});
  const beforeStats=(await call(`/api/maintenance/stats/personal?month=${month}`)).metrics;
  const flight=(await call('/api/maintenance/flights','POST',{date:month+'-10',flightNo:'CANCEL-MIXED-FOUR',aircraftNo:'B-NRCM',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${flight.id}`,version=async()=>(await call(base)).flight.updatedAt;
  await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]});
  const items=['取消','评议中','合法零','有效两小时'].map((label,index)=>({clientId:'mixed-cancel-'+index,temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'29',title:'混合批次-'+label,reportExplanation:'独立工作范围-'+label,standardHours:3,entries:[{role:'主做',personId}]}));
  const draft=(await call(base+'/reports/nonroutine/draft','PUT',{version:0,items})).draft;await call(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft.version,items});
  const cases=items.map(item=>db.prepare('select c.* from maintenance_nonroutine_review_cases c join maintenance_subtasks s on s.id=c.subtask_id where c.flight_id=? and s.title=?').get(flight.id,item.title));assert.ok(cases.every(Boolean));assert.equal(new Set(cases.map(c=>c.report_batch_id)).size,1);
  const template=db.prepare("select * from users where id='54002010'").get(),reviewers=[];
  for(let i=0;i<12;i++){const actor=createMaintenanceTestAccount(template,{id:'cancel-mixed-reviewer-'+i,name:'混合批次评议员'+i});db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(actor.id,db.prepare("select id from rbac_roles where code='addon_nonroutine_reviewer'").get().id,new Date().toISOString());db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(actor.id);const logged=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}});reviewers.push({...actor,cookie:String(logged.res.headers['Set-Cookie']).split(';')[0]});}
  for(const c of cases.slice(1))await call(`/api/maintenance/nonroutine-reviews/${c.id}/accept`,'POST',{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:login.payload.user.id});
  for(const [index,hours] of [[2,0],[3,2]]){
   const c=cases[index],url=`/api/maintenance/nonroutine-reviews/${c.id}`;for(const r of reviewers)await call(url+'/opinion','POST',{revision:0,hours,basis:'明确核实混合批次工时'},r.cookie);
   const review=(await call(url)).review;await call(url+'/finalize','POST',{revision:review.revision,decision:{...review.application,recognizedHours:hours},participantsVerified:true,participants:[{personId,role:'主做'}],reason:'依据十二份意见独立认定，申请值仅供参考',roleVerificationReason:'',admissionDecision:'PENDING'});
  }
  const source=()=>({entries:db.prepare('select * from maintenance_report_entries where batch_id=? order by id').all(cases[0].report_batch_id),assessments:db.prepare('select * from maintenance_nonroutine_assessments where flight_id=? order by subtask_id').all(flight.id),siblings:cases.slice(1).map(c=>db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(c.id))}),frozen=source();
  await call(`/api/maintenance/nonroutine-reviews/${cases[0].id}/cancel`,'POST',{revision:1,clientId:'mixed-cancel-first',reason:'仅取消本工作，保留同批次其他事项'});assert.deepEqual(source(),frozen);
  let tree=(await call(base+'/review')).review;const cancelled=tree.tasks.find(t=>t.ownerId===cases[0].subtask_id);assert.equal(cancelled.hourAssessment.cancelled,true);assert.equal(cancelled.assignments[0].ruleHours,null);assert.equal(cancelled.assignments[0].reportedHours,null);
  await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});const report=(await call(base+'/reports')).report;
  await call(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:personId});tree=(await call(base+'/review')).review;
  await call(base+'/review','PUT',{mode:'confirm',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(p=>({personId:p.personId,role:p.role}))}))});
  const query=`dateFrom=${month}-10&dateTo=${month}-10&status=${encodeURIComponent('已确认')}`,rows=(await call('/api/maintenance/report?view=nonroutine&'+query)).rows;assert.equal(rows.length,4);
  for(const direction of ['asc','desc']){const sorted=(await call('/api/maintenance/report?view=nonroutine&'+query+'&sort=actualHours:'+direction)).rows;assert.deepEqual(sorted.map(r=>r.actualHours),direction==='asc'?[0,2,null,null]:[2,0,null,null]);}
  const audits=await Promise.all(cases.map(c=>call(`/api/maintenance/subtasks/${c.subtask_id}/hour-audit`)));const [closed,pending,zero,positive]=audits.map(r=>r.detail);
  assert.equal(closed.hourAssessment.cancelled,true);assert.equal(closed.hourAssessment.pending,false);assert.equal(closed.standardHours,null);assert.equal(closed.actualHours,null);assert.equal(closed.hasResults,false);assert.ok(closed.people.every(p=>p.finalHours===null));
  assert.equal(pending.hourAssessment.reviewPending,true);assert.equal(pending.actualHours,null);assert.equal(pending.hasResults,false);
  assert.equal(zero.standardHours,0);assert.equal(zero.actualHours,0);assert.equal(zero.hasResults,true);assert.equal(positive.standardHours,2);assert.equal(positive.actualHours,2);assert.equal(positive.hasResults,true);
  assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(flight.id).n),2);const after=(await call(`/api/maintenance/stats/personal?month=${month}`)).metrics;assert.equal(after.monthHours-beforeStats.monthHours,2);assert.equal(after.monthSorties-beforeStats.monthSorties,1);
  const exported=await requestRaw('/api/maintenance/report/export.xlsx?'+query+'&sections=nonroutine',{cookie});assert.equal(exported.statusCode,200);assert.ok(exported.body.includes(Buffer.from('评议已取消')));assert.ok(exported.body.includes(Buffer.from('评议中')));assert.ok(exported.body.includes(Buffer.from('工时认定状态')));
  const sheets=new Map();for(let offset=0;exported.body.readUInt32LE(offset)===0x04034b50;){const size=exported.body.readUInt32LE(offset+18),nameLength=exported.body.readUInt16LE(offset+26),extraLength=exported.body.readUInt16LE(offset+28),name=exported.body.subarray(offset+30,offset+30+nameLength).toString(),start=offset+30+nameLength+extraLength;assert.equal(exported.body.readUInt16LE(offset+8),0);sheets.set(name,exported.body.subarray(start,start+size).toString());offset=start+size;}
  const sheet=sheets.get('xl/worksheets/sheet1.xml');assert.ok(sheet);const exportedRows=[...sheet.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)].map(m=>m[1]);
  const cell=(row,column)=>{const c=[...row.matchAll(/<c r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)].find(m=>m[1]===column);assert.ok(c);return c[2];};
  for(const [index,label] of [[0,'评议已取消'],[1,'评议中']]){const row=exportedRows.find(r=>r.includes(items[index].title));assert.ok(row);assert.doesNotMatch(cell(row,'J'),/<v>0<\/v>/);assert.match(cell(row,'N'),new RegExp(label));}
  for(const [index,hours] of [[2,0],[3,2]]){const row=exportedRows.find(r=>r.includes(items[index].title));assert.match(cell(row,'J'),new RegExp(`<v>${hours}</v>`));assert.match(cell(row,'K'),new RegExp(`<v>${hours}</v>`));}

    const reader=createMaintenanceTestAccount(template,{id:'mixed-current-report-reader',name:'混合报表当前范围读取者'}),readRole=db.prepare("select id from rbac_roles where code='dispatcher'").get();db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(reader.id,readRole.id,new Date().toISOString());db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(reader.id);
  const logged=await request('/api/login',{method:'POST',body:{username:reader.username,password:'muc2026'}}),readerCookie=String(logged.res.headers['Set-Cookie']).split(';')[0],beforeReads=source();
  assert.equal((await call('/api/maintenance/report?view=nonroutine&'+query,'GET',undefined,readerCookie)).rows.length,4);
  db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=? and module='maintenance'").run(reader.id);
  const scoped=await call('/api/maintenance/report?view=nonroutine&'+query+'&userId='+personId,'GET',undefined,readerCookie);assert.equal(scoped.rows.length,0);assert.equal((await call('/api/maintenance/report/options?'+query,'GET',undefined,readerCookie)).people.length,0);
  const scopedExport=await requestRaw('/api/maintenance/report/export.xlsx?'+query+'&sections=nonroutine',{cookie:readerCookie});assert.equal(scopedExport.statusCode,200);for(const item of items)assert.equal(scopedExport.body.includes(Buffer.from(item.title)),false);
  assert.ok([403,404].includes((await request(`/api/maintenance/subtasks/${cases[0].subtask_id}/hour-audit`,{cookie:readerCookie})).res.statusCode));
  db.prepare('delete from rbac_user_roles where user_id=? and role_id=?').run(reader.id,readRole.id);
  for(const path of ['/api/maintenance/report?'+query,'/api/maintenance/report/options?'+query,'/api/maintenance/report/export.xlsx?'+query+'&sections=nonroutine'])assert.equal((await request(path,{cookie:readerCookie})).res.statusCode,403);
  db.prepare("update users set status='disabled' where id=?").run(reader.id);assert.equal((await request('/api/maintenance/report?'+query,{cookie:readerCookie})).res.statusCode,401);assert.deepEqual(source(),beforeReads);
  db.prepare("update maintenance_nonroutine_review_channels set state='WAITING_REVIEW' where case_id=?").run(cases[0].id);try{const corrupt=await request(`/api/maintenance/subtasks/${cases[0].subtask_id}/hour-audit`,{cookie});assert.equal(corrupt.res.statusCode,409);}finally{db.prepare("update maintenance_nonroutine_review_channels set state='CANCELLED_CLOSED' where case_id=?").run(cases[0].id);}
 }finally{keys.forEach((key,i)=>{if(old[i]===undefined)delete process.env[key];else process.env[key]=old[i];});}
});

test('independent review cancellation original route preserves formal work and requires its separate role',async()=>{
 const keys=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED'],old=keys.map(key=>process.env[key]);
 try{
  for(const key of keys)process.env[key]='1';process.env.MUC_MAINTENANCE_V101='draft';
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
  const call=async(path,method='GET',body,actorCookie=cookie)=>{const r=await request(path,{method,cookie:actorCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify({path,status:r.res.statusCode,payload:r.payload}));return r.payload;};
  const made=(await call('/api/maintenance/flights','POST',{date:'2026-11-15',flightNo:'INDEPENDENT-CANCEL',aircraftNo:'B-NRIC',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${made.id}`;
  await call(base+'/dispatch','POST',{expectedUpdatedAt:made.updatedAt,assignments:[{role:'放行',personId}]});
  const item={clientId:'cancel-manual-source',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'29',title:'独立取消评议保留工作验证',reportExplanation:'原工作与提报必须保持',standardHours:3,entries:[{role:'主做',personId}]};
  const draft=(await call(base+'/reports/nonroutine/draft','PUT',{version:0,items:[item]})).draft;await call(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft.version,items:[item]});
  const reviewCase=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(made.id),url=`/api/maintenance/nonroutine-reviews/${reviewCase.id}`,payload={revision:Number(reviewCase.revision),reason:'独立负责人取消未入账评议',clientId:'route-independent-cancel'};
  const actor=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'independent-cancel-owner',name:'独立取消负责人'}),actorLogin=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}}),actorCookie=String(actorLogin.res.headers['Set-Cookie']).split(';')[0];
  const snapshot=()=>Object.fromEntries(['maintenance_flights','maintenance_assignments','maintenance_subtasks','maintenance_report_batches','maintenance_hour_results','maintenance_sortie_results','maintenance_report_source_journal'].map(table=>[table,db.prepare(`select * from ${table} where ${table==='maintenance_flights'?'id':'flight_id'}=? order by id`).all(made.id)])),before=snapshot();
  assert.equal((await request(url+'/cancel',{method:'POST',cookie:actorCookie,body:payload})).res.statusCode,404);assert.deepEqual(snapshot(),before);
  const role=db.prepare("select id from rbac_roles where code='addon_nonroutine_review_cancel'").get();assert.ok(role);
  db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(actor.id,role.id,new Date().toISOString());
  db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(actor.id);
  const result=await call(url+'/cancel','POST',payload,actorCookie);assert.equal(result.cancellation.replayed,false);assert.deepEqual(snapshot(),before);
  await call('/api/maintenance/stats/personal?month=2026-11');
  const remaining=(await call(base+'/reports')).report;assert.equal(remaining.nonroutine.items[0].hourAssessment.cancelled,true);assert.equal(remaining.nonroutine.items[0].hourAssessment.pending,false);assert.equal(remaining.nonroutine.items[0].hourAssessment.effectiveHours,null);
  assert.equal((await call(url)).review.state,'CANCELLED');assert.equal((await call(url+'/cancel','POST',payload,actorCookie)).cancellation.replayed,true);assert.deepEqual(snapshot(),before);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_review_events where case_id=? and event_type='CANCELLED_BY_AUTHORIZED_OWNER'").get(reviewCase.id).n),1);
  db.prepare('delete from rbac_user_roles where user_id=? and role_id=?').run(actor.id,role.id);assert.equal((await request(url+'/cancel',{method:'POST',cookie:actorCookie,body:payload})).res.statusCode,404);assert.deepEqual(snapshot(),before);
 }finally{keys.forEach((key,index)=>{if(old[index]===undefined)delete process.env[key];else process.env[key]=old[index];});}
});

test('locked routine source and hours survive legitimate independent release dispatch changes',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
 const peer=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'locked-routine-dispatch-peer',name:'锁定后放行改派验收'});
 const call=async(path,method='GET',body)=>{const result=await request(path,{method,cookie,body});assert.ok(result.res.statusCode>=200&&result.res.statusCode<300,JSON.stringify({path,status:result.res.statusCode,payload:result.payload}));return result.payload;};
 const flight=(await call('/api/maintenance/flights','POST',{date:'2026-11-15',flightNo:'LOCKED-ROUTINE-DISPATCH',aircraftNo:'B-LRD',aircraftType:'A320',workKind:'航后'})).flight,base=`/api/maintenance/flights/${flight.id}`,version=async()=>(await call(base)).flight.updatedAt;
 // Only the deterministic rule is seeded. All dispatch/report changes use original APIs.
 db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flight.id);
 await call(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[{role:'接机',personId},{role:'放行',personId}]});
 await call(base+'/reports/routine','PUT',{expectedUpdatedAt:await version(),entries:[{role:'接机',personId}]});
 const rows=table=>db.prepare(`select * from ${table} where flight_id=? order by id`).all(flight.id);
 const assignments=()=>rows('maintenance_assignments'),original=assignments(),locked=original.find(row=>row.role==='接机'),release=original.find(row=>row.role==='放行');
 const source=()=>({batches:rows('maintenance_report_batches'),entries:db.prepare('select e.* from maintenance_report_entries e join maintenance_report_batches b on b.id=e.batch_id where b.flight_id=? order by e.id').all(flight.id),hours:rows('maintenance_hour_results'),sorties:rows('maintenance_sortie_results'),journal:rows('maintenance_report_source_journal'),drafts:rows('maintenance_report_drafts')});
 const frozen=source();assert.equal(frozen.batches.length,1);assert.equal(frozen.batches[0].report_type,'routine');assert.equal(frozen.batches[0].status,'已提报');assert.equal(frozen.entries.length,1);assert.equal(frozen.entries[0].person_id,personId);assert.equal(frozen.hours.reduce((sum,row)=>sum+Number(row.hours),0),5);assert.equal(frozen.sorties.length,0);assert.ok(frozen.journal.length>0);
 const unchanged=()=>{assert.deepEqual(source(),frozen);assert.deepEqual(assignments().find(row=>row.id===locked.id),locked);};
 const removal=`/api/maintenance/assignments/${release.id}`,impact=(await call(removal+'/removal-preview','POST',{expectedUpdatedAt:await version()})).impact;
 unchanged();assert.deepEqual(assignments(),original);assert.equal(impact.assignment.id,release.id);
 await call(removal,'DELETE',{expectedUpdatedAt:impact.expectedUpdatedAt,confirmation:impact.confirmation,reason:'放行尚未提报，独立移除后重新派工'});
 unchanged();assert.deepEqual(assignments(),[locked]);
 await call(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[{role:'放行',personId:peer.personId}]});
 unchanged();const newRelease=assignments().find(row=>row.role==='放行');assert.equal(newRelease.person_id,peer.personId);assert.notEqual(newRelease.id,release.id);assert.equal(assignments().length,2);
 // An omitted locked association is retained; a genuinely new locked association is rejected.
 await call(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[{role:'放行',personId:peer.personId}]});unchanged();assert.equal(assignments().length,2);
 for(const [path,method,extra] of [[base+'/dispatch','POST',{assignments:[{role:'接机',personId:peer.personId}]}],[`/api/maintenance/assignments/${locked.id}/removal-preview`,'POST',{}],[`/api/maintenance/assignments/${locked.id}`,'DELETE',{reason:'不得删除锁定例行',confirmation:impact.confirmation}]]){
  const before={flight:db.prepare('select * from maintenance_flights where id=?').get(flight.id),assignments:assignments(),logs:rows('maintenance_logs')};
  const denied=await request(path,{method,cookie,body:{expectedUpdatedAt:await version(),...extra}});assert.equal(denied.res.statusCode,409,JSON.stringify(denied.payload));unchanged();assert.deepEqual({flight:db.prepare('select * from maintenance_flights where id=?').get(flight.id),assignments:assignments(),logs:rows('maintenance_logs')},before);
 }
 const report=(await call(base+'/reports')).report;assert.equal(report.routine.entries[0].personId,personId);assert.equal(report.release.personId,peer.personId);unchanged();
});

test('routine draft participant and release choices never rewrite dispatch or grant reporting eligibility',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
 const peer=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'draft-only-participant',name:'仅草稿参与人'});
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const flight=(await call('/api/maintenance/flights','POST',{date:'2026-11-14',flightNo:'DRAFT-DISPATCH-BOUNDARY',aircraftNo:'B-DRAFTONLY',aircraftType:'A320',workKind:'航后'})).flight,base=`/api/maintenance/flights/${flight.id}`;
 await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId},{role:'接机',personId}]});
 const rows=()=>db.prepare('select * from maintenance_assignments where flight_id=? order by id').all(flight.id),before=rows();
 const body={version:0,entries:[{role:'接机',personId:peer.personId}],releasePersonId:peer.personId,feedback:'仅草稿选择'};
 const saved=await call(base+'/reports/routine/draft','PUT',body);assert.deepEqual(rows(),before,'saving a report draft must not replace dispatch participants or its release owner');assert.equal(saved.draft.releasePersonId,peer.personId);assert.equal(saved.draft.entries[0].personId,peer.personId);
 assert.equal(Number(db.prepare('select count(*) n from maintenance_report_batches where flight_id=?').get(flight.id).n),0);assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(flight.id).n),0);
 const read=await call(base+'/reports');assert.equal(read.report.routine.entries[0].personId,peer.personId);assert.equal(read.report.release.personId,personId);
 const peerLogin=await request('/api/login',{method:'POST',body:{username:peer.username,password:'muc2026'}}),peerCookie=String(peerLogin.res.headers['Set-Cookie']).split(';')[0];
 const denied=await request(base+'/reports/routine/draft',{method:'PUT',cookie:peerCookie,body:{...body,version:saved.draft.version}});assert.ok([400,403,404].includes(denied.res.statusCode));assert.deepEqual(rows(),before);
 const again=await call(base+'/reports/routine/draft','PUT',{...body,version:saved.draft.version,feedback:'原派工人仍可编辑'});assert.equal(again.draft.version,saved.draft.version+1);assert.deepEqual(rows(),before);
});

test('nonroutine saved participants retain formal subtask identity without rewriting dispatch',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
 const peer=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'probe-nonroutine-peer',name:'非例行草稿边界'});
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const made=(await call('/api/maintenance/flights','POST',{date:'2026-11-14',flightNo:'NR-DRAFT-PROBE',aircraftNo:'B-NRPROBE',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${made.id}`;
 await call(base+'/dispatch','POST',{expectedUpdatedAt:made.updatedAt,assignments:[{role:'放行',personId}]});
 const item={temporary:true,title:'既有未提报单项',category:'其他',standardHours:2,entries:[{role:'主做',personId}]};
 await call(base+'/reports/nonroutine','PUT',{mode:'save',items:[item],revision:(await call(base+'/reports')).report.nonroutine.revision});
 const formal=db.prepare('select * from maintenance_subtasks where flight_id=?').get(made.id);assert.ok(formal);
 await call(`/api/maintenance/subtasks/${formal.id}/dispatch`,'POST',{expectedUpdatedAt:(await call(base)).flight.updatedAt,assignments:[{role:'主做',personId}]});
 const rows=()=>db.prepare('select * from maintenance_assignments where flight_id=? order by id').all(made.id),before=rows();
 await call(base+'/reports/nonroutine','PUT',{mode:'save',items:[{...item,temporary:false,id:formal.id,entries:[{role:'主做',personId:peer.personId}]}],revision:(await call(base+'/reports')).report.nonroutine.revision});
 assert.deepEqual(rows(),before,'NONROUTINE_DRAFT_MUST_NOT_REPLACE_FORMAL_DISPATCH');
 const read=(await call(base+'/reports')).report;assert.equal(read.nonroutine.items.length,1);assert.equal(read.nonroutine.items[0].id,formal.id);assert.equal(read.nonroutine.items[0].entries[0].personId,peer.personId);assert.equal(read.nonroutine.draft.items.length,0);
 assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(made.id).n),0);
 const stale=await request(base+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'save',items:[{...item,temporary:false,id:formal.id}],revision:read.nonroutine.revision,draftVersion:0}});assert.equal(stale.res.statusCode,409);assert.deepEqual(rows(),before);
});

test('nonroutine mutations recheck current account personnel and permissions after acquiring the transaction',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),rootCookie=String(login.res.headers['Set-Cookie']).split(';')[0],template=db.prepare("select * from users where id='54002010'").get();
 for(const action of ['save','draft','submit','delete'])for(const change of ['account','personnel','permissions']){
  const actor=createMaintenanceTestAccount(template,{id:`nr-auth-${action}-${change}`,name:'非例行当前资格验收'}),made=await request('/api/maintenance/flights',{method:'POST',cookie:rootCookie,body:{date:'2026-11-14',flightNo:`NR-AUTH-${action}-${change}`,aircraftNo:'B-NRAUTH',aircraftType:'A320',workKind:'停场'}});assert.equal(made.res.statusCode,201);const flight=made.payload.flight,base=`/api/maintenance/flights/${flight.id}`;
  assert.equal((await request(base+'/dispatch',{method:'POST',cookie:rootCookie,body:{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId:actor.personId}]}})).res.statusCode,200);
  const signed=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}}),cookie=String(signed.res.headers['Set-Cookie']).split(';')[0],item={clientId:'current-actor-work',temporary:true,title:'资格变化不得保存',category:'其他',standardHours:2,entries:[{role:'主做',personId:actor.personId}]};
  const first=await request(base+'/reports/nonroutine/draft',{method:'PUT',cookie,body:{version:0,items:[item]}});assert.equal(first.res.statusCode,200,JSON.stringify(first.payload));
  const tables=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_drafts','maintenance_report_draft_versions','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_logs'];
  const facts=()=>JSON.stringify(tables.map(table=>db.prepare(`select * from ${table} where ${table==='maintenance_flights'?'id':'flight_id'}=? order by ${table==='maintenance_report_draft_versions'?'report_type':'id'}`).all(flight.id))),before=facts(),roles=db.prepare('select * from rbac_user_roles where user_id=?').all(actor.id),original=db.exec.bind(db);let injected=false;
  db.exec=sql=>{if(!injected&&/^begin immediate$/i.test(sql.trim())){injected=true;if(change==='account')db.prepare("update users set status='inactive' where id=?").run(actor.id);if(change==='personnel')db.prepare("update personnel set employment_status='停职' where id=?").run(actor.personId);if(change==='permissions')db.prepare('delete from rbac_user_roles where user_id=?').run(actor.id);}return original(sql);};
  try{
   const draftVersion=first.payload.draft.version,url=base+'/reports/nonroutine'+(['draft','delete'].includes(action)?'/draft':''),body=['draft','delete'].includes(action)?{version:draftVersion,items:[item]}:{mode:action,items:[item],draftVersion};
   const result=await request(url,{method:action==='delete'?'DELETE':'PUT',cookie,body});assert.equal(injected,true);assert.equal(result.res.statusCode,403,`${action}/${change}: ${JSON.stringify(result.payload)}`);assert.equal(facts(),before,`${action}/${change} changed business facts`);
  }finally{db.exec=original;db.prepare("update users set status='active' where id=?").run(actor.id);db.prepare("update personnel set employment_status='在职' where id=?").run(actor.personId);if(change==='permissions')for(const row of roles)db.prepare(`insert into rbac_user_roles(${Object.keys(row).join(',')}) values(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));}
 }
});

test('routine release and report confirmation reject authority lost before transaction entry',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),rootCookie=String(login.res.headers['Set-Cookie']).split(';')[0],template=db.prepare("select * from users where id='54002010'").get();
 for(const action of ['routine','release','confirmation-save','confirmation-finalize'])for(const change of ['account','personnel','permissions']){
  const actor=createMaintenanceTestAccount(template,{id:`core-auth-${action}-${change}`,name:'原报工当前资格验收'}),created=await request('/api/maintenance/flights',{method:'POST',cookie:rootCookie,body:{date:'2026-11-14',flightNo:`CORE-AUTH-${action}-${change}`,aircraftNo:'B-COREAUTH',aircraftType:'A320',workKind:'航后'}});assert.equal(created.res.statusCode,201);const flight=created.payload.flight,base=`/api/maintenance/flights/${flight.id}`;
  db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flight.id);
  assert.equal((await request(base+'/dispatch',{method:'POST',cookie:rootCookie,body:{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId:actor.personId},{role:'接机',personId:actor.personId}]}})).res.statusCode,200);
  const signed=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}}),cookie=String(signed.res.headers['Set-Cookie']).split(';')[0],version=async()=>(await request(base,{cookie})).payload.flight.updatedAt,entries=[{role:'接机',personId:actor.personId}];
  if(action.startsWith('confirmation')){for(const type of ['routine','release']){const result=await request(base+'/reports/'+type,{method:'PUT',cookie,body:{expectedUpdatedAt:await version(),entries,releasePersonId:actor.personId}});assert.equal(result.res.statusCode,200,JSON.stringify(result.payload));}}
  const body={expectedUpdatedAt:await version(),entries,routineEntries:entries,nonroutineItems:[],releasePersonId:actor.personId,...(action==='confirmation-save'?{mode:'save'}:{})};
  const tables=['maintenance_flights','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_logs'],facts=()=>JSON.stringify(tables.map(table=>db.prepare(`select * from ${table} where ${table==='maintenance_flights'?'id':'flight_id'}=? order by id`).all(flight.id))),before=facts(),roles=db.prepare('select * from rbac_user_roles where user_id=?').all(actor.id),original=db.exec.bind(db);let injected=false;
  db.exec=sql=>{if(!injected&&/^begin immediate$/i.test(sql.trim())){injected=true;if(change==='account')db.prepare("update users set status='inactive' where id=?").run(actor.id);if(change==='personnel')db.prepare("update personnel set employment_status='停职' where id=?").run(actor.personId);if(change==='permissions')db.prepare('delete from rbac_user_roles where user_id=?').run(actor.id);}return original(sql);};
  try{const result=await request(base+(action.startsWith('confirmation')?'/report-confirmation':'/reports/'+action),{method:action.startsWith('confirmation')?'POST':'PUT',cookie,body});assert.equal(injected,true);assert.equal(result.res.statusCode,403,`${action}/${change}: ${result.res.statusCode}`);assert.equal(facts(),before);}finally{db.exec=original;db.prepare("update users set status='active' where id=?").run(actor.id);db.prepare("update personnel set employment_status='在职' where id=?").run(actor.personId);if(change==='permissions')for(const row of roles)db.prepare(`insert into rbac_user_roles(${Object.keys(row).join(',')}) values(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));}
 }
});

test('participant source adapter reads real persisted report entries without deriving identities from dispatch',async()=>{
 const {reportParticipantSource}=await import('../maintenance-report-participant-source.mjs');
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
 const peer=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'report-source-person',name:'报工来源身份验收'});
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const flight=(await call('/api/maintenance/flights','POST',{date:'2026-11-14',flightNo:'REPORT-SOURCE-QA',aircraftNo:'B-SOURCEQA',aircraftType:'A320',workKind:'航后'})).flight,base=`/api/maintenance/flights/${flight.id}`;
 db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flight.id);
 await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId},{role:'接机',personId}]});
 await call(base+'/reports/routine','PUT',{expectedUpdatedAt:(await call(base)).flight.updatedAt,entries:[{role:'接机',personId:peer.personId}]});
 const batch=db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='routine'").get(flight.id),entries=db.prepare('select * from maintenance_report_entries where batch_id=?').all(batch.id),before=JSON.stringify({batch,entries}),source=reportParticipantSource({batch,entries});
 assert.equal(source.participants.length,1);assert.equal(source.participants[0].entryId,entries[0].id);assert.equal(source.participants[0].personId,peer.personId);assert.equal(source.participants[0].batchVersion,Number(batch.version));assert.equal(JSON.stringify({batch,entries}),before);
 const bad=entries.map(row=>({...row,flight_id:'another-flight'}));assert.throws(()=>reportParticipantSource({batch,entries:bad}),{status:409});assert.deepEqual(db.prepare('select * from maintenance_report_entries where batch_id=?').all(batch.id),entries);
});

test('routine result generation uses persisted report participants when dispatch rows differ',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId,peer=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'routine-source-divergence',name:'实际报工来源验收'});
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const flight=(await call('/api/maintenance/flights','POST',{date:'2026-11-14',flightNo:'ROUTINE-SOURCE-DIVERGENCE',aircraftNo:'B-RSD',aircraftType:'A320',workKind:'航后'})).flight,base=`/api/maintenance/flights/${flight.id}`;
 db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flight.id);await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId},{role:'接机',personId}]});
 const version=(await call(base)).flight.updatedAt,prepare=db.prepare.bind(db);let injected=false;
 db.prepare=sql=>{const statement=prepare(sql);if(sql==="select * from maintenance_assignments where owner_type=? and owner_id=? and status=? and role<>'放行'"){return new Proxy(statement,{get(target,key){if(key==='all')return(...args)=>{if(!injected&&args[0]==='flight'&&args[1]===flight.id){injected=true;prepare("update maintenance_assignments set person_id=?,user_name=? where owner_type='flight' and owner_id=? and role='接机'").run(personId,'合成独立派工人员',flight.id);}return target.all(...args);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});}return statement;};
 try{await call(base+'/reports/routine','PUT',{expectedUpdatedAt:version,entries:[{role:'接机',personId:peer.personId}]});assert.equal(injected,true);}finally{db.prepare=prepare;}
 const batch=db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='routine'").get(flight.id),entries=db.prepare('select * from maintenance_report_entries where batch_id=?').all(batch.id),results=db.prepare("select * from maintenance_hour_results where flight_id=? and owner_type='flight'").all(flight.id);
 assert.equal(entries[0].person_id,peer.personId);assert.equal(results.length,1);assert.equal(results[0].person_id,peer.personId,'actual result must follow the report snapshot, not changed dispatch');assert.equal(Number(results[0].hours),5);assert.equal(db.prepare("select person_id from maintenance_assignments where owner_id=? and role='接机'").get(flight.id).person_id,personId);
});

test('release sortie generation follows the submitted release batch rather than a changed dispatch row',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId,peer=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'release-source-divergence',name:'架次派工分歧验收'});
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const flight=(await call('/api/maintenance/flights','POST',{date:'2026-11-14',flightNo:'RELEASE-SOURCE-DIVERGENCE',aircraftNo:'B-RLD',aircraftType:'A320',workKind:'航后'})).flight,base=`/api/maintenance/flights/${flight.id}`;
 await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]});const version=(await call(base)).flight.updatedAt,prepare=db.prepare.bind(db);let injected=false;
 db.prepare=sql=>{const statement=prepare(sql);if(sql==="select * from maintenance_assignments where owner_type=? and owner_id=? and status=? and role='放行'"){return new Proxy(statement,{get(target,key){if(key==='all')return(...args)=>{if(!injected&&args[0]==='flight'&&args[1]===flight.id){injected=true;prepare("update maintenance_assignments set person_id=?,user_name=? where owner_type='flight' and owner_id=? and role='放行'").run(peer.personId,peer.name,flight.id);}return target.all(...args);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});}return statement;};
 try{await call(base+'/reports/release','PUT',{expectedUpdatedAt:version});assert.equal(injected,true);}finally{db.prepare=prepare;}
 const batch=db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='release'").get(flight.id),entries=db.prepare('select * from maintenance_report_entries where batch_id=?').all(batch.id),results=db.prepare('select * from maintenance_sortie_results where flight_id=?').all(flight.id);
 assert.equal(batch.submitted_by,'54002010');assert.equal(entries.length,1);assert.equal(entries[0].person_id,personId);assert.equal(results.length,1);assert.equal(results[0].person_id,personId,'sortie owner must follow the submitted release snapshot');assert.equal(Number(results[0].sorties),1);assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(flight.id).n),0);
 assert.equal(db.prepare("select person_id from maintenance_assignments where owner_id=? and role='放行'").get(flight.id).person_id,peer.personId);
});

test('overall finalization and unchanged review preserve report-entry result identities',async()=>{
 const {reportParticipantSource}=await import('../maintenance-report-participant-source.mjs');
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const flight=(await call('/api/maintenance/flights','POST',{date:'2026-11-14',flightNo:'SOURCE-ID-REVIEW-QA',aircraftNo:'B-SIREVIEW',aircraftType:'A320',workKind:'航后'})).flight,base=`/api/maintenance/flights/${flight.id}`,entries=[{role:'接机',personId}],version=async()=>(await call(base)).flight.updatedAt;
 db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flight.id);await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId},...entries]});
 await call(base+'/reports/routine','PUT',{expectedUpdatedAt:await version(),entries});await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});
 // Existing independent result identities, with unchanged submitted facts and dispatch.
 for(const type of ['routine','release']){const batch=db.prepare('select * from maintenance_report_batches where flight_id=? and report_type=?').get(flight.id,type),source=reportParticipantSource({batch,entries:db.prepare('select * from maintenance_report_entries where batch_id=?').all(batch.id)}),table=type==='routine'?'maintenance_hour_results':'maintenance_sortie_results';db.prepare(`update ${table} set assignment_id=? where flight_id=?`).run(source.participants[0].resultIdentity,flight.id);}
 const rows=()=>({hours:db.prepare('select * from maintenance_hour_results where flight_id=? order by id').all(flight.id),sorties:db.prepare('select * from maintenance_sortie_results where flight_id=? order by id').all(flight.id)}),identities=value=>[...value.hours,...value.sorties].map(row=>({id:row.id,assignmentId:row.assignment_id,personId:row.person_id,createdAt:row.created_at})).sort((a,b)=>a.id.localeCompare(b.id)),before=rows();
 await call(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:entries,nonroutineItems:[],releasePersonId:personId});assert.deepEqual(identities(rows()),identities(before));assert.ok([...rows().hours,...rows().sorties].every(row=>row.status==='待复核'));
 const review=(await call(base+'/review')).review;assert.equal(review.tasks[0].assignments.find(row=>row.role==='放行').reportedSorties,1);assert.equal(review.tasks[0].assignments.find(row=>row.role==='接机').reportedHours,5);const payload={mode:'confirm',expectedUpdatedAt:review.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:review.tasks.map(task=>({ownerType:task.ownerType,ownerId:task.ownerId,assignments:task.assignments.map(row=>({personId:row.personId,role:row.role}))}))};await call(base+'/review','PUT',payload);
 const confirmed=rows();assert.deepEqual(identities(confirmed),identities(before),'unchanged review must preserve existing result source identities');assert.equal(confirmed.hours.length,1);assert.equal(Number(confirmed.hours[0].hours),5);assert.equal(confirmed.sorties.length,1);assert.equal(Number(confirmed.sorties[0].sorties),1);assert.ok([...confirmed.hours,...confirmed.sorties].every(row=>row.status==='已确认'));
 const retry=await request(base+'/review',{method:'PUT',cookie,body:payload});assert.ok([400,409].includes(retry.res.statusCode));assert.deepEqual(rows(),confirmed);
 const duplicate={...confirmed.hours[0],id:'review-source-ambiguous',assignment_id:'another-result-source'};db.prepare(`insert into maintenance_hour_results(${Object.keys(duplicate).join(',')}) values(${Object.keys(duplicate).map(()=>'?').join(',')})`).run(...Object.values(duplicate));
 try{const ambiguous=rows(),rejected=await request(base+'/review',{cookie});assert.equal(rejected.res.statusCode,409);assert.deepEqual(rows(),ambiguous);}finally{db.prepare('delete from maintenance_hour_results where id=?').run(duplicate.id);}
});

test('report source journal foundation persists observed real batches without inventing or replacing history',async()=>{
 const {createReportSourceJournal}=await import('../maintenance-report-source-journal.mjs');
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const flight=(await call('/api/maintenance/flights','POST',{date:'2026-11-14',flightNo:'SOURCE-JOURNAL-QA',aircraftNo:'B-SJQA',aircraftType:'A320',workKind:'航后'})).flight,base=`/api/maintenance/flights/${flight.id}`;
 await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]});await call(base+'/reports/release','PUT',{expectedUpdatedAt:(await call(base)).flight.updatedAt});
 const batch=db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='release'").get(flight.id),transaction=f=>{db.exec('begin immediate');try{if(db.kind==='postgres')db.exec('select pg_advisory_xact_lock(54002010,31)');const result=f();db.exec('commit');return result;}catch(error){db.exec('rollback');throw error;}};
 const service=createReportSourceJournal({db,transaction,authorize:actor=>actor.id===login.payload.user.id?{fixtureOnly:true,accountId:actor.id}:null,clock:()=>new Date().toISOString(),randomId:prefix=>prefix+'-'+flight.id+'-'+Math.random().toString(16).slice(2)});
 const first=service.capture(batch.id,login.payload.user,{reason:'隔离内部来源留存夹具，非公开API授权'}),original=db.prepare('select * from maintenance_report_source_journal where id=?').get(first.id);assert.equal(first.observationMode,'AT_WRITE');assert.equal(first.replayed,true);assert.equal(service.capture(batch.id,login.payload.user,{reason:'原版本重试'}).replayed,true);
 // Explicit persisted revision fixture; no production or public batch-repair action.
 db.prepare('update maintenance_report_batches set version=version+1 where id=?').run(batch.id);db.prepare("update maintenance_report_entries set user_name='合成新来源姓名' where batch_id=?").run(batch.id);
 const second=service.capture(batch.id,login.payload.user,{reason:'仅观测当前持久修订，不声称知道旧创建过程'});assert.equal(second.version,first.version+1);assert.deepEqual(db.prepare('select * from maintenance_report_source_journal where id=?').get(first.id),original);assert.equal(Number(db.prepare('select count(*) n from maintenance_report_source_journal where batch_id=?').get(batch.id).n),2);
});

test('automatic report-source capture shares submit and revision rollback with the original transaction',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const flight=(await call('/api/maintenance/flights','POST',{date:'2026-11-14',flightNo:'SOURCE-JOURNAL-LIFECYCLE',aircraftNo:'B-SJLC',aircraftType:'A320',workKind:'航后'})).flight,base=`/api/maintenance/flights/${flight.id}`,entries=[{role:'接机',personId}],version=async()=>(await call(base)).flight.updatedAt;
 db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flight.id);await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId},...entries]});
 const tables=['maintenance_flights','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_logs','maintenance_report_source_journal'],facts=()=>JSON.stringify(tables.map(table=>db.prepare(`select * from ${table} where ${table==='maintenance_flights'?'id':'flight_id'}=? order by id`).all(flight.id)));
 const submitBody={expectedUpdatedAt:await version(),entries},before=facts(),cleanup=installFailureTrigger('source_submit_fail','maintenance_report_source_journal','insert','true','source archive unavailable');
 try{const failed=await request(base+'/reports/routine',{method:'PUT',cookie,body:submitBody});assert.equal(failed.res.statusCode,500);assert.equal(facts(),before);}finally{cleanup();}
 await call(base+'/reports/routine','PUT',submitBody);await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});
 const batch=db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='routine'").get(flight.id),original=db.prepare('select * from maintenance_report_source_journal where batch_id=? and batch_version=1').get(batch.id);assert.ok(original);assert.equal(original.observation_mode,'AT_WRITE');
 const revisionBody={mode:'save',expectedUpdatedAt:await version(),routineEntries:entries,nonroutineItems:[],releasePersonId:personId,feedback:'合法修订后的说明'},committed=facts(),cleanupRevision=installFailureTrigger('source_revision_fail','maintenance_report_source_journal','insert','true','source revision unavailable');
 try{const failed=await request(base+'/report-confirmation',{method:'POST',cookie,body:revisionBody});assert.equal(failed.res.statusCode,500);assert.equal(facts(),committed);}finally{cleanupRevision();}
 await call(base+'/report-confirmation','POST',revisionBody);assert.deepEqual(db.prepare('select * from maintenance_report_source_journal where id=?').get(original.id),original);
 const later=db.prepare('select * from maintenance_report_source_journal where batch_id=? and batch_version=2').get(batch.id);assert.ok(later);assert.equal(later.observation_mode,'AT_WRITE');assert.equal(JSON.parse(later.snapshot_json).feedback,revisionBody.feedback);assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(flight.id).n),1);
});

test('deleting an observed legacy flight retains source archive and rolls back deletion when archival fails',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const flight=(await call('/api/maintenance/flights','POST',{date:'2026-11-14',flightNo:'SOURCE-LEGACY-DELETE',aircraftNo:'B-SLD',aircraftType:'A320',workKind:'航后'})).flight,base=`/api/maintenance/flights/${flight.id}`;
 await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]});await call(base+'/reports/release','PUT',{expectedUpdatedAt:(await call(base)).flight.updatedAt});
 const batch=db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='release'").get(flight.id);
 // Explicit pre-journal legacy fixture only: no original creation observation is available.
 db.prepare('delete from maintenance_report_source_journal where batch_id=?').run(batch.id);
 const tables=['maintenance_flights','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_sortie_results','maintenance_logs','maintenance_report_source_journal'],facts=()=>JSON.stringify(tables.map(table=>db.prepare(`select * from ${table} where ${table==='maintenance_flights'?'id':'flight_id'}=? order by id`).all(flight.id))),before=facts(),cleanup=installFailureTrigger('source_delete_fail','maintenance_report_source_journal','insert','true','source delete archival failure');
 try{const failed=await request(base,{method:'DELETE',cookie,body:{reason:'隔离删除回滚验收'}});assert.equal(failed.res.statusCode,500);assert.equal(facts(),before);}finally{cleanup();}
 await call(base,'DELETE',{reason:'仅删除合成旧机会，保留首次来源观察'});assert.equal(db.prepare('select * from maintenance_flights where id=?').get(flight.id),undefined);assert.equal(db.prepare('select * from maintenance_report_batches where id=?').get(batch.id),undefined);
 const saved=db.prepare('select * from maintenance_report_source_journal where batch_id=?').get(batch.id);assert.ok(saved);assert.equal(saved.observation_mode,'FIRST_OBSERVATION');assert.equal(JSON.parse(saved.snapshot_json).participants[0].personId,personId);assert.equal(JSON.parse(saved.snapshot_json).version,Number(batch.version));
});

test('overall confirmation preserves submitted release names when current personnel display changes',async()=>{
 const root=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),rootCookie=String(root.res.headers['Set-Cookie']).split(';')[0],actor=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'release-name-snapshot',name:'原放行快照姓名'});
 const made=await request('/api/maintenance/flights',{method:'POST',cookie:rootCookie,body:{date:'2026-11-14',flightNo:'RELEASE-NAME-SNAPSHOT',aircraftNo:'B-RNS',aircraftType:'A320',workKind:'航后'}});assert.equal(made.res.statusCode,201);const flight=made.payload.flight,base=`/api/maintenance/flights/${flight.id}`;
 db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flight.id);assert.equal((await request(base+'/dispatch',{method:'POST',cookie:rootCookie,body:{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId:actor.personId},{role:'接机',personId:actor.personId}]}})).res.statusCode,200);
 const signed=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}}),cookie=String(signed.res.headers['Set-Cookie']).split(';')[0],version=async()=>(await request(base,{cookie})).payload.flight.updatedAt,entries=[{role:'接机',personId:actor.personId}];
 for(const type of ['routine','release']){const result=await request(base+'/reports/'+type,{method:'PUT',cookie,body:{expectedUpdatedAt:await version(),entries}});assert.equal(result.res.statusCode,200,JSON.stringify(result.payload));}
 const batch=db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='release'").get(flight.id),sourceEntry=db.prepare('select * from maintenance_report_entries where batch_id=?').get(batch.id),sortie=db.prepare('select * from maintenance_sortie_results where flight_id=?').get(flight.id),journal=db.prepare('select * from maintenance_report_source_journal where batch_id=? and batch_version=?').get(batch.id,batch.version);
 const releaseDispatch=db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=? and role='放行'").get(flight.id);
 db.prepare("update personnel set name='当前人员档案新姓名' where id=?").run(actor.personId);
 const result=await request(base+'/report-confirmation',{method:'POST',cookie,body:{expectedUpdatedAt:await version(),routineEntries:entries,nonroutineItems:[],releasePersonId:actor.personId}});assert.equal(result.res.statusCode,200,JSON.stringify(result.payload));
 assert.deepEqual(db.prepare('select * from maintenance_report_entries where id=?').get(sourceEntry.id),sourceEntry);assert.equal(db.prepare('select user_name from maintenance_sortie_results where id=?').get(sortie.id).user_name,sortie.user_name);assert.deepEqual(db.prepare('select * from maintenance_report_source_journal where id=?').get(journal.id),journal);assert.equal(Number(db.prepare('select sorties from maintenance_sortie_results where id=?').get(sortie.id).sorties),1);
 const afterDispatch=db.prepare('select * from maintenance_assignments where id=?').get(releaseDispatch.id),identity=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['status','modified_at'].includes(key)));assert.deepEqual(identity(afterDispatch),identity(releaseDispatch),'report confirmation may advance dispatch task status but must preserve its original name and provenance');assert.equal(afterDispatch.status,'待复核');
});

test('routine actual participants remain separate from dispatch through finalization and authorized review revision',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],rootId=login.payload.user.personId,root=db.prepare("select * from users where id='54002010'").get();
 const actual=createMaintenanceTestAccount(root,{id:'routine-independent-actual',name:'例行实际人员'}),corrected=createMaintenanceTestAccount(root,{id:'routine-independent-corrected',name:'例行复核修订人员'});
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const flight=(await call('/api/maintenance/flights','POST',{date:'2026-11-15',flightNo:'ROUTINE-INDEPENDENT-CHAIN',aircraftNo:'B-RIC',aircraftType:'A320',workKind:'航后'})).flight,base=`/api/maintenance/flights/${flight.id}`,version=async()=>(await call(base)).flight.updatedAt,entries=[{role:'接机',personId:actual.personId}];
 db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flight.id);
 await call(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[{role:'放行',personId:rootId},{role:'接机',personId:rootId}]});
 const dispatch=()=>db.prepare('select id,owner_type,owner_id,flight_id,person_id,user_name,team,role,assigned_by,assigned_at from maintenance_assignments where flight_id=? order by id').all(flight.id),before=dispatch();
 const wrongRelease=await request(base+'/reports/routine',{method:'PUT',cookie,body:{expectedUpdatedAt:await version(),entries,releasePersonId:actual.personId}});assert.equal(wrongRelease.res.statusCode,409);assert.deepEqual(dispatch(),before);assert.equal(Number(db.prepare('select count(*) n from maintenance_report_batches where flight_id=?').get(flight.id).n),0);
 await call(base+'/reports/routine','PUT',{expectedUpdatedAt:await version(),entries});assert.deepEqual(dispatch(),before,'formal routine reporting must preserve dispatch identities');
 const actualLogin=await request('/api/login',{method:'POST',body:{username:actual.username,password:'muc2026'}}),actualCookie=String(actualLogin.res.headers['Set-Cookie']).split(';')[0],notAssigned=await request(base+'/reports/routine/draft',{method:'PUT',cookie:actualCookie,body:{version:0,entries}});assert.ok([400,403,404].includes(notAssigned.res.statusCode),`actual participant must not gain eligibility: ${notAssigned.res.statusCode} ${JSON.stringify(notAssigned.payload)}`);assert.deepEqual(dispatch(),before);

 let hours=db.prepare('select * from maintenance_hour_results where flight_id=?').all(flight.id);assert.equal(hours.length,1);assert.equal(hours[0].person_id,actual.personId);assert.equal(Number(hours[0].hours),5);
 await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});await call(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:entries,nonroutineItems:[],releasePersonId:rootId});assert.deepEqual(dispatch(),before);
 let review=(await call(base+'/review')).review;assert.equal(review.tasks[0].assignments.find(row=>row.role==='接机').personId,actual.personId);assert.equal(review.tasks[0].assignments.find(row=>row.role==='接机').reportedHours,5);
 const original=db.prepare("select j.* from maintenance_report_source_journal j join maintenance_report_batches b on b.id=j.batch_id where b.flight_id=? and b.report_type='routine' and j.batch_version=1").get(flight.id);
 const payload=(mode,tree,personId)=>({mode,expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(task=>({ownerType:task.ownerType,ownerId:task.ownerId,assignments:task.assignments.map(row=>({personId:row.role==='接机'?personId:row.personId,role:row.role}))}))});
 const facts=()=>JSON.stringify({flight:db.prepare('select * from maintenance_flights where id=?').get(flight.id),dispatch:db.prepare('select * from maintenance_assignments where flight_id=? order by id').all(flight.id),hours:db.prepare('select * from maintenance_hour_results where flight_id=? order by id').all(flight.id),sorties:db.prepare('select * from maintenance_sortie_results where flight_id=? order by id').all(flight.id),batches:db.prepare('select * from maintenance_report_batches where flight_id=? order by id').all(flight.id),entries:db.prepare('select * from maintenance_report_entries where flight_id=? order by id').all(flight.id),journal:db.prepare('select * from maintenance_report_source_journal where flight_id=? order by id').all(flight.id),logs:db.prepare('select * from maintenance_logs where flight_id=? order by id').all(flight.id)}),beforeFailure=facts(),cleanup=installFailureTrigger('routine_review_source_fail','maintenance_report_source_journal','insert','true','review source unavailable');
 try{const failed=await request(base+'/review',{method:'PUT',cookie,body:payload('save',review,corrected.personId)});assert.equal(failed.res.statusCode,500);assert.equal(facts(),beforeFailure,'review revision and source capture must roll back together');}finally{cleanup();}
 await call(base+'/review','PUT',payload('save',review,corrected.personId));review=(await call(base+'/review')).review;assert.equal(review.tasks[0].assignments.find(row=>row.role==='接机').personId,corrected.personId);assert.deepEqual(dispatch(),before,'authorized review revises actual facts, not dispatch');assert.deepEqual(db.prepare('select * from maintenance_report_source_journal where id=?').get(original.id),original);
 await call(base+'/review','PUT',payload('confirm',review,corrected.personId));assert.equal((await call(base)).flight.status,'已确认');assert.deepEqual(dispatch(),before);
 hours=db.prepare('select * from maintenance_hour_results where flight_id=?').all(flight.id);assert.equal(hours.length,1);assert.equal(hours[0].person_id,corrected.personId);assert.equal(Number(hours[0].hours),5);assert.equal(hours[0].status,'已确认');assert.equal(Number(db.prepare('select sum(sorties) n from maintenance_sortie_results where flight_id=?').get(flight.id).n),1);
 const frozen=db.prepare('select * from maintenance_report_source_journal where id=?').get(original.id);assert.deepEqual(frozen,original);assert.equal(JSON.parse(frozen.snapshot_json).participants[0].personId,actual.personId);
 const batch=db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='routine'").get(flight.id),effective=db.prepare('select * from maintenance_report_source_journal where batch_id=? and batch_version=?').get(batch.id,batch.version);assert.equal(JSON.parse(effective.snapshot_json).participants[0].personId,corrected.personId);
 const log=db.prepare("select * from maintenance_logs where flight_id=? and action='review_save' order by created_at desc limit 1").get(flight.id),audit=JSON.parse(log.detail);
 assert.equal(audit.before[0].reportedParticipants.find(row=>row.role==='接机').personId,actual.personId);assert.equal(audit.after[0].reportedParticipants.find(row=>row.role==='接机').personId,corrected.personId);assert.equal(audit.before[0].assignments.find(row=>row.role==='接机').personId,rootId);assert.equal(audit.after[0].assignments.find(row=>row.role==='接机').personId,rootId);

 const archived=(await call(base+'/review')).review,archivePayload=payload('save',archived,corrected.personId);archivePayload.reason='合成归档放行实际人员修订';archivePayload.tasks[0].assignments=archivePayload.tasks[0].assignments.map(row=>row.role==='放行'?{...row,personId:actual.personId}:row);
 await call(base+'/review','PUT',archivePayload);assert.deepEqual(dispatch(),before);const archivedRead=(await call(base+'/review')).review;assert.equal(archivedRead.tasks[0].assignments.find(row=>row.role==='放行').personId,actual.personId);assert.equal(archivedRead.tasks[0].assignments.find(row=>row.role==='接机').personId,corrected.personId);assert.equal(Number(db.prepare('select sum(sorties) n from maintenance_sortie_results where flight_id=?').get(flight.id).n),1);assert.equal(db.prepare('select person_id from maintenance_sortie_results where flight_id=?').get(flight.id).person_id,actual.personId);

});

test('nonroutine actual report participants keep dispatch identity through whole confirmation and review',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId,template=db.prepare("select * from users where id='54002010'").get(),actual=createMaintenanceTestAccount(template,{id:'nr-source-actual',name:'非例行实际人员'}),corrected=createMaintenanceTestAccount(template,{id:'nr-source-corrected',name:'非例行复核人员'});
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const made=(await call('/api/maintenance/flights','POST',{date:'2026-11-15',flightNo:'NR-ACTUAL-INDEPENDENT',aircraftNo:'B-NRAI',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${made.id}`,version=async()=>(await call(base)).flight.updatedAt;
 await call(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[{role:'放行',personId}]});
 const item={temporary:true,title:'非例行实际人员分离验收',chapter:'29',reportExplanation:'实际工作范围',category:'其他',standardHours:2,entries:[{role:'主做',personId}]};await call(base+'/reports/nonroutine','PUT',{mode:'save',items:[item],revision:(await call(base+'/reports')).report.nonroutine.revision});
 const subtask=db.prepare('select * from maintenance_subtasks where flight_id=?').get(made.id);await call(`/api/maintenance/subtasks/${subtask.id}/dispatch`,'POST',{expectedUpdatedAt:await version(),assignments:[{role:'主做',personId}]});
 const dispatch=()=>db.prepare('select id,owner_type,owner_id,person_id,user_name,team,role,assigned_by,assigned_at from maintenance_assignments where flight_id=? order by id').all(made.id),before=dispatch(),actualItem={...item,id:subtask.id,temporary:false,entries:[{role:'主做',personId:actual.personId}]};
 await call(base+'/reports/nonroutine','PUT',{mode:'submit',items:[actualItem],revision:(await call(base+'/reports')).report.nonroutine.revision,draftVersion:Number(db.prepare('select version from maintenance_report_drafts where flight_id=?').get(made.id).version)});assert.deepEqual(dispatch(),before,'nonroutine submit must preserve formal dispatch');
 let hours=db.prepare("select * from maintenance_hour_results where owner_type='subtask' and owner_id=?").all(subtask.id);assert.equal(hours.length,1);assert.equal(hours[0].person_id,actual.personId);assert.equal(Number(hours[0].hours),2);
 await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});await call(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:[actualItem],releasePersonId:personId});assert.deepEqual(dispatch(),before);
 let tree=(await call(base+'/review')).review;const task=tree.tasks.find(row=>row.ownerId===subtask.id);assert.equal(task.assignments[0].personId,actual.personId);assert.equal(task.assignments[0].reportedHours,2);
 const body=(mode,review)=>({mode,expectedUpdatedAt:review.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:review.tasks.map(row=>({ownerType:row.ownerType,ownerId:row.ownerId,assignments:row.assignments.map(person=>({role:person.role,personId:row.ownerId===subtask.id?corrected.personId:person.personId}))}))});
 await call(base+'/review','PUT',body('save',tree));tree=(await call(base+'/review')).review;assert.equal(tree.tasks.find(row=>row.ownerId===subtask.id).assignments[0].personId,corrected.personId);await call(base+'/review','PUT',body('confirm',tree));assert.deepEqual(dispatch(),before);assert.equal((await call(base)).flight.status,'已确认');hours=db.prepare("select * from maintenance_hour_results where owner_type='subtask' and owner_id=?").all(subtask.id);assert.equal(hours.length,1);assert.equal(hours[0].person_id,corrected.personId);assert.equal(Number(hours[0].hours),2);assert.equal(hours[0].status,'已确认');assert.equal(db.prepare('select status from maintenance_subtasks where id=?').get(subtask.id).status,'已确认');
 const audit=(await call(`/api/maintenance/subtasks/${subtask.id}/hour-audit`)).detail;assert.equal(audit.people.length,1);assert.equal(audit.people[0].personId,corrected.personId);assert.equal(audit.people[0].assignmentRole,'主做');assert.equal(audit.people[0].finalHours,2);assert.equal(audit.assignedCount,1);assert.equal(audit.participantCount,1);
 const query='/api/maintenance/report?view=nonroutine&dateFrom=2026-11-15&dateTo=2026-11-15&status='+encodeURIComponent('已确认');assert.ok((await call(query+'&personId='+corrected.personId)).rows.some(row=>row.id===subtask.id));assert.ok(!(await call(query+'&personId='+personId)).rows.some(row=>row.id===subtask.id),'formal dispatch alone must not match the actual participant report filter');
 assert.ok((await call(query+'&search='+encodeURIComponent(corrected.name))).rows.some(row=>row.id===subtask.id));assert.ok(!(await call(query+'&search='+encodeURIComponent(login.payload.user.name))).rows.some(row=>row.id===subtask.id),'formal-only names must not match actual work participant search');
});

test('managed unlisted actual participants retain their baseline through confirmation without manufacturing dispatch or hours',async()=>{
 const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED'],previous=flags.map(key=>process.env[key]);
 try{
  process.env.MUC_MAINTENANCE_V101='draft';for(const flag of flags.slice(1))process.env[flag]='1';
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId,actual=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'nr-managed-actual',name:'未收录实际作业人'});
  const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
  const made=(await call('/api/maintenance/flights','POST',{date:'2026-11-15',flightNo:'NR-MANAGED-ACTUAL',aircraftNo:'B-NRMA',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${made.id}`,version=async()=>(await call(base)).flight.updatedAt;
  await call(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[{role:'放行',personId}]});const dispatch=()=>db.prepare('select id,owner_type,owner_id,person_id,user_name,team,role,assigned_by,assigned_at from maintenance_assignments where flight_id=? order by id').all(made.id),before=dispatch();
  const item={clientId:'managed-actual-unlisted',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'29',title:'未收录实际作业人唯一验证',reportExplanation:'明确且不同的工作范围',standardHours:3,entries:[{role:'主做',personId:actual.personId}]};
  const draft=(await call(base+'/reports/nonroutine/draft','PUT',{version:0,items:[item]})).draft;await call(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft.version,items:[item]});assert.deepEqual(dispatch(),before);
  const reviewCase=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(made.id);assert.ok(reviewCase);assert.equal(JSON.parse(reviewCase.participants_json)[0].personId,actual.personId);assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(made.id).n),0);
  const caseUrl=`/api/maintenance/nonroutine-reviews/${reviewCase.id}`,initial=(await call(caseUrl)).review.sourceFacts;assert.equal(initial.available,true);assert.equal(initial.changed,false);assert.equal(initial.current.participants[0].personId,actual.personId);
  await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});const report=(await call(base+'/reports')).report;await call(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:personId});let tree=(await call(base+'/review')).review;assert.equal(tree.tasks.find(row=>row.ownerType==='subtask').assignments[0].personId,actual.personId);
  await call(base+'/review','PUT',{mode:'confirm',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(row=>({ownerType:row.ownerType,ownerId:row.ownerId,assignments:row.assignments.map(person=>({personId:person.personId,role:person.role}))}))});
  const facts=(await call(caseUrl)).review.sourceFacts;assert.equal(facts.changed,false);assert.equal(facts.token,initial.token);assert.deepEqual(dispatch(),before);assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(made.id).n),0);assert.equal(db.prepare('select state from maintenance_nonroutine_review_cases where id=?').get(reviewCase.id).state,'PENDING_ACCEPTANCE');assert.equal((await call(base)).flight.status,'已确认');assert.equal(db.prepare('select status from maintenance_subtasks where id=?').get(reviewCase.subtask_id).status,'已确认');
 }finally{flags.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});}
});

test('review adds first nonroutine actual work without inventing a formal dispatch association',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId,actual=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'nr-review-first-actual',name:'复核补录实际人员'});
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const made=(await call('/api/maintenance/flights','POST',{date:'2026-11-15',flightNo:'NR-REVIEW-FIRST',aircraftNo:'B-NRRF',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${made.id}`,version=async()=>(await call(base)).flight.updatedAt;
 await call(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[{role:'放行',personId}]});await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});let tree=(await call(base+'/review')).review;assert.equal(tree.flight.status,'待复核');
 const tasks=review=>review.tasks.map(row=>({ownerType:row.ownerType,ownerId:row.ownerId,assignments:row.assignments.map(person=>({personId:person.personId,role:person.role}))}));
 await call(base+'/review','PUT',{mode:'save',expectedUpdatedAt:tree.flight.updatedAt,reason:'隔离合成首次补录实际非例行',tasks:tasks(tree),newSubtasks:[{title:'首次补录实际工作',category:'单项工作',standardHours:2,assignments:[{role:'主做',personId:actual.personId}]}]});
 const subtask=db.prepare('select * from maintenance_subtasks where flight_id=?').get(made.id);assert.ok(subtask);assert.equal(Number(db.prepare("select count(*) n from maintenance_assignments where owner_type='subtask' and owner_id=?").get(subtask.id).n),0,'authorized actual work supplementation must not fabricate dispatch');
 tree=(await call(base+'/review')).review;assert.equal(tree.tasks.find(row=>row.ownerId===subtask.id).assignments[0].personId,actual.personId);await call(base+'/review','PUT',{mode:'confirm',expectedUpdatedAt:tree.flight.updatedAt,tasks:tasks(tree),routineElectronicSigned:false,nonroutineElectronicSigned:false});
 assert.equal(db.prepare('select status from maintenance_subtasks where id=?').get(subtask.id).status,'已确认');const hours=db.prepare("select * from maintenance_hour_results where owner_type='subtask' and owner_id=?").all(subtask.id);assert.equal(hours.length,1);assert.equal(hours[0].person_id,actual.personId);assert.equal(Number(hours[0].hours),2);assert.equal(hours[0].status,'已确认');
});

test('task-tree review rechecks current identity permission and whole-tree scope inside its transaction',async()=>{
 const rootLogin=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),rootCookie=String(rootLogin.res.headers['Set-Cookie']).split(';')[0],personId=rootLogin.payload.user.personId,template=db.prepare("select * from users where id='54002010'").get();
 const rootCall=async(path,method='GET',body)=>{const r=await request(path,{method,cookie:rootCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 for(const action of ['save','confirm','archive-save'])for(const change of ['account','personnel','review-permission','scope',...(action==='archive-save'?['archive-permission']:[])]){
  const actor=createMaintenanceTestAccount(template,{id:`tree-auth-${action}-${change}`,name:'任务树当前资格验证'}),grant=code=>db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(actor.id,db.prepare('select id from rbac_roles where code=?').get(code).id,new Date().toISOString());grant('addon_maintenance_review');if(action==='archive-save')grant('addon_archive_modify');db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(actor.id);
  const made=(await rootCall('/api/maintenance/flights','POST',{date:'2026-11-15',flightNo:`TREE-AUTH-${action}-${change}`,aircraftNo:'B-TREEAUTH',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${made.id}`,version=async()=>(await rootCall(base)).flight.updatedAt;await rootCall(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[{role:'放行',personId}]});await rootCall(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});let tree=(await rootCall(base+'/review')).review;
  const payload=review=>({mode:action==='confirm'?'confirm':'save',expectedUpdatedAt:review.flight.updatedAt,reason:action==='archive-save'?'合成归档当前资格测试':'',routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:review.tasks.map(task=>({ownerType:task.ownerType,ownerId:task.ownerId,assignments:task.assignments.map(row=>({personId:row.personId,role:row.role}))}))});
  if(action==='archive-save'){await rootCall(base+'/review','PUT',{...payload(tree),mode:'confirm',reason:''});tree=(await rootCall(base+'/review')).review;}
  const signed=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}});assert.equal(signed.res.statusCode,200);const cookie=String(signed.res.headers['Set-Cookie']).split(';')[0],roles=db.prepare('select * from rbac_user_roles where user_id=?').all(actor.id),scopes=db.prepare('select * from rbac_user_scopes where user_id=?').all(actor.id),tables=['maintenance_flights','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_report_source_journal','maintenance_logs'],facts=()=>JSON.stringify(tables.map(table=>db.prepare(`select * from ${table} where ${table==='maintenance_flights'?'id':'flight_id'}=? order by id`).all(made.id))),before=facts(),original=db.exec.bind(db);let injected=false;
  db.exec=sql=>{if(!injected&&/^begin immediate$/i.test(String(sql).trim())){injected=true;if(change==='account')db.prepare("update users set status='inactive' where id=?").run(actor.id);if(change==='personnel')db.prepare("update personnel set employment_status='停职' where id=?").run(actor.personId);if(change==='scope')db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=? and module='maintenance'").run(actor.id);if(change==='review-permission')db.prepare("delete from rbac_user_roles where user_id=? and role_id in (select id from rbac_roles where code in ('addon_maintenance_review','addon_archive_modify'))").run(actor.id);if(change==='archive-permission')db.prepare("delete from rbac_user_roles where user_id=? and role_id=(select id from rbac_roles where code='addon_archive_modify')").run(actor.id);}return original(sql);};
  try{const result=await request(base+'/review',{method:'PUT',cookie,body:payload(tree)});assert.equal(injected,true);assert.equal(result.res.statusCode,403,`${action}/${change}: ${JSON.stringify(result.payload)}`);assert.equal(facts(),before,`${action}/${change} mutated business facts`);}finally{db.exec=original;db.prepare("update users set status='active',person_id=? where id=?").run(actor.personId,actor.id);db.prepare("update personnel set employment_status='在职' where id=?").run(actor.personId);db.prepare('delete from rbac_user_roles where user_id=?').run(actor.id);for(const row of roles)db.prepare(`insert into rbac_user_roles(${Object.keys(row).join(',')}) values(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));for(const row of scopes)db.prepare('update rbac_user_scopes set scope_type=?,scope_id=? where id=?').run(row.scope_type,row.scope_id,row.id);}
 }
});

test('partial-scope review is redacted read-only and cannot erase hidden participants',async()=>{
 const signed=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),rootCookie=String(signed.res.headers['Set-Cookie']).split(';')[0],rootId=signed.payload.user.personId,template=db.prepare("select * from users where id='54002010'").get(),reviewer=createMaintenanceTestAccount(template,{id:'tree-partial-reviewer',name:'局部范围复核员'}),outsider=createMaintenanceTestAccount(template,{id:'tree-outside-reviewer',name:'无关联范围复核员'}),role=db.prepare("select id from rbac_roles where code='addon_maintenance_review'").get();
 for(const user of [reviewer,outsider]){db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(user.id,role.id,new Date().toISOString());db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=? and module='maintenance'").run(user.id);}
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie:rootCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const made=(await call('/api/maintenance/flights','POST',{date:'2026-11-15',flightNo:'TREE-PARTIAL-SCOPE',aircraftNo:'B-TPS',aircraftType:'A320',workKind:'航后'})).flight,base=`/api/maintenance/flights/${made.id}`,version=async()=>(await call(base)).flight.updatedAt,entries=[{role:'接机',personId:reviewer.personId}];db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),made.id);
 await call(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[{role:'放行',personId:rootId},{role:'接机',personId:rootId}]});await call(base+'/reports/routine','PUT',{expectedUpdatedAt:await version(),entries});await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});await call(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:entries,nonroutineItems:[],releasePersonId:rootId});
 const login=async user=>{const r=await request('/api/login',{method:'POST',body:{username:user.username,password:'muc2026'}});assert.equal(r.res.statusCode,200);return String(r.res.headers['Set-Cookie']).split(';')[0];},cookie=await login(reviewer),outsideCookie=await login(outsider);
 const read=await request(base+'/review',{cookie});assert.equal(read.res.statusCode,200,JSON.stringify(read.payload));assert.equal(read.payload.review.canEditEntireTree,false);assert.equal(read.payload.review.defaults,undefined);assert.ok(!JSON.stringify(read.payload.review).includes(rootId));assert.equal(read.payload.review.tasks[0].assignments.length,1);assert.equal(read.payload.review.tasks[0].assignments[0].personId,reviewer.personId);assert.equal((await request(base+'/review',{cookie:outsideCookie})).res.statusCode,404);
 const tables=['maintenance_flights','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_report_source_journal','maintenance_logs'],facts=()=>JSON.stringify(tables.map(table=>db.prepare(`select * from ${table} where ${table==='maintenance_flights'?'id':'flight_id'}=? order by id`).all(made.id))),before=facts(),payload=tree=>({mode:'confirm',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(task=>({ownerType:task.ownerType,ownerId:task.ownerId,assignments:task.assignments.map(row=>({personId:row.personId,role:row.role}))}))});
 assert.ok([403,404].includes((await request(base+'/review',{method:'PUT',cookie,body:payload(read.payload.review)})).res.statusCode));assert.equal(facts(),before);
 db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=? and module='maintenance'").run(reviewer.id);const full=await request(base+'/review',{cookie});assert.equal(full.res.statusCode,200);assert.equal(full.payload.review.canEditEntireTree,true);assert.ok(Number(full.payload.review.defaults.towStandardHours)>0);assert.deepEqual(Object.keys(full.payload.review.defaults),['towStandardHours']);assert.equal((await request('/api/maintenance/rules',{cookie})).res.statusCode,403,'review authority does not grant global rule viewing');assert.equal(full.payload.review.tasks[0].assignments.length,2);assert.equal((await request(base+'/review',{method:'PUT',cookie,body:payload(full.payload.review)})).res.statusCode,200);assert.equal((await call(base)).flight.status,'已确认');assert.equal(Number(db.prepare('select sum(hours) n from maintenance_hour_results where flight_id=?').get(made.id).n),5);assert.equal(Number(db.prepare('select sum(sorties) n from maintenance_sortie_results where flight_id=?').get(made.id).n),1);
});

test('release sorties stay unit-independent while nonroutine totals combine normal and review-posted channels',async()=>{
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'],previous=flags.map(k=>process.env[k]);
  const template=db.prepare("select * from users where id='54002010'").get(),stamp=new Date().toISOString();
  const loginAs=async account=>{const r=await request('/api/login',{method:'POST',body:{username:account.username||account.id,password:'muc2026'}});assert.equal(r.res.statusCode,200);return String(r.res.headers['Set-Cookie']).split(';')[0];};
  const assignRole=(account,code)=>{const id=typeof account==='string'?account:account.id;const roleId=db.prepare('select id from rbac_roles where code=?').get(code).id;db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(id,roleId,stamp);};
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    const cookie=await loginAs(template),personId=template.person_id;
    const call=async(path,method='GET',body,useCookie=cookie)=>{const r=await request(path,{method,cookie:useCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
    const worker=createMaintenanceTestAccount(template,{id:'ledger-units-worker',name:'台账单位验收工人'}),workerCookie=await loginAs(worker);
    const standardId='ledger-units-standard';
    db.prepare("insert into maintenance_standards(id,status,revision,created_by,created_at,updated_at) values(?,'PUBLISHED',1,'fixture',?,?)").run(standardId,stamp,stamp);
    db.prepare("insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,generic_aircraft,status,admission_decision,effective_at,published_by,published_at,created_at) values(?,?,1,'单项工作','968','台账单位验收标准','单位验收标准范围',2,'[\"A320\"]',0,'PUBLISHED','INCLUDE','2026-01-01','fixture','2026-01-01',?)").run(standardId+'-v1',standardId,stamp);
    // Flight 1: matched nonroutine item (normal channel) plus release reporting.
    const flight1=(await call('/api/maintenance/flights','POST',{date:'2026-11-02',flightNo:'LEDGER-UNITS-A',aircraftNo:'B-LUA',aircraftType:'A320',workKind:'停场'})).flight,base1=`/api/maintenance/flights/${flight1.id}`,version1=async()=>(await call(base1)).flight.updatedAt;
    await call(base1+'/dispatch','POST',{expectedUpdatedAt:flight1.updatedAt,assignments:[{role:'放行',personId}]});
    const matched={clientId:'ledger-units-matched',temporary:true,manualManaged:true,standardId,standardVersion:1,category:'单项工作',chapter:'968',title:'台账单位验收标准',reportExplanation:'单位验收标准范围',standardHours:2,entries:[{personId:worker.personId,role:'主做'}]},draft1=(await call(base1+'/reports/nonroutine/draft','PUT',{version:0,items:[matched]})).draft;
    await call(base1+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft1.version,items:[matched]});
    await call(base1+'/reports/release','PUT',{expectedUpdatedAt:await version1()});
    // P0-45: the release submission yields exactly one sortie result and no hours for the release person.
    const flight1Sorties=db.prepare('select * from maintenance_sortie_results where flight_id=?').all(flight1.id);
    assert.equal(flight1Sorties.length,1);assert.equal(flight1Sorties[0].person_id,personId);assert.equal(flight1Sorties[0].role,'放行');assert.equal(Number(flight1Sorties[0].sorties),1);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=? and person_id=?').get(flight1.id,personId).n),0);
    const matchedResults=db.prepare('select * from maintenance_hour_results where flight_id=? and person_id=?').all(flight1.id,worker.personId);
    assert.ok(matchedResults.length===1);assert.ok(matchedResults.every(row=>row.source!=='非例行审核认定'));
    const report1=(await call(base1+'/reports')).report;
    await call(base1+'/report-confirmation','POST',{expectedUpdatedAt:await version1(),routineEntries:[],nonroutineItems:report1.nonroutine.items,releasePersonId:personId});
    const tree1=(await call(base1+'/review')).review;
    await call(base1+'/review','PUT',{mode:'confirm',expectedUpdatedAt:tree1.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree1.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))});
    assert.equal(Number(db.prepare("select count(*) n from maintenance_hour_results where flight_id=? and status='已确认' and person_id=?").get(flight1.id,worker.personId).n),1);
    // Flight 2: unregistered item goes through the review channel while the flight itself stays unconfirmed.
    const flight2=(await call('/api/maintenance/flights','POST',{date:'2026-11-03',flightNo:'LEDGER-UNITS-B',aircraftNo:'B-LUB',aircraftType:'A320',workKind:'停场'})).flight,base2=`/api/maintenance/flights/${flight2.id}`,version2=async()=>(await call(base2)).flight.updatedAt;
    await call(base2+'/dispatch','POST',{expectedUpdatedAt:flight2.updatedAt,assignments:[{role:'放行',personId}]});
    const unregistered={clientId:'ledger-units-review',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'969',title:'台账验收未收录项',reportExplanation:'评议渠道未收录项',standardHours:3,entries:[{personId:worker.personId,role:'主做'}]},draft2=(await call(base2+'/reports/nonroutine/draft','PUT',{version:0,items:[unregistered]})).draft;
    await call(base2+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft2.version,items:[unregistered]});
    await call(base2+'/reports/release','PUT',{expectedUpdatedAt:await version2()});
    const caseId=db.prepare('select id from maintenance_nonroutine_review_cases where flight_id=?').get(flight2.id).id,url=`/api/maintenance/nonroutine-reviews/${caseId}`;
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(flight2.id).n),0);
    const reviewers=Array.from({length:12},(_,i)=>createMaintenanceTestAccount(template,{id:'ledger-units-reviewer-'+i,name:'台账单位评议'+i}));for(const reviewer of reviewers)assignRole(reviewer,'addon_nonroutine_reviewer');
    const finalizer=createMaintenanceTestAccount(template,{id:'ledger-units-finalizer',name:'台账单位终审'});assignRole(finalizer,'addon_nonroutine_review_finalizer');assignRole(finalizer,'addon_nonroutine_review_auditor');
    const finalizerCookie=await loginAs(finalizer);
    await call(url+'/accept','POST',{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:finalizer.id});
    for(const [index,reviewer] of reviewers.entries())await call(url+'/opinion','POST',{revision:0,hours:index+1,basis:'LEDGER-UNITS-PRIVATE-'+index},await loginAs(reviewer));
    const periodResponsible=createMaintenanceTestAccount(template,{id:'ledger-units-period',name:'台账验收账期负责人'});assignRole(periodResponsible,'addon_maintenance_period_responsible');
    db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=?").run(periodResponsible.id);
    const periodUrl='/api/maintenance/hour-periods/2026-11';
    await call(periodUrl+'/assign','POST',{revision:0,accountId:periodResponsible.id,reason:'台账验收指定账期负责人'});
    await call(periodUrl+'/confirm','POST',{revision:1,state:'OPEN',reason:'台账验收开放当月'},await loginAs(periodResponsible));
    const sealed=(await call(url,undefined,undefined,finalizerCookie)).review;
    assert.equal(sealed.state,'SEALED');
    const decision={revision:sealed.revision,decision:{category:'单项工作',chapter:'969',title:unregistered.title,workScope:unregistered.reportExplanation,recognizedHours:2.5},participantsVerified:true,participants:[{personId:worker.personId,role:'主做'}],reason:'台账验收终审认定',admissionDecision:'PENDING'};
    const preview=(await call(url+'/preview','POST',decision,finalizerCookie)).preview;
    const finalization=(await call(url+'/finalize','POST',{...decision,expectedPolicyToken:preview.policyToken},finalizerCookie)).finalization;
    assert.equal(finalization.channel.state,'MERGED_CLOSED',JSON.stringify(finalization));
    const posted=db.prepare("select * from maintenance_hour_results where flight_id=? and source='非例行审核认定'").all(flight2.id);
    assert.equal(posted.length,1);assert.equal(Number(posted[0].hours),2.5);assert.equal(posted[0].person_id,worker.personId);assert.equal(posted[0].status,'已提报');
    // P0-46/P0-47 through the personal stats APIs: nonroutine totals include both channels, sorties stay separate units.
    const detailsQuery=(type,status,useCookie)=>`/api/maintenance/stats/personal/details?type=${type}&status=${status}&month=2026-11`;
    const workerConfirmed=(await call(detailsQuery('nonroutine','confirmed'),undefined,undefined,workerCookie));
    assert.equal(workerConfirmed.unit,'小时');assert.equal(workerConfirmed.total,2);assert.equal(workerConfirmed.rows.length,1);
    const workerPending=(await call(detailsQuery('nonroutine','pending'),undefined,undefined,workerCookie));
    assert.equal(workerPending.total,2.5);assert.equal(workerPending.rows.length,1);
    const both=[...workerConfirmed.rows,...workerPending.rows];
    assert.equal(new Set(both.map(row=>row.id)).size,2);
    const workerHoursOnly=(await call(detailsQuery('all','confirmed'),undefined,undefined,workerCookie));
    assert.equal(workerHoursOnly.total,2);assert.ok(!('sorties' in workerHoursOnly)||workerHoursOnly.sorties===undefined);
    const workerSorties=(await call(detailsQuery('sortie','confirmed'),undefined,undefined,workerCookie));
    assert.equal(workerSorties.unit,'架次');assert.equal(workerSorties.rows.length,0);
    const adminSortieConfirmed=(await call(detailsQuery('sortie','confirmed')));
    assert.equal(adminSortieConfirmed.unit,'架次');assert.ok(adminSortieConfirmed.rows.some(row=>String(row.flightNo).includes('LEDGER-UNITS-A')&&row.sorties===1));
    const adminSortiePending=(await call(detailsQuery('sortie','pending')));
    assert.ok(adminSortiePending.rows.some(row=>String(row.flightNo).includes('LEDGER-UNITS-B')&&row.sorties===1));
    assert.equal(Number(db.prepare('select count(*) n from maintenance_sortie_results where flight_id=?').get(flight2.id).n),1);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=? and person_id=?').get(flight2.id,personId).n),0);
    assert.equal(Number(db.prepare("select count(*) n from maintenance_effective_hour_results where person_id=? and owner_type='subtask'").get(worker.personId).n),2);
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
});

test('review finalization around opportunity confirmation posts once through stage-matched channels with month-preserving receipts',async()=>{
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'],previous=flags.map(k=>process.env[k]);
  const template=db.prepare("select * from users where id='54002010'").get(),stamp=new Date().toISOString();
  const loginAs=async account=>{const r=await request('/api/login',{method:'POST',body:{username:account.username||account.id,password:'muc2026'}});assert.equal(r.res.statusCode,200);return String(r.res.headers['Set-Cookie']).split(';')[0];};
  const assignRole=(account,code)=>{const id=typeof account==='string'?account:account.id;const roleId=db.prepare('select id from rbac_roles where code=?').get(code).id;db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(id,roleId,stamp);};
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    const cookie=await loginAs(template),personId=template.person_id;
    const call=async(path,method='GET',body,useCookie=cookie)=>{const r=await request(path,{method,cookie:useCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
    const worker=createMaintenanceTestAccount(template,{id:'finalization-timing-worker',name:'三时点验收工人'});
    const reviewers=Array.from({length:12},(_,i)=>createMaintenanceTestAccount(template,{id:'finalization-timing-reviewer-'+i,name:'三时点评议'+i}));for(const reviewer of reviewers)assignRole(reviewer,'addon_nonroutine_reviewer');
    const finalizer=createMaintenanceTestAccount(template,{id:'finalization-timing-finalizer',name:'三时点终审'});assignRole(finalizer,'addon_nonroutine_review_finalizer');assignRole(finalizer,'addon_nonroutine_review_auditor');
    const periodResponsible=createMaintenanceTestAccount(template,{id:'finalization-timing-period',name:'三时点账期负责人'});assignRole(periodResponsible,'addon_maintenance_period_responsible');
    db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=?").run(periodResponsible.id);
    const finalizerCookie=await loginAs(finalizer);
    const seatReview=async caseId=>{const url=`/api/maintenance/nonroutine-reviews/${caseId}`;await call(url+'/accept','POST',{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:finalizer.id});for(const [index,reviewer] of reviewers.entries())await call(url+'/opinion','POST',{revision:0,hours:index+1,basis:'TIMING-PRIVATE-'+index},await loginAs(reviewer));return (await call(url,undefined,undefined,finalizerCookie)).review;};
    const decide=(review,item,hours)=>({revision:review.revision,decision:{category:'单项工作',chapter:item.chapter,title:item.title,workScope:item.reportExplanation,recognizedHours:hours},participantsVerified:true,participants:[{personId:worker.personId,role:'主做'}],reason:'三时点终审认定',admissionDecision:'PENDING'});
    // ---- Case A: finalization completes BEFORE opportunity confirmation (flight stays 待复核). ----
    const flightA=(await call('/api/maintenance/flights','POST',{date:'2027-01-04',flightNo:'TIMING-BEFORE-CONFIRM',aircraftNo:'B-TBA',aircraftType:'A320',workKind:'停场'})).flight,baseA=`/api/maintenance/flights/${flightA.id}`,versionA=async()=>(await call(baseA)).flight.updatedAt;
    await call(baseA+'/dispatch','POST',{expectedUpdatedAt:flightA.updatedAt,assignments:[{role:'放行',personId}]});
    const itemA={clientId:'timing-before-item',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'971',title:'三时点未收录项甲',reportExplanation:'确认前终审场景',standardHours:3,entries:[{personId:worker.personId,role:'主做'}]},draftA=(await call(baseA+'/reports/nonroutine/draft','PUT',{version:0,items:[itemA]})).draft;
    await call(baseA+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draftA.version,items:[itemA]});
    await call(baseA+'/reports/release','PUT',{expectedUpdatedAt:await versionA()});
    const reportA=(await call(baseA+'/reports')).report;
    await call(baseA+'/report-confirmation','POST',{expectedUpdatedAt:await versionA(),routineEntries:[],nonroutineItems:reportA.nonroutine.items,releasePersonId:personId});
    assert.equal((await call(baseA)).flight.status,'待复核');
    const caseA=db.prepare('select id from maintenance_nonroutine_review_cases where flight_id=?').get(flightA.id).id,urlA=`/api/maintenance/nonroutine-reviews/${caseA}`;
    const sealedA=await seatReview(caseA);assert.equal(sealedA.state,'SEALED');
    const decisionA=decide(sealedA,itemA,2.5);
    const previewA=(await call(urlA+'/preview','POST',decisionA,finalizerCookie)).preview;
    // Unknown period must suspend legitimately: finalized, channel attention, zero postings, retry stays suspended.
    const suspended=(await call(urlA+'/finalize','POST',{...decisionA,expectedPolicyToken:previewA.policyToken},finalizerCookie)).finalization;
    assert.equal(suspended.channel.state,'NEEDS_ATTENTION');assert.equal(suspended.attempts.at(-1).detail.code,'PERIOD_STATUS_UNKNOWN');
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where owner_id in (select id from maintenance_subtasks where flight_id=?)').get(flightA.id).n),0);
    const suspendedRetry=(await call(urlA+'/sync','POST',{},finalizerCookie)).finalization;
    assert.equal(suspendedRetry.attempts.at(-1).detail.code,'PERIOD_STATUS_UNKNOWN');
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where owner_id in (select id from maintenance_subtasks where flight_id=?)').get(flightA.id).n),0);
    // Open the month with the dedicated responsible account, then double-click sync with truly concurrent dispatch: at most one posting.
    const periodUrl='/api/maintenance/hour-periods/2027-01';
    await call(periodUrl+'/assign','POST',{revision:0,accountId:periodResponsible.id,reason:'三时点指定账期负责人'});
    await call(periodUrl+'/confirm','POST',{revision:1,state:'OPEN',reason:'三时点开放当月'},await loginAs(periodResponsible));
    const concurrentSync=await Promise.all([request(urlA+'/sync',{method:'POST',cookie:finalizerCookie,body:{}}),request(urlA+'/sync',{method:'POST',cookie:finalizerCookie,body:{}})]);
    for(const r of concurrentSync){assert.equal(r.res.statusCode,200,JSON.stringify(r.payload));assert.equal(r.payload.finalization.channel.state,'MERGED_CLOSED');}
    const postedA=db.prepare('select * from maintenance_hour_results where owner_id in (select id from maintenance_subtasks where flight_id=?)').all(flightA.id);
    assert.equal(postedA.length,1,'concurrent double-click sync must yield exactly one effective posting');
    assert.equal(Number(postedA[0].hours),2.5);assert.equal(postedA[0].person_id,worker.personId);
    assert.equal(postedA[0].status,'待复核','P0-12: pre-confirmation finalization enters 待复核, never 已确认 directly');
    const receiptA=db.prepare('select * from maintenance_nonroutine_posting_receipts where case_id=?').get(caseA);
    assert.equal(receiptA.work_month,'2027-01');assert.equal(receiptA.handling_month,'2027-01');assert.equal(receiptA.statistical_month,'2027-01');assert.equal(receiptA.policy,'ORIGINAL_WORK_MONTH');
    const settledSync=(await call(urlA+'/sync','POST',{},finalizerCookie)).finalization;
    assert.equal(settledSync.channel.state,'MERGED_CLOSED');
    assert.deepEqual(db.prepare('select * from maintenance_hour_results where owner_id in (select id from maintenance_subtasks where flight_id=?)').all(flightA.id),postedA,'settled-channel replay must not post again');
    // The original confirmation chain then promotes the posted row exactly once.
    const treeA=(await call(baseA+'/review')).review;
    await call(baseA+'/review','PUT',{mode:'confirm',expectedUpdatedAt:treeA.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:treeA.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))});
    const promotedA=db.prepare('select * from maintenance_hour_results where owner_id in (select id from maintenance_subtasks where flight_id=?)').all(flightA.id);
    assert.equal(promotedA.length,1);assert.equal(promotedA[0].status,'已确认');assert.equal(promotedA[0].id,postedA[0].id);
    // ---- Case B: finalization completes AFTER opportunity confirmation (one-shot adjustment channel). ----
    const flightB=(await call('/api/maintenance/flights','POST',{date:'2027-01-05',flightNo:'TIMING-AFTER-CONFIRM',aircraftNo:'B-TBB',aircraftType:'A320',workKind:'航后'})).flight,baseB=`/api/maintenance/flights/${flightB.id}`,versionB=async()=>(await call(baseB)).flight.updatedAt;
    await call(baseB+'/dispatch','POST',{expectedUpdatedAt:flightB.updatedAt,assignments:[{role:'放行',personId},{role:'接机',personId:worker.personId}]});
    db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flightB.id);
    const itemB={clientId:'timing-after-item',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'972',title:'三时点未收录项乙',reportExplanation:'确认后终审场景',standardHours:3,entries:[{personId:worker.personId,role:'主做'}]},draftB=(await call(baseB+'/reports/nonroutine/draft','PUT',{version:0,items:[itemB]})).draft;
    await call(baseB+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draftB.version,items:[itemB]});
    const routineEntries=[{role:'接机',personId:worker.personId}];
    await call(baseB+'/reports/routine','PUT',{expectedUpdatedAt:await versionB(),entries:routineEntries});
    await call(baseB+'/reports/release','PUT',{expectedUpdatedAt:await versionB()});
    const reportB=(await call(baseB+'/reports')).report;
    await call(baseB+'/report-confirmation','POST',{expectedUpdatedAt:await versionB(),routineEntries,nonroutineItems:reportB.nonroutine.items,releasePersonId:personId});
    const treeB=(await call(baseB+'/review')).review;
    await call(baseB+'/review','PUT',{mode:'confirm',expectedUpdatedAt:treeB.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:treeB.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))});
    assert.equal((await call(baseB)).flight.status,'已确认');
    const originalB={hours:db.prepare('select * from maintenance_hour_results where flight_id=? order by id').all(flightB.id),sorties:db.prepare('select * from maintenance_sortie_results where flight_id=? order by id').all(flightB.id)};
    assert.equal(originalB.hours.length,1);assert.equal(Number(originalB.hours[0].hours),5);assert.equal(originalB.hours[0].status,'已确认');
    const caseB=db.prepare('select id from maintenance_nonroutine_review_cases where flight_id=?').get(flightB.id).id,urlB=`/api/maintenance/nonroutine-reviews/${caseB}`;
    const sealedB=await seatReview(caseB);assert.equal(sealedB.state,'SEALED');
    const decisionB=decide(sealedB,itemB,2.5);
    const previewB=(await call(urlB+'/preview','POST',decisionB,finalizerCookie)).preview;
    const concurrentFinalize=await Promise.all([request(urlB+'/finalize',{method:'POST',cookie:finalizerCookie,body:{...decisionB,expectedPolicyToken:previewB.policyToken}}),request(urlB+'/finalize',{method:'POST',cookie:finalizerCookie,body:{...decisionB,expectedPolicyToken:previewB.policyToken}})]);
    for(const r of concurrentFinalize){assert.equal(r.res.statusCode,200,JSON.stringify(r.payload));assert.equal(r.payload.finalization.channel.state,'ADJUSTED_CLOSED');}
    const adjustmentsB=db.prepare('select * from maintenance_nonroutine_hour_adjustments where case_id=?').all(caseB);
    assert.equal(adjustmentsB.length,1,'concurrent double-click finalize must yield exactly one adjustment posting');
    assert.equal(Number(adjustmentsB[0].hours),2.5);assert.equal(adjustmentsB[0].person_id,worker.personId);assert.equal(adjustmentsB[0].status,'已确认');assert.equal(adjustmentsB[0].source,'审核补记');
    assert.deepEqual(db.prepare('select * from maintenance_hour_results where flight_id=? order by id').all(flightB.id),originalB.hours,'P0-13: original reporting must stay byte-identical');
    assert.deepEqual(db.prepare('select * from maintenance_sortie_results where flight_id=? order by id').all(flightB.id),originalB.sorties);
    const receiptB=db.prepare('select * from maintenance_nonroutine_posting_receipts where case_id=?').get(caseB);
    assert.equal(receiptB.work_month,'2027-01');assert.equal(receiptB.handling_month,'2027-01');assert.equal(receiptB.statistical_month,'2027-01');assert.equal(receiptB.policy,'ORIGINAL_WORK_MONTH');
    const sameBodyRetry=await request(urlB+'/finalize',{method:'POST',cookie:finalizerCookie,body:{...decisionB,expectedPolicyToken:previewB.policyToken}});
    assert.equal(sameBodyRetry.res.statusCode,200);assert.equal(sameBodyRetry.payload.finalization.channel.state,'ADJUSTED_CLOSED');
    const rewritten=await request(urlB+'/finalize',{method:'POST',cookie:finalizerCookie,body:{...decisionB,reason:'尝试改写已锁定终审'}});
    assert.equal(rewritten.res.statusCode,409);
    const settledB=(await call(urlB+'/sync','POST',{},finalizerCookie)).finalization;
    assert.equal(settledB.channel.state,'ADJUSTED_CLOSED');
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_hour_adjustments where case_id=?').get(caseB).n),1);
    assert.equal(Number(db.prepare("select count(*) n from maintenance_effective_hour_results where person_id=? and owner_type='subtask' and status='已确认'").get(worker.personId).n),2,'confirmed-flight contribution: one matched-free posting plus one adjustment for this worker');
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where owner_id in (select id from maintenance_subtasks where flight_id=?)').get(flightB.id).n),0,'confirmed-flight finalization must not reopen the MERGED channel');
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
});

test('release reporting and confirmation reject actors without release authority on the server side',async()=>{
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),rootCookie=String(login.res.headers['Set-Cookie']).split(';')[0],template=db.prepare("select * from users where id='54002010'").get(),stamp=new Date().toISOString();
  const loginAs=async account=>{const r=await request('/api/login',{method:'POST',body:{username:account.username,password:'muc2026'}});assert.equal(r.res.statusCode,200);return String(r.res.headers['Set-Cookie']).split(';')[0];};
  const releaseWorker=createMaintenanceTestAccount(template,{id:'release-authority-release',name:'放行资格验收放行员'});
  const mechanicWorker=createMaintenanceTestAccount(template,{id:'release-authority-mechanic',name:'放行资格验收机械员'});
  const plainWorker=createMaintenanceTestAccount(template,{id:'release-authority-plain',name:'放行资格验收无关工人'});
  const noPerm=createMaintenanceTestAccount(template,{id:'release-authority-noperm',name:'放行资格验收无权限'});
  db.prepare('delete from rbac_user_roles where user_id=?').run(noPerm.id);
  const flight=(await request('/api/maintenance/flights',{method:'POST',cookie:rootCookie,body:{date:'2026-11-05',flightNo:'RELEASE-AUTHORITY-QA',aircraftNo:'B-RAQ',aircraftType:'A320',workKind:'航后'}})).payload.flight,base=`/api/maintenance/flights/${flight.id}`;
  db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flight.id);
  assert.equal((await request(base+'/dispatch',{method:'POST',cookie:rootCookie,body:{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId:releaseWorker.personId},{role:'接机',personId:mechanicWorker.personId}]}})).res.statusCode,200);
  const routineEntries=[{role:'接机',personId:mechanicWorker.personId}];
  assert.equal((await request(base+'/reports/routine',{method:'PUT',cookie:await loginAs(mechanicWorker),body:{expectedUpdatedAt:(await request(base,{cookie:rootCookie})).payload.flight.updatedAt,entries:routineEntries}})).res.statusCode,200);
  const version=async()=>(await request(base,{cookie:rootCookie})).payload.flight.updatedAt;
  const tables=['maintenance_flights','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_logs'],facts=()=>JSON.stringify(tables.map(table=>db.prepare(`select * from ${table} where ${table==='maintenance_flights'?'id':'flight_id'}=? order by id`).all(flight.id)));
  const expectBlocked=async(label,cookie,pathname,method,body,status,message)=>{const before=facts();const result=await request(pathname,{method,cookie,body});assert.equal(result.res.statusCode,status,`${label}: ${result.res.statusCode} ${JSON.stringify(result.payload)}`);if(message)assert.ok(String(result.payload.error).includes(message),`${label} message: ${result.payload.error}`);assert.equal(facts(),before,`${label} must not write`);};
  const noPermCookie=await loginAs(noPerm),plainCookie=await loginAs(plainWorker),mechanicCookie=await loginAs(mechanicWorker),releaseCookie=await loginAs(releaseWorker);
  await expectBlocked('no-permission release submit',noPermCookie,base+'/reports/release','PUT',{expectedUpdatedAt:await version()},403,'提交维修报工的权限');
  await expectBlocked('undispatched worker release submit',plainCookie,base+'/reports/release','PUT',{expectedUpdatedAt:await version()},400,'放行人员');
  await expectBlocked('dispatched non-release worker submit',mechanicCookie,base+'/reports/release','PUT',{expectedUpdatedAt:await version()},400,'放行人员');
  await expectBlocked('non-release worker confirmation',mechanicCookie,base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries,nonroutineItems:[],releasePersonId:mechanicWorker.personId},400,'原放行报工人');
  // Positive control: the dispatched release person submits, then a non-reporter still cannot confirm.
  assert.equal((await request(base+'/reports/release',{method:'PUT',cookie:releaseCookie,body:{expectedUpdatedAt:await version()}})).res.statusCode,200);
  assert.equal(Number(db.prepare('select count(*) n from maintenance_sortie_results where flight_id=?').get(flight.id).n),1);
  await expectBlocked('non-reporter confirmation after batch',plainCookie,base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries,nonroutineItems:[],releasePersonId:releaseWorker.personId},400,'原放行报工人');
  assert.equal((await request(base+'/report-confirmation',{method:'POST',cookie:releaseCookie,body:{expectedUpdatedAt:await version(),routineEntries,nonroutineItems:[],releasePersonId:releaseWorker.personId}})).res.statusCode,200);
  assert.equal(Number(db.prepare('select count(*) n from maintenance_sortie_results where flight_id=?').get(flight.id).n),1);
  assert.ok(db.prepare('select * from maintenance_report_batches where flight_id=? and report_type=\'release\'').get(flight.id).submitted_by===releaseWorker.id);
});

test('legacy pre-batch confirmed rows stay readable and untouched by current flows',async()=>{
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),rootCookie=String(login.res.headers['Set-Cookie']).split(';')[0],template=db.prepare("select * from users where id='54002010'").get(),personId=login.payload.user.personId,stamp=new Date().toISOString();
  const loginAs=async account=>{const r=await request('/api/login',{method:'POST',body:{username:account.username||account.id,password:'muc2026'}});assert.equal(r.res.statusCode,200);return String(r.res.headers['Set-Cookie']).split(';')[0];};
  const worker=createMaintenanceTestAccount(template,{id:'legacy-regression-worker',name:'旧数据回归验收工人'}),workerCookie=await loginAs(worker);
  const call=async(path,method='GET',body,useCookie=rootCookie)=>{const r=await request(path,{method,cookie:useCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
  // Pre-system history: confirmed hour and sortie rows with no report batches, no journal, no draft.
  const legacyFlight=(await call('/api/maintenance/flights','POST',{date:'2026-10-05',flightNo:'LEGACY-PREBATCH-QA',aircraftNo:'B-LGCY',aircraftType:'A320',workKind:'航后'})).flight;
  db.prepare(`insert into maintenance_hour_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,adjusted_hours,status,confirmed_by,confirmed_at,created_at,updated_at)
    values('legacy-hour-row','flight',?,?,'',?,?, '旧数据班组','接机','旧系统迁移',3,null,'已确认','legacy','2026-10-06T00:00:00Z','2026-10-06T00:00:00Z','2026-10-06T00:00:00Z')`).run(legacyFlight.id,legacyFlight.id,worker.personId,worker.name);
  db.prepare(`insert into maintenance_sortie_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,sorties,status,confirmed_by,confirmed_at,created_at,updated_at)
    values('legacy-sortie-row','flight',?,?,'',?,?,'旧数据班组','放行','旧系统迁移',1,'已确认','legacy','2026-10-06T00:00:00Z','2026-10-06T00:00:00Z','2026-10-06T00:00:00Z')`).run(legacyFlight.id,legacyFlight.id,personId,template.name);
  const legacyRows=()=>({hours:db.prepare('select * from maintenance_hour_results where id=?').get('legacy-hour-row'),sorties:db.prepare('select * from maintenance_sortie_results where id=?').get('legacy-sortie-row')}),before=legacyRows();
  // Read chains must include legacy confirmed facts.
  const workerDetails=(await call('/api/maintenance/stats/personal/details?type=all&status=confirmed&month=2026-10',undefined,undefined,workerCookie));
  assert.equal(workerDetails.total,3);assert.ok(workerDetails.rows.some(row=>row.id==='legacy-hour-row'));
  const adminSortie=(await call('/api/maintenance/stats/personal/details?type=sortie&status=confirmed&month=2026-10'));
  assert.ok(adminSortie.rows.some(row=>row.id==='legacy-sortie-row'&&row.sorties===1));
  assert.equal((await call(`/api/maintenance/flights/${legacyFlight.id}/reports`)).report.flight.id,legacyFlight.id);
  // Current flows on a separate flight must not disturb legacy facts.
  const flight=(await call('/api/maintenance/flights','POST',{date:'2026-10-06',flightNo:'LEGACY-NEIGHBOR-QA',aircraftNo:'B-LGCN',aircraftType:'A320',workKind:'航后'})).flight,base=`/api/maintenance/flights/${flight.id}`,version=async()=>(await call(base)).flight.updatedAt;
  db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flight.id);
  await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId},{role:'接机',personId:worker.personId}]});
  await call(base+'/reports/routine','PUT',{expectedUpdatedAt:await version(),entries:[{role:'接机',personId:worker.personId}]});
  await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});
  await call(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:[{role:'接机',personId:worker.personId}],nonroutineItems:[],releasePersonId:personId});
  const tree=(await call(base+'/review')).review;
  await call(base+'/review','PUT',{mode:'confirm',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))});
  // Legacy confirmed rows are locked against re-confirmation and stay byte-identical.
  const reconfirm=await request(base.slice(0,base.indexOf('/api'))+'/api/maintenance/flights/'+legacyFlight.id+'/report-confirmation',{method:'POST',cookie:rootCookie,body:{expectedUpdatedAt:(await call('/api/maintenance/flights/'+legacyFlight.id)).flight.updatedAt,routineEntries:[],nonroutineItems:[],releasePersonId:personId}});
  assert.ok([400,403,409].includes(reconfirm.res.statusCode),String(reconfirm.res.statusCode));
  assert.deepEqual(legacyRows(),before);
  const afterNeighbor=await call('/api/maintenance/stats/personal/details?type=all&status=confirmed&month=2026-10',undefined,undefined,workerCookie);
  assert.equal(afterNeighbor.total,8,'legacy 3h plus fresh 5h; legacy row still present');
  assert.ok(afterNeighbor.rows.some(row=>row.id==='legacy-hour-row'));
});

test('eight nonroutine categories keep the legacy four inputs and never leak into dispatch roles',async()=>{
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),rootCookie=String(login.res.headers['Set-Cookie']).split(';')[0],template=db.prepare("select * from users where id='54002010'").get(),personId=login.payload.user.personId,stamp=new Date().toISOString();
  const {NONROUTINE_CATEGORY_STRATEGIES}=await import('../maintenance-standards.mjs');
  assert.deepEqual(Object.keys(NONROUTINE_CATEGORY_STRATEGIES),['工卡指令','单项工作','拖机','三方附加','试车','其他','人工除冰','联合除冰']);
  assert.equal(NONROUTINE_CATEGORY_STRATEGIES['三方附加'],'EQUAL');assert.equal(NONROUTINE_CATEGORY_STRATEGIES['试车'],'EQUAL');
  assert.equal(NONROUTINE_CATEGORY_STRATEGIES['人工除冰'],'UNDECIDED');assert.equal(NONROUTINE_CATEGORY_STRATEGIES['联合除冰'],'UNDECIDED');
  const worker=createMaintenanceTestAccount(template,{id:'category-compat-worker',name:'类别兼容验收工人'}),peer=createMaintenanceTestAccount(template,{id:'category-compat-peer',name:'类别兼容验收同伴'});
  const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie:rootCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
  const publish=(id,category,chapter,hours)=>{db.prepare("insert into maintenance_standards(id,status,revision,created_by,created_at,updated_at) values(?,'PUBLISHED',1,'fixture',?,?)").run(id,stamp,stamp);
    db.prepare("insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,generic_aircraft,status,admission_decision,effective_at,published_by,published_at,created_at) values(?,?,1,?,?,?, ?,?,'[\"A320\"]',0,'PUBLISHED','INCLUDE','2026-01-01','fixture','2026-01-01',?)").run(id+'-v1',id,category,chapter,id+'标准',id+'范围',hours,stamp);};
  publish('category-compat-test-drive','试车','995',1.5);
  publish('category-compat-third-party','三方附加','996',2);
  const flight=(await call('/api/maintenance/flights','POST',{date:'2026-11-06',flightNo:'CATEGORY-COMPAT-QA',aircraftNo:'B-CTG',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${flight.id}`,version=async()=>(await call(base)).flight.updatedAt;
  await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]});
  const driveItem={clientId:'category-compat-drive',temporary:true,manualManaged:true,standardId:'category-compat-test-drive',standardVersion:1,category:'试车',chapter:'995',title:'category-compat-test-drive标准',reportExplanation:'category-compat-test-drive范围',standardHours:1.5,entries:[{personId:worker.personId,role:'主做'}]};
  const thirdItem={clientId:'category-compat-third',temporary:true,manualManaged:true,standardId:'category-compat-third-party',standardVersion:1,category:'三方附加',chapter:'996',title:'category-compat-third-party标准',reportExplanation:'category-compat-third-party范围',standardHours:2,entries:[{personId:worker.personId,role:'主做'},{personId:peer.personId,role:'主做'}]};
  const legacyItem={clientId:'category-compat-legacy',temporary:true,manualManaged:true,standardId:'',category:'其他',chapter:'997',title:'类别兼容旧四类录入项',reportExplanation:'旧四类手工录入',standardHours:1,entries:[{personId:worker.personId,role:'主做'}]};
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED'],previous=flags.map(k=>process.env[k]);
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    const draft=(await call(base+'/reports/nonroutine/draft','PUT',{version:0,items:[driveItem,thirdItem,legacyItem]})).draft;
    await call(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft.version,items:[driveItem,thirdItem,legacyItem]});
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
  const subtasks=db.prepare('select category from maintenance_subtasks where flight_id=? order by title').all(flight.id);
  assert.deepEqual(subtasks.map(row=>row.category),['试车','三方附加','其他']);
  const hourRows=db.prepare('select person_id,role,hours,status from maintenance_hour_results where flight_id=? order by person_id,hours').all(flight.id);
  assert.equal(hourRows.length,3,'test-drive 1.5h plus third-party equal split 1h+1h');
  assert.deepEqual(hourRows.map(row=>row.hours).sort((a,b)=>a-b),[1,1,1.5]);
  assert.ok(hourRows.every(row=>row.role==='主做'));
  const caseRow=db.prepare("select count(*) n from maintenance_nonroutine_review_cases c join maintenance_subtasks s on s.id=c.subtask_id where c.flight_id=? and s.category='其他'").get(flight.id);
  assert.equal(Number(caseRow.n),1,'legacy UNDECIDED input defers to review instead of inventing allocation');
  const roleValues=new Set(db.prepare('select role from maintenance_assignments where flight_id=?').all(flight.id).map(row=>row.role).concat(hourRows.map(row=>row.role)));
  for(const category of Object.keys(NONROUTINE_CATEGORY_STRATEGIES))assert.ok(!roleValues.has(category),'category must never be stored as a dispatch/report role: '+category);
});

test('finalization compares real policy content across category changes with role verification and one-shot channels',async()=>{
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'],previous=flags.map(k=>process.env[k]);
  const template=db.prepare("select * from users where id='54002010'").get(),stamp=new Date().toISOString();
  const loginAs=async account=>{const r=await request('/api/login',{method:'POST',body:{username:account.username||account.id,password:'muc2026'}});assert.equal(r.res.statusCode,200);return String(r.res.headers['Set-Cookie']).split(';')[0];};
  const assignRole=(account,code)=>{const id=typeof account==='string'?account:account.id;const roleId=db.prepare('select id from rbac_roles where code=?').get(code).id;db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(id,roleId,stamp);};
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    const cookie=await loginAs(template),personId=template.person_id;
    const call=async(path,method='GET',body,useCookie=cookie)=>{const r=await request(path,{method,cookie:useCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
    const worker=createMaintenanceTestAccount(template,{id:'policy-compare-worker',name:'策略比对验收工人'}),peer=createMaintenanceTestAccount(template,{id:'policy-compare-peer',name:'策略比对验收同伴'});
    const reviewers=Array.from({length:12},(_,i)=>createMaintenanceTestAccount(template,{id:'policy-compare-reviewer-'+i,name:'策略比对评议'+i}));for(const reviewer of reviewers)assignRole(reviewer,'addon_nonroutine_reviewer');
    const finalizer=createMaintenanceTestAccount(template,{id:'policy-compare-finalizer',name:'策略比对终审'});assignRole(finalizer,'addon_nonroutine_review_finalizer');assignRole(finalizer,'addon_nonroutine_review_auditor');
    const periodResponsible=createMaintenanceTestAccount(template,{id:'policy-compare-period',name:'策略比对账期负责人'});assignRole(periodResponsible,'addon_maintenance_period_responsible');
    db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=?").run(periodResponsible.id);
    const finalizerCookie=await loginAs(finalizer);
    const periodUrl='/api/maintenance/hour-periods/2027-02';
    await call(periodUrl+'/assign','POST',{revision:0,accountId:periodResponsible.id,reason:'策略比对指定账期负责人'});
    await call(periodUrl+'/confirm','POST',{revision:1,state:'OPEN',reason:'策略比对开放当月'},await loginAs(periodResponsible));
    const seat=async caseId=>{const url=`/api/maintenance/nonroutine-reviews/${caseId}`;await call(url+'/accept','POST',{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:finalizer.id});for(const [index,reviewer] of reviewers.entries())await call(url+'/opinion','POST',{revision:0,hours:index+1,basis:'POLICY-PRIVATE-'+index},await loginAs(reviewer));return (await call(url,undefined,undefined,finalizerCookie)).review;};
    const openCase=async(flight,item)=>{const base=`/api/maintenance/flights/${flight.id}`,draft=(await call(base+'/reports/nonroutine/draft','PUT',{version:0,items:[item]})).draft;await call(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft.version,items:[item]});await call(base+'/reports/release','PUT',{expectedUpdatedAt:(await call(base)).flight.updatedAt});const report=(await call(base+'/reports')).report;await call(base+'/report-confirmation','POST',{expectedUpdatedAt:(await call(base)).flight.updatedAt,routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:personId});return db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id);};
    // ---- A (P0-67): field-only changes keep the frozen strategy and policy content identical. ----
    const flightA=(await call('/api/maintenance/flights','POST',{date:'2027-02-01',flightNo:'POLICY-FIELD-ONLY',aircraftNo:'B-PFA',aircraftType:'A320',workKind:'停场'})).flight;
    await call(`/api/maintenance/flights/${flightA.id}/dispatch`,'POST',{expectedUpdatedAt:flightA.updatedAt,assignments:[{role:'放行',personId}]});
    const itemA={clientId:'policy-field-item',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'981',title:'策略比对原名称',reportExplanation:'策略比对原范围',standardHours:2,entries:[{personId:worker.personId,role:'主做'}]};
    const caseA=await openCase(flightA,itemA);
    const sealedA=await seat(caseA.id);assert.equal(sealedA.state,'SEALED');
    const frozenA=JSON.parse(caseA.policy_json);
    const decisionA={revision:sealedA.revision,decision:{category:'单项工作',chapter:'981-XX',title:'策略比对新名称',workScope:'策略比对新范围',recognizedHours:2},participantsVerified:true,participants:[{personId:worker.personId,role:'主做'}],reason:'仅字段调整，策略未变',admissionDecision:'PENDING'};
    const previewA=(await call(`/api/maintenance/nonroutine-reviews/${caseA.id}/preview`,'POST',decisionA,finalizerCookie)).preview;
    assert.equal(previewA.policyChanged,false,'field-only change must not alter policy identity');
    assert.equal(previewA.policy.strategy,frozenA.strategy);assert.equal(previewA.policy.combination,frozenA.combination);
    assert.equal(previewA.policy.version,frozenA.version,'policy version must stay the frozen submission version');
    assert.ok(previewA.differences.length>=3);
    const finalA=(await call(`/api/maintenance/nonroutine-reviews/${caseA.id}/finalize`,'POST',{...decisionA,expectedPolicyToken:previewA.policyToken},finalizerCookie)).finalization;
    assert.equal(finalA.channel.state,'MERGED_CLOSED');
    assert.deepEqual(JSON.parse(db.prepare('select application_json from maintenance_nonroutine_review_cases where id=?').get(caseA.id).application_json),JSON.parse(caseA.application_json),'original application snapshot must stay untouched');
    const rowsA=db.prepare('select * from maintenance_hour_results where owner_id=?').all(caseA.subtask_id);
    assert.equal(rowsA.length,1);assert.equal(Number(rowsA[0].hours),2);assert.equal(rowsA[0].status,'待复核');
    // ---- B (P0-65): tow -> single-item compares real strategy/ratios/version and enforces role verification. ----
    const flightB=(await call('/api/maintenance/flights','POST',{date:'2027-02-02',flightNo:'POLICY-TOW-SWITCH',aircraftNo:'B-PFB',aircraftType:'A320',workKind:'停场'})).flight;
    await call(`/api/maintenance/flights/${flightB.id}/dispatch`,'POST',{expectedUpdatedAt:flightB.updatedAt,assignments:[{role:'放行',personId}]});
    const itemB={clientId:'policy-tow-item',temporary:true,manualManaged:true,standardId:'',category:'拖机',chapter:'982',title:'策略比对拖机项',reportExplanation:'拖机转单项策略比对',standardHours:3,entries:[{personId:worker.personId,role:'主做'},{personId:peer.personId,role:'主做'}]};
    const caseB=await openCase(flightB,itemB);
    const sealedB=await seat(caseB.id);
    const frozenB=JSON.parse(caseB.policy_json);
    assert.equal(frozenB.strategy,'EQUAL');assert.ok(frozenB.roleCombinationSnapshot?.combinations['主做+检验'],'tow snapshot must carry the full combination bank');
    const decisionB={revision:sealedB.revision,decision:{category:'单项工作',chapter:'982',title:'策略比对拖机项',workScope:'拖机转单项策略比对',recognizedHours:3},participantsVerified:true,participants:[{personId:worker.personId,role:'主做'},{personId:peer.personId,role:'检验'}],reason:'类别与角色核实后调整',admissionDecision:'PENDING'};
    const missingRoleReason={...decisionB,roleVerificationReason:undefined};
    delete missingRoleReason.roleVerificationReason;
    const rejected=await request(`/api/maintenance/nonroutine-reviews/${caseB.id}/finalize`,{method:'POST',cookie:finalizerCookie,body:{...missingRoleReason,expectedPolicyToken:'irrelevant-but-blocked-earlier'}});
    assert.ok([400,409].includes(rejected.res.statusCode),'changed roles without verification reason must be rejected: '+rejected.res.statusCode);
    assert.ok(String(rejected.payload.error).includes('核实'),'rejection must cite the verification requirement: '+rejected.payload.error);
    const previewB=(await call(`/api/maintenance/nonroutine-reviews/${caseB.id}/preview`,'POST',{...decisionB,roleVerificationReason:'线下核实peer本次为检验'},finalizerCookie)).preview;
    assert.equal(previewB.policyChanged,true,'category switch must surface a real policy identity change');
    assert.equal(previewB.policy.strategy,'ROLE_COMBINATION');assert.equal(previewB.policy.combination,'主做+检验');
    assert.equal(previewB.policy.ratios['主做'],frozenB.roleCombinationSnapshot.combinations['主做+检验']['主做'],'ratios must come from the frozen bank, not current config');
    assert.equal(previewB.rolesChanged,true);assert.equal(previewB.allocation.available,true);
    const sumRatios=Object.values(previewB.policy.ratios).reduce((s,v)=>s+v,0);assert.ok(Math.abs(sumRatios-1)<1e-8);
    const finalB=(await call(`/api/maintenance/nonroutine-reviews/${caseB.id}/finalize`,'POST',{...decisionB,roleVerificationReason:'线下核实peer本次为检验',expectedPolicyToken:previewB.policyToken},finalizerCookie)).finalization;
    assert.equal(finalB.channel.state,'MERGED_CLOSED',JSON.stringify(finalB));
    const rowsB=db.prepare('select role,hours from maintenance_hour_results where owner_id=? order by role').all(caseB.subtask_id);
    assert.equal(rowsB.length,2);assert.equal(rowsB[0].role,'主做');assert.equal(rowsB[1].role,'检验');
    assert.ok(Math.abs(rowsB[0].hours-3*previewB.policy.ratios['主做'])<1e-6&&Math.abs(rowsB[1].hours-3*previewB.policy.ratios['检验'])<1e-6);
    assert.deepEqual(JSON.parse(db.prepare('select participants_json from maintenance_nonroutine_review_cases where id=?').get(caseB.id).participants_json).map(p=>p.role),['主做','主做'],'original participant snapshot keeps tow-era roles');
    // ---- C (P0-66): confirmed opportunity finalizes a category/strategy change through the one-shot adjustment channel. ----
    const flightC=(await call('/api/maintenance/flights','POST',{date:'2027-02-03',flightNo:'POLICY-CONFIRMED-SWITCH',aircraftNo:'B-PFC',aircraftType:'A320',workKind:'航后'})).flight,baseC=`/api/maintenance/flights/${flightC.id}`,versionC=async()=>(await call(baseC)).flight.updatedAt;
    await call(baseC+'/dispatch','POST',{expectedUpdatedAt:flightC.updatedAt,assignments:[{role:'放行',personId},{role:'接机',personId:worker.personId}]});
    db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flightC.id);
    const itemC={clientId:'policy-confirmed-item',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'983',title:'策略比对已确认项',reportExplanation:'已确认后类别策略变化',standardHours:3,entries:[{personId:worker.personId,role:'主做'}]},draftC=(await call(baseC+'/reports/nonroutine/draft','PUT',{version:0,items:[itemC]})).draft;
    await call(baseC+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draftC.version,items:[itemC]});
    const routineEntries=[{role:'接机',personId:worker.personId}];
    await call(baseC+'/reports/routine','PUT',{expectedUpdatedAt:await versionC(),entries:routineEntries});
    await call(baseC+'/reports/release','PUT',{expectedUpdatedAt:await versionC()});
    const reportC=(await call(baseC+'/reports')).report;
    await call(baseC+'/report-confirmation','POST',{expectedUpdatedAt:await versionC(),routineEntries,nonroutineItems:reportC.nonroutine.items,releasePersonId:personId});
    const treeC=(await call(baseC+'/review')).review;
    await call(baseC+'/review','PUT',{mode:'confirm',expectedUpdatedAt:treeC.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:treeC.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))});
    assert.equal((await call(baseC)).flight.status,'已确认');
    const originalC={hours:db.prepare('select * from maintenance_hour_results where flight_id=? order by id').all(flightC.id),sorties:db.prepare('select * from maintenance_sortie_results where flight_id=? order by id').all(flightC.id),application:db.prepare('select application_json,participants_json from maintenance_nonroutine_review_cases where flight_id=?').get(flightC.id)};
    const caseC=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(flightC.id);
    const sealedC=await seat(caseC.id);
    const decisionC={revision:sealedC.revision,decision:{category:'试车',chapter:'983',title:'策略比对已确认项',workScope:'已确认后类别策略变化',recognizedHours:2.5},participantsVerified:true,participants:[{personId:worker.personId,role:'主做'}],reason:'类别核实为试车，原参与人单人均分认定',admissionDecision:'PENDING'};
    const previewC=(await call(`/api/maintenance/nonroutine-reviews/${caseC.id}/preview`,'POST',decisionC,finalizerCookie)).preview;
    assert.equal(previewC.policyChanged,true);assert.equal(previewC.policy.strategy,'EQUAL');
    const finalC=(await call(`/api/maintenance/nonroutine-reviews/${caseC.id}/finalize`,'POST',{...decisionC,expectedPolicyToken:previewC.policyToken},finalizerCookie)).finalization;
    assert.equal(finalC.channel.state,'ADJUSTED_CLOSED',JSON.stringify(finalC));
    const adjustmentsC=db.prepare('select * from maintenance_nonroutine_hour_adjustments where case_id=? order by person_id').all(caseC.id);
    assert.equal(adjustmentsC.length,1);assert.ok(adjustmentsC.every(row=>Math.abs(Number(row.hours)-2.5)<1e-6&&row.status==='已确认'&&row.source==='审核补记'));
    const effectiveC=db.prepare('select * from maintenance_effective_hour_results where owner_id=? order by id').all(caseC.subtask_id);
    assert.equal(effectiveC.length,1,'confirmed net total must include the traceable adjustment through the unified view');
    assert.equal(Number(effectiveC[0].hours),2.5);assert.equal(effectiveC[0].source,'审核补记');
    assert.deepEqual(db.prepare('select * from maintenance_hour_results where flight_id=? order by id').all(flightC.id),originalC.hours,'confirmed original reporting must stay byte-identical');
    assert.deepEqual(db.prepare('select * from maintenance_sortie_results where flight_id=? order by id').all(flightC.id),originalC.sorties);
    assert.deepEqual(db.prepare('select application_json,participants_json from maintenance_nonroutine_review_cases where flight_id=?').get(flightC.id),originalC.application);
    // ---- D: undecidable target category suspends legitimately instead of inventing allocation. ----
    const flightD=(await call('/api/maintenance/flights','POST',{date:'2027-02-04',flightNo:'POLICY-UNDECIDED-SUSPEND',aircraftNo:'B-PFD',aircraftType:'A320',workKind:'停场'})).flight;
    await call(`/api/maintenance/flights/${flightD.id}/dispatch`,'POST',{expectedUpdatedAt:flightD.updatedAt,assignments:[{role:'放行',personId}]});
    const itemD={clientId:'policy-undecided-item',temporary:true,manualManaged:true,standardId:'',category:'其他',chapter:'984',title:'策略比对待定项',reportExplanation:'待定类别挂起比对',standardHours:2,entries:[{personId:worker.personId,role:'主做'}]};
    const caseD=await openCase(flightD,itemD);
    const sealedD=await seat(caseD.id);
    const decisionD={revision:sealedD.revision,decision:{category:'联合除冰',chapter:'984',title:'策略比对待定项',workScope:'待定类别挂起比对',recognizedHours:2},participantsVerified:true,participants:[{personId:worker.personId,role:'主做'}],reason:'类别暂定联合除冰',admissionDecision:'PENDING'};
    const previewD=(await call(`/api/maintenance/nonroutine-reviews/${caseD.id}/preview`,'POST',decisionD,finalizerCookie)).preview;
    assert.equal(previewD.policy.strategy,'UNDECIDED');
    const finalD=(await call(`/api/maintenance/nonroutine-reviews/${caseD.id}/finalize`,'POST',{...decisionD,expectedPolicyToken:previewD.policyToken},finalizerCookie)).finalization;
    assert.equal(finalD.channel.state,'NEEDS_ATTENTION');
    assert.equal(finalD.attempts.at(-1).detail.code,'ALLOCATION_INPUTS_UNRESOLVED','missing rule must suspend, not invent allocation');
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where owner_id=?').get(caseD.subtask_id).n),0);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_hour_adjustments where case_id=?').get(caseD.id).n),0);
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
});

test('unique finalization channel and confirmed-status protection survive concurrent dispatch and rule publication',async()=>{
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'],previous=flags.map(k=>process.env[k]);
  const template=db.prepare("select * from users where id='54002010'").get(),stamp=new Date().toISOString();
  const loginAs=async account=>{const r=await request('/api/login',{method:'POST',body:{username:account.username||account.id,password:'muc2026'}});assert.equal(r.res.statusCode,200);return String(r.res.headers['Set-Cookie']).split(';')[0];};
  const assignRole=(account,code)=>{const id=typeof account==='string'?account:account.id;const roleId=db.prepare('select id from rbac_roles where code=?').get(code).id;db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(id,roleId,stamp);};
  const ruleRows=db.prepare("select name,value from maintenance_hour_rules where rule_type='nonroutineCombinationRatio' order by name").all();
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    const cookie=await loginAs(template),personId=template.person_id;
    const call=async(path,method='GET',body,useCookie=cookie)=>{const r=await request(path,{method,cookie:useCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
    const worker=createMaintenanceTestAccount(template,{id:'unique-channel-worker',name:'唯一通道验收工人'});
    const reviewers=Array.from({length:12},(_,i)=>createMaintenanceTestAccount(template,{id:'unique-channel-reviewer-'+i,name:'唯一通道评议'+i}));for(const reviewer of reviewers)assignRole(reviewer,'addon_nonroutine_reviewer');
    const finalizer=createMaintenanceTestAccount(template,{id:'unique-channel-finalizer',name:'唯一通道终审'});assignRole(finalizer,'addon_nonroutine_review_finalizer');assignRole(finalizer,'addon_nonroutine_review_auditor');
    const periodResponsible=createMaintenanceTestAccount(template,{id:'unique-channel-period',name:'唯一通道账期负责人'});assignRole(periodResponsible,'addon_maintenance_period_responsible');
    db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=?").run(periodResponsible.id);
    const finalizerCookie=await loginAs(finalizer);
    const periodUrl='/api/maintenance/hour-periods/2027-03';
    await call(periodUrl+'/assign','POST',{revision:0,accountId:periodResponsible.id,reason:'唯一通道指定账期负责人'});
    await call(periodUrl+'/confirm','POST',{revision:1,state:'OPEN',reason:'唯一通道开放当月'},await loginAs(periodResponsible));
    const setup=async(flightNo,itemChapter,itemTitle)=>{
      const flight=(await call('/api/maintenance/flights','POST',{date:'2027-03-01',flightNo,aircraftNo:'B-UCQ',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${flight.id}`;
      await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]});
      const item={clientId:'unique-channel-'+itemChapter,temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:itemChapter,title:itemTitle,reportExplanation:'唯一通道验收',standardHours:2,entries:[{personId:worker.personId,role:'主做'}]},draft=(await call(base+'/reports/nonroutine/draft','PUT',{version:0,items:[item]})).draft;
      await call(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft.version,items:[item]});
      await call(base+'/reports/release','PUT',{expectedUpdatedAt:(await call(base)).flight.updatedAt});
      const report=(await call(base+'/reports')).report;
      await call(base+'/report-confirmation','POST',{expectedUpdatedAt:(await call(base)).flight.updatedAt,routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:personId});
      const caseId=db.prepare('select id from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id).id,url=`/api/maintenance/nonroutine-reviews/${caseId}`;
      await call(url+'/accept','POST',{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:finalizer.id});
      for(const [index,reviewer] of reviewers.entries())await call(url+'/opinion','POST',{revision:0,hours:index+1,basis:'UNIQUE-PRIVATE-'+index},await loginAs(reviewer));
      return {flight,base,caseId,url,sealed:(await call(url,undefined,undefined,finalizerCookie)).review};
    };
    const decide=(review,hours,reason)=>({revision:review.revision,decision:{category:'单项工作',chapter:'991',title:review.application?.title||'唯一通道项',workScope:'唯一通道验收',recognizedHours:hours},participantsVerified:true,participants:[{personId:worker.personId,role:'主做'}],reason,admissionDecision:'PENDING'});
    // ---- P0-93: rule publication racing finalization never overrides the frozen policy; retries never double-post. ----
    const A=await setup('UNIQUE-RULE-RACE','991','规则竞态项');
    const frozenA=JSON.parse(db.prepare('select policy_json from maintenance_nonroutine_review_cases where id=?').get(A.caseId).policy_json);
    const changing=ruleRows.find(row=>row.name==='主做+检验::主做');
    const previewA=(await call(A.url+'/preview','POST',decide(A.sealed,2,'规则竞态终审认定'),finalizerCookie)).preview;
    for(let round=0;round<5;round++){
      db.prepare("update maintenance_hour_rules set value=? where rule_type='nonroutineCombinationRatio' and name=?").run(String(0.4+round*0.05),changing.name);
      const outcome=round===0
        ?await Promise.all([request(A.url+'/finalize',{method:'POST',cookie:finalizerCookie,body:{...decide(A.sealed,2,'规则竞态终审认定'),expectedPolicyToken:previewA.policyToken}}),request('/api/maintenance/flights',{method:'POST',cookie,body:{date:'2027-03-01',flightNo:'UNIQUE-RACE-EVENT-'+round,aircraftNo:'B-EVT',aircraftType:'A320',workKind:'停场'}})])
        :await Promise.all([request(A.url+'/sync',{method:'POST',cookie:finalizerCookie,body:{}}),request('/api/maintenance/flights',{method:'POST',cookie,body:{date:'2027-03-01',flightNo:'UNIQUE-RACE-EVENT-'+round,aircraftNo:'B-EVT',aircraftType:'A320',workKind:'停场'}})]);
      for(const r of outcome)assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));
    }
    const finalRowA=db.prepare('select * from maintenance_nonroutine_review_finals where case_id=?').get(A.caseId);
    const finalPolicyA=JSON.parse(finalRowA.policy_json);
    assert.equal(finalPolicyA.version,frozenA.version,'rule publication during finalize must not override the frozen version');
    assert.equal(finalPolicyA.ratios['主做'],frozenA.ratios['主做']);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_finals where case_id=?').get(A.caseId).n),1);
    const postedA=db.prepare('select * from maintenance_hour_results where owner_id=?').all(A.caseId?db.prepare('select subtask_id from maintenance_nonroutine_review_cases where id=?').get(A.caseId).subtask_id:null);
    assert.equal(postedA.length,1,'five racing rounds must still yield exactly one posting');
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_sync_attempts ch join maintenance_nonroutine_review_channels c on c.id=ch.channel_id where c.case_id=?').get(A.caseId).n),1,'exactly one sync attempt recorded');
    // ---- P0-119: concurrent finalization with different bodies leaves one winner and no partial write. ----
    const B=await setup('UNIQUE-DOUBLE-FINALIZE','992','双审定竞态项');
    const bodyOne=decide(B.sealed,2,'第一裁定版本'),bodyTwo=decide(B.sealed,2.5,'第二裁定版本');
    const tokenOne=(await call(B.url+'/preview','POST',bodyOne,finalizerCookie)).preview.policyToken;
    const tokenTwo=(await call(B.url+'/preview','POST',bodyTwo,finalizerCookie)).preview.policyToken;
    const race=await Promise.all([
      request(B.url+'/finalize',{method:'POST',cookie:finalizerCookie,body:{...bodyOne,expectedPolicyToken:tokenOne}}),
      request(B.url+'/finalize',{method:'POST',cookie:finalizerCookie,body:{...bodyTwo,expectedPolicyToken:tokenTwo}})
    ]);
    const winners=race.filter(r=>r.res.statusCode===200),losers=race.filter(r=>r.res.statusCode===409);
    assert.equal(winners.length,1,'exactly one concurrent finalization may win');assert.equal(losers.length,1);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_finals where case_id=?').get(B.caseId).n),1);
    const subtaskB=db.prepare('select subtask_id from maintenance_nonroutine_review_cases where id=?').get(B.caseId).subtask_id;
    const postedB=db.prepare('select * from maintenance_hour_results where owner_id=?').all(subtaskB);
    assert.equal(postedB.length,1);assert.ok([2,2.5].includes(Number(postedB[0].hours)));
    // Database-level uniqueness backs the API guard.
    const duplicate=()=>{const row=db.prepare('select * from maintenance_nonroutine_review_finals where case_id=?').get(B.caseId);db.prepare(`insert into maintenance_nonroutine_review_finals(id,case_id,approved_revision,input_digest,decision_json,participants_json,policy_json,opinion_versions_json,statistics_json,reason,role_verification_reason,admission_decision,finalized_by,created_at) values(${'?,?,?,?,?,?,?,?,?,?,?,?,?,?'})`).run('unique-channel-dup',...[row.case_id,row.approved_revision,row.input_digest,row.decision_json,row.participants_json,row.policy_json,row.opinion_versions_json,row.statistics_json,row.reason,row.role_verification_reason,row.admission_decision,row.finalized_by,row.created_at]);};
    assert.throws(duplicate,Error,'case_id unique constraint must reject duplicate finals at the database level');
    // ---- P0-114: confirmed status never downgrades through SSE-driven reconciliation or review re-save. ----
    const treeA=(await call(A.base+'/review')).review;
    await call(A.base+'/review','PUT',{mode:'confirm',expectedUpdatedAt:treeA.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:treeA.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))});
    const confirmedSnapshot={flight:db.prepare('select status from maintenance_flights where id=?').get(A.flight.id).status,hours:db.prepare('select id,status,hours from maintenance_hour_results where owner_id=?').all(db.prepare('select subtask_id from maintenance_nonroutine_review_cases where id=?').get(A.caseId).subtask_id)};
    assert.equal(confirmedSnapshot.flight,'已确认');assert.ok(confirmedSnapshot.hours.every(row=>row.status==='已确认'));
    for(let i=0;i<3;i++)await call('/api/maintenance/flights','POST',{date:'2027-03-02',flightNo:'UNIQUE-SSE-REPLAY-'+i,aircraftNo:'B-EVT2',aircraftType:'A320',workKind:'停场'});
    await new Promise(resolve=>setTimeout(resolve,300));
    assert.equal(db.prepare('select status from maintenance_flights where id=?').get(A.flight.id).status,'已确认','SSE replay must not downgrade confirmed flights');
    assert.deepEqual(db.prepare('select id,status,hours from maintenance_hour_results where owner_id=?').all(db.prepare('select subtask_id from maintenance_nonroutine_review_cases where id=?').get(A.caseId).subtask_id),confirmedSnapshot.hours,'posted confirmed rows must stay untouched');
  } finally {
    for(const row of ruleRows)db.prepare("update maintenance_hour_rules set value=? where rule_type='nonroutineCombinationRatio' and name=?").run(row.value,row.name);
    flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});
  }
});

test('seven role-subset combinations allocate through one shared ratio config with exact cents conservation',async()=>{
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],template=db.prepare("select * from users where id='54002010'").get(),personId=login.payload.user.personId,stamp=new Date().toISOString();
  const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
  const people=Array.from({length:8},(_,i)=>createMaintenanceTestAccount(template,{id:'subset-alloc-worker-'+i,name:'组合分配验收'+i}));
  const ruleValue=(combo,role)=>Number(db.prepare("select value from maintenance_hour_rules where rule_type='nonroutineCombinationRatio' and name=?").get(combo+'::'+role)?.value);
  const expectedSplits=(rolesPresent,presentCounts,hours)=>{
    const totalCents=Math.round(hours*100),roleOrder=['主做','检验','辅助'].filter(role=>rolesPresent.includes(role));
    const comboName=roleOrder.join('+');
    const raw=roleOrder.map(role=>totalCents*ruleValue(comboName,role));
    const cents=raw.map(Math.floor);
    const order=raw.map((value,index)=>({index,fraction:value-cents[index]})).sort((left,right)=>right.fraction-left.fraction||left.index-right.index);
    for(let remaining=totalCents-cents.reduce((sum,value)=>sum+value,0),index=0;remaining>0;remaining--,index++)cents[order[index].index]++;
    const expected={};
    roleOrder.forEach((role,index)=>{const count=presentCounts[role],shared=Math.floor(cents[index]/count),remainder=cents[index]%count;expected[role]=Array.from({length:count},(_,i)=>shared+(i<remainder?1:0));});
    return expected;
  };
  const publish=(id,category,hours)=>{db.prepare("insert into maintenance_standards(id,status,revision,created_by,created_at,updated_at) values(?,'PUBLISHED',1,'fixture',?,?)").run(id,stamp,stamp);
    db.prepare("insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,generic_aircraft,status,admission_decision,effective_at,published_by,published_at,created_at) values(?,?,1,?,?,?, ?,?,'[\"A320\"]',0,'PUBLISHED','INCLUDE','2026-01-01','fixture','2026-01-01',?)").run(id+'-v1',id,category,'990',id+'标准',id+'范围',hours,stamp);};
  const cases=[
    {key:'only-main-3',category:'单项工作',hours:1,entries:[{p:0,role:'主做'},{p:1,role:'主做'},{p:2,role:'主做'}]},
    {key:'only-inspect',category:'单项工作',hours:0.5,entries:[{p:3,role:'检验'}]},
    {key:'only-assist-2',category:'单项工作',hours:0.7,entries:[{p:4,role:'辅助'},{p:5,role:'辅助'}]},
    {key:'main3-inspect1',category:'单项工作',hours:2,entries:[{p:0,role:'主做'},{p:1,role:'主做'},{p:2,role:'主做'},{p:3,role:'检验'}]},
    {key:'main-assist',category:'单项工作',hours:1,entries:[{p:6,role:'主做'},{p:4,role:'辅助'}]},
    {key:'inspect-assist',category:'单项工作',hours:1,entries:[{p:3,role:'检验'},{p:5,role:'辅助'}]},
    {key:'all-three',category:'单项工作',hours:1,entries:[{p:7,role:'主做'},{p:6,role:'检验'},{p:5,role:'辅助'}]},
    {key:'card-twin',category:'工卡指令',hours:1,entries:[{p:7,role:'主做'},{p:6,role:'检验'}]},
    {key:'work-twin',category:'单项工作',hours:1,entries:[{p:2,role:'主做'},{p:1,role:'检验'}]}
  ];
  for(const c of cases)publish('subset-alloc-'+c.key,c.category,c.hours);
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED'],previous=flags.map(k=>process.env[k]);
  let flight,base;
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    flight=(await call('/api/maintenance/flights','POST',{date:'2027-03-05',flightNo:'SUBSET-ALLOC-QA',aircraftNo:'B-SSA',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${flight.id}`;
    await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]});
    const items=cases.map(c=>({clientId:'subset-'+c.key,temporary:true,manualManaged:true,standardId:'subset-alloc-'+c.key,standardVersion:1,category:c.category,chapter:'990',title:'subset-alloc-'+c.key+'标准',reportExplanation:'subset-alloc-'+c.key+'范围',standardHours:c.hours,entries:c.entries.map(e=>({personId:people[e.p].personId,role:e.role}))}));
    const draft=(await call(base+'/reports/nonroutine/draft','PUT',{version:0,items})).draft;
    await call(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft.version,items});
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
  const roleSums={};
  // Map items to subtasks by title, then verify per-role cents against the mirrored original algorithm.
  const rowsByTitle={};
  for(const row of db.prepare(`select st.title,r.person_id,r.role,r.hours from maintenance_hour_results r join maintenance_subtasks st on st.id=r.owner_id where r.flight_id=?`).all(flight.id)){
    (rowsByTitle[row.title]=rowsByTitle[row.title]||[]).push(row);
  }
  const titleFor=Object.fromEntries(cases.map(c=>[c.key,'subset-alloc-'+c.key+'标准']));
  for(const c of cases){
    const rows=rowsByTitle[titleFor[c.key]];
    assert.ok(rows&&rows.length===c.entries.length,c.key+' row count '+ (rows?.length));
    assert.equal(new Set(rows.map(row=>row.person_id)).size,rows.length,c.key+' persons unique');
    const counts={};for(const e of c.entries)counts[e.role]=(counts[e.role]||0)+1;
    const expected=expectedSplits(Object.keys(counts),counts,c.hours);
    const totalCents=Math.round(c.hours*100);
    assert.equal(Math.round(rows.reduce((sum,row)=>sum+row.hours,0)*100),totalCents,c.key+' cents conserved');
    for(const role of Object.keys(expected)){
      const roleRows=rows.filter(row=>row.role===role);
      assert.equal(roleRows.length,counts[role],c.key+' '+role+' row count');
      const actual=roleRows.map(row=>Math.round(row.hours*100)).sort((a,b)=>a-b);
      const want=[...expected[role]].sort((a,b)=>a-b);
      assert.deepEqual(actual,want,c.key+' '+role+' split '+JSON.stringify({actual,want}));
      roleSums[c.key+'::'+role]=actual.reduce((s,v)=>s+v,0);
    }
  }
  assert.equal(roleSums['card-twin::主做'],roleSums['work-twin::主做'],'工卡指令与单项工作必须共用同一组合比例');
  assert.equal(roleSums['card-twin::检验'],roleSums['work-twin::检验']);
});

test('submitted report results start at 已提报 and migrate only through the original finalization chain',async()=>{
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],template=db.prepare("select * from users where id='54002010'").get(),personId=login.payload.user.personId,stamp=new Date().toISOString();
  const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
  const worker=createMaintenanceTestAccount(template,{id:'status-lifecycle-worker',name:'状态生命周期验收工人'});
  const standardId='status-lifecycle-standard';
  db.prepare("insert into maintenance_standards(id,status,revision,created_by,created_at,updated_at) values(?,'PUBLISHED',1,'fixture',?,?)").run(standardId,stamp,stamp);
  db.prepare("insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,generic_aircraft,status,admission_decision,effective_at,published_by,published_at,created_at) values(?,?,1,'单项工作','989','状态生命周期标准','状态生命周期范围',2,'[\"A320\"]',0,'PUBLISHED','INCLUDE','2026-01-01','fixture','2026-01-01',?)").run(standardId+'-v1',standardId,stamp);
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED'],previous=flags.map(k=>process.env[k]);
  const flight=(await call('/api/maintenance/flights','POST',{date:'2027-03-06',flightNo:'STATUS-LIFECYCLE-QA',aircraftNo:'B-SLQ',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${flight.id}`,version=async()=>(await call(base)).flight.updatedAt;
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]});
    const item={clientId:'status-lifecycle-item',temporary:true,manualManaged:true,standardId,standardVersion:1,category:'单项工作',chapter:'989',title:'状态生命周期标准',reportExplanation:'状态生命周期范围',standardHours:2,entries:[{personId:worker.personId,role:'主做'}]},draft=(await call(base+'/reports/nonroutine/draft','PUT',{version:0,items:[item]})).draft;
    await call(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft.version,items:[item]});
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
  const subtaskId=db.prepare('select id from maintenance_subtasks where flight_id=?').get(flight.id).id;
  const rowsAt=()=>db.prepare('select status from maintenance_hour_results where owner_id=?').all(subtaskId).map(row=>row.status);
  assert.deepEqual(rowsAt(),['已提报'],'submission must land results at 已提报, never 待复核 directly');
  await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});
  const report=(await call(base+'/reports')).report;
  await call(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:personId});
  assert.deepEqual(rowsAt(),['待复核'],'overall report confirmation moves results to 待复核');
  const tree=(await call(base+'/review')).review;
  await call(base+'/review','PUT',{mode:'confirm',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))});
  assert.deepEqual(rowsAt(),['已确认'],'review confirmation completes the original chain');
});

test('imported incomplete drafts stay dormant until completed while concurrent submits create exactly one batch and case set',async()=>{
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],template=db.prepare("select * from users where id='54002010'").get(),personId=login.payload.user.personId;
  const worker=createMaintenanceTestAccount(template,{id:'import-submit-worker',name:'导入提交验收工人'});
  const identity={date:'2027-03-07',flightNo:'IMPORT-SUBMIT-QA',aircraftNo:'B-ISQ',aircraftType:'A320',workKind:'停场'};
  const flight=(await request('/api/maintenance/flights',{method:'POST',cookie,body:identity})).payload.flight,base=`/api/maintenance/flights/${flight.id}`,version=async()=>(await request(base,{cookie})).payload.flight.updatedAt;
  const content=["date,aircraftNo,workKind,flightNo,title,standardHours,工作内容及范围",
    `${identity.date},${identity.aircraftNo},${identity.workKind},${identity.flightNo},导入提交工作甲,2,甲的范围`,
    `${identity.date},${identity.aircraftNo},${identity.workKind},${identity.flightNo},,,仅文字乙无名称无时长`].join("\n");
  const file={filename:'import-submit.csv',contentBase64:Buffer.from(content).toString('base64')};
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED'],previous=flags.map(k=>process.env[k]);
  const business=['maintenance_subtasks','maintenance_report_batches','maintenance_hour_results','maintenance_sortie_results','maintenance_nonroutine_review_cases'];
  const facts=()=>business.map(table=>JSON.stringify(db.prepare(`select * from ${table} where flight_id=? order by id`).all(flight.id)));
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    const preview=await request('/api/maintenance/subtasks/import/files/preview',{method:'POST',cookie,body:file});
    assert.equal(preview.res.statusCode,200,JSON.stringify(preview.payload));
    assert.equal(preview.payload.results.length,2,JSON.stringify(preview.payload.results));
    const batchUrl=`/api/maintenance/subtasks/import/batches/${preview.payload.batchId}`;
    const rows={requestId:'import-submit-once',revision:preview.payload.revision,rows:preview.payload.results.map(({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest})=>({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest}))};
    const committed=await request(batchUrl+'/commit',{method:'POST',cookie,body:rows});
    assert.equal(committed.res.statusCode,200,JSON.stringify(committed.payload));
    assert.equal(committed.payload.summary.created,2,JSON.stringify(committed.payload));
    const saved=db.prepare('select * from maintenance_report_drafts where flight_id=?').get(flight.id);
    const draft=JSON.parse(saved.payload_json);
    assert.equal(draft.items.length,2);
    assert.equal(draft.items[1].title,'');assert.ok(draft.items[1].reportExplanation.includes('仅文字乙'));
    assert.equal(JSON.parse(db.prepare('select payload_json from maintenance_report_drafts where flight_id=?').get(flight.id).payload_json).items.length,2);
    // Import commit must not touch business tables (compare against pre-import state).
    assert.equal(Number(db.prepare('select count(*) n from maintenance_subtasks where flight_id=?').get(flight.id).n),0);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_report_batches where flight_id=?').get(flight.id).n),0);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id).n),0);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(flight.id).n),0);
    await request(base+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:await version(),assignments:[{role:'放行',personId}]}});
    // Formal submission of a still-incomplete item must be blocked before any batch/case exists.
    const blocked=await request(base+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'submit',draftVersion:saved.version,items:draft.items}});
    assert.ok([400,409].includes(blocked.res.statusCode),JSON.stringify(blocked.payload));
    assert.equal(Number(db.prepare('select count(*) n from maintenance_report_batches where flight_id=?').get(flight.id).n),0);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id).n),0);
    // Complete both items, then fire two concurrent formal submissions with the same draft version.
    const completed=draft.items.map((item,index)=>({...item,temporary:true,id:undefined,...(index===0?{category:'单项工作',chapter:'993',standardHours:2}:{category:'单项工作',chapter:'994',title:'导入提交工作乙',standardHours:1}),entries:[{personId:worker.personId,role:'主做'}]}));
    const edited=await request(base+'/reports/nonroutine/draft',{method:'PUT',cookie,body:{version:saved.version,items:completed}});
    assert.equal(edited.res.statusCode,200,JSON.stringify(edited.payload));
    const submitBody={mode:'submit',draftVersion:edited.payload.draft.version,items:completed};
    const race=await Promise.all([
      request(base+'/reports/nonroutine',{method:'PUT',cookie,body:submitBody}),
      request(base+'/reports/nonroutine',{method:'PUT',cookie,body:submitBody})
    ]);
    const winners=race.filter(r=>r.res.statusCode>=200&&r.res.statusCode<300),conflicts=race.filter(r=>r.res.statusCode===409);
    assert.equal(winners.length,1,'exactly one concurrent submission may win: '+JSON.stringify(race.map(r=>({s:r.res.statusCode,b:r.payload}))));
    assert.equal(conflicts.length,1);
    assert.equal(Number(db.prepare("select count(*) n from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(flight.id).n),1,'no duplicate batches');
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id).n),2,'exactly one review case per item');
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(flight.id).n),0,'unreviewed imports post no hours');
    const replay=await request(base+'/reports/nonroutine',{method:'PUT',cookie,body:submitBody});
    assert.ok([400,409].includes(replay.res.statusCode));
    assert.equal(Number(db.prepare("select count(*) n from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(flight.id).n),1);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id).n),2);
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
});

test('review finalization at the submitted stage posts into the original chain and promotes exactly once',async()=>{
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'],previous=flags.map(k=>process.env[k]);
  const template=db.prepare("select * from users where id='54002010'").get(),stamp=new Date().toISOString();
  const loginAs=async account=>{const r=await request('/api/login',{method:'POST',body:{username:account.username||account.id,password:'muc2026'}});assert.equal(r.res.statusCode,200);return String(r.res.headers['Set-Cookie']).split(';')[0];};
  const assignRole=(account,code)=>{const id=typeof account==='string'?account:account.id;const roleId=db.prepare('select id from rbac_roles where code=?').get(code).id;db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(id,roleId,stamp);};
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    const cookie=await loginAs(template),personId=template.person_id;
    const call=async(path,method='GET',body,useCookie=cookie)=>{const r=await request(path,{method,cookie:useCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
    const worker=createMaintenanceTestAccount(template,{id:'submitted-stage-worker',name:'已提报时点验收工人'});
    const reviewers=Array.from({length:12},(_,i)=>createMaintenanceTestAccount(template,{id:'submitted-stage-reviewer-'+i,name:'已提报时点评议'+i}));for(const reviewer of reviewers)assignRole(reviewer,'addon_nonroutine_reviewer');
    const finalizer=createMaintenanceTestAccount(template,{id:'submitted-stage-finalizer',name:'已提报时点终审'});assignRole(finalizer,'addon_nonroutine_review_finalizer');assignRole(finalizer,'addon_nonroutine_review_auditor');
    const periodResponsible=createMaintenanceTestAccount(template,{id:'submitted-stage-period',name:'已提报时点账期负责人'});assignRole(periodResponsible,'addon_maintenance_period_responsible');
    db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=?").run(periodResponsible.id);
    const finalizerCookie=await loginAs(finalizer);
    const periodUrl='/api/maintenance/hour-periods/2027-04';
    await call(periodUrl+'/assign','POST',{revision:0,accountId:periodResponsible.id,reason:'已提报时点指定账期负责人'});
    await call(periodUrl+'/confirm','POST',{revision:1,state:'OPEN',reason:'已提报时点开放当月'},await loginAs(periodResponsible));
    const flight=(await call('/api/maintenance/flights','POST',{date:'2027-04-01',flightNo:'SUBMITTED-STAGE-QA',aircraftNo:'B-SSG',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${flight.id}`,version=async()=>(await call(base)).flight.updatedAt;
    await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]});
    const item={clientId:'submitted-stage-item',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'995',title:'已提报时点未收录项',reportExplanation:'已提报时点场景',standardHours:2,entries:[{personId:worker.personId,role:'主做'}]},draft=(await call(base+'/reports/nonroutine/draft','PUT',{version:0,items:[item]})).draft;
    await call(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft.version,items:[item]});
    assert.equal((await call(base)).flight.status,'已提报','flight stays at the submitted stage');
    const caseId=db.prepare('select id from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id).id,url=`/api/maintenance/nonroutine-reviews/${caseId}`;
    await call(url+'/accept','POST',{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:finalizer.id});
    for(const [index,reviewer] of reviewers.entries())await call(url+'/opinion','POST',{revision:0,hours:index+1,basis:'SUBMITTED-PRIVATE-'+index},await loginAs(reviewer));
    const sealed=(await call(url,undefined,undefined,finalizerCookie)).review;
    const decision={revision:sealed.revision,decision:{category:'单项工作',chapter:'995',title:item.title,workScope:item.reportExplanation,recognizedHours:2},participantsVerified:true,participants:[{personId:worker.personId,role:'主做'}],reason:'已提报时点终审认定',admissionDecision:'PENDING'};
    const preview=(await call(url+'/preview','POST',decision,finalizerCookie)).preview;
    const finalization=(await call(url+'/finalize','POST',{...decision,expectedPolicyToken:preview.policyToken},finalizerCookie)).finalization;
    assert.equal(finalization.channel.state,'MERGED_CLOSED',JSON.stringify(finalization));
    const subtaskId=db.prepare('select subtask_id from maintenance_nonroutine_review_cases where id=?').get(caseId).subtask_id;
    const posted=db.prepare('select * from maintenance_hour_results where owner_id=?').all(subtaskId);
    assert.equal(posted.length,1);assert.equal(posted[0].status,'已提报','P0-94: submitted-stage posting keeps 已提报, never jumps to 待复核');
    assert.equal((await call(base)).flight.status,'已提报','opportunity keeps flowing normally');
    // The original chain then promotes the same row exactly once.
    await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});
    const report=(await call(base+'/reports')).report;
    await call(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:personId});
    const promotedOnce=db.prepare('select * from maintenance_hour_results where owner_id=?').all(subtaskId);
    assert.equal(promotedOnce.length,1,'exactly one result row after confirmation');
    assert.equal(promotedOnce[0].person_id,posted[0].person_id);assert.equal(Number(promotedOnce[0].hours),Number(posted[0].hours));
    assert.ok(['待复核','已确认'].includes(promotedOnce[0].status));
    const tree=(await call(base+'/review')).review;
    await call(base+'/review','PUT',{mode:'confirm',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))});
    const promotedTwice=db.prepare('select * from maintenance_hour_results where owner_id=?').all(subtaskId);
    assert.equal(promotedTwice.length,1,'review confirmation still keeps exactly one row');
    assert.equal(promotedTwice[0].person_id,posted[0].person_id);assert.equal(Number(promotedTwice[0].hours),Number(posted[0].hours));assert.equal(promotedTwice[0].status,'已确认');
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
});

test('same-strategy category switch reuses frozen roles while undecided standards stay draft-only',async()=>{
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'],previous=flags.map(k=>process.env[k]);
  const template=db.prepare("select * from users where id='54002010'").get(),stamp=new Date().toISOString();
  const loginAs=async account=>{const r=await request('/api/login',{method:'POST',body:{username:account.username||account.id,password:'muc2026'}});assert.equal(r.res.statusCode,200);return String(r.res.headers['Set-Cookie']).split(';')[0];};
  const assignRole=(account,code)=>{const id=typeof account==='string'?account:account.id;const roleId=db.prepare('select id from rbac_roles where code=?').get(code).id;db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(id,roleId,stamp);};
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    const cookie=await loginAs(template),personId=template.person_id;
    const call=async(path,method='GET',body,useCookie=cookie)=>{const r=await request(path,{method,cookie:useCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
    const worker=createMaintenanceTestAccount(template,{id:'same-strategy-worker',name:'同策略验收工人'}),peer=createMaintenanceTestAccount(template,{id:'same-strategy-peer',name:'同策略验收同伴'});
    const reviewers=Array.from({length:12},(_,i)=>createMaintenanceTestAccount(template,{id:'same-strategy-reviewer-'+i,name:'同策略评议'+i}));for(const reviewer of reviewers)assignRole(reviewer,'addon_nonroutine_reviewer');
    const finalizer=createMaintenanceTestAccount(template,{id:'same-strategy-finalizer',name:'同策略终审'});assignRole(finalizer,'addon_nonroutine_review_finalizer');assignRole(finalizer,'addon_nonroutine_review_auditor');
    const periodResponsible=createMaintenanceTestAccount(template,{id:'same-strategy-period',name:'同策略账期负责人'});assignRole(periodResponsible,'addon_maintenance_period_responsible');
    db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=?").run(periodResponsible.id);
    const finalizerCookie=await loginAs(finalizer);
    const periodUrl='/api/maintenance/hour-periods/2027-05';
    await call(periodUrl+'/assign','POST',{revision:0,accountId:periodResponsible.id,reason:'同策略指定账期负责人'});
    await call(periodUrl+'/confirm','POST',{revision:1,state:'OPEN',reason:'同策略开放当月'},await loginAs(periodResponsible));
    // ---- A: 单项工作 -> 工卡指令 (same ROLE_COMBINATION strategy, identical participants). ----
    const flightA=(await call('/api/maintenance/flights','POST',{date:'2027-05-01',flightNo:'SAME-STRATEGY-QA',aircraftNo:'B-SSY',aircraftType:'A320',workKind:'停场'})).flight,baseA=`/api/maintenance/flights/${flightA.id}`;
    await call(baseA+'/dispatch','POST',{expectedUpdatedAt:flightA.updatedAt,assignments:[{role:'放行',personId}]});
    const itemA={clientId:'same-strategy-item',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'996',title:'同策略未收录项',reportExplanation:'同策略场景',standardHours:2,entries:[{personId:worker.personId,role:'主做'},{personId:peer.personId,role:'检验'}]},draftA=(await call(baseA+'/reports/nonroutine/draft','PUT',{version:0,items:[itemA]})).draft;
    await call(baseA+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draftA.version,items:[itemA]});
    const caseA=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(flightA.id),urlA=`/api/maintenance/nonroutine-reviews/${caseA.id}`;
    await call(urlA+'/accept','POST',{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:finalizer.id});
    for(const [index,reviewer] of reviewers.entries())await call(urlA+'/opinion','POST',{revision:0,hours:index+1,basis:'SAME-STRATEGY-PRIVATE-'+index},await loginAs(reviewer));
    const sealed=(await call(urlA,undefined,undefined,finalizerCookie)).review;
    const decision={revision:sealed.revision,decision:{category:'工卡指令',chapter:'996',title:itemA.title,workScope:itemA.reportExplanation,recognizedHours:2},participantsVerified:true,participants:[{personId:worker.personId,role:'主做'},{personId:peer.personId,role:'检验'}],reason:'类别核实为工卡指令，策略与角色不变',admissionDecision:'PENDING'};
    const preview=(await call(urlA+'/preview','POST',decision,finalizerCookie)).preview;
    assert.equal(preview.rolesChanged,false,'same roles across same-strategy categories must not force re-selection');
    assert.equal(preview.policy.strategy,'ROLE_COMBINATION');assert.equal(preview.policy.combination,'主做+检验');
    assert.equal(preview.policy.ratios['主做'],JSON.parse(caseA.policy_json).combinations?.['主做+检验']?.['主做']??JSON.parse(caseA.policy_json).ratios?.['主做'],'ratios stay the frozen bank values');
    assert.equal(preview.policyChanged,true,'category label change still surfaces a real identity difference');
    const finalization=(await call(urlA+'/finalize','POST',{...decision,expectedPolicyToken:preview.policyToken},finalizerCookie)).finalization;
    assert.equal(finalization.channel.state,'MERGED_CLOSED',JSON.stringify(finalization));
    const rowsA=db.prepare('select role,hours from maintenance_hour_results where owner_id=? order by role').all(caseA.subtask_id);
    assert.equal(rowsA.length,2);assert.ok(Math.abs(rowsA[0].hours+rowsA[1].hours-2)<1e-6);
    assert.equal(Number(rowsA.find(r=>r.role==='主做').hours),2*preview.policy.ratios['主做']);
    // ---- B: undecided de-icing standard submits drafts but blocks formal reporting. ----
    const standardId='same-strategy-deice-standard';
    db.prepare("insert into maintenance_standards(id,status,revision,created_by,created_at,updated_at) values(?,'PUBLISHED',1,'fixture',?,?)").run(standardId,stamp,stamp);
    db.prepare("insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,generic_aircraft,status,admission_decision,effective_at,published_by,published_at,created_at) values(?,?,1,'人工除冰','997','除冰待定标准','除冰待定范围',1.5,'[\"A320\"]',0,'PUBLISHED','INCLUDE','2026-01-01','fixture','2026-01-01',?)").run(standardId+'-v1',standardId,stamp);
    const flightB=(await call('/api/maintenance/flights','POST',{date:'2027-05-02',flightNo:'DEICE-DRAFT-ONLY',aircraftNo:'B-DIO',aircraftType:'A320',workKind:'停场'})).flight,baseB=`/api/maintenance/flights/${flightB.id}`;
    await call(baseB+'/dispatch','POST',{expectedUpdatedAt:flightB.updatedAt,assignments:[{role:'放行',personId}]});
    const itemB={clientId:'deice-draft-item',temporary:true,manualManaged:true,standardId,standardVersion:1,category:'人工除冰',chapter:'997',title:'除冰待定标准',reportExplanation:'除冰待定范围',standardHours:1.5,entries:[{personId:worker.personId,role:'主做'}]};
    const draftB=await request(baseB+'/reports/nonroutine/draft',{method:'PUT',cookie,body:{version:0,items:[itemB]}});
    assert.equal(draftB.res.statusCode,200,JSON.stringify(draftB.payload));
    assert.equal((await call(baseB)).flight.status,'已派工','draft save must not move the opportunity');
    assert.equal(Number(db.prepare('select count(*) n from maintenance_report_batches where flight_id=?').get(flightB.id).n),0);
    const blocked=await request(baseB+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'submit',draftVersion:draftB.payload.draft.version,items:[itemB]}});
    assert.equal(blocked.res.statusCode,409,'undecided standard must block formal reporting: '+JSON.stringify(blocked.payload));
    assert.ok(String(blocked.payload.error).includes('策略尚未就绪'));
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where flight_id=?').get(flightB.id).n),0);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_cases where flight_id=?').get(flightB.id).n),0);
    assert.equal((await call(baseB)).flight.status,'已派工','blocked submission keeps the opportunity state separate');
    // ---- C: EQUAL 跨类别同策略变体——未收录2人项终审定成试车，均分、参与人不变（P0-107 残留） ----
    const flightC=(await call('/api/maintenance/flights','POST',{date:'2027-05-03',flightNo:'EQUAL-SWITCH-QA',aircraftNo:'B-EQS',aircraftType:'A320',workKind:'停场'})).flight,baseC=`/api/maintenance/flights/${flightC.id}`;
    await call(baseC+'/dispatch','POST',{expectedUpdatedAt:flightC.updatedAt,assignments:[{role:'放行',personId}]});
    const itemC={clientId:'equal-switch-item',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'998',title:'均分切换未收录项',reportExplanation:'均分切换场景',standardHours:2,entries:[{personId:worker.personId,role:'主做'},{personId:peer.personId,role:'检验'}]},draftC=(await call(baseC+'/reports/nonroutine/draft','PUT',{version:0,items:[itemC]})).draft;
    await call(baseC+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draftC.version,items:[itemC]});
    const caseC=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(flightC.id),urlC=`/api/maintenance/nonroutine-reviews/${caseC.id}`;
    await call(urlC+'/accept','POST',{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:finalizer.id});
    for(const [index,reviewer] of reviewers.entries())await call(urlC+'/opinion','POST',{revision:0,hours:index+1,basis:'EQUAL-SWITCH-PRIVATE-'+index},await loginAs(reviewer));
    const sealedC=(await call(urlC,undefined,undefined,finalizerCookie)).review;
    const decisionC={revision:sealedC.revision,decision:{category:'试车',chapter:'998',title:itemC.title,workScope:itemC.reportExplanation,recognizedHours:2},participantsVerified:true,participants:[{personId:worker.personId,role:'主做'},{personId:peer.personId,role:'检验'}],reason:'类别核实为试车，均分策略与原参与人不变',admissionDecision:'PENDING'};
    const previewC=(await call(urlC+'/preview','POST',decisionC,finalizerCookie)).preview;
    assert.equal(previewC.rolesChanged,false,'EQUAL target categories reuse the same original participants');
    assert.equal(previewC.policy.strategy,'EQUAL');assert.equal(previewC.policyChanged,true,'category change still surfaces the identity difference');
    const finalizationC=(await call(urlC+'/finalize','POST',{...decisionC,expectedPolicyToken:previewC.policyToken},finalizerCookie)).finalization;
    assert.equal(finalizationC.channel.state,'MERGED_CLOSED',JSON.stringify(finalizationC));
    const rowsC=db.prepare('select role,hours from maintenance_hour_results where owner_id=? order by role').all(caseC.subtask_id);
    assert.equal(rowsC.length,2);assert.ok(rowsC.every(r=>Math.abs(Number(r.hours)-1)<1e-9),'EQUAL split must average recognized hours across both participants');
    assert.ok(Math.abs(rowsC.reduce((s,r)=>s+Number(r.hours),0)-2)<1e-9);
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
});

test('finalization preview surfaces read-only config version drift while allocation stays frozen',async()=>{
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'],previous=flags.map(k=>process.env[k]);
  const template=db.prepare("select * from users where id='54002010'").get(),stamp=new Date().toISOString();
  const loginAs=async account=>{const r=await request('/api/login',{method:'POST',body:{username:account.username||account.id,password:'muc2026'}});assert.equal(r.res.statusCode,200);return String(r.res.headers['Set-Cookie']).split(';')[0];};
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    const cookie=await loginAs(template),personId=template.person_id;
    const call=async(path,method='GET',body,useCookie=cookie)=>{const r=await request(path,{method,cookie:useCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
    const worker=createMaintenanceTestAccount(template,{id:'drift-worker',name:'漂移验收工人'}),peer=createMaintenanceTestAccount(template,{id:'drift-peer',name:'漂移验收同伴'});
    const assignRole=(account,code)=>{db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(account.id,db.prepare('select id from rbac_roles where code=?').get(code).id,stamp);};
    const reviewers=Array.from({length:12},(_,i)=>createMaintenanceTestAccount(template,{id:'drift-reviewer-'+i,name:'漂移评议'+i}));for(const reviewer of reviewers)assignRole(reviewer,'addon_nonroutine_reviewer');
    const finalizer=createMaintenanceTestAccount(template,{id:'drift-finalizer',name:'漂移终审'});assignRole(finalizer,'addon_nonroutine_review_finalizer');assignRole(finalizer,'addon_nonroutine_review_auditor');
    const periodResponsible=createMaintenanceTestAccount(template,{id:'drift-period',name:'漂移账期负责人'});assignRole(periodResponsible,'addon_maintenance_period_responsible');
    db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=?").run(periodResponsible.id);
    const finalizerCookie=await loginAs(finalizer);
    const periodUrl='/api/maintenance/hour-periods/2027-08';
    await call(periodUrl+'/assign','POST',{revision:0,accountId:periodResponsible.id,reason:'漂移指定账期负责人'});
    await call(periodUrl+'/confirm','POST',{revision:1,state:'OPEN',reason:'漂移开放当月'},await loginAs(periodResponsible));
    const flight=(await call('/api/maintenance/flights','POST',{date:'2027-08-01',flightNo:'DRIFT-HINT-QA',aircraftNo:'B-DRF',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${flight.id}`;
    await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]});
    const item={clientId:'drift-item-v1',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'999',title:'漂移提示未收录项',reportExplanation:'漂移提示场景',standardHours:2,entries:[{personId:worker.personId,role:'主做'},{personId:peer.personId,role:'检验'}]},draft=(await call(base+'/reports/nonroutine/draft','PUT',{version:0,items:[item]})).draft;
    await call(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft.version,items:[item]});
    const reviewCase=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id),url=`/api/maintenance/nonroutine-reviews/${reviewCase.id}`;
    await call(url+'/accept','POST',{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:finalizer.id});
    for(const [index,reviewer] of reviewers.entries())await call(url+'/opinion','POST',{revision:0,hours:index+1,basis:'DRIFT-PRIVATE-'+index},await loginAs(reviewer));
    const sealed=(await call(url,undefined,undefined,finalizerCookie)).review;
    const frozenPolicy=JSON.parse(reviewCase.policy_json),frozenRatios=frozenPolicy.combinations?.['主做+检验']||frozenPolicy.ratios;
    const decision={revision:sealed.revision,decision:{category:'单项工作',chapter:'999',title:item.title,workScope:item.reportExplanation,recognizedHours:2},participantsVerified:true,participants:[{personId:worker.personId,role:'主做'},{personId:peer.personId,role:'检验'}],reason:'',admissionDecision:'PENDING'};
    const ruleRow=db.prepare("select value,updated_at from maintenance_hour_rules where name='主做+检验::主做'").get();
    try{
      const preview0=(await call(url+'/preview','POST',decision,finalizerCookie)).preview;
      assert.equal(preview0.configDrift,false,'no rule change yet → no drift');
      assert.ok(preview0.allocation.available);
      // 模拟后台有权调比发布新版本（直接改规则行，仅测试用）
      db.prepare("update maintenance_hour_rules set value=? where name='主做+检验::主做'").run(String(Number(ruleRow.value)+0.05));
      const preview1=(await call(url+'/preview','POST',decision,finalizerCookie)).preview;
      assert.equal(preview1.configDrift,true,'independent rule change must surface read-only drift');
      assert.equal(preview1.policyChanged,false,'drift hint must not alter policyChanged semantics');
      assert.equal(preview1.rolesChanged,false);
      assert.ok(preview1.allocation.available,'allocation still computable from frozen snapshot');
      for(const entry of preview1.allocation.allocations)assert.ok(Math.abs(Number(entry.hours)-2*frozenRatios[entry.role])<1e-9,'allocation must stay frozen: '+JSON.stringify(entry));
      const finalization=(await call(url+'/finalize','POST',{...decision,expectedPolicyToken:preview1.policyToken},finalizerCookie)).finalization;
      assert.equal(finalization.channel.state,'MERGED_CLOSED',JSON.stringify(finalization));
      const rows=db.prepare('select role,hours from maintenance_hour_results where owner_id=? order by role').all(reviewCase.subtask_id);
      assert.equal(rows.length,2);
      for(const row of rows)assert.ok(Math.abs(Number(row.hours)-2*frozenRatios[row.role])<1e-9,'posted hours must use frozen ratios, not the drifted current rule');
    } finally {
      db.prepare("update maintenance_hour_rules set value=?,updated_at=? where name='主做+检验::主做'").run(ruleRow.value,ruleRow.updated_at);
    }
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
});

test('imported draft completes and closes the full review loop to posted hours',async()=>{
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'],previous=flags.map(k=>process.env[k]);
  const template=db.prepare("select * from users where id='54002010'").get(),stamp=new Date().toISOString();
  const loginAs=async account=>{const r=await request('/api/login',{method:'POST',body:{username:account.username||account.id,password:'muc2026'}});assert.equal(r.res.statusCode,200);return String(r.res.headers['Set-Cookie']).split(';')[0];};
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    const cookie=await loginAs(template),personId=template.person_id;
    const call=async(path,method='GET',body,useCookie=cookie)=>{const r=await request(path.startsWith('/api')?path:'/api'+path,{method,cookie:useCookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
    const worker=createMaintenanceTestAccount(template,{id:'import-loop-worker',name:'导入闭环验收工人'});
    const assignRole=(account,code)=>{db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(account.id,db.prepare('select id from rbac_roles where code=?').get(code).id,stamp);};
    const reviewers=Array.from({length:12},(_,i)=>createMaintenanceTestAccount(template,{id:'import-loop-reviewer-'+i,name:'导入闭环评议'+i}));for(const reviewer of reviewers)assignRole(reviewer,'addon_nonroutine_reviewer');
    const finalizer=createMaintenanceTestAccount(template,{id:'import-loop-finalizer',name:'导入闭环终审'});assignRole(finalizer,'addon_nonroutine_review_finalizer');assignRole(finalizer,'addon_nonroutine_review_auditor');
    const periodResponsible=createMaintenanceTestAccount(template,{id:'import-loop-period',name:'导入闭环账期负责人'});assignRole(periodResponsible,'addon_maintenance_period_responsible');
    db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=?").run(periodResponsible.id);
    const finalizerCookie=await loginAs(finalizer);
    const periodUrl='/api/maintenance/hour-periods/2027-09';
    await call(periodUrl+'/assign','POST',{revision:0,accountId:periodResponsible.id,reason:'导入闭环指定账期负责人'});
    await call(periodUrl+'/confirm','POST',{revision:1,state:'OPEN',reason:'导入闭环开放当月'},await loginAs(periodResponsible));
    const identity={date:'2027-09-01',flightNo:'IMPORT-LOOP-QA',aircraftNo:'B-ILP',aircraftType:'A320',workKind:'停场'};
    const flight=(await call('/api/maintenance/flights','POST',identity)).flight,base=`/api/maintenance/flights/${flight.id}`,version=async()=>(await call(base)).flight.updatedAt;
    const content=["date,aircraftNo,workKind,flightNo,title,standardHours,工作内容及范围",`${identity.date},${identity.aircraftNo},${identity.workKind},${identity.flightNo},导入闭环工作,2,导入闭环范围`].join("\n");
    const preview=(await call('/maintenance/subtasks/import/files/preview','POST',{filename:'import-loop.csv',contentBase64:Buffer.from(content).toString('base64')})).valueOf();
    const batchUrl=`/maintenance/subtasks/import/batches/${preview.batchId}`;
    const commitBody={requestId:'import-loop-once',revision:preview.revision,rows:preview.results.map(({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest})=>({rowNumber,flightId,expectedUpdatedAt,draftVersion,matchDigest}))};
    const receipt=await call(batchUrl+'/commit','POST',commitBody);
    assert.equal(receipt.summary.created,1,JSON.stringify(receipt));
    await call(base+'/dispatch','POST',{expectedUpdatedAt:await version(),assignments:[{role:'放行',personId}]});
    const saved=db.prepare('select * from maintenance_report_drafts where flight_id=?').get(flight.id),draftItems=JSON.parse(saved.payload_json).items;
    assert.equal(draftItems.length,1);assert.equal(draftItems[0].title,'导入闭环工作');
    const completed=draftItems.map(item=>({...item,temporary:true,manualManaged:true,category:'单项工作',chapter:'996',standardHours:2,entries:[{personId:worker.personId,role:'主做'}]}));
    const draftPut=await call(base+'/reports/nonroutine/draft','PUT',{version:saved.version,items:completed});
    await call(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draftPut.draft.version,items:completed});
    await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});
    const report=(await call(base+'/reports')).report;
    await call(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:personId});
    // 不先做复核树确认：机会保持待复核，导入工作经评议封闭后终审走 MERGED_CLOSED 主通道
    const reviewCase=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id),url=`/api/maintenance/nonroutine-reviews/${reviewCase.id}`;
    await call(url+'/accept','POST',{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:finalizer.id});
    for(const [index,reviewer] of reviewers.entries())await call(url+'/opinion','POST',{revision:0,hours:index+1,basis:'IMPORT-LOOP-PRIVATE-'+index},await loginAs(reviewer));
    const sealed=(await call(url,undefined,undefined,finalizerCookie)).review;
    const decision={revision:sealed.revision,decision:{category:'单项工作',chapter:'996',title:'导入闭环工作',workScope:'导入闭环范围',recognizedHours:2},participantsVerified:true,participants:[{personId:worker.personId,role:'主做'}],reason:'',admissionDecision:'PENDING'};
    const previewFinal=(await call(url+'/preview','POST',decision,finalizerCookie)).preview;
    const finalization=(await call(url+'/finalize','POST',{...decision,expectedPolicyToken:previewFinal.policyToken},finalizerCookie)).finalization;
    assert.equal(finalization.channel.state,'MERGED_CLOSED',JSON.stringify(finalization));
    const subtask=db.prepare('select id from maintenance_subtasks where flight_id=?').get(flight.id);
    const treeAfter=(await call(base+'/review')).review;
    await call(base+'/review','PUT',{mode:'confirm',expectedUpdatedAt:treeAfter.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:treeAfter.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))});
    assert.equal((await call(base)).flight.status,'已确认');
    const rows=db.prepare('select role,hours,status from maintenance_hour_results where owner_id=?').all(subtask.id);
    assert.equal(rows.length,1);assert.ok(Math.abs(Number(rows[0].hours)-2)<1e-9,'主做单角色冻结比例=1 → 2h');
    assert.equal(rows[0].status,'已确认');
    const source=db.prepare("select state from maintenance_nonroutine_import_sources where original_json like '%导入闭环工作%'").get();
    assert.equal(source.state,'SUBMITTED','imported source must be marked SUBMITTED after the loop closes');
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
});

test('post-finalization personnel change keeps the approved finalization and pauses promotion until authorized correction',async()=>{
  // V10.1 行596：审批已认定但机会未确认后发生人员变更——原事务拦截、审定保持、
  // 投影不动、暂停转正（按5.13走授权更正），更正通道可达。
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'],previous=flags.map(k=>process.env[k]);
  const template=db.prepare("select * from users where id='54002010'").get(),stamp=new Date().toISOString();
  const loginAs=async account=>{const r=await request('/api/login',{method:'POST',body:{username:account.username||account.id,password:'muc2026'}});assert.equal(r.res.statusCode,200);return String(r.res.headers['Set-Cookie']).split(';')[0];};
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    const cookie=await loginAs(template),personId=template.person_id;
    const call=async(path,method='GET',body,useCookie=cookie)=>{const r=await request(path.startsWith('/api')?path:'/api'+path,{method,cookie:useCookie,body});return r;};
    const okCall=async(path,method='GET',body,useCookie=cookie)=>{const r=await call(path,method,body,useCookie);assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
    const worker=createMaintenanceTestAccount(template,{id:'ppc-worker',name:'人员变化验收工人'}),peer=createMaintenanceTestAccount(template,{id:'ppc-peer',name:'人员变化验收同伴'});
    const assignRole=(account,code)=>{db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(account.id,db.prepare('select id from rbac_roles where code=?').get(code).id,stamp);};
    const reviewers=Array.from({length:12},(_,i)=>createMaintenanceTestAccount(template,{id:'ppc-reviewer-'+i,name:'人员变化评议'+i}));for(const reviewer of reviewers)assignRole(reviewer,'addon_nonroutine_reviewer');
    const finalizer=createMaintenanceTestAccount(template,{id:'ppc-finalizer',name:'人员变化终审'});assignRole(finalizer,'addon_nonroutine_review_finalizer');assignRole(finalizer,'addon_nonroutine_review_auditor');
    const periodResponsible=createMaintenanceTestAccount(template,{id:'ppc-period',name:'人员变化账期负责人'});assignRole(periodResponsible,'addon_maintenance_period_responsible');
    db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=?").run(periodResponsible.id);
    const finalizerCookie=await loginAs(finalizer);
    const periodUrl='/api/maintenance/hour-periods/2027-10';
    await okCall(periodUrl+'/assign','POST',{revision:0,accountId:periodResponsible.id,reason:'人员变化指定账期负责人'});
    await okCall(periodUrl+'/confirm','POST',{revision:1,state:'OPEN',reason:'人员变化开放当月'},await loginAs(periodResponsible));
    const flight=(await okCall('/api/maintenance/flights','POST',{date:'2027-10-01',flightNo:'PPC-CHANGE-QA',aircraftNo:'B-PPC',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${flight.id}`,version=async()=>(await okCall(base)).flight.updatedAt;
    await okCall(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]});
    const item={clientId:'ppc-item-v1',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'997',title:'人员变化验收工作',reportExplanation:'人员变化场景',standardHours:2,entries:[{personId:worker.personId,role:'主做'},{personId:peer.personId,role:'检验'}]},draft=(await okCall(base+'/reports/nonroutine/draft','PUT',{version:0,items:[item]})).draft;
    await okCall(base+'/reports/nonroutine','PUT',{mode:'submit',draftVersion:draft.version,items:[item]});
    await okCall(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});
    const report=(await okCall(base+'/reports')).report;
    await okCall(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:personId});
    const reviewCase=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id),url=`/api/maintenance/nonroutine-reviews/${reviewCase.id}`;
    await okCall(url+'/accept','POST',{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:finalizer.id});
    for(const [index,reviewer] of reviewers.entries())await okCall(url+'/opinion','POST',{revision:0,hours:index+1,basis:'PPC-PRIVATE-'+index},await loginAs(reviewer));
    const sealed=(await okCall(url,'GET',undefined,finalizerCookie)).review;
    const decision={revision:sealed.revision,decision:{category:'单项工作',chapter:'997',title:item.title,workScope:item.reportExplanation,recognizedHours:2},participantsVerified:true,participants:[{personId:worker.personId,role:'主做'},{personId:peer.personId,role:'检验'}],reason:'',admissionDecision:'PENDING'};
    const preview=(await okCall(url+'/preview','POST',decision,finalizerCookie)).preview;
    const finalization=(await okCall(url+'/finalize','POST',{...decision,expectedPolicyToken:preview.policyToken},finalizerCookie)).finalization;
    assert.equal(finalization.channel.state,'MERGED_CLOSED',JSON.stringify(finalization));
    assert.equal((await okCall(base)).flight.status,'待复核');
    // 快照：审定/投影/账期状态
    const finalsRow=JSON.stringify(db.prepare('select * from maintenance_nonroutine_review_finals where case_id=?').get(reviewCase.id));
    const subtask=db.prepare('select id from maintenance_subtasks where flight_id=?').get(flight.id);
    const hoursBefore=JSON.stringify(db.prepare('select person_id,role,hours,status from maintenance_hour_results where owner_id=? order by role').all(subtask.id));
    const adjustmentsBefore=Number(db.prepare('select count(*) n from maintenance_nonroutine_hour_adjustments').get().n);
    assert.equal(JSON.parse(hoursBefore).length,2);
    // 行596 前三款：人员角色变化在原事务内处理、审定保持、投影按有权变更重核（认定分配保持）
    const tree=(await okCall(base+'/review')).review;
    const tasks=tree.tasks.map(task=>({ownerType:task.ownerType,ownerId:task.ownerId,assignments:task.assignments.map(person=>({personId:person.personId,role:person.personId===peer.personId?'辅助':person.role}))}));
    const reconciled=await call(base+'/review','PUT',{reason:'核对实际角色',expectedUpdatedAt:tree.flight.updatedAt,tasks});
    assert.equal(reconciled.res.statusCode,200,JSON.stringify(reconciled.payload));
    assert.equal(JSON.stringify(db.prepare('select * from maintenance_nonroutine_review_finals where case_id=?').get(reviewCase.id)),finalsRow,'审定必须保持');
    const reconciledRows=db.prepare('select person_id,role,hours,status from maintenance_hour_results where owner_id=? order by person_id').all(subtask.id);
    assert.equal(reconciledRows.length,2,'投影按新参与事实重写');
    for(const row of reconciledRows){
      const original=JSON.parse(hoursBefore).find(item=>item.person_id===row.person_id);
      assert.ok(original,'参与人不变：'+row.person_id);
      assert.ok(Math.abs(Number(row.hours)-original.hours)<1e-9,'认定分配金额保持：'+JSON.stringify({row,original}));
      assert.equal(row.status,'待复核','保存不转正');
    }
    const changedRead=(await okCall(url,'GET',undefined,finalizerCookie)).review;
    assert.equal(changedRead.sourceFacts.changed,true,'变化被检出');
    assert.equal(changedRead.sourceFacts.participantsChanged,true);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_hour_adjustments').get().n),adjustmentsBefore,'原事务重核不产生更正行');
    // 行596 第四款：工作事实变更致无法映射（删除主做参与人）→ 拦截并指向授权更正（暂停转正）
    const tree2=(await okCall(base+'/review')).review;
    const tasks2=tree2.tasks.map(task=>({ownerType:task.ownerType,ownerId:task.ownerId,assignments:task.assignments.filter(person=>!(task.ownerType==='subtask'&&person.personId===worker.personId)).map(person=>({personId:person.personId,role:person.role}))}));
    const removal=await call(base+'/review','PUT',{reason:'人员实际未参与',expectedUpdatedAt:tree2.flight.updatedAt,tasks:tasks2});
    assert.equal(removal.res.statusCode,409,JSON.stringify(removal.payload));
    assert.ok(/无法合法关联|授权更正/.test(String(removal.payload.error)),removal.payload.error);
    const confirmBlocked=await call(base+'/review','PUT',{mode:'confirm',expectedUpdatedAt:tree2.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tasks2});
    assert.equal(confirmBlocked.res.statusCode,409,JSON.stringify(confirmBlocked.payload));
    // 拦截后：审定保持、投影不动、未转正、无新增更正行
    assert.equal(JSON.stringify(db.prepare('select * from maintenance_nonroutine_review_finals where case_id=?').get(reviewCase.id)),finalsRow,'拦截后审定仍保持');
    assert.equal(Number(db.prepare('select count(*) n from maintenance_hour_results where owner_id=? and status=\'待复核\'').get(subtask.id).n),2,'暂停转正：仍待复核');
    assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_hour_adjustments').get().n),adjustmentsBefore,'拦截不自行产生更正');
    assert.equal((await okCall(base)).flight.status,'待复核');
    // 授权更正通道可达（来源清单可读）
    const sources=await call('/api/maintenance/nonroutine-corrections/sources?flightId='+flight.id,'GET',undefined,finalizerCookie);
    assert.ok([200,404].includes(sources.res.statusCode),'corrections channel reachable: '+sources.res.statusCode);
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
});

test('authorized module rule refreeze requires impact analysis approval and syncs in-flight identity',async()=>{
  const flags=['MUC_MAINTENANCE_V101','MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED','MUC_MAINTENANCE_MODULE_SHADOW_ENABLED','MUC_NONSETTLEMENT_MODULES_ENABLED'],previous=flags.map(k=>process.env[k]);
  const template=db.prepare("select * from users where id='54002010'").get(),stamp=new Date().toISOString();
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    const cookie=String((await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}})).res.headers['Set-Cookie']).split(';')[0];
    const manager=createMaintenanceTestAccount(template,{id:'refreeze-manager',name:'重冻结验收管理员'});
    db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(manager.id,db.prepare("select id from rbac_roles where code='addon_maintenance_module_manager'").get().id,stamp);
    db.prepare("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=?").run(manager.id);
    const managerCookie=String((await request('/api/login',{method:'POST',body:{username:manager.username,password:'muc2026'}})).res.headers['Set-Cookie']).split(';')[0];
    const flight=(await request('/api/maintenance/flights',{method:'POST',cookie,body:{date:'2026-11-19',flightNo:'REFREEZE-QA',aircraftNo:'B-RFZ',aircraftType:'A320',workKind:'停场'}})).payload.flight;
    const extUrl=`/api/maintenance/flights/${flight.id}/extension-modules`;
    assert.equal((await request(extUrl,{cookie:managerCookie})).res.statusCode,200,'identity should be valid initially');
    const goodSha=db.prepare('select content_sha256 from maintenance_opportunity_rule_snapshots where opportunity_key=?').get(flight.id).content_sha256;
    // 模拟规则演进：快照内容与当前规则不一致（旧规则）→ 身份读取失败
    db.prepare("update maintenance_opportunity_rule_snapshots set snapshot_json=?,content_sha256=? where opportunity_key=?").run('{"legacyRules":true}','deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',flight.id);
    const broken=await request(extUrl,{cookie:managerCookie});
    assert.ok([409,500].includes(broken.res.statusCode),'旧规则快照应导致身份读取失败: '+broken.res.statusCode);
    const url=`/api/maintenance/flights/${flight.id}/module-rule-refreeze`;
    const longAnalysis='规则版本升级影响分析：门槛谓词与完成谓词同步升级，经核对不影响在途已提交事实与参与人快照。';
    assert.equal((await request(url,{method:'POST',cookie,body:{impactAnalysis:longAnalysis,approved:true}})).res.statusCode,403,'无模块管理权限应拒绝');
    assert.equal((await request(url,{method:'POST',cookie:managerCookie,body:{impactAnalysis:longAnalysis}})).res.statusCode,400,'缺显式批准应拒绝');
    assert.equal((await request(url,{method:'POST',cookie:managerCookie,body:{impactAnalysis:'太短',approved:true}})).res.statusCode,400,'影响分析不足20字应拒绝');
    const ok=await request(url,{method:'POST',cookie:managerCookie,body:{impactAnalysis:longAnalysis,approved:true}});
    assert.equal(ok.res.statusCode,200,JSON.stringify(ok.payload));
    assert.equal(ok.payload.ruleSnapshotSha256,goodSha,'重冻结后快照与当前规则一致');
    assert.equal((await request(extUrl,{cookie:managerCookie})).res.statusCode,200,'身份读取恢复');
    assert.equal(db.prepare('select gate_rule_version from maintenance_module_instances where opportunity_key=? limit 1').get(flight.id).gate_rule_version,ok.payload.gateRuleVersion,'实例规则版本同步');
    const actions=db.prepare("select action from maintenance_logs where flight_id=? and action in ('module_identity_refreeze','module_rule_change_approved')").all(flight.id).map(row=>row.action).sort();
    assert.deepEqual(actions,['module_identity_refreeze','module_rule_change_approved'],'双审计事件');
    // 已确认机会拒绝重冻结
    const confirmed=(await request('/api/maintenance/flights',{method:'POST',cookie,body:{date:'2026-11-19',flightNo:'REFREEZE-CONFIRMED',aircraftNo:'B-RFZ',aircraftType:'A320',workKind:'停场'}})).payload.flight;
    db.prepare("update maintenance_flights set status='已确认' where id=?").run(confirmed.id);
    const denied=await request(`/api/maintenance/flights/${confirmed.id}/module-rule-refreeze`,{method:'POST',cookie:managerCookie,body:{impactAnalysis:longAnalysis,approved:true}});
    assert.equal(denied.res.statusCode,409,'已确认机会不能重冻结');
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
});

test('standard effective reference auto-refresh recomputes only unconfirmed projections with original frozen ratios',async()=>{
  const {refreshMaintenanceStandardEffectiveReferences}=await import('../server.mjs');
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],template=db.prepare("select * from users where id='54002010'").get(),personId=login.payload.user.personId,stamp=new Date().toISOString();
  const worker=createMaintenanceTestAccount(template,{id:'effective-refresh-worker',name:'生效引用验收工人'}),peer=createMaintenanceTestAccount(template,{id:'effective-refresh-peer',name:'生效引用验收同伴'});
  const ruleValue=(combo,role)=>Number(db.prepare("select value from maintenance_hour_rules where rule_type='nonroutineCombinationRatio' and name=?").get(combo+'::'+role)?.value);
  const rMain=ruleValue('主做+检验','主做'),rCheck=ruleValue('主做+检验','检验');
  const publish=(id,version,category,chapter,title,scope,hours,codes,effectiveAt)=>{
    db.prepare("insert into maintenance_standards(id,status,revision,created_by,created_at,updated_at) values(?,'PUBLISHED',?, 'fixture',?,?) on conflict(id) do update set status='PUBLISHED',updated_at=excluded.updated_at").run(id,Number(version),stamp,stamp);
    db.prepare("insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,generic_aircraft,status,admission_decision,effective_at,published_by,published_at,created_at) values(?,?,?,?,?,?,?,?,?,'0','PUBLISHED','INCLUDE',?,'fixture',?,?)")
      .run(id+'-v'+version,id,Number(version),category,chapter,title,scope,hours,JSON.stringify(codes),effectiveAt||'2026-01-01T00:00:00Z',stamp,stamp);
  };
  publish('effective-refresh-std',1,'单项工作','990','生效引用验收标准','生效引用验收范围',2,['A320'],'2026-01-01T00:00:00Z');
  const setupFlight=async flightNo=>{
    const flight=(await request('/api/maintenance/flights',{method:'POST',cookie,body:{date:'2027-06-01',flightNo,aircraftNo:'B-EFR',aircraftType:'A320',workKind:'停场'}})).payload.flight,base=`/api/maintenance/flights/${flight.id}`;
    await request(base+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]}});
    return {flight,base};
  };
  const matchedItem=std=>({clientId:'effective-refresh-item-'+std,temporary:true,manualManaged:true,standardId:'effective-refresh-std',standardVersion:std,category:'单项工作',chapter:'990',title:'生效引用验收标准',reportExplanation:'生效引用验收范围',standardHours:std===1?2:3,entries:[{personId:worker.personId,role:'主做'},{personId:peer.personId,role:'检验'}]});
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED'],previous=flags.map(k=>process.env[k]);
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    const {flight,base}=await setupFlight('EFFECTIVE-REFRESH-QA');
    const draft=(await request(base+'/reports/nonroutine/draft',{method:'PUT',cookie,body:{version:0,items:[matchedItem(1)]}})).payload.draft;
    assert.equal((await request(base+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'submit',draftVersion:draft.version,items:[matchedItem(1)]}})).res.statusCode,200);
    await request(base+'/reports/release',{method:'PUT',cookie,body:{expectedUpdatedAt:(await request(base,{cookie})).payload.flight.updatedAt}});
    const report=(await request(base+'/reports',{cookie})).payload.report;
    await request(base+'/report-confirmation',{method:'POST',cookie,body:{expectedUpdatedAt:(await request(base,{cookie})).payload.flight.updatedAt,routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:personId}});
    assert.equal((await request(base,{cookie})).payload.flight.status,'待复核');
    const subtask=db.prepare('select id from maintenance_subtasks where flight_id=?').get(flight.id).id;
    const hoursBefore=db.prepare('select person_id,role,hours,status from maintenance_hour_results where owner_id=? order by role').all(subtask);
    assert.equal(hoursBefore.length,2);assert.ok(Math.abs(hoursBefore.reduce((s,r)=>s+r.hours,0)-2)<1e-9);
    const entriesBefore=JSON.stringify(db.prepare('select * from maintenance_report_entries where batch_id in (select id from maintenance_report_batches where flight_id=?) order by id').all(flight.id));
    // V2: same work identity, hours-only change, effective immediately → refresh applies
    publish('effective-refresh-std',2,'单项工作','990','生效引用验收标准','生效引用验收范围',3,['A320'],stamp);
    const actions=refreshMaintenanceStandardEffectiveReferences(login.payload.user);
    assert.equal(actions.length,1);assert.equal(actions[0].subtaskId,subtask);assert.equal(actions[0].toVersion,2);assert.equal(actions[0].fromHours,2);assert.equal(actions[0].toHours,3);
    const assessment=db.prepare('select * from maintenance_nonroutine_assessments where subtask_id=?').get(subtask);
    assert.equal(JSON.parse(assessment.standard_json).version,2);assert.equal(Number(assessment.effective_hours),3);
    const hoursAfter=db.prepare('select person_id,role,hours,status from maintenance_hour_results where owner_id=? order by role').all(subtask);
    assert.equal(hoursAfter.length,2);assert.ok(Math.abs(hoursAfter.reduce((s,r)=>s+r.hours,0)-3)<1e-9);
    const main=hoursAfter.find(r=>r.role==='主做').hours,check=hoursAfter.find(r=>r.role==='检验').hours;
    assert.ok(Math.abs(main-3*rMain)<1e-9&&Math.abs(check-3*rCheck)<1e-9,'recompute must use original frozen ratios');
    assert.deepEqual(JSON.stringify(db.prepare('select * from maintenance_report_entries where batch_id in (select id from maintenance_report_batches where flight_id=?) order by id').all(flight.id)),entriesBefore,'original submission snapshot must stay byte-identical');
    const audit=db.prepare('select * from maintenance_standard_effective_refreshes where subtask_id=?').all(subtask);
    assert.equal(audit.length,1);assert.equal(Number(audit[0].to_version),2);assert.equal(audit[0].operator_id,login.payload.user.id);
    assert.equal(Number(db.prepare('select standard_hours from maintenance_subtasks where id=?').get(subtask).standard_hours),3);
    // idempotent: second run is a no-op
    const again=refreshMaintenanceStandardEffectiveReferences(login.payload.user);
    assert.equal(again.length,0);assert.equal(Number(db.prepare('select count(*) n from maintenance_standard_effective_refreshes where subtask_id=?').get(subtask).n),1);
    // V3 scope changed (definition/scope substantive change) → never auto-refreshed
    publish('effective-refresh-std',3,'单项工作','990','生效引用验收标准','定义实质变化后的范围',4,['A320'],stamp);
    const scopeActions=refreshMaintenanceStandardEffectiveReferences(login.payload.user);
    assert.ok(!scopeActions.some(a=>a.subtaskId===subtask),'scope-changed version must not auto-apply');
    assert.equal(JSON.parse(db.prepare('select standard_json from maintenance_nonroutine_assessments where subtask_id=?').get(subtask).standard_json).version,2);
    // V4 aircraft not applicable → skipped; V5 future effective → skipped (latest applicable remains v2)
    publish('effective-refresh-std',4,'单项工作','990','生效引用验收标准','生效引用验收范围',5,['B738'],stamp);
    publish('effective-refresh-std',5,'单项工作','990','生效引用验收标准','生效引用验收范围',6,['A320'],'2030-01-01T00:00:00Z');
    const guardActions=refreshMaintenanceStandardEffectiveReferences(login.payload.user);
    assert.ok(!guardActions.some(a=>a.subtaskId===subtask));
    assert.equal(Number(db.prepare('select effective_hours from maintenance_nonroutine_assessments where subtask_id=?').get(subtask).effective_hours),3);
    // confirmed opportunity bound to V1 of another standard → never refreshed
    const {flight:confirmed}=await setupFlight('EFFECTIVE-REFRESH-CONFIRMED');
    publish('effective-refresh-std2',1,'单项工作','991','已确认引用验收标准','已确认引用验收范围',2,['A320'],'2026-01-01T00:00:00Z');
    const item2={...matchedItem(1),clientId:'effective-refresh-confirmed',standardId:'effective-refresh-std2',chapter:'991',title:'已确认引用验收标准',reportExplanation:'已确认引用验收范围'};
    const draft2=(await request(`/api/maintenance/flights/${confirmed.id}/reports/nonroutine/draft`,{method:'PUT',cookie,body:{version:0,items:[item2]}})).payload.draft;
    assert.equal((await request(`/api/maintenance/flights/${confirmed.id}/reports/nonroutine`,{method:'PUT',cookie,body:{mode:'submit',draftVersion:draft2.version,items:[item2]}})).res.statusCode,200);
    await request(`/api/maintenance/flights/${confirmed.id}/reports/release`,{method:'PUT',cookie,body:{expectedUpdatedAt:(await request(`/api/maintenance/flights/${confirmed.id}`,{cookie})).payload.flight.updatedAt}});
    const report2=(await request(`/api/maintenance/flights/${confirmed.id}/reports`,{cookie})).payload.report;
    await request(`/api/maintenance/flights/${confirmed.id}/report-confirmation`,{method:'POST',cookie,body:{expectedUpdatedAt:(await request(`/api/maintenance/flights/${confirmed.id}`,{cookie})).payload.flight.updatedAt,routineEntries:[],nonroutineItems:report2.nonroutine.items,releasePersonId:personId}});
    const tree2=(await request(`/api/maintenance/flights/${confirmed.id}/review`,{cookie})).payload.review;
    await request(`/api/maintenance/flights/${confirmed.id}/review`,{method:'PUT',cookie,body:{mode:'confirm',expectedUpdatedAt:tree2.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree2.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))}});
    assert.equal((await request(`/api/maintenance/flights/${confirmed.id}`,{cookie})).payload.flight.status,'已确认');
    const subtask2=db.prepare('select id from maintenance_subtasks where flight_id=?').get(confirmed.id).id;
    const confirmedHoursBefore=JSON.stringify(db.prepare('select person_id,role,hours,status from maintenance_hour_results where owner_id=? order by role').all(subtask2));
    publish('effective-refresh-std2',2,'单项工作','991','已确认引用验收标准','已确认引用验收范围',9,['A320'],stamp);
    const confirmedActions=refreshMaintenanceStandardEffectiveReferences(login.payload.user);
    assert.ok(!confirmedActions.some(a=>a.subtaskId===subtask2),'confirmed opportunities must never auto-refresh');
    assert.equal(db.prepare('select effective_hours from maintenance_nonroutine_assessments where subtask_id=?').get(subtask2).effective_hours,2);
    assert.deepEqual(JSON.stringify(db.prepare('select person_id,role,hours,status from maintenance_hour_results where owner_id=? order by role').all(subtask2)),confirmedHoursBefore);
    // REVIEW-sourced assessment (unlisted work) is never auto-converted
    const unlisted={clientId:'effective-refresh-unlisted',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'992',title:'未收录不自动转换项',reportExplanation:'未收录',standardHours:2,entries:[{personId:worker.personId,role:'主做'}]};
    const {flight:reviewFlight,base:reviewBase}=await setupFlight('EFFECTIVE-REVIEW-QA');
    const draft3=(await request(reviewBase+'/reports/nonroutine/draft',{method:'PUT',cookie,body:{version:0,items:[unlisted]}})).payload.draft;
    assert.equal((await request(reviewBase+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'submit',draftVersion:draft3.version,items:[unlisted]}})).res.statusCode,200);
    const reviewAssessment=db.prepare("select a.* from maintenance_nonroutine_assessments a join maintenance_subtasks s on s.id=a.subtask_id where s.flight_id=?").get(reviewFlight.id);
    assert.equal(reviewAssessment.source_kind,'REVIEW');
    const reviewJsonBefore=reviewAssessment.standard_json;
    const reviewActions=refreshMaintenanceStandardEffectiveReferences(login.payload.user);
    assert.ok(!reviewActions.some(a=>a.subtaskId===reviewAssessment.subtask_id));
    assert.equal(db.prepare('select standard_json from maintenance_nonroutine_assessments where subtask_id=?').get(reviewAssessment.subtask_id).standard_json,reviewJsonBefore);
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
});

test('definition or category substantive change never auto-reclassifies and requires explicit manual re-selection',async()=>{
  const {refreshMaintenanceStandardEffectiveReferences}=await import('../server.mjs');
  const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId,stamp=new Date().toISOString();
  const publish=(id,version,category,chapter,title,scope,hours)=>{
    db.prepare("insert into maintenance_standards(id,status,revision,created_by,created_at,updated_at) values(?,'PUBLISHED',?,'fixture',?,?) on conflict(id) do update set status='PUBLISHED',updated_at=excluded.updated_at").run(id,Number(version),stamp,stamp);
    db.prepare("insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,generic_aircraft,status,admission_decision,effective_at,published_by,published_at,created_at) values(?,?,?,?,?,?,?,?,?,'0','PUBLISHED','INCLUDE','2026-01-01T00:00:00Z','fixture',?,?)")
      .run(id+'-v'+version,id,Number(version),category,chapter,title,scope,hours,JSON.stringify(['A320']),stamp,stamp);
  };
  publish('p038-definition-std',1,'单项工作','993','P038定义变化验收标准','P038原范围',2);
  const flags=['MUC_MAINTENANCE_V101','MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED'],previous=flags.map(k=>process.env[k]);
  try{
    for(const k of flags)process.env[k]=k==='MUC_MAINTENANCE_V101'?'draft':'1';
    const item=category=>({clientId:'p038-item-v'+(category==='试车'?'2':'1'),temporary:true,manualManaged:true,standardId:'p038-definition-std',standardVersion:category==='试车'?2:1,category,chapter:'993',title:'P038定义变化验收标准',reportExplanation:category==='试车'?'P038类别变更后的范围':'P038原范围',standardHours:category==='试车'?3:2,entries:[{personId,role:'主做'}]});
    const flight=(await request('/api/maintenance/flights',{method:'POST',cookie,body:{date:'2027-07-01',flightNo:'P038-DEFINITION-QA',aircraftNo:'B-P038',aircraftType:'A320',workKind:'停场'}})).payload.flight,base=`/api/maintenance/flights/${flight.id}`;
    await request(base+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]}});
    const draftPut=await request(base+'/reports/nonroutine/draft',{method:'PUT',cookie,body:{version:0,items:[item('单项工作')]}});
    assert.equal(draftPut.res.statusCode,200,JSON.stringify(draftPut.payload));const draft=draftPut.payload.draft;
    assert.equal((await request(base+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'submit',draftVersion:draft.version,items:[item('单项工作')]}})).res.statusCode,200);
    await request(base+'/reports/release',{method:'PUT',cookie,body:{expectedUpdatedAt:(await request(base,{cookie})).payload.flight.updatedAt}});
    const report=(await request(base+'/reports',{cookie})).payload.report;
    await request(base+'/report-confirmation',{method:'POST',cookie,body:{expectedUpdatedAt:(await request(base,{cookie})).payload.flight.updatedAt,routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:personId}});
    const subtask=db.prepare('select * from maintenance_subtasks where flight_id=?').get(flight.id);
    const frozen=()=>JSON.stringify(db.prepare('select * from maintenance_nonroutine_assessments where subtask_id=?').get(subtask.id));
    const before=frozen(),hoursBefore=JSON.stringify(db.prepare('select person_id,role,hours from maintenance_hour_results where owner_id=? order by id').all(subtask.id));
    // V2 类别+范围实质变化（单项工作→试车）→ 不自动重分类、不自动重算、零审计行
    publish('p038-definition-std',2,'试车','993','P038定义变化验收标准','P038类别变更后的范围',3);
    const actions=refreshMaintenanceStandardEffectiveReferences(login.payload.user);
    assert.ok(!actions.some(a=>a.subtaskId===subtask.id),'category/scope substantive change must never auto-apply');
    assert.equal(frozen(),before,'assessment snapshot must stay untouched (no auto-reclassification)');
    const kept=JSON.parse(JSON.parse(before).standard_json||'{}');
    assert.equal(kept.category??db.prepare('select category from maintenance_subtasks where id=?').get(subtask.id).category,'单项工作');
    assert.equal(JSON.stringify(db.prepare('select person_id,role,hours from maintenance_hour_results where owner_id=? order by id').all(subtask.id)),hoursBefore);
    assert.equal(Number(db.prepare('select count(*) n from maintenance_standard_effective_refreshes where subtask_id=?').get(subtask.id).n),0);
    // 字段锁：声称绑定 v1 却填写 v2 类别 → 409 且零写入（禁止静默换绑）
    const locked=await request(base+'/reports/nonroutine/draft',{method:'PUT',cookie,body:{version:1,items:[{...item('试车'),standardVersion:1}]}});
    assert.equal(locked.res.statusCode,409,JSON.stringify(locked.payload));
    assert.equal(frozen(),before);
    // 唯一合法通道=人工显式重选 v2：新案按新类别受理成功，旧案保持 v1 不受影响
    const flight2=(await request('/api/maintenance/flights',{method:'POST',cookie,body:{date:'2027-07-01',flightNo:'P038-RESELECT-QA',aircraftNo:'B-P038',aircraftType:'A320',workKind:'停场'}})).payload.flight,base2=`/api/maintenance/flights/${flight2.id}`;
    await request(base2+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:flight2.updatedAt,assignments:[{role:'放行',personId}]}});
    const draft2=(await request(base2+'/reports/nonroutine/draft',{method:'PUT',cookie,body:{version:0,items:[item('试车')]}})).payload.draft;
    const submitted=await request(base2+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'submit',draftVersion:draft2.version,items:[item('试车')]}});
    assert.equal(submitted.res.statusCode,200,JSON.stringify(submitted.payload));
    const subtask2=db.prepare('select * from maintenance_subtasks where flight_id=?').get(flight2.id),assessment2=db.prepare('select * from maintenance_nonroutine_assessments where subtask_id=?').get(subtask2.id);
    assert.equal(JSON.parse(assessment2.standard_json).version,2);assert.equal(JSON.parse(assessment2.standard_json).category,'试车');
    assert.equal(Number(assessment2.effective_hours),3);
    assert.equal(frozen(),before,'explicit new binding must not rewrite the original item');
    assert.equal(Number(db.prepare('select count(*) n from maintenance_standard_effective_refreshes where subtask_id=?').get(subtask.id).n),0);
  } finally { flags.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); }
});
test('V1.4 public tasks require authentication and offset write paths fail closed without expanding attendance scope',async()=>{
 assert.equal((await request('/api/action-tasks/count')).res.statusCode,401);
 assert.equal((await request('/api/action-tasks/events')).res.statusCode,401);
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
 const count=await request('/api/action-tasks/count',{cookie});assert.equal(count.res.statusCode,200);assert.equal(count.payload.count,0);
 const summary=await request('/api/attendance/self/summary?personId=another',{cookie});assert.equal(summary.res.statusCode,200);assert.equal('people' in summary.payload,false);
 const balance=await request('/api/attendance/offsets/balance',{cookie});assert.equal(balance.res.statusCode,200);assert.equal(balance.payload.available,null);
 const write=await request('/api/attendance/offsets/rules',{cookie,method:'POST',body:{}});assert.ok([403,409].includes(write.res.statusCode));
});

test('R18 export refuses mixed versions even when another instance bypasses the local state cache',async()=>{
 const {attendanceService}=await import('../server.mjs');
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
 const previous=db.prepare("select * from attendance_sync_state where id='dataVersion'").get();const original=attendanceService.changes;let attempts=0;
 attendanceService.hybrid.state('dataVersion');
 attendanceService.changes=(...args)=>{const result=original(...args);attempts++;db.prepare("insert into attendance_sync_state values('dataVersion',?,?) on conflict(id) do update set value_json=excluded.value_json,updated_at=excluded.updated_at").run(JSON.stringify('external-export-race-'+attempts),new Date().toISOString());return result;};
 try{const req=Readable.from([]);req.method='GET';req.url='/api/attendance/export/html?month=2026-09';req.headers={host:'127.0.0.1:8788',origin:'http://127.0.0.1:8788',cookie};const res=new MockResponse();await measuredRoute(req,res);assert.equal(res.statusCode,409);assert.equal(attempts,3);assert.match(res.body.toString(),/重新导出/);}finally{attendanceService.changes=original;if(previous)db.prepare("update attendance_sync_state set value_json=?,updated_at=? where id='dataVersion'").run(previous.value_json,previous.updated_at);else db.prepare("delete from attendance_sync_state where id='dataVersion'").run();attendanceService.hybrid.state('dataVersion',{fresh:true});}
});

test('R18 export retries once then materializes matching uncached source metadata when updates settle',async()=>{
 const {attendanceService}=await import('../server.mjs');
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
 const previous=db.prepare("select * from attendance_sync_state where id='dataVersion'").get();const original=attendanceService.changes;let attempts=0;
 attendanceService.hybrid.state('dataVersion');attendanceService.changes=(...args)=>{const result=original(...args);if(++attempts===1)db.prepare("insert into attendance_sync_state values('dataVersion',?,?) on conflict(id) do update set value_json=excluded.value_json,updated_at=excluded.updated_at").run(JSON.stringify('external-export-settled'),new Date().toISOString());return result;};
 try{const req=Readable.from([]);req.method='GET';req.url='/api/attendance/export/html?month=2026-09';req.headers={host:'127.0.0.1:8788',origin:'http://127.0.0.1:8788',cookie};const res=new MockResponse();await measuredRoute(req,res);assert.equal(res.statusCode,200);assert.equal(attempts,2);const data=JSON.parse(res.body.toString().match(/<script id="attendanceSeed" type="application\/json">([\s\S]*?)<\/script>/)[1]);assert.equal(data.sourceVersion.dataVersion,'external-export-settled');assert.equal(data.dataVersion,'external-export-settled');assert.equal(typeof data.offsetVersion,'number');assert.equal(typeof data.ledgerVersion,'number');}finally{attendanceService.changes=original;if(previous)db.prepare("update attendance_sync_state set value_json=?,updated_at=? where id='dataVersion'").run(previous.value_json,previous.updated_at);else db.prepare("delete from attendance_sync_state where id='dataVersion'").run();attendanceService.hybrid.state('dataVersion',{fresh:true});}
});

test('removed initialization HTTP endpoints reject writes and preserve legacy rules',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];const person=db.prepare('select id from personnel limit 1').get();assert.ok(person);
 const body={personIds:[person.id]},before=db.prepare('select count(*) n from attendance_offset_rules').get().n;
 assert.equal((await request('/api/attendance/offsets/initialization/preview',{method:'POST',body})).res.statusCode,401);
 const preview=await request('/api/attendance/offsets/initialization/preview',{method:'POST',cookie,body});assert.equal(preview.res.statusCode,409);assert.match(preview.payload.error,/已停用/);assert.equal(db.prepare('select count(*) n from attendance_offset_rules').get().n,before);
 const confirm=await request('/api/attendance/offsets/initialization/confirm',{method:'POST',cookie,body:{...body,previewHash:preview.payload.previewHash}});assert.equal(confirm.res.statusCode,409);assert.equal(db.prepare('select count(*) n from attendance_offset_rules').get().n,before);
});

test('task SSE authenticates, sends committed recipient changes without content, and closes revoked sessions',async()=>{
 const {actionTaskRealtime}=await import('../server.mjs');
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0];
 const req=Readable.from([]);req.method='GET';req.url='/api/action-tasks/events';req.headers={host:'127.0.0.1:8788',cookie};const res=new MockResponse();
 const userId='54002010',original=db.prepare('select * from action_task_revisions where user_id=?').get(userId),stamp=new Date().toISOString();
 try{
  await measuredRoute(req,res);assert.equal(res.statusCode,200);assert.equal(res.headers['Content-Type'],'text/event-stream; charset=utf-8');assert.equal(res.headers['X-Accel-Buffering'],'no');assert.match(res.body.toString(),/"kind":"connected"/);
  db.exec('begin immediate');
  db.prepare("insert into attendance_offset_requests values(?,?,?,?,'{}',?,'pending',1,?,?)").run('sse-task-request','sse-other-person','2026-11',userId,'private-note',stamp,stamp);
  db.prepare("insert into action_tasks values(?,?,?,?,?,?,?,'pending','{}',?,?)").run('sse-task','attendance','offset_approval','sse-task-request','approve',userId,'private-title',stamp,stamp);
  db.prepare('insert into action_task_revisions values(?,1) on conflict(user_id) do update set version=action_task_revisions.version+1').run(userId);db.exec('commit');
  actionTaskRealtime.pump();assert.match(res.body.toString(),/"kind":"changed"/);assert.doesNotMatch(res.body.toString(),/private-title|private-note|sse-task-request/);
  req.headers.cookie='';db.prepare('update action_task_revisions set version=version+1 where user_id=?').run(userId);actionTaskRealtime.pump();assert.match(res.body.toString(),/access-revoked/);
 }finally{
  res.emit('close');actionTaskRealtime.close();db.prepare('delete from action_tasks where id=?').run('sse-task');db.prepare('delete from attendance_offset_requests where id=?').run('sse-task-request');
  if(original)db.prepare('update action_task_revisions set version=? where user_id=?').run(original.version,userId);else db.prepare('delete from action_task_revisions where user_id=?').run(userId);
 }
});

test("A16 组合权限不串范围：查看权限与复核动作的范围相互独立", async () => {
  const tag = String(Date.now() % 1e6).padStart(6, "0");
  process.env.A16_RUN_TAG = tag;
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"]).split(";")[0];
  const teamOne = db.prepare("select id,name from organization_units where code='TEAM-LINE-1'").get();
  const teamTwo = db.prepare("select id,name from organization_units where code='TEAM-LINE-2'").get();
  const department = db.prepare("select id from organization_units where code='DEPT-LINE'").get();
  const stamp = new Date().toISOString();
  const insertPerson = (id, employeeNo, name, teamId) => db.prepare(`insert into personnel(id,employee_no,name,department,home_team,employment_status,data_status,department_id,administrative_team_id,created_at,updated_at) values(?,?,?,?,?,'在职','active',?,?,?,?)`).run(id, employeeNo, name, "维修部", "一组", department.id, teamId, stamp, stamp);
  insertPerson("person-a16-one-" + tag, tag + "01", "本班机械师", teamOne.id);
  insertPerson("person-a16-two-" + tag, tag + "02", "他班机械师", teamTwo.id);
  const mkAccount = (username, personId, roles, scopeType, scopeId) => request("/api/admin/accounts", { method: "POST", cookie, body: { personId, username, password: "123456", status: "active", mustChangePassword: false, roles, scopes: [{ module: "maintenance", scopeType, scopeId }] } });
  const scoped = await mkAccount("a16-s-" + tag, "person-a16-one-" + tag, ["manager", "addon_hours_confirm"], "specified_teams", teamOne.id);
  assert.equal(scoped.res.statusCode, 201, "A16-scoped: " + JSON.stringify(scoped.payload));
  const wide = await mkAccount("a16-w-" + tag, "person-a16-two-" + tag, ["manager", "addon_hours_confirm"], "all", "");
  assert.equal(wide.res.statusCode, 201, "A16-wide: " + JSON.stringify(wide.payload));
  const auth = async username => String((await request("/api/login", { method: "POST", body: { username, password: "123456" } })).res.headers["Set-Cookie"]).split(";")[0];
  const scopedCookie = await auth("a16-s-" + tag), wideCookie = await auth("a16-w-" + tag);
  const hourId = (suffix) => "hour-a16-" + suffix + "-" + tag;
  const insertHour = (id, personId, name, teamName) => db.prepare(`insert into maintenance_hour_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,status,created_at,updated_at) values(?,'subtask',?,null,?,?,?,?,?,'nonroutine',2,'待复核',?,?)`).run(id, "owner-" + id, "assign-" + id, personId, name, teamName, "主做", stamp, stamp);
  insertHour(hourId("two"), "person-a16-two-" + tag, "他班机械师", teamTwo.name);
  const denied = await request("/api/maintenance/hours/" + hourId("two") + "/confirm", { method: "POST", cookie: scopedCookie });
  assert.ok([403, 404].includes(denied.res.statusCode), `范围外复核应被拒，实际 ${denied.res.statusCode}`);
  insertHour(hourId("one"), "person-a16-one-" + tag, "本班机械师", teamOne.name);
  const allowed = await request("/api/maintenance/hours/" + hourId("one") + "/confirm", { method: "POST", cookie: scopedCookie });
  assert.equal(allowed.res.statusCode, 200, JSON.stringify(allowed.payload));
  const control = await request("/api/maintenance/hours/" + hourId("two") + "/confirm", { method: "POST", cookie: wideCookie });
  assert.equal(control.res.statusCode, 200, JSON.stringify(control.payload));
  insertPerson("person-a16-three-" + tag, tag + "03", "无权限机械师", teamTwo.id);
  await mkAccount("a16-u-" + tag, "person-a16-three-" + tag, ["worker"], "all", "");
  insertHour(hourId("third"), "person-a16-two-" + tag, "他班机械师", teamTwo.name);
  const noPermission = await request("/api/maintenance/hours/" + hourId("third") + "/confirm", { method: "POST", cookie: await auth("a16-u-" + tag) });
  assert.equal(noPermission.res.statusCode, 403, "无权限码必须 403");
});
