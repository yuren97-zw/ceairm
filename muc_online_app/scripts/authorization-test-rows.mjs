// Upgrade existing regression fixtures to the required nine-field contract.
export function authorizationRows(rows){
 const [header,...data]=rows;
 const extra=['授权类型','授权单位','授权状态'].filter(k=>!header.includes(k));
 const out=[...header,...extra];
 return [out,...data.map(row=>!row.length?row:out.map(k=>{
  const value=row[header.indexOf(k)];
  return value??({'授权类型':'145','授权单位':'本单位','授权状态':'有效'}[k]??'');
 }))];
}
