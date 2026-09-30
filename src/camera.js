export function cameraErrorMessage(error) {
  const messages = {
    NotAllowedError: '摄像头权限未开启。请在浏览器地址栏允许摄像头，再点击重试。',
    NotFoundError: '没有找到摄像头。连接摄像头后重试，或先用鼠标体验。',
    NotReadableError: '摄像头可能正被其他应用占用。关闭占用它的应用后重试。',
    OverconstrainedError: '当前摄像头不支持请求的画面格式，请更换设备后重试。',
    SecurityError: '浏览器阻止了摄像头访问。请通过 localhost 或 HTTPS 打开。',
  };
  return messages[error?.name] || error?.message || '摄像头启动失败，请重试。';
}

export class CameraSession {
  constructor(video, mediaDevices = globalThis.navigator?.mediaDevices) {
    this.video = video;
    this.mediaDevices = mediaDevices;
    this.generation = 0;
    this.stream = null;
  }
  async start() {
    this.stop();
    const generation = this.generation;
    if (!this.mediaDevices?.getUserMedia) throw new Error('浏览器不支持摄像头访问，请用 Chrome / Edge 打开本地地址。');
    const stream = await this.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false,
    });
    if (generation !== this.generation) {
      stream.getTracks().forEach(track => track.stop());
      return false;
    }
    this.stream = stream;
    this.video.srcObject = stream;
    try {
      await this.video.play();
    } catch (error) {
      if (generation === this.generation) this.stop();
      throw error;
    }
    return generation === this.generation;
  }
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
  }
}

export class FrameWatchdog {
  constructor() { this.reset(); }
  reset() { this.lastTime = null; this.lastChange = null; }
  check(now, videoTime, ready) {
    if (this.lastChange === null || (ready && videoTime !== this.lastTime)) {
      this.lastTime = videoTime;
      this.lastChange = now;
    }
    return now - this.lastChange > 1500;
  }
}

export class HandTracker {
  constructor(video, { onResults, onError, onReady, onStatus }) {
    this.video = video;
    this.callbacks = { onResults, onError, onReady, onStatus };
    this.camera = new CameraSession(video);
    this.worker = null;
    this.generation = 0;
    this.raf = 0;
    this.busy = false;
    this.lastFrame = -1;
    this.watchdog = new FrameWatchdog();
  }
  async start() {
    this.stop();
    const generation = this.generation;
    try {
      this.callbacks.onStatus('等待摄像头权限…');
      if (!await this.camera.start() || generation !== this.generation) return;
      this.callbacks.onStatus('加载本地手部模型…');
      for (const track of this.camera.stream.getTracks()) track.addEventListener('ended', () => {
        if (generation === this.generation) this.fail(new Error('摄像头连接已中断。请检查设备后重新开启。'));
      });
      const worker = new Worker(new URL('hand-worker.js', new URL(import.meta.env.BASE_URL, location.href)));
      this.worker = worker;
      this.initTimeout = setTimeout(() => {
        if (generation === this.generation) this.fail(new Error('模型加载超时。请确认已运行 npm run setup，然后重试。'));
      }, 45000);
      worker.onerror = () => {
        if (generation === this.generation) this.fail(new Error('手部检测进程启动失败。请运行 npm run setup，并使用新版 Chrome / Edge。'));
      };
      worker.onmessage = ({ data }) => {
        if (generation !== this.generation) return;
        if (data.type === 'ready') {
          clearTimeout(this.initTimeout);
          this.callbacks.onReady();
          this.loop(generation);
        } else if (data.type === 'result') {
          clearTimeout(this.frameTimeout);
          this.busy = false;
          this.callbacks.onResults(data);
        } else if (data.type === 'error') this.fail(new Error(data.message));
      };
      worker.postMessage({ type: 'init', base: new URL(import.meta.env.BASE_URL, location.href).href });
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    }
  }
  loop(generation) {
    if (generation !== this.generation) return;
    this.raf = requestAnimationFrame(() => this.loop(generation));
    if (this.watchdog.check(performance.now(), this.video.currentTime, this.video.readyState >= 2)) {
      this.fail(new Error('摄像头超过 1.5 秒未提供新画面，已暂停绘制。请重新开启摄像头。'));
      return;
    }
    if (this.busy || this.video.readyState < 2 || this.video.currentTime === this.lastFrame) return;
    this.busy = true;
    this.lastFrame = this.video.currentTime;
    const time = performance.now();
    createImageBitmap(this.video).then(bitmap => {
      if (generation !== this.generation) { bitmap.close(); return; }
      this.frameTimeout = setTimeout(() => {
        if (generation === this.generation) this.fail(new Error('手部检测停止响应，请重新开启摄像头。'));
      }, 15000);
      this.worker.postMessage({ type: 'frame', bitmap, time }, [bitmap]);
    }).catch(error => {
      if (generation === this.generation) this.fail(error);
    });
  }
  fail(error) {
    this.stop();
    this.callbacks.onError(cameraErrorMessage(error));
  }
  stop() {
    this.generation++;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.initTimeout);
    clearTimeout(this.frameTimeout);
    this.worker?.terminate();
    this.worker = null;
    this.camera.stop();
    this.busy = false;
    this.lastFrame = -1;
    this.watchdog.reset();
  }
}
