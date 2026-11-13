// One stream per signed-in visible tab; ordinary HTTP remains the source of authority.
export function createActionTaskRealtimeClient({url,getIdentity,refresh,onAccessRevoked=()=>{},EventSourceClass=globalThis.EventSource,document:doc=globalThis.document,window:win=globalThis.window,clock=Date.now,setTimeout:later=globalThis.setTimeout,clearTimeout:cancel=globalThis.clearTimeout,setInterval:repeat=globalThis.setInterval,clearInterval:cancelRepeat=globalThis.clearInterval,random=Math.random}){
 let source=null,identity=null,epoch=0,connected=false,retry=null,timer=null,queued=null,busy=null,again=false,failed=false,delay=3000,lastSignal=0;
 const active=()=>!!getIdentity()&&!doc?.hidden;
 function stop(){epoch++;source?.close();source=null;connected=false;identity=null;cancel(retry);cancel(queued);cancelRepeat(timer);retry=queued=timer=null;again=false;failed=false;}
 async function read(){
  if(!active())return;const account=getIdentity(),generation=epoch;
  if(busy?.epoch===generation){again=true;return;}
  const token={epoch:generation};busy=token;
  try{const result=await refresh(()=>generation===epoch&&account===getIdentity());if(generation===epoch&&account===getIdentity())failed=result===false;}
  catch(error){if(generation===epoch)failed=true;if(generation===epoch&&account===getIdentity()&&[401,403].includes(error.status)){stop();onAccessRevoked();}}
  finally{if(busy===token){busy=null;if(again&&generation===epoch){again=false;queue();}}}
 }
 function queue(){if(queued!==null||!active())return;queued=later(()=>{queued=null;read();},60);}
 function broken(){
  source?.close();source=null;connected=false;
  if(!active()||retry!==null)return;
  retry=later(()=>{retry=null;start();},delay+random()*1000);delay=Math.min(delay*2,60000);
 }
 function start(){
  if(!active()){stop();return;}
  const account=getIdentity();
  if(identity!==account){stop();identity=account;delay=3000;}
  if(timer===null)timer=repeat(()=>{if(!active()){stop();return;}if(connected&&clock()-lastSignal>65000)broken();if(!connected||failed)queue();},30000);
  if(source||retry!==null)return;
  if(typeof EventSourceClass!=='function'){queue();return;}
  const current=source=new EventSourceClass(url),generation=epoch;
  const valid=()=>source===current&&generation===epoch&&identity===getIdentity();
  current.onopen=()=>{if(!valid())return;connected=true;lastSignal=clock();delay=3000;queue();};
  current.addEventListener('tasks',()=>{if(!valid())return;lastSignal=clock();queue();});
  current.addEventListener('ping',()=>{if(valid())lastSignal=clock();});
  current.addEventListener('access-revoked',()=>{if(valid()){stop();onAccessRevoked();}});
  current.onerror=()=>{if(valid())broken();};
 }
 const visible=()=>{if(doc?.hidden)stop();else{start();queue();}};
 const online=()=>{stop();start();queue();};
 doc?.addEventListener('visibilitychange',visible);win?.addEventListener('online',online);
 return {start,stop,refresh:queue,get connected(){return connected&&identity===getIdentity();},destroy(){stop();doc?.removeEventListener('visibilitychange',visible);win?.removeEventListener('online',online);}};
}
