// S4 资源级数据范围（V1.1 §4.3）单元测试：
// - resource='' 为模块级范围（兼容存量）；非空仅对该资源类别的动作生效
// - 模块级检查（未指定资源）取模块级+资源级并集，保持既有模块行为
// - 动作级检查严格匹配：资源之间不互相借用（§4.2 禁令）
import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createPersonnelAccess, moduleResources } from "../personnel-access.mjs";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.kind = "sqlite";
  db.exec(`
    create table personnel(id text primary key,name text,department_id text,personnel_group_id text,administrative_team_id text,data_status text);
    create table organization_units(id text primary key,code text,name text,unit_type text,parent_id text,status text);
    insert into personnel values('p1','甲','dep','grp','team-a','active'),('p2','乙','dep','grp','team-b','active');
    insert into organization_units values('team-a','TEAM-A','A组','administrative_team','dep','active'),('team-b','TEAM-B','B组','administrative_team','dep','active');
  `);
  const access = createPersonnelAccess({ db, hasRbac: () => true, randomId: () => "id", now: () => "2026-11-25T00:00:00Z", audit: () => {}, superAccountId: "super" });
  const user = dataScopes => ({ id: "u1", personId: "p1", dataScopes });
  return { db, access, user };
}

test("资源级 all 范围只对该资源生效，其他资源 fail-closed", () => {
  const { access, user } = fixture();
  const scoped = user([{ module: "maintenance", resource: "hour_result", scopeType: "all" }]);
  assert.equal(access.allows(scoped, "maintenance", "p2", "hour_result"), true);
  assert.equal(access.allows(scoped, "maintenance", "p2", "flight"), false, "未授权的资源必须 fail-closed");
  assert.equal(access.hasAll(scoped, "maintenance", "hour_result"), true);
  assert.equal(access.hasAll(scoped, "maintenance", "flight"), false);
});

test("模块级范围（resource=''）覆盖全部资源", () => {
  const { access, user } = fixture();
  const scoped = user([{ module: "maintenance", resource: "", scopeType: "all" }]);
  assert.equal(access.allows(scoped, "maintenance", "p2", "hour_result"), true);
  assert.equal(access.allows(scoped, "maintenance", "p2", "flight"), true);
  assert.equal(access.hasAll(scoped, "maintenance", "review_case"), true);
});

test("模块级检查（未指定资源）取并集：仅资源级范围也能参与模块级可见性", () => {
  const { access, user } = fixture();
  const scoped = user([{ module: "maintenance", resource: "hour_result", scopeType: "all" }]);
  assert.equal(access.allows(scoped, "maintenance", "p2"), true, "模块级查询应并集资源级行");
  assert.equal(access.predicate(scoped, "maintenance").sql, "1=1");
  assert.equal(access.predicate(scoped, "maintenance", "p", "flight").sql, "0=1", "动作级仍严格匹配");
});

test("资源级 self 范围按本人生效", () => {
  const { access, user } = fixture();
  const scoped = user([{ module: "maintenance", resource: "hour_result", scopeType: "self" }]);
  assert.equal(access.allows(scoped, "maintenance", "p1", "hour_result"), true);
  assert.equal(access.allows(scoped, "maintenance", "p2", "hour_result"), false);
  assert.equal(access.allows(scoped, "maintenance", "p1", "flight"), false);
});

test("normalizeScopes 校验资源类别、去重与默认模块级兜底", () => {
  const { access } = fixture();
  const normalized = access.normalizeScopes([
    { module: "maintenance", resource: "hour_result", scopeType: "all", scopeId: "" },
    { module: "maintenance", resource: "", scopeType: "department", scopeId: "" }
  ], "p1");
  assert.ok(normalized.some(s => s.module === "maintenance" && s.resource === "hour_result" && s.scopeType === "all"));
  assert.ok(normalized.some(s => s.module === "maintenance" && s.resource === "" && s.scopeType === "department"));
  // 其他模块自动补模块级 self
  assert.ok(normalized.some(s => s.module === "personnel" && s.resource === "" && s.scopeType === "self"));
  assert.throws(() => access.normalizeScopes([{ module: "maintenance", resource: "no_such_resource", scopeType: "all" }], "p1"), /资源类别无效/);
  assert.throws(() => access.normalizeScopes([
    { module: "maintenance", resource: "hour_result", scopeType: "all" },
    { module: "maintenance", resource: "hour_result", scopeType: "all" }
  ], "p1"), /重复/);
  // 同模块不同资源不构成重复
  assert.ok(access.normalizeScopes([
    { module: "maintenance", resource: "hour_result", scopeType: "all" },
    { module: "maintenance", resource: "flight", scopeType: "all" }
  ], "p1"));
});

test("requirePerson 支持资源参数并按资源严格判定", () => {
  const { access, user } = fixture();
  const scoped = user([{ module: "maintenance", resource: "hour_result", scopeType: "all" }]);
  assert.equal(access.requirePerson(scoped, "maintenance", "p2", true, "hour_result").id, "p2");
  assert.throws(() => access.requirePerson(scoped, "maintenance", "p2", true, "flight"), { status: 404 });
});

test("模块资源清单来自动作绑定表", () => {
  const maintenance = moduleResources("maintenance");
  for (const resource of ["flight", "assignment", "hour_result", "review_case", "standard_version"]) assert.ok(maintenance.includes(resource), resource);
  assert.ok(moduleResources("attendance").includes("offset_claim"));
  assert.ok(moduleResources("personnel").includes("personnel"));
});
