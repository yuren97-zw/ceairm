import { AsyncLocalStorage } from "node:async_hooks";
import { Worker, isMainThread, parentPort, workerData, MessageChannel, receiveMessageOnPort } from "node:worker_threads";
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
    this.databaseUrl = databaseUrl;
    this.failure = null;
    this.requestCounter = 0;
    this.workerGeneration = 0;
    this.worker = this._createWorker();
  }

  _createWorker() {
    const generation = ++this.workerGeneration;
    const worker = new Worker(__filename, { workerData: { databaseUrl: this.databaseUrl } });
    // 旧 worker 被 terminate 后仍可能触发 error/exit；代际检查避免它把新 worker 标记为失败。
    worker.on("error", error => {
      if (generation !== this.workerGeneration) return;
      this.failure = error;
      try { process.stderr.write(JSON.stringify({type: 'db_worker_error', message: String(error?.message || error).slice(0, 200)}) + '\n'); } catch {}
    });
    worker.on("exit", code => {
      if (generation === this.workerGeneration && !this.failure && code !== 0) this.failure = new Error('数据库工作线程退出');
    });
    worker.unref();
    return worker;
  }

  prepare(sql) {
    return new PostgresStatement(this, sql);
  }

  _respawn() {
    try { this.worker.terminate(); } catch {}
    this.failure = null;
    this.requestCounter = 0;
    this.worker = this._createWorker();
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
    // 结果通过 MessageChannel 直接回传，不再为每条查询写/读一个临时 JSON 文件。
    // 旧实现每条查询都做一次文件写入 + 读取 + 删除（生产一次页面数百次），既拖慢
    // 每条查询，也会在磁盘/线程池抖动时把 worker 卡在 writeFile 上。
    const { port1, port2 } = new MessageChannel();
    const rid = ++this.requestCounter;
    const trace = process.env.DEBUG_PG_TRACE === '1';
    const label = String(sql).replace(/\s+/g, ' ').slice(0, 140);
    if (trace) { try { process.stderr.write(JSON.stringify({type: 'db_main_trace', phase: 'post', rid, mode, sql: label}) + '\n'); } catch {} }
    try {
      this.worker.postMessage({ mode, sql, params, sab, port: port1, rid }, [port1]);
    } catch (error) {
      try { port2.close(); } catch {}
      this.failure = error;
      if (!retried) {
        this._respawn();
        return this._request(mode, sql, params, true);
      }
      const failure = new Error('数据库工作线程不可用');
      failure.status = 503;
      throw failure;
    }
    if (Atomics.wait(signal, 0, 0, REQUEST_TIMEOUT_MS) === 'timed-out') {
      // Never reuse a connection with an unknown transaction outcome.
      try { port2.close(); } catch {}
      try { process.stderr.write(JSON.stringify({type: 'db_request_timeout', mode, durationMs: Date.now() - __qStart, sql: String(sql).replace(/\s+/g, ' ').slice(0, 200)}) + '\n'); } catch {}
      this.failure = new Error('数据库查询超时');
      try { this.worker.terminate(); } catch {}
      const retryable = mode === 'get' || mode === 'all' || /^\s*pragma\s/i.test(String(sql));
      if (!retried && retryable) {
        this._respawn();
        return this._request(mode, sql, params, true);
      }
      const error = new Error('数据库查询超时，请稍后重试');
      error.status = 503;
      throw error;
    }
    if (trace) { try { process.stderr.write(JSON.stringify({type: 'db_main_trace', phase: 'woke', rid, durationMs: Date.now() - __qStart}) + '\n'); } catch {} }
    const received = receiveMessageOnPort(port2);
    try { port2.close(); } catch {}
    if (!received?.message) {
      this.failure = new Error('数据库结果未返回');
      try { this.worker.terminate(); } catch {}
      const error = new Error('数据库结果未返回，请稍后重试');
      error.status = 503;
      throw error;
    }
    const payload = received.message;
    const __qMs = Date.now() - __qStart;
    if (process.env.DEBUG_SLOW_QUERY && __qMs > 500) process.stderr.write(JSON.stringify({ type: "slow_pg_query", mode, durationMs: __qMs, sql: String(sql).replace(/\s+/g, " ").slice(0, 200) }) + "\n");
    if (!payload.ok) {
      const error = new Error(payload.error || "PostgreSQL query failed");
      error.code = payload.code;
      if (payload.code === 'QUERY_TIMEOUT' || payload.code === 'WORKER_RESTART') {
        // 查询可能在服务端已执行但结果丢失；不自动重试写操作，交由上层 503 处理。
        this.failure = new Error('数据库查询超时');
        try { this.worker.terminate(); } catch {}
      }
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
  // worker 内查询超时：8 秒内必须回传结果或错误，确保主线程最多冻结 8 秒而不是 15 秒；
  // 主线程 15 秒兜底只用于 worker 自身失去响应。超时后关闭连接（回滚未提交事务），
  // 主线程收到 QUERY_TIMEOUT 后重建 worker，避免在未知事务状态上继续复用连接。
  const QUERY_TIMEOUT_MS = 8000;
  let dead = false;
  const client = new Client({...postgresConnectionOptions(workerData.databaseUrl), query_timeout: 9000, connectionTimeoutMillis: 5000});
  client.on('error', error => {
   try { process.stderr.write(JSON.stringify({type: 'db_client_error', code: String(error?.code || ''), message: String(error?.message || error).slice(0, 200)}) + '\n'); } catch {}
  });
  await client.connect();

  async function runQuery(text, params) {
    if (dead) throw Object.assign(new Error('数据库连接已失效'), { code: 'WORKER_RESTART' });
    let timer;
    try {
      return await Promise.race([
        client.query(text, params),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(Object.assign(new Error('数据库查询超时'), { code: 'QUERY_TIMEOUT' }));
          }, QUERY_TIMEOUT_MS);
          timer.unref?.();
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function tableInfo(table) {
    const result = await runQuery(
      `select column_name as name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,
      [table]
    );
    return result.rows;
  }

  async function handle(message) {
    const { mode, sql, params, sab, port, rid } = message;
    const signal = new Int32Array(sab);
    const trace = process.env.DEBUG_PG_TRACE === '1';
    const label = String(sql).replace(/\s+/g, ' ').slice(0, 140);
    if (trace) { try { process.stderr.write(JSON.stringify({type: 'pg_trace', phase: 'start', rid, mode, sql: label}) + '\n'); } catch {} }
    try {
      let result;
      const pragma = String(sql).trim().match(/^pragma\s+table_info\(([^)]+)\)/i);
      if (pragma) {
        result = await tableInfo(pragma[1].replace(/["'`]/g, ""));
      } else if (mode === "exec") {
        await runQuery(translateSql(sql));
        result = undefined;
      } else {
        const query = translateSql(sql);
        const response = await runQuery(query, params);
        if (mode === "get") result = response.rows[0];
        else if (mode === "all") result = response.rows;
        else result = { changes: response.rowCount || 0 };
      }
      if (trace) { try { process.stderr.write(JSON.stringify({type: 'pg_trace', phase: 'query_done', rid, mode, sql: label}) + '\n'); } catch {} }
      port.postMessage({ ok: true, result });
      if (trace) { try { process.stderr.write(JSON.stringify({type: 'pg_trace', phase: 'posted', rid, mode, sql: label}) + '\n'); } catch {} }
    } catch (error) {
      const code = error && error.code;
      if (code === 'QUERY_TIMEOUT' || code === 'WORKER_RESTART') {
        dead = true;
        try { client.end().catch(() => {}); } catch {}
      }
      try { port.postMessage({ ok: false, error: error && error.message || String(error), code }); } catch {}
    } finally {
      if (trace) { try { process.stderr.write(JSON.stringify({type: 'pg_trace', phase: 'notify', rid, mode, sql: label}) + '\n'); } catch {} }
      Atomics.store(signal, 0, 1);
      Atomics.notify(signal, 0);
      try { port.close(); } catch {}
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
        // handle 内部已回传错误；此处兜底：任何异常也必须唤醒主线程，绝不让 drain 停摆。
        try {
          const signal = new Int32Array(message.sab);
          try { message.port?.postMessage({ ok: false, error: String(error && error.message || error), code: 'WORKER_DRAIN' }); } catch {}
          Atomics.store(signal, 0, 1);
          Atomics.notify(signal, 0);
        } catch {}
      }
    }
    running = false;
  }
  parentPort.on("message", message => {
    if (process.env.DEBUG_PG_TRACE === '1') { try { process.stderr.write(JSON.stringify({type: 'pg_trace', phase: 'received', rid: message.rid, queue: queue.length}) + '\n'); } catch {} }
    queue.push(message);
    void drain();
  });
}
