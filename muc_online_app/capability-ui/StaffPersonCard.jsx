import { useEffect, useRef, useState } from "react";
import { cardCapabilities } from "./capability-display";
import { ThirdPartyAuthorizationGroups } from "./ThirdPartyAuthorizationGroups.jsx";

const AUTHORIZATION_CATEGORIES = [["release", "放行"], ["test_run", "试车"], ["maintenance", "维修"], ["special", "专项"], ["third_party", "三方"], ["other", "其他"]];
const hoverAuthorizationCache = new Map();
const PERSON_HOVER_DELAY_MS = 500;

function licenseLabel(person) {
  return person.licenses.map((item) => item.type.replace("执照", "")).join("+") || "无执照";
}

export function usePersonHover(draggedPerson) {
  const [hoverDetail, setHoverDetail] = useState(null);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);
  useEffect(() => () => { window.clearTimeout(openTimer.current); window.clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    if (!draggedPerson) return;
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    setHoverDetail(null);
  }, [draggedPerson]);
  function open(event, person, immediate = false) {
    if (draggedPerson) return;
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    const rect = event.currentTarget.getBoundingClientRect();
    openTimer.current = window.setTimeout(() => {
      const width = 360;
      const height = 500;
      const x = rect.right + width + 16 <= window.innerWidth ? rect.right + 10 : Math.max(10, rect.left - width - 10);
      const y = Math.min(Math.max(72, rect.top - 12), Math.max(72, window.innerHeight - height - 12));
      setHoverDetail({ person, x, y });
    }, immediate ? 0 : PERSON_HOVER_DELAY_MS);
  }
  function closeLater() { window.clearTimeout(openTimer.current); closeTimer.current = window.setTimeout(() => setHoverDetail(null), 150); }
  function keepOpen() { window.clearTimeout(closeTimer.current); }
  function closeNow() { window.clearTimeout(openTimer.current); window.clearTimeout(closeTimer.current); setHoverDetail(null); }
  return { hoverDetail, open, closeLater, keepOpen, closeNow };
}

export function StaffPersonCard({ person, group, statusText = "", planText = "", isSupport = false, highlighted = false, support = false, draggable, dragging = false, cardLabelKeys = null, capabilityFilters = [], annotation = "", onAnnotate = null, onDragStart, onDragEnd, onOpen, onHoverStart, onHoverEnd, onDragOver, onDrop, dropPosition }) {
  const { items, extra } = cardCapabilities(person, 4, cardLabelKeys, capabilityFilters);
  const planSeparator = planText.indexOf("：");
  const planLead = planSeparator >= 0 ? planText.slice(0, planSeparator + 1) : planText;
  const planDetail = planSeparator >= 0 ? planText.slice(planSeparator + 1) : "";
  return (
    <button className={`compact-person-row ${statusText || planText ? "has-status-copy" : ""} ${items.length || extra > 0 ? "has-card-capabilities" : "no-card-capabilities"} ${highlighted ? "candidate-highlight" : ""} ${dragging ? "dragging-source" : ""} ${dropPosition ? `drop-${dropPosition}` : ""} ${support ? "support-person-row" : ""}`} data-person-id={person.id} draggable={draggable} onDragStart={(event) => onDragStart(event, person)} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop} onMouseEnter={(event) => onHoverStart(event, person)} onMouseLeave={onHoverEnd} onFocus={(event) => onHoverStart(event, person, true)} onBlur={onHoverEnd} onClick={() => onOpen(person)} type="button" aria-label={`查看${person.name}能力详情，当前${group}`}>
      <span className={`compact-person-main ${statusText || planText ? "has-status-copy" : ""}`}><strong>{person.name}</strong>{statusText && <small className={`current-status ${isSupport ? "support-highlight" : ""}`} title={statusText}>{statusText}</small>}{planText && <small className="future-plan" title={planText}>{planLead}{planDetail && <><wbr />{planDetail}</>}</small>}</span>
      {(items.length > 0 || extra > 0) && <span className="compact-capabilities" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>{items.map((item) => <span className={`compact-cap-tag ${item.kind}${item.tone ? ` ${item.tone}` : ""}`} key={item.key} title={item.title||item.label}>{item.label}</span>)}{extra > 0 && <span className="compact-more">+{extra}项</span>}</span>}
      {onAnnotate && <span className={`compact-annotation ${annotation ? "has-note" : ""}`} title={annotation || "点击添加标注"} onClick={(event) => { event.stopPropagation(); onAnnotate(person); }}>{annotation || "＋标注"}</span>}
    </button>
  );
}

export function PersonHoverDetail({ detail, assignments, alerts, allLanes, laneLabel = value => value, readOnly, qualificationVisible = false, authorizationVersion = "", workspace = "", loadAuthorizations, onMove, onEnter, onLeave }) {
  const [authorization, setAuthorization] = useState({ key: "", counts: null, open: "", items: {}, loadingCounts: false, loadingCategory: "", countError: "", categoryErrors: {} });
  const [openCompany,setOpenCompany]=useState("");
  const requestToken = useRef(0);
  const person = detail?.person;
  const cacheKey = person ? `${authorizationVersion}:${person.id}` : "";
  useEffect(()=>setOpenCompany(""),[person?.id,cacheKey]);
  useEffect(() => {
    const token = ++requestToken.current;
    if (!person || !qualificationVisible || !loadAuthorizations) {
      setAuthorization({ key: cacheKey, counts: null, open: "", items: {}, loadingCounts: false, loadingCategory: "", countError: "", categoryErrors: {} });
      return;
    }
    const cached = hoverAuthorizationCache.get(cacheKey);
    if (cached?.counts) {
      setAuthorization({ key: cacheKey, counts: cached.counts, open: "", items: cached.items || {}, loadingCounts: false, loadingCategory: "", countError: "", categoryErrors: {} });
      return;
    }
    setAuthorization({ key: cacheKey, counts: null, open: "", items: cached?.items || {}, loadingCounts: true, loadingCategory: "", countError: "", categoryErrors: {} });
    loadAuthorizations(person.id, workspace).then(result => {
      if (token !== requestToken.current) return;
      const entry = { counts: result.counts || {}, items: cached?.items || {} };
      if (hoverAuthorizationCache.size > 200) hoverAuthorizationCache.clear();
      hoverAuthorizationCache.set(cacheKey, entry);
      setAuthorization(value => ({ ...value, key: cacheKey, counts: entry.counts, items: entry.items, loadingCounts: false, countError: "" }));
    }).catch(error => {
      if (token === requestToken.current) setAuthorization(value => ({ ...value, loadingCounts: false, countError: error.message || "读取授权数量失败" }));
    });
  }, [person?.id, cacheKey, workspace, qualificationVisible, loadAuthorizations]);
  if (!detail || !person) return null;
  const { x, y } = detail;
  const currentLane = assignments[person.id];
  const relatedAlerts = alerts.filter((alert) => alert.group === currentLane && person.capabilities.some((item) => item.key === alert.projectKey));
  const totalAuthorizations = authorization.counts ? Object.values(authorization.counts).reduce((sum, count) => sum + Number(count || 0), 0) : null;
  async function loadCategory(category, retry = false) {
    if (!loadAuthorizations || authorization.loadingCategory) return;
    if (!retry && authorization.items[category]) return;
    setAuthorization(value => ({ ...value, loadingCategory: category, categoryErrors: { ...value.categoryErrors, [category]: "" } }));
    try {
      const result = await loadAuthorizations(person.id, workspace, category);
      if (authorization.key !== cacheKey) return;
      const items = result.items || [];
      const cached = hoverAuthorizationCache.get(cacheKey) || { counts: authorization.counts || {}, items: {} };
      cached.items = { ...cached.items, [category]: items };
      hoverAuthorizationCache.set(cacheKey, cached);
      setAuthorization(value => value.key === cacheKey ? ({ ...value, items: { ...value.items, [category]: items }, loadingCategory: "" }) : value);
    } catch (error) {
      setAuthorization(value => value.key === cacheKey ? ({ ...value, loadingCategory: "", categoryErrors: { ...value.categoryErrors, [category]: error.message || "读取明细失败" } }) : value);
    }
  }
  function toggleCategory(category) {
    if (!Number(authorization.counts?.[category] || 0)) return;
    const opening = authorization.open !== category;
    setOpenCompany("");
    setAuthorization(value => ({ ...value, open: opening ? category : "" }));
    if (opening && !authorization.items[category]) loadCategory(category);
  }
  return (
    <aside className="person-hover-card" style={{ left: x, top: y }} onMouseEnter={onEnter} onMouseLeave={onLeave} onFocus={onEnter} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))onLeave();}} onKeyDown={event=>{if(event.key==='Escape')onLeave();}} role="dialog" aria-label={`${person.name}完整能力档案`}>
      <header><div><strong>{person.name}</strong><span>{laneLabel(currentLane)} · 工号 {person.employeeNo}</span><span>人员分组：{person.personnelGroup||'未分配'} · 行政班组：{person.administrativeUnit}</span></div><span className={person.hasLicense ? "hover-state good" : "hover-state warning"}>{person.hasLicense ? "执照已记录" : "无执照记录"}</span></header>
      <div className="hover-license-grid"><span><small>执照</small><b>{licenseLabel(person)}</b></span><span><small>英语</small><b>{person.english === "—" ? "未提供" : `${String(person.english).replace(/级$/, '')}级`}</b></span><span><small>有效授权</small><b>{qualificationVisible ? totalAuthorizations == null ? "读取中" : `${totalAuthorizations}条` : "无权限"}</b></span></div>
      <div className="hover-scroll"><h4>有效授权明细</h4>{!qualificationVisible ? <p className="empty">当前账号没有查看授权明细的权限。</p> : authorization.loadingCounts ? <p className="empty">正在读取授权数量…</p> : authorization.countError ? <p className="error">{authorization.countError}<button type="button" onClick={()=>{hoverAuthorizationCache.delete(cacheKey);setAuthorization(value=>({...value,key:"",loadingCounts:true,countError:""}));const token=++requestToken.current;loadAuthorizations(person.id,workspace).then(result=>{if(token!==requestToken.current)return;const entry={counts:result.counts||{},items:{}};hoverAuthorizationCache.set(cacheKey,entry);setAuthorization({key:cacheKey,counts:entry.counts,open:"",items:{},loadingCounts:false,loadingCategory:"",countError:"",categoryErrors:{}});}).catch(error=>{if(token===requestToken.current)setAuthorization(value=>({...value,loadingCounts:false,countError:error.message||"读取授权数量失败"}));});}}>重新加载</button></p> : AUTHORIZATION_CATEGORIES.map(([category,label])=>{const count=Number(authorization.counts?.[category]||0),open=authorization.open===category,items=authorization.items[category]||[],error=authorization.categoryErrors[category];return <section className={`person-authorization-category ${open?'expanded':''}`} key={category}><button type="button" className="person-authorization-toggle" disabled={!count} aria-expanded={open} onClick={()=>toggleCategory(category)}><span>{open?'▾':'▸'} <b>{label}</b></span><strong>{count}条</strong></button>{open&&<div className="person-authorization-items hover-authorization-items">{authorization.loadingCategory===category?<p className="empty">正在读取明细…</p>:error?<p className="error">{error}<button type="button" onClick={()=>loadCategory(category,true)}>重新加载</button></p>:category==='third_party'?<ThirdPartyAuthorizationGroups items={items} openCompany={openCompany} onToggle={setOpenCompany} renderItem={(item,label)=><article key={item.id} className="hover-authorization-name">{label}</article>}/>:items.map(item=><article key={item.id} className="hover-authorization-name">{item.projectName}</article>)}</div>}</section>;})}</div>
      {!readOnly && <section className="hover-move-section"><span>调配至</span><div tabIndex="0" aria-label="横向滚动查看全部调配目标" onWheel={(event) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) { event.currentTarget.scrollLeft += event.deltaY; event.preventDefault(); } }}>{allLanes.filter((lane) => lane !== currentLane).map((lane) => <button key={lane} onClick={() => onMove(person, lane)} type="button">{laneLabel(lane)}</button>)}</div></section>}
      <footer className={relatedAlerts.length ? "has-risk" : "no-risk"}>{relatedAlerts.length ? `关联 ${relatedAlerts.length} 项班组配置报警` : "当前未关联班组配置报警"}</footer>
    </aside>
  );
}
