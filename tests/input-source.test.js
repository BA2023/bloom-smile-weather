import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CameraTracker } from '../src/tracking.js?v=camera-brightness-70';
import { ParticleEngine } from '../src/particles.js?v=larger-ripples-90';
import { GeminiParticleEngine } from '../src/gemini-particles.js?v=single-preview-97';

// Exercise the real app wiring with mocked media/DOM, without a browser or hardware camera.
const originalPrepare = CameraTracker.prototype.prepareWorker;
const originalGemini = CameraTracker.prototype.prepareGemini;
CameraTracker.prototype.prepareWorker = async function () { this.mode = 'Mock worker'; };
CameraTracker.prototype.prepareGemini = async function () { this.gemini = { sample() {}, close() {} }; this.mode = 'Mock GPU'; };
after(() => { CameraTracker.prototype.prepareWorker = originalPrepare; CameraTracker.prototype.prepareGemini = originalGemini; });
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
let sequence = 0;
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function classes() {
  const set = new Set();
  return { add: (...v) => v.forEach(x => set.add(x)), remove: (...v) => v.forEach(x => set.delete(x)),
    toggle: (x, on) => { if (on ?? !set.has(x)) { set.add(x); return true; } set.delete(x); return false; }, contains: x => set.has(x) };
}
class Element {
  constructor() {
    this.events = {}; this.attributes = {}; this.classList = classes(); this.dataset = {}; this.hidden = false;
    this.style = { setProperty(name, value) { this[name] = String(value); }, removeProperty(name) { delete this[name]; } }; this.paused = true; this.currentTime = 0;
    this.readyState = 0; // Mock media has no decoded hardware frames.
    this.children = []; this.tagName = 'DIV'; this.value = '1'; this.checked = false;
  }
  addEventListener(name, fn) { (this.events[name] ??= []).push(fn); }
  async click() { await Promise.all((this.events.click ?? []).map(fn => fn({ currentTarget: this, target: this }))); await flush(); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  querySelector(selector) { this.parts ??= {}; return this.parts[selector] ??= new Element(); }
  append(el) { el.parentElement = this; this.children.push(el); }
  before(anchor) { anchor.home = this.parentElement; }
  after(el) { el.parentElement = this.home; }
  getBoundingClientRect() { return { width: 360, height: 640, left: 0, top: 0 }; }
  async play() { this.paused = false; }
  pause() { this.paused = true; }
  focus() {}
  getContext() {
    const gradient = { addColorStop() {} };
    return new Proxy({}, { get: (object, name) => name === 'createRadialGradient' || name === 'createLinearGradient' ? () => gradient : () => {} });
  }
}
function stream() {
  const track = { stopped: false, stop() { this.stopped = true; }, addEventListener() {} };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}
// Existing flow cases exercise a remembered GPT profile; fresh-entry cases pass null.
async function boot(getUserMedia, mobile = false, rememberedStyle = 'bloom', viewportOptions = {}) {
  const nodes = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new Element()]));
  for (const id of ['room-settings-panel', 'share-panel', 'gift-panel', 'room-ended']) nodes[id].hidden = true;
  const palette = new Element(), settings = new Element(), controls = new Element(), home = new Element();
  const guidePreviews = ['preview-rain', 'preview-burst', 'preview-neutral'].map(target => {
    const element = new Element(); element.dataset.preview = target; return element;
  });
  const effectButtons = ['bloom', 'gemini'].map(key => { const node = nodes['effect-' + key]; node.dataset.effectStyle = key; return node; });
  const paletteButtons = ['auto', 'gold', 'rose', 'aurora'].map(key => { const node = new Element(); node.dataset.palette = key; return node; });
  const previews = { rain: guidePreviews[0], fireworks: guidePreviews[1], neutral: guidePreviews[2] };
  guidePreviews.forEach(button => { button.parentElement = nodes['interaction-guide']; });
  nodes['head-halo'].checked = true;
  const storage = new Map(rememberedStyle ? [['bloom-effect-style', rememberedStyle]] : []);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => {
    if (viewportOptions.storageBlocked) throw new Error('Storage unavailable');
    return storage.get(key);
  }, setItem: (key, value) => storage.set(key, value) } });
  settings.parentElement = controls; controls.parentElement = home; palette.parentElement = settings;
  nodes['interaction-guide'].parentElement = nodes['mobile-access'].parentElement = home;
  nodes['interaction-session'].parentElement = nodes['interaction-guide'];
  nodes['realtime-status-card'].parentElement = nodes['companion-panel'];
  nodes['expression-card'].parentElement = nodes['studio-monitor'].parentElement = nodes['companion-panel'];
  const media = { matches: mobile, addEventListener(name, fn) { this.change = fn; } };
  const frames = [], scrollCalls = [], documentEvents = {}, windowEvents = {}, viewportEvents = {}, intervals = [];
  const visualViewport = viewportOptions.viewport ? { ...viewportOptions.viewport,
    addEventListener(name, fn) { (viewportEvents[name] ??= []).push(fn); } } : undefined;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia }, permissions: { query: async () => ({ state: 'granted' }) } } });
  Object.assign(globalThis, { innerWidth: mobile ? 390 : 1440, innerHeight: 844, devicePixelRatio: 1,
    visualViewport, CSS: { supports: () => Boolean(viewportOptions.dynamic) },
    location: { hash: '', origin: 'https://example.test', pathname: '/' }, history: {},
    matchMedia: query => query.startsWith('(max-width: 740px)') ? media : { matches: false },
    requestAnimationFrame: fn => { frames.push(fn); return frames.length; }, ResizeObserver: class { observe() {} },
    setInterval: fn => { intervals.push({fn, active:true}); return intervals.length; },
    clearInterval: id => { if (intervals[id-1]) intervals[id-1].active=false; },
    addEventListener(name, fn) { (windowEvents[name] ??= []).push(fn); }, scrollTo: (x, y) => scrollCalls.push([x, y]),
    document: { hidden: false, body: new Element(), documentElement: new Element(), activeElement: new Element(), addEventListener(name, fn) { (documentEvents[name] ??= []).push(fn); },
      getElementById: id => { assert.ok(nodes[id], 'Missing HTML element: ' + id); return nodes[id]; },
      querySelector: selector => selector === '.palette-field' ? palette : selector === '.intro-controls' ? controls : settings,
      querySelectorAll: selector => selector === '[data-preview]' ? guidePreviews : selector === '[data-effect-style]' ? effectButtons : selector === '[data-palette]' ? paletteButtons : [],
      createElement: () => new Element(), createComment: () => new Element() } });
  globalThis.window = globalThis;
  await import('../src/main.js?source-test=' + sequence++); await flush();
  return { nodes, palette, settings, controls, previews, home, media, frames, scrollCalls, guidePreviews, paletteButtons, storage, documentEvents,
    viewportRoot: document.documentElement, visualViewport, viewportEvents, windowEvents, intervals };
}

test('Gemini rain palette buttons update the running rain without launching fireworks', async () => {
  const original = GeminiParticleEngine.prototype.update; let engine;
  GeminiParticleEngine.prototype.update = function (...args) { engine = this; return original.apply(this, args); };
  try {
    const app = await boot(async () => stream(), false, 'gemini');
    await app.nodes['stop-camera'].click(); await app.guidePreviews[0].click();
    let now = performance.now();
    const advance = () => { now += 1000 / 60; for (const callback of app.frames.splice(0)) callback(now); };
    for (let i = 0; i < 90; i++) advance();
    assert.equal(engine.manualMood, 'rain'); assert.ok(engine.rainStrength > 0);
    assert.equal(engine.fireworksActive, false);
    for (const key of ['rose', 'aurora', 'gold', 'auto']) {
      const button = app.paletteButtons.find(b => b.dataset.palette === key);
      await button.click();
      assert.equal(engine.paletteKey, key); assert.equal(button.getAttribute('aria-pressed'), 'true');
      assert.equal(engine.manualMood, 'rain'); assert.equal(engine.fireworksActive, false);
      assert.ok(engine.pool.slots.filter(p => p.active && p.type === 1).every(p => engine.pool.rainColors.includes(p.color)));
      advance(); assert.equal(engine.fireworksActive, false);
    }
  } finally { GeminiParticleEngine.prototype.update = original; }
});

test('changing colors neither replays a manual firework round nor pauses the automatic preview', async () => {
  const originals = [ParticleEngine.prototype.celebrate, GeminiParticleEngine.prototype.celebrate];
  let launches = 0;
  [ParticleEngine, GeminiParticleEngine].forEach((Engine, i) => {
    Engine.prototype.celebrate = function (...args) { launches++; return originals[i].apply(this, args); };
  });
  try {
    for (const style of ['bloom', 'gemini']) {
      const app = await boot(async () => stream(), false, style);
      await app.nodes['stop-camera'].click();
      await app.guidePreviews.find(b => b.dataset.preview === 'preview-burst').click();
      const before = launches;
      await app.paletteButtons.find(b => b.dataset.palette === 'rose').click();
      assert.equal(launches, before, style + ': a color setting must not replay a one-shot action');
      await app.guidePreviews.find(b => b.dataset.preview === 'preview-neutral').click();
      let now = performance.now();
      const advance = ms => { now += ms; for (const fn of app.frames.splice(0)) fn(now); };
      advance(3100);
      await app.paletteButtons.find(b => b.dataset.palette === 'aurora').click();
      for (let i = 0; i < 40; i++) advance(100);
      assert.equal(app.nodes['signal-rain'].getAttribute('aria-current'), 'true', style + ': colors must not interrupt the automatic calm/rain/fireworks sequence');
    }
  } finally {
    ParticleEngine.prototype.celebrate = originals[0]; GeminiParticleEngine.prototype.celebrate = originals[1];
  }
});

test('fresh entry defaults to Gemini random colors, including unavailable or invalid storage, while saved styles remain respected', async () => {
  for (const mobile of [false, true]) for (const [remembered, options, expected] of [
    [null, {}, 'gemini'], ['obsolete', {}, 'gemini'], [null, {storageBlocked:true}, 'gemini'],
    ['gemini', {}, 'gemini'], ['bloom', {}, 'bloom']
  ]) {
    let requests=0;
    const app=await boot(async () => { requests++; return stream(); },mobile,remembered,options);
    assert.equal(requests,1);
    assert.equal(app.nodes.stage.dataset.effectStyle ?? 'bloom',expected);
    if (expected==='gemini') {
      assert.equal(app.nodes['effect-gemini'].getAttribute('aria-pressed'),'true');
      assert.equal(app.nodes['palette-auto'].hidden,false);
      assert.equal(app.paletteButtons.find(button=>button.dataset.palette==='auto').getAttribute('aria-pressed'),'true');
    }
    assert.equal(app.nodes['demo-scene-toggle'].getAttribute('aria-pressed'),'false');
    await app.nodes['stop-camera'].click();
  }
});

test('cached page return restores the camera intent without resurrecting a stopped stream or opening a closed room', async () => {
  let requests=0; const streams=[];
  const app=await boot(async () => { requests++; const media=stream(); streams.push(media); return media; });
  app.windowEvents.pagehide.forEach(fn=>fn({persisted:true}));
  assert.equal(streams[0].track.stopped,true);
  assert.equal(app.nodes['stop-camera'].hidden,true,'cached UI must not claim a stopped camera is live');
  app.windowEvents.pageshow.forEach(fn=>fn({persisted:true})); await flush();
  assert.equal(requests,2); assert.equal(app.nodes.camera.srcObject,streams[1]);
  assert.equal(app.nodes['mode-label'].textContent,'实时互动');
  app.windowEvents.pageshow.forEach(fn=>fn({persisted:true})); await flush();
  assert.equal(requests,2,'duplicate pageshow cannot reopen the camera again');
  await app.nodes['room-exit'].click();
  app.windowEvents.pagehide.forEach(fn=>fn({persisted:true}));
  app.windowEvents.pageshow.forEach(fn=>fn({persisted:true})); await flush();
  assert.equal(requests,2,'an ended room stays ended');
});

test('cached page return resumes simulated comments once and removes expired gift/toast overlays', async () => {
  const app=await boot(async()=>stream());
  await app.nodes['room-follow'].click(); await app.previews.rain.click();
  assert.equal(app.nodes['room-toast'].hidden,false); assert.equal(app.nodes['gift-notice'].hidden,false);
  app.windowEvents.pagehide.forEach(fn=>fn({persisted:true}));
  assert.equal(app.nodes['room-toast'].hidden,true); assert.equal(app.nodes['gift-notice'].hidden,true);
  assert.equal(app.intervals.filter(timer=>timer.active).length,0);
  app.windowEvents.pageshow.forEach(fn=>fn({persisted:true})); await flush();
  app.windowEvents.pageshow.forEach(fn=>fn({persisted:true})); await flush();
  const active=app.intervals.filter(timer=>timer.active); assert.equal(active.length,1);
  active[0].fn(); assert.equal(app.nodes['room-comments'].children.length,1);
  await app.nodes['stop-camera'].click();
});

test('cached page return waits for visibility, cancels stale camera permission work and preserves AI/preview source choices', async () => {
  let resolve, requests=0; const waiting=new Promise(done=>{resolve=done;}), fresh=stream();
  const app=await boot(()=>++requests===1?waiting:Promise.resolve(fresh));
  app.windowEvents.pagehide.forEach(fn=>fn({persisted:true}));
  document.hidden=true;
  app.windowEvents.pageshow.forEach(fn=>fn({persisted:true})); await flush(); assert.equal(requests,1);
  document.hidden=false; app.documentEvents.visibilitychange.forEach(fn=>fn()); await flush();
  assert.equal(requests,2); assert.equal(app.nodes.camera.srcObject,fresh);
  const late=stream(); resolve(late); await flush();
  assert.equal(late.track.stopped,true); assert.equal(app.nodes.camera.srcObject,fresh);
  await app.nodes['stop-camera'].click();
  for (const ai of [false,true]) {
    const choice=await boot(async()=>stream());
    if(ai) await choice.nodes['demo-scene-toggle'].click(); else await choice.nodes['stop-camera'].click();
    choice.windowEvents.pagehide.forEach(fn=>fn({persisted:true}));
    choice.windowEvents.pageshow.forEach(fn=>fn({persisted:true})); await flush();
    assert.equal(choice.nodes.camera.srcObject,null,'an intentional AI or preview source must not reopen the camera');
    assert.equal(choice.nodes['demo-scene-toggle'].getAttribute('aria-pressed'),String(ai));
  }
});

test('page entry requests camera; AI on stops it, and AI off starts a fresh camera', async () => {
  const streams = [], requests = [];
  const app = await boot(async options => { requests.push(options); const media = stream(); streams.push(media); return media; });
  const { nodes } = app;
  assert.deepEqual(app.scrollCalls, [[0, 0]]);
  assert.equal(requests.length, 1); assert.equal(requests[0].audio, false);
  assert.equal(nodes['mode-label'].textContent, '实时互动');
  assert.equal(nodes['demo-scene-toggle'].getAttribute('aria-pressed'), 'false');
  assert.equal(nodes['demo-host'].paused, true);
  await nodes['demo-scene-toggle'].click();
  assert.equal(streams[0].track.stopped, true); assert.equal(nodes.camera.srcObject, null);
  assert.equal(nodes['demo-scene-toggle'].textContent, '关闭AI主播'); assert.equal(nodes['demo-host'].paused, false);
  await nodes['demo-scene-toggle'].click();
  assert.equal(requests.length, 2); assert.equal(nodes['demo-host'].paused, true);
  assert.equal(nodes.camera.srcObject, streams[1]); assert.equal(nodes['mode-label'].textContent, '实时互动');
  await nodes['stop-camera'].click(); assert.equal(streams[1].track.stopped, true);
});

test('effect switching preserves the active camera, sensitivity and AI source, and remembers the style', async () => {
  let requests = 0; const media = stream();
  const app = await boot(async () => { requests++; return media; }); const { nodes } = app;
  nodes.sensitivity.value = '1.2';
  for (const handler of nodes.sensitivity.events.input) handler({ target: nodes.sensitivity });
  await nodes['effect-gemini'].click();
  assert.equal(nodes.stage.dataset.effectStyle, 'gemini'); assert.equal(nodes['effect-gemini'].getAttribute('aria-pressed'), 'true');
  assert.equal(nodes['effect-bloom'].getAttribute('aria-pressed'), 'false');
  assert.equal(requests, 1); assert.equal(media.track.stopped, false); assert.equal(nodes.sensitivity.value, '1');
  assert.equal(nodes['sensitivity-control'].hidden, false, 'Gemini exposes its own sensitivity');
  nodes.sensitivity.value = '.8';
  for (const handler of nodes.sensitivity.events.input) handler({ target: nodes.sensitivity });
  for (const frame of app.frames.splice(0)) frame(performance.now() + 300);
  assert.equal(nodes['gate-smile'].style.left, `${.32 / .8 * 100}%`, 'Gemini entry marker tracks its sensitivity');
  assert.equal(app.storage.get('bloom-effect-style'), 'gemini');
  await nodes['demo-scene-toggle'].click();
  await nodes['effect-bloom'].click();
  assert.equal(nodes['sensitivity-control'].hidden, false); assert.equal(nodes.sensitivity.value, '1.2');
  assert.equal(nodes.stage.dataset.effectStyle, 'bloom'); assert.equal(nodes['demo-scene-toggle'].getAttribute('aria-pressed'), 'true');
  assert.equal(nodes['demo-host'].paused, false); assert.equal(requests, 1);
  await nodes['effect-gemini'].click();
  assert.equal(nodes.sensitivity.value, '0.8', 'Gemini value is retained independently');
  for (const frame of app.frames.splice(0)) frame(performance.now() + 400);
  assert.equal(nodes['mode-label'].textContent, 'AI演示');
  const restored = await boot(async () => stream(), true, 'gemini');
  assert.equal(restored.nodes.stage.dataset.effectStyle, 'gemini');
  assert.equal(restored.controls.parentElement, restored.nodes['room-settings-content']);
  await restored.nodes['stop-camera'].click();
});

test('complete Gemini presets report manual preview, expose the halo, and hide controls when returning to BLOOM', async () => {
  const app = await boot(async () => stream()), { nodes, frames } = app;
  await nodes['effect-gemini'].click();
  assert.equal(nodes['palette-auto'].hidden,false);
  await app.previews.rain.click();
  for(const frame of frames.splice(0))frame(performance.now()+300);
  assert.equal(nodes['mode-label'].textContent,'手动预演');
  assert.equal(app.previews.rain.getAttribute('aria-pressed'),'true');
  nodes['head-halo'].checked=false;
  for(const handler of nodes['head-halo'].events.change)handler({target:nodes['head-halo']});
  await nodes['effect-bloom'].click();
  assert.equal(nodes['palette-auto'].hidden,true);
  await nodes['effect-gemini'].click();assert.equal(nodes['head-halo'].checked,false);
  await nodes['stop-camera'].click();
});

test('switching to AI while permission is pending closes a late camera stream', async () => {
  let resolve; const pending = new Promise(done => { resolve = done; });
  const { nodes } = await boot(() => pending);
  await nodes['effect-gemini'].click();
  assert.equal(nodes.stage.dataset.effectStyle, 'gemini');
  assert.equal(nodes['stop-camera'].hidden, false);
  await nodes['demo-scene-toggle'].click();
  const late = stream(); resolve(late); await flush();
  assert.equal(late.track.stopped, true); assert.equal(nodes.camera.srcObject, null);
  assert.equal(nodes['mode-label'].textContent, 'AI演示');
  assert.equal(nodes['demo-scene-toggle'].getAttribute('aria-pressed'), 'true');
});

test('denied auto-start stays retryable without silently enabling AI', async () => {
  let reject; const pending = new Promise((resolve, fail) => { reject = fail; });
  const { nodes } = await boot(() => pending);
  const log = console.error; console.error = () => {};
  try { reject(Object.assign(new Error('Denied'), { name: 'NotAllowedError' })); await flush(); }
  finally { console.error = log; }
  assert.equal(nodes['start-camera'].hidden, false); assert.equal(nodes['start-camera'].disabled, false);
  assert.equal(nodes['demo-host'].paused, true); assert.equal(nodes['demo-scene-toggle'].getAttribute('aria-pressed'), 'false');
  assert.match(nodes['status-banner'].textContent, /允许摄像头/);
});

test('leaving the room locks source and preview controls until re-entry', async () => {
  let requests = 0;
  const media = stream(), app = await boot(async () => { requests++; return media; });
  const { nodes } = app;
  await nodes['demo-scene-toggle'].click();
  await nodes['room-exit'].click();
  assert.equal(nodes['demo-scene-toggle'].disabled, true);
  assert.equal(nodes['start-camera'].disabled, true);
  assert.equal(nodes['demo-scene-toggle'].getAttribute('aria-pressed'), 'false');
  assert.ok(app.guidePreviews.every(button => button.disabled));
  await nodes['demo-scene-toggle'].click();
  assert.equal(nodes['demo-scene-toggle'].getAttribute('aria-pressed'), 'false', 'closed room ignores source requests');
  assert.equal(nodes['start-camera'].disabled, true);
  await nodes['room-reenter'].click();
  assert.equal(nodes['demo-scene-toggle'].disabled, false);
  assert.ok(app.guidePreviews.every(button => !button.disabled));
  assert.equal(requests, 2);
  await nodes['stop-camera'].click();
});

test('preview controls are disabled during camera startup and recover after cancellation', async () => {
  let resolve;
  const app = await boot(() => new Promise(done => { resolve = done; }));
  assert.ok(app.guidePreviews.every(button => button.disabled));
  assert.equal(app.previews.rain.disabled, true);
  assert.equal(app.nodes['preview-burst'].disabled, true);
  assert.equal(app.nodes['demo-scene-toggle'].disabled, false, 'AI remains an available alternative');
  await app.nodes['stop-camera'].click();
  assert.ok(app.guidePreviews.every(button => !button.disabled));
  assert.equal(app.previews.rain.disabled, false);
  const late = stream(); resolve(late); await flush();
  assert.equal(late.track.stopped, true);
});

test('mobile opens on the room with all controls in a closed panel and restores the same nodes on desktop', async () => {
  const media = stream(); const app = await boot(async () => media, true);
  assert.equal(app.nodes['room-settings-panel'].hidden, true);
  assert.equal(app.controls.parentElement, app.nodes['room-settings-content']);
  assert.equal(app.settings.parentElement, app.controls);
  assert.equal(app.nodes['interaction-guide'].parentElement, app.nodes['room-settings-content']);
  assert.equal(app.nodes['mobile-access'].parentElement, app.nodes['room-settings-content']);
  assert.equal(app.palette.parentElement, app.settings, 'palette remains with the same settings instance');
  assert.equal(app.nodes['interaction-session'].parentElement, app.nodes['interaction-guide']);
  assert.ok(app.guidePreviews.every(button => button.parentElement === app.nodes['interaction-guide']));
  for (const id of ['realtime-status-card','expression-card','studio-monitor']) assert.equal(app.nodes[id].parentElement, app.nodes['room-settings-content']);
  await app.nodes['room-settings-trigger'].click(); assert.equal(app.nodes['room-settings-panel'].hidden, false);
  await app.previews.rain.click(); assert.equal(app.nodes['room-settings-panel'].hidden, true, 'starting a preview returns to the stage');
  assert.equal(app.previews.rain.getAttribute('aria-pressed'), 'true');
  await app.nodes['room-settings-trigger'].click();
  app.settings.value = 'retained'; app.media.matches = false; app.media.change();
  assert.equal(app.nodes['room-settings-panel'].hidden, true, 'breakpoint changes close the drawer');
  assert.equal(app.controls.parentElement, app.home); assert.equal(app.settings.parentElement, app.controls); assert.equal(app.settings.value, 'retained');
  assert.equal(app.nodes['interaction-session'].parentElement, app.nodes['interaction-guide']);
  assert.equal(app.nodes['realtime-status-card'].parentElement, app.nodes['companion-panel']);
  for (const id of ['expression-card','studio-monitor']) assert.equal(app.nodes[id].parentElement, app.nodes['companion-panel']);
  assert.equal(media.track.stopped, false, 'moving controls keeps the same active camera');
  await app.nodes['stop-camera'].click();
});

test('mobile viewport does not pin a transient startup height and releases keyboard sizing immediately', async () => {
  const app = await boot(() => new Promise(() => {}), true, 'bloom', {
    dynamic: true, viewport: { width:390,height:620,offsetTop:0,scale:1 }
  });
  for (const fn of app.frames.splice(0)) fn(performance.now() + 20);
  const style = app.viewportRoot.style;
  assert.equal(style['--room-height'], undefined, '100dvh must not be overridden by the permission-time visual viewport');
  app.visualViewport.height = 410; app.visualViewport.offsetTop = 14;
  document.activeElement = app.nodes['room-comment-input'];
  document.activeElement.tagName = 'INPUT'; document.activeElement.type = 'text';
  app.documentEvents.focusin.forEach(fn => fn());
  assert.equal(style['--room-height'], '410px', 'keyboard sizing applies before the next animation frame');
  assert.equal(style['--room-top'], '14px');
  document.activeElement = document.body;
  app.documentEvents.focusout.forEach(fn => fn());
  assert.equal(style['--room-height'], undefined, 'closing the keyboard immediately restores dynamic viewport sizing');
  assert.equal(style['--room-top'], undefined);
  await app.nodes['stop-camera'].click();
});

test('legacy mobile viewport synchronizes before camera work and on video readiness without waiting for animation', async () => {
  const app = await boot(() => new Promise(() => {}), true, 'bloom', {
    dynamic: false, viewport: { width:390,height:700,offsetTop:0,scale:1 }
  });
  const style = app.viewportRoot.style;
  assert.equal(style['--room-height'], '700px', 'legacy first layout is set synchronously');
  app.visualViewport.height = 844;
  app.nodes.camera.events.loadedmetadata.forEach(fn => fn());
  assert.equal(style['--room-height'], '844px', 'video metadata can correct the viewport even before requestAnimationFrame runs');
  app.visualViewport.height = 0;
  app.windowEvents.pageshow.forEach(fn => fn());
  assert.equal(style['--room-height'], '844px', 'zero transient measurements fall back to the window height');
  app.visualViewport.scale = 2; app.visualViewport.height = 300;
  app.viewportEvents.resize.forEach(fn => fn());
  assert.equal(style['--room-height'], '844px', 'pinch zoom does not resize the room');
  await app.nodes['stop-camera'].click();
});

test('shared head halo toggle follows both effect styles and preserves its setting when switching', async () => {
  const actualGpt = ParticleEngine.prototype.update, actualGemini = GeminiParticleEngine.prototype.update;
  let active;
  ParticleEngine.prototype.update = function (...args) { active = this; return actualGpt.apply(this, args); };
  GeminiParticleEngine.prototype.update = function (...args) { active = this; return actualGemini.apply(this, args); };
  try {
    const app = await boot(async () => stream(), false, 'bloom');
    await app.nodes['stop-camera'].click();
    let now = performance.now();
    const advance = () => { now += 300; for (const fn of app.frames.splice(0)) fn(now); };
    advance(); assert.equal(active.showColliderMesh, true);
    app.nodes['head-halo'].checked = false;
    for (const handler of app.nodes['head-halo'].events.change) handler({ target: app.nodes['head-halo'] });
    advance(); assert.equal(active.showColliderMesh, false);
    await app.nodes['effect-gemini'].click(); advance(); assert.equal(active.showColliderMesh, false);
    app.nodes['head-halo'].checked = true;
    for (const handler of app.nodes['head-halo'].events.change) handler({ target: app.nodes['head-halo'] });
    advance(); assert.equal(active.showColliderMesh, true);
    await app.nodes['effect-bloom'].click(); advance(); assert.equal(active.showColliderMesh, true);
  } finally { ParticleEngine.prototype.update = actualGpt; GeminiParticleEngine.prototype.update = actualGemini; }
});

test('live capsule follows all manual previews in both engines and reports the ended room', async () => {
  for (const style of ['bloom', 'gemini']) {
    const app = await boot(async () => stream(), true, style), { nodes } = app;
    await nodes['stop-camera'].click();
    let now = performance.now();
    const advance = () => { for (let i = 0; i < 36; i++) { now += 1000 / 60; for (const fn of app.frames.splice(0)) fn(now); } };
    for (const [preset, expression, effect] of [['neutral','平静','等待微笑'],['rain','微笑','流光细雨'],['fireworks','大笑','烟花绽放']]) {
      await nodes['room-settings-trigger'].click();
      await app.previews[preset].click(); advance();
      assert.equal(nodes['room-settings-panel'].hidden, true);
      assert.equal(nodes['capsule-source'].textContent, '预演');
      assert.equal(nodes['capsule-expression'].textContent, expression, style);
      assert.equal(nodes['capsule-effect'].textContent, effect, style);
    }
    await nodes['room-exit'].click();
    assert.equal(nodes['capsule-expression'].textContent, '互动结束');
    assert.equal(nodes['capsule-effect'].textContent, '可重新进入');
  }
});

test('both styles use larger particles and natural rain without comparison controls', async () => {
  const drawGpt = ParticleEngine.prototype.draw, drawGemini = GeminiParticleEngine.prototype.draw;
  let active, requests = 0;
  ParticleEngine.prototype.draw = function (...args) { active = this; return drawGpt.apply(this, args); };
  GeminiParticleEngine.prototype.draw = function (...args) { active = this; return drawGemini.apply(this, args); };
  try {
    const media = stream(), app = await boot(async () => { requests++; return media; });
    let now = performance.now();
    const advance = () => { now += 300; for (const fn of app.frames.splice(0)) fn(now); };
    advance(); assert.equal(active.particleScale, 1.25); assert.equal(active.rainScale, 1.75);
    for (const id of ['particle-size-label','particle-size-original','particle-size-larger','rain-style-label','rain-style-original','rain-style-natural']) assert.equal(app.nodes[id], undefined);
    assert.equal(active.naturalRain, true);
    await app.nodes['effect-gemini'].click(); advance(); assert.equal(active.particleScale, 1.25); assert.equal(active.rainScale, 1.75);
    assert.equal(active.naturalRain, true);
    await app.nodes['effect-bloom'].click(); advance(); assert.equal(active.particleScale, 1.25);
    assert.equal(active.naturalRain, true);
    assert.equal(requests, 1); assert.equal(media.track.stopped, false);
    await app.nodes['stop-camera'].click();
  } finally { ParticleEngine.prototype.draw = drawGpt; GeminiParticleEngine.prototype.draw = drawGemini; }
});

test('GPT preview sways on its own, follows the pointer, then returns near center after exit', async () => {
  const originalUpdate = ParticleEngine.prototype.update;
  let head = null;
  ParticleEngine.prototype.update = function (dt, value, now) {
    head = value && { ...value };
    return originalUpdate.call(this, dt, value, now);
  };
  try {
    const app = await boot(async () => stream(), false, 'bloom');
    await app.nodes['stop-camera'].click();
    let now = performance.now();
    const advance = count => {
      for (let i = 0; i < count; i++) {
        now += 1000 / 60;
        for (const callback of app.frames.splice(0)) callback(now);
      }
    };
    advance(35); assert.ok(Math.abs(head.x - 180) > 5, 'idle motion visibly leaves center');
    const target = { closest: () => null };
    for (const fn of app.nodes.stage.events.pointermove) fn({ type: 'pointermove', pointerType: 'mouse', target, clientX: 295, clientY: 320 });
    advance(35); assert.ok(head.x > 285, 'head follows the pointer');
    for (const fn of app.nodes.stage.events.pointerleave) fn({ pointerType: 'mouse' });
    advance(60); assert.ok(Math.abs(head.x - 180) <= 34, 'head returns to the central idle path');
  } finally { ParticleEngine.prototype.update = originalUpdate; }
});

test('Gemini preview returns to its idle path when the pointer leaves', async () => {
  const originalUpdate = GeminiParticleEngine.prototype.update;
  let engine;
  GeminiParticleEngine.prototype.update = function (...args) { engine = this; return originalUpdate.apply(this, args); };
  try {
    const app = await boot(async () => stream(), false, 'gemini');
    await app.nodes['stop-camera'].click();
    let now = performance.now();
    const advance = count => { for (let i = 0; i < count; i++) { now += 1000 / 60; for (const callback of app.frames.splice(0)) callback(now); } };
    advance(5);
    const target = { closest: () => null };
    for (const fn of app.nodes.stage.events.pointermove) fn({ type: 'pointermove', pointerType: 'mouse', target, clientX: 25, clientY: 320 });
    advance(35); assert.ok(engine.collider.x < 40);
    for (const fn of app.nodes.stage.events.pointerleave) fn({ pointerType: 'mouse' });
    advance(60); assert.ok(Math.abs(engine.collider.x - 180) <= 34);
    assert.ok(Math.abs(engine.collider.y - 640 * .48) <= 11, 'head returns to the centered vertical idle path');
  } finally { GeminiParticleEngine.prototype.update = originalUpdate; }
});

test('both preview styles cycle through calm, smile and laughter, while manual selection takes precedence', async () => {
  for (const style of ['bloom', 'gemini']) {
    const prototype = style === 'gemini' ? GeminiParticleEngine.prototype : ParticleEngine.prototype;
    const original = prototype.update;
    let engine;
    prototype.update = function (...args) { engine = this; return original.apply(this, args); };
    try {
      const app = await boot(async () => stream(), false, style);
      await app.nodes['stop-camera'].click();
      let now = performance.now();
      const advance = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) { now += 1000 / 60; for (const callback of app.frames.splice(0)) callback(now); } };
      const mood = () => style === 'gemini' ? engine.expressionResult.label : engine.previewMood;
      advance(1); assert.equal(mood(), 'neutral', style);
      assert.equal(app.nodes['signal-neutral'].getAttribute('aria-current'), 'true');
      assert.equal(engine.fireworksActive, false, style + ' starts calmly without a stray rocket');
      advance(3); assert.equal(mood(), style === 'gemini' ? 'smile' : 'rain', style);
      assert.equal(app.nodes['signal-rain'].getAttribute('aria-current'), 'true');
      assert.ok(engine.rainStrength > 0, style + ' produces rain');
      advance(4); assert.equal(mood(), style === 'gemini' ? 'laugh' : 'fireworks', style);
      assert.equal(app.nodes['signal-fireworks'].getAttribute('aria-current'), 'true');
      assert.ok(engine.fireworksActive, style + ' produces fireworks');
      advance(3); assert.equal(mood(), 'neutral', style + ' repeats');
      await app.guidePreviews[0].click(); advance(1);
      assert.equal(engine.manualMood, 'rain'); assert.equal(mood(), style === 'gemini' ? 'smile' : 'rain');
      advance(3.2); assert.equal(engine.manualMood, null); assert.equal(mood(), 'neutral');
    } finally { prototype.update = original; }
  }
});

test('switching from GPT rain or fireworks starts Gemini at calm before its full automatic cycle', async () => {
  const original = GeminiParticleEngine.prototype.update; let engine;
  GeminiParticleEngine.prototype.update = function (...args) { engine = this; return original.apply(this, args); };
  try {
    const app = await boot(async () => stream(), false, 'bloom');
    await app.nodes['stop-camera'].click();
    let now = performance.now();
    const advance = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) { now += 1000 / 60; for (const fn of app.frames.splice(0)) fn(now); } };
    await app.guidePreviews[0].click(); advance(1);
    assert.equal(app.guidePreviews[0].getAttribute('aria-pressed'), 'true');
    await app.nodes['effect-gemini'].click(); advance(1);
    assert.equal(engine.expressionResult.label, 'neutral');
    assert.equal(engine.rainStrength, 0); assert.equal(engine.fireworksActive, false);
    assert.equal(app.nodes['signal-neutral'].getAttribute('aria-current'), 'true');
    advance(3); assert.equal(engine.expressionResult.label, 'smile'); assert.ok(engine.rainStrength > 0);
    advance(4); assert.equal(engine.expressionResult.label, 'laugh'); assert.ok(engine.fireworksActive);
    await app.nodes['effect-bloom'].click(); advance(8);
    await app.nodes['effect-gemini'].click(); advance(1);
    assert.equal(engine.expressionResult.label, 'neutral');
    assert.equal(engine.rainStrength, 0); assert.equal(engine.fireworksActive, false);
  } finally { GeminiParticleEngine.prototype.update = original; }
});

test('switching effect styles during camera use does not itself launch a firework', async () => {
  const original = GeminiParticleEngine.prototype.celebrate; let launches = 0;
  GeminiParticleEngine.prototype.celebrate = function (...args) { launches++; return original.apply(this, args); };
  try {
    const app = await boot(async () => stream());
    await app.nodes['effect-gemini'].click();
    assert.equal(launches, 0);
    await app.nodes['stop-camera'].click();
  } finally { GeminiParticleEngine.prototype.celebrate = original; }
});

test('returning to a hidden Gemini camera tab waits for fresh face data without stray fireworks', async () => {
  const sample = CameraTracker.prototype.sample, update = GeminiParticleEngine.prototype.update;
  let engine, supplied = { facePresent: true, smile: .02, jaw: .02, points: null };
  CameraTracker.prototype.sample = function () { if (this.active && supplied) this.onSignal(supplied); };
  GeminiParticleEngine.prototype.update = function (...args) { engine = this; return update.apply(this, args); };
  try {
    const app = await boot(async () => stream(), false, 'gemini');
    let now = performance.now();
    const advance = () => { now += 1000 / 60; for (const fn of app.frames.splice(0)) fn(now); };
    advance(); assert.equal(engine.fireworksActive, false);
    document.hidden = true; app.documentEvents.visibilitychange.forEach(fn => fn());
    document.hidden = false; app.documentEvents.visibilitychange.forEach(fn => fn());
    now += 1000; advance();
    assert.equal(engine.fireworksActive, false, 'fresh neutral input must not inherit the startup laugh preset');
    document.hidden = true; app.documentEvents.visibilitychange.forEach(fn => fn());
    supplied = null;
    document.hidden = false; app.documentEvents.visibilitychange.forEach(fn => fn());
    for (let i = 0; i < 20; i++) advance();
    assert.equal(engine.fireworksActive, false, 'a suspended tab must not revive the Gemini startup laugh preset');
    assert.equal(app.nodes['signal-source'].textContent, '正在准备识别');
    supplied = { facePresent: true, smile: .02, jaw: .02, points: null };
    for (let i = 0; i < 20; i++) advance();
    assert.equal(engine.fireworksActive, false);
    assert.equal(app.nodes['signal-source'].textContent, '摄像头实时识别');
    await app.nodes['stop-camera'].click();
  } finally { CameraTracker.prototype.sample = sample; GeminiParticleEngine.prototype.update = update; }
});

test('Gemini camera waits for a face and starts from its actual expression instead of preset fireworks', async () => {
  const originalSample = CameraTracker.prototype.sample, originalUpdate = GeminiParticleEngine.prototype.update;
  let supplied = { facePresent: false, smile: .78, jaw: .56, points: null }, engine;
  CameraTracker.prototype.sample = function () { if (this.active && this.profile === 'gemini') this.onSignal(supplied); };
  GeminiParticleEngine.prototype.update = function (...args) { engine = this; return originalUpdate.apply(this, args); };
  try {
    const app = await boot(async () => stream());
    app.nodes.camera.videoWidth = 640; app.nodes.camera.videoHeight = 480; app.nodes.camera.readyState = 2;
    await app.nodes['effect-gemini'].click();
    let now = performance.now();
    const advance = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) { now += 1000 / 60; for (const fn of app.frames.splice(0)) fn(now); } };
    advance(2); assert.equal(engine.fireworksActive, false); assert.equal(engine.rainStrength, 0);
    supplied = { facePresent: true, smile: .08, jaw: .03, points: [{ x: .5, y: .25 }, { x: .5, y: .65 }, { x: .35, y: .45 }, { x: .65, y: .45 }] };
    advance(1); assert.equal(engine.expressionResult.label, 'neutral'); assert.equal(engine.fireworksActive, false);
    supplied = { ...supplied, smile: .44, jaw: .1 }; advance(1);
    assert.equal(engine.expressionResult.label, 'smile'); assert.ok(engine.rainStrength > 0);
    supplied = { ...supplied, smile: .78, jaw: .56 }; advance(1);
    assert.equal(engine.expressionResult.label, 'laugh'); assert.ok(engine.fireworksActive);
    await app.nodes['stop-camera'].click();
  } finally { CameraTracker.prototype.sample = originalSample; GeminiParticleEngine.prototype.update = originalUpdate; }
});

test('calm preview clears effects and holds a neutral avatar in both styles on desktop and mobile', async () => {
  for (const style of ['bloom', 'gemini']) for (const mobile of [false, true]) {
    const prototype = style === 'gemini' ? GeminiParticleEngine.prototype : ParticleEngine.prototype;
    const original = prototype.update; let engine;
    prototype.update = function (...args) { engine = this; return original.apply(this, args); };
    try {
      const app = await boot(async () => stream(), mobile, style);
      await app.nodes['stop-camera'].click();
      let now = performance.now();
      const advance = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) { now += 1000 / 60; for (const fn of app.frames.splice(0)) fn(now); } };
      advance(8); assert.ok(engine.fireworksActive, style + ' starts with visible effects');
      const calm = app.previews.neutral;
      await calm.click(); advance(1);
      assert.equal(engine.fireworksActive, false); assert.equal(engine.rainStrength, 0);
      assert.equal(style === 'gemini' ? engine.expressionResult.label : engine.previewMood, 'neutral');
      assert.equal(calm.getAttribute('aria-pressed'), 'true');
      assert.equal(app.nodes['signal-neutral'].getAttribute('aria-current'), 'true');
      advance(4); assert.equal(engine.fireworksActive, false, 'automatic playback resumes calmly');
      assert.equal(calm.getAttribute('aria-pressed'), 'false'); assert.equal(engine.manualMood, null);
      const smile = app.previews.rain;
      await smile.click(); advance(1);
      assert.ok(engine.rainStrength > 0, 'another preview exits calm');
    } finally { prototype.update = original; }
  }
});

test('desktop and mobile previews restart on repeat clicks, expire, and launch only one firework round in both styles', async () => {
  for (const style of ['bloom', 'gemini']) for (const mobile of [false, true]) {
    const prototype = style === 'gemini' ? GeminiParticleEngine.prototype : ParticleEngine.prototype;
    const original = prototype.update; let engine;
    prototype.update = function (...args) { engine = this; return original.apply(this, args); };
    try {
      const app = await boot(async () => stream(), mobile, style); await app.nodes['stop-camera'].click();
      let now = performance.now();
      const advance = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) { now += 1000 / 60; for (const fn of app.frames.splice(0)) fn(now); } };
      advance(.5);
      const rain = app.previews.rain;
      const calm = app.previews.neutral;
      const laugh = app.previews.fireworks;
      await rain.click(); advance(2); await rain.click(); advance(2.2);
      assert.equal(engine.manualMood, 'rain', style + ' second click restarts instead of stopping');
      assert.equal(rain.getAttribute('aria-pressed'), 'true'); assert.ok(engine.rainStrength > 0);
      advance(2); assert.equal(rain.getAttribute('aria-pressed'), 'false'); assert.equal(engine.manualMood, null);
      assert.equal(engine.rainStrength, 0);
      await rain.click(); advance(.5); await calm.click(); advance(.5);
      assert.equal(rain.getAttribute('aria-pressed'), 'false'); assert.equal(calm.getAttribute('aria-pressed'), 'true');
      assert.equal(engine.rainStrength, 0); assert.equal(engine.fireworksActive, false);
      advance(2.7); assert.equal(calm.getAttribute('aria-pressed'), 'false'); assert.equal(engine.manualMood, null);
      let launches = 0;
      const object = style === 'gemini' ? engine.pool : engine, key = style === 'gemini' ? 'spawnFireworkRocket' : 'launch';
      const launch = object[key]; object[key] = function (...args) { launches++; return launch.apply(this, args); };
      await laugh.click(); advance(4.3);
      assert.equal(launches, 3, style + ' emits one three-shell round');
      assert.equal(laugh.getAttribute('aria-pressed'), 'true');
      advance(.4); assert.equal(laugh.getAttribute('aria-pressed'), 'false'); assert.equal(engine.manualMood, null);
      assert.equal(engine.suppressExpressionBursts, false);
      advance(2.3); assert.equal(launches, 3, style + ' does not keep firing after the round');
    } finally { prototype.update = original; }
  }
});

test('camera and AI input resume after single previews without replacing their source', async () => {
  const originalSample = CameraTracker.prototype.sample;
  CameraTracker.prototype.sample = function () { if (this.active) this.onSignal({ facePresent: true, smile: .08, jaw: .03, points: null }); };
  try {
    for (const style of ['bloom', 'gemini']) {
      const prototype = style === 'gemini' ? GeminiParticleEngine.prototype : ParticleEngine.prototype;
      const original = prototype.update; let engine;
      prototype.update = function (...args) { engine = this; return original.apply(this, args); };
      try {
        let requests = 0; const media = stream();
        const app = await boot(async () => { requests++; return media; }, false, style);
        let now = performance.now();
        const advance = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) { now += 1000 / 60; for (const fn of app.frames.splice(0)) fn(now); } };
        advance(.5); await app.guidePreviews[0].click(); advance(4.3);
        assert.equal(engine.manualMood, null); assert.equal(engine.rainStrength, 0);
        assert.equal(requests, 1); assert.equal(media.track.stopped, false);
        await app.guidePreviews[1].click(); advance(1); await app.nodes['demo-scene-toggle'].click(); advance(.2);
        assert.equal(engine.manualMood, null); assert.equal(app.nodes['demo-scene-toggle'].getAttribute('aria-pressed'), 'true');
        await app.guidePreviews[0].click(); advance(4.3);
        assert.equal(engine.manualMood, null); assert.equal(app.nodes['demo-scene-toggle'].getAttribute('aria-pressed'), 'true');
        assert.equal(requests, 1);
        await app.guidePreviews[0].click(); await app.nodes[style === 'gemini' ? 'effect-bloom' : 'effect-gemini'].click();
        advance(.2); assert.equal(app.guidePreviews[0].getAttribute('aria-pressed'), 'false');
        assert.equal(app.nodes['demo-scene-toggle'].getAttribute('aria-pressed'), 'true');
      } finally { prototype.update = original; }
    }
  } finally { CameraTracker.prototype.sample = originalSample; }
});

test('studio shortcuts share gift actions and telemetry reports sampled low FPS without clamping', async () => {
  const app = await boot(async () => stream());
  const { nodes, guidePreviews, frames } = app;
  await nodes['stop-camera'].click();
  await guidePreviews[0].click();
  let now = performance.now() + 1100;
  for (const frame of frames.splice(0)) frame(now);
  assert.equal(guidePreviews[0].getAttribute('aria-pressed'), 'true');
  assert.equal(document.body.dataset.effect, 'rain');
  assert.equal(nodes['studio-effect'].textContent, '流光细雨');
  assert.equal(nodes['studio-source'].textContent, '特效预演');
  assert.ok(Number(nodes['studio-fps'].textContent) < 58);
  assert.ok(Number(nodes['studio-collisions'].textContent) >= 0);
  assert.equal(nodes['studio-inference-hz'].textContent, '—', 'preview has no model inference rate');
  assert.equal(nodes['signal-smile'].textContent, '—', 'BLOOM gift preview does not invent expression measurements');
  assert.equal(nodes['signal-source'].textContent, '互动预演数据');
  assert.match(nodes['studio-pool'].textContent, /^\d+ \/ \d+$/);
  assert.ok(Number(nodes['studio-frame-cost'].textContent) >= 0);
  await guidePreviews[1].click();
  assert.match(nodes['gift-message'].textContent, /流光烟花/);
  now += 300; for (const frame of frames.splice(0)) frame(now);
  assert.match(document.body.dataset.effect, /fireworks|mixed/);
  await nodes['room-exit'].click();
  assert.ok(guidePreviews.every(button => button.disabled));
  assert.equal(nodes['studio-fps'].textContent, '—');
  assert.equal(nodes['studio-source'].textContent, '已离开');
  assert.equal(nodes['mode-label'].textContent, '已离开');
  assert.equal(nodes['start-camera'].disabled, true);
  assert.equal(nodes['studio-inference-hz'].textContent, '—');
  assert.equal(nodes['signal-smile'].textContent, '—');
  assert.equal(nodes['signal-source'].textContent, '已离开');
  await nodes['room-reenter'].click();
  assert.ok(guidePreviews.every(button => !button.disabled));
  await nodes['stop-camera'].click();
});
