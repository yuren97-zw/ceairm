const candidateRows=(candidates,escape)=>candidates.map((item, index) => `<label class="maintenance-standard-candidate"><input type="radio" name="standard-candidate" value="${index}"><span><strong>${escape(item.category)} · ATA ${escape(item.chapter)} · ${escape(item.title)}</strong><small>${escape(item.aircraftCodes?.join(" / ") || "通用机型")} · ${escape(item.standardHours)}小时 · V${escape(item.version)}</small><span class="maintenance-standard-scope">${escape(item.workScope)}</span><small>${escape(item.id)}</small></span></label>`).join("");
export function standardCandidatePickerHtml({ title, original, candidates, escapeHtml: escape }) {
  return `<div class="maintenance-standard-picker-body"><div class="dialog-head"><h2>${escape(title)}</h2><button type="button" class="icon-btn" data-standard-picker-close aria-label="返回原页面">×</button></div>
    <p>原工作 · ${escape(original.category || "类别待填")} · ATA ${escape(original.chapter || "待填")} · ${escape(original.title || "名称待填")}</p>
    <p class="maintenance-standard-scope">${escape(original.reportExplanation || original.workScope || "范围待完善")}</p>
    <div class="maintenance-standard-candidates">${candidateRows(candidates,escape)}</div>
    <p data-standard-picker-message role="status" aria-live="polite"></p><div class="form-actions"><button type="button" class="btn secondary" data-standard-picker-close>返回</button><button type="button" class="btn" data-standard-picker-confirm disabled>确认引用所选版本</button></div></div>`;
}

export function openStandardCandidatePicker({ parent, title = "选择适用标准", original, candidates, escapeHtml, onSelect }) {
  const opener = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'maintenance-standard-picker';
  dialog.setAttribute('aria-label', title);
  dialog.style.width = `${Math.min(parent.getBoundingClientRect().width, window.innerWidth)}px`;
  dialog.innerHTML = standardCandidatePickerHtml({ title, original, candidates, escapeHtml });
  document.body.append(dialog);
  let busy = false;
  let selected = null;
  const confirm = dialog.querySelector('[data-standard-picker-confirm]');
  function close() { if (!busy) dialog.close(); }
  dialog.addEventListener('close', () => { dialog.remove(); if (opener?.isConnected) opener.focus(); else parent.focus?.(); });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('change', event => {
    if (busy || event.target.name !== 'standard-candidate') return;
    selected = candidates[Number(event.target.value)] || null;
    confirm.disabled = !selected;
  });
  dialog.addEventListener('click', async event => {
    if (event.target.closest('[data-standard-picker-close]')) return close();
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
      return;
    }
    if (!event.target.closest('[data-standard-picker-confirm]') || busy || !selected) return;
    busy = true;
    dialog.querySelectorAll('button,input').forEach(control => { control.disabled = true; });
    try {
      const accepted = await onSelect(selected);
      if (accepted === false) throw new Error('选择未保存，请返回预览重新核对标准版本。');
      busy = false; dialog.close();
    } catch (error) {
      dialog.querySelector('[data-standard-picker-message]').textContent = error.message;
      busy = false;
      dialog.querySelectorAll('button,input').forEach(control => { control.disabled = false; });
      confirm.disabled = !selected;
    }
  });
  dialog.showModal();
  return {close,dialog,setCandidates(next){if(busy)return false;candidates=next;selected=null;confirm.disabled=true;dialog.querySelector('.maintenance-standard-candidates').innerHTML=candidateRows(candidates,escapeHtml);return true;}};
}

// Browsing and choosing reuse the original candidate drawer; they do not save or submit work.
export async function openExecutionStandardPicker({parent,api,flightId,original,escapeHtml:escape,onSelect,onUnlisted,unlistedLabel}){
  const base=`/maintenance/flights/${encodeURIComponent(flightId)}/standards`,initial=await api(base);
  if(!parent.isConnected)return null;
  const picker=openStandardCandidatePicker({parent,title:'选择非例行标准',original,candidates:initial.items,escapeHtml:escape,onSelect});
  const {dialog}=picker;dialog.classList.add('maintenance-standard-browser');
  const codes=new Set([initial.aircraftCode,...initial.items.flatMap(item=>item.aircraftCodes||[])].filter(Boolean));
  dialog.querySelector('.dialog-head').insertAdjacentHTML('beforeend',`<div class="maintenance-standard-browser-tools"><label>搜索<input type="search" data-standard-search maxlength="100" placeholder="名称 / ATA / 范围"></label><label>筛选机型<select data-standard-aircraft><option value="">全部机型</option>${[...codes].sort().map(code=>`<option value="${escape(code)}" ${code===initial.aircraftCode?'selected':''}>${escape(code)}</option>`).join('')}</select></label><button type="button" class="btn secondary" data-standard-query>查询</button><p data-standard-applicability role="status"></p></div>`);
  dialog.querySelector('.form-actions').insertAdjacentHTML('afterbegin',`<button type="button" class="btn secondary" data-standard-unlisted>${escape(unlistedLabel||'+ 新增未收录非例行工作')}</button>`);
  const notice=()=>dialog.querySelector('[data-standard-applicability]');
  const showScope=result=>{notice().textContent=result.fallback?'未匹配到机型，当前显示全部，请核对适用性；筛选不代表机型审批。':`正在筛选 ${result.aircraftCode}；最终提报仍核对原维修机会机型。`;};showScope(initial);
  let loading=false;
  dialog.addEventListener('click',async event=>{
    if(event.target.closest('[data-standard-unlisted]')){try{if(await onUnlisted()!==false)picker.close();}catch(error){dialog.querySelector('[data-standard-picker-message]').textContent=error.message;}return;}
    if(!event.target.closest('[data-standard-query]')||loading)return;
    const search=dialog.querySelector('[data-standard-search]').value,aircraftCode=dialog.querySelector('[data-standard-aircraft]').value;
    loading=true;picker.setCandidates([]);notice().textContent='正在查询…';
    try{const result=await api(`${base}?${new URLSearchParams({search,aircraftCode})}`);if(!dialog.isConnected)return;
      if(dialog.querySelector('[data-standard-search]').value!==search||dialog.querySelector('[data-standard-aircraft]').value!==aircraftCode){notice().textContent='筛选已变化，请重新查询。';return;}
      picker.setCandidates(result.items);showScope(result);
    }catch(error){if(dialog.isConnected)notice().textContent=`${error.message}；原工作内容已保留。`;}finally{loading=false;}
  });
  return picker;
}
