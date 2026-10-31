import path from 'node:path';
import fs from 'node:fs/promises';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';
import {LOCAL_DEVELOPMENT_PROFILES,requireDevelopmentBranch,localDevelopmentEnvironment,approvedLocalDevelopment,validateDevelopmentPaths} from '../local-development.mjs';

const appDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=path.dirname(appDir);
if(!(await fs.stat(path.join(root,'.git'))).isFile())throw new Error('仅允许从独立Git工作树启动本机开发服务');
const branch=execFileSync('git',['symbolic-ref','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(branch==='main')throw new Error('不要从main启动开发服务，请切换到开发分支');
const profile=requireDevelopmentBranch(branch,process.argv[2]);
if(process.argv.length>3||!Object.hasOwn(LOCAL_DEVELOPMENT_PROFILES,profile))throw new Error('请选择 info-rbac、maintenance-personnel 或 attendance-leave');
const env=localDevelopmentEnvironment(appDir,profile,process.env);
process.umask(0o077);
env.MUC_BUILD_SHA=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(!approvedLocalDevelopment(appDir,env))throw new Error('本机开发隔离配置未通过验证');
const probe=net.createServer();
await new Promise((resolve,reject)=>{probe.once('error',error=>reject(new Error(error.code==='EADDRINUSE'?`端口${env.PORT}已被占用；不会停止或替换现有服务`:'无法检查开发端口')));probe.listen(Number(env.PORT),env.HOST,()=>probe.close(resolve));});
validateDevelopmentPaths(appDir,env);
await fs.mkdir(path.dirname(env.DB_PATH),{recursive:true,mode:0o700});await fs.mkdir(env.UPLOAD_DIR,{recursive:true,mode:0o700});
validateDevelopmentPaths(appDir,env);
const actualApp=await fs.realpath(appDir);
for(const directory of [path.dirname(env.DB_PATH),env.UPLOAD_DIR]){
  if((await fs.lstat(directory)).isSymbolicLink()||!(await fs.realpath(directory)).startsWith(actualApp+path.sep))throw new Error('开发数据目录不能链接到工作树以外');
}
try{if(!(await fs.lstat(env.DB_PATH)).isFile())throw new Error('开发数据库必须是本工作树内的普通文件');}catch(error){if(error.code!=='ENOENT')throw error;}
console.log(`本机开发：${LOCAL_DEVELOPMENT_PROFILES[profile].label}`);
console.log(`分支：${branch}；地址：${env.APP_ORIGIN}`);
if(env.MUC_DEV_LAN==='true')console.log('局域网测试已显式启用，仅使用测试数据；不会更改防火墙。');
console.log('独立SQLite测试库；真实考勤同步、钉钉、COS和微信凭据均不加载。');
const child=spawn(process.execPath,['server.mjs'],{cwd:appDir,env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
child.once('error',()=>{console.error('开发服务未能启动');process.exitCode=1;});
child.once('exit',(code,signal)=>{process.exitCode=code??(['SIGINT','SIGTERM'].includes(signal)?0:1);});
