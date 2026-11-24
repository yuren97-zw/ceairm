import {exportXlsx} from './attendance-export.mjs';
export const beijingTime=value=>new Date(value).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'});
export function loginAuditFilters(params, clock=new Date()){
 const today=new Date(clock.getTime()+28800000).toISOString().slice(0,10);
 const first=new Date(Date.parse(today+'T00:00:00+08:00')-6*86400000+28800000).toISOString().slice(0,10);
 const from=params.get('from')??first,to=params.get('to')??today,q=(params.get('q')||'').trim();
 const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 if(!valid(from)||!valid(to)||from>to||q.length>200)throw Object.assign(new Error('请填写有效的起止日期，起始日期不能晚于结束日期，关键词最多200字'),{status:400});
 const page=Number(params.get('page')||1);
 if(!Number.isSafeInteger(page)||page<1)throw Object.assign(new Error('页码无效'),{status:400});
 return {from,to,q,page};
}
export function readLoginAudit(db,filters,{all=false}={}){
 const {from,to,q,page}=filters;
 const start=new Date(from+'T00:00:00+08:00').toISOString(),end=new Date(Date.parse(to+'T00:00:00+08:00')+86400000).toISOString();
 const term='%'+q.toLowerCase().replace(/[\\%_]/g,'\\$&')+'%';
 const where=" from audit_logs a left join users u on u.id=a.user_id where a.action='login' and a.created_at>=? and a.created_at<? and (lower(coalesce(a.user_name,'')) like ? escape '\\' or lower(coalesce(u.username,'')) like ? escape '\\')";
 const args=[start,end,term,term];
 const total=Number(db.prepare('select count(*) as n'+where).get(...args).n);
 const rows=db.prepare('select a.id,a.created_at,a.user_name,u.username'+where+' order by a.created_at desc,a.id desc'+(all?'':' limit 20 offset ?')).all(...args,...(all?[]:[(page-1)*20])).map(r=>({id:r.id,loginAt:r.created_at,name:r.user_name||'—',username:r.username||'—',result:'登录成功'}));
 return {filters,total,page,pageSize:20,rows};
}
export function loginAuditXlsx(data,generatedAt){
 return exportXlsx({categories:[],people:[]},{tables:[['登录记录',[['登录时间（北京时间）','姓名','登录账号','登录结果'],...data.rows.map(r=>[beijingTime(r.loginAt),r.name,r.username,r.result])]],['查询条件',[['项目','内容'],['开始日期',data.filters.from],['结束日期（含当天）',data.filters.to],['姓名或账号关键词',data.filters.q],['记录数',data.total],['导出时间（北京时间）',beijingTime(generatedAt)]]]]});
}
