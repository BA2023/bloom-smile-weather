// Recognition pipeline from the user-supplied Gemini prototype: SDK 0.10.14, GPU, 45 ms.
export const GEMINI_CAMERA_CONSTRAINTS = { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false };
export const GEMINI_INITIAL_SIGNAL = { smile: .78, jaw: .56, points: null, facePresent: false };
export const geminiTrackerOptions = model => ({ baseOptions: { modelAssetPath: model, delegate: 'GPU' }, outputFaceBlendshapes: true, runningMode: 'VIDEO', numFaces: 1 });

export function extractGeminiSignal(result, previous = GEMINI_INITIAL_SIGNAL) {
  const landmarks = result.faceLandmarks?.[0];
  // The reference holds the last raw expression and head when no new face is returned.
  const signal = { ...previous, facePresent: Boolean(landmarks) };
  if (!landmarks) return signal;
  signal.points = [10,152,234,454].map(i => ({ x: landmarks[i].x, y: landmarks[i].y }));
  const categories = result.faceBlendshapes?.[0]?.categories;
  if (categories) {
    let smileL=0,smileR=0,jawOpen=0,cheekSquintL=0,cheekSquintR=0;
    for (const category of categories) {
      const name=category.categoryName;
      if(name==='mouthSmileLeft')smileL=category.score;
      else if(name==='mouthSmileRight')smileR=category.score;
      else if(name==='jawOpen')jawOpen=category.score;
      else if(name==='cheekSquintLeft')cheekSquintL=category.score;
      else if(name==='cheekSquintRight')cheekSquintR=category.score;
    }
    const squintBoost=(cheekSquintL+cheekSquintR)*.12;
    signal.smile=Math.min(1,(smileL+smileR)*.5+squintBoost);
    signal.jaw=Math.min(1,jawOpen);
  }
  return signal;
}

export class GeminiRecognizer {
  constructor(video, onSignal, loadVision = () => import('../vendor/gemini/vision_bundle.mjs')) {
    this.video=video;this.onSignal=onSignal;this.loadVision=loadVision;
    this.tracker=null;this.generation=0;this.lastCvTimestamp=0;this.inferenceMs=0;this.frames=0;
    this.signal={...GEMINI_INITIAL_SIGNAL};
  }
  async prepare() {
    const generation=++this.generation;
    const {FaceLandmarker,FilesetResolver}=await this.loadVision();
    if(generation!==this.generation)return;
    const resolver=await FilesetResolver.forVisionTasks(new URL('../vendor/gemini/wasm',import.meta.url).href);
    if(generation!==this.generation)return;
    const tracker=await FaceLandmarker.createFromOptions(resolver,geminiTrackerOptions(new URL('../models/face_landmarker.task',import.meta.url).href));
    if(generation!==this.generation){tracker.close();return;}
    this.tracker=tracker;
  }
  sample(nowMs) {
    if(!this.tracker||this.video.readyState<2||nowMs-this.lastCvTimestamp<45)return false;
    this.lastCvTimestamp=nowMs;
    const start=performance.now();
    const result=this.tracker.detectForVideo(this.video,nowMs);
    this.inferenceMs=performance.now()-start;this.frames++;
    this.signal=extractGeminiSignal(result,this.signal);this.onSignal(this.signal);
    return true;
  }
  close() { this.generation++;this.tracker?.close();this.tracker=null; }
}
