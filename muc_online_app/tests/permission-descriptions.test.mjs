import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {RBAC_PERMISSION_DEFINITIONS,RBAC_PERMISSION_DEPENDENCIES,visibleNavigationTree} from '../rbac-policy.mjs';
import {PERMISSION_DESCRIPTIONS,permissionHelp} from '../permission-descriptions.mjs';
test('every permission has concrete help and dependencies match policy',()=>{
 assert.equal(Object.keys(PERMISSION_DESCRIPTIONS).length,RBAC_PERMISSION_DEFINITIONS.length);
 for(const [code,name,module] of RBAC_PERMISSION_DEFINITIONS){const help=permissionHelp({code,name,module});assert.ok(help.description.length>5 && help.description!==name,code);assert.deepEqual(help.dependencies.map(item=>item.code),RBAC_PERMISSION_DEPENDENCIES[code]||[]);assert.equal(help.name,name);}
});
test('role selector preserves checkbox values while rendering escaped help and full directory',()=>{
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),body={innerHTML:''};let shown=0;
 const permissions=RBAC_PERMISSION_DEFINITIONS.map(([code,name,module])=>permissionHelp({code,name,module}));
 const context=vm.createContext({state:{rbacCatalog:{permissions,roles:[]},user:{id:'test'}},hasRbac:()=>false,SUPER_ACCOUNT_ID:'54002010',$:s=>s==='#roleDialogBody'?body:{showModal:()=>shown++}});
 const extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
 vm.runInContext(extract('function escapeHtml(', 'function sanitizeRichHtml(')+extract('function permissionHelpHtml(', 'function renderGeneralSettings('),context);
 vm.runInContext('openRoleDialog({permissions:["roles.manage"],name:"测试"})',context);
 assert.equal(shown,1);assert.equal((body.innerHTML.match(/name="rolePermissions"/g)||[]).length,permissions.length);
 assert.match(body.innerHTML,/value="roles.manage" checked/);assert.match(body.innerHTML,/前置权限：查看角色权限/);
 assert.ok(vm.runInContext('renderRbacCatalog()',context).includes(`全部权限说明（${permissions.length} 项）`));
 context.item={code:'<code>',name:'<script>',description:'<img>',dependencies:[]};const html=vm.runInContext('permissionHelpHtml(item)',context);assert.ok(!html.includes('<img>'));assert.match(html,/&lt;script&gt;/);
});


test('performance preview and actual navigation require the same independent permission', () => {
 const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
 const context = vm.createContext({});
 const start = source.indexOf('function visibleNavigationFromPermissions(');
 vm.runInContext(source.slice(start, source.indexOf('const pageLabels', start)), context);
 for (const codes of [[], ['maintenance.stats.self.view'], ['maintenance.stats.manage.view'], ['performance.view'], ['maintenance.stats.manage.view', 'performance.view']]) {
   const nav = visibleNavigationTree(codes);
   const expected = codes.includes('performance.view');
   assert.equal(nav.some(page => page.id === 'hoursPage'), expected);
   assert.equal(context.visibleNavigationFromPermissions(new Set(codes)).includes('绩效管理'), expected);
   assert.equal(nav.some(page => page.children.some(child => child.id === 'hours')), codes.includes('maintenance.stats.manage.view'));
 }
 assert.ok(visibleNavigationTree([], true).some(page => page.id === 'hoursPage'));
});
