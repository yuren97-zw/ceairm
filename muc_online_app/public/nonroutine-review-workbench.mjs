import {initialFinalDraft,renderFinalizationSection,finalizationStatus,recognitionRolePeople} from './nonroutine-finalization-view.mjs?v=20261115-cancelled-history';
import {initialStandardFinalDraft,renderStandardSource,renderStandardFinalization,standardFinalizationStatus} from './maintenance-standard-finalization-view.mjs';
import {renderReviewNotifications} from './nonroutine-notification-view.mjs';
const states={PENDING_ACCEPTANCE:'待受理',IN_REVIEW:'评议中',SEALED:'待终审',FINALIZED:'已认定',CANCELLED:'已取消'};
const suggestionFields={category:'类别',chapter:'ATA',title:'工作名称',workScope:'内容及范围'};
const categories=['工卡指令','单项工作','拖机','三方附加','试车','其他','人工除冰','联合除冰'];
export function renderReviewWorkbench({items=[],review=null,accountId='',hours='',basis='',message='',history=[],historyCursor=null,nextCursor=null,candidates=[],finalizers=[],nominees=[],finalizer='',candidateSearch='',truncated=false,suggestionField='title',suggestionValue='',suggestionReason='',privacyAcknowledged=false,replacePersonId='',replacementAccountId='',replaceReason='',finalDraft=null,finalization=null,finalPreview=null,notifications=null,purpose='WORK',notificationsEnabled=purpose==='WORK',cancelReason='',cancelConfirmed=false,cancelRequest=null},escape){
  const own=review?.opinions?.find(item=>item.accountId===accountId);
  return `<style>.nr-review-grid>section,.nr-review-workbench fieldset{min-width:0}.nr-review-workbench{overflow-wrap:anywhere}.nr-review-grid{display:grid;grid-template-columns:minmax(180px,1fr) minmax(280px,2fr);gap:12px}.nr-review-card{padding:12px;border:1px solid var(--line-strong,#D7DDE5);border-radius:12px;margin:8px 0}.nr-review-workbench input,.nr-review-workbench select,.nr-review-workbench textarea{font-size:16px;max-width:100%;box-sizing:border-box}.nr-review-workbench textarea{width:100%}.nr-review-workbench label{display:block;margin:10px 0}.nr-review-workbench .nr-scope{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:680px){.nr-review-grid{grid-template-columns:1fr}}</style>
    <div class="nr-review-workbench"><div class="actions"><button type="button" data-nr-refresh>刷新事项</button><span data-nr-status role="status">${escape(message)}</span></div>
    ${purpose==='STANDARD'?'<h3>独立标准版本评议</h3>':''}${notificationsEnabled?renderReviewNotifications(notifications,escape):''}
    <div class="nr-review-grid"><section aria-label="评议事项">${items.map(item=>`<button class="nr-review-card" type="button" data-nr-open="${escape(item.id)}"><strong>${escape(item.title)}</strong><br>${escape(item.category)} · ATA ${escape(item.chapter)}<br>${escape(states[item.state]||item.state)} · ${escape(item.submittedCount)}/12</button>`).join('')||'<p>当前没有可访问的评议事项。</p>'}${nextCursor?'<button type="button" data-nr-more>加载更多</button>':''}</section>
    <section aria-label="事项详情">${review?`<article class="nr-review-card"><h3>${escape(review.application.title)}</h3><p>${escape(review.application.category)} · ATA ${escape(review.application.chapter)} · ${escape(states[review.state]||review.state)} · ${escape(review.submittedCount)}/12</p><p class="nr-scope">${escape(review.application.workScope)}</p><p>申请总工时 ${escape(review.application.requestedHours)} 小时，仅供参考</p></article>
      ${purpose==='STANDARD'?renderStandardSource(review,escape):review.sourceFacts?.changed?'<p role="status">原评议依据已变化或待核对。原提报快照仍保留，终审需核实变化后处理。</p>':''}
      ${purpose==='WORK'&&review.capabilities?.cancel?`<form data-nr-cancel><fieldset><legend>取消尚未入账的评议</legend><p>仅关闭本次评议及工时通道；原工作、报工、已提交意见和终审认定均保留。已有入账证据的事项须走更正审批。</p><label>取消原因<textarea name="cancelReason" maxlength="4000" required ${cancelRequest?'readonly':''}>${escape(cancelReason)}</textarea></label><label><input name="cancelConfirmed" type="checkbox" ${cancelConfirmed?'checked':''} ${cancelRequest?'disabled':''} required>已核对事项及关闭影响，确认取消本次评议</label><button type="submit">${cancelRequest?'重试原取消请求':'确认取消评议'}</button></fieldset></form>`:''}
      ${review.capabilities?.assign?`<form data-nr-accept><fieldset><legend>人工受理与指定人员</legend><p>请明确指定12名不同人员及终审负责人。${notificationsEnabled?'受理成功才开始计时和提醒。':'受理成功才开始计时；本页暂不提供站内提醒。'}</p><label>查找候选<input name="candidateSearch" value="${escape(candidateSearch)}" placeholder="姓名 / 工号 / 账户标识"></label><button type="button" data-nr-candidates>查询合资格人员</button>${truncated?'<p>候选超过100项，请输入姓名或工号缩小范围。</p>':''}<p data-nr-nominee-count>已选 ${nominees.length}/12 人</p><div style="max-height:280px;overflow:auto">${candidates.map(person=>`<label><input type="checkbox" name="nominee" value="${escape(person.accountId)}" ${nominees.includes(person.accountId)?'checked':''}> ${escape(person.name)} · ${escape(person.employeeNo)} · ${escape(person.accountId)}</label>`).join('')}</div><label>终审负责人<select name="finalizer" required><option value="">请明确选择</option>${finalizers.map(person=>`<option value="${escape(person.accountId)}" ${finalizer===person.accountId?'selected':''}>${escape(person.name)} · ${escape(person.employeeNo)} · ${escape(person.accountId)}</option>`).join('')}</select></label><button type="submit">受理并指定12人</button></fieldset></form>`:''}
      ${review.seats?.length?`<details><summary>指定人员及提交进度</summary>${review.seats.map(seat=>`<p>${escape(seat.personName||seat.personId)} · ${escape(seat.employeeNo||seat.accountId)} · ${seat.submitted?'已提交':'未提交'}</p>`).join('')}</details>`:''}
      ${review.capabilities?.replaceSeat?`<form data-nr-replace><fieldset><legend>人工替换未提交席位</legend><p>已提交意见的席位不能替换；原受理时间 ${escape(review.acceptedAt)} 保持不变。</p><label>原席位<select name="replacePersonId" required><option value="">请选择未提交席位</option>${(review.seats||[]).filter(seat=>!seat.submitted).map(seat=>`<option value="${escape(seat.personId)}" ${replacePersonId===seat.personId?'selected':''}>${escape(seat.personName||seat.personId)} · ${escape(seat.employeeNo||seat.accountId)}</option>`).join('')}</select></label><label>查找新人员<input name="candidateSearch" value="${escape(candidateSearch)}" placeholder="姓名 / 工号 / 账户标识"></label><button type="button" data-nr-candidates>查询合资格人员</button>${truncated?'<p>候选超过100项，请缩小搜索范围。</p>':''}<label>新人员<select name="replacementAccountId" required><option value="">请明确选择新人员</option>${candidates.filter(person=>!(review.seats||[]).some(seat=>seat.accountId===person.accountId || seat.personId!==replacePersonId && seat.personId===person.personId)).map(person=>`<option value="${escape(person.accountId)}" ${replacementAccountId===person.accountId?'selected':''}>${escape(person.name)} · ${escape(person.employeeNo)} · ${escape(person.accountId)}</option>`).join('')}</select></label><label>替换原因<textarea name="replaceReason" rows="2" maxlength="1000" required>${escape(replaceReason)}</textarea></label><button type="submit">保存席位替换</button></fieldset></form>`:''}
      ${purpose==='STANDARD'?renderStandardFinalization(review,finalDraft,finalization,escape):renderFinalizationSection(review,finalDraft,finalization,escape,finalPreview)}
      <form data-nr-opinion><fieldset ${review.capabilities?.submitOpinion?'':'disabled'}><legend>本人工时意见</legend><p>工时和评价依据仅本人及有权审议者可读。第12份意见提交后本轮封闭。</p><label>评议工时（小时）<input name="hours" type="number" min="0" max="10000" step="0.1" value="${escape(hours)}" required></label><label>评价依据<textarea name="basis" rows="4" maxlength="4000" required>${escape(basis)}</textarea></label><button type="submit">${own?'更新本人意见':'提交本人意见'}</button></fieldset></form>
      <button type="button" data-nr-history>查看本人修订历史</button>${history.map(item=>`<article class="nr-review-card">版本 ${escape(item.revision)} · ${escape(item.hours)} 小时<p class="nr-scope">${escape(item.basis)}</p></article>`).join('')}
      ${historyCursor?'<button type="button" data-nr-history-more>更早的本人修订</button>':''}
      <section><h4>共享字段建议</h4><p>${escape(review.suggestionNotice)}</p>${(review.suggestions||[]).map(item=>`<article class="nr-review-card">${escape(suggestionFields[item.field]||item.field)}：${escape(item.originalValue)} → ${escape(item.proposedValue)}<p>${escape(item.reason)}</p><small>建议人 ${escape(item.personId)} · ${escape(item.createdAt)}</small></article>`).join('')||'<p>暂无建议。</p>'}
      ${review.capabilities?.submitOpinion||suggestionValue||suggestionReason?`<form data-nr-suggestion><fieldset ${review.capabilities?.submitOpinion?'':'disabled'}><legend>新增共享建议</legend><p>建议只追加留痕，不修改原申请。请勿在此填写工时数值或工时评价依据。</p><label>建议字段<select name="suggestionField">${Object.entries(suggestionFields).map(([key,label])=>`<option value="${key}" ${key===suggestionField?'selected':''}>${label}</option>`).join('')}</select></label><label>建议值${suggestionField==='category'?`<select name="suggestionValue" required><option value="">请选择类别</option>${categories.map(category=>`<option value="${escape(category)}" ${category===suggestionValue?'selected':''}>${escape(category)}</option>`).join('')}</select>`:`<textarea name="suggestionValue" rows="3" maxlength="${suggestionField==='chapter'?200:suggestionField==='title'?500:4000}" required>${escape(suggestionValue)}</textarea>`}</label><label>非工时修改理由<textarea name="suggestionReason" rows="2" maxlength="1000" required>${escape(suggestionReason)}</textarea></label><label><input type="checkbox" name="privacyAcknowledged" ${privacyAcknowledged?'checked':''} required> 我确认未填写本人或他人的工时数值及评价依据</label><button type="submit">提交共享建议</button></fieldset></form>`:''}</section>`:'<p>选择事项查看详情。</p>'}</section></div></div>`;
}
export function createReviewWorkbench({root,api:request,escapeHtml,accountId,purpose='WORK',initialReviewId=null,notificationsEnabled=purpose==='WORK'}){
  if(!['WORK','STANDARD'].includes(purpose))throw new Error('评议类型无效');
  const api=async(path,options)=>{try{return await request(purpose==='STANDARD'?path.replace(/^\/maintenance\/nonroutine-reviews(?=\/|\?|$)/,'/maintenance/standard-reviews').replace(/^\/maintenance\/nonroutine-review-notifications(?=\/|$)/,'/maintenance/standard-review-notifications'):path,options);}catch(error){if([401,403,404].includes(error.status))clearDeniedAccess();throw error;}};
  const statusOf=purpose==='STANDARD'?standardFinalizationStatus:finalizationStatus;
  const state={purpose,notificationsEnabled,items:[],review:null,accountId,hours:'',basis:'',message:'正在加载…',history:[],historyCursor:null,nextCursor:null,candidates:[],finalizers:[],nominees:[],finalizer:'',candidateSearch:'',truncated:false,suggestionField:'title',suggestionValue:'',suggestionReason:'',privacyAcknowledged:false,replacePersonId:'',replacementAccountId:'',replaceReason:'',cancelReason:'',cancelConfirmed:false,cancelRequest:null};
  let dirty=false,busy=false,disposed=false,sequence=0,accessDenied=false,refreshQueued=false;
  let cancelDirty=false,opinionDirty=false,nominationDirty=false,suggestionDirty=false,finalDirty=false,pendingSuggestion=null;
  const syncDirty=()=>{dirty=cancelDirty||opinionDirty||nominationDirty||suggestionDirty||finalDirty;};
  const status=message=>{if(accessDenied)message='当前操作资格或范围已变化，事项内容已清除，未提交私有输入也已清除。请重新查询。';state.message=message;const node=root.querySelector('[data-nr-status]');if(node)node.textContent=message;};
  const render=()=>{if(accessDenied)state.message='当前操作资格或范围已变化，事项内容已清除，未提交私有输入也已清除。请重新查询。';if(!disposed)root.innerHTML=renderReviewWorkbench(state,escapeHtml);};
  function clearDeniedAccess(){
    accessDenied=true;refreshQueued=false;sequence++;initialReviewId=null;pendingSuggestion=null;
    Object.assign(state,{review:null,items:[],nextCursor:null,hours:'',basis:'',history:[],historyCursor:null,candidates:[],finalizers:[],nominees:[],finalizer:'',candidateSearch:'',cancelReason:'',cancelConfirmed:false,cancelRequest:null,finalDraft:null,finalization:null,finalPreview:null,finalPolicyToken:null,notifications:null,suggestionValue:'',suggestionReason:'',privacyAcknowledged:false,replacePersonId:'',replacementAccountId:'',replaceReason:''});
    opinionDirty=nominationDirty=suggestionDirty=finalDirty=cancelDirty=false;syncDirty();render();
  }
  function adopt(review,{preserveOpinion=false,preserveSuggestion=false,preserveNomination=false}={}){
    if(purpose==='STANDARD'&&review.purpose!=='STANDARD')throw new Error('评议来源类型不匹配');
    accessDenied=false;
    state.cancelReason='';state.cancelConfirmed=false;state.cancelRequest=null;cancelDirty=false;
    state.review=review;initialReviewId=null;state.items=state.items.map(item=>item.id===review.id?{...item,state:review.state,submittedCount:review.submittedCount}:item);
    if(!preserveOpinion){const own=review.opinions.find(item=>item.accountId===accountId);state.hours=own?.hours??'';state.basis=own?.basis||'';opinionDirty=false;}
    if(!preserveSuggestion){state.suggestionField='title';state.suggestionValue='';state.suggestionReason='';state.privacyAcknowledged=false;suggestionDirty=false;pendingSuggestion=null;}
    if(!preserveNomination){state.candidates=[];state.finalizers=[];state.nominees=[];state.finalizer='';state.candidateSearch='';state.truncated=false;state.replacePersonId='';state.replacementAccountId='';state.replaceReason='';nominationDirty=false;}
    state.history=[];state.historyCursor=null;syncDirty();
    state.finalDraft=review.capabilities?.finalize?(purpose==='STANDARD'?initialStandardFinalDraft(review):initialFinalDraft(review)):null;state.finalization=null;state.finalPreview=null;state.finalPolicyToken=null;finalDirty=false;syncDirty();
  }
  async function loadFinalization(){if(state.review?.capabilities?.finalizationView){const result=await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(state.review.id)}/finalization`);if(result.finalization?.canReadPrivate===false&&state.review?.capabilities?.readAllOpinions){clearDeniedAccess();return;}state.finalization=result.finalization;}}
  function finishBusy(){
    busy=false;
    if(refreshQueued&&!disposed&&!accessDenied){refreshQueued=false;queueMicrotask(()=>{if(!disposed)refresh();});}
  }
  async function refresh(more=false){
    if(disposed)return;
    if(busy){refreshQueued=true;return;}
    if(dirty){
      // Preserve draft/version facts, but do not let unsaved input prevent a
      // current access check when an automatic refresh arrives.
      if(!state.review){status('有未提交的内容，保留当前输入和选择；提交或明确刷新后再更新。');return;}
      const token=++sequence,id=state.review.id;busy=true;
      try{
        const {review}=await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(id)}`);
        if(disposed||token!==sequence)return;
        if(!review||review.id!==id)throw new Error('事项资格核对响应不完整');
        if(state.review.capabilities?.readAllOpinions&&!review.capabilities?.readAllOpinions){clearDeniedAccess();return;}
        status('已核对事项查看资格；有未提交的内容，保留当前输入和选择，提交或明确刷新后再更新。');
      }catch(error){if(!disposed)status(`资格核对失败：${error.message}；当前输入已保留。`);}finally{finishBusy();}
      return;
    }
    const token=++sequence;busy=true;
    try{const query=more&&state.nextCursor?`?cursor=${encodeURIComponent(state.nextCursor)}`:'';const result=await api(`/maintenance/nonroutine-reviews${query}`);if(disposed||token!==sequence)return;
      accessDenied=false;state.items=more?[...state.items,...result.items]:result.items;state.nextCursor=result.nextCursor;state.message='';
      if(state.review||initialReviewId){adopt((await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(state.review?.id||initialReviewId)}`)).review);render();await loadFinalization();}render();
    }catch(error){if(!disposed)status(error.message);}finally{finishBusy();}
  }
  const click=async event=>{
    const button=event.target.closest('button');if(!button||busy)return;
    if(notificationsEnabled&&button.hasAttribute('data-nr-notifications')){
      busy=true;try{const result=await api('/maintenance/nonroutine-review-notifications');if(!disposed){state.notifications=result.notifications;state.message='通知已按当前资格和进度更新。';render();}}catch(error){status(`通知查询失败：${error.message}；当前事项和输入已保留。`);}finally{finishBusy();}return;
    }
    if(notificationsEnabled&&(button.hasAttribute('data-nr-notification-read')||button.hasAttribute('data-nr-notification-open'))){
      const open=button.hasAttribute('data-nr-notification-open');const id=open?button.dataset.nrNotificationOpen:button.dataset.nrNotificationRead;
      const notice=state.notifications?.find(item=>item.id===id);if(!notice)return;
      if(open&&dirty&&!globalThis.confirm('切换到通知事项会放弃尚未提交的内容，是否继续？'))return;
      busy=true;try{
        if(open){const {review}=await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(notice.caseId)}`);if(disposed)return;adopt(review);state.message='正在核对终审状态…';render();await loadFinalization();}
        if(!notice.readAt){const result=await api(`/maintenance/nonroutine-review-notifications/${encodeURIComponent(id)}/read`,{method:'POST',body:{}});notice.readAt=result.readAt;}
        if(!disposed){state.message=open?'已打开通知事项。':'通知已标为已读；事项状态未改变。';render();}
      }catch(error){status(`${error.message}；可重新查询通知核对当前任务。`);}finally{finishBusy();}return;
    }
    if(button.hasAttribute('data-nr-refresh')){if(dirty&&!globalThis.confirm('刷新会放弃尚未提交的内容，是否继续？'))return;dirty=false;return refresh();}
    if(button.hasAttribute('data-nr-more'))return refresh(true);
    if(button.hasAttribute('data-nr-candidates')&&(state.review?.capabilities?.assign||state.review?.capabilities?.replaceSeat)){
      busy=true;try{const base=`/maintenance/nonroutine-reviews/${encodeURIComponent(state.review.id)}/candidates?search=${encodeURIComponent(state.candidateSearch)}`;
        const [members,owners]=await Promise.all([api(`${base}&role=opinion`),state.review.capabilities.assign?api(`${base}&role=finalize`):Promise.resolve({items:[],truncated:false})]);
        state.candidates=[...new Map([...state.candidates.filter(person=>state.nominees.includes(person.accountId)||person.accountId===state.replacementAccountId),...members.items].map(person=>[person.accountId,person])).values()];
        state.finalizers=[...new Map([...state.finalizers.filter(person=>person.accountId===state.finalizer),...owners.items].map(person=>[person.accountId,person])).values()];state.truncated=members.truncated||owners.truncated;render();
      }catch(error){status(error.message);}finally{finishBusy();}return;
    }
    if(button.hasAttribute('data-nr-open')){
      if(dirty&&!globalThis.confirm('切换事项会放弃尚未提交的内容，是否继续？'))return;
      busy=true;try{const {review}=await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(button.dataset.nrOpen)}`);if(!disposed){adopt(review);state.message='正在核对终审状态…';render();await loadFinalization();state.message='';render();}}catch(error){status(error.message);}finally{finishBusy();}
    }
    if((button.hasAttribute('data-nr-history')||button.hasAttribute('data-nr-history-more'))&&state.review){busy=true;try{const more=button.hasAttribute('data-nr-history-more');const suffix=more&&state.historyCursor?`?beforeRevision=${encodeURIComponent(state.historyCursor)}`:'';const {history}=await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(state.review.id)}/opinion-history${suffix}`);state.history=more?[...state.history,...history.entries]:history.entries;state.historyCursor=history.nextBeforeRevision;render();}catch(error){status(error.message);}finally{finishBusy();}}
    if(purpose==='WORK'&&button.hasAttribute('data-nr-final-preview')&&state.review?.capabilities?.finalize&&state.finalDraft){const draftKey=JSON.stringify(state.finalDraft);busy=true;try{const result=await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(state.review.id)}/preview`,{method:'POST',body:{revision:state.review.revision,...state.finalDraft}});if(disposed)return;if(draftKey!==JSON.stringify(state.finalDraft)){status('预览期间输入已变化，请重新预览；当前输入已保留。');return;}state.finalPreview=result.preview;state.finalPolicyToken=result.preview.policyToken;if(result.preview.sourceFacts){if(state.finalDraft.sourceFactsToken!==result.preview.sourceFacts.token)state.finalDraft.sourceFactsReviewed=false;state.review.sourceFacts=result.preview.sourceFacts;if(result.preview.sourceFacts.token)state.finalDraft.sourceFactsToken=result.preview.sourceFacts.token;}state.message='只读分配预览已更新，尚未入账。';render();}catch(error){status(`${error.message}；终审输入已保留。`);}finally{finishBusy();}}
    if(purpose==='WORK'&&button.hasAttribute('data-nr-sync')&&state.review?.capabilities?.sync){busy=true;try{const result=await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(state.review.id)}/sync`,{method:'POST',body:{}});state.finalization=result.finalization;state.message=statusOf(result.finalization);render();}catch(error){status(error.message);}finally{finishBusy();}}
  };
  const input=event=>{
    const field=event.target;
    if(['cancelReason','cancelConfirmed'].includes(field.name)&&!state.cancelRequest){state[field.name]=field.name==='cancelConfirmed'?field.checked:field.value;cancelDirty=true;syncDirty();}

    if(state.finalDraft && (field.name.startsWith('final_')||field.name.startsWith('finalRole_')||field.name.startsWith('finalRoleSet_'))){
      if(purpose==='STANDARD'&&(field.name.startsWith('finalRole')||['final_participantsVerified','final_roleVerificationReason'].includes(field.name)))return;
      if(field.name.startsWith('finalRoleSet_')){
        const [personIndex,roleIndex]=field.name.split('_').slice(1).map(Number),person=recognitionRolePeople(state.review)[personIndex],role=['主做','检验','辅助'][roleIndex];
        if(!person||!role)return;state.finalDraft.participants=state.finalDraft.participants.filter(item=>item.personId!==person.personId||item.role!==role);if(field.checked)state.finalDraft.participants.push({personId:person.personId,role});
        state.finalDraft.participantsVerified=false;const verified=root.querySelector('[name="final_participantsVerified"]');if(verified)verified.checked=false;
      }
      else if(field.name.startsWith('finalRole_')){const person=state.finalDraft.participants[Number(field.name.slice(10))];if(person)person.role=field.value;}
      else{const key=field.name.slice(6);if(Object.hasOwn(state.finalDraft.decision,key))state.finalDraft.decision[key]=field.value;
        else if(['reason','roleVerificationReason','admissionDecision','participantsVerified','sourceFactsReviewed'].includes(key))state.finalDraft[key]=['participantsVerified','sourceFactsReviewed'].includes(key)?field.checked:field.value;}
      state.finalPreview=null;const previewNode=root.querySelector('[data-nr-preview-result]');if(previewNode)previewNode.textContent='终审输入已变化，请重新预览。';finalDirty=true;syncDirty();
    }
    if(field.name==='hours'||field.name==='basis'){state[field.name]=field.value;opinionDirty=true;syncDirty();}
    if(field.name==='suggestionField'&&state.suggestionField!==field.value){state.suggestionField=field.value;state.suggestionValue='';suggestionDirty=true;syncDirty();render();}
    if(['suggestionValue','suggestionReason','privacyAcknowledged'].includes(field.name)){state[field.name]=field.name==='privacyAcknowledged'?field.checked:field.value;suggestionDirty=true;syncDirty();}
    if(field.name==='candidateSearch')state.candidateSearch=field.value;
    if(field.name==='finalizer'){state.finalizer=field.value;nominationDirty=true;syncDirty();}
    if(['replacePersonId','replacementAccountId','replaceReason'].includes(field.name)){
      const changed=state[field.name]!==field.value;state[field.name]=field.value;nominationDirty=true;syncDirty();
      if(field.name==='replacePersonId'&&changed){state.replacementAccountId='';render();}
    }
    if(field.name==='nominee'){
      const selected=new Set(state.nominees);if(field.checked)selected.add(field.value);else selected.delete(field.value);
      const people=[...selected].map(id=>state.candidates.find(person=>person.accountId===id)?.personId);
      if(selected.size>12||new Set(people).size!==people.length){field.checked=false;status('须指定12名不同人员，同一人员的多个账户不能重复占席。');return;}
      state.nominees=[...selected];nominationDirty=true;syncDirty();const count=root.querySelector('[data-nr-nominee-count]');if(count)count.textContent=`已选 ${selected.size}/12 人`;
    }
  };
  const submit=async event=>{
    if(event.target.matches('[data-nr-cancel]')){
      event.preventDefault();if(busy||purpose!=='WORK'||!state.review?.capabilities?.cancel)return;
      if(!state.cancelReason.trim()||!state.cancelConfirmed){status('请填写取消原因并明确确认关闭影响。');return;}
      if(!state.cancelRequest)state.cancelRequest={clientId:`cancel_${globalThis.crypto?.randomUUID?.()||`${Date.now()}_${Math.random().toString(36).slice(2)}`}`,revision:state.review.revision,reason:state.cancelReason.trim()};
      busy=true;render();const fieldset=root.querySelector('[data-nr-cancel] fieldset');fieldset.disabled=true;status('正在核对授权、版本及入账证据…');
      try{
        await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(state.review.id)}/cancel`,{method:'POST',body:state.cancelRequest});
        const {review}=await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(state.review.id)}`);
        if(!disposed){adopt(review);state.message='评议已取消，原工作与全部评议历史保留。';render();}
      }catch(error){if(!disposed){
        if([401,403,404].includes(error.status)){
          Object.assign(state,{review:null,items:[],hours:'',basis:'',history:[],candidates:[],finalizers:[],nominees:[],cancelReason:'',cancelConfirmed:false,cancelRequest:null,finalDraft:null,finalization:null,finalPreview:null,notifications:null,suggestionValue:'',suggestionReason:'',replaceReason:''});
          opinionDirty=nominationDirty=suggestionDirty=finalDirty=cancelDirty=false;syncDirty();state.message='当前访问资格已变化，事项内容已清除，请重新查询。';
        }else state.message=`${error.message}；取消请求已保留，可原样重试或明确刷新后核对状态。`;
        render();}}finally{finishBusy();}return;
    }
    if(event.target.matches('[data-nr-finalize]')){
      event.preventDefault();if(busy||!state.review?.capabilities?.finalize||!state.finalDraft)return;
      if((purpose==='WORK'&&!state.finalDraft.participantsVerified)||!state.finalDraft.admissionDecision||String(state.finalDraft.decision.recognizedHours).trim()===''){status(purpose==='STANDARD'?'请明确认定工时并选择准入意向。':'请明确认定工时、核实参与角色并选择准入意向。');return;}
      if(purpose==='WORK'&&recognitionRolePeople(state.review).some(person=>!state.finalDraft.participants.some(item=>item.personId===person.personId))){status('每名原参与人须至少核实一个分配角色，不能删除参与人员。');return;}
      if(purpose==='WORK'&&state.review.sourceFacts?.changed&&(!state.finalDraft.sourceFactsToken||!state.finalDraft.sourceFactsReviewed||!state.finalDraft.reason.trim())){status('须先预览原工作事实差异，明确核实并说明本轮裁定依据。');return;}
      busy=true;const fieldset=event.target.querySelector('fieldset');fieldset.disabled=true;status(purpose==='STANDARD'?'正在锁定标准认定，尚不发布…':'正在锁定本轮认定并核对入账条件…');
      try{const {finalization}=await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(state.review.id)}/finalize`,{method:'POST',body:{revision:state.review.revision,...state.finalDraft,...(purpose==='WORK'&&state.finalPolicyToken?{expectedPolicyToken:state.finalPolicyToken}:{})}});
        const {review}=await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(state.review.id)}`);if(!disposed){adopt(review,{preserveOpinion:true,preserveSuggestion:true,preserveNomination:true});state.finalization=finalization;state.message=`认定已锁定：${statusOf(finalization)}`;render();}
      }catch(error){status(`${error.message}；终审输入已保留，可用同内容重试。`);fieldset.disabled=false;}finally{finishBusy();}return;
    }
    if(event.target.matches('[data-nr-replace]')){
      event.preventDefault();if(busy||!state.review?.capabilities?.replaceSeat)return;
      const seat=state.review.seats.find(seat=>seat.personId===state.replacePersonId && !seat.submitted);
      if(!seat||!state.replacementAccountId||!state.replaceReason.trim()){status('请明确选择未提交席位、新人员，并填写替换原因。');return;}
      busy=true;const fieldset=event.target.querySelector('fieldset');fieldset.disabled=true;status('正在重新核对席位和资格…');
      try{const {review}=await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(state.review.id)}/seats`,{method:'POST',body:{revision:state.review.revision,personId:state.replacePersonId,accountId:state.replacementAccountId,reason:state.replaceReason}});
        if(!disposed){adopt(review,{preserveOpinion:true,preserveSuggestion:true});state.message='席位已替换，原受理时间保持不变。';render();}
      }catch(error){status(`${error.message}；替换选择及其他草稿已保留。`);fieldset.disabled=false;}finally{finishBusy();}return;
    }
    if(event.target.matches('[data-nr-suggestion]')){
      event.preventDefault();if(busy||!state.review?.capabilities?.submitOpinion)return;
      if(!state.suggestionValue.trim()||!state.suggestionReason.trim()||!state.privacyAcknowledged){status('请填写建议值、理由，并确认共享保密提示。');return;}
      const key=JSON.stringify([state.suggestionField,state.suggestionValue,state.suggestionReason,state.privacyAcknowledged]);
      if(!pendingSuggestion||pendingSuggestion.key!==key)pendingSuggestion={key,clientId:`suggest_${globalThis.crypto?.randomUUID?.()||`${Date.now()}_${Math.random().toString(36).slice(2)}`}`};
      busy=true;const fieldset=event.target.querySelector('fieldset');fieldset.disabled=true;status('正在保存共享建议…');
      try{const {review}=await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(state.review.id)}/suggestions`,{method:'POST',body:{clientId:pendingSuggestion.clientId,field:state.suggestionField,proposedValue:state.suggestionValue,reason:state.suggestionReason,privacyAcknowledged:state.privacyAcknowledged}});
        if(!disposed){adopt(review,{preserveOpinion:true,preserveNomination:true});state.message='共享建议已留痕，原申请未改变。';render();}
      }catch(error){status(`${error.message}；建议草稿和本人意见均已保留。`);fieldset.disabled=false;}finally{finishBusy();}return;
    }
    if(event.target.matches('[data-nr-accept]')){
      event.preventDefault();if(busy||!state.review?.capabilities?.assign)return;
      if(state.nominees.length!==12||!state.finalizer){status('请明确选择12名不同人员和终审负责人。');return;}
      busy=true;const fieldset=event.target.querySelector('fieldset');fieldset.disabled=true;status('正在核对资格并受理…');
      try{const {review}=await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(state.review.id)}/accept`,{method:'POST',body:{revision:state.review.revision,accountIds:state.nominees,finalizerAccountId:state.finalizer}});
        if(!disposed){adopt(review);state.message='受理成功，已记录指定人员和受理时间。';render();}
      }catch(error){status(`${error.message}；当前选择已保留。`);fieldset.disabled=false;}finally{finishBusy();}return;
    }
    if(!event.target.matches('[data-nr-opinion]'))return;event.preventDefault();if(busy||!state.review?.capabilities?.submitOpinion)return;
    busy=true;const fieldset=event.target.querySelector('fieldset');fieldset.disabled=true;status('正在提交本人意见…');
    try{const own=state.review.opinions.find(item=>item.accountId===accountId);const {review}=await api(`/maintenance/nonroutine-reviews/${encodeURIComponent(state.review.id)}/opinion`,{method:'POST',body:{revision:own?.revision||0,hours:state.hours,basis:state.basis}});
      if(!disposed){adopt(review,{preserveSuggestion:true,preserveNomination:true});state.message='本人意见已保存。';render();}
    }catch(error){status(`${error.message}；当前输入已保留。`);fieldset.disabled=false;}finally{finishBusy();}
  };
  const unload=event=>{if(dirty){event.preventDefault();event.returnValue='';}};
  root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',input);root.addEventListener('submit',submit);globalThis.addEventListener('beforeunload',unload);render();refresh();
  return {refresh,hasUnsaved:()=>dirty,isBusy:()=>busy,destroy(){disposed=true;refreshQueued=false;sequence++;root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',input);root.removeEventListener('submit',submit);globalThis.removeEventListener('beforeunload',unload);}};
}
