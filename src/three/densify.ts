// More trees (the owner asked for a greener district): fill the gaps of the street rows, and plant lawns and
// parks at an even spacing, clear of the trees already there and of whatever else stands on the ground.
type Tri = { v: number[]; i: number[] };

/** points in square cells, for "anything within r?" and nearest-neighbour questions */
export class PointGrid {
  private cells = new Map<string, number[][]>();
  constructor(private cell = 8) {}
  private key(cx: number, cz: number) { return cx + ',' + cz; }
  add(x: number, z: number, tag = 0) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let c = this.cells.get(k); if (!c) this.cells.set(k, (c = []));
    c.push([x, z, tag]);
  }
  private each(x: number, z: number, r: number, fn: (p: number[]) => void) {
    const n = Math.ceil(r / this.cell), cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) this.cells.get(this.key(cx + i, cz + j))?.forEach(fn);
  }
  near(x: number, z: number, r: number) {
    let hit = false;
    this.each(x, z, r, (p) => { if (!hit && (p[0] - x) ** 2 + (p[1] - z) ** 2 < r * r) hit = true; });
    return hit;
  }
  /** nearest point at a distance in (min, max] */
  nearest(x: number, z: number, min: number, max: number) {
    let best: number[] | null = null, bd = max * max;
    this.each(x, z, max, (p) => { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d > min * min && d <= bd) { bd = d; best = p; } });
    return best as number[] | null;
  }
}

/** Gaps of a row of trees: between each tree and its nearest neighbour 9…26 m away, one or two new trees. */
export function fillRows(trees: number[][], taken: PointGrid, min = 9, max = 26) {
  const row = new PointGrid(max);
  trees.forEach(([x, z, k]) => row.add(x, z, k ?? 0));
  const out: number[][] = [];
  for (const [x, z, k] of trees) {
    const q = row.nearest(x, z, 0.5, max);
    if (!q) continue;
    const d = Math.hypot(q[0] - x, q[1] - z);
    if (d < min) continue;
    const n = Math.max(1, Math.round(d / 8.5) - 1);
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1), px = x + (q[0] - x) * t, pz = z + (q[1] - z) * t;
      if (taken.near(px, pz, 4)) continue;
      taken.add(px, pz); out.push([px, pz, k ?? 0]);
    }
  }
  return out;
}

/** Trees spread over a ground area (triangles) at least `spacing` apart; `ok` rejects other obstacles. */
export function scatter(t: Tri, spacing: number, taken: PointGrid, rnd: () => number, max: number, ok: (x: number, z: number) => boolean = () => true) {
  const v = t.v, idx = t.i, areas: number[] = [];
  let total = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 2, b = idx[i + 1] * 2, c = idx[i + 2] * 2;
    total += Math.abs((v[b] - v[a]) * (v[c + 1] - v[a + 1]) - (v[c] - v[a]) * (v[b + 1] - v[a + 1])) / 2;
    areas.push(total);
  }
  const out: number[][] = [];
  if (!total) return out;
  for (let tries = 0; tries < max * 14 && out.length < max; tries++) {
    const r = rnd() * total;
    let lo = 0, hi = areas.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (areas[m] < r) lo = m + 1; else hi = m; }
    const a = idx[lo * 3] * 2, b = idx[lo * 3 + 1] * 2, c = idx[lo * 3 + 2] * 2;
    let u = rnd(), w = rnd(); if (u + w > 1) { u = 1 - u; w = 1 - w; }
    const x = v[a] + (v[b] - v[a]) * u + (v[c] - v[a]) * w, z = v[a + 1] + (v[b + 1] - v[a + 1]) * u + (v[c + 1] - v[a + 1]) * w;
    if (taken.near(x, z, spacing) || !ok(x, z)) continue;
    taken.add(x, z); out.push([x, z]);
  }
  return out;
}

/** point in a polygon given as a flat x, z list */
export function inPoly(x: number, z: number, p: number[]) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if ((p[i + 1] > z) !== (p[j + 1] > z) && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) inside = !inside;
  }
  return inside;
}

/** Occupied ground on a square grid (roads, sidewalks, houses …): where a tree may not stand. */
export class Mask {
  private n: number;
  private data: Uint8Array;
  constructor(private x0: number, private z0: number, size: number, private cell = 2) {
    this.n = Math.ceil(size / cell);
    this.data = new Uint8Array(this.n * this.n);
  }
  private mark(fn: (x: number, z: number) => boolean, xa: number, xb: number, za: number, zb: number) {
    const { n, cell, x0, z0 } = this;
    const i0 = Math.max(0, Math.floor((xa - x0) / cell)), i1 = Math.min(n - 1, Math.floor((xb - x0) / cell));
    const j0 = Math.max(0, Math.floor((za - z0) / cell)), j1 = Math.min(n - 1, Math.floor((zb - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (fn(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell)) this.data[j * n + i] = 1;
  }
  tris(t: Tri) {
    const v = t.v;
    for (let k = 0; k < t.i.length; k += 3) {
      const a = t.i[k] * 2, b = t.i[k + 1] * 2, c = t.i[k + 2] * 2;
      const ax = v[a], az = v[a + 1], bx = v[b], bz = v[b + 1], cx = v[c], cz = v[c + 1];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (!d) continue;
      this.mark((x, z) => {
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        return l1 >= 0 && l2 >= 0 && l1 + l2 <= 1;
      }, Math.min(ax, bx, cx), Math.max(ax, bx, cx), Math.min(az, bz, cz), Math.max(az, bz, cz));
    }
  }
  poly(p: number[]) {
    let xa = Infinity, xb = -Infinity, za = Infinity, zb = -Infinity;
    for (let k = 0; k < p.length; k += 2) { xa = Math.min(xa, p[k]); xb = Math.max(xb, p[k]); za = Math.min(za, p[k + 1]); zb = Math.max(zb, p[k + 1]); }
    this.mark((x, z) => inPoly(x, z, p), xa, xb, za, zb);
  }
  /** grow the occupied area by k cells (keep trees off kerbs and walls) */
  grow(k: number) {
    const { n } = this, src = this.data.slice();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (src[j * n + i]) continue;
      for (let dj = -k; dj <= k && !this.data[j * n + i]; dj++) for (let di = -k; di <= k; di++) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < n && jj < n && src[jj * n + ii]) { this.data[j * n + i] = 1; break; }
      }
    }
  }
  free(x: number, z: number) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    return i >= 0 && j >= 0 && i < this.n && j < this.n && !this.data[j * this.n + i];
  }
}

/** Trees on the free ground of a disc around (cx, cz), at least `spacing` apart. */
export function scatterFree(mask: Mask, cx: number, cz: number, R: number, spacing: number, taken: PointGrid, rnd: () => number, max: number) {
  const out: number[][] = [];
  for (let tries = 0; tries < max * 10 && out.length < max; tries++) {
    const a = rnd() * Math.PI * 2, r = R * Math.sqrt(rnd());
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!mask.free(x, z) || taken.near(x, z, spacing)) continue;
    taken.add(x, z); out.push([x, z]);
  }
  return out;
}
