import {exportXlsx} from './attendance-export.mjs';
const xml=v=>String(v??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
const local=v=>v?new Date(v).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'}):'';
const STATUS={draft:'草稿',pending:'待接收',accepted:'已接收'};
// 导出单位始终是完整交接单：汇总/机会明细/变更记录三表以交接单 ID 关联。
// 历史原文（提交时快照、交接说明）与导出时的维修状态分列标注，不把当前状态冒充当时状态。
export function handoverExportTables(handovers){
 const summary=[['交接单ID','状态','交班班组','交班人','创建时间','提交时间','接班班组','接收人员','确认人','确认时间','在册机会数','其他交接事项','版本'],...handovers.map(({handover:h,recipients,opportunities})=>[xml(h.id),STATUS[h.status]||h.status,h.fromTeamName,h.createdByName,local(h.createdAt),local(h.submittedAt),h.toTeamName||'',recipients.map(r=>r.user_name).join('、'),h.confirmedByName||'',local(h.confirmedAt),opportunities.filter(o=>!o.removedAt).length,h.otherItems||'',h.version])];
 const detail=[['交接单ID','交班班组','维修机会ID','日期','机号','航班号','类别','桥位','落地时间','提交时快照状态','是否已取消勾选','取消时间','交接说明（原始，含已删除文字以变更记录为准）','导出时状态','导出时间'],...handovers.flatMap(({handover:h,opportunities,generatedAt})=>opportunities.map(o=>{const s=o.snapshot||{};return [h.id,h.fromTeamName,o.flightId,s.date||'',s.aircraftNo||'',s.flightNo||'',s.workKind||'',s.stand||'',s.plannedArrival||'',s.status||'',o.removedAt?'是':'否',local(o.removedAt),o.note||'',o.liveStatus??'',local(generatedAt)];}))];
 const changes=[['交接单ID','版本','对象','实体ID','动作','变更前','变更后','修改人','修改时间'],...handovers.flatMap(({handover:h,changes})=>changes.map(c=>[h.id,c.version,c.entityType,c.entityId||'',c.action,JSON.stringify(c.old??null),JSON.stringify(c.new??null),c.changedByName||'',local(c.changedAt)]))];
 return [['交接单汇总',summary],['维修机会明细',detail],['变更记录',changes]];
}
export function handoverXlsx(handovers){return exportXlsx({categories:[],people:[]},{tables:handoverExportTables(handovers)});}
