import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url)),directory=path.join(root,'muc_online_app/migrations');
const files=(await fs.readdir(directory)).filter(f=>/^\d+_.+\.sql$/.test(f)),numbers=new Set();
for(const file of files){const number=Number(file.split('_')[0]);if(numbers.has(number))throw Error('Duplicate migration number: '+number);numbers.add(number);}
const base=process.argv[2];if(!base||! /^[0-9a-f]{40}$/.test(base))throw Error('Explicit migration baseline SHA required');
const changes=execFileSync('git',['diff','--name-status',base,'--','muc_online_app/migrations'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
if(changes.some(line=>!line.startsWith('A\t')))throw Error('Existing baseline migrations are immutable: '+changes.join(', '));
console.log('Migration numbers and baseline immutability verified.');
