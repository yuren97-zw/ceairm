import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {handoverTaskCanAct} from './handover-service.mjs';
const fail=(message,status)=>Object.assign(Error(message),{status});
// 内置来源注册表：考勤抵消审批 + 班组交接确认（canAct 统一为 (db,user,row)，缺省回落到全局 canAct）。
const DEFAULT_SOURCES={
 'attendance:offset_approval':{action:'approve',module:'attendance',routeAction:'offset_approval'},
 'handover:confirm':{action:'confirm',module:'handover',routeAction:'handover',canAct:(db,user,row)=>handoverTaskCanAct(db,user,row)}
};
// Public, authenticated index: source modules retain all business authority.
export function createActionTaskService({db,canAct,selectVisible=null,sources=null,clock=Date.now}){
 db.exec(fs.readFileSync(new URL('./migrations/034_action_task_revisions.sql',import.meta.url),'utf8'));
 const registry={...DEFAULT_SOURCES,...(sources||{})};
 const rowCanAct=(user,row)=>{const adapter=registry[row.source_module+':'+row.source_type];if(!adapter)return false;return adapter.canAct?adapter.canAct(db,user,row):!!canAct&&canAct(user,row);};
 const bump=userId=>db.prepare('insert into action_task_revisions(user_id,version) values(?,1) on conflict(user_id) do update set version=action_task_revisions.version+1').run(userId);
 const authenticate=user=>{if(!user?.id)throw fail('请先登录',401);};
 // 默认按受派查询并用来源权限校验；selectVisible 追加来源侧特化可见行（按 id 去重，两路权限都生效）。
 const visible=user=>{
  const rows=db.prepare("select * from action_tasks where assignee_user_id=? and status='pending' order by created_at desc,id desc").all(user.id).filter(row=>rowCanAct(user,row));
  if(!selectVisible)return rows;
  const seen=new Set(rows.map(r=>r.id));
  for(const row of selectVisible(user))if(!seen.has(row.id))rows.push(row);
  return rows;
 };
 const project=row=>({id:row.id,sourceModule:row.source_module,sourceType:row.source_type,sourceId:row.source_id,title:row.title,createdAt:row.created_at,target:JSON.parse(row.target_json)});
 return {
  touchRecipients(userIds){for(const id of new Set(userIds))bump(id);},
  revisions(userIds){if(!userIds.length)return new Map();return new Map(db.prepare(`select user_id,version from action_task_revisions where user_id in (${userIds.map(()=>'?').join(',')})`).all(...userIds).map(r=>[r.user_id,Number(r.version)]));},
  fingerprint(user){authenticate(user);return createHash('sha256').update(JSON.stringify(visible(user).map(r=>[r.id,r.source_id,r.updated_at]))).digest('hex');},
  count(user){authenticate(user);return {count:visible(user).length};},
  list(user,{cursor=null,limit=20}={}){
   authenticate(user);if(!Number.isInteger(limit)||limit<1||limit>100)throw fail('分页参数无效',400);
   const rows=visible(user);let offset=0;
   if(cursor){const i=rows.findIndex(row=>row.id===cursor);if(i<0)throw fail('列表已变化，请刷新',409);offset=i+1;}
   const page=rows.slice(offset,offset+limit);
   return {count:rows.length,items:page.map(project),nextCursor:offset+page.length<rows.length?page.at(-1).id:null};
  },
  // Internal-only commands participate in caller's existing transaction.
  upsert({sourceModule,sourceType,sourceId,assigneeUserId,title,createdAt=null}){
   const adapter=registry[sourceModule+':'+sourceType];if(!adapter)throw fail('来源尚未启用',400);
   const at=new Date(clock()).toISOString();
   const changed=db.prepare("insert into action_tasks(id,source_module,source_type,source_id,action_type,assignee_user_id,title,status,target_json,created_at,updated_at) values(?,?,?,?,?,?,?,'pending',?,?,?) on conflict(source_module,source_type,source_id,action_type,assignee_user_id) do update set status='pending',updated_at=excluded.updated_at where action_tasks.status='invalidated'").run(randomUUID(),sourceModule,sourceType,sourceId,adapter.action,assigneeUserId,title,JSON.stringify({module:adapter.module,action:adapter.routeAction,id:sourceId}),createdAt||at,at);
   if(Number(changed.changes))bump(assigneeUserId);
  },
  close(sourceId,status='completed',{sourceModule='attendance',sourceType='offset_approval'}={}){
   if(!['completed','cancelled','invalidated'].includes(status))throw fail('状态无效',400);
   const recipients=db.prepare("select distinct assignee_user_id from action_tasks where source_module=? and source_type=? and source_id=? and status='pending'").all(sourceModule,sourceType,sourceId);
   const changed=db.prepare("update action_tasks set status=?,updated_at=? where source_module=? and source_type=? and source_id=? and status='pending'").run(status,new Date(clock()).toISOString(),sourceModule,sourceType,sourceId);
   if(Number(changed.changes))for(const row of recipients)bump(row.assignee_user_id);
  },
  // 单个接收人失效：待接收阶段把某人移出接收名单时只终结其个人待办，不影响他人。
  closeOne(sourceId,assigneeUserId,status='invalidated',{sourceModule='handover',sourceType='confirm'}={}){
   if(!['completed','cancelled','invalidated'].includes(status))throw fail('状态无效',400);
   const changed=db.prepare("update action_tasks set status=?,updated_at=? where source_module=? and source_type=? and source_id=? and assignee_user_id=? and status='pending'").run(status,new Date(clock()).toISOString(),sourceModule,sourceType,sourceId,assigneeUserId);
   if(Number(changed.changes))bump(assigneeUserId);
   return Number(changed.changes);
  }
 };
}
