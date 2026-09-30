import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function verifyReleaseTag(ref,version){
  if(ref.startsWith('refs/tags/')&&ref!=='refs/tags/v'+version){
    throw new Error('Release tag must match package version v'+version+'; received '+ref);
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  verifyReleaseTag(process.env.GITHUB_REF||'',version);
  console.log('Release version check passed: '+version);
}
