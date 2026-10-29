export const DIRECTORY_CACHE_MS=86400000;
export const DIRECTORY_REFRESH_MIN_MS=300000;
export const DIRECTORY_EXCLUDED_NOTE='事件人员未在当前授权通讯录内；保留审计，不计入考勤，目录更新后重新核对';
export const directoryScopeKey=config=>JSON.stringify([String(config.corpId||''),String(config.unifiedAppId||''),String(config.rootDepartmentId||'')]);
export function eventUserIds(payload){
 const value=payload.userIds??payload.userId??payload.userid??payload.staffId??[];
 return (Array.isArray(value)?value:String(value).split(',')).filter(id=>typeof id==='string'&&id.length>0);
}
export function directoryCacheUsable(cached,config,revision,at){
 const age=at-Date.parse(cached?.at);
 return !!config.rootDepartmentId&&cached?.scopeKey===directoryScopeKey(config)&&cached?.revision===(revision??null)&&Number.isFinite(age)&&age>=0&&age<DIRECTORY_CACHE_MS&&Array.isArray(cached.directory?.users)&&Array.isArray(cached.directory?.departments);
}
export function eventOutsideDirectory(ids,cached,config,revision,at){
 // Ambiguous encodings or malformed identifiers remain unresolved; never
 // classify a JSON-encoded list or a padded ID as authoritative exclusion.
 return !!config.corpId&&!!config.unifiedAppId&&ids.length>0&&ids.every(id=>typeof id==='string'&&id.length<=250&&!/[\s\[\]{},"']/.test(id))&&directoryCacheUsable(cached,config,revision,at)&&ids.every(id=>!cached.directory.users.some(user=>user.userId===id));
}
