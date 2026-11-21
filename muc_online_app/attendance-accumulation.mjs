import fs from 'node:fs';
export function installAccumulation(db){
 db.exec(fs.readFileSync(new URL('./migrations/033_attendance_monthly_exchange.sql',import.meta.url),'utf8'));
 const table='attendance_monthly_exchange_rules';
 const exists=db.kind==='postgres'
  ? db.prepare("select 1 from pg_attribute where attrelid=to_regclass(?) and attname='single_cap_seconds' and not attisdropped").get(table)
  : db.prepare(`pragma table_info(${table})`).all().some(column=>column.name==='single_cap_seconds');
 if(!exists){
  const sql=fs.readFileSync(new URL('./migrations/036_attendance_single_cap.sql',import.meta.url),'utf8');
  db.exec(db.kind==='postgres'?sql:sql.replace('add column if not exists','add column'));
 }
}
export function accumulationPolicies(db){
 const rules=db.prepare('select id,source_month,single_cap_seconds from attendance_monthly_exchange_rules order by source_month desc,created_at desc,id desc').all();
 return {version:JSON.stringify(rules),forDate:date=>rules.find(r=>r.source_month<=date.slice(0,7))||null};
}
export function capAccumulation(value,rule){
 const raw=value.rawSeconds??value.seconds,cap=rule?.single_cap_seconds??null;
 return {...value,rawSeconds:raw,capSeconds:cap,excessSeconds:raw===null?null:cap===null?0:Math.max(0,raw-cap),seconds:raw===null?null:cap===null?raw:Math.min(raw,cap),capRuleId:rule?.id??null};
}
export const capAttendanceDay=(day,rule)=>({...day,overtime:capAccumulation(day.overtime,rule)});
export function singleCapHoursToSeconds(value){
 if(value==null||String(value).trim()==='')return null;
 const match=/^(\d{1,10})(?:\.(\d{1,20}))?$/.exec(String(value));
 if(!match)throw Object.assign(Error('单次上限须为正数小时或留空'),{status:400});
 const denominator=10n**BigInt((match[2]||'').length),numerator=BigInt(match[1])*denominator+BigInt(match[2]||0);
 const seconds=(numerator*3600n+denominator/2n)/denominator;
 if(seconds<1n||seconds>2147483647n)throw Object.assign(Error('单次上限须至少1秒，且不超过整数秒范围'),{status:400});return Number(seconds);
}
