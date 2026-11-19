import { openStandardCandidatePicker } from "./maintenance-standard-picker.mjs";

const labels = {
  READY_STANDARD: "已匹配标准", READY_NEW_DRAFT: "作为草稿导入", NEEDS_SELECTION: "选择标准", POSSIBLE_DUPLICATE: "重复项待核对",
  BLOCKED: "异常", ALREADY_IMPORTED: "已导入", DELETED: "来源已删除", SUBMITTED: "已正式报工", SKIPPED: "已排除",
  SUCCESS: "已保存草稿", CONFLICT: "版本冲突", FAILED: "失败", NEEDS_REVIEW: "待核对"
};
export function importResultCsvRows(results) {
  const protect = value => /^[\s]*[=+\-@]/.test(String(value ?? "")) ? `'${value}` : String(value ?? "");
  return [["行号", "结果", "说明", "工作名称"], ...results.map(row => [row.rowNumber, labels[row.status] || row.status, row.reason || row.match?.reason || "", row.item?.title || ""])].map(row => row.map(protect));
}

function requestId() {
  const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `import_${unique}`;
}

export function createMaintenanceImportWorkbench({ root, api, escapeHtml: escape, mode, fileLimitBytes, setBusy, onData, download, refresh, storageKey }) {
  let batch = null, busy = false, filter = "all", search = "", expanded = null, pendingCommit = null, lastReceipt = null;
  let savedBatch = "";
  try { savedBatch = localStorage.getItem(storageKey) || ""; } catch {}
  const selected = new Set();
  const notes = new Map();
  let picker = null;
  const ready = row => ["READY_STANDARD", "READY_NEW_DRAFT"].includes(row.status) ||
    row.status === "POSSIBLE_DUPLICATE" && row.decision?.distinctWorkReason && ["MATCHED", "UNLISTED"].includes(row.match?.status) &&
    JSON.stringify(row.decision.comparedWork) === JSON.stringify(row.duplicates);
  const url = () => `/maintenance/subtasks/import/batches/${encodeURIComponent(batch.batchId)}`;
  function chooseReady() {
    selected.clear();
    for (const row of batch?.results || []) if (ready(row)) selected.add(row.rowNumber);
  }
  function remember() {
    savedBatch = batch.batchId;
    try { localStorage.setItem(storageKey, savedBatch); } catch {}
  }
  function controls() {
    document.querySelector('#maintenanceImportConfirm').disabled = busy || mode !== "draft" || !selected.size;
    document.querySelector('#maintenanceImportConfirm').textContent = mode === "draft" ? `导入所选 ${selected.size} 行草稿` : "当前仅开放预览";
    document.querySelector('#maintenanceImportCheck').disabled = busy;
  }
  function render() {
    if (!batch) {
      root.innerHTML = savedBatch ? '<button type="button" class="btn secondary" data-import-resume>恢复上次预览批次</button>' : "";
      controls(); return;
    }
    const summary = batch.summary;
    const priority = row => ["NEEDS_SELECTION", "POSSIBLE_DUPLICATE", "BLOCKED"].includes(row.status) ? 0 : ready(row) ? 1 : 2;
    const rows = batch.results.filter(row => (filter !== "pending" || !ready(row) && !["ALREADY_IMPORTED", "DELETED", "SUBMITTED", "SKIPPED"].includes(row.status)) &&
      (filter !== "errors" || ["BLOCKED", "NEEDS_SELECTION", "POSSIBLE_DUPLICATE"].includes(row.status)) &&
      (!search || [row.item?.title, row.item?.category, row.item?.chapter, row.aircraftCode, row.date, row.flightId].join(" ").toLowerCase().includes(search.toLowerCase()))).sort((left, right) => priority(left) - priority(right));
    root.innerHTML = `<style>.maintenance-import-workbench input,.maintenance-import-workbench select,.maintenance-import-workbench textarea{font-size:16px;min-height:44px;box-sizing:border-box;max-width:100%}</style><div class="maintenance-import-workbench">
      <p>${escape(batch.filename)} · ${escape(batch.sheetName)} · ${summary.total}行 · 标准${summary.readyStandards} · 未收录${summary.readyDrafts} · 候选${summary.needsSelection} · 重复${summary.possibleDuplicates} · 异常${summary.blocked}</p>
      <div class="maintenance-import-filters"><select data-import-filter aria-label="导入状态"><option value="pending" ${filter === "pending" ? "selected" : ""}>仅待处理</option><option value="all" ${filter === "all" ? "selected" : ""}>全部（待处理优先）</option><option value="errors" ${filter === "errors" ? "selected" : ""}>异常与候选</option></select><input type="search" data-import-search value="${escape(search)}" placeholder="机会 / 机型 / 类别 / ATA / 工作名称" aria-label="筛选导入工作"><button type="button" class="btn secondary" data-import-refresh>重新核对</button></div>
      ${lastReceipt ? `<p role="status">本次保存${lastReceipt.summary.created}行，跳过${lastReceipt.summary.skipped}行，冲突${lastReceipt.summary.conflicts}行，待核对${lastReceipt.summary.needsReview}行，失败${lastReceipt.summary.failed}行。</p>` : ""}
      ${rows.length ? rows.map(row => `<article class="maintenance-import-work-row"><div><label><input type="checkbox" data-import-select="${row.rowNumber}" ${selected.has(row.rowNumber) ? "checked" : ""} ${!ready(row) ? "disabled" : ""}>第${row.rowNumber}行</label> · ${escape(labels[row.status] || row.status)} · ${escape(row.aircraftCode || "")} · ${escape(row.date || "")}</div><strong>${escape(row.item?.title || row.reason || "工作文字待完善")}</strong><div>${escape(row.item?.category || "类别待填")} · ATA ${escape(row.item?.chapter || "待填")}</div><p>${escape(row.reason || row.match?.reason || "")}</p><button type="button" class="btn secondary" data-import-detail="${row.rowNumber}">${expanded === row.rowNumber ? "收起" : "查看详情"}</button>
      ${expanded === row.rowNumber ? details(row) : ""}</article>`).join("") : '<p class="status-line">当前筛选下没有待处理行，可切换“全部”查看并选择合规项目。</p>'}
      <p class="status-line">已选${selected.size}行。未收录项目仅预录入文字，人员和申请工时由执行人在原报工页确认。</p>
      </div>`;
    controls();
  }
  function details(row) {
    const candidateList = row.match?.candidates || [];
    return `<div class="maintenance-import-row-detail"><p style="white-space:pre-wrap">${escape(row.item?.reportExplanation || "范围待完善")}</p>
      ${row.match?.standard ? `<p>标准 ${escape(row.match.standard.id)} · V${row.match.standard.version} · ${row.match.standard.standardHours}小时</p>` : ""}
      ${row.canResetStandardChoice ? `<button type="button" class="btn secondary" data-import-reset-standard="${row.rowNumber}">清除失效选择并重新匹配</button>` : ""}
      ${candidateList.length && row.status === "NEEDS_SELECTION" ? `<button type="button" class="btn secondary" data-import-candidates="${row.rowNumber}">比较并选择候选标准（${candidateList.length}项）</button>` : ""}
      ${(row.duplicates || []).map(item => `<p>已有${escape(item.source || "工作")} ${escape(item.id || `第${item.rowNumber}行`)} · ${escape(item.title)} · ${escape(item.status)}<br>${escape(item.reportExplanation)}</p>`).join("")}
      ${row.status === "POSSIBLE_DUPLICATE" ? `<label>确属不同工作的依据<textarea data-import-distinct="${row.rowNumber}" maxlength="1000">${escape(notes.get(row.rowNumber) ?? row.decision?.distinctWorkReason ?? "")}</textarea></label><button type="button" class="btn secondary" data-import-distinct-save="${row.rowNumber}">确认是不同工作</button>` : ""}
      ${row.flightId && !["ALREADY_IMPORTED", "DELETED", "SUBMITTED", "BLOCKED"].includes(row.status) ? `<button type="button" class="btn secondary" data-import-skip="${row.rowNumber}">${row.status === "SKIPPED" ? "重新纳入" : "排除此行"}</button>` : ""}</div>`;
  }
  async function action(callback) {
    if (busy) return;
    busy = true; setBusy(true); controls();
    try { await callback(); return true; }
    catch (error) { document.querySelector('#maintenanceImportProgress').textContent = error.message; return false; }
    finally { busy = false; setBusy(false); render(); }
  }
  async function load(id) {
    batch = await api(`/maintenance/subtasks/import/batches/${encodeURIComponent(id)}`);
    pendingCommit = null; remember(); chooseReady(); onData(batch);
  }
  async function decide(rowNumber, decision) {
    return action(async () => {
      batch = await api(`${url()}/rows/${rowNumber}`, { method: "PUT", body: { revision: batch.revision, ...decision } });
      pendingCommit = null; chooseReady(); onData(batch);
    });
  }
  async function click(event) {
    const target = event.target.closest('button');
    if (!target || !root.contains(target) || busy) return;
    if (target.hasAttribute('data-import-resume')) return action(() => load(savedBatch));
    if (target.hasAttribute('data-import-refresh')) return action(() => load(batch.batchId));
    if (target.dataset.importResetStandard) return decide(Number(target.dataset.importResetStandard), { resetStandardChoice: true });
    if (target.dataset.importCandidates) {
      const row = batch.results.find(item => item.rowNumber === Number(target.dataset.importCandidates));
      picker = openStandardCandidatePicker({
        parent: document.querySelector('#maintenanceUnifiedImportDialog'), title: `第${row.rowNumber}行 · 选择标准`,
        original: row.item, candidates: row.match.candidates, escapeHtml: escape,
        onSelect: standard => decide(row.rowNumber, { standardId: standard.id, standardVersion: standard.version })
      });
      return;
    }
    if (target.dataset.importDetail) { expanded = expanded === Number(target.dataset.importDetail) ? null : Number(target.dataset.importDetail); render(); }
    if (target.dataset.importSkip) {
      const rowNumber = Number(target.dataset.importSkip);
      return decide(rowNumber, { skip: batch.results.find(row => row.rowNumber === rowNumber).status !== "SKIPPED" });
    }
    if (target.dataset.importDistinctSave) {
      const rowNumber = Number(target.dataset.importDistinctSave);
      return decide(rowNumber, { distinctWorkReason: root.querySelector(`[data-import-distinct="${rowNumber}"]`).value });
    }
  }
  function change(event) {
    if (busy) return;
    const target = event.target;
    if (target.dataset.importSelect) {
      const number = Number(target.dataset.importSelect);
      if (target.checked) selected.add(number); else selected.delete(number);
      pendingCommit = null; controls();
    }
    if (target.hasAttribute('data-import-filter')) { filter = target.value; render(); }

  }
  function input(event) {
    if (event.target.dataset.importDistinct) { notes.set(Number(event.target.dataset.importDistinct), event.target.value); return; }
    if (!event.target.hasAttribute('data-import-search')) return;
    const position = event.target.selectionStart;
    search = event.target.value; render();
    const next = root.querySelector('[data-import-search]'); next.focus(); next.setSelectionRange(position, position);
  }
  root.addEventListener('click', click); root.addEventListener('change', change); root.addEventListener('input', input);
  return {
    activate() { render(); },
    reset() { batch = null; lastReceipt = null; pendingCommit = null; selected.clear(); notes.clear(); },
    dispose() { picker?.close(); root.removeEventListener('click', click); root.removeEventListener('change', change); root.removeEventListener('input', input); },
    exportResults() {
      const results = lastReceipt ? lastReceipt.results.map(receipt => ({ ...batch?.results.find(row => row.rowNumber === receipt.rowNumber), ...receipt })) : batch?.results || [];
      download(importResultCsvRows(results), "非例行导入结果.csv");
    },
    help: "文件上限3MiB。预览匹配标准，多候选人工选择；未收录只预填原草稿文字。重复项须核对，确认后安全追加。",
    async run(commit) {
      await action(async () => {
        if (!commit) {
          const file = document.querySelector('#maintenanceUnifiedImportFile').files?.[0];
          if (!file) { if (batch) return load(batch.batchId); throw new Error("请先选择文件或恢复上次批次"); }
          if (file.size > fileLimitBytes) throw new Error("文件不能超过3MiB");
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
          batch = await api('/maintenance/subtasks/import/files/preview', { method: "POST", body: { filename: file.name, contentBase64: btoa(binary) } });
          pendingCommit = null; lastReceipt = null; remember(); chooseReady(); onData(batch);
          document.querySelector('#maintenanceImportProgress').textContent = mode === "shadow" ? "预览已保存，当前仅开放核对。" : "请选择合规行，确认后追加到原草稿。";
        } else {
          if (mode !== "draft" || !batch || !selected.size) throw new Error("请先选择可导入的行");
          if (!pendingCommit) pendingCommit = { requestId: requestId(), revision: batch.revision, rows: batch.results.filter(row => selected.has(row.rowNumber)).map(({ rowNumber, flightId, expectedUpdatedAt, draftVersion, matchDigest }) => ({ rowNumber, flightId, expectedUpdatedAt, draftVersion, matchDigest })) };
          const receipt = await api(`${url()}/commit`, { method: "POST", body: pendingCommit });
          lastReceipt = receipt; pendingCommit = null;
          await load(batch.batchId);
          document.querySelector('#maintenanceImportProgress').textContent = "草稿处理结果已保存，可继续处理异常行或到原执行页查看。";
          try { await refresh(); } catch { document.querySelector('#maintenanceImportProgress').textContent += " 列表刷新失败，请稍后刷新。"; }
        }
      });
    }
  };
}
