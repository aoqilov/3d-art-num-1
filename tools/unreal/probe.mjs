// node tools/unreal/probe.mjs — what the complex scene holds (meshes, instanced meshes, triangles, materials),
// to plan the Unreal export. Needs the dev server (npm run dev) on :5173.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => { try { localStorage.setItem('om-mode', 'pro'); localStorage.setItem('om-stats', '0'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 40000));
const out = await page.evaluate(() => {
  const c = window.__complex, scene = c.scene;
  const rows = []; const mats = new Map();
  const tri = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const path = (o) => { const p = []; for (let q = o; q && q !== scene; q = q.parent) p.unshift(q.name || q.type); return p.slice(0, 3).join('/'); };
  scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) mats.set(m.uuid, m);
    rows.push({ p: path(o), inst: o.isInstancedMesh ? o.count : 0, tri: tri(o.geometry), mats: ms.map((m) => m.type + (m.visible ? '' : '(hidden)')).join(','), attrs: Object.keys(o.geometry.attributes).join(',') });
  });
  // summary by path
  const by = new Map();
  for (const r of rows) {
    const k = r.p + (r.inst ? ' [inst]' : '');
    const s = by.get(k) ?? { n: 0, tri: 0, inst: 0, mats: new Set(), attrs: new Set() };
    s.n++; s.tri += r.tri * Math.max(1, r.inst); s.inst += r.inst; r.mats.split(',').forEach((x) => s.mats.add(x)); s.attrs.add(r.attrs);
    by.set(k, s);
  }
  const list = [...by].map(([k, s]) => `${k}: meshes ${s.n}, inst ${s.inst}, tris ${Math.round(s.tri)} | ${[...s.mats].join(' ')} | ${[...s.attrs].join(' ; ')}`);
  const texs = new Set(); for (const m of mats.values()) for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap']) if (m[k]) texs.add(m[k].uuid);
  return { list, meshes: rows.length, materials: mats.size, textures: texs.size, totalTris: Math.round(rows.reduce((a, r) => a + r.tri * Math.max(1, r.inst), 0)) };
});
console.log(out.list.join('\n'));
console.log('meshes', out.meshes, 'materials', out.materials, 'textures', out.textures, 'total tris', out.totalTris);
await browser.close();
