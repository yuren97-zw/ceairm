import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {bindStatusDialogViewport} from '../capability-ui/status-dialog-viewport.js';

function eventTarget(properties = {}) {
  const listeners = new Map();
  return Object.assign(properties, {
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    emit(name) { for (const fn of listeners.get(name) || []) fn(); },
    count() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); }
  });
}
function harness({matches = true, viewport = true} = {}) {
  const style = new Map();
  const target = {style: {setProperty: (key, value) => style.set(key, value), removeProperty: key => style.delete(key)}};
  const media = eventTarget({matches});
  const visualViewport = viewport ? eventTarget({width: 375, height: 700, offsetTop: 0, offsetLeft: 0}) : null;
  const frames = new Map(); let id = 0;
  const win = eventTarget({innerWidth: 375, innerHeight: 700, visualViewport, matchMedia: () => media,
    requestAnimationFrame: fn => { frames.set(++id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id)});
  const cleanup = bindStatusDialogViewport(target, win);
  const flush = () => { for (const [id, fn] of frames) { frames.delete(id); fn(); } };
  return {style, media, visualViewport, win, frames, flush, cleanup};
}
test('mobile keyboard resize keeps visible height and viewport offset', () => {
  const h = harness(); assert.equal(h.style.get('--status-view-height'), '700px');
  Object.assign(h.visualViewport, {height: 310, offsetTop: 42});
  h.visualViewport.emit('resize'); h.visualViewport.emit('scroll'); assert.equal(h.frames.size, 1);
  h.flush(); assert.equal(h.style.get('--status-view-height'), '310px'); assert.equal(h.style.get('--status-view-top'), '42px');
  Object.assign(h.visualViewport, {height: 700, offsetTop: 0}); h.visualViewport.emit('resize'); h.flush();
  assert.equal(h.style.get('--status-view-height'), '700px'); h.cleanup();
});
test('manual zoom can narrow and pan the visible viewport without forcing scale', () => {
  const h = harness(); Object.assign(h.visualViewport, {width: 187.5, height: 350, offsetLeft: 40, offsetTop: 50});
  h.visualViewport.emit('scroll'); h.flush(); assert.equal(h.style.get('--status-view-width'), '187.5px');
  assert.equal(h.style.get('--status-view-left'), '40px'); h.cleanup();
});
test('rotation and desktop transition clear overrides and restore mobile on return', () => {
  const h = harness(); h.media.matches = false; h.media.emit('change'); h.flush(); assert.equal(h.style.size, 0);
  h.media.matches = true; h.visualViewport.width = 430; h.win.emit('orientationchange'); h.flush();
  assert.equal(h.style.get('--status-view-width'), '430px'); h.cleanup();
});
test('desktop remains unchanged and missing visualViewport uses window dimensions', () => {
  const desktop = harness({matches: false}); assert.equal(desktop.style.size, 0); desktop.cleanup();
  const mobile = harness({viewport: false}); assert.equal(mobile.style.get('--status-view-height'), '700px'); mobile.cleanup();
});
test('closing cancels pending work and removes all listeners and styles', () => {
  const h = harness(); h.win.emit('resize'); h.cleanup(); h.flush();
  assert.equal(h.win.count() + h.media.count() + h.visualViewport.count(), 0);
  assert.equal(h.style.size, 0); assert.equal(h.frames.size, 0);
});
test('invalid transient viewport values do not collapse the dialog', () => {
  const h = harness(); Object.assign(h.visualViewport, {width: 0, height: NaN, offsetLeft: -1, offsetTop: Infinity});
  h.visualViewport.emit('resize'); h.flush(); assert.equal(h.style.get('--status-view-width'), '375px');
  assert.equal(h.style.get('--status-view-height'), '700px'); assert.equal(h.style.get('--status-view-top'), '0px'); h.cleanup();
});
test('16px inputs and pinch zoom apply only to the shared status registration modal', () => {
  const source = fs.readFileSync(new URL('../capability-ui/Center.jsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../capability-ui/center.css', import.meta.url), 'utf8');
  assert.match(source, /className="status-registration-modal" mobileViewport><form onSubmit=\{submit\}/);
  assert.equal((source.match(/className="status-registration-modal"/g) || []).length, 1);
  assert.match(css, /\.status-registration-modal input,\.status-registration-modal select,\.status-registration-modal textarea\{font-size:16px/);
  assert.match(css, /status-registration-modal\{[^}]+touch-action:pan-y pinch-zoom/);
  assert.match(css, /status-registration-overlay \.status-registration-modal>header\{position:relative;top:0/);
  assert.match(source, /if\(mobileViewport&&overlay.current\)return bindStatusDialogViewport/);
  assert.doesNotMatch(fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').match(/<meta name="viewport"[^>]+>/)?.[0] || '', /user-scalable=no|maximum-scale=1/);
});
