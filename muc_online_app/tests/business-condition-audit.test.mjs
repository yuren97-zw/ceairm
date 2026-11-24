// 业务条件静态守卫（V1.1 §4.2 的"业务条件"要素，S5）。
// 配合 docs/BUSINESS_CONDITION_MATRIX.md：逐条断言强制点仍在代码中，
// 防止重构时静默删除（如：把 requireTeamLeader 绕过、去掉发布资格的 system_admin 排除）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const server = read("server.mjs");
const offset = read("attendance-offset-service.mjs");
const handover = read("handover-service.mjs");
const access = read("personnel-access.mjs");
const publication = read("maintenance-standard-publication-authority.mjs");
const finalization = read("nonroutine-finalization.mjs");

test("C1 禁止自审：考勤抵消与责任核实拒绝本人审批", () => {
  assert.ok(offset.includes("row.person_id===user.personId"), "decide 可见性应排除申请人本人");
  assert.ok(offset.includes("leader.personId===employee"), "责任核实的组长不得是本人");
});

test("C2 班组长资格：交接办理入口强制当前有效班组长，接收人限班组长", () => {
  const calls = (handover.match(/requireTeamLeader\(/g) || []).length;
  assert.ok(calls >= 5, `requireTeamLeader 调用应覆盖全部办理入口（当前 ${calls}）`);
  const recipientSql = (handover.match(/position_code='班组长'/g) || []).length;
  assert.ok(recipientSql >= 2, `接收人/班组长列表应精确过滤职位（当前 ${recipientSql}）`);
  assert.equal(/requireTeamLeader\([\s\S]{0,400}?SUPER_ACCOUNT_ID/.test(handover), false, "交接资格不得为超账开旁路");
});

test("C3 任职资格每请求重读：维修/考勤/发布资格在读时复核", () => {
  assert.ok(server.includes("function currentMaintenanceReviewActor"), "维修操作者应每次请求重读任职");
  assert.ok(server.includes("function currentOffsetActor"), "考勤抵消操作者应每次请求重读");
  assert.ok(publication.includes("employment_status,'') not in ('离职','停职')"), "标准发布资格应复核在职状态");
});

test("C3/C5/C8 超账不豁免业务限制：标准发布资格显式排除 system_admin", () => {
  assert.ok(publication.includes("r.code<>'system_admin'"), "发布资格必须排除超管角色（独立业务授权）");
  assert.ok(publication.includes("hasAll(user,'maintenance')"), "发布资格仍要求维护全范围");
});

test("C4 原业务状态与并发：版本/令牌冲突一律 409", () => {
  assert.ok(server.includes("MAINTENANCE_REPORT_CONFLICT"), "维修报工应有冲突码");
  const expected = (server.match(/expectedUpdatedAt/g) || []).length;
  assert.ok(expected >= 10, `expectedUpdatedAt 并发校验覆盖不足（当前 ${expected}）`);
  assert.ok(offset.includes("申请已变化"), "考勤抵消应校验申请版本");
  assert.ok(finalization.includes("expectedPolicyToken") && finalization.includes("sourceFactsToken"), "终审应有策略/事实令牌");
});

test("C6 字段范围：岗级遮罩与资格字段隐藏由序列化层执行", () => {
  assert.ok(access.includes("function redact("), "redact 应存在");
  assert.ok(access.includes("ACTUAL_GRADE_MASK"), "岗级遮罩常量应被使用");
  assert.ok(access.includes("personnel.qualification.view"), "资格计数应受权限控制");
});

test("C7 有效期：范围行按 validFrom/validTo 过滤", () => {
  assert.ok(access.includes("validFrom") && access.includes("validTo"), "activeScopes 应解析有效期");
  assert.ok(access.includes("Date.parse(s.validFrom)") || access.includes("Date.parse(s.validTo)"), "有效期应按时间解析过滤");
});
