import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
const html=await fs.readFile(new URL('../public/index.html',import.meta.url),'utf8');
function extract(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0);return source.slice(start,source.indexOf('\n}',start)+2);}
function harness(){
  const selected=new Set(['one','two']),visible=['one','two'];
  const button={attrs:{},setAttribute(key,value){this.attrs[key]=value;}};
  const count={};const classes=new Set();
  const form={classList:{toggle(key,on){if(on)classes.add(key);else classes.delete(key);},contains:key=>classes.has(key)}};
  const resize={attrs:{},setAttribute(key,value){this.attrs[key]=value;}};
  const handlers=new Map();
  const input={value:'很长的验收原文'.repeat(120),selectionStart:8,selectionEnd:18,selectionDirection:'backward',scrollTop:42,setSelectionRange(a,b,c){this.selectionStart=a;this.selectionEnd=b;this.selectionDirection=c;}};
  const nodes=new Map([['#recipientToggle',button],['#recipientSelectedCount',count],['#entryForm',form],['#entryOriginalResize',resize],['#entryOriginal',input]]);
  for(const [id,node] of nodes)node.addEventListener=(name,handler)=>handlers.set(`${id}:${name}`,handler);
  const context=vm.createContext({state:{selectedRecipientIds:selected,allRecipientsInScope:true},$:id=>nodes.get(id),
    visibleRecipientIds:()=>visible,document:{activeElement:input}});
  vm.runInContext(extract('setRecipientSelection')+'\n'+extract('syncRecipientSelectionCount')+'\n'+extract('toggleRecipientSelection')+'\n'+extract('setOriginalExpanded'),context);
  context.syncRecipientCheckboxes=()=>context.syncRecipientSelectionCount();
  const start=source.indexOf('$("#recipientToggle").addEventListener('),end=source.indexOf('$("#entryDate").closest',start);
  vm.runInContext(source.slice(start,end),context);
  return {context,visible,button,count,form,resize,input,handlers};
}
test('selection button clears initial selection then selects only the current filtered people',()=>{
  const h=harness();h.context.syncRecipientSelectionCount();assert.equal(h.button.attrs['aria-label'],'清空全部已选人员');
  h.context.toggleRecipientSelection();assert.equal(h.context.state.selectedRecipientIds.size,0);assert.equal(h.context.state.allRecipientsInScope,false);
  h.visible.splice(0,2,'two');h.context.syncRecipientSelectionCount();
  assert.equal(h.button.attrs['aria-label'],'全选当前搜索和分类中的人员');
  h.context.toggleRecipientSelection();assert.deepEqual([...h.context.state.selectedRecipientIds],['two']);assert.equal(h.count.textContent,'已选 1 人');
});
test('manual selections including hidden people clear without a hidden click counter',()=>{
  const h=harness();h.context.state.selectedRecipientIds=new Set(['hidden']);h.visible.splice(0);
  h.context.syncRecipientSelectionCount();assert.equal(h.button.disabled,false);
  h.context.toggleRecipientSelection();assert.equal(h.context.state.selectedRecipientIds.size,0);
  assert.equal(h.button.disabled,true);
  h.visible.push('new-match');h.context.syncRecipientSelectionCount();assert.equal(h.button.disabled,false);
  h.context.toggleRecipientSelection();assert.deepEqual([...h.context.state.selectedRecipientIds],['new-match']);
});
test('existing record selections and all-in-scope defaults become explicit only on user action',()=>{
  const h=harness();h.context.syncRecipientSelectionCount();assert.equal(h.context.state.allRecipientsInScope,true);
  h.context.setRecipientSelection(['existing']);h.context.toggleRecipientSelection();assert.equal(h.context.state.selectedRecipientIds.size,0);
});
test('only the recipient picker shortens the all-people label',()=>{
  const context=vm.createContext({personnelSelectionOptions:()=>[{value:'',label:'全部人员'},{value:'team:四组',label:'四组'}],escapeHtml:x=>x});
  vm.runInContext(extract('personnelSelectionOptionsHtml'),context);
  assert.match(context.personnelSelectionOptionsHtml([]),/>全部人员</);
  assert.match(context.personnelSelectionOptionsHtml([],'','全部'),/>全部</);
  assert.match(source,/personnelSelectionOptionsHtml\(people, currentTeam, "全部"\)/);
});
test('original height toggle keeps text, selection direction and scroll position',()=>{
  const h=harness(),text=h.input.value;const click=h.handlers.get('#entryOriginalResize:click');
  click();assert.equal(h.form.classList.contains('original-expanded'),true);assert.equal(h.resize.textContent,'收起');assert.equal(h.resize.attrs['aria-expanded'],'true');
  assert.equal(h.input.value,text);assert.deepEqual([h.input.selectionStart,h.input.selectionEnd,h.input.selectionDirection,h.input.scrollTop],[8,18,'backward',42]);
  click();assert.equal(h.resize.textContent,'放大');assert.equal(h.resize.attrs['aria-expanded'],'false');
  h.context.setOriginalExpanded(true);h.context.setOriginalExpanded(false);assert.equal(h.form.classList.contains('original-expanded'),false);
  assert.match(extract('resetRecordForm'),/setOriginalExpanded\(false\)/);
});
test('pointer activation preserves textarea focus without interfering with other focused controls',()=>{
  const h=harness();let prevented=0;const pointer=h.handlers.get('#entryOriginalResize:pointerdown');
  pointer({preventDefault:()=>prevented++});assert.equal(prevented,1);
  h.context.document.activeElement=null;pointer({preventDefault:()=>prevented++});assert.equal(prevented,1);
});
test('entry markup and scoped mobile styles define compact rows without globally changing input sizes',()=>{
  assert.equal(html.includes('id="recipientSelectAll"'),false);assert.equal(html.includes('id="recipientClearAll"'),false);
  assert.match(html,/id="recipientToggle"[^>]*>选择<\/button>/);
  assert.match(html,/class="entry-meta"><label[^]*?id="entryDate"[^]*?id="entryCategory"/);
  assert.match(html,/#entryForm \.entry-meta\{grid-template-columns:minmax\(0,1\.1fr\) minmax\(0,1fr\)/);
  assert.match(html,/grid-template-columns:minmax\(0,1fr\) minmax\(0,74px\) minmax\(0,48px\)/);
  assert.match(html,/#entryForm #entryDate,#entryForm #entryCategory,#entryForm #recipientTeamFilter\{font-size:13px!important/);
  assert.match(html,/#entryDialog \.recipient-tools input\{grid-column:auto;font-size:16px!important/);
  assert.match(html,/height:clamp\(144px,45dvh,320px\)/);
  assert.match(html,/#entryDate::-webkit-date-and-time-value\{min-width:0;text-align:left\}/);
  assert.match(html,/name="viewport" content="width=device-width, initial-scale=1"/);
});

test('nested date label grids cannot create an intrinsic-width column or a mismatched native control height',()=>{
  assert.match(html,/#entryForm \.entry-meta>label\{width:100%;min-width:0;max-width:100%;grid-template-columns:minmax\(0,1fr\);align-content:start\}/);
  assert.match(html,/#entryForm \.entry-meta>label\{grid-template-rows:auto 44px;align-items:start\}/);
  assert.match(html,/#entryForm #entryDate,#entryForm #entryCategory\{[^}]*height:44px;min-height:44px;max-height:44px;block-size:44px;box-sizing:border-box;margin:0/);
  assert.match(html,/#entryForm #entryDate\{-webkit-appearance:none;appearance:none\}/);
  assert.match(html,/id="entryDate" type="date" required/);
});
