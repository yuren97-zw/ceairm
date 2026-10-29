import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {postgresConnectionOptions} from '../postgres-connection.mjs';

// This gate is only for disposable CI/test databases, never an application DB.
assert.equal(process.env.ATTENDANCE_TEST_DATABASE,'true','Explicit test database approval required');
const url=new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Only loopback test databases are allowed');
const schema='attendance_test_'+crypto.randomBytes(8).toString('hex');
const client=new pg.Client(postgresConnectionOptions(url.href));
await client.connect();
try{
 await client.query(`create schema ${schema}`);
 const isolated=new URL(url);isolated.searchParams.set('options',`-c search_path=${schema}`);
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL('./attendance-postgres-check.mjs',import.meta.url))],{stdio:'inherit',env:{...process.env,DATABASE_URL:isolated.href}});
  child.once('error',reject);child.once('exit',(status,signal)=>signal?reject(Error('PostgreSQL check interrupted')):resolve(status));
 });
 assert.equal(code,0,'Isolated PostgreSQL attendance check failed');
}finally{
 try{await client.query(`drop schema if exists ${schema} cascade`);}finally{await client.end();}
}
