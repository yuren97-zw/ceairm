import { NONROUTINE_CATEGORY_STRATEGIES } from "./maintenance-standards.mjs";

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function text(value, label, limit) {
  if (value !== undefined && value !== null && typeof value !== "string" && typeof value !== "number") {
    throw invalid(`${label}格式无效`);
  }
  const result = String(value ?? "").trim();
  if (result.length > limit) throw invalid(`${label}超过${limit}字限制`);
  if (/^[=]/.test(result)) throw invalid(`${label}含公式，请改为纯文字`);
  return result;
}

export function nonroutineImportText(raw) {
  const item = {
    category: text(raw.category ?? raw["非例行类别"] ?? raw["类别"] ?? raw["工作类别"], "类别", 30),
    chapter: text(raw.chapter ?? raw.cardNo ?? raw.card_no ?? raw["章节"], "ATA", 200),
    title: text(raw.title ?? raw.cardName ?? raw.card_name ?? raw["工作标题"] ?? raw["工卡名称"], "工作名称", 500),
    reportExplanation: text(raw.workScope ?? raw.reportExplanation ?? raw.content ?? raw["工作内容及范围"] ?? raw["报工说明"], "工作范围", 4000),
    standardId: text(raw.standardId, "标准ID", 120),
    standardVersion: raw.standardVersion
  };
  if (item.category && !Object.hasOwn(NONROUTINE_CATEGORY_STRATEGIES, item.category)) throw invalid("非例行类别无效");
  if (!item.title && !item.reportExplanation) throw invalid("请至少填写工作名称或工作文字");
  return item;
}

function comparable(value) {
  return String(value ?? "").normalize("NFKC").toUpperCase().replace(/[\s，,。.;；:：、()（）\[\]【】_-]/g, "");
}

function possiblySame(left, right) {
  const leftTitle = comparable(left.title);
  const rightTitle = comparable(right.title);
  const scope = comparable(left.reportExplanation);
  if (left.standardId && right.standardId && left.standardId === right.standardId) return true;
  if (leftTitle && leftTitle === rightTitle) return true;
  if (scope && scope === comparable(right.reportExplanation) && (!leftTitle || !rightTitle)) return true;
  const sameContext = comparable(left.category) === comparable(right.category) &&
    comparable(left.chapter) && comparable(left.chapter) === comparable(right.chapter);
  if (!sameContext) return false;
  if (leftTitle.length >= 4 && rightTitle.length >= 4 && (leftTitle.includes(rightTitle) || rightTitle.includes(leftTitle))) return true;
  return Boolean(scope && scope === comparable(right.reportExplanation));
}

function comparison(item) {
  return {
    id: item.id || item.clientId || "",
    rowNumber: item.rowNumber ?? null,
    source: item.source,
    status: item.status || "未提报草稿",
    category: item.category || "",
    chapter: item.chapter || item.card_no || "",
    title: item.title || "",
    reportExplanation: item.reportExplanation || item.content || ""
  };
}

export function previewNonroutineImport({ rows, resolveFlight, existingWork, matchStandard, excludedRows = [] }) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000) throw invalid("请提供1至1000行非例行工作");
  const results = rows.map((raw, index) => {
    const rowNumber = Number.isInteger(raw?.rowNumber) && raw.rowNumber > 0 ? raw.rowNumber : index + 2;
    try {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid("导入行格式无效");
      if (raw._sourceError) throw invalid(String(raw._sourceError));
      if (raw.rowNumber !== undefined && (!Number.isInteger(raw.rowNumber) || raw.rowNumber <= 0)) throw invalid("原始行号无效");
      const item = nonroutineImportText(raw);
      const flight = resolveFlight(raw, rowNumber);
      const match = matchStandard(item, flight.aircraft_type);
      const existing = existingWork(flight.id);
      const duplicates = existing.filter(other => possiblySame(item, {
        ...other, chapter: other.chapter ?? other.card_no, reportExplanation: other.reportExplanation ?? other.content
      })).map(comparison);
      let status = match.status === "MATCHED" ? "READY_STANDARD" : "READY_NEW_DRAFT";
      if (match.status === "NEEDS_SELECTION") status = "NEEDS_SELECTION";
      if (match.status === "BLOCKED") status = "BLOCKED";
      if (duplicates.length && status !== "BLOCKED") status = "POSSIBLE_DUPLICATE";
      if (flight.importLocked) status = "BLOCKED";
      return {
        rowNumber, status, ...(flight.importLocked ? { reason: "维修机会或非例行报工已锁定，既有工作仅供只读核对，不能通过导入新增、覆盖或重置。" } : {}),
        flightId: flight.id, expectedUpdatedAt: flight.updated_at,
        aircraftCode: flight.aircraft_type || "", date: flight.date, item,
        draftVersion: flight.draftVersion, importLocked: Boolean(flight.importLocked), match, duplicates
      };
    } catch (error) {
      // Foreign opportunity details must not leak through errors or comparison payloads.
      const reason = error.status === 403 ? "维修机会不在当前维修管控范围内" : error.message;
      return { rowNumber, status: "BLOCKED", reason, httpStatus: error.status || 400 };
    }
  });
  const excluded = new Set(excludedRows);
  for (let index = 0; index < results.length; index++) {
    const current = results[index];
    if (!current.flightId || current.status === "BLOCKED" || excluded.has(current.rowNumber)) continue;
    for (const other of results.slice(0, index)) {
      if (other.flightId !== current.flightId || !other.item || other.status === "BLOCKED" || excluded.has(other.rowNumber) || !possiblySame(current.item, other.item)) continue;
      current.status = other.status = "POSSIBLE_DUPLICATE";
      current.duplicates.push(comparison({ ...other.item, rowNumber: other.rowNumber, source: "本次上传" }));
      other.duplicates.push(comparison({ ...current.item, rowNumber: current.rowNumber, source: "本次上传" }));
    }
  }
  const count = status => results.filter(row => row.status === status).length;
  return {
    results,
    summary: {
      total: results.length, readyStandards: count("READY_STANDARD"), readyDrafts: count("READY_NEW_DRAFT"),
      needsSelection: count("NEEDS_SELECTION"), possibleDuplicates: count("POSSIBLE_DUPLICATE"), blocked: count("BLOCKED"),
      ready: count("READY_STANDARD") + count("READY_NEW_DRAFT")
    }
  };
}
