import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH=new URL('./synthetic.sqlite',import.meta.url).pathname;process.env.UPLOAD_DIR=new URL('./uploads',import.meta.url).pathname;
for(const key of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED'])process.env[key]='false';
const {db,measuredRoute}=await import('/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs');
class Response extends EventEmitter {headers={};statusCode=200;body='';writeHead(status,headers={}){this.statusCode=status;this.headers=headers;return this;}write(body=''){this.body+=body;return true;}end(body=''){this.write(body);this.emit('finish');}}
const request=async(path,method='GET',body={},cookie='')=>{const req=Readable.from([Buffer.from(JSON.stringify(body))]);req.method=method;req.url=path;req.headers={host:'127.0.0.1:8788',origin:'http://127.0.0.1:8788','content-type':'application/json',...(cookie?{cookie}:{})};const res=new Response();await measuredRoute(req,res);return {status:res.statusCode,headers:res.headers,payload:JSON.parse(res.body)};};
const login=await request('/api/login','POST',{username:'54002010',password:'muc2026'});assert.equal(login.status,200);const cookie=String(login.headers['Set-Cookie']||login.headers['set-cookie']).split(';')[0];
const flight=await request('/api/maintenance/flights','POST',{date:'2026-11-11',flightNo:'QA-RETIRED',aircraftNo:'B-QA',aircraftType:'A320',workKind:'航后'},cookie);assert.equal(flight.status,201);
const snapshot=()=>Object.fromEntries(db.prepare("select name from sqlite_master where type='table' and name like 'maintenance_%' order by name").all().map(({name})=>[name,db.prepare('select * from '+name).all().map(row=>JSON.stringify(row)).sort()]));
const before=snapshot(),path='/api/maintenance/flights/'+flight.payload.flight.id+'/work-report';
const anonymous=await request(path,'PUT',{mode:'finalize',hours:999});assert.equal(anonymous.status,401);
const read=await request(path,'GET',{},cookie),write=await request(path,'PUT',{mode:'finalize',hours:999,entries:[{role:'接机',personId:login.payload.user.personId}]},cookie);
assert.equal(read.status,410);assert.equal(write.status,410);assert.deepEqual(snapshot(),before);
const proof={syntheticOnly:true,anonymousWrite:anonymous.status,authenticatedRead:read.status,authenticatedFinalize:write.status,maintenanceTablesCompared:Object.keys(before).length,allMaintenanceFactsUnchanged:true};
fs.writeFileSync(new URL('./proof.json',import.meta.url),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));db.close();
