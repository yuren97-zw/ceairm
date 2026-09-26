import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const app = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
const context = vm.createContext({});
for (const name of ["normalizeHeader", "excelSerialToDate", "maintenanceImportDate", "maintenanceRowsFromRows", "maintenanceSubtaskRowsFromRows"]) {
  const start = app.indexOf(`function ${name}(`);
  const end = app.indexOf("\n}", start) + 2;
  assert.ok(start >= 0 && end > start);
  vm.runInContext(app.slice(start, end), context);
}
const parse = rows => JSON.parse(JSON.stringify(context.maintenanceRowsFromRows(rows)));
const parseSubtasks = rows => JSON.parse(JSON.stringify(context.maintenanceSubtaskRowsFromRows(rows)));

test("unrecognized operational plan headers cannot fall through to positional import", () => {
  assert.throws(() => parse([["机号", "机型", "代理", "进港航班", "前站", "实飞", "预落"], ["B6886", "325", "N", "MU6863", "浦东", "0637", "0737"]]), /未识别到/);
  assert.throws(() => parse([["日期", "机号", "进港航班"], ["2026-09-01", "B6886", "MU6863"]]), /缺少列：航班号/);
});

test("supported headers and headerless template rows normalize dates for dispatch filtering", () => {
  const rows = parse([["航班日期", "机号", "航班号", "维修机会"], ["2026/9/1", "B6886", "MU6863", "短停"]]).rows;
  assert.equal(rows[0].date, "2026-09-01");
  assert.equal(rows[0].aircraftNo, "B6886");
  assert.equal(rows[0].flightNo, "MU6863");
  assert.equal(parse([["2026.9.1", "MU6863", "B6886"]]).rows[0].date, "2026-09-01");
  assert.equal(parse([["日期", "航班号", "机号"], ["25569", "MU6863", "B6886"]]).rows[0].date, "1970-01-01");
  assert.equal(rows[0].departureFlightNo, "");
});

test("optional departure flight number imports by header or appended positional column", async () => {
  const named = parse([["日期", "进港航班号", "机号", "出港航班号"], ["2026-07-12", "MU6406&", "B-6406", "MU6407"]]).rows[0];
  assert.equal(named.flightNo, "MU6406&");
  assert.equal(named.departureFlightNo, "MU6407");
  const positional = parse([["2026-07-12", "MU6406&", "B-6406", "A321", "117", "0043+", "0130", "航后", "", "", "", "", "", "MU6407"]]).rows[0];
  assert.equal(positional.departureFlightNo, "MU6407");
  const template = await fs.readFile(new URL("../航班计划导入模板.csv", import.meta.url), "utf8");
  assert.equal(template.trim().split(",").at(-1), "出港航班号");
});

test("invalid dates and missing identifiers stop the whole import", () => {
  for (const date of ["B6886", "2026-02-30", "2026-13-01", ""]) {
    assert.throws(() => parse([["日期", "航班号", "机号"], [date, "MU6863", "B6886"]]), /无效/);
  }
  assert.throws(() => parse([["日期", "航班号", "机号"], ["2026-09-01", "", "B6886"]]), /无效/);
});

test("additional work import requires its dedicated headers and preserves matching fields", () => {
  assert.throws(() => parseSubtasks([["日期", "进港航班号", "机号"], ["2026-09-22", "MU6406", "B8976"]]), /缺少列/);
  const parsed = parseSubtasks([
    ["日期", "进港航班号", "出港航班号", "机号", "维修机会", "工作编号", "章节", "工作标题", "非例行类别", "标准工时", "报工说明", "优先级", "备注"],
    ["2026/9/22", "MU6406&", "MU6407", "B8976", "航后", "NR-001", "09", "拖机", "拖机", "3", "完成拖机", "重要", "现场备注"]
  ]).rows[0];
  assert.equal(parsed.date, "2026-09-22");
  assert.equal(parsed.flightNo, "MU6406&");
  assert.equal(parsed.departureFlightNo, "MU6407");
  assert.equal(parsed.externalWorkNo, "NR-001");
  assert.equal(parsed.category, "拖机");
  assert.equal(parsed.standardHours, 3);
});
