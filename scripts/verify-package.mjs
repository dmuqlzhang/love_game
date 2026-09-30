import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,open,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {extractBundledFile} from './package-paths.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const artifact='LingHui-'+version+'-win-x64.exe';
const output=path.join(root,'release');
const archive=path.join(output,'win-unpacked/resources/app.asar');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

async function verifyPE(file,expectedMachine){
  const handle=await open(file,'r');
  try {
    const bytes=Buffer.alloc(4096);
    await handle.read(bytes,0,bytes.length,0);
    assert.equal(bytes.toString('ascii',0,2),'MZ','Missing Windows executable header');
    const offset=bytes.readUInt32LE(60);
    assert.ok(offset+6<bytes.length,'Invalid PE offset');
    assert.equal(bytes.readUInt32LE(offset),0x4550,'Missing PE signature');
    if(expectedMachine)assert.equal(bytes.readUInt16LE(offset+4),expectedMachine,'Wrong Windows architecture');
  } finally {await handle.close();}
}

async function filesUnder(directory){
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const full=path.join(directory,entry.name);
    if(entry.isDirectory())files.push(...await filesUnder(full));
    else if(entry.isFile())files.push(full);
  }
  return files;
}

await verifyPE(path.join(output,artifact));
await verifyPE(path.join(output,'win-unpacked/LingHui.exe'),0x8664);
const files=[...await filesUnder(path.join(root,'dist')),...await filesUnder(path.join(root,'desktop'))];
for(const file of files){
  const relative=path.relative(root,file).split(path.sep).join('/');
  assert.equal(hash(extractBundledFile(archive,relative)),hash(await readFile(file)),'Bundled resource mismatch: '+relative);
}
const bundledPackage=JSON.parse(extractBundledFile(archive,'package.json').toString());
assert.equal(bundledPackage.version,version);
assert.equal(bundledPackage.main,'desktop/main.js');
assert.equal(JSON.parse(extractBundledFile(archive,'dist/config.json')).recipientName,'亲爱的');
assert.ok(extractBundledFile(archive,'dist/models/hand_landmarker.task').length>1000000,'Hand model missing');
const digest=createHash('sha256');
for await(const chunk of createReadStream(path.join(output,artifact)))digest.update(chunk);
const sha256=digest.digest('hex');
await writeFile(path.join(output,'SHA256SUMS.txt'),sha256+'  '+artifact+String.fromCharCode(10));
const report={artifact,version,architecture:'x64',bytes:(await stat(path.join(output,artifact))).size,verifiedResources:files.length,sha256};
await writeFile(path.join(output,'package-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
