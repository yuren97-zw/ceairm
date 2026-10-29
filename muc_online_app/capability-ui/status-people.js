export const STATUS_PEOPLE_COLUMNS = [['DEPLOYED','派驻中'],['TRAINING','培训中'],['OTHER','其他状态']];

export function statusPeopleColumns(snap, sort = 'endDate') {
  const people = new Map(snap.people.map(person => [person.id, person]));
  const records = new Map(snap.records.map(record => [record.id, record]));
  return STATUS_PEOPLE_COLUMNS.map(([kind, title]) => ({kind, title,
    items: snap.states.filter(state => state.status === kind).map(state => ({
      state, person: people.get(state.personId), record: records.get(state.recordId)
    })).filter(item => item.person && (!item.record || item.record.phase === 'ACTIVE'))
      .sort((a,b) => (sort === 'group' ? compareGroups(a,b) : 0)
        || (a.record?.end_date || '9999-12-31').localeCompare(b.record?.end_date || '9999-12-31')
        || a.person.name.localeCompare(b.person.name, 'zh-CN') || a.person.id.localeCompare(b.person.id))
  }));
}

function compareGroups(a,b) {
  const left = statusPersonGroup(a.person,a.state), right = statusPersonGroup(b.person,b.state);
  const rank = group => {
    const index = ['一组','二组','三组','四组','特殊组'].indexOf(group);
    return index >= 0 ? index : group === '待调配' ? 6 : 5;
  };
  return rank(left) - rank(right) || left.localeCompare(right,'zh-CN');
}

export function statusPersonGroup(person, state) {
  if (person.personnelGroupCode === 'GROUP-LINE-SPECIAL') return '特殊组';
  const group = person.administrativeGroup || state.administrativeGroup;
  if (['一组','二组','三组','四组'].includes(group)) return group;
  const label = person.administrativeUnit;
  return label && label !== '未分配' ? label : '待调配';
}

export function statusPersonEnd(endDate, currentDay) {
  if (!endDate) return {text: '结束未定', soon: false};
  const parsed = Date.parse(`${endDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !Number.isFinite(parsed)
      || new Date(parsed).toISOString().slice(0,10) !== endDate) return {text: '结束待核实', soon: false};
  const remaining = Math.round((parsed - Date.parse(`${currentDay}T00:00:00Z`)) / 86400000);
  if (remaining < 0) return {text: '结束日期已过', soon: false};
  return {text: remaining === 0 ? '今天结束' : `${remaining}天后结束`, soon: remaining <= 7};
}
