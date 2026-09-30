import test from 'node:test';
import assert from 'node:assert/strict';
import { RomanceUI } from '../src/romance-ui.js';
import { hand } from './helpers/romance-hand.js';

function setup(reducedMotion=false,options={}) {
  const nodes=new Map();
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'1',dataset:{},classList:{toggle(){}},addEventListener(){},setAttribute(){}});
    return nodes.get(id);
  };
  globalThis.document={getElementById:node,querySelector:node,querySelectorAll:()=>[],body:node('body')};
  return {ui:new RomanceUI({width:600,height:600,reducedMotion},{notify(){},onModeChange(){},...options}),node};
}
const map=point=>point;

test('a config failure stays visible and the fallback can still complete the story',()=>{
  const error='姓名配置读取失败，暂用“亲爱的”。';
  const {ui,node}=setup(true,{configError:error});
  assert.equal(node('config-warning').hidden,false);
  assert.equal(node('config-warning').textContent,error);
  assert.equal(node('recipient-name').textContent,'亲爱的');
  ui.action('gather',null,0);ui.action('reveal',null,150);
  assert.ok(node('romance-accessible').textContent.startsWith('亲爱的，'));
  assert.equal(node('config-warning').textContent,error);
});

test('custom name reaches page title, dedication, reveal and fireworks without HTML insertion',()=>{
  const notices=[];
  const {ui,node}=setup(false,{config:{recipientName:'<小夏>'},notify:message=>notices.push(message)});
  assert.equal(document.title,'灵绘 · 把星光送给<小夏>');
  assert.equal(node('recipient-name').textContent,'<小夏>');
  assert.equal(node('recipient-name').innerHTML,undefined);
  assert.equal(node('config-warning').hidden,true);
  ui.action('gather',null,0);ui.action('reveal',null,2300);
  assert.ok(node('romance-accessible').textContent.startsWith('<小夏>，'));
  assert.equal(notices.at(-1),'把心里的话，送给<小夏>');
  ui.action('fireworks',null,2400);
  assert.equal(notices.at(-1),'为<小夏>，点亮漫天烟花');
});
function hold(ui,pose,from,until) {
  for(let time=from;time<=until;time+=100)ui.handleLandmarks(hand(pose),time,1,map);
}

test('reentering romance accepts the same gesture without losing the scene',()=>{
  const {ui}=setup();
  hold(ui,'v',0,600);
  assert.equal(ui.scene.items.length,2);
  ui.setActive(false);ui.setActive(true);
  hold(ui,'v',1000,1600);
  assert.equal(ui.scene.items.length,4);
});

test('palm begun during gathering must be released before the reveal gesture',()=>{
  const {ui}=setup();
  ui.action('gather',null,0);
  hold(ui,'palm',1800,3100);
  assert.equal(ui.scene.phase,'heart');
  hold(ui,'idle',3200,3500);
  hold(ui,'palm',3600,4100);
  assert.equal(ui.scene.phase,'heart');
  hold(ui,'palm',4200,4200);
  assert.equal(ui.scene.phase,'reveal');
});

test('delayed pre-heart samples cannot arm reveal after rendering advances phase',()=>{
  const {ui}=setup();
  ui.action('gather',null,0);
  // Advance through the same entry point used by both animation and camera input.
  ui.advance(2250);
  hold(ui,'palm',1900,2500);
  assert.equal(ui.scene.phase,'heart');
  hold(ui,'palm',2600,2800);
  assert.equal(ui.scene.phase,'heart');
  hold(ui,'idle',2900,3200);
  hold(ui,'palm',3300,3900);
  assert.equal(ui.scene.phase,'reveal');
});

test('sample interruption releases a dragged item before accepting the next pinch',()=>{
  const {ui,node}=setup();node('smoothing').value='0';
  ui.handleLandmarks(hand('pinch'),0,1,map);
  const start={...ui.point};
  ui.action('flower',start,0);ui.interrupt();
  ui.handleLandmarks(hand('pinch'),100,1,map);
  assert.ok(ui.scene.selectedId);
  const moved=hand('pinch').map(point=>({...point,x:point.x+.3}));
  ui.handleLandmarks(moved,600,1,map);
  assert.equal(ui.scene.selectedId,null);
  assert.equal(ui.scene.items[0].x,start.x);
});

test('romance follows the smoothing slider at off, normal and strong levels',()=>{
  const positions=[];
  for(const strength of [0,1,2]){
    const {ui,node}=setup();node('smoothing').value=String(strength);
    ui.handleLandmarks(hand('pinch'),0,1,map);
    ui.handleLandmarks(hand('pinch').map(p=>({...p,x:p.x+.05})),50,1,map);
    positions.push(ui.point.x);
  }
  assert.ok(positions[0]>positions[1]);
  assert.ok(positions[1]>positions[2]);
});

test('reduced motion finishes gathering promptly while retaining the reveal step',()=>{
  const {ui}=setup(true);
  ui.action('gather',null,0);
  ui.scene.tick(150);
  assert.equal(ui.scene.phase,'heart');
  assert.equal(ui.scene.revealedAt,null);
});

test('fireworks trigger in every romance phase without changing the story or stacking',()=>{
  for(const phase of ['garden','gathering','heart','reveal']){
    const {ui}=setup();ui.scene.phase=phase;
    if(phase==='gathering'){ui.scene.phase='garden';ui.action('gather',null,0);}
    assert.equal(ui.action('fireworks',null,100),true);
    assert.equal(ui.scene.phase,phase);
    assert.equal(ui.action('fireworks',null,150),false);
    ui.setActive(false);
    assert.equal(ui.fireworks.active,false);
    assert.equal(ui.action('fireworks',null,200),false);
  }
});

test('love gesture and key 5 launch fireworks, reset cancels them',()=>{
  const {ui}=setup();
  hold(ui,'love',0,600);assert.equal(ui.fireworks.active,true);
  ui.reset();assert.equal(ui.fireworks.active,false);
  assert.equal(ui.key({key:'5',target:{matches:()=>false},preventDefault(){}}),true);
  assert.equal(ui.fireworks.active,true);
});

test('a love hold spanning heart formation still fires after its own 600 ms',()=>{
  const {ui}=setup();ui.action('gather',null,0);
  hold(ui,'love',1800,2400);
  assert.equal(ui.scene.phase,'heart');assert.equal(ui.fireworks.active,true);
});
