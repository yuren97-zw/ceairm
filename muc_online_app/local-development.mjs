import path from 'node:path';

export const LOCAL_DEVELOPMENT_PROFILES = Object.freeze({
  'info-rbac': Object.freeze({branch:'codex/info-rbac',port:8787,label:'信息通报、账户、角色与RBAC'}),
  'maintenance-personnel': Object.freeze({branch:'codex/maintenance-personnel',port:8788,label:'维修管控、人员能力、审计与备份'}),
  'attendance-leave': Object.freeze({branch:'codex/attendance-leave',port:8792,label:'考勤与假期'})
});

const disabled = Object.freeze({
  ATTENDANCE_SYNC_ENABLED:'false',ATTENDANCE_WORKER_ENABLED:'false',ATTENDANCE_EVENTS_ENABLED:'false',
  ATTENDANCE_APPROVAL_PLANS_ENABLED:'false',ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED:'false',
  ATTENDANCE_VALIDATION_ENABLED:'false',ATTENDANCE_MANUAL_ONLY:'true'
});

export function localProfileForBranch(branch) {
  if(typeof branch!=='string')return null;
  return Object.keys(LOCAL_DEVELOPMENT_PROFILES).find(key => {
    const base=LOCAL_DEVELOPMENT_PROFILES[key].branch;
    return branch===base||branch.startsWith(base+'-')||branch.startsWith(base+'/');
  })||null;
}

export function localDevelopmentEnvironment(appDir, profile, ambient={}) {
  const definition=Object.hasOwn(LOCAL_DEVELOPMENT_PROFILES,profile)?LOCAL_DEVELOPMENT_PROFILES[profile]:null;
  if(!definition)throw new Error('未知本机开发配置');
  const inherited=Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TZ','TMPDIR'].filter(key=>typeof ambient[key]==='string').map(key=>[key,ambient[key]]));
  return {...inherited,NODE_ENV:'development',HOST:'127.0.0.1',PORT:String(definition.port),
    MUC_LOCAL_DEVELOPMENT_PROFILE:profile,APP_VERSION:'local-development-'+profile,
    APP_ORIGIN:'http://127.0.0.1:'+definition.port,COOKIE_SECURE:'false',DATABASE_URL:'',ATTENDANCE_ENV_FILE:'',
    DB_PATH:path.join(appDir,'data','local-development.sqlite'),UPLOAD_DIR:path.join(appDir,'uploads-local-development'),...disabled};
}

// An explicit development-only exception, not a blanket bypass of the 8787 guard.
export function approvedLocalDevelopment(appDir, env={}) {
  const key=env.MUC_LOCAL_DEVELOPMENT_PROFILE,profile=Object.hasOwn(LOCAL_DEVELOPMENT_PROFILES,key)?LOCAL_DEVELOPMENT_PROFILES[key]:null;
  if(!profile||!path.isAbsolute(appDir)||!appDir.includes(`${path.sep}.codex${path.sep}worktrees${path.sep}`))return false;
  if(env.NODE_ENV!=='development'||env.HOST!=='127.0.0.1'||env.PORT!==String(profile.port))return false;
  if(env.DATABASE_URL||env.ATTENDANCE_ENV_FILE||env.INITIAL_ADMIN_PASSWORD)return false;
  if(env.DB_PATH!==path.join(appDir,'data','local-development.sqlite')||env.UPLOAD_DIR!==path.join(appDir,'uploads-local-development'))return false;
  if(Object.entries(disabled).some(([key,value])=>env[key]!==value))return false;
  if(Object.entries(env).some(([key,value])=>/^(DINGTALK_|COS_|WECHAT_)/.test(key)&&String(value||'').trim()))return false;
  return true;
}

export function localSessionCookieName(appDir,env={}) {
  return approvedLocalDevelopment(appDir,env)?'muc_dev_sid_'+env.PORT:'muc_sid';
}
