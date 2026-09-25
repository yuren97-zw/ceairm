import { LABELS } from '../capability-core.mjs';
const rank={release:0,test_run:1,maintenance:2,special:3,third_party:4,other:5};
export const sortedCapabilities=person=>[...person.capabilities].sort((a,b)=>(rank[a.category]??7)-(rank[b.category]??7)||a.code.localeCompare(b.code));
export function capabilityLabel(p){return p.shortName.replaceAll('A319/A320/A321','A320系列').replace('航线维修放行','放行').replace('飞机维修','维修').replace('发动机试车（慢车）','慢车').replace('发动机试车（高功率）','高功率');}
export function matchesCapabilityFilters(p,filters){return !filters.length||p.capabilities.some(c=>filters.includes(c.category));}

// Display-only aggregation. Stable project codes prevent administrator edits to
// project names from silently changing which authorizations are paired.
export const CARD_CAPABILITY_GROUPS=Object.freeze([
  {key:'card:release-a320',kind:'release',label:'放行A320系列',codes:['WX-01-01-05-01-01-01','WX-01-01-06-01-01-01']},
  {key:'card:release-b737',kind:'release',label:'放行737系列',codes:['WX-01-02-05-01-01-01','WX-01-02-06-01-01-01']}
]);

const A320_TEST_CODES=Object.freeze([
  {letter:'C',slow:'WX-01-01-05-01-11',high:'WX-01-01-05-01-11-01'},
  {letter:'V',slow:'WX-01-01-05-01-12',high:'WX-01-01-05-01-12-01'},
  {letter:'L',slow:'WX-01-01-06-01-09',high:'WX-01-01-06-01-09-01'}
]);

const A320_RELEASE_CODES=new Set([
  'WX-01-01-05-01-01-01',
  'WX-01-01-06-01-01-01',
  'WX-01-01-12-01-01-01'
]);
const B737_RELEASE_CODES=new Set([
  'WX-01-02-05-01-01-01',
  'WX-01-02-06-01-01-01'
]);
const releaseTone=code=>A320_RELEASE_CODES.has(code)?'release-a320':B737_RELEASE_CODES.has(code)?'release-b737':'release-other';

export function cardCapabilities(p,limit=4,keys=null,filters=[]){
  const list=sortedCapabilities(p).filter(c=>(!filters.length?keys==null||keys.includes(c.key):filters.includes(c.category)));
  const byCode=new Map(),consumed=new Set(),display=[];
  list.forEach((item,index)=>byCode.set(item.code,[...(byCode.get(item.code)||[]),{item,index}]));
  for(const group of CARD_CAPABILITY_GROUPS){
    if(group.codes.some(code=>!byCode.has(code)))continue;
    const members=group.codes.flatMap(code=>byCode.get(code));
    members.forEach(member=>consumed.add(member.item.key));
    display.push({key:group.key,label:group.label,kind:group.kind,tone:group.kind==='release'?releaseTone(group.codes[0]):undefined,title:members.map(member=>member.item.name).join('\n'),order:Math.min(...members.map(member=>member.index))});
  }
  const testCodes=new Map(A320_TEST_CODES.flatMap(({letter,slow,high})=>[[slow,{letter,power:'slow'}],[high,{letter,power:'high'}]]));
  const a320Tests=list.map((item,index)=>({item,index,match:item.category==='test_run'?testCodes.get(item.code):null})).filter(entry=>entry.match);
  if(a320Tests.length){
    const power=a320Tests.some(entry=>entry.match.power==='high')?'高功率':'慢车';
    const letters=A320_TEST_CODES.map(({letter})=>letter).filter(letter=>a320Tests.some(entry=>entry.match.letter===letter));
    a320Tests.forEach(entry=>consumed.add(entry.item.key));
    display.push({key:'card:test-a320',label:`A320 ${power} · ${letters.join(' · ')}`,kind:'test_run',tone:power==='高功率'?'test-high':'test-slow',title:a320Tests.map(entry=>entry.item.name).join('\n'),order:Math.min(...a320Tests.map(entry=>entry.index))});
  }
  list.forEach((item,index)=>{if(!consumed.has(item.key))display.push({key:item.key,label:capabilityLabel(item),kind:item.category,tone:item.category==='release'?releaseTone(item.code):undefined,title:item.name||capabilityLabel(item),order:index});});
  display.sort((a,b)=>a.order-b.order);
  return {items:display.slice(0,limit),extra:Math.max(0,display.length-limit)};
}
