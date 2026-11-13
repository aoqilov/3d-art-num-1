// Real apartment mix of the type-4 block (from the Block-1 PDF) with demo price/status.
import { PRICE_PER_M2 } from '../data/blocks';
import { planFor } from './plan';

export const ROOMS: Record<string, 1 | 2 | 3> = {
  '53.88': 2, '40.00': 1, '40.84': 1, '40.73': 1, '70.80': 3, '63.40': 3, '63.47': 3,
  '54.40': 2, '34.96': 1, '41.46': 1, '71.35': 3, '63.56': 3, '64.03': 3,
};
export type Status = 'free' | 'reserved' | 'sold';
export const usd = (n: number) => '$' + n.toLocaleString('en-US').replace(/,/g, ' ');

function hash(a: number, b: number, c: number) {
  let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function aptInfo(block: number, storey: number, index: number, label: string) {
  const area = parseFloat(label);
  const r = hash(block, storey, index);
  const status: Status = r < 0.55 ? 'free' : r < 0.66 ? 'reserved' : 'sold';
  const perFloor = planFor(3).apts.length;
  const num = storey === 2 ? index + 1 : planFor(2).apts.length + (storey - 3) * perFloor + index + 1;
  return { area, rooms: ROOMS[label] ?? 2, price: Math.round(area * PRICE_PER_M2), status, num };
}

export const ROOM_NAMES: Record<string, string> = {
  bedroom: 'Yotoqxona', kitchen: 'Oshxona', living: 'Mehmonxona', corridor: 'Koridor',
  bath: 'Sanuzel', balcony: 'Balkon', hall: 'Xoll',
};
/** Room list of an apartment straight from the extracted plan (areas between wall faces). */
export function aptRooms(storey: number, index: number) {
  const p = planFor(storey);
  return p.apts[index].rooms
    .map((ri) => p.rooms[ri])
    .filter((r) => r.kind && ROOM_NAMES[r.kind])
    .map((r) => ({ name: ROOM_NAMES[r.kind!], area: r.area, kind: r.kind! }))
    .sort((a, b) => b.area - a.area);
}
