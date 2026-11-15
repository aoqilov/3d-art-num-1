// node tools/place/shot.mjs [basic|pro] [tag] — the Onodera / "Intil" site west of block 1 from three fixed views
// (top, the street view of the gate from Kukcha Darvoza, the park from the south-east), for before / after.
// [views] — comma list (default all); HOUR=23 picks a time. Screens → $SHOTS (default .): pl_<tag>_<mode>_<view>.png.
// Needs the app served on :5173.
import { chromium } from 'playwright-core';
import path from 'node:path';

const mode = process.argv[2] ?? 'basic', tag = process.argv[3] ?? 'now';
const out = process.env.SHOTS ?? '.';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWS = {
  top: [-240, 330, 10, -240, 0, 9],
  gate: [-231, 2.2, -128, -233, 9, -55],
  park: [-130, 70, 150, -250, 0, -10],
  front: [-170, 40, -150, -240, 6, -60],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addInitScript((m) => { try { localStorage.setItem('om-mode', m); localStorage.setItem('om-render', '0'); localStorage.setItem('om-nearby', '0'); localStorage.setItem('om-panel', '0'); } catch {} }, mode);
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__complex?.outer && window.__complex?.court && window.__complex?.ctx?.glb, null, { timeout: 120000 });
await wait(mode === 'pro' ? 14000 : 8000);
if (process.env.HOUR) { await page.evaluate((h) => window.__complex.setHour(h, true), +process.env.HOUR); await wait(2000); }
for (const [name, v] of Object.entries(VIEWS)) {
  if (process.argv[4] && !process.argv[4].split(',').includes(name)) continue;
  await page.evaluate((v) => {
    const s = window.__complex; s.camera.position.set(v[0], v[1], v[2]); s.controls.target.set(v[3], v[4], v[5]);
    s.controls.update(); s.dirty = true;
  }, v);
  await wait(mode === 'pro' ? 6000 : 2500);
  await page.screenshot({ path: path.join(out, `pl_${tag}_${mode}_${name}.png`) });
  console.log('shot', name);
}
await browser.close();
