// Surroundings of the complex: neighbourhood houses, streets with a 15 cm curb, sidewalks, markings, parks.
// Data: public/context/context.json (tools/context.py, from a CADMapper / OpenStreetMap DXF).
// Heights: estimate in the file  →  public/context/overrides.json  →  this browser's edits (?edit=1), last one wins.
import * as THREE from 'three';
import { Forest, RealForest, realTreesOk, type TreeAt } from './trees';
import { Lamps } from './lamps';

export type Roof = 'pitched' | 'flat';
export type CtxBuilding = { id: string; p: number[]; f: number; r: Roof; s: 'est' | 'osm'; a: number };
type Tri = { v: number[]; i: number[] };
export type CtxData = { site: number[]; buildings: CtxBuilding[]; road: Tri; walk: Tri; paths: Tri; parks: Tri; dashes: number[][]; streetTrees?: number[][]; yardTrees?: number[][]; lamps?: number[][] };
export type Override = { floors?: number; roof?: Roof; hidden?: boolean };
export type Overrides = Record<string, Override>;
export type CtxStyle = 'real' | 'white';

export const FLOOR_M = 3.0;
const CURB_H = 0.15;
const Y_ROAD = 0.03, Y_PATH = 0.04, Y_PARK = 0.025, Y_PAINT = 0.036;
/** street surfaces (public-pro/pro/tex, tools/road_textures.py); swap here to change the look */
export const STREET = { road: 'asphalt_new', walk: 'pavers_grey', path: 'pavers_grey' };
const TILE: Record<string, number> = { asphalt_new: 4, asphalt_old: 8, pavers_grey: 1.2, pavers_red: 1.2, pavers_mix: 1.2, slab30: 1.2, roadpaint: 1 };

const LS_KEY = 'om-ctx-edits';
export function loadLocalEdits(): Overrides {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
export function saveLocalEdits(o: Overrides) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch { /* storage blocked */ }
}

export async function loadContext(): Promise<{ data: CtxData; file: Overrides } | null> {
  try {
    const r = await fetch('context/context.json');
    if (!r.ok) return null;
    const data = (await r.json()) as CtxData;
    let file: Overrides = {};
    try { const o = await fetch('context/overrides.json'); if (o.ok) file = await o.json(); } catch { /* optional */ }
    return { data, file };
  } catch { return null; }
}

/** effective floors / roof / visibility of one building */
export function resolve(b: CtxBuilding, ...layers: Overrides[]) {
  let floors = b.f, roof = b.r, hidden = false, edited = false;
  for (const L of layers) {
    const o = L[b.id];
    if (!o) continue;
    if (o.floors !== undefined) { floors = o.floors; edited = true; }
    if (o.roof !== undefined) { roof = o.roof; edited = true; }
    if (o.hidden !== undefined) { hidden = o.hidden; edited = true; }
  }
  return { floors, roof, hidden, edited };
}

// ---------------------------------------------------------------- helpers
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
const WALLS_SMALL = ['#e9dfcc', '#efe9de', '#dcc8a8', '#e4d3b8', '#d2b48f', '#f1ede4', '#c9a585'];
const WALLS_BIG = ['#ddd7cc', '#e6e1d7', '#cfc8bc', '#e9e4da'];
const ROOFS = ['#9a4436', '#8a3a2f', '#4f7a5c', '#5b6f7e', '#8e9396', '#a65243', '#7c8285'];
const ROOF_FLAT = '#8f8d88';
const ROAD_FALLBACK = '#3f3f42';

/** minimum-area rectangle over the polygon's own edge directions → centre, axes, half sizes (long axis first) */
function obb(p: number[]) {
  const n = p.length / 2;
  let best = { area: Infinity, ux: 1, uz: 0, c: [0, 0], hu: 0, hv: 0 };
  for (let k = 0; k < n; k++) {
    const dx = p[((k + 1) % n) * 2] - p[k * 2], dz = p[((k + 1) % n) * 2 + 1] - p[k * 2 + 1];
    const l = Math.hypot(dx, dz); if (l < 0.3) continue;
    const ux = dx / l, uz = dz / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let j = 0; j < n; j++) {
      const x = p[j * 2], z = p[j * 2 + 1];
      const u = x * ux + z * uz, v = -x * uz + z * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const a = (u1 - u0) * (v1 - v0);
    if (a < best.area) {
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      best = { area: a, ux, uz, c: [cu * ux - cv * uz, cu * uz + cv * ux], hu: (u1 - u0) / 2, hv: (v1 - v0) / 2 };
    }
  }
  if (best.hv > best.hu) best = { ...best, ux: -best.uz, uz: best.ux, hu: best.hv, hv: best.hu };
  return best;
}

/** growing arrays for one merged mesh */
class Buf {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = [];
  tri(a: number[], b: number[], c: number[], color: THREE.Color, uvs?: number[][]) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const [k, v] of [a, b, c].entries()) {
      this.pos.push(v[0], v[1], v[2]); this.nor.push(nx, ny, nz); this.col.push(color.r, color.g, color.b);
      const t = uvs ? uvs[k] : [v[0] / 3, v[2] / 3]; this.uv.push(t[0], t[1]);
    }
  }
  quad(a: number[], b: number[], c: number[], d: number[], color: THREE.Color, uvs?: number[][]) {
    this.tri(a, b, c, color, uvs && [uvs[0], uvs[1], uvs[2]]); this.tri(a, c, d, color, uvs && [uvs[0], uvs[2], uvs[3]]);
  }
  get count() { return this.pos.length / 3; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** WIN × WIN bays (3.2 m) by storeys (3 m) per texture: enough variety for the night lights to look random */
const WIN = 4;
function windowTexture() {
  // plaster with windows; tinted per house by the vertex colour
  const T = 128, c = document.createElement('canvas'); c.width = c.height = T * WIN;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, T * WIN, T * WIN);
  for (let i = 0; i < WIN; i++) for (let j = 0; j < WIN; j++) {
    const x = i * T, y = j * T;
    g.fillStyle = '#5d6b76'; g.fillRect(x + 40, y + 36, 48, 56);
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x + 40, y + 36, 48, 16);
    g.fillStyle = '#e8e4dc'; g.fillRect(x + 36, y + 92, 56, 5); g.fillRect(x + 62, y + 36, 4, 56);
    g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(x, y + 122, T, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
/** the same grid at night: about a third of the windows lit, warm (a few cool) */
function litTexture() {
  const T = 128, c = document.createElement('canvas'); c.width = c.height = T * WIN;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, T * WIN, T * WIN);
  let sd = 21; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const warm = ['#ffcf8f', '#ffdca8', '#ffe8c4', '#f7c27a', '#d9e6ff'];
  for (let i = 0; i < WIN; i++) for (let j = 0; j < WIN; j++) {
    if (r() > 0.36) continue;
    g.fillStyle = warm[Math.floor(r() * warm.length)];
    g.fillRect(i * T + 40, j * T + 36, 48, 56);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function streetTex(name: string, kind: 'a' | 'n') {
  const t = new THREE.TextureLoader().load(`pro/tex/${name}_${kind}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = kind === 'a' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}
function streetMat(name: string, fallback: string) {
  return new THREE.MeshStandardMaterial({ color: '#ffffff', map: streetTex(name, 'a'), normalMap: streetTex(name, 'n'), roughness: 0.9, userData: { fallback } });
}

/** flat triangulated layer at height y with world-metre UVs */
function flat(t: Tri, y: number, tile: number) {
  const n = t.v.length / 2, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let k = 0; k < n; k++) {
    const x = t.v[k * 2], z = t.v[k * 2 + 1];
    pos.set([x, y, z], k * 3); uv.set([x / tile, -z / tile], k * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // earcut winding may be either way: make every triangle face up
  const idx = t.i.slice();
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    const cr = (t.v[b * 2] - t.v[a * 2]) * (t.v[c * 2 + 1] - t.v[a * 2 + 1]) - (t.v[b * 2 + 1] - t.v[a * 2 + 1]) * (t.v[c * 2] - t.v[a * 2]);
    if (cr > 0) { idx[k + 1] = c; idx[k + 2] = b; }
  }
  g.setIndex(idx);
  const nor = new Float32Array(n * 3); for (let k = 0; k < n; k++) nor[k * 3 + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

/** boundary edges of a triangle mesh (edges used by exactly one triangle) → vertical faces y0..y1 */
function skirt(t: Tri, y0: number, y1: number) {
  const cnt = new Map<string, [number, number]>();
  for (let k = 0; k < t.i.length; k += 3) {
    for (let e = 0; e < 3; e++) {
      const a = t.i[k + e], b = t.i[k + ((e + 1) % 3)];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (cnt.has(key)) cnt.delete(key); else cnt.set(key, [a, b]);
    }
  }
  const pos: number[] = [], uv: number[] = [];
  for (const [a, b] of cnt.values()) {
    const ax = t.v[a * 2], az = t.v[a * 2 + 1], bx = t.v[b * 2], bz = t.v[b * 2 + 1];
    const l = Math.hypot(bx - ax, bz - az);
    pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
    uv.push(0, 0, l, 0, l, 0.15, 0, 0, l, 0.15, 0, 0.15);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- the context layer
export class Context {
  readonly group = new THREE.Group();
  private houses: THREE.Mesh | null = null;
  private roofs: THREE.Mesh | null = null;
  private sel: THREE.Mesh | null = null;
  private triOwner: Int32Array = new Int32Array(0);      // wall/roof triangle → building index
  private roofOwner: Int32Array = new Int32Array(0);
  private wallMat: THREE.MeshStandardMaterial;
  private winTex: THREE.Texture;
  private roofMat: THREE.MeshStandardMaterial;
  private street: THREE.MeshStandardMaterial[] = [];
  private style: CtxStyle = 'real';
  private forest: Forest | null = null;
  private layers: Overrides[] = [];

  constructor(readonly data: CtxData, private onChange: () => void) {
    this.winTex = windowTexture();
    this.wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.winTex, roughness: 0.92, emissiveMap: litTexture(), emissive: '#ffffff', emissiveIntensity: 0 });
    this.roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.15, side: THREE.DoubleSide });
    this.buildStreets();
    this.buildTrees();
    if (data.lamps?.length) { this.lamps = new Lamps(data.lamps, [], CURB_H); this.group.add(this.lamps.group); }
  }
  private lamps: Lamps | null = null;
  private night = 0;
  /** 0 day … 1 night: lit windows and street lamps */
  setNight(n: number) {
    this.night = n;
    this.wallMat.emissiveIntensity = this.style === 'white' ? 0 : 1.3 * n;
    this.lamps?.setNight(this.style === 'white' ? 0 : n);
  }

  /** street trees on the sidewalks (poplars on main roads, plane trees elsewhere) and fruit trees in the yards */
  private buildTrees() {
    const d = this.data, list: TreeAt[] = [];
    let s = 9; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (const [x, z, k] of d.streetTrees ?? []) list.push({ x, z, y: CURB_H, kind: k === 0 ? 'terak' : 'chinor', s: k === 0 ? 0.9 : 0.75 + r() * 0.3 });
    for (const [x, z] of d.yardTrees ?? []) {
      const v = r();
      list.push(v < 0.7 ? { x, z, kind: 'mevali', s: 0.8 + r() * 0.5 } : v < 0.85 ? { x, z, kind: 'chinor', s: 0.6 + r() * 0.3 } : { x, z, kind: 'archa', s: 0.8 + r() * 0.4 });
    }
    if (!list.length) return;
    this.forest = new Forest(list);
    this.group.add(this.forest.group);
  }

  private buildStreets() {
    const d = this.data;
    const road = streetMat(STREET.road, ROAD_FALLBACK), walk = streetMat(STREET.walk, '#a3a09a'), path = streetMat(STREET.path, '#a3a09a');
    const curb = new THREE.MeshStandardMaterial({ color: '#c3bfb6', roughness: 0.8, side: THREE.DoubleSide });
    const park = new THREE.MeshStandardMaterial({ color: '#6f8f4c', roughness: 1 });
    const paint = new THREE.MeshStandardMaterial({ color: '#f1efe8', roughness: 0.6 });
    this.street = [road, walk, path];
    const add = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true) => {
      const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = shadow; this.group.add(mesh); return mesh;
    };
    add(flat(d.road, Y_ROAD, TILE[STREET.road]), road);
    add(flat(d.walk, CURB_H, TILE[STREET.walk]), walk);
    add(skirt(d.road, Y_ROAD - 0.02, CURB_H), curb);           // 15 cm curb along every road edge
    add(skirt(d.walk, -0.02, CURB_H), curb);                   // outer edge of the raised sidewalk
    add(flat(d.paths, Y_PATH, TILE[STREET.path]), path);
    add(flat(d.parks, Y_PARK, 4), park);
    if (d.dashes.length) {
      const b = new Buf(), white = new THREE.Color('#ffffff');
      for (const [x0, z0, x1, z1] of d.dashes) {
        const l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / l * 0.08, nz = (x1 - x0) / l * 0.08;
        b.quad([x0 - nx, Y_PAINT, z0 - nz], [x0 + nx, Y_PAINT, z0 + nz], [x1 + nx, Y_PAINT, z1 + nz], [x1 - nx, Y_PAINT, z1 - nz], white);
      }
      const g = b.geometry(); g.deleteAttribute('color');
      const m = add(g, paint); m.material = paint; (paint as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    }
  }

  /** (re)build all houses from the data + override layers (file, then this browser's edits) */
  build(...layers: Overrides[]) {
    this.layers = layers;
    const walls = new Buf(), roofs = new Buf();
    const wOwn: number[] = [], rOwn: number[] = [];
    const tmp = new THREE.Color();
    this.data.buildings.forEach((b, bi) => {
      const r = resolve(b, ...layers);
      if (r.hidden || r.floors <= 0) return;
      const big = b.a > 600 || r.floors >= 4;
      const h = r.floors * FLOOR_M + (r.roof === 'flat' ? 0.6 : 0.2);
      const p = b.p, n = p.length / 2;
      const wall = tmp.set((big ? WALLS_BIG : WALLS_SMALL)[Math.floor(hash(b.id) * (big ? WALLS_BIG : WALLS_SMALL).length)]).clone();
      const w0 = walls.count;
      let run = 0;
      for (let k = 0; k < n; k++) {
        const ax = p[k * 2], az = p[k * 2 + 1], bx = p[((k + 1) % n) * 2], bz = p[((k + 1) % n) * 2 + 1];
        const l = Math.hypot(bx - ax, bz - az);
        // UVs: one texture repeat = 3.2 m bay × 3 m storey; walls < 2.4 m wide stay blank (u stays in the plaster margin)
        const u0 = run / 3.2 / WIN, u1 = (run + l) / 3.2 / WIN, vt = h / FLOOR_M / WIN;
        // footprints are counter-clockwise in (x, z): b→a keeps the face pointing outward
        walls.quad([bx, 0, bz], [ax, 0, az], [ax, h, az], [bx, h, bz], wall, [[u1, 0], [u0, 0], [u0, vt], [u1, vt]]);
        run += l;
      }
      for (let k = w0 / 3; k < walls.count / 3; k++) wOwn.push(bi);
      const r0 = roofs.count;
      if (r.roof === 'flat') {
        const pts = Array.from({ length: n }, (_, k) => new THREE.Vector2(p[k * 2], p[k * 2 + 1]));
        const tris = THREE.ShapeUtils.triangulateShape(pts, []);
        const c = tmp.set(ROOF_FLAT).clone().multiplyScalar(0.92 + 0.16 * hash(b.id + 'r'));
        for (const [a, bb, cc] of tris) {
          const A = [p[a * 2], h, p[a * 2 + 1]], B = [p[bb * 2], h, p[bb * 2 + 1]], C = [p[cc * 2], h, p[cc * 2 + 1]];
          // keep the face pointing up whatever the winding
          const up = (B[0] - A[0]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[0] - A[0]) < 0;
          if (up) roofs.tri(A, B, C, c); else roofs.tri(A, C, B, c);
        }
      } else {
        const o = obb(p), ov = 0.35;
        const hu = o.hu + ov, hv = o.hv + ov, rh = Math.min(2.6, 0.62 * hv);
        const hip = o.hu / Math.max(o.hv, 0.1) < 1.6 || hash(b.id + 'h') < 0.5;   // hipped roofs are the local default
        const ridge = hip ? Math.max(0, hu - hv) : hu;
        const P = (u: number, v: number, y: number) => [o.c[0] + u * o.ux - v * o.uz, y, o.c[1] + u * o.uz + v * o.ux];
        const ey = h - 0.2;
        const c = tmp.set(ROOFS[Math.floor(hash(b.id + 'c') * ROOFS.length)]).clone();
        const a1 = P(-hu, -hv, ey), a2 = P(hu, -hv, ey), a3 = P(hu, hv, ey), a4 = P(-hu, hv, ey);
        const r1 = P(-ridge, 0, ey + rh), r2 = P(ridge, 0, ey + rh);
        roofs.quad(a1, r1, r2, a2, c);                // slope on −v side
        roofs.quad(a3, r2, r1, a4, c);                // slope on +v side
        if (hip) { roofs.tri(a2, r2, a3, c); roofs.tri(a4, r1, a1, c); }
        else { roofs.tri(a2, r2, a3, wall); roofs.tri(a4, r1, a1, wall); }   // gable ends in wall colour
      }
      for (let k = r0 / 3; k < roofs.count / 3; k++) rOwn.push(bi);
    });
    for (const m of [this.houses, this.roofs]) if (m) { this.group.remove(m); m.geometry.dispose(); }
    this.houses = new THREE.Mesh(walls.geometry(), this.wallMat);
    this.roofs = new THREE.Mesh(roofs.geometry(), this.roofMat);
    for (const m of [this.houses, this.roofs]) { m.castShadow = m.receiveShadow = true; this.group.add(m); }
    this.triOwner = Int32Array.from(wOwn); this.roofOwner = Int32Array.from(rOwn);
    this.applyStyle();
    this.onChange();
  }

  setStyle(s: CtxStyle) { this.style = s; this.applyStyle(); this.setNight(this.night); this.onChange(); }
  private applyStyle() {
    const white = this.style === 'white';
    this.wallMat.vertexColors = this.roofMat.vertexColors = !white;
    this.wallMat.map = white ? null : this.winTex;
    this.wallMat.color.set(white ? '#f4f3f0' : '#ffffff');
    this.roofMat.color.set(white ? '#e4e3df' : '#ffffff');
    this.wallMat.needsUpdate = this.roofMat.needsUpdate = true;
    this.forest?.setWhite(white);
    for (const m of this.street) {
      const u = m.userData as { fallback: string; map?: THREE.Texture; normalMap?: THREE.Texture };
      if (m.map) { u.map = m.map; u.normalMap = m.normalMap ?? undefined; }
      m.map = white ? null : u.map ?? null;
      m.normalMap = white ? null : u.normalMap ?? null;
      m.color.set(white ? (u.fallback === ROAD_FALLBACK ? '#cfcecb' : '#ebeae6') : '#ffffff');
      m.needsUpdate = true;
    }
  }

  /** building index under the ray, or -1 */
  pick(ray: THREE.Raycaster): number {
    const hits = ray.intersectObjects([this.houses, this.roofs].filter(Boolean) as THREE.Object3D[], false);
    const h = hits[0];
    if (!h || h.faceIndex === undefined || h.faceIndex === null) return -1;
    return (h.object === this.houses ? this.triOwner : this.roofOwner)[h.faceIndex] ?? -1;
  }

  /** gold outline boxes over the selected buildings */
  showSelection(ids: Set<string>) {
    if (this.sel) { this.group.remove(this.sel); this.sel.geometry.dispose(); this.sel = null; }
    if (!ids.size) { this.onChange(); return; }
    const b = new Buf(), gold = new THREE.Color('#e3b878');
    for (const bd of this.data.buildings) {
      if (!ids.has(bd.id)) continue;
      const r = resolve(bd, ...this.layers);
      const h = Math.max(r.floors, 0) * FLOOR_M + (r.roof === 'flat' ? 0.7 : 2.9);
      // inflate the outline 0.3 m so it does not sit in the wall planes
      const n = bd.p.length / 2;
      let cx = 0, cz = 0; for (let k = 0; k < n; k++) { cx += bd.p[k * 2]; cz += bd.p[k * 2 + 1]; }
      cx /= n; cz /= n;
      const p = bd.p.map((v, j) => {
        const k = j >> 1, dx = bd.p[k * 2] - cx, dz = bd.p[k * 2 + 1] - cz, l = Math.hypot(dx, dz) || 1;
        return v + (j & 1 ? dz : dx) / l * 0.3;
      });
      for (let k = 0; k < n; k++) {
        const ax = p[k * 2], az = p[k * 2 + 1], bx = p[((k + 1) % n) * 2], bz = p[((k + 1) % n) * 2 + 1];
        b.quad([ax, 0, az], [bx, 0, bz], [bx, h + 0.3, bz], [ax, h + 0.3, az], gold);
      }
    }
    const g = b.geometry();
    this.sel = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#e3b878', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    this.sel.renderOrder = 5;
    this.group.add(this.sel);
    this.onChange();
  }

  /** centre of a building in scene coordinates (for box selection) */
  centre(i: number) {
    const p = this.data.buildings[i].p; let x = 0, z = 0; const n = p.length / 2;
    for (let k = 0; k < n; k++) { x += p[k * 2]; z += p[k * 2 + 1]; }
    return new THREE.Vector3(x / n, 2, z / n);
  }
}

/** plan.jpg clipped to the site outline (UVs of the full plan image) */
export function siteGeometry(site: number[], planW: number, planD: number) {
  const shape = new THREE.Shape();
  for (let k = 0; k < site.length / 2; k++) {
    const x = site[k * 2], z = site[k * 2 + 1];
    if (k === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z);   // shape is in the plane's local (x, y = −z)
  }
  const g = new THREE.ShapeGeometry(shape);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / planW + 0.5, pos.getY(i) / planD + 0.5);
  return g;
}

// ---------------------------------------------------------------- landscaping inside the site
// public/context/courtyard.json (tools/courtyard.py, read from plan.jpg): planted beds raised 15 cm behind a curb,
// trees on them, young trees in the paving; the rest of the site is paved.
export type CourtData = { lawn: Tri; trees: number[][]; young: number[][]; lamps?: number[][] };

export async function loadCourtyard(): Promise<CourtData | null> {
  try { const r = await fetch('context/courtyard.json'); return r.ok ? ((await r.json()) as CourtData) : null; } catch { return null; }
}

function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6c8f45'; g.fillRect(0, 0, 256, 256);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) {
    const v = r();
    g.fillStyle = v < 0.33 ? 'rgba(48,82,30,.35)' : v < 0.66 ? 'rgba(140,170,80,.28)' : 'rgba(95,128,55,.4)';
    const x = r() * 256, y = r() * 256; g.fillRect(x, y, 1 + r() * 2, 2 + r() * 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export class Courtyard {
  readonly group = new THREE.Group();
  private paving: THREE.MeshStandardMaterial;
  private grass: THREE.MeshStandardMaterial;
  private grassTex: THREE.Texture;
  private forest: Forest;

  /** cut: trees to leave out (they stand on a footpath, see tools/yard.py) */
  constructor(c: CourtData, site: number[], cut: number[][] = []) {
    this.paving = streetMat(STREET.walk, '#a3a09a');
    this.grassTex = grassTexture();
    this.grass = new THREE.MeshStandardMaterial({ map: this.grassTex, roughness: 1 });
    const curb = new THREE.MeshStandardMaterial({ color: '#c3bfb6', roughness: 0.8, side: THREE.DoubleSide });

    // paving over the whole site
    const pts = Array.from({ length: site.length / 2 }, (_, k) => new THREE.Vector2(site[k * 2], site[k * 2 + 1]));
    const tris = THREE.ShapeUtils.triangulateShape(pts, []);
    const pave: Tri = { v: site.slice(), i: tris.flat() };
    const add = (g: THREE.BufferGeometry, m: THREE.Material) => { const o = new THREE.Mesh(g, m); o.receiveShadow = true; this.group.add(o); return o; };
    add(flat(pave, 0.035, TILE[STREET.walk]), this.paving);
    // planted beds, 15 cm up behind a curb
    add(flat(c.lawn, CURB_H + 0.01, 2.5), this.grass);
    add(skirt(c.lawn, 0.02, CURB_H + 0.01), curb);

    // trees from the plan: big crowns → plane trees, smaller → fruit trees; young trees in the paving → junipers / fruit
    const list: TreeAt[] = [];
    let sd = 4; const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const gone = new Set(cut.map(([x, z]) => `${x},${z}`));
    for (const [x, z, r] of c.trees) if (!gone.has(`${x},${z}`)) list.push(r > 2.3 ? { x, z, y: CURB_H + 0.01, kind: 'chinor', s: Math.min(1, r / 3.6) } : { x, z, y: CURB_H + 0.01, kind: 'mevali', s: Math.max(0.7, r / 2.2) });
    for (const [x, z] of c.young) list.push({ x, z, y: 0.035, kind: rr() < 0.5 ? 'archa' : 'mevali', s: 0.6 + rr() * 0.2 });
    this.forest = new Forest(list);
    this.group.add(this.forest.group);
    // real GLB trees replace the card trees once loaded (desktop only: they are much heavier)
    if (realTreesOk()) {
      const real = new RealForest(list);
      real.ready.then((ok) => { if (!ok) return; this.group.remove(this.forest.group); this.real = real; real.setWhite(this.white); this.group.add(real.group); });
    }
    if (c.lamps?.length) { this.lamps = new Lamps([], c.lamps, CURB_H, 0.035); this.group.add(this.lamps.group); }
  }
  private lamps: Lamps | null = null;
  private real: RealForest | null = null;
  private white = false;
  private night = 0;
  setNight(n: number) { this.night = n; this.lamps?.setNight(this.white ? 0 : n); }

  setStyle(s: CtxStyle) {
    const white = s === 'white';
    this.white = white; this.setNight(this.night);
    const u = this.paving.userData as { map?: THREE.Texture; normalMap?: THREE.Texture };
    if (this.paving.map) { u.map = this.paving.map; u.normalMap = this.paving.normalMap ?? undefined; }
    this.paving.map = white ? null : u.map ?? null; this.paving.normalMap = white ? null : u.normalMap ?? null;
    this.paving.color.set(white ? '#ebeae6' : '#ffffff');
    this.grass.map = white ? null : this.grassTex; this.grass.color.set(white ? '#dcdcd6' : '#ffffff');
    this.forest.setWhite(white); this.real?.setWhite(white);
    for (const mt of [this.paving, this.grass]) mt.needsUpdate = true;
  }
}
