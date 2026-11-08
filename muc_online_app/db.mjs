import fs from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { postgresConnectionOptions } from "./postgres-connection.mjs";

const __filename = fileURLToPath(import.meta.url);
// 查询级超时：单条卡死的查询最多冻结事件循环 15 秒（配合 worker 自愈重建自动恢复），
// 避免 120 秒超时 × 积压请求数 = 数小时的整体冻结（生产假死事故的放大器）。
const REQUEST_TIMEOUT_MS = 15000;
export const requestQueryStats = new AsyncLocalStorage();

function sqliteDatabase(dbPath) {
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec("pragma busy_timeout=5000");
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
  // SQLite preserves mixed-case aliases, while PostgreSQL folds unquoted ones
  // to lower case. Keep the object keys expected by the shared application.
  text = text.split(/('(?:''|[^'])*'|"(?:""|[^"])*")/g).map((part, index) => index % 2 ? part :
    part.replace(/\bas(\s+)([a-z_][A-Za-z0-9_]*)\b/gi, (match, space, alias) =>
      /^[a-z_]/.test(alias) && /[A-Z]/.test(alias) ? `as${space}"${alias}"` : match)).join("");
  text = replacePlaceholders(text);
  if (/^insert\s+into\s+/i.test(text) && /\s+on\s+conflict\s+do\s+nothing\s*$/i.test(text) === false && /insert\s+or\s+ignore/i.test(String(sql))) {
    text += " on conflict do nothing";
  }
  return text;
}

function createPostgresDatabase(databaseUrl) {
  // Fail before starting the synchronous worker when TLS configuration is unsafe.
  postgresConnectionOptions(databaseUrl);
  return new PostgresSyncDatabase(databaseUrl);
}

function instrumentDatabase(database) {
  const stats = { count: 0, totalMs: 0, slowCount: 0 };
  const measure = (mode, sql, action) => {
    const started = performance.now();
    try {
      return action();
    } finally {
      const durationMs = performance.now() - started;
      stats.count++;
      stats.totalMs += durationMs;
      const requestStats = requestQueryStats.getStore();
      if (requestStats) {
        requestStats.count++;
        requestStats.totalMs += durationMs;
      }
      if (durationMs >= 200) {
        stats.slowCount++;
        if (requestStats) requestStats.slowCount++;
        process.stderr.write(`${JSON.stringify({ type: "slow_query", mode, durationMs: Number(durationMs.toFixed(1)), sql: String(sql).replace(/\s+/g, " ").slice(0, 240) })}\n`);
      }
    }
  };
  return {
    kind: database.kind,
    prepare(sql) {
      const statement = database.prepare(sql);
      return {
        get: (...params) => measure("get", sql, () => statement.get(...params)),
        all: (...params) => measure("all", sql, () => statement.all(...params)),
        run: (...params) => measure("run", sql, () => statement.run(...params))
      };
    },
    exec(sql) {
      return measure("exec", sql, () => database.exec(sql));
    },
    queryStats() {
      return { ...stats };
    },
    close() {
      return database.close?.();
    }
  };
}

class PostgresSyncDatabase {
  constructor(databaseUrl) {
    this.kind = "postgres";
    this.failure = null;
    this.requestCounter = 0;
    this.worker = new Worker(__filename, { workerData: { databaseUrl } });
    this.worker.on("error", error => { this.failure = error; });
    this.worker.unref();
  }

  prepare(sql) {
    return new PostgresStatement(this, sql);
  }

  _respawn() {
    try { this.worker.terminate(); } catch {}
    this.failure = null;
    this.requestCounter = 0;
    this.worker = new Worker(__filename, { workerData: { databaseUrl } });
    this.worker.on("error", error => { this.failure = error; });
    this.worker.unref();
  }

  exec(sql) {
    return this._request("exec", sql, []);
  }

  close() {
    return this.worker.terminate();
  }

  _request(mode, sql, params, retried = false) {
    const __qStart = Date.now();
    if (this.failure) {
      // 自愈：重建 worker 后重试一次，而不是永久 503
      if (!retried) {
        this._respawn();
        return this._request(mode, sql, params, true);
      }
      const error = new Error('数据库连接异常');
      error.status = 503;
      throw error;
    }
    const sab = new SharedArrayBuffer(4);
    const signal = new Int32Array(sab);
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}-${++this.requestCounter}`;
    const file = path.join(os.tmpdir(), `muc-pg-${id}.json`);
    this.worker.postMessage({ mode, sql, params, file, sab });
    if (Atomics.wait(signal, 0, 0, REQUEST_TIMEOUT_MS) === 'timed-out') {
      // Never reuse a connection with an unknown transaction outcome.
      try { process.stderr.write(JSON.stringify({type: 'db_request_timeout', mode, durationMs: Date.now() - __qStart, sql: String(sql).replace(/\s+/g, ' ').slice(0, 200)}) + '\n'); } catch {}
      this.failure = new Error('数据库查询超时');
      try { this.worker.terminate(); } catch {}
      fs.rmSync(file, { force: true });
      if (!retried) {
        this._respawn();
        return this._request(mode, sql, params, true);
      }
      const error = new Error('数据库查询超时，请稍后重试');
      error.status = 503;
      throw error;
    }
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); }
    finally { fs.rmSync(file, { force: true }); }
    const __qMs = Date.now() - __qStart;
    if (process.env.DEBUG_SLOW_QUERY && __qMs > 500) process.stderr.write(JSON.stringify({ type: "slow_pg_query", mode, durationMs: __qMs, sql: String(sql).replace(/\s+/g, " ").slice(0, 200) }) + "\n");
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
  if (databaseUrl) return instrumentDatabase(createPostgresDatabase(databaseUrl));
  return instrumentDatabase(sqliteDatabase(dbPath));
}

if (!isMainThread) {
  const { Client } = await import("pg");
  // 查询级客户端超时：即使服务端连接失联或协议异常，worker 也会在 12 秒内返回错误并唤醒
  // 主线程；主线程 15 秒兜底只用于 worker 自身失去响应的情况。
  const client = new Client({...postgresConnectionOptions(workerData.databaseUrl), query_timeout: 12000, connectionTimeoutMillis: 5000});
  client.on('error', error => {
   try { process.stderr.write(JSON.stringify({type: 'db_client_error', code: String(error?.code || ''), message: String(error?.message || error).slice(0, 200)}) + '\n'); } catch {}
  });
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
      await fsp.writeFile(file, JSON.stringify({ ok: true, result }), { flag: 'w', mode: 0o600 });
    } catch (error) {
      await fsp.writeFile(file, JSON.stringify({ ok: false, error: error.message, code: error.code }), { flag: 'w', mode: 0o600 });
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
    while (queue.length) {
      const message = queue.shift();
      try { await handle(message); }
      catch (error) {
        // handle 内部已写错误结果文件；此处兜底：写失败也要唤醒主线程，绝不让 drain 停摆
        try {
          const signal = new Int32Array(message.sab);
          await fsp.writeFile(message.file, JSON.stringify({ ok: false, error: String(error && error.message || error), code: 'WORKER_DRAIN' }), { flag: 'w', mode: 0o600 });
          Atomics.store(signal, 0, 1);
          Atomics.notify(signal, 0);
        } catch {}
      }
    }
    running = false;
  }
  parentPort.on("message", message => {
    queue.push(message);
    void drain();
  });
}
