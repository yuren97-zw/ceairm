
test('probe legacy nonroutine save retains formal dispatch',async()=>{
 const login=await request('/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=String(login.res.headers['Set-Cookie']).split(';')[0],personId=login.payload.user.personId;
 const peer=createMaintenanceTestAccount(db.prepare("select * from users where id='54002010'").get(),{id:'probe-nonroutine-peer',name:'非例行草稿边界'});
 const call=async(path,method='GET',body)=>{const r=await request(path,{method,cookie,body});assert.ok(r.res.statusCode>=200&&r.res.statusCode<300,JSON.stringify(r.payload));return r.payload;};
 const made=(await call('/api/maintenance/flights','POST',{date:'2026-11-14',flightNo:'NR-DRAFT-PROBE',aircraftNo:'B-NRPROBE',aircraftType:'A320',workKind:'停场'})).flight,base=`/api/maintenance/flights/${made.id}`;
 await call(base+'/dispatch','POST',{expectedUpdatedAt:made.updatedAt,assignments:[{role:'放行',personId}]});
 const item={temporary:true,title:'既有未提报单项',category:'其他',standardHours:2,entries:[{role:'主做',personId}]};
 await call(base+'/reports/nonroutine','PUT',{mode:'save',items:[item],revision:(await call(base+'/reports')).report.nonroutine.revision});
 const formal=db.prepare('select * from maintenance_subtasks where flight_id=?').get(made.id);assert.ok(formal);
 const rows=()=>db.prepare('select * from maintenance_assignments where flight_id=? order by id').all(made.id),before=rows();
 await call(base+'/reports/nonroutine','PUT',{mode:'save',items:[{...item,temporary:false,id:formal.id,entries:[{role:'主做',personId:peer.personId}]}],revision:(await call(base+'/reports')).report.nonroutine.revision});
 assert.deepEqual(rows(),before,'NONROUTINE_DRAFT_MUST_NOT_REPLACE_FORMAL_DISPATCH');
});
