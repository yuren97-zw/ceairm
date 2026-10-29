import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
const context = vm.createContext({
  escapeHtml: value => String(value),
  maintenanceFlightMonthDay: () => "10.08",
  maintenanceOpportunityTag: () => "短停"
});
for (const name of ["maintenanceFlightPrimaryHtml", "maintenanceFlightSecondaryHtml"]) {
  const start = source.indexOf(`function ${name}(`);
  vm.runInContext(source.slice(start, source.indexOf("\n}", start) + 2), context);
}

test("flight cards put incoming flight in the header, stand first and location last in the secondary row", () => {
  const flight = { aircraftNo: "B6757", aircraftType: "A319", flightNo: "MU6666", departureFlightNo: "MU7788", stand: "123", plannedArrival: "1111", plannedDeparture: "1211", locationName: "青岛" };
  const primary = context.maintenanceFlightPrimaryHtml(flight);
  const secondary = context.maintenanceFlightSecondaryHtml(flight);
  assert.ok(primary.indexOf("B6757") < primary.indexOf("MU6666"));
  assert.ok(primary.indexOf("MU6666") < primary.indexOf("A319"));
  assert.ok(!primary.includes("机位"));
  assert.ok(secondary.indexOf("机位 123") < secondary.indexOf("落地 1111"));
  assert.ok(secondary.indexOf("起飞 1211") < secondary.indexOf("MU7788"));
  assert.ok(secondary.indexOf("MU7788") < secondary.indexOf("青岛"));
  assert.ok(!secondary.includes("MU6666"));
  const departureOnly = context.maintenanceFlightSecondaryHtml({ ...flight, flightNo: "" });
  assert.ok(departureOnly.includes("MU7788"));
  assert.ok(!departureOnly.includes("落地"));
});

test("maintenance form exchanges opportunity and location while retaining time field order", () => {
  const start = source.indexOf("function maintenanceFlightFormHtml(");
  const form = source.slice(start, source.indexOf("\n}", start));
  assert.ok(form.indexOf('id="maintStand"') < form.indexOf('id="maintWorkKind"'));
  assert.ok(form.indexOf('id="maintWorkKind"') < form.indexOf('id="maintArrival"'));
  assert.ok(form.indexOf('id="maintArrival"') < form.indexOf('id="maintDeparture"'));
  assert.ok(form.indexOf('id="maintDeparture"') < form.indexOf('id="maintLocationName"'));
});
