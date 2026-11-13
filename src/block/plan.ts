// Types for the block plan extracted from the architect's PDF (metres, plan x → east, plan y → toward courtyard).
import raw from './data/plan_t4.json';

export type Pt = [number, number];
export type Poly = { outer: Pt[]; holes: Pt[][] };
export type Rect = { x0: number; y0: number; x1: number; y1: number; axis: 'x' | 'y' };
export type Opening = Rect & { kind: 'door' | 'open' | 'lift'; span: number };
export type Rail = { axis: 'h' | 'v'; off: number; lo: number; hi: number; n: number };
export type RoomKind = 'bedroom' | 'kitchen' | 'living' | 'corridor' | 'bath' | 'balcony' | 'hall' | 'shop' | 'lift' | null;
export type Room = { id: number; kind: RoomKind; apt: number | null; area: number; poly: Poly };
export type AptDef = { label: string; rooms: number[]; outline: Poly };
export type FloorPlan = {
  walls: Poly[]; windows: Rect[]; openings: Opening[]; glass: Rect[]; rails: Rail[];
  rooms: Room[]; apts: AptDef[]; footprint: Poly; rest: Poly[];
};

export const PLAN = raw as unknown as Record<'1' | '2' | '3', FloorPlan>;


export const BLOCK_W = 29.7; // street facade length, m
export const BLOCK_D = 18.1; // depth incl. courtyard kitchens, m
export const FLOOR_H = 3.0;
export const FLOORS = 16;
export const SLAB = 0.2;

/** Plan type used by a given storey (1-based). */
export const planFor = (storey: number): FloorPlan => PLAN[storey === 1 ? '1' : storey === 2 ? '2' : '3'];

export function pointInRing(x: number, y: number, r: Pt[]) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const pointInPoly = (x: number, y: number, p: Poly) =>
  pointInRing(x, y, p.outer) && !p.holes.some((h) => pointInRing(x, y, h));

export function polyBounds(p: Poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of p.outer) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

// The common lift-lobby balcony on the courtyard side has no label in the drawing; any unlabelled public
// room bounded by a railing is an open balcony (facade finish, decking, glazed doors into it).
for (const fp of Object.values(PLAN)) {
  for (const r of fp.rooms) {
    if (r.kind !== null || r.apt !== null) continue;
    const touches = fp.rails.some((rl) => {
      for (let u = rl.lo + 0.2; u < rl.hi - 0.2; u += 0.4) {
        for (const d of [-0.12, 0.12]) {
          const [x, y] = rl.axis === 'h' ? [u, rl.off + d] : [rl.off + d, u];
          if (pointInPoly(x, y, r.poly)) return true;
        }
      }
      return false;
    });
    if (touches) r.kind = 'balcony';
  }
}

// A kitchen | living glass partition was read as a window on some storeys (blue strokes in the drawing):
// a "window" with a habitable room on both sides is moved to the glass partitions, as on the typical floor.
for (const fp of Object.values(PLAN)) {
  const kindAt = (x: number, y: number) => fp.rooms.find((r) => pointInPoly(x, y, r.poly))?.kind;
  const inner = (k: RoomKind | undefined) => k !== undefined && k !== null && k !== 'balcony';
  fp.windows = fp.windows.filter((w) => {
    const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2;
    const [a, b] = w.axis === 'x' ? [kindAt(cx, w.y0 - 0.25), kindAt(cx, w.y1 + 0.25)] : [kindAt(w.x0 - 0.25, cy), kindAt(w.x1 + 0.25, cy)];
    if (inner(a) && inner(b)) { fp.glass.push(w); return false; }
    return true;
  });
}
