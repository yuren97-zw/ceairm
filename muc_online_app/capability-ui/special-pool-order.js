// API indices belong to the complete destination work area, not its searched
// or capability-filtered view. Removing the source matches server move logic.
export function specialPoolDropIndex(people, sourceId, anchorId, after) {
  const remaining = people.filter(person => person.id !== sourceId);
  const anchor = remaining.findIndex(person => person.id === anchorId);
  return anchor < 0 ? null : anchor + (after ? 1 : 0);
}
