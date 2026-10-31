import test from 'node:test';
import assert from 'node:assert/strict';
import { projectLandmark, collideEllipse, headEllipse } from '../src/geometry.js';
import { ExpressionState } from '../src/expression.js';
import { projectSpark } from '../src/particles.js';

test('foreground perspective accelerates toward the lens before exiting the field of view', () => {
  const spark = { x: 180, y: 190, dx: 180, dy: -90, duration: 1.8 };
  const far = projectSpark(spark, .3), near = projectSpark(spark, 1.5);
  assert.ok(far.x < 360 && near.x > 360);
  assert.ok(near.scale > far.scale * 3);
  assert.ok(near.x - projectSpark(spark, 1.4).x > far.x - projectSpark(spark, .2).x);
});
test('foreground projection stays finite at and beyond its lifetime', () => {
  const spark = { x: 180, y: 190, dx: -200, dy: -130, duration: 1.8 };
  for (const age of [0, .5, 1.8, 2]) {
    const p = projectSpark(spark, age);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.scale > 0);
  }
});

test('cover crop and mirrored landmarks agree with video display', () => {
  assert.deepEqual(projectLandmark({ x: .25, y: .5 }, 1280, 720, 640, 360), { x: 480, y: 180 });
  assert.deepEqual(projectLandmark({ x: .5, y: .5 }, 1280, 720, 300, 500), { x: 150, y: 250 });
});
test('ellipse detects fast particles crossing the entire head between frames', () => {
  const hit = collideEllipse(-100, 0, 100, 0, 2000, 0, { x: 0, y: 0, rx: 30, ry: 45 });
  assert.ok(hit); assert.ok(hit.x < -30); assert.ok(hit.vx < 0);
  assert.equal(collideEllipse(-100, 70, 100, 70, 2000, 0, { x: 0, y: 0, rx: 30, ry: 45 }), null);
});
test('moving collider projects trapped particles out and clamps head impulse', () => {
  const hit = collideEllipse(0, 0, 0, 1, 0, 20, { x: 0, y: 0, rx: 30, ry: 45, vy: -99999 });
  assert.ok(Number.isFinite(hit.vy)); assert.ok(Math.abs(hit.vy) < 1000);
  assert.ok((hit.x / 30) ** 2 + (hit.y / 45) ** 2 > 1);
});
test('rotated ellipse reflects downward motion from its top boundary', () => {
  const hit = collideEllipse(0, -100, 0, 100, 0, 1000, { x: 0, y: 0, rx: 30, ry: 50, angle: .4 });
  assert.ok(hit); assert.ok(hit.vy < 0);
});
test('projected head has positive radii after mirror', () => {
  const e = headEllipse([{ x: .5, y: .2 }, { x: .5, y: .7 }, { x: .3, y: .45 }, { x: .7, y: .45 }], 640, 480, 600, 450);
  assert.ok(e.rx > 0 && e.ry > 0); assert.equal(e.x, 300);
});
function feed(state, input, from, duration, step = 75) {
  const results = [];
  for (let t = from; t <= from + duration; t += step) results.push(state.update(input, t));
  return results;
}
test('opening the mouth alone never triggers fireworks', () => {
  const s = new ExpressionState();
  const results = feed(s, { smile: .08, jaw: .8 }, 0, 3000);
  assert.ok(results.every(r => !r.burst)); assert.equal(results.at(-1).label, 'neutral');
});
test('smile causes rain; sustained laughter bursts once until release and cooldown', () => {
  const s = new ExpressionState();
  const smile = feed(s, { smile: .65, jaw: .04 }, 0, 750);
  assert.equal(smile.at(-1).label, 'smile'); assert.ok(smile.at(-1).rain > 0);
  const laugh = feed(s, { smile: .9, jaw: .5 }, 800, 4000);
  assert.equal(laugh.filter(r => r.burst).length, 1);
  feed(s, { smile: .1, jaw: .02 }, 4900, 750);
  const again = feed(s, { smile: .9, jaw: .5 }, 5800, 1000);
  assert.equal(again.filter(r => r.burst).length, 1);
});
test('short spikes cannot trigger; lost face removes rain', () => {
  const s = new ExpressionState();
  assert.equal(s.update({ smile: 1, jaw: 1 }, 0).burst, false);
  const r = s.update(null, 80); assert.equal(r.rain, 0); assert.equal(r.label, 'no-face');
});
