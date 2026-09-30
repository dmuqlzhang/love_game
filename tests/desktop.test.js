import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const desktop=await import('../desktop/runtime.js').catch(()=>({}));

test('only the app main frame can request video or canvas fullscreen permissions',()=>{
  assert.equal(typeof desktop.allowPermission,'function');
  const request={permission:'media',requestUrl:'http://127.0.0.1:43210/',origin:'http://127.0.0.1:43210',mediaTypes:['video'],isMainFrame:true};
  assert.equal(desktop.allowPermission(request),true);
  for(const override of [{mediaTypes:['audio']},{mediaTypes:['video','audio']},{mediaTypes:[]},{isMainFrame:false},{requestUrl:'https://example.com'},{permission:'notifications'}]){
    assert.equal(desktop.allowPermission({...request,...override}),false);
  }
  assert.equal(desktop.allowPermission({...request,permission:'fullscreen'}),true);
});

async function fixture(t){
  const root=await mkdtemp(path.join(tmpdir(),'linghui-desktop-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const assetDirectory=path.join(root,'dist');
  await mkdir(assetDirectory);
  await writeFile(path.join(assetDirectory,'index.html'),'<h1>灵绘</h1>');
  await writeFile(path.join(assetDirectory,'model.wasm'),Buffer.from([0,97,115,109]));
  const configPath=path.join(root,'config.json');
  await writeFile(configPath,JSON.stringify({recipientName:'小夏'}));
  return {root,assetDirectory,configPath,origin:'http://127.0.0.1:43210'};
}

test('desktop config is created once and never overwrites existing edits or malformed JSON',async(t)=>{
  assert.equal(typeof desktop.ensureConfig,'function');
  const {root}=await fixture(t);
  const file=path.join(root,'new','config.json');
  await desktop.ensureConfig(file,{recipientName:'亲爱的'});
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')),{recipientName:'亲爱的'});
  await writeFile(file,'user editing unfinished JSON');
  await desktop.ensureConfig(file,{recipientName:'覆盖错误'});
  assert.equal(await readFile(file,'utf8'),'user editing unfinished JSON');
});

test('portable config lives beside the exe, other runs use userData',()=>{
  assert.equal(typeof desktop.resolveConfigPath,'function');
  assert.equal(desktop.resolveConfigPath({portableDirectory:'/portable',userData:'/settings'}),path.join('/portable','config.json'));
  assert.equal(desktop.resolveConfigPath({userData:'/settings'}),path.join('/settings','config.json'));
});

test('desktop resources preserve WASM MIME and reload the editable config on each request',async(t)=>{
  assert.equal(typeof desktop.assetResponse,'function');
  const options=await fixture(t);
  const request=url=>({url,method:'GET',headers:{host:'127.0.0.1:43210'}});
  const index=await desktop.assetResponse(request('/'),options);
  assert.equal(index.status,200);assert.ok(index.body.toString().includes('灵绘'));
  assert.match(index.headers['Content-Security-Policy'],/wasm-unsafe-eval/);
  const wasm=await desktop.assetResponse(request('/model.wasm'),options);
  assert.equal(wasm.headers['Content-Type'],'application/wasm');
  const first=await desktop.assetResponse(request('/config.json'),options);
  assert.equal(JSON.parse(first.body).recipientName,'小夏');
  await writeFile(options.configPath,JSON.stringify({recipientName:'阿宁'}));
  const next=await desktop.assetResponse(request('/config.json'),options);
  assert.equal(JSON.parse(next.body).recipientName,'阿宁');
  assert.equal(next.headers['Cache-Control'],'no-store');
});

test('desktop server rejects external hosts, writes and paths outside bundled assets',async(t)=>{
  assert.equal(typeof desktop.assetResponse,'function');
  const options=await fixture(t);
  for(const url of ['/../config.json','/%2e%2e/config.json','/..%5cconfig.json','/%00','/%broken']){
    const result=await desktop.assetResponse({url,method:'GET',headers:{host:'127.0.0.1:43210'}},options);
    assert.ok(result.status>=400,url);
  }
  const host=await desktop.assetResponse({url:'/',method:'GET',headers:{host:'evil.example'}},options);
  assert.equal(host.status,403);
  const post=await desktop.assetResponse({url:'/config.json',method:'POST',headers:{host:'127.0.0.1:43210'}},options);
  assert.equal(post.status,405);
  const missing=await desktop.assetResponse({url:'/missing.js',method:'GET',headers:{host:'127.0.0.1:43210'}},options);
  assert.equal(missing.status,404);
  if(process.platform!=='win32'){
    await symlink(options.configPath,path.join(options.assetDirectory,'escape.json'));
    const escape=await desktop.assetResponse({url:'/escape.json',method:'GET',headers:{host:'127.0.0.1:43210'}},options);
    assert.equal(escape.status,403);
  }
});
