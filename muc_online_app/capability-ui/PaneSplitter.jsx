import { useEffect, useRef } from "react";

export function PaneSplitter({ containerRef, value, onChange, min = 0.18, max = 0.82, label }) {
  const dragging = useRef(null);

  useEffect(() => {
    function move(event) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = dragging.current.startValue + (event.clientY - dragging.current.startY) / Math.max(rect.height, 1);
      onChange(Math.max(min, Math.min(max, next)));
    }
    function stop() { dragging.current = null; }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
  }, [containerRef, max, min, onChange]);

  return (
    <div
      className="pane-splitter"
      role="separator"
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      aria-valuenow={Math.round(value * 100)}
      tabIndex="0"
      onPointerDown={(event) => { dragging.current = { startY: event.clientY, startValue: value }; event.currentTarget.setPointerCapture?.(event.pointerId); }}
      onKeyDown={(event) => {
        if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const delta = event.key === "ArrowUp" ? -0.02 : 0.02;
        onChange(Math.max(min, Math.min(max, value + delta)));
      }}
      onDoubleClick={() => onChange(null)}
      title="拖动调整高度；方向键微调；双击恢复默认"
    ><span /></div>
  );
}
