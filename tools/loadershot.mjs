// node tools/loadershot.mjs [mode] — the loading clouds (index.html #ld, src/loader.ts): closing at the start, closed
// over the spinner, parting when the view is ready; then the same into block 1 and back. Logs when the clouds part.
// Screens → $SHOTS (default .): ld_<mode>_<step>.png. Needs the app served on :5173.
import { chromium } from 'playwright-core';
import path from 'node:path';

const mode = process.argv[2] ?? 'basic';
const out = process.env.SHOTS ?? '.';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addInitScript((m) => {
  try { localStorage.setItem('om-mode', m); } catch {}
  window.__ldLog = [];
  new MutationObserver(() => { const e = document.getElementById('ld'); if (e) window.__ldLog.push([Math.round(performance.now()), e.className || 'closed']); })
    .observe(document, { attributes: true, subtree: true, attributeFilter: ['class'] });
}, mode);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const shot = (n) => page.screenshot({ path: path.join(out, `ld_${mode}_${n}.png`) });
const t0 = Date.now();
await page.goto('http://localhost:5173/', { waitUntil: 'commit' });
await wait(450); await shot('1_closing');
await wait(1000); await shot('2_closed');
await page.waitForFunction(() => document.getElementById('ld')?.classList.contains('open'), null, { timeout: 120000 });
console.log('parting after', ((Date.now() - t0) / 1000).toFixed(1), 's');
await wait(550); await shot('3_parting');
await page.waitForFunction(() => document.getElementById('ld')?.classList.contains('gone'), null, { timeout: 10000 });
await wait(300); await shot('4_open');
// into block 1 and back
const t1 = Date.now();
await page.evaluate(() => { location.hash = '#blok-1'; });
await wait(500); await shot('5_block_closing');
await wait(900); await shot('6_block_closed');
await page.waitForFunction(() => document.getElementById('ld')?.classList.contains('open'), null, { timeout: 120000 });
console.log('block: parting after', ((Date.now() - t1) / 1000).toFixed(1), 's');
await page.waitForFunction(() => document.getElementById('ld')?.classList.contains('gone'), null, { timeout: 10000 });
await wait(300); await shot('7_block_open');
const t2 = Date.now();
await page.goBack();
await page.waitForFunction(() => document.getElementById('ld')?.classList.contains('gone'), null, { timeout: 120000 });
console.log('back to the complex: open after', ((Date.now() - t2) / 1000).toFixed(1), 's');
console.log('log:', JSON.stringify(await page.evaluate(() => window.__ldLog)));
await browser.close();
