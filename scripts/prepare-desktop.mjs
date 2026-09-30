import {readFile,writeFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const file of ['dist/index.html','dist/hand-worker.js','dist/vendor/mediapipe/vision_bundle.js','dist/vendor/mediapipe/wasm/vision_wasm_internal.wasm','dist/models/hand_landmarker.task']){
  if(!(await stat(path.join(root,file))).size)throw new Error('Missing desktop resource: '+file);
}
// Release builds use a neutral recipient; the local browser config is unchanged.
await writeFile(path.join(root,'dist/config.json'),await readFile(path.join(root,'desktop/default-config.json')));
console.log('Desktop resources ready; release recipient defaults to 亲爱的.');
