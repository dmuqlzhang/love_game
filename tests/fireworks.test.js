import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../src/fireworks.js').catch(()=>({}));
function make(options){assert.equal(typeof module.FireworksShow,'function');return new module.FireworksShow(options);}

test('one show launches across the sky and cannot stack; ends with complete cleanup',()=>{
  const show=make();
  assert.equal(show.active,false);
  assert.equal(show.trigger(100),true);
  assert.equal(show.trigger(101),false);
  let launches=0,bursts=0,maxParticles=0;
  const xs=[],kinds=new Set();
  for(let time=100;time<9200;time+=50){
    const events=show.tick(time);
    launches+=events.filter(e=>e.type==='launch').length;
    bursts+=events.filter(e=>e.type==='burst').length;
    for(const e of events)if(e.type==='burst'){xs.push(e.x);kinds.add(e.kind);}
    maxParticles=Math.max(maxParticles,show.particles.length);
    assert.ok(show.particles.every(p=>[p.x,p.y,p.alpha,p.px,p.py].every(Number.isFinite)));
  }
  assert.ok(launches>=12&&bursts===launches);
  assert.ok(Math.min(...xs)<.25&&Math.max(...xs)>.75);
  assert.equal(kinds.size,3);
  assert.ok(maxParticles>250&&maxParticles<=1800);
  assert.equal(show.active,false);
  assert.equal(show.particles.length,0);
  assert.equal(show.rockets.length,0);
  assert.equal(show.trigger(10000),true);
});

test('a stalled frame cannot replay old sounds or accumulate obsolete particles',()=>{
  const show=make();show.trigger(0);
  assert.equal(show.tick(0).filter(e=>e.type==='launch').length,1);
  assert.deepEqual(show.tick(0),[]);
  const events=show.tick(5000);
  assert.ok(events.every(e=>5000-e.time<=180));
  assert.ok(show.particles.length<=1800);
  assert.deepEqual(show.tick(15000),[]);
  assert.equal(show.active,false);
});

test('reset cancels current and all future fireworks',()=>{
  const show=make();show.trigger(0);show.tick(2000);show.reset();
  assert.equal(show.active,false);
  assert.deepEqual(show.tick(3000),[]);
  assert.equal(show.particles.length,0);
});

test('reduced motion uses fewer stationary sparks and skips ascending rockets',()=>{
  const show=make({reducedMotion:true});show.trigger(0);
  assert.ok(show.tick(0).every(e=>e.type==='burst'));
  assert.equal(show.rockets.length,0);
  const first=show.particles.map(p=>({x:p.x,y:p.y}));
  show.tick(100);
  assert.deepEqual(show.particles.map(p=>({x:p.x,y:p.y})),first);
  assert.ok(first.length<=100);
  show.tick(5000);assert.equal(show.active,false);
});
