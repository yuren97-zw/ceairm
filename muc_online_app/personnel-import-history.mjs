// Request-local lookup only: permissions are evaluated afresh on every request.
export function importHistoryContext(db, access, user, batches, employeeNo) {
  const rows = new Map(batches.map(batch => {
    let value; try { value = JSON.parse(batch.rows_json || '[]'); } catch { value = []; }
    return [batch.id, value];
  }));
  const numbers = [...new Set([...rows.values()].flat().map(employeeNo).filter(Boolean))];
  const people = new Map(), allowed = new Set();
  const scope = access.predicate(user, 'personnel');
  for (let offset = 0; offset < numbers.length; offset += 500) {
    const chunk = numbers.slice(offset, offset + 500), marks = chunk.map(() => '?').join(',');
    for (const person of db.prepare(`select id,employee_no from personnel where employee_no in (${marks})`).all(...chunk)) people.set(person.employee_no, person);
    for (const person of db.prepare(`select p.id from personnel p where p.employee_no in (${marks}) and (${scope.sql})`).all(...chunk, ...scope.params)) allowed.add(person.id);
  }
  return { rows, people, allowed, hasAll: access.hasAll(user, 'personnel') };
}
