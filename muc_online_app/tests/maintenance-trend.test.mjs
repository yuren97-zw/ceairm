import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const app = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
const start = app.indexOf("function maintenanceTrendDayNumber(");
const end = app.indexOf("\nfunction maintenanceCompositionView(", start);
assert.ok(start >= 0 && end > start);

const context = vm.createContext({
  escapeHtml: value => String(value),
  maintenanceHoursLabel: value => String(Number(value || 0))
});
vm.runInContext(app.slice(start, end), context);

test("confirmed trend path breaks on zero values and missing calendar days", () => {
  const points = [
    { date: "2026-09-01", total: 2 },
    { date: "2026-09-02", total: 3 },
    { date: "2026-09-03", total: 0 },
    { date: "2026-09-04", total: 4 },
    { date: "2026-09-06", total: 5 }
  ];
  const path = context.maintenanceConfirmedTrendPath(points, index => index * 10, value => 100 - value);
  assert.equal(path, "M0.0,98.0 L10.0,97.0 M30.0,96.0 M40.0,95.0");
});

test("routine, nonroutine and pending hours share one stacked column", () => {
  const svg = context.maintenanceTrendSvg([{
    date: "2026-09-01",
    total: 3,
    routine: 2,
    nonroutine: 1,
    pendingTotal: 1,
    pendingRoutine: 0.4,
    pendingNonroutine: 0.6
  }]);
  const rects = [...svg.matchAll(/<rect class="maintenance-chart-bar ([^"]+)"[^>]* x="([^"]+)" y="([^"]+)"[^>]* height="([^"]+)"/g)];
  assert.equal(rects.length, 4);
  assert.equal(new Set(rects.map(match => match[2])).size, 1);
  assert.deepEqual(rects.map(match => match[1]), ["routine", "nonroutine", "routine pending", "nonroutine pending"]);
  assert.deepEqual(rects.map(match => Number(match[3])), [...rects.map(match => Number(match[3]))].sort((a, b) => b - a));
  assert.ok(rects.every(match => Number(match[4]) > 0));
});
