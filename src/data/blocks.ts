// Block footprints traced from the master plan (page 11 of the catalog), converted to metres.
// Scale: 1 px = 0.34 m (calibrated against the 3.22 ga site area). Coordinates are relative to the plan centre.
// x: east(+), z: south(+), rot: rotation around the Y axis in radians. Demo accuracy only.
export type BlockDef = { id: number; x: number; z: number; w: number; d: number; rot: number };

export const BLOCKS: BlockDef[] = [
  { id: 1, x: -88.83, z: -40.89, w: 17.4, d: 29.4, rot: -1.249 },
  { id: 2, x: -51.12, z: -43.04, w: 29.4, d: 17.6, rot: -0.2235 },
  { id: 3, x: -21.73, z: -18.85, w: 23.3, d: 17.4, rot: -1.0863 },
  { id: 4, x: -8.74, z: 4.6, w: 26.4, d: 17.4, rot: -0.9995 },
  { id: 5, x: -22.17, z: 24.17, w: 17.0, d: 22.7, rot: -1.1071 },
  { id: 6, x: -38.25, z: 61.54, w: 17.3, d: 22.4, rot: -0.0 },
  { id: 7, x: -38.59, z: 86.36, w: 17.3, d: 22.4, rot: -0.0 },
  { id: 8, x: -30.26, z: 107.61, w: 24.5, d: 17.3, rot: -0.0 },
  { id: 9, x: -4.59, z: 107.27, w: 22.8, d: 17.3, rot: -0.0 },
  { id: 10, x: 20.06, z: 107.44, w: 22.4, d: 17.0, rot: -0.0 },
  { id: 11, x: 53.21, z: 109.14, w: 24.1, d: 15.6, rot: -0.0 },
  { id: 12, x: 61.88, z: 83.98, w: 17.0, d: 29.2, rot: -0.0 },
  { id: 13, x: 62.39, z: 52.36, w: 16.7, d: 29.2, rot: -0.0 },
  { id: 14, x: 54.4, z: 27.03, w: 23.8, d: 16.7, rot: -0.0 },
  { id: 15, x: 17.99, z: 42.63, w: 17.3, d: 29.4, rot: -1.068 },
  { id: 16, x: 28.98, z: -24.79, w: 17.5, d: 29.4, rot: -1.0769 },
  { id: 17, x: 53.68, z: -38.26, w: 17.4, d: 22.6, rot: -1.068 },
  { id: 18, x: 2.4, z: -62.07, w: 29.5, d: 17.4, rot: -1.0883 },
  { id: 19, x: 0.69, z: -88.9, w: 17.1, d: 27.2, rot: -1.1744 },
  { id: 20, x: 24.36, z: -101.09, w: 17.2, d: 22.5, rot: -1.0863 },
];

export const FLOORS = 16;
/** Blocks built on the type-4 design (site plan p.3 of the Block-1 PDF). */
export const TYPE4 = [1, 2, 12, 13, 15, 16, 18];
export const GROUND_H = 4.2; // 1-qavat (savdo)
export const FLOOR_H = 3.0;
export const TOTAL_APARTMENTS = 1735;
export const PRICE_PER_M2 = 1000; // demo, USD
export const PLAN_SIZE = { w: 251.6, d: 278.8 }; // metres covered by public/plan.jpg

/** Rotation that puts the real block model (long axis 29.7 m along X, street facade toward −Z) on its footprint,
 *  street facade facing away from the complex centre. Shared by the complex and the block scenes. */
export function blockTheta(def: BlockDef) {
  let th = def.rot + (def.w >= def.d ? 0 : Math.PI / 2);
  const nx = -Math.sin(th), nz = -Math.cos(th);
  if (nx * def.x + nz * def.z < 0) th += Math.PI;
  return th;
}
