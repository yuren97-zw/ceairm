// Read-only evidence inventory; never changes acceptance status or executes evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [specPath,output]=process.argv.slice(2);
if(!specPath||!path.isAbsolute(specPath)||!output||!path.isAbsolute(output)||process.argv.length!==4)throw Error('Usage: node script ABSOLUTE_SPEC ABSOLUTE_NEW_OUTPUT_DIRECTORY');
const raw=await fs.readFile(path.join(root,'docs/MAINTENANCE_V10_1_ACCEPTANCE.json'),'utf8'),manifest=JSON.parse(raw),spec=await fs.readFile(specPath,'utf8');
const digest=text=>createHash('sha256').update(text).digest('hex');
if(digest(spec)!==manifest.sha256)throw Error('Specification digest differs from the acceptance source');
if(manifest.cases.length!==210||new Set(manifest.cases.map(c=>c.id)).size!==210)throw Error('Expected 210 unique design cases');
const source=new Map([...spec.matchAll(/^\| (P0-\d+) \| (.+)$/gm)].map(m=>[m[1],m[0]]));
const rows=[];
for(const c of manifest.cases){
 const evidence=[];
 for(const entry of c.evidence||[]){
  const [file,description]=entry.split(/\s+::\s+/,2),label=file.startsWith('tests/')?description:null,target=path.resolve(root,file);
  if(!target.startsWith(root+path.sep)){evidence.push({entry,kind:'external-or-invalid',exists:false});continue;}
  try{const body=await fs.readFile(target,'utf8');evidence.push({entry,kind:label?'named-test':'artifact',exists:true,sha256:digest(body),...(description&&!label?{description}:{}),...(label?{literalTestLabelFound:body.includes(label)}:{})});}
  catch(error){if(error.code!=='ENOENT'&&error.code!=='EISDIR')throw error;evidence.push({entry,kind:label?'named-test':'artifact',exists:false});}
 }
 rows.push({id:c.id,scenario:c.scenario,requirement:c.requirement,status:c.status,sourceRowFound:source.has(c.id),sourceRow:source.get(c.id)||null,sourceLineMatches:spec.split('\n')[c.sourceLine-1]?.includes('| '+c.id+' |')||false,evidence,limitation:c.limitation||null,inventoryClass:!evidence.length?'NO_LINKED_EVIDENCE':evidence.some(e=>!e.exists)?'MISSING_LINKED_FILE':evidence.some(e=>e.literalTestLabelFound===false)?'TEST_LABEL_REQUIRES_REVIEW':'LINKS_READABLE_SCOPE_UNPROVEN'});
}
const counts={};for(const row of rows)counts[row.inventoryClass]=(counts[row.inventoryClass]||0)+1;
const report={generatedAt:new Date().toISOString(),specificationSha256:digest(spec),manifestSha256:digest(raw),designCases:210,counts,sourceRowsFound:rows.filter(r=>r.sourceRowFound).length,statusCounts:rows.reduce((n,r)=>(n[r.status]=(n[r.status]||0)+1,n),{}),warning:'File existence and literal test labels do not prove behavior, coverage, current runtime equivalence or acceptance. This inventory never promotes any case.',cases:rows};
await fs.mkdir(output,{recursive:false});await fs.writeFile(path.join(output,'traceability.json'),JSON.stringify(report,null,2)+'\n');
const md=['# V10.1 全方案证据挂接核对','','本报告只核对原方案摘要、210个唯一编号、来源行及已挂接文件/测试名称；不运行测试，不把文件存在当成需求通过，也不修改验收状态。','',`方案来源：${report.specificationSha256}`,`台账状态：${JSON.stringify(report.statusCounts)}`,`证据挂接分类：${JSON.stringify(counts)}`,'','| 编号 | 场景 | 原状态 | 挂接核对 | 来源行匹配 |','|---|---|---|---|---|',...rows.map(r=>`| ${r.id} | ${r.scenario.replaceAll('|','／')} | ${r.status} | ${r.inventoryClass} | ${r.sourceLineMatches?'是':'需核对'} |`),'','NO_LINKED_EVIDENCE表示台账未挂接，不能推定功能不存在。MISSING_LINKED_FILE须先恢复或追溯证据。TEST_LABEL_REQUIRES_REVIEW可能是名称变动、参数化测试或原引用失配，不能仅据字面搜索否定实现。LINKS_READABLE_SCOPE_UNPROVEN仍必须人工核对实际断言、运行版本、数据库/权限/UI范围。',''];
await fs.writeFile(path.join(output,'traceability.md'),md.join('\n'));console.log(JSON.stringify({output,counts,sourceRowsFound:report.sourceRowsFound,statusCounts:report.statusCounts}));
