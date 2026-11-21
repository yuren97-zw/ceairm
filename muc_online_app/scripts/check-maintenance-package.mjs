import assert from 'node:assert/strict';
// Called only by the existing CI verifier against its newly created artifact database.
export async function verifyMaintenancePackage({origin,cookie,personId}){
 const url=new URL(origin);
 if(process.env.CI!=='true'||process.env.ATTENDANCE_TEST_DATABASE!=='true'||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||[5432,55432,8787,8788,8792].includes(Number(url.port))||url.pathname!=='/'||url.search||url.hash||url.username||url.password||!cookie||!personId)throw Error('Only the ephemeral CI artifact service is allowed');
 const request=async(path,method='GET',body)=>{const response=await fetch(origin+path,{method,headers:{cookie,Origin:origin,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const result=await response.json();assert.ok(response.ok,`${method} ${path}: ${response.status}`);return result;};
 const month='2026-11',before=(await request('/api/maintenance/stats/personal?month='+month)).metrics;
 const created=await request('/api/maintenance/flights','POST',{date:month+'-10',flightNo:'CI-ARTIFACT-MAINT',aircraftNo:'B-CIQA',aircraftType:'A320',workKind:'停场'}),id=created.flight.id,base='/api/maintenance/flights/'+encodeURIComponent(id);
 const version=async()=>(await request(base)).flight.updatedAt;
 await request(base+'/dispatch','POST',{expectedUpdatedAt:created.flight.updatedAt,assignments:[{role:'放行',personId}]});
 const item={clientId:'ci-artifact-unlisted',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'991',title:'发行包未收录隔离工作',reportExplanation:'仅用于CI实际发行包验证',standardHours:2,entries:[{personId,role:'主做'}]};
 const draft=await request(base+'/reports/nonroutine/draft','PUT',{items:[item],version:0});
 const draftReport=(await request(base+'/reports')).report;assert.equal(draftReport.nonroutine.items.length,0,'Text draft must not create formal work');
 await request(base+'/reports/nonroutine','PUT',{mode:'submit',items:[item],draftVersion:draft.draft.version,expectedUpdatedAt:await version()});
 await request(base+'/reports/release','PUT',{expectedUpdatedAt:await version(),releasePersonId:personId});
 const report=(await request(base+'/reports')).report;
 assert.equal(report.nonroutine.items.length,1);const pending=report.nonroutine.items[0];assert.equal(pending.hourAssessment.effectiveHours,null);assert.equal(pending.hourAssessment.reviewPending,true);
 await request(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:[{...pending,standardHours:2}],releasePersonId:personId});
 const tree=(await request(base+'/review')).review;
 await request(base+'/review','PUT',{mode:'confirm',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(task=>({ownerType:task.ownerType,ownerId:task.ownerId,assignments:task.assignments.map(row=>({personId:row.personId,role:row.role}))}))});
 assert.equal((await request(base)).flight.status,'已确认');
 const after=(await request('/api/maintenance/stats/personal?month='+month)).metrics;
 assert.equal(after.monthHours,before.monthHours,'Unreviewed request must not become confirmed hours');assert.equal(after.pendingMonthHours,before.pendingMonthHours,'Unreviewed request must not become ordinary pending hours');assert.equal(after.monthSorties-before.monthSorties,1,'Release count must remain independent');
 return {maintenanceLifecycle:true,textDraftCreatesNoFormalWork:true,pendingReviewExcludedFromHours:true,originalOpportunityConfirmed:true,addedConfirmedHours:0,addedReleaseSorties:1};
}
