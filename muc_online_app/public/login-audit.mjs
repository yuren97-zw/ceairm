let saved=null;
const local=value=>new Date(value).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'});
export function mountLoginAudit({root,api,escapeHtml:e,canExport,accountId}){
 const today=new Date(Date.now()+28800000).toISOString().slice(0,10),first=new Date(Date.parse(today+'T00:00:00Z')-6*86400000).toISOString().slice(0,10);
 if(saved?.accountId!==accountId)saved={accountId,filters:{from:first,to:today,q:''}};
 let page=1,busy=false,exporting=false,data=null,error='',requestId=0;
 const active=()=>root.isConnected;
 const query=()=>new URLSearchParams({...saved.filters,page:String(page)}).toString();
 function render(){
  if(!active())return;
  root.innerHTML=`<h3>登录记录</h3><p class="muted">成功建立登录会话的记录，时间均为北京时间。历史信息以实际留存为准。</p><form class="login-audit-filters"><label>开始日期<input name="from" type="date" required value="${e(saved.filters.from)}"></label><label>结束日期<input name="to" type="date" required value="${e(saved.filters.to)}"></label><label>姓名或账号<input name="q" maxlength="200" value="${e(saved.filters.q)}" placeholder="输入姓名或登录账号"></label><button class="btn secondary" ${busy?'disabled':''}>查询</button><button class="btn secondary" type="button" data-reset ${busy?'disabled':''}>重置</button>${canExport?`<button type="button" class="btn secondary" data-export ${busy||exporting||!data?'disabled':''}>${exporting?'正在导出…':'导出 Excel'}</button>`:''}</form><div role="status">${busy?'正在读取登录记录…':error?`${e(error)} <button type="button" class="link-btn" data-retry>重试</button>`:''}</div>${data&&!busy&&!error?`<p>共 ${data.total} 条记录</p><table class="login-audit-table"><thead><tr><th>登录时间（北京时间）</th><th>姓名</th><th>登录账号</th><th>登录结果</th></tr></thead><tbody>${data.rows.map(r=>`<tr><td data-label="登录时间">${e(local(r.loginAt))}</td><td data-label="姓名">${e(r.name)}</td><td data-label="登录账号">${e(r.username)}</td><td data-label="登录结果">${e(r.result)}</td></tr>`).join('')}</tbody></table>${data.rows.length?'':'<p>没有符合条件的登录记录。</p>'}<div class="login-audit-pager"><button type="button" class="btn secondary" data-prev ${page<=1?'disabled':''}>上一页</button><span>第 ${page} / ${Math.max(1,Math.ceil(data.total/20))} 页</span><button type="button" class="btn secondary" data-next ${page*20>=data.total?'disabled':''}>下一页</button></div>`:''}`;
 }
 async function load(){const id=++requestId;busy=true;error='';render();try{const next=await api('/admin/audit/logins?'+query());if(id!==requestId||!active())return;data=next;}catch(err){if(id===requestId)error=err.message;}finally{if(id===requestId){busy=false;render();}}}
 root.addEventListener('submit',event=>{event.preventDefault();if(busy)return;const form=new FormData(event.target);saved.filters={from:String(form.get('from')),to:String(form.get('to')),q:String(form.get('q')).trim()};page=1;load();});
 root.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.hasAttribute('data-reset')){saved.filters={from:first,to:today,q:''};page=1;load();}
  if(button.hasAttribute('data-retry'))load();
  if(button.hasAttribute('data-prev')){page--;load();}
  if(button.hasAttribute('data-next')){page++;load();}
  if(button.hasAttribute('data-export')){
   exporting=true;button.disabled=true;button.textContent='正在导出…';
   try{const blob=await api('/admin/audit/logins/export?'+query());if(!active())return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`登录记录_${saved.filters.from}_${saved.filters.to}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(err){if(active())root.querySelector('[role="status"]').textContent='导出失败：'+err.message;}finally{exporting=false;if(active()){button.disabled=false;button.textContent='导出 Excel';}}
  }
 });
 render();load();
}
