const clean = value => String(value ?? '').trim();
export function dispatchImportIdentity(raw) {
  const date = clean(raw.date), workKind = clean(raw.workKind), number = clean(raw.flightNo).toUpperCase();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`);
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) throw new Error('日期无效');
  if (!['短停','航前','航后'].includes(workKind)) throw new Error('维修机会仅支持短停、航前、航后');
  const parts = number.split('/');
  let arrival = '', departure = '';
  if (workKind === '短停') {
    if (parts.length !== 2 || !parts.every(Boolean)) throw new Error('短停须填写进港航班号/出港航班号');
    [arrival, departure] = parts.map(clean);
  } else {
    if (parts.length > 2 || (parts.length === 2 && parts[0] !== '') || !parts.at(-1)) throw new Error('航前/航后须填写单个航班号或/航班号');
    if (workKind === '航前') departure = clean(parts.at(-1)); else arrival = clean(parts.at(-1));
  }
  return {date, workKind, arrival, departure, key: JSON.stringify([date,workKind,arrival,departure])};
}
export function dispatchImportAssignments(raw, people) {
  const split = value => clean(value).split(/[,，;；\n]+/).map(clean).filter(Boolean);
  const resolve = (names, numbers) => {
    const codes = split(numbers);
    if (codes.length && codes.length !== names.length) throw new Error('工号与姓名数量或顺序不一致');
    return names.map((name,index) => {
      const matches = people.filter(p => p.name === name && (!codes.length || p.employeeNo === codes[index]));
      if (matches.length !== 1) throw new Error(`人员“${name}”${matches.length ? '存在同名，请补充工号' : '未找到、无效或不在维修范围内'}`);
      return matches[0];
    });
  };
  const releaseNames = split(raw.releaseNames);
  if (releaseNames.length !== 1) throw new Error('必须填写且只能填写一名放行人员');
  const release = resolve(releaseNames,raw.releaseNumbers), mechanics = resolve(split(raw.mechanicNames),raw.mechanicNumbers);
  const roles = {
    '短停': [['放行','例行检查','接机','送机'],['接机','送机']],
    '航前': [['放行','例行检查'],['勤务','送机']],
    '航后': [['放行','例行机外','例行发动机','例行L/G','接机'],['接机','勤务','例行机内','例行电子']]
  }[raw.workKind];
  if (!roles) throw new Error('维修机会无效');
  const result = [...release.flatMap(p => roles[0].map(role => ({personId:p.id,role,name:p.name,employeeNo:p.employeeNo}))), ...mechanics.flatMap(p => roles[1].map(role => ({personId:p.id,role,name:p.name,employeeNo:p.employeeNo})))];
  return result.filter((item,index) => result.findIndex(other => other.personId===item.personId && other.role===item.role)===index);
}
