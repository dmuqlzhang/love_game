// Classic worker: MediaPipe 0.10.x WASM loader requires importScripts.
let detector;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      self.exports = {};
      importScripts(new URL('vendor/mediapipe/vision_bundle.js', data.base).href);
      const { HandLandmarker, FilesetResolver } = self.exports;
      const files = await FilesetResolver.forVisionTasks(new URL('vendor/mediapipe/wasm', data.base).href);
      detector = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('models/hand_landmarker.task', data.base).href, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6,
      });
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      const start = performance.now();
      try {
        const result = detector.detectForVideo(data.bitmap, data.time);
        self.postMessage({ type: 'result', landmarks: result.landmarks[0] || null,
          time: data.time, inferenceMs: performance.now() - start });
      } finally { data.bitmap.close(); }
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: `手部模型运行失败：${error.message}。请确认已运行 npm run setup。` });
  }
};
