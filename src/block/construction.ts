// Construction view of the type-4 block: the building as it is built — piles, raft, monolithic frame and core,
// slabs, aerated-concrete outer walls, partitions, facade, windows, doors, roof — with a material card for every
// element, construction stages, an exploded view, a section cut, the rebar of a clicked concrete element and a
// bill of quantities. A SCHEMATIC MOCK: there are no КЖ / АР specifications yet; typical Tashkent practice for a
// 16-storey monolithic frame in a seismic zone. Every card says so.
// Block-local coordinates: plan (x, y) → (x, height, y); storey s floor slab at (s − 1) · FLOOR_H.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOCK_D, BLOCK_W, FLOORS, FLOOR_H, SLAB, planFor, polyBounds, type FloorPlan, type Pt } from './plan';
import { buildModel, SYSTEMS, type Sys } from './engineering';

type L2 = [string, string];
const T = (uz: string, ru: string): L2 => [uz, ru];
export type Layer = 'found' | 'frame' | 'slab' | 'wall' | 'facade' | 'window' | 'door' | 'roof';
export const LAYERS: { id: Layer; name: L2 }[] = [
  { id: 'found', name: T('Poydevor', 'Фундамент') }, { id: 'frame', name: T('Karkas', 'Каркас') },
  { id: 'slab', name: T('Plitalar', 'Плиты') }, { id: 'wall', name: T('Devorlar', 'Стены') },
  { id: 'facade', name: T('Fasad', 'Фасад') }, { id: 'window', name: T('Derazalar', 'Окна') },
  { id: 'door', name: T('Eshiklar', 'Двери') }, { id: 'roof', name: T('Tom', 'Кровля') },
];

export type MatId = 'pile' | 'raft' | 'column' | 'core' | 'slab' | 'aerated' | 'partition' | 'facade' | 'brick'
  | 'window' | 'glass' | 'vitrage' | 'door_entry' | 'door_int' | 'door_main' | 'roof';
export type CakeLayer = { name: L2; mm: number; color: string };
export type MatInfo = { name: L2; color: string; client: L2; specs: L2[]; std: string; cake?: CakeLayer[]; rebar?: 'column' | 'slab' | 'pile' | 'wall' };
export const MOCK: L2 = T('Namunaviy ma’lumot — loyiha (КЖ, АР) emas', 'Данные-образец — не проект (КЖ, АР)');

export const MATS: Record<MatId, MatInfo> = {
  pile: { name: T('Burg‘ilab quyilgan qoziq', 'Буронабивная свая'), color: '#9a9a96', std: 'ШНК 2.02.03 / СП 24.13330', rebar: 'pile',
    client: T('Yerga 12 metr chuqur kiradigan beton ustunchalar. Bino og‘irligini mustahkam grunt qatlamiga uzatadi va zilzilada binoni ushlab turadi.', 'Бетонные сваи на 12 м в грунт. Передают вес здания на прочный слой и держат его при землетрясении.'),
    specs: [T('Ø600 mm, uzunligi 12 m, qadami ~3 m', 'Ø600 мм, длина 12 м, шаг ~3 м'), T('Beton B25 (M350), W8', 'Бетон B25 (M350), W8'), T('Armatura: 8 Ø20 A500C, spiral Ø8 A240', 'Арматура: 8 Ø20 A500C, спираль Ø8 A240')] },
  raft: { name: T('Monolit poydevor plitasi', 'Монолитная фундаментная плита'), color: '#8f8f8b', std: 'ШНК 2.02.01 / СП 22.13330', rebar: 'slab',
    client: T('Butun bino turadigan qalin temir-beton "taglik". Yukni teng taqsimlaydi, namlik va cho‘kishdan himoya qiladi.', 'Толстая железобетонная «подошва» всего здания. Равномерно распределяет нагрузку, защищает от осадки и влаги.'),
    specs: [T('Qalinligi 1200 mm, bino konturidan 1 m chiqqan', 'Толщина 1200 мм, выступ за контур 1 м'), T('Beton B25, W8 (suv o‘tkazmaydigan), F150', 'Бетон B25, W8 (водонепроницаемый), F150'), T('Armatura: ikki qatlam Ø25 A500C, qadami 200×200', 'Арматура: два слоя Ø25 A500C, шаг 200×200'), T('Ostida: shag‘al tayyorlov 100 + gidroizolyatsiya 2 qatlam', 'Под ней: щебёночная подготовка 100 + гидроизоляция в 2 слоя')],
    cake: [{ name: T('Temir-beton plita', 'Ж/б плита'), mm: 1200, color: '#8f8f8b' }, { name: T('Gidroizolyatsiya', 'Гидроизоляция'), mm: 10, color: '#2b2b2b' }, { name: T('Beton tayyorlov', 'Бетонная подготовка'), mm: 100, color: '#b9b6ae' }, { name: T('Shag‘al', 'Щебень'), mm: 200, color: '#a39d90' }] },
  column: { name: T('Monolit ustun', 'Монолитная колонна'), color: '#b8b6b0', std: 'ШНК 2.03.01 / СП 63.13330', rebar: 'column',
    client: T('Binoning "suyagi": har qavatda quyiladigan temir-beton ustunlar. Butun og‘irlik ular orqali poydevorga tushadi.', '«Скелет» здания: железобетонные колонны, отливаемые на каждом этаже. Через них вся нагрузка идёт на фундамент.'),
    specs: [T('Kesimi 500×500 mm', 'Сечение 500×500 мм'), T('Beton B30 (M400)', 'Бетон B30 (M400)'), T('Bo‘ylama: 8 Ø25 A500C', 'Продольная: 8 Ø25 A500C'), T('Xomutlar: Ø10 A240, qadami 200 (tugunlarda 100 — seysmik talab)', 'Хомуты: Ø10 A240, шаг 200 (в узлах 100 — сейсмика)')] },
  core: { name: T('Beton yadro (lift va zinapoya devorlari)', 'Ядро жёсткости (стены лифтов и лестницы)'), color: '#a9a7a1', std: 'ШНК 2.01.03 (seysmik)', rebar: 'wall',
    client: T('Lift va zinapoya atrofidagi qalin beton devorlar binoni zilzilada chayqalishdan saqlaydi. Toshkent 8–9 balli seysmik hudud.', 'Толстые бетонные стены вокруг лифтов и лестницы не дают зданию раскачиваться при землетрясении. Ташкент — сейсмичность 8–9 баллов.'),
    specs: [T('Qalinligi 200 mm', 'Толщина 200 мм'), T('Beton B30', 'Бетон B30'), T('Ikki qatlam setka Ø12 A500C, qadami 200', 'Две сетки Ø12 A500C, шаг 200')] },
  slab: { name: T('Monolit qavatlararo plita', 'Монолитное перекрытие'), color: '#c4c2bc', std: 'ШНК 2.03.01', rebar: 'slab',
    client: T('Har qavatning poli va pastki qavatning shifti. Ustiga shovqin izolyatsiyasi va tekis styajka qilinadi.', 'Пол каждого этажа и потолок нижнего. Сверху — звукоизоляция и ровная стяжка.'),
    specs: [T('Qalinligi 200 mm', 'Толщина 200 мм'), T('Beton B25', 'Бетон B25'), T('Armatura: pastki va ustki setka Ø12 A500C, qadami 200×200', 'Арматура: нижняя и верхняя сетки Ø12 A500C, шаг 200×200')],
    cake: [{ name: T('Pol qoplamasi (xaridor)', 'Чистовой пол (покупатель)'), mm: 10, color: '#c79a63' }, { name: T('Sement-qum styajka', 'Цементно-песчаная стяжка'), mm: 50, color: '#d8d3c7' }, { name: T('Shovqin izolyatsiyasi', 'Звукоизоляция'), mm: 20, color: '#e9df8f' }, { name: T('Temir-beton plita', 'Ж/б плита'), mm: 200, color: '#a9a7a1' }, { name: T('Shiftga shtukaturka', 'Штукатурка потолка'), mm: 10, color: '#efece6' }] },
  aerated: { name: T('Tashqi devor — gazoblok', 'Наружная стена — газоблок'), color: '#e6e2d8', std: 'GOST 31360 / O‘zDSt', rebar: undefined,
    client: T('Yengil va issiqni yaxshi saqlaydigan bloklar. Tashqaridan qo‘shimcha issiqlik izolyatsiyasi bilan — qishda iliq, yozda salqin.', 'Лёгкие тёплые блоки. Снаружи — дополнительный утеплитель: зимой тепло, летом прохладно.'),
    specs: [T('Gazoblok D500, 600×300×200, B2.5', 'Газоблок D500, 600×300×200, B2.5'), T('Elim bilan teriladi, har 3-qatorda armatura Ø8', 'Кладка на клей, армирование Ø8 через 3 ряда'), T('Issiqlik uzatish R ≈ 3,2 m²·K/W (izolyatsiya bilan)', 'Сопротивление теплопередаче R ≈ 3,2 м²·К/Вт (с утеплителем)')],
    cake: [{ name: T('Ichki shtukaturka', 'Внутренняя штукатурка'), mm: 20, color: '#efece6' }, { name: T('Gazoblok D500', 'Газоблок D500'), mm: 300, color: '#e6e2d8' }, { name: T('Mineral paxta', 'Минвата'), mm: 100, color: '#e9df8f' }, { name: T('Armirlangan fasad shtukaturkasi', 'Армированная фасадная штукатурка'), mm: 15, color: '#f4f1ea' }] },
  partition: { name: T('Ichki devor (to‘siq)', 'Межкомнатная перегородка'), color: '#dcd6ca', std: 'ШНК 2.03.07',
    client: T('Xonalar orasidagi devorlar. Yuk ko‘tarmaydi — kerak bo‘lsa, loyihaga muvofiq o‘zgartirish mumkin.', 'Стены между комнатами. Ненесущие — при необходимости перепланировка по проекту.'),
    specs: [T('Gazoblok D500, 100 mm (xonalar orasida)', 'Газоблок D500, 100 мм (между комнатами)'), T('Kvartiralar orasida: 200 mm, shovqin −52 dB', 'Между квартирами: 200 мм, звукоизоляция −52 дБ')],
    cake: [{ name: T('Shtukaturka', 'Штукатурка'), mm: 15, color: '#efece6' }, { name: T('Gazoblok', 'Газоблок'), mm: 100, color: '#dcd6ca' }, { name: T('Shtukaturka', 'Штукатурка'), mm: 15, color: '#efece6' }] },
  facade: { name: T('Fasad', 'Фасад'), color: '#f2efe8', std: 'ШНК 2.03.02',
    client: T('Binoning tashqi ko‘rinishi: issiqlik izolyatsiyasi ustidan armirlangan shtukaturka va rangli bo‘yoq, pastki qavatlarda dekorativ panel.', 'Внешний вид здания: штукатурка по утеплителю с армирующей сеткой и окраской, внизу — декоративные панели.'),
    specs: [T('Mineral paxta 100 mm, dyubel bilan', 'Минвата 100 мм на дюбелях'), T('Armirlovchi setka + yupqa shtukaturka 15 mm', 'Армирующая сетка + тонкая штукатурка 15 мм'), T('Fasad bo‘yog‘i (silikon), 10 yil kafolat', 'Фасадная краска (силикон), гарантия 10 лет')] },
  brick: { name: T('1-qavat devori — pishgan g‘isht', 'Стена 1 этажа — керамический кирпич'), color: '#b5654a', std: 'GOST 530',
    client: T('Do‘konlar qavati mustahkam pishgan g‘ishtdan, tashqaridan dekorativ qoplama.', 'Этаж магазинов — из прочного керамического кирпича с декоративной облицовкой.'),
    specs: [T('G‘isht M150, 380 mm', 'Кирпич М150, 380 мм')] },
  window: { name: T('Deraza', 'Окно'), color: '#f4f4f4', std: 'GOST 30674',
    client: T('Ikki kamerali oyna paketi: issiqni saqlaydi va ko‘cha shovqinini sezilarli kamaytiradi.', 'Двухкамерный стеклопакет: держит тепло и заметно снижает уличный шум.'),
    specs: [T('Profil: PVX 70 mm, 5 kamerali (yoki alyumin "issiq" profil)', 'Профиль: ПВХ 70 мм, 5 камер (или тёплый алюминий)'), T('Oyna paketi 4-16-4-16-4, energiya tejamkor oyna', 'Стеклопакет 4-16-4-16-4, энергосберегающее стекло'), T('Issiqlik uzatish U ≈ 1,1 W/m²·K, shovqin −35 dB', 'U ≈ 1,1 Вт/м²·К, шумоизоляция −35 дБ')] },
  glass: { name: T('Oyna paketi', 'Стеклопакет'), color: '#9fc3d8', std: 'GOST 24866',
    client: T('Ikki kamerali, ichki oynasi energiya tejamkor qoplamali.', 'Двухкамерный, внутреннее стекло с энергосберегающим покрытием.'),
    specs: [T('4-16-4-16-4, argon bilan', '4-16-4-16-4, с аргоном')] },
  vitrage: { name: T('Balkon vitraji', 'Витраж балкона'), color: '#f0f0f0', std: 'GOST 21519',
    client: T('Balkon/lodjiyaning yengil alyumin oynavand qismi.', 'Лёгкое алюминиевое остекление балкона/лоджии.'),
    specs: [T('Alyumin "sovuq" profil, 1 kamerali oyna', 'Холодный алюминиевый профиль, однокамерное стекло')] },
  door_entry: { name: T('Kvartira kirish eshigi', 'Входная дверь квартиры'), color: '#3b3f44', std: 'GOST 31173',
    client: T('Metall xavfsizlik eshigi: ikki qulf, ichida issiqlik va shovqin izolyatsiyasi.', 'Металлическая дверь безопасности: два замка, внутри тепло- и шумоизоляция.'),
    specs: [T('Po‘lat 1,5 mm, MDF panel', 'Сталь 1,5 мм, панель МДФ'), T('2 qulf (silindr + suvald), 3 ilmoq', '2 замка (цилиндр + сувальда), 3 петли'), T('O‘lcham 960×2050 mm', 'Размер 960×2050 мм')] },
  door_int: { name: T('Xona eshigi', 'Межкомнатная дверь'), color: '#c8a77c', std: 'GOST 475',
    client: T('Xonalar orasidagi eshiklar. "Qora suvoq" bilan topshirilsa — xaridor o‘zi tanlaydi.', 'Межкомнатные двери. При сдаче «под чистовую» — выбор покупателя.'),
    specs: [T('MDF / ekoshpon, 800×2000 mm', 'МДФ / экошпон, 800×2000 мм')] },
  door_main: { name: T('Podyezd / do‘kon eshigi', 'Дверь подъезда / магазина'), color: '#5c6670', std: 'GOST 23747',
    client: T('Alyumin rom va mustahkamlangan oyna, domofon bilan.', 'Алюминиевая рама и закалённое стекло, с домофоном.'),
    specs: [T('Alyumin "issiq" profil, triplex oyna', 'Тёплый алюминий, триплекс')] },
  roof: { name: T('Tekis tom', 'Плоская кровля'), color: '#5a5d61', std: 'ШНК 2.03.10',
    client: T('Ko‘p qatlamli tom: issiqlik izolyatsiyasi va ikki qatlam suv o‘tkazmaydigan membrana. Suv voronkalar orqali ketadi.', 'Многослойная кровля: утеплитель и два слоя гидроизоляции. Вода уходит через воронки.'),
    specs: [T('Bitumli membrana 2 qatlam', 'Битумная мембрана 2 слоя'), T('Qiyalik hosil qiluvchi keramzit 50–150', 'Уклонообразующий керамзит 50–150'), T('Issiqlik izolyatsiyasi 150 mm', 'Утеплитель 150 мм'), T('Parapet 900 mm', 'Парапет 900 мм')],
    cake: [{ name: T('Membrana (2 qatlam)', 'Мембрана (2 слоя)'), mm: 8, color: '#3a3a3a' }, { name: T('Styajka', 'Стяжка'), mm: 40, color: '#d8d3c7' }, { name: T('Keramzit (qiyalik)', 'Керамзит (уклон)'), mm: 100, color: '#b48a5a' }, { name: T('Izolyatsiya', 'Утеплитель'), mm: 150, color: '#e9df8f' }, { name: T('Bug‘ izolyatsiyasi', 'Пароизоляция'), mm: 2, color: '#6b6b6b' }, { name: T('Temir-beton plita', 'Ж/б плита'), mm: 200, color: '#a9a7a1' }] },
};

/** construction stages (slider 0 … 8) */
export const STAGES: { at: number; name: L2; note: L2; time: L2 }[] = [
  { at: 0, name: T('Qazish va qoziqlar', 'Котлован и сваи'), note: T('Kotlovan qaziladi, 12 m chuqurlikka qoziqlar quyiladi.', 'Роют котлован, бурят и бетонируют сваи на 12 м.'), time: T('~2 oy', '~2 мес.') },
  { at: 1, name: T('Poydevor plitasi', 'Фундаментная плита'), note: T('Gidroizolyatsiya, armatura va 1,2 m qalin plita quyiladi.', 'Гидроизоляция, армирование и бетонирование плиты 1,2 м.'), time: T('~1 oy', '~1 мес.') },
  { at: 2, name: T('Monolit karkas', 'Монолитный каркас'), note: T('Qavatma-qavat: ustunlar, beton yadro va plita. Har qavat ~7–10 kun.', 'Поэтажно: колонны, ядро и перекрытие. Этаж ~7–10 дней.'), time: T('~6 oy', '~6 мес.') },
  { at: 3.2, name: T('Devorlar', 'Стены'), note: T('Karkasdan bir necha qavat orqada: tashqi gazoblok va ichki devorlar.', 'С отставанием от каркаса: наружный газоблок и перегородки.'), time: T('~5 oy', '~5 мес.') },
  { at: 5, name: T('Tom', 'Кровля'), note: T('Izolyatsiya va ikki qatlam membrana, parapet.', 'Утепление, два слоя мембраны, парапет.'), time: T('~1 oy', '~1 мес.') },
  { at: 5.5, name: T('Fasad', 'Фасад'), note: T('Izolyatsiya, armirlangan shtukaturka, bo‘yoq — yuqoridan pastga.', 'Утеплитель, армированная штукатурка, окраска — сверху вниз.'), time: T('~3 oy', '~3 мес.') },
  { at: 6.5, name: T('Derazalar va eshiklar', 'Окна и двери'), note: T('Oyna paketlari, kirish eshiklari, podyezd eshiklari.', 'Стеклопакеты, входные и подъездные двери.'), time: T('~2 oy', '~2 мес.') },
  { at: 7.5, name: T('Tayyor', 'Готово'), note: T('Muhandislik tarmoqlari ulanadi, hovli obodonlashtiriladi.', 'Подключение сетей, благоустройство двора.'), time: T('jami ~18–20 oy', 'всего ~18–20 мес.') },
];
export const STAGE_MAX = 8;

// ---------------------------------------------------------------- geometry helpers
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function distToRing(x: number, y: number, ring: Pt[]) {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}
/** collects triangles per material */
class Acc {
  m = new Map<MatId, number[]>();
  tri(id: MatId, ...v: number[]) { let a = this.m.get(id); if (!a) this.m.set(id, (a = [])); a.push(...v); }
  quad(id: MatId, a: number[], b: number[], c: number[], d: number[]) { this.tri(id, ...a, ...b, ...c, ...a, ...c, ...d); }
  /** vertical wall face along plan segment */
  wall(id: MatId, ax: number, ay: number, bx: number, by: number, y0: number, y1: number) {
    this.quad(id, [ax, y0, ay], [bx, y0, by], [bx, y1, by], [ax, y1, ay]);
  }
  /** horizontal polygon (outer + holes) at height y */
  cap(id: MatId, outer: Pt[], holes: Pt[][], y: number) {
    const o = outer.map(([x, z]) => new THREE.Vector2(x, z)), h = holes.map((r) => r.map(([x, z]) => new THREE.Vector2(x, z)));
    const all = [...o, ...h.flat()];
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(o, h)) this.tri(id, all[a].x, y, all[a].y, all[b].x, y, all[b].y, all[c].x, y, all[c].y);
  }
  box(id: MatId, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const P = (x: number, y: number, z: number) => [x, y, z];
    const c = [P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0), P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
    const f = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
    for (const [a, b, cc, d] of f) this.quad(id, c[a], c[b], c[cc], c[d]);
  }
}

type Piece = { mesh: THREE.Mesh; layer: Layer; storey: number; mat: MatId };
export type ConPick = { mat: MatId; storey: number; point: THREE.Vector3 };
export type Quantity = { name: L2; unit: L2; value: number; note?: L2 };

// ---------------------------------------------------------------- the construction model
export class Construction {
  readonly group = new THREE.Group();
  private floors: THREE.Group[] = [];             // 0 foundation, 1 … 16 storeys, 17 roof
  private pieces: Piece[] = [];
  private mats = new Map<MatId, THREE.MeshStandardMaterial>();
  private facadeAlt = new Map<THREE.Mesh, MatId>();   // outer faces: facade when built, aerated block before
  private cut = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e4);   // keeps x ≥ cut: the cut face looks at the default camera
  private layers = new Set<Layer>(LAYERS.map((l) => l.id));
  private stage = STAGE_MAX;
  private explode = 0;
  private columns: [number, number][] = [];
  private rebar: THREE.Group | null = null;
  private pit: THREE.Mesh;
  readonly quantities: Quantity[] = [];

  constructor() {
    for (const [id, m] of Object.entries(MATS) as [MatId, MatInfo][]) {
      const glass = id === 'glass';
      const mat = new THREE.MeshStandardMaterial({
        color: m.color, roughness: glass ? 0.1 : 0.85, metalness: glass ? 0.1 : 0, transparent: glass, opacity: glass ? 0.45 : 1,
        side: THREE.DoubleSide, clippingPlanes: [this.cut], map: id === 'aerated' || id === 'partition' ? blockTexture(m.color) : id === 'brick' ? brickTexture() : null,
      });
      this.mats.set(id, mat);
    }
    for (let i = 0; i <= FLOORS + 1; i++) { const g = new THREE.Group(); this.floors.push(g); this.group.add(g); }
    this.pit = new THREE.Mesh(new THREE.BoxGeometry(BLOCK_W + 6, 2.2, BLOCK_D + 6).translate(BLOCK_W / 2, -1.1, BLOCK_D / 2),
      new THREE.MeshStandardMaterial({ color: '#7a5d43', roughness: 1, transparent: true, opacity: 0.5, side: THREE.BackSide, depthWrite: false }));
    this.group.add(this.pit);
    this.build();
    this.apply();
  }

  // ---------- build
  private add(acc: Acc, layer: Layer, storey: number, uvScale = 1) {
    for (const [id, v] of acc.m) {
      if (!v.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.computeVertexNormals();
      // planar UVs good enough for block / brick patterns: along the face (x + z) and up (y)
      const uv: number[] = [];
      for (let i = 0; i < v.length; i += 3) uv.push((v[i] + v[i + 2]) / uvScale, v[i + 1] / uvScale);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const mesh = new THREE.Mesh(g, this.mats.get(id)!);
      mesh.castShadow = id !== 'glass'; mesh.receiveShadow = true;
      mesh.userData = { mat: id, storey, layer };
      this.floors[storey].add(mesh);
      this.pieces.push({ mesh, layer, storey, mat: id });
    }
  }

  private build() {
    const fp = planFor(3).footprint.outer;
    const fb = polyBounds(planFor(3).footprint);
    const q = { conc: { raft: 0, pile: 0, column: 0, core: 0, slab: 0 }, aerated: 0, part: 0, win: 0, winA: 0, vit: 0, dEntry: 0, dInt: 0, dMain: 0, roof: 0 };

    // foundation: raft 1.2 m, 1 m beyond the footprint; piles every ~3 m
    const fa = new Acc();
    fa.box('raft', fb.x0 - 1, -1.4, fb.y0 - 1, fb.x1 + 1, -0.2, fb.y1 + 1);
    q.conc.raft = (fb.x1 - fb.x0 + 2) * (fb.y1 - fb.y0 + 2) * 1.2;
    this.add(fa, 'found', 0, 2);
    const piles: [number, number][] = [];
    for (let x = fb.x0 + 0.8; x <= fb.x1 - 0.5; x += 3) for (let y = fb.y0 + 0.8; y <= fb.y1 - 0.5; y += 3) piles.push([x, y]);
    const pg = new THREE.CylinderGeometry(0.3, 0.3, 12, 12).translate(0, -7.4, 0);
    const pm = new THREE.InstancedMesh(pg, this.mats.get('pile')!, piles.length);
    piles.forEach(([x, y], i) => pm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, y)));
    pm.userData = { mat: 'pile', storey: 0, layer: 'found' };
    this.floors[0].add(pm);
    this.pieces.push({ mesh: pm, layer: 'found', storey: 0, mat: 'pile' });
    q.conc.pile = piles.length * Math.PI * 0.09 * 12;

    // structural grid: columns on the main axes where they fall inside the footprint
    const XS = [0.45, 6.4, 12.35, 17.4, 23.4, 29.25], YS = [0.45, 7.7, 9.7, 17.6];
    const inside = (x: number, y: number) => planFor(3).rooms.some((r) => r.kind !== 'balcony' && pointIn(x, y, r.poly.outer)) || distToRing(x, y, fp) < 0.6;
    for (const x of XS) for (const y of YS) if (inside(x, y)) this.columns.push([x, y]);

    // core: walls around the lifts and the stair
    const coreRooms = (plan: FloorPlan) => plan.rooms.filter((r) => r.kind === 'lift' || (r.kind === null && r.apt === null && r.area > 10 && r.area < 16 && (() => { const b = polyBounds(r.poly); return b.x0 > 8 && b.x1 < 18 && b.y0 > 8; })()));

    for (let s = 1; s <= FLOORS; s++) {
      const plan = planFor(s), y0 = (s - 1) * FLOOR_H, wb = y0 + SLAB, wt = y0 + FLOOR_H;
      const ring = plan.footprint.outer;
      const cores = coreRooms(plan).map((r) => polyBounds(r.poly));
      const nearCore = (x: number, y: number) => cores.some((b) => x > b.x0 - 0.35 && x < b.x1 + 0.35 && y > b.y0 - 0.35 && y < b.y1 + 0.35 && (Math.abs(x - b.x0) < 0.35 || Math.abs(x - b.x1) < 0.35 || Math.abs(y - b.y0) < 0.35 || Math.abs(y - b.y1) < 0.35));
      // slab (+ balconies)
      const sl = new Acc();
      const slabPolys = [plan.footprint, ...plan.rooms.filter((r) => r.kind === 'balcony').map((r) => r.poly)];
      for (const p of slabPolys) {
        sl.cap('slab', p.outer, p.holes, y0); sl.cap('slab', p.outer, p.holes, y0 + SLAB);
        for (let i = 0; i < p.outer.length; i++) { const [ax, ay] = p.outer[i], [bx, by] = p.outer[(i + 1) % p.outer.length]; sl.wall('slab', ax, ay, bx, by, y0, y0 + SLAB); }
        q.conc.slab += ringArea(p.outer) * SLAB;
      }
      this.add(sl, 'slab', s);
      // columns
      const co = new Acc();
      for (const [x, y] of this.columns) co.box('column', x - 0.25, wb, y - 0.25, x + 0.25, wt, y + 0.25);
      q.conc.column += this.columns.length * 0.25 * (FLOOR_H - SLAB);
      this.add(co, 'frame', s);
      // walls: each edge of each wall polygon → outer face / inner face of the outer wall / partition / core
      const outer = new Acc(), inner = new Acc(), core = new Acc();
      const ground = s === 1;
      for (const w of plan.walls) {
        for (const r of [w.outer, ...w.holes]) {
          for (let i = 0; i < r.length; i++) {
            const [ax, ay] = r[i], [bx, by] = r[(i + 1) % r.length];
            const L = Math.hypot(bx - ax, by - ay); if (L < 0.02) continue;
            const mx = (ax + bx) / 2, my = (ay + by) / 2, d = distToRing(mx, my, ring);
            if (nearCore(mx, my)) { core.wall('core', ax, ay, bx, by, wb, wt); q.conc.core += L * (FLOOR_H - SLAB) * 0.1; continue; }
            if (d < 0.12) { outer.wall(ground ? 'brick' : 'facade', ax, ay, bx, by, wb, wt); continue; }
            if (d < 0.6) { inner.wall(ground ? 'brick' : 'aerated', ax, ay, bx, by, wb, wt); q.aerated += L * (FLOOR_H - SLAB) * 0.3; continue; }
            inner.wall('partition', ax, ay, bx, by, wb, wt); q.part += L * (FLOOR_H - SLAB) / 2;
          }
        }
        inner.cap('partition', w.outer, w.holes, wt - 0.001);
      }
      // window openings: sill and lintel in the wall material, the window unit in between
      const win = new Acc(), door = new Acc();
      const SILL = 0.9, HEAD = 2.35;
      for (const o of plan.windows) {
        const ext = ground ? 'brick' : 'aerated';
        inner.box(ext, o.x0, wb, o.y0, o.x1, wb + SILL, o.y1);
        inner.box(ext, o.x0, wb + HEAD, o.y0, o.x1, wt, o.y1);
        windowUnit(win, o.x0, o.y0, o.x1, o.y1, o.axis, wb + SILL, wb + HEAD, 'window');
        q.win += 1; q.winA += (o.axis === 'x' ? o.x1 - o.x0 : o.y1 - o.y0) * (HEAD - SILL);
      }
      for (const o of plan.glass) { windowUnit(win, o.x0, o.y0, o.x1, o.y1, o.axis, wb + 0.05, wt - 0.15, 'vitrage'); q.vit += (o.axis === 'x' ? o.x1 - o.x0 : o.y1 - o.y0) * (FLOOR_H - SLAB - 0.2); }
      // doors: leaf + lintel; entry doors are those onto the public corridor
      const corr = plan.rooms.filter((r) => r.kind === null && r.apt === null && r.area > 20);
      for (const o of plan.openings) {
        if (o.kind !== 'door') continue;
        const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
        const sides = o.axis === 'x' ? [[cx, cy - 0.4], [cx, cy + 0.4]] : [[cx - 0.4, cy], [cx + 0.4, cy]];
        const onCorr = sides.some(([x, y]) => corr.some((r) => pointIn(x, y, r.poly.outer)));
        const id: MatId = ground ? 'door_main' : onCorr ? 'door_entry' : 'door_int';
        const t = 0.05, H = 2.1;
        if (o.axis === 'x') door.box(id, o.x0 + 0.05, wb, cy - t / 2, o.x1 - 0.05, wb + H, cy + t / 2);
        else door.box(id, cx - t / 2, wb, o.y0 + 0.05, cx + t / 2, wb + H, o.y1 - 0.05);
        inner.box(ground ? 'brick' : 'partition', o.x0, wb + H, o.y0, o.x1, wt, o.y1);
        if (id === 'door_entry') q.dEntry++; else if (id === 'door_int') q.dInt++; else q.dMain++;
      }
      this.add(outer, 'wall', s, 3); this.add(inner, 'wall', s, 3); this.add(core, 'frame', s, 3);
      this.add(win, 'window', s); this.add(door, 'door', s);
    }
    // outer faces are the facade once it is built; before that the bare aerated block shows
    for (const p of this.pieces) if (p.mat === 'facade') this.facadeAlt.set(p.mesh, 'aerated');

    // roof: slab, build-up, parapet
    const top = FLOORS * FLOOR_H, rf = new Acc(), plan = planFor(FLOORS);
    rf.cap('slab', plan.footprint.outer, plan.footprint.holes, top); rf.cap('roof', plan.footprint.outer, plan.footprint.holes, top + 0.5);
    for (let i = 0; i < fp.length; i++) {
      const [ax, ay] = fp[i], [bx, by] = fp[(i + 1) % fp.length];
      rf.wall('slab', ax, ay, bx, by, top, top + 0.5); rf.wall('facade', ax, ay, bx, by, top + 0.5, top + 1.4);
    }
    q.conc.slab += ringArea(fp) * SLAB; q.roof = ringArea(fp);
    this.add(rf, 'roof', FLOORS + 1);

    // bill of quantities (approximate, from this geometry)
    const C = q.conc, conc = C.raft + C.pile + C.column + C.core + C.slab;
    const steel = C.raft * 0.09 + C.pile * 0.06 + C.column * 0.2 + C.core * 0.12 + C.slab * 0.1;
    const pipes = new Map<Sys, number>();
    for (const p of buildModel().paths) { let L = 0; for (let k = 1; k < p.pts.length; k++) L += p.pts[k].distanceTo(p.pts[k - 1]); pipes.set(p.sys, (pipes.get(p.sys) ?? 0) + L); }
    const Q = (uz: string, ru: string, u: L2, v: number, note?: L2) => this.quantities.push({ name: T(uz, ru), unit: u, value: v, note });
    const m3 = T('m³', 'м³'), t = T('t', 'т'), m2 = T('m²', 'м²'), pc = T('dona', 'шт'), m = T('m', 'м');
    Q('Beton — jami', 'Бетон — всего', m3, conc);
    Q('  poydevor plitasi', '  фундаментная плита', m3, C.raft);
    Q('  qoziqlar', '  сваи', m3, C.pile);
    Q('  ustunlar', '  колонны', m3, C.column);
    Q('  beton yadro', '  ядро жёсткости', m3, C.core);
    Q('  plitalar', '  перекрытия', m3, C.slab);
    Q('Armatura (A500C, A240)', 'Арматура (A500C, A240)', t, steel, T('o‘rtacha sarf koeffitsiyenti bo‘yicha', 'по средним коэффициентам расхода'));
    Q('Gazoblok D500 (tashqi devor)', 'Газоблок D500 (наружные стены)', m3, q.aerated);
    Q('Ichki devorlar', 'Перегородки', m2, q.part);
    Q('Derazalar', 'Окна', pc, q.win);
    Q('  derazalar maydoni', '  площадь окон', m2, q.winA);
    Q('Balkon vitraji', 'Витражи балконов', m2, q.vit);
    Q('Kvartira kirish eshiklari', 'Входные двери квартир', pc, q.dEntry);
    Q('Xona eshiklari', 'Межкомнатные двери', pc, q.dInt);
    Q('Tom maydoni', 'Площадь кровли', m2, q.roof);
    for (const [sys, L] of pipes) Q(`Quvur/kabel: ${SYSTEMS[sys].name[0].toLowerCase()}`, `Трубы/кабели: ${SYSTEMS[sys].name[1].toLowerCase()}`, m, L, T('muhandislik sxemasi bo‘yicha', 'по инженерной схеме'));
  }

  // ---------- state
  setLayers(l: Layer[]) { this.layers = new Set(l); this.apply(); }
  setStage(p: number) { this.stage = Math.max(0, Math.min(STAGE_MAX, p)); this.apply(); }
  setExplode(e: number) { this.explode = clamp01(e); this.apply(); }
  /** f: 0 … 1 across the block's length from the left end; 0 = no cut, the part beyond the cut stays */
  setCut(f: number) {
    if (f <= 0.001) { this.cut.constant = 1e4; return; }
    this.group.updateWorldMatrix(true, false);
    const w = new THREE.Vector3(f * BLOCK_W, 0, 0).applyMatrix4(this.group.matrixWorld);
    this.cut.constant = -w.x;
  }

  private apply() {
    const p = this.stage;
    const kFrame = clamp01((p - 2) / 3) * FLOORS, kWall = clamp01((p - 3.2) / 2.8) * FLOORS;
    const kFacade = clamp01((p - 5.5) / 1) * FLOORS, kWin = clamp01((p - 6.5) / 1) * FLOORS;
    for (const pc of this.pieces) {
      const { mesh, layer, storey: s } = pc;
      let vis = this.layers.has(layer === 'facade' ? 'wall' : layer), grow = 1;
      if (layer === 'found') {
        if (pc.mat === 'pile') { grow = clamp01(p / 0.9); vis &&= p > 0.05; }
        else { grow = clamp01(p - 1); vis &&= p > 1; }
      } else if (layer === 'frame' || layer === 'slab') { vis &&= kFrame > s - 1; grow = clamp01(kFrame - (s - 1)); }
      else if (layer === 'wall') { vis &&= kWall > s - 1; grow = clamp01(kWall - (s - 1)); }
      else if (layer === 'roof') { vis &&= p >= 5; grow = clamp01((p - 5) / 0.5); }
      else if (layer === 'window' || layer === 'door') vis &&= kWin > s - 1;
      mesh.visible = vis;
      // growing pieces rise from their own base (piles grow downward)
      if (layer !== 'window' && layer !== 'door') {
        const base = s === 0 ? -1.4 : s === FLOORS + 1 ? FLOORS * FLOOR_H : (s - 1) * FLOOR_H;
        mesh.scale.y = Math.max(0.001, grow); mesh.position.y = base * (1 - mesh.scale.y);
      }
      // outer faces: facade once applied (and when the facade layer is on), bare blocks before
      if (this.facadeAlt.has(mesh)) {
        const done = this.layers.has('facade') && kFacade > FLOORS - s;   // the facade goes on from the top down
        mesh.material = this.mats.get(done ? 'facade' : 'aerated')!;
        mesh.userData.mat = done ? 'facade' : 'aerated';
      }
    }
    this.floors.forEach((g, i) => (g.position.y = i === 0 ? -this.explode * 3 : this.explode * 2.4 * i));
    this.pit.visible = p < 2.2;
    (this.pit.material as THREE.MeshStandardMaterial).opacity = 0.5 * clamp01((2.2 - p) / 0.6);
  }

  // ---------- picking and rebar
  pick(ray: THREE.Raycaster): ConPick | null {
    const hit = ray.intersectObjects(this.pieces.filter((p) => p.mesh.visible).map((p) => p.mesh), false)[0];
    if (!hit) { this.showRebar(null); return null; }
    const mat = hit.object.userData.mat as MatId, storey = hit.object.userData.storey as number;
    const local = this.floors[storey].worldToLocal(hit.point.clone());
    this.showRebar(MATS[mat].rebar ? { kind: MATS[mat].rebar!, storey, p: local } : null);
    return { mat, storey, point: local };
  }
  /** the reinforcement of the clicked element, drawn through the concrete (x-ray) */
  private showRebar(r: { kind: 'column' | 'slab' | 'pile' | 'wall'; storey: number; p: THREE.Vector3 } | null) {
    if (this.rebar) { this.rebar.parent?.remove(this.rebar); this.rebar.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); this.rebar = null; }
    if (!r) return;
    const bars: THREE.BufferGeometry[] = [], ties: THREE.BufferGeometry[] = [];
    const bar = (a: THREE.Vector3, b: THREE.Vector3, rad: number, list: THREE.BufferGeometry[]) => {
      const d = b.clone().sub(a), L = d.length(); if (L < 1e-3) return;
      const g = new THREE.CylinderGeometry(rad, rad, L, 6).translate(0, L / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
      g.translate(a.x, a.y, a.z); list.push(g);
    };
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const s = r.storey;
    if (r.kind === 'column' || r.kind === 'pile') {
      let cx = r.p.x, cz = r.p.z, y0 = (s - 1) * FLOOR_H, y1 = y0 + FLOOR_H + 0.6;
      if (r.kind === 'column') { const c = this.columns.reduce((b, q) => (Math.hypot(q[0] - r.p.x, q[1] - r.p.z) < Math.hypot(b[0] - r.p.x, b[1] - r.p.z) ? q : b)); cx = c[0]; cz = c[1]; }
      else { cx = Math.round((r.p.x - 0.8) / 3) * 3 + 0.8; cz = Math.round((r.p.z - 0.8) / 3) * 3 + 0.8; y0 = -13.3; y1 = -1.0; }
      const h = r.kind === 'column' ? 0.2 : 0.22;
      const pts = r.kind === 'column' ? [[-h, -h], [0, -h], [h, -h], [h, 0], [h, h], [0, h], [-h, h], [-h, 0]] : Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * h, Math.sin(i * Math.PI / 4) * h]);
      for (const [dx, dz] of pts) bar(V(cx + dx, y0, cz + dz), V(cx + dx, y1, cz + dz), 0.0125, bars);
      for (let y = y0 + 0.1; y < y1; y += r.kind === 'column' ? 0.2 : 0.25) {
        const ring = r.kind === 'column' ? [[-h, -h], [h, -h], [h, h], [-h, h]] : pts;
        for (let i = 0; i < ring.length; i++) bar(V(cx + ring[i][0], y, cz + ring[i][1]), V(cx + ring[(i + 1) % ring.length][0], y, cz + ring[(i + 1) % ring.length][1]), 0.005, ties);
      }
    } else {
      // a 4 × 4 m patch of the two meshes (slab / raft) or of the two wall grids
      const raft = s === 0, y0 = raft ? -1.4 : (s - 1) * FLOOR_H, th = raft ? 1.2 : SLAB;
      const step = 0.2, half = 2, cx = r.p.x, cz = r.p.z;
      if (r.kind === 'wall') {
        const yb = (s - 1) * FLOOR_H + SLAB;
        for (let k = -half; k <= half + 1e-6; k += step) for (const off of [-0.06, 0.06]) {
          bar(V(cx + k, yb, cz + off), V(cx + k, yb + FLOOR_H - SLAB, cz + off), 0.006, bars);
        }
        for (let y = yb; y <= yb + FLOOR_H - SLAB; y += step) for (const off of [-0.06, 0.06]) bar(V(cx - half, y, cz + off), V(cx + half, y, cz + off), 0.006, ties);
      } else {
        const rad = raft ? 0.0125 : 0.006;
        for (const yy of [y0 + 0.04, y0 + th - 0.04]) {
          for (let k = -half; k <= half + 1e-6; k += step) {
            bar(V(cx + k, yy, cz - half), V(cx + k, yy, cz + half), rad, bars);
            bar(V(cx - half, yy + rad * 2, cz + k), V(cx + half, yy + rad * 2, cz + k), rad, ties);
          }
        }
      }
    }
    const g = new THREE.Group();
    const mk = (list: THREE.BufferGeometry[], color: string) => {
      if (!list.length) return;
      const mesh = new THREE.Mesh(mergeGeometries(list), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95, toneMapped: false }));
      mesh.renderOrder = 20; g.add(mesh); list.forEach((x) => x.dispose());
    };
    mk(bars, '#c4642c'); mk(ties, '#e0a15a');
    this.rebar = g;
    this.floors[s].add(g);
  }
  clearPick() { this.showRebar(null); }
  /** element under the ray, no rebar (energy view) */
  pickMat(ray: THREE.Raycaster): ConPick | null {
    const hit = ray.intersectObjects(this.pieces.filter((p) => p.mesh.visible).map((p) => p.mesh), false)[0];
    if (!hit) return null;
    return { mat: hit.object.userData.mat as MatId, storey: hit.object.userData.storey as number, point: hit.point.clone() };
  }
  /** thermal-camera look: every material in a heat-flux colour (null restores the real materials) */
  private skinSaved = new Map<MatId, { c: THREE.Color; map: THREE.Texture | null; e: THREE.Color; ei: number; tr: boolean; op: number }>();
  setThermal(skin: Partial<Record<string, string>> | null) {
    this.showRebar(null);
    for (const [id, m] of this.mats) {
      if (skin) {
        if (!this.skinSaved.has(id)) this.skinSaved.set(id, { c: m.color.clone(), map: m.map, e: m.emissive.clone(), ei: m.emissiveIntensity, tr: m.transparent, op: m.opacity });
        const c = skin[id] ?? '#2c7bb6';
        m.color.set(c); m.map = null; m.emissive.set(c); m.emissiveIntensity = 0.55; m.transparent = false; m.opacity = 1;   // a thermal camera does not see through glass
      } else {
        const sv = this.skinSaved.get(id); if (!sv) continue;
        m.color.copy(sv.c); m.map = sv.map; m.emissive.copy(sv.e); m.emissiveIntensity = sv.ei; m.transparent = sv.tr; m.opacity = sv.op;
      }
      m.needsUpdate = true;
    }
    if (!skin) this.skinSaved.clear();
  }
  dispose() { this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
}

// ---------------------------------------------------------------- small helpers
function pointIn(x: number, y: number, r: Pt[]) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function ringArea(r: Pt[]) { let s = 0; for (let i = 0; i < r.length; i++) { const [a, b] = r[i], [c, d] = r[(i + 1) % r.length]; s += a * d - c * b; } return Math.abs(s) / 2; }

function windowUnit(acc: Acc, x0: number, y0: number, x1: number, y1: number, axis: 'x' | 'y', h0: number, h1: number, frame: MatId) {
  const f = 0.06;
  if (axis === 'x') {
    const z = (y0 + y1) / 2, t = 0.035;
    acc.box(frame, x0, h0, z - t, x1, h0 + f, z + t); acc.box(frame, x0, h1 - f, z - t, x1, h1, z + t);
    acc.box(frame, x0, h0, z - t, x0 + f, h1, z + t); acc.box(frame, x1 - f, h0, z - t, x1, h1, z + t);
    if (x1 - x0 > 1.2) acc.box(frame, (x0 + x1) / 2 - f / 2, h0, z - t, (x0 + x1) / 2 + f / 2, h1, z + t);
    acc.box('glass', x0 + f, h0 + f, z - 0.012, x1 - f, h1 - f, z + 0.012);
  } else {
    const x = (x0 + x1) / 2, t = 0.035;
    acc.box(frame, x - t, h0, y0, x + t, h0 + f, y1); acc.box(frame, x - t, h1 - f, y0, x + t, h1, y1);
    acc.box(frame, x - t, h0, y0, x + t, h1, y0 + f); acc.box(frame, x - t, h0, y1 - f, x + t, h1, y1);
    acc.box('glass', x - 0.012, h0 + f, y0 + f, x + 0.012, h1 - f, y1 - f);
  }
}

function blockTexture(base: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2;
  // 600 × 200 blocks, half-bond: texture = 1.2 m × 0.4 m → two courses
  for (let row = 0; row < 2; row++) {
    const y = row * 64; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
    for (let x = row ? 64 : 0; x < 256; x += 128) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); }
  }
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 128, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(3 / 1.2, 3 / 0.4);                  // uvScale 3 m in Acc → true block size
  return t;
}
function brickTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9cfc2'; g.fillRect(0, 0, 256, 128);
  for (let row = 0; row < 8; row++) for (let x = (row % 2) * 16 - 16; x < 256; x += 32) {
    g.fillStyle = ['#b5654a', '#a85a40', '#bf7055', '#9e5139'][Math.floor(Math.random() * 4)];
    g.fillRect(x + 1, row * 16 + 1, 30, 14);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(3 / 2.0, 3 / 0.6);
  return t;
}
