import { HAND_CONNECTIONS } from './core.js';

const PINK = '#ff8eb3';
const CYAN = '#54e8e7';
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.lastTime = 0;
    this.width = 1;
    this.height = 1;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  spawn(point) {
    if (!point || this.reducedMotion) return;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 10 + Math.random() * 42;
      this.particles.push({ x: point.x * this.width, y: point.y * this.height,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: .25 + Math.random() * .35, age: 0 });
    }
    if (this.particles.length > 160) this.particles.splice(0, this.particles.length - 160);
  }
  clearParticles() { this.particles = []; }
  line(points, color, width = 1.5, glow = true) {
    if (!points?.length) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(points[0].x * this.width, points[0].y * this.height);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x * this.width, points[i].y * this.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    if (glow) {
      ctx.globalAlpha = .22; ctx.lineWidth = width * 5;
      ctx.shadowBlur = 18; ctx.shadowColor = color; ctx.stroke();
      ctx.globalAlpha = .65; ctx.lineWidth = width * 2; ctx.shadowBlur = 7; ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineWidth = width; ctx.shadowBlur = 0; ctx.stroke();
  }
  render(engine, state) {
    const { time, video, showBackground, mirror, demo, landmarks, showSkeleton, point, mode } = state;
    const ctx = this.ctx, w = this.width, h = this.height;
    const dt = Math.min((time - this.lastTime) / 1000 || .016, .05);
    this.lastTime = time;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#070e18'; ctx.fillRect(0, 0, w, h);
    const gradient = ctx.createRadialGradient(w * .52, h * .35, 0, w * .5, h * .4, w * .65);
    gradient.addColorStop(0, '#10202b'); gradient.addColorStop(.5, '#0a1521'); gradient.addColorStop(1, '#070c15');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    if (showBackground && video?.readyState >= 2) {
      const rect = videoRect(w, h, video.videoWidth, video.videoHeight);
      ctx.save();
      ctx.globalAlpha = .65;
      if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
    }
    ctx.fillStyle = '#6c9aa51f';
    for (let x = 22; x < w; x += 26) for (let y = 22; y < h; y += 26) ctx.fillRect(x, y, 1, 1);
    ctx.strokeStyle = '#20404b55'; ctx.lineWidth = 1;
    for (const [x, y, sx, sy] of [[15,15,1,1],[w-15,15,-1,1],[15,h-15,1,-1],[w-15,h-15,-1,-1]]) {
      ctx.beginPath(); ctx.moveTo(x, y + sy * 10); ctx.lineTo(x,y); ctx.lineTo(x+sx*10,y); ctx.stroke();
    }
    for (const shape of engine.shapes) {
      const selected = shape.id === engine.selectedId;
      for (const stroke of shape.strokes) this.line(stroke, selected ? '#ffe890' : PINK, selected ? 2.1 : 1.5);
    }
    if (demo) this.drawDemo(time);
    if (showSkeleton && landmarks) {
      for (const [a,b] of HAND_CONNECTIONS) this.line([landmarks[a], landmarks[b]], CYAN, 1, false);
      ctx.fillStyle = '#befefa';
      for (const joint of landmarks) { ctx.beginPath();ctx.arc(joint.x*w,joint.y*h,2,0,Math.PI*2);ctx.fill(); }
    }
    if (point && mode !== 'lost') {
      const x = point.x*w,y=point.y*h;
      ctx.strokeStyle = mode === 'pinch' ? '#ffe890' : CYAN;
      ctx.lineWidth = 1;ctx.beginPath();ctx.arc(x,y,mode==='pinch'?12:8,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle = mode === 'draw' ? '#fff6f7' : ctx.strokeStyle;
      ctx.beginPath();ctx.arc(x,y,mode==='draw'?3:2,0,Math.PI*2);ctx.fill();
    }
    for (const p of this.particles) {
      p.age += dt;p.x += p.vx*dt;p.y += p.vy*dt;
      ctx.globalAlpha = Math.max(0,1-p.age/p.life);ctx.strokeStyle = '#ffd6c3';
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.035,p.y-p.vy*.035);ctx.stroke();
    }
    this.particles = this.particles.filter(p=>p.age<p.life);
    ctx.globalAlpha = 1;
  }
  drawDemo(time) {
    const ratio = this.width / this.height;
    const drift = this.reducedMotion ? 0 : Math.sin(time / 1800) * .004;
    const star = [];
    for (let i=0;i<=5;i++) {
      const angle = -Math.PI/2 + i*4*Math.PI/5;
      star.push({x:.47+Math.cos(angle)*.105,y:.27+Math.sin(angle)*.105*ratio+drift});
    }
    this.line(star,PINK,1.8);
    const wrist = {x:.66,y:.46};
    const fingers = [
      [wrist,{x:.62,y:.37},{x:.61,y:.32},{x:.60,y:.30}],
      [wrist,{x:.65,y:.35},{x:.65,y:.25},{x:.64,y:.17}],
      [wrist,{x:.68,y:.35},{x:.70,y:.27},{x:.71,y:.23}],
      [wrist,{x:.71,y:.37},{x:.74,y:.31},{x:.75,y:.28}],
      [wrist,{x:.73,y:.40},{x:.77,y:.36},{x:.78,y:.32}],
    ];
    for (const finger of fingers) this.line(finger,CYAN,.9);
    this.line([fingers[0][1],fingers[1][1],fingers[2][1],fingers[3][1],fingers[4][1]],CYAN,.8);
    const ctx=this.ctx;
    ctx.fillStyle='#6ee9e0';
    for (const finger of fingers) for(const p of finger){ctx.beginPath();ctx.arc(p.x*this.width,p.y*this.height,1.5,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#558d9b';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(.57*this.width,.27*this.height);ctx.quadraticCurveTo(.62*this.width,.26*this.height,.64*this.width,.17*this.height);ctx.stroke();ctx.setLineDash([]);
  }
}

export function videoRect(width, height, videoWidth, videoHeight) {
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const w = videoWidth * scale, h = videoHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

export function mapLandmark(point, rect, width, height, mirror) {
  return { x: (rect.x + (mirror ? 1-point.x : point.x)*rect.width)/width,
    y: (rect.y+point.y*rect.height)/height, z: point.z };
}
