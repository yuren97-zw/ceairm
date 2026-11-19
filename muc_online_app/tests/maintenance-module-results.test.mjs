import test from 'node:test';
import assert from 'node:assert/strict';
import {MAINTENANCE_RESULT_TYPES,maintenanceModuleResultReference as reference} from '../maintenance-module-results.mjs';
test('each non-settlement result keeps its own source and cannot invent a zero-valued ledger record',()=>{
 for(const resultType of MAINTENANCE_RESULT_TYPES.filter(type=>!['HOUR','RELEASE_COUNT'].includes(type))){
  const definition={resultType},source={type:resultType,sourceId:'original-result',sourceVersion:1};assert.deepEqual(reference(definition,source),source);
  for(const field of ['hours','sorties','amount','ledgerEntryId','unit','category'])assert.throws(()=>reference(definition,{...source,[field]:0}),TypeError);
  assert.equal(reference(definition,null),null);
 }
});
test('hour and release references use separate dimensions and reject forged types or missing versions',()=>{
 const hour={resultType:'HOUR',category:'NONROUTINE'},source={type:'HOUR',sourceId:'batch',sourceVersion:0,category:'NONROUTINE'};assert.deepEqual(reference(hour,source),source);
 assert.throws(()=>reference(hour,{...source,category:'ROUTINE'}),TypeError);assert.throws(()=>reference(hour,{...source,sourceVersion:undefined}),TypeError);
 const release={resultType:'RELEASE_COUNT'},flight={type:'RELEASE_COUNT',sourceId:'release',sourceVersion:1,unit:'架次'};assert.deepEqual(reference(release,flight),flight);assert.throws(()=>reference(release,{...flight,type:'HOUR'}),TypeError);
});
