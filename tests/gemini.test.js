import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiParticleEngine, GeminiParticlePool } from '../src/gemini-particles.js';
import { GeminiExpressionState } from '../src/gemini-expression.js';
import { ExpressionState } from '../src/expression.js';
import { extractSignal } from '../src/tracking-shared.js';
import { ParticleEngine } from '../src/particles.js';

const gradient = { addColorStop() {} };
const context = new Proxy({}, { get: (target, name) => name === 'createRadialGradient' || name === 'createLinearGradient' ? () => gradient : () => {} });
const canvas = () => ({ width: 1, height: 1, getContext: () => context });
Object.assign(globalThis, { devicePixelRatio: 1 });
function engine() { const e = new GeminiParticleEngine(canvas(), canvas()); e.resize(360, 640); return e; }
function feed(state, signal, duration, step = 45) {
  const rows = []; for (let time = 0; time <= duration; time += step) rows.push({ time, ...state.update(signal, time), burstAt: state.lastBurst }); return rows;
}

test('natural rain has one light wind direction and keeps a continuous streak without a comet head', () => {
  const pool = new GeminiParticlePool(120);
  for (let i = 0; i < 100; i++) pool.spawnRainDrop(360, 640, .6, true);
  for (const p of pool.slots.filter(p => p.active)) {
    assert.ok(p.vy > 0); assert.ok(Math.abs(p.vx / p.vy - .04) < 1e-10);
  }
  let from, to, images = 0;
  const ctx = { beginPath() {}, moveTo(x, y) { from = [x, y]; }, lineTo(x, y) { to = [x, y]; },
    stroke() {}, drawImage() { images++; } };
  ParticleEngine.prototype.drawRain.call({ ctx, width: 360, height: 640, rainEnvelope: 0,
    naturalRain: true, palette: { rain: '#d2d9eb' }, rainScale: 1.75, count: 1,
    kind: [0], depth: [2], x: [100], y: [150], vx: [26], vy: [650], ripples: [] });
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  assert.ok(length > 30 && length < 64); assert.equal(images, 0); assert.equal(ctx.lineWidth, 3.5);
});

test('Gemini leaves the live camera transparent but keeps its preview background', () => {
  let fills = 0;
  const ctx = { createLinearGradient: () => gradient, createRadialGradient: () => gradient, fillRect: () => fills++ };
  const instance = { ctx, width: 360, height: 640, preview: false, mood: 'neutral' };
  GeminiParticleEngine.prototype.drawBackground.call(instance);
  assert.equal(fills, 0);
  instance.preview = true;
  GeminiParticleEngine.prototype.drawBackground.call(instance);
  assert.equal(fills, 2);
});

test('Gemini small smiles trigger rain while the original profile remains below its gate', () => {
  const signal = { smile: .38, jaw: .05, cheek: 0 };
  const rows = feed(new GeminiExpressionState(), signal, 500);
  assert.ok(rows.find(row => row.label === 'smile').time <= 200);
  assert.ok(rows.at(-1).rain > 0);
  assert.equal(feed(new ExpressionState(), signal, 500).at(-1).label, 'neutral');
});

test('Gemini sensitivity changes smile and laugh thresholds and survives resets', () => {
  function settled(sensitivity, signal) {
    const state = new GeminiExpressionState(); state.sensitivity = sensitivity;
    state.smile = state.jaw = 0; state.label = 'neutral';
    return { state, result: feed(state, signal, 1500).at(-1) };
  }
  assert.equal(settled(1.25, { smile: .34, jaw: .05 }).result.label, 'smile');
  assert.equal(settled(.75, { smile: .34, jaw: .05 }).result.label, 'neutral');
  assert.equal(settled(1.25, { smile: .50, jaw: .27 }).result.label, 'laugh');
  assert.notEqual(settled(1, { smile: .50, jaw: .27 }).result.label, 'laugh');
  const { state } = settled(1.25, { smile: .34, jaw: .05 });
  state.reset(); assert.equal(state.sensitivity, 1.25); assert.equal(state.machine.sensitivity, 1.25);
  assert.equal(state.machine.fireworkCooldownMs, 340);
});

test('Gemini mouth-only speech settles to neutral without repeated fireworks', () => {
  const state = new GeminiExpressionState();
  const rows = feed(state, { smile: .08, jaw: .85 }, 3000);
  assert.equal(rows.at(-1).label, 'neutral'); assert.ok(rows.every(row => !row.burst));
});

test('Gemini continuous laughter follows original strict greater-than-340ms cooldown', () => {
  const state = new GeminiExpressionState();
  assert.equal(state.update({ smile: .82, jaw: .52 }, 340).burst, false);
  assert.equal(state.update({ smile: .82, jaw: .52 }, 341).burst, true);
  assert.equal(state.update({ smile: .82, jaw: .52 }, 681).burst, false);
  assert.equal(state.update({ smile: .82, jaw: .52 }, 682).burst, true);
  const bursts = feed(new GeminiExpressionState(), { smile: .82, jaw: .52 }, 2000).filter(row => row.burst);
  assert.equal(bursts[0].time, 360); assert.equal(bursts.length, 5);
});

test('Gemini missing updates hold the last raw coefficients, with original startup values', () => {
  const state = new GeminiExpressionState();
  assert.equal(state.label, 'laugh'); assert.equal(state.smile, .72); assert.equal(state.jaw, .52);
  state.update({ smile: .44, jaw: .1 }, 0);
  for(let i=1;i<30;i++)state.update(null,i*1000/60);
  assert.equal(state.label, 'smile'); assert.ok(Math.abs(state.smile-.44)<.00001);
  state.reset(); assert.equal(state.label, 'laugh');
});

test('Gemini per-render recognition stays original while reduced motion limits emitted rockets', () => {
  const e=engine();e.preview=false;e.signal={smile:.78,jaw:.56};e.lightMotion=true;
  const launches=[];e.pool.spawnFireworkRocket=()=>launches.push(e.renderTime);
  for(let i=0;i<180;i++)e.update(1/60,{x:180,y:320,rx:60,ry:80},1000+i*1000/60);
  assert.equal(e.expressionState.machine.fireworkCooldownMs,340);
  assert.equal(launches.length,3);
  for(let i=1;i<launches.length;i++)assert.ok(launches[i]-launches[i-1]>=900);
});

test('Gemini preview matches GPT head dimensions and neutral preview can be released back to live input', () => {
  const e = engine();
  e.setManualMood('neutral');
  for (let i = 0; i < 30; i++) e.update(1 / 60, null, i * 17);
  const base = Math.min(360 * .19, 640 * .115);
  assert.equal(e.collider.rx, base); assert.equal(e.collider.ry, base * 1.38);
  assert.equal(e.expressionResult.label, 'neutral');
  e.preview = false; e.signal = { smile: .78, jaw: .56 };
  const head = { x: 180, y: 320, rx: 50, ry: 75, angle: 0 };
  for (let i = 0; i < 30; i++) e.update(1 / 60, head, 600 + i * 17);
  assert.equal(e.expressionResult.label, 'neutral');
  e.setManualMood('neutral');
  for (let i = 0; i < 30; i++) e.update(1 / 60, head, 1200 + i * 17);
  assert.equal(e.expressionResult.label, 'laugh');
  assert.ok(Math.abs(e.collider.rx - head.rx) < .01);
});

test('shared tracker exports cheek squint without changing the original smile measurement', () => {
  const points = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }));
  const values = { mouthSmileLeft: .4, mouthSmileRight: .6, jawOpen: .2, cheekSquintLeft: .2, cheekSquintRight: .4 };
  const result = extractSignal({ faceLandmarks: [points], faceBlendshapes: [{ categories: Object.entries(values).map(([categoryName, score]) => ({ categoryName, score })) }] });
  assert.equal(result.smile, .5); assert.ok(Math.abs(result.cheek - .3) < 1e-9);
  assert.equal(extractSignal({}), null);
});

test('Gemini swept rain collision creates a splash even when a drop crosses the entire head', () => {
  const pool = new GeminiParticlePool(); pool.spawnRainDrop(360, 640);
  Object.assign(pool.slots[0], { x: 180, y: 100, vx: 0, vy: 500, maxLife: 120 });
  pool.updateAndCollide(360, 640, { active: true, x: 180, y: 320, rx: 60, ry: 80, angle: .2, vx: 0, vy: 0, speed: 0, registerImpact() {} });
  assert.equal(pool.totalCollisions, 1); assert.ok(pool.slots.some(p => p.active && p.type === 2));
});

test('Gemini fixed simulation matches at 30, 60 and 120 display FPS', () => {
  function simulate(fps) {
    const original = Math.random; let seed = 17;
    Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    try {
      const e = engine(); e.preview=false; e.signal={smile:0,jaw:0}; e.expressionState.smile=e.expressionState.jaw=0; e.expressionState.label='neutral'; e.rainOverride=.75; e.celebrate(null);
      const head = { x: 180, y: 320, rx: 60, ry: 80, angle: .1 };
      for (let i = 0; i < fps * 2; i++) e.update(1 / fps, head);
      return e.pool.slots.filter(p => p.active).map(p => [p.type, p.x, p.y, p.vx, p.vy, p.life]);
    } finally { Math.random = original; }
  }
  assert.deepEqual(simulate(30), simulate(60)); assert.deepEqual(simulate(60), simulate(120));
});

test('Gemini rapid gifts and strong moving-head input stay finite within the reduced budget', () => {
  const e = engine(); e.limit = 450; e.setManualMood('rain');
  for (let i = 0; i < 720; i++) {
    if (i % 3 === 0) e.celebrate(null);
    e.update(1 / 120, { x: 180, y: 320, rx: 60, ry: 80, angle: .2, vx: 1e6, vy: -1e6 });
    assert.ok(e.count <= 450); assert.ok(e.celebrations.length <= 10); assert.ok(e.impacts.length <= 16);
    for (const p of e.pool.slots) if (p.active) assert.ok([p.x, p.y, p.vx, p.vy].every(Number.isFinite));
  }
});

test('Gemini resizing, palette selection and clearing preserve a reusable engine', () => {
  const e = engine(); e.setPalette('aurora'); e.rainStrength = .8; e.celebrate(null);
  for (let i = 0; i < 60; i++) e.update(1 / 60, null);
  e.resize(320, 568); e.draw();
  assert.equal(e.canvas.width, 320); assert.equal(e.pool.paletteIndex, 1); assert.ok(e.count > 0);
  e.clear(); assert.equal(e.count, 0); assert.equal(e.fireworksActive, false); assert.equal(e.rainStrength, 0);
  e.celebrate(null); assert.equal(e.fireworksActive, true);
});
