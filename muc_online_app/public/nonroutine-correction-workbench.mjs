const states={APPROVED_PENDING_PERIOD:'已批准，待办理账期',POSTED:'已入账'};
const periods={UNKNOWN:'未确认',OPEN:'开放',CLOSED:'已封账'};
const roleOrder=['主做','检验','辅助'];
const kind=value=>value==='STANDARD'?'标准认定':'评议认定';
const hours=value=>value===null||value===undefined||!Number.isFinite(Number(value))?'待核对':String(Math.round(Number(value)*100)/100);
const signed=value=>Number(value)>0?'+'+hours(value):hours(value);
const pairs=people=>people.map(person=>JSON.stringify([person.personId,person.role])).sort().join('|');
const safeContext=(value,escape)=>[value?.date,value?.flightNo,value?.aircraftNo].filter(Boolean).map(escape).join(' · ');
const summary=(value,escape)=>`<div class="hc-summary"><p>原净额<strong>${escape(hours(value.beforeHours))} 小时</strong></p><p>目标净额<strong>${escape(hours(value.targetHours))} 小时</strong></p><p>本次差额<strong>${escape(signed(value.deltaHours))} 小时</strong></p></div>`;
export function renderCorrectionWorkbench(state,escape){
 const {caps={},items=[],nextCursor=null,sources=[],sourceCursor=null,sourceSearch='',filter='APPROVED_PENDING_PERIOD',source=null,record=null,preview=null,amount='',reason='',roleReason='',participants=[],verified=false,targetMonth='',target=null,periodReason='',busy=false,message=''}=state;
 const people=source?.people||[];
 return `<style>.hc-workbench{min-width:0;overflow-wrap:anywhere}.hc-workbench fieldset{min-width:0;border:1px solid var(--line-strong,#D7DDE5);border-radius:10px;padding:12px}.hc-workbench label{display:grid;gap:6px;margin:12px 0}.hc-workbench input,.hc-workbench select,.hc-workbench textarea{font-size:16px;min-height:44px;max-width:100%;box-sizing:border-box}.hc-workbench textarea{width:100%}.hc-workbench button{min-height:44px;margin:4px 6px 4px 0;padding:8px 12px;max-width:100%;white-space:normal}.hc-card{border:1px solid var(--line-strong,#D7DDE5);border-radius:10px;padding:12px;margin:12px 0}.hc-workbench .hc-check{display:flex;align-items:center;gap:10px;min-height:44px}.hc-workbench input[type=checkbox]{width:20px;min-height:20px;height:20px;flex:0 0 20px}.hc-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.hc-summary p{min-width:0;padding:8px;background:var(--brand-soft,#E8F4F7);border-radius:6px}.hc-summary strong{display:block}.hc-changes p{padding:8px 0;border-bottom:1px solid var(--line,#E5E7EB)}.hc-source-list{display:grid;gap:4px}.hc-source-list button{text-align:left}</style>
 <section class="hc-workbench"><h3>已确认工时更正</h3><p>更正只追加差额，保留原报工和原认定。统计仍归原作业月份，另记办理账期。</p><p role="status" aria-live="polite" data-hc-status>${escape(message)}</p>
 <fieldset ${busy?'disabled':''}>
 ${caps.approve?`<details ${source?'':'open'}><summary>选择已确认来源</summary><label>查找工作<input name="hc_search" value="${escape(sourceSearch)}" maxlength="100" placeholder="名称 / 航班 / 机号"></label><button type="button" data-hc-query-sources>查询来源</button><div class="hc-source-list">${sources.map(item=>`<button type="button" data-hc-source="${escape(item.subtaskId)}">${escape(item.title)}<br>${safeContext(item,escape)} · ${escape(kind(item.kind))}${item.pendingCorrectionId?' · 有待办理更正':''}</button>`).join('')||'<p>当前查询暂无可办理的已确认来源。</p>'}</div>${sourceCursor?'<button type="button" data-hc-more-sources>更多来源</button>':''}</details>`:''}
 <details ${source?'':'open'}><summary>更正事项</summary><label>办理状态<select name="hc_filter">${[['APPROVED_PENDING_PERIOD','待办理账期'],['POSTED','已入账'],['','全部']].map(([value,label])=>`<option value="${value}" ${filter===value?'selected':''}>${label}</option>`).join('')}</select></label><button type="button" data-hc-query>查询 / 刷新事项</button><div class="hc-source-list">${items.map(item=>`<button type="button" data-hc-open="${escape(item.id)}">${escape(item.title||'工时更正')} · 第${escape(item.number||'—')}次<br>${safeContext(item,escape)} · ${escape(states[item.state]||item.state)} · 目标 ${escape(hours(item.targetHours))} 小时</button>`).join('')||'<p>当前范围暂无更正事项。</p>'}</div>${nextCursor?'<button type="button" data-hc-more>更多事项</button>':''}</details>
 ${source?`<article class="hc-card"><h4>${escape(source.decision.title||'已确认工作')}</h4><p>${safeContext(source.context,escape)}</p><p>${escape(kind(source.kind))} V${escape(source.sourceVersion)} · 原认定 ${escape(hours(source.decision.recognizedHours))} 小时 · 当前净额 ${escape(hours(source.currentHours))} 小时</p><p>原作业／统计月份 ${escape(source.workMonth)}</p>${source.pendingCorrectionId?`<p>本来源已有批准待办理，不能重复批准。</p><button type="button" data-hc-open="${escape(source.pendingCorrectionId)}">打开待办理更正</button>`:`<form data-hc-approval><label>明确目标总认定工时<input name="hc_amount" type="number" min="0" max="10000" step="0.1" value="${escape(amount)}" required placeholder="可明确填写0作全额冲销"></label><p>核算角色更正不改变原施工记录，也不能增加或删除原参与人。</p>${people.map((person,index)=>`<fieldset><legend>${escape(person.name||person.personId)}</legend><p>原认定角色：${escape((source.originalParticipants||source.participants).filter(item=>item.personId===person.personId).map(item=>item.role).join('、'))}</p>${(source.decision.category==='拖机'?['主做']:roleOrder).map(role=>`<label class="hc-check"><input type="checkbox" name="hc_role_${index}_${roleOrder.indexOf(role)}" ${participants.some(item=>item.personId===person.personId&&item.role===role)?'checked':''}>${role}</label>`).join('')}</fieldset>`).join('')}<label>角色差异核实依据<textarea name="hc_role_reason" maxlength="2000" rows="2">${escape(roleReason)}</textarea></label><label class="hc-check"><input type="checkbox" name="hc_verified" ${verified?'checked':''} required>已核实原参与人员及本次核算角色</label><button type="button" data-hc-preview>只读预览差额</button>
 ${preview?`<section class="hc-card" data-hc-preview-result><h4>只读预览，尚未批准或入账</h4>${summary(preview.plan,escape)}<p>原账期：${escape(periods[preview.period.state]||preview.period.state)}。${preview.period.state==='OPEN'?'批准后将按本月状态核验并入账。':'批准只保留认定，待账期条件具备后办理。'}</p><div class="hc-changes">${preview.plan.deltas.map(item=>`<p>${escape(item.userName||item.personId)} · ${escape(item.role)}：${escape(hours(item.beforeHours))} → ${escape(hours(item.targetHours))} 小时，差额 ${escape(signed(item.hours))} 小时</p>`).join('')}</div><details><summary>冻结分配依据</summary><p>${escape(preview.policy.strategy==='EQUAL'?'按有效参与人均分':'角色组合分配')} · 版本 ${escape(preview.policy.version)}</p>${Object.entries(preview.policy.ratios||{}).map(([role,value])=>`<p>${escape(role)}：${escape(value===null?'缺失':Number(value)*100+'%')}</p>`).join('')}</details></section>`:'<p>需先核实人员并预览。改变目标金额或核算角色后须重新预览。</p>'}
 <label>更正批准依据<textarea name="hc_reason" maxlength="4000" rows="3" required>${escape(reason)}</textarea></label><button type="submit" ${preview?'':'disabled'}>批准更正并按账期办理</button></form>`}</article>`:''}
 ${record?`<article class="hc-card"><h4>${escape(record.context?.title||'工时更正')} · 第${escape(record.number)}次</h4><p>${safeContext(record.context,escape)}</p><p><strong>${escape(states[record.state]||record.state)}</strong></p>${summary(record,escape)}<p>原作业／统计月份 ${escape(record.workMonth)} · 办理账期 ${escape(record.handlingMonth||'尚未办理')}</p><p>原账期当前${escape(periods[record.sourcePeriod.state]||record.sourcePeriod.state)}</p>${record.reason?`<p>批准依据：${escape(record.reason)}</p>`:''}<button type="button" data-hc-refresh>重新读取事项</button>${record.capabilities?.retry?'<button type="button" data-hc-retry>核验并重试入账</button>':''}${record.capabilities?.newCorrection?`<button type="button" data-hc-source="${escape(record.subtaskId)}">再次更正此来源</button>`:''}
 ${record.capabilities?.authorizePeriod?`<form data-hc-period><h4>原账期负责人授权</h4><label>另一开放的办理账期<input name="hc_target_month" type="month" min="1900-01" value="${escape(targetMonth)}" required></label><button type="button" data-hc-target>核对办理账期</button><p data-hc-target-state>${target?`已核对 ${escape(target.month)}：${escape(periods[target.state]||target.state)}`:'请先明确选择并核对另一开放月份。'}</p><label>跨期办理依据<textarea name="hc_period_reason" maxlength="2000" rows="3" required>${escape(periodReason)}</textarea></label><button type="submit">授权并办理已批准差额</button></form>`:record.state==='APPROVED_PENDING_PERIOD'?`<p>${record.authorizationValid?'已有有效账期授权，等待批准人核验重试。':record.sourcePeriod.state==='UNKNOWN'?'原账期尚未确认，批准已保留，未计入工时。':record.sourcePeriod.state==='CLOSED'?'等待原月份指定负责人授权另一开放账期。':'原账期已开放，可由更正批准人核验重试。'}</p>`:''}
 ${Array.isArray(record.deltas)?`<details><summary>已入账差额明细（${record.deltas.length}条）</summary>${record.deltas.map(item=>`<p>${escape(item.user_name)} · ${escape(item.role)} · ${escape(signed(item.hours))} 小时</p>`).join('')||'<p>尚无已入账差额。</p>'}</details>`:''}<details><summary>批准与账期记录</summary><p>批准人 ${escape(record.approvedBy)} · ${escape(record.createdAt)}</p>${record.authorizations.map(item=>`<p>${escape(item.actorId)} · 办理期 ${escape(item.targetMonth)} · ${escape(item.createdAt)}<br>${escape(item.reason)}</p>`).join('')||'<p>暂无跨期授权记录。</p>'}<p>事项编号 ${escape(record.id)} · 原工作编号 ${escape(record.subtaskId)}</p></details></article>`:''}
 </fieldset></section>`;
}
export function createCorrectionWorkbench({root,api,escapeHtml}){
 const state={caps:{},items:[],sources:[],nextCursor:null,sourceCursor:null,sourceSearch:'',filter:'APPROVED_PENDING_PERIOD',source:null,record:null,preview:null,amount:'',reason:'',roleReason:'',participants:[],verified:false,targetMonth:'',target:null,periodReason:'',busy:false,message:'正在读取办理权限…'};
 let disposed=false,dirty=false,pending=null,loadedSearch='',loadedFilter='APPROVED_PENDING_PERIOD';
 const render=()=>{if(!disposed)root.innerHTML=renderCorrectionWorkbench(state,escapeHtml);};
 const status=message=>{state.message=message;const node=root.querySelector('[data-hc-status]');if(node)node.textContent=message;};
 const discard=()=>!dirty||globalThis.confirm('此操作会放弃尚未提交的更正内容，是否继续？');
 const reset=()=>{state.preview=null;state.amount='';state.reason='';state.roleReason='';state.participants=[];state.verified=false;state.targetMonth='';state.target=null;state.periodReason='';dirty=false;pending=null;};
 const validRecord=value=>value&&typeof value.id==='string'&&Object.hasOwn(states,value.state)&&value.sourcePeriod&&Array.isArray(value.authorizations);
 const setSource=value=>{if(!value||typeof value.subtaskId!=='string'||!value.decision||!Array.isArray(value.participants)||!Array.isArray(value.people))throw Error('来源回执不完整，请重新读取');reset();state.record=null;state.source=value;state.participants=value.participants.map(person=>({...person}));state.roleReason=value.roleVerificationReason||'';};
 const updateRecord=value=>{if(!validRecord(value))throw Error('办理回执不完整，请按原内容重试');reset();state.source=null;state.record=value;state.items=state.items.filter(item=>item.id!==value.id);if(!state.filter||state.filter===value.state)state.items.unshift({...value,title:value.context?.title,date:value.context?.date,aircraftNo:value.context?.aircraftNo});};
 const run=async job=>{if(disposed||state.busy)return;state.busy=true;render();try{await job();}catch(error){if(!disposed){if([401,403].includes(error.status)){state.source=null;state.record=null;state.items=[];state.sources=[];state.caps={};reset();state.message=`${error.message}；当前授权不能继续办理。`;}else state.message=`${error.message}；原输入及请求标识已保留。`;}}finally{if(!disposed){state.busy=false;render();}}};
 const request=(path,body)=>{const key=JSON.stringify({path,body});if(!pending||pending.key!==key)pending={key,clientId:globalThis.crypto.randomUUID()};return api(path,{method:'POST',body:{...body,clientId:pending.clientId}});};
 const inputBody=()=>({recognizedHours:state.amount,participants:state.participants.map(person=>({...person})),participantsVerified:state.verified,roleVerificationReason:state.roleReason});
 const valid=()=>{const amount=Number(state.amount),people=state.source?.people||[];
  if(!state.amount.trim()||!Number.isFinite(amount)||amount<0||amount>10000||Math.abs(amount*10-Math.round(amount*10))>1e-8||!state.verified||people.some(person=>!state.participants.some(item=>item.personId===person.personId))){status('请明确目标工时，并核实每名原参与人的核算角色。');return false;}
  if(pairs(state.participants)!==pairs(state.source.originalParticipants||state.source.participants)&&!state.roleReason.trim()){status('核算角色与原认定不同，请填写核实依据。');return false;}return true;
 };
 async function load(explicit=false){
  if(state.busy||disposed)return;if(dirty&&(!explicit||!discard())){status('未提交内容已保留。');return;}
  return run(async()=>{
   const caps=await api('/maintenance/nonroutine-correction-capabilities');if(disposed)return;state.caps={enabled:caps.enabled===true,approve:caps.approve===true,authorizePeriod:caps.authorizePeriod===true};
   if(!state.caps.enabled||!state.caps.approve&&!state.caps.authorizePeriod){state.source=null;state.record=null;state.items=[];state.sources=[];reset();state.message='当前账户或功能尚未开放更正办理。';return;}
   const responses=await Promise.allSettled([api('/maintenance/nonroutine-corrections?'+new URLSearchParams(state.filter?{state:state.filter}:{})),state.caps.approve?api('/maintenance/nonroutine-corrections/sources?'+new URLSearchParams({search:state.sourceSearch})):Promise.resolve({items:[],nextCursor:null})]);if(disposed)return;
   const denied=responses.find(item=>item.status==='rejected'&&[401,403].includes(item.reason?.status));if(denied)throw denied.reason;
   const messages=[];if(responses[0].status==='fulfilled'){state.items=responses[0].value.items;state.nextCursor=responses[0].value.nextCursor;loadedFilter=state.filter;}else messages.push(responses[0].reason.message);
   if(responses[1].status==='fulfilled'){state.sources=responses[1].value.items;state.sourceCursor=responses[1].value.nextCursor;loadedSearch=state.sourceSearch;}else messages.push(responses[1].reason.message);
   if(explicit&&!messages.length){state.source=null;state.record=null;reset();}
   else if(state.record){const value=await api(`/maintenance/nonroutine-corrections/${encodeURIComponent(state.record.id)}`);if(disposed)return;if(!validRecord(value.correction))throw Error('事项回执不完整');state.record=value.correction;}
   state.message=messages.length?messages.join('；')+'；已读取部分保留。':'已读取当前有权办理的事项。';
  });
 }
 async function openSource(id){if(!state.caps.approve||!discard())return;return run(async()=>{const result=await api(`/maintenance/nonroutine-corrections/sources/${encodeURIComponent(id)}`);if(disposed)return;setSource(result.source);state.message='来源及当前净额已读取；目标金额请明确填写。';});}
 async function openRecord(id){if(!discard())return;return run(async()=>{const result=await api(`/maintenance/nonroutine-corrections/${encodeURIComponent(id)}`);if(disposed)return;updateRecord(result.correction);state.message='已读取当前事项及账期状态。';});}
 const click=async event=>{
  const button=event.target.closest('button');if(!button||state.busy||disposed)return;
  if(button.hasAttribute('data-hc-query')||button.hasAttribute('data-hc-query-sources'))return load(true);
  if(button.hasAttribute('data-hc-source'))return openSource(button.dataset.hcSource);
  if(button.hasAttribute('data-hc-open'))return openRecord(button.dataset.hcOpen);
  if(button.hasAttribute('data-hc-refresh'))return state.record&&openRecord(state.record.id);
  if(button.hasAttribute('data-hc-more')||button.hasAttribute('data-hc-more-sources')){
   const sources=button.hasAttribute('data-hc-more-sources');if(dirty){status('请先完成或放弃未提交内容，再加载更多。');return;}
   if(sources?loadedSearch!==state.sourceSearch:loadedFilter!==state.filter){status('查询条件已改变，请先查询当前条件。');return;}
   const cursor=sources?state.sourceCursor:state.nextCursor;if(!cursor)return;
   return run(async()=>{const result=await api(sources?'/maintenance/nonroutine-corrections/sources?'+new URLSearchParams({search:state.sourceSearch,cursor}):'/maintenance/nonroutine-corrections?'+new URLSearchParams({...(state.filter?{state:state.filter}:{}),cursor}));if(disposed)return;
    if(sources){state.sources=[...new Map([...state.sources,...result.items].map(item=>[item.subtaskId,item])).values()];state.sourceCursor=result.nextCursor;}else{state.items=[...new Map([...state.items,...result.items].map(item=>[item.id,item])).values()];state.nextCursor=result.nextCursor;}});
  }
  if(button.hasAttribute('data-hc-preview')&&state.source&&valid())return run(async()=>{
   const result=await api(`/maintenance/nonroutine-corrections/sources/${encodeURIComponent(state.source.subtaskId)}/preview`,{method:'POST',body:inputBody()});if(disposed)return;
   if(result.preview?.readOnly!==true||!result.preview.token||!result.preview.policy||!result.preview.period||!Number.isInteger(result.preview.number)||!Array.isArray(result.preview.plan?.deltas))throw Error('预览回执不完整，请重新读取');state.preview=result.preview;state.source.currentHours=result.preview.plan.beforeHours;state.source.number=result.preview.number;state.message='只读差额已预览，尚未批准或入账。';
  });
  if(button.hasAttribute('data-hc-target')&&state.record?.capabilities?.authorizePeriod){
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(state.targetMonth)||state.targetMonth===state.record.workMonth){status('请选择另一办理月份。');return;}
   return run(async()=>{const result=await api(`/maintenance/nonroutine-corrections/${encodeURIComponent(state.record.id)}/target-period?`+new URLSearchParams({month:state.targetMonth}));if(disposed)return;state.target=result.target;state.message=result.target.state==='OPEN'?'办理账期已核对开放，授权时仍将重新核验。':'该账期尚未开放，不能授权办理。';});
  }
  if(button.hasAttribute('data-hc-retry')&&state.record?.capabilities?.retry)return run(async()=>{const result=await api(`/maintenance/nonroutine-corrections/${encodeURIComponent(state.record.id)}/retry`,{method:'POST',body:{}});if(disposed)return;updateRecord(result.correction);state.message=result.correction.state==='POSTED'?'差额已入账。':'批准已保留，账期条件尚未具备，未新增工时。';});
 };
 const input=event=>{
  if(state.busy||disposed)return;const field=event.target;
  if(field.name==='hc_search'){state.sourceSearch=field.value;return;}if(field.name==='hc_filter'){state.filter=field.value;return;}
  const key={hc_amount:'amount',hc_reason:'reason',hc_role_reason:'roleReason',hc_target_month:'targetMonth',hc_period_reason:'periodReason',hc_verified:'verified'}[field.name];
  const role=String(field.name||'').match(/^hc_role_(\d+)_(\d+)$/);
  if(role&&state.source){const person=state.source.people[Number(role[1])],name=roleOrder[Number(role[2])];if(!person||!name)return;if(state.participants.some(item=>item.personId===person.personId&&item.role===name)===field.checked)return;state.participants=state.participants.filter(item=>item.personId!==person.personId||item.role!==name);if(field.checked)state.participants.push({personId:person.personId,role:name});state.preview=null;state.verified=false;dirty=true;status('核算角色已改变，请重新核实并预览。');render();return;}
  if(!key)return;const value=key==='verified'?field.checked:field.value;if(state[key]===value)return;state[key]=value;dirty=true;
  if(['amount','roleReason','verified'].includes(key)){state.preview=null;const node=root.querySelector('[data-hc-preview-result]');if(node)node.remove();const submit=root.querySelector('[data-hc-approval] button[type=submit]');if(submit)submit.disabled=true;status('输入已改变，请重新预览后批准。');}
  if(key==='targetMonth'){state.target=null;const node=root.querySelector('[data-hc-target-state]');if(node)node.textContent='办理月份已改变，请重新核对。';}
 };
 const submit=async event=>{
  if(state.busy||disposed)return;
  if(event.target.matches('[data-hc-approval]')){
   event.preventDefault();if(!state.caps.approve||!state.source||!valid()||!state.preview)return;
   if(!state.reason.trim()){status('请填写本次更正批准依据。');return;}
   return run(async()=>{const result=await request(`/maintenance/nonroutine-corrections/sources/${encodeURIComponent(state.source.subtaskId)}/approve`,{...inputBody(),reason:state.reason,expectedToken:state.preview.token,expectedNumber:state.preview.number});if(disposed)return;if(!result.correction?.id)throw Error('批准回执不完整，请按原内容重试');updateRecord(result.correction);state.message=result.correction.state==='POSTED'?'更正已批准，差额已入账，原记录保留。':'更正已批准，等待账期办理，尚未计入工时。';});
  }
  if(event.target.matches('[data-hc-period]')){
   event.preventDefault();const record=state.record,target=state.target;if(!record?.capabilities?.authorizePeriod)return;
   if(!target||target.month!==state.targetMonth||target.state!=='OPEN'||target.month===record.workMonth||!state.periodReason.trim()){status('须先核对另一开放账期，并填写办理依据。');return;}
   return run(async()=>{const result=await request(`/maintenance/nonroutine-corrections/${encodeURIComponent(record.id)}/authorize-period`,{sourceRevision:record.sourcePeriod.revision,targetRevision:target.revision,targetMonth:target.month,reason:state.periodReason});if(disposed)return;if(!result.correction?.id)throw Error('授权回执不完整，请按原内容重试');updateRecord(result.correction);state.message=result.correction.state==='POSTED'?'账期已授权，已批准差额已入账。':'授权已记录，条件仍待核验，尚未新增工时。';});
  }
 };
 const unload=event=>{if(dirty||state.busy){event.preventDefault();event.returnValue='';}};
 root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',input);root.addEventListener('submit',submit);globalThis.addEventListener('beforeunload',unload);render();load();
 return {refresh:()=>load(false),hasUnsaved:()=>dirty,isBusy:()=>state.busy,destroy(){disposed=true;root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',input);root.removeEventListener('submit',submit);globalThis.removeEventListener('beforeunload',unload);}};
}
