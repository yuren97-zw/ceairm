// Uses the existing app request/auth/render helpers; no direct writes to formal records.
async function openImportWorkspace(id) {
  let data, page=1, query='', onlyErrors=true, selected=null, busy=false, catalog=[], reason='';
  const columns=['工号','姓名','项目代码','项目名称','授权类型','授权单位','授权日期','授权有效期','授权状态'];
  const dialog=document.createElement('dialog');
  dialog.id='importWorkspaceDialog';
  dialog.style.cssText='width:min(1100px,95vw);max-width:95vw;max-height:90vh;padding:20px;overflow:auto';
  document.body.append(dialog);
  const esc=value=>escapeHtml(value??'');
  const no=r=>String(r['工号']||r['员工工号']||r['人员工号']||r['员工号']||'');
  const endpoint=`/personnel/imports/${encodeURIComponent(id)}/workspace`;
  const read=async()=>{data=(await apiRequest(endpoint)).workspace;};
  const errorText=e=>[e.message,...(Array.isArray(e.details)?e.details:e.details?.issues||[]).map(i=>`第${i.rowNumber}行：${i.detail}`)].join('\n');
  function table(rows,fields) {
    return `<div style="overflow:auto"><table class="personnel-table"><thead><tr>${fields.map(k=>`<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${fields.map(k=>`<td style="padding:6px;white-space:nowrap">${esc(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function render(message='') {
    const auth=data.importType==='authorization', errors=new Set(data.issues.filter(i=>i.severity==='error').map(i=>i.rowNumber));
    const duplicateNumbers=new Set(data.duplicates.flatMap(g=>g.rowNumbers));
    const filtered=data.rows.filter(r=>(!onlyErrors||errors.has(r.__importRowNumber)||duplicateNumbers.has(r.__importRowNumber))&&(!query||Object.values(r).some(v=>String(v).includes(query))));
    const pages=Math.max(1,Math.ceil(filtered.length/20));page=Math.min(page,pages);
    const fields=auth?columns:[...new Set(data.rows.flatMap(r=>Object.keys(r)))].filter(k=>k!=='__importRowNumber');
    const pending=data.status==='pending';
    dialog.innerHTML=`<style>
      #importWorkspaceDialog button{min-height:38px;padding:7px 12px;border:1px solid #c9d7e4;border-radius:12px;background:#f5faff;color:#096681;cursor:pointer;margin:3px 0;font:inherit}
      #importWorkspaceDialog button:disabled{opacity:.55;cursor:not-allowed}
      #importWorkspaceDialog input{min-height:36px;padding:6px;border:1px solid #c9d7e4;border-radius:8px;box-sizing:border-box;max-width:100%;font:inherit}
      #importWorkspaceDialog input[type=checkbox]{min-height:auto}
      #importWorkspaceDialog details{padding:10px 0;border-bottom:1px solid #e0e8ef}
      #importWorkspaceDialog summary{cursor:pointer;font-weight:600}
      #importWorkspaceDialog th{text-align:left;padding:6px}
    </style><header style="display:flex;align-items:center;justify-content:space-between"><h2>导入检查与处理</h2><button type="button" data-iw="close">关闭</button></header>
      <p>${esc(data.fileName)} · ${pending?'待确认':esc(data.status)} · 暂存${data.rows.length}行 · 错误${data.summary.errors}条 · 警告${data.summary.warnings}条</p>
      <p>所有处理只修改暂存区，正式数据尚未改变。排除人员会排除该人员全部导入行，其正式数据保持不变。</p>
      <p role="status" style="white-space:pre-wrap;color:#b42318">${esc(message)}</p>
      ${pending?`<label>处置原因（保存、合并、排除、重新校验均需填写）<input id="iwReason" style="width:100%" value="${esc(reason)}" maxlength="1000"></label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">${auth?'<button type="button" data-iw="mergeExact">一键合并完全重复行</button>':''}<button type="button" data-iw="recheck">重新校验</button><button type="button" data-iw="restore">恢复原始暂存</button>${auth&&hasRbac('personnel.qualification.manage')?'<button type="button" data-iw="newProject">新增授权项目</button>':''}</div>`:''}
      <details ${data.issues.length?'open':''}><summary>错误与警告明细（${data.issues.length}）</summary>${data.issues.map(i=>`<p>第${i.rowNumber}行：${esc(i.detail)} ${pending&&i.rowNumber?`<button type="button" data-iw="edit" data-row="${i.rowNumber}">修正此行</button>`:''}</p>`).join('')||'<p>没有校验错误。</p>'}</details>
      ${data.duplicates.map(g=>{const groupRows=g.rowNumbers.map(n=>({'原始行':n,...data.rows.find(r=>r.__importRowNumber===n)}));const differences=columns.filter(k=>groupRows.some(r=>String(r[k]??'')!==String(groupRows[0][k]??'')));return `<details open><summary>${g.exact?'完全重复':'同一授权组合存在差异'}：第${g.rowNumbers.join('、')}行</summary><p>${esc(groupRows[0]['姓名'])} · ${esc(groupRows[0]['项目代码'])}</p>${table(groupRows,['原始行',...(differences.length?differences:['工号','姓名'])])}<details><summary>查看完整九字段</summary>${table(groupRows,['原始行',...columns])}</details>${pending?g.rowNumbers.map(n=>`<button type="button" data-iw="keepConflict" data-row="${n}">保留第${n}行，合并同组其他行</button>`).join(' '):''}</details>`;}).join('')}
      <section id="iwEditArea"></section>
      <h3>暂存行浏览</h3><label>搜索工号、姓名或项目 <input id="iwQuery" value="${esc(query)}"></label><button type="button" data-iw="search">搜索</button>
      <label><input id="iwOnlyErrors" type="checkbox" ${onlyErrors?'checked':''}>只看错误与重复行</label>
      <div style="overflow:auto"><table><thead><tr><th>原始行</th>${fields.map(k=>`<th>${esc(k)}</th>`).join('')}<th>操作</th></tr></thead><tbody>${filtered.slice((page-1)*20,page*20).map(r=>`<tr><td>${r.__importRowNumber}</td>${fields.map(k=>`<td style="white-space:nowrap;padding:6px">${esc(r[k])}</td>`).join('')}<td style="white-space:nowrap">${pending?`<button type="button" data-iw="edit" data-row="${r.__importRowNumber}">编辑</button> <button type="button" data-iw="excludePerson" data-no="${esc(no(r))}">本批不处理此人员</button>`:''}</td></tr>`).join('')}</tbody></table></div>
      <p>筛选${filtered.length}行 · 第${page}/${pages}页 <button type="button" data-iw="prev" ${page===1?'disabled':''}>上一页</button> <button type="button" data-iw="next" ${page===pages?'disabled':''}>下一页</button></p>
      ${auth?`<h3>正式授权替换差异</h3><p>确认后将以暂存清单替换下列人员全部授权；未列出的人员保持不变。各项日期不作为自动选新依据。</p>
      ${data.conflicts.length?'<p style="color:#b42318">正式授权已变化，本批次已阻止确认。请展开下列清单核对后，主动接受当前版本。</p><button type="button" data-iw="acceptVersions">已核对差异，接受当前正式版本</button>':''}
      ${data.people.map(p=>`<details><summary>${esc(p.employeeNo)} ${esc(p.name)}：原有${p.old.length}条 → 本批${p.incoming.length}条 · 不再保留${p.removed.length}条</summary><h4>将不再保留的原授权</h4>${table(p.removed,columns.slice(2))}<h4>当前正式授权（本人员整体替换）</h4>${table(p.old,columns.slice(2))}<h4>确认后的完整授权清单</h4>${table(p.incoming,columns.slice(2))}</details>`).join('')}`:''}
      <details><summary>暂存处置记录（${data.history.length}次）</summary>${data.history.map(h=>`<p>${esc(h.at)} · ${esc(h.operatorName)} · ${esc(h.operation)} · ${esc(h.reason)}</p>`).join('')}</details>
      ${pending?`<p>确认前请展开核对每个人的完整清单。</p><button class="btn" type="button" data-iw="confirm" ${data.summary.errors||data.conflicts.length||!data.rows.length?'disabled':''}>${data.summary.errors?'存在错误，暂不能生效':data.conflicts.length?'正式数据已变化，需先核对':'确认整批生效'}</button>`:''}`;
    if(selected)renderEdit(selected);
  }
  function renderEdit(n) {
    const row=data.rows.find(r=>r.__importRowNumber===n);if(!row)return;
    selected=n;
    const auth=data.importType==='authorization';
    const fields=auth?columns:Object.keys(row).filter(k=>k!=='__importRowNumber');
    dialog.querySelector('#iwEditArea').innerHTML=`<h3>修正原始第${n}行</h3><p>工号用于匹配人员；授权姓名和项目名称在保存时由主数据补齐。</p><form id="iwRowForm" class="entry-grid">${fields.map(k=>`<label>${esc(k)}<input data-field="${esc(k)}" value="${esc(row[k])}" ${auth&&['姓名','项目名称'].includes(k)?'readonly':''} ${auth&&k==='项目代码'?'list="iwProjects"':''}></label>`).join('')}<datalist id="iwProjects">${catalog.map(p=>`<option value="${esc(p.projectCode)}">${esc(p.projectName)}</option>`).join('')}</datalist><button type="submit">保存暂存行并校验</button><button type="button" data-iw="cancelEdit">取消编辑</button></form>`;
  }
  async function apply(operation, extra={}) {
    reason=dialog.querySelector('#iwReason')?.value.trim()||'';
    if(!reason){alert('请填写处置原因');return;}
    busy=true;dialog.setAttribute('aria-busy','true');dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{data=(await apiRequest(endpoint,{method:'POST',body:{operation,reason,revision:data.revision,...extra}})).workspace;selected=null;render('已保存到暂存区，尚未写入正式数据。');}
    catch(e){render(errorText(e));}finally{busy=false;dialog.removeAttribute('aria-busy');}
  }
  dialog.addEventListener('input',event=>{if(event.target.id==='iwReason')reason=event.target.value;});
  dialog.addEventListener('change',event=>{if(event.target.id==='iwOnlyErrors'){if(selected){alert('请先保存或取消正在编辑的行');event.target.checked=onlyErrors;return;}onlyErrors=event.target.checked;page=1;render();}});
  dialog.addEventListener('submit',async event=>{
    if(event.target.id!=='iwRowForm')return;event.preventDefault();if(busy)return;
    const values={};event.target.querySelectorAll('[data-field]').forEach(input=>{if(!input.readOnly)values[input.dataset.field]=input.value;});
    await apply('edit',{rowNumber:selected,values});
  });
  dialog.addEventListener('click',async event=>{
    const button=event.target.closest('[data-iw]');if(!button||busy)return;
    const op=button.dataset.iw;
    if(op==='close'){if(selected&&!confirm('放弃本行尚未保存的修改？'))return;dialog.close();return;}
    if(op==='cancelEdit'){selected=null;render();return;}
    if(selected&&!['edit','newProject'].includes(op)){alert('请先保存或取消正在编辑的行');return;}
    if(op==='edit'){if(selected&&selected!==Number(button.dataset.row)&&!confirm('放弃当前行尚未保存的修改？'))return;renderEdit(Number(button.dataset.row));dialog.querySelector('#iwEditArea').scrollIntoView({block:'center'});return;}
    if(op==='search'){query=dialog.querySelector('#iwQuery').value.trim();page=1;render();return;}
    if(op==='prev'||op==='next'){page+=op==='prev'?-1:1;render();return;}
    if(op==='newProject'){openAuthorizationProjectDialog();return;}
    if(op==='confirm'){
      const previous=data.revision;await read();
      if(previous!==data.revision||data.summary.errors||data.conflicts.length){render('暂存或正式资料已变化，请重新核对。');return;}
      if(!confirm('确认以当前暂存清单整批生效？授权批次会替换所列人员全部授权，未列人员不变。'))return;
      busy=true;
      try {await personnelService.confirmImport(id,data.importType==='authorization',data.summary.workspaceRevision);await refreshPersonnel();state.personnelImportBatches=hasRbac('personnel.audit.view')?await personnelService.imports():state.personnelImportBatches.map(b=>b.id===id?{...b,status:'confirmed'}:b);renderPersonnelPage();dialog.close();alert('整批已生效');}catch(e){alert(errorText(e));}finally{busy=false;}return;
    }
    const prompts={mergeExact:'仅合并九个字段完全相同的行，不会自动处理日期差异。确认？',keepConflict:`保留第${button.dataset.row}行，合并同一授权组合的其他暂存行？`,excludePerson:`本批不处理工号${button.dataset.no}的全部记录，其正式数据不变。确认？`,restore:'撤销本批所有暂存修正，恢复原始上传内容？正式数据版本不会重置。',acceptVersions:'已核对当前正式授权与本批完整清单，确认接受当前版本并继续准备替换？'};
    if(prompts[op]&&!confirm(prompts[op]))return;
    await apply(op,{rowNumber:Number(button.dataset.row),employeeNo:button.dataset.no,currentVersionsToken:data.currentVersionsToken});
  });
  dialog.addEventListener('cancel',event=>{if(busy||selected&&!confirm('放弃本行尚未保存的修改？'))event.preventDefault();});
  dialog.addEventListener('close',async()=>{dialog.remove();try{state.personnelImportBatches=hasRbac('personnel.audit.view')?await personnelService.imports():state.personnelImportBatches.map(b=>b.id===id?{...b,summary:data.summary,status:data.status}:b);renderPersonnelPage();}catch{}});
  try {
    await read();
    if(data.importType==='authorization')for(let p=1;p<=100;p++){const response=await apiRequest(`/personnel/authorization-projects?page=${p}&pageSize=100`);catalog.push(...response.items);if(catalog.length>=response.total)break;}
    render();dialog.showModal();
  }catch(e){dialog.remove();alert(errorText(e));}
}
