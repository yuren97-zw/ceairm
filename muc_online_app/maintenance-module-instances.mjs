import {readMaintenanceExtensionInstances} from './maintenance-extension-modules.mjs';
import {projectMaintenanceWorkflowCompletion} from './maintenance-workflow-results.mjs';
import {createHash} from 'node:crypto';
import {MAINTENANCE_GATE_VERSION,MAINTENANCE_REPORT_DEFINITIONS,readMaintenanceReportModules} from './maintenance-opportunity-modules.mjs';

export const MAINTENANCE_MODULE_INSTANCES_SCHEMA = `-- Core report identities and frozen rule metadata; original services own status and results.
create table if not exists maintenance_module_definitions(
 module_code text not null,module_version integer not null check(module_version>0),
 definition_json text not null,content_sha256 text not null,created_at text not null,
 primary key(module_code,module_version)
);
create table if not exists maintenance_gate_rule_versions(
 id text primary key,rules_json text not null,content_sha256 text not null,created_at text not null
);
create table if not exists maintenance_opportunity_rule_snapshots(
 opportunity_key text primary key,opportunity_id text unique references maintenance_flights(id) on delete set null,
 gate_rule_version text not null references maintenance_gate_rule_versions(id),
 snapshot_json text not null,content_sha256 text not null,created_by text not null,created_at text not null
);
create table if not exists maintenance_module_instances(
 id text primary key,opportunity_key text not null references maintenance_opportunity_rule_snapshots(opportunity_key),
 opportunity_id text references maintenance_flights(id) on delete set null,
 module_code text not null,module_version integer not null,instance_key text not null,
 gate_rule_version text not null references maintenance_gate_rule_versions(id),created_at text not null,
 foreign key(module_code,module_version) references maintenance_module_definitions(module_code,module_version),
 unique(opportunity_key,module_code,module_version,instance_key)
);
create index if not exists maintenance_module_instances_opportunity on maintenance_module_instances(opportunity_id);
`;

const digest = value => createHash('sha256').update(value).digest('hex');
const fail = () => { throw Object.assign(new Error('维修模块规则快照关联异常，请核对模块版本'), {status:409}); };
const rules = Object.freeze({
 version:MAINTENANCE_GATE_VERSION,
 source:'EXISTING_REPORT_SERVICES',
 releaseCheck:'ORIGINAL_RELEASE_REPORTER_AND_LOCK',
 reconcile:'LEGACY_FIVE_STATES_PRESERVE_CONFIRMED',
 finalize:'ORIGINAL_REPORT_COMPLETENESS',
 review:'ORIGINAL_SIGNATURES_AND_TASK_TREE',
 autoFinalize:'ORIGINAL_PURE_ROUTINE_EXCLUSIONS',
 extendedModulesAffectState:false
});
const rulesJson=JSON.stringify(rules),rulesSha=digest(rulesJson);
const definitions=MAINTENANCE_REPORT_DEFINITIONS.map(definition=>({
 ...definition,applicabilityPredicateId:'original-'+definition.reportType+'-applicability-v1',
 completionPredicateId:'original-'+definition.reportType+'-submission-v1',
 requiredBeforeConfirmation:false,allowedAfterOpportunityConfirmed:false
}));
const snapshotJson=JSON.stringify({gateRuleVersion:MAINTENANCE_GATE_VERSION,rulesSha256:rulesSha,definitions});

// Called only inside the original new-opportunity transaction. No backfill,
// public registration, rule publication, result posting or opportunity writes.
export function createMaintenanceModuleInstances({db,opportunityId,actorId,stamp}) {
 if(!db.prepare('select id from maintenance_flights where id=?').get(opportunityId)||!actorId||!stamp)fail();
 const existing=db.prepare('select opportunity_key from maintenance_opportunity_rule_snapshots where opportunity_key=?').get(opportunityId);
 if(existing) return readMaintenanceModuleIdentity(db,opportunityId);
 db.prepare('insert into maintenance_gate_rule_versions(id,rules_json,content_sha256,created_at) values(?,?,?,?) on conflict do nothing').run(MAINTENANCE_GATE_VERSION,rulesJson,rulesSha,stamp);
 const storedRule=db.prepare('select * from maintenance_gate_rule_versions where id=?').get(MAINTENANCE_GATE_VERSION);
 if(storedRule.rules_json!==rulesJson||storedRule.content_sha256!==rulesSha)fail();
 for(const definition of definitions){
  const content=JSON.stringify(definition),hash=digest(content);
  db.prepare('insert into maintenance_module_definitions(module_code,module_version,definition_json,content_sha256,created_at) values(?,?,?,?,?) on conflict do nothing').run(definition.moduleTypeCode,definition.moduleVersion,content,hash,stamp);
  const stored=db.prepare('select * from maintenance_module_definitions where module_code=? and module_version=?').get(definition.moduleTypeCode,definition.moduleVersion);
  if(stored.definition_json!==content||stored.content_sha256!==hash)fail();
 }
 db.prepare('insert into maintenance_opportunity_rule_snapshots(opportunity_key,opportunity_id,gate_rule_version,snapshot_json,content_sha256,created_by,created_at) values(?,?,?,?,?,?,?)').run(opportunityId,opportunityId,MAINTENANCE_GATE_VERSION,snapshotJson,digest(snapshotJson),actorId,stamp);
 for(const definition of definitions){
  const id=JSON.stringify([opportunityId,definition.moduleTypeCode,definition.moduleVersion]);
  db.prepare('insert into maintenance_module_instances(id,opportunity_key,opportunity_id,module_code,module_version,instance_key,gate_rule_version,created_at) values(?,?,?,?,?,?,?,?)').run(id,opportunityId,opportunityId,definition.moduleTypeCode,definition.moduleVersion,'default',MAINTENANCE_GATE_VERSION,stamp);
 }
 return readMaintenanceModuleIdentity(db,opportunityId);
}

export function readMaintenanceModuleIdentity(db,opportunityId) {
 const snapshot=db.prepare('select * from maintenance_opportunity_rule_snapshots where opportunity_key=?').get(opportunityId);
 if(!snapshot){
  if(db.prepare('select id from maintenance_module_instances where opportunity_id=?').get(opportunityId))fail();
  return null;
 }
 if(snapshot.opportunity_id!==opportunityId||snapshot.gate_rule_version!==MAINTENANCE_GATE_VERSION||snapshot.snapshot_json!==snapshotJson||snapshot.content_sha256!==digest(snapshot.snapshot_json))fail();
 const storedRule=db.prepare('select * from maintenance_gate_rule_versions where id=?').get(snapshot.gate_rule_version);
 if(!storedRule||storedRule.rules_json!==rulesJson||storedRule.content_sha256!==rulesSha)fail();
 const instances=db.prepare('select * from maintenance_module_instances where opportunity_key=? order by module_code,module_version,instance_key').all(opportunityId);
 const coreCodes=definitions.map(row=>row.moduleTypeCode);
 if(instances.filter(row=>coreCodes.includes(row.module_code)).length!==definitions.length)fail();
 const extensions=readMaintenanceExtensionInstances(db,opportunityId,instances,snapshot.gate_rule_version,coreCodes);
 for(const definition of definitions){
  const instance=instances.find(row=>row.module_code===definition.moduleTypeCode&&Number(row.module_version)===definition.moduleVersion);
  if(!instance||instance.opportunity_id!==opportunityId||instance.instance_key!=='default'||instance.gate_rule_version!==snapshot.gate_rule_version||instance.id!==JSON.stringify([opportunityId,definition.moduleTypeCode,definition.moduleVersion]))fail();
  const stored=db.prepare('select * from maintenance_module_definitions where module_code=? and module_version=?').get(definition.moduleTypeCode,definition.moduleVersion);
  const content=JSON.stringify(definition);
  if(!stored||stored.definition_json!==content||stored.content_sha256!==digest(content))fail();
 }
 return {gateRuleVersion:snapshot.gate_rule_version,ruleSnapshotSha256:snapshot.content_sha256,createdAt:snapshot.created_at,instances,extensions};
}

export function readPersistedMaintenanceReportModules(db,opportunityId,progress){
 const identity=readMaintenanceModuleIdentity(db,opportunityId);
 return readMaintenanceReportModules(opportunityId,progress).map(module=>({...module,
  identitySource:identity?'PERSISTED':'LEGACY_ADAPTER',
  ...(identity?{ruleSnapshotSha256:identity.ruleSnapshotSha256}:{}),
 })).concat((identity?.extensions||[]).map(module=>projectMaintenanceWorkflowCompletion(db,module,identity.ruleSnapshotSha256)));
}

// V10.1 行1103 / P0-60：进行中机会的模块规则「有权变更」路径（重冻结）。
// 默认冻结语义不变；仅在显式批准 + 20字以上影响分析 + 授权人操作 + 未确认未归档时，
// 将机会快照与全部实例同步到当前规则版本，并要求调用方写双审计。
export function refreezeMaintenanceModuleIdentity({db,opportunityId,actorId,stamp,impactAnalysis,approved,authorize}){
  if(approved!==true)throw Object.assign(new Error('模块规则重冻结须显式批准'),{status:400});
  const analysis=String(impactAnalysis||'').trim();
  if(analysis.length<20||analysis.length>4000)throw Object.assign(new Error('必须提供20至4000字的影响分析'),{status:400});
  const flight=db.prepare('select * from maintenance_flights where id=?').get(opportunityId);
  if(!flight)fail();
  if(flight.status==='已确认'||flight.archived_at)throw Object.assign(new Error('已确认或已归档机会不能重冻结模块规则，须走更正或归档授权流程'),{status:409});
  if(typeof authorize==='function'&&authorize(flight)!==true)throw Object.assign(new Error('模块规则重冻结未获授权'),{status:403});
  const existing=db.prepare('select * from maintenance_opportunity_rule_snapshots where opportunity_key=?').get(opportunityId);
  if(!existing)fail();
  db.prepare('insert into maintenance_gate_rule_versions(id,rules_json,content_sha256,created_at) values(?,?,?,?) on conflict do nothing').run(MAINTENANCE_GATE_VERSION,rulesJson,rulesSha,stamp);
  const storedRule=db.prepare('select * from maintenance_gate_rule_versions where id=?').get(MAINTENANCE_GATE_VERSION);
  if(storedRule.rules_json!==rulesJson||storedRule.content_sha256!==rulesSha)fail();
  for(const definition of definitions){
    const content=JSON.stringify(definition),hash=digest(content);
    db.prepare('insert into maintenance_module_definitions(module_code,module_version,definition_json,content_sha256,created_at) values(?,?,?,?,?) on conflict do nothing').run(definition.moduleTypeCode,definition.moduleVersion,content,hash,stamp);
  }
  const before={snapshotSha256:existing.content_sha256,gateRuleVersion:existing.gate_rule_version};
  db.prepare('update maintenance_opportunity_rule_snapshots set snapshot_json=?,content_sha256=?,gate_rule_version=?,created_by=?,created_at=? where opportunity_key=?')
    .run(snapshotJson,digest(snapshotJson),MAINTENANCE_GATE_VERSION,actorId,stamp,opportunityId);
  db.prepare('update maintenance_module_instances set gate_rule_version=? where opportunity_key=?').run(MAINTENANCE_GATE_VERSION,opportunityId);
  const identity=readMaintenanceModuleIdentity(db,opportunityId);
  return {identity,before,after:{snapshotSha256:identity.ruleSnapshotSha256,gateRuleVersion:MAINTENANCE_GATE_VERSION},impactAnalysis:analysis};
}
