const labels={roleRatio:'旧角色比例',routineRatio:'例行比例',nonroutineCombinationRatio:'非例行角色组合比例',nonroutineCategoryHours:'拖机旧金额'};
const show=value=>value===null||value===undefined?'未设置':String(value);
export function renderRuleHistory({items=[],nextCursor=null,busy=false,message='',loaded=false},escape){
 return `<p>只记录实际观察到的配置变更，未记录的旧历史不补填。机型组沿用原独立版本。查看历史不会改动正在编辑的规则。</p><p role="status">${escape(message)}</p><button class="btn secondary" type="button" data-rule-history-query ${busy?'disabled':''}>${loaded?'刷新历史':'读取历史'}</button>
 ${items.map(item=>`<article><h4>变更版本 ${escape(item.revision)} · ${escape(item.createdAt)}</h4><p>操作账户 ${escape(item.actorId)} · ${escape(item.reason||'未填写原因')}</p>${item.continuity==='FIRST_OBSERVATION'?'<p>从此次实际变更开始留痕，此前历史未知。</p>':item.continuity==='UNJOURNALED_GAP'?'<p>此次变更前的配置与上一条记录不一致，中间变化未补造。</p>':''}${item.writeMode==='LEGACY_UNVERSIONED'?'<p>由未携带版本的旧接口请求保存。</p>':''}<ul>${item.changes.map(change=>`<li>${escape(labels[change.ruleType]||change.ruleType)} · ${escape(change.name)}：${escape(show(change.beforeValue))} → ${escape(show(change.value))}</li>`).join('')}</ul></article>`).join('')}
 ${loaded&&!items.length?'<p>尚无已记录的配置变更。</p>':''}${nextCursor?`<button class="btn secondary" type="button" data-rule-history-more ${busy?'disabled':''}>更多历史</button>`:''}`;
}
export function createRuleHistoryView({root,api,escapeHtml,accountId,currentAccount}){
 const state={items:[],nextCursor:null,busy:false,message:'',loaded:false};let disposed=false;
 const valid=()=>!disposed&&root.isConnected&&currentAccount()===accountId;
 const render=()=>{if(valid())root.innerHTML=renderRuleHistory(state,escapeHtml);};
 async function read(more=false){
  if(!valid()||state.busy||more&&!state.nextCursor)return;const cursor=more?state.nextCursor:null;state.busy=true;render();
  try{const result=await api(`/maintenance/rules/history${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`);if(!valid())return;state.items=more?[...state.items,...result.items]:result.items;state.nextCursor=result.nextCursor;state.loaded=true;state.message=result.version.hasUnjournaledChanges?'当前配置与最近记录不同，请重新加载规则后核对。':'历史已读取，当前编辑值保持不变。';}
  catch(error){if(!valid())return;if([401,403].includes(error.status)){state.items=[];state.nextCursor=null;state.loaded=false;}state.message=error.message;}
  finally{state.busy=false;render();}
 }
 const click=event=>{const button=event.target.closest('button');if(button?.hasAttribute('data-rule-history-query'))return read();if(button?.hasAttribute('data-rule-history-more'))return read(true);};
 root.addEventListener('click',click);render();return {destroy(){disposed=true;root.removeEventListener('click',click);root.innerHTML='';}};
}
