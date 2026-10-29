// Durable, transactional information changes. Never expose the global counter.
import crypto from 'node:crypto';

const sources = [
  ['records','id','','content'],
  ['record_recipients','record_id','user_id','content'],
  ['read_receipts','record_id','user_id','receipt'],
  ['favorites','record_id','user_id','favorite'],
  ['attachments','owner_id','','content']
];

export function installInfoSync(db) {
  if (db.kind === 'postgres') return; // Installed by PostgreSQL migration 020.
  db.exec(`create table if not exists info_sync_meta(id integer primary key,version integer not null,cursor_key text);
    insert or ignore into info_sync_meta(id,version) values(1,0);
    create table if not exists info_sync_changes(version integer primary key,record_id text not null,actor_id text not null,kind text not null);
    create index if not exists info_sync_record_idx on info_sync_changes(record_id,version);`);
  for (const [table,key,actor,kind] of sources) for (const operation of ['insert','update','delete']) {
    const row = operation === 'delete' ? 'old' : 'new';
    db.exec(`create trigger if not exists info_sync_${table}_${operation} after ${operation} on ${table}
      ${table === 'attachments' ? `when ${row}.owner_type='record'` : ''}
      begin
        update info_sync_meta set version=version+1 where id=1;
        insert into info_sync_changes select version,${row}.${key},${actor ? `${row}.${actor}` : "''"},'${kind}' from info_sync_meta where id=1;
        delete from info_sync_changes where version < (select version-10000 from info_sync_meta where id=1);
      end;`);
  }
}

export function createInfoSync({db, canView, canFeedback, signKey}) {
  const latest = () => Number(db.prepare('select version from info_sync_meta where id=1').get()?.version || 0);
  const scope=user=>crypto.createHash('sha256').update(JSON.stringify({permissions:user.rbacPermissions || [],scopes:user.dataScopes || [],accounts:[...(user.infoAllowedAccounts || [])].sort()})).digest('hex');
  // Random-looking authenticated cursors do not reveal another department's volume.
  const encode = (user,version) => {
    const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',signKey,iv);
    const body=Buffer.concat([cipher.update(JSON.stringify({u:user.id,v:version,s:scope(user)})),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');
  };
  const decode = (user,token) => {
    try {
      const raw=Buffer.from(String(token),'base64url'), decipher=crypto.createDecipheriv('aes-256-gcm',signKey,raw.subarray(0,12));
      decipher.setAuthTag(raw.subarray(12,28));
      const value=JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString());
      return value.u===user.id && value.s===scope(user) && Number.isSafeInteger(value.v) && value.v>=0 ? value.v : -1;
    } catch {return -1;}
  };
  function changes(user,cursor,knownIds=[]) {
    const version=latest(), from=decode(user,cursor);
    const oldest=Number(db.prepare('select min(version) as v from info_sync_changes').get()?.v || version);
    const reset=from<0 || from>version || from<oldest-1;
    const events=reset ? [] : db.prepare('select * from info_sync_changes where version>? and version<=? order by version').all(from,version);
    const ids=new Set(events.filter(e=>e.kind!=='favorite' || e.actor_id===user.id).map(e=>e.record_id));
    const rows=reset ? db.prepare('select * from records').all() : ids.size ? db.prepare(`select * from records where id in (${[...ids].map(()=>'?').join(',')})`).all(...ids) : [];
    const visible=rows.filter(row=>canView(user,row));
    const receiptIds=new Set(events.filter(e=>e.kind==='receipt' && (e.actor_id===user.id || canFeedback(user,e.actor_id))).map(e=>e.record_id));
    const contentIds=new Set(events.filter(e=>e.kind==='content' || e.kind==='favorite' && e.actor_id===user.id).map(e=>e.record_id));
    const content=visible.filter(row=>reset || contentIds.has(row.id));
    const receipt=visible.filter(row=>!contentIds.has(row.id) && receiptIds.has(row.id));
    // Known IDs originate from the caller, so removals disclose no unknown IDs.
    const known=Array.from(new Set(knownIds.map(String))).slice(0,50000);
    const current=[];
    for(let offset=0;offset<known.length;offset+=500){const chunk=known.slice(offset,offset+500);current.push(...db.prepare(`select * from records where id in (${chunk.map(()=>'?').join(',')})`).all(...chunk).filter(row=>canView(user,row)));}
    const allowed=new Set(current.map(row=>row.id));
    return {reset,content,receipt,removed:known.filter(id=>!allowed.has(id)),cursor:encode(user,version),version};
  }
  return {latest,encode,decode,changes};
}
