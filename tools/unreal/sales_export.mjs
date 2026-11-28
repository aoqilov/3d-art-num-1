// Sales data for the Unreal UI, straight from the web app's own modules (so numbers match 1:1):
// src/data/apartments.ts (all 1735 flats), src/data/blocks.ts, src/block/aptData.ts (rooms of type-4 flats).
//   node tools/unreal/sales_export.mjs  ->  tools/unreal/out/sales.json
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const OUT = path.join(ROOT, 'tools/unreal/out');
const tmp = path.join(OUT, '_sales_entry.mjs');
await build({
  stdin: {
    contents: `
      import { APARTMENTS, blockStats } from './src/data/apartments';
      import { BLOCKS, FLOORS, TOTAL_APARTMENTS, PRICE_PER_M2, TYPE4 } from './src/data/blocks';
      import { planFor, pointInPoly, polyBounds } from './src/block/plan';
      // a point inside the flat to walk to (plan metres): the living room, else its largest room
      const walkPoint = (f, i) => {
        const fp = planFor(f), a = fp.apts[i];
        const rooms = a.rooms.map((id) => fp.rooms.find((r) => r.id === id)).filter((r) => r && r.kind !== 'bath' && r.kind !== 'balcony');
        rooms.sort((x, y) => (y.kind === 'living') - (x.kind === 'living') || y.area - x.area);
        for (const r of rooms) {
          const b = polyBounds(r.poly);
          for (const [u, v] of [[0.5, 0.5], [0.35, 0.5], [0.65, 0.5], [0.5, 0.35], [0.5, 0.65]]) {
            const x = b.x0 + (b.x1 - b.x0) * u, y = b.y0 + (b.y1 - b.y0) * v;
            if (pointInPoly(x, y, r.poly)) return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
          }
        }
        return null;
      };
      import { aptRooms } from './src/block/aptData';
      import { GALLERY, GAL_CATS } from './src/data/gallery';
      import { PLACES, CATS, SAT, ADDRESS, distance } from './src/data/nearby';
      import { PLAN_SIZE } from './src/data/blocks';
      export const data = () => {
        const idx = new Map();
        for (const id of TYPE4) for (let f = 2; f <= FLOORS; f++) planFor(f).apts.forEach((a, i) => idx.set(id + '-' + f + '-' + i, i));
        return {
          floors: FLOORS, total: TOTAL_APARTMENTS, pricePerM2: PRICE_PER_M2, type4: TYPE4,
          blocks: BLOCKS.map((b) => ({ id: b.id, w: b.w, d: b.d, x: b.x, z: b.z, ...blockStats(b.id) })),
          planSize: PLAN_SIZE, address: ADDRESS.uz,
          gallery: GALLERY.map((g) => ({ id: g.id, cat: g.cat, uz: g.uz, src: g.src, thumb: g.thumb, type4: !!g.type4 })), galCats: Object.entries(GAL_CATS).map(([k, v]) => [k, v.uz]),
          sat: SAT, places: [...PLACES].sort((a, b) => distance(a).m - distance(b).m).map((p) => ({ id: p.id, cat: p.cat, px: p.px, uz: p.uz, n: PLACES.indexOf(p) + 1, ...distance(p) })),
          cats: Object.entries(CATS).map(([k, v]) => [k, v.uz, v.color]),
          apts: APARTMENTS.map((a) => ({ id: a.id, block: a.block, floor: a.floor, num: a.num, rooms: a.rooms, area: a.area, price: a.price, status: a.status,
            index: idx.has(a.id) ? idx.get(a.id) : -1 })),
          walk: Object.fromEntries([...Array(FLOORS - 1)].flatMap((_, k) => { const f = k + 2; return planFor(f).apts.map((_, i) => [f + '-' + i, walkPoint(f, i)]); })),
          rooms: Object.fromEntries([...Array(FLOORS - 1)].flatMap((_, k) => { const f = k + 2; return planFor(f).apts.map((_, i) => [f + '-' + i, aptRooms(f, i)]); })),
        };
      };`,
    resolveDir: ROOT, loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile: tmp, logLevel: 'error',
  loader: { '.json': 'json', '.jpg': 'empty', '.png': 'empty', '.css': 'empty' },
  alias: { three: 'three/webgpu' }, external: ['three', 'three/*'],
});
const { data } = await import(pathToFileURL(tmp).href);
const d = data();
fs.unlinkSync(tmp);
fs.writeFileSync(path.join(OUT, 'sales.json'), JSON.stringify(d));
const c = { free: 0, reserved: 0, sold: 0 }; d.apts.forEach((a) => c[a.status]++);
console.log('flats', d.apts.length, c, 'blocks', d.blocks.length, 'room lists', Object.keys(d.rooms).length);
