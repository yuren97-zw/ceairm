import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);

function sqliteDatabase(dbPath) {
  const sqlite = new DatabaseSync(dbPath);
  sqlite.kind = "sqlite";
  return sqlite;
}

function replacePlaceholders(sql) {
  let index = 0;
  return String(sql).replace(/\?/g, () => `$${++index}`);
}

function translateSql(sql) {
  let text = String(sql).trim();
  text = text.replace(/^begin\s+immediate\b/i, "begin");
  text = text.replace(/^insert\s+or\s+ignore\s+into\s+/i, "insert into ");
  text = replacePlaceholders(text);
  if (/^insert\s+into\s+/i.test(text) && /\s+on\s+conflict\s+do\s+nothing\s*$/i.test(text) === false && /insert\s+or\s+ignore/i.test(String(sql))) {
    text += " on conflict do nothing";
  }
  return text;
}

function createPostgresDatabase(databaseUrl) {
  return new PostgresSyncDatabase(databaseUrl);
}

class PostgresSyncDatabase {
  constructor(databaseUrl) {
    this.kind = "postgres";
    this.worker = new Worker(__filename, { workerData: { databaseUrl } });
    this.worker.on("error", error => { throw error; });
  }

  prepare(sql) {
    return new PostgresStatement(this, sql);
  }

  exec(sql) {
    return this._request("exec", sql, []);
  }

  _request(mode, sql, params) {
    const sab = new SharedArrayBuffer(4);
    const signal = new Int32Array(sab);
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const file = path.join(os.tmpdir(), `muc-pg-${id}.json`);
    this.worker.postMessage({ mode, sql, params, file, sab });
    Atomics.wait(signal, 0, 0);
    const raw = fs.readFileSync(file, "utf8");
    fs.rmSync(file, { force: true });
    const payload = JSON.parse(raw);
    if (!payload.ok) {
      const error = new Error(payload.error || "PostgreSQL query failed");
      error.code = payload.code;
      throw error;
    }
    return payload.result;
  }
}

class PostgresStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  get(...params) {
    return this.db._request("get", this.sql, params);
  }

  all(...params) {
    return this.db._request("all", this.sql, params);
  }

  run(...params) {
    return this.db._request("run", this.sql, params);
  }
}

export async function createDatabase({ dbPath, databaseUrl = process.env.DATABASE_URL } = {}) {
  if (databaseUrl) return createPostgresDatabase(databaseUrl);
  return sqliteDatabase(dbPath);
}

if (!isMainThread) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: workerData.databaseUrl, ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false } });
  await client.connect();

  async function tableInfo(table) {
    const result = await client.query(
      `select column_name as name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,
      [table]
    );
    return result.rows;
  }

  async function handle(message) {
    const { mode, sql, params, file, sab } = message;
    const signal = new Int32Array(sab);
    try {
      let result;
      const pragma = String(sql).trim().match(/^pragma\s+table_info\(([^)]+)\)/i);
      if (pragma) {
        result = await tableInfo(pragma[1].replace(/["'`]/g, ""));
      } else if (mode === "exec") {
        await client.query(translateSql(sql));
        result = undefined;
      } else {
        const query = translateSql(sql);
        const response = await client.query(query, params);
        if (mode === "get") result = response.rows[0];
        else if (mode === "all") result = response.rows;
        else result = { changes: response.rowCount || 0 };
      }
      await fsp.writeFile(file, JSON.stringify({ ok: true, result }));
    } catch (error) {
      await fsp.writeFile(file, JSON.stringify({ ok: false, error: error.message, code: error.code }));
    } finally {
      Atomics.store(signal, 0, 1);
      Atomics.notify(signal, 0);
    }
  }

  const queue = [];
  let running = false;
  async function drain() {
    if (running) return;
    running = true;
    while (queue.length) await handle(queue.shift());
    running = false;
  }
  parentPort.on("message", message => {
    queue.push(message);
    void drain();
  });
}
