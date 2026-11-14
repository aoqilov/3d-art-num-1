// node tools/blockprobe.mjs [basic|pro] — opening #blok-1: when the page shows the block, when its surroundings
// arrive, long main-thread stalls; then the camera pushed into the block wall and into a neighbouring block:
// frame times and whether the WebGPU device survives. Pictures into $SHOTS.
import { chromium } from 'playwright-core';
import path from 'node:path';

const mode = process.argv[2] ?? 'pro', out = process.env.SHOTS ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addInitScript((m) => {
  try { localStorage.setItem('om-mode', m); localStorage.setItem('om-stats', '0'); } catch {}
  window.__t0 = performance.now(); window.__marks = []; window.__long = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true });
  // every frame interval
  window.__iv = []; let last = performance.now();
  const f = (t) => { window.__iv.push(Math.round(t - last)); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f);
}, mode);
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { const t = m.text(); if (/lost|device|error|uncaptured|validation/i.test(t)) logs.push(t.slice(0, 200)); });
page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
const T = Date.now();
await page.goto((process.env.BASE ?? 'http://localhost:5173/') + '#blok-1', { waitUntil: 'domcontentloaded', timeout: 90000 });
const at = async (label, fn, timeout = 120000) => {
  try { await page.waitForFunction(fn, null, { timeout, polling: 100 }); console.log(`${label}: ${((Date.now() - T) / 1000).toFixed(1)} s`); }
  catch { console.log(`${label}: not within ${timeout / 1000} s`); }
};
await at('block scene', () => !!window.__block);
await at('surroundings (houses, courtyard)', () => !!window.__block?.sur?.ctx && !!window.__block?.sur?.court);
await at('outer city', () => !!window.__block?.sur?.outer);
await new Promise((r) => setTimeout(r, 8000));
console.log(`settled: ${((Date.now() - T) / 1000).toFixed(1)} s`);
const lt = await page.evaluate(() => window.__long.slice());
console.log('long tasks > 200 ms (start s, ms):', lt.filter((x) => x[1] > 200).map((x) => `${(x[0] / 1000).toFixed(1)}:${x[1]}`).join(' '));
console.log('long tasks total:', lt.reduce((a, x) => a + x[1], 0), 'ms in', lt.length);
await page.screenshot({ path: path.join(out, `blok_${mode}_open.png`) });

// the camera into walls: the own block (target at the facade, camera 1 m in front / inside), a neighbour
const probe = async (name, pos, target) => {
  await page.evaluate(([p, t]) => { const b = window.__block; window.__iv.length = 0; b.camera.position.set(...p); b.controls.target.set(...t); b.controls.update(); b.dirty = true; }, [pos, target]);
  await new Promise((r) => setTimeout(r, 3000));
  const iv = await page.evaluate(() => window.__iv.slice());
  const s = iv.slice().sort((a, b) => a - b);
  console.log(`${name}: frames ${iv.length} in 3 s, median ${s[s.length >> 1] ?? '-'} ms, max ${s[s.length - 1] ?? '-'} ms`);
  await page.screenshot({ path: path.join(out, `blok_${mode}_${name}.png`) });
};
const b = await page.evaluate(() => { const b = window.__block; return { cam: b.camera.position.toArray(), tgt: b.controls.target.toArray(), min: b.controls.minDistance }; });
console.log('start view', JSON.stringify(b));
await probe('devor', [14.85, 8, -2], [14.85, 8, 6]);             // 2 m before the street facade, looking in
await probe('devor_ichi', [14.85, 8, 1.5], [14.85, 8, 9]);       // just inside the wall line
await probe('orbit_past', [-60, 3, -40], [14.85, 10, 9]);        // low, from the side where neighbours stand
// behind the neighbouring block 2 (complex frame), looking at this block: block 2 must vanish whole
const nb = await page.evaluate(() => { const B = window.__block.sur; const inv = B.toBlock; const p = (x, y, z) => { const v = { x, y, z }; const e = inv.elements; return [e[0] * x + e[4] * y + e[8] * z + e[12], y, e[2] * x + e[6] * y + e[10] * z + e[14]]; }; return { cam: p(-51.1 + 37.7 * 1.4, 18, -43 - 2.1 * 1.4), sosed: p(-51.1, 25, -43) }; });
await probe('sosed_blok_ortida', nb.cam, [0, 18, 0]);
console.log('console:', logs.slice(0, 8).join(' || ') || 'nothing');
await browser.close();
