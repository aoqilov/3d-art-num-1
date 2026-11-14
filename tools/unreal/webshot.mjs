// node tools/unreal/webshot.mjs [hour] — the web app (Ultra) from the cameras of scene.json, for side-by-side
// pictures with Unreal. Writes ../ObodMaskanUE/Renders/web_<camera>_<hour>.png. Needs the dev server on :5173.
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const ue = path.resolve(here, '../../../ObodMaskanUE');
const hour = Number(process.argv[2] ?? 10);
const scene = JSON.parse(readFileSync(path.join(ue, 'Import/scene.json'), 'utf8'));
mkdirSync(path.join(ue, 'Renders'), { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('om-mode', 'pro'); localStorage.setItem('om-stats', '0'); } catch {} });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__complex?.outer && window.__complex?.court, null, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 20000));
// the hour through the app's own button (its state and the scene agree), then the picture alone
await page.getByText(`${String(hour).padStart(2, '0')}:00`, { exact: true }).first().click();
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => {
  const cv = document.querySelector('.viewport canvas');
  for (const el of document.body.querySelectorAll('*')) if (el !== cv && !el.contains(cv)) el.style.visibility = 'hidden';
  window.__complex.overlay.visible = false;
});
// the Unreal level's cameras: scene.json's and cameras.json's; argv[3] = comma-separated names to take only those
const extra = JSON.parse(readFileSync(path.join(here, 'cameras.json'), 'utf8'));
const only = process.argv[3]?.split(',');
const cams = Object.entries({ ...scene.cameras, ...extra }).filter(([n]) => n !== 'joriy' && !n.startsWith('_') && (!only || only.includes(n)));
for (const [name, c] of cams) {
  await page.evaluate(([c, h]) => {
    const s = window.__complex;
    if (s.getHour() !== h) s.setHour(h, true);
    // eye-level views look up: free the orbit limits so they keep the camera where it is put
    Object.assign(s.controls, { maxPolarAngle: Math.PI, minDistance: 0, maxDistance: 1e5 });
    s.camera.fov = c.vfov; s.camera.updateProjectionMatrix();
    s.camera.position.set(...c.pos); s.controls.target.set(...c.target); s.controls.update();
    s.dirty = true;
  }, [c, hour]);
  await new Promise((r) => setTimeout(r, 4000));         // the frame settles (TRAA)
  const canvas = await page.$('.viewport canvas');
  await canvas.screenshot({ path: path.join(ue, `Renders/web_${name}_${hour}.png`) });
  console.log('web', name);
}
await browser.close();
