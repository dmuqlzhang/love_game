import test from 'node:test';
import assert from 'node:assert/strict';
import { FireworksAudio } from '../src/fireworks-audio.js';

// Node has no Web Audio device. This graph double records the browser-bound
// scheduling and resource operations while the controller itself stays real.
const parameter = (value = 0) => ({
  value, events: [],
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); },
  exponentialRampToValueAtTime(value, time) { this.events.push(['exponential', value, time]); },
  linearRampToValueAtTime(value, time) { this.events.push(['linear', value, time]); },
  setTargetAtTime(value, time, constant) { this.value = value; this.events.push(['target', value, time, constant]); },
  cancelScheduledValues(time) { this.events.push(['cancel', time]); },
});

function fakeContext({ stereo = true } = {}) {
  const context = {
    state: 'suspended', currentTime: 10, sampleRate: 8000, nodes: [], sources: [], resumes: 0, closes: 0,
    destination: {},
    async resume() { this.resumes++; this.state = 'running'; this.onstatechange?.(); },
    async close() { this.closes++; this.state = 'closed'; this.onstatechange?.(); },
    createBuffer(channels, length, sampleRate) {
      const data = new Float32Array(length);
      return { numberOfChannels: channels, length, sampleRate, getChannelData: () => data };
    },
  };
  function node(type) {
    const result = { type, connected: [], disconnected: false,
      connect(destination) { this.connected.push(destination); return destination; },
      disconnect() { this.disconnected = true; this.connected = []; },
    };
    context.nodes.push(result);
    return result;
  }
  function source(type) {
    const result = Object.assign(node(type), {
      starts: [], stops: [],
      start(time = 0) { this.starts.push(time); },
      stop(time = 0) { this.stops.push(time); },
      finish() { this.onended?.(); },
    });
    context.sources.push(result);
    return result;
  }
  context.createGain = () => Object.assign(node('gain'), { gain: parameter(1) });
  context.createDynamicsCompressor = () => Object.assign(node('compressor'), Object.fromEntries(
    ['threshold', 'knee', 'ratio', 'attack', 'release'].map(name => [name, parameter()]),
  ));
  context.createOscillator = () => Object.assign(source('oscillator'), { frequency: parameter(440) });
  context.createBufferSource = () => Object.assign(source('buffer'), { playbackRate: parameter(1) });
  context.createBiquadFilter = () => Object.assign(node('filter'), { frequency: parameter(350), Q: parameter(1) });
  if (stereo) context.createStereoPanner = () => Object.assign(node('panner'), { pan: parameter() });
  return context;
}

test('audio exports a controller without touching browser APIs at import time', async () => {
  const module = await import('../src/fireworks-audio.js').catch(() => ({}));
  assert.equal(typeof module.FireworksAudio, 'function');
  let created = 0;
  const audio = new module.FireworksAudio({ contextFactory: () => { created++; } });
  assert.equal(created, 0);
  assert.equal(audio.enabled, true);
  assert.equal(audio.volume, 0.35);
  assert.equal(audio.status, 'locked');
});

test('unlock creates one context on demand and reports ready after resume', async () => {
  const context = fakeContext();
  const states = [];
  let created = 0;
  const audio = new FireworksAudio({ contextFactory: () => { created++; return context; }, onStateChange: state => states.push(state) });
  assert.equal(await audio.unlock(), true);
  assert.equal(await audio.unlock(), true);
  assert.equal(created, 1);
  assert.equal(context.resumes, 1);
  assert.equal(audio.status, 'ready');
  assert.ok(states.includes('ready'));
  assert.equal(context.sources.length, 0, 'unlock must not emit sound');
});

test('a resume rejection stays locked and can recover on the next user gesture', async () => {
  const context = fakeContext();
  context.resume = async () => { throw new Error('gesture needed'); };
  const audio = new FireworksAudio({ contextFactory: () => context });
  assert.equal(await audio.unlock(), false);
  assert.equal(audio.status, 'locked');
  context.resume = async () => { context.state = 'running'; };
  assert.equal(await audio.unlock(), true);
  assert.equal(audio.status, 'ready');
});

test('unsupported contexts and context creation failures are harmless', async () => {
  for (const contextFactory of [() => null, () => { throw new Error('no device'); }]) {
    const audio = new FireworksAudio({ contextFactory });
    assert.equal(await audio.unlock(), false);
    assert.equal(audio.status, 'unavailable');
    assert.equal(audio.play({ type: 'burst' }), false);
    assert.doesNotThrow(() => audio.stop());
    await audio.dispose();
  }
});

test('mute and volume changes never create a context or unlock audio', () => {
  let created = 0;
  const audio = new FireworksAudio({ contextFactory: () => { created++; return fakeContext(); } });
  audio.setEnabled(false);
  assert.equal(audio.status, 'muted');
  audio.setEnabled(true);
  assert.equal(audio.status, 'locked');
  audio.setVolume(4);
  assert.equal(audio.volume, 1);
  audio.setVolume(-4);
  assert.equal(audio.volume, 0);
  assert.equal(audio.status, 'muted');
  audio.setVolume(NaN);
  assert.equal(audio.volume, 0);
  assert.equal(created, 0);
});

test('volume reaches the master bus and returning from mute restores ready', async () => {
  const context = fakeContext();
  const audio = new FireworksAudio({ contextFactory: () => context });
  await audio.unlock();
  const master = context.nodes.find(node => node.type === 'gain');
  const initial = master.gain.value;
  audio.setVolume(0.7);
  assert.ok(Math.abs(master.gain.value - 2 * initial) < 1e-8);
  audio.setEnabled(false);
  assert.equal(master.gain.value, 0);
  assert.equal(audio.status, 'muted');
  audio.setEnabled(true);
  assert.equal(audio.status, 'ready');
  assert.ok(master.gain.value > 0);
});

test('dispose closes once and prevents a pending unlock from becoming ready', async () => {
  const context = fakeContext();
  let finishResume;
  context.resume = () => new Promise(resolve => { finishResume = resolve; });
  const audio = new FireworksAudio({ contextFactory: () => context });
  const pending = audio.unlock();
  await audio.dispose();
  finishResume();
  assert.equal(await pending, false);
  await audio.dispose();
  assert.equal(context.closes, 1);
  assert.equal(audio.status, 'unavailable');
  assert.equal(await audio.unlock(), false);
  assert.ok(context.nodes.every(node => node.disconnected));
});

test('play stays silent while locked or suspended and never resumes implicitly', async () => {
  const context = fakeContext();
  const audio = new FireworksAudio({ contextFactory: () => context });
  assert.equal(audio.play({ type: 'burst' }), false);
  assert.equal(context.sources.length, 0);
  await audio.unlock();
  context.state = 'suspended';
  assert.equal(audio.play({ type: 'launch' }), false);
  assert.equal(context.resumes, 1);
});

test('launch uses an airy rising whistle with finite short source envelopes', async () => {
  const context = fakeContext();
  const audio = new FireworksAudio({ contextFactory: () => context });
  await audio.unlock();
  assert.equal(audio.play({ type: 'launch', kind: 'chrysanthemum', x: 0 }), true);
  assert.equal(context.sources.length, 2);
  const whistle = context.sources.find(node => node.frequency);
  const frequency = whistle.frequency.events;
  assert.ok(frequency.at(-1)[1] > frequency[0][1], 'pitch rises');
  const noise = context.sources.find(node => node.buffer);
  assert.ok(noise.buffer.getChannelData(0).some(value => value !== 0));
  assert.ok(noise.buffer.getChannelData(0).every(value => Number.isFinite(value) && Math.abs(value) <= 1));
  for (const source of context.sources) {
    assert.equal(source.starts[0], context.currentTime);
    assert.ok(source.stops[0] > context.currentTime && source.stops[0] < context.currentTime + 1.5);
  }
  assert.ok(context.nodes.find(node => node.type === 'panner').pan.value < 0);
});

test('bursts combine a falling low thump with a filtered crackling tail', async () => {
  const durations = [];
  for (const kind of ['chrysanthemum', 'heart', 'willow']) {
    const context = fakeContext();
    const audio = new FireworksAudio({ contextFactory: () => context });
    await audio.unlock();
    assert.equal(audio.play({ type: 'burst', kind, x: 1 }), true);
    const thump = context.sources.find(node => node.frequency);
    const frequencies = thump.frequency.events;
    assert.ok(frequencies[0][1] <= 160);
    assert.ok(frequencies.at(-1)[1] < frequencies[0][1]);
    const noise = context.sources.find(node => node.buffer);
    durations.push(noise.stops[0] - context.currentTime);
    assert.ok(noise.stops[0] > thump.stops[0]);
    assert.ok(noise.connected.some(node => node.frequency), 'noise passes through a filter');
    assert.ok(context.nodes.find(node => node.type === 'panner').pan.value > 0);
  }
  assert.ok(durations[2] > durations[0], 'willow gets a longer trailing crackle');
  assert.ok(durations.every(duration => duration < 3));
});

test('stereo is optional, unknown events are ignored, and invalid positions are safe', async () => {
  const context = fakeContext({ stereo: false });
  const audio = new FireworksAudio({ contextFactory: () => context });
  await audio.unlock();
  assert.equal(audio.play({ type: 'unknown' }), false);
  assert.equal(audio.play(null), false);
  assert.equal(audio.play({ type: 'burst', kind: 'unknown', x: NaN }), true);
  assert.equal(audio.status, 'ready');
});

test('mute immediately stops and disconnects every active sound', async () => {
  for (const mute of [audio => audio.setEnabled(false), audio => audio.setVolume(0), audio => audio.stop()]) {
    const context = fakeContext();
    const audio = new FireworksAudio({ contextFactory: () => context });
    await audio.unlock();
    const busNodes = new Set(context.nodes);
    audio.play({ type: 'launch' });
    audio.play({ type: 'burst' });
    assert.ok(context.sources.length > 0);
    mute(audio);
    assert.ok(context.sources.every(source => source.stops.at(-1) === 0 && source.disconnected));
    assert.ok(context.nodes.filter(node => !busNodes.has(node)).every(node => node.disconnected));
    assert.doesNotThrow(() => context.sources.forEach(source => source.finish()));
  }
});

test('ended sounds release resources and free the concurrency budget', async () => {
  const context = fakeContext();
  const audio = new FireworksAudio({ contextFactory: () => context });
  await audio.unlock();
  for (let index = 0; index < 12; index++) assert.equal(audio.play({ type: 'burst' }), true);
  assert.equal(audio.play({ type: 'burst' }), false);
  assert.equal(context.sources.length, 24);
  context.sources.slice(0, 2).forEach(source => source.finish());
  assert.ok(context.sources.slice(0, 2).every(source => source.disconnected));
  assert.equal(audio.play({ type: 'burst' }), true);
  assert.equal(audio.play({ type: 'burst' }), false);
  audio.stop();
  assert.equal(audio.play({ type: 'launch' }), true);
});

test('synthesis errors clean up partial graphs and cannot break the visual loop', async () => {
  const context = fakeContext();
  const audio = new FireworksAudio({ contextFactory: () => context, onStateChange: () => { throw new Error('observer'); } });
  await audio.unlock();
  const busNodes = new Set(context.nodes);
  context.createBufferSource = () => { throw new Error('out of device memory'); };
  assert.equal(audio.play({ type: 'burst' }), false);
  assert.equal(audio.status, 'unavailable');
  assert.ok(context.nodes.filter(node => !busNodes.has(node)).every(node => node.disconnected));
  await audio.dispose();
});
