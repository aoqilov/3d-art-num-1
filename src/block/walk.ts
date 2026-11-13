// First-person walk on one storey: flats, corridor, lift hall, open-air stair balcony and the stair landing
// (ground floor: entrance hall and the courtyard in front of it). A 5 cm occupancy grid is rasterised from
// the extracted plan with a 2D canvas, eroded by the body radius, and searched with A*.
import { PLAN, planFor, pointInPoly, polyBounds, type FloorPlan, type Poly, type Rect, type Room, type RoomKind } from './plan';
import { HALL1, STAIR_LAND, stairRoom } from './floorGeom';
import furnRaw from './data/furn_t4.json';

const RES = 0.05;
const FURN_PAD = 0.07;     // keep this far from furniture (walls keep the full body radius)
const BLOCKERS = new Set(['bed', 'wardrobe', 'sofa', 'armchair', 'table', 'counter', 'tub', 'coffee', 'tv', 'nightstand', 'toilet', 'basin', 'washer', 'pouf']);
type Furn = { t: string; x0: number; y0: number; x1: number; y1: number };
const FURN = furnRaw as unknown as Record<string, Furn[]>;

export type FloorKey = '1' | '2' | '3';
export const keyOf = (storey: number): FloorKey => (storey === 1 ? '1' : storey === 2 ? '2' : '3');
export type ViewSpot = { x: number; y: number; yaw: number };
export type Place = 'apt' | 'corridor' | 'lifthall' | 'airbalcony' | 'stair' | 'entrance' | 'yard';
type R = { x0: number; y0: number; x1: number; y1: number };

const yawFrom = (dx: number, dy: number) => Math.atan2(-dx, -dy); // camera looks along (-sin yaw, -cos yaw)
const inR = (r: R, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

/** The two lifts of the core (same position on every storey), cabin facing the lift hall (+x). */
export type Lift = { id: number; cab: R; door: { x: number; y0: number; y1: number }; front: [number, number] };
export const LIFTS: Lift[] = (() => {
  const p = PLAN['3'];
  return p.openings.filter((o) => o.kind === 'lift').map((o, id) => {
    const cy = (o.y0 + o.y1) / 2;
    const room = p.rooms.find((r) => r.kind === 'lift' && pointInPoly(o.x0 - 0.3, cy, r.poly))!;
    const b = polyBounds(room.poly);
    return { id, cab: { x0: b.x0 + 0.06, y0: b.y0 + 0.06, x1: o.x0 - 0.02, y1: b.y1 - 0.06 }, door: { x: (o.x0 + o.x1) / 2, y0: o.y0, y1: o.y1 }, front: [o.x1 + 0.75, cy] as [number, number] };
  }).sort((a, b) => a.door.y0 - b.door.y0).map((l, i) => ({ ...l, id: i }));
})();

/** Ground floor: entrance hall between the lifts and the east wing, open to the courtyard. */
const YARD: R = { x0: 12.6, y0: 17.86, x1: 19.2, y1: 22.6 };

export class FloorGrid {
  readonly plan: FloorPlan;
  readonly x0: number; readonly y0: number; readonly nx: number; readonly ny: number;
  private wall: Uint8Array;  // 1 = blocks sight (walls, windows, outside)
  private ok: Uint8Array;    // 1 = body centre can stand (walls + furniture)
  private okW: Uint8Array;   // same ignoring furniture
  readonly stair: { room: Room; land: R; x0: number; x1: number; yF: number; yM: number } | null;
  private spotsCache = new Map<number, ViewSpot[]>();
  private reachCache = new Map<number, Uint8Array>();

  /** body: half of the visitor's shoulder width (m) — passages narrower than the body are closed */
  constructor(readonly key: FloorKey, readonly body = 0.2) {
    const plan = (this.plan = PLAN[key]);
    const fb = polyBounds(plan.footprint);
    this.x0 = fb.x0 - 0.3; this.y0 = fb.y0 - 0.3;
    const y1 = (key === '1' ? YARD.y1 : fb.y1) + 0.3;
    this.nx = Math.ceil((fb.x1 + 0.3 - this.x0) / RES); this.ny = Math.ceil((y1 - this.y0) / RES);

    const sr = key === '1' ? null : stairRoom(plan);
    if (sr) {
      const b = polyBounds(sr.poly), w = (b.x1 - b.x0 - 0.12) / 2;
      this.stair = { room: sr, land: { x0: b.x0, y0: b.y1 - STAIR_LAND + 0.08, x1: b.x1, y1: b.y1 }, x0: b.x0 + w / 2, x1: b.x0 + w + 0.12 + w / 2, yF: b.y1 - STAIR_LAND, yM: b.y0 + STAIR_LAND };
    } else this.stair = null;

    // walkable areas
    const open = (r: Room) => {
      if (r.kind === 'lift' || r.kind === 'shop' || r === sr) return false;
      if (key === '1') return false;
      return r.apt !== null || r.area > 2.5; // public: corridor, lift hall, air balcony (not the shafts)
    };
    const areas: R[] = key === '1' ? [HALL1, YARD] : [];
    const corr1 = key === '1' ? plan.rooms.find((r) => r.apt === null && r.kind === null && pointInPoly(18, 8.7, r.poly)) : undefined;
    if (this.stair) areas.push(this.stair.land);
    const allowedAt = (x: number, y: number) => areas.some((a) => inR(a, x, y)) || plan.rooms.some((r) => (open(r) || r === corr1) && pointInPoly(x, y, r.poly));
    // an opening is a door if somewhere along it both sides are walkable (wide openings can end on a room joint)
    const doors = plan.openings.filter((o) => {
      if (o.kind === 'lift') return false;
      return [0.15, 0.3, 0.5, 0.7, 0.85].some((t) => {
        const cx = o.x0 + (o.x1 - o.x0) * t, cy = o.y0 + (o.y1 - o.y0) * t;
        return o.axis === 'y' ? allowedAt(o.x0 - 0.2, cy) && allowedAt(o.x1 + 0.2, cy) : allowedAt(cx, o.y0 - 0.2) && allowedAt(cx, o.y1 + 0.2);
      });
    });

    const c = document.createElement('canvas'); c.width = this.nx; c.height = this.ny;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.setTransform(1 / RES, 0, 0, 1 / RES, -this.x0 / RES, -this.y0 / RES);
    const ring = (pts: [number, number][]) => { pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    const poly = (p: Poly) => { g.beginPath(); ring(p.outer); p.holes.forEach(ring); g.fill('evenodd'); };
    const rect = (r: R, pad = 0) => g.fillRect(r.x0 - pad, r.y0 - pad, r.x1 - r.x0 + 2 * pad, r.y1 - r.y0 + 2 * pad);
    g.fillStyle = '#000'; g.fillRect(this.x0, this.y0, this.nx * RES, this.ny * RES);
    g.fillStyle = '#fff';
    plan.rooms.forEach((r) => { if (open(r) || r === corr1) poly(r.poly); });
    areas.forEach((a) => rect(a));
    doors.forEach((o) => rect(o, 0.01));
    // kitchen | living glass walls are sliding doors: passable, and see-through
    plan.glass.forEach((gl) => { if (allowedAt((gl.x0 + gl.x1) / 2, gl.y0 - 0.25) || allowedAt(gl.x0 - 0.25, (gl.y0 + gl.y1) / 2)) rect(gl, 0.02); });
    g.fillStyle = '#000';
    plan.walls.forEach(poly);
    plan.windows.forEach((w) => rect(w, 0.03));
    plan.rooms.forEach((r) => { if (r.kind === 'lift') poly(r.poly); });
    if (key === '1') { // ground floor: building walls around the hall that the drawing leaves open, minus the entrance
      const ent = plan.openings.find((o) => o.y0 > 17.5 && o.x0 > 14 && o.x1 < 17.5);
      g.fillRect(12.5, 17.78, (ent?.x0 ?? 14.85) - 12.5, 0.12); g.fillRect(ent?.x1 ?? 16.82, 17.78, 19.2 - (ent?.x1 ?? 16.82), 0.12);
    }
    const N = this.nx * this.ny;
    const read = () => { const d = g.getImageData(0, 0, this.nx, this.ny).data; const m = new Uint8Array(N); for (let k = 0; k < N; k++) m[k] = d[k * 4] < 128 ? 1 : 0; return m; };
    this.wall = read();
    for (const f of FURN[key] ?? []) if (BLOCKERS.has(f.t)) rect(f);
    const solid = read();
    const furn = new Uint8Array(N); for (let k = 0; k < N; k++) furn[k] = solid[k] && !this.wall[k] ? 1 : 0;
    this.okW = this.erode(this.wall);
    // furniture only keeps a small margin: the body may brush past a bed or a wardrobe, not walk into it
    const nf = this.erode(furn, FURN_PAD);
    this.ok = new Uint8Array(N); for (let k = 0; k < N; k++) this.ok[k] = this.okW[k] & nf[k];
    this.connect();
  }

  /** Every part of the storey must be reachable on foot: where furniture still cuts a room off,
   *  open the shortest way through it (a path carved from the reachable area to the cut-off part). */
  private connect() {
    const ok = this.ok, okW = this.okW, nx = this.nx, ny = this.ny, N = ok.length;
    const st = this.key === '1' ? this.startYard() : this.startHall();
    const s0 = this.cell(st.x, st.y);
    if (s0 < 0 || !ok[s0]) return;
    const nb = (k: number) => { const i = k % nx, j = (k / nx) | 0; return [i + 1 < nx ? k + 1 : -1, i > 0 ? k - 1 : -1, j + 1 < ny ? k + nx : -1, j > 0 ? k - nx : -1]; };
    const flood = (m: Uint8Array, seeds: number[]) => {
      const seen = new Uint8Array(N), q = seeds.filter((k) => m[k]); q.forEach((k) => (seen[k] = 1));
      while (q.length) { const k = q.pop()!; for (const n of nb(k)) if (n >= 0 && !seen[n] && m[n]) { seen[n] = 1; q.push(n); } }
      return seen;
    };
    const walkable = flood(okW, [s0]);                  // what the walls allow at all
    for (let iter = 0; iter < 300; iter++) {
      const reached = flood(ok, [s0]);
      // breadth-first over the wall-free area, from everything reached, to the nearest cut-off standing cell
      const from = new Int32Array(N).fill(-2), q: number[] = [];
      for (let k = 0; k < N; k++) if (reached[k]) { from[k] = -1; q.push(k); }
      let hit = -1;
      for (let h = 0; h < q.length && hit < 0; h++) {
        for (const n of nb(q[h])) {
          if (n < 0 || from[n] !== -2 || !okW[n]) continue;
          from[n] = q[h];
          if (ok[n] && !reached[n] && walkable[n]) { hit = n; break; }
          q.push(n);
        }
      }
      if (hit < 0) break;
      // carve a corridor ~25 cm wide along the way back
      for (let k = hit; k >= 0 && !reached[k]; k = from[k]) {
        const i = k % nx, j = (k / nx) | 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
          const a = i + di, b = j + dj;
          if (a >= 0 && b >= 0 && a < nx && b < ny && okW[b * nx + a]) ok[b * nx + a] = 1;
        }
      }
    }
  }

  private erode(solid: Uint8Array, radius = this.body) {
    const ok = new Uint8Array(solid.length).fill(1);
    const rr = Math.ceil(radius / RES), r2 = (radius / RES) ** 2, nx = this.nx, ny = this.ny;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!solid[k]) continue;
      ok[k] = 0;
      const edge = (i > 0 && !solid[k - 1]) || (i < nx - 1 && !solid[k + 1]) || (j > 0 && !solid[k - nx]) || (j < ny - 1 && !solid[k + nx]);
      if (!edge) continue;
      for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
        if (di * di + dj * dj > r2) continue;
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < nx && b < ny) ok[b * nx + a] = 0;
      }
    }
    return ok;
  }

  private cell(x: number, y: number) {
    const i = Math.floor((x - this.x0) / RES), j = Math.floor((y - this.y0) / RES);
    return i < 0 || j < 0 || i >= this.nx || j >= this.ny ? -1 : j * this.nx + i;
  }
  canStand(x: number, y: number, m = this.ok) { const k = this.cell(x, y); return k >= 0 && m[k] === 1; }
  inside(x: number, y: number) { const k = this.cell(x, y); return k >= 0 && this.wall[k] === 0; }
  sees(ax: number, ay: number, bx: number, by: number) {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / (RES * 0.6));
    for (let s = 1; s < n; s++) { const t = s / n; if (!this.inside(ax + (bx - ax) * t, ay + (by - ay) * t)) return false; }
    return true;
  }
  private passes(ax: number, ay: number, bx: number, by: number, m = this.ok) {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / (RES * 0.6));
    for (let s = 1; s <= n; s++) { const t = s / n; if (!this.canStand(ax + (bx - ax) * t, ay + (by - ay) * t, m)) return false; }
    return true;
  }
  private boxedIn(x: number, y: number) {
    for (let r = 0.05; r <= 0.6; r += 0.05) for (let a = 0; a < 16; a++) if (this.canStand(x + Math.cos(a * 0.39) * r, y + Math.sin(a * 0.39) * r)) return false;
    return true;
  }
  /** Closest standing point; strict = never inside furniture (look further instead). */
  nearest(x: number, y: number, strict = false): [number, number] | null {
    if (this.canStand(x, y)) return [x, y];
    if (!strict && this.canStand(x, y, this.okW) && this.boxedIn(x, y)) return [x, y];
    for (let r = 1; r < 60; r++) {
      let best: [number, number] | null = null, bd = Infinity;
      for (let a = 0; a < 24; a++) {
        const px = x + Math.cos((a / 24) * Math.PI * 2) * r * RES, py = y + Math.sin((a / 24) * Math.PI * 2) * r * RES;
        if (this.canStand(px, py)) { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = [px, py]; } }
      }
      if (best) return best;
    }
    return null;
  }
  step(x: number, y: number, dx: number, dy: number): [number, number] {
    const m = this.canStand(x, y) ? this.ok : this.okW;
    if (this.canStand(x + dx, y + dy, m)) return [x + dx, y + dy];
    if (this.canStand(x + dx, y, m)) return [x + dx, y];
    if (this.canStand(x, y + dy, m)) return [x, y + dy];
    return [x, y];
  }

  path(ax: number, ay: number, bx: number, by: number): [number, number][] | null {
    return this.astar(ax, ay, bx, by, this.ok) ?? this.astar(ax, ay, bx, by, this.okW);
  }
  private astar(ax: number, ay: number, bx: number, by: number, ok: Uint8Array): [number, number][] | null {
    const s = this.cell(ax, ay), g = this.cell(bx, by);
    if (s < 0 || g < 0 || !ok[g] || !ok[s]) return null;
    if (this.passes(ax, ay, bx, by, ok)) return [[bx, by]];
    const nx = this.nx, N = ok.length;
    const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const gi = g % nx, gj = (g / nx) | 0;
    const h = (k: number) => Math.hypot((k % nx) - gi, ((k / nx) | 0) - gj);
    const heap = new Heap();
    gs[s] = 0; heap.push(s, h(s));
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.size) {
      const k = heap.pop();
      if (k === g) break;
      if (closed[k]) continue;
      closed[k] = 1;
      const i = k % nx, j = (k / nx) | 0;
      for (const [di, dj, c] of D) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= this.ny) continue;
        const n = b * nx + a;
        if (!ok[n] || closed[n]) continue;
        if (di && dj && (!ok[j * nx + a] || !ok[b * nx + i])) continue;
        const ng = gs[k] + c;
        if (ng < gs[n]) { gs[n] = ng; from[n] = k; heap.push(n, ng + h(n)); }
      }
    }
    if (from[g] < 0) return null;
    const cells: [number, number][] = [];
    for (let k = g; k !== s && k >= 0; k = from[k]) cells.push([this.x0 + ((k % nx) + 0.5) * RES, this.y0 + (((k / nx) | 0) + 0.5) * RES]);
    cells.reverse();
    cells[cells.length - 1] = [bx, by];
    const out: [number, number][] = [];
    let cx = ax, cy = ay, i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.passes(cx, cy, cells[j][0], cells[j][1], ok)) j--;
      out.push(cells[j]); [cx, cy] = cells[j]; i = j + 1;
    }
    return out;
  }

  /** Room, flat and kind of place at a plan point. */
  where(x: number, y: number): { room: Room | null; apt: number | null; place: Place } {
    const room = this.plan.rooms.find((r) => pointInPoly(x, y, r.poly)) ?? null;
    if (room && room.apt !== null) return { room, apt: room.apt, place: 'apt' };
    if (this.key === '1') return { room, apt: null, place: y > 17.85 ? 'yard' : inR(HALL1, x, y) ? 'entrance' : 'corridor' };
    if (this.stair && (room === this.stair.room || inR(this.stair.land, x, y))) return { room, apt: null, place: 'stair' };
    if (room?.kind === 'balcony') return { room, apt: null, place: 'airbalcony' };
    if (room && LIFTS.some((l) => pointInPoly(l.front[0], l.front[1], room.poly))) return { room, apt: null, place: 'lifthall' };
    return { room, apt: null, place: 'corridor' };
  }

  private centre(apt: number, kinds: RoomKind[]): [number, number] | null {
    const rs = this.plan.apts[apt].rooms.map((i) => this.plan.rooms[i]).filter((r) => kinds.includes(r.kind)).sort((a, b) => b.area - a.area);
    if (!rs.length) return null;
    const b = polyBounds(rs[0].poly);
    return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  }
  /** Inside a flat: the entrance hall, looking into the living room. */
  startApt(apt: number) {
    const a = this.centre(apt, ['hall', 'corridor']) ?? this.centre(apt, ['living', 'kitchen', 'bedroom'])!;
    const p = this.nearest(a[0], a[1]) ?? a;
    const t = this.centre(apt, ['living']) ?? this.centre(apt, ['kitchen']) ?? this.centre(apt, ['bedroom']) ?? [p[0], p[1] - 1];
    return { x: p[0], y: p[1], yaw: yawFrom(t[0] - p[0], t[1] - p[1]) };
  }
  /** In the lift hall, facing the lift doors. */
  startHall() {
    const l = LIFTS[LIFTS.length - 1];
    const p = this.nearest(l.front[0] + 1.0, (LIFTS[0].front[1] + l.front[1]) / 2) ?? l.front;
    return { x: p[0], y: p[1], yaw: Math.PI / 2 };
  }
  /** Ground floor: in the courtyard in front of the entrance, facing the building. */
  startYard() {
    const p = this.nearest((HALL1.x0 + HALL1.x1) / 2, 21.9)!;
    return { x: p[0], y: p[1], yaw: 0 };
  }

  /** Cells reachable on foot (without crossing furniture) from the flat's entrance hall, or from the lift hall. */
  private reach(apt: number | null) {
    const key = apt ?? -1;
    const hit = this.reachCache.get(key); if (hit) return hit;
    const st = apt === null ? (this.key === '1' ? this.startYard() : this.startHall()) : this.startApt(apt);
    const sp = this.nearest(st.x, st.y, true) ?? [st.x, st.y];
    const seen = new Uint8Array(this.ok.length), s0 = this.cell(sp[0], sp[1]);
    if (s0 >= 0 && this.ok[s0]) {
      const q = [s0]; seen[s0] = 1;
      while (q.length) {
        const k = q.pop()!, i = k % this.nx, j = (k / this.nx) | 0;
        for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
          if (a < 0 || b < 0 || a >= this.nx || b >= this.ny) continue;
          const n = b * this.nx + a;
          if (!seen[n] && this.ok[n]) { seen[n] = 1; q.push(n); }
        }
      }
    }
    this.reachCache.set(key, seen);
    return seen;
  }
  /** Reachable standing point nearest to (x, y) that still sees the target point. */
  private reachableNear(apt: number | null, x: number, y: number, tx: number, ty: number): [number, number] | null {
    const seen = this.reach(apt);
    for (let r = 0; r < 70; r++) {
      let best: [number, number] | null = null, bd = Infinity;
      const n = Math.max(1, Math.round(r * 6.3));
      for (let a = 0; a < n; a++) {
        const px = x + Math.cos((a / n) * Math.PI * 2) * r * RES, py = y + Math.sin((a / n) * Math.PI * 2) * r * RES;
        const k = this.cell(px, py);
        if (k < 0 || !seen[k] || !this.sees(px, py, tx, ty)) continue;
        const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = [px, py]; }
      }
      if (best) return best;
    }
    return null;
  }

  /** Window and balcony spots of one flat (or of the public part when apt is null), looking out. */
  viewSpots(apt: number | null): ViewSpot[] {
    const key = apt ?? -1;
    const hit = this.spotsCache.get(key); if (hit) return hit;
    const plan = this.plan;
    const mine = (x: number, y: number) => {
      const r = plan.rooms.find((q) => pointInPoly(x, y, q.poly));
      return !!r && (apt === null ? r.apt === null && r.kind === 'balcony' : r.apt === apt);
    };
    const spots: ViewSpot[] = [];
    // (tx, ty): a point just inside the window's inner face
    const add = (cx: number, cy: number, ox: number, oy: number, back: number, tx: number, ty: number) => {
      // stand in front of the window if the furniture lets you get there, otherwise as close as you can and look at it
      const p = this.reachableNear(apt, tx - ox * back, ty - oy * back, tx, ty);
      if (!p || !mine(p[0], p[1]) || spots.some((s) => Math.hypot(s.x - p[0], s.y - p[1]) < 1.2)) return;
      const dx = cx - p[0], dy = cy - p[1], far = Math.hypot(dx, dy) > back + 0.3;
      spots.push({ x: p[0], y: p[1], yaw: far ? yawFrom(dx, dy) : yawFrom(ox, oy) });
    };
    for (const w of plan.windows) {
      const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2;
      for (const d of [-1, 1]) {
        const [ox, oy] = w.axis === 'x' ? [0, d] : [d, 0];
        if (mine(cx - ox * 0.5, cy - oy * 0.5) && !pointInPoly(cx + ox * 0.5, cy + oy * 0.5, plan.footprint)) {
          const tx = w.axis === 'x' ? cx : (ox > 0 ? w.x0 : w.x1) - ox * 0.12, ty = w.axis === 'x' ? (oy > 0 ? w.y0 : w.y1) - oy * 0.12 : cy;
          add(cx, cy, ox, oy, 0.6, tx, ty);
        }
      }
    }
    for (const r of plan.rails) {
      const u = (r.lo + r.hi) / 2;
      for (const d of [-1, 1]) {
        const [cx, cy] = r.axis === 'h' ? [u, r.off] : [r.off, u];
        const [ox, oy] = r.axis === 'h' ? [0, d] : [d, 0];
        if (mine(cx - ox * 0.4, cy - oy * 0.4) && !mine(cx + ox * 0.4, cy + oy * 0.4)) add(cx, cy, ox, oy, 0.45, cx - ox * 0.12, cy - oy * 0.12);
      }
    }
    this.spotsCache.set(key, spots);
    return spots;
  }
}

const grids = new Map<string, FloorGrid>();
/** Walk grid of a storey for a body of the given half-width (cached per floor type and centimetre). */
export const gridFor = (storey: number, body = 0.2) => {
  const k = keyOf(storey), r = Math.round(body * 100) / 100, id = `${k}:${r}`;
  let g = grids.get(id);
  if (!g) { g = new FloorGrid(k, r); grids.set(id, g); }
  return g;
};
export { planFor };
export type { Rect };

class Heap {
  private k: number[] = []; private p: number[] = [];
  get size() { return this.k.length; }
  push(key: number, pri: number) {
    const k = this.k, p = this.p; let i = k.length; k.push(key); p.push(pri);
    while (i > 0) { const q = (i - 1) >> 1; if (p[q] <= pri) break; k[i] = k[q]; p[i] = p[q]; i = q; }
    k[i] = key; p[i] = pri;
  }
  pop() {
    const k = this.k, p = this.p, top = k[0], lk = k.pop()!, lp = p.pop()!;
    if (k.length) {
      let i = 0; const n = k.length;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i, mp = lp;
        if (l < n && p[l] < mp) { m = l; mp = p[l]; }
        if (r < n && p[r] < mp) { m = r; mp = p[r]; }
        if (m === i) break;
        k[i] = k[m]; p[i] = p[m]; i = m;
      }
      k[i] = lk; p[i] = lp;
    }
    return top;
  }
}
