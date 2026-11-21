import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await fs.readFile(new URL("../server.mjs", import.meta.url), "utf8");
const start = source.indexOf("function maintenancePersonalReviewEstimates(");
const end = source.indexOf("\nfunction maintenancePersonalStats(", start);
test("personal pending estimates preserve zero, exclude other participants and remove finalized applications", () => {
  let finalized = false;
  const rows = [{ id: "zero", flight_id: "flight", date: "2026-11-11", title: "零暂估" },
    { id: "unknown", flight_id: "flight", date: "2026-11-11", title: "待分配" },
    { id: "other", flight_id: "other-flight" }];
  const sandbox = vm.createContext({
    db: { prepare: sql => ({
      all(month) { assert.equal(month, "2026-11%"); return rows; },
      get() { return sql.includes("count(*)") ? { total: 3 } : { state: "IN_REVIEW" }; }
    }) },
    maintenanceNonroutineAssessment: row => ({ participants_json: JSON.stringify([{ personId: row.id === "other" ? "someone-else" : "me" }]) }),
    maintenanceNonroutineHourAssessment: row => ({
      reviewPending: !finalized, reviewCaseId: row.id, requestedHours: 2,
      personalEstimates: [{ personId: "me", hours: row.id === "zero" ? 0 : null }]
    }),
    maintenanceDisplayFlightNo: () => "FLIGHT"
  });
  vm.runInContext(source.slice(start, end), sandbox);
  const result = sandbox.maintenancePersonalReviewEstimates("2026-11", { personId: "me" });
  assert.equal(result.count, 2);
  assert.equal(result.unallocatedCount, 1);
  assert.equal(result.estimatedHours, null);
  assert.equal(result.items[0].estimatedHours, 0);
  assert.equal(result.items[0].submittedOpinions, 3);
  assert.ok(result.items.every(item => item.reviewCaseId !== "other"));
  finalized = true;
  assert.equal(sandbox.maintenancePersonalReviewEstimates("2026-11", { personId: "me" }).count, 0);
});
