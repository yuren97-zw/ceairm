// Keep only status-registration dialogs inside the visible viewport (keyboard or pinch zoom).
export function bindStatusDialogViewport(target, win = window) {
  const viewport = win.visualViewport;
  const media = win.matchMedia('(max-width:750px)');
  const keys = ['--status-view-top', '--status-view-left', '--status-view-width', '--status-view-height'];
  let frame = null;
  const clear = () => keys.forEach(key => target.style.removeProperty(key));
  const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
  const offset = value => Number.isFinite(value) && value >= 0 ? value : 0;
  const update = () => {
    frame = null;
    if (!media.matches) { clear(); return; }
    const values = [offset(viewport?.offsetTop), offset(viewport?.offsetLeft),
      positive(viewport?.width, win.innerWidth), positive(viewport?.height, win.innerHeight)];
    values.forEach((value, index) => target.style.setProperty(keys[index], `${value}px`));
  };
  const schedule = () => { if (frame === null) frame = win.requestAnimationFrame(update); };
  const listeners = [[win, 'resize'], [win, 'orientationchange'], [media, 'change'],
    ...(viewport ? [[viewport, 'resize'], [viewport, 'scroll']] : [])];
  listeners.forEach(([source, event]) => source.addEventListener(event, schedule));
  update();
  return () => {
    listeners.forEach(([source, event]) => source.removeEventListener(event, schedule));
    if (frame !== null) win.cancelAnimationFrame(frame);
    clear();
  };
}
