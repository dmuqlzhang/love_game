import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const architecture=process.argv[2]||process.arch;
assert.ok(['arm64','x64'].includes(architecture),'Unsupported Mac architecture');
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const output=path.join(root,'release');
const report=path.join(output,`smoke-result-mac-${architecture}.json`);
await rm(report,{force:true});
const temp=await mkdtemp(path.join(tmpdir(),'linghui-mac-'));
try{
  // Launch the distributed ZIP, including its executable modes and framework links.
  execFileSync('/usr/bin/ditto',['-x','-k',path.join(output,`LingHui-${version}-mac-${architecture}.zip`),temp]);
  const app=path.join(temp,'灵绘.app');
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});
  const executable=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleExecutable',path.join(app,'Contents/Info.plist')],{encoding:'utf8'}).trim();
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  // Intel hosted runners lack a usable GPU. Only this explicit CI check selects the legacy OpenGL backend.
  const graphics=env.MAC_SMOKE_OPENGL==='1'?['--use-gl=angle','--use-angle=gl']:[];
  const result=spawnSync(path.join(app,'Contents/MacOS',executable),[...graphics,'--smoke-test','--smoke-result='+report],{env,encoding:'utf8',timeout:90000});
  if(result.stdout)console.log(result.stdout);
  if(result.stderr)console.error(result.stderr);
  if(result.error)throw result.error;
  assert.equal(result.status,0,'Packaged Mac app exited unsuccessfully');
  const data=JSON.parse(await readFile(report,'utf8'));
  assert.ok(data.ok&&data.modelInference,'Packaged Mac page/configuration/model smoke test failed');
  console.log(JSON.stringify(data,null,2));
  // Verify the DMG container as well; ZIP startup covers the same packaged app.
  execFileSync('/usr/bin/hdiutil',['verify',path.join(output,`LingHui-${version}-mac-${architecture}.dmg`)],{stdio:'inherit'});
}finally{await rm(temp,{recursive:true,force:true});}
