import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraSession, cameraErrorMessage, FrameWatchdog } from '../src/camera.js';

const fakeStream = () => {
  const track = { stopped: false, stop() { this.stopped = true; } };
  return { track, getTracks: () => [track] };
};
const fakeVideo = () => ({ srcObject: null, play: async () => {}, pause() {} });

test('stopping while permission is pending releases a late stream', async () => {
  let resolve;
  const stream = fakeStream();
  const video = fakeVideo();
  const session = new CameraSession(video, { getUserMedia: () => new Promise(r => { resolve = r; }) });
  const pending = session.start();
  session.stop();
  resolve(stream);
  assert.equal(await pending, false);
  assert.equal(stream.track.stopped, true);
  assert.equal(video.srcObject, null);
});

test('stop releases tracks and clears video', async () => {
  const stream = fakeStream();
  const video = fakeVideo();
  const session = new CameraSession(video, { getUserMedia: async () => stream });
  assert.equal(await session.start(), true);
  session.stop();
  assert.equal(stream.track.stopped, true);
  assert.equal(video.srcObject, null);
});

test('video playback error does not leave camera running', async () => {
  const stream = fakeStream();
  const video = fakeVideo();
  video.play = async () => { throw new Error('play failed'); };
  const session = new CameraSession(video, { getUserMedia: async () => stream });
  await assert.rejects(session.start(), /play failed/);
  assert.equal(stream.track.stopped, true);
  assert.equal(video.srcObject, null);
});

test('permission and missing-device errors have distinct actionable messages', () => {
  assert.match(cameraErrorMessage({ name: 'NotAllowedError' }), /权限/);
  assert.match(cameraErrorMessage({ name: 'NotFoundError' }), /摄像头/);
  assert.match(cameraErrorMessage({ name: 'NotReadableError' }), /占用/);
});

test('frozen or unready video expires even when no worker frame is in flight', () => {
  const watchdog = new FrameWatchdog();
  assert.equal(watchdog.check(100, 1, true), false);
  assert.equal(watchdog.check(1000, 1, true), false);
  assert.equal(watchdog.check(1700, 1, true), true);
  watchdog.reset();
  assert.equal(watchdog.check(2000, 2, true), false);
  assert.equal(watchdog.check(3600, 2, false), true);
});

test('fresh camera frames keep the watchdog alive', () => {
  const watchdog = new FrameWatchdog();
  for (let i=0;i<200;i++) assert.equal(watchdog.check(i*33,i/30,true), false);
});
