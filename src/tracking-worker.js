let tracker;
let extractSignal;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const [{ FaceLandmarker, FilesetResolver }, shared] = await Promise.all([
        import('../vendor/vision_bundle.mjs'), import('./tracking-shared.js?v=effect-modes-34')
      ]);
      extractSignal = shared.extractSignal;
      const vision = await FilesetResolver.forVisionTasks(new URL('../vendor/wasm', self.location.href).href);
      tracker = await FaceLandmarker.createFromOptions(vision, shared.trackerOptions(new URL('../models/face_landmarker.task', self.location.href).href));
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message || error) }); }
  } else if (data.type === 'frame') {
    try {
      const start = performance.now();
      const signal = extractSignal(tracker.detectForVideo(data.frame, data.timestamp));
      self.postMessage({ type: 'result', signal, duration: performance.now() - start });
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message || error) }); }
    finally { data.frame.close(); }
  }
};
