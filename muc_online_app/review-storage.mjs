// Purpose is fixed by server construction, never taken from a request.
// The same round mechanics operate on separate typed source repositories.
export function reviewStorage(database,purpose='WORK'){
  if(!['WORK','STANDARD'].includes(purpose))throw Error('Unknown review purpose');
  if(purpose==='WORK')return database;
  return {kind:database.kind,prepare(sql){return database.prepare(String(sql).replaceAll('maintenance_nonroutine_review_','maintenance_standard_review_'));}};
}
