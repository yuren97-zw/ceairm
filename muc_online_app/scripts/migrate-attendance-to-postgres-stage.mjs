// Isolated rehearsal only. Never a production/incremental merge command.
import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import pg from 'pg';
import {fileURLToPath} from 'node:url';
import {attendanceStageColumns,attendanceStageTables,prepareAttendanceStage,attendanceRowsDigest,stageDigest,assertAttendanceStageTarget,attendanceStageDecision} from '../attendance-stage-import.mjs';
import {targetImportFingerprint,lockImportTables} from '../migration-data-guard.mjs';
const quote=s=>{if(!/^[a-z_][a-z0-9_]*$/.test(s))throw Error('ATTENDANCE_STAGE_INVALID_IDENTIFIER');return '"'+s+'"';};
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),apply=args.includes('--apply'),reportArg=args.find(a=>a.startsWith('--report=')),expected=args.find(a=>a.startsWith('--expected-plan='))?.slice(16);
if(args.some(a=>!['--apply','--plan'].includes(a)&&!a.startsWith('--report=')&&!a.startsWith('--expected-plan=')))throw Error('ATTENDANCE_STAGE_UNKNOWN_ARGUMENT');
if(!reportArg||!process.env.ATTENDANCE_SOURCE_SQLITE||!process.env.DATABASE_URL)throw Error('Requires ATTENDANCE_SOURCE_SQLITE, DATABASE_URL and --report=/private/path.json');
const u=assertAttendanceStageTarget(process.env.DATABASE_URL);
if(apply&&(process.env.ATTENDANCE_STAGE_CONFIRM!=='ISOLATED_ATTENDANCE_STAGE'||!expected||!/^[a-f0-9]{64}$/.test(expected)))throw Error('ATTENDANCE_STAGE_EXPLICIT_PLAN_REQUIRED');
const reportPath=path.resolve(reportArg.slice(9));await fs.access(path.dirname(reportPath));const folder=await fs.stat(path.dirname(reportPath));if((folder.mode&0o077)!==0)throw Error('ATTENDANCE_STAGE_REPORT_DIRECTORY_MUST_BE_PRIVATE');
const report=await fs.open(reportPath,'wx',0o600);let source,client,transaction=false;
try{
 const file=path.resolve(process.env.ATTENDANCE_SOURCE_SQLITE),stat=await fs.stat(file);if(!stat.isFile()||stat.size>512*1024*1024)throw Error('ATTENDANCE_STAGE_SOURCE_SIZE');
 for(const suffix of ['-wal','-journal']){try{if((await fs.stat(file+suffix)).size>0)throw Error('ATTENDANCE_STAGE_CONSISTENT_BACKUP_REQUIRED');}catch(e){if(e.code!=='ENOENT')throw e;}}
 source=new DatabaseSync(file,{readOnly:true});source.exec('begin');if(source.prepare('pragma quick_check').get().quick_check!=='ok')throw Error('ATTENDANCE_STAGE_SOURCE_INTEGRITY');
 const names=source.prepare("select name from sqlite_master where type='table' and name like 'attendance_%' order by name").all().map(r=>r.name);
 if(JSON.stringify(names)!==JSON.stringify(attendanceStageTables))throw Error('ATTENDANCE_STAGE_TABLE_CONTRACT_CHANGED');
 const data={},columns={},integerColumns={};let total=0;
 for(const table of names){const info=source.prepare('pragma table_info('+quote(table)+')').all();columns[table]=info.map(c=>c.name);integerColumns[table]=new Set(info.filter(c=>/INT/i.test(c.type)).map(c=>c.name));data[table]=source.prepare('select * from '+quote(table)).all();total+=data[table].length;if(total>1000000)throw Error('ATTENDANCE_STAGE_ROW_LIMIT');for(const row of data[table])for(const value of Object.values(row))if(typeof value==='string'&&Buffer.byteLength(value)>8*1024*1024)throw Error('ATTENDANCE_STAGE_CELL_LIMIT');}
 for(const name of names)if(JSON.stringify([...columns[name]].sort())!==JSON.stringify([...attendanceStageColumns[name]].sort()))throw Error('ATTENDANCE_STAGE_COLUMN_CONTRACT_CHANGED');
 const sourcePeople=source.prepare('select id,employee_no from personnel').all(),sourceAccounts=source.prepare('select id,username from users').all();
 client=new pg.Client({connectionString:u.toString(),connectionTimeoutMillis:10000});await client.connect();
 const version=Number((await client.query('show server_version_num')).rows[0].server_version_num);if(version<160000||version>=170000)throw Error('ATTENDANCE_STAGE_POSTGRES16_REQUIRED');
 await client.query(apply?'begin':'begin isolation level repeatable read read only');transaction=true;await client.query("set local lock_timeout='10s'");await client.query("set local statement_timeout='120s'");
 if(apply){await client.query("select pg_advisory_xact_lock(hashtext('attendance-stage-v1'))");await lockImportTables(client);}
 const targetNames=(await client.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name")).rows.map(r=>r.table_name);
 if(JSON.stringify(targetNames.filter(n=>n.startsWith('attendance_')).sort())!==JSON.stringify(attendanceStageTables))throw Error('ATTENDANCE_STAGE_TARGET_CONTRACT_CHANGED');
 for(const name of names){if(!targetNames.includes(name))throw Error('ATTENDANCE_STAGE_MIGRATIONS_REQUIRED');const cols=(await client.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1",[name])).rows.map(r=>r.column_name);if(columns[name].length!==cols.length||columns[name].some(c=>!cols.includes(c)))throw Error('ATTENDANCE_STAGE_SCHEMA_MISMATCH');}
 const targetPeople=(await client.query('select id,employee_no from personnel')).rows,targetAccounts=(await client.query('select id,username from users')).rows;
 const plan=prepareAttendanceStage({tables:data,sourcePeople,sourceAccounts,targetPeople,targetAccounts});
 const targetHash=await targetImportFingerprint(client),checkpoint=targetNames.includes('data_import_checkpoints')?(await client.query("select * from data_import_checkpoints where id='attendance-stage-v1'")).rows[0]:null;
 const nonempty=[];for(const name of names)if(Number((await client.query('select count(*) n from '+quote(name))).rows[0].n))nonempty.push(name);
 const decision=attendanceStageDecision({checkpoint,sourceHash:plan.sourceHash,targetHash,nonempty});
 const planHash=stageDigest({summary:plan.summary,sourceHash:plan.sourceHash,targetHash,decision});
 const result={mode:apply?'apply':'plan',isolatedStageOnly:true,productionApproved:false,sourceFingerprint:plan.sourceHash,targetBefore:targetHash,decision,planHash,...plan.summary};
 if(apply&&expected!==planHash)throw Error('ATTENDANCE_STAGE_PLAN_CHANGED');
 if(apply&&decision==='fresh'){
  for(const name of names){const cols=columns[name],rows=plan.tables[name];for(let i=0;i<rows.length;i+=200){const batch=rows.slice(i,i+200),params=batch.flatMap(r=>cols.map(k=>r[k]));const values=batch.map((_,j)=>'('+cols.map((_,n)=>'$'+(j*cols.length+n+1)).join(',')+')').join(',');await client.query('insert into '+quote(name)+'('+cols.map(quote).join(',')+') values '+values,params);}
   const actual=(await client.query('select '+cols.map(quote).join(',')+' from '+quote(name))).rows.map(row=>Object.fromEntries(cols.map(k=>[k,integerColumns[name].has(k)&&row[k]!=null?Number(row[k]):row[k]])));
   if(attendanceRowsDigest(actual)!==attendanceRowsDigest(rows))throw Error('ATTENDANCE_STAGE_DATA_MISMATCH');
  }
  // ALTER SEQUENCE RESTART is transactional, unlike setval.
  const serial=(await client.query("select pg_get_serial_sequence('attendance_approval_plan_history','id') as name,coalesce(max(id),0)+1 as next from attendance_approval_plan_history")).rows[0];
  const next=Number(serial.next);if(!serial.name||!Number.isSafeInteger(next)||next<1)throw Error('ATTENDANCE_STAGE_SEQUENCE_INVALID');
  await client.query('alter sequence '+serial.name.split('.').map(quote).join('.')+' restart with '+next);
  await client.query('create table if not exists data_import_checkpoints(id text primary key,source_sha text not null,target_sha text not null,completed_at text not null)');
  result.targetAfter=await targetImportFingerprint(client);
  await client.query("insert into data_import_checkpoints values('attendance-stage-v1',$1,$2,$3)",[plan.sourceHash,result.targetAfter,new Date().toISOString()]);
 }
 await client.query('commit');transaction=false;source.exec('commit');
 await report.writeFile(JSON.stringify({...result,completedAt:new Date().toISOString()},null,2));console.log(JSON.stringify({ok:true,mode:result.mode,decision,totalRows:result.totalRows,planHash,report:reportPath}));
}catch(e){if(transaction)await client?.query('rollback').catch(()=>{});const code=/^ATTENDANCE_STAGE_[A-Z0-9_]+$/.test(e.code||e.message)?e.code||e.message:'ATTENDANCE_STAGE_FAILED';await report.writeFile(JSON.stringify({ok:false,code,productionApproved:false},null,2));console.error(code);process.exitCode=1;}
finally{source?.close();await client?.end().catch(()=>{});await report.close();}
