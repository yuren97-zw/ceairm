import test from 'node:test';
import assert from 'node:assert/strict';
import {handoverDays,handoverEnd} from '../deployment-handover.mjs';
test('inclusive handover dates, leap years and year rollover',()=>{
  assert.equal(handoverEnd('2026-11-10'), '2026-11-10');
  assert.equal(handoverEnd('2026-11-10',2), '2026-11-11');
  assert.equal(handoverEnd('2026-11-10',3), '2026-11-12');
  assert.equal(handoverEnd('2028-02-28',3), '2028-03-01');
  assert.equal(handoverEnd('2026-12-31',3), '2027-01-02');
  for(const n of [0,4,1.5,'',null,'abc'])assert.throws(()=>handoverDays(n));
  assert.throws(()=>handoverEnd('2026-02-30',1));
});
