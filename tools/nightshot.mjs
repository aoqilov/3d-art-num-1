// node tools/nightshot.mjs [hour] [tag] — the complex at one time stop in both modes (Yengil / Ultra), from the
// default view and from street level (sky in the frame): <scratch>/sky_<mode>_<view>_<hour>_<tag>.png
// Needs the app served on :5173 (npm run dev / npm run serve).
import { chromium } from 'playwright-core';
import path from 'node:path';

const hour = Number(process.argv[2] ?? 23), tag = process.argv[3] ?? 'a';
const out = process.env.SHOTS ?? '.';
const VIEWS = {
  umumiy: { pos: [190, 170, 230], target: [0, 10, 10], vfov: 42 },
  kocha: { pos: [-45, 1.7, -133], target: [15, 24, -85], vfov: 55 },
  kocha2: { pos: [-15, 1.7, -140], target: [15, 24, -85], vfov: 55 },     // away from the lamp above the first
};
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
for (const mode of ['basic', 'pro']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem('om-mode', m); localStorage.setItem('om-stats', '0'); } catch {} }, mode);
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__complex?.outer && window.__complex?.court, null, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 12000));
  await page.getByText(`${String(hour).padStart(2, '0')}:00`, { exact: true }).first().click();
  await new Promise((r) => setTimeout(r, 4000));
  await page.evaluate(() => {
    const cv = document.querySelector('.viewport canvas');
    for (const el of document.body.querySelectorAll('*')) if (el !== cv && !el.contains(cv)) el.style.visibility = 'hidden';
    window.__complex.overlay.visible = false;
  });
  for (const [name, c] of Object.entries(VIEWS)) {
    await page.evaluate((c) => {
      const s = window.__complex;
      Object.assign(s.controls, { maxPolarAngle: Math.PI, minDistance: 0, maxDistance: 1e5 });
      s.camera.fov = c.vfov; s.camera.updateProjectionMatrix();
      s.camera.position.set(...c.pos); s.controls.target.set(...c.target); s.controls.update(); s.dirty = true;
    }, c);
    await new Promise((r) => setTimeout(r, 4000));
    await (await page.$('.viewport canvas')).screenshot({ path: path.join(out, `sky_${mode}_${name}_${hour}_${tag}.png`) });
  }
  await ctx.close();
  console.log(mode, 'done');
}
await browser.close();
