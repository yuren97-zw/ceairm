import {build} from 'esbuild';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'handover-ui-'));
await build({entryPoints:['tests/fixtures/handover-ui.jsx'],outfile:path.join(dir,'handover-ui.js'),bundle:true,jsx:'automatic',format:'esm',loader:{'.css':'text'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'test-status-form-export',setup(b){b.onLoad({filter:/capability-ui\/Center\.jsx$/},async a=>({contents:await fs.readFile(a.path,'utf8')+'\nexport {StatusForm};',loader:'jsx',resolveDir:path.dirname(a.path)}));}}]});
const html=await fs.readFile('tests/fixtures/handover-ui.html');
http.createServer(async(req,res)=>{if(req.url==='/handover-ui.js'){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(path.join(dir,'handover-ui.js')));}else{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);}}).listen(0,'127.0.0.1',function(){console.log('HANDOVER_UI_URL=http://127.0.0.1:'+this.address().port);});
