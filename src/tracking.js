import { extractSignal, trackerOptions } from './tracking-shared.js?v=effect-modes-34';
import { GeminiRecognizer, GEMINI_CAMERA_CONSTRAINTS } from './gemini-recognition.js?v=gemini-recognition-36';

// Camera ownership is shared; the two recognition backends and their settings are independent.
export class CameraTracker {
  constructor(video, onSignal, onState) {
    this.video=video;this.onSignal=onSignal;this.onState=onState;
    this.generation=0;this.profileRevision=0;this.profile='bloom';this.active=false;this.busy=false;
    this.lastSample=-Infinity;this.mode='—';this.inferenceMs=0;this.frames=0;this.initialization=null;
  }
  async setProfile(profile) {
    if(!['bloom','gemini'].includes(profile)||profile===this.profile)return;
    this.profile=profile;this.profileRevision++;
    this.cancelInit?.();
    if(this.active&&this.stream) {
      this.active=false;this.busy=false;this.onState('loading');
      const generation=this.generation;
      try { await this.initializeForProfile(generation); }
      catch(error) {
        if(generation===this.generation){this.stop();this.onState('tracking-error');throw error;}
      }
    } else if(this.initialization) await this.initialization;
  }
  cameraConstraints() {
    return this.profile==='gemini'?GEMINI_CAMERA_CONSTRAINTS:
      {video:{facingMode:'user',width:{ideal:960},height:{ideal:720}},audio:false};
  }
  async start() {
    this.stop();const generation=this.generation;
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('请通过 HTTPS 或 localhost 打开，并使用支持摄像头的浏览器。');
    this.onState('starting');let waitingForStream=true,showedPermission=false;
    if(navigator.permissions?.query) {
      Promise.resolve().then(()=>navigator.permissions.query({name:'camera'})).then(permission=>{
        if(waitingForStream&&generation===this.generation&&permission.state==='prompt'){showedPermission=true;this.onState('permission');}
      }).catch(()=>{});
    }
    let stream;
    try { stream=await navigator.mediaDevices.getUserMedia(this.cameraConstraints()); }
    finally { waitingForStream=false; }
    if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
    if(showedPermission)this.onState('starting');
    this.stream=stream;this.video.srcObject=stream;await this.video.play();
    if(generation!==this.generation)return;
    stream.getVideoTracks()[0].addEventListener('ended',()=>{
      if(generation===this.generation){this.stop();this.onState('ended');}
    },{once:true});
    this.onState('loading');await this.initializeForProfile(generation);
  }
  initializeForProfile(generation) {
    if(this.initialization&&this.initGeneration===generation)return this.initialization;
    this.initGeneration=generation;
    const job=this.initializeLoop(generation);this.initialization=job;
    const clear=()=>{if(this.initialization===job)this.initialization=null;};job.then(clear,clear);
    return job;
  }
  async initializeLoop(generation) {
    while(generation===this.generation) {
      const revision=this.profileRevision,profile=this.profile;
      this.releaseRecognizer();
      try {
        // Keep the active capture settings stable across recognition profile
        // changes, avoiding device-specific exposure and resolution jumps.
        if(generation!==this.generation)return;
        if(revision!==this.profileRevision)continue;
        if(profile==='gemini')await this.prepareGemini(generation,revision);
        else await this.prepareBloom(generation,revision);
      } catch(error) {
        if(generation!==this.generation)return;
        if(revision!==this.profileRevision)continue;
        throw error;
      }
      if(generation!==this.generation)return;
      if(revision!==this.profileRevision)continue;
      this.active=true;this.lastSample=-Infinity;this.lastVideoTime=-1;
      this.onState('ready');return;
    }
  }
  async prepareGemini(generation,revision) {
    const recognizer=new GeminiRecognizer(this.video,signal=>{
      if(generation===this.generation&&revision===this.profileRevision){this.frames++;this.onSignal(signal);}
    });
    this.gemini=recognizer;await recognizer.prepare();
    if(generation!==this.generation||revision!==this.profileRevision){recognizer.close();return;}
    this.mode='GPU · Gemini';
  }
  async prepareBloom(generation,revision) {
    try { await this.prepareWorker(generation,revision); }
    catch(workerError) {
      if(generation!==this.generation||revision!==this.profileRevision)throw workerError;
      this.worker?.terminate();this.worker=null;
      console.info('Worker unavailable; using throttled main-thread tracker.',workerError.message);
      const {FaceLandmarker,FilesetResolver}=await import('../vendor/vision_bundle.mjs');
      const vision=await FilesetResolver.forVisionTasks(new URL('../vendor/wasm',import.meta.url).href);
      if(generation!==this.generation||revision!==this.profileRevision)return;
      const tracker=await FaceLandmarker.createFromOptions(vision,trackerOptions(new URL('../models/face_landmarker.task',import.meta.url).href));
      if(generation!==this.generation||revision!==this.profileRevision){tracker.close();return;}
      this.tracker=tracker;this.mode='CPU · 低频回退';
    }
  }
  prepareWorker(generation,revision=this.profileRevision) {
    return new Promise((resolve,reject)=>{
      if(!window.Worker||!window.createImageBitmap)return reject(new Error('Worker / ImageBitmap unsupported'));
      const worker=new Worker(new URL('./tracking-worker.js?v=effect-modes-34',import.meta.url));this.worker=worker;
      const timer=setTimeout(()=>reject(new Error('Worker initialization timed out')),18000);
      this.cancelInit=()=>{clearTimeout(timer);reject(new Error('Cancelled'));};
      worker.onerror=event=>{
        clearTimeout(timer);
        if(generation!==this.generation||revision!==this.profileRevision)return;
        if(this.active){this.stop();this.onState('tracking-error');}else reject(new Error(event.message||'Worker failed'));
      };
      worker.onmessage=({data})=>{
        if(generation!==this.generation||revision!==this.profileRevision)return;
        if(data.type==='ready'){clearTimeout(timer);this.cancelInit=null;this.mode='CPU · Worker';resolve();}
        else if(data.type==='result'){this.busy=false;this.inferenceMs=data.duration;this.frames++;this.onSignal(data.signal);}
        else if(data.type==='error'){
          clearTimeout(timer);
          if(!this.active)reject(new Error(data.message));else{this.stop();this.onState('tracking-error');}
        }
      };
      worker.postMessage({type:'init'});
    });
  }
  async sample(now) {
    if(!this.active||document.hidden||this.video.readyState<2)return;
    const generation=this.generation,revision=this.profileRevision;
    try {
      if(this.profile==='gemini') {
        this.gemini?.sample(now);this.inferenceMs=this.gemini?.inferenceMs||0;return;
      }
      if(this.busy||now-this.lastSample<(this.worker?75:130)||this.video.currentTime===this.lastVideoTime)return;
      this.lastSample=now;this.lastVideoTime=this.video.currentTime;this.busy=true;
      if(this.worker) {
        const width=Math.min(512,this.video.videoWidth);
        const frame=await createImageBitmap(this.video,{resizeWidth:width,resizeHeight:Math.round(width*this.video.videoHeight/this.video.videoWidth)});
        if(generation!==this.generation||revision!==this.profileRevision||!this.worker){frame.close();return;}
        this.worker.postMessage({type:'frame',frame,timestamp:now},[frame]);
      } else {
        const start=performance.now();const result=this.tracker.detectForVideo(this.video,now);
        this.inferenceMs=performance.now()-start;this.frames++;this.onSignal(extractSignal(result));this.busy=false;
      }
    } catch(error) {
      if(generation===this.generation&&revision===this.profileRevision){this.stop();this.onState('tracking-error');console.error(error);}
    }
  }
  releaseRecognizer() {
    const cancel=this.cancelInit;this.cancelInit=null;cancel?.();
    this.worker?.terminate();this.worker=null;this.tracker?.close();this.tracker=null;
    this.gemini?.close();this.gemini=null;this.busy=false;
  }
  stop() {
    this.generation++;this.active=false;this.releaseRecognizer();this.initialization=null;
    this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
    this.video.pause();this.video.srcObject=null;this.mode='—';
  }
}
