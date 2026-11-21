const states={CANCELLED:'原审核已取消',PENDING_AUTHORIZATION:'待跨期授权',AUTHORIZED:'已授权，待核验入账',COMPLETED:'已完成',RESOLVED_SOURCE_REOPENED:'原账期重开后已入账'};
const periods={UNKNOWN:'未确认',OPEN:'开放',CLOSED:'已封账'};
export function renderCrossPeriodWorkbench(state,escape){
  const {month='',items=[],nextCursor=null,result=null,targetMonth='',target=null,reason='',message='',busy=false}=state;
  const task=result?.task;
  return `<section class="mp-workbench"><h3>封账跨期任务</h3><p>跨期授权仅确定办理账期，工时仍统计在原作业月份。授权成功不等于已入账；后续由原审核通道核验并处理。</p><p role="status" data-cp-status>${escape(message)}</p><fieldset ${busy?'disabled':''}><label>原作业月份<input name="crossMonth" type="month" value="${escape(month)}" min="1900-01"></label><button type="button" data-cp-query>查询 / 刷新任务</button>${items.map(item=>`<p><button type="button" data-cp-open="${escape(item.id)}">${escape(item.title)} · ${escape(states[item.state]||item.state)}</button></p>`).join('')}${nextCursor?'<button type="button" data-cp-more>更多任务</button>':''}
  ${task?`<article><h4>${escape(states[task.state]||task.state)}</h4><p>任务 ${escape(task.id)} · 事项 ${escape(task.case_id)} · 认定版本 ${escape(task.approved_revision)}</p><p>原作业／统计月份 ${escape(task.source_month)} · 已授权办理账期 ${escape(task.target_month||'尚未指定')}</p><p>原账期当前状态：${escape(periods[result.sourcePeriod.state])} · 版本 ${escape(result.sourcePeriod.revision)}</p><button type="button" data-cp-refresh>重新读取本任务</button>
    ${task.state==='CANCELLED'?'<p>原审核及一次性通道已取消关闭，不能继续授权或入账。以下保留取消前的办理与授权历史。</p>':result.capabilities?.authorize?`<form data-cp-authorize><h4>原账期负责人授权</h4><label>办理账期<input name="crossTargetMonth" type="month" min="1900-01" value="${escape(targetMonth)}" required></label><button type="button" data-cp-target>核对办理账期</button>${target?`<p data-cp-target-state>已核对 ${escape(target.period.month)}：${escape(periods[target.period.state])} · 版本 ${escape(target.period.revision)}</p>`:'<p data-cp-target-state>须先核对明确选择的开放账期。</p>'}<label>跨期授权依据<textarea name="crossReason" maxlength="2000" required>${escape(reason)}</textarea></label><button type="submit">保存跨期授权</button></form>`:result.authorization?.ok?'<p>已有有效授权，不能重复覆盖。等待原审核通道核验入账。</p>':'<p>当前账户、账期或任务状态不允许授权。仅原账期当前指定且具备跨期权限的有效负责人可以办理。</p>'}
    <details><summary>跨期历史（${result.history.length}条）</summary>${result.history.map(item=>`<article><p>版本 ${escape(item.revision)} · ${escape(item.actorId)} · ${escape(item.createdAt)}</p><p>${escape(item.reason)}</p><p>原作业月份 ${escape(item.authorization.sourcePeriod?.month||item.authorization.workMonth||task.source_month)} · 办理账期 ${escape(item.authorization.targetPeriod?.month||item.authorization.handlingMonth||'—')}</p></article>`).join('')||'<p>暂无历史。</p>'}</details></article>`:'<p>选择任务查看详情。</p>'}</fieldset></section>`;
}
export function createCrossPeriodWorkbench({root,api,escapeHtml}){
  const state={month:'',items:[],nextCursor:null,result:null,targetMonth:'',target:null,reason:'',message:'',busy:false};let disposed=false,dirty=false,loadedMonth='';
  const render=()=>{if(!disposed)root.innerHTML=renderCrossPeriodWorkbench(state,escapeHtml);};
  const status=message=>{state.message=message;const node=root.querySelector('[data-cp-status]');if(node)node.textContent=message;};
  const reset=()=>{state.targetMonth='';state.target=null;state.reason='';dirty=false;};
  const discard=()=>!dirty||globalThis.confirm('此操作会放弃尚未保存的跨期授权内容，是否继续？');
  async function list(more=false,explicit=false){
    if(disposed||state.busy)return;if(dirty&&(!explicit||!discard())){status('未保存的跨期授权内容已保留。');return;}
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(state.month)||Number(state.month.slice(0,4))<1900){status('请先选择有效原作业月份。');return;}
    if(more&&loadedMonth!==state.month){status('月份已改变，请先查询该月份。');return;}
    state.busy=true;render();try{const result=await api(`/maintenance/cross-period-tasks?month=${encodeURIComponent(state.month)}${more?`&cursor=${encodeURIComponent(state.nextCursor)}`:''}`);if(disposed)return;
      state.items=more?[...state.items,...result.items]:result.items;state.nextCursor=result.nextCursor;loadedMonth=state.month;if(!more){state.result=null;reset();}state.message=state.items.length?'任务已读取。':'该月份暂无跨期任务。';
    }catch(error){state.message=`${error.message}；原页面和输入已保留。`;}finally{state.busy=false;render();}
  }
  const click=async event=>{
    const button=event.target.closest('button');if(!button||state.busy)return;
    if(button.hasAttribute('data-cp-query'))return list(false,true);
    if(button.hasAttribute('data-cp-more'))return list(true,false);
    const open=button.hasAttribute('data-cp-open'),refresh=button.hasAttribute('data-cp-refresh');
    if(open||refresh){
      if(!discard())return;const id=open?button.dataset.cpOpen:state.result?.task.id;if(!id)return;
      state.busy=true;render();try{const result=await api(`/maintenance/cross-period-tasks/${encodeURIComponent(id)}`);if(disposed)return;state.result=result;reset();state.message='已读取当前任务及原账期版本。';}catch(error){state.message=`${error.message}；原内容已保留。`;}finally{state.busy=false;render();}return;
    }
    if(button.hasAttribute('data-cp-target')&&state.result?.capabilities?.authorize){
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(state.targetMonth)){status('请明确选择办理账期。');return;}
      state.busy=true;render();try{const target=await api(`/maintenance/hour-periods/${encodeURIComponent(state.targetMonth)}`);if(disposed)return;state.target=target;state.message=target.period.state==='OPEN'?'办理账期当前开放，保存时仍会重新核验版本。':'该办理账期尚未开放，不能授权。';}catch(error){state.target=null;state.message=error.message;}finally{state.busy=false;render();}
    }
  };
  const input=event=>{if(state.busy)return;const field=event.target;if(field.name==='crossMonth')state.month=field.value;
    if(field.name==='crossTargetMonth'){state.targetMonth=field.value;state.target=null;dirty=true;const targetNode=root.querySelector('[data-cp-target-state]');if(targetNode)targetNode.textContent='办理账期已改变，原核对结果失效。';const node=root.querySelector('[data-cp-status]');if(node)node.textContent='办理账期已改变，请重新核对。';}
    if(field.name==='crossReason'){state.reason=field.value;dirty=true;}
  };
  const submit=async event=>{
    if(!event.target.matches('[data-cp-authorize]'))return;event.preventDefault();if(state.busy||!state.result?.capabilities?.authorize)return;
    const task=state.result.task,source=state.result.sourcePeriod,target=state.target?.period;
    if(state.month!==task.source_month){status('原作业月份已改变，请先查询该月份再操作。');return;}
    if(!target||target.month!==state.targetMonth||target.state!=='OPEN'||target.month===task.source_month||!state.reason.trim()){status('须核对另一个开放的办理账期，并填写授权依据。');return;}
    state.busy=true;render();try{const result=await api(`/maintenance/cross-period-tasks/${encodeURIComponent(task.id)}/authorize`,{method:'POST',body:{revision:Number(task.revision),sourceRevision:Number(source.revision),targetRevision:Number(target.revision),targetMonth:target.month,reason:state.reason}});if(disposed)return;state.result=result;state.items=state.items.map(item=>item.id===task.id?{...item,state:result.task.state,revision:result.task.revision,target_month:result.task.target_month}:item);reset();state.message='跨期授权已记录，尚不能据此认定已入账。';}
    catch(error){state.message=`${error.message}；输入已保留。请核对任务及两个账期的最新版本后重试。`;}finally{state.busy=false;render();}
  };
  const unload=event=>{if(dirty){event.preventDefault();event.returnValue='';}};
  root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',input);root.addEventListener('submit',submit);globalThis.addEventListener('beforeunload',unload);render();
  return {refresh:()=>list(false,false),hasUnsaved:()=>dirty,isBusy:()=>state.busy,destroy(){disposed=true;root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',input);root.removeEventListener('submit',submit);globalThis.removeEventListener('beforeunload',unload);}};
}
