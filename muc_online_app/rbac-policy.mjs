export const CAPABILITY_CONFIGURATION_PERMISSIONS = [
  ["capability.status.manage", "管理人员状态", "personnel"],
  ["capability.config.manage", "配置重点与门限", "personnel"],
  ["capability.scenario.manage", "管理调配方案", "personnel"]
];

const capabilityV2 = [
  ["capability.overview.view", "查看能力综合看板", "personnel"],
  ["capability.allocation.view", "查看调配工作区", "personnel"],
  ["capability.allocation.simulate", "模拟人员调配", "personnel"],
  ["capability.allocation.submit", "提交实时调配", "personnel"],
  ["capability.status.view", "查看人员状态", "personnel"],
  ["capability.history.view", "查看调配历史", "personnel"],
  ["capability.scenario.view", "查看调配方案", "personnel"],
  ["capability.scenario.apply", "应用调配方案", "personnel"],
  ["capability.report.view", "查看能力报表", "personnel"],
  ["capability.report.export", "导出能力报表", "personnel"]
];

const personnelV2 = [
  ["personnel.list.view", "查看人员列表", "personnel"],
  ["personnel.detail.view", "查看人员详情", "personnel"],
  ["personnel.actual_grade.view", "查看他人实际岗级", "personnel"],
  ["personnel.actual_grade.manage", "维护实际岗级", "personnel"],
  ["personnel.actual_grade.export", "导出实际岗级", "personnel"],
  ["personnel.profile.create", "单独录入人员", "personnel"],
  ["personnel.profile.update", "维护人员一般资料", "personnel"],
  ["personnel.qualification.view", "查看执照授权培训", "personnel"],
  ["personnel.import.view", "查看人员导入中心", "personnel"],
  ["personnel.import.execute", "执行人员与能力导入", "personnel"],
  ["personnel.quality.view", "查看人员数据质量", "personnel"],
  ["personnel.audit.view", "查看人员变更审计", "personnel"],
  ["personnel.lifecycle.manage", "管理人员停职离职状态", "personnel"]
];

const maintenanceV2 = [
  ["maintenance.view", "查看维修管控", "maintenance"],
  ["maintenance.execute.view", "查看本人维修任务", "maintenance"],
  ["maintenance.execute.submit", "提交本人维修报工", "maintenance"],
  ["maintenance.nonroutine.create.own", "新增本人非例行", "maintenance"],
  ["maintenance.nonroutine.update.own", "修改本人非例行", "maintenance"],
  ["maintenance.nonroutine.delete.own", "删除本人未提交非例行", "maintenance"],
  ["maintenance.dispatch.view", "查看维修派工", "maintenance"],
  ["maintenance.opportunity.create", "新建维修机会", "maintenance"],
  ["maintenance.opportunity.import", "导入维修机会", "maintenance"],
  ["maintenance.opportunity.update", "修改未确认维修机会", "maintenance"],
  ["maintenance.opportunity.delete", "删除未确认维修机会", "maintenance"],
  ["maintenance.content.manage", "维护未确认工作内容", "maintenance"],
  ["maintenance.assignment.manage", "维修派工与换人", "maintenance"],
  ["maintenance.hours.adjust", "调整未确认工时", "maintenance"],
  ["maintenance.review.view", "查看维修复核", "maintenance"],
  ["maintenance.review.submit", "复核和退回维修报工", "maintenance"],
  ["maintenance.stats.self.view", "查看本人维修统计", "maintenance"],
  ["maintenance.stats.manage.view", "查看管理范围维修统计", "maintenance"]
];

const existing = [
  ["personnel.organization.manage", "维护人员正式组织", "personnel"],
  ["personnel.qualification.manage", "维护执照授权培训", "personnel"],
  ["accounts.read", "查看登录账户", "accounts"], ["accounts.create", "开通登录账户", "accounts"],
  ["accounts.update", "维护登录账户", "accounts"], ["accounts.disable", "停用登录账户", "accounts"],
  ["accounts.password.reset", "重置账户密码", "accounts"], ["accounts.bulk_open", "批量开通账户", "accounts"],
  ["accounts.roles.assign", "分配账户角色", "accounts"], ["accounts.scopes.assign", "分配账户数据范围", "accounts"],
  ["roles.read", "查看角色权限", "accounts"], ["roles.manage", "维护角色权限", "accounts"],
  ["settings.manage", "维护系统设置", "settings"],
  ["info.read", "查看信息传达", "info"], ["info.create", "发布信息", "info"],
  ["info.update.own", "修改自己发布的信息", "info"], ["info.update.any", "修改任意信息", "info"],
  ["info.delete.own", "删除自己发布的信息", "info"], ["info.delete.any", "删除任意信息", "info"],
  ["info.void.own", "作废自己发布的信息", "info"], ["info.void.any", "作废任意信息", "info"],
  ["info.restore", "恢复信息", "info"], ["info.remind.own", "催办自己发布的信息", "info"],
  ["info.remind.any", "催办任意信息", "info"], ["info.receipt.manage", "管理阅读回执", "info"],
  ["info.stats.read", "查看信息统计", "info"], ["info.export", "导出信息数据", "info"],
  ["maintenance.archive.modify", "修改已归档维修数据", "maintenance"], ["maintenance.rules.view", "查看维修工时规则", "maintenance"], ["maintenance.rules.manage", "维护维修规则", "maintenance"],
  ["maintenance.hours.confirm", "确认工时架次", "maintenance"],
  ["maintenance.export", "导出维修数据", "maintenance"],
  ["fixed.read", "查看固化项目", "fixed"], ["fixed.manage", "维护固化项目", "fixed"],
  ["hours.read", "查看工时统计", "hours"], ["hours.detail.read", "查看工时明细", "hours"],
  ["hours.adjust", "调整工时数据", "hours"], ["hours.confirm", "确认工时数据", "hours"], ["hours.export", "导出工时数据", "hours"],
  ["attendance.read", "查看考勤", "attendance"], ["attendance.record.manage", "维护考勤记录", "attendance"],
  ["attendance.exception.manage", "处理考勤异常", "attendance"], ["attendance.stats.read", "查看考勤统计", "attendance"],
  ["attendance.export", "导出考勤数据", "attendance"]
];

export const RBAC_PERMISSION_DEFINITIONS = [...CAPABILITY_CONFIGURATION_PERMISSIONS, ...capabilityV2, ...personnelV2, ...maintenanceV2, ...existing];

export const RBAC_PERMISSION_DEPENDENCIES = {
  "maintenance.execute.submit": ["maintenance.execute.view"],
  "maintenance.nonroutine.create.own": ["maintenance.execute.view"],
  "maintenance.nonroutine.update.own": ["maintenance.execute.view"],
  "maintenance.nonroutine.delete.own": ["maintenance.execute.view"],
  "maintenance.opportunity.create": ["maintenance.dispatch.view"],
  "maintenance.opportunity.import": ["maintenance.dispatch.view"],
  "maintenance.opportunity.update": ["maintenance.dispatch.view"],
  "maintenance.opportunity.delete": ["maintenance.dispatch.view"],
  "maintenance.content.manage": ["maintenance.dispatch.view"],
  "maintenance.assignment.manage": ["maintenance.dispatch.view"],
  "maintenance.hours.adjust": ["maintenance.dispatch.view"],
  "maintenance.review.submit": ["maintenance.review.view"],
  "capability.allocation.simulate": ["capability.allocation.view"],
  "capability.allocation.submit": ["capability.allocation.view"],
  "capability.status.manage": ["capability.status.view"],
  "capability.scenario.manage": ["capability.scenario.view"],
  "capability.scenario.apply": ["capability.scenario.view", "capability.allocation.submit"],
  "capability.report.export": ["capability.report.view"],
  "personnel.profile.update": ["personnel.detail.view"],
  "personnel.actual_grade.view": ["personnel.detail.view"],
  "personnel.actual_grade.manage": ["personnel.actual_grade.view", "personnel.profile.update"],
  "personnel.actual_grade.export": ["personnel.actual_grade.view"],
  "personnel.qualification.manage": ["personnel.qualification.view", "personnel.detail.view"],
  "personnel.organization.manage": ["personnel.list.view", "personnel.detail.view"],
  "personnel.import.execute": ["personnel.import.view"],
  "personnel.lifecycle.manage": ["personnel.list.view", "personnel.detail.view"],
  "capability.config.manage": ["capability.overview.view"],
  "roles.manage": ["roles.read"]
};

const worker = ["info.read", "maintenance.view", "maintenance.execute.view", "maintenance.execute.submit", "maintenance.nonroutine.create.own", "maintenance.nonroutine.update.own", "maintenance.nonroutine.delete.own", "maintenance.stats.self.view"];
const dispatcher = [...worker, "maintenance.dispatch.view", "maintenance.opportunity.create", "maintenance.opportunity.update", "maintenance.content.manage", "maintenance.assignment.manage", "maintenance.hours.adjust", "maintenance.stats.manage.view"];
const manager = [...dispatcher, "maintenance.rules.view", "info.create", "info.update.own", "info.void.own", "info.remind.own", "info.receipt.manage", "info.stats.read", "info.export", "personnel.list.view", "personnel.detail.view", "personnel.profile.update", "personnel.qualification.view", "personnel.quality.view", "personnel.audit.view", "capability.overview.view", "capability.allocation.view", "capability.allocation.simulate", "capability.allocation.submit", "capability.status.view", "capability.status.manage", "capability.history.view", "capability.scenario.view", "capability.scenario.manage", "capability.report.view", "capability.report.export"];

export const RBAC_ROLE_DEFINITIONS = {
  system_admin: RBAC_PERMISSION_DEFINITIONS.map(([code]) => code),
  worker, dispatcher, manager,
  addon_capability_readonly: ["capability.overview.view"],
  addon_fixed_readonly: ["fixed.read"],
  addon_maintenance_review: ["maintenance.review.view", "maintenance.review.submit"],
  addon_hours_confirm: ["maintenance.stats.manage.view", "maintenance.hours.confirm"],
  addon_maintenance_import: ["maintenance.dispatch.view", "maintenance.opportunity.import"],
  addon_maintenance_delete: ["maintenance.dispatch.view", "maintenance.opportunity.delete"],
  addon_maintenance_export: ["maintenance.stats.manage.view", "maintenance.export"],
  addon_maintenance_rules: ["maintenance.stats.manage.view", "maintenance.rules.view", "maintenance.rules.manage"],
  addon_archive_modify: ["maintenance.review.view", "maintenance.review.submit", "maintenance.archive.modify"],
  addon_info_advanced: ["info.read", "info.update.any", "info.delete.any", "info.void.any", "info.restore", "info.remind.any"],
  addon_personnel_import: ["personnel.import.view", "personnel.import.execute"],
  addon_actual_grade_view: ["personnel.detail.view", "personnel.actual_grade.view"],
  addon_actual_grade_manage: ["personnel.detail.view", "personnel.profile.update", "personnel.actual_grade.view", "personnel.actual_grade.manage"],
  addon_actual_grade_export: ["personnel.detail.view", "personnel.actual_grade.view", "personnel.actual_grade.export"],
  addon_organization_manage: ["personnel.list.view", "personnel.detail.view", "personnel.organization.manage"],
  addon_qualification_manage: ["personnel.detail.view", "personnel.qualification.view", "personnel.qualification.manage"],
  addon_personnel_lifecycle: ["personnel.list.view", "personnel.detail.view", "personnel.lifecycle.manage"],
  addon_capability_config: ["capability.overview.view", "capability.config.manage"],
  addon_scenario_apply: ["capability.allocation.view", "capability.allocation.submit", "capability.scenario.view", "capability.scenario.apply"],
  addon_account_role_manage: ["personnel.list.view", "accounts.read", "accounts.create", "accounts.update", "accounts.disable", "accounts.password.reset", "accounts.bulk_open", "accounts.roles.assign", "accounts.scopes.assign", "roles.read", "roles.manage"],
  addon_system_settings: ["settings.manage"]
};

export const RBAC_BASE_ROLE_CODES = ["worker", "dispatcher", "manager"];

export const RBAC_ROLE_NAMES = {
  system_admin: "系统管理员", worker: "工作者", dispatcher: "派工人员", manager: "管理者",
  addon_capability_readonly: "附加：能力看板只读", addon_fixed_readonly: "附加：固化项目只读",
  addon_maintenance_review: "附加：维修复核", addon_hours_confirm: "附加：工时确认",
  addon_maintenance_import: "附加：维修导入", addon_maintenance_delete: "附加：维修删除",
  addon_maintenance_export: "附加：维修导出", addon_maintenance_rules: "附加：维修规则",
  addon_archive_modify: "附加：归档修正", addon_info_advanced: "附加：信息高级管理",
  addon_personnel_import: "附加：人员数据导入", addon_organization_manage: "附加：组织管理",
  addon_actual_grade_view: "附加：实际岗级查看", addon_actual_grade_manage: "附加：实际岗级维护", addon_actual_grade_export: "附加：实际岗级导出",
  addon_qualification_manage: "附加：资质维护", addon_personnel_lifecycle: "附加：人员生命周期管理", addon_capability_config: "附加：能力规则配置",
  addon_scenario_apply: "附加：方案应用", addon_account_role_manage: "附加：账号角色管理",
  addon_system_settings: "附加：系统配置"
};

export const RBAC_ROLE_DESCRIPTIONS = {
  system_admin: "54002010专用；拥有全部功能和全部数据范围。",
  worker: "信息只读；执行与报工本人任务；维护本人未提交非例行；查看本人统计。",
  dispatcher: "包含工作者权限；另可建立和修改未确认维修机会、派工、维护工作内容并调整未确认工时。",
  manager: "包含工作者和派工人员权限；另可发布信息、维护人员一般资料和进行能力调配。",
  addon_capability_readonly: "可选只读能力看板。",
  addon_fixed_readonly: "查看固化项目。",
  addon_maintenance_review: "查看、复核和退回维修报工。",
  addon_hours_confirm: "确认维修工时和架次。",
  addon_maintenance_import: "导入维修机会。",
  addon_maintenance_delete: "删除未确认维修机会。",
  addon_maintenance_export: "导出维修数据。",
  addon_maintenance_rules: "维护维修工时规则。",
  addon_archive_modify: "修正已归档维修数据。",
  addon_info_advanced: "修改、删除、作废和恢复他人发布的信息。",
  addon_personnel_import: "执行人员、执照、授权和培训导入。",
  addon_actual_grade_view: "在人员数据范围内查看他人的实际岗级。",
  addon_actual_grade_manage: "在人员数据范围内查看并维护实际岗级。",
  addon_actual_grade_export: "在人员数据范围内导出实际岗级；仅在导出功能明确包含该字段时生效。",
  addon_organization_manage: "维护部门、人员分组和行政班组。",
  addon_qualification_manage: "维护执照、授权和培训记录。",
  addon_personnel_lifecycle: "管理人员停职和离职状态。",
  addon_capability_config: "配置重点能力、项目顺序和班组门限。",
  addon_scenario_apply: "将调配模拟方案应用到实时配置。",
  addon_account_role_manage: "管理账号、角色、权限和数据范围。",
  addon_system_settings: "维护系统级设置。"
};

export function permissionDependencyErrors(codes) {
  const selected = new Set(codes);
  const errors = [];
  for (const code of selected) for (const dependency of RBAC_PERMISSION_DEPENDENCIES[code] || []) if (!selected.has(dependency)) errors.push({ code, dependency });
  return errors;
}

export function accountRoleCombinationErrors(codes, { superAccount = false } = {}) {
  const selected = new Set(codes || []);
  const errors = [];
  if (selected.has("system_admin") && !superAccount) errors.push({ code: "SYSTEM_ADMIN_RESERVED" });
  const baseRoles = RBAC_BASE_ROLE_CODES.filter(code => selected.has(code));
  if (!superAccount && baseRoles.length !== 1) errors.push({ code: "BASE_ROLE_REQUIRED", selected: baseRoles });
  if (superAccount && (selected.size !== 1 || !selected.has("system_admin"))) errors.push({ code: "SUPER_ACCOUNT_ROLE_FIXED" });
  return errors;
}

export const NAVIGATION_NODES = [
  { id: "infoPage", anyOf: ["info.read"] },
  { id: "maintenancePage", anyOf: ["maintenance.view", "maintenance.execute.view", "maintenance.dispatch.view", "maintenance.review.view", "maintenance.stats.manage.view"] },
  { id: "fixedPage", anyOf: ["fixed.read"] },
  { id: "personnelPage", anyOf: [...capabilityV2.map(([code]) => code).filter(code => code.endsWith(".view")), ...personnelV2.map(([code]) => code).filter(code => code.endsWith(".view")), "personnel.organization.manage", "personnel.qualification.manage"] },
  { id: "hoursPage", anyOf: ["hours.read"] },
  { id: "attendancePage", anyOf: ["attendance.read"] },
  { id: "settingsPage", anyOf: ["accounts.read", "roles.read", "settings.manage"] }
];

export function visibleNavigation(permissionCodes, isSuper = false) {
  const permissions = new Set(permissionCodes || []);
  return NAVIGATION_NODES.filter(node => isSuper || node.anyOf.some(code => permissions.has(code))).map(node => node.id);
}
