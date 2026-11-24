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
  ["maintenance.module.manage", "注册非结算扩展模块", "maintenance"],
  ["maintenance.workflow.view", "查看本人非结算流程任务", "maintenance"],
  ["maintenance.workflow.manage", "指派及管理非结算流程任务", "maintenance"],
  ["maintenance.workflow.submit", "认领并提交本人非结算流程任务", "maintenance"],
  ["maintenance.execute.view", "查看本人维修任务", "maintenance"],
  ["maintenance.execute.submit", "提交本人维修报工", "maintenance"],
  ["maintenance.standard.view", "查看非例行标准", "maintenance"],
  ["maintenance.standard.manage", "管理非例行标准草稿及停用", "maintenance"],
  ["maintenance.standard.publish", "独立准入及发布非例行标准", "maintenance"],
  ["maintenance.nonroutine.review.view", "查看非例行工时评议进度", "maintenance"],
  ["maintenance.nonroutine.review.cancel", "取消尚未入账的非例行评议", "maintenance"],
  ["maintenance.nonroutine.review.assign", "受理并指定非例行评议人员", "maintenance"],
  ["maintenance.nonroutine.review.opinion.submit", "提交本人非例行评议意见", "maintenance"],
  ["maintenance.nonroutine.review.opinions.view", "审议非例行全部评议意见", "maintenance"],
  ["maintenance.nonroutine.review.finalize", "终审非例行工时", "maintenance"],
  ["maintenance.hours.period.view", "查看工时账期确认", "maintenance"],
  ["maintenance.hours.period.assign", "指定工时账期负责人", "maintenance"],
  ["maintenance.hours.period.confirm", "确认负责月份的工时账期", "maintenance"],
  ["maintenance.hours.period.cross_period.authorize", "授权封账工时跨期处理", "maintenance"],
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
  ["maintenance.review.submit", "复核维修报工", "maintenance"],
  ["maintenance.stats.self.view", "查看本人维修统计", "maintenance"],
  ["maintenance.stats.manage.view", "查看管理范围维修统计", "maintenance"]
];

const existing = [
  ["audit.read", "审计查询", "settings"],
  ["audit.export", "审计导出", "settings"],
  ["attendance.offset.rules.manage", "管理考勤兑换规则与结算", "attendance"],
  ["attendance.offset.submit", "本人申请及撤回考勤抵消", "attendance"],
  ["attendance.offset.approve", "审批受派考勤抵消", "attendance"],
  ["attendance.offset.responsibility.manage", "核实考勤班次责任与转办", "attendance"],
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
  ["attendance.export", "导出考勤数据", "attendance"],
  ["handover.view", "查看班组交接", "info"], ["handover.create", "填写班组交接", "info"],
  ["handover.history.all", "查看全部交接历史", "info"], ["handover.baseline.manage", "管理班序基准", "info"],
  ["handover.export", "导出交接记录", "info"]
];

export const RBAC_PERMISSION_DEFINITIONS = [...CAPABILITY_CONFIGURATION_PERMISSIONS, ...capabilityV2, ...personnelV2, ...maintenanceV2, ...existing];

// 动作→数据范围绑定声明（V1.1 §4.2「动作绑定范围」，S1 批次：先声明+静态审计，运行时强制后续批）。
// 每个权限码声明它检查的数据范围模块（scopeModule）与资源类别（resource）：
// - scopeModule 必须是 SCOPE_MODULES 之一；纯系统/全局配置动作声明 null 并写明 note。
// - 声明必须与当前运行时行为一致（纯补全语义，不改变行为）。
// - hours.* 五码按运行时实际复用 maintenance 范围（hours 模块无运行时检查点）。
// - handover.* 的访问由班组长身份+本班/指定接收人对象授权控制，不走模块数据范围。
export const ACTION_SCOPE_BINDINGS = {
  // ---- personnel（人员与能力） ----
  "personnel.list.view": { scopeModule: "personnel", resource: "personnel" },
  "personnel.detail.view": { scopeModule: "personnel", resource: "personnel" },
  "personnel.profile.create": { scopeModule: "personnel", resource: "personnel" },
  "personnel.profile.update": { scopeModule: "personnel", resource: "personnel" },
  "personnel.lifecycle.manage": { scopeModule: "personnel", resource: "personnel" },
  "personnel.organization.manage": { scopeModule: "personnel", resource: "personnel" },
  "personnel.import.view": { scopeModule: "personnel", resource: "personnel" },
  "personnel.import.execute": { scopeModule: "personnel", resource: "personnel" },
  "personnel.audit.view": { scopeModule: "personnel", resource: "personnel" },
  "personnel.quality.view": { scopeModule: "personnel", resource: "personnel" },
  "personnel.qualification.view": { scopeModule: "personnel", resource: "personnel" },
  "personnel.qualification.manage": { scopeModule: "personnel", resource: "personnel" },
  "personnel.actual_grade.view": { scopeModule: "personnel", resource: "personnel" },
  "personnel.actual_grade.manage": { scopeModule: "personnel", resource: "personnel" },
  "personnel.actual_grade.export": { scopeModule: "personnel", resource: "personnel" },
  // ---- capability（能力，运行时复用 personnel 范围） ----
  "capability.overview.view": { scopeModule: "personnel", resource: "capability" },
  "capability.allocation.view": { scopeModule: "personnel", resource: "capability" },
  "capability.allocation.simulate": { scopeModule: "personnel", resource: "capability" },
  "capability.allocation.submit": { scopeModule: "personnel", resource: "capability" },
  "capability.status.view": { scopeModule: "personnel", resource: "capability" },
  "capability.status.manage": { scopeModule: "personnel", resource: "capability" },
  "capability.config.manage": { scopeModule: "personnel", resource: "capability" },
  "capability.history.view": { scopeModule: "personnel", resource: "capability" },
  "capability.scenario.view": { scopeModule: "personnel", resource: "capability" },
  "capability.scenario.manage": { scopeModule: "personnel", resource: "capability" },
  "capability.scenario.apply": { scopeModule: "personnel", resource: "capability" },
  "capability.report.view": { scopeModule: "personnel", resource: "capability" },
  "capability.report.export": { scopeModule: "personnel", resource: "capability" },
  // ---- accounts（登录账户，按关联人员位置过滤） ----
  "accounts.read": { scopeModule: "accounts", resource: "account" },
  "accounts.create": { scopeModule: "accounts", resource: "account" },
  "accounts.update": { scopeModule: "accounts", resource: "account" },
  "accounts.disable": { scopeModule: "accounts", resource: "account" },
  "accounts.password.reset": { scopeModule: "accounts", resource: "account" },
  "accounts.bulk_open": { scopeModule: "accounts", resource: "account" },
  "accounts.roles.assign": { scopeModule: "accounts", resource: "account" },
  "accounts.scopes.assign": { scopeModule: "accounts", resource: "account" },
  // ---- 全局配置（无行级数据范围） ----
  "roles.read": { scopeModule: null, resource: "role", note: "角色定义为全局配置，无按人范围" },
  "roles.manage": { scopeModule: null, resource: "role", note: "角色定义为全局配置，无按人范围" },
  "settings.manage": { scopeModule: null, resource: "setting", note: "系统设置为全局配置，无按人范围" },
  "audit.read": { scopeModule: null, resource: "audit_log", note: "审计日志为全量管理员视图，无按人范围" },
  "audit.export": { scopeModule: null, resource: "audit_log", note: "审计导出为全量管理员视图，无按人范围" },
  "fixed.read": { scopeModule: null, resource: "fixed_item", note: "固化项目为全局主数据，无人员范围" },
  "fixed.manage": { scopeModule: null, resource: "fixed_item", note: "固化项目为全局主数据，无人员范围" },
  // ---- info（信息传达，行级维度=发布者账户） ----
  "info.read": { scopeModule: "info", resource: "record" },
  "info.create": { scopeModule: "info", resource: "record" },
  "info.update.own": { scopeModule: "info", resource: "record" },
  "info.update.any": { scopeModule: "info", resource: "record" },
  "info.delete.own": { scopeModule: "info", resource: "record" },
  "info.delete.any": { scopeModule: "info", resource: "record" },
  "info.void.own": { scopeModule: "info", resource: "record" },
  "info.void.any": { scopeModule: "info", resource: "record" },
  "info.restore": { scopeModule: "info", resource: "record" },
  "info.remind.own": { scopeModule: "info", resource: "record" },
  "info.remind.any": { scopeModule: "info", resource: "record" },
  "info.receipt.manage": { scopeModule: "info", resource: "record" },
  "info.stats.read": { scopeModule: "info", resource: "record" },
  "info.export": { scopeModule: "info", resource: "record" },
  // ---- handover（交接：身份+对象授权，不走模块数据范围） ----
  "handover.view": { scopeModule: null, resource: "handover", note: "交接访问由当前班组长身份+本班/指定接收人对象授权控制" },
  "handover.create": { scopeModule: null, resource: "handover", note: "交接办理由当前班组长身份控制，不走模块数据范围" },
  "handover.history.all": { scopeModule: null, resource: "handover", note: "交接历史为全局视图，按班组长身份放开" },
  "handover.baseline.manage": { scopeModule: null, resource: "handover", note: "班序基准为全局配置" },
  "handover.export": { scopeModule: null, resource: "handover", note: "交接导出继承查看范围（身份控制）" },
  // ---- attendance（考勤） ----
  "attendance.read": { scopeModule: "attendance", resource: "attendance_day" },
  "attendance.record.manage": { scopeModule: "attendance", resource: "attendance_day" },
  "attendance.exception.manage": { scopeModule: "attendance", resource: "attendance_day" },
  "attendance.stats.read": { scopeModule: "attendance", resource: "attendance_day" },
  "attendance.export": { scopeModule: "attendance", resource: "attendance_day" },
  "attendance.offset.submit": { scopeModule: "attendance", resource: "offset_claim" },
  "attendance.offset.approve": { scopeModule: "attendance", resource: "offset_claim" },
  "attendance.offset.rules.manage": { scopeModule: "attendance", resource: "offset_rule" },
  "attendance.offset.responsibility.manage": { scopeModule: "attendance", resource: "offset_claim" },
  // ---- hours（工时统计：运行时复用 maintenance 范围） ----
  "hours.read": { scopeModule: "maintenance", resource: "hour_result", note: "hours 模块无运行时检查点，实际复用 maintenance 范围" },
  "hours.detail.read": { scopeModule: "maintenance", resource: "hour_result", note: "hours 模块无运行时检查点，实际复用 maintenance 范围" },
  "hours.adjust": { scopeModule: "maintenance", resource: "hour_result", note: "hours 模块无运行时检查点，实际复用 maintenance 范围" },
  "hours.confirm": { scopeModule: "maintenance", resource: "hour_result", note: "hours 模块无运行时检查点，实际复用 maintenance 范围" },
  "hours.export": { scopeModule: "maintenance", resource: "hour_result", note: "hours 模块无运行时检查点，实际复用 maintenance 范围" },
  // ---- maintenance（维修管控） ----
  "maintenance.view": { scopeModule: "maintenance", resource: "flight" },
  "maintenance.dispatch.view": { scopeModule: "maintenance", resource: "flight" },
  "maintenance.execute.view": { scopeModule: "maintenance", resource: "assignment" },
  "maintenance.execute.submit": { scopeModule: "maintenance", resource: "assignment" },
  "maintenance.opportunity.create": { scopeModule: "maintenance", resource: "flight" },
  "maintenance.opportunity.update": { scopeModule: "maintenance", resource: "flight" },
  "maintenance.opportunity.delete": { scopeModule: "maintenance", resource: "flight" },
  "maintenance.opportunity.import": { scopeModule: "maintenance", resource: "flight" },
  "maintenance.content.manage": { scopeModule: "maintenance", resource: "flight" },
  "maintenance.assignment.manage": { scopeModule: "maintenance", resource: "assignment" },
  "maintenance.review.view": { scopeModule: "maintenance", resource: "flight" },
  "maintenance.review.submit": { scopeModule: "maintenance", resource: "flight" },
  "maintenance.archive.modify": { scopeModule: "maintenance", resource: "flight" },
  "maintenance.nonroutine.create.own": { scopeModule: "maintenance", resource: "flight" },
  "maintenance.nonroutine.update.own": { scopeModule: "maintenance", resource: "flight" },
  "maintenance.nonroutine.delete.own": { scopeModule: "maintenance", resource: "flight" },
  "maintenance.nonroutine.review.view": { scopeModule: "maintenance", resource: "review_case" },
  "maintenance.nonroutine.review.assign": { scopeModule: "maintenance", resource: "review_case" },
  "maintenance.nonroutine.review.opinion.submit": { scopeModule: "maintenance", resource: "review_case" },
  "maintenance.nonroutine.review.opinions.view": { scopeModule: "maintenance", resource: "review_case" },
  "maintenance.nonroutine.review.finalize": { scopeModule: "maintenance", resource: "review_case" },
  "maintenance.nonroutine.review.cancel": { scopeModule: "maintenance", resource: "review_case" },
  "maintenance.standard.view": { scopeModule: "maintenance", resource: "standard_version" },
  "maintenance.standard.manage": { scopeModule: "maintenance", resource: "standard_version" },
  "maintenance.standard.publish": { scopeModule: "maintenance", resource: "standard_version" },
  "maintenance.rules.view": { scopeModule: "maintenance", resource: "rule" },
  "maintenance.rules.manage": { scopeModule: "maintenance", resource: "rule" },
  "maintenance.hours.confirm": { scopeModule: "maintenance", resource: "hour_result" },
  "maintenance.hours.adjust": { scopeModule: "maintenance", resource: "hour_result" },
  "maintenance.hours.period.view": { scopeModule: "maintenance", resource: "hour_period" },
  "maintenance.hours.period.assign": { scopeModule: "maintenance", resource: "hour_period" },
  "maintenance.hours.period.confirm": { scopeModule: "maintenance", resource: "hour_period" },
  "maintenance.hours.period.cross_period.authorize": { scopeModule: "maintenance", resource: "hour_period" },
  "maintenance.stats.self.view": { scopeModule: "maintenance", resource: "hour_result" },
  "maintenance.stats.manage.view": { scopeModule: "maintenance", resource: "hour_result" },
  "maintenance.export": { scopeModule: "maintenance", resource: "hour_result" },
  "maintenance.workflow.view": { scopeModule: "maintenance", resource: "workflow_task" },
  "maintenance.workflow.manage": { scopeModule: "maintenance", resource: "workflow_task" },
  "maintenance.workflow.submit": { scopeModule: "maintenance", resource: "workflow_task" },
  "maintenance.module.manage": { scopeModule: "maintenance", resource: "module_instance" }
};

export function scopeBindingFor(permission) {
  return ACTION_SCOPE_BINDINGS[permission] || null;
}

export const RBAC_PERMISSION_DEPENDENCIES = {
  "maintenance.module.manage": ["maintenance.view"],
  "maintenance.workflow.view": ["maintenance.view"],
  "maintenance.workflow.manage": ["maintenance.view", "maintenance.workflow.view"],
  "maintenance.workflow.submit": ["maintenance.view", "maintenance.workflow.view"],
  "maintenance.standard.view": ["maintenance.view"],
  "maintenance.standard.manage": ["maintenance.view", "maintenance.standard.view"],
  "maintenance.standard.publish": ["maintenance.view", "maintenance.standard.view"],
  "maintenance.nonroutine.review.view": ["maintenance.view"],
  "maintenance.nonroutine.review.cancel": ["maintenance.nonroutine.review.view"],
  "maintenance.nonroutine.review.assign": ["maintenance.nonroutine.review.view"],
  "maintenance.nonroutine.review.opinion.submit": ["maintenance.nonroutine.review.view"],
  "maintenance.nonroutine.review.opinions.view": ["maintenance.nonroutine.review.view"],
  "maintenance.nonroutine.review.finalize": ["maintenance.nonroutine.review.view"],
  "maintenance.hours.period.view": ["maintenance.view"],
  "maintenance.hours.period.assign": ["maintenance.hours.period.view"],
  "maintenance.hours.period.confirm": ["maintenance.hours.period.view"],
  "maintenance.hours.period.cross_period.authorize": ["maintenance.hours.period.view"],
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
  "handover.create": ["handover.view"],
  "handover.history.all": ["handover.view"],
  "handover.baseline.manage": ["handover.view"],
  "handover.export": ["handover.view"],
  "roles.manage": ["roles.read"]
};

const worker = ["info.read", "info.delete.own", "maintenance.view", "maintenance.nonroutine.review.view", "maintenance.execute.view", "maintenance.execute.submit", "maintenance.standard.view", "maintenance.nonroutine.create.own", "maintenance.nonroutine.update.own", "maintenance.nonroutine.delete.own", "maintenance.stats.self.view", "handover.view", "handover.create", "hours.read", "attendance.read", "attendance.offset.submit"];
const dispatcher = [...worker, "maintenance.dispatch.view", "maintenance.opportunity.create", "maintenance.opportunity.update", "maintenance.content.manage", "maintenance.assignment.manage", "maintenance.hours.adjust", "maintenance.stats.manage.view"];
const manager = [...dispatcher, "maintenance.rules.view", "info.create", "info.update.own", "info.void.own", "info.remind.own", "info.receipt.manage", "info.stats.read", "info.export", "personnel.list.view", "personnel.detail.view", "personnel.profile.update", "personnel.qualification.view", "personnel.quality.view", "personnel.audit.view", "capability.overview.view", "capability.allocation.view", "capability.allocation.simulate", "capability.allocation.submit", "capability.status.view", "capability.status.manage", "capability.history.view", "capability.scenario.view", "capability.scenario.manage", "capability.report.view", "capability.report.export", "handover.history.all", "handover.baseline.manage", "handover.export", "hours.detail.read", "attendance.stats.read", "attendance.export", "personnel.profile.create", "fixed.manage"];

export const RBAC_ROLE_DEFINITIONS = {
  system_admin: RBAC_PERMISSION_DEFINITIONS.map(([code]) => code),
  worker, dispatcher, manager,
  addon_capability_readonly: ["capability.overview.view"],
  addon_fixed_readonly: ["fixed.read"],
  addon_maintenance_review: ["maintenance.review.view", "maintenance.review.submit"],
  addon_nonroutine_review_cancel: ["maintenance.view", "maintenance.nonroutine.review.view", "maintenance.nonroutine.review.cancel"],
  addon_nonroutine_reviewer: ["maintenance.view", "maintenance.nonroutine.review.view", "maintenance.nonroutine.review.opinion.submit"],
  addon_nonroutine_review_auditor: ["maintenance.view", "maintenance.nonroutine.review.view", "maintenance.nonroutine.review.opinions.view"],
  addon_nonroutine_review_finalizer: ["maintenance.view", "maintenance.nonroutine.review.view", "maintenance.nonroutine.review.finalize"],
  addon_maintenance_period_assign: ["maintenance.view", "maintenance.hours.period.view", "maintenance.hours.period.assign"],
  addon_maintenance_period_responsible: ["maintenance.view", "maintenance.hours.period.view", "maintenance.hours.period.confirm"],
  addon_maintenance_cross_period: ["maintenance.view", "maintenance.hours.period.view", "maintenance.hours.period.cross_period.authorize"],
  addon_maintenance_module_manager: ["maintenance.view", "maintenance.module.manage"],
  addon_maintenance_workflow_manager: ["maintenance.view", "maintenance.workflow.view", "maintenance.workflow.manage"],
  addon_maintenance_workflow_participant: ["maintenance.view", "maintenance.workflow.view", "maintenance.workflow.submit"],
  addon_maintenance_standard_publisher: ["maintenance.view", "maintenance.standard.view", "maintenance.standard.publish"],
  addon_maintenance_standard_manager: ["maintenance.view", "maintenance.standard.view", "maintenance.standard.manage"],
  addon_hours_confirm: ["maintenance.stats.manage.view", "maintenance.hours.confirm"],
  addon_maintenance_import: ["maintenance.dispatch.view", "maintenance.opportunity.import"],
  addon_maintenance_delete: ["maintenance.dispatch.view", "maintenance.opportunity.delete"],
  addon_maintenance_export: ["maintenance.stats.manage.view", "maintenance.export"],
  addon_maintenance_rules: ["maintenance.stats.manage.view", "maintenance.rules.view", "maintenance.rules.manage"],
  addon_archive_modify: ["maintenance.review.view", "maintenance.review.submit", "maintenance.archive.modify"],
  addon_info_advanced: ["info.read", "info.update.any", "info.delete.any", "info.void.any", "info.restore", "info.remind.any"],
  addon_personnel_import: ["personnel.import.view", "personnel.import.execute"],
  addon_actual_grade_manage: ["personnel.detail.view", "personnel.profile.update", "personnel.actual_grade.view", "personnel.actual_grade.manage", "personnel.actual_grade.export"],
  addon_organization_manage: ["personnel.list.view", "personnel.detail.view", "personnel.organization.manage"],
  addon_qualification_manage: ["personnel.detail.view", "personnel.qualification.view", "personnel.qualification.manage"],
  addon_personnel_lifecycle: ["personnel.list.view", "personnel.detail.view", "personnel.lifecycle.manage"],
  addon_capability_config: ["capability.overview.view", "capability.config.manage"],
  addon_scenario_apply: ["capability.allocation.view", "capability.allocation.submit", "capability.scenario.view", "capability.scenario.apply"],
  addon_account_role_manage: ["personnel.list.view", "accounts.read", "accounts.create", "accounts.update", "accounts.disable", "accounts.password.reset", "accounts.bulk_open", "accounts.roles.assign", "accounts.scopes.assign", "roles.read", "roles.manage"],
  addon_offset_approver: ["attendance.offset.submit", "attendance.offset.approve"],
  addon_offset_admin: ["attendance.offset.rules.manage", "attendance.offset.responsibility.manage"],
  addon_hours_manage: ["hours.read", "hours.detail.read", "hours.adjust", "hours.confirm", "hours.export"],
  addon_attendance_manage: ["attendance.read", "attendance.record.manage", "attendance.exception.manage", "attendance.stats.read", "attendance.export"],
  addon_system_settings: ["settings.manage"]
};

export const RBAC_BASE_ROLE_CODES = ["worker", "dispatcher", "manager"];

// 受控编辑角色（rbacRoleControlledEdit）保留手工授予，但代码基线新增的权限
// 必须在每次播种时补入，否则新功能会对基础角色静默缺失（2026-11-24 生产实证）。
export function missingBaselineRolePermissions(roleCode, currentCodes = []) {
  const baseline = RBAC_ROLE_DEFINITIONS[roleCode];
  if (!baseline) return [];
  const current = new Set(currentCodes);
  return baseline.filter(code => !current.has(code));
}

export const RBAC_ROLE_NAMES = {
  system_admin: "系统管理员", worker: "工作者", dispatcher: "派工人员", manager: "管理者",
  addon_capability_readonly: "附加：能力看板只读", addon_fixed_readonly: "附加：固化项目只读",
  addon_maintenance_review: "附加：维修复核", addon_hours_confirm: "附加：工时确认",
  addon_nonroutine_review_cancel: "附加：非例行评议取消负责人",
  addon_nonroutine_review_assign: "附加：非例行评议受理", addon_nonroutine_reviewer: "附加：非例行评议员",
  addon_nonroutine_review_auditor: "附加：非例行工时审议", addon_nonroutine_review_finalizer: "附加：非例行工时终审",
  addon_maintenance_period_assign: "附加：账期负责人指定", addon_maintenance_period_responsible: "附加：工时账期负责人",
  addon_maintenance_cross_period: "附加：封账跨期授权",
  addon_maintenance_standard_manager: "附加：标准库草稿管理",
  addon_maintenance_module_manager: "附加：非结算模块维护",
  addon_maintenance_workflow_manager: "附加：非结算流程管理",
  addon_maintenance_workflow_participant: "附加：非结算流程办理",
  addon_maintenance_standard_publisher: "附加：独立标准发布负责人",
  addon_maintenance_import: "附加：维修导入", addon_maintenance_delete: "附加：维修删除",
  addon_maintenance_export: "附加：维修导出", addon_maintenance_rules: "附加：维修规则",
  addon_archive_modify: "附加：归档修正", addon_info_advanced: "附加：信息高级管理",
  addon_personnel_import: "附加：人员数据导入", addon_organization_manage: "附加：组织管理", addon_actual_grade_manage: "附加：实际岗级管理",
  addon_qualification_manage: "附加：资质维护", addon_personnel_lifecycle: "附加：人员生命周期管理", addon_capability_config: "附加：能力规则配置",
  addon_scenario_apply: "附加：方案应用", addon_account_role_manage: "附加：账号角色管理",
  addon_offset_approver: "附加：考勤抵消审批",
  addon_offset_admin: "附加：考勤抵消规则管理",
  addon_hours_manage: "附加：工时管理",
  addon_attendance_manage: "附加：考勤管理",
  addon_offset_approver: "附加：本人提交考勤抵消申请并审批受派申请（B4 干部池/值班班组长路由的审批能力）。",
  addon_offset_admin: "附加：管理考勤抵消规则（月度额度）与责任重路由。",
  addon_hours_manage: "附加：查看工时明细、调整工时、确认工时并导出。",
  addon_attendance_manage: "附加：管理考勤记录与异常，查看统计并导出。",
  addon_system_settings: "附加：系统配置"
};

export const RBAC_ROLE_DESCRIPTIONS = {
  system_admin: "54002010专用；拥有全部系统权限和全部数据范围，标准正式发布仍要求独立业务授权。",
  worker: "独立可选。信息只读；执行与报工本人任务；维护本人未提交非例行；查看本人统计。",
  dispatcher: "独立可选，包含工作者权限；另可建立和修改未确认维修机会、派工、维护工作内容并调整未确认工时。",
  manager: "包含工作者和派工人员权限；另可发布信息、维护人员一般资料和进行能力调配。",
  addon_capability_readonly: "可选只读能力看板。",
  addon_fixed_readonly: "查看固化项目。",
  addon_maintenance_review: "查看并复核维修报工。",
  addon_nonroutine_review_cancel: "仅取消授权范围内尚未入账的评议，保留原工作与全部历史。",
  addon_nonroutine_reviewer: "仅以本人有效指定席位提交非例行评议意见。",
  addon_nonroutine_review_auditor: "在授权范围内读取完整评议意见。",
  addon_nonroutine_review_finalizer: "作为指定负责人在12份意见封闭后终审。",
  addon_maintenance_period_assign: "在全维修数据范围内人工指定月份账期负责人，不自动确认账期。",
  addon_maintenance_period_responsible: "在全维修数据范围内确认本人负责月份的开放或封账状态，必须记录依据。",
  addon_maintenance_cross_period: "原账期指定负责人可明确目标开放账期及依据，不自动入账或替代终审。",
  addon_maintenance_module_manager: "明确授予后在全维修范围注册非结算模块，不含工作流任务处理、工时核算或状态门槛发布。",
  addon_maintenance_workflow_manager: "明确授予后在全维修范围指派、改派及取消非结算流程；不代替责任人提交，不含模块注册、业务模板发布、工时或状态门槛管理。",
  addon_maintenance_workflow_participant: "明确授予后，仅可查看、认领及提交本人有效人员身份下指派的非结算任务；不能读取他人结果或管理流程。",
  addon_maintenance_standard_publisher: "经单独明确授予，在全维修范围办理标准准入与发布；不含草稿修改、12人评议受理或终审，超级账户通用权限不替代独立业务授权。",
  addon_maintenance_standard_manager: "全维修范围内维护未发布标准草稿及停用已发布标准；不包含评议、终审或正式发布授权。",
  addon_hours_confirm: "确认维修工时和架次。",
  addon_maintenance_import: "导入维修机会。",
  addon_maintenance_delete: "删除未确认维修机会。",
  addon_maintenance_export: "导出维修数据。",
  addon_maintenance_rules: "维护维修工时规则。",
  addon_archive_modify: "修正已归档维修数据。",
  addon_info_advanced: "修改、删除、作废和恢复他人发布的信息。",
  addon_personnel_import: "执行人员、执照、授权和培训导入。",
  addon_actual_grade_manage: "在人员数据范围内查看并维护实际岗级。",
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
  // 基础角色已改为独立可选（V1.0 §1），不再限制恰好一个。
  if (superAccount && (selected.size !== 1 || !selected.has("system_admin"))) errors.push({ code: "SUPER_ACCOUNT_ROLE_FIXED" });
  return errors;
}

export const NAVIGATION_NODES = [
  { id: "infoPage", anyOf: ["info.read"], children: [
    { id: "infoListSubpage", anyOf: ["info.read"], label: "信息传达" },
    { id: "statsSubpage", anyOf: ["info.stats.read"], label: "统计分析" },
    { id: "handoverSubpage", anyOf: ["handover.view"], label: "班组交接" }
  ]},
  { id: "maintenancePage", anyOf: ["maintenance.view", "maintenance.execute.view", "maintenance.dispatch.view", "maintenance.review.view", "maintenance.stats.manage.view"], children: [
    { id: "dispatch", anyOf: ["maintenance.dispatch.view"], label: "派工视图" },
    { id: "execute", anyOf: ["maintenance.execute.view"], label: "执行报工" },
    { id: "hours", anyOf: ["maintenance.stats.manage.view"], label: "工时统计" },
    { id: "reviews", anyOf: ["maintenance.nonroutine.review.view"], label: "非例行评议" },
    { id: "standards", anyOf: ["maintenance.standard.view"], label: "标准库" },
    { id: "periods", anyOf: ["maintenance.hours.period.view"], label: "账期管理" },
    { id: "workflows", anyOf: ["maintenance.workflow.view"], label: "非结算流程" }
  ]},
  { id: "fixedPage", anyOf: ["fixed.read"] },
  { id: "personnelPage", anyOf: [...capabilityV2.map(([code]) => code).filter(code => code.endsWith(".view")), ...personnelV2.map(([code]) => code).filter(code => code.endsWith(".view")), "personnel.organization.manage", "personnel.qualification.manage"], children: [
    { id: "capability", anyOf: ["capability.overview.view", "capability.allocation.view", "capability.status.view", "capability.history.view", "capability.scenario.view", "capability.report.view"], label: "人员配置" },
    { id: "authorization", anyOf: ["personnel.list.view", "personnel.qualification.view"], label: "人员授权" },
    { id: "master", anyOf: ["personnel.organization.manage", "personnel.qualification.manage"], label: "主数据管理" }
  ]},
  { id: "hoursPage", anyOf: ["hours.read"] },
  { id: "attendancePage", anyOf: ["attendance.read"] },
  { id: "settingsPage", anyOf: ["accounts.read", "roles.read", "settings.manage", "audit.read"], children: [
    { id: "accountsTab", anyOf: ["accounts.read"], label: "登录账户" },
    { id: "rolesTab", anyOf: ["roles.read"], label: "角色权限" },
    { id: "auditTab", anyOf: ["audit.read"], label: "审计" },
    { id: "systemTab", anyOf: ["settings.manage"], label: "系统配置" }
  ]}
];

export function visibleNavigation(permissionCodes, isSuper = false) {
  const permissions = new Set(permissionCodes || []);
  return NAVIGATION_NODES.filter(node => isSuper || node.anyOf.some(code => permissions.has(code))).map(node => node.id);
}

// 层①导航树（V1.1 §4.1）：返回带 children 的可见导航树，前端统一渲染，替代散落的 hasRbac 判断。
export function visibleNavigationTree(permissionCodes, isSuper = false) {
  const permissions = new Set(permissionCodes || []);
  const visible = node => isSuper || node.anyOf.some(code => permissions.has(code));
  return NAVIGATION_NODES.filter(visible).map(node => ({
    id: node.id,
    children: (node.children || []).filter(visible).map(child => ({ id: child.id, label: child.label }))
  }));
}
