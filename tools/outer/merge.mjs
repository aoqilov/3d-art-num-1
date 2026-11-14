// Outer surroundings: several CADMapper exports (3D buildings) → one layer of grey boxes, public/context/outer.json
//   node tools/outer/merge.mjs [folder with the CADMapper .zip/.dxf files = maps-out]
// Each CADMapper file has its own origin (its area's corner), so the files are placed by matching: the same
// OpenStreetMap building appears in two files with the same shape, only shifted. Every file is matched against the
// file the inner surroundings came from (tools/data/cadmapper.dxf) or an already placed file; the shift with the
// most votes wins. Buildings already in the inner surroundings, or in two files, are kept once.
// Scene coordinates as tools/context.py (to_scene). Heights are CADMapper's (its "3D buildings").
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const DIR = process.argv[2] ?? 'maps-out';
const PHI = (15 * Math.PI) / 180, ORIGIN = [486.72, 420.48], C = Math.cos(PHI), S = Math.sin(PHI);
const toScene = (X, Y) => { const dx = X - ORIGIN[0], dy = Y - ORIGIN[1]; return [dx * C + dy * S, dx * S - dy * C]; };

/** buildings of a DXF: closed rings (DXF metres) and heights (MESH = extruded footprint: top ring, then bottom ring) */
function read(file) {
  const t = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = [], roads = [];
  let ent = null, layer = '', pts = [], zs = [], x = 0;
  const flush = () => {
    if (layer === 'buildings' && pts.length >= 3) {
      if (ent === 'MESH') { const n = pts.length / 2; out.push({ ring: pts.slice(0, n), h: Math.max(...zs) - Math.min(...zs) }); }
      else if (ent === 'LWPOLYLINE') out.push({ ring: pts, h: 0 });
    }
    if (ent === 'LWPOLYLINE' && /^(major_roads|minor_roads)$/.test(layer) && pts.length > 1) roads.push({ cls: layer === 'major_roads' ? 0 : 1, pts });
    pts = []; zs = []; layer = '';
  };
  let inEnt = false, inVerts = false;
  for (let i = 0; i + 1 < t.length; i += 2) {
    const c = t[i].trim(), v = t[i + 1].trim();
    if (c === '2' && v === 'ENTITIES') inEnt = true;
    if (!inEnt) continue;
    if (c === '0') { flush(); ent = v; inVerts = ent === 'LWPOLYLINE'; continue; }
    if (c === '8') layer = v;
    if (ent === 'MESH') { if (c === '92') inVerts = true; if (c === '93') inVerts = false; }
    if (!inVerts) continue;
    if (c === '10') x = +v; else if (c === '20') pts.push([x, +v]); else if (c === '30') zs.push(+v);
  }
  flush();
  for (const b of out) {
    const [f0, l0] = [b.ring[0], b.ring[b.ring.length - 1]];
    if (b.ring.length > 3 && Math.hypot(f0[0] - l0[0], f0[1] - l0[1]) < 0.01) b.ring.pop();   // closed polylines repeat the first point
    b.per = b.ring.reduce((p, q, i) => p + Math.hypot(q[0] - b.ring[(i + 1) % b.ring.length][0], q[1] - b.ring[(i + 1) % b.ring.length][1]), 0);
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, n = b.ring.length; i < n; i++) {
      const [x0, y0] = b.ring[i], [x1, y1] = b.ring[(i + 1) % n], k = x0 * y1 - x1 * y0;
      a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k;
    }
    b.area = Math.abs(a / 2); b.c = a ? [cx / (3 * a), cy / (3 * a)] : b.ring[0];
  }
  const bs = out.filter((b) => b.area > 4);
  bs.roads = roads;
  return bs;
}

/** shift that puts `moving` onto `fixed`: votes of building pairs with the same vertex count and area */
function match(fixed, moving) {
  const byN = new Map();
  for (const b of fixed) { const k = b.ring.length; (byN.get(k) ?? byN.set(k, []).get(k)).push(b); }
  const votes = new Map();
  for (const m of moving) for (const f of byN.get(m.ring.length) ?? []) {
    if (Math.abs(f.area - m.area) > 0.015 * f.area + 1 || Math.abs(f.per - m.per) > 0.01 * f.per + 0.3) continue;
    const dx = f.c[0] - m.c[0], dy = f.c[1] - m.c[1], k = Math.round(dx) + ',' + Math.round(dy);
    const e = votes.get(k) ?? votes.set(k, { n: 0, sx: 0, sy: 0 }).get(k); e.n++; e.sx += dx; e.sy += dy;
  }
  let best = null;
  for (const e of votes.values()) if (!best || e.n > best.n) best = e;
  return best && best.n >= 6 ? { dx: best.sx / best.n, dy: best.sy / best.n, n: best.n } : null;
}

// ---- the files
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'outer-'));
const files = [];
for (const f of fs.readdirSync(DIR).sort()) {
  const p = path.join(DIR, f);
  if (f.endsWith('.dxf')) files.push(p);
  if (f.endsWith('.zip')) {
    const d = path.join(tmp, String(files.length));
    fs.mkdirSync(d);
    try { execFileSync('unzip', ['-o', '-q', p, '-d', d]); }
    catch { execFileSync(process.platform === 'win32' ? 'C:\Windows\System32\tar.exe' : 'tar', ['-xf', p, '-C', d]); }   // bsdtar reads zip
    const walk = (q) => fs.readdirSync(q, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(q, e.name)) : e.name.endsWith('.dxf') ? [path.join(q, e.name)] : []));
    files.push(...walk(d));
  }
}
const base = read('tools/data/cadmapper.dxf');
const tiles = files.map((f) => ({ f, bs: read(f), shift: null }));
console.log('base', base.length, 'buildings;', tiles.map((t) => `${path.basename(path.dirname(t.f))}: ${t.bs.length}`).join(', '));

// ---- place every file: against the base first, then against placed files
const placed = [{ bs: base }];
for (let round = 0; round < tiles.length; round++) {
  for (const t of tiles) {
    if (t.shift) continue;
    let best = null;
    for (const p of placed) { const m = match(p.bs, t.bs); if (m && (!best || m.n > best.n)) best = m; }
    if (!best) continue;
    t.shift = best;
    const roads = t.bs.roads.map((r) => ({ cls: r.cls, pts: r.pts.map(([x, y]) => [x + best.dx, y + best.dy]) }));
    t.bs = t.bs.map((b) => ({ ...b, ring: b.ring.map(([x, y]) => [x + best.dx, y + best.dy]), c: [b.c[0] + best.dx, b.c[1] + best.dy] }));
    t.bs.roads = roads;
    placed.push(t);
    console.log('placed', path.basename(path.dirname(t.f)), `shift ${best.dx.toFixed(2)}, ${best.dy.toFixed(2)} m from ${best.n} matching buildings`);
  }
}
const lost = tiles.filter((t) => !t.shift);
if (lost.length) console.warn('NOT PLACED (no shared buildings):', lost.map((t) => t.f).join(', '));

// ---- one copy of every building; the inner surroundings keep theirs
const seen = [];
const grid = new Map(), key = (x, y) => Math.floor(x / 20) + ',' + Math.floor(y / 20);
const dup = (b) => {
  const [x, y] = b.c, gx = Math.floor(x / 20), gy = Math.floor(y / 20);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of grid.get(gx + i + ',' + (gy + j)) ?? [])
    if (Math.hypot(o.c[0] - x, o.c[1] - y) < 3 && Math.abs(o.area - b.area) < 0.2 * b.area + 5) return true;
  return false;
};
const add = (b) => { const k = key(b.c[0], b.c[1]); (grid.get(k) ?? grid.set(k, []).get(k)).push(b); };
base.forEach(add);
const outer = [];
for (const t of tiles) if (t.shift) for (const b of t.bs) { if (dup(b)) continue; add(b); outer.push(b); }

// ---- scene coordinates, metres rounded to 10 cm
const r1 = (v) => Math.round(v * 10) / 10;
const list = outer.map((b, i) => {
  const ring = b.ring.flatMap(([x, y]) => toScene(x, y)).map(r1);
  return [i, r1(Math.max(2.8, b.h)), ...ring];
});
// roads: the inner surroundings draw their own inside the base file's area (DXF -1…1101 × 0…904)
const inBase = ([x, y]) => x > 5 && x < 1095 && y > 5 && y < 898;
const roadSeen = new Set(), roads = [];
for (const t of tiles) if (t.shift) for (const r of t.bs.roads) {
  let run = [];
  const flushRun = () => { if (run.length > 1) roads.push([r.cls, ...run.flatMap(([x, y]) => toScene(x, y)).map(r1)]); run = []; };
  for (let i = 0; i < r.pts.length; i++) {
    const p = r.pts[i], q = r.pts[i + 1];
    if (inBase(p)) { flushRun(); continue; }
    const k = Math.round(p[0] / 2) + ',' + Math.round(p[1] / 2) + (q ? '>' + Math.round(q[0] / 2) + ',' + Math.round(q[1] / 2) : '');
    if (q && roadSeen.has(k)) { run.push(p); flushRun(); continue; }        // this stretch came with another file
    roadSeen.add(k); run.push(p);
  }
  flushRun();
}
const radius = Math.max(...outer.map((b) => Math.hypot(...toScene(b.c[0], b.c[1]))));
fs.writeFileSync('public/context/outer.json', JSON.stringify({
  note: 'Outer surroundings from CADMapper (OpenStreetMap, 3D buildings): [id, height m, x0, z0, x1, z1, …] scene metres. tools/outer/merge.mjs',
  buildings: list,
  roads,             // [class 0 major | 1 minor, x0, z0, x1, z1, …] centre lines
}));
console.log('outer roads', roads.length, 'runs');
console.log('outer buildings', list.length, 'out to', Math.round(radius), 'm; public/context/outer.json', (fs.statSync('public/context/outer.json').size / 1024).toFixed(0), 'KB');
fs.rmSync(tmp, { recursive: true, force: true });
