#!/usr/bin/env node
// 数据保留周期清理（D07 决策：审计 3 年 / 考勤工时原始数据 5 年 / 人员主数据长期）。
//
// 安全约定：
// - 默认干跑：只统计超期行数，不写不删。
// - --apply 才执行：先把超期行归档为 JSONL（data/retention-archive/），再按主键分批删除，
//   最后写一条 audit_logs 留痕。归档文件保留即为回溯依据。
// - 单次运行每表最多处理 --max-rows（默认 100000），剩余量在报告的 remaining 里，可重复运行。
// - 有未被策略覆盖的入边外键的表不应加入策略；父表条目可配 guard 防止误删仍被引用的行。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../db.mjs";
import { RETENTION_GROUPS, retentionCutoff } from "../retention-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = { apply: false, group: undefined, maxRows: 100000, now: undefined, archiveDir: undefined };
  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    else if (arg.startsWith("--group=")) options.group = arg.slice(8);
    else if (arg.startsWith("--max-rows=")) options.maxRows = Math.max(1, Number(arg.slice(11)) || 100000);
    else if (arg.startsWith("--now=")) options.now = arg.slice(6);
    else if (arg.startsWith("--archive-dir=")) options.archiveDir = arg.slice(14);
    else if (arg === "--help" || arg === "-h") {
      console.log("用法: node scripts/retention-cleanup.mjs [--apply] [--group=audit|raw] [--max-rows=N] [--now=ISO] [--archive-dir=PATH]");
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function auditRow(db, detail) {
  try {
    db.prepare(`insert into audit_logs(id,user_id,user_name,action,target_type,target_id,detail,created_at) values(?,?,?,?,?,?,?,?)`)
      .run(`retention-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, "system", "retention-cleanup", "retention_cleanup", "table", detail.table, JSON.stringify(detail), new Date().toISOString());
  } catch {
    // audit_logs 不存在或结构异常时不影响清理主流程，报告里仍会输出明细
  }
}

function tableExists(db, table) {
  if (db.kind === "postgres") return !!db.prepare("select 1 from information_schema.tables where table_schema=current_schema() and table_name=?").get(table);
  return !!db.prepare("select 1 from sqlite_master where type='table' and name=?").get(table);
}

export function runRetentionCleanup(db, { apply = false, group, maxRows = 100000, now = new Date(), archiveDir = path.join(root, "data", "retention-archive"), groups = RETENTION_GROUPS } = {}) {
  const results = [];
  for (const [groupKey, definition] of Object.entries(groups)) {
    if (group && groupKey !== group) continue;
    for (const entry of definition.tables) {
      const cutoff = retentionCutoff(definition.years, { now, dateOnly: entry.dateOnly });
      const where = `${entry.timeColumn} < ?${entry.guard ? ` and ${entry.guard}` : ""}`;
      const result = { group: groupKey, table: entry.table, cutoff, years: definition.years };
      if (!tableExists(db, entry.table)) {
        results.push({ ...result, status: "SKIPPED_MISSING" });
        continue;
      }
      const total = Number(db.prepare(`select count(*) as n from ${entry.table} where ${where}`).get(cutoff).n);
      if (!total) {
        results.push({ ...result, status: "EMPTY", expired: 0 });
        continue;
      }
      if (!apply) {
        results.push({ ...result, status: "DRY_RUN", expired: total, wouldProcess: Math.min(total, maxRows) });
        continue;
      }
      const rows = db.prepare(`select * from ${entry.table} where ${where} order by ${entry.timeColumn} limit ?`).all(cutoff, maxRows);
      fs.mkdirSync(archiveDir, { recursive: true });
      const archiveFile = path.join(archiveDir, `${entry.table}-${cutoff.slice(0, 10)}.jsonl`);
      fs.appendFileSync(archiveFile, rows.map(row => JSON.stringify(row)).join("\n") + "\n");
      let deleted = 0;
      db.exec("begin immediate");
      try {
        const condition = entry.pk.map(column => `${column}=?`).join(" and ");
        const remove = db.prepare(`delete from ${entry.table} where ${condition}`);
        for (const row of rows) deleted += Number(remove.run(...entry.pk.map(column => row[column])).changes ?? 0);
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
      const remaining = Number(db.prepare(`select count(*) as n from ${entry.table} where ${where}`).get(cutoff).n);
      const detail = { ...result, status: "DONE", expired: total, deleted, remaining, archiveFile: path.relative(root, archiveFile) };
      auditRow(db, detail);
      results.push(detail);
    }
  }
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  const dbPath = process.env.DB_PATH || (databaseUrl ? undefined : path.join(root, "data", "local-development.sqlite"));
  if (!databaseUrl && !fs.existsSync(dbPath)) throw new Error(`数据库不存在：${dbPath}（设置 DATABASE_URL 或 DB_PATH）`);
  const db = await createDatabase({ dbPath, databaseUrl });
  console.log(`目标：${databaseUrl ? "DATABASE_URL" : dbPath}${options.apply ? "" : "（干跑，不写不删）"}`);
  const results = runRetentionCleanup(db, {
    apply: options.apply,
    group: options.group,
    maxRows: options.maxRows,
    now: options.now ? new Date(options.now) : new Date(),
    archiveDir: options.archiveDir,
  });
  for (const item of results) {
    const detail = item.status === "DONE"
      ? `删除 ${item.deleted}/${item.expired} 行，剩余 ${item.remaining}，归档 ${item.archiveFile}`
      : item.status === "DRY_RUN" ? `超期 ${item.expired} 行（本次将处理 ${item.wouldProcess}）`
      : item.status === "EMPTY" ? "无超期数据"
      : "表不存在，跳过";
    console.log(`[${item.group}] ${item.table}（${item.years} 年前，截止 ${item.cutoff}）：${detail}`);
  }
  console.log(JSON.stringify({ apply: options.apply, results }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error?.stack || error); process.exit(1); });
}
