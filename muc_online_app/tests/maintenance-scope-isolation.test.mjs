// A16（V1.1 §11 验收）：组合权限不串范围——"查看类权限+复核动作"的组合，
// 复核工时仍严格走 maintenance 数据范围（requirePerson），不能借查看路径的范围复核他人班组。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import test from "node:test";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ceairm-a16-"));
process.env.MUC_NO_LISTEN = "1";
process.env.DB_PATH = path.join(tempDir, "test.sqlite");
process.env.UPLOAD_DIR = path.join(tempDir, "uploads");

const { measuredRoute, db } = await import("../server.mjs");

class MockResponse extends EventEmitter {
  headers = {};
  statusCode = 200;
  body = Buffer.alloc(0);
  writeHead(status, headers = {}) { this.statusCode = status; this.headers = headers; return this; }
  write(body = "") { this.body = Buffer.concat([this.body, Buffer.isBuffer(body) ? body : Buffer.from(String(body))]); return true; }
  end(body = "") { this.write(body); this.emit("finish"); }
}

async function request(url, { method = "GET", body, cookie = "" } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  req.headers = { host: "127.0.0.1:8788", origin: "http://127.0.0.1:8788", "content-type": "application/json", ...(cookie ? { cookie } : {}) };
  const res = new MockResponse();
  await measuredRoute(req, res);
  const payload = res.body?.length ? JSON.parse(res.body.toString("utf8")) : null;
  return { res, payload };
}

test("A16：全车间查看权限组合不能复核范围外班组的工时", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"]).split(";")[0];

  // 两个行政班组（一组/二组下的实际组织行）与两名分属其下的人员。
  const teamOne = db.prepare("select id,name from organization_units where code='TEAM-LINE-1'").get();
  const teamTwo = db.prepare("select id,name from organization_units where code='TEAM-LINE-2'").get();
  assert.ok(teamOne && teamTwo, "预置班组缺失");
  const department = db.prepare("select id from organization_units where code='DEPT-LINE'").get();
  const stamp = new Date().toISOString();
  const insertPerson = (id, employeeNo, name, teamId) => db.prepare(`insert into personnel(id,employee_no,name,department,home_team,employment_status,data_status,department_id,administrative_team_id,created_at,updated_at) values(?,?,?,?,?,'在职','active',?,?,?,?)`).run(id, employeeNo, name, "维修部", "一组", department.id, teamId, stamp, stamp);
  insertPerson("person-a16-one", "81000001", "本班机械师", teamOne.id);
  insertPerson("person-a16-two", "81000002", "他班机械师", teamTwo.id);

  // 组合账户：manager 基础角色（含 maintenance.stats.manage.view 等全车间查看类权限码）
  // + maintenance 数据范围仅"指定一组"。另建对照账户：范围 all。
  const createAccount = (username, scopeType, scopeId) => request("/api/admin/accounts", {
    method: "POST", cookie, expected: 201,
    body: { personId: "person-a16-one", username, password: "123456", status: "active", mustChangePassword: false, roles: ["manager", "addon_hours_confirm"], scopes: [{ module: "maintenance", scopeType, scopeId }] }
  });
  const scoped = await createAccount("a16-scoped", "specified_teams", teamOne.id);
  assert.equal(scoped.res.statusCode, 201, JSON.stringify(scoped.payload));
  const wide = await request("/api/admin/accounts", {
    method: "POST", cookie,
    body: { personId: "person-a16-two", username: "a16-wide", password: "123456", status: "active", mustChangePassword: false, roles: ["manager", "addon_hours_confirm"], scopes: [{ module: "maintenance", scopeType: "all", scopeId: "" }] }
  });
  assert.equal(wide.res.statusCode, 201, JSON.stringify(wide.payload));

  const auth = async username => String((await request("/api/login", { method: "POST", body: { username, password: "123456" } })).res.headers["Set-Cookie"]).split(";")[0];
  const scopedCookie = await auth("a16-scoped");
  const wideCookie = await auth("a16-wide");

  // 两名人员的待复核工时（他班人员一条、本班人员一条）。
  const insertHour = (id, personId, name, teamName) => db.prepare(`insert into maintenance_hour_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,status,created_at,updated_at) values(?,'subtask',?,null,?,?,?,?,?,'nonroutine',2,'待复核',?,?)`).run(id, "owner-" + id, "assign-" + id, personId, name, teamName, "主做", stamp, stamp);
  insertHour("hour-a16-two", "person-a16-two", "他班机械师", teamTwo.name);
  insertHour("hour-a16-one", "person-a16-one", "本班机械师", teamOne.name);

  // 1) 组合账户复核他班工时：查看权限再大也必须被 maintenance 范围拒绝（404 范围外）。
  const denied = await request("/api/maintenance/hours/hour-a16-two/confirm", { method: "POST", cookie: scopedCookie });
  assert.ok([403, 404].includes(denied.res.statusCode), `范围外复核应被拒，实际 ${denied.res.statusCode}`);

  // 2) 组合账户复核本班工时：正常放行。
  const allowed = await request("/api/maintenance/hours/hour-a16-one/confirm", { method: "POST", cookie: scopedCookie });
  assert.equal(allowed.res.statusCode, 200, JSON.stringify(allowed.payload));
  assert.equal(db.prepare("select status from maintenance_hour_results where id='hour-a16-one'").get().status, "已确认");

  // 3) 对照：范围 all 的账户可复核他班工时（证明拒绝来自范围而非数据或权限码缺失）。
  const control = await request("/api/maintenance/hours/hour-a16-two/confirm", { method: "POST", cookie: wideCookie });
  assert.equal(control.res.statusCode, 200, JSON.stringify(control.control || control.payload));
  assert.equal(db.prepare("select status from maintenance_hour_results where id='hour-a16-two'").get().status, "已确认");

  // 4) 反向对照：无工时确认权限码的 worker 即使范围 all 也不得复核。
  insertPerson("person-a16-three", "81000003", "无权限机械师", teamTwo.id);
  await request("/api/admin/accounts", {
    method: "POST", cookie,
    body: { personId: "person-a16-three", username: "a16-worker", password: "123456", status: "active", mustChangePassword: false, roles: ["worker"], scopes: [{ module: "maintenance", scopeType: "all", scopeId: "" }] }
  });
  const workerCookie = await auth("a16-worker");
  insertHour("hour-a16-third", "person-a16-two", "他班机械师", teamTwo.name);
  const noPermission = await request("/api/maintenance/hours/hour-a16-third/confirm", { method: "POST", cookie: workerCookie });
  assert.equal(noPermission.res.statusCode, 403, "无权限码必须 403");
});
