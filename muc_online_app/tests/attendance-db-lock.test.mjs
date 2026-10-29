import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDatabase} from '../db.mjs';
test('SQLite writer waits for another process transaction instead of immediately aborting',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'attendance-lock-')),file=path.join(dir,'test.sqlite');
 const db=await createDatabase({dbPath:file,databaseUrl:''});db.exec('create table sample(id integer primary key)');
 const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(workerData);d.exec('begin immediate');parentPort.postMessage('locked');setTimeout(()=>{d.exec('commit');d.close();},350);`,{eval:true,workerData:file});
 try{await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});db.prepare('insert into sample(id) values(?)').run(1);assert.equal(db.prepare('select count(*) as n from sample').get().n,1);}finally{db.close();await worker.terminate();await rm(dir,{recursive:true,force:true});}
});
