import assert from 'node:assert/strict';
import test from 'node:test';
import {frozenNonroutineFinalPolicy} from '../nonroutine-frozen-policy.mjs';
const participants=[{personId:'one',role:'主做'},{personId:'two',role:'检验'}];
const combinations={'主做+检验':{主做:0.7,检验:0.3},主做:{主做:1}};
const item=policy=>({policy_json:JSON.stringify(policy)});
test('in-flight proportions and verified roles resolve from the immutable submission bank',()=>{
 const original={strategy:'ROLE_COMBINATION',category:'单项工作',combination:'主做+检验',ratios:combinations['主做+检验'],combinations,valid:true,version:'submitted-v1'};
 const source=item(original);assert.deepEqual(frozenNonroutineFinalPolicy(source,'单项工作',participants),original);
 const changed=frozenNonroutineFinalPolicy(source,'工卡指令',[{personId:'one',role:'主做'},{personId:'two',role:'主做'}]);
 assert.equal(changed.version,'submitted-v1');assert.deepEqual(changed.ratios,{主做:1});assert.equal(changed.valid,true);assert.equal(source.policy_json,JSON.stringify(original));
});
test('equal-to-role changes use the submitted bank and missing historic proportions stay unavailable',()=>{
 const result=frozenNonroutineFinalPolicy(item({strategy:'EQUAL',category:'试车',version:1,roleCombinationSnapshot:{version:'old-role-version',combinations}}),'单项工作',participants);
 assert.equal(result.version,'old-role-version');assert.deepEqual(result.ratios,{主做:0.7,检验:0.3});assert.equal(result.valid,true);
 const legacy=frozenNonroutineFinalPolicy(item({strategy:'EQUAL',category:'试车',version:1}),'单项工作',participants);assert.equal(legacy.valid,false);assert.match(legacy.unavailableReason,/不能以当前配置补填/);
});
test('equal, undecided and invalid historic combinations never invent a ratio or backfill',()=>{
 const source=item({strategy:'EQUAL',category:'试车',version:1});assert.equal(frozenNonroutineFinalPolicy(source,'拖机',participants).strategy,'EQUAL');assert.equal(frozenNonroutineFinalPolicy(source,'人工除冰',participants).strategy,'UNDECIDED');
 for(const ratios of [{主做:0.7,检验:null},{主做:0.7,检验:0.8},{主做:'0.7',检验:0.3}])assert.equal(frozenNonroutineFinalPolicy(item({strategy:'ROLE_COMBINATION',category:'单项工作',version:'source-version',combinations:{'主做+检验':ratios}}),'单项工作',participants).valid,false);
 for(const raw of ['null','{}','{"strategy":"EQUAL"}'])assert.throws(()=>frozenNonroutineFinalPolicy({policy_json:raw},'单项工作',participants),{status:409});
});
