// Real places next to the complex that the generated neighbourhood got wrong, drawn from their own data
// (public/context/places.json, tools/place/*.mjs). One so far: the "Intil" school (the former Onodera building) west
// of block 1 — a 3-storey building with a taller entrance portal on Kukcha Darvoza and two glass atria on the roof,
// a paved forecourt behind a fence and a gate with a gatehouse, flower beds and thuja cones along the fence, a turf
// mini-pitch, an asphalt court and an open-air pool. Its trees (found in satellite imagery) and the ground inside
// its `area` (no generated trees) are handled by context.ts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CtxBuilding } from './context';
import { bar, bx, canvasTex, flowerTex, meshTex, place } from './yard';
import { glbInstances, type GlbItem } from './glbInstances';
import { nodes } from './gpu';

type Rect = { cx: number; cz: number; deg: number; w: number; d: number };
export type IntilLayout = {
  building: { footprint: number[]; floors: number; storey: number; portal: { x: number; w: number; d: number; h: number } };
  forecourt: number[]; drive: number[]; apron: number[]; gate: { x0: number; x1: number; z: number }; gatehouse: number[];
  fence: number[][]; beds: number[][]; pitch: Rect; court: Rect; pool: Rect;
};
export type Place = {
  id: string; name: string;
  /** no generated trees inside; `trees` instead (x, z, kind, scale) */
  area: number[]; trees: [number, number, string, number][];
  /** context buildings this place draws itself, and extra plain ones */
  replace: string[]; buildings: CtxBuilding[];
  /** hard ground: no tree of any kind stands on these */
  clear: number[][];
  layout: IntilLayout;
};
export async function loadPlaces(): Promise<Place[]> {
  try { const r = await fetch('context/places.json'); return r.ok ? ((await r.json()) as { places: Place[] }).places : []; } catch { return []; }
}

// ---------------------------------------------------------------- small geometry helpers
/** quads with an explicit outward normal (the winding follows it) and given UVs */
class Geo {
  pos: number[] = []; nor: number[] = []; uv: number[] = [];
  quad(p: number[][], n: number[], uv: number[][]) {
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const order = c[0] * n[0] + c[1] * n[1] + c[2] * n[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of order) { this.pos.push(...p[k]); this.nor.push(...n); this.uv.push(...uv[k]); }
  }
  tri(p: number[][], n: number[], uv: number[][]) {
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const k of c[0] * n[0] + c[1] * n[1] + c[2] * n[2] >= 0 ? [0, 1, 2] : [0, 2, 1]) { this.pos.push(...p[k]); this.nor.push(...n); this.uv.push(...uv[k]); }
  }
  /** a flat polygon (x, z ring) at height y, facing up or down, UVs in metres / tile */
  flat(ring: number[], y: number, tile: number, up = true) {
    const pts = Array.from({ length: ring.length / 2 }, (_, k) => new THREE.Vector2(ring[k * 2], ring[k * 2 + 1]));
    for (const t of THREE.ShapeUtils.triangulateShape(pts, [])) {
      const P = t.map((i) => [pts[i].x, y, pts[i].y]);
      this.tri(P, [0, up ? 1 : -1, 0], t.map((i) => [pts[i].x / tile, -pts[i].y / tile]));
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}
/** counter-clockwise (x right, z down seen from above = positive shoelace in x, z) */
function ccw(p: number[]) {
  let a = 0; const n = p.length / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
  if (a > 0) return p.slice();
  const out: number[] = []; for (let i = n - 1; i >= 0; i--) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}
/** the ring moved inward by d (mitred corners); p counter-clockwise as above */
function inset(p: number[], d: number) {
  const n = p.length / 2, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n;
    const lines = [[a, i], [i, b]].map(([s, e]) => {
      const dx = p[e * 2] - p[s * 2], dz = p[e * 2 + 1] - p[s * 2 + 1], l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;                     // inward for this winding
      return { x: p[s * 2] + nx * d, z: p[s * 2 + 1] + nz * d, dx: dx / l, dz: dz / l };
    });
    const [L1, L2] = lines, den = L1.dx * L2.dz - L1.dz * L2.dx;
    if (Math.abs(den) < 1e-6) { out.push(p[i * 2] + (L2.x - p[i * 2]), p[i * 2 + 1] + (L2.z - p[i * 2 + 1])); continue; }
    const t = ((L2.x - L1.x) * L2.dz - (L2.z - L1.z) * L2.dx) / den;
    out.push(L1.x + L1.dx * t, L1.z + L1.dz * t);
  }
  return out;
}
/** a box along the segment a → b (plan), its width w across, from y0 to y1 */
function slab(ax: number, az: number, bx_: number, bz: number, w: number, y0: number, y1: number) {
  const l = Math.hypot(bx_ - ax, bz - az);
  return new THREE.BoxGeometry(l, y1 - y0, w).rotateY(-Math.atan2(bz - az, bx_ - ax)).translate((ax + bx_) / 2, (y0 + y1) / 2, (az + bz) / 2);
}
/** Lehmer generator; small seeds give tiny first values, so the seed is spread and a few draws skipped */
const seeded = (s: number) => { s = (s * 2654435761) % 2147483647 || 1; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 5; i++) r(); return r; };

// ---------------------------------------------------------------- textures
const BAY = 3, TILE_BAYS = 8;
/** the facade, 8 bays by the full height (the night lights repeat every 24 m): light grey render, a plinth, window rows with white frames, a light band
 *  under the 2nd floor windows, a charcoal band under the 3rd and the charcoal parapet (the owner's street photo) */
function facadeTextures(floors: number, storey: number, H: number) {
  const W = 1024, Hp = 512, sx = W / (BAY * TILE_BAYS), sy = Hp / H;
  const Y = (y: number) => (H - y) * sy;
  const wins: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (let f = 0; f < floors; f++) for (let b = 0; b < TILE_BAYS; b++) wins.push({ x0: b * BAY + 0.4, x1: b * BAY + 2.6, y0: f * storey + 0.95, y1: f * storey + 3.0 });
  const color = canvasTex(W, Hp, (g) => {
    g.fillStyle = '#dfe1e0'; g.fillRect(0, 0, W, Hp);
    g.fillStyle = '#878b8d'; g.fillRect(0, Y(0.55), W, 0.55 * sy);                       // plinth
    for (let f = 0; f + 1 < floors; f++) {                                               // bands between the window rows
      g.fillStyle = f === floors - 2 ? '#5b6064' : '#c3c6c7';
      g.fillRect(0, Y(f * storey + storey + 0.95), W, (storey - 2.05) * sy);
    }
    g.fillStyle = '#50555a'; g.fillRect(0, 0, W, Y((floors - 1) * storey + 3.25));       // the parapet band
    for (const w of wins) {
      const x = w.x0 * sx, y = Y(w.y1), ww = (w.x1 - w.x0) * sx, hh = (w.y1 - w.y0) * sy;
      g.fillStyle = '#f3f3f1'; g.fillRect(x - 3, y - 3, ww + 6, hh + 6);
      const gr = g.createLinearGradient(0, y, 0, y + hh); gr.addColorStop(0, '#5d6d7b'); gr.addColorStop(0.45, '#33404b'); gr.addColorStop(1, '#3d4a56');
      g.fillStyle = gr; g.fillRect(x, y, ww, hh);
      g.fillStyle = '#f3f3f1'; g.fillRect(x + ww / 2 - 2, y, 4, hh); g.fillRect(x, y + hh * 0.3 - 2, ww, 4);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x - 3, y + hh + 3, ww + 6, 3);        // sill shadow
    }
  });
  // a school late in the evening: a window in five lit, warm
  const rnd = seeded(31), warm = ['#ffd9a0', '#ffe6bf', '#fff1d8', '#ffcf8f'];
  const lit = canvasTex(W, Hp, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, Hp);
    for (const w of wins) { if (rnd() > 0.2) continue; g.fillStyle = warm[Math.floor(rnd() * warm.length)]; g.fillRect(w.x0 * sx, Y(w.y1), (w.x1 - w.x0) * sx, (w.y1 - w.y0) * sy); }
  });
  // roughness (green) and metalness (blue): glass smooth and a little metallic, render matt
  const rm = canvasTex(W, Hp, (g) => {
    g.fillStyle = 'rgb(0,225,0)'; g.fillRect(0, 0, W, Hp);
    g.fillStyle = 'rgb(0,40,70)'; for (const w of wins) g.fillRect(w.x0 * sx, Y(w.y1), (w.x1 - w.x0) * sx, (w.y1 - w.y0) * sy);
  });
  for (const t of [color, lit, rm]) t.wrapS = THREE.RepeatWrapping;
  rm.colorSpace = THREE.NoColorSpace;
  return { color, lit, rm };
}
/** glazing with a mullion grid (cells of the texture = 1 UV unit) */
function glazingTex(frame: string, glass: [string, string]) {
  const t = canvasTex(128, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, glass[0]); gr.addColorStop(1, glass[1]);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.fillStyle = frame; g.fillRect(0, 0, 128, 6); g.fillRect(0, 0, 6, 128);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function signTex() {
  return canvasTex(512, 140, (g) => {
    g.fillStyle = '#fafafa'; g.fillRect(0, 0, 512, 140);
    g.fillStyle = '#1d4f91'; g.fillRect(36, 30, 80, 80);
    g.fillStyle = '#fafafa'; g.fillRect(58, 48, 14, 50); g.beginPath(); g.arc(65, 42, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1d4f91'; g.font = 'italic bold 78px Georgia, serif'; g.textBaseline = 'middle'; g.fillText('Intil', 140, 74);
  });
}
/** the gatehouse wall: light render with charcoal square panels and a dark window band */
function gatehouseTex() {
  return canvasTex(256, 160, (g) => {
    g.fillStyle = '#d7d9d8'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#64696d'; for (const [x, y] of [[20, 18], [64, 18], [196, 18], [152, 62]]) g.fillRect(x, y, 38, 38);
    g.fillStyle = '#2f3a44'; g.fillRect(24, 74, 112, 44);
    g.fillStyle = '#eceeed'; g.fillRect(78, 74, 4, 44);
    g.fillStyle = '#7d8286'; g.fillRect(0, 146, 256, 14);
  });
}
function barsTex(gap: number) {
  const t = canvasTex(64, 16, (g) => { g.clearRect(0, 0, 64, 16); g.fillStyle = '#25282b'; g.fillRect(28, 0, gap, 16); });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function turfTex(w: number, d: number) {
  const k = 24;
  return canvasTex(w * k, d * k, (g) => {
    const W = w * k, D = d * k, m = 0.6 * k;
    for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#3e8a35' : '#47983c'; g.fillRect(0, (i * D) / 10, W, D / 10 + 1); }
    g.strokeStyle = '#f4f4f0'; g.lineWidth = 0.1 * k;
    g.strokeRect(m, m, W - 2 * m, D - 2 * m);
    g.beginPath(); g.moveTo(m, D / 2); g.lineTo(W - m, D / 2); g.stroke();
    g.beginPath(); g.arc(W / 2, D / 2, 3 * k, 0, Math.PI * 2); g.stroke();
    for (const s of [0, 1]) { const y = s ? D - m : m; g.beginPath(); g.arc(W / 2, y, 6 * k, s ? Math.PI : 0, s ? Math.PI * 2 : Math.PI); g.stroke(); }
    let sd = 5; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.05})`; g.fillRect(r() * W, r() * D, 2, 2); }
  });
}
function courtTex(w: number, d: number) {
  const k = 20;
  return canvasTex(w * k, d * k, (g) => {
    const W = w * k, D = d * k;
    g.fillStyle = '#6a6d70'; g.fillRect(0, 0, W, D);
    let sd = 9; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.07})`; g.fillRect(r() * W, r() * D, 3, 3); }
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(0,0,0,.06)'; g.beginPath(); g.ellipse(r() * W, r() * D, (2 + r() * 4) * k, (1 + r() * 3) * k, r() * 3, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(240,240,236,.8)'; g.lineWidth = 0.08 * k;
    const cw = 15 * k, cd = 28 * k, x0 = (W - cw) / 2, y0 = (D - cd) / 2;
    g.strokeRect(x0, y0, cw, cd); g.beginPath(); g.moveTo(x0, D / 2); g.lineTo(x0 + cw, D / 2); g.stroke();
    g.beginPath(); g.arc(W / 2, D / 2, 1.8 * k, 0, 7); g.stroke();
    for (const s of [0, 1]) {
      const y = s ? y0 + cd : y0, dir = s ? -1 : 1;
      g.strokeRect(W / 2 - 2.45 * k, s ? y - 5.8 * k : y, 4.9 * k, 5.8 * k);
      g.beginPath(); g.arc(W / 2, y + dir * 1.6 * k, 6.75 * k, s ? Math.PI : 0, s ? Math.PI * 2 : Math.PI); g.stroke();
    }
  });
}
function waterTex(w: number, d: number) {
  const k = 24;
  return canvasTex(w * k, d * k, (g) => {
    const W = w * k, D = d * k;
    g.fillStyle = '#2f9fc4'; g.fillRect(0, 0, W, D);
    let sd = 3; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(255,255,255,${0.05 + r() * 0.08})`; g.lineWidth = 2; g.beginPath(); const x = r() * W, y = r() * D; g.moveTo(x, y); g.quadraticCurveTo(x + 20, y + (r() - 0.5) * 20, x + 40, y); g.stroke(); }
    g.fillStyle = 'rgba(16,55,110,.55)'; const lanes = Math.max(3, Math.round(w / 2.2));
    for (let i = 0; i < lanes; i++) g.fillRect(((i + 0.5) * W) / lanes - 0.12 * k, 1 * k, 0.24 * k, D - 2 * k);
  });
}

// ---------------------------------------------------------------- the place
type Mats = { pavers: THREE.Material; asphalt: THREE.Material };
type Masked = THREE.MeshStandardMaterial;

export class Places {
  readonly group = new THREE.Group();
  /** everything on the ground (hidden in the white model, like the courtyard furniture) */
  private ground = new THREE.Group();
  private buildingMats: { m: Masked; color: string; map: THREE.Texture | null }[] = [];
  private lit: Masked[] = [];
  private white = false;
  private night = 0;

  constructor(places: Place[], mats: Mats) {
    this.group.add(this.ground);
    for (const p of places) if (p.id === 'intil') this.intil(p.layout, mats);
  }

  private bmat(color: string, o: THREE.MeshStandardMaterialParameters = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
    this.buildingMats.push({ m, color, map: m.map ?? null });
    return m;
  }
  private mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, cast = true) {
    const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; o.raycast = () => {}; parent.add(o); return o;
  }

  private intil(L: IntilLayout, mats: Mats) {
    const B = L.building, H = B.floors * B.storey + 0.9, P = 0.9;            // wall top, parapet height
    const fp = ccw(B.footprint), n = fp.length / 2;
    let cx = 0, cz = 0, rad = 0;
    for (let k = 0; k < n; k++) { cx += fp[k * 2] / n; cz += fp[k * 2 + 1] / n; }
    for (let k = 0; k < n; k++) rad = Math.max(rad, Math.hypot(fp[k * 2] - cx, fp[k * 2 + 1] - cz));
    const bc = [cx, B.portal.h + 3, cz, rad + 4];
    const building = new THREE.Group(); this.group.add(building);
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const put = (m: THREE.Material, g: THREE.BufferGeometry) => { let a = parts.get(m); if (!a) parts.set(m, (a = [])); a.push(g.index ? g.toNonIndexed() : g); };

    // ---- walls: the facade texture by the metre (u: 12 m a repeat, v: the full height)
    const tex = facadeTextures(B.floors, B.storey, H);
    const wallM = this.bmat('#ffffff', { map: tex.color, emissiveMap: tex.lit, emissive: '#ffffff', emissiveIntensity: 0, roughnessMap: tex.rm, metalnessMap: tex.rm, roughness: 1, metalness: 1 });
    this.lit.push(wallM);
    const walls = new Geo();
    let run = 0;
    for (let k = 0; k < n; k++) {
      const ax = fp[k * 2], az = fp[k * 2 + 1], bx_ = fp[((k + 1) % n) * 2], bz = fp[((k + 1) % n) * 2 + 1];
      const l = Math.hypot(bx_ - ax, bz - az); if (l < 0.01) continue;
      const nrm = [(bz - az) / l, 0, -(bx_ - ax) / l];           // outward for a counter-clockwise ring
      const u0 = run / (BAY * TILE_BAYS), u1 = (run + l) / (BAY * TILE_BAYS);
      walls.quad([[ax, 0, az], [bx_, 0, bz], [bx_, H, bz], [ax, H, az]], nrm, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
      run += Math.ceil(l / BAY) * BAY;                             // each wall starts on a bay
    }
    put(wallM, walls.geometry());

    // ---- roof: parapet cap and its inner faces, the membrane behind it
    const trim = this.bmat('#50555a', { roughness: 0.7 });
    const roofM = this.bmat('#8b8d8a', { roughness: 0.95 });
    const inner = inset(fp, 0.35), yr = H - P;
    const cap = new Geo(), roof = new Geo();
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const o0 = [fp[k * 2], H, fp[k * 2 + 1]], o1 = [fp[j * 2], H, fp[j * 2 + 1]], i0 = [inner[k * 2], H, inner[k * 2 + 1]], i1 = [inner[j * 2], H, inner[j * 2 + 1]];
      cap.quad([o0, o1, i1, i0], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      const l = Math.hypot(i1[0] - i0[0], i1[2] - i0[2]) || 1;
      cap.quad([[i0[0], yr, i0[2]], [i1[0], yr, i1[2]], i1, i0], [-(i1[2] - i0[2]) / l, 0, (i1[0] - i0[0]) / l], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
    roof.flat(inner, yr, 4);
    put(trim, cap.geometry()); put(roofM, roof.geometry());
    // two glass atria (seen on the satellite picture) on low curbs, gabled along x, mullions every 1.5 m
    const atriumM = this.bmat('#ffffff', { map: glazingTex('#41474c', ['#a9b3b9', '#7b878e']), roughness: 0.12, metalness: 0.5 });
    const atria = new Geo();
    for (const [x0, x1] of [[-273, -243], [-229, -200]]) {
      const z0 = -51, z1 = -31, zm = (z0 + z1) / 2, yc = yr + 0.5, yt = yc + 1.8, s = Math.hypot(zm - z0, 1.8);
      put(trim, bx(x0, yr, z0, x1, yc, z1));
      atria.quad([[x0, yc, z0], [x1, yc, z0], [x1, yt, zm], [x0, yt, zm]], [0, (zm - z0), -1.8].map((v) => v / s), [[x0 / 1.5, 0], [x1 / 1.5, 0], [x1 / 1.5, s / 1.5], [x0 / 1.5, s / 1.5]]);
      atria.quad([[x0, yc, z1], [x1, yc, z1], [x1, yt, zm], [x0, yt, zm]], [0, (z1 - zm), 1.8].map((v) => v / s), [[x0 / 1.5, 0], [x1 / 1.5, 0], [x1 / 1.5, s / 1.5], [x0 / 1.5, s / 1.5]]);
      for (const x of [x0, x1]) atria.tri([[x, yc, z0], [x, yc, z1], [x, yt, zm]], [x === x0 ? -1 : 1, 0, 0], [[z0 / 1.5, 0], [z1 / 1.5, 0], [zm / 1.5, 1.2]]);
    }
    put(atriumM, atria.geometry());
    // plant on the roof: a few boxes
    const plant = this.bmat('#a3a6a4', { roughness: 0.6, metalness: 0.3 });
    for (const [x, z] of [[-236, -52], [-236, -30], [-282, -40], [-189, -40]]) put(plant, bx(x - 1.4, yr, z - 1, x + 1.4, yr + 1.3, z + 1));

    // ---- the entrance portal on the north facade: two pylons, a glass curtain wall, the lintel with the sign,
    // a canopy over the doors (the street photo)
    const po = B.portal, zf = this.northWall(fp, po.x), zp = zf - po.d, x0 = po.x - po.w / 2, x1 = po.x + po.w / 2;
    const pylon = this.bmat('#7c8185', { roughness: 0.6 });
    const curtain = this.bmat('#ffffff', { map: glazingTex('#2a2f33', ['#506476', '#27323c']), roughness: 0.1, metalness: 0.5 });
    put(pylon, bx(x0, 0, zp, x0 + 2.4, po.h, zf)); put(pylon, bx(x1 - 2.4, 0, zp, x1, po.h, zf));
    put(trim, bx(x0, po.h - 1.9, zp - 0.15, x1, po.h, zf));
    const cw = new Geo(), gx0 = x0 + 2.4, gx1 = x1 - 2.4, gz = zp + 0.35, gh = po.h - 1.9;
    cw.quad([[gx0, 0, gz], [gx1, 0, gz], [gx1, gh, gz], [gx0, gh, gz]], [0, 0, -1], [[0, 0], [(gx1 - gx0) / 1.55, 0], [(gx1 - gx0) / 1.55, gh / 1.35], [0, gh / 1.35]]);
    put(curtain, cw.geometry());
    put(trim, bx(gx0, gh - 0.01, gz - 0.1, gx1, gh, zf));                               // soffit under the lintel
    for (const y of [4.0, 8.0, 12.0]) put(trim, bx(gx0, y - 0.18, gz - 0.12, gx1, y, gz + 0.05));   // floor bands behind the glass
    put(trim, bx(po.x - 5, 3.6, zp - 3.2, po.x + 5, 3.9, zp));                           // canopy
    for (const x of [po.x - 4.6, po.x + 4.6]) put(pylon, bx(x - 0.12, 0, zp - 3.0, x + 0.12, 3.6, zp - 2.76));
    const sign = this.bmat('#ffffff', { map: signTex(), roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0 });
    sign.emissiveMap = sign.map; this.lit.push(sign);
    const sg = new Geo(), sw = 5.2, sh = 1.42, sy0 = po.h - 1.67, sz = zp - 0.2;
    // facing north: seen from the street, west (−x) is on the right
    sg.quad([[po.x - sw / 2, sy0, sz], [po.x + sw / 2, sy0, sz], [po.x + sw / 2, sy0 + sh, sz], [po.x - sw / 2, sy0 + sh, sz]], [0, 0, -1], [[1, 0], [0, 0], [0, 1], [1, 1]]);
    put(sign, sg.geometry());
    // the stair tower on the south facade, a little above the roof
    const light = this.bmat('#d9dbda', { roughness: 0.85 });
    const zs = this.southWall(fp, po.x);
    put(light, bx(po.x - 3.2, 0, zs, po.x + 3.2, H + 1.4, zs + 3.2)); put(trim, bx(po.x - 3.3, H + 1.4, zs - 0.05, po.x + 3.3, H + 1.7, zs + 3.3));

    for (const [m, list] of parts) {
      const g = mergeGeometries(list, false)!;
      const a = new Float32Array(g.getAttribute('position').count * 4); for (let i = 0; i < a.length; i += 4) a.set(bc, i);
      g.setAttribute('bc', new THREE.BufferAttribute(a, 4));      // the block page hides the whole building in the line of sight
      this.mesh(g, m, building); list.forEach((x) => x.dispose());
    }

    this.yardOf(L, mats);
  }
  /** z of the footprint's north wall (smallest z) under x */
  private northWall(fp: number[], x: number) {
    let best = Infinity; const n = fp.length / 2;
    for (let k = 0; k < n; k++) {
      const ax = fp[k * 2], az = fp[k * 2 + 1], bx_ = fp[((k + 1) % n) * 2], bz = fp[((k + 1) % n) * 2 + 1];
      if ((ax - x) * (bx_ - x) > 0 || ax === bx_) continue;
      best = Math.min(best, az + ((bz - az) * (x - ax)) / (bx_ - ax));
    }
    return best;
  }
  private southWall(fp: number[], x: number) {
    let best = -Infinity; const n = fp.length / 2;
    for (let k = 0; k < n; k++) {
      const ax = fp[k * 2], az = fp[k * 2 + 1], bx_ = fp[((k + 1) % n) * 2], bz = fp[((k + 1) % n) * 2 + 1];
      if ((ax - x) * (bx_ - x) > 0 || ax === bx_) continue;
      best = Math.max(best, az + ((bz - az) * (x - ax)) / (bx_ - ax));
    }
    return best;
  }

  /** the grounds: forecourt and drive, fence and gate, gatehouse, beds, pitch, court, pool */
  private yardOf(L: IntilLayout, mats: Mats) {
    const G = this.ground;
    const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
    const M = { steel: std('#2b2e31', { roughness: 0.45, metalness: 0.6 }), concrete: std('#bdbab3', { roughness: 0.9 }), white: std('#f1f1ee'), curb: std('#e2e0da', { roughness: 0.85 }), soil: std('#4f3d2f', { roughness: 1 }), charcoal: std('#50555a', { roughness: 0.7 }) };
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const put = (m: THREE.Material, g: THREE.BufferGeometry, T?: THREE.Matrix4) => { if (T) g.applyMatrix4(T); let a = parts.get(m); if (!a) parts.set(m, (a = [])); a.push(g.index ? g.toNonIndexed() : g); };
    const rnd = seeded(17);

    // paving: pavers inside the gate, asphalt across the raised sidewalk and on to the gate
    { const f = new Geo(); f.flat(L.forecourt, 0.045, 1.92); this.mesh(f.geometry(), mats.pavers, G, false); }
    { const d = new Geo(); d.flat(L.drive, 0.17, 3.0); d.flat(L.apron, 0.045, 3.0); this.mesh(d.geometry(), mats.asphalt, G, false); }

    // fence: a low concrete plinth, posts every ≤ 2.6 m, rails, a panel of bars between them
    const barsM = new THREE.MeshStandardMaterial({ map: barsTex(8), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 });
    const panels = new Geo();
    const run = (ax: number, az: number, bx_: number, bz: number, gate = false) => {
      const l = Math.hypot(bx_ - ax, bz - az), k = Math.max(1, Math.ceil(l / 2.6)), y0 = gate ? 0.08 : 0.42, y1 = gate ? 2.2 : 2.05;
      if (!gate) put(M.concrete, slab(ax, az, bx_, bz, 0.28, 0, y0));
      for (let i = 0; i <= k; i++) { const t = i / k, x = ax + (bx_ - ax) * t, z = az + (bz - az) * t; put(M.steel, bx(x - 0.05, y0, z - 0.05, x + 0.05, y1 + 0.05, z + 0.05)); }
      for (const y of [y0 + 0.12, y1 - 0.06]) put(M.steel, slab(ax, az, bx_, bz, 0.05, y - 0.03, y + 0.03));
      const nx = -(bz - az) / l, nz = (bx_ - ax) / l;
      panels.quad([[ax, y0, az], [bx_, y0, bz], [bx_, y1, bz], [ax, y1, az]], [nx, 0, nz], [[0, 0], [l / (gate ? 0.11 : 0.14), 0], [l / (gate ? 0.11 : 0.14), 1], [0, 1]]);
    };
    for (const f of L.fence) for (let i = 0; i + 3 < f.length; i += 2) run(f[i], f[i + 1], f[i + 2], f[i + 3]);
    // the gate: two leaves between stout posts
    { const g = L.gate, xm = (g.x0 + g.x1) / 2;
      run(g.x0, g.z, xm - 0.05, g.z, true); run(xm + 0.05, g.z, g.x1, g.z, true);
      for (const x of [g.x0, g.x1]) put(M.charcoal, bx(x - 0.18, 0, g.z - 0.18, x + 0.18, 2.5, g.z + 0.18));
      for (const x of [g.x0, xm, g.x1]) put(M.steel, bx(x - 0.04, 0.08, g.z - 0.04, x + 0.04, 2.2, g.z + 0.04));
      for (const y of [0.1, 1.15, 2.18]) put(M.steel, bx(g.x0, y - 0.04, g.z - 0.03, g.x1, y + 0.04, g.z + 0.03));
    }
    { const m = new THREE.Mesh(panels.geometry(), barsM); m.castShadow = true; m.receiveShadow = true; m.raycast = () => {}; G.add(m); }

    // the gatehouse: a light box with charcoal panels and a dark window, a charcoal cornice
    { const [x0, z0, x1, z1] = L.gatehouse, h = 3.4;
      const gm = std('#ffffff', { map: gatehouseTex(), roughness: 0.8 });
      this.mesh(bx(x0, 0, z0, x1, h, z1), gm, G);
      put(M.charcoal, bx(x0 - 0.25, h, z0 - 0.25, x1 + 0.25, h + 0.35, z1 + 0.25));
    }

    // flower beds along the fence: a white kerb, earth, flowers (red / yellow / orange, the photo)
    const flowers: GlbItem[] = [];
    const fm = [0, 3].map((s) => { const t = flowerTex(s); t.wrapS = t.wrapT = THREE.RepeatWrapping; return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, roughness: 1 }); });
    for (const [x0, z0, x1, z1] of L.beds) {
      const t = 0.12, h = 0.16;
      put(M.curb, bx(x0, 0, z0, x1, h, z0 + t)); put(M.curb, bx(x0, 0, z1 - t, x1, h, z1));
      put(M.curb, bx(x0, 0, z0, x0 + t, h, z1)); put(M.curb, bx(x1 - t, 0, z0, x1, h, z1));
      put(M.soil, bx(x0 + t, 0, z0 + t, x1 - t, 0.11, z1 - t));
      fm.forEach((m, k) => {
        const w = x1 - x0 - 2 * t, d = z1 - z0 - 2 * t, g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.12 + k * 0.08, (z0 + z1) / 2);
        const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 1.6 + k * 0.37, uv.getY(i) * d / 1.6);
        this.mesh(g, m, G, false);
      });
      const nfl = Math.round((x1 - x0) * (z1 - z0) * 2.5), turn = new THREE.Matrix4(), sc = new THREE.Matrix4();
      for (let k = 0; k < nfl; k++) {
        const x = x0 + t + rnd() * (x1 - x0 - 2 * t), z = z0 + t + rnd() * (z1 - z0 - 2 * t), s = 1.6 + rnd() * 0.8;
        flowers.push({ m: new THREE.Matrix4().makeTranslation(x, 0.12, z).multiply(turn.makeRotationY(rnd() * 6.283)).multiply(sc.makeScale(s, s, s)) });
      }
    }
    if (flowers.length) G.add(glbInstances('gul', flowers, { shadow: false }).group);

    // the turf mini-pitch: stripes and lines, a 4 m net fence, goals
    { const p = L.pitch, T = place(p.cx, p.cz, p.deg), hw = p.w / 2, hd = p.d / 2, Hn = 4;
      const turf = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2).translate(0, 0.05, 0).applyMatrix4(T), new THREE.MeshStandardMaterial({ map: turfTex(p.w, p.d), roughness: 0.95 }));
      turf.receiveShadow = true; turf.raycast = () => {}; G.add(turf);
      const net = new THREE.MeshStandardMaterial({ map: meshTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 });
      const ng = new Geo();
      for (const [x0, z0, x1, z1] of [[-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [hw, hd, -hw, hd], [-hw, hd, -hw, -hd]]) {
        const l = Math.hypot(x1 - x0, z1 - z0), k = Math.round(l / 3);
        ng.quad([[x0, 0, z0], [x1, 0, z1], [x1, Hn, z1], [x0, Hn, z0]], [-(z1 - z0) / l, 0, (x1 - x0) / l], [[0, 0], [l / 0.6, 0], [l / 0.6, Hn / 0.6], [0, Hn / 0.6]]);
        for (let i = 0; i <= k; i++) put(M.steel, bx(x0 + ((x1 - x0) * i) / k - 0.04, 0, z0 + ((z1 - z0) * i) / k - 0.04, x0 + ((x1 - x0) * i) / k + 0.04, Hn, z0 + ((z1 - z0) * i) / k + 0.04), T);
        put(M.steel, bar([x0, Hn, z0], [x1, Hn, z1], 0.05), T);
      }
      const nm = new THREE.Mesh(ng.geometry().applyMatrix4(T), net); nm.raycast = () => {}; G.add(nm);
      for (const s of [-1, 1]) {
        const z = s * (hd - 0.7);
        put(M.white, bar([-1.5, 0.05, z], [-1.5, 2, z], 0.09), T); put(M.white, bar([1.5, 0.05, z], [1.5, 2, z], 0.09), T); put(M.white, bar([-1.5, 2, z], [1.5, 2, z], 0.09), T);
        put(M.white, bar([-1.5, 2, z], [-1.5, 0.05, z + s * 0.9], 0.05), T); put(M.white, bar([1.5, 2, z], [1.5, 0.05, z + s * 0.9], 0.05), T);
      }
    }
    // the asphalt court with basketball lines and two hoops
    { const c = L.court, T = place(c.cx, c.cz, c.deg);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(c.w, c.d).rotateX(-Math.PI / 2).translate(0, 0.045, 0).applyMatrix4(T), new THREE.MeshStandardMaterial({ map: courtTex(c.w, c.d), roughness: 0.95 }));
      m.receiveShadow = true; m.raycast = () => {}; G.add(m);
      for (const s of [-1, 1]) {
        const z = s * 12.8;                                                          // the board 1.2 m inside the end line
        put(M.steel, bar([0, 0, z + s * 2.2], [0, 3.3, z + s * 2.2], 0.12), T); put(M.steel, bar([0, 3.3, z + s * 2.2], [0, 3.2, z], 0.1), T);
        put(M.white, bx(-0.9, 2.75, z - s * 0.02, 0.9, 3.8, z + s * 0.02), T);
        put(M.steel, new THREE.TorusGeometry(0.23, 0.02, 6, 16).rotateX(Math.PI / 2).translate(0, 3.05, z - s * 0.3), T);
      }
    }
    // the open-air pool: a tiled deck around the basin, water with lane lines
    { const p = L.pool, T = place(p.cx, p.cz, p.deg), hw = p.w / 2, hd = p.d / 2, b = 1.2, y = 0.2;
      const deck = std('#d9dbd8', { roughness: 0.7 });
      put(deck, bx(-hw, 0, -hd, hw, y, -hd + b), T); put(deck, bx(-hw, 0, hd - b, hw, y, hd), T);
      put(deck, bx(-hw, 0, -hd + b, -hw + b, y, hd - b), T); put(deck, bx(hw - b, 0, -hd + b, hw, y, hd - b), T);
      const ww = p.w - 2 * b, wd = p.d - 2 * b;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(ww, wd).rotateX(-Math.PI / 2).translate(0, 0.08, 0).applyMatrix4(T),
        new THREE.MeshStandardMaterial({ map: waterTex(ww, wd), roughness: 0.04, metalness: 0.05, envMapIntensity: 1.4 }));
      water.receiveShadow = true; water.raycast = () => {}; G.add(water);
      for (const s of [-1, 1]) for (const x of [-hw + b + 0.9, hw - b - 0.9]) {     // ladders
        const z = s * (hd - b + 0.05);
        put(M.white, bar([x - 0.25, y, z - s * 0.25], [x - 0.25, y + 0.9, z], 0.04), T); put(M.white, bar([x + 0.25, y, z - s * 0.25], [x + 0.25, y + 0.9, z], 0.04), T);
      }
    }

    for (const [m, list] of parts) { this.mesh(mergeGeometries(list, false)!, m, G); list.forEach((g) => g.dispose()); }
  }

  /** white model: the building in plain white, the grounds hidden (as the courtyard furniture) */
  setStyle(white: boolean) {
    this.white = white;
    this.ground.visible = !white;
    for (const { m, color, map } of this.buildingMats) {
      m.map = white ? null : map; m.color.set(white ? '#f4f3f0' : color);
      m.needsUpdate = true;
    }
    this.setNight(this.night);
  }
  /** 0 day … 1 night: lit windows, the sign */
  setNight(n: number) {
    this.night = n;
    for (const m of this.lit) m.emissiveIntensity = this.white ? 0 : (m.map && m.emissiveMap === m.map ? 0.9 : 1.3) * n;
  }
  /** the block page's see-through mask (the building only: everything else is low) */
  setMask(mask: unknown, shadow: unknown) {
    for (const { m } of this.buildingMats) { nodes(m).maskNode = mask; nodes(m).maskShadowNode = shadow; m.needsUpdate = true; }
  }
}
