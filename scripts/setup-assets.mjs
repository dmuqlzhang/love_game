import { mkdir, cp, stat, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = path.join(root, 'public/vendor/mediapipe');
const models = path.join(root, 'public/models');
await mkdir(vendor, { recursive: true });
await mkdir(models, { recursive: true });
const source = path.join(root, 'node_modules/@mediapipe/tasks-vision');
await cp(path.join(source, 'vision_bundle.cjs'), path.join(vendor, 'vision_bundle.js'));
await cp(path.join(source, 'wasm'), path.join(vendor, 'wasm'), { recursive: true });
const model = path.join(models, 'hand_landmarker.task');
const manifestPath = path.join(models, 'manifest.json');
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
let valid = false;
try {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const bytes = await readFile(model);
  valid = manifest.sha256 === createHash('sha256').update(bytes).digest('hex') && bytes.length > 1000000;
} catch { /* first install */ }
if (!valid) {
  console.log('正在下载 Google 官方手部模型（约 8 MB）…');
  const response = await fetch(modelUrl, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`模型下载失败：HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000000) throw new Error('模型文件长度异常，未保存。');
  await writeFile(model, bytes);
  await writeFile(manifestPath, JSON.stringify({ source: modelUrl, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
}
console.log(`本地资源已准备好，模型 ${(await stat(model)).size} 字节。运行 npm run dev 启动。`);
