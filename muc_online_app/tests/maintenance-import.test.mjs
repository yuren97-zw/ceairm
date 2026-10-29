import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const app = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
const context = vm.createContext({});
for (const name of ["normalizeHeader", "excelSerialToDate", "maintenanceImportDate", "maintenanceFlightNumberError", "maintenanceRowsFromRows", "maintenanceSubtaskRowsFromRows", "maintenanceDispatchRowsFromRows"]) {
  const start = app.indexOf(`function ${name}(`);
  const end = app.indexOf("\n}", start) + 2;
  assert.ok(start >= 0 && end > start);
  vm.runInContext(app.slice(start, end), context);
}
const parse = rows => JSON.parse(JSON.stringify(context.maintenanceRowsFromRows(rows)));
const parseSubtasks = rows => JSON.parse(JSON.stringify(context.maintenanceSubtaskRowsFromRows(rows)));
test('routine dispatch full headers and sparse Excel rows retain true row numbers',()=>{
  const row=['45940','/FM9229#&','航前','丁泽民','修群,滕佳宁','',''];row.sourceRowNumber=17;
  const result=context.maintenanceDispatchRowsFromRows([['日期','航班号（进港/出港）','维修机会','放行人员（只能填一个人）','维修人员（xxx,xxx,xxx）','放行工号（选填）','维修工号（选填）'],[],row]);
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].rowNumber,17);assert.equal(result.rows[0].flightNo,'/FM9229#&');assert.equal(result.rows[0].releaseNames,'丁泽民');assert.equal(result.rows[0].mechanicNumbers,'');
});
test('unified dispatch file parser preserves failed rows and comma-separated personnel',()=>{
  const parsed=context.maintenanceDispatchRowsFromRows([['日期','航班号','维修机会','放行人员','维修人员'],['2026/10/09','MU1/MU2','短停','张三','李四,王五'],['bad','MU3','航后','','李四']]);
  assert.equal(parsed.rows.length,2);assert.equal(parsed.rows[0].date,'2026-10-09');assert.equal(parsed.rows[0].mechanicNames,'李四,王五');assert.equal(parsed.rows[1].date,'bad');assert.equal(parsed.rows[1].rowNumber,3);
  assert.match(app,/data-maint-import>导入<\/button>/);
  assert.ok(!app.includes('data-maint-subtask-import>导入附加工作'));
});

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
  assert.deepEqual(template.trim().split(",").slice(-2), ["出港航班号", "作业地点"]);
  const located = parse([["日期", "航班号", "机号", "作业地点"], ["2026-07-12", "MU6406", "B-6406", "延吉"]]).rows[0];
  assert.equal(located.locationName, "延吉");
});

test("invalid dates and missing identifiers retain original rows for batch validation", () => {
  for (const date of ["B6886", "2026-02-30", "2026-13-01", ""]) {
    assert.match(parse([["日期", "航班号", "机号"], [date, "MU6863", "B6886"]]).errors[0].detail, /无效/);
  }
  assert.match(parse([["日期", "航班号", "机号"], ["2026-09-01", "", "B6886"]]).errors[0].detail, /无效/);
});

test("preflight imports use departure numbers and ground work permits empty numbers", () => {
  const headers = ["日期", "出港航班号", "机号", "维修机会"];
  const row = parse([headers, ["2026-10-06", "MU1001", "B-TEST", "航前"]]).rows[0];
  assert.equal(row.flightNo, "");
  assert.equal(row.departureFlightNo, "MU1001");
  assert.match(parse([headers, ["2026-10-06", "", "B-TEST", "三方航前"]]).errors[0].detail, /出港航班号/);
  assert.match(parse([headers, ["2026-10-06", "MU1001", "B-TEST", "航后"]]).errors[0].detail, /进港航班号/);
  assert.equal(parse([headers, ["2026-10-06", "", "B-TEST", "停场"]]).rows.length, 1);
});

test('flight plan full location header and blank lines preserve Excel row numbers',()=>{
 const result=parse([['日期','进港航班号','出港航班号','机号','机型','机位','计划落地时间','计划起飞时间','维修机会','作业地点（青岛可以不填）'],[],['2026-10-11','MU1','','B1','A320','111','1530','1900','航后','延吉'],[],['bad','MU2','','B2','','','','','航后','']]);
 assert.equal(result.rows[0].locationName,'延吉');assert.equal(result.rows[0].rowNumber,3);assert.equal(result.errors[0].rowNumber,5);
});

test("additional work import requires its dedicated headers and preserves matching fields", () => {
  assert.throws(() => parseSubtasks([["日期", "进港航班号", "机号"], ["2026-09-22", "MU6406", "B8976"]]), /缺少列/);
  const parsed = parseSubtasks([
    ["日期", "进港航班号", "出港航班号", "机号", "维修机会", "章节", "工作标题", "非例行类别", "标准工时"],
    ["2026/9/22", "MU6406&", "MU6407", "B8976", "航后", "09", "拖机", "拖机", "3"]
  ]).rows[0];
  assert.equal(parsed.date, "2026-09-22");
  assert.equal(parsed.flightNo, "MU6406&");
  assert.equal(parsed.departureFlightNo, "MU6407");
  assert.equal(parsed.chapter, "09");
  assert.equal(parsed.externalWorkNo, undefined);
  assert.equal(parsed.category, "拖机");
  assert.equal(parsed.standardHours, 3);
  assert.equal(parseSubtasks([['日期','进港航班号','出港航班号','机号','维修机会','章节','工作标题','非例行类别','标准工时'],['2026-10-10','MU1','','B1','航后','  ','工作','其他',1]]).rows[0].chapter,'');
});
test('additional work supports the new location header and preserves sparse row numbers',()=>{
  const row=['2026-10-10','FM9229#&','FM9229#&','B5369','短停','延吉',27,'测试发动机','工卡指令',1];row.sourceRowNumber=16;
  const result=parseSubtasks([['日期','进港航班号','出港航班号','机号','维修机会','作业地点（不输入默认为青岛）','章节','工作标题','非例行类别','标准工时'],[],row]);
  assert.equal(result.rows[0].locationName,'延吉');assert.equal(result.rows[0].rowNumber,16);assert.equal(result.rows[0].chapter,'27');
});
