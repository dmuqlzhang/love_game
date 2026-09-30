import { drawFireworks } from './fireworks-renderer.js';

const TAU = Math.PI * 2;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t=clamp(value); return t*t*(3-2*t); };

export function romanceBounds(width, height) {
  const side = Math.min(width, height) * .96;
  return { side, x: (width-side)/2, y: (height-side)/2 };
}

export function canvasToRomance(point, width, height) {
  if (!point) return null;
  const b = romanceBounds(width,height);
  return { x:(point.x*width-b.x)/b.side, y:(point.y*height-b.y)/b.side };
}

function glowPath(ctx, color, width=1.3) {
  ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=14;ctx.lineWidth=width*3;ctx.globalAlpha*=.3;ctx.stroke();
  ctx.globalAlpha/=.3;ctx.lineWidth=width;ctx.shadowBlur=5;ctx.stroke();ctx.shadowBlur=0;
}

function star(ctx,x,y,r,color,rotation=0) {
  ctx.beginPath();
  for(let i=0;i<=10;i++) {
    const a=-Math.PI/2+rotation+i*Math.PI/5, radius=i%2?r*.43:r;
    const px=x+Math.cos(a)*radius,py=y+Math.sin(a)*radius;
    if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }
  glowPath(ctx,color,1.2);
}

function flower(ctx,x,y,r,color,openness=1,rotation=0) {
  ctx.save();ctx.translate(x,y);ctx.rotate(rotation);
  for(let i=0;i<6;i++) {
    const a=i*TAU/6;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a)*r*.46*openness,Math.sin(a)*r*.46*openness,r*.52,r*.26,a,0,TAU);
    glowPath(ctx,color,.9);
  }
  ctx.beginPath();ctx.arc(0,0,r*.14,0,TAU);ctx.fillStyle='#ffe1a8';ctx.shadowColor='#ffe1a8';ctx.shadowBlur=8;ctx.fill();
  ctx.restore();
}

function heartPath(ctx,b,scale=1) {
  ctx.beginPath();
  for(let i=0;i<=140;i++) {
    const t=i/140*TAU;
    const x=.5+16*Math.sin(t)**3/16*.30*scale;
    const y=.42-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))/17*.25*scale;
    if(i===0)ctx.moveTo(b.x+x*b.side,b.y+y*b.side);else ctx.lineTo(b.x+x*b.side,b.y+y*b.side);
  }
}

function wrapText(ctx,text,maxWidth) {
  const lines=[];let line='';
  for(const char of text){if(line&&ctx.measureText(line+char).width>maxWidth){lines.push(line);line=char;}else line+=char;}
  if(line)lines.push(line);return lines;
}

export function drawRomance(renderer, scene, { time, point, progress, pose, fireworks, config }) {
  const {ctx,width:w,height:h,reducedMotion}=renderer;
  const b=romanceBounds(w,h), now=time;
  const reveal=scene.phase==='reveal';
  const heart=scene.phase==='heart'||reveal;
  ctx.save();
  const halo=ctx.createRadialGradient(w*.5,h*.43,0,w*.5,h*.43,b.side*.64);
  halo.addColorStop(0,reveal?'#85275237':'#47234729');halo.addColorStop(.6,'#31203f14');halo.addColorStop(1,'#00000000');
  ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
  // Deterministic sky; stars are decoration, not detected hand data.
  for(let i=0;i<75;i++){
    const x=((Math.sin(i*127.1+2)*43758.54)%1+1)%1*w;
    const y=((Math.sin(i*311.7+7)*19341.13)%1+1)%1*h;
    const pulse=reducedMotion?.6:.45+.25*Math.sin(now/2200+i*3.1);
    ctx.globalAlpha=pulse;ctx.fillStyle=i%4===0?'#efabc7':'#b6cada';
    ctx.beginPath();ctx.arc(x,y,i%7===0?1.2:.65,0,TAU);ctx.fill();
  }
  ctx.globalAlpha=1;
  if(fireworks)drawFireworks(renderer,fireworks);
  if(scene.phase==='garden'&&!scene.items.length&&!fireworks?.active){
    const y=b.y+b.side*.30;
    flower(ctx,w/2,y,b.side*.055,'#f3a7bb',1,-.15);
    star(ctx,w/2-b.side*.12,y-b.side*.05,b.side*.019,'#f8d9a3',.12);
    star(ctx,w/2+b.side*.13,y+b.side*.025,b.side*.014,'#f8d9a3',-.2);
    ctx.textAlign='center';ctx.fillStyle='#ebc4d3';ctx.font=`400 ${Math.max(22,b.side*.042)}px "Songti SC","SimSun",serif`;
    ctx.fillText('把星光，送给心里的人。',w/2,b.y+b.side*.49);
    ctx.font=`${Math.max(10,b.side*.018)}px "PingFang SC",sans-serif`;ctx.fillStyle='#a18399';
    ctx.fillText('比一个 V，让今晚的第一颗星亮起来',w/2,b.y+b.side*.56);
    ctx.fillStyle='#705b74';ctx.font='10px "PingFang SC",sans-serif';
    ctx.fillText('也可点击「点亮星星」开始 · 无需摄像头',w/2,b.y+b.side*.61);
  }
  const gathering=scene.phase==='gathering';
  if(gathering||heart){
    const amount=reducedMotion?1:smooth((now-scene.gatheredAt)/2200);
    ctx.globalAlpha=(reveal?.55:.32)*amount;
    heartPath(ctx,b);glowPath(ctx,'#ffa2c3',reveal?1.6:1);
    ctx.globalAlpha=1;
    if(reveal&&!reducedMotion){
      const burst=clamp((now-scene.revealedAt)/1700);
      ctx.globalAlpha=(1-burst)*.6;heartPath(ctx,b,1+burst*.22);glowPath(ctx,'#f7c5d8',1);ctx.globalAlpha=1;
    }
  }
  for(const item of scene.items){
    const age=now-item.bornAt;
    const entrance=reducedMotion?1:smooth(age/800);
    const pulse=heart&&!reducedMotion?1+Math.sin(now/1400)*.025:1;
    const x=b.x+(.5+(item.x-.5)*pulse)*b.side;
    const y=b.y+(.42+(item.y-.42)*pulse)*b.side;
    const selected=item.id===scene.selectedId;
    const r=b.side*(item.kind==='flower'?.026:.018)*(heart?.78:1)*entrance;
    ctx.save();ctx.globalAlpha=.85+.15*entrance;
    if(item.kind==='flower')flower(ctx,x,y,r,selected?'#fff1b7':'#f6a5be',entrance,item.seed*TAU);
    else star(ctx,x,y,r,selected?'#fff1b7':'#f8d8a1',item.seed*TAU);
    if(selected){ctx.beginPath();ctx.arc(x,y,r+9,0,TAU);ctx.strokeStyle='#ffebb67a';ctx.lineWidth=1;ctx.stroke();}
    if(age<1000&&!reducedMotion){
      for(let i=0;i<6;i++){const angle=i*TAU/6+item.seed;const d=r+age*.028;ctx.globalAlpha=(1-clamp(age/1000))*.6;ctx.fillStyle='#ffd7c3';ctx.beginPath();ctx.arc(x+Math.cos(angle)*d,y+Math.sin(angle)*d,1.1,0,TAU);ctx.fill();}
    }
    ctx.restore();
  }
  if(reveal){
    const age=now-scene.revealedAt;
    ctx.textAlign='center';ctx.globalAlpha=reducedMotion?1:smooth(age/950);
    ctx.fillStyle='#ffe4ef';ctx.shadowColor='#ec91b3';ctx.shadowBlur=16;
    ctx.font=`400 ${Math.max(28,b.side*.061)}px "Songti SC","SimSun",serif`;
    ctx.fillText(config.recipientName,w/2,b.y+b.side*.405,b.side*.52);ctx.shadowBlur=0;
    ctx.font=`${Math.max(9,b.side*.017)}px Georgia,serif`;ctx.fillStyle='#b9829d';
    ctx.fillText('ALL MY ORDINARY DAYS, WITH YOU',w/2,b.y+b.side*.458);
    const text=config.messageBody;
    const bodyAge=Math.max(0,age-1000),shown=reducedMotion?text.length:Math.floor(bodyAge/55);
    const size=Math.max(13,Math.min(19,b.side*.028));
    ctx.font=`400 ${size}px "Songti SC","SimSun",serif`;
    const lines=wrapText(ctx,text,b.side*.83);
    ctx.globalAlpha=reducedMotion?1:smooth(bodyAge/700);ctx.fillStyle='#ebcbd6';
    let count=0;
    lines.forEach((line,i)=>{ctx.fillText(line.slice(0,Math.max(0,shown-count)),w/2,b.y+b.side*(.77)+i*size*1.9);count+=line.length;});
    ctx.globalAlpha=1;
  }else if(heart){
    ctx.textAlign='center';ctx.font=`${Math.max(11,b.side*.024)}px "Songti SC",serif`;ctx.fillStyle='#d5b3c4';
    ctx.fillText('所有温柔，都有了形状。',w/2,b.y+b.side*.78);
    ctx.font='10px "PingFang SC",sans-serif';ctx.fillStyle='#8e738d';ctx.fillText('再次张开手掌，把心里的话送给她',w/2,b.y+b.side*.84);
  }
  if(point&&progress>0&&progress<1&&pose!=='lost'){
    const x=b.x+point.x*b.side,y=b.y+point.y*b.side;
    ctx.strokeStyle='#f8c2d7';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,25,-Math.PI/2,-Math.PI/2+progress*TAU);ctx.stroke();
  }
  ctx.restore();
}
