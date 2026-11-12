import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {createDatabase} from '../../db.mjs';
import {createOffsetService} from '../../attendance-offset-service.mjs';
import {datesBetween} from '../../attendance-rules.mjs';
const db=workerData.databaseUrl?await createDatabase({databaseUrl:workerData.databaseUrl}):new DatabaseSync(workerData.path);if(!workerData.databaseUrl)db.exec('pragma busy_timeout=5000');
const service=createOffsetService({db,clock:()=>Date.parse('2026-11-20T12:00:00+08:00'),writesEnabled:true,hasPermission:(u,p)=>u.permissions.includes(p),canViewPerson:()=>true,loadUser:id=>workerData.users.find(u=>u.id===id),readDays:(p,from,to)=>datesBetween(from,to).map(date=>workerData.sources.find(d=>d.date===date))});
parentPort.postMessage('ready');
parentPort.once('message',()=>{try{parentPort.postMessage({ok:true,result:(workerData.action==='issue'?service.issue(workerData.actor,workerData.body,workerData.key):workerData.action==='initializationConfirm'?service.initializationConfirm(workerData.actor,workerData.body,workerData.key):workerData.action&&workerData.action!=='submit'?service[workerData.action](workerData.actor||workerData.employee,workerData.requestId,workerData.body,workerData.key):service.submit(workerData.employee,workerData.body,workerData.key))});}catch(e){parentPort.postMessage({ok:false,status:e.status||409});}finally{db.close();}});
