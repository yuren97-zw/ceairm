// Shared, deterministic calculation contract. No storage, clock or authorization side effects.
export const GROUPS = ['一组','二组','三组','四组'];
export const GROUP_ALIASES = { 一组:'一组',一班:'一组',二组:'二组',二班:'二组',三组:'三组',三班:'三组',四组:'四组',四班:'四组' };
export const DEFAULT_CODES = ['WX-01-01-05','WX-01-01-06','WX-01-01-05-01-01-01','WX-01-01-06-01-01-01','WX-01-01-05-01-11','WX-01-01-05-01-12','WX-01-01-06-01-09','WX-01-01-05-01-11-01','WX-01-01-05-01-12-01','WX-01-01-06-01-09-01'];
export const LABELS = { release:'放行',test_run:'试车',maintenance:'维修',special:'专项',third_party:'三方',other:'其他' };
export const CATEGORY_KEYS = Object.keys(LABELS);
export const STATUS_LABELS = { ON_DUTY:'在岗',DEPLOYED:'派驻',TRAINING:'培训',OTHER:'其他' };
export const category=value=>CATEGORY_KEYS.includes(value)?value:null;
export const defaultTarget=p=>['maintenance','release'].includes(p.category)?12:1;
export const risk=(actual,target)=>target===0||actual>=target?'good':actual===0||target-actual>=2?'danger':'warning';
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function days(start,end=today()) { return start && end>=start ? Math.floor((Date.parse(end+'T00:00:00+08:00')-Date.parse(start+'T00:00:00+08:00'))/86400000)+1 : null; }
export function normalizeConfig(projects,input={}) {
  const keys=new Set(projects.map(p=>p.key)),byCode=new Map(projects.map(p=>[p.code,p.key]));
  const remap=key=>{if(keys.has(key))return key;try{const parsed=JSON.parse(key),code=Array.isArray(parsed)?parsed.at(-1):null;return byCode.get(code)||null;}catch{return null;}};
  const defaults=DEFAULT_CODES.flatMap(code=>projects.filter(p=>p.code===code).map(p=>p.key));
  let priority=[...new Set((input.priority||defaults).map(remap).filter(Boolean))];
  if(!priority.length) priority=defaults.length?defaults:projects.slice(0,1).map(p=>p.key);
  const labels=input.labels==null?null:[...new Set(input.labels.map(remap).filter(Boolean))],targets={};
  for(const [oldKey,value] of Object.entries(input.targets||{})){const key=remap(oldKey);if(!key)continue;if(targets[key]&&JSON.stringify(targets[key])!==JSON.stringify(value))throw new Error(`项目 ${projects.find(p=>p.key===key)?.code||key} 存在冲突的旧门限配置`);targets[key]=value;}
  const {carrierUnits: _retiredCarrierUnits,...rest}=input;
  return {...rest,priority,labels,targets,headcounts:{一组:28,二组:31,三组:31,四组:31,...input.headcounts}};
}
export function calculate(people,projects,states,config,basis='actual') {
  const current=new Map(states.map(s=>[s.personId,s]));
  const activeGroup=p=>current.get(p.id)?.status==='ON_DUTY'?current.get(p.id)?.workingGroup:null;
  const matrix=projects.map(project=>{const holders=people.filter(p=>p.capabilities.some(c=>c.key===project.key));const actual=Object.fromEntries(GROUPS.map(g=>[g,holders.filter(p=>activeGroup(p)===g).map(p=>p.id)]));const administrative=Object.fromEntries(GROUPS.map(g=>[g,holders.filter(p=>p.administrativeGroup===g).map(p=>p.id)]));return {...project,actual,administrative};});
  const selected=new Set(config.priority),focused=matrix.filter(p=>selected.has(p.key)),alerts=[],stats={};
  for(const g of GROUPS) {const admin=people.filter(p=>p.administrativeGroup===g),actual=people.filter(p=>activeGroup(p)===g),ids=list=>list.map(p=>p.id);stats[g]={administrative:ids(admin),actual:ids(actual),normal:ids(admin.filter(p=>activeGroup(p)===g)),supportOut:ids(admin.filter(p=>activeGroup(p)&&activeGroup(p)!==g)),supportIn:ids(actual.filter(p=>p.administrativeGroup!==g)),deployed:ids(admin.filter(p=>current.get(p.id)?.status==='DEPLOYED')),training:ids(admin.filter(p=>current.get(p.id)?.status==='TRAINING')),other:ids(admin.filter(p=>current.get(p.id)?.status==='OTHER'))};const total=stats[g][basis].length,target=config.headcounts[g];if(risk(total,target)!=='good')alerts.push({key:'headcount',group:g,name:'班组总人数',actual:total,target,gap:target-total,severity:risk(total,target)});for(const p of focused){const actual=p[basis][g].length,target=config.targets[p.key]?.[g]??defaultTarget(p);if(risk(actual,target)!=='good')alerts.push({key:p.key,group:g,name:p.shortName,actual,target,gap:target-actual,severity:risk(actual,target)});}}
  alerts.sort((a,b)=>(a.severity==='danger'?0:1)-(b.severity==='danger'?0:1)||b.gap-a.gap);return {matrix,stats,alerts};
}
