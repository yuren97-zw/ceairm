import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const app = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
const context = vm.createContext({});
for (const name of ["normalizeHeader", "excelSerialToDate", "maintenanceImportDate", "maintenanceRowsFromRows"]) {
  const start = app.indexOf(`function ${name}(`);
  const end = app.indexOf("\n}", start) + 2;
  assert.ok(start >= 0 && end > start);
  vm.runInContext(app.slice(start, end), context);
}
const parse = rows => JSON.parse(JSON.stringify(context.maintenanceRowsFromRows(rows)));

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
});

test("invalid dates and missing identifiers stop the whole import", () => {
  for (const date of ["B6886", "2026-02-30", "2026-13-01", ""]) {
    assert.throws(() => parse([["日期", "航班号", "机号"], [date, "MU6863", "B6886"]]), /无效/);
  }
  assert.throws(() => parse([["日期", "航班号", "机号"], ["2026-09-01", "", "B6886"]]), /无效/);
});
