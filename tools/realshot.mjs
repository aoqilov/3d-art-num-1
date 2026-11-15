// node tools/realshot.mjs <tag> [views] — the complex (Ultra, 16:00) from fixed views for the realism work, before / after.
// Views: havo (aerial, like the competitor's fly-over), baland (high, the horizon), hovli (courtyard, eye level),
// kocha (street, eye level), blok (a block close). [views] = comma list. HOUR=… another time, MODE=basic.
// → shots/real/<view>_<tag>.png (shots/ is git-ignored). Needs the app served on :5173 (npm run dev).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const tag = process.argv[2] ?? 'now', only = process.argv[3]?.split(',');
const hour = Number(process.env.HOUR ?? 16), mode = process.env.MODE ?? 'pro';
const out = path.resolve('shots/real');
mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// [position, target, vertical fov] in the app's metres (Y up)
export const VIEWS = {
  havo: [[260, 230, -180], [5, 0, 20], 32],
  baland: [[-700, 420, -650], [0, 0, 0], 45],
  hovli: [[40, 1.7, 55], [-15, 14, 98], 50],
  kocha: [[-45, 1.7, -133], [15, 24, -85], 55],
  blok: [[-22, 10, -122], [4, 20, -94], 50],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addInitScript((m) => { try { for (const [k, v] of [['om-mode', m], ['om-render', '0'], ['om-nearby', '0'], ['om-panel', '0'], ['om-stats', '0']]) localStorage.setItem(k, v); } catch {} }, mode);
const page = await ctx.newPage();
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /PRO renderer/.test(t)) console.log('console:', t.slice(0, 200)); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__complex?.outer && window.__complex?.court && window.__complex?.ctx?.glb, null, { timeout: 180000 });
await wait(mode === 'pro' ? 20000 : 8000);
await page.evaluate((h) => {
  const s = window.__complex;
  if (s.getHour() !== h) s.setHour(h, true);
  const cv = document.querySelector('.viewport canvas');
  for (const el of document.body.querySelectorAll('*')) if (el !== cv && !el.contains(cv)) el.style.visibility = 'hidden';
  s.overlay.visible = false;
}, hour);
await wait(3000);
// PRE='js' runs in the page before the pictures (tuning: PRE='__roomGlass.glow.value = 0.2')
if (process.env.PRE) { await page.evaluate((js) => { (0, eval)(js); window.__complex.dirty = true; }, process.env.PRE); await wait(1500); }
for (const [name, [p, t, fov]] of Object.entries(VIEWS)) {
  if (only && !only.includes(name)) continue;
  await page.evaluate(([p, t, fov]) => {
    const s = window.__complex;
    Object.assign(s.controls, { maxPolarAngle: Math.PI, minDistance: 0, maxDistance: 1e5 });
    s.camera.fov = fov; s.camera.updateProjectionMatrix();
    s.camera.position.set(...p); s.controls.target.set(...t); s.controls.update();
    s.dirty = true;
  }, [p, t, fov]);
  await wait(mode === 'pro' ? 7000 : 3000);                 // loads around the view, the frame settles (TRAA)
  const canvas = await page.$('.viewport canvas');
  await canvas.screenshot({ path: path.join(out, `${name}_${tag}.png`) });
  console.log('shot', name);
}
await browser.close();
