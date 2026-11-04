import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticleEngine } from '../src/particles.js';
import { solveTimedLaunch, advanceAxis } from '../src/firework-physics.js';
import { ExpressionState } from '../src/expression.js';
import { demoCue } from '../src/demo-scene.js';
import { ReferenceHeadCollider } from './fixtures/gemini-reference.js';
const gradient = { addColorStop() {} };
const context = new Proxy({}, { get(target, key) { return key === 'createRadialGradient' || key === 'createLinearGradient' ? () => gradient : () => {}; } });
const canvas = () => ({ getContext: () => context, width: 0, height: 0 });
Object.assign(globalThis, { innerWidth: 390, devicePixelRatio: 1, document: { createElement: canvas } });
function engine(limit = 850) { const e = new ParticleEngine(canvas(), canvas()); e.resize(360, 640); e.limit = limit; return e; }

test('short launch reaches its apex in the requested time with zero vertical speed', () => {
  for (const drag of [0, 1e-6, 2.6]) for (const height of [120, 700]) {
    const s = solveTimedLaunch(height, 45, .38, drag, 3);
    const x = advanceAxis(0, s.vx, 3, drag, s.duration), y = advanceAxis(height, s.vy, s.gravity, drag, s.duration);
    assert.ok(Math.abs(s.duration - .38) < 1e-8); assert.ok(Math.abs(x.position - 45) < 1e-8);
    assert.ok(Math.abs(y.position) < 1e-7); assert.ok(Math.abs(y.velocity) < 1e-6);
  }
  assert.throws(() => solveTimedLaunch(100, 0, 0), RangeError);
});

test('ten rapid gifts produce an immediate cue and multiple timely blooms', () => {
  const e = engine(), blooms = [], original = e.burst.bind(e);
  e.burst = (...args) => { blooms.push(e.time); return original(...args); };
  for (let i = 0; i < 10; i++) assert.equal(e.celebrate(null), true);
  assert.ok(e.flashes.length > 0); assert.ok(e.celebrations.length <= 10);
  for (let i = 0; i < 360; i++) e.update(1 / 120, null);
  assert.ok(blooms[0] <= .42); assert.ok(blooms.length >= 10); assert.equal(e.celebrations.length, 0);
});

test('repeated input at the low particle budget stays bounded and finite', () => {
  const e = engine(450); e.rainStrength = .8;
  for (let i = 0; i < 900; i++) {
    if (i % 3 === 0) e.celebrate(null);
    e.update(1 / 120, { x: 180, y: 320, rx: 68, ry: 94, angle: 0 });
    assert.ok(e.count <= 450); assert.ok(e.celebrations.length <= 10); assert.ok(e.rockets.length <= 6);
    assert.ok(e.flybys.length <= 48); assert.ok(e.flashes.length <= 8);
    for (let j = 0; j < e.count; j++) assert.ok(Number.isFinite(e.x[j] + e.y[j] + e.vx[j] + e.vy[j] + e.life[j]));
  }
});

test('queued celebrations retain identical fixed-step results at 30, 60 and 120 FPS', () => {
  const random = Math.random;
  function run(fps) {
    let seed = 12345; Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
    const e = engine(); for (let i = 0; i < 6; i++) e.celebrate(null);
    for (let i = 0; i < fps * 3; i++) e.update(1 / fps, null);
    return { count: e.count, x: Array.from(e.x.slice(0, e.count)), y: Array.from(e.y.slice(0, e.count)) };
  }
  try { const a = run(30); assert.deepEqual(run(60), a); assert.deepEqual(run(120), a); } finally { Math.random = random; }
});

test('clear laughter responds within 225 ms of supplied signals without bypassing the mouth-only guard', () => {
  const s = new ExpressionState(); let burstAt;
  for (let t = 0; t <= 225; t += 75) if (s.update({ smile: .9, jaw: .5 }, t).burst) burstAt = t;
  assert.ok(burstAt >= 90 && burstAt <= 225);
  const mouth = new ExpressionState(); for (let t = 0; t <= 1000; t += 75) assert.equal(mouth.update({ smile: .08, jaw: .8 }, t).burst, false);
});

test('AI storyboard cues match the composed smile, laugh and neutral intervals', () => {
  assert.equal(demoCue(1).rain, 0); assert.equal(demoCue(3).phase, 'smile'); assert.equal(demoCue(6).phase, 'laugh');
  assert.equal(demoCue(8.6).rain, 0); assert.deepEqual(demoCue(13), demoCue(3));
});

function drawCommands(draw) {
  const calls = []; let gradient = 0;
  const clean = v => v?.gradient ? { gradient: v.gradient } : v;
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...args) => {
        const id = ++gradient; calls.push([key, ...args]);
        return { gradient: id, addColorStop: (...args) => calls.push(['colorStop', id, ...args]) };
      };
      return (...args) => calls.push([key, ...args.map(clean)]);
    },
    set(target, key, value) { calls.push(['set', key, clean(value)]); return true; }
  });
  draw(ctx); return calls;
}

test('GPT preview uses the original Gemini portrait and mesh for each mood without changing head physics', () => {
  const e = engine(), head = { x: 180, y: 320, rx: 68, ry: 94, angle: .18, vx: 55, vy: -22 };
  const originalHead = { ...head };
  for (const [mood, smile, jaw] of [['neutral', .08, .03], ['rain', .44, .10], ['fireworks', .78, .56]]) {
    e.clear();
    if (mood === 'rain') e.rainStrength = .7;
    if (mood === 'fireworks') e.celebrate(head);
    const state = [e.time, e.count, e.collisions];
    const reference = Object.assign(new ReferenceHeadCollider(), head);
    assert.deepEqual(drawCommands(ctx => { e.ctx = ctx; e.drawGhost(head); }),
      drawCommands(ctx => reference.renderColliderMesh(ctx, mood, true, true, smile, jaw)));
    assert.deepEqual(head, originalHead); assert.deepEqual([e.time, e.count, e.collisions], state);
  }
});

test('GPT preview maps real spark impacts into Gemini arcs and leaves camera and AI frames unobstructed', () => {
  const e = engine(), head = { x: 180, y: 320, rx: 68, ry: 94, angle: 0 };
  e.celebrate(head); e.impacts.push({ x: 180, y: 226, life: .125 });
  const reference = Object.assign(new ReferenceHeadCollider(), head);
  Object.assign(reference.impacts[0], { active: true, angle: -Math.PI / 2, life: 9, maxLife: 18, color: '#FDE047' });
  assert.deepEqual(drawCommands(ctx => { e.ctx = ctx; e.drawGhost(head); }),
    drawCommands(ctx => reference.renderColliderMesh(ctx, 'fireworks', true, true, .78, .56)));
  let drawn = 0; e.clear(); e.drawGhost = () => { drawn++; };
  e.preview = false; e.draw(head); assert.equal(drawn, 0);
  e.preview = true; e.draw(head); assert.equal(drawn, 1);
});

test('GPT halo switch controls the mesh on the synthetic avatar and on live frames', () => {
  const e = engine(), head = { x: 180, y: 320, rx: 68, ry: 94, angle: 0 };
  const reference = Object.assign(new ReferenceHeadCollider(), head);
  e.showColliderMesh = false;
  assert.deepEqual(drawCommands(ctx => { e.ctx = ctx; e.drawGhost(head); }),
    drawCommands(ctx => reference.renderColliderMesh(ctx, 'neutral', false, true, .08, .03)));
  e.showColliderMesh = true;
  assert.deepEqual(drawCommands(ctx => { e.ctx = ctx; e.drawAvatar(head, false); }),
    drawCommands(ctx => reference.renderColliderMesh(ctx, 'neutral', true, false, .08, .03)));
});
