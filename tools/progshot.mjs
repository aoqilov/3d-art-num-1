// node tools/progshot.mjs [mode] — the live construction view: turned on from the settings menu (the menu should
// close, the side panel open with a card per block), tags over the blocks from three angles, pointing at a tag lights
// its card up, close-ups of facade-stage blocks (real model + scaffold net), a card click opens the block.
// Screens → $SHOTS (default .): pg_<mode>_<view>.png. Needs the app served on :5173.
import { chromium } from 'playwright-core';
import path from 'node:path';

const mode = process.argv[2] ?? 'basic';
const out = process.env.SHOTS ?? '.';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ viewport: { width: 1918, height: 967 } });
await ctx.addInitScript((m) => { try { localStorage.setItem('om-mode', m); localStorage.setItem('om-tools', '0'); localStorage.setItem('om-panel', '0'); } catch {} }, mode);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('ld')?.classList.contains('gone'), null, { timeout: 120000 });
await page.click('.c-set');
await wait(400);
await page.locator('.c-menu label.sw').filter({ hasText: 'Qurilish holati' }).click();
await wait(1500);
console.log('menu shut:', await page.locator('.c-menu.shut').count(), 'panel open:', await page.locator('aside#side-panel:not(.shut)').count(), 'cards in the panel:', await page.locator('.pcard').count());
const tags = () => page.evaluate(() => [...document.querySelectorAll('.bpill')].filter((e) => e.style.display !== 'none').length);
const cam = (c) => page.evaluate((c) => { const s = window.__complex; s.camera.position.set(...c.pos); s.controls.target.set(...c.target); s.controls.update(); s.dirty = true; }, c);
console.log('default: tags', await tags());
await page.screenshot({ path: path.join(out, `pg_${mode}_default.png`) });
const views = { past: { pos: [150, 70, 210], target: [0, 25, 0] }, yon: { pos: [-230, 120, 120], target: [0, 20, 0] },
  // close to the facade-stage blocks (5, 16, 18–20): the real model with the scaffold net, not the old massing boxes
  b5: { pos: [41, 45, 87], target: [-22, 25, 24] }, b18: { pos: [70, 50, -10], target: [10, 25, -75] } };
for (const [n, c] of Object.entries(views)) {
  await cam(c); await wait(2500);
  console.log(n + ': tags', await tags());
  await page.screenshot({ path: path.join(out, `pg_${mode}_${n}.png`) });
}
// pointing at a tag lights its card in the panel
await cam({ pos: [190, 170, 230], target: [0, 10, 10] }); await wait(1500);
const tag = page.locator('.bpill').filter({ visible: true }).nth(3);
const name = (await tag.innerText()).replace(/\s+/g, ' ');
await tag.hover(); await wait(800);
console.log('hover tag', name, '→ lit card:', (await page.locator('.pcard.on .hd b').innerText().catch(() => '-')));
await page.screenshot({ path: path.join(out, `pg_${mode}_hover.png`) });
// a click outside the menu closes it
await page.click('.c-set'); await wait(300);
await page.click('.brand'); await wait(300);
console.log('menu shut after an outside click:', await page.locator('.c-menu.shut').count());
// a card in the panel opens its block
await page.locator('.pcard').nth(4).click();
await page.waitForFunction(() => location.hash.startsWith('#blok-'), null, { timeout: 10000 }).catch(() => {});
console.log('card click →', await page.evaluate(() => location.hash));
await browser.close();
