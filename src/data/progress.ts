// Live construction progress of the 20 blocks — DEMO schedule (no site reports are connected yet).
// The stage value uses the same 0 … 8 scale as the block's construction view (src/block/construction.ts),
// so "today" in the complex and the stage slider inside a block agree.
// To make it real: replace START (or put measured stages into REPORTED) from the site's weekly report.
import { BLOCKS, FLOORS } from './blocks';

/** last site report (demo) */
export const REPORT_DATE = '2026-11-01';
/** first month shown on the timeline, number of months */
export const T0 = { y: 2025, m: 3 };          // 2025-03
export const T_MONTHS = 40;                    // … 2028-07

/** start month (index from T0) of each block — three phases */
const START: Record<number, number> = {
  1: 2, 2: 2, 18: 3, 19: 4, 20: 4, 16: 5, 17: 6,          // phase 1: from 2025-05
  3: 7, 4: 7, 5: 8, 15: 9, 14: 10, 13: 10, 12: 11,       // phase 2: from 2025-10
  6: 14, 7: 15, 8: 16, 9: 17, 10: 18, 11: 19,           // phase 3: from 2026-05
};
/** the month (index from T0) a block's construction started */
export const startMonth = (id: number) => START[id] ?? 0;
/** measured stage values override the schedule (e.g. a block that is behind) */
export const REPORTED: Partial<Record<number, number>> = { 13: 4.1 };

// months since start → stage (piles 2 mo, raft 1, frame 6, walls/roof/facade/windows, finishing)
const CURVE: [number, number][] = [[0, 0], [2, 1], [3, 2], [9, 5], [12, 6], [15, 7], [18, 7.5], [20, 8]];
function curve(m: number) {
  if (m <= 0) return 0;
  for (let i = 1; i < CURVE.length; i++) {
    const [m0, p0] = CURVE[i - 1], [m1, p1] = CURVE[i];
    if (m <= m1) return p0 + ((m - m0) / (m1 - m0)) * (p1 - p0);
  }
  return 8;
}

export const monthIndex = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return (y - T0.y) * 12 + (m - T0.m) + ((d ?? 1) - 1) / 30; };
export const TODAY_M = monthIndex(REPORT_DATE);
export function monthLabel(mi: number, lang: 'uz' | 'ru' = 'uz') {
  const k = Math.floor(mi), y = T0.y + Math.floor((T0.m - 1 + k) / 12), m = ((T0.m - 1 + k) % 12 + 12) % 12;
  const N = lang === 'ru' ? ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'] : ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
  return `${N[m]} ${y}`;
}

export type Progress = {
  stage: number;            // 0 … 8
  pct: number;              // 0 … 100
  frame: number;            // storeys with frame and slab (0 … 16, fractional)
  walls: number;            // storeys with walls
  facade: number;           // storeys with facade (from the top down)
  windows: number;          // storeys with windows
  roof: boolean;
  done: boolean;
  phase: number;            // index into PHASES
  finish: number;           // month index of the planned handover
};

export const PHASES: { name: [string, string]; color: string }[] = [
  { name: ['Boshlanmagan', 'Не начат'], color: '#9aa3a0' },
  { name: ['Qoziqlar', 'Сваи'], color: '#8a6a4a' },
  { name: ['Poydevor', 'Фундамент'], color: '#7d7a73' },
  { name: ['Karkas', 'Каркас'], color: '#a8a6a0' },
  { name: ['Devorlar', 'Стены'], color: '#d8c9a6' },
  { name: ['Fasad, tom', 'Фасад, кровля'], color: '#e6b85c' },
  { name: ['Derazalar, ichki ishlar', 'Окна, отделка'], color: '#6fa8d6' },
  { name: ['Topshirildi', 'Сдан'], color: '#4fbf7f' },
];

export function stageToProgress(p: number): Omit<Progress, 'phase' | 'finish'> & { phase: number } {
  const c = (v: number) => Math.max(0, Math.min(1, v));
  const frame = c((p - 2) / 3) * FLOORS, walls = c((p - 3.2) / 2.8) * FLOORS;
  const facade = c(p - 5.5) * FLOORS, windows = c(p - 6.5) * FLOORS;
  const phase = p <= 0.001 ? 0 : p < 1 ? 1 : p < 2 ? 2 : p < 3.2 ? 3 : p < 5.5 ? (walls > 0 ? 4 : 3) : p < 6.5 ? 5 : p < 8 ? 6 : 7;
  return { stage: p, pct: Math.round((p / 8) * 100), frame, walls, facade, windows, roof: p >= 5.5, done: p >= 8, phase };
}

/** progress of a block at month index mi (timeline); "today" uses the reported value when there is one */
export function progressAt(id: number, mi: number): Progress {
  const s = START[id] ?? 0;
  let p = curve(mi - s);
  const rep = REPORTED[id];
  if (rep !== undefined) {
    // a reported block follows its measured stage today and the same pace from there on
    const sched = curve(TODAY_M - s), lag = sched - rep;
    p = Math.max(0, curve(mi - s) - lag * Math.min(1, Math.max(0, (mi - s) / Math.max(1, TODAY_M - s))));
  }
  const lagM = rep !== undefined ? 2 : 0;
  return { ...stageToProgress(p), finish: s + 20 + lagM };
}

export function complexProgress(mi: number) {
  const ps = BLOCKS.map((b) => progressAt(b.id, mi));
  return { pct: Math.round(ps.reduce((a, p) => a + p.pct, 0) / ps.length), done: ps.filter((p) => p.done).length, ps };
}
