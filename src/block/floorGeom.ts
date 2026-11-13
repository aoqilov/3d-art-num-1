// Builds the architectural shell of one storey from the extracted plan.
// Plan coords (x, y) map to three.js (X = x, Z = y); height is Y. Storey-local: slab 0..SLAB, ceiling at FLOOR_H.
import * as THREE from 'three';
import { FLOOR_H, PLAN, SLAB, pointInPoly, polyBounds, type FloorPlan, type Poly, type Pt, type Rect, type Room } from './plan';
import type { MatName } from './materials';

type Bucket = { pos: number[]; nor: number[]; uv: number[] };

export class MeshBuilder {
  buckets = new Map<MatName, Bucket>();
  private b(m: MatName) {
    let k = this.buckets.get(m);
    if (!k) { k = { pos: [], nor: [], uv: [] }; this.buckets.set(m, k); }
    return k;
  }
  private push(m: MatName, v: number[][], n: number[], uv: number[][]) {
    const k = this.b(m);
    for (let i = 0; i < v.length; i++) { k.pos.push(...v[i]); k.nor.push(...n); k.uv.push(...uv[i]); }
  }
  /** Vertical quad along plan segment a→b between heights z0..z1, front side facing plan normal (nx, ny). */
  vquad(m: MatName, ax: number, ay: number, bx: number, by: number, z0: number, z1: number, nx: number, ny: number) {
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-4 || z1 - z0 < 1e-4) return;
    const tx = (bx - ax) / L, ty = (by - ay) / L;
    const u0 = ax * tx + ay * ty, u1 = u0 + L;
    let A0 = [ax, z0, ay], B0 = [bx, z0, by], B1 = [bx, z1, by], A1 = [ax, z1, ay];
    let ua = u0, ub = u1;
    // (B0-A0) x (A1-A0) must point along +n
    const cx = (B0[1] - A0[1]) * (A1[2] - A0[2]) - (B0[2] - A0[2]) * (A1[1] - A0[1]);
    const cz = (B0[0] - A0[0]) * (A1[1] - A0[1]) - (B0[1] - A0[1]) * (A1[0] - A0[0]);
    if (cx * nx + cz * ny < 0) { [A0, B0] = [B0, A0]; [A1, B1] = [B1, A1]; [ua, ub] = [ub, ua]; }
    this.push(m, [A0, B0, B1, A0, B1, A1], [nx, 0, ny], [[ua, z0], [ub, z0], [ub, z1], [ua, z0], [ub, z1], [ua, z1]]);
  }
  /** Horizontal polygon (with holes) at height z, facing up or down. */
  hpoly(m: MatName, p: Poly, z: number, up: boolean, uvs = 1) {
    const contour = p.outer.map(([x, y]) => new THREE.Vector2(x, y));
    const holes = p.holes.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = contour.concat(...holes);
    for (const [a, b, c] of tris) {
      let A = all[a], B = all[b], C = all[c];
      // normal y of (B-A)x(C-A) in (x, y→Z) space: ny = dz1*dx2 - dx1*dz2
      const ny = (B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y);
      if ((ny > 0) !== up) [B, C] = [C, B];
      this.push(m, [[A.x, z, A.y], [B.x, z, B.y], [C.x, z, C.y]], [0, up ? 1 : -1, 0],
        [[A.x * uvs, A.y * uvs], [B.x * uvs, B.y * uvs], [C.x * uvs, C.y * uvs]]);
    }
  }
  /** Axis-aligned box in plan coords. `mat` may be one material or per-face {top,bottom,sides}. */
  box(mat: MatName | { top?: MatName; bottom?: MatName; side: MatName; px?: MatName | null; nx?: MatName | null; py?: MatName | null; ny?: MatName | null },
      x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) {
    const M = typeof mat === 'string' ? { side: mat, top: mat, bottom: mat } : mat;
    const r: Poly = { outer: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], holes: [] };
    if (M.top) this.hpoly(M.top, r, z1, true);
    if (M.bottom) this.hpoly(M.bottom, r, z0, false);
    const F = M as { side: MatName; px?: MatName | null; nx?: MatName | null; py?: MatName | null; ny?: MatName | null };
    const pick = (v: MatName | null | undefined) => (v === undefined ? F.side : v);
    const ny = pick(F.ny), py = pick(F.py), nx = pick(F.nx), px = pick(F.px);
    if (ny) this.vquad(ny, x0, y0, x1, y0, z0, z1, 0, -1);
    if (py) this.vquad(py, x0, y1, x1, y1, z0, z1, 0, 1);
    if (nx) this.vquad(nx, x0, y0, x0, y1, z0, z1, -1, 0);
    if (px) this.vquad(px, x1, y0, x1, y1, z0, z1, 1, 0);
  }
  /** Box between two plan points along an axis-aligned line with given half-width. */
  bar(m: MatName, ax: number, ay: number, bx: number, by: number, hw: number, z0: number, z1: number) {
    this.box(m, Math.min(ax, bx) - hw, Math.min(ay, by) - hw, Math.max(ax, bx) + hw, Math.max(ay, by) + hw, z0, z1);
  }
  build(): { geometry: THREE.BufferGeometry; mats: MatName[] } {
    const g = new THREE.BufferGeometry();
    const list = [...this.buckets].filter(([, k]) => k.pos.length);
    const total = list.reduce((t, [, k]) => t + k.pos.length / 3, 0);
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    const mats: MatName[] = [];
    let start = 0;
    for (const [m, k] of list) {
      const n = k.pos.length / 3;
      pos.set(k.pos, start * 3); nor.set(k.nor, start * 3); uv.set(k.uv, start * 2);
      g.addGroup(start, n, mats.length);
      mats.push(m);
      start += n;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    return { geometry: g, mats };
  }
}

export type StoreyKind = 1 | 2 | 3;

const H = {
  1: { sill: 0.12, head: 2.55, door: 2.55, open: 2.55 },
  2: { sill: 1.05, head: 2.5, door: 2.3, open: 2.3 },
  3: { sill: 1.05, head: 2.5, door: 2.3, open: 2.3 },
};

export function roomFloorMat(r: Room | undefined): MatName {
  if (!r) return 'floor_base';
  switch (r.kind) {
    case 'bath': return 'floor_tile';
    case 'balcony': return 'floor_deck';
    case 'shop': return 'floor_shop';
    case 'lift': return 'floor_base';
    case null: return r.apt === null ? 'floor_stone' : 'floor_wood';
    default: return 'floor_wood';
  }
}

export const STAIR_LAND = 1.3;
/** Ground floor entrance hall (between the lifts and the east wing, open to the courtyard); not a room in the drawing. */
export const HALL1 = { x0: 14.69, y0: 9.79, x1: 16.99, y1: 17.9 };

/** Plan rectangle of the stair flights (the stair room without its floor landing). */
export function stairWell(p: FloorPlan) {
  const sr = stairRoom(p) ?? stairRoom(PLAN['3']);
  if (!sr) return null;
  const b = polyBounds(sr.poly);
  return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 - STAIR_LAND };
}

/** Locates the stair hall: largest unlabelled public room near the core. */
export function stairRoom(p: FloorPlan) {
  return p.rooms.find((r) => r.kind === null && r.apt === null && r.area > 12 && r.area < 17 && (() => {
    const b = polyBounds(r.poly); const cx = (b.x0 + b.x1) / 2; return cx > 9 && cx < 13;
  })());
}

export function buildStorey(plan: FloorPlan, kind: StoreyKind) {
  const mb = new MeshBuilder();
  const h = H[kind];
  const rooms = plan.rooms;
  const inRoom = (x: number, y: number) => rooms.find((r) => pointInPoly(x, y, r.poly));
  const exteriorMat: MatName = kind === 1 ? 'brick' : 'facade';
  // the ground-floor entrance hall is a recess left out of the drawn footprint: it is indoors all the same
  const inHall = (x: number, y: number) => kind === 1 && x > HALL1.x0 - 0.05 && x < HALL1.x1 + 0.05 && y > HALL1.y0 && y < HALL1.y1 - 0.05;
  const inside = (x: number, y: number) => pointInPoly(x, y, plan.footprint) || inHall(x, y);
  const balconyAt = (x: number, y: number) => inRoom(x, y)?.kind === 'balcony';

  const classify = (x: number, y: number): MatName => {
    if (kind === 1 && inHall(x, y)) return 'paint_public';
    const r = inRoom(x, y);
    if (r) {
      if (r.kind === 'balcony') return 'facade';
      if (r.kind === 'bath') return 'tile_wall';
      if (r.kind === 'lift') return 'paint_public';
      if (r.apt === null && r.kind !== 'shop') return 'paint_public';
      return 'paint';
    }
    return inside(x, y) ? 'jamb' : exteriorMat;
  };

  // ---- walls (extruded union polygons)
  for (const w of plan.walls) {
    const rings = [w.outer, ...w.holes];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
        const L = Math.hypot(bx - ax, by - ay);
        if (L < 1e-3) continue;
        let nx = (by - ay) / L, ny = -(bx - ax) / L;
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        if (pointInPoly(mx + nx * 0.02, my + ny * 0.02, w)) { nx = -nx; ny = -ny; }
        const m = classify(mx + nx * 0.06, my + ny * 0.06);
        mb.vquad(m, ax, ay, bx, by, SLAB, FLOOR_H, nx, ny);
      }
    }
    mb.hpoly('cap', w, FLOOR_H, true);
  }

  // ---- openings: sills / lintels / frames
  const sideFaces = (r: Rect, z0: number, z1: number, topMat: MatName | null, botMat: MatName | null) => {
    if (r.axis === 'x') {
      const cx = (r.x0 + r.x1) / 2;
      mb.vquad(classify(cx, r.y0 - 0.06), r.x0, r.y0, r.x1, r.y0, z0, z1, 0, -1);
      mb.vquad(classify(cx, r.y1 + 0.06), r.x0, r.y1, r.x1, r.y1, z0, z1, 0, 1);
    } else {
      const cy = (r.y0 + r.y1) / 2;
      mb.vquad(classify(r.x0 - 0.06, cy), r.x0, r.y0, r.x0, r.y1, z0, z1, -1, 0);
      mb.vquad(classify(r.x1 + 0.06, cy), r.x1, r.y0, r.x1, r.y1, z0, z1, 1, 0);
    }
    const p: Poly = { outer: [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]], holes: [] };
    if (topMat) mb.hpoly(topMat, p, z1, true);
    if (botMat) mb.hpoly(botMat, p, z0, false);
  };

  const exteriorSide = (r: Rect): { nx: number; ny: number } | null => {
    if (r.axis === 'x') {
      const cx = (r.x0 + r.x1) / 2;
      const a = !inside(cx, r.y0 - 0.15), b = !inside(cx, r.y1 + 0.15);
      return a ? { nx: 0, ny: -1 } : b ? { nx: 0, ny: 1 } : null;
    }
    const cy = (r.y0 + r.y1) / 2;
    const a = !inside(r.x0 - 0.15, cy), b = !inside(r.x1 + 0.15, cy);
    return a ? { nx: -1, ny: 0 } : b ? { nx: 1, ny: 0 } : null;
  };

  const frameAndGlass = (r: Rect, z0: number, z1: number, mullionStep: number, frameMat: MatName, transom?: number) => {
    const fw = 0.055;
    const along = r.axis === 'x' ? [r.x0, r.x1] : [r.y0, r.y1];
    const c = r.axis === 'x' ? (r.y0 + r.y1) / 2 : (r.x0 + r.x1) / 2;
    const P = (u: number, v: number): Pt => (r.axis === 'x' ? [u, v] : [v, u]);
    const glassN = r.axis === 'x' ? [0, 1] : [1, 0];
    const [g0, g1] = P(along[0], c), [g2, g3] = P(along[1], c);
    mb.vquad('glass', g0, g1, g2, g3, z0, z1, glassN[0], glassN[1]);
    const bar = (u0: number, u1: number, zz0: number, zz1: number) => {
      const [a0, a1] = P(u0, c - 0.035), [b0, b1] = P(u1, c + 0.035);
      mb.box(frameMat, Math.min(a0, b0), Math.min(a1, b1), Math.max(a0, b0), Math.max(a1, b1), zz0, zz1);
    };
    bar(along[0], along[0] + fw, z0, z1);
    bar(along[1] - fw, along[1], z0, z1);
    bar(along[0], along[1], z0, z0 + fw);
    bar(along[0], along[1], z1 - fw, z1);
    const span = along[1] - along[0];
    const n = Math.max(1, Math.round(span / mullionStep));
    for (let i = 1; i < n; i++) { const u = along[0] + (span * i) / n; bar(u - fw / 2, u + fw / 2, z0, z1); }
    if (transom) bar(along[0], along[1], transom - fw / 2, transom + fw / 2);
  };

  for (const w of plan.windows) {
    sideFaces(w, SLAB, h.sill, 'sill', null);
    sideFaces(w, h.head, FLOOR_H, 'cap', 'jamb');
    const ext = exteriorSide(w);
    const loggia = (() => {
      const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2;
      return w.axis === 'x' ? balconyAt(cx, w.y0 - 0.2) || balconyAt(cx, w.y1 + 0.2) : balconyAt(w.x0 - 0.2, cy) || balconyAt(w.x1 + 0.2, cy);
    })();
    frameAndGlass(w, h.sill, h.head, kind === 1 ? 1.25 : 0.75, 'frame', kind === 1 ? 2.08 : undefined);
    // dark spandrel strip on the facade plane (render: continuous slate bands through every window column)
    if (ext && !loggia && kind !== 1) {
      const o = 0.012;
      if (w.axis === 'x') {
        const y = ext.ny < 0 ? w.y0 - o : w.y1 + o;
        mb.vquad('spandrel', w.x0, y, w.x1, y, -SLAB * 0, h.sill, 0, ext.ny);
        mb.vquad('spandrel', w.x0, y, w.x1, y, h.head, FLOOR_H, 0, ext.ny);
      } else {
        const x = ext.nx < 0 ? w.x0 - o : w.x1 + o;
        mb.vquad('spandrel', x, w.y0, x, w.y1, 0, h.sill, ext.nx, 0);
        mb.vquad('spandrel', x, w.y0, x, w.y1, h.head, FLOOR_H, ext.nx, 0);
      }
    }
  }

  for (const o of plan.openings) {
    const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
    const toBalcony = o.axis === 'x' ? balconyAt(cx, o.y0 - 0.2) || balconyAt(cx, o.y1 + 0.2) : balconyAt(o.x0 - 0.2, cy) || balconyAt(o.x1 + 0.2, cy);
    const head = o.kind === 'open' ? h.open : toBalcony ? h.head : h.door;
    sideFaces(o, head, FLOOR_H, 'cap', 'jamb');
    // threshold floor so doorways don't show bare slab
    const side = o.axis === 'x' ? [inRoom(cx, o.y0 - 0.1), inRoom(cx, o.y1 + 0.1)] : [inRoom(o.x0 - 0.1, cy), inRoom(o.x1 + 0.1, cy)];
    const fr = side.find((r) => r && r.kind !== 'bath' && r.kind !== 'balcony') ?? side.find(Boolean);
    mb.hpoly(roomFloorMat(fr), { outer: [[o.x0, o.y0], [o.x1, o.y0], [o.x1, o.y1], [o.x0, o.y1]], holes: [] }, SLAB, true);
    // doors to the outside or onto a balcony are glazed, never left as holes in the envelope
    const outside = o.axis === 'x'
      ? !inside(cx, o.y0 - 0.2) || !inside(cx, o.y1 + 0.2)
      : !inside(o.x0 - 0.2, cy) || !inside(o.x1 + 0.2, cy);
    if (toBalcony || (outside && o.kind !== 'lift' && !(kind === 1 && o.kind === 'door'))) frameAndGlass(o, SLAB, head, o.span > 1.3 ? 0.7 : 2, 'frame');
    if (kind === 1 && o.kind === 'door') frameAndGlass(o, SLAB, head, 0.9, 'frame', 2.08);
  }

  // ---- glass partitions (kitchen | living sliding walls)
  for (const g of plan.glass) {
    const t = 0.012;
    const r: Rect = g.axis === 'x'
      ? { ...g, y0: (g.y0 + g.y1) / 2 - t, y1: (g.y0 + g.y1) / 2 + t }
      : { ...g, x0: (g.x0 + g.x1) / 2 - t, x1: (g.x0 + g.x1) / 2 + t };
    frameAndGlass(r, SLAB, FLOOR_H - 0.02, 0.85, 'rail');
  }

  // ---- slab (open over the flights of the storey below, so the stair can actually be climbed)
  const well = kind !== 1 ? stairWell(plan) : null;
  const slabPoly: Poly = well
    ? { outer: plan.footprint.outer, holes: [...plan.footprint.holes, [[well.x0, well.y0], [well.x1, well.y0], [well.x1, well.y1], [well.x0, well.y1]]] }
    : plan.footprint;
  mb.hpoly('ceiling', slabPoly, 0, false);
  mb.hpoly('floor_base', slabPoly, SLAB - 0.012, true);
  if (well) {
    mb.vquad('stair', well.x0, well.y0, well.x1, well.y0, 0, SLAB, 0, 1);
    mb.vquad('stair', well.x0, well.y1, well.x1, well.y1, 0, SLAB, 0, -1);
    mb.vquad('stair', well.x0, well.y0, well.x0, well.y1, 0, SLAB, 1, 0);
    mb.vquad('stair', well.x1, well.y0, well.x1, well.y1, 0, SLAB, -1, 0);
  }
  const fp = plan.footprint.outer;
  for (let i = 0; i < fp.length; i++) {
    const [ax, ay] = fp[i], [bx, by] = fp[(i + 1) % fp.length];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-3) continue;
    let nx = (by - ay) / L, ny = -(bx - ax) / L;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (pointInPoly(mx + nx * 0.02, my + ny * 0.02, plan.footprint)) { nx = -nx; ny = -ny; }
    const balc = balconyAt(mx - nx * 0.15, my - ny * 0.15);
    mb.vquad(kind === 1 ? 'cap' : balc ? 'slab_edge' : 'facade', ax, ay, bx, by, 0, SLAB, nx, ny);
  }

  // ---- room finishes
  if (kind === 1) mb.hpoly('floor_stone', { outer: [[HALL1.x0, HALL1.y0], [HALL1.x1, HALL1.y0], [HALL1.x1, HALL1.y1 - 0.1], [HALL1.x0, HALL1.y1 - 0.1]], holes: [] }, SLAB, true);
  const sRoom = well ? stairRoom(plan) : null;
  for (const r of rooms) {
    if (r.kind === 'lift') continue;
    if (well && r === sRoom) {
      const b = polyBounds(r.poly);
      mb.hpoly(roomFloorMat(r), { outer: [[b.x0, well.y1], [b.x1, well.y1], [b.x1, b.y1], [b.x0, b.y1]], holes: [] }, SLAB, true);
      continue;
    }
    mb.hpoly(roomFloorMat(r), r.poly, SLAB, true);
  }

  // ---- railings
  for (const rl of plan.rails) {
    const z0 = SLAB, top = SLAB + 1.1;
    const a: Pt = rl.axis === 'h' ? [rl.lo, rl.off] : [rl.off, rl.lo];
    const b: Pt = rl.axis === 'h' ? [rl.hi, rl.off] : [rl.off, rl.hi];
    mb.bar('rail', a[0], a[1], b[0], b[1], 0.028, top - 0.05, top);
    mb.bar('rail', a[0], a[1], b[0], b[1], 0.018, z0 + 0.08, z0 + 0.12);
    const L = rl.hi - rl.lo;
    const n = Math.max(2, Math.round(L / 0.11));
    for (let i = 0; i <= n; i++) {
      const u = rl.lo + (L * i) / n;
      const p: Pt = rl.axis === 'h' ? [u, rl.off] : [rl.off, u];
      const post = i === 0 || i === n || i % 11 === 0;
      mb.bar('rail', p[0], p[1], p[0], p[1], post ? 0.022 : 0.008, z0, top - 0.05);
    }
  }

  // ---- stairs (switchback; floor landing on the courtyard side, mid landing toward the corridor)
  const sr = stairRoom(plan) ?? stairRoom(PLAN_TYP());
  if (sr) {
    const b = polyBounds(sr.poly);
    const land = STAIR_LAND, gap = 0.12;
    const w = (b.x1 - b.x0 - gap) / 2;
    const yF = b.y1 - land, yM = b.y0 + land;
    const steps = 9, rise = FLOOR_H / 2 / steps;
    const run = (yF - yM) / (steps - 1);
    const z00 = SLAB;
    // flight 1: east half, from floor landing (y=yF) going north up to mid landing
    for (let i = 0; i < steps - 1; i++) {
      const zt = z00 + rise * (i + 1);
      const y1 = yF - run * i, y0 = y1 - run;
      mb.box({ side: 'stair', top: 'stair', bottom: 'stair' }, b.x0 + w + gap, y0, b.x1, y1, zt - 0.22, zt);
    }
    // mid landing
    mb.box('stair', b.x0, b.y0, b.x1, yM, z00 + FLOOR_H / 2 - 0.22, z00 + FLOOR_H / 2);
    // flight 2: west half, from mid landing south up to next floor
    for (let i = 0; i < steps - 1; i++) {
      const zt = z00 + FLOOR_H / 2 + rise * (i + 1);
      const y0 = yM + run * i, y1 = y0 + run;
      mb.box('stair', b.x0, y0, b.x0 + w, y1, zt - 0.22, zt);
    }
    // central handrail
    const xr = b.x0 + w + gap / 2;
    mb.bar('rail', xr, yM, xr, yF, 0.02, z00 + 0.9, z00 + 0.95 + FLOOR_H / 2);
  }
  return mb.build();
}

const PLAN_TYP = () => PLAN['3'];
