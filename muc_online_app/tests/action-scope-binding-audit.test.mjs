// 动作→数据范围绑定静态审计（V1.1 §4.2，S1 批次）：
// 目标是把"动作权限码与数据范围模块的配对"从调用点手工保证，升级为可自动校验的声明+审计。
// 本测试纯静态扫描源码（server.mjs / personnel-access.mjs / attendance-offset-service.mjs /
// attendance-service.mjs），不执行、不改行为；运行时强制（scoped 检查 API）为 S2 批次。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ACTION_SCOPE_BINDINGS,
  RBAC_PERMISSION_DEFINITIONS,
  scopeBindingFor
} from "../rbac-policy.mjs";

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const FILES = {
  "server.mjs": read("server.mjs"),
  "personnel-access.mjs": read("personnel-access.mjs"),
  "attendance-offset-service.mjs": read("attendance-offset-service.mjs"),
  "attendance-service.mjs": read("attendance-service.mjs"),
  "maintenance-standard-publication.mjs": read("maintenance-standard-publication.mjs")
};
const codes = RBAC_PERMISSION_DEFINITIONS.map(([code]) => code);
const codeSet = new Set(codes);
const SCOPE_MODULES = ["personnel", "accounts", "info", "maintenance", "hours", "attendance"];
const MODULE_LITERAL = /["'](personnel|accounts|info|maintenance|hours|attendance)["']/;

// 动态范围检查点豁免：无法静态确定权限码的调用点（权限码作为参数/桩注入），必须写明原因。
// 上限 8 条，防止用豁免清单掩盖新增的未配对检查点。
const EXEMPT_SITE_MARKERS = {
  "canViewPerson=(user,id)": "考勤抵消服务注入桩：范围函数由 server 注入（attendance 范围）",
  "hasPermission:": "考勤抵消服务注入桩：动作权限由服务内部 op() 映射表校验"
};
const EXEMPT_SITE_LIMIT = 8;
// 服务委托：server 侧调用这些入口时，动作+范围配对发生在服务内部，调用点本身不算未配对。
const DELEGATION_MARKERS = ["personnelAccess.checkMutation", "personnelAccess.mutateOrganization", "personnelAccess.directory"];

// 关键动作清单：这些写操作必须至少有一处"同模块范围检查"与其配对（M1 风险的直接防线）。
const CRITICAL_ACTIONS = [
  "personnel.profile.update",
  "personnel.organization.manage",
  "personnel.qualification.manage",
  "accounts.roles.assign",
  "accounts.scopes.assign",
  "info.update.any",
  "info.receipt.manage",
  "attendance.offset.approve",
  "attendance.offset.rules.manage",
  "attendance.record.manage",
  "maintenance.hours.confirm",
  "maintenance.assignment.manage",
  "maintenance.opportunity.delete",
  "maintenance.archive.modify",
  "maintenance.content.manage",
  "maintenance.nonroutine.review.finalize",
  "maintenance.nonroutine.review.opinion.submit",
  "maintenance.standard.publish",
  "maintenance.standard.manage",
  "maintenance.workflow.manage"
];

// 每个文件的行 + 字面量模块范围检查点。
const fileData = {};
for (const [name, source] of Object.entries(FILES)) {
  const lines = source.split("\n");
  const sites = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    // 纯函数定义行（如 dataScopeAllowsUser 的签名）不是调用点，但保留为已知未配对基线，不做跳过。
    // 注入型授权入口：工厂注入的 can/qualify 契约内包含范围检查（见 server.mjs 实例化处）。
    if (name === "maintenance-standard-publication.mjs" && /\bcan\(/.test(line)) {
      // standardPublicationCan（server.mjs:2475）= maintenance.standard.publish + standardPublicationAuthorized(hasAll 'maintenance')
      sites.push({ line: index + 1, module: "maintenance", text: line.trim().slice(0, 120) });
      continue;
    }
    const prefixed = /personnelAccess\.(?:allows|requirePerson|hasAll)\(|dataScopeAllowsUser\(/.test(line);
    // personnel-access.mjs 内部是裸函数调用（allows/requirePerson/hasAll/predicate），无 personnelAccess. 前缀。
    const bare = name === "personnel-access.mjs" && /(?:^|[^.\w])(?:allows|requirePerson|hasAll)\(/.test(line);
    const isScopeCall = prefixed || bare
      || (/canViewPerson\(/.test(line) && name === "attendance-offset-service.mjs");
    if (!isScopeCall) continue;
    if (DELEGATION_MARKERS.some(marker => line.includes(marker))) continue;
    const match = line.match(MODULE_LITERAL);
    if (match) { sites.push({ line: index + 1, module: match[1], text: line.trim().slice(0, 120) }); continue; }
    // canViewPerson 按契约固定为 attendance 范围（server 注入的实现用 attendance 模块）。
    if (line.includes("canViewPerson(") && name === "attendance-offset-service.mjs") sites.push({ line: index + 1, module: "attendance", text: line.trim().slice(0, 120) });
  }
  fileData[name] = { lines, sites };
}

function nearbyCodes(fileName, lineIndex, radius = 80) {
  const { lines } = fileData[fileName];
  const found = new Set();
  for (let index = Math.max(0, lineIndex - 1 - radius); index < Math.min(lines.length, lineIndex + radius); index++) {
    const matches = lines[index].match(/["']([a-z][a-z0-9]*(?:\.[a-z0-9_]+){1,5})["']/g) || [];
    for (const raw of matches) {
      const code = raw.slice(1, -1);
      if (codeSet.has(code)) found.add(code);
    }
  }
  return found;
}

test("绑定表完整性：116 个权限码全部登记，模块合法，null 必须有原因", () => {
  const problems = [];
  for (const code of codes) {
    const binding = ACTION_SCOPE_BINDINGS[code];
    if (!binding) { problems.push(`${code} 未登记绑定`); continue; }
    if (binding.scopeModule !== null && !SCOPE_MODULES.includes(binding.scopeModule)) problems.push(`${code} 的 scopeModule 非法: ${binding.scopeModule}`);
    if (!binding.resource) problems.push(`${code} 缺少 resource 声明`);
    if (binding.scopeModule === null && !binding.note) problems.push(`${code} 声明无范围但缺少 note 原因`);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
  const extras = Object.keys(ACTION_SCOPE_BINDINGS).filter(code => !codeSet.has(code));
  assert.deepEqual(extras, [], `绑定表包含未定义的权限码：${extras.join(",")}`);
});

test("hours.* 五码登记为 maintenance/hour_result（运行时复用 maintenance 范围的显式声明）", () => {
  for (const code of ["hours.read", "hours.detail.read", "hours.adjust", "hours.confirm", "hours.export"]) {
    const binding = scopeBindingFor(code);
    assert.equal(binding?.scopeModule, "maintenance", `${code} 应绑定 maintenance 范围`);
    assert.equal(binding?.resource, "hour_result", `${code} 资源类别应为 hour_result`);
    assert.ok(binding?.note, `${code} 应注明 hours 模块无运行时检查点`);
  }
});

test("静态配对：字面量范围检查点的未配对数量不超过 S1 基线预算", () => {
  // S1 基线：代码中仍有少量范围检查由上游路由权限兜底（stats 过滤、批量校验等辅助函数），
  // 无法在 ±80 行内看到动作码。S2 运行时强制必须把该数字驱动到 0。
  const S1_UNPAIRED_BUDGET = 24;
  const violations = [];
  let exempted = 0;
  for (const [fileName, { sites, lines }] of Object.entries(fileData)) {
    for (const site of sites) {
      const covered = [...nearbyCodes(fileName, site.line)].some(code => scopeBindingFor(code)?.scopeModule === site.module);
      if (covered) continue;
      const context = lines.slice(Math.max(0, site.line - 2), site.line + 1).join("");
      const exemptKey = Object.keys(EXEMPT_SITE_MARKERS).find(marker => context.includes(marker));
      if (exemptKey) { exempted++; continue; }
      violations.push(`${fileName}:${site.line} 范围检查(module=${site.module})未配对：${site.text}`);
    }
  }
  assert.ok(Object.keys(EXEMPT_SITE_MARKERS).length <= EXEMPT_SITE_LIMIT, "豁免清单超限，请先评审");
  assert.ok(violations.length <= S1_UNPAIRED_BUDGET, `未配对范围检查点超预算（${violations.length}/${S1_UNPAIRED_BUDGET}），请评审：\n${violations.join("\n")}`);
  if (violations.length) console.log(`ℹ S1 未配对基线：${violations.length} 处（S2 须清零）\n${violations.join("\n")}`);
});

test("关键写动作必须与同模块范围检查配对（M1 直接防线）", () => {
  const violations = [];
  for (const code of CRITICAL_ACTIONS) {
    const binding = scopeBindingFor(code);
    assert.ok(binding, `关键动作 ${code} 未登记绑定`);
    if (binding.scopeModule === null) continue;
    const occurrences = [];
    for (const [fileName, { lines }] of Object.entries(fileData)) {
      for (let index = 0; index < lines.length; index++) {
        if (lines[index].includes(`"${code}"`) || lines[index].includes(`'${code}'`)) occurrences.push({ fileName, line: index + 1 });
      }
    }
    assert.ok(occurrences.length > 0, `关键动作 ${code} 在扫描文件中无引用（清单过期，请评审）`);
    const paired = occurrences.some(({ fileName, line }) =>
      fileData[fileName].sites.some(site => site.module === binding.scopeModule && Math.abs(site.line - line) <= 80));
    if (!paired) violations.push(`${code} 的所有引用处附近都没有 module=${binding.scopeModule} 的范围检查`);
  }
  assert.deepEqual(violations, [], `以下关键动作缺少同模块范围配对：\n${violations.join("\n")}`);
});

test("hours.* 为登记兼容码：代码中零引用（死权限）", () => {
  // hours 模块名存实亡：权限码仍在定义与角色中，但运行时无任何检查点，工时统计全部复用 maintenance。
  // 若未来启用 hours 模块独立检查，此测试会失败并提示同步更新绑定与语义表。
  const referenced = Object.keys(FILES).flatMap(fileName => {
    const { lines } = fileData[fileName];
    return ["hours.read", "hours.detail.read", "hours.adjust", "hours.confirm", "hours.export"]
      .filter(code => lines.some(line => line.includes(`"${code}"`) || line.includes(`'${code}'`)))
      .map(code => `${fileName}:${code}`);
  });
  assert.deepEqual(referenced, [], `hours.* 出现运行时引用，hours 模块语义已变化，请评审绑定与文档：${referenced.join(",")}`);
});

test("审计器防退化：字面量范围检查点数量不得骤降", () => {
  const total = Object.values(fileData).reduce((sum, item) => sum + item.sites.length, 0);
  assert.ok(total >= 60, `识别到的字面量范围检查点过少（${total}），扫描器可能失效`);
  assert.ok(Object.values(fileData).some(item => item.sites.some(site => site.module === "maintenance")), "应识别出 maintenance 模块检查点");
  assert.ok(Object.values(fileData).some(item => item.sites.some(site => site.module === "attendance")), "应识别出 attendance 模块检查点");
});
