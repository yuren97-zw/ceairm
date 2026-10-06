import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import vm from "node:vm";
import { createPersonnelDeletion } from "../personnel-deletion.mjs";

export async function testPersonnelDeletion({ request, cookie, db }) {
  const call = async (url, options = {}) => (await request(url, { cookie, ...options })).data;
  const createPerson = async (employeeNo, name) => (await call("/personnel", { method: "POST", expected: 201, body: { employeeNo, name } })).person;
  const person = await createPerson("84000001", "删除回归人员");
  const replacement = await createPerson("84000002", "替换回归人员");
  const role = (await call("/admin/roles", { method: "POST", expected: 201, body: { name: "删除回归普通管理员", permissions: ["personnel.list.view", "personnel.detail.view", "personnel.profile.update", "personnel.qualification.view", "personnel.qualification.manage", "info.read", "maintenance.view"] } })).role;
  const account = (await call("/admin/accounts", { method: "POST", expected: 201, body: { personId: person.id, username: "deletion-test", password: "123456", mustChangePassword: false, roles: ["worker", role.code], scopes: [{ module:"personnel", scopeType: "self", scopeId: "" }] } })).account;
  const session = await request("/login", { method: "POST", body: { username: account.username, password: "123456" } });
  const payload = { employeeNo: person.employeeNo, reason: "独立测试安全删除" };
  const endpoint = `/personnel/${person.id}`;
  const remove = (body = payload, expected = 200) => call(endpoint, { method: "DELETE", body, expected });
  await request(endpoint, { method: "DELETE", body: payload, expected: 401 });
  await request(endpoint, { method: "DELETE", cookie: session.cookie, body: payload, expected: 403 });
  await request(`${endpoint}/deletion-preview`, { cookie: session.cookie, expected: 403 });
  const superPerson = db.prepare("select id from personnel where employee_no='54002010'").get();
  await call(`/personnel/${superPerson.id}`, { method: "DELETE", expected: 403, body: { employeeNo: "54002010", reason: "禁止自删" } });
  await remove({ employeeNo: "84000002", reason: "工号不匹配" }, 400);
  await remove({ employeeNo: person.employeeNo, reason: " " }, 400);

  const imports = {
    personnel: [["员工工号", "员工姓名"], [person.employeeNo, person.name]],
    license: [["员工工号", "人员姓名", "执照类型", "执照号码"], [person.employeeNo, person.name, "维修执照", "SAFE-LICENSE"]],
    authorization: [["工号","姓名","项目代码","授权类型","授权单位","授权状态"],[person.employeeNo,person.name,"TEST-CODE","145","本单位","有效"]],
    training: [["人员工号", "人员姓名", "课程代码", "课程名称"], [person.employeeNo, person.name, "SAFE-COURSE", "保留历史培训"]]
  };
  const stage = async (type, rows) => (await call("/personnel/imports", { method: "POST", expected: 201, body: { type, rows } })).batch;
  const pending = [];
  for (const [type, rows] of Object.entries(imports)) {
    const first = await stage(type, rows);
    assert.equal(first.summary.errors, 0);
    await call(`/personnel/imports/${first.id}/confirm`, { method: "POST", body:{confirmReplacement:true} });
    pending.push(await stage(type, rows));
  }
  const infoBody = { date: "2026-08-31", category: "其他", title: "保留删除人员信息历史", original: "安全删除测试", recipients: [person.id] };
  const record = (await call("/records", { method: "POST", expected: 201, body: infoBody })).record;
  db.prepare("insert into read_receipts(record_id,user_id,read_at,is_overdue) values(?,?,?,0)").run(record.id, account.id, "2026-08-31");
  const flight = (await call("/maintenance/flights", { method: "POST", expected: 201, body: { date: "2026-08-31", flightNo: "SAFE001", aircraftNo: "B-SAFE", workKind: "航后" } })).flight;
  const insertAssignment = (id, userId, status = "已派工") => db.prepare("insert into maintenance_assignments(id,owner_type,owner_id,flight_id,person_id,user_name,role,status) values(?,'flight',?,?,?,?,'例行机内',?)").run(id, flight.id, flight.id, userId, person.name, status);
  // Check both identity forms; also recheck after a previously successful preview.
  assert.equal((await call(`${endpoint}/deletion-preview`)).canDelete, true);
  insertAssignment("delete-test-person-id", person.id);
  insertAssignment("delete-test-account-id", person.id, "待复核");
  assert.throws(()=>insertAssignment("invalid-account-identity",account.id),/人员已删除/);
  let impact = await call(`${endpoint}/deletion-preview`);
  assert.equal(impact.canDelete, false); assert.equal(impact.blockers.length, 2);
  assert.deepEqual(impact.counts, { licenses: 1, authorizations: 1, training: 1 });
  const blocked = await remove(payload, 409);
  assert.equal(blocked.blockers.length, 2);
  assert.equal(db.prepare("select data_status from personnel where id=?").get(person.id).data_status, "active");
  await request("/me", { cookie: session.cookie });
  db.prepare("update maintenance_assignments set person_id=?,user_name=? where id='delete-test-person-id'").run(replacement.id, replacement.name);
  await remove(payload, 409);
  db.prepare("update maintenance_assignments set status='已确认' where id='delete-test-account-id'").run();
  impact = await call(`${endpoint}/deletion-preview`);
  assert.equal(impact.canDelete, true);

  const personBefore = db.prepare("select * from personnel where id=?").get(person.id);
  const accountBefore = db.prepare("select * from users where id=?").get(account.id);
  const sessionsBefore = db.prepare("select * from sessions where user_id=? order by id").all(account.id);
  let cacheCleared = false;
  const failing = createPersonnelDeletion({ db, now: () => new Date().toISOString(), randomId: () => "rollback-delete", superAccountId: "54002010", clearSessionCache: () => { cacheCleared = true; }, audit: () => { throw new Error("audit failure"); } });
  assert.throws(() => failing.remove(person.id, payload, { id: "54002010", name: "测试" }), /audit failure/);
  assert.deepEqual(db.prepare("select * from personnel where id=?").get(person.id), personBefore);
  assert.deepEqual(db.prepare("select * from users where id=?").get(account.id), accountBefore);
  assert.deepEqual(db.prepare("select * from sessions where user_id=? order by id").all(account.id), sessionsBefore);
  assert.equal(cacheCleared, false);
  await request("/me", { cookie: session.cookie });

  const historyTables = ["personnel_licenses", "personnel_authorizations", "personnel_training_records", "personnel_field_overrides", "records", "record_recipients", "read_receipts", "maintenance_flights", "maintenance_assignments", "maintenance_hour_results", "maintenance_sortie_results", "rbac_roles", "rbac_user_roles", "rbac_user_scopes"];
  const histories = Object.fromEntries(historyTables.map(table => [table, db.prepare(`select * from ${table}`).all()]));
  const others = db.prepare("select * from users where id<>? order by id").all(account.id);
  const deletion = await remove();
  assert.equal(deletion.alreadyDeleted, false); assert.deepEqual(deletion.disabledAccountIds, [account.id]);
  for (const [table, rows] of Object.entries(histories)) assert.deepEqual(db.prepare(`select * from ${table}`).all(), rows, `历史数据未变: ${table}`);
  assert.deepEqual(db.prepare("select * from users where id<>? order by id").all(account.id), others);
  const deleted = db.prepare("select * from personnel where id=?").get(person.id);
  assert.equal(deleted.data_status, "deleted"); assert.equal(deleted.employment_status, personBefore.employment_status);
  assert.equal(deleted.delete_reason, payload.reason); assert.equal(deleted.deleted_by, "54002010"); assert.ok(deleted.deleted_at);
  assert.equal((await call("/personnel?pageSize=5000")).items.some(p => p.id === person.id), false);
  assert.equal((await call("/personnel/directory?purpose=maintenance")).items.some(p => p.personId === person.id), false);
  const accounts = (await call("/admin/accounts")).accounts;
  assert.equal(accounts.find(a => a.id === account.id).personDeleted, true);
  assert.equal(accounts.find(a => a.id === account.id).status, "disabled");
  await request("/me", { cookie: session.cookie, expected: 401 });
  await call("/login", { method: "POST", expected: 403, body: { username: account.username, password: "123456" } });
  const version = db.prepare("select credential_version from users where id=?").get(account.id).credential_version;
  assert.equal((await remove()).alreadyDeleted, true);
  assert.equal(db.prepare("select credential_version from users where id=?").get(account.id).credential_version, version);
  assert.equal(db.prepare("select count(*) as n from audit_logs where action='delete_personnel' and target_id=?").get(person.id).n, 1);
  assert.ok(db.prepare("select count(*) as n from audit_logs where action='reject_delete_personnel' and target_id=?").get(person.id).n >= 4);

  await call(endpoint, { method: "PUT", expected: 404, body: { name: "恢复", reason: "禁止恢复" } });
  await call("/personnel", { method: "POST", expected: 409, body: { employeeNo: person.employeeNo, name: "重复创建" } });
  for (const [type, rows] of Object.entries(imports)) {
    const bad = await stage(type, rows);
    assert.ok(bad.issues.some(issue => issue.issueType === "deleted_person" && issue.rowNumber === 2));
    await call(`/personnel/imports/${bad.id}/confirm`, { method: "POST", body:{confirmReplacement:true}, expected: 400 });
  }
  for (const batch of pending) {
    const rejected = await call(`/personnel/imports/${batch.id}/confirm`, { method: "POST", body:{confirmReplacement:true}, expected: 409 });
    assert.match(rejected.issues[0].detail, /84000001/);
    assert.equal(db.prepare("select status from personnel_import_batches where id=?").get(batch.id).status, "pending");
  }
  const accountPayload = { personId: person.id, username: "deleted-new", password: "123456", roles: ["worker", role.code], scopes: [{ module:"personnel", scopeType: "self", scopeId: "" }] };
  await call("/admin/accounts", { method: "POST", expected: 404, body: accountPayload });
  await call(`/admin/accounts/${account.id}`, { method: "PUT", expected: 409, body: { ...accountPayload, personId: replacement.id, status: "active" } });
  await call(`/admin/accounts/${account.id}/reset-password`, { method: "POST", expected: 409, body: { password: "654321" } });
  await call("/admin/accounts/bulk-open", { method: "POST", expected: 400, body: { rows: [{ employeeNo: person.employeeNo, username: account.username, password: "123456", roles: ["worker", role.code], scopes: [] }] } });
  await call(`/maintenance/flights/${flight.id}/dispatch`, { method: "POST", expected: 400, body: { expectedUpdatedAt: flight.updatedAt, assignments: [{ personId: person.id, role: "例行机内" }] } });
  assert.throws(() => db.prepare("update personnel set data_status='active' where id=?").run(person.id), /人员已删除/);
  assert.throws(() => db.prepare("update users set status='active' where id=?").run(account.id), /人员已删除/);
  assert.throws(() => db.prepare("update users set person_id=? where id=?").run(replacement.id, account.id), /人员已删除/);
  assert.throws(() => insertAssignment("forbidden-person", person.id), /人员已删除/);
  assert.throws(() => insertAssignment("forbidden-account", account.id), /人员已删除/);
  const newRecord = (await call("/records", { method: "POST", expected: 201, body: { ...infoBody, recipients:[],allInScope:true,title: "新信息排除删除人员" } })).record;
  assert.equal(newRecord.recipients.some(p => p.id === account.id), false);
  assert.throws(() => db.prepare("insert into record_recipients(record_id,user_id,name,department,team) values(?,?,?,'','')").run(newRecord.id, account.id, person.name), /人员已删除/);
  await call(`/records/${record.id}`, { method: "PUT", body: { ...infoBody, recipients: [],allInScope:true,title: "历史信息仍保留原接收者" } });
  assert.ok(db.prepare("select 1 from record_recipients where record_id=? and user_id=?").get(record.id, account.id));
  assert.ok(db.prepare("select 1 from read_receipts where record_id=? and user_id=?").get(record.id, account.id));
  const authProject = (await call("/personnel/authorization-projects?q=TEST-CODE")).items[0];
  assert.equal(authProject.referenceCount, db.prepare("select count(*) as n from personnel_authorizations where project_code='TEST-CODE'").get().n);

  const restarted = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `const {db}=await import(${JSON.stringify(new URL("../server.mjs", import.meta.url).href)}); console.log(JSON.stringify({p:db.prepare("select data_status from personnel where employee_no='84000001'").get(),u:db.prepare("select status from users where username='deletion-test'").get()})); db.close();`], { env: { ...process.env, MUC_NO_LISTEN: "1" }, encoding: "utf8" }));
  assert.equal(restarted.p.data_status, "deleted"); assert.equal(restarted.u.status, "disabled");
  // A person without an account can also be deleted. Archived assignments do not block.
  db.prepare("update maintenance_flights set archived_at='2026-08-31' where id=?").run(flight.id);
  await call(`/personnel/${replacement.id}`, { method: "DELETE", body: { employeeNo: replacement.employeeNo, reason: "归档派工不阻断" } });
  const source = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const start = source.indexOf("function personnelDeleteButton(");
  const end = source.indexOf('document.addEventListener("click"', start);
  const body = { innerHTML: "" }, dialog = { showModal() {} };
  const ui = vm.createContext({ state: { user: { id: "54002010" } }, SUPER_ACCOUNT_ID: "54002010",
    escapeHtml: value => String(value).replaceAll("<", "&lt;").replaceAll('"', "&quot;"),
    $: selector => selector.endsWith("Body") ? body : dialog,
    apiRequest: async () => ({ ...impact, canDelete: false, blockers: blocked.blockers }) });
  vm.runInContext(source.slice(start, end), ui);
  assert.match(vm.runInContext("personnelDeleteButton({id:'test',employeeNo:'84000001'})", ui), /删除人员/);
  assert.equal(vm.runInContext("personnelDeleteButton({id:'test',employeeNo:'54002010'})", ui), "");
  await vm.runInContext("openPersonnelDeletionDialog('test')", ui);
  assert.match(body.innerHTML, /输入目标工号确认/); assert.match(body.innerHTML, /删除原因/); assert.match(body.innerHTML, /SAFE001/);
  assert.match(body.innerHTML, /type="submit" disabled/);
  ui.state.user.id = "other";
  assert.equal(vm.runInContext("personnelDeleteButton({id:'test',employeeNo:'84000001'})", ui), "");
  console.log("通过：人员安全删除、超级账号限制、维修阻断、事务回滚、会话撤销、四类导入防恢复、历史保留、数据库防绕过和重启持久化。");
}
