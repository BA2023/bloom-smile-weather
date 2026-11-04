import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeTelemetry, expressionTelemetry, liveCapsuleState } from '../src/telemetry.js';

test('telemetry averages actual JS cost, preserves slow frames, and adds no placeholder history', () => {
  const t = new RuntimeTelemetry(), camera = { active:false, frames:0 };
  assert.equal(t.read(0,camera).frameCost,null); assert.equal(t.history.length,0);
  t.record(2); t.record(22); t.record(NaN); t.record(-1);
  assert.equal(t.read(250,camera).frameCost,12);
  t.record(400); assert.equal(t.read(500,camera).frameCost,400);
  assert.deepEqual(t.history,[12,400]);
  assert.equal(t.read(750,camera).points.split(' ').length,2);
});

test('inference frequency counts completed work over measured time, without a fake preview rate or FPS clamp', () => {
  const t=new RuntimeTelemetry(),camera={active:false,frames:0};
  assert.equal(t.read(0,camera).inferenceHz,null);
  camera.active=true;t.read(100,camera);camera.frames=3;
  assert.equal(t.read(1100,camera).inferenceHz,3);
  camera.frames=83;assert.equal(t.read(2100,camera).inferenceHz,80);
  camera.active=false;assert.equal(t.read(2200,camera).inferenceHz,null);
  camera.active=true;t.read(2300,camera);camera.frames=0;
  assert.equal(t.read(2400,camera).inferenceHz,null);
});

test('telemetry history stays bounded and resets on source/visibility changes', () => {
  const t=new RuntimeTelemetry();
  for(let i=0;i<100;i++){t.record(i);t.read(i*250,{active:false,frames:0});}
  assert.equal(t.history.length,48);assert.equal(t.history[0],52);
  assert.ok(t.read(25100,{active:false,frames:0}).points.split(' ').every(p=>p.split(',').every(v=>Number.isFinite(Number(v)))));
  t.reset();assert.equal(t.history.length,0);assert.equal(t.frameCost,null);
});

const base={style:'bloom',mode:'preview',pending:false,manual:null,scripted:false,facePresent:null,stale:false,expression:{smile:.8,jaw:.5,label:'laugh'}};

test('expression meters distinguish model signals, held Gemini input and scripted/manual signals', () => {
  assert.equal(expressionTelemetry(base).smile,null);
  assert.equal(expressionTelemetry({...base,style:'gemini',scripted:true}).source,'脚本信号');
  assert.equal(expressionTelemetry({...base,style:'gemini',mode:'camera',facePresent:false}).source,'沿用上次信号');
  assert.equal(expressionTelemetry({...base,style:'gemini',mode:'camera',facePresent:null}).source,'预设初值');
  assert.equal(expressionTelemetry({...base,style:'gemini',mode:'camera',manual:'rain',facePresent:true}).source,'预演信号');
  const live=expressionTelemetry({...base,mode:'camera',facePresent:true});
  assert.equal(live.source,'实时信号');assert.equal(live.smile,.8);assert.equal(live.label,'laugh');
  assert.equal(expressionTelemetry({...base,mode:'camera',facePresent:true,stale:true}).smile,null);
  assert.equal(expressionTelemetry({...base,style:'gemini',pending:true}).smile,null);
  assert.equal(expressionTelemetry({...base,style:'gemini',closed:true}).smile,null);
  assert.equal(expressionTelemetry({...base,style:'gemini',closed:true}).source,'已离开');
});

test('entry markers follow each engine sensitivity', () => {
  assert.deepEqual(expressionTelemetry({...base,style:'gemini',sensitivity:1.25}).gates,[.32/1.25,.52/1.25,.30/1.25]);
  assert.deepEqual(expressionTelemetry({...base,sensitivity:1.25}).gates,[.43/1.25,.58/1.25,.20/1.25]);
});

test('GPT previews identify the displayed source without inventing measurements or showing unrelated live values', () => {
  const simulated = 'smile';
  const manual = expressionTelemetry({ ...base, mode: 'camera', facePresent: true, manual: 'rain', simulated });
  assert.equal(manual.source, '预演信号'); assert.equal(manual.smile, null); assert.equal(manual.label, 'smile');
  const scripted = expressionTelemetry({ ...base, scripted: true, simulated });
  assert.equal(scripted.source, '脚本信号'); assert.equal(scripted.jaw, null); assert.equal(scripted.label, 'smile');
  assert.equal(expressionTelemetry({ ...base, simulated }).source, '预演信号');
  assert.equal(expressionTelemetry({ ...base, mode: 'camera', facePresent: true }).source, '实时信号');
  assert.equal(expressionTelemetry({ ...base, pending: true, simulated }).smile, null);
  assert.equal(expressionTelemetry({ ...base, closed: true, simulated }).smile, null);
});

test('stage capsule separates real expression, active effects and camera/AI/manual sources', () => {
  const live = { mode:'camera',style:'bloom',pending:false,closed:false,manual:null,scripted:false,label:'neutral',effect:'neutral',facePresent:true,stale:false,waiting:false };
  assert.deepEqual(liveCapsuleState(live),{source:'镜头',expression:'平静',effect:'等待微笑',tone:'neutral'});
  assert.equal(liveCapsuleState({...live,label:'smile',effect:'rain'}).expression,'微笑');
  assert.equal(liveCapsuleState({...live,label:'laugh',effect:'fireworks'}).effect,'烟花绽放');
  assert.equal(liveCapsuleState({...live,mode:'preview',scripted:true}).source,'AI演示');
  assert.equal(liveCapsuleState({...live,manual:'rain',label:'smile',effect:'rain'}).source,'预演');
  assert.equal(liveCapsuleState({...live,pending:true,startupState:'permission'}).effect,'等待授权');
  assert.equal(liveCapsuleState({...live,facePresent:false}).effect,'请正对镜头');
  assert.equal(liveCapsuleState({...live,style:'gemini',facePresent:false}).effect,'保留上次效果');
  assert.equal(liveCapsuleState({...live,style:'gemini',waiting:true,facePresent:null}).expression,'等待识别');
  assert.equal(liveCapsuleState({...live,closed:true}).expression,'互动结束');
});
