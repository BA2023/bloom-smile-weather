import { cp, mkdir, rm, access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(await readFile(path.join(root, 'assets.lock.json'), 'utf8'));
for (const asset of lock.assets) {
  const content = await readFile(path.join(root, asset.path));
  if (content.byteLength !== asset.bytes || createHash('sha256').update(content).digest('hex') !== asset.sha256) {
    throw new Error(`Runtime asset mismatch: ${asset.path}. Run npm run setup.`);
  }
}
for (const asset of ['public/vendor/vision_bundle.mjs', 'public/vendor/wasm/vision_wasm_internal.wasm', 'public/vendor/wasm/vision_wasm_internal.js', 'public/models/face_landmarker.task']) {
  await access(path.join(root, asset));
}
await rm(path.join(root, 'dist'), { recursive: true, force: true });
await mkdir(path.join(root, 'dist'), { recursive: true });
await cp(path.join(root, 'public'), path.join(root, 'dist'), { recursive: true });
await cp(path.join(root, 'src'), path.join(root, 'dist/src'), { recursive: true });
for (const file of ['index.html', 'style.css']) await cp(path.join(root, file), path.join(root, 'dist', file));
console.log('Built static site in dist/ (including local model and WASM).');
