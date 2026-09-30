const TAU=Math.PI*2;
const PALETTE=['#ffa4d2','#94dbff','#f6c973','#bdabff','#91f2cc','#ff9c85'];
const random=n=>((Math.sin(n*127.1+17.8)*43758.5453)%1+1)%1;
const clamp=n=>Math.max(0,Math.min(1,n));

// Positions are normalized; radial motion uses the canvas's shorter side in the renderer.
export class FireworksShow {
  constructor({reducedMotion=false}={}){this.reducedMotion=reducedMotion;this.sequence=0;this.reset();}
  reset(){this.active=false;this.shells=[];this.particles=[];this.rockets=[];this.flashes=[];this.endAt=0;}
  trigger(time){
    if(!Number.isFinite(time))return false;
    if(this.active&&time<this.endAt)return false;
    this.reset();this.active=true;this.sequence++;
    const count=this.reducedMotion?4:18;
    for(let i=0;i<count;i++){
      const seed=i+this.sequence*37;
      const start=time+(this.reducedMotion?i*700:Math.floor(i/3)*850+(i%3)*240);
      const rise=this.reducedMotion?0:720+random(seed+1)*230;
      const life=this.reducedMotion?1100:2400+random(seed+2)*400;
      const shell={id:i,x:.13+random(seed+3)*.74,y:.13+random(seed+4)*.36,
        start,burstAt:start+rise,life,kind:['chrysanthemum','heart','willow'][i%3],
        color:PALETTE[i%PALETTE.length],seed,launched:false,burst:false,sparks:[]};
      const sparks=this.reducedMotion?40:120;
      for(let j=0;j<sparks;j++){
        const angle=j/sparks*TAU;
        const speed=.105+random(seed*113+j)*.15;
        let vx=Math.cos(angle)*speed,vy=Math.sin(angle)*speed;
        if(shell.kind==='heart'){
          vx=Math.sin(angle)**3*.19;
          vy=-(13*Math.cos(angle)-5*Math.cos(2*angle)-2*Math.cos(3*angle)-Math.cos(4*angle))/17*.19;
        }
        shell.sparks.push({vx,vy,life:life*(.74+random(j+seed*5)*.26),twinkle:random(j+seed*7)*TAU});
      }
      this.shells.push(shell);
    }
    this.endAt=Math.max(...this.shells.map(s=>s.burstAt+s.life));
    return true;
  }
  tick(time){
    if(!this.active||!Number.isFinite(time))return [];
    if(time>=this.endAt){this.reset();return [];}
    this.particles=[];this.rockets=[];this.flashes=[];
    const sounds=[];
    for(const s of this.shells){
      if(time<s.start)continue;
      if(!s.launched){
        s.launched=true;
        if(!this.reducedMotion&&time-s.start<=180)sounds.push({type:'launch',x:s.x,kind:s.kind,time:s.start});
      }
      if(time<s.burstAt){
        const t=clamp((time-s.start)/(s.burstAt-s.start));
        const position=u=>({x:s.x+Math.sin(u*Math.PI)*.045,y:1.06-(1.06-s.y)*(1-(1-u)**1.6)});
        this.rockets.push({...position(t),px:position(Math.max(0,t-.07)).x,py:position(Math.max(0,t-.07)).y,color:s.color});
        continue;
      }
      if(!s.burst){
        s.burst=true;
        if(time-s.burstAt<=180)sounds.push({type:'burst',x:s.x,kind:s.kind,time:s.burstAt});
      }
      const age=time-s.burstAt;
      if(age>=s.life)continue;
      if(age<350&&!this.reducedMotion)this.flashes.push({x:s.x,y:s.y,alpha:(1-age/350)*.24,color:s.color});
      for(const spark of s.sparks){
        if(age>=spark.life||this.particles.length>=1800)continue;
        const seconds=age/1000;
        const position=t=>{
          const travel=this.reducedMotion?1.05:(1-Math.exp(-t*.8))/.8;
          return {x:s.x+spark.vx*travel,y:s.y+spark.vy*travel+(this.reducedMotion?0:t*t*(s.kind==='willow'?.045:.028))};
        };
        const p=position(seconds),prev=position(Math.max(0,seconds-.065));
        const alpha=this.reducedMotion?Math.sin(Math.PI*clamp(age/spark.life)):(1-clamp(age/spark.life))**.7;
        this.particles.push({...p,px:prev.x,py:prev.y,ex:s.x,ey:s.y,color:s.kind==='willow'?'#f6c973':s.color,
          alpha:alpha*(.78+.22*Math.sin(seconds*12+spark.twinkle)**2),size:s.kind==='willow'?1.2:1.6});
      }
    }
    return sounds;
  }
}
