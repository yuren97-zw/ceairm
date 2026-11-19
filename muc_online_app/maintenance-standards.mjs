export const MAINTENANCE_STANDARDS_SCHEMA = `create table if not exists maintenance_standards(
  id text primary key,
  status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','DISABLED')),
  revision integer not null default 1,
  created_by text not null,
  created_at text not null,
  updated_at text not null
);
create table if not exists maintenance_standard_versions(
  id text primary key,
  standard_id text not null references maintenance_standards(id),
  version integer not null check(version > 0),
  category text not null,
  chapter text not null,
  title text not null,
  work_scope text not null,
  standard_hours real not null check(standard_hours >= 0),
  aircraft_codes_json text not null,
  generic_aircraft integer not null default 0 check(generic_aircraft in (0,1)),
  status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','WITHDRAWN')),
  admission_decision text not null default 'PENDING' check(admission_decision in ('PENDING','INCLUDE','EXCLUDE')),
  effective_at text,
  published_by text,
  published_at text,
  review_final_id text,
  created_at text not null,
  unique(standard_id,version)
);
create index if not exists maintenance_standard_versions_lookup
  on maintenance_standard_versions(standard_id,status,version);`;

export const NONROUTINE_CATEGORY_STRATEGIES = Object.freeze({
  "工卡指令": "ROLE_COMBINATION",
  "单项工作": "ROLE_COMBINATION",
  "拖机": "EQUAL",
  "三方附加": "EQUAL",
  "试车": "EQUAL",
  "其他": "UNDECIDED",
  "人工除冰": "UNDECIDED",
  "联合除冰": "UNDECIDED"
});

function normalizedText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
}

export function standardAircraftCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function standardView(row) {
  // Invalid stored applicability must fail closed, never become a generic standard.
  const aircraftCodes = JSON.parse(row.aircraft_codes_json);
  if (!Array.isArray(aircraftCodes) || aircraftCodes.some(code => typeof code !== "string" || !code.trim())) {
    throw new Error("标准机型配置无效，请联系标准库管理员");
  }
  const hours = Number(row.standard_hours);
  if (!Object.hasOwn(NONROUTINE_CATEGORY_STRATEGIES, row.category) ||
      !row.chapter.trim() || !row.title.trim() || !row.work_scope.trim() ||
      (Number(row.generic_aircraft) !== 1 && aircraftCodes.length === 0)) {
    throw new Error("标准字段配置不完整，请联系标准库管理员");
  }
  if (!Number.isFinite(hours) || hours < 0 || Math.abs(hours * 10 - Math.round(hours * 10)) > 1e-8) {
    throw new Error("标准工时配置无效，请联系标准库管理员");
  }
  return {
    id: row.standard_id,
    versionId: row.id,
    version: Number(row.version),
    category: row.category,
    chapter: row.chapter,
    title: row.title,
    workScope: row.work_scope,
    standardHours: hours,
    aircraftCodes: [...new Set(aircraftCodes.map(standardAircraftCode))],
    genericAircraft: Number(row.generic_aircraft) === 1,
    effectiveAt: row.effective_at
  };
}

// Matching and management read the same publication/effective-time gates.
const publicationTimes=row=>({published:Date.parse(row.published_at),effective:Date.parse(row.effective_at)});
const publicationReady=row=>row.admission_decision==='INCLUDE'&&typeof row.published_by==='string'&&row.published_by.trim()&&Number.isFinite(publicationTimes(row).published)&&Number.isFinite(publicationTimes(row).effective);
export function effectiveMaintenanceStandardRows(rows,at){
  const stamp=Date.parse(at);if(!Number.isFinite(stamp))throw new Error('标准匹配时钟无效');
  const ordered=rows.filter(row=>['PUBLISHED','WITHDRAWN'].includes(row.status)&&publicationReady(row)&&publicationTimes(row).published<=stamp&&publicationTimes(row).effective<=stamp)
    .sort((a,b)=>String(a.standard_id).localeCompare(String(b.standard_id))||Number(b.version)-Number(a.version));
  return ordered.filter((row,index)=>ordered.findIndex(other=>other.standard_id===row.standard_id)===index).filter(row=>row.status==='PUBLISHED');
}
export function maintenanceStandardVersionLifecycle(standard,versions,at){
  const stamp=Date.parse(at);if(!Number.isFinite(stamp))throw new Error('标准匹配时钟无效');
  const active=standard.status==='PUBLISHED'?effectiveMaintenanceStandardRows(versions,at)[0]?.id:null;
  return new Map(versions.map(row=>[row.id,standard.status==='DISABLED'?'DISABLED':row.status==='DRAFT'?'DRAFT':row.status==='WITHDRAWN'?'WITHDRAWN':standard.status!=='PUBLISHED'?'UNAVAILABLE':!publicationReady(row)?'UNAVAILABLE':publicationTimes(row).effective>stamp||publicationTimes(row).published>stamp?'SCHEDULED':row.id===active?'EFFECTIVE':'SUPERSEDED']));
}

export function createMaintenanceStandards({ db, clock = () => new Date().toISOString() }) {
  function published() {
    const at = clock();
    // Admission, publication and effective time are independent gates. Later drafts
    // and future versions cannot hide the currently effective published version.
    const rows = db.prepare(`select v.* from maintenance_standard_versions v
      join maintenance_standards s on s.id=v.standard_id
      where s.status='PUBLISHED' and v.status in ('PUBLISHED','WITHDRAWN')
        and v.admission_decision='INCLUDE' and v.published_by is not null
        and v.published_by<>'' and v.published_at is not null
        and v.effective_at is not null
      order by v.standard_id,v.version desc`).all();
    return effectiveMaintenanceStandardRows(rows,at).map(standardView);
  }

  function applicable(standard, aircraftCode) {
    return standard.genericAircraft || Boolean(aircraftCode && standard.aircraftCodes.includes(aircraftCode));
  }

  function listFrom(all, { aircraftCode, search = "" }) {
    const code = standardAircraftCode(aircraftCode);
    const matched = all.filter(item => applicable(item, code));
    const fallback = !code || matched.length === 0;
    const query = normalizedText(search);
    const items = (fallback ? all : matched).filter(item => !query ||
      normalizedText([item.category, item.chapter, item.title, item.workScope].join(" ")).includes(query));
    return { aircraftCode: code, fallback, items };
  }

  function matchFrom(all, input, aircraftCode) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw Object.assign(new Error("标准匹配参数须为对象"), { status: 400 });
    }
    all ??= published();
    const code = standardAircraftCode(aircraftCode);
    const reference = String(input.standardId || "");
    if (reference) {
      const selected = all.find(item => item.id === reference && item.version === Number(input.standardVersion));
      if (!selected || !applicable(selected, code)) {
        return { status: "BLOCKED", reason: "标准版本已失效或不适用于当前机型", candidates: [] };
      }
      return { status: "MATCHED", standard: selected, candidates: [selected], basis: "EXPLICIT_REFERENCE" };
    }
    const category = normalizedText(input.category);
    const chapter = normalizedText(input.chapter);
    const title = normalizedText(input.title);
    const scope = normalizedText(input.workScope ?? input.reportExplanation ?? input.content);
    const eligible = all.filter(item => applicable(item, code));
    const exact = eligible.filter(item => category && chapter && title && scope &&
      normalizedText(item.category) === category && normalizedText(item.chapter) === chapter &&
      normalizedText(item.title) === title && normalizedText(item.workScope) === scope);
    if (exact.length === 1) return { status: "MATCHED", standard: exact[0], candidates: exact, basis: "EXACT_FIELDS" };
    if (exact.length > 1) return { status: "NEEDS_SELECTION", candidates: exact };
    const candidates = eligible.filter(item => (title && normalizedText(item.title) === title) ||
      (category && chapter && normalizedText(item.category) === category && normalizedText(item.chapter) === chapter));
    return { status: candidates.length ? "NEEDS_SELECTION" : "UNLISTED", candidates };
  }

  return {
    list: params => listFrom(published(), params),
    match: (input, aircraftCode) => matchFrom(null, input, aircraftCode),
    snapshot() {
      const all = published();
      return {
        list: params => listFrom(all, params),
        match: (input, aircraftCode) => matchFrom(all, input, aircraftCode)
      };
    }
  };
}
