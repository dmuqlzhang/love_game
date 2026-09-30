import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawingEngine, GestureInterpreter, PointFilter, HAND_CONNECTIONS } from '../src/core.js';

test('the gesture core exposes the agreed browser API', async () => {
  const core = await import('../src/core.js').catch(() => ({}));
  assert.equal(typeof core.DrawingEngine, 'function', 'DrawingEngine must be exported');
  assert.equal(typeof core.GestureInterpreter, 'function');
  assert.equal(typeof core.PointFilter, 'function');
  assert.ok(Array.isArray(core.HAND_CONNECTIONS));
});

function input(engine, mode, x, y, time = 0) {
  engine.update({ mode, point: { x, y }, time });
}

function line(engine, x = 0.2, y = 0.2) {
  input(engine, 'draw', x, y);
  input(engine, 'draw', x + 0.1, y + 0.1, 16);
}

test('drawing, finishing, pinch dragging and drawing again keep independent geometry', () => {
  const engine = new DrawingEngine();
  line(engine);
  engine.finishShape();
  const originalId = engine.shapes[0].id;
  input(engine, 'pinch', 0.21, 0.21);
  assert.equal(engine.selectedId, originalId);
  input(engine, 'pinch', 0.41, 0.51);
  assert.ok(Math.abs(engine.shapes[0].strokes[0][0].x - 0.4) < 1e-9);
  assert.ok(Math.abs(engine.shapes[0].strokes[0][0].y - 0.5) < 1e-9);
  input(engine, 'idle', 0.7, 0.7);
  assert.equal(engine.selectedId, null);
  line(engine, 0.7, 0.7);
  assert.equal(engine.shapes.length, 2);
  assert.deepEqual(engine.shapes[1].strokes[0][0], { x: 0.7, y: 0.7 });
});

test('idle and lost input make disconnected strokes in the current shape', () => {
  const engine = new DrawingEngine();
  line(engine);
  const groupId = engine.currentShapeId;
  input(engine, 'idle', 0.4, 0.4);
  line(engine, 0.5, 0.5);
  assert.equal(engine.shapes.length, 1);
  assert.equal(engine.shapes[0].strokes.length, 2);
  engine.breakInput();
  assert.equal(engine.mode, 'lost');
  assert.equal(engine.currentShapeId, groupId);
  line(engine, 0.7, 0.7);
  assert.equal(engine.shapes[0].strokes.length, 3);
  assert.equal(engine.pointCount, 6);
});

test('a pinch started far away cannot capture a drawing by sweeping over it', () => {
  const engine = new DrawingEngine();
  line(engine);
  const original = structuredClone(engine.shapes);
  input(engine, 'pinch', 0.8, 0.8);
  input(engine, 'pinch', 0.25, 0.25);
  assert.equal(engine.selectedId, null);
  assert.deepEqual(engine.shapes, original);
  input(engine, 'idle', 0.25, 0.25);
  input(engine, 'pinch', 0.25, 0.25);
  assert.equal(engine.selectedId, engine.shapes[0].id);
  input(engine, 'lost', 0.5, 0.5);
  assert.equal(engine.selectedId, null);
});

test('pinch hit testing works on line segments between sampled points', () => {
  const engine = new DrawingEngine();
  input(engine, 'draw', 0.1, 0.5);
  input(engine, 'draw', 0.9, 0.5);
  input(engine, 'pinch', 0.5, 0.52);
  assert.equal(engine.selectedId, engine.shapes[0].id);
});

test('undo removes the most recent stroke, then shape, and clear resets input', () => {
  const engine = new DrawingEngine();
  line(engine);
  input(engine, 'idle', 0, 0);
  line(engine, 0.5, 0.5);
  engine.undo();
  assert.equal(engine.shapes[0].strokes.length, 1);
  assert.equal(engine.pointCount, 2);
  engine.undo();
  assert.equal(engine.shapes.length, 0);
  engine.undo();
  line(engine);
  input(engine, 'pinch', 0.25, 0.25);
  engine.clear();
  assert.deepEqual(engine.shapes, []);
  assert.equal(engine.selectedId, null);
  assert.equal(engine.currentShapeId, null);
  assert.equal(engine.pointCount, 0);
  assert.equal(engine.mode, 'idle');
});

test('invalid input cannot create geometry or connect a stroke through a tracking gap', () => {
  const engine = new DrawingEngine();
  input(engine, 'draw', 0.2, 0.2);
  input(engine, 'draw', 0.2, 0.2);
  engine.finishShape();
  assert.equal(engine.shapes.length, 0);
  line(engine);
  input(engine, 'draw', NaN, Infinity);
  line(engine, 0.7, 0.7);
  assert.equal(engine.shapes[0].strokes.length, 2);
  assert.equal(engine.pointCount, 4);
});

test('demo data and input points are copied instead of sharing mutable references', () => {
  const engine = new DrawingEngine();
  const demo = [{ id: 'demo', strokes: [[{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]] }];
  engine.setShapes(demo);
  demo[0].strokes[0][0].x = 0.9;
  assert.equal(engine.shapes[0].strokes[0][0].x, 0.1);
  const point = { x: 0.5, y: 0.5 };
  engine.update({ mode: 'draw', point, time: 0 });
  point.x = 0.8;
  input(engine, 'draw', 0.6, 0.6);
  assert.equal(engine.shapes[1].strokes[0][0].x, 0.5);
});

test('long sessions keep at most 10000 points while accepting recent movement', () => {
  const engine = new DrawingEngine();
  for (let i = 0; i < 11000; i++) input(engine, 'draw', i % 2 ? 0.2 : 0.8, i / 11000, i * 16);
  assert.ok(engine.pointCount <= 10000);
  assert.equal(engine.shapes.at(-1).strokes.at(-1).at(-1).x, 0.2);
  assert.ok(engine.shapes.at(-1).strokes.at(-1).at(-1).y > 0.99);
});

function hand({ scale = 1, pinchRatio = 1.4, open = false, aspect = 1 } = {}) {
  const points = [
    [0.5, 0.8], [0.4, 0.7], [0.3, 0.61], [0.27, 0.53], [0.24, 0.48],
    [0.42, 0.55], [0.42, 0.4], [0.42, 0.28], [0.42, 0.18],
    [0.5, 0.52], [0.5, 0.43], [0.51, 0.55], [0.5, 0.61],
    [0.58, 0.55], [0.59, 0.45], [0.58, 0.56], [0.58, 0.64],
    [0.65, 0.6], [0.68, 0.5], [0.66, 0.61], [0.64, 0.67],
  ].map(([x, y]) => ({ x, y, z: 0 }));
  if (open) {
    for (const [base, x] of [[9, 0.5], [13, 0.58], [17, 0.65]]) {
      points[base + 1] = { x, y: 0.4, z: 0 };
      points[base + 2] = { x, y: 0.28, z: 0 };
      points[base + 3] = { x, y: 0.18, z: 0 };
    }
  }
  const palm = (Math.hypot(0.23, 0.05) + 0.28) / 2;
  points[4] = { x: points[8].x + palm * pinchRatio, y: points[8].y, z: 0 };
  return points.map(({ x, y, z }) => ({ x: 0.5 + (x - 0.5) * scale / aspect, y: 0.5 + (y - 0.5) * scale, z }));
}

test('an index-only gesture must remain stable before drawing in raw camera coordinates', () => {
  const interpreter = new GestureInterpreter();
  const landmarks = hand();
  assert.equal(interpreter.update(landmarks, 0).mode, 'idle');
  assert.equal(interpreter.update(landmarks, 30).mode, 'idle');
  const result = interpreter.update(landmarks, 60);
  assert.equal(result.mode, 'draw');
  assert.deepEqual(result.point, { x: landmarks[8].x, y: landmarks[8].y });
  assert.equal(interpreter.update(hand({ open: true }), 80).mode, 'idle');
});

test('pinch detection is normalized for hand distance and camera aspect', () => {
  for (const scale of [0.25, 0.6, 1]) {
    for (const aspect of [1, 16 / 9]) {
      const interpreter = new GestureInterpreter();
      const landmarks = hand({ scale, aspect, pinchRatio: 0.18 });
      assert.equal(interpreter.update(landmarks, 0, aspect).mode, 'idle');
      const result = interpreter.update(landmarks, 60, aspect);
      assert.equal(result.mode, 'pinch', `scale=${scale}, aspect=${aspect}`);
      assert.equal(result.point.x, (landmarks[4].x + landmarks[8].x) / 2);
    }
  }
});

test('pinch hysteresis tolerates small separation changes and delays drawing after release', () => {
  const interpreter = new GestureInterpreter();
  interpreter.update(hand({ pinchRatio: 0.18 }), 0);
  assert.equal(interpreter.update(hand({ pinchRatio: 0.18 }), 60).mode, 'pinch');
  assert.equal(interpreter.update(hand({ pinchRatio: 0.34 }), 80).mode, 'pinch');
  assert.equal(interpreter.update(hand({ pinchRatio: 0.48 }), 100).mode, 'idle');
  assert.equal(interpreter.update(hand({ pinchRatio: 1.4 }), 130).mode, 'idle');
  assert.equal(interpreter.update(hand({ pinchRatio: 1.4 }), 170).mode, 'draw');
});

test('tracking loss releases pinch immediately and recovery requires a fresh stable gesture', () => {
  const interpreter = new GestureInterpreter();
  interpreter.update(hand({ pinchRatio: 0.18 }), 0);
  interpreter.update(hand({ pinchRatio: 0.18 }), 60);
  assert.deepEqual(interpreter.update(null, 70), { mode: 'lost', point: null });
  assert.equal(interpreter.update(hand(), 90).mode, 'idle');
  assert.equal(interpreter.update(hand(), 150).mode, 'draw');
  const corrupt = hand();
  corrupt[8].x = NaN;
  assert.equal(interpreter.update(corrupt, 160).mode, 'lost');
  assert.equal(interpreter.update([], 180).mode, 'lost');
});

test('a short false pinch stops drawing without dragging or adding a release bridge', () => {
  const interpreter = new GestureInterpreter();
  interpreter.update(hand(), 0);
  assert.equal(interpreter.update(hand(), 60).mode, 'draw');
  assert.equal(interpreter.update(hand({ pinchRatio: 0.18 }), 80).mode, 'idle');
  assert.equal(interpreter.update(hand(), 100).mode, 'idle');
  assert.equal(interpreter.update(hand(), 160).mode, 'draw');
});

test('point filtering suppresses tiny jitter while following deliberate fast movement', () => {
  const filter = new PointFilter();
  assert.deepEqual(filter.update({ x: 0.5, y: 0.5 }, 0), { x: 0.5, y: 0.5 });
  const jitter = filter.update({ x: 0.503, y: 0.498 }, 16);
  assert.ok(jitter.x > 0.5 && jitter.x < 0.502);
  assert.ok(jitter.y < 0.5 && jitter.y > 0.499);
  const movement = filter.update({ x: 0.9, y: 0.5 }, 32);
  assert.ok(movement.x > 0.75 && movement.x < 0.9);
  filter.reset();
  const point = { x: 0.1, y: 0.2 };
  const result = filter.update(point, 50);
  point.x = 0.8;
  assert.deepEqual(result, { x: 0.1, y: 0.2 });
  assert.equal(filter.update({ x: NaN, y: 0.5 }, 70), null);
  assert.deepEqual(filter.update({ x: 0.8, y: 0.8 }, 1000), { x: 0.8, y: 0.8 });
});

test('the skeleton includes all 21 MediaPipe landmarks and standard finger chains', () => {
  assert.equal(HAND_CONNECTIONS.length, 21);
  assert.equal(new Set(HAND_CONNECTIONS.flat()).size, 21);
  assert.ok(HAND_CONNECTIONS.some(([a, b]) => a === 7 && b === 8));
  assert.ok(HAND_CONNECTIONS.some(([a, b]) => a === 0 && b === 17));
});
