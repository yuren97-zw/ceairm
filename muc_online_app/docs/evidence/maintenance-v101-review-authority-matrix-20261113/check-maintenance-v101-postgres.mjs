// A new disposable PG16 cluster only. No existing cluster or application data is read.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import net from 'node:net';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import assert from 'node:assert/strict';
import {postgresFingerprint} from './maintenance-postgres-fingerprint.mjs';
const [bin,mode,fixture]=process.argv.slice(2),concurrencyFixture=mode==='--concurrency-from-fixture',fixtureOnly=mode==='--restore-from-fixture'||concurrencyFixture,restore=mode==='--restore'||fixtureOnly,port=15432,root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!bin||!path.isAbsolute(bin)||process.argv.length>5||mode&&!restore||fixtureOnly!==Boolean(fixture)||fixture&&!path.isAbsolute(fixture))throw Error('Usage: node scripts/check-maintenance-v101-postgres.mjs ABSOLUTE_PG16_BIN [--restore | --restore-from-fixture PRIVATE_TEST_DUMP | --concurrency-from-fixture PRIVATE_TEST_DUMP]');
if(fixtureOnly){
  const stat=await fs.lstat(fixture),parent=path.dirname(fixture),meta=JSON.parse(await fs.readFile(path.join(parent,'summary.json'),'utf8'));
  if(!stat.isFile()||stat.nlink!==1||stat.mode&0o077||stat.uid!==process.getuid()||path.basename(fixture)!=='snapshot.dump'||!/^muc-v101-pg16-[A-Za-z0-9]+$/.test(path.basename(parent))||path.dirname(await fs.realpath(parent))!==await fs.realpath(os.tmpdir())||meta.serverTests!==true||meta.stopped!==true)throw Error('Only a private completed synthetic verifier snapshot may be reused');
}
const version=execFileSync(path.join(bin,'postgres'),['--version'],{encoding:'utf8'}).trim();if(!/^postgres \(PostgreSQL\) 16\./.test(version))throw Error('PostgreSQL 16 required');
const state=await fs.mkdtemp(path.join(os.tmpdir(),'muc-v101-pg16-'));await fs.chmod(state,0o700);
const data=path.join(state,'data'),adminPassword=crypto.randomBytes(32).toString('base64url'),password=crypto.randomBytes(32).toString('base64url');
const databaseUrl=`postgresql://muc_v101_app:${password}@127.0.0.1:${port}/muc_v101_qa`;
const secrets=[databaseUrl,password,adminPassword];
const redact=value=>secrets.reduce((text,secret)=>text.replaceAll(secret,'[redacted]'),String(value));
const safeEnv=Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TZ','TMPDIR'].filter(key=>typeof process.env[key]==='string').map(key=>[key,process.env[key]]));
const env={...safeEnv,NODE_ENV:'test',DATABASE_URL:databaseUrl,PGSSLMODE:'disable',MUC_NO_LISTEN:'1',MUC_MAINTENANCE_COORDINATOR_ENABLED:'1',DB_PATH:path.join(state,'unused.sqlite'),UPLOAD_DIR:path.join(state,'uploads'),ATTENDANCE_SYNC_ENABLED:'false',ATTENDANCE_WORKER_ENABLED:'false',ATTENDANCE_EVENTS_ENABLED:'false',ATTENDANCE_APPROVAL_PLANS_ENABLED:'false',ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED:'false',ATTENDANCE_VALIDATION_ENABLED:'false',ATTENDANCE_MANUAL_ONLY:'true',ATTENDANCE_ENV_FILE:''};
let started=false;const summary={version,isolatedState:state,port,fixtureOnly,coordinatorEnabled:env.MUC_MAINTENANCE_COORDINATOR_ENABLED==='1',populatedLegacyRefused:false,upgrade:false,repeatedMigration:false,serverTests:false,restore:null,stopped:false};
async function run(name,args,expectedRefusal='',environment=env){
  const child=spawn(process.execPath,args,{cwd:root,env:environment,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});const log=redact(output);await fs.writeFile(path.join(state,`${name}.log`),log,{mode:0o600});
  if(expectedRefusal){if(code===0||!log.includes(expectedRefusal))throw Error(`${name} did not refuse the populated legacy identity as required`);console.log(JSON.stringify({stage:name,passed:true,expectedRefusal:true,log:path.join(state,`${name}.log`)}));return log;}
  if(code!==0){process.stderr.write(log.slice(-8000));throw Error(`${name} failed (${code}); isolated log: ${path.join(state,`${name}.log`)}`);}
  console.log(JSON.stringify({stage:name,passed:true,log:path.join(state,`${name}.log`)}));return log;
}
try{
  const probe=net.createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
  const pw=path.join(state,'bootstrap-password');await fs.writeFile(pw,adminPassword,{mode:0o600,flag:'wx'});
  try{execFileSync(path.join(bin,'initdb'),['-D',data,'-U','muc_v101_admin','--auth=scram-sha-256',`--pwfile=${pw}`],{env:safeEnv,stdio:'pipe'});}finally{await fs.rm(pw,{force:true});}
  await fs.appendFile(path.join(data,'postgresql.conf'),`\nlisten_addresses='127.0.0.1'\nport=${port}\nunix_socket_directories=''\n`);
  await fs.writeFile(path.join(data,'pg_hba.conf'),"host postgres muc_v101_admin 127.0.0.1/32 scram-sha-256\nhost muc_v101_qa muc_v101_app 127.0.0.1/32 scram-sha-256\nhost muc_v101_restored muc_v101_restore 127.0.0.1/32 scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n",{mode:0o600});
  execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(state,'postgres.log'),'-w','start'],{env:safeEnv,stdio:'pipe'});started=true;
  const admin=new pg.Client({host:'127.0.0.1',port,database:'postgres',user:'muc_v101_admin',password:adminPassword});await admin.connect();
  try{await admin.query(`create role muc_v101_app login password '${password}' nosuperuser nocreatedb nocreaterole noreplication`);await admin.query('create database muc_v101_qa owner muc_v101_app');await admin.query('revoke connect on database muc_v101_qa from public');await admin.query('grant connect on database muc_v101_qa to muc_v101_app');}finally{await admin.end();}
  if(fixtureOnly){
    summary.fixtureSha256=crypto.createHash('sha256').update(await fs.readFile(fixture)).digest('hex');
    execFileSync(path.join(bin,'pg_restore'),['-h','127.0.0.1','-p',String(port),'-U','muc_v101_app','-d','muc_v101_qa','--exit-on-error','--no-owner','--no-acl',fixture],{env:{...safeEnv,PGPASSWORD:password},stdio:'pipe'});
  }else{
  const app=new pg.Client({connectionString:databaseUrl});await app.connect();
  try{const row=(await app.query('select rolsuper,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user')).rows[0];if(Object.values(row).some(Boolean))throw Error('Test role has excess privileges');await app.query(await fs.readFile(path.join(root,'migrations/001_init_postgres.sql'),'utf8'));await app.query("insert into settings(key,value,updated_at) values('v101_old_schema_probe','{\"preserved\":true}','2026-01-01T00:00:00Z')");
    await app.query("insert into maintenance_hour_results(id,owner_type,owner_id,assignment_id,user_id,user_name,hours,status,created_at,updated_at) values('v101_legacy_fixture','subtask','synthetic-task','synthetic-assignment','synthetic-account','隔离身份样例',1.5,'已确认','2026-01-01','2026-01-01')");
  }finally{await app.end();}
  await run('populated-legacy-refusal',['scripts/run-postgres-migrations.mjs'],'历史工时仍使用user_id');
  const legacy=new pg.Client({connectionString:databaseUrl});await legacy.connect();try{
    const rows=(await legacy.query("select user_id,hours from maintenance_hour_results where id='v101_legacy_fixture'")).rows;
    if(rows.length!==1||rows[0].user_id!=='synthetic-account'||Number(rows[0].hours)!==1.5)throw Error('Refused migration changed legacy identity or hours');
    if((await legacy.query("select 1 from schema_migrations where version='040_nonroutine_adjustments.sql'")).rowCount)throw Error('Refused migration recorded a successful receipt');
    await legacy.query("delete from maintenance_hour_results where id='v101_legacy_fixture'");summary.populatedLegacyRefused=true;
  }finally{await legacy.end();}
  await run('upgrade',['scripts/run-postgres-migrations.mjs']);summary.upgrade=true;
  await run('migration-replay',['scripts/run-postgres-migrations.mjs']);summary.repeatedMigration=true;
  const check=new pg.Client({connectionString:databaseUrl});await check.connect();try{if(JSON.parse((await check.query("select value from settings where key='v101_old_schema_probe'")).rows[0].value).preserved!==true)throw Error('Upgrade changed the old-schema marker');}finally{await check.end();}
  await run('server-tests',['--test','tests/server.test.mjs']);summary.serverTests=true;
  }
  if(!fixtureOnly||concurrencyFixture){
  await run('prepare-before-concurrency',['scripts/check-maintenance-v101-restored.mjs','--prepare-fixture']);
  await run('multi-process-concurrency',['scripts/check-maintenance-v101-concurrency.mjs',state]);
  summary.concurrency=JSON.parse(await fs.readFile(path.join(state,'concurrency-proof.json'),'utf8'));
  }
  if(restore){
    await run('prepare-synthetic-fixture',['scripts/check-maintenance-v101-restored.mjs','--prepare-fixture']);
    const source=new pg.Client({connectionString:databaseUrl}),admin=new pg.Client({host:'127.0.0.1',port,database:'postgres',user:'muc_v101_admin',password:adminPassword});
    const restorePassword=crypto.randomBytes(32).toString('base64url'),restoredUrl=`postgresql://muc_v101_restore:${restorePassword}@127.0.0.1:${port}/muc_v101_restored`,dump=path.join(state,'snapshot.dump');
    secrets.push(restoredUrl,restorePassword);
    let roleCreated=false,databaseCreated=false;await source.connect();await admin.connect();
    try{
      assert.equal(await fs.realpath((await admin.query('show data_directory')).rows[0].data_directory),await fs.realpath(data));
      const before=await postgresFingerprint(source);
      execFileSync(path.join(bin,'pg_dump'),['-h','127.0.0.1','-p',String(port),'-U','muc_v101_app','-d','muc_v101_qa','-Fc','--no-owner','--no-acl','-f',dump],{env:{...safeEnv,PGPASSWORD:password},stdio:'pipe'});await fs.chmod(dump,0o600);
      await admin.query(`create role muc_v101_restore login password '${restorePassword}' nosuperuser nocreatedb nocreaterole noreplication`);roleCreated=true;
      await admin.query('create database muc_v101_restored owner muc_v101_restore');databaseCreated=true;await admin.query('revoke connect on database muc_v101_restored from public');await admin.query('grant connect on database muc_v101_restored to muc_v101_restore');
      execFileSync(path.join(bin,'pg_restore'),['-h','127.0.0.1','-p',String(port),'-U','muc_v101_restore','-d','muc_v101_restored','--exit-on-error','--no-owner','--no-acl',dump],{env:{...safeEnv,PGPASSWORD:restorePassword},stdio:'pipe'});
      const restored=new pg.Client({connectionString:restoredUrl});await restored.connect();try{
        assert.deepEqual(await postgresFingerprint(restored),before,'Restored rows, indexes, constraints and views must match');
        await restored.query('begin');try{
          await restored.query('savepoint duplicate_probe');let rejected=false;
          try{await restored.query("insert into maintenance_nonroutine_role_results select id||'_duplicate_probe',result_id,case_id,approved_revision,source_assignment_id,person_id,role,hours,source_json,created_at from maintenance_nonroutine_role_results limit 1");}catch(error){rejected=error.code==='23505';}
          await restored.query('rollback to savepoint duplicate_probe');assert.ok(rejected,'Recovered role uniqueness must reject duplicate accounting facts');
          const parent=(await restored.query('select result_id from maintenance_nonroutine_role_results order by id limit 1')).rows[0];assert.ok(parent,'Recovered fixture must contain actual role children');
          await restored.query('delete from maintenance_hour_results where id=$1',[parent.result_id]);assert.equal((await restored.query('select count(*) n from maintenance_nonroutine_role_results where result_id=$1',[parent.result_id])).rows[0].n,'0');
        }finally{await restored.query('rollback');}
        assert.deepEqual(await postgresFingerprint(restored),before,'Constraint probes must roll back without changing recovered data');
      }finally{await restored.end();}
      await run('restored-application',['scripts/check-maintenance-v101-restored.mjs'],'',{...env,DATABASE_URL:restoredUrl,UPLOAD_DIR:path.join(state,'restored-uploads')});
      assert.deepEqual(await postgresFingerprint(source),before,'Backup and recovery must not change the source test database');
      summary.restore={tables:Object.keys(before.tables).length,rows:Object.values(before.tables).reduce((sum,item)=>sum+item.rows,0),dataEqual:true,indexesEqual:true,constraintsEqual:true,viewsEqual:true,functionsEqual:true,triggersEqual:true,sequencesEqual:true,sourceUnchanged:true,uniquenessEnforced:true,cascadeRollback:true,closedChannelReplay:true,snapshotSha256:crypto.createHash('sha256').update(await fs.readFile(dump)).digest('hex')};
      await fs.writeFile(path.join(state,'restore-proof.json'),JSON.stringify({proof:summary.restore,fingerprint:before},null,2),{mode:0o600});console.log(JSON.stringify({stage:'restore',passed:true,proof:path.join(state,'restore-proof.json')}));
    }finally{await source.end();if(databaseCreated)await admin.query('drop database muc_v101_restored with (force)');if(roleCreated)await admin.query('drop role muc_v101_restore');await admin.end();}
  }
}catch(error){process.exitCode=1;summary.error=redact(error.message);process.stderr.write(summary.error+'\n');}
finally{
  if(started){try{execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{env:safeEnv,stdio:'pipe'});summary.stopped=true;}catch(error){process.exitCode=1;summary.stopError=redact(error.message);}}
  await fs.writeFile(path.join(state,'summary.json'),JSON.stringify(summary,null,2),{mode:0o600});console.log(JSON.stringify(summary));
}
