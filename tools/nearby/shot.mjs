// node tools/nearby/shot.mjs [mode] — the "Yaqinda" panel at work: closed tabs, open, 5 km, a row clicked (the camera
// flies), a pin clicked in the view, the Render panel opened over it. Screens → $SHOTS (default .): nb_<mode>_<step>.png
// Needs the app served on :5173 (npm run dev / npm run serve).
import { chromium } from 'playwright-core';
import path from 'node:path';

const mode = process.argv[2] ?? 'basic';
const out = process.env.SHOTS ?? '.';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addInitScript((m) => { try { localStorage.setItem('om-mode', m); localStorage.setItem('om-render', '0'); localStorage.setItem('om-nearby', '0'); } catch {} }, mode);
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__complex?.outer && window.__complex?.court, null, { timeout: 120000 });
await wait(8000);
const shot = async (n) => { await page.screenshot({ path: path.join(out, `nb_${mode}_${n}.png`) }); };
const box = async (sel) => { const b = await page.locator(sel).boundingBox(); return b && [b.x, b.y, b.width, b.height].map(Math.round).join(','); };
const cam = () => page.evaluate(() => { const s = window.__complex; const p = s.camera.position, t = s.controls.target; return [p.x, p.y, p.z, t.x, t.y, t.z].map(Math.round).join(','); });

console.log('tabs closed: render', await box('.rs-tab'), 'nearby', await box('.nb-tab'));
await shot('1_closed');
await page.click('.nb-tab'); await wait(2500);
console.log('nearby open: render tab', await box('.rs-tab'), 'nearby tab', await box('.nb-tab'), 'panel', await box('.nb-panel'));
console.log('summary:', await page.locator('.nb-sum').innerText());
await shot('2_open_1km');
const radius = (r) => page.locator('.nb-radius button').filter({ hasText: new RegExp(`^${r}$`) }).click();
await radius('5 km'); await wait(5000);
console.log('5 km: camera', await cam(), 'rows', await page.locator('.nb-row').count());
console.log('summary:', await page.locator('.nb-sum').innerText());
await shot('3_5km');
const far = page.locator('.nb-list section').filter({ has: page.locator('h5', { hasText: 'Metro bekati' }) }).locator('.nb-row').first();
if (await far.count()) { console.log('far row:', (await far.innerText()).replace(/\n/g, ' | ')); await far.click(); await wait(5000); console.log('camera', await cam()); await shot('3b_far'); }
await radius('1 km'); await wait(4000);
const first = page.locator('.nb-row').first();
console.log('row:', (await first.innerText()).replace(/\n/g, ' | '));
await first.click(); await wait(5000);
console.log('after row click: camera', await cam());
await shot('4_row');
await radius('1 km'); await wait(4000);
// a pin in the view: the first non-selected place on screen
const pin = await page.evaluate(() => {
  const s = window.__complex, l = s.nearby, r = s.renderer.domElement.getBoundingClientRect();
  for (const { p, s: sp } of l.items) {
    if (p.id === l.selected) continue;
    const v = sp.position.clone().project(s.camera);
    const x = r.left + (v.x + 1) / 2 * r.width, y = r.top + (1 - v.y) / 2 * r.height;
    if (v.z < 1 && x > 420 && x < r.width - 60 && y > 120 && y < r.height - 40) return { x, y, name: p.name || p.sub, id: p.id };
  }
  return null;
});
console.log('pin:', pin);
if (pin) {
  await page.mouse.click(pin.x, pin.y); await wait(5000);
  console.log('after pin click: selected row', (await page.locator('.nb-row.on').innerText().catch(() => '-')).replace(/\n/g, ' | '), 'camera', await cam());
  await shot('5_pin');
}
await page.click('.rs-tab'); await wait(1500);
console.log('render opened: nearby shut?', await page.locator('.nb-dock.shut').count(), 'render tab', await box('.rs-tab'), 'nearby tab', await box('.nb-tab'));
await shot('6_render');
await page.click('.nb-tab'); await wait(1500);
console.log('nearby again: render shut?', await page.locator('.rs-dock.shut').count());
await browser.close();
