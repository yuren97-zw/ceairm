import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const app = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
function renderer(raw, { standardView = true } = {}) {
  const body = { innerHTML: "", showModal() {}, querySelectorAll: () => [] };
  const state = { maintenanceWorkReportDraft: null };
  const context = vm.createContext({
    state, Map, Set, Date, Math, syncMaintenancePickerNames() {},
    $: () => body,
    subtaskCategories: ["工卡指令", "单项工作", "拖机", "其他"],
    maintenanceSubtaskRoles: () => ["主做", "检验", "辅助"],
    hasRbac: code => code !== 'maintenance.standard.view' || standardView,
    escapeHtml: value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
    optionList: (values, selected) => values.map(value => `<option value="${value}"${value === selected ? " selected" : ""}>${value}</option>`).join(""),
    personnelSelectionOptionsHtml: () => "", maintenanceDisplayFlightNo: () => "TEST",
    maintenanceWorkReportRoleGroups: () => "", renderMaintenanceWorkReportPicker: () => ""
  });
  for (const name of ["maintenanceTowStandardOnly", "maintenanceLegacyCategories", "maintenanceWorkUsesPicker", "maintenancePickerIndeterminate", "maintenanceTemporaryReportContext", "maintenanceWorkActiveContext", "maintenanceWorkReportEntries", "maintenanceNonroutinePayload", "renderMaintenanceWorkReportDialog"]) {
    const start = app.indexOf(`function ${name}(`);
    const end = app.indexOf("\n}", start) + 2;
    vm.runInContext(app.slice(start, end), context);
  }
  const item = context.maintenanceTemporaryReportContext(raw, 0);
  state.maintenanceWorkReportDraft = {
    reportType: "nonroutine-create", report: { flight: {}, nonroutine: { importedDraftSubmissionReady: false } },
    people: [], contexts: [item], activeContextKey: item.key, selections: new Map(), team: "", search: "", message: "", draftVersion: 1
  };
  context.renderMaintenanceWorkReportDialog();
  return {context,get html(){return body.innerHTML;},item};
}

test("imported incomplete text keeps missing category and hours through the original draft editor payload", () => {
  const { context, html, item } = renderer({ clientId: "one", sourceFingerprint: "source-one", importedUnlisted: true, title: "<检查>", category: "", standardHours: "", entries: [] });
  assert.equal(item.category, "");
  const payload = context.maintenanceNonroutinePayload({ preserveIncomplete: true });
  assert.equal(payload[0].category, "");
  assert.equal(payload[0].standardHours, "");
  assert.match(html, /未收录 · Excel预录入 · 草稿/);
  assert.match(html, /&lt;检查>/);
  assert.match(html, /保存草稿/);
  assert.match(html, /data-maint-work-submit disabled/);
  assert.match(html, /请选择类别/);
});

test("recognized standard fields are read-only while ordinary manual drafts retain their existing editor behavior", () => {
  const recognized = renderer({ clientId: "one", sourceFingerprint: "source-one", title: "检查", category: "试车", standardHours: 2, standardSnapshot: { version: 3 }, entries: [] });
  assert.match(recognized.html, /已收录 · Excel预录入 · 标准V3/);
  for (const field of ["chapter", "title", "reportExplanation", "standardHours"]) {
    assert.match(recognized.html, new RegExp(`data-maint-temp-field="${field}" readonly`));
  }
  assert.match(recognized.html, /data-maint-temp-field="category" disabled/);
  assert.equal(recognized.item.category, "试车");
  const manual = renderer({ title: "原人工草稿", category: "其他", entries: [] });
  assert.ok(!manual.html.includes("Excel预录入"));
  assert.ok(!manual.html.includes("正式报工（待开放）"));
  assert.match(manual.html, /data-maint-work-submit >提交并锁定/);
});

test("imported editor controls keep a local mobile 16px font rule", async () => {
  const html = await fs.readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /@media\(max-width:680px\)\{\.maintenance-imported-draft input,\.maintenance-imported-draft select,\.maintenance-imported-draft textarea\{font-size:16px\}\}/);
});

test("enabled imported submission includes existing formal work but shared-draft saving only sends temporary items", async () => {
  const {context} = renderer({clientId:'imported-one',sourceFingerprint:'source-one',category:'单项工作',standardHours:2});
  const imported = {clientId:'imported-one',sourceFingerprint:'source-one',category:'单项工作',standardHours:2,title:'新草稿',entries:[]};
  const report = {flight:{id:'flight-one'},canSubmit:true,people:[],progress:{},nonroutine:{importedDraftSubmissionReady:true,revision:'one',
    items:[{id:'existing-one',title:'原正式工作',category:'其他',standardHours:1,entries:[]}],draft:{version:3,items:[imported]}}};
  let saved;
  Object.assign(context,{
    maintenanceService:{async getReports(){return {report};},async saveNonroutineDraft(id,payload){saved={id,payload};return {draft:{version:4}};}},
    ensureMaintenanceDialogs(){},normalizePeople:people=>people,syncMaintenanceWorkReportViewport(){},renderMaintenanceWorkReportDialog(){},
    closeDialog(){},async refreshMaintenance(){}
  });
  for(const name of ['initializeMaintenanceWorkSelections','openMaintenanceWorkReportDialog','saveMaintenanceNonroutineDraft']) {
    const start=app.indexOf(`${name==='initializeMaintenanceWorkSelections'?'':'async '}function ${name}(`);
    vm.runInContext(app.slice(start,app.indexOf('\n}',start)+2),context);
  }
  await context.openMaintenanceWorkReportDialog('flight-one','nonroutine-create');
  const draft=context.state.maintenanceWorkReportDraft;
  assert.equal(draft.contexts.length,2);
  assert.equal(draft.contexts[0].ownerId,'existing-one');
  assert.equal(draft.contexts[1].clientId,'imported-one');
  const payload=context.maintenanceNonroutinePayload();
  assert.equal(payload.length,2);
  assert.equal(payload[0].id,'existing-one');
  await context.saveMaintenanceNonroutineDraft();
  assert.equal(saved.payload.items.length,1);
  assert.equal(saved.payload.items[0].clientId,'imported-one');
  assert.equal(saved.payload.version,3);
});

test('manual source editor preserves missing inputs, uses all eight categories and sends explicit source references',()=>{
  const h=renderer({clientId:'manual-case',manualManaged:true,sourceKind:'MANUAL',title:'<手工申请>',category:'三方附加',standardHours:''});
  h.context.state.maintenanceWorkReportDraft.report.nonroutine.manualDraftSubmissionReady=true;h.context.renderMaintenanceWorkReportDialog();
  assert.match(h.html,/未收录 · 手工草稿/);assert.ok(!h.html.includes('Excel预录入'));assert.match(h.html,/data-maint-work-standard/);assert.match(h.html,/人工除冰/);assert.match(h.html,/&lt;手工申请>/);
  const payload=h.context.maintenanceNonroutinePayload({preserveIncomplete:true})[0];assert.equal(payload.category,'三方附加');assert.equal(payload.standardHours,'');assert.equal(payload.manualManaged,true);assert.equal(payload.standardId,'');assert.equal(payload.standardVersion,null);
});
test('manual referenced standard zero is readonly and a disabled manual rollout cannot submit it as old legacy work',()=>{
  const h=renderer({clientId:'manual-zero',manualManaged:true,sourceKind:'MANUAL',standardHours:0,category:'试车',standardSnapshot:{id:'standard',version:2}});
  assert.match(h.html,/已收录 · 手工草稿 · 标准V2/);assert.match(h.html,/data-maint-work-submit disabled/);
  const payload=h.context.maintenanceNonroutinePayload()[0];assert.equal(payload.standardHours,0);assert.equal(payload.standardId,'standard');assert.equal(payload.standardVersion,2);
  for(const field of ['chapter','title','reportExplanation','standardHours'])assert.match(h.html,new RegExp(`data-maint-temp-field="${field}" readonly`));
});


test('execution hour labels show recognized zero while missing and unrecognized legacy zero remain distinct',()=>{
  const start=app.indexOf('function maintenanceStandardHoursLabel('),end=app.indexOf('\n}',start)+2,context=vm.createContext({Number});vm.runInContext(app.slice(start,end),context);
  assert.equal(context.maintenanceStandardHoursLabel(0,true),'0h');for(const missing of ['',null,undefined])assert.equal(context.maintenanceStandardHoursLabel(missing,true),'未填写工时');assert.equal(context.maintenanceStandardHoursLabel(0,false),'未填写工时');assert.equal(context.maintenanceStandardHoursLabel(1.2,true),'1.2h');
});


test("imported source standard selection stays in the original item and survives the original payload", () => {
  const h=renderer({clientId:'import-candidate',sourceFingerprint:'import-source',sourceKind:'IMPORT',importedUnlisted:true,category:'试车',title:'标准名称',standardHours:1.5,standardSnapshot:{id:'selected-import-standard',version:2}});
  h.context.state.maintenanceWorkReportDraft.report.nonroutine.importedDraftSubmissionReady=true;
  h.context.renderMaintenanceWorkReportDialog();
  assert.match(h.html,/data-maint-work-standard >选标准 \/ 继续完善当前草稿/);
  assert.match(h.html,/已收录 · Excel预录入 · 标准V2/);
  const payload=h.context.maintenanceNonroutinePayload()[0];assert.equal(payload.clientId,'import-candidate');assert.equal(payload.standardId,'selected-import-standard');assert.equal(payload.standardVersion,2);assert.equal(payload.manualManaged,false);
  assert.equal(h.context.state.maintenanceWorkReportDraft.contexts.length,1);
});


test("revoked catalog permission disables new reference selection while preserving the existing imported snapshot", () => {
  const h=renderer({clientId:'import-readonly',sourceFingerprint:'import-source',sourceKind:'IMPORT',title:'原已选标准',category:'试车',standardHours:1.5,standardSnapshot:{id:'existing-standard',version:1}},{standardView:false});
  h.context.state.maintenanceWorkReportDraft.report.nonroutine.importedDraftSubmissionReady=true;h.context.renderMaintenanceWorkReportDialog();
  assert.match(h.html,/data-maint-work-standard disabled/);assert.match(h.html,/已收录 · Excel预录入 · 标准V1/);
  assert.equal(h.context.maintenanceNonroutinePayload()[0].standardId,'existing-standard');
});
