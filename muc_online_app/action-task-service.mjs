import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
const fail=(message,status)=>Object.assign(Error(message),{status});
// Public, authenticated index: source modules retain all business authority.
export function createActionTaskService({db,canAct,selectVisible=null,sources={'attendance:offset_approval':{action:'approve',module:'attendance',routeAction:'offset_approval'}},clock=Date.now}){
 db.exec(fs.readFileSync(new URL('./migrations/034_action_task_revisions.sql',import.meta.url),'utf8'));
 const bump=userId=>db.prepare('insert into action_task_revisions(user_id,version) values(?,1) on conflict(user_id) do update set version=action_task_revisions.version+1').run(userId);
 const authenticate=user=>{if(!user?.id)throw fail('请先登录',401);};
 const visible=user=>selectVisible?selectVisible(user):db.prepare("select * from action_tasks where assignee_user_id=? and status='pending' order by created_at desc,id desc").all(user.id).filter(row=>canAct(user,row));
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
   const adapter=sources[sourceModule+':'+sourceType];if(!adapter)throw fail('来源尚未启用',400);
   const at=new Date(clock()).toISOString();
   const changed=db.prepare("insert into action_tasks(id,source_module,source_type,source_id,action_type,assignee_user_id,title,status,target_json,created_at,updated_at) values(?,?,?,?,?,?,?,'pending',?,?,?) on conflict(source_module,source_type,source_id,action_type,assignee_user_id) do update set status='pending',updated_at=excluded.updated_at where action_tasks.status='invalidated'").run(randomUUID(),sourceModule,sourceType,sourceId,adapter.action,assigneeUserId,title,JSON.stringify({module:adapter.module,action:adapter.routeAction,id:sourceId}),createdAt||at,at);
   if(Number(changed.changes))bump(assigneeUserId);
  },
  close(sourceId,status='completed',{sourceModule='attendance',sourceType='offset_approval'}={}){
   if(!['completed','cancelled','invalidated'].includes(status))throw fail('状态无效',400);
   const recipients=db.prepare("select distinct assignee_user_id from action_tasks where source_module=? and source_type=? and source_id=? and status='pending'").all(sourceModule,sourceType,sourceId);
   const changed=db.prepare("update action_tasks set status=?,updated_at=? where source_module=? and source_type=? and source_id=? and status='pending'").run(status,new Date(clock()).toISOString(),sourceModule,sourceType,sourceId);
   if(Number(changed.changes))for(const row of recipients)bump(row.assignee_user_id);
  }
 };
}
