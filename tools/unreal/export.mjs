// node tools/unreal/export.mjs [outDir] — the complex view (Ultra materials) as files for Unreal:
// world.glb, a_*.glb, scene.json (see page.ts). Needs the dev server (npm run dev) on :5173.
// Default outDir: ../ObodMaskanUE/Import (next to this repo).
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] ?? path.join(here, '../../../ObodMaskanUE/Import'));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const bundle = path.join(here, 'out/page.js');
await build({ entryPoints: [path.join(here, 'page.ts')], bundle: true, format: 'iife', outfile: bundle, target: 'es2022', logLevel: 'warning' });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => { try { localStorage.setItem('om-mode', 'pro'); localStorage.setItem('om-stats', '0'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log('page:', m.text().slice(0, 200)); });
const open = new Set();
await page.exposeFunction('__unrealSave', (name, b64, last) => {
  const f = path.join(out, name);
  if (!open.has(name)) { writeFileSync(f, ''); open.add(name); }
  appendFileSync(f, Buffer.from(b64, 'base64'));
  if (last) console.log('  ' + name);
});
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 90000 });
// everything loaded: the outer city, the courtyard, the block model, the trees
const t0 = Date.now();
await page.waitForFunction(() => {
  const c = window.__complex;
  // the Blender model has arrived when its baked-occlusion UVs are not the placeholder's zeros
  const uvb = c?.inst?.geometry?.attributes?.uvb?.array;
  let real = false;
  if (uvb) for (let i = 0; i < uvb.length && !real; i += 97) real = uvb[i] !== 0;
  return c && c.outer && c.court && c.yard && real && c.ctx?.glb?.tiles?.size > 0;
}, null, { timeout: 180000, polling: 1000 });
await new Promise((r) => setTimeout(r, 15000));     // the PBR textures and the yard models
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(0)} s, exporting to ${out}`);
await page.addScriptTag({ path: bundle });
const log = await page.evaluate(() => window.__unrealExport());
console.log(log.join('\n'));
await browser.close();
