// Aircraft codes are exact identifiers: no automatic model-family aliases.
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }

export function aircraftCodes(value) {
  const items = (Array.isArray(value) ? value : [value]).flatMap(item => String(item ?? "").split(/[\s,，、;；]+/u));
  return [...new Set(items.map(item => String(item).trim().toUpperCase()).filter(Boolean))];
}

export function normalizeAircraftHours(raw, opportunities) {
  if (!raw || !Array.isArray(raw.groups) || raw.groups.length > 100) throw invalid("工时机型组格式不正确，最多100组");
  const codes = new Set();
  const ids = new Set();
  const names = new Set();
  const groups = raw.groups.map(group => {
    if (!group || typeof group !== 'object') throw invalid('机型组格式不正确');
    const id = String(group.id || "").trim();
    const name = String(group.name || "").trim();
    if (!id || id.length > 100 || ids.has(id) || !name || name.length > 100 || names.has(name)) throw invalid("机型组名称和编号不能为空或重复");
    ids.add(id); names.add(name);
    const types = aircraftCodes(group.codes);
    if (!types.length || types.some(code => code.length > 40)) throw invalid(`${name}需要有效机型代码`);
    for (const code of types) {
      if (codes.has(code)) throw invalid(`机型 ${code} 不能同时属于多个工时机型组`);
      codes.add(code);
    }
    const hours = {};
    for (const opportunity of opportunities) {
      const value = group.hours?.[opportunity];
      if (value === "" || value === null || value === undefined) continue;
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0 || number > 10000 || Math.abs(number * 100 - Math.round(number * 100)) > 1e-7) throw invalid(`${name}的${opportunity}工时须大于0，最多两位小数`);
      hours[opportunity] = number;
    }
    return { id, name, codes: types, enabled: group.enabled !== false, hours };
  });
  return { groups };
}

export function resolveAircraftHours(config, aircraft, opportunity) {
  const code = String(aircraft ?? "").trim().toUpperCase();
  const group = config.groups.find(item => item.enabled && item.codes.includes(code));
  const hours = group?.hours?.[opportunity];
  return { aircraftCode: code, groupId: group?.id || "", groupName: group?.name || "", opportunity, baseHours: Number(hours) || 0, version: config.version };
}
