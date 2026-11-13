// Energy efficiency of the type-4 block — a simple steady-state heat balance per flat from the real plans:
// outer wall and window areas of each flat (from the drawing), U-values of the mock build-up (construction.ts),
// ventilation, Tashkent degree-days, solar gains through the windows in summer, today's household tariffs.
// An ESTIMATE for comparing flats and insulation options, not an energy passport.
import { FLOORS, FLOOR_H, SLAB, planFor, pointInPoly, type Pt } from './plan';
import { aptInfo } from './aptData';

type L2 = [string, string];
export type Season = 'winter' | 'summer';

/** U-values, W/m²·K: with the insulated build-up (as designed) and without insulation (for comparison) */
export const U = {
  insul: { wall: 0.31, window: 1.1, roof: 0.22 },
  bare: { wall: 0.95, window: 2.7, roof: 0.9 },
};
export const CLIMATE = {
  tIn: 20, tWinter: -2, tDesign: -12, hdd: 2230,       // °C·day, heating season ≈ 130 days (Nov–Mar)
  tSummer: 36, tCool: 25, cdd: 420,                   // °C·day above 25 °C
  solar: 230,                                          // kWh/m² of window in the cooling season (mean of facades)
};
export const TARIFF = {
  gas: 1100, gasKwh: 9.3, boiler: 0.92,               // so‘m/m³ (household, up to 500 m³/month in winter); kWh per m³; boiler efficiency
  elec: [[200, 650], [500, 900], [1000, 1100], [5000, 1600]] as [number, number][],   // so‘m/kWh by monthly band
  baseElec: 160,                                       // kWh/month the flat uses anyway (lights, fridge …)
  cop: 3,                                              // air conditioner
};
export const TARIFF_DATE = '2026-06-01';
const HEAT_MONTHS = [0.18, 0.26, 0.27, 0.19, 0.10];   // Nov, Dec, Jan, Feb, Mar
const COOL_MONTHS = [0.08, 0.26, 0.34, 0.25, 0.07];   // May … Sep

export const CLASSES: { c: string; max: number; color: string }[] = [
  { c: 'A', max: 40, color: '#1a9850' }, { c: 'B', max: 60, color: '#66bd63' }, { c: 'C', max: 80, color: '#a6d96a' },
  { c: 'D', max: 105, color: '#fee08b' }, { c: 'E', max: 135, color: '#fdae61' }, { c: 'F', max: 170, color: '#f46d43' }, { c: 'G', max: 1e9, color: '#d73027' },
];
export const classOf = (kwhM2: number) => CLASSES.find((k) => kwhM2 <= k.max)!;

export type AptEnergy = {
  storey: number; index: number; num: number; area: number;
  wallA: number; winA: number; roofA: number; facades: number;
  H: number;                     // W/K
  heat: number; cool: number;    // kWh/year (heat delivered, cooling removed)
  gas: number;                   // m³/year
  winterBill: number; peakBill: number;   // so‘m per month: average of the season and the coldest month
  summerBill: number;            // so‘m per month extra for the air conditioner, average May–Sep
  kwhM2: number; cls: string; peakW: number;
  parts: { name: L2; w: number }[];       // heat loss split at design temperature, W
};

function elecCost(kwh: number) {
  let c = 0, prev = 0;
  for (const [lim, p] of TARIFF.elec) { const k = Math.max(0, Math.min(kwh, lim) - prev); c += k * p; prev = lim; if (kwh <= lim) return c; }
  return c + (kwh - prev) * 1900;
}
function distToSeg(x: number, y: number, [ax, ay]: Pt, [bx, by]: Pt) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
const onRing = (x: number, y: number, ring: Pt[], tol: number) => ring.some((p, i) => distToSeg(x, y, p, ring[(i + 1) % ring.length]) < tol);

const cache = new Map<string, AptEnergy>();
export function aptEnergy(blockId: number, storey: number, index: number, insul = true): AptEnergy {
  const key = `${blockId}-${storey}-${index}-${insul}`;
  const hit = cache.get(key); if (hit) return hit;
  const plan = planFor(storey), a = plan.apts[index], ring = plan.footprint.outer;
  const rooms = a.rooms.map((i) => plan.rooms[i]);
  const heated = rooms.filter((r) => r.kind !== 'balcony');
  const inFlat = (x: number, y: number) => heated.some((r) => pointInPoly(x, y, r.poly));
  // outer wall length: outline edges that lie on the building's outer contour (balcony edges count as outer too)
  let L = 0, facades = new Set<string>();
  const o = a.outline.outer;
  for (let i = 0; i < o.length; i++) {
    const p = o[i], q = o[(i + 1) % o.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 0.05) continue;
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (onRing(mx, my, ring, 0.45) || rooms.some((r) => r.kind === 'balcony' && pointInPoly(mx + 0.2, my, r.poly) !== pointInPoly(mx - 0.2, my, r.poly))) {
      L += len;
      facades.add(Math.abs(q[0] - p[0]) > Math.abs(q[1] - p[1]) ? (my < 9 ? 'S' : 'N') : (mx < 15 ? 'W' : 'E'));
    }
  }
  // windows of this flat: the room behind the opening belongs to it
  let winA = 0;
  for (const w of [...plan.windows, ...plan.glass]) {
    const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2, wl = w.axis === 'x' ? w.x1 - w.x0 : w.y1 - w.y0;
    const sides: Pt[] = w.axis === 'x' ? [[cx, w.y0 - 0.3], [cx, w.y1 + 0.3]] : [[w.x0 - 0.3, cy], [w.x1 + 0.3, cy]];
    const ins = sides.filter(([x, y]) => inFlat(x, y)).length;
    if (ins === 1) winA += wl * (plan.glass.includes(w) ? 2.5 : 1.45);
  }
  const area = aptInfo(blockId, storey, index, a.label).area, num = aptInfo(blockId, storey, index, a.label).num;
  const wallA = Math.max(0, L * (FLOOR_H - SLAB) - winA);
  const roofA = storey === FLOORS ? area : 0;
  const u = insul ? U.insul : U.bare;
  const Hw = wallA * u.wall, Hwin = winA * u.window, Hr = roofA * u.roof;
  const Hb = 0.15 * (Hw + Hwin + Hr) + (insul ? 0 : 0.12 * L);        // thermal bridges (slab edges): worse without insulation
  const Hv = 0.34 * 0.9 * area * 2.7;                                  // ventilation + infiltration ≈ 0.9 air changes per hour (opened windows, kitchen hood)
  const H = Hw + Hwin + Hr + Hb + Hv;
  const gains = area * 10;                                             // people, appliances, winter sun, kWh/year
  const heat = Math.max(0, (H * CLIMATE.hdd * 24) / 1000 - gains);
  const g = insul ? 0.45 : 0.65;
  const cool = (H * CLIMATE.cdd * 24) / 1000 + winA * CLIMATE.solar * g + area * 8;
  const gas = heat / (TARIFF.gasKwh * TARIFF.boiler);
  const winterBill = (gas * TARIFF.gas) / HEAT_MONTHS.length, peakBill = gas * Math.max(...HEAT_MONTHS) * TARIFF.gas;
  const ac = cool / TARIFF.cop;
  const summerBill = COOL_MONTHS.reduce((s, k) => s + elecCost(TARIFF.baseElec + ac * k) - elecCost(TARIFF.baseElec), 0) / COOL_MONTHS.length;
  const dT = CLIMATE.tIn - CLIMATE.tDesign;
  const r: AptEnergy = {
    storey, index, num, area, wallA, winA, roofA, facades: facades.size, H, heat, cool, gas, winterBill, peakBill, summerBill,
    kwhM2: heat / area, cls: classOf(heat / area).c, peakW: H * dT,
    parts: [
      { name: ['Devorlar', 'Стены'], w: Hw * dT }, { name: ['Derazalar', 'Окна'], w: Hwin * dT },
      { name: ['Tom', 'Кровля'], w: Hr * dT }, { name: ['Issiqlik ko‘prigi (plita cheti)', 'Мостики холода (торцы плит)'], w: Hb * dT },
      { name: ['Shamollatish', 'Вентиляция'], w: Hv * dT },
    ].filter((p) => p.w > 1) as { name: L2; w: number }[],
  };
  cache.set(key, r);
  return r;
}

export function allFlats(blockId: number, insul = true) {
  const out: AptEnergy[] = [];
  for (let s = 2; s <= FLOORS; s++) planFor(s).apts.forEach((_, i) => out.push(aptEnergy(blockId, s, i, insul)));
  return out;
}
export function buildingEnergy(blockId: number, insul = true) {
  const f = allFlats(blockId, insul);
  const area = f.reduce((a, x) => a + x.area, 0), heat = f.reduce((a, x) => a + x.heat, 0), cool = f.reduce((a, x) => a + x.cool, 0);
  return { area, heat, cool, kwhM2: heat / area, cls: classOf(heat / area).c, gasSum: f.reduce((a, x) => a + x.gas, 0) * TARIFF.gas, co2: (heat / TARIFF.boiler) * 0.202 / 1000 };
}

/** colour scale of the heat map: from the best insulated flat to the worst flat without insulation */
const ranges = new Map<string, [number, number]>();
export function energyRange(blockId: number, season: Season): [number, number] {
  const k = blockId + season; const r = ranges.get(k); if (r) return r;
  const v = (f: AptEnergy) => (season === 'winter' ? f.heat : f.cool) / f.area;
  const lo = Math.floor(Math.min(...allFlats(blockId, true).map(v)) / 5) * 5, hi = Math.ceil(Math.max(...allFlats(blockId, false).map(v)) / 5) * 5;
  ranges.set(k, [lo, hi]); return [lo, hi];
}
/** colour of a flat for the 3D heat map: by heating kWh/m² (winter) or cooling kWh/m² (summer) */
export function heatColor(v: number, lo: number, hi: number) {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)));
  const stops = ['#2c7bb6', '#00a6ca', '#90eb9d', '#f9d057', '#f29e2e', '#d7191c'];
  const k = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(k)), f = k - i;
  const h = (s: string) => [1, 3, 5].map((j) => parseInt(s.slice(j, j + 2), 16));
  const a = h(stops[i]), b = h(stops[i + 1]);
  return '#' + a.map((x, j) => Math.round(x + (b[j] - x) * f).toString(16).padStart(2, '0')).join('');
}

/** thermal-camera colours of the construction model's materials (heat flux at design winter temperature) */
export function thermalSkin(insul: boolean): Record<string, string> {
  const dT = CLIMATE.tIn - CLIMATE.tDesign, u = insul ? U.insul : U.bare;
  const c = (q: number) => heatColor(q, 5, 75);     // W/m²
  return {
    facade: c(u.wall * dT), aerated: c(u.wall * dT), brick: c(1.1 * dT), roof: c(u.roof * dT),
    window: c(u.window * dT * 1.3), glass: c(u.window * dT), vitrage: c(2.8 * dT), door_main: c(2.2 * dT),
    slab: c((insul ? 0.6 : 1.8) * dT), column: c((insul ? 0.5 : 1.6) * dT), core: c(0.5 * dT),
    door_entry: '#2c7bb6', door_int: c(u.wall * dT), partition: c(u.wall * dT), raft: '#1b4f8a', pile: '#1b4f8a',
  };
}
export const THERMAL_INFO: Record<string, { u: (insul: boolean) => number; name: L2 }> = {
  facade: { u: (i) => (i ? U.insul.wall : U.bare.wall), name: ['Tashqi devor', 'Наружная стена'] },
  aerated: { u: (i) => (i ? U.insul.wall : U.bare.wall), name: ['Tashqi devor', 'Наружная стена'] },
  brick: { u: () => 1.1, name: ['1-qavat g‘isht devori', 'Кирпичная стена 1 этажа'] },
  roof: { u: (i) => (i ? U.insul.roof : U.bare.roof), name: ['Tom', 'Кровля'] },
  window: { u: (i) => (i ? U.insul.window : U.bare.window), name: ['Deraza', 'Окно'] },
  glass: { u: (i) => (i ? U.insul.window : U.bare.window), name: ['Oyna paketi', 'Стеклопакет'] },
  vitrage: { u: () => 2.8, name: ['Balkon vitraji (sovuq profil)', 'Витраж балкона (холодный профиль)'] },
  slab: { u: (i) => (i ? 0.6 : 1.8), name: ['Plita cheti — issiqlik ko‘prigi', 'Торец плиты — мостик холода'] },
  column: { u: (i) => (i ? 0.5 : 1.6), name: ['Ustun — issiqlik ko‘prigi', 'Колонна — мостик холода'] },
  door_main: { u: () => 2.2, name: ['Podyezd eshigi', 'Дверь подъезда'] },
};
