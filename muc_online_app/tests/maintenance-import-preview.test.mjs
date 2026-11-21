import assert from "node:assert/strict";
import test from "node:test";
import { previewNonroutineImport } from "../maintenance-import-preview.mjs";

function preview(rows, overrides = {}) {
  return previewNonroutineImport({
    rows,
    resolveFlight: raw => ({ id: raw.flightId || "flight-one", aircraft_type: "A320", updated_at: "revision-one", draftVersion: 2 }),
    existingWork: () => [],
    matchStandard: () => ({ status: "UNLISTED", candidates: [] }),
    ...overrides
  });
}

const first = { category: "单项工作", chapter: "29", title: "液压管路检查", content: "左侧管路" };

test("unlisted preview retains incomplete text without treating Excel hours or people as reporting facts", () => {
  const result = preview([{ title: "尚待完善的检查", standardHours: 999, entries: [{ personId: "injected" }], rowNumber: 17 }]);
  const row = result.results[0];
  assert.equal(row.status, "READY_NEW_DRAFT");
  assert.equal(row.rowNumber, 17);
  assert.equal(row.item.chapter, "");
  assert.equal(row.item.category, "");
  assert.equal(row.item.standardHours, undefined);
  assert.equal(row.item.entries, undefined);
  assert.equal(row.expectedUpdatedAt, "revision-one");
  assert.equal(row.draftVersion, 2);
});

test("duplicate comparison includes manual drafts and formal work, without exposing assigned people", () => {
  const textOnly = preview([{ content: "左侧液压管路检查" }], { existingWork: () => [{ content: "左侧液压管路检查", source: "人工草稿" }] });
  assert.equal(textOnly.results[0].status, "POSSIBLE_DUPLICATE");
  for (const source of ["人工草稿", "Excel草稿", "正式工作"]) {
    const existing = { ...first, id: "existing-one", source, entries: [{ personId: "private-person" }], status: "已提报" };
    const before = structuredClone(existing);
    const result = preview([{ ...first, content: "另一位置" }], { existingWork: () => [existing] });
    assert.equal(result.results[0].status, "POSSIBLE_DUPLICATE");
    assert.equal(result.results[0].duplicates[0].id, "existing-one");
    assert.ok(!JSON.stringify(result).includes("private-person"));
    assert.deepEqual(existing, before);
  }
});

test("same-upload similar rows require confirmation on both sides and different opportunities stay independent", () => {
  const result = preview([first, { ...first, title: "液压管路检查及测试" }, { ...first, flightId: "flight-two" }]);
  assert.deepEqual(result.results.map(row => row.status), ["POSSIBLE_DUPLICATE", "POSSIBLE_DUPLICATE", "READY_NEW_DRAFT"]);
  assert.deepEqual(result.results[0].duplicates.map(row => row.rowNumber), [3]);
  assert.deepEqual(result.results[1].duplicates.map(row => row.rowNumber), [2]);
  assert.equal(result.summary.possibleDuplicates, 2);
  assert.equal(result.summary.ready, 1);
});

test("candidate ambiguity and blocked references cannot become ready drafts", () => {
  const candidate = preview([first], { matchStandard: () => ({ status: "NEEDS_SELECTION", candidates: [{ id: "one" }, { id: "two" }] }) });
  assert.equal(candidate.results[0].status, "NEEDS_SELECTION");
  assert.equal(candidate.summary.ready, 0);
  const blocked = preview([first], {
    existingWork: () => [{ ...first, source: "existing" }],
    matchStandard: () => ({ status: "BLOCKED", reason: "标准已停用", candidates: [] })
  });
  assert.equal(blocked.results[0].status, "BLOCKED");
  assert.equal(blocked.summary.ready, 0);
});

test("malformed and oversized rows are reported individually while valid rows remain previewable", () => {
  const result = preview([first, null, { title: "x".repeat(501) }, { title: "=SUM(1,2)" }, { title: "有效工作", rowNumber: -1 }, { title: "x", category: "虚构类别" }]);
  assert.equal(result.summary.total, 6);
  assert.equal(result.summary.blocked, 5);
  assert.equal(result.summary.ready, 1);
  assert.throws(() => preview([]), { status: 400 });
  assert.throws(() => preview(Array.from({ length: 1001 }, () => first)), { status: 400 });
});

test("out-of-scope rows expose neither opportunity fields nor internal comparisons", () => {
  const result = preview([first], {
    resolveFlight: () => { throw Object.assign(new Error("private-flight-details"), { status: 403 }); },
    existingWork: () => { throw new Error("must not read inaccessible work"); }
  });
  assert.equal(result.results[0].status, "BLOCKED");
  assert.equal(result.results[0].flightId, undefined);
  assert.ok(!JSON.stringify(result).includes("private-flight-details"));
});


test("locked opportunity previews explain read-only history while keeping authorized comparisons", () => {
  const result = preview([first], {
    resolveFlight: () => ({ id: "locked-flight", aircraft_type: "A320", updated_at: "locked-version", draftVersion: 2, importLocked: true }),
    existingWork: () => [{ ...first, id: "original-subtask", status: "已提报", source: "已有工作", entries: [{ personId: "private-person" }] }]
  });
  const row = result.results[0];
  assert.equal(row.status, "BLOCKED");
  assert.match(row.reason, /已锁定.*只读.*不能.*导入/);
  assert.equal(row.duplicates[0].id, "original-subtask");
  assert.equal(row.duplicates[0].status, "已提报");
  assert.equal(result.summary.ready, 0);
  assert.ok(!JSON.stringify(result).includes("private-person"));
});
