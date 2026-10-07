import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const app = await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
function loader(overrides={}) {
  const calls=[];
  const context=vm.createContext({
    state:{activePage:'personnelPage',loadedData:new Set(['settings']),personnelTab:'list',user:{}},
    personnelArea:'capability',hasRbac:()=>true,
    loadPersonnelDirectories:async purposes=>calls.push(['directories',purposes]),
    refreshPersonnel:async()=>calls.push(['list']),
    personnelService:{imports:async()=>{calls.push(['imports']);return [];}},
    refreshAuthorizationProjects:async()=>calls.push(['projects']),
    settingsService:{get:async()=>({})},authService:{withSettings:user=>user},
    ...overrides
  });
  vm.runInContext(app.slice(app.indexOf('async function loadActivePageData('),app.indexOf('\nfunction renderActivePage()',app.indexOf('async function loadActivePageData('))),context);
  return {context,calls};
}
test('capability and authorization do not preload personnel, unrelated directories or imports',async()=>{
  const {context,calls}=loader();
  await context.loadActivePageData({force:false});
  context.personnelArea='authorization';
  await context.loadActivePageData({force:false});
  assert.deepEqual(calls,[]);
});
test('master list, imports and settings load their own dependencies',async()=>{
  const {context,calls}=loader({personnelArea:'master'});
  await context.loadActivePageData({force:false});
  assert.equal(calls.some(([key])=>key==='imports'),false);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['directories',['organizations']],['list']]);
  calls.length=0;context.state.personnelTab='imports';
  await context.loadActivePageData({force:false});
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['directories',['organizations']],['imports']]);
  calls.length=0;context.state.personnelTab='settings';
  await context.loadActivePageData({force:false});
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['directories',['organizations']],['projects']]);
});
test('destination renders before slow management loading, and superseded render cannot replace it',async()=>{
  let release; const gate=new Promise(resolve=>release=resolve),renders=[];
  const context=vm.createContext({state:{activePage:'personnelPage'},personnelArea:'master',
    isLoggedIn:()=>true,clearAllDeferredReclassify:()=>{},renderShell:()=>{},
    renderActivePage:()=>renders.push(context.state.activePage),
    loadActivePageData:()=>context.state.activePage==='personnelPage'?gate:Promise.resolve(),
    syncPeopleScopedState:()=>{},startMaintenanceSync:()=>{},isAuthExpired:()=>false});
  vm.runInContext(app.slice(app.indexOf('let personnelLoading ='),app.indexOf('\nconst pullRefreshGesture',app.indexOf('let personnelLoading ='))),context);
  const first=context.renderAll();
  assert.deepEqual(renders,['personnelPage']);
  context.state.activePage='homePage';await context.renderAll();
  release();await first;
  assert.deepEqual(renders,['personnelPage','homePage']);
});
