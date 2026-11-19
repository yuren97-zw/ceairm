import crypto from "node:crypto";
import { nonroutineImportText } from "./maintenance-import-preview.mjs";

export const NONROUTINE_IMPORT_SCHEMA = `-- Technical import provenance. No report, assignment or effective hours are created.
create table if not exists maintenance_subtask_import_batches(
  id text primary key,
  created_by text not null,
  filename text not null,
  file_sha256 text not null,
  sheet_name text not null,
  revision integer not null default 1,
  status text not null default 'PREVIEW',
  created_at text not null,
  updated_at text not null
);
create table if not exists maintenance_subtask_import_rows(
  batch_id text not null references maintenance_subtask_import_batches(id),
  row_number integer not null,
  original_json text not null,
  preview_json text not null,
  decision_json text not null default '{}',
  receipt_json text,
  updated_at text not null,
  primary key(batch_id,row_number)
);
create table if not exists maintenance_nonroutine_import_sources(
  fingerprint text primary key,
  flight_id text not null,
  client_id text not null,
  subtask_id text,
  first_batch_id text not null,
  row_number integer not null,
  original_json text not null,
  standard_snapshot_json text,
  state text not null check(state in ('ACTIVE','DELETED','SUBMITTED')),
  created_by text not null,
  created_at text not null,
  updated_at text not null,
  unique(flight_id,client_id),
  foreign key(first_batch_id,row_number) references maintenance_subtask_import_rows(batch_id,row_number)
);
create index if not exists maintenance_import_batch_owner on maintenance_subtask_import_batches(created_by,created_at);
create index if not exists maintenance_import_source_flight on maintenance_nonroutine_import_sources(flight_id,state);
create table if not exists maintenance_subtask_import_attempts(
  batch_id text not null references maintenance_subtask_import_batches(id),
  request_id text not null,
  payload_digest text not null,
  result_json text not null,
  created_at text not null,
  primary key(batch_id,request_id)
);
`;

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function nonroutineSourceFingerprint(batch, row, flightId) {
  const item = nonroutineImportText(row);
  const fields = [item.category, item.chapter, item.title, item.reportExplanation, item.standardId, String(item.standardVersion ?? "")]
    .map(value => value.normalize("NFKC").trim().replace(/\s+/g, " "));
  return crypto.createHash("sha256").update(JSON.stringify([
    batch.file_sha256, batch.sheet_name, row.rowNumber, flightId, fields
  ])).digest("hex");
}

export function createNonroutineImportBatches({ db, transaction, preview, matchStandard, appendDraft, log, clock, randomId }) {
  function load(id, user) {
    const batch = db.prepare("select * from maintenance_subtask_import_batches where id=? and created_by=?").get(id, user.id);
    if (!batch) throw fail("未找到可访问的导入批次", 404);
    const rows = db.prepare("select * from maintenance_subtask_import_rows where batch_id=? order by row_number").all(id);
    return { batch, rows };
  }

  function current(batch, rows, user) {
    const originals = rows.map(row => JSON.parse(row.original_json));
    const decisions = rows.map(row => JSON.parse(row.decision_json));
    const inputs = originals.map((row, index) => {
      const decision = decisions[index];
      const target = JSON.parse(rows[index].preview_json).flightId;
      const original = decision.resetStandardChoice ? { ...row, standardId: "", standardVersion: undefined } : row;
      const pinned = target ? { ...original, flightId: target } : original;
      return decision.standardId ? { ...pinned, standardId: decision.standardId, standardVersion: decision.standardVersion } : pinned;
    });
    const excludedRows = originals.filter((row, index) => decisions[index].skip).map(row => row.rowNumber);
    const result = preview({ rows: inputs }, user, { excludedRows, includeLockedSources: true });
    result.results.forEach((row, index) => {
      if (!row.flightId) return;
      const fingerprint = nonroutineSourceFingerprint(batch, originals[index], row.flightId);
      const source = db.prepare("select * from maintenance_nonroutine_import_sources where fingerprint=? and flight_id=?").get(fingerprint, row.flightId);
      row.sourceFingerprint = fingerprint;
      row.decision = decisions[index];
      row.matchDigest = crypto.createHash("sha256").update(JSON.stringify({ match: row.match, duplicates: row.duplicates })).digest("hex");
      if (source) {
        row.status = source.state === "ACTIVE" ? "ALREADY_IMPORTED" : source.state;
        row.clientId = source.client_id;
        row.subtaskId = source.subtask_id || null;
      } else if (decisions[index].skip) row.status = "SKIPPED";
      row.canResetStandardChoice = Boolean(!source && !row.importLocked && row.match?.status === "BLOCKED" && (row.decision.standardId || row.item?.standardId));
    });
    const count = status => result.results.filter(row => row.status === status).length;
    result.summary = {
      total: result.results.length,
      readyStandards: count("READY_STANDARD"), readyDrafts: count("READY_NEW_DRAFT"),
      needsSelection: count("NEEDS_SELECTION"), possibleDuplicates: count("POSSIBLE_DUPLICATE"), blocked: count("BLOCKED"),
      alreadyImported: count("ALREADY_IMPORTED"), deleted: count("DELETED"), submitted: count("SUBMITTED"), skipped: count("SKIPPED"),
      ready: count("READY_STANDARD") + count("READY_NEW_DRAFT")
    };
    return result;
  }

  function view(id, user) {
    const { batch, rows } = load(id, user);
    return {
      batchId: batch.id, revision: Number(batch.revision), status: batch.status,
      filename: batch.filename, fileSha256: batch.file_sha256, sheetName: batch.sheet_name,
      ...current(batch, rows, user)
    };
  }

  function create(file, user) {
    return transaction(() => {
      if (new Set(file.rows.map(row => row.rowNumber)).size !== file.rows.length) throw fail("来源行号重复");
      const result = preview({ rows: file.rows }, user);
      const id = randomId("mtnimp");
      const stamp = clock();
      db.prepare(`insert into maintenance_subtask_import_batches(id,created_by,filename,file_sha256,sheet_name,revision,status,created_at,updated_at)
        values(?,?,?,?,?,1,'PREVIEW',?,?)`).run(id, user.id, file.filename, file.fileSha256, file.sheetName, stamp, stamp);
      const insert = db.prepare(`insert into maintenance_subtask_import_rows(batch_id,row_number,original_json,preview_json,decision_json,updated_at)
        values(?,?,?,?,?,?)`);
      file.rows.forEach((row, index) => insert.run(id, row.rowNumber, JSON.stringify(row), JSON.stringify(result.results[index]), "{}", stamp));
      log(user, "nonroutine_import_preview", id, { fileSha256: file.fileSha256, sheetName: file.sheetName, rows: file.rows.length });
      return view(id, user);
    });
  }

  function decide(id, rowNumber, payload, user) {
    return transaction(() => {
      const { batch, rows } = load(id, user);
      if (!["PREVIEW", "PARTIAL"].includes(batch.status)) throw fail("该批次已提交，请重新预览", 409);
      if (Number(payload?.revision) !== Number(batch.revision)) throw fail("导入批次已更新，请刷新后重试", 409);
      const index = rows.findIndex(row => Number(row.row_number) === rowNumber);
      if (index < 0) throw fail("未找到导入行", 404);
      const fresh = current(batch, rows, user).results[index];
      if (payload.resetStandardChoice !== undefined && typeof payload.resetStandardChoice !== "boolean") throw fail("标准重新匹配选项格式无效");
      const reset = payload.resetStandardChoice === true;
      if (!fresh.flightId || fresh.status === "BLOCKED" && !(reset && fresh.canResetStandardChoice) || ["ALREADY_IMPORTED", "DELETED", "SUBMITTED"].includes(fresh.status)) throw fail("当前行已锁定或不可操作，请重新核对", 409);
      if (reset) {
        if (!fresh.canResetStandardChoice || payload.standardId || payload.skip !== undefined || payload.distinctWorkReason !== undefined) throw fail("请单独重新匹配失效的标准选择", 409);
        const original = JSON.parse(rows[index].original_json);
        const reopened = preview({ rows: [{ ...original, standardId: "", standardVersion: undefined, flightId: fresh.flightId }] }, user).results[0];
        if (reopened.flightId !== fresh.flightId || reopened.status === "BLOCKED") throw fail("当前维修机会已锁定、不可访问或标准不可用，请重新核对", 409);
      }
      if (payload.skip !== undefined && typeof payload.skip !== "boolean") throw fail("跳过选项格式无效");
      const decision = { skip: payload.skip === true, decidedBy: user.id, decidedAt: clock(), ...(reset || JSON.parse(rows[index].decision_json).resetStandardChoice ? { resetStandardChoice: true } : {}) };
      if (payload.standardId) {
        const original = JSON.parse(rows[index].original_json);
        const unselected = preview({ rows: [{ ...original, standardId: "", standardVersion: undefined, flightId: fresh.flightId }] }, user).results[0];
        const selected = matchStandard({ standardId: String(payload.standardId), standardVersion: payload.standardVersion }, fresh.aircraftCode);
        if (selected.status !== "MATCHED") throw fail("标准版本失效或机型不适用，请重新选择", 409);
        if (!unselected.match?.candidates.some(candidate => candidate.id === selected.standard.id && candidate.version === selected.standard.version)) {
          throw fail("所选标准不属于本行当前候选，请重新核对", 409);
        }
        decision.standardId = selected.standard.id;
        decision.standardVersion = selected.standard.version;
      }
      if (payload.distinctWorkReason !== undefined) {
        const reason = String(payload.distinctWorkReason).trim();
        if (!reason || reason.length > 1000) throw fail("请填写不超过1000字的不同工作依据");
        decision.distinctWorkReason = reason;
        decision.comparedWork = fresh.duplicates;
      }
      const stamp = clock();
      db.prepare("update maintenance_subtask_import_rows set decision_json=?,updated_at=? where batch_id=? and row_number=?")
        .run(JSON.stringify(decision), stamp, id, rowNumber);
      db.prepare("update maintenance_subtask_import_batches set revision=revision+1,updated_at=? where id=?").run(stamp, id);
      log(user, "nonroutine_import_decision", id, { rowNumber, before: JSON.parse(rows[index].decision_json), decision });
      return view(id, user);
    });
  }

  function commit(id, payload, user) {
    if (!/^[A-Za-z0-9_.-]{1,120}$/.test(String(payload?.requestId || ""))) throw fail("导入请求标识无效");
    if (!Array.isArray(payload.rows) || !payload.rows.length || payload.rows.length > 1000) throw fail("请选择1至1000行工作");
    const selected = payload.rows.map(row => {
      if (!row || !Number.isInteger(row.rowNumber) || row.rowNumber < 1) throw fail("所选行号无效");
      return { rowNumber: row.rowNumber, flightId: row.flightId, expectedUpdatedAt: row.expectedUpdatedAt, draftVersion: row.draftVersion, matchDigest: row.matchDigest };
    }).sort((left, right) => left.rowNumber - right.rowNumber);
    if (new Set(selected.map(row => row.rowNumber)).size !== selected.length) throw fail("所选行号重复");
    const digest = crypto.createHash("sha256").update(JSON.stringify({ revision: payload.revision, rows: selected })).digest("hex");
    return transaction(() => {
      const { batch, rows } = load(id, user);
      const fresh = current(batch, rows, user);
      const byNumber = new Map(fresh.results.map(row => [row.rowNumber, row]));
      if (selected.some(row => !byNumber.has(row.rowNumber))) throw fail("所选行不属于该批次");
      const previous = db.prepare("select * from maintenance_subtask_import_attempts where batch_id=? and request_id=?").get(id, payload.requestId);
      if (previous) {
        if (previous.payload_digest !== digest) throw fail("相同请求标识不能用于不同导入内容", 409);
        const replay = JSON.parse(previous.result_json);
        replay.replayed = true;
        replay.revision = Number(batch.revision);
        replay.results = replay.results.map(receipt => {
          const now = byNumber.get(receipt.rowNumber);
          if (!now?.flightId || receipt.flightId && receipt.flightId !== now.flightId) return { rowNumber: receipt.rowNumber, status: "BLOCKED", reason: now?.reason || "当前范围不可访问或维修机会已变化" };
          if (["DELETED", "SUBMITTED"].includes(now.status)) return { rowNumber: now.rowNumber, status: now.status, clientId: now.clientId, subtaskId: now.subtaskId };
          if (now.status === "ALREADY_IMPORTED" && receipt.status !== "SUCCESS") return { rowNumber: now.rowNumber, status: now.status, clientId: now.clientId, subtaskId: now.subtaskId };
          return receipt;
        });
        replay.summary = receiptSummary(replay.results);
        return replay;
      }
      if (Number(payload.revision) !== Number(batch.revision)) throw fail("导入批次已更新，请刷新后重试", 409);
      const expected = new Map(selected.map(row => [row.rowNumber, row]));
      const groups = new Map();
      const receipts = new Map();
      for (const row of fresh.results) {
        if (!expected.has(row.rowNumber)) continue;
        if (["ALREADY_IMPORTED", "DELETED", "SUBMITTED", "SKIPPED"].includes(row.status)) {
          receipts.set(row.rowNumber, { rowNumber: row.rowNumber, status: row.status, clientId: row.clientId, subtaskId: row.subtaskId });
          continue;
        }
        const distinct = row.status === "POSSIBLE_DUPLICATE" && row.decision?.distinctWorkReason &&
          JSON.stringify(row.decision.comparedWork) === JSON.stringify(row.duplicates);
        if (!row.flightId || row.status === "BLOCKED" || row.match?.status === "NEEDS_SELECTION" || row.status === "POSSIBLE_DUPLICATE" && !distinct) {
          receipts.set(row.rowNumber, { rowNumber: row.rowNumber, status: "NEEDS_REVIEW", reason: row.reason || row.match?.reason || "请处理候选、重复项或维修机会异常" });
          continue;
        }
        if (!groups.has(row.flightId)) groups.set(row.flightId, []);
        groups.get(row.flightId).push(row);
      }
      let groupIndex = 0;
      for (const [flightId, group] of groups) {
        const savepoint = `maintenance_import_${groupIndex++}`;
        db.exec(`savepoint ${savepoint}`);
        try {
          for (const row of group) {
            const target = expected.get(row.rowNumber);
            if (target.flightId !== row.flightId || target.expectedUpdatedAt !== row.expectedUpdatedAt || Number(target.draftVersion) !== Number(row.draftVersion) || target.matchDigest !== row.matchDigest) {
              throw fail("维修机会、草稿或标准候选已变化，请重新核对", 409);
            }
          }
          const items = group.map(row => {
            const standard = row.match.status === "MATCHED" ? row.match.standard : null;
            return {
              clientId: randomId("mtnrditem"), category: standard?.category ?? row.item.category,
              chapter: standard?.chapter ?? row.item.chapter, title: standard?.title ?? row.item.title,
              reportExplanation: standard?.workScope ?? row.item.reportExplanation,
              standardHours: standard ? standard.standardHours : "", entries: [],
              sourceFingerprint: row.sourceFingerprint, importedUnlisted: !standard,
              standardId: standard?.id || "", standardVersion: standard?.version ?? null, standardSnapshot: standard
            };
          });
          const version = appendDraft(flightId, items, user);
          group.forEach((row, index) => {
            const original = rows.find(stored => Number(stored.row_number) === row.rowNumber);
            const item = items[index];
            const stamp = clock();
            db.prepare(`insert into maintenance_nonroutine_import_sources(fingerprint,flight_id,client_id,first_batch_id,row_number,original_json,standard_snapshot_json,state,created_by,created_at,updated_at)
              values(?,?,?,?,?,?,?,'ACTIVE',?,?,?)`)
              .run(row.sourceFingerprint, flightId, item.clientId, id, row.rowNumber, original.original_json,
                item.standardSnapshot ? JSON.stringify(item.standardSnapshot) : null, user.id, stamp, stamp);
            const receipt = { rowNumber: row.rowNumber, status: "SUCCESS", flightId, clientId: item.clientId, draftVersion: version };
            db.prepare("update maintenance_subtask_import_rows set receipt_json=?,updated_at=? where batch_id=? and row_number=?")
              .run(JSON.stringify(receipt), stamp, id, row.rowNumber);
            receipts.set(row.rowNumber, receipt);
          });
          log(user, "nonroutine_import_append", id, { flightId, rowNumbers: group.map(row => row.rowNumber), version });
          db.exec(`release savepoint ${savepoint}`);
        } catch (error) {
          db.exec(`rollback to savepoint ${savepoint}`);
          db.exec(`release savepoint ${savepoint}`);
          for (const row of group) receipts.set(row.rowNumber, { rowNumber: row.rowNumber, status: error.status === 409 ? "CONFLICT" : "FAILED", reason: error.status ? error.message : "导入事务失败，本机会所选行已全部回滚" });
        }
      }
      const results = selected.map(row => receipts.get(row.rowNumber));
      const summary = receiptSummary(results);
      const terminal = new Set(["SUCCESS", "ALREADY_IMPORTED", "DELETED", "SUBMITTED", "SKIPPED"]);
      const done = fresh.results.every(row => terminal.has(receipts.get(row.rowNumber)?.status || row.status));
      const revision = Number(batch.revision) + 1;
      const response = { batchId: id, revision, replayed: false, results, summary };
      db.prepare("update maintenance_subtask_import_batches set status=?,revision=?,updated_at=? where id=?")
        .run(done ? "COMMITTED" : "PARTIAL", revision, clock(), id);
      db.prepare("insert into maintenance_subtask_import_attempts(batch_id,request_id,payload_digest,result_json,created_at) values(?,?,?,?,?)")
        .run(id, payload.requestId, digest, JSON.stringify(response), clock());
      log(user, "nonroutine_import_commit", id, { requestId: payload.requestId, summary });
      return response;
    });
  }

  return { create, view, decide, commit };
}

function receiptSummary(results) {
  const count = statuses => results.filter(row => statuses.includes(row.status)).length;
  return {
    total: results.length, created: count(["SUCCESS"]),
    skipped: count(["ALREADY_IMPORTED", "DELETED", "SUBMITTED", "SKIPPED"]),
    conflicts: count(["CONFLICT"]), failed: count(["FAILED"]), needsReview: count(["NEEDS_REVIEW", "BLOCKED"])
  };
}
