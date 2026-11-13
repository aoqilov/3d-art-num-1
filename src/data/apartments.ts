import { BLOCKS, TOTAL_APARTMENTS, PRICE_PER_M2, TYPE4 } from './blocks';
import { planFor } from '../block/plan';
import { aptInfo } from '../block/aptData';

export type Status = 'free' | 'reserved' | 'sold';
export type Apartment = {
  id: string; block: number; floor: number; num: number;
  rooms: 1 | 2 | 3; area: number; price: number; status: Status;
};

// Real apartment types from the catalog (area m², rooms).
const TYPES: [number, 1 | 2 | 3][] = [
  [40.0, 1], [40.73, 1], [40.84, 1],
  [40.08, 2], [42.79, 2], [45.2, 2], [45.49, 2], [51.28, 2], [53.88, 2], [55.36, 2],
  [57.62, 2], [57.72, 2], [57.76, 2], [58.68, 2],
  [62.42, 3], [63.4, 3], [63.47, 3], [64.36, 3], [66.34, 3], [70.8, 3], [86.0, 3],
];

// Small deterministic PRNG so the demo data is the same on every load.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export const RESIDENTIAL_FROM = 2; // 1-qavat savdo, turar joy 2-16

function build(): Apartment[] {
  const rand = rng(20241024);
  const out: Apartment[] = [];
  // type-4 blocks: the real flat mix from the drawings (7 flats on storey 2 and on each of storeys 3–16)
  for (const id of TYPE4) {
    for (let f = 2; f <= 16; f++) {
      planFor(f).apts.forEach((a, i) => {
        const inf = aptInfo(id, f, i, a.label);
        out.push({ id: `${id}-${f}-${i}`, block: id, floor: f, num: inf.num, rooms: inf.rooms, area: inf.area, price: inf.price, status: inf.status });
      });
    }
  }
  const others = BLOCKS.filter((b) => !TYPE4.includes(b.id));
  const left = TOTAL_APARTMENTS - out.length;
  const areaSum = others.reduce((s, b) => s + b.w * b.d, 0);
  const perBlock = others.map((b) => Math.round((left * b.w * b.d) / areaSum));
  perBlock[perBlock.length - 1] += left - perBlock.reduce((a, b) => a + b, 0);
  others.forEach((b, bi) => {
    const floors = 16 - RESIDENTIAL_FROM + 1; // 15
    const n = perBlock[bi];
    const base = Math.floor(n / floors);
    let extra = n - base * floors;
    for (let f = RESIDENTIAL_FROM; f <= 16; f++) {
      const count = base + (extra-- > 0 ? 1 : 0);
      for (let k = 1; k <= count; k++) {
        const [area, rooms] = TYPES[Math.floor(rand() * TYPES.length)];
        const r = rand();
        const status: Status = r < 0.55 ? 'free' : r < 0.65 ? 'reserved' : 'sold';
        out.push({
          id: `${b.id}-${f}-${k}`, block: b.id, floor: f, num: 0,
          rooms, area, price: Math.round(area * PRICE_PER_M2), status,
        });
      }
    }
    // running apartment number inside the block
    out.filter((a) => a.block === b.id).forEach((a, i) => (a.num = i + 1));
  });
  return out;
}

export const APARTMENTS: Apartment[] = build();

export function blockStats(block: number) {
  const list = APARTMENTS.filter((a) => a.block === block);
  const c = { free: 0, reserved: 0, sold: 0 };
  list.forEach((a) => c[a.status]++);
  const free = list.filter((a) => a.status === 'free');
  return {
    total: list.length, ...c,
    minPrice: free.length ? Math.min(...free.map((a) => a.price)) : 0,
  };
}
