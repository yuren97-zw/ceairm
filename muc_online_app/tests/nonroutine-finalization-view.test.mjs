import assert from 'node:assert/strict';
import test from 'node:test';
import {initialFinalDraft,renderFinalizationSection,renderAllocationPreview} from '../public/nonroutine-finalization-view.mjs';
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const review={application:{category:'单项工作',chapter:'29',title:'检查',workScope:'左侧',requestedHours:2},capabilities:{readAllOpinions:true,finalize:true},
  opinions:[{personId:'r1',hours:6,basis:'PRIVATE-REVIEW'}],statistics:{trimmedMean:6.5,median:6.5},sourceParticipants:[{personId:'worker',personName:'原参与人',role:'主做'}]};
test('finalization form requires explicit recognition and role verification, never prefilling reference statistics',()=>{
  const draft=initialFinalDraft(review);assert.equal(draft.decision.recognizedHours,'');assert.equal(draft.participantsVerified,false);assert.equal(draft.admissionDecision,'');
  const html=renderFinalizationSection(review,draft,null,escape);
  assert.match(html,/name="final_recognizedHours"[^>]*value=""/);assert.match(html,/去最高、最低各1项，分母10/);assert.match(html,/PRIVATE-REVIEW/);
  assert.ok(!html.includes('type="checkbox" checked'));
  const hidden=renderFinalizationSection({...review,capabilities:{readAllOpinions:false}},draft,null,escape);assert.equal(hidden,'');
});
test('locked zero recognition shows actual channel status and separate statistical and handling months',()=>{
  const finalization={decision:{category:'单项工作',chapter:'29',title:'<认定>',workScope:'左侧',recognizedHours:0},reason:'依据',channel:{state:'NEEDS_ATTENTION'},postingReceipt:{statisticalMonth:'2026-09',handlingMonth:'2026-10'}};
  const html=renderFinalizationSection({...review,capabilities:{readAllOpinions:true,sync:true}},null,finalization,escape);
  assert.match(html,/&lt;认定>/);assert.match(html,/认定工时：<span class="nr-scope">0/);assert.match(html,/已认定，待处理/);assert.match(html,/统计归属 2026-09 · 办理账期 2026-10/);
  assert.ok(!html.includes('data-nr-finalize'));assert.match(html,/data-nr-sync/);
});
test('cancelled recognition history is explicitly unposted and never offers synchronization even with stale capabilities',()=>{
 const finalization={decision:{category:'单项工作',chapter:'29',title:'历史认定',workScope:'原范围',recognizedHours:0},reason:'历史裁定依据',channel:{state:'CANCELLED_CLOSED'}};
 const html=renderFinalizationSection({...review,capabilities:{readAllOpinions:true,sync:true}},null,finalization,escape);assert.match(html,/历史终审认定（评议已取消，未入账）/);assert.match(html,/认定工时：<span class="nr-scope">0/);assert.match(html,/历史裁定依据/);assert.doesNotMatch(html,/data-nr-sync|data-nr-finalize/);
});

test('preview distinguishes unavailable allocation from a real zero and displays complete policy changes',()=>{
  const preview={policy:{strategy:'ROLE_COMBINATION',version:'v2'},policyChanged:true,rolesChanged:true,differences:[{field:'recognizedHours',originalValue:2,proposedValue:0}],allocation:{available:true,allocations:[{personName:'原参与人',role:'检验',hours:0}],period:{month:'2026-09',state:'CLOSED'}}};
  const html=renderAllocationPreview(preview,escape);assert.match(html,/0 小时/);assert.match(html,/封账/);assert.match(html,/尚未入账/);assert.match(html,/完整策略有变化/);
  const unresolved=renderAllocationPreview({...preview,allocation:{available:false,reason:'策略未决'}},escape);assert.match(unresolved,/暂无法分配：策略未决/);assert.ok(!unresolved.includes('0 小时'));
  const incompatible=renderAllocationPreview({...preview,allocation:{...preview.allocation,deliveryCompatible:false}},escape);assert.match(incompatible,/只读计算可用/);assert.match(incompatible,/不会据此直接入账/);
});

test('changed construction facts show original and current values and require explicit same-round verification',()=>{
 const facts={available:true,changed:true,token:'a'.repeat(64),differences:[{field:'workScope',previous:'原<范围>',current:'当前范围'}],participantsChanged:true,participantIdentityChanged:true};
 const review={application:{category:'单项工作',chapter:'29',title:'检查',workScope:'原范围'},capabilities:{readAllOpinions:true,finalize:true},sourceParticipants:[{personId:'p',role:'主做'}],sourceFacts:facts,opinions:[]};
 const html=renderFinalizationSection(review,initialFinalDraft(review),null,escape);
 assert.match(html,/原评议依据已变化/);assert.match(html,/原&lt;范围>/);assert.match(html,/不能直接入账/);assert.match(html,/name="final_sourceFactsReviewed" type="checkbox"  required/);assert.match(html,/不开启第二轮/);
 const readonly=renderFinalizationSection({...review,capabilities:{readAllOpinions:true}},null,{decision:{},channel:{state:'NEEDS_ATTENTION'},sourceFacts:facts,attempts:[{detail:{code:'SOURCE_FACTS_CHANGED_AFTER_FINALIZATION'}}]},escape);
 assert.match(readonly,/入账已挂起/);assert.ok(!readonly.includes('final_sourceFactsReviewed'));
});
