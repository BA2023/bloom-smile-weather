import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const lock = JSON.parse(await readFile(path.join(root, 'assets.lock.json'), 'utf8'));
const digest = data => createHash('sha256').update(data).digest('hex');

for (const asset of lock.assets) {
  const destination = path.resolve(root, asset.path);
  if (!destination.startsWith(root + path.sep) || !asset.url.startsWith('https://')) throw new Error('Invalid asset declaration');
  try {
    const existing = await readFile(destination);
    if (existing.byteLength === asset.bytes && digest(existing) === asset.sha256) {
      console.log(`Verified ${asset.path}`);
      continue;
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }

  const temporary = `${destination}.download-${process.pid}`;
  let failure;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`Downloading ${asset.path} (${attempt}/3)`);
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(120000), redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${asset.path}`);
      const data = Buffer.from(await response.arrayBuffer());
      if (data.byteLength !== asset.bytes || digest(data) !== asset.sha256) throw new Error(`Size / SHA-256 mismatch for ${asset.path}`);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(temporary, data);
      await rename(temporary, destination);
      failure = null;
      break;
    } catch (error) {
      failure = error;
      await rm(temporary, { force: true });
      if (attempt < 3) await delay(attempt * 1000);
    }
  }
  if (failure) throw failure;
}
console.log('All runtime assets match assets.lock.json. Run npm test and npm run build.');
