// Local display filtering only; never alters scoped personnel or statistical inputs.
export function matchesPersonSearch(person,query='') {
  const term=String(query).trim().toLocaleLowerCase();
  return !term || [person.name,person.employeeNo].some(value=>String(value??'').toLocaleLowerCase().includes(term));
}
