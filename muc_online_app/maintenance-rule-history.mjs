import {createHash} from 'node:crypto';

export const MAINTENANCE_RULE_HISTORY_SCHEMA=`create table if not exists maintenance_rule_change_history(
 id text primary key,revision integer not null unique check(revision>0),
 before_json text not null,after_json text not null,
 before_sha256 text not null check(length(before_sha256)=64),after_sha256 text not null check(length(after_sha256)=64),
 continuity text not null check(continuity in ('FIRST_OBSERVATION','CONTIGUOUS','UNJOURNALED_GAP')),
 write_mode text not null check(write_mode in ('VERSIONED','LEGACY_UNVERSIONED')),
 actor_id text not null,qualification_json text not null,reason text,created_at text not null
);`;
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const hash=value=>createHash('sha256').update(value).digest('hex');
const key=row=>JSON.stringify([row.ruleType,row.name]);
export function createMaintenanceRuleHistory({db,clock,randomId}){
 function capture(sourceRows){
  const rules=(sourceRows||db.prepare("select rule_type,name,value from maintenance_hour_rules where rule_type<>'workType'").all()).map(row=>{
   const value=Number(row.value);if(row.value===null||typeof row.value!=='number'&&!(typeof row.value==='string'&&row.value.trim())||!Number.isFinite(value))fail('当前规则数值异常，不能形成变更版本');
   return {ruleType:row.rule_type,name:row.name,value};
  }).sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
  const content=JSON.stringify(rules),latest=db.prepare('select id,revision,after_sha256 from maintenance_rule_change_history order by revision desc limit 1').get();
  return {rules,content,fingerprint:hash(content),latest};
 }
 const versionOf=current=>({revision:Number(current.latest?.revision||0),fingerprint:current.fingerprint,historyKnown:Boolean(current.latest),hasUnjournaledChanges:Boolean(current.latest&&current.latest.after_sha256!==current.fingerprint)});
 function state(sourceRows){return versionOf(capture(sourceRows));}
 function begin(expected){
  const current=capture();
  if(expected!==undefined){
   if(!expected||typeof expected!=='object'||!Number.isSafeInteger(expected.revision)||expected.revision<0||typeof expected.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(expected.fingerprint))fail('规则版本无效，请重新读取规则',400);
   const actual=versionOf(current);if(expected.revision!==actual.revision||expected.fingerprint!==actual.fingerprint)fail('工时规则已变化，请重新读取并核对后保存');
  }
  return {...current,writeMode:expected===undefined?'LEGACY_UNVERSIONED':'VERSIONED'};
 }
 // The host owns the original maintenance transaction and fresh authorization.
 function record(before,{actor,qualification,reason}){
  const after=capture();if(before.fingerprint===after.fingerprint)return null;
  if(!actor?.id||qualification?.accountId!==actor.id||!qualification.personId)fail('规则变更操作者当前资格缺失',403);
  if(Number(before.latest?.revision||0)!==Number(after.latest?.revision||0))fail('规则变更版本已变化，未保存');
  const basis=reason===undefined||reason===null?'':String(reason).trim();if(basis.length>2000)fail('规则变更原因不能超过2000字',400);
  const id=randomId('mtrh'),revision=Number(before.latest?.revision||0)+1;
  const continuity=!before.latest?'FIRST_OBSERVATION':before.latest.after_sha256===before.fingerprint?'CONTIGUOUS':'UNJOURNALED_GAP';
  db.prepare('insert into maintenance_rule_change_history(id,revision,before_json,after_json,before_sha256,after_sha256,continuity,write_mode,actor_id,qualification_json,reason,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?)')
   .run(id,revision,before.content,after.content,before.fingerprint,after.fingerprint,continuity,before.writeMode,actor.id,JSON.stringify(qualification),basis||null,clock());
  return {id,revision,beforeFingerprint:before.fingerprint,afterFingerprint:after.fingerprint,continuity,writeMode:before.writeMode};
 }
 function list(query={}){
  const cursor=query.cursor===undefined||query.cursor===''?null:Number(query.cursor);
  if(cursor!==null&&(!Number.isSafeInteger(cursor)||cursor<1))fail('规则历史分页位置无效',400);
  const rows=cursor===null?db.prepare('select * from maintenance_rule_change_history order by revision desc limit 11').all():db.prepare('select * from maintenance_rule_change_history where revision<? order by revision desc limit 11').all(cursor);
  const items=rows.slice(0,10).map(row=>{
   if(hash(row.before_json)!==row.before_sha256||hash(row.after_json)!==row.after_sha256)fail('规则历史摘要异常，请核对原记录');
   const before=JSON.parse(row.before_json),after=JSON.parse(row.after_json),previous=new Map(before.map(item=>[key(item),item]));
   const changes=after.filter(item=>!previous.has(key(item))||previous.get(key(item)).value!==item.value).map(item=>({...item,beforeValue:previous.get(key(item))?.value??null}));
   const currentKeys=new Set(after.map(key));for(const item of before)if(!currentKeys.has(key(item)))changes.push({...item,beforeValue:item.value,value:null});
   return {id:row.id,revision:Number(row.revision),beforeFingerprint:row.before_sha256,afterFingerprint:row.after_sha256,continuity:row.continuity,writeMode:row.write_mode,actorId:row.actor_id,reason:row.reason,createdAt:row.created_at,changes};
  });
  return {version:state(),items,nextCursor:rows.length>10?String(items.at(-1).revision):null,historyBoundary:'FIRST_RECORDED_CHANGE_ONLY'};
 }
 return {state,begin,record,list};
}
