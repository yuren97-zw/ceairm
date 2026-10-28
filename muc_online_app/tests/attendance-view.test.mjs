import test from 'node:test';
import assert from 'node:assert/strict';
import {mountAttendanceView} from '../public/attendance-view.mjs';
function setup(options={}){
 const listeners=new Map(),doc={activeElement:null,body:{style:{position:'',top:'',left:'',width:'',overflow:''}},documentElement:{style:{overflow:''}},defaultView:{scrollX:0,scrollY:240,scrollTo(x,y){this.scrollX=x;this.scrollY=y;}}};let value='',columnsOpen=false;const content={html:'',get innerHTML(){return this.html;},set innerHTML(v){this.html=v;columnsOpen=/<details class="att-columns" open/.test(v);},insertAdjacentHTML(_where,text){this.html+=text;}};
 const query={dataset:{filter:'query'},selectionStart:0,selectionEnd:0,get value(){return value;},set value(v){value=v;},matches:s=>s==='[data-filter="query"]',focus(){doc.activeElement=query;},setSelectionRange(a,b){query.selectionStart=a;query.selectionEnd=b;}};
 const modalEvents=new Map();const modal={innerHTML:'',open:false,scrollTop:0,showModal(){this.open=true;},close(){this.open=false;modalEvents.get('close')?.();},addEventListener(n,f){modalEvents.set(n,f);}};
 const details={get open(){return columnsOpen;},set open(v){columnsOpen=v;},isConnected:true,matches:s=>s==='.att-columns'};
 const host={ownerDocument:doc,html:'',get innerHTML(){return this.html;},set innerHTML(v){this.html=v;value=v.match(/data-filter="query"[^>]*value="([^"]*)"/)?.[1]||'';columnsOpen=/<details class="att-columns" open/.test(v);doc.activeElement=null;},querySelector(s){return s==='#attContent'?content:s==='[data-filter="query"]'?query:s==='.att-columns'?details:s==='[data-export-scope]'?{value:'filtered'}:s==='dialog'?modal:null;},querySelectorAll(){return [];},addEventListener(n,f){listeners.set(n,f);},removeEventListener(n){listeners.delete(n);}};
 const data={people:[{personId:'a',name:'张三',employeeNo:'001',days:[],counts:{},overtimeSeconds:null},{personId:'b',name:'李四',employeeNo:'002',days:[],counts:{},overtimeSeconds:null}],dates:[],categories:['白班','缺卡'],month:'2026-10',ruleVersion:'test'};
 const view=mountAttendanceView(host,options.data||data,options);
 const input=(v,event={})=>{value=v;query.selectionStart=query.selectionEnd=v.length;doc.activeElement=query;listeners.get('input')({target:query,...event});};
 const button=dataset=>({dataset,hasAttribute:n=>n==='data-clear'&&dataset.clear!==undefined,closest(){return this;},isConnected:true});
 return {view,host,query,content,details,modal,modalEvents,input,listeners,button};
}
test('search debounces 300ms, keeps focus/caret, clears immediately and ignores intermediate IME input',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const s=setup();s.input('张');t.mock.timers.tick(299);assert.match(s.content.innerHTML,/李四/);
 s.input('张三');t.mock.timers.tick(299);assert.match(s.content.innerHTML,/李四/);t.mock.timers.tick(1);assert.ok(!s.content.innerHTML.includes('李四'));assert.equal(s.host.ownerDocument.activeElement,s.query);assert.equal(s.query.selectionStart,2);
 s.input('');assert.match(s.content.innerHTML,/李四/);
 s.listeners.get('compositionstart')({target:s.query});s.input('李',{isComposing:true});t.mock.timers.tick(1000);assert.match(s.content.innerHTML,/张三/);
 s.listeners.get('compositionend')({target:s.query});t.mock.timers.tick(300);assert.ok(!s.content.innerHTML.includes('张三'));assert.match(s.content.innerHTML,/李四/);s.view.destroy();
});
test('bulk and individual column selection keep the panel open and preserve selection in view state',async()=>{
 const s=setup();s.details.open=true;
 await s.listeners.get('click')({target:s.button({columnsAction:'none'})});assert.equal(s.details.open,true);assert.equal(s.view.getState().columns.size,0);assert.match(s.content.innerHTML,/姓名／工号/);
 await s.listeners.get('click')({target:s.button({columnsAction:'all'})});assert.equal(s.view.getState().columns.size,2);assert.equal(s.details.open,true);
 s.listeners.get('change')({target:{dataset:{column:'缺卡'},checked:false,hasAttribute:()=>false}});assert.equal(s.details.open,true);assert.equal(s.view.getState().columns.has('缺卡'),false);s.view.destroy();
});
test('export uses the newest pending query and detached view timers cannot render after destruction',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let filters;const s=setup({canExport:true,onExport:async(_format,_scope,value)=>{filters=value;}});s.input('002');
 await s.listeners.get('click')({target:s.button({export:'xlsx'})});assert.equal(filters.query,'002');assert.match(s.content.innerHTML,/张三/);
 s.view.destroy();const html=s.host.innerHTML;t.mock.timers.tick(1000);assert.equal(s.host.innerHTML,html);
});
test('day popup only replaces source code with seven-day context, locks background and restores it on close or destruction',async()=>{
 const {classifyDay}=await import('../attendance-rules.mjs');const now=Date.parse('2026-10-23T12:00:00+08:00');
 const make=date=>{const input={date,covered:true,rest:true,points:[],punches:[],approvals:[]};return {...classifyDay(input,now),input,updatedAt:'2026-10-23T01:00:00Z'};};
 const data={people:[{personId:'p',name:'测试',employeeNo:'001',days:[make('2026-10-01')],contextDays:[make('2026-09-28'),make('2026-09-29'),make('2026-09-30')],counts:{休息:1},overtimeSeconds:null}],dates:['2026-10-01'],categories:['休息'],month:'2026-10',ruleVersion:'test',generatedAt:new Date(now).toISOString()};
 const s=setup({data});await s.listeners.get('click')({target:s.button({day:'p|2026-10-01'})});
 assert.equal(s.modal.open,true);assert.match(s.modal.innerHTML,/上下班打卡/);assert.match(s.modal.innerHTML,/加班时间（下班后）/);assert.match(s.modal.innerHTML,/出差事由/);assert.ok(!s.modal.innerHTML.includes('排班、打卡与审批依据'));assert.match(s.modal.innerHTML,/2026-09-28 至 2026-10-04/);assert.equal((s.modal.innerHTML.match(/aria-current="date"/g)||[]).length,1);assert.ok(s.modal.innerHTML.indexOf('前后3天考勤对照')>s.modal.innerHTML.indexOf('最近成功同步'));
 assert.equal(s.host.ownerDocument.body.style.position,'fixed');assert.equal(s.host.ownerDocument.body.style.top,'-240px');assert.equal(s.host.ownerDocument.documentElement.style.overflow,'hidden');
 await s.listeners.get('click')({target:{dataset:{},hasAttribute:n=>n==='data-close',closest(){return this;}}});assert.equal(s.modal.open,false);assert.equal(s.host.ownerDocument.body.style.position,'');assert.equal(s.host.ownerDocument.defaultView.scrollY,240);
 await s.listeners.get('click')({target:s.button({day:'p|2026-10-01'})});s.modal.close();assert.equal(s.host.ownerDocument.body.style.position,'');await s.listeners.get('click')({target:s.button({day:'p|2026-10-01'})});s.view.destroy();assert.equal(s.host.ownerDocument.body.style.position,'');assert.equal(s.host.ownerDocument.documentElement.style.overflow,'');
});
test('calendar context is always seven dates, crosses year boundaries and distinguishes absent snapshot data',async()=>{
 const {attendanceNeighborDays}=await import('../public/attendance-presentation.mjs');
 const days=attendanceNeighborDays({days:[]},'2027-01-01',{offline:true,today:'2027-01-02'});assert.equal(days.length,7);assert.equal(days[0].date,'2026-12-29');assert.equal(days.at(-1).date,'2027-01-04');assert.equal(days[0].category,'快照未包含');assert.equal(days.at(-1).category,'未来日期');
 assert.equal(attendanceNeighborDays({days:[]},'2026-09-01',{today:'2026-10-23'})[0].category,'不在同步范围');
});
test('partial category selection is OR, resets pagination, updates cards and only filters summary',async()=>{
 const people=[['a',{缺卡:1},60],['b',{迟到:2},120],['c',{缺卡:1,迟到:1},180],['d',{缺卡:0},240]].map(([personId,counts,overtimeSeconds])=>({personId,name:'人员'+personId,employeeNo:personId,department:'航线',team:'一组',counts,overtimeSeconds,uncomputableDays:1,days:[{date:'2026-09-01',category:'休息',reason:'',issues:[]}]}));
 const data={people,categories:['白班','缺卡','迟到'],dates:['2026-09-01'],month:'2026-09',ruleVersion:'test'};
 let filters;const s=setup({data,canExport:true,onExport:async(_f,_s,value)=>{filters=value;}});
 assert.match(s.content.innerHTML,/4人/);assert.match(s.host.innerHTML,/0小时10分/);
 await s.listeners.get('click')({target:s.button({columnsAction:'none'})});assert.match(s.content.innerHTML,/4人/);
 s.details.open=true;
 s.listeners.get('change')({target:{dataset:{column:'缺卡'},checked:true,hasAttribute:()=>false}});
 assert.match(s.content.innerHTML,/2人/);assert.ok(!s.content.innerHTML.includes('人员b'));assert.ok(!s.content.innerHTML.includes('人员d'));assert.match(s.host.innerHTML,/0小时4分/);assert.equal(s.details.open,true);
 s.listeners.get('change')({target:{dataset:{column:'迟到'},checked:true,hasAttribute:()=>false}});
 assert.match(s.content.innerHTML,/3人/);assert.ok(s.content.innerHTML.includes('人员b'));assert.ok(!s.content.innerHTML.includes('人员d'));assert.match(s.host.innerHTML,/0小时6分/);
 await s.listeners.get('click')({target:s.button({export:'xlsx'})});assert.deepEqual(filters.categories,['缺卡','迟到']);
 const restored=setup({data,initialState:s.view.getState()});assert.match(restored.content.innerHTML,/3人/);restored.view.destroy();
 await s.listeners.get('click')({target:s.button({tab:'matrix'})});assert.match(s.content.innerHTML,/4人/);
 await s.listeners.get('click')({target:s.button({export:'html'})});assert.equal(filters.categories,undefined);
 await s.listeners.get('click')({target:s.button({tab:'summary'})});assert.match(s.content.innerHTML,/3人/);
 s.listeners.get('change')({target:{dataset:{column:'白班'},checked:true,hasAttribute:()=>false}});assert.match(s.content.innerHTML,/4人/);
 await s.listeners.get('click')({target:s.button({export:'xlsx'})});assert.equal(filters.categories,undefined);s.view.destroy();
 const many=setup({data:{...data,people:Array.from({length:65},(_,i)=>({...people[i%4],personId:String(i)}))},initialState:{page:3}});
 assert.equal(many.view.getState().page,3);many.listeners.get('change')({target:{dataset:{column:'白班'},checked:false,hasAttribute:()=>false}});assert.equal(many.view.getState().page,1);many.view.destroy();
});
test('category predicate combines with personnel filters without treating absent or zero counts as positive',async()=>{
 const {attendanceCategorySelection,attendanceMatchesCategories}=await import('../public/attendance-presentation.mjs');
 assert.deepEqual(attendanceCategorySelection(['A','B'],new Set(['A','B'])),[]);assert.deepEqual(attendanceCategorySelection(['A','B'],new Set()),[]);
 for(const counts of [{},{A:0},{A:null},{B:0}])assert.equal(attendanceMatchesCategories({counts},['A','B']),false);
 assert.equal(attendanceMatchesCategories({counts:{A:0,B:1}},['A','B']),true);
 const s=setup({data:{people:[{personId:'a',name:'甲',employeeNo:'001',department:'一部',counts:{缺卡:1},days:[]},{personId:'b',name:'乙',employeeNo:'002',department:'二部',counts:{缺卡:1},days:[]}],categories:['缺卡','白班'],dates:[],month:'2026-09'},initialState:{columns:new Set(['缺卡']),department:'一部'}});
 assert.match(s.content.innerHTML,/甲/);assert.ok(!s.content.innerHTML.includes('乙'));s.view.destroy();
});
test('zero catalog columns show all people when fully selected and no people when selecting an unused leave',async()=>{
 const data={people:[{personId:'a',name:'甲',employeeNo:'001',days:[],counts:{白班:1},overtimeSeconds:null}],dates:[],month:'2026-09',categories:['白班','病假','事假'],leaveTypes:{names:['病假','事假'],status:'ready'}};
 const s=setup({data});assert.match(s.content.innerHTML,/甲/);assert.match(s.content.innerHTML,/病假/);assert.match(s.content.innerHTML,/事假/);assert.match(s.host.innerHTML,/按钉钉企业目录固定展示/);
 await s.listeners.get('click')({target:s.button({columnsAction:'none'})});s.listeners.get('change')({target:{dataset:{column:'病假'},checked:true,hasAttribute:()=>false}});assert.match(s.content.innerHTML,/当前条件没有数据/);assert.match(s.content.innerHTML,/0人/);s.view.destroy();
 const missing=setup({data:{...data,leaveTypes:{names:['事假'],status:'unavailable',error:'缺少权限'}}});assert.match(missing.host.innerHTML,/完整假期目录尚未读取/);missing.view.destroy();
});
test('summary page size supports 20/50/100, resets page and leaves matrix at 30 with full-scope cards',async()=>{
 const people=Array.from({length:105},(_,i)=>({personId:String(i),name:'人'+i,employeeNo:String(i),days:[],counts:{},overtimeSeconds:60}));
 const s=setup({data:{people,categories:['白班'],dates:[],displaySettings:{categoryOrder:[],pageSize:20},month:'2026-09'}});
 assert.match(s.content.innerHTML,/1 \/ 6 · 105人/);assert.match(s.host.innerHTML,/1小时45分/);
 await s.listeners.get('click')({target:s.button({page:'1'})});assert.match(s.content.innerHTML,/2 \/ 6/);
 s.listeners.get('change')({target:{value:'50',hasAttribute:n=>n==='data-page-size'}});assert.match(s.content.innerHTML,/1 \/ 3 · 105人/);assert.equal(s.view.getState().pageSize,50);
 s.listeners.get('change')({target:{value:'100',hasAttribute:n=>n==='data-page-size'}});assert.match(s.content.innerHTML,/1 \/ 2 · 105人/);
 await s.listeners.get('click')({target:s.button({page:'1'})});assert.match(s.content.innerHTML,/人104/);assert.ok(!s.content.innerHTML.includes('>人99<'));
 await s.listeners.get('click')({target:s.button({tab:'matrix'})});assert.match(s.content.innerHTML,/1 \/ 4 · 105人/);assert.ok(!s.content.innerHTML.includes('data-page-size'));s.view.destroy();
});
test('fixed order removes all movement controls and only admin can save default rows; failure retains row size',async()=>{
 const data={people:[{personId:'1',name:'测试',counts:{白班:1},days:[],overtimeSeconds:null}],categories:['缺卡','病假','白班'],dates:[],month:'2026-09',displaySettings:{categoryOrder:['缺卡','病假','白班'],pageSize:20,canManage:true}};
 let saved;const s=setup({data,onSaveDisplaySettings:async v=>{saved=v;return {...v,canManage:true};}});s.details.open=true;
 assert.ok(!/data-order-action|data-move-column|att-order-list/.test(s.content.innerHTML));assert.ok(s.content.innerHTML.indexOf('data-column="白班"')<s.content.innerHTML.indexOf('data-column="缺卡"'));assert.ok(s.content.innerHTML.indexOf('data-save-page-size')>s.content.innerHTML.indexOf('att-pagination'));
 s.listeners.get('change')({target:{value:'50',hasAttribute:n=>n==='data-page-size'}});
 const saveButton={dataset:{},hasAttribute:n=>n==='data-save-page-size',closest(){return this;}};
 await s.listeners.get('click')({target:saveButton});assert.deepEqual(saved,{pageSize:50});assert.match(s.content.innerHTML,/默认行数已保存/);s.view.destroy();
 const f=setup({data,onSaveDisplaySettings:async()=>{throw Error('网络中断');}});f.listeners.get('change')({target:{value:'100',hasAttribute:n=>n==='data-page-size'}});await f.listeners.get('click')({target:saveButton});assert.equal(f.view.getState().pageSize,100);assert.match(f.content.innerHTML,/保存失败.*当前行数已保留/);f.view.destroy();
 const r=setup({data:{...data,displaySettings:{pageSize:20,canManage:false}}});assert.ok(!r.content.innerHTML.includes('data-save-page-size'));r.view.destroy();
});
test('fixed order ignores legacy preferences, unknown names sort before final neutral states and new categories start selected',async()=>{
 const {attendanceOrderedCategories,attendanceFixedCategoryOrder,attendanceRefreshColumns}=await import('../public/attendance-presentation.mjs');
 assert.deepEqual(attendanceOrderedCategories([...attendanceFixedCategoryOrder].reverse(),['夜班','白班']),attendanceFixedCategoryOrder);
 const extra=['新乙','新甲'];const sorted=attendanceOrderedCategories(['无记录',...extra,'未来日期','夜班','白班','休息']);assert.deepEqual(sorted.slice(0,3),['白班','休息','夜班']);assert.deepEqual(sorted.slice(-2),['无记录','未来日期']);assert.deepEqual(sorted.slice(3,-2),[...extra].sort((a,b)=>a.localeCompare(b,'zh-CN')));
 const refreshed=attendanceRefreshColumns(['白班','缺卡','新增假种'],new Set(['白班','缺卡']),new Set(['缺卡']));assert.deepEqual([...refreshed],['缺卡','新增假种']);assert.equal(attendanceRefreshColumns(['白班','缺卡'],new Set(['白班','缺卡']),new Set(),true).size,2);
});
test('all and only positive category counts get color labels including normal, leave, abnormal and neutral',()=>{
 const categories=['白班','缺卡','病假','无记录','未来日期','新类别'];const data={people:[{personId:'a',name:'甲',counts:Object.fromEntries(categories.map(c=>[c,1])),days:[],overtimeSeconds:null},{personId:'b',name:'乙',counts:{},days:[],overtimeSeconds:null}],categories,dates:[],month:'2026-09',leaveTypes:{names:['病假'],status:'ready'}};
 const s=setup({data});assert.equal((s.content.innerHTML.match(/class="att-link att-count-positive"/g)||[]).length,categories.length);assert.equal((s.content.innerHTML.match(/class="att-link "/g)||[]).length,categories.length);assert.match(s.content.innerHTML,/天数合计/);assert.match(s.content.innerHTML,/已计算／无法计算/);s.view.destroy();
});
