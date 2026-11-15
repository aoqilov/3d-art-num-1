// node tools/prodprobe.mjs [url] [mode] [headful] — open the deployed site like a visitor (fresh profile, no cache):
// console errors, failed requests, the loading clouds' state over time, and a screen at the end → $SHOTS/prod_<mode>.png
import { chromium } from 'playwright-core';
import path from 'node:path';

const url = process.argv[2] ?? 'https://obod-maskan-3d.vercel.app/';
const mode = process.argv[3] ?? 'default';
const headful = process.argv[4] === 'headful';
const out = process.env.SHOTS ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: !headful, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
if (mode !== 'default') await ctx.addInitScript((m) => { try { localStorage.setItem('om-mode', m); } catch {} }, mode);
const page = await ctx.newPage();
const t0 = Date.now(), at = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(at(), m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log(at(), 'pageerror', e.message.slice(0, 300)));
page.on('requestfailed', (r) => console.log(at(), 'failed', r.url(), r.failure()?.errorText));
page.on('response', (r) => { if (r.status() >= 400) console.log(at(), 'http', r.status(), r.url()); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
let last = '';
for (let i = 0; i < 60; i++) {
  const s = await page.evaluate(() => {
    const e = document.getElementById('ld');
    return `ld="${e?.className ?? 'none'}" gpu=${window.__ldGpu} root=${document.getElementById('root')?.children.length} canvas=${document.querySelectorAll('.viewport canvas').length} complex=${!!window.__complex} block=${!!window.__block}`;
  }).catch((e) => 'eval error ' + e.message);
  if (s !== last) { console.log(at(), s); last = s; }
  if (s.includes('gone')) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await page.screenshot({ path: path.join(out, `prod_${mode}.png`) });
await browser.close();
