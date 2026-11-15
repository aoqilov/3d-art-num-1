// The facts on each block's card in the live construction view (three/blockCards.ts) — DEMO, until the owner gives
// the real ones: construction start and handover follow the demo schedule (progress.ts); sales opened two months
// after the start (piles in); the cadastre registration is done for the first two phases, under way for the third.
// To make it real: replace SALE / CADASTRE (and START in progress.ts).
import { progressAt, startMonth } from './progress';

export type BlockInfo = {
  /** month indices from the timeline's start (progress.ts T0) — monthLabel() writes them */
  start: number; sale: number; finish: number;
  /** registered in the cadastre */
  cadastre: boolean;
};

const SALE: Partial<Record<number, number>> = {};                     // real sale months, when known
const CADASTRE: Partial<Record<number, boolean>> = {};               // real registrations, when known

export function blockInfo(id: number): BlockInfo {
  const start = startMonth(id);
  return {
    start,
    sale: SALE[id] ?? start + 2,
    finish: progressAt(id, 0).finish,
    cadastre: CADASTRE[id] ?? start <= 11,
  };
}
