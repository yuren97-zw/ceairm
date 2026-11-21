const labels={UNKNOWN:'未确认',OPEN:'开放',CLOSED:'已封账'};
export function renderPeriodWorkbench(state,escape){
  const {month='',result=null,candidates=[],search='',accountId='',assignReason='',confirmState='',confirmReason='',message='',busy=false,truncated=false}=state;
  const period=result?.period;
  return `<style>.mp-workbench input,.mp-workbench select,.mp-workbench textarea{font-size:16px;max-width:100%;box-sizing:border-box}.mp-workbench label{display:block;margin:10px 0}.mp-workbench textarea{width:100%}.mp-workbench p{overflow-wrap:anywhere}</style><section class="mp-workbench"><h3>工时账期管理</h3><p>账期由本月指定负责人确认。工时仍按原作业月份统计，跨期另记办理账期。指定或更换负责人后须重新确认，不会自动开放。</p><p role="status" data-mp-status>${escape(message)}</p><fieldset ${busy?'disabled':''}><label>账期月份<input type="month" name="periodMonth" value="${escape(month)}" min="1900-01" required></label><button type="button" data-mp-query>查询月份 / 刷新</button>
  ${period?`<article><h4>${escape(period.month)} · ${escape(labels[period.state]||period.state)}</h4><p>负责人账户：${escape(period.responsible_account_id||'未指定')} · 版本 ${escape(period.revision)}</p><p>确认时间：${escape(period.confirmed_at||'尚未确认')}</p></article>
  ${result.capabilities?.assign?`<form data-mp-assign><h4>指定／更换本月负责人</h4><label>查找有资格人员<input name="periodSearch" value="${escape(search)}" placeholder="姓名 / 工号 / 账户标识" maxlength="100"></label><button type="button" data-mp-candidates>查询候选</button>${truncated?'<p>候选超过100项，请缩小搜索范围。</p>':''}<label>负责人<select name="periodAccount" required><option value="">请明确选择</option>${candidates.map(person=>`<option value="${escape(person.accountId)}" ${accountId===person.accountId?'selected':''}>${escape(person.name)} · ${escape(person.employeeNo)} · ${escape(person.accountId)}</option>`).join('')}</select></label><label>指定／交接依据<textarea name="periodAssignReason" maxlength="2000" required>${escape(assignReason)}</textarea></label><button type="submit">保存负责人安排</button></form>`:''}
  ${result.capabilities?.confirm?`<form data-mp-confirm><h4>确认本月状态</h4><label>账期状态<select name="periodConfirmState" required><option value="">请明确选择</option><option value="OPEN" ${confirmState==='OPEN'?'selected':''}>开放</option><option value="CLOSED" ${confirmState==='CLOSED'?'selected':''}>封账</option></select></label><label>确认依据<textarea name="periodConfirmReason" maxlength="2000" required>${escape(confirmReason)}</textarea></label><button type="submit">确认账期状态</button></form>`:'<p>仅本月当前有效的指定负责人可确认开放或封账。</p>'}
  ${!result.capabilities?.confirm&&confirmReason?`<p>尚未保存的状态确认依据已保留，当前无确认权限：${escape(confirmReason)}</p>`:''}
  <details><summary>账期操作历史（${result.history.length}条）</summary>${result.history.map(item=>`<article><p>版本 ${escape(item.revision)} · ${item.action==='ASSIGNED'?'负责人安排':'状态确认'} · ${escape(item.actorId)} · ${escape(item.createdAt)}</p><p>${escape(item.reason)}</p><p>${escape(labels[item.snapshot.before.state]||item.snapshot.before.state)} → ${escape(labels[item.snapshot.after.state]||item.snapshot.after.state)} · 负责人 ${escape(item.snapshot.after.responsible_account_id)}</p></article>`).join('')||'<p>暂无记录。</p>'}</details>`:'<p>请先选择月份并查询。</p>'}</fieldset></section>`;
}
export function createPeriodWorkbench({root,api,escapeHtml}){
  const state={month:'',result:null,candidates:[],search:'',accountId:'',assignReason:'',confirmState:'',confirmReason:'',message:'',busy:false,truncated:false};
  let disposed=false,dirty=false;
  const render=()=>{if(!disposed)root.innerHTML=renderPeriodWorkbench(state,escapeHtml);};
  const status=message=>{state.message=message;const node=root.querySelector('[data-mp-status]');if(node)node.textContent=message;};
  const reset=()=>{state.accountId='';state.assignReason='';state.confirmState='';state.confirmReason='';state.candidates=[];state.search='';state.truncated=false;dirty=false;};
  async function query(explicit=false){
    if(disposed||state.busy)return;
    if(dirty&&(!explicit||!globalThis.confirm('查询会放弃尚未保存的账期安排或确认依据，是否继续？'))){status('当前未保存内容已保留。');return;}
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(state.month)||Number(state.month.slice(0,4))<1900){status('请先选择有效账期月份。');return;}
    state.busy=true;render();try{const result=await api(`/maintenance/hour-periods/${encodeURIComponent(state.month)}`);if(disposed)return;state.result=result;reset();state.message='已读取本月状态，尚未执行任何修改。';}
    catch(error){state.message=`${error.message}；原记录及未保存内容已保留。`;}finally{state.busy=false;render();}
  }
  const click=async event=>{
    const button=event.target.closest('button');if(!button||state.busy)return;
    if(button.hasAttribute('data-mp-query'))return query(true);
    if(button.hasAttribute('data-mp-candidates')&&state.result?.capabilities?.assign){
      state.busy=true;render();try{const result=await api(`/maintenance/hour-period-responsible-candidates?search=${encodeURIComponent(state.search)}`);if(disposed)return;
        state.candidates=[...new Map([...state.candidates.filter(person=>person.accountId===state.accountId),...result.items].map(person=>[person.accountId,person])).values()];state.truncated=result.truncated;state.message='请选择有资格的负责人，不会自动指定。';
      }catch(error){state.message=error.message;}finally{state.busy=false;render();}
    }
  };
  const fields={periodMonth:'month',periodSearch:'search',periodAccount:'accountId',periodAssignReason:'assignReason',periodConfirmState:'confirmState',periodConfirmReason:'confirmReason'};
  const input=event=>{const key=fields[event.target.name];if(key&&!state.busy){state[key]=event.target.value;if(!['month','search'].includes(key))dirty=true;}};
  const submit=async event=>{
    const assigning=event.target.matches('[data-mp-assign]'),confirming=event.target.matches('[data-mp-confirm]');if(!assigning&&!confirming)return;event.preventDefault();
    if(state.busy||!state.result)return;
    if(state.month!==state.result.period.month){status('月份已改变，请先查询该月份再操作。');return;}
    if(!state.result.capabilities?.[assigning?'assign':'confirm'])return;
    const reason=assigning?state.assignReason:state.confirmReason;
    if(!reason.trim() || (assigning?!state.accountId:!['OPEN','CLOSED'].includes(state.confirmState))){status('请明确选择负责人或状态，并填写操作依据。');return;}
    const body={revision:Number(state.result.period.revision),reason,...(assigning?{accountId:state.accountId}:{state:state.confirmState})};
    state.busy=true;render();try{const result=await api(`/maintenance/hour-periods/${encodeURIComponent(state.result.period.month)}/${assigning?'assign':'confirm'}`,{method:'POST',body});if(disposed)return;state.result=result;
      if(assigning){state.accountId='';state.assignReason='';state.candidates=[];}else{state.confirmState='';state.confirmReason='';}
      dirty=Boolean(state.accountId||state.assignReason||state.confirmState||state.confirmReason);state.message=assigning?'负责人安排已保存，本月状态须由该负责人重新确认。':'账期状态已记录；未直接修改任何工时。';}
    catch(error){state.message=`${error.message}；输入已保留。版本冲突时请先查询当前状态。`;}finally{state.busy=false;render();}
  };
  const unload=event=>{if(dirty){event.preventDefault();event.returnValue='';}};
  root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',input);root.addEventListener('submit',submit);globalThis.addEventListener('beforeunload',unload);render();
  return {refresh:()=>query(false),hasUnsaved:()=>dirty,isBusy:()=>state.busy,destroy(){disposed=true;root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',input);root.removeEventListener('submit',submit);globalThis.removeEventListener('beforeunload',unload);}};
}
