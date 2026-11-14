// The courtyard as both views lay it out (complex view, a block's own page): where the type-4 block models stand,
// more trees on the lawns, no tall trees in front of the street facades (a clipped hedge instead, also between the
// shop doors). Pure data work on the loaded courtyard.json / yard.json; returns the trees to leave out.
import * as THREE from 'three';
import { BLOCKS, T4_LOOK, blockTheta, t4Fit, type BlockDef } from '../data/blocks';
import { BLOCK_D, BLOCK_W } from '../block/plan';
import { PointGrid, inPoly, scatter } from './densify';
import type { CourtData } from './context';
import type { YardData } from './yard';

/** block-local (0…BLOCK_W, 0…BLOCK_D, street facade at 0) → complex frame, for the type-4 model of this block */
export function t4Matrix(def: BlockDef) {
  const [sx, sz] = t4Fit(def, BLOCK_W, BLOCK_D);      // blocks of other designs: the model fitted to the footprint
  return new THREE.Matrix4().makeTranslation(def.x, 0, def.z)
    .multiply(new THREE.Matrix4().makeRotationY(blockTheta(def)))
    .multiply(new THREE.Matrix4().makeScale(sx, 1, sz))
    .multiply(new THREE.Matrix4().makeTranslation(-BLOCK_W / 2, 0, -BLOCK_D / 2));
}
export const t4Blocks = () => BLOCKS.filter((b) => T4_LOOK(b.id));

/**
 * Lays the courtyard out in place (court.trees, court.young, yd.hedge change) and returns the trees to leave out.
 * blockMats: the type-4 blocks' block-local → complex matrices. keepOut: no tree where it returns true.
 */
export function layoutCourtyard(court: CourtData, yd: YardData | null, blockMats: THREE.Matrix4[], keepOut?: (x: number, z: number) => boolean) {
  const inv = blockMats.map((m) => m.clone().invert()), v = new THREE.Vector3();
  plant(court, yd, inv);
  // in front of the blocks (both sides of the portal) no tall trees: only a neat clipped hedge, 0.5 m high
  const cut = [...(yd?.cut ?? [])];
  const inFront = (x: number, z: number) => inv.some((m) => { v.set(x, 0, z).applyMatrix4(m); return v.x > -3 && v.x < BLOCK_W + 3 && v.z > -16 && v.z < 1; });
  const out = (x: number, z: number) => inFront(x, z) || !!keepOut?.(x, z);
  for (const [x, z] of court.trees) if (out(x, z)) cut.push([x, z]);
  court.young = court.young.filter(([x, z]) => !out(x, z));
  if (yd) {
    yd.hedge = yd.hedge.filter(([x, z]) => !inFront(x, z));
    const rows: [number, number][] = [[0.4, 2.3], [4.7, 7.8], [10.1, 11.4], [18.3, 19.5], [21.9, 25.0], [27.4, 29.3]];   // between the shop doors
    for (const m of blockMats) for (const [a, b] of rows) {
      const n = Math.max(2, Math.round((b - a) / 0.42));
      for (let i = 0; i <= n; i++) { v.set(a + ((b - a) * i) / n, 0, -2.6).applyMatrix4(m); yd.hedge.push([v.x, v.z, 0.27]); }
    }
  }
  return cut;
}

/** More trees on the courtyard lawns: 4.5 m apart, clear of the existing trees, hedges, paths, playgrounds,
 *  sports court, parking, gazebos, 2.5 m off the facades (6 m in front of the street facade). */
function plant(court: CourtData, yd: YardData | null, inv: THREE.Matrix4[]) {
  let sd = 21; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const taken = new PointGrid(6), low = new PointGrid(3);
  for (const [x, z] of [...court.trees, ...court.young]) taken.add(x, z);
  for (const [x, z] of yd?.hedge ?? []) low.add(x, z);
  const zones: number[][] = [];                                   // x, z, radius
  const box = (a?: number[] | null) => { if (a) zones.push([a[0], a[1], Math.hypot(a[3] ?? 10, a[4] ?? 10) / 2 + 2.5]); };
  box(yd?.court); yd?.play.forEach(box);
  yd?.parking.forEach((p) => zones.push([p[0], p[1], (p[3] ?? 8) * 1.4 + 4]));
  yd?.gazebo?.forEach((g) => zones.push([g[0], g[1], 5]));
  const paths = yd?.paths ?? [];
  const v = new THREE.Vector3();
  const ok = (x: number, z: number) =>
    !low.near(x, z, 1.2) && !zones.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r) && !paths.some((p) => inPoly(x, z, p)) &&
    !inv.some((m) => { v.set(x, 0, z).applyMatrix4(m); return v.x > -2.5 && v.x < BLOCK_W + 2.5 && v.z > -6 && v.z < BLOCK_D + 2.5; });
  for (const [x, z] of scatter(court.lawn, 4.5, taken, rnd, 420, ok)) court.trees.push([x, z, 1.4 + rnd() * 1.6]);
}
