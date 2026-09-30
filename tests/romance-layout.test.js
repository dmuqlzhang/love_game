import test from 'node:test';
import assert from 'node:assert/strict';
import { romanceBounds, canvasToRomance, drawRomance } from '../src/romance-renderer.js';
import { createRomanceConfig } from '../src/romance-config.js';

test('the canvas renders the configured name within the heart and keeps the complete body',()=>{
  for(const [width,height] of [[1200,600],[360,440]]){
    const calls=[];
    const ctx={
      save(){},restore(){},beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){},fillRect(){},
      createRadialGradient(){return {addColorStop(){}};},
      measureText(text){return {width:[...text].length*18};},
      fillText(...args){calls.push(args);},
    };
    const config=createRomanceConfig({recipientName:'小夏与她的星光'});
    const renderer={ctx,width,height,reducedMotion:true};
    const scene={phase:'reveal',items:[],gatheredAt:0,revealedAt:2300};
    drawRomance(renderer,scene,{time:12000,point:null,progress:0,pose:'idle',config});
    assert.equal(calls[0][0],config.recipientName);
    assert.equal(calls[0][1],width/2);
    assert.equal(calls[0][3],romanceBounds(width,height).side*.52);
    assert.equal(calls.slice(2).map(call=>call[0]).join(''),config.messageBody);
  }
});

test('romance stage uses a centered square so hearts keep their proportions',()=>{
  for(const [width,height]of [[1200,600],[360,440],[700,700]]){
    const b=romanceBounds(width,height);
    assert.ok(b.side<=width&&b.side<=height);
    assert.ok(Math.abs(b.x*2+b.side-width)<1e-9);
    assert.ok(Math.abs(b.y*2+b.side-height)<1e-9);
  }
});

test('pointer mapping hits the same scene position in portrait and landscape',()=>{
  for(const [w,h]of [[1200,600],[360,440]]){
    const b=romanceBounds(w,h),scene={x:.32,y:.46};
    const pointer={x:(b.x+scene.x*b.side)/w,y:(b.y+scene.y*b.side)/h};
    const result=canvasToRomance(pointer,w,h);
    assert.ok(Math.abs(result.x-scene.x)<1e-9);
    assert.ok(Math.abs(result.y-scene.y)<1e-9);
  }
  assert.equal(canvasToRomance(null,1200,600),null);
});
