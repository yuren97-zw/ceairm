import {parentPort,workerData} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
parentPort.postMessage('ready');
parentPort.once('message',async()=>{
 let pending=0,maxPending=0;const measurements=[];
 const promises=workerData.requests.map(async request=>{
  const started=performance.now(),startedAt=Date.now();pending++;maxPending=Math.max(maxPending,pending);
  try{
   const response=await fetch(workerData.base+request.endpoint,{method:request.body?'POST':'GET',headers:{Cookie:request.cookie,Origin:workerData.base,...(request.body?{'content-type':'application/json','Idempotency-Key':request.key}:{})},body:request.body?JSON.stringify(request.body):undefined});
   const text=await response.text();measurements.push({endpoint:request.endpoint,status:response.status,ms:performance.now()-started,startedAt,finishedAt:Date.now(),bytes:Buffer.byteLength(text),serverTiming:response.headers.get('server-timing')});
   if(!response.ok)throw Error(request.endpoint+' returned '+response.status+' '+text.slice(0,100));
  }finally{pending--;}
 });
 parentPort.postMessage('started');
 const outcomes=await Promise.allSettled(promises);
 parentPort.postMessage({measurements,maxPending,errors:outcomes.filter(o=>o.status==='rejected').map(o=>({message:String(o.reason?.message||o.reason),code:o.reason?.cause?.code||''}))});
});
