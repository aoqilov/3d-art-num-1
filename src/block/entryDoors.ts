// Apartment entrance doors of the type-4 block (storeys 2–16): steel frame that closes the opening to the
// wall faces, fluted anthracite leaf with a wood strip and black hardware (client's photo), swinging out
// into the corridor on the hinge side read from the drawing, and a number plate above every door.
// Doors open only on request (E key / on-screen button) and a closed door cannot be walked through.
import * as THREE from 'three';
import { prep } from './materials';
import { FLOOR_H, FLOORS, SLAB, planFor } from './plan';
import { aptInfo } from './aptData';
import ENTRIES from './data/entries_t4.json';

type Entry = { apt: number; hinge: number[]; u: number[]; n: number[]; span: number; depth: number };
const DATA = ENTRIES as unknown as Record<'2' | '3', Entry[]>;

const HEAD = 2.3;          // top of the structural opening above storey base (floorGeom H.door)
const FW = 0.05;           // frame (box profile) width inside the opening
const AW = 0.075;          // visible face of the frame on the walls, covers the joint to the plaster
const AT = 0.012;          // its thickness off the wall
const GAP = 0.002;         // leaf ↔ frame clearance
const T = 0.075;           // leaf thickness
const SET = 0.012;         // leaf face set back from the corridor wall face
const SILL = 0.012;        // steel threshold
const OPEN = Math.PI / 2;  // drawn swing: 90° into the corridor
const MAXP = 3.0;          // pushed past the hinge it can fold almost flat to the corridor wall
const REACH = 1.6;         // E works within this distance of the opening's centre
const SPEED = 2.1;         // rad/s

// ---------- small geometry builder: per-material buckets, optional mirrored winding ----------
class GB {
  b: { p: number[]; n: number[]; uv: number[] }[];
  constructor(k: number) { this.b = Array.from({ length: k }, () => ({ p: [], n: [], uv: [] })); }
  add(src: THREE.BufferGeometry, mat: number | ((group: number) => number), m?: THREE.Matrix4, flip = false) {
    const g = src.index ? src.toNonIndexed() : src.clone();
    if (m) g.applyMatrix4(m);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const groups = g.groups.length ? g.groups : [{ start: 0, count: P.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mi = typeof mat === 'number' ? mat : mat(gr.materialIndex ?? 0);
      if (mi < 0) continue;
      const B = this.b[mi];
      const end = Math.min(P.count, gr.start + gr.count);
      for (let i = gr.start; i + 2 < end; i += 3) {
        const order = flip ? [i, i + 2, i + 1] : [i, i + 1, i + 2];
        for (const j of order) {
          B.p.push(P.getX(j), P.getY(j), P.getZ(j));
          B.n.push(N.getX(j), N.getY(j), N.getZ(j));
          B.uv.push(U ? U.getX(j) : 0, U ? U.getY(j) : 0);
        }
      }
    }
    g.dispose();
  }
  /** Axis-aligned box from min/max corners. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: number | ((face: number) => number), m?: THREE.Matrix4, flip = false) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(g, mat, m, flip); g.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    const P: number[] = [], N: number[] = [], U: number[] = [];
    let at = 0;
    this.b.forEach((B, i) => {
      const c = B.p.length / 3;
      if (c) g.addGroup(at, c, i);
      at += c; P.push(...B.p); N.push(...B.n); U.push(...B.uv);
    });
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------- textures ----------
const TW = 512, TH = 1152;              // leaf face canvas (≈ 0.9 × 2.03 m)
const STRIP = [0.745, 0.962];           // wood strip across the width, hinge (0) → lock (1)
function leafTextures() {
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const x = c.getContext('2d')!;
  const nm = document.createElement('canvas'); nm.width = TW; nm.height = TH;
  const y = nm.getContext('2d')!;
  y.fillStyle = 'rgb(128,128,255)'; y.fillRect(0, 0, TW, TH);
  x.fillStyle = '#4a4d53'; x.fillRect(0, 0, TW, TH);
  const pxm = TW / 0.9;                 // px per metre
  const border = Math.round(0.014 * pxm), sx0 = Math.round(STRIP[0] * TW), sx1 = Math.round(STRIP[1] * TW);
  const top = Math.round(0.02 * pxm), bot = TH - Math.round(0.05 * pxm);
  // flutes: grooves every ~2.5 cm over the panel left of the strip
  const pitch = 0.025 * pxm;
  for (let gx = border + pitch * 0.6; gx < sx0 - pitch * 0.5; gx += pitch) {
    const g = Math.round(gx);
    x.fillStyle = '#34363b'; x.fillRect(g - 1, top, 3, bot - top);
    x.fillStyle = '#5a5d64'; x.fillRect(g + 2, top, 1, bot - top);
    y.fillStyle = 'rgb(205,128,235)'; y.fillRect(g - 2, top, 2, bot - top);   // wall facing +x
    y.fillStyle = 'rgb(51,128,235)'; y.fillRect(g + 1, top, 2, bot - top);    // wall facing −x
  }
  // wood strip with grain
  const wg = x.createLinearGradient(sx0, 0, sx1, 0);
  wg.addColorStop(0, '#80542a'); wg.addColorStop(0.35, '#9a6a35'); wg.addColorStop(0.7, '#8c5d2d'); wg.addColorStop(1, '#7a4f27');
  x.fillStyle = wg; x.fillRect(sx0, top, sx1 - sx0, bot - top);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  x.save(); x.beginPath(); x.rect(sx0, top, sx1 - sx0, bot - top); x.clip();
  for (let i = 0; i < 70; i++) {
    const x0 = sx0 + rnd() * (sx1 - sx0), amp = 2 + rnd() * 6, f = 0.004 + rnd() * 0.01, ph = rnd() * 6;
    x.strokeStyle = rnd() < 0.5 ? `rgba(60,34,14,${0.18 + rnd() * 0.3})` : `rgba(196,146,82,${0.12 + rnd() * 0.22})`;
    x.lineWidth = 0.6 + rnd() * 1.6;
    x.beginPath();
    for (let yy = top; yy <= bot; yy += 8) { const xx = x0 + Math.sin(yy * f + ph) * amp; if (yy === top) x.moveTo(xx, yy); else x.lineTo(xx, yy); }
    x.stroke();
  }
  // a few cathedral arcs
  for (let k = 0; k < 6; k++) {
    const cx = sx0 + (0.25 + rnd() * 0.5) * (sx1 - sx0), cy = top + rnd() * (bot - top), w = 10 + rnd() * 16;
    x.strokeStyle = 'rgba(70,40,16,0.35)'; x.lineWidth = 1.2;
    for (let j = 0; j < 4; j++) { x.beginPath(); x.ellipse(cx, cy + j * 22, w - j * 2, 70 + j * 18, 0, Math.PI * 1.05, Math.PI * 1.95); x.stroke(); }
  }
  x.restore();
  // shadow gaps around the strip
  x.fillStyle = '#2a2b2f';
  x.fillRect(sx0 - 3, top, 3, bot - top); x.fillRect(sx1, top, 3, bot - top);
  x.fillRect(sx0 - 3, top - 3, sx1 - sx0 + 6, 3); x.fillRect(sx0 - 3, bot, sx1 - sx0 + 6, 3);
  y.fillStyle = 'rgb(51,128,235)'; y.fillRect(sx0 - 3, top, 3, bot - top);
  y.fillStyle = 'rgb(205,128,235)'; y.fillRect(sx1, top, 3, bot - top);
  // edge band
  x.strokeStyle = 'rgba(30,31,34,0.55)'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, TW - 3, TH - 3);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const nmap = new THREE.CanvasTexture(nm); nmap.anisotropy = 4;
  return { map, nmap };
}

const CW = 128, CH = 64, COLS = 8;      // plate atlas cells
function plateAtlas(nums: number[]) {
  const rows = Math.ceil((nums.length + 1) / COLS);
  const c = document.createElement('canvas'); c.width = CW * COLS; c.height = CH * Math.max(1, 1 << Math.ceil(Math.log2(rows)));
  const x = c.getContext('2d')!;
  x.fillStyle = '#1b1c20'; x.fillRect(0, 0, c.width, c.height);
  nums.forEach((n, i) => {
    const ox = (i % COLS) * CW, oy = Math.floor(i / COLS) * CH;
    const g = x.createLinearGradient(ox, oy, ox, oy + CH);
    g.addColorStop(0, '#26282d'); g.addColorStop(1, '#17181b');
    x.fillStyle = g; x.fillRect(ox, oy, CW, CH);
    x.strokeStyle = '#c9a964'; x.lineWidth = 2; x.strokeRect(ox + 6, oy + 6, CW - 12, CH - 12);
    const big = '600 34px "Helvetica Neue", Arial, sans-serif', small = '500 17px "Helvetica Neue", Arial, sans-serif';
    x.fillStyle = '#e2c785'; x.textAlign = 'left'; x.textBaseline = 'middle';
    x.font = big; const w = x.measureText(String(n)).width;
    x.font = small; const sw = x.measureText('№').width + 5;
    const left = ox + CW / 2 - (w + sw) / 2;
    x.fillText('№', left, oy + CH / 2 + 3);
    x.font = big; x.fillText(String(n), left + sw, oy + CH / 2 + 2);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, w: c.width, h: c.height };
}

// ---------- leaf ----------
const OUTER = 0, INNER = 1, EDGE = 2, HW = 3;
function leafGeometry(lw: number, lh: number, flip: boolean) {
  const b = new GB(4);
  // slab: +z face is the corridor (outer) face, −z the flat face; hinge edge at x = 0, pivot at (0, 0, 0)
  const body = new THREE.BoxGeometry(lw, lh, T); body.translate(lw / 2, lh / 2, -T / 2);
  b.add(body, (f) => (f === 4 ? OUTER : f === 5 ? INNER : EDGE), undefined, flip);
  const M = (x: number, y: number, z: number, r?: THREE.Euler) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(r ?? new THREE.Euler()), new THREE.Vector3(1, 1, 1));
  const hx = lw * ((STRIP[0] + STRIP[1]) / 2);
  const cyl = (r: number, h: number, seg = 16) => new THREE.CylinderGeometry(r, r, h, seg);
  const rounded = (w: number, h: number, d: number, r: number) => {
    const s = new THREE.Shape(); const x0 = -w / 2, y0 = -h / 2;
    s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); s.lineTo(x0 + w, y0 + h - r);
    s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h); s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 4 });
    g.clearGroups(); return g;
  };
  const lever = (side: 1 | -1) => {
    const z0 = side > 0 ? 0 : -T;
    const add = (g: THREE.BufferGeometry, m: THREE.Matrix4) => { b.add(g, HW, m, flip); g.dispose(); };
    const hy = 0.98;
    add(rounded(0.056, 0.056, 0.008, 0.008), M(hx, hy, side > 0 ? z0 : z0 - 0.008));                // square rosette
    add(cyl(0.0085, 0.05), M(hx, hy, z0 + side * 0.033, new THREE.Euler(Math.PI / 2, 0, 0)));       // neck
    const bar = rounded(0.13, 0.019, 0.014, 0.006); bar.translate(-0.065 + 0.008, 0, -0.007);
    add(bar, M(hx, hy, z0 + side * 0.058));                                                         // lever toward the hinge
  };
  lever(1); lever(-1);
  const add = (g: THREE.BufferGeometry, m: THREE.Matrix4) => { b.add(g, HW, m, flip); g.dispose(); };
  add(rounded(0.04, 0.05, 0.007, 0.007), M(hx, 0.84, 0));                                            // cylinder escutcheon
  add(cyl(0.0085, 0.006), M(hx, 0.835, 0.008, new THREE.Euler(Math.PI / 2, 0, 0)));
  add(rounded(0.05, 0.082, 0.012, 0.01), M(hx, 1.27, 0));                                            // smart-lock pad
  add(cyl(0.014, 0.008), M(hx, 1.5, 0.004, new THREE.Euler(Math.PI / 2, 0, 0)));                    // peephole
  add(cyl(0.012, 0.006), M(hx, 1.5, -T - 0.003, new THREE.Euler(Math.PI / 2, 0, 0)));
  add(rounded(0.03, 0.06, 0.008, 0.008), M(hx, 0.84, -T - 0.008));                                   // inner thumb-turn plate
  for (const yy of [0.2, 1.25, 1.82]) add(cyl(0.011, 0.12, 12), M(0, yy, 0));                        // barrel hinges on the pivot
  return b.build();
}

type Door = {
  storey: number; apt: number; num: number;
  hx: number; hy: number; ux: number; uy: number; nx: number; ny: number;
  cx: number; cy: number; lw: number; th: number; side: number;
  ox: number; oy: number; S: number; D: number; open: boolean;
  base: THREE.Matrix4; mesh: THREE.InstancedMesh; idx: number;
};

export class EntryDoors {
  readonly group = new THREE.Group();
  /** One sub-group per storey: only the storeys that can be seen are drawn (≈7 doors instead of 105). */
  private floors = new Map<number, THREE.Group>();
  private doors: Door[] = [];
  private tmp = new THREE.Matrix4();
  private rot = new THREE.Matrix4();

  constructor(blockId: number) {
    this.group.name = 'entry-doors';
    const list: { storey: number; e: Entry; num: number }[] = [];
    for (let s = 2; s <= FLOORS; s++) {
      const plan = planFor(s);
      for (const e of DATA[s === 2 ? '2' : '3']) {
        const a = plan.apts[e.apt];
        if (!a) continue;
        list.push({ storey: s, e, num: aptInfo(blockId, s, e.apt, a.label).num });
      }
    }
    // materials (all clipped by the storey cutaway like the walls)
    const { map, nmap } = leafTextures();
    const outer = prep(new THREE.MeshStandardMaterial({ map, normalMap: nmap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.58, metalness: 0.12 }));
    const inner = prep(new THREE.MeshStandardMaterial({ color: '#d9d5cd', roughness: 0.5 }));
    const edge = prep(new THREE.MeshStandardMaterial({ color: '#2f3136', roughness: 0.45, metalness: 0.35 }));
    const hw = prep(new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.32, metalness: 0.6 }));
    const frameM = prep(new THREE.MeshStandardMaterial({ color: '#2c2e33', roughness: 0.5, metalness: 0.3 }));
    const sillM = prep(new THREE.MeshStandardMaterial({ color: '#55585e', roughness: 0.35, metalness: 0.7 }));
    outer.name = 'door_leaf_outer'; inner.name = 'door_leaf_inner'; edge.name = 'door_leaf_edge'; hw.name = 'door_hardware';
    frameM.name = 'door_frame'; sillM.name = 'door_sill';

    // one leaf size for all (spans are 0.99–1.01 m)
    const span = list.reduce((a, d) => a + d.e.span, 0) / Math.max(1, list.length);
    const lw = span - 2 * FW - 2 * GAP;
    const y0 = SLAB + SILL + GAP, lh = HEAD - FW - GAP - y0;
    const det = (e: Entry) => e.u[0] * e.n[1] - e.u[1] * e.n[0];
    const leafGeo = [leafGeometry(lw, lh, false), leafGeometry(lw, lh, true)];
    const leafMats = [outer, inner, edge, hw];
    const atlas = plateAtlas(list.map((d) => d.num));
    const plateM = prep(new THREE.MeshStandardMaterial({ map: atlas.tex, roughness: 0.42, metalness: 0.25 }), false);
    plateM.name = 'door_plate';
    const perFloor = new Map<number, { fb: GB; pb: GB; meshes: (THREE.InstancedMesh | null)[]; n: number[] }>();
    for (const d of list) {
      let f = perFloor.get(d.storey);
      if (!f) {
        const g = new THREE.Group(); g.name = `entry-doors-${d.storey}`; g.visible = false;
        this.floors.set(d.storey, g); this.group.add(g);
        const n = [0, 0];
        list.filter((q) => q.storey === d.storey).forEach((q) => n[det(q.e) < 0 ? 1 : 0]++);
        const meshes = n.map((c, k) => {
          if (!c) return null;
          const m = new THREE.InstancedMesh(leafGeo[k], leafMats, c);
          m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false;
          m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          g.add(m); return m;
        });
        f = { fb: new GB(2), pb: new GB(1), meshes, n: [0, 0] };
        perFloor.set(d.storey, f);
      }
    }

    // frame + threshold for every door, merged per storey; number plates on one atlas
    list.forEach((d, i) => {
      const fl = perFloor.get(d.storey)!, fb = fl.fb, pb = fl.pb;
      const e = d.e, S = e.span, D = e.depth, flip = det(e) < 0;
      const base = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(e.u[0], 0, e.u[1]), new THREE.Vector3(0, 1, 0), new THREE.Vector3(e.n[0], 0, e.n[1]));
      base.setPosition(e.hinge[0], (d.storey - 1) * FLOOR_H, e.hinge[1]);
      const F = 0, SL = 1;
      // box frame inside the opening, over the full wall depth (no gap to the reveals)
      fb.box(0, FW, SLAB, HEAD, -D, 0, F, base, flip);
      fb.box(S - FW, S, SLAB, HEAD, -D, 0, F, base, flip);
      fb.box(0, S, HEAD - FW, HEAD, -D, 0, F, base, flip);
      // face frames on both wall faces, lapping the plaster
      for (const [za, zb] of [[0, AT], [-D - AT, -D]]) {
        fb.box(FW - AW, FW, SLAB, HEAD - FW, za, zb, F, base, flip);
        fb.box(S - FW, S - FW + AW, SLAB, HEAD - FW, za, zb, F, base, flip);
        fb.box(FW - AW, S - FW + AW, HEAD - FW, HEAD - FW + AW, za, zb, F, base, flip);
      }
      fb.box(FW, S - FW, SLAB, SLAB + SILL, -D, 0, SL, base, flip);
      // number plate centred above the frame on the corridor face
      const pw = 0.22, ph = 0.11, py = HEAD - FW + AW + 0.05 + ph / 2;
      const col = i % COLS, row = Math.floor(i / COLS);
      const u0 = (col * CW + 2) / atlas.w, u1 = ((col + 1) * CW - 2) / atlas.w;
      const v1 = 1 - (row * CH + 2) / atlas.h, v0 = 1 - ((row + 1) * CH - 2) / atlas.h;
      const plate = new THREE.BoxGeometry(pw, ph, 0.008); plate.translate(S / 2, py, 0.004);
      const uv = plate.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) {
        const face = Math.floor(k / 4);
        // a mirrored door basis would mirror the digits: run u the other way there
        if (face === 4) uv.setXY(k, flip ? u1 - uv.getX(k) * (u1 - u0) : u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
        else uv.setXY(k, 1 - 1 / atlas.w, 1 / atlas.h);           // edges: plain dark corner of the atlas
      }
      pb.add(plate, 0, base, flip); plate.dispose();
      // leaf instance
      const k = flip ? 1 : 0, mesh = fl.meshes[k]!, idx = fl.n[k]++;
      const px = FW + GAP, pz = -SET;
      const pivot = new THREE.Matrix4().makeTranslation(px, y0, pz).premultiply(base);
      const hx = e.hinge[0] + e.u[0] * px + e.n[0] * pz, hy = e.hinge[1] + e.u[1] * px + e.n[1] * pz;
      const door: Door = {
        storey: d.storey, apt: e.apt, num: d.num, hx, hy, ux: e.u[0], uy: e.u[1], nx: e.n[0], ny: e.n[1],
        cx: e.hinge[0] + e.u[0] * S / 2 - e.n[0] * D / 2, cy: e.hinge[1] + e.u[1] * S / 2 - e.n[1] * D / 2, lw, th: 0, side: 0, base: pivot, mesh, idx,
        ox: e.hinge[0], oy: e.hinge[1], S, D, open: false,
      };
      this.doors.push(door);
      this.place(door);
    });
    perFloor.forEach((f, st) => {
      const frame = new THREE.Mesh(f.fb.build(), [frameM, sillM]);
      frame.receiveShadow = true; frame.name = 'door-frames';
      const plates = new THREE.Mesh(f.pb.build(), plateM); plates.name = 'door-plates';
      this.floors.get(st)!.add(frame, plates);
      f.meshes.forEach((m) => m && (m.instanceMatrix.needsUpdate = true));
    });
  }

  /** Draw only these storeys (walk: the visitor's storey and its neighbours; plan cutaway: the cut storey). */
  show(storeys: number[]) {
    this.floors.forEach((g, st) => (g.visible = storeys.includes(st)));
  }

  private place(d: Door) {
    this.rot.makeRotationY(-d.th);
    this.tmp.multiplyMatrices(d.base, this.rot);
    d.mesh.setMatrixAt(d.idx, this.tmp);
  }

  /** The door the visitor can reach (same storey, within REACH of the opening). With a view direction the door
   *  being looked at wins over a closer one behind or beside (facing doors across a corridor). */
  near(who: { storey: number; x: number; y: number; yaw?: number } | null) {
    if (!who) return null;
    let best: Door | null = null, bs = Infinity;
    const fx = who.yaw === undefined ? 0 : -Math.sin(who.yaw), fy = who.yaw === undefined ? 0 : -Math.cos(who.yaw);
    for (const d of this.doors) {
      if (d.storey !== who.storey) continue;
      const dx = d.cx - who.x, dy = d.cy - who.y, dist = Math.hypot(dx, dy);
      if (dist > REACH) continue;
      const cos = dist > 0.05 ? (dx * fx + dy * fy) / dist : 1;     // 1 = straight ahead, −1 = behind
      const score = dist + (who.yaw === undefined ? 0 : (1 - cos) * 1.2);
      if (score < bs) { bs = score; best = d; }
    }
    return best ? { num: best.num, apt: best.apt, open: best.open } : null;
  }
  /** Open / close the reachable door; returns its new state or null if none is in reach. */
  toggle(who: { storey: number; x: number; y: number; yaw?: number } | null) {
    const n = this.near(who); if (!n || !who) return null;
    const d = this.doors.find((q) => q.storey === who.storey && q.num === n.num)!;
    d.open = !d.open;
    return { num: d.num, apt: d.apt, open: d.open };
  }
  /** A closed (or barely open) leaf fills its opening: may a body of radius r stand at (x, y)? */
  blocks(storey: number, x: number, y: number, r: number) {
    for (const d of this.doors) {
      if (d.storey !== storey || d.th > 1.15) continue;
      const dx = x - d.ox, dy = y - d.oy;
      const s = dx * d.ux + dy * d.uy, z = dx * d.nx + dy * d.ny;
      if (s > -0.05 && s < d.S + 0.05 && z > -d.D - r && z < r) return true;
    }
    return false;
  }

  /** Doors swing to their requested state; a leaf never sweeps through the visitor. */
  update(dt: number, who: { storey: number; x: number; y: number; r: number; apt: number | null } | null) {
    let changed = false;
    const touched = new Set<THREE.InstancedMesh>();
    for (const d of this.doors) {
      const here = !!who && who.storey === d.storey;
      const want = d.open ? OPEN : 0;
      if (Math.abs(want - d.th) < 1e-5 && !here) continue;
      let th = d.th + Math.sign(want - d.th) * Math.min(Math.abs(want - d.th), SPEED * dt);
      let side = 0;
      if (here) {
        // the leaf stays on whichever side of the visitor it was: pushed, never passed through
        const dx = who!.x - d.hx, dy = who!.y - d.hy;
        const lx = dx * d.ux + dy * d.uy, lz = dx * d.nx + dy * d.ny, dist = Math.hypot(lx, lz);
        if (dist < d.lw + who!.r + 0.04 && dist > 0.02) {
          const a = Math.atan2(lz, lx), rho = Math.asin(Math.min(1, (who!.r + 0.03) / dist)), tau = Math.min(0.6, T / dist);
          const lo = a - rho, hi = a + rho + tau;
          side = d.th <= lo ? -1 : d.th >= hi ? 1 : d.side || (lo > 0 && d.th - lo < hi - d.th ? -1 : 1);
          if (side < 0 && lo <= 0) side = 1;
          th = side < 0 ? Math.min(th, lo) : Math.max(th, hi);
        }
      }
      d.side = side;
      th = Math.max(0, Math.min(MAXP, th));
      if (Math.abs(th - d.th) > 1e-5) { d.th = th; this.place(d); touched.add(d.mesh); changed = true; }
    }
    touched.forEach((m) => (m.instanceMatrix.needsUpdate = true));
    return changed;
  }

  closeAll() {
    const touched = new Set<THREE.InstancedMesh>();
    for (const d of this.doors) { d.open = false; if (d.th) { d.th = 0; this.place(d); touched.add(d.mesh); } }
    touched.forEach((m) => (m.instanceMatrix.needsUpdate = true));
  }

  /** For tests / UI: number of the door of a flat. */
  numberOf(storey: number, apt: number) { return this.doors.find((d) => d.storey === storey && d.apt === apt)?.num ?? null; }
  openness(storey: number) { return this.doors.filter((d) => d.storey === storey).map((d) => +d.th.toFixed(2)); }
}
