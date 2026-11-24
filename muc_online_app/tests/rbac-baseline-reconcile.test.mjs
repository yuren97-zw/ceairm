import assert from "node:assert/strict";
import test from "node:test";
import { missingBaselineRolePermissions } from "../rbac-policy.mjs";

test("controlled-edit roles get baseline permissions reconciled without losing manual extras", () => {
  const workerBaseline = missingBaselineRolePermissions("worker", []);
  assert.ok(workerBaseline.includes("handover.view"));
  assert.ok(workerBaseline.includes("maintenance.stats.self.view"));
  assert.deepEqual(missingBaselineRolePermissions("worker", workerBaseline), []);
  assert.deepEqual(missingBaselineRolePermissions("unknown_role", ["x"]), []);
  // 手工授予的额外权限不在基线内，不会被返回也（天然）不会被删除
  const withExtra = [...workerBaseline, "capability.overview.view"];
  assert.deepEqual(missingBaselineRolePermissions("worker", withExtra), []);
});
