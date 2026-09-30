export function drawFireworks(renderer,show){
  if(!show.active)return;
  const {ctx,width:w,height:h}=renderer,side=Math.min(w,h);
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const f of show.flashes){
    const radius=side*.11;
    const glow=ctx.createRadialGradient(f.x*w,f.y*h,0,f.x*w,f.y*h,radius);
    glow.addColorStop(0,f.color);glow.addColorStop(1,'transparent');
    ctx.globalAlpha=f.alpha;ctx.fillStyle=glow;ctx.fillRect(f.x*w-radius,f.y*h-radius,radius*2,radius*2);
  }
  ctx.lineCap='round';
  for(const r of show.rockets){
    ctx.globalAlpha=.65;ctx.strokeStyle=r.color;ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(r.px*w,r.py*h);ctx.lineTo(r.x*w,r.y*h);ctx.stroke();
    ctx.fillStyle='#fff4d9';ctx.beginPath();ctx.arc(r.x*w,r.y*h,2,0,Math.PI*2);ctx.fill();
  }
  for(const p of show.particles){
    const x=p.ex*w+(p.x-p.ex)*side,y=p.ey*h+(p.y-p.ey)*side;
    const px=p.ex*w+(p.px-p.ex)*side,py=p.ey*h+(p.py-p.ey)*side;
    ctx.strokeStyle=p.color;ctx.fillStyle=p.color;ctx.globalAlpha=p.alpha*.13;ctx.lineWidth=p.size*4;
    ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x+.1,y+.1);ctx.stroke();
    ctx.globalAlpha=p.alpha;ctx.lineWidth=p.size;
    ctx.stroke();
    ctx.fillRect(x-p.size*.4,y-p.size*.4,p.size*.8,p.size*.8);
  }
  ctx.restore();
}
