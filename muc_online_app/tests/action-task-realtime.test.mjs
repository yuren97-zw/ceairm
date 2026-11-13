import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {createOffsetRegister} from '../attendance-offset-register.mjs';
import {createActionTaskService} from '../action-task-service.mjs';
import {createActionTaskRealtime} from '../action-task-realtime.mjs';
class Response extends EventEmitter{
 constructor(){super();this.output='';this.writableLength=0;this.writableEnded=false;}
 writeHead(status,headers){this.status=status;this.headers=headers;}
 write(value){this.output+=value;}
 end(){this.writableEnded=true;this.emit('close');}
}
function fixture(){
 let now=0,versionReads=0,snapshotReads=0;const revisions=new Map(),values=new Map();
 const stream=createActionTaskRealtime({versions:ids=>{versionReads++;return new Map(ids.map(id=>[id,revisions.get(id)||0]));},snapshot:user=>{snapshotReads++;return values.get(user.id)||'empty';},currentUser:req=>req.user,clock:()=>now});
 const connect=id=>{const req={user:{id}},res=new Response();assert.equal(stream.connect(req,res,req.user),true);return {req,res};};
 return {stream,revisions,values,connect,advance:n=>now+=n,get reads(){return {versions:versionReads,snapshots:snapshotReads};}};
}
test('signals follow each recipient, including replacements with unchanged counts; no global IDs or content leak',()=>{
 const f=fixture(),a=f.connect('a'),b=f.connect('b');f.stream.pump();a.res.output=b.res.output='';
 f.values.set('a','private-request-id-and-title');f.revisions.set('a',1);f.stream.pump();
 assert.match(a.res.output,/"kind":"changed"/);assert.doesNotMatch(a.res.output,/private-request|version|title/);assert.equal(b.res.output,'');
 const before=f.reads;f.stream.pump();assert.equal(f.reads.snapshots,before.snapshots);assert.equal(f.reads.versions,before.versions+1);
 a.res.output='';f.values.set('a','different-private-request');f.revisions.set('a',2);f.stream.pump();assert.match(a.res.output,/changed/);f.stream.close();
});
test('heartbeat revalidates session and permissions; connection caps and backpressure release clients',()=>{
 const f=fixture(),a=f.connect('a');for(let i=0;i<4;i++)f.connect('a');assert.equal(f.stream.connect(a.req,new Response(),a.req.user),false);
 a.req.user=null;f.advance(25000);f.stream.pump();assert.match(a.res.output,/access-revoked/);assert.equal(a.res.writableEnded,true);
 const b=f.connect('b');b.res.writableLength=65537;f.advance(25000);f.stream.pump();assert.equal(b.res.writableEnded,true);f.stream.close();assert.equal(f.stream.size,0);
 const before=f.reads;f.stream.pump();assert.deepEqual(f.reads,before);
});
test('one hundred idle users use one revision read per tick and only a changed recipient needs a snapshot',()=>{
 const f=fixture();for(let i=0;i<100;i++)f.connect('u'+i);const before=f.reads;
 for(let i=0;i<10;i++)f.stream.pump();assert.equal(f.reads.versions-before.versions,10);assert.equal(f.reads.snapshots,before.snapshots);
 f.values.set('u30','new');f.revisions.set('u30',1);f.stream.pump();assert.equal(f.reads.snapshots-before.snapshots,1);f.stream.close();
});
test('recipient revision increments share the task transaction and roll back with failed writes',()=>{
 const db=new DatabaseSync(':memory:');createOffsetRegister({db});const service=createActionTaskService({db,canAct:()=>true});
 const task={sourceModule:'attendance',sourceType:'offset_approval',sourceId:'request',assigneeUserId:'recipient',title:'模拟待办'};
 db.exec('begin immediate');service.upsert(task);assert.equal(service.revisions(['recipient']).get('recipient'),1);db.exec('rollback');assert.equal(service.revisions(['recipient']).get('recipient'),undefined);
 db.exec('begin immediate');service.upsert(task);db.exec('commit');assert.equal(service.revisions(['recipient']).get('recipient'),1);
 service.upsert(task);assert.equal(service.revisions(['recipient']).get('recipient'),1);assert.equal(service.revisions(['unrelated']).size,0);
 db.exec('begin immediate');service.close('request','invalidated');service.upsert({...task,assigneeUserId:'new-recipient'});db.exec('commit');
 assert.equal(service.revisions(['recipient']).get('recipient'),2);assert.equal(service.revisions(['new-recipient']).get('new-recipient'),1);db.close();
});
