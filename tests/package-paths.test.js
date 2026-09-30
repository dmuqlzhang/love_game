import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

// Run the installed ASAR directory lookup with Windows path semantics on every OS.
const require=createRequire(import.meta.url);
const asarEntry=require.resolve('@electron/asar');
const filesystemPath=path.join(path.dirname(asarEntry),'filesystem.js');
const dependencyRequire=createRequire(filesystemPath);
const paths=await import('../scripts/package-paths.mjs').catch(()=>({}));

for(const platform of ['win32','posix']){
  test('bundled resources resolve with '+platform+' ASAR directory semantics',()=>{
    assert.equal(typeof paths.extractBundledFile,'function');
    const exports={};
    vm.runInNewContext(readFileSync(filesystemPath,'utf8'),{
      exports,require:name=>name==='path'?path[platform]:dependencyRequire(name),Buffer,
    },{filename:filesystemPath});
    const filesystem=new exports.Filesystem('.');
    const resources=['dist/assets/check-example.js','dist/config.json','dist/models/hand_landmarker.task','desktop/main.js','package.json'];
    for(const resource of resources){
      let node=filesystem.header;
      const parts=resource.split('/');
      for(const part of parts.slice(0,-1))node=node.files[part]??=( {files:{}} );
      node.files[parts.at(-1)]={size:123,offset:'0'};
    }
    const reader={extractFile:(_archive,file)=>filesystem.getFile(file)};
    for(const resource of resources){
      assert.equal(paths.extractBundledFile('app.asar',resource,reader,path[platform]).size,123,resource);
    }
    assert.throws(()=>paths.extractBundledFile('app.asar','dist/assets/missing.js',reader,path[platform]),/not found/);
  });
}
