#!/usr/bin/env node
// 从生产(www.ceairm.com)的 pg_dump 文本转储同步主数据到本地开发 SQLite：
// 组织架构、数据字典、人员、执照、授权（含版本）、账户（仅启用）、角色绑定、数据范围、考勤人员快照。
//
// 用法：
//   node scripts/sync-from-production.mjs --dump <prod.sql> --db <local-development.sqlite> [--password muc2026] [--dry-run] [--no-backup] [--report <file.json>]
//
// 生成 dump（在服务器上执行，仅含主数据表）：
//   sudo -u postgres pg_dump --data-only --no-owner --no-privileges \
//     -d <生产库名> \
//     -t public.organization_units -t public.master_data_dictionary_values \
//     -t public.personnel -t public.personnel_licenses \
//     -t public.personnel_authorizations -t public.personnel_authorization_versions \
//     -t public.users -t public.rbac_user_roles -t public.rbac_user_scopes \
//     -t public.attendance_people > /tmp/muc_prod_sync.sql
//
// 口径（2026-11-15 与赵威确认）：
// - 只同步 active 账户；口令哈希不同步，统一重置为测试密码，must_change_password=0。
// - 本地超级账号 54002010 保留本地现状，不从生产覆盖。
// - 幂等 upsert：按 id 对齐，人员/账户支持业务键回退（employee_no/username）；
//   依赖表通过 person/user id 映射表翻译引用，不删本地已有数据。
// - 目标表缺失的列自动忽略并计入报告（用于 8788 等已分叉的分支线）。

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const SUPER_ACCOUNT_ID = "54002010";
const DEFAULT_PASSWORD = "muc2026";

// ---------- CLI ----------
const args = process.argv.slice(2);
const readArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const hasFlag = (name) => args.includes(name);
const dumpPath = readArg("--dump");
const dbPathArg = readArg("--db");
const resetPassword = readArg("--password") ?? DEFAULT_PASSWORD;
const dryRun = hasFlag("--dry-run");
const noBackup = hasFlag("--no-backup");
const reportPath = readArg("--report");

if (!dumpPath || !dbPathArg) {
  console.error("用法: node scripts/sync-from-production.mjs --dump <prod.sql> --db <dev.sqlite> [--password muc2026] [--dry-run] [--no-backup] [--report <file>]");
  process.exit(1);
}
if (!fs.existsSync(dumpPath)) {
  console.error(`dump 文件不存在: ${dumpPath}`);
  process.exit(1);
}
const dbPath = path.resolve(dbPathArg);
if (!fs.existsSync(dbPath)) {
  console.error(`目标库不存在: ${dbPath}`);
  process.exit(1);
}
// 防呆：只允许写本地开发库；--force 可显式放行其它本地测试库（如考勤 work/ 下的 hybrid 验证库）。
if (!/local-development\.sqlite$/.test(dbPath) && !/[/\\]data[/\\]/.test(dbPath) && !hasFlag("--force")) {
  console.error(`拒绝写入非开发库（需为 local-development.sqlite 或位于 data/ 目录下；确认目标正确可用 --force）: ${dbPath}`);
  process.exit(1);
}

// ---------- pg_dump 文本解析 ----------
// COPY public.<table> (col, ...) FROM stdin; 之后到 \. 为一表数据；字段 \t 分隔，\N 为 NULL。
const COPY_RE = /^COPY public\.([A-Za-z0-9_]+) \(([^)]*)\) FROM stdin;$/;

function decodeField(raw) {
  if (raw === "\\N") return null;
  if (!raw.includes("\\")) return raw;
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== "\\") { out += ch; continue; }
    const next = raw[++i];
    if (next === undefined) break;
    if (next === "n") out += "\n";
    else if (next === "t") out += "\t";
    else if (next === "r") out += "\r";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else if (next === "v") out += "\v";
    else if (next === "\\") out += "\\";
    else if (next >= "0" && next <= "7") {
      let octal = next;
      while (octal.length < 3 && raw[i + 1] >= "0" && raw[i + 1] <= "7") octal += raw[++i];
      out += String.fromCharCode(parseInt(octal, 8));
    } else out += next;
  }
  return out;
}

function parseDump(text) {
  const tables = new Map();
  let current = null;
  for (const line of text.split("\n")) {
    if (current) {
      if (line === "\\.") { current = null; continue; }
      const values = line.split("\t").map(decodeField);
      current.rows.push(Object.fromEntries(current.cols.map((col, i) => [col, values[i] ?? null])));
      continue;
    }
    const match = COPY_RE.exec(line);
    if (match) {
      const name = match[1];
      const cols = match[2].split(",").map((c) => c.trim()).filter(Boolean);
      if (!tables.has(name)) tables.set(name, { cols, rows: [] });
      current = tables.get(name);
    }
  }
  return tables;
}

// ---------- 目标表定义 ----------
// keys: upsert 主键列；fallbackKeys: 主键未命中时按业务键回退对齐（更新既有行并登记 id 映射）。
// refCols: 引用列 → id 映射表名（person/user）；映射不到则该行跳过并计数。
// syncAll: false 时仅同步 status='active' 的行（users）。passwordReset: 写入统一测试口令。
const TABLE_PLANS = [
  { name: "organization_units", keys: ["id"], fallbackKeys: ["code"], idMap: "org" },
  { name: "master_data_dictionary_values", keys: ["id"], fallbackKeys: ["category", "code", "value"] },
  { name: "personnel", keys: ["id"], fallbackKeys: ["employee_no"], idMap: "person" },
  { name: "personnel_licenses", keys: ["id"], fallbackKeys: ["person_id", "license_no", "license_type"], refCols: { person_id: "person" } },
  { name: "personnel_authorizations", keys: ["id"], fallbackKeys: ["person_id", "project_code", "authorization_type", "authorization_unit"], refCols: { person_id: "person" } },
  { name: "personnel_authorization_versions", keys: ["person_id", "revision"], refCols: { person_id: "person" } },
  {
    name: "users", keys: ["id"], fallbackKeys: ["username"], idMap: "user",
    refCols: { person_id: "person" }, syncAll: false, passwordReset: true,
    skip: (row) => row.id === SUPER_ACCOUNT_ID, skipReason: "本地超级账号保留现状",
  },
  { name: "rbac_user_roles", keys: ["user_id", "role_id"], refCols: { user_id: "user" }, roleMustExist: true },
  { name: "rbac_user_scopes", keys: ["id"], fallbackKeys: ["user_id", "module", "scope_type", "scope_id"], refCols: { user_id: "user" } },
  { name: "attendance_people", keys: ["user_id"], fallbackKeys: ["person_id"], refCols: { person_id: "person" }, optional: true },
];

const idMaps = { person: new Map(), user: new Map(), org: new Map() };
// dump 中人员的 data_status，用于跳过已删除人员的关联行（本地触发器要求关联人员 active）。
const personStatus = new Map();

function quoteIdent(name) { return `"${name}"`; }

// 把本地组织 id 改名为生产的固定 id，并重写全库 *_id 文本列中对旧 id 的引用。
// 组织 id 是全局唯一 token（org-fixed-* / org-<ts>-<hex>），按值精确匹配改写不会误伤其它实体。
function realignOrganizations(db, orgMap, report) {
  const renames = [...orgMap].filter(([dumpId, localId]) => localId && localId !== dumpId);
  if (!renames.length) return;
  for (const [newId, oldId] of renames) {
    const clash = db.prepare("select code from organization_units where id=?").get(newId);
    if (clash) throw new Error(`组织 id 对齐冲突: 目标 id ${newId} 已被 code=${clash.code} 占用`);
    db.prepare("update organization_units set id=? where id=?").run(newId, oldId);
  }
  const tables = db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'").all().map((r) => r.name);
  let rewritten = 0;
  for (const table of tables) {
    if (table === "organization_units") continue;
    let cols;
    try { cols = db.prepare(`pragma table_info(${quoteIdent(table)})`).all(); } catch { continue; }
    for (const col of cols) {
      if (!/_id$/i.test(col.name) || (col.type && !/CHAR|TEXT|CLOB/i.test(col.type))) continue;
      for (const [newId, oldId] of renames) {
        const result = db.prepare(`update ${quoteIdent(table)} set ${quoteIdent(col.name)}=? where ${quoteIdent(col.name)}=?`).run(newId, oldId);
        rewritten += result.changes;
      }
    }
  }
  // settings.value 是 JSON 文本，按 "旧id" 字符串替换兜底（如分配池等配置里内嵌的组织 id）。
  const hasSettings = tables.includes("settings");
  if (hasSettings) {
    for (const [newId, oldId] of renames) {
      const result = db.prepare("update settings set value=replace(value, ?, ?) where value like ?").run(`"${oldId}"`, `"${newId}"`, `%${oldId}%`);
      rewritten += result.changes;
    }
  }
  report.notes.push(`组织 id 对齐: 改名 ${renames.length} 个组织（${renames.map(([, oldId]) => oldId).join(", ")}），重写引用 ${rewritten} 处`);
}

function tableColumns(db, table) {
  const rows = db.prepare(`pragma table_info(${quoteIdent(table)})`).all();
  return rows; // {name, type, pk, notnull, dflt_value}
}

function main() {
  const dumpText = fs.readFileSync(dumpPath, "utf8");
  const dump = parseDump(dumpText);
  for (const row of dump.get("personnel")?.rows ?? []) personStatus.set(row.id, row.data_status ?? "active");
  // scryptSync 单次约几十毫秒，统一在事务外预计算，避免拉长写事务阻塞运行中的开发服务。
  const userPasswordOverrides = new Map();
  for (const row of dump.get("users")?.rows ?? []) {
    const salt = crypto.randomBytes(16).toString("hex");
    userPasswordOverrides.set(row.id, { salt, hash: crypto.scryptSync(resetPassword, salt, 64).toString("hex") });
  }
  let backupPath = "";
  if (!dryRun && !noBackup) {
    backupPath = `${dbPath}.pre-sync-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "")}`;
    fs.copyFileSync(dbPath, backupPath);
  }

  const db = new DatabaseSync(dbPath);
  db.exec("pragma busy_timeout=5000");
  db.exec("begin immediate");

  const report = { db: dbPath, dump: dumpPath, dryRun, tables: {}, notes: [] };

  try {
    const localRoles = new Set(db.prepare("select id from rbac_roles").all().map((r) => r.id));

    for (const plan of TABLE_PLANS) {
      const stat = { dumpRows: 0, inserted: 0, updated: 0, skipped: 0, skippedDetail: [], droppedColumns: [], tableMissing: false };
      report.tables[plan.name] = stat;

      const section = dump.get(plan.name);
      if (!section) {
        if (plan.optional) { stat.tableMissing = true; report.notes.push(`${plan.name}: dump 中无此表，跳过`); continue; }
        throw new Error(`dump 中缺少表 ${plan.name}`);
      }
      const targetInfo = tableColumns(db, plan.name);
      if (!targetInfo.length) {
        if (plan.optional) { stat.tableMissing = true; report.notes.push(`${plan.name}: 目标库无此表，跳过`); continue; }
        throw new Error(`目标库缺少表 ${plan.name}: ${dbPath}`);
      }
      const targetNames = new Set(targetInfo.map((c) => c.name));
      const integerCols = new Set(targetInfo.filter((c) => /int/i.test(c.type || "")).map((c) => c.name));
      const activeCols = section.cols.filter((c) => targetNames.has(c));
      for (const c of section.cols) if (!targetNames.has(c)) stat.droppedColumns.push(c);
      if (stat.droppedColumns.length) report.notes.push(`${plan.name}: 目标表缺少列，已忽略 [${stat.droppedColumns.join(", ")}]`);
      let keyCols = plan.keys.filter((c) => targetNames.has(c));
      const fallbackCols = (plan.fallbackKeys ?? []).filter((c) => targetNames.has(c));
      // 旧模型(personnel_authorization_versions 单列 person_id 主键)适配：每人只保留 dump 中最新 revision。
      if (plan.name === "personnel_authorization_versions") {
        const pkCols = targetInfo.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
        if (pkCols.length === 1 && pkCols[0] === "person_id") {
          keyCols = ["person_id"];
          const latest = new Map();
          for (const row of section.rows) {
            const prev = latest.get(row.person_id);
            if (!prev || Number(row.revision ?? 0) > Number(prev.revision ?? 0)) latest.set(row.person_id, row);
          }
          section.rows = [...latest.values()];
          report.notes.push(`personnel_authorization_versions: 目标库为旧模型（每人一行），已按 person_id 对齐并取最新 revision`);
        }
      }

      const bindable = (value) => value === null || ["string", "number", "bigint"].includes(typeof value) || Buffer.isBuffer(value);
      const selectByKey = (cols, row) => {
        const where = cols.map((c) => `${quoteIdent(c)} = ?`).join(" and ");
        const params = cols.map((c) => normalize(c, row[c]));
        const badIndex = params.findIndex((p) => !bindable(p));
        if (badIndex >= 0) throw new Error(`非法绑定参数 表=${plan.name} 列=${cols[badIndex]} 参数=${JSON.stringify(params)} 行=${JSON.stringify(row).slice(0, 300)}`);
        return db.prepare(`select * from ${quoteIdent(plan.name)} where ${where}`).get(...params);
      };
      const normalize = (col, value) => {
        if (value === null) return null;
        // Postgres 布尔在文本转储里是 t/f，SQLite 列是 integer。
        if (integerCols.has(col) && (value === "t" || value === "f")) return value === "t" ? 1 : 0;
        return value;
      };

      for (const row of section.rows) {
        stat.dumpRows += 1;
        if (plan.skip?.(row)) {
          stat.skipped += 1;
          stat.skippedDetail.push(plan.skipReason ?? "按规则跳过");
          continue;
        }
        if (plan.syncAll === false && row.status && row.status !== "active") {
          stat.skipped += 1;
          stat.skippedDetail.push(`非启用账户 ${row.username ?? row.id}（status=${row.status}）`);
          continue;
        }

        const mapped = {};
        let refMissing = false;
        let refMissingReason = "";
        for (const [col, mapName] of Object.entries(plan.refCols ?? {})) {
          const raw = row[col];
          if (raw == null || raw === "") { mapped[col] = raw ?? null; continue; }
          if (mapName === "person" && personStatus.get(raw) && personStatus.get(raw) !== "active") {
            refMissing = true;
            refMissingReason = `人员已删除（${raw}）`;
            break;
          }
          const resolved = idMaps[mapName].get(raw) ?? null;
          if (resolved == null) {
            refMissing = true;
            refMissingReason = `引用缺失（${Object.keys(plan.refCols ?? {}).join(",")}）`;
            break;
          }
          mapped[col] = resolved;
        }
        if (refMissing) {
          stat.skipped += 1;
          stat.skippedDetail.push(`${refMissingReason}: ${row.id ?? row.user_id ?? "?"}`);
          continue;
        }

        const rowValues = {};
        for (const col of activeCols) rowValues[col] = mapped[col] !== undefined ? mapped[col] : normalize(col, row[col]);

        let existing = selectByKey(keyCols, rowValues);
        let insertAsNew = false;
        if (!existing && fallbackCols.length) {
          const fallbackRow = selectByKey(fallbackCols, rowValues);
          if (fallbackRow) {
            existing = fallbackRow;
            if (plan.idMap && keyCols.length === 1 && rowValues.id != null) idMaps[plan.idMap].set(rowValues.id, fallbackRow.id);
            keyCols.forEach((c, i) => { rowValues[c] = fallbackRow[c]; });
          }
        }
        if (!existing) {
          // 复合键无业务键回退时，直接以 dump 键值新增。
          insertAsNew = true;
        }

        if (plan.passwordReset) {
          const override = userPasswordOverrides.get(row.id);
          if (!override) throw new Error(`缺少预计算口令: ${row.id}`);
          rowValues.salt = override.salt;
          rowValues.password_hash = override.hash;
          rowValues.must_change_password = 0;
          if (insertAsNew) rowValues.credential_version = 1;
          for (const legacy of ["permissions", "allowed_tabs"]) {
            if (activeCols.includes(legacy) && (rowValues[legacy] == null || rowValues[legacy] === "")) rowValues[legacy] = "[]";
          }
        }

        if (plan.roleMustExist && rowValues.role_id && !localRoles.has(rowValues.role_id)) {
          stat.skipped += 1;
          stat.skippedDetail.push(`本地无角色 ${rowValues.role_id}（user=${rowValues.user_id}）`);
          continue;
        }

        const cols = Object.keys(rowValues);
        if (existing) {
          const assignments = cols.filter((c) => !plan.passwordReset || c !== "credential_version");
          const setSql = assignments.map((c) => `${quoteIdent(c)} = ?`).join(", ");
          db.prepare(`update ${quoteIdent(plan.name)} set ${setSql} where ${keyCols.map((c) => `${quoteIdent(c)} = ?`).join(" and ")}`)
            .run(...assignments.map((c) => rowValues[c]), ...keyCols.map((c) => rowValues[c]));
          stat.updated += 1;
          if (plan.idMap && keyCols.length === 1 && rowValues.id != null) idMaps[plan.idMap].set(row.id, existing.id);
        } else if (insertAsNew) {
          const colsSql = cols.map(quoteIdent).join(", ");
          db.prepare(`insert into ${quoteIdent(plan.name)} (${colsSql}) values (${cols.map(() => "?").join(", ")})`)
            .run(...cols.map((c) => rowValues[c]));
          stat.inserted += 1;
          if (plan.idMap && keyCols.length === 1 && rowValues.id != null) idMaps[plan.idMap].set(row.id, rowValues.id);
        } else {
          stat.skipped += 1;
        }
      }
    }

    // 组织 id 对齐：生产的组织 id 是固定值(org-fixed-*)，本地首次播种用的是随机 id。
    // 按 code 回退匹配到本地行后，把本地 id 改名为生产 id，并全库重写旧 id 引用，
    // 使人员三个组织引用、数据范围 scope_id、组织 parent_id、能力状态等全部落在同一套 id 上。
    realignOrganizations(db, idMaps.org, report);

    // 人员/账户之外的自引用兜底：数据范围的 scope_id 引用组织单元，只做存在性告警。
    const orgIds = new Set(db.prepare("select id from organization_units").all().map((r) => r.id));
    const danglingScopes = db.prepare("select id, scope_type, scope_id from rbac_user_scopes where scope_type in ('department','administrative_team','personnel_group') and scope_id <> ''").all()
      .filter((s) => !orgIds.has(s.scope_id));
    if (danglingScopes.length) report.notes.push(`警告: ${danglingScopes.length} 条数据范围的 scope_id 未命中本地组织单元（示例 ${danglingScopes[0].scope_id}）`);

    if (dryRun) {
      db.exec("rollback");
      report.notes.push("dry-run: 未写入任何数据");
    } else {
      db.exec("commit");
      if (backupPath) report.backup = backupPath;
    }
  } catch (error) {
    try { db.exec("rollback"); } catch {}
    throw error;
  } finally {
    db.close();
  }

  // ---------- 输出 ----------
  console.log(`\n== 同步报告 ${dryRun ? "(dry-run)" : ""} ==`);
  console.log(`dump: ${dumpPath}`);
  console.log(`db:   ${dbPath}`);
  for (const [table, stat] of Object.entries(report.tables)) {
    const line = `${table.padEnd(34)} dump=${stat.dumpRows} 新增=${stat.inserted} 更新=${stat.updated} 跳过=${stat.skipped}`;
    console.log(line + (stat.tableMissing ? "  [表缺失,跳过]" : ""));
    for (const note of stat.skippedDetail.slice(0, 5)) console.log(`    · ${note}`);
    if (stat.skippedDetail.length > 5) console.log(`    · ...共 ${stat.skippedDetail.length} 条跳过`);
  }
  for (const note of report.notes) console.log(`  备注: ${note}`);
  if (report.backup) console.log(`  备份: ${report.backup}`);

  if (reportPath) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`报告已写入 ${reportPath}`);
  }
}

main();
