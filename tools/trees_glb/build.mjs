// node tools/trees_glb/build.mjs  →  public/trees/<kind>.glb   (needs playwright + esbuild; run once, GLBs are committed)
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');   // globally installed
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const r = await build({ entryPoints: [path.join(here, 'gen.js')], bundle: true, format: 'iife', write: false, loader: { '.png': 'dataurl', '.jpg': 'dataurl' }, logLevel: 'error' });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.setContent('<!doctype html><body></body>');
await p.addScriptTag({ content: r.outputFiles[0].text });
await p.waitForFunction('window.ready');
for (const kind of await p.evaluate('window.KINDS')) {
  const { b64, stats } = await p.evaluate((k) => window.genKind(k), kind);
  const buf = Buffer.from(b64, 'base64');
  fs.writeFileSync(path.join(root, 'public/trees', kind + '.glb'), buf);
  console.log(kind, (buf.length / 1024 | 0) + ' KB', JSON.stringify(stats));
}
await b.close();
