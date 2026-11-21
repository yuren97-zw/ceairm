import test from 'node:test';
import assert from 'node:assert/strict';
import {reportParticipantSource} from '../maintenance-report-participant-source.mjs';
const fixture=()=>({batch:{id:'b',flight_id:'f',report_type:'routine',version:2,status:'已提报'},entries:[{id:'e',batch_id:'b',flight_id:'f',owner_type:'flight',owner_id:'f',role:'接机',person_id:'actual-person',user_name:'原报工姓名',team:'原报工班组',standard_hours:0}]});
test('report participant identity survives ordering and live personnel changes without depending on dispatch',()=>{
 const f=fixture(),original=structuredClone(f),first=reportParticipantSource(f);assert.equal(first.participants[0].personId,'actual-person');assert.equal(first.participants[0].standardHours,0);assert.deepEqual(f,original);
 f.entries.push({...f.entries[0],id:'e2',role:'勤务'});const two=reportParticipantSource(f);f.entries.reverse();assert.deepEqual(reportParticipantSource(f),two);assert.equal(two.participants.find(p=>p.entryId==='e').resultIdentity,first.participants[0].resultIdentity);
 assert.ok(Object.isFrozen(first)&&Object.isFrozen(first.participants)&&Object.isFrozen(first.participants[0]));assert.throws(()=>{first.participants[0].personId='dispatch-person';},TypeError);
 f.batch.version++;assert.notEqual(reportParticipantSource(f).participants.find(p=>p.entryId==='e').resultIdentity,first.participants[0].resultIdentity);
});
test('drafts cross-flight sources orphan owners and duplicate result identities cannot become reporting facts',()=>{
 for(const mutate of [f=>f.batch.status='预填',f=>f.batch.version=0,f=>f.entries[0].batch_id='other',f=>f.entries[0].flight_id='other',f=>f.entries[0].owner_id='other',f=>f.entries.push({...f.entries[0]}),f=>f.entries.push({...f.entries[0],id:'different-id'}),f=>f.entries[0].standard_hours='0']){const f=fixture();mutate(f);assert.throws(()=>reportParticipantSource(f),{status:409});}
 const f=fixture();f.batch.report_type='nonroutine';f.entries[0].owner_type='subtask';f.entries[0].owner_id='task';assert.throws(()=>reportParticipantSource(f),{status:409});f.subtasks=[{id:'task',flight_id:'other'}];assert.throws(()=>reportParticipantSource(f),{status:409});f.subtasks[0].flight_id='f';assert.equal(reportParticipantSource(f).participants[0].ownerId,'task');
});
test('zero missing and release-count sources stay distinct without manufacturing hours or participants',()=>{
 const f=fixture();f.entries[0].standard_hours=null;assert.equal(reportParticipantSource(f).participants[0].standardHours,null);f.entries=[];assert.equal(reportParticipantSource(f).participants.length,0);
 f.batch.report_type='release';assert.throws(()=>reportParticipantSource(f),{status:409});f.entries=[{...fixture().entries[0],role:'放行',standard_hours:0}];assert.equal(reportParticipantSource(f).participants[0].role,'放行');f.entries.push({...f.entries[0],id:'second',person_id:'another'});assert.throws(()=>reportParticipantSource(f),{status:409});
});
