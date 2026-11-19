import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {maintenanceTowTransition,assertLegacyTowCreation,assertLegacyTowRuleWrites} from '../maintenance-tow-transition.mjs';
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const legacy=maintenanceTowTransition({legacyDefaultHours:3}),retired=maintenanceTowTransition({requested:true,manualReady:true,finalizationReady:true,publishedTowCount:1,legacyDefaultHours:3});
test('tow retirement is opt-in; lost readiness never revives a retired monetary key',()=>{
 assert.equal(legacy.mode,'LEGACY');assert.equal(legacy.legacyAmountWritable,true);assert.equal(retired.ready,true);assert.equal(retired.legacyAmountWritable,false);
 const unavailable=maintenanceTowTransition({requested:true});assert.equal(unavailable.mode,'STANDARD_ONLY');assert.equal(unavailable.ready,false);assert.throws(()=>assertLegacyTowRuleWrites(unavailable,[{ruleType:'nonroutineCategoryHours',name:'拖机',value:3}]),{status:409});
 assert.doesNotThrow(()=>assertLegacyTowRuleWrites(legacy,[{rule_type:'nonroutineCategoryHours',name:'拖机',value:4}]));
 assert.doesNotThrow(()=>assertLegacyTowRuleWrites(retired,[{rule_type:'nonroutineCombinationRatio',name:'主做::主做',value:1}]));
});
test('new legacy tow creation and category conversion stop while existing work and managed sources continue',()=>{
 assert.throws(()=>assertLegacyTowCreation(retired,'拖机'),{status:409});assert.throws(()=>assertLegacyTowCreation(retired,'拖机',{existingCategory:'其他'}),{status:409});
 assert.doesNotThrow(()=>assertLegacyTowCreation(retired,'拖机',{existingCategory:'拖机'}));assert.doesNotThrow(()=>assertLegacyTowCreation(retired,'拖机',{managed:true}));assert.doesNotThrow(()=>assertLegacyTowCreation(legacy,'拖机'));
});
function context(){const state={maintenanceTowTransition:retired,maintenanceRules:[{id:'tow',rule_type:'nonroutineCategoryHours',name:'拖机',value:3}],maintenanceRuleGroupsOpen:new Set(),maintenanceWorkReportDraft:{towDefaultHours:99,selections:new Map(),selectionOrder:new Map()}};
 const ctx=vm.createContext({state,subtaskCategories:['工卡指令','单项工作','拖机','其他'],maintenanceSubtaskRoles:()=>['主做'],escapeHtml:String,hasRbac:()=>true,maintenanceOpportunityOptions:[],maintenanceRolesForOpportunity:()=>[],maintenanceRatioLabel:String,renderMaintenanceAircraftHours:()=>''});
 for(const name of ['maintenanceTowStandardOnly','maintenanceLegacyCategories','maintenanceTowDefaultHours','setMaintenanceWorkContextCategory','renderMaintenanceCategoryStrategies','renderMaintenanceHours']){const start=app.indexOf(`function ${name}(`);vm.runInContext(app.slice(start,app.indexOf('\n}',start)+2),ctx);}return ctx;}
test('managed unlisted, imported and published tow amounts never inherit the old default on category selection',()=>{
 const c=context();for(const input of [{manualManaged:true,standardHours:''},{sourceFingerprint:'import',standardHours:2.3},{manualManaged:true,standardSnapshot:{standardHours:0},standardHours:0}]){const row={...input,category:'其他',roles:['主做']};c.setMaintenanceWorkContextCategory(row,'拖机');assert.equal(row.standardHours,input.standardHours);}
 const old={category:'其他',standardHours:1,roles:['主做']};c.setMaintenanceWorkContextCategory(old,'拖机');assert.equal(old.standardHours,99);
});
test('retired rule display keeps historical amount read-only and leaves the seven ratio groups available',()=>{
 const c=context(),html=c.renderMaintenanceHours();assert.match(html,/data-maint-tow-history/);assert.match(html,/旧默认 3 小时/);assert.ok(!html.includes('data-rule-type="nonroutineCategoryHours"'));assert.match(html,/7 种组合/);assert.ok(!c.maintenanceLegacyCategories().includes('拖机'));assert.ok(c.maintenanceLegacyCategories('拖机').includes('拖机'));
 c.state.maintenanceTowTransition=legacy;assert.match(c.renderMaintenanceHours(),/data-rule-type="nonroutineCategoryHours"/);
});

test('eight-category strategy summary uses the server projection and distinguishes three undecided classes from legacy work',()=>{
 const c=context();c.state.maintenanceCategoryStrategies={'工卡指令':'ROLE_COMBINATION','单项工作':'ROLE_COMBINATION','拖机':'EQUAL','三方附加':'EQUAL','试车':'EQUAL','其他':'UNDECIDED','人工除冰':'UNDECIDED','联合除冰':'UNDECIDED'};
 const html=c.renderMaintenanceCategoryStrategies();assert.equal((html.match(/· 角色组合分配/g)||[]).length,2);assert.equal((html.match(/· 有效参与人均分/g)||[]).length,3);assert.equal((html.match(/· 待业务确定/g)||[]).length,3);assert.match(html,/原有历史及旧“其他”的合法核算保留/);assert.ok(!html.includes('<input'));assert.match(html,/在途沿用提报快照/);
 c.state.maintenanceCategoryStrategies=null;assert.match(c.renderMaintenanceCategoryStrategies(),/尚未读取/);assert.ok(!c.renderMaintenanceCategoryStrategies().includes('有效参与人均分'));
});
