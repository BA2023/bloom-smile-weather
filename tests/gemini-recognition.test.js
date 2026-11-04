import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiRecognizer, GEMINI_CAMERA_CONSTRAINTS, GEMINI_INITIAL_SIGNAL, extractGeminiSignal } from '../src/gemini-recognition.js';
import { CameraTracker } from '../src/tracking.js?v=camera-brightness-70';

const face = values => ({ faceLandmarks:[Array.from({length:478},(_,i)=>({x:i/1000,y:i/2000}))],
  faceBlendshapes:[{categories:Object.entries(values).map(([categoryName,score])=>({categoryName,score}))}] });
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};

test('Gemini extraction uses the original two smiles, two squints, jaw and four head points',()=>{
  const signal=extractGeminiSignal(face({mouthSmileLeft:.4,mouthSmileRight:.6,cheekSquintLeft:.2,cheekSquintRight:.4,jawOpen:.3}));
  assert.equal(signal.smile,.5+(.2+.4)*.12);assert.equal(signal.jaw,.3);
  assert.deepEqual(signal.points,[10,152,234,454].map(i=>({x:i/1000,y:i/2000})));assert.equal(signal.facePresent,true);
  const capped=extractGeminiSignal(face({mouthSmileLeft:1,mouthSmileRight:1,cheekSquintLeft:1,cheekSquintRight:1,jawOpen:1.1}));
  assert.equal(capped.smile,1);assert.equal(capped.jaw,1);
});

test('Gemini keeps coefficients and last head on a missing face or missing blendshapes, exactly as reference',()=>{
  const initial=extractGeminiSignal({});assert.deepEqual(initial,GEMINI_INITIAL_SIGNAL);
  const previous=extractGeminiSignal(face({mouthSmileLeft:.6,mouthSmileRight:.8,jawOpen:.5}));
  const lost=extractGeminiSignal({},previous);
  assert.equal(lost.smile,previous.smile);assert.equal(lost.jaw,previous.jaw);assert.equal(lost.points,previous.points);assert.equal(lost.facePresent,false);
  const result=face({});delete result.faceBlendshapes;
  assert.equal(extractGeminiSignal(result,previous).smile,previous.smile);
});

test('Gemini prepares its isolated pinned SDK with original GPU options and shared original model',async()=>{
  let options,path;const model={close(){}};
  const recognizer=new GeminiRecognizer({},()=>{},async()=>({
    FilesetResolver:{forVisionTasks:async url=>{path=url;return 'gemini-fileset';}},
    FaceLandmarker:{createFromOptions:async(resolver,value)=>{assert.equal(resolver,'gemini-fileset');options=value;return model;}}
  }));
  await recognizer.prepare();
  assert.ok(path.endsWith('/vendor/gemini/wasm'));
  assert.deepEqual(options,{baseOptions:{modelAssetPath:new URL('../models/face_landmarker.task',import.meta.url).href.replace('/tests/','/'),delegate:'GPU'},outputFaceBlendshapes:true,runningMode:'VIDEO',numFaces:1});
  assert.deepEqual(GEMINI_CAMERA_CONSTRAINTS,{video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:30}},audio:false});
  recognizer.close();assert.equal(recognizer.tracker,null);
});

test('Gemini samples the full video directly every 45ms without Worker, resize or currentTime deduplication',()=>{
  const video={readyState:2,currentTime:1},calls=[],signals=[];
  const recognizer=new GeminiRecognizer(video,signal=>signals.push(signal));
  recognizer.tracker={detectForVideo:(source,time)=>{assert.equal(source,video);calls.push(time);return {};}};
  for(const now of [0,44,45,89,90,100,135])recognizer.sample(now);
  assert.deepEqual(calls,[45,90,135]);assert.equal(signals.length,3);
  assert.equal(recognizer.frames,3);assert.deepEqual(signals[0],GEMINI_INITIAL_SIGNAL);
  video.readyState=1;assert.equal(recognizer.sample(180),false);
});

test('cancelled Gemini preparation closes a late GPU model instead of reviving inference',async()=>{
  const creation=deferred();let closed=0;
  const recognizer=new GeminiRecognizer({},()=>assert.fail('cancelled signal'),async()=>({
    FilesetResolver:{forVisionTasks:async()=>({})},FaceLandmarker:{createFromOptions:()=>creation.promise}
  }));
  const job=recognizer.prepare();await flush();recognizer.close();creation.resolve({close:()=>closed++});await job;
  assert.equal(closed,1);assert.equal(recognizer.tracker,null);assert.equal(recognizer.sample(1000),false);
});

function cameraHarness() {
  const constraints=[],states=[];let requests=0,stopped=0;
  const track={applyConstraints:async value=>constraints.push(value),stop:()=>stopped++,addEventListener(){}};
  const stream={getVideoTracks:()=>[track],getTracks:()=>[track]};
  const video={readyState:2,currentTime:1,play:async()=>{},pause(){}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async value=>{requests++;constraints.push(value.video);return stream;}}}});
  globalThis.document={hidden:false};
  const tracker=new CameraTracker(video,()=>{},state=>states.push(state));
  const prepared=[],closed=[],samples=[];
  tracker.prepareBloom=async function(generation,revision){prepared.push(['bloom',generation,revision]);this.worker={terminate:()=>closed.push('bloom')};this.mode='CPU · Worker';};
  tracker.prepareGemini=async function(generation,revision){prepared.push(['gemini',generation,revision]);this.gemini={sample:now=>samples.push(now),close:()=>closed.push('gemini')};this.mode='GPU · Gemini';};
  return {tracker,video,stream,constraints,states,prepared,closed,samples,get requests(){return requests;},get stopped(){return stopped;}};
}

test('active mode switches keep camera settings stable and dispose the previous recognition backend',async()=>{
  const h=cameraHarness();await h.tracker.start();
  await h.tracker.setProfile('gemini');await h.tracker.sample(500);
  assert.equal(h.requests,1);assert.equal(h.stopped,0);assert.equal(h.video.srcObject,h.stream);
  assert.deepEqual(h.constraints,[{facingMode:'user',width:{ideal:960},height:{ideal:720}}]);assert.deepEqual(h.samples,[500]);
  await h.tracker.setProfile('bloom');assert.equal(h.requests,1);assert.equal(h.stopped,0);
  assert.equal(h.constraints.length,1);
  assert.deepEqual(h.closed,['bloom','gemini']);assert.equal(h.tracker.active,true);
  h.tracker.stop();assert.equal(h.stopped,1);
});

test('switching during permission wait prepares only the final selected profile',async()=>{
  const h=cameraHarness(),permission=deferred();
  navigator.mediaDevices.getUserMedia=()=>permission.promise;
  const job=h.tracker.start();await h.tracker.setProfile('gemini');permission.resolve(h.stream);await job;
  assert.deepEqual(h.prepared.map(row=>row[0]),['gemini']);assert.equal(h.tracker.active,true);h.tracker.stop();
});

test('switching during model initialization ignores obsolete completion and initializes the latest profile',async()=>{
  const h=cameraHarness(),loading=deferred();
  h.tracker.prepareBloom=async function(){await loading.promise;};
  const start=h.tracker.start();await flush();const change=h.tracker.setProfile('gemini');loading.resolve();
  await Promise.all([start,change]);assert.equal(h.tracker.mode,'GPU · Gemini');
  assert.equal(h.states.filter(state=>state==='ready').length,1);assert.equal(h.requests,1);h.tracker.stop();
});

test('inference counter increments only for completed valid frames and remains silent while hidden',async()=>{
  const h=cameraHarness();h.tracker.active=true;
  h.tracker.tracker={detectForVideo:()=>({}),close(){}};
  await h.tracker.sample(1000);assert.equal(h.tracker.frames,1);
  document.hidden=true;h.video.currentTime++;
  await h.tracker.sample(2000);assert.equal(h.tracker.frames,1);
  document.hidden=false;h.tracker.stop();
});
