import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import pg from 'pg';import assert from 'node:assert/strict';
import {readIntegrationConfig} from '../integration-runtime.mjs';
const config=readIntegrationConfig(process.env.MUC_INTEGRATION_CONFIG),state=path.dirname(process.env.MUC_INTEGRATION_CONFIG),adminFile=path.join(state,'admin.json');
const stat=await fs.lstat(adminFile);if(!stat.isFile()||stat.nlink!==1||(stat.mode&0o077))throw Error('Unsafe private administrator configuration');
const admin=new pg.Client(JSON.parse(await fs.readFile(adminFile,'utf8')));await admin.connect();
const password=crypto.randomBytes(32).toString('base64url'),roleName='ceairm_restore_probe',databaseName='ceairm_integration_restore';let role=false,database=false;
const root=await fs.mkdtemp(path.join(state,'restore-proof-')),dump=path.join(root,'snapshot.dump');
const source=new pg.Client({connectionString:config.databaseUrl});await source.connect();
async function fingerprint(client){
 const tables=(await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(x=>x.tablename),result={};
 for(const table of tables){const name='"'+table.replaceAll('"','""')+'"';const rows=(await client.query(`select to_jsonb(t)::text as value from public.${name} t order by to_jsonb(t)::text`)).rows;result[table]={rows:rows.length,sha256:crypto.createHash('sha256').update(rows.map(r=>r.value).join('\n')).digest('hex')};}
 const definitions=(await client.query("select indexname,indexdef from pg_indexes where schemaname='public' order by indexname")).rows;
 const constraints=(await client.query("select c.conname,pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_namespace n on c.connamespace=n.oid where n.nspname='public' order by c.conname,definition")).rows;
 return {tables:result,indexes:definitions,constraints};
}
try{
 if((await admin.query('show data_directory')).rows[0].data_directory!==config.data)throw Error('Cluster identity mismatch');
 const hba=path.join(config.data,'pg_hba.conf'),line=`host ${databaseName} ${roleName} 127.0.0.1/32 scram-sha-256`,text=await fs.readFile(hba,'utf8');
 if(!text.includes(line)){await fs.writeFile(hba,line+'\n'+text,{mode:0o600});await admin.query('select pg_reload_conf()');}
 const before=await fingerprint(source),url=new URL(config.databaseUrl),safe={PATH:process.env.PATH,HOME:process.env.HOME,PGPASSWORD:decodeURIComponent(url.password)};
 execFileSync(path.join(config.bin,'pg_dump'),['-h','127.0.0.1','-p','55432','-U',decodeURIComponent(url.username),'-d','ceairm_integration','-Fc','--no-owner','--no-acl','-f',dump],{env:safe,stdio:'pipe'});await fs.chmod(dump,0o600);
 await admin.query(`create role ${roleName} login password '${password}' nosuperuser nocreatedb nocreaterole`);role=true;
 await admin.query(`create database ${databaseName} owner ${roleName}`);database=true;
 await admin.query(`revoke connect on database ${databaseName} from public`);await admin.query(`grant connect on database ${databaseName} to ${roleName}`);
 execFileSync(path.join(config.bin,'pg_restore'),['-h','127.0.0.1','-p','55432','-U',roleName,'-d',databaseName,'--exit-on-error','--no-owner','--no-acl',dump],{env:{...safe,PGPASSWORD:password},stdio:'pipe'});
 const restored=new pg.Client({host:'127.0.0.1',port:55432,user:roleName,password,database:databaseName});await restored.connect();let after;try{after=await fingerprint(restored);}finally{await restored.end();}
 assert.deepEqual(after,before,'Restored rows, constraints and indexes must match');
 assert.deepEqual(await fingerprint(source),before,'Source database must remain unchanged');
 const proof={tables:Object.keys(before.tables).length,rows:Object.values(before.tables).reduce((n,t)=>n+t.rows,0),sourceUnchanged:true,restoredEqual:true,temporaryDatabaseRemovedOnExit:true,snapshotSha256:crypto.createHash('sha256').update(await fs.readFile(dump)).digest('hex')};
 await fs.writeFile(path.join(root,'proof.json'),JSON.stringify(proof,null,2),{mode:0o600});console.log(JSON.stringify({...proof,proofDirectory:root}));
}finally{await source.end();if(database)await admin.query(`drop database ${databaseName} with (force)`);if(role)await admin.query(`drop role ${roleName}`);await admin.end();}
