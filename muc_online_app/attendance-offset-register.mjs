import fs from 'node:fs';
import {resolveOffsetFacts} from './attendance-offset-facts.mjs';

// Called explicitly by internal reconciliation; reading a page never writes this register.
export function createOffsetRegister({db,clock=Date.now}) {
  db.exec(fs.readFileSync(new URL('./migrations/032_attendance_offsets.sql',import.meta.url),'utf8'));
  return {
    reconcile(personId,input,sourceReadAt,{withinTransaction=false}={}){
      const facts=resolveOffsetFacts(personId,input,{now:clock(),sourceReadAt});
      if(facts.eligibility==='unresolved')return facts;
      if(!withinTransaction)db.exec('begin immediate');
      try {
        const previous=db.prepare('select * from attendance_offset_events where person_id=? and work_date=?').all(personId,input.date);
        const ids=new Set(facts.items.map(i=>i.eventId));
        const changed=facts.items.some(item=>!previous.some(old=>old.id===item.eventId&&old.active&&old.evidence_hash===item.evidenceHash))||previous.some(old=>old.active&&!ids.has(old.id));
        const at=new Date(clock()).toISOString();
        for(const item of facts.items){
          const old=previous.find(r=>r.id===item.eventId);
          if(old?.active && old.evidence_hash===item.evidenceHash)continue;
          db.prepare('insert into attendance_offset_events(id,person_id,work_date,kind,planned,evidence_json,evidence_hash,revision,active,updated_at) values(?,?,?,?,?,?,?,?,1,?) on conflict(id) do update set planned=excluded.planned,evidence_json=excluded.evidence_json,evidence_hash=excluded.evidence_hash,revision=attendance_offset_events.revision+1,active=1,updated_at=excluded.updated_at').run(item.eventId,personId,input.date,item.type,String(item.planned),JSON.stringify(item.evidence),item.evidenceHash,1,at);
        }
        for(const old of previous)if(old.active&&!ids.has(old.id))db.prepare('update attendance_offset_events set active=0,revision=revision+1,updated_at=? where id=? and active=1').run(at,old.id);
        const retired=previous.filter(r=>r.active&&!ids.has(r.id));
        const added=facts.items.filter(i=>!previous.some(r=>r.id===i.eventId));
        for(const old of retired){const replacements=added.filter(i=>i.type===old.kind);if(replacements.length===1&&retired.filter(r=>r.kind===old.kind).length===1)db.prepare('insert into attendance_offset_event_links values(?,?,?,?) on conflict(old_id,new_id) do nothing').run(old.id,replacements[0].eventId,'同一工作日唯一同类型计划点变更，抵消不自动继承',at);}
        db.prepare('insert into attendance_offset_event_history(event_id,revision,evidence_json,evidence_hash,active,recorded_at) select id,revision,evidence_json,evidence_hash,active,updated_at from attendance_offset_events where person_id=? and work_date=? on conflict(event_id,revision) do nothing').run(personId,input.date);
        if(!withinTransaction)db.exec('commit');return {...facts,changed};
      }catch(error){if(!withinTransaction)db.exec('rollback');throw error;}
    },
    responsibility(personId,workDate){
      const row=db.prepare('select * from attendance_shift_responsibilities where person_id=? and work_date=?').get(personId,workDate);
      return row?{status:'verified',...row}:{status:'unresolved',reason:'当班实际负责人待授权核实'};
    }
  };
}
