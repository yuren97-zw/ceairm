import { useMemo, useRef, useState } from "react";
import { defaultPriorityProjectKeys } from "./priority-projects";
import { defaultCardLabelKeys } from "./card-labels";

const CATEGORIES = [
  ["all", "全部"], ["release", "放行"], ["test_run", "试车"],
  ["maintenance", "维修"], ["special", "专项"], ["third_party", "三方"], ["other", "其他"],
];

function projectLabel(project) {
  return project.shortName.replace("A320系列", "A320");
}

export function PriorityProjectSettings({ projects, value, cardLabels = [], onSave, onClose }) {
  const available = useMemo(() => projects, [projects]);
  const projectByKey = useMemo(() => Object.fromEntries(available.map((project) => [project.key, project])), [available]);
  const [draft, setDraft] = useState(value);
  const [cardDraft, setCardDraft] = useState(cardLabels);
  const [category, setCategory] = useState("all");
  const [filter, setFilter] = useState("");
  const [draggedKey, setDraggedKey] = useState(null);
  const [message, setMessage] = useState("");
  const [cardFilter, setCardFilter] = useState("");
  const [optionsHeight, setOptionsHeight] = useState(118);
  const cardResize = useRef(null);
  const selected = draft.map((key) => projectByKey[key]).filter(Boolean);
  const selectedSet = new Set(draft);
  const cardSet = new Set(cardDraft);
  const needle = filter.trim().toLowerCase();
  const candidates = available.filter((project) => (category === "all" || project.category === category) && (!needle || `${project.code}${project.shortName}`.toLowerCase().includes(needle)));
  const cardNeedle = cardFilter.trim().toLowerCase();
  const cardCandidates = available.filter((project) => !cardNeedle || `${project.code}${project.shortName}`.toLowerCase().includes(cardNeedle));

  function toggle(key) {
    if (selectedSet.has(key)) {
      if (draft.length === 1) { setMessage("至少需要保留一个重点项目"); return; }
      setDraft(draft.filter((item) => item !== key));
    } else {
      setDraft([...draft, key]);
    }
    setMessage("");
  }

  function move(key, targetIndex) {
    const next = draft.filter((item) => item !== key);
    next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, key);
    setDraft(next);
  }

  function toggleCard(key) {
    setCardDraft((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function startCardResize(event) {
    cardResize.current = { startY: event.clientY, startHeight: optionsHeight };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function moveCardResize(event) {
    if (!cardResize.current) return;
    const delta = cardResize.current.startY - event.clientY;
    setOptionsHeight(Math.max(60, Math.min(320, cardResize.current.startHeight + delta)));
  }
  function endCardResize() { cardResize.current = null; }

  return (
    <div className="compact-overlay" onClick={onClose}>
      <section className="priority-project-settings" onClick={(event) => event.stopPropagation()}>
        <header><div><span className="section-kicker">双视图共享配置</span><h2>重点项目选择与排序</h2><p>选中项目将联动矩阵、预警、调配影响、雷达图和紧凑对比。</p></div><button className="modal-close" aria-label="关闭" onPointerDown={(event) => event.stopPropagation()} onClick={onClose} type="button">×</button></header>
        <div className="priority-settings-body">
          <section className="priority-catalog">
            <div className="priority-filter"><div className="compact-tabs">{CATEGORIES.map(([key, label]) => <button className={category === key ? "active" : ""} key={key} onClick={() => setCategory(key)} type="button">{label}</button>)}</div><input placeholder="搜索项目代码或名称" value={filter} onChange={(event) => setFilter(event.target.value)} /></div>
            <div className="priority-candidate-list">{candidates.map((project) => <label className={selectedSet.has(project.key) ? "selected" : ""} key={project.key}><input checked={selectedSet.has(project.key)} onChange={() => toggle(project.key)} type="checkbox" /><span><strong>{projectLabel(project)}</strong><small>{project.code}</small></span></label>)}</div>
          </section>
          <section className="priority-selected-list">
            <header><div><strong>已选重点项目</strong><span>{selected.length}项</span></div><small>拖拽排序 · 聚焦后使用 Alt+↑↓</small></header>
            <div>{selected.map((project, index) => <div className={`priority-selected-row ${draggedKey === project.key ? "dragging" : ""}`} draggable key={project.key} onDragStart={() => setDraggedKey(project.key)} onDragEnd={() => setDraggedKey(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedKey) move(draggedKey, index); setDraggedKey(null); }} tabIndex="0" onKeyDown={(event) => { if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); move(project.key, index - 1); } if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); move(project.key, index + 1); } }}><i>⋮⋮</i><span><strong>{index + 1}. {projectLabel(project)}</strong><small>{project.code}</small></span><button aria-label={`取消${projectLabel(project)}重点项目`} onClick={() => toggle(project.key)} type="button">移除</button></div>)}</div>
          </section>
        </div>
        <section className="card-label-settings">
          <header><div><strong>卡片授权标签显示</strong><small>勾选哪些项目作为人员卡片上的授权标签</small></div><input className="card-label-search" placeholder="搜索授权标签" value={cardFilter} onChange={(event) => setCardFilter(event.target.value)} /><span>{cardDraft.length}项</span></header>
          <div className="card-label-options" style={{ height: optionsHeight }}>{cardCandidates.map((project) => <label className={cardSet.has(project.key) ? "selected" : ""} key={project.key}><input checked={cardSet.has(project.key)} onChange={() => toggleCard(project.key)} type="checkbox" /><span>{projectLabel(project)}</span></label>)}</div>
          <div className="card-label-resize" role="separator" aria-orientation="horizontal" aria-label="调整卡片授权标签显示区域高度" tabIndex="0" onPointerDown={startCardResize} onPointerMove={moveCardResize} onPointerUp={endCardResize} onKeyDown={(event) => { if (event.key === "ArrowUp") { event.preventDefault(); setOptionsHeight((h) => Math.max(60, h - 10)); } if (event.key === "ArrowDown") { event.preventDefault(); setOptionsHeight((h) => Math.min(320, h + 10)); } }}><span /></div>
          <button className="card-label-reset" onClick={() => setCardDraft(defaultCardLabelKeys(projects))} type="button">恢复默认标签</button>
        </section>
        <footer><span className="priority-message">{message}</span><button onClick={() => { setDraft(defaultPriorityProjectKeys(projects)); setMessage(""); }} type="button">恢复默认重点</button><button className="primary" onClick={() => onSave(draft, cardDraft)} type="button">保存</button></footer>
      </section>
    </div>
  );
}
