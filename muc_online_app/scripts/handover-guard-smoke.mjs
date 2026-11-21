// B3 交接治理隔离冒烟：临时目录 + MUC_NO_LISTEN + route() 直调。
// 验证 V1.1 §5 既定规则落地：办理资格=当前有效班组长、交班班组锁定本班、接收人强制班组长、职位变动实时生效。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const appDir = path.resolve(import.meta.dirname, "..");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "muc-handover-guard-"));
process.env.NODE_ENV = "test";
process.env.MUC_NO_LISTEN = "1";
process.env.DATABASE_URL = "";
process.env.DB_PATH = path.join(tempDir, "test.sqlite");
process.env.UPLOAD_DIR = path.join(tempDir, "uploads");
const { route, db } = await import(path.join(appDir, "server.mjs"));

class MockRequest extends Readable {
  constructor(pathname, method, headers, body) {
    super();
    this.url = `/api${pathname}`;
    this.method = method;
    this.headers = headers;
    this.socket = { remoteAddress: "127.0.0.1" };
    this.body = body;
  }
  _read() {
    if (this.body !== undefined) this.push(Buffer.from(JSON.stringify(this.body)));
    this.body = undefined;
    this.push(null);
  }
}

class MockResponse {
  constructor() { this.statusCode = 200; this.headers = {}; this.chunks = []; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])); }
  write(chunk) { if (chunk) this.chunks.push(Buffer.from(String(chunk))); }
  end(chunk) { if (chunk) this.chunks.push(Buffer.from(String(chunk))); }
}

async function request(pathname, { cookie = "", method = "GET", body, expected = 200 } = {}) {
  const headers = {
    host: "127.0.0.1:8799",
    origin: "http://127.0.0.1:8799",
    ...(cookie ? { cookie } : {}),
    ...(body === undefined ? {} : { "content-type": "application/json" })
  };
  const req = new MockRequest(pathname, method, headers, body);
  const response = new MockResponse();
  await route(req, response);
  const text = Buffer.concat(response.chunks).toString("utf8");
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { text }; }
  assert.equal(response.statusCode, expected, `${method} ${pathname}: ${text}`);
  return { data, cookie: String(response.headers["set-cookie"] || "").split(";", 1)[0] || "" };
}

async function login(username, password) {
  const result = await request("/login", { method: "POST", body: { username, password } });
  assert.ok(result.cookie, `账号 ${username} 未获得会话`);
  return result;
}

try {
  const admin = await login("54002010", "muc2026");

  // 人员：张甲（班组长/一组）、张乙（班组长/二组）、张丙（维修人员/一组）。
  const staged = await request("/personnel/imports", {
    cookie: admin.cookie, method: "POST", expected: 201,
    body: {
      type: "personnel", fileName: "handover-guard.xlsx",
      rows: [
        ["员工工号", "员工姓名", "部门", "人员分组", "行政班组", "职位", "用工状态"],
        ["88000011", "张甲", "航线维修车间", "二车间", "一组", "班组长", "在职"],
        ["88000012", "张乙", "航线维修车间", "二车间", "二组", "班组长", "在职"],
        ["88000013", "张丙", "航线维修车间", "二车间", "一组", "维修人员", "在职"]
      ]
    }
  });
  await request(`/personnel/imports/${staged.data.batch.id}/confirm`, { cookie: admin.cookie, method: "POST", body: { confirmReplacement: true } });
  const person = employeeNo => db.prepare("select p.id,u.id as userId from personnel p left join users u on u.person_id=p.id where p.employee_no=?").get(employeeNo);
  const jia = person("88000011"), yi = person("88000012"), bing = person("88000013");
  assert.ok(jia?.id && yi?.id && bing?.id, "人员导入失败");

  // 账户：三个 worker（worker 默认含 handover.create，用于区分“有权限”与“有身份”）。
  for (const [p, username] of [[jia, "leader-a"], [yi, "leader-b"], [bing, "worker-c"]]) {
    await request("/admin/accounts", {
      cookie: admin.cookie, method: "POST", expected: 201,
      body: { personId: p.id, username, password: "123456", status: "active", mustChangePassword: false, roles: ["worker"], scopes: [{ module: "personnel", scopeType: "self", scopeId: "" }] }
    });
  }
  const leaderA = await login("leader-a", "123456");
  const leaderB = await login("leader-b", "123456");
  const workerC = await login("worker-c", "123456");
  const userIdOf = async session => session.data.user.id;
  const idA = await userIdOf(leaderA), idB = await userIdOf(leaderB), idC = await userIdOf(workerC);

  // 1) 非班组长持 handover.create → 创建被拒。
  const denied = await request("/handover", { cookie: workerC.cookie, method: "POST", expected: 403, body: { toTeamId: "TEAM-LINE-2", recipients: [{ userId: idB }] } });
  assert.ok(denied.data.error.includes("仅当前有效班组长"), denied.data.error);

  // 2) 班组长创建：fromTeamId 故意传他组 → 锁定为本班（一组）。
  const created = await request("/handover", {
    cookie: leaderA.cookie, method: "POST",
    body: { fromTeamId: "TEAM-LINE-2", toTeamId: "TEAM-LINE-2", recipients: [{ userId: idB }], otherItems: "冒烟：交接事项一" }
  });
  assert.equal(created.data.handover.fromTeamId, "TEAM-LINE-1", "交班班组应锁定为创建人本班");
  assert.equal(created.data.handover.status, "draft");
  const handoverOne = created.data.handover.id;

  // 3) 指定非班组长为接收人 → 拒绝并说明原因。
  const badRecipient = await request("/handover", { cookie: leaderA.cookie, method: "POST", expected: 400, body: { toTeamId: "TEAM-LINE-2", recipients: [{ userId: idC }] } });
  assert.ok(badRecipient.data.error.includes("不是当前有效班组长"), badRecipient.data.error);

  // 4) 草稿修改：非班组长 403；改交班班组 409。
  await request(`/handover/${handoverOne}`, { cookie: workerC.cookie, method: "PUT", expected: 403, body: { expectedVersion: 1, otherItems: "x" } });
  await request(`/handover/${handoverOne}`, { cookie: leaderA.cookie, method: "PUT", expected: 409, body: { expectedVersion: 1, fromTeamId: "TEAM-LINE-2" } });

  // 5) 提交 + 班组长接收人确认成功（场景4的两处修改均被拒并回滚，版本仍为 1）。
  await request(`/handover/${handoverOne}/submit`, { cookie: leaderA.cookie, method: "POST", body: { expectedVersion: 1 } });
  await request(`/handover/${handoverOne}/confirm`, { cookie: leaderB.cookie, method: "POST" });
  assert.equal(db.prepare("select status from handover where id=?").get(handoverOne).status, "accepted");

  // 6) 职位变动实时生效（A06）：建第二张单（张乙仍为班组长）→ 提交 → 张乙职位被改为维修人员 → 确认被拒。
  const created2 = await request("/handover", {
    cookie: leaderA.cookie, method: "POST",
    body: { toTeamId: "TEAM-LINE-2", recipients: [{ userId: idB }], otherItems: "冒烟：交接事项二" }
  });
  const handoverTwo = created2.data.handover.id;
  await request(`/handover/${handoverTwo}/submit`, { cookie: leaderA.cookie, method: "POST", body: {} });
  await request(`/personnel/${encodeURIComponent(yi.id)}`, { cookie: admin.cookie, method: "PUT", body: { position: "维修人员", reason: "B3 冒烟：撤除张乙班组长身份" } });
  const staleConfirm = await request(`/handover/${handoverTwo}/confirm`, { cookie: leaderB.cookie, method: "POST", expected: 403 });
  assert.ok(staleConfirm.data.error.includes("仅当前有效班组长"), staleConfirm.data.error);
  assert.equal(db.prepare("select status from handover where id=?").get(handoverTwo).status, "pending", "被拒确认不得改变单据状态");

  // 7) 撤职后张乙也不能再被指定为接收人。
  const badAfterDemotion = await request("/handover", { cookie: leaderA.cookie, method: "POST", expected: 400, body: { toTeamId: "TEAM-LINE-2", recipients: [{ userId: idB }] } });
  assert.ok(badAfterDemotion.data.error.includes("不是当前有效班组长"), badAfterDemotion.data.error);

  console.log("交接治理隔离冒烟通过：办理资格、本班锁定、接收人强制班组长、职位变动实时生效、非班组长拒绝均符合预期。");
  console.log(`隔离库：${process.env.DB_PATH}`);
  process.exitCode = 0;
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
