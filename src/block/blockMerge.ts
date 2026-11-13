// Merges all 16 storeys + facade decor of the type-4 block into one geometry with one group per material.
// Used for the whole-building view (few draw calls) and, exterior-only, for instancing in the complex scene.
import * as THREE from 'three';
import { buildStorey } from './floorGeom';
import { buildFacade, mintStorey } from './facade';
import { materials, type MatName } from './materials';
import { FLOOR_H, FLOORS, planFor } from './plan';

// Exterior-only LOD drops what can't be seen from outside, but keeps every slab (floor_base + ceiling)
// and the balcony/loggia decking so balconies have floors and the shell is closed storey by storey.
const INTERIOR = new Set<MatName>(['paint', 'paint_public', 'tile_wall', 'floor_wood', 'floor_tile',
  'floor_stone', 'floor_shop', 'stair', 'door_wood', 'door_entry', 'cap']);

type Buckets = Map<MatName, { pos: number[]; nor: number[]; uv: number[] }>;

function append(b: Buckets, m: MatName, g: THREE.BufferGeometry, start: number, count: number, dy: number) {
  let k = b.get(m);
  if (!k) b.set(m, (k = { pos: [], nor: [], uv: [] }));
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), U = g.getAttribute('uv');
  for (let i = start; i < start + count; i++) {
    k.pos.push(P.getX(i), P.getY(i) + dy, P.getZ(i));
    k.nor.push(N.getX(i), N.getY(i), N.getZ(i));
    k.uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
  }
}

let cache: { all?: ReturnType<typeof build>; ext?: ReturnType<typeof build> } = {};

function build(exteriorOnly: boolean) {
  const b: Buckets = new Map();
  const src = { 1: buildStorey(planFor(1), 1), 2: buildStorey(planFor(2), 2), 3: buildStorey(planFor(3), 3) };
  for (let s = 1; s <= FLOORS; s++) {
    const { geometry, mats } = src[s === 1 ? 1 : s === 2 ? 2 : 3];
    for (const gr of geometry.groups) {
      let m = mats[gr.materialIndex!];
      if (m === 'facade') m = mintStorey(s) ? 'facade_mint' : 'facade_white';
      if (exteriorOnly && INTERIOR.has(m)) continue;
      append(b, m, geometry, gr.start, gr.count, (s - 1) * FLOOR_H);
    }
  }
  const fac = buildFacade();
  for (const gr of fac.main.geometry.groups) {
    let m = fac.main.mats[gr.materialIndex!];
    if (m === 'facade') m = 'facade_white';
    if (exteriorOnly && INTERIOR.has(m)) continue;
    append(b, m, fac.main.geometry, gr.start, gr.count, 0);
  }
  for (const e of fac.extra) {
    const g = e.geometry.index ? e.geometry.toNonIndexed() : e.geometry;
    append(b, e.mat, g, 0, g.getAttribute('position').count, 0);
  }
  const geometry = new THREE.BufferGeometry();
  const names: MatName[] = [];
  // opaque first, glass last (transparency sorting inside one mesh)
  const order = [...b.keys()].filter((m) => b.get(m)!.pos.length).sort((a, c) => (a === 'glass' ? 1 : 0) - (c === 'glass' ? 1 : 0));
  const total = order.reduce((t, m) => t + b.get(m)!.pos.length / 3, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let start = 0;
  for (const m of order) {
    const k = b.get(m)!;
    const n = k.pos.length / 3;
    pos.set(k.pos, start * 3); nor.set(k.nor, start * 3); uv.set(k.uv, start * 2);
    geometry.addGroup(start, n, names.length);
    names.push(m);
    start += n;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.computeBoundingSphere();
  const lib = materials();
  return { geometry, names, materials: names.map((n) => lib[n]) };
}

export function mergedBlock(exteriorOnly: boolean) {
  const key = exteriorOnly ? 'ext' : 'all';
  if (!cache[key]) cache[key] = build(exteriorOnly);
  return cache[key]!;
}
export function resetMergedCache() { cache = {}; }
