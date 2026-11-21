import crypto from "node:crypto";
import { XMLParser } from "cos-fast-xml-parser";
import { PptxZip, safeZipPath } from "./public/pptx-zip.mjs";

export const NONROUTINE_FILE_LIMIT = 3 * 1024 * 1024;
const MAX_ROWS = 1001;
const MAX_COLUMNS = 100;
const decoder = new TextDecoder("utf-8", { fatal: true });
const list = value => value === undefined ? [] : Array.isArray(value) ? value : [value];
const fail = message => Object.assign(new Error(message), { status: 400 });

function xml(bytes) {
  const content = decoder.decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(content)) throw fail("Excel不允许包含XML实体声明");
  return new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: false }).parse(content, true);
}

function cellText(node) {
  if (node === undefined || node === null) return "";
  if (typeof node !== "object") return String(node);
  if (node.t !== undefined) return cellText(node.t);
  if (node.r !== undefined) return list(node.r).map(cellText).join("");
  return String(node["#text"] ?? "");
}

function csvRows(content) {
  const rows = [];
  let cells = [], cell = "", quoted = false, closed = false, line = 1, startLine = 1;
  const finishCell = () => { cells.push(cell); cell = ""; closed = false; if (cells.length > MAX_COLUMNS) throw fail("Excel最多允许100列"); };
  const finishRow = () => {
    finishCell();
    if (cells.some(value => value.trim())) rows.push({ cells, rowNumber: startLine });
    cells = [];
    if (rows.length > MAX_ROWS) throw fail("每次最多导入1000行工作");
  };
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (char === "\n" || char === "\r" && content[index + 1] !== "\n") line++;
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"') {
      if (cell || closed) throw fail("CSV引号格式无效");
      quoted = true;
    } else if (char === ",") finishCell();
    else if (char === "\n" || char === "\r" && content[index + 1] !== "\n") { finishRow(); startLine = line; }
    else if (char !== "\r") {
      if (closed && !/\s/.test(char)) throw fail("CSV引号后存在无效内容");
      if (!closed) cell += char;
    }
    if (cell.length > 10000) throw fail("Excel单元格内容超过10000字");
  }
  if (quoted) throw fail("CSV引号没有闭合");
  if (cell || cells.length || closed) finishRow();
  return rows;
}

async function xlsxRows(bytes, requestedSheet) {
  const array = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const zip = new PptxZip(array, { requiredEntries: ["[Content_Types].xml", "xl/workbook.xml", "xl/_rels/workbook.xml.rels"] });
  for (const name of zip.entries.keys()) {
    if (/vbaProject|externalLinks|embeddings/i.test(name)) throw fail("不支持包含宏、外部链接或嵌入对象的Excel");
  }
  const contentTypes = xml(await zip.read("[Content_Types].xml", 2 * 1024 * 1024)).Types;
  const overrides = list(contentTypes?.Override).filter(item => item["@_PartName"] === "/xl/workbook.xml");
  const defaults = list(contentTypes?.Default).filter(item => item["@_Extension"] === "xml");
  const workbookTypes = overrides.length ? overrides : defaults;
  if (workbookTypes.length !== 1 || workbookTypes[0]["@_ContentType"] !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml") {
    throw fail("文件不是受支持的xlsx工作簿");
  }
  const workbook = xml(await zip.read("xl/workbook.xml", 2 * 1024 * 1024)).workbook;
  const relationships = xml(await zip.read("xl/_rels/workbook.xml.rels", 2 * 1024 * 1024)).Relationships;
  const rels = list(relationships?.Relationship);
  if (rels.some(rel => rel["@_TargetMode"] === "External")) throw fail("Excel工作簿不允许外部关系");
  const sheets = list(workbook?.sheets?.sheet);
  const sheet = requestedSheet ? sheets.find(item => item["@_name"] === requestedSheet) : sheets[0];
  if (!sheet) throw fail("未找到指定的Excel工作表");
  const relation = rels.find(rel => rel["@_Id"] === sheet["@_id"]);
  if (!relation || !String(relation["@_Type"] || "").endsWith("/worksheet")) throw fail("Excel工作表关系无效");
  const target = String(relation["@_Target"] || "");
  const filename = safeZipPath(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  const worksheet = xml(await zip.read(filename, 8 * 1024 * 1024)).worksheet;
  let shared = [];
  if (zip.entries.has("xl/sharedStrings.xml")) {
    shared = list(xml(await zip.read("xl/sharedStrings.xml", 8 * 1024 * 1024)).sst?.si).map(cellText);
  }
  const rows = [];
  const seenRows = new Set();
  for (const [index, row] of list(worksheet?.sheetData?.row).entries()) {
    const rowNumber = Number(row["@_r"] ?? index + 1);
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > 1048576 || seenRows.has(rowNumber)) throw fail("Excel行号无效或重复");
    seenRows.add(rowNumber);
    const cells = [];
    const occupied = new Set();
    let formula = false;
    for (const cell of list(row.c)) {
      const reference = /^([A-Z]+)(\d+)$/.exec(String(cell["@_r"] || ""));
      if (!reference || Number(reference[2]) !== rowNumber) throw fail("Excel单元格位置无效");
      let column = 0;
      for (const letter of reference[1]) column = column * 26 + letter.charCodeAt(0) - 64;
      if (column > MAX_COLUMNS || occupied.has(column)) throw fail("Excel列数超限或单元格位置重复");
      occupied.add(column);
      formula ||= Object.hasOwn(cell, "f") || cell["@_t"] === "e";
      const type = cell["@_t"];
      let value = type === "inlineStr" ? cellText(cell.is) : cellText(cell.v);
      if (type === "s") {
        const position = Number(value);
        if (!/^\d+$/.test(value) || !Number.isInteger(position) || position >= shared.length) throw fail("Excel共享文字索引无效");
        value = shared[position];
      }
      if (value.length > 10000) throw fail("Excel单元格内容超过10000字");
      cells[column - 1] = value;
    }
    if (cells.some(value => value?.trim()) || formula) rows.push({ cells, rowNumber, formula });
    if (rows.length > MAX_ROWS) throw fail("每次最多导入1000行工作");
  }
  rows.sort((left, right) => left.rowNumber - right.rowNumber);
  return { rows, sheetName: sheet["@_name"], date1904: ["1", "true"].includes(String(workbook?.workbookPr?.["@_date1904"] || "")) };
}

const columns = {
  date: ["日期", "航班日期", "计划日期"], flightNo: ["进港航班号", "航班号"], departureFlightNo: ["出港航班号"],
  aircraftNo: ["机号"], workKind: ["维修机会", "工作类型", "工作种类"],
  locationName: ["作业地点", "作业地点（不输入默认为青岛）", "作业地点(不输入默认为青岛)"],
  chapter: ["ATA", "章节", "工卡编号", "工卡号"], title: ["工作标题", "工卡名称", "标题", "工作名称"],
  category: ["非例行类别", "工作类别", "类别"], standardHours: ["标准工时", "申请工时"],
  reportExplanation: ["工作内容及范围", "工作范围", "报工说明", "内容", "content", "workScope"], standardId: ["标准ID"], standardVersion: ["标准版本"],
  priority: ["优先级"], remark: ["备注"]
};

function mappedRows(grid, sheetName, date1904) {
  if (!grid.length) throw fail("未识别到Excel数据");
  const headers = grid[0].cells.map(value => String(value ?? "").trim().replace(/\s/g, ""));
  if (grid[0].formula) throw fail("Excel表头不允许公式");
  const indexes = {};
  for (const [key, names] of Object.entries(columns)) {
    const positions = headers.map((header, index) => names.includes(header) || header === key ? index : -1).filter(index => index >= 0);
    if (positions.length > 1) throw fail(`Excel存在重复列：${names[0]}`);
    indexes[key] = positions[0] ?? -1;
  }
  const required = ["date", "aircraftNo", "workKind"];
  if (required.some(key => indexes[key] < 0) || indexes.title < 0 && indexes.reportExplanation < 0) throw fail("Excel缺少日期、机号、维修机会或工作文字列");
  return grid.slice(1).map(row => {
    const item = Object.fromEntries(Object.entries(indexes).map(([key, index]) => [key, index >= 0 ? row.cells[index] ?? "" : ""]));
    if (/^\d+(\.\d+)?$/.test(item.date) && Number(item.date) >= 1 && Number(item.date) < 100000) {
      const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
      item.date = new Date(base + Math.floor(Number(item.date)) * 86400000).toISOString().slice(0, 10);
    }
    if (row.formula || row.cells.some(value => /^[\s]*[=+@]|^[\s]*-\s*[A-Za-z]/.test(value || ""))) item._sourceError = "本行含公式，请改为纯文字后重新上传";
    return { ...item, rowNumber: row.rowNumber, sheetName, sourceCells: row.cells.map(value => value ?? "") };
  });
}

export async function parseMaintenanceImportGrid(payload) {
  const filename = String(payload?.filename || "").trim();
  const encoded = payload?.contentBase64;
  if (!filename || filename.length > 200 || !/\.(xlsx|csv)$/i.test(filename)) throw fail("请上传xlsx或UTF-8 CSV文件");
  if (typeof encoded !== "string" || encoded.length > Math.ceil(NONROUTINE_FILE_LIMIT / 3) * 4 || encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw fail("文件编码无效或超过3MiB限制");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) throw fail("文件编码无效");
  if (!bytes.length || bytes.length > NONROUTINE_FILE_LIMIT) throw fail("文件为空或超过3MiB限制");
  let parsed;
  try {
    if (/\.xlsx$/i.test(filename)) parsed = await xlsxRows(bytes, String(payload.sheetName || ""));
    else {
      const content = decoder.decode(bytes).replace(/^\uFEFF/, "");
      if (content.includes("\0") || content.startsWith("PK")) throw fail("CSV内容与文件格式不符");
      parsed = { rows: csvRows(content), sheetName: "CSV", date1904: false };
    }
  } catch (error) {
    throw fail(String(error.message).replace(/PPTX/g, "Excel").replace(/演示文稿/g, "工作簿"));
  }
  if (parsed.rows.length<2) throw fail("Excel没有数据行");
  return { filename, fileSha256: crypto.createHash("sha256").update(bytes).digest("hex"), sheetName: parsed.sheetName, grid:parsed.rows, date1904:parsed.date1904 };
}

export async function parseNonroutineImportFile(payload) {
  const {grid,date1904,...file}=await parseMaintenanceImportGrid(payload);
  return {...file,rows:mappedRows(grid,file.sheetName,date1904)};
}
