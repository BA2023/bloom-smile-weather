import test from 'node:test';
import assert from 'node:assert/strict';
import { motionCoefficients, advanceAxis, solveLaunchToApex, sphereDirection, burnIntensity, projectSpark } from '../src/firework-physics.js';
const close = (a,b,tolerance=1e-8) => assert.ok(Math.abs(a-b)<tolerance, `${a} differs from ${b}`);

test('drag and gravity give the same trajectory at 30, 60 and 120 FPS', () => {
  const expected=advanceAxis(30,-240,105,.85,2);
  for(const fps of [30,60,120]){let p=30,v=-240;for(let i=0;i<fps*2;i++){const next=advanceAxis(p,v,105,.85,1/fps);p=next.position;v=next.velocity}close(p,expected.position);close(v,expected.velocity)}
});
test('zero and tiny drag converge to ordinary ballistic motion', () => {
  for(const drag of [0,1e-12,1e-8]){const p=advanceAxis(12,-40,100,drag,1.5);close(p.position,12-60+112.5,1e-5);close(p.velocity,110,1e-5)}
});
test('apex solver hits the chosen height and stops rising, including wind', () => {
  for(const drag of [0,1e-10,.2,1.5,8])for(const height of [1,120,500]){const shot=solveLaunchToApex(height,70,100,drag,6);const y=advanceAxis(600,shot.vy,100,drag,shot.duration),x=advanceAxis(10,shot.vx,6,drag,shot.duration);close(y.position,600-height,1e-6);close(y.velocity,0,1e-6);close(x.position,80,1e-6);assert.ok(advanceAxis(600,shot.vy,100,drag,shot.duration+.05).velocity>0)}
});
test('motion stays finite under strong drag and rejects invalid time or gravity', () => {
  const c=motionCoefficients(200,3);assert.ok(Object.values(c).every(Number.isFinite));assert.throws(()=>motionCoefficients(-1,.1),RangeError);assert.throws(()=>motionCoefficients(1,-1),RangeError);assert.throws(()=>solveLaunchToApex(30,0,0),RangeError);assert.deepEqual(solveLaunchToApex(0,0,100),{duration:0,vx:0,vy:0});
});
test('drag dissipates speed and gravity approaches terminal velocity', () => {
  let v=250;for(let i=0;i<20;i++){const next=advanceAxis(0,v,0,1,.1);assert.ok(Math.abs(next.velocity)<Math.abs(v));v=next.velocity}close(advanceAxis(0,0,120,1.5,20).velocity,80,1e-8);
});
test('sphere directions cover the center and rim without concentrating at the poles', () => {
  let x=0,y=0,z=0,minRadius=1,maxRadius=0;for(let i=0;i<512;i++){const d=sphereDirection(i,512,.4);close(Math.hypot(d.x,d.y,d.z),1);x+=d.x;y+=d.y;z+=d.z;const radius=Math.hypot(d.x,d.y);minRadius=Math.min(minRadius,radius);maxRadius=Math.max(maxRadius,radius)}assert.ok(Math.abs(x/512)<.01&&Math.abs(y/512)<.01&&Math.abs(z/512)<.01);assert.ok(minRadius<.1&&maxRadius>.99);
});
test('burning particles ignite briefly and continuously fade to zero', () => {
  assert.equal(burnIntensity(0,3),0);let last=burnIntensity(.04,3);for(let t=.08;t<=3;t+=.04){const b=burnIntensity(t,3);assert.ok(b>=0&&b<=last);last=b}assert.equal(burnIntensity(4,3),0);
});
const spark={x:180,y:200,z:-80,dx:100,dy:30,dz:560,drag:.3,gravity:100,duration:2.3,camera:{x:180,y:250,focal:700,near:110}};
test('physical depth velocity slows while perspective magnifies the path', () => {
  const far=projectSpark(spark,.2),near=projectSpark(spark,1.3);assert.ok(near.visible&&near.scale>far.scale*3&&near.vz<far.vz);assert.ok(near.x-projectSpark(spark,1.2).x>far.x-projectSpark(spark,.1).x);
});
test('near-plane and expired sparks fade and never invert or explode in size', () => {
  for(let age=0;age<3;age+=.01){const p=projectSpark(spark,age);assert.ok([p.x,p.y,p.scale,p.depthFade].every(Number.isFinite));assert.ok(p.scale>0&&p.scale<=700/110);if(p.distance<=110)assert.equal(p.visible,false)}assert.equal(projectSpark(spark,3).visible,false);assert.ok(projectSpark(spark,1.3).depthFade<1);
});
