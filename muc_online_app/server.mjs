import http from "node:http";
import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import COS from "cos-nodejs-sdk-v5";
import { createDatabase } from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
const cosConfig = {
  secretId: String(process.env.COS_SECRET_ID || "").trim(),
  secretKey: String(process.env.COS_SECRET_KEY || "").trim(),
  bucket: String(process.env.COS_BUCKET || "").trim(),
  region: String(process.env.COS_REGION || "").trim()
};
let cosClient = null;
const sessions = new Map();
const maintenanceEventClients = new Set();
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTS = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "txt", "csv", "log", "md", "xlsx", "xls", "docx", "doc", "mp4", "mov", "m4v", "webm", "avi", "mp3", "wav", "m4a", "aac"]);
const BLOCKED_ATTACHMENT_EXTS = new Set(["html", "htm", "svg", "js", "mjs"]);

const roles = {
  receiver: { permissions: ["view"], allowedTabs: ["homePage", "infoPage", "maintenancePage"] },
  publisher: { permissions: ["view", "create", "remind"], allowedTabs: ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage"] },
  admin: { permissions: ["view", "create", "edit", "delete", "remind", "fixedManage"], allowedTabs: ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage", "settingsPage"] }
};
const allowedTabKeys = ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage"];
const allowedPermissionKeys = ["view", "create", "edit", "delete", "remind", "fixedManage"];
const personnelFunctionCategories = ["维修", "放行"];

const defaultPeople = [
  { id: "00000001", name: "接收者", department: "未设置", team: "一班", functionCategory: "维修" },
  { id: "10000001", name: "王大伟", department: "未设置", team: "一班", functionCategory: "维修" },
  { id: "10000002", name: "赵威", department: "未设置", team: "管理组", functionCategory: "维修" },
  { id: "10000003", name: "黄金山", department: "未设置", team: "二班", functionCategory: "维修" },
  { id: "10000004", name: "黄磊", department: "未设置", team: "检查组", functionCategory: "维修" },
  { id: "10000005", name: "田元鹏", department: "未设置", team: "运行组", functionCategory: "维修" }
];

const defaultCategories = ["质量问题", "规定要求", "周例会", "日例会", "其他"];

await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(uploadDir, { recursive: true });
const db = await createDatabase({ dbPath });

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function cosEnabled() {
  return Object.values(cosConfig).every(Boolean);
}

function cosSignedUrl(method, objectKey, expiresSeconds = 600, query = {}) {
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

function normalizePerson(person, index = 0) {
  const rawId = String(person?.id || "");
  const id = rawId.trim() || String(90000000 + index).slice(0, 8);
  return {
    id,
    name: String(person?.name || "").trim() || "未命名",
    department: String(person?.department || "未设置").trim() || "未设置",
    team: String(person?.team || person?.department || "未设置").trim() || "未设置",
    functionCategory: normalizeFunctionCategory(person?.functionCategory || person?.function_category)
  };
}

function allPeople() {
  const rows = db.prepare("select id,username,name,department,team,function_category from users where status is null or status<>'disabled' order by username").all();
  return rows.length ? rows.map(row => ({
    id: row.id,
    username: row.username,
    name: row.name,
    department: row.department || "未设置",
    team: row.team || "未设置",
    functionCategory: normalizeFunctionCategory(row.function_category)
  })) : defaultPeople;
}

function allLoginPeople() {
  return allPeople();
}

function toUser(row) {
  if (!row) return { id: "", username: "", name: "", role: "", permissions: [], allowedTabs: [] };
  const role = normalizeRole(row.role);
  const preset = roles[role] || roles.receiver;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role,
    department: row.department || "未设置",
    team: row.team || "未设置",
    functionCategory: normalizeFunctionCategory(row.function_category),
    status: row.status || "active",
    permissions: normalizeKeys(row.permissions, preset.permissions, allowedPermissionKeys),
    allowedTabs: normalizeKeys(row.allowed_tabs, preset.allowedTabs, allowedTabKeys.concat("settingsPage"))
  };
}

function adminUser(row) {
  const user = toUser(row);
  return {
    ...user,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function roleDefaults(role) {
  return roles[role] || roles.receiver;
}

function normalizeRole(value) {
  const normalized = { 接收者: "receiver", 发布者: "publisher", 管理员: "admin", 访客: "receiver", readonly: "receiver", guest: "receiver", user: "receiver", editor: "publisher" }[String(value || "").trim()] || value;
  return ["receiver", "publisher", "admin"].includes(normalized) ? normalized : "receiver";
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

function normalizeKeys(value, fallback, allowed) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(item => String(item).trim()).filter(item => allowed.includes(item))));
  }
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return normalizeKeys(parsed, fallback, allowed);
    } catch {}
  }
  const input = text.split("|");
  const set = new Set(input.map(item => String(item).trim()).filter(item => allowed.includes(item)));
  return set.size ? Array.from(set) : fallback;
}

function publicRolePermissions() {
  return Object.fromEntries(Object.entries(roles).map(([key, value]) => [key, value]));
}

function has(user, permission) {
  return user.permissions.includes(permission);
}

function isAdmin(user) {
  return user?.role === "admin";
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

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map(item => item.trim()).filter(Boolean).map(item => {
    const index = item.indexOf("=");
    return [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))];
  }));
}

function sessionCookie(value, maxAge = 604800) {
  const secure = process.env.COOKIE_SECURE === "true";
  const sameSite = secure ? "None" : "Lax";
  const parts = [`muc_sid=${encodeURIComponent(value || "")}`, "HttpOnly", `SameSite=${sameSite}`, "Path=/", `Max-Age=${maxAge}`];
  if (secure) parts.splice(2, 0, "Secure");
  return parts.join("; ");
}

function currentUser(req) {
  const sid = parseCookies(req).muc_sid;
  const savedSession = sid ? db.prepare("select user_id from sessions where id=? and expires_at>?").get(sid, now()) : null;
  const userId = sid && (sessions.get(sid) || savedSession?.user_id);
  if (sid && savedSession?.user_id && !sessions.has(sid)) sessions.set(sid, savedSession.user_id);
  return toUser(userId ? db.prepare("select * from users where id=?").get(userId) : null);
}

function createLoginSession(row) {
  const sid = randomId("sid");
  sessions.set(sid, row.id);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("insert into sessions(id,user_id,created_at,expires_at) values(?,?,?,?)").run(sid, row.id, now(), expiresAt);
  const user = toUser(row);
  audit(user, "login", "user", user.id);
  return { sid, user };
}

function requireLogin(req, res) {
  const user = currentUser(req);
  if (!user.id) {
    send(res, 401, { error: "请先登录" });
    return null;
  }
  return user;
}

function requirePermission(req, res, permission) {
  const user = requireLogin(req, res);
  if (!user) return null;
  if (!has(user, permission)) {
    send(res, 403, { error: "当前账号没有权限" });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireLogin(req, res);
  if (!user) return null;
  if (!isAdmin(user)) {
    send(res, 403, { error: "当前账号没有管理员权限" });
    return null;
  }
  return user;
}

function audit(user, action, targetType, targetId, detail = "") {
  db.prepare("insert into audit_logs(id,user_id,user_name,action,target_type,target_id,detail,created_at) values(?,?,?,?,?,?,?,?)")
    .run(randomId("audit"), user?.id || "guest", user?.name || "访客", action, targetType, targetId, detail, now());
}

function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { ...corsHeaders(), ...securityHeaders(), "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store", ...headers });
  res.end(body);
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
  const origin = process.env.CORS_ORIGIN;
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true"
  };
}

async function bodyJson(req) {
  const text = (await bodyBuffer(req, MAX_JSON_BYTES)).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function bodyForm(req) {
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

async function seedInitialRecords() {
  const count = db.prepare("select count(*) as count from records").get().count;
  if (count) return;
  const htmlPath = path.join(rootDir, "outputs/muc_apr_may_rules_full/index.html");
  if (!fss.existsSync(htmlPath)) return;
  const records = parseSeedRecords(await fs.readFile(htmlPath, "utf8"));
  const insertRecord = db.prepare("insert into records(id,date,publisher,category,title,summary,original,source_set,created_by,updated_by,created_at,updated_at,deadline,priority,publish_status,publisher_id,imported_read) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const insertRecipient = db.prepare("insert or ignore into record_recipients(record_id,user_id,name,department,team) values(?,?,?,?,?)");
  const insertAttachment = db.prepare("insert into attachments(id,owner_type,owner_id,name,type,size,storage,path,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?)");
  const people = allPeople();
  for (const record of records) {
    const rid = recordId(record);
    const deadline = deadlineFor(record.date);
    insertRecord.run(rid, record.date, record.publisher || "", normalizeCategory(record.category || "规定要求"), record.title || "", record.summary || "", record.original || "", record.sourceSet || "初始导入", "system", "system", now(), now(), deadline, "普通", "已发布", "", 0);
    people.forEach(person => insertRecipient.run(rid, person.id, person.name, person.department, person.team));
    for (const attachment of record.attachments || []) {
      const attId = randomId("att");
      const name = attachment.name || path.basename(attachment.path || "附件");
      let storedName = "";
      let size = 0;
      if (attachment.path) {
        const source = path.join(rootDir, "outputs/muc_apr_may_rules_full", attachment.path);
        storedName = `${attId}-${name}`;
        const target = path.join(uploadDir, storedName);
        try {
          await fs.copyFile(source, target);
          size = (await fs.stat(target)).size;
        } catch {
          storedName = "";
        }
      }
      insertAttachment.run(attId, "record", rid, name, "application/octet-stream", size, storedName ? "server" : "missing", storedName, "system", now());
    }
  }
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
    create table if not exists people(
      id text primary key, name text not null, department text, team text,
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
    create table if not exists maintenance_flights(
      id text primary key,
      date text,
      flight_no text,
      aircraft_no text,
      aircraft_type text,
      stand text,
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
    create table if not exists maintenance_subtasks(
      id text primary key,
      flight_id text not null,
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
      user_id text not null,
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
      user_id text not null,
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
      user_id text not null,
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
      user_id text not null,
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
      user_id text not null,
      user_name text not null,
      team text,
      created_at text not null,
      updated_at text not null,
      primary key(flight_id, role, user_id)
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
      user_id text not null,
      user_name text not null,
      team text,
      standard_hours real default 0,
      source text,
      created_at text not null,
      updated_at text not null,
      unique(batch_id, owner_type, owner_id, role, user_id)
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
  ensureColumn("users", "department", "text");
  ensureColumn("users", "team", "text");
  ensureColumn("users", "status", "text default 'active'");
  ensureColumn("users", "function_category", "text default '维修'");
  db.prepare("update users set function_category='维修' where function_category is null or trim(function_category)=''").run();
  ensureColumn("records", "deadline", "text");
  ensureColumn("records", "priority", "text default '普通'");
  ensureColumn("records", "publish_status", "text default '已发布'");
  ensureColumn("records", "publisher_id", "text");
  ensureColumn("records", "imported_read", "integer default 0");
  ensureColumn("maintenance_flights", "report_finalized_by", "text");
  ensureColumn("maintenance_flights", "report_finalized_by_name", "text");
  ensureColumn("maintenance_flights", "report_finalized_at", "text");
  ensureColumn("maintenance_flights", "archived_at", "text");
  db.prepare("insert into maintenance_sync_state(id,version,updated_at) values(1,0,?) on conflict(id) do nothing").run(now());
  db.prepare("delete from sessions where expires_at<=?").run(now());
  db.prepare("delete from favorites where record_id not in (select id from records)").run();
  const seeds = isProduction ? [] : [
    { id: "00000001", username: "receiver", password: "123456", name: "接收者", role: "receiver", department: "未设置", team: "一班" },
    { id: "u-publisher", username: "publisher", password: "123456", name: "发布者", role: "publisher", department: "未设置", team: "发布组" },
    { id: "54002010", username: "54002010", password: "muc2026", name: "系统管理员", role: "admin", department: "系统管理", team: "管理员" }
  ];
  const insertUser = db.prepare("insert into users(id,username,name,role,salt,password_hash,permissions,allowed_tabs,department,team,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (const seed of seeds) {
    if (db.prepare("select id from users where username=?").get(seed.username)) continue;
    const pass = hashPassword(seed.password);
    insertUser.run(seed.id, seed.username, seed.name, seed.role, pass.salt, pass.hash, JSON.stringify(roles[seed.role].permissions), JSON.stringify(roles[seed.role].allowedTabs), seed.department, seed.team, "active", now(), now());
  }
  ensureDefaultAdmin();
  const legacyAdmin = isProduction ? null : db.prepare("select id from users where username=?").get("admin");
  if (legacyAdmin) {
    db.prepare("delete from sessions where user_id=?").run(legacyAdmin.id);
    db.prepare("delete from favorites where user_id=?").run(legacyAdmin.id);
    db.prepare("delete from users where username=?").run("admin");
  }
  const peopleCount = db.prepare("select count(*) as count from people").get().count;
  if (!peopleCount && !isProduction) {
    const insertPeople = db.prepare("insert into people(id,name,department,team,created_at,updated_at) values(?,?,?,?,?,?)");
    defaultPeople.forEach(person => insertPeople.run(person.id, person.name, person.department, person.team, now(), now()));
  }
  if (!db.prepare("select key from settings where key='categories'").get()) setSetting("categories", defaultCategories);
  if (!db.prepare("select key from settings where key='overdueDays'").get()) setSetting("overdueDays", 3);
  if (!db.prepare("select key from settings where key='reminderDays'").get()) setSetting("reminderDays", 1);
  if (!isProduction) await seedInitialRecords();
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
  migrateMaintenanceReleaseResults();
  migrateMaintenanceThreeLineReports();
  reconcileActiveMaintenanceStatuses();
  migrateLegacyRolesAndPermissions();
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
  db.prepare(`update maintenance_subtasks
    set category='其他'
    where category is null or trim(category)='' or category not in ('工卡指令','单项工作','其他')`).run();
}

function migrateMaintenanceThreeLineReports() {
  const migrationKey = "maintenance_three_line_reports_v1";
  if (settingValue(migrationKey, null)) return;
  const stamp = now();
  const flights = db.prepare("select * from maintenance_flights order by created_at").all();
  const upsertBatch = db.prepare(`insert into maintenance_report_batches(id,flight_id,report_type,status,feedback,version,submitted_by,submitted_by_name,submitted_at,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?) on conflict(flight_id,report_type) do nothing`);
  const insertEntry = db.prepare(`insert into maintenance_report_entries(id,batch_id,flight_id,owner_type,owner_id,role,user_id,user_name,team,standard_hours,source,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(batch_id,owner_type,owner_id,role,user_id) do nothing`);
  maintenanceTransaction(() => {
    for (const flight of flights) {
      const assignments = db.prepare("select * from maintenance_assignments where flight_id=? order by assigned_at,user_name").all(flight.id);
      const release = assignments.find(row => row.owner_type === "flight" && row.role === "放行");
      const sortie = release ? db.prepare("select * from maintenance_sortie_results where assignment_id=?").get(release.id) : null;
      if (sortie) {
        const status = sortie.status === "已确认" ? "已确认" : "已提报";
        const batchId = randomId("mtnrb");
        upsertBatch.run(batchId, flight.id, "release", status, release.feedback || "", 1, release.user_id, release.user_name, release.submitted_at || sortie.updated_at || stamp, release.assigned_at || stamp, stamp);
        const saved = db.prepare("select id from maintenance_report_batches where flight_id=? and report_type='release'").get(flight.id);
        insertEntry.run(randomId("mtnre"), saved?.id || batchId, flight.id, "flight", flight.id, "放行", release.user_id, release.user_name, release.team || "", 0, "历史放行架次", stamp, stamp);
      }

      const legacy = db.prepare("select * from maintenance_work_reports where flight_id=?").get(flight.id);
      const legacyEntries = db.prepare("select * from maintenance_work_report_entries where flight_id=? order by role,user_name").all(flight.id);
      if (legacy && (legacy.status === "已提交" || legacyEntries.length)) {
        const submitted = legacy.status === "已提交";
        const batchId = randomId("mtnrb");
        upsertBatch.run(batchId, flight.id, "routine", submitted ? (flight.status === "已确认" ? "已确认" : "已提报") : "预填", legacy.feedback || "", submitted ? 1 : 0, legacy.reported_by || "", legacy.reported_by_name || "", legacy.reported_at || "", legacy.created_at || stamp, stamp);
        const saved = db.prepare("select id from maintenance_report_batches where flight_id=? and report_type='routine'").get(flight.id);
        for (const item of legacyEntries) {
          insertEntry.run(randomId("mtnre"), saved?.id || batchId, flight.id, "flight", flight.id, item.role, item.user_id, item.user_name, item.team || "", maintenanceBaseHours("flight", flight), "历史例行报工", item.created_at || stamp, stamp);
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
          upsertBatch.run(batchId, flight.id, "nonroutine", complete ? (flight.status === "已确认" ? "已确认" : "已提报") : "预填", "", complete ? 1 : 0, submittedRows[0]?.user_id || "", submittedRows[0]?.user_name || "", submittedRows[0]?.submitted_at || "", subtasks[0]?.created_at || stamp, stamp);
          const saved = db.prepare("select id from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(flight.id);
          for (const item of subAssignments) {
            const subtask = subtasks.find(row => row.id === item.owner_id);
            insertEntry.run(randomId("mtnre"), saved?.id || batchId, flight.id, "subtask", item.owner_id, item.role, item.user_id, item.user_name, item.team || "", Number(subtask?.standard_hours || 0), "历史非例行报工", item.assigned_at || stamp, stamp);
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
  return db.prepare("select * from maintenance_hour_rules order by rule_type,name").all().map(row => {
    if (row.rule_type !== "routineRatio") return row;
    const separator = String(row.name || "").indexOf("::");
    return {
      ...row,
      opportunity: separator >= 0 ? row.name.slice(0, separator) : "",
      role: separator >= 0 ? row.name.slice(separator + 2) : ""
    };
  });
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
      const duplicate = db.prepare("select 1 from maintenance_work_report_entries where flight_id=? and role=? and user_id=?").get(entry.flight_id, current, entry.user_id);
      if (duplicate) db.prepare("delete from maintenance_work_report_entries where flight_id=? and role=? and user_id=?").run(entry.flight_id, legacy, entry.user_id);
      else db.prepare("update maintenance_work_report_entries set role=? where flight_id=? and role=? and user_id=?").run(current, entry.flight_id, legacy, entry.user_id);
    }
    const reportEntries = db.prepare("select * from maintenance_report_entries where role=?").all(legacy);
    for (const entry of reportEntries) {
      const duplicate = db.prepare("select 1 from maintenance_report_entries where batch_id=? and owner_type=? and owner_id=? and role=? and user_id=?")
        .get(entry.batch_id, entry.owner_type, entry.owner_id, current, entry.user_id);
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
  const insert = db.prepare(`insert into maintenance_sortie_results(id,owner_type,owner_id,flight_id,assignment_id,user_id,user_name,team,role,source,sorties,status,confirmed_by,confirmed_at,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(owner_type,owner_id,assignment_id) do nothing`);
  db.exec("begin immediate");
  try {
    for (const row of rows) {
      insert.run(randomId("mtnsrt"), row.owner_type, row.owner_id, row.flight_id || "", row.assignment_id, row.user_id, row.user_name, row.team || "", "放行", "放行架次", 1, row.status, row.confirmed_by || "", row.confirmed_at || "", row.created_at || now(), row.updated_at || now());
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
  const defaults = new Map([["主作", 0.4], ["检验", 0.3], ["辅助", 0.3]]);
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

function migrateLegacyRolesAndPermissions() {
  const rows = db.prepare("select id,role,permissions,allowed_tabs from users").all();
  const update = db.prepare("update users set role=?,permissions=?,allowed_tabs=?,updated_at=? where id=?");
  for (const row of rows) {
    const role = normalizeRole(row.role);
    const defaults = roleDefaults(role);
    const permissions = normalizeKeys(row.permissions, defaults.permissions, allowedPermissionKeys);
    const allowedTabs = normalizeKeys(row.allowed_tabs, defaults.allowedTabs, allowedTabKeys.concat("settingsPage"));
    update.run(role, JSON.stringify(permissions), JSON.stringify(allowedTabs), now(), row.id);
  }
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
  db.prepare("delete from record_recipients where user_id not in (select id from users)").run();
  db.prepare("delete from read_receipts where user_id not in (select id from users)").run();
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

function ensureDefaultAdmin() {
  if (isProduction) {
    const userCount = Number(db.prepare("select count(*) as count from users").get()?.count || 0);
    if (userCount > 0) return;
    const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || "");
    if (!password) throw new Error("生产数据库没有账号，请设置 ADMIN_BOOTSTRAP_PASSWORD 完成首次管理员初始化");
    const username = String(process.env.ADMIN_BOOTSTRAP_USERNAME || "admin").trim() || "admin";
    const name = String(process.env.ADMIN_BOOTSTRAP_NAME || "系统管理员").trim() || "系统管理员";
    const pass = hashPassword(password);
    db.prepare("insert into users(id,username,name,role,salt,password_hash,permissions,allowed_tabs,department,team,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(randomId("u"), username, name, "admin", pass.salt, pass.hash, JSON.stringify(roles.admin.permissions), JSON.stringify(roles.admin.allowedTabs), "系统管理", "管理员", "active", now(), now());
    return;
  }
  const adminDefaults = {
    id: "54002010",
    username: "54002010",
    password: "muc2026",
    name: "系统管理员",
    role: "admin",
    department: "系统管理",
    team: "管理员"
  };
  const row = db.prepare("select * from users where username=?").get(adminDefaults.username);
  const pass = hashPassword(adminDefaults.password);
  const permissions = JSON.stringify(roles.admin.permissions);
  const allowedTabs = JSON.stringify(roles.admin.allowedTabs);
  if (!row) {
    db.prepare("insert into users(id,username,name,role,salt,password_hash,permissions,allowed_tabs,department,team,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(adminDefaults.id, adminDefaults.username, adminDefaults.name, adminDefaults.role, pass.salt, pass.hash, permissions, allowedTabs, adminDefaults.department, adminDefaults.team, "active", now(), now());
    return;
  }
  const passwordOk = verifyPassword(adminDefaults.password, row);
  const needsRepair = row.id !== adminDefaults.id
    || row.role !== adminDefaults.role
    || (row.status || "active") !== "active"
    || !passwordOk
    || JSON.stringify(json(row.permissions, [])) !== permissions
    || JSON.stringify(json(row.allowed_tabs, [])) !== allowedTabs;
  if (!needsRepair) return;
  db.prepare(`update users
    set id=?, name=?, role=?, salt=?, password_hash=?, permissions=?, allowed_tabs=?, department=?, team=?, status='active', updated_at=?
    where username=?`)
    .run(adminDefaults.id, adminDefaults.name, adminDefaults.role, pass.salt, pass.hash, permissions, allowedTabs, adminDefaults.department, adminDefaults.team, now(), adminDefaults.username);
  db.prepare("update sessions set user_id=? where user_id=?").run(adminDefaults.id, row.id);
  db.prepare("update favorites set user_id=? where user_id=?").run(adminDefaults.id, row.id);
  db.prepare("update read_receipts set user_id=? where user_id=?").run(adminDefaults.id, row.id);
  db.prepare("update record_recipients set user_id=? where user_id=?").run(adminDefaults.id, row.id);
}

function backfillRecordRecipients() {
  const people = allPeople();
  const insert = db.prepare("insert or ignore into record_recipients(record_id,user_id,name,department,team) values(?,?,?,?,?)");
  const rows = db.prepare("select id from records").all();
  rows.forEach(record => {
    const count = db.prepare("select count(*) as count from record_recipients where record_id=?").get(record.id).count;
    if (!count) people.forEach(person => insert.run(record.id, person.id, person.name, person.department, person.team));
  });
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
  return db.prepare(`select rr.user_id as id,
      coalesce(u.name, rr.name) as name,
      coalesce(u.department, rr.department, '未设置') as department,
      coalesce(u.team, rr.team, '未设置') as team
    from record_recipients rr
    join users u on u.id=rr.user_id and (u.status is null or u.status<>'disabled')
    where rr.record_id=?
    order by rr.user_id`).all(recordId);
}

function receipts(recordId = "") {
  const rows = recordId
    ? db.prepare(`select r.record_id as recordId,r.user_id as userId,r.read_at as readAt,r.is_overdue as isOverdue,r.remind_count as remindCount,r.last_reminded_at as lastRemindedAt
      from read_receipts r
      join record_recipients rr on rr.record_id=r.record_id and rr.user_id=r.user_id
      join users u on u.id=r.user_id and (u.status is null or u.status<>'disabled')
      where r.record_id=?`).all(recordId)
    : db.prepare(`select r.record_id as recordId,r.user_id as userId,r.read_at as readAt,r.is_overdue as isOverdue,r.remind_count as remindCount,r.last_reminded_at as lastRemindedAt
      from read_receipts r
      join record_recipients rr on rr.record_id=r.record_id and rr.user_id=r.user_id
      join users u on u.id=r.user_id and (u.status is null or u.status<>'disabled')`).all();
  return rows.map(row => ({ ...row, isOverdue: !!row.isOverdue }));
}

function publicSettings() {
  return {
    categories: settingValue("categories", defaultCategories),
    overdueDays: settingValue("overdueDays", 3),
    reminderDays: settingValue("reminderDays", 1),
    people: allPeople(),
    personnelFunctionCategories,
    rolePermissions: publicRolePermissions(),
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
  const canSeeFullFeedback = user.role === "admin" || user.role === "publisher";
  const recordRecipients = recipients(row.id);
  const recordReceipts = receipts(row.id);
  return {
    id: row.id,
    date: row.date,
    publisher: row.publisher,
    publisherId: row.publisher_id || "",
    category: row.category,
    title: row.title,
    summary: row.summary || "",
    original: row.original,
    sourceSet: row.source_set || "",
    attachments: attachments("record", row.id),
    recipients: canSeeFullFeedback ? recordRecipients : recordRecipients.filter(person => person.id === user.id),
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

function publicRecords(rows, user) {
  if (!rows.length) return { records: [], receipts: [] };
  const ids = rows.map(row => row.id);
  const placeholders = ids.map(() => "?").join(",");
  const recipientRows = db.prepare(`select rr.record_id,rr.user_id as id,
      coalesce(u.name,rr.name) as name,coalesce(u.department,rr.department,'未设置') as department,
      coalesce(u.team,rr.team,'未设置') as team
    from record_recipients rr join users u on u.id=rr.user_id and (u.status is null or u.status<>'disabled')
    where rr.record_id in (${placeholders}) order by rr.record_id,rr.user_id`).all(...ids);
  const receiptRows = db.prepare(`select r.record_id as recordId,r.user_id as userId,r.read_at as readAt,
      r.is_overdue as isOverdue,r.remind_count as remindCount,r.last_reminded_at as lastRemindedAt
    from read_receipts r join record_recipients rr on rr.record_id=r.record_id and rr.user_id=r.user_id
    join users u on u.id=r.user_id and (u.status is null or u.status<>'disabled')
    where r.record_id in (${placeholders})`).all(...ids).map(item => ({ ...item, isOverdue: !!item.isOverdue }));
  const attachmentRows = db.prepare(`select * from attachments where owner_type='record' and owner_id in (${placeholders}) order by created_at`).all(...ids);
  const favoriteRows = db.prepare(`select record_id from favorites where user_id=? and record_id in (${placeholders})`).all(user.id, ...ids);
  const recipientsByRecord = groupedRows(recipientRows, "record_id");
  const receiptsByRecord = groupedRows(receiptRows, "recordId");
  const attachmentsByRecord = groupedRows(attachmentRows, "owner_id");
  const favorites = new Set(favoriteRows.map(item => item.record_id));
  const canSeeFullFeedback = user.role === "admin" || user.role === "publisher";
  const visibleReceipts = canSeeFullFeedback ? receiptRows : receiptRows.filter(item => item.userId === user.id);
  return {
    receipts: visibleReceipts,
    records: rows.map(row => {
      const recordRecipients = recipientsByRecord.get(row.id) || [];
      const recordReceipts = receiptsByRecord.get(row.id) || [];
      return {
        id: row.id,
        date: row.date,
        publisher: row.publisher,
        publisherId: row.publisher_id || "",
        category: row.category,
        title: row.title,
        summary: row.summary || "",
        original: row.original,
        sourceSet: row.source_set || "",
        attachments: (attachmentsByRecord.get(row.id) || []).map(item => publicAttachment(item, "record", row.id)),
        recipients: canSeeFullFeedback ? recordRecipients : recordRecipients.filter(person => person.id === user.id),
        receipts: canSeeFullFeedback ? recordReceipts : recordReceipts.filter(receipt => receipt.userId === user.id),
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
  return isAdmin(user) || (user.allowedTabs || []).includes("maintenancePage");
}

function maintenanceCanManage(user) {
  return isAdmin(user) || (user.role === "publisher" && maintenanceHasAccess(user));
}

function maintenanceCanExecute(user) {
  return maintenanceHasAccess(user);
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

const maintenanceSubtaskRoles = ["主作", "检验", "辅助"];

function maintenanceRolesForOwner(ownerType, owner) {
  if (ownerType === "subtask") return maintenanceSubtaskRoles;
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

function normalizeMaintenanceAssignments(ownerType, owner, assignments) {
  const allowed = maintenanceRolesForOwner(ownerType, owner);
  const aliases = { "航后机内": "例行机内", "航后起落架": "例行L/G", "航后发动机": "例行发动机", "航后外部": "例行机外", "航后电子": "例行电子" };
  const people = new Map(allPeople().map(person => [person.id, person]));
  const seen = new Set();
  const normalized = [];
  const releaseUsers = new Set();
  for (const item of assignments) {
    const userId = String(item.userId || item.id || "").trim();
    const person = people.get(userId);
    if (!person) throw maintenanceDispatchError("派工人员不存在或已停用");
    const rawRole = String(item.role || "").trim();
    const role = aliases[rawRole] || rawRole;
    if (!allowed.includes(role)) throw maintenanceDispatchError(`${ownerType === "subtask" ? "非例行" : "当前维修机会"}不支持“${role || "未设置"}”类别`);
    const key = `${userId}\u0000${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (role === "放行") releaseUsers.add(userId);
    normalized.push({ person, role });
  }
  if (!normalized.length) throw maintenanceDispatchError("请至少选择一项派工人员");
  if (releaseUsers.size > 1) throw maintenanceDispatchError("放行类别最多只能选择一人");
  return normalized;
}

function maintenanceFlightPayload(input = {}) {
  const allowedOpportunities = ["航前", "航后", "航后/航前", "短停", "热备机", "停场", "附加", "其他", "三方短停", "三方航后", "三方航前"];
  const rawOpportunity = String(input.maintenanceOpportunity || input.maintenance_opportunity || input.workKind || input.work_kind || input["维修机会"] || input.workType || input.work_type || input["工作类型"] || input["工作种类"] || "航后").trim();
  const maintenanceOpportunity = allowedOpportunities.includes(rawOpportunity) ? rawOpportunity : "其他";
  return {
    date: String(input.date || input["日期"] || "").trim(),
    flightNo: String(input.flightNo || input.flight_no || input["航班号"] || "").trim(),
    aircraftNo: String(input.aircraftNo || input.aircraft_no || input["机号"] || "").trim(),
    aircraftType: String(input.aircraftType || input.aircraft_type || input["机型"] || "A320").trim(),
    stand: String(input.stand || input["机位"] || "").trim(),
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
    userId: row.user_id,
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
    userId: row.user_id,
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
    userId: row.user_id,
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
  return db.prepare("select * from maintenance_hour_results where owner_type=? and owner_id=? order by user_name").all(ownerType, ownerId).map(publicMaintenanceHour);
}

function maintenanceSorties(ownerType, ownerId) {
  return db.prepare("select * from maintenance_sortie_results where owner_type=? and owner_id=? order by user_name").all(ownerType, ownerId).map(publicMaintenanceSortie);
}

function maintenanceWorkReport(flightId) {
  const row = db.prepare("select * from maintenance_work_reports where flight_id=?").get(flightId);
  const entries = db.prepare("select * from maintenance_work_report_entries where flight_id=? order by role,user_name").all(flightId).map(item => ({
    role: item.role,
    userId: item.user_id,
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

function maintenanceTransaction(callback) {
  db.exec("begin immediate");
  try {
    const result = callback();
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
  userId,
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
  db.prepare(`insert into maintenance_assignments(id,owner_type,owner_id,flight_id,user_id,user_name,team,role,is_lead,status,feedback,assigned_by,assigned_at,received_at,started_at,completed_at,submitted_at,modified_at,confirmed_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, ownerType, ownerId, flightId, userId, userName, team, role, isLead, status, feedback, assignedBy, assignedAt, receivedAt, startedAt, completedAt, submittedAt, modifiedAt, confirmedAt);
  return id;
}

const maintenanceReportTypes = ["release", "routine", "nonroutine"];
const maintenanceNonroutineCategories = ["工卡指令", "单项工作", "其他"];

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
      userId: item.user_id,
      userName: item.user_name,
      team: item.team || "未设置",
      standardHours: Number(item.standard_hours || 0),
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
        userId: String(item?.userId || "")
      })) : [],
      feedback: String(payload.feedback || ""),
      releaseUserId: String(payload.releaseUserId || ""),
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
      category: maintenanceNonroutineCategories.includes(String(item?.category || "")) ? String(item.category) : "其他",
      reportExplanation: String(item?.reportExplanation || item?.content || "")
    })),
    version: Number(row.version || 1),
    updatedBy: row.updated_by || "",
    updatedByName: row.updated_by_name || "",
    updatedAt: row.updated_at || ""
  };
}

function writeMaintenanceReportDraft(flightId, reportType, payload, user, current = null) {
  const stamp = now();
  const id = current?.id || randomId("mtnrd");
  const version = current ? Number(current.version || 1) + 1 : 1;
  db.prepare(`insert into maintenance_report_drafts(id,flight_id,report_type,payload_json,version,updated_by,updated_by_name,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?)
    on conflict(flight_id,report_type) do update set payload_json=excluded.payload_json,version=excluded.version,updated_by=excluded.updated_by,updated_by_name=excluded.updated_by_name,updated_at=excluded.updated_at`)
    .run(id, flightId, reportType, JSON.stringify(payload), version, user.id, user.name, current?.created_at || stamp, stamp);
  return version;
}

function normalizeMaintenanceNonroutineDraft(payload) {
  const people = new Set(allPeople().map(person => person.id));
  const items = (Array.isArray(payload?.items) ? payload.items : []).slice(0, 30).map(raw => ({
    clientId: String(raw?.clientId || randomId("mtnrditem")).slice(0, 120),
    chapter: String(raw?.chapter || raw?.cardNo || "").slice(0, 200),
    title: String(raw?.title || "").slice(0, 500),
    category: maintenanceNonroutineCategories.includes(String(raw?.category || "")) ? String(raw.category) : "其他",
    standardHours: raw?.standardHours === "" || raw?.standardHours === null || raw?.standardHours === undefined ? "" : Number(raw.standardHours),
    reportExplanation: String(raw?.reportExplanation || raw?.content || "").slice(0, 4000),
    entries: (Array.isArray(raw?.entries) ? raw.entries : [])
      .filter(entry => maintenanceSubtaskRoles.includes(String(entry?.role || "")) && people.has(String(entry?.userId || "")))
      .map(entry => ({ role: String(entry.role), userId: String(entry.userId) }))
      .filter((entry, index, entries) => entries.findIndex(item => item.role === entry.role && item.userId === entry.userId) === index)
  }));
  return { items };
}

function assertMaintenanceNonroutineDraftAccess(flightId, user) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceDispatchError("未找到维修机会");
  if (!maintenanceCanSubmitReport(user, flightId)) throw maintenanceDispatchError("只有该维修机会的派工人员可以编辑非例行草稿");
  if (["待复核", "已确认"].includes(flight.status)) throw maintenanceReviewError("当前维修机会已进入复核，不能编辑非例行草稿", 409);
  if (db.prepare("select 1 from maintenance_subtasks where flight_id=? limit 1").get(flightId)) throw maintenanceReviewError("当前维修机会已经存在正式非例行，请刷新后使用非例行报工", 409);
  if (db.prepare("select 1 from maintenance_report_batches where flight_id=? and report_type='nonroutine' limit 1").get(flightId)) throw maintenanceReviewError("非例行已经提报，不能继续编辑草稿", 409);
  return flight;
}

function saveMaintenanceNonroutineDraft(flightId, payload, user) {
  assertMaintenanceNonroutineDraftAccess(flightId, user);
  const current = db.prepare("select * from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").get(flightId);
  const expectedVersion = payload?.version;
  if (current && Number(expectedVersion) !== Number(current.version || 1)) throw maintenanceReviewError("草稿已被其他人员更新，请刷新后重试", 409);
  if (!current && expectedVersion !== null && expectedVersion !== undefined && Number(expectedVersion) !== 0) throw maintenanceReviewError("草稿版本已变化，请刷新后重试", 409);
  const normalized = normalizeMaintenanceNonroutineDraft(payload);
  const version = writeMaintenanceReportDraft(flightId, "nonroutine", normalized, user, current);
  maintenanceLog(user, "save_nonroutine_draft", "flight", flightId, flightId, JSON.stringify({ version, itemCount: normalized.items.length }));
  return maintenanceReportDraft(flightId, "nonroutine");
}

function deleteMaintenanceNonroutineDraft(flightId, payload, user) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceDispatchError("未找到维修机会");
  if (!maintenanceCanSubmitReport(user, flightId)) throw maintenanceDispatchError("只有该维修机会的派工人员可以删除非例行草稿");
  if (["待复核", "已确认"].includes(flight.status)) throw maintenanceReviewError("当前维修机会已进入复核，不能删除非例行草稿", 409);
  const current = db.prepare("select * from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").get(flightId);
  if (!current) return false;
  if (Number(payload?.version) !== Number(current.version || 1)) throw maintenanceReviewError("草稿已被其他人员更新，请刷新后重试", 409);
  db.prepare("delete from maintenance_report_drafts where id=?").run(current.id);
  maintenanceLog(user, "delete_nonroutine_draft", "flight", flightId, flightId, JSON.stringify({
    version: Number(current.version || 1),
    payload: current.payload_json || "{}"
  }));
  return true;
}

function applyMaintenanceReleaseSelection(flightId, requestedUserId, user) {
  const release = db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=? and role='放行'").get(flightId);
  if (!release) throw maintenanceDispatchError("当前维修机会尚未派工放行人员");
  const releaseBatch = maintenanceReportBatch(flightId, "release");
  const requested = String(requestedUserId || release.user_id).trim();
  if (releaseBatch) {
    const lockedUserId = String(releaseBatch.entries.find(item => item.role === "放行")?.userId || release.user_id);
    if (requested && requested !== lockedUserId) throw maintenanceReviewError("放行架次已提报，放行人员已锁定", 409);
    return lockedUserId;
  }
  if (!requested || requested === release.user_id) return release.user_id;
  if (release.user_id !== user.id) throw maintenanceDispatchError("只有当前放行人员可以调整放行归属");
  const person = allPeople().find(item => item.id === requested);
  if (!person) throw maintenanceDispatchError("新的放行人员不存在或已停用");
  db.prepare("update maintenance_assignments set user_id=?,user_name=?,team=?,modified_at=? where id=?")
    .run(person.id, person.name, person.team || "未设置", now(), release.id);
  maintenanceLog(user, "routine_draft_release_reassigned", "flight", flightId, flightId, JSON.stringify({
    assignmentId: release.id,
    beforeUserId: release.user_id,
    afterUserId: person.id
  }));
  return person.id;
}

function syncMaintenanceRoutineAssignments(flight, entries, user) {
  const flightId = flight.id;
  const allowedRoles = new Set(
    maintenanceRolesForOpportunity(flight.work_kind || flight.work_type).filter(role => role !== "放行")
  );
  const currentRows = db.prepare(
    "select * from maintenance_assignments where owner_type='flight' and owner_id=? and role<>'放行' order by assigned_at,id"
  ).all(flightId);
  const lockedRow = currentRows.find(row =>
    allowedRoles.has(row.role) && ["已提报", "待复核", "已确认"].includes(row.status)
  );
  if (lockedRow) throw maintenanceReviewError("例行工作已经提报，不能通过保存调整人员", 409);

  const desiredByKey = new Map(entries.map(entry => [
    `${entry.role}\u0000${entry.person.id}`,
    entry
  ]));
  const currentByKey = new Map(currentRows.map(row => [
    `${row.role}\u0000${row.user_id}`,
    row
  ]));
  const before = currentRows
    .filter(row => allowedRoles.has(row.role))
    .map(row => ({ id: row.id, role: row.role, userId: row.user_id, userName: row.user_name, status: row.status }));

  for (const row of currentRows) {
    if (!allowedRoles.has(row.role)) continue;
    if (desiredByKey.has(`${row.role}\u0000${row.user_id}`)) continue;
    db.prepare("delete from maintenance_feedback where assignment_id=?").run(row.id);
    db.prepare("delete from maintenance_hour_results where assignment_id=?").run(row.id);
    db.prepare("delete from maintenance_sortie_results where assignment_id=?").run(row.id);
    db.prepare("delete from maintenance_assignments where id=?").run(row.id);
  }

  const stamp = now();
  for (const entry of entries) {
    const key = `${entry.role}\u0000${entry.person.id}`;
    const existing = currentByKey.get(key);
    if (existing) {
      if (existing.user_name !== entry.person.name || (existing.team || "未设置") !== (entry.person.team || "未设置")) {
        db.prepare("update maintenance_assignments set user_name=?,team=?,modified_at=? where id=?")
          .run(entry.person.name, entry.person.team || "未设置", stamp, existing.id);
      }
      continue;
    }
    insertMaintenanceAssignment({
      ownerType: "flight",
      ownerId: flightId,
      flightId,
      userId: entry.person.id,
      userName: entry.person.name,
      team: entry.person.team || "未设置",
      role: entry.role,
      status: "已派工",
      assignedBy: user.id,
      assignedAt: stamp
    });
  }

  db.prepare("update maintenance_flights set updated_by=?,updated_at=? where id=?")
    .run(user.id, stamp, flightId);
  const after = db.prepare(
    "select id,role,user_id as userId,user_name as userName,status from maintenance_assignments where owner_type='flight' and owner_id=? and role<>'放行' order by role,user_name"
  ).all(flightId).filter(row => allowedRoles.has(row.role));
  return { before, after };
}

function saveMaintenanceRoutineDraft(flightId, payload, user) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceDispatchError("未找到维修机会");
  if (!maintenanceCanSubmitReport(user, flightId)) throw maintenanceDispatchError("只有该维修机会的派工人员可以保存例行派工");
  if (["待复核", "已确认"].includes(flight.status)) throw maintenanceReviewError("当前维修机会已进入复核，不能调整例行派工", 409);
  if (maintenanceReportBatch(flightId, "routine")) throw maintenanceReviewError("例行报工已经提报，不能继续调整人员", 409);
  const current = db.prepare("select * from maintenance_report_drafts where flight_id=? and report_type='routine'").get(flightId);
  const expectedVersion = payload?.version;
  if (current && Number(expectedVersion) !== Number(current.version || 1)) throw maintenanceReviewError("例行未提报数据已被其他人员更新，请刷新后重试", 409);
  if (!current && expectedVersion !== null && expectedVersion !== undefined && Number(expectedVersion) !== 0) throw maintenanceReviewError("例行未提报数据版本已变化，请刷新后重试", 409);
  return maintenanceTransaction(() => {
    const releaseUserId = applyMaintenanceReleaseSelection(flightId, payload?.releaseUserId, user);
    const roles = maintenanceRolesForOpportunity(flight.work_kind || flight.work_type).filter(role => role !== "放行");
    const reportEntries = normalizeMaintenanceReportEntries(payload?.entries, roles, {
      ownerType: "flight",
      ownerId: flightId,
      standardHours: maintenanceBaseHours("flight", flight),
      source: "例行派工保存"
    });
    const assignmentChanges = syncMaintenanceRoutineAssignments(flight, reportEntries, user);
    const entries = reportEntries.map(item => ({ role: item.role, userId: item.person.id }));
    const normalized = {
      entries,
      feedback: String(payload?.feedback || "").slice(0, 4000),
      releaseUserId
    };
    const version = writeMaintenanceReportDraft(flightId, "routine", normalized, user, current);
    maintenanceLog(user, "save_routine_draft", "flight", flightId, flightId, JSON.stringify({
      version,
      entryCount: entries.length,
      releaseUserId,
      beforeAssignments: assignmentChanges.before,
      afterAssignments: assignmentChanges.after
    }));
    return {
      draft: maintenanceReportDraft(flightId, "routine"),
      flight: publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId))
    };
  });
}

function assertMaintenanceReportDraftVersion(flightId, reportType, expectedVersion) {
  const current = db.prepare("select version from maintenance_report_drafts where flight_id=? and report_type=?").get(flightId, reportType);
  if (!current) return;
  if (Number(expectedVersion) !== Number(current.version || 1)) throw maintenanceReviewError("共享草稿已被其他人员更新，请刷新后重试", 409);
}

function upsertMaintenanceReportBatch(flightId, reportType, { status = "已提报", feedback = "", user = null, entries = [], expectedVersion = null } = {}) {
  if (!maintenanceReportTypes.includes(reportType)) throw maintenanceDispatchError("无效的报工类别");
  const current = db.prepare("select * from maintenance_report_batches where flight_id=? and report_type=?").get(flightId, reportType);
  if (current && expectedVersion !== null && Number(current.version || 0) !== Number(expectedVersion)) throw maintenanceReviewError("报工数据已被其他人员更新，请刷新后重试", 409);
  if (current && ["已提报", "待复核", "已确认"].includes(current.status) && status === "已提报") throw maintenanceReviewError("该类别已经提报，不能重复提交", 409);
  const stamp = now();
  const id = current?.id || randomId("mtnrb");
  db.prepare(`insert into maintenance_report_batches(id,flight_id,report_type,status,feedback,version,submitted_by,submitted_by_name,submitted_at,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?) on conflict(flight_id,report_type) do update set status=excluded.status,feedback=excluded.feedback,version=maintenance_report_batches.version+1,submitted_by=excluded.submitted_by,submitted_by_name=excluded.submitted_by_name,submitted_at=excluded.submitted_at,updated_at=excluded.updated_at`)
    .run(id, flightId, reportType, status, feedback, current ? Number(current.version || 0) + 1 : 1, user?.id || current?.submitted_by || "", user?.name || current?.submitted_by_name || "", user ? stamp : current?.submitted_at || "", current?.created_at || stamp, stamp);
  db.prepare("delete from maintenance_report_entries where batch_id=?").run(id);
  const insert = db.prepare(`insert into maintenance_report_entries(id,batch_id,flight_id,owner_type,owner_id,role,user_id,user_name,team,standard_hours,source,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const entry of entries) insert.run(randomId("mtnre"), id, flightId, entry.ownerType, entry.ownerId, entry.role, entry.person.id, entry.person.name, entry.person.team || "未设置", Number(entry.standardHours || 0), entry.source || "报工补录", stamp, stamp);
  return maintenanceReportBatch(flightId, reportType);
}

function replaceMaintenanceReportEntries(batchId, flightId, entries, { feedback } = {}) {
  const stamp = now();
  db.prepare("delete from maintenance_report_entries where batch_id=?").run(batchId);
  const insert = db.prepare(`insert into maintenance_report_entries(id,batch_id,flight_id,owner_type,owner_id,role,user_id,user_name,team,standard_hours,source,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const entry of entries) insert.run(randomId("mtnre"), batchId, flightId, entry.ownerType, entry.ownerId, entry.role, entry.person.id, entry.person.name, entry.person.team || "未设置", Number(entry.standardHours || 0), entry.source || "报工确认调整", stamp, stamp);
  if (feedback === undefined) {
    db.prepare("update maintenance_report_batches set version=version+1,updated_at=? where id=?").run(stamp, batchId);
  } else {
    db.prepare("update maintenance_report_batches set feedback=?,version=version+1,updated_at=? where id=?").run(String(feedback), stamp, batchId);
  }
}

function maintenanceTaskTreeAssignments(flightId) {
  return db.prepare("select * from maintenance_assignments where flight_id=? order by owner_type,owner_id,role,user_name").all(flightId);
}

function maintenanceCanSubmitReport(user, flightId) {
  return maintenanceTaskTreeAssignments(flightId).some(row => row.user_id === user.id);
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

function publicMaintenanceNonroutineDraft(flightId) {
  const draft = maintenanceReportDraft(flightId, "nonroutine");
  if (!draft) return null;
  const people = new Map(allPeople().map(person => [person.id, person]));
  return {
    ...draft,
    items: draft.items.map(item => ({
      ...item,
      entries: (item.entries || []).map(entry => {
        const person = people.get(entry.userId);
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
  return {
    id: row.id,
    flightId: row.flight_id,
    cardNo: row.card_no || "",
    title: row.title || "",
    content: row.content || "",
    category: row.category || "",
    standardHours: Number(row.standard_hours || 0),
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
    aircraftNo: row.aircraft_no || "",
    aircraftType: row.aircraft_type || "",
    stand: row.stand || "",
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
  const mainMine = flight.assignments.filter(assignment => assignment.userId === user.id);
  const activeStatuses = new Set(["已派工", "已提报"]);
  const isActive = assignment => activeStatuses.has(assignment.status);
  const isMine = assignment => assignment.userId === user.id && isActive(assignment);
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
  if (!mainVisible) flight.assignments = [];
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
      userId: item.user_id,
      userName: item.user_name,
      team: item.team || "未设置",
      standardHours: Number(item.standard_hours || 0),
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
          chapter: String(item?.chapter || item?.cardNo || ""),
          title: String(item?.title || ""),
          category: maintenanceNonroutineCategories.includes(String(item?.category || "")) ? String(item.category) : "其他",
          standardHours: Number(item?.standardHours || 0),
          reportExplanation: "",
          entries: (item?.entries || []).map(entry => ({
            role: String(entry?.role || ""),
            userId: String(entry?.userId || ""),
            userName: people.get(entry.userId)?.name || "",
            team: people.get(entry.userId)?.team || "未设置"
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
      aircraftNo: row.aircraft_no || "",
      aircraftType: row.aircraft_type || "",
      stand: row.stand || "",
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
        standardHours: Number(item.standard_hours || 0),
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
  if (!(maintenanceCanManage(user) && scope !== "execute" && scope !== "data")) {
    conditions.push(`exists (select 1 from maintenance_assignments visible_assignment
      where visible_assignment.flight_id=maintenance_flights.id and visible_assignment.user_id=?
      ${scope === "execute" ? "and visible_assignment.status in ('已派工','已提报') and maintenance_flights.status in ('已派工','已提报')" : ""})`);
    params.push(user.id);
  }
  if (filters.dateFrom) { conditions.push("date>=?"); params.push(filters.dateFrom); }
  if (filters.dateTo) { conditions.push("date<=?"); params.push(filters.dateTo); }
  if (filters.opportunities?.length) {
    conditions.push(`coalesce(nullif(work_kind,''),work_type) in (${filters.opportunities.map(() => "?").join(",")})`);
    params.push(...filters.opportunities);
  }
  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    conditions.push(`(lower(coalesce(flight_no,'')) like ? or lower(coalesce(aircraft_no,'')) like ?
      or lower(coalesce(aircraft_type,'')) like ? or lower(coalesce(stand,'')) like ?
      or lower(coalesce(work_kind,'')) like ? or exists (select 1 from maintenance_assignments search_assignment
        where search_assignment.flight_id=maintenance_flights.id and lower(search_assignment.user_name) like ?))`);
    params.push(term, term, term, term, term, term);
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
  if (ownerType === "subtask") return db.prepare("select s.*,f.date,f.flight_no,f.aircraft_no,f.aircraft_type,f.stand,f.planned_arrival,f.planned_departure,f.work_type,f.work_kind from maintenance_subtasks s join maintenance_flights f on f.id=s.flight_id where s.id=?").get(ownerId);
  return null;
}

function maintenanceLog(user, action, ownerType, ownerId, flightId = "", detail = "") {
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

function maintenanceRatioForOwner(ownerType, owner, role) {
  if (ownerType === "subtask") return maintenanceRoleRatio(role);
  return maintenanceRoutineRoleRatioRule(owner?.work_kind || owner?.work_type || "其他", role) ?? 0;
}

function maintenanceRatioRuleForOwner(ownerType, owner, role) {
  return ownerType === "subtask"
    ? maintenanceRoleRatioRule(role)
    : maintenanceRoutineRoleRatioRule(owner?.work_kind || owner?.work_type || "其他", role);
}

function maintenanceBaseHours(ownerType, owner) {
  if (ownerType === "subtask") return Number(owner?.standard_hours || 0) || 0;
  const opportunity = owner?.work_kind || owner?.work_type || "其他";
  const row = db.prepare("select value from maintenance_hour_rules where rule_type='workType' and name=?").get(opportunity);
  return Number(row?.value || 0) || 0;
}

function updateMaintenanceOwnerStatus(ownerType, ownerId, status, userId = "") {
  const table = ownerType === "flight" ? "maintenance_flights" : "maintenance_subtasks";
  db.prepare(`update ${table} set status=?,updated_by=coalesce(?,updated_by),updated_at=? where id=?`).run(status, userId || "", now(), ownerId);
}

function maintenanceAssignmentsStatus(ownerType, ownerId) {
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
    const rows = db.prepare("select status from maintenance_assignments where owner_type='subtask' and owner_id=?").all(subtask.id);
    const label = `非例行“${subtask.title || "未命名"}”`;
    if (!rows.length) blockers.push(`${label}尚未派工`);
    else if (rows.some(row => row.status === "已派工")) blockers.push(`${label}尚有人员未报工`);
  }
  return blockers;
}

function reconcileMaintenanceTreeStatus(flightId, userId = "", { preserveConfirmed = true } = {}) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) return null;
  const subtasks = db.prepare("select * from maintenance_subtasks where flight_id=? order by created_at").all(flightId);
  const subtaskStatuses = [];
  for (const subtask of subtasks) {
    const derived = maintenanceAssignmentsStatus("subtask", subtask.id);
    const target = preserveConfirmed && subtask.status === "已确认" && derived !== "已确认" ? "已确认" : derived;
    if (subtask.status !== target) updateMaintenanceOwnerStatus("subtask", subtask.id, target, userId);
    subtaskStatuses.push(target);
  }

  const assignments = db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=?").all(flightId);
  let target = "未派工";
  if (assignments.length) {
    const progress = maintenanceReportProgress(flightId);
    const allConfirmed = assignments.every(row => row.status === "已确认") && subtaskStatuses.every(status => status === "已确认");
    if (allConfirmed && flight.report_finalized_at) target = "已确认";
    else if (flight.report_finalized_at) target = "待复核";
    else if (progress?.anySubmitted) target = "已提报";
    else target = "已派工";
  }
  if (preserveConfirmed && flight.status === "已确认" && target !== "已确认") target = "已确认";
  if (flight.status !== target) updateMaintenanceOwnerStatus("flight", flightId, target, userId);
  return target;
}

function reconcileActiveMaintenanceStatuses() {
  const rows = db.prepare("select id from maintenance_flights where status<>'已确认'").all();
  rows.forEach(row => reconcileMaintenanceTreeStatus(row.id, "", { preserveConfirmed: true }));
}

function regenerateMaintenanceHours(ownerType, ownerId, resultStatus = "待复核") {
  const owner = maintenanceOwner(ownerType, ownerId);
  if (!owner) return [];
  const assignments = db.prepare("select * from maintenance_assignments where owner_type=? and owner_id=? and status=? and role<>'放行'").all(ownerType, ownerId, resultStatus);
  db.prepare("delete from maintenance_hour_results where owner_type=? and owner_id=? and status=?").run(ownerType, ownerId, resultStatus);
  if (!assignments.length) return maintenanceHours(ownerType, ownerId);
  const counts = assignments.reduce((acc, row) => {
    acc[row.role] = (acc[row.role] || 0) + 1;
    return acc;
  }, {});
  const insert = db.prepare(`insert into maintenance_hour_results(id,owner_type,owner_id,flight_id,assignment_id,user_id,user_name,team,role,source,hours,adjusted_hours,status,confirmed_by,confirmed_at,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    on conflict(owner_type,owner_id,assignment_id) do update set user_name=excluded.user_name,team=excluded.team,role=excluded.role,source=excluded.source,hours=excluded.hours,status=excluded.status,confirmed_by='',confirmed_at='',updated_at=excluded.updated_at`);
  const baseHours = maintenanceBaseHours(ownerType, owner);
  for (const item of assignments) {
    const ratio = maintenanceRatioForOwner(ownerType, owner, item.role);
    const hours = (baseHours * ratio) / Math.max(1, counts[item.role] || 1);
    insert.run(randomId("mtnh"), ownerType, ownerId, item.flight_id || owner.flight_id || owner.id, item.id, item.user_id, item.user_name, item.team || "", item.role, ownerType === "subtask" ? "非例行" : "维修机会", Number(hours.toFixed(2)), null, resultStatus, "", "", now(), now());
  }
  return maintenanceHours(ownerType, ownerId);
}

function regenerateMaintenanceSorties(ownerType, ownerId, resultStatus = "待复核") {
  const owner = maintenanceOwner(ownerType, ownerId);
  if (!owner) return [];
  const assignments = db.prepare("select * from maintenance_assignments where owner_type=? and owner_id=? and status=? and role='放行'").all(ownerType, ownerId, resultStatus);
  db.prepare("delete from maintenance_sortie_results where owner_type=? and owner_id=? and status=?").run(ownerType, ownerId, resultStatus);
  const insert = db.prepare(`insert into maintenance_sortie_results(id,owner_type,owner_id,flight_id,assignment_id,user_id,user_name,team,role,source,sorties,status,confirmed_by,confirmed_at,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(owner_type,owner_id,assignment_id) do update set user_name=excluded.user_name,team=excluded.team,sorties=1,status=excluded.status,confirmed_by='',confirmed_at='',updated_at=excluded.updated_at`);
  for (const item of assignments) {
    insert.run(randomId("mtnsrt"), ownerType, ownerId, item.flight_id || owner.flight_id || owner.id, item.id, item.user_id, item.user_name, item.team || "", "放行", "放行架次", 1, resultStatus, "", "", now(), now());
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
        archivedAt: owner?.archived_at || ""
      } : {
        chapter: owner?.card_no || "",
        title: owner?.title || "",
        category: owner?.category || "",
        standardHours: Number(owner?.standard_hours || 0),
        reportExplanation: owner?.content || ""
      },
      assignments: maintenanceAssignments(ownerType, ownerId).map(row => ({ userId: row.userId, userName: row.userName, team: row.team, role: row.role, status: row.status, feedback: row.feedback, submittedAt: row.submittedAt })),
      hours: maintenanceHours(ownerType, ownerId).map(row => ({ userId: row.userId, role: row.role, hours: row.hours, adjustedHours: row.adjustedHours, finalHours: row.finalHours, status: row.status })),
      sorties: maintenanceSorties(ownerType, ownerId).map(row => ({ userId: row.userId, role: row.role, sorties: row.sorties, status: row.status }))
    };
  });
}

function maintenanceReviewTask(ownerType, owner, flight) {
  const assignments = maintenanceAssignments(ownerType, owner.id);
  const hours = maintenanceHours(ownerType, owner.id);
  const sorties = maintenanceSorties(ownerType, owner.id);
  const hourByAssignment = new Map(hours.map(row => [row.assignmentId, row]));
  const sortieByAssignment = new Map(sorties.map(row => [row.assignmentId, row]));
  const baseHours = maintenanceBaseHours(ownerType, owner);
  const allowedRoles = maintenanceRolesForOwner(ownerType, ownerType === "flight" ? flight : owner);
  const archivedFlight = flight.status === "已确认" || Boolean(flight.archived_at);
  const counts = assignments.reduce((result, row) => {
    result[row.role] = (result[row.role] || 0) + 1;
    return result;
  }, {});
  return {
    ownerType,
    ownerId: owner.id,
    title: ownerType === "flight" ? "维修机会" : (owner.title || "非例行"),
    subtitle: ownerType === "flight" ? (flight.work_kind || flight.work_type || "其他") : (owner.category || "非例行"),
    status: owner.status || "未派工",
    baseHours,
    baseHoursSource: ownerType === "flight" ? `维修机会规则 · ${flight.work_kind || flight.work_type || "其他"}` : "非例行标准工时",
    editable: ["已提报", "待复核", "已确认"].includes(owner.status || "未派工") || (archivedFlight && ownerType === "subtask"),
    archiveCorrection: archivedFlight && ownerType === "subtask" && owner.status !== "已确认",
    roles: allowedRoles.map(role => ({ role, metricType: role === "放行" ? "sorties" : "hours", ratio: role === "放行" ? null : maintenanceRatioForOwner(ownerType, owner, role) })),
    assignments: assignments.map(row => {
      const savedHour = hourByAssignment.get(row.id);
      const savedSortie = sortieByAssignment.get(row.id);
      const isRelease = row.role === "放行";
      const ruleHours = isRelease ? 0 : (baseHours * maintenanceRatioForOwner(ownerType, owner, row.role)) / Math.max(1, counts[row.role] || 1);
      return { ...row, metricType: isRelease ? "sorties" : "hours", ruleHours: Number(ruleHours.toFixed(2)), reportedHours: isRelease ? 0 : (savedHour ? savedHour.finalHours : Number(ruleHours.toFixed(2))), reportedSorties: isRelease ? (savedSortie?.sorties || 0) : 0, resultStatus: savedHour?.status || savedSortie?.status || row.status };
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
      flightNo: flight.flight_no || "",
      aircraftNo: flight.aircraft_no || "",
      aircraftType: flight.aircraft_type || "",
      stand: flight.stand || "",
      opportunity: flight.work_kind || flight.work_type || "其他",
      status: flight.status || "未派工",
      archivedAt: flight.archived_at || "",
      requiresChangeReason: flight.status === "已确认" || Boolean(flight.archived_at)
    },
    people: allPeople(),
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
    const current = maintenanceAssignments(ownerType, ownerId);
    if (!["已提报", "待复核", "已确认"].includes(owner.status || "未派工")) {
      const currentKeys = current.map(row => `${row.userId}\u0000${row.role}`).sort().join("|");
      const submittedKeys = (Array.isArray(raw.assignments) ? raw.assignments : []).map(row => `${String(row.userId || "").trim()}\u0000${String(row.role || "").trim()}`).sort().join("|");
      if (!archiveMode || ownerType !== "subtask") {
        if (currentKeys !== submittedKeys) throw maintenanceReviewError(`${ownerType === "flight" ? "主任务" : owner.title || "非例行"}尚未完成，不能在复核中修改人员`);
        return { ownerType, ownerId, owner, current, normalized: current.map(row => ({ person: allPeople().find(person => person.id === row.userId), role: row.role })).filter(row => row.person), changed: false };
      }
      if (!submittedKeys && !currentKeys) return { ownerType, ownerId, owner, current, normalized: [], changed: false, archiveMode: true };
      const normalized = normalizeMaintenanceAssignments(ownerType, owner, Array.isArray(raw.assignments) ? raw.assignments : []);
      const beforeKeys = current.map(row => `${row.userId}\u0000${row.role}`).sort();
      const afterKeys = normalized.map(row => `${row.person.id}\u0000${row.role}`).sort();
      return { ownerType, ownerId, owner, current, normalized, changed: beforeKeys.join("|") !== afterKeys.join("|"), archiveMode: true, resultSource: "后台归档修正" };
    }
    const normalized = normalizeMaintenanceAssignments(ownerType, owner, Array.isArray(raw.assignments) ? raw.assignments : []);
    const beforeKeys = current.map(row => `${row.userId}\u0000${row.role}`).sort();
    const afterKeys = normalized.map(row => `${row.person.id}\u0000${row.role}`).sort();
    return { ownerType, ownerId, owner, current, normalized, changed: beforeKeys.join("|") !== afterKeys.join("|"), archiveMode, resultSource: archiveMode ? "后台归档修正" : "" };
  });
}

function maintenanceArchivedNewSubtasks(flightId, input) {
  return (Array.isArray(input) ? input : []).map((raw, index) => {
    const payload = maintenanceSubtaskPayload(raw);
    if (!payload.title) throw maintenanceReviewError(`新增非例行 ${index + 1}：请填写标题`);
    if (!(payload.standardHours > 0)) throw maintenanceReviewError(`新增非例行 ${index + 1}：工时必须大于0`);
    const owner = {
      id: String(raw?.clientId || randomId("mtns")),
      flight_id: flightId,
      card_no: payload.cardNo,
      title: payload.title,
      content: payload.content,
      category: payload.category,
      standard_hours: payload.standardHours,
      priority: payload.priority,
      status: "已确认",
      remark: payload.remark
    };
    const normalized = normalizeMaintenanceAssignments("subtask", owner, Array.isArray(raw?.assignments) ? raw.assignments : []);
    if (!normalized.length) throw maintenanceReviewError(`新增非例行 ${index + 1}：请至少选择一名人员`);
    return { owner, payload, normalized };
  });
}

function maintenanceReviewConfirmBlockers(rows) {
  const blockers = [];
  for (const row of rows) {
    const label = row.ownerType === "flight" ? "主任务" : (row.owner.title || "非例行");
    if (!["已提报", "待复核", "已确认"].includes(row.owner.status || "未派工")) blockers.push(`${label}状态为${row.owner.status || "未派工"}`);
    if (!row.normalized.length) blockers.push(`${label}没有派工人员`);
    const hourRoles = new Set(row.normalized.map(item => item.role).filter(role => role !== "放行"));
    if (hourRoles.size && maintenanceBaseHours(row.ownerType, row.owner) <= 0) blockers.push(`${label}未设置有效标准工时`);
    for (const role of hourRoles) {
      if (maintenanceRatioRuleForOwner(row.ownerType, row.owner, role) === null) blockers.push(`${label}的${role}比例缺失或无效`);
    }
    const currentByKey = new Map(row.current.map(item => [`${item.userId}\u0000${item.role}`, item]));
    row.normalized.forEach(item => {
      const current = currentByKey.get(`${item.person.id}\u0000${item.role}`);
      if (["已派工", "已提报"].includes(current?.status || "")) blockers.push(`${label}的${item.person.name}/${item.role}尚未进入待复核`);
      if (current && current.status !== "已派工") {
        const resultExists = item.role === "放行"
          ? db.prepare("select 1 from maintenance_sortie_results where assignment_id=?").get(current.id)
          : db.prepare("select 1 from maintenance_hour_results where assignment_id=?").get(current.id);
        if (!resultExists) blockers.push(`${label}的${item.person.name}/${item.role}缺少${item.role === "放行" ? "架次" : "工时"}上报结果`);
      }
    });
  }
  return Array.from(new Set(blockers));
}

function reconcileMaintenanceReviewAssignments(row, manager) {
  if (!row.changed) return maintenanceAssignments(row.ownerType, row.ownerId);
  const currentRows = db.prepare("select * from maintenance_assignments where owner_type=? and owner_id=?").all(row.ownerType, row.ownerId);
  const currentByKey = new Map(currentRows.map(item => [`${item.user_id}\u0000${item.role}`, item]));
  const desiredKeys = new Set(row.normalized.map(item => `${item.person.id}\u0000${item.role}`));
  for (const item of currentRows) {
    if (desiredKeys.has(`${item.user_id}\u0000${item.role}`)) continue;
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
      userId: item.person.id,
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
  if (row.archiveMode && !row.changed) return;
  if (!row.archiveMode && mode === "save" && !["已提报", "待复核", "已确认"].includes(row.owner.status || "未派工")) return;
  const assignments = db.prepare("select * from maintenance_assignments where owner_type=? and owner_id=? order by user_name").all(row.ownerType, row.ownerId);
  const existingHours = new Map(db.prepare("select * from maintenance_hour_results where owner_type=? and owner_id=?").all(row.ownerType, row.ownerId).map(item => [item.assignment_id, item]));
  const existingSorties = new Map(db.prepare("select * from maintenance_sortie_results where owner_type=? and owner_id=?").all(row.ownerType, row.ownerId).map(item => [item.assignment_id, item]));
  const counts = assignments.reduce((result, item) => {
    result[item.role] = (result[item.role] || 0) + 1;
    return result;
  }, {});
  const baseHours = maintenanceBaseHours(row.ownerType, row.owner);
  db.prepare("delete from maintenance_hour_results where owner_type=? and owner_id=?").run(row.ownerType, row.ownerId);
  db.prepare("delete from maintenance_sortie_results where owner_type=? and owner_id=?").run(row.ownerType, row.ownerId);
  const insertHour = db.prepare(`insert into maintenance_hour_results(id,owner_type,owner_id,flight_id,assignment_id,user_id,user_name,team,role,source,hours,adjusted_hours,status,confirmed_by,confirmed_at,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertSortie = db.prepare(`insert into maintenance_sortie_results(id,owner_type,owner_id,flight_id,assignment_id,user_id,user_name,team,role,source,sorties,status,confirmed_by,confirmed_at,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const assignment of assignments) {
    const status = mode === "confirm" || row.archiveMode ? "已确认" : assignment.status;
    if (!["待复核", "已确认"].includes(status)) continue;
    const confirmed = status === "已确认";
    if (assignment.role === "放行") {
      const old = existingSorties.get(assignment.id);
      insertSortie.run(old?.id || randomId("mtnsrt"), row.ownerType, row.ownerId, assignment.flight_id || row.owner.flight_id || row.owner.id, assignment.id, assignment.user_id, assignment.user_name, assignment.team || "", "放行", "放行架次", 1, status, confirmed ? manager.id : "", confirmed ? now() : "", old?.created_at || now(), now());
    } else {
      const old = existingHours.get(assignment.id);
      const calculated = Number(((baseHours * maintenanceRatioForOwner(row.ownerType, row.owner, assignment.role)) / Math.max(1, counts[assignment.role] || 1)).toFixed(2));
      const source = row.resultSource || old?.source || (row.ownerType === "subtask" ? "非例行" : "维修机会");
      insertHour.run(old?.id || randomId("mtnh"), row.ownerType, row.ownerId, assignment.flight_id || row.owner.flight_id || row.owner.id, assignment.id, assignment.user_id, assignment.user_name, assignment.team || "", assignment.role, source, calculated, row.changed ? null : (old?.adjusted_hours ?? null), status, confirmed ? manager.id : "", confirmed ? now() : "", old?.created_at || now(), now());
    }
    if (mode === "confirm" || confirmed) {
      db.prepare("update maintenance_assignments set status=?,modified_at=?,confirmed_at=? where id=?").run(status, now(), confirmed ? now() : "", assignment.id);
    }
  }
  if (mode === "confirm" || (row.archiveMode && row.changed)) updateMaintenanceOwnerStatus(row.ownerType, row.ownerId, "已确认", manager.id);
  else updateMaintenanceOwnerStatus(row.ownerType, row.ownerId, row.owner.status || "待复核", manager.id);
}

function saveMaintenanceReview(flightId, payload, manager) {
  const mode = payload?.mode === "confirm" ? "confirm" : "save";
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceReviewError("未找到维修机会", 404);
  const editingConfirmed = flight.status === "已确认" || Boolean(flight.archived_at);
  if (editingConfirmed && !isAdmin(manager)) throw maintenanceReviewError("已确认数据仅管理员可以修改", 403);
  const reason = String(payload?.reason || "").trim();
  if (editingConfirmed && !reason) throw maintenanceReviewError("修改已确认数据必须填写修改原因");
  if (editingConfirmed && mode === "confirm") throw maintenanceReviewError("已确认数据请使用保存归档修改");
  const newSubtasks = editingConfirmed ? maintenanceArchivedNewSubtasks(flightId, payload?.newSubtasks) : [];
  if (!editingConfirmed && newSubtasks.length) throw maintenanceReviewError("只有已确认数据可以在复核页补录非例行");
  db.exec("begin immediate");
  try {
    const before = maintenanceReviewSnapshot(flightId);
    const rows = maintenanceReviewTaskPayloads(flightId, payload?.tasks, { archiveMode: editingConfirmed });
    if (mode === "confirm") {
      const blockers = maintenanceReviewConfirmBlockers(rows);
      if (blockers.length) throw maintenanceReviewError("整棵任务树暂不能确认", 409, blockers);
    }
    const stamp = now();
    for (const item of newSubtasks) {
      const id = randomId("mtns");
      item.owner.id = id;
      db.prepare(`insert into maintenance_subtasks(id,flight_id,card_no,title,content,category,standard_hours,priority,status,remark,created_by,updated_by,created_at,updated_at)
        values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, flightId, item.payload.cardNo, item.payload.title, item.payload.content, item.payload.category, item.payload.standardHours, item.payload.priority, "已确认", item.payload.remark, manager.id, manager.id, stamp, stamp);
      rows.push({
        ownerType: "subtask",
        ownerId: id,
        owner: { ...item.owner, id, status: "已确认" },
        current: [],
        normalized: item.normalized,
        changed: true,
        archiveMode: true,
        resultSource: "归档补录"
      });
    }
    rows.forEach(row => reconcileMaintenanceReviewAssignments(row, manager));
    rows.forEach(row => rebuildMaintenanceReviewResults(row, manager, mode));
    reconcileMaintenanceTreeStatus(flightId, manager.id, { preserveConfirmed: mode !== "confirm" });
    if (mode === "confirm") {
      db.prepare("update maintenance_report_batches set status='已确认',updated_at=? where flight_id=?").run(stamp, flightId);
      db.prepare("update maintenance_flights set status='已确认',archived_at=coalesce(nullif(archived_at,''),?),updated_by=?,updated_at=? where id=?").run(stamp, manager.id, stamp, flightId);
    } else if (editingConfirmed) {
      db.prepare("update maintenance_flights set status='已确认',updated_by=?,updated_at=? where id=?").run(manager.id, stamp, flightId);
    }
    const after = maintenanceReviewSnapshot(flightId);
    maintenanceLog(manager, editingConfirmed ? "confirmed_data_correct" : mode === "confirm" ? "review_confirm" : "review_save", "flight", flightId, flightId, JSON.stringify({ reason, before, after }));
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
    hourResults: db.prepare("select * from maintenance_hour_results where flight_id=? order by created_at,id").all(flightId),
    sortieResults: db.prepare("select * from maintenance_sortie_results where flight_id=? order by created_at,id").all(flightId),
    workReport: db.prepare("select * from maintenance_work_reports where flight_id=?").get(flightId) || null,
    workReportEntries: db.prepare("select * from maintenance_work_report_entries where flight_id=? order by role,user_name").all(flightId),
    reportBatches,
    reportEntries: db.prepare("select * from maintenance_report_entries where flight_id=? order by created_at,id").all(flightId),
    reportDrafts
  };
}

function deleteMaintenanceFlight(flightId, manager, reason = "") {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) return null;
  const confirmed = flight.status === "已确认" || Boolean(flight.archived_at);
  const pendingReview = !confirmed && (flight.status === "待复核" || Boolean(flight.report_finalized_at));
  const protectedDelete = confirmed || pendingReview;
  if (confirmed && !isAdmin(manager)) {
    throw maintenanceReviewError("已确认数据仅管理员可以删除", 403);
  }
  if (pendingReview && !maintenanceCanManage(manager)) {
    throw maintenanceReviewError("当前账号没有删除待复核数据的权限", 403);
  }
  if (protectedDelete && !String(reason || "").trim()) {
    throw maintenanceReviewError(`删除${confirmed ? "已确认" : "待复核"}数据必须填写删除原因`);
  }
  if (!protectedDelete) assertMaintenanceTreeDirectEditAllowed(flightId);
  db.exec("begin immediate");
  try {
    const snapshot = maintenanceFlightDeletionSnapshot(flightId);
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
  if (confirmed && !isAdmin(manager)) {
    throw maintenanceReviewError("已确认非例行仅管理员可以删除", 403);
  }
  if (pendingReview && !maintenanceCanManage(manager)) {
    throw maintenanceReviewError("当前账号没有删除待复核非例行的权限", 403);
  }
  if (protectedDelete && !deletionReason) {
    throw maintenanceReviewError(`删除${confirmed ? "已确认" : "待复核"}非例行必须填写删除原因`);
  }
  if (!protectedDelete) assertMaintenanceTreeDirectEditAllowed(flight.id);

  return maintenanceTransaction(() => {
    const before = maintenanceFlightDeletionSnapshot(flight.id);
    if (!protectedDelete) {
      invalidateMaintenanceReportCategory(flight.id, "nonroutine", manager, "删除非例行");
    }
    db.prepare("delete from maintenance_report_entries where owner_type='subtask' and owner_id=?").run(subtaskId);
    db.prepare("delete from maintenance_hour_results where owner_type='subtask' and owner_id=?").run(subtaskId);
    db.prepare("delete from maintenance_sortie_results where owner_type='subtask' and owner_id=?").run(subtaskId);
    db.prepare("delete from maintenance_feedback where owner_type='subtask' and owner_id=?").run(subtaskId);
    db.prepare("delete from maintenance_assignments where owner_type='subtask' and owner_id=?").run(subtaskId);
    db.prepare("delete from maintenance_subtasks where id=?").run(subtaskId);

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

function syncMaintenanceOwnerConfirmation(ownerType, ownerId, userId = "") {
  const owner = maintenanceOwner(ownerType, ownerId);
  if (!owner) return;
  reconcileMaintenanceTreeStatus(ownerType === "flight" ? owner.id : owner.flight_id, userId);
}

function maintenanceStats(params = {}, user = null) {
  const hourRows = db.prepare(`select h.*,f.date,f.flight_no,f.aircraft_no,f.work_type,f.card_no,f.card_name
    from maintenance_hour_results h join maintenance_flights f on f.id=h.flight_id
    order by f.date desc,h.user_name`).all();
  const sortieRows = db.prepare(`select s.*,f.date,f.flight_no,f.aircraft_no,f.work_type,f.card_no,f.card_name
    from maintenance_sortie_results s join maintenance_flights f on f.id=s.flight_id
    order by f.date desc,s.user_name`).all();
  const search = String(params.search || "").trim().toLowerCase();
  const month = String(params.month || "").trim();
  const status = String(params.status || "").trim();
  const filterRows = rows => rows.filter(row => {
    if (user && !maintenanceCanManage(user) && row.user_id !== user.id) return false;
    if (month && month !== "全部" && !String(row.date || "").startsWith(month)) return false;
    if (status && status !== "全部" && row.status !== status) return false;
    if (!search) return true;
    return [row.user_name, row.team, row.flight_no, row.aircraft_no, row.work_type, row.card_no, row.card_name].some(value => String(value || "").toLowerCase().includes(search));
  });
  const visibleHours = filterRows(hourRows);
  const visibleSorties = filterRows(sortieRows);
  const finalHours = row => row.adjusted_hours === null || row.adjusted_hours === undefined ? Number(row.hours || 0) : Number(row.adjusted_hours || 0);
  const confirmedHours = visibleHours.filter(row => row.status === "已确认");
  const confirmedSorties = visibleSorties.filter(row => row.status === "已确认");
  const people = {}, teams = {};
  const person = row => people[row.user_id] ||= { userId: row.user_id, name: row.user_name, team: row.team || "未设置", hours: 0, hourTaskCount: 0, sorties: 0, sortieTaskCount: 0 };
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
    people: Object.values(people).map(row => ({ ...row, hours: Number(row.hours.toFixed(2)), taskCount: row.hourTaskCount + row.sortieTaskCount })).sort((a, b) => b.hours - a.hours || b.sorties - a.sorties),
    teams: Object.values(teams).map(row => ({ ...row, hours: Number(row.hours.toFixed(2)), taskCount: row.hourTaskCount + row.sortieTaskCount })).sort((a, b) => b.hours - a.hours || b.sorties - a.sorties)
  };
}

const personalRoutineRoles = ["接机", "送机", "勤务", "例行检查", "例行机内", "例行L/G", "例行发动机", "例行机外", "例行电子"];
const personalWorkshopTeams = ["一组", "二组", "三组", "四组"];

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
  return db.prepare(`select h.*,f.date,f.flight_no,f.aircraft_no,f.aircraft_type,f.work_type,f.work_kind,
      st.title as subtask_title,st.category as subtask_category,st.card_no as subtask_card_no
    from maintenance_hour_results h
    join maintenance_flights f on f.id=h.flight_id
    left join maintenance_subtasks st on h.owner_type='subtask' and st.id=h.owner_id
    where h.status in ('已提报','待复核','已确认')
    order by f.date desc,h.updated_at desc,h.id`).all()
    .map(row => ({ ...row, date: normalizeMaintenanceStatsDate(row.date) }));
}

function maintenancePersonalSortieRows() {
  return db.prepare(`select s.*,f.date,f.flight_no,f.aircraft_no,f.aircraft_type,f.work_type,f.work_kind
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
  return "其他";
}

function maintenancePersonalHourDetail(row) {
  return {
    id: row.id,
    flightId: row.flight_id || "",
    date: row.date || "",
    flightNo: row.flight_no || "-",
    aircraftNo: row.aircraft_no || "-",
    aircraftType: row.aircraft_type || "-",
    opportunity: row.work_kind || row.work_type || "其他",
    taskName: row.owner_type === "subtask" ? (row.subtask_title || row.subtask_card_no || "非例行") : (row.work_kind || row.work_type || "维修机会"),
    role: row.role || "-",
    category: maintenancePersonalCategory(row),
    type: row.owner_type === "subtask" ? "nonroutine" : "routine",
    hours: Number(maintenanceFinalHours(row).toFixed(2)),
    status: row.status
  };
}

function maintenancePersonalComparison(members, totals, userId) {
  const ownHours = Number(totals.get(userId) || 0);
  const normalizedUserId = String(userId || "");
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
  const allResultHours = maintenancePersonalHourRows();
  const allResultSorties = maintenancePersonalSortieRows();
  const allHours = allResultHours.filter(row => row.status === "已确认");
  const ownConfirmedHours = allHours.filter(row => row.user_id === user.id);
  const ownPendingHours = allResultHours.filter(row => row.user_id === user.id && row.status !== "已确认");
  const ownConfirmedSorties = allResultSorties.filter(row => row.user_id === user.id && row.status === "已确认");
  const ownPendingSorties = allResultSorties.filter(row => row.user_id === user.id && row.status !== "已确认");
  const selectedMonthHours = ownConfirmedHours.filter(row => String(row.date || "").startsWith(bounds.month));
  const selectedMonthPendingHours = ownPendingHours.filter(row => String(row.date || "").startsWith(bounds.month));
  const todayHours = ownConfirmedHours.filter(row => row.date === today);
  const todayPendingHours = ownPendingHours.filter(row => row.date === today);
  const weekHours = ownConfirmedHours.filter(row => row.date >= weekStart && row.date <= weekEnd);
  const weekPendingHours = ownPendingHours.filter(row => row.date >= weekStart && row.date <= weekEnd);
  const monthSorties = ownConfirmedSorties.filter(row => String(row.date || "").startsWith(bounds.month));
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

  const activeMembers = db.prepare("select id,name,team from users where status is null or status<>'disabled' order by name").all();
  const monthTotals = new Map();
  for (const row of allHours) {
    if (!String(row.date || "").startsWith(bounds.month)) continue;
    monthTotals.set(row.user_id, (monthTotals.get(row.user_id) || 0) + maintenanceFinalHours(row));
  }
  const teamMembers = activeMembers.filter(member => member.team === user.team);
  const teamComparison = maintenancePersonalComparison(teamMembers, monthTotals, user.id);
  const teamTotal = teamMembers.reduce((sum, member) => sum + Number(monthTotals.get(member.id) || 0), 0);
  teamComparison.available = !!teamMembers.some(member => member.id === user.id);
  teamComparison.team = user.team || "未设置";
  teamComparison.contributionPercent = teamTotal ? Number((teamComparison.ownHours / teamTotal * 100).toFixed(1)) : 0;

  const workshopMembers = activeMembers.filter(member => personalWorkshopTeams.includes(member.team));
  const workshopComparison = maintenancePersonalComparison(workshopMembers, monthTotals, user.id);
  workshopComparison.available = personalWorkshopTeams.includes(user.team) && workshopMembers.some(member => member.id === user.id);

  const teamRanking = { available: personalWorkshopTeams.includes(user.team), team: user.team || "未设置", teamCount: personalWorkshopTeams.length };
  if (teamRanking.available) {
    const teamTotals = personalWorkshopTeams.map(team => ({
      team,
      hours: Number(activeMembers.filter(member => member.team === team).reduce((sum, member) => sum + Number(monthTotals.get(member.id) || 0), 0).toFixed(2))
    }));
    const ownTeam = teamTotals.find(item => item.team === user.team);
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
    workshopComparison,
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
    const rows = maintenancePersonalSortieRows().filter(row => row.user_id === user.id && matchesStatus(row) && String(row.date || "").startsWith(bounds.month));
    return {
      title: `${bounds.month} ${resultStatus === "pending" ? "待复核" : ""}放行架次明细`,
      unit: "架次",
      rows: rows.map(row => ({
        id: row.id,
        date: row.date || "",
        flightNo: row.flight_no || "-",
        aircraftNo: row.aircraft_no || "-",
        aircraftType: row.aircraft_type || "-",
        opportunity: row.work_kind || row.work_type || "其他",
        role: "放行",
        sorties: 1,
        status: row.status
      }))
    };
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(params.date || "")) ? String(params.date) : "";
  const period = params.period === "month" ? "month" : "day";
  const category = String(params.category || "").trim();
  let rows = maintenancePersonalHourRows().filter(row => row.user_id === user.id && matchesStatus(row));
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
  db.prepare(`insert into maintenance_flights(id,date,flight_no,aircraft_no,aircraft_type,stand,planned_arrival,planned_departure,work_type,card_no,card_name,work_kind,standard_hours,status,remark,source,created_by,updated_by,created_at,updated_at)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, payload.date, payload.flightNo, payload.aircraftNo, payload.aircraftType, payload.stand, payload.plannedArrival, payload.plannedDeparture, payload.workType, payload.cardNo, payload.cardName, payload.workKind, payload.standardHours, payload.status, payload.remark, payload.source, user.id, user.id, now(), now());
  maintenanceLog(user, "create_flight", "flight", id, id, payload.flightNo || "");
  return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(id));
}

function updateMaintenanceFlight(id, payload, user) {
  const existing = db.prepare("select * from maintenance_flights where id=?").get(id);
  if (!existing) return null;
  db.prepare(`update maintenance_flights set date=?,flight_no=?,aircraft_no=?,aircraft_type=?,stand=?,planned_arrival=?,planned_departure=?,work_type=?,card_no=?,card_name=?,work_kind=?,standard_hours=?,status=?,remark=?,updated_by=?,updated_at=? where id=?`)
    .run(payload.date, payload.flightNo, payload.aircraftNo, payload.aircraftType, payload.stand, payload.plannedArrival, payload.plannedDeparture, payload.workType, payload.cardNo, payload.cardName, payload.workKind, payload.standardHours, existing.status, payload.remark, user.id, now(), id);
  maintenanceLog(user, "update_flight", "flight", id, id, payload.flightNo || "");
  reconcileMaintenanceTreeStatus(id, user.id);
  return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(id));
}

function insertMaintenanceSubtask(flightId, payload, user) {
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

function invalidateMaintenanceReportCategory(flightId, reportType, user, reason = "") {
  const batch = db.prepare("select * from maintenance_report_batches where flight_id=? and report_type=?").get(flightId, reportType);
  if (!batch || !["已提报", "预填"].includes(batch.status)) return false;
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

function setMaintenanceAssignments(ownerType, ownerId, assignments, user) {
  return maintenanceTransaction(() => {
    const owner = maintenanceOwner(ownerType, ownerId);
    if (!owner) return null;
    const flightId = ownerType === "flight" ? owner.id : owner.flight_id;
    const normalizedAssignments = normalizeMaintenanceAssignments(ownerType, owner, assignments);
    const allowedRoles = maintenanceRolesForOwner(ownerType, owner);
    const submitted = reportType => {
      const row = db.prepare("select status from maintenance_report_batches where flight_id=? and report_type=?").get(flightId, reportType);
      return ["已提报", "待复核", "已确认"].includes(row?.status || "");
    };
    const lockedRoles = new Set();
    if (ownerType === "subtask") {
      if (submitted("nonroutine")) allowedRoles.forEach(role => lockedRoles.add(role));
    } else {
      if (submitted("release")) lockedRoles.add("放行");
      if (submitted("routine")) allowedRoles.filter(role => role !== "放行").forEach(role => lockedRoles.add(role));
    }
    if (lockedRoles.size === allowedRoles.length) throw maintenanceReviewError("该任务的派工类别均已提报，请在复核阶段调整", 409);

    const currentRows = db.prepare("select * from maintenance_assignments where owner_type=? and owner_id=?").all(ownerType, ownerId);
    const keyOf = item => `${item.role}\u0000${item.user_id || item.person?.id || ""}`;
    const currentLocked = currentRows.filter(row => lockedRoles.has(row.role)).map(keyOf).sort();
    const incomingLocked = normalizedAssignments.filter(item => lockedRoles.has(item.role)).map(keyOf).sort();
    if (currentLocked.length !== incomingLocked.length || currentLocked.some((key, index) => key !== incomingLocked[index])) {
      throw maintenanceReviewError("已提报类别的人员已锁定，只能修改尚未提报的类别", 409);
    }

    const editableRows = currentRows.filter(row => !lockedRoles.has(row.role));
    for (const row of editableRows) {
      db.prepare("delete from maintenance_feedback where assignment_id=?").run(row.id);
      db.prepare("delete from maintenance_hour_results where assignment_id=?").run(row.id);
      db.prepare("delete from maintenance_sortie_results where assignment_id=?").run(row.id);
      db.prepare("delete from maintenance_assignments where id=?").run(row.id);
    }

    const stamp = now();
    const editableAssignments = normalizedAssignments.filter(item => !lockedRoles.has(item.role));
    for (const { person, role } of editableAssignments) {
      insertMaintenanceAssignment({
        ownerType,
        ownerId,
        flightId,
        userId: person.id,
        userName: person.name,
        team: person.team || "未设置",
        role,
        status: "已派工",
        assignedBy: user.id,
        assignedAt: stamp
      });
    }
    reconcileMaintenanceTreeStatus(flightId, user.id, { preserveConfirmed: false });
    maintenanceLog(user, "dispatch", ownerType, ownerId, flightId, JSON.stringify({
      editableRoles: allowedRoles.filter(role => !lockedRoles.has(role)),
      lockedRoles: [...lockedRoles],
      assignments: editableAssignments.length
    }));
    return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId));
  });
}

function normalizeMaintenanceReportEntries(rawEntries, allowedRoles, { ownerType = "flight", ownerId = "", standardHours = 0, source = "报工补录" } = {}) {
  const people = new Map(allPeople().map(person => [person.id, person]));
  const allowed = new Set(allowedRoles);
  const seen = new Set();
  const entries = [];
  for (const item of Array.isArray(rawEntries) ? rawEntries : []) {
    const role = String(item.role || "").trim();
    const userId = String(item.userId || item.id || "").trim();
    if (!allowed.has(role)) throw maintenanceDispatchError(`当前任务不支持上报“${role || "未设置"}”`);
    const person = people.get(userId);
    if (!person) throw maintenanceDispatchError("报工人员不存在或已停用");
    const key = `${ownerType}\u0000${ownerId}\u0000${role}\u0000${userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ ownerType, ownerId, role, person, standardHours, source });
  }
  return entries;
}

function replaceMaintenanceAssignmentsFromEntries(ownerType, ownerId, flightId, entries, user, status, feedback = "", preserveRoles = []) {
  const current = db.prepare("select * from maintenance_assignments where owner_type=? and owner_id=?").all(ownerType, ownerId);
  const currentByKey = new Map(current.map(row => [`${row.role}\u0000${row.user_id}`, row]));
  const desired = new Set(entries.map(item => `${item.role}\u0000${item.person.id}`));
  for (const row of current) {
    if (preserveRoles.includes(row.role)) continue;
    if (desired.has(`${row.role}\u0000${row.user_id}`)) continue;
    db.prepare("delete from maintenance_feedback where assignment_id=?").run(row.id);
    db.prepare("delete from maintenance_hour_results where assignment_id=?").run(row.id);
    db.prepare("delete from maintenance_sortie_results where assignment_id=?").run(row.id);
    db.prepare("delete from maintenance_assignments where id=?").run(row.id);
  }
  const stamp = now();
  for (const item of entries) {
    const row = currentByKey.get(`${item.role}\u0000${item.person.id}`);
    if (row) {
      db.prepare("update maintenance_assignments set user_name=?,team=?,status=?,feedback=?,completed_at=?,submitted_at=?,modified_at=?,confirmed_at='' where id=?")
        .run(item.person.name, item.person.team || "未设置", status, feedback, stamp, stamp, stamp, row.id);
      continue;
    }
    insertMaintenanceAssignment({
      ownerType,
      ownerId,
      flightId,
      userId: item.person.id,
      userName: item.person.name,
      team: item.person.team || "未设置",
      role: item.role,
      status,
      feedback,
      assignedBy: user.id,
      assignedAt: stamp,
      receivedAt: stamp,
      startedAt: stamp,
      completedAt: stamp,
      submittedAt: stamp,
      modifiedAt: stamp
    });
  }
  updateMaintenanceOwnerStatus(ownerType, ownerId, status === "已确认" ? "已确认" : status === "待复核" ? "待复核" : "已提报", user.id);
  return db.prepare("select * from maintenance_assignments where owner_type=? and owner_id=? order by role,user_name").all(ownerType, ownerId);
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
        const person = allPeople().find(item => item.id === entry.userId);
        return {
          ownerType: "flight",
          ownerId: flightId,
          role: entry.role,
          userId: entry.userId,
          userName: person?.name || "",
          team: person?.team || "未设置"
        };
      })
      : routineAssignments.map(row => ({ ownerType: "flight", ownerId: flightId, role: row.role, userId: row.userId, userName: row.userName, team: row.team }));
  const submittedRoutineRoles = new Set((progress.batches.routine?.entries || []).map(entry => entry.role));
  const roleStatuses = Object.fromEntries([
    ["放行", progress.batches.release ? "已提报" : "未提报"],
    ...routineRoles.map(role => [role, submittedRoutineRoles.has(role) ? "已提报" : "未提报"])
  ]);
  return {
    flight: { id: flight.id, flightNo: flight.flightNo, aircraftNo: flight.aircraftNo, aircraftType: flight.aircraftType, opportunity: flight.workKind, status: flight.status },
    people: allPeople(),
    progress,
    routine: {
      roles: routineRoles,
      entries: routineEntries,
      feedback: progress.batches.routine?.feedback ?? routineDraft?.feedback ?? "",
      draft: routineDraft,
      roleStatuses,
      locked: ["已提报", "待复核", "已确认"].includes(progress.batches.routine?.status || "")
    },
    nonroutine: {
      items: flight.subtasks.map(item => ({
        id: item.id,
        chapter: item.cardNo,
        title: item.title,
        category: maintenanceNonroutineCategories.includes(item.category) ? item.category : "其他",
        standardHours: item.standardHours,
        reportExplanation: item.content || "",
        entries: (progress.batches.nonroutine?.entries || []).filter(entry => entry.ownerType === "subtask" && entry.ownerId === item.id).length
          ? progress.batches.nonroutine.entries.filter(entry => entry.ownerType === "subtask" && entry.ownerId === item.id)
          : item.assignments.map(row => ({ ownerType: "subtask", ownerId: item.id, role: row.role, userId: row.userId, userName: row.userName, team: row.team }))
      })),
      feedback: progress.batches.nonroutine?.feedback || "",
      locked: ["已提报", "待复核", "已确认"].includes(progress.batches.nonroutine?.status || ""),
      draft: maintenanceReportDraft(flightId, "nonroutine"),
      revision: flight.updatedAt || ""
    },
    release,
    releaseEditable: !!release && release.userId === user.id && !progress.batches.release,
    canSubmit: maintenanceCanSubmitReport(user, flightId),
    canRelease: !!release && release.userId === user.id && !progress.batches.release,
    canFinalize: !!progress.batches.release && progress.batches.release.submittedBy === user.id && progress.ready && !flight.reportFinalizedAt,
    isManager: maintenanceCanManage(user)
  };
}

function submitMaintenanceRelease(flightId, payload, user) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceDispatchError("未找到维修机会");
  const release = db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=? and role='放行'").get(flightId);
  if (!release || release.user_id !== user.id) throw maintenanceDispatchError("只有当前维修机会的放行人员可以上报架次");
  if (release.status !== "已派工") throw maintenanceReviewError("放行已经提报，请刷新页面", 409);
  return maintenanceTransaction(() => {
    const batch = upsertMaintenanceReportBatch(flightId, "release", {
      status: "已提报", feedback: "", user, expectedVersion: payload?.version ?? null,
      entries: [{ ownerType: "flight", ownerId: flightId, role: "放行", person: allPeople().find(row => row.id === release.user_id) || { id: release.user_id, name: release.user_name, team: release.team }, standardHours: 0, source: "放行架次" }]
    });
    const stamp = now();
    db.prepare("update maintenance_assignments set status='已提报',feedback='',completed_at=?,submitted_at=?,modified_at=? where id=?").run(stamp, stamp, stamp, release.id);
    regenerateMaintenanceSorties("flight", flightId, "已提报");
    reconcileMaintenanceTreeStatus(flightId, user.id, { preserveConfirmed: false });
    maintenanceLog(user, "release_report_submit", "flight", flightId, flightId, JSON.stringify({ batchId: batch.id, assignmentId: release.id, sorties: 1 }));
    return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId));
  });
}

function submitMaintenanceRoutine(flightId, payload, user) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceDispatchError("未找到维修机会");
  if (!maintenanceCanSubmitReport(user, flightId)) throw maintenanceDispatchError("只有该维修机会的派工人员可以提交例行报工");
  return maintenanceTransaction(() => {
    assertMaintenanceReportDraftVersion(flightId, "routine", payload?.draftVersion);
    applyMaintenanceReleaseSelection(flightId, payload?.releaseUserId, user);
    const roles = maintenanceRolesForOpportunity(flight.work_kind || flight.work_type).filter(role => role !== "放行");
    const entries = normalizeMaintenanceReportEntries(payload?.entries, roles, { ownerType: "flight", ownerId: flightId, standardHours: maintenanceBaseHours("flight", flight), source: "例行报工" });
    const submittedRoles = [...new Set(entries.map(item => item.role))];
    if (entries.length && !(maintenanceBaseHours("flight", flight) > 0)) throw maintenanceDispatchError("当前维修机会缺少有效标准工时规则");
    for (const role of submittedRoles) if (maintenanceRoutineRoleRatioRule(flight.work_kind || flight.work_type || "其他", role) === null) throw maintenanceDispatchError(`${role}缺少当前维修机会的有效工时比例`);
    const before = maintenanceReviewSnapshot(flightId);
    const batch = upsertMaintenanceReportBatch(flightId, "routine", { status: "已提报", feedback: String(payload?.feedback || "").trim(), user, entries, expectedVersion: payload?.version ?? null });
    replaceMaintenanceAssignmentsFromEntries("flight", flightId, flightId, entries, user, "已提报", batch.feedback, ["放行"]);
    regenerateMaintenanceHours("flight", flightId, "已提报");
    db.prepare("delete from maintenance_report_drafts where flight_id=? and report_type='routine'").run(flightId);
    reconcileMaintenanceTreeStatus(flightId, user.id, { preserveConfirmed: false });
    maintenanceLog(user, "routine_report_submit", "flight", flightId, flightId, JSON.stringify({ before, after: maintenanceReviewSnapshot(flightId), batchId: batch.id }));
    return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId));
  });
}

function normalizeNonroutineReportItems(flightId, rawItems, user, {
  createTemporary = false,
  allowEmptyEntries = false,
  allowOmitted = false,
  validateComplete = true
} = {}) {
  const existing = new Map(db.prepare("select * from maintenance_subtasks where flight_id=? order by created_at").all(flightId).map(row => [row.id, row]));
  const seen = new Set();
  const items = [];
  for (const [index, raw] of (Array.isArray(rawItems) ? rawItems : []).entries()) {
    const itemLabel = `单项${index + 1}`;
    let item = existing.get(String(raw.id || ""));
    const chapter = String(raw.chapter ?? raw.cardNo ?? item?.card_no ?? "").trim().slice(0, 200);
    const title = String(raw.title ?? item?.title ?? "").trim().slice(0, 500);
    const rawCategory = String(raw.category ?? item?.category ?? "");
    const categoryValid = maintenanceNonroutineCategories.includes(rawCategory);
    const category = categoryValid ? rawCategory : "其他";
    const reportExplanation = String(raw.reportExplanation ?? raw.content ?? item?.content ?? "").trim().slice(0, 4000);
    const rawStandardHours = raw.standardHours ?? item?.standard_hours ?? 0;
    const parsedStandardHours = Number(rawStandardHours);
    const standardHours = Number.isFinite(parsedStandardHours) ? parsedStandardHours : 0;
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
    if (validateComplete && !(standardHours > 0)) throw maintenanceDispatchError(`${itemLabel}缺少有效工时`);
    if (validateComplete && Math.abs(standardHours * 10 - Math.round(standardHours * 10)) > 1e-8) {
      throw maintenanceDispatchError(`${itemLabel}工时必须以0.1小时为单位`);
    }
    const entries = normalizeMaintenanceReportEntries(raw.entries, maintenanceSubtaskRoles, { ownerType: "subtask", ownerId: item.id, standardHours, source: raw.temporary ? "临时非例行报工" : "非例行报工" });
    if (validateComplete && !entries.length && !allowEmptyEntries) throw maintenanceDispatchError(`${itemLabel}尚未选择实际参与人员`);
    if (validateComplete) {
      for (const role of new Set(entries.map(entry => entry.role))) {
        if (maintenanceRoleRatioRule(role) === null) throw maintenanceDispatchError(`${itemLabel}的${role}缺少有效工时比例`);
      }
    }
    items.push({ row: item, chapter, title, category, standardHours, reportExplanation, entries });
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
  return flight;
}

function assertMaintenanceSubtaskCanBeRemovedDuringReport(subtask) {
  if (["已提报", "待复核", "已确认"].includes(subtask.status)) {
    throw maintenanceReviewError(`非例行“${subtask.title}”已经提报，不能删除`, 409);
  }
  const locked = db.prepare("select 1 from maintenance_assignments where owner_type='subtask' and owner_id=? and status in ('已提报','待复核','已确认') limit 1").get(subtask.id);
  if (locked) throw maintenanceReviewError(`非例行“${subtask.title}”已经提报，不能删除`, 409);
}

function syncMaintenanceNonroutineAssignments(flightId, item, user) {
  const currentRows = db.prepare("select * from maintenance_assignments where owner_type='subtask' and owner_id=? order by assigned_at,id").all(item.row.id);
  if (currentRows.some(row => ["已提报", "待复核", "已确认"].includes(row.status))) {
    throw maintenanceReviewError(`非例行“${item.title}”已经提报，不能调整人员`, 409);
  }
  const desired = new Map(item.entries.map(entry => [`${entry.role}\u0000${entry.person.id}`, entry]));
  const current = new Map(currentRows.map(row => [`${row.role}\u0000${row.user_id}`, row]));
  for (const row of currentRows) {
    if (desired.has(`${row.role}\u0000${row.user_id}`)) continue;
    db.prepare("delete from maintenance_feedback where assignment_id=?").run(row.id);
    db.prepare("delete from maintenance_hour_results where assignment_id=?").run(row.id);
    db.prepare("delete from maintenance_sortie_results where assignment_id=?").run(row.id);
    db.prepare("delete from maintenance_assignments where id=?").run(row.id);
  }
  const stamp = now();
  for (const entry of item.entries) {
    const row = current.get(`${entry.role}\u0000${entry.person.id}`);
    if (row) {
      if (row.user_name !== entry.person.name || (row.team || "未设置") !== (entry.person.team || "未设置")) {
        db.prepare("update maintenance_assignments set user_name=?,team=?,modified_at=? where id=?")
          .run(entry.person.name, entry.person.team || "未设置", stamp, row.id);
      }
      continue;
    }
    insertMaintenanceAssignment({
      ownerType: "subtask",
      ownerId: item.row.id,
      flightId,
      userId: entry.person.id,
      userName: entry.person.name,
      team: entry.person.team || "未设置",
      role: entry.role,
      status: "已派工",
      assignedBy: user.id,
      assignedAt: stamp
    });
  }
}

function applyMaintenanceNonroutineChanges(flightId, payload, user, { submit = false } = {}) {
  const normalized = normalizeNonroutineReportItems(flightId, payload?.items, user, {
    createTemporary: true,
    allowEmptyEntries: !submit,
    allowOmitted: true,
    validateComplete: submit
  });
  for (const subtask of normalized.omitted) {
    assertMaintenanceSubtaskCanBeRemovedDuringReport(subtask);
    deleteMaintenanceSubtaskForReport(subtask, user);
  }
  for (const item of normalized.items) {
    db.prepare("update maintenance_subtasks set card_no=?,title=?,content=?,category=?,standard_hours=?,status=?,updated_by=?,updated_at=? where id=?")
      .run(item.chapter, item.title, item.reportExplanation, item.category, item.standardHours, submit ? "已提报" : (item.entries.length ? "已派工" : "未派工"), user.id, now(), item.row.id);
    if (submit) {
      replaceMaintenanceAssignmentsFromEntries("subtask", item.row.id, flightId, item.entries, user, "已提报", item.reportExplanation);
      regenerateMaintenanceHours("subtask", item.row.id, "已提报");
    } else {
      syncMaintenanceNonroutineAssignments(flightId, item, user);
    }
  }
  return normalized.items;
}

function saveMaintenanceNonroutine(flightId, payload, user) {
  const flight = assertMaintenanceNonroutineEditable(flightId, payload, user);
  return maintenanceTransaction(() => {
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
  });
}

function submitMaintenanceNonroutine(flightId, payload, user) {
  assertMaintenanceNonroutineEditable(flightId, payload, user);
  return maintenanceTransaction(() => {
    assertMaintenanceReportDraftVersion(flightId, "nonroutine", payload?.draftVersion);
    const before = maintenanceReviewSnapshot(flightId);
    const items = applyMaintenanceNonroutineChanges(flightId, payload, user, { submit: true });
    if (!items.length) throw maintenanceDispatchError("当前维修机会没有需要提交的非例行");
    const entries = items.flatMap(item => item.entries);
    const batch = upsertMaintenanceReportBatch(flightId, "nonroutine", { status: "已提报", feedback: "", user, entries, expectedVersion: payload?.version ?? null });
    db.prepare("delete from maintenance_report_drafts where flight_id=? and report_type='nonroutine'").run(flightId);
    reconcileMaintenanceTreeStatus(flightId, user.id, { preserveConfirmed: false });
    maintenanceLog(user, "nonroutine_report_submit", "flight", flightId, flightId, JSON.stringify({ before, after: maintenanceReviewSnapshot(flightId), batchId: batch.id }));
    return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId));
  });
}

function deleteMaintenanceSubtaskForReport(subtask, user) {
  db.prepare("delete from maintenance_hour_results where owner_type='subtask' and owner_id=?").run(subtask.id);
  db.prepare("delete from maintenance_sortie_results where owner_type='subtask' and owner_id=?").run(subtask.id);
  db.prepare("delete from maintenance_feedback where owner_type='subtask' and owner_id=?").run(subtask.id);
  db.prepare("delete from maintenance_assignments where owner_type='subtask' and owner_id=?").run(subtask.id);
  db.prepare("delete from maintenance_subtasks where id=?").run(subtask.id);
  maintenanceLog(user, "delete_subtask_during_report_confirmation", "subtask", subtask.id, subtask.flight_id, subtask.title || "");
}

function saveMaintenanceReportConfirmation(flightId, payload, user, { finalize = false } = {}) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) throw maintenanceDispatchError("未找到维修机会");
  const progress = maintenanceReportProgress(flightId);
  const releaseBatch = progress?.batches.release;
  if (!releaseBatch || releaseBatch.submittedBy !== user.id) throw maintenanceDispatchError("只有原放行报工人可以完成报工确认");
  if (progress.hasNonroutineDraft) throw maintenanceReviewError("存在未提交的非例行草稿，请先提交或删除草稿", 409);
  if (!progress.ready) {
    const missing = progress.segments.filter(item => !["已提报", "无需报工"].includes(item.status)).map(item => item.label);
    throw maintenanceDispatchError(`以下报工尚未完成：${missing.join("、")}`);
  }
  if (flight.report_finalized_at) throw maintenanceReviewError("该维修机会已经报工确认", 409);
  return maintenanceTransaction(() => {
    const before = { review: maintenanceReviewSnapshot(flightId), progress: maintenanceReportProgress(flightId) };
    const currentProgress = maintenanceReportProgress(flightId);
    const deletedIds = [...new Set((Array.isArray(payload?.deletedSubtaskIds) ? payload.deletedSubtaskIds : []).map(value => String(value || "").trim()).filter(Boolean))];
    for (const id of deletedIds) {
      const subtask = db.prepare("select * from maintenance_subtasks where id=? and flight_id=?").get(id, flightId);
      if (!subtask) throw maintenanceDispatchError("待删除的非例行项目已变化，请刷新后重试");
      deleteMaintenanceSubtaskForReport(subtask, user);
    }

    const routineBatch = currentProgress.batches.routine;
    if (currentProgress.hasRoutine) {
      if (!routineBatch) throw maintenanceDispatchError("例行报工数据已变化，请刷新后重试");
      const roles = maintenanceRolesForOpportunity(flight.work_kind || flight.work_type).filter(role => role !== "放行");
      const routineEntries = normalizeMaintenanceReportEntries(payload?.routineEntries, roles, { ownerType: "flight", ownerId: flightId, standardHours: maintenanceBaseHours("flight", flight), source: "放行人报工确认" });
      const routineFeedback = payload && Object.prototype.hasOwnProperty.call(payload, "feedback")
        ? String(payload.feedback ?? "").trim()
        : String(routineBatch.feedback || "");
      const currentRoutineKeys = new Set(db.prepare("select role,user_id from maintenance_assignments where owner_type='flight' and owner_id=? and role<>'放行'")
        .all(flightId).map(row => `${row.role}\u0000${row.user_id}`));
      const nextRoutineKeys = new Set(routineEntries.map(item => `${item.role}\u0000${item.person.id}`));
      const routinePeopleChanged = currentRoutineKeys.size !== nextRoutineKeys.size || [...nextRoutineKeys].some(key => !currentRoutineKeys.has(key));
      replaceMaintenanceAssignmentsFromEntries("flight", flightId, flightId, routineEntries, user, "已提报", routineFeedback, ["放行"]);
      replaceMaintenanceReportEntries(routineBatch.id, flightId, routineEntries, { feedback: routineFeedback });
      if (routinePeopleChanged) regenerateMaintenanceHours("flight", flightId, "已提报");
    }

    const nonroutineBatch = currentProgress.batches.nonroutine;
    const remainingNonroutine = db.prepare("select count(*) as total from maintenance_subtasks where flight_id=?").get(flightId)?.total || 0;
    if (remainingNonroutine > 0) {
      if (!nonroutineBatch) throw maintenanceDispatchError("非例行报工数据已变化，请刷新后重试");
      const { items } = normalizeNonroutineReportItems(flightId, payload?.nonroutineItems, user, { createTemporary: true });
      const nonroutineEntries = items.flatMap(item => item.entries);
      for (const item of items) {
        db.prepare("update maintenance_subtasks set card_no=?,title=?,content=?,category=?,standard_hours=?,status='已提报',updated_by=?,updated_at=? where id=?")
          .run(item.chapter, item.title, item.reportExplanation, item.category, item.standardHours, user.id, now(), item.row.id);
        replaceMaintenanceAssignmentsFromEntries("subtask", item.row.id, flightId, item.entries, user, "已提报", item.reportExplanation);
        regenerateMaintenanceHours("subtask", item.row.id, "已提报");
      }
      replaceMaintenanceReportEntries(nonroutineBatch.id, flightId, nonroutineEntries);
    } else if (nonroutineBatch) {
      db.prepare("delete from maintenance_report_entries where batch_id=?").run(nonroutineBatch.id);
      db.prepare("delete from maintenance_report_batches where id=?").run(nonroutineBatch.id);
    }

    const lockedReleaseUserId = String(releaseBatch.entries.find(item => item.role === "放行")?.userId || releaseBatch.submittedBy || "").trim();
    const requestedReleaseUserId = String(payload?.releaseUserId || lockedReleaseUserId).trim();
    if (requestedReleaseUserId !== lockedReleaseUserId) throw maintenanceReviewError("放行架次已提报，放行人员不能修改", 409);
    const releaseUserId = lockedReleaseUserId;
    const releasePerson = allPeople().find(row => row.id === releaseUserId);
    if (!releasePerson) throw maintenanceDispatchError("最终放行人员不存在或已停用");
    const releaseAssignment = db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=? and role='放行'").get(flightId);
    if (!releaseAssignment) throw maintenanceDispatchError("未找到放行派工记录");
    const targetStatus = finalize ? "待复核" : "已提报";
    db.prepare("update maintenance_assignments set user_id=?,user_name=?,team=?,status=?,modified_at=? where id=?").run(releasePerson.id, releasePerson.name, releasePerson.team || "未设置", targetStatus, now(), releaseAssignment.id);
    db.prepare("update maintenance_sortie_results set user_id=?,user_name=?,team=?,sorties=1,status=?,updated_at=? where assignment_id=?").run(releasePerson.id, releasePerson.name, releasePerson.team || "未设置", targetStatus, now(), releaseAssignment.id);
    db.prepare("update maintenance_report_entries set user_id=?,user_name=?,team=?,updated_at=? where batch_id=? and role='放行'").run(releasePerson.id, releasePerson.name, releasePerson.team || "未设置", now(), releaseBatch.id);

    if (finalize) {
      const stamp = now();
      db.prepare("update maintenance_assignments set status='待复核',modified_at=? where flight_id=? and status='已提报'").run(stamp, flightId);
      db.prepare("update maintenance_hour_results set status='待复核',updated_at=? where flight_id=? and status='已提报'").run(stamp, flightId);
      db.prepare("update maintenance_sortie_results set status='待复核',sorties=1,updated_at=? where flight_id=? and status='已提报'").run(stamp, flightId);
      db.prepare("update maintenance_report_batches set status='待复核',updated_at=? where flight_id=? and status='已提报'").run(stamp, flightId);
      db.prepare("update maintenance_subtasks set status='待复核',updated_by=?,updated_at=? where flight_id=? and status='已提报'").run(user.id, stamp, flightId);
      db.prepare("delete from maintenance_report_drafts where flight_id=?").run(flightId);
      db.prepare("update maintenance_flights set report_finalized_by=?,report_finalized_by_name=?,report_finalized_at=?,status='待复核',updated_by=?,updated_at=? where id=?")
        .run(user.id, user.name, stamp, user.id, stamp, flightId);
    } else {
      reconcileMaintenanceTreeStatus(flightId, user.id, { preserveConfirmed: false });
    }
    const after = { review: maintenanceReviewSnapshot(flightId), progress: maintenanceReportProgress(flightId), releaseOwner: releasePerson.id };
    maintenanceLog(user, finalize ? "report_finalize" : "report_confirmation_save", "flight", flightId, flightId, JSON.stringify({ before, after, originalReleaseReporter: releaseBatch.submittedBy, releaseOwner: releasePerson.id, deletedSubtaskIds: deletedIds }));
    return publicMaintenanceFlight(db.prepare("select * from maintenance_flights where id=?").get(flightId));
  });
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
    const userId = String(item.userId || item.id || "").trim();
    if (!allowedRoles.has(role)) throw maintenanceDispatchError(`当前维修机会不支持上报“${role || "未设置"}”`);
    const person = people.get(userId);
    if (!person) throw maintenanceDispatchError("报工人员不存在或已停用");
    const key = `${role}\u0000${userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ role, person });
  }
  const reportRoles = [...allowedRoles];
  return { flight, assignments, dispatchedRoles: reportRoles, entries, missingRoles: [], feedback: String(payload.feedback || "").trim() };
}

function canUseMaintenanceWorkReport(user, assignments) {
  return assignments.some(row => row.user_id === user.id);
}

function maintenanceWorkReportView(flightId, user) {
  const flight = db.prepare("select * from maintenance_flights where id=?").get(flightId);
  if (!flight) return null;
  const assignments = db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=? order by assigned_at,user_name").all(flightId);
  if (!canUseMaintenanceWorkReport(user, assignments) && !maintenanceCanManage(user)) throw maintenanceDispatchError("只能查看派给自己的维修机会报工");
  const report = maintenanceWorkReport(flightId);
  const defaultEntries = assignments.filter(row => row.role !== "放行").map(row => ({ role: row.role, userId: row.user_id, userName: row.user_name, team: row.team || "未设置" }));
  const roles = maintenanceRolesForOpportunity(flight.work_kind || flight.work_type || "其他").filter(role => role !== "放行");
  const release = assignments.find(row => row.role === "放行") || null;
  return {
    flight: {
      id: flight.id,
      flightNo: flight.flight_no || "",
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
    canFinalize: !!release && release.user_id === user.id,
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
    if (release.user_id !== user.id) throw maintenanceDispatchError("只有当前维修机会的放行人员可以报工确认");
    if (!["已提报", "待复核"].includes(release.status) || normalized.flight.status !== "已提报") throw maintenanceDispatchError("请先完成放行，再进行报工确认");
    const baseHours = maintenanceBaseHours("flight", normalized.flight);
    if (normalized.entries.length && !(baseHours > 0)) throw maintenanceDispatchError("当前维修机会缺少有效的标准工时规则");
    const submittedRoles = [...new Set(normalized.entries.map(item => item.role))];
    const missingRules = submittedRoles.filter(role => maintenanceRoutineRoleRatioRule(normalized.flight.work_kind || normalized.flight.work_type || "其他", role) === null);
    if (missingRules.length) throw maintenanceDispatchError(`以下工种缺少有效工时比例：${missingRules.join("、")}`);
    const subtaskBlockers = maintenanceSubtaskCompletionBlockers(flightId);
    if (subtaskBlockers.length) throw maintenanceDispatchError(`以下非例行尚未完成：${subtaskBlockers.join("；")}`);
  }

  return maintenanceTransaction(() => {
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
    const insertEntry = db.prepare("insert into maintenance_work_report_entries(flight_id,role,user_id,user_name,team,created_at,updated_at) values(?,?,?,?,?,?,?)");
    normalized.entries.forEach(({ role, person }) => insertEntry.run(flightId, role, person.id, person.name, person.team || "未设置", stamp, stamp));

    if (mode === "finalize") {
      const current = db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=? and role<>'放行'").all(flightId);
      const desired = new Map(normalized.entries.map(item => [`${item.role}\u0000${item.person.id}`, item]));
      for (const row of current) {
        const key = `${row.role}\u0000${row.user_id}`;
        if (desired.has(key)) continue;
        db.prepare("delete from maintenance_feedback where assignment_id=?").run(row.id);
        db.prepare("delete from maintenance_hour_results where assignment_id=?").run(row.id);
        db.prepare("delete from maintenance_assignments where id=?").run(row.id);
      }
      const retained = new Map(db.prepare("select * from maintenance_assignments where owner_type='flight' and owner_id=? and role<>'放行'").all(flightId).map(row => [`${row.role}\u0000${row.user_id}`, row]));
      for (const { role, person } of normalized.entries) {
        const key = `${role}\u0000${person.id}`;
        let row = retained.get(key);
        if (!row) {
          const id = insertMaintenanceAssignment({
            ownerType: "flight",
            ownerId: flightId,
            flightId,
            userId: person.id,
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
        db.prepare("insert into maintenance_feedback(id,assignment_id,owner_type,owner_id,user_id,role,content,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)")
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

function canViewRecord(user, record) {
  if (!user || !user.id || !record) return false;
  if ((record.publish_status || "已发布") === "作废") return user.role === "admin";
  if (user.role === "admin") return true;
  if (user.role === "publisher") return isRecordRecipient(user, record) || isRecordOwner(user, record);
  return isRecordRecipient(user, record);
}

function canViewFixedProject(user) {
  return !!user?.id && Array.isArray(user.allowedTabs) && user.allowedTabs.includes("fixedPage");
}

function publicReceiptsFor(user, recordIds) {
  if (!recordIds.length) return [];
  const placeholders = recordIds.map(() => "?").join(",");
  if (user.role === "admin" || user.role === "publisher") {
    return db.prepare(`select r.record_id as recordId,r.user_id as userId,r.read_at as readAt,r.is_overdue as isOverdue,r.remind_count as remindCount,r.last_reminded_at as lastRemindedAt
      from read_receipts r
      join record_recipients rr on rr.record_id=r.record_id and rr.user_id=r.user_id
      join users u on u.id=r.user_id and (u.status is null or u.status<>'disabled')
      where r.record_id in (${placeholders})`)
      .all(...recordIds)
      .map(row => ({ ...row, isOverdue: !!row.isOverdue }));
  }
  return db.prepare(`select r.record_id as recordId,r.user_id as userId,r.read_at as readAt,r.is_overdue as isOverdue,r.remind_count as remindCount,r.last_reminded_at as lastRemindedAt
    from read_receipts r
    join record_recipients rr on rr.record_id=r.record_id and rr.user_id=r.user_id
    join users u on u.id=r.user_id and (u.status is null or u.status<>'disabled')
    where r.user_id=? and r.record_id in (${placeholders})`)
    .all(user.id, ...recordIds)
    .map(row => ({ ...row, isOverdue: !!row.isOverdue }));
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
      return user.role === "admin"
        ? { ok: true }
        : { ok: false, error: "作废信息仅管理员可管理附件" };
    }
    if (user.role === "admin") return { ok: true };
    if (has(user, "edit") && canViewRecord(user, record)) return { ok: true };
    if (!has(user, "create")) return { ok: false, error: "当前账号没有发布权限" };
    if (!isRecordOwner(user, record)) return { ok: false, error: "只能给自己发布的信息上传附件" };
    return { ok: true };
  }
  if (row.owner_type === "fixedProject") {
    return has(user, "fixedManage")
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
  if (!user || !user.id || !record) return false;
  const publisherName = String(record.publisher || "").trim();
  if (publisherName && publisherName === user.name && publisherName !== "发布者") return true;
  if (publisherName && publisherName !== user.name) return false;
  return record.publisher_id === user.id || record.created_by === user.id;
}

function isRecordRecipient(user, record) {
  if (!user || !user.id || !record) return false;
  return !!db.prepare("select 1 from record_recipients where record_id=? and user_id=?").get(record.id, user.id);
}

function canEditRecord(user, record) {
  return has(user, "edit") && canViewRecord(user, record);
}

function canDeleteRecord(user, record) {
  return has(user, "delete") && canViewRecord(user, record);
}

function canVoidRecord(user, record) {
  if (!user || !record || (record.publish_status || "已发布") === "作废") return false;
  if (user.role === "admin") return true;
  return user.role === "publisher" && isRecordOwner(user, record);
}

function canUseStats(user) {
  return user?.role === "admin" || user?.role === "publisher";
}

function saveRecipients(recordId, people) {
  db.prepare("delete from record_recipients where record_id=?").run(recordId);
  const insert = db.prepare("insert into record_recipients(record_id,user_id,name,department,team) values(?,?,?,?,?)");
  people.forEach((person, index) => {
    const normalized = normalizePerson(person, index);
    insert.run(recordId, normalized.id, normalized.name, normalized.department, normalized.team);
  });
}

function updateReceiptStatus(recordId, userId, status) {
  const allowed = new Set(["未读", "已读", "已超期", "超期已读"]);
  if (!allowed.has(status)) {
    const error = new Error("阅读状态无效");
    error.status = 400;
    throw error;
  }
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

function peopleByIds(ids = []) {
  const map = new Map(allPeople().map(person => [person.id, person]));
  return ids.map((item, index) => {
    if (typeof item === "object" && item) return normalizePerson(item, index);
    return map.get(String(item));
  }).filter(Boolean);
}

function recipientsFromPayload(payload = {}) {
  const selected = Array.isArray(payload.recipients) ? payload.recipients : [];
  return selected.length ? peopleByIds(selected) : allPeople();
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

async function receiveMultipartUploads(req) {
  const boundaryText = multipartBoundary(req.headers["content-type"]);
  if (!boundaryText) throw uploadHttpError(400, "上传请求格式无效");
  const firstBoundary = Buffer.from(`--${boundaryText}`);
  const boundary = Buffer.from(`\r\n--${boundaryText}`);
  const headerBreak = Buffer.from("\r\n\r\n");
  const requestLimit = MAX_UPLOAD_BYTES * MAX_FILES_PER_REQUEST + 1024 * 1024;
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
    if (current.size > MAX_UPLOAD_BYTES) throw uploadHttpError(413, "单个附件不能超过100MB");
    await writeUploadChunk(current.stream, chunk);
  };

  const finishCurrent = async () => {
    if (!current) return;
    await closeUploadStream(current.stream);
    delete current.stream;
    if (!current.size) throw uploadHttpError(400, "空文件不能上传");
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
  const ext = attachmentExt(row?.name || row?.path);
  if (BLOCKED_ATTACHMENT_EXTS.has(ext)) return "application/octet-stream";
  return row?.type || "application/octet-stream";
}

function isInlineSafeAttachment(row) {
  const ext = attachmentExt(row?.name || row?.path);
  if (BLOCKED_ATTACHMENT_EXTS.has(ext)) return false;
  const type = String(row?.type || "").toLowerCase();
  return type.startsWith("image/")
    || type.startsWith("video/")
    || type.startsWith("audio/")
    || type === "application/pdf"
    || type.startsWith("text/")
    || ["pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "txt", "csv", "log", "md", "mp4", "mov", "m4v", "webm", "mp3", "wav", "m4a", "aac"].includes(ext);
}

function attachmentDisposition(row) {
  const disposition = isInlineSafeAttachment(row) ? "inline" : "attachment";
  return `${disposition}; filename*=UTF-8''${encodeURIComponent(row?.name || "附件")}`;
}

function signedCosAttachment(row, expiresSeconds = 300) {
  const expiresIn = Math.max(60, Math.min(300, Number(expiresSeconds) || 300));
  return {
    url: cosSignedUrl("GET", row.path, expiresIn, {
      "response-content-type": contentTypeForAttachment(row),
      "response-content-disposition": attachmentDisposition(row)
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

async function streamAttachment(req, res, row, filePath) {
  const stat = await fs.stat(filePath);
  const type = contentTypeForAttachment(row);
  const disposition = isInlineSafeAttachment(row) ? "inline" : "attachment";
  const baseHeaders = {
    ...securityHeaders(),
    ...attachmentCacheHeaders(row, stat),
    "Content-Type": type,
    "Content-Disposition": attachmentDisposition(row)
  };
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
    files = await receiveMultipartUploads(req);
  } catch (error) {
    return send(res, error.status || 400, { error: error.message || "附件上传失败" });
  }
  const insert = db.prepare("insert into attachments(id,owner_type,owner_id,name,type,size,storage,path,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?)");
  let inTransaction = false;
  try {
    db.exec("begin immediate");
    inTransaction = true;
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
  if (size > MAX_UPLOAD_BYTES) return send(res, 413, { error: "单个附件不能超过100MB" });
  const attachmentId = randomId("att");
  const objectKey = `attachments/${ownerType}/${ownerId}/${attachmentId}-${name}`;
  return send(res, 200, {
    attachmentId,
    objectKey,
    uploadUrl: cosSignedUrl("PUT", objectKey, 600),
    expiresIn: 600,
    headers: { "Content-Type": String(payload.type || "application/octet-stream") }
  });
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
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) return send(res, 400, { error: "附件大小无效" });
  const head = await fetch(cosSignedUrl("HEAD", objectKey, 300), { method: "HEAD" });
  if (!head.ok) return send(res, 409, { error: "COS 中未找到已上传附件" });
  const actualSize = Number(head.headers.get("content-length") || 0);
  if (actualSize && actualSize !== size) return send(res, 409, { error: "附件大小校验失败" });
  if (attachmentRow(attachmentId)) return send(res, 409, { error: "附件已登记" });
  db.prepare("insert into attachments(id,owner_type,owner_id,name,type,size,storage,path,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?)")
    .run(attachmentId, ownerType, ownerId, name, String(payload.type || "application/octet-stream"), size, "cos", objectKey, user.id, now());
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
    const noCache = [".html", ".webmanifest"].includes(path.extname(filePath).toLowerCase()) || path.basename(filePath) === "sw.js";
    const cacheControl = immutable ? "public, max-age=31536000, immutable" : noCache ? "no-cache" : "public, max-age=3600";
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ...securityHeaders(), "ETag": etag, "Cache-Control": cacheControl });
      return res.end();
    }
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === ".html" ? "text/html; charset=utf-8"
      : ext === ".css" ? "text/css; charset=utf-8"
      : ext === ".js" ? "text/javascript; charset=utf-8"
      : ext === ".webmanifest" ? "application/manifest+json; charset=utf-8"
      : ext === ".json" ? "application/json; charset=utf-8"
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
  const rows = records.flatMap(record => {
    const recs = recipients(record.id);
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

async function route(req, res) {
  const url = new URL(req.url, "http://localhost");
  const method = req.method || "GET";
  try {
    if (method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }
    if (method === "POST" && url.pathname === "/login") {
      const payload = await bodyForm(req);
      const row = db.prepare("select * from users where username=?").get(payload.username || "");
      if (!row || !verifyPassword(payload.password || "", row) || (row.status || "active") === "disabled") {
        res.writeHead(303, { "Location": `/?login_error=${encodeURIComponent("账号或密码不正确")}`, "Cache-Control": "no-store" });
        res.end();
        return;
      }
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
      const row = db.prepare("select * from users where username=?").get(payload.username || "");
      if (!row || !verifyPassword(payload.password || "", row)) return send(res, 401, { error: "账号或密码不正确" });
      if ((row.status || "active") === "disabled") return send(res, 403, { error: "账号已停用" });
      const { sid, user } = createLoginSession(row);
      return send(res, 200, { user }, { "Set-Cookie": sessionCookie(sid) });
    }
    if (method === "POST" && url.pathname === "/api/change-password") {
      const payload = await bodyJson(req);
      const username = String(payload.username || "").trim();
      const oldPassword = String(payload.oldPassword || "");
      const newPassword = String(payload.newPassword || "");
      if (!username || !oldPassword || !newPassword || newPassword.length < 6) {
        return send(res, 400, { error: "请填写账号、旧密码和至少6位新密码" });
      }
      const row = db.prepare("select * from users where username=?").get(username);
      if (!row || (row.status || "active") === "disabled" || !verifyPassword(oldPassword, row)) {
        return send(res, 401, { error: "账号或旧密码不正确" });
      }
      const pass = hashPassword(newPassword);
      db.prepare("update users set salt=?,password_hash=?,updated_at=? where id=?").run(pass.salt, pass.hash, now(), row.id);
      db.prepare("delete from sessions where user_id=?").run(row.id);
      for (const [sid, savedUserId] of sessions.entries()) {
        if (savedUserId === row.id) sessions.delete(sid);
      }
      audit(toUser(row), "change_password", "user", row.id, username);
      return send(res, 200, { ok: true });
    }
    if (method === "POST" && url.pathname === "/api/logout") {
      const sid = parseCookies(req).muc_sid;
      if (sid) {
        sessions.delete(sid);
        db.prepare("delete from sessions where id=?").run(sid);
      }
      return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
    }

    const user = currentUser(req);
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
    if (method === "GET" && url.pathname === "/api/maintenance/flights") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      const scope = url.searchParams.get("scope") || "dispatch";
      const opportunities = url.searchParams.getAll("opportunity").flatMap(value => value.split(",")).map(value => value.trim()).filter(Boolean);
      const requestedLimit = Number(url.searchParams.get("limit"));
      const result = maintenanceVisibleFlights(login, scope, {
        dateFrom: url.searchParams.get("dateFrom") || "",
        dateTo: url.searchParams.get("dateTo") || "",
        opportunities,
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
      if (!maintenanceCanExecute(executor)) return send(res, 403, { error: "当前账号没有执行权限" });
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
      if (!maintenanceCanExecute(executor)) return send(res, 403, { error: "当前账号没有执行权限" });
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
      if (!maintenanceCanExecute(executor)) return send(res, 403, { error: "当前账号没有执行权限" });
      const report = maintenanceReportsView(routeParam(maintenanceReportsRoute[1]), executor);
      if (!report) return send(res, 404, { error: "未找到维修机会" });
      return send(res, 200, { report });
    }
    if (maintenanceReportsRoute && method === "PUT" && maintenanceReportsRoute[2]) {
      const executor = requireLogin(req, res);
      if (!executor) return;
      if (!maintenanceCanExecute(executor)) return send(res, 403, { error: "当前账号没有执行权限" });
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
      if (!maintenanceCanExecute(executor)) return send(res, 403, { error: "当前账号没有执行权限" });
      const flightId = routeParam(maintenanceFinalizeRoute[1]);
      const payload = await bodyJson(req);
      const saveOnly = payload?.mode === "save";
      const flight = saveOnly
        ? saveMaintenanceReportConfirmation(flightId, payload, executor, { finalize: false })
        : finalizeMaintenanceReports(flightId, payload, executor);
      bumpMaintenanceVersion(flightId, saveOnly ? "maintenance.report.confirmation.saved" : "maintenance.report.finalized");
      return send(res, 200, { flight });
    }
    if (method === "POST" && url.pathname === "/api/maintenance/flights/import") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有派工管理权限" });
      const p = await bodyJson(req);
      const rows = Array.isArray(p.rows) ? p.rows : [];
      // Validate the entire file before any writes: mismatched columns must not become hidden flights.
      const importRows = rows.map((raw, index) => {
        const payload = { ...maintenanceFlightPayload(raw), source: "Excel导入", status: "未派工" };
        payload.date = normalizeMaintenanceStatsDate(payload.date);
        const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.date) ? new Date(`${payload.date}T00:00:00Z`) : null;
        if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== payload.date || !payload.flightNo || !payload.aircraftNo) {
          throw maintenanceReviewError(`第 ${index + 1} 条航班日期、航班号或机号无效，请核对导入列。未导入任何数据。`);
        }
        return { raw, payload };
      });
      let created = 0;
      let subCreated = 0;
      let skipped = 0;
      const imported = new Map();
      for (const { raw, payload } of importRows) {
        const matchKey = [payload.date, payload.aircraftNo, payload.workKind].join("|");
        let flight = imported.get(matchKey);
        if (!flight) {
          const existing = db.prepare("select * from maintenance_flights where date=? and aircraft_no=? and work_kind=?").get(payload.date, payload.aircraftNo, payload.workKind);
          flight = existing ? publicMaintenanceFlight(existing) : insertMaintenanceFlight(payload, manager);
          if (!existing) created++;
          imported.set(matchKey, flight);
        }
        const subPayload = maintenanceSubtaskPayload(raw);
        if (subPayload.title || subPayload.cardNo || subPayload.content) {
          subPayload.title ||= subPayload.cardNo || `${payload.workKind}非例行`;
          insertMaintenanceSubtask(flight.id, subPayload, manager);
          subCreated++;
        }
      }
      audit(manager, "maintenance_import", "maintenance", "flights", `维修机会 ${created} 条，非例行 ${subCreated} 条`);
      bumpMaintenanceVersion("", "maintenance.imported");
      return send(res, 200, { created, subCreated, skipped });
    }
    if (method === "POST" && url.pathname === "/api/maintenance/flights") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有新建维修机会权限" });
      const payload = maintenanceFlightPayload(await bodyJson(req));
      if (!payload.date || !payload.flightNo || !payload.aircraftNo) return send(res, 400, { error: "请填写日期、航班号和机号" });
      const flight = insertMaintenanceFlight(payload, manager);
      bumpMaintenanceVersion(flight.id, "maintenance.flight.created");
      return send(res, 201, { flight });
    }
    const maintenanceReview = url.pathname.match(/^\/api\/maintenance\/flights\/([^/]+)\/review$/);
    if (maintenanceReview && method === "GET") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有维修任务复核权限" });
      const review = maintenanceReviewTree(routeParam(maintenanceReview[1]));
      if (!review) return send(res, 404, { error: "未找到航班任务" });
      return send(res, 200, { review });
    }
    if (maintenanceReview && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有维修任务复核权限" });
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
      if (!full || (!maintenanceCanManage(viewer) && !maintenanceTaskTreeAssignments(flightId).some(item => item.user_id === viewer.id))) {
        return send(res, 403, { error: "无权查看该维修机会" });
      }
      return send(res, 200, { flight: full, version: maintenanceSyncVersion() });
    }
    if (maintenanceFlight && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有修改维修机会权限" });
      const flightId = routeParam(maintenanceFlight[1]);
      const existing = assertMaintenanceTreeDirectEditAllowed(flightId);
      if (!existing) return send(res, 404, { error: "未找到航班任务" });
      const payload = maintenanceFlightPayload(await bodyJson(req));
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
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有删除维修机会权限" });
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
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有新增非例行权限" });
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
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有修改非例行权限" });
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
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有删除非例行权限" });
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
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有派工权限" });
      const p = await bodyJson(req);
      const ownerType = maintenanceDispatch[1] === "flights" ? "flight" : "subtask";
      const ownerId = routeParam(maintenanceDispatch[2]);
      const owner = maintenanceOwner(ownerType, ownerId);
      if (!owner) return send(res, 404, { error: "未找到任务" });
      assertMaintenanceTreeDirectEditAllowed(ownerType === "flight" ? owner.id : owner.flight_id);
      const flight = setMaintenanceAssignments(ownerType, ownerId, Array.isArray(p.assignments) ? p.assignments : [], manager);
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
      if (!maintenanceCanExecute(executor)) return send(res, 403, { error: "当前账号没有执行权限" });
      const assignmentId = routeParam(maintenanceAssignmentAction[1]);
      const assignment = db.prepare("select * from maintenance_assignments where id=?").get(assignmentId);
      if (!assignment) return send(res, 404, { error: "未找到派工任务" });
      if (!isAdmin(executor) && assignment.user_id !== executor.id) return send(res, 403, { error: "只能反馈派给自己的任务" });
      if (assignment.owner_type !== "flight" || assignment.role !== "放行") return send(res, 409, { error: assignment.owner_type === "subtask" ? "非例行请使用汇总报工" : "例行工作请使用例行报工" });
      const flight = submitMaintenanceRelease(assignment.flight_id, await bodyJson(req), executor);
      bumpMaintenanceVersion(assignment.flight_id, "maintenance.release.submitted");
      return send(res, 200, { flight });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/rules") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      return send(res, 200, { rules: maintenanceRulesResponse() });
    }
    if (method === "PUT" && url.pathname === "/api/maintenance/rules") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有工时规则维护权限" });
      const p = await bodyJson(req);
      const rows = Array.isArray(p.rules) ? p.rules : [];
      const upsert = db.prepare("insert into maintenance_hour_rules(id,rule_type,name,value,created_at,updated_at) values(?,?,?,?,?,?) on conflict(rule_type,name) do update set value=excluded.value,updated_at=excluded.updated_at");
      const routineRows = rows.filter(row => String(row.rule_type || row.ruleType || "").trim() === "routineRatio");
      validateMaintenanceRoutineRules(routineRows);
      maintenanceTransaction(() => {
        for (const row of rows) {
          const ruleType = String(row.rule_type || row.ruleType || "").trim();
          let name = String(row.name || "").trim();
          if (!["workType", "roleRatio", "routineRatio"].includes(ruleType)) continue;
          if (ruleType === "routineRatio") name = maintenanceRoutineRuleName(String(row.opportunity || "").trim(), String(row.role || "").trim());
          if (!name || (ruleType === "roleRatio" && name === "放行")) continue;
          const value = Number(row.value);
          if (!Number.isFinite(value) || value < 0) throw maintenanceDispatchError("工时和分配比例不能为负数");
          upsert.run(row.id || randomId("mtnr"), ruleType, name, value, now(), now());
        }
      });
      audit(manager, "maintenance_update_rules", "maintenance", "rules", `${rows.length} 条`);
      bumpMaintenanceVersion("", "maintenance.rules.updated");
      return send(res, 200, { rules: maintenanceRulesResponse() });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/stats") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      return send(res, 200, maintenanceStats(Object.fromEntries(url.searchParams.entries()), login));
    }
    if (method === "GET" && url.pathname === "/api/maintenance/stats/personal") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      return send(res, 200, maintenancePersonalStats(Object.fromEntries(url.searchParams.entries()), login));
    }
    if (method === "GET" && url.pathname === "/api/maintenance/stats/personal/details") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceHasAccess(login)) return send(res, 403, { error: "当前账号没有维修管控权限" });
      return send(res, 200, maintenancePersonalDetails(Object.fromEntries(url.searchParams.entries()), login));
    }
    const maintenanceHour = url.pathname.match(/^\/api\/maintenance\/hours\/([^/]+)$/);
    if (maintenanceHour && method === "PUT") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有工时调整权限" });
      const p = await bodyJson(req);
      const hourId = routeParam(maintenanceHour[1]);
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
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有工时确认权限" });
      const hourId = routeParam(maintenanceConfirmHour[1]);
      const hour = db.prepare("select * from maintenance_hour_results where id=?").get(hourId);
      db.prepare("update maintenance_hour_results set status='已确认',confirmed_by=?,confirmed_at=?,updated_at=? where id=?").run(manager.id, now(), now(), hourId);
      db.prepare("update maintenance_assignments set status='已确认',confirmed_at=? where id=(select assignment_id from maintenance_hour_results where id=?)").run(now(), hourId);
      if (hour) syncMaintenanceOwnerConfirmation(hour.owner_type, hour.owner_id, manager.id);
      audit(manager, "maintenance_confirm_hours", "maintenanceHour", hourId);
      bumpMaintenanceVersion(hour?.flight_id || "", "maintenance.hours.confirmed");
      return send(res, 200, { hour: publicMaintenanceHour(db.prepare("select * from maintenance_hour_results where id=?").get(hourId)) });
    }
    if (method === "POST" && url.pathname === "/api/maintenance/hours/confirm-batch") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有批量确认权限" });
      const p = await bodyJson(req);
      const ids = Array.from(new Set((Array.isArray(p.ids) ? p.ids : []).map(item => String(item))));
      const hours = ids.length ? db.prepare(`select * from maintenance_hour_results where id in (${ids.map(() => "?").join(",")})`).all(...ids) : [];
      ids.forEach(id => db.prepare("update maintenance_hour_results set status='已确认',confirmed_by=?,confirmed_at=?,updated_at=? where id=?").run(manager.id, now(), now(), id));
      ids.forEach(id => db.prepare("update maintenance_assignments set status='已确认',confirmed_at=? where id=(select assignment_id from maintenance_hour_results where id=?)").run(now(), id));
      const owners = new Map(hours.map(row => [`${row.owner_type}:${row.owner_id}`, row]));
      owners.forEach(row => syncMaintenanceOwnerConfirmation(row.owner_type, row.owner_id, manager.id));
      audit(manager, "maintenance_batch_confirm_hours", "maintenanceHour", "batch", `${ids.length} 条`);
      bumpMaintenanceVersion("", "maintenance.hours.confirmed");
      return send(res, 200, { confirmed: ids.length });
    }
    const maintenanceConfirmSortie = url.pathname.match(/^\/api\/maintenance\/sorties\/([^/]+)\/confirm$/);
    if (maintenanceConfirmSortie && method === "POST") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有架次确认权限" });
      const sortieId = routeParam(maintenanceConfirmSortie[1]);
      const sortie = db.prepare("select * from maintenance_sortie_results where id=?").get(sortieId);
      if (!sortie) return send(res, 404, { error: "未找到放行架次记录" });
      db.prepare("update maintenance_sortie_results set status='已确认',sorties=1,confirmed_by=?,confirmed_at=?,updated_at=? where id=?").run(manager.id, now(), now(), sortieId);
      db.prepare("update maintenance_assignments set status='已确认',confirmed_at=? where id=?").run(now(), sortie.assignment_id);
      syncMaintenanceOwnerConfirmation(sortie.owner_type, sortie.owner_id, manager.id);
      audit(manager, "maintenance_confirm_sortie", "maintenanceSortie", sortieId);
      bumpMaintenanceVersion(sortie.flight_id || "", "maintenance.sorties.confirmed");
      return send(res, 200, { sortie: publicMaintenanceSortie(db.prepare("select * from maintenance_sortie_results where id=?").get(sortieId)) });
    }
    if (method === "POST" && url.pathname === "/api/maintenance/sorties/confirm-batch") {
      const manager = requireLogin(req, res);
      if (!manager) return;
      if (!maintenanceCanManage(manager)) return send(res, 403, { error: "当前账号没有批量确认架次权限" });
      const p = await bodyJson(req);
      const ids = Array.from(new Set((Array.isArray(p.ids) ? p.ids : []).map(item => String(item))));
      const sorties = ids.length ? db.prepare(`select * from maintenance_sortie_results where id in (${ids.map(() => "?").join(",")})`).all(...ids) : [];
      for (const sortie of sorties) {
        db.prepare("update maintenance_sortie_results set status='已确认',sorties=1,confirmed_by=?,confirmed_at=?,updated_at=? where id=?").run(manager.id, now(), now(), sortie.id);
        db.prepare("update maintenance_assignments set status='已确认',confirmed_at=? where id=?").run(now(), sortie.assignment_id);
        syncMaintenanceOwnerConfirmation(sortie.owner_type, sortie.owner_id, manager.id);
      }
      audit(manager, "maintenance_batch_confirm_sorties", "maintenanceSortie", "batch", `${sorties.length} 条`);
      bumpMaintenanceVersion("", "maintenance.sorties.confirmed");
      return send(res, 200, { confirmed: sorties.length });
    }
    if (method === "GET" && url.pathname === "/api/maintenance/export.xlsx") {
      const login = requireLogin(req, res);
      if (!login) return;
      if (!maintenanceCanManage(login)) return send(res, 403, { error: "当前账号没有导出权限" });
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
      const admin = requireAdmin(req, res);
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
    if (method === "GET" && url.pathname === "/api/records") {
      const login = requireLogin(req, res);
      if (!login) return;
      const rows = db.prepare("select * from records").all().filter(row => canViewRecord(login, row)).sort(compareRecordsDesc);
      const result = publicRecords(rows, login);
      return send(res, 200, { ...result, settings: publicSettings() });
    }
    if (method === "POST" && url.pathname === "/api/records") {
      const editor = requirePermission(req, res, "create");
      if (!editor) return;
      const p = await bodyJson(req);
      const rid = randomId("rec");
      const selectedRecipients = recipientsFromPayload(p);
      db.prepare("insert into records(id,date,publisher,category,title,summary,original,source_set,created_by,updated_by,created_at,updated_at,deadline,priority,publish_status,publisher_id,imported_read) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(rid, p.date, editor.name, p.category, p.title, "", p.original, "后台录入", editor.id, editor.id, now(), now(), p.deadline || deadlineFor(p.date), p.priority || "普通", p.publishStatus || "已发布", editor.id, 0);
      saveRecipients(rid, selectedRecipients);
      audit(editor, "create_record", "record", rid, p.title);
      return send(res, 201, { record: publicRecord(db.prepare("select * from records where id=?").get(rid), editor) });
    }
    const rec = url.pathname.match(/^\/api\/records\/([^/]+)$/);
    if (rec && method === "PUT") {
      const editor = requirePermission(req, res, "edit");
      if (!editor) return;
      const p = await bodyJson(req);
      const recordId = routeParam(rec[1]);
      const existing = db.prepare("select * from records where id=?").get(recordId);
      if (!existing) return send(res, 404, { error: "未找到信息" });
      if (!canEditRecord(editor, existing)) return send(res, 403, { error: "当前账号无权修改该信息" });
      db.prepare("update records set date=?,category=?,title=?,original=?,updated_by=?,updated_at=?,deadline=?,priority=?,publish_status=? where id=?")
        .run(p.date, p.category, p.title, p.original, editor.id, now(), p.deadline || existing.deadline || deadlineFor(p.date), p.priority || existing.priority || "普通", p.publishStatus || existing.publish_status || "已发布", recordId);
      if (Array.isArray(p.recipients)) saveRecipients(recordId, recipientsFromPayload(p));
      audit(editor, "update_record", "record", recordId, p.title);
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
      db.prepare("delete from records where id=?").run(recordId);
      db.prepare("delete from record_recipients where record_id=?").run(recordId);
      db.prepare("delete from read_receipts where record_id=?").run(recordId);
      db.prepare("delete from attachments where owner_type='record' and owner_id=?").run(recordId);
      db.prepare("delete from favorites where record_id=?").run(recordId);
      audit(login, "delete_record", "record", recordId, row.title);
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
      const admin = requireAdmin(req, res);
      if (!admin) return;
      const recordId = routeParam(restoreRecord[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if ((row.publish_status || "已发布") !== "作废") return send(res, 400, { error: "只有作废信息可以恢复" });
      const restoredAt = now();
      db.prepare("update records set date=?,deadline=?,publish_status='已发布',updated_by=?,updated_at=? where id=?")
        .run(restoredAt, deadlineFor(restoredAt), admin.id, restoredAt, recordId);
      db.prepare("delete from read_receipts where record_id=?").run(recordId);
      audit(admin, "restore_record", "record", recordId, row.title);
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
      const admin = requireAdmin(req, res);
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
      return send(res, 200, { receipts: receipts(recordId) });
    }
    const receiptBatchEdit = url.pathname.match(/^\/api\/records\/([^/]+)\/receipts$/);
    if (receiptBatchEdit && method === "PUT") {
      const admin = requireAdmin(req, res);
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
      userIds.forEach(userId => updateReceiptStatus(recordId, userId, p.status));
      audit(admin, "batch_update_receipt_status", "record", recordId, `${userIds.length}:${p.status}`);
      return send(res, 200, { receipts: receipts(recordId) });
    }
    const remind = url.pathname.match(/^\/api\/records\/([^/]+)\/remind$/);
    if (remind && method === "POST") {
      const login = requirePermission(req, res, "remind");
      if (!login) return;
      const recordId = routeParam(remind[1]);
      const row = db.prepare("select * from records where id=?").get(recordId);
      if (!row) return send(res, 404, { error: "未找到信息" });
      if (login.role !== "admin" && !isRecordOwner(login, row)) return send(res, 403, { error: "只能催办自己发布的信息" });
      const p = await bodyJson(req);
      const userIds = Array.isArray(p.userIds) ? p.userIds : [];
      const upsert = db.prepare("insert into read_receipts(record_id,user_id,read_at,is_overdue,remind_count,last_reminded_at) values(?,?,?,?,?,?) on conflict(record_id,user_id) do update set remind_count=coalesce(remind_count,0)+1,last_reminded_at=excluded.last_reminded_at");
      userIds.forEach(userId => upsert.run(recordId, String(userId), "", 0, 1, now()));
      audit(login, "remind_record", "record", recordId, `${userIds.length} 人`);
      return send(res, 200, { reminded: userIds.length, receipts: receipts(recordId) });
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
      const admin = requireAdmin(req, res);
      if (!admin) return;
      const p = await bodyJson(req);
      const rows = Array.isArray(p.rows) ? p.rows : [];
      const people = allLoginPeople();
      const insertRecord = db.prepare("insert into records(id,date,publisher,category,title,summary,original,source_set,created_by,updated_by,created_at,updated_at,deadline,priority,publish_status,publisher_id,imported_read) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
      const insertRecipient = db.prepare("insert into record_recipients(record_id,user_id,name,department,team) values(?,?,?,?,?)");
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
          insertRecipient.run(rid, person.id, person.name, person.department || "未设置", person.team || "未设置");
          insertReceipt.run(rid, person.id, importedAt, 0, 0, "");
        });
        created++;
      }
      audit(admin, "import_records", "record", "bulk", `${created} 条，跳过 ${skipped} 行`);
      return send(res, 201, { created, skipped, receiptCount: created * people.length });
    }

    if (method === "GET" && url.pathname === "/api/fixed-projects") {
      if (!currentUser(req).allowedTabs.includes("fixedPage")) return send(res, 403, { error: "当前账号没有权限" });
      const rows = db.prepare("select * from fixed_projects order by ata asc,title asc").all();
      return send(res, 200, { projects: publicProjects(rows) });
    }
    if (method === "POST" && url.pathname === "/api/fixed-projects") {
      const admin = requirePermission(req, res, "fixedManage");
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
      const admin = requirePermission(req, res, "fixedManage");
      if (!admin) return;
      const p = await bodyJson(req);
      const projectId = routeParam(fix[1]);
      db.prepare("update fixed_projects set ata=?,title=?,content_html=?,references_text=?,updated_by=?,updated_at=? where id=?")
        .run(p.ata, p.title, sanitizeRichHtml(p.contentHtml || ""), p.references || "", admin.id, now(), projectId);
      audit(admin, "update_fixed_project", "fixedProject", projectId, p.title);
      return send(res, 200, { project: publicProject(db.prepare("select * from fixed_projects where id=?").get(projectId)) });
    }
    if (fix && method === "DELETE") {
      const admin = requirePermission(req, res, "fixedManage");
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
      if (row.storage === "cos") return send(res, 200, signedCosAttachment(row, 300));
      return send(res, 200, {
        url: `/api/attachments/${encodeURIComponent(row.id)}`,
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
        res.writeHead(302, { ...securityHeaders(), "Location": signedCosAttachment(row, 300).url, "Cache-Control": "private, no-store" });
        return res.end();
      }
      const filePath = safeUploadPath(row.path);
      if (!filePath) return sendText(res, 403, "附件路径无效");
      try {
        return await streamAttachment(req, res, row, filePath);
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

    if (method === "GET" && url.pathname === "/api/admin/users") {
      const admin = requireAdmin(req, res);
      if (!admin) return;
      return send(res, 200, { users: db.prepare("select * from users order by created_at").all().map(adminUser), rolePermissions: publicRolePermissions() });
    }
    if (method === "POST" && url.pathname === "/api/admin/users") {
      const admin = requireAdmin(req, res);
      if (!admin) return;
      const p = await bodyJson(req);
      const username = String(p.username || "").trim();
      if (!username) return send(res, 400, { error: "账号不能为空" });
      if (db.prepare("select id from users where username=?").get(username)) return send(res, 409, { error: "账号已存在" });
      const role = normalizeRole(p.role);
      const defaults = roleDefaults(role);
      const allowedTabs = normalizeKeys(p.allowedTabs, defaults.allowedTabs, allowedTabKeys);
      const permissions = normalizeKeys(p.permissions, defaults.permissions, allowedPermissionKeys);
      const pass = hashPassword(p.password || "123456");
      const uid = randomId("u");
      db.prepare("insert into users(id,username,name,role,salt,password_hash,permissions,allowed_tabs,department,team,function_category,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(uid, username, p.name || username, role, pass.salt, pass.hash, JSON.stringify(permissions), JSON.stringify(allowedTabs), p.department || "未设置", p.team || "未设置", normalizeFunctionCategory(p.functionCategory), normalizeStatus(p.status), now(), now());
      audit(admin, "create_user", "user", uid, username);
      return send(res, 201, { user: adminUser(db.prepare("select * from users where id=?").get(uid)) });
    }
    if (method === "PUT" && url.pathname === "/api/admin/users/batch") {
      const admin = requireAdmin(req, res);
      if (!admin) return;
      const p = await bodyJson(req);
      const userIds = Array.isArray(p.userIds) ? Array.from(new Set(p.userIds.map(item => String(item || "").trim()).filter(Boolean))) : [];
      const updates = p.updates && typeof p.updates === "object" ? p.updates : {};
      if (!userIds.length) return send(res, 400, { error: "请选择账号" });

      const hasField = field => Object.prototype.hasOwnProperty.call(updates, field);
      const role = hasField("role") ? normalizeRole(updates.role) : null;
      const roleDefaultsForUpdate = role ? roleDefaults(role) : null;
      const status = hasField("status") ? normalizeStatus(updates.status) : null;
      const team = hasField("team") ? String(updates.team || "未设置").trim() || "未设置" : null;
      const functionCategory = hasField("functionCategory") ? normalizeFunctionCategory(updates.functionCategory) : null;
      const allowedTabs = hasField("allowedTabs") ? normalizeKeys(updates.allowedTabs, roleDefaultsForUpdate?.allowedTabs || roles.receiver.allowedTabs, allowedTabKeys) : null;
      const permissions = hasField("permissions") ? normalizeKeys(updates.permissions, roleDefaultsForUpdate?.permissions || roles.receiver.permissions, allowedPermissionKeys) : null;
      const updateFields = ["role", "status", "team", "functionCategory", "allowedTabs", "permissions"].filter(hasField);
      if (!updateFields.length) return send(res, 400, { error: "请选择要修改的内容" });

      let updated = 0;
      let skipped = 0;
      let skippedProtected = 0;
      db.exec("begin immediate");
      try {
        for (const userId of userIds) {
          const existing = db.prepare("select * from users where id=?").get(userId);
          if (!existing) {
            skipped++;
            continue;
          }
          const next = {
            role: existing.role,
            status: existing.status || "active",
            team: existing.team || "未设置",
            functionCategory: normalizeFunctionCategory(existing.function_category),
            allowedTabs: json(existing.allowed_tabs, roleDefaults(existing.role).allowedTabs),
            permissions: json(existing.permissions, roleDefaults(existing.role).permissions)
          };
          let protectedSkip = false;
          const isDefaultAdmin = userId === "54002010";
          if (hasField("role")) {
            if (isDefaultAdmin && role !== "admin") protectedSkip = true;
            else next.role = role;
          }
          if (hasField("status")) {
            if ((isDefaultAdmin || userId === admin.id) && status === "disabled") protectedSkip = true;
            else next.status = status;
          }
          if (hasField("allowedTabs")) {
            next.allowedTabs = allowedTabs;
          }
          if (hasField("permissions")) {
            next.permissions = permissions;
          }
          if (hasField("team")) next.team = team;
          if (hasField("functionCategory")) next.functionCategory = functionCategory;
          if (protectedSkip) skippedProtected++;

          db.prepare("update users set role=?,permissions=?,allowed_tabs=?,team=?,function_category=?,status=?,updated_at=? where id=?")
            .run(next.role, JSON.stringify(next.permissions), JSON.stringify(next.allowedTabs), next.team, next.functionCategory, next.status, now(), userId);
          db.prepare("update record_recipients set team=? where user_id=?").run(next.team, userId);
          updated++;
        }
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      audit(admin, "batch_update_users", "user", "bulk", `修改 ${updated}，保护跳过 ${skippedProtected}，不存在 ${skipped}，字段 ${updateFields.join("|")}`);
      return send(res, 200, { updated, skipped, skippedProtected });
    }
    const adminUserRoute = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminUserRoute && method === "PUT") {
      const admin = requireAdmin(req, res);
      if (!admin) return;
      const userId = routeParam(adminUserRoute[1]);
      const existing = db.prepare("select * from users where id=?").get(userId);
      if (!existing) return send(res, 404, { error: "未找到账号" });
      const p = await bodyJson(req);
      const isDefaultAdmin = userId === "54002010";
      const role = isDefaultAdmin ? "admin" : normalizeRole(p.role || existing.role);
      const defaults = roleDefaults(role);
      const allowedTabs = normalizeKeys(p.allowedTabs, defaults.allowedTabs, allowedTabKeys);
      const permissions = normalizeKeys(p.permissions, defaults.permissions, allowedPermissionKeys);
      const status = isDefaultAdmin ? "active" : normalizeStatus(p.status);
      db.prepare("update users set name=?,role=?,permissions=?,allowed_tabs=?,department=?,team=?,function_category=?,status=?,updated_at=? where id=?")
        .run(p.name || existing.name, role, JSON.stringify(permissions), JSON.stringify(allowedTabs), p.department || existing.department || "未设置", p.team || existing.team || "未设置", normalizeFunctionCategory(p.functionCategory || existing.function_category), status, now(), userId);
      db.prepare("update record_recipients set name=?,department=?,team=? where user_id=?")
        .run(p.name || existing.name, p.department || existing.department || "未设置", p.team || existing.team || "未设置", userId);
      audit(admin, "update_user", "user", userId, existing.username);
      return send(res, 200, { user: adminUser(db.prepare("select * from users where id=?").get(userId)) });
    }
    if (adminUserRoute && method === "DELETE") {
      const admin = requireAdmin(req, res);
      if (!admin) return;
      const userId = routeParam(adminUserRoute[1]);
      if (userId === admin.id) return send(res, 400, { error: "不能删除当前登录账号" });
      if (userId === "54002010") return send(res, 400, { error: "默认管理员账号不能删除" });
      const existing = db.prepare("select * from users where id=?").get(userId);
      if (!existing) return send(res, 404, { error: "未找到账号" });
      db.exec("begin immediate");
      try {
        db.prepare("delete from sessions where user_id=?").run(userId);
        db.prepare("delete from favorites where user_id=?").run(userId);
        db.prepare("delete from read_receipts where user_id=?").run(userId);
        db.prepare("delete from record_recipients where user_id=?").run(userId);
        db.prepare("delete from people where id=?").run(userId);
        db.prepare("delete from users where id=?").run(userId);
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      for (const [sid, savedUserId] of sessions.entries()) {
        if (savedUserId === userId) sessions.delete(sid);
      }
      audit(admin, "delete_user", "user", userId, existing.username);
      return send(res, 200, { ok: true });
    }
    const resetPasswordRoute = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
    if (resetPasswordRoute && method === "POST") {
      const admin = requireAdmin(req, res);
      if (!admin) return;
      const userId = routeParam(resetPasswordRoute[1]);
      const existing = db.prepare("select * from users where id=?").get(userId);
      if (!existing) return send(res, 404, { error: "未找到账号" });
      const p = await bodyJson(req);
      const password = String(p.password || "").trim();
      if (!password) return send(res, 400, { error: "新密码不能为空" });
      const pass = hashPassword(password);
      db.prepare("update users set salt=?,password_hash=?,updated_at=? where id=?").run(pass.salt, pass.hash, now(), userId);
      db.prepare("delete from sessions where user_id=?").run(userId);
      audit(admin, "reset_password", "user", userId, existing.username);
      return send(res, 200, { ok: true });
    }
    if (method === "POST" && url.pathname === "/api/admin/users/import") {
      const admin = requireAdmin(req, res);
      if (!admin) return;
      const p = await bodyJson(req);
      const inputRows = Array.isArray(p.rows) ? p.rows : String(p.csv || "").split(/\r?\n/).map(line => {
        const [username, name, team, role, password, allowedTabs, permissions, status, functionCategory] = line.split(",").map(cell => cell.trim());
        return { username, name, team, role, password, allowedTabs, permissions, status, functionCategory };
      });
      let created = 0, updated = 0, skipped = 0;
      const errors = [];
      for (const raw of inputRows) {
        const username = String(raw.username || raw["账号"] || "").trim();
        if (!username || username === "账号") {
          skipped++;
          continue;
        }
        const isDefaultAdmin = username === "54002010";
        const role = isDefaultAdmin ? "admin" : normalizeRole(raw.role || raw["角色"]);
        const defaults = roleDefaults(role);
        const tabs = normalizeKeys(raw.allowedTabs || raw["页签权限"], defaults.allowedTabs, allowedTabKeys);
        const perms = normalizeKeys(raw.permissions || raw["功能权限"], defaults.permissions, allowedPermissionKeys);
        const name = String(raw.name || raw["姓名"] || username).trim();
        const team = String(raw.team || raw["班组"] || "未设置").trim() || "未设置";
        const department = String(raw.department || raw["部门"] || "未设置").trim() || "未设置";
        const functionCategory = normalizeFunctionCategory(raw.functionCategory || raw["人员职能类别"] || raw["职能类别"]);
        const status = isDefaultAdmin ? "active" : normalizeStatus(raw.status || raw["状态"]);
        const existing = db.prepare("select * from users where username=?").get(username);
        if (existing) {
          db.prepare("update users set name=?,role=?,permissions=?,allowed_tabs=?,department=?,team=?,function_category=?,status=?,updated_at=? where username=?")
            .run(name, role, JSON.stringify(perms), JSON.stringify(tabs), department, team, functionCategory, status, now(), username);
          db.prepare("update record_recipients set name=?,department=?,team=? where user_id=?")
            .run(name, department, team, existing.id);
          if (raw.password || raw["初始密码"]) {
            const pass = hashPassword(String(raw.password || raw["初始密码"]));
            db.prepare("update users set salt=?,password_hash=?,updated_at=? where username=?").run(pass.salt, pass.hash, now(), username);
          }
          updated++;
        } else {
          const pass = hashPassword(String(raw.password || raw["初始密码"] || "123456"));
          db.prepare("insert into users(id,username,name,role,salt,password_hash,permissions,allowed_tabs,department,team,function_category,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .run(randomId("u"), username, name, role, pass.salt, pass.hash, JSON.stringify(perms), JSON.stringify(tabs), department, team, functionCategory, status, now(), now());
          created++;
        }
      }
      audit(admin, "import_users", "user", "bulk", `新增 ${created}，更新 ${updated}，跳过 ${skipped}`);
      return send(res, 201, { created, updated, skipped, errors });
    }

    send(res, 404, { error: "接口不存在" });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    send(res, status, { error: error.message || "服务异常", ...(error.details || {}) });
  }
}

async function measuredRoute(req, res) {
  const requestId = crypto.randomBytes(8).toString("hex");
  const started = performance.now();
  const before = db.queryStats?.() || { count: 0, totalMs: 0, slowCount: 0 };
  let statusCode = 200;
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = (status, statusMessageOrHeaders, maybeHeaders) => {
    statusCode = Number(status || 200);
    const headers = typeof statusMessageOrHeaders === "object" ? { ...statusMessageOrHeaders } : { ...(maybeHeaders || {}) };
    const current = db.queryStats?.() || before;
    headers["X-Request-Id"] ||= requestId;
    headers["Server-Timing"] ||= `db;dur=${Math.max(0, current.totalMs - before.totalMs).toFixed(1)}, app;dur=${Math.max(0, performance.now() - started).toFixed(1)}`;
    return typeof statusMessageOrHeaders === "string"
      ? originalWriteHead(status, statusMessageOrHeaders, headers)
      : originalWriteHead(status, headers);
  };
  res.once("finish", () => {
    const after = db.queryStats?.() || before;
    const durationMs = performance.now() - started;
    if (process.env.REQUEST_LOGS === "1" || durationMs >= 500 || statusCode >= 500) {
      process.stdout.write(`${JSON.stringify({
        type: "http_request",
        requestId,
        method: req.method || "GET",
        path: new URL(req.url, "http://localhost").pathname,
        status: statusCode,
        durationMs: Number(durationMs.toFixed(1)),
        queryCount: Math.max(0, after.count - before.count),
        queryMs: Number(Math.max(0, after.totalMs - before.totalMs).toFixed(1)),
        slowQueries: Math.max(0, after.slowCount - before.slowCount)
      })}\n`);
    }
  });
  return route(req, res);
}

await initDb();
if (process.env.MUC_NO_LISTEN !== "1") {
  http.createServer(measuredRoute).listen(port, host, () => {
    console.log(`MUC online app: http://127.0.0.1:${port}`);
    console.log(`健康检查：http://127.0.0.1:${port}/api/health`);
    if (host === "0.0.0.0" || host === "::") {
      const urls = lanAddresses().map(address => `http://${address}:${port}`);
      console.log(`局域网访问：${urls.join("  ") || "未检测到局域网 IPv4 地址"}`);
      if (urls.length) console.log(`手机连通测试：${urls[0]}/api/health`);
    } else {
      console.log("局域网访问：如需手机访问，请使用 HOST=0.0.0.0 启动服务");
    }
    console.log("初始账号：54002010 / muc2026，publisher / 123456，receiver / 123456");
  });
}

export { route, measuredRoute, db, parseRangeHeader, cosSignedUrl, attachmentDisposition };
