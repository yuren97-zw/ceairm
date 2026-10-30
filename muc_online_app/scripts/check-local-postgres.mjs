import {readIntegrationConfig} from '../integration-runtime.mjs';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
const config=readIntegrationConfig(process.env.MUC_INTEGRATION_CONFIG),mode=process.argv[2];
if(!['attendance','server'].includes(mode))throw Error('Choose attendance or server');
const safe={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,PGSSLMODE:'disable',ATTENDANCE_TEST_DATABASE:'true',DATABASE_URL:config.databaseUrl};
if(mode==='attendance'){
 const child=spawnSync(process.execPath,['scripts/attendance-postgres-check-isolated.mjs'],{env:safe,stdio:'inherit'});process.exitCode=child.status??1;
}else{
 // The SQL adapter introspects public explicitly. Use a separate disposable
 // database, not search_path isolation, for the full application's HTTP tests.
 const adminFile=path.join(path.dirname(process.env.MUC_INTEGRATION_CONFIG),'admin.json');
 const stat=await fs.lstat(adminFile);if(!stat.isFile()||stat.nlink!==1||(stat.mode&0o077))throw Error('Unsafe private admin configuration');
 const client=new pg.Client(JSON.parse(await fs.readFile(adminFile,'utf8')));await client.connect();
 const password=crypto.randomBytes(32).toString('base64url');let role=false,database=false;
 try{
  const directory=(await client.query('show data_directory')).rows[0].data_directory;if(directory!==config.data)throw Error('Cluster identity mismatch');
  const hba=path.join(config.data,'pg_hba.conf'),line='host ceairm_integration_http ceairm_http_probe 127.0.0.1/32 scram-sha-256';let text=await fs.readFile(hba,'utf8');
  if(!text.includes(line)){await fs.writeFile(hba,line+'\n'+text,{mode:0o600});await client.query('select pg_reload_conf()');}
  await client.query(`create role ceairm_http_probe login password '${password}' nosuperuser nocreatedb nocreaterole`);role=true;
  await client.query('create database ceairm_integration_http owner ceairm_http_probe');database=true;
  await client.query('revoke connect on database ceairm_integration_http from public');await client.query('grant connect on database ceairm_integration_http to ceairm_http_probe');
  const url=`postgresql://ceairm_http_probe:${password}@127.0.0.1:55432/ceairm_integration_http`;
  const env={...safe,DATABASE_URL:url};
  const migrate=spawnSync(process.execPath,['scripts/run-postgres-migrations.mjs'],{env,stdio:'inherit'});if(migrate.status!==0)throw Error('HTTP fixture migration failed');
  const child=spawnSync(process.execPath,['--test','tests/server.test.mjs'],{env,stdio:'inherit'});process.exitCode=child.status??1;
 }finally{
  if(database)await client.query('drop database ceairm_integration_http with (force)');
  if(role)await client.query('drop role ceairm_http_probe');await client.end();
 }
}
