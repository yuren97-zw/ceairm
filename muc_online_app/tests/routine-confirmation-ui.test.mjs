import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const start = source.indexOf('async function submitMaintenanceWorkReport()');
const end = source.indexOf('\nasync function saveMaintenanceReportConfirmation()', start);
const submitSource = source.slice(start, end);
function harness(accept = true) {
  const calls = [];
  const draft = { reportType: 'routine', busy: false, feedback: '原文', releasePersonId: 'release', draftVersion: 1, report: { flight: { id: 'flight' }, progress: { batches: {} } } };
  const context = vm.createContext({ state: { maintenanceWorkReportDraft: draft }, window: { confirm: text => { calls.push(['confirm', text]); return accept; } }, $: () => null,
    maintenanceWorkReleaseUserId: () => 'release', maintenanceWorkReportEntries: () => [{ role: '接机', personId: 'person' }],
    renderMaintenanceWorkReportDialog: () => calls.push(['render']), closeDialog: () => calls.push(['close']), refreshMaintenance: async () => calls.push(['refresh']),
    maintenanceService: { submitReport: async (...args) => calls.push(['submit', ...args]) } });
  vm.runInContext(submitSource, context);
  return { context, calls, draft };
}
test('routine cancel does not write, close or lose input', async () => {
  const h = harness(false); await h.context.submitMaintenanceWorkReport();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0][1], '确认例行报工人员填写完整。');
  assert.equal(h.draft.feedback, '原文'); assert.equal(h.draft.busy, false);
});
test('routine confirmation submits once and busy guards repeated clicks', async () => {
  const h = harness(); await h.context.submitMaintenanceWorkReport(); await h.context.submitMaintenanceWorkReport();
  assert.equal(h.calls.filter(call => call[0] === 'confirm').length, 1);
  assert.equal(h.calls.filter(call => call[0] === 'submit').length, 1);
});
test('failed submission retains input and allows retry', async () => {
  const h = harness(); h.context.maintenanceService.submitReport = async () => { throw new Error('维修机会已更新，请刷新后重试'); };
  await h.context.submitMaintenanceWorkReport(); assert.equal(h.draft.busy, false); assert.equal(h.draft.feedback, '原文');
  assert.equal(h.calls.some(call => call[0] === 'close'), false);
});
test('only routine button labels change and request versions follow opened forms', () => {
  assert.match(source, /data-maint-work-save-routine[^\n]+>暂存<\/button>/);
  assert.match(source, /draft.reportType === "routine" \? "提交" : "提交并锁定"/);
  assert.match(source, /reportFinalizationMode === "automatic"/);
  assert.match(source, /expectedUpdatedAt: state\.maintenanceReviewDraft\?\.review\?\.flight\?\.updatedAt/);
});
