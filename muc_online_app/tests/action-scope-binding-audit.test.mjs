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
  "function dataScopeAllowsUser": "数据范围工具函数定义行，不是调用点",
  'routePath.startsWith("/api/maintenance/")': "路由级通用维修守卫：对任意维修路由做全范围判断，不对应单一动作",
  "Array.isArray(value))return value.filter": "通用 payload 人员过滤辅助函数：多动作共用，动作码在上游路由",
  "value.personId && value.personId!==user.personId": "通用 payload 人员过滤辅助函数：多动作共用",
  "const before=user && !personnelAccess.hasAll": "维修事务后置安全网：跨动作整笔回滚校验",
  "row.person_id!==user.personId && !reportAllowed": "维修事务后置安全网：跨动作整笔回滚校验"
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
    // S2 scoped API：模块由绑定表推导，扫描时按权限码回填模块。
    const scopedCall = line.match(/\b(?:actionScopeAllows|actionScopeHasAll|actionScopePredicate|requireActionScope)\([^,]*,\s*["']([a-z][a-z0-9]*(?:\.[a-z0-9_]+){1,5})["']/);
    if (scopedCall) {
      const binding = scopeBindingFor(scopedCall[1]);
      if (binding && binding.scopeModule !== null) sites.push({ line: index + 1, module: binding.scopeModule, text: line.trim().slice(0, 120) });
      continue;
    }
    const prefixed = /personnelAccess\.(?:allows|requirePerson|hasAll)\(|dataScopeAllowsUser\(/.test(line);
    // personnel-access.mjs 内部是裸函数调用（allows/requirePerson/hasAll/predicate），无 personnelAccess. 前缀。
    const bare = name === "personnel-access.mjs" && /(?:^|[^.\w])(?:allows|requirePerson|hasAll)\(/.test(line);
    const isScopeCall = prefixed || bare;
    if (!isScopeCall) continue;
    if (DELEGATION_MARKERS.some(marker => line.includes(marker))) continue;
    const match = line.match(MODULE_LITERAL);
    if (match) sites.push({ line: index + 1, module: match[1], text: line.trim().slice(0, 120) });
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

test(`绑定表完整性：全部 ${codes.length} 个权限码登记，模块合法，null 必须有原因`, () => {
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

test("hours.* 已退役（S3）：不在权限定义、不在绑定表", () => {
  for (const code of ["hours.read", "hours.detail.read", "hours.adjust", "hours.confirm", "hours.export"]) {
    assert.equal(codeSet.has(code), false, `${code} 仍在权限定义中`);
    assert.equal(scopeBindingFor(code), null, `${code} 仍在绑定表`);
  }
  // 工时页导航由维护统计权限控制（rbac-policy NAVIGATION hoursPage）
});

test("静态配对：动作性范围检查点必须全部配对（预算 0，通用守卫豁免）", () => {
  // S2：运行时绑定 API 已就位，动作性范围检查点必须全部有同模块动作配对；
  // 剩余未配对只允许是 EXEMPT_SITE_MARKERS 中的通用守卫（预算 0）。
  const UNPAIRED_BUDGET = 0;
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
  assert.equal(violations.length, UNPAIRED_BUDGET, `存在未配对的动件性范围检查点（${violations.length} 处，预算 ${UNPAIRED_BUDGET}）：\n${violations.join("\n")}`);
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

test("hours.* 退役后：扫描文件除退役清单外无遗留引用", () => {
  // 退役清单（server.mjs retiredRbacPermissionCodes）本身必须包含这五个码——用于播种时清理历史数据。
  const serverLines = fileData["server.mjs"].lines;
  const retiredStart = serverLines.findIndex(line => line.includes("const retiredRbacPermissionCodes"));
  const retiredEnd = retiredStart >= 0 ? serverLines.findIndex((line, index) => index > retiredStart && line.trim() === "];") : -1;
  const inRetiredList = index => retiredStart >= 0 && index >= retiredStart && (retiredEnd < 0 || index <= retiredEnd);
  const referenced = [];
  for (const [fileName, { lines }] of Object.entries(fileData)) {
    lines.forEach((line, index) => {
      if (fileName === "server.mjs" && inRetiredList(index)) return;
      for (const code of ["hours.read", "hours.detail.read", "hours.adjust", "hours.confirm", "hours.export"]) {
        if (line.includes(`"${code}"`) || line.includes(`'${code}'`)) referenced.push(`${fileName}:${line.trim().slice(0, 80)}`);
      }
    });
  }
  assert.deepEqual(referenced, [], `hours.* 仍有运行时引用：${referenced.join(",")}`);
});

test("S2 迁移守卫：核心检查函数必须使用绑定驱动 API，不再手写范围模块", () => {
  const serverSource = FILES["server.mjs"];
  const migratedFunctions = [
    "nonroutineReviewCan",
    "maintenanceCurrentMutationActor",
    "maintenanceDispatchMutationContext",
    "maintenanceCorrectionCan",
    "maintenanceWorkflowPerson",
    "maintenanceStats",
    "maintenancePersonalStats",
    "maintenanceReportAllowedPersonIds",
    "readingStats",
    "validateAccountIdentity",
    "validatePersonnelImportAccess",
    "visibleImportBatch"
  ];
  const violations = [];
  for (const name of migratedFunctions) {
    const start = serverSource.indexOf(`function ${name}`);
    assert.ok(start >= 0, `迁移守卫：找不到函数 ${name}（重命名后请同步更新本清单）`);
    const end = serverSource.indexOf("\nfunction ", start + 1);
    const block = serverSource.slice(start, end > start ? end : undefined);
    if (/personnelAccess\.(?:allows|requirePerson|hasAll|predicate)\([^)]*["'](?:maintenance|personnel|accounts|info)["']/.test(block)) {
      violations.push(`${name} 仍手写模块字面量`);
    }
  }
  assert.deepEqual(violations, [], `以下函数应使用 actionScope*/requireActionScope 绑定驱动 API：\n${violations.join("\n")}`);
  const scopedCalls = (serverSource.match(/\b(?:actionScopeAllows|actionScopeHasAll|actionScopePredicate|requireActionScope)\(/g) || []).length;
  assert.ok(scopedCalls >= 15, `绑定驱动 API 使用量过少（${scopedCalls}），S2 迁移可能被回退`);
});

test("S3 迁移守卫：考勤两服务使用绑定驱动 API，无遗留注入桩/字面量范围", () => {
  for (const name of ["attendance-service.mjs", "attendance-offset-service.mjs"]) {
    const source = FILES[name];
    assert.ok((source.match(/\bactionScopeAllows|actionScopeHasAll|actionScopePredicate|requireActionScope\(/g) || []).length >= 3, `${name} 的绑定 API 使用量过少`);
    assert.equal(/personnelAccess\.(?:allows|requirePerson|hasAll|predicate)\([^)]*["']attendance["']/.test(source), false, `${name} 仍手写 attendance 范围字面量`);
    assert.equal(/canViewPerson\(/.test(source), false, `${name} 仍使用旧注入桩 canViewPerson`);
  }
});

test("S4 资源级：运行时动作 API 透传绑定资源类别，范围判定支持 resource", () => {
  const server = FILES["server.mjs"];
  assert.ok((server.match(/binding\.resource/g) || []).length >= 4, "actionScope* 应把 binding.resource 传入范围判定");
  const access = FILES["personnel-access.mjs"];
  assert.ok(/function predicate\(user, module, alias = "p", resource\)/.test(access), "predicate 应支持 resource 参数");
  assert.ok(/function allows\(user, module, personId, resource\)/.test(access), "allows 应支持 resource 参数");
  assert.ok(/moduleResources\(s\.module\)\.includes\(resource\)/.test(access), "normalizeScopes 应校验资源类别");
});

test("审计器防退化：字面量范围检查点数量不得骤降", () => {
  const total = Object.values(fileData).reduce((sum, item) => sum + item.sites.length, 0);
  assert.ok(total >= 60, `识别到的字面量范围检查点过少（${total}），扫描器可能失效`);
  assert.ok(Object.values(fileData).some(item => item.sites.some(site => site.module === "maintenance")), "应识别出 maintenance 模块检查点");
  assert.ok(Object.values(fileData).some(item => item.sites.some(site => site.module === "attendance")), "应识别出 attendance 模块检查点");
});
