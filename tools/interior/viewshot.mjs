// node tools/interior/viewshot.mjs [apt] — the web app's 360° viewer (?pano=<apt>#blok-1) in each room, with a turn:
// shots/pano/<room>_<a|b>.png. Needs the app served on :5173 (npm run dev) after the panoramas are in public/pano.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const apt = process.argv[2] ?? '4';
const out = path.resolve('shots/pano');
mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('om-mode', 'basic'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:5173/?pano=${apt}#blok-1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('.pano360 .ptabs button', { timeout: 120000 });
await wait(2500);
const tabs = await page.$$eval('.pano360 .ptabs button', (b) => b.map((x) => x.textContent));
console.log('rooms', tabs);
for (let i = 0; i < tabs.length; i++) {
  await page.click(`.pano360 .ptabs button:nth-child(${i + 1})`);
  await wait(1800);
  await page.screenshot({ path: path.join(out, `${i}_${tabs[i]}_a.png`) });
  const spots = await page.$$eval('.pano360 .pspot span', (s) => s.map((x) => x.textContent));
  // a turn by dragging
  const c = await page.$('.pano360 canvas');
  const b = await c.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 600, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await wait(600);
  await page.screenshot({ path: path.join(out, `${i}_${tabs[i]}_b.png`) });
  console.log(tabs[i], 'markers:', spots.join(', ') || '—');
}
await browser.close();
