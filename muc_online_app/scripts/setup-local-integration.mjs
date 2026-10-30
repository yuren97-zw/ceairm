// Creates a fresh dedicated cluster only. Never resets or adopts an existing cluster.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
const [bin,state]=process.argv.slice(2);
if(!bin||!state||!path.isAbsolute(bin)||!path.isAbsolute(state)||process.argv.length!==4)throw Error('Usage: setup-local-integration.mjs ABSOLUTE_PG16_BIN ABSOLUTE_NEW_STATE');
if(!/^postgres \(PostgreSQL\) 16\./.test(execFileSync(path.join(bin,'postgres'),['--version'],{encoding:'utf8'})))throw Error('PostgreSQL 16 required');
await fs.mkdir(state,{mode:0o700}); // EEXIST is intentional: never overwrite credentials or databases.
const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(55432,'127.0.0.1',()=>server.close(resolve));});
const password=crypto.randomBytes(32).toString('base64url'),appPassword=crypto.randomBytes(32).toString('base64url');
const pwfile=path.join(state,'bootstrap-password'),data=path.join(state,'pgdata');
await fs.writeFile(pwfile,password,{mode:0o600,flag:'wx'});
execFileSync(path.join(bin,'initdb'),['-D',data,'-U','ceairm_local_admin','--auth=scram-sha-256','--pwfile='+pwfile],{stdio:'ignore'});
await fs.unlink(pwfile);
await fs.appendFile(path.join(data,'postgresql.conf'),"\nlisten_addresses='127.0.0.1'\nport=55432\nunix_socket_directories=''\n");
await fs.writeFile(path.join(data,'pg_hba.conf'),"host postgres ceairm_local_admin 127.0.0.1/32 scram-sha-256\nhost ceairm_integration ceairm_integration_app 127.0.0.1/32 scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n",{mode:0o600});
execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(state,'postgres.log'),'-w','start'],{stdio:'ignore'});
const admin=new pg.Client({host:'127.0.0.1',port:55432,database:'postgres',user:'ceairm_local_admin',password});
await admin.connect();
try {
 await admin.query(`create role ceairm_integration_app login password '${appPassword}' nosuperuser nocreatedb nocreaterole noreplication`);
 await admin.query('create database ceairm_integration owner ceairm_integration_app');
 for(const name of ['postgres','template1','ceairm_integration'])await admin.query(`revoke connect on database ${name} from public`);
 await admin.query('grant connect on database ceairm_integration to ceairm_integration_app');
}finally{await admin.end();}
const databaseUrl=`postgresql://ceairm_integration_app:${appPassword}@127.0.0.1:55432/ceairm_integration`;
await fs.writeFile(path.join(state,'config.json'),JSON.stringify({databaseUrl,bin,data,adminPassword:crypto.randomBytes(32).toString('base64url')}),{mode:0o600,flag:'wx'});
await fs.writeFile(path.join(state,'admin.json'),JSON.stringify({host:'127.0.0.1',port:55432,database:'postgres',user:'ceairm_local_admin',password}),{mode:0o600,flag:'wx'});
const app=new pg.Client({connectionString:databaseUrl});await app.connect();
try {
 const role=(await app.query('select rolsuper,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user')).rows[0];
 if(Object.values(role).some(Boolean))throw Error('Integration role has excess privileges');
 for(const sql of ['create database ceairm_forbidden_probe','create role ceairm_forbidden_probe']){let denied=false;try{await app.query(sql);}catch(e){denied=e.code==='42501';}if(!denied)throw Error('Privilege denial probe failed');}
}finally{await app.end();}
for(const changes of [{database:'postgres'},{user:'unknown_integration_user'},{password:'incorrect-test-password'}]){
 const probe=new pg.Client({host:'127.0.0.1',port:55432,database:'ceairm_integration',user:'ceairm_integration_app',password:appPassword,...changes});
 let denied=false;try{await probe.connect();}catch{denied=true;}finally{await probe.end().catch(()=>{});}if(!denied)throw Error('Authentication isolation probe failed');
}
console.log('Dedicated PostgreSQL16 ready; identity, authentication and privilege denial verified. Credentials remain in private config.json.');
