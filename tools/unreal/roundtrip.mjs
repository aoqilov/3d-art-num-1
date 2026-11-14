// node tools/unreal/roundtrip.mjs <camera> [hour] — the web app's picture with the exported a_blok.glb in place of
// the block model (export check): ../ObodMaskanUE/Renders/web_<camera>_<hour>_roundtrip.png
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const ue = path.resolve(here, '../../../ObodMaskanUE');
const [cam = 'balkon', hour = '16'] = process.argv.slice(2);
mkdirSync(path.resolve(here, '../../dist/_ue'), { recursive: true });
copyFileSync(path.join(ue, 'Import/a_blok.glb'), path.resolve(here, '../../dist/_ue/a_blok.glb'));
const bundle = path.join(here, 'out/roundtrip.js');
await build({ entryPoints: [path.join(here, 'roundtrip.ts')], bundle: true, format: 'iife', outfile: bundle, logLevel: 'warning' });
const c = { ...JSON.parse(readFileSync(path.join(here, 'cameras.json'), 'utf8')) }[cam];

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('om-mode', 'pro'); localStorage.setItem('om-stats', '0'); } catch {} });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const a = window.__complex?.inst?.geometry?.attributes?.uvb?.array; if (!a) return false; for (let i = 0; i < a.length; i += 97) if (a[i]) return true; return false; }, null, { timeout: 120000, polling: 500 });
await new Promise((r) => setTimeout(r, 10000));
await page.getByText(`${hour.padStart(2, '0')}:00`, { exact: true }).first().click();
await page.addScriptTag({ path: bundle });
console.log(await page.evaluate(() => window.__roundtrip('_ue/a_blok.glb')));
await page.evaluate((c) => {
  const cv = document.querySelector('canvas');
  for (const el of document.body.querySelectorAll('*')) if (el !== cv && !el.contains(cv)) el.style.visibility = 'hidden';
  const s = window.__complex; s.overlay.visible = false;
  Object.assign(s.controls, { maxPolarAngle: Math.PI, minDistance: 0, maxDistance: 1e5 });
  s.camera.fov = c.vfov; s.camera.updateProjectionMatrix();
  s.camera.position.set(...c.pos); s.controls.target.set(...c.target); s.controls.update(); s.dirty = true;
}, c);
await new Promise((r) => setTimeout(r, 5000));
await (await page.$('canvas')).screenshot({ path: path.join(ue, `Renders/web_${cam}_${hour}_roundtrip.png`) });
await browser.close();
