// Artificial lighting of the type-4 block, laid out like a lighting designer would per room:
//  • flats (3000 K warm; bath and the worktop strip 4000 K): ring LED chandelier in the living room, dome pendants
//    over every dining table, recessed downlights on a regular grid, round flush ceiling light in bedrooms,
//    nightstand lamps, under-cabinet strip over the worktop, back-lit bathroom mirror, wall light on balconies;
//  • common areas (4000 K): round surface LED panels with motion sensors along corridors and lift halls, a downlight
//    over every flat's entrance door, wall bulkheads on the stair, the air balcony and the ground-floor hall,
//    linear lights in the entrance hall and green exit signs on the evacuation route.
// Fixtures are modelled procedurally after common catalogue pieces (Maytoni / Arlight style). Their diffusers glow
// (emissive); real light comes from a small pool of spot/point lights given to the fixtures nearest to the visitor
// (all of a storey's fixtures in the PRO path tracer).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prep } from './materials';
import { furnitureMaterials } from './furniture';
import { FLOOR_H, PLAN, SLAB, pointInPoly, polyBounds, type FloorPlan, type Poly, type Room } from './plan';
import { HALL1, STAIR_LAND, stairRoom } from './floorGeom';
import furnRaw from './data/furn_t4.json';
import entriesRaw from './data/entries_t4.json';

type FloorKey = '1' | '2' | '3';
type Side = 'n' | 's' | 'w' | 'e';
type Item = { t: string; x0: number; y0: number; x1: number; y1: number; back: Side };
type Entry = { apt: number; hinge: number[]; u: number[]; n: number[]; span: number };
const FURN = furnRaw as unknown as Record<'2' | '3', Item[]>;
const ENTRIES = entriesRaw as unknown as Record<'2' | '3', Entry[]>;

const CEIL = FLOOR_H;                    // ceiling plane above storey base (underside of the next slab)
const LENS_ON = 3.2;                     // emissive strength of a lit diffuser
/** Scene units per lux: maps catalogue lumens to this scene's (non-photometric) light scale. */
export const K_LUX = 0.016;
const CCT: Record<number, string> = { 2700: '#ffd9b4', 3000: '#ffe4cc', 4000: '#fff5ec' };

export type Fixture = {
  id: number; zone: 'apt' | 'pub'; apt: number | null; room: number | null;
  x: number; y: number; z: number;       // light origin: plan x/y, height above storey base
  sx: number; sy: number;                // a point inside the room for sight tests
  light: 'spot' | 'point' | null;        // null: glow only (exit sign)
  lm: number; cct: number; angle: number; pen: number; range: number;
  level: number; hold: number;           // motion-sensor state (common areas)
};

// ---------------------------------------------------------------- materials
type MatKey = 'white' | 'black' | 'brass' | 'brassIn' | 'grey' | 'gap' | 'fabric' | 'shadeIn' | 'a27' | 'a30' | 'a40' | 'exit';
let LIB: Record<MatKey, THREE.MeshStandardMaterial> | null = null;
function lib() {
  if (LIB) return LIB;
  const S = (color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    prep(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }), false);
  const lens = (cct: number) => S('#e6e3dd', 0.35, 0, { emissive: CCT[cct], emissiveIntensity: 0 });
  LIB = {
    white: S('#f4f3f0', 0.45), black: S('#1d1e20', 0.35, 0.55), brass: S('#b78f57', 0.3, 0.9),
    brassIn: S('#d2ab72', 0.28, 0.85, { side: THREE.BackSide }), grey: S('#5a5d62', 0.45, 0.45),
    gap: S('#2b2c2f', 0.8), fabric: S('#efe7da', 0.95, 0, { emissive: '#ffd6a6', emissiveIntensity: 0 }),
    shadeIn: S('#f3e6d0', 0.9, 0, { side: THREE.BackSide, emissive: CCT[2700], emissiveIntensity: 0 }),
    a27: lens(2700), a30: lens(3000), a40: lens(4000),
    exit: S('#0f5c2e', 0.4, 0, { emissive: '#ffffff', emissiveIntensity: 1.5, emissiveMap: exitTexture() }),
  };
  for (const [k, m] of Object.entries(LIB)) m.name = 'light_' + k;
  return LIB;
}
function exitTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 112;
  const x = c.getContext('2d')!;
  x.fillStyle = '#0d8a43'; x.fillRect(0, 0, 256, 112);
  x.fillStyle = '#ffffff';
  // running figure + door, then the word
  x.fillRect(14, 22, 44, 68); x.fillStyle = '#0d8a43'; x.fillRect(20, 28, 32, 62); x.fillStyle = '#ffffff';
  x.beginPath(); x.arc(78, 30, 8, 0, Math.PI * 2); x.fill();
  x.lineWidth = 7; x.lineCap = 'round'; x.strokeStyle = '#ffffff';
  x.beginPath(); x.moveTo(75, 42); x.lineTo(68, 64); x.lineTo(80, 80); x.moveTo(68, 64); x.lineTo(56, 82);
  x.moveTo(73, 46); x.lineTo(60, 54); x.moveTo(73, 46); x.lineTo(88, 56); x.stroke();
  x.font = '700 34px "Helvetica Neue", Arial, sans-serif'; x.textBaseline = 'middle';
  x.fillText('CHIQISH', 104, 46);
  x.font = '600 20px "Helvetica Neue", Arial, sans-serif'; x.fillText('ВЫХОД  EXIT', 106, 80);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- geometry accumulation
class Acc {
  parts = new Map<MatKey, THREE.BufferGeometry[]>();
  pub = new Map<number, THREE.BufferGeometry[]>();   // per-fixture diffusers of the common areas
  add(m: MatKey, g: THREE.BufferGeometry, M?: THREE.Matrix4) {
    const gg = (g.index ? g.toNonIndexed() : g.clone());
    if (M) gg.applyMatrix4(M);
    g.dispose();
    let a = this.parts.get(m); if (!a) this.parts.set(m, (a = [])); a.push(gg);
  }
  lens(f: Fixture, m: MatKey, g: THREE.BufferGeometry, M?: THREE.Matrix4) {
    if (f.zone === 'apt') return this.add(m, g, M);
    const gg = (g.index ? g.toNonIndexed() : g.clone());
    if (M) gg.applyMatrix4(M);
    g.dispose();
    let a = this.pub.get(f.id); if (!a) this.pub.set(f.id, (a = [])); a.push(gg);
  }
}
const down = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2);          // circle/ring facing +z → facing down
const at = (g: THREE.BufferGeometry, x: number, z: number, y: number) => g.translate(x, z, y);
/** Thin rod between two storey-local points (x, z, y). */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const d = b.clone().sub(a), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, 6, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
/** Wall frame: origin on the wall face at (x, y, z), local +z = into the room (n), +x along the wall. */
function wallM(x: number, y: number, z: number, nx: number, ny: number) {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(ny, 0, -nx), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, ny));   // right-handed
  return m.setPosition(x, z, y);
}

// ---------------------------------------------------------------- fixture models
function mDownlight(A: Acc, f: Fixture, lens: MatKey, trim: MatKey = 'white', r = 0.042) {
  A.add(trim, at(down(new THREE.RingGeometry(r * 0.86, r + 0.016, 28)), f.x, CEIL - 0.0025, f.y));
  A.add('gap', at(down(new THREE.RingGeometry(r * 0.7, r * 0.86, 28)), f.x, CEIL - 0.0035, f.y));
  A.lens(f, lens, at(down(new THREE.CircleGeometry(r * 0.7, 24)), f.x, CEIL - 0.0045, f.y));
}
function mPanel(A: Acc, f: Fixture, lens: MatKey, R = 0.15, h = 0.055) {
  A.add('white', at(new THREE.CylinderGeometry(R, R, h, 40, 1, false), f.x, CEIL - h / 2, f.y));
  A.lens(f, lens, at(down(new THREE.CircleGeometry(R - 0.012, 40)), f.x, CEIL - h - 0.0015, f.y));
}
function mFlush(A: Acc, f: Fixture) {
  const R = 0.23, h = 0.07;
  A.add('white', at(new THREE.CylinderGeometry(R, R - 0.01, h, 48, 1, false), f.x, CEIL - h / 2, f.y));
  A.add('brass', at(new THREE.TorusGeometry(R - 0.012, 0.006, 6, 64).rotateX(Math.PI / 2), f.x, CEIL - h, f.y));
  A.lens(f, 'a30', at(down(new THREE.CircleGeometry(R - 0.02, 48)), f.x, CEIL - h - 0.0015, f.y));
}
function mRing(A: Acc, f: Fixture, drop: number) {
  const R = 0.33, zr = CEIL - drop;
  A.add('black', at(new THREE.CylinderGeometry(0.06, 0.06, 0.022, 24), f.x, CEIL - 0.011, f.y));
  A.add('black', at(new THREE.TorusGeometry(R, 0.017, 10, 80).rotateX(Math.PI / 2), f.x, zr, f.y));
  A.lens(f, 'a30', at(down(new THREE.RingGeometry(R - 0.014, R + 0.014, 80)), f.x, zr - 0.0172, f.y));
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3 + 0.4;
    A.add('black', rod(new THREE.Vector3(f.x, CEIL - 0.02, f.y), new THREE.Vector3(f.x + Math.cos(a) * R, zr + 0.015, f.y + Math.sin(a) * R), 0.0012));
  }
}
function mPendant(A: Acc, f: Fixture, top: number) {
  A.add('black', at(new THREE.CylinderGeometry(0.04, 0.04, 0.016, 20), f.x, CEIL - 0.008, f.y));
  A.add('black', rod(new THREE.Vector3(f.x, CEIL - 0.016, f.y), new THREE.Vector3(f.x, top, f.y), 0.0028));
  const shade = new THREE.CylinderGeometry(0.035, 0.15, 0.18, 36, 1, true);
  A.add('black', at(shade.clone(), f.x, top - 0.09, f.y));
  A.add('brassIn', at(shade, f.x, top - 0.09, f.y));
  A.add('black', at(new THREE.CircleGeometry(0.035, 20).rotateX(-Math.PI / 2), f.x, top, f.y));
  A.lens(f, 'a27', at(new THREE.SphereGeometry(0.042, 16, 10), f.x, top - 0.13, f.y));
}
function mFloorLamp(A: Acc, f: Fixture) {
  A.add('black', at(new THREE.CylinderGeometry(0.14, 0.15, 0.022, 32), f.x, SLAB + 0.011, f.y));
  A.add('black', rod(new THREE.Vector3(f.x, SLAB + 0.02, f.y), new THREE.Vector3(f.x, SLAB + 1.33, f.y), 0.011));
  const sh = new THREE.CylinderGeometry(0.19, 0.21, 0.3, 40, 1, true);
  A.add('fabric', at(sh.clone(), f.x, SLAB + 1.47, f.y));
  A.add('shadeIn', at(sh, f.x, SLAB + 1.47, f.y));
}
function mBulkhead(A: Acc, f: Fixture, M: THREE.Matrix4, body: MatKey = 'grey', lens: MatKey = 'a40') {
  const b = new THREE.BoxGeometry(0.26, 0.11, 0.07); b.translate(0, 0, 0.035);
  A.add(body, b, M);
  const l = new THREE.BoxGeometry(0.21, 0.065, 0.006); l.translate(0, 0, 0.073);
  A.lens(f, lens, l, M);
}
function mSconce(A: Acc, f: Fixture, M: THREE.Matrix4) {
  // slim up/down wall light: black cylinder with glowing ends
  const c = new THREE.CylinderGeometry(0.045, 0.045, 0.22, 24); c.translate(0, 0, 0.07);
  A.add('black', c, M);
  const arm = new THREE.BoxGeometry(0.03, 0.03, 0.03); arm.translate(0, 0, 0.012);
  A.add('black', arm, M);
  for (const s of [1, -1]) {
    const d = new THREE.CircleGeometry(0.038, 20); d.rotateX(s > 0 ? -Math.PI / 2 : Math.PI / 2); d.translate(0, s * 0.1105, 0.07);
    A.lens(f, 'a30', d, M);
  }
}
function mLinear(A: Acc, f: Fixture, len: number, alongX: boolean) {
  const [w, d] = alongX ? [len, 0.07] : [0.07, len];
  A.add('black', at(new THREE.BoxGeometry(w, 0.06, d), f.x, CEIL - 0.03, f.y));
  A.lens(f, 'a40', at(down(new THREE.PlaneGeometry(alongX ? len - 0.02 : 0.05, alongX ? 0.05 : len - 0.02)), f.x, CEIL - 0.0605, f.y));
}
function mExit(A: Acc, M: THREE.Matrix4) {
  const b = new THREE.BoxGeometry(0.36, 0.16, 0.035); b.translate(0, 0, 0.0175);
  A.add('white', b, M);
  const p = new THREE.PlaneGeometry(0.34, 0.14); p.translate(0, 0, 0.0355);
  A.add('exit', p, M);
}

// ---------------------------------------------------------------- room analysis
const RES = 0.05;
type Field = { x0: number; y0: number; nx: number; ny: number; d: Float32Array };
/** Clearance (distance to the room outline) on a 5 cm raster. */
function field(poly: Poly): Field {
  const b = polyBounds(poly);
  const x0 = b.x0 - RES, y0 = b.y0 - RES;
  const nx = Math.ceil((b.x1 - b.x0) / RES) + 3, ny = Math.ceil((b.y1 - b.y0) / RES) + 3;
  const d = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) d[j * nx + i] = pointInPoly(x0 + (i + 0.5) * RES, y0 + (j + 0.5) * RES, poly) ? 1e9 : 0;
  const a = RES, c = RES * Math.SQRT2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (!d[k]) continue;
    let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + a);
    if (j > 0) { v = Math.min(v, d[k - nx] + a); if (i > 0) v = Math.min(v, d[k - nx - 1] + c); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + c); }
    d[k] = v;
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; if (!d[k]) continue;
    let v = d[k];
    if (i < nx - 1) v = Math.min(v, d[k + 1] + a);
    if (j < ny - 1) { v = Math.min(v, d[k + nx] + a); if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + c); if (i > 0) v = Math.min(v, d[k + nx - 1] + c); }
    d[k] = v;
  }
  return { x0, y0, nx, ny, d };
}
const clear = (F: Field, x: number, y: number) => {
  const i = Math.floor((x - F.x0) / RES), j = Math.floor((y - F.y0) / RES);
  return i < 0 || j < 0 || i >= F.nx || j >= F.ny ? 0 : F.d[j * F.nx + i];
};
const cellXY = (F: Field, k: number): [number, number] => [F.x0 + ((k % F.nx) + 0.5) * RES, F.y0 + (Math.floor(k / F.nx) + 0.5) * RES];
/** Most open point of the room, optionally at least `away` from given points. */
function centre(F: Field, avoid: [number, number][] = [], away = 0): [number, number] | null {
  let best = -1, bk = -1;
  for (let k = 0; k < F.d.length; k++) {
    const v = F.d[k]; if (v <= best) continue;
    const [x, y] = cellXY(F, k);
    if (avoid.some(([ax, ay]) => Math.hypot(x - ax, y - ay) < away)) continue;
    best = v; bk = k;
  }
  return bk < 0 ? null : cellXY(F, bk);
}
/** Regular downlight grid over the room's bounding box, kept where the ceiling is wide enough. */
function gridPts(poly: Poly, F: Field, step: number, minClear: number): [number, number][] {
  const b = polyBounds(poly), W = b.x1 - b.x0, D = b.y1 - b.y0;
  const nx = Math.max(1, Math.round(W / step)), ny = Math.max(1, Math.round(D / step));
  const out: [number, number][] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = b.x0 + ((i + 0.5) * W) / nx, y = b.y0 + ((j + 0.5) * D) / ny;
    if (clear(F, x, y) >= minClear) out.push([x, y]);
  }
  return out;
}
/** Points along the middle of corridors: greedy on clearance with a minimum spacing. */
function ridgePts(F: Field, spacing: number): [number, number][] {
  let max = 0; for (const v of F.d) max = Math.max(max, v);
  const lim = Math.min(0.6, max * 0.88);
  const ks: number[] = [];
  for (let k = 0; k < F.d.length; k++) if (F.d[k] >= lim) ks.push(k);
  ks.sort((a, b) => F.d[b] - F.d[a] || a - b);
  const out: [number, number][] = [];
  for (const k of ks) {
    const p = cellXY(F, k);
    if (out.every(([x, y]) => Math.hypot(x - p[0], y - p[1]) >= spacing)) out.push(p);
  }
  return out;
}

// plan-space frame of a furniture item (same as furniture.ts): u along its back wall, v away from it
function itemFrame(it: Item) {
  const ns = it.back === 'n' || it.back === 's';
  const W = ns ? it.x1 - it.x0 : it.y1 - it.y0, D = ns ? it.y1 - it.y0 : it.x1 - it.x0;
  const m = new THREE.Matrix4(), rot = new THREE.Matrix4();
  if (it.back === 'n') m.makeTranslation(it.x0, SLAB, it.y0);
  if (it.back === 's') { m.makeTranslation(it.x1, SLAB, it.y1); rot.makeRotationY(Math.PI); }
  if (it.back === 'w') { m.makeTranslation(it.x0, SLAB, it.y1); rot.makeRotationY(Math.PI / 2); }
  if (it.back === 'e') { m.makeTranslation(it.x1, SLAB, it.y0); rot.makeRotationY(-Math.PI / 2); }
  m.multiply(rot);
  const pt = (u: number, v: number, h = 0): [number, number, number] => {
    const p = new THREE.Vector3(u, h, v).applyMatrix4(m);
    return [p.x, p.z, p.y];          // plan x, plan y, height above storey base
  };
  return { W, D, m, pt };
}

// ---------------------------------------------------------------- layout of one floor type
type KeyData = { key: FloorKey; fixtures: Fixture[]; group: THREE.Group; pubMats: Map<number, THREE.MeshStandardMaterial>; roomOf: (x: number, y: number) => Room | null };

function layout(key: FloorKey): KeyData {
  const plan: FloorPlan = PLAN[key];
  const items = key === '1' ? [] : FURN[key];
  const entries = key === '1' ? [] : ENTRIES[key];
  const A = new Acc();
  const fx: Fixture[] = [];
  const roomOf = (x: number, y: number) => plan.rooms.find((r) => pointInPoly(x, y, r.poly)) ?? null;
  const mk = (o: Partial<Fixture> & Pick<Fixture, 'x' | 'y' | 'z' | 'lm' | 'cct'>): Fixture => {
    const r = roomOf(o.sx ?? o.x, o.sy ?? o.y);
    const f: Fixture = {
      id: fx.length, zone: r?.apt != null ? 'apt' : 'pub', apt: r?.apt ?? null, room: r?.id ?? null,
      sx: o.x, sy: o.y, light: 'spot', angle: 0.6, pen: 0.55, range: 7, level: 0, hold: 0, ...o,
    } as Fixture;
    if (o.zone) f.zone = o.zone;
    fx.push(f); return f;
  };
  const sr = key === '1' ? null : stairRoom(plan);
  const fields = new Map<number, Field>();
  const F = (r: Room) => { let f = fields.get(r.id); if (!f) fields.set(r.id, (f = field(r.poly))); return f; };
  const itemsIn = (r: Room, t: string) => items.filter((it) => it.t === t && pointInPoly((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, r.poly));

  // ---------- flats
  for (const r of plan.rooms) {
    if (r.apt === null || r.kind === 'lift') continue;
    const Fr = F(r);
    const dl = (x: number, y: number, lm: number, cct: number, lens: MatKey, trim: MatKey = 'white') =>
      mDownlight(A, mk({ x, y, z: CEIL - 0.03, lm, cct, angle: 0.62, pen: 0.55 }), lens, trim);
    if (r.kind === 'balcony') { balconyLights(r, 3000, 'a30'); continue; }
    // pendants over every dining table
    const pend: [number, number][] = [];
    for (const t of itemsIn(r, 'table')) {
      const fr = itemFrame(t);
      const long = Math.max(fr.W, fr.D), n = long < 1.3 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const s = n === 1 ? 0.5 : i === 0 ? 0.27 : 0.73;
        const [x, y] = fr.W >= fr.D ? fr.pt(fr.W * s, fr.D / 2) : fr.pt(fr.W / 2, fr.D * s);
        const top = SLAB + 0.765 + 0.72 + 0.18;          // shade rim 72 cm over the table top
        const f = mk({ x, y, z: top - 0.15, lm: 650, cct: 2700, angle: 0.9, pen: 0.7, range: 5 });
        mPendant(A, f, top); pend.push([x, y]);
      }
    }
    switch (r.kind) {
      case 'living': case 'hall': {
        const coffee = itemsIn(r, 'coffee')[0];
        const c: [number, number] | null = coffee ? [(coffee.x0 + coffee.x1) / 2, (coffee.y0 + coffee.y1) / 2] : centre(Fr, pend, 1.4);
        if (c && clear(Fr, c[0], c[1]) > 0.7) {
          const f = mk({ x: c[0], y: c[1], z: CEIL - 0.62, lm: 3200, cct: 3000, angle: 1.3, pen: 0.8, range: 8 });
          mRing(A, f, 0.6); pend.push(c);
        }
        for (const [x, y] of gridPts(r.poly, Fr, 1.7, 0.55)) if (pend.every(([px, py]) => Math.hypot(x - px, y - py) > 0.95)) dl(x, y, 420, 3000, 'a30');
        for (const s of itemsIn(r, 'sofa')) floorLamp(s, r);
        break;
      }
      case 'kitchen': {
        for (const [x, y] of gridPts(r.poly, Fr, 1.35, 0.45)) if (pend.every(([px, py]) => Math.hypot(x - px, y - py) > 0.7)) dl(x, y, 450, 3000, 'a30');
        break;
      }
      case 'bedroom': {
        const c = centre(Fr);
        if (c) mFlush(A, mk({ x: c[0], y: c[1], z: CEIL - 0.08, lm: 2400, cct: 3000, angle: 1.3, pen: 1, range: 7 }));
        for (const n of itemsIn(r, 'nightstand')) {
          const fr = itemFrame(n); const [x, y, z] = fr.pt(fr.W / 2, fr.D / 2, 0.84);
          mk({ x, y, z, lm: 220, cct: 2700, light: 'point', range: 3.2 });   // the lamp itself is furniture
        }
        break;
      }
      case 'bath': {
        const pts = gridPts(r.poly, Fr, 1.25, 0.32);
        for (const [x, y] of pts.length ? pts : [centre(Fr)!].filter(Boolean)) dl(x, y, 450, 4000, 'a40');
        for (const b of itemsIn(r, 'basin')) mirrorHalo(b);
        break;
      }
      default: {                                         // flat corridor / entrance hall / storage
        const pts = gridPts(r.poly, Fr, 1.25, r.area < 4 ? 0.3 : 0.35);
        for (const [x, y] of pts.length ? pts : [centre(Fr)!].filter(Boolean)) dl(x, y, 380, 3000, 'a30');
      }
    }
  }
  // worktop strips under the wall cabinets (whatever room the counter run stands in)
  for (const it of items.filter((i) => i.t === 'counter')) {
    const fr = itemFrame(it);
    if (fr.W < 0.5) continue;
    const g = new THREE.BoxGeometry(fr.W - 0.1, 0.012, 0.02); g.translate(fr.W / 2, 1.452, 0.29);
    const [x, y, z] = fr.pt(fr.W / 2, 0.24, 1.43);
    const [sx, sy] = fr.pt(fr.W / 2, 0.8);
    const f = mk({ x, y, z, sx, sy, lm: Math.round(280 * fr.W), cct: 4000, angle: 1.2, pen: 1, range: 3.5 });
    if (f.room === null) { const [qx, qy] = fr.pt(fr.W / 2, fr.D + 0.3); const r2 = roomOf(qx, qy); f.room = r2?.id ?? null; f.apt = r2?.apt ?? null; f.zone = 'apt'; }
    A.lens(f, 'a40', g, fr.m);
  }

  function floorLamp(s: Item, r: Room) {
    const fr = itemFrame(s);
    for (const u of [-0.3, fr.W + 0.3]) {
      const [x, y] = fr.pt(u, 0.3);
      if (clear(F(r), x, y) < 0.2 || items.some((o) => o !== s && x > o.x0 - 0.15 && x < o.x1 + 0.15 && y > o.y0 - 0.15 && y < o.y1 + 0.15)) continue;
      mFloorLamp(A, mk({ x, y, z: SLAB + 1.45, lm: 900, cct: 2700, light: 'point', range: 5 }));
      return;
    }
  }
  function mirrorHalo(b: Item) {
    const fr = itemFrame(b), W = fr.W, t = 0.012, v0 = 0.004, v1 = 0.011;
    const [x, y, z] = fr.pt(W / 2, 0.22, 1.95);
    const [sx, sy] = fr.pt(W / 2, 0.6);
    const f = mk({ x, y, z, sx, sy, lm: 480, cct: 4000, light: 'point', range: 3.5 });
    const strip = (u0: number, u1: number, h0: number, h1: number) => {
      const g = new THREE.BoxGeometry(u1 - u0, h1 - h0, v1 - v0); g.translate((u0 + u1) / 2, (h0 + h1) / 2, (v0 + v1) / 2);
      A.lens(f, 'a40', g, fr.m);
    };
    strip(0.05 - t, W - 0.05 + t, 1.85, 1.85 + t); strip(0.05 - t, W - 0.05 + t, 1.1 - t, 1.1);
    strip(0.05 - t, 0.05, 1.1, 1.85); strip(W - 0.05, W - 0.05 + t, 1.1, 1.85);
  }
  /** Wall light beside each door onto a balcony (flat balconies and the common air balcony). */
  function balconyLights(r: Room, cct: number, lens: MatKey) {
    for (const o of plan.openings) {
      if (o.kind === 'lift') continue;
      const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
      let face: number, nx = 0, ny = 0;
      if (o.axis === 'x') {
        if (pointInPoly(cx, o.y0 - 0.2, r.poly)) { face = o.y0; ny = -1; } else if (pointInPoly(cx, o.y1 + 0.2, r.poly)) { face = o.y1; ny = 1; } else continue;
        for (const x of [o.x1 + 0.3, o.x0 - 0.3]) {
          if (!pointInPoly(x, face + ny * 0.15, r.poly) || clear(F(r), x, face + ny * 0.15) < 0.08) continue;
          const f = mk({ x, y: face + ny * 0.25, z: 2.15 + SLAB, sx: x, sy: face + ny * 0.4, lm: 650, cct, light: 'point', range: 5 });
          mBulkhead(A, f, wallM(x, face, 2.15 + SLAB, 0, ny), 'grey', lens); break;
        }
      } else {
        if (pointInPoly(o.x0 - 0.2, cy, r.poly)) { face = o.x0; nx = -1; } else if (pointInPoly(o.x1 + 0.2, cy, r.poly)) { face = o.x1; nx = 1; } else continue;
        for (const y of [o.y1 + 0.3, o.y0 - 0.3]) {
          if (!pointInPoly(face + nx * 0.15, y, r.poly) || clear(F(r), face + nx * 0.15, y) < 0.08) continue;
          const f = mk({ x: face + nx * 0.25, y, z: 2.15 + SLAB, sx: face + nx * 0.4, sy: y, lm: 650, cct, light: 'point', range: 5 });
          mBulkhead(A, f, wallM(face, y, 2.15 + SLAB, nx, 0), 'grey', lens); break;
        }
      }
    }
  }

  // ---------- common areas
  const publicRoom = (r: Room) => r.apt === null && r.kind !== 'lift' && r.kind !== 'shop' && r.area > 2.5;
  for (const r of plan.rooms) {
    if (!publicRoom(r)) continue;
    if (key === '1' && !pointInPoly(18, 8.7, r.poly)) continue;           // ground floor: only the through corridor
    if (r === sr) continue;
    if (r.kind === 'balcony') { balconyLights(r, 4000, 'a40'); continue; }
    for (const [x, y] of ridgePts(F(r), 2.7)) mPanel(A, mk({ x, y, z: CEIL - 0.06, lm: 1300, cct: 4000, angle: 1.25, pen: 1, range: 7, zone: 'pub' }), 'a40');
  }
  // downlight over every flat's entrance door (lights the door and its number plate)
  for (const e of entries) {
    const x = e.hinge[0] + (e.u[0] * e.span) / 2 + e.n[0] * 0.45, y = e.hinge[1] + (e.u[1] * e.span) / 2 + e.n[1] * 0.45;
    mDownlight(A, mk({ x, y, z: CEIL - 0.03, lm: 320, cct: 4000, angle: 0.55, pen: 0.6, range: 5, zone: 'pub' }), 'a40');
  }
  // stair: panel over the floor landing, bulkhead on the wall of the half landing
  if (sr) {
    const b = polyBounds(sr.poly), cx = (b.x0 + b.x1) / 2;
    mPanel(A, mk({ x: cx, y: b.y1 - STAIR_LAND / 2, z: CEIL - 0.06, lm: 1100, cct: 4000, angle: 1.25, pen: 1, range: 7, zone: 'pub' }), 'a40');
    const zM = SLAB + FLOOR_H / 2 + 2.0;
    const f = mk({ x: cx, y: b.y0 + 0.25, z: zM, sx: cx, sy: b.y1 - 0.6, lm: 700, cct: 4000, light: 'point', range: 6, zone: 'pub' });
    f.room = sr.id;
    mBulkhead(A, f, wallM(cx, b.y0, zM, 0, 1));
  }
  // exit signs over the doors onto the evacuation route (corridor/lift hall → air balcony → stair)
  if (key !== '1') {
    const isBal = (r: Room | null) => !!r && r.apt === null && r.kind === 'balcony';
    const isIn = (r: Room | null) => !!r && publicRoom(r) && r.kind !== 'balcony' && r !== sr;
    for (const o of plan.openings) {
      if (o.kind === 'lift') continue;
      const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
      const sides = o.axis === 'x'
        ? [{ r: roomOf(cx, o.y0 - 0.2), x: cx, y: o.y0, nx: 0, ny: -1 }, { r: roomOf(cx, o.y1 + 0.2), x: cx, y: o.y1, nx: 0, ny: 1 }]
        : [{ r: roomOf(o.x0 - 0.2, cy), x: o.x0, y: cy, nx: -1, ny: 0 }, { r: roomOf(o.x1 + 0.2, cy), x: o.x1, y: cy, nx: 1, ny: 0 }];
      const [a, b] = sides;
      let s: typeof a | null = null;
      if (isIn(a.r) && isBal(b.r)) s = a; else if (isIn(b.r) && isBal(a.r)) s = b;
      else if ((a.r === sr && isBal(b.r)) || (b.r === sr && isBal(a.r))) s = a.r === sr ? b : a;
      if (!s) continue;
      mExit(A, wallM(s.x, s.y, 2.3 + 0.13, s.nx, s.ny));
      mk({ x: s.x + s.nx * 0.1, y: s.y + s.ny * 0.1, z: 2.6, lm: 0, cct: 4000, light: null, zone: 'pub' }).level = 1;
    }
  }
  // ground floor entrance hall: linear lines down the middle, up/down sconces by the door
  if (key === '1') {
    const cx = (HALL1.x0 + HALL1.x1) / 2;
    for (const y of [11.2, 13.55, 15.9]) mLinear(A, mk({ x: cx, y, z: CEIL - 0.065, lm: 1800, cct: 4000, angle: 1.25, pen: 1, range: 7, zone: 'pub' }), 1.5, false);
    for (const [x, nx] of [[HALL1.x0, 1], [HALL1.x1, -1]] as const) {
      const y = 16.9;
      const f = mk({ x: x + nx * 0.2, y, z: 2.2 + SLAB, sx: x + nx * 0.5, sy: y, lm: 600, cct: 3000, light: 'point', range: 5, zone: 'pub' });
      mSconce(A, f, wallM(x, y, 2.2 + SLAB, nx, 0));
    }
  }

  // ---------- meshes
  const M = lib();
  const group = new THREE.Group(); group.name = `lights-${key}`;
  for (const [m, parts] of A.parts) {
    const geo = mergeGeometries(parts.map(clean), false); if (!geo) continue;
    const mesh = new THREE.Mesh(geo, M[m]); mesh.name = 'fixtures-' + m; group.add(mesh);
  }
  const pubMats = new Map<number, THREE.MeshStandardMaterial>();
  for (const [id, parts] of A.pub) {
    const geo = mergeGeometries(parts.map(clean), false); if (!geo) continue;
    const base = fx[id].cct === 3000 ? M.a30 : M.a40;
    const mat = base.clone(); mat.name = 'light_pub';
    pubMats.set(id, mat);
    const mesh = new THREE.Mesh(geo, mat); mesh.name = 'fixture-pub'; group.add(mesh);
  }
  group.traverse((o) => { o.matrixAutoUpdate = true; (o as THREE.Mesh).castShadow = false; (o as THREE.Mesh).receiveShadow = false; });
  return { key, fixtures: fx, group, pubMats, roomOf };
}
function clean(g: THREE.BufferGeometry) {
  for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  return g;
}

// ---------------------------------------------------------------- runtime
/** Candela of a fixture in scene units. */
function candela(f: Fixture) {
  if (f.light === 'point') return (f.lm / (4 * Math.PI)) * K_LUX;
  const half = f.angle * (1 - f.pen * 0.5);
  return (f.lm / (2 * Math.PI * (1 - Math.cos(half)))) * K_LUX;
}
type Slot = { f: Fixture | null; next: Fixture | null; k: number };
export type Walker = { storey: number; x: number; y: number; sees: (ax: number, ay: number, bx: number, by: number) => boolean };

export class Lighting {
  readonly group = new THREE.Group();
  /** Pooled real lights near the visitor (only visible during the walk). */
  readonly rig = new THREE.Group();
  private data = new Map<FloorKey, KeyData>();
  private cur: { storey: number; d: KeyData } | null = null;
  private spots: THREE.SpotLight[] = [];
  private points: THREE.PointLight[] = [];
  private sSlots: Slot[] = [];
  private pSlots: Slot[] = [];
  private aptLevel = 0;
  private tick = 0;
  /** Renderer-dependent scale of the real lights and of the glowing diffusers (PRO: other tone mapping + bloom). */
  gain = 1;
  lensGain = 1;
  private lastRoom: number | null = null;

  constructor(nSpot: number, nPoint: number) {
    this.group.name = 'lighting'; this.rig.name = 'light-rig';
    for (let i = 0; i < nSpot; i++) {
      const l = new THREE.SpotLight('#fff', 0, 7, 0.6, 0.5, 2); l.castShadow = false; l.userData.pool = true;
      this.rig.add(l, l.target); this.spots.push(l); this.sSlots.push({ f: null, next: null, k: 0 });
    }
    for (let i = 0; i < nPoint; i++) {
      const l = new THREE.PointLight('#fff', 0, 6, 2); l.castShadow = false; l.userData.pool = true;
      this.rig.add(l); this.points.push(l); this.pSlots.push({ f: null, next: null, k: 0 });
    }
    this.rig.visible = false;
  }

  private key(storey: number): KeyData {
    const k: FloorKey = storey === 1 ? '1' : storey === 2 ? '2' : '3';
    let d = this.data.get(k);
    if (!d) { d = layout(k); this.data.set(k, d); }
    return d;
  }
  /** Fixtures of one storey are shown (walk storey / cut storey), or none. */
  show(storey: number | null) {
    if (storey === null) { if (this.cur) { this.group.remove(this.cur.d.group); this.cur = null; } return; }
    if (this.cur?.storey === storey) return;
    const d = this.key(storey);
    if (this.cur && this.cur.d !== d) this.group.remove(this.cur.d.group);
    d.group.position.y = (storey - 1) * FLOOR_H;
    if (d.group.parent !== this.group) this.group.add(d.group);
    d.fixtures.forEach((f) => { if (f.light && f.zone === 'pub') { f.level = 0; f.hold = 0; } });
    d.pubMats.forEach((m) => (m.emissiveIntensity = 0));
    this.cur = { storey, d };
    this.sSlots.concat(this.pSlots).forEach((s) => { s.f = null; s.next = null; s.k = 0; });
  }
  get storey() { return this.cur?.storey ?? null; }
  fixtureCount() { return this.cur?.d.fixtures.length ?? 0; }

  /** Advance fades and sensors; returns true when anything visible changed. */
  update(dt: number, o: { walker: Walker | null; aptOn: boolean; nightF: number; rig: boolean }) {
    let changed = false;
    dt = Math.min(dt, 0.1);
    // flats: all lights of the flats switch together (toggle / evening)
    const at = o.aptOn ? 1 : 0;
    if (this.aptLevel !== at) {
      this.aptLevel = at > this.aptLevel ? Math.min(1, this.aptLevel + dt * 3) : Math.max(0, this.aptLevel - dt * 3);
      const M = lib();
      for (const m of [M.a27, M.a30, M.a40]) m.emissiveIntensity = LENS_ON * this.lensGain * this.aptLevel;
      M.shadeIn.emissiveIntensity = 1.6 * this.aptLevel; M.fabric.emissiveIntensity = 0.45 * this.aptLevel;
      (furnitureMaterials().lamp as THREE.MeshStandardMaterial).emissiveIntensity = 0.25 + 1.3 * this.aptLevel;
      changed = true;
    }
    const cur = this.cur;
    if (!cur) return changed;
    const w = o.walker && o.walker.storey === cur.storey ? o.walker : null;
    this.tick -= dt;
    const sense = this.tick <= 0;
    if (sense) this.tick = 0.15;
    const wRoom = w && sense ? cur.d.roomOf(w.x, w.y)?.id ?? null : this.lastRoom;
    if (sense) this.lastRoom = wRoom;
    // common areas: motion sensors during the walk, all on after dusk otherwise
    for (const f of cur.d.fixtures) {
      if (f.zone !== 'pub' || !f.light) continue;
      let want: number;
      if (o.walker) {
        if (w && sense) {
          const d = Math.hypot(w.x - f.sx, w.y - f.sy);
          if (d < 6 && (f.room === wRoom || d < 2.2 || w.sees(w.x, w.y, f.sx, f.sy))) f.hold = 8;
        }
        f.hold = Math.max(0, f.hold - dt);
        want = f.hold > 0 ? 1 : 0;
      } else want = o.nightF > 0.25 ? 1 : 0;
      if (f.level !== want) {
        f.level = want > f.level ? Math.min(1, f.level + dt * 2.5) : Math.max(0, f.level - dt * 0.8);
        const m = cur.d.pubMats.get(f.id); if (m) m.emissiveIntensity = LENS_ON * this.lensGain * f.level;
        changed = true;
      }
    }
    // pooled real lights (the pool stays in the scene for the whole walk: changing the light count recompiles shaders)
    this.rig.visible = o.rig;
    if (!o.rig) return changed;
    if (!w) for (const s of this.sSlots.concat(this.pSlots)) s.next = null;      // lift cabin, ride: fade out
    else if (sense) {
      const cand: { f: Fixture; s: number }[] = [];
      for (const f of cur.d.fixtures) {
        if (!f.light) continue;
        const lvl = f.zone === 'apt' ? this.aptLevel : f.level;
        if (lvl < 0.02 && !(f.zone === 'pub' && f.hold > 0)) continue;
        const d = Math.hypot(w.x - f.sx, w.y - f.sy);
        if (d > 11) continue;
        const same = f.room !== null && f.room === wRoom;
        if (!same && !w.sees(w.x, w.y, f.sx, f.sy)) continue;
        cand.push({ f, s: d - (same ? 4 : 0) - Math.min(1.5, f.lm / 1500) });
      }
      cand.sort((a, b) => a.s - b.s);
      const pick = (slots: Slot[], kind: 'spot' | 'point') => {
        const want = cand.filter((c) => c.f.light === kind).slice(0, slots.length).map((c) => c.f);
        const keep = new Set<Fixture>();
        for (const s of slots) if (s.f && want.includes(s.f)) { s.next = s.f; keep.add(s.f); }
        const rest = want.filter((f) => !keep.has(f));
        for (const s of slots) if (!s.f || !want.includes(s.f)) s.next = rest.shift() ?? null;
      };
      pick(this.sSlots, 'spot'); pick(this.pSlots, 'point');
    }
    const base = (cur.storey - 1) * FLOOR_H;
    const run = (slots: Slot[], lights: (THREE.SpotLight | THREE.PointLight)[]) => slots.forEach((s, i) => {
      if (s.next !== s.f) { s.k = Math.max(0, s.k - dt / 0.18); if (s.k === 0) s.f = s.next; }
      else if (s.f && s.k < 1) s.k = Math.min(1, s.k + dt / 0.3);
      const l = lights[i], f = s.f;
      const lvl = f ? (f.zone === 'apt' ? this.aptLevel : f.level) : 0;
      const I = f ? candela(f) * this.gain * lvl * s.k : 0;
      if (Math.abs(l.intensity - I) > 1e-4) changed = true;
      l.intensity = I;
      if (!f) return;
      l.position.set(f.x, base + f.z, f.y);
      l.color.set(CCT[f.cct]);
      l.distance = f.range;
      if ((l as THREE.SpotLight).isSpotLight) {
        const sl = l as THREE.SpotLight;
        sl.angle = f.angle; sl.penumbra = f.pen; sl.target.position.set(f.x, base + f.z - 1, f.y);
      }
    });
    run(this.sSlots, this.spots); run(this.pSlots, this.points);
    return changed;
  }

  /** PRO path tracer: real lights for the lit fixtures that can reach the visitor (world space): the whole flat the
   *  visitor is in, and the common-area fixtures in sight. */
  allLights(near: (Walker & { apt: number | null }) | null, radius = 12): THREE.Light[] {
    const cur = this.cur; if (!cur) return [];
    const out: THREE.Light[] = [];
    const base = (cur.storey - 1) * FLOOR_H;
    const parent = this.group.parent;
    parent?.updateMatrixWorld(true);
    const toWorld = (v: THREE.Vector3) => (parent ? v.applyMatrix4(parent.matrixWorld) : v);
    for (const f of cur.d.fixtures) {
      if (!f.light) continue;
      const lvl = f.zone === 'apt' ? this.aptLevel : f.level;
      if (lvl < 0.05) continue;
      if (near) {
        if (Math.hypot(near.x - f.sx, near.y - f.sy) > radius) continue;
        const sameFlat = near.apt !== null && f.apt === near.apt;
        if (!sameFlat && !near.sees(near.x, near.y, f.sx, f.sy)) continue;
      }
      const p = toWorld(new THREE.Vector3(f.x, base + f.z, f.y));
      if (f.light === 'spot') {
        const l = new THREE.SpotLight(CCT[f.cct], candela(f) * this.gain * lvl, f.range * 1.4, f.angle, f.pen, 2);
        (l as unknown as { radius: number }).radius = 0.03;
        l.position.copy(p); l.target.position.copy(toWorld(new THREE.Vector3(f.x, base + f.z - 1, f.y)));
        l.updateMatrixWorld(); l.target.updateMatrixWorld();
        out.push(l);
      } else {
        const l = new THREE.PointLight(CCT[f.cct], candela(f) * this.gain * lvl, f.range * 1.4, 2);
        l.position.copy(p); l.updateMatrixWorld();
        out.push(l);
      }
    }
    return out;
  }
}
