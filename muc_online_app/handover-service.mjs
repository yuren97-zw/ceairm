import fs from 'node:fs';
const failure=(m,status=400)=>Object.assign(Error(m),{status});
export const HANDOVER_STATUSES=['draft','pending','accepted'];
export const HANDOVER_BASELINE_STATUSES=['inferred','confirmed'];
// 数据层骨架：迁移幂等自应用（SQLite 由本服务执行；PostgreSQL 由 scripts/run-postgres-migrations.mjs 统一执行同一文件）。
// 状态机、班序推断与待办接入在后续阶段于同一工厂内扩展。
export function createHandoverService({db,clock=Date.now}={}){
 if(!db)throw failure('缺少数据库连接');
 db.exec(fs.readFileSync(new URL('./migrations/035_team_handover.sql',import.meta.url),'utf8'));
 const now=()=>new Date(clock()).toISOString();
 return {now,STATUSES:HANDOVER_STATUSES,BASELINE_STATUSES:HANDOVER_BASELINE_STATUSES};
}
