import {attendanceCategoryAllowed,attendanceCategoryBadge,ensureAttendanceBadgeStyles,legalLeaveCategories,punchSummary,attendanceProcessingCells} from './attendance-presentation.mjs';
// randomUUID is restricted to secure contexts; LAN-only disposable previews also need safe IDs.
export function offsetOperationId(random=globalThis.crypto){
 if(typeof random?.randomUUID==='function')return random.randomUUID();
 if(typeof random?.getRandomValues!=='function')throw Error('当前浏览器缺少安全随机数，请使用受支持的浏览器或HTTPS地址');
 const bytes=random.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=v=>v?new Date(typeof v==='number'||/^\d+$/.test(String(v))?Number(v):Date.parse(v)).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'}):'—';
const statusText=value=>({pending:'待审批',approved:'已批准',partial:'部分批准',rejected:'已拒绝',withdrawn:'已撤回',source_invalid:'源异常已消除',issued:'已发放',not_issued:'尚未发放',difference_review:'待差异复核',not_configured:'未配置',freeze:'冻结',approve:'使用',release:'释放',refund:'退回',grant:'发放',submit:'提交申请',decide:'审批结案',withdraw:'撤回申请',transfer:'授权转办',source_evidence_changed:'源依据更新',source_invalidated:'源异常消除并释放／退回',ready:'可结算',queued:'待分批结算',pending_review:'待核算',not_closed:'来源月未结束',identity_unbound:'未关联人员'}[value]||value);
let depth=0,previousOverflow='';
const sheets=new Map();
if(typeof window!=='undefined')window.addEventListener('popstate',event=>{
 const target=event.state?.offsetSheet;
 if(target&&(!sheets.has(target)||sheets.get(target).closed)){history.back();return;}
 for(const [id,entry] of [...sheets].reverse()){
  if(entry.closed)continue;if(id===target)break;
  entry.fromHistory=true;entry.dialog.close();entry.release();
 }
});
export function closeOffsetSheets(){
 for(const entry of [...sheets.values()].reverse())if(!entry.closed){entry.fromHistory=true;entry.dialog.close();entry.release();}
 if(typeof history!=='undefined'&&history.state?.offsetSheet){const next={...history.state};delete next.offsetSheet;history.replaceState(next,'');}
}

export function availableOffsetItems(day){return (day.eligibility?.items||[]).filter(item=>!(day.offset?.items||[]).some(current=>current.eventId===item.eventId&&(current.decision==='pending'||current.decision==='approved'&&current.effective)));}

export function openOffsetSheet(title,html){
 const historyId=offsetOperationId();
 const dialog=document.createElement('dialog');dialog.className='offset-sheet';
 dialog.setAttribute('aria-labelledby','offset-title-'+historyId);
 dialog.innerHTML=`<header class="dialog-head offset-sheet-head"><h2 id="offset-title-${historyId}">${esc(title)}</h2><button class="icon-btn offset-sheet-close" type="button" data-close aria-label="关闭" title="关闭">×</button></header><section>${html}</section>`;
 if(!document.querySelector('#offset-sheet-style')){const style=document.createElement('style');style.id='offset-sheet-style';style.textContent=`.offset-sheet{border:0;border-radius:20px;box-shadow:0 26px 80px rgba(16,24,40,.24);max-width:calc(100vw - 24px);font:inherit;width:min(680px,calc(100vw - 24px));max-height:85dvh;padding:0;color:inherit;background:var(--card,#fff)}.offset-sheet[open]{display:flex;flex-direction:column}.offset-sheet::backdrop{background:rgba(17,24,39,.30);backdrop-filter:blur(6px)}.offset-sheet>.offset-sheet-head{display:flex;flex-shrink:0;justify-content:space-between;align-items:center;gap:12px;position:relative;top:0;margin:0;padding:12px 18px;border-bottom:1px solid rgba(229,231,235,.75);background:rgba(255,255,255,.96)}.offset-sheet-head h2{flex:1;min-width:0;margin:0;font-size:19px;line-height:1.3;font-weight:750;color:#111827;overflow-wrap:anywhere}.offset-sheet .offset-sheet-close{display:inline-flex;align-items:center;justify-content:center;flex:none;box-sizing:border-box;width:44px;height:44px;min-height:44px;padding:0;border:1px solid #D7DDE5;border-radius:999px;background:#fff;color:#4B5563;box-shadow:0 1px 2px rgba(16,24,40,.04);font:inherit;font-size:20px;line-height:1;cursor:pointer}.offset-sheet .offset-sheet-close:hover{background:#F8FAFC;box-shadow:0 8px 18px rgba(16,24,40,.08)}.offset-sheet .offset-sheet-close:focus:not(:focus-visible){outline:none}.offset-sheet .offset-sheet-close:focus-visible{outline:2px solid var(--brand,#0f5f7a);outline-offset:2px}.offset-sheet>section{padding:18px;min-height:0;flex:1 1 auto;overflow:auto;overscroll-behavior:contain}.offset-sheet button,.offset-sheet input,.offset-sheet select{min-height:44px}.offset-sheet textarea{width:100%;min-height:80px;box-sizing:border-box}.offset-sheet article{padding:10px 0;border-bottom:1px solid #e4e9ed}.offset-sheet small{display:block}.offset-sheet .offset-points{white-space:pre-wrap;overflow-wrap:anywhere}.offset-sheet footer{position:sticky;bottom:0;background:inherit;padding:8px 0 calc(8px + env(safe-area-inset-bottom))}.offset-credit-values{display:flex;justify-content:center;align-items:center;gap:2px}.offset-credit-values button{border:0;background:none;color:inherit;min-height:44px;padding:2px;font:inherit}.offset-table-sheet{width:min(1040px,calc(100vw - 24px))}.home-att-table{width:100%;overflow-x:auto;overscroll-behavior-x:contain;border:1px solid #e4ebf2;border-radius:8px;color:#1c3046}.home-att-table table{border-collapse:separate;border-spacing:0;font-size:13px;line-height:1.55;min-width:864px;width:100%}.home-att-table th,.home-att-table td{padding:6px 8px;border-bottom:1px solid #e8eef4;border-right:1px solid #eef3f7;vertical-align:top;text-align:left;white-space:normal;overflow-wrap:anywhere}.home-att-table th{white-space:nowrap;background:#eef3f8;color:#3c556e;font-weight:600}.home-att-table tbody tr:hover td{background:#f8fbfd}.home-att-table small{font-size:12px;color:#65758a;line-height:1.55}.home-att-table td:first-child{min-width:80px;white-space:nowrap}.home-att-table td:nth-child(2){min-width:96px}.home-schedule-table td:nth-child(3){min-width:72px}.home-schedule-table td:nth-child(4){min-width:104px}.home-schedule-table td:nth-child(5),.home-schedule-table td:nth-child(6){min-width:160px;white-space:nowrap}.home-schedule-table td:nth-child(7){min-width:80px}.home-issues-table td:nth-child(3),.home-issues-table td:nth-child(4){min-width:160px}.home-issues-table td:nth-child(5),.home-issues-table td:nth-child(6){min-width:120px}.home-att-table table.home-leave-table{min-width:560px}.home-att-table .home-leave-table td:first-child{white-space:normal;min-width:140px}.home-leave-table td:nth-child(n+2){min-width:90px}.home-att-table button{border:0;background:none;color:inherit;font:inherit;text-decoration:none;cursor:pointer;text-align:left}.offset-sheet [role=alert]{color:#8c3f22}@media(max-width:600px){.offset-sheet{margin:auto 0 0;width:100%;max-width:100%;border-radius:20px 20px 0 0;box-sizing:border-box}.offset-sheet>.offset-sheet-head{padding:10px 14px}.offset-sheet>section{padding:14px;padding-bottom:calc(14px + env(safe-area-inset-bottom))}}`;document.head.append(style);}
 document.body.append(dialog);if(depth++===0){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
 const restoreFocus=document.activeElement;let released=false;
 const entry={dialog,closed:false,fromHistory:false,release:null};sheets.set(historyId,entry);
 try{history.pushState({...history.state,offsetSheet:historyId},'');}catch{entry.fromHistory=true;}
 const release=()=>{if(released)return;released=true;dialog.remove();if(--depth===0)document.body.style.overflow=previousOverflow;restoreFocus?.focus?.({preventScroll:true});const fromHistory=entry.fromHistory;sheets.set(historyId,{closed:true});if(!fromHistory&&history.state?.offsetSheet===historyId)history.back();if(sheets.size>256)for(const [key,value] of sheets){if(sheets.size<=256)break;if(value.closed)sheets.delete(key);}};entry.release=release;
 dialog.querySelector('[data-close]').onclick=()=>{dialog.close();release();};
 dialog.addEventListener('close',release,{once:true});
 dialog.showModal();return dialog;
}
const pointText=day=>(day.punchDetails||[]).map(p=>`${p.type==='OffDuty'?'下班':'上班'} 计划${time(p.planned)}／实际${time(p.actual)} ${p.status} ${p.reason}`).join('\n');
export async function openOffsetRequest(api,id,onChange=()=>{}){
 const dialog=openOffsetSheet('考勤抵消申请','加载中…'),body=dialog.querySelector('section');
 try{
  const data=await api('/attendance/offsets/requests/'+encodeURIComponent(id));if(!dialog.open)return;
  body.innerHTML=`<p>额度状态：${esc(statusText(data.creditStatus))}</p><p>申请状态：${esc(statusText(data.status))} · 申请人 ${esc(data.applicant?.name||data.person_id)}</p><p>${esc(data.note)}</p><small>当班责任依据：${esc(JSON.parse(data.responsibility_json).team)}</small><details><summary>提交时依据与流转记录</summary><p>${data.submittedEvidence?'已保存提交时的独立证据快照':'历史提交时详细证据未保存，不补造原始依据'}</p>${(data.submittedEvidence||[]).map(e=>`<div class="offset-points">${esc(pointText({punchDetails:[e.evidence]}))}</div>`).join('')}${(data.history||[]).map(h=>`<small>${esc(time(h.created_at))} · ${esc(statusText(h.action))} · ${esc(h.actor_id)}</small>`).join('')}</details><details><summary>当天完整考勤依据</summary>${(data.dayEvidence||[]).map(d=>`<article>${esc(d.date)} · ${esc(d.result.category)}<p>${esc(d.result.reason)}</p><div class="offset-points">${esc(pointText(d.result))}</div>${d.approvals.map(a=>`<p>${esc(a.subType||a.kind)}：${esc(a.reason||'未取得事由')}</p>`).join('')}</article>`).join('')}</details><form>${data.items.map(i=>`<article><strong>${esc(i.event.work_date)} ${i.event.kind==='day_off_missing'?'白班下班缺卡':'白班早退'}</strong><p>${esc(statusText(i.decision))}${i.effective?' · 已抵消':i.decision==='approved'?' · 抵消已失效／已退回':''}</p><small>计划：${time(i.event.planned)}，1项／1次</small>${data.canApprove&&i.decision==='pending'?`<select name="decision-${esc(i.id)}" required><option value="">待决定</option><option value="approved">批准</option><option value="rejected">拒绝</option></select><textarea name="reason-${esc(i.id)}" placeholder="拒绝原因（拒绝必填）" maxlength="2000"></textarea>`:`<p>${esc(i.reason||'')}</p>`}</article>`).join('')}<p role="alert"></p>${data.canWithdraw?'<button type="button" data-withdraw>撤回本人申请</button>':''}${data.canApprove?'<footer><button type="button" data-all="approved">全部批准</button><button type="button" data-all="rejected">全部拒绝</button><button type="submit">确认审批并结案</button></footer>':''}</form>`;
  for(const button of body.querySelectorAll('[data-all]'))button.onclick=()=>body.querySelectorAll('select').forEach(select=>select.value=button.dataset.all);
  const key=offsetOperationId();const withdrawal=body.querySelector('[data-withdraw]');if(withdrawal)withdrawal.onclick=async()=>{withdrawal.disabled=true;try{await api('/attendance/offsets/requests/'+id+'/withdraw',{method:'POST',headers:{'Idempotency-Key':key},body:{version:data.version}});dialog.close();onChange();}catch(e){body.querySelector('[role=alert]').textContent=e.message;withdrawal.disabled=false;}};body.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=body.querySelector('[type=submit]');if(!button)return;button.disabled=true;
   const decisions=data.items.filter(i=>i.decision==='pending').map(i=>({id:i.id,decision:body.querySelector(`[name="decision-${i.id}"]`).value,reason:body.querySelector(`[name="reason-${i.id}"]`).value}));
   try{await api('/attendance/offsets/requests/'+id+'/decide',{method:'POST',headers:{'Idempotency-Key':key},body:{version:data.version,decisions}});dialog.close();onChange();}catch(e){body.querySelector('[role=alert]').textContent=e.message;button.disabled=false;}
  };
 }catch(e){body.textContent=e.message;}
}
export async function openActionTasks(api,onChange=()=>{}){
 const dialog=openOffsetSheet('待处理','加载中…'),body=dialog.querySelector('section');
 try{const data=await api('/action-tasks');if(!dialog.open)return;
  body.innerHTML=data.items.length?data.items.map(item=>`<article><button type="button" data-task="${esc(item.sourceId)}">${esc(item.title)} ›</button><small>${esc(time(item.createdAt))}</small></article>`).join(''):'暂无待处理';
  let cursor=data.nextCursor;
  const more=document.createElement('button');more.type='button';more.textContent='加载更多';more.hidden=!cursor;body.append(more);
  more.onclick=async()=>{more.disabled=true;try{const next=await api('/action-tasks?cursor='+encodeURIComponent(cursor));more.insertAdjacentHTML('beforebegin',next.items.map(item=>`<article><button type="button" data-task="${esc(item.sourceId)}">${esc(item.title)} ›</button><small>${esc(time(item.createdAt))}</small></article>`).join(''));cursor=next.nextCursor;more.hidden=!cursor;}catch(e){more.textContent=e.message;}finally{more.disabled=false;}};
  body.onclick=event=>{const button=event.target.closest('[data-task]');if(button)openOffsetRequest(api,button.dataset.task,()=>{dialog.close();onChange();openActionTasks(api,onChange);});};
 }catch(e){body.textContent=e.message;}
}
export function ownLeaveTables(cells,tab){
 const rows=[],positive=v=>Number.isFinite(v)&&v>0,quantity=(value,unit)=>`${esc(value)}${esc(unit)}`;
 for(const cell of cells){
  if(tab==='quota')for(const u of cell.units||[]){if(!positive(u.quota))continue;
   const sources=(cell.quotas||[]).filter(q=>!q.values||q.values.some(v=>v.unit===u.unit&&positive(v.quota)));
   const validity=sources.map(q=>`<small>${esc((q.names||[]).filter(attendanceCategoryAllowed).join('、'))} · ${{active:'有效',expired:'已过期',future:'未生效'}[q.availability]||'有效期待核对'}<br>${time(q.start)}—${time(q.end)}</small>`).join('');
   rows.push([`${esc(cell.group)}${validity}`,quantity(u.used,u.unit),quantity(u.quota,u.unit),quantity(u.remaining,u.unit)+`${u.unavailable?`<small>含${quantity(u.unavailable,u.unit)}已过期或未生效</small>`:''}`,`当前可用${quantity(Math.max(0,u.remaining-u.unavailable),u.unit)}`]);
  }
  else for(const record of cell.records||[]){if(!attendanceCategoryAllowed(record.name))continue;const values=(record.values||[]).filter(v=>Number.isFinite(v.amount)&&v.amount!==0);if(!values.length)continue;
   rows.push([esc(cell.group),values.map(v=>quantity(v.amount,v.unit)).join('<br>'),`${time(record.start)}<br>至 ${time(record.end)}`,esc(record.period||record.status||'状态未取得')]);
  }
 }
 const headers=tab==='quota'?['假期','已用','额度','剩余','当前可用']:['假期','数量','使用期间','状态'];
 const incomplete=!cells.length||cells.some(c=>c.coverage&&c.coverage!=='complete'||!c.status||c.status==='not_synced');
 const notes=cells.flatMap(c=>(c.issues||[]).map(i=>`${c.group}：${i}`));
 const empty=incomplete?'假期数据尚未同步或未完整，暂未取得可显示记录':tab==='quota'?'暂无已发放额度的假期':'暂无非零休假记录';
 return `${incomplete?'<p>部分假期数据尚未同步或未完整，以下仅显示已取得的记录。</p>':''}${notes.map(n=>`<p>${esc(n)}</p>`).join('')}<small>表格可左右滑动查看完整内容。</small><div class="home-att-table"><table class="home-leave-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(c=>`<td>${c}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">${empty}</td></tr>`}</tbody></table></div>`;
}
export function ownLeaveDetail(cell,tab){return ownLeaveTables([cell],tab);}

export function personalDayStatus(day){
 const approved=(day.offset?.items||[]).filter(i=>i.decision==='approved'&&i.effective);
 const names=[...new Set(approved.map(i=>i.approverName).filter(Boolean))];
 return `${day.offset?.label?`<small data-offset-label>${esc(day.offset.label)}</small>`:''}${approved.length?`<p><strong>处理结果：</strong>${day.offset?.label==='已抵消'?'已抵消，原始记录保留':`${day.offset?.label||'部分已抵消'}，原始记录保留`}</p><p>审批人：${esc(names.join('、')||'未取得姓名')} ｜ 使用次数：${approved.length}次</p>`:''}<p><strong>原始判定：</strong>${esc(day.reason||'—')}</p>`;
}

export function homeAttendanceTable(days,kind,{canApply=false}={}){
 const leaves=legalLeaveCategories({people:[{days}]});
 const category=d=>`<button type="button" data-open-day="${esc(d.date)}">${attendanceCategoryBadge(d.category,leaves)}${d.offset?.label?`<small>${esc(d.offset.label)}</small>`:''}</button>${canApply&&kind==='issues'&&availableOffsetItems(d).length?`<button type="button" data-apply="${esc(d.date)}">申请抵消</button>`:''}`;
 const schedule=kind==='schedule',headers=schedule?['日期','类别','班次','出差用途','有效实际上班','有效实际下班','当日加班']:['日期','类别','原因','问题','处理结果','审批人'];
 const rows=days.map(d=>{const {on,off,multiple}=punchSummary(d),actual=v=>`${esc(time(v.actual))}<small>${esc(v.status)}${multiple?' · 多段':''}</small>`;
 return [esc(d.date),category(d),...(schedule?[esc(d.shift||'—'),esc((d.purposes||[]).map(a=>a.category||a.status).join('；')||'—'),actual(on),actual(off),d.overtime?.seconds==null?`—<small>${esc(d.overtime?.reason||'无法计算')}</small>`:`${Math.floor(d.overtime.seconds/3600)}小时${Math.floor(d.overtime.seconds%3600/60)}分`]:[esc(d.reason),esc([...(d.issues||[]),d.syncError].filter(Boolean).join('；')||'—'),...attendanceProcessingCells(d,esc)])];});
 return `<small>表格可左右滑动查看完整内容。</small><div class="home-att-table" tabindex="0" aria-label="可横向滚动的${schedule?'排班':'异常'}表格"><table class="${schedule?'home-schedule-table':'home-issues-table'}"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(cells=>`<tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">本月暂无考勤异常</td></tr>`}</tbody></table></div>`;
}

export async function openPersonalAttendance(api,kind,onChange=()=>{},onOpenDay=null){
 const titles={schedule:'前后三天排班',issues:'我的全部考勤异常',accumulation:'本月累计明细',credits:'本月额度与流水',leaves:'我的假期'};
 const dialog=openOffsetSheet(titles[kind]||'我的考勤','加载中…'),body=dialog.querySelector('section');
 try{
  if(kind==='credits'){
   const month=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}).slice(0,7),[account,ledger,requests]=await Promise.all([api('/attendance/offsets/balance'),api('/attendance/offsets/ledger?month='+month),api('/attendance/offsets/requests')]);
   if(!dialog.open)return;const requestRows=Array.isArray(requests)?requests:requests.items;body.innerHTML=`<p>${esc(month)}：${account.sourceKind==='initial_fixed'?'首期固定发放':'上月兑换'}${account.granted??'—'}次，已用${account.used??'—'}，冻结${account.frozen??'—'}，可用${account.available??'—'}次。</p><p>状态：${esc(statusText(account.status))}。不同月份额度不自动结转或清零。</p>${ledger.map(r=>`<article>${esc(statusText(r.kind))} ${r.amount}次<small>${esc(time(r.created_at))}</small></article>`).join('')}<h3>本人申请</h3><div data-request-list>${requestRows.map(r=>`<button data-request="${esc(r.id)}">${esc(statusText(r.status))} · ${esc(time(r.created_at))}</button>`).join('')}</div>${requests.nextCursor?'<button data-more-requests>加载更多申请</button>':''}`;
   let cursor=requests.nextCursor;body.onclick=async e=>{const b=e.target.closest('[data-request]');if(b){openOffsetRequest(api,b.dataset.request,onChange);return;}const more=e.target.closest('[data-more-requests]');if(!more)return;more.disabled=true;try{const next=await api('/attendance/offsets/requests?month='+month+'&cursor='+encodeURIComponent(cursor));body.querySelector('[data-request-list]').insertAdjacentHTML('beforeend',next.items.map(r=>`<button data-request="${esc(r.id)}">${esc(statusText(r.status))} · ${esc(time(r.created_at))}</button>`).join(''));cursor=next.nextCursor;more.hidden=!cursor;}catch(error){more.textContent=error.message;}finally{more.disabled=false;}};return;
  }
  if(kind==='leaves'){
   dialog.classList.add('offset-table-sheet');
   const data=await api('/attendance/self/leaves');if(!dialog.open)return;const cells=data.people?.[0]?.cells||[];
   body.innerHTML=`<small>最近成功同步：${time(data.people?.[0]?.syncedAt)}${data.people?.[0]?.error?' · '+esc(data.people[0].error):''}${data.people?.[0]?.identityIssue?' · '+esc(data.people[0].identityIssue):''}</small><nav><button data-tab="quota">假期额度</button><button data-tab="records">休假记录</button></nav><div data-leave-body></div>`;
   const render=tab=>{body.querySelector('[data-leave-body]').innerHTML=ownLeaveTables(cells,tab);};
   body.onclick=e=>{const b=e.target.closest('[data-tab]');if(b)render(b.dataset.tab);};render('quota');return;
  }
  const data=await api('/attendance/self/'+kind);if(!dialog.open)return;
  const days=data.people?.[0]?.days||data.days||[];
  if(kind==='schedule'||kind==='issues'){ensureAttendanceBadgeStyles(document);dialog.classList.add('offset-table-sheet');body.innerHTML=`<small>${esc(data.note||'按归属工作日展示；时间差额不是已批准加班时长。')}</small>${homeAttendanceTable(days,kind,{canApply:data.offsetWritesEnabled})}<p role="alert"></p>`;
  }else
  body.innerHTML=`<small>${esc(data.note||'下班后有效打卡差额，按秒核算；不是已批准加班时长。')}</small>${days.map(d=>`<article><strong>${esc(d.date)} ${esc(d.category)}</strong>${personalDayStatus(d)}${kind==='accumulation'?`<p>${d.overtime.seconds===null?'—':d.overtime.seconds+'秒'} · ${esc(d.overtime.reason)}</p>`:`<div class="offset-points">${esc(pointText(d))}</div>`}${availableOffsetItems(d).length&&data.offsetWritesEnabled?`<button data-apply="${esc(d.date)}">申请抵消（仅合规下班异常）</button>`:''}</article>`).join('')||'暂无记录'}<p role="alert"></p>`;
  body.onclick=async event=>{const target=event.target.closest('[data-open-day]');if(target&&onOpenDay){target.disabled=true;try{await onOpenDay({personId:data.personId||data.people?.[0]?.personId,date:target.dataset.openDay});}catch(error){if(dialog.open){body.querySelector('[role=alert]').textContent=error.message;target.disabled=false;}}return;}const b=event.target.closest('[data-apply]');if(!b)return;const day=days.find(d=>d.date===b.dataset.apply),form=openOffsetSheet('本人申请抵消',`<form>${availableOffsetItems(day).map(i=>`<label><input type="checkbox" name="item" value="${esc(i.eventId)}">${esc(i.type==='day_off_missing'?'白班下班缺卡':'白班早退')} · 1次</label>`).join('')}<textarea required name="note" maxlength="2000" placeholder="申请说明"></textarea><p role="alert"></p><footer><button type="submit">确认并冻结次数</button></footer></form>`),key=offsetOperationId();
   form.querySelector('form').onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;try{await api('/attendance/offsets/requests',{method:'POST',headers:{'Idempotency-Key':key},body:{events:[...form.querySelectorAll('[name=item]:checked')].map(v=>v.value),note:form.querySelector('textarea').value}});form.close();dialog.close();onChange();}catch(error){form.querySelector('[role=alert]').textContent=error.message;submit.disabled=false;}};
  };
 }catch(e){if(dialog.open)body.textContent=e.message;}
}

export async function openOffsetAdministration(api,people,permissions){
 const permitted=code=>permissions.includes(code),dialog=openOffsetSheet('累计兑换与班次责任',''),body=dialog.querySelector('section');
 let candidates=[],routingIssues=[];if(permitted('attendance.offset.responsibility.manage')){try{[candidates,routingIssues]=await Promise.all([api('/attendance/offsets/responsibility-candidates'),api('/attendance/offsets/routing-issues')]);}catch{}}
 const personLabel=id=>{const p=people.find(p=>p.personId===id);return p?[p.name,p.employeeNo].filter(Boolean).join('／'):id;};
 const options=people.map(p=>`<option value="${esc(p.personId)}">${esc(p.name)}／${esc(p.employeeNo)}</option>`).join('');
 body.innerHTML=`<p>当前仅支持白班下班缺卡、白班早退。未确认的跨月、结转等政策保持关闭。</p>${permitted('attendance.offset.rules.manage')?`<form data-initial><h3>首期额度初始化</h3><p>首期每人固定2次，不依据累计时间、不需要设置换算。仅发放一次，已有账户不覆盖；后续月份使用未来月规则。</p><label>适用人员<select name="personIds" multiple required>${options}</select></label><button type="submit">只读预览首期额度</button><button type="button" data-init-confirm disabled>确认初始化并分批结算</button><button type="button" data-init-refresh>刷新进度</button><p role="alert"></p><div data-init-result></div><div data-init-progress></div></form><form data-rule><h3>未来来源月兑换规则</h3><label>来源月份<input name="sourceMonth" type="month" required></label><label>累计H小时<input name="hours" inputmode="decimal" required></label><label>兑换C次<input name="count" type="number" min="1" step="1" required></label><label>月上限M次（0为停发）<input name="cap" type="number" min="0" step="1" required></label><label>适用人员<select name="personIds" multiple required>${options}</select></label><button>保存未来月规则</button><p role="alert"></p></form><form data-trial><h3>完整月核算</h3><select name="personId">${options}</select><input name="sourceMonth" type="month" required><button>只读试算</button><button type="button" data-issue>确认完整核算后发放</button><pre data-result></pre><p role="alert"></p></form>`:''}${permitted('attendance.offset.responsibility.manage')?`<form data-responsibility><h3>历史实际班次责任核实</h3><label>员工<select name="personId">${options}</select></label><label>归属工作日<input name="workDate" type="date" required></label><label>实际工作班组<input name="team" required></label><input name="leaderPersonId" type="hidden"><label>实际负责人（有审批权限）<select name="assigneeUserId" required><option value="">请选择负责人</option>${candidates.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}／${esc(c.employeeNo)}</option>`).join('')}</select></label><label>核实证据<textarea name="evidence" required maxlength="4000"></textarea></label><button>保存核实记录</button><p role="alert"></p></form>`:''}`;
 if(routingIssues.length)body.insertAdjacentHTML('beforeend','<h3>待授权转办</h3>'+routingIssues.map(r=>`<form data-transfer="${esc(r.id)}" data-version="${r.version}"><p>${esc(r.reason)}</p><select name="assigneeUserId" required>${candidates.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}／${esc(c.employeeNo)}</option>`).join('')}</select><textarea name="reason" required placeholder="授权转办依据"></textarea><button>确认转办</button><p role="alert"></p></form>`).join(''));
 for(const form of body.querySelectorAll('form:not([data-initial])')){
  let key=offsetOperationId();const submit=async(kind)=>{
   const payload=Object.fromEntries(new FormData(form));if(form.dataset.transfer)payload.version=Number(form.dataset.version);if(kind==='responsibility')payload.leaderPersonId=candidates.find(c=>c.id===payload.assigneeUserId)?.personId;if(kind==='rules'){payload.personIds=[...form.querySelector('[name=personIds]').selectedOptions].map(o=>o.value);payload.count=Number(payload.count);payload.cap=Number(payload.cap);}
   try{const result=await api('/attendance/offsets/'+kind,{method:'POST',headers:{'Idempotency-Key':key},body:payload});form.querySelector('[role=alert]').textContent=kind==='trial'?'试算完成（未发放）':'操作已保存';const pre=form.querySelector('[data-result]');if(pre)pre.textContent=JSON.stringify(result,null,2);key=offsetOperationId();}catch(e){form.querySelector('[role=alert]').textContent=e.message;}
  };
  form.onsubmit=e=>{e.preventDefault();submit(form.dataset.transfer?'requests/'+form.dataset.transfer+'/transfer':form.hasAttribute('data-rule')?'rules':form.hasAttribute('data-trial')?'trial':'responsibility');};
  form.querySelector('[data-issue]')?.addEventListener('click',()=>submit('issue'));
 }
 const initial=body.querySelector('[data-initial]');
 if(initial){
  let preview=null,sequence=0,key=offsetOperationId();const confirm=initial.querySelector('[data-init-confirm]'),message=initial.querySelector('[role=alert]');
  const progress=async()=>{try{const data=await api('/attendance/offsets/state'),p=data.initialization;initial.querySelector('[data-init-progress]').innerHTML=['configured','requires_fixed_revision'].includes(p?.status)?`<p>${p.mode==='fixed_initial'?'首期固定2次':'旧换算确认待修订为固定2次'} · ${esc(p.usageMonth)}：${p.total}人</p>${p.people.map(r=>`<small>${esc(personLabel(r.personId))} · ${esc(statusText(r.status))} · ${r.granted===null?'—':r.granted+'次'}${r.coverage?' · 待核算原因见预览覆盖明细':''}</small>`).join('')}`:'尚未配置首期额度';if(!preview&&p?.status==='requires_fixed_revision'){for(const option of initial.querySelector('[name=personIds]').options)option.selected=p.personIds.includes(option.value);}}catch(e){message.textContent=e.message;}};
  initial.oninput=()=>{sequence++;preview=null;confirm.disabled=true;};
  initial.onsubmit=async e=>{e.preventDefault();const current=++sequence;preview=null;confirm.disabled=true;const payload={personIds:[...initial.querySelector('[name=personIds]').selectedOptions].map(o=>o.value)};
   try{const result=await api('/attendance/offsets/initialization/preview',{method:'POST',body:payload});if(current!==sequence||!dialog.open)return;preview={payload,result};key=offsetOperationId();initial.querySelector('[data-init-result]').innerHTML=`<p>${esc(result.usageMonth)} · 首期每人固定2次</p>${result.people.map(r=>`<article>${esc(personLabel(r.personId))} · ${esc(statusText(r.status))} · ${r.earned}次${r.existingAccount?' · 已有账户不可覆盖':''}</article>`).join('')}`;confirm.disabled=result.alreadyInitialized||result.people.some(r=>r.existingAccount);message.textContent=result.alreadyInitialized?'首期已确认，仅可查看进度':'预览不写入、不发放；确认后保存首期政策并分批发放，旧确认记录保留';}catch(error){if(current===sequence)message.textContent=error.message;}
  };
  confirm.onclick=async()=>{if(!preview)return;confirm.disabled=true;const saved=preview;try{await api('/attendance/offsets/initialization/confirm',{method:'POST',headers:{'Idempotency-Key':key},body:{...saved.payload,previewHash:saved.result.previewHash}});sequence++;preview=null;message.textContent='首期固定2次已确认，将分批发放；后续月份不会重复发放';await progress();}catch(error){message.textContent=error.message;confirm.disabled=!preview;}};
  initial.querySelector('[data-init-refresh]').onclick=progress;await progress();
 }
 return dialog;
}
