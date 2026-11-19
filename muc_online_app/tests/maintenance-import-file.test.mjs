import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { parseNonroutineImportFile, NONROUTINE_FILE_LIMIT } from "../maintenance-import-file.mjs";
import { zipFixture } from "./fixtures/pptx-fixture.mjs";

const payload = (content, filename = "work.csv") => ({ filename, contentBase64: Buffer.from(content).toString("base64") });
const headers = "日期,机号,维修机会,工作名称,工作范围,申请工时";
const row = "2026-11-09,BTEST,停场,液压检查,左侧管路,999";
const sheet = `<worksheet><sheetData><row r="2">
  <c r="A2" t="inlineStr"><is><t>日期</t></is></c><c r="B2" t="inlineStr"><is><t>机号</t></is></c>
  <c r="C2" t="inlineStr"><is><t>维修机会</t></is></c><c r="D2" t="inlineStr"><is><t>工作名称</t></is></c>
  </row><row r="9"><c r="A9"><v>1</v></c><c r="B9" t="s"><v>0</v></c>
  <c r="C9" t="inlineStr"><is><t>停场</t></is></c><c r="D9" t="inlineStr"><is><r><t>液压</t></r><r><t>检查</t></r></is></c></row></sheetData></worksheet>`;
const entries = {
  "[Content_Types].xml": '<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
  "xl/workbook.xml": '<workbook xmlns:r="urn:rel"><workbookPr date1904="1"/><sheets><sheet name="工作单" r:id="rId1"/></sheets></workbook>',
  "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Type="urn:test/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  "xl/sharedStrings.xml": '<sst><si><t>B0001</t></si></sst>',
  "xl/worksheets/sheet1.xml": sheet
};

test("CSV source digest is computed from bytes and survives renaming, with physical row numbers", async () => {
  const content = `\uFEFF${headers}\r\n\r\n2026-11-09,BTEST,停场,"液压,检查","第一行\n第二行",999\r\n${row}`;
  const first = await parseNonroutineImportFile(payload(content));
  const renamed = await parseNonroutineImportFile(payload(content, "renamed.csv"));
  assert.equal(first.fileSha256, renamed.fileSha256);
  assert.deepEqual(first.rows.map(item => item.rowNumber), [3, 5]);
  assert.equal(first.rows[0].title, "液压,检查");
  assert.equal(first.rows[0].reportExplanation, "第一行\n第二行");
  assert.equal(first.rows[0].standardHours, "999");
  const different = await parseNonroutineImportFile(payload(`${headers}\n${row}changed`));
  assert.notEqual(first.fileSha256, different.fileSha256);
});

test("XLSX preserves sparse source rows, shared text, rich text and the 1904 date epoch", async () => {
  const file = zipFixture(entries, { compressed: true });
  const parsed = await parseNonroutineImportFile({ ...payload(file, "work.xlsx"), sheetName: "工作单" });
  assert.equal(parsed.sheetName, "工作单");
  assert.equal(parsed.rows[0].rowNumber, 9);
  assert.equal(parsed.rows[0].aircraftNo, "B0001");
  assert.equal(parsed.rows[0].title, "液压检查");
  assert.equal(parsed.rows[0].date, "1904-01-02");
  await assert.rejects(() => parseNonroutineImportFile({ ...payload(file, "work.xlsx"), sheetName: "不存在" }), /工作表/);
});

test("formula rows are blocked without executing cached XLSX values or CSV expressions", async () => {
  const formula = zipFixture({ ...entries, "xl/worksheets/sheet1.xml": sheet.replace('<c r="D9"', '<c r="E9"><f>HYPERLINK("https://invalid.example")</f><v>3</v></c><c r="D9"') });
  const xlsx = await parseNonroutineImportFile(payload(formula, "formula.xlsx"));
  assert.match(xlsx.rows[0]._sourceError, /公式/);
  const csv = await parseNonroutineImportFile(payload(`${headers}\n2026-11-09,BTEST,停场,=1+2,范围,999`));
  assert.match(csv.rows[0]._sourceError, /公式/);
});

test("file intake rejects mismatched formats, invalid base64, XML entities and unsafe ZIP content", async () => {
  await assert.rejects(() => parseNonroutineImportFile({ filename: "a.csv", contentBase64: "YWJj===x" }), { status: 400 });
  await assert.rejects(() => parseNonroutineImportFile(payload("plain text", "fake.xlsx")), { status: 400 });
  await assert.rejects(() => parseNonroutineImportFile(payload(Buffer.from([255]), "bad.csv")), { status: 400 });
  await assert.rejects(() => parseNonroutineImportFile(payload(Buffer.alloc(NONROUTINE_FILE_LIMIT + 1))), /3MiB/);
  for (const override of [
    { "xl/workbook.xml": '<!DOCTYPE a [<!ENTITY x "entity">]><workbook/>' },
    { "xl/vbaProject.bin": "macro" },
    { "../escape": "bad path" },
    { "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" TargetMode="External" Type="urn:test/worksheet" Target="https://invalid.example"/></Relationships>' }
  ]) await assert.rejects(() => parseNonroutineImportFile(payload(zipFixture({ ...entries, ...override }), "unsafe.xlsx")), { status: 400 });
});

test("duplicate columns and malformed CSV are rejected before any batch is created", async () => {
  await assert.rejects(() => parseNonroutineImportFile(payload(`${headers},日期\n${row},2026-11-09`)), /重复列/);
  await assert.rejects(() => parseNonroutineImportFile(payload(`${headers}\n"unclosed`)), /引号/);
  await assert.rejects(() => parseNonroutineImportFile(payload("日期,工作名称\n2026-11-09,检查")), /缺少/);
});

test("the existing additional-work template remains readable by the server parser", async () => {
  const bytes = await fs.readFile(new URL("../public/templates/additional-work.xlsx", import.meta.url));
  const parsed = await parseNonroutineImportFile(payload(bytes, "template.xlsx"));
  assert.ok(parsed.rows.length);
  assert.ok(parsed.rows[0].title);
});
