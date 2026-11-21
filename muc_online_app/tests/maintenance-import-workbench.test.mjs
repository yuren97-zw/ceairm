import assert from "node:assert/strict";
import test from "node:test";
import { createMaintenanceImportWorkbench, importResultCsvRows } from "../public/maintenance-import-workbench.mjs";

function fixture(t, mode = "draft", previewOverrides = {}) {
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.localStorage;
  const controls = new Map();
  for (const id of ['maintenanceImportConfirm','maintenanceImportCheck','maintenanceImportProgress','maintenanceUnifiedImportFile']) controls.set(`#${id}`, { disabled: false, textContent: "" });
  controls.get('#maintenanceUnifiedImportFile').files = [{ name: 'work.csv', size: 20, arrayBuffer: async () => new TextEncoder().encode('source-file').buffer }];
  globalThis.document = { querySelector: selector => controls.get(selector) };
  const saved = new Map();
  globalThis.localStorage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  t.after(() => { globalThis.document = originalDocument; globalThis.localStorage = originalStorage; });
  const listeners=new Map();
  const root = { innerHTML: "", contains:()=>true, addEventListener(name,listener) {listeners.set(name,listener);}, removeEventListener() {} };
  const batch = { batchId: 'batch-one', revision: 1, filename: '<file>.csv', sheetName: 'CSV', summary: { total: 1, readyStandards: 0, readyDrafts: 1, needsSelection: 0, possibleDuplicates: 0, blocked: 0 }, results: [{ rowNumber: 2, status: 'READY_NEW_DRAFT', flightId: 'flight-one', item: { title: '<检查>', chapter: '', category: '', reportExplanation: '' }, expectedUpdatedAt: 'revision', draftVersion: 0, matchDigest: 'digest' }] };
  Object.assign(batch, previewOverrides);
  const attempts = [];
  const decisions = [];
  let failOnce = true;
  const api = async (path, options) => {
    if (path.endsWith('/files/preview')) return structuredClone(batch);
    if (path.includes('/rows/')) { decisions.push(structuredClone(options)); return { ...structuredClone(batch), revision: 2, results: batch.results.map(row=>({...row,status:'READY_NEW_DRAFT',canResetStandardChoice:false})) }; }
    if (path.endsWith('/commit')) {
      attempts.push(structuredClone(options.body));
      if (failOnce) { failOnce = false; throw new Error('network interrupted'); }
      return { results: [{ rowNumber: 2, status: 'SUCCESS' }], summary: { created: 1, skipped: 0, conflicts: 0, needsReview: 0, failed: 0 } };
    }
    return { ...structuredClone(batch), revision: 2, results: batch.results.map(row => ({ ...row, status: 'ALREADY_IMPORTED' })) };
  };
  const workbench = createMaintenanceImportWorkbench({ root, api, escapeHtml: value => String(value ?? '').replace(/</g, '&lt;'), mode, fileLimitBytes: 1024, setBusy() {}, onData() {}, download() {}, refresh: async () => {}, storageKey: 'one' });
  return { workbench, root, controls, attempts, decisions, click:async dataset=>{const button={dataset,hasAttribute:()=>false};return listeners.get("click")({target:{closest:()=>button}});} };
}

test("workbench keeps the same commit payload and request ID across a lost-response retry", async t => {
  const { workbench, root, controls, attempts } = fixture(t);
  await workbench.run(false);
  assert.match(root.innerHTML, /&lt;检查>/);
  assert.equal(controls.get('#maintenanceImportConfirm').disabled, false);
  await workbench.run(true);
  assert.match(controls.get('#maintenanceImportProgress').textContent, /network interrupted/);
  await workbench.run(true);
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(controls.get('#maintenanceImportConfirm').disabled, true);
});

test("shadow workbench permits preview but keeps business submission disabled", async t => {
  const { workbench, controls, attempts } = fixture(t, "shadow");
  await workbench.run(false);
  assert.equal(controls.get('#maintenanceImportConfirm').disabled, true);
  await workbench.run(true);
  assert.equal(attempts.length, 0);
});

test("result exports protect spreadsheet formula prefixes while preserving genuine text", () => {
  const exported = importResultCsvRows([{ rowNumber: 2, status: 'FAILED', reason: '=HYPERLINK("bad")', item: { title: '+cmd' } }, { rowNumber: 3, status: 'SUCCESS', item: { title: '液压检查' } }]);
  assert.equal(exported[1][2][0], "'");
  assert.equal(exported[1][3][0], "'");
  assert.equal(exported[2][3], '液压检查');
});


test("submitted and locked import rows stay read-only and explain why new import is blocked", async t => {
  const reason = "维修机会或非例行报工已锁定，既有工作仅供只读核对，不能通过导入新增、覆盖或重置。";
  const { workbench, root, controls, attempts } = fixture(t, "draft", {
    summary: { total: 2, readyStandards: 0, readyDrafts: 0, needsSelection: 0, possibleDuplicates: 0, blocked: 1, submitted: 1 },
    results: [
      { rowNumber: 2, status: "SUBMITTED", subtaskId: "original-subtask", item: { title: "已正式提报工作" } },
      { rowNumber: 3, status: "BLOCKED", reason, item: { title: "再次导入的文字" }, duplicates: [{ id: "original-subtask", status: "已提报" }] }
    ]
  });
  await workbench.run(false);
  assert.equal(controls.get('#maintenanceImportConfirm').disabled, true);
  assert.match(root.innerHTML, /已锁定，既有工作仅供只读核对/);
  assert.match(root.innerHTML, /data-import-select="3"[^>]*disabled/);
  assert.ok(!root.innerHTML.includes('data-import-distinct-save'));
  assert.ok(!root.innerHTML.includes('data-import-skip'));
  await workbench.run(true);
  assert.equal(attempts.length, 0);
});


test("expired standard reset uses the original row decision API and refreshes the current row", async t => {
  const h=fixture(t,'draft',{summary:{total:1,readyStandards:0,readyDrafts:0,needsSelection:0,possibleDuplicates:0,blocked:1},results:[{rowNumber:2,status:'BLOCKED',flightId:'flight-one',canResetStandardChoice:true,reason:'标准版本已失效',item:{title:'原始文字'},match:{status:'BLOCKED',candidates:[]}}]});
  await h.workbench.run(false);await h.click({importDetail:'2'});assert.match(h.root.innerHTML,/清除失效选择并重新匹配/);assert.equal(h.controls.get('#maintenanceImportConfirm').disabled,true);
  await h.click({importResetStandard:'2'});assert.deepEqual(h.decisions,[{method:'PUT',body:{revision:1,resetStandardChoice:true}}]);assert.ok(!h.root.innerHTML.includes('data-import-reset-standard'));assert.equal(h.controls.get('#maintenanceImportConfirm').disabled,false);
});
