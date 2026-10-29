import test from 'node:test';
import assert from 'node:assert/strict';
import {peopleCategory,sortedPeople} from '../capability-ui/people-list.js';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

test('人员分类只按能力，兼有放行优先，其他不冒充维修',()=>{
  for(const [categories,expected] of [[['release'],'release'],[['maintenance'],'maintenance'],[['maintenance','release'],'release'],[['test_run','special'],'other'],[[],'other']]){
    assert.equal(peopleCategory({capabilities:categories.map(category=>({category}))}),expected);
  }
  assert.equal(peopleCategory(undefined),'other');
});
test('共用姓名列表显示类别人数、可访问名称及空态，不添加悬停操作',async()=>{
  const bundled=await build({entryPoints:[fileURLToPath(new URL('../capability-ui/PeopleNameList.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm'});
  const {PeopleNameList}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const byId={r:{name:'放行长姓名',capabilities:[{category:'release'},{category:'maintenance'}]},m:{name:'维修',capabilities:[{category:'maintenance'}]},o:{name:'其他',capabilities:[]}};
  const html=renderToStaticMarkup(React.createElement(PeopleNameList,{ids:['o','m','r'],byId,onPerson:()=>{}}));
  for(const label of ['放行 1人','维修 1人','其他 1人'])assert.ok(html.includes(label));
  assert.ok(html.indexOf('people-name release')<html.indexOf('people-name maintenance'));
  assert.match(html,/aria-label="放行长姓名，放行"/);
  const single=renderToStaticMarkup(React.createElement(PeopleNameList,{ids:['r'],byId,onPerson:()=>{}}));
  assert.ok(!single.includes('维修 0人')&&!single.includes('其他 0人'));
  assert.ok(renderToStaticMarkup(React.createElement(PeopleNameList,{ids:[],byId})).includes('暂无人员'));
  const source=await readFile(new URL('../capability-ui/PeopleNameList.jsx',import.meta.url),'utf8');
  assert.ok(!/onMouseEnter|onFocus|onPointerEnter/.test(source));
  const css=await readFile(new URL('../capability-ui/center.css',import.meta.url),'utf8');
  assert.match(css,/\.people-name-list \.people-name\{[^}]*max-width:100%[^}]*overflow-wrap:anywhere/);
});
test('分类、中文姓名、工号和ID稳定排序，不修改输入',()=>{
  const byId={r2:{name:'张三',employeeNo:'002',capabilities:[{category:'release'}]},r1:{name:'张三',employeeNo:'001',capabilities:[{category:'release'}]},r0:{name:'张三',employeeNo:'001',capabilities:[{category:'release'}]},a:{name:'阿明',capabilities:[{category:'release'}]},m:{name:'阿明',capabilities:[{category:'maintenance'}]},o:{name:'阿明',capabilities:[]}};
  const ids=['o','m','r2','r1','a','r0'],before=structuredClone({byId,ids});
  assert.deepEqual(sortedPeople(ids,byId),['a','r0','r1','r2','m','o']);
  assert.deepEqual({byId,ids},before);
  assert.deepEqual(sortedPeople([...ids].reverse(),byId),sortedPeople(ids,byId));
  assert.equal(sortedPeople([...ids,'r1'],byId).length,ids.length);
  assert.deepEqual(sortedPeople([],byId),[]);
});
