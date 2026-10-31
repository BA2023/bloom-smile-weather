import { extractSignal, trackerOptions } from './tracking-shared.js';

export class CameraTracker {
  constructor(video, onSignal, onState) {
    this.video = video; this.onSignal = onSignal; this.onState = onState;
    this.generation = 0; this.active = false; this.busy = false; this.lastSample = -Infinity;
    this.mode = '—'; this.inferenceMs = 0;
  }
  async start() {
    this.stop();
    const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('请通过 HTTPS 或 localhost 打开，并使用支持摄像头的浏览器。');
    this.onState('permission');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
    if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream; this.video.srcObject = stream;
    await this.video.play();
    if (generation !== this.generation) return;
    this.onState('loading');
    try {
      await this.prepareWorker(generation);
    } catch (workerError) {
      if (generation !== this.generation) return;
      this.worker?.terminate(); this.worker = null;
      console.info('Worker unavailable; using throttled main-thread tracker.', workerError.message);
      const { FaceLandmarker, FilesetResolver } = await import('../vendor/vision_bundle.mjs');
      const vision = await FilesetResolver.forVisionTasks(new URL('../vendor/wasm', import.meta.url).href);
      if (generation !== this.generation) return;
      const tracker = await FaceLandmarker.createFromOptions(vision, trackerOptions(new URL('../models/face_landmarker.task', import.meta.url).href));
      if (generation !== this.generation) { tracker.close(); return; }
      this.tracker = tracker; this.mode = 'CPU · 低频回退';
    }
    if (generation !== this.generation) return;
    this.active = true; this.lastSample = -Infinity; this.lastVideoTime = -1;
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (this.active) { this.stop(); this.onState('ended'); } }, { once: true });
    this.onState('ready');
  }
  prepareWorker(generation) {
    return new Promise((resolve, reject) => {
      if (!window.Worker || !window.createImageBitmap) return reject(new Error('Worker / ImageBitmap unsupported'));
      // MediaPipe's pinned WASM loader uses importScripts; it needs a classic worker.
      const worker = new Worker(new URL('./tracking-worker.js', import.meta.url));
      this.worker = worker;
      const timer = setTimeout(() => reject(new Error('Worker initialization timed out')), 18000);
      this.cancelInit = () => { clearTimeout(timer); reject(new Error('Cancelled')); };
      worker.onerror = e => {
        clearTimeout(timer);
        if (generation !== this.generation) return;
        if (this.active) { this.stop(); this.onState('tracking-error'); }
        else reject(new Error(e.message || 'Worker failed'));
      };
      worker.onmessage = ({ data }) => {
        if (generation !== this.generation) return;
        if (data.type === 'ready') { clearTimeout(timer); this.cancelInit = null; this.mode = 'CPU · Worker'; resolve(); }
        else if (data.type === 'result') { this.busy = false; this.inferenceMs = data.duration; this.onSignal(data.signal); }
        else if (data.type === 'error') {
          clearTimeout(timer);
          if (!this.active) reject(new Error(data.message));
          else { this.stop(); this.onState('tracking-error'); }
        }
      };
      worker.postMessage({ type: 'init' });
    });
  }
  async sample(now) {
    if (!this.active || this.busy || document.hidden || this.video.readyState < 2 || now - this.lastSample < (this.worker ? 75 : 130) || this.video.currentTime === this.lastVideoTime) return;
    this.lastSample = now; this.lastVideoTime = this.video.currentTime; this.busy = true;
    const generation = this.generation;
    try {
      if (this.worker) {
        const width = Math.min(512, this.video.videoWidth);
        const frame = await createImageBitmap(this.video, { resizeWidth: width, resizeHeight: Math.round(width * this.video.videoHeight / this.video.videoWidth) });
        if (generation !== this.generation || !this.worker) { frame.close(); return; }
        this.worker.postMessage({ type: 'frame', frame, timestamp: now }, [frame]);
      } else {
        const start = performance.now();
        const result = this.tracker.detectForVideo(this.video, now);
        this.inferenceMs = performance.now() - start;
        this.onSignal(extractSignal(result)); this.busy = false;
      }
    } catch (error) {
      if (generation === this.generation) { this.stop(); this.onState('tracking-error'); console.error(error); }
    }
  }
  stop() {
    this.generation++; this.active = false; this.busy = false;
    this.cancelInit?.(); this.cancelInit = null;
    this.worker?.terminate(); this.worker = null;
    this.tracker?.close(); this.tracker = null;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.video.pause(); this.video.srcObject = null; this.mode = '—';
  }
}
