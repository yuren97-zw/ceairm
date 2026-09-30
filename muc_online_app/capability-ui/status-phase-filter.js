export const STATUS_PHASE_OPTIONS=[
  ['ACTIVE','进行中'],
  ['PLANNED','计划中'],
  ['ENDED','已结束'],
  ['CANCELLED','已取消']
];

export const defaultStatusPhases=()=>['ACTIVE','PLANNED'];

export function toggleStatusPhase(current,code){
  if(current.includes(code))return current.length===1?current:current.filter(value=>value!==code);
  return STATUS_PHASE_OPTIONS.map(([value])=>value).filter(value=>current.includes(value)||value===code);
}
