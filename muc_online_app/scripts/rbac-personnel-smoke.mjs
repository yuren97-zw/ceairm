import {authorizationRows} from './authorization-test-rows.mjs';
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { testAuthorizationProjects } from "./authorization-projects-tests.mjs";
import { testPersonnelDeletion } from "./personnel-deletion-tests.mjs";
import { testPersonnelAccess } from "./personnel-access-tests.mjs";
import { testOrganizationMaintenance } from "./organization-maintenance-tests.mjs";
import { testAuthorizationReplacement } from "./authorization-replacement-tests.mjs";
import { testImportWorkspace } from "./import-workspace-tests.mjs";

const appDir = path.resolve(import.meta.dirname, "..");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "muc-rbac-smoke-"));
process.env.NODE_ENV = "test";
process.env.MUC_NO_LISTEN = "1";
process.env.DATABASE_URL = "";
process.env.DB_PATH = path.join(tempDir, "test.sqlite");
process.env.UPLOAD_DIR = path.join(tempDir, "uploads");
const { route, seedRbac, db, authorizationProjects, personnelAccess } = await import(path.join(appDir, "server.mjs"));

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
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
  }
  writeHead(status, headers = {}) {
    this.statusCode = status;
    this.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  }
  write(chunk) { if (chunk) this.chunks.push(Buffer.from(String(chunk))); }
  end(chunk) { if (chunk) this.chunks.push(Buffer.from(String(chunk))); }
}

async function request(pathname, { cookie = "", method = "GET", body, expected = 200 } = {}) {
  const headers = {
    host: "127.0.0.1:8788",
    origin: "http://127.0.0.1:8788",
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

async function importAndConfirm(cookie, type, rows) {
  if(type==="authorization")rows=authorizationRows(rows);
  const staged = await request("/personnel/imports", {
    cookie,
    method: "POST",
    expected: 201,
    body: { type, fileName: `${type}.xlsx`, rows }
  });
  assert.equal(staged.data.batch.summary.errors, 0, `${type} 导入应无阻断错误`);
  await request(`/personnel/imports/${staged.data.batch.id}/confirm`, { cookie, method: "POST", body:{confirmReplacement:true} });
}

try {
  const admin = await login("54002010", "muc2026");
  assert.ok(admin.data.user.rbacPermissions.includes("personnel.import.execute"));
  const fixedOrganizations=(await request("/personnel/organizations",{cookie:admin.cookie})).data.organizations;
  assert.ok(fixedOrganizations.every(item=>!("code" in item)));
  const byCode=new Map(db.prepare("select code,id from organization_units").all().map(row=>[row.code,fixedOrganizations.find(item=>item.id===row.id)]));
  assert.equal(byCode.get("GROUP-LINE-CADRE").parentId,byCode.get("DEPT-LINE").id);
  assert.equal(byCode.get("GROUP-LINE-SPECIAL").parentId,byCode.get("DEPT-LINE").id);
  assert.equal(byCode.get("TEAM-LINE-3").parentId,byCode.get("GROUP-LINE-1").id);
  assert.equal(byCode.get("TEAM-LINE-1").parentId,byCode.get("GROUP-LINE-2").id);
  assert.ok(["DEPT-LINE","GROUP-LINE-CADRE","GROUP-LINE-SPECIAL","GROUP-LINE-1","GROUP-LINE-2","TEAM-LINE-1","TEAM-LINE-2","TEAM-LINE-3","TEAM-LINE-4"].every(code=>byCode.get(code)?.fixed));
  await request(`/personnel/organizations/${byCode.get("DEPT-LINE").id}`,{cookie:admin.cookie,method:"PUT",body:{name:"航线维修车间",reason:"验证预置可修改"}});
  admin.cookie=(await login("54002010","muc2026")).cookie;
  await request(`/personnel/organizations/${byCode.get("GROUP-LINE-CADRE").id}`,{cookie:admin.cookie,method:"DELETE",expected:403,body:{reason:"预置保护"}});
  assert.equal(byCode.get("GROUP-LINE-CADRE").type,"personnel_group");
  assert.equal(byCode.get("GROUP-LINE-1").type,"personnel_group");
  assert.equal(byCode.get("GROUP-LINE-1").maintenanceEligible,true);
  assert.equal(byCode.get("GROUP-LINE-SPECIAL").maintenanceEligible,true);
  const orgs={};
  for(const name of ["维修部","新维修部"]){
    const org=(await request("/personnel/organizations",{cookie:admin.cookie,method:"POST",expected:201,body:{name,type:"department"}})).data;
    const group=(await request("/personnel/organizations",{cookie:admin.cookie,method:"POST",expected:201,body:{name:name+"分组",type:"personnel_group",parentId:org.id,maintenanceEligible:true}})).data;
    orgs[name]={department:org,group,teams:{}};
    for(const team of ["一班","二班","三班"])orgs[name].teams[team]=(await request("/personnel/organizations",{cookie:admin.cookie,method:"POST",expected:201,body:{name:team,type:"administrative_team",parentId:group.id}})).data;
  }

  await importAndConfirm(admin.cookie, "personnel", [
    ["员工工号", "员工姓名", "部门", "人员分组", "行政班组", "职位", "用工状态"],
    ["70000001", "测试人员", "维修部", "维修部分组", "一班", "机务", "在职"],
    ["70000008", "特殊班组测试人员", "航线维修车间", "特殊班组", "", "机务", "在职"]
  ]);
  await request("/personnel/imports",{cookie:admin.cookie,method:"POST",expected:400,body:{type:"personnel",rows:[["员工工号","员工姓名","人员分类","行政班组"],["70000009","旧表头","干部","一组"]]}});
  await importAndConfirm(admin.cookie, "license", [
    ["员工工号", "人员姓名", "执照类型", "执照号码", "是否有效"],
    ["70000001", "测试人员", "CCAR-66", "L-001", "是"]
  ]);
  await request("/personnel/authorization-projects", { cookie: admin.cookie, method: "POST", expected: 201, body: { projectCode: "A320-MECH", projectName: "A320机械", category: "maintenance" } });
  await importAndConfirm(admin.cookie, "authorization", [
    ["工号", "姓名", "项目代码", "项目名称", "授权类型", "授权状态"],
    ["70000001", "测试人员", "A320-MECH", "A320机械", "机型", "有效"]
  ]);
  await importAndConfirm(admin.cookie, "training", [
    ["人员工号", "人员姓名", "课程代码", "课程名称", "开始时间", "培训结果"],
    ["70000001", "测试人员", "TR-001", "安全培训", "2026-08-01", "合格"]
  ]);

  const imports = await request("/personnel/imports", { cookie: admin.cookie });
  assert.equal(imports.data.batches.length, 4, "导入列表路由应返回四个批次");
  const personnel = await request("/personnel", { cookie: admin.cookie });
  const superPersonnel=personnel.data.items.find(item=>item.employeeNo==="54002010");
  assert.equal(superPersonnel.personnelGroupName,"干部");assert.equal(superPersonnel.organizationStatus,"complete");assert.equal(superPersonnel.administrativeTeamId,"");assert.equal(superPersonnel.currentWorkingTeamId,"");
  assert.ok(personnel.data.facets.total >= 2);
  const person = personnel.data.items.find(item => item.employeeNo === "70000001");
  const specialPerson=personnel.data.items.find(item=>item.employeeNo==="70000008");
  assert.equal(specialPerson.personnelGroupName,"特殊班组");assert.equal(specialPerson.administrativeTeamId,"");assert.equal(specialPerson.organizationStatus,"complete");
  const detail = await request(`/personnel/${person.id}`, { cookie: admin.cookie });
  assert.deepEqual(detail.data.qualificationCounts, { license: 1, authorization: 1, training: 1 });
  assert.equal(detail.data.authorizationCategoryCounts.maintenance, 1);
  assert.equal(Object.values(detail.data.authorizationCategoryCounts).reduce((sum, count) => sum + count, 0), 1);
  const licenses = await request(`/personnel/${person.id}/qualifications?type=license`, { cookie: admin.cookie });
  const authorizations = await request(`/personnel/${person.id}/qualifications?type=authorization`, { cookie: admin.cookie });
  const training = await request(`/personnel/${person.id}/qualifications?type=training`, { cookie: admin.cookie });
  assert.equal(licenses.data.total, 1); assert.equal(authorizations.data.total, 1); assert.equal(training.data.total, 1);
  await request(`/personnel/${person.id}/qualifications/license/${licenses.data.items[0].id}`, {
    cookie: admin.cookie, method: "PUT", body: { isValid: "有效", remark: "回归验证", reason: "校正执照状态" }
  });
  const changedLicenses = await request(`/personnel/${person.id}/qualifications?type=license`, { cookie: admin.cookie });
  assert.equal(changedLicenses.data.items[0].remark, "回归验证");
  await request("/personnel", { cookie: admin.cookie, method: "POST", expected: 400, body: { employeeNo: "7000002", name: "七位工号" } });
  await request("/personnel", { cookie: admin.cookie, method: "POST", expected: 400, body: { employeeNo: "70000002", name: "" } });
  const manualPerson = await request("/personnel", {
    cookie: admin.cookie,
    method: "POST",
    expected: 201,
    body: { employeeNo:"70000002",name:"单独录入人员",departmentId:orgs["维修部"].department.id,personnelGroupId:orgs["维修部"].group.id,administrativeTeamId:orgs["维修部"].teams["二班"].id,position:"电子",employmentStatus:"在职" }
  });
  assert.equal(manualPerson.data.person.employeeNo, "70000002");
  await request(`/personnel/${manualPerson.data.person.id}`, {
    cookie: admin.cookie, method: "PUT",
    body:{departmentId:orgs["新维修部"].department.id,personnelGroupId:orgs["新维修部"].group.id,administrativeTeamId:orgs["新维修部"].teams["三班"].id,reason:"回归验证人工修改"}
  });
  const changes = await request(`/personnel/${manualPerson.data.person.id}/changes`, { cookie: admin.cookie });
  assert.equal(db.prepare("select department from personnel where id=?").get(manualPerson.data.person.id).department,"新维修部");
  const filteredPersonnel = await request("/personnel?department=%E6%96%B0%E7%BB%B4%E4%BF%AE%E9%83%A8&pageSize=20", { cookie: admin.cookie });
  assert.equal(filteredPersonnel.data.items.length, 1);
  await request("/personnel", { cookie: admin.cookie, method: "POST", expected: 409, body: { employeeNo: "70000002", name: "重复工号" } });

  const rbac = await request("/admin/rbac", { cookie: admin.cookie });
  assert.ok(rbac.data.roles.some(role => role.code === "system_admin"));
  assert.ok(rbac.data.permissions.some(permission => permission.code === "maintenance.view"));
  assert.ok(rbac.data.permissions.some(permission => permission.name === "查看维修管控"));
  assert.ok(rbac.data.roles.every(role => Array.isArray(role.permissionDetails)));

  const createdRole = await request("/admin/roles", {
    cookie: admin.cookie,
    method: "POST",
    expected: 201,
    body: { name: "回归测试角色", description: "用于验证角色管理", permissions: ["info.read"] }
  });
  assert.equal(createdRole.data.role.systemRole, false);
  assert.equal(createdRole.data.role.assignedUserCount, 0);
  assert.equal(createdRole.data.role.permissionDetails[0].name, "查看信息传达");

  const workerRole = rbac.data.roles.find(role => role.code === "worker");
  const workerDefaults = { name: workerRole.name, description: workerRole.description, permissions: workerRole.permissions };
  await request(`/admin/roles/${workerRole.id}`, {
    cookie: admin.cookie,
    method: "PUT",
    body: { name: "工作者（受控测试）", description: "由超级管理员受控调整", permissions: ["info.read", "maintenance.view"] }
  });
  seedRbac();
  const rbacAfterReseed = await request("/admin/rbac", { cookie: admin.cookie });
  const retainedWorkerRole = rbacAfterReseed.data.roles.find(role => role.code === "worker");
  assert.equal(retainedWorkerRole.name, "工作者（受控测试）");
  assert.deepEqual(retainedWorkerRole.permissions, ["info.read", "maintenance.view"]);
  assert.ok(!retainedWorkerRole.permissions.includes("info.create"));
  await request(`/admin/roles/${workerRole.id}`, {
    cookie: admin.cookie,
    method: "PUT",
    expected: 400,
    body: { name: "依赖不完整", description: "应被阻止", permissions: ["maintenance.execute.submit"] }
  });
  const systemAdminRole = rbac.data.roles.find(role => role.code === "system_admin");
  await request(`/admin/roles/${systemAdminRole.id}`, {
    cookie: admin.cookie,
    method: "PUT",
    expected: 403,
    body: { name: "不应修改", description: "系统管理员必须锁定", permissions: ["info.read"] }
  });
  await request(`/admin/roles/${workerRole.id}`, { cookie: admin.cookie, method: "PUT", body: workerDefaults });
  await request(`/admin/roles/${workerRole.id}`, { cookie: admin.cookie, method: "DELETE", expected: 400 });

  assert.ok(rbac.data.permissions.some(permission => permission.code === "hours.read"));
  assert.ok(rbac.data.permissions.some(permission => permission.code === "attendance.read"));
  const managerRole = rbac.data.roles.find(role => role.code === "manager");
  const publisherAccount = await request("/admin/accounts", {
    cookie: admin.cookie,
    method: "POST",
    expected: 201,
    body: { personId: person.id, username: "publisher-test", password: "123456", status: "active", mustChangePassword: false, roles: [managerRole.code], scopes: [{ module:"info", scopeType: "all", scopeId: "" }] }
  });
  const receiverAccount = await request("/admin/accounts", {
    cookie: admin.cookie,
    method: "POST",
    expected: 201,
    body: { personId: manualPerson.data.person.id, username: "receiver-test", password: "123456", status: "active", mustChangePassword: false, roles: [workerRole.code, "addon_account_role_manage"], scopes: [{ module:"info", scopeType: "self", scopeId: "" }] }
  });
  const publisher = await login("publisher-test", "123456");
  const receiver = await login("receiver-test", "123456");
  await request(`/admin/roles/${workerRole.id}`, { cookie: receiver.cookie, method: "PUT", expected: 403, body: workerDefaults });
  const record = await request("/records", {
    cookie: publisher.cookie,
    method: "POST",
    expected: 201,
    body: {
      date: "2026-08-16",
      category: "其他",
      title: "纯 RBAC 回归",
      original: "验证信息传达权限与数据范围。",
      recipients: [manualPerson.data.person.id]
    }
  });
  const receiverRecords = await request("/records", { cookie: receiver.cookie });
  assert.ok(receiverRecords.data.records.some(item => item.id === record.data.record.id));

  await request("/personnel/activate", { cookie: admin.cookie, method: "POST", expected: 404, body: { active: true } });
  await request("/admin/users", { cookie: admin.cookie, expected: 410 });
  await request("/admin/accounts/54002010", { cookie: admin.cookie, method: "PUT", expected: 403, body: { status: "disabled", roles: [workerRole.code], scopes: [{ module:"info", scopeType: "self", scopeId: "" }] } });
  await request("/admin/accounts/54002010", { cookie: admin.cookie, method: "DELETE", expected: 403 });
  await request("/admin/accounts/54002010/reset-password", { cookie: admin.cookie, method: "POST", expected: 403, body: { password: "654321" } });

  await request(`/admin/accounts/${publisherAccount.data.account.id}`, {
    cookie: admin.cookie,
    method: "PUT",
    body: { personId: person.id, status: "active", roles: [workerRole.code, createdRole.data.role.code], scopes: [{ module:"info", scopeType: "all", scopeId: "" }] }
  });
  await request("/me", { cookie: publisher.cookie, expected: 401 });
  const publisherWithCustomRole = await login("publisher-test", "123456");
  const assignedDelete = await request(`/admin/roles/${createdRole.data.role.id}`, { cookie: admin.cookie, method: "DELETE", expected: 409 });
  assert.equal(assignedDelete.data.assignedUserCount, 1);
  await request(`/admin/roles/${createdRole.data.role.id}`, {
    cookie: admin.cookie,
    method: "PUT",
    body: { name: "回归测试角色", description: "权限已调整", permissions: ["info.read", "maintenance.view"] }
  });
  await request("/me", { cookie: publisherWithCustomRole.cookie, expected: 401 });
  const bulkPerson = await request("/personnel", {
    cookie: admin.cookie,
    method: "POST",
    expected: 201,
    body: { employeeNo: "70000003", name: "批量开户人员", department: "维修部", homeTeam: "三班", employmentStatus: "在职" }
  });
  const rejectedAccountImport = await request("/admin/accounts/bulk-open", {
    cookie: admin.cookie,
    method: "POST",
    expected: 400,
    body: { rows: [{ employeeNo: "99999999", username: "invalid-account", password: "123456", roles: "工作者", scopes: [] }] }
  });
  assert.equal(rejectedAccountImport.data.errors.length, 1);
  await request(`/admin/accounts/${receiverAccount.data.account.id}`, { cookie: admin.cookie, method: "DELETE" });
  await request("/admin/accounts/bulk-open", {
    cookie: admin.cookie,
    method: "POST",
    expected: 201,
    body: { rows: [{ employeeNo: "70000003", username: "rbac-new-user", password: "123456", status: "active", roles: "工作者", scopes: [] }] }
  });
  const usersAfterNewAccount = await request("/admin/accounts", { cookie: admin.cookie });
  const importedAccount = usersAfterNewAccount.data.accounts.find(item => item.username === "rbac-new-user");
  assert.equal(importedAccount.personId, bulkPerson.data.person.id);
  assert.equal(importedAccount.name, "批量开户人员");
  assert.ok(importedAccount.rbacRoles.some(role => role.code === "worker"));
  assert.ok(importedAccount.dataScopes.some(scope => scope.scopeType === "self"));
  await request("/admin/accounts/bulk-open", {
    cookie: admin.cookie,
    method: "POST",
    expected: 400,
    body: { rows: [{ employeeNo: "70000003", username: "another-account", password: "123456", roles: "工作者", scopes: [] }] }
  });
  await request(`/admin/accounts/${publisherAccount.data.account.id}`, {
    cookie: admin.cookie,
    method: "PUT",
    body: { personId: person.id, status: "active", roles: [managerRole.code], scopes: [{ module:"info", scopeType: "all", scopeId: "" }] }
  });
  await request(`/admin/roles/${createdRole.data.role.id}`, { cookie: admin.cookie, method: "DELETE" });
  const adminStillFullAccess = await request("/admin/rbac", { cookie: admin.cookie });
  assert.ok(adminStillFullAccess.data.roles.length > 0, "54002010 应作为单一正常账号保留全部管理权限");

  await request("/me", { cookie: receiver.cookie, expected: 401 });
  const usersAfterDisable = await request("/admin/accounts", { cookie: admin.cookie });
  assert.equal(usersAfterDisable.data.accounts.find(item => item.id === receiverAccount.data.account.id)?.status, "disabled");
  const adminRecords = await request("/records", { cookie: admin.cookie });
  const retainedRecord = adminRecords.data.records.find(item => item.id === record.data.record.id);
  assert.ok(retainedRecord?.recipients.some(item => item.id === receiverAccount.data.account.id), "停用账户不应删除历史接收关系");
  await testAuthorizationProjects({ request, cookie: admin.cookie, db, authorizationProjects });
  await testPersonnelDeletion({ request, cookie: admin.cookie, db });
  await testPersonnelAccess({ request, cookie: admin.cookie, db, personnelAccess });
  await testOrganizationMaintenance({ request, cookie: admin.cookie, db, personnelAccess });
  await testAuthorizationReplacement({ request, cookie: admin.cookie, db });
  await testImportWorkspace({ request, cookie: admin.cookie, db });
  await request("/change-password", { cookie: admin.cookie, method: "POST", body: { oldPassword: "muc2026", newPassword: "muc2026-new" } });
  await request("/me", { cookie: admin.cookie, expected: 401 });
  const superAfterPasswordChange = await login("54002010", "muc2026-new");
  assert.equal(superAfterPasswordChange.data.user.name, "赵威");

  const appSource = await fs.readFile(path.join(appDir, "public", "app.js"), "utf8");
  assert.ok(appSource.includes("人员与能力") && appSource.includes("维修管控"));
  assert.ok(appSource.includes("visibleNavigation"), "一级导航应使用服务端计算的可见节点");
  assert.ok(!appSource.includes('hasPermission("hours.read")') && !appSource.includes('hasPermission("attendance.read")'), "前端不应自行重复推导一级导航权限");
  assert.ok(!appSource.includes("state.user.role"));
  assert.ok(!appSource.includes("allowedTabs"));
  assert.ok(!appSource.includes("(${escapeHtml(role.code)})"), "角色页不应把技术编码作为可见名称展示");

  console.log("通过：唯一超级账号保护、纯 RBAC 开户、冲突整批回滚、角色与会话、四类人员导入、信息传达及预留页面权限回归测试。");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
