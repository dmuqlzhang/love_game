import test from 'node:test';
import assert from 'node:assert/strict';
const visibility=await import('../src/page-visibility.js').catch(()=>({}));
function fixture(){
  let hidden=false,stops=0,callback=null;
  const pending=new Set();
  const document={get hidden(){return hidden;},addEventListener(_name,fn){callback=fn;},removeEventListener(_name,fn){if(callback===fn)callback=null;}};
  assert.equal(typeof visibility.watchPageVisibility,'function');
  const dispose=visibility.watchPageVisibility(document,()=>stops++,{
    schedule:fn=>{pending.add(fn);return fn;},cancel:fn=>pending.delete(fn),
  });
  return {change(value){hidden=value;callback?.();},flush(){for(const fn of [...pending]){pending.delete(fn);fn();}},dispose,get stops(){return stops;},get pending(){return pending.size;}};
}
test('a temporary hide during Mac fullscreen preserves camera and animation',()=>{
  const f=fixture();f.change(true);assert.equal(f.stops,0);f.change(false);f.flush();assert.equal(f.stops,0);
});
test('a page that stays hidden stops camera and effects once',()=>{
  const f=fixture();f.change(true);f.change(true);assert.equal(f.pending,1);f.flush();assert.equal(f.stops,1);
});
test('returning to the foreground cancels stale stops across repeated transitions',()=>{
  const f=fixture();f.change(true);f.change(false);f.change(true);f.change(false);f.flush();assert.equal(f.stops,0);
  f.change(true);f.flush();assert.equal(f.stops,1);
});
test('disposing on page exit cancels pending work and removes the listener',()=>{
  const f=fixture();f.change(true);f.dispose();f.flush();f.change(true);assert.equal(f.pending,0);assert.equal(f.stops,0);
});
