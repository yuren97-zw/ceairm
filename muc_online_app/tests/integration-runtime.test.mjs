import test from 'node:test';import assert from 'node:assert/strict';
import {integrationDatabase,integrationEnvironment} from '../integration-runtime.mjs';
import {localSessionCookieName} from '../local-development.mjs';
const databaseUrl='postgresql://test:test@127.0.0.1:55432/ceairm_integration';
test('integration identity rejects other hosts, databases, ports and URL options',()=>{
 assert.ok(integrationDatabase(databaseUrl));
 for(const value of [databaseUrl.replace('127.0.0.1','production'),databaseUrl.replace('55432','5432'),databaseUrl.replace('ceairm_integration','postgres'),databaseUrl+'?options=unsafe'])assert.throws(()=>integrationDatabase(value));
 assert.ok(integrationDatabase('postgresql://test:test@127.0.0.1:5432/airline_operations',{ci:true}));
});
test('integration process cannot inherit real workers, credentials, loaders or production cookies',()=>{
 const env=integrationEnvironment({databaseUrl,root:'/private/tmp/test',sha:'a'.repeat(40),ambient:{DATABASE_URL:'remote',NODE_OPTIONS:'--require bad',COS_SECRET_KEY:'bad',DINGTALK_APP_SECRET:'bad',ATTENDANCE_WORKER_ENABLED:'true'}});
 for(const key of ['COS_SECRET_KEY','DINGTALK_APP_SECRET','NODE_OPTIONS'])assert.equal(env[key],undefined);
 for(const key of ['ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED'])assert.equal(env[key],'false');
 assert.equal(env.HOST,'127.0.0.1');assert.equal(env.PORT,'8800');assert.equal(localSessionCookieName('/tmp/test',env),'muc_integration_sid');
 assert.throws(()=>integrationEnvironment({databaseUrl,root:'/tmp/test',sha:'a'.repeat(40),port:8788}));
});
