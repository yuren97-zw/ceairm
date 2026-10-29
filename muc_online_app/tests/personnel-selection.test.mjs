import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
const context = vm.createContext({ syncRecipientCheckboxes() {} });
for (const name of ["isCadrePerson", "personnelSelectionLabel", "personnelSelectionOptions", "personnelSelectionMatches", "setRecipientSelection"]) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  vm.runInContext(source.slice(start, source.indexOf("\n}", start) + 2), context);
}
const cadre = { id: "cadre", name: "干部人员", personnelGroupCode: "GROUP-LINE-CADRE", personnelGroupName: "已改名的干部目录", team: "一组" };
const worker = { id: "worker", name: "普通人员", personnelGroupCode: "GROUP-LINE-1", team: "一组" };

test("cadre selection uses fixed organization identity, not names or a stale working team", () => {
  assert.equal(context.isCadrePerson(cadre), true);
  assert.equal(context.isCadrePerson({ ...worker, personnelGroupName: "干部", position: "书记" }), false);
  assert.equal(context.personnelSelectionLabel(cadre), "干部");
  assert.equal(context.personnelSelectionMatches(cadre, "group:GROUP-LINE-CADRE"), true);
  assert.equal(context.personnelSelectionMatches(worker, "group:GROUP-LINE-CADRE"), false);
  assert.equal(context.personnelSelectionMatches(cadre, "team:一组"), false);
  assert.equal(context.personnelSelectionMatches(worker, "team:一组"), true);
  assert.equal(context.personnelSelectionMatches(cadre, ""), true);
});

test("classification options only come from the authorized candidate list and keep working-team precedence", () => {
  const result = people => JSON.parse(JSON.stringify(context.personnelSelectionOptions(people)));
  assert.deepEqual(result([worker]), [{ value: "", label: "全部人员" }, { value: "team:一组", label: "一组" }]);
  assert.deepEqual(result([cadre]), [{ value: "", label: "全部人员" }, { value: "group:GROUP-LINE-CADRE", label: "干部" }]);
  assert.equal(context.personnelSelectionLabel({ ...worker, currentWorkingTeamName: "三组", administrativeTeamName: "二组" }), "三组");
  assert.equal(context.personnelSelectionMatches({ ...worker, team: "干部" }, "group:GROUP-LINE-CADRE"), false);
});

test("selecting the filtered recipients replaces hidden selections and freezes explicit account IDs", () => {
  context.state = { allRecipientsInScope: true, selectedRecipientIds: new Set(["worker-account", "cadre-account"]), infoPeople: [] };
  context.setRecipientSelection(["cadre-account"]);
  assert.equal(context.state.allRecipientsInScope, false);
  assert.deepEqual([...context.state.selectedRecipientIds], ["cadre-account"]);
  context.state.infoPeople.push({ id: "new-cadre-account" });
  assert.deepEqual([...context.state.selectedRecipientIds], ["cadre-account"]);
  context.setRecipientSelection([]);
  assert.equal(context.state.selectedRecipientIds.size, 0);
});
