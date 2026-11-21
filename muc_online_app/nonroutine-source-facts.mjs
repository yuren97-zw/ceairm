import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields=['category','chapter','title','workScope'];
const pairs=people=>people.map(row=>JSON.stringify([row.personId,row.role])).sort();
const identities=people=>[...new Set(people.map(row=>row.personId))].sort();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const unavailable=reason=>({available:false,changed:true,reason,token:null});
function currentFacts(db,item,{readParticipants}={}){
 const task=db.prepare('select * from maintenance_subtasks where id=? and flight_id=?').get(item.subtask_id,item.flight_id),flight=db.prepare('select * from maintenance_flights where id=?').get(item.flight_id);
 if(!task||!flight)return null;
 const assignments=(readParticipants ? readParticipants(item) : db.prepare("select id,person_id,role from maintenance_assignments where owner_type='subtask' and owner_id=? and flight_id=? order by id").all(item.subtask_id,item.flight_id)).slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 return {opportunityId:item.flight_id,workItemId:item.subtask_id,reportBatchId:item.report_batch_id,
  fields:{category:String(task.category||''),chapter:String(task.card_no||''),title:String(task.title||''),workScope:String(task.content||'')},
  opportunity:{date:String(flight.date||''),aircraftNo:String(flight.aircraft_no||''),aircraftType:String(flight.aircraft_type||'')},
  participants:assignments.map(row=>({personId:row.person_id,role:row.role})),assignments:assignments.map(row=>({id:row.id,personId:row.person_id,role:row.role}))};
}
export function readNonroutineSourceFacts(db,item,options={}){
 const current=currentFacts(db,item,options);if(!current)return unavailable('原机会或工作已不存在');
 let baseline,baselineOrigin='SUBMISSION_SNAPSHOT';
 try{
  const events=db.prepare("select detail_json from maintenance_nonroutine_review_events where case_id=? and event_type='SOURCE_FACTS_BASELINE' order by created_at,id").all(item.id);if(events.length>1)return unavailable('原提报事实基线重复');const event=events[0];
  if(event){const stored=JSON.parse(event.detail_json);baseline=stored.facts;if(stored.token!==hash(baseline))return unavailable('原提报事实基线摘要不一致');if(!baseline||baseline.opportunityId!==item.flight_id||baseline.workItemId!==item.subtask_id||baseline.reportBatchId!==item.report_batch_id||!baseline.fields||!baseline.opportunity||!Array.isArray(baseline.participants)||!Array.isArray(baseline.assignments))return unavailable('原提报事实基线关联异常');}
  else{const application=JSON.parse(item.application_json),participants=JSON.parse(item.participants_json);baselineOrigin='APPLICATION_FIELDS_AND_PARTICIPANTS';baseline={fields:Object.fromEntries(fields.map(key=>[key,String(application[key]??'')])),participants};}
  if(!Array.isArray(baseline.participants)||!baseline.participants.length)return unavailable('原参与事实快照缺失');
 }catch{return unavailable('原提报事实快照无法解析');}
 const differences=fields.filter(key=>baseline.fields[key]!==current.fields[key]).map(field=>({field,previous:baseline.fields[field],current:current.fields[field]}));
 if(baseline.opportunity)for(const field of ['date','aircraftNo','aircraftType'])if(baseline.opportunity[field]!==current.opportunity[field])differences.push({field,previous:baseline.opportunity[field],current:current.opportunity[field]});
 const participantsChanged=!same(pairs(baseline.participants),pairs(current.participants));
 if(baseline.assignments&&!same(baseline.assignments,current.assignments))differences.push({field:'assignmentSources',previous:baseline.assignments,current:current.assignments});
 return {available:true,changed:participantsChanged||differences.length>0,token:hash(current),baselineOrigin,baseline,current,differences,participantsChanged,participantIdentityChanged:!same(identities(baseline.participants),identities(current.participants))};
}
export function saveNonroutineSourceBaseline({db,item,actorId,clock,randomId,readParticipants}){
 const facts=currentFacts(db,item,{readParticipants});if(!facts)throw Object.assign(Error('无法冻结原提报事实'),{status:409});
 const prior=db.prepare("select 1 from maintenance_nonroutine_review_events where case_id=? and event_type='SOURCE_FACTS_BASELINE'").get(item.id);if(prior)return;
 db.prepare('insert into maintenance_nonroutine_review_events(id,case_id,actor_id,event_type,detail_json,created_at) values(?,?,?,?,?,?)').run(randomId('nre'),item.id,actorId,'SOURCE_FACTS_BASELINE',JSON.stringify({facts,token:hash(facts)}),clock());
}
export function snapshotNonroutineSourceFacts(db,flightId,options={}){
 return db.prepare("select * from maintenance_nonroutine_review_cases where flight_id=? and state<>'CANCELLED'").all(flightId).map(item=>({item,facts:readNonroutineSourceFacts(db,item,options)}));
}
export function recordNonroutineSourceFactsChanges({db,before,actorId,reason,clock,randomId,readParticipants}){
 for(const previous of before){const facts=readNonroutineSourceFacts(db,previous.item,{readParticipants});if(previous.facts.token===facts.token&&previous.facts.available===facts.available)continue;
  db.prepare('insert into maintenance_nonroutine_review_events(id,case_id,actor_id,event_type,detail_json,created_at) values(?,?,?,?,?,?)').run(randomId('nre'),previous.item.id,actorId,'SOURCE_FACTS_CHANGED',JSON.stringify({previous:previous.facts.current||null,current:facts.current||null,token:facts.token,reason:reason||'',available:facts.available}),clock());
 }
}
export function approvedNonroutineSourceFacts(db,item,final,options={}){
 const facts=readNonroutineSourceFacts(db,item,options);if(!facts.available)return {ok:false,code:'SOURCE_FACTS_UNAVAILABLE'};
 const event=db.prepare("select detail_json from maintenance_nonroutine_review_events where case_id=? and event_type='FINALIZED' order by created_at,id").all(item.id).map(row=>JSON.parse(row.detail_json)).find(row=>row.finalId===final.id);
 // Legacy approvals cannot be silently attested against changed facts.
 if(event?.sourceFacts){if(!event.sourceFacts.current||hash(event.sourceFacts.current)!==event.sourceFacts.token||event.sourceFacts.token!==facts.token)return {ok:false,code:'SOURCE_FACTS_CHANGED_AFTER_FINALIZATION'};}
 else if(facts.changed)return {ok:false,code:'SOURCE_FACTS_REQUIRE_VERIFICATION'};
 if(facts.participantIdentityChanged)return {ok:false,code:'PARTICIPANTS_REQUIRE_VERIFICATION'};
 return {ok:true,token:facts.token};
}
