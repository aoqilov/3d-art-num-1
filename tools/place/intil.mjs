// node tools/place/intil.mjs [--debug] — the "Intil" school site (the former Onodera building) west of block 1, as it
// really is → public/context/places.json (read by src/three/places.ts and context.ts).
//
// The scene had a 2-storey grey box on an empty lawn with a tree every 9 m (densify.ts). The real site: a 3-storey
// building with a taller entrance portal facing Kukcha Darvoza, a paved forecourt behind a fence and a gate with a
// gatehouse, flower beds and conifers along the drive, a dense park around (pines, plane trees), a turf mini-pitch,
// a hard court and an open-air pool. Sources: the owner's street photo of the gate and the Yandex map, and
// satellite imagery (Esri World Imagery, used as a tracing reference only — nothing of it ships with the app):
//  - the layout below was read off it by hand (scene metres; context.json lines up with it within 2–5 m),
//  - the trees are found in it: green crowns (excess green), packed greedily with disks (largest first), so a
//    dense canopy becomes several trees instead of one blob. The crowns of tall trees lean ~2 m south in the
//    picture (roof parallax: the building's roof shows 5 m south of its footprint), so they are moved back north.
// --debug writes the crown mask and the trees over the picture to $SHOTS (default .).
import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const debug = process.argv.includes('--debug');
const shots = process.env.SHOTS ?? '.';

// ---------------------------------------------------------------- layout (scene metres: x right, z down)
/** the site: no generated trees inside, the trees below instead */
const AREA = [-350, -104.5, -153, -104.5, -153, -67, -158, -20, -163, 15, -191, 62, -191, 124, -312, 124, -322, 90, -337, 30, -346, 0, -347, -40];
const LAYOUT = {
  replace: ['b1068'],                                        // the grey box: the building is drawn by places.ts
  // the building: main body and its two short wings (b1068's footprint), 3 storeys; the portal on the north facade
  building: { x0: -278, x1: -192, z0: -61, z1: -20.2, wing: [-286.6, -185.4, -53.4, -25.9], floors: 3, storey: 3.9, portal: { x: -235, w: 14, d: 2.2, h: 16.5 } },
  forecourt: [-248, -101.5, -222.5, -101.5, -222.5, -61, -248, -61],   // pavers inside the gate, up to the building
  drive: [-239, -111.2, -231, -111.2, -231, -104.5, -239, -104.5],   // asphalt across the sidewalk (kerb height)
  apron: [-239, -104.5, -231, -104.5, -231, -101.5, -239, -101.5],   // … and on to the gate, between the beds
  gate: { x0: -239.5, x1: -230.5, z: -101.5 },
  gatehouse: [-229.8, -100.8, -224.2, -95.2],                // inside the fence, east of the gate (the photo)
  // polylines: along the street either side of the gate, and down the lane on the west (0.5 m inside its sidewalk)
  fence: [[-344.2, -101.5, -239.5, -101.5], [-230.5, -101.5, -154, -101.5],
    [-344.2, -101.5, -344, -90, -345.8, -60, -346.3, -30, -344.3, 0, -337, 30, -329.2, 60, -321.3, 90, -316, 110, -312.3, 124]],
  beds: [[-251.5, -104.4, -240, -102.2], [-229.8, -104.4, -217, -102.2]], // flower beds along the fence, both sides of the drive
  pitch: { cx: -326.45, cz: 20.8, deg: -12.7, w: 20.1, d: 42.6 },   // the turf mini-pitch (OSM way 611149490)
  court: { cx: -272.8, cz: 75.6, deg: -5, w: 25, d: 34 },     // the asphalt court
  pool: { cx: -265.6, cz: 114.6, deg: -6, w: 12, d: 28 },     // open-air pool (water on the Yandex map)
  annex: { p: [-332, 40.5, -307, 40.5, -307, 47, -332, 47], f: 1 },   // changing rooms south of the pitch
};

// ---------------------------------------------------------------- geometry helpers
const inPoly = (x, z, p) => {
  let c = false;
  for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const rect = ([x0, z0, x1, z1]) => [x0, z0, x1, z0, x1, z1, x0, z1];
/** a turned rectangle as a polygon, grown by g: centre, size, deg = direction of its width axis (from +x towards +z,
 *  as yard.ts place()) */
const box = ({ cx, cz, deg, w, d }, g = 0) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), hw = w / 2 + g, hd = d / 2 + g;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].flatMap(([u, v]) => [cx + u * c - v * s, cz + u * s + v * c]);
};

// ---------------------------------------------------------------- satellite → scene raster
const g = JSON.parse(fs.readFileSync(path.join(root, 'tools/nearby/georef.json'), 'utf8')).origin;
const PHI = (15 * Math.PI) / 180, C = Math.cos(PHI), S = Math.sin(PHI), R = 6378137, T = Math.PI / 180;
const toLL = (x, z) => { const e = x * C + z * S, n = x * S - z * C; return [g.lat + n / (R * T), g.lon + e / (R * T * Math.cos(g.lat * T))]; };
const ZOOM = 19, N = 2 ** ZOOM;
const tileXY = (lat, lon) => [((lon + 180) / 360) * N, ((1 - Math.log(Math.tan(lat * T) + 1 / Math.cos(lat * T)) / Math.PI) / 2) * N];
const cache = path.join(os.tmpdir(), 'om-esri');
fs.mkdirSync(cache, { recursive: true });

async function raster(x0, z0, x1, z1, k) {
  const cs = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => tileXY(...toLL(x, z)));
  const tx0 = Math.floor(Math.min(...cs.map((p) => p[0]))), tx1 = Math.floor(Math.max(...cs.map((p) => p[0])));
  const ty0 = Math.floor(Math.min(...cs.map((p) => p[1]))), ty1 = Math.floor(Math.max(...cs.map((p) => p[1])));
  const W = (tx1 - tx0 + 1) * 256, H = (ty1 - ty0 + 1) * 256, comps = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const f = path.join(cache, `${ZOOM}_${tx}_${ty}.jpg`);
    if (!fs.existsSync(f)) {
      const r = await fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${ZOOM}/${ty}/${tx}`, { headers: { 'User-Agent': 'ObodMaskan3D/1.0' } });
      if (!r.ok) throw new Error(`tile ${tx},${ty}: ${r.status}`);
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    }
    comps.push({ input: f, left: (tx - tx0) * 256, top: (ty - ty0) * 256 });
  }
  const mosaic = await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } }).composite(comps).removeAlpha().raw().toBuffer();
  const w = Math.round((x1 - x0) * k), h = Math.round((z1 - z0) * k), px = Buffer.alloc(w * h * 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const [fx, fy] = tileXY(...toLL(x0 + (i + 0.5) / k, z0 + (j + 0.5) / k));
    const u = Math.floor((fx - tx0) * 256), v = Math.floor((fy - ty0) * 256);
    if (u >= 0 && v >= 0 && u < W && v < H) mosaic.copy(px, (j * w + i) * 3, (v * W + u) * 3, (v * W + u) * 3 + 3);
  }
  return { px, w, h };
}

// ---------------------------------------------------------------- crowns
const K = 2;                                                 // pixels per metre
const X0 = -350, Z0 = -112, X1 = -150, Z1 = 130;
const img = await raster(X0, Z0, X1, Z1, K);
const { w: W, h: H } = img;
const ctx = JSON.parse(fs.readFileSync(path.join(root, 'public/context/context.json'), 'utf8'));
const inTris = (t, x, z) => {
  for (let i = 0; i < t.i.length; i += 3) {
    const a = t.i[i] * 2, b = t.i[i + 1] * 2, c = t.i[i + 2] * 2;
    const d1 = (x - t.v[b]) * (t.v[a + 1] - t.v[b + 1]) - (t.v[a] - t.v[b]) * (z - t.v[b + 1]);
    const d2 = (x - t.v[c]) * (t.v[b + 1] - t.v[c + 1]) - (t.v[b] - t.v[c]) * (z - t.v[c + 1]);
    const d3 = (x - t.v[a]) * (t.v[c + 1] - t.v[a + 1]) - (t.v[c] - t.v[a]) * (z - t.v[a + 1]);
    if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;
  }
  return false;
};
const b1068 = ctx.buildings.find((b) => b.id === 'b1068').p;
const L = LAYOUT;
// where no tree may stand (a trunk there would pierce something)
const near = (x, z, line, r) => { for (let i = 0; i + 3 < line.length; i += 2) { const ax = line[i], az = line[i + 1], dx = line[i + 2] - ax, dz = line[i + 3] - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); if (Math.hypot(ax + dx * t - x, az + dz * t - z) < r) return true; } return false; };
const B = L.building;
const blocked = (x, z) => !inPoly(x, z, AREA) || (x > B.wing[0] - 2.5 && x < B.wing[1] + 2.5 && z > B.z0 - 2.5 && z < B.z1 + 2.5) ||
  L.fence.some((f) => near(x, z, f, 1.3)) || inPoly(x, z, L.forecourt) || inPoly(x, z, L.drive) || inPoly(x, z, L.apron)
  || inPoly(x, z, box(L.pitch, 1.5)) || inPoly(x, z, box(L.court, 1)) || inPoly(x, z, box(L.pool, 2)) || inPoly(x, z, L.annex.p)
  || inPoly(x, z, rect(L.gatehouse)) || inTris(ctx.road, x, z) || inTris(ctx.walk, x, z);

// green crown pixels: excess green, not too bright (the lawn and the turf are lighter / smoother)
const mask = new Uint8Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const o = (j * W + i) * 3, r = img.px[o], gg = img.px[o + 1], b = img.px[o + 2], sum = r + gg + b + 1;
  const exg = (2 * gg - r - b) / sum, lum = 0.3 * r + 0.59 * gg + 0.11 * b;
  const x = X0 + (i + 0.5) / K, z = Z0 + (j + 0.5) / K;
  // sunlit crowns by excess green; crowns in shade are dark, told from shadows on the dry ground by a plain green cast
  const green = lum >= 30 ? exg > 0.07 && gg - r > 4 && gg >= b && lum < 105 : lum > 12 && gg - r >= 4 && gg - b >= 3;
  if (green && inPoly(x, z, AREA) && !inPoly(x, z, box(L.pitch, 1))) mask[j * W + i] = 1;
}
// open (3×3) — drop single pixels and thin grass
const morph = (m, keep) => { const o = new Uint8Array(W * H); for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { let n = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) n += m[(j + a) * W + i + b]; o[j * W + i] = keep(n, m[j * W + i]) ? 1 : 0; } return o; };
// open (drop specks), then close twice (join the sunlit and shaded fragments of one crown)
let crown = morph(morph(mask, (n) => n >= 8), (n) => n > 0);
crown = morph(morph(crown, (n) => n > 0), (n) => n > 0);
crown = morph(morph(crown, (n) => n === 9), (n) => n === 9);
// distance to the crown edge (chamfer 3-4, in pixels × 3)
function dist(m) {
  const d = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) d[p] = m[p] ? 1e9 : 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const p = j * W + i; if (!d[p]) continue;
    if (i > 0) d[p] = Math.min(d[p], d[p - 1] + 3); else d[p] = Math.min(d[p], 3);
    if (j > 0) { d[p] = Math.min(d[p], d[p - W] + 3); if (i > 0) d[p] = Math.min(d[p], d[p - W - 1] + 4); if (i < W - 1) d[p] = Math.min(d[p], d[p - W + 1] + 4); } else d[p] = Math.min(d[p], 3);
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    const p = j * W + i; if (!d[p]) continue;
    if (i < W - 1) d[p] = Math.min(d[p], d[p + 1] + 3); else d[p] = Math.min(d[p], 3);
    if (j < H - 1) { d[p] = Math.min(d[p], d[p + W] + 3); if (i < W - 1) d[p] = Math.min(d[p], d[p + W + 1] + 4); if (i > 0) d[p] = Math.min(d[p], d[p + W - 1] + 4); } else d[p] = Math.min(d[p], 3);
  }
  return d;
}
// greedy disk packing: the widest crown first (radius capped: a merged canopy becomes several trees), its disk
// erased, again — until the crowns left are under 1.4 m
const RMAX = 4.6, RMIN = 1.4, raw = [];
for (let it = 0; it < 900; it++) {
  const d = dist(crown);
  let best = -1, bv = 0;
  for (let p = 0; p < W * H; p++) if (d[p] > bv) { bv = d[p]; best = p; }
  const r = bv / 3 / K;
  if (r < RMIN) break;
  const i = best % W, j = (best - i) / W, rr = Math.min(r, RMAX);
  let cr = 0, cg = 0, cb = 0, n = 0;
  const e = Math.ceil(rr * K * 0.95);
  for (let b = -e; b <= e; b++) for (let a = -e; a <= e; a++) {
    if (a * a + b * b > e * e) continue;
    const q = (j + b) * W + i + a; if (q < 0 || q >= W * H || i + a < 0 || i + a >= W) continue;
    if (crown[q]) { const o = q * 3; cr += img.px[o]; cg += img.px[o + 1]; cb += img.px[o + 2]; n++; }
    crown[q] = 0;
  }
  raw.push({ x: X0 + (i + 0.5) / K, z: Z0 + (j + 0.5) / K, r: rr, rgb: [cr / n, cg / n, cb / n] });
}

// ---------------------------------------------------------------- tree kinds
// the front lawn (between the street and the building): pines and thujas (the photo); the park: plane trees and
// fruit-tree sized crowns, the darkest crowns conifers
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const trees = [];
for (const t of raw) {
  const z = t.z - (t.r > 2.5 ? 2 : 1);                      // crown parallax, see the top
  if (blocked(t.x, z)) continue;
  const [r, gg, b] = t.rgb, lum = 0.3 * r + 0.59 * gg + 0.11 * b;
  const front = z < -61, v = rnd();
  let kind, s;
  if (front ? v < 0.75 : t.r >= 2.6 ? v < (lum < 50 ? 0.4 : 0.25) : v < 0.4) kind = 'archa';
  else kind = t.r >= 2.6 ? 'chinor' : 'mevali';
  // scale from the crown radius: the models' crowns at s = 1 are ~3.6 m (chinor), ~1.3 m (archa), ~1.6 m (mevali)
  if (kind === 'archa') s = Math.min(2.0, Math.max(0.8, t.r / 1.3));
  else if (kind === 'chinor') s = Math.min(1.3, Math.max(0.6, t.r / 3.6));
  else s = Math.min(1.6, Math.max(0.8, t.r / 1.6));
  trees.push([+t.x.toFixed(2), +z.toFixed(2), kind, +s.toFixed(2)]);
}
// the photo: a row of clipped thuja cones along the beds either side of the gate, behind the fence
const cones = [];
for (const [x0, x1] of [[-252, -241.5], [-228, -217]]) for (let x = x0 + 1.5; x <= x1; x += 3.5) if (x < L.gatehouse[0] - 1 || x > L.gatehouse[2] + 1) cones.push([+x.toFixed(2), -100.1, 'archa', 0.42]);

const out = {
  note: 'tools/place/intil.mjs — layout read off satellite imagery (Esri World Imagery) and the owner\'s street photo; trees found in the imagery',
  places: [{
    id: 'intil', name: 'Intil (sobiq Onodera)', area: AREA, replace: L.replace,
    trees: [...trees, ...cones],
    buildings: [{ id: 'intil-annex', p: L.annex.p, f: L.annex.f, r: 'flat', s: 'est', a: 162 }],
    // hard ground: no tree of any kind (street rows, yard fill) stands on these
    clear: [L.forecourt, L.drive, L.apron, rect(L.gatehouse), box(L.pitch, 1.5), box(L.court, 1), box(L.pool, 2), ...L.beds.map(rect)],
    layout: { building: { ...L.building, footprint: b1068 }, forecourt: L.forecourt, drive: L.drive, apron: L.apron, gate: L.gate, gatehouse: L.gatehouse, fence: L.fence, beds: L.beds, pitch: L.pitch, court: L.court, pool: L.pool },
  }],
};
fs.writeFileSync(path.join(root, 'public/context/places.json'), JSON.stringify(out));
const by = {}; for (const t of trees) by[t[2]] = (by[t[2]] ?? 0) + 1;
console.log('crowns', raw.length, 'trees', trees.length, by, 'cones', cones.length);

if (debug) {
  const px = (x, z) => `${((x - X0) * K).toFixed(1)},${((z - Z0) * K).toFixed(1)}`;
  const poly = (p, col) => `<polygon points="${Array.from({ length: p.length / 2 }, (_, i) => px(p[i * 2], p[i * 2 + 1])).join(' ')}" fill="none" stroke="${col}" stroke-width="1.5"/>`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  svg += poly(AREA, '#ff0') + poly(b1068, '#f80') + poly(L.forecourt, '#0ff') + poly(L.drive, '#0ff') + poly(box(L.pitch), '#0f0') + poly(box(L.court), '#0ff') + poly(box(L.pool), '#08f') + poly(L.annex.p, '#f80') + poly(rect(L.gatehouse), '#f80');
  for (const f of L.fence) svg += `<polyline points="${Array.from({ length: f.length / 2 }, (_, i) => px(f[i * 2], f[i * 2 + 1])).join(' ')}" fill="none" stroke="#f0f" stroke-width="1.5"/>`;
  const col = { archa: '#3cf', chinor: '#f33', mevali: '#fc3' };
  for (const [x, z, k, s] of [...trees, ...cones]) svg += `<circle cx="${(x - X0) * K}" cy="${(z - Z0) * K}" r="${(k === 'chinor' ? s * 3.6 : k === 'archa' ? s * 1.3 : s * 1.6) * K}" fill="none" stroke="${col[k]}" stroke-width="1.2"/>`;
  svg += '</svg>';
  await sharp(img.px, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: Buffer.from(svg) }]).png().toFile(path.join(shots, 'intil_trees.png'));
  const m = Buffer.alloc(W * H * 3); for (let p = 0; p < W * H; p++) { m[p * 3] = img.px[p * 3] >> 1; m[p * 3 + 1] = mask[p] ? 255 : img.px[p * 3 + 1] >> 1; m[p * 3 + 2] = img.px[p * 3 + 2] >> 1; }
  await sharp(m, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(shots, 'intil_mask.png'));
}
