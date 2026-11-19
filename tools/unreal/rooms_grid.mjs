// Room lookup for the Unreal "where am I" label: plan_t4.json rooms -> 0.2 m grid per storey type (1, 2, 3-16).
// out/rooms.json = { cell, nx, ny, labels: string[], cells: int[] (3 * nx * ny, index into labels) }
//   node tools/unreal/rooms_grid.mjs
import fs from 'node:fs';
const HERE = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const FIXED = HERE + 'out/plan_fixed.json';                         // written by build_f12.py (plan fixes applied)
const P = JSON.parse(fs.readFileSync(fs.existsSync(FIXED) ? FIXED : HERE + '../../src/block/data/plan_t4.json', 'utf8'));
const CELL = 0.2, X0 = -2, Y0 = -2, NX = 172, NY = 112;            // plan -2..32.4 x -2..20.4 m
const NAME = { kitchen: 'Oshxona', living: 'Mehmonxona', bath: 'Sanuzel', bedroom: 'Yotoqxona', corridor: "Yo'lak", hall: 'Lift holli', balcony: 'Balkon', lift: 'Lift', shop: "Do'kon" };
const inRing = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const inPoly = (p, x, y) => inRing(p.outer, x, y) && !p.holes.some((h) => inRing(h, x, y));
const labels = ['Tashqarida'], idx = new Map([['Tashqarida', 0]]);
const lab = (s) => { if (!idx.has(s)) { idx.set(s, labels.length); labels.push(s); } return idx.get(s); };
const cells = [];
for (const [t, tname] of [['1', '1-qavat'], ['2', '2-qavat'], ['3', 'tipik']]) {
  const F = P[t];
  const aptOf = new Map(); F.apts.forEach((a, i) => a.rooms.forEach((r) => aptOf.set(r, a)));
  let shop = 0;
  const rl = F.rooms.map((r) => {
    const a = aptOf.get(r.id);
    const cx = r.poly.outer.reduce((s, p) => s + p[0], 0) / r.poly.outer.length, cy = r.poly.outer.reduce((s, p) => s + p[1], 0) / r.poly.outer.length;
    let n = r.kind ? NAME[r.kind] : a ? 'Dahliz' : (cx > 9.65 && cx < 12.35 && cy > 10.4 && cy < 14.9) ? 'Zinapoya' : t === '1' ? 'Kirish / umumiy' : "Umumiy yo'lak";
    if (r.kind === 'shop') n += ' ' + (++shop);
    const where = a ? `${a.label} m² xonadon · ` : '';
    return { poly: r.poly, area: r.area, s: `${where}${n} ${r.area.toFixed(1)} m²  [${tname} #${r.id}]` };
  }).sort((a, b) => a.area - b.area);                               // smallest room wins on shared edges
  for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
    const x = X0 + (ix + 0.5) * CELL, y = Y0 + (iy + 0.5) * CELL;
    const r = rl.find((q) => inPoly(q.poly, x, y));
    cells.push(r ? lab(r.s) : inPoly(F.footprint, x, y) ? lab('Devor ichida') : 0);
  }
}
fs.writeFileSync(HERE + 'out/rooms.json', JSON.stringify({ cell: CELL, x0: X0, y0: Y0, nx: NX, ny: NY, labels, cells }));
console.log('labels', labels.length, 'cells', cells.length);
