const planEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const planTime=v=>v?new Date(v).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'}):'—';
export const approvalPlanState=p=>p.stale?'更新待核实':p.reconciled?'已复核':({approved:'已批准，待当天复核',withdrawn:'已撤回／撤销／拒绝',superseded:'已被修改单替代',pending:'审批未生效',unresolved:'资料待核对',unsupported:'表单待适配'})[p.state]||'待核对';
export const approvalDisplayCount=(p,c)=>p.displayCounts?.[c]??p.counts?.[c]??0;
export function approvalPlanDot(p,c){return (p.pendingCounts?.[c]||0)>0?'<span class="att-plan-dot" title="含已批准待复核记录" aria-label="含已批准待复核记录">●</span>':'';}
export function approvalPlansHtml(plans,month){
 if(!plans?.length)return '<p class="att-detail-note">当前统计月无已知相关审批；不代表审批已完整覆盖。</p>';
 const approved=plans.filter(p=>p.state==='approved'&&!p.stale&&!p.error);
 const dates=new Set(approved.flatMap(p=>p.dates||[]));
 return `<p>${planEsc(month||'当前统计月')} · 有效申请${new Set(approved.map(p=>p.id)).size}单 · 涉及${dates.size}个日期；各类别按日期去重，不计入实际天数合计或年度余额。</p>`+plans.map(p=>`<section class="att-note"><strong>${planEsc(p.category||p.kind||'类别待核实')}</strong> · ${planEsc(approvalPlanState(p))}<p>${planEsc((p.dates||[]).join('、'))}</p><small>审批：${planEsc(p.id)} · 最近读取：${planEsc(planTime(p.updatedAt))}</small>${p.duration?`<p>审批原始时长：${planEsc(p.duration.value??'未提供')} ${planEsc(p.duration.unit||'')}</p>`:''}<p class="att-pre">${planEsc(p.reason??'未取得事由')}</p>${p.effectReason?`<p>${planEsc(p.effectReason)}</p>`:''}${p.error?`<p class="att-warning">${planEsc(p.error)}</p>`:''}${p.history?.length?`<details><summary>变更记录（最近${p.history.length}次）</summary>${p.history.map(h=>`<p>${planEsc(planTime(h.changedAt))} · ${planEsc(h.category||'')} · ${planEsc(h.state)}<small>${planEsc((h.dates||[]).join('、'))}</small></p>`).join('')}</details>`:''}</section>`).join('');
}
