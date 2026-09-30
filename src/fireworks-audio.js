const defaultContextFactory = () => {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  return Context ? new Context() : null;
};

const disconnect = node => { try { node?.disconnect(); } catch { /* Already detached. */ } };
const MAX_SOUNDS = 12;
const BURST_DURATIONS = { chrysanthemum: 1.7, heart: 1.4, willow: 2.4 };

export class FireworksAudio {
  #context;
  #master;
  #compressor;
  #failed = false;
  #disposed = false;
  #lastStatus = 'locked';
  #sounds = new Set();
  #noiseBuffers = new Map();

  constructor({ contextFactory, onStateChange } = {}) {
    this.enabled = true;
    this.volume = 0.35;
    this.contextFactory = contextFactory || defaultContextFactory;
    this.onStateChange = onStateChange;
  }

  get status() {
    if (this.#failed || this.#disposed || this.#context?.state === 'closed') return 'unavailable';
    if (!this.enabled || this.volume === 0) return 'muted';
    return this.#context?.state === 'running' ? 'ready' : 'locked';
  }

  // Call only from a click/touch/key handler; play() never resumes a device.
  async unlock() {
    if (this.#disposed || this.#failed) return false;
    if (!this.#context) {
      try {
        this.#context = this.contextFactory();
        if (!this.#context) throw new Error('Web Audio unavailable');
        this.#master = this.#context.createGain();
        this.#compressor = this.#context.createDynamicsCompressor();
        this.#compressor.threshold.value = -18;
        this.#compressor.knee.value = 16;
        this.#compressor.ratio.value = 8;
        this.#compressor.attack.value = 0.003;
        this.#compressor.release.value = 0.18;
        this.#master.connect(this.#compressor);
        this.#compressor.connect(this.#context.destination);
        this.#context.onstatechange = () => this.#notify();
        this.#updateGain();
      } catch {
        this.#failed = true;
        disconnect(this.#master);
        disconnect(this.#compressor);
        try { await this.#context?.close(); } catch { /* Device already lost. */ }
        this.#notify();
        return false;
      }
    }
    try {
      if (this.#context.state !== 'running') await this.#context.resume();
    } catch {
      // Autoplay denial may recover on a later user gesture.
    }
    this.#notify();
    return !this.#disposed && this.#context.state === 'running';
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.stop();
    this.#updateGain();
    this.#notify();
  }

  setVolume(volume) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.volume === 0) this.stop();
    this.#updateGain();
    this.#notify();
  }

  #updateGain() {
    if (!this.#master) return;
    const now = this.#context.currentTime;
    this.#master.gain.cancelScheduledValues(now);
    this.#master.gain.setValueAtTime(this.enabled ? this.volume * 0.7 : 0, now);
  }

  #notify() {
    const status = this.status;
    if (status === this.#lastStatus) return;
    this.#lastStatus = status;
    try { this.onStateChange?.(status); } catch { /* UI observers cannot interrupt audio cleanup. */ }
  }

  play(event) {
    if (this.status !== 'ready' || !event || !['launch', 'burst'].includes(event.type)) return false;
    if (this.#sounds.size >= MAX_SOUNDS) return false;
    const sound = { nodes: new Set(), sources: new Set() };
    this.#sounds.add(sound);
    try {
      const context = this.#context;
      const now = context.currentTime;
      const launch = event.type === 'launch';
      const kind = Object.hasOwn(BURST_DURATIONS, event.kind) ? event.kind : 'chrysanthemum';
      const duration = launch ? 0.8 : BURST_DURATIONS[kind];
      let output = this.#master;
      if (context.createStereoPanner) {
        const panner = this.#track(sound, context.createStereoPanner());
        const x = Number.isFinite(event.x) ? Math.max(0, Math.min(1, event.x)) : 0.5;
        panner.pan.setValueAtTime((x * 2 - 1) * 0.75, now);
        panner.connect(output);
        output = panner;
      }

      const tone = this.#track(sound, context.createOscillator(), true);
      tone.type = 'sine';
      tone.frequency.setValueAtTime(launch ? 520 : kind === 'heart' ? 145 : 118, now);
      tone.frequency.exponentialRampToValueAtTime(launch ? 2000 : 38, now + (launch ? 0.7 : 0.26));
      const toneDuration = launch ? 0.78 : 0.36;
      const toneGain = this.#envelope(sound, launch ? 0.026 : 0.3, launch ? 0.09 : 0.006, toneDuration);
      tone.connect(toneGain);
      toneGain.connect(output);

      const noise = this.#track(sound, context.createBufferSource(), true);
      noise.buffer = this.#noiseBuffer(launch ? 'launch' : kind, duration, !launch);
      const filter = this.#track(sound, context.createBiquadFilter());
      filter.type = launch ? 'bandpass' : 'lowpass';
      filter.Q.value = launch ? 0.7 : 0.5;
      filter.frequency.setValueAtTime(launch ? 600 : 4600, now);
      filter.frequency.exponentialRampToValueAtTime(launch ? 2400 : 750, now + duration * 0.85);
      const noiseGain = this.#envelope(sound, launch ? 0.1 : 0.35, launch ? 0.12 : 0.007, duration);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(output);

      tone.start(now);
      tone.stop(now + toneDuration);
      noise.start(now);
      noise.stop(now + duration);
      return true;
    } catch {
      this.#failed = true;
      this.stop();
      this.#notify();
      return false;
    }
  }

  #track(sound, node, source = false) {
    sound.nodes.add(node);
    if (source) {
      sound.sources.add(node);
      node.onended = () => {
        disconnect(node);
        sound.sources.delete(node);
        if (sound.sources.size === 0) this.#release(sound);
      };
    }
    return node;
  }

  #envelope(sound, peak, attack, duration) {
    const gain = this.#track(sound, this.#context.createGain());
    const now = this.#context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration - 0.02);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    return gain;
  }

  #noiseBuffer(key, duration, crackling) {
    if (this.#noiseBuffers.has(key)) return this.#noiseBuffers.get(key);
    const rate = this.#context.sampleRate;
    const buffer = this.#context.createBuffer(1, Math.ceil(rate * duration), rate);
    const samples = buffer.getChannelData(0);
    let seed = 0x6d2b79f5;
    let crackle = 0;
    const decay = Math.exp(-1 / (rate * 0.009));
    for (let index = 0; index < samples.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const random = seed / 4294967296;
      if (random > 1 - 65 / rate) crackle = 0.4 + random * 0.45;
      crackle *= decay;
      samples[index] = (random * 2 - 1) * (crackling ? 0.15 + crackle : 0.7);
    }
    this.#noiseBuffers.set(key, buffer);
    return buffer;
  }

  #release(sound, stop = false) {
    for (const source of sound.sources) {
      source.onended = null;
      if (stop) { try { source.stop(); } catch { /* Unstarted or already ended source. */ } }
    }
    for (const node of sound.nodes) disconnect(node);
    sound.sources.clear();
    sound.nodes.clear();
    this.#sounds.delete(sound);
  }

  stop() {
    for (const sound of this.#sounds) this.#release(sound, true);
  }

  async dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.stop();
    disconnect(this.#master);
    disconnect(this.#compressor);
    this.#noiseBuffers.clear();
    if (this.#context) {
      this.#context.onstatechange = null;
      try { await this.#context.close(); } catch { /* Device may already be closed. */ }
    }
    this.#notify();
  }
}
