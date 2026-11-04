import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiParticlePool, GeminiParticleEngine } from '../src/gemini-particles.js';
import { GeminiHeadCollider, geminiHeadEllipse } from '../src/gemini-collider.js';
import { GeminiExpressionState } from '../src/gemini-expression.js';
import { projectLandmark } from '../src/geometry.js';
import { ReferenceParticlePool, ReferenceHeadCollider, ReferenceExpressionState } from './fixtures/gemini-reference.js';
Object.assign(globalThis,{devicePixelRatio:1});

function seeded(action) {
  const original = Math.random; let state = 291;
  Math.random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  try { return action(); } finally { Math.random = original; }
}
function snapshot(pool) {
  return pool.slots.map(p => p.active ? [p.type,p.x,p.y,p.vx,p.vy,p.size,p.life,p.maxLife,p.color,p.trailHead,[...p.trailX],[...p.trailY]] : null);
}
function recorder() {
  const calls = []; let gradient = 0;
  const clean = v => v?.gradient ? { gradient: v.gradient } : v;
  const ctx = new Proxy({}, {
    get(target, key) {
      if (String(key).startsWith('create') && String(key).endsWith('Gradient')) return (...args) => {
        const id = ++gradient; calls.push([key,...args]); return { gradient:id, addColorStop: (...args) => calls.push(['colorStop',id,...args]) };
      };
      return (...args) => calls.push([key,...args.map(clean)]);
    },
    set(target, key, value) { calls.push(['set',key,clean(value)]); return true; }
  });
  return {ctx,calls};
}

test('Gemini rain, random fireworks, particle movement and rendering match the frozen original', () => {
  function run(Type) { return seeded(() => {
    const pool = new Type(); pool.spawnFireworkExplosion(180,180);
    for(let i=0;i<8;i++)pool.spawnRainDrop(360,640,.6);
    for(let i=0;i<12;i++)pool.updateAndCollide(360,640,null,.85);
    const r=recorder();pool.render(r.ctx);return {particles:snapshot(pool),draw:r.calls};
  }); }
  assert.deepEqual(run(GeminiParticlePool),run(ReferenceParticlePool));
});

test('Gemini contact reflection, head momentum, life extension and secondary sparks match the original', () => {
  function run(Pool,Head,angle,vy) { return seeded(() => {
    const pool=new Pool(),head=new Head();head.x=180;head.y=300;head.rx=60;head.ry=80;head.angle=angle;head.vx=1.5;head.vy=-.6;head.speed=Math.hypot(head.vx,head.vy);
    pool.spawnFireworkExplosion(180,180,0);
    for(const p of pool.slots)p.active=false;
    Object.assign(pool.slots[0],{active:true,type:4,x:180,y:225,vx:1,vy,life:20,maxLife:100});
    pool.updateAndCollide(360,640,head,.85);return snapshot(pool);
  }); }
  for(const angle of [0,.25])for(const vy of [4,-1])assert.deepEqual(run(GeminiParticlePool,GeminiHeadCollider,angle,vy),run(ReferenceParticlePool,ReferenceHeadCollider,angle,vy));
});

test('Gemini full glass portrait, head mesh and expanding shockwaves draw identically to the original', () => {
  for(const mood of ['neutral','rain','fireworks'])for(const wireframe of [true,false]) {
    function run(Type) {
      const head=new Type();head.resetCenter(360,640);head.registerImpact(-1.2,'#38BDF8');
      for(let i=0;i<5;i++)head.stepInterpolation(.28);
      const r=recorder();head.renderColliderMesh(r.ctx,mood,wireframe,true,.78,.56);return r.calls;
    }
    assert.deepEqual(run(GeminiHeadCollider),run(ReferenceHeadCollider));
  }
});

test('Gemini head fitting and interpolation retain original landmark geometry and momentum', () => {
  const points=[{x:.5,y:.2},{x:.5,y:.7},{x:.3,y:.43},{x:.7,y:.47}],landmarks=[];
  [10,152,234,454].forEach((index,i)=>{landmarks[index]=points[i];});
  const ref=new ReferenceHeadCollider();ref.updateFromLandmarks(landmarks,p=>projectLandmark(p,640,480,360,728));
  const fit=geminiHeadEllipse(points,640,480,360,728);
  assert.deepEqual(fit,{x:ref.targetX,y:ref.targetY,rx:ref.targetRx,ry:ref.targetRy,angle:ref.targetAngle});
  const actual=new GeminiHeadCollider();Object.assign(actual,{targetX:ref.targetX,targetY:ref.targetY,targetRx:ref.targetRx,targetRy:ref.targetRy,targetAngle:ref.targetAngle});
  for(let i=0;i<50;i++){actual.stepInterpolation(.28);ref.stepInterpolation(.28);}
  for(const key of ['x','y','rx','ry','angle','vx','vy','speed'])assert.equal(actual[key],ref[key]);
});

test('Gemini initialization, per-render EMA, hysteresis and cooldown exactly match the original at 30/60/120Hz', () => {
  for(const fps of [30,60,120]) {
    const ref=new ReferenceExpressionState(),actual=new GeminiExpressionState();
    assert.equal(actual.smile,ref.smoothSmile);assert.equal(actual.jaw,ref.smoothJaw);
    for(let i=0;i<400;i++) {
      const smile=i<60?.44:i<250?.78:.08,jaw=i<60?.1:i<250?.56:.03,now=i*1000/fps;
      const a=actual.advance({smile,jaw},now),b=ref.update(smile,jaw,now);
      assert.equal(a.smile,b.smile);assert.equal(a.jaw,b.jaw);assert.equal(a.burst,b.shouldLaunchFirework);
      assert.equal(a.label,{neutral:'neutral',rain:'smile',fireworks:'laugh'}[b.state]);
    }
  }
});

test('Gemini automatic laughs launch one rocket; quick preview launches two and salvo launches three', () => {
  const context=recorder().ctx,canvas=()=>({width:1,height:1,getContext:()=>context});
  function create(){const e=new GeminiParticleEngine(canvas());e.resize(360,640);return e;}
  const automatic=create();automatic.preview=false;automatic.signal={smile:.78,jaw:.56};
  for(let i=0;i<10;i++)automatic.update(1/60,{x:180,y:330,rx:63,ry:81,angle:0},1000+i*1000/60);
  assert.equal(automatic.pool.slots.filter(p=>p.active&&p.type===3).length,1);
  const quick=create();quick.setManualMood('fireworks');assert.equal(quick.pool.slots.filter(p=>p.active&&p.type===3).length,2);
  const salvo=create();salvo.celebrate(null);assert.equal(salvo.pool.slots.filter(p=>p.active&&p.type===3).length,3);
});
