import assert from "node:assert/strict";
import {
  RBAC_PERMISSION_DEFINITIONS,
  RBAC_PERMISSION_DEPENDENCIES,
  RBAC_ROLE_DEFINITIONS,
  accountRoleCombinationErrors,
  permissionDependencyErrors,
  visibleNavigation
} from "../rbac-policy.mjs";

const permissionCodes = RBAC_PERMISSION_DEFINITIONS.map(([code]) => code);
const permissionSet = new Set(permissionCodes);
const role = code => new Set(RBAC_ROLE_DEFINITIONS[code] || []);
const has = (roleCode, permission) => role(roleCode).has(permission);

assert.equal(permissionCodes.length, permissionSet.size, "权限编码不得重复");
for (const [code, dependencies] of Object.entries(RBAC_PERMISSION_DEPENDENCIES)) {
  assert(permissionSet.has(code), `依赖主权限不存在: ${code}`);
  for (const dependency of dependencies) assert(permissionSet.has(dependency), `依赖权限不存在: ${dependency}`);
}
for (const [roleCode, permissions] of Object.entries(RBAC_ROLE_DEFINITIONS)) {
  assert.deepEqual(permissionDependencyErrors(permissions), [], `角色 ${roleCode} 缺少前置权限`);
  for (const permission of permissions) assert(permissionSet.has(permission), `角色 ${roleCode} 引用了未定义权限 ${permission}`);
}

assert.deepEqual(role("system_admin"), permissionSet, "超级管理员必须拥有完整权限集");

for (const permission of ["info.read", "maintenance.execute.submit", "maintenance.nonroutine.create.own", "maintenance.stats.self.view"])
  assert(has("worker", permission), `工作者缺少 ${permission}`);
for (const permission of ["info.create", "maintenance.dispatch.view", "maintenance.review.submit", "capability.overview.view"])
  assert(!has("worker", permission), `工作者不应拥有 ${permission}`);

assert([...role("worker")].every(permission => has("dispatcher", permission)), "派工人员必须包含工作者权限");
for (const permission of ["maintenance.opportunity.create", "maintenance.opportunity.update", "maintenance.assignment.manage", "maintenance.hours.adjust"])
  assert(has("dispatcher", permission), `派工人员缺少 ${permission}`);
for (const permission of ["info.create", "maintenance.review.submit", "maintenance.opportunity.import", "maintenance.opportunity.delete", "maintenance.hours.confirm"])
  assert(!has("dispatcher", permission), `派工人员不应拥有 ${permission}`);

assert([...role("dispatcher")].every(permission => has("manager", permission)), "管理者必须包含派工人员权限");
for (const permission of ["info.create", "personnel.profile.update", "personnel.qualification.view", "capability.allocation.submit", "capability.status.manage", "capability.report.export"])
  assert(has("manager", permission), `管理者缺少 ${permission}`);
for (const permission of ["maintenance.review.submit", "personnel.import.execute", "personnel.lifecycle.manage", "capability.config.manage", "capability.scenario.apply", "roles.manage"])
  assert(!has("manager", permission), `管理者不应默认拥有 ${permission}`);

assert.deepEqual(visibleNavigation([...role("addon_capability_readonly")]), ["personnelPage"]);
assert.deepEqual(visibleNavigation([...role("worker")]), ["infoPage", "maintenancePage"]);
assert.deepEqual(visibleNavigation([...role("manager")]), ["infoPage", "maintenancePage", "personnelPage"]);

assert.deepEqual(accountRoleCombinationErrors(["worker"]), []);
assert.deepEqual(accountRoleCombinationErrors(["dispatcher", "addon_maintenance_review"]), []);
assert.equal(accountRoleCombinationErrors([])[0].code, "BASE_ROLE_REQUIRED");
assert.equal(accountRoleCombinationErrors(["worker", "manager"])[0].code, "BASE_ROLE_REQUIRED");
assert.equal(accountRoleCombinationErrors(["system_admin"])[0].code, "SYSTEM_ADMIN_RESERVED");
assert.deepEqual(accountRoleCombinationErrors(["system_admin"], { superAccount: true }), []);

for (const retired of ["capability.read", "capability.allocate", "personnel.read", "personnel.update", "maintenance.read", "maintenance.execute", "maintenance.dispatch", "maintenance.review"])
  assert(!permissionSet.has(retired), `旧粗粒度权限不得继续启用: ${retired}`);

console.log(`RBAC 权限矩阵验证通过：${permissionCodes.length} 项权限，${Object.keys(RBAC_ROLE_DEFINITIONS).length} 个预置角色。`);
