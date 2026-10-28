import test from 'node:test';
import assert from 'node:assert/strict';
import {DingTalkClient,configuration,DingTalkError,syncWindows} from '../attendance-dingtalk.mjs';
const cfg=configuration({DINGTALK_APP_KEY:'test',DINGTALK_APP_SECRET:'do-not-expose'});
const reply=v=>({ok:true,json:async()=>v});
test('only explicit successful schedule omission is a candidate; other interfaces and malformed schedules fail closed',async()=>{
 const make=value=>new DingTalkClient(cfg,{sleep:async()=>{},fetchImpl:async url=>reply(url.includes('gettoken')?{access_token:'t'}:value)});
 const rows=await make({errcode:0,success:true}).schedules(['u'],'2026-10-25','2026-10-25');
 assert.deepEqual(rows,[]);assert.equal(rows.scheduleEvidence.status,'empty_candidate');
 for(const value of [{errcode:0},{success:true},{errcode:0,success:true,result:null},{errcode:0,success:true,result:{}},{errcode:0,success:true,result:''}])await assert.rejects(()=>make(value).schedules(['u'],'2026-10-25','2026-10-25'),{code:'SCHEMA'});
 await assert.rejects(()=>make({errcode:0,success:false}).schedules(['u'],'2026-10-25','2026-10-25'));
 await assert.rejects(()=>make({errcode:60011,success:false}).schedules(['u'],'2026-10-25','2026-10-25'),{code:'60011'});
 await assert.rejects(()=>make({errcode:0,success:true}).results(['u'],'2026-10-25','2026-10-25'),{code:'SCHEMA'});
 await assert.rejects(()=>make({errcode:0,success:true}).day('u','2026-10-25'),e=>e.code==='SCHEMA'&&e.endpoint==='/topapi/attendance/getupdatedata'&&e.field==='result');
});
test('batch result pagination requires explicit closure and seven-day windows',async()=>{
 const requests=[];const client=new DingTalkClient(cfg,{sleep:async()=>{},fetchImpl:async(url,init)=>{if(url.includes('gettoken'))return reply({access_token:'token',expires_in:7200});requests.push(JSON.parse(init.body));return reply(requests.length===1?{errcode:0,recordresult:[{userId:'u'}],hasMore:true}:{errcode:0,recordresult:[],hasMore:false});}});
 assert.equal((await client.results(['u'],'2026-09-01','2026-09-07')).length,1);assert.equal(requests[1].offset,50);assert.deepEqual(syncWindows('2026-09-01','2026-09-10'),[{from:'2026-09-01',to:'2026-09-07'},{from:'2026-09-08',to:'2026-09-10'}]);
});
test('missing pagination flag and absent result arrays never count as completed empty data',async()=>{
 const client=new DingTalkClient(cfg,{sleep:async()=>{},fetchImpl:async url=>reply(url.includes('gettoken')?{access_token:'t'}:{errcode:0,recordresult:[]})});await assert.rejects(()=>client.results(['u'],'2026-09-01','2026-09-01'),{code:'PAGINATION'});await assert.rejects(()=>client.day('u','2026-09-01'),{code:'SCHEMA'});
});
test('expired token refresh and throttling retry without exposing vendor message',async()=>{
 let tokens=0,calls=0;const client=new DingTalkClient(cfg,{sleep:async()=>{},fetchImpl:async url=>{if(url.includes('gettoken'))return reply({access_token:'t'+(++tokens)});calls++;return reply(calls===1?{errcode:40014,errmsg:'do-not-expose'}:calls===2?{errcode:90018,errmsg:'do-not-expose'}:{errcode:0,recordresult:[],hasMore:false});}});await client.results(['u'],'2026-09-01','2026-09-01');assert.equal(tokens,2);assert.equal(calls,3);
});
test('persistent API budget invoked on every HTTP request including token acquisition',async()=>{let used=0;const client=new DingTalkClient(cfg,{sleep:async()=>{},beforeRequest:async()=>{used++;if(used>1)throw new DingTalkError('budget','BUDGET');},fetchImpl:async()=>reply({access_token:'t'})});await assert.rejects(()=>client.results(['u'],'2026-09-01','2026-09-01'),{code:'BUDGET'});assert.equal(used,2);});
test('network retry is bounded and error does not contain secret URL',async()=>{let n=0;const client=new DingTalkClient(cfg,{sleep:async()=>{},fetchImpl:async()=>{n++;throw Error('https://x/?secret=do-not-expose');}});try{await client.call('/x',{});assert.fail();}catch(e){assert.ok(!e.message.includes('do-not-expose'));assert.equal(n,4);}});
test('frontend uses existing apiRequest relative paths without duplicate /api prefix',async()=>{const {readFile}=await import('node:fs/promises');const s=await readFile(new URL('../public/attendance.mjs',import.meta.url),'utf8');assert.ok(!s.includes("api('/api/"));assert.ok(s.includes("api('/attendance/status')"));});
test('wrapped 88 permission errors are terminal nested codes, not repeated throttling',async()=>{let calls=0;const c=new DingTalkClient(cfg,{sleep:async()=>{},fetchImpl:async url=>{if(url.includes('gettoken'))return reply({access_token:'t'});calls++;return reply({errcode:88,errmsg:'ding talk error[subcode=60011,submsg=no permission, {requiredScopes=[qyapi_get_department_list]}]'});}});try{await c.call('/x',{});assert.fail();}catch(e){assert.equal(e.code,'60011');assert.deepEqual(e.permissionCodes,['qyapi_get_department_list']);assert.equal(calls,1);}});
test('leave directory requests all enterprise types, deduplicates names and rejects malformed responses',async()=>{
 const calls=[];const c=new DingTalkClient(cfg,{sleep:async()=>{},fetchImpl:async(url,init)=>{if(url.includes('gettoken'))return reply({access_token:'test'});calls.push(JSON.parse(init.body));return reply({errcode:0,result:[{leave_name:'病假',source:'general',biz_type:'sick',leave_view_unit:'day'},{leave_name:'事假'},{leave_name:'病假'}]});}});
 const types=await c.leaveTypes();assert.deepEqual(types.map(t=>t.name),['病假','事假']);assert.equal(calls[0].vacation_source,'all');assert.equal(calls[0].op_userid,cfg.operatorId);
 const invalid=new DingTalkClient(cfg,{sleep:async()=>{},fetchImpl:async url=>reply(url.includes('gettoken')?{access_token:'test'}:{errcode:0,result:[{}]})});await assert.rejects(()=>invalid.leaveTypes(),{code:'SCHEMA'});
});

test('approval template inventory uses modern read-only GET and maps names/cursor without legacy management scope',async()=>{
 const seen=[];const c=new DingTalkClient({...cfg,operatorId:'operator'},{sleep:async()=>{},fetchImpl:async(url,init)=>{if(url.includes('gettoken'))return reply({access_token:'private'});seen.push({url,init});return reply({result:{processList:[{name:'外出',processCode:'code'}],nextToken:100}});}});
 assert.deepEqual(await c.approvalTemplates(0),{items:[{name:'外出',process_code:'code'}],next:100});const {url,init}=seen[0];assert.equal(init.method,'GET');assert.equal(init.body,undefined);assert.equal(new URL(url).searchParams.get('nextToken'),'0');assert.equal(new URL(url).searchParams.get('userId'),'operator');assert.equal(new URL(url).pathname,'/v1.0/workflow/processes/userVisibilities/templates');assert.ok(!url.includes('private'));
});
test('modern denied template query extracts only exact read scope and never retries or leaks vendor body',async()=>{
 let calls=0;const c=new DingTalkClient(cfg,{sleep:async()=>{},fetchImpl:async url=>{if(url.includes('gettoken'))return reply({access_token:'private'});calls++;return {ok:false,status:403,json:async()=>({code:'Forbidden.AccessDenied.AccessTokenPermissionDenied',message:'requires Workflow.Form.Read; secret-body-not-returned'})};}});
 await assert.rejects(()=>c.approvalTemplates(),e=>e.code==='403'&&JSON.stringify(e.permissionCodes)==='["Workflow.Form.Read"]'&&!e.message.includes('secret-body'));assert.equal(calls,1);
});
