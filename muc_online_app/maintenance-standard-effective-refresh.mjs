// V10.1 §5.8 / P0-37: when a newer published-and-effective version of the SAME standard
// changes ONLY standard hours (category/chapter/title/workScope identical) and the aircraft
// is applicable, the unconfirmed current-effective reference and the personal pending-hour
// projection are refreshed automatically using the ORIGINAL frozen ratios. Submission snapshots
// (maintenance_report_batches/entries), confirmed results and review cases are never touched.
// REVIEW-sourced assessments (未收录工作在评议中) are never auto-converted. Every refresh is
// recorded in maintenance_standard_effective_refreshes (differences, operator, reason).
export const STANDARD_EFFECTIVE_REFRESH_SCHEMA=`create table if not exists maintenance_standard_effective_refreshes(
  id text primary key,
  subtask_id text not null,
  flight_id text not null,
  standard_id text not null,
  from_version integer not null,
  to_version integer not null,
  from_hours real not null,
  to_hours real not null,
  changed_fields_json text not null,
  operator_id text not null,
  reason text not null,
  created_at text not null,
  unique(subtask_id, to_version)
);
create index if not exists maintenance_standard_effective_refresh_flight on maintenance_standard_effective_refreshes(flight_id,created_at);`;

const identityFields=['category','chapter','title','workScope'];

export function createStandardEffectiveRefresh({db,clock,randomId,publishedStandards,aircraftCodeOf=code=>String(code||'').trim().toUpperCase()}){
  const refresh=function refresh(user,reason='新版标准生效且适用，未确认当前有效引用按原比例自动更新'){
    const targets=new Map(publishedStandards().map(standard=>[String(standard.id),standard]));
    const rows=db.prepare(`select a.subtask_id,a.flight_id,a.standard_json,a.effective_hours,s.status as subtask_status,s.standard_hours as subtask_standard_hours,f.status as flight_status,f.aircraft_type
      from maintenance_nonroutine_assessments a
      join maintenance_subtasks s on s.id=a.subtask_id
      join maintenance_flights f on f.id=a.flight_id
      where a.source_kind='STANDARD' and a.standard_json is not null`).all();
    const actions=[];
    for(const row of rows){
      let bound;try{bound=JSON.parse(row.standard_json);}catch{continue;}
      if(!bound?.id||!Number.isFinite(Number(bound.version)))continue;
      const target=targets.get(String(bound.id));
      if(!target||Number(target.version)<=Number(bound.version))continue;
      // 仅工时变化：同一工作、同范围（定义/类别/ATA/内容/适用条件实质变化不自动重分类）
      if(!identityFields.every(field=>String(bound[field]??'')===String(target[field]??'')))continue;
      if(Number(bound.standardHours)===Number(target.standardHours))continue;
      // 适用条件核实：机型（通用机型或精确命中）
      const code=aircraftCodeOf(row.aircraft_type);
      if(!(target.genericAircraft===true||Array.isArray(target.aircraftCodes)&&target.aircraftCodes.map(aircraftCodeOf).includes(code)))continue;
      // 机会/单项未确认（已确认、已结算一律不动，走独立更正）
      if(row.subtask_status==='已确认'||row.flight_status==='已确认')continue;
      // 幂等：同一目标版本只刷新一次（唯一键兜底并发）
      if(db.prepare('select 1 from maintenance_standard_effective_refreshes where subtask_id=? and to_version=?').get(row.subtask_id,Number(target.version)))continue;
      const nextSnapshot={...bound,versionId:target.versionId,version:Number(target.version),standardHours:Number(target.standardHours),effectiveAt:target.effectiveAt??null,aircraftCodes:target.aircraftCodes,boundAircraftCodes:bound.aircraftCodes};
      db.prepare('update maintenance_nonroutine_assessments set standard_json=?,effective_hours=? where subtask_id=? and source_kind=\'STANDARD\'')
        .run(JSON.stringify(nextSnapshot),Number(target.standardHours),row.subtask_id);
      // 未提报场景的未锁定引用列：仅当仍等于旧快照值时同步（不覆盖人工改动）
      if(Number(row.subtask_standard_hours)===Number(bound.standardHours))
        db.prepare('update maintenance_subtasks set standard_hours=?,updated_at=? where id=? and status<>\'已确认\'').run(Number(target.standardHours),clock(),row.subtask_id);
      const changedFields={changeType:'HOURS_ONLY',fromVersion:Number(bound.version),toVersion:Number(target.version),fromHours:Number(bound.standardHours),toHours:Number(target.standardHours),category:target.category,chapter:target.chapter,title:target.title,workScope:target.workScope,effectiveAt:target.effectiveAt??null,aircraftCodes:target.aircraftCodes};
      db.prepare('insert into maintenance_standard_effective_refreshes(id,subtask_id,flight_id,standard_id,from_version,to_version,from_hours,to_hours,changed_fields_json,operator_id,reason,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(randomId('mser'),row.subtask_id,row.flight_id,String(bound.id),Number(bound.version),Number(target.version),Number(bound.standardHours),Number(target.standardHours),JSON.stringify(changedFields),String(user?.id||'system'),reason,clock());
      actions.push({subtaskId:row.subtask_id,flightId:row.flight_id,standardId:String(bound.id),fromVersion:Number(bound.version),toVersion:Number(target.version),fromHours:Number(bound.standardHours),toHours:Number(target.standardHours)});
    }
    return actions;
  };
  return {refresh};
}
