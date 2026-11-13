// Engineering (MEP) networks of the type-4 block — a SCHEMATIC MOCK derived from the architectural floor plans,
// not a design: there are no ВК / ОВ / ЭО / ГС drawings yet. Every label in the UI says so.
//
// What is generated, storey by storey, from plan_t4.json:
//   • shafts: the narrow service niches next to the bathrooms (null rooms < 0.7 m²) + one per flat that has none
//   • risers in each shaft: cold water, sewer, exhaust ventilation; electrical riser in the niche by the lifts
//   • per flat: wall-hung double-circuit gas boiler in the kitchen (hot water + heating), cold water from the
//     riser through the flat's meter, hot water to the kitchen and bath fixtures, radiators under the windows,
//     sewer from every fixture to the riser, gas riser in the kitchen, flat panel by the entry door → rooms
//   • building inlets: water main from the street to the meter node + booster pumps, sewer collector to a yard
//     manhole, power cable from the substation to the main switchboard (ВРУ), gas line along the facade
// Coordinates are block-local: plan (x, y) → (x, height, y); storey s floor at (s − 1) · FLOOR_H.
import * as THREE from 'three';
import { FLOORS, FLOOR_H, SLAB, planFor, pointInPoly, polyBounds, type FloorPlan, type Room } from './plan';

export type Sys = 'elec' | 'cold' | 'hot' | 'heat' | 'sewer' | 'gas' | 'vent';
type L2 = [string, string];                       // uz, ru
export const SYSTEMS: Record<Sys, { color: string; name: L2 }> = {
  elec: { color: '#facc15', name: ['Elektr', 'Электричество'] },
  cold: { color: '#3b82f6', name: ['Sovuq suv', 'Холодная вода'] },
  hot: { color: '#ef4444', name: ['Issiq suv', 'Горячая вода'] },
  heat: { color: '#fb923c', name: ['Isitish', 'Отопление'] },
  sewer: { color: '#8b6a4f', name: ['Kanalizatsiya', 'Канализация'] },
  gas: { color: '#a855f7', name: ['Gaz', 'Газ'] },
  vent: { color: '#94a3b8', name: ['Ventilyatsiya', 'Вентиляция'] },
};
export const SYS_ORDER: Sys[] = ['elec', 'cold', 'hot', 'heat', 'sewer', 'gas', 'vent'];

/** what a click shows: title + spec lines, in both languages */
export type EngInfo = { sys: Sys; title: L2; lines: L2[]; storey: number | null };
type V = THREE.Vector3;
type Path = { sys: Sys; pts: V[]; r: number; info: EngInfo; flow: boolean };
type DevKind = 'boiler' | 'meter' | 'panel' | 'radiator' | 'fixture' | 'pump' | 'board' | 'cabinet' | 'manhole' | 'substation' | 'light' | 'socket' | 'tank';
type Dev = { kind: DevKind; p: V; s: V; sys: Sys; info: EngInfo; storey: number };
export type Hotspot = { p: V; label: L2; storey: number | null };

const P = (x: number, h: number, y: number) => new THREE.Vector3(x, h, y);
const floorY = (s: number) => (s - 1) * FLOOR_H + SLAB;          // finished floor level of storey s
const centre = (r: Room) => { const b = polyBounds(r.poly); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2] as [number, number]; };
const bnd = (r: Room) => polyBounds(r.poly);

/** orthogonal route between two plan points at height h: along x first (or y first), then the other axis */
function route(a: [number, number], b: [number, number], h: number, yFirst = false): V[] {
  const m: [number, number] = yFirst ? [a[0], b[1]] : [b[0], a[1]];
  const pts = [P(a[0], h, a[1]), P(m[0], h, m[1]), P(b[0], h, b[1])];
  return pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 0.02);
}

// ---------------------------------------------------------------- plan analysis
type Shaft = { x: number; y: number };
type FlatInfo = {
  index: number; label: string; bath: Room[]; kitchen: Room | null; rooms: Room[];
  entry: [number, number] | null; shaft: Shaft; gasRiser: [number, number] | null;
};

const TYP = planFor(3);                         // storeys 3–16; storey 2 has the same wet rooms and kitchens

function shafts(plan: FloorPlan): Shaft[] {
  const raw = plan.rooms.filter((r) => r.kind === null && r.apt === null && r.area < 0.7).map((r) => { const [x, y] = centre(r); return { x, y }; });
  // niches side by side are one shaft
  const out: Shaft[] = [];
  for (const s of raw) {
    const m = out.find((o) => Math.hypot(o.x - s.x, o.y - s.y) < 1.2);
    if (m) { m.x = (m.x + s.x) / 2; m.y = (m.y + s.y) / 2; } else out.push({ ...s });
  }
  return out;
}

const corridorOf = (plan: FloorPlan) => plan.rooms.filter((r) => r.kind === null && r.apt === null && r.area > 20).sort((a, b) => b.area - a.area)[0];

function flats(plan: FloorPlan): FlatInfo[] {
  const sh = shafts(TYP);
  const corr = corridorOf(plan);
  return plan.apts.map((a, index) => {
    const rooms = a.rooms.map((i) => plan.rooms[i]);
    const bath = rooms.filter((r) => r.kind === 'bath');
    const kitchen = rooms.find((r) => r.kind === 'kitchen') ?? null;
    // entry: the door between this flat and the public corridor
    let entry: [number, number] | null = null;
    for (const o of plan.openings) {
      if (o.kind !== 'door') continue;
      const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
      const off = o.axis === 'x' ? [[0, -0.4], [0, 0.4]] : [[-0.4, 0], [0.4, 0]];
      const sides = off.map(([dx, dy]) => [cx + dx, cy + dy] as [number, number]);
      const inFlat = sides.find(([x, y]) => rooms.some((r) => pointInPoly(x, y, r.poly)));
      const inCorr = corr && sides.some(([x, y]) => pointInPoly(x, y, corr.poly));
      if (inFlat && inCorr) { entry = inFlat; break; }
    }
    // nearest shaft to the bathrooms; a flat with none within 3.5 m gets its own beside its bathroom
    const bc = bath.length ? centre(bath[0]) : kitchen ? centre(kitchen) : centre(rooms[0]);
    let shaft = sh.reduce((best, s) => (Math.hypot(s.x - bc[0], s.y - bc[1]) < Math.hypot(best.x - bc[0], best.y - bc[1]) ? s : best), sh[0]);
    if (!shaft || Math.hypot(shaft.x - bc[0], shaft.y - bc[1]) > 3.5) {
      const b = bath.length ? bnd(bath[0]) : bnd(rooms[0]);
      const cb = corr ? bnd(corr) : null;
      const y = cb && Math.abs(cb.y0 - b.y1) < Math.abs(cb.y1 - b.y0) ? b.y1 + 0.25 : b.y0 - 0.25;
      shaft = { x: b.x0 + 0.6, y };
    }
    // gas riser: kitchen corner on the outer wall (front y ≈ 0 or back y ≈ 18)
    let gasRiser: [number, number] | null = null;
    const k = rooms.find((r) => r.kind === 'kitchen');
    const kt = TYP.apts[index] ? TYP.apts[index].rooms.map((i) => TYP.rooms[i]).find((r) => r.kind === 'kitchen') : undefined;
    const kk = kt ?? k;
    if (kk) {
      const b = bnd(kk);
      const front = b.y0 < 9;
      gasRiser = [b.x0 + 0.3, front ? b.y0 + 0.25 : b.y1 - 0.25];
    }
    return { index, label: a.label, bath, kitchen, rooms, entry, shaft, gasRiser };
  });
}

// ---------------------------------------------------------------- the network
export type EngModel = { paths: Path[]; devs: Dev[]; hotspots: Hotspot[] };

const T = (uz: string, ru: string): L2 => [uz, ru];
const flatName = (s: number, f: FlatInfo): L2 => T(`${s}-qavat, ${f.label} m² xonadon`, `${s} этаж, квартира ${f.label} м²`);
const MOCK: L2 = T('Namunaviy sxema — loyiha emas', 'Схема-образец — не проект');

export function buildModel(): EngModel {
  const paths: Path[] = [], devs: Dev[] = [], hotspots: Hotspot[] = [];
  const add = (sys: Sys, pts: V[], r: number, info: EngInfo, flow = true) => { if (pts.length > 1) paths.push({ sys, pts, r, info, flow }); };
  const dev = (kind: DevKind, p: V, s: V, sys: Sys, info: EngInfo, storey: number) => devs.push({ kind, p, s, sys, info, storey });
  const top = FLOORS * FLOOR_H;
  const sh = shafts(TYP);
  const typFlats = flats(TYP);
  const usedShafts = new Map<string, Shaft>();
  for (const f of typFlats) usedShafts.set(`${f.shaft.x.toFixed(2)},${f.shaft.y.toFixed(2)}`, f.shaft);
  for (const s of sh) usedShafts.set(`${s.x.toFixed(2)},${s.y.toFixed(2)}`, s);
  const shaftList = [...usedShafts.values()];

  // ---- building inlets (ground / below ground)
  const pumpRoom: [number, number] = [25.8, 8.7];          // ground-floor room by the right-hand shafts
  const vru: [number, number] = [12.4, 8.7];               // switchboard room by the lifts
  const elecRiser: [number, number] = [13.5, 10.25];       // niche behind the lift lobby
  const UG = -1.4;                                         // mains run below the ground-floor slab
  // water
  add('cold', [P(26, UG - 0.4, -14), P(26, UG - 0.4, -1), P(26, UG, 0.4), P(pumpRoom[0], UG, pumpRoom[1]), P(pumpRoom[0], 0.6, pumpRoom[1])], 0.09,
    { sys: 'cold', storey: 1, title: T('Shahar suv tarmog‘idan kirish', 'Ввод водопровода'), lines: [T('PE100 Ø110, chuqurligi 1,8 m', 'ПЭ100 Ø110, глубина 1,8 м'), T('Ko‘cha tomondan, do‘kon ostidan', 'Со стороны улицы, под магазином'), MOCK] });
  dev('meter', P(pumpRoom[0] - 0.9, 0.9, pumpRoom[1]), P(0.9, 0.5, 0.4), 'cold', { sys: 'cold', storey: 1, title: T('Suv o‘lchash tuguni', 'Водомерный узел'), lines: [T('Umumiy hisoblagich DN50, filtr, teskari klapan', 'Общий счётчик DN50, фильтр, обратный клапан'), MOCK] }, 1);
  dev('pump', P(pumpRoom[0] + 0.6, 0.6, pumpRoom[1]), P(1.4, 1.2, 0.8), 'cold', { sys: 'cold', storey: 1, title: T('Nasos stansiyasi (bosim oshirish)', 'Насосная станция повышения давления'), lines: [T('16 qavat uchun 2 ta nasos (1 ishchi + 1 zaxira)', '2 насоса на 16 этажей (1 рабочий + 1 резервный)'), T('Q ≈ 8 m³/soat, H ≈ 60 m', 'Q ≈ 8 м³/ч, H ≈ 60 м'), MOCK] }, 1);
  hotspots.push({ p: P(26, 1.6, 0.4), label: T('Suv kirishi', 'Ввод воды'), storey: null });
  hotspots.push({ p: P(pumpRoom[0], 2.2, pumpRoom[1]), label: T('Nasos va hisoblagich', 'Насосная и водомер'), storey: 1 });
  // distribution main to every shaft
  for (const s of shaftList) {
    add('cold', [P(pumpRoom[0], 0.6, pumpRoom[1]), P(pumpRoom[0], UG + 0.3, pumpRoom[1]), ...route(pumpRoom, [s.x, s.y], UG + 0.3).slice(1), P(s.x - 0.12, UG + 0.3, s.y)], 0.05,
      { sys: 'cold', storey: 1, title: T('Sovuq suv magistrali', 'Магистраль холодной воды'), lines: [T('PPR PN20 Ø63 → Ø40, issiqlik izolyatsiyasi bilan', 'ППР PN20 Ø63 → Ø40, в теплоизоляции'), MOCK] });
  }
  // power
  add('elec', [P(-10, UG, 4), P(-0.4, UG, 4), P(vru[0], UG, 4), P(vru[0], UG, vru[1]), P(vru[0], 0.9, vru[1])], 0.06,
    { sys: 'elec', storey: 1, title: T('Elektr kirishi (kabel)', 'Ввод электроснабжения (кабель)'), lines: [T('Transformator podstansiyasidan: АВБбШв 4×120, 2 ta kabel (zaxira)', 'От ТП: АВБбШв 4×120, 2 кабеля (резерв)'), T('Yer ostida 0,7 m chuqurlikda', 'В земле на глубине 0,7 м'), MOCK] });
  dev('substation', P(-12, 1.3, 4), P(3, 2.6, 2.4), 'elec', { sys: 'elec', storey: 1, title: T('Transformator podstansiyasi (TP)', 'Трансформаторная подстанция (ТП)'), lines: [T('10/0,4 kV, 630 kVA (namuna)', '10/0,4 кВ, 630 кВА (образец)'), MOCK] }, 1);
  dev('board', P(vru[0], 1.1, vru[1] - 0.3), P(1.6, 2.0, 0.5), 'elec', { sys: 'elec', storey: 1, title: T('Bosh taqsimlash shchiti (ВРУ)', 'Вводно-распределительное устройство (ВРУ)'), lines: [T('Umumiy hisoblagich, avtomatlar, AVR', 'Общий учёт, автоматы, АВР'), T('Hisobiy quvvat ≈ 220 kW (105 xonadon)', 'Расчётная мощность ≈ 220 кВт (105 квартир)'), MOCK] }, 1);
  add('elec', [P(vru[0], 1.9, vru[1]), ...route(vru, elecRiser, 2.6).slice(0), P(elecRiser[0], 2.6, elecRiser[1])], 0.04,
    { sys: 'elec', storey: 1, title: T('ВРУ → elektr stoyagi', 'ВРУ → электростояк'), lines: [T('ВВГнг-LS 5×50', 'ВВГнг-LS 5×50'), MOCK] });
  hotspots.push({ p: P(-12, 4.2, 4), label: T('Elektr kirishi (TP)', 'Ввод электричества (ТП)'), storey: null });
  hotspots.push({ p: P(vru[0], 2.6, vru[1]), label: T('ВРУ (bosh shchit)', 'ВРУ'), storey: 1 });
  // sewer collector to the yard
  const outlet: [number, number] = [15, 23];
  for (const s of shaftList) {
    add('sewer', [P(s.x + 0.12, UG - 0.1, s.y), ...route([s.x + 0.12, s.y], [outlet[0], 18.6], UG - 0.3, true).slice(1), P(outlet[0], UG - 0.6, outlet[1])], 0.07,
      { sys: 'sewer', storey: 1, title: T('Kanalizatsiya kollektori', 'Канализационный выпуск'), lines: [T('PVC Ø160, qiyalik 2 %', 'ПВХ Ø160, уклон 2 %'), T('Hovlidagi qudug‘ga', 'В колодец во дворе'), MOCK] });
  }
  dev('manhole', P(outlet[0], -0.4, outlet[1]), P(1.2, 2.0, 1.2), 'sewer', { sys: 'sewer', storey: 1, title: T('Kanalizatsiya qudug‘i', 'Канализационный колодец'), lines: [T('Shahar tarmog‘iga ulanish', 'Подключение к городской сети'), MOCK] }, 1);
  hotspots.push({ p: P(outlet[0], 1.2, outlet[1]), label: T('Kanalizatsiya chiqishi', 'Выпуск канализации'), storey: null });
  // gas: cabinet on the west end, line along the facades at 2.4 m
  const gasIn = P(-0.6, 1.0, 2.0);
  dev('cabinet', P(-0.6, 1.0, 2.0), P(0.4, 1.2, 0.8), 'gas', { sys: 'gas', storey: 1, title: T('Gaz kirishi va hisoblagich shkafi', 'Газовый ввод и шкаф учёта'), lines: [T('Bosimni rostlash (ШРП), o‘chirish krani', 'ШРП, отключающий кран'), MOCK] }, 1);
  hotspots.push({ p: P(-1.2, 5.2, 1.0), label: T('Gaz kirishi', 'Ввод газа'), storey: null });

  // ---- risers in the shafts, up to the roof
  for (const s of shaftList) {
    add('cold', [P(s.x - 0.12, UG + 0.3, s.y), P(s.x - 0.12, top - 0.4, s.y)], 0.03,
      { sys: 'cold', storey: null, title: T('Sovuq suv stoyagi', 'Стояк холодной воды'), lines: [T('PPR PN20 Ø40, har qavatda kvartira hisoblagichi', 'ППР PN20 Ø40, на каждом этаже поквартирный счётчик'), MOCK] });
    add('sewer', [P(s.x + 0.12, top + 0.8, s.y), P(s.x + 0.12, UG - 0.1, s.y)], 0.055,
      { sys: 'sewer', storey: null, title: T('Kanalizatsiya stoyagi', 'Канализационный стояк'), lines: [T('PVC Ø110, tomga havo chiqishi bilan', 'ПВХ Ø110, с вытяжной частью над кровлей'), MOCK] });
    add('vent', [P(s.x, FLOOR_H + 0.5, s.y + 0.1), P(s.x, top + 1.2, s.y + 0.1)], 0.07,
      { sys: 'vent', storey: null, title: T('Ventilyatsiya shaxtasi', 'Вентиляционная шахта'), lines: [T('Oshxona va hammomdan tabiiy so‘rish, tomga chiqadi', 'Естественная вытяжка из кухни и санузла, выход на кровлю'), MOCK] }, false);
    hotspots.push({ p: P(s.x, top + 2.2, s.y), label: T('Shaxta', 'Шахта'), storey: null });
  }
  add('elec', [P(elecRiser[0], 2.6, elecRiser[1]), P(elecRiser[0], top - 0.5, elecRiser[1])], 0.035,
    { sys: 'elec', storey: null, title: T('Elektr stoyagi', 'Электростояк'), lines: [T('ВВГнг-LS 5×35, har qavatda qavat shchiti (ЩЭ)', 'ВВГнг-LS 5×35, на каждом этаже щит этажный (ЩЭ)'), MOCK] });

  // gas line along the front, west end and back facades, risers in the kitchens
  const fronts = typFlats.filter((f) => f.gasRiser && f.gasRiser[1] < 9).map((f) => f.gasRiser![0]);
  const backs = typFlats.filter((f) => f.gasRiser && f.gasRiser[1] >= 9).map((f) => f.gasRiser![0]);
  const GH = 2.4;
  add('gas', [gasIn, P(-0.35, GH, 2.0), P(-0.35, GH, -0.2), P(Math.max(...fronts, 1), GH, -0.2)], 0.035,
    { sys: 'gas', storey: 1, title: T('Gaz quvuri (old fasad)', 'Газопровод по фасаду (лицевой)'), lines: [T('Po‘lat Ø57, sariq rangga bo‘yalgan, 2,4 m balandlikda', 'Сталь Ø57, окрашен в жёлтый, на высоте 2,4 м'), MOCK] });
  add('gas', [P(-0.35, GH, 2.0), P(-0.35, GH, 18.3), P(Math.max(...backs, 1), GH, 18.3)], 0.035,
    { sys: 'gas', storey: 1, title: T('Gaz quvuri (orqa fasad)', 'Газопровод по фасаду (дворовый)'), lines: [T('Po‘lat Ø57', 'Сталь Ø57'), MOCK] });
  for (const f of typFlats) {
    if (!f.gasRiser) continue;
    const [gx, gy] = f.gasRiser, out = gy < 9 ? -0.2 : 18.3;
    add('gas', [P(gx, GH, out), P(gx, GH, gy), P(gx, top - 1, gy)], 0.022,
      { sys: 'gas', storey: null, title: T('Gaz stoyagi (oshxonada)', 'Газовый стояк (на кухне)'), lines: [T('Po‘lat Ø32 → Ø25, har qavatda kran va hisoblagich', 'Сталь Ø32 → Ø25, на каждом этаже кран и счётчик'), MOCK] });
  }

  // ---- storeys
  for (let s = 1; s <= FLOORS; s++) {
    const plan = planFor(s), y0 = floorY(s);
    if (s === 1) {
      // shops: a panel each, fed from the switchboard
      plan.rooms.filter((r) => r.kind === 'shop').forEach((r, i) => {
        const b = bnd(r), p: [number, number] = [b.x0 + 0.4, b.y1 - 0.3];
        add('elec', route(vru, p, 2.7), 0.02, { sys: 'elec', storey: 1, title: T(`Do‘kon ${i + 1}: elektr`, `Магазин ${i + 1}: электричество`), lines: [T('ВВГнг-LS 5×10, alohida hisoblagich', 'ВВГнг-LS 5×10, отдельный учёт'), MOCK] });
        dev('panel', P(p[0], 1.6, p[1]), P(0.4, 0.6, 0.15), 'elec', { sys: 'elec', storey: 1, title: T(`Do‘kon ${i + 1}: shchit`, `Магазин ${i + 1}: щит`), lines: [MOCK] }, 1);
      });
      continue;
    }
    // floor panel by the lifts
    const fp: [number, number] = [elecRiser[0], 9.68];
    dev('board', P(fp[0], y0 + 1.2, fp[1]), P(1.0, 1.4, 0.25), 'elec', { sys: 'elec', storey: s, title: T(`${s}-qavat elektr shchiti (ЩЭ)`, `Щит этажный (ЩЭ), ${s} этаж`), lines: [T('7 ta kvartira hisoblagichi va avtomatlari', 'Учёт и автоматы на 7 квартир'), MOCK] }, s);
    add('elec', [P(elecRiser[0], y0 + 2.5, elecRiser[1]), P(fp[0], y0 + 2.5, fp[1])], 0.025, { sys: 'elec', storey: s, title: T(`${s}-qavat: stoyakdan qavat shchitiga`, `${s} этаж: от стояка к ЩЭ`), lines: [MOCK] });

    for (const f of flats(plan)) {
      const nm = flatName(s, f);
      const info = (sys: Sys, what: L2, spec: L2): EngInfo => ({ sys, storey: s, title: T(`${what[0]} — ${nm[0]}`, `${what[1]} — ${nm[1]}`), lines: [spec, MOCK] });
      const sx = f.shaft.x, sy = f.shaft.y;
      // boiler: kitchen corner next to the gas riser, 1.5 m up
      const kb = f.kitchen ? bnd(f.kitchen) : null;
      const gr = f.gasRiser ?? (kb ? [kb.x0 + 0.3, kb.y0 + 0.25] as [number, number] : null);
      const boiler: [number, number] | null = kb && gr ? [Math.min(kb.x1 - 0.4, gr[0] + 0.6), gr[1] < 9 ? kb.y0 + 0.2 : kb.y1 - 0.2] : null;
      if (boiler) {
        dev('boiler', P(boiler[0], y0 + 1.55, boiler[1]), P(0.42, 0.72, 0.32), 'heat', info('heat', T('Ikki konturli gaz kotyoli', 'Двухконтурный газовый котёл'), T('24 kW, issiq suv + isitish, tutun mo‘risi devordan (koaksial)', '24 кВт, ГВС + отопление, коаксиальный дымоход через стену')), s);
        if (gr) add('gas', [P(gr[0], y0 + 1.2, gr[1]), P(boiler[0], y0 + 1.2, gr[1]), P(boiler[0], y0 + 1.2, boiler[1])], 0.012, info('gas', T('Gaz: stoyakdan kotyolga', 'Газ: от стояка к котлу'), T('Po‘lat Ø20, kran, gaz hisoblagichi G4', 'Сталь Ø20, кран, счётчик G4')));
      }
      // cold water: riser → flat meter → kitchen sink, boiler, bath fixtures
      const meter: [number, number] = [sx - 0.12, sy];
      dev('meter', P(meter[0], y0 + 0.5, meter[1]), P(0.18, 0.18, 0.12), 'cold', info('cold', T('Suv hisoblagichi', 'Счётчик воды'), T('DN15, kran va filtr bilan', 'DN15 с краном и фильтром')), s);
      const wet: { p: [number, number]; name: L2; hot: boolean }[] = [];
      for (const b of f.bath) {
        const bb = bnd(b), w = bb.x1 - bb.x0, d = bb.y1 - bb.y0;
        const along = w >= d;
        const near = along ? [bb.x0 + 0.35, (Math.abs(sy - bb.y0) < Math.abs(sy - bb.y1) ? bb.y0 + 0.3 : bb.y1 - 0.3)] : [(Math.abs(sx - bb.x0) < Math.abs(sx - bb.x1) ? bb.x0 + 0.3 : bb.x1 - 0.3), bb.y0 + 0.35];
        const mid: [number, number] = along ? [(bb.x0 + bb.x1) / 2, near[1]] : [near[0], (bb.y0 + bb.y1) / 2];
        const far: [number, number] = along ? [bb.x1 - 0.5, near[1]] : [near[0], bb.y1 - 0.5];
        wet.push({ p: near as [number, number], name: T('Unitaz', 'Унитаз'), hot: false });
        wet.push({ p: mid, name: T('Rakovina', 'Раковина'), hot: true });
        if (b.area > 2.5) wet.push({ p: far, name: T('Dush / vanna', 'Душ / ванна'), hot: true });
      }
      if (kb) wet.push({ p: [kb.x1 - 0.5, (kb.y0 + kb.y1) / 2], name: T('Oshxona moykasi', 'Кухонная мойка'), hot: true });
      for (const w of wet) {
        add('cold', route(meter, w.p, y0 + 0.3), 0.012, info('cold', T(`Sovuq suv → ${w.name[0].toLowerCase()}`, `Холодная вода → ${w.name[1].toLowerCase()}`), T('PPR Ø20, pol ostida', 'ППР Ø20, в стяжке пола')));
        dev('fixture', P(w.p[0], y0 + 0.4, w.p[1]), P(0.35, 0.45, 0.35), 'cold', info('cold', w.name, T('Namunaviy jihoz', 'Сантехприбор (образец)')), s);
        // sewer from each fixture back to the riser, just above the slab
        add('sewer', route(w.p, [sx + 0.12, sy], y0 + 0.08, true), 0.022, info('sewer', T(`${w.name[0]} → stoyak`, `${w.name[1]} → стояк`), T('PVC Ø50 (unitaz Ø110), qiyalik 3 %', 'ПВХ Ø50 (унитаз Ø110), уклон 3 %')));
        if (boiler && w.hot) add('hot', route(boiler, w.p, y0 + 0.36, true), 0.012, info('hot', T(`Issiq suv → ${w.name[0].toLowerCase()}`, `Горячая вода → ${w.name[1].toLowerCase()}`), T('PPR Ø20 (armirlangan), izolyatsiyada', 'ППР Ø20 армированный, в изоляции')));
      }
      if (boiler) add('cold', route(meter, boiler, y0 + 0.3), 0.012, info('cold', T('Sovuq suv → kotyol', 'Холодная вода → котёл'), T('PPR Ø20', 'ППР Ø20')));
      // heating: a radiator under each window of the living rooms, bedrooms and kitchen
      for (const r of f.rooms) {
        if (!r.kind || !['bedroom', 'living', 'kitchen'].includes(r.kind)) continue;
        const b = bnd(r);
        const win = plan.windows.find((w) => w.x1 > b.x0 - 0.4 && w.x0 < b.x1 + 0.4 && w.y1 > b.y0 - 0.4 && w.y0 < b.y1 + 0.4);
        if (!win || !boiler) continue;
        const cx = (win.x0 + win.x1) / 2, cy = (win.y0 + win.y1) / 2;
        const rp: [number, number] = win.axis === 'x' ? [cx, cy < (b.y0 + b.y1) / 2 ? b.y0 + 0.12 : b.y1 - 0.12] : [cx < (b.x0 + b.x1) / 2 ? b.x0 + 0.12 : b.x1 - 0.12, cy];
        dev('radiator', P(rp[0], y0 + 0.45, rp[1]), win.axis === 'x' ? P(1.0, 0.55, 0.1) : P(0.1, 0.55, 1.0), 'heat', info('heat', T('Radiator', 'Радиатор'), T('Alyumin, 8–10 seksiya, termostat bilan', 'Алюминиевый, 8–10 секций, с термостатом')), s);
        add('heat', route(boiler, rp, y0 + 0.14), 0.012, info('heat', T(`Isitish → ${r.kind === 'kitchen' ? 'oshxona' : r.kind === 'living' ? 'mehmonxona' : 'yotoqxona'}`, `Отопление → ${r.kind === 'kitchen' ? 'кухня' : r.kind === 'living' ? 'гостиная' : 'спальня'}`), T('PEX Ø16 (berilish + qaytish), kollektor orqali', 'PEX Ø16 (подача + обратка), лучевая разводка')));
      }
      // electricity: floor panel → flat panel by the entry → each room (ceiling light + socket)
      if (f.entry) {
        const e = f.entry;
        dev('panel', P(e[0], y0 + 1.7, e[1]), P(0.35, 0.45, 0.12), 'elec', info('elec', T('Kvartira shchiti (ЩК)', 'Щит квартирный (ЩК)'), T('10 kW, 8 guruh avtomat, UZO', '10 кВт, 8 групп, УЗО')), s);
        add('elec', [P(fp[0], y0 + 2.6, fp[1]), ...route(fp, e, y0 + 2.6).slice(1), P(e[0], y0 + 1.9, e[1])], 0.014, info('elec', T('ЩЭ → kvartira shchiti', 'ЩЭ → ЩК'), T('ВВГнг-LS 3×10, shiftda gofra quvurda', 'ВВГнг-LS 3×10, в гофре по перекрытию')));
        for (const r of f.rooms) {
          if (r.kind === 'balcony') continue;
          const c = centre(r), b = bnd(r);
          dev('light', P(c[0], y0 + FLOOR_H - SLAB - 0.1, c[1]), P(0.3, 0.06, 0.3), 'elec', info('elec', T('Shift chirog‘i', 'Потолочный светильник'), T('Guruh: 3×1,5 mm²', 'Группа: 3×1,5 мм²')), s);
          add('elec', route(e, c, y0 + FLOOR_H - SLAB - 0.15), 0.009, info('elec', T('Yoritish guruhi', 'Группа освещения'), T('ВВГнг-LS 3×1,5', 'ВВГнг-LS 3×1,5')));
          const so: [number, number] = [b.x0 + 0.15, (b.y0 + b.y1) / 2];
          dev('socket', P(so[0], y0 + 0.3, so[1]), P(0.06, 0.1, 0.1), 'elec', info('elec', T('Rozetka', 'Розетка'), T('Guruh: 3×2,5 mm², 16 A', 'Группа: 3×2,5 мм², 16 А')), s);
          add('elec', [...route(e, so, y0 + FLOOR_H - SLAB - 0.15), P(so[0], y0 + 0.35, so[1])], 0.009, info('elec', T('Rozetka guruhi', 'Розеточная группа'), T('ВВГнг-LS 3×2,5', 'ВВГнг-LS 3×2,5')));
        }
      }
      // exhaust from kitchen and bathrooms into the shaft
      for (const r of [...f.bath, ...(f.kitchen ? [f.kitchen] : [])]) {
        const c = centre(r);
        add('vent', route(c, [sx, sy + 0.1], y0 + FLOOR_H - SLAB - 0.3, true), 0.05, info('vent', T('Havo so‘rish → shaxta', 'Вытяжка → шахта'), T('Panjara va teskari klapan', 'Решётка с обратным клапаном')), false);
      }
    }
  }
  return { paths, devs, hotspots };
}

// ---------------------------------------------------------------- 3D
const storeyOf = (y: number) => (y < 0 ? 0 : Math.min(FLOORS, Math.floor(y / FLOOR_H) + 1));
type Seg = { a: V; b: V; path: number; storey: number };
const DEV_COLOR: Partial<Record<DevKind, string>> = { boiler: '#f4f4f2', radiator: '#f1f1ee', fixture: '#e9eef2', light: '#fff3c4', socket: '#f5f5f5', manhole: '#6b6b6b', substation: '#c9cdd2', board: '#d7dbe0', panel: '#e3e6ea', pump: '#2f6fb6', meter: '#2f6fb6', cabinet: '#d8b13a', tank: '#c0c6cc' };

export class Engineering {
  readonly group = new THREE.Group();
  readonly model: EngModel;
  private segs: Seg[] = [];
  private pipeMesh = new Map<Sys, { mesh: THREE.InstancedMesh; segs: number[] }>();
  private devMesh: THREE.InstancedMesh;
  private flowMesh: THREE.InstancedMesh;
  private flow: { path: number; t: number }[] = [];
  private pathLen: number[] = [];
  private highlight: THREE.Mesh | null = null;
  private show = new Set<Sys>(SYS_ORDER);
  private storey: number | null = null;
  private labels: THREE.Sprite[] = [];
  private visDev: number[] = [];

  constructor(lang: 'uz' | 'ru') {
    this.model = buildModel();
    const { paths, devs } = this.model;
    paths.forEach((p, i) => {
      let L = 0;
      for (let k = 1; k < p.pts.length; k++) {
        const a = p.pts[k - 1], b = p.pts[k];
        L += a.distanceTo(b);
        // risers: one segment per storey so a floor filter can cut them
        const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
        if (Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.z - b.z) < 1e-3 && y1 - y0 > FLOOR_H) {
          const up = b.y > a.y ? 1 : -1;
          let y = a.y;
          while ((b.y - y) * up > 1e-3) {
            const next = up > 0 ? Math.min(b.y, (Math.floor(y / FLOOR_H + 1e-6) + 1) * FLOOR_H) : Math.max(b.y, (Math.ceil(y / FLOOR_H - 1e-6) - 1) * FLOOR_H);
            const A = new THREE.Vector3(a.x, y, a.z), B = new THREE.Vector3(a.x, next, a.z);
            this.segs.push({ a: A, b: B, path: i, storey: storeyOf((A.y + B.y) / 2) });
            y = next;
          }
        } else this.segs.push({ a, b, path: i, storey: storeyOf((a.y + b.y) / 2) });
      }
      this.pathLen.push(L);
    });
    // pipes: one InstancedMesh of unit cylinders per system
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false).translate(0, 0.5, 0);
    for (const sys of SYS_ORDER) {
      const idx = this.segs.map((s, i) => (paths[s.path].sys === sys ? i : -1)).filter((i) => i >= 0);
      const mat = new THREE.MeshStandardMaterial({ color: SYSTEMS[sys].color, roughness: 0.45, metalness: 0.1, emissive: SYSTEMS[sys].color, emissiveIntensity: 0.55 });
      const mesh = new THREE.InstancedMesh(cyl, mat, Math.max(1, idx.length));
      mesh.count = 0;
      mesh.userData.sys = sys;
      this.pipeMesh.set(sys, { mesh, segs: idx });
      this.group.add(mesh);
    }
    // devices
    this.devMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), devs.length);
    this.devMesh.count = 0;
    this.group.add(this.devMesh);
    // flow dots
    this.flowMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), 6000);
    this.flowMesh.count = 0;
    this.group.add(this.flowMesh);
    // labels of the key points
    for (const h of this.model.hotspots) {
      const sp = label(h.label[lang === 'ru' ? 1 : 0]);
      sp.position.copy(h.p); sp.userData.storey = h.storey;
      this.labels.push(sp); this.group.add(sp);
    }
    this.layout();
  }

  setLang(lang: 'uz' | 'ru') {
    this.labels.forEach((sp, i) => {
      const n = label(this.model.hotspots[i].label[lang === 'ru' ? 1 : 0]);
      (sp.material as THREE.SpriteMaterial).map?.dispose();
      sp.material = n.material; sp.scale.copy(n.scale);
    });
  }
  setSystems(s: Set<Sys>) { this.show = new Set(s); this.layout(); }
  setStorey(s: number | null) { this.storey = s; this.layout(); }

  private visible(seg: Seg) {
    const p = this.model.paths[seg.path];
    if (!this.show.has(p.sys)) return false;
    if (this.storey === null) return true;
    // a chosen storey: its own flat networks, plus risers / mains / inlets up to it
    if (p.info.storey !== null && p.info.storey > 1) return p.info.storey === this.storey;
    return seg.storey <= this.storey;
  }
  /** rebuild instance matrices for what is visible (systems + storey filter) */
  private layout() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), sc = new THREE.Vector3();
    const whole = this.storey === null;
    for (const [sys, pm] of this.pipeMesh) {
      let n = 0;
      const vis: number[] = [];
      for (const si of pm.segs) {
        const s = this.segs[si];
        if (!this.visible(s)) continue;
        const p = this.model.paths[s.path];
        // the whole building: only risers, mains and inlets read at that scale; flat branches when a storey is chosen
        if (whole && p.info.storey !== null && p.info.storey > 1) continue;
        d.subVectors(s.b, s.a);
        const L = d.length(); if (L < 1e-4) continue;
        q.setFromUnitVectors(up, d.normalize());
        const r = whole ? Math.max(p.r * 2.2, 0.14) : Math.max(p.r * 1.6, 0.03);
        m.compose(s.a, q, sc.set(r, L, r));
        pm.mesh.setMatrixAt(n++, m);
        vis.push(si);
      }
      pm.mesh.count = n;
      pm.mesh.userData.vis = vis;
      pm.mesh.instanceMatrix.needsUpdate = true;
      pm.mesh.computeBoundingSphere();
    }
    // devices
    let n = 0;
    const col = new THREE.Color();
    this.visDev = [];
    this.model.devs.forEach((dv, i) => {
      if (!this.show.has(dv.sys)) return;
      if (this.storey === null ? dv.storey > 1 : dv.storey > this.storey || (dv.storey > 1 && dv.storey !== this.storey && dv.kind !== 'board')) return;
      m.compose(dv.p, q.identity(), dv.s);
      this.devMesh.setMatrixAt(n, m);
      this.devMesh.setColorAt(n, col.set(DEV_COLOR[dv.kind] ?? '#dddddd'));
      this.visDev.push(i); n++;
    });
    this.devMesh.count = n;
    this.devMesh.instanceMatrix.needsUpdate = true;
    if (this.devMesh.instanceColor) this.devMesh.instanceColor.needsUpdate = true;
    this.devMesh.computeBoundingSphere();
    // flow dots along the visible paths that carry a flow
    this.flow = [];
    const seen = new Set<number>();
    for (const pm of this.pipeMesh.values()) for (const si of (pm.mesh.userData.vis as number[])) {
      const pi = this.segs[si].path; if (seen.has(pi)) continue; seen.add(pi);
      const p = this.model.paths[pi]; if (!p.flow) continue;
      const k = Math.max(1, Math.round(this.pathLen[pi] / (whole ? 6 : 1.6)));
      for (let j = 0; j < k && this.flow.length < 6000; j++) this.flow.push({ path: pi, t: j / k });
    }
    this.labels.forEach((sp) => {
      const st = sp.userData.storey as number | null;
      // building-level labels in the whole-building view; the technical rooms' labels also on storey 1
      sp.visible = this.storey === null ? true : st === 1 && this.storey === 1;
    });
    this.select(null);
  }

  /** animate the flow dots; returns true while something moves */
  update(dt: number) {
    if (!this.flow.length) { this.flowMesh.count = 0; return false; }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), whole = this.storey === null;
    const col = new THREE.Color();
    this.flow.forEach((f, i) => {
      const p = this.model.paths[f.path], L = this.pathLen[f.path];
      f.t = (f.t + (dt * (whole ? 2.4 : 0.8)) / L) % 1;
      let d = f.t * L;
      for (let k = 1; k < p.pts.length; k++) {
        const seg = p.pts[k - 1].distanceTo(p.pts[k]);
        if (d <= seg || k === p.pts.length - 1) { v.lerpVectors(p.pts[k - 1], p.pts[k], Math.min(1, d / (seg || 1))); break; }
        d -= seg;
      }
      // dots above the cut storey are hidden (the risers carry on up, the view does not)
      const r = this.storey !== null && v.y > this.storey * FLOOR_H + 0.2 ? 0 : (whole ? Math.max(p.r * 2.2, 0.14) : Math.max(p.r * 1.6, 0.03)) * 1.35 + 0.01;
      this.flowMesh.setMatrixAt(i, m.compose(v, q, new THREE.Vector3(r, r, r)));
      this.flowMesh.setColorAt(i, col.set(SYSTEMS[p.sys].color).lerp(new THREE.Color('#ffffff'), 0.6));
    });
    this.flowMesh.count = this.flow.length;
    this.flowMesh.instanceMatrix.needsUpdate = true;
    if (this.flowMesh.instanceColor) this.flowMesh.instanceColor.needsUpdate = true;
    return true;
  }

  /** what is under the ray: a device or a pipe → its info, and the whole path lights up */
  pick(ray: THREE.Raycaster): EngInfo | null {
    const meshes = [this.devMesh, ...[...this.pipeMesh.values()].map((p) => p.mesh)];
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit || hit.instanceId === undefined) { this.select(null); return null; }
    if (hit.object === this.devMesh) { const d = this.model.devs[this.visDev[hit.instanceId]]; this.select(null); return d.info; }
    const si = (hit.object.userData.vis as number[])[hit.instanceId];
    const pi = this.segs[si].path;
    this.select(pi);
    return this.model.paths[pi].info;
  }
  private select(pi: number | null) {
    if (this.highlight) { this.group.remove(this.highlight); this.highlight.geometry.dispose(); this.highlight = null; }
    if (pi === null) return;
    const p = this.model.paths[pi];
    const curve = new THREE.CurvePath<THREE.Vector3>();
    for (let k = 1; k < p.pts.length; k++) curve.add(new THREE.LineCurve3(p.pts[k - 1], p.pts[k]));
    const r = (this.storey === null ? Math.max(p.r * 2.2, 0.14) : Math.max(p.r * 1.6, 0.03)) * 2.2 + 0.02;
    this.highlight = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, p.pts.length * 4), r, 8, false),
      new THREE.MeshBasicMaterial({ color: SYSTEMS[p.sys].color, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
    this.group.add(this.highlight);
  }
  dispose() { this.group.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); }); }
}

function label(text: string) {
  const c = document.createElement('canvas'), g = c.getContext('2d')!;
  g.font = '600 30px Montserrat, system-ui, sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 36;
  c.width = w; c.height = 52;
  g.font = '600 30px Montserrat, system-ui, sans-serif';
  g.fillStyle = 'rgba(8,30,22,.82)';
  g.beginPath(); g.roundRect(0, 0, w, 52, 14); g.fill();
  g.strokeStyle = 'rgba(226,199,133,.8)'; g.lineWidth = 2; g.beginPath(); g.roundRect(1, 1, w - 2, 50, 13); g.stroke();
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(text, 18, 27);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, toneMapped: false }));
  sp.scale.set((w / 52) * 1.9, 1.9, 1);
  sp.renderOrder = 10;
  return sp;
}
