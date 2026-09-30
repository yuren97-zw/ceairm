import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
const base=path.resolve(import.meta.dirname,'..');
const require=createRequire(process.env.CAPABILITY_BUILD_MODULES?path.join(process.env.CAPABILITY_BUILD_MODULES,'../package.json'):path.join(base,'package.json'));
const {build}=require('esbuild');
await fs.mkdir(path.join(base,'public/capability'),{recursive:true});
await build({entryPoints:[path.join(base,'capability-ui/Center.jsx')],outfile:path.join(base,'public/capability/module.js'),bundle:true,jsx:'automatic',format:'esm',platform:'browser',target:['es2022'],minify:true,loader:{'.css':'text'},nodePaths:process.env.CAPABILITY_BUILD_MODULES?[process.env.CAPABILITY_BUILD_MODULES]:[],define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'});
console.log('能力配置模块构建完成：public/capability/module.js');
