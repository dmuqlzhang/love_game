import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,stat,open} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {extractBundledFile} from './package-paths.mjs';
import {verifyMachO} from './mac-package.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const architecture=process.argv[2]||process.arch;
assert.ok(['arm64','x64'].includes(architecture),'Unsupported Mac architecture');
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const output=path.join(root,'release');
const bundle=path.join(output,architecture==='arm64'?'mac-arm64':'mac','灵绘.app');
const archive=path.join(bundle,'Contents/Resources/app.asar');
const plist=path.join(bundle,'Contents/Info.plist');
const info=key=>execFileSync('/usr/libexec/PlistBuddy',['-c','Print :'+key,plist],{encoding:'utf8'}).trim();
assert.equal(info('CFBundleShortVersionString'),version);
assert.ok(info('NSCameraUsageDescription').length>0,'Camera permission description missing');
const handle=await open(path.join(bundle,'Contents/MacOS',info('CFBundleExecutable')),'r');
try{
  const header=Buffer.alloc(32);await handle.read(header,0,32,0);verifyMachO(header,architecture);
}finally{await handle.close();}
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',bundle],{stdio:'inherit'});
async function filesUnder(directory){
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const full=path.join(directory,entry.name);
    if(entry.isDirectory())files.push(...await filesUnder(full));
    else if(entry.isFile())files.push(full);
  }
  return files;
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=[...await filesUnder(path.join(root,'dist')),...await filesUnder(path.join(root,'desktop'))];
for(const file of files){
  const relative=path.relative(root,file);
  assert.equal(hash(extractBundledFile(archive,relative)),hash(await readFile(file)),'Bundled resource mismatch: '+relative);
}
const bundled=JSON.parse(extractBundledFile(archive,'package.json'));
assert.equal(bundled.version,version);assert.equal(bundled.main,'desktop/main.js');
assert.equal(JSON.parse(extractBundledFile(archive,'dist/config.json')).recipientName,'亲爱的');
assert.ok(extractBundledFile(archive,'dist/models/hand_landmarker.task').length>1000000);
const artifacts=[];
for(const ext of ['dmg','zip']){
  const artifact=`LingHui-${version}-mac-${architecture}.${ext}`;
  const file=path.join(output,artifact);
  assert.ok((await stat(file)).size>1000000,'Mac artifact is unexpectedly small');
  const digest=createHash('sha256');
  for await(const chunk of createReadStream(file))digest.update(chunk);
  artifacts.push({artifact,bytes:(await stat(file)).size,sha256:digest.digest('hex')});
}
await writeFile(path.join(output,`SHA256SUMS-mac-${architecture}.txt`),artifacts.map(a=>a.sha256+'  '+a.artifact+'\n').join(''));
const report={version,architecture,verifiedResources:files.length,signature:'ad-hoc (not notarized)',artifacts};
await writeFile(path.join(output,`package-report-mac-${architecture}.json`),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
