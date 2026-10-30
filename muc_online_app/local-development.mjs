import path from 'node:path';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {isIPv4} from 'node:net';

function privateAddress(value){return isIPv4(value)&&(/^(10\.|192\.168\.)/.test(value)||/^172\.(1[6-9]|2\d|3[01])\./.test(value));}
export function selectDevelopmentLanAddress(requested,interfaces=os.networkInterfaces()){
  const entries=Object.entries(interfaces).flatMap(([name,list])=>(list||[]).filter(x=>!x.internal&&x.family==='IPv4'&&privateAddress(x.address)).map(x=>({name,address:x.address})));
  if(requested){if(!entries.some(x=>x.address===requested))throw Error('MUC_DEV_LAN_ADDRESS必须是本机网卡上的私有IPv4');return requested;}
  const preferred=entries.filter(x=>/^en\d+$/.test(x.name)),addresses=[...new Set((preferred.length?preferred:entries).map(x=>x.address))];
  if(addresses.length!==1)throw Error('无法唯一确定局域网地址，请用MUC_DEV_LAN_ADDRESS显式选择本机私有IPv4');
  return addresses[0];
}

export function requireDevelopmentBranch(branch, requested) {
  const inferred=localProfileForBranch(branch);
  if(!inferred)throw new Error('未知开发分支，不能指定配置绕过分支检查');
  if(requested&&requested!==inferred)throw new Error('所选端口配置与当前开发分支不一致');
  return inferred;
}

export function validateDevelopmentPaths(appDir,env) {
  const actualApp=fs.realpathSync(appDir);
  for(const directory of [path.dirname(env.DB_PATH),env.UPLOAD_DIR]) {
    if(!fs.existsSync(directory))continue;
    const info=fs.lstatSync(directory),real=fs.realpathSync(directory);
    if(info.isSymbolicLink()||!info.isDirectory()||!real.startsWith(actualApp+path.sep))throw new Error('开发数据目录必须在本工作树内且不能为链接');
    if(info.mode&0o077)throw new Error('开发数据目录权限过宽，请先保护数据权限');
  }
  for(const file of [env.DB_PATH,env.DB_PATH+'-wal',env.DB_PATH+'-shm',env.DB_PATH+'-journal']) {
    let info;try{info=fs.lstatSync(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(!info.isFile()||info.nlink!==1)throw new Error('开发数据库及日志必须是独立普通文件，不能为符号链接或硬链接');
    if((info.mode&0o077)!==0)throw new Error('开发数据库及日志权限过宽，请先保护数据权限');
  }
}

export function validateDevelopmentRuntime(appDir,env) {
  if(!approvedLocalDevelopment(appDir,env))throw new Error('本机开发配置不安全：请使用 npm run start:dev');
  const branch=execFileSync('git',['symbolic-ref','--short','HEAD'],{cwd:appDir,encoding:'utf8'}).trim();
  requireDevelopmentBranch(branch,env.MUC_LOCAL_DEVELOPMENT_PROFILE);
  if(env.MUC_DEV_LAN==='true')selectDevelopmentLanAddress(env.MUC_DEV_LAN_ADDRESS);
  validateDevelopmentPaths(appDir,env);
}

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

export function localDevelopmentEnvironment(appDir, profile, ambient={},interfaces) {
  const definition=Object.hasOwn(LOCAL_DEVELOPMENT_PROFILES,profile)?LOCAL_DEVELOPMENT_PROFILES[profile]:null;
  if(!definition)throw new Error('未知本机开发配置');
  const inherited=Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TZ','TMPDIR'].filter(key=>typeof ambient[key]==='string').map(key=>[key,ambient[key]]));
  if(ambient.MUC_DEV_LAN&&!['true','false'].includes(ambient.MUC_DEV_LAN))throw new Error('MUC_DEV_LAN只能为true或false');
  const address=ambient.MUC_DEV_LAN==='true'?selectDevelopmentLanAddress(ambient.MUC_DEV_LAN_ADDRESS,interfaces):'127.0.0.1';
  return {...inherited,NODE_ENV:'development',MUC_DEV_LAN:ambient.MUC_DEV_LAN==='true'?'true':'false',HOST:ambient.MUC_DEV_LAN==='true'?'0.0.0.0':'127.0.0.1',PORT:String(definition.port),
    ...(ambient.MUC_DEV_LAN==='true'?{MUC_DEV_LAN_ADDRESS:address}:{}),
    MUC_LOCAL_DEVELOPMENT_PROFILE:profile,APP_VERSION:'local-development-'+profile,
    APP_ORIGIN:`http://${address}:${definition.port}`,COOKIE_SECURE:'false',DATABASE_URL:'',ATTENDANCE_ENV_FILE:'',
    DB_PATH:path.join(appDir,'data','local-development.sqlite'),UPLOAD_DIR:path.join(appDir,'uploads-local-development'),...disabled};
}

// An explicit development-only exception, not a blanket bypass of the 8787 guard.
export function approvedLocalDevelopment(appDir, env={}) {
  const key=env.MUC_LOCAL_DEVELOPMENT_PROFILE,profile=Object.hasOwn(LOCAL_DEVELOPMENT_PROFILES,key)?LOCAL_DEVELOPMENT_PROFILES[key]:null;
  if(!profile||!path.isAbsolute(appDir)||!appDir.includes(`${path.sep}.codex${path.sep}worktrees${path.sep}`))return false;
  if(env.NODE_ENV!=='development'||env.HOST!==(env.MUC_DEV_LAN==='true'?'0.0.0.0':'127.0.0.1')||env.PORT!==String(profile.port))return false;
  if(env.MUC_DEV_LAN==='true'&&(!privateAddress(env.MUC_DEV_LAN_ADDRESS||'')||env.APP_ORIGIN!==`http://${env.MUC_DEV_LAN_ADDRESS}:${profile.port}`))return false;
  if(env.MUC_DEV_LAN!=='true'&&env.APP_ORIGIN!==`http://127.0.0.1:${profile.port}`)return false;
  if(env.DATABASE_URL||env.ATTENDANCE_ENV_FILE||env.INITIAL_ADMIN_PASSWORD)return false;
  if(env.DB_PATH!==path.join(appDir,'data','local-development.sqlite')||env.UPLOAD_DIR!==path.join(appDir,'uploads-local-development'))return false;
  if(Object.entries(disabled).some(([key,value])=>env[key]!==value))return false;
  if(Object.entries(env).some(([key,value])=>/^(DINGTALK_|COS_|WECHAT_)/.test(key)&&String(value||'').trim()))return false;
  return true;
}

export function localSessionCookieName(appDir,env={}) {
  if(env.MUC_INTEGRATION==='true'&&env.NODE_ENV==='test'&&env.HOST==='127.0.0.1')return 'muc_integration_sid';
  return approvedLocalDevelopment(appDir,env)?'muc_dev_sid_'+env.PORT:'muc_sid';
}
