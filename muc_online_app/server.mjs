import http from "node:http";
import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(__dirname, "public");
const dbPath = process.env.DB_PATH || path.join(__dirname, "data", "muc.sqlite");
const dataDir = path.dirname(dbPath);
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
const sessions = new Map();
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTS = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "txt", "csv", "log", "md", "xlsx", "xls", "docx", "doc", "mp4", "mov", "m4v", "webm", "avi", "mp3", "wav", "m4a", "aac"]);
const BLOCKED_ATTACHMENT_EXTS = new Set(["html", "htm", "svg", "js", "mjs"]);

const roles = {
  readonly: { permissions: ["view"], allowedTabs: ["homePage", "infoPage"] },
  receiver: { permissions: ["view", "favorite"], allowedTabs: ["homePage", "infoPage", "maintenancePage"] },
  publisher: { permissions: ["view", "favorite", "create", "edit", "feedback", "remind", "export", "attachments"], allowedTabs: ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage"] },
  admin: { permissions: ["view", "favorite", "create", "edit", "delete", "feedback", "remind", "export", "attachments", "admin", "fixedManage"], allowedTabs: ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage", "settingsPage"] },
  user: { permissions: ["view", "favorite"], allowedTabs: ["homePage", "infoPage", "maintenancePage", "fixedPage"] },
  editor: { permissions: ["view", "favorite", "create", "edit", "attachments"], allowedTabs: ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage"] }
};
const allowedTabKeys = ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage", "settingsPage"];
const allowedPermissionKeys = ["view", "favorite", "create", "edit", "delete", "feedback", "remind", "export", "attachments", "admin", "fixedManage"];

const defaultPeople = [
  { id: "00000001", name: "接收者", department: "未设置", team: "一班" },
  { id: "10000001", name: "王大伟", department: "未设置", team: "一班" },
  { id: "10000002", name: "赵威", department: "未设置", team: "管理组" },
  { id: "10000003", name: "黄金山", department: "未设置", team: "二班" },
  { id: "10000004", name: "黄磊", department: "未设置", team: "检查组" },
  { id: "10000005", name: "田元鹏", department: "未设置", team: "运行组" }
];

const defaultCategories = ["质量问题", "规定要求", "周例会", "日例会", "其他"];

await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(uploadDir, { recursive: true });
const db = await createDatabase({ dbPath });

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
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

function normalizePerson(person, index = 0) {
  const rawId = String(person?.id || "");
  const id = rawId.trim() || String(90000000 + index).slice(0, 8);
  return {
    id,
    name: String(person?.name || "").trim() || "未命名",
    department: String(person?.department || "未设置").trim() || "未设置",
    team: String(person?.team || person?.department || "未设置").trim() || "未设置"
  };
}

function allPeople() {
  const rows = db.prepare("select id,username,name,department,team from users where status is null or status<>'disabled' order by username").all();
  return rows.length ? rows.map(row => ({
    id: row.id,
    username: row.username,
    name: row.name,
    department: row.department || "未设置",
    team: row.team || "未设置"
  })) : defaultPeople;
}

function allLoginPeople() {
  return allPeople();
}

function toUser(row) {
  if (!row) return { id: "guest", username: "guest", name: "访客", role: "readonly", permissions: ["view"], allowedTabs: ["homePage", "infoPage"] };
  const preset = roles[row.role] || roles.user;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    department: row.department || "未设置",
    team: row.team || "未设置",
    status: row.status || "active",
    permissions: json(row.permissions, preset.permissions),
    allowedTabs: json(row.allowed_tabs, preset.allowedTabs)
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
  const normalized = { 接收者: "receiver", 发布者: "publisher", 管理员: "admin" }[String(value || "").trim()] || value;
  return ["receiver", "publisher", "admin"].includes(normalized) ? normalized : "receiver";
}

function normalizeStatus(value) {
  const normalized = String(value || "").trim();
  if (["disabled", "停用", "禁用", "无效"].includes(normalized)) return "disabled";
  return "active";
}

function normalizeKeys(value, fallback, allowed) {
  const input = Array.isArray(value) ? value : String(value || "").split("|");
  const set = new Set(input.map(item => String(item).trim()).filter(item => allowed.includes(item)));
  return set.size ? Array.from(set) : fallback;
}

function publicRolePermissions() {
  return Object.fromEntries(Object.entries(roles).filter(([key]) => ["receiver", "publisher", "admin"].includes(key)).map(([key, value]) => [key, value]));
}

function has(user, permission) {
  return user.permissions.includes(permission);
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
  const secure = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
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
  if (user.id === "guest") {
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

function audit(user, action, targetType, targetId, detail = "") {
  db.prepare("insert into audit_logs(id,user_id,user_name,action,target_type,target_id,detail,created_at) values(?,?,?,?,?,?,?,?)")
    .run(randomId("audit"), user?.id || "guest", user?.name || "访客", action, targetType, targetId, detail, now());
}

function send(res, status, data, headers = {}) {
  res.writeHead(status, { ...corsHeaders(), ...securityHeaders(), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(data));
}

function sendText(res, status, body, type = "text/plain; charset=utf-8", headers = {}) {
  res.writeHead(status, { ...corsHeaders(), ...securityHeaders(), "Content-Type": type, ...headers });
  res.end(body);
}

function sendBinary(res, status, body, type, headers = {}) {
  res.writeHead(status, { ...corsHeaders(), ...securityHeaders(), "Content-Type": type, ...headers });
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
  `);
  ensureColumn("users", "department", "text");
  ensureColumn("users", "team", "text");
  ensureColumn("users", "status", "text default 'active'");
  ensureColumn("records", "deadline", "text");
  ensureColumn("records", "priority", "text default '普通'");
  ensureColumn("records", "publish_status", "text default '已发布'");
  ensureColumn("records", "publisher_id", "text");
  ensureColumn("records", "imported_read", "integer default 0");
  db.prepare("delete from sessions where expires_at<=?").run(now());
  db.prepare("delete from favorites where record_id not in (select id from records)").run();
  const seeds = [
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
  const legacyAdmin = db.prepare("select id from users where username=?").get("admin");
  if (legacyAdmin) {
    db.prepare("delete from sessions where user_id=?").run(legacyAdmin.id);
    db.prepare("delete from favorites where user_id=?").run(legacyAdmin.id);
    db.prepare("delete from users where username=?").run("admin");
  }
  const peopleCount = db.prepare("select count(*) as count from people").get().count;
  if (!peopleCount) {
    const insertPeople = db.prepare("insert into people(id,name,department,team,created_at,updated_at) values(?,?,?,?,?,?)");
    defaultPeople.forEach(person => insertPeople.run(person.id, person.name, person.department, person.team, now(), now()));
  }
  if (!db.prepare("select key from settings where key='categories'").get()) setSetting("categories", defaultCategories);
  if (!db.prepare("select key from settings where key='overdueDays'").get()) setSetting("overdueDays", 3);
  if (!db.prepare("select key from settings where key='reminderDays'").get()) setSetting("reminderDays", 1);
  await seedInitialRecords();
  migrateCategories();
  backfillRecordRecipients();
  cleanupOrphanUserData();
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

function ensureDefaultAdmin() {
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
    .map(row => ({ ...row, attachmentId: row.id, ownerType, ownerId, url: `/api/attachments/${encodeURIComponent(row.id)}` }));
}

function fileStem(name = "") {
  return path.basename(String(name || "")).replace(/\.[^.]+$/, "");
}

function isPdfAttachmentRow(row) {
  const name = String(row?.name || row?.path || "").toLowerCase();
  const type = String(row?.type || "").toLowerCase();
  return type.includes("pdf") || name.endsWith(".pdf");
}

async function htmlPreviewPathForAttachment(row) {
  if (!row || !isPdfAttachmentRow(row)) return "";
  const candidates = [];
  if (row.path) candidates.push(path.join(uploadDir, `${fileStem(row.path)}.html`));
  if (row.name) candidates.push(path.join(uploadDir, `${fileStem(row.name)}.html`));
  for (const candidate of candidates) {
    if (fss.existsSync(candidate)) return candidate;
  }
  const sourceStem = fileStem(row.name || row.path).toLowerCase();
  if (!sourceStem) return "";
  const files = await fs.readdir(uploadDir).catch(() => []);
  const match = files.find(file => {
    const lower = file.toLowerCase();
    return lower.endsWith(".html") && (lower.endsWith(`${sourceStem}.html`) || fileStem(lower).endsWith(sourceStem));
  });
  return match ? path.join(uploadDir, match) : "";
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
    rolePermissions: publicRolePermissions(),
    securityNotes: "正式部署后由后端认证、数据库权限校验、附件访问鉴权和操作日志保障。"
  };
}

async function removeOwnerAttachmentFiles(ownerType, ownerId) {
  const rows = db.prepare("select path from attachments where owner_type=? and owner_id=?").all(ownerType, ownerId);
  for (const row of rows) {
    if (row.path) await fs.rm(path.join(uploadDir, row.path), { force: true });
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
  if (!user || user.id === "guest" || !record) return false;
  if ((record.publish_status || "已发布") === "作废") return user.role === "admin";
  if (user.role === "admin") return true;
  if (user.role === "publisher") return isRecordRecipient(user, record) || isRecordOwner(user, record);
  return isRecordRecipient(user, record);
}

function canViewFixedProject(user) {
  return !!user && user.id !== "guest" && Array.isArray(user.allowedTabs) && user.allowedTabs.includes("fixedPage");
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

function canManageAttachment(user, row) {
  if (!row || !user || user.id === "guest") return false;
  if (row.owner_type === "record") {
    const record = ownerRecord(row);
    if (!record) return false;
    return user.role === "admin" || (user.role === "publisher" && has(user, "attachments") && isRecordOwner(user, record));
  }
  if (row.owner_type === "fixedProject") return has(user, "fixedManage");
  return false;
}

function safeUploadPath(name) {
  const full = path.resolve(uploadDir, name || "");
  const relative = path.relative(uploadDir, full);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return "";
  return full;
}

function isRecordOwner(user, record) {
  if (!user || user.id === "guest" || !record) return false;
  const publisherName = String(record.publisher || "").trim();
  if (publisherName && publisherName === user.name && publisherName !== "发布者") return true;
  if (publisherName && publisherName !== user.name) return false;
  return record.publisher_id === user.id || record.created_by === user.id;
}

function isRecordRecipient(user, record) {
  if (!user || user.id === "guest" || !record) return false;
  return !!db.prepare("select 1 from record_recipients where record_id=? and user_id=?").get(record.id, user.id);
}

function canEditRecord(user, record) {
  return user.role === "admin";
}

function canDeleteRecord(user, record) {
  return user.role === "admin";
}

function canVoidRecord(user, record) {
  if (!user || !record || (record.publish_status || "已发布") === "作废") return false;
  if (user.role === "admin") return true;
  return user.role === "publisher" && isRecordOwner(user, record);
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

function attachmentExt(name = "") {
  return (String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/) || ["", ""])[1];
}

function validateUpload(file) {
  const size = file?.data?.length || 0;
  if (!size) {
    const error = new Error("空文件不能上传");
    error.status = 400;
    throw error;
  }
  if (size > MAX_UPLOAD_BYTES) {
    const error = new Error("单个附件不能超过100MB");
    error.status = 413;
    throw error;
  }
  const ext = attachmentExt(file.name);
  if (!ext || BLOCKED_ATTACHMENT_EXTS.has(ext) || !ALLOWED_ATTACHMENT_EXTS.has(ext)) {
    const error = new Error("不允许上传该文件类型");
    error.status = 415;
    throw error;
  }
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

async function addUploadedAttachments(req, res, ownerType, ownerId) {
  const user = requirePermission(req, res, "attachments");
  if (!user) return;
  const table = ownerType === "record" ? "records" : "fixed_projects";
  const owner = db.prepare(`select * from ${table} where id=?`).get(ownerId);
  if (!owner) return send(res, 404, { error: "未找到项目" });
  const probeRow = { owner_type: ownerType, owner_id: ownerId };
  if (!canManageAttachment(user, probeRow)) return send(res, 403, { error: "无权管理该项目附件" });
  const files = parseMultipart(await bodyBuffer(req, MAX_UPLOAD_BYTES * MAX_FILES_PER_REQUEST + 1024 * 1024), req.headers["content-type"]).filter(part => part.field === "file");
  if (files.length > MAX_FILES_PER_REQUEST) return send(res, 413, { error: `单次最多上传 ${MAX_FILES_PER_REQUEST} 个附件` });
  const saved = [];
  const insert = db.prepare("insert into attachments(id,owner_type,owner_id,name,type,size,storage,path,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?)");
  for (const file of files) {
    validateUpload(file);
    const attId = randomId("att");
    const safeName = path.basename(file.name || "附件");
    const storedName = `${attId}-${safeName}`;
    const targetPath = safeUploadPath(storedName);
    if (!targetPath) return send(res, 400, { error: "附件路径无效" });
    await fs.writeFile(targetPath, file.data);
    insert.run(attId, ownerType, ownerId, safeName, file.type, file.data.length, "server", storedName, user.id, now());
    saved.push({ id: attId, attachmentId: attId, name: safeName, type: file.type, size: file.data.length, storage: "server", path: storedName, url: `/api/attachments/${encodeURIComponent(attId)}` });
  }
  audit(user, "upload_attachment", ownerType, ownerId, `${saved.length} 个附件`);
  send(res, 201, { attachments: saved });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(publicDir, "." + requested);
  const relative = path.relative(publicDir, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return sendText(res, 403, "Forbidden");
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === ".html" ? "text/html; charset=utf-8" : ext === ".css" ? "text/css; charset=utf-8" : ext === ".js" ? "text/javascript; charset=utf-8" : "application/octet-stream";
    res.writeHead(200, { ...securityHeaders(), "Content-Type": type, "Cache-Control": "no-store" });
    res.end(data);
  } catch {
    if ((req.method || "GET") === "GET" && !path.extname(requested)) {
      const data = await fs.readFile(path.join(publicDir, "index.html"));
      res.writeHead(200, { ...securityHeaders(), "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
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
      return send(res, 200, {
        ok: true,
        service: "muc-online-app",
        time: new Date().toISOString()
      });
    }
    if (method === "GET" && url.pathname === "/api/me") {
      const user = currentUser(req);
      if (user.id === "guest") return send(res, 401, { error: "请先登录" });
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
    if (method === "GET" && url.pathname === "/api/stats/reading") {
      const login = requirePermission(req, res, "export");
      if (!login) return;
      return send(res, 200, readingStats(Object.fromEntries(url.searchParams.entries())));
    }
    if (method === "GET" && url.pathname === "/api/stats/reading/export.csv") {
      const login = requirePermission(req, res, "export");
      if (!login) return;
      const csv = "\ufeff" + statsCsv(readingStats(Object.fromEntries(url.searchParams.entries())));
      return sendText(res, 200, csv, "text/csv; charset=utf-8", { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("信息阅读统计.csv")}` });
    }
    if (method === "GET" && url.pathname === "/api/stats/reading/export.xlsx") {
      const login = requirePermission(req, res, "export");
      if (!login) return;
      const workbook = statsXlsx(readingStats(Object.fromEntries(url.searchParams.entries())));
      return sendBinary(res, 200, workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("信息阅读统计.xlsx")}` });
    }
    if (method === "GET" && url.pathname === "/api/settings") {
      const login = requireLogin(req, res);
      if (!login) return;
      return send(res, 200, { settings: publicSettings() });
    }
    if (method === "PUT" && url.pathname === "/api/settings") {
      const admin = requirePermission(req, res, "admin");
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
      return send(res, 200, { records: rows.map(row => publicRecord(row, login)), receipts: publicReceiptsFor(login, rows.map(row => row.id)), settings: publicSettings() });
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
      if (!canEditRecord(editor, existing)) return send(res, 403, { error: "只有管理员可以修改信息内容" });
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
      if (!canDeleteRecord(login, row)) return send(res, 403, { error: "只能删除自己发布的信息" });
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
      const admin = requirePermission(req, res, "admin");
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
      const admin = requirePermission(req, res, "admin");
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
      const admin = requirePermission(req, res, "admin");
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
      const admin = requirePermission(req, res, "admin");
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
      return send(res, 200, { projects: rows.map(publicProject) });
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

    const upload = url.pathname.match(/^\/api\/(records|fixed-projects)\/([^/]+)\/attachments$/);
    if (upload && method === "POST") {
      await addUploadedAttachments(req, res, upload[1] === "records" ? "record" : "fixedProject", routeParam(upload[2]));
      return;
    }
    const attPreview = url.pathname.match(/^\/api\/attachments\/([^/]+)\/preview$/);
    if (attPreview && method === "GET") {
      const login = requireLogin(req, res);
      if (!login) return;
      const attachmentId = routeParam(attPreview[1]);
      const row = attachmentRow(attachmentId);
      if (!row) return send(res, 404, { error: "未找到附件" });
      if (!canViewAttachment(login, row)) return send(res, 403, { error: "无权访问该附件" });
      const previewPath = await htmlPreviewPathForAttachment(row);
      return send(res, 200, previewPath
        ? { type: "html", url: `/api/attachments/${encodeURIComponent(attachmentId)}/preview-file` }
        : { type: "fallback" });
    }
    const attPreviewFile = url.pathname.match(/^\/api\/attachments\/([^/]+)\/preview-file$/);
    if (attPreviewFile && method === "GET") {
      const login = requireLogin(req, res);
      if (!login) return;
      const attachmentId = routeParam(attPreviewFile[1]);
      const row = attachmentRow(attachmentId);
      if (!row) return sendText(res, 404, "未找到附件");
      if (!canViewAttachment(login, row)) return sendText(res, 403, "无权访问该附件");
      const previewPath = await htmlPreviewPathForAttachment(row);
      if (!previewPath) return sendText(res, 404, "未找到 PDF 页面预览");
      const safePreviewPath = safeUploadPath(path.basename(previewPath));
      if (!safePreviewPath || safePreviewPath !== path.resolve(previewPath)) return sendText(res, 403, "附件路径无效");
      res.writeHead(200, { ...securityHeaders({ "Content-Security-Policy": "default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'; font-src 'self' data:;" }), "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`${fileStem(row.name || row.path)}.html`)}` });
      return fss.createReadStream(previewPath).pipe(res);
    }
    const att = url.pathname.match(/^\/api\/attachments\/([^/]+)$/);
    if (att && method === "GET") {
      const login = requireLogin(req, res);
      if (!login) return;
      const attachmentId = routeParam(att[1]);
      const row = attachmentRow(attachmentId);
      if (!row || !row.path) return sendText(res, 404, "未找到附件");
      if (!canViewAttachment(login, row)) return sendText(res, 403, "无权访问该附件");
      const filePath = safeUploadPath(row.path);
      if (!filePath) return sendText(res, 403, "附件路径无效");
      const disposition = isInlineSafeAttachment(row) ? "inline" : "attachment";
      res.writeHead(200, { ...securityHeaders(), "Content-Type": contentTypeForAttachment(row), "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(row.name)}` });
      return fss.createReadStream(filePath).pipe(res);
    }
    if (att && method === "DELETE") {
      const login = requireLogin(req, res);
      if (!login) return;
      const attachmentId = routeParam(att[1]);
      const row = attachmentRow(attachmentId);
      if (!row) return send(res, 404, { error: "未找到附件" });
      if (!canManageAttachment(login, row)) return send(res, 403, { error: "无权删除该附件" });
      const filePath = row.path ? safeUploadPath(row.path) : "";
      if (filePath) await fs.rm(filePath, { force: true });
      db.prepare("delete from attachments where id=?").run(attachmentId);
      audit(login, "delete_attachment", row.owner_type, row.owner_id, row.name);
      return send(res, 200, { ok: true });
    }

    if (method === "GET" && url.pathname === "/api/admin/users") {
      const admin = requirePermission(req, res, "admin");
      if (!admin) return;
      return send(res, 200, { users: db.prepare("select * from users order by created_at").all().map(adminUser), rolePermissions: publicRolePermissions() });
    }
    if (method === "POST" && url.pathname === "/api/admin/users") {
      const admin = requirePermission(req, res, "admin");
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
      db.prepare("insert into users(id,username,name,role,salt,password_hash,permissions,allowed_tabs,department,team,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(uid, username, p.name || username, role, pass.salt, pass.hash, JSON.stringify(permissions), JSON.stringify(allowedTabs), p.department || "未设置", p.team || "未设置", normalizeStatus(p.status), now(), now());
      audit(admin, "create_user", "user", uid, username);
      return send(res, 201, { user: adminUser(db.prepare("select * from users where id=?").get(uid)) });
    }
    if (method === "PUT" && url.pathname === "/api/admin/users/batch") {
      const admin = requirePermission(req, res, "admin");
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
      const allowedTabs = hasField("allowedTabs") ? normalizeKeys(updates.allowedTabs, roleDefaultsForUpdate?.allowedTabs || roles.receiver.allowedTabs, allowedTabKeys) : null;
      const permissions = hasField("permissions") ? normalizeKeys(updates.permissions, roleDefaultsForUpdate?.permissions || roles.receiver.permissions, allowedPermissionKeys) : null;
      const updateFields = ["role", "status", "team", "allowedTabs", "permissions"].filter(hasField);
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
            if (isDefaultAdmin && !allowedTabs.includes("settingsPage")) protectedSkip = true;
            else next.allowedTabs = allowedTabs;
          }
          if (hasField("permissions")) {
            if (isDefaultAdmin && !permissions.includes("admin")) protectedSkip = true;
            else next.permissions = permissions;
          }
          if (hasField("team")) next.team = team;
          if (protectedSkip) skippedProtected++;

          db.prepare("update users set role=?,permissions=?,allowed_tabs=?,team=?,status=?,updated_at=? where id=?")
            .run(next.role, JSON.stringify(next.permissions), JSON.stringify(next.allowedTabs), next.team, next.status, now(), userId);
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
      const admin = requirePermission(req, res, "admin");
      if (!admin) return;
      const userId = routeParam(adminUserRoute[1]);
      const existing = db.prepare("select * from users where id=?").get(userId);
      if (!existing) return send(res, 404, { error: "未找到账号" });
      const p = await bodyJson(req);
      const role = normalizeRole(p.role || existing.role);
      const defaults = roleDefaults(role);
      const allowedTabs = normalizeKeys(p.allowedTabs, defaults.allowedTabs, allowedTabKeys);
      const permissions = normalizeKeys(p.permissions, defaults.permissions, allowedPermissionKeys);
      db.prepare("update users set name=?,role=?,permissions=?,allowed_tabs=?,department=?,team=?,status=?,updated_at=? where id=?")
        .run(p.name || existing.name, role, JSON.stringify(permissions), JSON.stringify(allowedTabs), p.department || existing.department || "未设置", p.team || existing.team || "未设置", normalizeStatus(p.status), now(), userId);
      db.prepare("update record_recipients set name=?,department=?,team=? where user_id=?")
        .run(p.name || existing.name, p.department || existing.department || "未设置", p.team || existing.team || "未设置", userId);
      audit(admin, "update_user", "user", userId, existing.username);
      return send(res, 200, { user: adminUser(db.prepare("select * from users where id=?").get(userId)) });
    }
    if (adminUserRoute && method === "DELETE") {
      const admin = requirePermission(req, res, "admin");
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
      const admin = requirePermission(req, res, "admin");
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
      const admin = requirePermission(req, res, "admin");
      if (!admin) return;
      const p = await bodyJson(req);
      const inputRows = Array.isArray(p.rows) ? p.rows : String(p.csv || "").split(/\r?\n/).map(line => {
        const [username, name, team, role, password, allowedTabs, permissions, status] = line.split(",").map(cell => cell.trim());
        return { username, name, team, role, password, allowedTabs, permissions, status };
      });
      let created = 0, updated = 0, skipped = 0;
      const errors = [];
      for (const raw of inputRows) {
        const username = String(raw.username || raw["账号"] || "").trim();
        if (!username || username === "账号") {
          skipped++;
          continue;
        }
        const role = normalizeRole(raw.role || raw["角色"]);
        const defaults = roleDefaults(role);
        const tabs = normalizeKeys(raw.allowedTabs || raw["页签权限"], defaults.allowedTabs, allowedTabKeys);
        const perms = normalizeKeys(raw.permissions || raw["功能权限"], defaults.permissions, allowedPermissionKeys);
        const name = String(raw.name || raw["姓名"] || username).trim();
        const team = String(raw.team || raw["班组"] || "未设置").trim() || "未设置";
        const department = String(raw.department || raw["部门"] || "未设置").trim() || "未设置";
        const status = normalizeStatus(raw.status || raw["状态"]);
        const existing = db.prepare("select * from users where username=?").get(username);
        if (existing) {
          db.prepare("update users set name=?,role=?,permissions=?,allowed_tabs=?,department=?,team=?,status=?,updated_at=? where username=?")
            .run(name, role, JSON.stringify(perms), JSON.stringify(tabs), department, team, status, now(), username);
          db.prepare("update record_recipients set name=?,department=?,team=? where user_id=?")
            .run(name, department, team, existing.id);
          if (raw.password || raw["初始密码"]) {
            const pass = hashPassword(String(raw.password || raw["初始密码"]));
            db.prepare("update users set salt=?,password_hash=?,updated_at=? where username=?").run(pass.salt, pass.hash, now(), username);
          }
          updated++;
        } else {
          const pass = hashPassword(String(raw.password || raw["初始密码"] || "123456"));
          db.prepare("insert into users(id,username,name,role,salt,password_hash,permissions,allowed_tabs,department,team,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .run(randomId("u"), username, name, role, pass.salt, pass.hash, JSON.stringify(perms), JSON.stringify(tabs), department, team, status, now(), now());
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
    send(res, status, { error: error.message || "服务异常" });
  }
}

await initDb();
if (process.env.MUC_NO_LISTEN !== "1") {
  http.createServer(route).listen(port, host, () => {
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

export { route, db };
