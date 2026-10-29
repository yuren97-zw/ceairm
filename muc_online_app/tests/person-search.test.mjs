import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {matchesPersonSearch} from '../capability-ui/person-search.js';
import {matchesCapabilityFilters,headcountTone} from '../capability-ui/capability-display.js';

test('sandbox searches partial names and employee numbers, trims and handles missing fields',()=>{
  const p={name:'张三',employeeNo:'05400210',capabilities:[{category:'release'}]};
  for(const query of ['','  ','张','张三',' 0540 ','210'])assert.equal(matchesPersonSearch(p,query),true);
  for(const query of ['李四','05400310'])assert.equal(matchesPersonSearch(p,query),false);
  assert.equal(matchesPersonSearch({},'abc'),false);
  assert.equal(matchesPersonSearch({employeeNo:5400210},'5400'),true);
  assert.equal(matchesPersonSearch({name:'Test'},'TEST'),true);
  assert.equal(matchesCapabilityFilters(p,['release'])&&matchesPersonSearch(p,'张'),true);
  assert.equal(matchesCapabilityFilters(p,['maintenance'])&&matchesPersonSearch(p,'张'),false);
});

test('search covers visible sandbox pools without filtering statistical or drag source data',()=>{
  const source=fs.readFileSync(new URL('../capability-ui/Center.jsx',import.meta.url),'utf8');
  assert.match(source,/people-total[^]*?people-search/);
  assert.equal((source.match(/matchesPersonSearch\(p,peopleSearch\)/g)||[]).length,3);
  assert.match(source,/query=\{peopleSearch\}/);
  assert.match(source,/calculate\(snap.people,snap.projects,states,snap.config,basis\)/);
  assert.match(source,/card\(p,g,total.indexOf\(p\)\)/);
  assert.match(source,/specialPoolDropIndex\(rowsFor\(group\)/);
});

test('scoped search layout shrinks and mobile typing keeps a 16px font',()=>{
  const css=fs.readFileSync(new URL('../capability-ui/center.css',import.meta.url),'utf8');
  assert.match(css,/\.people-title>\.people-search\{[^}]*min-width:0;max-width:116px/);
  assert.match(css,/@media\(max-width:600px\)\{[^]*?\.people-title>\.people-search\{[^}]*font-size:16px/);
});

test('matrix headcounts come from configured thresholds, preserve zero and center only group headers',()=>{
  const source=fs.readFileSync(new URL('../capability-ui/Center.jsx',import.meta.url),'utf8');
  assert.match(source,/matrix-group-heading[^]*?matrix-headcount[^]*?snap.config.headcounts\?\.\[g\]\?\?"—"/);
  assert.match(source,/model.stats\[g\]\.actual.length\}<\/span>\/\{snap.config.headcounts/);
  const css=fs.readFileSync(new URL('../capability-ui/center.css',import.meta.url),'utf8');
  assert.match(css,/\.matrix-row.head>\.matrix-group-heading\{[^}]*align-items:center[^}]*text-align:center/);
  assert.match(css,/\.matrix-row.head \.matrix-headcount\{[^}]*font-size:9px[^}]*font-weight:400/);
});

test('only actual header count is green at or above threshold, dark red below; unknown stays neutral',()=>{
  for(const [actual,target] of [[28,28],[29,28],[0,0],[5,0]])assert.equal(headcountTone(actual,target),'sufficient');
  for(const [actual,target] of [[27,28],[0,1]])assert.equal(headcountTone(actual,target),'shortage');
  for(const [actual,target] of [[1,undefined],[1,null],[1,NaN],[undefined,1],[1,-1]])assert.equal(headcountTone(actual,target),'');
  const css=fs.readFileSync(new URL('../capability-ui/center.css',import.meta.url),'utf8');
  assert.match(css,/\.matrix-row.head \.matrix-headcount-actual.sufficient\{color:#18845b\}/);
  assert.match(css,/\.matrix-row.head \.matrix-headcount-actual.shortage\{color:#963e44\}/);
});
