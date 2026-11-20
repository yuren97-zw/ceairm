// B1 身份分类隔离冒烟：临时目录 + MUC_NO_LISTEN + route() 直调（与 rbac-personnel-smoke 同模式）。
// 仅写 os.tmpdir() 下的临时 sqlite，不触碰任何业务库；不监听端口、不外连。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const appDir = path.resolve(import.meta.dirname, "..");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "muc-identity-smoke-"));
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

  // 导入 6 名人员覆盖全部分支：干部/班组长/已知普通/空职位/组合值/未知值。
  const staged = await request("/personnel/imports", {
    cookie: admin.cookie, method: "POST", expected: 201,
    body: {
      type: "personnel", fileName: "identity-smoke.xlsx",
      rows: [
        ["员工工号", "员工姓名", "部门", "人员分组", "行政班组", "职位", "用工状态"],
        ["88000001", "张一", "航线维修车间", "干部", "", "主任", "在职"],
        ["88000002", "张二", "航线维修车间", "干部", "", "班组长", "在职"],
        ["88000003", "张三", "航线维修车间", "干部", "", "维修人员", "在职"],
        ["88000004", "张四", "航线维修车间", "干部", "", "", "在职"],
        ["88000005", "张五", "航线维修车间", "干部", "", "主任/班组长", "在职"],
        ["88000006", "张六", "航线维修车间", "干部", "", "调度员", "在职"]
      ]
    }
  });
  assert.equal(staged.data.batch.summary.errors, 0, "人员导入应无阻断错误");
  await request(`/personnel/imports/${staged.data.batch.id}/confirm`, { cookie: admin.cookie, method: "POST", body: { confirmReplacement: true } });

  // 列表应携带身份分类字段，且与职位一一对应。
  const list = await request("/personnel?pageSize=50", { cookie: admin.cookie });
  const byNo = new Map(list.data.items.map(person => [person.employeeNo, person]));
  const expect = {
    "88000001": { identityClass: "cadre", identityLabel: "干部", identityQuality: "matched" },
    "88000002": { identityClass: "team_leader", identityLabel: "班组长", identityQuality: "matched" },
    "88000003": { identityClass: "worker", identityLabel: "普通员工", identityQuality: "matched" },
    "88000004": { identityClass: "worker", identityLabel: "普通员工", identityQuality: "empty" },
    "88000005": { identityClass: "worker", identityLabel: "普通员工", identityQuality: "unknown_value" },
    "88000006": { identityClass: "worker", identityLabel: "普通员工", identityQuality: "unknown_value" }
  };
  for (const [employeeNo, fields] of Object.entries(expect)) {
    const person = byNo.get(employeeNo);
    assert.ok(person, `缺少导入人员 ${employeeNo}`);
    for (const [key, value] of Object.entries(fields)) assert.equal(person[key], value, `${employeeNo}.${key}`);
    assert.equal(person.identitySource, "personnel.position_code");
    assert.ok(person.identityRulesVersion, `${employeeNo} 应携带规则版本`);
  }
  assert.equal(byNo.get("88000005").suspectedCombined, true, "组合值应标记 suspectedCombined");
  assert.ok(!byNo.get("88000006").suspectedCombined, "非组合未知值不应标记 suspectedCombined");

  // 数据质量清单端点：汇总与未知值明细。全员含 seed 的超账人员（赵威，职位为空→普通员工/empty）。
  const quality = await request("/personnel/identity-quality", { cookie: admin.cookie });
  assert.equal(quality.data.source, "personnel.position_code");
  assert.equal(quality.data.summary.total, 7);
  assert.equal(quality.data.summary.cadre, 1);
  assert.equal(quality.data.summary.teamLeader, 1);
  assert.equal(quality.data.summary.worker, 5);
  assert.equal(quality.data.summary.workerUnknownValues, 2);
  assert.equal(quality.data.summary.emptyPositions, 2);
  assert.equal(quality.data.summary.suspectedCombined, 1);
  assert.deepEqual(quality.data.unknownValues.map(item => item.employeeNo), ["88000005", "88000006"]);
  assert.deepEqual(Object.keys(quality.data.unknownValues[0]).sort(), ["employeeNo", "name", "position", "suspectedCombined"]);

  // 权限门槛：未登录 401；无 personnel.list.view 的 worker 账户 403。
  await request("/personnel/identity-quality", { expected: 401 });
  const person = byNo.get("88000003");
  await request("/admin/accounts", {
    cookie: admin.cookie, method: "POST", expected: 201,
    body: { personId: person.id, username: "worker-smoke", password: "123456", status: "active", mustChangePassword: false, roles: ["worker"], scopes: [{ module: "personnel", scopeType: "self", scopeId: "" }] }
  });
  const worker = await login("worker-smoke", "123456");
  await request("/personnel/identity-quality", { cookie: worker.cookie, expected: 403 });
  await request("/personnel?pageSize=10", { cookie: worker.cookie, expected: 403 });

  console.log("身份分类隔离冒烟通过：6 人样本、列表字段、质量清单、401/403 门槛均符合预期。");
  console.log(`隔离库：${process.env.DB_PATH}`);
  process.exitCode = 0;
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
