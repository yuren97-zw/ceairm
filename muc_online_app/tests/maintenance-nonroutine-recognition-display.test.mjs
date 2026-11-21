import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const context=vm.createContext({escapeHtml:value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'),state:{maintenanceReportOpenNonroutineIds:new Set(),maintenanceReportNonroutineDetails:new Map()},maintenanceReportPagination:()=>''});
for(const name of ['maintenanceHoursLabel','maintenanceNonroutineStandardLabel','maintenanceNonroutineAuditHtml','maintenanceReportNonroutine','maintenanceReviewPerson','maintenanceReviewCalculatedHours']){
 const start=app.indexOf(`function ${name}(`);assert.ok(start>=0);vm.runInContext(app.slice(start,app.indexOf('\n}\n',start)+2),context);
}
test('actual audit and review renderers preserve cancelled missing hours separately from legitimate zero',()=>{
 const closed={id:'closed',title:'CANCELLED-WORK',standardHours:null,actualHours:null,hasResults:false,recognitionStatusLabel:'评议已取消',hourAssessment:{cancelled:true,pending:false},people:[]};
 const pending={...closed,id:'pending',title:'PENDING-WORK',recognitionStatusLabel:'评议中',hourAssessment:{pending:true,cancelled:false}};
 const zero={...closed,id:'zero',title:'ZERO-WORK',standardHours:0,actualHours:0,hasResults:true,recognitionStatusLabel:'已认定',hourAssessment:{pending:false,cancelled:false,effectiveHours:0}};
 assert.match(context.maintenanceNonroutineAuditHtml(closed),/标准总工时 <b>评议已取消<\/b>/);assert.doesNotMatch(context.maintenanceNonroutineAuditHtml(closed),/0h/);
 assert.match(context.maintenanceNonroutineAuditHtml(pending),/标准总工时 <b>评议中<\/b>/);assert.match(context.maintenanceNonroutineAuditHtml(zero),/标准总工时 <b>0h<\/b>/);assert.match(context.maintenanceNonroutineAuditHtml(zero),/实际总工时 <b>0h<\/b>/);
 const html=context.maintenanceReportNonroutine({rows:[closed,pending,zero]});assert.match(html,/data-label="标准总工时">评议已取消/);assert.match(html,/data-label="标准总工时">评议中/);assert.match(html,/data-label="标准总工时">0h/);
 const task={assignments:[{personId:'p',role:'主做',reportedHours:0}],changed:false};assert.equal(context.maintenanceReviewCalculatedHours({...task,hourAssessment:closed.hourAssessment},'主做','p'),null);assert.equal(context.maintenanceReviewCalculatedHours({...task,hourAssessment:zero.hourAssessment},'主做','p'),0);
});
