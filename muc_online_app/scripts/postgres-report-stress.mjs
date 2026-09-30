// Replay the retained 20-person fixture only in an explicitly named local test DB.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { performance } from "node:perf_hooks";

const url = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
assert.equal(url.hostname, "127.0.0.1", "stress test requires loopback PostgreSQL");
assert.match(url.pathname, /^\/muc_security_stress_/, "stress test requires its own cloned database");
assert.equal(process.env.MUC_NO_LISTEN, "1", "stress test must not start a listener");
assert.ok(process.env.STRESS_TEST_PASSWORD, "STRESS_TEST_PASSWORD is required");

const { measuredRoute, db } = await import("../server.mjs");
class Response extends EventEmitter {
  statusCode = 200;
  headers = {};
  body = "";
  writeHead(status, headers = {}) { this.statusCode = status; this.headers = headers; return this; }
  end(body = "") { this.body = String(body); this.emit("finish"); }
}
async function request(path, body, cookie = "", method = "POST") {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = path;
  req.headers = { host: "127.0.0.1:18889", origin: "http://127.0.0.1:18889", "content-type": "application/json", ...(cookie ? { cookie } : {}) };
  const res = new Response();
  const start = performance.now();
  await measuredRoute(req, res);
  let payload;
  try { payload = JSON.parse(res.body); } catch { payload = {}; }
  return { status: res.statusCode, payload, cookie: String(res.headers["Set-Cookie"] || "").split(";")[0], requestId: res.headers["X-Request-Id"], timing: res.headers["Server-Timing"], durationMs: Number((performance.now() - start).toFixed(1)) };
}
function insertRow(table, row) {
  const columns = Object.keys(row);
  db.prepare(`insert into ${table}(${columns.join(",")}) values(${columns.map(() => "?").join(",")})`).run(...columns.map(column => row[column]));
}
const workers = [];
for (let i = 0; i < 20; i++) {
  const login = await request("/api/login", { username: `audit-worker-${i}`, password: process.env.STRESS_TEST_PASSWORD });
  assert.equal(login.status, 200, `worker ${i} login failed`);
  workers.push({ ...login, personId: login.payload.user.personId });
}
const rounds = Number(process.env.STRESS_ROUNDS || 5);
const runId = String(process.env.STRESS_RUN_ID || Date.now());
const results = [];
for (let round = 0; round < rounds; round++) {
  const flights = [];
  for (let i = 0; i < 20; i++) {
    const source = db.prepare("select * from maintenance_flights where flight_no=?").get(`AUD-LOAD-${i}`);
    assert.ok(source, `missing fixture flight ${i}`);
    const id = `security-stress-${runId}-${round}-${i}`;
    insertRow("maintenance_flights", { ...source, id, flight_no: `SEC-STRESS-${runId}-${round}-${i}`, status: "已派工" });
    const assignments = db.prepare("select * from maintenance_assignments where flight_id=?").all(source.id);
    assert.ok(assignments.length >= 2, `missing assignments for ${i}`);
    assignments.forEach((assignment, index) => insertRow("maintenance_assignments", {
      ...assignment, id: `security-stress-assignment-${runId}-${round}-${i}-${index}`,
      owner_id: id, flight_id: id, status: "已派工"
    }));
    flights.push(id);
  }
  const batch = await Promise.all(flights.map((flightId, i) => request(
    `/api/maintenance/flights/${flightId}/reports/routine`,
    { entries: [{ role: "接机", personId: workers[i].personId }], feedback: "isolated concurrency replay" },
    workers[i].cookie, "PUT"
  )));
  for (let i = 0; i < batch.length; i++) {
    const count = Number(db.prepare("select count(*) as n from maintenance_report_batches where flight_id=? and report_type='routine'").get(flights[i]).n);
    results.push({ round, worker: i, status: batch[i].status, error: batch[i].payload.error || "", requestId: batch[i].requestId, timing: batch[i].timing, durationMs: batch[i].durationMs, batches: count });
  }
  console.log(JSON.stringify({ round, ok: batch.filter((item, i) => item.status === 200 && results.at(round * 20 + i).batches === 1).length, total: 20, maxMs: Math.max(...batch.map(item => item.durationMs)) }));
}
const failures = results.filter(item => item.status !== 200 || item.batches !== 1);
console.log(JSON.stringify({ total: results.length, failures, maxMs: Math.max(...results.map(item => item.durationMs)) }));
if (process.env.STRESS_SAME_FLIGHT === "1") {
  const source = db.prepare("select * from maintenance_flights where flight_no='AUD-LOAD-0'").get();
  const id = `security-race-${runId}`;
  insertRow("maintenance_flights", { ...source, id, flight_no: `SEC-RACE-${runId}`, status: "已派工" });
  db.prepare("select * from maintenance_assignments where flight_id=?").all(source.id)
    .forEach((assignment, index) => insertRow("maintenance_assignments", {
      ...assignment, id: `security-race-assignment-${runId}-${index}`,
      owner_id: id, flight_id: id, status: "已派工"
    }));
  const pair = await Promise.all([0, 1].map(() => request(
    `/api/maintenance/flights/${id}/reports/routine`,
    { entries: [{ role: "接机", personId: workers[0].personId }], feedback: "isolated same-flight race" },
    workers[0].cookie, "PUT"
  )));
  const count = Number(db.prepare("select count(*) as n from maintenance_report_batches where flight_id=? and report_type='routine'").get(id).n);
  const outcome = { sameFlight: true, statuses: pair.map(item => item.status), requestIds: pair.map(item => item.requestId),
    timings: pair.map(item => item.timing), durationsMs: pair.map(item => item.durationMs), batches: count };
  console.log(JSON.stringify(outcome));
  if (pair.filter(item => item.status === 200).length !== 1 || count !== 1 || pair.some(item => item.status >= 500)) process.exitCode = 1;
}
await db.close?.();
if (failures.length) process.exitCode = 1;
