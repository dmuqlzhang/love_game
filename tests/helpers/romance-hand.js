export function hand(pose = 'palm', { scale = 1, aspect = 1, rotation = 0, pinchRatio } = {}) {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  points[0] = { x: 0.5, y: 0.8, z: 0 };
  [[0.4, 0.7], [0.32, 0.62], [0.28, 0.54], [0.23, 0.47]].forEach(([x, y], i) => { points[i + 1] = { x, y, z: 0 }; });
  for (const [base, x, y] of [[5, 0.42, 0.55], [9, 0.5, 0.52], [13, 0.58, 0.55], [17, 0.65, 0.6]]) {
    const extended = pose === 'palm' || pose === 'pinch' || (pose === 'v' && base < 13) || (pose === 'love' && (base === 5 || base === 17)) || (pose === 'idle' && base === 5);
    points[base] = { x, y, z: 0 };
    points[base + 1] = { x, y: y - 0.13, z: 0 };
    points[base + 2] = { x: x + (extended ? 0 : 0.015), y: y + (extended ? -0.24 : -0.01), z: 0 };
    points[base + 3] = { x, y: y + (extended ? -0.34 : 0.07), z: 0 };
  }
  if (pose === 'pinch' || pinchRatio !== undefined) {
    const palmScale = (Math.hypot(0.23, 0.05) + 0.28) / 2;
    points[4] = { x: points[8].x + palmScale * (pinchRatio ?? 0.18), y: points[8].y, z: 0 };
  }
  return points.map(({ x, y, z }) => {
    const dx = (x - 0.5) * scale;
    const dy = (y - 0.5) * scale;
    return { x: 0.5 + (dx * Math.cos(rotation) - dy * Math.sin(rotation)) / aspect, y: 0.5 + dx * Math.sin(rotation) + dy * Math.cos(rotation), z };
  });
}
