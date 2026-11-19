import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
const start = source.indexOf("  async loadMaintenance(force = false)");
const end = source.indexOf("\n};", start);
const loader = source.slice(start, end);
const navigationStart = source.indexOf("async function gotoMaintenanceFromHome(");
const navigationEnd = source.indexOf("\nfunction statusPass(", navigationStart);

function context(apiRequest) {
  const state = { user: { id: "account", personId: "person" }, maintenanceExecuteLocation: "qingdao" };
  const sandbox = vm.createContext({
    state, apiRequest, URLSearchParams, isLoggedIn: () => true, canView: () => true,
    hasRbac: () => true, renderHome() {}, isAuthExpired: () => false,
    maintenanceAssignmentsForMeFrom: flights => flights.map(flight => ({ flight }))
  });
  vm.runInContext(`service = { maintenanceSeq: 0, ${loader} };`, sandbox);
  return sandbox;
}

test("homepage reads the full pending set in one request independently of location and deduplicates IDs", async () => {
  const urls = [];
  const sandbox = context(async url => {
    urls.push(url);
    return { flights: [...Array.from({ length: 501 }, (_, id) => ({ id: String(id) })), { id: "499" }], nextCursor: "" };
  });
  assert.equal(await sandbox.service.loadMaintenance(), true);
  assert.equal(sandbox.state.homeMaintenanceGroups.length, 501);
  assert.equal(sandbox.state.homeMaintenanceNextCursor, "");
  assert.ok(urls.every(url => !url.includes("locationId")));
  assert.equal(urls.length, 1);
  assert.equal(new URL("http://local" + urls[0]).searchParams.has("limit"), false);
});

test("request failures and unexpected pagination produce an error instead of a truncated ready count", async () => {
  for (const fail of [true, false]) {
    let count = 0;
    const sandbox = context(async () => {
      if (++count && fail) throw new Error("分页失败");
      return { flights: [{ id: "one" }], nextCursor: "repeat" };
    });
    assert.equal(await sandbox.service.loadMaintenance(), false);
    assert.equal(sandbox.state.homeMaintenanceState, "error");
    assert.equal(sandbox.state.homeMaintenanceFlights, undefined);
  }
});

test("home navigation revalidates revoked opportunities before switching pages", async () => {
  let switched = false, refreshed = false;
  const alerts = [];
  const sandbox = vm.createContext({
    state: { homeMaintenanceFlights: [{ id: "revoked" }] },
    canView: () => true,
    maintenanceAssignmentsForMeFrom: flights => flights.map(flight => ({ flight })),
    window: { scrollY: 123 },
    maintenanceService: { async getFlight() { throw new Error("未找到可访问的维修机会"); } },
    homeDataService: { async loadMaintenance() { refreshed = true; } },
    alert: message => alerts.push(message),
    showPage() { switched = true; }
  });
  vm.runInContext(source.slice(navigationStart, navigationEnd), sandbox);
  await sandbox.gotoMaintenanceFromHome("revoked");
  assert.equal(switched, false);
  assert.equal(refreshed, true);
  assert.match(alerts[0], /可访问/);
});

test("home navigation uses the fresh exact opportunity and aligns the execution location", async () => {
  let opened = "", scrolled = false;
  const fresh = { id: "target", date: "2026-11-11", locationId: "other-site" };
  const state = {
    homeMaintenanceFlights: [{ id: "target", date: "old" }],
    maintenanceFlights: [{ id: "target", date: "old" }],
    maintenanceExecuteLocation: "qingdao",
    loadedData: new Set(["maintenance:execute"])
  };
  const sandbox = vm.createContext({
    state, Set, canView: () => true,
    maintenanceAssignmentsForMeFrom: flights => flights.map(flight => ({ flight })),
    window: { scrollY: 321 },
    maintenanceService: { async load() { state.maintenanceFlights = []; }, async getFlight(id, scope) { assert.equal(id, "target"); assert.equal(scope, "execute"); return fresh; } },
    async showPage(page) { opened = page; },
    renderMaintenance() {}, requestAnimationFrame: resolve => resolve(),
    cssEscapeValue: value => value,
    document: { querySelector: selector => {
      assert.match(selector, /data-maint-execute-toggle="target"/);
      return { scrollIntoView() { scrolled = true; } };
    } }
  });
  vm.runInContext(source.slice(navigationStart, navigationEnd), sandbox);
  await sandbox.gotoMaintenanceFromHome("target");
  assert.equal(opened, "maintenancePage");
  assert.equal(state.maintenanceExecuteLocation, "other-site");
  assert.equal(state.maintenanceExecuteOpenFlightId, "target");
  assert.equal(state.maintenanceExecuteOpenDate, fresh.date);
  assert.equal(state.maintenanceFlights.length, 1);
  assert.equal(state.maintenanceFlights[0], fresh);
  assert.equal(scrolled, true);
  assert.equal(state.homeScrollY, 321);
});

test('browser home history is account-bound, restores zero and revalidates the exact target on forward',async()=>{
 const writes=[],state={user:{id:'current'},homeScrollY:0,activePage:'maintenancePage'};
 const sandbox=vm.createContext({state,Number,Math,ROUTES:{dashboard:'/dashboard'},currentRoute:()=>'/dashboard',isLoggedIn:()=>true,window:{location:{href:'http://local/dashboard'},history:{replaceState:value=>writes.push(value),pushState:value=>writes.push(value)}},async showPage(page){state.activePage=page;}});
 vm.runInContext(source.slice(navigationStart,navigationEnd),sandbox);
 sandbox.rememberHomeMaintenanceNavigation('exact');assert.equal(writes.length,2);assert.equal(writes[0].mucHomeMaintenance.kind,'home');assert.equal(writes[1].mucHomeMaintenance.flightId,'exact');
 assert.equal(await sandbox.restoreHomeMaintenanceHistory({state:{mucHomeMaintenance:{accountId:'other',kind:'home'}}}),false);
 assert.equal(await sandbox.restoreHomeMaintenanceHistory({state:writes[0]}),true);assert.equal(state.activePage,'homePage');assert.equal(state.homeScrollY,0);assert.equal(state.homeScrollRestorePending,true);
 let target,options;sandbox.gotoMaintenanceFromHome=async(id,settings)=>{target=id;options=settings;};await sandbox.restoreHomeMaintenanceHistory({state:writes[1]});assert.equal(target,'exact');assert.equal(options.recordHistory,false);
});
test('cancelled navigation away from a correction editor restores its history entry',async()=>{
 const writes=[],state={user:{id:'current'},activePage:'maintenancePage'};
 const sandbox=vm.createContext({state,Number,Math,ROUTES:{dashboard:'/dashboard'},currentRoute:()=>'/dashboard',isLoggedIn:()=>true,window:{location:{href:'/dashboard'},history:{pushState:value=>writes.push(value)}},async showPage(){}});
 vm.runInContext(source.slice(navigationStart,navigationEnd),sandbox);await sandbox.restoreHomeMaintenanceHistory({state:{mucHomeMaintenance:{accountId:'current',kind:'home',flightId:'exact',scrollY:23}}});assert.equal(state.activePage,'maintenancePage');assert.equal(writes[0].mucHomeMaintenance.kind,'execute');
});
