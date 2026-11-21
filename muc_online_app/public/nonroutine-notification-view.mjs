export function renderReviewNotifications(notifications,escape){
  return `<section class="nr-review-card" aria-label="本人评议通知"><h3>本人评议通知</h3><button type="button" data-nr-notifications>查询 / 刷新通知</button><p>只显示当前仍可办理的本人任务；读取通知不代表提交意见或完成终审。最多显示最近100条。</p>${notifications===null?'<p>点击查询本人通知。</p>':notifications.length?notifications.map(item=>{
    const progress=['REMINDER_36','REMINDER_48'].includes(item.eventType);
    return `<article class="nr-review-card"><strong>${escape(item.payload.title)}</strong> · ${item.readAt?'已读':'未读'}<p>${escape(item.createdAt)}</p>${progress?`<p>当前已提交 ${escape(item.payload.submittedCount)}/12 · ${item.payload.awaitingFinalization?'待终审':'需协调未提交人员'}</p><p>${(item.payload.pendingPeople||[]).map(person=>`${escape(person.name)}${person.employeeNo?`（${escape(person.employeeNo)}）`:''}`).join('、')||'无未提交人员'}</p>`:''}<button type="button" data-nr-notification-open="${escape(item.id)}">查看事项</button>${item.readAt?'':`<button type="button" data-nr-notification-read="${escape(item.id)}">标为已读</button>`}</article>`;
  }).join(''):'<p>当前没有可办理的本人通知。</p>'}</section>`;
}
