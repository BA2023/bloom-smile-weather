import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticleEngine } from '../src/particles.js';
import { GeminiParticleEngine, GeminiParticlePool } from '../src/gemini-particles.js';
import { RAIN_COLORS } from '../src/rain-colors.js';

function canvas() {
  const strokes = []; let path = false;
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (String(key).startsWith('create')) return () => gradient;
      if (key === 'beginPath') return () => { path = false; };
      if (['moveTo', 'lineTo', 'ellipse'].includes(key)) return () => { path = true; };
      if (key === 'stroke') return () => { if (path) strokes.push(target.strokeStyle); };
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  return { width: 1, height: 1, getContext: () => ctx, strokes };
}

test('both styles emit 80% blue/cyan rain and 20% theme accents across palettes', () => {
  Object.assign(globalThis, { innerWidth: 1440, devicePixelRatio: 1, document: { createElement: canvas } });
  const gpt = new ParticleEngine(canvas()); gpt.resize(360, 640);
  for (const [key, colors] of Object.entries(RAIN_COLORS)) {
    assert.deepEqual(colors.slice(0, 2), ['#64ceff', '#4dd7e2']);
    const gemini = new GeminiParticlePool(128); gemini.rainColors = colors;
    for (let i = 0; i < 100; i++) gemini.spawnRainDrop(360, 640, .7, true);
    const geminiCounts = colors.map(color => gemini.slots.filter(p => p.active && p.color === color).length);
    assert.deepEqual(geminiCounts, [40, 40, 20], `Gemini ${key}`);
    if (key === 'auto') continue;
    gpt.clear(); gpt.setPalette(key); gpt.rainAccumulator = 100; gpt.step(1 / 120, null);
    const gptColors = [...gpt.color.slice(0, gpt.count)];
    assert.deepEqual(colors.map((_, i) => gptColors.filter(index => index === i).length), [40, 40, 20], `GPT ${key}`);
  }
});

test('GPT rain is multicolored and a landed ripple keeps the color of its parent drop', () => {
  Object.assign(globalThis, { innerWidth: 1440, devicePixelRatio: 1, document: { createElement: canvas } });
  const surface = canvas(), engine = new ParticleEngine(surface); engine.resize(360, 640);
  engine.rainStrength = .8;
  for (let i = 0; i < 60; i++) engine.update(1 / 60, null);
  assert.equal(new Set([...engine.color.slice(0, engine.count)]).size, 3);
  engine.clear(); surface.strokes.length = 0;
  engine.spawn(100, 200, 0, 400, { kind: 0, color: 2, size: 2, depth: 1, life: 2 });
  engine.drawRain();
  const rgb = engine.rainRGBs[2].join(',');
  assert.ok(surface.strokes.some(color => color.startsWith(`rgba(${rgb},`)));
  engine.y[0] = 500;
  const random = Math.random; Math.random = () => .1;
  try { engine.step(1 / 120, null); } finally { Math.random = random; }
  assert.equal(engine.ripples.length, 1); assert.equal(engine.ripples[0].color, 2);
  surface.strokes.length = 0; engine.drawRain();
  assert.ok(surface.strokes.length > 0);
  assert.ok(surface.strokes.every(color => color.startsWith(`rgba(${rgb},`)));
});

test('Gemini drops use multiple colors and transfer their color to impact arcs and splashes', () => {
  const pool = new GeminiParticlePool(32); pool.rainColors = RAIN_COLORS.auto;
  for (let i = 0; i < 6; i++) pool.spawnRainDrop(360, 640, .7, true);
  assert.equal(new Set(pool.slots.filter(p => p.active).map(p => p.color)).size, 3);
  for (const p of pool.slots) p.active = false;
  pool.spawnRainDrop(360, 640, .7, true);
  const parent = pool.slots.find(p => p.active), color = '#f0b3a4', impacts = [];
  Object.assign(parent, { x: 180, y: 100, vx: 0, vy: 500, maxLife: 120, color });
  pool.updateAndCollide(360, 640, { active: true, x: 180, y: 320, rx: 60, ry: 80,
    angle: 0, vx: 0, vy: 0, speed: 0, registerImpact: (angle, value) => impacts.push(value) });
  assert.equal(impacts[0], color);
  const splashes = pool.slots.filter(p => p.active && p.type === 2);
  assert.ok(splashes.length > 0); assert.ok(splashes.every(p => p.color === color));
});

test('Gemini palette changes immediately recolor visible rain, splashes and contact arcs together', () => {
  const surface = canvas(), engine = new GeminiParticleEngine(surface);
  const pool = engine.pool;
  engine.setPalette('gold');
  for (let i = 0; i < 3; i++) pool.spawnRainDrop(360, 640, .7, true);
  const drops = pool.slots.filter(p => p.active);
  drops.forEach((p, i) => Object.assign(p, { x: 40 + i * 30, y: 200, life: 12 }));
  pool.spawnRainSplash(180, 250, 0, -1, 0, 0, RAIN_COLORS.gold[1]);
  engine.collider.registerImpact(-1, RAIN_COLORS.gold[1]);
  pool.spawnFireworkRocket(360, 640);
  const rocket = pool.slots.find(p => p.active && p.type === 3), fireworkColor = rocket.color;
  const pose = drops.map(({ x, y, life }) => ({ x, y, life }));

  for (const key of ['rose', 'aurora', 'gold', 'auto']) {
    engine.setPalette(key);
    assert.deepEqual(drops.map(p => p.color), RAIN_COLORS[key]);
    assert.deepEqual(drops.map(({ x, y, life }) => ({ x, y, life })), pose);
    assert.ok(pool.slots.filter(p => p.active && p.type === 2).every(p => p.color === RAIN_COLORS[key][1]));
    assert.equal(engine.impacts[0].color, RAIN_COLORS[key][1]);
    assert.equal(rocket.color, fireworkColor);
    surface.strokes.length = 0;
    pool.render(surface.getContext(), 1, 1, true, true);
    for (const color of RAIN_COLORS[key]) assert.ok(surface.strokes.includes(color), `${key} rain renders ${color}`);
  }
  engine.setPalette('aurora');
  for (let i = 0; i < 10; i++) pool.spawnRainDrop(360, 640, .7, true);
  const fresh = pool.slots.filter(p => p.active && p.type === 1).slice(3);
  assert.deepEqual(RAIN_COLORS.aurora.map(color => fresh.filter(p => p.color === color).length), [4, 4, 2]);
});
