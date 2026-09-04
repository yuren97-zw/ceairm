import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ceairm-test-"));
process.env.MUC_NO_LISTEN = "1";
process.env.DB_PATH = path.join(tempDir, "test.sqlite");
process.env.APP_VERSION = "test-version";
process.env.COS_SECRET_ID = "test-secret-id";
process.env.COS_SECRET_KEY = "test-secret-key";
process.env.COS_BUCKET = "test-bucket-1234567890";
process.env.COS_REGION = "ap-shanghai";

const { measuredRoute, parseRangeHeader, cosSignedUrl, attachmentDisposition, db } = await import("../server.mjs");

class MockResponse extends EventEmitter {
  headers = {};
  statusCode = 200;
  body = Buffer.alloc(0);
  writeHead(status, headers = {}) {
    this.statusCode = status;
    this.headers = headers;
    return this;
  }
  end(body = "") {
    this.body = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    this.emit("finish");
  }
}

async function request(url, { method = "GET", body, cookie = "" } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  req.headers = cookie ? { cookie, "content-type": "application/json" } : { "content-type": "application/json" };
  const res = new MockResponse();
  await measuredRoute(req, res);
  const payload = res.body.length ? JSON.parse(res.body.toString("utf8")) : null;
  return { res, payload };
}

test.after(async () => {
  await db.close?.();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("remarks validate permission, state and conflicts without changing business results", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const created = await request("/api/maintenance/flights", { method: "POST", cookie, body: { date: "2026-09-04", flightNo: "MUNOTE", aircraftNo: "BNOTE", workKind: "短停", remark: "导入备注" } });
  const id = created.payload.flight.id;
  const endpoint = `/api/maintenance/flights/${id}/remark`;
  const row = () => db.prepare("select * from maintenance_flights where id=?").get(id);
  const before = row();
  const save = (remark, originalRemark = row().remark || "") => request(endpoint, { method: "PUT", cookie, body: { remark, originalRemark } });
  assert.equal((await request(endpoint, { method: "PUT", body: { remark: "x", originalRemark: "" } })).res.statusCode, 401);
  assert.equal((await save("第一行\n<script>纯文本</script>")).res.statusCode, 200);
  const current = row();
  for (const key of Object.keys(before).filter(key => !["remark", "updated_by", "updated_at"].includes(key))) assert.equal(current[key], before[key]);
  assert.equal((await save("冲突内容", "导入备注")).res.statusCode, 409);
  assert.equal(row().remark, current.remark);
  assert.equal((await save("x".repeat(2001))).res.statusCode, 400);
  assert.equal((await request(endpoint, { method: "PUT", cookie, body: { remark: "x" } })).res.statusCode, 400);
  assert.equal((await save(42)).res.statusCode, 400);
  assert.equal((await save("")).res.statusCode, 200);
  assert.equal(row().remark, "");
  for (const status of ["已派工", "已提报"]) {
    db.prepare("update maintenance_flights set status=? where id=?").run(status, id);
    assert.equal((await save(status)).res.statusCode, 200);
  }
  for (const status of ["待复核", "已确认"]) {
    db.prepare("update maintenance_flights set status=? where id=?").run(status, id);
    assert.equal((await save("不得覆盖")).res.statusCode, 409);
    assert.equal(row().remark, "已提报");
  }
  db.prepare("update maintenance_flights set status='已提报',archived_at=? where id=?").run(new Date().toISOString(), id);
  assert.equal((await save("归档保护")).res.statusCode, 409);
  const logs = db.prepare("select * from audit_logs where target_id=? and action='maintenance_update_remark'").all(id);
  assert.equal(logs.length, 4);
  assert.equal(JSON.parse(logs[0].detail).before, "导入备注");
  const adminId = login.payload.user.id;
  db.prepare("update users set role='receiver' where id=?").run(adminId);
  try { assert.equal((await save("越权")).res.statusCode, 403); }
  finally { db.prepare("update users set role='admin' where id=?").run(adminId); }
});

test("range requests are parsed safely", () => {
  assert.deepEqual(parseRangeHeader("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(parseRangeHeader("bytes=-10", 100), { start: 90, end: 99 });
  assert.equal(parseRangeHeader("bytes=100-120", 100), null);
});

test("COS download signature includes response metadata", () => {
  const disposition = attachmentDisposition({ name: "维修 说明.txt", type: "text/plain" });
  assert.match(disposition, /^inline; filename\*=UTF-8''/);
  const url = new URL(cosSignedUrl("GET", "attachments/record/1/维修 说明.txt", 300, {
    "response-content-type": "text/plain; charset=utf-8",
    "response-content-disposition": disposition
  }));
  assert.equal(url.searchParams.get("response-content-type"), "text/plain; charset=utf-8");
  assert.match(url.searchParams.get("q-url-param-list") || "", /response-content-disposition/);
});

test("health endpoint reports version and protected APIs require login", async () => {
  const health = await request("/api/health");
  assert.equal(health.res.statusCode, 200);
  assert.equal(health.payload.ok, true);
  assert.equal(health.payload.version, "test-version");
  const maintenance = await request("/api/maintenance/flights?view=summary");
  assert.equal(maintenance.res.statusCode, 401);
});

test("maintenance summaries paginate and full details remain available", async () => {
  const login = await request("/api/login", {
    method: "POST",
    body: { username: "54002010", password: "muc2026" }
  });
  assert.equal(login.res.statusCode, 200);
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  assert.ok(cookie);
  const ids = [];
  for (const [flightNo, aircraftNo] of [["MU1001", "B1001"], ["MU1002", "B1002"]]) {
    const created = await request("/api/maintenance/flights", {
      method: "POST",
      cookie,
      body: {
        date: "2026-08-27",
        flightNo,
        aircraftNo,
        aircraftType: "A320",
        workKind: "短停",
        standardHours: 2
      }
    });
    assert.equal(created.res.statusCode, 201);
    ids.push(created.payload.flight.id);
  }
  const summary = await request("/api/maintenance/flights?scope=dispatch&view=summary&limit=1", { cookie });
  assert.equal(summary.res.statusCode, 200);
  assert.equal(summary.payload.flights.length, 1);
  assert.equal(summary.payload.flights[0].summary, true);
  assert.equal(summary.payload.nextCursor, "1");
  const detail = await request(`/api/maintenance/flights/${encodeURIComponent(ids[0])}?scope=dispatch`, { cookie });
  assert.equal(detail.res.statusCode, 200);
  assert.equal(detail.payload.flight.id, ids[0]);
  assert.equal(detail.payload.flight.summary, undefined);
});

test("flight import rejects shifted columns before inserting any rows and normalizes dates", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const valid = { date: "2026/9/1", flightNo: "MUIMPORT", aircraftNo: "BIMPORT", workKind: "短停" };
  const count = () => db.prepare("select count(*) as total from maintenance_flights").get().total;
  const before = count();
  for (const date of ["机号", "B6886", "2026-02-30", "2026-13-01", ""]) {
    const failed = await request("/api/maintenance/flights/import", {
      method: "POST", cookie, body: { rows: [valid, { ...valid, date, aircraftNo: "BINVALID" }] }
    });
    assert.equal(failed.res.statusCode, 400);
    assert.match(failed.payload.error, /第 2 条.*日期/);
    assert.equal(count(), before);
  }
  const imported = await request("/api/maintenance/flights/import", { method: "POST", cookie, body: { rows: [valid] } });
  assert.equal(imported.res.statusCode, 200);
  assert.equal(imported.payload.created, 1);
  const list = await request("/api/maintenance/flights?scope=dispatch&view=summary&dateFrom=2026-09-01&dateTo=2026-09-01", { cookie });
  assert.ok(list.payload.flights.some(flight => flight.aircraftNo === "BIMPORT" && flight.date === "2026-09-01"));
});

test("release-only report confirmation always waits for task-tree review", async () => {
  const login = await request("/api/login", {
    method: "POST",
    body: { username: "54002010", password: "muc2026" }
  });
  assert.equal(login.res.statusCode, 200);
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const user = login.payload.user;

  const created = await request("/api/maintenance/flights", {
    method: "POST",
    cookie,
    body: {
      date: "2026-09-01",
      flightNo: "MUREVIEW",
      aircraftNo: "BREVIEW",
      aircraftType: "A320",
      workKind: "停场",
      standardHours: 0
    }
  });
  assert.equal(created.res.statusCode, 201);
  const flightId = created.payload.flight.id;
  const assignmentId = `assignment-${flightId}`;
  const batchId = `batch-${flightId}`;
  const stamp = new Date().toISOString();

  db.prepare(`insert into maintenance_assignments(
      id,owner_type,owner_id,flight_id,user_id,user_name,team,role,status,feedback,
      assigned_by,assigned_at,received_at,started_at,completed_at,submitted_at,modified_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(assignmentId, "flight", flightId, flightId, user.id, user.name, user.team || "管理员", "放行", "已提报", "", user.id, stamp, stamp, stamp, stamp, stamp, stamp);
  db.prepare(`insert into maintenance_report_batches(
      id,flight_id,report_type,status,feedback,version,submitted_by,submitted_by_name,submitted_at,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(batchId, flightId, "release", "已提报", "", 1, user.id, user.name, stamp, stamp, stamp);
  db.prepare(`insert into maintenance_report_entries(
      id,batch_id,flight_id,owner_type,owner_id,role,user_id,user_name,team,standard_hours,source,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(`entry-${flightId}`, batchId, flightId, "flight", flightId, "放行", user.id, user.name, user.team || "管理员", 0, "放行架次", stamp, stamp);
  db.prepare(`insert into maintenance_sortie_results(
      id,owner_type,owner_id,flight_id,assignment_id,user_id,user_name,team,role,source,sorties,status,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(`sortie-${flightId}`, "flight", flightId, flightId, assignmentId, user.id, user.name, user.team || "管理员", "放行", "放行架次", 1, "已提报", stamp, stamp);
  db.prepare("update maintenance_flights set status='已提报',updated_by=?,updated_at=? where id=?").run(user.id, stamp, flightId);

  const finalized = await request(`/api/maintenance/flights/${encodeURIComponent(flightId)}/report-confirmation`, {
    method: "POST",
    cookie,
    body: {}
  });
  assert.equal(finalized.res.statusCode, 200);
  assert.equal(finalized.payload.flight.status, "待复核");
  assert.equal(finalized.payload.flight.archivedAt, "");
  assert.equal(db.prepare("select status from maintenance_assignments where id=?").get(assignmentId).status, "待复核");
  assert.equal(db.prepare("select status from maintenance_sortie_results where assignment_id=?").get(assignmentId).status, "待复核");
  assert.equal(db.prepare("select status from maintenance_report_batches where id=?").get(batchId).status, "待复核");
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_sortie_results where flight_id=?").get(flightId).total), 1);

  const reviewView = await request(`/api/maintenance/flights/${encodeURIComponent(flightId)}/review`, { cookie });
  assert.equal(reviewView.res.statusCode, 200);
  const reviewTasks = reviewView.payload.review.tasks.map(task => ({
    ownerType: task.ownerType,
    ownerId: task.ownerId,
    assignments: task.assignments.map(item => ({ userId: item.userId, role: item.role }))
  }));
  const endpoint = `/api/maintenance/flights/${encodeURIComponent(flightId)}/review`;
  const putReview = fields => request(endpoint, { method: "PUT", cookie, body: { mode: "save", tasks: reviewTasks, ...fields } });
  assert.equal(reviewView.payload.review.flight.routineElectronicSigned, null);
  assert.equal((await putReview({})).res.statusCode, 200);
  const missingSignature = await putReview({ mode: "confirm" });
  assert.equal(missingSignature.res.statusCode, 400);
  assert.match(missingSignature.payload.error, /请选择例行电签/);
  for (const value of [0, 1, "false", "true", {}, []]) {
    assert.equal((await putReview({ routineElectronicSigned: value })).res.statusCode, 400);
  }
  assert.equal(db.prepare("select routine_electronic_signed from maintenance_flights where id=?").get(flightId).routine_electronic_signed, null);
  assert.equal((await putReview({ routineElectronicSigned: false })).res.statusCode, 200);
  const preserved = await putReview({});
  assert.equal(preserved.payload.review.flight.routineElectronicSigned, false);
  const subId = `electronic-sub-${flightId}`;
  db.prepare("insert into maintenance_subtasks(id,flight_id,title,category,standard_hours,status,created_at,updated_at) values(?,?,?,?,?,?,?,?)").run(subId, flightId, "电签测试", "其他", 1, "待复核", stamp, stamp);
  const subTasks = [...reviewTasks, { ownerType: "subtask", ownerId: subId, assignments: [{ userId: user.id, role: "主作" }] }];
  const missingNonroutine = await putReview({ mode: "confirm", tasks: subTasks });
  assert.match(missingNonroutine.payload.error, /请选择非例行电签/);
  const selected = await putReview({ tasks: subTasks, nonroutineElectronicSigned: false });
  assert.equal(selected.res.statusCode, 200);
  assert.equal(selected.payload.review.flight.nonroutineElectronicSigned, false);
  db.prepare("update maintenance_subtasks set standard_hours=0 where id=?").run(subId);
  const blocked = await putReview({ mode: "confirm", tasks: subTasks, routineElectronicSigned: true });
  assert.equal(blocked.res.statusCode, 409);
  assert.equal(db.prepare("select routine_electronic_signed from maintenance_flights where id=?").get(flightId).routine_electronic_signed, 0);
  const deleted = await request(`/api/maintenance/subtasks/${subId}`, { method: "DELETE", cookie, body: { reason: "删除测试项目" } });
  assert.equal(deleted.res.statusCode, 200);
  assert.equal(db.prepare("select nonroutine_electronic_signed from maintenance_flights where id=?").get(flightId).nonroutine_electronic_signed, null);
  const confirmed = await request(`/api/maintenance/flights/${encodeURIComponent(flightId)}/review`, {
    method: "PUT",
    cookie,
    body: { mode: "confirm", tasks: reviewTasks }
  });
  assert.equal(confirmed.res.statusCode, 200);
  assert.equal(confirmed.payload.review.flight.status, "已确认");
  assert.equal(confirmed.payload.review.flight.routineElectronicSigned, false);
  assert.ok(confirmed.payload.review.flight.archivedAt);
  assert.equal(db.prepare("select status from maintenance_assignments where id=?").get(assignmentId).status, "已确认");
  assert.equal(db.prepare("select status from maintenance_sortie_results where assignment_id=?").get(assignmentId).status, "已确认");
  assert.equal(db.prepare("select status from maintenance_report_batches where id=?").get(batchId).status, "已确认");
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_sortie_results where flight_id=?").get(flightId).total), 1);
  db.prepare("update maintenance_flights set routine_electronic_signed=null where id=?").run(flightId);
  const historical = await putReview({ reason: "历史归档校验" });
  assert.equal(historical.res.statusCode, 200);
  assert.equal(historical.payload.review.flight.routineElectronicSigned, null);
  const signatureLogs = db.prepare("select detail from maintenance_logs where flight_id=?").all(flightId);
  assert.ok(signatureLogs.some(log => log.detail.includes('routineElectronicSigned')));
});

test("routine report without nonroutine work also waits for review", async () => {
  const login = await request("/api/login", {
    method: "POST",
    body: { username: "54002010", password: "muc2026" }
  });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const user = login.payload.user;
  const created = await request("/api/maintenance/flights", {
    method: "POST",
    cookie,
    body: { date: "2026-09-01", flightNo: "MURTN", aircraftNo: "BRTN", aircraftType: "A320", workKind: "短停", standardHours: 2 }
  });
  assert.equal(created.res.statusCode, 201);
  const flightId = created.payload.flight.id;
  const releaseAssignmentId = `release-${flightId}`;
  const routineAssignmentId = `routine-${flightId}`;
  const releaseBatchId = `release-batch-${flightId}`;
  const routineBatchId = `routine-batch-${flightId}`;
  const hourResultId = `hour-${flightId}`;
  const stamp = new Date().toISOString();
  const insertAssignment = db.prepare(`insert into maintenance_assignments(
      id,owner_type,owner_id,flight_id,user_id,user_name,team,role,status,feedback,
      assigned_by,assigned_at,received_at,started_at,completed_at,submitted_at,modified_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertAssignment.run(releaseAssignmentId, "flight", flightId, flightId, user.id, user.name, user.team || "管理员", "放行", "已提报", "", user.id, stamp, stamp, stamp, stamp, stamp, stamp);
  insertAssignment.run(routineAssignmentId, "flight", flightId, flightId, user.id, user.name, user.team || "管理员", "接机", "已提报", "", user.id, stamp, stamp, stamp, stamp, stamp, stamp);
  const insertBatch = db.prepare(`insert into maintenance_report_batches(
      id,flight_id,report_type,status,feedback,version,submitted_by,submitted_by_name,submitted_at,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?)`);
  insertBatch.run(releaseBatchId, flightId, "release", "已提报", "", 1, user.id, user.name, stamp, stamp, stamp);
  insertBatch.run(routineBatchId, flightId, "routine", "已提报", "", 1, user.id, user.name, stamp, stamp, stamp);
  const insertEntry = db.prepare(`insert into maintenance_report_entries(
      id,batch_id,flight_id,owner_type,owner_id,role,user_id,user_name,team,standard_hours,source,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertEntry.run(`release-entry-${flightId}`, releaseBatchId, flightId, "flight", flightId, "放行", user.id, user.name, user.team || "管理员", 0, "放行架次", stamp, stamp);
  insertEntry.run(`routine-entry-${flightId}`, routineBatchId, flightId, "flight", flightId, "接机", user.id, user.name, user.team || "管理员", 2, "维修机会", stamp, stamp);
  db.prepare(`insert into maintenance_sortie_results(
      id,owner_type,owner_id,flight_id,assignment_id,user_id,user_name,team,role,source,sorties,status,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(`sortie-${flightId}`, "flight", flightId, flightId, releaseAssignmentId, user.id, user.name, user.team || "管理员", "放行", "放行架次", 1, "已提报", stamp, stamp);
  db.prepare(`insert into maintenance_hour_results(
      id,owner_type,owner_id,flight_id,assignment_id,user_id,user_name,team,role,source,hours,status,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(hourResultId, "flight", flightId, flightId, routineAssignmentId, user.id, user.name, user.team || "管理员", "接机", "维修机会", 0.7, "已提报", stamp, stamp);
  db.prepare("update maintenance_flights set status='已提报',updated_by=?,updated_at=? where id=?").run(user.id, stamp, flightId);

  const finalized = await request(`/api/maintenance/flights/${encodeURIComponent(flightId)}/report-confirmation`, {
    method: "POST",
    cookie,
    body: { routineEntries: [{ role: "接机", userId: user.id }], feedback: "例行报工完成" }
  });
  assert.equal(finalized.res.statusCode, 200);
  assert.equal(finalized.payload.flight.status, "待复核");
  assert.equal(finalized.payload.flight.archivedAt, "");
  assert.equal(db.prepare("select status from maintenance_hour_results where id=?").get(hourResultId).status, "待复核");
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_hour_results where flight_id=?").get(flightId).total), 1);
  assert.equal(Number(db.prepare("select count(*) as total from maintenance_sortie_results where flight_id=?").get(flightId).total), 1);
});

test("both electronic signature choices may be false when confirming a complete tree", async () => {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const user = login.payload.user;
  const flight = db.prepare("select * from maintenance_flights where flight_no='MURTN'").get();
  const subId = `signature-${flight.id}`;
  const stamp = new Date().toISOString();
  db.prepare("insert into maintenance_subtasks(id,flight_id,title,category,standard_hours,status,created_at,updated_at) values(?,?,?,?,?,?,?,?)").run(subId, flight.id, "电签确认测试", "其他", 1, "待复核", stamp, stamp);
  const url = `/api/maintenance/flights/${flight.id}/review`;
  const tree = (await request(url, { cookie })).payload.review;
  const tasks = tree.tasks.map(task => ({ ownerType: task.ownerType, ownerId: task.ownerId, assignments: task.ownerType === "subtask" ? [{userId:user.id,role:"主作"}] : task.assignments.map(a=>({userId:a.userId,role:a.role})) }));
  const saved = await request(url, { method: "PUT", cookie, body: { mode: "save", tasks, routineElectronicSigned: false, nonroutineElectronicSigned: false } });
  assert.equal(saved.res.statusCode,200);
  const confirmed = await request(url, { method: "PUT", cookie, body: { mode: "confirm", tasks } });
  assert.equal(confirmed.res.statusCode,200);
  assert.equal(confirmed.payload.review.flight.status,"已确认");
  assert.equal(confirmed.payload.review.flight.routineElectronicSigned,false);
  assert.equal(confirmed.payload.review.flight.nonroutineElectronicSigned,false);
});

async function supplementalWorkFixture(name) {
  const login = await request("/api/login", { method: "POST", body: { username: "54002010", password: "muc2026" } });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const created = await request("/api/maintenance/flights", { method: "POST", cookie, body: { date: "2026-09-04", flightNo: name, aircraftNo: "BTEST", workKind: "停场" } });
  assert.equal(created.res.statusCode, 201);
  const id = created.payload.flight.id;
  const source = db.prepare("select id from maintenance_flights where flight_no='MUREVIEW'").get().id;
  const assignmentId = `supp-assignment-${id}`;
  const batchId = `supp-batch-${id}`;
  for (const table of ["maintenance_assignments", "maintenance_report_batches", "maintenance_report_entries", "maintenance_sortie_results"]) {
    const original = db.prepare(`select * from ${table} where flight_id=? limit 1`).get(source);
    const row = { ...original, id: table === "maintenance_assignments" ? assignmentId : table === "maintenance_report_batches" ? batchId : `${table}-${id}`, flight_id: id };
    if ("owner_id" in row) row.owner_id = id;
    if ("assignment_id" in row) row.assignment_id = assignmentId;
    if ("batch_id" in row) row.batch_id = batchId;
    if ("status" in row) row.status = "已提报";
    if ("confirmed_at" in row) row.confirmed_at = "";
    if ("confirmed_by" in row) row.confirmed_by = "";
    db.prepare(`insert into ${table}(${Object.keys(row).join(",")}) values(${Object.keys(row).map(() => "?").join(",")})`).run(...Object.values(row));
  }
  db.prepare("update maintenance_flights set status='已提报' where id=?").run(id);
  const item = title => ({ temporary: true, title, category: "其他", standardHours: 2, entries: [{ userId: login.payload.user.id, role: "主作" }] });
  const report = body => request(`/api/maintenance/flights/${id}/report-confirmation`, { method: "POST", cookie, body });
  const getReview = async () => (await request(`/api/maintenance/flights/${id}/review`, { cookie })).payload.review;
  const putReview = async fields => {
    const tree = await getReview();
    const tasks = tree.tasks.map(t => ({ ownerType: t.ownerType, ownerId: t.ownerId, assignments: t.assignments.map(a => ({ userId: a.userId, role: a.role })) }));
    return request(`/api/maintenance/flights/${id}/review`, { method: "PUT", cookie, body: { mode: "save", tasks, ...fields } });
  };
  return { id, cookie, user: login.payload.user, item, report, getReview, putReview };
}

test("report confirmation persists first nonroutine work and replacement of the last item atomically", async () => {
  const f = await supplementalWorkFixture("MUSUPPREPORT");
  const invalid = await f.report({ nonroutineItems: [{ ...f.item("invalid"), entries: [] }] });
  assert.equal(invalid.res.statusCode, 400);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_subtasks where flight_id=?").get(f.id).n), 0);
  assert.equal(db.prepare("select status from maintenance_flights where id=?").get(f.id).status, "已提报");
  const saved = await f.report({ mode: "save", nonroutineItems: [f.item("first")] });
  assert.equal(saved.res.statusCode, 200, JSON.stringify(saved.payload));
  const first = db.prepare("select * from maintenance_subtasks where flight_id=?").get(f.id);
  assert.equal(first.status, "已提报");
  assert.equal(Number(db.prepare("select count(*) n from maintenance_report_entries where flight_id=? and owner_type='subtask'").get(f.id).n), 1);
  const replacement = { deletedSubtaskIds: [first.id], nonroutineItems: [f.item("replacement")] };
  const rejected = await f.report({ ...replacement, nonroutineItems: [{ ...f.item("bad replacement"), standardHours: 0 }] });
  assert.equal(rejected.res.statusCode, 400);
  assert.ok(db.prepare("select id from maintenance_subtasks where id=?").get(first.id));
  const confirmed = await f.report(replacement);
  assert.equal(confirmed.res.statusCode, 200, JSON.stringify(confirmed.payload));
  assert.equal(confirmed.payload.flight.status, "待复核");
  const rows = db.prepare("select * from maintenance_subtasks where flight_id=?").all(f.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "replacement");
  for (const table of ["maintenance_assignments", "maintenance_hour_results", "maintenance_sortie_results", "maintenance_report_batches", "maintenance_subtasks"]) {
    assert.ok(db.prepare(`select status from ${table} where flight_id=?`).all(f.id).every(r => r.status === "待复核"));
  }
  assert.equal(Number(db.prepare("select count(*) n from maintenance_hour_results where flight_id=?").get(f.id).n), 1);
  assert.equal(Number(db.prepare("select count(*) n from maintenance_sortie_results where flight_id=?").get(f.id).n), 1);
  assert.notEqual((await f.report(replacement)).res.statusCode, 200);
});

test("pending review supplemental work validates reason and signatures then follows the normal review lifecycle", async () => {
  const f = await supplementalWorkFixture("MUSUPPREVIEW");
  const newSubtask = { title: "漏报已完成工作", category: "其他", standardHours: 2, assignments: [{ userId: f.user.id, role: "主作" }] };
  assert.equal((await f.putReview({ reason: "漏报", newSubtasks: [newSubtask] })).res.statusCode, 409);
  assert.equal((await f.report({})).res.statusCode, 200);
  const fields = { newSubtasks: [newSubtask] };
  assert.equal((await f.putReview(fields)).res.statusCode, 400);
  assert.equal((await f.putReview({ ...fields, reason: "复核发现漏项", mode: "confirm", routineElectronicSigned: false })).res.statusCode, 400);
  for (const change of [{ standardHours: 0.05 }, { category: "invalid" }, { assignments: [] }]) {
    assert.equal((await f.putReview({ reason: "漏报", newSubtasks: [{ ...newSubtask, ...change }] })).res.statusCode, 400);
  }
  assert.equal(Number(db.prepare("select count(*) n from maintenance_subtasks where flight_id=?").get(f.id).n), 0);
  const saved = await f.putReview({ ...fields, reason: "复核发现漏项", routineElectronicSigned: false });
  assert.equal(saved.res.statusCode, 200, JSON.stringify(saved.payload));
  assert.equal(saved.payload.review.flight.status, "待复核");
  assert.equal(saved.payload.review.flight.nonroutineElectronicSigned, null);
  const hour = db.prepare("select * from maintenance_hour_results where flight_id=?").get(f.id);
  assert.equal(hour.status, "待复核");
  assert.equal(hour.hours, 0.8);
  assert.equal(db.prepare("select status from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(f.id).status, "待复核");
  assert.equal(Number(db.prepare("select count(*) n from maintenance_report_entries where flight_id=? and owner_type='subtask'").get(f.id).n), 1);
  assert.equal((await f.putReview({ mode: "confirm" })).res.statusCode, 400);
  const final = await f.putReview({ mode: "confirm", nonroutineElectronicSigned: false });
  assert.equal(final.res.statusCode, 200, JSON.stringify(final.payload));
  assert.equal(final.payload.review.flight.status, "已确认");
  assert.ok(final.payload.review.flight.archivedAt);
  const finalHours = db.prepare("select * from maintenance_hour_results where flight_id=?").all(f.id);
  assert.equal(finalHours.length, 1);
  assert.equal(finalHours[0].id, hour.id);
  assert.equal(finalHours[0].status, "已确认");
  const archived = await f.putReview({ reason: "归档补录", newSubtasks: [{ ...newSubtask, title: "归档漏项" }] });
  assert.equal(archived.res.statusCode, 200, JSON.stringify(archived.payload));
  assert.equal(archived.payload.review.flight.status, "已确认");
  assert.equal(Number(db.prepare("select count(*) n from maintenance_hour_results where flight_id=? and status='已确认'").get(f.id).n), 2);
});

test("first temporary work may be finalized directly and pending supplements may be confirmed in one transaction", async () => {
  const f = await supplementalWorkFixture("MUSUPPDIRECT");
  const finalized = await f.report({ nonroutineItems: [f.item("放行确认新增")] });
  assert.equal(finalized.res.statusCode, 200, JSON.stringify(finalized.payload));
  assert.equal(finalized.payload.flight.status, "待复核");
  const original = db.prepare("select * from maintenance_hour_results where flight_id=?").get(f.id);
  const batch = db.prepare("select * from maintenance_report_batches where flight_id=? and report_type='nonroutine'").get(f.id);
  const confirmed = await f.putReview({
    mode: "confirm", reason: "复核补充遗漏工作", routineElectronicSigned: false, nonroutineElectronicSigned: false,
    newSubtasks: [{ title: "复核新增", category: "其他", standardHours: 3, assignments: [{ userId: f.user.id, role: "检验" }] }]
  });
  assert.equal(confirmed.res.statusCode, 200, JSON.stringify(confirmed.payload));
  const rows = db.prepare("select * from maintenance_hour_results where flight_id=?").all(f.id);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.status === "已确认"));
  assert.equal(rows.find(row => row.id === original.id).hours, original.hours);
  const afterBatch = db.prepare("select * from maintenance_report_batches where id=?").get(batch.id);
  assert.equal(afterBatch.submitted_by, batch.submitted_by);
  assert.equal(afterBatch.submitted_at, batch.submitted_at);
  assert.equal(afterBatch.status, "已确认");
  assert.equal(Number(db.prepare("select count(*) n from maintenance_report_entries where batch_id=?").get(batch.id).n), 2);
});

test("personal hour details expose a stable flight id for display grouping", async () => {
  const login = await request("/api/login", {
    method: "POST",
    body: { username: "54002010", password: "muc2026" }
  });
  const cookie = String(login.res.headers["Set-Cookie"] || login.res.headers["set-cookie"] || "").split(";")[0];
  const user = login.payload.user;
  const created = await request("/api/maintenance/flights", {
    method: "POST",
    cookie,
    body: { date: "2026-09-02", flightNo: "MUGROUP", aircraftNo: "BGROUP", aircraftType: "A320", workKind: "短停", standardHours: 2 }
  });
  assert.equal(created.res.statusCode, 201);
  const flightId = created.payload.flight.id;
  const stamp = new Date().toISOString();
  const insertHour = db.prepare(`insert into maintenance_hour_results(
      id,owner_type,owner_id,flight_id,assignment_id,user_id,user_name,team,role,source,hours,status,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertHour.run(`group-receive-${flightId}`, "flight", flightId, flightId, `group-receive-assignment-${flightId}`, user.id, user.name, user.team || "管理员", "接机", "维修机会", 0.7, "已提报", stamp, stamp);
  insertHour.run(`group-check-${flightId}`, "flight", flightId, flightId, `group-check-assignment-${flightId}`, user.id, user.name, user.team || "管理员", "例行检查", "维修机会", 0.6, "已提报", stamp, stamp);

  const details = await request("/api/maintenance/stats/personal/details?month=2026-09&period=month&type=all&status=pending", { cookie });
  assert.equal(details.res.statusCode, 200);
  const groupedRows = details.payload.rows.filter(row => row.flightId === flightId);
  assert.equal(groupedRows.length, 2);
  assert.deepEqual(groupedRows.map(row => row.role).sort(), ["例行检查", "接机"].sort());
  assert.equal(Number(groupedRows.reduce((sum, row) => sum + row.hours, 0).toFixed(2)), 1.3);
});
