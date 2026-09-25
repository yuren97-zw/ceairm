import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { preflightCapabilityIntegrity } from '../capability-integrity.mjs';

const target=process.argv[2],confirmed=process.argv.includes('--confirm-center-master');
if(!target||!confirmed)throw new Error('用法：node scripts/initialize-capability-baseline.mjs <SQLite文件> --confirm-center-master');
const database=path.resolve(target);
if(!fs.existsSync(database))throw new Error('数据库文件不存在');
const db=new DatabaseSync(database);
const tables=['capability_current_states','capability_supports','capability_status_records','capability_history','capability_scenarios','capability_configuration','capability_events','capability_commands'];
const exists=table=>db.prepare(`pragma table_info(${table})`).all().length>0;
if(!exists('capability_meta'))throw new Error('数据库尚未建立能力业务表，无需清理；正常启动后将从中心主数据建立基线');
const integrity=preflightCapabilityIntegrity(db),blocking=integrity.issues.filter(item=>item.severity==='error'&&item.type!=='unverified_capability_source');
if(blocking.length)throw Object.assign(new Error('人员唯一身份或能力数据存在其他错误，禁止清理掩盖问题'),{details:blocking});
const archive={database,archivedAt:new Date().toISOString(),sourceMarker:db.prepare('select source_marker from capability_meta where id=1').get()?.source_marker||'',tables:Object.fromEntries(tables.filter(exists).map(table=>[table,db.prepare(`select * from ${table}`).all()]))};
const archivePath=database.replace(/\.(sqlite|db)$/i,'')+`.capability-archive-${Date.now()}.json`;
fs.writeFileSync(archivePath,JSON.stringify(archive,null,2),{flag:'wx',mode:0o600});
db.exec('begin immediate');
try{
  for(const table of tables)if(exists(table))db.prepare(`delete from ${table}`).run();
  db.prepare("update capability_meta set revision=0,fingerprint='',master_revision=0,source_marker='center-master-v1' where id=1").run();
  db.exec('commit');
}catch(error){db.exec('rollback');throw error;}finally{db.close();}
console.log(JSON.stringify({ok:true,database,archivePath,message:'仅能力业务数据已归档并清空；人员、组织、执照、授权、培训和维修主数据未修改'},null,2));
