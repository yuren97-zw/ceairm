import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyMaintenancePackage} from '../scripts/check-maintenance-package.mjs';
test('artifact maintenance probe rejects production ports and non-CI use before making requests',async()=>{
 const old=[process.env.CI,process.env.ATTENDANCE_TEST_DATABASE];
 try{
  process.env.CI='true';process.env.ATTENDANCE_TEST_DATABASE='true';
  for(const origin of ['http://127.0.0.1:8788','http://127.0.0.1:8787','http://127.0.0.1:8792','http://127.0.0.1:5432','http://127.0.0.1:55432','https://example.com','http://127.0.0.1:18888/private','http://x:y@127.0.0.1:18888'])await assert.rejects(verifyMaintenancePackage({origin,cookie:'synthetic',personId:'synthetic'}),/ephemeral CI/);
  process.env.CI='false';await assert.rejects(verifyMaintenancePackage({origin:'http://127.0.0.1:18888',cookie:'synthetic',personId:'synthetic'}),/ephemeral CI/);
 }finally{for(const [i,k]of ['CI','ATTENDANCE_TEST_DATABASE'].entries()){if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}}
});
