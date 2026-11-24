import {loginAuditFilters,readLoginAudit,loginAuditXlsx} from './login-audit.mjs';
import {createActionTaskRealtime} from './action-task-realtime.mjs';
import { createOffsetService } from './attendance-offset-service.mjs';
import {createHandoverService} from './handover-service.mjs';
import {MAINTENANCE_REVIEW_ADDITION_SOURCES_SCHEMA,createReviewAdditionSources} from './maintenance-review-addition-sources.mjs';
import {MAINTENANCE_REPORT_SOURCE_JOURNAL_SCHEMA,createReportSourceJournal} from './maintenance-report-source-journal.mjs';
import {reportParticipantSource} from './maintenance-report-participant-source.mjs';
import {MAINTENANCE_WORKFLOW_TASKS_SCHEMA} from './maintenance-workflow-tasks.mjs';
import {MAINTENANCE_RULE_HISTORY_SCHEMA,createMaintenanceRuleHistory} from './maintenance-rule-history.mjs';
import {createMaintenanceWorkflowActions,readMaintenanceWorkflowTemplate} from './maintenance-workflow-actions.mjs';
import {maintenanceWorkflowTemplates,resolveMaintenanceWorkflowTemplate} from './maintenance-workflow-templates.mjs';
import {readMaintenanceWorkflowCompletion} from './maintenance-workflow-results.mjs';
import {createMaintenanceResultDispatcher} from './maintenance-result-dispatch.mjs';
import {readMaintenanceWorkflowAudit} from './maintenance-workflow-audit.mjs';
import {cancelNonroutineReviewForSourceRemoval,createNonroutineReviewCancellation} from './nonroutine-source-cancellation.mjs';
import {createMaintenanceExtensionModules} from './maintenance-extension-modules.mjs';
import {resolveManualUnlistedSubmissionMatch} from './maintenance-manual-sources.mjs';
import {maintenanceTowTransition,assertLegacyTowCreation,assertLegacyTowRuleWrites} from './maintenance-tow-transition.mjs';
import {readNonroutineSourceFacts,saveNonroutineSourceBaseline,snapshotNonroutineSourceFacts,recordNonroutineSourceFactsChanges,approvedNonroutineSourceFacts} from './nonroutine-source-facts.mjs';
import {frozenNonroutineFinalPolicy} from './nonroutine-frozen-policy.mjs';
import {createNonroutineCorrections} from './nonroutine-correction-service.mjs';
import {NONROUTINE_CORRECTIONS_SCHEMA} from './nonroutine-corrections.mjs';
import { evaluateMaintenanceTransition,coordinateMaintenanceTransition,MAINTENANCE_REPORT_DEFINITIONS } from './maintenance-opportunity-modules.mjs';
import {MAINTENANCE_MODULE_INSTANCES_SCHEMA,createMaintenanceModuleInstances,readPersistedMaintenanceReportModules,readMaintenanceModuleIdentity,refreezeMaintenanceModuleIdentity} from './maintenance-module-instances.mjs';
import {attendanceViewerSnapshot} from './attendance-response-policy.mjs';
import {attendanceIssueDay,attendanceOrderedCategories} from './public/attendance-presentation.mjs';
import {leaveXlsx,leaveHtml} from './attendance-leave-export.mjs';
import {handoverXlsx} from './handover-export.mjs';
import { createAttendanceService } from './attendance-service.mjs';
import { exportXlsx as attendanceXlsx, exportHtml as attendanceHtml } from './attendance-export.mjs';
import {AUTHORIZATION_HEADERS,AUTHORIZATION_SCHEMA,authorizationDate,migrateAuthorizationNine,createAuthorizationImport} from './authorization-import.mjs';
import {createImportWorkspace,IMPORT_WORKSPACE_SCHEMA} from './import-workspace.mjs';
import { importHistoryContext } from './personnel-import-history.mjs';
import {organizationLanes,resolveOrganizationPath} from './organization-lanes.mjs';
import http from "node:http";
import { dispatchImportIdentity, dispatchImportAssignments } from './maintenance-dispatch-import.mjs';
import { installInfoSync, createInfoSync } from './info-sync.mjs';
import { normalizeAircraftHours, resolveAircraftHours } from "./maintenance-aircraft-hours.mjs";
import { MAINTENANCE_STANDARDS_SCHEMA, NONROUTINE_CATEGORY_STRATEGIES, createMaintenanceStandards } from "./maintenance-standards.mjs";
import {readStandardReferences} from './maintenance-standard-references.mjs';
import {STANDARD_MANAGEMENT_SCHEMA,createStandardManagement} from './maintenance-standard-management.mjs';
import {STANDARD_IMPORT_SCHEMA,parseStandardImportFile,createStandardImport} from './maintenance-standard-import.mjs';
import {MANUAL_NONROUTINE_SOURCES_SCHEMA,createManualNonroutineSources} from './maintenance-manual-sources.mjs';
import {WORK_STANDARD_INTAKE_SCHEMA,createWorkStandardIntake} from './maintenance-work-standard-intake.mjs';
import {standardPublicationAuthorized,standardPublicationApplicability} from './maintenance-standard-publication-authority.mjs';
import {STANDARD_PUBLICATION_SCHEMA,createStandardPublication} from './maintenance-standard-publication.mjs';
import {STANDARD_EFFECTIVE_REFRESH_SCHEMA,createStandardEffectiveRefresh} from './maintenance-standard-effective-refresh.mjs';
import {MAINTENANCE_OVERNIGHT_FEEDBACK_SCHEMA,createMaintenanceOvernightFeedback} from './maintenance-overnight-feedback.mjs';
import {STANDARD_NOTIFICATIONS_SCHEMA,createStandardNotifications} from './maintenance-standard-notifications.mjs';
import {STANDARD_REVIEW_SCHEMA,createStandardReview} from './maintenance-standard-review.mjs';
import { previewNonroutineImport } from "./maintenance-import-preview.mjs";
import { parseNonroutineImportFile } from "./maintenance-import-file.mjs";
import { NONROUTINE_IMPORT_SCHEMA, createNonroutineImportBatches } from "./maintenance-import-batches.mjs";
import { NONROUTINE_REVIEW_SCHEMA, NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA, createNonroutineReview } from "./nonroutine-review.mjs";
import { NONROUTINE_ASSESSMENT_SCHEMA } from "./nonroutine-assessment.mjs";
import { NONROUTINE_FINALIZATION_SCHEMA, createNonroutineFinalization } from "./nonroutine-finalization.mjs";
import { MAINTENANCE_HOUR_PERIODS_SCHEMA, createMaintenanceHourPeriods } from "./maintenance-hour-periods.mjs";
import { NONROUTINE_ADJUSTMENTS_SCHEMA, deliverNonroutineRecognition, mapRecognitionAssignments,projectRecognitionAllocations } from "./nonroutine-delivery.mjs";
import {NONROUTINE_ROLE_RESULTS_SCHEMA,writeNonroutineRoleResults} from './nonroutine-role-results.mjs';
import { NONROUTINE_CROSS_PERIOD_SCHEMA, NONROUTINE_POSTING_RECEIPTS_SCHEMA, createNonroutineCrossPeriod } from "./nonroutine-cross-period.mjs";
import { NONROUTINE_NOTIFICATIONS_SCHEMA, createNonroutineNotifications } from "./nonroutine-notifications.mjs";
import { createCapabilityService } from "./capability-service.mjs";
import {
  RBAC_PERMISSION_DEFINITIONS,
  RBAC_ROLE_DEFINITIONS,
  RBAC_ROLE_NAMES,
  RBAC_ROLE_DESCRIPTIONS,
  accountRoleCombinationErrors,
  missingBaselineRolePermissions,
  scopeBindingFor,
  permissionDependencyErrors,
  visibleNavigation,
  visibleNavigationTree
} from "./rbac-policy.mjs";
import { AsyncLocalStorage } from "node:async_hooks";
import { preflightIdentity, SCOPE_MODULES, PERSON_TABLES } from "./personnel-identity.mjs";
import { classifyPosition, identityQualityReport } from "./identity-classification.mjs";
import { createPersonnelAccess, preflightOrganizations, migratePersonnelFoundation, SENSITIVE_FIELDS, ORGANIZATION_FIELDS, MODULE_LABELS, CADRE_GROUP_CODE } from "./personnel-access.mjs";
import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {safeAttachmentMime,isInlineSafeName,validateUploadContent} from './attachment-policy.mjs';
import os from "node:os";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import COS from "cos-nodejs-sdk-v5";
import { createDatabase, requestQueryStats } from "./db.mjs";
import { createLoginProtection, loginAddress } from "./login-protection.mjs";
import { createAuthorizationProjects } from "./authorization-projects.mjs";
import { createPersonnelDeletion, installPersonnelDeletionGuards } from "./personnel-deletion.mjs";
import { approvedLocalDevelopment, localSessionCookieName, validateDevelopmentRuntime } from './local-development.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if ((process.env.MUC_LOCAL_DEVELOPMENT_PROFILE || __dirname.includes(`${path.sep}.codex${path.sep}worktrees${path.sep}`)) && process.env.MUC_NO_LISTEN !== '1') validateDevelopmentRuntime(__dirname,process.env);
const isLocalDevelopment = approvedLocalDevelopment(__dirname, process.env);
if(isLocalDevelopment)process.umask(0o077);
if (process.env.MUC_LOCAL_DEVELOPMENT_PROFILE && !isLocalDevelopment) throw new Error('本机开发配置不安全：仅允许回环地址、独立SQLite和关闭真实同步的开发环境');
const sessionCookieName = localSessionCookieName(__dirname,process.env);
if (process.env.ATTENDANCE_ENV_FILE) process.loadEnvFile(process.env.ATTENDANCE_ENV_FILE);
const isCodexWorktree = __dirname.includes(`${path.sep}.codex${path.sep}worktrees${path.sep}`);
if (isCodexWorktree && process.env.MUC_NO_LISTEN !== "1") {
  const missing = ["PORT", "DB_PATH", "UPLOAD_DIR"].filter(key => !String(process.env[key] || "").trim());
  if (missing.length) throw new Error(`Codex工作树禁止使用默认运行参数，缺少：${missing.join("、")}。请执行 npm run start:worktree`);
  if (Number(process.env.PORT) === 8787 && !isLocalDevelopment) throw new Error("Codex工作树禁止占用主站8787端口，请使用8788或其他隔离端口");
  if (path.resolve(process.env.DB_PATH) === path.join(__dirname, "data", "muc.sqlite")) throw new Error("Codex工作树禁止连接默认data/muc.sqlite，请显式使用隔离数据库");
}
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(__dirname, "public");
const dbPath = process.env.DB_PATH || path.join(__dirname, "data", "muc.sqlite");
const dataDir = path.dirname(dbPath);
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
const serviceStartedAt = new Date().toISOString();
const appVersion = process.env.APP_VERSION || "1.0.0";
const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  let appOrigin;
  try { appOrigin = new URL(String(process.env.APP_ORIGIN || "")); } catch {}
  if (!appOrigin || appOrigin.protocol !== "https:" || appOrigin.origin !== String(process.env.APP_ORIGIN || ""))
    throw new Error("生产环境必须设置准确的 HTTPS APP_ORIGIN（网页和接口使用同一站点源）");
  if (process.env.COOKIE_SECURE !== "true")
    throw new Error("生产环境必须启用安全 Cookie（COOKIE_SECURE=true）");
  if (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== appOrigin.origin)
    throw new Error("当前版本不支持跨域携带登录 Cookie，请移除跨域 CORS_ORIGIN 配置");
}
const cosConfig = {
  secretId: String(process.env.COS_SECRET_ID || "").trim(),
  secretKey: String(process.env.COS_SECRET_KEY || "").trim(),
  bucket: String(process.env.COS_BUCKET || "").trim(),
  region: String(process.env.COS_REGION || "").trim()
};
let cosClient = null;
const sessions = new Map();
const loginProtection = createLoginProtection();
const requestContext = new AsyncLocalStorage();
const requestUser = () => { const req = requestContext.getStore()?.req; return req ? currentUser(req) : null; };
const maintenanceEventClients = new Set();
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const INFO_UPLOAD_BYTES = 10 * 1024 * 1024;
const uploadLimit = ownerType => ownerType === 'record' ? INFO_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
const uploadLimitMessage = ownerType => ownerType === 'record' ? '单个附件不能超过 10MiB（约10MB）' : '单个附件不能超过100MB';
let infoSync;
let infoPushTimer=null;
function scheduleInfoSync(){
  if(infoPushTimer || !infoEventClients.size)return;
  infoPushTimer=setTimeout(()=>{infoPushTimer=null;if(infoEventClients.size)pumpInfoSync();},20);
  infoPushTimer.unref?.();
}
const infoEventClients = new Set();
const MAX_FILES_PER_REQUEST = 10;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTS = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "txt", "csv", "log", "md", "xlsx", "xls", "docx", "doc", "pptx", "mp4", "mov", "m4v", "webm", "avi", "mp3", "wav", "m4a", "aac"]);
const BLOCKED_ATTACHMENT_EXTS = new Set(["html", "htm", "svg", "js", "mjs"]);
const SUPER_ACCOUNT_ID = "54002010";
const INCORRECT_SUPER_ACCOUNT_ID = "5400210";
const SUPER_ACCOUNT_NAME = "赵威";

const personnelFunctionCategories = ["维修", "放行"];
const rbacPermissionDefinitions = RBAC_PERMISSION_DEFINITIONS;
const retiredRbacPermissionCodes = [
  "info.update", "info.delete", "info.void", "info.remind", "scopes.manage",
  "capability.read", "capability.allocate", "capability.export",
  "personnel.read", "personnel.create", "personnel.sensitive.read", "personnel.sensitive.view", "personnel.import", "personnel.update", "personnel.qualification.read", "personnel.audit.read",
  "maintenance.read", "maintenance.execute", "maintenance.dispatch", "maintenance.review", "maintenance.stats.read"
];
const retiredRbacRoleCodes = ["info_publisher", "employee", "maintenance_manager", "personnel_manager", "account_manager", "hours_manager", "attendance_manager", "display_readonly"];
const rbacRoleDefinitions = RBAC_ROLE_DEFINITIONS;

const defaultCategories = ["质量问题", "规定要求", "周例会", "日例会", "其他"];

await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(uploadDir, { recursive: true });
const db = await createDatabase({ dbPath });
const authorizationProjects = createAuthorizationProjects({ db, now, randomId, audit });
const personnelDeletion = createPersonnelDeletion({ db, now, randomId, audit, superAccountId: SUPER_ACCOUNT_ID,
  clearSessionCache: userId => { for (const [sid, id] of sessions) if (id === userId) sessions.delete(sid); } });

const personnelAccess = createPersonnelAccess({ db, hasRbac, randomId, now, audit, superAccountId: SUPER_ACCOUNT_ID });
const capabilityService = createCapabilityService({ db, hasRbac, personnelAccess, audit, resolveActor: id => { const row=db.prepare('select * from users where id=?').get(id); return row&&normalizeStatus(row.status)==='active'&&!isDeletedAccountPerson(row)?toUser(row):null; }, superAccountId: SUPER_ACCOUNT_ID });

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function cosEnabled() {
  return Object.values(cosConfig).every(Boolean);
}

function cosSignedUrl(method, objectKey, expiresSeconds = 300, query = {}) {
  if (!cosEnabled()) throw new Error("COS 尚未配置");
  cosClient ||= new COS({ SecretId: cosConfig.secretId, SecretKey: cosConfig.secretKey });
  return cosClient.getObjectUrl({
    Bucket: cosConfig.bucket,
    Region: cosConfig.region,
    Key: String(objectKey || ""),
    Method: String(method || "GET").toUpperCase(),
    Sign: true,
    Expires: Math.max(60, Number(expiresSeconds) || 600),
    Query: query
  });
}

async function deleteCosObject(objectKey) {
  if (!cosEnabled() || !objectKey) return;
  const response = await fetch(cosSignedUrl("DELETE", objectKey, 300), { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error(`COS 删除失败（${response.status}）`);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}

function verifyPassword(password, row) {
  const { hash } = hashPassword(password, row.salt);
  if (!row.password_hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(row.password_hash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function isValidEmployeeNo(value) {
  return /^\d{8}$/.test(String(value || "").trim());
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(item => item && item.family === "IPv4" && !item.internal)
    .map(item => item.address);
}

function json(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function ensureColumn(table, column, definition) {
  const exists = db.prepare(`pragma table_info(${table})`).all().some(row => row.name === column);
  if (!exists) db.exec(`alter table ${table} add column ${column} ${definition}`);
}

function settingValue(key, fallback) {
  const row = db.prepare("select value from settings where key=?").get(key);
  return row ? json(row.value, fallback) : fallback;
}

function setSetting(key, value) {
  db.prepare("insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at")
    .run(key, JSON.stringify(value), now());
}

function maintenanceSyncVersion() {
  return Number(db.prepare("select version from maintenance_sync_state where id=1").get()?.version || 0);
}

function bumpMaintenanceVersion(flightId = "", eventType = "maintenance.updated") {
  const stamp = now();
  db.prepare("update maintenance_sync_state set version=version+1,updated_at=? where id=1").run(stamp);
  const payload = JSON.stringify({ type: eventType, flightId, version: maintenanceSyncVersion(), updatedAt: stamp });
  for (const client of maintenanceEventClients) {
    try { client.write(`event: maintenance\ndata: ${payload}\n\n`); } catch { maintenanceEventClients.delete(client); }
  }
  return JSON.parse(payload);
}

function allPeople(module = "maintenance", scopeOverride = null) {
  const user = requestUser(), scope = scopeOverride || (user ? personnelAccess.predicate(user,module) : { sql:"1=1",params:[] });
  const maintenanceEligible=module==="maintenance"?` and d.unit_type='department' and d.status='active' and g.unit_type='personnel_group' and g.status='active' and (g.maintenance_eligible=1 or g.code='${CADRE_GROUP_CODE}')`:"";
  return db.prepare(`select p.*,u.id as account_id,u.username,u.status as account_status,u.function_category,d.name as department_name,g.code as personnel_group_code,g.name as personnel_group_name,g.maintenance_eligible,at.name as administrative_team_name,wt.name as working_team_name,cs.working_team_id from personnel p
    left join users u on u.person_id=p.id left join organization_units d on d.id=p.department_id left join organization_units g on g.id=p.personnel_group_id left join organization_units at on at.id=p.administrative_team_id left join capability_current_states cs on cs.person_id=p.id left join organization_units wt on wt.id=cs.working_team_id where p.data_status='active'
    and p.employment_status not in ('离职','停职') and (${scope.sql})${maintenanceEligible} order by p.employee_no`).all(...scope.params).map(row => ({
      id: row.id, personId:row.id, accountId:row.account_id || null, employeeNo:row.employee_no,
      username:row.username||"",name:row.name,department:row.department_name||"未设置",personnelGroup:row.personnel_group_name||"",administrativeTeam:row.administrative_team_name||"",
      departmentId:row.department_id,personnelGroupId:row.personnel_group_id,personnelGroupCode:row.personnel_group_code||"",maintenanceEligible:!!row.maintenance_eligible,administrativeTeamId:row.administrative_team_id,teamId:row.working_team_id||row.administrative_team_id,
      team:row.working_team_name||row.administrative_team_name||"未设置",functionCategory:normalizeFunctionCategory(row.function_category),
      hasAccount:!!row.account_id && row.account_status !== "disabled"
    }));
}

function maintenanceCapabilityPeople(scopeOverride = null) {
  return allPeople("maintenance", scopeOverride).filter(person => person.maintenanceEligible && person.personnelGroupCode !== CADRE_GROUP_CODE);
}

function allLoginPeople() { return allPeople("info").filter(person => person.hasAccount).map(person => ({...person,id:person.accountId})); }

// Reporting participants may name any currently eligible maintenance person.
// This does not change dispatch or general personnel-directory scope.
function maintenanceReportPeople(flightId) {
  const user = requestUser();
  if (!user || !hasRbac(user, "maintenance.execute.submit") || !maintenanceCanSubmitReport(user, flightId)) return allPeople();
  return allPeople("maintenance", { sql: "1=1", params: [] });
}

function toUser(row) {
  if (!row) return { id: "", username: "", name: "", rbacRoles: [], rbacPermissions: [], dataScopes: [], visibleNavigation: [] };
  const rbac = rbacSnapshot(row.id);
  if (row.id === SUPER_ACCOUNT_ID) {
    rbac.permissions = db.prepare("select code from rbac_permissions order by code").all().map(item => item.code);
    rbac.scopes = SCOPE_MODULES.map(module => ({id: "super-"+module,module,scopeType:"all",scopeId:"",validFrom:"",validTo:""}));
  }
  const person = row.person_id ? db.prepare("select p.*,d.name as organization_department,g.name as personnel_group,t.name as administrative_team from personnel p left join organization_units d on d.id=p.department_id left join organization_units g on g.id=p.personnel_group_id left join organization_units t on t.id=p.administrative_team_id where p.id=?").get(row.person_id) : null;
  return {
    id: row.id,
    personId: row.person_id || "",
    employeeNo: person?.employee_no || "",
    username: row.username,
    name: person?.name || row.name,
    position: person?.position_code || "",
    actualGrade: person?.actual_grade || "",
    actualGradeMasked: false,
    department:person?.organization_department||row.department||"未设置",
    team:person?.administrative_team||person?.personnel_group||"未设置",
    functionCategory: normalizeFunctionCategory(row.function_category),
    status: row.status || "active",
    mustChangePassword: !!row.must_change_password,
    credentialVersion: Number(row.credential_version || 1),
    rbacRoles: rbac.roles,
    rbacPermissions: rbac.permissions,
    dataScopes: rbac.scopes,
    visibleNavigation: visibleNavigation(rbac.permissions, row.id === SUPER_ACCOUNT_ID),
    navigationTree: visibleNavigationTree(rbac.permissions, row.id === SUPER_ACCOUNT_ID)
  };
}

function adminUser(row) {
  const { position, actualGrade, actualGradeMasked, ...user } = toUser(row);
  return {
    ...user,
    personDeleted: db.prepare("select data_status from personnel where id=?").get(row.person_id || "")?.data_status === "deleted",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeStatus(value) {
  const normalized = String(value || "").trim();
  if (["disabled", "停用", "禁用", "无效"].includes(normalized)) return "disabled";
  return "active";
}

function normalizeFunctionCategory(value) {
  const normalized = String(value || "").trim();
  return personnelFunctionCategories.includes(normalized) ? normalized : "维修";
}

// 兼容：确保 grant_reason/granted_by 列存在（内存库场景迁移 067 未跑时的兜底）
for (const col of ["grant_reason","granted_by"]) { try { db.exec(`alter table rbac_user_scopes add column ${col} text not null default ''`); } catch { /* 列已存在（PG 走迁移 067，SQLite 重复执行） */ } }

function rbacSnapshot(userId) {
  if (!userId) return { roles: [], permissions: [], scopes: [] };
  const assignedRoles = db.prepare(`select r.code,r.name from rbac_roles r
    join rbac_user_roles ur on ur.role_id=r.id where ur.user_id=? and r.status='active' order by r.code`).all(userId);
  const permissions = db.prepare(`select distinct p.code from rbac_permissions p
    join rbac_role_permissions rp on rp.permission_id=p.id
    join rbac_user_roles ur on ur.role_id=rp.role_id
    join rbac_roles r on r.id=ur.role_id
    where ur.user_id=? and r.status='active' order by p.code`).all(userId).map(row => row.code);
  let scopes;
  try { scopes = db.prepare("select id,module,scope_type as scopeType,scope_id as scopeId,valid_from as validFrom,valid_to as validTo,grant_reason as grantReason,granted_by as grantedBy from rbac_user_scopes where user_id=? order by scope_type,scope_id").all(userId); }
  catch { scopes = db.prepare("select id,module,scope_type as scopeType,scope_id as scopeId,valid_from as validFrom,valid_to as validTo from rbac_user_scopes where user_id=? order by scope_type,scope_id").all(userId); }
  return { roles: assignedRoles, permissions, scopes };
}

function hasRbac(user, permission) {
  if (!user?.id) return false;
  if (user.id === SUPER_ACCOUNT_ID) return true;
  return (user.rbacPermissions || rbacSnapshot(user.id).permissions).includes(permission);
}

function hasAnyRbac(user, permissions) {
  return permissions.some(permission => hasRbac(user, permission));
}

// 动作→范围运行时绑定（V1.1 §4.2，S2）：模块由 ACTION_SCOPE_BINDINGS 推导，
// 调用点不再手写范围模块；未登记绑定声明的权限码按开发错误 fail-fast（500）。
function actionScopeModule(permission) {
  const binding = scopeBindingFor(permission);
  if (!binding) throw Object.assign(new Error(`权限码缺少动作→范围绑定声明：${permission}`), { status: 500 });
  return binding.scopeModule;
}
function actionScopeAllows(user, permission, personId) {
  const module = actionScopeModule(permission);
  if (module === null) return true;
  return personnelAccess.allows(user, module, personId);
}
function actionScopeHasAll(user, permission) {
  const module = actionScopeModule(permission);
  if (module === null) return true;
  return personnelAccess.hasAll(user, module);
}
function requireActionScope(user, permission, personId, active = false) {
  const module = actionScopeModule(permission);
  if (module === null) return null;
  return personnelAccess.requirePerson(user, module, personId, active);
}
function actionScopePredicate(user, permission, alias = "p") {
  const module = actionScopeModule(permission);
  if (module === null) return { sql: "1=1", params: [] };
  return personnelAccess.predicate(user, module, alias);
}

function dataScopeAllowsUser(user, targetAccountId, module = "info") {
 if(module==='info' && user?.infoAllowedAccounts)return user.infoAllowedAccounts.has(targetAccountId);
 const account=db.prepare("select person_id from users where id=?").get(targetAccountId || "");
 return !!account?.person_id && personnelAccess.allows(user,module,account.person_id);
}

function requireRbacPermission(req, res, permission) {
  const user = requireLogin(req, res);
  if (!user) return null;
  if (!hasRbac(user, permission)) {
    audit(user, "permission_denied", "permission", permission);
    send(res, 403, { error: "当前账号没有权限", permission });
    return null;
  }
  return user;
}

function requireAnyRbacPermission(req, res, permissions) {
  const user = requireLogin(req, res);
  if (!user) return null;
  if (!hasAnyRbac(user, permissions)) {
    audit(user, "permission_denied", "permission", permissions.join("|"));
    send(res, 403, { error: "当前账号没有权限", permissions });
    return null;
  }
  return user;
}

function routeParam(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function now() {
  return new Date().toISOString();
}

function timestampAfter(value = "") {
  const current = Date.parse(value);
  const next = Number.isFinite(current) ? Math.max(Date.now(), current + 1) : Date.now();
  return new Date(next).toISOString();
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map(item => item.trim()).filter(Boolean).map(item => {
    const index = item.indexOf("=");
    return [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))];
  }));
}

function sessionCookie(value, maxAge = 604800) {
  const secure = process.env.COOKIE_SECURE === "true";
  const parts = [`${sessionCookieName}=${encodeURIComponent(value || "")}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAge}`];
  if (secure) parts.splice(2, 0, "Secure");
  return parts.join("; ");
}

function currentUser(req) {
  const sid = parseCookies(req)[sessionCookieName];
  const savedSession = sid ? db.prepare("select user_id,credential_version from sessions where id=? and expires_at>?").get(sid, now()) : null;
  if (!savedSession?.user_id) {
    if (sid) sessions.delete(sid);
    return toUser(null);
  }
  const row = db.prepare("select * from users where id=?").get(savedSession.user_id);
  const active = row && (row.status || "active") !== "disabled" && !isDeletedAccountPerson(row);
  const currentVersion = Number(row?.credential_version || 1);
  if (!active || currentVersion !== Number(savedSession.credential_version || 1)) {
    sessions.delete(sid);
    db.prepare("delete from sessions where id=?").run(sid);
    return toUser(null);
  }
  sessions.set(sid, row.id);
  return toUser(row);
}

function createLoginSession(row) {
  const sid = randomId("sid");
  sessions.set(sid, row.id);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("insert into sessions(id,user_id,created_at,expires_at,credential_version) values(?,?,?,?,?)").run(sid, row.id, now(), expiresAt, Number(row.credential_version || 1));
  db.prepare("update users set last_login_at=? where id=?").run(now(), row.id);
  const user = toUser(row);
  audit(user, "login", "user", user.id);
  return { sid, user };
}

function revokeUserSessions(userId, { bumpCredentialVersion = false } = {}) {
  if (!userId) return;
  db.prepare("delete from sessions where user_id=?").run(userId);
  for (const [sid, savedUserId] of sessions.entries()) {
    if (savedUserId === userId) sessions.delete(sid);
  }
  if (bumpCredentialVersion) db.prepare("update users set credential_version=coalesce(credential_version,1)+1,updated_at=? where id=?").run(now(), userId);
}

function revokeRoleUserSessions(roleId) {
  const users = db.prepare("select user_id as userId from rbac_user_roles where role_id=?").all(roleId);
  users.filter(item => item.userId !== SUPER_ACCOUNT_ID).forEach(item => revokeUserSessions(item.userId, { bumpCredentialVersion: true }));
  return users.map(item => item.userId);
}

function requireLogin(req, res) {
  const user = currentUser(req);
  if (!user.id) {
    send(res, 401, { error: "请先登录" });
    return null;
  }
  return user;
}

function audit(user, action, targetType, targetId, detail = "") {
  const id = randomId("audit");
  db.prepare("insert into audit_logs(id,user_id,user_name,action,target_type,target_id,detail,created_at) values(?,?,?,?,?,?,?,?)")
    .run(id, user?.id || "guest", user?.name || "访客", action, targetType, targetId, detail, now());
  return id;
}

function send(res, status, data, headers = {}) {
  const actor=requestUser(), routePath=requestContext.getStore()?.req?.url || "";
  if(actor && routePath.startsWith("/api/maintenance/") && !personnelAccess.hasAll(actor,"maintenance")) {
    const report = data?.report, reportFlightId = report?.flight?.id;
    const executionScope = new URL(routePath, "http://localhost").searchParams.get("scope") === "execute";
    const executionFlights = executionScope && Array.isArray(data?.flights) ? data.flights : null;
    const executionFlight = executionScope && data?.flight && !executionFlights ? data.flight : null;
    const involvedSubtaskDetail = status === 200 && /^\/api\/maintenance\/subtasks\/[^/]+\/hour-audit$/.test(routePath)
      && Array.isArray(data?.detail?.people) ? data.detail : null;
    data=redactMaintenanceResponse(data,actor);
    if (report && reportFlightId && maintenanceCanSubmitReport(actor, reportFlightId) && data?.report) {
      const allowed = new Set(maintenanceReportPeople(reportFlightId).map(p => p.id));
      data.report = redactMaintenanceResponse(report, actor, allowed);
    }
    const restoreExecution = flight => {
      if (!flight?.id || !maintenanceCanSubmitReport(actor, flight.id)) return null;
      const allowed = new Set(maintenanceTaskTreeAssignments(flight.id).map(row => row.person_id));
      return redactMaintenanceResponse(flight, actor, allowed);
    };
    if (executionFlights && data?.flights) data.flights = executionFlights.map(restoreExecution).filter(Boolean);
    if (executionFlight && data?.flight) data.flight = restoreExecution(executionFlight);
    if (involvedSubtaskDetail && data?.detail) {
      // The endpoint has already checked participation. Show the complete
      // assignment for that task without expanding the caller's data scope.
      const participants = new Set(involvedSubtaskDetail.people.map(person => person.personId));
      data.detail = redactMaintenanceResponse(involvedSubtaskDetail, actor, participants);
    }
  }
  const serializeStarted=performance.now();
  const body = JSON.stringify(data);
  if(routePath.startsWith('/api/attendance/')&&headers['Server-Timing'])headers['Server-Timing']+=`, attendance_serialize;dur=${(performance.now()-serializeStarted).toFixed(1)}`;
  res.writeHead(status, { ...corsHeaders(), ...securityHeaders(), "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store", ...headers });
  res.end(body);
}

function redactMaintenanceResponse(value,user,allowed = new Set()) {
 if(Array.isArray(value))return value.filter(item=>!item?.personId || item.personId===user.personId || allowed.has(item.personId) || personnelAccess.allows(user,"maintenance",item.personId)).map(item=>redactMaintenanceResponse(item,user,allowed));
 if(!value || typeof value!=="object")return value;
 if(value.personId && value.personId!==user.personId && !allowed.has(value.personId) && !personnelAccess.allows(user,"maintenance",value.personId))return null;
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,redactMaintenanceResponse(item,user,allowed)]));
}
function sendText(res, status, body, type = "text/plain; charset=utf-8", headers = {}) {
  res.writeHead(status, { ...corsHeaders(), ...securityHeaders(), "Content-Type": type, "Content-Length": Buffer.byteLength(body), ...headers });
  res.end(body);
}

function sendBinary(res, status, body, type, headers = {}) {
  res.writeHead(status, { ...corsHeaders(), ...securityHeaders(), "Content-Type": type, "Content-Length": body.length, ...headers });
  res.end(body);
}

function securityHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "SAMEORIGIN",
    ...extra
  };
}

function corsHeaders() {
  // Authenticated browser access is same-origin only. In particular, do not
  // advertise credentialed CORS for a different frontend origin.
  return {};
}

function sameOriginWrite(req) {
  const host = String(req.headers.host || "").trim();
  const localLoopback=isLocalDevelopment&&process.env.MUC_DEV_LAN==='true'&&[`127.0.0.1:${port}`,`localhost:${port}`].includes(host);
  const configured = localLoopback?`http://${host}`:String(process.env.APP_ORIGIN || "").trim();
  const expected = configured || (process.env.NODE_ENV !== "production" && host ? `http://${host}` : "");
  if (!expected) return false;
  let canonical;
  try { canonical = new URL(expected).origin; } catch { return false; }
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const origin = String(req.headers.origin || "").trim();
  if (origin) return origin !== "null" && origin === canonical;
  const referer = String(req.headers.referer || "").trim();
  if (referer) {
    try { return new URL(referer).origin === canonical; } catch { return false; }
  }
  // Modern browsers emit Fetch Metadata even when Origin is absent. Production
  // rejects legacy requests that provide no proof of their browser origin.
  return fetchSite === "same-origin" || (process.env.NODE_ENV !== "production" && !host);
}

async function bodyJson(req) {
  if(Object.hasOwn(req,"parsedJson"))return req.parsedJson;
  const text = (await bodyBuffer(req, MAX_JSON_BYTES)).toString("utf8");
  if (text && !/^application\/json(?:\s*;|\s*$)/i.test(String(req.headers["content-type"] || "")))
    throw Object.assign(new Error("JSON 接口只接受 application/json"), { status: 415 });
  req.parsedJson=text ? JSON.parse(text) : {};
  return req.parsedJson;
}

async function bodyForm(req) {
  if (!/^application\/x-www-form-urlencoded(?:\s*;|\s*$)/i.test(String(req.headers["content-type"] || "")))
    throw Object.assign(new Error("表单接口只接受 application/x-www-form-urlencoded"), { status: 415 });
  const buffer = await bodyBuffer(req, MAX_JSON_BYTES);
  return Object.fromEntries(new URLSearchParams(buffer.toString("utf8")));
}

async function bodyBuffer(req, limit = Infinity) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) {
      const error = new Error("请求内容过大");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseSeedRecords(html) {
  const marker = "const baseRecords = ";
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const arrayStart = html.indexOf("[", start);
  const end = html.indexOf(".map(record =>", arrayStart);
  return Function(`"use strict";return (${html.slice(arrayStart, end)});`)();
}

function recordId(record) {
  return record.id || ["base", record.date, record.publisher, record.title].map(value => encodeURIComponent(String(value || ""))).join("|");
}

function normalizeCategory(category) {
  const value = String(category || "").trim();
  if (!value) return "其他";
  if (value === "机坪运行") return "规定要求";
  return defaultCategories.includes(value) ? value : "其他";
}

function normalizeCategoryList(categories) {
  const source = Array.isArray(categories) && categories.length ? categories : defaultCategories;
  const cleaned = [];
  for (const item of source) {
    const value = String(item || "").trim();
    if (!value) continue;
    const next = value === "机坪运行" ? "规定要求" : value;
    if (!cleaned.includes(next)) cleaned.push(next);
  }
  if (!cleaned.includes("其他")) cleaned.push("其他");
  return cleaned.length ? cleaned : defaultCategories;
}

function syncRecordCategories(categories) {
  const valid = normalizeCategoryList(categories);
  db.prepare("update records set category='规定要求' where category='机坪运行'").run();
  db.prepare(`update records set category='其他' where category is null or trim(category)='' or category not in (${valid.map(() => "?").join(",")})`).run(...valid);
  return valid;
}

function deadlineFor(dateValue) {
  const date = parseRecordDate(dateValue) || new Date();
  const days = Number(settingValue("overdueDays", 3)) || 3;
  return new Date(date.getTime() + Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
}

function parseRecordDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).replace("T", " ").replace(/[年月/.]/g, "-").replace(/日/g, "").trim();
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), match[4] === undefined ? 12 : Number(match[4]), Number(match[5] || 0));
}

function recordSortValue(row) {
  return parseRecordDate(row?.date)?.getTime()
    || parseRecordDate(row?.updated_at || row?.updatedAt)?.getTime()
    || parseRecordDate(row?.created_at || row?.createdAt)?.getTime()
    || 0;
}

function compareRecordsDesc(a, b) {
  const byDate = recordSortValue(b) - recordSortValue(a);
  if (byDate) return byDate;
  const byUpdated = (parseRecordDate(b?.updated_at || b?.updatedAt)?.getTime() || 0) - (parseRecordDate(a?.updated_at || a?.updatedAt)?.getTime() || 0);
  if (byUpdated) return byUpdated;
  return String(b?.id || "").localeCompare(String(a?.id || ""));
}

async function initDb() {
  db.exec(`
    create table if not exists users(
      id text primary key, username text unique not null, name text not null, role text not null,
      salt text not null, password_hash text not null, permissions text not null, allowed_tabs text not null,
      created_at text not null, updated_at text not null
    );
    create table if not exists records(
      id text primary key, date text not null, publisher text not null, category text not null,
      title text not null, summary text, original text not null, source_set text,
      created_by text, updated_by text, created_at text not null, updated_at text not null
    );
    create table if not exists record_recipients(
      record_id text not null, user_id text not null, name text not null, department text, team text,
      primary key(record_id, user_id)
    );
    create table if not exists read_receipts(
      record_id text not null, user_id text not null, read_at text, is_overdue integer default 0,
      remind_count integer default 0, last_reminded_at text,
      primary key(record_id, user_id)
    );
    create table if not exists fixed_projects(
      id text primary key, ata text not null, title text not null, content_html text,
      references_text text, created_by text, updated_by text, created_at text not null, updated_at text not null
    );
    create table if not exists attachments(
      id text primary key, owner_type text not null, owner_id text not null, name text not null,
      type text, size integer, storage text, path text, created_by text, created_at text not null
    );
    create table if not exists favorites(
      user_id text not null, record_id text not null, created_at text not null,
      primary key(user_id, record_id)
    );
    create table if not exists settings(
      key text primary key, value text not null, updated_at text not null
    );
    create table if not exists audit_logs(
      id text primary key, user_id text, user_name text, action text, target_type text,
      target_id text, detail text, created_at text not null
    );
    create table if not exists audit(
      id text primary key, user_id text, user_name text, action text, target_type text,
      target_id text, detail text, created_at text not null
    );
    create table if not exists sessions(
      id text primary key, user_id text not null, created_at text not null, expires_at text not null
    );
    create table if not exists personnel(
      id text primary key,
      employee_no text unique not null check(length(employee_no)=8),
      name text not null,
      department text,
      home_team text,
      is_instructor integer default 0,
      position_code text,
      actual_grade text,
      employment_status text not null default '在职',
      source_batch_id text,
      data_status text not null default 'active',
      department_id text,
      personnel_group_id text,
      administrative_team_id text,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists organization_units(
      id text primary key,
      code text unique not null,
      name text not null,
      unit_type text not null,
      parent_id text,
      status text not null default 'active',
      maintenance_eligible integer not null default 0,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists personnel_licenses(
      id text primary key,
      person_id text not null,
      employee_no text not null,
      license_no text,
      license_type text,
      license_english_level text,
      issued_at text,
      renewed_at text,
      validity_years text,
      expires_at text,
      is_valid text,
      remark text,
      source_created_by text,
      source_created_at text,
      source_updated_by text,
      source_updated_at text,
      source_batch_id text,
      created_at text not null,
      updated_at text not null,
      unique(person_id,license_no,license_type)
    );
    create table if not exists capability_catalog(
      id text primary key,
      project_code text unique not null,
      project_name text not null,
      project_category text not null default '',
      category_source text not null default '',
      category_updated_by text not null default '',
      category_updated_at text not null default '',
      third_party_company text not null default '',
      authorization_type text,
      authorization_unit text,
      status text not null default 'active',
      created_at text not null,
      updated_at text not null
    );
    ${AUTHORIZATION_SCHEMA};
    create table if not exists course_catalog(
      id text primary key,
      course_code text not null,
      course_name text not null,
      course_version text not null default '',
      course_nature text,
      status text not null default 'active',
      created_at text not null,
      updated_at text not null,
      unique(course_code,course_version)
    );
    create table if not exists personnel_training_records(
      id text primary key,
      person_id text not null,
      employee_no text not null,
      course_code text not null,
      course_name text,
      course_version text not null default '',
      course_nature text,
      started_at text not null default '',
      completed_at text,
      training_result text,
      certificate_no text,
      issuer text,
      issuing_unit text,
      issued_at text,
      attendance_status text,
      qualification_status text,
      data_source text,
      class_no text not null default '',
      source_batch_id text,
      created_at text not null,
      updated_at text not null,
      unique(person_id,course_code,course_version,class_no,started_at)
    );
    create table if not exists personnel_import_batches(
      id text primary key,
      import_type text not null,
      file_name text,
      file_hash text,
      status text not null default 'pending',
      rows_json text not null,
      summary_json text not null,
      created_by text,
      created_by_name text,
      confirmed_by text,
      confirmed_at text,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists personnel_import_issues(
      id text primary key,
      batch_id text not null,
      row_number integer,
      issue_type text not null,
      severity text not null default 'error',
      employee_no text,
      detail text,
      status text not null default 'open',
      resolution text,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists personnel_change_logs(
      id text primary key,
      person_id text not null,
      field_name text not null,
      field_label text,
      old_value text,
      new_value text,
      source_type text not null default 'manual',
      source_batch_id text,
      reason text,
      operator_id text,
      operator_name text,
      created_at text not null
    );
    create table if not exists personnel_field_overrides(
      person_id text not null,
      field_name text not null,
      field_value text,
      reason text,
      updated_by text,
      updated_at text not null,
      primary key(person_id,field_name)
    );
    create table if not exists master_data_dictionary_values(
      id text primary key,
      category text not null,
      code text not null default '',
      value text not null,
      status text not null default 'active',
      source_batch_id text,
      created_at text not null,
      updated_at text not null,
      unique(category,code,value)
    );
    create table if not exists rbac_roles(
      id text primary key,
      code text unique not null,
      name text not null,
      description text,
      system_role integer not null default 0,
      status text not null default 'active',
      created_at text not null,
      updated_at text not null
    );
    create table if not exists rbac_permissions(
      id text primary key,
      code text unique not null,
      name text not null,
      module text not null,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists rbac_role_permissions(
      role_id text not null,
      permission_id text not null,
      primary key(role_id,permission_id)
    );
    create table if not exists rbac_user_roles(
      user_id text not null,
      role_id text not null,
      created_at text not null,
      primary key(user_id,role_id)
    );
    create table if not exists rbac_user_scopes(
      id text primary key,
      user_id text not null,
      scope_type text not null,
      scope_id text not null default '',
      valid_from text,
      valid_to text,
      created_at text not null,
      updated_at text not null,
      unique(user_id,scope_type,scope_id)
    );
    create table if not exists maintenance_flights(
      id text primary key,
      date text,
      flight_no text,
      departure_flight_no text,
      aircraft_no text,
      aircraft_type text,
      stand text,
      location_id text,
      location_name_snapshot text,
      planned_arrival text,
      planned_departure text,
      work_type text,
      card_no text,
      card_name text,
      work_kind text,
      standard_hours real default 0,
      priority text,
      status text not null default '未派工',
      remark text,
      source text,
      created_by text,
      updated_by text,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists maintenance_work_locations(
      id text primary key,
      name text not null unique,
      status text not null default 'active',
      created_at text not null,
      updated_at text not null
    );
    create table if not exists maintenance_subtasks(
      id text primary key,
      flight_id text not null,
      external_work_no text,
      card_no text,
      title text not null,
      content text,
      category text,
      standard_hours real default 0,
      priority text,
      status text not null default '未派工',
      remark text,
      created_by text,
      updated_by text,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists maintenance_assignments(
      id text primary key,
      owner_type text not null,
      owner_id text not null,
      flight_id text,
      person_id text not null,
      user_name text not null,
      team text,
      role text not null,
      is_lead integer default 0,
      status text not null default '已派工',
      feedback text,
      assigned_by text,
      assigned_at text,
      received_at text,
      started_at text,
      completed_at text,
      submitted_at text,
      modified_at text,
      confirmed_at text
    );
    create table if not exists maintenance_feedback(
      id text primary key,
      assignment_id text not null,
      owner_type text not null,
      owner_id text not null,
      person_id text not null,
      role text,
      content text,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists maintenance_hour_rules(
      id text primary key,
      rule_type text not null,
      name text not null,
      value real not null,
      created_at text not null,
      updated_at text not null,
      unique(rule_type, name)
    );
    create table if not exists maintenance_hour_results(
      id text primary key,
      owner_type text not null,
      owner_id text not null,
      flight_id text,
      assignment_id text not null,
      person_id text not null,
      user_name text not null,
      team text,
      role text,
      source text,
      hours real not null default 0,
      adjusted_hours real,
      status text not null default '待复核',
      confirmed_by text,
      confirmed_at text,
      created_at text not null,
      updated_at text not null,
      unique(owner_type, owner_id, assignment_id)
    );
    create table if not exists maintenance_sortie_results(
      id text primary key,
      owner_type text not null,
      owner_id text not null,
      flight_id text,
      assignment_id text not null,
      person_id text not null,
      user_name text not null,
      team text,
      role text not null default '放行',
      source text,
      sorties integer not null default 1,
      status text not null default '待复核',
      confirmed_by text,
      confirmed_at text,
      created_at text not null,
      updated_at text not null,
      unique(owner_type, owner_id, assignment_id)
    );
    create table if not exists maintenance_work_reports(
      flight_id text primary key,
      status text not null default '草稿',
      feedback text,
      reported_by text,
      reported_by_name text,
      reported_at text,
      finalized_by text,
      finalized_by_name text,
      finalized_at text,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists maintenance_work_report_entries(
      flight_id text not null,
      role text not null,
      person_id text not null,
      user_name text not null,
      team text,
      created_at text not null,
      updated_at text not null,
      primary key(flight_id, role, person_id)
    );
    create table if not exists maintenance_report_batches(
      id text primary key,
      flight_id text not null,
      report_type text not null,
      status text not null default '未提报',
      feedback text,
      version integer not null default 0,
      submitted_by text,
      submitted_by_name text,
      submitted_at text,
      created_at text not null,
      updated_at text not null,
      unique(flight_id, report_type)
    );
    create table if not exists maintenance_report_entries(
      id text primary key,
      batch_id text not null,
      flight_id text not null,
      owner_type text not null,
      owner_id text not null,
      role text not null,
      person_id text not null,
      user_name text not null,
      team text,
      standard_hours real default 0,
      source text,
      created_at text not null,
      updated_at text not null,
      unique(batch_id, owner_type, owner_id, role, person_id)
    );
    create table if not exists maintenance_report_drafts(
      id text primary key,
      flight_id text not null,
      report_type text not null,
      payload_json text not null default '{}',
      version integer not null default 1,
      updated_by text,
      updated_by_name text,
      created_at text not null,
      updated_at text not null,
      unique(flight_id, report_type)
    );
    create table if not exists maintenance_sync_state(
      id integer primary key,
      version integer not null default 0,
      updated_at text not null
    );
    create table if not exists maintenance_logs(
      id text primary key,
      owner_type text,
      owner_id text,
      flight_id text,
      user_id text,
      user_name text,
      action text not null,
      detail text,
      created_at text not null
    );
  `);
  db.exec(MAINTENANCE_STANDARDS_SCHEMA);
  db.exec(STANDARD_MANAGEMENT_SCHEMA);
  db.exec(STANDARD_IMPORT_SCHEMA);
  db.exec(MAINTENANCE_MODULE_INSTANCES_SCHEMA);
  db.exec(MAINTENANCE_WORKFLOW_TASKS_SCHEMA);
  db.exec(MAINTENANCE_RULE_HISTORY_SCHEMA);
  db.exec(MAINTENANCE_REPORT_SOURCE_JOURNAL_SCHEMA);
  db.exec(MAINTENANCE_REVIEW_ADDITION_SOURCES_SCHEMA);
  db.exec(STANDARD_REVIEW_SCHEMA);
  db.exec(STANDARD_NOTIFICATIONS_SCHEMA);
  db.exec(STANDARD_PUBLICATION_SCHEMA);
  db.exec(STANDARD_EFFECTIVE_REFRESH_SCHEMA);
  db.exec(MAINTENANCE_OVERNIGHT_FEEDBACK_SCHEMA);
  db.exec(NONROUTINE_IMPORT_SCHEMA);
  db.exec(NONROUTINE_REVIEW_SCHEMA);
  db.exec(NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA);
  db.exec(NONROUTINE_ASSESSMENT_SCHEMA);
  db.exec(MANUAL_NONROUTINE_SOURCES_SCHEMA);
  db.exec(NONROUTINE_FINALIZATION_SCHEMA);
  db.exec(WORK_STANDARD_INTAKE_SCHEMA);
  db.exec(MAINTENANCE_HOUR_PERIODS_SCHEMA);
  db.exec(NONROUTINE_CROSS_PERIOD_SCHEMA);
  db.exec(NONROUTINE_POSTING_RECEIPTS_SCHEMA);
  db.exec(NONROUTINE_NOTIFICATIONS_SCHEMA);
  db.exec(`-- Keep shared-draft revisions monotonic across deletion, submission and recreation.
create table if not exists maintenance_report_draft_versions(
  flight_id text not null,
  report_type text not null,
  version integer not null check(version > 0),
  primary key(flight_id,report_type)
);
insert into maintenance_report_draft_versions(flight_id,report_type,version)
  select flight_id,report_type,version from maintenance_report_drafts where report_type='nonroutine'
  on conflict(flight_id,report_type) do update set version=
    case when excluded.version>maintenance_report_draft_versions.version then excluded.version else maintenance_report_draft_versions.version end;
`);
  ensureColumn("users", "department", "text");
  ensureColumn("users", "team", "text");
  ensureColumn("users", "status", "text default 'active'");
  ensureColumn("users", "function_category", "text default '维修'");
  ensureColumn("users", "person_id", "text");
  ensureColumn("users", "credential_version", "integer default 1");
  ensureColumn("users", "must_change_password", "integer default 0");
  ensureColumn("users", "last_login_at", "text");
  ensureColumn("sessions", "credential_version", "integer default 1");
  ensureColumn("personnel", "department_id", "text");
  if(!new Set(db.prepare("pragma table_info(personnel)").all().map(row=>row.name)).has("personnel_group_id")&&!new Set(db.prepare("pragma table_info(personnel)").all().map(row=>row.name)).has("organization_branch_id"))ensureColumn("personnel", "personnel_group_id", "text");
  ensureColumn("personnel", "administrative_team_id", "text");
  ensureColumn("organization_units", "maintenance_eligible", "integer not null default 0");
  ensureColumn("personnel_licenses", "data_status", "text default 'active'");
  ensureColumn("personnel_authorizations", "data_status", "text default 'active'");
  ensureColumn("personnel_training_records", "data_status", "text default 'active'");
  db.exec(`
    create index if not exists personnel_department_idx on personnel(department_id);
    create index if not exists personnel_administrative_team_idx on personnel(administrative_team_id);
    create index if not exists personnel_employment_idx on personnel(employment_status);
    create index if not exists personnel_license_person_idx on personnel_licenses(person_id);
    create index if not exists personnel_authorization_person_idx on personnel_authorizations(person_id);
    create index if not exists personnel_training_person_idx on personnel_training_records(person_id);
    create index if not exists personnel_changes_person_idx on personnel_change_logs(person_id,created_at);
  `);
  db.prepare("update users set function_category='维修' where function_category is null or trim(function_category)=''").run();
  ensureColumn("records", "deadline", "text");
  ensureColumn("records", "priority", "text default '普通'");
  ensureColumn("records", "publish_status", "text default '已发布'");
  ensureColumn("records", "publisher_id", "text");
  ensureColumn("records", "imported_read", "integer default 0");
  ensureColumn("maintenance_flights", "report_finalized_by", "text");
  ensureColumn("maintenance_flights", "departure_flight_no", "text");
  ensureColumn("maintenance_flights", "location_id", "text");
  ensureColumn("maintenance_flights", "location_name_snapshot", "text");
  for (const [id, name] of [["maintenance-location-qingdao", "青岛"], ["maintenance-location-yanji", "延吉"], ["maintenance-location-shenyang", "沈阳"]]) {
    db.prepare("insert or ignore into maintenance_work_locations(id,name,status,created_at,updated_at) values(?,?,'active',?,?)").run(id, name, now(), now());
  }
  db.prepare("update maintenance_flights set location_id='maintenance-location-qingdao',location_name_snapshot='青岛' where location_id is null or trim(location_id)=''").run();
  ensureColumn("maintenance_flights", "routine_hours_snapshot", "text");
  ensureColumn("maintenance_flights", "report_finalized_by_name", "text");
  ensureColumn("maintenance_flights", "report_finalized_at", "text");
  ensureColumn("maintenance_flights", "report_finalized_mode", "text");
  ensureColumn("maintenance_flights", "archived_at", "text");
  ensureColumn("maintenance_flights", "routine_electronic_signed", "integer");
  ensureColumn("maintenance_flights", "nonroutine_electronic_signed", "integer");
  ensureColumn("maintenance_subtasks", "external_work_no", "text");
  db.exec("create unique index if not exists idx_maintenance_subtasks_flight_external_work_no on maintenance_subtasks(flight_id,external_work_no) where external_work_no is not null and trim(external_work_no)<>''");
  db.prepare("insert into maintenance_sync_state(id,version,updated_at) values(1,0,?) on conflict(id) do nothing").run(now());
  db.prepare("delete from sessions where expires_at<=?").run(now());
  db.prepare("delete from favorites where record_id not in (select id from records)").run();
  for (const column of ["deleted_at", "deleted_by", "delete_reason"]) ensureColumn("personnel", column, "text not null default ''");
  if (!db.prepare('pragma table_info(maintenance_hour_results)').all().some(column=>column.name==='person_id')) db.exec('drop view if exists maintenance_effective_hour_results');
  migratePersonnelFoundation(db, now, randomId);
  db.exec('begin');
  try { db.exec(NONROUTINE_ADJUSTMENTS_SCHEMA);db.exec(NONROUTINE_ROLE_RESULTS_SCHEMA);db.exec(NONROUTINE_CORRECTIONS_SCHEMA);db.exec('commit'); }
  catch(error){db.exec('rollback');throw error;}
  ensureSuperAccount();
  migrateAuthorizationNine(db,{now,randomId,audit,allowReset:process.env.NODE_ENV==='test'||process.env.MUC_AUTHORIZATION_RESET==='1',backupPath:process.env.MUC_AUTHORIZATION_BACKUP||''});
  authorizationProjects.migrate();
  seedRbac();
  ensureSuperAccountRbac();
  const legacyAdmin = db.prepare("select id from users where username=?").get("admin");
  if (legacyAdmin) {
    db.prepare("delete from sessions where user_id=?").run(legacyAdmin.id);
    db.prepare("delete from favorites where user_id=?").run(legacyAdmin.id);
    db.prepare("delete from users where username=?").run("admin");
  }
  if (!db.prepare("select key from settings where key='categories'").get()) setSetting("categories", defaultCategories);
  if (!db.prepare("select key from settings where key='overdueDays'").get()) setSetting("overdueDays", 3);
  if (!db.prepare("select key from settings where key='reminderDays'").get()) setSetting("reminderDays", 1);
  backupMaintenanceThreeLineMigration();
  dropLegacyMaintenanceTables();
  seedMaintenanceRules();
  migrateMaintenanceTerminology();
  normalizeMaintenanceStatuses();
  normalizeMaintenanceNonroutineCategories();
  normalizeMaintenanceOpportunities();
  normalizeMaintenanceRoleRules();
  normalizeMaintenanceRoutineRatioRules();
  migrateMaintenanceSubtaskRoles();
  normalizeMaintenanceTowAndPrimaryRole();
  normalizeMaintenanceNonroutineCombinationRules();
  freezeLegacyMaintenanceHours();
  migrateMaintenanceReleaseResults();
  migrateMaintenanceThreeLineReports();
  reconcileActiveMaintenanceStatuses();
  migrateCategories();
  backfillRecordRecipients();
  cleanupOrphanUserData();
}

function backupMaintenanceThreeLineMigration() {
  const migrationKey = "maintenance_three_line_reports_v1";
  if (settingValue(migrationKey, null) || !fss.existsSync(dbPath)) return;
  const backupDir = path.join(dataDir, "backups");
  const backupPath = path.join(backupDir, "muc_before_three_line_reports.sqlite");
  if (fss.existsSync(backupPath)) return;
  fss.mkdirSync(backupDir, { recursive: true });
  try { db.exec("pragma wal_checkpoint(full)"); } catch {}
  fss.copyFileSync(dbPath, backupPath, fss.constants.COPYFILE_EXCL);
}

function normalizeMaintenanceStatuses() {
  db.prepare(`update maintenance_flights set status='未派工' where status is null or status='' or status in ('草稿','已撤回')`).run();
  db.prepare(`update maintenance_flights set status='已派工' where status in ('已接收','执行中')`).run();
  db.prepare(`update maintenance_flights set status='待复核' where status in ('已反馈','已完成')`).run();
  db.prepare(`update maintenance_flights set status='已确认' where status in ('已上报')`).run();
  db.prepare(`update maintenance_flights set status='已提报' where status='已放行'`).run();
  db.prepare(`update maintenance_flights set status='未派工' where status not in ('未派工','已派工','已提报','待复核','已确认')`).run();

  db.prepare(`update maintenance_subtasks set status='未派工' where status is null or status='' or status in ('草稿','已撤回')`).run();
  db.prepare(`update maintenance_subtasks set status='已派工' where status in ('已接收','执行中')`).run();
  db.prepare(`update maintenance_subtasks set status='待复核' where status in ('已反馈','已完成')`).run();
  db.prepare(`update maintenance_subtasks set status='已确认' where status in ('已上报')`).run();
  db.prepare(`update maintenance_subtasks set status='已提报' where status='已放行'`).run();
  db.prepare(`update maintenance_subtasks set status='未派工' where status not in ('未派工','已派工','已提报','待复核','已确认')`).run();

  db.prepare(`update maintenance_assignments set status='已派工' where status is null or status='' or status in ('草稿','未派工','已接收','执行中','已撤回')`).run();
  db.prepare(`update maintenance_assignments set status='待复核' where status in ('已完成','已反馈')`).run();
  db.prepare(`update maintenance_assignments set status='已确认' where status in ('已上报')`).run();
  db.prepare(`update maintenance_assignments set status='已派工' where status not in ('已派工','已提报','待复核','已确认')`).run();
  db.prepare("update maintenance_assignments set is_lead=0 where is_lead<>0").run();

  db.prepare(`update maintenance_hour_results set status='待复核' where status is null or status='' or status not in ('已提报','待复核','已确认')`).run();
  db.prepare(`update maintenance_sortie_results set status='待复核' where status is null or status='' or status not in ('已提报','待复核','已确认')`).run();
  db.prepare("update maintenance_sortie_results set role='放行',sorties=1").run();
}

function normalizeMaintenanceNonroutineCategories() {
  const allowed=Object.keys(NONROUTINE_CATEGORY_STRATEGIES);
  db.prepare(`update maintenance_subtasks
    set category='其他'
    where category is null or trim(category)='' or category not in (${allowed.map(()=>'?').join(',')})`).run(...allowed);
}

function migrateMaintenanceThreeLineReports() {
  const migrationKey = "maintenance_three_line_reports_v1";
  if (settingValue(migrationKey, null)) return;
  const stamp = now();
  const flights = db.prepare("select * from maintenance_flights order by created_at").all();
  const upsertBatch = db.prepare(`insert into maintenance_report_batches(id,flight_id,report_type,status,feedback,version,submitted_by,submitted_by_name,submitted_at,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?) on conflict(flight_id,report_type) do nothing`);
  const insertEntry = db.prepare(`insert into maintenance_report_entries(id,batch_id,flight_id,owner_type,owner_id,role,person_id,user_name,team,standard_hours,source,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(batch_id,owner_type,owner_id,role,person_id) do nothing`);
  maintenanceTransaction(() => {
    for (const flight of flights) {
      const assignments = db.prepare("select * from maintenance_assignments where flight_id=? order by assigned_at,user_name").all(flight.id);
      const release = assignments.find(row => row.owner_type === "flight" && row.role === "放行");
      const sortie = release ? db.prepare("select * from maintenance_sortie_results where assignment_id=?").get(release.id) : null;
      if (sortie) {
        const status = sortie.status === "已确认" ? "已确认" : "已提报";
        const batchId = randomId("mtnrb");
        upsertBatch.run(batchId, flight.id, "release", status, release.feedback || "", 1, release.person_id, release.user_name, release.submitted_at || sortie.updated_at || stamp, release.assigned_at || stamp, stamp);
        const saved = db.prepare("select id from maintenance_report_batches where flight_id=? and report_type='release'").get(flight.id);
        insertEntry.run(randomId("mtnre"), saved?.id || batchId, flight.id, "flight", flight.id, "放行", release.person_id, release.user_name, release.team || "", 0, "历史放行架次", stamp, stamp);
      }

      const legacy = db.prepare("select * from maintenance_work_reports where flight_id=?").get(flight.id);
      const legacyEntries = db.prepare("select * from maintenance_work_report_entries where flight_id=? order by role,user_name").all(flight.id);
      if (legacy && (legacy.status === "已提交" || legacyEntries.length)) {
        const submitted = legacy.status === "已提交";
        const batchId = randomId("mtnrb");
        upsertBatch.run(batchId, flight.id, "routine", submitted ? (flight.status === "已确认" ? "已确认" : "已提报") : "预填", legacy.feedback || "", submitted ? 1 : 0, legacy.reported_by || "", legacy.reported_by_name || "", legacy.reported_at || "", legacy.created_at || stamp, stamp);
        const saved = db.prepare("select id from maintenance_report_batches where flight_id=? and report_type='routine'").get(flight.id);
        for (const item of legacyEntries) {
          insertEntry.run(randomId("mtnre"), saved?.id || batchId, flight.id, "flight", flight.id, item.role, item.person_id, item.user_name, item.team || "", maintenanceBaseHours("flight", flight), "历史例行报工", item.created_at || stamp, stamp);
        }
        if (legacy.status === "已提交" && legacy.finalized_at) {
          db.prepare("update maintenance_flights set report_finalized_by=?,report_finalized_by_name=?,report_finalized_at=? where id=?")
            .run(legacy.finalized_by || legacy.reported_by || "", legacy.finalized_by_name || legacy.reported_by_name || "", legacy.finalized_at, flight.id);
        }
      }

      const subtasks = db.prepare("select * from maintenance_subtasks where flight_id=? order by created_at").all(flight.id);
      if (subtasks.length) {
        const subAssignments = assignments.filter(row => row.owner_type === "subtask");
        const submittedRows = subAssignments.filter(row => ["已提报", "待复核", "已确认"].includes(row.status));
        if (subAssignments.length) {
          const complete = subAssignments.length === submittedRows.length;
          const batchId = randomId("mtnrb");
          upsertBatch.run(batchId, flight.id, "nonroutine", complete ? (flight.status === "已确认" ? "已确认" : "已提报") : "预填", "", complete ? 1 : 0, submittedRows[0]?.person_id || "", submittedRows[0]?.user_name || "", submittedRows[0]?.submitted_at || "", subtasks[0]?.created_at || stamp, stamp);
          const saved = db.prepare("select id from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(flight.id);
          for (const item of subAssignments) {
            const subtask = subtasks.find(row => row.id === item.owner_id);
            insertEntry.run(randomId("mtnre"), saved?.id || batchId, flight.id, "subtask", item.owner_id, item.role, item.person_id, item.user_name, item.team || "", Number(subtask?.standard_hours || 0), "历史非例行报工", item.assigned_at || stamp, stamp);
          }
        }
      }
      if (flight.status === "已确认") db.prepare("update maintenance_flights set archived_at=coalesce(archived_at,updated_at,?) where id=?").run(stamp, flight.id);
    }
    maintenanceLog(null, "migrate_three_line_reports", "system", migrationKey, "", JSON.stringify({ flights: flights.length }));
    setSetting(migrationKey, { completedAt: stamp, flights: flights.length });
  });
}

function migrateMaintenanceTerminology() {
  db.prepare("update maintenance_hour_results set source='非例行' where source='附加工作'").run();
  const legacyRule = db.prepare("select id from maintenance_hour_rules where rule_type='workType' and name='附加工作'").get();
  if (!legacyRule) return;
  const currentRule = db.prepare("select id from maintenance_hour_rules where rule_type='workType' and name='非例行'").get();
  if (currentRule) db.prepare("delete from maintenance_hour_rules where id=?").run(legacyRule.id);
  else db.prepare("update maintenance_hour_rules set name='非例行',updated_at=? where id=?").run(now(), legacyRule.id);
}

function normalizeMaintenanceOpportunities() {
  const allowed = ["航前", "航后", "航后/航前", "短停", "热备机", "停场", "附加", "其他", "三方短停", "三方航后", "三方航前"];
  const placeholders = allowed.map(() => "?").join(",");
  db.prepare(`update maintenance_flights
    set work_kind=case
      when trim(coalesce(work_kind,'')) in (${placeholders}) then trim(work_kind)
      when trim(coalesce(work_type,'')) in (${placeholders}) then trim(work_type)
      else '其他'
    end`).run(...allowed, ...allowed);
  db.prepare(`update maintenance_flights set work_kind='其他' where work_kind='' or work_kind not in (${placeholders})`).run(...allowed);
  db.prepare("update maintenance_flights set work_type=work_kind").run();

  const defaults = new Map([
    ["航前", 1.5], ["航后", 2], ["航后/航前", 2], ["短停", 1], ["热备机", 1], ["停场", 2],
    ["附加", 1], ["其他", 1], ["三方短停", 1], ["三方航后", 2], ["三方航前", 1.5]
  ]);
  db.prepare(`delete from maintenance_hour_rules where rule_type='workType' and name not in (${placeholders})`).run(...allowed);
  const insert = db.prepare("insert into maintenance_hour_rules(id,rule_type,name,value,created_at,updated_at) values(?,?,?,?,?,?)");
  for (const [name, value] of defaults) {
    if (!db.prepare("select id from maintenance_hour_rules where rule_type='workType' and name=?").get(name)) {
      insert.run(randomId("mtnr"), "workType", name, value, now(), now());
    }
  }
}

function normalizeMaintenanceRoleRules() {
  const aliases = new Map([
    ["航后机内", "例行机内"],
    ["航后起落架", "例行L/G"],
    ["航后发动机", "例行发动机"],
    ["航后外部", "例行机外"],
    ["航后电子", "例行电子"]
  ]);
  const defaults = new Map([
    ["接机", 0.5], ["送机", 0.5], ["勤务", 0.5], ["例行检查", 1],
    ["例行机内", 0.7], ["例行L/G", 0.7], ["例行发动机", 0.7], ["例行机外", 0.7], ["例行电子", 0.7]
  ]);
  const upsert = db.prepare("insert into maintenance_hour_rules(id,rule_type,name,value,created_at,updated_at) values(?,?,?,?,?,?) on conflict(rule_type,name) do nothing");
  for (const [name, fallback] of defaults) {
    const legacyName = [...aliases].find(([, current]) => current === name)?.[0];
    const legacy = legacyName ? db.prepare("select value from maintenance_hour_rules where rule_type='roleRatio' and name=?").get(legacyName) : null;
    upsert.run(randomId("mtnr"), "roleRatio", name, Number(legacy?.value ?? fallback), now(), now());
  }
  for (const [legacy, current] of aliases) {
    db.prepare("update maintenance_assignments set role=? where role=?").run(current, legacy);
    db.prepare("update maintenance_hour_results set role=? where role=?").run(current, legacy);
  }
  db.prepare("delete from maintenance_hour_rules where rule_type='roleRatio' and name='放行'").run();
}

const maintenanceOpportunityOrder = ["航前", "航后", "航后/航前", "短停", "热备机", "停场", "附加", "其他", "三方短停", "三方航后", "三方航前"];
const maintenanceRoutineRoleOrder = ["接机", "送机", "勤务", "例行检查", "例行机内", "例行L/G", "例行发动机", "例行机外", "例行电子"];

function maintenanceRoutineRuleName(opportunity, role) {
  return `${opportunity}::${role}`;
}

function maintenanceRulesResponse() {
  return db.prepare("select * from maintenance_hour_rules where rule_type<>'workType' order by rule_type,name").all().map(row => {
    if (row.rule_type === "nonroutineCombinationRatio") {
      const [combination, role] = row.name.split("::");
      return { ...row, combination, role };
    }
    if (row.rule_type !== "routineRatio") return row;
    const separator = String(row.name || "").indexOf("::");
    return {
      ...row,
      opportunity: separator >= 0 ? row.name.slice(0, separator) : "",
      role: separator >= 0 ? row.name.slice(separator + 2) : ""
    };
  });
}

function maintenanceRuleHistory(){return createMaintenanceRuleHistory({db,clock:now,randomId});}
function maintenanceCurrentRulesManager(user){
 const row=db.prepare("select u.* from users u join personnel p on p.id=u.person_id where u.id=? and u.person_id=? and coalesce(u.status,'active')='active' and p.data_status='active' and coalesce(p.employment_status,'') not in ('离职','停职')").get(user.id,user.personId),current=row?toUser(row):null;
 if(!current||!hasRbac(current,'maintenance.rules.manage'))throw maintenanceReviewError('当前人员或规则维护权限已失效',403);return current;
}
function maintenanceRulesEnvelope(){const rules=maintenanceRulesResponse();return {rules,ruleVersion:maintenanceRuleHistory().state(rules),aircraftHours:maintenanceAircraftConfig(),towTransition:maintenanceTowTransitionPolicy(),categoryStrategies:NONROUTINE_CATEGORY_STRATEGIES};}

function maintenanceTowDefaultHours() {
  const row = db.prepare("select value from maintenance_hour_rules where rule_type='nonroutineCategoryHours' and name='拖机'").get();
  const value = Number(row?.value);
  return Number.isFinite(value) && value > 0 ? value : 3;
}

function maintenanceTowTransitionPolicy(){
  const requested=process.env.MUC_TOW_STANDARD_ONLY_ENABLED==='1',manualReady=maintenanceManualSubmissionEnabled(),finalizationReady=process.env.MUC_NONROUTINE_FINALIZATION_ENABLED==='1';
  return maintenanceTowTransition({requested,manualReady,finalizationReady,publishedTowCount:requested||manualReady&&finalizationReady?createMaintenanceStandards({db}).list({aircraftCode:''}).items.filter(item=>item.category==='拖机').length:0,legacyDefaultHours:maintenanceTowDefaultHours()});
}
function assertMaintenanceLegacyTowCreation(category,options){
  if(process.env.MUC_TOW_STANDARD_ONLY_ENABLED==='1')assertLegacyTowCreation({mode:'STANDARD_ONLY'},category,options);
}

const maintenanceNonroutineRoleOrder = ["主做", "检验", "辅助"];
const maintenanceNonroutineCombinations = [
  ["主做", "检验", "辅助"], ["主做", "检验"], ["主做", "辅助"],
  ["检验", "辅助"], ["主做"], ["检验"], ["辅助"]
];

function maintenanceNonroutineCombinationName(roles) {
  return maintenanceNonroutineRoleOrder.filter(role => roles.includes(role)).join("+");
}

function maintenanceNormalizedRatioCents(weights) {
  const positive = weights.map(value => Math.max(0, Number(value) || 0));
  const sum = positive.reduce((total, value) => total + value, 0);
  if (!sum) return positive.map((_, index) => index === 0 ? 100 : 0);
  const raw = positive.map(value => value * 100 / sum);
  const cents = raw.map(Math.floor);
  const order = raw.map((value, index) => ({ index, fraction: value - cents[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let remaining = 100 - cents.reduce((total, value) => total + value, 0), index = 0; remaining > 0; remaining--, index++) cents[order[index].index]++;
  return cents;
}

function normalizeMaintenanceNonroutineCombinationRules() {
  const legacy = maintenanceNonroutineRoleOrder.map((role, index) => {
    const value = Number(db.prepare("select value from maintenance_hour_rules where rule_type='roleRatio' and name=?").get(role)?.value);
    return Number.isFinite(value) && value >= 0 ? value : [0.4, 0.3, 0.3][index];
  });
  const weights = legacy.some(value => value > 0) ? legacy : [0.4, 0.3, 0.3];
  const insert = db.prepare("insert into maintenance_hour_rules(id,rule_type,name,value,created_at,updated_at) values(?,?,?,?,?,?) on conflict(rule_type,name) do nothing");
  for (const roles of maintenanceNonroutineCombinations) {
    const name = maintenanceNonroutineCombinationName(roles);
    const values = roles.length === 1 ? [100] : name === "主做+检验" ? [60, 40]
      : maintenanceNormalizedRatioCents(roles.map(role => weights[maintenanceNonroutineRoleOrder.indexOf(role)]));
    roles.forEach((role, index) => insert.run(randomId("mtnr"), "nonroutineCombinationRatio", `${name}::${role}`, values[index] / 100, now(), now()));
  }
}

function validateMaintenanceNonroutineCombinationRules(rows) {
  const values = new Map();
  for (const row of rows) {
    const combination = String(row.combination || "").trim();
    const role = String(row.role || "").trim();
    const allowed = maintenanceNonroutineCombinations.find(roles => maintenanceNonroutineCombinationName(roles) === combination);
    if (!allowed?.includes(role)) throw maintenanceDispatchError("非例行工种组合无效");
    const value = Number(row.value);
    if (!Number.isFinite(value) || value < 0 || value > 1 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-8) {
      throw maintenanceDispatchError(`${combination}的${role}比例必须为0到1且最多保留两位小数`);
    }
    const key = `${combination}::${role}`;
    if (values.has(key)) throw maintenanceDispatchError(`${combination}的${role}比例重复`);
    values.set(key, value);
  }
  for (const roles of maintenanceNonroutineCombinations) {
    const combination = maintenanceNonroutineCombinationName(roles);
    if (roles.some(role => !values.has(`${combination}::${role}`))) throw maintenanceDispatchError(`${combination}的比例不完整`);
    const total = roles.reduce((sum, role) => sum + values.get(`${combination}::${role}`), 0);
    if (Math.abs(total - 1) > 1e-8) throw maintenanceDispatchError(`${combination}的比例合计必须为1`);
  }
}

function validateMaintenanceRoutineRules(rows) {
  const values = new Map();
  for (const row of rows) {
    const opportunity = String(row.opportunity || "").trim();
    const role = String(row.role || "").trim();
    const value = Number(row.value);
    if (!maintenanceOpportunityOrder.includes(opportunity) || opportunity === "停场") throw maintenanceDispatchError("例行比例中包含无效的维修机会类别");
    const allowed = maintenanceRolesForOpportunity(opportunity).filter(item => item !== "放行");
    if (!allowed.includes(role)) throw maintenanceDispatchError(`${opportunity}不支持例行工种“${role || "未设置"}”`);
    if (!Number.isFinite(value) || value < 0 || Math.abs(value * 1000 - Math.round(value * 1000)) > 1e-8) throw maintenanceDispatchError(`${opportunity}的${role}比例必须是不超过3位小数的非负数`);
    values.set(maintenanceRoutineRuleName(opportunity, role), value);
  }
  for (const opportunity of maintenanceOpportunityOrder.filter(item => item !== "停场")) {
    const roles = maintenanceRolesForOpportunity(opportunity).filter(item => item !== "放行");
    const missing = roles.filter(role => !values.has(maintenanceRoutineRuleName(opportunity, role)));
    if (missing.length) throw maintenanceDispatchError(`${opportunity}缺少例行工种比例：${missing.join("、")}`);
    const total = roles.reduce((sum, role) => sum + values.get(maintenanceRoutineRuleName(opportunity, role)), 0);
    if (Math.abs(total - 1) > 0.0005) throw maintenanceDispatchError(`${opportunity}例行工种比例合计必须为1，当前为${Number(total.toFixed(4))}`);
  }
}

function normalizedMaintenanceRoutineWeights(roles, source) {
  const values = roles.map(role => Math.max(0, Number(source.get(role) || 0)));
  const sourceTotal = values.reduce((sum, value) => sum + value, 0);
  const total = sourceTotal || roles.length;
  const result = new Map();
  let used = 0;
  roles.forEach((role, index) => {
    const value = index === roles.length - 1
      ? Number((1 - used).toFixed(3))
      : Number(((sourceTotal ? values[index] : 1) / total).toFixed(3));
    result.set(role, value);
    used += value;
  });
  return result;
}

function normalizeMaintenanceRoutineRatioRules() {
  const aliases = new Map([["航后发动机", "例行发动机"]]);
  for (const [legacy, current] of aliases) {
    db.prepare("update maintenance_assignments set role=? where role=?").run(current, legacy);
    db.prepare("update maintenance_feedback set role=? where role=?").run(current, legacy);
    db.prepare("update maintenance_hour_results set role=? where role=?").run(current, legacy);
    const workEntries = db.prepare("select * from maintenance_work_report_entries where role=?").all(legacy);
    for (const entry of workEntries) {
      const duplicate = db.prepare("select 1 from maintenance_work_report_entries where flight_id=? and role=? and person_id=?").get(entry.flight_id, current, entry.person_id);
      if (duplicate) db.prepare("delete from maintenance_work_report_entries where flight_id=? and role=? and person_id=?").run(entry.flight_id, legacy, entry.person_id);
      else db.prepare("update maintenance_work_report_entries set role=? where flight_id=? and role=? and person_id=?").run(current, entry.flight_id, legacy, entry.person_id);
    }
    const reportEntries = db.prepare("select * from maintenance_report_entries where role=?").all(legacy);
    for (const entry of reportEntries) {
      const duplicate = db.prepare("select 1 from maintenance_report_entries where batch_id=? and owner_type=? and owner_id=? and role=? and person_id=?")
        .get(entry.batch_id, entry.owner_type, entry.owner_id, current, entry.person_id);
      if (duplicate) db.prepare("delete from maintenance_report_entries where id=?").run(entry.id);
      else db.prepare("update maintenance_report_entries set role=? where id=?").run(current, entry.id);
    }
    const replaceDraftRole = value => {
      if (Array.isArray(value)) return value.map(replaceDraftRole);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceDraftRole(item)]));
      return value === legacy ? current : value;
    };
    const drafts = db.prepare("select id,payload_json from maintenance_report_drafts where payload_json like ?").all(`%${legacy}%`);
    for (const draft of drafts) {
      try {
        const payload = JSON.parse(draft.payload_json || "{}");
        db.prepare("update maintenance_report_drafts set payload_json=?,updated_at=? where id=?").run(JSON.stringify(replaceDraftRole(payload)), now(), draft.id);
      } catch {}
    }
  }
  const legacyWeights = new Map(maintenanceRoutineRoleOrder.map(role => {
    const row = db.prepare("select value from maintenance_hour_rules where rule_type='roleRatio' and name=?").get(role);
    return [role, Number(row?.value || 0.7)];
  }));
  const shortTurn = new Map([["接机", 0.35], ["送机", 0.35], ["例行检查", 0.3]]);
  const preflight = new Map([["送机", 0.2], ["勤务", 0.4], ["例行检查", 0.4]]);
  const postflight = new Map([["接机", 0.08], ["勤务", 0.24], ["例行机内", 0.34], ["例行L/G", 0.085], ["例行发动机", 0.085], ["例行机外", 0.085], ["例行电子", 0.085]]);
  const defaults = new Map([
    ["短停", shortTurn], ["航前", preflight], ["航后", postflight],
    ["三方短停", new Map(shortTurn)], ["三方航前", new Map(preflight)], ["三方航后", new Map(postflight)]
  ]);
  for (const opportunity of ["航后/航前", "热备机", "附加", "其他"]) {
    const roles = maintenanceRolesForOpportunity(opportunity).filter(role => role !== "放行");
    defaults.set(opportunity, normalizedMaintenanceRoutineWeights(roles, legacyWeights));
  }
  const insert = db.prepare("insert into maintenance_hour_rules(id,rule_type,name,value,created_at,updated_at) values(?,?,?,?,?,?) on conflict(rule_type,name) do nothing");
  for (const opportunity of maintenanceOpportunityOrder) {
    if (opportunity === "停场") continue;
    const values = defaults.get(opportunity);
    if (!values) continue;
    for (const [role, value] of values) insert.run(randomId("mtnr"), "routineRatio", maintenanceRoutineRuleName(opportunity, role), value, now(), now());
  }
  setSetting("maintenance_routine_ratio_by_opportunity_v1", { completedAt: now() });
}

function migrateMaintenanceReleaseResults() {
  const migrationKey = "maintenance_release_sorties_v1";
  if (settingValue(migrationKey, null)) return;
  const rows = db.prepare("select * from maintenance_hour_results where role='放行'").all();
  const insert = db.prepare(`insert into maintenance_sortie_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,sorties,status,confirmed_by,confirmed_at,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(owner_type,owner_id,assignment_id) do nothing`);
  db.exec("begin immediate");
  try {
    for (const row of rows) {
      insert.run(randomId("mtnsrt"), row.owner_type, row.owner_id, row.flight_id || "", row.assignment_id, row.person_id, row.user_name, row.team || "", "放行", "放行架次", 1, row.status, row.confirmed_by || "", row.confirmed_at || "", row.created_at || now(), row.updated_at || now());
    }
    db.prepare("delete from maintenance_hour_results where role='放行'").run();
    db.prepare("delete from maintenance_hour_rules where rule_type='roleRatio' and name='放行'").run();
    maintenanceLog(null, "migrate_release_sorties", "system", migrationKey, "", JSON.stringify({ converted: rows.length }));
    setSetting(migrationKey, { completedAt: now(), converted: rows.length });
    db.exec("commit");
  } catch (error) {
    try { db.exec("rollback"); } catch {}
    throw error;
  }
}

function migrateMaintenanceSubtaskRoles() {
  const migrationKey = "maintenance_subtask_roles_v1";
  if (settingValue(migrationKey, null)) return;
  const defaults = new Map([["主做", 0.4], ["检验", 0.3], ["辅助", 0.3]]);
  const upsert = db.prepare("insert into maintenance_hour_rules(id,rule_type,name,value,created_at,updated_at) values(?,?,?,?,?,?) on conflict(rule_type,name) do update set value=excluded.value,updated_at=excluded.updated_at");
  const counts = {
    assignments: db.prepare("select count(*) as count from maintenance_assignments where owner_type='subtask'").get().count,
    feedback: db.prepare("select count(*) as count from maintenance_feedback where owner_type='subtask'").get().count,
    hours: db.prepare("select count(*) as count from maintenance_hour_results where owner_type='subtask'").get().count,
    subtasks: db.prepare("select count(*) as count from maintenance_subtasks").get().count
  };
  db.exec("begin immediate");
  try {
    for (const [name, value] of defaults) upsert.run(randomId("mtnr"), "roleRatio", name, value, now(), now());
    db.prepare("delete from maintenance_feedback where owner_type='subtask'").run();
    db.prepare("delete from maintenance_hour_results where owner_type='subtask'").run();
    db.prepare("delete from maintenance_sortie_results where owner_type='subtask'").run();
    db.prepare("delete from maintenance_assignments where owner_type='subtask'").run();
    db.prepare("update maintenance_subtasks set status='未派工',updated_at=?").run(now());
    maintenanceLog(null, "migrate_subtask_roles", "system", migrationKey, "", JSON.stringify({ ...counts, roles: Object.fromEntries(defaults) }));
    setSetting(migrationKey, { completedAt: now(), ...counts });
    db.exec("commit");
  } catch (error) {
    try { db.exec("rollback"); } catch {}
    throw error;
  }
}

function normalizeMaintenanceTowAndPrimaryRole() {
  const legacy = "主作";
  const current = "主做";
  const stamp = now();
  const legacyRule = db.prepare("select value from maintenance_hour_rules where rule_type='roleRatio' and name=?").get(legacy);
  const currentRule = db.prepare("select id from maintenance_hour_rules where rule_type='roleRatio' and name=?").get(current);
  db.exec("begin immediate");
  try {
    if (!currentRule) {
      db.prepare("insert into maintenance_hour_rules(id,rule_type,name,value,created_at,updated_at) values(?,?,?,?,?,?)")
        .run(randomId("mtnr"), "roleRatio", current, Number(legacyRule?.value ?? 0.4), stamp, stamp);
    }
    db.prepare("delete from maintenance_hour_rules where rule_type='roleRatio' and name=?").run(legacy);
    for (const table of ["maintenance_assignments", "maintenance_feedback", "maintenance_hour_results"]) {
      db.prepare(`update ${table} set role=? where role=?`).run(current, legacy);
    }
    for (const row of db.prepare("select * from maintenance_report_entries where role=?").all(legacy)) {
      const duplicate = db.prepare("select 1 from maintenance_report_entries where batch_id=? and owner_type=? and owner_id=? and role=? and person_id=?")
        .get(row.batch_id, row.owner_type, row.owner_id, current, row.person_id);
      if (duplicate) db.prepare("delete from maintenance_report_entries where id=?").run(row.id);
      else db.prepare("update maintenance_report_entries set role=? where id=?").run(current, row.id);
    }
    for (const row of db.prepare("select * from maintenance_work_report_entries where role=?").all(legacy)) {
      const duplicate = db.prepare("select 1 from maintenance_work_report_entries where flight_id=? and role=? and person_id=?").get(row.flight_id, current, row.person_id);
      if (duplicate) db.prepare("delete from maintenance_work_report_entries where flight_id=? and role=? and person_id=?").run(row.flight_id, legacy, row.person_id);
      else db.prepare("update maintenance_work_report_entries set role=? where flight_id=? and role=? and person_id=?").run(current, row.flight_id, legacy, row.person_id);
    }
    const normalizeDraftValue = value => {
      if (Array.isArray(value)) return value.map(normalizeDraftValue);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeDraftValue(item)]));
      return value === legacy ? current : value;
    };
    for (const draft of db.prepare("select id,payload_json from maintenance_report_drafts where payload_json like ?").all(`%${legacy}%`)) {
      try {
        db.prepare("update maintenance_report_drafts set payload_json=?,updated_at=? where id=?")
          .run(JSON.stringify(normalizeDraftValue(JSON.parse(draft.payload_json || "{}"))), stamp, draft.id);
      } catch {}
    }
    db.prepare("insert into maintenance_hour_rules(id,rule_type,name,value,created_at,updated_at) values(?,?,?,?,?,?) on conflict(rule_type,name) do nothing")
      .run(randomId("mtnr"), "nonroutineCategoryHours", "拖机", 3, stamp, stamp);
    db.exec("commit");
  } catch (error) {
    try { db.exec("rollback"); } catch {}
    throw error;
  }
}

function seedRbac() {
  const stamp = now();
  const permissionIds = new Map();
  const insertPermission = db.prepare("insert into rbac_permissions(id,code,name,module,created_at,updated_at) values(?,?,?,?,?,?) on conflict(code) do update set name=excluded.name,module=excluded.module,updated_at=excluded.updated_at");
  for (const [code, name, module] of rbacPermissionDefinitions) {
    const existing = db.prepare("select id from rbac_permissions where code=?").get(code);
    const id = existing?.id || `perm-${code}`;
    insertPermission.run(id, code, name, module, stamp, stamp);
    permissionIds.set(code, id);
  }
  // 旧“敏感信息查看”只有实际岗级一个字段。升级时仅平移查看权，
  // 不自动授予维护或导出权，避免扩大既有角色权限。
  const legacySensitive = db.prepare("select id from rbac_permissions where code='personnel.sensitive.view'").get();
  const actualGradeViewId = permissionIds.get("personnel.actual_grade.view");
  if (legacySensitive && actualGradeViewId) {
    db.prepare("insert or ignore into rbac_role_permissions(role_id,permission_id) select role_id,? from rbac_role_permissions where permission_id=?")
      .run(actualGradeViewId, legacySensitive.id);
  }
  for (const code of retiredRbacPermissionCodes) {
    const retired = db.prepare("select id from rbac_permissions where code=?").get(code);
    if (!retired) continue;
    db.prepare("delete from rbac_role_permissions where permission_id=?").run(retired.id);
    db.prepare("delete from rbac_permissions where id=?").run(retired.id);
  }
  if (retiredRbacRoleCodes.length) {
    const marks = retiredRbacRoleCodes.map(() => "?").join(",");
    db.prepare(`update rbac_roles set status='inactive',updated_at=? where code in (${marks})`).run(stamp, ...retiredRbacRoleCodes);
  }
  const roleNames = RBAC_ROLE_NAMES;
  const roleIds = new Map();
  const insertRole = db.prepare("insert into rbac_roles(id,code,name,description,system_role,status,created_at,updated_at) values(?,?,?,?,?,?,?,?) on conflict(code) do update set name=excluded.name,description=excluded.description,system_role=1,status='active',updated_at=excluded.updated_at");
  const preserveControlledEdit = code => code !== "system_admin" && settingValue(`rbacRoleControlledEdit:${code}`, false) === true;
  for (const [code, permissions] of Object.entries(rbacRoleDefinitions)) {
    const existing = db.prepare("select id from rbac_roles where code=?").get(code);
    const id = existing?.id || `role-${code}`;
    if (existing && preserveControlledEdit(code)) {
      db.prepare("update rbac_roles set system_role=1,status='active',updated_at=? where id=?").run(stamp, id);
    } else {
      insertRole.run(id, code, roleNames[code] || code, RBAC_ROLE_DESCRIPTIONS[code] || "系统预置角色", 1, "active", stamp, stamp);
    }
    roleIds.set(code, id);
  }
  const assignPermission = db.prepare("insert or ignore into rbac_role_permissions(role_id,permission_id) values(?,?)");
  const baselineReconcile = [];
  for (const [code, permissions] of Object.entries(rbacRoleDefinitions)) {
    const roleId = roleIds.get(code);
    if (preserveControlledEdit(code)) {
      // 受控编辑角色保留手工授予的额外权限，但代码基线新增的权限必须补入。
      const currentCodes = db.prepare("select p.code from rbac_role_permissions rp join rbac_permissions p on p.id=rp.permission_id where rp.role_id=?").all(roleId).map(row => row.code);
      const missing = missingBaselineRolePermissions(code, currentCodes);
      missing.forEach(permission => assignPermission.run(roleId, permissionIds.get(permission)));
      if (missing.length) baselineReconcile.push({ role: code, added: missing });
      continue;
    }
    db.prepare("delete from rbac_role_permissions where role_id=?").run(roleId);
    permissions.forEach(permission => assignPermission.run(roleId, permissionIds.get(permission)));
  }
  if (baselineReconcile.length) console.warn(`[rbac] 受控编辑角色基线补差：${baselineReconcile.map(item => `${item.role}+${item.added.length}(${item.added.join(",")})`).join("；")}`);
  setSetting("pureRbacV2Migrated", true);
  setSetting("rbacPermissionCatalogV3Seeded", true);
  // 54002010使用单一正常账号，但系统管理员角色始终同步全部权限，避免新增权限后出现缺口。
  const systemRoleId = roleIds.get("system_admin");
  const assignSystemPermission = db.prepare("insert or ignore into rbac_role_permissions(role_id,permission_id) values(?,?)");
  RBAC_ROLE_DEFINITIONS.system_admin.forEach(permission => assignSystemPermission.run(systemRoleId, permissionIds.get(permission)));
}

function dropLegacyMaintenanceTables() {
  db.exec(`
    drop table if exists mocp_logs;
    drop table if exists mocp_work_hours;
    drop table if exists mocp_work_rules;
    drop table if exists mocp_assignments;
    drop table if exists mocp_tasks;
  `);
}

function cleanupOrphanUserData() {
  // 账户可清理，但信息传达中的接收人和阅读记录属于业务历史快照，不能随账户删除。
  db.prepare("delete from favorites where user_id not in (select id from users)").run();
  db.prepare(`delete from read_receipts
    where not exists (
      select 1 from record_recipients rr
      where rr.record_id=read_receipts.record_id and rr.user_id=read_receipts.user_id
    )`).run();
}

function seedMaintenanceRules() {
  const count = db.prepare("select count(*) as count from maintenance_hour_rules").get().count;
  if (count) return;
  const insert = db.prepare("insert into maintenance_hour_rules(id,rule_type,name,value,created_at,updated_at) values(?,?,?,?,?,?)");
  const workTypes = [
    ["航前", 1.5],
    ["航后", 2],
    ["短停", 1],
    ["例行检查", 1],
    ["排故", 2],
    ["非例行", 1]
  ];
  const roles = [
    ["主干", 1],
    ["辅助", 0.8],
    ["检验", 0.6],
    ["勤务", 0.5],
    ["接机", 0.5],
    ["送机", 0.5],
    ["例行检查", 1],
    ["例行机内", 0.7],
    ["例行L/G", 0.7],
    ["例行发动机", 0.7],
    ["例行机外", 0.7],
    ["例行电子", 0.7]
  ];
  for (const [name, value] of workTypes) insert.run(randomId("mtnr"), "workType", name, value, now(), now());
  for (const [name, value] of roles) insert.run(randomId("mtnr"), "roleRatio", name, value, now(), now());
}

function migrateIncorrectSuperAccountId() {
  const incorrectPerson = db.prepare("select * from personnel where employee_no=?").get(INCORRECT_SUPER_ACCOUNT_ID);
  const correctPerson = db.prepare("select * from personnel where employee_no=?").get(SUPER_ACCOUNT_ID);
  const incorrectUser = db.prepare("select * from users where id=? or username=?").get(INCORRECT_SUPER_ACCOUNT_ID, INCORRECT_SUPER_ACCOUNT_ID);
  const correctUser = db.prepare("select * from users where id=? or username=?").get(SUPER_ACCOUNT_ID, SUPER_ACCOUNT_ID);
  if (!incorrectPerson && !incorrectUser) return;
  if (incorrectPerson && correctPerson && incorrectPerson.id !== correctPerson.id) {
    throw new Error(`超级账号工号迁移冲突：${INCORRECT_SUPER_ACCOUNT_ID} 与 ${SUPER_ACCOUNT_ID} 同时存在`);
  }
  if (incorrectUser && correctUser && incorrectUser.id !== correctUser.id) {
    throw new Error(`超级账号迁移冲突：${INCORRECT_SUPER_ACCOUNT_ID} 与 ${SUPER_ACCOUNT_ID} 同时存在`);
  }
  db.exec("begin immediate");
  try {
    if (incorrectPerson && !correctPerson) {
      db.prepare("update personnel set employee_no=?,updated_at=? where id=?").run(SUPER_ACCOUNT_ID, now(), incorrectPerson.id);
      ["personnel_licenses", "personnel_authorizations", "personnel_training_records", "personnel_import_issues"].forEach(table => {
        db.prepare(`update ${table} set employee_no=? where employee_no=?`).run(SUPER_ACCOUNT_ID, INCORRECT_SUPER_ACCOUNT_ID);
      });
    }
    if (incorrectUser && !correctUser) {
      db.prepare("delete from sessions where user_id=?").run(INCORRECT_SUPER_ACCOUNT_ID);
      ["record_recipients", "read_receipts", "favorites", "rbac_user_roles", "rbac_user_scopes"].forEach(table => {
        db.prepare(`update ${table} set user_id=? where user_id=?`).run(SUPER_ACCOUNT_ID, INCORRECT_SUPER_ACCOUNT_ID);
      });
      ["audit_logs", "audit"].forEach(table => {
        db.prepare(`update ${table} set user_id=? where user_id=?`).run(SUPER_ACCOUNT_ID, INCORRECT_SUPER_ACCOUNT_ID);
      });
      db.prepare("update users set id=?,username=?,updated_at=? where id=?").run(SUPER_ACCOUNT_ID, SUPER_ACCOUNT_ID, now(), incorrectUser.id);
    }
    const resetState = settingValue("pureRbacAccountResetV1", false);
    if (resetState) setSetting("pureRbacAccountResetV1", { ...resetState, retainedAccount: SUPER_ACCOUNT_ID, correctedAt: now() });
    setSetting("superAccountEightDigitMigrationV1", { completedAt: now(), previousAccount: INCORRECT_SUPER_ACCOUNT_ID, account: SUPER_ACCOUNT_ID });
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

function ensureSuperAccount() {
  migrateIncorrectSuperAccountId();
  const superDepartment = db.prepare("select id,name from organization_units where code='DEPT-LINE'").get();
  const superGroup = db.prepare("select id,name from organization_units where code='GROUP-LINE-CADRE'").get();
  let person = db.prepare("select * from personnel where employee_no=?").get(SUPER_ACCOUNT_ID);
  if (!person) {
    const personId = randomId("person");
    db.prepare(`insert into personnel(id,employee_no,name,department,home_team,employment_status,source_batch_id,data_status,department_id,personnel_group_id,administrative_team_id,created_at,updated_at)
      values(?,?,?,?,?,'在职','system_super_account','active',?,?,null,?,?)`)
      .run(personId, SUPER_ACCOUNT_ID, SUPER_ACCOUNT_NAME, superDepartment?.name || "系统管理", superGroup?.name || "干部", superDepartment?.id || null, superGroup?.id || null, now(), now());
    person = db.prepare("select * from personnel where id=?").get(personId);
  } else if (person.data_status !== "active" || ["离职", "停职"].includes(person.employment_status) || !person.department_id || !person.personnel_group_id) {
    db.prepare(`update personnel set employment_status='在职',data_status='active',department_id=coalesce(department_id,?),personnel_group_id=coalesce(personnel_group_id,?),
      department=case when trim(coalesce(department,''))='' then ? else department end,home_team=case when trim(coalesce(home_team,''))='' then ? else home_team end,updated_at=? where id=?`)
      .run(superDepartment?.id || null, superGroup?.id || null, superDepartment?.name || "系统管理", superGroup?.name || "干部", now(), person.id);
    person = db.prepare("select * from personnel where id=?").get(person.id);
  }

  if (!settingValue("pureRbacAccountResetV1", false)) {
    if (db.prepare("select 1 from users where id<>?").get(SUPER_ACCOUNT_ID)) throw new Error("旧账户迁移状态缺失：禁止自动删除账户，请先完成只读预检");
    setSetting("pureRbacAccountResetV1", { completedAt: now(), retainedAccount: SUPER_ACCOUNT_ID });
  }

  const row = db.prepare("select * from users where id=? or username=?").get(SUPER_ACCOUNT_ID, SUPER_ACCOUNT_ID);
  if (!row) {
    const initialPassword = String(process.env.INITIAL_ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "muc2026"));
    if (!initialPassword) throw new Error("生产环境首次建立超级账号必须设置 INITIAL_ADMIN_PASSWORD");
    const pass = hashPassword(initialPassword);
    db.prepare(`insert into users(id,username,name,role,salt,password_hash,permissions,allowed_tabs,department,team,function_category,status,person_id,must_change_password,credential_version,created_at,updated_at)
      values(?,?,?,'rbac',?,?,'[]','[]',?,?,'维修','active',?,0,1,?,?)`)
      .run(SUPER_ACCOUNT_ID, SUPER_ACCOUNT_ID, SUPER_ACCOUNT_NAME, pass.salt, pass.hash, person.department || "系统管理", person.home_team || "管理员", person.id, now(), now());
  } else {
    db.prepare(`update users set id=?,username=?,role='rbac',permissions='[]',allowed_tabs='[]',status='active',person_id=?,updated_at=? where id=?`)
      .run(SUPER_ACCOUNT_ID, SUPER_ACCOUNT_ID, person.id, now(), row.id);
  }
  db.exec("create unique index if not exists users_person_id_unique on users(person_id) where person_id is not null and trim(person_id)<>''");
}

function ensureSuperAccountRbac() {
 const role=db.prepare("select id from rbac_roles where code='system_admin'").get();
 db.prepare("delete from rbac_user_roles where user_id=?").run(SUPER_ACCOUNT_ID);
 db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)").run(SUPER_ACCOUNT_ID,role.id,now());
 db.prepare("delete from rbac_user_scopes where user_id=?").run(SUPER_ACCOUNT_ID);
 for(const module of SCOPE_MODULES) db.prepare("insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at) values(?,?,?,'all','','','',?,?)").run(randomId("scope"),SUPER_ACCOUNT_ID,module,now(),now());
}

function backfillRecordRecipients() {
  db.prepare("update records set deadline=coalesce(deadline, ''), priority=coalesce(priority, '普通'), publish_status=coalesce(publish_status, '已发布')").run();
  db.prepare("select id,date from records where deadline is null or deadline=''").all().forEach(row => {
    db.prepare("update records set deadline=? where id=?").run(deadlineFor(row.date), row.id);
  });
}

function migrateCategories() {
  const existing = settingValue("categories", defaultCategories);
  const next = syncRecordCategories(normalizeCategoryList(existing));
  setSetting("categories", next);
}

function attachments(ownerType, ownerId) {
  return db.prepare("select id,name,type,size,storage,path,created_at as createdAt from attachments where owner_type=? and owner_id=? order by created_at").all(ownerType, ownerId)
    .map(row => publicAttachment(row, ownerType, ownerId));
}

function publicAttachment(row, ownerType = row.owner_type, ownerId = row.owner_id) {
  return {
    id: row.id,
    name: row.name,
    type: row.type || "application/octet-stream",
    size: Number(row.size || 0),
    storage: row.storage || "server",
    path: row.path || "",
    createdAt: row.createdAt || row.created_at || "",
    attachmentId: row.id,
    ownerType,
    ownerId,
    url: `/api/attachments/${encodeURIComponent(row.id)}`
  };
}

function recipients(recordId) {
  return db.prepare(`select rr.user_id as id,rr.user_id as accountId,rr.person_id as personId,
      rr.name as name,
      coalesce(rr.department, '未设置') as department,
      coalesce(rr.team, '未设置') as team
    from record_recipients rr
    left join users u on u.id=rr.user_id
    where rr.record_id=?
    order by rr.user_id`).all(recordId);
}

function receipts(recordId = "") {
  const rows = recordId
    ? db.prepare(`select r.record_id as recordId,r.user_id as userId,r.read_at as readAt,r.is_overdue as isOverdue,r.remind_count as remindCount,r.last_reminded_at as lastRemindedAt
      from read_receipts r
      join record_recipients rr on rr.record_id=r.record_id and rr.user_id=r.user_id
      left join users u on u.id=r.user_id
      where r.record_id=?`).all(recordId)
    : db.prepare(`select r.record_id as recordId,r.user_id as userId,r.read_at as readAt,r.is_overdue as isOverdue,r.remind_count as remindCount,r.last_reminded_at as lastRemindedAt
      from read_receipts r
      join record_recipients rr on rr.record_id=r.record_id and rr.user_id=r.user_id
      left join users u on u.id=r.user_id`).all();
  return rows.map(row => ({ ...row, isOverdue: !!row.isOverdue }));
}

function publicSettings() {
  return {
    categories: settingValue("categories", defaultCategories),
    overdueDays: settingValue("overdueDays", 3),
    reminderDays: settingValue("reminderDays", 1),
    personnelFunctionCategories,
    securityNotes: "正式部署后由后端认证、数据库权限校验、附件访问鉴权和操作日志保障。"
  };
}

async function removeOwnerAttachmentFiles(ownerType, ownerId) {
  const rows = db.prepare("select storage,path from attachments where owner_type=? and owner_id=?").all(ownerType, ownerId);
  for (const row of rows) {
    if (row.storage === "cos") await deleteCosObject(row.path);
    else if (row.path) await fs.rm(path.join(uploadDir, row.path), { force: true });
  }
}

function publicRecord(row, user) {
  const canSeeFullFeedback = hasAnyRbac(user, ["info.receipt.manage", "info.stats.read"]);
  const recordRecipients = recipients(row.id);
  const recordReceipts = receipts(row.id).filter(receipt=>receipt.userId===user.id || dataScopeAllowsUser(user,receipt.userId,"info"));
  return {
    id: row.id,
    date: row.date,
    serverVisible:canViewRecord(user,row),
    publisher: row.publisher,
    publisherId: row.publisher_id || "",
    category: row.category,
    title: row.title,
    summary: row.summary || "",
    original: row.original,
    sourceSet: row.source_set || "",
    attachments: attachments("record", row.id),
    recipients: recordRecipients.filter(person => person.id === user.id || canSeeFullFeedback && dataScopeAllowsUser(user,person.id,'info')),
    receipts: canSeeFullFeedback ? recordReceipts : recordReceipts.filter(receipt => receipt.userId === user.id),
    deadline: row.deadline || deadlineFor(row.date),
    priority: row.priority || "普通",
    publishStatus: row.publish_status || "已发布",
    importedRead: !!row.imported_read,
    favorite: !!db.prepare("select 1 from favorites where user_id=? and record_id=?").get(user.id, row.id),
    createdBy: row.created_by || "",
    updatedBy: row.updated_by || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicRecords(rows, user, {summary=false}={}) {
  if (!rows.length) return { records: [], receipts: [] };
  const ids = rows.map(row => row.id);
  const placeholders = ids.map(() => "?").join(",");
  const recipientRows = db.prepare(`select rr.record_id,rr.user_id as id,rr.person_id as personId,
      coalesce(u.name,rr.name) as name,coalesce(u.department,rr.department,'未设置') as department,
      coalesce(u.team,rr.team,'未设置') as team
    from record_recipients rr left join users u on u.id=rr.user_id
    where rr.record_id in (${placeholders}) ${summary?'and rr.user_id=?':''} order by rr.record_id,rr.user_id`).all(...ids,...(summary?[user.id]:[]));
  const receiptRows = db.prepare(`select r.record_id as recordId,r.user_id as userId,r.read_at as readAt,
      r.is_overdue as isOverdue,r.remind_count as remindCount,r.last_reminded_at as lastRemindedAt
    from read_receipts r join record_recipients rr on rr.record_id=r.record_id and rr.user_id=r.user_id
    where r.record_id in (${placeholders}) ${summary?'and r.user_id=?':''}`).all(...ids,...(summary?[user.id]:[])).map(item => ({ ...item, isOverdue: !!item.isOverdue }));
  const attachmentRows = db.prepare(`select * from attachments where owner_type='record' and owner_id in (${placeholders}) order by created_at`).all(...ids);
  const favoriteRows = db.prepare(`select record_id from favorites where user_id=? and record_id in (${placeholders})`).all(user.id, ...ids);
  const recipientsByRecord = groupedRows(recipientRows, "record_id");
  const receiptsByRecord = groupedRows(receiptRows, "recordId");
  const attachmentsByRecord = groupedRows(attachmentRows, "owner_id");
  const favorites = new Set(favoriteRows.map(item => item.record_id));
  const canSeeFullFeedback = hasAnyRbac(user, ["info.receipt.manage", "info.stats.read"]);
  const allowedIds=canSeeFullFeedback?[...(user.infoAllowedAccounts || [])]:[];
  if(!allowedIds.includes(user.id))allowedIds.push(user.id);
  const metrics=summary?new Map(db.prepare(`select rr.record_id,count(*) as total,
    sum(case when coalesce(r.read_at,'')<>'' then 1 else 0 end) as read
    from record_recipients rr left join read_receipts r on r.record_id=rr.record_id and r.user_id=rr.user_id
    where rr.record_id in (${placeholders}) and rr.user_id in (${allowedIds.map(()=>'?').join(',')}) group by rr.record_id`).all(...ids,...allowedIds).map(row=>[row.record_id,row])):new Map();
  const visibleReceipts = receiptRows.filter(item => item.userId === user.id || canSeeFullFeedback && dataScopeAllowsUser(user,item.userId,'info'));
  return {
    receipts: visibleReceipts,
    records: rows.map(row => {
      const recordRecipients = recipientsByRecord.get(row.id) || [];
      const recordReceipts = receiptsByRecord.get(row.id) || [];
      return {
        id: row.id,
        date: row.date,
        serverVisible:canViewRecord(user,row),
        ...(summary?{feedbackSummary:(()=>{const m=metrics.get(row.id)||{},total=Number(m.total||0),read=Number(m.read||0);return{total,read,unread:total-read,overdue:parseRecordDate(row.deadline)?.getTime()<Date.now()?total-read:0};})()}:{}),
        publisher: row.publisher,
        publisherId: row.publisher_id || "",
        category: row.category,
        title: row.title,
        summary: row.summary || "",
        original: row.original,
        sourceSet: row.source_set || "",
        attachments: (attachmentsByRecord.get(row.id) || []).map(item => publicAttachment(item, "record", row.id)),
        recipients: recordRecipients.filter(person => person.id === user.id || canSeeFullFeedback && dataScopeAllowsUser(user,person.id,'info')),
        receipts: recordReceipts.filter(receipt => visibleReceipts.includes(receipt)),
        deadline: row.deadline || deadlineFor(row.date),
        priority: row.priority || "普通",
        publishStatus: row.publish_status || "已发布",
        importedRead: !!row.imported_read,
        favorite: favorites.has(row.id),
        createdBy: row.created_by || "",
        updatedBy: row.updated_by || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    })
  };
}

function publicProject(row) {
  return {
    id: row.id,
    ata: row.ata,
    title: row.title,
    contentHtml: sanitizeRichHtml(row.content_html || ""),
    references: row.references_text || "",
    attachments: attachments("fixedProject", row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicProjects(rows) {
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const placeholders = ids.map(() => "?").join(",");
  const attachmentRows = db.prepare(`select * from attachments where owner_type='fixedProject' and owner_id in (${placeholders}) order by created_at`).all(...ids);
  const attachmentsByProject = groupedRows(attachmentRows, "owner_id");
  return rows.map(row => ({
    id: row.id,
    ata: row.ata,
    title: row.title,
    contentHtml: sanitizeRichHtml(row.content_html || ""),
    references: row.references_text || "",
    attachments: (attachmentsByProject.get(row.id) || []).map(item => publicAttachment(item, "fixedProject", row.id)),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function maintenanceHasAccess(user) {
  return hasRbac(user, "maintenance.view");
}

function maintenanceCanManage(user) {
  return hasAnyRbac(user, ["maintenance.dispatch.view", "maintenance.review.view", "maintenance.stats.manage.view"]);
}

function maintenanceUserDepartment(user) {
  if (!user?.personId) return { id: "", name: "" };
  const row = db.prepare("select department_id,department from personnel where id=? and data_status='active'").get(user.personId);
  return { id: String(row?.department_id || "").trim(), name: String(row?.department || "").trim() };
}

function maintenanceSharesCreatorDepartment(user, creatorId) {
  if (!user?.id || !creatorId) return false;
  if (user.id === creatorId || personnelAccess.hasAll(user, "maintenance")) return true;
  const viewerDepartment = maintenanceUserDepartment(user);
  if (!viewerDepartment.id && !viewerDepartment.name) return false;
  const creator = db.prepare(`select p.department_id,p.department from users u
    join personnel p on p.id=u.person_id
    where u.id=? and p.data_status='active'`).get(creatorId);
  if (!creator) return false;
  const creatorDepartmentId = String(creator.department_id || "").trim();
  if (viewerDepartment.id && creatorDepartmentId) return viewerDepartment.id === creatorDepartmentId;
  return !viewerDepartment.id && !creatorDepartmentId && viewerDepartment.name === String(creator.department || "").trim();
}

function maintenanceSharedUnassignedRouteAllowed(user, flight, method, url) {
  if (!flight || flight.status !== "未派工" || !hasRbac(user, "maintenance.dispatch.view")) return false;
  if (!maintenanceSharesCreatorDepartment(user, flight.created_by)) return false;
  const detailRoute = method === "GET"
    && /^\/api\/maintenance\/flights\/[^/]+$/.test(url.pathname)
    && (url.searchParams.get("scope") || "dispatch") === "dispatch";
  const dispatchRoute = method === "POST"
    && /^\/api\/maintenance\/(?:flights|subtasks)\/[^/]+\/dispatch$/.test(url.pathname);
  return detailRoute || dispatchRoute;
}

function maintenanceCanExecute(user, write = false) {
  return maintenanceHasAccess(user) && hasRbac(user, write ? "maintenance.execute.submit" : "maintenance.execute.view");
}

function maintenanceStatus(value, fallback = "未派工") {
  const status = String(value || fallback || "未派工").trim();
  return ["未派工", "已派工", "已提报", "待复核", "已确认"].includes(status) ? status : fallback;
}

function maintenanceRolesForOpportunity(value) {
  const opportunity = String(value || "其他").trim();
  const shortTurn = ["放行", "接机", "送机", "例行检查"];
  const preflight = ["放行", "送机", "勤务", "例行检查"];
  const postflight = ["放行", "接机", "勤务", "例行机内", "例行L/G", "例行发动机", "例行机外", "例行电子"];
  const combined = ["放行", "接机", "送机", "勤务", "例行检查", "例行机内", "例行L/G", "例行发动机", "例行机外", "例行电子"];
  if (["短停", "三方短停"].includes(opportunity)) return shortTurn;
  if (["航前", "三方航前"].includes(opportunity)) return preflight;
  if (["航后", "三方航后"].includes(opportunity)) return postflight;
  if (opportunity === "停场") return ["放行"];
  return combined;
}

const maintenanceSubtaskRoles = ["主做", "检验", "辅助"];

function normalizeMaintenanceSubtaskRole(value) {
  const role = String(value || "").trim();
  return role === "主作" ? "主做" : role;
}

function maintenanceRolesForOwner(ownerType, owner) {
  if (ownerType === "subtask") return owner?.category === "拖机" ? ["主做"] : maintenanceSubtaskRoles;
  return maintenanceRolesForOpportunity(owner?.work_kind || owner?.work_type || "其他");
}

function normalizeMaintenanceRole(opportunity, value) {
  const aliases = { "航后机内": "例行机内", "航后起落架": "例行L/G", "航后发动机": "例行发动机", "航后外部": "例行机外", "航后电子": "例行电子" };
  const allowed = maintenanceRolesForOpportunity(opportunity);
  const role = aliases[String(value || "").trim()] || String(value || "").trim();
  return allowed.includes(role) ? role : (allowed.find(item => item !== "放行") || allowed[0]);
}

function maintenanceDispatchError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function maintenanceDispatchConflict(message = "航班已被更新，请刷新后重试") {
  const error = new Error(message);
  error.status = 409;
  error.details = { code: "maintenance_dispatch_stale" };
  return error;
}

function normalizeMaintenanceAssignments(ownerType, owner, assignments) {
  const allowed = maintenanceRolesForOwner(ownerType, owner);
  const aliases = { "航后机内": "例行机内", "航后起落架": "例行L/G", "航后发动机": "例行发动机", "航后外部": "例行机外", "航后电子": "例行电子" };
  const people = new Map(allPeople("maintenance").map(person => [person.id, person]));
  const seen = new Set();
  const normalized = [];
  const releaseUsers = new Set();
  for (const item of assignments) {
    const personId = String(item.personId || "").trim();
    const person = people.get(personId);
    if (!person) throw maintenanceDispatchError("派工人员不存在、已停用或不在当前维修管控范围");
    const rawRole = String(item.role || "").trim();
    const role = ownerType === "subtask" ? normalizeMaintenanceSubtaskRole(rawRole) : (aliases[rawRole] || rawRole);
    if (!allowed.includes(role)) throw maintenanceDispatchError(`${ownerType === "subtask" ? "非例行" : "当前维修机会"}不支持“${role || "未设置"}”类别`);
    const key = `${personId}\u0000${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (role === "放行") releaseUsers.add(personId);
    normalized.push({ person, role });
  }
  if (!normalized.length) throw maintenanceDispatchError("请至少选择一项派工人员");
  if (releaseUsers.size > 1) throw maintenanceDispatchError("放行类别最多只能选择一人");
  return normalized;
}

const maintenanceOpportunityCategories = ["航前", "航后", "航后/航前", "短停", "热备机", "停场", "附加", "其他", "三方短停", "三方航后", "三方航前"];
const defaultMaintenanceLocationId = "maintenance-location-qingdao";

function maintenanceWorkLocations() {
  return db.prepare("select * from maintenance_work_locations order by name,id").all().map(row => ({ id: row.id, name: row.name, status: row.status }));
}

function maintenanceLocationName(row) {
  if (!row?.location_id) return "青岛";
  return db.prepare("select name from maintenance_work_locations where id=?").get(row.location_id)?.name || row.location_name_snapshot || "青岛";
}

function maintenanceLocationForInput(input, existing = null) {
  const provided = Object.keys(input).some(key => ["locationId", "location_id", "作业地点", "locationName"].includes(key));
  if (!provided && existing?.location_id) return { id: existing.location_id, name: maintenanceLocationName(existing) };
  const raw = [input.locationId, input.location_id, input["作业地点"], input.locationName].map(value => String(value ?? "").trim()).find(Boolean) || defaultMaintenanceLocationId;
  const row = db.prepare("select * from maintenance_work_locations where id=? or name=?").get(raw, raw);
  if (!row || row.status !== "active" && row.id !== existing?.location_id) throw maintenanceReviewError(`作业地点“${raw}”不存在或已停用，请选择有效地点`);
  return { id: row.id, name: row.name };
}

function maintenanceFlightValidationError(payload) {
  const date = normalizeMaintenanceStatsDate(payload.date);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T00:00:00Z") : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || !payload.aircraftNo) return "航班日期或机号无效";
  if (["航前", "三方航前"].includes(payload.workKind) && !payload.departureFlightNo) return "航前请填写出港航班号";
  if (["航后", "三方航后"].includes(payload.workKind) && !payload.flightNo) return "航后进港航班号无效，请填写进港航班号";
  if (["短停", "三方短停", "航后/航前"].includes(payload.workKind) && !payload.flightNo && !payload.departureFlightNo) return "进港或出港航班号至少填写一个";
  return "";
}

function maintenanceDisplayFlightNo(row) {
  return ["航前", "三方航前"].includes(row.work_kind || row.work_type)
    ? row.departure_flight_no || row.flight_no || ""
    : row.flight_no || row.departure_flight_no || "";
}

function maintenanceFlightPayload(input = {}, existing = null) {
  const rawOpportunity = String(input.maintenanceOpportunity || input.maintenance_opportunity || input.workKind || input.work_kind || input["维修机会"] || input.workType || input.work_type || input["工作类型"] || input["工作种类"] || "航后").trim();
  const maintenanceOpportunity = maintenanceOpportunityCategories.includes(rawOpportunity) ? rawOpportunity : "其他";
  return {
    date: String(input.date || input["日期"] || "").trim(),
    flightNo: String(input.flightNo || input.flight_no || input["航班号"] || input["进港航班号"] || "").trim(),
    departureFlightNo: ["departureFlightNo", "departure_flight_no", "出港航班号"].some(key => Object.hasOwn(input, key))
      ? String(input.departureFlightNo ?? input.departure_flight_no ?? input["出港航班号"] ?? "").trim() : undefined,
    aircraftNo: String(input.aircraftNo || input.aircraft_no || input["机号"] || "").trim(),
    aircraftType: String(input.aircraftType || input.aircraft_type || input["机型"] || "").trim().toUpperCase(),
    stand: String(input.stand || input["机位"] || "").trim(),
    location: maintenanceLocationForInput(input, existing),
    plannedArrival: String(input.plannedArrival || input.planned_arrival || input["计划落地时间"] || "").trim(),
    plannedDeparture: String(input.plannedDeparture || input.planned_departure || input["计划起飞时间"] || "").trim(),
    workType: maintenanceOpportunity,
    cardNo: "",
    cardName: "",
    workKind: maintenanceOpportunity,
    standardHours: 0,
    status: maintenanceStatus(input.status || input["状态"], "未派工"),
    remark: String(input.remark || input["备注"] || "").trim(),
    source: String(input.source || "手工录入").trim()
  };
}

function maintenanceAdditionalWorkTarget(identity, manager, rowNumber, { allowLocked = false } = {}) {
  const { date, flightNo, departureFlightNo, aircraftNo, workKind, location } = identity;
  const useDeparture = ["航前", "三方航前"].includes(workKind) || !flightNo && !!departureFlightNo;
  const primaryNo = useDeparture ? departureFlightNo : flightNo;
  const numberColumn = useDeparture ? "departure_flight_no" : "flight_no";
  const matches = db.prepare(`select * from maintenance_flights
    where date=? and lower(trim(aircraft_no))=? and work_kind=? and location_id=?
      and (?='' or lower(trim(${numberColumn}))=?)`)
    .all(date, aircraftNo.toLowerCase(), workKind, location.id, primaryNo, primaryNo.toLowerCase());
  if (!matches.length) throw maintenanceReviewError(`第 ${rowNumber} 行未找到对应维修机会`);
  if (matches.length > 1) throw maintenanceReviewError(`第 ${rowNumber} 行匹配到多个维修机会，请先核对航班计划`);
  const flight = matches[0];
  if (!personnelAccess.hasAll(manager,'maintenance') && flight.created_by!==manager.id && !dataScopeAllowsUser(manager,flight.created_by,'maintenance') && !maintenanceVisibleFlights(manager,'dispatch',{flightId:flight.id,limit:1}).rows.length) {
    throw maintenanceReviewError(`第 ${rowNumber} 行维修机会不在当前维修管控范围内`,403);
  }
  if (flightNo && flight.flight_no && flightNo.toLowerCase() !== String(flight.flight_no).trim().toLowerCase()) {
    throw maintenanceReviewError(`第 ${rowNumber} 行进港航班号与维修机会不一致`);
  }
  if (departureFlightNo && flight.departure_flight_no && departureFlightNo.toLowerCase() !== String(flight.departure_flight_no).trim().toLowerCase()) {
    throw maintenanceReviewError(`第 ${rowNumber} 行出港航班号与维修机会不一致`);
  }
  const locked = !["未派工", "已派工"].includes(flight.status || "未派工") || Boolean(flight.report_finalized_at || flight.archived_at);
  if (locked && !allowLocked) {
    throw maintenanceReviewError(`第 ${rowNumber} 行对应维修机会已进入报工或复核，不能导入附加工作`, 409);
  }
  if (identity.flightId && identity.flightId !== flight.id) throw maintenanceReviewError(`第 ${rowNumber} 行维修机会身份已变化`, 409);
  return allowLocked ? { ...flight, importLocked: locked } : flight;
}

function maintenanceImportBatches() {
  const standards = createMaintenanceStandards({ db });
  return createNonroutineImportBatches({
    db, transaction: maintenanceTransaction, preview: maintenanceNonroutineImportPreview,
    appendDraft: appendMaintenanceImportedDraft,
    matchStandard: (item, aircraftCode) => standards.match(item, aircraftCode), clock: now, randomId,
    log: (user, action, batchId, detail) => maintenanceLog(user, action, "import_batch", batchId, "", JSON.stringify(detail))
  });
}

function currentMaintenanceReviewActor(user) {
  if(!user?.id||!user.personId)return null;
  const row=db.prepare("select u.* from users u join personnel p on p.id=u.person_id where u.id=? and u.person_id=? and coalesce(u.status,'active')='active' and p.data_status='active' and coalesce(p.employment_status,'') not in ('离职','停职')").get(user.id,user.personId);
  return row?toUser(row):null;
}

function maintenanceReviewCanAssignPerson(user,personId) {
  const current=currentMaintenanceReviewActor(user);
  return Boolean(current&&actionScopeAllows(current,'maintenance.nonroutine.review.assign',personId));
}

function nonroutineReviewCan(user, permission, item) {
  user=currentMaintenanceReviewActor(user);
  if (!user?.id || user.status !== "active" || !hasRbac(user, "maintenance.view") || !hasRbac(user, permission)) return false;
  if (actionScopeHasAll(user, permission)) return true;
  const participants = json(item.participants_json, []);
  if (!participants.length) return false;
  const allows = participant => actionScopeAllows(user, permission, participant.personId);
  return permission === "maintenance.nonroutine.review.view" ? participants.some(allows) : participants.every(allows);
}

function nonroutineReviewQualifiedAccount(accountId, permission, item) {
  const row = db.prepare("select u.*,p.name as person_name,p.employee_no as person_employee_no from users u join personnel p on p.id=u.person_id where u.id=? and coalesce(u.status,'active')='active' and p.data_status='active' and coalesce(p.employment_status,'') not in ('离职','停职')").get(String(accountId || ""));
  if (!row) return null;
  const user = toUser(row);
  if (!user.personId || !nonroutineReviewCan(user, permission, item)) return null;
  return { accountId: user.id, personId: user.personId,personName:row.person_name,employeeNo:row.person_employee_no, permissionSnapshot: user.rbacPermissions, scopeSnapshot: user.dataScopes };
}

function maintenanceReviewSourceFacts(item,user){
  const facts=readNonroutineSourceFacts(db,item,{readParticipants:source=>maintenanceNonroutineParticipantRows(source.subtask_id)});
  if(facts.available&&user&&[...(facts.baseline.participants||[]),...(facts.current.participants||[])].some(person=>!actionScopeAllows(user,'maintenance.nonroutine.review.view',person.personId)))return {available:false,changed:true,token:null,reason:'当前工作事实涉及维修数据范围外人员，须有权负责人核对'};
  return facts;
}

function nonroutineReviewService() {
  return createNonroutineReview({sourceFacts:maintenanceReviewSourceFacts, db, transaction: maintenanceTransaction, can: nonroutineReviewCan,
    qualifiedAccount: nonroutineReviewQualifiedAccount, clock: now, randomId,
    canAssignPerson:maintenanceReviewCanAssignPerson,
    finalizationEnabled:()=>process.env.MUC_NONROUTINE_FINALIZATION_ENABLED==='1',
    candidateAccounts(search,user){const term=`%${search.toLowerCase()}%`;return db.prepare("select u.id,p.id as person_id,p.name,p.employee_no from users u join personnel p on p.id=u.person_id where coalesce(u.status,'active')='active' and p.data_status='active' and (lower(p.name) like ? or p.employee_no like ? or u.id like ?) order by p.employee_no,u.id")
      .all(term,term,term).filter(row=>personnelAccess.allows(user,'maintenance',row.person_id)).map(row=>({accountId:row.id,personId:row.person_id,name:row.name,employeeNo:row.employee_no}));}
  });
}
function standardManagementCan(actor,permission){
  actor=currentMaintenanceReviewActor(actor);
  return Boolean(actor?.id&&actor.status==='active'&&hasRbac(actor,'maintenance.view')&&hasRbac(actor,permission)&&personnelAccess.hasAll(actor,'maintenance')&&db.prepare("select 1 from personnel where id=? and data_status='active' and coalesce(employment_status,'') not in ('离职','停职')").get(actor.personId));
}
function standardImportService(){return createStandardImport({db,referenceSnapshot:()=>readStandardReferences(db),transaction:maintenanceTransaction,can:standardManagementCan,clock:now,randomId,versionUnderReview:versionId=>db.prepare('select id from maintenance_standard_review_cases where version_id=?').get(versionId)});}
function maintenanceExtensionAuthorized(user){
 if(!user?.id||user.status!=='active'||!user.personId||!personnelAccess.hasAll(user,'maintenance'))return false;
 return Boolean(db.prepare(`select 1 from users u join personnel p on p.id=u.person_id join rbac_user_roles ur on ur.user_id=u.id join rbac_roles r on r.id=ur.role_id join rbac_role_permissions rp on rp.role_id=r.id join rbac_permissions permission on permission.id=rp.permission_id
 where u.id=? and u.person_id=? and coalesce(u.status,'active')='active' and p.data_status='active' and coalesce(p.employment_status,'') not in ('离职','停职') and r.status='active' and r.code<>'system_admin' and permission.code='maintenance.module.manage' limit 1`).get(user.id,user.personId));
}
function maintenanceExtensionService(){return createMaintenanceExtensionModules({db,transaction:maintenanceTransaction,readIdentity:readMaintenanceModuleIdentity,authorize:maintenanceExtensionAuthorized,clock:now,
 audit(user,event){maintenanceLog(user,event.action,'module',event.moduleInstanceId,event.opportunityId,JSON.stringify({...event,actorQualification:{accountId:user.id,personId:user.personId,permissions:user.rbacPermissions,scopes:user.dataScopes}}),{touch:false});}});}
// P0-57 internal service only: overnight facts are recorded through explicit authority; no
// public route and no automatic mounting on production opportunities (V10.1 §19.4(5) scope).
function maintenanceOvernightFeedbackService(){return createMaintenanceOvernightFeedback({db,transaction:maintenanceTransaction,clock:now,randomId,authorize:maintenanceExtensionAuthorized,
 audit(user,event){maintenanceLog(user,event.action,'module',event.factId,event.opportunityId,JSON.stringify({...event,actorQualification:{accountId:user.id,personId:user.personId,permissions:user.rbacPermissions,scopes:user.dataScopes}}),{touch:false});},
 mountInstance(opportunityId,instanceKey,reason,user){const identity=readMaintenanceModuleIdentity(db,opportunityId);return maintenanceExtensionService().register(opportunityId,{moduleTypeCode:'extension_overnight_feedback',moduleVersion:1,resultType:'CHECK_RESULT',instanceKey,expectedRuleSnapshot:identity?.ruleSnapshotSha256,reason},user);}});}

function maintenanceWorkflowPerson(accountId,permission,all=false){
 const row=db.prepare(`select u.* from users u join personnel p on p.id=u.person_id
 where u.id=? and coalesce(u.status,'active')='active' and p.data_status='active' and coalesce(p.employment_status,'') not in ('离职','停职')
 and exists(select 1 from rbac_user_roles ur join rbac_roles r on r.id=ur.role_id join rbac_role_permissions rp on rp.role_id=r.id join rbac_permissions permission on permission.id=rp.permission_id where ur.user_id=u.id and r.status='active' and r.code<>'system_admin' and permission.code=?)`).get(accountId,permission);
 if(!row)return null;const actor=toUser(row);
 if(!actor.personId||!hasRbac(actor,'maintenance.view')||!actionScopeAllows(actor,permission,actor.personId)||(all&&!actionScopeHasAll(actor,permission)))return null;
 return {accountId:actor.id,personId:actor.personId,permissions:actor.rbacPermissions,scopes:actor.dataScopes};
}
function maintenanceWorkflowManage(user){return maintenanceWorkflowPerson(user?.id,'maintenance.workflow.manage',true);}
function maintenanceWorkflowContext(workflow,checkTemplate=true){
 const instance=db.prepare('select * from maintenance_module_instances where id=?').get(workflow.module_instance_id);
 const identity=instance&&readMaintenanceModuleIdentity(db,instance.opportunity_id),module=identity?.extensions.find(item=>item.moduleInstanceId===instance.id);
 if(!module)throw Object.assign(Error('未找到可访问的流程'),{status:404});
 const frozen=checkTemplate?readMaintenanceWorkflowTemplate(workflow,module.resultType):{code:'nonsettlement_simulation',version:1};
 const template=resolveMaintenanceWorkflowTemplate(frozen.code,frozen.version,module,process.env.MUC_WORKFLOW_SIMULATION_ENABLED==='1');
 return {module,identity,template};
}
function maintenanceWorkflowAccess(workflowId,user){
 const actor=maintenanceWorkflowPerson(user.id,'maintenance.workflow.view');
 if(!actor)throw Object.assign(Error('当前人员没有明确的流程查看权限'),{status:403});
 const workflow=db.prepare('select * from maintenance_workflow_instances where id=?').get(workflowId);
 const manager=Boolean(maintenanceWorkflowManage(user));
 if(!workflow||(!manager&&!db.prepare('select id from maintenance_workflow_tasks where workflow_id=? and account_id=? and person_id=?').get(workflowId,actor.accountId,actor.personId)))throw Object.assign(Error('未找到可访问的流程'),{status:404});
 return {actor,workflow,manager,...maintenanceWorkflowContext(workflow,false)};
}
function maintenanceWorkflowView(workflowId,user){
 const {actor,workflow,manager,module,identity,template}=maintenanceWorkflowAccess(workflowId,user);
 const completion=readMaintenanceWorkflowCompletion(db,module,identity.ruleSnapshotSha256);
 const tasks=manager?db.prepare('select * from maintenance_workflow_tasks where workflow_id=? order by id').all(workflowId):db.prepare('select * from maintenance_workflow_tasks where workflow_id=? and account_id=? and person_id=? order by id').all(workflowId,actor.accountId,actor.personId);
 const flight=db.prepare('select date,flight_no,aircraft_no,status,archived_at from maintenance_flights where id=?').get(module.opportunityId);
 return {workflowId,opportunityId:module.opportunityId,opportunity:{date:flight.date,flightNo:flight.flight_no,aircraftNo:flight.aircraft_no},locked:flight.status==='已确认'||Boolean(flight.archived_at),moduleInstanceId:module.moduleInstanceId,templateCode:workflow.template_code,templateVersion:Number(workflow.template_version),resultType:workflow.result_type,state:workflow.state,revision:Number(workflow.revision),completion,simulationOnly:true,manage:manager,tasks:tasks.map(task=>{
  let result=null;if(task.result_json){try{const value=JSON.parse(task.result_json);if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>['type','outcome','note'].includes(key))&&value.type===template.resultType&&template.outcomes.includes(value.outcome)&&(value.note===undefined||typeof value.note==='string'&&value.note.length<=10000))result=value;}catch{}}
  return {taskId:task.id,taskKey:task.task_key,title:task.title,accountId:task.account_id,personId:task.person_id,assignee:db.prepare('select name,employee_no as employeeNo from personnel where id=?').get(task.person_id)||null,state:task.state,revision:Number(task.revision),result,resultUnavailable:Boolean(task.result_json&&!result),submittedAt:task.submitted_at};
 })};
}
function maintenanceResultService(){
 const workflow=(module,payload,user)=>{
  const stored=db.prepare('select * from maintenance_workflow_instances where id=?').get(module.workflowInstanceId);
  if(!stored||stored.module_instance_id!==module.moduleInstanceId)throw Object.assign(Error('结果来源与流程模块不匹配'),{status:409});
  return maintenanceWorkflowService(module.opportunityId).submit(stored.id,payload,user);
 };
 return createMaintenanceResultDispatcher({
  ROUTINE_HOUR:(module,payload,user)=>submitMaintenanceRoutine(module.opportunityId,payload,user),
  NONROUTINE_HOUR:(module,payload,user)=>submitMaintenanceNonroutine(module.opportunityId,payload,user),
  RELEASE_COUNT:(module,payload,user)=>submitMaintenanceRelease(module.opportunityId,payload,user),
  CHECK_RESULT:workflow,APPROVAL_RESULT:workflow,TASK_OUTCOME:workflow,NO_SETTLEMENT_RESULT:workflow
 });
}
function maintenanceWorkflowService(expectedOpportunityId=''){return createMaintenanceWorkflowActions({db,transaction:maintenanceTransaction,clock:now,
 resolveTemplate:(code,version,{module})=>resolveMaintenanceWorkflowTemplate(code,version,module,process.env.MUC_WORKFLOW_SIMULATION_ENABLED==='1'),
 qualifyAssignee:accountId=>maintenanceWorkflowPerson(accountId,'maintenance.workflow.submit'),
 authorize(user,ctx){
  if(expectedOpportunityId&&ctx.flight.id!==expectedOpportunityId)throw Object.assign(Error('流程模块不属于当前维修机会'),{status:404});
  const code=ctx.workflow?.template_code||'nonsettlement_simulation',version=Number(ctx.workflow?.template_version||1);
  resolveMaintenanceWorkflowTemplate(code,version,ctx.module,process.env.MUC_WORKFLOW_SIMULATION_ENABLED==='1');
  if(ctx.workflow&&!readMaintenanceWorkflowCompletion(db,ctx.module,ctx.identity.ruleSnapshotSha256).available)throw Object.assign(Error('流程来源历史待核对，暂不能继续办理'),{status:409});
  return ['CREATE','REASSIGN','CANCEL'].includes(ctx.action)?maintenanceWorkflowManage(user):maintenanceWorkflowPerson(user.id,'maintenance.workflow.submit');
 },
 audit(user,event){maintenanceLog(user,'workflow_'+event.action.toLowerCase(),'workflow',event.workflowId,event.opportunityId,JSON.stringify({eventId:event.id,workflowId:event.workflowId,action:event.action,revision:event.after.revision,simulationOnly:true}),{touch:false});}
});}

function standardPublicationCan(user){user=currentMaintenanceReviewActor(user);return standardPublicationAuthorized({db,hasAll:(actor,module)=>personnelAccess.hasAll(actor,module)},user);}
function standardPublicationService(){return createStandardPublication({db,transaction:maintenanceTransaction,can:standardPublicationCan,clock:now,randomId,
  previewApplicability:aircraft=>standardPublicationApplicability(aircraft,maintenanceAircraftConfig()),
  approveApplicability(aircraft,user){const checked=standardPublicationApplicability(aircraft,maintenanceAircraftConfig());return checked.ready?{...checked,approved:true,approvedBy:user.id,approvedAt:now()}:null;}
});}

function standardWorkIntakeService(){return createWorkStandardIntake({db,transaction:maintenanceTransaction,can:standardPublicationCan,clock:now,randomId,publicationView:(standardId,versionId,user)=>standardPublicationService().view(standardId,versionId,user)});}

// V10.1 §5.8 / P0-37: refresh unconfirmed current-effective standard references after publication
// (and at boot): same work identity, hours-only change, aircraft applicable — recompute personal
// pending-hour projections with the ORIGINAL frozen ratios; snapshots/confirmed/settled untouched.
function standardEffectiveRefreshService(){return createStandardEffectiveRefresh({db,clock:now,randomId,publishedStandards:()=>createMaintenanceStandards({db,clock:now}).list({}).items});}
function refreshMaintenanceStandardEffectiveReferences(actor){
  const actions=maintenanceTransaction(()=>{
    const applied=standardEffectiveRefreshService().refresh(actor);
    for(const action of applied){
      const statuses=db.prepare("select distinct status from maintenance_hour_results where owner_type='subtask' and owner_id=? and status<>'已确认'").all(action.subtaskId).map(row=>row.status);
      for(const status of statuses)regenerateMaintenanceHours('subtask',action.subtaskId,status);
      maintenanceLog(actor,'standard_effective_refresh','subtask',action.subtaskId,action.flightId,JSON.stringify(action),{touch:false});
    }
    return applied;
  });
  for(const action of actions)bumpMaintenanceVersion(action.flightId,'maintenance.standard.effective-refresh');
  return actions;
}

function standardReviewCan(user,permission,item){
  user=currentMaintenanceReviewActor(user);
  if(!user?.id||user.status!=='active'||!hasRbac(user,'maintenance.view'))return false;
  if(!db.prepare("select 1 from personnel where id=? and data_status='active' and coalesce(employment_status,'') not in ('离职','停职')").get(user.personId))return false;
  const all=personnelAccess.hasAll(user,'maintenance');
  if(permission==='maintenance.standard.manage')return all&&hasRbac(user,permission);
  if(permission==='maintenance.nonroutine.review.view'){
    if(all&&['maintenance.standard.manage','maintenance.nonroutine.review.assign','maintenance.nonroutine.review.opinions.view'].some(code=>hasRbac(user,code)))return true;
    if(!hasRbac(user,permission)||!item)return false;
    if(all&&hasRbac(user,'maintenance.nonroutine.review.finalize'))return true;
    return Boolean(db.prepare('select 1 from maintenance_standard_review_seats where case_id=? and account_id=? and person_id=?').get(item.id,user.id,user.personId));
  }
  return hasRbac(user,permission)&&(permission==='maintenance.nonroutine.review.opinion.submit'||all);
}
function standardReviewQualifiedAccount(accountId,permission,item){
  const row=db.prepare("select u.*,p.name as person_name,p.employee_no as person_employee_no from users u join personnel p on p.id=u.person_id where u.id=? and coalesce(u.status,'active')='active' and p.data_status='active' and coalesce(p.employment_status,'') not in ('离职','停职')").get(String(accountId||''));
  if(!row)return null;const user=toUser(row);if(!user.personId||!standardReviewCan(user,permission,item))return null;
  return {accountId:user.id,personId:user.personId,personName:row.person_name,employeeNo:row.person_employee_no,permissionSnapshot:user.rbacPermissions,scopeSnapshot:user.dataScopes};
}
function standardReviewService(){return createStandardReview({db,referenceSnapshot:()=>readStandardReferences(db),transaction:maintenanceTransaction,can:standardReviewCan,qualifiedAccount:standardReviewQualifiedAccount,clock:now,randomId,
  canAssignPerson:maintenanceReviewCanAssignPerson,candidateAccounts(search){const term=`%${search.toLowerCase()}%`;return db.prepare("select u.id as accountId,p.id as personId,p.name,p.employee_no as employeeNo from users u join personnel p on p.id=u.person_id where coalesce(u.status,'active')='active' and p.data_status='active' and (lower(p.name) like ? or p.employee_no like ? or u.id like ?) order by p.employee_no,u.id").all(term,term,term);}
});}

function standardReviewNotifications(){return createStandardNotifications({db,transaction:maintenanceTransaction,can:standardReviewCan,qualifiedAccount:standardReviewQualifiedAccount,clock:now,randomId});}
function pumpStandardReviewNotifications(){
  if(process.env.MUC_STANDARDS_REVIEW_ENABLED!=='1'||process.env.MUC_STANDARDS_NOTIFICATIONS_ENABLED!=='1')return {delivered:0,cancelled:0};
  const result=standardReviewNotifications().pump();
  if(result.delivered)bumpMaintenanceVersion('','maintenance.standard.notifications.changed');return result;
}

function nonroutineNotifications(){return createNonroutineNotifications({db,transaction:maintenanceTransaction,can:nonroutineReviewCan,qualifiedAccount:nonroutineReviewQualifiedAccount,clock:now,randomId});}
function pumpNonroutineNotifications(){
  if(process.env.MUC_NONROUTINE_REVIEW_ENABLED!=='1' || process.env.MUC_NONROUTINE_NOTIFICATIONS_ENABLED!=='1')return {delivered:0,cancelled:0};
  const result=nonroutineNotifications().pump();
  if(result.delivered)bumpMaintenanceVersion('','maintenance.nonroutine.notifications.changed');return result;
}

function nonroutineFinalizationService() {
  return createNonroutineFinalization({sourceFacts:maintenanceReviewSourceFacts,db,transaction:maintenanceTransaction,can:nonroutineReviewCan,qualifiedAccount:nonroutineReviewQualifiedAccount,
    capturePolicy:(category,participants,item)=>frozenNonroutineFinalPolicy(item,category,participants),clock:now,randomId,
    currentRuleVersion:()=>crypto.createHash('sha256').update(JSON.stringify(db.prepare("select name,value from maintenance_hour_rules where rule_type='nonroutineCombinationRatio' order by name").all())).digest('hex'),
    previewAllocation(item,decision,participants,policy){
      const owner=maintenanceOwner('subtask',item.subtask_id);
      const flight=db.prepare('select * from maintenance_flights where id=?').get(item.flight_id);
      if(!owner || !flight)return {available:false,reason:'原机会或工作事实不存在'};
      const period=maintenanceHourPeriods().state(String(flight.date).slice(0,7));
      const context={opportunityStatus:flight.status,period:{month:period.month,state:period.state,revision:Number(period.revision)}};
      const rows=maintenanceNonroutineParticipantRows(item.subtask_id);
      const assignments=projectRecognitionAllocations(rows,participants);
      if(!assignments)return {...context,available:false,reason:'原参与事实与核实角色暂无法合法关联，需核对分配输入'};
      const result=maintenanceCalculatedHours('subtask',{...owner,_nonroutineEstimateBase:decision.recognizedHours,_nonroutinePolicy:policy},assignments);
      if(!assignments.length || assignments.some(row=>!result.has(row.id)) || Math.round([...result.values()].reduce((sum,value)=>sum+value,0)*100)!==Math.round(decision.recognizedHours*100))return {...context,available:false,reason:policy.unavailableReason||'策略未决或有效比例缺失，暂无法核算'};
      return {...context,available:true,totalHours:decision.recognizedHours,deliveryCompatible:true,allocations:assignments.map(row=>({personId:row.person_id,personName:row.user_name,sourceAssignmentId:row.sourceAssignmentId,role:row.role,hours:result.get(row.id)}))};
    },
    postingReceipt(id){const row=db.prepare('select work_month,handling_month,statistical_month,policy,task_id from maintenance_nonroutine_posting_receipts where case_id=?').get(id);return row?{workMonth:row.work_month,handlingMonth:row.handling_month,statisticalMonth:row.statistical_month,policy:row.policy,taskId:row.task_id}:null;},
    post({item,final,channel}) {
      const assessment=db.prepare("select * from maintenance_nonroutine_assessments where review_case_id=? and subtask_id=? and flight_id=? and report_batch_id=?")
        .get(item.id,item.subtask_id,item.flight_id,item.report_batch_id);
      if(!assessment || assessment.source_kind!=="REVIEW" || assessment.effective_hours!==null || channel.subtask_id!==item.subtask_id)throw maintenanceReviewError("终审来源或一次性通道不一致",409);
      const flight=db.prepare("select * from maintenance_flights where id=?").get(item.flight_id);
      const subtask=db.prepare("select * from maintenance_subtasks where id=? and flight_id=?").get(item.subtask_id,item.flight_id);
      const batch=db.prepare("select * from maintenance_report_batches where id=? and flight_id=? and report_type='nonroutine'").get(item.report_batch_id,item.flight_id);
      if(!flight || !subtask || !batch || !["已提报","待复核","已确认"].includes(flight.status))return {state:"NEEDS_ATTENTION",detail:{code:"SOURCE_FACTS_UNAVAILABLE",flightStatus:flight?.status || null}};
      const sourceCheck=approvedNonroutineSourceFacts(db,item,final,{readParticipants:source=>maintenanceNonroutineParticipantRows(source.subtask_id)});
      if(!sourceCheck.ok)return {state:'NEEDS_ATTENTION',detail:{code:sourceCheck.code}};
      const policy=JSON.parse(final.policy_json);
      if(policy.strategy==="UNDECIDED" || policy.strategy==="ROLE_COMBINATION" && !policy.valid)return {state:"NEEDS_ATTENTION",detail:{code:"ALLOCATION_INPUTS_UNRESOLVED",strategy:policy.strategy}};
      const month=String(flight.date || "").slice(0,7);
      const period=maintenanceHourPeriods().state(month);
      const crossPeriod=maintenanceCrossPeriod();
      let task=null,handlingPeriod=period;
      if(period.state==='CLOSED'){
        task=crossPeriod.ensure(item,final,channel,period);
        const authorization=crossPeriod.deliveryAuthorization(task,period);
        if(!authorization.ok)return {state:'NEEDS_ATTENTION',detail:{code:authorization.code,taskId:task.id,taskRevision:Number(task.revision),period:month,periodRevision:Number(period.revision)}};
        handlingPeriod=authorization.target;
      }else if(db.prepare("select 1 from maintenance_nonroutine_cross_period_tasks where case_id=? and state='AUTHORIZED'").get(item.id))return {state:'NEEDS_ATTENTION',detail:{code:'CROSS_PERIOD_AUTHORIZATION_REQUIRES_REVIEW'}};
      const result=deliverNonroutineRecognition({db,item,final,channel,flight,subtask,period:handlingPeriod,readParticipants:()=>maintenanceNonroutineParticipantRows(subtask.id),
        allocate:(owner,assignments)=>maintenanceCalculatedHours('subtask',owner,assignments),clock:now,randomId});
      if(['MERGED_CLOSED','ADJUSTED_CLOSED'].includes(result.state)){
        const receipt={workMonth:month,handlingMonth:handlingPeriod.month,statisticalMonth:month,policy:'ORIGINAL_WORK_MONTH',taskId:task?.id || null,taskRevision:task?Number(task.revision):null};
        db.prepare('insert into maintenance_nonroutine_posting_receipts(channel_id,case_id,approved_revision,task_id,task_revision,work_month,handling_month,statistical_month,policy,period_snapshot_json,created_at) values(?,?,?,?,?,?,?,?,?,?,?)')
          .run(channel.id,item.id,final.approved_revision,receipt.taskId,receipt.taskRevision,month,handlingPeriod.month,month,receipt.policy,JSON.stringify({sourcePeriod:period,handlingPeriod}),now());
        if(task)crossPeriod.complete(task,final.finalized_by,receipt);else crossPeriod.resolveReopened(item.id,final.finalized_by,period);
        result.detail.postingReceipt=receipt;
      }
      return result;
    }});
}

function maintenanceHourPeriods() {
  const can=(user,permission)=>Boolean(user?.id && user.status==='active' && hasRbac(user,'maintenance.view') && hasRbac(user,permission) && personnelAccess.hasAll(user,'maintenance'));
  return createMaintenanceHourPeriods({db,transaction:maintenanceTransaction,can,clock:now,randomId,
    listAccounts(search){const term=`%${search}%`;return db.prepare(`select u.id as accountId,p.name,p.employee_no as employeeNo from users u join personnel p on p.id=u.person_id
      where (p.name like ? or p.employee_no like ? or u.id like ?) order by p.employee_no,u.id`).all(term,term,term);},
    qualifiedAccount(accountId,permission){
      const row=db.prepare("select u.* from users u join personnel p on p.id=u.person_id where u.id=? and coalesce(u.status,'active')='active' and p.data_status='active' and coalesce(p.employment_status,'') not in ('离职','停职')").get(String(accountId || ''));
      if(!row)return null;const user=toUser(row);
      return can(user,permission)?{accountId:user.id,personId:user.personId,permissions:user.rbacPermissions,scopes:user.dataScopes}:null;
    }});
}

function maintenanceCrossPeriod(){
  const can=(user,permission)=>Boolean(user?.id && user.status==='active' && hasRbac(user,'maintenance.view') && hasRbac(user,permission) && actionScopeHasAll(user,permission));
  return createNonroutineCrossPeriod({db,transaction:maintenanceTransaction,can,clock:now,randomId,periodState:month=>maintenanceHourPeriods().state(month),
    qualifiedAccount(accountId,permission){
      const row=db.prepare("select u.* from users u join personnel p on p.id=u.person_id where u.id=? and coalesce(u.status,'active')='active' and p.data_status='active' and coalesce(p.employment_status,'') not in ('离职','停职')").get(String(accountId || ''));
      if(!row)return null;const user=toUser(row);
      return can(user,permission)?{accountId:user.id,personId:user.personId,permissions:user.rbacPermissions,scopes:user.dataScopes}:null;
    }});
}

function maintenanceCorrectionSource(subtaskId){
  const subtask=db.prepare('select * from maintenance_subtasks where id=?').get(subtaskId);
  const assessment=subtask&&maintenanceNonroutineAssessment(subtask);
  const flight=subtask&&db.prepare('select * from maintenance_flights where id=?').get(subtask.flight_id);
  if(!subtask||!flight||flight.status!=='已确认'||subtask.status!=='已确认'||!assessment||assessment.effective_hours===null)throw maintenanceReviewError('更正须有原已确认机会及已入账认定来源',409);
  let participants=JSON.parse(assessment.participants_json),policy=JSON.parse(assessment.policy_json),decision=JSON.parse(assessment.application_json),sourceId,sourceVersion;
  if(assessment.source_kind==='REVIEW'){
    const final=db.prepare('select * from maintenance_nonroutine_review_finals where case_id=?').get(assessment.review_case_id);
    const channel=db.prepare('select * from maintenance_nonroutine_review_channels where case_id=?').get(assessment.review_case_id);
    const review=db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(assessment.review_case_id);
    if(!final||!review||review.state!=='FINALIZED'||review.flight_id!==flight.id||review.subtask_id!==subtaskId||review.report_batch_id!==assessment.report_batch_id||!channel||channel.subtask_id!==subtaskId||!['MERGED_CLOSED','ADJUSTED_CLOSED'].includes(channel.state)||Number(channel.approved_revision)!==Number(final.approved_revision))throw maintenanceReviewError('原评议认定或已消费通道不一致',409);
    participants=JSON.parse(final.participants_json);policy=JSON.parse(final.policy_json);decision=JSON.parse(final.decision_json);sourceId=assessment.review_case_id;sourceVersion=String(final.approved_revision);
    if(Math.round(Number(decision.recognizedHours)*100)!==Math.round(Number(assessment.effective_hours)*100))throw maintenanceReviewError('原认定金额与已入账来源不一致',409);
  }else if(assessment.source_kind==='STANDARD'){
    const standard=JSON.parse(assessment.standard_json);if(!standard?.id||!standard.versionId||!standard.version)throw maintenanceReviewError('原标准版本快照缺失',409);
    if(Math.round(Number(standard.standardHours)*100)!==Math.round(Number(assessment.effective_hours)*100))throw maintenanceReviewError('原标准金额与已入账来源不一致',409);
    sourceId=standard.versionId;sourceVersion=String(standard.version);decision={...decision,recognizedHours:Number(assessment.effective_hours)};
  }else throw maintenanceReviewError('原工时来源类型不支持独立认定更正',409);
  const assignments=maintenanceNonroutineParticipantRows(subtaskId);
  const rows=db.prepare("select * from maintenance_effective_hour_results where owner_type='subtask' and owner_id=? order by id").all(subtaskId);
  if(!rows.length||assignments.some(row=>row.status!=='已确认')||rows.some(row=>row.status!=='已确认'||row.flight_id!==flight.id))throw maintenanceReviewError('原实际派工或结果尚未确认，不能办理更正',409);
  const people=values=>[...new Set(values)].sort().join('|');
  if(people(participants.map(person=>person.personId))!==people(assignments.map(row=>row.person_id))||people(participants.map(person=>person.personId))!==people(rows.map(row=>row.person_id)))throw maintenanceReviewError('冻结参与人与已确认实际来源不一致，请先核对授权变更的来源轨迹',409);
  const snapshot={kind:assessment.source_kind,sourceId,sourceVersion,sourceFingerprint:assessment.source_fingerprint,
    opportunity:{id:flight.id,date:flight.date,status:flight.status,aircraftNo:flight.aircraft_no,aircraftType:flight.aircraft_type},
    subtask:{id:subtask.id,category:subtask.category,title:subtask.title,content:subtask.content},decision,participants,policy,
    assignments:assignments.map(row=>({id:row.id,personId:row.person_id,role:row.role,status:row.status})),baseResults:rows.filter(row=>row.source!=='授权更正')};
  return {subtaskId,flightId:flight.id,kind:assessment.source_kind,sourceId,sourceVersion,workMonth:String(flight.date).slice(0,7),context:{...snapshot.opportunity,flightNo:maintenanceDisplayFlightNo(flight)},participants,policy,decision,rows,assignments,subtask,snapshot,digest:crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')};
}
function maintenanceCorrectionCan(user,permission){return Boolean(user?.id&&user.status==='active'&&hasRbac(user,'maintenance.view')&&hasRbac(user,permission)&&actionScopeHasAll(user,permission));}
function maintenanceCorrectionQualified(accountId,permission){
  const row=db.prepare("select u.* from users u join personnel p on p.id=u.person_id where u.id=? and coalesce(u.status,'active')='active' and p.data_status='active' and coalesce(p.employment_status,'') not in ('离职','停职')").get(accountId);
  if(!row)return null;const user=toUser(row);return maintenanceCorrectionCan(user,permission)?{accountId:user.id,personId:user.personId,permissions:user.rbacPermissions,scopes:user.dataScopes}:null;
}
function maintenanceCorrections(){return createNonroutineCorrections({db,transaction:maintenanceTransaction,can:maintenanceCorrectionCan,qualifiedAccount:maintenanceCorrectionQualified,
  loadSource:maintenanceCorrectionSource,periodState:month=>maintenanceHourPeriods().state(month),clock:now,randomId,
  allocate(source,input){
    const policy=frozenNonroutineFinalPolicy({policy_json:JSON.stringify(source.policy)},source.decision.category,input.participants);
    const assignments=projectRecognitionAllocations(source.assignments,input.participants);if(!assignments)return null;
    const calculated=maintenanceCalculatedHours('subtask',{...source.subtask,_nonroutineEstimateBase:input.recognizedHours,_nonroutinePolicy:policy},assignments);
    if(assignments.some(row=>!calculated.has(row.id)))return null;
    return {policy,rows:assignments.map(row=>({assignment_id:row.sourceAssignmentId||row.id,person_id:row.person_id,user_name:row.user_name,team:row.team||'',role:row.role,hours:calculated.get(row.id)}))};
  },audit(action,user,detail){const item=db.prepare('select subtask_id,flight_id from maintenance_nonroutine_corrections where id=?').get(detail.correctionId);maintenanceLog(user,'hour_correction_'+action.toLowerCase(),'subtask',item?.subtask_id||'',item?.flight_id||'',JSON.stringify(detail),{touch:false});}
});}

function appendMaintenanceImportedDraft(flightId, items, user) {
  if (!hasRbac(user, "maintenance.opportunity.import")) throw maintenanceReviewError("当前账号没有非例行导入权限", 403);
  const flight = assertMaintenanceTreeDirectEditAllowed(flightId);
  if (!flight || !["未派工", "已派工"].includes(flight.status)) throw maintenanceReviewError("当前维修机会已锁定，不能追加草稿", 409);
  if (maintenanceReportBatch(flightId, "nonroutine")) throw maintenanceReviewError("非例行已经提报，不能追加草稿", 409);
  const current = db.prepare("select * from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").get(flightId);
  const original = current ? JSON.parse(current.payload_json) : { items: [] };
  if (!Array.isArray(original.items)) throw maintenanceReviewError("原草稿结构异常，请人工核对", 409);
  const combined = [...original.items, ...items];
  if (combined.length > 1000) throw maintenanceReviewError("同一机会的非例行草稿最多支持1000项", 409);
  const identifiers = combined.map(item => item.clientId).filter(Boolean);
  if (new Set(identifiers).size !== identifiers.length) throw maintenanceReviewError("草稿单项标识冲突，请重新预览", 409);
  return writeMaintenanceReportDraft(flightId, "nonroutine", { ...original, items: combined }, user, current);
}

function assertMaintenanceImportedDraftSubmissionReady(flightId) {
  if (db.prepare("select 1 from maintenance_nonroutine_import_sources where flight_id=? and state='ACTIVE' limit 1").get(flightId)) {
    throw maintenanceReviewError("导入草稿暂仅开放编辑，正式报工待工时评议流程就绪", 409);
  }
}

function maintenanceV101SubmissionEnabled() {
  return process.env.MUC_MAINTENANCE_V101 === "draft" && process.env.MUC_NONROUTINE_REVIEW_ENABLED === "1" && process.env.MUC_NONROUTINE_SUBMISSION_ENABLED === "1";
}

function maintenanceNonroutineAssessment(owner) {
  if (Object.hasOwn(owner || {},"_nonroutineAssessment")) return owner._nonroutineAssessment;
  return owner?.id ? db.prepare("select * from maintenance_nonroutine_assessments where subtask_id=?").get(owner.id) : null;
}

function maintenanceNonroutineEffectivePolicy(owner) {
  const assessment=maintenanceNonroutineAssessment(owner);
  if(!assessment)return null;
  if(assessment.review_case_id && assessment.effective_hours!==null){
    const final=db.prepare('select policy_json from maintenance_nonroutine_review_finals where case_id=?').get(assessment.review_case_id);
    if(!final)throw maintenanceReviewError('有效工时缺少终审策略来源',409);
    return JSON.parse(final.policy_json);
  }
  return json(assessment.policy_json,null);
}

function maintenanceNonroutineAdjustmentClosed(owner){
  return Boolean(owner?.id && (db.prepare("select 1 from maintenance_nonroutine_review_channels where subtask_id=? and state='ADJUSTED_CLOSED'").get(owner.id) ||
    db.prepare("select 1 from maintenance_nonroutine_corrections where subtask_id=?").get(owner.id)));
}

function maintenanceRecognitionAssignments(ownerType,owner,assignments){
  if(ownerType!=='subtask')return assignments;
  if(maintenanceNonroutineAdjustmentClosed(owner))return assignments;
  const assessment=maintenanceNonroutineAssessment(owner);
  if(!assessment?.review_case_id || assessment.effective_hours===null)return assignments;
  const final=db.prepare('select participants_json from maintenance_nonroutine_review_finals where case_id=?').get(assessment.review_case_id);
  const mapped=final && projectRecognitionAllocations(assignments,JSON.parse(final.participants_json));
  if(!mapped)throw maintenanceReviewError('当前参与事实与终审核实角色无法合法关联，请核对分配输入',409);
  return mapped;
}
function maintenanceWriteRecognitionRoleResults(owner,assignments,calculated,options={}){
  const assessment=maintenanceNonroutineAssessment(owner),final=assessment?.review_case_id&&db.prepare('select approved_revision from maintenance_nonroutine_review_finals where case_id=?').get(assessment.review_case_id);
  if(!final)throw maintenanceReviewError('核算角色缺少已锁定的终审来源',409);
  return writeNonroutineRoleResults({db,caseId:assessment.review_case_id,approvedRevision:Number(final.approved_revision),owner,flightId:owner.flight_id,assignments,calculated,clock:now,randomId,readParticipants:()=>maintenanceNonroutineParticipantRows(owner.id),...options});
}

function maintenanceNonroutinePending(owner) {
  const assessment = maintenanceNonroutineAssessment(owner);
  if (!assessment || assessment.effective_hours !== null) return false;
  const review = db.prepare(`select c.id,c.state as case_state,ch.state as channel_state from maintenance_nonroutine_review_cases c
    join maintenance_nonroutine_review_channels ch on ch.case_id=c.id and ch.subtask_id=c.subtask_id
    join maintenance_report_batches b on b.id=c.report_batch_id and b.flight_id=c.flight_id and b.report_type='nonroutine'
    where c.id=? and c.subtask_id=? and c.flight_id=? and c.report_batch_id=?
      and ((c.state in ('PENDING_ACCEPTANCE','IN_REVIEW','SEALED','FINALIZED') and ch.state in ('WAITING_REVIEW','APPROVED_PENDING_SYNC','NEEDS_ATTENTION')) or (c.state='CANCELLED' and ch.state='CANCELLED_CLOSED'))`)
    .get(assessment.review_case_id,owner.id,assessment.flight_id,assessment.report_batch_id);
  if (assessment.source_kind !== "REVIEW" || !review) throw maintenanceReviewError("非例行待审来源关联异常，请核对评议与工时通道",409);
  return review.case_state!=='CANCELLED';
}

function maintenanceNonroutineUnposted(owner){
  const assessment=maintenanceNonroutineAssessment(owner);
  if(!assessment||assessment.effective_hours!==null)return false;
  maintenanceNonroutinePending(owner); // Validate the source and exact closed-state pair as well.
  return true;
}

function maintenanceNonroutineHourAssessment(owner) {
  const assessment = maintenanceNonroutineAssessment(owner);
  if (!assessment) return null;
  const pending = maintenanceNonroutinePending(owner);
  const application = JSON.parse(assessment.application_json);
  const participants = JSON.parse(assessment.participants_json);
  const policy = JSON.parse(assessment.policy_json);
  const final = assessment.review_case_id ? db.prepare("select decision_json from maintenance_nonroutine_review_finals where case_id=?").get(assessment.review_case_id) : null;
  const assignments = participants.map(person=>({ id:person.assignmentId,person_id:person.personId,role:person.role,assigned_at:person.assignedAt }));
  const estimates = pending && !final ? maintenanceCalculatedHours("subtask",{...owner,_nonroutineEstimateBase:application.requestedHours,_nonroutinePolicy:policy},assignments) : new Map();
  const byPerson = new Map();
  for (const person of participants) {
    if (!byPerson.has(person.personId)) byPerson.set(person.personId,estimates.size ? 0 : null);
    if (estimates.size) byPerson.set(person.personId,byPerson.get(person.personId)+(estimates.get(person.assignmentId)||0));
  }
  return { sourceKind:assessment.source_kind,strategy:policy.strategy,pending,cancelled:assessment.effective_hours===null&&!pending,reviewPending:pending && !final,syncPending:pending && Boolean(final),
    ...(final?{recognized:JSON.parse(final.decision_json)}:{}),reviewCaseId:assessment.review_case_id,requestedHours:application.requestedHours,
    standard:json(assessment.standard_json,null),
    effectiveHours:assessment.effective_hours===null?null:Number(assessment.effective_hours),
    ...(pending && !final ? { estimateOnly:true,personalEstimates:[...byPerson].map(([personId,hours])=>({personId,hours:hours===null?null:Math.round(hours*100)/100})),
      estimateUnavailable:!estimates.size } : {}) };
}

function captureMaintenanceNonroutinePolicy(category, entries) {
  const strategy = NONROUTINE_CATEGORY_STRATEGIES[category];
  const combination = maintenanceNonroutineCombinationName(entries.map(entry => normalizeMaintenanceSubtaskRole(entry.role)));
  const rows = db.prepare("select name,value from maintenance_hour_rules where rule_type='nonroutineCombinationRatio' order by name").all();
  const combinations = Object.fromEntries(maintenanceNonroutineCombinations.map(roles=>[
    maintenanceNonroutineCombinationName(roles),Object.fromEntries(roles.map(role=>{
      const row=rows.find(row=>row.name===`${maintenanceNonroutineCombinationName(roles)}::${role}`);
      const value=Number(row?.value);
      return [role,row && Number.isFinite(value) && value>=0 && value<=1 ? value : null];
    }))
  ]));
  const version = crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  const configurationVersion=maintenanceRuleHistory().state();
  if (strategy !== "ROLE_COMBINATION") return {strategy:strategy||"UNDECIDED",category,version:1,capturedAt:now(),configurationVersion,roleCombinationSnapshot:{version,combinations}};
  const ratios = Object.fromEntries(combination.split("+").map(role => [role,maintenanceRatioRuleForOwner("subtask",{category},role,entries)]));
  const valid = Object.values(ratios).every(value => value !== null) && Math.abs(Object.values(ratios).reduce((sum,value)=>sum+Number(value),0)-1)<1e-8;
  return { strategy, category, combination, ratios, combinations, valid, version: crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex"), capturedAt: now(),configurationVersion };
}

function maintenanceManualSubmissionEnabled(){return maintenanceV101SubmissionEnabled()&&process.env.MUC_NONROUTINE_MANUAL_ENABLED==='1';}
function maintenanceSourceRows(flightId){return [
  ...db.prepare('select * from maintenance_nonroutine_import_sources where flight_id=?').all(flightId).map(row=>({...row,kind:'IMPORT'})),
  ...db.prepare('select * from maintenance_nonroutine_manual_sources where flight_id=?').all(flightId).map(row=>({...row,kind:'MANUAL'}))
];}
function prepareMaintenanceManualSources(flightId,items){
  if(!maintenanceManualSubmissionEnabled()&&!db.prepare('select 1 from maintenance_nonroutine_manual_sources where flight_id=? limit 1').get(flightId)){const importedIds=new Set(db.prepare('select client_id from maintenance_nonroutine_import_sources where flight_id=?').all(flightId).map(row=>row.client_id));if(items.some(raw=>!importedIds.has(raw.clientId)&&(raw.standardId||raw.manualManaged)))throw maintenanceReviewError('手工标准报工尚未启用',409);return [];}
  const flight=db.prepare('select * from maintenance_flights where id=?').get(flightId),current=maintenanceReportDraft(flightId,'nonroutine');
  const standards=createMaintenanceStandards({db}).snapshot();
  return createManualNonroutineSources({db,clock:now,randomId,matchStandard:standards.match}).prepare(flight,items,current?.items||[],{enabled:maintenanceManualSubmissionEnabled(),importClientIds:db.prepare('select client_id from maintenance_nonroutine_import_sources where flight_id=?').all(flightId).map(row=>row.client_id)});
}
function writeMaintenanceSourceState(source,state,{subtaskId=null}={}){
  const table=source.kind==='MANUAL'?'maintenance_nonroutine_manual_sources':'maintenance_nonroutine_import_sources';
  if(state==='SUBMITTED')db.prepare(`update ${table} set state='SUBMITTED',subtask_id=?,updated_at=? where fingerprint=? and state='ACTIVE'`).run(subtaskId,now(),source.fingerprint);
  else db.prepare(`update ${table} set state='DELETED',updated_at=? where fingerprint=? and state='ACTIVE'`).run(now(),source.fingerprint);
}

function assertMaintenanceNewStandardChoicePermission(flightId,items,user){
  if(hasRbac(user,'maintenance.standard.view'))return;
  const sources=new Map(maintenanceSourceRows(flightId).map(row=>[row.client_id,row]));
  for(const item of items){
    if(!item?.standardId)continue;
    const previous=json(sources.get(String(item.clientId||''))?.standard_snapshot_json,null);
    if(String(item.standardId)!==String(previous?.id||'')||Number(item.standardVersion)!==Number(previous?.version))throw maintenanceReviewError('当前账号没有选择新的非例行标准引用的权限',403);
  }
}

function prepareMaintenanceImportedStandardChoices(flightId,items,user){
  const sources=new Map(db.prepare('select * from maintenance_nonroutine_import_sources where flight_id=?').all(flightId).map(row=>[row.client_id,row]));
  const flight=db.prepare('select * from maintenance_flights where id=?').get(flightId),standards=createMaintenanceStandards({db}).snapshot();
  for(const raw of items){
    const source=sources.get(String(raw?.clientId||''));
    if(!source||!Object.hasOwn(raw,'standardId'))continue;
    if(source.state!=='ACTIVE')throw maintenanceReviewError('该来源草稿已删除或已提报，不能重新选择标准',409);
    const previous=json(source.standard_snapshot_json,null),reference=String(raw.standardId||'');
    if(!maintenanceV101SubmissionEnabled()){
      if(reference!==String(previous?.id||'')||reference&&Number(raw.standardVersion)!==Number(previous?.version))throw maintenanceReviewError('导入草稿标准选择尚未启用',409);
      continue;
    }
    let standard=null;
    if(reference){
      const match=standards.match({standardId:reference,standardVersion:raw.standardVersion},flight.aircraft_type);
      if(match.status!=='MATCHED')throw maintenanceReviewError('所选标准已失效或不适用于当前机型，请重新核对',409);
      standard=match.standard;
    }
    const snapshot=standard?JSON.stringify(standard):null;
    if(snapshot===source.standard_snapshot_json)continue;
    db.prepare("update maintenance_nonroutine_import_sources set standard_snapshot_json=?,updated_at=? where fingerprint=? and state='ACTIVE'").run(snapshot,now(),source.fingerprint);
    maintenanceLog(user,'nonroutine_draft_standard_selected','flight',flightId,flightId,JSON.stringify({clientId:source.client_id,sourceFingerprint:source.fingerprint,before:previous,after:standard}));
  }
}

function prepareMaintenanceImportedSubmission(flightId, payload, user) {
  const raw=Array.isArray(payload?.items)?payload.items:[];
  assertMaintenanceNewStandardChoicePermission(flightId,raw,user);
  prepareMaintenanceManualSources(flightId,raw.filter(item=>item&&typeof item==='object'&&!Array.isArray(item)));
  prepareMaintenanceImportedStandardChoices(flightId,raw,user);
  const allSources=maintenanceSourceRows(flightId);
  for(const item of raw){if(item?.clientId&&allSources.some(source=>source.client_id===String(item.clientId)&&source.state!=='ACTIVE'))throw maintenanceReviewError('该来源草稿已删除或已提报，不能重复创建',409);}
  const sources=allSources.filter(source=>source.state==='ACTIVE');
  if(!sources.length)return new Map();
  if(sources.some(source=>source.kind==='MANUAL')&&!maintenanceManualSubmissionEnabled())throw maintenanceReviewError('手工标准草稿正式报工尚未启用',409);
  if(sources.some(source=>source.kind==='IMPORT')&&!maintenanceV101SubmissionEnabled())assertMaintenanceImportedDraftSubmissionReady(flightId);
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  const identifiers = rawItems.map(item => String(item?.clientId || "")).filter(Boolean);
  if (new Set(identifiers).size !== identifiers.length) throw maintenanceReviewError("正式报工包含重复草稿标识",409);
  if (sources.some(source => !identifiers.includes(source.client_id))) throw maintenanceReviewError("正式报工必须包含全部来源草稿，需移除的项目请先在原草稿中删除",409);
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  const standards = createMaintenanceStandards({ db }).snapshot();
  const result = new Map();
  for (const source of sources) {
    const raw = rawItems.find(item => item.clientId === source.client_id);
    if (raw.id || !raw.temporary) throw maintenanceReviewError("来源草稿不能冒用已有正式工作身份",409);
    const reference = json(source.standard_snapshot_json,null);
    const input = { category: raw.category, chapter: raw.chapter, title: raw.title, workScope: raw.reportExplanation };
    if (reference) Object.assign(input,{standardId:reference.id,standardVersion:reference.version});
    const match = resolveManualUnlistedSubmissionMatch(source,raw,standards.match(input,flight.aircraft_type));
    if (["BLOCKED","NEEDS_SELECTION"].includes(match.status)) throw maintenanceReviewError("提交前标准匹配已变化，请重新选择并核对适用标准",409);
    if(!reference&&match.standard&&!hasRbac(user,'maintenance.standard.view'))throw maintenanceReviewError('当前账号没有选择新的非例行标准引用的权限',403);
    if(source.kind==='IMPORT'&&!reference&&match.status==='MATCHED')throw maintenanceReviewError('当前已匹配到有效标准，请在原草稿中确认引用适用标准后再提报',409);
    const standard = match.standard || null;
    if (standard && ["category","chapter","title"].some(field=>String(raw[field] || "").trim()!==String(standard[field]).trim()) ||
        standard && (String(raw.reportExplanation || "").trim() !== standard.workScope.trim() || Number(raw.standardHours)!==standard.standardHours)) throw maintenanceReviewError("已收录标准五项必须采用当前标准值，请刷新核对",409);
    const snapshot = standard ? { category:standard.category,chapter:standard.chapter,title:standard.title,workScope:standard.workScope,requestedHours:standard.standardHours }
      : { ...input, requestedHours: Number(raw.standardHours) };
    if (!Object.hasOwn(NONROUTINE_CATEGORY_STRATEGIES,snapshot.category) || !String(snapshot.chapter || "").trim() || !String(snapshot.title || "").trim() || !String(snapshot.workScope || "").trim()) throw maintenanceDispatchError("正式提报须完整填写类别、ATA、名称和工作范围");
    if (snapshot.chapter.length>200 || snapshot.title.length>500 || snapshot.workScope.length>4000) throw maintenanceDispatchError("申请字段超过长度限制");
    if (!Number.isFinite(snapshot.requestedHours) || (standard ? snapshot.requestedHours < 0 : !(snapshot.requestedHours > 0)) || snapshot.requestedHours > 10000 || Math.abs(snapshot.requestedHours*10-Math.round(snapshot.requestedHours*10))>1e-8) throw maintenanceDispatchError("申请工时必须有效且以0.1小时为单位");
    result.set(source.client_id,{source,snapshot,standard,matchBasis:match.basis||match.status});
  }
  return result;
}

function maintenanceNonroutineImportPreview(payload, manager, { excludedRows = [], includeLockedSources = false } = {}) {
  const standards = createMaintenanceStandards({ db }).snapshot();
  const workByFlight = new Map();
  return previewNonroutineImport({
    rows: payload?.rows,
    excludedRows,
    resolveFlight(raw, rowNumber) {
      const identity = {
        date: normalizeMaintenanceStatsDate(raw.date ?? raw["日期"]),
        flightNo: String(raw.flightNo ?? raw.flight_no ?? raw["进港航班号"] ?? raw["航班号"] ?? "").trim(),
        departureFlightNo: String(raw.departureFlightNo ?? raw.departure_flight_no ?? raw["出港航班号"] ?? "").trim(),
        aircraftNo: String(raw.aircraftNo ?? raw.aircraft_no ?? raw["机号"] ?? "").trim(),
        workKind: String(raw.workKind ?? raw.work_kind ?? raw["维修机会"] ?? "").trim(),
        location: maintenanceLocationForInput(raw),
        flightId: raw.flightId
      };
      const validationError = maintenanceFlightValidationError(identity);
      if (validationError) throw maintenanceReviewError(validationError);
      if (!maintenanceOpportunityCategories.includes(identity.workKind)) throw maintenanceReviewError("维修机会无效");
      const flight = maintenanceAdditionalWorkTarget(identity, manager, rowNumber, { allowLocked: includeLockedSources });
      if (maintenanceReportBatch(flight.id, "nonroutine")) {
        if (!includeLockedSources) throw maintenanceReviewError("非例行已提报并锁定", 409);
        flight.importLocked = true;
      }
      return { ...flight, draftVersion: maintenanceReportDraft(flight.id, "nonroutine")?.version || 0 };
    },
    existingWork(flightId) {
      if (!workByFlight.has(flightId)) {
        const formal = db.prepare("select id,card_no,title,content,category,status from maintenance_subtasks where flight_id=? order by created_at,id").all(flightId);
        const draft = maintenanceReportDraft(flightId, "nonroutine");
        workByFlight.set(flightId, [
          ...formal.map(row => ({ ...row, source: "已有工作" })),
          ...(draft?.items || []).map(row => ({ ...row, source: "已有草稿" }))
        ]);
      }
      return workByFlight.get(flightId);
    },
    matchStandard: (item, aircraftCode) => standards.match(item, aircraftCode)
  });
}

function maintenanceSubtaskPayload(input = {}) {
  return {
    cardNo: String(input.chapter || input.cardNo || input.card_no || input["章节"] || input["工卡号"] || input["工卡编号"] || "").trim(),
    title: String(input.title || input.cardName || input.card_name || input["工作标题"] || input["工卡名称"] || "").trim(),
    content: String(input.reportExplanation || input.content || input["报工说明"] || "").trim(),
    category: maintenanceNonroutineCategories.includes(String(input.category || input.workKind || input["类别"] || input["工作类别"] || "").trim())
      ? String(input.category || input.workKind || input["类别"] || input["工作类别"]).trim()
      : "其他",
    standardHours: Number(input.standardHours ?? input.standard_hours ?? input["标准工时"] ?? 0) || 0,
    priority: String(input.priority || input["优先级"] || "普通").trim() || "普通",
    status: maintenanceStatus(input.status || input["状态"], "未派工"),
    remark: String(input.remark || input["备注"] || "").trim()
  };
}

function publicMaintenanceAssignment(row) {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    flightId: row.flight_id || "",
    personId: row.person_id,
    userId: row.person_id,
    userName: row.user_name,
    team: row.team || "未设置",
    role: row.role,
    status: row.status,
    feedback: row.feedback || "",
    assignedBy: row.assigned_by || "",
    assignedAt: row.assigned_at || "",
    receivedAt: row.received_at || "",
    startedAt: row.started_at || "",
    completedAt: row.completed_at || "",
    submittedAt: row.submitted_at || "",
    modifiedAt: row.modified_at || "",
    confirmedAt: row.confirmed_at || ""
  };
}

function publicSummaryAssignment(row) {
  return {
    ...publicMaintenanceAssignment(row),
    feedback: ""
  };
}

function publicMaintenanceHour(row) {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    flightId: row.flight_id || "",
    assignmentId: row.assignment_id,
    personId: row.person_id,
    userId: row.person_id,
    userName: row.user_name,
    team: row.team || "未设置",
    role: row.role || "",
    source: row.source || "",
    hours: Number(row.hours || 0),
    adjustedHours: row.adjusted_hours === null || row.adjusted_hours === undefined ? null : Number(row.adjusted_hours),
    finalHours: row.adjusted_hours === null || row.adjusted_hours === undefined ? Number(row.hours || 0) : Number(row.adjusted_hours || 0),
    status: row.status,
    confirmedBy: row.confirmed_by || "",
    confirmedAt: row.confirmed_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicMaintenanceSortie(row) {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    flightId: row.flight_id || "",
    assignmentId: row.assignment_id,
    personId: row.person_id,
    userId: row.person_id,
    userName: row.user_name,
    team: row.team || "未设置",
    role: "放行",
    source: row.source || "放行架次",
    sorties: 1,
    status: row.status,
    confirmedBy: row.confirmed_by || "",
    confirmedAt: row.confirmed_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function maintenanceAssignments(ownerType, ownerId) {
  return db.prepare("select * from maintenance_assignments where owner_type=? and owner_id=? order by user_name").all(ownerType, ownerId).map(publicMaintenanceAssignment);
}

function maintenanceHours(ownerType, ownerId) {
  return db.prepare("select * from maintenance_effective_hour_results where owner_type=? and owner_id=? order by user_name").all(ownerType, ownerId).map(publicMaintenanceHour);
}

function maintenanceSorties(ownerType, ownerId) {
  return db.prepare("select * from maintenance_sortie_results where owner_type=? and owner_id=? order by user_name").all(ownerType, ownerId).map(publicMaintenanceSortie);
}

function maintenanceWorkReport(flightId) {
  const row = db.prepare("select * from maintenance_work_reports where flight_id=?").get(flightId);
  const entries = db.prepare("select * from maintenance_work_report_entries where flight_id=? order by role,user_name").all(flightId).map(item => ({
    role: item.role,
    personId: item.person_id,
    userName: item.user_name,
    team: item.team || "未设置"
  }));
  return {
    exists: !!row,
    status: row?.status || "",
    feedback: row?.feedback || "",
    reportedBy: row?.reported_by || "",
    reportedByName: row?.reported_by_name || "",
    reportedAt: row?.reported_at || "",
    finalizedBy: row?.finalized_by || "",
    finalizedByName: row?.finalized_by_name || "",
    finalizedAt: row?.finalized_at || "",
    entries
  };
}

function touchMaintenanceFlight(flightId) {
  const row = db.prepare("select updated_at from maintenance_flights where id=?").get(flightId);
  if (!row) return;
  const stamp = new Date(Math.max(Date.now(), (Date.parse(row.updated_at) || 0) + 1)).toISOString();
  db.prepare("update maintenance_flights set updated_at=? where id=?").run(stamp, flightId);
}

function assertMaintenanceFlightVersion(flightId, payload) {
  const row = db.prepare("select updated_at from maintenance_flights where id=?").get(flightId);
  if (!payload?.expectedUpdatedAt || payload.expectedUpdatedAt !== row?.updated_at) {
    throw Object.assign(maintenanceReviewError("维修机会已更新，请刷新后重试", 409), { code: "MAINTENANCE_REPORT_CONFLICT" });
  }
}

function maintenanceTransaction(callback, reportFlightId = "") {
  db.exec("begin immediate");
  try {
    if(db.kind==="postgres")db.exec("select pg_advisory_xact_lock(54002010,31)");
    const user=requestUser();
    const reportPeople = new Set(reportFlightId ? maintenanceReportPeople(reportFlightId).map(p => p.id) : []);
    const snapshot=()=>new Map(PERSON_TABLES.flatMap(table=>db.prepare(`select * from ${table}`).all().map(row=>[table+":"+ (row.id || JSON.stringify([row.flight_id,row.role,row.person_id])),row])));
    const before=user && !personnelAccess.hasAll(user,"maintenance")?snapshot():null;
    const result = callback();
    if(before){
      const after=snapshot();
      for(const key of new Set([...before.keys(),...after.keys()])){
        const old=before.get(key),next=after.get(key);
        if(JSON.stringify(old)===JSON.stringify(next))continue;
        for(const row of [old,next].filter(Boolean)) {
          const reportAllowed = reportPeople.has(row.person_id) && row.flight_id === reportFlightId;
          if(row.person_id!==user.personId && !reportAllowed && !personnelAccess.allows(user,"maintenance",row.person_id))throw Object.assign(new Error("操作涉及维修范围外人员，整笔操作已取消"),{status:403});
        }
      }
    }
    db.exec("commit");
    return result;
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

function insertMaintenanceAssignment({
  id = randomId("mtnas"),
  ownerType,
  ownerId,
  flightId,
  personId,
  userName,
  team = "未设置",
  role,
  isLead = 0,
  status = "已派工",
  feedback = "",
  assignedBy = "",
  assignedAt = "",
  receivedAt = "",
  startedAt = "",
  completedAt = "",
  submittedAt = "",
  modifiedAt = "",
  confirmedAt = ""
}) {
  db.prepare(`insert into maintenance_assignments(id,owner_type,owner_id,flight_id,person_id,user_name,team,role,is_lead,status,feedback,assigned_by,assigned_at,received_at,started_at,completed_at,submitted_at,modified_at,confirmed_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, ownerType, ownerId, flightId, personId, userName, team, role, isLead, status, feedback, assignedBy, assignedAt, receivedAt, startedAt, completedAt, submittedAt, modifiedAt, confirmedAt);
  return id;
}

const maintenanceReportTypes = ["release", "routine", "nonroutine"];
const maintenanceNonroutineCategories = ["工卡指令", "单项工作", "拖机", "其他"];

function maintenanceReportBatch(flightId, reportType) {
  const row = db.prepare("select * from maintenance_report_batches where flight_id=? and report_type=?").get(flightId, reportType);
  if (!row) return null;
  return {
    id: row.id,
    flightId: row.flight_id,
    reportType: row.report_type,
    status: row.status,
    feedback: row.feedback || "",
    version: Number(row.version || 0),
    submittedBy: row.submitted_by || "",
    submittedByName: row.submitted_by_name || "",
    submittedAt: row.submitted_at || "",
    entries: db.prepare("select * from maintenance_report_entries where batch_id=? order by owner_type,owner_id,role,user_name").all(row.id).map(item => ({
      id: item.id,
      ownerType: item.owner_type,
      ownerId: item.owner_id,
      role: item.role,
      personId: item.person_id,
      userName: item.user_name,
      team: item.team || "未设置",
      standardHours: item.standard_hours === null ? null : Number(item.standard_hours || 0),
      source: item.source || ""
    }))
  };
}

function maintenanceReportDraft(flightId, reportType = "nonroutine") {
  const row = db.prepare("select * from maintenance_report_drafts where flight_id=? and report_type=?").get(flightId, reportType);
  if (!row) return null;
  let payload = {};
  try { payload = JSON.parse(row.payload_json || "{}"); } catch {}
  if (reportType === "routine") {
    return {
      id: row.id,
      flightId: row.flight_id,
      reportType: row.report_type,
      entries: Array.isArray(payload.entries) ? payload.entries.map(item => ({
        role: String(item?.role || ""),
        personId: String(item?.personId || "")
      })) : [],
      feedback: String(payload.feedback || ""),
      releasePersonId: String(payload.releasePersonId || ""),
      version: Number(row.version || 1),
      updatedBy: row.updated_by || "",
      updatedByName: row.updated_by_name || "",
      updatedAt: row.updated_at || ""
    };
  }
  return {
    id: row.id,
    flightId: row.flight_id,
    reportType: row.report_type,
    items: (Array.isArray(payload.items) ? payload.items : []).map(item => ({
      ...item,
      chapter: String(item?.chapter || item?.cardNo || ""),
      category: item?.sourceFingerprint ? String(item.category || "") : maintenanceNonroutineCategories.includes(String(item?.category || "")) ? String(item.category) : "其他",
      reportExplanation: String(item?.reportExplanation || item?.content || "")
    })),
    version: Number(row.version || 1),
    updatedBy: row.updated_by || "",
    updatedByName: row.updated_by_name || "",
    updatedAt: row.updated_at || ""
  };
}

function rememberMaintenanceDraftVersion(flightId, reportType, version) {
  db.prepare(`insert into maintenance_report_draft_versions(flight_id,report_type,version) values(?,?,?)
    on conflict(flight_id,report_type) do update set version=
      case when excluded.version>maintenance_report_draft_versions.version then excluded.version else maintenance_report_draft_versions.version end`)
    .run(flightId, reportType, version);
}

function writeMaintenanceReportDraft(flightId, reportType, payload, user, current = null) {
  const stamp = now();
  const id = current?.id || randomId("mtnrd");
  const previous = reportType === "nonroutine"
    ? db.prepare("select version from maintenance_report_draft_versions where flight_id=? and report_type=?").get(flightId, reportType)
    : null;
  const version = Math.max(Number(current?.version || 0), Number(previous?.version || 0)) + 1;
  db.prepare(`insert into maintenance_report_drafts(id,flight_id,report_type,payload_json,version,updated_by,updated_by_name,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?)
    on conflict(flight_id,report_type) do update set payload_json=excluded.payload_json,version=excluded.version,updated_by=excluded.updated_by,updated_by_name=excluded.updated_by_name,updated_at=excluded.updated_at`)
    .run(id, flightId, reportType, JSON.stringify(payload), version, user.id, user.name, current?.created_at || stamp, stamp);
  if (reportType === "nonroutine") rememberMaintenanceDraftVersion(flightId, reportType, version);
  return version;
}

function normalizeMaintenanceNonroutineDraft(flightId, payload, user) {
  if (!Array.isArray(payload?.items) || payload.items.length > 1000) throw maintenanceReviewError("非例行草稿须为不超过1000项的列表");
  const people = new Set(maintenanceReportPeople(flightId).map(person => person.id));
  for (const item of payload.items) {
    if (!item || typeof item !== "object" || Array.isArray(item) || (item.entries !== undefined && !Array.isArray(item.entries))) {
      throw maintenanceReviewError("非例行草稿单项或人员格式无效");
    }
    if (item.standardHours !== "" && item.standardHours !== null && item.standardHours !== undefined && !Number.isFinite(Number(item.standardHours))) {
      throw maintenanceReviewError("草稿工时格式无效");
    }
    for (const entry of (item.entries || [])) {
      if (!entry || typeof entry !== "object") throw maintenanceReviewError("草稿人员格式无效");
      if (!people.has(String(entry.personId || ""))) throw Object.assign(new Error("草稿包含范围外或无效人员"), { status: 403 });
    }
  }
  assertMaintenanceNewStandardChoicePermission(flightId,payload.items,user);
  prepareMaintenanceManualSources(flightId,payload.items);
  prepareMaintenanceImportedStandardChoices(flightId,payload.items,user);
  const sources=new Map(maintenanceSourceRows(flightId).filter(row=>row.state==='ACTIVE').map(row=>[row.client_id,row]));
  const items = payload.items.map(raw => {
    const source = sources.get(String(raw.clientId || ""));
    const snapshot = source?.standard_snapshot_json ? JSON.parse(source.standard_snapshot_json) : null;
    const rawCategory = String(raw.category || "");
    const category = source ? rawCategory : maintenanceNonroutineCategories.includes(rawCategory) ? rawCategory : "其他";
    if (source && category && !Object.hasOwn(NONROUTINE_CATEGORY_STRATEGIES, category)) throw maintenanceReviewError("导入草稿类别无效");
    const locked = snapshot ? { chapter: snapshot.chapter, title: snapshot.title, category: snapshot.category, reportExplanation: snapshot.workScope, standardHours: snapshot.standardHours } : {};
    for (const [key, value] of Object.entries(locked)) {
      if (raw[key] !== undefined && String(raw[key]) !== String(value)) throw maintenanceReviewError("已收录标准字段已锁定，请重新选择标准", 409);
    }
    const allowedRoles = new Set(category === "拖机" ? ["主做"] : maintenanceSubtaskRoles);
    return {
      clientId: String(raw?.clientId || randomId("mtnrditem")).slice(0, 120),
      chapter: String(raw?.chapter || raw?.cardNo || "").slice(0, 200),
      title: String(raw?.title || "").slice(0, 500),
      category,
      standardHours: raw?.standardHours === "" || raw?.standardHours === null || raw?.standardHours === undefined ? "" : Number(raw.standardHours),
      reportExplanation: String(raw?.reportExplanation || raw?.content || "").slice(0, 4000),
      entries: (Array.isArray(raw?.entries) ? raw.entries : [])
        .map(entry => ({ role: normalizeMaintenanceSubtaskRole(entry?.role), personId: String(entry?.personId || "") }))
        .filter(entry => allowedRoles.has(entry.role) && people.has(entry.personId))
        .filter((entry, index, entries) => entries.findIndex(item => item.role === entry.role && item.personId === entry.personId) === index),
      ...locked,
      ...(source ? {
        sourceFingerprint: source.fingerprint, sourceKind:source.kind, manualManaged:source.kind==='MANUAL', importedUnlisted: !snapshot,
        standardId: snapshot?.id || "", standardVersion: snapshot?.version ?? null, standardSnapshot: snapshot
      } : {})
    };
  });
  if (new Set(items.map(item => item.clientId)).size !== items.length) throw maintenanceReviewError("草稿单项标识重复，请刷新后重试", 409);
  const existing = json(db.prepare("select payload_json from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").get(flightId)?.payload_json, {});
  return { items, ...(existing.participantDrafts ? { participantDrafts: existing.participantDrafts } : {}) };
}

function assertMaintenanceNonroutineDraftAccess(flightId, user) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceDispatchError("未找到维修机会");
  if (!maintenanceCanSubmitReport(user, flightId)) throw maintenanceDispatchError("只有该维修机会的派工人员可以编辑非例行草稿");
  if (["待复核", "已确认"].includes(flight.status)) throw maintenanceReviewError("当前维修机会已进入复核，不能编辑非例行草稿", 409);
  if (db.prepare("select 1 from maintenance_subtasks where flight_id=? limit 1").get(flightId) &&
      !maintenanceSourceRows(flightId).some(source=>source.state==='ACTIVE')&&!maintenanceManualSubmissionEnabled()) {
    throw maintenanceReviewError("当前维修机会已经存在正式非例行，请刷新后使用非例行报工", 409);
  }
  if (db.prepare("select 1 from maintenance_report_batches where flight_id=? and report_type='nonroutine' limit 1").get(flightId)) throw maintenanceReviewError("非例行已经提报，不能继续编辑草稿", 409);
  return flight;
}

function assertMaintenanceNonroutineDraftPermission(flightId, user) {
  const current = db.prepare("select 1 from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").get(flightId);
  const permission = current ? "maintenance.nonroutine.update.own" : "maintenance.nonroutine.create.own";
  if (!hasRbac(user, permission)) throw Object.assign(new Error(current ? "当前账号没有修改本人非例行的权限" : "当前账号没有新增本人非例行的权限"), { status: 403, permission });
}

function assertMaintenanceNonroutineChangePermissions(flightId, payload, user) {
  const existing = new Set(db.prepare("select id from maintenance_subtasks where flight_id=?").all(flightId).map(row => row.id));
  const incoming = Array.isArray(payload?.items) ? payload.items : [];
  const incomingExisting = new Set(incoming.map(item => String(item?.id || "")).filter(id => existing.has(id)));
  const creates = incoming.some(item => !existing.has(String(item?.id || "")));
  const updates = incomingExisting.size > 0;
  const deletes = [...existing].some(id => !incomingExisting.has(id));
  const required = [
    creates && ["maintenance.nonroutine.create.own", "新增本人非例行"],
    updates && ["maintenance.nonroutine.update.own", "修改本人非例行"],
    deletes && ["maintenance.nonroutine.delete.own", "删除本人非例行"]
  ].filter(Boolean);
  for (const [permission, label] of required) if (!hasRbac(user, permission)) throw Object.assign(new Error(`当前账号没有${label}的权限`), { status: 403, permission });
}

function reconcileMaintenanceDraftSources(flightId, previousItems, nextItems, user) {
  if (!Array.isArray(previousItems)) throw maintenanceReviewError("原草稿结构异常，请人工核对后重试", 409);
  const previousIds = new Set(previousItems.map(item => item?.clientId).filter(Boolean));
  if (previousIds.size === previousItems.length && nextItems.some(item => !previousIds.has(item.clientId)) &&
      !hasRbac(user, "maintenance.nonroutine.create.own")) {
    throw Object.assign(new Error("当前账号没有新增本人非例行草稿的权限"), { status: 403 });
  }
  const nextIds = new Set(nextItems.map(item => item.clientId));
  const sources = maintenanceSourceRows(flightId);
  if (sources.some(source => nextIds.has(source.client_id) && source.state !== "ACTIVE")) {
    throw maintenanceReviewError("该来源草稿已删除或已提报，不能通过旧请求恢复", 409);
  }
  const removedIds = new Set(previousItems.map(item => item.clientId).filter(id => id && !nextIds.has(id)));
  if (removedIds.size && !hasRbac(user, "maintenance.nonroutine.delete.own")) {
    throw Object.assign(new Error("当前账号没有删除本人非例行草稿的权限"), { status: 403 });
  }
  for (const source of sources) {
    if (!removedIds.has(source.client_id) || source.state !== "ACTIVE") continue;
    writeMaintenanceSourceState(source,'DELETED');
  }
}

function currentMaintenanceReportMutationActor(user) {
  const current = currentMaintenanceReviewActor(user);
  if (!current || !maintenanceCanExecute(current, true)) throw maintenanceReviewError("当前账户、人员资格或报工提交权限已失效", 403);
  return current;
}

function persistMaintenanceNonroutineDraft(flightId,payload,user){
    user = currentMaintenanceReportMutationActor(user);
    assertMaintenanceNonroutineDraftAccess(flightId, user);
    assertMaintenanceNonroutineDraftPermission(flightId, user);
    const current = db.prepare("select * from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").get(flightId);
    const expectedVersion = payload?.version;
    if (current && Number(expectedVersion) !== Number(current.version || 1)) throw maintenanceReviewError("草稿已被其他人员更新，请刷新后重试", 409);
    if (!current && expectedVersion !== null && expectedVersion !== undefined && Number(expectedVersion) !== 0) throw maintenanceReviewError("草稿版本已变化，请刷新后重试", 409);
    const normalized = normalizeMaintenanceNonroutineDraft(flightId, payload, user);
    const previousItems = current ? json(current.payload_json, {}).items || [] : [];
    reconcileMaintenanceDraftSources(flightId, previousItems, normalized.items, user);
    const version = writeMaintenanceReportDraft(flightId, "nonroutine", normalized, user, current);
    maintenanceLog(user, "save_nonroutine_draft", "flight", flightId, flightId, JSON.stringify({ version, itemCount: normalized.items.length }));
    return maintenanceReportDraft(flightId, "nonroutine");
}
function saveMaintenanceNonroutineDraft(flightId,payload,user){return maintenanceTransaction(()=>persistMaintenanceNonroutineDraft(flightId,payload,user),flightId);}

function deleteMaintenanceNonroutineDraft(flightId, payload, user, itemClientId = null) {
  return maintenanceTransaction(() => {
    user = currentMaintenanceReportMutationActor(user);
    if (!hasRbac(user,"maintenance.nonroutine.delete.own")) throw maintenanceReviewError("当前账号没有删除本人非例行草稿的权限",403);
    const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
    if (!flight) throw maintenanceDispatchError("未找到维修机会");
    if (!maintenanceCanSubmitReport(user, flightId)) throw maintenanceDispatchError("只有该维修机会的派工人员可以删除非例行草稿");
    if (["待复核", "已确认"].includes(flight.status)) throw maintenanceReviewError("当前维修机会已进入复核，不能删除非例行草稿", 409);
    if (maintenanceReportBatch(flightId, "nonroutine")) throw maintenanceReviewError("非例行已经提报，不能删除草稿", 409);
    const current = db.prepare("select * from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").get(flightId);
    if (!current && itemClientId !== null) throw maintenanceReviewError("未找到该草稿单项", 404);
    if (!current) return false;
    if (Number(payload?.version) !== Number(current.version || 1)) throw maintenanceReviewError("草稿已被其他人员更新，请刷新后重试", 409);
    rememberMaintenanceDraftVersion(flightId, "nonroutine", Number(current.version || 1));
    if (itemClientId !== null) {
      const draft = JSON.parse(current.payload_json);
      const items = Array.isArray(draft.items) ? draft.items : [];
      const matches = items.filter(item => item.clientId === itemClientId);
      if (matches.length !== 1) throw maintenanceReviewError(matches.length ? "草稿单项标识重复，请人工核对" : "未找到该草稿单项", 409);
      const remaining = items.filter(item => item.clientId !== itemClientId);
      reconcileMaintenanceDraftSources(flightId, items, remaining, user);
      if (remaining.length || draft.participantDrafts?.length) writeMaintenanceReportDraft(flightId, "nonroutine", { ...draft, items: remaining }, user, current);
      else db.prepare("delete from maintenance_report_drafts where id=?").run(current.id);
      maintenanceLog(user, "delete_nonroutine_draft_item", "flight", flightId, flightId, JSON.stringify({
        clientId: itemClientId, version: Number(current.version || 1), item: matches[0]
      }));
      return true;
    }
    reconcileMaintenanceDraftSources(flightId, json(current.payload_json, {}).items || [], [], user);
    db.prepare("delete from maintenance_report_drafts where id=?").run(current.id);
    maintenanceLog(user, "delete_nonroutine_draft", "flight", flightId, flightId, JSON.stringify({
      version: Number(current.version || 1),
      payload: current.payload_json || "{}"
    }));
    return true;
  }, flightId);
}

function validateMaintenanceReleaseSelection(flightId, requestedUserId, user) {
  const release = db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=? and role='放行'").get(flightId);
  if (!release) throw maintenanceDispatchError("当前维修机会尚未派工放行人员");
  const releaseBatch = maintenanceReportBatch(flightId, "release");
  const requested = String(requestedUserId || release.person_id).trim();
  if (releaseBatch) {
    const lockedUserId = String(releaseBatch.entries.find(item => item.role === "放行")?.personId || release.person_id);
    if (requested && requested !== lockedUserId) throw maintenanceReviewError("放行架次已提报，放行人员已锁定", 409);
    return lockedUserId;
  }
  if (!requested || requested === release.person_id) return release.person_id;
  if (release.person_id !== user.personId) throw maintenanceDispatchError("只有当前放行人员可以调整放行归属");
  const person = maintenanceReportPeople(flightId).find(item => item.id === requested);
  if (!person) throw maintenanceDispatchError("新的放行人员不存在或已停用");
  return person.id;
}

function saveMaintenanceRoutineDraft(flightId, payload, user) {
  return maintenanceTransaction(() => {
  user=currentMaintenanceReviewActor(user);
  if(!user||!maintenanceCanExecute(user,true))throw maintenanceReviewError('当前报工人员身份或提交权限已失效',403);
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceDispatchError("未找到维修机会");
  if (!maintenanceCanSubmitReport(user, flightId)) throw maintenanceDispatchError("只有该维修机会的派工人员可以保存例行草稿");
  if (["待复核", "已确认"].includes(flight.status)) throw maintenanceReviewError("当前维修机会已进入复核，不能调整例行草稿", 409);
  if (maintenanceReportBatch(flightId, "routine")) throw maintenanceReviewError("例行报工已经提报，不能继续调整人员", 409);
  const current = db.prepare("select * from maintenance_report_drafts where flight_id=? and report_type='routine'").get(flightId);
  const expectedVersion = payload?.version;
  if (current && Number(expectedVersion) !== Number(current.version || 1)) throw maintenanceReviewError("例行未提报数据已被其他人员更新，请刷新后重试", 409);
  if (!current && expectedVersion !== null && expectedVersion !== undefined && Number(expectedVersion) !== 0) throw maintenanceReviewError("例行未提报数据版本已变化，请刷新后重试", 409);
    const releasePersonId = validateMaintenanceReleaseSelection(flightId, payload?.releasePersonId, user);
    const roles = maintenanceRolesForOpportunity(flight.work_kind || flight.work_type).filter(role => role !== "放行");
    const reportEntries = normalizeMaintenanceReportEntries(payload?.entries, roles, {
      ownerType: "flight",
      ownerId: flightId,
      standardHours: maintenanceBaseHours("flight", flight),
      source: "例行草稿保存"
    });
    if (db.prepare("select 1 from maintenance_assignments where owner_type='flight' and owner_id=? and role<>'放行' and status in ('已提报','待复核','已确认') limit 1").get(flightId)) throw maintenanceReviewError("例行工作已经提报，不能通过草稿调整人员",409);
    const entries = reportEntries.map(item => ({ role: item.role, personId: item.person.id }));
    const normalized = {
      entries,
      feedback: String(payload?.feedback || "").slice(0, 4000),
      releasePersonId
    };
    const version = writeMaintenanceReportDraft(flightId, "routine", normalized, user, current);
    maintenanceLog(user, "save_routine_draft", "flight", flightId, flightId, JSON.stringify({
      version,
      entryCount: entries.length,
      releasePersonId,
      dispatchUnchanged: true
    }));
    return {
      draft: maintenanceReportDraft(flightId, "routine"),
      flight: publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId))
    };
  }, flightId);
}

function assertMaintenanceReportDraftVersion(flightId, reportType, expectedVersion) {
  const current = db.prepare("select version from maintenance_report_drafts where flight_id=? and report_type=?").get(flightId, reportType);
  if (!current) return;
  if (Number(expectedVersion) !== Number(current.version || 1)) throw maintenanceReviewError("共享草稿已被其他人员更新，请刷新后重试", 409);
}

function retainMaintenanceReportSource(batchId, user, mode = 'FIRST_OBSERVATION') {
  const batch=db.prepare('select * from maintenance_report_batches where id=?').get(batchId);
  if(!batch || !['已提报','待复核','已确认'].includes(batch.status) || Number(batch.version)<1)return null;
  const actor=currentMaintenanceReviewActor(user || requestUser());
  if(!actor || !hasAnyRbac(actor,['maintenance.execute.submit','maintenance.review.submit','maintenance.archive.modify','maintenance.content.manage','maintenance.opportunity.delete']))throw maintenanceReviewError('当前报工来源留存资格已失效',403);
  const existing=db.prepare('select * from maintenance_report_source_journal where batch_id=? and batch_version=?').get(batch.id,batch.version);
  if(existing){
    const snapshot=json(existing.snapshot_json,null);
    if(!snapshot || crypto.createHash('sha256').update(existing.snapshot_json).digest('hex')!==existing.snapshot_sha256 || snapshot.batchId!==batch.id || snapshot.flightId!==batch.flight_id || snapshot.version!==Number(batch.version) || snapshot.reportType!==batch.report_type)throw maintenanceReviewError('原报工来源档案无法核验',409);
    // A version already observed is retained, never replaced by in-flight edits.
    return existing.id;
  }
  return createReportSourceJournal({db,transaction:callback=>callback(),authorize:()=>({accountId:actor.id,personId:actor.personId,permissions:actor.rbacPermissions,scopes:actor.dataScopes,purpose:'ORIGINAL_REPORT_LIFECYCLE'}),clock:now,randomId}).capture(batch.id,actor,{mode,reason:mode==='AT_WRITE'?'原正式报工版本形成时留存':'原正式报工版本修订前首次观察'}).id;
}

function retainMaintenanceReportSourcesForFlight(flightId,user) {
  for(const batch of db.prepare('select id from maintenance_report_batches where flight_id=? order by id').all(flightId))retainMaintenanceReportSource(batch.id,user);
}

function upsertMaintenanceReportBatch(flightId, reportType, { status = "已提报", feedback = "", user = null, entries = [], expectedVersion = null } = {}) {
  if (!maintenanceReportTypes.includes(reportType)) throw maintenanceDispatchError("无效的报工类别");
  const current = db.prepare("select * from maintenance_report_batches where flight_id=? and report_type=?").get(flightId, reportType);
  if (current && expectedVersion !== null && Number(current.version || 0) !== Number(expectedVersion)) throw maintenanceReviewError("报工数据已被其他人员更新，请刷新后重试", 409);
  if (current && ["已提报", "待复核", "已确认"].includes(current.status) && status === "已提报") throw maintenanceReviewError("该类别已经提报，不能重复提交", 409);
  if(current)retainMaintenanceReportSource(current.id,user);
  const stamp = now();
  const id = current?.id || randomId("mtnrb");
  db.prepare(`insert into maintenance_report_batches(id,flight_id,report_type,status,feedback,version,submitted_by,submitted_by_name,submitted_at,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?) on conflict(flight_id,report_type) do update set status=excluded.status,feedback=excluded.feedback,version=maintenance_report_batches.version+1,submitted_by=excluded.submitted_by,submitted_by_name=excluded.submitted_by_name,submitted_at=excluded.submitted_at,updated_at=excluded.updated_at`)
    .run(id, flightId, reportType, status, feedback, current ? Number(current.version || 0) + 1 : 1, user?.id || current?.submitted_by || "", user?.name || current?.submitted_by_name || "", user ? stamp : current?.submitted_at || "", current?.created_at || stamp, stamp);
  db.prepare("delete from maintenance_report_entries where batch_id=?").run(id);
  const insert = db.prepare(`insert into maintenance_report_entries(id,batch_id,flight_id,owner_type,owner_id,role,person_id,user_name,team,standard_hours,source,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const entry of entries) insert.run(randomId("mtnre"), id, flightId, entry.ownerType, entry.ownerId, entry.role, entry.person.id, entry.person.name, entry.person.team || "未设置", (entry.standardHours === null ? null : Number(entry.standardHours || 0)), entry.source || "报工补录", stamp, stamp);
  retainMaintenanceReportSource(id,user,'AT_WRITE');
  return maintenanceReportBatch(flightId, reportType);
}

function replaceMaintenanceReportEntries(batchId, flightId, entries, { feedback, user = null } = {}) {
  retainMaintenanceReportSource(batchId,user);
  const stamp = now();
  db.prepare("delete from maintenance_report_entries where batch_id=?").run(batchId);
  const insert = db.prepare(`insert into maintenance_report_entries(id,batch_id,flight_id,owner_type,owner_id,role,person_id,user_name,team,standard_hours,source,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const entry of entries) insert.run(randomId("mtnre"), batchId, flightId, entry.ownerType, entry.ownerId, entry.role, entry.person.id, entry.person.name, entry.person.team || "未设置", (entry.standardHours === null ? null : Number(entry.standardHours || 0)), entry.source || "报工确认调整", stamp, stamp);
  if (feedback === undefined) {
    db.prepare("update maintenance_report_batches set version=version+1,updated_at=? where id=?").run(stamp, batchId);
  } else {
    db.prepare("update maintenance_report_batches set feedback=?,version=version+1,updated_at=? where id=?").run(String(feedback), stamp, batchId);
  }
  retainMaintenanceReportSource(batchId,user,'AT_WRITE');
}

function maintenanceTaskTreeAssignments(flightId) {
  return db.prepare("select * from maintenance_assignments where flight_id=? order by owner_type,owner_id,role,user_name").all(flightId);
}

function maintenanceCanSubmitReport(user, flightId) {
  return maintenanceTaskTreeAssignments(flightId).some(row => row.person_id === user.personId);
}

function maintenanceModuleShadowEnabled() {
  return process.env.MUC_MAINTENANCE_MODULE_SHADOW_ENABLED === "1";
}
function maintenanceCoordinatorEnabled(){return process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED==='1';}
function maintenanceGateEvaluationEnabled(){return maintenanceModuleShadowEnabled()||maintenanceCoordinatorEnabled();}

function recordMaintenanceCoordinatorDecision(flight,action,decision,actor){
  if(!maintenanceCoordinatorEnabled()||!decision?.allowed)return;
  maintenanceLog(actor||{id:'',name:'系统状态核对'},'coordinator_transition','flight',flight.id,flight.id,JSON.stringify({action,from:flight.status,to:decision.targetStatus,gateRuleVersion:decision.gateRuleVersion,identitySource:decision.identitySource,ruleSnapshotSha256:decision.ruleSnapshotSha256,moduleInstanceIds:decision.moduleInstanceIds,predicates:decision.predicates,actorQualification:actor?{accountId:actor.id,personId:actor.personId,permissions:actor.rbacPermissions,scopes:actor.dataScopes}:null}),{touch:false});
}

function observeMaintenanceTransition(flight, progress, action, actual, facts = {}) {
  if (!maintenanceGateEvaluationEnabled()) return;
  if(!flight||!progress){if(maintenanceCoordinatorEnabled())throw maintenanceReviewError('维修状态快照缺失，请核对后重试',409);return;}
  try {
    progress = typeof progress === "function" ? progress() : progress;
    if (!progress){if(maintenanceCoordinatorEnabled())throw maintenanceReviewError('维修状态快照缺失，请核对后重试',409);return;}
    const modules = readPersistedMaintenanceReportModules(db, flight.id, progress);
    const snapshot={
      currentStatus: flight.status,
      finalized: Boolean(flight.report_finalized_at),
      hasNonroutineDraft: progress.hasNonroutineDraft,
      hasFormalNonroutine: progress.hasFormalNonroutine,
      workKind: flight.work_kind || flight.work_type,
      modules,
      ...facts
    };
    const predicted=maintenanceCoordinatorEnabled()?coordinateMaintenanceTransition(snapshot,action,actual):evaluateMaintenanceTransition(snapshot,action);
    const match = typeof actual === "string" ? predicted.targetStatus === actual : predicted.allowed === actual;
    if (!match) {
      console.warn(JSON.stringify({
        type: "maintenance_transition_shadow_mismatch",
        action, opportunityId: flight.id, ruleVersion: predicted.gateRuleVersion,
        actual, predicted: typeof actual === "string" ? predicted.targetStatus : predicted.allowed
      }));
    }
    return maintenanceCoordinatorEnabled()?{...predicted,identitySource:modules[0]?.identitySource||'LEGACY_ADAPTER',ruleSnapshotSha256:modules[0]?.ruleSnapshotSha256||null}:undefined;
  } catch(error) {
    if(maintenanceCoordinatorEnabled())throw maintenanceReviewError(error.code==='MAINTENANCE_COORDINATOR_MISMATCH'?error.message:'维修状态规则或模块来源无法核验，请核对后重试',409);
    console.warn(JSON.stringify({ type: "maintenance_transition_shadow_error", action, opportunityId: flight.id }));
  }
}

function maintenanceReportProgress(flightId) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) return null;
  const hasFormalNonroutine = !!db.prepare("select 1 from maintenance_subtasks where flight_id=? limit 1").get(flightId);
  const nonroutineDraft = maintenanceReportDraft(flightId, "nonroutine");
  const hasNonroutineDraft = Boolean(nonroutineDraft?.items?.length);
  const hasNonroutine = hasFormalNonroutine || hasNonroutineDraft;
  const hasRoutine = maintenanceRolesForOpportunity(flight.work_kind || flight.work_type || "其他").some(role => role !== "放行");
  const batchMap = new Map(maintenanceReportTypes.map(type => [type, maintenanceReportBatch(flightId, type)]));
  const submitted = type => ["已提报", "待复核", "已确认"].includes(batchMap.get(type)?.status || "");
  const segments = [
    { type: "release", label: "放行", status: submitted("release") ? "已提报" : "未提报", color: "#B9E6FF", required: true },
    { type: "routine", label: "例行", status: hasRoutine ? (submitted("routine") ? "已提报" : "未提报") : "无需报工", color: "#C7EFCF", required: hasRoutine }
  ];
  if (hasNonroutine) segments.push({ type: "nonroutine", label: "非例行", status: submitted("nonroutine") && !hasNonroutineDraft ? "已提报" : "未提报", color: "#C7EFCF", required: true });
  const ready = segments.every(item => item.status === "已提报" || item.status === "无需报工");
  const anySubmitted = segments.some(item => item.status === "已提报");
  return {
    hasNonroutine,
    hasFormalNonroutine,
    hasNonroutineDraft,
    hasRoutine,
    ready,
    anySubmitted,
    segments,
    batches: Object.fromEntries(maintenanceReportTypes.map(type => [type, batchMap.get(type)]))
  };
}

function maintenanceNonroutineDraftSummary(draftRow, people, {includeExplanation=false}={}) {
  let nonroutineDraft = null;
  if (draftRow) {
    let payload = {};
    try { payload = JSON.parse(draftRow.payload_json || "{}"); } catch {}
    nonroutineDraft = {
      id: draftRow.id,
      flightId: draftRow.flight_id,
      reportType: draftRow.report_type,
      items: (Array.isArray(payload.items) ? payload.items : []).map(item => ({
        id: String(item?.id || ""),
        chapter: String(item?.chapter || item?.cardNo || ""),
        title: String(item?.title || ""),
        category: maintenanceNonroutineCategories.includes(String(item?.category || "")) ? String(item.category) : "其他",
        standardHours: Number(item?.standardHours || 0),
        reportExplanation: includeExplanation?String(item?.reportExplanation||item?.content||""):"",
        entries: (item?.entries || []).map(entry => ({
          role: String(entry?.role || ""),
          personId: String(entry?.personId || ""),
          userName: people.get(entry.personId)?.name || "",
          team: people.get(entry.personId)?.team || "未设置"
        }))
      })),
      version: Number(draftRow.version || 1),
      updatedBy: draftRow.updated_by || "",
      updatedByName: draftRow.updated_by_name || "",
      updatedAt: draftRow.updated_at || ""
    };
  }
  return nonroutineDraft;
}

function publicMaintenanceNonroutineDraft(flightId) {
  const draft = maintenanceReportDraft(flightId, "nonroutine");
  if (!draft) return null;
  const people = new Map(allPeople().map(person => [person.id, person]));
  return {
    ...draft,
    items: draft.items.map(item => ({
      ...item,
      entries: (item.entries || []).map(entry => {
        const person = people.get(entry.personId);
        return {
          ...entry,
          userName: person?.name || "",
          team: person?.team || "未设置"
        };
      })
    }))
  };
}

function publicMaintenanceSubtask(row) {
  const hourAssessment = maintenanceNonroutineHourAssessment(row);
  return {
    id: row.id,
    flightId: row.flight_id,
    externalWorkNo: row.external_work_no || "",
    cardNo: row.card_no || "",
    title: row.title || "",
    content: row.content || "",
    category: row.category || "",
    standardHours: hourAssessment ? hourAssessment.effectiveHours : Number(row.standard_hours || 0),
    hourAssessment,
    priority: row.priority || "普通",
    status: row.status || "未派工",
    remark: row.remark || "",
    assignments: maintenanceAssignments("subtask", row.id),
    hours: maintenanceHours("subtask", row.id),
    sorties: maintenanceSorties("subtask", row.id),
    createdBy: row.created_by || "",
    updatedBy: row.updated_by || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicMaintenanceFlight(row) {
  const subtasks = db.prepare("select * from maintenance_subtasks where flight_id=? order by created_at").all(row.id).map(publicMaintenanceSubtask);
  return {
    id: row.id,
    date: row.date || "",
    flightNo: row.flight_no || "",
    departureFlightNo: row.departure_flight_no || "",
    aircraftNo: row.aircraft_no || "",
    aircraftType: row.aircraft_type || "",
    routineHoursRule: maintenanceAircraftResolution(row),
    stand: row.stand || "",
    locationId: row.location_id || "",
    locationName: maintenanceLocationName(row),
    plannedArrival: row.planned_arrival || "",
    plannedDeparture: row.planned_departure || "",
    workType: row.work_type || "",
    cardNo: row.card_no || "",
    cardName: row.card_name || "",
    workKind: row.work_kind || "",
    standardHours: Number(row.standard_hours || 0),
    status: row.status || "未派工",
    remark: row.remark || "",
    source: row.source || "",
    assignments: maintenanceAssignments("flight", row.id),
    reportProgress: maintenanceReportProgress(row.id),
    nonroutineDraft: publicMaintenanceNonroutineDraft(row.id),
    reportFinalizedBy: row.report_finalized_by || "",
    reportFinalizedByName: row.report_finalized_by_name || "",
    reportFinalizedAt: row.report_finalized_at || "",
    reportFinalizationMode: row.report_finalized_mode || "manual",
    archivedAt: row.archived_at || "",
    hours: maintenanceHours("flight", row.id),
    sorties: maintenanceSorties("flight", row.id),
    subtasks,
    createdBy: row.created_by || "",
    updatedBy: row.updated_by || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicMaintenanceExecutionView(flight, user) {
  const mainMine = flight.assignments.filter(assignment => assignment.personId === user.personId);
  const activeStatuses = new Set(["已派工", "已提报"]);
  const isActive = assignment => activeStatuses.has(assignment.status);
  const isMine = assignment => assignment.personId === user.personId && isActive(assignment);
  const activeMainMine = mainMine.filter(isActive);
  const activeSubtaskMine = flight.subtasks.flatMap(item => item.assignments.filter(isMine));
  const personalRoutineAndNonroutine = [
    ...activeMainMine.filter(assignment => assignment.role !== "放行"),
    ...activeSubtaskMine
  ];
  const personalAssignments = [...activeMainMine, ...activeSubtaskMine];
  const mainVisible = activeStatuses.has(flight.status) && activeMainMine.length > 0;
  const hasSubtaskMine = flight.subtasks.some(item => item.assignments.some(isMine));
  const hasPersonalWork = personalAssignments.length > 0;
  const allAssignedWorkComplete = hasPersonalWork
    && personalAssignments.every(assignment => assignment.status === "已提报");
  const hasRoutineOrNonroutineWork = personalRoutineAndNonroutine.length > 0;
  const routineAndNonroutineComplete = hasRoutineOrNonroutineWork
    && personalRoutineAndNonroutine.every(assignment => assignment.status === "已提报");
  const overallReady = Boolean(flight.reportProgress?.ready);
  flight.personalReportProgress = {
    hasPersonalWork,
    allAssignedWorkComplete,
    hasRoutineOrNonroutineWork,
    hasPendingWork: personalAssignments.some(assignment => assignment.status === "已派工"),
    routineAndNonroutineComplete,
    overallReady,
    awaitingFinalConfirmation: flight.status === "已提报" && overallReady && !flight.reportFinalizedAt
  };
  return mainVisible || hasSubtaskMine ? flight : null;
}

function publicMaintenanceFlightForExecution(row, user) {
  return publicMaintenanceExecutionView(publicMaintenanceFlight(row), user);
}

function groupedRows(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = typeof key === "function" ? key(row) : row[key];
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return groups;
}

function publicMaintenanceBatch(rows, scope, user) {
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const placeholders = ids.map(() => "?").join(",");
  const subtasks = db.prepare(`select * from maintenance_subtasks where flight_id in (${placeholders}) order by created_at`).all(...ids);
  const assessments = new Map(db.prepare(`select * from maintenance_nonroutine_assessments where flight_id in (${placeholders})`).all(...ids).map(row=>[row.subtask_id,row]));
  subtasks.forEach(item=>{item._nonroutineAssessment=assessments.get(item.id)||null;});
  const assignments = db.prepare(`select * from maintenance_assignments where flight_id in (${placeholders}) order by user_name`).all(...ids);
  const batches = db.prepare(`select * from maintenance_report_batches where flight_id in (${placeholders})`).all(...ids);
  const reportEntries = db.prepare(`select * from maintenance_report_entries where flight_id in (${placeholders}) order by owner_type,owner_id,role,user_name`).all(...ids);
  const drafts = db.prepare(`select * from maintenance_report_drafts where flight_id in (${placeholders}) and report_type='nonroutine'`).all(...ids);
  const subtasksByFlight = groupedRows(subtasks, "flight_id");
  const assignmentsByOwner = groupedRows(assignments, row => `${row.owner_type}:${row.owner_id}`);
  const entriesByBatch = groupedRows(reportEntries, "batch_id");
  const batchesByFlight = groupedRows(batches, "flight_id");
  const draftsByFlight = new Map(drafts.map(row => [row.flight_id, row]));
  const people = new Map(allPeople().map(person => [person.id, person]));

  const publicBatch = row => ({
    id: row.id,
    flightId: row.flight_id,
    reportType: row.report_type,
    status: row.status,
    feedback: row.feedback || "",
    version: Number(row.version || 0),
    submittedBy: row.submitted_by || "",
    submittedByName: row.submitted_by_name || "",
    submittedAt: row.submitted_at || "",
    entries: (entriesByBatch.get(row.id) || []).map(item => ({
      id: item.id,
      ownerType: item.owner_type,
      ownerId: item.owner_id,
      role: item.role,
      personId: item.person_id,
      userName: item.user_name,
      team: item.team || "未设置",
      standardHours: item.standard_hours === null ? null : Number(item.standard_hours || 0),
      source: item.source || ""
    }))
  });

  return rows.map(row => {
    const flightSubtasks = subtasksByFlight.get(row.id) || [];
    const flightBatches = (batchesByFlight.get(row.id) || []).map(publicBatch);
    const batchMap = new Map(flightBatches.map(batch => [batch.reportType, batch]));
    const draftRow = draftsByFlight.get(row.id);
    let nonroutineDraft = null;
    if (draftRow) {
      let payload = {};
      try { payload = JSON.parse(draftRow.payload_json || "{}"); } catch {}
      nonroutineDraft = {
        id: draftRow.id,
        flightId: draftRow.flight_id,
        reportType: draftRow.report_type,
        items: (Array.isArray(payload.items) ? payload.items : []).map(item => ({
          id: String(item?.id || ""),
          clientId: String(item?.clientId || ""),
          chapter: String(item?.chapter || item?.cardNo || ""),
          title: String(item?.title || ""),
          category: item?.sourceFingerprint ? String(item.category || "") : maintenanceNonroutineCategories.includes(String(item?.category || "")) ? String(item.category) : "其他",
          standardHours: item?.sourceFingerprint && item.standardHours === "" ? "" : Number(item?.standardHours || 0),
          sourceFingerprint: item?.sourceFingerprint || "",
          sourceKind:item?.sourceKind||(item?.sourceFingerprint?'IMPORT':'LEGACY'), manualManaged:item?.manualManaged===true,
          importedUnlisted: item?.importedUnlisted === true,
          standardId: item?.standardId || "",
          standardVersion: item?.standardVersion ?? null,
          reportExplanation: "",
          entries: (item?.entries || []).map(entry => ({
            role: String(entry?.role || ""),
            personId: String(entry?.personId || ""),
            userName: people.get(entry.personId)?.name || "",
            team: people.get(entry.personId)?.team || "未设置"
          }))
        })),
        version: Number(draftRow.version || 1),
        updatedBy: draftRow.updated_by || "",
        updatedByName: draftRow.updated_by_name || "",
        updatedAt: draftRow.updated_at || ""
      };
    }
    const hasFormalNonroutine = flightSubtasks.length > 0;
    const hasNonroutineDraft = Boolean(nonroutineDraft?.items?.length);
    const hasNonroutine = hasFormalNonroutine || hasNonroutineDraft;
    const hasRoutine = maintenanceRolesForOpportunity(row.work_kind || row.work_type || "其他").some(role => role !== "放行");
    const submitted = type => ["已提报", "待复核", "已确认"].includes(batchMap.get(type)?.status || "");
    const segments = [
      { type: "release", label: "放行", status: submitted("release") ? "已提报" : "未提报", color: "#B9E6FF", required: true },
      { type: "routine", label: "例行", status: hasRoutine ? (submitted("routine") ? "已提报" : "未提报") : "无需报工", color: "#C7EFCF", required: hasRoutine }
    ];
    if (hasNonroutine) segments.push({ type: "nonroutine", label: "非例行", status: submitted("nonroutine") && !hasNonroutineDraft ? "已提报" : "未提报", color: "#C7EFCF", required: true });
    const reportProgress = {
      hasNonroutine,
      hasFormalNonroutine,
      hasNonroutineDraft,
      hasRoutine,
      ready: segments.every(item => item.status === "已提报" || item.status === "无需报工"),
      anySubmitted: segments.some(item => item.status === "已提报"),
      segments,
      batches: Object.fromEntries(maintenanceReportTypes.map(type => [type, batchMap.get(type) || null]))
    };
    const flight = {
      id: row.id,
      date: row.date || "",
      flightNo: row.flight_no || "",
      departureFlightNo: row.departure_flight_no || "",
      aircraftNo: row.aircraft_no || "",
      aircraftType: row.aircraft_type || "",
      stand: row.stand || "",
      locationId: row.location_id || "",
      locationName: maintenanceLocationName(row),
      plannedArrival: row.planned_arrival || "",
      plannedDeparture: row.planned_departure || "",
      workType: row.work_type || "",
      cardNo: row.card_no || "",
      cardName: row.card_name || "",
      workKind: row.work_kind || "",
      standardHours: Number(row.standard_hours || 0),
      status: row.status || "未派工",
      remark: row.remark || "",
      source: row.source || "",
      assignments: (assignmentsByOwner.get(`flight:${row.id}`) || []).map(publicSummaryAssignment),
      reportProgress,
      nonroutineDraft,
      reportFinalizedBy: row.report_finalized_by || "",
      reportFinalizedByName: row.report_finalized_by_name || "",
      reportFinalizedAt: row.report_finalized_at || "",
      reportFinalizationMode: row.report_finalized_mode || "manual",
      archivedAt: row.archived_at || "",
      hours: [],
      sorties: [],
      subtasks: flightSubtasks.map(item => ({
        id: item.id,
        flightId: item.flight_id,
        cardNo: item.card_no || "",
        title: item.title || "",
        content: "",
        category: item.category || "",
        standardHours: item.standard_hours === null && maintenanceNonroutineAssessment(item) ? null : Number(item.standard_hours || 0),
        hourAssessment: maintenanceNonroutineHourAssessment(item),
        priority: item.priority || "普通",
        status: item.status || "未派工",
        remark: "",
        assignments: (assignmentsByOwner.get(`subtask:${item.id}`) || []).map(publicSummaryAssignment),
        hours: [],
        sorties: [],
        createdBy: item.created_by || "",
        updatedBy: item.updated_by || "",
        createdAt: item.created_at,
        updatedAt: item.updated_at
      })),
      createdBy: row.created_by || "",
      updatedBy: row.updated_by || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      summary: true
    };
    return scope === "execute" ? publicMaintenanceExecutionView(flight, user) : flight;
  }).filter(Boolean);
}

function maintenanceVisibleFlights(user, scope = "dispatch", filters = {}) {
  const conditions = [];
  const params = [];
  if (filters.flightId) { conditions.push("maintenance_flights.id=?"); params.push(filters.flightId); }
  if (!(maintenanceCanManage(user) && scope !== "execute" && scope !== "data")) {
    conditions.push(`exists (select 1 from maintenance_assignments visible_assignment
      where visible_assignment.flight_id=maintenance_flights.id and visible_assignment.person_id=?
      ${scope === "execute" ? "and visible_assignment.status in ('已派工','已提报') and maintenance_flights.status in ('已派工','已提报')" : ""})`);
    params.push(user.personId);
  } else if (!personnelAccess.hasAll(user, "maintenance")) {
    const scoped = personnelAccess.predicate(user, "maintenance", "visible_person");
    const viewerDepartment = maintenanceUserDepartment(user);
    const sharedDepartmentSql = scope === "dispatch" && hasRbac(user, "maintenance.dispatch.view") && (viewerDepartment.id || viewerDepartment.name)
      ? ` or (maintenance_flights.status='未派工' and exists (
          select 1 from users creator_user
          join personnel creator_person on creator_person.id=creator_user.person_id
          where creator_user.id=maintenance_flights.created_by and creator_person.data_status='active'
            and (creator_person.department_id=? or (?='' and coalesce(creator_person.department_id,'')='' and trim(coalesce(creator_person.department,''))=?))
        ))`
      : "";
    conditions.push(`(created_by=? or exists (
      select 1 from maintenance_assignments visible_assignment
      join personnel visible_person on visible_person.id=visible_assignment.person_id
      where visible_assignment.flight_id=maintenance_flights.id and (${scoped.sql})
    )${sharedDepartmentSql})`);
    params.push(user.id, ...scoped.params);
    if (sharedDepartmentSql) params.push(viewerDepartment.id, viewerDepartment.id, viewerDepartment.name);
  }
  if (filters.dateFrom) { conditions.push("date>=?"); params.push(filters.dateFrom); }
  if (filters.dateTo) { conditions.push("date<=?"); params.push(filters.dateTo); }
  if (filters.locationIds?.length) {
    conditions.push(`location_id in (${filters.locationIds.map(() => "?").join(",")})`);
    params.push(...filters.locationIds);
  }
  if (filters.opportunities?.length) {
    conditions.push(`coalesce(nullif(work_kind,''),work_type) in (${filters.opportunities.map(() => "?").join(",")})`);
    params.push(...filters.opportunities);
  }
  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    conditions.push(`(lower(coalesce(flight_no,'')) like ? or lower(coalesce(departure_flight_no,'')) like ? or lower(coalesce(aircraft_no,'')) like ?
      or lower(coalesce(aircraft_type,'')) like ? or lower(coalesce(stand,'')) like ?
      or lower(coalesce(work_kind,'')) like ? or exists (select 1 from maintenance_assignments search_assignment
        where search_assignment.flight_id=maintenance_flights.id and lower(search_assignment.user_name) like ?))`);
    params.push(term, term, term, term, term, term, term);
  }
  const limit = Number.isFinite(filters.limit) ? Math.max(1, Math.min(500, filters.limit)) : 0;
  const offset = limit ? Math.max(0, Number(filters.cursor || 0)) : 0;
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const sql = `select * from maintenance_flights ${where} order by date desc,planned_arrival desc,created_at desc${limit ? " limit ? offset ?" : ""}`;
  const rows = limit ? db.prepare(sql).all(...params, limit + 1, offset) : db.prepare(sql).all(...params);
  const hasMore = limit > 0 && rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, nextCursor: hasMore ? String(offset + limit) : "" };
}

function maintenanceOwner(ownerType, ownerId) {
  if (ownerType === "flight") return db.prepare("select * from maintenance_flights where id=?").get(ownerId);
  if (ownerType === "subtask") return db.prepare("select s.*,f.date,f.flight_no,f.departure_flight_no,f.aircraft_no,f.aircraft_type,f.stand,f.planned_arrival,f.planned_departure,f.work_type,f.work_kind from maintenance_subtasks s join maintenance_flights f on f.id=s.flight_id where s.id=?").get(ownerId);
  return null;
}

function maintenanceLog(user, action, ownerType, ownerId, flightId = "", detail = "", {touch = true} = {}) {
  if (flightId && touch) touchMaintenanceFlight(flightId);
  db.prepare("insert into maintenance_logs(id,owner_type,owner_id,flight_id,user_id,user_name,action,detail,created_at) values(?,?,?,?,?,?,?,?,?)")
    .run(randomId("mtnlog"), ownerType || "", ownerId || "", flightId || "", user?.id || "", user?.name || "", action, detail, now());
}

function maintenanceRoleRatio(role) {
  const row = db.prepare("select value from maintenance_hour_rules where rule_type='roleRatio' and name=?").get(role);
  const value = Number(row?.value);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function maintenanceRoleRatioRule(role) {
  const row = db.prepare("select value from maintenance_hour_rules where rule_type='roleRatio' and name=?").get(role);
  const value = Number(row?.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function maintenanceRoutineRoleRatioRule(opportunity, role) {
  const row = db.prepare("select value from maintenance_hour_rules where rule_type='routineRatio' and name=?")
    .get(maintenanceRoutineRuleName(opportunity || "其他", role));
  const value = Number(row?.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function maintenanceRatioForOwner(ownerType, owner, role, assignments = []) {
  if (ownerType === "subtask" && maintenanceNonroutineAssessment(owner)) return maintenanceRatioRuleForOwner(ownerType,owner,role,assignments) ?? 0;
  if (ownerType === "subtask") return owner?.category === "拖机" ? (normalizeMaintenanceSubtaskRole(role) === "主做" ? 1 : 0)
    : maintenanceRatioRuleForOwner(ownerType, owner, role, assignments) ?? 0;
  return maintenanceRatioRuleForOwner(ownerType, owner, role, assignments) ?? 0;
}

function maintenanceRatioRuleForOwner(ownerType, owner, role, assignments = []) {
  if (ownerType === "subtask") {
    const policy = owner?._nonroutinePolicy || maintenanceNonroutineEffectivePolicy(owner);
    if (policy) {
      if (policy.strategy === "EQUAL") return 1;
      if (policy.strategy !== "ROLE_COMBINATION" || !policy.valid) return null;
      const combination = maintenanceNonroutineCombinationName(assignments.map(item=>normalizeMaintenanceSubtaskRole(item.role)));
      const ratios = policy.combinations ? policy.combinations[combination] : policy.ratios;
      return ratios && Object.hasOwn(ratios,normalizeMaintenanceSubtaskRole(role)) ? ratios[normalizeMaintenanceSubtaskRole(role)] : null;
    }
  }
  const snapshot = ownerType === "flight" ? json(owner?.routine_hours_snapshot, null) : null;
  if (snapshot?.ratios && Object.hasOwn(snapshot.ratios, role)) return snapshot.ratios[role];
  if (ownerType === "subtask" && owner?.category !== "拖机") {
    const combination = maintenanceNonroutineCombinationName(assignments.map(item => normalizeMaintenanceSubtaskRole(item.role)));
    const row = db.prepare("select value from maintenance_hour_rules where rule_type='nonroutineCombinationRatio' and name=?")
      .get(`${combination}::${normalizeMaintenanceSubtaskRole(role)}`);
    const value = Number(row?.value);
    return row && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
  }
  return ownerType === "subtask"
    ? (normalizeMaintenanceSubtaskRole(role) === "主做" ? 1 : null)
    : maintenanceRoutineRoleRatioRule(owner?.work_kind || owner?.work_type || "其他", role);
}

function maintenanceBaseHours(ownerType, owner) {
  if (ownerType === "subtask") {
    if (owner?._nonroutineEstimateBase !== undefined) return owner._nonroutineEstimateBase;
    const assessment = maintenanceNonroutineAssessment(owner);
    if (assessment) return assessment.effective_hours === null ? null : Number(assessment.effective_hours);
    return Number(owner?.standard_hours || 0) || 0;
  }
  return maintenanceAircraftResolution(owner).baseHours;
}

function maintenanceAircraftConfig() {
  return settingValue("maintenance_aircraft_hours_v1", { version: 0, groups: [] });
}

function maintenanceAircraftImpact(config) {
  const current = maintenanceAircraftConfig();
  return db.prepare("select * from maintenance_flights where routine_hours_snapshot is null").all().filter(flight => {
    const left = resolveAircraftHours(current, flight.aircraft_type, flight.work_kind || flight.work_type || "其他");
    const right = resolveAircraftHours(config, flight.aircraft_type, flight.work_kind || flight.work_type || "其他");
    return left.groupId !== right.groupId || left.baseHours !== right.baseHours;
  }).map(flight => ({ id: flight.id, date: flight.date, aircraftType: flight.aircraft_type, flightNo: maintenanceDisplayFlightNo(flight), opportunity: flight.work_kind || flight.work_type }));
}

function maintenanceAircraftResolution(flight) {
  return json(flight?.routine_hours_snapshot, null) || resolveAircraftHours(maintenanceAircraftConfig(), flight?.aircraft_type, flight?.work_kind || flight?.work_type || "其他");
}

function freezeLegacyMaintenanceHours() {
  // Preserve existing reports without allocating old default rules to new groups.
  for (const flight of db.prepare("select * from maintenance_flights where routine_hours_snapshot is null").all()) {
    const entry = db.prepare("select standard_hours from maintenance_report_entries where flight_id=? and owner_type='flight' and role<>'放行' order by created_at limit 1").get(flight.id);
    const reported = entry || db.prepare("select id from maintenance_effective_hour_results where owner_type='flight' and owner_id=? limit 1").get(flight.id);
    if (!reported) continue;
    const opportunity = flight.work_kind || flight.work_type || "其他";
    const oldRule = db.prepare("select value from maintenance_hour_rules where rule_type='workType' and name=?").get(opportunity);
    const ratios = Object.fromEntries(maintenanceRolesForOpportunity(opportunity).filter(role => role !== "放行").map(role => [role, maintenanceRoutineRoleRatioRule(opportunity, role)]));
    const snapshot = { aircraftCode: flight.aircraft_type || "", groupId: "legacy", groupName: "历史规则", opportunity, baseHours: Number(entry?.standard_hours ?? oldRule?.value) || 0, version: 0, ratios, capturedAt: now(), legacy: true };
    db.prepare("update maintenance_flights set routine_hours_snapshot=? where id=?").run(JSON.stringify(snapshot), flight.id);
  }
}

function captureMaintenanceAircraftHours(flight, user) {
  if (flight.routine_hours_snapshot) return;
  const snapshot = maintenanceAircraftResolution(flight);
  if (!(snapshot.baseHours > 0)) throw maintenanceDispatchError(`机型 ${snapshot.aircraftCode || "未填写"} / ${snapshot.opportunity} 未配置有效标准工时，请联系规则管理员`);
  snapshot.ratios = Object.fromEntries(maintenanceRolesForOpportunity(snapshot.opportunity).filter(role => role !== "放行").map(role => [role, maintenanceRoutineRoleRatioRule(snapshot.opportunity, role)]));
  snapshot.capturedAt = now();
  flight.routine_hours_snapshot = JSON.stringify(snapshot);
  db.prepare("update maintenance_flights set routine_hours_snapshot=? where id=?").run(flight.routine_hours_snapshot, flight.id);
  maintenanceLog(user, "routine_hours_snapshot", "flight", flight.id, flight.id, JSON.stringify(snapshot));
}

function maintenanceCalculatedHours(ownerType, owner, assignments) {
  const baseHours = maintenanceBaseHours(ownerType, owner);
  if (baseHours === null) return new Map();
  const policy = ownerType === "subtask" ? owner?._nonroutinePolicy || maintenanceNonroutineEffectivePolicy(owner) : null;
  if (policy && (policy.strategy === "UNDECIDED" || policy.strategy === "ROLE_COMBINATION" && !policy.valid)) return new Map();
  if (policy?.strategy === "ROLE_COMBINATION") {
    const roles = [...new Set(assignments.map(item=>normalizeMaintenanceSubtaskRole(item.role)))];
    const ratios = roles.map(role=>maintenanceRatioRuleForOwner(ownerType,owner,role,assignments));
    if (!roles.length || ratios.some(value=>value===null) || Math.abs(ratios.reduce((sum,value)=>sum+value,0)-1)>1e-8) return new Map();
  }
  if (ownerType === "subtask" && (policy?.strategy === "EQUAL" || !policy && owner?.category === "拖机")) {
    const ordered = [...assignments].sort((a, b) => String(a.assigned_at || "").localeCompare(String(b.assigned_at || "")) || String(a.id).localeCompare(String(b.id)));
    const unique = policy ? ordered.filter((item,index)=>ordered.findIndex(other=>(other.person_id || other.personId || other.person?.id)===(item.person_id || item.personId || item.person?.id))===index) : ordered;
    const totalCents = Math.round(baseHours * 100);
    const baseCents = Math.floor(totalCents / Math.max(1, unique.length));
    let remainder = totalCents - baseCents * unique.length;
    const result = new Map(ordered.map(item=>[item.id,0]));
    for (const item of unique) result.set(item.id,(baseCents+(remainder-- > 0 ? 1 : 0))/100);
    return result;
  }
  if (ownerType === "subtask") {
    const totalCents = Math.round(baseHours * 100);
    const roles = maintenanceNonroutineRoleOrder.filter(role => assignments.some(item => normalizeMaintenanceSubtaskRole(item.role) === role));
    if (!roles.length) return new Map();
    const raw = roles.map(role => totalCents * maintenanceRatioForOwner(ownerType, owner, role, assignments));
    const roleCents = raw.map(Math.floor);
    const order = raw.map((value, index) => ({ index, fraction: value - roleCents[index] }))
      .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
    for (let remaining = totalCents - roleCents.reduce((sum, value) => sum + value, 0), index = 0; remaining > 0; remaining--, index++) roleCents[order[index].index]++;
    const result = new Map();
    roles.forEach((role, index) => {
      const people = assignments.filter(item => normalizeMaintenanceSubtaskRole(item.role) === role)
        .sort((left, right) => String(left.assigned_at || "").localeCompare(String(right.assigned_at || "")) || String(left.id).localeCompare(String(right.id)));
      const shared = Math.floor(roleCents[index] / people.length);
      const remainder = roleCents[index] % people.length;
      people.forEach((item, personIndex) => result.set(item.id, (shared + (personIndex < remainder ? 1 : 0)) / 100));
    });
    return result;
  }
  // Allocate hundredths to all configured roles first, then split each role's
  // budget between its people. Missing roles must not donate hours to others.
  // Ratios are validated to three decimals; integer weights avoid float tie drift.
  const roles = maintenanceRolesForOpportunity(owner?.work_kind || owner?.work_type || "其他").filter(role => role !== "放行");
  const totalCents = Math.round(baseHours * 100);
  const weighted = roles.map(role => totalCents * Math.round((maintenanceRatioForOwner(ownerType, owner, role) || 0) * 1000));
  const roleCents = weighted.map(value => Math.floor(value / 1000));
  const order = weighted.map((value, index) => ({ index, remainder: value % 1000 }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  const targetCents = Math.round(weighted.reduce((sum, value) => sum + value, 0) / 1000);
  for (let remaining = targetCents - roleCents.reduce((sum, value) => sum + value, 0), index = 0; remaining > 0; remaining--, index++) {
    roleCents[order[index].index]++;
  }
  const result = new Map(assignments.map(item => [item.id, 0]));
  roles.forEach((role, index) => {
    const people = assignments.filter(item => item.role === role).sort((left, right) =>
      String(left.person_id || left.personId || left.id).localeCompare(String(right.person_id || right.personId || right.id)) || String(left.id).localeCompare(String(right.id)));
    if (!people.length) return;
    const shared = Math.floor(roleCents[index] / people.length);
    const remainder = roleCents[index] % people.length;
    people.forEach((item, personIndex) => result.set(item.id, (shared + (personIndex < remainder ? 1 : 0)) / 100));
  });
  return result;
}

function updateMaintenanceOwnerStatus(ownerType, ownerId, status, personId = "") {
  const table = ownerType === "flight" ? "maintenance_flights" : "maintenance_subtasks";
  db.prepare(`update ${table} set status=?,updated_by=coalesce(?,updated_by),updated_at=? where id=?`).run(status, personId || "", now(), ownerId);
}

function maintenanceAssignmentsStatus(ownerType, ownerId) {
  if(ownerType==='subtask'){const actual=maintenanceNonroutineParticipantRows(ownerId);if(actual.length && actual[0].sourceType==='REPORT_ENTRY')return actual[0].status;}
  const rows = db.prepare("select status from maintenance_assignments where owner_type=? and owner_id=?").all(ownerType, ownerId);
  if (!rows.length) return "未派工";
  if (rows.some(row => row.status === "已派工")) return "已派工";
  if (rows.every(row => row.status === "已确认")) return "已确认";
  if (rows.every(row => ["待复核", "已确认"].includes(row.status))) return "待复核";
  return "已提报";
}

function maintenanceSubtaskCompletionBlockers(flightId) {
  const blockers = [];
  const subtasks = db.prepare("select id,title from maintenance_subtasks where flight_id=? order by created_at").all(flightId);
  for (const subtask of subtasks) {
    const rows = maintenanceNonroutineParticipantRows(subtask.id);
    const label = `非例行“${subtask.title || "未命名"}”`;
    if (!rows.length) blockers.push(`${label}尚未派工`);
    else if (rows.some(row => row.status === "已派工")) blockers.push(`${label}尚有人员未报工`);
  }
  return blockers;
}

function reconcileMaintenanceTreeStatus(flightId, personId = "", { preserveConfirmed = true } = {}) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) return null;
  const subtasks = db.prepare("select * from maintenance_subtasks where flight_id=? order by created_at").all(flightId);
  const subtaskStatuses = [];
  const subtaskUpdates=[];
  for (const subtask of subtasks) {
    const derived = maintenanceAssignmentsStatus("subtask", subtask.id);
    const target = preserveConfirmed && subtask.status === "已确认" && derived !== "已确认" ? "已确认" : derived;
    if (subtask.status !== target) subtaskUpdates.push({id:subtask.id,target});
    subtaskStatuses.push(target);
  }

  const assignments = db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=?").all(flightId);
  let target = "未派工";
  const progress = assignments.length ? maintenanceReportProgress(flightId) : null;
  const allConfirmed = assignments.every(row => row.status === "已确认") && subtaskStatuses.every(status => status === "已确认");
  if (assignments.length) {
    if (allConfirmed && flight.report_finalized_at) target = "已确认";
    else if (flight.report_finalized_at) target = "待复核";
    else if (progress?.anySubmitted) target = "已提报";
    else target = "已派工";
  }
  if (preserveConfirmed && flight.status === "已确认" && target !== "已确认") target = "已确认";
  const decision=observeMaintenanceTransition(flight, progress ?? (() => maintenanceReportProgress(flightId)), "RECONCILE", target, { preserveConfirmed, hasAssignments: assignments.length > 0, allConfirmed });
  if(decision)target=decision.targetStatus;
  if(flight.status!==target)recordMaintenanceCoordinatorDecision(flight,'RECONCILE',decision,requestUser());
  for(const update of subtaskUpdates)updateMaintenanceOwnerStatus('subtask',update.id,update.target,personId);
  if (flight.status !== target) updateMaintenanceOwnerStatus("flight", flightId, target, personId);
  return target;
}

function reconcileActiveMaintenanceStatuses() {
  const rows = db.prepare("select id from maintenance_flights where status<>'已确认'").all();
  rows.forEach(row => maintenanceCoordinatorEnabled()?maintenanceTransaction(()=>reconcileMaintenanceTreeStatus(row.id,"",{preserveConfirmed:true})):reconcileMaintenanceTreeStatus(row.id,"",{preserveConfirmed:true}));
}

function maintenanceReportResultParticipants(ownerId, reportType, resultStatus, legacyRows) {
  const batch = db.prepare("select * from maintenance_report_batches where flight_id=? and report_type=?").get(ownerId,reportType);
  if (!batch) return legacyRows; // Existing pre-batch history is not reconstructed.
  const entries = db.prepare("select * from maintenance_report_entries where batch_id=? order by id").all(batch.id);
  const source = reportParticipantSource({ batch, entries });
  const resultTable=reportType==='release'?'maintenance_sortie_results':'maintenance_hour_results';
  const results = db.prepare(`select * from ${resultTable} where owner_type='flight' and owner_id=? and status=?`).all(ownerId, resultStatus);
  return source.participants.map(item => {
    const previous = results.find(row => row.person_id === item.personId && row.role === item.role);
    const linked = legacyRows.find(row => row.person_id === item.personId && row.role === item.role);
    return { id: previous?.assignment_id || linked?.id || item.resultIdentity, owner_type: 'flight', owner_id: ownerId, flight_id: ownerId, person_id: item.personId, user_name: item.personNameSnapshot, team: item.teamSnapshot, role: item.role, status: resultStatus };
  });
}

function regenerateMaintenanceHours(ownerType, ownerId, resultStatus = "待复核") {
  const owner = maintenanceOwner(ownerType, ownerId);
  if (!owner) return [];
  if(ownerType==='subtask' && maintenanceNonroutineAdjustmentClosed(owner))return maintenanceHours(ownerType,ownerId);
  if (ownerType === "subtask" && maintenanceNonroutineUnposted(owner)) {
    if (db.prepare("select 1 from maintenance_effective_hour_results where owner_type='subtask' and owner_id=?").get(ownerId)) throw maintenanceReviewError("待审申请存在有效工时，请核对来源",409);
    return [];
  }
  const legacyRows = db.prepare("select * from maintenance_assignments where owner_type=? and owner_id=? and status=? and role<>'放行'").all(ownerType, ownerId, resultStatus);
  const assignments = ownerType === 'flight' ? maintenanceReportResultParticipants(ownerId,'routine',resultStatus,legacyRows) : maintenanceRecognitionAssignments(ownerType,owner,maintenanceNonroutineParticipantRows(ownerId).map(row=>({...row,status:resultStatus})));
  if (ownerType === "flight" && assignments.length) captureMaintenanceAircraftHours(owner, null);
  db.prepare("delete from maintenance_hour_results where owner_type=? and owner_id=? and status=?").run(ownerType, ownerId, resultStatus);
  if (!assignments.length) return maintenanceHours(ownerType, ownerId);
  const insert = db.prepare(`insert into maintenance_hour_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,adjusted_hours,status,confirmed_by,confirmed_at,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    on conflict(owner_type,owner_id,assignment_id) do update set user_name=excluded.user_name,team=excluded.team,role=excluded.role,source=excluded.source,hours=excluded.hours,status=excluded.status,confirmed_by='',confirmed_at='',updated_at=excluded.updated_at`);
  const calculatedHours = maintenanceCalculatedHours(ownerType, owner, assignments);
  if (ownerType === "subtask" && maintenanceNonroutineAssessment(owner) && assignments.some(item=>!calculatedHours.has(item.id))) throw maintenanceReviewError("当前非例行分配输入或冻结规则无法核算，请核对",409);
  if(ownerType==='subtask'&&assignments.some(item=>item.sourceAssignmentId&&item.sourceAssignmentId!==item.id)){
    maintenanceWriteRecognitionRoleResults(owner,assignments,calculatedHours,{status:resultStatus});return maintenanceHours(ownerType,ownerId);
  }
  for (const item of assignments) {
    insert.run(randomId("mtnh"), ownerType, ownerId, item.flight_id || owner.flight_id || owner.id, item.id, item.person_id, item.user_name, item.team || "", item.role, ownerType === "subtask" ? "非例行" : "维修机会", calculatedHours.get(item.id) || 0, null, resultStatus, "", "", now(), now());
  }
  return maintenanceHours(ownerType, ownerId);
}

function regenerateMaintenanceSorties(ownerType, ownerId, resultStatus = "待复核") {
  const owner = maintenanceOwner(ownerType, ownerId);
  if (!owner) return [];
  const legacyRows = db.prepare("select * from maintenance_assignments where owner_type=? and owner_id=? and status=? and role='放行'").all(ownerType, ownerId, resultStatus);
  const assignments = ownerType==='flight' ? maintenanceReportResultParticipants(ownerId,'release',resultStatus,legacyRows) : legacyRows;
  db.prepare("delete from maintenance_sortie_results where owner_type=? and owner_id=? and status=?").run(ownerType, ownerId, resultStatus);
  const insert = db.prepare(`insert into maintenance_sortie_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,sorties,status,confirmed_by,confirmed_at,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(owner_type,owner_id,assignment_id) do update set user_name=excluded.user_name,team=excluded.team,sorties=1,status=excluded.status,confirmed_by='',confirmed_at='',updated_at=excluded.updated_at`);
  for (const item of assignments) {
    insert.run(randomId("mtnsrt"), ownerType, ownerId, item.flight_id || owner.flight_id || owner.id, item.id, item.person_id, item.user_name, item.team || "", "放行", "放行架次", 1, resultStatus, "", "", now(), now());
  }
  return maintenanceSorties(ownerType, ownerId);
}

function regenerateMaintenanceResults(ownerType, ownerId, resultStatus = "待复核") {
  regenerateMaintenanceHours(ownerType, ownerId, resultStatus);
  regenerateMaintenanceSorties(ownerType, ownerId, resultStatus);
}

function maintenanceReviewSnapshot(flightId) {
  const owners = [
    { ownerType: "flight", ownerId: flightId },
    ...db.prepare("select id from maintenance_subtasks where flight_id=? order by created_at").all(flightId).map(row => ({ ownerType: "subtask", ownerId: row.id }))
  ];
  return owners.map(({ ownerType, ownerId }) => {
    const owner = maintenanceOwner(ownerType, ownerId);
    return {
      ownerType,
      ownerId,
      status: owner?.status || "未派工",
      task: ownerType === "flight" ? {
        date: owner?.date || "",
        flightNo: owner?.flight_no || "",
        aircraftNo: owner?.aircraft_no || "",
        aircraftType: owner?.aircraft_type || "",
        stand: owner?.stand || "",
        opportunity: owner?.work_kind || owner?.work_type || "",
        archivedAt: owner?.archived_at || "",
        routineElectronicSigned: owner?.routine_electronic_signed == null ? null : Boolean(owner.routine_electronic_signed),
        nonroutineElectronicSigned: owner?.nonroutine_electronic_signed == null ? null : Boolean(owner.nonroutine_electronic_signed)
      } : {
        chapter: owner?.card_no || "",
        title: owner?.title || "",
        category: owner?.category || "",
        standardHours: owner?.standard_hours === null ? null : Number(owner?.standard_hours || 0),
        reportExplanation: owner?.content || ""
      },
      assignments: maintenanceAssignments(ownerType, ownerId).map(row => ({ personId: row.personId, userName: row.userName, team: row.team, role: row.role, status: row.status, feedback: row.feedback, submittedAt: row.submittedAt })),
      reportedParticipants: maintenanceReviewParticipantRows(ownerType,ownerId).map(row=>({sourceId:row.id,personId:row.person_id,userName:row.user_name,team:row.team,role:row.role,status:row.status})),
      reportVersions: ownerType === 'flight' ? db.prepare('select id,report_type,version from maintenance_report_batches where flight_id=? order by report_type').all(ownerId) : [],
      hours: maintenanceHours(ownerType, ownerId).map(row => ({ personId: row.personId, role: row.role, hours: row.hours, adjustedHours: row.adjustedHours, finalHours: row.finalHours, status: row.status })),
      sorties: maintenanceSorties(ownerType, ownerId).map(row => ({ personId: row.personId, role: row.role, sorties: row.sorties, status: row.status }))
    };
  });
}

function maintenanceReviewExistingResult(results, assignment, ownerType) {
  const direct = results.get(assignment.id);
  if (ownerType !== 'flight') return direct;
  const personId = assignment.person_id || assignment.personId;
  const matches = [...results.values()].filter(row => (row.person_id || row.personId) === personId && row.role === assignment.role);
  if (matches.length > 1) throw maintenanceReviewError("同一人员工种存在多个实际结果来源，请核对后再复核",409);
  return matches[0];
}

// Review uses the effective report version, while pre-batch history keeps its original adapter.
// Revisions retain the prior version in the source journal; dispatch remains a separate fact.
function maintenanceNonroutineParticipantRows(subtaskId, cached = {}) {
  const owner = cached.owner || db.prepare('select * from maintenance_subtasks where id=?').get(subtaskId);
  if (!owner) throw maintenanceReviewError('未找到原非例行工作项',409);
  const legacy = cached.legacy ?? db.prepare("select * from maintenance_assignments where owner_type='subtask' and owner_id=? order by id").all(subtaskId);
  const batch = Object.hasOwn(cached,'batch') ? cached.batch : db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(owner.flight_id);
  if (!batch || Number(batch.version)<1) return legacy; // Unknown pre-version history stays on its original adapter.
  const entries = cached.entries ?? db.prepare('select * from maintenance_report_entries where batch_id=? order by id').all(batch.id);
  const assessment = Object.hasOwn(cached,'assessment') ? cached.assessment : maintenanceNonroutineAssessment(owner);
  if (!entries.some(row=>row.owner_type==='subtask' && row.owner_id===subtaskId)) {
    if (assessment?.report_batch_id===batch.id) throw maintenanceReviewError('原认定缺少实际报工人员来源',409);
    return legacy;
  }
  const source = reportParticipantSource({batch,entries,subtasks:cached.subtasks ?? db.prepare('select id,flight_id from maintenance_subtasks where flight_id=?').all(owner.flight_id)});
  const frozen = assessment ? JSON.parse(assessment.participants_json) : [];
  const previous = cached.previous ?? db.prepare("select * from maintenance_hour_results where owner_type='subtask' and owner_id=?").all(subtaskId);
  return source.participants.filter(row=>row.ownerId===subtaskId).map(row=>{
    const original = frozen.find(person=>person.personId===row.personId && person.role===row.role);
    const result = previous.find(person=>person.person_id===row.personId && person.role===row.role);
    const linked = legacy.find(person=>person.person_id===row.personId && person.role===row.role);
    const entry = entries.find(item=>item.id===row.entryId);
    return {id:original?.assignmentId || result?.assignment_id || linked?.id || JSON.stringify(['REPORT_ENTRY',batch.id,row.entryId]),owner_type:'subtask',owner_id:subtaskId,flight_id:owner.flight_id,person_id:row.personId,user_name:row.personNameSnapshot,team:row.teamSnapshot,role:row.role,status:batch.status,assigned_at:original?.assignedAt || entry.created_at,sourceType:'REPORT_ENTRY',batchId:batch.id,batchVersion:Number(batch.version),entryId:row.entryId};
  });
}

function maintenanceReviewParticipantRows(ownerType, ownerId) {
  const legacy = db.prepare("select * from maintenance_assignments where owner_type=? and owner_id=? order by user_name").all(ownerType, ownerId);
  if (ownerType !== 'flight') return maintenanceNonroutineParticipantRows(ownerId);
  return ['routine','release'].flatMap(type => {
    const rows = legacy.filter(row => (row.role === '放行') === (type === 'release'));
    const batch = db.prepare('select * from maintenance_report_batches where flight_id=? and report_type=?').get(ownerId,type);
    return batch ? maintenanceReportResultParticipants(ownerId,type,batch.status,rows) : rows;
  });
}

function maintenanceReviewTask(ownerType, owner, flight) {
  const assignments = maintenanceReviewParticipantRows(ownerType, owner.id).map(publicMaintenanceAssignment);
  const hours = maintenanceHours(ownerType, owner.id);
  const sorties = maintenanceSorties(ownerType, owner.id);
  const hourByAssignment = new Map();
  for(const hour of hours){
    const previous=hourByAssignment.get(hour.assignmentId);
    if(!previous)hourByAssignment.set(hour.assignmentId,{...hour,allocationDetails:[{role:hour.role,hours:hour.finalHours}]});
    else{previous.hours=Math.round((previous.hours+hour.hours)*100)/100;previous.finalHours=Math.round((previous.finalHours+hour.finalHours)*100)/100;previous.role=[...new Set([...previous.role.split('、'),hour.role])].join('、');previous.allocationDetails.push({role:hour.role,hours:hour.finalHours});}
  }
  const sortieByAssignment = new Map(sorties.map(row => [row.assignmentId, row]));
  const baseHours = maintenanceBaseHours(ownerType, owner);
  const hourAssessment = ownerType === "subtask" ? maintenanceNonroutineHourAssessment(owner) : null;
  const allowedRoles = maintenanceRolesForOwner(ownerType, ownerType === "flight" ? flight : owner);
  const archivedFlight = flight.status === "已确认" || Boolean(flight.archived_at);
  const accountingAssignments=maintenanceRecognitionAssignments(ownerType,owner,assignments.filter(row => row.role !== "放行"));
  const calculatedHours = maintenanceCalculatedHours(ownerType, owner, accountingAssignments);
  return {
    ownerType,
    ownerId: owner.id,
    title: ownerType === "flight" ? "维修机会" : (owner.title || "非例行"),
    subtitle: ownerType === "flight" ? (flight.work_kind || flight.work_type || "其他") : (owner.category || "非例行"),
    status: owner.status || "未派工",
    baseHours,
    hourAssessment,
    baseHoursSource: ownerType === "flight" ? `维修机会规则 · ${flight.work_kind || flight.work_type || "其他"}` : "非例行标准工时",
    editable: ["已提报", "待复核", "已确认"].includes(owner.status || "未派工") || (archivedFlight && ownerType === "subtask"),
    archiveCorrection: archivedFlight && ownerType === "subtask" && owner.status !== "已确认",
    roles: allowedRoles.map(role => ({ role, metricType: role === "放行" ? "sorties" : "hours", ratio: role === "放行" ? null : maintenanceRatioForOwner(ownerType, owner, role, assignments) })),
    assignments: assignments.map(row => {
      const savedHour = maintenanceReviewExistingResult(hourByAssignment,row,ownerType);
      const savedSortie = maintenanceReviewExistingResult(sortieByAssignment,row,ownerType);
      const isRelease = row.role === "放行";
      const projectedId=accountingAssignments.filter(item=>(item.sourceAssignmentId||item.id)===row.id).map(item=>item.id);
      const ruleHours = isRelease ? 0 : hourAssessment && (hourAssessment.pending||hourAssessment.cancelled) ? null : ownerType==='subtask'&&maintenanceNonroutineAdjustmentClosed(owner)?savedHour?.finalHours||0:Math.round(projectedId.reduce((sum,id)=>sum+Math.round((calculatedHours.get(id)||0)*100),0))/100;
      return { ...row, allocationRole: savedHour?.role || row.role,allocationDetails:savedHour?.allocationDetails||[], metricType: isRelease ? "sorties" : "hours", ruleHours, reportedHours: isRelease ? 0 : (savedHour ? savedHour.finalHours : ruleHours), reportedSorties: isRelease ? (savedSortie?.sorties || 0) : 0, resultStatus: savedHour?.status || savedSortie?.status || row.status };
    })
  };
}

function maintenanceReviewTree(flightId) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) return null;
  const subtasks = db.prepare("select * from maintenance_subtasks where flight_id=? order by created_at").all(flightId);
  return {
    flight: {
      id: flight.id,
      date: flight.date || "",
      flightNo: maintenanceDisplayFlightNo(flight) || "",
      aircraftNo: flight.aircraft_no || "",
      aircraftType: flight.aircraft_type || "",
      stand: flight.stand || "",
      locationName: maintenanceLocationName(flight),
      opportunity: flight.work_kind || flight.work_type || "其他",
      status: flight.status || "未派工",
      archivedAt: flight.archived_at || "",
      requiresChangeReason: flight.status === "已确认" || Boolean(flight.archived_at),
      updatedAt: flight.updated_at || "",
      routineElectronicSigned: flight.routine_electronic_signed == null ? null : Boolean(flight.routine_electronic_signed),
      nonroutineElectronicSigned: flight.nonroutine_electronic_signed == null ? null : Boolean(flight.nonroutine_electronic_signed)
    },
    people: allPeople(),
    defaults: { towStandardHours: maintenanceTowDefaultHours() },
    tasks: [maintenanceReviewTask("flight", flight, flight), ...subtasks.map(row => maintenanceReviewTask("subtask", row, flight))]
  };
}

function maintenanceReviewError(message, status = 400, blockers = []) {
  const error = new Error(blockers.length ? `${message}：${blockers.join("；")}` : message);
  error.status = status;
  error.details = blockers.length ? { blockers } : undefined;
  return error;
}

function maintenanceReviewTaskPayloads(flightId, tasks, { archiveMode = false } = {}) {
  const expected = [
    { ownerType: "flight", ownerId: flightId },
    ...db.prepare("select id from maintenance_subtasks where flight_id=? order by created_at").all(flightId).map(row => ({ ownerType: "subtask", ownerId: row.id }))
  ];
  const provided = new Map((Array.isArray(tasks) ? tasks : []).map(row => [`${row.ownerType}:${row.ownerId}`, row]));
  if (provided.size !== expected.length || expected.some(row => !provided.has(`${row.ownerType}:${row.ownerId}`))) {
    throw maintenanceReviewError("复核数据与当前任务树不一致，请刷新后重试", 409);
  }
  return expected.map(({ ownerType, ownerId }) => {
    const owner = maintenanceOwner(ownerType, ownerId);
    const raw = provided.get(`${ownerType}:${ownerId}`);
    const current = maintenanceReviewParticipantRows(ownerType, ownerId).map(publicMaintenanceAssignment);
    if (!["已提报", "待复核", "已确认"].includes(owner.status || "未派工")) {
      const currentKeys = current.map(row => `${row.personId}\u0000${row.role}`).sort().join("|");
      const submittedKeys = (Array.isArray(raw.assignments) ? raw.assignments : []).map(row => `${String(row.personId || "").trim()}\u0000${ownerType === "subtask" ? normalizeMaintenanceSubtaskRole(row.role) : String(row.role || "").trim()}`).sort().join("|");
      if (!archiveMode || ownerType !== "subtask") {
        if (currentKeys !== submittedKeys) throw maintenanceReviewError(`${ownerType === "flight" ? "主任务" : owner.title || "非例行"}尚未完成，不能在复核中修改人员`);
        return { ownerType, ownerId, owner, current, normalized: current.map(row => ({ person: allPeople().find(person => person.id === row.personId), role: row.role })).filter(row => row.person), changed: false };
      }
      if (!submittedKeys && !currentKeys) return { ownerType, ownerId, owner, current, normalized: [], changed: false, archiveMode: true };
      const normalized = normalizeMaintenanceAssignments(ownerType, owner, Array.isArray(raw.assignments) ? raw.assignments : []);
      const beforeKeys = current.map(row => `${row.personId}\u0000${row.role}`).sort();
      const afterKeys = normalized.map(row => `${row.person.id}\u0000${row.role}`).sort();
      return { ownerType, ownerId, owner, current, normalized, changed: beforeKeys.join("|") !== afterKeys.join("|"), archiveMode: true, resultSource: "后台归档修正" };
    }
    const normalized = normalizeMaintenanceAssignments(ownerType, owner, Array.isArray(raw.assignments) ? raw.assignments : []);
    const beforeKeys = current.map(row => `${row.personId}\u0000${row.role}`).sort();
    const afterKeys = normalized.map(row => `${row.person.id}\u0000${row.role}`).sort();
    return { ownerType, ownerId, owner, current, normalized, changed: beforeKeys.join("|") !== afterKeys.join("|"), archiveMode, resultSource: archiveMode ? "后台归档修正" : "" };
  });
}

function maintenanceArchivedNewSubtasks(flightId, input, status = "已确认") {
  if(!Array.isArray(input)||!input.length)return [];
  const knownSources=maintenanceSourceRows(flightId),knownCases=db.prepare('select id,subtask_id,report_batch_id from maintenance_nonroutine_review_cases where flight_id=?').all(flightId);
  const identities=new Set([
    ...knownSources.flatMap(source=>[source.client_id,source.fingerprint,source.subtask_id]),
    ...knownCases.flatMap(item=>[item.id,item.subtask_id,item.report_batch_id]),
    ...db.prepare('select id from maintenance_subtasks where flight_id=?').all(flightId).map(row=>row.id)
  ].filter(Boolean).map(String));
  const seen=new Set(),sources=createReviewAdditionSources({db,clock:now,randomId});
  return input.map((raw, index) => {
    if(['id','ownerId','subtaskId','reviewCaseId','sourceFingerprint','reportBatchId'].some(key=>raw?.[key])||raw?.clientId&&identities.has(String(raw.clientId).trim()))throw maintenanceReviewError('已有工作或评议来源不能作为新增补录再次计时，请在原项处理；已入账更正须走授权更正',409);
    const payload = maintenanceSubtaskPayload(raw);
    if (!payload.title) throw maintenanceReviewError(`新增非例行 ${index + 1}：请填写标题`);
    if (!Number.isFinite(payload.standardHours) || !(payload.standardHours > 0) || Math.abs(payload.standardHours * 10 - Math.round(payload.standardHours * 10)) > 1e-8) throw maintenanceReviewError(`新增非例行 ${index + 1}：工时必须大于0且以0.1小时为单位`);
    if (!maintenanceNonroutineCategories.includes(raw?.category)) throw maintenanceReviewError(`新增非例行 ${index + 1}：类别无效`);
    const owner = {
      id: String(raw?.clientId || randomId("mtns")),
      flight_id: flightId,
      card_no: payload.cardNo,
      title: payload.title,
      content: payload.content,
      category: payload.category,
      standard_hours: payload.standardHours,
      priority: payload.priority,
      status,
      remark: payload.remark
    };
    const normalized = normalizeMaintenanceAssignments("subtask", owner, Array.isArray(raw?.assignments) ? raw.assignments : []);
    if (!normalized.length) throw maintenanceReviewError(`新增非例行 ${index + 1}：请至少选择一名人员`);
    const source=sources.prepare({flightId,clientId:raw?.clientId,snapshot:{definition:{category:payload.category,chapter:payload.cardNo,title:payload.title,workScope:payload.content,standardHours:payload.standardHours,priority:payload.priority,remark:payload.remark},participants:normalized.map(item=>({personId:item.person.id,role:item.role}))}});
    if(seen.has(source.clientId))throw maintenanceReviewError('同一补录来源标识在本次请求中重复，请核对原项',409);seen.add(source.clientId);
    if(source.replayed)return {owner,payload,normalized,source,replayed:true};
    assertMaintenanceLegacyTowCreation(payload.category);
    for (const item of normalized) {
      if (maintenanceRatioRuleForOwner("subtask", owner, item.role, normalized) === null) throw maintenanceReviewError(`新增非例行 ${index + 1}：${item.role}缺少有效工时比例`);
    }
    return { owner, payload, normalized, source, replayed:false };
  });
}

function maintenanceReviewConfirmBlockers(rows) {
  const blockers = [];
  for (const row of rows) {
    const label = row.ownerType === "flight" ? "主任务" : (row.owner.title || "非例行");
    if (!["已提报", "待复核", "已确认"].includes(row.owner.status || "未派工")) blockers.push(`${label}状态为${row.owner.status || "未派工"}`);
    if (!row.normalized.length) blockers.push(`${label}没有派工人员`);
    const hourRoles = new Set(row.normalized.map(item => item.role).filter(role => role !== "放行"));
    const pending = row.ownerType === "subtask" && maintenanceNonroutineUnposted(row.owner);
    const zeroStandard = row.ownerType === "subtask" && maintenanceNonroutineAssessment(row.owner)?.effective_hours === 0;
    if (!pending && !zeroStandard && hourRoles.size && maintenanceBaseHours(row.ownerType, row.owner) <= 0) blockers.push(`${label}未设置有效标准工时`);
    for (const role of pending || row.ownerType === "subtask" && maintenanceNonroutineAssessment(row.owner)?.review_case_id ? [] : hourRoles) {
      if (maintenanceRatioRuleForOwner(row.ownerType, row.owner, role, row.normalized) === null) blockers.push(`${label}的${role}比例缺失或无效`);
    }
    const currentByKey = new Map(row.current.map(item => [`${item.personId}\u0000${item.role}`, item]));
    row.normalized.forEach(item => {
      const current = currentByKey.get(`${item.person.id}\u0000${item.role}`);
      if (["已派工", "已提报"].includes(current?.status || "")) blockers.push(`${label}的${item.person.name}/${item.role}尚未进入待复核`);
      if (current && current.status !== "已派工") {
        const table = item.role === "放行" ? "maintenance_sortie_results" : "maintenance_effective_hour_results";
        const resultExists = row.ownerType === 'flight'
          ? maintenanceReviewExistingResult(new Map(db.prepare(`select * from ${table} where owner_type='flight' and owner_id=?`).all(row.ownerId).map(result=>[result.assignment_id,result])),current,'flight')
          : db.prepare(`select 1 from ${table} where assignment_id=?`).get(current.id);
        const recognizedPersonResult=!resultExists&&row.ownerType==='subtask'&&maintenanceNonroutineAssessment(row.owner)?.review_case_id&&db.prepare("select 1 from maintenance_effective_hour_results where owner_type='subtask' and owner_id=? and person_id=?").get(row.ownerId,item.person.id);
        if (!resultExists && !recognizedPersonResult && !(pending && item.role !== "放行")) blockers.push(`${label}的${item.person.name}/${item.role}缺少${item.role === "放行" ? "架次" : "工时"}上报结果`);
      }
    });
  }
  return Array.from(new Set(blockers));
}

function reconcileMaintenanceReviewAssignments(row, manager) {
  if(row.ownerType==='subtask' && row.changed){
    if(db.prepare('select 1 from maintenance_nonroutine_corrections where subtask_id=?').get(row.ownerId))throw maintenanceReviewError('该来源已有独立更正批准，原参与事实不可通过归档修改覆盖',409);
    if(db.prepare("select 1 from maintenance_nonroutine_role_results r join maintenance_hour_results h on h.id=r.result_id where h.owner_type='subtask' and h.owner_id=?").get(row.ownerId))throw maintenanceReviewError('核算角色来源已锁定，实际参与事实变化须走授权更正',409);
    const batch=db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(row.owner.flight_id);
    if(batch){
      const other=db.prepare("select * from maintenance_report_entries where batch_id=? and not(owner_type='subtask' and owner_id=?) order by id").all(batch.id,row.ownerId).map(item=>({ownerType:item.owner_type,ownerId:item.owner_id,role:item.role,person:{id:item.person_id,name:item.user_name,team:item.team},standardHours:item.standard_hours,source:item.source}));
      const desired=row.normalized.map(item=>({ownerType:'subtask',ownerId:row.ownerId,role:item.role,person:item.person,standardHours:row.owner.standard_hours===null?null:maintenanceBaseHours('subtask',row.owner),source:row.resultSource||'授权复核调整'}));
      replaceMaintenanceReportEntries(batch.id,row.owner.flight_id,[...other,...desired],{user:manager});
      return maintenanceNonroutineParticipantRows(row.ownerId).map(publicMaintenanceAssignment);
    }
  }
  if (row.ownerType === 'flight' && db.prepare('select 1 from maintenance_report_batches where flight_id=? limit 1').get(row.ownerId)) {
    if (!row.changed) return maintenanceReviewParticipantRows(row.ownerType,row.ownerId).map(publicMaintenanceAssignment);
    for (const type of ['routine','release']) {
      const isType = role => (role === '放行') === (type === 'release');
      const current = row.current.filter(item=>isType(item.role));
      const desired = row.normalized.filter(item=>isType(item.role));
      const keys = items => items.map(item=>`${item.personId || item.person.id}\u0000${item.role}`).sort().join('|');
      if (keys(current) === keys(desired)) continue;
      const batch = db.prepare('select * from maintenance_report_batches where flight_id=? and report_type=?').get(row.ownerId,type);
      if (!batch) throw maintenanceReviewError('尚未正式提报的分项须通过原报工入口确认人员',409);
      if (type === 'release' && desired.length !== 1) throw maintenanceReviewError('放行来源必须恰有一名实际放行人员',409);
      replaceMaintenanceReportEntries(batch.id,row.ownerId,desired.map(item=>({ownerType:'flight',ownerId:row.ownerId,role:item.role,person:item.person,standardHours:type==='release'?0:maintenanceBaseHours('flight',row.owner),source:row.resultSource || '授权复核调整'})),{user:manager});
    }
    return maintenanceReviewParticipantRows(row.ownerType,row.ownerId).map(publicMaintenanceAssignment);
  }
  if (!row.changed) return maintenanceAssignments(row.ownerType, row.ownerId);
  if(row.ownerType==='subtask'&&db.prepare("select 1 from maintenance_nonroutine_corrections where subtask_id=?").get(row.ownerId))throw maintenanceReviewError('该来源已有独立更正批准，原参与事实不可通过归档修改覆盖',409);
  if(row.ownerType==='subtask'&&db.prepare("select 1 from maintenance_nonroutine_role_results r join maintenance_hour_results h on h.id=r.result_id where h.owner_type='subtask' and h.owner_id=?").get(row.ownerId))throw maintenanceReviewError('核算角色来源已锁定，实际参与事实变化须走授权更正',409);
  const currentRows = db.prepare("select * from maintenance_assignments where owner_type=? and owner_id=?").all(row.ownerType, row.ownerId);
  const currentByKey = new Map(currentRows.map(item => [`${item.person_id}\u0000${item.role}`, item]));
  const desiredKeys = new Set(row.normalized.map(item => `${item.person.id}\u0000${item.role}`));
  for (const item of currentRows) {
    if (desiredKeys.has(`${item.person_id}\u0000${item.role}`)) continue;
    db.prepare("delete from maintenance_feedback where assignment_id=?").run(item.id);
    db.prepare("delete from maintenance_hour_results where assignment_id=?").run(item.id);
    db.prepare("delete from maintenance_sortie_results where assignment_id=?").run(item.id);
    db.prepare("delete from maintenance_assignments where id=?").run(item.id);
  }
  const targetStatus = row.archiveMode || row.owner.status === "已确认" ? "已确认" : "待复核";
  const timestamp = now();
  for (const item of row.normalized) {
    const key = `${item.person.id}\u0000${item.role}`;
    if (currentByKey.has(key)) continue;
    insertMaintenanceAssignment({
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      flightId: row.ownerType === "flight" ? row.owner.id : row.owner.flight_id,
      personId: item.person.id,
      userName: item.person.name,
      team: item.person.team || "未设置",
      role: item.role,
      status: targetStatus,
      feedback: row.resultSource || "后台复核调整",
      assignedBy: manager.id,
      assignedAt: timestamp,
      receivedAt: timestamp,
      startedAt: timestamp,
      completedAt: timestamp,
      submittedAt: timestamp,
      modifiedAt: timestamp,
      confirmedAt: targetStatus === "已确认" ? timestamp : ""
    });
  }
  return maintenanceAssignments(row.ownerType, row.ownerId);
}

function rebuildMaintenanceReviewResults(row, manager, mode) {
  if(row.ownerType==='subtask' && maintenanceNonroutineAdjustmentClosed(row.owner)){
    if(row.changed)throw maintenanceReviewError('该工作已通过不可变补记入账，人员变化须走授权工时更正',409);
    return;
  }
  if (row.archiveMode && !row.changed) return;
  if (!row.archiveMode && mode === "save" && !["已提报", "待复核", "已确认"].includes(row.owner.status || "未派工")) return;
  const assignments = maintenanceRecognitionAssignments(row.ownerType,row.owner,maintenanceReviewParticipantRows(row.ownerType,row.ownerId));
  const expanded=assignments.some(item=>item.sourceAssignmentId&&item.sourceAssignmentId!==item.id);
  if(expanded&&row.changed)throw maintenanceReviewError('核算角色已认定，实际参与事实变化须走授权更正',409);
  const pending = row.ownerType === "subtask" && maintenanceNonroutineUnposted(row.owner);
  const existingHours = new Map(db.prepare("select * from maintenance_hour_results where owner_type=? and owner_id=?").all(row.ownerType, row.ownerId).map(item => [item.assignment_id, item]));
  const existingSorties = new Map(db.prepare("select * from maintenance_sortie_results where owner_type=? and owner_id=?").all(row.ownerType, row.ownerId).map(item => [item.assignment_id, item]));
  if (pending && existingHours.size) throw maintenanceReviewError("待审申请存在有效工时，请核对来源",409);
  if (row.ownerType === "flight" && assignments.some(item => item.role !== "放行")) captureMaintenanceAircraftHours(row.owner, manager);
  const calculatedHours = maintenanceCalculatedHours(row.ownerType, row.owner, assignments.filter(item => item.role !== "放行"));
  if (!pending && row.ownerType === "subtask" && maintenanceNonroutineAssessment(row.owner) && assignments.some(item=>item.role!=="放行" && !calculatedHours.has(item.id))) throw maintenanceReviewError("当前非例行分配输入或冻结规则无法核算，请核对",409);
  db.prepare("delete from maintenance_hour_results where owner_type=? and owner_id=?").run(row.ownerType, row.ownerId);
  db.prepare("delete from maintenance_sortie_results where owner_type=? and owner_id=?").run(row.ownerType, row.ownerId);
  if(expanded&&!pending){
    maintenanceWriteRecognitionRoleResults(row.owner,assignments,calculatedHours,{status:actual=>mode==='confirm'||row.archiveMode?'已确认':actual.status,confirmedBy:manager.id,existing:existingHours});
    if(mode==='confirm'||row.archiveMode)db.prepare("update maintenance_assignments set status='已确认',modified_at=?,confirmed_at=? where owner_type='subtask' and owner_id=?").run(now(),now(),row.ownerId);
    updateMaintenanceOwnerStatus(row.ownerType,row.ownerId,mode==='confirm'||row.archiveMode?'已确认':row.owner.status||'待复核',manager.id);return;
  }
  const insertHour = db.prepare(`insert into maintenance_hour_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,adjusted_hours,status,confirmed_by,confirmed_at,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertSortie = db.prepare(`insert into maintenance_sortie_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,sorties,status,confirmed_by,confirmed_at,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const assignment of assignments) {
    const status = mode === "confirm" || row.archiveMode ? "已确认" : assignment.status;
    if (!["待复核", "已确认"].includes(status)) continue;
    const confirmed = status === "已确认";
    if (assignment.role === "放行") {
      const old = maintenanceReviewExistingResult(existingSorties,assignment,row.ownerType);
      insertSortie.run(old?.id || randomId("mtnsrt"), row.ownerType, row.ownerId, assignment.flight_id || row.owner.flight_id || row.owner.id, old?.assignment_id || assignment.id, assignment.person_id, assignment.user_name, assignment.team || "", "放行", "放行架次", 1, status, confirmed ? manager.id : "", confirmed ? now() : "", old?.created_at || now(), now());
    } else if (!pending) {
      const old = maintenanceReviewExistingResult(existingHours,assignment,row.ownerType);
      const calculated = calculatedHours.get(assignment.id) || 0;
      const source = row.resultSource || old?.source || (row.ownerType === "subtask" ? "非例行" : "维修机会");
      insertHour.run(old?.id || randomId("mtnh"), row.ownerType, row.ownerId, assignment.flight_id || row.owner.flight_id || row.owner.id, old?.assignment_id || assignment.id, assignment.person_id, assignment.user_name, assignment.team || "", assignment.role, source, calculated, row.changed ? null : (old?.adjusted_hours ?? null), status, confirmed ? manager.id : "", confirmed ? now() : "", old?.created_at || now(), now());
    }
    if (mode === "confirm" || confirmed) {
      db.prepare("update maintenance_assignments set status=?,modified_at=?,confirmed_at=? where id=?").run(status, now(), confirmed ? now() : "", assignment.id);
    }
  }
  if (mode === 'confirm' || row.archiveMode) {
    db.prepare("update maintenance_assignments set status='已确认',modified_at=?,confirmed_at=? where owner_type=? and owner_id=?").run(now(),now(),row.ownerType,row.ownerId);
  }
  if(row.ownerType!=='flight'||!maintenanceCoordinatorEnabled()){
    if (mode === "confirm" || (row.archiveMode && row.changed)) updateMaintenanceOwnerStatus(row.ownerType, row.ownerId, "已确认", manager.id);
    else updateMaintenanceOwnerStatus(row.ownerType, row.ownerId, row.owner.status || "待复核", manager.id);
  }
}

function maintenanceReviewPersonnelScope(user, flightId) {
  const flight=db.prepare('select id,created_by from maintenance_flights where id=?').get(flightId);
  if(!flight)return {canRead:false,canEditEntireTree:false};
  if(personnelAccess.hasAll(user,'maintenance'))return {canRead:true,canEditEntireTree:true};
  const people=new Set(maintenanceTaskTreeAssignments(flightId).map(row=>row.person_id));
  const owners=[['flight',flightId],...db.prepare('select id from maintenance_subtasks where flight_id=?').all(flightId).map(row=>['subtask',row.id])];
  for(const [type,id] of owners)for(const row of maintenanceReviewParticipantRows(type,id))people.add(row.person_id);
  for(const table of ['maintenance_effective_hour_results','maintenance_sortie_results'])for(const row of db.prepare(`select person_id from ${table} where flight_id=?`).all(flightId))people.add(row.person_id);
  if(!people.size){const allowed=flight.created_by===user.id || dataScopeAllowsUser(user,flight.created_by,'maintenance');return {canRead:allowed,canEditEntireTree:allowed};}
  const allowed=[...people].map(personId=>personnelAccess.allows(user,'maintenance',personId));
  return {canRead:allowed.some(Boolean),canEditEntireTree:allowed.every(Boolean)};
}

function saveMaintenanceReview(flightId, payload, manager) {
  const mode = payload?.mode === "confirm" ? "confirm" : "save";
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceReviewError("未找到维修机会", 404);
  const editingConfirmed = flight.status === "已确认" || Boolean(flight.archived_at);
  if (editingConfirmed && !hasRbac(manager, "maintenance.archive.modify")) throw maintenanceReviewError("当前账号没有修改已确认数据的权限", 403);
  assertMaintenanceFlightVersion(flightId, payload);
  const reason = String(payload?.reason || "").trim();
  if (editingConfirmed && !reason) throw maintenanceReviewError("修改已确认数据必须填写修改原因");
  if (editingConfirmed && mode === "confirm") throw maintenanceReviewError("已确认数据请使用保存归档修改");
  db.exec("begin immediate");
  try {
    if (db.kind === "postgres") db.exec("select pg_advisory_xact_lock(54002010,31)");
    manager=currentMaintenanceReviewActor(manager);
    if(!manager || !hasRbac(manager,'maintenance.review.submit'))throw maintenanceReviewError('当前复核人员身份或提交权限已失效',403);
    if(editingConfirmed && !hasRbac(manager,'maintenance.archive.modify'))throw maintenanceReviewError('当前账号已无修改已确认数据的权限',403);
    assertMaintenanceFlightVersion(flightId, payload);
    const current = db.prepare("select * from maintenance_flights where id=?").get(flightId);
    if (current.status !== flight.status || current.archived_at !== flight.archived_at) throw maintenanceReviewError("维修机会状态已变化，请刷新后重试", 409);
    if(!maintenanceReviewPersonnelScope(manager,flightId).canEditEntireTree)throw maintenanceReviewError('整棵任务树涉及当前维修范围外人员，须由有完整范围的负责人复核',403);
    const additionSources = maintenanceArchivedNewSubtasks(flightId, payload?.newSubtasks, editingConfirmed ? "已确认" : "待复核");
    const newSubtasks=additionSources.filter(item=>!item.replayed);
    if (!editingConfirmed && newSubtasks.length && current.status !== "待复核") throw maintenanceReviewError("只有待复核或已确认的维修机会可以补录非例行", 409);
    if (newSubtasks.length && !reason) throw maintenanceReviewError("补录非例行必须填写补录原因");
    const before = maintenanceReviewSnapshot(flightId);
    const sourceFactsBefore=snapshotNonroutineSourceFacts(db,flightId,{readParticipants:source=>maintenanceNonroutineParticipantRows(source.subtask_id)});
    const rows = maintenanceReviewTaskPayloads(flightId, payload?.tasks, { archiveMode: editingConfirmed });
    const currentFlight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
    const signatureValue = (key, column) => {
      const value = payload[key];
      if (value === undefined) return currentFlight[column] == null ? null : Boolean(currentFlight[column]);
      if (value !== null && typeof value !== "boolean") throw maintenanceReviewError("签署方式只能为电签、纸签或未选择");
      return value;
    };
    const routineSigned = signatureValue("routineElectronicSigned", "routine_electronic_signed");
    let nonroutineSigned = signatureValue("nonroutineElectronicSigned", "nonroutine_electronic_signed");
    const hasNonroutine = rows.some(row => row.ownerType === "subtask") || newSubtasks.length > 0;
    if (!hasNonroutine) nonroutineSigned = null;
    if (mode === "confirm") {
      const routineSignatureChosen = routineSigned !== null;
      const nonroutineSignatureChosen = !hasNonroutine || nonroutineSigned !== null;
      const shadow = maintenanceGateEvaluationEnabled();
      const blockers = routineSignatureChosen && nonroutineSignatureChosen ? maintenanceReviewConfirmBlockers(rows) : [];
      if (shadow) {
        const decision=observeMaintenanceTransition(current, () => maintenanceReportProgress(flightId), "CONFIRM_REVIEW",
          routineSignatureChosen && nonroutineSignatureChosen && !blockers.length,
          { editingConfirmed, routineSignatureChosen, nonroutineSignatureChosen, reviewBlockers: blockers });
        if(decision?.allowed)recordMaintenanceCoordinatorDecision(current,'CONFIRM_REVIEW',decision,manager);
      }
      if (!routineSignatureChosen) throw maintenanceReviewError("请选择例行签署方式");
      if (!nonroutineSignatureChosen) throw maintenanceReviewError("请选择非例行签署方式");
      if (blockers.length) throw maintenanceReviewError("整棵任务树暂不能确认", 409, blockers);
    }
    const stamp = now();
    for (const item of newSubtasks) {
      const id = randomId("mtns");
      item.owner.id = id;
      db.prepare(`insert into maintenance_subtasks(id,flight_id,card_no,title,content,category,standard_hours,priority,status,remark,created_by,updated_by,created_at,updated_at)
        values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, flightId, item.payload.cardNo, item.payload.title, item.payload.content, item.payload.category, item.payload.standardHours, item.payload.priority, item.owner.status, item.payload.remark, manager.id, manager.id, stamp, stamp);
      createReviewAdditionSources({db,clock:now,randomId}).record(item.source,id,editingConfirmed?'ARCHIVE_ADDITION':'REVIEW_ADDITION',manager);
      rows.push({
        ownerType: "subtask",
        ownerId: id,
        owner: { ...item.owner, id },
        current: [],
        normalized: item.normalized,
        changed: true,
        archiveMode: editingConfirmed,
        resultSource: editingConfirmed ? "归档补录" : "复核补录"
      });
    }
    if (newSubtasks.length) {
      // Rebuild the category entries from the final tree, including newly recorded work.
      const entries = rows.filter(row => row.ownerType === "subtask").flatMap(row => row.normalized.map(item => ({
        ownerType: "subtask", ownerId: row.ownerId, role: item.role, person: item.person,
        standardHours: maintenanceBaseHours("subtask", row.owner), source: row.resultSource || "非例行报工"
      })));
      const batch = maintenanceReportBatch(flightId, "nonroutine");
      const batchStatus = editingConfirmed || mode === "confirm" ? "已确认" : "待复核";
      if (batch) {
        replaceMaintenanceReportEntries(batch.id, flightId, entries,{user:manager});
        db.prepare("update maintenance_report_batches set status=? where id=?").run(batchStatus, batch.id);
      } else upsertMaintenanceReportBatch(flightId, "nonroutine", { status: batchStatus, user: manager, entries });
    }
    rows.forEach(row => reconcileMaintenanceReviewAssignments(row, manager));
    rows.forEach(row => rebuildMaintenanceReviewResults(row, manager, mode));
    if (mode === "confirm") db.prepare("update maintenance_report_batches set status='已确认',updated_at=? where flight_id=?").run(stamp, flightId);
    reconcileMaintenanceTreeStatus(flightId, manager.id, { preserveConfirmed: mode !== "confirm" });
    if (mode === "confirm") {
      db.prepare("update maintenance_flights set status='已确认',archived_at=coalesce(nullif(archived_at,''),?),updated_by=?,updated_at=? where id=?").run(stamp, manager.id, stamp, flightId);
    } else if (editingConfirmed) {
      db.prepare("update maintenance_flights set status='已确认',updated_by=?,updated_at=? where id=?").run(manager.id, stamp, flightId);
    }
    db.prepare("update maintenance_flights set routine_electronic_signed=?,nonroutine_electronic_signed=? where id=?")
      .run(routineSigned === null ? null : Number(routineSigned), nonroutineSigned === null ? null : Number(nonroutineSigned), flightId);
    recordNonroutineSourceFactsChanges({db,before:sourceFactsBefore,actorId:manager.id,reason,clock:now,randomId,readParticipants:source=>maintenanceNonroutineParticipantRows(source.subtask_id)});
    const after = maintenanceReviewSnapshot(flightId);
    maintenanceLog(manager, editingConfirmed ? "confirmed_data_correct" : mode === "confirm" ? "review_confirm" : "review_save", "flight", flightId, flightId, JSON.stringify({ reason, before, after, additionSources:additionSources.map(item=>({clientId:item.source.clientId,subtaskId:item.source.previous?.subtask_id||item.owner.id,anonymous:Boolean(item.source.anonymous),replayed:item.replayed})) }));
    db.exec("commit");
    return maintenanceReviewTree(flightId);
  } catch (error) {
    try { db.exec("rollback"); } catch {}
    throw error;
  }
}

function maintenanceFlightDeletionSnapshot(flightId) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) return null;
  const subtasks = db.prepare("select * from maintenance_subtasks where flight_id=? order by created_at").all(flightId);
  const assignments = db.prepare("select * from maintenance_assignments where flight_id=? order by assigned_at,id").all(flightId);
  const assignmentIds = assignments.map(row => row.id);
  const feedback = assignmentIds.length
    ? db.prepare(`select * from maintenance_feedback where assignment_id in (${assignmentIds.map(() => "?").join(",")}) order by created_at,id`).all(...assignmentIds)
    : [];
  const reportBatches = db.prepare("select * from maintenance_report_batches where flight_id=? order by created_at,id").all(flightId);
  const reportDrafts = db.prepare("select * from maintenance_report_drafts where flight_id=? order by created_at,id").all(flightId);
  return {
    flight,
    subtasks,
    assignments,
    feedback,
    hourResults: db.prepare("select * from maintenance_effective_hour_results where flight_id=? order by created_at,id").all(flightId),
    sortieResults: db.prepare("select * from maintenance_sortie_results where flight_id=? order by created_at,id").all(flightId),
    workReport: db.prepare("select * from maintenance_work_reports where flight_id=?").get(flightId) || null,
    workReportEntries: db.prepare("select * from maintenance_work_report_entries where flight_id=? order by role,user_name").all(flightId),
    reportBatches,
    reportEntries: db.prepare("select * from maintenance_report_entries where flight_id=? order by created_at,id").all(flightId),
    reportDrafts,
    moduleRuleSnapshot: db.prepare("select * from maintenance_opportunity_rule_snapshots where opportunity_key=?").get(flightId) || null,
    moduleInstances: db.prepare("select * from maintenance_module_instances where opportunity_key=? order by id").all(flightId),
    reportDraftVersions: db.prepare("select * from maintenance_report_draft_versions where flight_id=? order by report_type").all(flightId),
    importSources: db.prepare("select fingerprint,client_id,subtask_id,state,first_batch_id,row_number from maintenance_nonroutine_import_sources where flight_id=? order by fingerprint").all(flightId),
    manualSources: db.prepare('select fingerprint,client_id,subtask_id,state from maintenance_nonroutine_manual_sources where flight_id=? order by fingerprint').all(flightId),
    reviewAdditionSources: db.prepare('select * from maintenance_review_addition_sources where flight_id=? order by client_id').all(flightId)
  };
}

function currentMaintenanceDeletionActor(user, flight, subtaskId = null) {
  const current = currentMaintenanceReviewActor(user);
  const permission = subtaskId ? 'maintenance.content.manage' : 'maintenance.opportunity.delete';
  const confirmed = flight.status === '已确认' || Boolean(flight.archived_at);
  const pendingReview = !confirmed && (flight.status === '待复核' || Boolean(flight.report_finalized_at));
  if (!current || !hasRbac(current, permission) || confirmed && !hasRbac(current, 'maintenance.archive.modify') || pendingReview && !hasRbac(current, 'maintenance.review.submit')) {
    throw maintenanceReviewError('当前身份或删除该阶段工作所需权限已失效', 403);
  }
  if (!personnelAccess.hasAll(current, 'maintenance')) {
    // Check the people whose original records will actually be removed. A
    // single-item deletion does not require control of unrelated sibling work.
    const tables = subtaskId ? PERSON_TABLES.filter(table => table !== 'maintenance_work_report_entries') : PERSON_TABLES;
    const people = new Set(tables.flatMap(table => {
      const where = subtaskId ? "owner_type='subtask' and owner_id=?" : table === 'maintenance_feedback' ? 'assignment_id in (select id from maintenance_assignments where flight_id=?)' : 'flight_id=?';
      return db.prepare(`select person_id from ${table} where ${where}`).all(subtaskId || flight.id).map(row => row.person_id);
    }));
    const owners = subtaskId ? [['subtask', subtaskId]] : [['flight', flight.id], ...db.prepare('select id from maintenance_subtasks where flight_id=?').all(flight.id).map(row => ['subtask', row.id])];
    for (const [type, id] of owners) for (const row of maintenanceReviewParticipantRows(type, id)) people.add(row.person_id);
    if ([...people].some(personId => !personnelAccess.allows(current, 'maintenance', personId))) throw maintenanceReviewError('删除涉及当前维修范围外人员，原工作保持不变', 403);
    if (!people.size && flight.created_by !== current.id && !dataScopeAllowsUser(current, flight.created_by, 'maintenance') && !maintenanceTaskTreeAssignments(flight.id).some(row => row.person_id === current.personId || personnelAccess.allows(current, 'maintenance', row.person_id))) throw maintenanceReviewError('未找到当前可删除的维修机会', 404);
  }
  return current;
}

function deleteMaintenanceFlight(flightId, manager, reason = "") {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) return null;
  const confirmed = flight.status === "已确认" || Boolean(flight.archived_at);
  const pendingReview = !confirmed && (flight.status === "待复核" || Boolean(flight.report_finalized_at));
  const protectedDelete = confirmed || pendingReview;
  if (confirmed && !hasRbac(manager, "maintenance.archive.modify")) {
    throw maintenanceReviewError("当前账号没有删除已确认数据的权限", 403);
  }
  if (pendingReview && !hasRbac(manager, "maintenance.review.submit")) {
    throw maintenanceReviewError("当前账号没有删除待复核数据的权限", 403);
  }
  if (protectedDelete && !String(reason || "").trim()) {
    throw maintenanceReviewError(`删除${confirmed ? "已确认" : "待复核"}数据必须填写删除原因`);
  }
  if (!protectedDelete) assertMaintenanceTreeDirectEditAllowed(flightId);
  db.exec("begin immediate");
  try {
    if(db.kind==='postgres')db.exec('select pg_advisory_xact_lock(54002010,31)');
    const current=db.prepare('select * from maintenance_flights where id=?').get(flightId);
    if(!current||current.status!==flight.status||current.updated_at!==flight.updated_at||current.report_finalized_at!==flight.report_finalized_at||current.archived_at!==flight.archived_at)throw maintenanceReviewError('维修机会已变化，请刷新后重新核对删除',409);
    manager = currentMaintenanceDeletionActor(manager, current);
    retainMaintenanceReportSourcesForFlight(flightId,manager);
    const snapshot = maintenanceFlightDeletionSnapshot(flightId);
    if(db.prepare("select 1 from maintenance_nonroutine_corrections where flight_id=?").get(flightId))throw maintenanceReviewError('该机会包含独立工时更正，请保留原来源及差额轨迹',409);
    if (db.prepare("select 1 from maintenance_nonroutine_review_channels where case_id in (select id from maintenance_nonroutine_review_cases where flight_id=?) and state in ('MERGED_CLOSED','ADJUSTED_CLOSED')").get(flightId)) throw maintenanceReviewError("该机会包含已入账的评议来源，请先使用授权工时更正",409);
    for(const item of db.prepare('select id,subtask_id from maintenance_nonroutine_review_cases where flight_id=? order by id').all(flightId))maintenanceCancelReviewForSourceRemoval(item.id,flightId,item.subtask_id,manager,'OPPORTUNITY_REMOVAL',reason);
    maintenanceLog(
      manager,
      confirmed ? "confirmed_flight_delete" : pendingReview ? "pending_review_flight_delete" : "delete_flight",
      "flight",
      flightId,
      flightId,
      JSON.stringify({ reason: String(reason || "").trim(), before: snapshot })
    );
    db.prepare("delete from maintenance_feedback where assignment_id in (select id from maintenance_assignments where flight_id=?)").run(flightId);
    db.prepare("delete from maintenance_hour_results where flight_id=?").run(flightId);
    db.prepare("delete from maintenance_sortie_results where flight_id=?").run(flightId);
    db.prepare("delete from maintenance_work_report_entries where flight_id=?").run(flightId);
    db.prepare("delete from maintenance_work_reports where flight_id=?").run(flightId);
    db.prepare("delete from maintenance_report_entries where flight_id=?").run(flightId);
    db.prepare("delete from maintenance_report_batches where flight_id=?").run(flightId);
    db.prepare("delete from maintenance_report_drafts where flight_id=?").run(flightId);
    db.prepare("delete from maintenance_assignments where flight_id=?").run(flightId);
    db.prepare("delete from maintenance_report_draft_versions where flight_id=?").run(flightId);
    db.prepare("update maintenance_nonroutine_import_sources set state='DELETED',updated_at=? where flight_id=? and state in ('ACTIVE','SUBMITTED')").run(now(), flightId);
    db.prepare("update maintenance_nonroutine_manual_sources set state='DELETED',updated_at=? where flight_id=? and state in ('ACTIVE','SUBMITTED')").run(now(), flightId);
    db.prepare("delete from maintenance_subtasks where flight_id=?").run(flightId);
    db.prepare("delete from maintenance_flights where id=?").run(flightId);
    db.exec("commit");
    return { confirmed, pendingReview };
  } catch (error) {
    try { db.exec("rollback"); } catch {}
    throw error;
  }
}

function deleteMaintenanceSubtask(subtaskId, manager, reason = "") {
  const subtask = db.prepare("select * from maintenance_subtasks where id=?").get(subtaskId);
  if (!subtask) return null;
  const flight = db.prepare("select * from maintenance_flights where id=?").get(subtask.flight_id);
  if (!flight) return null;
  const confirmed = flight.status === "已确认" || Boolean(flight.archived_at);
  const pendingReview = !confirmed && (flight.status === "待复核" || Boolean(flight.report_finalized_at));
  const protectedDelete = confirmed || pendingReview;
  const deletionReason = String(reason || "").trim();
  if(db.prepare("select 1 from maintenance_nonroutine_corrections where subtask_id=?").get(subtaskId))throw maintenanceReviewError('该工作包含独立工时更正，请保留原来源及差额轨迹',409);
  if (confirmed && !hasRbac(manager, "maintenance.archive.modify")) {
    throw maintenanceReviewError("当前账号没有删除已确认非例行的权限", 403);
  }
  if (pendingReview && !hasRbac(manager, "maintenance.review.submit")) {
    throw maintenanceReviewError("当前账号没有删除待复核非例行的权限", 403);
  }
  if (protectedDelete && !deletionReason) {
    throw maintenanceReviewError(`删除${confirmed ? "已确认" : "待复核"}非例行必须填写删除原因`);
  }
  if (!protectedDelete) assertMaintenanceTreeDirectEditAllowed(flight.id);

  return maintenanceTransaction(() => {
    const currentFlight=db.prepare('select * from maintenance_flights where id=?').get(flight.id),currentSubtask=db.prepare('select * from maintenance_subtasks where id=?').get(subtaskId);
    if(!currentFlight||!currentSubtask||currentFlight.status!==flight.status||currentFlight.updated_at!==flight.updated_at||currentFlight.report_finalized_at!==flight.report_finalized_at||currentFlight.archived_at!==flight.archived_at||currentSubtask.updated_at!==subtask.updated_at||currentSubtask.status!==subtask.status)throw maintenanceReviewError('机会或工作已变化，请刷新后重新核对删除',409);
    manager = currentMaintenanceDeletionActor(manager, currentFlight, subtaskId);
    retainMaintenanceReportSourcesForFlight(flight.id,manager);
    if(db.prepare('select 1 from maintenance_nonroutine_corrections where subtask_id=?').get(subtaskId))throw maintenanceReviewError('该工作包含独立工时更正，请保留原来源及差额轨迹',409);
    const before = maintenanceFlightDeletionSnapshot(flight.id);
    const assessment=maintenanceNonroutineAssessment(subtask);
    // A managed batch contains independent submitted sources. Removing one
    // cannot invalidate another review or erase another recognized result.
    const managedBatch=Boolean(assessment||db.prepare('select 1 from maintenance_nonroutine_assessments where flight_id=?').get(flight.id));
    if(assessment?.review_case_id)maintenanceCancelReviewForSourceRemoval(assessment.review_case_id,flight.id,subtaskId,manager,'SUBTASK_REMOVAL',deletionReason);
    if(assessment){const source=maintenanceSourceRows(flight.id).find(row=>row.fingerprint===assessment.source_fingerprint);if(source){const table=source.kind==='MANUAL'?'maintenance_nonroutine_manual_sources':'maintenance_nonroutine_import_sources';db.prepare(`update ${table} set state='DELETED',updated_at=? where fingerprint=?`).run(now(),source.fingerprint);}}
    if (!protectedDelete && !managedBatch) {
      invalidateMaintenanceReportCategory(flight.id, "nonroutine", manager, "删除非例行");
    }
    db.prepare("delete from maintenance_report_entries where owner_type='subtask' and owner_id=?").run(subtaskId);
    db.prepare("delete from maintenance_hour_results where owner_type='subtask' and owner_id=?").run(subtaskId);
    db.prepare("delete from maintenance_sortie_results where owner_type='subtask' and owner_id=?").run(subtaskId);
    db.prepare("delete from maintenance_feedback where owner_type='subtask' and owner_id=?").run(subtaskId);
    db.prepare("delete from maintenance_assignments where owner_type='subtask' and owner_id=?").run(subtaskId);
    db.prepare("delete from maintenance_subtasks where id=?").run(subtaskId);
    db.prepare("update maintenance_flights set nonroutine_electronic_signed=null where id=? and not exists(select 1 from maintenance_subtasks where flight_id=?)").run(flight.id, flight.id);

    const remaining = db.prepare("select count(*) as count from maintenance_subtasks where flight_id=?").get(flight.id);
    if (!Number(remaining?.count || 0)) {
      const batch = db.prepare("select id from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(flight.id);
      if (batch) {
        db.prepare("delete from maintenance_report_entries where batch_id=?").run(batch.id);
        db.prepare("delete from maintenance_report_batches where id=?").run(batch.id);
      }
    }

    if (confirmed) {
      db.prepare("update maintenance_flights set status='已确认',updated_by=?,updated_at=? where id=?")
        .run(manager.id, now(), flight.id);
    } else if (pendingReview) {
      db.prepare("update maintenance_flights set status='待复核',updated_by=?,updated_at=? where id=?")
        .run(manager.id, now(), flight.id);
    } else {
      reconcileMaintenanceTreeStatus(flight.id, manager.id);
    }
    maintenanceLog(
      manager,
      confirmed ? "confirmed_subtask_delete" : pendingReview ? "pending_review_subtask_delete" : "delete_subtask",
      "subtask",
      subtaskId,
      flight.id,
      JSON.stringify({
        reason: deletionReason,
        deleted: subtask,
        before
      })
    );
    return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flight.id));
  });
}

function syncMaintenanceOwnerConfirmation(ownerType, ownerId, personId = "") {
  const owner = maintenanceOwner(ownerType, ownerId);
  if (!owner) return;
  reconcileMaintenanceTreeStatus(ownerType === "flight" ? owner.id : owner.flight_id, personId);
}

// B7-2 统计防推断（V1.1 §5.3/D07）：样本量小于阈值时隐藏个人明细行，
// 只保留汇总。阈值可通过 MUC_STATS_MIN_SAMPLE 环境变量调整（默认 5）。
const STATS_MIN_SAMPLE = Number(process.env.MUC_STATS_MIN_SAMPLE) || 5;
function redactSmallSample(items, identityKey = "personId") {
  if (!Array.isArray(items) || items.length >= STATS_MIN_SAMPLE) return items;
  return items.map(item => ({ ...item, [identityKey]: "hidden", name: `样本不足（${items.length}人，阈值${STATS_MIN_SAMPLE}）`, hours: null, sorties: null, taskCount: null, hourTaskCount: null, sortieTaskCount: null }));
}

function maintenanceStats(params = {}, user = null, permission = "maintenance.stats.manage.view") {
  const hourRows = db.prepare(`select h.*,f.date,f.flight_no,f.departure_flight_no,f.aircraft_no,f.work_type,f.card_no,f.card_name
    from maintenance_effective_hour_results h join maintenance_flights f on f.id=h.flight_id
    order by f.date desc,h.user_name`).all();
  const sortieRows = db.prepare(`select s.*,f.date,f.flight_no,f.departure_flight_no,f.aircraft_no,f.work_type,f.card_no,f.card_name
    from maintenance_sortie_results s join maintenance_flights f on f.id=s.flight_id
    order by f.date desc,s.user_name`).all();
  const search = String(params.search || "").trim().toLowerCase();
  const month = String(params.month || "").trim();
  const status = String(params.status || "").trim();
  const filterRows = rows => rows.filter(row => {
    if (user && row.person_id !== user.personId && !actionScopeAllows(user, permission, row.person_id)) return false;
    if (month && month !== "全部" && !String(row.date || "").startsWith(month)) return false;
    if (status && status !== "全部" && row.status !== status) return false;
    if (!search) return true;
    return [row.user_name, row.team, row.flight_no, row.departure_flight_no, row.aircraft_no, row.work_type, row.card_no, row.card_name].some(value => String(value || "").toLowerCase().includes(search));
  });
  const visibleHours = filterRows(hourRows);
  const visibleSorties = filterRows(sortieRows);
  const finalHours = row => row.adjusted_hours === null || row.adjusted_hours === undefined ? Number(row.hours || 0) : Number(row.adjusted_hours || 0);
  const confirmedHours = visibleHours.filter(row => row.status === "已确认");
  const confirmedSorties = visibleSorties.filter(row => row.status === "已确认");
  const people = {}, teams = {};
  const person = row => people[row.person_id] ||= { personId: row.person_id, name: row.user_name, team: row.team || "未设置", hours: 0, hourTaskCount: 0, sorties: 0, sortieTaskCount: 0 };
  const team = row => teams[row.team || "未设置"] ||= { team: row.team || "未设置", hours: 0, hourTaskCount: 0, sorties: 0, sortieTaskCount: 0 };
  for (const row of confirmedHours) {
    person(row).hours += finalHours(row); person(row).hourTaskCount += 1;
    team(row).hours += finalHours(row); team(row).hourTaskCount += 1;
  }
  for (const row of confirmedSorties) {
    person(row).sorties += 1; person(row).sortieTaskCount += 1;
    team(row).sorties += 1; team(row).sortieTaskCount += 1;
  }
  return {
    summary: {
      totalHours: Number(confirmedHours.reduce((sum, row) => sum + finalHours(row), 0).toFixed(2)),
      pendingHours: Number(visibleHours.filter(row => row.status === "待复核").reduce((sum, row) => sum + finalHours(row), 0).toFixed(2)),
      totalSorties: confirmedSorties.length,
      pendingSorties: visibleSorties.filter(row => row.status === "待复核").length,
      confirmedHourCount: confirmedHours.length,
      confirmedSortieCount: confirmedSorties.length,
      taskCount: new Set([...visibleHours, ...visibleSorties].map(row => `${row.owner_type}:${row.owner_id}`)).size
    },
    hours: visibleHours.map(row => publicMaintenanceHour(row)),
    sorties: visibleSorties.map(row => publicMaintenanceSortie(row)),
    people: redactSmallSample(Object.values(people).map(row => ({ ...row, hours: Number(row.hours.toFixed(2)), taskCount: row.hourTaskCount + row.sortieTaskCount })).sort((a, b) => b.hours - a.hours || b.sorties - a.sorties)),
    teams: redactSmallSample(Object.values(teams).map(row => ({ ...row, hours: Number(row.hours.toFixed(2)), taskCount: row.hourTaskCount + row.sortieTaskCount })).sort((a, b) => b.hours - a.hours || b.sorties - a.sorties), "team")
  };
}

const maintenanceReportStatuses = ["未派工", "已派工", "已提报", "待复核", "已确认"];
const maintenanceReportViews = ["dashboard", "people", "opportunities", "nonroutine", "personDetails"];

function maintenanceReportFilters(params = {}) {
  const today = maintenanceDateKey();
  const monthStart = `${today.slice(0, 7)}-01`;
  const status = maintenanceReportStatuses.includes(String(params.status || "")) ? String(params.status) : "已确认";
  const workType = ["all", "routine", "nonroutine"].includes(String(params.workType || "")) ? String(params.workType) : "all";
  const signature = ["all", "routineElectronic", "routinePaper", "nonroutineElectronic", "nonroutinePaper"].includes(String(params.signature || "")) ? String(params.signature) : "all";
  const view = maintenanceReportViews.includes(String(params.view || "")) ? String(params.view) : "dashboard";
  const pageSize = Math.min(100, Math.max(10, Number(params.pageSize || 20) || 20));
  const requestedPersonId = String(params.personId || params.userId || "").trim();
  const compatiblePersonId = requestedPersonId
    ? (db.prepare("select person_id from users where id=?").get(requestedPersonId)?.person_id || requestedPersonId)
    : "";
  const locationIds = String(params.locationIds || "").split(",").map(value => value.trim()).filter(Boolean);
  return {
    view,
    dateFrom: /^\d{4}-\d{2}-\d{2}$/.test(String(params.dateFrom || "")) ? String(params.dateFrom) : monthStart,
    dateTo: /^\d{4}-\d{2}-\d{2}$/.test(String(params.dateTo || "")) ? String(params.dateTo) : today,
    team: String(params.team || "").trim(),
    locationIds,
    userId: compatiblePersonId,
    opportunity: String(params.opportunity || "").trim(),
    nonroutineCategory: maintenanceNonroutineCategories.includes(String(params.nonroutineCategory || "")) ? String(params.nonroutineCategory) : "",
    workType,
    status,
    signature,
    search: String(params.search || "").trim().toLowerCase(),
    page: Math.max(1, Number(params.page || 1) || 1),
    pageSize,
    sort: String(params.sort || "").trim()
  };
}

function maintenanceReportAllowedPersonIds(user, permission = "maintenance.export") {
  if (actionScopeHasAll(user, permission)) return null;
  const scope = actionScopePredicate(user, permission);
  return new Set(db.prepare(`select p.id from personnel p where ${scope.sql}`).all(...scope.params).map(row => row.id));
}

function maintenanceReportOptions(params = {}, user) {
  const filters = maintenanceReportFilters(params);
  if (filters.dateFrom > filters.dateTo) [filters.dateFrom, filters.dateTo] = [filters.dateTo, filters.dateFrom];
  const allowedIds = maintenanceReportAllowedPersonIds(user);
  const rows = db.prepare(`
    select a.person_id,a.user_name,a.team from maintenance_assignments a join maintenance_flights f on f.id=a.flight_id where f.date>=? and f.date<=?
    union all select h.person_id,h.user_name,h.team from maintenance_effective_hour_results h join maintenance_flights f on f.id=h.flight_id where f.date>=? and f.date<=?
    union all select s.person_id,s.user_name,s.team from maintenance_sortie_results s join maintenance_flights f on f.id=s.flight_id where f.date>=? and f.date<=?
  `).all(...Array(3).fill([filters.dateFrom, filters.dateTo]).flat());
  const names = new Map(db.prepare("select id,employee_no from personnel").all().map(row => [row.id, row.employee_no]));
  const people = new Map();
  const teams = new Set();
  for (const row of rows) {
    if (allowedIds && !allowedIds.has(row.person_id)) continue;
    const team = row.team || "未设置";
    teams.add(team);
    if (!people.has(row.person_id)) people.set(row.person_id, { personId: row.person_id, name: row.user_name || "未命名", employeeNo: names.get(row.person_id) || "", teams: new Set() });
    people.get(row.person_id).teams.add(team);
  }
  return {
    people: [...people.values()].map(row => ({ ...row, teams: [...row.teams].sort((a, b) => a.localeCompare(b, "zh-Hans-CN")) })).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN") || a.personId.localeCompare(b.personId)),
    teams: [...teams].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
  };
}

function maintenanceReportSignatureLabel(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value === true || Number(value) === 1) return "电签";
  if (value === false || Number(value) === 0) return "纸签";
  return "";
}

function maintenanceReportDataset(params = {}, user) {
  const filters = maintenanceReportFilters(params);
  const allowedIds = maintenanceReportAllowedPersonIds(user);
  const inScope = id => !allowedIds || allowedIds.has(id);
  const employeeNoQuery = db.prepare("select employee_no from personnel where id=?");
  const employeeNoCache = new Map();
  const employeeNoFor = id => {
    if (!employeeNoCache.has(id)) employeeNoCache.set(id, employeeNoQuery.get(id)?.employee_no || "");
    return employeeNoCache.get(id);
  };
  if (filters.dateFrom > filters.dateTo) [filters.dateFrom, filters.dateTo] = [filters.dateTo, filters.dateFrom];
  const flightRows = db.prepare(`select * from maintenance_flights
    where date>=? and date<=? and status=? order by date desc,flight_no,aircraft_no`).all(filters.dateFrom, filters.dateTo, filters.status);
  const subtaskRows = db.prepare(`select id,flight_id,title,category from maintenance_subtasks`).all();
  const subtasksByFlight = new Map();
  const subtaskById = new Map();
  for (const row of subtaskRows) {
    subtaskById.set(row.id, row);
    subtasksByFlight.set(row.flight_id, [...(subtasksByFlight.get(row.flight_id) || []), row]);
  }
  const flightById = new Map(flightRows.map(row => [row.id, row]));
  if (filters.locationIds.length) for (const [id, flight] of flightById) {
    if (!filters.locationIds.includes(flight.location_id || defaultMaintenanceLocationId)) flightById.delete(id);
  }
  if (allowedIds) {
    const visibleFlightIds = new Set();
    for (const table of ["maintenance_assignments", "maintenance_effective_hour_results", "maintenance_sortie_results"]) {
      for (const row of db.prepare(`select flight_id,person_id from ${table}`).all()) {
        if (flightById.has(row.flight_id) && inScope(row.person_id)) visibleFlightIds.add(row.flight_id);
      }
    }
    for (const id of flightById.keys()) if (!visibleFlightIds.has(id)) flightById.delete(id);
  }
  const scopedNonroutineFlights = new Set();
  if (allowedIds) {
    for (const table of ["maintenance_assignments", "maintenance_effective_hour_results"]) {
      for (const row of db.prepare(`select flight_id,person_id from ${table} where owner_type='subtask'`).all()) {
        if (flightById.has(row.flight_id) && inScope(row.person_id)) scopedNonroutineFlights.add(row.flight_id);
      }
    }
  }
  const hasVisibleNonroutine = id => allowedIds ? scopedNonroutineFlights.has(id) : (subtasksByFlight.get(id) || []).length > 0;
  const signatureMatches = flight => {
    if (filters.signature === "routineElectronic") return Number(flight.routine_electronic_signed) === 1;
    if (filters.signature === "routinePaper") return Number(flight.routine_electronic_signed) === 0;
    if (filters.signature === "nonroutineElectronic") return hasVisibleNonroutine(flight.id) && Number(flight.nonroutine_electronic_signed) === 1;
    if (filters.signature === "nonroutinePaper") return hasVisibleNonroutine(flight.id) && Number(flight.nonroutine_electronic_signed) === 0;
    return true;
  };
  for (const [id, flight] of flightById) {
    const opportunity = flight.work_kind || flight.work_type || "其他";
    if ((filters.opportunity && opportunity !== filters.opportunity) || !signatureMatches(flight)) flightById.delete(id);
  }
  const hourRows = db.prepare(`select h.* from maintenance_effective_hour_results h
    join maintenance_flights f on f.id=h.flight_id
    where f.date>=? and f.date<=? and h.status=?`).all(filters.dateFrom, filters.dateTo, filters.status);
  const sortieRows = db.prepare(`select s.* from maintenance_sortie_results s
    join maintenance_flights f on f.id=s.flight_id
    where f.date>=? and f.date<=? and s.status=?`).all(filters.dateFrom, filters.dateTo, filters.status);
  const resultMatches = (row, includeWorkType = true) => {
    if (!flightById.has(row.flight_id)) return false;
    if (filters.team && row.team !== filters.team) return false;
    if (filters.userId && row.person_id !== filters.userId) return false;
    if (includeWorkType && filters.workType !== "all" && (row.owner_type === "subtask" ? "nonroutine" : "routine") !== filters.workType) return false;
    const flight = flightById.get(row.flight_id);
    const subtask = row.owner_type === "subtask" ? subtaskById.get(row.owner_id) : null;
    const flightText = [flight.date, flight.flight_no, flight.departure_flight_no, flight.aircraft_no, flight.aircraft_type, flight.work_kind, flight.work_type].join(" ").toLowerCase();
    const rowText = [row.person_id, employeeNoFor(row.person_id), row.user_name, row.team, row.role, row.source, subtask?.title, subtask?.category].join(" ").toLowerCase();
    return !filters.search || flightText.includes(filters.search) || rowText.includes(filters.search);
  };
  let hours = hourRows.filter(row => inScope(row.person_id) && resultMatches(row, true));
  let sorties = sortieRows.filter(row => inScope(row.person_id) && resultMatches(row, false));
  const needsParticipantMatch = Boolean(filters.team || filters.userId || filters.workType !== "all");
  if (needsParticipantMatch || filters.search) {
    const eligibilityRows = filters.workType === "all" ? [...hours, ...sorties] : hours;
    const eligible = new Set(eligibilityRows.map(row => row.flight_id));
    if (filters.view === "opportunities") {
      const assignments = db.prepare("select flight_id,owner_type,person_id,user_name,team,role from maintenance_assignments").all();
      for (const row of assignments) {
        if (!flightById.has(row.flight_id) || !inScope(row.person_id)) continue;
        if (filters.team && row.team !== filters.team) continue;
        if (filters.userId && row.person_id !== filters.userId) continue;
        if (filters.workType === "routine" && (row.owner_type !== "flight" || row.role === "放行")) continue;
        if (filters.workType === "nonroutine" && row.owner_type !== "subtask") continue;
        if (filters.search && ![row.person_id, employeeNoFor(row.person_id), row.user_name, row.team, row.role].some(value => String(value || "").toLowerCase().includes(filters.search))) continue;
        eligible.add(row.flight_id);
      }
    }
    if (filters.search) {
      for (const [id, flight] of flightById) {
        const text = [flight.date, flight.flight_no, flight.departure_flight_no, flight.aircraft_no, flight.aircraft_type, flight.work_kind, flight.work_type].join(" ").toLowerCase();
        if (text.includes(filters.search) && !needsParticipantMatch) eligible.add(id);
      }
    }
    for (const id of flightById.keys()) if (!eligible.has(id)) flightById.delete(id);
    hours = hours.filter(row => flightById.has(row.flight_id));
    sorties = sorties.filter(row => flightById.has(row.flight_id));
  }
  const finalHours = row => row.adjusted_hours == null ? Number(row.hours || 0) : Number(row.adjusted_hours || 0);
  const people = new Map();
  const teams = new Map();
  const personFor = row => {
    if (!people.has(row.person_id)) people.set(row.person_id, { userId: row.person_id, personId: row.person_id, name: row.user_name, team: row.team || "未设置", routineHours: 0, nonroutineHours: 0, totalHours: 0, sorties: 0, opportunityIds: new Set(), hourTaskCount: 0 });
    return people.get(row.person_id);
  };
  const teamFor = row => {
    const key = row.team || "未设置";
    if (!teams.has(key)) teams.set(key, { team: key, routineHours: 0, nonroutineHours: 0, totalHours: 0, sorties: 0, opportunityIds: new Set(), peopleIds: new Set() });
    return teams.get(key);
  };
  for (const row of hours) {
    const value = finalHours(row);
    const kind = row.owner_type === "subtask" ? "nonroutineHours" : "routineHours";
    const person = personFor(row);
    person[kind] += value; person.totalHours += value; person.hourTaskCount++; person.opportunityIds.add(row.flight_id);
    const team = teamFor(row);
    team[kind] += value; team.totalHours += value; team.opportunityIds.add(row.flight_id); team.peopleIds.add(row.person_id);
  }
  for (const row of sorties) {
    const count = Number(row.sorties || 1);
    const person = personFor(row);
    person.sorties += count; person.opportunityIds.add(row.flight_id);
    const team = teamFor(row);
    team.sorties += count; team.opportunityIds.add(row.flight_id); team.peopleIds.add(row.person_id);
  }
  const round = value => Number(Number(value || 0).toFixed(2));
  const peopleRows = [...people.values()].map(row => ({ ...row, routineHours: round(row.routineHours), nonroutineHours: round(row.nonroutineHours), totalHours: round(row.totalHours), opportunityCount: row.opportunityIds.size, opportunityIds: undefined }));
  const teamRows = [...teams.values()].map(row => ({ ...row, routineHours: round(row.routineHours), nonroutineHours: round(row.nonroutineHours), totalHours: round(row.totalHours), opportunityCount: row.opportunityIds.size, peopleCount: row.peopleIds.size, opportunityIds: undefined, peopleIds: undefined }));
  const opportunityMap = new Map([...flightById.values()].map(flight => [flight.id, {
    id: flight.id,
    date: flight.date || "",
    flightNo: maintenanceDisplayFlightNo(flight) || "-",
    aircraftNo: flight.aircraft_no || "-",
    aircraftType: flight.aircraft_type || "-",
    locationId: flight.location_id || "",
    locationName: maintenanceLocationName(flight),
    opportunity: flight.work_kind || flight.work_type || "其他",
    status: flight.status,
    routineHours: 0,
    nonroutineHours: 0,
    totalHours: 0,
    sorties: 0,
    participants: new Map(),
    releasePeople: new Set(),
    hasNonroutine: hasVisibleNonroutine(flight.id),
    routineSignature: maintenanceReportSignatureLabel(flight.routine_electronic_signed),
    nonroutineSignature: hasVisibleNonroutine(flight.id) ? maintenanceReportSignatureLabel(flight.nonroutine_electronic_signed) : "不适用"
  }]));
  const wholeHours = db.prepare(`select h.* from maintenance_effective_hour_results h join maintenance_flights f on f.id=h.flight_id where f.date>=? and f.date<=?`)
    .all(filters.dateFrom, filters.dateTo).filter(row => opportunityMap.has(row.flight_id) && inScope(row.person_id));
  const wholeSorties = db.prepare(`select s.* from maintenance_sortie_results s join maintenance_flights f on f.id=s.flight_id where f.date>=? and f.date<=?`)
    .all(filters.dateFrom, filters.dateTo).filter(row => opportunityMap.has(row.flight_id) && inScope(row.person_id));
  for (const row of wholeHours) {
    const item = opportunityMap.get(row.flight_id);
    if (!item) continue;
    const value = finalHours(row);
    if (row.owner_type === "subtask") item.nonroutineHours += value;
    else item.routineHours += value;
    item.totalHours += value;
    item.participants.set(row.person_id, { userId: row.person_id, personId: row.person_id, name: row.user_name, team: row.team || "未设置" });
  }
  for (const row of wholeSorties) {
    const item = opportunityMap.get(row.flight_id);
    if (!item) continue;
    item.sorties += Number(row.sorties || 1);
    item.participants.set(row.person_id, { userId: row.person_id, personId: row.person_id, name: row.user_name, team: row.team || "未设置" });
    item.releasePeople.add(row.user_name);
  }
  for (const row of db.prepare("select flight_id,person_id,user_name,team,role from maintenance_assignments").all()) {
    const item = opportunityMap.get(row.flight_id);
    if (item && inScope(row.person_id)) item.participants.set(row.person_id, { userId: row.person_id, personId: row.person_id, name: row.user_name, team: row.team || "未设置" });
  }
  const opportunities = [...opportunityMap.values()].map(item => ({
    ...item,
    routineHours: round(item.routineHours),
    nonroutineHours: round(item.nonroutineHours),
    totalHours: round(item.totalHours),
    participants: [...item.participants.values()],
    releasePeople: [...item.releasePeople]
  }));
  const signature = (field, applicable = () => true) => {
    const rows = opportunities.filter(applicable);
    const electronic = rows.filter(row => row[field] === "电签").length;
    const paper = rows.filter(row => row[field] === "纸签").length;
    const total = electronic + paper;
    return { electronic, paper, total, electronicPercent: total ? round(electronic * 100 / total) : 0, paperPercent: total ? round(paper * 100 / total) : 0 };
  };
  const summary = {
    status: filters.status,
    routineHours: round(hours.filter(row => row.owner_type !== "subtask").reduce((sum, row) => sum + finalHours(row), 0)),
    nonroutineHours: round(hours.filter(row => row.owner_type === "subtask").reduce((sum, row) => sum + finalHours(row), 0)),
    totalHours: round(hours.reduce((sum, row) => sum + finalHours(row), 0)),
    sorties: sorties.reduce((sum, row) => sum + Number(row.sorties || 1), 0),
    opportunityCount: opportunities.length,
    signaturesAvailable: filters.status === "已确认",
    routineSignature: filters.status === "已确认" ? signature("routineSignature") : { electronic: 0, paper: 0, total: 0, electronicPercent: 0, paperPercent: 0 },
    nonroutineSignature: filters.status === "已确认" ? signature("nonroutineSignature", row => row.hasNonroutine) : { electronic: 0, paper: 0, total: 0, electronicPercent: 0, paperPercent: 0 }
  };
  const hourDetails = hours.map(row => {
    const flight = flightById.get(row.flight_id);
    const subtask = row.owner_type === "subtask" ? subtaskById.get(row.owner_id) : null;
    return { ...publicMaintenanceHour(row), date: flight?.date || "", flightNo: maintenanceDisplayFlightNo(flight || {}) || "-", aircraftNo: flight?.aircraft_no || "-", locationName: maintenanceLocationName(flight), opportunity: flight?.work_kind || flight?.work_type || "其他", type: row.owner_type === "subtask" ? "非例行" : "例行", taskName: subtask?.title || row.role || "" };
  });
  const sortieDetails = sorties.map(row => {
    const flight = flightById.get(row.flight_id);
    return { ...publicMaintenanceSortie(row), date: flight?.date || "", flightNo: maintenanceDisplayFlightNo(flight || {}) || "-", aircraftNo: flight?.aircraft_no || "-", aircraftType: flight?.aircraft_type || "-", locationName: maintenanceLocationName(flight), opportunity: flight?.work_kind || flight?.work_type || "其他" };
  });
  return { filters, summary, people: peopleRows, teams: teamRows, opportunities, hours: hourDetails, sorties: sortieDetails };
}

function maintenanceReportSort(rows, view, sort) {
  const direction = String(sort).endsWith(":asc") ? 1 : -1;
  const key = String(sort || "").split(":")[0];
  const defaultKey = view === "people" ? "totalHours" : "date";
  const field = key || defaultKey;
  return [...rows].sort((left, right) => {
    const a = left[field];
    const b = right[field];
    if(view==="nonroutine"&&field==="actualHours"&&(a==null)!==(b==null))return a==null?1:-1;
    const compared = typeof a === "number" || typeof b === "number" ? Number(a || 0) - Number(b || 0) : String(a || "").localeCompare(String(b || ""), "zh-Hans-CN");
    return compared * direction || String(left.name || left.flightNo || "").localeCompare(String(right.name || right.flightNo || ""), "zh-Hans-CN");
  });
}

function maintenanceNonroutineAuditRow(row, assignments = null, results = null, formalAssignments = null) {
  const hourAssessment = maintenanceNonroutineHourAssessment(row);
  formalAssignments ??= db.prepare("select * from maintenance_assignments where owner_type='subtask' and owner_id=? order by assigned_at,id").all(row.id);
  assignments ??= maintenanceNonroutineParticipantRows(row.id);
  results ??= db.prepare("select * from maintenance_effective_hour_results where owner_type='subtask' and owner_id=? order by created_at,id").all(row.id);
  const byAssignment = new Map();
  for(const result of results){if(!byAssignment.has(result.assignment_id))byAssignment.set(result.assignment_id,[]);byAssignment.get(result.assignment_id).push(result);}
  const people = assignments.flatMap(assignment => {
    const linked = byAssignment.get(assignment.id)||[null];
    byAssignment.delete(assignment.id);
    return linked.map(result=>({ userId: assignment.person_id, personId: assignment.person_id, userName: assignment.user_name, team: assignment.team || "未设置", role: result?.role||assignment.role,assignmentRole:assignment.role,sourceAssignmentId:assignment.id,
      assignmentStatus: assignment.status, resultHours: result ? Number(result.hours || 0) : null,
      adjustedHours: result?.adjusted_hours == null ? null : Number(result.adjusted_hours),
      finalHours: result ? maintenanceFinalHours(result) : null, resultStatus: result?.status || "" }));
  });
  for (const result of [...byAssignment.values()].flat()) people.push({ userId: result.person_id, personId: result.person_id, userName: result.user_name, team: result.team || "未设置", role: result.role,
    assignmentStatus: "原参与来源待核对", resultHours: Number(result.hours || 0), adjustedHours: result.adjusted_hours == null ? null : Number(result.adjusted_hours),
    finalHours: maintenanceFinalHours(result), resultStatus: result.status });
  return { id: row.id, flightId: row.flight_id, date: row.date, flightNo: maintenanceDisplayFlightNo(row) || "", aircraftNo: row.aircraft_no, locationName: maintenanceLocationName(row),
    aircraftType: row.aircraft_type, opportunity: row.work_kind || row.work_type || "其他", chapter: row.card_no || "", title: row.title,
    category: row.category || "其他", reportExplanation: row.content || "", standardHours: hourAssessment ? hourAssessment.effectiveHours : Number(row.standard_hours || 0), hourAssessment, status: row.status,
    assignedCount: new Set(formalAssignments.map(item => item.person_id)).size,
    participantCount: new Set(assignments.map(item=>item.person_id)).size,
    recognitionStatusLabel: hourAssessment?.cancelled ? "评议已取消" : hourAssessment?.reviewPending ? "评议中" : hourAssessment?.syncPending ? "已认定待同步" : hourAssessment ? "已认定" : "历史工作",
    actualHours: results.length ? Number(results.reduce((sum, result) => sum + maintenanceFinalHours(result), 0).toFixed(2)) : null,
    hasResults: results.length > 0, people };
}

function maintenanceNonroutineAuditRows(rows, allowedIds = null) {
  const projected = new Map();
  const group = (items,key) => {const map=new Map();for(const item of items){if(!map.has(item[key]))map.set(item[key],[]);map.get(item[key]).push(item);}return map;};
  for (let start = 0; start < rows.length; start += 200) {
    const chunk=rows.slice(start,start+200),ids=chunk.map(row=>row.id),slots=ids.map(()=>'?').join(','),flightIds=[...new Set(chunk.map(row=>row.flight_id))],flightSlots=flightIds.map(()=>'?').join(',');
    const legacy=group(db.prepare(`select * from maintenance_assignments where owner_type='subtask' and owner_id in (${slots}) order by assigned_at,id`).all(...ids),'owner_id');
    const results=group(db.prepare(`select * from maintenance_effective_hour_results where owner_type='subtask' and owner_id in (${slots}) order by created_at,id`).all(...ids),'owner_id');
    const parents=group(db.prepare(`select * from maintenance_hour_results where owner_type='subtask' and owner_id in (${slots})`).all(...ids),'owner_id');
    const assessments=new Map(db.prepare(`select * from maintenance_nonroutine_assessments where subtask_id in (${slots})`).all(...ids).map(item=>[item.subtask_id,item]));
    const batches=db.prepare(`select * from maintenance_report_batches where report_type='nonroutine' and flight_id in (${flightSlots})`).all(...flightIds),byFlight=new Map(batches.map(item=>[item.flight_id,item]));
    const batchIds=batches.map(item=>item.id),entries=batchIds.length?group(db.prepare(`select * from maintenance_report_entries where batch_id in (${batchIds.map(()=>'?').join(',')}) order by id`).all(...batchIds),'batch_id'):new Map();
    const subtasks=group(db.prepare(`select id,flight_id from maintenance_subtasks where flight_id in (${flightSlots})`).all(...flightIds),'flight_id');
    for(const row of chunk){
      const formal=legacy.get(row.id)||[],batch=byFlight.get(row.flight_id)||null;
      const actual=maintenanceNonroutineParticipantRows(row.id,{owner:row,legacy:formal,batch,entries:entries.get(batch?.id)||[],assessment:assessments.get(row.id)||null,previous:parents.get(row.id)||[],subtasks:subtasks.get(row.flight_id)||[]});
      const visible=items=>allowedIds?items.filter(item=>allowedIds.has(item.person_id)):items;
      const item=maintenanceNonroutineAuditRow(row,visible(actual),visible(results.get(row.id)||[]),visible(formal));
      if(allowedIds && item.hourAssessment?.personalEstimates)item.hourAssessment.personalEstimates=item.hourAssessment.personalEstimates.filter(person=>allowedIds.has(person.personId));
      projected.set(row.id,item);
    }
  }
  return rows.map(row=>projected.get(row.id));
}

// This is a persisted actual report predicate; formal dispatch is a legacy fallback only.
const maintenanceNonroutineActualExistsSql = "exists(select 1 from maintenance_report_entries re join maintenance_report_batches rb on rb.id=re.batch_id where re.owner_type='subtask' and re.owner_id=s.id and re.flight_id=s.flight_id and rb.flight_id=s.flight_id and rb.report_type='nonroutine' and rb.version>=1 and rb.status in ('已提报','待复核','已确认'))";

function maintenanceNonroutineAuditQuery(filters, { paged = true, user, allowedIds = maintenanceReportAllowedPersonIds(user) } = {}) {
  const conditions = ["f.date>=?", "f.date<=?", "s.status=?"];
  const values = [filters.dateFrom, filters.dateTo, filters.status];
  if (filters.locationIds?.length) {
    conditions.push(`f.location_id in (${filters.locationIds.map(() => "?").join(",")})`);
    values.push(...filters.locationIds);
  }
  const scope = allowedIds ? personnelAccess.predicate(user, "maintenance", "sp") : null;
  if (scope) {
    conditions.push(`((not ${maintenanceNonroutineActualExistsSql} and exists(select 1 from maintenance_assignments p join personnel sp on sp.id=p.person_id where p.owner_type='subtask' and p.owner_id=s.id and ${scope.sql}))
      or exists(select 1 from maintenance_report_entries p join maintenance_report_batches rb on rb.id=p.batch_id join personnel sp on sp.id=p.person_id where p.owner_type='subtask' and p.owner_id=s.id and p.flight_id=s.flight_id and rb.flight_id=s.flight_id and rb.report_type='nonroutine' and rb.version>=1 and rb.status in ('已提报','待复核','已确认') and ${scope.sql})
      or exists(select 1 from maintenance_effective_hour_results p join personnel sp on sp.id=p.person_id where p.owner_type='subtask' and p.owner_id=s.id and ${scope.sql}))`);
    values.push(...scope.params, ...scope.params, ...scope.params);
  }
  if (filters.opportunity) { conditions.push("coalesce(nullif(f.work_kind,''),f.work_type)=?"); values.push(filters.opportunity); }
  if (filters.nonroutineCategory) { conditions.push("s.category=?"); values.push(filters.nonroutineCategory); }
  if (filters.signature !== "all" && filters.status === "已确认") {
    const field = filters.signature.startsWith("nonroutine") ? "f.nonroutine_electronic_signed" : "f.routine_electronic_signed";
    conditions.push(`${field}=?`); values.push(filters.signature.endsWith("Electronic") ? 1 : 0);
  }
  if (filters.userId || filters.team) {
    const matches = [];
    for (const table of ["maintenance_assignments", "maintenance_report_entries", "maintenance_effective_hour_results"]) {
      const parts = [`p.owner_type='subtask'`, "p.owner_id=s.id"];
      if(table==='maintenance_assignments')parts.push(`not ${maintenanceNonroutineActualExistsSql}`);
      if(table==='maintenance_report_entries')parts.push("p.flight_id=s.flight_id and exists(select 1 from maintenance_report_batches rb where rb.id=p.batch_id and rb.flight_id=s.flight_id and rb.report_type='nonroutine' and rb.version>=1 and rb.status in ('已提报','待复核','已确认'))");
      if (filters.userId) { parts.push("p.person_id=?"); values.push(filters.userId); }
      if (filters.team) { parts.push("p.team=?"); values.push(filters.team); }
      if (scope) { parts.push(scope.sql); values.push(...scope.params); }
      matches.push(`exists(select 1 from ${table} p ${scope ? "join personnel sp on sp.id=p.person_id" : ""} where ${parts.join(" and ")})`);
    }
    conditions.push(`(${matches.join(" or ")})`);
  }
  if (filters.search) {
    const pattern = `%${filters.search.replace(/[!%_]/g, character => `!${character}`)}%`;
    const personSearch = table => `exists(select 1 from ${table} a left join personnel p on p.id=a.person_id where a.owner_type='subtask' and a.owner_id=s.id
      ${table==='maintenance_assignments'?`and not ${maintenanceNonroutineActualExistsSql}`:table==='maintenance_report_entries'?"and a.flight_id=s.flight_id and exists(select 1 from maintenance_report_batches rb where rb.id=a.batch_id and rb.flight_id=s.flight_id and rb.report_type='nonroutine' and rb.version>=1 and rb.status in ('已提报','待复核','已确认'))":''}
      and lower(coalesce(a.user_name,'') || ' ' || coalesce(a.person_id,'') || ' ' || coalesce(p.employee_no,'')) like ? escape '!'${scope ? ` and ${scope.sql.replaceAll("sp.", "p.")}` : ""})`;
    conditions.push(`(lower(coalesce(f.flight_no,'') || ' ' || coalesce(f.departure_flight_no,'') || ' ' || coalesce(f.aircraft_no,'') || ' ' || coalesce(f.work_kind,'') || ' ' || coalesce(f.work_type,'') || ' ' || coalesce(s.card_no,'') || ' ' || coalesce(s.title,'') || ' ' || coalesce(s.category,'') || ' ' || coalesce(s.content,'')) like ? escape '!'
      or ${personSearch("maintenance_assignments")} or ${personSearch("maintenance_report_entries")} or ${personSearch("maintenance_effective_hour_results")})`);
    values.push(pattern, pattern, ...(scope?.params || []), pattern, ...(scope?.params || []), pattern, ...(scope?.params || []));
  }
  const from = `from maintenance_subtasks s join maintenance_flights f on f.id=s.flight_id where ${conditions.join(" and ")}`;
  const total = Number(db.prepare(`select count(*) as count ${from}`).get(...values)?.count || 0);
  const sort = filters.sort === "date:asc" ? "f.date asc,s.id asc" : filters.sort === "actualHours:desc" || filters.sort === "actualHours:asc"
    ? `case when exists(select 1 from maintenance_effective_hour_results h where h.owner_type='subtask' and h.owner_id=s.id) then 0 else 1 end asc,(select sum(coalesce(h.adjusted_hours,h.hours)) from maintenance_effective_hour_results h where h.owner_type='subtask' and h.owner_id=s.id) ${filters.sort.endsWith("asc") ? "asc" : "desc"},f.date desc,s.id`
    : "f.date desc,s.id desc";
  const limit = paged ? " limit ? offset ?" : "";
  const args = paged ? [...values, filters.pageSize, (filters.page - 1) * filters.pageSize] : values;
  const rows = maintenanceNonroutineAuditRows(db.prepare(`select s.*,f.date,f.flight_no,f.departure_flight_no,f.aircraft_no,f.aircraft_type,f.work_kind,f.work_type,f.location_id,f.location_name_snapshot ${from} order by ${sort}${limit}`).all(...args), allowedIds);
  return { rows, pagination: { page: filters.page, pageSize: filters.pageSize, total, pages: Math.max(1, Math.ceil(total / filters.pageSize)) } };
}

function maintenanceNonroutineAuditDetail(id, user) {
  const row = db.prepare(`select s.*,f.date,f.flight_no,f.departure_flight_no,f.aircraft_no,f.aircraft_type,f.work_kind,f.work_type,f.location_id,f.location_name_snapshot
    from maintenance_subtasks s join maintenance_flights f on f.id=s.flight_id where s.id=?`).get(id);
  if (!row) return null;
  if (!maintenanceCanManage(user)) {
    const assigned = maintenanceNonroutineParticipantRows(id).some(person=>person.person_id===user.personId);
    const result = db.prepare("select 1 from maintenance_effective_hour_results where owner_type='subtask' and owner_id=? and person_id=?").get(id, user.personId);
    if (!assigned && !result) return false;
  }
  if (maintenanceCanManage(user)) {
    const allowedIds = maintenanceReportAllowedPersonIds(user);
    if (allowedIds) {
      const detail = maintenanceNonroutineAuditRows([row], allowedIds)[0];
      return detail.people.length ? detail : false;
    }
  }
  return maintenanceNonroutineAuditRow(row);
}

function maintenanceOpportunityAuditDetail(id, allowedIds = null) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(id);
  if (!flight) return null;
  const inScope = row => !allowedIds || allowedIds.has(row.person_id);
  if (allowedIds && !["maintenance_assignments", "maintenance_effective_hour_results", "maintenance_sortie_results"].some(table =>
    db.prepare(`select person_id from ${table} where flight_id=?`).all(id).some(inScope))) return null;
  const assignments = db.prepare("select * from maintenance_assignments where flight_id=? and owner_type='flight' order by assigned_at,id").all(id).filter(inScope);
  const hours = db.prepare("select * from maintenance_effective_hour_results where flight_id=? and owner_type='flight' order by created_at,id").all(id).filter(inScope);
  const sorties = db.prepare("select * from maintenance_sortie_results where flight_id=? order by created_at,id").all(id).filter(inScope);
  const hourByAssignment = new Map(hours.map(row => [row.assignment_id, row]));
  const sortieByAssignment = new Map(sorties.map(row => [row.assignment_id, row]));
  const people = assignments.map(row => {
    const hour = hourByAssignment.get(row.id);
    const sortie = sortieByAssignment.get(row.id);
    hourByAssignment.delete(row.id);
    sortieByAssignment.delete(row.id);
    return { userId: row.person_id, personId: row.person_id, userName: row.user_name, team: row.team || "未设置", role: row.role, assignmentStatus: row.status,
      resultHours: hour ? Number(hour.hours || 0) : null, adjustedHours: hour?.adjusted_hours == null ? null : Number(hour.adjusted_hours),
      finalHours: hour ? maintenanceFinalHours(hour) : null, resultStatus: hour?.status || sortie?.status || "",
      sorties: sortie ? Number(sortie.sorties || 0) : null };
  });
  for (const row of [...hourByAssignment.values(), ...sortieByAssignment.values()]) {
    people.push({ userId: row.person_id, personId: row.person_id, userName: row.user_name, team: row.team || "未设置", role: row.role,
      assignmentStatus: "派工记录缺失", resultHours: row.owner_type === "flight" && row.role !== "放行" ? Number(row.hours || 0) : null,
      adjustedHours: row.adjusted_hours == null ? null : Number(row.adjusted_hours), finalHours: row.role === "放行" ? null : maintenanceFinalHours(row),
      resultStatus: row.status, sorties: row.role === "放行" ? Number(row.sorties || 0) : null });
  }
  const subtasks = maintenanceNonroutineAuditRows(db.prepare(`select s.*,f.date,f.flight_no,f.departure_flight_no,f.aircraft_no,f.aircraft_type,f.work_kind,f.work_type,f.location_id,f.location_name_snapshot
    from maintenance_subtasks s join maintenance_flights f on f.id=s.flight_id where s.flight_id=? order by s.created_at,s.id`).all(id), allowedIds)
    .filter(row => !allowedIds || row.people.length);
  const routineHours = hours.reduce((sum, row) => sum + maintenanceFinalHours(row), 0);
  const nonroutineHours = subtasks.reduce((sum, row) => sum + row.actualHours, 0);
  return { id, date: flight.date, flightNo: maintenanceDisplayFlightNo(flight) || "", aircraftNo: flight.aircraft_no, locationName: maintenanceLocationName(flight), opportunity: flight.work_kind || flight.work_type || "其他",
    status: flight.status, routineHours: Number(routineHours.toFixed(2)), nonroutineHours: Number(nonroutineHours.toFixed(2)),
    totalHours: Number((routineHours + nonroutineHours).toFixed(2)), sorties: sorties.reduce((sum, row) => sum + Number(row.sorties || 0), 0),
    people, subtasks };
}

function maintenanceReport(params = {}, user) {
  const filters = maintenanceReportFilters(params);
  if (filters.view === "nonroutine") {
    if (filters.dateFrom > filters.dateTo) [filters.dateFrom, filters.dateTo] = [filters.dateTo, filters.dateFrom];
    return { filters, ...maintenanceNonroutineAuditQuery(filters, { user }) };
  }
  const data = maintenanceReportDataset(params, user);
  if (data.filters.view === "personDetails") {
    const byFlightDate = (left, right) => String(right.date || "").localeCompare(String(left.date || ""))
      || String(left.flightNo || "").localeCompare(String(right.flightNo || ""), "zh-Hans-CN")
      || String(left.aircraftNo || "").localeCompare(String(right.aircraftNo || ""), "zh-Hans-CN")
      || String(left.flightId || "").localeCompare(String(right.flightId || ""));
    return { filters: data.filters, summary: data.summary, hours: [...data.hours].sort(byFlightDate), sorties: [...data.sorties].sort(byFlightDate) };
  }
  const source = data.filters.view === "people" ? data.people : data.filters.view === "opportunities" ? data.opportunities : [];
  const rows = maintenanceReportSort(source, data.filters.view, data.filters.sort);
  const total = rows.length;
  const start = (data.filters.page - 1) * data.filters.pageSize;
  return {
    filters: data.filters,
    summary: data.summary,
    rows: rows.slice(start, start + data.filters.pageSize),
    pagination: { page: data.filters.page, pageSize: data.filters.pageSize, total, pages: Math.max(1, Math.ceil(total / data.filters.pageSize)) }
  };
}

const personalRoutineRoles = ["接机", "送机", "勤务", "例行检查", "例行机内", "例行L/G", "例行发动机", "例行机外", "例行电子"];

function maintenanceDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseMaintenanceDateKey(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : null;
}

function normalizeMaintenanceStatsDate(value) {
  const match = String(value || "").trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!match) return String(value || "").trim();
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
}

function shiftMaintenanceDate(value, days) {
  const date = typeof value === "string" ? parseMaintenanceDateKey(value) : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + Number(days || 0));
  return maintenanceDateKey(date);
}

function maintenanceMonthBounds(month) {
  const today = new Date();
  const fallback = maintenanceDateKey(today).slice(0, 7);
  const normalized = /^\d{4}-\d{2}$/.test(String(month || "")) ? String(month) : fallback;
  const [year, monthNumber] = normalized.split("-").map(Number);
  const start = `${normalized}-01`;
  const end = maintenanceDateKey(new Date(year, monthNumber, 0, 12));
  return { month: normalized, start, end, current: normalized === fallback };
}

function maintenancePersonalHourRows() {
  return db.prepare(`select h.*,f.date,f.flight_no,f.departure_flight_no,f.aircraft_no,f.aircraft_type,f.work_type,f.work_kind,f.location_id,f.location_name_snapshot,
      st.title as subtask_title,st.category as subtask_category,st.card_no as subtask_card_no
    from maintenance_effective_hour_results h
    join maintenance_flights f on f.id=h.flight_id
    left join maintenance_subtasks st on h.owner_type='subtask' and st.id=h.owner_id
    where h.status in ('已提报','待复核','已确认')
    order by f.date desc,h.updated_at desc,h.id`).all()
    .map(row => ({ ...row, date: normalizeMaintenanceStatsDate(row.date) }));
}

function maintenancePersonalSortieRows() {
  return db.prepare(`select s.*,f.date,f.flight_no,f.departure_flight_no,f.aircraft_no,f.aircraft_type,f.work_type,f.work_kind,f.location_id,f.location_name_snapshot
    from maintenance_sortie_results s join maintenance_flights f on f.id=s.flight_id
    where s.status in ('已提报','待复核','已确认')
    order by f.date desc,s.updated_at desc,s.id`).all()
    .map(row => ({ ...row, date: normalizeMaintenanceStatsDate(row.date) }));
}

function maintenanceFinalHours(row) {
  return row.adjusted_hours === null || row.adjusted_hours === undefined
    ? Number(row.hours || 0)
    : Number(row.adjusted_hours || 0);
}

function maintenancePersonalCategory(row) {
  if (row.owner_type !== "subtask") return personalRoutineRoles.includes(row.role) ? row.role : (row.role || "其他例行");
  const category = String(row.subtask_category || "").trim();
  if (["工卡指令", "EO", "工程指令"].includes(category)) return "工卡指令";
  if (["单项工作", "ADD WORK", "NRC", "临时工作"].includes(category)) return "单项工作";
  if (category === "拖机") return "拖机";
  return "其他";
}

function maintenancePersonalHourDetail(row) {
  return {
    id: row.id,
    flightId: row.flight_id || "",
    subtaskId: row.owner_type === "subtask" ? row.owner_id : "",
    date: row.date || "",
    flightNo: maintenanceDisplayFlightNo(row) || "-",
    aircraftNo: row.aircraft_no || "-",
    aircraftType: row.aircraft_type || "-",
    opportunity: row.work_kind || row.work_type || "其他",
    locationName: maintenanceLocationName(row),
    taskName: row.owner_type === "subtask" ? (row.subtask_title || row.subtask_card_no || "非例行") : (row.work_kind || row.work_type || "维修机会"),
    role: row.role || "-",
    category: maintenancePersonalCategory(row),
    type: row.owner_type === "subtask" ? "nonroutine" : "routine",
    hours: Number(maintenanceFinalHours(row).toFixed(2)),
    status: row.status
  };
}

function maintenancePersonalComparison(members, totals, personId) {
  const ownHours = Number(totals.get(personId) || 0);
  const normalizedUserId = String(personId || "");
  const ordered = members.map(member => ({ ...member, hours: Number(totals.get(member.id) || 0) }))
    .sort((a, b) => b.hours - a.hours || String(a.name).localeCompare(String(b.name), "zh-Hans-CN"));
  const higher = ordered.filter(member => member.hours > ownHours);
  const lowerCount = ordered.filter(member => String(member.id || "") !== normalizedUserId && member.hours < ownHours).length;
  const comparisonCount = Math.max(0, ordered.length - 1);
  const nextHigher = higher.length ? higher[higher.length - 1] : null;
  return {
    memberCount: ordered.length,
    rank: higher.length + 1,
    exceededPercent: comparisonCount ? Math.min(100, Number((lowerCount / comparisonCount * 100).toFixed(1))) : 0,
    gapHours: nextHigher ? Number((nextHigher.hours - ownHours).toFixed(2)) : 0,
    isHighest: !nextHigher,
    ownHours: Number(ownHours.toFixed(2))
  };
}

function maintenancePersonalReviewEstimates(month, user) {
  const rows = db.prepare(`select s.*,f.date,f.flight_no,f.departure_flight_no,f.aircraft_no
    from maintenance_nonroutine_assessments a
    join maintenance_subtasks s on s.id=a.subtask_id and s.flight_id=a.flight_id
    join maintenance_flights f on f.id=a.flight_id
    where a.source_kind='REVIEW' and a.effective_hours is null and f.date like ?
    order by f.date desc,s.id`).all(month + "%");
  const items = [];
  for (const row of rows) {
    const assessment = maintenanceNonroutineAssessment(row);
    const participants = JSON.parse(assessment.participants_json);
    if (!participants.some(person => person.personId === user.personId)) continue;
    const view = maintenanceNonroutineHourAssessment(row);
    if (!view?.reviewPending) continue;
    const estimate = view.personalEstimates.find(person => person.personId === user.personId);
    const review = db.prepare("select state from maintenance_nonroutine_review_cases where id=?").get(view.reviewCaseId);
    const progress = db.prepare("select count(*) as total from maintenance_nonroutine_review_opinions where case_id=?").get(view.reviewCaseId);
    items.push({
      subtaskId: row.id, opportunityId: row.flight_id, reviewCaseId: view.reviewCaseId,
      date: row.date, flightNo: maintenanceDisplayFlightNo(row), aircraftNo: row.aircraft_no,
      title: row.title, requestedHours: view.requestedHours,
      estimatedHours: estimate?.hours ?? null, state: review.state,
      submittedOpinions: Number(progress.total), requiredOpinions: 12
    });
  }
  const unallocated = items.filter(item => item.estimatedHours === null).length;
  const knownHours = Math.round(items.reduce((sum, item) => sum + (item.estimatedHours ?? 0), 0) * 100) / 100;
  return { count: items.length, unallocatedCount: unallocated, estimatedHours: unallocated ? null : knownHours, items };
}

function maintenancePersonalStats(params, user) {
  const bounds = maintenanceMonthBounds(params.month);
  const range = params.range === "month" ? "month" : "half";
  const today = maintenanceDateKey();
  const todayDate = parseMaintenanceDateKey(today);
  const mondayOffset = (todayDate.getDay() + 6) % 7;
  const weekStart = shiftMaintenanceDate(today, -mondayOffset);
  const weekEnd = shiftMaintenanceDate(weekStart, 6);
  const rangeEnd = bounds.current && today < bounds.end ? today : bounds.end;
  const rangeStart = range === "half" && shiftMaintenanceDate(rangeEnd, -14) > bounds.start
    ? shiftMaintenanceDate(rangeEnd, -14)
    : bounds.start;
  const allResultHours = maintenancePersonalHourRows().filter(row=>row.person_id===user.personId || actionScopeAllows(user,"maintenance.stats.self.view",row.person_id));
  const allResultSorties = maintenancePersonalSortieRows().filter(row=>row.person_id===user.personId || actionScopeAllows(user,"maintenance.stats.self.view",row.person_id));
  const allHours = allResultHours.filter(row => row.status === "已确认");
  const ownConfirmedHours = allHours.filter(row => row.person_id === user.personId);
  const ownPendingHours = allResultHours.filter(row => row.person_id === user.personId && row.status !== "已确认");
  const ownConfirmedSorties = allResultSorties.filter(row => row.person_id === user.personId && row.status === "已确认");
  const ownPendingSorties = allResultSorties.filter(row => row.person_id === user.personId && row.status !== "已确认");
  const selectedMonthHours = ownConfirmedHours.filter(row => String(row.date || "").startsWith(bounds.month));
  const selectedMonthPendingHours = ownPendingHours.filter(row => String(row.date || "").startsWith(bounds.month));
  const todayHours = ownConfirmedHours.filter(row => row.date === today);
  const todayPendingHours = ownPendingHours.filter(row => row.date === today);
  const weekHours = ownConfirmedHours.filter(row => row.date >= weekStart && row.date <= weekEnd);
  const weekPendingHours = ownPendingHours.filter(row => row.date >= weekStart && row.date <= weekEnd);
  const monthSorties = ownConfirmedSorties.filter(row => String(row.date || "").startsWith(bounds.month));
  const locationIds = new Set([...selectedMonthHours, ...monthSorties].map(row => row.location_id || defaultMaintenanceLocationId));
  const locationBreakdown = [...locationIds].map(id => ({
    id,
    name: maintenanceLocationName({ location_id: id }),
    hours: Number(selectedMonthHours.filter(row => (row.location_id || defaultMaintenanceLocationId) === id).reduce((sum, row) => sum + maintenanceFinalHours(row), 0).toFixed(2)),
    sorties: monthSorties.filter(row => (row.location_id || defaultMaintenanceLocationId) === id).reduce((sum, row) => sum + Number(row.sorties || 1), 0)
  })).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  const monthPendingSorties = ownPendingSorties.filter(row => String(row.date || "").startsWith(bounds.month));
  const sumHours = rows => Number(rows.reduce((sum, row) => sum + maintenanceFinalHours(row), 0).toFixed(2));
  const sumSorties = rows => rows.reduce((sum, row) => sum + Number(row.sorties || 1), 0);

  const daily = new Map();
  for (const [rows, pending] of [[selectedMonthHours, false], [selectedMonthPendingHours, true]]) {
    for (const row of rows) {
      if (row.date < rangeStart || row.date > rangeEnd) continue;
      const item = daily.get(row.date) || { date: row.date, total: 0, routine: 0, nonroutine: 0, pendingTotal: 0, pendingRoutine: 0, pendingNonroutine: 0 };
      const hours = maintenanceFinalHours(row);
      const type = row.owner_type === "subtask" ? "nonroutine" : "routine";
      item[pending ? "pendingTotal" : "total"] += hours;
      item[pending ? `pending${type[0].toUpperCase()}${type.slice(1)}` : type] += hours;
      daily.set(row.date, item);
    }
  }
  const trend = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).map(item => ({
    date: item.date,
    total: Number(item.total.toFixed(2)),
    routine: Number(item.routine.toFixed(2)),
    nonroutine: Number(item.nonroutine.toFixed(2)),
    pendingTotal: Number(item.pendingTotal.toFixed(2)),
    pendingRoutine: Number(item.pendingRoutine.toFixed(2)),
    pendingNonroutine: Number(item.pendingNonroutine.toFixed(2))
  }));

  const compositionFor = (confirmedRows, pendingRows) => {
    const totals = new Map();
    for (const [rows, key] of [[confirmedRows, "hours"], [pendingRows, "pendingHours"]]) {
      for (const row of rows) {
        const category = maintenancePersonalCategory(row);
        const current = totals.get(category) || { hours: 0, pendingHours: 0 };
        current[key] += maintenanceFinalHours(row);
        totals.set(category, current);
      }
    }
    const total = sumHours(confirmedRows);
    const pendingTotal = sumHours(pendingRows);
    return {
      total,
      pendingTotal,
      items: [...totals.entries()].map(([category, values]) => ({
        category,
        hours: Number(values.hours.toFixed(2)),
        pendingHours: Number(values.pendingHours.toFixed(2)),
        percent: total ? Number((values.hours / total * 100).toFixed(1)) : 0
      })).sort((a, b) => (b.hours + b.pendingHours) - (a.hours + a.pendingHours) || a.category.localeCompare(b.category, "zh-Hans-CN"))
    };
  };

  // Rankings use the capability-participating population, while the actual
  // maintenance rows above intentionally continue to include cadres.
  const activeMembers = maintenanceCapabilityPeople();
  const monthTotals = new Map();
  for (const row of allHours) {
    if (!String(row.date || "").startsWith(bounds.month)) continue;
    monthTotals.set(row.person_id, (monthTotals.get(row.person_id) || 0) + maintenanceFinalHours(row));
  }
  const currentPerson=activeMembers.find(member=>member.id===user.personId);
  // Full populations are used only to check completeness, never returned to a
  // partially scoped caller or used to expand their maintenance result rows.
  const fullMembers = currentPerson ? maintenanceCapabilityPeople({sql:"1=1",params:[]}) : [];
  const scopedIds = new Set(activeMembers.map(member=>member.id));
  const teamMembers = currentPerson?.teamId ? activeMembers.filter(member => member.teamId === currentPerson.teamId) : [];
  const teamScopeComplete = !!currentPerson?.teamId && fullMembers.filter(member=>member.teamId===currentPerson.teamId).every(member=>scopedIds.has(member.id));
  const teamComparison = teamScopeComplete ? maintenancePersonalComparison(teamMembers, monthTotals, user.personId) : {};
  const teamTotal = teamMembers.reduce((sum, member) => sum + Number(monthTotals.get(member.id) || 0), 0);
  teamComparison.available = teamScopeComplete && teamMembers.some(member => member.id === user.personId);
  teamComparison.reason = currentPerson?.teamId ? (teamScopeComplete?"":"incomplete_scope") : "not_participant";
  teamComparison.team = currentPerson?.team || "未设置";
  if (teamComparison.available) teamComparison.contributionPercent = teamTotal ? Number((teamComparison.ownHours / teamTotal * 100).toFixed(1)) : 0;

  const departmentMembers = currentPerson?.departmentId ? activeMembers.filter(member => member.departmentId===currentPerson.departmentId) : [];
  const fullDepartmentMembers = currentPerson?.departmentId
    ? fullMembers.filter(member=>member.departmentId===currentPerson.departmentId)
    : [];
  const scopedDepartmentIds = new Set(departmentMembers.map(member=>member.id));
  const departmentScopeComplete = !!currentPerson?.departmentId
    && fullDepartmentMembers.every(member=>scopedDepartmentIds.has(member.id));
  const comparisonMembers = departmentScopeComplete ? departmentMembers : [];
  const departmentComparison = maintenancePersonalComparison(comparisonMembers, monthTotals, user.personId);
  departmentComparison.available = departmentScopeComplete && comparisonMembers.some(member=>member.id===user.personId);
  departmentComparison.department=currentPerson?.department||"未分配";
  departmentComparison.reason=currentPerson ? (departmentScopeComplete?"":"incomplete_scope") : "not_participant";
  // Compatibility alias for older clients. Its semantics now match the
  // department-wide comparison and it can be removed after clients migrate.
  const groupComparison = {...departmentComparison};

  const rankingTeams=organizationLanes(db).filter(team=>team.organizationId);
  const rankingTeamIds = new Set(rankingTeams.map(team=>team.organizationId));
  const ranksParticipate = rankingTeamIds.has(currentPerson?.teamId);
  const rankingScopeComplete = ranksParticipate && fullMembers.filter(member=>rankingTeamIds.has(member.teamId)).every(member=>scopedIds.has(member.id));
  const teamRanking = { available: rankingScopeComplete, team: currentPerson?.team || "未设置", reason:ranksParticipate?(rankingScopeComplete?"":"incomplete_scope"):"not_participant" };
  if (teamRanking.available) {
    teamRanking.teamCount = rankingTeams.length;
    const teamTotals = rankingTeams.map(team => ({
      team:team.name,teamId:team.organizationId,
      hours: Number(activeMembers.filter(member => member.teamId === team.organizationId).reduce((sum, member) => sum + Number(monthTotals.get(member.id) || 0), 0).toFixed(2))
    }));
    const ownTeam = teamTotals.find(item => item.teamId === currentPerson.teamId);
    const higher = teamTotals.filter(item => item.hours > ownTeam.hours).sort((a, b) => a.hours - b.hours);
    const nextHigher = higher[0] || null;
    Object.assign(teamRanking, {
      rank: higher.length + 1,
      totalHours: ownTeam.hours,
      gapHours: nextHigher ? Number((nextHigher.hours - ownTeam.hours).toFixed(2)) : 0,
      isHighest: !nextHigher
    });
  }

  return {
    underReview: maintenancePersonalReviewEstimates(bounds.month, user),
    locationBreakdown,
    period: { month: bounds.month, range, today, weekStart, weekEnd, trendStart: rangeStart, trendEnd: rangeEnd },
    metrics: {
      todayHours: sumHours(todayHours),
      pendingTodayHours: sumHours(todayPendingHours),
      weekHours: sumHours(weekHours),
      pendingWeekHours: sumHours(weekPendingHours),
      monthHours: sumHours(selectedMonthHours),
      pendingMonthHours: sumHours(selectedMonthPendingHours),
      monthSorties: sumSorties(monthSorties),
      pendingMonthSorties: sumSorties(monthPendingSorties)
    },
    teamComparison,
    departmentComparison,
    groupComparison,
    teamRanking,
    trend,
    composition: {
      day: compositionFor(todayHours, todayPendingHours),
      month: compositionFor(selectedMonthHours, selectedMonthPendingHours)
    }
  };
}

function maintenancePersonalDetails(params, user) {
  const bounds = maintenanceMonthBounds(params.month);
  const type = ["routine", "nonroutine", "sortie", "all"].includes(params.type) ? params.type : "all";
  const resultStatus = params.status === "pending" ? "pending" : "confirmed";
  const matchesStatus = row => resultStatus === "pending" ? row.status !== "已确认" : row.status === "已确认";
  if (type === "sortie") {
    const rows = maintenancePersonalSortieRows().filter(row => row.person_id === user.personId && matchesStatus(row) && String(row.date || "").startsWith(bounds.month) && (!params.locationId || (row.location_id || defaultMaintenanceLocationId) === params.locationId));
    return {
      title: `${bounds.month} ${resultStatus === "pending" ? "待复核" : ""}放行架次明细`,
      unit: "架次",
      rows: rows.map(row => ({
        id: row.id,
        date: row.date || "",
        flightNo: maintenanceDisplayFlightNo(row) || "-",
        aircraftNo: row.aircraft_no || "-",
        aircraftType: row.aircraft_type || "-",
        opportunity: row.work_kind || row.work_type || "其他",
        locationName: maintenanceLocationName(row),
        role: "放行",
        sorties: 1,
        status: row.status
      }))
    };
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(params.date || "")) ? String(params.date) : "";
  const period = params.period === "month" ? "month" : "day";
  const category = String(params.category || "").trim();
  let rows = maintenancePersonalHourRows().filter(row => row.person_id === user.personId && matchesStatus(row));
  if (params.locationId) rows = rows.filter(row => (row.location_id || defaultMaintenanceLocationId) === params.locationId);
  if (date) rows = rows.filter(row => row.date === date);
  else if (period === "month") rows = rows.filter(row => String(row.date || "").startsWith(bounds.month));
  if (type === "routine") rows = rows.filter(row => row.owner_type !== "subtask");
  if (type === "nonroutine") rows = rows.filter(row => row.owner_type === "subtask");
  if (category) rows = rows.filter(row => maintenancePersonalCategory(row) === category);
  const details = rows.map(maintenancePersonalHourDetail);
  return {
    title: date ? `${date} ${resultStatus === "pending" ? "待复核" : ""}工时明细` : `${bounds.month} ${resultStatus === "pending" ? "待复核" : ""}${category || "工时"}明细`,
    unit: "小时",
    total: Number(details.reduce((sum, row) => sum + row.hours, 0).toFixed(2)),
    rows: details
  };
}

function insertMaintenanceFlight(payload, user) {
  const id = randomId("mtnf");
  db.prepare(`insert into maintenance_flights(id,date,flight_no,departure_flight_no,aircraft_no,aircraft_type,stand,planned_arrival,planned_departure,work_type,card_no,card_name,work_kind,standard_hours,status,remark,source,created_by,updated_by,created_at,updated_at,location_id,location_name_snapshot)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, payload.date, payload.flightNo, payload.departureFlightNo || "", payload.aircraftNo, payload.aircraftType, payload.stand, payload.plannedArrival, payload.plannedDeparture, payload.workType, payload.cardNo, payload.cardName, payload.workKind, payload.standardHours, payload.status, payload.remark, payload.source, user.id, user.id, now(), now(), payload.location.id, payload.location.name);
  maintenanceLog(user, "create_flight", "flight", id, id, payload.flightNo || "");
  if (process.env.MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED === "1") {
    const identity = createMaintenanceModuleInstances({db,opportunityId:id,actorId:user.id,stamp:now()});
    maintenanceLog(user,"create_module_instances","flight",id,id,JSON.stringify({
      gateRuleVersion:identity.gateRuleVersion,ruleSnapshotSha256:identity.ruleSnapshotSha256,
      moduleInstanceIds:identity.instances.map(instance=>instance.id)
    }));
  }
  return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(id));
}

function updateMaintenanceFlight(id, payload, user) {
  const existing = db.prepare("select * from maintenance_flights where id=?").get(id);
  if (!existing) return null;
  const identityChanged=[['date','date'],['aircraftNo','aircraft_no'],['aircraftType','aircraft_type']].some(([field,column])=>String(payload[field]||'')!==String(existing[column]||''));
  if(identityChanged&&db.prepare(`select 1 from maintenance_nonroutine_assessments where flight_id=? and effective_hours is not null
    union all select 1 from maintenance_nonroutine_posting_receipts p join maintenance_nonroutine_review_cases c on c.id=p.case_id where c.flight_id=? limit 1`).get(id,id)){
    throw maintenanceReviewError('该机会已有正式认定工时，普通修改不能变更作业日期、机号或机型，请核实原认定来源',409);
  }
  db.prepare(`update maintenance_flights set date=?,flight_no=?,departure_flight_no=?,aircraft_no=?,aircraft_type=?,stand=?,planned_arrival=?,planned_departure=?,work_type=?,card_no=?,card_name=?,work_kind=?,standard_hours=?,status=?,remark=?,updated_by=?,updated_at=?,location_id=?,location_name_snapshot=? where id=?`)
    .run(payload.date, payload.flightNo, payload.departureFlightNo === undefined ? existing.departure_flight_no || "" : payload.departureFlightNo, payload.aircraftNo, payload.aircraftType, payload.stand, payload.plannedArrival, payload.plannedDeparture, payload.workType, payload.cardNo, payload.cardName, payload.workKind, payload.standardHours, existing.status, payload.remark, user.id, timestampAfter(existing.updated_at), payload.location.id, payload.location.name, id);
  maintenanceLog(user, "update_flight", "flight", id, id, payload.flightNo || "");
  reconcileMaintenanceTreeStatus(id, user.id);
  return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(id));
}

function insertMaintenanceSubtask(flightId, payload, user) {
  assertMaintenanceLegacyTowCreation(payload.category);
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) return null;
  const id = randomId("mtns");
  db.prepare(`insert into maintenance_subtasks(id,flight_id,card_no,title,content,category,standard_hours,priority,status,remark,created_by,updated_by,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, flightId, payload.cardNo, payload.title, payload.content, payload.category, payload.standardHours, payload.priority, payload.status, payload.remark, user.id, user.id, now(), now());
  maintenanceLog(user, "create_subtask", "subtask", id, flightId, payload.title || "");
  reconcileMaintenanceTreeStatus(flightId, user.id);
  return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId));
}

function updateMaintenanceSubtask(id, payload, user) {
  const existing = db.prepare("select * from maintenance_subtasks where id=?").get(id);
  if (!existing) return null;
  assertMaintenanceLegacyTowCreation(payload.category,{existingCategory:existing.category});
  db.prepare(`update maintenance_subtasks set card_no=?,title=?,content=?,category=?,standard_hours=?,priority=?,status=?,remark=?,updated_by=?,updated_at=? where id=?`)
    .run(payload.cardNo, payload.title, payload.content, payload.category, payload.standardHours, payload.priority, existing.status, payload.remark, user.id, now(), id);
  maintenanceLog(user, "update_subtask", "subtask", id, existing.flight_id, payload.title || "");
  reconcileMaintenanceTreeStatus(existing.flight_id, user.id);
  return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(existing.flight_id));
}

function assertMaintenanceTreeDirectEditAllowed(flightId) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) return null;
  if (flight.status === "已确认" || flight.archived_at) {
    throw maintenanceReviewError("已确认数据已归档，请在任务树复核中填写原因后修改", 409);
  }
  if (flight.report_finalized_at) {
    throw maintenanceReviewError("该维修机会已进入待复核，请在任务树复核中调整", 409);
  }
  return flight;
}

function assertMaintenanceManagedContentUnlocked(flightId) {
  if(db.prepare('select 1 from maintenance_nonroutine_assessments a join maintenance_subtasks s on s.id=a.subtask_id and s.flight_id=a.flight_id where a.flight_id=? limit 1').get(flightId))throw maintenanceReviewError('非例行已正式提报并保留认定来源，不能通过内容维护覆盖或作废批次；请使用原有权报工更正流程',409);
}

function maintenanceCurrentMutationActor(user,flightId,permission='maintenance.content.manage') {
  const row=db.prepare("select u.* from users u join personnel p on p.id=u.person_id where u.id=? and u.person_id=? and coalesce(u.status,'active')='active' and p.data_status='active' and coalesce(p.employment_status,'') not in ('离职','停职')").get(user.id,user.personId);
  const current=row?toUser(row):null;
  if(!current||!hasRbac(current,permission))throw maintenanceReviewError('当前人员或维修维护权限已失效',403);
  const flight=db.prepare('select * from maintenance_flights where id=?').get(flightId);if(!flight)throw maintenanceReviewError('未找到航班任务',404);
  const assigned=db.prepare('select person_id from maintenance_assignments where flight_id=?').all(flightId);
  if(!actionScopeHasAll(current,permission)&&flight.created_by!==current.id&&!assigned.some(item=>item.person_id===current.personId||actionScopeAllows(current,permission,item.person_id))&&!dataScopeAllowsUser(current,flight.created_by,'maintenance'))throw maintenanceReviewError('未找到可访问的维修机会',404);
  const batch=db.prepare("select id from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(flightId);
  if(permission==='maintenance.content.manage'&&batch&&db.prepare("select person_id from maintenance_assignments where flight_id=? and owner_type='subtask'").all(flightId).some(item=>!actionScopeAllows(current,permission,item.person_id)))throw maintenanceReviewError('批次包含当前维修范围外人员，不能作废或覆盖',403);
  return current;
}

function invalidateMaintenanceReportCategory(flightId, reportType, user, reason = "") {
  if(reportType==='nonroutine')assertMaintenanceManagedContentUnlocked(flightId);
  const batch = db.prepare("select * from maintenance_report_batches where flight_id=? and report_type=?").get(flightId, reportType);
  if (!batch || !["已提报", "预填"].includes(batch.status)) return false;
  retainMaintenanceReportSource(batch.id,user);
  if (reportType === "release") {
    db.prepare("delete from maintenance_sortie_results where flight_id=? and status<>'已确认'").run(flightId);
    db.prepare("update maintenance_assignments set status='已派工',feedback='',completed_at='',submitted_at='',modified_at=?,confirmed_at='' where owner_type='flight' and owner_id=? and role='放行' and status<>'已确认'")
      .run(now(), flightId);
  } else if (reportType === "routine") {
    db.prepare("delete from maintenance_hour_results where flight_id=? and owner_type='flight' and status<>'已确认'").run(flightId);
    db.prepare("update maintenance_assignments set status='已派工',feedback='',completed_at='',submitted_at='',modified_at=?,confirmed_at='' where owner_type='flight' and owner_id=? and role<>'放行' and status<>'已确认'")
      .run(now(), flightId);
  } else if (reportType === "nonroutine") {
    db.prepare("delete from maintenance_hour_results where flight_id=? and owner_type='subtask' and status<>'已确认'").run(flightId);
    db.prepare("update maintenance_assignments set status='已派工',feedback='',completed_at='',submitted_at='',modified_at=?,confirmed_at='' where flight_id=? and owner_type='subtask' and status<>'已确认'")
      .run(now(), flightId);
  }
  db.prepare("delete from maintenance_report_entries where batch_id=?").run(batch.id);
  db.prepare("delete from maintenance_report_batches where id=?").run(batch.id);
  maintenanceLog(user, "invalidate_report", "flight", flightId, flightId, JSON.stringify({ reportType, reason }));
  reconcileMaintenanceTreeStatus(flightId, user?.id || "", { preserveConfirmed: false });
  return true;
}

function prepareMaintenanceFlightImport(rows) {
  const prepared=[], errors=[], groups=new Map(), keys=new Set();
  for (const [index,raw] of rows.entries()) {
    const rowNumber=Number.isInteger(raw?.rowNumber) && raw.rowNumber>0 ? raw.rowNumber : index+1;
    let rowKey='';
    try {
      const payload={...maintenanceFlightPayload(raw),source:'Excel导入',status:'未派工'};
      const subPayload=maintenanceSubtaskPayload(raw);
      if(subPayload.title||subPayload.cardNo||subPayload.content)assertMaintenanceLegacyTowCreation(subPayload.category);
      payload.date=normalizeMaintenanceStatsDate(payload.date);
      const invalid=maintenanceFlightValidationError(payload);
      if(invalid)throw new Error(invalid);
      const primaryNo=['航前','三方航前'].includes(payload.workKind)?payload.departureFlightNo:payload.flightNo||payload.departureFlightNo||'';
      const key=[payload.date,payload.aircraftNo.toLowerCase(),payload.workKind,primaryNo.toLowerCase(),payload.location.id].join('|');
      rowKey=key;keys.add(key);
      let group=groups.get(key);
      if(!group) {
        const column=['航前','三方航前'].includes(payload.workKind)||!payload.flightNo && payload.departureFlightNo?'departure_flight_no':'flight_no';
        const matches=db.prepare(`select * from maintenance_flights where date=? and lower(trim(aircraft_no))=? and work_kind=? and lower(trim(${column}))=? and location_id=?`).all(payload.date,payload.aircraftNo.toLowerCase(),payload.workKind,primaryNo.toLowerCase(),payload.location.id);
        if(matches.length>1)throw new Error('匹配到多个维修机会，请核对航班计划');
        group={existing:matches[0]||null,update:false};groups.set(key,group);
      }
      if(group.existing && !group.existing.departure_flight_no && payload.departureFlightNo)group.update=true;
      prepared.push({raw,payload});
    } catch(error) {
      if(!rowKey) keys.add(JSON.stringify([String(raw?.date||''),String(raw?.aircraftNo||'').toLowerCase(),String(raw?.workKind||'航后'),String(raw?.flightNo||raw?.departureFlightNo||'').toLowerCase(),String(raw?.locationName||raw?.locationId||defaultMaintenanceLocationId)]));
      const message=error.message || '校验失败';
      const field=/地点/.test(message)?'作业地点':/出港/.test(message)?'出港航班号':/进港|航班号/.test(message)?'航班号':/日期|机号/.test(message)?'日期/机号':/机型|工时/.test(message)?'机型':'匹配';
      errors.push({rowNumber,field,detail:message});
    }
  }
  const items=[...groups.values()];
  return {prepared,errors,summary:{dataRows:rows.length,total:keys.size,matched:items.filter(g=>g.existing).length,updated:items.filter(g=>g.update).length,created:items.filter(g=>!g.existing).length,abnormal:errors.length}};
}

function maintenanceDispatchMutationContext(ownerType, ownerId, user, expectedUpdatedAt) {
  user = currentMaintenanceReviewActor(user);
  if (!user || !hasRbac(user, "maintenance.assignment.manage")) throw maintenanceReviewError("当前派工权限或人员资格已失效", 403);
  const owner = maintenanceOwner(ownerType, ownerId);
  if (!owner) throw maintenanceReviewError("未找到任务", 404);
  const flightId = ownerType === "flight" ? owner.id : owner.flight_id;
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!String(expectedUpdatedAt || "").trim()) throw maintenanceDispatchError("缺少航班更新时间，请刷新后重试");
  if (!flight || flight.updated_at !== expectedUpdatedAt) throw maintenanceDispatchConflict();
  const allAssigned = db.prepare("select person_id from maintenance_assignments where flight_id=?").all(flightId);
  const shared = flight.status === "未派工" && hasRbac(user, "maintenance.dispatch.view") && maintenanceSharesCreatorDepartment(user, flight.created_by);
  if (!actionScopeHasAll(user, "maintenance.assignment.manage") && flight.created_by !== user.id && !allAssigned.some(row => row.person_id === user.personId || actionScopeAllows(user, "maintenance.assignment.manage", row.person_id)) && !dataScopeAllowsUser(user, flight.created_by, "maintenance") && !shared) throw maintenanceReviewError("未找到维修机会", 404);
  if (allAssigned.some(row => !actionScopeAllows(user, "maintenance.assignment.manage", row.person_id))) throw maintenanceReviewError("任务包含当前维修范围外人员，不能修改", 403);
  assertMaintenanceTreeDirectEditAllowed(flightId);
  const allowedRoles = maintenanceRolesForOwner(ownerType, owner);
  const submitted = type => ["已提报", "待复核", "已确认"].includes(db.prepare("select status from maintenance_report_batches where flight_id=? and report_type=?").get(flightId, type)?.status || "");
  const lockedRoles = new Set(ownerType === "subtask" ? (submitted("nonroutine") ? allowedRoles : []) : allowedRoles.filter(role => submitted(role === "放行" ? "release" : "routine")));
  const currentRows = db.prepare("select * from maintenance_assignments where owner_type=? and owner_id=? order by id").all(ownerType, ownerId);
  return { user, owner, flightId, flight, allowedRoles, lockedRoles, currentRows };
}

function setMaintenanceAssignments(ownerType, ownerId, assignments, user, expectedUpdatedAt, inTransaction = false) {
  const apply = () => {
    const context = maintenanceDispatchMutationContext(ownerType, ownerId, user, expectedUpdatedAt);
    const { owner, flightId, flight, allowedRoles, lockedRoles, currentRows } = context;
    user = context.user;
    const normalized = normalizeMaintenanceAssignments(ownerType, owner, assignments);
    if (normalized.some(item => !personnelAccess.allows(user, "maintenance", item.person.id))) throw maintenanceReviewError("新增人员不在当前维修范围内", 403);
    const keyOf = item => `${item.role}\u0000${item.person_id || item.person?.id || ""}`;
    const existing = new Set(currentRows.map(keyOf));
    const additions = normalized.filter(item => !existing.has(keyOf(item)));
    if (additions.some(item => lockedRoles.has(item.role))) throw maintenanceReviewError("已提报类别的人员已锁定，请在复核阶段调整", 409);
    const release = currentRows.find(row => row.role === "放行");
    if (release && additions.some(item => item.role === "放行" && item.person.id !== release.person_id)) throw maintenanceReviewError("已有放行派工，请先通过独立删除操作确认影响，再新增放行人员", 409);
    for (const { person, role } of additions) insertMaintenanceAssignment({ ownerType, ownerId, flightId, personId: person.id, userName: person.name, team: person.team || "未设置", role, status: "已派工", assignedBy: user.id, assignedAt: now() });
    reconcileMaintenanceTreeStatus(flightId, user.id, { preserveConfirmed: false });
    const stamp = db.prepare("select updated_at from maintenance_flights where id=?").get(flightId)?.updated_at || flight.updated_at;
    db.prepare("update maintenance_flights set updated_by=?,updated_at=? where id=?").run(user.id, timestampAfter(stamp), flightId);
    maintenanceLog(user, "dispatch", ownerType, ownerId, flightId, JSON.stringify({ editableRoles: allowedRoles.filter(role => !lockedRoles.has(role)), lockedRoles: [...lockedRoles], added: additions.map(item => ({ personId: item.person.id, role: item.role })), retained: currentRows.length }));
    return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId));
  };
  return inTransaction ? apply() : maintenanceTransaction(apply);
}

function maintenanceAssignmentRemoval(assignmentId, payload, user, commit = false) {
  return maintenanceTransaction(() => {
    const row = db.prepare("select * from maintenance_assignments where id=?").get(assignmentId);
    if (!row) throw maintenanceReviewError("未找到派工关联，请刷新后核对", 404);
    const context = maintenanceDispatchMutationContext(row.owner_type, row.owner_id, user, payload.expectedUpdatedAt);
    const { flightId, flight, lockedRoles } = context;
    user = context.user;
    if (lockedRoles.has(row.role) || row.status !== "已派工") throw maintenanceReviewError("已提报或已锁定派工不能直接删除，请使用原报工复核流程", 409);
    for (const table of ["maintenance_feedback", "maintenance_hour_results", "maintenance_sortie_results"]) if (db.prepare(`select 1 from ${table} where assignment_id=? limit 1`).get(row.id)) throw maintenanceReviewError("该派工已有反馈或报工结果，不能通过派工删除抹除", 409);
    const drafts = db.prepare("select id,report_type,version,payload_json from maintenance_report_drafts where flight_id=? order by id").all(flightId);
    const confirmation = crypto.createHash("sha256").update(JSON.stringify({ flightVersion: flight.updated_at, row, drafts })).digest("hex");
    const impact = { assignment: { id: row.id, personId: row.person_id, name: row.user_name, role: row.role }, expectedUpdatedAt: flight.updated_at, drafts: drafts.map(item => ({ reportType: item.report_type, version: Number(item.version) })), confirmation, notice: "仅删除这条正式派工关联。已有草稿保持原样，后续报工前须重新核对草稿人员。" };
    if (!commit) return { impact };
    if (payload.confirmation !== confirmation) throw maintenanceDispatchConflict("删除影响或草稿版本已变化，请重新预览确认");
    const reason = String(payload.reason || "").trim();
    if (!reason || reason.length > 1000) throw maintenanceReviewError("请填写不超过1000字的派工删除原因");
    db.prepare("delete from maintenance_assignments where id=?").run(row.id);
    reconcileMaintenanceTreeStatus(flightId, user.id, { preserveConfirmed: false });
    maintenanceLog(user, "dispatch_assignment_removed", row.owner_type, row.owner_id, flightId, JSON.stringify({ reason, removed: { id: row.id, personId: row.person_id, role: row.role, assignedBy: row.assigned_by, assignedAt: row.assigned_at }, retainedDrafts: impact.drafts }));
    return { flight: publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId)) };
  });
}

function normalizeMaintenanceReportEntries(rawEntries, allowedRoles, { ownerType = "flight", ownerId = "", standardHours = 0, source = "报工补录" } = {}) {
  const flightId = ownerType === "flight" ? ownerId : db.prepare("select flight_id from maintenance_subtasks where id=?").get(ownerId)?.flight_id;
  const people = new Map((flightId ? maintenanceReportPeople(flightId) : allPeople()).map(person => [person.id, person]));
  const allowed = new Set(allowedRoles);
  const seen = new Set();
  const entries = [];
  for (const item of Array.isArray(rawEntries) ? rawEntries : []) {
    const role = ownerType === "subtask" ? normalizeMaintenanceSubtaskRole(item.role) : String(item.role || "").trim();
    const personId = String(item.personId || "").trim();
    if (!allowed.has(role)) throw maintenanceDispatchError(`当前任务不支持上报“${role || "未设置"}”`);
    const person = people.get(personId);
    if (!person) throw maintenanceDispatchError("报工人员不存在或已停用");
    const key = `${ownerType}\u0000${ownerId}\u0000${role}\u0000${personId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ ownerType, ownerId, role, person, standardHours, source });
  }
  return entries;
}

function maintenanceReportsView(flightId, user) {
  const flightRow = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flightRow) return null;
  if (!maintenanceCanSubmitReport(user, flightId) && !maintenanceCanManage(user)) throw maintenanceDispatchError("只能查看与自己相关的维修机会报工");
  const flight = publicMaintenanceFlight(flightRow);
  const routineRoles = maintenanceRolesForOpportunity(flight.workKind || flight.workType).filter(role => role !== "放行");
  const routineAssignments = flight.assignments.filter(row => row.role !== "放行");
  const release = flight.assignments.find(row => row.role === "放行") || null;
  const progress = maintenanceReportProgress(flightId);
  const routineDraft = maintenanceReportDraft(flightId, "routine");
  const routineEntries = progress.batches.routine?.entries.length
    ? progress.batches.routine.entries
    : routineDraft
      ? routineDraft.entries.map(entry => {
        const person = maintenanceReportPeople(flightId).find(item => item.id === entry.personId);
        return {
          ownerType: "flight",
          ownerId: flightId,
          role: entry.role,
          personId: entry.personId,
          userName: person?.name || "",
          team: person?.team || "未设置"
        };
      })
      : routineAssignments.map(row => ({ ownerType: "flight", ownerId: flightId, role: row.role, personId: row.personId, userName: row.userName, team: row.team }));
  const submittedRoutineRoles = new Set((progress.batches.routine?.entries || []).map(entry => entry.role));
  const roleStatuses = Object.fromEntries([
    ["放行", progress.batches.release ? "已提报" : "未提报"],
    ...routineRoles.map(role => [role, submittedRoutineRoles.has(role) ? "已提报" : "未提报"])
  ]);
  return {
    flight: { id: flight.id, flightNo: flight.flightNo, departureFlightNo: flight.departureFlightNo, aircraftNo: flight.aircraftNo, aircraftType: flight.aircraftType, opportunity: flight.workKind, status: flight.status, routineHoursRule: flight.routineHoursRule, updatedAt: flight.updatedAt },
    people: maintenanceReportPeople(flightId),
    defaults: { towStandardHours: maintenanceTowDefaultHours(), towTransition:maintenanceTowTransitionPolicy(), categoryStrategies:NONROUTINE_CATEGORY_STRATEGIES },
    progress,
    routine: {
      people: maintenanceReportPeople(flightId),
      roles: routineRoles,
      entries: routineEntries,
      feedback: progress.batches.routine?.feedback ?? routineDraft?.feedback ?? "",
      draft: routineDraft,
      roleStatuses,
      locked: ["已提报", "待复核", "已确认"].includes(progress.batches.routine?.status || "")
    },
    nonroutine: {
      importedDraftSubmissionReady: maintenanceV101SubmissionEnabled(),
      manualDraftSubmissionReady:maintenanceManualSubmissionEnabled(),
      items: flight.subtasks.map(item => ({
        id: item.id,
        chapter: item.cardNo,
        title: item.title,
        category: item.hourAssessment ? item.category : maintenanceNonroutineCategories.includes(item.category) ? item.category : "其他",
        standardHours: item.standardHours,
        hourAssessment: item.hourAssessment,
        reportExplanation: item.content || "",
        entries: (progress.batches.nonroutine?.entries || []).filter(entry => entry.ownerType === "subtask" && entry.ownerId === item.id).length
          ? progress.batches.nonroutine.entries.filter(entry => entry.ownerType === "subtask" && entry.ownerId === item.id)
          : maintenanceNonroutineDraftEntries(flightId, item.id) ?? item.assignments.map(row => ({ ownerType: "subtask", ownerId: item.id, role: row.role, personId: row.personId, userName: row.userName, team: row.team }))
      })),
      feedback: progress.batches.nonroutine?.feedback || "",
      locked: ["已提报", "待复核", "已确认"].includes(progress.batches.nonroutine?.status || ""),
      draft: maintenanceReportDraft(flightId, "nonroutine"),
      revision: flight.updatedAt || ""
    },
    release,
    releaseEditable: !!release && release.personId === user.personId && !progress.batches.release,
    canSubmit: maintenanceCanExecute(user, true) && maintenanceCanSubmitReport(user, flightId),
    canRelease: maintenanceCanExecute(user, true) && !!release && release.personId === user.personId && !progress.batches.release,
    canFinalize: !!progress.batches.release && progress.batches.release.submittedBy === user.id && progress.ready && !flight.reportFinalizedAt,
    isManager: maintenanceCanManage(user)
  };
}

function submitMaintenanceRelease(flightId, payload, user) {
  return maintenanceTransaction(() => {
    user = currentMaintenanceReportMutationActor(user);
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceDispatchError("未找到维修机会");
  const release = db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=? and role='放行'").get(flightId);
  if (!release || release.person_id !== user.personId) throw maintenanceDispatchError("只有当前维修机会的放行人员可以上报架次");
  if (release.status !== "已派工") throw maintenanceReviewError("放行已经提报，请刷新页面", 409);
    assertMaintenanceFlightVersion(flightId, payload);
    const batch = upsertMaintenanceReportBatch(flightId, "release", {
      status: "已提报", feedback: "", user, expectedVersion: payload?.version ?? null,
      entries: [{ ownerType: "flight", ownerId: flightId, role: "放行", person: allPeople().find(row => row.id === release.person_id) || { id: release.person_id, name: release.user_name, team: release.team }, standardHours: 0, source: "放行架次" }]
    });
    const stamp = now();
    db.prepare("update maintenance_assignments set status='已提报',feedback='',completed_at=?,submitted_at=?,modified_at=? where id=?").run(stamp, stamp, stamp, release.id);
    regenerateMaintenanceSorties("flight", flightId, "已提报");
    reconcileMaintenanceTreeStatus(flightId, user.id, { preserveConfirmed: false });
    maintenanceLog(user, "release_report_submit", "flight", flightId, flightId, JSON.stringify({ batchId: batch.id, assignmentId: release.id, sorties: 1 }));
    autoConfirmMaintenanceRoutine(flightId, user);
    return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId));
  }, flightId);
}

function submitMaintenanceRoutine(flightId, payload, user) {
  return maintenanceTransaction(() => {
    user = currentMaintenanceReportMutationActor(user);
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceDispatchError("未找到维修机会");
  if (!maintenanceCanSubmitReport(user, flightId)) throw maintenanceDispatchError("只有该维修机会的派工人员可以提交例行报工");
    assertMaintenanceFlightVersion(flightId, payload);
    assertMaintenanceReportDraftVersion(flightId, "routine", payload?.draftVersion);
    if (Array.isArray(payload?.entries) && payload.entries.length) captureMaintenanceAircraftHours(flight, user);
    const selectedReleaseId = validateMaintenanceReleaseSelection(flightId,payload?.releasePersonId,user);
    const dispatchedRelease = db.prepare("select person_id from maintenance_assignments where owner_type='flight' and owner_id=? and role='放行'").get(flightId);
    if (selectedReleaseId !== dispatchedRelease?.person_id) throw maintenanceReviewError('调整正式放行归属须通过独立派工操作，例行提报不能改写派工',409);
    const roles = maintenanceRolesForOpportunity(flight.work_kind || flight.work_type).filter(role => role !== "放行");
    const entries = normalizeMaintenanceReportEntries(payload?.entries, roles, { ownerType: "flight", ownerId: flightId, standardHours: maintenanceBaseHours("flight", flight), source: "例行报工" });
    const submittedRoles = [...new Set(entries.map(item => item.role))];
    if (entries.length && !(maintenanceBaseHours("flight", flight) > 0)) throw maintenanceDispatchError("当前维修机会缺少有效标准工时规则");
    for (const role of submittedRoles) if (maintenanceRatioRuleForOwner("flight", flight, role) === null) throw maintenanceDispatchError(`${role}缺少当前维修机会的有效工时比例`);
    const before = maintenanceReviewSnapshot(flightId);
    const batch = upsertMaintenanceReportBatch(flightId, "routine", { status: "已提报", feedback: String(payload?.feedback || "").trim(), user, entries, expectedVersion: payload?.version ?? null });
    db.prepare("update maintenance_assignments set status='已提报',submitted_at=?,modified_at=? where owner_type='flight' and owner_id=? and role<>'放行'").run(now(),now(),flightId);
    regenerateMaintenanceHours("flight", flightId, "已提报");
    db.prepare("delete from maintenance_report_drafts where flight_id=? and report_type='routine'").run(flightId);
    reconcileMaintenanceTreeStatus(flightId, user.id, { preserveConfirmed: false });
    maintenanceLog(user, "routine_report_submit", "flight", flightId, flightId, JSON.stringify({ before, after: maintenanceReviewSnapshot(flightId), batchId: batch.id }));
    autoConfirmMaintenanceRoutine(flightId, user);
    return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId));
  }, flightId);
}

function normalizeNonroutineReportItems(flightId, rawItems, user, {
  createTemporary = false,
  allowEmptyEntries = false,
  allowOmitted = false,
  validateComplete = true,
  imported = new Map()
} = {}) {
  const existing = new Map(db.prepare("select * from maintenance_subtasks where flight_id=? order by created_at").all(flightId).map(row => [row.id, row]));
  const seen = new Set();
  const items = [];
  for (const [index, raw] of (Array.isArray(rawItems) ? rawItems : []).entries()) {
    const itemLabel = `单项${index + 1}`;
    let item = existing.get(String(raw.id || ""));
    const submission = imported.get(String(raw.clientId || ""));
    const assessment = item && maintenanceNonroutineAssessment(item);
    const pending = item && maintenanceNonroutineUnposted(item);
    const chapter = String(raw.chapter ?? raw.cardNo ?? item?.card_no ?? "").trim().slice(0, 200);
    const title = String(raw.title ?? item?.title ?? "").trim().slice(0, 500);
    const rawCategory = String(raw.category ?? item?.category ?? "");
    const categoryValid = submission || assessment ? Object.hasOwn(NONROUTINE_CATEGORY_STRATEGIES,rawCategory) : maintenanceNonroutineCategories.includes(rawCategory);
    const category = categoryValid ? rawCategory : "其他";
    const reportExplanation = String(raw.reportExplanation ?? raw.content ?? item?.content ?? "").trim().slice(0, 4000);
    const rawStandardHours = raw.standardHours ?? item?.standard_hours ?? 0;
    const parsedStandardHours = Number(rawStandardHours);
    const standardHours = pending || submission && !submission.standard ? null : assessment ? assessment.effective_hours : submission?.standard ? submission.standard.standardHours : Number.isFinite(parsedStandardHours) ? parsedStandardHours : 0;
    if (assessment?.source_kind === "STANDARD") {
      const standard = JSON.parse(assessment.standard_json);
      if (category!==standard.category || chapter!==standard.chapter || title!==standard.title || reportExplanation!==standard.workScope || parsedStandardHours!==standard.standardHours) throw maintenanceReviewError("已提报的标准五项已锁定，不能在报工确认中改写",409);
    }
    assertMaintenanceLegacyTowCreation(category,{existingCategory:item?.category,managed:Boolean(submission||assessment)});
    if (!item) {
      if (!createTemporary || !raw.temporary) throw maintenanceDispatchError("非例行项目已变化，请刷新后重试");
      const id = randomId("mtns");
      const stamp = now();
      db.prepare(`insert into maintenance_subtasks(id,flight_id,card_no,title,content,category,standard_hours,priority,status,remark,created_by,updated_by,created_at,updated_at)
        values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, flightId, chapter, title, reportExplanation, category, standardHours, "普通", "未派工", "", user.id, user.id, stamp, stamp);
      item = db.prepare("select * from maintenance_subtasks where id=?").get(id);
      maintenanceLog(user, "create_temporary_nonroutine", "subtask", id, flightId, title || "未填写标题");
    }
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (validateComplete && !title) throw maintenanceDispatchError(`${itemLabel}缺少标题`);
    if (validateComplete && !categoryValid) throw maintenanceDispatchError(`${itemLabel}类别无效`);
    if (validateComplete && !pending && !submission && !assessment && !(standardHours > 0)) throw maintenanceDispatchError(`${itemLabel}缺少有效工时`);
    if (validateComplete && assessment && (!chapter || !reportExplanation)) throw maintenanceDispatchError(`${itemLabel}缺少ATA或工作范围`);
    if (validateComplete && Math.abs(standardHours * 10 - Math.round(standardHours * 10)) > 1e-8) {
      throw maintenanceDispatchError(`${itemLabel}工时必须以0.1小时为单位`);
    }
    const entries = normalizeMaintenanceReportEntries(raw.entries, category === "拖机" ? ["主做"] : maintenanceSubtaskRoles, { ownerType: "subtask", ownerId: item.id, standardHours, source: raw.temporary ? "临时非例行报工" : "非例行报工" });
    if (validateComplete && !entries.length && !allowEmptyEntries) throw maintenanceDispatchError(`${itemLabel}尚未选择实际参与人员`);
    if (validateComplete && !pending && !submission) {
      for (const role of new Set(entries.map(entry => entry.role))) {
        if (maintenanceRatioRuleForOwner("subtask", { category }, role, entries) === null) throw maintenanceDispatchError(`${itemLabel}的${role}缺少有效工时比例`);
      }
    }
    items.push({ row: item, chapter, title, category, standardHours, reportExplanation, entries, submission });
  }
  const omitted = [...existing.values()].filter(item => !seen.has(item.id));
  if (!allowOmitted && omitted.length) throw maintenanceDispatchError(`非例行“${omitted[0].title}”尚未纳入本次报工`);
  return { items, omitted };
}

function assertMaintenanceNonroutineEditable(flightId, payload, user) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceDispatchError("未找到维修机会");
  if (!maintenanceCanSubmitReport(user, flightId)) throw maintenanceDispatchError("只有该维修机会的派工人员可以维护非例行报工");
  if (["待复核", "已确认"].includes(flight.status)) throw maintenanceReviewError("当前维修机会已进入复核，不能修改非例行", 409);
  if (maintenanceReportBatch(flightId, "nonroutine")) throw maintenanceReviewError("非例行已经提报并锁定，不能继续修改", 409);
  const expectedRevision = payload?.revision;
  if (expectedRevision !== null && expectedRevision !== undefined && String(expectedRevision) !== String(flight.updated_at || "")) {
    throw maintenanceReviewError("非例行数据已被其他人员更新，请刷新后重试", 409);
  }
  assertMaintenanceNonroutineChangePermissions(flightId, payload, user);
  return flight;
}

function assertMaintenanceSubtaskCanBeRemovedDuringReport(subtask) {
  if (["已提报", "待复核", "已确认"].includes(subtask.status)) {
    throw maintenanceReviewError(`非例行“${subtask.title}”已经提报，不能删除`, 409);
  }
  const locked = db.prepare("select 1 from maintenance_assignments where owner_type='subtask' and owner_id=? and status in ('已提报','待复核','已确认') limit 1").get(subtask.id);
  if (locked) throw maintenanceReviewError(`非例行“${subtask.title}”已经提报，不能删除`, 409);
}

function saveMaintenanceNonroutineParticipantDrafts(flightId, items, user) {
  const current = db.prepare("select * from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").get(flightId);
  const payload = json(current?.payload_json, { items: [] });
  const participantDrafts = items.map(item => ({ subtaskId: item.row.id, entries: item.entries.map(entry => ({ role: entry.role, personId: entry.person.id })) }));
  writeMaintenanceReportDraft(flightId, "nonroutine", { ...payload, participantDrafts }, user, current);
}

function maintenanceNonroutineDraftEntries(flightId, subtaskId) {
  const payload = json(db.prepare("select payload_json from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").get(flightId)?.payload_json, {});
  const selection = payload.participantDrafts?.find(item => item.subtaskId === subtaskId);
  if (!selection) return null;
  const people = new Map(maintenanceReportPeople(flightId).map(person => [person.id, person]));
  return selection.entries.map(entry => ({ ownerType: "subtask", ownerId: subtaskId, role: entry.role, personId: entry.personId, userName: people.get(entry.personId)?.name || "", team: people.get(entry.personId)?.team || "未设置" }));
}

function applyMaintenanceNonroutineChanges(flightId, payload, user, { submit = false, imported = new Map() } = {}) {
  const normalized = normalizeNonroutineReportItems(flightId, payload?.items, user, {
    createTemporary: true,
    allowEmptyEntries: !submit,
    allowOmitted: true,
    validateComplete: submit,
    imported
  });
  for (const subtask of normalized.omitted) {
    assertMaintenanceSubtaskCanBeRemovedDuringReport(subtask);
    deleteMaintenanceSubtaskForReport(subtask, user);
  }
  for (const item of normalized.items) {
    db.prepare("update maintenance_subtasks set card_no=?,title=?,content=?,category=?,standard_hours=?,status=?,updated_by=?,updated_at=? where id=?")
      .run(item.chapter, item.title, item.reportExplanation, item.category, item.standardHours, submit ? "已提报" : item.row.status, user.id, now(), item.row.id);
    if (submit) db.prepare("update maintenance_assignments set status='已提报',submitted_at=?,modified_at=? where owner_type='subtask' and owner_id=?").run(now(),now(),item.row.id);
  }
  if (!submit) saveMaintenanceNonroutineParticipantDrafts(flightId, normalized.items, user);
  return normalized.items;
}

function maintenanceSourceDraftSaveNeeded(flightId,payload){
  const current=maintenanceReportDraft(flightId,'nonroutine'),sources=maintenanceSourceRows(flightId),legacy=new Set((current?.items||[]).filter(item=>!item.sourceFingerprint).map(item=>item.clientId));
  if(!maintenanceManualSubmissionEnabled()&&(payload?.items||[]).some(raw=>!raw?.id&&(raw?.standardId||raw?.manualManaged)&&!sources.some(source=>source.client_id===raw.clientId)))throw maintenanceReviewError('手工标准草稿尚未启用',409);
  return (payload?.items||[]).some(raw=>!raw?.id&&(sources.some(source=>source.client_id===raw.clientId)||maintenanceManualSubmissionEnabled()&&!legacy.has(raw.clientId)));
}
function maintenanceExistingReportChanged(flightId,items){
  const existing=db.prepare('select * from maintenance_subtasks where flight_id=?').all(flightId);
  if(existing.length!==items.length)return true;
  return items.some(raw=>{const row=existing.find(item=>item.id===raw.id);if(!row)return true;
    if(String(raw.chapter??row.card_no)!==String(row.card_no||'')||String(raw.title??row.title)!==String(row.title||'')||String(raw.category??row.category)!==String(row.category||'')||String(raw.reportExplanation??row.content)!==String(row.content||'')||Number(raw.standardHours??row.standard_hours)!==Number(row.standard_hours))return true;
    const savedEntries=maintenanceNonroutineDraftEntries(flightId,row.id);
    const stored=savedEntries ? savedEntries.map(entry=>JSON.stringify([entry.role,entry.personId])).sort() : db.prepare("select role,person_id from maintenance_assignments where owner_type='subtask' and owner_id=?").all(row.id).map(entry=>JSON.stringify([entry.role,entry.person_id])).sort();
    const incoming=(raw.entries||[]).map(entry=>JSON.stringify([normalizeMaintenanceSubtaskRole(entry.role),entry.personId])).sort();return JSON.stringify(stored)!==JSON.stringify(incoming);
  });
}

function saveMaintenanceNonroutine(flightId, payload, user) {
  const flight = assertMaintenanceNonroutineEditable(flightId, payload, user);
  return maintenanceTransaction(() => {
    user = currentMaintenanceReportMutationActor(user);
    assertMaintenanceNonroutineEditable(flightId,payload,user);
    if (payload?.draftVersion !== undefined) assertMaintenanceReportDraftVersion(flightId,"nonroutine",payload.draftVersion);
    if(maintenanceSourceDraftSaveNeeded(flightId,payload)){
      assertMaintenanceReportDraftVersion(flightId,'nonroutine',payload?.draftVersion);
      const temporary=payload.items.filter(raw=>!raw.id),formal=payload.items.filter(raw=>raw.id);
      persistMaintenanceNonroutineDraft(flightId,{items:temporary,version:payload.draftVersion},user);
      if(maintenanceExistingReportChanged(flightId,formal)){
        applyMaintenanceNonroutineChanges(flightId,{...payload,items:formal},user,{submit:false});
        touchMaintenanceFlight(flightId);
      }
      return publicMaintenanceFlight(db.prepare('select * from maintenance_flights where id=?').get(flightId));
    }
    assertMaintenanceImportedDraftSubmissionReady(flightId);
    const before = maintenanceReviewSnapshot(flightId);
    const items = applyMaintenanceNonroutineChanges(flightId, payload, user, { submit: false });
    const stamp = now();
    db.prepare("update maintenance_flights set updated_by=?,updated_at=? where id=?").run(user.id, stamp, flightId);
    maintenanceLog(user, "nonroutine_report_save", "flight", flightId, flightId, JSON.stringify({
      before,
      after: maintenanceReviewSnapshot(flightId),
      itemCount: items.length
    }));
    return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId));
  }, flightId);
}

function submitMaintenanceNonroutine(flightId, payload, user) {
  assertMaintenanceNonroutineEditable(flightId, payload, user);
  return maintenanceTransaction(() => {
    user = currentMaintenanceReportMutationActor(user);
    assertMaintenanceNonroutineEditable(flightId,payload,user);
    const imported = prepareMaintenanceImportedSubmission(flightId,payload,user);
    assertMaintenanceReportDraftVersion(flightId, "nonroutine", payload?.draftVersion);
    const before = maintenanceReviewSnapshot(flightId);
    const items = applyMaintenanceNonroutineChanges(flightId, payload, user, { submit: true, imported });
    if (!items.length) throw maintenanceDispatchError("当前维修机会没有需要提交的非例行");
    const entries = items.flatMap(item => item.entries);
    const batch = upsertMaintenanceReportBatch(flightId, "nonroutine", { status: "已提报", feedback: "", user, entries, expectedVersion: payload?.version ?? null });
    for (const item of items.filter(item=>item.submission)) {
      const { source,snapshot,standard,matchBasis } = item.submission;
      const policy = captureMaintenanceNonroutinePolicy(item.category,item.entries);
      if (standard && (policy.strategy === "UNDECIDED" || policy.strategy === "ROLE_COMBINATION" && !policy.valid)) throw maintenanceReviewError("该标准的分配策略尚未就绪，请核对规则",409);
      const participants = maintenanceNonroutineParticipantRows(item.row.id)
        .map(row=>({personId:row.person_id,personName:row.user_name,team:row.team,role:row.role,assignmentId:row.id,assignedAt:row.assigned_at}));
      const caseId = standard ? null : nonroutineReviewService().create({flightId,subtaskId:item.row.id,reportBatchId:batch.id,applicationRevision:1,
        applicantId:user.id,snapshot,participants,policySnapshot:policy});
      const stamp = now();
      db.prepare(`insert into maintenance_nonroutine_assessments(subtask_id,flight_id,report_batch_id,source_kind,source_fingerprint,application_json,participants_json,policy_json,standard_json,review_case_id,effective_hours,created_at)
        values(?,?,?,?,?,?,?,?,?,?,?,?)`).run(item.row.id,flightId,batch.id,standard?"STANDARD":"REVIEW",source.fingerprint,JSON.stringify(snapshot),JSON.stringify(participants),JSON.stringify(policy),standard?JSON.stringify(standard):null,caseId,standard?standard.standardHours:null,stamp);
      if (caseId) db.prepare("insert into maintenance_nonroutine_review_channels(id,case_id,subtask_id,state,created_at,updated_at) values(?,?,?,'WAITING_REVIEW',?,?)").run(randomId("nrch"),caseId,item.row.id,stamp,stamp);
      if(caseId)saveNonroutineSourceBaseline({db,item:db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(caseId),actorId:user.id,clock:now,randomId,readParticipants:source=>maintenanceNonroutineParticipantRows(source.subtask_id)});
      if(caseId&&matchBasis==='EXPLICIT_MANUAL_UNLISTED')db.prepare('insert into maintenance_nonroutine_review_events(id,case_id,actor_id,event_type,detail_json,created_at) values(?,?,?,?,?,?)').run(randomId('nre'),caseId,user.id,'MANUAL_UNLISTED_CONFIRMED',JSON.stringify({sourceFingerprint:source.fingerprint,matchBasis,definition:snapshot}),stamp);
      writeMaintenanceSourceState(source,'SUBMITTED',{subtaskId:item.row.id});
    }
    for(const item of items)regenerateMaintenanceHours("subtask",item.row.id,"已提报");
    db.prepare("delete from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").run(flightId);
    reconcileMaintenanceTreeStatus(flightId, user.id, { preserveConfirmed: false });
    maintenanceLog(user, "nonroutine_report_submit", "flight", flightId, flightId, JSON.stringify({ before, after: maintenanceReviewSnapshot(flightId), batchId: batch.id }));
    return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId));
  }, flightId);
}

function maintenanceCancelReviewForSourceRemoval(caseId,flightId,subtaskId,user,sourceAction,reason=''){
 return cancelNonroutineReviewForSourceRemoval({db,caseId,flightId,subtaskId,user,sourceAction,reason,clock:now,randomId,
  qualify(actor,{sourceAction}){
   const row=db.prepare("select u.* from users u join personnel p on p.id=u.person_id where u.id=? and u.person_id=? and coalesce(u.status,'active')='active' and p.data_status='active' and coalesce(p.employment_status,'') not in ('离职','停职')").get(actor.id,actor.personId);if(!row)return null;
   const current=toUser(row),flight=db.prepare('select * from maintenance_flights where id=?').get(flightId);if(!flight)return null;
   if(sourceAction==='OPPORTUNITY_REMOVAL'||sourceAction==='SUBTASK_REMOVAL'){
    const confirmed=flight.status==='已确认'||Boolean(flight.archived_at);
    if(!hasRbac(current,sourceAction==='SUBTASK_REMOVAL'?'maintenance.content.manage':'maintenance.opportunity.delete')||confirmed&&!hasRbac(current,'maintenance.archive.modify')||!confirmed&&(flight.status==='待复核'||flight.report_finalized_at)&&!hasRbac(current,'maintenance.review.submit'))return null;
   }else if(!maintenanceCanExecute(current,true))return null;
   return {accountId:current.id,personId:current.personId,permissionSnapshot:current.rbacPermissions,scopeSnapshot:current.dataScopes};
  }
 });
}
function deleteMaintenanceSubtaskForReport(subtask, user) {
  retainMaintenanceReportSourcesForFlight(subtask.flight_id,user);
  const assessment = maintenanceNonroutineAssessment(subtask);
  if (assessment?.review_case_id) {
    maintenanceCancelReviewForSourceRemoval(assessment.review_case_id,subtask.flight_id,subtask.id,user,'REPORT_ITEM_REMOVAL');
  }
  if(assessment){const source=maintenanceSourceRows(subtask.flight_id).find(row=>row.fingerprint===assessment.source_fingerprint);if(source){const table=source.kind==='MANUAL'?'maintenance_nonroutine_manual_sources':'maintenance_nonroutine_import_sources';db.prepare(`update ${table} set state='DELETED',updated_at=? where fingerprint=?`).run(now(),source.fingerprint);}}
  db.prepare("delete from maintenance_hour_results where owner_type='subtask' and owner_id=?").run(subtask.id);
  db.prepare("delete from maintenance_sortie_results where owner_type='subtask' and owner_id=?").run(subtask.id);
  db.prepare("delete from maintenance_feedback where owner_type='subtask' and owner_id=?").run(subtask.id);
  db.prepare("delete from maintenance_assignments where owner_type='subtask' and owner_id=?").run(subtask.id);
  db.prepare("delete from maintenance_subtasks where id=?").run(subtask.id);
  db.prepare("update maintenance_flights set nonroutine_electronic_signed=null where id=? and not exists(select 1 from maintenance_subtasks where flight_id=?)").run(subtask.flight_id, subtask.flight_id);
  maintenanceLog(user, "delete_subtask_during_report_confirmation", "subtask", subtask.id, subtask.flight_id, subtask.title || "");
}

// Internal-only automation: callers cannot enable this through request payloads.
function autoConfirmMaintenanceRoutine(flightId, triggerUser) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  const progress = maintenanceReportProgress(flightId);
  const eligible = Boolean(flight && !flight.report_finalized_at && !["航后", "三方航后", "航后/航前"].includes(flight.work_kind || flight.work_type)
      && progress?.ready && !progress.hasFormalNonroutine && !progress.hasNonroutineDraft);
  observeMaintenanceTransition(flight, progress, "AUTO_FINALIZE_ROUTINE", eligible);
  if (!eligible) return false;
  saveMaintenanceReportConfirmation(flightId, {
    routineEntries: (progress.batches.routine?.entries || []).map(entry => ({ role: entry.role, personId: entry.personId })),
    feedback: progress.batches.routine?.feedback || "",
    releasePersonId: progress.batches.release?.entries.find(entry => entry.role === "放行")?.personId
  }, triggerUser, { finalize: true, automatic: true, inTransaction: true });
  return true;
}

function assertMaintenanceReportConfirmationReady(flight, progress, user, automatic) {
  if (!flight) throw maintenanceDispatchError("未找到维修机会");
  const releaseBatch = progress?.batches.release;
  const releaseReporterAuthorized = Boolean(releaseBatch && (automatic || releaseBatch.submittedBy === user.id));
  observeMaintenanceTransition(flight, progress, "FINALIZE_REPORT",
    Boolean(releaseReporterAuthorized && !progress.hasNonroutineDraft && progress.ready && !flight.report_finalized_at),
    { releaseReporterAuthorized });
  if (!releaseBatch || (!automatic && releaseBatch.submittedBy !== user.id)) throw maintenanceDispatchError("只有原放行报工人可以完成报工确认");
  if (progress.hasNonroutineDraft) throw maintenanceReviewError("存在未提交的非例行草稿，请先提交或删除草稿", 409);
  if (!progress.ready) {
    const missing = progress.segments.filter(item => !["已提报", "无需报工"].includes(item.status)).map(item => item.label);
    throw maintenanceDispatchError(`以下报工尚未完成：${missing.join("、")}`);
  }
  if (flight.report_finalized_at) throw maintenanceReviewError("该维修机会已经报工确认", 409);
  return { releaseBatch, releaseReporterAuthorized };
}

function saveMaintenanceReportConfirmation(flightId, payload, user, { finalize = false, automatic = false, inTransaction = false } = {}) {
  let flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceDispatchError("未找到维修机会");
  if(maintenanceManualSubmissionEnabled()&&(payload?.nonroutineItems||[]).some(raw=>raw?.temporary&&!raw.id))throw maintenanceReviewError('新增手工非例行须先在原非例行报工弹窗正式提报，再完成报工确认',409);
  let progress = maintenanceReportProgress(flightId);
  let { releaseBatch, releaseReporterAuthorized } = assertMaintenanceReportConfirmationReady(flight, progress, user, automatic);
  const confirm = () => {
    user = currentMaintenanceReportMutationActor(user);
    // Re-read after the original transaction/advisory lock is held. The entry
    // check cannot authorize a write using an older batch or opportunity.
    flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
    progress = maintenanceReportProgress(flightId);
    ({ releaseBatch, releaseReporterAuthorized } = assertMaintenanceReportConfirmationReady(flight, progress, user, automatic));
    assertMaintenanceImportedDraftSubmissionReady(flightId);
    const before = { review: maintenanceReviewSnapshot(flightId), progress: maintenanceReportProgress(flightId) };
    const currentProgress = maintenanceReportProgress(flightId);
    const deletedIds = [...new Set((Array.isArray(payload?.deletedSubtaskIds) ? payload.deletedSubtaskIds : []).map(value => String(value || "").trim()).filter(Boolean))];
    for (const id of deletedIds) {
      const subtask = db.prepare("select * from maintenance_subtasks where id=? and flight_id=?").get(id, flightId);
      if (!subtask) throw maintenanceDispatchError("待删除的非例行项目已变化，请刷新后重试");
      if(subtask.status==='已确认'||db.prepare("select 1 from maintenance_effective_hour_results where owner_type='subtask' and owner_id=? and status='已确认' limit 1").get(id))throw maintenanceDispatchError('已确认的非例行项目不能通过报工确认删除');
      deleteMaintenanceSubtaskForReport(subtask, user);
    }

    const routineBatch = currentProgress.batches.routine;
    if (currentProgress.hasRoutine) {
      if (!routineBatch) throw maintenanceDispatchError("例行报工数据已变化，请刷新后重试");
      const roles = maintenanceRolesForOpportunity(flight.work_kind || flight.work_type).filter(role => role !== "放行");
      const routineEntries = normalizeMaintenanceReportEntries(payload?.routineEntries, roles, { ownerType: "flight", ownerId: flightId, standardHours: maintenanceBaseHours("flight", flight), source: "放行人报工确认" });
      if (!routineEntries.length) throw maintenanceDispatchError("例行报工人员不能为空");
      if (!(maintenanceBaseHours("flight", flight) > 0)) throw maintenanceDispatchError("当前维修机会缺少有效标准工时规则");
      for (const role of new Set(routineEntries.map(item => item.role))) {
        if (maintenanceRatioRuleForOwner("flight", flight, role) === null) throw maintenanceDispatchError(`${role}缺少当前维修机会的有效工时比例`);
      }
      const routineFeedback = payload && Object.prototype.hasOwnProperty.call(payload, "feedback")
        ? String(payload.feedback ?? "").trim()
        : String(routineBatch.feedback || "");
      const currentRoutineKeys = new Set(routineBatch.entries.map(row=>`${row.role}\u0000${row.personId}`));
      const nextRoutineKeys = new Set(routineEntries.map(item => `${item.role}\u0000${item.person.id}`));
      const routinePeopleChanged = currentRoutineKeys.size !== nextRoutineKeys.size || [...nextRoutineKeys].some(key => !currentRoutineKeys.has(key));
      if (!automatic) {
        replaceMaintenanceReportEntries(routineBatch.id, flightId, routineEntries, { feedback: routineFeedback,user });
      }
      if (routinePeopleChanged) regenerateMaintenanceHours("flight", flightId, "已提报");
    }

    const nonroutineBatch = currentProgress.batches.nonroutine;
    const remainingNonroutine = db.prepare("select count(*) as total from maintenance_subtasks where flight_id=?").get(flightId)?.total || 0;
    if (remainingNonroutine > 0 || (Array.isArray(payload?.nonroutineItems) && payload.nonroutineItems.length > 0)) {
      if (remainingNonroutine > 0 && !nonroutineBatch) throw maintenanceDispatchError("非例行报工数据已变化，请刷新后重试");
      const { items } = normalizeNonroutineReportItems(flightId, payload?.nonroutineItems, user, { createTemporary: true });
      const nonroutineEntries = items.flatMap(item => item.entries);
      for (const item of items) {
        db.prepare("update maintenance_subtasks set card_no=?,title=?,content=?,category=?,standard_hours=?,status='已提报',updated_by=?,updated_at=? where id=?")
          .run(item.chapter, item.title, item.reportExplanation, item.category, item.standardHours, user.id, now(), item.row.id);
        db.prepare("update maintenance_assignments set status='已提报',modified_at=? where owner_type='subtask' and owner_id=?").run(now(),item.row.id);
      }
      if (nonroutineBatch) replaceMaintenanceReportEntries(nonroutineBatch.id, flightId, nonroutineEntries,{user});
      else upsertMaintenanceReportBatch(flightId, "nonroutine", { user, entries: nonroutineEntries });
      for(const item of items)regenerateMaintenanceHours("subtask",item.row.id,"已提报");
    } else if (nonroutineBatch) {
      retainMaintenanceReportSource(nonroutineBatch.id,user);
      db.prepare("delete from maintenance_report_entries where batch_id=?").run(nonroutineBatch.id);
      db.prepare("delete from maintenance_report_batches where id=?").run(nonroutineBatch.id);
    }

    const lockedReleaseUserId = String(releaseBatch.entries.find(item => item.role === "放行")?.personId || "").trim();
    const requestedReleaseUserId = String(payload?.releasePersonId || lockedReleaseUserId).trim();
    let finalizationDecision;
    if (finalize && maintenanceGateEvaluationEnabled()) {
      const releaseSelectionMatches = requestedReleaseUserId === lockedReleaseUserId;
      const releasePersonActive = maintenanceReportPeople(flightId).some(row => row.id === lockedReleaseUserId);
      const assignment = db.prepare("select person_id from maintenance_assignments where owner_type='flight' and owner_id=? and role='放行'").get(flightId);
      const releaseAssignmentExists = Boolean(assignment);
      const releaseAssignmentMatches = Boolean(assignment && assignment.person_id === lockedReleaseUserId);
      finalizationDecision=observeMaintenanceTransition(flight, currentProgress, "APPLY_FINALIZE_REPORT",
        releaseSelectionMatches && releasePersonActive && releaseAssignmentExists && releaseAssignmentMatches,
        { releaseReporterAuthorized, releaseSelectionMatches, releasePersonActive, releaseAssignmentExists, releaseAssignmentMatches });
    }
    if (requestedReleaseUserId !== lockedReleaseUserId) throw maintenanceReviewError("放行架次已提报，放行人员不能修改", 409);
    const releasePersonId = lockedReleaseUserId;
    const releasePerson = maintenanceReportPeople(flightId).find(row => row.id === releasePersonId);
    if (!releasePerson) throw maintenanceDispatchError("最终放行人员不存在或已停用");
    const releaseAssignment = db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=? and role='放行'").get(flightId);
    if (!releaseAssignment) throw maintenanceDispatchError("未找到放行派工记录");
    if (releaseAssignment.person_id !== lockedReleaseUserId) throw maintenanceReviewError("放行派工与已提报人员不一致，请核对后重试", 409);
    const targetStatus = finalize ? finalizationDecision?.targetStatus||"待复核" : "已提报";
    if(finalize)recordMaintenanceCoordinatorDecision(flight,'APPLY_FINALIZE_REPORT',finalizationDecision,user);
    db.prepare("update maintenance_assignments set status=?,modified_at=? where id=?").run(targetStatus,now(),releaseAssignment.id);
    // Current directory display changes must not rewrite the submitted release snapshot.
    db.prepare("update maintenance_sortie_results set sorties=1,status=?,updated_at=? where assignment_id=?").run(targetStatus, now(), releaseAssignment.id);

    if (finalize) {
      const stamp = now();
      db.prepare("update maintenance_assignments set status='待复核',modified_at=? where flight_id=? and status='已提报'").run(stamp, flightId);
      db.prepare("update maintenance_hour_results set status='待复核',updated_at=? where flight_id=? and status='已提报'").run(stamp, flightId);
      db.prepare("update maintenance_sortie_results set status='待复核',sorties=1,updated_at=? where flight_id=? and status='已提报'").run(stamp, flightId);
      db.prepare("update maintenance_report_batches set status='待复核',updated_at=? where flight_id=? and status='已提报'").run(stamp, flightId);
      db.prepare("update maintenance_subtasks set status='待复核',updated_by=?,updated_at=? where flight_id=? and status='已提报'").run(user.id, stamp, flightId);
      db.prepare("delete from maintenance_report_drafts where flight_id=?").run(flightId);
      db.prepare("update maintenance_flights set report_finalized_by=?,report_finalized_by_name=?,report_finalized_at=?,report_finalized_mode=?,status=?,updated_by=?,updated_at=? where id=?")
        .run(automatic ? "" : user.id, automatic ? "系统自动报工确认" : user.name, stamp, automatic ? "automatic" : "manual", targetStatus,user.id, stamp, flightId);
    } else {
      reconcileMaintenanceTreeStatus(flightId, user.id, { preserveConfirmed: false });
    }
    const after = { review: maintenanceReviewSnapshot(flightId), progress: maintenanceReportProgress(flightId), releaseOwner: releasePerson.id };
    maintenanceLog(automatic ? { id: "", name: "系统自动报工确认" } : user, automatic ? "report_auto_finalize" : finalize ? "report_finalize" : "report_confirmation_save", "flight", flightId, flightId, JSON.stringify({ before, after, triggerUserId: user.id, triggerUserName: user.name, originalReleaseReporter: releaseBatch.submittedBy, releaseOwner: releasePerson.id, deletedSubtaskIds: deletedIds }));
    return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId));
  };
  return inTransaction ? confirm() : maintenanceTransaction(confirm, flightId);
}

function finalizeMaintenanceReports(flightId, payload, user) {
  return saveMaintenanceReportConfirmation(flightId, payload, user, { finalize: true });
}

function maintenanceWorkReportPayload(flightId, payload = {}) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceDispatchError("未找到维修机会");
  const assignments = db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=? order by assigned_at,user_name").all(flightId);
  const allowedRoles = new Set(maintenanceRolesForOpportunity(flight.work_kind || flight.work_type || "其他").filter(role => role !== "放行"));
  const people = new Map(allPeople().map(person => [person.id, person]));
  const entries = [];
  const seen = new Set();
  for (const item of Array.isArray(payload.entries) ? payload.entries : []) {
    const role = String(item.role || "").trim();
    const personId = String(item.personId || item.id || "").trim();
    if (!allowedRoles.has(role)) throw maintenanceDispatchError(`当前维修机会不支持上报“${role || "未设置"}”`);
    const person = people.get(personId);
    if (!person) throw maintenanceDispatchError("报工人员不存在或已停用");
    const key = `${role}\u0000${personId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ role, person });
  }
  const reportRoles = [...allowedRoles];
  return { flight, assignments, dispatchedRoles: reportRoles, entries, missingRoles: [], feedback: String(payload.feedback || "").trim() };
}

function canUseMaintenanceWorkReport(user, assignments) {
  return assignments.some(row => row.person_id === user.personId);
}

function maintenanceWorkReportView(flightId, user) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) return null;
  const assignments = db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=? order by assigned_at,user_name").all(flightId);
  if (!canUseMaintenanceWorkReport(user, assignments) && !maintenanceCanManage(user)) throw maintenanceDispatchError("只能查看派给自己的维修机会报工");
  const report = maintenanceWorkReport(flightId);
  const defaultEntries = assignments.filter(row => row.role !== "放行").map(row => ({ role: row.role, personId: row.person_id, userName: row.user_name, team: row.team || "未设置" }));
  const roles = maintenanceRolesForOpportunity(flight.work_kind || flight.work_type || "其他").filter(role => role !== "放行");
  const release = assignments.find(row => row.role === "放行") || null;
  return {
    flight: {
      id: flight.id,
      flightNo: maintenanceDisplayFlightNo(flight) || "",
      aircraftNo: flight.aircraft_no || "",
      opportunity: flight.work_kind || flight.work_type || "其他",
      status: flight.status || "未派工"
    },
    roles,
    entries: report.entries.length ? report.entries : defaultEntries,
    feedback: report.feedback,
    reportStatus: report.status,
    release: release ? publicMaintenanceAssignment(release) : null,
    releaseCompleted: !!release && ["已提报", "待复核", "已确认"].includes(release.status) && ["已提报", "待复核", "已确认"].includes(flight.status),
    canFinalize: !!release && release.person_id === user.personId,
    people: allPeople()
  };
}

function saveMaintenanceWorkReport(flightId, payload, user) {
  const mode = payload?.mode === "finalize" ? "finalize" : "save";
  const normalized = maintenanceWorkReportPayload(flightId, payload);
  if (!canUseMaintenanceWorkReport(user, normalized.assignments)) throw maintenanceDispatchError("只能上报派给自己的维修机会");
  if (!["已派工", "已提报"].includes(normalized.flight.status)) throw maintenanceDispatchError("当前状态不能进行报工");
  const releaseAssignments = normalized.assignments.filter(row => row.role === "放行");
  if (mode === "finalize") {
    if (releaseAssignments.length !== 1) throw maintenanceDispatchError("最终提报前必须派工且仅派工一名放行人员");
    const release = releaseAssignments[0];
    if (release.person_id !== user.personId) throw maintenanceDispatchError("只有当前维修机会的放行人员可以报工确认");
    if (!["已提报", "待复核"].includes(release.status) || normalized.flight.status !== "已提报") throw maintenanceDispatchError("请先完成放行，再进行报工确认");
    const baseHours = maintenanceBaseHours("flight", normalized.flight);
    if (normalized.entries.length && !(baseHours > 0)) throw maintenanceDispatchError("当前维修机会缺少有效的标准工时规则");
    const submittedRoles = [...new Set(normalized.entries.map(item => item.role))];
    const missingRules = submittedRoles.filter(role => maintenanceRatioRuleForOwner("flight", normalized.flight, role) === null);
    if (missingRules.length) throw maintenanceDispatchError(`以下工种缺少有效工时比例：${missingRules.join("、")}`);
    const subtaskBlockers = maintenanceSubtaskCompletionBlockers(flightId);
    if (subtaskBlockers.length) throw maintenanceDispatchError(`以下非例行尚未完成：${subtaskBlockers.join("；")}`);
  }

  return maintenanceTransaction(() => {
    if (mode === "finalize" && normalized.entries.length) captureMaintenanceAircraftHours(normalized.flight, user);
    const before = {
      status: normalized.flight.status,
      report: maintenanceWorkReport(flightId),
      assignments: maintenanceAssignments("flight", flightId)
    };
    const stamp = now();
    db.prepare(`insert into maintenance_work_reports(flight_id,status,feedback,reported_by,reported_by_name,reported_at,finalized_by,finalized_by_name,finalized_at,created_at,updated_at)
      values(?,?,?,?,?,?,?,?,?,?,?) on conflict(flight_id) do update set status=excluded.status,feedback=excluded.feedback,reported_by=excluded.reported_by,reported_by_name=excluded.reported_by_name,reported_at=excluded.reported_at,finalized_by=excluded.finalized_by,finalized_by_name=excluded.finalized_by_name,finalized_at=excluded.finalized_at,updated_at=excluded.updated_at`)
      .run(flightId, mode === "finalize" ? "已提交" : "草稿", normalized.feedback, user.id, user.name, stamp, mode === "finalize" ? user.id : "", mode === "finalize" ? user.name : "", mode === "finalize" ? stamp : "", stamp, stamp);
    db.prepare("delete from maintenance_work_report_entries where flight_id=?").run(flightId);
    const insertEntry = db.prepare("insert into maintenance_work_report_entries(flight_id,role,person_id,user_name,team,created_at,updated_at) values(?,?,?,?,?,?,?)");
    normalized.entries.forEach(({ role, person }) => insertEntry.run(flightId, role, person.id, person.name, person.team || "未设置", stamp, stamp));

    if (mode === "finalize") {
      const current = db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=? and role<>'放行'").all(flightId);
      const desired = new Map(normalized.entries.map(item => [`${item.role}\u0000${item.person.id}`, item]));
      for (const row of current) {
        const key = `${row.role}\u0000${row.person_id}`;
        if (desired.has(key)) continue;
        db.prepare("delete from maintenance_feedback where assignment_id=?").run(row.id);
        db.prepare("delete from maintenance_hour_results where assignment_id=?").run(row.id);
        db.prepare("delete from maintenance_assignments where id=?").run(row.id);
      }
      const retained = new Map(db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=? and role<>'放行'").all(flightId).map(row => [`${row.role}\u0000${row.person_id}`, row]));
      for (const { role, person } of normalized.entries) {
        const key = `${role}\u0000${person.id}`;
        let row = retained.get(key);
        if (!row) {
          const id = insertMaintenanceAssignment({
            ownerType: "flight",
            ownerId: flightId,
            flightId,
            personId: person.id,
            userName: person.name,
            team: person.team || "未设置",
            role,
            status: "待复核",
            feedback: normalized.feedback,
            assignedBy: user.id,
            assignedAt: stamp,
            receivedAt: stamp,
            startedAt: stamp,
            completedAt: stamp,
            submittedAt: stamp,
            modifiedAt: stamp
          });
          row = db.prepare("select * from maintenance_assignments where id=?").get(id);
        } else {
          db.prepare("update maintenance_assignments set user_name=?,team=?,status='待复核',feedback=?,completed_at=?,submitted_at=?,modified_at=? where id=?")
            .run(person.name, person.team || "未设置", normalized.feedback, stamp, stamp, stamp, row.id);
        }
        db.prepare("delete from maintenance_feedback where assignment_id=?").run(row.id);
        db.prepare("insert into maintenance_feedback(id,assignment_id,owner_type,owner_id,person_id,role,content,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)")
          .run(randomId("mtnfb"), row.id, "flight", flightId, person.id, role, normalized.feedback, stamp, stamp);
      }
      regenerateMaintenanceResults("flight", flightId);
      reconcileMaintenanceTreeStatus(flightId, user.id, { preserveConfirmed: false });
    }

    const after = {
      status: db.prepare("select status from maintenance_flights where id=?").get(flightId)?.status || normalized.flight.status,
      report: maintenanceWorkReport(flightId),
      assignments: maintenanceAssignments("flight", flightId)
    };
    maintenanceLog(user, mode === "finalize" ? "work_report_finalize" : "work_report_save", "flight", flightId, flightId, JSON.stringify({ before, after }));
    return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId));
  });
}

function escapeAttribute(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function safeUrl(value) {
  const url = String(value || "").trim();
  return /^(https?:|mailto:|\/(?!\/)|#)/i.test(url) ? url : "";
}

function safeStyle(value) {
  const allowed = [];
  for (const item of String(value || "").split(";")) {
    const [rawName, rawValue] = item.split(":").map(part => part?.trim());
    const name = String(rawName || "").toLowerCase();
    const cssValue = String(rawValue || "");
    if (!["color", "background-color"].includes(name)) continue;
    if (/^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]+)$/i.test(cssValue)) allowed.push(`${name}:${cssValue}`);
  }
  return allowed.join(";");
}

function sanitizeRichHtml(value) {
  const allowed = new Set(["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "span", "a", "div"]);
  let html = String(value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|svg|math)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|svg|math)[^>]*\/?\s*>/gi, "");
  html = html.replace(/<\/?([a-z0-9:-]+)([^>]*)>/gi, (match, rawTag, attrs = "") => {
    const tag = rawTag.toLowerCase();
    if (!allowed.has(tag)) return "";
    if (match.startsWith("</")) return `</${tag}>`;
    if (tag === "br") return "<br>";
    const attrParts = [];
    if (tag === "a") {
      const href = safeUrl((attrs.match(/\s href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i) || [])[2] || (attrs.match(/\s href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i) || [])[3] || (attrs.match(/\s href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i) || [])[4]);
      if (href) attrParts.push(`href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer"`);
    }
    const styleMatch = attrs.match(/\s style\s*=\s*("([^"]*)"|'([^']*)')/i);
    const style = safeStyle(styleMatch?.[2] || styleMatch?.[3] || "");
    if (style) attrParts.push(`style="${escapeAttribute(style)}"`);
    return `<${tag}${attrParts.length ? " " + attrParts.join(" ") : ""}>`;
  });
  return html;
}

function withInfoAccess(user){
  const predicate=personnelAccess.predicate(user,'info');
  return {...user,infoAllowedAccounts:new Set(db.prepare(`select u.id from users u join personnel p on p.id=u.person_id where ${predicate.sql}`).all(...predicate.params).map(row=>row.id)),
    infoRecipientRecords:new Set(db.prepare('select record_id from record_recipients where user_id=?').all(user.id).map(row=>row.record_id))};
}

function canViewRecord(user,record) {
 if(!user?.id || !record || !hasRbac(user,"info.read"))return false;
 const visible=personnelAccess.hasAll(user,"info") || (user.infoRecipientRecords?user.infoRecipientRecords.has(record.id):isRecordRecipient(user,record)) || isRecordOwner(user,record) || dataScopeAllowsUser(user,record.publisher_id || record.created_by,"info");
 return visible && (record.publish_status!=="作废" || hasAnyRbac(user,["info.restore","info.void.any"]));
}

function canViewFixedProject(user) {
  return hasRbac(user, "fixed.read");
}

function publicReceiptsFor(user,recordIds) {
 const ids=new Set(recordIds);
 return receipts().filter(row=>ids.has(row.recordId) && (row.userId===user.id || (hasAnyRbac(user,["info.receipt.manage","info.stats.read"]) && dataScopeAllowsUser(user,row.userId,"info"))));
}

function attachmentRow(id) {
  return db.prepare("select * from attachments where id=?").get(id);
}

function ownerRecord(row) {
  if (!row || row.owner_type !== "record") return null;
  return db.prepare("select * from records where id=?").get(row.owner_id);
}

function canViewAttachment(user, row) {
  if (!row) return false;
  if (row.owner_type === "record") return canViewRecord(user, ownerRecord(row));
  if (row.owner_type === "fixedProject") return canViewFixedProject(user);
  return false;
}

function canManageAttachmentCheck(user, row) {
  if (!row || !user || !user.id) return { ok: false, error: "请先登录" };
  if (row.owner_type === "record") {
    const record = ownerRecord(row);
    if (!record) return { ok: false, error: "未找到信息" };
    if ((record.publish_status || "已发布") === "作废") {
      return hasRbac(user, "info.restore") && (isRecordOwner(user,record) || dataScopeAllowsUser(user,record.publisher_id || record.created_by,"info"))
        ? { ok: true }
        : { ok: false, error: "当前账户无权管理作废信息附件" };
    }
    if (hasRbac(user, "info.update.any") && dataScopeAllowsUser(user,record.publisher_id || record.created_by,"info")) return { ok: true };
    if (!isRecordOwner(user, record) || !hasAnyRbac(user, ["info.update.own", "info.create"])) return { ok: false, error: "当前账号无权管理该信息附件" };
    return { ok: true };
  }
  if (row.owner_type === "fixedProject") {
    return hasRbac(user, "fixed.manage")
      ? { ok: true }
      : { ok: false, error: "当前账号没有固化项目维护权限" };
  }
  return { ok: false, error: "附件归属无效" };
}

function canManageAttachment(user, row) {
  return canManageAttachmentCheck(user, row).ok;
}

function safeUploadPath(name) {
  const full = path.resolve(uploadDir, name || "");
  const relative = path.relative(uploadDir, full);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return "";
  return full;
}

function isRecordOwner(user, record) {
 return !!user?.id && !!record && (record.publisher_id ? record.publisher_id === user.id : record.created_by === user.id);
}

function isRecordRecipient(user, record) {
  if (!user || !user.id || !record) return false;
  return !!db.prepare("select 1 from record_recipients where record_id=? and user_id=?").get(record.id, user.id);
}

function canEditRecord(user, record) {
  return (hasRbac(user, "info.update.any") && dataScopeAllowsUser(user,record.publisher_id || record.created_by,"info")) || (hasRbac(user, "info.update.own") && isRecordOwner(user, record));
}

function canDeleteRecord(user, record) {
  return (hasRbac(user, "info.delete.any") && dataScopeAllowsUser(user,record.publisher_id || record.created_by,"info")) || (hasRbac(user, "info.delete.own") && isRecordOwner(user, record));
}

function canVoidRecord(user, record) {
  if (!user || !record || (record.publish_status || "已发布") === "作废") return false;
  return (hasRbac(user, "info.void.any") && dataScopeAllowsUser(user,record.publisher_id || record.created_by,"info")) || (hasRbac(user, "info.void.own") && isRecordOwner(user, record));
}

function canUseStats(user) {
  return hasRbac(user, "info.stats.read");
}

function saveRecipients(recordId, people) {
 const current=db.prepare("select * from record_recipients where record_id=?").all(recordId);
 const wanted=new Map(people.map(p=>[p.accountId,p]));
 for(const row of current) {
   if(wanted.has(row.user_id)) {wanted.delete(row.user_id);continue;}
   const p=db.prepare("select data_status from personnel where id=?").get(row.person_id);
   if(p?.data_status==="deleted")continue;
   db.prepare("delete from record_recipients where record_id=? and user_id=?").run(recordId,row.user_id);
 }
 for(const person of wanted.values()) db.prepare("insert into record_recipients(record_id,user_id,person_id,name,department,team) values(?,?,?,?,?,?)").run(recordId,person.accountId,person.personId,person.name,person.department,person.team);
}

function updateReceiptStatus(recordId, userId, status) {
  const allowed = new Set(["未读", "已读", "已超期", "超期已读"]);
  if (!allowed.has(status)) {
    const error = new Error("阅读状态无效");
    error.status = 400;
    throw error;
  }
  const actor=requestUser();if(actor && !dataScopeAllowsUser(actor,userId,"info"))throw Object.assign(new Error("接收人员不在信息管理范围内"),{status:403});
  const existing = db.prepare("select * from read_receipts where record_id=? and user_id=?").get(recordId, userId);
  const remindCount = existing?.remind_count || 0;
  const lastRemindedAt = existing?.last_reminded_at || "";
  if (status === "未读" || status === "已超期") {
    db.prepare("insert into read_receipts(record_id,user_id,read_at,is_overdue,remind_count,last_reminded_at) values(?,?,?,?,?,?) on conflict(record_id,user_id) do update set read_at='',is_overdue=0")
      .run(recordId, userId, "", 0, remindCount, lastRemindedAt);
    return;
  }
  db.prepare("insert into read_receipts(record_id,user_id,read_at,is_overdue,remind_count,last_reminded_at) values(?,?,?,?,?,?) on conflict(record_id,user_id) do update set read_at=excluded.read_at,is_overdue=excluded.is_overdue")
    .run(recordId, userId, now(), status === "超期已读" ? 1 : 0, remindCount, lastRemindedAt);
}

function recipientsFromPayload(payload = {}) {
 const selected=Array.isArray(payload.recipients)?payload.recipients:[];
 const people=allLoginPeople();
 if(payload.allInScope === true) return people;
 if(!selected.length) throw Object.assign(new Error("请选择接收人员或明确选择范围内全部人员"),{status:400});
 const allowed=new Map(people.map(p=>[p.personId,p]));
 const result=selected.map(item=>allowed.get(String(typeof item === "object" ? item.personId : item)));
 if(result.some(p=>!p))throw Object.assign(new Error("包含不可发送的接收人员"),{status:403});
 return Array.from(new Map(result.map(p=>[p.personId,p])).values());
}

function fileNameFromDisposition(value) {
  const utf = String(value || "").match(/filename\\*=(?:UTF-8'')?([^;]+)/i);
  if (utf) return decodeURIComponent(utf[1].replace(/^"|"$/g, ""));
  const simple = String(value || "").match(/filename="([^"]+)"/i);
  return simple ? simple[1] : "附件";
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = String(contentType || "").match(/boundary=(.+)$/);
  if (!boundaryMatch) return [];
  const boundary = Buffer.from(`--${boundaryMatch[1]}`);
  const parts = [];
  let start = buffer.indexOf(boundary);
  while (start >= 0) {
    start += boundary.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    const next = buffer.indexOf(boundary, start);
    if (next < 0) break;
    const part = buffer.slice(start, next - 2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd >= 0) {
      const header = part.slice(0, headerEnd).toString("utf8");
      const data = part.slice(headerEnd + 4);
      const disposition = header.split("\r\n").find(line => /^content-disposition:/i.test(line)) || "";
      const typeLine = header.split("\r\n").find(line => /^content-type:/i.test(line)) || "";
      const field = disposition.match(/name="([^"]+)"/i)?.[1] || "file";
      const name = fileNameFromDisposition(disposition);
      if (data.length) parts.push({ field, name, type: typeLine.replace(/^content-type:\s*/i, "") || "application/octet-stream", data });
    }
    start = next;
  }
  return parts;
}

function multipartBoundary(contentType) {
  const match = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match ? match[1] || match[2] : "";
}

function multipartPartInfo(headerText) {
  const lines = String(headerText || "").split("\r\n");
  const disposition = lines.find(line => /^content-disposition:/i.test(line)) || "";
  const typeLine = lines.find(line => /^content-type:/i.test(line)) || "";
  return {
    field: disposition.match(/name="([^"]+)"/i)?.[1] || "",
    name: fileNameFromDisposition(disposition),
    type: typeLine.replace(/^content-type:\s*/i, "") || "application/octet-stream"
  };
}

async function writeUploadChunk(stream, chunk) {
  if (!chunk?.length) return;
  if (!stream.write(chunk)) await once(stream, "drain");
}

async function closeUploadStream(stream) {
  if (!stream) return;
  stream.end();
  await once(stream, "finish");
}

async function cleanupUploadedFiles(files = []) {
  await Promise.all(files.map(file => file?.fullPath ? fs.unlink(file.fullPath).catch(() => null) : null));
}

async function receiveMultipartUploads(req, ownerType = 'fixedProject') {
  const boundaryText = multipartBoundary(req.headers["content-type"]);
  if (!boundaryText) throw uploadHttpError(400, "上传请求格式无效");
  const firstBoundary = Buffer.from(`--${boundaryText}`);
  const boundary = Buffer.from(`\r\n--${boundaryText}`);
  const headerBreak = Buffer.from("\r\n\r\n");
  const requestLimit = uploadLimit(ownerType) * MAX_FILES_PER_REQUEST + 1024 * 1024;
  const saved = [];
  let total = 0;
  let buffer = Buffer.alloc(0);
  let state = "preamble";
  let current = null;
  let finished = false;

  const beginFile = info => {
    if (info.field !== "file" || !info.name || info.name === "附件") {
      current = null;
      return;
    }
    if (saved.length >= MAX_FILES_PER_REQUEST) throw uploadHttpError(413, `单次最多上传 ${MAX_FILES_PER_REQUEST} 个附件`);
    const safeName = path.basename(info.name || "附件");
    validateUploadName(safeName);
    const attId = randomId("att");
    const storedName = `${attId}-${safeName}`;
    const targetPath = safeUploadPath(storedName);
    if (!targetPath) throw uploadHttpError(400, "附件路径无效");
    current = {
      id: attId,
      attachmentId: attId,
      name: safeName,
      type: info.type,
      size: 0,
      storage: "server",
      path: storedName,
      fullPath: targetPath,
      url: `/api/attachments/${encodeURIComponent(attId)}`,
      stream: fss.createWriteStream(targetPath, { flags: "wx" })
    };
  };

  const writeCurrent = async chunk => {
    if (!current || !chunk.length) return;
    current.size += chunk.length;
    if (current.size > uploadLimit(ownerType)) throw uploadHttpError(413, uploadLimitMessage(ownerType));
    await writeUploadChunk(current.stream, chunk);
  };

  const finishCurrent = async () => {
    if (!current) return;
    await closeUploadStream(current.stream);
    delete current.stream;
    if (!current.size) throw uploadHttpError(400, "空文件不能上传");
    const head=Buffer.alloc(Math.min(current.size,512));
    const handle=await fs.open(current.fullPath,'r');
    try{await handle.read(head,0,head.length,0);}finally{await handle.close();}
    validateUploadContent(current.name,head);
    current.type=safeAttachmentMime(current.name);
    saved.push(current);
    current = null;
  };

  try {
    for await (const chunk of req) {
      total += chunk.length;
      if (total > requestLimit) throw uploadHttpError(413, "请求内容过大");
      buffer = Buffer.concat([buffer, chunk]);
      let progressed = true;
      while (progressed && !finished) {
        progressed = false;
        if (state === "preamble") {
          const index = buffer.indexOf(firstBoundary);
          if (index < 0) {
            buffer = buffer.slice(Math.max(0, buffer.length - firstBoundary.length));
            break;
          }
          buffer = buffer.slice(index + firstBoundary.length);
          state = "afterBoundary";
          progressed = true;
        }
        if (state === "afterBoundary") {
          if (buffer.length < 2) break;
          if (buffer[0] === 45 && buffer[1] === 45) {
            finished = true;
            progressed = true;
          } else if (buffer[0] === 13 && buffer[1] === 10) {
            buffer = buffer.slice(2);
            state = "headers";
            progressed = true;
          } else {
            throw uploadHttpError(400, "上传分隔符格式无效");
          }
        }
        if (state === "headers") {
          const headerEnd = buffer.indexOf(headerBreak);
          if (headerEnd < 0) {
            if (buffer.length > 16 * 1024) throw uploadHttpError(400, "附件头部过大");
            break;
          }
          const headerText = buffer.slice(0, headerEnd).toString("utf8");
          beginFile(multipartPartInfo(headerText));
          buffer = buffer.slice(headerEnd + headerBreak.length);
          state = "body";
          progressed = true;
        }
        if (state === "body") {
          const boundaryIndex = buffer.indexOf(boundary);
          if (boundaryIndex >= 0) {
            await writeCurrent(buffer.slice(0, boundaryIndex));
            buffer = buffer.slice(boundaryIndex + boundary.length);
            await finishCurrent();
            state = "afterBoundary";
            progressed = true;
          } else {
            const keep = boundary.length + 4;
            const safeLength = buffer.length - keep;
            if (safeLength > 0) {
              await writeCurrent(buffer.slice(0, safeLength));
              buffer = buffer.slice(safeLength);
              progressed = true;
            }
          }
        }
      }
    }
    if (!finished) throw uploadHttpError(400, "上传内容不完整");
    if (!saved.length) throw uploadHttpError(400, "未找到有效附件");
    return saved;
  } catch (error) {
    if (current?.stream) current.stream.destroy();
    await cleanupUploadedFiles([...saved, current]);
    throw error;
  }
}

function attachmentExt(name = "") {
  return (String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/) || ["", ""])[1];
}

function uploadHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validateUploadName(name) {
  const ext = attachmentExt(name);
  if (!ext || BLOCKED_ATTACHMENT_EXTS.has(ext) || !ALLOWED_ATTACHMENT_EXTS.has(ext)) {
    throw uploadHttpError(415, "不允许上传该文件类型");
  }
}

function validateUpload(file) {
  const size = file?.data?.length || 0;
  if (!size) {
    throw uploadHttpError(400, "空文件不能上传");
  }
  if (size > MAX_UPLOAD_BYTES) {
    throw uploadHttpError(413, "单个附件不能超过100MB");
  }
  validateUploadName(file.name);
}

function contentTypeForAttachment(row) {
  return safeAttachmentMime(row?.name || row?.path);
}

function isInlineSafeAttachment(row) {
  return isInlineSafeName(row?.name || row?.path);
}

function attachmentDisposition(row, download = false) {
  const disposition = !download && isInlineSafeAttachment(row) ? "inline" : "attachment";
  return `${disposition}; filename*=UTF-8''${encodeURIComponent(row?.name || "附件")}`;
}

function signedCosAttachment(row, expiresSeconds = 300, download = false) {
  const expiresIn = Math.max(60, Math.min(300, Number(expiresSeconds) || 300));
  return {
    url: cosSignedUrl("GET", row.path, expiresIn, {
      "response-content-type": contentTypeForAttachment(row),
      "response-content-disposition": attachmentDisposition(row, download)
    }),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    expiresIn,
    fileName: row.name || "附件",
    mimeType: contentTypeForAttachment(row),
    size: Number(row.size || 0)
  };
}

function attachmentCacheHeaders(row, stat) {
  const modified = stat.mtime.toUTCString();
  const etag = `"${Buffer.from(`${row.id}:${stat.size}:${Number(stat.mtimeMs).toFixed(0)}`).toString("base64url")}"`;
  return {
    "Accept-Ranges": "bytes",
    "Last-Modified": modified,
    "ETag": etag,
    "Cache-Control": "private, max-age=86400",
    "X-Accel-Buffering": "no"
  };
}

function parseRangeHeader(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader || "").trim());
  if (!match || size < 1) return null;
  let start;
  let end;
  if (match[1] === "" && match[2] === "") return null;
  if (match[1] === "") {
    const suffixLength = Number(match[2]);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Number(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  }
  if (start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function streamAttachment(req, res, row, filePath, download = false) {
  const stat = await fs.stat(filePath);
  const type = contentTypeForAttachment(row);
  const disposition = isInlineSafeAttachment(row) ? "inline" : "attachment";
  const baseHeaders = {
    ...securityHeaders(),
    ...attachmentCacheHeaders(row, stat),
    "Content-Type": type,
    "Content-Disposition": attachmentDisposition(row, download)
  };
  if (download) baseHeaders["Cache-Control"] = "private, no-store";
  if (req.headers["if-none-match"] === baseHeaders.ETag) {
    res.writeHead(304, baseHeaders);
    return res.end();
  }
  const range = parseRangeHeader(req.headers.range, stat.size);
  if (req.headers.range && !range) {
    res.writeHead(416, { ...baseHeaders, "Content-Range": `bytes */${stat.size}` });
    return res.end();
  }
  if (range) {
    const length = range.end - range.start + 1;
    res.writeHead(206, {
      ...baseHeaders,
      "Content-Length": length,
      "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`
    });
    return fss.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
  }
  res.writeHead(200, { ...baseHeaders, "Content-Length": stat.size });
  return fss.createReadStream(filePath).pipe(res);
}

async function addUploadedAttachments(req, res, ownerType, ownerId) {
  const user = requireLogin(req, res);
  if (!user) return;
  const table = ownerType === "record" ? "records" : "fixed_projects";
  const owner = db.prepare(`select * from ${table} where id=?`).get(ownerId);
  if (!owner) return send(res, 404, { error: "未找到项目" });
  const probeRow = { owner_type: ownerType, owner_id: ownerId };
  const permission = canManageAttachmentCheck(user, probeRow);
  if (!permission.ok) return send(res, 403, { error: permission.error || "无权管理该项目附件" });
  let files;
  try {
    files = await receiveMultipartUploads(req, ownerType);
  } catch (error) {
    return send(res, error.status || 400, { error: error.message || "附件上传失败" });
  }
  const insert = db.prepare("insert into attachments(id,owner_type,owner_id,name,type,size,storage,path,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?)");
  let inTransaction = false;
  try {
    db.exec("begin immediate");
    inTransaction = true;
    const freshUser=currentUser(req);
    if(!canManageAttachmentCheck(freshUser,probeRow).ok)throw Object.assign(new Error("当前权限或范围已变化，上传未生效"),{status:403});
    for (const file of files) {
      insert.run(file.id, ownerType, ownerId, file.name, file.type, file.size, "server", file.path, user.id, now());
    }
    db.exec("commit");
    inTransaction = false;
  } catch (error) {
    if (inTransaction) db.exec("rollback");
    await cleanupUploadedFiles(files);
    throw error;
  }
  const attachments = files.map(({ fullPath, ...file }) => file);
  audit(user, "upload_attachment", ownerType, ownerId, attachments.map(file => `${file.name}(${file.size}B)`).join("; "));
  send(res, 201, { attachments });
}

function attachmentOwner(ownerType, ownerId) {
  const table = ownerType === "record" ? "records" : "fixed_projects";
  return db.prepare(`select * from ${table} where id=?`).get(ownerId);
}

function requireAttachmentOwnerAccess(req, res, ownerType, ownerId) {
  const user = requireLogin(req, res);
  if (!user) return null;
  if (!attachmentOwner(ownerType, ownerId)) {
    send(res, 404, { error: "未找到项目" });
    return null;
  }
  const permission = canManageAttachmentCheck(user, { owner_type: ownerType, owner_id: ownerId });
  if (!permission.ok) {
    send(res, 403, { error: permission.error || "无权管理该项目附件" });
    return null;
  }
  return user;
}

async function createCosUpload(req, res, ownerType, ownerId) {
  if (!cosEnabled()) return send(res, 409, { error: "COS 直传未配置" });
  const user = requireAttachmentOwnerAccess(req, res, ownerType, ownerId);
  if (!user) return;
  const payload = await bodyJson(req);
  const name = path.basename(String(payload.name || "附件"));
  const size = Number(payload.size || 0);
  validateUploadName(name);
  if (!Number.isFinite(size) || size <= 0) return send(res, 400, { error: "空文件不能上传" });
  if (size > uploadLimit(ownerType)) return send(res, 413, { error: uploadLimitMessage(ownerType) });
  const attachmentId = randomId("att");
  const objectKey = `attachments/${ownerType}/${ownerId}/${attachmentId}-${name}`;
  return send(res, 200, {
    attachmentId,
    objectKey,
    uploadUrl: cosSignedUrl("PUT", objectKey, 300),
    expiresIn: 300,
    headers: { "Content-Type": safeAttachmentMime(name) }
  });
}

async function verifyCosUploadedAttachment(objectKey, size, fetchImpl = fetch) {
  let head;
  try {
    head = await fetchImpl(cosSignedUrl("HEAD", objectKey, 300), {
      method: "HEAD", signal: AbortSignal.timeout(15000)
    });
  } catch {
    return { ok: false, status: 502, code: "COS_UPLOAD_CHECK_UNAVAILABLE", error: "COS 附件校验暂时无法连接，请稍后重试" };
  }
  const requestId = head.headers.get("x-cos-request-id") || "";
  if (!head.ok) {
    if (head.status === 404) return { ok: false, status: 409, cosStatus: head.status, requestId, code: "COS_UPLOAD_OBJECT_NOT_FOUND", error: "COS 中未找到已上传附件，请重新上传" };
    if (head.status === 403) return { ok: false, status: 502, cosStatus: head.status, requestId, code: "COS_UPLOAD_CHECK_FORBIDDEN", error: "COS 附件校验被拒绝，请管理员检查存储账号的 HeadObject 权限或签名配置" };
    return { ok: false, status: 502, cosStatus: head.status, requestId, code: "COS_UPLOAD_CHECK_FAILED", error: "COS 附件校验失败，请稍后重试" };
  }
  const actualSize = Number(head.headers.get("content-length") || 0);
  if (!Number.isSafeInteger(actualSize) || actualSize !== size) return { ok: false, status: 409, requestId, code: "COS_UPLOAD_SIZE_MISMATCH", error: "附件大小校验失败" };
  return { ok: true };
}

async function completeCosUpload(req, res, ownerType, ownerId) {
  if (!cosEnabled()) return send(res, 409, { error: "COS 直传未配置" });
  const user = requireAttachmentOwnerAccess(req, res, ownerType, ownerId);
  if (!user) return;
  const payload = await bodyJson(req);
  const attachmentId = String(payload.attachmentId || "").trim();
  const objectKey = String(payload.objectKey || "").trim();
  const name = path.basename(String(payload.name || "附件"));
  const size = Number(payload.size || 0);
  const expectedPrefix = `attachments/${ownerType}/${ownerId}/${attachmentId}-`;
  if (!attachmentId || !objectKey.startsWith(expectedPrefix)) return send(res, 400, { error: "附件上传凭据无效" });
  validateUploadName(name);
  if (!Number.isSafeInteger(size) || size <= 0) return send(res, 400, { error: "附件大小无效" });
  if (size > uploadLimit(ownerType)) return send(res, 413, { error: uploadLimitMessage(ownerType) });
  const check = await verifyCosUploadedAttachment(objectKey, size);
  if (!check.ok) {
    console.warn(JSON.stringify({ event: "cos_upload_check_failed", attachmentId, code: check.code, cosStatus: check.cosStatus, requestId: check.requestId }));
    return send(res, check.status, { error: check.error, code: check.code, requestId: check.requestId || "" });
  }
  if (attachmentRow(attachmentId)) return send(res, 409, { error: "附件已登记" });
  if(!canManageAttachmentCheck(currentUser(req),{owner_type:ownerType,owner_id:ownerId}).ok)return send(res,403,{error:'当前权限或范围已变化，上传未生效'});
  db.prepare("insert into attachments(id,owner_type,owner_id,name,type,size,storage,path,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?)")
    .run(attachmentId, ownerType, ownerId, name, safeAttachmentMime(name), size, "cos", objectKey, user.id, now());
  audit(user, "upload_attachment", ownerType, ownerId, `${name}(${size}B):COS`);
  return send(res, 201, { attachment: attachments(ownerType, ownerId).find(item => item.id === attachmentId) });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(publicDir, "." + requested);
  const relative = path.relative(publicDir, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return sendText(res, 403, "Forbidden");
  try {
    const stat = await fs.stat(filePath);
    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const immutable = /\.[a-f0-9]{12,}\.(?:js|css)$/i.test(filePath);
    const noCache = requested.startsWith("/attendance") || [".html", ".webmanifest"].includes(path.extname(filePath).toLowerCase()) || ["sw.js", "app.js"].includes(path.basename(filePath)) || requested === "/capability/module.js" || ["/templates/flight-plan.xlsx", "/templates/routine-dispatch.xlsx", "/templates/additional-work.xlsx"].includes(requested);
    const cacheControl = immutable ? "public, max-age=31536000, immutable" : noCache ? "no-cache" : "public, max-age=3600";
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ...securityHeaders(), "ETag": etag, "Cache-Control": cacheControl });
      return res.end();
    }
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === ".html" ? "text/html; charset=utf-8"
      : ext === ".css" ? "text/css; charset=utf-8"
      : [".js", ".mjs"].includes(ext) ? "text/javascript; charset=utf-8"
      : ext === ".wasm" ? "application/wasm"
      : ext === ".webmanifest" ? "application/manifest+json; charset=utf-8"
      : ext === ".json" ? "application/json; charset=utf-8"
      : ext === ".xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : ext === ".png" ? "image/png"
      : ext === ".ico" ? "image/x-icon"
      : "application/octet-stream";
    res.writeHead(200, { ...securityHeaders(), "Content-Type": type, "Content-Length": data.length, "ETag": etag, "Cache-Control": cacheControl });
    res.end(data);
  } catch {
    if ((req.method || "GET") === "GET" && !path.extname(requested)) {
      const data = await fs.readFile(path.join(publicDir, "index.html"));
      res.writeHead(200, { ...securityHeaders(), "Content-Type": "text/html; charset=utf-8", "Content-Length": data.length, "Cache-Control": "no-cache" });
      res.end(data);
      return;
    }
    sendText(res, 404, "Not found");
  }
}

function readingStats(query = {}) {
  const start = query.startDate ? parseRecordDate(query.startDate) : null;
  const endBase = query.endDate ? parseRecordDate(query.endDate) : null;
  const end = endBase ? new Date(endBase.getFullYear(), endBase.getMonth(), endBase.getDate(), 23, 59, 59, 999) : null;
  const team = query.team || "全部";
  const search = String(query.search || "").trim().toLowerCase();
  const records = db.prepare("select * from records").all().filter(record => {
    if ((record.publish_status || "已发布") === "作废") return false;
    const date = parseRecordDate(record.date);
    return (!start || date >= start) && (!end || date <= end);
  });
  const actor=requestUser();
  const rows = records.filter(record=>!actor || canViewRecord(actor,record)).flatMap(record => {
    const recs = recipients(record.id).filter(p=>!actor || actionScopeAllows(actor,"info.stats.read",p.personId));
    return recs.map(person => {
      const receipt = db.prepare("select * from read_receipts where record_id=? and user_id=?").get(record.id, person.id);
      const overdue = parseRecordDate(record.deadline || deadlineFor(record.date))?.getTime() < Date.now();
      const status = receipt?.read_at ? (receipt.is_overdue ? "超期已读" : "已读") : (overdue ? "超期未读" : "未读");
      return { record, person, status };
    });
  }).filter(row => {
    const text = [row.person.id, row.person.name, row.person.team].join(" ").toLowerCase();
    return (team === "全部" || row.person.team === team) && (!search || text.includes(search));
  });
  const blank = base => ({ ...base, total: 0, read: 0, unread: 0, overdueUnread: 0, overdueRead: 0, totalUnread: 0, readRate: 0, overdueRate: 0 });
  const fill = (stat, row) => {
    stat.total++;
    if (row.status === "已读") stat.read++;
    if (row.status === "未读") stat.unread++;
    if (row.status === "超期未读") stat.overdueUnread++;
    if (row.status === "超期已读") stat.overdueRead++;
    return stat;
  };
  const done = stat => {
    stat.totalUnread = stat.unread + stat.overdueUnread + stat.overdueRead;
    stat.readRate = stat.total ? Math.round((stat.read + stat.overdueRead) / stat.total * 100) : 0;
    stat.overdueRate = stat.total ? Math.round((stat.overdueRead + stat.overdueUnread) / stat.total * 100) : 0;
    return stat;
  };
  const overview = done(rows.reduce(fill, blank({ publishCount: new Set(rows.map(row => row.record.id)).size })));
  const teamMap = new Map();
  rows.forEach(row => {
    const name = row.person.team || "未设置";
    if (!teamMap.has(name)) teamMap.set(name, blank({ team: name, people: new Set() }));
    teamMap.get(name).people.add(row.person.id);
    fill(teamMap.get(name), row);
  });
  const teams = Array.from(teamMap.values()).map(stat => done({ ...stat, peopleCount: stat.people.size, people: undefined }));
  const personMap = new Map();
  rows.forEach(row => {
    if (!personMap.has(row.person.id)) personMap.set(row.person.id, blank({ id: row.person.id, name: row.person.name, team: row.person.team || "未设置" }));
    fill(personMap.get(row.person.id), row);
  });
  const people = Array.from(personMap.values()).map(done);
  return { overview, teams, people };
}

function statsCsv(data) {
  const line = values => values.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",");
  return [
    line(["整体概览"]),
    line(["发布数", "接收人次", "已读", "未读", "超期未读", "超期已读", "已读率", "超期率"]),
    line([data.overview.publishCount, data.overview.total, data.overview.read, data.overview.unread, data.overview.overdueUnread, data.overview.overdueRead, `${data.overview.readRate}%`, `${data.overview.overdueRate}%`]),
    "",
    line(["班组统计"]),
    line(["班组", "人数", "应读", "已读", "总未读", "未读", "超期未读", "超期已读", "已读率", "超期率"]),
    ...data.teams.map(row => line([row.team, row.peopleCount, row.total, row.read, row.totalUnread, row.unread, row.overdueUnread, row.overdueRead, `${row.readRate}%`, `${row.overdueRate}%`])),
    "",
    line(["个人统计"]),
    line(["姓名", "班组", "应读", "已读", "总未读", "未读", "超期未读", "超期已读", "已读率", "超期率"]),
    ...data.people.map(row => line([row.name, row.team, row.total, row.read, row.totalUnread, row.unread, row.overdueUnread, row.overdueRead, `${row.readRate}%`, `${row.overdueRate}%`]))
  ].join("\n");
}

function xmlEscape(value) {
  return String(value ?? "").replace(/[<>&'"]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[char]));
}

function columnName(index) {
  let name = "";
  for (let number = index + 1; number > 0;) {
    const mod = (number - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    number = Math.floor((number - mod) / 26);
  }
  return name;
}

function worksheetXml(rows) {
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, colIndex) => {
    const ref = `${columnName(colIndex)}${rowIndex + 1}`;
    return typeof value === "number" ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
  }).join("")}</row>`).join("")}</sheetData></worksheet>`;
}

function crc32(buffer) {
  const table = crc32.table || (crc32.table = Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    return crc >>> 0;
  }));
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function zipStore(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.from(file.content);
    const crc = crc32(data);
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]);
    locals.push(local);
    centrals.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += local.length;
  }
  const centralStart = offset;
  const central = Buffer.concat(centrals);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(centralStart), u16(0)]);
  return Buffer.concat([...locals, central, end]);
}

function statsXlsx(data) {
  const tables = [
    { name: "整体概览", rows: [["发布数", "接收人次", "已读", "未读", "超期未读", "超期已读", "已读率", "超期率"], [data.overview.publishCount, data.overview.total, data.overview.read, data.overview.unread, data.overview.overdueUnread, data.overview.overdueRead, `${data.overview.readRate}%`, `${data.overview.overdueRate}%`]] },
    { name: "班组统计", rows: [["班组", "人数", "应读", "已读", "总未读", "未读", "超期未读", "超期已读", "已读率", "超期率"], ...data.teams.map(row => [row.team, row.peopleCount, row.total, row.read, row.totalUnread, row.unread, row.overdueUnread, row.overdueRead, `${row.readRate}%`, `${row.overdueRate}%`])] },
    { name: "个人统计", rows: [["姓名", "班组", "应读", "已读", "总未读", "未读", "超期未读", "超期已读", "已读率", "超期率"], ...data.people.map(row => [row.name, row.team, row.total, row.read, row.totalUnread, row.unread, row.overdueUnread, row.overdueRead, `${row.readRate}%`, `${row.overdueRate}%`])] }
  ];
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tables.map((table, index) => `<sheet name="${xmlEscape(table.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}</Relationships>`;
  const content = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tables.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  return zipStore([
    { name: "[Content_Types].xml", content },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: rels },
    ...tables.map((table, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(table.rows) }))
  ]);
}

function maintenanceXlsx(data) {
  const tables = [
    { name: "工时明细", rows: [["姓名", "班组", "角色", "来源", "工时", "状态", "任务ID"], ...data.hours.map(row => [row.userName, row.team, row.role, row.source, row.finalHours, row.status, `${row.ownerType}:${row.ownerId}`])] },
    { name: "架次明细", rows: [["姓名", "班组", "工种", "来源", "架次", "状态", "任务ID"], ...data.sorties.map(row => [row.userName, row.team, row.role, row.source, row.sorties, row.status, `${row.ownerType}:${row.ownerId}`])] },
    { name: "个人工时", rows: [["姓名", "班组", "总工时", "工时任务数"], ...data.people.map(row => [row.name, row.team, row.hours, row.hourTaskCount])] },
    { name: "个人架次", rows: [["姓名", "班组", "放行架次", "架次任务数"], ...data.people.map(row => [row.name, row.team, row.sorties, row.sortieTaskCount])] },
    { name: "班组工时", rows: [["班组", "总工时", "工时任务数"], ...data.teams.map(row => [row.team, row.hours, row.hourTaskCount])] },
    { name: "班组架次", rows: [["班组", "放行架次", "架次任务数"], ...data.teams.map(row => [row.team, row.sorties, row.sortieTaskCount])] }
  ];
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tables.map((table, index) => `<sheet name="${xmlEscape(table.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}</Relationships>`;
  const content = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tables.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  return zipStore([
    { name: "[Content_Types].xml", content },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: rels },
    ...tables.map((table, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(table.rows) }))
  ]);
}

function maintenanceReportXlsx(data, selectedSections = []) {
  const allowed = new Set(["people", "hours", "signatures", "sorties", "teams", "nonroutine", "opportunities"]);
  const selected = selectedSections.filter(section => allowed.has(section));
  if (!selected.length) throw maintenanceDispatchError("请至少选择一项导出内容");
  const tables = [];
  if (selected.includes("people")) tables.push({
    name: "人员汇总",
    rows: [["姓名", "班组", "例行工时", "非例行工时", "总工时", "放行架次", "维修机会数"], ...maintenanceReportSort(data.people, "people", "totalHours:desc").map(row => [row.name, row.team, row.routineHours, row.nonroutineHours, row.totalHours, row.sorties, row.opportunityCount])]
  });
  if (selected.includes("hours")) tables.push({
    name: "工时明细",
    rows: [["日期", "航班号", "机号", "作业地点", "维修机会", "姓名", "班组", "类型", "任务", "工种", "工时", "状态"], ...data.hours.map(row => [row.date, row.flightNo, row.aircraftNo, row.locationName, row.opportunity, row.userName, row.team, row.type, row.taskName, row.role, row.finalHours, row.status])]
  });
  if (selected.includes("signatures")) tables.push({
    name: "签署明细",
    rows: [["日期", "航班号", "机号", "机型", "作业地点", "维修机会", "例行签署", "非例行签署", "状态"], ...maintenanceReportSort(data.opportunities, "opportunities", "date:desc").map(row => [row.date, row.flightNo, row.aircraftNo, row.aircraftType, row.locationName, row.opportunity, row.routineSignature, row.nonroutineSignature, row.status])]
  });
  if (selected.includes("sorties")) tables.push({
    name: "放行明细",
    rows: [["日期", "航班号", "机号", "机型", "作业地点", "维修机会", "放行人", "班组", "架次", "状态"], ...data.sorties.map(row => [row.date, row.flightNo, row.aircraftNo, row.aircraftType, row.locationName, row.opportunity, row.userName, row.team, row.sorties, row.status])]
  });
  if (selected.includes("teams")) tables.push({
    name: "班组汇总",
    rows: [["班组", "人数", "例行工时", "非例行工时", "总工时", "放行架次", "维修机会数"], ...data.teams.sort((a, b) => b.totalHours - a.totalHours || a.team.localeCompare(b.team, "zh-Hans-CN")).map(row => [row.team, row.peopleCount, row.routineHours, row.nonroutineHours, row.totalHours, row.sorties, row.opportunityCount])]
  });
  if (selected.includes("opportunities")) tables.push({
    name: "维修机会核对", rows: [["维修机会ID", "日期", "航班号", "机号", "作业地点", "维修机会", "参与人员", "例行工时", "非例行工时", "总工时", "放行架次", "状态"],
      ...maintenanceReportSort(data.opportunitiesAudit || [], "opportunities", "date:desc").map(row => [row.id, row.date, row.flightNo, row.aircraftNo, row.locationName, row.opportunity,
        row.participants.map(person => person.name).join("、"), row.routineHours, row.nonroutineHours, row.totalHours, row.sorties, row.status])] });
  if (selected.includes("nonroutine")) {
    const tasks = data.nonroutineAudit || [];
    tables.push({ name: "非例行任务", rows: [["条目ID", "日期", "航班号", "机号", "作业地点", "维修机会", "章节", "标题", "类别", "标准总工时", "实际总工时", "派工人数", "状态", "工时认定状态"],
      ...tasks.map(row => [row.id, row.date, row.flightNo, row.aircraftNo, row.locationName, row.opportunity, row.chapter, row.title, row.category, row.standardHours, row.hasResults ? row.actualHours : "尚无工时结果", row.assignedCount, row.status, row.recognitionStatusLabel])] });
    tables.push({ name: "非例行人员工时", rows: [["条目ID", "日期", "航班号", "作业地点", "标题", "姓名", "班组", "核算工种", "原施工工种", "派工状态", "原始工时", "调整后工时", "最终工时", "结果状态", "工时认定状态"],
      ...tasks.flatMap(row => row.people.map(person => [row.id, row.date, row.flightNo, row.locationName, row.title, person.userName, person.team, person.role, person.assignmentRole||"", person.assignmentStatus,
        person.resultHours ?? "", person.adjustedHours ?? "", person.finalHours ?? "", person.resultStatus || "尚无工时结果", row.recognitionStatusLabel]))] });
  }
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tables.map((table, index) => `<sheet name="${xmlEscape(table.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}</Relationships>`;
  const content = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tables.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  return zipStore([
    { name: "[Content_Types].xml", content },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: rels },
    ...tables.map((table, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(table.rows) }))
  ]);
}

const personnelImportTypes = new Set(["personnel", "license", "authorization", "training"]);

function normalizedCell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function normalizedHeader(value) {
  return normalizedCell(value).replace(/[\s\r\n]+/g, "");
}

function tabularRowsToObjects(inputRows, rowNumbers = []) {
  if (!Array.isArray(inputRows) || !inputRows.length) return [];
  const sourceRow = (index, fallback) => Array.isArray(rowNumbers) && Number.isSafeInteger(rowNumbers[index]) && rowNumbers[index] > 0 ? rowNumbers[index] : fallback;
  if (!Array.isArray(inputRows[0])) return inputRows.map((row, index) => ({ ...Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [normalizedHeader(key), normalizedCell(value)])), __importRowNumber: sourceRow(index, index + 2) }));
  const headers = inputRows[0].map(normalizedHeader);
  return inputRows.slice(1).map((row, index) => ({ row, rowNumber: sourceRow(index + 1, index + 2) }))
    .filter(({ row }) => Array.isArray(row) && row.some(cell => normalizedCell(cell)))
    .map(({ row, rowNumber }) => ({ ...Object.fromEntries(headers.map((header, index) => [header, normalizedCell(row[index])])), __importRowNumber: rowNumber }));
}

function importValue(row, names) {
  for (const name of names) {
    const value = normalizedCell(row[normalizedHeader(name)]);
    if (value) return value;
  }
  return "";
}

function importEmployeeNo(row) {
  return importValue(row, ["员工工号", "工号", "人员工号", "员工号"]);
}

function importName(row) {
  return importValue(row, ["员工姓名", "人员姓名", "姓名"]);
}

function importDepartment(row) {
  return importValue(row, ["部门", "部门名称", "所在部门名称", "所属部门"]);
}

function importRequiredHeaders(type) {
  return {
    personnel: [["员工工号"], ["员工姓名"]],
    license: [["员工工号", "工号", "人员工号"], ["人员姓名", "姓名"], ["执照类型"]],
    authorization: [["工号"], ["姓名"], ["项目代码"], ["授权类型"], ["授权单位"], ["授权状态"]],
    training: [["人员工号", "员工工号", "工号"], ["人员姓名", "姓名"], ["课程代码"], ["课程名称"]]
  }[type] || [];
}

function analyzePersonnelImport(type, rows) {
  const issues = type==="authorization"?authorizationImport.validate(rows):[];
  const seenEmployees = new Map();
  let valid = 0;
  rows.forEach((row, index) => {
    const rowNumber = Number(row.__importRowNumber) || index + 2;
    const employeeNo = importEmployeeNo(row);
    const name = importName(row);
    if (type === "authorization") {
      const projectCode = importValue(row, ["项目代码"]), sourceName = importValue(row, ["项目名称"]);
      const project = authorizationProjects.getByCode(projectCode);
      if (!authorizationProjects.configured(project)) issues.push({ rowNumber, issueType: "unconfigured_project", severity: "error", employeeNo, detail: `项目代码“${projectCode || "（空）"}”未配置，请先在后台设置维护后重新上传` });
      else if (sourceName && sourceName !== project.project_name) issues.push({ rowNumber, issueType: "project_name_conflict", severity: "warning", employeeNo, detail: `项目 ${projectCode} 的导入名称“${sourceName}”与标准名称不同，将显示“${project.project_name}”，不会覆盖目录` });
    }
    if (!employeeNo) issues.push({ rowNumber, issueType: "missing_employee_no", severity: "error", employeeNo: "", detail: "员工工号不能为空" });
    else if (!isValidEmployeeNo(employeeNo)) issues.push({ rowNumber, issueType: "invalid_employee_no", severity: "error", employeeNo, detail: "员工工号必须为8位数字" });
    if (!name) issues.push({ rowNumber, issueType: "missing_name", severity: "error", employeeNo, detail: "人员姓名不能为空" });
    if (type === "personnel" && employeeNo) {
      if (seenEmployees.has(employeeNo)) issues.push({ rowNumber, issueType: "duplicate_employee_no", severity: "error", employeeNo, detail: `工号与第 ${seenEmployees.get(employeeNo)} 行重复` });
      else seenEmployees.set(employeeNo, rowNumber);
    }
    const existing = employeeNo ? db.prepare("select name,department,data_status from personnel where employee_no=?").get(employeeNo) : null;
    if (existing?.data_status === "deleted") issues.push({ rowNumber, issueType: "deleted_person", severity: "error", employeeNo, detail: `工号 ${employeeNo} 的人员已删除，不能通过导入恢复或新增资质` });
    if (type !== "personnel" && employeeNo && !existing) issues.push({ rowNumber, issueType: "unmatched_person", severity: "error", employeeNo, detail: "未在人员基本信息中找到该工号，请先导入人员基本信息" });
    if (existing && name && existing.name !== name) issues.push({ rowNumber, issueType: "name_conflict", severity: type==="authorization"?"error":"warning", employeeNo, detail: `系统姓名“${existing.name}”与导入姓名“${name}”不一致` });
    const department = importDepartment(row);
    if (existing?.department && department && existing.department !== department) issues.push({ rowNumber, issueType: "department_change", severity: "warning", employeeNo, detail: `部门由“${existing.department}”变为“${department}”` });
    if (type === "personnel" && existing) {
      const overrides = db.prepare("select field_name,field_value from personnel_field_overrides where person_id=(select id from personnel where employee_no=?)").all(employeeNo);
      const importedValues = { name, department, homeTeam: importValue(row, ["正式班组", "班组"]), employmentStatus: importValue(row, ["用工状态"]) };
      overrides.forEach(override => {
        const incoming = importedValues[override.field_name];
        if (incoming && String(incoming) !== String(override.field_value || "")) issues.push({ rowNumber, issueType: "manual_override_preserved", severity: "warning", employeeNo, detail: `${personnelEditableFields[override.field_name]?.[1] || override.field_name}已被管理员人工修正，本次导入将保留系统值` });
      });
    }
    if (isValidEmployeeNo(employeeNo) && name) valid++;
  });
  return { total: rows.length, valid, errors: issues.filter(item => item.severity === "error").length, warnings: issues.filter(item => item.severity === "warning").length, issues };
}

function insertImportIssues(batchId, issues) {
  const insert = db.prepare("insert into personnel_import_issues(id,batch_id,row_number,issue_type,severity,employee_no,detail,status,resolution,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)");
  issues.forEach(issue => insert.run(randomId("pissue"), batchId, issue.rowNumber, issue.issueType, issue.severity, issue.employeeNo || "", issue.detail || "", "open", "", now(), now()));
}

function dictionaryValue(category, code, value, batchId) {
  const normalized = normalizedCell(value);
  if (!normalized) return;
  db.prepare("insert or ignore into master_data_dictionary_values(id,category,code,value,status,source_batch_id,created_at,updated_at) values(?,?,?,?,?,?,?,?)")
    .run(randomId("dict"), category, normalizedCell(code), normalized, "active", batchId, now(), now());
}

function findImportedPerson(employeeNo) {
  return employeeNo ? db.prepare("select * from personnel where employee_no=?").get(employeeNo) : null;
}

const personnelImportFields = {
 name:["员工姓名","人员姓名","姓名"],department:["部门"],personnelGroup:["人员分组"],administrativeTeam:["行政班组"],
 isInstructor:["是否教员"],position:["职位"],actualGrade:["实际岗级"],employmentStatus:["用工状态"]
};
function personnelImportPayload(row) {
 const fields={};
 for(const [key,aliases] of Object.entries(personnelImportFields))if(aliases.some(a=>Object.hasOwn(row,a))) fields[key]=importValue(row,aliases);
 if(!fields.name)fields.name=importName(row);
 if(Object.hasOwn(fields,"isInstructor"))fields.isInstructor=["是","true","1"].includes(String(fields.isInstructor).toLowerCase());
 return fields;
}
function validatePersonnelImportAccess(type,rows,user) {
 const issues=[];
 rows.forEach((row,index)=>{
 try {
   const existing=findImportedPerson(importEmployeeNo(row));
   if(type==="personnel"){
     const forbidden=["车间","人员分类","当前工作班组","工作班组","性别","年龄","需求单位","最高学历","英语等级","加入本企业途径","派遣标志"];
     const found=forbidden.filter(key=>Object.hasOwn(row,key));
     if(found.length)throw new Error(`不再接受旧字段：${found.join("、")}`);
   }
   if(existing && !actionScopeAllows(user, type==="authorization"?"personnel.qualification.manage":"personnel.import.execute", existing.id))throw new Error("该行不在可维护范围内");
   if(existing?.data_status==="deleted")return; // The import analyser reports deleted employee numbers without attempting restoration.
   if(type==="authorization"&&existing&&["离职","停职"].includes(existing.employment_status))throw new Error("停职或离职人员不能导入授权");
   if(type==="personnel")personnelAccess.checkMutation(user,personnelImportPayload(row),existing);
   else {personnelAccess.permission(user,"personnel.qualification.manage");if(existing)requireActionScope(user,"personnel.qualification.manage",existing.id,true);}
  }catch(e){issues.push({rowNumber:Number(row.__importRowNumber)||index+2,employeeNo:importEmployeeNo(row),detail:e.status===404?"该行不在可维护范围内":e.message});}
 });
 if(issues.length)throw Object.assign(new Error("导入存在权限、范围或组织异常，整批未生效"),{status:400,details:{issues}});
}
function visibleImportBatch(batch,user,context=null) {
 const rows=context ? context.rows.get(batch.id) : json(batch.rows_json,[]);
 return rows.every(row=>{
   const p=context ? context.people.get(importEmployeeNo(row)) : findImportedPerson(importEmployeeNo(row));
   if(p && !(context ? context.allowed.has(p.id) : actionScopeAllows(user,"personnel.import.view",p.id)))return false;
   if(!p && !(context ? context.hasAll : actionScopeHasAll(user,"personnel.import.view")))return batch.created_by===user.id;
   if(batch.import_type!=="personnel")return hasRbac(user,"personnel.qualification.view");
   return hasRbac(user,"personnel.actual_grade.manage") || !Object.keys(personnelImportPayload(row)).some(k=>SENSITIVE_FIELDS.includes(k));
 });
}
function confirmPersonnelRows(batchId, rows, user) {
  const upsert = db.prepare(`insert into personnel(id,employee_no,name,department,home_team,is_instructor,position_code,actual_grade,employment_status,source_batch_id,data_status,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(employee_no) do update set name=excluded.name,department=excluded.department,home_team=excluded.home_team,is_instructor=excluded.is_instructor,position_code=excluded.position_code,actual_grade=excluded.actual_grade,employment_status=excluded.employment_status,source_batch_id=excluded.source_batch_id,updated_at=excluded.updated_at`);
  let created = 0, updated = 0, skipped = 0, selfPositionBlocked = 0;
  for (const row of rows) {
    const employeeNo = importEmployeeNo(row), importedName = importEmployeeNo(row) === SUPER_ACCOUNT_ID ? SUPER_ACCOUNT_NAME : importName(row);
    let name = importedName;
    if (!employeeNo || !name) { skipped++; continue; }
    const existing = findImportedPerson(employeeNo);
    // D06-1：导入不得修改确认操作者本人的职位（值未变化时放行）。该行跳过，不阻断整批。
    if (existing && user?.personId && user.personId === existing.id && existing.position_code !== undefined) {
      const supplied = personnelImportPayload(row);
      if (Object.hasOwn(supplied, "position") && String(supplied.position ?? "").trim() !== String(existing.position_code ?? "").trim()) { selfPositionBlocked++; skipped++; continue; }
    }
    const values = {name,department:importDepartment(row),personnelGroup:importValue(row,["人员分组"]),administrativeTeam:importValue(row,["行政班组"]),isInstructor:["是","true","1"].includes(importValue(row,["是否教员"]).toLowerCase())?1:0,position:importValue(row,["职位"]),actualGrade:importValue(row,["实际岗级"]),employmentStatus:employeeNo===SUPER_ACCOUNT_ID?"在职":importValue(row,["用工状态"])||"在职"};
    const supplied=personnelImportPayload(row);
    if(existing)for(const [key,[column]] of Object.entries(personnelEditableFields))if(!Object.hasOwn(supplied,key))values[key]=existing[column];
    if (existing) {
      const overrideNames = new Set(db.prepare("select field_name from personnel_field_overrides where person_id=?").all(existing.id).map(item => item.field_name));
      for (const [apiField, [column]] of Object.entries(personnelEditableFields)) if (overrideNames.has(apiField)) values[apiField] = existing[column];
    }
    const organizationImport={};
    for(const key of ["department","personnelGroup","administrativeTeam"])if(Object.hasOwn(supplied,key))organizationImport[key]=values[key];
    const org=personnelAccess.organizationPayload(organizationImport,existing || {});
    ({ name } = values);
    const department=org.department,team=org.home_team,status=values.employmentStatus;
    upsert.run(existing?.id || randomId("person"), employeeNo, name, department, team, values.isInstructor, values.position, values.actualGrade, status, batchId, "active", existing?.created_at || now(), now());
    const savedPerson = findImportedPerson(employeeNo);
    personnelAccess.saveOrganization(savedPerson.id,org);
    if(!existing||String(existing.department_id||"")!==String(org.department_id||"")||String(existing.personnel_group_id||"")!==String(org.personnel_group_id||"")||String(existing.administrative_team_id||"")!==String(org.administrative_team_id||"")){
      db.prepare("insert into personnel_organization_history(id,person_id,department_id,personnel_group_id,administrative_team_id,changed_by,change_reason,changed_at) values(?,?,?,?,?,?,?,?)").run(randomId("org-history"),savedPerson.id,org.department_id,org.personnel_group_id,org.administrative_team_id,user.id,existing?"导入更新组织归属":"初始创建",now());
      const linked=db.prepare("select id from users where person_id=?").get(savedPerson.id);
      if(linked && linked.id!==SUPER_ACCOUNT_ID)revokeUserSessions(linked.id,{bumpCredentialVersion:true});
    }
    const linkedAccount = savedPerson ? db.prepare("select id from users where person_id=?").get(savedPerson.id) : null;
    if (linkedAccount && ["离职", "停职"].includes(status)) {
      db.prepare("update users set status='disabled',credential_version=coalesce(credential_version,1)+1,updated_at=? where id=?").run(now(), linkedAccount.id);
      revokeUserSessions(linkedAccount.id);
    } else if (linkedAccount) {
      db.prepare("update users set name=?,department=?,team=?,updated_at=? where id=?").run(name, department, team, now(), linkedAccount.id);
    }
    [
      ["department", "", department], ["position", "", importValue(row, ["职位"])],
      ["actual_grade", "", importValue(row, ["实际岗级"])], ["employment_status", "", status]
    ].forEach(([category, code, value]) => dictionaryValue(category, code, value, batchId));
    if (existing) updated++; else created++;
  }
  return { created, updated, skipped, ...(selfPositionBlocked ? { selfPositionBlocked } : {}) };
}

function confirmLicenseRows(batchId, rows) {
  const upsert = db.prepare(`insert into personnel_licenses(id,person_id,employee_no,license_no,license_type,license_english_level,issued_at,renewed_at,validity_years,expires_at,is_valid,remark,source_created_by,source_created_at,source_updated_by,source_updated_at,source_batch_id,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(person_id,license_no,license_type) do update set license_english_level=excluded.license_english_level,issued_at=excluded.issued_at,renewed_at=excluded.renewed_at,validity_years=excluded.validity_years,expires_at=excluded.expires_at,is_valid=excluded.is_valid,remark=excluded.remark,source_updated_by=excluded.source_updated_by,source_updated_at=excluded.source_updated_at,source_batch_id=excluded.source_batch_id,updated_at=excluded.updated_at`);
  let created = 0, updated = 0, skipped = 0;
  for (const row of rows) {
    const employeeNo = importEmployeeNo(row), person = findImportedPerson(employeeNo), licenseType = importValue(row, ["执照类型"]), licenseNo = importValue(row, ["执照号码"]);
    if (!person || !employeeNo || !licenseType) { skipped++; continue; }
    const existing = db.prepare("select id,created_at from personnel_licenses where person_id=? and license_no=? and license_type=?").get(person.id, licenseNo, licenseType);
    upsert.run(existing?.id || randomId("license"), person.id, employeeNo, licenseNo, licenseType, importValue(row, ["执照英语等级"]), importValue(row, ["颁发日期"]), importValue(row, ["续签日期"]), importValue(row, ["有效年限"]), importValue(row, ["执照有效期"]), importValue(row, ["是否有效"]), importValue(row, ["备注"]), importValue(row, ["创建人"]), importValue(row, ["创建时间"]), importValue(row, ["修改人"]), importValue(row, ["修改时间"]), batchId, existing?.created_at || now(), now());
    dictionaryValue("license_type", "", licenseType, batchId);
    dictionaryValue("license_english_level", "", importValue(row, ["执照英语等级"]), batchId);
    dictionaryValue("license_validity", "", importValue(row, ["是否有效"]), batchId);
    if (existing) updated++; else created++;
  }
  return { created, updated, skipped };
}

const authorizationImport = createAuthorizationImport({db,now,randomId,audit});

function confirmTrainingRows(batchId, rows) {
  const upsertCourse = db.prepare("insert into course_catalog(id,course_code,course_name,course_version,course_nature,status,created_at,updated_at) values(?,?,?,?,?,?,?,?) on conflict(course_code,course_version) do update set course_name=excluded.course_name,course_nature=excluded.course_nature,updated_at=excluded.updated_at");
  const upsert = db.prepare(`insert into personnel_training_records(id,person_id,employee_no,course_code,course_name,course_version,course_nature,started_at,completed_at,training_result,certificate_no,issuer,issuing_unit,issued_at,attendance_status,qualification_status,data_source,class_no,source_batch_id,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(person_id,course_code,course_version,class_no,started_at) do update set course_name=excluded.course_name,course_nature=excluded.course_nature,completed_at=excluded.completed_at,training_result=excluded.training_result,certificate_no=excluded.certificate_no,issuer=excluded.issuer,issuing_unit=excluded.issuing_unit,issued_at=excluded.issued_at,attendance_status=excluded.attendance_status,qualification_status=excluded.qualification_status,data_source=excluded.data_source,source_batch_id=excluded.source_batch_id,updated_at=excluded.updated_at`);
  let created = 0, updated = 0, skipped = 0;
  for (const row of rows) {
    const employeeNo = importEmployeeNo(row), person = findImportedPerson(employeeNo), courseCode = importValue(row, ["课程代码"]), courseName = importValue(row, ["课程名称"]);
    if (!person || !employeeNo || !courseCode || !courseName) { skipped++; continue; }
    const version = importValue(row, ["课程版本"]), classNo = importValue(row, ["班级编号"]), startedAt = importValue(row, ["开始时间"]);
    const course = db.prepare("select id,created_at from course_catalog where course_code=? and course_version=?").get(courseCode, version);
    upsertCourse.run(course?.id || randomId("course"), courseCode, courseName, version, importValue(row, ["课程性质"]), "active", course?.created_at || now(), now());
    const existing = db.prepare("select id,created_at from personnel_training_records where person_id=? and course_code=? and course_version=? and class_no=? and started_at=?").get(person.id, courseCode, version, classNo, startedAt);
    upsert.run(existing?.id || randomId("training"), person.id, employeeNo, courseCode, courseName, version, importValue(row, ["课程性质"]), startedAt, importValue(row, ["完成时间"]), importValue(row, ["培训结果"]), importValue(row, ["证书编号"]), importValue(row, ["签发人"]), importValue(row, ["签发单位"]), importValue(row, ["签发日期"]), importValue(row, ["出席情况"]), importValue(row, ["合格情况"]), importValue(row, ["数据来源"]), classNo, batchId, existing?.created_at || now(), now());
    dictionaryValue("course", courseCode, courseName, batchId);
    dictionaryValue("course_version", courseCode, version, batchId);
    dictionaryValue("course_nature", "", importValue(row, ["课程性质"]), batchId);
    dictionaryValue("training_result", "", importValue(row, ["培训结果"]), batchId);
    dictionaryValue("attendance_status", "", importValue(row, ["出席情况"]), batchId);
    dictionaryValue("qualification_status", "", importValue(row, ["合格情况"]), batchId);
    dictionaryValue("training_source", "", importValue(row, ["数据来源"]), batchId);
    dictionaryValue("issuing_unit", "", importValue(row, ["签发单位"]), batchId);
    if (existing) updated++; else created++;
  }
  return { created, updated, skipped };
}

function confirmPersonnelImport(batch, user, payload={}) {
  if (!batch || batch.status !== "pending") throw Object.assign(new Error("导入批次状态不允许确认"), { status: 409 });
  if(batch.import_type==="authorization"&&payload.confirmReplacement!==true)throw Object.assign(new Error("请明确确认：将替换所列人员全部授权"),{status:400});
  const summary = json(batch.summary_json, {});
  if(summary.workspaceRevision && payload.workspaceRevision!==summary.workspaceRevision)throw Object.assign(new Error("暂存内容已修改，请重新打开处理区核对后确认"),{status:409});
  if (Number(summary.errors || 0) > 0) throw Object.assign(new Error("请先修复导入文件中的阻断错误"), { status: 400, details: { summary } });
  const rows = json(batch.rows_json, []);
  validatePersonnelImportAccess(batch.import_type,rows,user);
  let result;
  db.exec("begin immediate");
  try {
    if(db.kind==="postgres")db.exec("select pg_advisory_xact_lock(54002010,31)");
    if(db.prepare("select status from personnel_import_batches where id=?").get(batch.id)?.status!=="pending")throw Object.assign(new Error("导入批次状态已变化"),{status:409});
    if(db.prepare("select rows_json,summary_json from personnel_import_batches where id=?").get(batch.id)?.summary_json!==batch.summary_json)throw Object.assign(new Error("暂存内容已变化，请重新核对"),{status:409});
    validatePersonnelImportAccess(batch.import_type,rows,user);
    const deletedIssues = rows.map((row, index) => ({ row, index })).filter(({ row }) => findImportedPerson(importEmployeeNo(row))?.data_status === "deleted")
      .map(({ row, index }) => ({ rowNumber: Number(row.__importRowNumber) || index + 2, employeeNo: importEmployeeNo(row), detail: `工号 ${importEmployeeNo(row)} 的人员已删除，请移除该行后重新上传` }));
    if (deletedIssues.length) throw Object.assign(new Error("导入批次包含已删除人员，整批未生效"), { status: 409, details: { issues: deletedIssues } });
    if (batch.import_type === "authorization") {
      authorizationProjects.lock();
      const checked = analyzePersonnelImport("authorization", rows);
      if (checked.errors) throw Object.assign(new Error("授权项目或人员数据已变化，请修复后重新上传检查"), { status: 409, details: { summary: checked, issues: checked.issues } });
      Object.assign(summary, checked);
    }
    result = batch.import_type === "personnel" ? confirmPersonnelRows(batch.id, rows, user)
      : batch.import_type === "license" ? confirmLicenseRows(batch.id, rows)
        : batch.import_type === "authorization" ? authorizationImport.replace(batch, rows, user, summary.replacement)
          : confirmTrainingRows(batch.id, rows);
    if(batch.import_type==="authorization")for(const row of rows){dictionaryValue("authorization_type","",row["授权类型"],batch.id);dictionaryValue("authorization_unit","",row["授权单位"],batch.id);dictionaryValue("authorization_status","",row["授权状态"],batch.id);}
    db.prepare("update personnel_import_batches set status='confirmed',summary_json=?,confirmed_by=?,confirmed_at=?,updated_at=? where id=?")
      .run(JSON.stringify({ ...summary, result }), user.id, now(), now(), batch.id);
    audit(user, "confirm_personnel_import", "personnelImport", batch.id, JSON.stringify({ type: batch.import_type, ...result }));
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
  return result;
}

function publicPersonnelList(user=requestUser(), options={}) {
  const scope=personnelAccess.predicate(user,"personnel");
  return db.prepare(`select p.*,
      coalesce(l.record_count,0) as license_count,
      coalesce(a.record_count,0) as authorization_count,
      coalesce(t.record_count,0) as training_count,
      u.id as account_id,u.username as account_username,u.status as account_status,
      d.name as department_name,g.name as personnel_group_name,g.maintenance_eligible as maintenance_eligible,at.name as administrative_team_name,
      wt.id as current_working_team_id,wt.name as current_working_team_name
    from personnel p
    left join (select person_id,count(*) as record_count from personnel_licenses where coalesce(data_status,'active')='active' group by person_id) l on l.person_id=p.id
    left join (select person_id,count(*) as record_count from personnel_authorizations where coalesce(data_status,'active')='active' group by person_id) a on a.person_id=p.id
    left join (select person_id,count(*) as record_count from personnel_training_records where coalesce(data_status,'active')='active' group by person_id) t on t.person_id=p.id
    left join users u on u.person_id=p.id
    left join organization_units d on d.id=p.department_id
    left join organization_units g on g.id=p.personnel_group_id
    left join organization_units at on at.id=p.administrative_team_id
    left join capability_current_states cs on cs.person_id=p.id
    left join organization_units wt on wt.id=cs.working_team_id
    where p.data_status='active' and (${scope.sql}) ${options.where || ''} order by ${options.order || "p.employee_no"} ${options.limit ? 'limit ? offset ?' : ''}`).all(...scope.params,...(options.params || []),...(options.limit ? [options.limit,options.offset || 0] : [])).map(row => {
      const identity = classifyPosition(row.position_code);
      return personnelAccess.redact(user,({
      id:row.id,personId:row.id,departmentId:row.department_id||"",departmentName:row.department_name||"",personnelGroupId:row.personnel_group_id||"",personnelGroupName:row.personnel_group_name||"",maintenanceEligible:!!row.maintenance_eligible,administrativeTeamId:row.administrative_team_id||"",administrativeTeamName:row.administrative_team_name||"",currentWorkingTeamId:row.current_working_team_id||"",currentWorkingTeamName:row.current_working_team_name||"",organizationStatus:!row.department_id&&!row.personnel_group_id&&!row.administrative_team_id?"unclassified":row.department_id&&!row.personnel_group_id?"group_unassigned":row.department_id&&row.personnel_group_id?"complete":"review_required",hasAccount:!!row.account_id,employeeNo:row.employee_no,name:row.name,
      department:row.department_name||"未设置",homeTeam:row.administrative_team_name||"未设置",
      isInstructor: !!row.is_instructor, position: row.position_code || "", actualGrade: row.actual_grade || "", employmentStatus: row.employment_status || "在职",
      identityClass: identity.identity, identityLabel: identity.identityLabel, identityQuality: identity.quality, suspectedCombined: identity.suspectedCombined || undefined,
      identitySource: identity.source, identityRulesVersion: identity.rulesVersion,
      licenseCount: Number(row.license_count || 0), authorizationCount: Number(row.authorization_count || 0), trainingCount: Number(row.training_count || 0),
      account: row.account_id ? { id: row.account_id, username: row.account_username, status: row.account_status || "active" } : null, updatedAt: row.updated_at
    }));
  });
}

function publicPersonnelPage(searchParams,user=requestUser()) {
 const scope=personnelAccess.predicate(user,"personnel"), predicates=[], params=[];
 const q=String(searchParams.get("q") || "").trim();
 if(q){const pattern="%"+q+"%",authorizationSearch=hasRbac(user,"personnel.qualification.view")?" or exists(select 1 from personnel_authorizations pa left join capability_catalog cc on cc.project_code=pa.project_code where pa.person_id=p.id and coalesce(pa.data_status,'active')='active' and (coalesce(cc.project_name,pa.project_name,'') like ? or pa.project_code like ?))":"";predicates.push(`(p.employee_no like ? or p.name like ? or p.position_code like ? or d.name like ? or g.name like ? or at.name like ?${authorizationSearch})`);params.push(...Array(6).fill(pattern));if(authorizationSearch)params.push(pattern,pattern);}
 for(const [key,column] of [["department","d.name"],["homeTeam","at.name"],["employmentStatus","p.employment_status"]])if(searchParams.get(key)){predicates.push(column+"=?");params.push(searchParams.get(key));}
 const accountStatus=searchParams.get("accountStatus");
 if(accountStatus==="linked")predicates.push("u.id is not null");
 if(accountStatus==="unlinked")predicates.push("u.id is null");
 const extra=predicates.length?" and "+predicates.join(" and "):"";
 const base=`from personnel p left join users u on u.person_id=p.id left join organization_units d on d.id=p.department_id left join organization_units g on g.id=p.personnel_group_id left join organization_units at on at.id=p.administrative_team_id where p.data_status='active' and (${scope.sql})`;
 const pageSize=Math.min(200,Math.max(1,Number(searchParams.get("pageSize")) || 20)),page=Math.max(1,Number(searchParams.get("page")) || 1);
 const sortColumns={employeeNo:"p.employee_no",name:"p.name",department:"d.name",homeTeam:"at.name",updatedAt:"p.updated_at"};
 const order=(sortColumns[searchParams.get("sort")] || sortColumns.employeeNo)+(searchParams.get("order")==="desc"?" desc":" asc")+",p.id";
 const total=Number(db.prepare(`select count(*) as n ${base} ${extra}`).get(...scope.params,...params).n);
 const stats=db.prepare(`select count(*) as total,sum(case when p.employment_status not in ('停职','离职') then 1 else 0 end) as active,sum(case when u.id is not null then 1 else 0 end) as linked ${base}`).get(...scope.params);
 const values=column=>db.prepare(`select distinct ${column} as value ${base} order by ${column}`).all(...scope.params).map(r=>r.value).filter(Boolean);
 return {items:publicPersonnelList(user,{where:extra,params,order,limit:pageSize,offset:(page-1)*pageSize}),total,page,pageSize,facets:{total:Number(stats.total),active:Number(stats.active || 0),linked:Number(stats.linked || 0),departments:values("d.name"),homeTeams:values("at.name")}};
}

function publicPersonnelAuthorizationOverview(searchParams, user=requestUser()) {
  const scope = personnelAccess.predicate(user, "personnel");
  const q = String(searchParams.get("q") || "").trim().slice(0, 100).toLocaleLowerCase("zh-Hans-CN");
  const category = String(searchParams.get("category") || "").trim();
  const status = String(searchParams.get("status") || "有效").trim();
  const team = String(searchParams.get("team") || "").trim();
  const onlyWith = searchParams.get("onlyWith") === "true";
  if (category && !["release", "test_run", "maintenance", "special", "third_party", "other"].includes(category)) throw Object.assign(new Error("授权分类无效"), { status: 400 });
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));
  const requestedPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const rows = db.prepare(`select p.id as person_id,p.employee_no,p.name,p.administrative_team_id,at.name as team_name,
      a.id as authorization_id,a.project_code,a.project_name,a.authorization_type,a.authorization_unit,a.authorization_status,
      c.project_name as catalog_name,c.project_category
    from personnel p
    left join organization_units at on at.id=p.administrative_team_id
    left join personnel_authorizations a on a.person_id=p.id and coalesce(a.data_status,'active')='active'
    left join capability_catalog c on c.project_code=a.project_code
    where p.data_status='active' and (${scope.sql}) order by p.employee_no,p.id,a.project_code,a.id`).all(...scope.params);
  const people = new Map(), teams = new Map(), statuses = new Set();
  for (const row of rows) {
    let person = people.get(row.person_id);
    if (!person) {
      person = { personId: row.person_id, employeeNo: row.employee_no, name: row.name,
        administrativeTeamId: row.administrative_team_id || "", administrativeTeam: row.team_name || "未分配",
        identityMatched: !q || [row.employee_no, row.name].some(value => String(value || "").toLocaleLowerCase("zh-Hans-CN").includes(q)),
        categoryCounts: {}, authorizationCount: 0, matchedAuthorizationCount: 0, matchPreview: "" };
      people.set(row.person_id, person);
      if (row.administrative_team_id) teams.set(row.administrative_team_id, row.team_name || "未分配");
    }
    if (!row.authorization_id) continue;
    if (row.authorization_status) statuses.add(row.authorization_status);
    if (status !== "all" && row.authorization_status !== status) continue;
    if (category && row.project_category !== category) continue;
    person.authorizationCount++;
    const matches = !q || [row.project_code, row.catalog_name || row.project_name, row.authorization_type, row.authorization_unit]
      .some(value => String(value || "").toLocaleLowerCase("zh-Hans-CN").includes(q));
    if (matches) {
      person.matchedAuthorizationCount++;
      if (q && !person.identityMatched && !person.matchPreview) person.matchPreview = row.catalog_name || row.project_name || row.project_code;
    }
    if (person.identityMatched || matches) person.categoryCounts[row.project_category || "other"] = (person.categoryCounts[row.project_category || "other"] || 0) + 1;
  }
  const items = [...people.values()].filter(person => (!team || person.administrativeTeamId === team)
    && (!category || person.authorizationCount > 0)
    && ((status === "有效" || status === "all") || person.authorizationCount > 0)
    && (!onlyWith || person.authorizationCount > 0)
    && (!q || person.identityMatched || person.matchedAuthorizationCount > 0))
    .map(person => ({ ...person, displayCount: person.identityMatched ? person.authorizationCount : person.matchedAuthorizationCount }));
  const total = items.length, page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  return { items: items.slice((page-1)*pageSize, page*pageSize), total, page, pageSize,
    facets: { teams: [...teams].map(([id, name]) => ({ id, name })).sort((a,b) => a.name.localeCompare(b.name,"zh-Hans-CN")),
      statuses: [...statuses].sort((a,b) => a.localeCompare(b,"zh-Hans-CN")) } };
}

const personnelEditableFields = {
  name:["name","姓名"],
  isInstructor:["is_instructor","是否教员"],
  position:["position_code","职位"],actualGrade:["actual_grade","实际岗级"],employmentStatus:["employment_status","在职状态"]
};
const qualificationDefinitions = {
  license:{table:"personnel_licenses",fields:{licenseNo:["license_no","执照号码"],licenseType:["license_type","执照类型"],expiresAt:["expires_at","执照有效期"],isValid:["is_valid","是否有效"],remark:["remark","备注"]}},
  authorization:{table:"personnel_authorizations",fields:{authorizationStatus:["authorization_status","授权状态"],authorizationExpiresAt:["authorization_expires_at","授权有效期"]}},
  training:{table:"personnel_training_records",fields:{courseName:["course_name","课程名称"],completedAt:["completed_at","完成时间"],trainingResult:["training_result","培训结果"],attendanceStatus:["attendance_status","出席情况"],qualificationStatus:["qualification_status","合格情况"]}}
};

function changeQualification(person, kind, recordId, payload, manager, voidRecord = false) {
  if (kind === "authorization" && ["projectName", "projectCode", "project_name", "project_code"].some(key => key in payload)) throw Object.assign(new Error("授权项目代码和名称只读，请在后台设置维护项目名称"), { status: 400 });
  if(kind==="authorization"&&Object.keys(payload).some(k=>!["authorizationStatus","authorizationExpiresAt","reason"].includes(k)))throw Object.assign(new Error("授权编辑包含只读或已移除字段"),{status:400});
  const definition = qualificationDefinitions[kind];
  if (!definition) throw Object.assign(new Error("资质类型无效"), { status: 400 });
  const record = db.prepare(`select * from ${definition.table} where id=? and person_id=? and coalesce(data_status,'active')='active'`).get(recordId, person.id);
  if (!record) throw Object.assign(new Error("未找到资质记录"), { status: 404 });
  const reason = String(payload.reason || "").trim();
  if (!reason) throw Object.assign(new Error("请填写修改或作废原因"), { status: 400 });
  const changes = [];
  if (voidRecord) changes.push({ column: "data_status", label: "记录状态", previous: record.data_status || "active", next: "void" });
  else for (const [apiField, [column, label]] of Object.entries(definition.fields)) {
    if (!(apiField in payload)) continue;
    let next = String(payload[apiField] ?? "").trim();
    if(kind==="authorization"&&apiField==="authorizationStatus"&&!next)throw Object.assign(new Error("授权状态不能为空"),{status:400});
    if(kind==="authorization"&&apiField==="authorizationExpiresAt"){next=authorizationDate(next);const start=authorizationDate(record.authorized_at);if(start&&next&&next<start)throw Object.assign(new Error("授权有效期不得早于授权日期"),{status:400});}
    if (String(record[column] ?? "") !== next) changes.push({ apiField, column, label, previous: record[column] ?? "", next });
  }
  if (!changes.length) return;
  const stamp = now();
  db.exec("begin immediate");
  try {
    if(db.kind==="postgres")db.exec("select pg_advisory_xact_lock(54002010,31)");
    if(!db.prepare(`select id from ${definition.table} where id=? and person_id=?`).get(recordId,person.id))throw Object.assign(new Error("记录已替换，请刷新"),{status:409});
    db.prepare(`update ${definition.table} set ${changes.map(item => `${item.column}=?`).join(",")},updated_at=? where id=?`).run(...changes.map(item => item.next), stamp, recordId);
    const insert = db.prepare("insert into personnel_change_logs(id,person_id,field_name,field_label,old_value,new_value,source_type,source_batch_id,reason,operator_id,operator_name,created_at) values(?,?,?,?,?,?,'manual','',?,?,?,?)");
    changes.forEach(item => insert.run(randomId("pchange"), person.id, `${kind}.${recordId}.${item.apiField || "status"}`, item.label, String(item.previous), String(item.next), reason, manager.id, manager.name, stamp));
    if(kind==="authorization")authorizationImport.bump(person.id);
    db.exec("commit");
  } catch (error) { db.exec("rollback"); throw error; }
  audit(manager, voidRecord ? "void_personnel_qualification" : "update_personnel_qualification", kind, recordId, JSON.stringify({ personId: person.id, reason, fields: changes.map(item => item.column) }));
}

function normalizedPersonnelField(key, value) {
  if (key === "isInstructor") return value === true || value === 1 || value === "1" ? 1 : 0;
  return String(value ?? "").trim();
}

function updatePersonnel(person, payload, manager) {
  const deprecated=["gender","age","demandUnit","highestEducation","englishLevel","entryChannel","dispatchFlag","workshop","workshopId","personnelCategory","personnelCategoryId"];
  const suppliedDeprecated=deprecated.filter(key=>Object.hasOwn(payload,key));
  if(suppliedDeprecated.length)throw Object.assign(new Error(`人员字段已停用：${suppliedDeprecated.join("、")}`),{status:400});
  const org=personnelAccess.checkMutation(manager,payload,person);
  const orgChanged=ORGANIZATION_FIELDS.some(k=>Object.hasOwn(payload,k));
  const reason = String(payload.reason || "").trim();
  if (!reason) throw Object.assign(new Error("请填写修改原因"), { status: 400 });
  const updates = [];
  for (const [apiField, [column, label]] of Object.entries(personnelEditableFields)) {
    if (!(apiField in payload)) continue;
    const next = normalizedPersonnelField(apiField, payload[apiField]);
    const previous = person[column] ?? (column === "is_instructor" ? 0 : "");
    if (String(previous ?? "") === String(next ?? "")) continue;
    updates.push({ apiField, column, label, previous, next });
  }
  const nextName = updates.find(item => item.column === "name")?.next ?? person.name;
  const nextStatus = updates.find(item => item.column === "employment_status")?.next ?? person.employment_status;
  if (!String(nextName || "").trim()) throw Object.assign(new Error("姓名不能为空"), { status: 400 });
  if (!["在职", "停职", "离职"].includes(nextStatus)) throw Object.assign(new Error("在职状态无效"), { status: 400 });
  if (!updates.length && !orgChanged) return { changed: false, personId: person.id };
  const stamp = now();
  db.exec("begin immediate");
  try {
    if(db.kind==="postgres")db.exec("select pg_advisory_xact_lock(54002010,31)");
    personnelAccess.checkMutation(manager,payload,personnelAccess.requirePerson(manager,"personnel",person.id,true));
    if(updates.length){const assignments = updates.map(item => `${item.column}=?`).join(",");
    db.prepare(`update personnel set ${assignments},source_batch_id='manual_override',updated_at=? where id=?`).run(...updates.map(item => item.next), stamp, person.id);}
    if(orgChanged){
      personnelAccess.saveOrganization(person.id,org);
      db.prepare("insert into personnel_organization_history(id,person_id,department_id,personnel_group_id,administrative_team_id,changed_by,change_reason,changed_at) values(?,?,?,?,?,?,?,?)").run(randomId("org-history"),person.id,org.department_id,org.personnel_group_id,org.administrative_team_id,manager.id,String(reason||"").slice(0,500),stamp);
    }
    const insertLog = db.prepare("insert into personnel_change_logs(id,person_id,field_name,field_label,old_value,new_value,source_type,source_batch_id,reason,operator_id,operator_name,created_at) values(?,?,?,?,?,?,'manual','',?,?,?,?)");
    const upsertOverride = db.prepare("insert into personnel_field_overrides(person_id,field_name,field_value,reason,updated_by,updated_at) values(?,?,?,?,?,?) on conflict(person_id,field_name) do update set field_value=excluded.field_value,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=excluded.updated_at");
    updates.forEach(item => {
      insertLog.run(randomId("pchange"), person.id, item.apiField, item.label, String(item.previous ?? ""), String(item.next ?? ""), reason, manager.id, manager.name, stamp);
      upsertOverride.run(person.id, item.apiField, String(item.next ?? ""), reason, manager.id, stamp);
    });
    const refreshed = db.prepare("select * from personnel where id=?").get(person.id);
    const account = db.prepare("select * from users where person_id=?").get(person.id);
    if (account) {
      const forcedDisabled = ["停职", "离职"].includes(refreshed.employment_status);
      db.prepare("update users set name=?,department=?,team=?,status=?,updated_at=? where id=?")
        .run(refreshed.name, refreshed.department || "未设置", refreshed.home_team || "未设置", forcedDisabled ? "disabled" : account.status, stamp, account.id);
    }
    if (account && account.id !== SUPER_ACCOUNT_ID && (orgChanged || updates.some(item => ["department", "home_team", "employment_status"].includes(item.column)))) {
      revokeUserSessions(account.id, { bumpCredentialVersion: true });
    }
    const positionUpdate = updates.find(item => item.column === "position_code");
    const identityChange = positionUpdate ? { from: classifyPosition(positionUpdate.previous), to: classifyPosition(positionUpdate.next) } : null;
    audit(manager, "update_personnel", "personnel", person.id, JSON.stringify({ employeeNo: person.employee_no, fields: [...updates.map(item => item.apiField), ...(orgChanged ? ["departmentId","personnelGroupId","administrativeTeamId"] : [])], reason, ...(identityChange ? { identityChange: { fromIdentity: identityChange.from.identityLabel, fromPosition: identityChange.from.normalizedPosition, toIdentity: identityChange.to.identityLabel, toPosition: identityChange.to.normalizedPosition, rulesVersion: identityChange.to.rulesVersion } } : {}) }));
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
  return { changed: true, personId: person.id };
}

function publicRbacRole(row) {
  const permissions = db.prepare(`select p.code,p.name,p.module from rbac_permissions p
    join rbac_role_permissions rp on rp.permission_id=p.id where rp.role_id=? order by p.module,p.code`).all(row.id);
  const assignedUserCount = Number(db.prepare("select count(*) as count from rbac_user_roles where role_id=?").get(row.id)?.count || 0);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || "",
    systemRole: !!row.system_role,
    status: row.status,
    assignedUserCount,
    permissions: permissions.map(item => item.code),
    permissionDetails: permissions
  };
}

function validatedRolePayload(payload, roleId = "") {
  const name = String(payload.name || "").trim();
  const description = String(payload.description || "").trim();
  const permissionCodes = Array.from(new Set((Array.isArray(payload.permissions) ? payload.permissions : []).map(item => String(item || "").trim()).filter(Boolean)));
  if (!name) throw Object.assign(new Error("角色名称不能为空"), { status: 400 });
  if (!permissionCodes.length) throw Object.assign(new Error("请至少选择一项权限"), { status: 400 });
  const duplicate = roleId
    ? db.prepare("select id from rbac_roles where lower(name)=lower(?) and id<>?").get(name, roleId)
    : db.prepare("select id from rbac_roles where lower(name)=lower(?)").get(name);
  if (duplicate) throw Object.assign(new Error("角色名称已存在"), { status: 409 });
  const permissionRows = permissionCodes.map(code => db.prepare("select id,code from rbac_permissions where code=?").get(code)).filter(Boolean);
  if (permissionRows.length !== permissionCodes.length) throw Object.assign(new Error("包含不存在的权限"), { status: 400 });
  const dependencyErrors = permissionDependencyErrors(permissionCodes);
  if (dependencyErrors.length) {
    const names = new Map(rbacPermissionDefinitions.map(([code, label]) => [code, label]));
    const detail = dependencyErrors.map(item => `${names.get(item.code) || item.code}需要同时选择${names.get(item.dependency) || item.dependency}`);
    throw Object.assign(new Error(`权限组合不完整：${detail.join("；")}`), { status: 400, code: "RBAC_DEPENDENCY_MISSING", details: dependencyErrors });
  }
  return { name, description, permissionRows };
}

function replaceRolePermissions(roleId, permissionRows) {
  db.prepare("delete from rbac_role_permissions where role_id=?").run(roleId);
  const insert = db.prepare("insert into rbac_role_permissions(role_id,permission_id) values(?,?)");
  permissionRows.forEach(permission => insert.run(roleId, permission.id));
}

function importSelections(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(/[|,，、;；]+/);
  return Array.from(new Set(items.map(item => String(item || "").trim()).filter(Boolean)));
}

function accountImportScope(value) {
  const aliases={"本人":"self","本行政班组":"administrative_team","行政班组":"administrative_team","所属人员分组":"personnel_group","所属部门":"department","部门":"department","全部":"all","全部数据":"all"};
  const allowed=new Set(["self","administrative_team","personnel_group","department","all"]);
  const normalized = aliases[value] || value;
  return allowed.has(normalized) ? normalized : "";
}

function validateAccountRoleCombination(roleCodes) {
  const errors = accountRoleCombinationErrors(roleCodes);
  if (errors.some(item => item.code === "SYSTEM_ADMIN_RESERVED")) throw Object.assign(new Error("系统管理员角色仅允许54002010使用"), { status: 403 });
  if (errors.length) throw Object.assign(new Error("请且只能选择一个基础角色：工作者、派工人员或管理者"), { status: 400, code: "RBAC_BASE_ROLE_REQUIRED" });
}

function validateAccountAccess(payload, personId) {
  const roleCodes = Array.from(new Set((Array.isArray(payload.roles) ? payload.roles : []).map(item => String(item || "").trim()).filter(Boolean)));
  if (!roleCodes.length) throw Object.assign(new Error("请至少选择一个角色"), { status: 400 });
  const roleRows = roleCodes.map(code => db.prepare("select id,code,name from rbac_roles where code=? and status='active'").get(code)).filter(Boolean);
  if (roleRows.length !== roleCodes.length) throw Object.assign(new Error("包含不存在或已停用的角色"), { status: 400 });
  validateAccountRoleCombination(roleCodes);
  const scopes = personnelAccess.normalizeScopes(payload.scopes || [],personId);
  return { roleRows, roleCodes, scopes };
}

function isDeletedAccountPerson(account) {
  return !!account?.person_id && db.prepare("select data_status from personnel where id=?").get(account.person_id)?.data_status === "deleted";
}

function validateAccountIdentity(payload, existing = null) {
  if (isDeletedAccountPerson(existing)) throw Object.assign(new Error("关联人员已删除，账户不可启用或换绑"), { status: 409 });
  const personId = String(payload.personId ?? existing?.person_id ?? "").trim();
  if (!personId) throw Object.assign(new Error("必须关联人员主数据"), { status: 400 });
  if (existing && personId !== existing.person_id) throw Object.assign(new Error("账户创建后禁止更换关联人员"), {status:409});
  const actor=requestUser();
  if(actor) requireActionScope(actor,"accounts.read",personId,true);
  const person = db.prepare("select * from personnel where id=? and data_status='active'").get(personId);
  if (!person) throw Object.assign(new Error("关联人员不存在或已失效"), { status: 400 });
  if (["离职", "停职"].includes(person.employment_status)) throw Object.assign(new Error("离职或停职人员不能开通或启用账户"), { status: 409 });
  const linked = existing
    ? db.prepare("select id from users where person_id=? and id<>?").get(personId, existing.id)
    : db.prepare("select id from users where person_id=?").get(personId);
  if (linked) throw Object.assign(new Error("该人员已经关联其他登录账户"), { status: 409 });
  return person;
}

function replaceAccountAccess(userId, access, grantedBy="") {
  db.prepare("delete from rbac_user_roles where user_id=?").run(userId);
  const insertRole = db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)");
  access.roleRows.forEach(role => insertRole.run(userId, role.id, now()));
  db.prepare("delete from rbac_user_scopes where user_id=?").run(userId);
  const scopeCols = db.prepare("select count(*) as n from " + (db.kind === "postgres" ? "(select column_name as name from information_schema.columns where table_name='rbac_user_scopes' and column_name in ('grant_reason','granted_by'))" : "pragma_table_info('rbac_user_scopes')")).get().n;
  const insertScope = scopeCols === 2
    ? db.prepare("insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at,grant_reason,granted_by) values(?,?,?,?,?,?,?,?,?,?,?)")
    : db.prepare("insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)");
  access.scopes.forEach(scope => {
    if (scopeCols === 2) insertScope.run(randomId("scope"), userId, scope.module, scope.scopeType, scope.scopeId, scope.validFrom, scope.validTo, now(), now(), String(scope.grantReason||"").slice(0,500), grantedBy);
    else insertScope.run(randomId("scope"), userId, scope.module, scope.scopeType, scope.scopeId, scope.validFrom, scope.validTo, now(), now());
  });
}

async function route(req,res) {
 return requestContext.run({req}, () => routeRequest(req,res));
}

async function routeRequestMain(req, res) {
  const url = new URL(req.url, "http://localhost");
  const method = req.method || "GET";
  if (["POST","PUT","DELETE"].includes(method) && url.pathname.startsWith("/api/personnel")) {
    // Refresh only after the master-data transaction and response succeeded.
    // Sync failures must not turn a committed import into a misleading failed response.
    res.once?.("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try { capabilityService.syncMaster(); } catch (error) { console.error("主数据已提交，能力快照待重试", error.message); }
      }
    });
  }
  try {
    if (["POST","PUT","PATCH","DELETE"].includes(method) && !sameOriginWrite(req))
      return send(res, 403, { error: "跨站或来源不明的写入请求已拒绝" });
    if(["POST","PUT","DELETE"].includes(method) && String(req.headers["content-type"] || "").includes("application/json"))await bodyJson(req);
    if (method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }
    if (method === "POST" && url.pathname === "/login") {
      const payload = await bodyForm(req);
      const address = loginAddress(req, { trustLocalProxy: process.env.TRUST_LOCAL_PROXY === "true" });
      const allowance = loginProtection.check(payload.username, address);
      if (!allowance.allowed) {
        res.writeHead(429, { "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(allowance.retryAfter), "Cache-Control": "no-store" });
        res.end("登录尝试过于频繁，请稍后再试");
        return;
      }
      const row = db.prepare("select * from users where username=?").get(payload.username || "");
      if (!row || !verifyPassword(payload.password || "", row) || (row.status || "active") === "disabled" || isDeletedAccountPerson(row)) {
        loginProtection.failure(payload.username, address);
        res.writeHead(303, { "Location": `/?login_error=${encodeURIComponent("账号或密码不正确")}`, "Cache-Control": "no-store" });
        res.end();
        return;
      }
      loginProtection.success(payload.username);
      const { sid } = createLoginSession(row);
      res.writeHead(303, {
        "Location": "/",
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookie(sid)
      });
      res.end();
      return;
    }
    if (!url.pathname.startsWith("/api/")) return serveStatic(req, res);

    if(url.pathname.startsWith('/api/action-tasks')){
      const actor=requireLogin(req,res);if(!actor)return;
      if(method==='GET'&&url.pathname==='/api/action-tasks/events'){if(!actionTaskRealtime.connect(req,res,actor))return send(res,429,{error:'实时连接数量已达上限'});return;}
      if(method==='GET'&&url.pathname==='/api/action-tasks/count')return send(res,200,offsetService.tasks.count(actor));
      if(method==='GET'&&url.pathname==='/api/action-tasks')return send(res,200,offsetService.tasks.list(actor,{cursor:url.searchParams.get('cursor'),limit:Number(url.searchParams.get('limit')||20)}));
      return send(res,404,{error:'接口不存在'});
    }
    if(url.pathname==='/api/handover'||url.pathname.startsWith('/api/handover/')){
      const actor=requireLogin(req,res);if(!actor)return;
      if(!requireRbacPermission(req,res,'handover.view'))return;
      if(method==='POST'&&url.pathname==='/api/handover')return send(res,200,handoverService.create(actor,await bodyJson(req)));
      if(method==='GET'&&url.pathname==='/api/handover')return send(res,200,handoverService.list(actor,{scope:url.searchParams.get('scope'),teamId:url.searchParams.get('teamId'),from:url.searchParams.get('from'),to:url.searchParams.get('to'),aircraft:url.searchParams.get('aircraft'),q:url.searchParams.get('q')}));
      if(method==='GET'&&url.pathname==='/api/handover/shift-context')return send(res,200,handoverService.shiftContext(actor));
      if(url.pathname.startsWith('/api/handover/shift-baseline')){
        if(!requireRbacPermission(req,res,'handover.baseline.manage'))return;
        if(method==='GET'&&url.pathname==='/api/handover/shift-baseline')return send(res,200,handoverService.baselineOverview(actor));
        if(method==='POST'&&url.pathname==='/api/handover/shift-baseline/confirm')return send(res,200,handoverService.confirmBaseline(actor,await bodyJson(req)));
        return send(res,404,{error:'接口不存在'});
      }
      if(method==='GET'&&url.pathname==='/api/handover/maintenance-options')return send(res,200,handoverService.maintenanceOptions(actor,{scope:url.searchParams.get('scope'),date:url.searchParams.get('date')}));
      if(method==='GET'&&url.pathname==='/api/handover/recipient-options')return send(res,200,handoverService.recipientOptions(actor,{teamId:url.searchParams.get('teamId')}));
      if(method==='GET'&&url.pathname==='/api/handover/export.xlsx'){
        if(!hasRbac(actor,'handover.export')){audit(actor,'permission_denied','handover','export',JSON.stringify({}));return send(res,403,{error:'没有导出交接记录的权限'});}
        const filters={id:url.searchParams.get('id'),from:url.searchParams.get('from'),to:url.searchParams.get('to'),teamId:url.searchParams.get('teamId'),aircraft:url.searchParams.get('aircraft'),q:url.searchParams.get('q')};
        const data=handoverService.exportData(actor,filters);
        if(!data.handovers.length)return send(res,404,{error:'没有匹配的交接单'});
        const body=handoverXlsx(data.handovers);
        const name=filters.id?`handover-${filters.id}`:`handover-${filters.from||'all'}-${filters.to||'all'}`;
        audit(actor,'handover_export','handover',name,JSON.stringify({handovers:data.handovers.length}));
        return sendBinary(res,200,body,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',{'Content-Disposition':`attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}.xlsx`,'Cache-Control':'no-store'});
      }
      const seg=url.pathname.slice('/api/handover/'.length).split('/');
      if(seg.length===1&&seg[0]){
        if(method==='GET')return send(res,200,handoverService.detail(actor,seg[0]));
        if(method==='PUT')return send(res,200,handoverService.update(actor,seg[0],await bodyJson(req)));
        if(method==='DELETE')return send(res,200,handoverService.deleteDraft(actor,seg[0]));
      }
      if(seg.length===2&&seg[0]&&method==='POST'&&seg[1]==='submit')return send(res,200,handoverService.submit(actor,seg[0],await bodyJson(req)));
      if(seg.length===2&&seg[0]&&method==='POST'&&seg[1]==='confirm')return send(res,200,handoverService.confirm(actor,seg[0]));
      return send(res,404,{error:'接口不存在'});
    }
    if(url.pathname.startsWith('/api/attendance/offsets')){
      let actor=requireLogin(req,res);if(!actor)return;
      const path=url.pathname.slice('/api/attendance/offsets'.length),month=url.searchParams.get('month')||offsetService.activeMonth();
      if(method==='GET'&&path==='/balance')return send(res,200,offsetService.balance(actor,month));
      if(method==='GET'&&path==='/ledger')return send(res,200,offsetService.ledger(actor,month));
      if(method==='GET'&&path==='/routing-issues')return send(res,200,offsetService.routingIssues(actor));
      if(method==='GET'&&path==='/approval-candidates')return send(res,200,offsetService.approvalCandidates(actor));
      if(method==='GET'&&path==='/responsibility-candidates')return send(res,200,offsetService.responsibilityCandidates(actor));
      if(method==='GET'&&path==='/state')return send(res,200,offsetService.state(actor));
      if(method==='GET'&&path==='/rules')return send(res,200,offsetService.monthlyRules(actor));
      if(method==='GET'&&path==='/requests')return send(res,200,offsetService.ownRequests(actor,{month,limit:Number(url.searchParams.get('limit')||20),cursor:url.searchParams.get('cursor')}));
      if(method==='GET'&&/^\/requests\/[^/]+$/.test(path))return send(res,200,offsetService.detail(actor,path.split('/')[2]));
      if(method==='POST'){
       const body=await bodyJson(req),key=req.headers['idempotency-key'];
       if(!body||typeof body!=='object'||Array.isArray(body))return send(res,400,{error:'请提交有效对象'});
       const current=requireLogin(req,res);if(!current)return;
       if(current.id!==actor.id||current.personId!==actor.personId)return send(res,409,{error:'登录身份已变化，请刷新'});actor=current;
       if(path.startsWith('/initialization/'))return send(res,409,{error:'首期初始化已停用，请设置月兑换规则'});

       if(path==='/rules')return send(res,200,offsetService.saveMonthlyRule(actor,body,key));
       if(path==='/trial')return send(res,200,offsetService.trial(actor,body));
       if(path==='/issue')return send(res,200,offsetService.issue(actor,body,key));
       if(path==='/responsibility')return send(res,200,offsetService.confirmResponsibility(actor,body,key));
       if(path==='/reconcile')return send(res,200,offsetService.reconcile(actor,body.personId,body.date,key));
       if(path==='/requests')return send(res,201,offsetService.submit(actor,body,key));
       const match=/^\/requests\/([^/]+)\/(decide|withdraw|transfer)$/.exec(path);
       if(match)return send(res,200,offsetService[match[2]](actor,match[1],body,key));
      }
      return send(res,404,{error:'接口不存在'});
    }
    if (url.pathname.startsWith('/api/attendance/')) {
      const actor = requireRbacPermission(req,res,'attendance.read'); if(!actor)return;
      const filters=Object.fromEntries(['month','query','department','team','personId'].map(k=>[k,url.searchParams.get(k)||'']));
      if(method==='GET'&&['schedule','issues','accumulation'].some(kind=>url.pathname==='/api/attendance/self/'+kind)){
        const kind=url.pathname.split('/').at(-1),data=attendanceService.selfDetails(actor,kind,offsetService.activeMonth());if(kind==='accumulation')data.exchangeRule=data.month?offsetService.exchangeRuleForSource(actor,data.month):null;return send(res,200,offsetService.decorate({...data,people:actor.personId?[{personId:actor.personId,days:data.days}]:[]}));
      }
      if(method==='GET'&&url.pathname==='/api/attendance/self/leaves'){
        if(!actor.personId)return send(res,200,{status:'identity_unbound',people:[]});
        const year=url.searchParams.get('year');
        return send(res,200,attendanceService.leave.snapshot(actor,{personId:actor.personId,...(year?{year}:{})},'attendance.read'));
      }
      if(method==='GET'&&url.pathname==='/api/attendance/self/summary'){const summary=attendanceService.selfSummary(actor),effective=summary.month?offsetService.effectiveMissingDates(actor,summary.month):[],effectiveExceptions=summary.month?offsetService.effectiveExceptionDates(actor,summary.month):[];return send(res,200,{...summary,exceptionOffsetCount:effectiveExceptions.filter(date=>(summary.exceptionDates||[]).includes(date)).length,missingOffsetCount:effective.filter(date=>(summary.missingDates||[]).includes(date)).length,credits:offsetService.balance(actor),...offsetService.versions()});}
      if(url.pathname.startsWith('/api/attendance/leave-balances')){
        const f={month:url.searchParams.get('month')||'',year:url.searchParams.get('year'),query:url.searchParams.get('query')||'',department:url.searchParams.get('department')||'',team:url.searchParams.get('team')||'',personId:url.searchParams.get('personId')||'',group:url.searchParams.get('group')||''};
        if(method==='GET'&&url.pathname==='/api/attendance/leave-balances'){const data=attendanceService.leave.snapshot(actor,f);if(attendanceService.config.approvalPlansEnabled){const plans=attendanceService.approvalPlanDetails(actor,{...f,month:f.month||undefined});data.approvalMonth=plans.month;const byId=new Map(plans.people.map(p=>[p.personId,p.approvalPlans]));data.people=data.people.map(p=>({...p,approvalPlans:byId.get(p.personId)||[]}));}return send(res,200,data);}
        if(method==='GET'&&url.pathname==='/api/attendance/leave-balances/details')return send(res,200,attendanceService.leave.details(actor,f));
        if(method==='POST'&&url.pathname==='/api/attendance/leave-balances/refresh')return send(res,202,attendanceService.leave.refresh(actor,await bodyJson(req)));
        if(method==='GET'&&['/api/attendance/leave-balances/export/xlsx','/api/attendance/leave-balances/export/html'].includes(url.pathname)){
          const scope=url.searchParams.get('scope')||'filtered';if(!['all','filtered'].includes(scope))return send(res,400,{error:'导出范围无效'});
          const selected=scope==='all'?{year:f.year}:f,data=attendanceService.leave.snapshot(actor,selected,'attendance.export');data.filters=selected;data.exportScope=scope==='all'?'全部有权查看人员':'当前筛选人员';data.exportedAt=new Date().toISOString();data.pageSize=attendanceService.displaySettings(actor).pageSize;
          if(url.pathname.endsWith('/html')&&attendanceService.config.approvalPlansEnabled){const plans=attendanceService.approvalPlanDetails(actor,{...selected,month:f.month||undefined});data.approvalMonth=plans.month;const byId=new Map(plans.people.map(p=>[p.personId,p.approvalPlans]));data.people=data.people.map(p=>({...p,approvalPlans:byId.get(p.personId)||[]}));}
          const format=url.pathname.endsWith('/xlsx')?'xlsx':'html',content=format==='xlsx'?leaveXlsx(data):Buffer.from(leaveHtml(data));audit(actor,'attendance_leave_export','attendance',String(data.year),JSON.stringify({format,scope,people:data.people.length}));
          return sendBinary(res,200,content,format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/html; charset=utf-8',{'Cache-Control':'no-store','Content-Disposition':`attachment; filename="leave-${data.year}.${format}"`});
        }
      }
      if(method==='GET'&&url.pathname==='/api/attendance/approval-plans')return send(res,200,attendanceService.approvalPlanDetails(actor,filters));
      if(method==='POST'&&url.pathname==='/api/attendance/approval-plans/refresh')return send(res,202,attendanceService.approvalPlanRefresh(actor,await bodyJson(req)));
      if(method==='GET' && url.pathname==='/api/attendance/display-settings')return send(res,200,attendanceService.displaySettings(actor));
      if(method==='POST' && url.pathname==='/api/attendance/display-settings')return send(res,200,attendanceService.saveDisplaySettings(actor,await bodyJson(req)));
      if(method==='GET' && url.pathname==='/api/attendance/status')return send(res,200,{...attendanceService.status(actor),...offsetService.versions()});
      if(method==='GET' && ['/api/attendance/days','/api/attendance/summary','/api/attendance/exceptions','/api/attendance/person'].includes(url.pathname)){
        const detailLevel=url.searchParams.get('view')||'full',timings=[];
        if(!['full','summary','compact'].includes(detailLevel))return send(res,400,{error:'考勤明细级别无效'});
        if(url.pathname.endsWith('/person')&&!filters.personId)return send(res,400,{error:'请选择人员'});
        const snapshot=offsetService.decorate(attendanceViewerSnapshot(attendanceService.snapshot(actor,filters,url.pathname.endsWith('/summary')?'attendance.stats.read':'attendance.read',{detailLevel,onTiming:(name,ms)=>timings.push(`${name};dur=${ms.toFixed(1)}`)}),hasRbac(actor,'attendance.stats.read')));
        if(url.pathname.endsWith('/exceptions'))snapshot.people=snapshot.people.map(p=>({...p,days:(p.days||[]).filter(attendanceIssueDay)}));
        return send(res,200,snapshot,{'Server-Timing':timings.join(', ')});
      }
      if(method==='POST' && url.pathname==='/api/attendance/approval-reasons/backfill')return send(res,202,attendanceService.enqueueApprovalReasons(actor,await bodyJson(req)));
      if(method==='POST' && url.pathname==='/api/attendance/leave-types/refresh')return send(res,200,await attendanceService.refreshLeaveTypes(actor));
      if(method==='POST' && url.pathname==='/api/attendance/sync'){
        const payload=await bodyJson(req);return send(res,202,attendanceService.enqueue({from:payload.from,to:payload.to,user:actor}));
      }
      if(method==='GET' && url.pathname==='/api/attendance/capability-statuses')return send(res,200,attendanceService.capabilityStatuses(actor,filters.personId));
      if(method==='GET' && ['/api/attendance/export/xlsx','/api/attendance/export/html'].includes(url.pathname)){
        if(!hasRbac(actor,'attendance.export'))return send(res,403,{error:'当前账号没有导出权限'});
        const exportScope=url.searchParams.get('scope')||'filtered';if(!['all','filtered'].includes(exportScope))return send(res,400,{error:'导出范围无效'});
        const selected=exportScope==='all'?{month:filters.month}:filters;
        if(exportScope==='filtered'&&url.searchParams.has('categories')){
          let categories;try{categories=JSON.parse(url.searchParams.get('categories'));}catch{return send(res,400,{error:'类别筛选格式无效'});}
          if(!Array.isArray(categories)||categories.length>100||categories.some(c=>typeof c!=='string'||!c.trim()||c.length>100))return send(res,400,{error:'类别筛选格式无效'});
          selected.categories=[...new Set(categories)];
        }
        const watermark=()=>({source:db.prepare("select id,value_json from attendance_sync_state where id in ('dataVersion','approvalPlanVersion','leaveVersion') order by id").all(),offsets:offsetService.versions(),principal:db.prepare('select id,person_id,status,credential_version from users where id=?').get(actor.id)});
        let snapshot,exportExtras,stable=false;
        for(let attempt=0;attempt<3;attempt++){
         const before=watermark(),exportActor=currentUser(req);
         if(!exportActor.id)return send(res,401,{error:'登录已失效，请重新登录'});
         if(!hasRbac(exportActor,'attendance.read')||!hasRbac(exportActor,'attendance.export'))return send(res,403,{error:'当前账号没有导出权限'});
         snapshot=offsetService.decorate(attendanceService.snapshot(exportActor,selected,'attendance.export',{fresh:true}));
        if(url.pathname.endsWith('/html')&&attendanceService.config.approvalPlansEnabled){snapshot.people=snapshot.people.map(p=>attendanceService.approvalPlans.decorate(p,snapshot.month));snapshot.categories=attendanceOrderedCategories([...new Set([...snapshot.categories,...snapshot.people.flatMap(p=>Object.keys(p.pendingCounts||{}))])]);}
         exportExtras={changes:attendanceService.changes(exportActor,{...selected,month:snapshot.month}),runs:attendanceService.status(exportActor).runs};
         if(JSON.stringify(before)===JSON.stringify(watermark())){snapshot=JSON.parse(JSON.stringify(snapshot));snapshot.sourceVersion=Object.fromEntries(before.source.map(row=>[row.id,JSON.parse(row.value_json)]));snapshot.dataVersion=snapshot.sourceVersion.dataVersion||'';snapshot.offsetVersion=before.offsets.offsetVersion||0;snapshot.ledgerVersion=before.offsets.ledgerVersion||0;exportExtras=JSON.parse(JSON.stringify(exportExtras));stable=true;break;}
        }
        if(!stable)return send(res,409,{error:'数据正在变化，请稍后重新导出'});
        snapshot.exportScope=exportScope==='all'?'全部有权查看人员':'当前筛选人员';snapshot.filters=selected;
        const format=url.pathname.endsWith('/xlsx')?'xlsx':'html';
        const body=format==='xlsx'?attendanceXlsx(snapshot,exportExtras):Buffer.from(attendanceHtml(snapshot));
        audit(actor,'attendance_export','attendance',snapshot.month,JSON.stringify({format,people:snapshot.people.length,scope:exportScope}));
        return sendBinary(res,200,body,format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/html; charset=utf-8',{'Cache-Control':'no-store','Content-Disposition':`attachment; filename="attendance-${snapshot.month}.${format}"`});
      }
      return send(res,404,{error:'未找到考勤接口'});
    }
    if (method === "GET" && url.pathname === "/api/health") {
      let database = "unavailable";
      try {
        db.prepare("select 1 as ok").get();
        database = db.kind || "unknown";
      } catch {}
      return send(res, 200, {
        ok: true,
        status: database === "unavailable" ? "degraded" : "ok",
        service: "muc-online-app",
        version: appVersion,
        environment: isLocalDevelopment ? 'development-'+process.env.MUC_LOCAL_DEVELOPMENT_PROFILE : process.env.MUC_INTEGRATION === 'true' ? 'integration' : isProduction ? 'production' : 'test',
        buildSha: /^[0-9a-f]{40}$/.test(process.env.MUC_BUILD_SHA||'') ? process.env.MUC_BUILD_SHA : null,
        database,
        cos: cosEnabled() ? "configured" : "disabled",
        startedAt: serviceStartedAt,
        time: new Date().toISOString()
      });
    }
    if (method === "GET" && ["/api/admin/audit/logins","/api/admin/audit/logins/export"].includes(url.pathname)) {
      const actor = requireRbacPermission(req,res,"audit.read");
      if (!actor) return;
      const exporting=url.pathname.endsWith('/export');
      if(exporting&&!requireRbacPermission(req,res,"audit.export"))return;
      let filters;
      try { filters=loginAuditFilters(url.searchParams); } catch(error){return send(res,400,{error:error.message});}
      const data=readLoginAudit(db,filters,{all:exporting});
      if(!exporting)return send(res,200,data);
      const generatedAt=now(),file=loginAuditXlsx(data,generatedAt);
      audit(actor,"audit_login_export","audit_logs","login",JSON.stringify({filters,count:data.total}));
      return sendBinary(res,200,file,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",{"Content-Disposition":`attachment; filename="login-audit-${filters.from}-${filters.to}.xlsx"`,"Cache-Control":"no-store"});
    }
    if (method === "GET" && url.pathname === "/api/me") {
      const user = currentUser(req);
      if (!user.id) return send(res, 401, { error: "请先登录" });
      return send(res, 200, { user });
    }
    if (method === "POST" && url.pathname === "/api/login") {
      const payload = await bodyJson(req);
      const address = loginAddress(req, { trustLocalProxy: process.env.TRUST_LOCAL_PROXY === "true" });
      const allowance = loginProtection.check(payload.username, address);
      if (!allowance.allowed) return send(res, 429, { error: "登录尝试过于频繁，请稍后再试" }, { "Retry-After": String(allowance.retryAfter) });
      const row = db.prepare("select * from users where username=?").get(payload.username || "");
      if (!row || !verifyPassword(payload.password || "", row)) {
        loginProtection.failure(payload.username, address);
        audit(null, "login_failed", "user", String(payload.username || "guest"), "invalid_credentials");
        return send(res, 401, { error: "账号或密码不正确" });
      }
      if ((row.status || "active") === "disabled" || isDeletedAccountPerson(row)) {
        loginProtection.failure(payload.username, address);
        return send(res, 403, { error: "账号已停用或人员已删除" });
      }
      loginProtection.success(payload.username);
      const { sid, user } = createLoginSession(row);
      return send(res, 200, { user }, { "Set-Cookie": sessionCookie(sid) });
    }
    if (method === "POST" && url.pathname === "/api/change-password") {
      const login = requireLogin(req, res);
      if (!login) return;
      const payload = await bodyJson(req);
      const oldPassword = String(payload.oldPassword || "");
      const newPassword = String(payload.newPassword || "");
      if (!oldPassword || !newPassword || newPassword.length < 6) {
        return send(res, 400, { error: "请填写旧密码和至少6位新密码" });
      }
      const row = db.prepare("select * from users where id=?").get(login.id);
      if (!row || (row.status || "active") === "disabled" || !verifyPassword(oldPassword, row)) {
        return send(res, 401, { error: "旧密码不正确" });
      }
      const pass = hashPassword(newPassword);
      db.prepare("update users set salt=?,password_hash=?,must_change_password=0,credential_version=coalesce(credential_version,1)+1,updated_at=? where id=?").run(pass.salt, pass.hash, now(), row.id);
      db.prepare("delete from sessions where user_id=?").run(row.id);
      for (const [sid, savedUserId] of sessions.entries()) {
        if (savedUserId === row.id) sessions.delete(sid);
      }
      audit(toUser(row), "change_password", "user", row.id, row.username);
      return send(res, 200, { ok: true });
    }
    if (method === "POST" && url.pathname === "/api/logout") {
      const sid = parseCookies(req)[sessionCookieName];
      if (sid) {
        sessions.delete(sid);
        db.prepare("delete from sessions where id=?").run(sid);
      }
      return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
    }

    const passwordGateUser = currentUser(req);
    if (passwordGateUser.id && passwordGateUser.mustChangePassword) {
      return send(res, 428, { error: "首次登录或密码重置后必须先修改密码", code: "PASSWORD_CHANGE_REQUIRED" });
    }

    if(method==="GET" && url.pathname==="/api/personnel/directory"){
      const user=requireLogin(req,res);if(!user)return;
      return send(res,200,personnelAccess.directory(user,url.searchParams.get("purpose"),url.searchParams));
    }
    const orgRoute=url.pathname.match(/^\/api\/personnel\/organizations(?:\/([^/]+))?$/);
    if(orgRoute){
      const user=requireLogin(req,res);if(!user)return;
      if(method==="GET") return send(res,200,{organizations:personnelAccess.organizations(user).map(o=>({...o,referenceCount:personnelAccess.hasAll(user,"personnel")?personnelAccess.orgReferences(o.id):undefined}))});
      if(!["POST","PUT","DELETE"].includes(method))return send(res,405,{error:"不支持的操作"});
      return send(res,method==="POST"?201:200,personnelAccess.mutateOrganization(user,method,orgRoute[1]?routeParam(orgRoute[1]):"",await bodyJson(req)));
    }
    if (url.pathname.startsWith("/api/capability/")) {
      const capabilityViewPermissions = ["capability.overview.view", "capability.allocation.view", "capability.status.view", "capability.history.view", "capability.scenario.view", "capability.report.view"];
      const actor = requireAnyRbacPermission(req, res, capabilityViewPermissions);
      if (!actor) return;
      capabilityService.syncMaster();
      capabilityService.schedule();
      const space = url.searchParams.get("workspace") || "";
      if (method === "GET" && url.pathname === "/api/capability/workspaces") return send(res, 200, { items:capabilityService.spaces(actor),organizationIssues:capabilityService.organizationIssues(actor),nonParticipants:capabilityService.nonParticipants(actor),readiness:capabilityService.readiness(),masterDataVersion:capabilityService.masterRevision(),capabilityVersion:capabilityService.revision() });
      if (method === "GET" && url.pathname === "/api/capability/snapshot") return send(res, 200, capabilityService.snapshot(actor, space));
      const capabilityAuthorizationRoute=url.pathname.match(/^\/api\/capability\/personnel\/([^/]+)\/authorizations$/);
      if(method==="GET"&&capabilityAuthorizationRoute)return send(res,200,capabilityService.personAuthorizations(actor,space,routeParam(capabilityAuthorizationRoute[1]),url.searchParams.get("category")||"",url.searchParams.get("q")||""));
      if (method === "GET" && url.pathname === "/api/capability/reports") return send(res, 200, capabilityService.report(actor, space));
      if (method === "POST" && url.pathname === "/api/capability/commands") {
        const payload = await bodyJson(req);
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) return send(res, 400, { error: "能力操作请求格式无效" });
        return send(res, 200, capabilityService.command(actor, space, payload.operation, payload));
      }
      if (method === "GET" && url.pathname === "/api/capability/events") {
        res.writeHead(200, { ...securityHeaders(), "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        let lastVersion = "";
        const push = () => {
          const fresh = currentUser(req);
          if (!fresh?.id || !hasAnyRbac(fresh, capabilityViewPermissions)) {
            res.write('event: access-revoked\ndata: {}\n\n'); res.end(); return;
          }
          const version = JSON.stringify({ revision: capabilityService.revision(), masterDataVersion: capabilityService.masterRevision() });
          if (version === lastVersion) { res.write(': heartbeat\n\n'); return; }
          lastVersion = version;
          res.write(`data: ${version}\n\n`);
        };
        push(); const unsubscribe = capabilityService.subscribe(push);
        // The service listener handles same-process changes immediately.  The
        // short revision poll also propagates commits made by another server
        // process that shares the centre database.
        const heartbeat = setInterval(push, 3000); heartbeat.unref?.();
        res.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
        return;
      }
      return send(res, 404, { error: "能力配置接口不存在" });
    }
    if (method === "GET" && url.pathname === "/api/personnel") {
      const manager = requireRbacPermission(req, res, "personnel.list.view");
      if (!manager) return;
      return send(res, 200, publicPersonnelPage(url.searchParams));
    }
    if (method === "GET" && /^\/api\/personnel\/[^/]+\/organization-history$/.test(url.pathname)) {
      // B7-4 历史组织快照查询（V1.1 §5.4）：返回某人的组织归属变更时间线，
      // 可选 date 参数返回该日期时的组织归属（按 changed_at <= date 的最新一条）。
      const seg = url.pathname.split("/").filter(Boolean);
      const personId = decodeURIComponent(seg[2]);
      const manager = requireRbacPermission(req, res, "personnel.detail.view");
      if (!manager) return;
      const person = db.prepare("select id from personnel where id=? and data_status='active'").get(personId);
      if (!person) return send(res, 404, { error: "人员不存在" });
      if (!personnelAccess.allows(manager, "personnel", personId)) return send(res, 403, { error: "该人员不在您的数据范围内" });
      const rows = db.prepare(`select h.id,h.person_id,h.department_id,h.personnel_group_id,h.administrative_team_id,h.changed_by,h.change_reason,h.changed_at,
        d.name as department_name,g.name as group_name,t.name as team_name
        from personnel_organization_history h
        left join organization_units d on d.id=h.department_id
        left join organization_units g on g.id=h.personnel_group_id
        left join organization_units t on t.id=h.administrative_team_id
        where h.person_id=? order by h.changed_at desc`).all(personId);
      const dateParam = url.searchParams.get("date");
      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        const atDate = rows.filter(r => r.changed_at <= dateParam + "T23:59:59.999Z")[0];
        return send(res, 200, { personId, date: dateParam, organization: atDate || null, history: rows });
      }
      return send(res, 200, { personId, history: rows });
    }
    if (method === "GET" && url.pathname === "/api/personnel/identity-quality") {
      const manager = requireRbacPermission(req, res, "personnel.list.view");
      if (!manager) return;
      const scope = personnelAccess.predicate(manager, "personnel");
      const rows = db.prepare(`select p.employee_no as employeeNo,p.name,p.position_code as position,(u.id is not null and u.status='active') as hasAccount from personnel p left join users u on u.person_id=p.id where p.data_status='active' and (${scope.sql}) order by p.employee_no`).all(...scope.params).map(row => ({ ...row, hasAccount: !!row.hasAccount }));
      return send(res, 200, identityQualityReport(rows));
    }
    if (method === "GET" && url.pathname === "/api/personnel/authorizations/overview") {
      const viewer = requireRbacPermission(req, res, "personnel.list.view");
      if (!viewer) return;
      if (!hasRbac(viewer, "personnel.qualification.view")) return send(res, 403, { error: "当前账号没有查看人员授权的权限" });
      return send(res, 200, publicPersonnelAuthorizationOverview(url.searchParams, viewer));
    }
    if (method === "POST" && url.pathname === "/api/personnel") {
      const manager = requireRbacPermission(req, res, "personnel.profile.create");
      if (!manager) return;
      const payload = await bodyJson(req);
      const deprecated=["gender","age","demandUnit","highestEducation","englishLevel","entryChannel","dispatchFlag","workshop","workshopId","personnelCategory","personnelCategoryId"];
      const suppliedDeprecated=deprecated.filter(key=>Object.hasOwn(payload,key));
      if(suppliedDeprecated.length)return send(res,400,{error:`人员字段已停用：${suppliedDeprecated.join("、")}`});
      const employeeNo = String(payload.employeeNo || "").trim();
      const name = String(payload.name || "").trim();
      if (!employeeNo || !name) return send(res, 400, { error: "工号和姓名为必填项" });
      if (!isValidEmployeeNo(employeeNo)) return send(res, 400, { error: "工号必须为8位数字" });
      const sameEmployee = db.prepare("select id,data_status from personnel where employee_no=?").get(employeeNo);
      if (sameEmployee) return send(res, 409, { error: sameEmployee.data_status === "deleted" ? "该工号人员已删除，不能重新录入或恢复" : "该工号已存在" });
      db.exec("begin immediate");
      try {
      if(db.kind==="postgres")db.exec("select pg_advisory_xact_lock(54002010,31)");
      const org=personnelAccess.checkMutation(manager,payload);
      const personId = randomId("person");
      const department=org.department||"";
      const homeTeam=org.home_team||"";
      const position = String(payload.position || "").trim();
      const employmentStatus = String(payload.employmentStatus || "在职").trim() || "在职";
      if(!["在职","停职","离职"].includes(employmentStatus))throw Object.assign(new Error("在职状态无效"),{status:400});
      db.prepare(`insert into personnel(id,employee_no,name,department,home_team,is_instructor,position_code,actual_grade,employment_status,source_batch_id,data_status,created_at,updated_at)
        values(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(personId, employeeNo, name, department, homeTeam, payload.isInstructor ? 1 : 0, position, String(payload.actualGrade || ""), employmentStatus, "manual", "active", now(), now());
      personnelAccess.saveOrganization(personId,org);
      db.prepare("insert into personnel_organization_history(id,person_id,department_id,personnel_group_id,administrative_team_id,changed_at) values(?,?,?,?,?,?)").run(randomId("org-history"),personId,org.department_id,org.personnel_group_id,org.administrative_team_id,now());
      dictionaryValue("department", "", org.department, "manual");
      dictionaryValue("position", "", position, "manual");
      dictionaryValue("employment_status", "", employmentStatus, "manual");
      audit(manager, "create_personnel_manual", "personnel", personId, JSON.stringify({ employeeNo, name }));
      db.exec("commit");
      return send(res, 201, { person: publicPersonnelList().find(item => item.id === personId) });
      } catch(error){db.exec("rollback");throw error;}
    }
    if (method === "GET" && url.pathname === "/api/personnel/dictionaries") {
      const manager = requireRbacPermission(req, res, "personnel.list.view");
      if (!manager) return;
      const values = []; // Values derived from personnel/imports must not expose out-of-scope personal attributes.
      if(hasRbac(manager,"personnel.qualification.view")) values.push(...authorizationProjects.dictionaries());
      return send(res, 200, { values });
    }
    const projectRoute = url.pathname.match(/^\/api\/personnel\/authorization-projects(?:\/([^/]+))?$/);
    if (projectRoute) {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (method === "GET" && !projectRoute[1]) {
        if (!hasAnyRbac(manager, ["personnel.qualification.view", "personnel.qualification.manage"])) return send(res, 403, { error: "没有查看授权项目的权限" });
        return send(res, 200, authorizationProjects.list(url.searchParams));
      }
      if (!hasRbac(manager, "personnel.qualification.manage")) {
        audit(manager, method === "DELETE" ? "reject_delete_authorization_project" : "deny_authorization_project_write", "authorizationProject", projectRoute[1] ? routeParam(projectRoute[1]) : "", "缺少人员资质维护权限");
        return send(res, 403, { error: "没有维护授权项目的权限" });
      }
      const id = projectRoute[1] ? routeParam(projectRoute[1]) : "";
      if (method === "POST" && id === "import") return send(res, 200, authorizationProjects.importRows(await bodyJson(req), manager));
      if (method === "POST" && !id) return send(res, 201, { project: authorizationProjects.create(await bodyJson(req), manager) });
      if (method === "PUT" && id === "categories") return send(res, 200, authorizationProjects.updateCategories(await bodyJson(req), manager));
      if (method === "PUT" && id) return send(res, 200, { project: authorizationProjects.update(id, await bodyJson(req), manager) });
      if (method === "DELETE" && id) return send(res, 200, authorizationProjects.remove(id, manager));
      return send(res, 405, { error: "不支持的授权项目操作" });
    }
    const deletionPreviewRoute = url.pathname.match(/^\/api\/personnel\/([^/]+)\/deletion-preview$/);
    if (deletionPreviewRoute && method === "GET") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      return send(res, 200, personnelDeletion.preview(routeParam(deletionPreviewRoute[1]), manager));
    }
    const personnelDetailRoute = url.pathname.match(/^\/api\/personnel\/([^/]+)$/);
    if (personnelDetailRoute && method === "DELETE") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      return send(res, 200, personnelDeletion.remove(routeParam(personnelDetailRoute[1]), await bodyJson(req), manager));
    }
    if (personnelDetailRoute && method === "GET" && !["imports", "dictionaries"].includes(routeParam(personnelDetailRoute[1]))) {
      const manager = requireRbacPermission(req, res, "personnel.detail.view");
      if (!manager) return;
      const personId = routeParam(personnelDetailRoute[1]);
      const person = publicPersonnelList().find(item => item.id === personId);
      if (!person) return send(res, 404, { error: "未找到人员" });
      const canReadQualifications = hasRbac(manager, "personnel.qualification.view");
      const englishLevels = canReadQualifications
        ? [...new Set(db.prepare(`select license_english_level from personnel_licenses
          where person_id=? and coalesce(data_status,'active')='active'
          and lower(trim(coalesce(is_valid,''))) in ('是','有效','true','1')`)
          .all(personId).map(row => String(row.license_english_level || "").trim()).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }))
        : undefined;
      const qualificationCounts = canReadQualifications ? {
        license: Number(db.prepare("select count(*) as count from personnel_licenses where person_id=? and coalesce(data_status,'active')='active'").get(personId).count),
        authorization: Number(db.prepare("select count(*) as count from personnel_authorizations where person_id=? and coalesce(data_status,'active')='active'").get(personId).count),
        training: Number(db.prepare("select count(*) as count from personnel_training_records where person_id=? and coalesce(data_status,'active')='active'").get(personId).count)
      } : { license: 0, authorization: 0, training: 0 };
      const authorizationCategoryCounts = canReadQualifications
        ? Object.assign({ release: 0, test_run: 0, maintenance: 0, special: 0, third_party: 0, other: 0 }, Object.fromEntries(db.prepare(`select c.project_category as category,count(*) as count
          from personnel_authorizations a join capability_catalog c on c.project_code=a.project_code
          where a.person_id=? and coalesce(a.data_status,'active')='active' and c.project_category in ('release','test_run','maintenance','special','third_party','other')
          group by c.project_category`).all(personId).map(row => [row.category, Number(row.count)])))
        : undefined;
      return send(res, 200, { person, qualificationCounts, qualificationVisible: canReadQualifications, ...(canReadQualifications ? { authorizationCategoryCounts, englishLevels } : {}) });
    }
    if (personnelDetailRoute && method === "PUT" && !["imports", "dictionaries"].includes(routeParam(personnelDetailRoute[1]))) {
      const manager = requireLogin(req, res);
      if (!manager) return;
      const personId = routeParam(personnelDetailRoute[1]);
      const person = personnelAccess.requirePerson(manager,"personnel",personId,true);
      const payload = await bodyJson(req);
      updatePersonnel(person, payload, manager);
      return send(res, 200, { person: publicPersonnelList().find(item => item.id === personId) });
    }
    const personnelChangesRoute = url.pathname.match(/^\/api\/personnel\/([^/]+)\/changes$/);
    if (personnelChangesRoute && method === "GET") {
      const manager = requireRbacPermission(req, res, "personnel.audit.view");
      if (!manager) return;
      const personId = routeParam(personnelChangesRoute[1]);
      personnelAccess.requirePerson(manager,"personnel",personId);
      const changes = db.prepare(`select id,field_name as fieldName,field_label as fieldLabel,old_value as oldValue,new_value as newValue,
        source_type as sourceType,source_batch_id as sourceBatchId,reason,operator_id as operatorId,operator_name as operatorName,created_at as createdAt
        from personnel_change_logs where person_id=? order by created_at desc limit 200`).all(personId);
      const visibleChanges = changes
        .filter(row => hasRbac(manager,"personnel.qualification.view") || !/^(license|authorization|training)\./.test(row.fieldName))
        .map(row => SENSITIVE_FIELDS.includes(row.fieldName) && !personnelAccess.canViewActualGrade(manager, personId)
          ? { ...row, oldValue:"***", newValue:"***", masked:true }
          : { ...row, masked:false });
      return send(res, 200, { changes: visibleChanges });
    }
    const qualificationListRoute = url.pathname.match(/^\/api\/personnel\/([^/]+)\/qualifications$/);
    if (qualificationListRoute && method === "GET") {
      const manager = requireRbacPermission(req, res, "personnel.qualification.view");
      if (!manager) return;
      const personId = routeParam(qualificationListRoute[1]);
      personnelAccess.requirePerson(manager, "personnel", personId);
      const type = String(url.searchParams.get("type") || "authorization");
      if (!["license", "authorization", "training"].includes(type)) return send(res, 400, { error: "资质类型无效" });
      const positive = (value, fallback) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
      const pageSize = Math.min(100, positive(url.searchParams.get("pageSize"), 20));
      const requestedPage = positive(url.searchParams.get("page"), 1);
      const q = String(url.searchParams.get("q") || "").trim().toLowerCase().replace(/[!%_]/g, "!$&"), pattern = `%${q}%`;
      let where, args, select, order, facets = {};
      if (type === "authorization") {
        const category = String(url.searchParams.get("category") || "").trim(), status = String(url.searchParams.get("status") || "").trim();
        const validCategories = ["release", "test_run", "maintenance", "special", "third_party", "other"];
        if (category && !validCategories.includes(category)) return send(res, 400, { error: "授权项目分类无效" });
        where = "from personnel_authorizations a left join capability_catalog c on c.project_code=a.project_code where a.person_id=? and coalesce(a.data_status,'active')='active' and (lower(a.project_code) like ? escape '!' or lower(coalesce(c.project_name,a.project_name,'')) like ? escape '!' or lower(coalesce(a.authorization_type,'')) like ? escape '!' or lower(coalesce(a.authorization_unit,'')) like ? escape '!')";
        args = [personId, pattern, pattern, pattern, pattern];
        if (category) { where += " and c.project_category=?"; args.push(category); }
        if (status) { where += " and a.authorization_status=?"; args.push(status); }
        select = `select a.id,a.project_code as projectCode,case when c.status='active' and trim(c.project_name)<>'' then c.project_name else '待配置名称（' || a.project_code || '）' end as projectName,
          c.project_category as category,case c.project_category when 'release' then '放行' when 'test_run' then '试车' when 'maintenance' then '维修' when 'special' then '专项' when 'third_party' then '三方' when 'other' then '其他' else '待分类' end as categoryLabel,
          coalesce(c.third_party_company,'') as thirdPartyCompany,
          a.authorization_type as authorizationType,a.authorization_unit as authorizationUnit,a.authorized_at as authorizedAt,a.authorization_expires_at as authorizationExpiresAt,a.authorization_status as authorizationStatus`;
        order = " order by c.project_category,a.project_code,a.authorization_unit";
        facets = {
          categories: Object.fromEntries(db.prepare(`select c.project_category as category,count(*) as count ${where.replace(/ and c\.project_category=\?/, "").replace(/ and a\.authorization_status=\?/, "")} group by c.project_category`).all(...[personId, pattern, pattern, pattern, pattern]).map(row => [row.category || "", Number(row.count)])),
          statuses: db.prepare("select distinct authorization_status as value from personnel_authorizations where person_id=? and coalesce(data_status,'active')='active' and trim(coalesce(authorization_status,''))<>'' order by authorization_status").all(personId).map(row => row.value)
        };
      } else if (type === "license") {
        where = "from personnel_licenses where person_id=? and coalesce(data_status,'active')='active' and (lower(coalesce(license_no,'')) like ? escape '!' or lower(coalesce(license_type,'')) like ? escape '!')";
        args = [personId, pattern, pattern];
        select = "select id,license_no as licenseNo,license_type as licenseType,license_english_level as licenseEnglishLevel,issued_at as issuedAt,renewed_at as renewedAt,expires_at as expiresAt,is_valid as isValid,remark";
        order = " order by license_type,expires_at";
      } else {
        where = "from personnel_training_records where person_id=? and coalesce(data_status,'active')='active' and (lower(coalesce(course_code,'')) like ? escape '!' or lower(coalesce(course_name,'')) like ? escape '!')";
        args = [personId, pattern, pattern];
        select = "select id,course_code as courseCode,course_name as courseName,course_version as courseVersion,course_nature as courseNature,started_at as startedAt,completed_at as completedAt,training_result as trainingResult,attendance_status as attendanceStatus,qualification_status as qualificationStatus,class_no as classNo";
        order = " order by started_at desc,course_code";
      }
      const total = Number(db.prepare(`select count(*) as count ${where}`).get(...args).count), page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
      const items = db.prepare(`${select} ${where}${order} limit ? offset ?`).all(...args, pageSize, (page - 1) * pageSize);
      return send(res, 200, { items, total, page, pageSize, facets });
    }
    const qualificationRoute = url.pathname.match(/^\/api\/personnel\/([^/]+)\/qualifications\/(license|authorization|training)\/([^/]+)$/);
    if (qualificationRoute && ["PUT", "DELETE"].includes(method)) {
      const manager = requireRbacPermission(req, res, "personnel.qualification.manage");
      if (!manager) return;
      const personId = routeParam(qualificationRoute[1]), kind = qualificationRoute[2], recordId = routeParam(qualificationRoute[3]);
      const person = personnelAccess.requirePerson(manager,"personnel",personId,true);
      const payload = await bodyJson(req);
      changeQualification(person, kind, recordId, payload, manager, method === "DELETE");
      return send(res, 200, { ok: true });
    }
    if (method === "GET" && url.pathname === "/api/personnel/imports") {
      const manager = requireRbacPermission(req, res, "personnel.import.view");
      if (!manager) return;
      const rows = db.prepare("select id,import_type,import_type as importType,file_name as fileName,status,rows_json,summary_json as summaryJson,created_by,created_by_name as createdByName,created_at as createdAt from personnel_import_batches order by created_at desc,id desc").all();
      const context = importHistoryContext(db,personnelAccess,manager,rows,importEmployeeNo);
      const visible = rows.filter(row=>visibleImportBatch(row,manager,context));
      const page = Math.max(1,Number.parseInt(url.searchParams.get('page')||'1',10)||1);
      const pageSize = Math.max(1,Math.min(100,Number.parseInt(url.searchParams.get('pageSize')||'50',10)||50));
      const batches = visible.slice((page-1)*pageSize,page*pageSize).map(row => ({ id:row.id,importType:row.importType,fileName:row.fileName,status:row.status,createdAt:row.createdAt,createdByName:row.createdByName,summary: json(row.summaryJson, {}) }));
      const summary = visible.reduce((result,row)=>{result.pending += Number(row.status==='pending');result.errors += Number(json(row.summaryJson,{}).errors||0);return result;},{pending:0,errors:0});
      return send(res, 200, { batches,total:visible.length,page,pageSize,summary });
    }
    if (method === "POST" && url.pathname === "/api/personnel/imports") {
      const manager = requireRbacPermission(req, res, "personnel.import.execute");
      if (!manager) return;
      const payload = await bodyJson(req);
      const type = String(payload.type || "");
      if (!personnelImportTypes.has(type)) return send(res, 400, { error: "导入类别无效" });
      const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
      if (!rawRows.length) return send(res, 400, { error: "导入文件没有内容" });
      const rawHeaders = Array.isArray(rawRows[0]) ? rawRows[0].map(normalizedHeader) : Object.keys(rawRows[0] || {}).map(normalizedHeader);
      if(type==="authorization"){const unknown=rawHeaders.filter(h=>!AUTHORIZATION_HEADERS.includes(h));if(unknown.length)return send(res,400,{error:"授权模板不支持列："+unknown.join("、")});}
      const missingGroups = importRequiredHeaders(type).filter(group => !group.some(name => rawHeaders.includes(normalizedHeader(name))));
      if (missingGroups.length) return send(res, 400, { error: `缺少必填列：${missingGroups.map(group => group.join("/")).join("、")}` });
      const rows = tabularRowsToObjects(rawRows, payload.rowNumbers);
      if (!rows.length) return send(res, 400, { error: "文件只有表头，没有可导入的数据记录" });
      db.exec("begin immediate");
      try {
      if(db.kind==="postgres")db.exec("select pg_advisory_xact_lock(54002010,31)");
      validatePersonnelImportAccess(type,rows,manager);
      const analysis = analyzePersonnelImport(type, rows);
      const replacement=type==="authorization"?authorizationImport.preview(rows):undefined;
      const id = randomId("pimport");
      const fileHash = crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
      db.prepare("insert into personnel_import_batches(id,import_type,file_name,file_hash,status,rows_json,summary_json,created_by,created_by_name,confirmed_by,confirmed_at,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, type, String(payload.fileName || ""), fileHash, "pending", JSON.stringify(rows), JSON.stringify({ total: analysis.total, valid: analysis.valid, errors: analysis.errors, warnings: analysis.warnings, ...(replacement?{replacement}:{}) }), manager.id, manager.name, "", "", now(), now());
      insertImportIssues(id, analysis.issues);
      audit(manager, "stage_personnel_import", "personnelImport", id, JSON.stringify({ type, total: rows.length, errors: analysis.errors, warnings: analysis.warnings, ...(replacement?{replacement}:{}) }));
      db.exec("commit");
      return send(res, 201, { batch: { id, importType: type, fileName: String(payload.fileName || ""), status: "pending", summary: { total: analysis.total, valid: analysis.valid, errors: analysis.errors, warnings: analysis.warnings, ...(replacement?{replacement}:{}) }, issues: analysis.issues } });
      }catch(e){db.exec("rollback");throw e;}
    }
    const workspaceRoute=url.pathname.match(/^\/api\/personnel\/imports\/([^/]+)\/workspace$/);
    if(workspaceRoute && ["GET","POST"].includes(method)) {
      const manager=requireRbacPermission(req,res,method==="GET"?"personnel.import.view":"personnel.import.execute");if(!manager)return;
      const workspace=createImportWorkspace({db,permission:personnelAccess.permission,hasAll:user=>personnelAccess.hasAll(user,"personnel"),visible:visibleImportBatch,employeeNo:importEmployeeNo,findPerson:findImportedPerson,analyze:analyzePersonnelImport,validateAccess:validatePersonnelImportAccess,preview:authorizationImport.preview,projects:authorizationProjects,audit,now,insertIssues:insertImportIssues});
      const id=routeParam(workspaceRoute[1]);
      return send(res,200,{workspace:method==="GET"?workspace.view(id,manager):workspace.mutate(id,await bodyJson(req),manager)});
    }
    const personnelImportRoute = url.pathname.match(/^\/api\/personnel\/imports\/([^/]+)$/);
    if (personnelImportRoute && method === "GET") {
      const manager = requireRbacPermission(req, res, "personnel.import.view");
      if (!manager) return;
      const id = routeParam(personnelImportRoute[1]);
      const batch = db.prepare("select * from personnel_import_batches where id=?").get(id);
      if (!batch || !visibleImportBatch(batch,manager)) return send(res, 404, { error: "未找到导入批次" });
      const issues = db.prepare("select id,row_number as rowNumber,issue_type as issueType,severity,employee_no as employeeNo,detail,status,resolution from personnel_import_issues where batch_id=? order by row_number,id").all(id);
      return send(res, 200, { batch: { id: batch.id, importType: batch.import_type, fileName: batch.file_name, status: batch.status, summary: json(batch.summary_json, {}), issues, createdAt: batch.created_at, confirmedAt: batch.confirmed_at } });
    }
    const personnelImportActionRoute = url.pathname.match(/^\/api\/personnel\/imports\/([^/]+)\/(confirm|cancel)$/);
    if (personnelImportActionRoute && method === "POST") {
      const manager = requireRbacPermission(req, res, "personnel.import.execute");
      if (!manager) return;
      const id = routeParam(personnelImportActionRoute[1]);
      const action = personnelImportActionRoute[2];
      const batch = db.prepare("select * from personnel_import_batches where id=?").get(id);
      if (!batch || !visibleImportBatch(batch,manager)) return send(res, 404, { error: "未找到导入批次" });
      if (action === "cancel") {
        if(batch.created_by!==manager.id && !personnelAccess.hasAll(manager,"personnel"))return send(res,403,{error:"只能取消本人创建的批次"});
        if (batch.status !== "pending") return send(res, 409, { error: "当前批次不能取消" });
        db.prepare("update personnel_import_batches set status='cancelled',updated_at=? where id=?").run(now(), id);
        audit(manager, "cancel_personnel_import", "personnelImport", id, batch.import_type);
        return send(res, 200, { ok: true });
      }
      const result = confirmPersonnelImport(batch, manager, await bodyJson(req));
      let capabilitySync = "ready", capabilitySyncMessage = "";
      try { capabilityService.syncMaster(); }
      catch (error) { capabilitySync = "pending"; capabilitySyncMessage = error.message; console.error("人员主数据已提交，能力数据待刷新", error.message); }
      return send(res, 200, { ok: true, result, personnel: batch.import_type === "personnel" ? publicPersonnelList() : undefined, capabilitySync, capabilitySyncMessage, masterDataVersion: capabilityService.masterRevision(), capabilityVersion: capabilityService.revision() });
    }

    if (method === "GET" && url.pathname === "/api/admin/rbac") {
      const manager = requireRbacPermission(req, res, "roles.read");
      if (!manager) return;
      const permissions = db.prepare("select code,name,module from rbac_permissions order by module,code").all();
      const rolesOut = db.prepare("select * from rbac_roles where status='active' order by system_role desc,name,code").all().map(publicRbacRole);
      return send(res, 200, { roles: rolesOut, permissions });
    }
    if (method === "POST" && url.pathname === "/api/admin/roles") {
      const manager = requireRbacPermission(req, res, "roles.manage");
      if (!manager) return;
      const payload = validatedRolePayload(await bodyJson(req));
      const roleId = randomId("role");
      const code = `custom_${crypto.randomBytes(8).toString("hex")}`;
      db.exec("begin immediate");
      try {
        db.prepare("insert into rbac_roles(id,code,name,description,system_role,status,created_at,updated_at) values(?,?,?,?,0,'active',?,?)")
          .run(roleId, code, payload.name, payload.description, now(), now());
        replaceRolePermissions(roleId, payload.permissionRows);
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      audit(manager, "create_role", "role", roleId, JSON.stringify({ name: payload.name, permissions: payload.permissionRows.map(item => item.code) }));
      return send(res, 201, { role: publicRbacRole(db.prepare("select * from rbac_roles where id=?").get(roleId)) });
    }
    const roleManageRoute = url.pathname.match(/^\/api\/admin\/roles\/([^/]+)$/);
    if (roleManageRoute && method === "PUT") {
      const manager = requireRbacPermission(req, res, "roles.manage");
      if (!manager) return;
      const roleId = routeParam(roleManageRoute[1]);
      const existing = db.prepare("select * from rbac_roles where id=? and status='active'").get(roleId);
      if (!existing) return send(res, 404, { error: "未找到角色" });
      if (existing.code === "system_admin") return send(res, 403, { error: "系统管理员角色必须保持全部权限，不允许修改" });
      if (existing.system_role && manager.id !== SUPER_ACCOUNT_ID) return send(res, 403, { error: "只有超级管理员54002010可以调整系统预置角色" });
      const payload = validatedRolePayload(await bodyJson(req), roleId);
      const before = publicRbacRole(existing);
      db.exec("begin immediate");
      try {
        db.prepare("update rbac_roles set name=?,description=?,updated_at=? where id=?").run(payload.name, payload.description, now(), roleId);
        replaceRolePermissions(roleId, payload.permissionRows);
        if (existing.system_role) setSetting(`rbacRoleControlledEdit:${existing.code}`, true);
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      const affectedUserIds = revokeRoleUserSessions(roleId);
      audit(manager, existing.system_role ? "controlled_update_system_role" : "update_role", "role", roleId, JSON.stringify({ before: { name: before.name, description: before.description, permissions: before.permissions }, after: { name: payload.name, description: payload.description, permissions: payload.permissionRows.map(item => item.code) }, affectedUserIds }));
      return send(res, 200, { role: publicRbacRole(db.prepare("select * from rbac_roles where id=?").get(roleId)), sessionRevoked: affectedUserIds.includes(manager.id) && manager.id !== SUPER_ACCOUNT_ID });
    }
    if (roleManageRoute && method === "DELETE") {
      const manager = requireRbacPermission(req, res, "roles.manage");
      if (!manager) return;
      const roleId = routeParam(roleManageRoute[1]);
      const existing = db.prepare("select * from rbac_roles where id=? and status='active'").get(roleId);
      if (!existing) return send(res, 404, { error: "未找到角色" });
      if (existing.system_role) {
        audit(manager, "reject_delete_system_role", "role", roleId, existing.name);
        return send(res, 400, { error: "系统预置角色不可删除" });
      }
      const assignedUserCount = Number(db.prepare("select count(*) as count from rbac_user_roles where role_id=?").get(roleId)?.count || 0);
      if (assignedUserCount) {
        audit(manager, "reject_delete_assigned_role", "role", roleId, JSON.stringify({ name: existing.name, assignedUserCount }));
        return send(res, 409, { error: `该角色仍有 ${assignedUserCount} 个账户使用，请先调整账户角色`, assignedUserCount });
      }
      db.exec("begin immediate");
      try {
        db.prepare("delete from rbac_role_permissions where role_id=?").run(roleId);
        db.prepare("delete from rbac_roles where id=?").run(roleId);
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      audit(manager, "delete_role", "role", roleId, existing.name);
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/admin/users" || url.pathname.startsWith("/api/admin/users/")) {
      return send(res, 410, { error: "旧账户接口已移除，请使用纯 RBAC 账户接口" });
    }
    const user = currentUser(req);
    if(user.id && url.pathname.startsWith("/api/maintenance/")){
      let flightId=url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)/)?.[1];
      const subtaskId=url.pathname.match(/^\/api\/maintenance\/subtasks\/([^/]+)/)?.[1];
      const assignmentId=url.pathname.match(/^\/api\/maintenance\/assignments\/([^/]+)/)?.[1];
      if(subtaskId)flightId=db.prepare("select flight_id from maintenance_subtasks where id=?").get(routeParam(subtaskId))?.flight_id;
      if(assignmentId)flightId=db.prepare("select flight_id from maintenance_assignments where id=?").get(routeParam(assignmentId))?.flight_id;
      if(flightId && !["import","export"].includes(flightId)){
        flightId=routeParam(flightId);
        const flight=db.prepare("select * from maintenance_flights where id=?").get(flightId);
        if(flight){
          const assigned=db.prepare("select person_id from maintenance_assignments where flight_id=?").all(flightId);
          const own=assigned.some(a=>a.person_id===user.personId);
          const isDispatchRequest=method==="POST" && /^\/api\/maintenance\/(?:flights|subtasks)\/[^/]+\/dispatch$/.test(url.pathname);
          let staleSharedDispatch=false;
          if(isDispatchRequest && hasRbac(user,"maintenance.assignment.manage") && maintenanceSharesCreatorDepartment(user,flight.created_by)){
            const expectedUpdatedAt=String((await bodyJson(req)).expectedUpdatedAt||"");
            staleSharedDispatch=!!expectedUpdatedAt && expectedUpdatedAt!==flight.updated_at;
          }
          const sharedUnassigned=maintenanceSharedUnassignedRouteAllowed(user,flight,method,url);
          if(!personnelAccess.hasAll(user,"maintenance") && !own && flight.created_by!==user.id && !assigned.some(a=>personnelAccess.allows(user,"maintenance",a.person_id)) && !dataScopeAllowsUser(user,flight.created_by,"maintenance") && !sharedUnassigned && !staleSharedDispatch)return send(res,404,{error:"未找到维修机会"});
          if(!["GET","OPTIONS"].includes(method) && /(?:dispatch|review|archive)|^DELETE$/.test(url.pathname+" "+method) && assigned.some(a=>!personnelAccess.allows(user,"maintenance",a.person_id)) && !staleSharedDispatch)return send(res,403,{error:"任务包含维修管理范围外人员，不能修改"});
        }
      }
    }
    if (method === "GET" && url.pathname === "/api/maintenance/version") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      return send(res, 200, { version: maintenanceSyncVersion() });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/events") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      });
      res.write(`retry: 3000\nevent: maintenance\ndata: ${JSON.stringify({ type: "maintenance.connected", version: maintenanceSyncVersion() })}\n\n`);
      maintenanceEventClients.add(res);
      const heartbeat = setInterval(() => { try { res.write(": keepalive\n\n"); } catch {} }, 25000);
      req.on("close", () => { clearInterval(heartbeat); maintenanceEventClients.delete(res); });
      return;
    }
    if (url.pathname === "/api/maintenance/locations" && method === "GET") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      return send(res, 200, { locations: maintenanceWorkLocations(), defaultLocationId: defaultMaintenanceLocationId });
    }
    if (url.pathname === "/api/maintenance/locations" && method === "POST") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.rules.manage")) return send(res, 403, { error: "当前账号没有地点目录维护权限" });
      const input = await bodyJson(req);
      const name = String(input.name || "").trim();
      if (!name || name.length > 80) return send(res, 400, { error: "地点名称需为1至80字" });
      if (db.prepare("select id from maintenance_work_locations where name=?").get(name)) return send(res, 409, { error: "地点名称已存在" });
      const id = randomId("mloc");
      db.prepare("insert into maintenance_work_locations(id,name,status,created_at,updated_at) values(?,?,'active',?,?)").run(id, name, now(), now());
      audit(manager, "maintenance_location_create", "maintenance_location", id, name);
      return send(res, 201, { locations: maintenanceWorkLocations() });
    }
    const maintenanceLocationRoute = url.pathname.match(/^\/api\/maintenance\/locations\/([^/]+)$/);
    if (maintenanceLocationRoute && ["PUT", "DELETE"].includes(method)) {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.rules.manage")) return send(res, 403, { error: "当前账号没有地点目录维护权限" });
      const id = routeParam(maintenanceLocationRoute[1]);
      const existing = db.prepare("select * from maintenance_work_locations where id=?").get(id);
      if (!existing) return send(res, 404, { error: "未找到作业地点" });
      const references = db.prepare("select count(*) as count from maintenance_flights where location_id=?").get(id).count;
      if (method === "DELETE") {
        if (references) return send(res, 409, { error: `已有${references}条维修机会使用该地点，请先停用` });
        db.prepare("delete from maintenance_work_locations where id=?").run(id);
        audit(manager, "maintenance_location_delete", "maintenance_location", id, existing.name);
        return send(res, 200, { locations: maintenanceWorkLocations() });
      }
      const input = await bodyJson(req);
      const name = String(input.name ?? existing.name).trim();
      const status = String(input.status ?? existing.status);
      const reason = String(input.reason || "").trim();
      if (!name || name.length > 80 || !["active", "inactive"].includes(status)) return send(res, 400, { error: "地点名称或状态无效" });
      if ((name !== existing.name || status !== existing.status) && !reason) return send(res, 400, { error: "请填写变更原因" });
      if (db.prepare("select id from maintenance_work_locations where name=? and id<>?").get(name, id)) return send(res, 409, { error: "地点名称已存在" });
      db.prepare("update maintenance_work_locations set name=?,status=?,updated_at=? where id=?").run(name, status, now(), id);
      audit(manager, "maintenance_location_update", "maintenance_location", id, JSON.stringify({ before: existing.name, after: name, status, reason }));
      return send(res, 200, { locations: maintenanceWorkLocations() });
    }
    const maintenanceLocationCorrection = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/location$/);
    if (maintenanceLocationCorrection && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.archive.modify")) return send(res, 403, { error: "当前账号没有历史地点修正权限" });
      const id = routeParam(maintenanceLocationCorrection[1]);
      const input = await bodyJson(req);
      const reason = String(input.reason || "").trim();
      if (!reason) return send(res, 400, { error: "请填写地点修正原因" });
      const existing = db.prepare("select * from maintenance_flights where id=?").get(id);
      if (!existing) return send(res, 404, { error: "未找到维修机会" });
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有维修管理权限" });
      if (!maintenanceVisibleFlights(manager, "dispatch", { flightId: id, limit: 1 }).rows.length) return send(res, 403, { error: "该维修机会不在当前维修管控范围内" });
      const location = maintenanceLocationForInput({ locationId: input.locationId || input.locationName });
      maintenanceTransaction(() => {
        db.prepare("update maintenance_flights set location_id=?,location_name_snapshot=?,updated_by=?,updated_at=? where id=?").run(location.id, location.name, manager.id, now(), id);
        audit(manager, "maintenance_location_correction", "maintenance_flight", id, JSON.stringify({ oldLocationId: existing.location_id || "", newLocationId: location.id, reason }));
      });
      bumpMaintenanceVersion(id, "maintenance.location.corrected");
      return send(res, 200, { flight: publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(id)) });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/flights") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      const scope = url.searchParams.get("scope") || "dispatch";
      const opportunities = url.searchParams.getAll("opportunity").flatMap(value => value.split(",")).map(value => value.trim()).filter(Boolean);
      const locationIds = url.searchParams.getAll("locationId").flatMap(value => value.split(",")).map(value => value.trim()).filter(Boolean);
      const requestedLimit = Number(url.searchParams.get("limit"));
      const result = maintenanceVisibleFlights(login, scope, {
        dateFrom: url.searchParams.get("dateFrom") || "",
        dateTo: url.searchParams.get("dateTo") || "",
        opportunities,
        locationIds,
        search: String(url.searchParams.get("search") || "").trim(),
        limit: Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined,
        cursor: Number(url.searchParams.get("cursor") || 0)
      });
      const flights = url.searchParams.get("view") === "summary"
        ? publicMaintenanceBatch(result.rows, scope, login)
        : result.rows.map(row => scope === "execute" ? publicMaintenanceFlightForExecution(row, login) : publicMaintenanceFlight(row)).filter(Boolean);
      return send(res, 200, { flights, nextCursor: result.nextCursor, version: maintenanceSyncVersion() });
    }
    const maintenanceReportDraftRoute = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/reports\/(routine|nonroutine)\/draft$/);
    if (maintenanceReportDraftRoute && method === "DELETE") {
      const executor = requireLogin(req, res);
      if (!executor) return;
      if (!maintenanceCanExecute(executor, true) || !hasRbac(executor, "maintenance.nonroutine.delete.own")) return send(res, 403, { error: "当前账号没有删除本人非例行草稿的权限" });
      const flightId = routeParam(maintenanceReportDraftRoute[1]);
      const reportType = maintenanceReportDraftRoute[2];
      if (reportType !== "nonroutine") return send(res, 405, { error: "当前草稿不支持删除" });
      const payload = await bodyJson(req);
      const deleted = deleteMaintenanceNonroutineDraft(flightId, payload, executor);
      if (deleted) bumpMaintenanceVersion(flightId, "maintenance.nonroutine.draft.deleted");
      return send(res, 200, { ok: true, deleted });
    }
    if (maintenanceReportDraftRoute && method === "PUT") {
      const executor = requireLogin(req, res);
      if (!executor) return;
      if (!maintenanceCanExecute(executor, true)) return send(res, 403, { error: "当前账号没有提交维修报工的权限" });
      const flightId = routeParam(maintenanceReportDraftRoute[1]);
      const reportType = maintenanceReportDraftRoute[2];
      const payload = await bodyJson(req);
      const result = reportType === "routine"
        ? saveMaintenanceRoutineDraft(flightId, payload, executor)
        : saveMaintenanceNonroutineDraft(flightId, payload, executor);
      bumpMaintenanceVersion(flightId, `maintenance.${reportType}.draft.saved`);
      return send(res, 200, reportType === "routine" ? result : { draft: result });
    }
    const maintenanceReportsRoute = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/reports(?:\/(release|routine|nonroutine))?$/);
    if (maintenanceReportsRoute && method === "GET" && !maintenanceReportsRoute[2]) {
      const executor = requireLogin(req, res);
      if (!executor) return;
      if (!maintenanceCanExecute(executor)) return send(res, 403, { error: "当前账号没有查看本人维修任务的权限" });
      const report = maintenanceReportsView(routeParam(maintenanceReportsRoute[1]), executor);
      if (!report) return send(res, 404, { error: "未找到维修机会" });
      return send(res, 200, { report });
    }
    if (maintenanceReportsRoute && method === "PUT" && maintenanceReportsRoute[2]) {
      const executor = requireLogin(req, res);
      if (!executor) return;
      if (!maintenanceCanExecute(executor, true)) return send(res, 403, { error: "当前账号没有提交维修报工的权限" });
      const flightId = routeParam(maintenanceReportsRoute[1]);
      const payload = await bodyJson(req);
      const type = maintenanceReportsRoute[2];
      const saveOnly = type === "nonroutine" && payload?.mode === "save";
      const flight = type === "release" ? submitMaintenanceRelease(flightId, payload, executor)
        : type === "routine" ? submitMaintenanceRoutine(flightId, payload, executor)
          : saveOnly ? saveMaintenanceNonroutine(flightId, payload, executor)
            : submitMaintenanceNonroutine(flightId, payload, executor);
      bumpMaintenanceVersion(flightId, saveOnly ? "maintenance.nonroutine.saved" : `maintenance.${type}.submitted`);
      return send(res, 200, { flight, report: maintenanceReportsView(flightId, executor) });
    }
    const maintenanceFinalizeRoute = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/report-confirmation$/);
    if (maintenanceFinalizeRoute && method === "POST") {
      const executor = requireLogin(req, res);
      if (!executor) return;
      const flightId = routeParam(maintenanceFinalizeRoute[1]);
      const payload = await bodyJson(req);
      const saveOnly = payload?.mode === "save";
      const flight = saveOnly
        ? saveMaintenanceReportConfirmation(flightId, payload, executor, { finalize: false })
        : finalizeMaintenanceReports(flightId, payload, executor);
      bumpMaintenanceVersion(flightId, saveOnly ? "maintenance.report.confirmation.saved" : "maintenance.report.finalized");
      return send(res, 200, { flight });
    }
    if (method === "POST" && ['/api/maintenance/dispatch-import/preview','/api/maintenance/dispatch-import/commit'].includes(url.pathname)) {
      const manager = requireLogin(req,res);
      if (!manager) return;
      if (!hasRbac(manager,'maintenance.assignment.manage') || !hasRbac(manager,'maintenance.dispatch.view')) return send(res,403,{error:'当前账号没有派工导入权限'});
      const payload = await bodyJson(req), rows = payload.rows;
      if (!Array.isArray(rows) || !rows.length || rows.length>1000) return send(res,400,{error:'每批须包含1～1000条派工记录'});
      const commit = url.pathname.endsWith('/commit');
      if (commit && !/^[a-zA-Z0-9_-]{8,100}$/.test(payload.requestId || '')) return send(res,400,{error:'缺少有效导入请求编号'});
      const digest = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
      const ledgerKey = `dispatch_import:${manager.id}:${payload.requestId}`;
      const identities = rows.map(raw => { try { return dispatchImportIdentity(raw); } catch { return null; } });
      const counts = new Map();
      identities.filter(Boolean).forEach(item=>counts.set(item.key,(counts.get(item.key)||0)+1));
      const results = [];
      for (let index=0;index<rows.length;index++) {
        try {
          const processRow = ()=> {
            const saved = commit ? json(db.prepare('select value from settings where key=?').get(ledgerKey)?.value,null) : null;
            if (saved && saved.digest!==digest) throw new Error('请求编号已用于不同文件，请重新上传');
            if (saved?.results?.[index]) {
              const result=saved.results[index], visible=new Set(allPeople('maintenance').map(p=>p.id));
              if(result.assignments.some(a=>!visible.has(a.personId))) throw new Error('原导入人员已不在当前维修范围内');
              return result;
            }
            const raw = rows[index], identity = dispatchImportIdentity(raw);
            if (counts.get(identity.key)>1) throw new Error('同一文件重复包含该维修机会，请合并为一行');
            const candidates = maintenanceVisibleFlights(manager,'dispatch',{dateFrom:identity.date,dateTo:identity.date}).rows.filter(f=>
              (f.work_kind||f.work_type)===identity.workKind && (!identity.arrival || String(f.flight_no||'').trim().toUpperCase()===identity.arrival) && (!identity.departure || String(f.departure_flight_no||'').trim().toUpperCase()===identity.departure));
            if (candidates.length!==1) throw new Error(candidates.length ? '匹配到多个维修机会，不能自动选择' : '未找到可派工的维修机会');
            const flight=candidates[0];
            if (flight.status!=='未派工') throw new Error('仅允许导入未派工维修机会');
            assertMaintenanceTreeDirectEditAllowed(flight.id);
            if (db.prepare('select id from maintenance_assignments where flight_id=?').get(flight.id) || db.prepare('select id from maintenance_report_batches where flight_id=?').get(flight.id)) throw new Error('维修机会已有派工或报工内容，请人工检查');
            const assignments=dispatchImportAssignments(raw,allPeople('maintenance'));
            normalizeMaintenanceAssignments('flight',flight,assignments);
            if (commit && (raw.matchedFlightId!==flight.id || raw.expectedUpdatedAt!==flight.updated_at)) throw new Error('维修机会已更新，请重新校验');
            const result={rowNumber:raw.rowNumber || index+2,ok:true,flightId:flight.id,expectedUpdatedAt:flight.updated_at,aircraftNo:flight.aircraft_no,date:flight.date,workKind:identity.workKind,assignments};
            if (commit) {
              setMaintenanceAssignments('flight',flight.id,assignments,manager,flight.updated_at,true);
              const status=db.prepare('select status from maintenance_flights where id=?').get(flight.id)?.status;
              if(status!=='已派工') throw new Error('状态无法变为已派工，本条已回滚，请人工检查');
              maintenanceLog(manager,'dispatch_import','flight',flight.id,flight.id,JSON.stringify({requestId:payload.requestId,rowNumber:result.rowNumber}));
              const record=saved||{digest,results:{}};
              record.results[index]=result;
              setSetting(ledgerKey,record);
            }
            return result;
          };
          const result = commit ? maintenanceTransaction(processRow) : processRow();
          results.push(result);
        } catch(error) { results.push({rowNumber:rows[index]?.rowNumber || index+2,ok:false,error:error.message}); }
      }
      if(commit && results.some(item=>item.ok)) bumpMaintenanceVersion('','maintenance.dispatch.imported');
      return send(res,200,{results,success:results.filter(item=>item.ok).length,failed:results.filter(item=>!item.ok).length});
    }
    if (method === "POST" && url.pathname === "/api/maintenance/subtasks/import") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.opportunity.import")) return send(res, 403, { error: "当前账号没有导入维修机会权限" });
      const payload = await bodyJson(req);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      if (!rows.length) return send(res, 400, { error: "未识别到有效附加工作，请检查表格内容" });
      const prepare = () => {
      const prepared=[], errors=[], seen=new Map();
      for (const [index,raw] of rows.entries()) {
        const rowNumber = Number.isInteger(raw?.rowNumber) && raw.rowNumber>0 ? raw.rowNumber : index + 2;
        try {
        const date = normalizeMaintenanceStatsDate(raw?.date ?? raw?.["日期"]);
        const flightNo = String(raw?.flightNo ?? raw?.flight_no ?? raw?.["进港航班号"] ?? raw?.["航班号"] ?? "").trim();
        const departureFlightNo = String(raw?.departureFlightNo ?? raw?.departure_flight_no ?? raw?.["出港航班号"] ?? "").trim();
        const aircraftNo = String(raw?.aircraftNo ?? raw?.aircraft_no ?? raw?.["机号"] ?? "").trim();
        const workKind = String(raw?.workKind ?? raw?.work_kind ?? raw?.["维修机会"] ?? "").trim();
        const location = maintenanceLocationForInput(raw);
        const chapter = String(raw?.chapter ?? raw?.["章节"] ?? "").trim();
        const category = String(raw?.category ?? raw?.["非例行类别"] ?? raw?.["类别"] ?? raw?.["工作类别"] ?? "").trim();
        const title = String(raw?.title ?? raw?.cardName ?? raw?.card_name ?? raw?.["工作标题"] ?? raw?.["工卡名称"] ?? "").trim();
        const standardHours = Number(raw?.standardHours ?? raw?.standard_hours ?? raw?.["标准工时"]);
        const priority = String(raw?.priority ?? raw?.["优先级"] ?? "普通").trim() || "普通";
        const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
        if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) throw maintenanceReviewError(`第 ${rowNumber} 行日期无效`);
        const identityError = maintenanceFlightValidationError({ date, flightNo, departureFlightNo, aircraftNo, workKind });
        if (identityError) throw maintenanceReviewError(`第 ${rowNumber} 行${identityError}`);
        if (!aircraftNo) throw maintenanceReviewError(`第 ${rowNumber} 行缺少机号`);
        if (!maintenanceOpportunityCategories.includes(workKind)) throw maintenanceReviewError(`第 ${rowNumber} 行维修机会无效`);
        if (!chapter) throw maintenanceReviewError(`第 ${rowNumber} 行缺少章节`);
        if (!title) throw maintenanceReviewError(`第 ${rowNumber} 行缺少工作标题`);
        if (!maintenanceNonroutineCategories.includes(category)) throw maintenanceReviewError(`第 ${rowNumber} 行非例行类别无效`);
        if (!Number.isFinite(standardHours) || !(standardHours > 0) || Math.abs(standardHours * 10 - Math.round(standardHours * 10)) > 1e-8) {
          throw maintenanceReviewError(`第 ${rowNumber} 行标准工时必须大于0且以0.1小时为单位`);
        }
        if (!["普通", "重要", "紧急"].includes(priority)) throw maintenanceReviewError(`第 ${rowNumber} 行优先级无效`);
        const useDeparture = ["航前", "三方航前"].includes(workKind) || !flightNo && !!departureFlightNo;
        const primaryNo = useDeparture ? departureFlightNo : flightNo;
        const numberColumn = useDeparture ? "departure_flight_no" : "flight_no";
        const matches = db.prepare(`select * from maintenance_flights
          where date=? and lower(trim(aircraft_no))=? and work_kind=? and location_id=?
            and (?='' or lower(trim(${numberColumn}))=?)`)
          .all(date, aircraftNo.toLowerCase(), workKind, location.id, primaryNo, primaryNo.toLowerCase());
        if (!matches.length) throw maintenanceReviewError(`第 ${rowNumber} 行未找到对应维修机会`);
        if (matches.length > 1) throw maintenanceReviewError(`第 ${rowNumber} 行匹配到多个维修机会，请先核对航班计划`);
        const flight = matches[0];
        if (!personnelAccess.hasAll(manager,'maintenance') && flight.created_by!==manager.id && !dataScopeAllowsUser(manager,flight.created_by,'maintenance') && !maintenanceVisibleFlights(manager,'dispatch',{flightId:flight.id,limit:1}).rows.length) {
          throw maintenanceReviewError(`第 ${rowNumber} 行维修机会不在当前维修管控范围内`,403);
        }
        if (flightNo && flight.flight_no && flightNo.toLowerCase() !== String(flight.flight_no).trim().toLowerCase()) {
          throw maintenanceReviewError(`第 ${rowNumber} 行进港航班号与维修机会不一致`);
        }
        if (departureFlightNo && flight.departure_flight_no && departureFlightNo.toLowerCase() !== String(flight.departure_flight_no).trim().toLowerCase()) {
          throw maintenanceReviewError(`第 ${rowNumber} 行出港航班号与维修机会不一致`);
        }
        if (!["未派工", "已派工"].includes(flight.status || "未派工") || flight.report_finalized_at || flight.archived_at) {
          throw maintenanceReviewError(`第 ${rowNumber} 行对应维修机会已进入报工或复核，不能导入附加工作`, 409);
        }
        const subtask = maintenanceSubtaskPayload({ ...raw, chapter, category, title, standardHours, priority, status: "未派工" });
        const key=JSON.stringify([flight.id,subtask.cardNo,subtask.title,subtask.category]);
        const existing=db.prepare('select standard_hours from maintenance_subtasks where flight_id=? and trim(card_no)=? and trim(title)=? and trim(category)=?').all(flight.id,subtask.cardNo,subtask.title,subtask.category);
        if(existing.some(item=>Math.abs(Number(item.standard_hours)-subtask.standardHours)>1e-8) || seen.has(key) && Math.abs(seen.get(key)-subtask.standardHours)>1e-8) {
          throw maintenanceReviewError(`第 ${rowNumber} 行重复项目的标准工时不一致，请人工核对，未覆盖已有任务`);
        }
        const skip=existing.length>0 || seen.has(key);
        seen.set(key,subtask.standardHours);
        prepared.push({ rowNumber, flight, subtask, skip });
        } catch(error) {errors.push({rowNumber,detail:error.message.replace(/^第 \d+ 行/,''),status:error.status||400});}
      }
      const summary={total:rows.length,matched:prepared.length,created:prepared.filter(item=>!item.skip).length,skipped:prepared.filter(item=>item.skip).length,abnormal:errors.length};
      return {prepared,errors,summary};
      };
      if (payload.validateOnly) {const checked=prepare();return send(res,200,{valid:!checked.errors.length,count:checked.prepared.length,summary:checked.summary,errors:checked.errors});}
      const result = maintenanceTransaction(() => {
        const {prepared,errors,summary}=prepare();
        if(errors.length)throw Object.assign(maintenanceReviewError('附加工作校验失败，未导入任何数据',errors[0].status),{details:{errors,summary}});
        const matchedFlightIds = [...new Set(prepared.map(item => item.flight.id))];
        const stamp = now();
        for (const item of prepared) {
          if(item.skip)continue;
          const id = randomId("mtns");
          const subtask = item.subtask;
          db.prepare(`insert into maintenance_subtasks(id,flight_id,external_work_no,card_no,title,content,category,standard_hours,priority,status,remark,created_by,updated_by,created_at,updated_at)
            values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(id, item.flight.id, "", subtask.cardNo, subtask.title, subtask.content, subtask.category, subtask.standardHours, subtask.priority, "未派工", subtask.remark, manager.id, manager.id, stamp, stamp);
          maintenanceLog(manager, "import_subtask", "subtask", id, item.flight.id, JSON.stringify({ chapter: subtask.cardNo, rowNumber: item.rowNumber }));
        }
        const auditId = audit(manager, "maintenance_subtask_import", "maintenance", "subtasks", JSON.stringify({ ...summary, matchedFlightIds }));
        return { auditId,summary,created:summary.created,skipped:summary.skipped,matchedFlights:matchedFlightIds.length };
      });
      if(result.created)bumpMaintenanceVersion("", "maintenance.subtasks.imported");
      return send(res, 200, result);
    }
    if (method === "POST" && url.pathname === "/api/maintenance/flights/import") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.opportunity.import")) return send(res, 403, { error: "当前账号没有导入维修机会权限" });
      const p = await bodyJson(req);
      const rows = Array.isArray(p.rows) ? p.rows : [];
      if (p.validateOnly) {
        const checked=prepareMaintenanceFlightImport(rows);
        return send(res,200,{valid:rows.length>0 && !checked.errors.length,summary:checked.summary,errors:checked.errors});
      }
      let created = 0;
      let subCreated = 0;
      let skipped = 0;
      const imported = new Map();
      let summary;
      maintenanceTransaction(() => {
      const checked=prepareMaintenanceFlightImport(rows);
      if(!rows.length || checked.errors.length)throw Object.assign(maintenanceReviewError('航班计划校验失败，未导入任何数据'),{details:{errors:checked.errors,summary:checked.summary}});
      summary=checked.summary;
      const importRows=checked.prepared;
      for (const { raw, payload } of importRows) {
        const primaryNo = ["航前", "三方航前"].includes(payload.workKind) ? payload.departureFlightNo : payload.flightNo || payload.departureFlightNo || "";
        const matchKey = [payload.date, payload.aircraftNo.toLowerCase(), payload.workKind, primaryNo.toLowerCase(), payload.location.id].join("|");
        let flight = imported.get(matchKey);
        if (!flight) {
          const numberColumn = ["航前", "三方航前"].includes(payload.workKind) || !payload.flightNo && payload.departureFlightNo ? "departure_flight_no" : "flight_no";
          const matches = db.prepare(`select * from maintenance_flights where date=? and lower(trim(aircraft_no))=? and work_kind=? and lower(trim(${numberColumn}))=? and location_id=?`).all(payload.date, payload.aircraftNo.toLowerCase(), payload.workKind, primaryNo.toLowerCase(), payload.location.id);
          if (matches.length > 1) throw maintenanceReviewError("匹配到多个维修机会，请先核对航班计划");
          const existing = matches[0];
          flight = existing ? publicMaintenanceFlight(existing) : insertMaintenanceFlight(payload, manager);
          if (!existing) created++;
          imported.set(matchKey, flight);
        }
        if (flight && !flight.departureFlightNo && payload.departureFlightNo) {
          const updated = db.prepare("update maintenance_flights set departure_flight_no=?,updated_by=?,updated_at=? where id=? and coalesce(departure_flight_no,'')=''")
            .run(payload.departureFlightNo, manager.id, now(), flight.id);
          if (updated.changes) flight.departureFlightNo = payload.departureFlightNo;
        }
        const subPayload = maintenanceSubtaskPayload(raw);
        if (subPayload.title || subPayload.cardNo || subPayload.content) {
          subPayload.title ||= subPayload.cardNo || `${payload.workKind}非例行`;
          insertMaintenanceSubtask(flight.id, subPayload, manager);
          subCreated++;
        }
      }
      audit(manager, "maintenance_import", "maintenance", "flights", `维修机会 ${created} 条，非例行 ${subCreated} 条`);
      });
      bumpMaintenanceVersion("", "maintenance.imported");
      return send(res, 200, { created, subCreated, skipped, summary });
    }
    if (method === "POST" && url.pathname === "/api/maintenance/flights") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.opportunity.create")) return send(res, 403, { error: "当前账号没有新建维修机会权限" });
      const payload = maintenanceFlightPayload(await bodyJson(req));
      const validationError = maintenanceFlightValidationError(payload);
      if (validationError) return send(res, 400, { error: validationError });
      const flight = insertMaintenanceFlight(payload, manager);
      bumpMaintenanceVersion(flight.id, "maintenance.flight.created");
      return send(res, 201, { flight });
    }
    const maintenanceRemark = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/remark$/);
    if (maintenanceRemark && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有编辑备注权限" });
      const flightId = routeParam(maintenanceRemark[1]);
      const payload = await bodyJson(req);
      if (typeof payload.remark !== "string" || typeof payload.originalRemark !== "string" || payload.remark.length > 2000) {
        return send(res, 400, { error: "备注必须为文本，且不超过2000字" });
      }
      const remark = payload.remark.trim();
      db.exec("begin immediate");
      try {
        const row = db.prepare("select * from maintenance_flights where id=?").get(flightId);
        if (!row) throw maintenanceReviewError("未找到维修机会", 404);
        if (row.archived_at || !["未派工", "已派工", "已提报"].includes(row.status)) throw maintenanceReviewError("当前状态不允许修改备注", 409);
        if ((row.remark || "") !== payload.originalRemark) throw maintenanceReviewError("备注已被其他人员修改，请关闭后重新打开并核对内容", 409);
        const updated = db.prepare("update maintenance_flights set remark=?,updated_by=?,updated_at=? where id=? and coalesce(remark,'')=? and status=? and coalesce(archived_at,'')=''").run(remark, manager.id, now(), flightId, payload.originalRemark, row.status);
        if (!updated.changes) throw maintenanceReviewError("维修机会已发生变化，请关闭后重新打开并核对内容", 409);
        audit(manager, "maintenance_update_remark", "maintenanceFlight", flightId, JSON.stringify({ before: row.remark || "", after: remark }));
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      bumpMaintenanceVersion(flightId, "maintenance.remark.updated");
      return send(res, 200, { remark });
    }
    const maintenanceReview = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/review$/);
    if (maintenanceReview && method === "GET") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.review.view")) return send(res, 403, { error: "当前账号没有查看维修复核权限" });
      const review = maintenanceReviewTree(routeParam(maintenanceReview[1]));
      if (!review) return send(res, 404, { error: "未找到航班任务" });
      return send(res, 200, { review });
    }
    if (maintenanceReview && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.review.submit")) return send(res, 403, { error: "当前账号没有提交维修复核权限" });
      const flightId = routeParam(maintenanceReview[1]);
      const review = saveMaintenanceReview(flightId, await bodyJson(req), manager);
      bumpMaintenanceVersion(flightId, "maintenance.review.saved");
      return send(res, 200, { review });
    }
    const maintenanceWorkReportRoute = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/work-report$/);
    if (maintenanceWorkReportRoute && ["GET", "PUT"].includes(method)) {
      const executor = requireLogin(req, res);
      if (!executor) return;
      return send(res, 410, { error: "旧版整合报工接口已停用，请刷新页面后使用例行或非例行报工" });
    }
    const maintenanceFlight = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)$/);
    if (maintenanceFlight && method === "GET") {
      const viewer = requireLogin(req, res);
      if (!viewer) return;
      if (!maintenanceHasAccess(viewer)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      const flightId = routeParam(maintenanceFlight[1]);
      const row = db.prepare("select * from maintenance_flights where id=?").get(flightId);
      if (!row) return send(res, 404, { error: "未找到航班任务" });
      const scope = url.searchParams.get("scope") || "dispatch";
      const full = scope === "execute" ? publicMaintenanceFlightForExecution(row, viewer) : publicMaintenanceFlight(row);
      if (!full || (!maintenanceCanManage(viewer) && !maintenanceTaskTreeAssignments(flightId).some(item => item.person_id === viewer.personId))) {
        return send(res, 403, { error: "无权查看该维修机会" });
      }
      return send(res, 200, { flight: full, version: maintenanceSyncVersion() });
    }
    if (maintenanceFlight && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.opportunity.update")) return send(res, 403, { error: "当前账号没有修改维修机会权限" });
      const flightId = routeParam(maintenanceFlight[1]);
      const existing = assertMaintenanceTreeDirectEditAllowed(flightId);
      if (!existing) return send(res, 404, { error: "未找到航班任务" });
      const payload = maintenanceFlightPayload(await bodyJson(req), existing);
      const validationError = maintenanceFlightValidationError({ ...payload, departureFlightNo: payload.departureFlightNo ?? existing.departure_flight_no });
      if (validationError) return send(res, 400, { error: validationError });
      if ((payload.workKind || payload.workType) !== (existing.work_kind || existing.work_type)) {
        invalidateMaintenanceReportCategory(flightId, "release", manager, "维修机会类别已修改");
        invalidateMaintenanceReportCategory(flightId, "routine", manager, "维修机会类别已修改");
      }
      const flight = updateMaintenanceFlight(flightId, payload, manager);
      if (!flight) return send(res, 404, { error: "未找到航班任务" });
      bumpMaintenanceVersion(flight.id, "maintenance.flight.updated");
      return send(res, 200, { flight });
    }
    if (maintenanceFlight && method === "DELETE") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.opportunity.delete")) return send(res, 403, { error: "当前账号没有删除维修机会权限" });
      const flightId = routeParam(maintenanceFlight[1]);
      const payload = await bodyJson(req);
      const deleted = deleteMaintenanceFlight(flightId, manager, payload?.reason);
      if (!deleted) return send(res, 404, { error: "未找到航班任务" });
      bumpMaintenanceVersion(flightId, "maintenance.flight.deleted");
      return send(res, 200, { ok: true });
    }
    const maintenanceSubtasks = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/subtasks$/);
    if (maintenanceSubtasks && method === "POST") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.content.manage")) return send(res, 403, { error: "当前账号没有维护工作内容权限" });
      const flightId = routeParam(maintenanceSubtasks[1]);
      const parent = assertMaintenanceTreeDirectEditAllowed(flightId);
      if (!parent) return send(res, 404, { error: "未找到航班任务" });
      const payload = maintenanceSubtaskPayload(await bodyJson(req));
      if (!payload.title) return send(res, 400, { error: "请填写非例行标题" });
      invalidateMaintenanceReportCategory(flightId, "nonroutine", manager, "新增非例行");
      db.prepare("delete from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").run(flightId);
      const flight = insertMaintenanceSubtask(flightId, payload, manager);
      if (!flight) return send(res, 404, { error: "未找到航班任务" });
      bumpMaintenanceVersion(flightId, "maintenance.nonroutine.created");
      return send(res, 201, { flight });
    }
    const maintenanceSubtask = url.pathname.match(/^\/api\/maintenance\/subtasks\/([^/]+)$/);
    if (maintenanceSubtask && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.content.manage")) return send(res, 403, { error: "当前账号没有维护工作内容权限" });
      const subtaskId = routeParam(maintenanceSubtask[1]);
      const existing = db.prepare("select * from maintenance_subtasks where id=?").get(subtaskId);
      if (!existing) return send(res, 404, { error: "未找到非例行" });
      assertMaintenanceTreeDirectEditAllowed(existing.flight_id);
      invalidateMaintenanceReportCategory(existing.flight_id, "nonroutine", manager, "修改非例行");
      const flight = updateMaintenanceSubtask(subtaskId, maintenanceSubtaskPayload(await bodyJson(req)), manager);
      if (!flight) return send(res, 404, { error: "未找到非例行" });
      bumpMaintenanceVersion(flight.id, "maintenance.nonroutine.updated");
      return send(res, 200, { flight });
    }
    if (maintenanceSubtask && method === "DELETE") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.content.manage")) return send(res, 403, { error: "当前账号没有维护工作内容权限" });
      const subtaskId = routeParam(maintenanceSubtask[1]);
      const row = db.prepare("select flight_id from maintenance_subtasks where id=?").get(subtaskId);
      if (!row) return send(res, 404, { error: "未找到非例行" });
      const payload = await bodyJson(req);
      const flight = deleteMaintenanceSubtask(subtaskId, manager, payload?.reason);
      bumpMaintenanceVersion(row.flight_id, "maintenance.nonroutine.deleted");
      return send(res, 200, { flight });
    }
    const maintenanceDispatch = url.pathname.match(/^\/api\/maintenance\/(flights|subtasks)\/([^/]+)\/dispatch$/);
    if (maintenanceDispatch && method === "POST") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.assignment.manage")) return send(res, 403, { error: "当前账号没有派工权限" });
      const p = await bodyJson(req);
      const ownerType = maintenanceDispatch[1] === "flights" ? "flight" : "subtask";
      const ownerId = routeParam(maintenanceDispatch[2]);
      const owner = maintenanceOwner(ownerType, ownerId);
      if (!owner) return send(res, 404, { error: "未找到任务" });
      assertMaintenanceTreeDirectEditAllowed(ownerType === "flight" ? owner.id : owner.flight_id);
      const flight = setMaintenanceAssignments(ownerType, ownerId, Array.isArray(p.assignments) ? p.assignments : [], manager, String(p.expectedUpdatedAt || ""));
      if (!flight) return send(res, 404, { error: "未找到任务" });
      const assigned = ownerType === "flight" ? flight.assignments : (flight.subtasks || []).find(item => item.id === ownerId)?.assignments || [];
      if (!assigned.length) return send(res, 400, { error: "请选择派工人员" });
      bumpMaintenanceVersion(flight.id, "maintenance.dispatched");
      return send(res, 200, { flight });
    }
    const maintenanceAssignmentAction = url.pathname.match(/^\/api\/maintenance\/assignments\/([^/]+)\/complete$/);
    if (maintenanceAssignmentAction && method === "POST") {
      const executor = requireLogin(req, res);
      if (!executor) return;
      if (!maintenanceCanExecute(executor, true)) return send(res, 403, { error: "当前账号没有提交维修报工的权限" });
      const assignmentId = routeParam(maintenanceAssignmentAction[1]);
      const assignment = db.prepare("select * from maintenance_assignments where id=?").get(assignmentId);
      if (!assignment) return send(res, 404, { error: "未找到派工任务" });
      if (assignment.person_id !== executor.personId && !personnelAccess.allows(executor, "maintenance", assignment.person_id)) return send(res, 403, { error: "只能反馈派给自己的任务" });
      if (assignment.owner_type !== "flight" || assignment.role !== "放行") return send(res, 409, { error: assignment.owner_type === "subtask" ? "非例行请使用汇总报工" : "例行工作请使用例行报工" });
      const flight = submitMaintenanceRelease(assignment.flight_id, await bodyJson(req), executor);
      bumpMaintenanceVersion(assignment.flight_id, "maintenance.release.submitted");
      return send(res, 200, { flight });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/nonroutine-options") {
      const actor = requireLogin(req, res);
      if (!actor) return;
      if (!hasRbac(actor,"maintenance.content.manage")) return send(res,403,{error:"当前账号没有维护工作内容权限"});
      return send(res,200,{towDefaultHours:maintenanceTowDefaultHours()});
    }
    if (method === "GET" && url.pathname === "/api/maintenance/rules") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!hasAnyRbac(login, ["maintenance.rules.view", "maintenance.rules.manage"])) return send(res, 403, { error: "当前账号没有查看工时规则的权限" });
      return send(res, 200, { rules: maintenanceRulesResponse(), aircraftHours: maintenanceAircraftConfig() });
    }
    if (method === "POST" && url.pathname === "/api/maintenance/rules/aircraft-preview") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.rules.manage")) return send(res, 403, { error: "当前账号没有工时规则维护权限" });
      const p = await bodyJson(req);
      const config = normalizeAircraftHours(p.aircraftHours, maintenanceOpportunityOrder);
      const affected = maintenanceAircraftImpact(config);
      const visible = new Set(maintenanceVisibleFlights(manager).rows.map(flight => flight.id));
      return send(res, 200, { affected: affected.filter(flight => visible.has(flight.id)), affectedCount: affected.length, confirmation: crypto.createHash("sha256").update(JSON.stringify(affected)).digest("hex") });
    }
    if (method === "PUT" && url.pathname === "/api/maintenance/rules") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.rules.manage")) return send(res, 403, { error: "当前账号没有工时规则维护权限" });
      const p = await bodyJson(req);
      const rows = Array.isArray(p.rules) ? p.rules : [];
      if (rows.some(row => String(row.rule_type || row.ruleType || "").trim() === "workType")) {
        throw maintenanceDispatchError("旧标准工时已停止维护，请使用机型组配置。未保存任何修改。");
      }
      const upsert = db.prepare("insert into maintenance_hour_rules(id,rule_type,name,value,created_at,updated_at) values(?,?,?,?,?,?) on conflict(rule_type,name) do update set value=excluded.value,updated_at=excluded.updated_at");
      const routineRows = rows.filter(row => String(row.rule_type || row.ruleType || "").trim() === "routineRatio");
      const combinationRows = rows.filter(row => String(row.rule_type || row.ruleType || "").trim() === "nonroutineCombinationRatio");
      validateMaintenanceRoutineRules(routineRows);
      if (combinationRows.length) validateMaintenanceNonroutineCombinationRules(combinationRows);
      maintenanceTransaction(() => {
        if (p.aircraftHours) {
          const previous = maintenanceAircraftConfig();
          if (Number(p.aircraftHours.version) !== previous.version) throw maintenanceReviewError("工时机型组已被修改，请刷新后重试", 409);
          const next = normalizeAircraftHours(p.aircraftHours, maintenanceOpportunityOrder);
          const reason = String(p.reason || "").trim();
          if (!reason || reason.length > 1000) throw maintenanceDispatchError("修改机型组须填写原因（最多1000字）");
          const affected = maintenanceAircraftImpact(next);
          const confirmation = crypto.createHash("sha256").update(JSON.stringify(affected)).digest("hex");
          if (affected.length && p.confirmation !== confirmation) throw maintenanceReviewError("受影响未报工航班已变化，请重新预览确认", 409);
          setSetting("maintenance_aircraft_hours_v1", { ...next, version: previous.version + 1 });
          audit(manager, "maintenance_aircraft_hours_update", "maintenance", "rules", JSON.stringify({ reason, before: previous, after: next, affected }));
        }
        for (const row of rows) {
          const ruleType = String(row.rule_type || row.ruleType || "").trim();
          let name = String(row.name || "").trim();
          if (!["roleRatio", "routineRatio", "nonroutineCategoryHours", "nonroutineCombinationRatio"].includes(ruleType)) continue;
          if (ruleType === "routineRatio") name = maintenanceRoutineRuleName(String(row.opportunity || "").trim(), String(row.role || "").trim());
          if (ruleType === "nonroutineCombinationRatio") name = `${String(row.combination || "").trim()}::${String(row.role || "").trim()}`;
          if (!name || (ruleType === "roleRatio" && name === "放行")) continue;
          const value = Number(row.value);
          if (!Number.isFinite(value) || value < 0) throw maintenanceDispatchError("工时和分配比例不能为负数");
          if (ruleType === "nonroutineCategoryHours" && (name !== "拖机" || value <= 0 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-8)) {
            throw maintenanceDispatchError("拖机默认总工时必须大于0且以0.1小时为单位");
          }
          upsert.run(row.id || randomId("mtnr"), ruleType, name, value, now(), now());
        }
      });
      audit(manager, "maintenance_update_rules", "maintenance", "rules", `${rows.length} 条`);
      bumpMaintenanceVersion("", "maintenance.rules.updated");
      return send(res, 200, { rules: maintenanceRulesResponse(), aircraftHours: maintenanceAircraftConfig() });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/stats") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!hasRbac(login, "maintenance.stats.manage.view")) return send(res, 403, { error: "当前账号没有管理范围维修统计权限" });
      return send(res, 200, maintenanceStats(Object.fromEntries(url.searchParams.entries()), login));
    }
    if (method === "GET" && url.pathname === "/api/maintenance/stats/personal") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!hasRbac(login, "maintenance.stats.self.view")) return send(res, 403, { error: "当前账号没有本人维修统计权限" });
      return send(res, 200, maintenancePersonalStats(Object.fromEntries(url.searchParams.entries()), login));
    }
    if (method === "GET" && url.pathname === "/api/maintenance/stats/personal/details") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!hasAnyRbac(login, ["maintenance.stats.self.view", "maintenance.stats.manage.view"])) return send(res, 403, { error: "当前账号没有维修统计权限" });
      return send(res, 200, maintenancePersonalDetails(Object.fromEntries(url.searchParams.entries()), login));
    }
    const nonroutineAuditMatch = url.pathname.match(/^\/api\/maintenance\/subtasks\/([^/]+)\/hour-audit$/);
    if (method === "GET" && nonroutineAuditMatch) {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login) && !maintenanceCanManage(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      const detail = maintenanceNonroutineAuditDetail(routeParam(nonroutineAuditMatch[1]), login);
      if (detail === null) return send(res, 404, { error: "未找到非例行工作" });
      if (detail === false) return send(res, 403, { error: "只能查看自己参与的非例行工作" });
      return send(res, 200, { detail });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/report") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceCanManage(login)) return send(res, 403, { error: "当前账号没有查看综合报表的权限" });
      return send(res, 200, maintenanceReport(Object.fromEntries(url.searchParams.entries()), login));
    }
    if (method === "GET" && url.pathname === "/api/maintenance/report/options") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceCanManage(login)) return send(res, 403, { error: "当前账号没有查看综合报表的权限" });
      return send(res, 200, maintenanceReportOptions(Object.fromEntries(url.searchParams.entries()), login));
    }
    const opportunityAuditMatch = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/report-detail$/);
    if (method === "GET" && opportunityAuditMatch) {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceCanManage(login)) return send(res, 403, { error: "当前账号没有查看综合报表的权限" });
      const detail = maintenanceOpportunityAuditDetail(routeParam(opportunityAuditMatch[1]), maintenanceReportAllowedPersonIds(login));
      return detail ? send(res, 200, { detail }) : send(res, 404, { error: "未找到维修机会" });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/report/export.xlsx") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceCanManage(login)) return send(res, 403, { error: "当前账号没有导出综合报表的权限" });
      const params = Object.fromEntries(url.searchParams.entries());
      const sections = String(params.sections || "").split(",").map(item => item.trim()).filter(Boolean);
      const data = maintenanceReportDataset(params, login);
      if (sections.includes("opportunities")) data.opportunitiesAudit = maintenanceReportDataset({ ...params, view: "opportunities" }, login).opportunities;
      if (sections.includes("nonroutine")) {
        const filters = maintenanceReportFilters({ ...params, view: "nonroutine" });
        if (filters.dateFrom > filters.dateTo) [filters.dateFrom, filters.dateTo] = [filters.dateTo, filters.dateFrom];
        data.nonroutineAudit = maintenanceNonroutineAuditQuery(filters, { paged: false, user: login }).rows;
      }
      const workbook = maintenanceReportXlsx(data, sections);
      const filename = `维修管控综合报表_${data.filters.dateFrom}_${data.filters.dateTo}.xlsx`;
      return sendBinary(res, 200, workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` });
    }
    const maintenanceHour = url.pathname.match(/^\/api\/maintenance\/hours\/([^/]+)$/);
    if (maintenanceHour && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.hours.adjust")) return send(res, 403, { error: "当前账号没有工时调整权限" });
      const p = await bodyJson(req);
      const hourId = routeParam(maintenanceHour[1]);
      const target=db.prepare("select person_id from maintenance_hour_results where id=?").get(hourId);
      personnelAccess.requirePerson(manager,"maintenance",target?.person_id);
      db.prepare("update maintenance_hour_results set adjusted_hours=?,updated_at=? where id=?").run(Number(p.adjustedHours ?? p.adjusted_hours ?? 0), now(), hourId);
      audit(manager, "maintenance_adjust_hours", "maintenanceHour", hourId, String(p.adjustedHours ?? ""));
      const adjusted = db.prepare("select * from maintenance_hour_results where id=?").get(hourId);
      bumpMaintenanceVersion(adjusted?.flight_id || "", "maintenance.hours.adjusted");
      return send(res, 200, { hour: publicMaintenanceHour(adjusted) });
    }
    const maintenanceConfirmHour = url.pathname.match(/^\/api\/maintenance\/hours\/([^/]+)\/confirm$/);
    if (maintenanceConfirmHour && method === "POST") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.hours.confirm")) return send(res, 403, { error: "当前账号没有工时确认权限" });
      const hourId = routeParam(maintenanceConfirmHour[1]);
      const hour = db.prepare("select * from maintenance_hour_results where id=?").get(hourId);
      maintenanceTransaction(()=>{
      personnelAccess.requirePerson(manager,"maintenance",hour?.person_id);
      if(hour.status!=='待复核')throw maintenanceReviewError('工时尚未进入待复核或已经确认，不能直接确认',409);
      db.prepare("update maintenance_hour_results set status='已确认',confirmed_by=?,confirmed_at=?,updated_at=? where id=?").run(manager.id, now(), now(), hourId);
      db.prepare("update maintenance_assignments set status='已确认',confirmed_at=? where id=(select assignment_id from maintenance_hour_results where id=?)").run(now(), hourId);
      if (hour) syncMaintenanceOwnerConfirmation(hour.owner_type, hour.owner_id, manager.id);
      });
      audit(manager, "maintenance_confirm_hours", "maintenanceHour", hourId);
      bumpMaintenanceVersion(hour?.flight_id || "", "maintenance.hours.confirmed");
      return send(res, 200, { hour: publicMaintenanceHour(db.prepare("select * from maintenance_hour_results where id=?").get(hourId)) });
    }
    if (method === "POST" && url.pathname === "/api/maintenance/hours/confirm-batch") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.hours.confirm")) return send(res, 403, { error: "当前账号没有批量确认权限" });
      const p = await bodyJson(req);
      const ids = Array.from(new Set((Array.isArray(p.ids) ? p.ids : []).map(item => String(item))));
      const hours = ids.length ? db.prepare(`select * from maintenance_hour_results where id in (${ids.map(() => "?").join(",")})`).all(...ids) : [];
      if(hours.length!==ids.length || hours.some(row=>!personnelAccess.allows(manager,"maintenance",row.person_id)))return send(res,404,{error:"工时不存在或超出范围"});
      if(hours.some(row=>row.status!=='待复核'))return send(res,409,{error:'所选工时包含未完成报工确认或已确认记录，请刷新后重试'});
      maintenanceTransaction(()=>{
      ids.forEach(id => db.prepare("update maintenance_hour_results set status='已确认',confirmed_by=?,confirmed_at=?,updated_at=? where id=?").run(manager.id, now(), now(), id));
      ids.forEach(id => db.prepare("update maintenance_assignments set status='已确认',confirmed_at=? where id=(select assignment_id from maintenance_hour_results where id=?)").run(now(), id));
      const owners = new Map(hours.map(row => [`${row.owner_type}:${row.owner_id}`, row]));
      owners.forEach(row => syncMaintenanceOwnerConfirmation(row.owner_type, row.owner_id, manager.id));
      });
      audit(manager, "maintenance_batch_confirm_hours", "maintenanceHour", "batch", `${ids.length} 条`);
      bumpMaintenanceVersion("", "maintenance.hours.confirmed");
      return send(res, 200, { confirmed: ids.length });
    }
    const maintenanceConfirmSortie = url.pathname.match(/^\/api\/maintenance\/sorties\/([^/]+)\/confirm$/);
    if (maintenanceConfirmSortie && method === "POST") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.hours.confirm")) return send(res, 403, { error: "当前账号没有架次确认权限" });
      const sortieId = routeParam(maintenanceConfirmSortie[1]);
      const sortie = db.prepare("select * from maintenance_sortie_results where id=?").get(sortieId);
      if (!sortie) return send(res, 404, { error: "未找到放行架次记录" });
      maintenanceTransaction(()=>{
      personnelAccess.requirePerson(manager,"maintenance",sortie.person_id);
      if(sortie.status!=='待复核')throw maintenanceReviewError('架次尚未进入待复核或已经确认，不能直接确认',409);
      db.prepare("update maintenance_sortie_results set status='已确认',sorties=1,confirmed_by=?,confirmed_at=?,updated_at=? where id=?").run(manager.id, now(), now(), sortieId);
      db.prepare("update maintenance_assignments set status='已确认',confirmed_at=? where id=?").run(now(), sortie.assignment_id);
      syncMaintenanceOwnerConfirmation(sortie.owner_type, sortie.owner_id, manager.id);
      });
      audit(manager, "maintenance_confirm_sortie", "maintenanceSortie", sortieId);
      bumpMaintenanceVersion(sortie.flight_id || "", "maintenance.sorties.confirmed");
      return send(res, 200, { sortie: publicMaintenanceSortie(db.prepare("select * from maintenance_sortie_results where id=?").get(sortieId)) });
    }
    if (method === "POST" && url.pathname === "/api/maintenance/sorties/confirm-batch") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.hours.confirm")) return send(res, 403, { error: "当前账号没有批量确认架次权限" });
      const p = await bodyJson(req);
      const ids = Array.from(new Set((Array.isArray(p.ids) ? p.ids : []).map(item => String(item))));
      const sorties = ids.length ? db.prepare(`select * from maintenance_sortie_results where id in (${ids.map(() => "?").join(",")})`).all(...ids) : [];
      if(sorties.length!==ids.length || sorties.some(row=>!personnelAccess.allows(manager,"maintenance",row.person_id)))return send(res,404,{error:"架次不存在或超出范围"});
      if(sorties.some(row=>row.status!=='待复核'))return send(res,409,{error:'所选架次包含未完成报工确认或已确认记录，请刷新后重试'});
      maintenanceTransaction(()=>{
      for (const sortie of sorties) {
        db.prepare("update maintenance_sortie_results set status='已确认',sorties=1,confirmed_by=?,confirmed_at=?,updated_at=? where id=?").run(manager.id, now(), now(), sortie.id);
        db.prepare("update maintenance_assignments set status='已确认',confirmed_at=? where id=?").run(now(), sortie.assignment_id);
        syncMaintenanceOwnerConfirmation(sortie.owner_type, sortie.owner_id, manager.id);
      }
      });
      audit(manager, "maintenance_batch_confirm_sorties", "maintenanceSortie", "batch", `${sorties.length} 条`);
      bumpMaintenanceVersion("", "maintenance.sorties.confirmed");
      return send(res, 200, { confirmed: sorties.length });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/export.xlsx") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!hasRbac(login, "maintenance.export")) return send(res, 403, { error: "当前账号没有导出权限" });
      const workbook = maintenanceXlsx(maintenanceStats(Object.fromEntries(url.searchParams.entries()), login));
      return sendBinary(res, 200, workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("维修管控工时统计.xlsx")}` });
    }
    if (method === "GET" && url.pathname === "/api/stats/reading") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!canUseStats(login)) return send(res, 403, { error: "当前账号没有统计权限" });
      return send(res, 200, readingStats(Object.fromEntries(url.searchParams.entries())));
    }
    if (method === "GET" && url.pathname === "/api/stats/reading/export.csv") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!canUseStats(login)) return send(res, 403, { error: "当前账号没有统计权限" });
      const csv = "\ufeff" + statsCsv(readingStats(Object.fromEntries(url.searchParams.entries())));
      return sendText(res, 200, csv, "text/csv; charset=utf-8", { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("信息阅读统计.csv")}` });
    }
    if (method === "GET" && url.pathname === "/api/stats/reading/export.xlsx") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!canUseStats(login)) return send(res, 403, { error: "当前账号没有统计权限" });
      const workbook = statsXlsx(readingStats(Object.fromEntries(url.searchParams.entries())));
      return sendBinary(res, 200, workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("信息阅读统计.xlsx")}` });
    }
    if (method === "GET" && url.pathname === "/api/settings") {
      const login = requireLogin(req, res);
      if (!login) return;
      return send(res, 200, { settings: publicSettings() });
    }
    if (method === "PUT" && url.pathname === "/api/settings") {
      const admin = requireRbacPermission(req, res, "settings.manage");
      if (!admin) return;
      const p = await bodyJson(req);
      const categories = normalizeCategoryList(p.categories);
      const syncedCategories = syncRecordCategories(categories);
      setSetting("categories", syncedCategories);
      setSetting("overdueDays", Math.max(1, Number(p.overdueDays || 3)));
      setSetting("reminderDays", Math.max(1, Number(p.reminderDays || 1)));
      audit(admin, "update_settings", "settings", "system", `${syncedCategories.length} 个分类`);
      return send(res, 200, { settings: publicSettings() });
    }
    if (url.pathname === '/api/info/sync' && method === 'POST') {
      const login=requireRbacPermission(req,res,'info.read'); if(!login)return;const user=withInfoAccess(login);
      const input=await bodyJson(req);
      if(!Array.isArray(input.knownIds) || input.knownIds.length>50000)return send(res,400,{error:'同步记录数量无效'});
      const delta=infoSync.changes(user,input.cursor,input.knownIds);
      const details=input.details===true && hasRbac(user,'info.stats.read');
      const content=publicRecords(details?[...delta.content,...delta.receipt]:delta.content,user,{summary:!details});
      const receiptData=publicRecords(delta.receipt,user,{summary:true});
      const updates=receiptData.records.map(record=>{
        return {id:record.id,feedbackSummary:record.feedbackSummary,
          ownReceipts:record.receipts.filter(r=>r.userId===user.id)};
      });
      return send(res,200,{reset:delta.reset,cursor:delta.cursor,records:content.records,receipts:content.receipts,updates:details?[]:updates,removed:delta.removed});
    }
    if (url.pathname === '/api/info/events' && method === 'GET') {
      const login=requireRbacPermission(req,res,'info.read'); if(!login)return;const user=withInfoAccess(login);
      const active=[...infoEventClients].filter(c=>c.user.id===user.id);
      if(active.length>=5)return send(res,429,{error:'实时连接数量已达上限'});
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'});
      const known=new Set(db.prepare('select * from records').all().filter(r=>canViewRecord(user,r)).map(r=>r.id));
      const client={req,res,user,known}; infoEventClients.add(client);
      res.write('retry: 10000\nevent: info\ndata: {"kind":"connected"}\n\n');
      res.on('close',()=>infoEventClients.delete(client));
      return;
    }
    if (method === "GET" && url.pathname === "/api/records") {
      const login = requireLogin(req, res);
      if (!login) return;
      const version=infoSync.latest();
      const viewer=withInfoAccess(login);
      const rows = db.prepare("select * from records").all().filter(row => canViewRecord(viewer, row)).sort(compareRecordsDesc);
      const result = publicRecords(rows, viewer,{summary:url.searchParams.get('summary')==='1'});
      return send(res, 200, { ...result, cursor:infoSync.encode(viewer,version), settings: publicSettings() });
    }
    if (method === "POST" && url.pathname === "/api/records") {
      const editor = requireRbacPermission(req, res, "info.create");
      if (!editor) return;
      const p = await bodyJson(req);
      const rid = randomId("rec");
      maintenanceTransaction(() => {
      const selectedRecipients = recipientsFromPayload(p);
      db.prepare("insert into records(id,date,publisher,category,title,summary,original,source_set,created_by,updated_by,created_at,updated_at,deadline,priority,publish_status,publisher_id,imported_read) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(rid, p.date, editor.name, p.category, p.title, "", p.original, "后台录入", editor.id, editor.id, now(), now(), p.deadline || deadlineFor(p.date), p.priority || "普通", p.publishStatus || "已发布", editor.id, 0);
      saveRecipients(rid, selectedRecipients);
      audit(editor, "create_record", "record", rid, p.title);
      });
      return send(res, 201, { record: publicRecord(db.prepare("select * from records where id=?").get(rid), editor) });
    }
    const rec = url.pathname.match(/^\/api\/records\/([^/]+)$/);
    if(rec && method==='GET'){
      const user=requireRbacPermission(req,res,'info.read'); if(!user)return;
      const row=db.prepare('select * from records where id=?').get(routeParam(rec[1]));
      if(!canViewRecord(user,row))return send(res,404,{error:'未找到信息'});
      return send(res,200,{record:publicRecord(row,user)});
    }
    if (rec && method === "PUT") {
      const editor = requireLogin(req, res);
      if (!editor) return;
      const p = await bodyJson(req);
      const recordId = routeParam(rec[1]);
      const existing = db.prepare("select * from records where id=?").get(recordId);
      if (!existing) return send(res, 404, { error: "未找到信息" });
      if (!canEditRecord(editor, existing)) return send(res, 403, { error: "当前账号无权修改该信息" });
      if(String(p.expectedUpdatedAt||'')!==existing.updated_at)return send(res,409,{error:'信息已被更新，请重新核对后保存',code:'INFO_EDIT_CONFLICT'});
      maintenanceTransaction(() => {
      const stamp=new Date(Math.max(Date.now(),Date.parse(existing.updated_at)+1||0)).toISOString();
      const changed=db.prepare("update records set date=?,category=?,title=?,original=?,updated_by=?,updated_at=?,deadline=?,priority=?,publish_status=? where id=? and updated_at=?")
        .run(p.date, p.category, p.title, p.original, editor.id, stamp, p.deadline || existing.deadline || deadlineFor(p.date), p.priority || existing.priority || "普通", p.publishStatus || existing.publish_status || "已发布", recordId,existing.updated_at);
      if(!changed.changes)throw Object.assign(new Error('信息已被更新，请重新核对后保存'),{status:409,code:'INFO_EDIT_CONFLICT'});
      if (Array.isArray(p.recipients) || p.allInScope === true) saveRecipients(recordId, recipientsFromPayload(p));
      audit(editor, "update_record", "record", recordId, p.title);
      });
      return send(res, 200, { record: publicRecord(db.prepare("select * from records where id=?").get(recordId), editor) });
    }
    if (rec && method === "DELETE") {
      const login = requireLogin(req, res);
      if (!login) return;
      const recordId = routeParam(rec[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if (!canDeleteRecord(login, row)) return send(res, 403, { error: "当前账号无权删除该信息" });
      await removeOwnerAttachmentFiles("record", recordId);
      maintenanceTransaction(()=>{
      db.prepare("delete from records where id=?").run(recordId);
      db.prepare("delete from record_recipients where record_id=?").run(recordId);
      db.prepare("delete from read_receipts where record_id=?").run(recordId);
      db.prepare("delete from attachments where owner_type='record' and owner_id=?").run(recordId);
      db.prepare("delete from favorites where record_id=?").run(recordId);
      audit(login, "delete_record", "record", recordId, row.title);
      });
      return send(res, 200, { ok: true });
    }
    const voidRecord = url.pathname.match(/^\/api\/records\/([^/]+)\/void$/);
    if (voidRecord && method === "POST") {
      const login = requireLogin(req, res);
      if (!login) return;
      const recordId = routeParam(voidRecord[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if (!canVoidRecord(login, row)) return send(res, 403, { error: "只能作废自己发布的信息" });
      db.prepare("update records set publish_status='作废',updated_by=?,updated_at=? where id=?").run(login.id, now(), recordId);
      audit(login, "void_record", "record", recordId, row.title);
      return send(res, 200, { record: publicRecord(db.prepare("select * from records where id=?").get(recordId), login) });
    }
    const restoreRecord = url.pathname.match(/^\/api\/records\/([^/]+)\/restore$/);
    if (restoreRecord && method === "POST") {
      const admin = requireRbacPermission(req, res, "info.restore");
      if (!admin) return;
      const recordId = routeParam(restoreRecord[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if ((row.publish_status || "已发布") !== "作废") return send(res, 400, { error: "只有作废信息可以恢复" });
      if(!isRecordOwner(admin,row) && !dataScopeAllowsUser(admin,row.publisher_id || row.created_by,"info"))return send(res,404,{error:"未找到信息"});
      const restoredAt = now();
      maintenanceTransaction(()=>{
      db.prepare("update records set date=?,deadline=?,publish_status='已发布',updated_by=?,updated_at=? where id=?")
        .run(restoredAt, deadlineFor(restoredAt), admin.id, restoredAt, recordId);
      db.prepare("delete from read_receipts where record_id=?").run(recordId);
      audit(admin, "restore_record", "record", recordId, row.title);
      });
      return send(res, 200, { record: publicRecord(db.prepare("select * from records where id=?").get(recordId), admin) });
    }
    const read = url.pathname.match(/^\/api\/records\/([^/]+)\/read$/);
    if (read && method === "POST") {
      const login = requireLogin(req, res);
      if (!login) return;
      const recordId = routeParam(read[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if (!canViewRecord(login, row)) return send(res, 403, { error: "无权阅读该信息" });
      if ((row.publish_status || "已发布") === "作废" || !isRecordRecipient(login, row)) {
        return send(res, 200, { receipt: null, skipped: true, reason: "非接收对象无需记录阅读状态" });
      }
      const existing = db.prepare("select * from read_receipts where record_id=? and user_id=?").get(recordId, login.id);
      if (!existing?.read_at) {
        const isOverdue = parseRecordDate(row.deadline)?.getTime() < Date.now() ? 1 : 0;
        db.prepare("insert into read_receipts(record_id,user_id,read_at,is_overdue,remind_count,last_reminded_at) values(?,?,?,?,?,?) on conflict(record_id,user_id) do update set read_at=excluded.read_at,is_overdue=excluded.is_overdue")
          .run(recordId, login.id, now(), isOverdue, existing?.remind_count || 0, existing?.last_reminded_at || "");
        audit(login, "read_record", "record", recordId);
      }
      return send(res, 200, { receipt: receipts(recordId).find(item => item.userId === login.id) });
    }
    const receiptEdit = url.pathname.match(/^\/api\/records\/([^/]+)\/receipts\/([^/]+)$/);
    if (receiptEdit && method === "PUT") {
      const admin = requireRbacPermission(req, res, "info.receipt.manage");
      if (!admin) return;
      const recordId = routeParam(receiptEdit[1]);
      const userId = routeParam(receiptEdit[2]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if ((row.publish_status || "已发布") === "作废") return send(res, 400, { error: "作废信息不能修改阅读状态" });
      if (!db.prepare("select 1 from record_recipients where record_id=? and user_id=?").get(recordId, userId)) return send(res, 400, { error: "该人员不是此信息接收者" });
      const p = await bodyJson(req);
      updateReceiptStatus(recordId, userId, p.status);
      audit(admin, "update_receipt_status", "record", recordId, `${userId}:${p.status}`);
      return send(res, 200, { receipts: publicReceiptsFor(admin,[recordId]) });
    }
    const receiptBatchEdit = url.pathname.match(/^\/api\/records\/([^/]+)\/receipts$/);
    if (receiptBatchEdit && method === "PUT") {
      const admin = requireRbacPermission(req, res, "info.receipt.manage");
      if (!admin) return;
      const recordId = routeParam(receiptBatchEdit[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if ((row.publish_status || "已发布") === "作废") return send(res, 400, { error: "作废信息不能修改阅读状态" });
      const p = await bodyJson(req);
      const userIds = Array.from(new Set((Array.isArray(p.userIds) ? p.userIds : []).map(item => String(item))));
      if (!userIds.length) return send(res, 400, { error: "请选择接收者" });
      const recipientSet = new Set(db.prepare("select user_id from record_recipients where record_id=?").all(recordId).map(item => item.user_id));
      if (userIds.some(userId => !recipientSet.has(userId))) return send(res, 400, { error: "包含非此信息接收者" });
      if(userIds.some(id=>!dataScopeAllowsUser(admin,id,"info")))return send(res,403,{error:"接收人员不在信息管理范围内"});
      maintenanceTransaction(()=>userIds.forEach(userId => updateReceiptStatus(recordId, userId, p.status)));
      audit(admin, "batch_update_receipt_status", "record", recordId, `${userIds.length}:${p.status}`);
      return send(res, 200, { receipts: publicReceiptsFor(admin,[recordId]) });
    }
    const remind = url.pathname.match(/^\/api\/records\/([^/]+)\/remind$/);
    if (remind && method === "POST") {
      const login = requireLogin(req, res);
      if (!login) return;
      const recordId = routeParam(remind[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if (!hasRbac(login, "info.remind.any") && !(hasRbac(login, "info.remind.own") && isRecordOwner(login, row))) return send(res, 403, { error: "当前账号无权催办该信息" });
      const p = await bodyJson(req);
      const userIds = Array.isArray(p.userIds) ? p.userIds : [];
      const eligible=new Set(recipients(recordId).filter(r=>dataScopeAllowsUser(login,r.accountId,"info")).map(r=>r.accountId));
      if(userIds.some(id=>!eligible.has(id)))return send(res,403,{error:"包含不可催办的接收人员"});
      const upsert = db.prepare("insert into read_receipts(record_id,user_id,read_at,is_overdue,remind_count,last_reminded_at) values(?,?,?,?,?,?) on conflict(record_id,user_id) do update set remind_count=coalesce(remind_count,0)+1,last_reminded_at=excluded.last_reminded_at");
      userIds.forEach(userId => upsert.run(recordId, String(userId), "", 0, 1, now()));
      audit(login, "remind_record", "record", recordId, `${userIds.length} 人`);
      return send(res, 200, { reminded: userIds.length, receipts: publicReceiptsFor(login,[recordId]) });
    }
    const fav = url.pathname.match(/^\/api\/records\/([^/]+)\/favorite$/);
    if (fav && (method === "POST" || method === "DELETE")) {
      const login = requireLogin(req, res);
      if (!login) return;
      const recordId = routeParam(fav[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if (!canViewRecord(login, row)) return send(res, 403, { error: "无权收藏该信息" });
      db.prepare("delete from favorites where user_id=? and record_id=?").run(login.id, recordId);
      if (method === "POST") db.prepare("insert into favorites(user_id,record_id,created_at) values(?,?,?)").run(login.id, recordId, now());
      audit(login, method === "POST" ? "favorite" : "unfavorite", "record", recordId);
      return send(res, 200, { ok: true, favorite: method === "POST" });
    }
    if (method === "POST" && url.pathname === "/api/records/import") {
      const admin = requireRbacPermission(req, res, "info.create");
      if (!admin) return;
      const p = await bodyJson(req);
      const rows = Array.isArray(p.rows) ? p.rows : [];
      const people = allLoginPeople();
      const insertRecord = db.prepare("insert into records(id,date,publisher,category,title,summary,original,source_set,created_by,updated_by,created_at,updated_at,deadline,priority,publish_status,publisher_id,imported_read) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
      const insertRecipient = db.prepare("insert into record_recipients(record_id,user_id,person_id,name,department,team) values(?,?,?,?,?,?)");
      const insertReceipt = db.prepare("insert into read_receipts(record_id,user_id,read_at,is_overdue,remind_count,last_reminded_at) values(?,?,?,?,?,?)");
      let created = 0;
      let skipped = 0;
      const importedAt = now();
      for (const row of rows) {
        const date = String(row.date || "").trim();
        const category = String(row.category || "").trim();
        const title = String(row.title || "").trim();
        const original = String(row.original || "").trim();
        if (!date || !category || !title || !original) {
          skipped++;
          continue;
        }
        const rid = randomId("rec");
        const publisher = String(row.publisher || "").trim() || admin.name;
        insertRecord.run(rid, date, publisher, category, title, "", original, "batchImport", admin.id, admin.id, importedAt, importedAt, deadlineFor(date), row.priority || "普通", "已发布", admin.id, 1);
        people.forEach(person => {
          insertRecipient.run(rid, person.accountId, person.personId, person.name, person.department || "未设置", person.team || "未设置");
          insertReceipt.run(rid, person.id, importedAt, 0, 0, "");
        });
        created++;
      }
      audit(admin, "import_records", "record", "bulk", `${created} 条，跳过 ${skipped} 行`);
      return send(res, 201, { created, skipped, receiptCount: created * people.length });
    }

    if (method === "GET" && url.pathname === "/api/fixed-projects") {
      if (!hasRbac(currentUser(req), "fixed.read")) return send(res, 403, { error: "当前账号没有权限" });
      const rows = db.prepare("select * from fixed_projects order by ata asc,title asc").all();
      return send(res, 200, { projects: publicProjects(rows) });
    }
    if (method === "POST" && url.pathname === "/api/fixed-projects") {
      const admin = requireRbacPermission(req, res, "fixed.manage");
      if (!admin) return;
      const p = await bodyJson(req);
      const pid = randomId("fix");
      db.prepare("insert into fixed_projects(id,ata,title,content_html,references_text,created_by,updated_by,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)")
        .run(pid, p.ata, p.title, sanitizeRichHtml(p.contentHtml || ""), p.references || "", admin.id, admin.id, now(), now());
      audit(admin, "create_fixed_project", "fixedProject", pid, p.title);
      return send(res, 201, { project: publicProject(db.prepare("select * from fixed_projects where id=?").get(pid)) });
    }
    const fix = url.pathname.match(/^\/api\/fixed-projects\/([^/]+)$/);
    if (fix && method === "PUT") {
      const admin = requireRbacPermission(req, res, "fixed.manage");
      if (!admin) return;
      const p = await bodyJson(req);
      const projectId = routeParam(fix[1]);
      db.prepare("update fixed_projects set ata=?,title=?,content_html=?,references_text=?,updated_by=?,updated_at=? where id=?")
        .run(p.ata, p.title, sanitizeRichHtml(p.contentHtml || ""), p.references || "", admin.id, now(), projectId);
      audit(admin, "update_fixed_project", "fixedProject", projectId, p.title);
      return send(res, 200, { project: publicProject(db.prepare("select * from fixed_projects where id=?").get(projectId)) });
    }
    if (fix && method === "DELETE") {
      const admin = requireRbacPermission(req, res, "fixed.manage");
      if (!admin) return;
      const projectId = routeParam(fix[1]);
      await removeOwnerAttachmentFiles("fixedProject", projectId);
      db.prepare("delete from fixed_projects where id=?").run(projectId);
      db.prepare("delete from attachments where owner_type='fixedProject' and owner_id=?").run(projectId);
      audit(admin, "delete_fixed_project", "fixedProject", projectId);
      return send(res, 200, { ok: true });
    }

    const cosPresign = url.pathname.match(/^\/api\/(records|fixed-projects)\/([^/]+)\/attachments\/presign$/);
    if (cosPresign && method === "POST") {
      await createCosUpload(req, res, cosPresign[1] === "records" ? "record" : "fixedProject", routeParam(cosPresign[2]));
      return;
    }
    const cosComplete = url.pathname.match(/^\/api\/(records|fixed-projects)\/([^/]+)\/attachments\/complete$/);
    if (cosComplete && method === "POST") {
      await completeCosUpload(req, res, cosComplete[1] === "records" ? "record" : "fixedProject", routeParam(cosComplete[2]));
      return;
    }
    const upload = url.pathname.match(/^\/api\/(records|fixed-projects)\/([^/]+)\/attachments$/);
    if (upload && method === "POST") {
      await addUploadedAttachments(req, res, upload[1] === "records" ? "record" : "fixedProject", routeParam(upload[2]));
      return;
    }
    const attAccess = url.pathname.match(/^\/api\/attachments\/([^/]+)\/access$/);
    if (attAccess && method === "GET") {
      const login = requireLogin(req, res);
      if (!login) return;
      const attachmentId = routeParam(attAccess[1]);
      const row = attachmentRow(attachmentId);
      if (!row || !row.path) return send(res, 404, { error: "未找到附件" });
      if (!canViewAttachment(login, row)) return send(res, 403, { error: "无权访问该附件" });
      const download = url.searchParams.get("download") === "1";
      if (row.storage === "cos") return send(res, 200, signedCosAttachment(row, 300, download));
      return send(res, 200, {
        url: `/api/attachments/${encodeURIComponent(row.id)}${download ? '?download=1' : ''}`,
        expiresAt: "",
        expiresIn: 0,
        fileName: row.name || "附件",
        mimeType: contentTypeForAttachment(row),
        size: Number(row.size || 0)
      });
    }
    const att = url.pathname.match(/^\/api\/attachments\/([^/]+)$/);
    if (att && method === "GET") {
      const login = requireLogin(req, res);
      if (!login) return;
      const attachmentId = routeParam(att[1]);
      const row = attachmentRow(attachmentId);
      if (!row || !row.path) return sendText(res, 404, "未找到附件");
      if (!canViewAttachment(login, row)) return sendText(res, 403, "无权访问该附件");
      if (row.storage === "cos") {
        res.writeHead(302, { ...securityHeaders(), "Location": signedCosAttachment(row, 300, url.searchParams.get("download") === "1").url, "Cache-Control": "private, no-store" });
        return res.end();
      }
      const filePath = safeUploadPath(row.path);
      if (!filePath) return sendText(res, 403, "附件路径无效");
      try {
        return await streamAttachment(req, res, row, filePath, url.searchParams.get("download") === "1");
      } catch {
        return sendText(res, 404, "未找到附件文件");
      }
    }
    if (att && method === "DELETE") {
      const login = requireLogin(req, res);
      if (!login) return;
      const attachmentId = routeParam(att[1]);
      const row = attachmentRow(attachmentId);
      if (!row) return send(res, 404, { error: "未找到附件" });
      if (!canManageAttachment(login, row)) return send(res, 403, { error: "无权删除该附件" });
      if (row.storage === "cos") await deleteCosObject(row.path);
      else {
        const filePath = row.path ? safeUploadPath(row.path) : "";
        if (filePath) await fs.rm(filePath, { force: true });
      }
      db.prepare("delete from attachments where id=?").run(attachmentId);
      audit(login, "delete_attachment", row.owner_type, row.owner_id, row.name);
      return send(res, 200, { ok: true });
    }

    if (method === "GET" && url.pathname === "/api/admin/accounts") {
      const manager = requireRbacPermission(req, res, "accounts.read");
      if (!manager) return;
      return send(res, 200, { accounts: db.prepare("select * from users order by created_at").all().filter(row=>personnelAccess.allows(manager,"accounts",row.person_id)).map(adminUser) });
    }
    if (method === "GET" && url.pathname === "/api/admin/accounts/effective-permissions") {
      // B6 有效权限预览（V1.1 §4.1/S5）：显示指定账户的最终权限、来源角色、范围与身份。
      const manager = requireRbacPermission(req, res, "roles.read");
      if (!manager) return;
      const targetUserId = String(url.searchParams.get("userId") || "").trim();
      if (!targetUserId) return send(res, 400, { error: "缺少 userId" });
      const target = db.prepare("select u.id,u.username,u.status,u.person_id,p.name,p.position_code from users u left join personnel p on p.id=u.person_id where u.id=?").get(targetUserId);
      if (!target) return send(res, 404, { error: "账户不存在" });
      if (!personnelAccess.allows(manager, "accounts", target.person_id)) return send(res, 403, { error: "该账户不在您的数据范围内" });
      const snapshot = rbacSnapshot(targetUserId);
      const rolePermissions = {};
      for (const role of snapshot.roles) {
        const perms = db.prepare(`select distinct p.code, p.name, p.module from rbac_permissions p
          join rbac_role_permissions rp on rp.permission_id=p.id
          join rbac_roles r on r.id=rp.role_id
          where r.code=? and r.status='active' order by p.module, p.code`).all(role.code);
        rolePermissions[role.code] = perms;
      }
      const permissionSources = {};
      for (const [roleCode, perms] of Object.entries(rolePermissions)) {
        for (const perm of perms) {
          if (!permissionSources[perm.code]) permissionSources[perm.code] = { name: perm.name, module: perm.module, roles: [] };
          permissionSources[perm.code].roles.push(roleCode);
        }
      }
      const identity = classifyPosition(target.position_code);
      const now = Date.now();
      const scopesByModule = {};
      for (const scope of snapshot.scopes) {
        if (!scopesByModule[scope.module]) scopesByModule[scope.module] = [];
        const expired = scope.validTo && Date.parse(scope.validTo) < now;
        const pending = scope.validFrom && Date.parse(scope.validFrom) > now;
        scopesByModule[scope.module].push({ ...scope, status: expired ? "expired" : pending ? "pending" : "active" });
      }
      const baseRoles = snapshot.roles.filter(r => ["worker", "dispatcher", "manager"].includes(r.code));
      const baseRoleIssues = baseRoles.length !== 1 && snapshot.roles[0]?.code !== "system_admin" ? ["基础角色数量异常（应为恰好一个）"] : [];
      return send(res, 200, {
        account: { id: target.id, username: target.username, status: target.status, personName: target.name, position: target.position_code },
        identity: { class: identity.identity, label: identity.identityLabel, source: identity.source, quality: identity.quality },
        roles: snapshot.roles.map(r => ({ code: r.code, name: r.name, permissionCount: rolePermissions[r.code]?.length || 0 })),
        effectivePermissions: snapshot.permissions.map(code => permissionSources[code]).filter(Boolean),
        permissionCount: snapshot.permissions.length,
        scopesByModule,
        baseRoleIssues,
        isSuperAccount: targetUserId === SUPER_ACCOUNT_ID
      });
    }
    if (method === "GET" && url.pathname === "/api/admin/accounts/availability") {
      const manager = requireRbacPermission(req, res, "accounts.create");
      if (!manager) return;
      const personId = String(url.searchParams.get("personId") || "").trim();
      const username = String(url.searchParams.get("username") || "").trim();
      if (!personId) return send(res, 400, { error: "必须选择关联人员" });
      personnelAccess.requirePerson(manager, "accounts", personId, true);
      const person = db.prepare("select id,employee_no,employment_status from personnel where id=? and data_status='active'").get(personId);
      if (!person) return send(res, 404, { error: "未找到可管理的人员" });
      const personEligible = !["离职", "停职"].includes(person.employment_status);
      const linked = personEligible ? db.prepare("select 1 from users where person_id=?").get(personId) : null;
      const usernameTaken = username ? !!db.prepare("select 1 from users where username=?").get(username) : false;
      const personAvailable = personEligible && !linked;
      const usernameAvailable = !!username && !usernameTaken;
      const conflicts = [];
      if (!personEligible) conflicts.push("PERSON_UNAVAILABLE");
      else if (linked) conflicts.push("PERSON_LINKED");
      if (!username) conflicts.push("USERNAME_REQUIRED");
      else if (usernameTaken) conflicts.push("USERNAME_TAKEN");
      const message = conflicts.includes("PERSON_LINKED") ? "该人员已关联登录账号，无法重复注册"
        : conflicts.includes("PERSON_UNAVAILABLE") ? "该人员已离职、停职或失效，无法注册"
        : conflicts.includes("USERNAME_TAKEN") ? "登录账号已存在，无法注册"
        : conflicts.includes("USERNAME_REQUIRED") ? "登录账号不能为空"
        : "登录账号可用";
      return send(res, 200, { available: personAvailable && usernameAvailable, suggestedUsername: person.employee_no, personAvailable, usernameAvailable, conflicts, message });
    }
    if (method === "POST" && url.pathname === "/api/admin/accounts") {
      const manager = requireRbacPermission(req, res, "accounts.create");
      if (!manager) return;
      if (!hasRbac(manager, "accounts.roles.assign")) return send(res, 403, { error: "当前账号没有分配角色权限", permission: "accounts.roles.assign" });
      if (!hasRbac(manager, "accounts.scopes.assign")) return send(res, 403, { error: "当前账号没有分配数据范围权限", permission: "accounts.scopes.assign" });
      const payload = await bodyJson(req);
      const username = String(payload.username || "").trim();
      const password = String(payload.password || "");
      if (!username) return send(res, 400, { error: "登录账号不能为空" });
      if (password.length < 6) return send(res, 400, { error: "初始密码至少需要6位" });
      if (db.prepare("select id from users where username=?").get(username)) return send(res, 409, { error: "登录账号已存在" });
      const person = validateAccountIdentity(payload);
      const access = validateAccountAccess(payload,person.id);
      const userId = randomId("u");
      const pass = hashPassword(password);
      db.exec("begin immediate");
      try {
        if (db.prepare("select id from users where username=?").get(username)) throw Object.assign(new Error("登录账号已存在"), { status: 409 });
        validateAccountIdentity(payload);
        db.prepare(`insert into users(id,username,name,role,salt,password_hash,permissions,allowed_tabs,department,team,function_category,status,person_id,must_change_password,credential_version,created_at,updated_at)
          values(?,?,?,'rbac',?,?,'[]','[]',?,?,?,?,?,?,1,?,?)`)
          .run(userId, username, person.name, pass.salt, pass.hash, person.department || "未设置", person.home_team || "未设置", normalizeFunctionCategory(payload.functionCategory), normalizeStatus(payload.status), person.id, payload.mustChangePassword === false ? 0 : 1, now(), now());
        replaceAccountAccess(userId, access, (manager||{}).id||"");
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      audit(manager, "create_account", "user", userId, JSON.stringify({ username, personId: person.id, roles: access.roleCodes, scopes: access.scopes }));
      return send(res, 201, { account: adminUser(db.prepare("select * from users where id=?").get(userId)) });
    }
    if (method === "POST" && url.pathname === "/api/admin/accounts/bulk-access") {
      const manager = requireRbacPermission(req, res, "accounts.update");
      if (!manager) return;
      const payload = await bodyJson(req);
      const fail = (message, status=400) => { throw Object.assign(new Error(message), {status}); };
      const ids = Array.isArray(payload.accountIds) ? [...new Set(payload.accountIds)] : [];
      if (!ids.length || ids.length > 1000 || ids.some(id => typeof id !== "string" || !id)) fail("请选择 1 至 1000 个有效账号");
      const changeRoles = payload.roles !== undefined, changeScopes = payload.moduleScopes !== undefined;
      if (!changeRoles && !changeScopes) fail("请至少选择一项修改内容");
      if (changeRoles && !hasRbac(manager,"accounts.roles.assign")) fail("没有分配角色权限",403);
      if (changeScopes && !hasRbac(manager,"accounts.scopes.assign")) fail("没有分配数据范围权限",403);
      if (changeRoles && (!["append","replace"].includes(payload.roleMode) || !Array.isArray(payload.roles) || !payload.roles.length)) fail("请选择角色及有效修改方式");
      const modules = changeScopes && payload.moduleScopes && typeof payload.moduleScopes === "object" && !Array.isArray(payload.moduleScopes) ? Object.keys(payload.moduleScopes) : [];
      const allowedModules = ["personnel","accounts","info","maintenance","hours","attendance"];
      if (changeScopes && (!modules.length || modules.some(module => !allowedModules.includes(module) || !Array.isArray(payload.moduleScopes[module]) || !payload.moduleScopes[module].length || payload.moduleScopes[module].some(scope => scope?.module !== module)))) fail("请选择有效模块并配置至少一项范围");
      db.exec("begin immediate");
      try {
        // Validate the entire batch before writing; retain untouched scope rows and their audit metadata.
        const updates = ids.map(id => {
          try {
            if (id === SUPER_ACCOUNT_ID) fail("唯一超级账号不可修改",403);
            const existing = db.prepare("select * from users where id=?" + (db.kind === "postgres" ? " for update" : "")).get(id);
            if (!existing) fail("账号不存在",409);
            personnelAccess.requirePerson(manager,"accounts",existing.person_id);
            validateAccountIdentity({},existing);
            const current = rbacSnapshot(id);
            let access;
            if (changeRoles) {
              const roles = payload.roleMode === "append" ? [...current.roles.map(role=>role.code),...payload.roles] : payload.roles;
              access = validateAccountAccess({roles,scopes:[]}, existing.person_id);
            }
            let scopes=[];
            if (changeScopes) {
              const input=modules.flatMap(module=>payload.moduleScopes[module]);
              scopes=personnelAccess.normalizeScopes(input,existing.person_id).filter(scope=>modules.includes(scope.module));
              scopes=scopes.map(scope=>({...scope,grantReason:String(input.find(item=>item.module===scope.module && item.scopeType===scope.scopeType && String(item.scopeId||"")===scope.scopeId)?.grantReason||"").slice(0,500)}));
            }
            return {id,existing,access,scopes};
          } catch(error) { error.message=`账号 ${id}：${error.message}`; throw error; }
        });
        for (const update of updates) {
          if (changeRoles) {
            db.prepare("delete from rbac_user_roles where user_id=?").run(update.id);
            for (const role of update.access.roleRows) db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)").run(update.id,role.id,now());
          }
          for (const module of modules) db.prepare("delete from rbac_user_scopes where user_id=? and module=?").run(update.id,module);
          const hasGrantColumns = Number(db.prepare("select count(*) as n from " + (db.kind === "postgres" ? "(select column_name from information_schema.columns where table_name='rbac_user_scopes' and column_name in ('grant_reason','granted_by'))" : "(select name from pragma_table_info('rbac_user_scopes') where name in ('grant_reason','granted_by'))")).get().n) === 2;
          for (const scope of update.scopes) {
            const values=[randomId("scope"),update.id,scope.module,scope.scopeType,scope.scopeId,scope.validFrom,scope.validTo,now(),now()];
            if(hasGrantColumns) db.prepare("insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at,grant_reason,granted_by) values(?,?,?,?,?,?,?,?,?,?,?)").run(...values,scope.grantReason,manager.id);
            else db.prepare("insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)").run(...values);
          }
          db.prepare("update users set updated_at=? where id=?").run(now(),update.id);
          audit(manager,"bulk_update_account_access","user",update.id,JSON.stringify({roleMode:changeRoles?payload.roleMode:null,roles:update.access?.roleCodes,modules,scopes:update.scopes}));
        }
        db.exec("commit");
      } catch(error) { db.exec("rollback"); throw error; }
      for (const id of ids) revokeUserSessions(id,{bumpCredentialVersion:true});
      return send(res,200,{ok:true,updated:ids.length});
    }
    const accountRoute = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)$/);
    if (accountRoute && method === "PUT") {
      const manager = requireRbacPermission(req, res, "accounts.update");
      if (!manager) return;
      const userId = routeParam(accountRoute[1]);
      if (userId === SUPER_ACCOUNT_ID) {
        audit(manager, "reject_update_super_account", "user", userId);
        return send(res, 403, { error: "唯一超级账号不可修改；仅允许本人修改密码" });
      }
      const existing = db.prepare("select * from users where id=?").get(userId);
      if (!existing) return send(res, 404, { error: "未找到账号" });
      personnelAccess.requirePerson(manager,"accounts",existing.person_id);
      const payload = await bodyJson(req);
      if (!hasRbac(manager, "accounts.roles.assign")) return send(res, 403, { error: "当前账号没有分配角色权限", permission: "accounts.roles.assign" });
      if (!hasRbac(manager, "accounts.scopes.assign")) return send(res, 403, { error: "当前账号没有分配数据范围权限", permission: "accounts.scopes.assign" });
      const person = validateAccountIdentity(payload, existing);
      const access = validateAccountAccess(payload,person.id);
      const status = normalizeStatus(payload.status ?? existing.status);
      if(status!==existing.status && !hasRbac(manager,"accounts.disable"))return send(res,403,{error:"没有变更账户启用状态的权限",permission:"accounts.disable"});
      db.exec("begin immediate");
      try {
        validateAccountIdentity(payload, existing);
        db.prepare("update users set name=?,role='rbac',permissions='[]',allowed_tabs='[]',department=?,team=?,function_category=?,status=?,person_id=?,must_change_password=?,updated_at=? where id=?")
          .run(person.name, person.department || "未设置", person.home_team || "未设置", normalizeFunctionCategory(payload.functionCategory ?? existing.function_category), status, person.id, payload.mustChangePassword === true ? 1 : 0, now(), userId);
        replaceAccountAccess(userId, access, (manager||{}).id||"");
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      revokeUserSessions(userId, { bumpCredentialVersion: true });
      audit(manager, "update_account", "user", userId, JSON.stringify({ personId: person.id, status, roles: access.roleCodes, scopes: access.scopes }));
      return send(res, 200, { account: adminUser(db.prepare("select * from users where id=?").get(userId)) });
    }
    if (accountRoute && method === "DELETE") {
      const manager = requireRbacPermission(req, res, "accounts.disable");
      if (!manager) return;
      const userId = routeParam(accountRoute[1]);
      if (userId === SUPER_ACCOUNT_ID) {
        audit(manager, "reject_disable_super_account", "user", userId);
        return send(res, 403, { error: "唯一超级账号不可删除或停用" });
      }
      if (userId === manager.id) return send(res, 400, { error: "不能停用当前登录账号" });
      const existing = db.prepare("select * from users where id=?").get(userId);
      if (!existing) return send(res, 404, { error: "未找到账号" });
      personnelAccess.requirePerson(manager,"accounts",existing.person_id);
      db.prepare("update users set status='disabled',credential_version=coalesce(credential_version,1)+1,updated_at=? where id=?").run(now(), userId);
      revokeUserSessions(userId);
      audit(manager, "disable_account", "user", userId, existing.username);
      return send(res, 200, { ok: true, retainedHistory: true });
    }
    const accountResetRoute = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/reset-password$/);
    if (accountResetRoute && method === "POST") {
      const manager = requireRbacPermission(req, res, "accounts.password.reset");
      if (!manager) return;
      const userId = routeParam(accountResetRoute[1]);
      if (userId === SUPER_ACCOUNT_ID) {
        audit(manager, "reject_reset_super_password", "user", userId);
        return send(res, 403, { error: "超级账号密码只能由本人修改" });
      }
      const existing = db.prepare("select * from users where id=?").get(userId);
      if (!existing) return send(res, 404, { error: "未找到账号" });
      personnelAccess.requirePerson(manager,"accounts",existing.person_id);
      if (isDeletedAccountPerson(existing)) return send(res, 409, { error: "关联人员已删除，账户仅保留历史，不可重置密码" });
      const payload = await bodyJson(req);
      const password = String(payload.password || "");
      if (password.length < 6) return send(res, 400, { error: "新密码至少需要6位" });
      const pass = hashPassword(password);
      db.prepare("update users set salt=?,password_hash=?,must_change_password=1,credential_version=coalesce(credential_version,1)+1,updated_at=? where id=?").run(pass.salt, pass.hash, now(), userId);
      revokeUserSessions(userId);
      audit(manager, "reset_account_password", "user", userId, existing.username);
      return send(res, 200, { ok: true });
    }

    if (method === "POST" && url.pathname === "/api/admin/accounts/bulk-open") {
      const admin = requireRbacPermission(req, res, "accounts.bulk_open");
      if (!admin) return;
      const requiredBulkAccountPermissions = ["accounts.roles.assign", "accounts.scopes.assign"];
      const missingPermission = requiredBulkAccountPermissions.find(permission => !hasRbac(admin, permission));
      if (missingPermission) {
        audit(admin, "permission_denied", "permission", missingPermission, "bulk_open_accounts");
        return send(res, 403, { error: "当前账号没有批量开通和配置账户的完整权限", permission: missingPermission });
      }
      const p = await bodyJson(req);
      const inputRows = Array.isArray(p.rows) ? p.rows : [];
      if (!inputRows.length) return send(res, 400, { error: "没有可处理的账户数据" });
      const errors = [];
      const seenEmployeeNos = new Set(), seenUsernames = new Set(), prepared = [];
      inputRows.forEach((raw, index) => {
        const rowNumber = Number(raw.rowNumber || index + 2);
        const employeeNo = String(raw.employeeNo || raw["员工工号"] || raw["工号"] || "").trim();
        const username = String(raw.username || raw["登录账号"] || raw["账号"] || "").trim();
        const password = String(raw.password || raw["初始密码"] || "").trim();
        const roleValues = importSelections(raw.roles || raw.role || raw["角色"] || raw["RBAC角色"]);
        const rowErrors = [];
        let scopes=[];
        try {
          if(raw["数据范围"])throw new Error("请使用分模块数据范围列，旧数据范围列已移除");
          if(raw.scopes !== undefined && !Array.isArray(raw.scopes)) throw Object.assign(new Error("数据范围必须使用分模块数组格式"),{status:400});
          let input=raw.scopes || [];
          if(!input.length)for(const module of SCOPE_MODULES){
            const value=raw[MODULE_LABELS[module]+"范围"];
            for(const token of importSelections(value || "本人")){
              const separator=token.search(/[:：]/), label=(separator<0?token:token.slice(0,separator)).trim(), path=separator<0?"":token.slice(separator+1).trim();
              const scopeType=accountImportScope(label)||({"指定行政班组":"specified_teams","指定班组":"specified_teams","指定人员分组":"specified_groups"}[label]||"");
              const specified=["specified_teams","specified_groups"].includes(scopeType);
              if(!specified&&path)throw new Error("该范围不接受组织路径");
              const scopeId=specified?resolveOrganizationPath(db,path,scopeType==="specified_teams"?"administrative_team":"personnel_group"):"";
              input.push({module,scopeType,scopeId,validFrom:raw[MODULE_LABELS[module]+"范围开始日期"],validTo:raw[MODULE_LABELS[module]+"范围结束日期"]});
            }
          }
          const scopedPerson=employeeNo?db.prepare("select id from personnel where employee_no=? and data_status='active'").get(employeeNo):null;
          scopes=personnelAccess.normalizeScopes(input,scopedPerson?.id||"");
        }catch(e){rowErrors.push(e.message);}

        if (!employeeNo) rowErrors.push("员工工号不能为空");
        else if (!isValidEmployeeNo(employeeNo)) rowErrors.push("员工工号必须为8位数字");
        if (!username) rowErrors.push("登录账号不能为空");
        if (!roleValues.length) rowErrors.push("至少选择一个角色");
        if (employeeNo && seenEmployeeNos.has(employeeNo)) rowErrors.push("工号在导入文件中重复");
        if (username && seenUsernames.has(username)) rowErrors.push("登录账号在导入文件中重复");
        seenEmployeeNos.add(employeeNo); seenUsernames.add(username);
        const person = employeeNo ? db.prepare("select * from personnel where employee_no=? and data_status='active'").get(employeeNo) : null;
        if (employeeNo && !person) rowErrors.push(db.prepare("select data_status from personnel where employee_no=?").get(employeeNo)?.data_status === "deleted" ? "该工号人员已删除，不能开通或恢复账户" : "未在人员主数据中找到该工号");
        if(person && !personnelAccess.allows(admin,"accounts",person.id)){errors.push({rowNumber,employeeNo,detail:"该行不在账户管理范围内"});return;}
        if (person && ["离职", "停职"].includes(person.employment_status)) rowErrors.push("离职或停职人员不能开通账户");
        const roleRows = roleValues.map(value => db.prepare("select id,code,name from rbac_roles where status='active' and (code=? or name=?)").get(value, value)).filter(Boolean);
        if (roleRows.length !== roleValues.length) rowErrors.push("包含不存在的角色");
        else { try { validateAccountRoleCombination(roleRows.map(role => role.code)); } catch (error) { rowErrors.push(error.message); } }
        const accountByPerson = person ? db.prepare("select * from users where person_id=?").get(person.id) : null;
        const accountByUsername = username ? db.prepare("select * from users where username=?").get(username) : null;
        if (accountByPerson && accountByPerson.username !== username) rowErrors.push(`该人员已关联账号 ${accountByPerson.username}`);
        if (accountByUsername && accountByUsername.person_id !== person?.id) rowErrors.push("登录账号已关联其他人员");
        const existing = accountByPerson || accountByUsername;
        if(existing)rowErrors.push("人员或登录账号已开通，请在账户管理中维护，不能通过批量开通覆盖");
        if (!existing && password.length < 6) rowErrors.push("新账户的初始密码至少6位");
        if (existing && password && password.length < 6) rowErrors.push("如需重置密码，新密码至少6位");
        if (rowErrors.length) errors.push({ rowNumber, employeeNo, username, detail: rowErrors.join("；") });
        else prepared.push({ person, username, password, roleRows, scopes, status: normalizeStatus(raw.status || raw["账户状态"] || raw["状态"]), existing });
      });
      if (errors.length) {
        audit(admin, "reject_bulk_open_accounts", "user", "bulk", JSON.stringify({ errors }));
        return send(res, 400, { error: `发现 ${errors.length} 行异常，未开通任何账户`, errors });
      }
      let created = 0, updated = 0;
      const updatedUserIds = [];
      db.exec("begin immediate");
      try {
        for (const item of prepared) {
          validateAccountIdentity({ personId: item.person.id }, item.existing);
          let userId = item.existing?.id || randomId("u");
          if (userId === SUPER_ACCOUNT_ID) throw Object.assign(new Error("批量开通不能修改唯一超级账号"), { status: 403 });
          if (item.existing) {
            db.prepare("update users set name=?,role='rbac',permissions='[]',allowed_tabs='[]',department=?,team=?,status=?,person_id=?,must_change_password=?,updated_at=? where id=?")
              .run(item.person.name, item.person.department || "未设置", item.person.home_team || "未设置", item.status, item.person.id, item.password ? 1 : Number(item.existing.must_change_password || 0), now(), userId);
            if (item.password) {
              const pass = hashPassword(item.password);
              db.prepare("update users set salt=?,password_hash=? where id=?").run(pass.salt, pass.hash, userId);
            }
            updatedUserIds.push(userId); updated++;
          } else {
            const pass = hashPassword(item.password);
            db.prepare("insert into users(id,username,name,role,salt,password_hash,permissions,allowed_tabs,department,team,function_category,status,person_id,must_change_password,credential_version,created_at,updated_at) values(?,?,?,'rbac',?,?,'[]','[]',?,?,?,?,?,1,1,?,?)")
              .run(userId, item.username, item.person.name, pass.salt, pass.hash, item.person.department || "未设置", item.person.home_team || "未设置", "维修", item.status, item.person.id, now(), now());
            created++;
          }
          db.prepare("delete from rbac_user_roles where user_id=?").run(userId);
          item.roleRows.forEach(role => db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)").run(userId, role.id, now()));
          db.prepare("delete from rbac_user_scopes where user_id=?").run(userId);
          item.scopes.forEach(scope=>{const hasGrant=(db.prepare("select count(*) as n from " + (db.kind === "postgres" ? "(select column_name as name from information_schema.columns where table_name='rbac_user_scopes' and column_name='grant_reason')" : "pragma_table_info('rbac_user_scopes')")).get().n===1);const sql=hasGrant?"insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at,grant_reason,granted_by) values(?,?,?,?,?,?,?,?,?,?,?)":"insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)";const args=hasGrant?[randomId("scope"),userId,scope.module,scope.scopeType,scope.scopeId,scope.validFrom,scope.validTo,now(),now(),String(scope.grantReason||"").slice(0,500),(admin||{}).id||""]:[randomId("scope"),userId,scope.module,scope.scopeType,scope.scopeId,scope.validFrom,scope.validTo,now(),now()];db.prepare(sql).run(...args);});
        }
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      updatedUserIds.forEach(userId => revokeUserSessions(userId, { bumpCredentialVersion: true }));
      audit(admin, "bulk_open_accounts", "user", "bulk", JSON.stringify({ created, updated }));
      return send(res, 201, { created, updated, skipped: 0, errors: [] });
    }

    send(res, 404, { error: "接口不存在" });
  } catch (error) {
    const status = error.status || (error.message?.includes("人员已删除，不能恢复或新增关联") ? 409 : 500);
    if (status >= 500) console.error(error);
    send(res, status, { error: error.message || "服务异常", ...(error.code === "MAINTENANCE_REPORT_CONFLICT" ? { code: error.code } : {}), ...(error.details || {}) });
  }
}
async function routeRequestMaintenance(req, res) {
  const url = new URL(req.url, "http://localhost");
  const method = req.method || "GET";
  if (["POST","PUT","DELETE"].includes(method) && url.pathname.startsWith("/api/personnel")) {
    // Refresh only after the master-data transaction and response succeeded.
    // Sync failures must not turn a committed import into a misleading failed response.
    res.once?.("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try { capabilityService.syncMaster(); } catch (error) { console.error("主数据已提交，能力快照待重试", error.message); }
      }
    });
  }
  try {
    if (["POST","PUT","PATCH","DELETE"].includes(method) && !sameOriginWrite(req))
      return send(res, 403, { error: "跨站或来源不明的写入请求已拒绝" });
    if(["POST","PUT","DELETE"].includes(method) && String(req.headers["content-type"] || "").includes("application/json"))await bodyJson(req);
    if (method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }
    if (method === "POST" && url.pathname === "/login") {
      const payload = await bodyForm(req);
      const address = loginAddress(req, { trustLocalProxy: process.env.TRUST_LOCAL_PROXY === "true" });
      const allowance = loginProtection.check(payload.username, address);
      if (!allowance.allowed) {
        res.writeHead(429, { "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(allowance.retryAfter), "Cache-Control": "no-store" });
        res.end("登录尝试过于频繁，请稍后再试");
        return;
      }
      const row = db.prepare("select * from users where username=?").get(payload.username || "");
      if (!row || !verifyPassword(payload.password || "", row) || (row.status || "active") === "disabled" || isDeletedAccountPerson(row)) {
        loginProtection.failure(payload.username, address);
        res.writeHead(303, { "Location": `/?login_error=${encodeURIComponent("账号或密码不正确")}`, "Cache-Control": "no-store" });
        res.end();
        return;
      }
      loginProtection.success(payload.username);
      const { sid } = createLoginSession(row);
      res.writeHead(303, {
        "Location": "/",
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookie(sid)
      });
      res.end();
      return;
    }
    if (!url.pathname.startsWith("/api/")) return serveStatic(req, res);

    if (url.pathname.startsWith('/api/attendance/')) {
      const actor = requireRbacPermission(req,res,'attendance.read'); if(!actor)return;
      const filters=Object.fromEntries(['month','query','department','team','personId'].map(k=>[k,url.searchParams.get(k)||'']));
      if(url.pathname.startsWith('/api/attendance/leave-balances')){
        const f={month:url.searchParams.get('month')||'',year:url.searchParams.get('year'),query:url.searchParams.get('query')||'',department:url.searchParams.get('department')||'',team:url.searchParams.get('team')||'',personId:url.searchParams.get('personId')||'',group:url.searchParams.get('group')||''};
        if(method==='GET'&&url.pathname==='/api/attendance/leave-balances'){const data=attendanceService.leave.snapshot(actor,f);if(attendanceService.config.approvalPlansEnabled){const plans=attendanceService.approvalPlanDetails(actor,{...f,month:f.month||undefined});data.approvalMonth=plans.month;const byId=new Map(plans.people.map(p=>[p.personId,p.approvalPlans]));data.people=data.people.map(p=>({...p,approvalPlans:byId.get(p.personId)||[]}));}return send(res,200,data);}
        if(method==='GET'&&url.pathname==='/api/attendance/leave-balances/details')return send(res,200,attendanceService.leave.details(actor,f));
        if(method==='POST'&&url.pathname==='/api/attendance/leave-balances/refresh')return send(res,202,attendanceService.leave.refresh(actor,await bodyJson(req)));
        if(method==='GET'&&['/api/attendance/leave-balances/export/xlsx','/api/attendance/leave-balances/export/html'].includes(url.pathname)){
          const scope=url.searchParams.get('scope')||'filtered';if(!['all','filtered'].includes(scope))return send(res,400,{error:'导出范围无效'});
          const selected=scope==='all'?{year:f.year}:f,data=attendanceService.leave.snapshot(actor,selected,'attendance.export');data.filters=selected;data.exportScope=scope==='all'?'全部有权查看人员':'当前筛选人员';data.exportedAt=new Date().toISOString();data.pageSize=attendanceService.displaySettings(actor).pageSize;
          if(url.pathname.endsWith('/html')&&attendanceService.config.approvalPlansEnabled){const plans=attendanceService.approvalPlanDetails(actor,{...selected,month:f.month||undefined});data.approvalMonth=plans.month;const byId=new Map(plans.people.map(p=>[p.personId,p.approvalPlans]));data.people=data.people.map(p=>({...p,approvalPlans:byId.get(p.personId)||[]}));}
          const format=url.pathname.endsWith('/xlsx')?'xlsx':'html',content=format==='xlsx'?leaveXlsx(data):Buffer.from(leaveHtml(data));audit(actor,'attendance_leave_export','attendance',String(data.year),JSON.stringify({format,scope,people:data.people.length}));
          return sendBinary(res,200,content,format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/html; charset=utf-8',{'Cache-Control':'no-store','Content-Disposition':`attachment; filename="leave-${data.year}.${format}"`});
        }
      }
      if(method==='GET'&&url.pathname==='/api/attendance/approval-plans')return send(res,200,attendanceService.approvalPlanDetails(actor,filters));
      if(method==='POST'&&url.pathname==='/api/attendance/approval-plans/refresh')return send(res,202,attendanceService.approvalPlanRefresh(actor,await bodyJson(req)));
      if(method==='GET' && url.pathname==='/api/attendance/display-settings')return send(res,200,attendanceService.displaySettings(actor));
      if(method==='POST' && url.pathname==='/api/attendance/display-settings')return send(res,200,attendanceService.saveDisplaySettings(actor,await bodyJson(req)));
      if(method==='GET' && url.pathname==='/api/attendance/status')return send(res,200,attendanceService.status(actor));
      if(method==='GET' && ['/api/attendance/days','/api/attendance/summary','/api/attendance/exceptions','/api/attendance/person'].includes(url.pathname)){
        const detailLevel=url.searchParams.get('view')||'full',timings=[];
        if(!['full','summary','compact'].includes(detailLevel))return send(res,400,{error:'考勤明细级别无效'});
        if(url.pathname.endsWith('/person')&&!filters.personId)return send(res,400,{error:'请选择人员'});
        const snapshot=attendanceViewerSnapshot(attendanceService.snapshot(actor,filters,url.pathname.endsWith('/summary')?'attendance.stats.read':'attendance.read',{detailLevel,onTiming:(name,ms)=>timings.push(`${name};dur=${ms.toFixed(1)}`)}),hasRbac(actor,'attendance.stats.read'));
        if(url.pathname.endsWith('/exceptions'))snapshot.people=snapshot.people.map(p=>({...p,days:(p.days||[]).filter(d=>!['未同步','未来日期','尚未到下班时间'].includes(d.category)&&(d.category==='待核对'||d.category==='缺卡'||d.issues.length||d.syncError))}));
        return send(res,200,snapshot,{'Server-Timing':timings.join(', ')});
      }
      if(method==='POST' && url.pathname==='/api/attendance/approval-reasons/backfill')return send(res,202,attendanceService.enqueueApprovalReasons(actor,await bodyJson(req)));
      if(method==='POST' && url.pathname==='/api/attendance/leave-types/refresh')return send(res,200,await attendanceService.refreshLeaveTypes(actor));
      if(method==='POST' && url.pathname==='/api/attendance/sync'){
        const payload=await bodyJson(req);return send(res,202,attendanceService.enqueue({from:payload.from,to:payload.to,user:actor}));
      }
      if(method==='GET' && url.pathname==='/api/attendance/capability-statuses')return send(res,200,attendanceService.capabilityStatuses(actor,filters.personId));
      if(method==='GET' && ['/api/attendance/export/xlsx','/api/attendance/export/html'].includes(url.pathname)){
        if(!hasRbac(actor,'attendance.export'))return send(res,403,{error:'当前账号没有导出权限'});
        const exportScope=url.searchParams.get('scope')||'filtered';if(!['all','filtered'].includes(exportScope))return send(res,400,{error:'导出范围无效'});
        const selected=exportScope==='all'?{month:filters.month}:filters;
        if(exportScope==='filtered'&&url.searchParams.has('categories')){
          let categories;try{categories=JSON.parse(url.searchParams.get('categories'));}catch{return send(res,400,{error:'类别筛选格式无效'});}
          if(!Array.isArray(categories)||categories.length>100||categories.some(c=>typeof c!=='string'||!c.trim()||c.length>100))return send(res,400,{error:'类别筛选格式无效'});
          selected.categories=[...new Set(categories)];
        }
        const snapshot=attendanceService.snapshot(actor,selected,'attendance.export');
        if(url.pathname.endsWith('/html')&&attendanceService.config.approvalPlansEnabled){snapshot.people=snapshot.people.map(p=>attendanceService.approvalPlans.decorate(p,snapshot.month));snapshot.categories=attendanceOrderedCategories([...new Set([...snapshot.categories,...snapshot.people.flatMap(p=>Object.keys(p.pendingCounts||{}))])]);}
        snapshot.exportScope=exportScope==='all'?'全部有权查看人员':'当前筛选人员';snapshot.filters=selected;
        const format=url.pathname.endsWith('/xlsx')?'xlsx':'html';
        const body=format==='xlsx'?attendanceXlsx(snapshot,{changes:attendanceService.changes(actor,{...selected,month:snapshot.month}),runs:attendanceService.status(actor).runs}):Buffer.from(attendanceHtml(snapshot));
        audit(actor,'attendance_export','attendance',snapshot.month,JSON.stringify({format,people:snapshot.people.length,scope:exportScope}));
        return sendBinary(res,200,body,format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/html; charset=utf-8',{'Cache-Control':'no-store','Content-Disposition':`attachment; filename="attendance-${snapshot.month}.${format}"`});
      }
      return send(res,404,{error:'未找到考勤接口'});
    }
    if (method === "GET" && url.pathname === "/api/health") {
      let database = "unavailable";
      try {
        db.prepare("select 1 as ok").get();
        database = db.kind || "unknown";
      } catch {}
      return send(res, 200, {
        ok: true,
        status: database === "unavailable" ? "degraded" : "ok",
        service: "muc-online-app",
        version: appVersion,
        environment: isLocalDevelopment ? 'development-'+process.env.MUC_LOCAL_DEVELOPMENT_PROFILE : process.env.MUC_INTEGRATION === 'true' ? 'integration' : isProduction ? 'production' : 'test',
        buildSha: /^[0-9a-f]{40}$/.test(process.env.MUC_BUILD_SHA||'') ? process.env.MUC_BUILD_SHA : null,
        database,
        cos: cosEnabled() ? "configured" : "disabled",
        startedAt: serviceStartedAt,
        time: new Date().toISOString()
      });
    }
    if (method === "GET" && url.pathname === "/api/me") {
      const user = currentUser(req);
      if (!user.id) return send(res, 401, { error: "请先登录" });
      return send(res, 200, { user });
    }
    if (method === "POST" && url.pathname === "/api/login") {
      const payload = await bodyJson(req);
      const address = loginAddress(req, { trustLocalProxy: process.env.TRUST_LOCAL_PROXY === "true" });
      const allowance = loginProtection.check(payload.username, address);
      if (!allowance.allowed) return send(res, 429, { error: "登录尝试过于频繁，请稍后再试" }, { "Retry-After": String(allowance.retryAfter) });
      const row = db.prepare("select * from users where username=?").get(payload.username || "");
      if (!row || !verifyPassword(payload.password || "", row)) {
        loginProtection.failure(payload.username, address);
        audit(null, "login_failed", "user", String(payload.username || "guest"), "invalid_credentials");
        return send(res, 401, { error: "账号或密码不正确" });
      }
      if ((row.status || "active") === "disabled" || isDeletedAccountPerson(row)) {
        loginProtection.failure(payload.username, address);
        return send(res, 403, { error: "账号已停用或人员已删除" });
      }
      loginProtection.success(payload.username);
      const { sid, user } = createLoginSession(row);
      return send(res, 200, { user }, { "Set-Cookie": sessionCookie(sid) });
    }
    if (method === "POST" && url.pathname === "/api/change-password") {
      const login = requireLogin(req, res);
      if (!login) return;
      const payload = await bodyJson(req);
      const oldPassword = String(payload.oldPassword || "");
      const newPassword = String(payload.newPassword || "");
      if (!oldPassword || !newPassword || newPassword.length < 6) {
        return send(res, 400, { error: "请填写旧密码和至少6位新密码" });
      }
      const row = db.prepare("select * from users where id=?").get(login.id);
      if (!row || (row.status || "active") === "disabled" || !verifyPassword(oldPassword, row)) {
        return send(res, 401, { error: "旧密码不正确" });
      }
      const pass = hashPassword(newPassword);
      db.prepare("update users set salt=?,password_hash=?,must_change_password=0,credential_version=coalesce(credential_version,1)+1,updated_at=? where id=?").run(pass.salt, pass.hash, now(), row.id);
      db.prepare("delete from sessions where user_id=?").run(row.id);
      for (const [sid, savedUserId] of sessions.entries()) {
        if (savedUserId === row.id) sessions.delete(sid);
      }
      audit(toUser(row), "change_password", "user", row.id, row.username);
      return send(res, 200, { ok: true });
    }
    if (method === "POST" && url.pathname === "/api/logout") {
      const sid = parseCookies(req)[sessionCookieName];
      if (sid) {
        sessions.delete(sid);
        db.prepare("delete from sessions where id=?").run(sid);
      }
      return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
    }

    const passwordGateUser = currentUser(req);
    if (passwordGateUser.id && passwordGateUser.mustChangePassword) {
      return send(res, 428, { error: "首次登录或密码重置后必须先修改密码", code: "PASSWORD_CHANGE_REQUIRED" });
    }

    if(method==="GET" && url.pathname==="/api/personnel/directory"){
      const user=requireLogin(req,res);if(!user)return;
      return send(res,200,personnelAccess.directory(user,url.searchParams.get("purpose"),url.searchParams));
    }
    const orgRoute=url.pathname.match(/^\/api\/personnel\/organizations(?:\/([^/]+))?$/);
    if(orgRoute){
      const user=requireLogin(req,res);if(!user)return;
      if(method==="GET") return send(res,200,{organizations:personnelAccess.organizations(user).map(o=>({...o,referenceCount:personnelAccess.hasAll(user,"personnel")?personnelAccess.orgReferences(o.id):undefined}))});
      if(!["POST","PUT","DELETE"].includes(method))return send(res,405,{error:"不支持的操作"});
      return send(res,method==="POST"?201:200,personnelAccess.mutateOrganization(user,method,orgRoute[1]?routeParam(orgRoute[1]):"",await bodyJson(req)));
    }
    if (url.pathname.startsWith("/api/capability/")) {
      const capabilityViewPermissions = ["capability.overview.view", "capability.allocation.view", "capability.status.view", "capability.history.view", "capability.scenario.view", "capability.report.view"];
      const actor = requireAnyRbacPermission(req, res, capabilityViewPermissions);
      if (!actor) return;
      capabilityService.syncMaster();
      capabilityService.schedule();
      const space = url.searchParams.get("workspace") || "";
      if (method === "GET" && url.pathname === "/api/capability/workspaces") return send(res, 200, { items:capabilityService.spaces(actor),organizationIssues:capabilityService.organizationIssues(actor),nonParticipants:capabilityService.nonParticipants(actor),readiness:capabilityService.readiness(),masterDataVersion:capabilityService.masterRevision(),capabilityVersion:capabilityService.revision() });
      if (method === "GET" && url.pathname === "/api/capability/snapshot") return send(res, 200, capabilityService.snapshot(actor, space));
      const capabilityAuthorizationRoute=url.pathname.match(/^\/api\/capability\/personnel\/([^/]+)\/authorizations$/);
      if(method==="GET"&&capabilityAuthorizationRoute)return send(res,200,capabilityService.personAuthorizations(actor,space,routeParam(capabilityAuthorizationRoute[1]),url.searchParams.get("category")||"",url.searchParams.get("q")||""));
      if (method === "GET" && url.pathname === "/api/capability/reports") return send(res, 200, capabilityService.report(actor, space));
      if (method === "POST" && url.pathname === "/api/capability/commands") {
        const payload = await bodyJson(req);
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) return send(res, 400, { error: "能力操作请求格式无效" });
        return send(res, 200, capabilityService.command(actor, space, payload.operation, payload));
      }
      if (method === "GET" && url.pathname === "/api/capability/events") {
        res.writeHead(200, { ...securityHeaders(), "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        let lastVersion = "";
        const push = () => {
          const fresh = currentUser(req);
          if (!fresh?.id || !hasAnyRbac(fresh, capabilityViewPermissions)) {
            res.write('event: access-revoked\ndata: {}\n\n'); res.end(); return;
          }
          const version = JSON.stringify({ revision: capabilityService.revision(), masterDataVersion: capabilityService.masterRevision() });
          if (version === lastVersion) { res.write(': heartbeat\n\n'); return; }
          lastVersion = version;
          res.write(`data: ${version}\n\n`);
        };
        push(); const unsubscribe = capabilityService.subscribe(push);
        // The service listener handles same-process changes immediately.  The
        // short revision poll also propagates commits made by another server
        // process that shares the centre database.
        const heartbeat = setInterval(push, 3000); heartbeat.unref?.();
        res.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
        return;
      }
      return send(res, 404, { error: "能力配置接口不存在" });
    }
    if (method === "GET" && url.pathname === "/api/personnel") {
      const manager = requireRbacPermission(req, res, "personnel.list.view");
      if (!manager) return;
      return send(res, 200, publicPersonnelPage(url.searchParams));
    }
    if (method === "GET" && url.pathname === "/api/personnel/authorizations/overview") {
      const viewer = requireRbacPermission(req, res, "personnel.list.view");
      if (!viewer) return;
      if (!hasRbac(viewer, "personnel.qualification.view")) return send(res, 403, { error: "当前账号没有查看人员授权的权限" });
      return send(res, 200, publicPersonnelAuthorizationOverview(url.searchParams, viewer));
    }
    if (method === "POST" && url.pathname === "/api/personnel") {
      const manager = requireRbacPermission(req, res, "personnel.profile.create");
      if (!manager) return;
      const payload = await bodyJson(req);
      const deprecated=["gender","age","demandUnit","highestEducation","englishLevel","entryChannel","dispatchFlag","workshop","workshopId","personnelCategory","personnelCategoryId"];
      const suppliedDeprecated=deprecated.filter(key=>Object.hasOwn(payload,key));
      if(suppliedDeprecated.length)return send(res,400,{error:`人员字段已停用：${suppliedDeprecated.join("、")}`});
      const employeeNo = String(payload.employeeNo || "").trim();
      const name = String(payload.name || "").trim();
      if (!employeeNo || !name) return send(res, 400, { error: "工号和姓名为必填项" });
      if (!isValidEmployeeNo(employeeNo)) return send(res, 400, { error: "工号必须为8位数字" });
      const sameEmployee = db.prepare("select id,data_status from personnel where employee_no=?").get(employeeNo);
      if (sameEmployee) return send(res, 409, { error: sameEmployee.data_status === "deleted" ? "该工号人员已删除，不能重新录入或恢复" : "该工号已存在" });
      db.exec("begin immediate");
      try {
      if(db.kind==="postgres")db.exec("select pg_advisory_xact_lock(54002010,31)");
      const org=personnelAccess.checkMutation(manager,payload);
      const personId = randomId("person");
      const department=org.department||"";
      const homeTeam=org.home_team||"";
      const position = String(payload.position || "").trim();
      const employmentStatus = String(payload.employmentStatus || "在职").trim() || "在职";
      if(!["在职","停职","离职"].includes(employmentStatus))throw Object.assign(new Error("在职状态无效"),{status:400});
      db.prepare(`insert into personnel(id,employee_no,name,department,home_team,is_instructor,position_code,actual_grade,employment_status,source_batch_id,data_status,created_at,updated_at)
        values(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(personId, employeeNo, name, department, homeTeam, payload.isInstructor ? 1 : 0, position, String(payload.actualGrade || ""), employmentStatus, "manual", "active", now(), now());
      personnelAccess.saveOrganization(personId,org);
      db.prepare("insert into personnel_organization_history(id,person_id,department_id,personnel_group_id,administrative_team_id,changed_at) values(?,?,?,?,?,?)").run(randomId("org-history"),personId,org.department_id,org.personnel_group_id,org.administrative_team_id,now());
      dictionaryValue("department", "", org.department, "manual");
      dictionaryValue("position", "", position, "manual");
      dictionaryValue("employment_status", "", employmentStatus, "manual");
      audit(manager, "create_personnel_manual", "personnel", personId, JSON.stringify({ employeeNo, name }));
      db.exec("commit");
      return send(res, 201, { person: publicPersonnelList().find(item => item.id === personId) });
      } catch(error){db.exec("rollback");throw error;}
    }
    if (method === "GET" && url.pathname === "/api/personnel/dictionaries") {
      const manager = requireRbacPermission(req, res, "personnel.list.view");
      if (!manager) return;
      const values = []; // Values derived from personnel/imports must not expose out-of-scope personal attributes.
      if(hasRbac(manager,"personnel.qualification.view")) values.push(...authorizationProjects.dictionaries());
      return send(res, 200, { values });
    }
    const projectRoute = url.pathname.match(/^\/api\/personnel\/authorization-projects(?:\/([^/]+))?$/);
    if (projectRoute) {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (method === "GET" && !projectRoute[1]) {
        if (!hasAnyRbac(manager, ["personnel.qualification.view", "personnel.qualification.manage"])) return send(res, 403, { error: "没有查看授权项目的权限" });
        return send(res, 200, authorizationProjects.list(url.searchParams));
      }
      if (!hasRbac(manager, "personnel.qualification.manage")) {
        audit(manager, method === "DELETE" ? "reject_delete_authorization_project" : "deny_authorization_project_write", "authorizationProject", projectRoute[1] ? routeParam(projectRoute[1]) : "", "缺少人员资质维护权限");
        return send(res, 403, { error: "没有维护授权项目的权限" });
      }
      const id = projectRoute[1] ? routeParam(projectRoute[1]) : "";
      if (method === "POST" && id === "import") return send(res, 200, authorizationProjects.importRows(await bodyJson(req), manager));
      if (method === "POST" && !id) return send(res, 201, { project: authorizationProjects.create(await bodyJson(req), manager) });
      if (method === "PUT" && id === "categories") return send(res, 200, authorizationProjects.updateCategories(await bodyJson(req), manager));
      if (method === "PUT" && id) return send(res, 200, { project: authorizationProjects.update(id, await bodyJson(req), manager) });
      if (method === "DELETE" && id) return send(res, 200, authorizationProjects.remove(id, manager));
      return send(res, 405, { error: "不支持的授权项目操作" });
    }
    const deletionPreviewRoute = url.pathname.match(/^\/api\/personnel\/([^/]+)\/deletion-preview$/);
    if (deletionPreviewRoute && method === "GET") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      return send(res, 200, personnelDeletion.preview(routeParam(deletionPreviewRoute[1]), manager));
    }
    const personnelDetailRoute = url.pathname.match(/^\/api\/personnel\/([^/]+)$/);
    if (personnelDetailRoute && method === "DELETE") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      return send(res, 200, personnelDeletion.remove(routeParam(personnelDetailRoute[1]), await bodyJson(req), manager));
    }
    if (personnelDetailRoute && method === "GET" && !["imports", "dictionaries"].includes(routeParam(personnelDetailRoute[1]))) {
      const manager = requireRbacPermission(req, res, "personnel.detail.view");
      if (!manager) return;
      const personId = routeParam(personnelDetailRoute[1]);
      const person = publicPersonnelList().find(item => item.id === personId);
      if (!person) return send(res, 404, { error: "未找到人员" });
      const canReadQualifications = hasRbac(manager, "personnel.qualification.view");
      const englishLevels = canReadQualifications
        ? [...new Set(db.prepare(`select license_english_level from personnel_licenses
          where person_id=? and coalesce(data_status,'active')='active'
          and lower(trim(coalesce(is_valid,''))) in ('是','有效','true','1')`)
          .all(personId).map(row => String(row.license_english_level || "").trim()).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }))
        : undefined;
      const qualificationCounts = canReadQualifications ? {
        license: Number(db.prepare("select count(*) as count from personnel_licenses where person_id=? and coalesce(data_status,'active')='active'").get(personId).count),
        authorization: Number(db.prepare("select count(*) as count from personnel_authorizations where person_id=? and coalesce(data_status,'active')='active'").get(personId).count),
        training: Number(db.prepare("select count(*) as count from personnel_training_records where person_id=? and coalesce(data_status,'active')='active'").get(personId).count)
      } : { license: 0, authorization: 0, training: 0 };
      const authorizationCategoryCounts = canReadQualifications
        ? Object.assign({ release: 0, test_run: 0, maintenance: 0, special: 0, third_party: 0, other: 0 }, Object.fromEntries(db.prepare(`select c.project_category as category,count(*) as count
          from personnel_authorizations a join capability_catalog c on c.project_code=a.project_code
          where a.person_id=? and coalesce(a.data_status,'active')='active' and c.project_category in ('release','test_run','maintenance','special','third_party','other')
          group by c.project_category`).all(personId).map(row => [row.category, Number(row.count)])))
        : undefined;
      return send(res, 200, { person, qualificationCounts, qualificationVisible: canReadQualifications, ...(canReadQualifications ? { authorizationCategoryCounts, englishLevels } : {}) });
    }
    if (personnelDetailRoute && method === "PUT" && !["imports", "dictionaries"].includes(routeParam(personnelDetailRoute[1]))) {
      const manager = requireLogin(req, res);
      if (!manager) return;
      const personId = routeParam(personnelDetailRoute[1]);
      const person = personnelAccess.requirePerson(manager,"personnel",personId,true);
      const payload = await bodyJson(req);
      updatePersonnel(person, payload, manager);
      return send(res, 200, { person: publicPersonnelList().find(item => item.id === personId) });
    }
    const personnelChangesRoute = url.pathname.match(/^\/api\/personnel\/([^/]+)\/changes$/);
    if (personnelChangesRoute && method === "GET") {
      const manager = requireRbacPermission(req, res, "personnel.audit.view");
      if (!manager) return;
      const personId = routeParam(personnelChangesRoute[1]);
      personnelAccess.requirePerson(manager,"personnel",personId);
      const changes = db.prepare(`select id,field_name as fieldName,field_label as fieldLabel,old_value as oldValue,new_value as newValue,
        source_type as sourceType,source_batch_id as sourceBatchId,reason,operator_id as operatorId,operator_name as operatorName,created_at as createdAt
        from personnel_change_logs where person_id=? order by created_at desc limit 200`).all(personId);
      const visibleChanges = changes
        .filter(row => hasRbac(manager,"personnel.qualification.view") || !/^(license|authorization|training)\./.test(row.fieldName))
        .map(row => SENSITIVE_FIELDS.includes(row.fieldName) && !personnelAccess.canViewActualGrade(manager, personId)
          ? { ...row, oldValue:"***", newValue:"***", masked:true }
          : { ...row, masked:false });
      return send(res, 200, { changes: visibleChanges });
    }
    const qualificationListRoute = url.pathname.match(/^\/api\/personnel\/([^/]+)\/qualifications$/);
    if (qualificationListRoute && method === "GET") {
      const manager = requireRbacPermission(req, res, "personnel.qualification.view");
      if (!manager) return;
      const personId = routeParam(qualificationListRoute[1]);
      personnelAccess.requirePerson(manager, "personnel", personId);
      const type = String(url.searchParams.get("type") || "authorization");
      if (!["license", "authorization", "training"].includes(type)) return send(res, 400, { error: "资质类型无效" });
      const positive = (value, fallback) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
      const pageSize = Math.min(100, positive(url.searchParams.get("pageSize"), 20));
      const requestedPage = positive(url.searchParams.get("page"), 1);
      const q = String(url.searchParams.get("q") || "").trim().toLowerCase().replace(/[!%_]/g, "!$&"), pattern = `%${q}%`;
      let where, args, select, order, facets = {};
      if (type === "authorization") {
        const category = String(url.searchParams.get("category") || "").trim(), status = String(url.searchParams.get("status") || "").trim();
        const validCategories = ["release", "test_run", "maintenance", "special", "third_party", "other"];
        if (category && !validCategories.includes(category)) return send(res, 400, { error: "授权项目分类无效" });
        where = "from personnel_authorizations a left join capability_catalog c on c.project_code=a.project_code where a.person_id=? and coalesce(a.data_status,'active')='active' and (lower(a.project_code) like ? escape '!' or lower(coalesce(c.project_name,a.project_name,'')) like ? escape '!' or lower(coalesce(a.authorization_type,'')) like ? escape '!' or lower(coalesce(a.authorization_unit,'')) like ? escape '!')";
        args = [personId, pattern, pattern, pattern, pattern];
        if (category) { where += " and c.project_category=?"; args.push(category); }
        if (status) { where += " and a.authorization_status=?"; args.push(status); }
        select = `select a.id,a.project_code as projectCode,case when c.status='active' and trim(c.project_name)<>'' then c.project_name else '待配置名称（' || a.project_code || '）' end as projectName,
          c.project_category as category,case c.project_category when 'release' then '放行' when 'test_run' then '试车' when 'maintenance' then '维修' when 'special' then '专项' when 'third_party' then '三方' when 'other' then '其他' else '待分类' end as categoryLabel,
          coalesce(c.third_party_company,'') as thirdPartyCompany,
          a.authorization_type as authorizationType,a.authorization_unit as authorizationUnit,a.authorized_at as authorizedAt,a.authorization_expires_at as authorizationExpiresAt,a.authorization_status as authorizationStatus`;
        order = " order by c.project_category,a.project_code,a.authorization_unit";
        facets = {
          categories: Object.fromEntries(db.prepare(`select c.project_category as category,count(*) as count ${where.replace(/ and c\.project_category=\?/, "").replace(/ and a\.authorization_status=\?/, "")} group by c.project_category`).all(...[personId, pattern, pattern, pattern, pattern]).map(row => [row.category || "", Number(row.count)])),
          statuses: db.prepare("select distinct authorization_status as value from personnel_authorizations where person_id=? and coalesce(data_status,'active')='active' and trim(coalesce(authorization_status,''))<>'' order by authorization_status").all(personId).map(row => row.value)
        };
      } else if (type === "license") {
        where = "from personnel_licenses where person_id=? and coalesce(data_status,'active')='active' and (lower(coalesce(license_no,'')) like ? escape '!' or lower(coalesce(license_type,'')) like ? escape '!')";
        args = [personId, pattern, pattern];
        select = "select id,license_no as licenseNo,license_type as licenseType,license_english_level as licenseEnglishLevel,issued_at as issuedAt,renewed_at as renewedAt,expires_at as expiresAt,is_valid as isValid,remark";
        order = " order by license_type,expires_at";
      } else {
        where = "from personnel_training_records where person_id=? and coalesce(data_status,'active')='active' and (lower(coalesce(course_code,'')) like ? escape '!' or lower(coalesce(course_name,'')) like ? escape '!')";
        args = [personId, pattern, pattern];
        select = "select id,course_code as courseCode,course_name as courseName,course_version as courseVersion,course_nature as courseNature,started_at as startedAt,completed_at as completedAt,training_result as trainingResult,attendance_status as attendanceStatus,qualification_status as qualificationStatus,class_no as classNo";
        order = " order by started_at desc,course_code";
      }
      const total = Number(db.prepare(`select count(*) as count ${where}`).get(...args).count), page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
      const items = db.prepare(`${select} ${where}${order} limit ? offset ?`).all(...args, pageSize, (page - 1) * pageSize);
      return send(res, 200, { items, total, page, pageSize, facets });
    }
    const qualificationRoute = url.pathname.match(/^\/api\/personnel\/([^/]+)\/qualifications\/(license|authorization|training)\/([^/]+)$/);
    if (qualificationRoute && ["PUT", "DELETE"].includes(method)) {
      const manager = requireRbacPermission(req, res, "personnel.qualification.manage");
      if (!manager) return;
      const personId = routeParam(qualificationRoute[1]), kind = qualificationRoute[2], recordId = routeParam(qualificationRoute[3]);
      const person = personnelAccess.requirePerson(manager,"personnel",personId,true);
      const payload = await bodyJson(req);
      changeQualification(person, kind, recordId, payload, manager, method === "DELETE");
      return send(res, 200, { ok: true });
    }
    if (method === "GET" && url.pathname === "/api/personnel/imports") {
      const manager = requireRbacPermission(req, res, "personnel.import.view");
      if (!manager) return;
      const rows = db.prepare("select id,import_type,import_type as importType,file_name as fileName,status,rows_json,summary_json as summaryJson,created_by,created_by_name as createdByName,created_at as createdAt from personnel_import_batches order by created_at desc,id desc").all();
      const context = importHistoryContext(db,personnelAccess,manager,rows,importEmployeeNo);
      const visible = rows.filter(row=>visibleImportBatch(row,manager,context));
      const page = Math.max(1,Number.parseInt(url.searchParams.get('page')||'1',10)||1);
      const pageSize = Math.max(1,Math.min(100,Number.parseInt(url.searchParams.get('pageSize')||'50',10)||50));
      const batches = visible.slice((page-1)*pageSize,page*pageSize).map(row => ({ id:row.id,importType:row.importType,fileName:row.fileName,status:row.status,createdAt:row.createdAt,createdByName:row.createdByName,summary: json(row.summaryJson, {}) }));
      const summary = visible.reduce((result,row)=>{result.pending += Number(row.status==='pending');result.errors += Number(json(row.summaryJson,{}).errors||0);return result;},{pending:0,errors:0});
      return send(res, 200, { batches,total:visible.length,page,pageSize,summary });
    }
    if (method === "POST" && url.pathname === "/api/personnel/imports") {
      const manager = requireRbacPermission(req, res, "personnel.import.execute");
      if (!manager) return;
      const payload = await bodyJson(req);
      const type = String(payload.type || "");
      if (!personnelImportTypes.has(type)) return send(res, 400, { error: "导入类别无效" });
      const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
      if (!rawRows.length) return send(res, 400, { error: "导入文件没有内容" });
      const rawHeaders = Array.isArray(rawRows[0]) ? rawRows[0].map(normalizedHeader) : Object.keys(rawRows[0] || {}).map(normalizedHeader);
      if(type==="authorization"){const unknown=rawHeaders.filter(h=>!AUTHORIZATION_HEADERS.includes(h));if(unknown.length)return send(res,400,{error:"授权模板不支持列："+unknown.join("、")});}
      const missingGroups = importRequiredHeaders(type).filter(group => !group.some(name => rawHeaders.includes(normalizedHeader(name))));
      if (missingGroups.length) return send(res, 400, { error: `缺少必填列：${missingGroups.map(group => group.join("/")).join("、")}` });
      const rows = tabularRowsToObjects(rawRows, payload.rowNumbers);
      if (!rows.length) return send(res, 400, { error: "文件只有表头，没有可导入的数据记录" });
      db.exec("begin immediate");
      try {
      if(db.kind==="postgres")db.exec("select pg_advisory_xact_lock(54002010,31)");
      validatePersonnelImportAccess(type,rows,manager);
      const analysis = analyzePersonnelImport(type, rows);
      const replacement=type==="authorization"?authorizationImport.preview(rows):undefined;
      const id = randomId("pimport");
      const fileHash = crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
      db.prepare("insert into personnel_import_batches(id,import_type,file_name,file_hash,status,rows_json,summary_json,created_by,created_by_name,confirmed_by,confirmed_at,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, type, String(payload.fileName || ""), fileHash, "pending", JSON.stringify(rows), JSON.stringify({ total: analysis.total, valid: analysis.valid, errors: analysis.errors, warnings: analysis.warnings, ...(replacement?{replacement}:{}) }), manager.id, manager.name, "", "", now(), now());
      insertImportIssues(id, analysis.issues);
      audit(manager, "stage_personnel_import", "personnelImport", id, JSON.stringify({ type, total: rows.length, errors: analysis.errors, warnings: analysis.warnings, ...(replacement?{replacement}:{}) }));
      db.exec("commit");
      return send(res, 201, { batch: { id, importType: type, fileName: String(payload.fileName || ""), status: "pending", summary: { total: analysis.total, valid: analysis.valid, errors: analysis.errors, warnings: analysis.warnings, ...(replacement?{replacement}:{}) }, issues: analysis.issues } });
      }catch(e){db.exec("rollback");throw e;}
    }
    const workspaceRoute=url.pathname.match(/^\/api\/personnel\/imports\/([^/]+)\/workspace$/);
    if(workspaceRoute && ["GET","POST"].includes(method)) {
      const manager=requireRbacPermission(req,res,method==="GET"?"personnel.import.view":"personnel.import.execute");if(!manager)return;
      const workspace=createImportWorkspace({db,permission:personnelAccess.permission,hasAll:user=>personnelAccess.hasAll(user,"personnel"),visible:visibleImportBatch,employeeNo:importEmployeeNo,findPerson:findImportedPerson,analyze:analyzePersonnelImport,validateAccess:validatePersonnelImportAccess,preview:authorizationImport.preview,projects:authorizationProjects,audit,now,insertIssues:insertImportIssues});
      const id=routeParam(workspaceRoute[1]);
      return send(res,200,{workspace:method==="GET"?workspace.view(id,manager):workspace.mutate(id,await bodyJson(req),manager)});
    }
    const personnelImportRoute = url.pathname.match(/^\/api\/personnel\/imports\/([^/]+)$/);
    if (personnelImportRoute && method === "GET") {
      const manager = requireRbacPermission(req, res, "personnel.import.view");
      if (!manager) return;
      const id = routeParam(personnelImportRoute[1]);
      const batch = db.prepare("select * from personnel_import_batches where id=?").get(id);
      if (!batch || !visibleImportBatch(batch,manager)) return send(res, 404, { error: "未找到导入批次" });
      const issues = db.prepare("select id,row_number as rowNumber,issue_type as issueType,severity,employee_no as employeeNo,detail,status,resolution from personnel_import_issues where batch_id=? order by row_number,id").all(id);
      return send(res, 200, { batch: { id: batch.id, importType: batch.import_type, fileName: batch.file_name, status: batch.status, summary: json(batch.summary_json, {}), issues, createdAt: batch.created_at, confirmedAt: batch.confirmed_at } });
    }
    const personnelImportActionRoute = url.pathname.match(/^\/api\/personnel\/imports\/([^/]+)\/(confirm|cancel)$/);
    if (personnelImportActionRoute && method === "POST") {
      const manager = requireRbacPermission(req, res, "personnel.import.execute");
      if (!manager) return;
      const id = routeParam(personnelImportActionRoute[1]);
      const action = personnelImportActionRoute[2];
      const batch = db.prepare("select * from personnel_import_batches where id=?").get(id);
      if (!batch || !visibleImportBatch(batch,manager)) return send(res, 404, { error: "未找到导入批次" });
      if (action === "cancel") {
        if(batch.created_by!==manager.id && !personnelAccess.hasAll(manager,"personnel"))return send(res,403,{error:"只能取消本人创建的批次"});
        if (batch.status !== "pending") return send(res, 409, { error: "当前批次不能取消" });
        db.prepare("update personnel_import_batches set status='cancelled',updated_at=? where id=?").run(now(), id);
        audit(manager, "cancel_personnel_import", "personnelImport", id, batch.import_type);
        return send(res, 200, { ok: true });
      }
      const result = confirmPersonnelImport(batch, manager, await bodyJson(req));
      let capabilitySync = "ready", capabilitySyncMessage = "";
      try { capabilityService.syncMaster(); }
      catch (error) { capabilitySync = "pending"; capabilitySyncMessage = error.message; console.error("人员主数据已提交，能力数据待刷新", error.message); }
      return send(res, 200, { ok: true, result, personnel: batch.import_type === "personnel" ? publicPersonnelList() : undefined, capabilitySync, capabilitySyncMessage, masterDataVersion: capabilityService.masterRevision(), capabilityVersion: capabilityService.revision() });
    }

    if (method === "GET" && url.pathname === "/api/admin/rbac") {
      const manager = requireRbacPermission(req, res, "roles.read");
      if (!manager) return;
      const permissions = db.prepare("select code,name,module from rbac_permissions order by module,code").all();
      const rolesOut = db.prepare("select * from rbac_roles where status='active' order by system_role desc,name,code").all().map(publicRbacRole);
      return send(res, 200, { roles: rolesOut, permissions });
    }
    if (method === "POST" && url.pathname === "/api/admin/roles") {
      const manager = requireRbacPermission(req, res, "roles.manage");
      if (!manager) return;
      const payload = validatedRolePayload(await bodyJson(req));
      const roleId = randomId("role");
      const code = `custom_${crypto.randomBytes(8).toString("hex")}`;
      db.exec("begin immediate");
      try {
        db.prepare("insert into rbac_roles(id,code,name,description,system_role,status,created_at,updated_at) values(?,?,?,?,0,'active',?,?)")
          .run(roleId, code, payload.name, payload.description, now(), now());
        replaceRolePermissions(roleId, payload.permissionRows);
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      audit(manager, "create_role", "role", roleId, JSON.stringify({ name: payload.name, permissions: payload.permissionRows.map(item => item.code) }));
      return send(res, 201, { role: publicRbacRole(db.prepare("select * from rbac_roles where id=?").get(roleId)) });
    }
    const roleManageRoute = url.pathname.match(/^\/api\/admin\/roles\/([^/]+)$/);
    if (roleManageRoute && method === "PUT") {
      const manager = requireRbacPermission(req, res, "roles.manage");
      if (!manager) return;
      const roleId = routeParam(roleManageRoute[1]);
      const existing = db.prepare("select * from rbac_roles where id=? and status='active'").get(roleId);
      if (!existing) return send(res, 404, { error: "未找到角色" });
      if (existing.code === "system_admin") return send(res, 403, { error: "系统管理员角色必须保持全部权限，不允许修改" });
      if (existing.system_role && manager.id !== SUPER_ACCOUNT_ID) return send(res, 403, { error: "只有超级管理员54002010可以调整系统预置角色" });
      const payload = validatedRolePayload(await bodyJson(req), roleId);
      const before = publicRbacRole(existing);
      db.exec("begin immediate");
      try {
        db.prepare("update rbac_roles set name=?,description=?,updated_at=? where id=?").run(payload.name, payload.description, now(), roleId);
        replaceRolePermissions(roleId, payload.permissionRows);
        if (existing.system_role) setSetting(`rbacRoleControlledEdit:${existing.code}`, true);
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      const affectedUserIds = revokeRoleUserSessions(roleId);
      audit(manager, existing.system_role ? "controlled_update_system_role" : "update_role", "role", roleId, JSON.stringify({ before: { name: before.name, description: before.description, permissions: before.permissions }, after: { name: payload.name, description: payload.description, permissions: payload.permissionRows.map(item => item.code) }, affectedUserIds }));
      return send(res, 200, { role: publicRbacRole(db.prepare("select * from rbac_roles where id=?").get(roleId)), sessionRevoked: affectedUserIds.includes(manager.id) && manager.id !== SUPER_ACCOUNT_ID });
    }
    if (roleManageRoute && method === "DELETE") {
      const manager = requireRbacPermission(req, res, "roles.manage");
      if (!manager) return;
      const roleId = routeParam(roleManageRoute[1]);
      const existing = db.prepare("select * from rbac_roles where id=? and status='active'").get(roleId);
      if (!existing) return send(res, 404, { error: "未找到角色" });
      if (existing.system_role) {
        audit(manager, "reject_delete_system_role", "role", roleId, existing.name);
        return send(res, 400, { error: "系统预置角色不可删除" });
      }
      const assignedUserCount = Number(db.prepare("select count(*) as count from rbac_user_roles where role_id=?").get(roleId)?.count || 0);
      if (assignedUserCount) {
        audit(manager, "reject_delete_assigned_role", "role", roleId, JSON.stringify({ name: existing.name, assignedUserCount }));
        return send(res, 409, { error: `该角色仍有 ${assignedUserCount} 个账户使用，请先调整账户角色`, assignedUserCount });
      }
      db.exec("begin immediate");
      try {
        db.prepare("delete from rbac_role_permissions where role_id=?").run(roleId);
        db.prepare("delete from rbac_roles where id=?").run(roleId);
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      audit(manager, "delete_role", "role", roleId, existing.name);
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/admin/users" || url.pathname.startsWith("/api/admin/users/")) {
      return send(res, 410, { error: "旧账户接口已移除，请使用纯 RBAC 账户接口" });
    }
    const user = currentUser(req);
    if(user.id && url.pathname.startsWith("/api/maintenance/")){
      let flightId=url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)/)?.[1];
      const subtaskId=url.pathname.match(/^\/api\/maintenance\/subtasks\/([^/]+)/)?.[1];
      const assignmentId=url.pathname.match(/^\/api\/maintenance\/assignments\/([^/]+)/)?.[1];
      if(subtaskId)flightId=db.prepare("select flight_id from maintenance_subtasks where id=?").get(routeParam(subtaskId))?.flight_id;
      if(assignmentId)flightId=db.prepare("select flight_id from maintenance_assignments where id=?").get(routeParam(assignmentId))?.flight_id;
      if(flightId && !["import","export"].includes(flightId)){
        flightId=routeParam(flightId);
        const flight=db.prepare("select * from maintenance_flights where id=?").get(flightId);
        if(flight){
          const assigned=db.prepare("select person_id from maintenance_assignments where flight_id=?").all(flightId);
          const own=assigned.some(a=>a.person_id===user.personId);
          const isDispatchRequest=method==="POST" && /^\/api\/maintenance\/(?:flights|subtasks)\/[^/]+\/dispatch$/.test(url.pathname);
          let staleSharedDispatch=false;
          if(isDispatchRequest && hasRbac(user,"maintenance.assignment.manage") && maintenanceSharesCreatorDepartment(user,flight.created_by)){
            const expectedUpdatedAt=String((await bodyJson(req)).expectedUpdatedAt||"");
            staleSharedDispatch=!!expectedUpdatedAt && expectedUpdatedAt!==flight.updated_at;
          }
          const sharedUnassigned=maintenanceSharedUnassignedRouteAllowed(user,flight,method,url);
          // Actual report participation can permit a scoped, redacted review read;
          // it never grants dispatch-based execution or whole-tree write access.
          const scopedReviewRead=method==='GET' && /^\/api\/maintenance\/flights\/[^/]+\/review$/.test(url.pathname) && hasRbac(user,'maintenance.review.view') && currentMaintenanceReviewActor(user) && maintenanceReviewPersonnelScope(user,flightId).canRead;
          if(!personnelAccess.hasAll(user,"maintenance") && !own && flight.created_by!==user.id && !assigned.some(a=>personnelAccess.allows(user,"maintenance",a.person_id)) && !dataScopeAllowsUser(user,flight.created_by,"maintenance") && !sharedUnassigned && !staleSharedDispatch && !scopedReviewRead)return send(res,404,{error:"未找到维修机会"});
          if(!["GET","OPTIONS"].includes(method) && /(?:dispatch|review|archive)|^DELETE$/.test(url.pathname+" "+method) && assigned.some(a=>!personnelAccess.allows(user,"maintenance",a.person_id)) && !staleSharedDispatch)return send(res,403,{error:"任务包含维修管理范围外人员，不能修改"});
        }
      }
    }
    if (method === "GET" && url.pathname === "/api/maintenance/version") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      return send(res, 200, { version: maintenanceSyncVersion() });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/events") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      });
      res.write(`retry: 3000\nevent: maintenance\ndata: ${JSON.stringify({ type: "maintenance.connected", version: maintenanceSyncVersion() })}\n\n`);
      maintenanceEventClients.add(res);
      const heartbeat = setInterval(() => { try { res.write(": keepalive\n\n"); } catch {} }, 25000);
      req.on("close", () => { clearInterval(heartbeat); maintenanceEventClients.delete(res); });
      return;
    }
    if (url.pathname === "/api/maintenance/locations" && method === "GET") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      return send(res, 200, { locations: maintenanceWorkLocations(), defaultLocationId: defaultMaintenanceLocationId });
    }
    if (url.pathname === "/api/maintenance/locations" && method === "POST") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.rules.manage")) return send(res, 403, { error: "当前账号没有地点目录维护权限" });
      const input = await bodyJson(req);
      const name = String(input.name || "").trim();
      if (!name || name.length > 80) return send(res, 400, { error: "地点名称需为1至80字" });
      if (db.prepare("select id from maintenance_work_locations where name=?").get(name)) return send(res, 409, { error: "地点名称已存在" });
      const id = randomId("mloc");
      db.prepare("insert into maintenance_work_locations(id,name,status,created_at,updated_at) values(?,?,'active',?,?)").run(id, name, now(), now());
      audit(manager, "maintenance_location_create", "maintenance_location", id, name);
      return send(res, 201, { locations: maintenanceWorkLocations() });
    }
    const maintenanceLocationRoute = url.pathname.match(/^\/api\/maintenance\/locations\/([^/]+)$/);
    if (maintenanceLocationRoute && ["PUT", "DELETE"].includes(method)) {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.rules.manage")) return send(res, 403, { error: "当前账号没有地点目录维护权限" });
      const id = routeParam(maintenanceLocationRoute[1]);
      const existing = db.prepare("select * from maintenance_work_locations where id=?").get(id);
      if (!existing) return send(res, 404, { error: "未找到作业地点" });
      const references = db.prepare("select count(*) as count from maintenance_flights where location_id=?").get(id).count;
      if (method === "DELETE") {
        if (references) return send(res, 409, { error: `已有${references}条维修机会使用该地点，请先停用` });
        db.prepare("delete from maintenance_work_locations where id=?").run(id);
        audit(manager, "maintenance_location_delete", "maintenance_location", id, existing.name);
        return send(res, 200, { locations: maintenanceWorkLocations() });
      }
      const input = await bodyJson(req);
      const name = String(input.name ?? existing.name).trim();
      const status = String(input.status ?? existing.status);
      const reason = String(input.reason || "").trim();
      if (!name || name.length > 80 || !["active", "inactive"].includes(status)) return send(res, 400, { error: "地点名称或状态无效" });
      if ((name !== existing.name || status !== existing.status) && !reason) return send(res, 400, { error: "请填写变更原因" });
      if (db.prepare("select id from maintenance_work_locations where name=? and id<>?").get(name, id)) return send(res, 409, { error: "地点名称已存在" });
      db.prepare("update maintenance_work_locations set name=?,status=?,updated_at=? where id=?").run(name, status, now(), id);
      audit(manager, "maintenance_location_update", "maintenance_location", id, JSON.stringify({ before: existing.name, after: name, status, reason }));
      return send(res, 200, { locations: maintenanceWorkLocations() });
    }
    const maintenanceLocationCorrection = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/location$/);
    if (maintenanceLocationCorrection && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.archive.modify")) return send(res, 403, { error: "当前账号没有历史地点修正权限" });
      const id = routeParam(maintenanceLocationCorrection[1]);
      const input = await bodyJson(req);
      const reason = String(input.reason || "").trim();
      if (!reason) return send(res, 400, { error: "请填写地点修正原因" });
      const existing = db.prepare("select * from maintenance_flights where id=?").get(id);
      if (!existing) return send(res, 404, { error: "未找到维修机会" });
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有维修管理权限" });
      if (!maintenanceVisibleFlights(manager, "dispatch", { flightId: id, limit: 1 }).rows.length) return send(res, 403, { error: "该维修机会不在当前维修管控范围内" });
      const location = maintenanceLocationForInput({ locationId: input.locationId || input.locationName });
      maintenanceTransaction(() => {
        db.prepare("update maintenance_flights set location_id=?,location_name_snapshot=?,updated_by=?,updated_at=? where id=?").run(location.id, location.name, manager.id, now(), id);
        audit(manager, "maintenance_location_correction", "maintenance_flight", id, JSON.stringify({ oldLocationId: existing.location_id || "", newLocationId: location.id, reason }));
      });
      bumpMaintenanceVersion(id, "maintenance.location.corrected");
      return send(res, 200, { flight: publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(id)) });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/flights") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      const scope = url.searchParams.get("scope") || "dispatch";
      const opportunities = url.searchParams.getAll("opportunity").flatMap(value => value.split(",")).map(value => value.trim()).filter(Boolean);
      const locationIds = url.searchParams.getAll("locationId").flatMap(value => value.split(",")).map(value => value.trim()).filter(Boolean);
      const requestedLimit = Number(url.searchParams.get("limit"));
      const result = maintenanceVisibleFlights(login, scope, {
        dateFrom: url.searchParams.get("dateFrom") || "",
        dateTo: url.searchParams.get("dateTo") || "",
        opportunities,
        locationIds,
        search: String(url.searchParams.get("search") || "").trim(),
        limit: Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined,
        cursor: Number(url.searchParams.get("cursor") || 0)
      });
      const flights = url.searchParams.get("view") === "summary"
        ? publicMaintenanceBatch(result.rows, scope, login)
        : result.rows.map(row => scope === "execute" ? publicMaintenanceFlightForExecution(row, login) : publicMaintenanceFlight(row)).filter(Boolean);
      return send(res, 200, { flights, nextCursor: result.nextCursor, version: maintenanceSyncVersion() });
    }
    if(url.pathname==='/api/maintenance/nonroutine-correction-capabilities'&&method==='GET'){
      const user=requireLogin(req,res);if(!user)return;
      const enabled=process.env.MUC_NONROUTINE_CORRECTIONS_ENABLED==='1';
      return send(res,200,{enabled,approve:enabled&&Boolean(maintenanceCorrectionQualified(user.id,'maintenance.archive.modify')),authorizePeriod:enabled&&Boolean(maintenanceCorrectionQualified(user.id,'maintenance.hours.period.cross_period.authorize'))});
    }
    if(url.pathname==='/api/maintenance/nonroutine-corrections/sources'&&method==='GET'){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_NONROUTINE_CORRECTIONS_ENABLED!=='1')return send(res,404,{error:'独立工时更正办理尚未启用'});
      return send(res,200,maintenanceCorrections().sources(Object.fromEntries(url.searchParams),user));
    }
    const correctionSourceRoute=url.pathname.match(/^\/api\/maintenance\/nonroutine-corrections\/sources\/([^/]+)(?:\/(preview|approve))?$/);
    const correctionRoute=url.pathname.match(/^\/api\/maintenance\/nonroutine-corrections(?:\/([^/]+)(?:\/(authorize-period|retry|target-period))?)?$/);
    if(correctionSourceRoute||correctionRoute){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_NONROUTINE_CORRECTIONS_ENABLED!=='1')return send(res,404,{error:'独立工时更正办理尚未启用'});
      const service=maintenanceCorrections();
      if(correctionSourceRoute){
        const subtaskId=routeParam(correctionSourceRoute[1]),action=correctionSourceRoute[2];
        if(method==='GET'&&!action)return send(res,200,{source:service.source(subtaskId,user)});
        if(method==='POST'&&action==='preview')return send(res,200,{preview:service.preview(subtaskId,await bodyJson(req),user)});
        if(method==='POST'&&action==='approve'){
          const result=service.approve(subtaskId,await bodyJson(req),user);if(!result.replayed)bumpMaintenanceVersion(result.correction.opportunityId,'maintenance.hours.correction.approved');return send(res,200,result);
        }
      }else{
        const id=correctionRoute[1]&&routeParam(correctionRoute[1]),action=correctionRoute[2];
        if(method==='GET'&&!id)return send(res,200,service.list(Object.fromEntries(url.searchParams),user));
        if(method==='GET'&&!action)return send(res,200,{correction:service.view(id,user)});
        if(method==='GET'&&action==='target-period')return send(res,200,{target:service.targetPeriod(id,Object.fromEntries(url.searchParams),user)});
        if(method==='POST'&&action==='authorize-period'){
          const result=service.authorize(id,await bodyJson(req),user);if(!result.replayed)bumpMaintenanceVersion(result.correction.opportunityId,'maintenance.hours.correction.period-authorized');return send(res,200,result);
        }
        if(method==='POST'&&action==='retry'){
          const before=service.view(id,user),correction=service.retry(id,user);if(before.state!==correction.state)bumpMaintenanceVersion(correction.opportunityId,'maintenance.hours.correction.posted');return send(res,200,{correction});
        }
      }
      return send(res,405,{error:'更正办理方法不支持'});
    }
    if(method==='GET'&&url.pathname==='/api/maintenance/standard-publication-capabilities'){
      const user=requireLogin(req,res);if(!user)return;if(!standardPublicationCan(user))return send(res,403,{error:'须单独授予当前有效的标准发布业务权限及全维修范围'});
      return send(res,200,{enabled:process.env.MUC_STANDARDS_PUBLICATION_ENABLED==='1'&&process.env.MUC_STANDARDS_REVIEW_ENABLED==='1'});
    }
    const workIntakeRoute=url.pathname.match(/^\/api\/maintenance\/standard-publication-work-sources(?:\/([^/]+)(?:\/(intake))?)?$/);
    if(workIntakeRoute&&['GET','POST'].includes(method)){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_STANDARDS_PUBLICATION_ENABLED!=='1'||process.env.MUC_STANDARDS_REVIEW_ENABLED!=='1')return send(res,404,{error:'施工认定转标准尚未启用'});
      const service=standardWorkIntakeService(),caseId=workIntakeRoute[1]?routeParam(workIntakeRoute[1]):null;
      if(method==='GET'&&!workIntakeRoute[2])return send(res,200,caseId?{workSource:service.view(caseId,user)}:service.list(Object.fromEntries(url.searchParams),user));
      if(method==='POST'&&(caseId&&workIntakeRoute[2])){const result=service.intake(caseId,await bodyJson(req),user);if(!result.replayed){bumpMaintenanceVersion('','maintenance.standard.work-intake.changed');refreshMaintenanceStandardEffectiveReferences(user);}return send(res,200,result);}
      return send(res,405,{error:'该施工认定来源路径不支持此操作'});
    }
    const publicationRoute=url.pathname.match(/^\/api\/maintenance\/standard-publications(?:\/([^/]+)\/versions\/([^/]+)(?:\/(admit|publish))?)?$/);
    if(publicationRoute&&['GET','POST'].includes(method)){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_STANDARDS_PUBLICATION_ENABLED!=='1'||process.env.MUC_STANDARDS_REVIEW_ENABLED!=='1')return send(res,404,{error:'独立标准准入发布尚未启用'});
      const service=standardPublicationService(),id=publicationRoute[1]?routeParam(publicationRoute[1]):null,versionId=publicationRoute[2]?routeParam(publicationRoute[2]):null,action=publicationRoute[3];
      if(method==='GET'&&!action)return send(res,200,id?{result:service.view(id,versionId,user)}:service.list(Object.fromEntries(url.searchParams),user));
      if(method==='POST'&&action){const payload=await bodyJson(req);if(payload.versionId!==versionId)return send(res,400,{error:'发布路径与版本不一致'});const result=service[action](id,payload,user);if(!result.replayed){bumpMaintenanceVersion('','maintenance.standard.publication.changed');if(action==='publish')refreshMaintenanceStandardEffectiveReferences(user);}return send(res,200,result);}
      return send(res,405,{error:'该准入发布路径不支持此操作'});
    }
    if(method==='GET'&&url.pathname==='/api/maintenance/standard-management-capabilities'){
      const user=requireLogin(req,res);if(!user)return;
      if(!standardManagementCan(user,'maintenance.standard.manage'))return send(res,403,{error:'当前账户没有全维修范围的标准管理权限'});
      return send(res,200,{enabled:process.env.MUC_STANDARDS_MANAGEMENT_ENABLED==='1',importEnabled:process.env.MUC_STANDARDS_MANAGEMENT_ENABLED==='1'&&process.env.MUC_STANDARDS_IMPORT_ENABLED==='1'});
    }
    if(method==='GET'&&url.pathname==='/api/maintenance/standard-review-capabilities'){
      const user=requireLogin(req,res);if(!user)return;
      const activeMember=user.status==='active'&&hasRbac(user,'maintenance.view')&&hasRbac(user,'maintenance.nonroutine.review.view')&&db.prepare("select 1 from personnel where id=? and data_status='active' and coalesce(employment_status,'') not in ('离职','停职')").get(user.personId);
      if(!activeMember&&!standardReviewCan(user,'maintenance.nonroutine.review.view'))return send(res,403,{error:'当前账户没有标准评议查看权限'});
      return send(res,200,{enabled:process.env.MUC_STANDARDS_REVIEW_ENABLED==='1',notificationsEnabled:process.env.MUC_STANDARDS_REVIEW_ENABLED==='1'&&process.env.MUC_STANDARDS_NOTIFICATIONS_ENABLED==='1'});
    }
    const standardNoticeRoute=url.pathname.match(/^\/api\/maintenance\/standard-review-notifications(?:\/([^/]+)\/read)?$/);
    if(standardNoticeRoute&&(method==='GET'&&!standardNoticeRoute[1]||method==='POST'&&standardNoticeRoute[1])){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_STANDARDS_REVIEW_ENABLED!=='1'||process.env.MUC_STANDARDS_NOTIFICATIONS_ENABLED!=='1')return send(res,404,{error:'标准评议站内通知尚未启用'});
      const service=standardReviewNotifications();
      return method==='GET'?send(res,200,{notifications:service.list(user)}):send(res,200,service.markRead(routeParam(standardNoticeRoute[1]),user));
    }
    if(method==='GET'&&url.pathname==='/api/maintenance/standard-reviews'){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_STANDARDS_REVIEW_ENABLED!=='1')return send(res,404,{error:'标准版本评议尚未启用'});
      if(!hasRbac(user,'maintenance.view'))return send(res,403,{error:'当前账户没有标准评议查看权限'});
      return send(res,200,standardReviewService().list(Object.fromEntries(url.searchParams),user));
    }
    const standardRequest=url.pathname.match(/^\/api\/maintenance\/standard-management\/([^/]+)\/request-review$/);
    if(standardRequest&&method==='POST'){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_STANDARDS_MANAGEMENT_ENABLED!=='1'||process.env.MUC_STANDARDS_REVIEW_ENABLED!=='1')return send(res,404,{error:'标准版本评议申请尚未启用'});
      const result=standardReviewService().request(routeParam(standardRequest[1]),await bodyJson(req),user);if(!result.replayed)bumpMaintenanceVersion('','maintenance.standard.review.changed');return send(res,200,result);
    }
    const standardRound=url.pathname.match(/^\/api\/maintenance\/standard-reviews\/([^/]+)(?:\/(accept|opinion|seats|suggestions|opinion-history|candidates|finalization|finalize))?$/);
    if(standardRound&&['GET','POST'].includes(method)){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_STANDARDS_REVIEW_ENABLED!=='1')return send(res,404,{error:'标准版本评议尚未启用'});
      const service=standardReviewService(),id=routeParam(standardRound[1]),action=standardRound[2];
      if(method==='GET'){
        if(!action)return send(res,200,{review:service.view(id,user)});
        if(action==='candidates')return send(res,200,service.candidates(id,Object.fromEntries(url.searchParams),user));
        if(action==='opinion-history')return send(res,200,{history:service.opinionHistory(id,Object.fromEntries(url.searchParams),user)});
        if(action==='finalization')return send(res,200,service.finalization(id,user));
      }else{
        const methods={accept:'accept',opinion:'submitOpinion',seats:'replaceUnsubmittedSeat',suggestions:'suggest',finalize:'finalize'};
        if(methods[action]){const result=service[methods[action]](id,await bodyJson(req),user);bumpMaintenanceVersion('','maintenance.standard.review.changed');return send(res,200,action==='finalize'?result:{review:result});}
      }
      return send(res,405,{error:'该标准评议路径不支持此操作'});
    }
    const standardImportRoute=url.pathname.match(/^\/api\/maintenance\/standard-import(?:\/(preview|batches\/([^/]+)(?:\/(commit))?))$/);
    if(standardImportRoute&&['GET','POST'].includes(method)){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_STANDARDS_MANAGEMENT_ENABLED!=='1'||process.env.MUC_STANDARDS_IMPORT_ENABLED!=='1')return send(res,404,{error:'标准库文件导入尚未启用'});
      if(!standardManagementCan(user,'maintenance.standard.manage'))return send(res,403,{error:'当前账户没有全维修范围的标准管理权限'});
      const service=standardImportService(),id=standardImportRoute[2]?routeParam(standardImportRoute[2]):null;
      if(method==='POST'&&standardImportRoute[1]==='preview'){
        const payload=await bodyJson(req);if(!payload||Object.keys(payload).some(key=>!['filename','contentBase64','sheetName'].includes(key)))return send(res,400,{error:'标准预览只接受文件及工作表，不接受准入或发布字段'});
        return send(res,200,service.preview(await parseStandardImportFile(payload),user));
      }
      if(method==='GET'&&id&&!standardImportRoute[3])return send(res,200,service.view(id,user));
      if(method==='POST'&&id&&standardImportRoute[3]){const result=service.commit(id,await bodyJson(req),user);if(!result.replayed&&result.summary.success)bumpMaintenanceVersion('','maintenance.standard.import.changed');return send(res,200,result);}
      return send(res,405,{error:'该标准导入路径不支持此操作'});
    }
    const standardManagementRoute=url.pathname.match(/^\/api\/maintenance\/standard-management(?:\/([^/]+)(?:\/(update|withdraw|disable|revise))?)?$/);
    if(standardManagementRoute && ['GET','POST'].includes(method)){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_STANDARDS_MANAGEMENT_ENABLED!=='1')return send(res,404,{error:'标准库日常管理尚未启用'});
      const can=standardManagementCan;
      const service=createStandardManagement({db,transaction:maintenanceTransaction,can,clock:now,randomId,versionUnderReview:versionId=>db.prepare('select id from maintenance_standard_review_cases where version_id=?').get(versionId),reviewEnabled:()=>process.env.MUC_STANDARDS_REVIEW_ENABLED==='1',referenceSnapshot:()=>readStandardReferences(db)});
      const id=standardManagementRoute[1]?routeParam(standardManagementRoute[1]):null,action=standardManagementRoute[2];
      if(method==='GET'&&!action)return send(res,200,id?service.view(id,user):service.list(Object.fromEntries(url.searchParams),user));
      if(method==='POST'&&(!id||action)){
        const result=id?service[action](id,await bodyJson(req),user):service.create(await bodyJson(req),user);
        if(!result.operation.replayed){bumpMaintenanceVersion('','maintenance.standard.management.changed');refreshMaintenanceStandardEffectiveReferences(user);}return send(res,200,result);
      }
      return send(res,405,{error:'该标准管理路径不支持此操作'});
    }
    const maintenanceStandardRoute = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/standards(?:\/(match))?$/);
    if (maintenanceStandardRoute && ((method === "GET" && !maintenanceStandardRoute[2]) || (method === "POST" && maintenanceStandardRoute[2]))) {
      const viewer = requireLogin(req, res);
      if (!viewer) return;
      if (!["shadow", "draft"].includes(process.env.MUC_MAINTENANCE_V101)) return send(res, 404, { error: "标准匹配影子预览尚未启用" });
      if (!hasRbac(viewer, "maintenance.view") || !hasRbac(viewer, "maintenance.standard.view")) {
        return send(res, 403, { error: "当前账号没有查看非例行标准的权限" });
      }
      const flightId = routeParam(maintenanceStandardRoute[1]);
      const scope = hasRbac(viewer, "maintenance.dispatch.view") ? "dispatch" : "execute";
      const visible = maintenanceVisibleFlights(viewer, scope, { flightId, limit: 1 }).rows[0];
      if (!visible) return send(res, 404, { error: "未找到可访问的维修机会" });
      const standards = createMaintenanceStandards({ db });
      if (method === "GET") return send(res, 200, standards.list({ aircraftCode: url.searchParams.has("aircraftCode")?url.searchParams.get("aircraftCode"):visible.aircraft_type, search: url.searchParams.get("search") || "" }));
      const payload = await bodyJson(req);
      return send(res, 200, standards.match(payload, visible.aircraft_type));
    }
    const maintenanceDraftItemRoute = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/reports\/nonroutine\/draft\/items\/([^/]+)$/);
    if (maintenanceDraftItemRoute && method === "DELETE") {
      const executor = requireLogin(req, res);
      if (!executor) return;
      if (!maintenanceCanExecute(executor, true) || !hasRbac(executor, "maintenance.nonroutine.delete.own")) return send(res, 403, { error: "当前账号没有删除本人非例行草稿的权限" });
      const flightId = routeParam(maintenanceDraftItemRoute[1]);
      const clientId = routeParam(maintenanceDraftItemRoute[2]);
      const deleted = deleteMaintenanceNonroutineDraft(flightId, await bodyJson(req), executor, clientId);
      if (deleted) bumpMaintenanceVersion(flightId, "maintenance.nonroutine.draft.item.deleted");
      return send(res, 200, { ok: true, deleted, draft: maintenanceReportDraft(flightId, "nonroutine") });
    }
    const maintenanceReportDraftRoute = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/reports\/(routine|nonroutine)\/draft$/);
    if (maintenanceReportDraftRoute && method === "DELETE") {
      const executor = requireLogin(req, res);
      if (!executor) return;
      if (!maintenanceCanExecute(executor, true) || !hasRbac(executor, "maintenance.nonroutine.delete.own")) return send(res, 403, { error: "当前账号没有删除本人非例行草稿的权限" });
      const flightId = routeParam(maintenanceReportDraftRoute[1]);
      const reportType = maintenanceReportDraftRoute[2];
      if (reportType !== "nonroutine") return send(res, 405, { error: "当前草稿不支持删除" });
      const payload = await bodyJson(req);
      const deleted = deleteMaintenanceNonroutineDraft(flightId, payload, executor);
      if (deleted) bumpMaintenanceVersion(flightId, "maintenance.nonroutine.draft.deleted");
      return send(res, 200, { ok: true, deleted });
    }
    if (maintenanceReportDraftRoute && method === "PUT") {
      const executor = requireLogin(req, res);
      if (!executor) return;
      if (!maintenanceCanExecute(executor, true)) return send(res, 403, { error: "当前账号没有提交维修报工的权限" });
      const flightId = routeParam(maintenanceReportDraftRoute[1]);
      const reportType = maintenanceReportDraftRoute[2];
      const payload = await bodyJson(req);
      const result = reportType === "routine"
        ? saveMaintenanceRoutineDraft(flightId, payload, executor)
        : saveMaintenanceNonroutineDraft(flightId, payload, executor);
      bumpMaintenanceVersion(flightId, `maintenance.${reportType}.draft.saved`);
      return send(res, 200, reportType === "routine" ? result : { draft: result });
    }
    if(method==='GET'&&url.pathname==='/api/maintenance/workflow-capabilities'){
      const actor=requireLogin(req,res);if(!actor)return;
      const enabled=process.env.MUC_WORKFLOW_TASKS_ENABLED==='1';
      return send(res,200,{enabled,simulationOnly:true,simulationEnabled:enabled&&process.env.MUC_WORKFLOW_SIMULATION_ENABLED==='1',view:enabled&&Boolean(maintenanceWorkflowPerson(actor.id,'maintenance.workflow.view')),manage:enabled&&Boolean(maintenanceWorkflowManage(actor)),submit:enabled&&Boolean(maintenanceWorkflowPerson(actor.id,'maintenance.workflow.submit'))});
    }
    const workflowResource=url.pathname.match(/^\/api\/maintenance\/workflows\/([^/]+)(?:\/(claim|submit|reassign|cancel|result|audit))?$/);
    const opportunityWorkflows=url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/workflows$/);
    if(workflowResource||opportunityWorkflows||['/api/maintenance/workflow-tasks','/api/maintenance/workflow-templates','/api/maintenance/workflow-assignees','/api/maintenance/workflow-modules'].includes(url.pathname)){
      const actor=requireLogin(req,res);if(!actor)return;
      if(process.env.MUC_WORKFLOW_TASKS_ENABLED!=='1')return send(res,404,{error:'非结算流程办理尚未启用'});
      if(process.env.MUC_WORKFLOW_SIMULATION_ENABLED!=='1')return send(res,409,{error:'当前没有已批准的业务模板；模拟流程尚未启用'});
      if(workflowResource){
        const workflowId=routeParam(workflowResource[1]),action=workflowResource[2];
        if(action==='audit'&&method==='GET'){
          if([...url.searchParams.keys()].some(key=>!['cursor','limit'].includes(key)))return send(res,400,{error:'办理历史查询参数无效'});
          const access=maintenanceWorkflowAccess(workflowId,actor);
          const history=readMaintenanceWorkflowAudit({db,workflow:access.workflow,module:access.module,ruleSnapshot:access.identity.ruleSnapshotSha256,actor:access.actor,manage:access.manager},{cursor:url.searchParams.get('cursor')||'',limit:Number(url.searchParams.get('limit')||20)}),flight=db.prepare('select date,flight_no,aircraft_no from maintenance_flights where id=?').get(access.module.opportunityId);
          return send(res,200,{...history,opportunity:{date:flight.date,flightNo:flight.flight_no,aircraftNo:flight.aircraft_no}});
        }
        const visible=maintenanceWorkflowView(workflowId,actor);
        if(!action&&method==='GET')return send(res,200,visible);
        if(action==='result'&&method==='GET'){
          if([...url.searchParams.keys()].some(key=>key!=='expectedVersion'))return send(res,400,{error:'结果查询参数无效'});
          const source=visible.completion.resultSource,version=url.searchParams.has('expectedVersion')?Number(url.searchParams.get('expectedVersion')):null;
          if(!visible.completion.available||!visible.completion.complete||!source)return send(res,409,{error:visible.completion.error?'完成结果来源待核对':'流程尚未形成完成结果'});
          if(version!==null&&(!Number.isSafeInteger(version)||version!==source.sourceVersion))return send(res,409,{error:'结果来源版本已变化，请重新读取'});
          if(visible.tasks.length!==1||visible.tasks[0].result?.type!==source.type)return send(res,409,{error:'当前结果与已批准模拟合同不匹配'});
          const result=visible.tasks[0].result;
          return send(res,200,{...source,outcome:result.outcome,...(result.note!==undefined?{note:result.note}:{}),simulationOnly:true});
        }
        if(action&&!['result','audit'].includes(action)&&method==='POST'){
          const payload=await bodyJson(req),stored=db.prepare('select * from maintenance_workflow_instances where id=?').get(workflowId);
          const result=action==='submit'?maintenanceResultService().submit({...maintenanceWorkflowContext(stored).module,workflowInstanceId:workflowId},payload,actor):maintenanceWorkflowService()[action](workflowId,payload,actor);
          if(!result.replayed)bumpMaintenanceVersion(visible.opportunityId,'maintenance.workflow.updated');
          return send(res,200,{...result,simulationOnly:true});
        }
        return send(res,405,{error:'不支持的流程操作'});
      }
      if(url.pathname==='/api/maintenance/workflow-tasks'&&method==='GET'){
        const qualified=maintenanceWorkflowPerson(actor.id,'maintenance.workflow.view');if(!qualified)return send(res,403,{error:'当前人员没有明确的流程查看权限'});
        const cursor=url.searchParams.get('cursor')||'',limit=Number(url.searchParams.get('limit')||30),all=url.searchParams.get('state')==='ALL';
        if(cursor.length>128||!Number.isSafeInteger(limit)||limit<1||limit>100||url.searchParams.has('state')&&!['ALL','PENDING'].includes(url.searchParams.get('state')))return send(res,400,{error:'任务分页参数无效'});
        const rows=db.prepare(`select t.*,w.revision as workflow_revision,w.state as workflow_state,i.opportunity_id,f.date,f.flight_no,f.aircraft_no from maintenance_workflow_tasks t join maintenance_workflow_instances w on w.id=t.workflow_id join maintenance_module_instances i on i.id=w.module_instance_id join maintenance_flights f on f.id=i.opportunity_id where t.account_id=? and t.person_id=? and t.id>? and i.module_code='extension_workflow_simulation' and i.module_version=1 ${all?'':"and t.state in ('ASSIGNED','CLAIMED') and w.state='OPEN'"} order by t.id limit ?`).all(qualified.accountId,qualified.personId,cursor,limit+1);
        const page=rows.slice(0,limit);for(const row of page)maintenanceWorkflowContext(db.prepare('select * from maintenance_workflow_instances where id=?').get(row.workflow_id),false);
        return send(res,200,{simulationOnly:true,tasks:page.map(row=>({taskId:row.id,workflowId:row.workflow_id,opportunityId:row.opportunity_id,opportunity:{date:row.date,flightNo:row.flight_no,aircraftNo:row.aircraft_no},title:row.title,state:row.state,revision:Number(row.revision),workflowState:row.workflow_state,workflowRevision:Number(row.workflow_revision)})),nextCursor:rows.length>limit?page.at(-1).id:null});
      }
      if(!maintenanceWorkflowManage(actor))return send(res,403,{error:'需要明确流程管理授权及全维修范围'});
      if(url.pathname==='/api/maintenance/workflow-modules'&&method==='GET'){
        const search=(url.searchParams.get('search')||'').trim(),cursor=url.searchParams.get('cursor')||'',limit=30;
        if(search.length>100||cursor.length>1000)return send(res,400,{error:'模块查询参数无效'});
        const term=`%${search.toLowerCase()}%`;
        const rows=db.prepare("select i.*,f.date,f.flight_no,f.aircraft_no,f.status,f.archived_at,w.id as workflow_id,w.state as workflow_state from maintenance_module_instances i join maintenance_flights f on f.id=i.opportunity_id left join maintenance_workflow_instances w on w.module_instance_id=i.id where i.module_code='extension_workflow_simulation' and i.module_version=1 and i.id>? and (lower(f.flight_no) like ? or lower(f.aircraft_no) like ? or f.date like ?) order by i.id limit ?").all(cursor,term,term,term,limit+1);
        const modules=rows.slice(0,limit).map(row=>{const identity=readMaintenanceModuleIdentity(db,row.opportunity_id),module=identity.extensions.find(item=>item.moduleInstanceId===row.id);resolveMaintenanceWorkflowTemplate('nonsettlement_simulation',1,module,true);return {moduleInstanceId:row.id,instanceKey:row.instance_key,opportunityId:row.opportunity_id,opportunity:{date:row.date,flightNo:row.flight_no,aircraftNo:row.aircraft_no},ruleSnapshotSha256:identity.ruleSnapshotSha256,workflowId:row.workflow_id||null,state:row.workflow_state||null,locked:row.status==='已确认'||Boolean(row.archived_at)};});
        return send(res,200,{simulationOnly:true,modules,nextCursor:rows.length>limit?modules.at(-1).moduleInstanceId:null});
      }
      if(url.pathname==='/api/maintenance/workflow-templates'&&method==='GET')return send(res,200,{simulationOnly:true,templates:maintenanceWorkflowTemplates(true)});
      if(url.pathname==='/api/maintenance/workflow-assignees'&&method==='GET'){
        const search=(url.searchParams.get('search')||'').trim();if(search.length>100)return send(res,400,{error:'搜索文字过长'});
        const term=`%${search.toLowerCase()}%`,rows=db.prepare("select distinct u.id,p.name,p.employee_no from users u join personnel p on p.id=u.person_id join rbac_user_roles ur on ur.user_id=u.id join rbac_roles r on r.id=ur.role_id join rbac_role_permissions rp on rp.role_id=r.id join rbac_permissions permission on permission.id=rp.permission_id where r.status='active' and r.code<>'system_admin' and permission.code='maintenance.workflow.submit' and (lower(p.name) like ? or p.employee_no like ? or u.id like ?) order by p.employee_no,u.id").all(term,term,term).map(row=>({row,qualified:maintenanceWorkflowPerson(row.id,'maintenance.workflow.submit')})).filter(item=>item.qualified).slice(0,50);
        return send(res,200,{simulationOnly:true,candidates:rows.map(({row,qualified})=>({accountId:qualified.accountId,personId:qualified.personId,name:row.name,employeeNo:row.employee_no}))});
      }
      if(opportunityWorkflows){
        const flightId=routeParam(opportunityWorkflows[1]);
        if(!db.prepare('select id from maintenance_flights where id=?').get(flightId))return send(res,404,{error:'未找到维修机会'});
        if(method==='GET'){
          const rows=db.prepare("select w.id from maintenance_workflow_instances w join maintenance_module_instances i on i.id=w.module_instance_id where i.opportunity_id=? and i.module_code='extension_workflow_simulation' order by w.id").all(flightId);
          return send(res,200,{simulationOnly:true,workflows:rows.map(row=>maintenanceWorkflowView(row.id,actor))});
        }
        if(method==='POST'){
          const body=await bodyJson(req);if(!body||typeof body!=='object'||Array.isArray(body))return send(res,400,{error:'流程请求格式无效'});
          const {moduleInstanceId,...payload}=body;
          if(typeof moduleInstanceId!=='string')return send(res,400,{error:'请选择原模块实例'});
          const result=maintenanceWorkflowService(flightId).create(moduleInstanceId,payload,actor);
          if(!result.replayed)bumpMaintenanceVersion(flightId,'maintenance.workflow.created');
          return send(res,200,{...result,simulationOnly:true});
        }
      }
      return send(res,405,{error:'不支持的流程操作'});
    }
    if(method==='GET'&&url.pathname==='/api/maintenance/extension-module-capabilities'){
      const user=requireLogin(req,res);if(!user)return;
      return send(res,200,{enabled:process.env.MUC_NONSETTLEMENT_MODULES_ENABLED==='1',manage:process.env.MUC_NONSETTLEMENT_MODULES_ENABLED==='1'&&maintenanceExtensionAuthorized(user)});
    }
    // V10.1 行1103 / P0-60：进行中机会的模块规则有权变更（重冻结）路径
    const moduleRefreezeRoute=url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/module-rule-refreeze$/);
    if(moduleRefreezeRoute&&method==='POST'){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_NONSETTLEMENT_MODULES_ENABLED!=='1')return send(res,404,{error:'非结算模块注册尚未启用'});
      if(!maintenanceExtensionAuthorized(user))return send(res,403,{error:'模块规则重冻结需要维修模块管理权限'});
      const opportunityId=routeParam(moduleRefreezeRoute[1]);
      const payload=await bodyJson(req);
      try{
        const result=maintenanceTransaction(()=>{
          const outcome=refreezeMaintenanceModuleIdentity({db,opportunityId,actorId:user.id,stamp:now(),impactAnalysis:payload?.impactAnalysis,approved:payload?.approved});
          maintenanceLog(user,'module_identity_refreeze','flight',opportunityId,opportunityId,JSON.stringify({from:outcome.before,to:outcome.after,impactAnalysis:outcome.impactAnalysis,approvedBy:user.id,actorQualification:{accountId:user.id,personId:user.personId,permissions:user.rbacPermissions,scopes:user.dataScopes}}),{touch:false});
          maintenanceLog(user,'module_rule_change_approved','flight',opportunityId,opportunityId,JSON.stringify({opportunityId,from:outcome.before,to:outcome.after,approved:true,impactAnalysis:outcome.impactAnalysis}),{touch:false});
          return {opportunityId,ruleSnapshotSha256:outcome.after.snapshotSha256,gateRuleVersion:outcome.after.gateRuleVersion};
        });
        bumpMaintenanceVersion(opportunityId,'maintenance.module.rule_refreeze');
        return send(res,200,result);
      }catch(error){
        return send(res,error.status||500,{error:error.message});
      }
    }
    const extensionRoute=url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/extension-modules$/);
    if(extensionRoute&&['GET','POST'].includes(method)){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_NONSETTLEMENT_MODULES_ENABLED!=='1')return send(res,404,{error:'非结算模块注册尚未启用'});
      if(!maintenanceExtensionAuthorized(user))return send(res,403,{error:'当前人员、明确模块授权或维修数据范围不满足注册要求'});
      const opportunityId=routeParam(extensionRoute[1]);
      if(!db.prepare('select id from maintenance_flights where id=?').get(opportunityId))return send(res,404,{error:'未找到维修机会'});
      if(method==='GET'){
        const identity=readMaintenanceModuleIdentity(db,opportunityId);if(!identity)return send(res,409,{error:'原机会没有模块规则快照，不能自动回填'});
        return send(res,200,{opportunityId,ruleSnapshotSha256:identity.ruleSnapshotSha256,gateRuleVersion:identity.gateRuleVersion,modules:identity.extensions});
      }
      const result=maintenanceExtensionService().register(opportunityId,await bodyJson(req),user);
      if(!result.replayed)bumpMaintenanceVersion(opportunityId,'maintenance.module.registered');
      return send(res,200,result);
    }
    const maintenanceModulesRoute = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/report-modules$/);
    if (maintenanceModulesRoute && method === "GET") {
      const viewer = requireLogin(req, res);
      if (!viewer) return;
      if (!maintenanceModuleShadowEnabled()) return send(res, 404, { error: "维修报工模块投影尚未启用" });
      if (!maintenanceCanExecute(viewer)) return send(res, 403, { error: "当前账号没有查看维修报工的权限" });
      const flightId = routeParam(maintenanceModulesRoute[1]);
      if (!maintenanceCanSubmitReport(viewer, flightId) && !(maintenanceCanManage(viewer) && personnelAccess.hasAll(viewer, "maintenance"))) {
        return send(res, 404, { error: "未找到可访问的维修机会" });
      }
      const progress = maintenanceReportProgress(flightId);
      if (!progress) return send(res, 404, { error: "未找到维修机会" });
      const modules = readPersistedMaintenanceReportModules(db, flightId, progress);
      return send(res, 200, { opportunityId: flightId, modules });
    }
    const maintenanceReportsRoute = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/reports(?:\/(release|routine|nonroutine))?$/);
    if (maintenanceReportsRoute && method === "GET" && !maintenanceReportsRoute[2]) {
      const executor = requireLogin(req, res);
      if (!executor) return;
      if (!maintenanceCanExecute(executor)) return send(res, 403, { error: "当前账号没有查看本人维修任务的权限" });
      const report = maintenanceReportsView(routeParam(maintenanceReportsRoute[1]), executor);
      if (!report) return send(res, 404, { error: "未找到维修机会" });
      return send(res, 200, { report });
    }
    if (maintenanceReportsRoute && method === "PUT" && maintenanceReportsRoute[2]) {
      const executor = requireLogin(req, res);
      if (!executor) return;
      if (!maintenanceCanExecute(executor, true)) return send(res, 403, { error: "当前账号没有提交维修报工的权限" });
      const flightId = routeParam(maintenanceReportsRoute[1]);
      const payload = await bodyJson(req);
      const type = maintenanceReportsRoute[2];
      const saveOnly = type === "nonroutine" && payload?.mode === "save";
      const definition=MAINTENANCE_REPORT_DEFINITIONS.find(item=>item.reportType===type);
      const flight = saveOnly?saveMaintenanceNonroutine(flightId,payload,executor):maintenanceResultService().submit({...definition,opportunityId:flightId,moduleInstanceId:JSON.stringify([flightId,definition.moduleTypeCode,definition.moduleVersion])},payload,executor);
      bumpMaintenanceVersion(flightId, saveOnly ? "maintenance.nonroutine.saved" : `maintenance.${type}.submitted`);
      return send(res, 200, { flight, report: maintenanceReportsView(flightId, executor) });
    }
    const maintenanceFinalizeRoute = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/report-confirmation$/);
    if (maintenanceFinalizeRoute && method === "POST") {
      const executor = requireLogin(req, res);
      if (!executor) return;
      const flightId = routeParam(maintenanceFinalizeRoute[1]);
      const payload = await bodyJson(req);
      const saveOnly = payload?.mode === "save";
      const flight = saveOnly
        ? saveMaintenanceReportConfirmation(flightId, payload, executor, { finalize: false })
        : finalizeMaintenanceReports(flightId, payload, executor);
      bumpMaintenanceVersion(flightId, saveOnly ? "maintenance.report.confirmation.saved" : "maintenance.report.finalized");
      return send(res, 200, { flight });
    }
    if (method === "POST" && ['/api/maintenance/dispatch-import/preview','/api/maintenance/dispatch-import/commit'].includes(url.pathname)) {
      const manager = requireLogin(req,res);
      if (!manager) return;
      if (!hasRbac(manager,'maintenance.assignment.manage') || !hasRbac(manager,'maintenance.dispatch.view')) return send(res,403,{error:'当前账号没有派工导入权限'});
      const payload = await bodyJson(req), rows = payload.rows;
      if (!Array.isArray(rows) || !rows.length || rows.length>1000) return send(res,400,{error:'每批须包含1～1000条派工记录'});
      const commit = url.pathname.endsWith('/commit');
      if (commit && !/^[a-zA-Z0-9_-]{8,100}$/.test(payload.requestId || '')) return send(res,400,{error:'缺少有效导入请求编号'});
      const digest = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
      const ledgerKey = `dispatch_import:${manager.id}:${payload.requestId}`;
      const identities = rows.map(raw => { try { return dispatchImportIdentity(raw); } catch { return null; } });
      const counts = new Map();
      identities.filter(Boolean).forEach(item=>counts.set(item.key,(counts.get(item.key)||0)+1));
      const results = [];
      for (let index=0;index<rows.length;index++) {
        try {
          const processRow = ()=> {
            const saved = commit ? json(db.prepare('select value from settings where key=?').get(ledgerKey)?.value,null) : null;
            if (saved && saved.digest!==digest) throw new Error('请求编号已用于不同文件，请重新上传');
            if (saved?.results?.[index]) {
              const result=saved.results[index], visible=new Set(allPeople('maintenance').map(p=>p.id));
              if(result.assignments.some(a=>!visible.has(a.personId))) throw new Error('原导入人员已不在当前维修范围内');
              return result;
            }
            const raw = rows[index], identity = dispatchImportIdentity(raw);
            if (counts.get(identity.key)>1) throw new Error('同一文件重复包含该维修机会，请合并为一行');
            const candidates = maintenanceVisibleFlights(manager,'dispatch',{dateFrom:identity.date,dateTo:identity.date}).rows.filter(f=>
              (f.work_kind||f.work_type)===identity.workKind && (!identity.arrival || String(f.flight_no||'').trim().toUpperCase()===identity.arrival) && (!identity.departure || String(f.departure_flight_no||'').trim().toUpperCase()===identity.departure));
            if (candidates.length!==1) throw new Error(candidates.length ? '匹配到多个维修机会，不能自动选择' : '未找到可派工的维修机会');
            const flight=candidates[0];
            if (flight.status!=='未派工') throw new Error('仅允许导入未派工维修机会');
            assertMaintenanceTreeDirectEditAllowed(flight.id);
            if (db.prepare('select id from maintenance_assignments where flight_id=?').get(flight.id) || db.prepare('select id from maintenance_report_batches where flight_id=?').get(flight.id)) throw new Error('维修机会已有派工或报工内容，请人工检查');
            const assignments=dispatchImportAssignments(raw,allPeople('maintenance'));
            normalizeMaintenanceAssignments('flight',flight,assignments);
            if (commit && (raw.matchedFlightId!==flight.id || raw.expectedUpdatedAt!==flight.updated_at)) throw new Error('维修机会已更新，请重新校验');
            const result={rowNumber:raw.rowNumber || index+2,ok:true,flightId:flight.id,expectedUpdatedAt:flight.updated_at,aircraftNo:flight.aircraft_no,date:flight.date,workKind:identity.workKind,assignments};
            if (commit) {
              setMaintenanceAssignments('flight',flight.id,assignments,manager,flight.updated_at,true);
              const status=db.prepare('select status from maintenance_flights where id=?').get(flight.id)?.status;
              if(status!=='已派工') throw new Error('状态无法变为已派工，本条已回滚，请人工检查');
              maintenanceLog(manager,'dispatch_import','flight',flight.id,flight.id,JSON.stringify({requestId:payload.requestId,rowNumber:result.rowNumber}));
              const record=saved||{digest,results:{}};
              record.results[index]=result;
              setSetting(ledgerKey,record);
            }
            return result;
          };
          const result = commit ? maintenanceTransaction(processRow) : processRow();
          results.push(result);
        } catch(error) { results.push({rowNumber:rows[index]?.rowNumber || index+2,ok:false,error:error.message}); }
      }
      if(commit && results.some(item=>item.ok)) bumpMaintenanceVersion('','maintenance.dispatch.imported');
      return send(res,200,{results,success:results.filter(item=>item.ok).length,failed:results.filter(item=>!item.ok).length});
    }
    if(method==='GET' && url.pathname==='/api/maintenance/nonroutine-review-capabilities'){
      const user=requireLogin(req,res);if(!user)return;
      if(!hasRbac(user,'maintenance.view') || !hasRbac(user,'maintenance.nonroutine.review.view'))return send(res,403,{error:'当前账号没有评议查看权限'});
      return send(res,200,{enabled:process.env.MUC_NONROUTINE_REVIEW_ENABLED==='1'});
    }
    if(method==='GET' && url.pathname==='/api/maintenance/nonroutine-reviews'){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_NONROUTINE_REVIEW_ENABLED!=='1')return send(res,404,{error:'非例行评议尚未启用'});
      if(!hasRbac(user,'maintenance.nonroutine.review.view'))return send(res,403,{error:'当前账号没有评议查看权限'});
      return send(res,200,nonroutineReviewService().list(Object.fromEntries(url.searchParams),user));
    }
    const notificationRoute=url.pathname.match(/^\/api\/maintenance\/nonroutine-review-notifications(?:\/([^/]+)\/read)?$/);
    if(notificationRoute && (method==='GET' && !notificationRoute[1] || method==='POST' && notificationRoute[1])){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_NONROUTINE_REVIEW_ENABLED!=='1' || process.env.MUC_NONROUTINE_NOTIFICATIONS_ENABLED!=='1')return send(res,404,{error:'评议站内通知尚未启用'});
      const service=nonroutineNotifications();
      return method==='GET'?send(res,200,{notifications:service.list(user)}):send(res,200,service.markRead(routeParam(notificationRoute[1]),user));
    }
    if(method==='GET' && url.pathname==='/api/maintenance/cross-period-tasks'){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_MAINTENANCE_PERIODS_ENABLED!=='1')return send(res,404,{error:'工时跨期管理尚未启用'});
      return send(res,200,maintenanceCrossPeriod().list(Object.fromEntries(url.searchParams),user));
    }
    const crossPeriodRoute=url.pathname.match(/^\/api\/maintenance\/cross-period-tasks\/([^/]+)(?:\/(authorize))?$/);
    if(crossPeriodRoute && (method==='GET' && !crossPeriodRoute[2] || method==='POST' && crossPeriodRoute[2])){
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_MAINTENANCE_PERIODS_ENABLED!=='1')return send(res,404,{error:'工时跨期管理尚未启用'});
      const service=maintenanceCrossPeriod(),id=routeParam(crossPeriodRoute[1]);
      if(method==='GET')return send(res,200,service.view(id,user));
      const result=service.authorize(id,await bodyJson(req),user);bumpMaintenanceVersion('','maintenance.cross.period.changed');return send(res,200,result);
    }
    if(method==='GET' && ['/api/maintenance/hour-period-capabilities','/api/maintenance/hour-period-responsible-candidates'].includes(url.pathname)){
      const user=requireLogin(req,res);if(!user)return;
      const service=maintenanceHourPeriods(),capabilities=service.capabilities(user);
      if(!capabilities.view)return send(res,403,{error:'当前账号没有全维修范围账期查看权限'});
      if(url.pathname.endsWith('-capabilities'))return send(res,200,{enabled:process.env.MUC_MAINTENANCE_PERIODS_ENABLED==='1',...capabilities});
      if(process.env.MUC_MAINTENANCE_PERIODS_ENABLED!=='1')return send(res,404,{error:'工时账期管理尚未启用'});
      return send(res,200,service.candidates(Object.fromEntries(url.searchParams),user));
    }
    const periodRoute=url.pathname.match(/^\/api\/maintenance\/hour-periods\/(\d{4}-\d{2})(?:\/(assign|confirm))?$/);
    if(periodRoute && (method==='GET' && !periodRoute[2] || method==='POST' && periodRoute[2])) {
      const user=requireLogin(req,res);if(!user)return;
      if(process.env.MUC_MAINTENANCE_PERIODS_ENABLED!=='1')return send(res,404,{error:'工时账期管理尚未启用'});
      const service=maintenanceHourPeriods(),month=periodRoute[1];
      if(method==='GET')return send(res,200,service.view(month,user));
      const payload=await bodyJson(req);
      const result=periodRoute[2]==='assign'?service.assign(month,payload,user):service.confirm(month,payload,user);
      bumpMaintenanceVersion('','maintenance.hour.period.changed');return send(res,200,result);
    }
    const nonroutineReviewRoute = url.pathname.match(/^\/api\/maintenance\/nonroutine-reviews\/([^/]+)(?:\/(accept|opinion|seats|suggestions|opinion-history|finalization|finalize|sync|candidates|preview|cancel))?$/);
    if (nonroutineReviewRoute && ((method === "GET" && [undefined,"opinion-history","finalization","candidates"].includes(nonroutineReviewRoute[2])) || (method === "POST" && ["accept","opinion","seats","suggestions","finalize","sync","preview","cancel"].includes(nonroutineReviewRoute[2])))) {
      const viewer = requireLogin(req, res);
      if (!viewer) return;
      if (process.env.MUC_NONROUTINE_REVIEW_ENABLED !== "1") return send(res, 404, { error: "非例行评议尚未启用" });
      const service = nonroutineReviewService();
      const id = routeParam(nonroutineReviewRoute[1]);
      if(nonroutineReviewRoute[2]==='candidates')return send(res,200,service.candidates(id,Object.fromEntries(url.searchParams),viewer));
      if(nonroutineReviewRoute[2]==='cancel'){
        const cancellation=createNonroutineReviewCancellation({db,transaction:maintenanceTransaction,can:nonroutineReviewCan,qualifiedAccount:nonroutineReviewQualifiedAccount,sourceFacts:maintenanceReviewSourceFacts,clock:now,randomId});
        const result=cancellation.cancel(id,await bodyJson(req),viewer);
        bumpMaintenanceVersion('', 'maintenance.nonroutine.review.changed');
        return send(res,200,{cancellation:result});
      }
      
      if(["finalization","finalize","sync","preview"].includes(nonroutineReviewRoute[2])) {
        if(process.env.MUC_NONROUTINE_FINALIZATION_ENABLED!=="1")return send(res,404,{error:"非例行终审尚未启用"});
        const finalizer=nonroutineFinalizationService();
        if(nonroutineReviewRoute[2]==="preview")return send(res,200,{preview:finalizer.preview(id,await bodyJson(req),viewer)});
        if(method==="GET")return send(res,200,{finalization:finalizer.view(id,viewer)});
        const finalization=nonroutineReviewRoute[2]==="finalize"?finalizer.finalize(id,await bodyJson(req),viewer):finalizer.retry(id,viewer);
        bumpMaintenanceVersion("","maintenance.nonroutine.review.changed");
        return send(res,200,{finalization});
      }
      if (method === "GET" && nonroutineReviewRoute[2] === "opinion-history") return send(res, 200, { history: service.opinionHistory(id, {
        personId: url.searchParams.get("personId") || undefined,
        beforeRevision: url.searchParams.has("beforeRevision") ? url.searchParams.get("beforeRevision") : undefined
      }, viewer) });
      if (method === "GET") return send(res, 200, { review: service.view(id, viewer) });
      const payload = await bodyJson(req);
      const review = nonroutineReviewRoute[2] === "accept" ? service.accept(id, payload, viewer)
        : nonroutineReviewRoute[2] === "opinion" ? service.submitOpinion(id, payload, viewer)
          : nonroutineReviewRoute[2] === "suggestions" ? service.suggest(id, payload, viewer)
          : service.replaceUnsubmittedSeat(id, payload, viewer);
      bumpMaintenanceVersion("", "maintenance.nonroutine.review.changed");
      return send(res, 200, { review });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/import-capabilities") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!maintenanceHasAccess(manager) || !hasRbac(manager, "maintenance.opportunity.import")) return send(res, 403, { error: "当前账号没有维修导入权限" });
      const mode = hasRbac(manager, "maintenance.standard.view") && ["shadow", "draft"].includes(process.env.MUC_MAINTENANCE_V101) ? process.env.MUC_MAINTENANCE_V101 : "off";
      return send(res, 200, { mode, fileLimitBytes: 3 * 1024 * 1024 });
    }
    const maintenanceImportBatchRoute = url.pathname.match(/^\/api\/maintenance\/subtasks\/import\/(files\/preview|batches\/([^/]+)(?:\/rows\/(\d+)|\/(commit))?)$/);
    if (maintenanceImportBatchRoute && ((method === "POST" && (maintenanceImportBatchRoute[1] === "files/preview" || maintenanceImportBatchRoute[4])) ||
        (method === "GET" && maintenanceImportBatchRoute[2] && !maintenanceImportBatchRoute[3] && !maintenanceImportBatchRoute[4]) ||
        (method === "PUT" && maintenanceImportBatchRoute[3]))) {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!["shadow", "draft"].includes(process.env.MUC_MAINTENANCE_V101)) return send(res, 404, { error: "非例行导入批次尚未启用" });
      if (!maintenanceHasAccess(manager) || !hasRbac(manager, "maintenance.opportunity.import") || !hasRbac(manager, "maintenance.standard.view")) {
        return send(res, 403, { error: "当前账号没有导入及查看非例行标准的权限" });
      }
      const batches = maintenanceImportBatches();
      if (method === "POST" && maintenanceImportBatchRoute[1] === "files/preview") {
        const file = await parseNonroutineImportFile(await bodyJson(req));
        return send(res, 200, batches.create(file, manager));
      }
      const batchId = routeParam(maintenanceImportBatchRoute[2]);
      if (maintenanceImportBatchRoute[4]) {
        if (process.env.MUC_MAINTENANCE_V101 !== "draft") return send(res, 409, { error: "新导入写入尚未启用" });
        const result = batches.commit(batchId, await bodyJson(req), manager);
        if (!result.replayed && result.summary.created) {
          for (const flightId of new Set(result.results.filter(row => row.status === "SUCCESS").map(row => row.flightId))) {
            bumpMaintenanceVersion(flightId, "maintenance.nonroutine.import.drafted");
          }
        }
        return send(res, 200, result);
      }
      if (method === "GET") return send(res, 200, batches.view(batchId, manager));
      return send(res, 200, batches.decide(batchId, Number(maintenanceImportBatchRoute[3]), await bodyJson(req), manager));
    }
    if (method === "POST" && url.pathname === "/api/maintenance/subtasks/import/preview") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!["shadow", "draft"].includes(process.env.MUC_MAINTENANCE_V101)) return send(res, 404, { error: "非例行导入预览尚未启用" });
      if (!maintenanceHasAccess(manager) || !hasRbac(manager, "maintenance.opportunity.import") || !hasRbac(manager, "maintenance.standard.view")) {
        return send(res, 403, { error: "当前账号没有导入及查看非例行标准的权限" });
      }
      return send(res, 200, maintenanceNonroutineImportPreview(await bodyJson(req), manager));
    }
    if (method === "POST" && url.pathname === "/api/maintenance/subtasks/import") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.opportunity.import")) return send(res, 403, { error: "当前账号没有导入维修机会权限" });
      const payload = await bodyJson(req);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      if (!rows.length) return send(res, 400, { error: "未识别到有效附加工作，请检查表格内容" });
      const prepare = () => {
      const prepared=[], errors=[], seen=new Map();
      for (const [index,raw] of rows.entries()) {
        const rowNumber = Number.isInteger(raw?.rowNumber) && raw.rowNumber>0 ? raw.rowNumber : index + 2;
        try {
        const date = normalizeMaintenanceStatsDate(raw?.date ?? raw?.["日期"]);
        const flightNo = String(raw?.flightNo ?? raw?.flight_no ?? raw?.["进港航班号"] ?? raw?.["航班号"] ?? "").trim();
        const departureFlightNo = String(raw?.departureFlightNo ?? raw?.departure_flight_no ?? raw?.["出港航班号"] ?? "").trim();
        const aircraftNo = String(raw?.aircraftNo ?? raw?.aircraft_no ?? raw?.["机号"] ?? "").trim();
        const workKind = String(raw?.workKind ?? raw?.work_kind ?? raw?.["维修机会"] ?? "").trim();
        const location = maintenanceLocationForInput(raw);
        const chapter = String(raw?.chapter ?? raw?.["章节"] ?? "").trim();
        const category = String(raw?.category ?? raw?.["非例行类别"] ?? raw?.["类别"] ?? raw?.["工作类别"] ?? "").trim();
        const title = String(raw?.title ?? raw?.cardName ?? raw?.card_name ?? raw?.["工作标题"] ?? raw?.["工卡名称"] ?? "").trim();
        const standardHours = Number(raw?.standardHours ?? raw?.standard_hours ?? raw?.["标准工时"]);
        const priority = String(raw?.priority ?? raw?.["优先级"] ?? "普通").trim() || "普通";
        const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
        if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) throw maintenanceReviewError(`第 ${rowNumber} 行日期无效`);
        const identityError = maintenanceFlightValidationError({ date, flightNo, departureFlightNo, aircraftNo, workKind });
        if (identityError) throw maintenanceReviewError(`第 ${rowNumber} 行${identityError}`);
        if (!aircraftNo) throw maintenanceReviewError(`第 ${rowNumber} 行缺少机号`);
        if (!maintenanceOpportunityCategories.includes(workKind)) throw maintenanceReviewError(`第 ${rowNumber} 行维修机会无效`);
        if (!chapter) throw maintenanceReviewError(`第 ${rowNumber} 行缺少章节`);
        if (!title) throw maintenanceReviewError(`第 ${rowNumber} 行缺少工作标题`);
        if (!maintenanceNonroutineCategories.includes(category)) throw maintenanceReviewError(`第 ${rowNumber} 行非例行类别无效`);
        if (!Number.isFinite(standardHours) || !(standardHours > 0) || Math.abs(standardHours * 10 - Math.round(standardHours * 10)) > 1e-8) {
          throw maintenanceReviewError(`第 ${rowNumber} 行标准工时必须大于0且以0.1小时为单位`);
        }
        if (!["普通", "重要", "紧急"].includes(priority)) throw maintenanceReviewError(`第 ${rowNumber} 行优先级无效`);
        const flight = maintenanceAdditionalWorkTarget({ date, flightNo, departureFlightNo, aircraftNo, workKind, location }, manager, rowNumber);
        const subtask = maintenanceSubtaskPayload({ ...raw, chapter, category, title, standardHours, priority, status: "未派工" });
        assertMaintenanceLegacyTowCreation(subtask.category);
        const key=JSON.stringify([flight.id,subtask.cardNo,subtask.title,subtask.category]);
        const existing=db.prepare('select standard_hours from maintenance_subtasks where flight_id=? and trim(card_no)=? and trim(title)=? and trim(category)=?').all(flight.id,subtask.cardNo,subtask.title,subtask.category);
        if(existing.some(item=>Math.abs(Number(item.standard_hours)-subtask.standardHours)>1e-8) || seen.has(key) && Math.abs(seen.get(key)-subtask.standardHours)>1e-8) {
          throw maintenanceReviewError(`第 ${rowNumber} 行重复项目的标准工时不一致，请人工核对，未覆盖已有任务`);
        }
        const skip=existing.length>0 || seen.has(key);
        seen.set(key,subtask.standardHours);
        prepared.push({ rowNumber, flight, subtask, skip });
        } catch(error) {errors.push({rowNumber,detail:error.message.replace(/^第 \d+ 行/,''),status:error.status||400});}
      }
      const summary={total:rows.length,matched:prepared.length,created:prepared.filter(item=>!item.skip).length,skipped:prepared.filter(item=>item.skip).length,abnormal:errors.length};
      return {prepared,errors,summary};
      };
      if (payload.validateOnly) {const checked=prepare();return send(res,200,{valid:!checked.errors.length,count:checked.prepared.length,summary:checked.summary,errors:checked.errors});}
      const result = maintenanceTransaction(() => {
        const {prepared,errors,summary}=prepare();
        if(errors.length)throw Object.assign(maintenanceReviewError('附加工作校验失败，未导入任何数据',errors[0].status),{details:{errors,summary}});
        const matchedFlightIds = [...new Set(prepared.map(item => item.flight.id))];
        const stamp = now();
        for (const item of prepared) {
          if(item.skip)continue;
          const id = randomId("mtns");
          const subtask = item.subtask;
          db.prepare(`insert into maintenance_subtasks(id,flight_id,external_work_no,card_no,title,content,category,standard_hours,priority,status,remark,created_by,updated_by,created_at,updated_at)
            values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(id, item.flight.id, "", subtask.cardNo, subtask.title, subtask.content, subtask.category, subtask.standardHours, subtask.priority, "未派工", subtask.remark, manager.id, manager.id, stamp, stamp);
          maintenanceLog(manager, "import_subtask", "subtask", id, item.flight.id, JSON.stringify({ chapter: subtask.cardNo, rowNumber: item.rowNumber }));
        }
        const auditId = audit(manager, "maintenance_subtask_import", "maintenance", "subtasks", JSON.stringify({ ...summary, matchedFlightIds }));
        return { auditId,summary,created:summary.created,skipped:summary.skipped,matchedFlights:matchedFlightIds.length };
      });
      if(result.created)bumpMaintenanceVersion("", "maintenance.subtasks.imported");
      return send(res, 200, result);
    }
    if (method === "POST" && url.pathname === "/api/maintenance/flights/import") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.opportunity.import")) return send(res, 403, { error: "当前账号没有导入维修机会权限" });
      const p = await bodyJson(req);
      const rows = Array.isArray(p.rows) ? p.rows : [];
      if (p.validateOnly) {
        const checked=prepareMaintenanceFlightImport(rows);
        return send(res,200,{valid:rows.length>0 && !checked.errors.length,summary:checked.summary,errors:checked.errors});
      }
      let created = 0;
      let subCreated = 0;
      let skipped = 0;
      const imported = new Map();
      let summary;
      maintenanceTransaction(() => {
      const checked=prepareMaintenanceFlightImport(rows);
      if(!rows.length || checked.errors.length)throw Object.assign(maintenanceReviewError('航班计划校验失败，未导入任何数据'),{details:{errors:checked.errors,summary:checked.summary}});
      summary=checked.summary;
      const importRows=checked.prepared;
      for (const { raw, payload } of importRows) {
        const primaryNo = ["航前", "三方航前"].includes(payload.workKind) ? payload.departureFlightNo : payload.flightNo || payload.departureFlightNo || "";
        const matchKey = [payload.date, payload.aircraftNo.toLowerCase(), payload.workKind, primaryNo.toLowerCase(), payload.location.id].join("|");
        let flight = imported.get(matchKey);
        if (!flight) {
          const numberColumn = ["航前", "三方航前"].includes(payload.workKind) || !payload.flightNo && payload.departureFlightNo ? "departure_flight_no" : "flight_no";
          const matches = db.prepare(`select * from maintenance_flights where date=? and lower(trim(aircraft_no))=? and work_kind=? and lower(trim(${numberColumn}))=? and location_id=?`).all(payload.date, payload.aircraftNo.toLowerCase(), payload.workKind, primaryNo.toLowerCase(), payload.location.id);
          if (matches.length > 1) throw maintenanceReviewError("匹配到多个维修机会，请先核对航班计划");
          const existing = matches[0];
          flight = existing ? publicMaintenanceFlight(existing) : insertMaintenanceFlight(payload, manager);
          if (!existing) created++;
          imported.set(matchKey, flight);
        }
        if (flight && !flight.departureFlightNo && payload.departureFlightNo) {
          const updated = db.prepare("update maintenance_flights set departure_flight_no=?,updated_by=?,updated_at=? where id=? and coalesce(departure_flight_no,'')=''")
            .run(payload.departureFlightNo, manager.id, now(), flight.id);
          if (updated.changes) flight.departureFlightNo = payload.departureFlightNo;
        }
        const subPayload = maintenanceSubtaskPayload(raw);
        if (subPayload.title || subPayload.cardNo || subPayload.content) {
          subPayload.title ||= subPayload.cardNo || `${payload.workKind}非例行`;
          insertMaintenanceSubtask(flight.id, subPayload, manager);
          subCreated++;
        }
      }
      audit(manager, "maintenance_import", "maintenance", "flights", `维修机会 ${created} 条，非例行 ${subCreated} 条`);
      });
      bumpMaintenanceVersion("", "maintenance.imported");
      return send(res, 200, { created, subCreated, skipped, summary });
    }
    if (method === "POST" && url.pathname === "/api/maintenance/flights") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.opportunity.create")) return send(res, 403, { error: "当前账号没有新建维修机会权限" });
      const payload = maintenanceFlightPayload(await bodyJson(req));
      const validationError = maintenanceFlightValidationError(payload);
      if (validationError) return send(res, 400, { error: validationError });
      const flight = maintenanceTransaction(() => insertMaintenanceFlight(payload, manager));
      bumpMaintenanceVersion(flight.id, "maintenance.flight.created");
      return send(res, 201, { flight });
    }
    const maintenanceRemark = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/remark$/);
    if (maintenanceRemark && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有编辑备注权限" });
      const flightId = routeParam(maintenanceRemark[1]);
      const payload = await bodyJson(req);
      if (typeof payload.remark !== "string" || typeof payload.originalRemark !== "string" || payload.remark.length > 2000) {
        return send(res, 400, { error: "备注必须为文本，且不超过2000字" });
      }
      const remark = payload.remark.trim();
      db.exec("begin immediate");
      try {
        const row = db.prepare("select * from maintenance_flights where id=?").get(flightId);
        if (!row) throw maintenanceReviewError("未找到维修机会", 404);
        if (row.archived_at || !["未派工", "已派工", "已提报"].includes(row.status)) throw maintenanceReviewError("当前状态不允许修改备注", 409);
        if ((row.remark || "") !== payload.originalRemark) throw maintenanceReviewError("备注已被其他人员修改，请关闭后重新打开并核对内容", 409);
        const updated = db.prepare("update maintenance_flights set remark=?,updated_by=?,updated_at=? where id=? and coalesce(remark,'')=? and status=? and coalesce(archived_at,'')=''").run(remark, manager.id, now(), flightId, payload.originalRemark, row.status);
        if (!updated.changes) throw maintenanceReviewError("维修机会已发生变化，请关闭后重新打开并核对内容", 409);
        audit(manager, "maintenance_update_remark", "maintenanceFlight", flightId, JSON.stringify({ before: row.remark || "", after: remark }));
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      bumpMaintenanceVersion(flightId, "maintenance.remark.updated");
      return send(res, 200, { remark });
    }
    const maintenanceReview = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/review$/);
    if (maintenanceReview && method === "GET") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      const current=currentMaintenanceReviewActor(manager);
      if (!current || !hasRbac(current, "maintenance.review.view")) return send(res, 403, { error: "当前账号没有有效的维修复核查看资格" });
      const flightId=routeParam(maintenanceReview[1]),access=maintenanceReviewPersonnelScope(current,flightId);
      if(!access.canRead)return send(res,404,{error:'未找到可访问的航班任务'});
      const review = maintenanceReviewTree(flightId);
      if (!review) return send(res, 404, { error: "未找到航班任务" });
      review.canEditEntireTree=access.canEditEntireTree;
      if(!access.canEditEntireTree)delete review.defaults;
      return send(res, 200, { review });
    }
    if (maintenanceReview && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.review.submit")) return send(res, 403, { error: "当前账号没有提交维修复核权限" });
      const flightId = routeParam(maintenanceReview[1]);
      const review = saveMaintenanceReview(flightId, await bodyJson(req), manager);
      bumpMaintenanceVersion(flightId, "maintenance.review.saved");
      return send(res, 200, { review });
    }
    const maintenanceWorkReportRoute = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/work-report$/);
    if (maintenanceWorkReportRoute && ["GET", "PUT"].includes(method)) {
      const executor = requireLogin(req, res);
      if (!executor) return;
      return send(res, 410, { error: "旧版整合报工接口已停用，请刷新页面后使用例行或非例行报工" });
    }
    const maintenanceFlight = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)$/);
    if (maintenanceFlight && method === "GET") {
      const viewer = requireLogin(req, res);
      if (!viewer) return;
      if (!maintenanceHasAccess(viewer)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      const flightId = routeParam(maintenanceFlight[1]);
      const row = db.prepare("select * from maintenance_flights where id=?").get(flightId);
      if (!row) return send(res, 404, { error: "未找到航班任务" });
      const scope = url.searchParams.get("scope") || "dispatch";
      const full = scope === "execute" ? publicMaintenanceFlightForExecution(row, viewer) : publicMaintenanceFlight(row);
      if (!full || (!maintenanceCanManage(viewer) && !maintenanceTaskTreeAssignments(flightId).some(item => item.person_id === viewer.personId))) {
        return send(res, 403, { error: "无权查看该维修机会" });
      }
      return send(res, 200, { flight: full, version: maintenanceSyncVersion() });
    }
    if (maintenanceFlight && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.opportunity.update")) return send(res, 403, { error: "当前账号没有修改维修机会权限" });
      const flightId = routeParam(maintenanceFlight[1]);
      const existing = assertMaintenanceTreeDirectEditAllowed(flightId);
      if (!existing) return send(res, 404, { error: "未找到航班任务" });
      const input=await bodyJson(req);
      const flight=maintenanceTransaction(()=>{
        const actor=maintenanceCurrentMutationActor(manager,flightId,'maintenance.opportunity.update'),current=assertMaintenanceTreeDirectEditAllowed(flightId);
        if(Object.hasOwn(input,'expectedUpdatedAt'))assertMaintenanceFlightVersion(flightId,input);
        const payload=maintenanceFlightPayload(input,current),validationError=maintenanceFlightValidationError({...payload,departureFlightNo:payload.departureFlightNo??current.departure_flight_no});
        if(validationError)throw maintenanceDispatchError(validationError);
        if((payload.workKind||payload.workType)!==(current.work_kind||current.work_type)){
          invalidateMaintenanceReportCategory(flightId,'release',actor,'维修机会类别已修改');
          invalidateMaintenanceReportCategory(flightId,'routine',actor,'维修机会类别已修改');
        }
        return updateMaintenanceFlight(flightId,payload,actor);
      });
      if (!flight) return send(res, 404, { error: "未找到航班任务" });
      bumpMaintenanceVersion(flight.id, "maintenance.flight.updated");
      return send(res, 200, { flight });
    }
    if (maintenanceFlight && method === "DELETE") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.opportunity.delete")) return send(res, 403, { error: "当前账号没有删除维修机会权限" });
      const flightId = routeParam(maintenanceFlight[1]);
      const payload = await bodyJson(req);
      const deleted = deleteMaintenanceFlight(flightId, manager, payload?.reason);
      if (!deleted) return send(res, 404, { error: "未找到航班任务" });
      bumpMaintenanceVersion(flightId, "maintenance.flight.deleted");
      return send(res, 200, { ok: true });
    }
    const maintenanceSubtasks = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/subtasks$/);
    if (maintenanceSubtasks && method === "POST") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.content.manage")) return send(res, 403, { error: "当前账号没有维护工作内容权限" });
      const flightId = routeParam(maintenanceSubtasks[1]);
      const parent = assertMaintenanceTreeDirectEditAllowed(flightId);
      if (!parent) return send(res, 404, { error: "未找到航班任务" });
      const payload = maintenanceSubtaskPayload(await bodyJson(req));
      assertMaintenanceLegacyTowCreation(payload.category);
      if (!payload.title) return send(res, 400, { error: "请填写非例行标题" });
      const flight=maintenanceTransaction(()=>{
        const current=maintenanceCurrentMutationActor(manager,flightId);
        assertMaintenanceTreeDirectEditAllowed(flightId);
        invalidateMaintenanceReportCategory(flightId,'nonroutine',current,'新增非例行');
        if(!maintenanceSourceRows(flightId).some(source=>source.state==='ACTIVE')&&!maintenanceManualSubmissionEnabled())db.prepare("delete from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").run(flightId);
        return insertMaintenanceSubtask(flightId,payload,current);
      });
      if (!flight) return send(res, 404, { error: "未找到航班任务" });
      bumpMaintenanceVersion(flightId, "maintenance.nonroutine.created");
      return send(res, 201, { flight });
    }
    const maintenanceSubtask = url.pathname.match(/^\/api\/maintenance\/subtasks\/([^/]+)$/);
    if (maintenanceSubtask && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.content.manage")) return send(res, 403, { error: "当前账号没有维护工作内容权限" });
      const subtaskId = routeParam(maintenanceSubtask[1]);
      const existing = db.prepare("select * from maintenance_subtasks where id=?").get(subtaskId);
      if (!existing) return send(res, 404, { error: "未找到非例行" });
      assertMaintenanceTreeDirectEditAllowed(existing.flight_id);
      const editPayload=maintenanceSubtaskPayload(await bodyJson(req));
      assertMaintenanceLegacyTowCreation(editPayload.category,{existingCategory:existing.category});
      const flight=maintenanceTransaction(()=>{
        const current=maintenanceCurrentMutationActor(manager,existing.flight_id),latest=db.prepare('select * from maintenance_subtasks where id=?').get(subtaskId);
        if(!latest||latest.flight_id!==existing.flight_id)throw maintenanceReviewError('原工作已变化，请刷新后重试',409);
        assertMaintenanceTreeDirectEditAllowed(existing.flight_id);
        assertMaintenanceLegacyTowCreation(editPayload.category,{existingCategory:latest.category});
        assertMaintenanceManagedContentUnlocked(existing.flight_id);
        invalidateMaintenanceReportCategory(existing.flight_id,'nonroutine',current,'修改非例行');
        return updateMaintenanceSubtask(subtaskId,editPayload,current);
      });
      if (!flight) return send(res, 404, { error: "未找到非例行" });
      bumpMaintenanceVersion(flight.id, "maintenance.nonroutine.updated");
      return send(res, 200, { flight });
    }
    if (maintenanceSubtask && method === "DELETE") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.content.manage")) return send(res, 403, { error: "当前账号没有维护工作内容权限" });
      const subtaskId = routeParam(maintenanceSubtask[1]);
      const row = db.prepare("select flight_id from maintenance_subtasks where id=?").get(subtaskId);
      if (!row) return send(res, 404, { error: "未找到非例行" });
      const payload = await bodyJson(req);
      const flight = deleteMaintenanceSubtask(subtaskId, manager, payload?.reason);
      bumpMaintenanceVersion(row.flight_id, "maintenance.nonroutine.deleted");
      return send(res, 200, { flight });
    }
    const maintenanceDispatch = url.pathname.match(/^\/api\/maintenance\/(flights|subtasks)\/([^/]+)\/dispatch$/);
    if (maintenanceDispatch && method === "POST") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.assignment.manage")) return send(res, 403, { error: "当前账号没有派工权限" });
      const p = await bodyJson(req);
      const ownerType = maintenanceDispatch[1] === "flights" ? "flight" : "subtask";
      const ownerId = routeParam(maintenanceDispatch[2]);
      const owner = maintenanceOwner(ownerType, ownerId);
      if (!owner) return send(res, 404, { error: "未找到任务" });
      assertMaintenanceTreeDirectEditAllowed(ownerType === "flight" ? owner.id : owner.flight_id);
      const flight = setMaintenanceAssignments(ownerType, ownerId, Array.isArray(p.assignments) ? p.assignments : [], manager, String(p.expectedUpdatedAt || ""));
      if (!flight) return send(res, 404, { error: "未找到任务" });
      const assigned = ownerType === "flight" ? flight.assignments : (flight.subtasks || []).find(item => item.id === ownerId)?.assignments || [];
      if (!assigned.length) return send(res, 400, { error: "请选择派工人员" });
      bumpMaintenanceVersion(flight.id, "maintenance.dispatched");
      return send(res, 200, { flight });
    }
    const assignmentRemoval = url.pathname.match(/^\/api\/maintenance\/assignments\/([^/]+)(\/removal-preview)?$/);
    if (assignmentRemoval && (method === "DELETE" && !assignmentRemoval[2] || method === "POST" && assignmentRemoval[2])) {
      const manager = requireLogin(req, res); if (!manager) return;
      const result = maintenanceAssignmentRemoval(routeParam(assignmentRemoval[1]), await bodyJson(req), manager, method === "DELETE");
      if (result.flight) bumpMaintenanceVersion(result.flight.id, "maintenance.dispatch.removed");
      return send(res, 200, result);
    }
    const maintenanceAssignmentAction = url.pathname.match(/^\/api\/maintenance\/assignments\/([^/]+)\/complete$/);
    if (maintenanceAssignmentAction && method === "POST") {
      const executor = requireLogin(req, res);
      if (!executor) return;
      if (!maintenanceCanExecute(executor, true)) return send(res, 403, { error: "当前账号没有提交维修报工的权限" });
      const assignmentId = routeParam(maintenanceAssignmentAction[1]);
      const assignment = db.prepare("select * from maintenance_assignments where id=?").get(assignmentId);
      if (!assignment) return send(res, 404, { error: "未找到派工任务" });
      if (assignment.person_id !== executor.personId && !personnelAccess.allows(executor, "maintenance", assignment.person_id)) return send(res, 403, { error: "只能反馈派给自己的任务" });
      if (assignment.owner_type !== "flight" || assignment.role !== "放行") return send(res, 409, { error: assignment.owner_type === "subtask" ? "非例行请使用汇总报工" : "例行工作请使用例行报工" });
      const flight = submitMaintenanceRelease(assignment.flight_id, await bodyJson(req), executor);
      bumpMaintenanceVersion(assignment.flight_id, "maintenance.release.submitted");
      return send(res, 200, { flight });
    }
    if(method==='GET'&&url.pathname==='/api/maintenance/rules/history'){
      const login=requireLogin(req,res);if(!login)return;
      if(!hasAnyRbac(login,['maintenance.rules.view','maintenance.rules.manage']))return send(res,403,{error:'当前账号没有查看工时规则历史的权限'});
      return send(res,200,maintenanceRuleHistory().list(Object.fromEntries(url.searchParams)));
    }
    if (method === "GET" && url.pathname === "/api/maintenance/rules") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!hasAnyRbac(login, ["maintenance.rules.view", "maintenance.rules.manage"])) return send(res, 403, { error: "当前账号没有查看工时规则的权限" });
      return send(res,200,maintenanceRulesEnvelope());
    }
    if (method === "POST" && url.pathname === "/api/maintenance/rules/aircraft-preview") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.rules.manage")) return send(res, 403, { error: "当前账号没有工时规则维护权限" });
      const p = await bodyJson(req);
      const config = normalizeAircraftHours(p.aircraftHours, maintenanceOpportunityOrder);
      const affected = maintenanceAircraftImpact(config);
      const visible = new Set(maintenanceVisibleFlights(manager).rows.map(flight => flight.id));
      return send(res, 200, { affected: affected.filter(flight => visible.has(flight.id)), affectedCount: affected.length, confirmation: crypto.createHash("sha256").update(JSON.stringify(affected)).digest("hex") });
    }
    if (method === "PUT" && url.pathname === "/api/maintenance/rules") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.rules.manage")) return send(res, 403, { error: "当前账号没有工时规则维护权限" });
      const p = await bodyJson(req);
      const rows = Array.isArray(p.rules) ? p.rules : [];
      assertLegacyTowRuleWrites({mode:process.env.MUC_TOW_STANDARD_ONLY_ENABLED==='1'?'STANDARD_ONLY':'LEGACY'},rows);
      if (rows.some(row => String(row.rule_type || row.ruleType || "").trim() === "workType")) {
        throw maintenanceDispatchError("旧标准工时已停止维护，请使用机型组配置。未保存任何修改。");
      }
      const upsert = db.prepare("insert into maintenance_hour_rules(id,rule_type,name,value,created_at,updated_at) values(?,?,?,?,?,?) on conflict(rule_type,name) do update set value=excluded.value,updated_at=excluded.updated_at");
      const routineRows = rows.filter(row => String(row.rule_type || row.ruleType || "").trim() === "routineRatio");
      const combinationRows = rows.filter(row => String(row.rule_type || row.ruleType || "").trim() === "nonroutineCombinationRatio");
      validateMaintenanceRoutineRules(routineRows);
      if (combinationRows.length) validateMaintenanceNonroutineCombinationRules(combinationRows);
      maintenanceTransaction(() => {
        const current=maintenanceCurrentRulesManager(manager),journal=maintenanceRuleHistory(),before=journal.begin(p.ruleVersion);
        assertLegacyTowRuleWrites({mode:process.env.MUC_TOW_STANDARD_ONLY_ENABLED==='1'?'STANDARD_ONLY':'LEGACY'},rows);
        if (p.aircraftHours) {
          const previous = maintenanceAircraftConfig();
          if (Number(p.aircraftHours.version) !== previous.version) throw maintenanceReviewError("工时机型组已被修改，请刷新后重试", 409);
          const next = normalizeAircraftHours(p.aircraftHours, maintenanceOpportunityOrder);
          const reason = String(p.reason || "").trim();
          if (!reason || reason.length > 1000) throw maintenanceDispatchError("修改机型组须填写原因（最多1000字）");
          const affected = maintenanceAircraftImpact(next);
          const confirmation = crypto.createHash("sha256").update(JSON.stringify(affected)).digest("hex");
          if (affected.length && p.confirmation !== confirmation) throw maintenanceReviewError("受影响未报工航班已变化，请重新预览确认", 409);
          setSetting("maintenance_aircraft_hours_v1", { ...next, version: previous.version + 1 });
          audit(current, "maintenance_aircraft_hours_update", "maintenance", "rules", JSON.stringify({ reason, before: previous, after: next, affected }));
        }
        for (const row of rows) {
          const ruleType = String(row.rule_type || row.ruleType || "").trim();
          let name = String(row.name || "").trim();
          if (!["roleRatio", "routineRatio", "nonroutineCategoryHours", "nonroutineCombinationRatio"].includes(ruleType)) continue;
          if (ruleType === "routineRatio") name = maintenanceRoutineRuleName(String(row.opportunity || "").trim(), String(row.role || "").trim());
          if (ruleType === "nonroutineCombinationRatio") name = `${String(row.combination || "").trim()}::${String(row.role || "").trim()}`;
          if (!name || (ruleType === "roleRatio" && name === "放行")) continue;
          const value = Number(row.value);
          if (!Number.isFinite(value) || value < 0) throw maintenanceDispatchError("工时和分配比例不能为负数");
          if (ruleType === "nonroutineCategoryHours" && (name !== "拖机" || value <= 0 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-8)) {
            throw maintenanceDispatchError("拖机默认总工时必须大于0且以0.1小时为单位");
          }
          upsert.run(row.id || randomId("mtnr"), ruleType, name, value, now(), now());
        }
        const recorded=journal.record(before,{actor:current,qualification:{accountId:current.id,personId:current.personId,permissions:current.rbacPermissions,scopes:current.dataScopes},reason:p.reason});
        audit(current,'maintenance_update_rules','maintenance','rules',JSON.stringify({ruleCount:rows.length,journal:recorded}));
      });
      bumpMaintenanceVersion("", "maintenance.rules.updated");
      return send(res,200,maintenanceRulesEnvelope());
    }
    if (method === "GET" && url.pathname === "/api/maintenance/stats") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!hasRbac(login, "maintenance.stats.manage.view")) return send(res, 403, { error: "当前账号没有管理范围维修统计权限" });
      return send(res, 200, maintenanceStats(Object.fromEntries(url.searchParams.entries()), login));
    }
    if (method === "GET" && url.pathname === "/api/maintenance/stats/personal") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!hasRbac(login, "maintenance.stats.self.view")) return send(res, 403, { error: "当前账号没有本人维修统计权限" });
      return send(res, 200, maintenancePersonalStats(Object.fromEntries(url.searchParams.entries()), login));
    }
    if (method === "GET" && url.pathname === "/api/maintenance/stats/personal/details") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!hasAnyRbac(login, ["maintenance.stats.self.view", "maintenance.stats.manage.view"])) return send(res, 403, { error: "当前账号没有维修统计权限" });
      return send(res, 200, maintenancePersonalDetails(Object.fromEntries(url.searchParams.entries()), login));
    }
    const nonroutineAuditMatch = url.pathname.match(/^\/api\/maintenance\/subtasks\/([^/]+)\/hour-audit$/);
    if (method === "GET" && nonroutineAuditMatch) {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login) && !maintenanceCanManage(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      const detail = maintenanceNonroutineAuditDetail(routeParam(nonroutineAuditMatch[1]), login);
      if (detail === null) return send(res, 404, { error: "未找到非例行工作" });
      if (detail === false) return send(res, 403, { error: "只能查看自己参与的非例行工作" });
      return send(res, 200, { detail });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/report") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceCanManage(login)) return send(res, 403, { error: "当前账号没有查看综合报表的权限" });
      return send(res, 200, maintenanceReport(Object.fromEntries(url.searchParams.entries()), login));
    }
    if (method === "GET" && url.pathname === "/api/maintenance/report/options") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceCanManage(login)) return send(res, 403, { error: "当前账号没有查看综合报表的权限" });
      return send(res, 200, maintenanceReportOptions(Object.fromEntries(url.searchParams.entries()), login));
    }
    const opportunityAuditMatch = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/report-detail$/);
    if (method === "GET" && opportunityAuditMatch) {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceCanManage(login)) return send(res, 403, { error: "当前账号没有查看综合报表的权限" });
      const detail = maintenanceOpportunityAuditDetail(routeParam(opportunityAuditMatch[1]), maintenanceReportAllowedPersonIds(login));
      return detail ? send(res, 200, { detail }) : send(res, 404, { error: "未找到维修机会" });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/report/export.xlsx") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceCanManage(login)) return send(res, 403, { error: "当前账号没有导出综合报表的权限" });
      const params = Object.fromEntries(url.searchParams.entries());
      const sections = String(params.sections || "").split(",").map(item => item.trim()).filter(Boolean);
      const data = maintenanceReportDataset(params, login);
      if (sections.includes("opportunities")) data.opportunitiesAudit = maintenanceReportDataset({ ...params, view: "opportunities" }, login).opportunities;
      if (sections.includes("nonroutine")) {
        const filters = maintenanceReportFilters({ ...params, view: "nonroutine" });
        if (filters.dateFrom > filters.dateTo) [filters.dateFrom, filters.dateTo] = [filters.dateTo, filters.dateFrom];
        data.nonroutineAudit = maintenanceNonroutineAuditQuery(filters, { paged: false, user: login }).rows;
      }
      const workbook = maintenanceReportXlsx(data, sections);
      const filename = `维修管控综合报表_${data.filters.dateFrom}_${data.filters.dateTo}.xlsx`;
      return sendBinary(res, 200, workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` });
    }
    const maintenanceHour = url.pathname.match(/^\/api\/maintenance\/hours\/([^/]+)$/);
    if (maintenanceHour && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.hours.adjust")) return send(res, 403, { error: "当前账号没有工时调整权限" });
      const p = await bodyJson(req);
      const hourId = routeParam(maintenanceHour[1]);
      const adjusted=maintenanceTransaction(()=>{
      const target=db.prepare("select * from maintenance_effective_hour_results where id=?").get(hourId);
      personnelAccess.requirePerson(manager,"maintenance",target?.person_id);
      if(target?.owner_type==='subtask'&&db.prepare("select 1 from maintenance_nonroutine_corrections where subtask_id=?").get(target.owner_id))throw maintenanceReviewError('该来源已有独立更正，不能通过旧调时接口覆盖净额',409);
      if(target?.source==='审核补记' || target?.owner_type==='subtask' && maintenanceNonroutineAssessment({id:target.owner_id}))throw maintenanceReviewError('标准或评议认定来源不可通过旧调时接口改写，请按原报工来源核对或走授权更正',409);
      db.prepare("update maintenance_hour_results set adjusted_hours=?,updated_at=? where id=?").run(Number(p.adjustedHours ?? p.adjusted_hours ?? 0), now(), hourId);
      audit(manager, "maintenance_adjust_hours", "maintenanceHour", hourId, String(p.adjustedHours ?? ""));
      return db.prepare("select * from maintenance_effective_hour_results where id=?").get(hourId);
      });
      bumpMaintenanceVersion(adjusted?.flight_id || "", "maintenance.hours.adjusted");
      return send(res, 200, { hour: publicMaintenanceHour(adjusted) });
    }
    const maintenanceConfirmHour = url.pathname.match(/^\/api\/maintenance\/hours\/([^/]+)\/confirm$/);
    if (maintenanceConfirmHour && method === "POST") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.hours.confirm")) return send(res, 403, { error: "当前账号没有工时确认权限" });
      const hourId = routeParam(maintenanceConfirmHour[1]);
      const hour = db.prepare("select * from maintenance_effective_hour_results where id=?").get(hourId);
      if(!hour)return send(res,404,{error:'未找到可确认的工时结果'});
      maintenanceTransaction(()=>{
      personnelAccess.requirePerson(manager,"maintenance",hour?.person_id);
      if(db.prepare('select 1 from maintenance_nonroutine_role_results where id=?').get(hourId))throw maintenanceReviewError('核算角色明细须沿原任务树整体确认，不能逐角色确认',409);
      if(hour.status!=='待复核')throw maintenanceReviewError('工时尚未进入待复核或已经确认，不能直接确认',409);
      db.prepare("update maintenance_hour_results set status='已确认',confirmed_by=?,confirmed_at=?,updated_at=? where id=?").run(manager.id, now(), now(), hourId);
      db.prepare("update maintenance_assignments set status='已确认',confirmed_at=? where id=(select assignment_id from maintenance_effective_hour_results where id=?)").run(now(), hourId);
      if (hour) syncMaintenanceOwnerConfirmation(hour.owner_type, hour.owner_id, manager.id);
      });
      audit(manager, "maintenance_confirm_hours", "maintenanceHour", hourId);
      bumpMaintenanceVersion(hour?.flight_id || "", "maintenance.hours.confirmed");
      return send(res, 200, { hour: publicMaintenanceHour(db.prepare("select * from maintenance_effective_hour_results where id=?").get(hourId)) });
    }
    if (method === "POST" && url.pathname === "/api/maintenance/hours/confirm-batch") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.hours.confirm")) return send(res, 403, { error: "当前账号没有批量确认权限" });
      const p = await bodyJson(req);
      const ids = Array.from(new Set((Array.isArray(p.ids) ? p.ids : []).map(item => String(item))));
      const hours = ids.length ? db.prepare(`select * from maintenance_effective_hour_results where id in (${ids.map(() => "?").join(",")})`).all(...ids) : [];
      if(hours.length!==ids.length || hours.some(row=>!personnelAccess.allows(manager,"maintenance",row.person_id)))return send(res,404,{error:"工时不存在或超出范围"});
      if(hours.some(row=>row.status!=='待复核'))return send(res,409,{error:'所选工时包含未完成报工确认或已确认记录，请刷新后重试'});
      maintenanceTransaction(()=>{
      ids.forEach(id => db.prepare("update maintenance_hour_results set status='已确认',confirmed_by=?,confirmed_at=?,updated_at=? where id=?").run(manager.id, now(), now(), id));
      ids.forEach(id => db.prepare("update maintenance_assignments set status='已确认',confirmed_at=? where id=(select assignment_id from maintenance_effective_hour_results where id=?)").run(now(), id));
      const owners = new Map(hours.map(row => [`${row.owner_type}:${row.owner_id}`, row]));
      owners.forEach(row => syncMaintenanceOwnerConfirmation(row.owner_type, row.owner_id, manager.id));
      });
      audit(manager, "maintenance_batch_confirm_hours", "maintenanceHour", "batch", `${ids.length} 条`);
      bumpMaintenanceVersion("", "maintenance.hours.confirmed");
      return send(res, 200, { confirmed: ids.length });
    }
    const maintenanceConfirmSortie = url.pathname.match(/^\/api\/maintenance\/sorties\/([^/]+)\/confirm$/);
    if (maintenanceConfirmSortie && method === "POST") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.hours.confirm")) return send(res, 403, { error: "当前账号没有架次确认权限" });
      const sortieId = routeParam(maintenanceConfirmSortie[1]);
      const sortie = db.prepare("select * from maintenance_sortie_results where id=?").get(sortieId);
      if (!sortie) return send(res, 404, { error: "未找到放行架次记录" });
      maintenanceTransaction(()=>{
      personnelAccess.requirePerson(manager,"maintenance",sortie.person_id);
      if(sortie.status!=='待复核')throw maintenanceReviewError('架次尚未进入待复核或已经确认，不能直接确认',409);
      db.prepare("update maintenance_sortie_results set status='已确认',sorties=1,confirmed_by=?,confirmed_at=?,updated_at=? where id=?").run(manager.id, now(), now(), sortieId);
      db.prepare("update maintenance_assignments set status='已确认',confirmed_at=? where id=?").run(now(), sortie.assignment_id);
      syncMaintenanceOwnerConfirmation(sortie.owner_type, sortie.owner_id, manager.id);
      });
      audit(manager, "maintenance_confirm_sortie", "maintenanceSortie", sortieId);
      bumpMaintenanceVersion(sortie.flight_id || "", "maintenance.sorties.confirmed");
      return send(res, 200, { sortie: publicMaintenanceSortie(db.prepare("select * from maintenance_sortie_results where id=?").get(sortieId)) });
    }
    if (method === "POST" && url.pathname === "/api/maintenance/sorties/confirm-batch") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!hasRbac(manager, "maintenance.hours.confirm")) return send(res, 403, { error: "当前账号没有批量确认架次权限" });
      const p = await bodyJson(req);
      const ids = Array.from(new Set((Array.isArray(p.ids) ? p.ids : []).map(item => String(item))));
      const sorties = ids.length ? db.prepare(`select * from maintenance_sortie_results where id in (${ids.map(() => "?").join(",")})`).all(...ids) : [];
      if(sorties.length!==ids.length || sorties.some(row=>!personnelAccess.allows(manager,"maintenance",row.person_id)))return send(res,404,{error:"架次不存在或超出范围"});
      if(sorties.some(row=>row.status!=='待复核'))return send(res,409,{error:'所选架次包含未完成报工确认或已确认记录，请刷新后重试'});
      maintenanceTransaction(()=>{
      for (const sortie of sorties) {
        db.prepare("update maintenance_sortie_results set status='已确认',sorties=1,confirmed_by=?,confirmed_at=?,updated_at=? where id=?").run(manager.id, now(), now(), sortie.id);
        db.prepare("update maintenance_assignments set status='已确认',confirmed_at=? where id=?").run(now(), sortie.assignment_id);
        syncMaintenanceOwnerConfirmation(sortie.owner_type, sortie.owner_id, manager.id);
      }
      });
      audit(manager, "maintenance_batch_confirm_sorties", "maintenanceSortie", "batch", `${sorties.length} 条`);
      bumpMaintenanceVersion("", "maintenance.sorties.confirmed");
      return send(res, 200, { confirmed: sorties.length });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/export.xlsx") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!hasRbac(login, "maintenance.export")) return send(res, 403, { error: "当前账号没有导出权限" });
      const workbook = maintenanceXlsx(maintenanceStats(Object.fromEntries(url.searchParams.entries()), login));
      return sendBinary(res, 200, workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("维修管控工时统计.xlsx")}` });
    }
    if (method === "GET" && url.pathname === "/api/stats/reading") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!canUseStats(login)) return send(res, 403, { error: "当前账号没有统计权限" });
      return send(res, 200, readingStats(Object.fromEntries(url.searchParams.entries())));
    }
    if (method === "GET" && url.pathname === "/api/stats/reading/export.csv") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!canUseStats(login)) return send(res, 403, { error: "当前账号没有统计权限" });
      const csv = "\ufeff" + statsCsv(readingStats(Object.fromEntries(url.searchParams.entries())));
      return sendText(res, 200, csv, "text/csv; charset=utf-8", { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("信息阅读统计.csv")}` });
    }
    if (method === "GET" && url.pathname === "/api/stats/reading/export.xlsx") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!canUseStats(login)) return send(res, 403, { error: "当前账号没有统计权限" });
      const workbook = statsXlsx(readingStats(Object.fromEntries(url.searchParams.entries())));
      return sendBinary(res, 200, workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("信息阅读统计.xlsx")}` });
    }
    if (method === "GET" && url.pathname === "/api/settings") {
      const login = requireLogin(req, res);
      if (!login) return;
      return send(res, 200, { settings: publicSettings() });
    }
    if (method === "PUT" && url.pathname === "/api/settings") {
      const admin = requireRbacPermission(req, res, "settings.manage");
      if (!admin) return;
      const p = await bodyJson(req);
      const categories = normalizeCategoryList(p.categories);
      const syncedCategories = syncRecordCategories(categories);
      setSetting("categories", syncedCategories);
      setSetting("overdueDays", Math.max(1, Number(p.overdueDays || 3)));
      setSetting("reminderDays", Math.max(1, Number(p.reminderDays || 1)));
      audit(admin, "update_settings", "settings", "system", `${syncedCategories.length} 个分类`);
      return send(res, 200, { settings: publicSettings() });
    }
    if (url.pathname === '/api/info/sync' && method === 'POST') {
      const login=requireRbacPermission(req,res,'info.read'); if(!login)return;const user=withInfoAccess(login);
      const input=await bodyJson(req);
      if(!Array.isArray(input.knownIds) || input.knownIds.length>50000)return send(res,400,{error:'同步记录数量无效'});
      const delta=infoSync.changes(user,input.cursor,input.knownIds);
      const details=input.details===true && hasRbac(user,'info.stats.read');
      const content=publicRecords(details?[...delta.content,...delta.receipt]:delta.content,user,{summary:!details});
      const receiptData=publicRecords(delta.receipt,user,{summary:true});
      const updates=receiptData.records.map(record=>{
        return {id:record.id,feedbackSummary:record.feedbackSummary,
          ownReceipts:record.receipts.filter(r=>r.userId===user.id)};
      });
      return send(res,200,{reset:delta.reset,cursor:delta.cursor,records:content.records,receipts:content.receipts,updates:details?[]:updates,removed:delta.removed});
    }
    if (url.pathname === '/api/info/events' && method === 'GET') {
      const login=requireRbacPermission(req,res,'info.read'); if(!login)return;const user=withInfoAccess(login);
      const active=[...infoEventClients].filter(c=>c.user.id===user.id);
      if(active.length>=5)return send(res,429,{error:'实时连接数量已达上限'});
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'});
      const known=new Set(db.prepare('select * from records').all().filter(r=>canViewRecord(user,r)).map(r=>r.id));
      const client={req,res,user,known}; infoEventClients.add(client);
      res.write('retry: 10000\nevent: info\ndata: {"kind":"connected"}\n\n');
      res.on('close',()=>infoEventClients.delete(client));
      return;
    }
    if (method === "GET" && url.pathname === "/api/records") {
      const login = requireLogin(req, res);
      if (!login) return;
      const version=infoSync.latest();
      const viewer=withInfoAccess(login);
      const rows = db.prepare("select * from records").all().filter(row => canViewRecord(viewer, row)).sort(compareRecordsDesc);
      const result = publicRecords(rows, viewer,{summary:url.searchParams.get('summary')==='1'});
      return send(res, 200, { ...result, cursor:infoSync.encode(viewer,version), settings: publicSettings() });
    }
    if (method === "POST" && url.pathname === "/api/records") {
      const editor = requireRbacPermission(req, res, "info.create");
      if (!editor) return;
      const p = await bodyJson(req);
      const rid = randomId("rec");
      maintenanceTransaction(() => {
      const selectedRecipients = recipientsFromPayload(p);
      db.prepare("insert into records(id,date,publisher,category,title,summary,original,source_set,created_by,updated_by,created_at,updated_at,deadline,priority,publish_status,publisher_id,imported_read) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(rid, p.date, editor.name, p.category, p.title, "", p.original, "后台录入", editor.id, editor.id, now(), now(), p.deadline || deadlineFor(p.date), p.priority || "普通", p.publishStatus || "已发布", editor.id, 0);
      saveRecipients(rid, selectedRecipients);
      audit(editor, "create_record", "record", rid, p.title);
      });
      return send(res, 201, { record: publicRecord(db.prepare("select * from records where id=?").get(rid), editor) });
    }
    const rec = url.pathname.match(/^\/api\/records\/([^/]+)$/);
    if(rec && method==='GET'){
      const user=requireRbacPermission(req,res,'info.read'); if(!user)return;
      const row=db.prepare('select * from records where id=?').get(routeParam(rec[1]));
      if(!canViewRecord(user,row))return send(res,404,{error:'未找到信息'});
      return send(res,200,{record:publicRecord(row,user)});
    }
    if (rec && method === "PUT") {
      const editor = requireLogin(req, res);
      if (!editor) return;
      const p = await bodyJson(req);
      const recordId = routeParam(rec[1]);
      const existing = db.prepare("select * from records where id=?").get(recordId);
      if (!existing) return send(res, 404, { error: "未找到信息" });
      if (!canEditRecord(editor, existing)) return send(res, 403, { error: "当前账号无权修改该信息" });
      if(String(p.expectedUpdatedAt||'')!==existing.updated_at)return send(res,409,{error:'信息已被更新，请重新核对后保存',code:'INFO_EDIT_CONFLICT'});
      maintenanceTransaction(() => {
      const stamp=new Date(Math.max(Date.now(),Date.parse(existing.updated_at)+1||0)).toISOString();
      const changed=db.prepare("update records set date=?,category=?,title=?,original=?,updated_by=?,updated_at=?,deadline=?,priority=?,publish_status=? where id=? and updated_at=?")
        .run(p.date, p.category, p.title, p.original, editor.id, stamp, p.deadline || existing.deadline || deadlineFor(p.date), p.priority || existing.priority || "普通", p.publishStatus || existing.publish_status || "已发布", recordId,existing.updated_at);
      if(!changed.changes)throw Object.assign(new Error('信息已被更新，请重新核对后保存'),{status:409,code:'INFO_EDIT_CONFLICT'});
      if (Array.isArray(p.recipients) || p.allInScope === true) saveRecipients(recordId, recipientsFromPayload(p));
      audit(editor, "update_record", "record", recordId, p.title);
      });
      return send(res, 200, { record: publicRecord(db.prepare("select * from records where id=?").get(recordId), editor) });
    }
    if (rec && method === "DELETE") {
      const login = requireLogin(req, res);
      if (!login) return;
      const recordId = routeParam(rec[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if (!canDeleteRecord(login, row)) return send(res, 403, { error: "当前账号无权删除该信息" });
      await removeOwnerAttachmentFiles("record", recordId);
      maintenanceTransaction(()=>{
      db.prepare("delete from records where id=?").run(recordId);
      db.prepare("delete from record_recipients where record_id=?").run(recordId);
      db.prepare("delete from read_receipts where record_id=?").run(recordId);
      db.prepare("delete from attachments where owner_type='record' and owner_id=?").run(recordId);
      db.prepare("delete from favorites where record_id=?").run(recordId);
      audit(login, "delete_record", "record", recordId, row.title);
      });
      return send(res, 200, { ok: true });
    }
    const voidRecord = url.pathname.match(/^\/api\/records\/([^/]+)\/void$/);
    if (voidRecord && method === "POST") {
      const login = requireLogin(req, res);
      if (!login) return;
      const recordId = routeParam(voidRecord[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if (!canVoidRecord(login, row)) return send(res, 403, { error: "只能作废自己发布的信息" });
      db.prepare("update records set publish_status='作废',updated_by=?,updated_at=? where id=?").run(login.id, now(), recordId);
      audit(login, "void_record", "record", recordId, row.title);
      return send(res, 200, { record: publicRecord(db.prepare("select * from records where id=?").get(recordId), login) });
    }
    const restoreRecord = url.pathname.match(/^\/api\/records\/([^/]+)\/restore$/);
    if (restoreRecord && method === "POST") {
      const admin = requireRbacPermission(req, res, "info.restore");
      if (!admin) return;
      const recordId = routeParam(restoreRecord[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if ((row.publish_status || "已发布") !== "作废") return send(res, 400, { error: "只有作废信息可以恢复" });
      if(!isRecordOwner(admin,row) && !dataScopeAllowsUser(admin,row.publisher_id || row.created_by,"info"))return send(res,404,{error:"未找到信息"});
      const restoredAt = now();
      maintenanceTransaction(()=>{
      db.prepare("update records set date=?,deadline=?,publish_status='已发布',updated_by=?,updated_at=? where id=?")
        .run(restoredAt, deadlineFor(restoredAt), admin.id, restoredAt, recordId);
      db.prepare("delete from read_receipts where record_id=?").run(recordId);
      audit(admin, "restore_record", "record", recordId, row.title);
      });
      return send(res, 200, { record: publicRecord(db.prepare("select * from records where id=?").get(recordId), admin) });
    }
    const read = url.pathname.match(/^\/api\/records\/([^/]+)\/read$/);
    if (read && method === "POST") {
      const login = requireLogin(req, res);
      if (!login) return;
      const recordId = routeParam(read[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if (!canViewRecord(login, row)) return send(res, 403, { error: "无权阅读该信息" });
      if ((row.publish_status || "已发布") === "作废" || !isRecordRecipient(login, row)) {
        return send(res, 200, { receipt: null, skipped: true, reason: "非接收对象无需记录阅读状态" });
      }
      const existing = db.prepare("select * from read_receipts where record_id=? and user_id=?").get(recordId, login.id);
      if (!existing?.read_at) {
        const isOverdue = parseRecordDate(row.deadline)?.getTime() < Date.now() ? 1 : 0;
        db.prepare("insert into read_receipts(record_id,user_id,read_at,is_overdue,remind_count,last_reminded_at) values(?,?,?,?,?,?) on conflict(record_id,user_id) do update set read_at=excluded.read_at,is_overdue=excluded.is_overdue")
          .run(recordId, login.id, now(), isOverdue, existing?.remind_count || 0, existing?.last_reminded_at || "");
        audit(login, "read_record", "record", recordId);
      }
      return send(res, 200, { receipt: receipts(recordId).find(item => item.userId === login.id) });
    }
    const receiptEdit = url.pathname.match(/^\/api\/records\/([^/]+)\/receipts\/([^/]+)$/);
    if (receiptEdit && method === "PUT") {
      const admin = requireRbacPermission(req, res, "info.receipt.manage");
      if (!admin) return;
      const recordId = routeParam(receiptEdit[1]);
      const userId = routeParam(receiptEdit[2]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if ((row.publish_status || "已发布") === "作废") return send(res, 400, { error: "作废信息不能修改阅读状态" });
      if (!db.prepare("select 1 from record_recipients where record_id=? and user_id=?").get(recordId, userId)) return send(res, 400, { error: "该人员不是此信息接收者" });
      const p = await bodyJson(req);
      updateReceiptStatus(recordId, userId, p.status);
      audit(admin, "update_receipt_status", "record", recordId, `${userId}:${p.status}`);
      return send(res, 200, { receipts: publicReceiptsFor(admin,[recordId]) });
    }
    const receiptBatchEdit = url.pathname.match(/^\/api\/records\/([^/]+)\/receipts$/);
    if (receiptBatchEdit && method === "PUT") {
      const admin = requireRbacPermission(req, res, "info.receipt.manage");
      if (!admin) return;
      const recordId = routeParam(receiptBatchEdit[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if ((row.publish_status || "已发布") === "作废") return send(res, 400, { error: "作废信息不能修改阅读状态" });
      const p = await bodyJson(req);
      const userIds = Array.from(new Set((Array.isArray(p.userIds) ? p.userIds : []).map(item => String(item))));
      if (!userIds.length) return send(res, 400, { error: "请选择接收者" });
      const recipientSet = new Set(db.prepare("select user_id from record_recipients where record_id=?").all(recordId).map(item => item.user_id));
      if (userIds.some(userId => !recipientSet.has(userId))) return send(res, 400, { error: "包含非此信息接收者" });
      if(userIds.some(id=>!dataScopeAllowsUser(admin,id,"info")))return send(res,403,{error:"接收人员不在信息管理范围内"});
      maintenanceTransaction(()=>userIds.forEach(userId => updateReceiptStatus(recordId, userId, p.status)));
      audit(admin, "batch_update_receipt_status", "record", recordId, `${userIds.length}:${p.status}`);
      return send(res, 200, { receipts: publicReceiptsFor(admin,[recordId]) });
    }
    const remind = url.pathname.match(/^\/api\/records\/([^/]+)\/remind$/);
    if (remind && method === "POST") {
      const login = requireLogin(req, res);
      if (!login) return;
      const recordId = routeParam(remind[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if (!hasRbac(login, "info.remind.any") && !(hasRbac(login, "info.remind.own") && isRecordOwner(login, row))) return send(res, 403, { error: "当前账号无权催办该信息" });
      const p = await bodyJson(req);
      const userIds = Array.isArray(p.userIds) ? p.userIds : [];
      const eligible=new Set(recipients(recordId).filter(r=>dataScopeAllowsUser(login,r.accountId,"info")).map(r=>r.accountId));
      if(userIds.some(id=>!eligible.has(id)))return send(res,403,{error:"包含不可催办的接收人员"});
      const upsert = db.prepare("insert into read_receipts(record_id,user_id,read_at,is_overdue,remind_count,last_reminded_at) values(?,?,?,?,?,?) on conflict(record_id,user_id) do update set remind_count=coalesce(remind_count,0)+1,last_reminded_at=excluded.last_reminded_at");
      userIds.forEach(userId => upsert.run(recordId, String(userId), "", 0, 1, now()));
      audit(login, "remind_record", "record", recordId, `${userIds.length} 人`);
      return send(res, 200, { reminded: userIds.length, receipts: publicReceiptsFor(login,[recordId]) });
    }
    const fav = url.pathname.match(/^\/api\/records\/([^/]+)\/favorite$/);
    if (fav && (method === "POST" || method === "DELETE")) {
      const login = requireLogin(req, res);
      if (!login) return;
      const recordId = routeParam(fav[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if (!canViewRecord(login, row)) return send(res, 403, { error: "无权收藏该信息" });
      db.prepare("delete from favorites where user_id=? and record_id=?").run(login.id, recordId);
      if (method === "POST") db.prepare("insert into favorites(user_id,record_id,created_at) values(?,?,?)").run(login.id, recordId, now());
      audit(login, method === "POST" ? "favorite" : "unfavorite", "record", recordId);
      return send(res, 200, { ok: true, favorite: method === "POST" });
    }
    if (method === "POST" && url.pathname === "/api/records/import") {
      const admin = requireRbacPermission(req, res, "info.create");
      if (!admin) return;
      const p = await bodyJson(req);
      const rows = Array.isArray(p.rows) ? p.rows : [];
      const people = allLoginPeople();
      const insertRecord = db.prepare("insert into records(id,date,publisher,category,title,summary,original,source_set,created_by,updated_by,created_at,updated_at,deadline,priority,publish_status,publisher_id,imported_read) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
      const insertRecipient = db.prepare("insert into record_recipients(record_id,user_id,person_id,name,department,team) values(?,?,?,?,?,?)");
      const insertReceipt = db.prepare("insert into read_receipts(record_id,user_id,read_at,is_overdue,remind_count,last_reminded_at) values(?,?,?,?,?,?)");
      let created = 0;
      let skipped = 0;
      const importedAt = now();
      for (const row of rows) {
        const date = String(row.date || "").trim();
        const category = String(row.category || "").trim();
        const title = String(row.title || "").trim();
        const original = String(row.original || "").trim();
        if (!date || !category || !title || !original) {
          skipped++;
          continue;
        }
        const rid = randomId("rec");
        const publisher = String(row.publisher || "").trim() || admin.name;
        insertRecord.run(rid, date, publisher, category, title, "", original, "batchImport", admin.id, admin.id, importedAt, importedAt, deadlineFor(date), row.priority || "普通", "已发布", admin.id, 1);
        people.forEach(person => {
          insertRecipient.run(rid, person.accountId, person.personId, person.name, person.department || "未设置", person.team || "未设置");
          insertReceipt.run(rid, person.id, importedAt, 0, 0, "");
        });
        created++;
      }
      audit(admin, "import_records", "record", "bulk", `${created} 条，跳过 ${skipped} 行`);
      return send(res, 201, { created, skipped, receiptCount: created * people.length });
    }

    if (method === "GET" && url.pathname === "/api/fixed-projects") {
      if (!hasRbac(currentUser(req), "fixed.read")) return send(res, 403, { error: "当前账号没有权限" });
      const rows = db.prepare("select * from fixed_projects order by ata asc,title asc").all();
      return send(res, 200, { projects: publicProjects(rows) });
    }
    if (method === "POST" && url.pathname === "/api/fixed-projects") {
      const admin = requireRbacPermission(req, res, "fixed.manage");
      if (!admin) return;
      const p = await bodyJson(req);
      const pid = randomId("fix");
      db.prepare("insert into fixed_projects(id,ata,title,content_html,references_text,created_by,updated_by,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)")
        .run(pid, p.ata, p.title, sanitizeRichHtml(p.contentHtml || ""), p.references || "", admin.id, admin.id, now(), now());
      audit(admin, "create_fixed_project", "fixedProject", pid, p.title);
      return send(res, 201, { project: publicProject(db.prepare("select * from fixed_projects where id=?").get(pid)) });
    }
    const fix = url.pathname.match(/^\/api\/fixed-projects\/([^/]+)$/);
    if (fix && method === "PUT") {
      const admin = requireRbacPermission(req, res, "fixed.manage");
      if (!admin) return;
      const p = await bodyJson(req);
      const projectId = routeParam(fix[1]);
      db.prepare("update fixed_projects set ata=?,title=?,content_html=?,references_text=?,updated_by=?,updated_at=? where id=?")
        .run(p.ata, p.title, sanitizeRichHtml(p.contentHtml || ""), p.references || "", admin.id, now(), projectId);
      audit(admin, "update_fixed_project", "fixedProject", projectId, p.title);
      return send(res, 200, { project: publicProject(db.prepare("select * from fixed_projects where id=?").get(projectId)) });
    }
    if (fix && method === "DELETE") {
      const admin = requireRbacPermission(req, res, "fixed.manage");
      if (!admin) return;
      const projectId = routeParam(fix[1]);
      await removeOwnerAttachmentFiles("fixedProject", projectId);
      db.prepare("delete from fixed_projects where id=?").run(projectId);
      db.prepare("delete from attachments where owner_type='fixedProject' and owner_id=?").run(projectId);
      audit(admin, "delete_fixed_project", "fixedProject", projectId);
      return send(res, 200, { ok: true });
    }

    const cosPresign = url.pathname.match(/^\/api\/(records|fixed-projects)\/([^/]+)\/attachments\/presign$/);
    if (cosPresign && method === "POST") {
      await createCosUpload(req, res, cosPresign[1] === "records" ? "record" : "fixedProject", routeParam(cosPresign[2]));
      return;
    }
    const cosComplete = url.pathname.match(/^\/api\/(records|fixed-projects)\/([^/]+)\/attachments\/complete$/);
    if (cosComplete && method === "POST") {
      await completeCosUpload(req, res, cosComplete[1] === "records" ? "record" : "fixedProject", routeParam(cosComplete[2]));
      return;
    }
    const upload = url.pathname.match(/^\/api\/(records|fixed-projects)\/([^/]+)\/attachments$/);
    if (upload && method === "POST") {
      await addUploadedAttachments(req, res, upload[1] === "records" ? "record" : "fixedProject", routeParam(upload[2]));
      return;
    }
    const attAccess = url.pathname.match(/^\/api\/attachments\/([^/]+)\/access$/);
    if (attAccess && method === "GET") {
      const login = requireLogin(req, res);
      if (!login) return;
      const attachmentId = routeParam(attAccess[1]);
      const row = attachmentRow(attachmentId);
      if (!row || !row.path) return send(res, 404, { error: "未找到附件" });
      if (!canViewAttachment(login, row)) return send(res, 403, { error: "无权访问该附件" });
      const download = url.searchParams.get("download") === "1";
      if (row.storage === "cos") return send(res, 200, signedCosAttachment(row, 300, download));
      return send(res, 200, {
        url: `/api/attachments/${encodeURIComponent(row.id)}${download ? '?download=1' : ''}`,
        expiresAt: "",
        expiresIn: 0,
        fileName: row.name || "附件",
        mimeType: contentTypeForAttachment(row),
        size: Number(row.size || 0)
      });
    }
    const att = url.pathname.match(/^\/api\/attachments\/([^/]+)$/);
    if (att && method === "GET") {
      const login = requireLogin(req, res);
      if (!login) return;
      const attachmentId = routeParam(att[1]);
      const row = attachmentRow(attachmentId);
      if (!row || !row.path) return sendText(res, 404, "未找到附件");
      if (!canViewAttachment(login, row)) return sendText(res, 403, "无权访问该附件");
      if (row.storage === "cos") {
        res.writeHead(302, { ...securityHeaders(), "Location": signedCosAttachment(row, 300, url.searchParams.get("download") === "1").url, "Cache-Control": "private, no-store" });
        return res.end();
      }
      const filePath = safeUploadPath(row.path);
      if (!filePath) return sendText(res, 403, "附件路径无效");
      try {
        return await streamAttachment(req, res, row, filePath, url.searchParams.get("download") === "1");
      } catch {
        return sendText(res, 404, "未找到附件文件");
      }
    }
    if (att && method === "DELETE") {
      const login = requireLogin(req, res);
      if (!login) return;
      const attachmentId = routeParam(att[1]);
      const row = attachmentRow(attachmentId);
      if (!row) return send(res, 404, { error: "未找到附件" });
      if (!canManageAttachment(login, row)) return send(res, 403, { error: "无权删除该附件" });
      if (row.storage === "cos") await deleteCosObject(row.path);
      else {
        const filePath = row.path ? safeUploadPath(row.path) : "";
        if (filePath) await fs.rm(filePath, { force: true });
      }
      db.prepare("delete from attachments where id=?").run(attachmentId);
      audit(login, "delete_attachment", row.owner_type, row.owner_id, row.name);
      return send(res, 200, { ok: true });
    }

    if (method === "GET" && url.pathname === "/api/admin/accounts") {
      const manager = requireRbacPermission(req, res, "accounts.read");
      if (!manager) return;
      return send(res, 200, { accounts: db.prepare("select * from users order by created_at").all().filter(row=>personnelAccess.allows(manager,"accounts",row.person_id)).map(adminUser) });
    }
    if (method === "GET" && url.pathname === "/api/admin/accounts/availability") {
      const manager = requireRbacPermission(req, res, "accounts.create");
      if (!manager) return;
      const personId = String(url.searchParams.get("personId") || "").trim();
      const username = String(url.searchParams.get("username") || "").trim();
      if (!personId) return send(res, 400, { error: "必须选择关联人员" });
      personnelAccess.requirePerson(manager, "accounts", personId, true);
      const person = db.prepare("select id,employee_no,employment_status from personnel where id=? and data_status='active'").get(personId);
      if (!person) return send(res, 404, { error: "未找到可管理的人员" });
      const personEligible = !["离职", "停职"].includes(person.employment_status);
      const linked = personEligible ? db.prepare("select 1 from users where person_id=?").get(personId) : null;
      const usernameTaken = username ? !!db.prepare("select 1 from users where username=?").get(username) : false;
      const personAvailable = personEligible && !linked;
      const usernameAvailable = !!username && !usernameTaken;
      const conflicts = [];
      if (!personEligible) conflicts.push("PERSON_UNAVAILABLE");
      else if (linked) conflicts.push("PERSON_LINKED");
      if (!username) conflicts.push("USERNAME_REQUIRED");
      else if (usernameTaken) conflicts.push("USERNAME_TAKEN");
      const message = conflicts.includes("PERSON_LINKED") ? "该人员已关联登录账号，无法重复注册"
        : conflicts.includes("PERSON_UNAVAILABLE") ? "该人员已离职、停职或失效，无法注册"
        : conflicts.includes("USERNAME_TAKEN") ? "登录账号已存在，无法注册"
        : conflicts.includes("USERNAME_REQUIRED") ? "登录账号不能为空"
        : "登录账号可用";
      return send(res, 200, { available: personAvailable && usernameAvailable, suggestedUsername: person.employee_no, personAvailable, usernameAvailable, conflicts, message });
    }
    if (method === "POST" && url.pathname === "/api/admin/accounts") {
      const manager = requireRbacPermission(req, res, "accounts.create");
      if (!manager) return;
      if (!hasRbac(manager, "accounts.roles.assign")) return send(res, 403, { error: "当前账号没有分配角色权限", permission: "accounts.roles.assign" });
      if (!hasRbac(manager, "accounts.scopes.assign")) return send(res, 403, { error: "当前账号没有分配数据范围权限", permission: "accounts.scopes.assign" });
      const payload = await bodyJson(req);
      const username = String(payload.username || "").trim();
      const password = String(payload.password || "");
      if (!username) return send(res, 400, { error: "登录账号不能为空" });
      if (password.length < 6) return send(res, 400, { error: "初始密码至少需要6位" });
      if (db.prepare("select id from users where username=?").get(username)) return send(res, 409, { error: "登录账号已存在" });
      const person = validateAccountIdentity(payload);
      const access = validateAccountAccess(payload,person.id);
      const userId = randomId("u");
      const pass = hashPassword(password);
      db.exec("begin immediate");
      try {
        if (db.prepare("select id from users where username=?").get(username)) throw Object.assign(new Error("登录账号已存在"), { status: 409 });
        validateAccountIdentity(payload);
        db.prepare(`insert into users(id,username,name,role,salt,password_hash,permissions,allowed_tabs,department,team,function_category,status,person_id,must_change_password,credential_version,created_at,updated_at)
          values(?,?,?,'rbac',?,?,'[]','[]',?,?,?,?,?,?,1,?,?)`)
          .run(userId, username, person.name, pass.salt, pass.hash, person.department || "未设置", person.home_team || "未设置", normalizeFunctionCategory(payload.functionCategory), normalizeStatus(payload.status), person.id, payload.mustChangePassword === false ? 0 : 1, now(), now());
        replaceAccountAccess(userId, access, (manager||{}).id||"");
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      audit(manager, "create_account", "user", userId, JSON.stringify({ username, personId: person.id, roles: access.roleCodes, scopes: access.scopes }));
      return send(res, 201, { account: adminUser(db.prepare("select * from users where id=?").get(userId)) });
    }
    const accountRoute = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)$/);
    if (accountRoute && method === "PUT") {
      const manager = requireRbacPermission(req, res, "accounts.update");
      if (!manager) return;
      const userId = routeParam(accountRoute[1]);
      if (userId === SUPER_ACCOUNT_ID) {
        audit(manager, "reject_update_super_account", "user", userId);
        return send(res, 403, { error: "唯一超级账号不可修改；仅允许本人修改密码" });
      }
      const existing = db.prepare("select * from users where id=?").get(userId);
      if (!existing) return send(res, 404, { error: "未找到账号" });
      personnelAccess.requirePerson(manager,"accounts",existing.person_id);
      const payload = await bodyJson(req);
      if (!hasRbac(manager, "accounts.roles.assign")) return send(res, 403, { error: "当前账号没有分配角色权限", permission: "accounts.roles.assign" });
      if (!hasRbac(manager, "accounts.scopes.assign")) return send(res, 403, { error: "当前账号没有分配数据范围权限", permission: "accounts.scopes.assign" });
      const person = validateAccountIdentity(payload, existing);
      const access = validateAccountAccess(payload,person.id);
      const status = normalizeStatus(payload.status ?? existing.status);
      if(status!==existing.status && !hasRbac(manager,"accounts.disable"))return send(res,403,{error:"没有变更账户启用状态的权限",permission:"accounts.disable"});
      db.exec("begin immediate");
      try {
        validateAccountIdentity(payload, existing);
        db.prepare("update users set name=?,role='rbac',permissions='[]',allowed_tabs='[]',department=?,team=?,function_category=?,status=?,person_id=?,must_change_password=?,updated_at=? where id=?")
          .run(person.name, person.department || "未设置", person.home_team || "未设置", normalizeFunctionCategory(payload.functionCategory ?? existing.function_category), status, person.id, payload.mustChangePassword === true ? 1 : 0, now(), userId);
        replaceAccountAccess(userId, access, (manager||{}).id||"");
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      revokeUserSessions(userId, { bumpCredentialVersion: true });
      audit(manager, "update_account", "user", userId, JSON.stringify({ personId: person.id, status, roles: access.roleCodes, scopes: access.scopes }));
      return send(res, 200, { account: adminUser(db.prepare("select * from users where id=?").get(userId)) });
    }
    if (accountRoute && method === "DELETE") {
      const manager = requireRbacPermission(req, res, "accounts.disable");
      if (!manager) return;
      const userId = routeParam(accountRoute[1]);
      if (userId === SUPER_ACCOUNT_ID) {
        audit(manager, "reject_disable_super_account", "user", userId);
        return send(res, 403, { error: "唯一超级账号不可删除或停用" });
      }
      if (userId === manager.id) return send(res, 400, { error: "不能停用当前登录账号" });
      const existing = db.prepare("select * from users where id=?").get(userId);
      if (!existing) return send(res, 404, { error: "未找到账号" });
      personnelAccess.requirePerson(manager,"accounts",existing.person_id);
      db.prepare("update users set status='disabled',credential_version=coalesce(credential_version,1)+1,updated_at=? where id=?").run(now(), userId);
      revokeUserSessions(userId);
      audit(manager, "disable_account", "user", userId, existing.username);
      return send(res, 200, { ok: true, retainedHistory: true });
    }
    const accountResetRoute = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/reset-password$/);
    if (accountResetRoute && method === "POST") {
      const manager = requireRbacPermission(req, res, "accounts.password.reset");
      if (!manager) return;
      const userId = routeParam(accountResetRoute[1]);
      if (userId === SUPER_ACCOUNT_ID) {
        audit(manager, "reject_reset_super_password", "user", userId);
        return send(res, 403, { error: "超级账号密码只能由本人修改" });
      }
      const existing = db.prepare("select * from users where id=?").get(userId);
      if (!existing) return send(res, 404, { error: "未找到账号" });
      personnelAccess.requirePerson(manager,"accounts",existing.person_id);
      if (isDeletedAccountPerson(existing)) return send(res, 409, { error: "关联人员已删除，账户仅保留历史，不可重置密码" });
      const payload = await bodyJson(req);
      const password = String(payload.password || "");
      if (password.length < 6) return send(res, 400, { error: "新密码至少需要6位" });
      const pass = hashPassword(password);
      db.prepare("update users set salt=?,password_hash=?,must_change_password=1,credential_version=coalesce(credential_version,1)+1,updated_at=? where id=?").run(pass.salt, pass.hash, now(), userId);
      revokeUserSessions(userId);
      audit(manager, "reset_account_password", "user", userId, existing.username);
      return send(res, 200, { ok: true });
    }

    if (method === "POST" && url.pathname === "/api/admin/accounts/bulk-open") {
      const admin = requireRbacPermission(req, res, "accounts.bulk_open");
      if (!admin) return;
      const requiredBulkAccountPermissions = ["accounts.roles.assign", "accounts.scopes.assign"];
      const missingPermission = requiredBulkAccountPermissions.find(permission => !hasRbac(admin, permission));
      if (missingPermission) {
        audit(admin, "permission_denied", "permission", missingPermission, "bulk_open_accounts");
        return send(res, 403, { error: "当前账号没有批量开通和配置账户的完整权限", permission: missingPermission });
      }
      const p = await bodyJson(req);
      const inputRows = Array.isArray(p.rows) ? p.rows : [];
      if (!inputRows.length) return send(res, 400, { error: "没有可处理的账户数据" });
      const errors = [];
      const seenEmployeeNos = new Set(), seenUsernames = new Set(), prepared = [];
      inputRows.forEach((raw, index) => {
        const rowNumber = Number(raw.rowNumber || index + 2);
        const employeeNo = String(raw.employeeNo || raw["员工工号"] || raw["工号"] || "").trim();
        const username = String(raw.username || raw["登录账号"] || raw["账号"] || "").trim();
        const password = String(raw.password || raw["初始密码"] || "").trim();
        const roleValues = importSelections(raw.roles || raw.role || raw["角色"] || raw["RBAC角色"]);
        const rowErrors = [];
        let scopes=[];
        try {
          if(raw["数据范围"])throw new Error("请使用分模块数据范围列，旧数据范围列已移除");
          if(raw.scopes !== undefined && !Array.isArray(raw.scopes)) throw Object.assign(new Error("数据范围必须使用分模块数组格式"),{status:400});
          let input=raw.scopes || [];
          if(!input.length)for(const module of SCOPE_MODULES){
            const value=raw[MODULE_LABELS[module]+"范围"];
            for(const token of importSelections(value || "本人")){
              const separator=token.search(/[:：]/), label=(separator<0?token:token.slice(0,separator)).trim(), path=separator<0?"":token.slice(separator+1).trim();
              const scopeType=accountImportScope(label)||({"指定行政班组":"specified_teams","指定班组":"specified_teams","指定人员分组":"specified_groups"}[label]||"");
              const specified=["specified_teams","specified_groups"].includes(scopeType);
              if(!specified&&path)throw new Error("该范围不接受组织路径");
              const scopeId=specified?resolveOrganizationPath(db,path,scopeType==="specified_teams"?"administrative_team":"personnel_group"):"";
              input.push({module,scopeType,scopeId,validFrom:raw[MODULE_LABELS[module]+"范围开始日期"],validTo:raw[MODULE_LABELS[module]+"范围结束日期"]});
            }
          }
          const scopedPerson=employeeNo?db.prepare("select id from personnel where employee_no=? and data_status='active'").get(employeeNo):null;
          scopes=personnelAccess.normalizeScopes(input,scopedPerson?.id||"");
        }catch(e){rowErrors.push(e.message);}

        if (!employeeNo) rowErrors.push("员工工号不能为空");
        else if (!isValidEmployeeNo(employeeNo)) rowErrors.push("员工工号必须为8位数字");
        if (!username) rowErrors.push("登录账号不能为空");
        if (!roleValues.length) rowErrors.push("至少选择一个角色");
        if (employeeNo && seenEmployeeNos.has(employeeNo)) rowErrors.push("工号在导入文件中重复");
        if (username && seenUsernames.has(username)) rowErrors.push("登录账号在导入文件中重复");
        seenEmployeeNos.add(employeeNo); seenUsernames.add(username);
        const person = employeeNo ? db.prepare("select * from personnel where employee_no=? and data_status='active'").get(employeeNo) : null;
        if (employeeNo && !person) rowErrors.push(db.prepare("select data_status from personnel where employee_no=?").get(employeeNo)?.data_status === "deleted" ? "该工号人员已删除，不能开通或恢复账户" : "未在人员主数据中找到该工号");
        if(person && !personnelAccess.allows(admin,"accounts",person.id)){errors.push({rowNumber,employeeNo,detail:"该行不在账户管理范围内"});return;}
        if (person && ["离职", "停职"].includes(person.employment_status)) rowErrors.push("离职或停职人员不能开通账户");
        const roleRows = roleValues.map(value => db.prepare("select id,code,name from rbac_roles where status='active' and (code=? or name=?)").get(value, value)).filter(Boolean);
        if (roleRows.length !== roleValues.length) rowErrors.push("包含不存在的角色");
        else { try { validateAccountRoleCombination(roleRows.map(role => role.code)); } catch (error) { rowErrors.push(error.message); } }
        const accountByPerson = person ? db.prepare("select * from users where person_id=?").get(person.id) : null;
        const accountByUsername = username ? db.prepare("select * from users where username=?").get(username) : null;
        if (accountByPerson && accountByPerson.username !== username) rowErrors.push(`该人员已关联账号 ${accountByPerson.username}`);
        if (accountByUsername && accountByUsername.person_id !== person?.id) rowErrors.push("登录账号已关联其他人员");
        const existing = accountByPerson || accountByUsername;
        if(existing)rowErrors.push("人员或登录账号已开通，请在账户管理中维护，不能通过批量开通覆盖");
        if (!existing && password.length < 6) rowErrors.push("新账户的初始密码至少6位");
        if (existing && password && password.length < 6) rowErrors.push("如需重置密码，新密码至少6位");
        if (rowErrors.length) errors.push({ rowNumber, employeeNo, username, detail: rowErrors.join("；") });
        else prepared.push({ person, username, password, roleRows, scopes, status: normalizeStatus(raw.status || raw["账户状态"] || raw["状态"]), existing });
      });
      if (errors.length) {
        audit(admin, "reject_bulk_open_accounts", "user", "bulk", JSON.stringify({ errors }));
        return send(res, 400, { error: `发现 ${errors.length} 行异常，未开通任何账户`, errors });
      }
      let created = 0, updated = 0;
      const updatedUserIds = [];
      db.exec("begin immediate");
      try {
        for (const item of prepared) {
          validateAccountIdentity({ personId: item.person.id }, item.existing);
          let userId = item.existing?.id || randomId("u");
          if (userId === SUPER_ACCOUNT_ID) throw Object.assign(new Error("批量开通不能修改唯一超级账号"), { status: 403 });
          if (item.existing) {
            db.prepare("update users set name=?,role='rbac',permissions='[]',allowed_tabs='[]',department=?,team=?,status=?,person_id=?,must_change_password=?,updated_at=? where id=?")
              .run(item.person.name, item.person.department || "未设置", item.person.home_team || "未设置", item.status, item.person.id, item.password ? 1 : Number(item.existing.must_change_password || 0), now(), userId);
            if (item.password) {
              const pass = hashPassword(item.password);
              db.prepare("update users set salt=?,password_hash=? where id=?").run(pass.salt, pass.hash, userId);
            }
            updatedUserIds.push(userId); updated++;
          } else {
            const pass = hashPassword(item.password);
            db.prepare("insert into users(id,username,name,role,salt,password_hash,permissions,allowed_tabs,department,team,function_category,status,person_id,must_change_password,credential_version,created_at,updated_at) values(?,?,?,'rbac',?,?,'[]','[]',?,?,?,?,?,1,1,?,?)")
              .run(userId, item.username, item.person.name, pass.salt, pass.hash, item.person.department || "未设置", item.person.home_team || "未设置", "维修", item.status, item.person.id, now(), now());
            created++;
          }
          db.prepare("delete from rbac_user_roles where user_id=?").run(userId);
          item.roleRows.forEach(role => db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)").run(userId, role.id, now()));
          db.prepare("delete from rbac_user_scopes where user_id=?").run(userId);
          item.scopes.forEach(scope=>{const hasGrant=(db.prepare("select count(*) as n from " + (db.kind === "postgres" ? "(select column_name as name from information_schema.columns where table_name='rbac_user_scopes' and column_name='grant_reason')" : "pragma_table_info('rbac_user_scopes')")).get().n===1);const sql=hasGrant?"insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at,grant_reason,granted_by) values(?,?,?,?,?,?,?,?,?,?,?)":"insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)";const args=hasGrant?[randomId("scope"),userId,scope.module,scope.scopeType,scope.scopeId,scope.validFrom,scope.validTo,now(),now(),String(scope.grantReason||"").slice(0,500),(admin||{}).id||""]:[randomId("scope"),userId,scope.module,scope.scopeType,scope.scopeId,scope.validFrom,scope.validTo,now(),now()];db.prepare(sql).run(...args);});
        }
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      updatedUserIds.forEach(userId => revokeUserSessions(userId, { bumpCredentialVersion: true }));
      audit(admin, "bulk_open_accounts", "user", "bulk", JSON.stringify({ created, updated }));
      return send(res, 201, { created, updated, skipped: 0, errors: [] });
    }

    // B5-3：B 线分发器未覆盖的维修子路由（main 侧双引号风格新增）回退 main 分发器处理。
    return await routeRequestMain(req, res);
  } catch (error) {
    const status = error.status || (error.message?.includes("人员已删除，不能恢复或新增关联") ? 409 : 500);
    if (status >= 500) console.error(error);
    send(res, status, { error: error.message || "服务异常", ...(error.code === "MAINTENANCE_REPORT_CONFLICT" ? { code: error.code } : {}), ...(error.details || {}) });
  }
}
// B5-3 双分发器：维修家族（/api/maintenance，main 侧自 B 分叉后零演进）走 B 线 V10.1 分发器；
// 其余路由走 main 分发器（人员/RBAC/交接/考勤最新演进）。两版分发器各自保持原函数体不变。
async function routeRequest(req, res) {
  if (String(req.url||'').startsWith('/api/maintenance')) return routeRequestMaintenance(req, res);
  return routeRequestMain(req, res);
}


async function measuredRoute(req, res) {
  const requestId = crypto.randomBytes(8).toString("hex");
  const started = performance.now();
  const requestStats = { count: 0, totalMs: 0, slowCount: 0 };
  let statusCode = 200;
  let finished = false;
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = (status, statusMessageOrHeaders, maybeHeaders) => {
    statusCode = Number(status || 200);
    const headers = typeof statusMessageOrHeaders === "object" ? { ...statusMessageOrHeaders } : { ...(maybeHeaders || {}) };
    const current = requestStats;
    headers["X-Request-Id"] ||= requestId;
    headers["Server-Timing"] = [headers["Server-Timing"],`db;dur=${current.totalMs.toFixed(1)}, app;dur=${Math.max(0, performance.now() - started).toFixed(1)}`].filter(Boolean).join(', ');
    return typeof statusMessageOrHeaders === "string"
      ? originalWriteHead(status, statusMessageOrHeaders, headers)
      : originalWriteHead(status, headers);
  };
  res.once("finish", () => {
    finished = true;
    if(statusCode>=200 && statusCode<300 && ['POST','PUT','DELETE'].includes(req.method) && /^\/api\/(records|attachments)(\/|$)/.test(new URL(req.url,'http://localhost').pathname))scheduleInfoSync();
    const after = requestStats;
    const durationMs = performance.now() - started;
    if (process.env.REQUEST_LOGS === "1" || durationMs >= 500 || statusCode >= 500) {
      process.stdout.write(`${JSON.stringify({
        type: "http_request",
        requestId,
        method: req.method || "GET",
        path: new URL(req.url, "http://localhost").pathname,
        status: statusCode,
        durationMs: Number(durationMs.toFixed(1)),
        queryCount: after.count,
        queryMs: Number(after.totalMs.toFixed(1)),
        slowQueries: after.slowCount
      })}\n`);
    }
  });
  res.once("close", () => {
    if (finished) return;
    if ((req.method || "GET") === "GET" && /\/events$/.test(new URL(req.url, "http://localhost").pathname)) return;
    const after = requestStats;
    process.stderr.write(`${JSON.stringify({
      type: "http_request_incomplete", requestId,
      method: req.method || "GET", path: new URL(req.url, "http://localhost").pathname,
      durationMs: Number((performance.now() - started).toFixed(1)),
      queryCount: after.count,
      queryMs: Number(after.totalMs.toFixed(1)),
      slowQueries: after.slowCount
    })}\n`);
  });
  return requestQueryStats.run(requestStats, () => route(req, res));
}

// Fail before initialization writes when a populated pre-v3 database needs review.
if (db.prepare("pragma table_info(personnel)").all().length &&
    db.prepare("pragma table_info(maintenance_assignments)").all().length &&
    db.prepare("pragma table_info(rbac_user_scopes)").all().length) {
  const identity = preflightIdentity(db), organizations = preflightOrganizations(db);
  if (!identity.ok || !organizations.ok) throw Object.assign(new Error("启动前预检未通过，未执行迁移：" + JSON.stringify({identity:identity.issues,organizations:organizations.issues})),{status:409});
}
await initDb();
installPersonnelDeletionGuards(db);
db.exec(IMPORT_WORKSPACE_SCHEMA);
capabilityService.init();
installInfoSync(db);
let lastOffsetMaintenance=0;
const attendanceService = createAttendanceService({ onLocalMaintenance:()=>{if(Date.now()-lastOffsetMaintenance<5000)return;lastOffsetMaintenance=Date.now();for(const action of ['settleDue','drain','repairTasks']){try{offsetService[action](offsetSystemActor);}catch(error){console.warn('考勤抵消后台任务将重试',action,error.code||error.name);}}}, db, personnelAccess, hasRbac, audit, onSourceSaved:(personId,date)=>offsetService.markDirty(personId,date), isAdmin: user => user?.id===SUPER_ACCOUNT_ID || rbacSnapshot(user?.id).roles.some(role=>role.code==='system_admin') });
const offsetSystemActor={id:'system-attendance-offset'};
function currentOffsetActor(user){
 if(user===offsetSystemActor)return user;
 const row=db.prepare('select * from users where id=?'+(db.kind==='postgres'?' for share':'')).get(user?.id||'');
 if(!row||row.status!=='active'||isDeletedAccountPerson(row)||row.person_id!==user.personId||Number(row.credential_version||1)!==Number(user.credentialVersion||1))return null;
 return toUser(row);
}

const offsetService=createOffsetService({db,monthClose:{
 enabled:()=>attendanceService.config.enabled&&attendanceService.config.workerEnabled&&!attendanceService.config.manualOnly&&!attendanceService.config.validation?.enabled,
 enqueue:options=>attendanceService.enqueue(options),
 verified:runId=>!!db.prepare("select 1 from attendance_tasks t where t.status='done' and (t.run_id=? or exists(select 1 from attendance_task_links l where l.run_id=? and l.task_id=t.id)) limit 1").get(runId,runId)||!!attendanceService.hybrid.state('runStats:'+runId)?.freshReused
},listPeople:()=>db.prepare("select id from personnel where coalesce(data_status,'active')<>'deleted'").all().map(p=>p.id),hasPermission:(user,permission)=>user===offsetSystemActor||hasRbac(currentOffsetActor(user),permission),canViewPerson:(user,id)=>user===offsetSystemActor||!!currentOffsetActor(user)&&personnelAccess.allows(currentOffsetActor(user),'attendance',id),loadUser:id=>{const row=db.prepare('select * from users where id=?').get(id);return row&&!isDeletedAccountPerson(row)?toUser(row):null;},readDays:(...args)=>attendanceService.offsetSourceDays(...args),writesEnabled:process.env.ATTENDANCE_OFFSETS_WRITES_ENABLED==='true',existingActionsEnabled:process.env.ATTENDANCE_OFFSETS_EXISTING_ACTIONS_ENABLED==='true'||process.env.ATTENDANCE_OFFSETS_WRITES_ENABLED==='true'});

const actionTaskRealtime=createActionTaskRealtime({versions:ids=>offsetService.tasks.revisions(ids),snapshot:user=>offsetService.tasks.fingerprint(user),currentUser,onError:error=>console.error('待处理实时同步检查失败',error.message)});

const handoverService=createHandoverService({db,audit,hasRbac,clock:Date.now,actionTask:offsetService.tasks,
  loadRoutineReports(flightIds){
    if(!flightIds.length)return new Map();
    const marks=flightIds.map(()=>'?').join(',');
    const batches=new Map(db.prepare(`select flight_id,feedback,status from maintenance_report_batches where report_type='routine' and flight_id in (${marks})`).all(...flightIds).map(row=>[row.flight_id,row]));
    const drafts=new Map(db.prepare(`select flight_id,payload_json from maintenance_report_drafts where report_type='routine' and flight_id in (${marks})`).all(...flightIds).map(row=>[row.flight_id,row]));
    return new Map(flightIds.map(id=>{
      const batch=batches.get(id),draft=drafts.get(id);
      let payload={};try{payload=JSON.parse(draft?.payload_json||"{}");}catch{}
      // Match the execution report's nullish precedence, including an explicitly cleared batch feedback.
      const fromBatch=batch?.feedback!==null&&batch?.feedback!==undefined;
      return [id,{feedback:batch?.feedback??String(payload.feedback||""),source:fromBatch?"report":draft?"draft":"none",status:fromBatch?batch.status:draft?"草稿":""}];
    }));
  },
  loadNonroutineDrafts(flightIds){
    if(!flightIds.length)return new Map();
    const rows=db.prepare(`select * from maintenance_report_drafts where report_type='nonroutine' and flight_id in (${flightIds.map(()=>'?').join(',')})`).all(...flightIds);
    if(!rows.length)return new Map();
    const people=new Map(allPeople().map(person=>[person.id,person]));
    return new Map(rows.map(row=>{
      const summary=maintenanceNonroutineDraftSummary(row,people,{includeExplanation:true});
      // 交接投影（V1.1 §5.6）：派工人员仅保留角色与姓名，不携带内部人员标识或人员当前班组。
      if(summary)for(const item of summary.items||[])item.entries=(item.entries||[]).map(({role,userName})=>({role,userName}));
      return [row.flight_id,summary];
    }));
  }
});

db.prepare('update info_sync_meta set cursor_key=? where id=1 and cursor_key is null').run(crypto.randomBytes(32).toString('hex'));
infoSync=createInfoSync({db,canView:canViewRecord,canFeedback:(user,actorId)=>hasAnyRbac(user,['info.receipt.manage','info.stats.read']) && dataScopeAllowsUser(user,actorId,'info'),signKey:Buffer.from(db.prepare('select cursor_key from info_sync_meta where id=1').get().cursor_key,'hex')});
let infoVersion=infoSync.latest(),infoHeartbeat=Date.now();
function pumpInfoSync(forceHeartbeat=false){
    try {
      const version=infoSync.latest(), heartbeat=forceHeartbeat || Date.now()-infoHeartbeat>=25000;
      if(!infoEventClients.size){infoVersion=version;return;}
      if(version===infoVersion && !heartbeat)return;
      const oldest=Number(db.prepare('select min(version) as v from info_sync_changes').get()?.v || version);
      const historyGap=infoVersion<oldest-1;
      const events=db.prepare('select * from info_sync_changes where version>? and version<=?').all(infoVersion,version);
      const ids=[...new Set(events.map(e=>e.record_id))];
      const rows=ids.length?db.prepare(`select * from records where id in (${ids.map(()=>'?').join(',')})`).all(...ids):[];
      const byId=new Map(rows.map(row=>[row.id,row]));
      // Refresh changed recipient membership immediately, not at the 25s
      // authentication heartbeat. A newly published record was not in the
      // subscriber's connection-time recipient cache.
      const recipientRows=ids.length?db.prepare(`select record_id,user_id from record_recipients where record_id in (${ids.map(()=>'?').join(',')})`).all(...ids):[];
      const recipientsById=new Map();
      for(const row of recipientRows){if(!recipientsById.has(row.record_id))recipientsById.set(row.record_id,new Set());recipientsById.get(row.record_id).add(row.user_id);}
      for(const client of infoEventClients){
        // Business signals contain no data. Revalidate the connection every
        // heartbeat; every incremental HTTP read always revalidates immediately.
        const user=heartbeat?withInfoAccess(currentUser(client.req)):client.user;
        for(const id of ids){user.infoRecipientRecords.delete(id);if(recipientsById.get(id)?.has(user.id))user.infoRecipientRecords.add(id);}
        if(!user.id || !hasRbac(user,'info.read')){client.res.write('event: access-revoked\ndata: {}\n\n');client.res.end();infoEventClients.delete(client);continue;}
        client.user=user;
        const relevant=events.filter(e=>e.kind==='favorite'?e.actor_id===user.id:e.kind==='receipt'?e.actor_id===user.id||hasAnyRbac(user,['info.receipt.manage','info.stats.read']) && user.infoAllowedAccounts.has(e.actor_id):true)
          .filter(e=>canViewRecord(user,byId.get(e.record_id)) || client.known.has(e.record_id));
        for(const e of relevant)if(canViewRecord(user,byId.get(e.record_id)))client.known.add(e.record_id);else client.known.delete(e.record_id);
        // No identifiers, titles or shared revision numbers leave this stream.
        if(relevant.length || heartbeat || historyGap){
          if(client.res.writableLength>65536){client.res.end();infoEventClients.delete(client);continue;}
          client.res.write(`event: info\ndata: ${JSON.stringify({kind:relevant.some(e=>e.kind!=='receipt')?'content':heartbeat?'scope':'receipt'})}\n\n`);
        }
      }
      infoVersion=version;if(heartbeat)infoHeartbeat=Date.now();
    }catch(error){console.error('信息实时同步检查失败',error.message);}
}
if (process.env.MUC_NO_LISTEN !== "1") {
  attendanceService.start();
  const infoTimer=setInterval(()=>{pumpInfoSync();actionTaskRealtime.pump();},2000);infoTimer.unref();
  const standardReviewNotificationTimer=setInterval(()=>{try{pumpStandardReviewNotifications();}catch(error){process.stderr.write(JSON.stringify({type:'standard_review_notification_pump_failed',error:error.message})+'\n');}},30000);standardReviewNotificationTimer.unref();
  const nonroutineNotificationTimer=setInterval(()=>{try{pumpNonroutineNotifications();}catch(error){process.stderr.write(JSON.stringify({type:'nonroutine_notification_pump_failed',error:error.message})+'\n');}},30000);nonroutineNotificationTimer.unref();
  const capabilityScheduler = setInterval(() => {
    const started = performance.now();
    let syncMs = 0;
    try {
      capabilityService.syncMaster();
      syncMs = performance.now() - started;
      capabilityService.schedule();
      const totalMs = performance.now() - started;
      if (totalMs >= 200) process.stderr.write(JSON.stringify({ type: "capability_scheduler_slow", syncMs: Number(syncMs.toFixed(1)), scheduleMs: Number((totalMs - syncMs).toFixed(1)), totalMs: Number(totalMs.toFixed(1)) }) + "\n");
    } catch (error) { console.error("能力状态同步失败", error.message); }
  }, 15000);
  capabilityScheduler.unref();
  http.createServer(measuredRoute).listen(port, host, () => {
    console.log(`MUC online app: http://127.0.0.1:${port}`);
    console.log(`运行环境：${isCodexWorktree ? "Codex隔离工作树" : process.env.NODE_ENV || "development"}`);
    console.log(`数据库：${db.kind === "postgres" ? "PostgreSQL（DATABASE_URL）" : path.resolve(dbPath)}`);
    console.log(`附件目录：${path.resolve(uploadDir)}`);
    console.log(`健康检查：http://127.0.0.1:${port}/api/health`);
    if (host === "0.0.0.0" || host === "::") {
      const urls = isLocalDevelopment&&process.env.MUC_DEV_LAN==='true'?[process.env.APP_ORIGIN]:lanAddresses().map(address => `http://${address}:${port}`);
      console.log(`局域网访问：${urls.join("  ") || "未检测到局域网 IPv4 地址"}`);
      if (urls.length) console.log(`手机连通测试：${urls[0]}/api/health`);
    } else {
      console.log(isLocalDevelopment ? "局域网访问：如需手机测试，请使用 MUC_DEV_LAN=true npm run start:dev" : "局域网访问：如需手机访问，请使用 HOST=0.0.0.0 启动服务");
    }
    console.log(`唯一超级账号：${SUPER_ACCOUNT_ID}（密码不在启动日志中显示）`);
  });
}

// Boot-time §5.8 reconcile: versions whose effective_at arrived since the last publication
// are applied now; idempotent (audit unique key). No-op on an empty/fresh database.
try{refreshMaintenanceStandardEffectiveReferences({id:'system',personId:'',name:'标准生效引用核对'});}catch(error){console.error('标准生效引用核对失败',error.message);}

export { actionTaskRealtime, attendanceService, route, measuredRoute, pumpInfoSync, pumpNonroutineNotifications, pumpStandardReviewNotifications, db, parseRangeHeader, cosSignedUrl, verifyCosUploadedAttachment, attachmentDisposition, seedRbac, authorizationProjects, personnelDeletion, personnelAccess, capabilityService, refreshMaintenanceStandardEffectiveReferences, maintenanceOvernightFeedbackService };
