// Only exact approved form fields are retained; never inspect titles, notes or attachments.
export const APPROVAL_DETAIL_VERSION=2;
export function approvalReasonSpec(kind,config={}){
 return kind==='外出'?{id:'TextareaField-JYNRW51P',name:'外出事由'}:kind==='请假'?{id:'请假事由',name:'请假事由'}:{id:config.reasonFieldId||'',name:config.reasonFieldName||'出差事由'};
}
function fieldsFor(detail,kind,config){
 const spec=approvalReasonSpec(kind,config),values=detail?.formComponentValues||[];
 const ids=spec.id?values.filter(f=>String(f.id)===spec.id):[];
 return ids.length?ids:values.filter(f=>f.name===spec.name);
}
export function minimizeApprovalDetail(detail,kind,config){return {schemaVersion:APPROVAL_DETAIL_VERSION,kind,status:detail.status,result:detail.result,formComponentValues:fieldsFor(detail,kind,config).map(f=>({id:f.id,name:f.name,value:typeof f.value==='string'?f.value:null}))};}
export function readApprovalReason(detail,kind,config={}){
 if(!detail)return {reason:null,reasonStatus:'detail_missing'};
 const fields=fieldsFor(detail,kind,config);
 if(fields.length===0)return {reason:null,reasonStatus:'field_missing'};
 if(fields.length!==1)return {reason:null,reasonStatus:'ambiguous'};
 if(typeof fields[0].value!=='string')return {reason:null,reasonStatus:'unsupported'};
 return {reason:fields[0].value,reasonStatus:fields[0].value.trim()?'ok':'empty'};
}
export function enrichApprovalReason(approval,entry,config={}){
 if(!entry)return {...approval,reasonStatus:approval.reasonStatus||(approval.reason!==null&&approval.reason!==undefined?'ok':'detail_missing'),matchedKeywords:approval.matchedKeywords||[]};
 const detail=entry.detail,usable=approval.kind==='出差'||detail?.schemaVersion===APPROVAL_DETAIL_VERSION&&detail.kind===approval.kind;
 if(!usable)return {...approval,reasonStatus:entry.status==='ok'?'detail_missing':entry.status,matchedKeywords:[]};
 const read=readApprovalReason(detail,approval.kind,config),reasonStatus=entry.status==='ok'&&!entry.invalidated?read.reasonStatus:read.reason!==null?'stale':entry.status==='ok'?'detail_missing':entry.status;
 const withdrawn=detail&&(['TERMINATED','CANCELED','CANCELLED'].includes(detail.status)||detail.result==='refuse');
 return {...approval,...read,reasonStatus,detailStatus:entry.status,approved:withdrawn?false:entry.status==='ok'&&detail?.status?detail.status==='COMPLETED'&&detail.result==='agree':approval.approved,revoked:!!approval.revoked||!!withdrawn,matchedKeywords:approval.kind==='外出'&&read.reason?.includes('跟班')?['跟班']:[],recognizedCategory:approval.kind==='外出'&&read.reason!==null?(read.reason.includes('跟班')?'跟班':'外出'):null};
}
export function excelApprovalProjection(value){
 if(typeof value==='string'&&/^[\s]*[\[{]/.test(value)){try{return JSON.stringify(excelApprovalProjection(JSON.parse(value)));}catch{return value;}}
 if(Array.isArray(value))return value.map(excelApprovalProjection);
 if(!value||typeof value!=='object')return value;
 const privateReason=['外出','请假'].includes(value.kind);
 return Object.fromEntries(Object.entries(value).filter(([k])=>!(privateReason&&['reason','formComponentValues','reasonText','approvalReason'].includes(k))).map(([k,v])=>[k,excelApprovalProjection(v)]));
}
