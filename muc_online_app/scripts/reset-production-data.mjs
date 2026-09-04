import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import COS from "cos-nodejs-sdk-v5";

export const BUSINESS_TABLES = [
  "sessions", "favorites", "read_receipts", "record_recipients", "attachments",
  "maintenance_report_drafts", "maintenance_report_entries", "maintenance_report_batches",
  "maintenance_work_report_entries", "maintenance_work_reports", "maintenance_feedback",
  "maintenance_hour_results", "maintenance_sortie_results", "maintenance_assignments",
  "maintenance_subtasks", "maintenance_flights", "maintenance_logs", "records", "fixed_projects",
  "audit", "audit_logs"
];
const PRESERVED_TABLES = ["users", "people", "settings", "maintenance_hour_rules", "maintenance_sync_state", "schema_migrations"];
const TABLES = [...BUSINESS_TABLES, ...PRESERVED_TABLES].sort();
const digest = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const ADMIN = "54002010";

export function validateAdmin(admin) {
  assert(admin?.id === ADMIN && admin.username === ADMIN && admin.role === "admin" && admin.status === "active", "保留管理员身份或状态不符，停止清理");
  const permissions = JSON.parse(admin.permissions);
  const tabs = JSON.parse(admin.allowed_tabs);
  assert(["view", "create", "edit", "delete", "remind", "fixedManage"].every(p => permissions.includes(p)), "管理员权限不完整");
  assert(["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage"].every(p => tabs.includes(p)), "管理员页签权限不完整");
  for (const password of ["muc2026", "123456"]) {
    assert(crypto.scryptSync(password, admin.salt, 64).toString("hex") !== admin.password_hash, "管理员仍使用默认密码，请先在正式网站修改并验证登录");
  }
}

export function validateAttachment(row) {
  assert(["record", "fixed"].includes(row.owner_type), "附件所属类型未知，须先核实清单");
  assert(typeof row.path === "string" && row.path && !row.path.includes("\\") && !row.path.split("/").some(p => p === ".." || p === "."), "附件路径无效");
  if (row.storage === "cos") {
    assert(row.path.startsWith(`attachments/${row.owner_type}/${row.owner_id}/`), "COS附件不在所属记录前缀下");
  } else {
    assert(row.storage === "server" && !path.isAbsolute(row.path), "未知或不安全的附件存储类型");
  }
  return { id: row.id, storage: row.storage, path: row.path, owner_type: row.owner_type, owner_id: row.owner_id };
}

export async function inspect(client) {
  const actual = (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r => r.tablename);
  assert(JSON.stringify(actual) === JSON.stringify(TABLES), "数据库表清单与已审核范围不同，停止清理");
  const identity = (await client.query("select current_database() as database, current_user as username, inet_server_addr()::text as address, inet_server_port() as port")).rows[0];
  const rowsByTable = {};
  const counts = {};
  const fingerprints = {};
  for (const table of TABLES) {
    const rows = (await client.query(`select * from ${table}`)).rows;
    rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    rowsByTable[table] = rows;
    counts[table] = rows.length;
    fingerprints[table] = digest(rows);
  }
  const admin = rowsByTable.users.find(u => u.username === ADMIN);
  validateAdmin(admin);
  // These are the only settings currently maintained by the application. Unknown
  // keys may contain personnel references and must be reviewed rather than erased.
  assert(rowsByTable.settings.every(s => ["categories", "overdueDays", "reminderDays"].includes(s.key) || /^maintenance_.*_v\d+$/.test(s.key)), "存在未审核的系统设置，须先核对人员引用");
  return {
    format: 1, host: os.hostname(), identity, counts, fingerprints,
    admin: { id: admin.id, username: admin.username, name: admin.name, department: admin.department, team: admin.team },
    attachments: rowsByTable.attachments.map(validateAttachment)
  };
}

export async function clearDatabase(client, manifest, backup) {
  await client.query("begin");
  try {
    await client.query(`lock table ${TABLES.join(",")} in exclusive mode`);
    const current = await inspect(client);
    assert(digest(current) === digest(manifest), "数据自清单生成后已变化，停止清理");
    for (const table of BUSINESS_TABLES) await client.query(`delete from ${table}`);
    await client.query("delete from people where id<>$1", [ADMIN]);
    await client.query("delete from users where id<>$1", [ADMIN]);
    await client.query("update maintenance_sync_state set version=version+1,updated_at=$1", [new Date().toISOString()]);
    await client.query("insert into audit_logs(id,user_id,user_name,action,target_type,target_id,detail,created_at) values($1,$2,$3,$4,$5,$6,$7,$8)", [
      crypto.randomUUID(), ADMIN, manifest.admin.name, "production_initialize", "system", "production",
      JSON.stringify({ counts: manifest.counts, backup, manifestHash: digest(manifest), attachments: "pending permanent deletion; no file backup" }), new Date().toISOString()
    ]);
    for (const table of BUSINESS_TABLES.filter(t => t !== "audit_logs")) {
      assert(Number((await client.query(`select count(*) as n from ${table}`)).rows[0].n) === 0, `清理核验失败: ${table}`);
    }
    assert(Number((await client.query("select count(*) as n from users")).rows[0].n) === 1, "账号清理核验失败");
    for (const table of ["settings", "maintenance_hour_rules"]) {
      const rows = (await client.query(`select * from ${table}`)).rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      assert(digest(rows) === manifest.fingerprints[table], "规则或配置发生意外变化");
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

function requireMaintenance() {
  for (const service of ["airline-operations-center.service", "airline-operations-center-deploy.timer", "airline-operations-center-deploy.service"]) {
    const loaded = execFileSync("systemctl", ["show", service, "--property=LoadState", "--value"], { encoding: "utf8" }).trim();
    assert(loaded === "loaded", `${service}未正确安装，不能确认维护状态`);
    const status = execFileSync("systemctl", ["show", service, "--property=ActiveState", "--value"], { encoding: "utf8" }).trim();
    assert(status === "inactive", `${service}未停止，不允许清理`);
  }
}

function pgEnvironment(url, database) {
  return { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: database, PGSSLMODE: process.env.PGSSLMODE || "require" };
}

async function verifiedBackup(client, url, manifest, directory) {
  const backup = path.join(directory, "database.dump");
  const env = pgEnvironment(url, manifest.identity.database);
  execFileSync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", backup], { env, stdio: ["ignore", "ignore", "pipe"] });
  const verificationDb = `launch_verify_${crypto.randomBytes(8).toString("hex")}`;
  await client.query(`create database ${verificationDb}`);
  try {
    execFileSync("pg_restore", ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", verificationDb, backup], { env: pgEnvironment(url, verificationDb), stdio: ["ignore", "ignore", "pipe"] });
    const verifyUrl = new URL(url); verifyUrl.pathname = `/${verificationDb}`;
    const verify = new pg.Client({ connectionString: verifyUrl.toString(), ssl: env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: true } });
    await verify.connect();
    try {
      const restored = await inspect(verify);
      assert(digest(restored.fingerprints) === digest(manifest.fingerprints), "备份恢复核验失败");
    } finally { await verify.end(); }
  } finally { await client.query(`drop database ${verificationDb}`); }
  const sha256 = crypto.createHash("sha256").update(await fs.readFile(backup)).digest("hex");
  await fs.writeFile(`${backup}.sha256`, sha256, { mode: 0o600 });
  return { file: backup, sha256, restoredAndVerifiedAt: new Date().toISOString() };
}

async function fileDeletionClient(manifest) {
  let cos;
  if (manifest.attachments.some(a => a.storage === "cos")) {
    for (const key of ["COS_SECRET_ID", "COS_SECRET_KEY", "COS_BUCKET", "COS_REGION"]) assert(process.env[key], `${key}未配置`);
    cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
    const versioning = await cos.getBucketVersioning({ Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION });
    assert(!versioning.VersioningConfiguration?.Status && !versioning.Status, "COS曾启用版本控制，普通删除不能永久清除历史版本；须先审核版本清单，停止自动清理");
  }
  let root;
  if (manifest.attachments.some(a => a.storage === "server")) {
    assert(process.env.UPLOAD_DIR && path.isAbsolute(process.env.UPLOAD_DIR), "必须指定正式附件绝对目录");
    root = await fs.realpath(process.env.UPLOAD_DIR);
    for (const row of manifest.attachments.filter(a => a.storage === "server")) {
      const target = path.resolve(root, row.path);
      assert(target.startsWith(`${root}${path.sep}`), "附件越界");
      const parent = await fs.realpath(path.dirname(target));
      assert(parent === root || parent.startsWith(`${root}${path.sep}`), "附件目录通过符号链接越界");
    }
  }
  return async row => {
    validateAttachment(row);
    if (row.storage === "cos") {
      const params = { Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION, Key: row.path };
      await cos.deleteObject(params);
      try { await cos.headObject(params); throw new Error("删除后COS对象仍存在"); }
      catch (error) { if (error.statusCode !== 404) throw error; }
    } else await fs.rm(path.resolve(root, row.path), { force: true });
  };
}

async function main() {
  process.umask(0o077);
  const mode = process.argv[2];
  assert(["inspect", "execute", "delete-files"].includes(mode), "用法: node scripts/reset-production-data.mjs inspect|execute|delete-files /绝对路径/清理目录");
  const directory = process.argv[3];
  assert(directory && path.isAbsolute(directory), "必须指定专用清理目录的绝对路径");
  assert(process.env.NODE_ENV === "production", "仅允许正式环境");
  const url = new URL(process.env.DATABASE_URL || "");
  assert(["postgres:", "postgresql:"].includes(url.protocol), "仅支持腾讯云PostgreSQL，不清理本地SQLite");
  assert(process.env.RESET_EXPECTED_HOST === os.hostname(), "须明确指定RESET_EXPECTED_HOST并与当前服务器一致");
  assert(process.env.RESET_EXPECTED_DATABASE === decodeURIComponent(url.pathname.slice(1)), "须明确指定RESET_EXPECTED_DATABASE");
  const client = new pg.Client({ connectionString: url.toString(), ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: true } });
  await client.connect();
  try {
    const manifestPath = path.join(directory, "manifest.json");
    const receiptPath = path.join(directory, "database-cleared.json");
    if (mode === "inspect") {
      const manifest = await inspect(client);
      manifest.storage = { bucket: process.env.COS_BUCKET || "", region: process.env.COS_REGION || "", uploads: process.env.UPLOAD_DIR || "" };
      await fs.mkdir(directory, { mode: 0o700 });
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify({ host: manifest.host, identity: manifest.identity, counts: manifest.counts, admin: manifest.admin, confirmation: digest(manifest) }, null, 2));
      return;
    }
    requireMaintenance();
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    assert(process.env.RESET_CONFIRM === digest(manifest), "RESET_CONFIRM必须与已审核清单摘要一致");
    assert(manifest.host === os.hostname() && manifest.identity.database === process.env.RESET_EXPECTED_DATABASE, "清单不属于当前环境");
    const storage = { bucket: process.env.COS_BUCKET || "", region: process.env.COS_REGION || "", uploads: process.env.UPLOAD_DIR || "" };
    assert(digest(storage) === digest(manifest.storage), "附件目标环境已变化");
    if (mode === "execute") {
      assert(process.env.RESET_PASSWORD_LOGIN_VERIFIED === "yes", "须先验证正式密码登录");
      assert(!await fs.stat(receiptPath).catch(() => null), "该清单已执行，不能重复清理");
      const { storage: omitted, ...databaseManifest } = manifest;
      assert(digest(await inspect(client)) === digest(databaseManifest), "数据已变化，请重新生成清单");
      await fileDeletionClient(manifest);
      const backup = await verifiedBackup(client, url, databaseManifest, directory);
      await clearDatabase(client, databaseManifest, backup);
      await fs.writeFile(receiptPath, JSON.stringify({ manifestHash: digest(manifest), backup, completedAt: new Date().toISOString() }), { mode: 0o600, flag: "wx" });
      console.log("数据库已清理且保留54002010。服务仍需保持停止；下一步永久删除清单附件。");
    } else {
      const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
      assert(receipt.manifestHash === digest(manifest), "数据库清理回执不匹配");
      assert(process.env.RESET_DELETE_FILES === "PERMANENT", "须明确指定RESET_DELETE_FILES=PERMANENT");
      const remaining = Number((await client.query("select count(*) as n from attachments")).rows[0].n);
      assert(remaining === 0, "附件索引已变化，停止文件删除");
      const remove = await fileDeletionClient(manifest);
      for (const row of manifest.attachments) {
        await remove(row);
        await fs.appendFile(path.join(directory, "files-deleted.jsonl"), `${JSON.stringify({ id: row.id, storage: row.storage, path: row.path, deletedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
      }
      await client.query("update audit_logs set detail=$1 where action='production_initialize'", [JSON.stringify({ counts: manifest.counts, backup: receipt.backup, filesPermanentlyDeleted: manifest.attachments.length, completedAt: new Date().toISOString() })]);
      console.log("清单附件已永久删除。尚需检查网站和账号后恢复访问与自动部署。");
    }
  } finally { await client.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Child process diagnostics can contain connection details; do not print them.
    console.error(error?.cmd || error?.stderr ? "运维子命令失败，清理已停止；请在服务器本机检查备份或权限。" : error.message);
    process.exitCode = 1;
  });
}
