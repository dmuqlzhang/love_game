const MAX_ITEMS = 64;
const GATHER_DURATION = 2200;
const HOLD_DURATION = 600;
const RELEASE_DURATION = 250;
const MAX_SAMPLE_GAP = 300;
const finitePoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const clamp = (value, low = 0.06, high = 0.94) => Math.max(low, Math.min(high, value));
const distance = (a, b, aspect = 1) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
const seedFor = (index) => (index * 0.618033988749895 + 0.173205080756888) % 1;
const safeTime = (time) => Number.isFinite(time) ? time : 0;

function heartPoint(index, total) {
  const angle = index / total * Math.PI * 2;
  return {
    x: 0.5 + Math.sin(angle) ** 3 * 0.3,
    y: 0.42 - (13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle)) / 17 * 0.25,
  };
}

/** Scene positions use the renderer's normalized square stage coordinates. */
export class RomanceScene {
  constructor({reducedMotion=false}={}) {
    this.gatherDuration=reducedMotion?150:GATHER_DURATION;
    this.reset();
  }

  reset() {
    this.phase = 'garden';
    this.items = [];
    this.selectedId = null;
    this.gatheredAt = null;
    this.revealedAt = null;
    this._nextId = 1;
    this._gatherPaths = [];
    this._release();
  }

  action(name, now, point = { x: 0.5, y: 0.45 }) {
    now = safeTime(now);
    if (name === 'reveal') {
      if (this.phase !== 'heart') return false;
      this.phase = 'reveal';
      this.revealedAt = now;
      this._release();
      return true;
    }
    if (this.phase !== 'garden') return false;
    if (name === 'gather') {
      while (this.items.length < 32) {
        const seed = seedFor(this._nextId);
        const angle = seed * Math.PI * 2;
        const radius = 0.18 + seedFor(this._nextId + 7) * 0.22;
        this._add(this.items.length % 4 === 0 ? 'flower' : 'star', now, {
          x: 0.5 + Math.cos(angle) * radius,
          y: 0.45 + Math.sin(angle) * radius * 0.8,
        });
      }
      this._gatherPaths = this.items.map((item, index) => ({
        from: { x: item.x, y: item.y },
        to: heartPoint(index, this.items.length),
      }));
      this.gatheredAt = now;
      this.phase = 'gathering';
      this._release();
      return true;
    }
    if (name !== 'stars' && name !== 'flower') return false;
    const count = name === 'stars' ? 2 : 1;
    if (this.items.length + count > MAX_ITEMS) return false;
    point = finitePoint(point) ? point : { x: 0.5, y: 0.45 };
    if (name === 'stars') {
      this._add('star', now, { x: point.x - 0.035, y: point.y - 0.014 });
      this._add('star', now, { x: point.x + 0.035, y: point.y + 0.014 });
    } else {
      this._add('flower', now, point);
    }
    return true;
  }

  tick(now) {
    if (this.phase !== 'gathering') return;
    const elapsed = clamp((safeTime(now) - this.gatheredAt) / this.gatherDuration, 0, 1);
    const eased = elapsed * elapsed * (3 - 2 * elapsed);
    this.items.forEach((item, index) => {
      const { from, to } = this._gatherPaths[index];
      item.x = from.x + (to.x - from.x) * eased;
      item.y = from.y + (to.y - from.y) * eased;
    });
    if (elapsed === 1) {
      this.phase = 'heart';
      this._gatherPaths = [];
      this._release();
    }
  }

  pinch(mode, point) {
    if (this.phase !== 'garden' || mode !== 'pinch' || !finitePoint(point)) {
      this._release();
      return;
    }
    if (!this._pinching) {
      let nearest = null;
      let gap = 0.08;
      for (let index = this.items.length - 1; index >= 0; index--) {
        const item = this.items[index];
        const candidateGap = distance(item, point);
        if (candidateGap <= gap) { nearest = item; gap = candidateGap; }
      }
      this.selectedId = nearest?.id ?? null;
      this._dragOffset = nearest ? { x: nearest.x - point.x, y: nearest.y - point.y } : null;
      this._pinching = true;
      return;
    }
    const item = this.items.find(({ id }) => id === this.selectedId);
    if (item && this._dragOffset) {
      item.x = clamp(point.x + this._dragOffset.x);
      item.y = clamp(point.y + this._dragOffset.y);
    }
  }

  undo() {
    if (this.phase !== 'garden') return;
    this.items.pop();
    this._release();
  }

  _add(kind, bornAt, point) {
    const index = this._nextId++;
    this.items.push({ id: `romance-${index}`, kind, x: clamp(point.x), y: clamp(point.y), bornAt, seed: seedFor(index) });
  }

  _release() {
    this.selectedId = null;
    this._pinching = false;
    this._dragOffset = null;
  }
}

function meanPoint(landmarks, indices) {
  return {
    x: indices.reduce((sum, index) => sum + landmarks[index].x, 0) / indices.length,
    y: indices.reduce((sum, index) => sum + landmarks[index].y, 0) / indices.length,
  };
}

function fingerState(landmarks, base, aspect) {
  const wrist = landmarks[0];
  const mcp = landmarks[base];
  const pip = landmarks[base + 1];
  const tip = landmarks[base + 3];
  const ax = (mcp.x - pip.x) * aspect;
  const ay = mcp.y - pip.y;
  const bx = (tip.x - pip.x) * aspect;
  const by = tip.y - pip.y;
  const magnitude = Math.hypot(ax, ay) * Math.hypot(bx, by);
  const cosine = magnitude > 1e-9 ? (ax * bx + ay * by) / magnitude : 1;
  const tipDistance = distance(wrist, tip, aspect);
  const pipDistance = distance(wrist, pip, aspect);
  return {
    extended: cosine < -0.5 && tipDistance > pipDistance * 1.1,
    folded: (cosine > -0.1 && tipDistance < pipDistance * 1.12) || tipDistance < distance(wrist, mcp, aspect) * 1.05,
  };
}

/** Detection uses raw camera coordinates; mirroring belongs to the UI. */
export class RomanceGestures {
  constructor() { this.reset(); }

  reset(blockedPose = null) {
    this._firedPose = blockedPose;
    this.interrupt();
  }

  // A lost hand is not evidence of a released pose: retain the fired latch.
  interrupt() {
    this._candidate = null;
    this._candidateSince = null;
    this._lastTime = null;
    this._pinching = false;
  }

  update(landmarks, time = 0, aspect = 1) {
    if (!Array.isArray(landmarks) || landmarks.length < 21 || Array.from({ length: 21 }, (_, i) => landmarks[i]).some((point) => !finitePoint(point))) {
      this.interrupt();
      return { pose: 'lost', point: null, event: null, progress: 0 };
    }
    aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    time = safeTime(time);
    const scale = (distance(landmarks[5], landmarks[17], aspect) + distance(landmarks[0], landmarks[9], aspect)) / 2;
    if (scale < 0.005) {
      this.interrupt();
      return { pose: 'lost', point: null, event: null, progress: 0 };
    }
    const interrupted = this._lastTime !== null && (time < this._lastTime || time - this._lastTime > MAX_SAMPLE_GAP);
    if (interrupted) this.interrupt();
    this._lastTime = time;

    const fingers = [5, 9, 13, 17].map((base) => fingerState(landmarks, base, aspect));
    const fist = fingers.every(({ folded }) => folded);
    const pinch = !fist && distance(landmarks[4], landmarks[8], aspect) / scale < (this._pinching ? 0.42 : 0.28);
    const palm = fingers.every(({ extended }) => extended);
    const v = fingers[0].extended && fingers[1].extended && fingers[2].folded && fingers[3].folded && distance(landmarks[8], landmarks[12], aspect) / scale > 0.2;
    const thumbOpen = distance(landmarks[4],landmarks[5],aspect)>scale*.55 && distance(landmarks[4],landmarks[0],aspect)>distance(landmarks[3],landmarks[0],aspect)*1.06;
    const love = fingers[0].extended && fingers[1].folded && fingers[2].folded && fingers[3].extended && thumbOpen;
    const pose = fist ? 'fist' : pinch ? 'pinch' : palm ? 'palm' : v ? 'v' : love ? 'love' : 'idle';
    this._pinching = pose === 'pinch';
    const point = meanPoint(landmarks, pose === 'pinch' ? [4, 8] : pose === 'v' ? [8, 12] : [0, 5, 9, 13, 17]);
    if (pose !== this._candidate) {
      this._candidate = pose;
      this._candidateSince = time;
    }
    const heldFor = time - this._candidateSince;
    if (this._firedPose !== null && pose !== this._firedPose && heldFor >= RELEASE_DURATION) this._firedPose = null;
    let event = null;
    const actionable = pose === 'v' || pose === 'palm' || pose === 'fist' || pose === 'love';
    if (actionable && heldFor >= HOLD_DURATION && this._firedPose === null) {
      event = pose;
      this._firedPose = pose;
    }
    const progress = actionable ? (this._firedPose === pose ? 1 : clamp(heldFor / HOLD_DURATION, 0, 1)) : 0;
    return { pose, point, event, progress, ...(interrupted ? {interrupted:true} : {}) };
  }
}
