import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as config from '../src/romance-config.js';

test('the editable config supplies a valid name and preserves the agreed message body',()=>{
  const input=JSON.parse(readFileSync(new URL('../public/config.json',import.meta.url),'utf8'));
  assert.equal(typeof input.recipientName,'string');
  assert.ok(input.recipientName.trim());
  const value=config.createRomanceConfig(input);
  assert.equal(value.recipientName,input.recipientName.trim());
  assert.equal(value.message,input.recipientName.trim()+'，今晚的星光送给你，往后每一个平凡的日子，我都想和你一起。');
});

test('personalization builds every recipient string from the configured name',()=>{
  assert.equal(typeof config.createRomanceConfig,'function');
  const value=config.createRomanceConfig({recipientName:'  小夏  '});
  assert.equal(value.recipientName,'小夏');
  assert.equal(value.message,`小夏，${value.messageBody}`);
  assert.equal(value.title,'灵绘 · 把星光送给小夏');
  assert.equal(value.revealHint,'把心里的话，送给小夏');
  assert.equal(value.fireworksHint,'为小夏，点亮漫天烟花');
});

test('runtime config uses a fresh request, validates the name, and handles missing or bad files',async()=>{
  assert.equal(typeof config.loadRomanceConfig,'function');
  const loaded=await config.loadRomanceConfig('/config.json',async(url,options)=>{
    assert.equal(url,'/config.json');assert.equal(options.cache,'no-store');
    return {ok:true,json:async()=>({recipientName:'阿宁'})};
  });
  assert.equal(loaded.config.recipientName,'阿宁');assert.equal(loaded.error,null);
  for(const fetcher of [async()=>({ok:false,status:404}),async()=>{throw Error('offline');},async()=>({ok:true,json:async()=>{throw SyntaxError('bad json');}}),async()=>({ok:true,json:async()=>({recipientName:'  '})}),async()=>({ok:true,json:async()=>({recipientName:123})})]){
    const result=await config.loadRomanceConfig('/config.json',fetcher);
    assert.equal(result.config.recipientName,'亲爱的');assert.ok(result.error);
  }
});
