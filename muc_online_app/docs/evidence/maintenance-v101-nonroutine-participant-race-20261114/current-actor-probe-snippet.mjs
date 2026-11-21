
test('probe nonroutine save rejects actor disabled after entering request',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),rootCookie=String(login.res.headers['Set-Cookie']).split(';')[0];
 const actor=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'nr-current-actor-probe',name:'非例行资格竞争'});
 const created=await request('/api/maintenance/flights',{method:'POST',cookie:rootCookie,body:{date:'2026-11-14',flightNo:'NR-ACTOR-PROBE',aircraftNo:'B-NRACTOR',aircraftType:'A320',workKind:'停场'}});assert.equal(created.res.statusCode,201);const flight=created.payload.flight,base=`/api/maintenance/flights/${flight.id}`;
 assert.equal((await request(base+'/dispatch',{method:'POST',cookie:rootCookie,body:{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId:actor.personId}]}})).res.statusCode,200);
 const signed=await request('/api/login',{method:'POST',body:{username:actor.username,password:'muc2026'}}),cookie=String(signed.res.headers['Set-Cookie']).split(';')[0],original=db.exec.bind(db);let injected=false;
 db.exec=sql=>{if(!injected&&/^begin immediate$/i.test(sql.trim())){injected=true;db.prepare("update users set status='inactive' where id=?").run(actor.id);}return original(sql);};
 try{const saved=await request(base+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'save',items:[{temporary:true,title:'等待期间资格失效',category:'其他',standardHours:2,entries:[{role:'主做',personId:actor.personId}]}]}});assert.equal(injected,true);assert.equal(saved.res.statusCode,403,'CURRENT_NONROUTINE_ACTOR_MUST_BE_RECHECKED');}finally{db.exec=original;}
});
