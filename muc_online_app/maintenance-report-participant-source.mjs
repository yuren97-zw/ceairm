// Read-only source contract for separating actual report participants from dispatch.
// Callers must supply persisted batch/entry rows and authoritative subtask owners.
// This module grants no access and performs no posting, allocation or dispatch write.
function invalid(message) { throw Object.assign(new Error(message), { status: 409 }); }
const text = value => typeof value === 'string' && value.trim() ? value : invalid('报工来源身份缺失');
export function reportParticipantSource({ batch, entries, subtasks = [] }) {
  if (!batch || !Array.isArray(entries) || !Array.isArray(subtasks)) invalid('报工来源结构缺失');
  const batchId = text(batch.id), flightId = text(batch.flight_id), type = batch.report_type;
  if (!['routine', 'release', 'nonroutine'].includes(type)) invalid('报工来源类别无效');
  if (!['已提报', '待复核', '已确认'].includes(batch.status)) invalid('草稿或未知状态不能作为实际报工来源');
  const version = Number(batch.version);
  if (!Number.isSafeInteger(version) || version < 1) invalid('报工来源版本无效');
  const owners = new Map();
  for (const item of subtasks) {
    if (!item || owners.has(item.id)) invalid('工作项身份重复或无效');
    owners.set(text(item.id), text(item.flight_id));
  }
  const ids = new Set(), pairs = new Set();
  const participants = entries.map(entry => {
    if (!entry || entry.batch_id !== batchId || entry.flight_id !== flightId) invalid('报工条目不属于当前批次或机会');
    const entryId = text(entry.id), ownerId = text(entry.owner_id), personId = text(entry.person_id), role = text(entry.role);
    if (ids.has(entryId)) invalid('报工条目身份重复');
    ids.add(entryId);
    if (type === 'nonroutine') {
      if (entry.owner_type !== 'subtask' || owners.get(ownerId) !== flightId || role === '放行') invalid('非例行条目缺少同机会的原工作项');
    } else if (entry.owner_type !== 'flight' || ownerId !== flightId || (type === 'release') !== (role === '放行')) invalid('例行或放行条目归属无效');
    const pair = JSON.stringify([entry.owner_type, ownerId, role, personId]);
    if (pairs.has(pair)) invalid('人员工种关联重复');
    pairs.add(pair);
    const hours = entry.standard_hours;
    if (hours !== null && hours !== undefined && (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0)) invalid('报工标准工时来源无效');
    return Object.freeze({
      sourceType: 'REPORT_ENTRY', resultIdentity: JSON.stringify([batchId, version, entryId]),
      batchId, batchVersion: version, entryId, flightId, ownerType: entry.owner_type, ownerId,
      personId, role, personNameSnapshot: entry.user_name ?? null, teamSnapshot: entry.team ?? null,
      standardHours: hours ?? null, status: batch.status
    });
  }).sort((a, b) => a.resultIdentity.localeCompare(b.resultIdentity));
  if (type === 'release' && participants.length !== 1) invalid('放行来源必须恰有一名实际放行人员');
  return Object.freeze({ sourceType: 'REPORT_BATCH', sourceIdentity: JSON.stringify([batchId, version]), batchId, version, flightId, reportType: type, status: batch.status, participants: Object.freeze(participants) });
}
