import {randomUUID} from 'node:crypto';
const fail=(message,status)=>Object.assign(Error(message),{status});
// Public, authenticated index: source modules retain all business authority.
export function createActionTaskService({db,canAct,selectVisible=null,sources={'attendance:offset_approval':{action:'approve',module:'attendance',routeAction:'offset_approval'}},clock=Date.now}){
 const authenticate=user=>{if(!user?.id)throw fail('请先登录',401);};
 const visible=user=>selectVisible?selectVisible(user):db.prepare("select * from action_tasks where assignee_user_id=? and status='pending' order by created_at desc,id desc").all(user.id).filter(row=>canAct(user,row));
 const project=row=>({id:row.id,sourceModule:row.source_module,sourceType:row.source_type,sourceId:row.source_id,title:row.title,createdAt:row.created_at,target:JSON.parse(row.target_json)});
 return {
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
   db.prepare("insert into action_tasks(id,source_module,source_type,source_id,action_type,assignee_user_id,title,status,target_json,created_at,updated_at) values(?,?,?,?,?,?,?,'pending',?,?,?) on conflict(source_module,source_type,source_id,action_type,assignee_user_id) do update set status='pending',updated_at=excluded.updated_at where action_tasks.status='invalidated'").run(randomUUID(),sourceModule,sourceType,sourceId,adapter.action,assigneeUserId,title,JSON.stringify({module:adapter.module,action:adapter.routeAction,id:sourceId}),createdAt||at,at);
  },
  close(sourceId,status='completed',{sourceModule='attendance',sourceType='offset_approval'}={}){
   if(!['completed','cancelled','invalidated'].includes(status))throw fail('状态无效',400);
   db.prepare("update action_tasks set status=?,updated_at=? where source_module=? and source_type=? and source_id=? and status='pending'").run(status,new Date(clock()).toISOString(),sourceModule,sourceType,sourceId);
  }
 };
}
