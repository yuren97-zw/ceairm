import {attendanceTone,attendanceAbnormal,legalLeaveCategories,punchSummary,attendanceRawStatus,attendanceNeighborDays,attendanceCategorySelection,attendanceMatchesCategories,attendanceLeaveCatalogText,attendanceOrderedCategories} from './attendance-presentation.mjs';
export const attendanceEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc=attendanceEscape;
const time=v=>v?new Date(v).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'}):'—';
const duration=s=>s===null||s===undefined?'—':`${Math.floor(s/3600)}小时${Math.floor(s%3600/60)}分`;
const toneStyle=t=>`--att-tone-bg:${t.background};--att-tone-fg:${t.foreground};--att-tone-border:${t.border||t.background}`;
export function mountAttendanceView(host,data,options={}){
 let savedDisplay=data.displaySettings||{pageSize:20};
 let ui={pageSize:savedDisplay.pageSize,displayMessage:'',tab:options.canStats===false?'matrix':'summary',query:'',department:'',team:'',personId:'',page:1,columns:new Set(data.categories),columnsOpen:false,queryDraft:'',...(options.initialState||{})},destroyed=false,queryTimer=null,composing=false,restoreQuery=options.initialState?.focusQuery||false,scrollLock=null;
 delete ui.categoryOrder;delete ui.ordering;
 const guardedDialogs=new WeakSet();
 ui.pageSize=[20,50,100].includes(ui.pageSize)?ui.pageSize:20;
 const canManage=!!savedDisplay.canManage&&!options.offline;
 const leaves=legalLeaveCategories(data);
 const orderedCategories=()=>attendanceOrderedCategories(data.categories);
 const badge=c=>`<span class="att-tag att-tone" style="${toneStyle(attendanceTone(c,leaves))}">${esc(c)}</span>`;
 ui.queryDraft=ui.queryDraft||ui.query;
 const legend='<div class="att-legend" aria-label="考勤颜色说明"><span class="att-legend-normal">正常出勤／休息／合法审批</span><span class="att-legend-abnormal">异常／待核对</span><span class="att-legend-neutral">未同步／无记录／未到时</span></div>';
 const summaryCells=d=>{const {on,off,multiple}=punchSummary(d);return [esc(time(on.planned)),`${esc(time(on.actual))}<small>${esc(on.status)}</small>`,esc(time(off.planned)),`${esc(time(off.actual))}<small>${esc(off.status)}${multiple?' · 多段，详情查看全部':''}</small>`];};
 if(options.canStats===false&&ui.tab==='summary')ui.tab='matrix';
 const activeCategories=()=>ui.tab==='summary'?attendanceCategorySelection(data.categories,ui.columns):[];
 const filtered=()=>data.people.filter(p=>(!ui.query||[p.name,p.employeeNo].some(v=>String(v).toLowerCase().includes(ui.query.toLowerCase())))&&(!ui.department||p.department===ui.department)&&(!ui.team||p.team===ui.team)&&attendanceMatchesCategories(p,activeCategories()));
 const select=(name,items,value,label)=>`<label>${label}<select data-filter="${name}"><option value="">全部</option>${items.map(v=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
 function rowsTable(headers,rows,{rowAttributes=()=>''}={}){return `<div class="att-table"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map((r,index)=>`<tr${rowAttributes(index)}>${r.map(c=>`<td>${c??''}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}" class="att-empty">当前条件没有数据</td></tr>`}</tbody></table></div>`;}
 function personButton(p){return `<button class="att-link" data-person="${esc(p.personId)}">${esc(p.name)}</button><small>${esc(p.employeeNo)}</small>`;}
 function detailButton(p,d){return `<button class="att-cell" data-day="${esc(p.personId)}|${d.date}" title="${esc(d.reason)}">${badge(d.category)}${d.stale?'<small>保留上次数据</small>':''}</button>`;}
 const issueRows=ps=>ps.flatMap(p=>p.days.filter(d=>!['未同步','未来日期','尚未到下班时间'].includes(d.category)&&(d.category==='待核对'||d.category==='缺卡'||d.issues.length||d.syncError)).map(d=>({p,d})));
 function render({preserveTableScroll=false}={}){
  if(destroyed)return;
  closeDialog();
  const active=host.ownerDocument.activeElement,queryFocused=active?.matches('[data-filter="query"]')||restoreQuery,selection=restoreQuery?ui.querySelection:queryFocused?[active.selectionStart,active.selectionEnd]:null;restoreQuery=false;
  const columnFocus=active?.dataset?.column, bulkFocus=active?.dataset?.columnsAction;
  const existingColumns=host.querySelector('.att-columns');if(existingColumns)ui.columnsOpen=existingColumns.open;
  const oldTable=host.querySelector('.att-table'),scroll=oldTable?{left:oldTable.scrollLeft,top:oldTable.scrollTop}:ui.tableScroll;
  const size=ui.tab==='summary'?ui.pageSize:30;
  const ps=filtered(),pageCount=Math.max(1,Math.ceil(ps.length/size));ui.page=Math.min(ui.page,ui.tab==='issues'?Math.max(1,Math.ceil(issueRows(ps).length/100)):pageCount);const paged=ps.slice((ui.page-1)*size,ui.page*size),issues=issueRows(ps),computed=ps.filter(p=>p.overtimeSeconds!==null&&p.overtimeSeconds!==undefined),total=computed.length?computed.reduce((s,p)=>s+p.overtimeSeconds,0):null;
  const status=options.status;
  const catalog=data.leaveTypes||status?.leaveTypes;
  const tabs=[...(options.canStats===false?[]:[['summary','人员统计']]),['matrix','逐日总览'],['person','个人明细'],['issues','异常核对'],...(!options.offline?[['sync','同步状态']]:[])];
  host.innerHTML=`<div class="att-head"><div><p class="att-eyebrow">航线运行中心 · ${options.offline?'只读离线快照':'钉钉自动同步'}</p><h1>考勤管理</h1><p>${esc(data.month)} · 每人每天唯一归类 · ${esc(data.ruleVersion)}</p></div><div class="att-actions">${options.offline?'':`<label>统计月份<input type="month" min="2026-09" value="${data.month}" data-month></label><button data-reload>刷新页面</button>${options.canSync?'<button data-sync class="att-primary">同步本月</button>':''}`}${options.canExport?'<select data-export-scope aria-label="导出范围"><option value="filtered">当前筛选人员</option><option value="all">全部有权查看人员</option></select><button data-export="xlsx">导出Excel</button><button data-export="html">只读HTML</button>':''}</div></div>
  <div class="att-note">${esc(data.historyWarning)}<br>${esc(data.overtimeNote)}<br>最近数据同步：${esc(time(data.lastSyncedAt))}；${options.offline?'快照生成':'本次读取'}：${esc(time(data.generatedAt))}${options.offline?`${data.exportedAt?`；本次导出：${esc(time(data.exportedAt))}`:''}；导出范围：${esc(data.exportScope)}，筛选：${esc(JSON.stringify(data.filters||{}))}`:''}</div>
  ${catalog?`<div class="att-note">${esc(attendanceLeaveCatalogText(catalog))}${catalog.lastSyncedAt?`<br>假期目录最近更新：${esc(time(catalog.lastSyncedAt))}`:''}</div>`:''}
  ${!options.offline&&status&&!status.configuration.configured?'<div class="att-note att-warning">钉钉应用待配置，当前未启用真实数据同步。由管理员配置后，可回补2026年9月起数据。</div>':''}
  <div class="att-filters"><label>姓名／工号<input data-filter="query" type="search" value="${esc(ui.queryDraft)}" placeholder="搜索人员"></label>${select('department',[...new Set(data.people.map(p=>p.department))].filter(Boolean),ui.department,'部门')}${select('team',[...new Set(data.people.map(p=>p.team))].filter(Boolean),ui.team,'班组')}<button data-clear>清除筛选</button></div>
  ${options.canStats===false?'':`<div class="att-cards"><div><small>当前人员</small><strong>${ps.length}<em>人</em></strong></div><div><small>加班累计时间（下班后）</small><strong>${duration(total)}</strong></div><div><small>无法计算</small><strong>${ps.reduce((n,p)=>n+(p.uncomputableDays||0),0)}<em>人日</em></strong></div><div><small>异常核对</small><strong>${issues.length}<em>人日</em></strong></div></div>`}
  <nav class="att-tabs" aria-label="考勤视图">${tabs.map(([k,l])=>`<button data-tab="${k}" class="${ui.tab===k?'active':''}" aria-current="${ui.tab===k?'page':'false'}">${l}</button>`).join('')}</nav>${legend}<section class="att-panel" id="attContent"></section><div class="att-message" role="status" aria-live="polite"></div><dialog class="att-dialog"></dialog>`;
  const content=host.querySelector('#attContent');
  if(ui.tab==='summary'){
   const cats=orderedCategories().filter(c=>ui.columns.has(c));
   content.innerHTML=`<details class="att-columns" ${ui.columnsOpen?'open':''}><summary>选择统计类别列（${cats.length}）</summary><div class="att-columns-actions"><button data-columns-action="all">全选</button><button data-columns-action="none">全不选</button></div><p class="att-detail-note">全选或全不选显示全部人员；部分选择时，任一所选类别数量大于0即显示。</p>${orderedCategories().map(c=>`<label><input type="checkbox" data-column="${esc(c)}" ${ui.columns.has(c)?'checked':''}>${esc(c)}</label>`).join('')}</details>`+rowsTable(['姓名／工号','部门／班组',...cats.map(c=>attendanceAbnormal.includes(c)?`<span class="att-abnormal-heading" style="${toneStyle(attendanceTone(c,leaves))}">${esc(c)}</span>`:esc(c)),'天数合计','累计时间','已计算／无法计算'],paged.map(p=>[personButton(p),`${esc(p.department)}<small>${esc(p.team)}</small>`,...cats.map(c=>`<button class="att-link ${(p.counts?.[c]||0)>0?'att-count-positive':''}" style="${toneStyle(attendanceTone(c,leaves))}" data-count="${esc(p.personId)}|${esc(c)}">${p.counts?.[c]||0}</button>`),p.days.length,duration(p.overtimeSeconds),`${p.computedDays}／${p.uncomputableDays}`]));
  }else if(ui.tab==='matrix')content.innerHTML=rowsTable(['姓名／工号',...data.dates.map(d=>`${Number(d.slice(8))}<small>${new Date(d+'T00:00:00Z').toLocaleDateString('zh-CN',{weekday:'short',timeZone:'UTC'})}</small>`)],paged.map(p=>[personButton(p),...p.days.map(d=>detailButton(p,d))]));
  else if(ui.tab==='person'){
   const p=ps.find(p=>p.personId===ui.personId)||ps[0];
   content.innerHTML=`<label class="att-person-select">查看人员<select data-person-select>${ps.map(v=>`<option value="${esc(v.personId)}" ${v.personId===p?.personId?'selected':''}>${esc(v.name)} / ${esc(v.employeeNo)}</option>`).join('')}</select></label>`+(p?rowsTable(['日期','类别','班次','出差用途','计划上班','有效实际上班','计划下班','有效实际下班','当日加班','计算状态'],p.days.map(d=>[d.date,detailButton(p,d),esc(d.shift||'—'),esc(d.purposes.map(a=>a.category||a.status).join('；')||'—'),...summaryCells(d),duration(d.overtime.seconds),esc(d.overtime.status)])):'<p class="att-empty">暂无人员</p>');
  }else if(ui.tab==='issues')content.innerHTML=`<p>仅核对已发生且已读取的数据；源数据请在钉钉修正后重新同步。未同步和未来日期不计入此清单。</p>`+rowsTable(['姓名／工号','日期','类别','原因','问题'],issues.slice((ui.page-1)*100,ui.page*100).map(({p,d})=>[personButton(p),d.date,detailButton(p,d),esc(d.reason),esc([...d.issues,d.syncError].filter(Boolean).join('；'))]));
  else if(ui.tab==='sync'){
   const names={directory:'正在读取通讯录',running:'同步中',completed:'已完成',partial:'部分未完成',failed:'失败'};
   content.innerHTML=`<h2>假期类型目录</h2><p>${esc(attendanceLeaveCatalogText(catalog))}</p>${options.canSync?'<button data-refresh-leaves>刷新假期目录</button>':''}<p>仅查询假期目录，不重新同步人员考勤。自动同步启用后，目录每天更新一次；失败保留上次目录。</p><h2>自动同步</h2><p>北京时间每日10:00更新近期数据，21:00回查当月及上月。历史月份可选择后手动重新同步。</p><p>定时同步：${status?.configuration.enabled?'已启用':'未启用'}；接口配置：${status?.configuration.configured?'已配置':'待配置'}；本月调用：${status?.usage?.request_count??'—'} / ${status?.configuration.monthlyBudget??'—'}</p>${status?.configuration.missing?.length?`<p>缺少服务器配置：${status.configuration.missing.map(esc).join('、')}</p>`:''}<p>出差事由字段：${esc(status?.configuration.reasonFieldName||'出差事由')}；人员与能力状态联动：预留，未启用。</p>`+rowsTable(['期间','状态','任务数（完成／未完整／失败）','更新时间','说明'],(status?.runs||[]).map(r=>[`${r.from} 至 ${r.to}`,esc(names[r.status]||r.status),`${r.counts.done||0}／${r.counts.incomplete||0}／${r.counts.failed||0}`,esc(time(r.updatedAt)),esc(r.error||'')]))+(status?.identityIssues?.length?'<h2>人员身份待匹配</h2>'+rowsTable(['姓名','工号','问题'],status.identityIssues.map(p=>[esc(p.name),esc(p.employeeNo),esc(p.issue)])):'');
  }
  if(['matrix','summary'].includes(ui.tab))content.insertAdjacentHTML('beforeend',`<div class="att-pagination">${ui.tab==='summary'?`<label class="att-page-size">每页<select data-page-size aria-label="每页显示行数">${[20,50,100].map(n=>`<option value="${n}" ${ui.pageSize===n?'selected':''}>${n}行</option>`).join('')}</select></label>${canManage?'<button data-save-page-size>保存默认行数</button>':''}`:''}<button data-page="-1" ${ui.page===1?'disabled':''}>上一页</button><span>${ui.page} / ${pageCount} · ${ps.length}人</span><button data-page="1" ${ui.page>=pageCount?'disabled':''}>下一页</button></div>`);
  if(ui.tab==='summary')content.insertAdjacentHTML('beforeend',`<p class="att-detail-note" role="status">${esc(ui.displayMessage)}</p>`);
  if(ui.tab==='issues'&&issues.length>100)content.insertAdjacentHTML('beforeend',`<div class="att-pagination"><button data-page="-1" ${ui.page===1?'disabled':''}>上一页</button><span>${ui.page} / ${Math.ceil(issues.length/100)}</span><button data-page="1" ${ui.page>=Math.ceil(issues.length/100)?'disabled':''}>下一页</button></div>`);
  if(preserveTableScroll&&scroll){const table=host.querySelector('.att-table');if(table){table.scrollLeft=scroll.left;table.scrollTop=scroll.top;}}
  if(queryFocused){const input=host.querySelector('[data-filter="query"]');input.focus({preventScroll:true});if(selection&&selection[0]!==null)input.setSelectionRange(...selection);}
  if(columnFocus){const target=[...host.querySelectorAll('[data-column]')].find(el=>el.dataset.column===columnFocus);target?.focus({preventScroll:true});}
  if(bulkFocus)host.querySelector(`[data-columns-action="${bulkFocus}"]`)?.focus({preventScroll:true});
 }
 function releaseBackground(){
  if(!scrollLock)return;
  const lock=scrollLock;scrollLock=null;
  for(const [key,value] of Object.entries(lock.bodyStyle))lock.body.style[key]=value;
  lock.root.style.overflow=lock.rootOverflow;
  lock.window.scrollTo(lock.x,lock.y);
 }
 function closeDialog(){const el=host.querySelector('dialog');if(el?.open)el.close();releaseBackground();}
 function dialog(title,html){
  const el=host.querySelector('dialog');
  el.innerHTML=`<div class="att-dialog-head"><h2>${esc(title)}</h2><button data-close aria-label="关闭详情">关闭</button></div>${html}`;
  if(el.open){el.scrollTop=0;return;}
  if(!guardedDialogs.has(el)){el.addEventListener('close',()=>{if(!el.open&&scrollLock?.element===el)releaseBackground();});guardedDialogs.add(el);}
  const doc=host.ownerDocument,body=doc.body,root=doc.documentElement,win=doc.defaultView;
  if(body&&root&&win){
   const bodyStyle=Object.fromEntries(['position','top','left','width','overflow'].map(key=>[key,body.style[key]]));
   scrollLock={element:el,body,root,window:win,x:win.scrollX,y:win.scrollY,bodyStyle,rootOverflow:root.style.overflow};
   root.style.overflow='hidden';body.style.position='fixed';body.style.top=`-${scrollLock.y}px`;body.style.left=`-${scrollLock.x}px`;body.style.width='100%';body.style.overflow='hidden';
  }
  try{el.showModal();el.scrollTop=0;}catch(error){releaseBackground();throw error;}
 }
 function neighborContext(p,current){
  const today=new Date(data.generatedAt||Date.now()).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
  const days=attendanceNeighborDays(p,current.date,{offline:options.offline,today});
  const extraLeaves=legalLeaveCategories({people:[{days}]});
  const contextBadge=day=>`<span class="att-tag att-tone" style="${toneStyle(attendanceTone(day.category,[...leaves,...extraLeaves]))}">${esc(day.category)}</span>`;
  const lines=(day,actual)=>{
   if(day.contextMissing||!day.input?.covered)return esc(day.category==='未来日期'?'未来日期':day.category==='不在同步范围'?'不在同步范围':day.category==='快照未包含'?'快照未包含':'未同步');
   const points=(day.punchDetails||[]).filter(v=>actual||v.planned&&v.status!=='未配对');
   if(!points.length)return actual?(day.category==='休息'?'—':'无打卡记录'):(day.category==='休息'?'休息':'无排班');
   return points.map(v=>`<div>${esc(v.type==='OnDuty'?'上班':v.type==='OffDuty'?'下班':v.type||'未知')} ${esc(time(actual?v.actual:v.planned))}${actual?`<small>${esc(v.status)}${v.rawStatus?.length?' · '+esc(v.rawStatus.map(attendanceRawStatus).join('、')):''}</small>`:''}</div>`).join('');
  };
  const approvalText=day=>{
   if(day.contextMissing||!day.input?.covered)return '资料未取得';
   const start=Date.parse(day.date+'T00:00:00+08:00');
   const approvals=(day.input.approvals||[]).filter(a=>a.start&&a.end&&a.start<start+86400000&&a.end>start);
   const content=approvals.length?approvals.map(a=>`<div>${esc(a.subType||a.kind||'审批')} · ${a.revoked?'已撤销':a.approved?'已批准':'未生效'}<small>${esc(time(a.start))} 至 ${esc(time(a.end))}</small>${a.kind==='出差'?`<small>出差事由：${esc(a.reason??'未取得事由')}</small>`:''}</div>`).join(''):'无关联审批';
   return content+(day.syncError?`<small class="att-warning">${esc(day.syncError)}</small>`:'');
  };
  return `<section class="att-neighbor-context" aria-label="前后3天考勤对照"><h3>前后3天考勤对照</h3><p class="att-detail-note">${days[0].date} 至 ${days.at(-1).date} · 共7天，当前日已标记</p>${rowsTable(['日期','考勤结果','排班','有效打卡／状态','审批情况'],days.map(day=>[`${esc(day.date)}<small>${new Date(day.date+'T00:00:00Z').toLocaleDateString('zh-CN',{weekday:'short',timeZone:'UTC'})}${day.date===current.date?' · 当前日':''}</small>`,contextBadge(day),lines(day,false),lines(day,true),approvalText(day)]),{rowAttributes:index=>days[index].date===current.date?' class="att-context-current" aria-current="date"':''})}<p class="att-detail-note">跨夜打卡按归属工作日展示；未同步、快照未包含或无记录不代表缺勤。</p></section>`;
 }
 function showDay(p,d){
  const o=d.overtime;
  dialog(`${p.name} / ${p.employeeNo} · ${d.date}`,`<p>${badge(d.category)} 班次：${esc(d.shift||'—')}</p><p>${esc(d.reason)}</p>${d.issues.length?`<p class="att-warning">${esc(d.issues.join('；'))}</p>`:''}<h3>上下班打卡</h3>${rowsTable(['方向','计划时间','有效实际时间','配对状态','原始状态','说明'],(d.punchDetails||[]).map(v=>[esc(v.type==='OnDuty'?'上班':v.type==='OffDuty'?'下班':v.type||'未知'),esc(time(v.planned)),esc(time(v.actual)),esc(v.status),esc((v.rawStatus||[]).map(attendanceRawStatus).join('；')||'—'),esc(v.reason)]))}<p class="att-detail-note">按归属工作日列出全部计划点；未配对记录不参与首个上班／末次下班摘要。跨夜显示实际日期。</p><h3>加班时间（下班后）</h3><p>计划：${esc(time(o.planned))}<br>实际：${esc(time(o.actual))}<br>${duration(o.seconds)}${o.seconds===null?'':`（${o.seconds}秒）`} · ${esc(o.status)}</p><p>${esc(o.reason)}</p><h3>出差事由</h3>${d.purposes.length?d.purposes.map(a=>`<div class="att-note"><p>用途：${esc(a.category||'待核对')}；读取状态：${esc(a.status)}；命中：${esc(a.keywords.join('、')||'无')}</p><p class="att-pre">${esc(a.reason??'未取得事由')}</p><small>审批：${esc(a.id)}<br>${esc(time(a.start))} 至 ${esc(time(a.end))}</small></div>`).join(''):'<p>无关联有效出差审批</p>'}<p>最近成功同步：${esc(time(d.updatedAt))}${d.syncError?`；最新同步问题：${esc(d.syncError)}`:''}</p>${neighborContext(p,d)}`);
 }
 const onClick=async event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-save-page-size')&&canManage){
   b.disabled=true;
   try{const result=await options.onSaveDisplaySettings({pageSize:ui.pageSize});if(destroyed)return;savedDisplay=result;ui.displayMessage='默认行数已保存，其他账户刷新后生效。';}
   catch(e){if(destroyed)return;ui.displayMessage='保存失败：'+e.message+'；当前行数已保留。';}
   if(!destroyed){render({preserveTableScroll:true});host.querySelector('[data-save-page-size]')?.focus({preventScroll:true});}return;
  }
  if(b.dataset.columnsAction){ui.columns=new Set(b.dataset.columnsAction==='all'?data.categories:[]);ui.page=1;render({preserveTableScroll:true});return;}
  if(b.hasAttribute('data-close')){closeDialog();return;}
  if(b.dataset.tab){ui.tab=b.dataset.tab;ui.page=1;render();return;}
  if(b.dataset.person){ui.personId=b.dataset.person;ui.tab='person';render();return;}
  if(b.dataset.page){ui.page=Math.max(1,ui.page+Number(b.dataset.page));render();return;}
  if(b.hasAttribute('data-clear')){clearTimeout(queryTimer);composing=false;ui={...ui,query:'',queryDraft:'',department:'',team:'',personId:'',page:1};render();return;}
  if(b.dataset.day){const [id,date]=b.dataset.day.split('|'),p=data.people.find(p=>p.personId===id),d=p?.days.find(d=>d.date===date);if(d)showDay(p,d);return;}
  if(b.dataset.count){const [id,category]=b.dataset.count.split('|'),p=data.people.find(p=>p.personId===id);dialog(`${p.name} · ${category}`,rowsTable(['日期','类别','计划上班','有效实际上班','计划下班','有效实际下班','依据'],p.days.filter(d=>d.category===category).map(d=>[d.date,detailButton(p,d),...summaryCells(d),esc(d.reason)])));return;}
  b.disabled=true;
  try{
   if(b.hasAttribute('data-reload'))await options.onReload?.();
   if(b.hasAttribute('data-sync'))await options.onSync?.();
   if(b.hasAttribute('data-refresh-leaves'))await options.onRefreshLeaveTypes?.();
   if(b.dataset.export)await options.onExport?.(b.dataset.export,host.querySelector('[data-export-scope]').value,{query:host.querySelector('[data-filter="query"]').value,department:ui.department,team:ui.team,personId:ui.tab==='person'&&ui.query===ui.queryDraft?ui.personId:'',...(activeCategories().length?{categories:activeCategories()}: {})});
  }catch(e){host.querySelector('.att-message').textContent=e.message;}
  finally{if(b.isConnected)b.disabled=false;}
 };
 const onChange=event=>{
  const el=event.target;
  if(el.hasAttribute('data-page-size')){const size=Number(el.value);if([20,50,100].includes(size)){ui.pageSize=size;ui.page=1;render({preserveTableScroll:true});host.querySelector('[data-page-size]')?.focus({preventScroll:true});}return;}
  if(el.hasAttribute('data-month')){options.onMonth?.(el.value);return;}
  if(el.dataset.filter==='query')return;
  if(el.dataset.filter){ui[el.dataset.filter]=el.value;ui.personId='';ui.page=1;render();return;}
  if(el.dataset.column){el.checked?ui.columns.add(el.dataset.column):ui.columns.delete(el.dataset.column);ui.page=1;render({preserveTableScroll:true});return;}
  if(el.hasAttribute('data-person-select')){ui.personId=el.value;render();}
 };
 const applyQuery=()=>{clearTimeout(queryTimer);queryTimer=null;if(destroyed||composing)return;const value=ui.queryDraft;if(value===ui.query)return;ui.query=value;ui.personId='';ui.page=1;render();};
 const onInput=event=>{if(event.target.dataset.filter!=='query')return;ui.queryDraft=event.target.value;clearTimeout(queryTimer);if(composing||event.isComposing)return;if(!ui.queryDraft)applyQuery();else queryTimer=setTimeout(applyQuery,300);};
 const onCompositionStart=event=>{if(event.target.dataset.filter==='query'){composing=true;clearTimeout(queryTimer);}};
 const onCompositionEnd=event=>{if(event.target.dataset.filter==='query'){composing=false;onInput(event);}};
 const onToggle=event=>{if(event.target.isConnected&&event.target.matches('.att-columns'))ui.columnsOpen=event.target.open;};
 const listeners=[['click',onClick],['change',onChange],['input',onInput],['compositionstart',onCompositionStart],['compositionend',onCompositionEnd],['toggle',onToggle,true]];
 for(const [name,fn,capture] of listeners)host.addEventListener(name,fn,capture);render({preserveTableScroll:true});
 return {getState(){const input=host.querySelector('[data-filter="query"]');const table=host.querySelector('.att-table');return {...ui,focusQuery:input===host.ownerDocument.activeElement,querySelection:input?[input.selectionStart,input.selectionEnd]:null,tableScroll:table?{left:table.scrollLeft,top:table.scrollTop}:null,query:input?.value??ui.queryDraft,queryDraft:input?.value??ui.queryDraft,columns:new Set(ui.columns),columnsOpen:host.querySelector('.att-columns')?.open??ui.columnsOpen};},destroy(){closeDialog();destroyed=true;clearTimeout(queryTimer);for(const [name,fn,capture] of listeners)host.removeEventListener(name,fn,capture);host.innerHTML='';}};
}
