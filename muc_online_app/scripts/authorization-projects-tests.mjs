import {authorizationRows} from './authorization-test-rows.mjs';
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createAuthorizationProjects } from "../authorization-projects.mjs";

export async function testAuthorizationProjects({ request, cookie, db, authorizationProjects }) {
  const base = "/personnel/authorization-projects";
  const call = async (url, options = {}) => (await request(url, { cookie, ...options })).data;
  const create = async (projectCode, projectName, category = "maintenance", thirdPartyCompany = "") => (await call(base, { method: "POST", expected: 201, body: { projectCode, projectName, category, thirdPartyCompany } })).project;
  const authorizations = async person => (await call(`/personnel/${person.id}/qualifications?type=authorization&pageSize=100`)).items;
  const stage = async rows => (await call("/personnel/imports", { method: "POST", expected: 201, body: { type: "authorization", rows:authorizationRows(rows) } })).batch;
  const confirm = (batch, expected = 200) => call(`/personnel/imports/${batch.id}/confirm`, { method: "POST", body:{confirmReplacement:true}, expected });
  const snapshot = table => db.prepare(`select * from ${table} order by id`).all();
  const protectedTables = ["users", "rbac_roles", "rbac_permissions", "rbac_user_roles", "records", "maintenance_flights"];
  const protectedBefore = Object.fromEntries(protectedTables.filter(t => t !== "rbac_user_roles").map(t => [t, snapshot(t)]));
  const authBefore = snapshot("personnel_authorizations");

  const project = await create("  TEST-CODE  ", "标准名称");
  assert.equal(project.projectCode, "TEST-CODE");
  assert.equal(project.referenceCount, 0);
  await call(base, { method: "POST", expected: 409, body: { projectCode: "TEST-CODE ", projectName: "重复", category: "maintenance" } });
  await call(base, { method: "POST", expected: 400, body: { projectCode: " ", projectName: "名称", category: "maintenance" } });
  await call(base, { method: "POST", expected: 400, body: { projectCode: "EMPTY", projectName: " ", category: "maintenance" } });
  await call(base, { method: "POST", expected: 400, body: { projectCode: "BAD-CATEGORY", projectName: "错误分类", category: "unknown" } });
  await call(base, { method: "POST", expected: 400, body: { projectCode: "THIRD-MISSING", projectName: "三方缺公司", category: "third_party" } });
  const thirdParty = await create("THIRD-COMPANY", "测试航空A320", "third_party", "测试航空");
  assert.equal(thirdParty.thirdPartyCompany, "测试航空");
  await call(`${base}/${thirdParty.id}`, { method: "DELETE" });
  await call(base, { method: "POST", expected: 400, body: null });
  await call(`${base}/${project.id}`, { method: "PUT", expected: 400, body: [] });
  const lower = await create("test-code", "大小写不同代码");
  await call(`${base}/${lower.id}`, { method: "DELETE" });
  await call(`${base}/${project.id}`, { method: "PUT", expected: 400, body: { projectCode: "CHANGED", projectName: "变更", reason: "测试" } });
  await call(`${base}/${project.id}`, { method: "PUT", expected: 400, body: { projectName: " ", reason: "测试" } });
  await call(`${base}/${project.id}`, { method: "PUT", expected: 400, body: { projectName: "变更" } });
  for (let i = 0; i < 22; i++) await create(`PAGE-${String(i).padStart(2, "0")}`, `分页名称${i}`);
  const page = await call(`${base}?q=PAGE-&page=2&pageSize=20`);
  assert.equal(page.total, 22); assert.equal(page.items.length, 2); assert.equal(page.page, 2);
  assert.equal((await call(`${base}?q=${encodeURIComponent("分页名称21")}`)).total, 1);
  const wildcard = await create("CODE_%", "特殊字符");
  assert.equal((await call(`${base}?q=${encodeURIComponent("_%")}`)).total, 1);
  await call(`${base}/${wildcard.id}`, { method: "DELETE" });

  // Directory changes alone leave all existing records, accounts and business state untouched.
  await call(`${base}/${project.id}`, { method: "PUT", body: { projectName: "当前标准", reason: "统一名称" } });
  for (const [table, rows] of Object.entries(protectedBefore)) assert.deepEqual(snapshot(table), rows, table);
  assert.deepEqual(snapshot("personnel_authorizations"), authBefore);
  await call("/me");

  const people = (await call("/personnel?pageSize=5000")).items;
  const p1 = people.find(p => p.employeeNo === "70000001"), p2 = people.find(p => p.employeeNo === "54002010");
  const header = ["工号", "姓名", "项目代码", "授权状态", "授权有效期"];
  const b1 = await stage([header, [p1.employeeNo, p1.name, project.projectCode, "有效", "2030-01-01"], [p2.employeeNo, p2.name, project.projectCode, "暂停", "2029-02-02"]]);
  assert.equal(b1.summary.errors, 0); await confirm(b1);
  const d1 = (await authorizations(p1)).find(a => a.projectCode === project.projectCode);
  const d2 = (await authorizations(p2)).find(a => a.projectCode === project.projectCode);
  assert.equal(d1.projectName, "当前标准");
  const beforeRename = snapshot("personnel_authorizations");
  await call(`${base}/${project.id}`, { method: "PUT", body: { projectName: "统一新名称", reason: "改名测试" } });
  for (const [person, before] of [[p1, d1], [p2, d2]]) {
    const after = (await authorizations(person)).find(a => a.id === before.id);
    assert.deepEqual(after, { ...before, projectName: "统一新名称" });
  }
  assert.deepEqual(snapshot("personnel_authorizations"), beforeRename);
  await call(`/personnel/${p1.id}/qualifications/authorization/${d1.id}`, { method: "PUT", expected: 400, body: { projectName: "绕过目录", reason: "测试" } });
  await call(`/personnel/${p1.id}/qualifications/authorization/${d1.id}`, { method: "PUT", expected: 400, body: { projectCode: "CHANGED", reason: "测试" } });
  await call(`/personnel/${p1.id}/qualifications/authorization/${d1.id}`, { method: "DELETE", body: { reason: "测试作废引用" } });
  const denied = await call(`${base}/${project.id}`, { method: "DELETE", expected: 409 });
  assert.equal(denied.referenceCount, 2);
  assert.equal((await call(`${base}?q=TEST-CODE`)).items[0].referenceCount, 2);

  const mismatch = await stage([["工号", "姓名", "项目代码", "项目名称"], [p2.employeeNo, p2.name, project.projectCode, "Excel旧名称"]]);
  assert.equal(mismatch.summary.errors, 0); assert.equal(mismatch.summary.warnings, 1);
  await confirm(mismatch);
  assert.equal(authorizationProjects.getByCode(project.projectCode).project_name, "统一新名称");
  assert.equal(db.prepare("select project_name from personnel_authorizations where person_id=? and project_code=?").get(p2.id,project.projectCode).project_name, "Excel旧名称");
  const countBeforeUnknown = snapshot("personnel_authorizations");
  const unknown = await stage([header, [p2.employeeNo, p2.name, project.projectCode], [p2.employeeNo, p2.name, "UNKNOWN"], [p2.employeeNo, p2.name, ""]]);
  assert.equal(unknown.summary.errors, 3);
  assert.equal(unknown.issues.find(i=>i.detail.includes("UNKNOWN")).rowNumber, 3); assert.match(unknown.issues.find(i=>i.detail.includes("UNKNOWN")).detail, /UNKNOWN/);
  await confirm(unknown, 400); assert.deepEqual(snapshot("personnel_authorizations"), countBeforeUnknown);
  assert.equal(authorizationProjects.getByCode("UNKNOWN"), undefined);
  const blankRows = await stage([header, [p2.employeeNo, p2.name, project.projectCode], [], [p2.employeeNo, p2.name, "UNKNOWN"]]);
  assert.equal(blankRows.issues[0].rowNumber, 4);
  const excelRows = (await call("/personnel/imports", { method: "POST", expected: 201, body: { type: "authorization", rows: authorizationRows([header, [p2.employeeNo, p2.name, "UNKNOWN"]]), rowNumbers: [1, 9] } })).batch;
  assert.equal(excelRows.issues[0].rowNumber, 9);
  const temporary = await create("TEMP", "可删除");
  const stale = await stage([header, [p2.employeeNo, p2.name, project.projectCode], [p2.employeeNo, p2.name, "TEMP"]]);
  await call(`${base}/${temporary.id}`, { method: "DELETE" });
  const conflict = await confirm(stale, 409);
  assert.equal(conflict.issues[0].rowNumber, 3); assert.match(conflict.issues[0].detail, /TEMP/);
  assert.deepEqual(snapshot("personnel_authorizations"), countBeforeUnknown);
  assert.equal(db.prepare("select status from personnel_import_batches where id=?").get(stale.id).status, "pending");

  // Legacy records: preserve all rows; only unambiguous names can seed missing entries.
  const legacy = (code, name, n) => db.prepare("insert into personnel_authorizations(id,person_id,employee_no,project_code,project_name,authorization_status,authorization_unit,authorization_type,created_at,updated_at) values(?,?,?,?,?,'','',?,?,?)")
    .run(`legacy-${n}`, p1.id, p1.employeeNo, code, name, String(n), "2026-01-01", "2026-01-01");
  legacy("LEGACY-SINGLE", "历史标准", 1); legacy("LEGACY-SINGLE", "", 2);
  legacy("LEGACY-CONFLICT", "候选甲", 3); legacy("LEGACY-CONFLICT", "候选乙", 4);
  legacy("LEGACY-BLANK", "", 5); legacy(project.projectCode, "不能覆盖", 6);
  const beforeMigration = snapshot("personnel_authorizations");
  authorizationProjects.migrate(); authorizationProjects.migrate();
  assert.deepEqual(snapshot("personnel_authorizations"), beforeMigration);
  assert.equal(authorizationProjects.getByCode("LEGACY-SINGLE").project_name, "历史标准");
  assert.equal(authorizationProjects.getByCode(project.projectCode).project_name, "统一新名称");
  const pending = (await call(`${base}?q=LEGACY-CONFLICT`)).items[0];
  assert.equal(pending.configured, false); assert.equal(pending.candidateNames.length, 2);
  assert.equal((await authorizations(p1)).find(a => a.projectCode === "LEGACY-CONFLICT").projectName, "待配置名称（LEGACY-CONFLICT）");
  const pendingImport = await stage([header, [p1.employeeNo, p1.name, "LEGACY-CONFLICT"]]);
  assert.equal(pendingImport.summary.errors, 1); await confirm(pendingImport, 400);
  await call(`${base}/${pending.id}`, { method: "PUT", body: { projectName: "人工确认标准", category: "other", reason: "确认候选名称" } });
  const restaged = await stage([header, [p1.employeeNo, p1.name, "LEGACY-CONFLICT"]]);
  assert.equal(restaged.summary.errors, 0); await confirm(restaged);
  authorizationProjects.migrate();
  assert.equal(authorizationProjects.getByCode("LEGACY-CONFLICT").project_name, "人工确认标准");
  const dict = (await call("/personnel/dictionaries")).values.filter(v => v.category === "authorization_project");
  assert.equal(dict.filter(v => v.code === project.projectCode).length, 1);
  assert.equal(dict.find(v => v.code === project.projectCode).value, "统一新名称");

  // Exercise explicit read-only, manage-only, and no-qualification accounts.
  for (const [index, permissions] of [[1, ["personnel.qualification.view"]], [2, ["personnel.detail.view", "personnel.qualification.view", "personnel.qualification.manage"]], [3, ["personnel.list.view"]]]) {
    const role = (await call("/admin/roles", { method: "POST", expected: 201, body: { name: `目录测试角色${index}`, permissions } })).role;
    const person = (await call("/personnel", { method: "POST", expected: 201, body: { employeeNo: `8100000${index}`, name: `目录测试${index}` } })).person;
    await call("/admin/accounts", { method: "POST", expected: 201, body: { personId: person.id, username: `project-test-${index}`, password: "123456", mustChangePassword: false, roles: ["worker", role.code], scopes: [{ module:"personnel", scopeType: "self", scopeId: "" }] } });
    const session = await request("/login", { method: "POST", body: { username: `project-test-${index}`, password: "123456" } });
    await request(base, { cookie: session.cookie, expected: index === 3 ? 403 : 200 });
    if (index === 3) {
      await request(`/personnel/${person.id}`, { cookie: session.cookie, expected: 403 });
      const ownList = await request("/personnel", { cookie: session.cookie });
      assert.equal(ownList.data.items.some(item => item.id === person.id), true);
      assert.equal(Object.hasOwn(ownList.data.items[0], "licenseCount"), false);
    }
    if (index !== 2) {
      await request(base, { cookie: session.cookie, method: "POST", expected: 403, body: { projectCode: "DENIED", projectName: "禁止", category: "other" } });
      await request(`${base}/${project.id}`, { cookie: session.cookie, method: "PUT", expected: 403, body: { projectName: "禁止", reason: "禁止" } });
      await request(`${base}/${project.id}`, { cookie: session.cookie, method: "DELETE", expected: 403 });
    } else {
      const created = await request(base, { cookie: session.cookie, method: "POST", expected: 201, body: { projectCode: "MANAGER", projectName: "维护权限", category: "other" } });
      await request(`${base}/${created.data.project.id}`, { cookie: session.cookie, method: "PUT", body: { projectName: "维护改名", reason: "测试" } });
      await request(`${base}/${created.data.project.id}`, { cookie: session.cookie, method: "DELETE" });
      await request("/me", { cookie: session.cookie });
    }
  }
  await call(`${base}/categories`, { method: "PUT", body: { projectIds: [project.id], category: "special", reason: "批量分类测试" } });
  assert.equal((await call(`${base}?category=special`)).items.some(item => item.id === project.id), true);
  const actions = db.prepare("select action from audit_logs where target_type='authorizationProject'").all().map(row => row.action);
  for (const action of ["create_authorization_project", "update_authorization_project", "bulk_update_authorization_project_category", "delete_authorization_project", "reject_delete_authorization_project"]) assert.ok(actions.includes(action));
  const failureService = createAuthorizationProjects({ db, now: () => new Date().toISOString(), randomId: () => "rollback-test", audit: () => { throw new Error("audit test failure"); } });
  assert.throws(() => failureService.create({ projectCode: "ROLLBACK", projectName: "不应写入", category: "other" }, {}), /audit test failure/);
  assert.equal(authorizationProjects.getByCode("ROLLBACK"), undefined);
  const persisted = db.prepare("select project_name from capability_catalog where id=?").get(project.id);
  assert.throws(() => failureService.update(project.id, { projectName: "不应改名", reason: "回滚" }, {}), /audit test failure/);
  assert.deepEqual(db.prepare("select project_name from capability_catalog where id=?").get(project.id), persisted);
  const authorizationCount = snapshot("personnel_authorizations").length;
  const restart = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `const {db}=await import(${JSON.stringify(new URL("../server.mjs", import.meta.url).href)}); console.log(JSON.stringify({project:db.prepare("select project_name from capability_catalog where project_code='TEST-CODE'").get(),count:db.prepare("select count(*) as count from personnel_authorizations").get().count})); db.close();`], { env: { ...process.env, MUC_NO_LISTEN: "1" }, encoding: "utf8" }));
  assert.equal(restart.project.project_name, "统一新名称"); assert.equal(restart.count, authorizationCount);
  console.log("通过：授权目录增删改查、唯一标准名称、导入整批校验、确认时复验、历史冲突迁移、作废引用保护、读写权限与会话不变。");
}
