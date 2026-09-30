import test from 'node:test';
import assert from 'node:assert/strict';
import { hand } from './helpers/romance-hand.js';

const romance = await import('../src/romance.js').catch(() => ({}));

function scene() {
  assert.equal(typeof romance.RomanceScene, 'function', 'RomanceScene must be exported');
  return new romance.RomanceScene();
}

function gestures() {
  assert.equal(typeof romance.RomanceGestures, 'function', 'RomanceGestures must be exported');
  return new romance.RomanceGestures();
}


function hold(detector, landmarks, from, until, aspect = 1) {
  let result;
  for (let time = from; time <= until; time += 100) result = detector.update(landmarks, time, aspect);
  return result;
}

test('V creates two stars and palm creates one flower with deterministic item data', () => {
  const first = scene();
  assert.equal(first.phase, 'garden');
  assert.equal(first.action('stars', 12, { x: 0.3, y: 0.4 }), true);
  assert.equal(first.action('flower', 20, { x: 0.7, y: 0.6 }), true);
  assert.deepEqual(first.items.map(({ kind }) => kind), ['star', 'star', 'flower']);
  assert.equal(new Set(first.items.map(({ id }) => id)).size, 3);
  assert.deepEqual(first.items.map(({ bornAt }) => bornAt), [12, 12, 20]);
  assert.equal(first.items[2].x, 0.7);
  assert.equal(first.items[2].y, 0.6);
  assert.ok(first.items.every(({ seed }) => seed >= 0 && seed <= 1));
  const second = scene();
  second.action('stars', 12, { x: 0.3, y: 0.4 });
  second.tick(900);
  second.action('flower', 20, { x: 0.7, y: 0.6 });
  assert.deepEqual(second.items, first.items);
});

test('item limit rejects a star pair atomically and invalid actions change nothing', () => {
  const model = scene();
  for (let i = 0; i < 63; i++) assert.equal(model.action('flower', i), true);
  assert.equal(model.action('stars', 64), false);
  assert.equal(model.items.length, 63);
  assert.equal(model.action('flower', 65), true);
  assert.equal(model.action('flower', 66), false);
  assert.equal(model.action('nonsense', 67), false);
  assert.equal(model.items.length, 64);
});

test('gather fills a sparse garden and requires 2200 ms before reveal', () => {
  const model = scene();
  model.action('flower', 0, { x: 0.15, y: 0.2 });
  assert.equal(model.action('reveal', 0), false);
  assert.equal(model.action('gather', 100), true);
  assert.equal(model.gatheredAt, 100);
  assert.equal(model.phase, 'gathering');
  assert.equal(model.items.length, 32);
  assert.equal(model.items[0].x, 0.15);
  assert.equal(model.action('gather', 200), false);
  assert.equal(model.action('flower', 200), false);
  assert.equal(model.action('stars', 200), false);
  assert.equal(model.action('reveal', 2299), false);
  model.tick(2299);
  assert.equal(model.phase, 'gathering');
  model.tick(2300);
  assert.equal(model.phase, 'heart');
  assert.equal(model.action('reveal', 2400), true);
  assert.equal(model.phase, 'reveal');
  assert.equal(model.revealedAt, 2400);
  assert.equal(model.action('reveal', 2500), false);
  assert.equal(model.revealedAt, 2400);
});

test('heart placement is deterministic and independent of animation frame count', () => {
  const first = scene();
  const second = scene();
  for (const model of [first, second]) { model.action('stars', 0); model.action('gather', 50); }
  for (let time = 50; time < 1150; time += 17) first.tick(time);
  first.tick(1150);
  second.tick(1150);
  assert.deepEqual(first.items, second.items);
  first.tick(2250);
  second.tick(5000);
  assert.deepEqual(first.items, second.items);
  for (const [i, item] of first.items.entries()) {
    const t = i / first.items.length * Math.PI * 2;
    const expectedX = 0.5 + Math.sin(t) ** 3 * 0.3;
    const expectedY = 0.42 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 * 0.25;
    assert.ok(Math.abs(item.x - expectedX) < 1e-9);
    assert.ok(Math.abs(item.y - expectedY) < 1e-9);
    assert.ok(item.x >= 0.2 && item.x <= 0.8 && item.y >= 0.17 && item.y <= 0.67);
  }
});

test('gather preserves a full garden instead of adding or dropping items', () => {
  const model = scene();
  for (let i = 0; i < 32; i++) model.action('stars', i);
  const ids = model.items.map(({ id }) => id);
  model.action('gather', 100);
  model.tick(2300);
  assert.deepEqual(model.items.map(({ id }) => id), ids);
  assert.equal(model.items.length, 64);
});

test('pinch selects nearest only on entry, preserves offset and clamps dragging', () => {
  const model = scene();
  model.action('flower', 0, { x: 0.3, y: 0.4 });
  model.action('flower', 1, { x: 0.35, y: 0.4 });
  model.pinch('pinch', { x: 0.32, y: 0.42 });
  assert.equal(model.selectedId, model.items[0].id);
  model.pinch('pinch', { x: 0.62, y: 0.72 });
  assert.ok(Math.abs(model.items[0].x - 0.6) < 1e-9);
  assert.ok(Math.abs(model.items[0].y - 0.7) < 1e-9);
  model.pinch('pinch', { x: 1.5, y: -1 });
  assert.equal(model.items[0].x, 0.94);
  assert.equal(model.items[0].y, 0.06);
  model.pinch('lost', null);
  assert.equal(model.selectedId, null);
  model.pinch('pinch', { x: 0.1, y: 0.9 });
  model.pinch('pinch', { x: 0.35, y: 0.4 });
  assert.equal(model.selectedId, null);
  model.pinch('idle', null);
  model.pinch('pinch', { x: 0.35, y: 0.4 });
  assert.equal(model.selectedId, model.items[1].id);
  model.action('gather', 20);
  assert.equal(model.selectedId, null);
  const origins = structuredClone(model.items);
  model.pinch('pinch', { x: 0.5, y: 0.5 });
  assert.deepEqual(model.items, origins);
});

test('undo operates only in the garden and reset restores a clean scene', () => {
  const model = scene();
  model.action('stars', 0);
  const initial = structuredClone(model.items);
  model.undo();
  assert.equal(model.items.length, 1);
  model.action('gather', 10);
  model.undo();
  assert.equal(model.items.length, 32);
  model.tick(2210);
  model.action('reveal', 2300);
  model.reset();
  assert.equal(model.phase, 'garden');
  assert.deepEqual(model.items, []);
  assert.equal(model.selectedId, null);
  assert.equal(model.gatheredAt, null);
  assert.equal(model.revealedAt, null);
  model.action('stars', 0);
  assert.deepEqual(model.items, initial);
});

test('gesture geometry recognizes palm, V and fist across rotation, scale and camera aspect', () => {
  for (const pose of ['palm', 'v', 'fist', 'love']) {
    for (const scale of [0.3, 0.7, 1]) {
      for (const aspect of [0.75, 1, 16 / 9]) {
        for (const rotation of [-1.2, 0, 0.8, Math.PI]) {
          const detector = gestures();
          const landmarks = hand(pose, { scale, aspect, rotation });
          const result = hold(detector, landmarks, 0, 600, aspect);
          assert.equal(result.pose, pose, `${pose}: ${scale}/${aspect}/${rotation}`);
          assert.equal(result.event, pose);
          assert.equal(result.progress, 1);
        }
      }
    }
  }
});

test('love gesture needs an extended thumb and does not collide with pinch or other poses',()=>{
  const detector=gestures();
  const love=hand('love');
  assert.equal(hold(detector,love,0,600).event,'love');
  assert.equal(hold(detector,love,700,1800).event,null);
  const foldedThumb=hand('love');foldedThumb[4]={...foldedThumb[5]};
  assert.equal(detector.update(foldedThumb,1900).pose,'idle');
  hold(detector,hand('idle'),2000,2300);
  assert.equal(hold(detector,love,2400,3000).event,'love');
  assert.equal(detector.update(hand('love',{pinchRatio:.1}),3100).pose,'pinch');
});

test('gesture points remain in raw camera coordinates and follow the intended fingers', () => {
  const detector = gestures();
  for (const [pose, indices] of [['v', [8, 12]], ['palm', [0, 5, 9, 13, 17]], ['fist', [0, 5, 9, 13, 17]], ['pinch', [4, 8]]]) {
    const landmarks = hand(pose);
    const result = detector.update(landmarks, 0);
    assert.equal(result.pose, pose);
    assert.equal(result.point.x, indices.reduce((sum, i) => sum + landmarks[i].x, 0) / indices.length);
    assert.equal(result.point.y, indices.reduce((sum, i) => sum + landmarks[i].y, 0) / indices.length);
  }
});

test('a held gesture emits once and a brief neutral glitch does not rearm it', () => {
  const detector = gestures();
  const v = hand('v');
  assert.equal(hold(detector, v, 0, 500).event, null);
  assert.equal(detector.update(v, 600).event, 'v');
  assert.equal(hold(detector, v, 700, 1600).event, null);
  detector.update(hand('idle'), 1700);
  detector.update(hand('idle'), 1800);
  assert.equal(hold(detector, v, 1900, 2600).event, null);
  hold(detector, hand('idle'), 2700, 3000);
  assert.equal(hold(detector, v, 3100, 3700).event, 'v');
});

test('switching directly to another stable pose rearms and fires after its own 600 ms hold', () => {
  const detector = gestures();
  assert.equal(hold(detector, hand('v'), 0, 600).event, 'v');
  assert.equal(hold(detector, hand('palm'), 700, 1200).event, null);
  assert.equal(detector.update(hand('palm'), 1300).event, 'palm');
  assert.equal(hold(detector, hand('fist'), 1400, 2000).event, 'fist');
});

test('lost frames and interrupt cancel an unfinished hold but preserve the fired latch', () => {
  const detector = gestures();
  const v = hand('v');
  hold(detector, v, 0, 500);
  assert.deepEqual(detector.update(null, 550), { pose: 'lost', point: null, event: null, progress: 0 });
  assert.equal(hold(detector, v, 600, 1100).event, null);
  assert.equal(detector.update(v, 1200).event, 'v');
  detector.update(null, 1300);
  assert.equal(hold(detector, v, 1400, 2300).event, null);
  detector.interrupt();
  assert.equal(hold(detector, v, 2400, 3300).event, null);
  detector.reset();
  assert.equal(hold(detector, v, 3400, 4000).event, 'v');
});

test('sparse or backwards timestamps cannot finish a hold', () => {
  const detector = gestures();
  const v = hand('v');
  detector.update(v, 0);
  assert.equal(detector.update(v, 1000).event, null);
  assert.equal(detector.update(v, 2000).event, null);
  assert.equal(hold(detector, v, 2100, 2600).event, 'v');
  detector.reset();
  hold(detector, v, 1000, 1500);
  assert.equal(detector.update(v, 1400).event, null);
  assert.equal(hold(detector, v, 1500, 1900).event, null);
  assert.equal(detector.update(v, 2000).event, 'v');
});

test('fist wins over nearby thumb/index tips, while a real pinch has hysteresis', () => {
  const detector = gestures();
  assert.equal(detector.update(hand('fist', { pinchRatio: 0.05 }), 0).pose, 'fist');
  assert.equal(detector.update(hand('pinch'), 100).pose, 'pinch');
  assert.equal(detector.update(hand('pinch', { pinchRatio: 0.35 }), 200).pose, 'pinch');
  assert.equal(detector.update(hand('pinch', { pinchRatio: 0.5 }), 300).pose, 'palm');
  detector.update(hand('pinch'), 400);
  detector.interrupt();
  assert.equal(detector.update(hand('pinch', { pinchRatio: 0.35 }), 500).pose, 'palm');
});

test('malformed and degenerate landmarks report tracking loss', () => {
  const detector = gestures();
  for (const landmarks of [null, [], Array(21).fill({ x: 0.5, y: 0.5 }), hand().map((point, i) => i === 8 ? { x: NaN, y: 0 } : point)]) {
    assert.deepEqual(detector.update(landmarks, 0), { pose: 'lost', point: null, event: null, progress: 0 });
  }
});
