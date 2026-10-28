import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {today} from '../capability-core.mjs';
import {statusPeopleColumns,statusPersonGroup,statusPersonEnd} from '../capability-ui/status-people.js';

const require = createRequire(import.meta.url);
const result = await build({entryPoints:[fileURLToPath(new URL('../capability-ui/StatusPeoplePool.jsx',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',plugins:[{name:'shared-react',setup(builder){builder.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:pathToFileURL(require.resolve(args.path)).href,external:true}));}}]});
const {StatusPeoplePool} = await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const person=(id,extra={})=>({id,name:id,administrativeGroup:'一组',...extra});
const snap={people:[person('派驻甲'),person('培训乙'),person('其他丙')],states:[{personId:'派驻甲',status:'DEPLOYED',recordId:'d'},{personId:'培训乙',status:'TRAINING',recordId:'t'},{personId:'其他丙',status:'OTHER',recordId:'o'}],records:[{id:'d',phase:'ACTIVE',label:'延吉',start_date:'2026-10-18',end_date:''},{id:'t',phase:'ACTIVE',label:'长培训项目名称',start_date:'2026-10-18',end_date:today()},{id:'o',phase:'ACTIVE',label:'其他状态',start_date:'',end_date:'2020-01-01'}]};
const render=(extra={})=>renderToStaticMarkup(React.createElement(StatusPeoplePool,{snap,open:true,onToggle:()=>{},onPerson:()=>{},onManage:()=>{},recordLabel:r=>r?.label,readOnly:true,...extra}));

test('one disclosure contains ordered columns, total and per-column counts',()=>{
  const html=render();assert.equal((html.match(/class="status-people-toggle"/g)||[]).length,1);assert.match(html,/状态人员 · 3人/);
  assert.ok(html.indexOf('aria-label="派驻中"')<html.indexOf('aria-label="培训中"'));
  assert.ok(html.indexOf('aria-label="培训中"')<html.indexOf('aria-label="其他状态"'));
  assert.equal((html.match(/<span>1人<\/span>/g)||[]).length,3);
  assert.match(render({open:false}),/aria-expanded="false"/);
  assert.doesNotMatch(render({open:false}),/class="status-people-columns"/);
  assert.match(html,/aria-expanded="true"/);
});
test('current scoped people only, planned and ended records cannot appear',()=>{
  const filtered=structuredClone(snap);filtered.states.push({personId:'outside',status:'DEPLOYED',recordId:'p'});
  filtered.records[0].phase='PLANNED';filtered.records[1].phase='ENDED';
  assert.deepEqual(statusPeopleColumns(filtered).map(c=>c.items.length),[0,0,1]);
});
test('date hints cover today, 7 days, distant, unknown, invalid and past dates',()=>{
  const day='2026-10-18';assert.deepEqual(statusPersonEnd('',day),{text:'结束未定',soon:false});
  assert.deepEqual(statusPersonEnd(day,day),{text:'今天结束',soon:true});
  assert.deepEqual(statusPersonEnd('2026-10-25',day),{text:'7天后结束',soon:true});
  assert.deepEqual(statusPersonEnd('2026-11-02',day),{text:'15天后结束',soon:false});
  assert.deepEqual(statusPersonEnd('2026-10-17',day),{text:'结束日期已过',soon:false});
  assert.deepEqual(statusPersonEnd('2026-02-30',day),{text:'结束待核实',soon:false});
});
test('administrative group wins over working group and special/unassigned are explicit',()=>{
  assert.equal(statusPersonGroup(person('a'),{workingGroup:'四组'}),'一组');
  assert.equal(statusPersonGroup(person('b',{personnelGroupCode:'GROUP-LINE-SPECIAL'}),{}),'特殊组');
  assert.equal(statusPersonGroup({administrativeUnit:'设备保障班'},{}),'设备保障班');
  assert.equal(statusPersonGroup({},{}),'待调配');
});
test('dates remain complete, empty dates stay unknown, past does not become today',()=>{
  const html=render();assert.match(html,/aria-label="开始日期">2026-10-18/);assert.match(html,/结束未定/);
  assert.match(html,/开始待核实/);assert.match(html,/aria-label="结束日期">2020-01-01/);assert.match(html,/结束日期已过/);
  assert.doesNotMatch(html,/>起 |>(?:止) /);
  assert.match(html,/长培训项目名称/);
});
test('read-only hides management and editable cards have person-targeted management labels',()=>{
  assert.doesNotMatch(render(),/class="status-people-manage"/);
  const html=render({readOnly:false});assert.equal((html.match(/class="status-people-manage"/g)||[]).length,3);
  assert.match(html,/前往派驻中管理：派驻甲/);
  assert.equal((html.match(/class="status-people-open"/g)||[]).length,3);
});
test('empty columns remain present, sort by end then name with indefinite last',()=>{
  const s=structuredClone(snap);s.people.push(person('早到期'),person('未知日期'));s.states.push({personId:'早到期',status:'DEPLOYED',recordId:'early'},{personId:'未知日期',status:'DEPLOYED'});s.records.push({id:'early',phase:'ACTIVE',end_date:'2026-10-21'});
  assert.equal(statusPeopleColumns(s)[0].items[0].person.id,'早到期');
  assert.equal((render({snap:{people:[],states:[],records:[]}}).match(/暂无人员/g)||[]).length,3);
});
test('layout fixes three shrinkable columns and independent scroll while preserving lane guards',()=>{
  const css=fs.readFileSync(new URL('../capability-ui/center.css',import.meta.url),'utf8');
  assert.match(css,/\.status-people-columns\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.status-people-list\{[^}]*max-height:340px;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain/);
  assert.match(css,/@media\(max-width:750px\)\{\s*\.status-people-columns[^}]+\}\s*\.status-people-list\{max-height:300px/);
  assert.match(css,/height:360px;min-height:360px;max-height:360px/);
  const source=fs.readFileSync(new URL('../capability-ui/Center.jsx',import.meta.url),'utf8');
  assert.match(source,/\[statusPeopleOpen,setStatusPeopleOpen\]=useState\(false\)/);
  assert.match(source,/StatusPeoplePool snap=\{snap\} open=\{statusPeopleOpen\} onToggle=\{setStatusPeopleOpen\}/);
  assert.doesNotMatch(source,/const statusPool=kind/);
});

test('large refreshed snapshots retain open rendering and all long content',()=>{
  const large={people:[],states:[],records:[]};
  for(let i=0;i<90;i++){
    const kind=['DEPLOYED','TRAINING','OTHER'][i%3],id=`person-${i}`,recordId=`record-${i}`;
    large.people.push(person(id,{name:'多人和长姓名布局测试'+i}));
    large.states.push({personId:id,status:kind,recordId});
    large.records.push({id:recordId,phase:'ACTIVE',label:'完整保留的长地点或培训项目名称'+i,start_date:'2026-10-18',end_date:i%2?'2027-12-31':''});
  }
  const html=render({snap:large,open:true});assert.match(html,/状态人员 · 90人/);
  assert.equal((html.match(/class="status-people-card/g)||[]).length,90);
  assert.equal((html.match(/<span>30人<\/span>/g)||[]).length,3);
  assert.match(html,/完整保留的长地点或培训项目名称89/);assert.match(html,/aria-label="结束日期">2027-12-31/);
  assert.match(html,/aria-expanded="true"/);
});

test('fixed dock has non-scrolling headers and independently bounded content, no shared vertical scroll',()=>{
  const css=fs.readFileSync(new URL('../capability-ui/center.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/\.people-secondary-pools:has\([^}]*\{/);
  assert.match(css,/\.status-people-pool\{flex:0 1 auto/);
  assert.match(css,/\.people-secondary-pools\{[^}]*flex:0 1 auto[^}]*overflow:hidden/);
  assert.match(css,/\.dock-pool-toggle\{flex:0 0 auto/);
  assert.match(css,/\.dock-pool>\.pool\{[^}]*overflow:auto/);
  assert.match(css,/\.status-people-footer\{display:flex;flex-wrap:wrap/);
  const html=render({readOnly:false});
  assert.equal((html.match(/class="status-people-footer"/g)||[]).length,3);
  assert.doesNotMatch(html,/>起 |>(?:止) /);
});

test('group order uses administrative groups, other organizations then unassigned; ties use end and name',()=>{
  const entries=[['unknown',{},''],['otherB',{administrativeGroup:'',administrativeUnit:'乙班'},'2026-10-19'],['four',{administrativeGroup:'四组'},'2026-10-19'],['special',{personnelGroupCode:'GROUP-LINE-SPECIAL'},'2026-10-19'],['otherA',{administrativeGroup:'',administrativeUnit:'甲班'},'2026-10-19'],['oneLater',{},'2026-11-01'],['oneEarly',{},'2026-10-20'],['two',{administrativeGroup:'二组'},'2026-10-19'],['three',{administrativeGroup:'三组'},'2026-10-19']];
  const s={people:entries.map(([id,fields])=>person(id,id==='unknown'?{administrativeGroup:'',administrativeUnit:''}:fields)),states:entries.map(([id])=>({personId:id,status:'DEPLOYED',workingGroup:null,recordId:id})),records:entries.map(([id,,end])=>({id,phase:'ACTIVE',end_date:end}))};
  assert.deepEqual(statusPeopleColumns(s,'group')[0].items.map(x=>x.person.id),['oneEarly','oneLater','two','three','four','special','otherA','otherB','unknown']);
  assert.equal(statusPeopleColumns(s)[0].items.at(-1).person.id,'unknown');
  const html=render({sort:'group',open:false});assert.match(html,/按班组/);assert.match(html,/aria-expanded="false"/);
  assert.doesNotMatch(html,/<button[^>]*status-people-toggle[^>]*>[^]*<button[^>]*status-people-sort[^>]*>[^]*<\/button>[^]*<\/button>/);
  const center=fs.readFileSync(new URL('../capability-ui/Center.jsx',import.meta.url),'utf8');
  assert.match(center,/\[statusPeopleSort,setStatusPeopleSort\]=useState\('endDate'\)/);
  assert.match(center,/aria-expanded=\{specialPoolOpen\}/);assert.match(center,/aria-expanded=\{waitingPoolOpen\}/);
});

test('sort button toggles only sort, not disclosure; disclosure toggles only expanded state',()=>{
  const calls=[];
  for(const sort of ['endDate','group']){
    const tree=StatusPeoplePool({snap,open:true,sort,onSort:value=>calls.push(['sort',value]),onToggle:value=>calls.push(['open',value]),recordLabel:r=>r?.label});
    const [toggle,sortButton]=tree.props.children[0].props.children;
    sortButton.props.onClick();toggle.props.onClick();
  }
  assert.deepEqual(calls,[['sort','group'],['open',false],['sort','endDate'],['open',false]]);
});

test('within a group equal end dates resolve by name and id without changing input records',()=>{
  const s={people:[person('b',{name:'乙'}),person('a',{name:'甲'}),person('c',{name:'甲'})],states:['b','c','a'].map(id=>({personId:id,status:'OTHER',recordId:id})),records:['a','b','c'].map(id=>({id,phase:'ACTIVE',end_date:'2026-11-01'}))};
  const before=JSON.stringify(s);
  assert.deepEqual(statusPeopleColumns(s,'group')[2].items.map(x=>x.person.id),['a','c','b']);
  assert.equal(JSON.stringify(s),before);
});

test('taller lists keep the sandbox caps and compact full mobile dates without truncation',()=>{
  const css=fs.readFileSync(new URL('../capability-ui/center.css',import.meta.url),'utf8');
  assert.match(css,/\.status-people-columns\{[^}]*height:366px;max-height:366px/);
  assert.match(css,/\.status-people-columns\{gap:3px;height:328px;max-height:328px/);
  assert.match(css,/\.status-people-date\{font-size:9px;font-family:Arial,sans-serif/);
  assert.match(css,/\.status-people-dates\{display:flex;flex-wrap:wrap/);
  assert.match(css,/\.status-people-date\{white-space:nowrap\}/);
  assert.match(css,/min-height:520px;max-height:850px/);
  assert.match(css,/min-height:520px;max-height:920px/);
  assert.match(render(),/aria-label="开始日期">2026-10-18/);
});

test('name and employee searches filter status cards without changing original counts or permissions',()=>{
  const s=structuredClone(snap);s.people[0].employeeNo='05400210';
  const html=render({snap:s,query:' 0540 '});
  assert.match(html,/状态人员 · 3人/);
  assert.equal((html.match(/class="status-people-card/g)||[]).length,1);
  assert.match(html,/派驻甲/);assert.doesNotMatch(html,/培训乙|其他丙/);
  assert.doesNotMatch(html,/class="status-people-manage"/);
  assert.equal((render({query:'does-not-match'}).match(/无匹配人员/g)||[]).length,3);
  assert.equal((render({query:'   '}).match(/class="status-people-card/g)||[]).length,3);
});
