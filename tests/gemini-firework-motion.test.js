import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiParticleEngine, GeminiParticlePool } from '../src/gemini-particles.js';
import { advanceAxis, projectSpark } from '../src/firework-physics.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const pool = () => new GeminiParticlePool(256, { inertialFireworks: true });

test('Gemini rocket slows to zero vertical speed and explodes exactly at its chosen apex', () => {
  const p = pool(); p.spawnFireworkRocket(360, 728, 125, 178);
  const rocket = p.slots.find(particle => particle.active), initialSpeed = -rocket.vy;
  let hit = null;
  p.spawnFireworkExplosion = (x, y) => { hit = { x, y, vy: rocket.vy }; };
  for (let i = 0; i < Math.ceil(rocket.maxLife); i++) {
    p.updateAndCollide(360, 728, null);
    if (!hit) assert.ok(rocket.vy < 0 && -rocket.vy < initialSpeed);
  }
  assert.ok(hit); close(hit.x, 125); close(hit.y, 178); close(hit.vy, 0);
});

test('Gemini airborne embers use the GPT drag/gravity solution and turn downward naturally', () => {
  const p = pool(), ember = p.slots[0];
  Object.assign(ember, { active: true, type: 4, x: 120, y: 150, vx: 3, vy: -2,
    gravity: 105 / 3600, wind: 3 / 3600, dragRate: .9 / 60, maxLife: 180 });
  for (let i = 0; i < 120; i++) p.updateAndCollide(600, 900, null);
  const x = advanceAxis(120, 3, 3 / 3600, .9 / 60, 120);
  const y = advanceAxis(150, -2, 105 / 3600, .9 / 60, 120);
  close(ember.x, x.position); close(ember.y, y.position); close(ember.vx, x.velocity); close(ember.vy, y.velocity);
  assert.ok(ember.vx < 3 && ember.vy > 0);
});

test('Gemini bursts retain their colors and layers while using spherical directions and longer burning lifetimes', () => {
  const p = pool(); p.spawnFireworkExplosion(180, 160, 1);
  const embers = p.slots.filter(particle => particle.active);
  assert.ok(embers.length >= 56 && embers.length <= 73);
  assert.ok(embers.some(ember => ember.vy > 0) && embers.some(ember => ember.vy < 0));
  assert.ok(embers.every(ember => ember.maxLife >= 99 && ember.dragRate > 0));
  assert.equal(new Set(embers.map(ember => ember.color)).size, 5);
  assert.ok(embers.filter((_, i) => i % 3 === 0).every(ember => ember.maxLife >= 129));
});

test('Gemini falling embers lose energy at a head impact without gaining life or creating a spark fountain', () => {
  const p = pool(), ember = p.slots[0];
  Object.assign(ember, { active: true, type: 4, x: 180, y: 190, vx: 0, vy: 70,
    gravity: 105 / 3600, wind: 0, dragRate: .9 / 60, life: 20, maxLife: 180 });
  let contacts = 0;
  const head = { active: true, x: 180, y: 320, rx: 60, ry: 80, angle: 0, vx: 0, vy: 0, speed: 0,
    registerImpact() { contacts++; } };
  p.updateAndCollide(360, 728, head);
  assert.equal(contacts, 1); assert.ok(ember.vy < 0 && Math.abs(ember.vy) < 30);
  assert.equal(ember.life, 21); assert.ok(ember.maxLife <= 72); assert.ok(ember.dragRate >= 1.2 / 60);
  assert.equal(p.slots.filter(particle => particle.active).length, 1);
  assert.ok([...ember.trailY].every(y => y <= head.y - head.ry));
});

test('Gemini near-camera embers stay bounded, fade at the near plane, and clear with resize or reduced effects', () => {
  const p = pool();
  for (let i = 0; i < 20; i++) p.spawnFireworkExplosion(180, 140, i % 3);
  assert.equal(p.fireworkMotion.flybys.length, 32);
  for (const ember of p.fireworkMotion.flybys) {
    const far = projectSpark(ember, .15), near = projectSpark(ember, 1);
    assert.ok(near.scale > far.scale && near.vz < far.vz);
    for (let t = 0; t < 3; t += .03) {
      const point = projectSpark(ember, t);
      assert.ok([point.x, point.y, point.scale, point.depthFade].every(Number.isFinite));
      if (point.distance <= ember.camera.near) assert.equal(point.visible, false);
    }
  }
  p.lightMotion = true; p.updateAndCollide(360, 640, null);
  assert.equal(p.fireworkMotion.flybys.length, 0);
  p.lightMotion = false; p.spawnFireworkExplosion(180, 140, 0);
  p.fireworkMotion.resize(390, 844); assert.equal(p.fireworkMotion.flybys.length, 0);
});

test('Gemini synthetic laughter launches first, and clearing removes every firework layer', () => {
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, { get: (_, key) => String(key).startsWith('create') ? () => gradient : () => {} });
  Object.assign(globalThis, { devicePixelRatio: 1 });
  const engine = new GeminiParticleEngine({ getContext: () => ctx }); engine.resize(360, 728);
  engine.syntheticMood = 'fireworks'; engine.update(1 / 60, null);
  assert.ok(engine.pool.slots.some(p => p.active && p.type === 3));
  assert.ok(engine.pool.slots.every(p => !p.active || p.type !== 4));
  engine.pool.spawnFireworkExplosion(180, 160, 0); assert.ok(engine.flybys.length > 0);
  engine.clear(); assert.equal(engine.fireworksActive, false); assert.equal(engine.flybys.length, 0);
});
