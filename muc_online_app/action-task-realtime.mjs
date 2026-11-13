// Streams carry only invalidation signals; task contents stay behind authenticated HTTP reads.
export function createActionTaskRealtime({versions,snapshot,currentUser,clock=Date.now,heartbeatMs=25000,maxPerUser=5,onError=()=>{}}){
 const clients=new Set();let lastHeartbeat=0;
 const write=(client,event,data)=>{
  if(client.res.destroyed||client.res.writableEnded||client.res.writableLength>65536){client.res.end();clients.delete(client);return false;}
  client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);return true;
 };
 return {
  connect(req,res,user){
   if([...clients].filter(c=>c.user.id===user.id).length>=maxPerUser)return false;
   const recipientVersion=versions([user.id]).get(user.id)||0,revision=snapshot(user);
   res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'});
   const client={req,res,user,revision,version:recipientVersion};clients.add(client);res.on('close',()=>clients.delete(client));
   res.write('retry: 3000\n');write(client,'tasks',{kind:'connected'});return true;
  },
  pump(){
   if(!clients.size)return;
   try{
    const nextVersions=versions([...new Set([...clients].map(c=>c.user.id))]),heartbeat=clock()-lastHeartbeat>=heartbeatMs;
    const revisions=new Map();
    for(const client of [...clients]){
     const nextVersion=nextVersions.get(client.user.id)||0;if(nextVersion===client.version&&!heartbeat)continue;
     try{
      const user=currentUser(client.req);
      if(!user?.id||user.id!==client.user.id){write(client,'access-revoked',{});client.res.end();clients.delete(client);continue;}
      client.user=user;
      if(!revisions.has(user.id))revisions.set(user.id,snapshot(user));
      const revision=revisions.get(user.id);
      if(revision!==client.revision){if(write(client,'tasks',{kind:'changed'}))client.revision=revision;}
      else if(heartbeat)write(client,'ping',{});
      client.version=nextVersion;
     }catch(error){client.res.end();clients.delete(client);onError(error);}
    }
    if(heartbeat)lastHeartbeat=clock();
   }catch(error){onError(error);}
  },
  close(){for(const client of clients)client.res.end();clients.clear();},
  get size(){return clients.size;}
 };
}
