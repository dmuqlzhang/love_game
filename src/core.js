const finitePoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const copyPoint = ({ x, y }) => ({ x, y });
const distance = (a, b, aspect = 1) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

function segmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

/** Geometry is stored in normalized display coordinates, independent of canvas size. */
export class DrawingEngine {
  constructor() {
    this.shapes = [];
    this.selectedId = null;
    this.mode = 'idle';
    this._currentShapeId = null;
    this._stroke = null;
    this._pendingPoint = null;
    this._grabPoint = null;
    this._nextId = 1;
  }

  get currentShapeId() { return this._currentShapeId; }
  get pointCount() {
    return this.shapes.reduce((sum, shape) => sum + shape.strokes.reduce((count, stroke) => count + stroke.length, 0), 0);
  }

  update({ mode, point } = {}) {
    if (mode === 'lost' || !['draw', 'pinch', 'idle'].includes(mode)) {
      this.breakInput();
      return;
    }
    if (mode === 'idle') {
      this._endStroke();
      this._release();
      this.mode = 'idle';
      return;
    }
    if (!finitePoint(point)) {
      this.breakInput();
      return;
    }
    if (mode === 'pinch') {
      if (this.mode !== 'pinch') {
        this.finishShape();
        this.selectedId = this._hitTest(point);
        this._grabPoint = copyPoint(point);
      } else if (this.selectedId !== null) {
        const shape = this.shapes.find((item) => item.id === this.selectedId);
        if (shape && this._grabPoint) {
          const dx = point.x - this._grabPoint.x;
          const dy = point.y - this._grabPoint.y;
          for (const stroke of shape.strokes) {
            for (const vertex of stroke) { vertex.x += dx; vertex.y += dy; }
          }
        }
        this._grabPoint = copyPoint(point);
      }
      this.mode = 'pinch';
      return;
    }
    if (this.mode !== 'draw') this._endStroke();
    this._release();
    this.mode = 'draw';
    if (!this._stroke) {
      if (!this._pendingPoint) {
        this._pendingPoint = copyPoint(point);
        return;
      }
      if (distance(this._pendingPoint, point) < 0.001) return;
      let shape = this.shapes.find((item) => item.id === this._currentShapeId);
      if (!shape) {
        shape = { id: this._makeId(), strokes: [] };
        this.shapes.push(shape);
        this._currentShapeId = shape.id;
      }
      this._stroke = [this._pendingPoint, copyPoint(point)];
      shape.strokes.push(this._stroke);
      this._pendingPoint = null;
    } else if (distance(this._stroke.at(-1), point) >= 0.001) {
      this._stroke.push(copyPoint(point));
    }
    this._trim();
  }

  finishShape() {
    this._endStroke();
    this._currentShapeId = null;
    this._release();
    this.mode = 'idle';
  }

  breakInput() {
    this._endStroke();
    this._release();
    this.mode = 'lost';
  }

  clear() {
    this.shapes = [];
    this.finishShape();
  }

  undo() {
    this._endStroke();
    this._release();
    this.mode = 'idle';
    const shape = this.shapes.at(-1);
    if (!shape) return;
    shape.strokes.pop();
    if (!shape.strokes.length) {
      this.shapes.pop();
      if (this._currentShapeId === shape.id) this._currentShapeId = null;
    }
  }

  setShapes(shapes) {
    this.clear();
    const usedIds = new Set();
    for (const source of Array.isArray(shapes) ? shapes : []) {
      const strokes = (Array.isArray(source?.strokes) ? source.strokes : []).map((stroke) => {
        const result = [];
        for (const point of Array.isArray(stroke) ? stroke : []) {
          if (finitePoint(point) && (!result.length || distance(result.at(-1), point) >= 0.001)) result.push(copyPoint(point));
        }
        return result;
      }).filter((stroke) => stroke.length >= 2);
      if (!strokes.length) continue;
      let id = source.id;
      if (id == null || usedIds.has(id)) id = this._makeId();
      usedIds.add(id);
      this.shapes.push({ id, strokes });
    }
    this._trim();
  }

  _makeId() {
    let id;
    do { id = `shape-${this._nextId++}`; } while (this.shapes.some((shape) => shape.id === id));
    return id;
  }

  _endStroke() { this._stroke = null; this._pendingPoint = null; }
  _release() { this.selectedId = null; this._grabPoint = null; }

  _hitTest(point) {
    let nearestId = null;
    let nearestDistance = 0.065;
    // Prefer the most recently drawn shape when lines overlap.
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      for (const stroke of this.shapes[i].strokes) {
        for (let j = 1; j < stroke.length; j++) {
          const gap = segmentDistance(point, stroke[j - 1], stroke[j]);
          if (gap < nearestDistance) { nearestDistance = gap; nearestId = this.shapes[i].id; }
        }
      }
    }
    return nearestId;
  }

  _trim() {
    let excess = this.pointCount - 10000;
    while (excess > 0 && this.shapes.length) {
      const shape = this.shapes[0];
      const stroke = shape.strokes[0];
      if (stroke.length - excess >= 2) {
        stroke.splice(0, excess);
        excess = 0;
      } else {
        excess -= stroke.length;
        shape.strokes.shift();
        if (this._stroke === stroke) this._endStroke();
        if (!shape.strokes.length) {
          this.shapes.shift();
          if (this._currentShapeId === shape.id) this._currentShapeId = null;
          if (this.selectedId === shape.id) this._release();
        }
      }
    }
  }
}
function fingerExtended(landmarks, base, aspect) {
  const wrist = landmarks[0];
  const mcp = landmarks[base];
  const pip = landmarks[base + 1];
  const tip = landmarks[base + 3];
  const ax = (mcp.x - pip.x) * aspect;
  const ay = mcp.y - pip.y;
  const bx = (tip.x - pip.x) * aspect;
  const by = tip.y - pip.y;
  const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
  const cosine = denominator ? (ax * bx + ay * by) / denominator : 1;
  return cosine < -0.5 && distance(wrist, tip, aspect) > distance(wrist, pip, aspect) * 1.12;
}

/** Palm-relative pinch distance avoids a fixed pixel threshold changing with camera distance. */
export class GestureInterpreter {
  constructor() {
    this.mode = 'idle';
    this._candidate = 'idle';
    this._candidateSince = 0;
  }

  update(landmarks, time = 0, aspect = 1) {
    if (!Array.isArray(landmarks) || landmarks.length < 21 || !landmarks.every(finitePoint)) {
      this.mode = 'lost';
      this._candidate = 'idle';
      return { mode: 'lost', point: null };
    }
    aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    time = Number.isFinite(time) ? time : 0;
    const palmScale = (distance(landmarks[5], landmarks[17], aspect) + distance(landmarks[0], landmarks[9], aspect)) / 2;
    if (palmScale < 0.005) {
      this.mode = 'lost';
      this._candidate = 'idle';
      return { mode: 'lost', point: null };
    }
    const pinchRatio = distance(landmarks[4], landmarks[8], aspect) / palmScale;
    const pinch = pinchRatio < (this.mode === 'pinch' ? 0.42 : 0.28);
    const pointing = fingerExtended(landmarks, 5, aspect) &&
      ![9, 13, 17].some((base) => fingerExtended(landmarks, base, aspect));
    const candidate = pinch ? 'pinch' : pointing ? 'draw' : 'idle';

    if (candidate !== this._candidate || time < this._candidateSince) {
      this._candidate = candidate;
      this._candidateSince = time;
    }
    // Stop an old action immediately. Start the next only after the new posture settles.
    if (candidate !== this.mode) {
      this.mode = candidate !== 'idle' && time - this._candidateSince >= 55 ? candidate : 'idle';
    }
    const point = this.mode === 'pinch'
      ? { x: (landmarks[4].x + landmarks[8].x) / 2, y: (landmarks[4].y + landmarks[8].y) / 2 }
      : copyPoint(landmarks[8]);
    return { mode: this.mode, point };
  }
}

/** Adaptive exponential smoothing: quiet motion is damped, fast motion stays responsive. */
export class PointFilter {
  constructor() { this.reset(); }

  reset() { this._point = null; this._raw = null; this._time = null; }

  update(point, time = 0) {
    if (!finitePoint(point)) { this.reset(); return null; }
    time = Number.isFinite(time) ? time : 0;
    const gap = time - this._time;
    if (!this._point || gap <= 0 || gap > 200) {
      this._point = copyPoint(point);
    } else {
      const seconds = Math.max(gap / 1000, 1 / 240);
      const speed = distance(point, this._raw) / seconds;
      const cutoff = 2 + speed * 5;
      const alpha = Math.min(0.88, 1 - Math.exp(-2 * Math.PI * cutoff * seconds));
      this._point = {
        x: this._point.x + alpha * (point.x - this._point.x),
        y: this._point.y + alpha * (point.y - this._point.y),
      };
    }
    this._raw = copyPoint(point);
    this._time = time;
    return copyPoint(this._point);
  }
}

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
