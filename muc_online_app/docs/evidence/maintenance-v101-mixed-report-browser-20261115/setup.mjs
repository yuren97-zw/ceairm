import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const output=new URL('.',import.meta.url).pathname,origin='http://127.0.0.1:18888';
const db=new DatabaseSync(output+'clean.sqlite',{readOnly:true});
async function api(path,method='GET',body,cookie=''){
 const response=await fetch(origin+path,{method,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),data=await response.json();assert.ok(response.ok,JSON.stringify({path,status:response.status,data}));return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
try{
 const login=await api('/api/login','POST',{username:'54002010',password:'muc2026'}),cookie=login.cookie,root=login.data.user,personId=root.personId;
 const call=async(path,method='GET',body,other=cookie)=>(await api(path,method,body,other)).data;
 const period=(await call('/api/maintenance/hour-periods/2024-11/assign','POST',{revision:0,accountId:root.id,reason:'Synthetic original report page period owner'})).period;await call('/api/maintenance/hour-periods/2024-11/confirm','POST',{revision:period.revision,state:'OPEN',reason:'Explicitly open synthetic report page period'});
 const flight=(await call('/api/maintenance/flights','POST',{date:'2024-11-10',flightNo:'MIXED-REPORT-BROWSER',aircraftNo:'B-MRBR',aircraftType:'A320',workKind:'停场'})).flight,base='/api/maintenance/flights/'+flight.id,version=async()=>(await call(base)).flight.updatedAt;
 await call(base+'/dispatch','POST',{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId}]});
 const items=['取消','评议中','合法零','有效两小时'].map((label,i)=>({clientId:'mixed-browser-'+i,temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'29',title:'报表页面-'+label,reportExplanation:'独立范围-'+label,standardHours:3,entries:[{role:'主做',personId}]}));
 const draft=(await call(base+'/reports/nonroutine/draft','PUT',{version:0,items})).draft;await call(base+'/reports/nonroutine','PUT',{mode:'submit',items,draftVersion:draft.version});
 const cases=items.map(item=>db.prepare('select c.id,c.subtask_id from maintenance_nonroutine_review_cases c join maintenance_subtasks s on s.id=c.subtask_id where c.flight_id=? and s.title=?').get(flight.id,item.title));assert.ok(cases.every(Boolean));
 const reviewers=[];for(let i=1;i<=12;i++){const id='browser-actual-'+i,r=await api('/api/login','POST',{username:id,password:'muc2026'});reviewers.push({id,cookie:r.cookie});}
 for(const c of cases.slice(1))await call(`/api/maintenance/nonroutine-reviews/${c.id}/accept`,'POST',{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:root.id});
 for(const [index,hours] of [[2,0],[3,2]]){const c=cases[index],url=`/api/maintenance/nonroutine-reviews/${c.id}`;for(const r of reviewers)await call(url+'/opinion','POST',{revision:0,hours,basis:'明确核实，页面验证合成意见'},r.cookie);const review=(await call(url)).review;await call(url+'/finalize','POST',{revision:review.revision,decision:{...review.application,recognizedHours:hours},participantsVerified:true,participants:[{personId,role:'主做'}],reason:'独立核实认定，不按申请值自动入账',roleVerificationReason:'',admissionDecision:'PENDING'});}
 await call(`/api/maintenance/nonroutine-reviews/${cases[0].id}/cancel`,'POST',{revision:1,clientId:'mixed-report-browser-cancel',reason:'保留原工作，验证取消与合法零不同'});
 await call(base+'/reports/release','PUT',{expectedUpdatedAt:await version()});const report=(await call(base+'/reports')).report;await call(base+'/report-confirmation','POST',{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:personId});const tree=(await call(base+'/review')).review;await call(base+'/review','PUT',{mode:'confirm',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))});
 const tables=['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_report_source_journal','maintenance_nonroutine_assessments','maintenance_nonroutine_review_cases','maintenance_nonroutine_review_channels','maintenance_nonroutine_review_events'];
 const facts=Object.fromEntries(tables.map(table=>[table,db.prepare(`select * from ${table} order by 1`).all()]));
 const metadata={flightId:flight.id,cases,items:items.map(i=>({title:i.title})),tables,beforeSha256:createHash('sha256').update(JSON.stringify(facts)).digest('hex')};fs.writeFileSync(output+'fixture.json',JSON.stringify(metadata,null,2));console.log(JSON.stringify({fixtureReady:true,items:4,reviewers:12}));
}finally{db.close();}
