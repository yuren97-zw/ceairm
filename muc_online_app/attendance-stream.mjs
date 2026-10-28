import WebSocket from 'ws';
import crypto from 'node:crypto';
const parse=v=>typeof v==='string'?JSON.parse(v):v;
export function streamReply(frame,ok=true){
 const h=frame.headers||frame.header||{};
 return {code:ok?200:500,headers:{messageId:h.messageId,contentType:'application/json'},message:ok?'OK':'retry',data:JSON.stringify(frame.type==='SYSTEM'?parse(frame.data):{status:ok?'SUCCESS':'LATER',message:ok?'persisted':'retry'})};
}
// Uses the official Stream wire protocol. Credentials/tickets never enter persisted state.
export function createAttendanceStream({db,config,coordinator,clock=Date.now,fetchImpl=fetch,WebSocketImpl=WebSocket,beforeRequest=async()=>{}}){
 const owner=crypto.randomUUID();let socket=null,timer=null,connecting=false,stopped=true,nextAt=0,attempts=0,lastTraffic=0,lastPing=0;
 const at=()=>new Date(clock()).toISOString();
 function status(value){coordinator.setState('stream',{...coordinator.state('stream'),...value,updatedAt:at()});}
 function lease(){db.prepare("insert into attendance_leases(id,owner,expires_at) values('stream',?,?) on conflict(id) do update set owner=excluded.owner,expires_at=excluded.expires_at where attendance_leases.expires_at<? or attendance_leases.owner=?").run(owner,new Date(clock()+60000).toISOString(),at(),owner);return db.prepare("select owner from attendance_leases where id='stream'").get()?.owner===owner;}
 function disconnected(code='DISCONNECTED'){
  const previous=coordinator.state('stream')||{};
  status({connected:false,disconnectedAt:previous.disconnectedAt||at(),error:code});
  nextAt=clock()+Math.min(60000,1000*2**Math.min(++attempts,6));
 }
 function close(code){const s=socket;socket=null;if(s){
  s.onclose=null;s.onerror=null;s.onmessage=null;s.onopen=null;
  try{if(s.removeAllListeners){s.removeAllListeners();s.on('error',()=>{});}if(s.terminate)s.terminate();else s.close();}catch{}
 }if(code)disconnected(code);}
 async function handle(frame){
  const h=frame.headers||frame.header||{};
  if(frame.type==='SYSTEM'){
   if(h.topic==='disconnect'){close('SERVER_DISCONNECT');return;}
   if(h.topic==='ping')socket?.send(JSON.stringify(streamReply(frame)));
   return;
  }
  if(frame.type!=='EVENT')return;
  try{coordinator.receive(frame);socket?.send(JSON.stringify(streamReply(frame)));status({lastEventAt:at()});}
  catch{socket?.send(JSON.stringify(streamReply(frame,false)));status({error:'EVENT_PERSIST_OR_SCOPE'});}
 }
 async function tick(){
  if(stopped||!config.eventsEnabled||connecting)return;
  if(!lease()){close();return;}
  if(socket){
   if(clock()-lastTraffic>90000)close('HEARTBEAT_TIMEOUT');
   else{if(socket.readyState===1&&typeof socket.ping==='function'&&clock()-lastPing>=30000){lastPing=clock();socket.ping();}status({leaseAt:at()});}
   return;
  }
  if(clock()<nextAt)return;
  connecting=true;
  try{
   if(!config.corpId||!config.unifiedAppId)throw Error('EVENT_SCOPE_CONFIG');
   await beforeRequest({source:'stream',endpoint:'/v1.0/gateway/connections/open',retry:attempts>0});
   const response=await fetchImpl('https://api.dingtalk.com/v1.0/gateway/connections/open',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({clientId:config.appKey,clientSecret:config.appSecret,subscriptions:[{type:'EVENT',topic:'*'}],ua:'muc-attendance/1.0'}),signal:AbortSignal.timeout(25000)});
   if(!response.ok)throw Error('STREAM_HTTP_'+response.status);
   const data=await response.json();
   if(stopped||db.prepare("select owner from attendance_leases where id='stream'").get()?.owner!==owner)return;
   const url=new URL(data.endpoint);
   if(url.protocol!=='wss:'||!url.hostname.endsWith('.dingtalk.com')||!data.ticket)throw Error('STREAM_ENDPOINT');
   url.searchParams.set('ticket',data.ticket);
   const ws=new WebSocketImpl(url.toString());socket=ws;lastTraffic=clock();lastPing=clock();
   const alive=()=>{if(socket===ws){lastTraffic=clock();status({heartbeatAt:at()});}};
   ws.on?.('pong',alive);ws.on?.('ping',alive);
   ws.onopen=()=>{
    if(socket!==ws||stopped)return;
    const previous=coordinator.state('stream')||{};
    let since=previous.disconnectedAt||previous.heartbeatAt||null;
    const pending=coordinator.state('recoveryNeeded');
    if(pending)since=pending.since===null||since===null?null:(Date.parse(pending.since)<Date.parse(since)?pending.since:since);
    attempts=0;lastTraffic=clock();
    status({connected:true,connectedAt:at(),disconnectedAt:null,error:null,heartbeatAt:at()});
    // Even a first connection has no replay guarantee. Recovery is queued, not run here.
    coordinator.setState('recoveryNeeded',{since,reason:'Stream连接建立，需要补偿未证实覆盖期间'});
   };
   ws.onmessage=event=>{if(socket!==ws)return;lastTraffic=clock();status({lastMessageAt:at()});try{const result=handle(JSON.parse(String(event.data)));result.catch(()=>close('STREAM_HANDLER'));}catch{close('STREAM_SCHEMA');}};
   ws.onclose=()=>{if(socket===ws){socket=null;disconnected();}};
   ws.onerror=()=>{if(socket===ws)close('STREAM_NETWORK');};
  }catch(e){disconnected(/^STREAM_HTTP_\d+$|^EVENT_SCOPE_CONFIG$|^STREAM_ENDPOINT$/.test(e.message)?e.message:'STREAM_CONNECT');}
  finally{connecting=false;}
 }
 return {tick,handle,start(){if(timer)return;stopped=false;timer=setInterval(()=>tick().catch(()=>{}),10000);timer.unref();tick().catch(()=>{});},stop(){stopped=true;clearInterval(timer);timer=null;if(db.prepare("select owner from attendance_leases where id='stream'").get()?.owner===owner)status({connected:false,disconnectedAt:at()});close();db.prepare("delete from attendance_leases where id='stream' and owner=?").run(owner);}};
}
