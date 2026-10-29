import crypto from 'node:crypto';
export const attendanceStageColumns=Object.freeze({
  attendance_api_counts: ["month","source","endpoint","request_count","retry_count"],
  attendance_api_usage: ["month","request_count"],
  attendance_approval_cache: ["id","detail_json","status","fetched_at","invalidated_at"],
  attendance_approval_plan_due: ["id","instance_id","revision","person_id","work_date","phase","due_at","run_id","status"],
  attendance_approval_plan_events: ["event_id","marked_at"],
  attendance_approval_plan_history: ["id","instance_id","before_json","after_json","source","changed_at"],
  attendance_approval_plan_queue: ["id","generation","applied_generation","due_at","attempts","source","error"],
  attendance_approval_plans: ["id","person_id","kind","category","state","plan_json","revision","updated_at","error"],
  attendance_approvals: ["id","run_id","detail_json","status","fetched_at"],
  attendance_batches: ["id","run_id","from_date","to_date","users_json","payload_json","status","attempts","next_at","error"],
  attendance_changes: ["id","person_id","work_date","before_json","after_json","changed_at","run_id"],
  attendance_days: ["person_id","work_date","input_json","result_json","source_hash","updated_at","run_id"],
  attendance_event_targets: ["event_id","person_id","work_date","generation","source_read_at","applied_at"],
  attendance_events: ["id","topic","payload_json","received_at","status","error"],
  attendance_leases: ["id","owner","expires_at"],
  attendance_leave_catalog: ["id","types_json","last_synced_at","last_attempt_at","error"],
  attendance_leave_event_marks: ["event_id","marked_at"],
  attendance_leave_queue: ["person_id","generation","verified_generation","first_dirty_at","due_at","source","status","error","attempts","updated_at"],
  attendance_leave_snapshots: ["person_id","leave_code","type_name","quotas_json","records_json","synced_at"],
  attendance_people: ["user_id","person_id","employee_no","name","department","team","department_ids","identity_issue","seen_at"],
  attendance_refresh: ["person_id","work_date","generation","verified_generation","verified_at","first_dirty_at","due_at","error"],
  attendance_run_meta: ["run_id","source","priority","targets_json"],
  attendance_runs: ["id","from_date","to_date","status","actor_id","scope_json","created_at","updated_at","error","attempts","next_at"],
  attendance_schedule_cache: ["person_id","work_date","schedules_json","verified_at","invalidated_at"],
  attendance_sync_state: ["id","value_json","updated_at"],
  attendance_task_links: ["run_id","task_id"],
  attendance_task_marks: ["task_id","generation","started_at"],
  attendance_tasks: ["id","run_id","batch_id","person_id","user_id","work_date","status","attempts","next_at","error","updated_at"],
});
export const attendanceStageTables=Object.freeze(`attendance_api_counts attendance_api_usage attendance_approval_cache attendance_approval_plan_due attendance_approval_plan_events attendance_approval_plan_history attendance_approval_plan_queue attendance_approval_plans attendance_approvals attendance_batches attendance_changes attendance_days attendance_event_targets attendance_events attendance_leases attendance_leave_catalog attendance_leave_event_marks attendance_leave_queue attendance_leave_snapshots attendance_people attendance_refresh attendance_run_meta attendance_runs attendance_schedule_cache attendance_sync_state attendance_task_links attendance_task_marks attendance_tasks`.split(' ').sort());
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const stageDigest=v=>crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export const attendanceRowsDigest=rows=>stageDigest(rows.map(r=>JSON.stringify(canonical(r))).sort());
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function assertAttendanceStageTarget(url){let u;try{u=new URL(url);}catch{fail('ATTENDANCE_STAGE_INVALID_URL');}if(!['postgres:','postgresql:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!/^\/[a-z0-9_]+_attendance_stage$/.test(u.pathname)||u.search||u.hash||!u.port||['5432','8787','8788','8792'].includes(u.port))fail('ATTENDANCE_STAGE_ISOLATED_TARGET_REQUIRED');return u;}
function uniqueMap(source,target,field){
 const index=new Map(),seen=new Set(),map=new Map(),unknown=new Set();
 for(const row of target){const key=String(row[field]??'').trim();if(key)index.set(key,[...(index.get(key)||[]),row]);}
 for(const row of source){const key=String(row[field]??'').trim();if(!row.id||!key||seen.has(key))fail('ATTENDANCE_STAGE_SOURCE_IDENTITY_NOT_UNIQUE');seen.add(key);const matches=index.get(key)||[];if(matches.length>1)fail('ATTENDANCE_STAGE_TARGET_IDENTITY_NOT_UNIQUE');if(matches.length)map.set(String(row.id),String(matches[0].id));else unknown.add(String(row.id));}
 if(new Set(map.values()).size!==map.size)fail('ATTENDANCE_STAGE_IDENTITY_COLLISION');return {map,unknown};
}
export function prepareAttendanceStage({tables,sourcePeople,sourceAccounts,targetPeople,targetAccounts}){
 if(JSON.stringify(Object.keys(tables).sort())!==JSON.stringify(attendanceStageTables))fail('ATTENDANCE_STAGE_TABLE_CONTRACT_CHANGED');
 const persons=uniqueMap(sourcePeople,targetPeople,'employee_no'),accounts=uniqueMap(sourceAccounts,targetAccounts,'username');
 const person=value=>{if(value==null||value==='')return value;if(!persons.map.has(String(value)))fail('ATTENDANCE_STAGE_UNMAPPED_PERSON_REFERENCE');return persons.map.get(String(value));};
 const account=value=>{if(value==null||value===''||value==='scheduler')return value;if(!accounts.map.has(String(value)))fail('ATTENDANCE_STAGE_UNMAPPED_ACCOUNT_REFERENCE');return accounts.map.get(String(value));};
 const jsonChanges={};let dueCount=0;
 function transform(v,key,path){
  if(Array.isArray(v))return v.map(x=>transform(x,key,path+'[]'));
  if(v&&typeof v==='object'){for(const k of Object.keys(v))if(persons.map.has(k)||persons.unknown.has(k))fail('ATTENDANCE_STAGE_UNRECOGNIZED_JSON_ID_KEY');return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,transform(x,k,path+'.'+k)]));}
  if(typeof v!=='string')return v;let next=v;
  if(['personId','person_id','personIds','scope_json'].includes(key))next=person(v);
  else if(['actorId','actor_id','actor'].includes(key)){if(accounts.map.has(v)||accounts.unknown.has(v))next=account(v);}
  else if(!['employeeNo','employee_no','userId','user_id','userid','staffId','name','error'].includes(key)&&(persons.map.has(v)||persons.unknown.has(v)))fail('ATTENDANCE_STAGE_UNRECOGNIZED_JSON_PERSON_REFERENCE');
  if(next!==v)jsonChanges[path]=(jsonChanges[path]||0)+1;return next;
 }
 const output={};
 for(const name of attendanceStageTables){
  if(!Array.isArray(tables[name]))fail('ATTENDANCE_STAGE_INVALID_ROWS');
  output[name]=tables[name].map(row=>{
   const out={...row};for(const [key,value] of Object.entries(row)){
    if(key==='person_id')out[key]=person(value);
    else if(key==='actor_id')out[key]=account(value);
    else if((key.endsWith('_json')||key==='department_ids')&&value!=null&&value!==''){
     let original;try{original=JSON.parse(value);}catch{fail('ATTENDANCE_STAGE_INVALID_JSON');}
     const next=transform(original,key,name+'.'+key);if(JSON.stringify(original)!==JSON.stringify(next))out[key]=JSON.stringify(next);
    }
   }
   if(name==='attendance_approval_plan_due'){
    const hash=p=>crypto.createHash('sha256').update([row.instance_id,row.revision,p,row.work_date,row.phase].join('|')).digest('hex');
    if(!['initial','final'].includes(row.phase)||!Number.isSafeInteger(row.revision)||row.id!==hash(row.person_id))fail('ATTENDANCE_STAGE_UNKNOWN_DUE_ID');out.id=hash(out.person_id);dueCount++;
   }return out;
  });
 }
 const byId=Object.fromEntries(attendanceStageTables.map(name=>[name,new Map(output[name].filter(r=>r.id!=null).map(r=>[String(r.id),r]))]));
 const refs=[['attendance_tasks','run_id','attendance_runs'],['attendance_tasks','batch_id','attendance_batches'],['attendance_batches','run_id','attendance_runs'],['attendance_run_meta','run_id','attendance_runs'],['attendance_task_marks','task_id','attendance_tasks'],['attendance_task_links','task_id','attendance_tasks'],['attendance_task_links','run_id','attendance_runs'],['attendance_days','run_id','attendance_runs'],['attendance_changes','run_id','attendance_runs'],['attendance_event_targets','event_id','attendance_events'],['attendance_approval_plan_due','run_id','attendance_runs']];
 for(const row of output.attendance_approvals)if(row.run_id&&!byId.attendance_runs.has(String(row.run_id))){const job=output.attendance_sync_state.find(s=>s.id==='reasonBackfill:'+row.run_id);if(!job||JSON.parse(job.value_json)?.id!==row.run_id)fail('ATTENDANCE_STAGE_ORPHAN_APPROVAL_JOB');}
 for(const [table,column,target] of refs)for(const r of output[table])if(r[column]!=null&&r[column]!==''&&!byId[target].has(String(r[column])))fail('ATTENDANCE_STAGE_ORPHAN_'+table.toUpperCase());
 for(const r of output.attendance_tasks){const b=byId.attendance_batches.get(String(r.batch_id));if(b.run_id!==r.run_id)fail('ATTENDANCE_STAGE_TASK_BATCH_RUN_MISMATCH');const members=JSON.parse(b.users_json);if(!Array.isArray(members)||!members.some(p=>p.personId===r.person_id&&p.userId===r.user_id))fail('ATTENDANCE_STAGE_TASK_BATCH_PERSON_MISMATCH');}
 const tablesSummary=attendanceStageTables.map(name=>({table:name,rows:output[name].length,sha256:attendanceRowsDigest(output[name])}));
 const mappingHash=stageDigest({people:[...persons.map].sort(),accounts:[...accounts.map].sort()});
 return {tables:output,summary:{formatVersion:1,totalRows:tablesSummary.reduce((n,t)=>n+t.rows,0),peopleMapped:persons.map.size,accountsMapped:accounts.map.size,unreferencedUnmatchedPeople:persons.unknown.size,unreferencedUnmatchedAccounts:accounts.unknown.size,dueIdsRegenerated:dueCount,jsonChanges,tables:tablesSummary,mappingHash},sourceHash:stageDigest({tables,sourcePeople,sourceAccounts})};
}
export function attendanceStageDecision({checkpoint,sourceHash,targetHash,nonempty}){if(checkpoint){if(checkpoint.source_sha!==sourceHash||checkpoint.target_sha!==targetHash)fail('ATTENDANCE_STAGE_CHECKPOINT_DRIFT');return 'repeat';}if(nonempty.length)fail('ATTENDANCE_STAGE_NONEMPTY_ATTENDANCE');return 'fresh';}
