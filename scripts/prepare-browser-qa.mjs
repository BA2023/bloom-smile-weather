import { mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
const face = process.argv[2];
if (!face) throw new Error('Pass an absolute path to a local portrait PNG. Build the site first.');
await mkdir('dist/__qa', { recursive: true });
for (const [source, target] of [['browser-harness.html','index.html'],['visual-harness.html','visual.html'],['responsive-harness.html','responsive.html']]) {
  await cp(path.join('tests', source), path.join('dist/__qa', target));
}
await cp(face, 'dist/__qa/face.png');
console.log('Local QA only: /__qa/, /__qa/visual.html, /__qa/responsive.html. A clean build removes all fixtures.');
