// WBP_Block — the web app's block page (src/block/BlockView.tsx + ui/block.css) rebuilt in UMG, web style first.
//   top      brand glass (logo, OBOD MASKAN, "N-blok · 4-tip · 16 qavat"), UZ/RU, "← Majmua"
//   nav      bottom centre: Bino · Kvartiralar · Qavatlar · Joylashuv · Sizga yaqin · Galereya · Raqamlarda
//   panel    right glass (350 px): Bino (facts, status bar, views, entrance), Qavatlar (16 storeys with flat bars; the
//            picked storey opens its flats and cuts block 2), Raqamlarda (stats, mix); the rest: "keyingi bosqichda"
//   card     left: flat (status badge, №, m² / rooms / storey, price, rooms from the drawing, "Ichkarida sayr")
//   walk     "Ichkarida sayr" / "Podyezdga kirish" / "Qavatda sayr" put the player in walkable block 2 (web id 2)
// Data: tools/unreal/out/sales.json (node tools/unreal/sales_export.mjs).   node block_ui.mjs   (from tools/unreal/ue_graphs)
import fs from 'node:fs';
import { init, call, py, ref, UMG } from './ue.mjs';
import { widget, dsl, C, WHITE, NONE, pad, lc, rbox, USD_FN, relinkCtl } from './ui_lib.mjs';
import { BP as BP_ } from './ue.mjs';
await init();
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
const D = JSON.parse(fs.readFileSync(new URL('../out/sales.json', import.meta.url), 'utf8'));
const NAME = 'WBP_Block', DIR = '/Game/Blok1/UI';
const MODE = process.argv[2] || 'full';
const FNS = MODE !== 'full';                    // 'fns': logic only; 'apts': add the Kvartiralar section, then logic
const U = await widget(DIR, NAME, !FNS);
const { add, set, box, text, slot, canvas, sizeBox, button, glass } = U;

// web block.css palette
const INK = C('#f4f1ea'), MUT = C('#a7beb3'), GOLD = C('#e2c785'), BG2 = C('#0a271d'), LINE = C('#ffffff', 0.11), DARKT = C('#102018');
const ST = { free: C('#4fbf7f'), reserved: C('#e8b04b'), sold: C('#e0675f') };
const SECS = [['bino', 'Bino'], ['kvartiralar', 'Kvartiralar'], ['qavatlar', 'Qavatlar'], ['joylashuv', 'Joylashuv'], ['yaqin', 'Sizga yaqin'], ['galereya', 'Galereya'], ['raqamlar', 'Raqamlarda']];
const PW = 318;                                  // panel body width (350 - 2 x 16)
const WALK_HALL = [15.4, 11.9];                  // plan point in front of the lifts (lift hall), metres

// ---------- Kvartiralar (web AptsPanel): rooms / status chips, area / storey / price ranges, found count, the list
const QN = 20;                                   // list rows per page
const QCLICKS = ['QR1', 'QR2', 'QR3', 'QS0', 'QS1', 'QS2', 'QReset', 'QPrev', 'QNext', ...Array.from({ length: QN }, (_, k) => `QL${k}`)];
async function buildApts(bodyV, tpl) {
  const h4 = async (name, parent, s_, top = 16) => { const t = await text(name, parent, s_.toUpperCase(), 11, MUT, 'Bold', false, { ls: 100 }); await slot(t, pad(0, top, 0, 8)); return t; };
  const chip = async (name, parent, label, sq = null) => {
    const b = await button(name, parent, { r: 10, padX: 12, padY: 8, fill: NONE, hover: C('#ffffff', 0.04), line: LINE });
    await slot(b, pad(0, 0, 6, 0), null, 'HAlign_Left');
    const hb = await add('HorizontalBox', name + 'H', b);
    if (sq) { const q = await sizeBox(name + 'Q', hb, 10, 10); await slot(q, pad(0, 0, 7, 0), null, 'HAlign_Left', 'VAlign_Center'); await box(name + 'QC', q, sq, 3, pad(0)); }
    const t = await text(name + 'T', hb, label, 13, MUT, 'Regular', true);
    await slot(t, pad(0), null, 'HAlign_Left', 'VAlign_Center');
  };
  const range = async (p, parent, title, lo, hi) => {
    await h4(`H4${p}`, parent, title);
    const vals = await add('HorizontalBox', `${p}V`, parent);
    const a = await text(`${p}Lo`, vals, lo, 13, INK, 'Bold', true); await slot(a, pad(0), 1, 'HAlign_Left');
    const b = await text(`${p}Hi`, vals, hi, 13, INK, 'Bold', true); await slot(b, pad(0), null, 'HAlign_Right');
    for (const [k, v] of [['Min', 0], ['Max', 1]]) {
      const sl = await add('Slider', `Sl${p}${k}`, parent, true);
      await set(sl.widget, { Value: v, SliderBarColor: C('#ffffff', 0.18), SliderHandleColor: GOLD, IndentHandle: false });
      await slot(sl, pad(0, k === 'Min' ? 4 : 0, 0, 0));
    }
  };
  const sA = await add('VerticalBox', 'SApts', bodyV, true);
  await h4('H4QR', sA, 'Xona', 2);
  const rr = await add('HorizontalBox', 'QRRow', sA);
  for (const r of [1, 2, 3]) await chip(`QR${r}`, rr, `${r}-xonali`);
  await h4('H4QS', sA, 'Holat');
  const sr = await add('HorizontalBox', 'QSRow', sA);
  for (const [i, [key, l]] of [['free', 'Sotuvda'], ['reserved', 'Bron'], ['sold', 'Sotilgan']].entries()) await chip(`QS${i}`, sr, l, ST[key]);
  await range('QA', sA, 'Maydon, m²', '40', '86');
  await range('QF', sA, 'Qavat', '2', '16');
  await range('QP', sA, 'Narx', '$35k', '$86k');
  const fl = await sizeBox('QLine', sA, null, 1); await slot(fl, pad(0, 14, 0, 0)); await box('QLineC', fl, LINE, 0, pad(0));
  const fr = await add('HorizontalBox', 'QFRow', sA); await slot(fr, pad(0, 12, 0, 0));
  const ft = await text('QFound', fr, 'Topildi: 61 / 105', 13, INK, 'Regular', true); await slot(ft, pad(0), 1, 'HAlign_Left', 'VAlign_Center');
  const rb = await button('QReset', fr, { r: 6, padX: 4, padY: 2, fill: NONE, hover: C('#ffffff', 0.06) });
  await slot(rb, pad(0), null, 'HAlign_Right', 'VAlign_Center');
  await text('QResetT', rb, 'Tozalash', 12, GOLD);
  const list = await add('VerticalBox', 'QList', sA); await slot(list, pad(0, 8, 0, 0));
  for (let k = 0; k < QN; k++) {
    const b = await button(`QL${k}`, list, { r: 10, padX: 10, padY: 9, fill: C('#ffffff', 0.03), hover: C('#ffffff', 0.09) });
    await slot(b, pad(0, k ? 4 : 0, 0, 0));
    const hb = await add('HorizontalBox', `QL${k}H`, b);
    const sq = await sizeBox(`QL${k}Q`, hb, 10, 10); await slot(sq, pad(0, 0, 8, 0), null, 'HAlign_Left', 'VAlign_Center');
    await box(`QL${k}S`, sq, ST.free, 3, pad(0), null, true);
    for (const [c, w, color, wt, just] of [['N', 58, INK, 'Bold', 'Left'], ['R', null, MUT, 'Regular', 'Left'], ['A', 52, INK, 'Regular', 'Right'], ['P', 70, INK, 'Regular', 'Right']]) {
      if (w) { const z = await sizeBox(`QL${k}${c}S`, hb, w, null); await slot(z, pad(c === 'N' ? 0 : 8, 0, 0, 0), null, 'HAlign_Left', 'VAlign_Center'); await text(`QL${k}${c}`, z, '', 12.5, color, wt, true, { just }); }
      else { const t = await text(`QL${k}${c}`, hb, '', 12.5, color, wt, true); await slot(t, pad(8, 0, 0, 0), 1, 'HAlign_Left', 'VAlign_Center'); }
    }
  }
  const pg = await add('HorizontalBox', 'QPager', sA, true); await slot(pg, pad(0, 8, 0, 0), null, 'HAlign_Center');
  for (const n of ['QPrev', 'QPage', 'QNext']) {
    if (n === 'QPage') { const t = await text('QPage', pg, '1–20 / 61', 12.5, MUT, 'Regular', true); await slot(t, pad(10, 0), null, 'HAlign_Center', 'VAlign_Center'); continue; }
    const b = await button(n, pg, { r: 8, padX: 12, padY: 4, fill: C('#ffffff', 0.06), hover: C('#ffffff', 0.12), line: LINE });
    await text(n + 'T', b, n === 'QPrev' ? '‹' : '›', 16, INK, 'Bold');
  }
  await button('TplChOn', tpl, { r: 10, padX: 12, padY: 8, fill: C('#e2c785', 0.12), hover: C('#e2c785', 0.16), line: GOLD }, false);
  await button('TplChOff', tpl, { r: 10, padX: 12, padY: 8, fill: NONE, hover: C('#ffffff', 0.04), line: LINE }, false);
}

// ---------- time of day (web .b-time): the 7 stops of src/three/timeStops.ts
const HOURS = [4, 7, 10, 13, 16, 19, 23];
const HOUR_NAMES = { 4: 'Tong oldi', 7: 'Erta tong', 10: 'Ertalab', 13: 'Tush', 16: 'Tushdan keyin', 19: 'Oltin soat', 23: 'Tun' };
async function buildTime(page, tpl) {
  const { blur: tb, g: tg } = await glass('Time', page, 16, pad(14, 8, 14, 10));
  await canvas(tb, { Left: 0, Top: 14, Right: 440, Bottom: 0 }, { Minimum: { X: 0.5, Y: 0 }, Maximum: { X: 0.5, Y: 0 } }, { X: 0.5, Y: 0 }, true);
  const tv = await add('VerticalBox', 'TimeV', tg);
  const hr = await add('HorizontalBox', 'Hours', tv);
  for (const [i, h] of HOURS.entries()) {
    const b = await button(`HR${h}`, hr, { r: 9, padX: 4, padY: 7, fill: h === 13 ? GOLD : NONE, hover: h === 13 ? GOLD : C('#ffffff', 0.05) });
    await slot(b, pad(i ? 1 : 0, 0, i < HOURS.length - 1 ? 1 : 0, 0), 1);
    await text(`HR${h}T`, b, `${String(h).padStart(2, '0')}:00`, 12.5, h === 13 ? BG2 : MUT, 'Bold', true, { just: 'Center' });
  }
  const sn = await text('StopName', tv, 'Tush', 12, GOLD, 'Regular', true, { just: 'Center', ls: 20 });
  await slot(sn, pad(0, 5, 0, 0), null, 'HAlign_Center');
  await button('TplHrOn', tpl, { r: 9, padX: 4, padY: 7, fill: GOLD, hover: GOLD }, false);
  await button('TplHrOff', tpl, { r: 9, padX: 4, padY: 7, fill: NONE, hover: C('#ffffff', 0.05) }, false);
}

// ---------- Joylashuv (SitePanel), Sizga yaqin (NearbyPanel + map), Galereya (GalleryPanel + Lightbox)
const GW = 310;                                    // image width in the panel body
const SITE_H = Math.round(GW * 820 / 740), SAT_H = Math.round(GW * D.sat.h / D.sat.w);
const GAL = D.gallery, CATS = D.cats, GCATS = D.galCats;
const texOf = (src, thumb) => { const f = (thumb ? src.replace('gal/t/', '') : src.replace('gal/', '').replace('pdf/b1-p2', 'b1')).replace('.jpg', ''); return `/Game/Blok1/UI/Gal/T_G${thumb ? 'T' : ''}${f}.T_G${thumb ? 'T' : ''}${f}`; };
const MORE_CLICKS = ['NC0', ...CATS.map((_, i) => `NC${i + 1}`), 'GC0', ...GCATS.map((_, i) => `GC${i + 1}`), ...GAL.map((_, i) => `GI${i}`), 'LbPrev', 'LbNext', 'LbClose'];
async function buildMore(bodyV, root, tpl) {
  const note = async (name, parent, s_, isVar = false, top = 10) => { const t = await text(name, parent, s_, 12, MUT, 'Regular', isVar, { wrap: true }); await slot(t, pad(0, top, 0, 0)); return t; };
  const chip = async (name, parent, label, sq = null, isVarT = true) => {
    const b = await button(name, parent, { r: 10, padX: 12, padY: 8, fill: NONE, hover: C('#ffffff', 0.04), line: LINE });
    await slot(b, pad(0, 0, 6, 0), null, 'HAlign_Left');
    const hb = await add('HorizontalBox', name + 'H', b);
    if (sq) { const q = await sizeBox(name + 'Q', hb, 10, 10); await slot(q, pad(0, 0, 7, 0), null, 'HAlign_Left', 'VAlign_Center'); await box(name + 'QC', q, sq, 3, pad(0)); }
    const t = await text(name + 'T', hb, label, 13, MUT, 'Regular', isVarT);
    await slot(t, pad(0), null, 'HAlign_Left', 'VAlign_Center');
  };
  const img = async (name, parent, tex, w, h, isVar = false) => {
    const sb = await sizeBox(name + 'SB', parent, w, h, isVar);
    const im = await add('Image', name, sb, isVar);
    await set(im.widget, { Brush: { ResourceObject: tex, ImageSize: { X: w, Y: h }, DrawAs: 'Image', TintColor: { SpecifiedColor: WHITE } } });
    return { sb, im };
  };
  // --- Joylashuv
  const sS = await add('VerticalBox', 'SSite', bodyV, true);
  const ar = await add('HorizontalBox', 'Addr', sS);
  const pin = await sizeBox('AddrPin', ar, 10, 10); await slot(pin, pad(0, 4, 10, 0), null, 'HAlign_Left', 'VAlign_Top'); await box('AddrPinC', pin, GOLD, 5, pad(0));
  const at = await text('AddrT', ar, D.address, 13, INK, 'Regular', false, { wrap: true }); await slot(at, pad(0), 1);
  const sp_ = await box('SitePlanB', sS, C('#ffffff', 0.04), 12, pad(4), LINE); await slot(sp_, pad(0, 12, 0, 0), null, 'HAlign_Left');
  const spc = await sizeBox('SitePlanS', sp_, GW, SITE_H);
  const cv = await add('CanvasPanel', 'SiteCanvas', spc);
  const pl = await add('Image', 'SitePlan', cv);
  await set(pl.widget, { Brush: { ResourceObject: '/Game/Blok1/UI/Gal/T_Plan.T_Plan', ImageSize: { X: GW, Y: SITE_H }, DrawAs: 'Image', TintColor: { SpecifiedColor: WHITE } } });
  await canvas(pl, pad(0), { Minimum: { X: 0, Y: 0 }, Maximum: { X: 1, Y: 1 } });
  const mk = await box('SiteMk', cv, GOLD, 8, pad(0), C('#0a271d'), true);
  await set(mk.widget, { Background: rbox(WHITE, 8, C('#0a271d'), 3) });
  await canvas(mk, { Left: 0, Top: 0, Right: 16, Bottom: 16 }, { Minimum: { X: 0, Y: 0 }, Maximum: { X: 0, Y: 0 } }, { X: 0.5, Y: 0.5 });
  await note('SiteNote', sS, '2-blok general planda belgilangan.', true);
  const st = await add('HorizontalBox', 'SiteStats', sS); await slot(st, pad(0, 10, 0, 0));
  for (const [i, [v, l]] of [['3,22 ga', 'yer maydoni'], ['20', 'blok']].entries()) {
    const k = await box(`SiteSt${i}`, st, C('#ffffff', 0.04), 12, pad(13), LINE); await slot(k, pad(i ? 4 : 0, 0, i ? 0 : 4, 0), 1);
    const vb = await add('VerticalBox', `SiteSt${i}V`, k);
    await text(`SiteSt${i}B`, vb, v, 21, GOLD, 'Bold'); await text(`SiteSt${i}S`, vb, l, 11.5, MUT);
  }
  // --- Sizga yaqin
  const sN = await add('VerticalBox', 'SNear', bodyV, true);
  const nw = await add('WrapBox', 'NChips', sN);
  await set(nw.widget, { InnerSlotPadding: { X: 6, Y: 6 }, WrapSize: GW + 8, bExplicitWrapSize: true });
  await chip('NC0', nw, 'Hammasi');
  for (const [i, [, label, color]] of CATS.entries()) await chip(`NC${i + 1}`, nw, label, C(color));
  const mb = await box('NMapB', sN, C('#ffffff', 0.04), 12, pad(4), LINE); await slot(mb, pad(0, 12, 0, 0), null, 'HAlign_Left');
  const ms = await sizeBox('NMapS', mb, GW, SAT_H);
  const mc = await add('CanvasPanel', 'NMap', ms);
  const sat = await add('Image', 'NSat', mc);
  await set(sat.widget, { Brush: { ResourceObject: '/Game/Blok1/UI/Gal/T_Sat.T_Sat', ImageSize: { X: GW, Y: SAT_H }, DrawAs: 'Image', TintColor: { SpecifiedColor: WHITE } } });
  await canvas(sat, pad(0), { Minimum: { X: 0, Y: 0 }, Maximum: { X: 1, Y: 1 } });
  const k_ = GW / D.sat.w;
  const ctr = await box('NCtr', mc, GOLD, 7, pad(0), C('#0a271d'));
  await set(ctr.widget, { Background: rbox(WHITE, 7, C('#0a271d'), 2) });
  await canvas(ctr, { Left: D.sat.centre[0] * k_, Top: D.sat.centre[1] * k_, Right: 14, Bottom: 14 }, { Minimum: { X: 0, Y: 0 }, Maximum: { X: 0, Y: 0 } }, { X: 0.5, Y: 0.5 });
  for (const [i, p] of D.places.entries()) {
    const color = CATS.find((c) => c[0] === p.cat)[2];
    const m = await box(`NM${i}`, mc, C(color), 9, pad(0), C('#ffffff'), true);
    await set(m.widget, { Background: rbox(WHITE, 9, C('#ffffff'), 1.5), HorizontalAlignment: 'HAlign_Center', VerticalAlignment: 'VAlign_Center' });
    await canvas(m, { Left: p.px[0] * k_, Top: p.px[1] * k_, Right: 18, Bottom: 18 }, { Minimum: { X: 0, Y: 0 }, Maximum: { X: 0, Y: 0 } }, { X: 0.5, Y: 0.5 });
    await text(`NM${i}T`, m, String(p.n), 9.5, C('#0a271d'), 'Bold');
  }
  const nl = await add('VerticalBox', 'NList', sN); await slot(nl, pad(0, 12, 0, 0));
  for (const [i, p] of D.places.entries()) {
    const color = CATS.find((c) => c[0] === p.cat)[2];
    const r = await box(`NL${i}`, nl, C('#ffffff', 0.03), 10, pad(10, 8), null, true); await slot(r, pad(0, i ? 4 : 0, 0, 0));
    const hb = await add('HorizontalBox', `NL${i}H`, r);
    const bd = await sizeBox(`NL${i}BS`, hb, 22, 22); await slot(bd, pad(0, 0, 10, 0), null, 'HAlign_Left', 'VAlign_Center');
    const bb_ = await box(`NL${i}B`, bd, C(color), 7, pad(0));
    await set(bb_.widget, { HorizontalAlignment: 'HAlign_Center', VerticalAlignment: 'VAlign_Center' });
    await text(`NL${i}BT`, bb_, String(p.n), 11, C('#0a271d'), 'Bold');
    const nm = await text(`NL${i}N`, hb, p.uz, 12.5, INK, 'Regular', false, { wrap: true }); await slot(nm, pad(0, 0, 8, 0), 1, 'HAlign_Fill', 'VAlign_Center');
    const dv = await add('VerticalBox', `NL${i}D`, hb); await slot(dv, pad(0), null, 'HAlign_Right', 'VAlign_Center');
    const d1 = await text(`NL${i}M`, dv, p.m >= 1000 ? `${(p.m / 1000).toFixed(1)} km` : `${p.m} m`, 12.5, INK, 'Bold', false, { just: 'Right' }); await slot(d1, pad(0), null, 'HAlign_Right');
    const d2 = await text(`NL${i}T`, dv, `${p.min} daq`, 11, MUT, 'Regular', false, { just: 'Right' }); await slot(d2, pad(0), null, 'HAlign_Right');
  }
  await note('NNote', sN, 'Masofa majmua markazidan to‘g‘ri chiziq bo‘yicha. Piyoda vaqt ko‘chalar 30 % uzunroq va 80 m/daq tezlik bilan hisoblangan.');
  // --- Galereya
  const sG = await add('VerticalBox', 'SGal', bodyV, true);
  const gw = await add('WrapBox', 'GChips', sG);
  await set(gw.widget, { InnerSlotPadding: { X: 6, Y: 6 }, WrapSize: GW + 8, bExplicitWrapSize: true });
  await chip('GC0', gw, 'Hammasi');
  for (const [i, [, label]] of GCATS.entries()) await chip(`GC${i + 1}`, gw, label);
  const grid = await add('WrapBox', 'GGrid', sG); await slot(grid, pad(0, 12, 0, 0));
  await set(grid.widget, { InnerSlotPadding: { X: 6, Y: 6 }, WrapSize: 320, bExplicitWrapSize: true });
  for (const [i, g] of GAL.entries()) {
    const b = await button(`GI${i}`, grid, { r: 10, padX: 0, padY: 0, fill: C('#ffffff', 0.04), hover: C('#ffffff', 0.1), line: LINE });
    const v = await add('VerticalBox', `GI${i}V`, b);
    const { sb } = await img(`GI${i}I`, v, texOf(g.thumb, true), 148, 83, true);   // + 4 px button-slot padding each side: 2 x 156 + 6 = 318
    const cap = await text(`GI${i}C`, v, g.uz, 11, INK, 'Regular', false, { wrap: true }); await slot(cap, pad(6, 4, 6, 6));
    await set(cap.widget, { AutoWrapText: false, WrapTextAt: 136 });   // a wrapping caption asks for its full width: 2 columns need a fixed wrap
  }
  await note('GNote', sG, 'Vizualizatsiyalar Art House taqdimotidan olingan. Rasmni bosing — to‘liq ekranda ochiladi.');
  // --- lightbox (over everything)
  const lb = await box('LB', root, C('#061610', 0.93), 0, pad(0), null, true);
  await canvas(lb, pad(0), { Minimum: { X: 0, Y: 0 }, Maximum: { X: 1, Y: 1 } });
  await set(lb.widget, { Visibility: 'Collapsed' });
  const lo = await add('Overlay', 'LBO', lb);
  const lv = await add('VerticalBox', 'LBV', lo); await set(lv.slot, { HorizontalAlignment: 'HAlign_Center', VerticalAlignment: 'VAlign_Center' });
  const { sb: lis } = await img('LBImg', lv, texOf('gal/06.jpg', false), 1100, 619, true);
  const lc_ = await text('LBCap', lv, '', 13, MUT, 'Regular', true, { just: 'Center' }); await slot(lc_, pad(0, 8, 0, 0), null, 'HAlign_Center');
  for (const [n, l, h] of [['LbPrev', '‹', 'HAlign_Left'], ['LbNext', '›', 'HAlign_Right'], ['LbClose', '✕', 'HAlign_Right']]) {
    const b = await button(n, lo, { r: 23, padX: 16, padY: 8, fill: C('#000000', 0.45), hover: C('#000000', 0.65) });
    await set(b.slot, { HorizontalAlignment: h, VerticalAlignment: n === 'LbClose' ? 'VAlign_Top' : 'VAlign_Center', Padding: pad(24) });
    await text(n + 'T', b, l, n === 'LbClose' ? 18 : 26, INK, 'Bold');
  }
}

if (!FNS) {
  const root = await add('CanvasPanel', 'Root');
  const page = await add('CanvasPanel', 'Page', root, true);
  await canvas(page, pad(0), { Minimum: { X: 0, Y: 0 }, Maximum: { X: 1, Y: 1 } });

  // ---------- top: brand (left), language + back (right)
  const { blur: bb, g: brand } = await glass('Brand', page, 14, pad(10, 8, 16, 8));
  await canvas(bb, { Left: 18, Top: 14, Right: 0, Bottom: 0 }, { Minimum: { X: 0, Y: 0 }, Maximum: { X: 0, Y: 0 } }, { X: 0, Y: 0 }, true);
  const bh = await add('HorizontalBox', 'BrandH', brand);
  const logoSb = await sizeBox('LogoSB', bh, 36, 46);
  await slot(logoSb, pad(0, 0, 12, 0), null, 'HAlign_Left', 'VAlign_Center');
  const logo = await add('Image', 'Logo', logoSb);
  await set(logo.widget, { Brush: { ResourceObject: '/Game/Blok1/UI/T_Logo.T_Logo', ImageSize: { X: 36, Y: 46 }, DrawAs: 'Image', TintColor: { SpecifiedColor: WHITE } } });
  const bv = await add('VerticalBox', 'BrandV', bh);
  await slot(bv, pad(0), null, 'HAlign_Left', 'VAlign_Center');
  await text('BrandT', bv, 'OBOD MASKAN', 15, INK, 'Bold', false, { ls: 160 });
  const bs = await text('BrandS', bv, '2-blok · 4-tip · 16 qavat', 11.5, GOLD, 'Regular', true, { ls: 40 });
  await slot(bs, pad(0, 2, 0, 0));

  const right = await add('HorizontalBox', 'TopR', page);
  await canvas(right, { Left: -18, Top: 14, Right: 0, Bottom: 0 }, { Minimum: { X: 1, Y: 0 }, Maximum: { X: 1, Y: 0 } }, { X: 1, Y: 0 }, true);
  const { blur: lb, g: lang } = await glass('Lang', right, 12, pad(4));
  await slot(lb, pad(0, 0, 8, 0), null, 'HAlign_Left', 'VAlign_Top');
  const lh = await add('HorizontalBox', 'LangH', lang);
  for (const [n, l] of [['LangUz', 'UZ'], ['LangRu', 'RU']]) {
    const b = await button(n, lh, { r: 9, padX: 10, padY: 7, fill: n === 'LangUz' ? GOLD : NONE, hover: n === 'LangUz' ? GOLD : C('#ffffff', 0.08) });
    await text(n + 'T', b, l, 12, n === 'LangUz' ? BG2 : MUT, 'Bold', false, { ls: 60 });
  }
  const { blur: kb, g: backG } = await glass('BackG', right, 12, pad(0));
  await slot(kb, pad(0), null, 'HAlign_Left', 'VAlign_Top');
  const back = await button('BackB', backG, { r: 12, padX: 14, padY: 11, fill: NONE, hover: C('#ffffff', 0.1) });
  await text('BackT', back, '←  Majmua', 13, INK, 'Regular');

  // ---------- bottom nav
  const { blur: nb, g: nav } = await glass('Nav', page, 18, pad(6));
  await canvas(nb, { Left: 0, Top: -16, Right: 0, Bottom: 0 }, { Minimum: { X: 0.5, Y: 1 }, Maximum: { X: 0.5, Y: 1 } }, { X: 0.5, Y: 1 }, true);
  const nh = await add('HorizontalBox', 'NavH', nav);
  for (const [i, [, label]] of SECS.entries()) {
    const b = await button(`N${i}`, nh, { r: 13, padX: 14, padY: 10, fill: i === 0 ? GOLD : NONE, hover: C('#ffffff', 0.06) });
    await slot(b, pad(i ? 1 : 0, 0, i < SECS.length - 1 ? 1 : 0, 0));
    await text(`N${i}T`, b, label, 13, i === 0 ? BG2 : MUT, i === 0 ? 'Bold' : 'Regular', true);
  }

  // ---------- side panel (right)
  const { blur: pb, g: panel } = await glass('Panel', page, 16, pad(0));
  await canvas(pb, { Left: -366, Top: 84, Right: 350, Bottom: 92 }, { Minimum: { X: 1, Y: 0 }, Maximum: { X: 1, Y: 1 } });
  const pv = await add('VerticalBox', 'PanelV', panel);
  const ph = await box('PHead', pv, NONE, 0, pad(18, 12, 10, 8));
  await text('PTitle', ph, 'Bino', 15, INK, 'Bold', true, { ls: 20 });
  const pl = await sizeBox('PLine', pv, null, 1);
  await box('PLineC', pl, LINE, 0, pad(0));
  const sc = await add('ScrollBox', 'PScroll', pv);
  await slot(sc, pad(0), 1);
  await set(sc.widget, { ScrollBarThickness: { X: 4, Y: 4 }, ScrollbarPadding: pad(0, 4, 2, 4) });
  const body = await box('PBody', sc, NONE, 0, pad(16, 14, 16, 16));
  const bodyV = await add('VerticalBox', 'BodyV', body);

  const h4 = async (name, parent, s, top = 16, isVar = false) => { const t = await text(name, parent, s.toUpperCase(), 11, MUT, 'Bold', isVar, { ls: 100 }); await slot(t, pad(0, top, 0, 8)); return t; };
  const note = async (name, parent, s, isVar = false, top = 10) => { const t = await text(name, parent, s, 12, MUT, 'Regular', isVar, { wrap: true }); await slot(t, pad(0, top, 0, 0)); return t; };
  const facts = async (prefix, parent, vals, top = 4) => {
    const row = await add('HorizontalBox', prefix + 'Row', parent);
    await slot(row, pad(0, top, 0, 12));
    for (let i = 0; i < 3; i++) {
      const k = await box(`${prefix}${i}`, row, C('#ffffff', 0.05), 10, pad(6, 9), LINE);
      await slot(k, pad(i ? 3 : 0, 0, i < 2 ? 3 : 0, 0), 1);
      const v = await add('VerticalBox', `${prefix}${i}V`, k);
      const b = await text(`${prefix}${i}B`, v, vals[i][0], 17, INK, 'Bold', true, { just: 'Center' });
      await slot(b, pad(0), null, 'HAlign_Center');
      const s = await text(`${prefix}${i}S`, v, vals[i][1], 11, MUT, 'Regular', false, { just: 'Center' });
      await slot(s, pad(0), null, 'HAlign_Center');
    }
  };
  const btn = async (name, parent, label, gold = false, top = 0) => {
    const b = await button(name, parent, { r: 12, padX: 12, padY: 11, fill: gold ? GOLD : C('#ffffff', 0.06), hover: gold ? C('#ecd59c') : C('#ffffff', 0.12), line: gold ? GOLD : LINE });
    await slot(b, pad(0, top, 0, 0));
    await text(name + 'T', b, label, 13, gold ? BG2 : INK, 'Bold', false, { just: 'Center' });
    await set(b.slot, { HorizontalAlignment: 'HAlign_Fill' });
    return b;
  };

  // --- Bino
  const sBino = await add('VerticalBox', 'SBino', bodyV, true);
  await facts('BF', sBino, [['16', 'qavat'], ['105', 'xonadon'], ['3', 'magazin']]);
  const sbar = await add('HorizontalBox', 'StatBar', sBino);
  await slot(sbar, pad(0, 6, 0, 0));
  for (const [k, key] of [['F', 'free'], ['R', 'reserved'], ['S', 'sold']]) {
    const s = await sizeBox(`SB${k}`, sbar, 100, 26, true);
    const c = await box(`SB${k}C`, s, ST[key], k === 'F' ? 9 : k === 'S' ? 9 : 0, pad(0));
    await set(c.widget, { HorizontalAlignment: 'HAlign_Center', VerticalAlignment: 'VAlign_Center' });
    await text(`SB${k}T`, c, '0', 12, DARKT, 'Bold', true);
  }
  const leg = await add('HorizontalBox', 'Leg', sBino);
  await slot(leg, pad(0, 10, 0, 4));
  for (const [k, key, label] of [['F', 'free', 'Sotuvda'], ['R', 'reserved', 'Bron'], ['S', 'sold', 'Sotilgan']]) {
    const d = await sizeBox(`LG${k}`, leg, 10, 10);
    await slot(d, pad(0, 0, 6, 0), null, 'HAlign_Left', 'VAlign_Center');
    await box(`LG${k}C`, d, ST[key], 3, pad(0));
    const t = await text(`LG${k}T`, leg, label, 12, MUT);
    await slot(t, pad(0, 0, 14, 0), null, 'HAlign_Left', 'VAlign_Center');
  }
  await h4('H4V', sBino, 'Ko‘rinishlar');
  for (const [ri, row] of [[['VRender', 'Render burchagi'], ['VCourt', 'Hovli tomoni']], [['VSide', 'Yon tomondan'], ['VTop', 'Yuqoridan']]].entries()) {
    const hb = await add('HorizontalBox', `VRow${ri}`, sBino);
    await slot(hb, pad(0, ri ? 6 : 0, 0, 0));
    for (const [ci, [n, l]] of row.entries()) { const b = await btn(n, hb, l); await slot(b, pad(ci ? 3 : 0, 0, ci ? 0 : 3, 0), 1); }
  }
  await btn('Podyezd', sBino, '🚶  Podyezdga kirish', true, 12);
  await note('BNote', sBino, '1-blok PDF chizmalaridan 1:1: devorlar, derazalar, balkonlar va fasad renderdan.', true);

  // --- Qavatlar
  const sFl = await add('VerticalBox', 'SFloors', bodyV, true);
  await note('FPick', sFl, 'Qavatni tanlang: bino shu qavatdan kesiladi va mebelli reja ko‘rinadi.', false, 0);
  const flist = await add('VerticalBox', 'FList', sFl, true);
  await slot(flist, pad(0, 10, 0, 0));
  for (let f = 16; f >= 1; f--) {
    const w = await box(`FW${f}`, flist, NONE, 0, pad(0, 0, 0, 6), null, true);
    const b = await button(`FL${f}`, w, { r: 12, padX: 12, padY: 9, fill: NONE, hover: C('#ffffff', 0.05), line: LINE });
    const hb = await add('HorizontalBox', `FL${f}H`, b);
    const ns = await sizeBox(`FL${f}NS`, hb, 38, null);
    await slot(ns, pad(0, 0, 10, 0), null, 'HAlign_Left', 'VAlign_Center');
    await text(`FL${f}N`, ns, String(f), 20, INK, 'Bold');
    const info = await text(`FL${f}I`, hb, '', 11.5, MUT, 'Regular', true, { wrap: true });
    await slot(info, pad(0), 1, 'HAlign_Left', 'VAlign_Center');
    const bars = await add('HorizontalBox', `FL${f}B`, hb);
    await slot(bars, pad(0), null, 'HAlign_Right', 'VAlign_Center');
    for (let k = 0; k < 7; k++) {
      const s = await sizeBox(`FL${f}S${k}`, bars, 6, 18, true);
      await slot(s, pad(k ? 2 : 0, 0, 0, 0));
      await box(`FL${f}C${k}`, s, ST.free, 3, pad(0), null, true);
    }
  }
  const det = await add('VerticalBox', 'FDet', flist, true);
  await btn('FWalk', det, '🚶  Qavatda sayr', true, 2);
  const fnote = await note('FNote', det, '1-qavat: 3 ta magazin (117.70, 122.0, 149.30 m²), kirish lobbisi, zina va 2 lift.', true, 8);
  const alist = await add('VerticalBox', 'AList', det, true);
  await slot(alist, pad(0, 8, 0, 6));
  for (let k = 0; k < 7; k++) {
    const b = await button(`AI${k}`, alist, { r: 10, padX: 10, padY: 9, fill: C('#ffffff', 0.03), hover: C('#ffffff', 0.09) });
    await slot(b, pad(0, k ? 4 : 0, 0, 0));
    const hb = await add('HorizontalBox', `AI${k}H`, b);
    const sq = await sizeBox(`AI${k}Q`, hb, 10, 10);
    await slot(sq, pad(0, 0, 8, 0), null, 'HAlign_Left', 'VAlign_Center');
    await box(`AI${k}S`, sq, ST.free, 3, pad(0), null, true);
    for (const [c, w, color, wt, just] of [['N', 50, INK, 'Bold', 'Left'], ['R', null, MUT, 'Regular', 'Left'], ['A', 62, INK, 'Regular', 'Right'], ['P', 74, INK, 'Regular', 'Right']]) {
      if (w) {
        const s = await sizeBox(`AI${k}${c}S`, hb, w, null);
        await slot(s, pad(c === 'N' ? 0 : 8, 0, 0, 0), null, 'HAlign_Left', 'VAlign_Center');
        await text(`AI${k}${c}`, s, '', 12.5, color, wt, true, { just });
      } else {
        const t = await text(`AI${k}${c}`, hb, '', 12.5, color, wt, true);
        await slot(t, pad(8, 0, 0, 0), 1, 'HAlign_Left', 'VAlign_Center');
      }
    }
  }
  await note('FEmpty', sFl, 'Bu blokning qavat rejalari hali yuklanmagan. PDF kelgach, qavatlar va ichki ko‘rinish yoqiladi.', true, 4);

  // --- Raqamlarda
  const sSt = await add('VerticalBox', 'SStats', bodyV, true);
  const stats = async (prefix, parent, vals) => {
    for (let r = 0; r < vals.length / 2; r++) {
      const hb = await add('HorizontalBox', `${prefix}R${r}`, parent);
      await slot(hb, pad(0, r ? 8 : 0, 0, 0));
      for (let c = 0; c < 2; c++) {
        const [v, l] = vals[r * 2 + c];
        const k = await box(`${prefix}${r * 2 + c}`, hb, C('#ffffff', 0.04), 12, pad(13), LINE);
        await slot(k, pad(c ? 4 : 0, 0, c ? 0 : 4, 0), 1);
        const vb = await add('VerticalBox', `${prefix}${r * 2 + c}V`, k);
        await text(`${prefix}${r * 2 + c}B`, vb, v, 21, GOLD, 'Bold', true);
        await text(`${prefix}${r * 2 + c}S`, vb, l, 11.5, MUT, 'Regular', true);
      }
    }
  };
  await h4('H4C', sSt, 'Majmua', 2);
  await stats('SC', sSt, [['20', 'blok'], ['1 735', 'xonadon'], ['3,22 ga', 'yer maydoni'], ['9 000 m²', 'yashil hudud'], ['400', 'avtoturargoh'], ['2027', 'topshirish']]);
  await h4('H4B', sSt, 'Blok 2', 16, true);
  await stats('SK', sSt, [['16', 'qavat'], ['3,0 m', 'qavat balandligi'], ['105', 'xonadon'], ['29,7×18,1 m', 'gabarit'], ['40.00', 'm² · eng kichik'], ['86.00', 'm² · eng katta']]);
  await h4('H4M', sSt, 'Xonadonlar tarkibi');
  for (let r = 1; r <= 3; r++) {
    const hb = await add('HorizontalBox', `MX${r}`, sSt);
    await slot(hb, pad(0, r > 1 ? 6 : 0, 0, 0));
    const ls = await sizeBox(`MX${r}LS`, hb, 70, null);
    await slot(ls, pad(0, 0, 8, 0), null, 'HAlign_Left', 'VAlign_Center');
    await text(`MX${r}L`, ls, `${r}-xonali`, 12.5, INK);
    const tr = await add('HorizontalBox', `MX${r}T`, hb);
    await slot(tr, pad(0), 1, 'HAlign_Fill', 'VAlign_Center');
    const w = await sizeBox(`MX${r}W`, tr, 50, 8, true);
    await box(`MX${r}C`, w, GOLD, 4, pad(0));
    const ns = await sizeBox(`MX${r}NS`, hb, 34, null);
    await slot(ns, pad(8, 0, 0, 0), null, 'HAlign_Right', 'VAlign_Center');
    await text(`MX${r}N`, ns, '0', 12.5, INK, 'Bold', true, { just: 'Right' });
  }

  // --- not yet
  const sSoon = await add('VerticalBox', 'SSoon', bodyV, true);
  await note('SoonT', sSoon, 'Bu bo‘lim keyingi bosqichda qo‘shiladi.', false, 2);

  // ---------- flat card (left)
  const { blur: cb, g: card } = await glass('Card', page, 16, pad(18, 16, 18, 18), false);
  U.VARS.push('CardBlur');
  await canvas(cb, { Left: 16, Top: 92, Right: 360, Bottom: 0 }, { Minimum: { X: 0, Y: 0 }, Maximum: { X: 0, Y: 0 } }, { X: 0, Y: 0 }, true);
  const cv = await add('VerticalBox', 'CardV', card);
  const chead = await add('HorizontalBox', 'CHead', cv);
  const ctv = await add('VerticalBox', 'CHeadV', chead);
  await slot(ctv, pad(0), 1);
  const badge = await box('CBadge', ctv, ST.free, 7, pad(9, 4), null, true);
  await slot(badge, pad(0), null, 'HAlign_Left');
  await text('CBadgeT', badge, 'Sotuvda', 11, DARKT, 'Bold', true, { ls: 30 });
  const ct = await text('CTitle', ctv, 'Xonadon № 1', 21, INK, 'Bold', true);
  await slot(ct, pad(0, 8, 0, 0));
  const cx = await button('CClose', chead, { r: 12, padX: 12, padY: 8, fill: NONE, hover: C('#ffffff', 0.08) });
  await slot(cx, pad(0), null, 'HAlign_Right', 'VAlign_Top');
  await text('CCloseT', cx, '✕', 16, INK);
  await facts('CF', cv, [['54.40', 'm²'], ['2', 'xonali'], ['2', 'qavat']], 12);
  const pr = await add('VerticalBox', 'CPriceV', cv);
  await slot(pr, pad(0, 0, 0, 6));
  await text('CPrice', pr, '$54 400', 25, GOLD, 'Bold', true);
  await text('CPer', pr, '$1 000 m² uchun', 12, MUT);
  const cdet = await add('VerticalBox', 'CDet', cv, true);
  await h4('H4R', cdet, 'Xonalar (chizmadan)', 8);
  for (let k = 0; k < 8; k++) {
    const rw = await add('VerticalBox', `CR${k}`, cdet, true);
    const ln = await sizeBox(`CR${k}L`, rw, null, 1);
    await box(`CR${k}LC`, ln, LINE, 0, pad(0));
    const hb = await add('HorizontalBox', `CR${k}H`, rw);
    await slot(hb, pad(0, 6));
    const n = await text(`CR${k}N`, hb, '', 13, INK, 'Regular', true);
    await slot(n, pad(0), 1);
    await text(`CR${k}A`, hb, '', 13, MUT, 'Regular', true);
  }
  const acts = await add('VerticalBox', 'CActs', cdet);
  await slot(acts, pad(0, 12, 0, 0));
  await btn('CWalk', acts, '🚶  Ichkarida sayr', true, 0);
  await btn('COnPlan', acts, 'Qavat rejasida', false, 8);

  // ---------- demo note (bottom-left)
  const demo = await text('Demo', page, 'DEMO · NARX $1000/M², HOLATLAR NAMUNAVIY', 10.5, C('#ffffff', 0.6), 'Regular', false, { ls: 60 });
  await canvas(demo, { Left: 16, Top: -26, Right: 0, Bottom: 0 }, { Minimum: { X: 0, Y: 1 }, Maximum: { X: 0, Y: 1 } }, { X: 0, Y: 1 }, true);

  // ---------- walk bar (outside Page: shown while walking)
  const { blur: wbb, g: wbar } = await glass('WalkBar', root, 16, pad(8));
  U.VARS.push('WalkBarBlur');
  await canvas(wbb, { Left: 0, Top: -16, Right: 0, Bottom: 0 }, { Minimum: { X: 0.5, Y: 1 }, Maximum: { X: 0.5, Y: 1 } }, { X: 0.5, Y: 1 }, true);
  const wh = await add('HorizontalBox', 'WalkH', wbar);
  const ex = await btn('WExit', wh, '←  Chiqish', false, 0);
  await slot(ex, pad(0, 0, 12, 0), null, 'HAlign_Left', 'VAlign_Center');
  const wt = await text('WHint', wh, 'Sichqoncha — qarash · W A S D — yurish · E — eshik · Shift — yugurish · V — 3-shaxs', 12.5, MUT);
  await slot(wt, pad(0, 0, 8, 0), null, 'HAlign_Left', 'VAlign_Center');

  // ---------- style templates (hidden): on/off looks copied to defaults
  const tpl = await add('HorizontalBox', 'Tpl', root);
  await set(tpl.widget, { Visibility: 'Collapsed' });
  await button('TplNavOn', tpl, { r: 13, padX: 14, padY: 10, fill: GOLD, hover: GOLD }, false);
  await button('TplNavOff', tpl, { r: 13, padX: 14, padY: 10, fill: NONE, hover: C('#ffffff', 0.06) }, false);
  await button('TplFlOn', tpl, { r: 12, padX: 12, padY: 9, fill: C('#e2c785', 0.1), hover: C('#e2c785', 0.14), line: GOLD }, false);
  await button('TplFlOff', tpl, { r: 12, padX: 12, padY: 9, fill: NONE, hover: C('#ffffff', 0.05), line: LINE }, false);
  await button('TplAiOn', tpl, { r: 10, padX: 10, padY: 9, fill: C('#ffffff', 0.09), hover: C('#ffffff', 0.09), line: GOLD }, false);
  await button('TplAiOff', tpl, { r: 10, padX: 10, padY: 9, fill: C('#ffffff', 0.03), hover: C('#ffffff', 0.09) }, false);
  await buildApts(bodyV, tpl);
  await buildTime(page, tpl);
  await buildMore(bodyV, root, tpl);
  console.log('tree built', U.VARS.length, 'vars');

  await U.toggleVars();
  console.log('compile1', await U.compile());
  await U.bindClicks(['BackB', 'LangUz', 'LangRu', ...SECS.map((_, i) => `N${i}`), 'VRender', 'VCourt', 'VSide', 'VTop', 'Podyezd',
    ...Array.from({ length: 16 }, (_, i) => `FL${i + 1}`), 'FWalk', ...Array.from({ length: 7 }, (_, k) => `AI${k}`), 'CClose', 'CWalk', 'COnPlan', 'WExit', ...QCLICKS, ...HOURS.map((h) => `HR${h}`), ...MORE_CLICKS]);
  for (const p of ['QA', 'QF', 'QP']) for (const k of ['Min', 'Max']) await call(UMG, 'BindToEventProperty', { widgetBlueprint: U.wb, eventName: 'OnValueChanged', propertyName: `Sl${p}${k}`, propertyClass: ref('/Script/UMG.Slider') });
}
if (MODE === 'more') {
  const W_ = `${DIR}/${NAME}.${NAME}`;
  await buildMore({ widget: ref(`${W_}:WidgetTree.BodyV`) }, { widget: ref(`${W_}:WidgetTree.Root`) }, { widget: ref(`${W_}:WidgetTree.Tpl`) });
  await U.toggleVars();
  console.log('more built', U.VARS.length, 'vars; compile', await U.compile());
  await U.bindClicks(MORE_CLICKS);
}
if (MODE === 'tip') {                              // "shaxmatka" hover tag (web .tip): status dot + "40.84 m² · 1-xonali · $40 840"
  const W_ = `${DIR}/${NAME}.${NAME}`;
  const tip = await box('VTip', { widget: ref(`${W_}:WidgetTree.Root`) }, C('#09281d', 0.94), 9, pad(11, 6), C('#ffffff', 0.12), true);
  await canvas(tip, pad(0), { Minimum: { X: 0, Y: 0 }, Maximum: { X: 0, Y: 0 } }, { X: 0, Y: 0 }, true);
  await set(tip.widget, { Visibility: 'Collapsed' });
  const hb = await add('HorizontalBox', 'VTipH', tip);
  const sq = await sizeBox('VTipQ', hb, 10, 10);
  await slot(sq, pad(0, 0, 8, 0), null, 'HAlign_Left', 'VAlign_Center');
  await box('VTipS', sq, C('#4fbf7f'), 3, pad(0), null, true);
  const tt = await text('VTipT', hb, '40.84 m² · 1-xonali · $40 840', 12.5, C('#ffffff'), 'Bold', true);
  await slot(tt, pad(0), null, 'HAlign_Left', 'VAlign_Center');
  await U.toggleVars();
  console.log('tip built', U.VARS.length, 'vars; compile', await U.compile());
}
if (MODE === 'cam') {                              // web "Aylanib ko'rsatish": auto-rotate toggle in the Bino panel
  const W_ = `${DIR}/${NAME}.${NAME}`;
  const sB = { widget: ref(`${W_}:WidgetTree.SBino`) };
  const bb = await button('AutoRotB', sB, { r: 12, padX: 12, padY: 11, fill: C('#ffffff', 0.06), hover: C('#ffffff', 0.12), line: C('#ffffff', 0.11) });
  await slot(bb, pad(0, 6, 0, 0));
  await text('AutoRotBT', bb, '⟳  Aylanib ko‘rsatish', 13, C('#e9f1ec'), 'Bold', true, { just: 'Center' });
  await set(bb.slot, { HorizontalAlignment: 'HAlign_Fill' });
  await call(UMG, 'MoveWidget', { widgetBlueprint: U.wb, widget: ref(`${W_}:WidgetTree.BNote`), newParent: sB.widget, childIndex: -1 }).catch((e) => console.log('move note', e.message.slice(0, 200)));
  await U.toggleVars();
  console.log('cam built', U.VARS.length, 'vars; compile', await U.compile());
  await U.bindClicks(['AutoRotB']);
}
if (MODE === 'time') {
  const W_ = `${DIR}/${NAME}.${NAME}`;
  await buildTime({ widget: ref(`${W_}:WidgetTree.Page`) }, { widget: ref(`${W_}:WidgetTree.Tpl`) });
  await U.toggleVars();
  console.log('time built', U.VARS.length, 'vars; compile', await U.compile());
  await U.bindClicks(HOURS.map((h) => `HR${h}`));
}
if (MODE === 'apts') {
  const W_ = `${DIR}/${NAME}.${NAME}`;
  await buildApts({ widget: ref(`${W_}:WidgetTree.BodyV`) }, { widget: ref(`${W_}:WidgetTree.Tpl`) });
  await U.toggleVars();
  console.log('apts built', U.VARS.length, 'vars; compile', await U.compile());
  await U.bindClicks(QCLICKS);
  for (const p of ['QA', 'QF', 'QP']) for (const k of ['Min', 'Max']) await call(UMG, 'BindToEventProperty', { widgetBlueprint: U.wb, eventName: 'OnValueChanged', propertyName: `Sl${p}${k}`, propertyClass: ref('/Script/UMG.Slider') });
}

// ---------- variables (idempotent: a functions-only run adds new ones)
  for (const v of ['Blk', 'Sec', 'Storey', 'SelApt', 'Walking']) await U.addVar(v, v === 'Walking' ? 'bool' : 'int');
for (const v of ['ABlock', 'AFloor', 'ANum', 'ARooms', 'APrice', 'AStat', 'RStart', 'RCount', 'BTotal', 'BFree', 'BRes', 'BSold', 'BT4', 'BMix1', 'BMix2', 'BMix3', 'FCount', 'FFree', 'FApt']) await U.addVar(v, 'int', 'ARRAY');
for (const v of ['AArea', 'AWX', 'AWY', 'RArea', 'BMinA', 'BMaxA']) await U.addVar(v, 'float', 'ARRAY');
for (const v of ['RName', 'BGab']) await U.addVar(v, 'string', 'ARRAY');
for (const v of ['ColFree', 'ColRes', 'ColSold']) await U.addVar(v, 'LinearColor');
for (const v of ['TxtDark', 'TxtMut']) await U.addStruct(v, '/Script/SlateCore.SlateColor');
for (const v of ['StNavOn', 'StNavOff', 'StFlOn', 'StFlOff', 'StAiOn', 'StAiOff', 'StChOn', 'StChOff']) await U.addStruct(v, '/Script/SlateCore.ButtonStyle');
await U.addStruct('TxtInk', '/Script/SlateCore.SlateColor');
for (const v of ['StHrOn', 'StHrOff']) await U.addStruct(v, '/Script/SlateCore.ButtonStyle');
for (const v of ['NearCat', 'GalCat', 'LbPos', 'VolB', 'VHov', 'VHovOld']) await U.addVar(v, 'int');
await U.addVar('GFirst', 'bool');
await U.addVar('Auto', 'bool');
for (const v of ['GCat', 'GT4', 'GVis', 'PCat']) await U.addVar(v, 'int', 'ARRAY');
for (const v of ['BMx', 'BMy']) await U.addVar(v, 'float', 'ARRAY');
await U.addVar('GCap', 'string', 'ARRAY');
await call(BP_, 'add_object_variable', { blueprint: U.wb, name: 'GTex', object_class: ref('/Script/Engine.Texture2D'), container_type: 'ARRAY' }).catch((e) => console.log('GTex', e.message.slice(0, 120)));
for (const v of ['KR1', 'KR2', 'KR3', 'KS0', 'KS1', 'KS2', 'RgFlo', 'RgFhi', 'RgPlo', 'RgPhi', 'QPg']) await U.addVar(v, 'int');
for (const v of ['RgAlo', 'RgAhi']) await U.addVar(v, 'float');
for (const v of ['Matched', 'BStart', 'BCount', 'BPLo', 'BPHi']) await U.addVar(v, 'int', 'ARRAY');
for (const v of ['BALo', 'BAHi']) await U.addVar(v, 'float', 'ARRAY');
await U.compile();

// ---------- logic
const { V, D: DV, G, S, A, TX, SET, SETT, VIS, SHOW, SHOWV, F2, I2F } = dsl(NAME);
const PC = '(Game|GetPlayerController 0)';
const key = '(+ (* (- b 1) 17) s)';                         // block-storey slot: (block-1)*17 + storey
const FN = [];
const def = (n, i, o, c) => FN.push([n, i, o, c]);
def('Usd', [['N', 'int']], [['S', 'string']], USD_FN);
def('SetCur', [['On', 'bool']], [], `
(fn SetCur (On)
  (bind pc ${PC})
  (Class|PlayerController|SetShowMouseCursor :self pc :bShowMouseCursor On)
  (if On
    (Input|SetInputModeGameAndUI :PlayerController pc :InMouseLockMode "DoNotLock" :bHideCursorDuringCapture false)
    (else
      (Input|SetInputModeGameOnly :PlayerController pc))))`);
const ORBC = `(Utilities|Casting|CastToBP_OrbitCam :Object (Actor|GetActorOfClass "/Game/Blok1/UI/BP_OrbitCam.BP_OrbitCam_C"))`;
// web OrbitControls (BP_OrbitCam, orbit_bp.mjs): a preset camera sets the DESIRED pose, the orbit camera glides there and
// the user can drag / pan / wheel from it. Mode 0 = complex limits, 1 = block limits. Falls back to the plain blend.
def('OrbAim', [['Tag', 'string'], ['Mode', 'int']], [], `
(fn OrbAim (Tag Mode)
  (bind cams (Actor|GetAllActorsWithTag (Utilities|String|StringToName Tag)))
  (bind orb ${ORBC}
    (:then
      (if (> (Utilities|Array|Length cams) 0)
        (Class|BPOrbitCam|OrbitCam :self orb :Cam (Utilities|Array|Get(acopy) cams 0) :Mode Mode)))
    (:CastFailed
      (if (> (Utilities|Array|Length cams) 0)
        (Game|Player|SetViewTargetWithBlend ${PC} (Utilities|Array|Get(acopy) cams 0) 1.2)))))`);
def('OrbOff', [], [], `
(fn OrbOff ()
  (bind orb ${ORBC}
    (:then
      (Class|BPOrbitCam|OrbitOff :self orb))
    (:CastFailed)))`);
def('OrbClick', [], [['R', 'bool']], `
(fn OrbClick ()
  (bind orb ${ORBC}
    (:then
      (return (Class|BPOrbitCam|TakeClick :self orb)))
    (:CastFailed
      (return false))))`);
def('OrbAuto', [['On', 'bool']], [], `
(fn OrbAuto (On)
  (bind orb ${ORBC}
    (:then
      (Class|BPOrbitCam|SetAuto :self orb :On On))
    (:CastFailed)))`);
def('AutoSet', [['On', 'bool']], [], `
(fn AutoSet (On)
  (Variables|Default|SetAuto On)
  (Class|Button|SetStyle :self ${V('AutoRotB')} :WidgetStyle (select On ${DV('StChOn')} ${DV('StChOff')}))
  (Class|Text|SetColorandOpacity :self ${V('AutoRotBT')} :ColorAndOpacity (select On ${DV('TxtInk')} ${DV('TxtMut')}))
  (CallFunction|OrbAuto :On On))`);
def('AutoToggle', [], [], `
(fn AutoToggle ()
  (CallFunction|AutoSet :On (not ${DV('Auto')})))`);
def('Cam', [['Suffix', 'string']], [], `
(fn Cam (Suffix)
  (CallFunction|OrbAim :Tag ${A('"SCam"', S(DV('Blk')), 'Suffix')} :Mode 1))`);
// storey view, as the web's setStorey(): the camera goes above the cut storey of the walkable block and looks down at its plan.
// Web goal = target (0, y, 0) from (-14, y + 30, -30) m; here the target is the plan centre (14.85, 9.05) m -> UE (2985, -595),
// at storey floor + 1.75 m (the cut height); Sales_CamQ (tag SCamQ) is moved there each time. Pitch -42.2, yaw 65 look at the target.
def('CamQ', [], [], `
(fn CamQ ()
  (bind orb ${ORBC}
    (:then
      (Class|BPOrbitCam|OrbitTo :self orb :Tx 2985.0 :Ty -595.0 :Tz (+ 177.0 (* ${I2F(`(- ${DV('Storey')} 1)`)} 300.0)) :Pitch -42.2 :Yaw 65.0 :Dist 4460.0 :Mode 1))
    (:CastFailed)))`);
// storey view if a storey is picked, else the block's own camera
def('CamS', [], [], `
(fn CamS ()
  (bind t4 (== ${G('BT4', `(- ${DV('Blk')} 1)`)} 1))
  (if (and (> ${DV('Storey')} 0) t4)
    (CallFunction|CamQ)
    (else
      (CallFunction|Cam :Suffix ""))))`);
// storeys above F hidden on the walkable Blok1_* actors (tags S1..S16 / Fasad), as BP_Blok1Ctl.Do(1, F).
// That model is web block 2, but every type-4 block (1, 2, 12, 13, 15, 16, 18) has the same plan, so it stands in for all of them
// (same convention as the walk feature); CamQ flies the camera to it.
def('Cut', [['F', 'int']], [], `
(fn Cut (F)
  (bind f (select (== ${G('BT4', `(- ${DV('Blk')} 1)`)} 1) F 0))
  (for i (range 1 17)
    (bind acts (Actor|GetAllActorsWithTag (Utilities|String|StringToName ${A('"S"', S('i'))})))
    (for a acts
      (Rendering|SetActorHiddenInGame a (or (Actor|ActorHasTag a "DoorsIn") (and (> f 0) (> i f))))))
  (bind fas (Actor|GetAllActorsWithTag "Fasad"))
  (for a2 fas
    (Rendering|SetActorHiddenInGame a2 (> f 0))))`);
// ----- "Shaxmatka" (web Kvartiralar, src/block/aptVolumes.ts): the building is replaced by status-coloured flat volumes.
// Volumes are level actors made by ue_scripts/vols_setup.py: tags Vol, VB<block> (all of a block), VA<flat index> (one flat),
// VRest / VShop (pale mass); they start hidden, collision off. Free / reserved / sold = green / amber / red, flats the filter
// drops are faded, the selected one is gold. Vols() is the single entry point (called from Refresh); VolB = block shown now.
const MATV = (n) => `"/Game/Blok1/Vol/M_Vol_${n}.M_Vol_${n}"`;
const SETM = (n) => `(Rendering|Material|SetMaterial :self c :ElementIndex 0 :Material ${MATV(n)})`;
def('VolSet', [['J', 'int'], ['K', 'int']], [], `
(fn VolSet (J K)
  (bind acts (Actor|GetAllActorsWithTag (Utilities|String|StringToName ${A('"VA"', S('J'))})))
  (for a acts
    (bind sma (Utilities|Casting|CastToStaticMeshActor :Object a)
      (:then
        (bind c (Class|StaticMeshActor|GetStaticMeshComponent :self sma))
        (if (== K 0)
          ${SETM('free')}
          (elif (== K 1)
            ${SETM('res')}
            (elif (== K 2)
              ${SETM('sold')}
              (elif (== K 3)
                ${SETM('Dim')}
                (elif (== K 4)
                  ${SETM('Sel')}
                  (elif (== K 5)
                    ${SETM('free_Hot')}
                    (elif (== K 6)
                      ${SETM('res_Hot')}
                      (else
                        ${SETM('sold_Hot')})))))))))
      (:CastFailed))))`);
def('VolPaint', [], [], `
(fn VolPaint ()
  (bind bi (- ${DV('Blk')} 1))
  (bind j0 ${G('BStart', 'bi')})
  (for j (range j0 (+ j0 ${G('BCount', 'bi')}))
    (CallFunction|VolSet :J j :K 3))
  (for m ${DV('Matched')}
    (CallFunction|VolSet :J m :K ${G('AStat', 'm')}))
  (if (and (>= ${DV('VHov')} 0) (not (== ${DV('VHov')} ${DV('SelApt')})))
    (CallFunction|VolSet :J ${DV('VHov')} :K (+ 5 ${G('AStat', DV('VHov'))})))
  (if (>= ${DV('SelApt')} 0)
    (CallFunction|VolSet :J ${DV('SelApt')} :K 4)))`);

// the real building of block B: hide it for the volumes, restore it after
def('VolBld', [['B', 'int'], ['Hide', 'bool']], [], `
(fn VolBld (B Hide)
  (if (== B 2)
    (if Hide
      (for i (range 1 17)
        (bind acts (Actor|GetAllActorsWithTag (Utilities|String|StringToName ${A('"S"', S('i'))})))
        (for a acts
          (Rendering|SetActorHiddenInGame a true)))
      (bind fas (Actor|GetAllActorsWithTag "Fasad"))
      (for a2 fas
        (Rendering|SetActorHiddenInGame a2 true))
      (else
        (CallFunction|Cut :F ${DV('Storey')}))))
  (if (== B 1)
    (bind bs (Actor|GetAllActorsWithTag "Blok2"))
    (for a3 bs
      (Rendering|SetActorHiddenInGame a3 Hide))
    (if (not Hide)
      (bind q (Utilities|Casting|CastToBP_Qurilish :Object (Actor|GetActorOfClass "/Game/Blok1/Qurilish/BP_Qurilish.BP_Qurilish_C"))
        (:then
          (Class|BPQurilish|Show :self q))
        (:CastFailed))))
  (if (and (not (== B 1)) (not (== B 2)))
    (bind ks (Actor|GetAllActorsWithTag (Utilities|String|StringToName ${A('"KB"', S('B'))})))
    (for a4 ks
      (Rendering|SetActorHiddenInGame a4 Hide))))`);
def('VolShow', [['B', 'int'], ['On', 'bool']], [], `
(fn VolShow (B On)
  (bind vs (Actor|GetAllActorsWithTag (Utilities|String|StringToName ${A('"VB"', S('B'))})))
  (for v vs
    (Rendering|SetActorHiddenInGame v (not On))
    (Collision|SetActorEnableCollision v (and On (not (or (Actor|ActorHasTag v "VRest") (Actor|ActorHasTag v "VShop"))))))
  (CallFunction|VolBld :B B :Hide On))`);
def('Vols', [], [], `
(fn Vols ()
  (bind b ${DV('Blk')})
  (bind t4 (== ${G('BT4', '(- b 1)')} 1))
  (bind want (select (and (and (== ${DV('Sec')} 1) t4) (not ${DV('Walking')})) b 0))
  (if (not (== ${DV('VolB')} want))
    (if (> ${DV('VolB')} 0)
      (CallFunction|VolShow :B ${DV('VolB')} :On false))
    (if (> want 0)
      (CallFunction|VolShow :B want :On true))
    (Variables|Default|SetVolB want))
  (if (> want 0)
    (CallFunction|VolPaint)))`);
// cursor over a volume: hover tag + hot colour, click selects the flat (same trace as the Sales block hover)
def('VPick', [], [], `
(fn VPick ()
  (if (> ${DV('VolB')} 0)
    (bind pc ${PC})
    ; latch the previous hover first: a variable read happens when the consuming node runs, after SetVHov
    (Variables|Default|SetVHovOld ${DV('VHov')})
    (Variables|Default|SetVHov -1)
    (bind (hit ok) (Game|Player|GetHitResultUnderCursorbyChannel :self pc :TraceChannel "TraceTypeQuery1" :bTraceComplex false))
    (if ok
      (bind (h0 h1 h2 h3 h4 h5 h6 h7 h8 act h10 h11 h12 h13 h14 h15 h16 h17) (Collision|BreakHitResult hit))
      (Utilities|IsValid act
        (:"Is Valid"
          (bind bi (- ${DV('Blk')} 1))
          (bind j0 ${G('BStart', 'bi')})
          (for j (range j0 (+ j0 ${G('BCount', 'bi')}))
            (if (Actor|ActorHasTag act (Utilities|String|StringToName ${A('"VA"', S('j'))}))
              (Variables|Default|SetVHov j))))
        (:"Is Not Valid")))
    (bind hv ${DV('VHov')})
    (if (not (== ${DV('VHovOld')} hv))
      (CallFunction|VolPaint)
      (if (>= hv 0)
        ${SET('VTipT', A(`(Utilities|String|ToString(Float) :InDouble (/ (Math|Float|Round (* ${G('AArea', 'hv')} 100.0)) 100.0))`, '" m² · "', S(G('ARooms', 'hv')), '"-xonali · "', `(CallFunction|Usd :N ${G('APrice', 'hv')})`))}
        (Class|Border|SetBrushColor :self ${V('VTipS')} :BrushColor (select (== ${G('AStat', 'hv')} 0) ${DV('ColFree')} (select (== ${G('AStat', 'hv')} 1) ${DV('ColRes')} ${DV('ColSold')})))))
    (if (>= hv 0)
      ${VIS('VTip', 'HitTestInvisible')}
      (Widget|Transform|SetRenderTranslation :self ${V('VTip')} :Translation (+ (Viewport|GetMousePositiononViewport) (Math|Vector2D|MakeVector2D 16.0 16.0)))
      (if (CallFunction|OrbClick)
        (Variables|Default|SetSelApt hv)
        (CallFunction|Refresh))
      (else
        ${VIS('VTip', 'Collapsed')}))
    (else
      ${VIS('VTip', 'Collapsed')})))`);
def('Open', [['B', 'int']], [], `
(fn Open (B)
  (CallFunction|AutoSet :On false)
  (Variables|Default|SetBlk B)
  (Variables|Default|SetSec 0)
  (Variables|Default|SetStorey 0)
  (Variables|Default|SetSelApt -1)
  (Widget|SetVisibility :self self :InVisibility "SelfHitTestInvisible")
  ${VIS('Page', 'SelfHitTestInvisible')}
  ${VIS('WalkBarBlur', 'Collapsed')}
  (CallFunction|Cut :F 0)
  (CallFunction|Cam :Suffix "")
  (CallFunction|SetCur :On true)
  (CallFunction|QClear)
  (Variables|Default|SetNearCat -1)
  (Variables|Default|SetGalCat -1)
  ${VIS('LB', 'Collapsed')}
  (CallFunction|Refresh))`);
def('GoComplex', [], [], `
(fn GoComplex ()
  (CallFunction|AutoSet :On false)
  (Variables|Default|SetSec 0)
  (Variables|Default|SetStorey 0)
  (CallFunction|Vols)
  (CallFunction|Cut :F 0)
  (Widget|SetVisibility :self self :InVisibility "Collapsed")
  (CallFunction|OrbAim :Tag "SCam0" :Mode 0)
  (bind ctl (Utilities|Casting|CastToBP_Blok1Ctl :Object (Actor|GetActorOfClass "/Game/Blok1/UI/BP_Blok1Ctl.BP_Blok1Ctl_C"))
    (:then
      (Widget|SetVisibility :self (Class|BPBlok1Ctl|GetSalesW :self ctl) :InVisibility "SelfHitTestInvisible")
      (Utilities|Time|SetTimerbyFunctionName :Object (Class|BPBlok1Ctl|GetSalesW :self ctl) :FunctionName "RTime" :Time 0.01))
    (:CastFailed)))`);
def('SetSec', [['S', 'int']], [], `
(fn SetSec (S)
  (Variables|Default|SetSec S)
  (Variables|Default|SetSelApt -1)
  (bind t4 (== ${G('BT4', `(- ${DV('Blk')} 1)`)} 1))
  (if (and (== S 2) t4)
    (Variables|Default|SetStorey 9)
    (else
      (Variables|Default|SetStorey 0)))
  (CallFunction|Cut :F ${DV('Storey')})
  (if (== S 0) (CallFunction|Cam :Suffix ""))
  (if (or (== S 3) (== S 4)) (CallFunction|CamK))
  (if (or (== S 0) (or (== S 1) (or (== S 5) (== S 6)))) (CallFunction|Cam :Suffix ""))
  (if (== S 2) (CallFunction|CamS))
  (CallFunction|Refresh))`);
def('PickStorey', [['F', 'int']], [], `
(fn PickStorey (F)
  (Variables|Default|SetStorey (select (== ${DV('Storey')} F) 0 F))
  (Variables|Default|SetSelApt -1)
  (CallFunction|Cut :F ${DV('Storey')})
  (CallFunction|CamS)
  (CallFunction|Refresh))`);
def('PickItem', [['K', 'int']], [], `
(fn PickItem (K)
  (bind b ${DV('Blk')})
  (bind s ${DV('Storey')})
  (bind ix ${G('FApt', `(+ (* ${key} 7) K)`)})
  (Variables|Default|SetSelApt (select (== ${DV('SelApt')} ix) -1 ix))
  (CallFunction|Refresh))`);
// walking in block 2: plan (x, y) m -> UE (1500 + x*100, -1500 + y*100), storey floor = 2 + (s-1)*300 + 20 cm
def('WalkTo', [['X', 'float'], ['Y', 'float'], ['S', 'int']], [], `
(fn WalkTo (X Y S)
  (CallFunction|OrbOff)
  (Variables|Default|SetWalking true)
  (CallFunction|Vols)
  (CallFunction|Cut :F 0)
  (bind p (Game|GetPlayerPawn 0))
  (Transformation|SetActorLocation :self p :NewLocation (Math|Vector|MakeVector :X (+ 1500.0 (* X 100.0)) :Y (+ -1500.0 (* Y 100.0)) :Z (+ 132.0 (* ${I2F('(- S 1)')} 300.0))) :bSweep false :bTeleport true)
  (Game|Player|SetViewTargetWithBlend ${PC} p 0.6)
  (Variables|Default|SetWalking true)
  ${VIS('Page', 'Collapsed')}
  ${VIS('WalkBarBlur', 'SelfHitTestInvisible')}
  (CallFunction|SetCur :On false))`);
def('ExitWalk', [], [], `
(fn ExitWalk ()
  (Variables|Default|SetWalking false)
  ${VIS('Page', 'SelfHitTestInvisible')}
  ${VIS('WalkBarBlur', 'Collapsed')}
  (CallFunction|Cut :F ${DV('Storey')})
  (CallFunction|CamS)
  (CallFunction|SetCur :On true)
  (CallFunction|Refresh))`);

// ----- Refresh: everything that depends on Blk / Sec / Storey / SelApt
const navStyle = SECS.map((_, i) => `
  (Class|Button|SetStyle :self ${V('N' + i)} :WidgetStyle (select (== sec ${i}) ${DV('StNavOn')} ${DV('StNavOff')}))
  (Class|Text|SetColorandOpacity :self ${V(`N${i}T`)} :ColorAndOpacity (select (== sec ${i}) ${DV('TxtDark')} ${DV('TxtMut')}))`).join('');
const TITLES = SECS.map(([, l]) => `"${l}"`);
const titleSel = TITLES.slice(1).reduceRight((acc, t, j) => `(select (== sec ${j + 1}) ${t} ${acc})`, TITLES[0]);
const floorRows = Array.from({ length: 16 }, (_, k) => {
  const f = k + 1;
  const bars = Array.from({ length: 7 }, (_, j) => `
      (bind x${f}_${j} ${G('FApt', `(+ (* (+ base ${f}) 7) ${j})`)})
      (if (>= x${f}_${j} 0)
        ${VIS(`FL${f}S${j}`, 'SelfHitTestInvisible')}
        (Class|Border|SetBrushColor :self ${V(`FL${f}C${j}`)} :BrushColor (select (== ${G('AStat', `x${f}_${j}`)} 0) ${DV('ColFree')} (select (== ${G('AStat', `x${f}_${j}`)} 1) ${DV('ColRes')} ${DV('ColSold')})))
        (else ${VIS(`FL${f}S${j}`, 'Collapsed')}))`).join('');
  return `
    ${f === 1 ? SET('FL1I', '"3 magazin · lobbi"') : SET(`FL${f}I`, A(S(G('FCount', `(+ base ${f})`)), '" ta xonadon · "', S(G('FFree', `(+ base ${f})`)), '" sotuvda"'))}
    (Class|Button|SetStyle :self ${V('FL' + f)} :WidgetStyle (select (== s ${f}) ${DV('StFlOn')} ${DV('StFlOff')}))${bars}`;
}).join('');
// re-order: rows above the storey, the detail box, rows below it (FW16 .. FW1 are the row wrappers)
const reorder = `
    ${VIS('FDet', 'Collapsed')}
    (if (> s 0)
      (Widget|RemovefromParent ${V('FDet')})${Array.from({ length: 15 }, (_, k) => { const f = 15 - k; return `
      (if (< ${f} s) (Widget|RemovefromParent ${V('FW' + f)}))`; }).join('')}
      (Panel|AddChildtoVerticalBox ${V('FList')} ${V('FDet')})${Array.from({ length: 15 }, (_, k) => { const f = 15 - k; return `
      (if (< ${f} s) (Panel|AddChildtoVerticalBox ${V('FList')} ${V('FW' + f)}))`; }).join('')}
      ${VIS('FDet', 'SelfHitTestInvisible')})`;
const items = Array.from({ length: 7 }, (_, k) => `
      (bind ia${k} ${G('FApt', `(+ (* (+ base s) 7) ${k})`)})
      (if (and (>= ia${k} 0) (> s 1))
        ${VIS('AI' + k, 'Visible')}
        ${SET(`AI${k}N`, A('"№ "', S(G('ANum', `ia${k}`))))}
        ${SET(`AI${k}R`, A(S(G('ARooms', `ia${k}`)), '"-xonali"'))}
        ${SETT(`AI${k}A`, F2(G('AArea', `ia${k}`)))}
        ${SET(`AI${k}P`, `(CallFunction|Usd :N ${G('APrice', `ia${k}`)})`)}
        (Class|Border|SetBrushColor :self ${V(`AI${k}S`)} :BrushColor (select (== ${G('AStat', `ia${k}`)} 0) ${DV('ColFree')} (select (== ${G('AStat', `ia${k}`)} 1) ${DV('ColRes')} ${DV('ColSold')})))
        (Class|Button|SetStyle :self ${V('AI' + k)} :WidgetStyle (select (== ia${k} ${DV('SelApt')}) ${DV('StAiOn')} ${DV('StAiOff')}))
        (else ${VIS('AI' + k, 'Collapsed')}))`).join('');
// room area "18.6 m²": text -> string needs a conversion node; keep it simple with a float-to-text + " m²" in two texts? use Append on Conv
const roomRows2 = Array.from({ length: 8 }, (_, k) => `
      (if (< ${k} rn)
        ${VIS('CR' + k, 'SelfHitTestInvisible')}
        ${SET(`CR${k}N`, G('RName', `(+ rs ${k})`))}
        ${SET(`CR${k}A`, A(`(Utilities|String|ToString(Float) :InDouble (/ (Math|Float|Round (* ${G('RArea', `(+ rs ${k})`)} 10.0)) 10.0))`, '" m²"'))}
        (else ${VIS('CR' + k, 'Collapsed')}))`).join('');
const bw = (n) => `(/ (* ${PW}.0 ${I2F(n)}) totf)`;

const head = `
  (bind b ${DV('Blk')})
  (bind sec ${DV('Sec')})
  (bind s ${DV('Storey')})
  (bind bi (- b 1))
  (bind t4 (== ${G('BT4', 'bi')} 1))
  (bind base (* bi 17))`;
def('RTop', [], [], `
(fn RTop ()${head}
  ${SET('BrandS', A(S('b'), `(select t4 "-blok · 4-tip · 16 qavat" "-blok · 16 qavat · chizma kutilmoqda")`))}
  ${SET('PTitle', titleSel)}${navStyle}
  ${SHOW('SBino', '(== sec 0)')}
  ${SHOW('SFloors', '(== sec 2)')}
  ${SHOW('SStats', '(== sec 6)')}
  ${SHOW('SApts', '(== sec 1)')}
  ${SHOW('SSite', '(== sec 3)')}
  ${SHOW('SNear', '(== sec 4)')}
  ${SHOW('SGal', '(== sec 5)')}
  ${VIS('SSoon', 'Collapsed')})`);
def('RBino', [], [], `
(fn RBino ()${head}
  (bind tot ${G('BTotal', 'bi')})
  (bind totf ${I2F('tot')})
  (bind fr ${G('BFree', 'bi')})
  (bind rs ${G('BRes', 'bi')})
  (bind sd ${G('BSold', 'bi')})
  ${SET('BF1B', S('tot'))}
  ${SET('BF2B', '(select t4 "3" "—")')}
  (Class|SizeBox|SetWidthOverride :self ${V('SBF')} :WidthOverride ${bw('fr')})
  (Class|SizeBox|SetWidthOverride :self ${V('SBR')} :WidthOverride ${bw('rs')})
  (Class|SizeBox|SetWidthOverride :self ${V('SBS')} :WidthOverride ${bw('sd')})
  ${SET('SBFT', S('fr'))}
  ${SET('SBRT', S('rs'))}
  ${SET('SBST', S('sd'))}
  ${SHOWV('Podyezd', '(== b 2)')}
  ${SET('BNote', `(select t4 "1-blok PDF chizmalaridan 1:1: devorlar, derazalar, balkonlar va fasad renderdan." "Bu blokning qavat rejalari hali yuklanmagan. PDF kelgach, qavatlar va ichki ko‘rinish yoqiladi.")`)}
  ; ----- Raqamlarda
  ${SET('H4B', A('"BLOK "', S('b')))}
  ${SET('SK2B', S('tot'))}
  ${SET('SK3B', G('BGab', 'bi'))}
  ${SETT('SK4B', F2(G('BMinA', 'bi')))}
  ${SETT('SK5B', F2(G('BMaxA', 'bi')))}${[1, 2, 3].map((r) => `
  ${SET(`MX${r}N`, S(G('BMix' + r, 'bi')))}
  (Class|SizeBox|SetWidthOverride :self ${V(`MX${r}W`)} :WidthOverride (/ (* 170.0 ${I2F(G('BMix' + r, 'bi'))}) totf))`).join('')})`);
// one small function per storey row (a single graph with all 16 rows timed out)
for (let f = 1; f <= 16; f++) {
  const bars = Array.from({ length: 7 }, (_, j) => `
  (bind x${j} ${G('FApt', `(+ (* (+ base ${f}) 7) ${j})`)})
  (if (>= x${j} 0)
    ${VIS(`FL${f}S${j}`, 'SelfHitTestInvisible')}
    (bind st${j} ${G('AStat', `x${j}`)})
    (Class|Border|SetBrushColor :self ${V(`FL${f}C${j}`)} :BrushColor (select (== st${j} 0) ${DV('ColFree')} (select (== st${j} 1) ${DV('ColRes')} ${DV('ColSold')})))
    (else ${VIS(`FL${f}S${j}`, 'Collapsed')}))`).join('');
  def(`RF${f}`, [], [], `
(fn RF${f} ()${head}
  ${f === 1 ? SET('FL1I', '"3 magazin · lobbi"') : SET(`FL${f}I`, A(S(G('FCount', `(+ base ${f})`)), '" ta xonadon · "', S(G('FFree', `(+ base ${f})`)), '" sotuvda"'))}
  (Class|Button|SetStyle :self ${V('FL' + f)} :WidgetStyle (select (== s ${f}) ${DV('StFlOn')} ${DV('StFlOff')}))${bars})`);
}
def('RFloors', [], [], `
(fn RFloors ()${head}
  ${SHOW('FList', 't4')}
  ${SHOW('FEmpty', '(not t4)')}${reorder}
  ${SHOWV('FWalk', '(and (== b 2) (> s 0))')}
  ${SHOW('FNote', '(== s 1)')}
  ${SHOW('AList', '(> s 1)')}${items})`);
def('RCard', [], [], `
(fn RCard ()${head}
  (bind ap ${DV('SelApt')})
  (if (>= ap 0)
    ${VIS('CardBlur', 'SelfHitTestInvisible')}
    (bind st ${G('AStat', 'ap')})
    (Class|Border|SetBrushColor :self ${V('CBadge')} :BrushColor (select (== st 0) ${DV('ColFree')} (select (== st 1) ${DV('ColRes')} ${DV('ColSold')})))
    ${SET('CBadgeT', '(select (== st 0) "Sotuvda" (select (== st 1) "Bron" "Sotilgan"))')}
    ${SET('CTitle', A('"Xonadon № "', S(G('ANum', 'ap'))))}
    ${SETT('CF0B', F2(G('AArea', 'ap')))}
    ${SET('CF1B', S(G('ARooms', 'ap')))}
    ${SET('CF2B', S(G('AFloor', 'ap')))}
    ${SET('CPrice', `(CallFunction|Usd :N ${G('APrice', 'ap')})`)}
    (bind rn ${G('RCount', 'ap')})
    (bind rs ${G('RStart', 'ap')})
    ${SHOW('CDet', '(> rn 0)')}${roomRows2}
    ${SHOWV('CWalk', '(== b 2)')}
    (else
      ${VIS('CardBlur', 'Collapsed')})))`);

// ----- Kvartiralar logic
const BI = `(- ${DV('Blk')} 1)`;
const chipSt = (w, cond) => `
  (Class|Button|SetStyle :self ${V(w)} :WidgetStyle (select ${cond} ${DV('StChOn')} ${DV('StChOff')}))
  (Class|Text|SetColorandOpacity :self ${V(w + 'T')} :ColorAndOpacity (select ${cond} ${DV('TxtInk')} ${DV('TxtMut')}))`;
def('QClear', [], [], `
(fn QClear ()
  (bind bi ${BI})
  (Variables|Default|SetKR1 0)
  (Variables|Default|SetKR2 0)
  (Variables|Default|SetKR3 0)
  (Variables|Default|SetKS0 1)
  (Variables|Default|SetKS1 0)
  (Variables|Default|SetKS2 0)
  (Variables|Default|SetRgAlo ${G('BALo', 'bi')})
  (Variables|Default|SetRgAhi ${G('BAHi', 'bi')})
  (Variables|Default|SetRgFlo 2)
  (Variables|Default|SetRgFhi 16)
  (Variables|Default|SetRgPlo ${G('BPLo', 'bi')})
  (Variables|Default|SetRgPhi ${G('BPHi', 'bi')})
  (Variables|Default|SetQPg 0)${['QA', 'QF', 'QP'].map((p) => `
  (Class|Slider|SetValue :self ${V(`Sl${p}Min`)} :Value 0.0)
  (Class|Slider|SetValue :self ${V(`Sl${p}Max`)} :Value 1.0)`).join('')}
  (CallFunction|QFilter))`);
def('QFilter', [], [], `
(fn QFilter ()
  (bind bi ${BI})
  (Utilities|Array|Clear :TargetArray ${DV('Matched')})
  (bind j0 ${G('BStart', 'bi')})
  (bind rsum (+ ${DV('KR1')} (+ ${DV('KR2')} ${DV('KR3')})))
  (bind ssum (+ ${DV('KS0')} (+ ${DV('KS1')} ${DV('KS2')})))
  (for j (range j0 (+ j0 ${G('BCount', 'bi')}))
    (bind r ${G('ARooms', 'j')})
    (bind okR (or (== rsum 0) (or (and (== r 1) (== ${DV('KR1')} 1)) (or (and (== r 2) (== ${DV('KR2')} 1)) (and (== r 3) (== ${DV('KR3')} 1))))))
    (bind st ${G('AStat', 'j')})
    (bind okS (or (== ssum 0) (or (and (== st 0) (== ${DV('KS0')} 1)) (or (and (== st 1) (== ${DV('KS1')} 1)) (and (== st 2) (== ${DV('KS2')} 1))))))
    (bind ar ${G('AArea', 'j')})
    (bind fl ${G('AFloor', 'j')})
    (bind pr ${G('APrice', 'j')})
    (bind okA (and (>= ar ${DV('RgAlo')}) (<= ar ${DV('RgAhi')})))
    (bind okF (and (>= fl ${DV('RgFlo')}) (<= fl ${DV('RgFhi')})))
    (bind okP (and (>= pr ${DV('RgPlo')}) (<= pr ${DV('RgPhi')})))
    (if (and (and okR okS) (and okA (and okF okP)))
      (Utilities|Array|Add :TargetArray ${DV('Matched')} :NewItem j))))`);
// slider (0..1) -> range value, rounded: area 1 m2, storey 1, price $1 000
const SLV = { QA: ['BALo', 'BAHi', 'RgAlo', 'RgAhi', 1, 'float', true], QF: [null, null, 'RgFlo', 'RgFhi', 1, 'int', false], QP: ['BPLo', 'BPHi', 'RgPlo', 'RgPhi', 1000, 'int', false] };
for (const [p, [lo, hi, vlo, vhi, step, ty, isF]] of Object.entries(SLV)) {
  for (const [k, vv] of [['Min', vlo], ['Max', vhi]]) {
    const L = lo ? (isF ? G(lo, BI) : I2F(G(lo, BI))) : '2.0', H = hi ? (isF ? G(hi, BI) : I2F(G(hi, BI))) : '16.0';
    const rounded = `(* (Math|Float|Round (/ (+ ${L} (* Value (- ${H} ${L}))) ${step}.0)) ${step})`;
    def(`On${p}${k}`, [['Value', 'float']], [], `
(fn On${p}${k} (Value)
  (Variables|Default|Set${vv} ${ty === 'float' ? I2F(rounded) : rounded})
  (Variables|Default|SetQPg 0)
  (CallFunction|QFilter)
  (CallFunction|RApts)
  (CallFunction|RQL0)
  (CallFunction|RQL1)
  (CallFunction|Vols))`);
  }
}
def('RApts', [], [], `
(fn RApts ()
  (bind bi ${BI})${chipSt('QR1', `(== ${DV('KR1')} 1)`)}${chipSt('QR2', `(== ${DV('KR2')} 1)`)}${chipSt('QR3', `(== ${DV('KR3')} 1)`)}${chipSt('QS0', `(== ${DV('KS0')} 1)`)}${chipSt('QS1', `(== ${DV('KS1')} 1)`)}${chipSt('QS2', `(== ${DV('KS2')} 1)`)}
  ${SET('QALo', S(`(Math|Float|Round ${DV('RgAlo')})`))}
  ${SET('QAHi', S(`(Math|Float|Round ${DV('RgAhi')})`))}
  ${SET('QFLo', S(DV('RgFlo')))}
  ${SET('QFHi', S(DV('RgFhi')))}
  ${SET('QPLo', A('"$"', S(`(/ ${DV('RgPlo')} 1000)`), '"k"'))}
  ${SET('QPHi', A('"$"', S(`(/ ${DV('RgPhi')} 1000)`), '"k"'))}
  (bind n (Utilities|Array|Length ${DV('Matched')}))
  ${SET('QFound', A('"Topildi: "', S('n'), '" / "', S(G('BCount', 'bi'))))}
  (bind p0 (* ${DV('QPg')} ${QN}))
  ${SHOW('QPager', `(> n ${QN})`)}
  ${SET('QPage', A(S('(+ p0 1)'), '"–"', S(`(Math|Integer|Min(Integer) :A n :B (+ p0 ${QN}))`), '" / "', S('n')))})`);
for (const [g, k0] of [[0, 0], [1, QN / 2]]) def(`RQL${g}`, [], [], `
(fn RQL${g} ()
  (bind n (Utilities|Array|Length ${DV('Matched')}))
  (bind p0 (* ${DV('QPg')} ${QN}))${Array.from({ length: QN / 2 }, (_, d) => { const k = k0 + d; return `
  (if (< (+ p0 ${k}) n)
    ${VIS('QL' + k, 'Visible')}
    (bind x${k} ${G('Matched', `(+ p0 ${k})`)})
    ${SET(`QL${k}N`, A(S(G('AFloor', `x${k}`)), '"-qavat"'))}
    ${SET(`QL${k}R`, A(S(G('ARooms', `x${k}`)), '"-xonali"'))}
    ${SETT(`QL${k}A`, F2(G('AArea', `x${k}`)))}
    ${SET(`QL${k}P`, `(CallFunction|Usd :N ${G('APrice', `x${k}`)})`)}
    (Class|Border|SetBrushColor :self ${V(`QL${k}S`)} :BrushColor (select (== ${G('AStat', `x${k}`)} 0) ${DV('ColFree')} (select (== ${G('AStat', `x${k}`)} 1) ${DV('ColRes')} ${DV('ColSold')})))
    (Class|Button|SetStyle :self ${V('QL' + k)} :WidgetStyle (select (== x${k} ${DV('SelApt')}) ${DV('StAiOn')} ${DV('StAiOff')}))
    (else ${VIS('QL' + k, 'Collapsed')}))`; }).join('')})`);
def('QChip', [['K', 'int']], [], `
(fn QChip (K)
  (if (== K 0) (Variables|Default|SetKR1 (- 1 ${DV('KR1')})))
  (if (== K 1) (Variables|Default|SetKR2 (- 1 ${DV('KR2')})))
  (if (== K 2) (Variables|Default|SetKR3 (- 1 ${DV('KR3')})))
  (if (== K 3) (Variables|Default|SetKS0 (- 1 ${DV('KS0')})))
  (if (== K 4) (Variables|Default|SetKS1 (- 1 ${DV('KS1')})))
  (if (== K 5) (Variables|Default|SetKS2 (- 1 ${DV('KS2')})))
  (Variables|Default|SetQPg 0)
  (CallFunction|QFilter)
  (CallFunction|Refresh))`);
def('QPick', [['K', 'int']], [], `
(fn QPick (K)
  (bind ix ${G('Matched', `(+ (* ${DV('QPg')} ${QN}) K)`)})
  (Variables|Default|SetSelApt (select (== ${DV('SelApt')} ix) -1 ix))
  (CallFunction|Refresh))`);
def('QPageBy', [['D', 'int']], [], `
(fn QPageBy (D)
  (bind n (Utilities|Array|Length ${DV('Matched')}))
  (bind last (/ (- (Math|Integer|Max(Integer) :A n :B 1) 1) ${QN}))
  (Variables|Default|SetQPg (Math|Integer|Clamp(Integer) :Value (+ ${DV('QPg')} D) :Min 0 :Max last))
  (CallFunction|Refresh))`);
// ----- time of day: the hour lives in BP_Blok1Ctl (shared with WBP_Sales); BP_Blok1Ctl.TimeW (WBP_Blok1Time) moves the sun
def('SetHour', [['H', 'int']], [], `
(fn SetHour (H)
  (bind ctl (Utilities|Casting|CastToBP_Blok1Ctl :Object (Actor|GetActorOfClass "/Game/Blok1/UI/BP_Blok1Ctl.BP_Blok1Ctl_C"))
    (:then
      (Class|BPBlok1Ctl|SetHour :self ctl :Hour H)
      (Utilities|Time|SetTimerbyFunctionName :Object (Class|BPBlok1Ctl|GetTimeW :self ctl) :FunctionName (Utilities|String|Append "Hour" (Utilities|String|ToString(Integer) H)) :Time 0.01)
      (CallFunction|RTime))
    (:CastFailed)))`);
def('RTime', [], [], `
(fn RTime ()
  (bind ctl (Utilities|Casting|CastToBP_Blok1Ctl :Object (Actor|GetActorOfClass "/Game/Blok1/UI/BP_Blok1Ctl.BP_Blok1Ctl_C"))
    (:then
      (bind h (Class|BPBlok1Ctl|GetHour :self ctl))${HOURS.map((x) => `
      (Class|Button|SetStyle :self ${V('HR' + x)} :WidgetStyle (select (== h ${x}) ${DV('StHrOn')} ${DV('StHrOff')}))
      (Class|Text|SetColorandOpacity :self ${V(`HR${x}T`)} :ColorAndOpacity (select (== h ${x}) ${DV('TxtDark')} ${DV('TxtMut')}))`).join('')}
      ${SET('StopName', HOURS.slice(0, -1).reduceRight((acc, x) => `(select (== h ${x}) "${HOUR_NAMES[x]}" ${acc})`, `"${HOUR_NAMES[23]}"`))})
    (:CastFailed)))`);
// ----- Joylashuv / Sizga yaqin / Galereya
const chipSt2 = (w, cond) => `
  (Class|Button|SetStyle :self ${V(w)} :WidgetStyle (select ${cond} ${DV('StChOn')} ${DV('StChOff')}))
  (Class|Text|SetColorandOpacity :self ${V(w + 'T')} :ColorAndOpacity (select ${cond} ${DV('TxtInk')} ${DV('TxtMut')}))`;
def('RSite', [], [], `
(fn RSite ()
  (bind bi ${BI})
  (Widget|Transform|SetRenderTranslation :self ${V('SiteMk')} :Translation (Math|Vector2D|MakeVector2D ${G('BMx', 'bi')} ${G('BMy', 'bi')}))
  ${SET('SiteNote', A(S(DV('Blk')), '"-blok general planda belgilangan."'))})`);
def('RNear', [], [], `
(fn RNear ()
  (bind c ${DV('NearCat')})${chipSt2('NC0', '(== c -1)')}${CATS.map((_, i) => chipSt2(`NC${i + 1}`, `(== c ${i})`)).join('')}${D.places.map((_, i) => `
  (bind ok${i} (or (== c -1) (== ${G('PCat', i)} c)))
  ${SHOW(`NL${i}`, `ok${i}`)}
  ${SHOW(`NM${i}`, `ok${i}`)}`).join('')})`);
const galRows = (from, to) => GAL.slice(from, to).map((_, d) => { const i = from + d; return `
  (bind ok${i} (and (or t4 (== ${G('GT4', i)} 0)) (or (== c -1) (== ${G('GCat', i)} c))))
  (if ok${i}
    ${VIS(`GI${i}`, 'Visible')}
    (Utilities|Array|Add :TargetArray ${DV('GVis')} :NewItem ${i})
    (bind w${i} (and ${DV('GFirst')} (== c -1)))
    (Class|SizeBox|SetWidthOverride :self ${V(`GI${i}ISB`)} :WidthOverride (select w${i} 302.0 148.0))
    (Class|SizeBox|SetHeightOverride :self ${V(`GI${i}ISB`)} :HeightOverride (select w${i} 170.0 83.0))
    (Variables|Default|SetGFirst false)
    (else ${VIS(`GI${i}`, 'Collapsed')}))`; }).join('');
def('RGal0', [], [], `
(fn RGal0 ()
  (bind c ${DV('GalCat')})
  (bind t4 (== ${G('BT4', BI)} 1))
  (Utilities|Array|Clear :TargetArray ${DV('GVis')})
  (Variables|Default|SetGFirst true)${chipSt2('GC0', '(== c -1)')}${GCATS.map((_, i) => chipSt2(`GC${i + 1}`, `(== c ${i})`)).join('')}
  ${SET('GC0T', `(select t4 "Hammasi  ${GAL.length}" "Hammasi  ${GAL.filter((g) => !g.type4).length}")`)}${GCATS.map(([k, l], i) => `
  ${SET(`GC${i + 1}T`, `(select t4 "${l}  ${GAL.filter((g) => g.cat === k).length}" "${l}  ${GAL.filter((g) => g.cat === k && !g.type4).length}")`)}
  ${SHOW(`GC${i + 1}`, `(or t4 ${GAL.some((g) => g.cat === k && !g.type4) ? 'true' : 'false'})`)}`).join('')}${galRows(0, 14)})`);
def('RGal1', [], [], `
(fn RGal1 ()
  (bind c ${DV('GalCat')})
  (bind t4 (== ${G('BT4', BI)} 1))${galRows(14, GAL.length)})`);
def('RLb', [], [], `
(fn RLb ()
  (bind n (Utilities|Array|Length ${DV('GVis')}))
  (if (> n 0)
    (bind gi ${G('GVis', `(Math|Integer|Clamp(Integer) :Value ${DV('LbPos')} :Min 0 :Max (- n 1))`)})
    (Class|Image|SetBrush :self ${V('LBImg')} :Brush (Widget|Brush|MakeBrushfromTexture :Texture ${G('GTex', 'gi')} :Width 1100 :Height 619))
    ${SET('LBCap', G('GCap', 'gi'))}))`);
def('GalOpen', [['I', 'int']], [], `
(fn GalOpen (I)
  (Variables|Default|SetLbPos (Utilities|Array|FindItem :TargetArray ${DV('GVis')} :ItemToFind I))
  (CallFunction|RLb)
  ${VIS('LB', 'Visible')})`);
def('LbStep', [['D', 'int']], [], `
(fn LbStep (D)
  (bind n (Utilities|Array|Length ${DV('GVis')}))
  (Variables|Default|SetLbPos (Math|Integer|%(Integer) (+ (+ ${DV('LbPos')} D) n) (Math|Integer|Max(Integer) :A n :B 1)))
  (CallFunction|RLb))`);
def('CamK', [], [], `
(fn CamK ()
  (CallFunction|OrbAim :Tag "SCam0" :Mode 0))`);
def('Refresh', [], [], `
(fn Refresh ()
  (CallFunction|RTop)
  (CallFunction|RTime)
  (CallFunction|RBino)${Array.from({ length: 16 }, (_, k) => `
  (if (== ${DV('Sec')} 2) (CallFunction|RF${k + 1}))`).join('')}
  (CallFunction|RFloors)
  (if (== ${DV('Sec')} 1) (CallFunction|RApts) (CallFunction|RQL0) (CallFunction|RQL1))
  (if (== ${DV('Sec')} 3) (CallFunction|RSite))
  (if (== ${DV('Sec')} 4) (CallFunction|RNear))
  (if (== ${DV('Sec')} 5) (CallFunction|RGal0) (CallFunction|RGal1))
  (CallFunction|RCard)
  (CallFunction|Vols))`);
// WBP_Sales opens a block by name (SetTimerbyFunctionName "OpenB<N>": a widget-to-widget call without a typed reference)
for (let n = 1; n <= 20; n++) def(`OpenB${n}`, [], [], `
(fn OpenB${n} ()
  (CallFunction|Open :B ${n}))`);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;   // ONLY=Open,QClear: rewrite just these graphs
console.log('functions failed:', JSON.stringify(await U.fnAll(ONLY ? FN.filter((f) => ONLY.includes(f[0])) : FN)));

const SIDX = (k) => `(CallFunction|SetSec :S ${k})`;
await U.events([
  `(event UserInterface|EventConstruct\n  (Widget|SetVisibility :self self :InVisibility "Collapsed")\n  ${VIS('WalkBarBlur', 'Collapsed')})`,
  `(event UserInterface|EventTick (MyGeometry InDeltaTime)\n  (CallFunction|VPick))`,
  `(event OnClicked(BackB)\n  (CallFunction|GoComplex))`,
  `(event OnClicked(AutoRotB)\n  (CallFunction|AutoToggle))`,
  `(event OnClicked(LangUz))`, `(event OnClicked(LangRu))`,
  ...SECS.map((_, i) => `(event OnClicked(N${i})\n  ${SIDX(i)})`),
  `(event OnClicked(VRender)\n  (CallFunction|Cam :Suffix ""))`,
  `(event OnClicked(VCourt)\n  (CallFunction|Cam :Suffix "c"))`,
  `(event OnClicked(VSide)\n  (CallFunction|Cam :Suffix "s"))`,
  `(event OnClicked(VTop)\n  (CallFunction|Cam :Suffix "t"))`,
  `(event OnClicked(Podyezd)\n  (CallFunction|WalkTo :X ${WALK_HALL[0]} :Y 16.5 :S 1))`,
  ...Array.from({ length: 16 }, (_, i) => `(event OnClicked(FL${i + 1})\n  (CallFunction|PickStorey :F ${i + 1}))`),
  `(event OnClicked(FWalk)\n  (CallFunction|WalkTo :X ${WALK_HALL[0]} :Y ${WALK_HALL[1]} :S ${DV('Storey')}))`,
  ...Array.from({ length: 7 }, (_, k) => `(event OnClicked(AI${k})\n  (CallFunction|PickItem :K ${k}))`),
  `(event OnClicked(CClose)\n  (Variables|Default|SetSelApt -1)\n  (CallFunction|Refresh))`,
  `(event OnClicked(CWalk)\n  (bind ap ${DV('SelApt')})\n  (CallFunction|WalkTo :X ${G('AWX', 'ap')} :Y ${G('AWY', 'ap')} :S ${G('AFloor', 'ap')}))`,
  `(event OnClicked(COnPlan)\n  (bind ap ${DV('SelApt')})\n  (Variables|Default|SetSec 2)\n  (Variables|Default|SetStorey ${G('AFloor', 'ap')})\n  (CallFunction|Cut :F ${G('AFloor', 'ap')})\n  (CallFunction|CamS)\n  (CallFunction|Refresh))`,
  `(event OnClicked(WExit)\n  (CallFunction|ExitWalk))`,
  ...HOURS.map((h) => `(event OnClicked(HR${h})\n  (CallFunction|SetHour :H ${h}))`),
  `(event OnClicked(NC0)\n  (Variables|Default|SetNearCat -1)\n  (CallFunction|RNear))`,
  ...CATS.map((_, i) => `(event OnClicked(NC${i + 1})\n  (Variables|Default|SetNearCat (select (== ${DV('NearCat')} ${i}) -1 ${i}))\n  (CallFunction|RNear))`),
  `(event OnClicked(GC0)\n  (Variables|Default|SetGalCat -1)\n  (CallFunction|RGal0)\n  (CallFunction|RGal1))`,
  ...GCATS.map((_, i) => `(event OnClicked(GC${i + 1})\n  (Variables|Default|SetGalCat (select (== ${DV('GalCat')} ${i}) -1 ${i}))\n  (CallFunction|RGal0)\n  (CallFunction|RGal1))`),
  ...GAL.map((_, i) => `(event OnClicked(GI${i})\n  (CallFunction|GalOpen :I ${i}))`),
  `(event OnClicked(LbPrev)\n  (CallFunction|LbStep :D -1))`,
  `(event OnClicked(LbNext)\n  (CallFunction|LbStep :D 1))`,
  `(event OnClicked(LbClose)\n  ${VIS('LB', 'Collapsed')})`,
  ...[['QR1', 0], ['QR2', 1], ['QR3', 2], ['QS0', 3], ['QS1', 4], ['QS2', 5]].map(([b, k]) => `(event OnClicked(${b})\n  (CallFunction|QChip :K ${k}))`),
  `(event OnClicked(QReset)\n  (CallFunction|QClear)\n  (CallFunction|Refresh))`,
  `(event OnClicked(QPrev)\n  (CallFunction|QPageBy :D -1))`,
  `(event OnClicked(QNext)\n  (CallFunction|QPageBy :D 1))`,
  ...Array.from({ length: QN }, (_, k) => `(event OnClicked(QL${k})\n  (CallFunction|QPick :K ${k}))`),
  ...['QA', 'QF', 'QP'].flatMap((p) => ['Min', 'Max'].map((k) => `(event OnValueChanged(Sl${p}${k}) (Value)\n  (CallFunction|On${p}${k} :Value Value))`)),
].join('\n'));
console.log('compile2', await U.compile());

// ---------- data + looks on the defaults
const ST_I = { free: 0, reserved: 1, sold: 2 };
const apts = D.apts;
const RN = [], RA = [], RS = [], RC = [];
for (const a of apts) {
  const list = a.index >= 0 ? D.rooms[`${a.floor}-${a.index}`] || [] : [];
  RS.push(RN.length); RC.push(list.length);
  for (const r of list) { RN.push(r.name); RA.push(r.area); }
}
const walk = apts.map((a) => (a.index >= 0 ? D.walk[`${a.floor}-${a.index}`] : null) || [-1, -1]);
const FC = new Array(20 * 17).fill(0), FF = new Array(20 * 17).fill(0), FA = new Array(20 * 17 * 7).fill(-1);
apts.forEach((a, i) => { const k = (a.block - 1) * 17 + a.floor; const j = FC[k]++; if (a.status === 'free') FF[k]++; if (j < 7) FA[k * 7 + j] = i; });
const per = (b, fn) => fn(apts.filter((a) => a.block === b.id));
const gab = (b) => (D.type4.includes(b.id) ? '29,7×18,1 m' : `${Math.max(b.w, b.d).toFixed(0)}×${Math.min(b.w, b.d).toFixed(0)} m`);
const J = JSON.stringify;
const BS_ = D.blocks.map((b) => apts.findIndex((a) => a.block === b.id)), BC_ = D.blocks.map((b) => apts.filter((a) => a.block === b.id).length);
if (D.blocks.some((b, i) => apts.slice(BS_[i], BS_[i] + BC_[i]).some((a) => a.block !== b.id))) throw new Error('flats of a block are not contiguous');
const py_ = `
import unreal
bp = unreal.load_asset("${DIR}/${NAME}")
cdo = unreal.get_default_object(bp.generated_class())
sp = cdo.set_editor_property
sp("ABlock", ${J(apts.map((a) => a.block))}); sp("AFloor", ${J(apts.map((a) => a.floor))}); sp("ANum", ${J(apts.map((a) => a.num))})
sp("ARooms", ${J(apts.map((a) => a.rooms))}); sp("APrice", ${J(apts.map((a) => a.price))}); sp("AStat", ${J(apts.map((a) => ST_I[a.status]))})
sp("AArea", ${J(apts.map((a) => a.area))}); sp("AWX", ${J(walk.map((w) => w[0]))}); sp("AWY", ${J(walk.map((w) => w[1]))})
sp("RStart", ${J(RS)}); sp("RCount", ${J(RC)}); sp("RName", ${J(RN)}); sp("RArea", ${J(RA)})
sp("BTotal", ${J(D.blocks.map((b) => b.total))}); sp("BFree", ${J(D.blocks.map((b) => b.free))}); sp("BRes", ${J(D.blocks.map((b) => b.reserved))}); sp("BSold", ${J(D.blocks.map((b) => b.sold))})
sp("BT4", ${J(D.blocks.map((b) => (D.type4.includes(b.id) ? 1 : 0)))}); sp("BGab", ${J(D.blocks.map(gab))})
sp("BMinA", ${J(D.blocks.map((b) => per(b, (l) => Math.min(...l.map((a) => a.area)))))}); sp("BMaxA", ${J(D.blocks.map((b) => per(b, (l) => Math.max(...l.map((a) => a.area)))))})
${[1, 2, 3].map((r) => `sp("BMix${r}", ${J(D.blocks.map((b) => per(b, (l) => l.filter((a) => a.rooms === r).length)))})`).join('\n')}
sp("FCount", ${J(FC)}); sp("FFree", ${J(FF)}); sp("FApt", ${J(FA)})
sp("BStart", ${J(BS_)}); sp("BCount", ${J(BC_)}); sp("BALo", ${J(D.blocks.map((b) => per(b, (l) => Math.floor(Math.min(...l.map((a) => a.area))))))}); sp("BAHi", ${J(D.blocks.map((b) => per(b, (l) => Math.ceil(Math.max(...l.map((a) => a.area))))))})
sp("BPLo", ${J(D.blocks.map((b) => per(b, (l) => Math.floor(Math.min(...l.map((a) => a.price)) / 1000) * 1000)))}); sp("BPHi", ${J(D.blocks.map((b) => per(b, (l) => Math.ceil(Math.max(...l.map((a) => a.price)) / 1000) * 1000)))})
sp("TxtInk", unreal.SlateColor(specified_color=${lc(INK)}))
sp("GCat", ${J(GAL.map((g) => GCATS.findIndex((c) => c[0] === g.cat)))}); sp("GT4", ${J(GAL.map((g) => (g.type4 ? 1 : 0)))}); sp("GCap", ${J(GAL.map((g) => g.uz))})
sp("GTex", [unreal.load_asset(p) for p in ${J(GAL.map((g) => texOf(g.src, false).split('.')[0]))}])
sp("PCat", ${J(D.places.map((p) => CATS.findIndex((c) => c[0] === p.cat)))})
sp("BMx", ${J(D.blocks.map((b) => Math.round(((b.x + D.planSize.w / 2) / D.planSize.w) * GW * 10) / 10))}); sp("BMy", ${J(D.blocks.map((b) => Math.round(((b.z + D.planSize.d / 2) / D.planSize.d) * SITE_H * 10) / 10))})
sp("ColFree", ${lc(ST.free)}); sp("ColRes", ${lc(ST.reserved)}); sp("ColSold", ${lc(ST.sold)})
sp("TxtDark", unreal.SlateColor(specified_color=${lc(BG2)})); sp("TxtMut", unreal.SlateColor(specified_color=${lc(MUT)}))
for v, t in (("StNavOn", "TplNavOn"), ("StNavOff", "TplNavOff"), ("StFlOn", "TplFlOn"), ("StFlOff", "TplFlOff"), ("StAiOn", "TplAiOn"), ("StAiOff", "TplAiOff"), ("StChOn", "TplChOn"), ("StChOff", "TplChOff"), ("StHrOn", "TplHrOn"), ("StHrOff", "TplHrOff")):
    w = unreal.find_object(None, "${DIR}/${NAME}.${NAME}:WidgetTree." + t)
    sp(v, w.get_editor_property("widget_style"))
print("cdo ok", len(cdo.get_editor_property("ABlock")), "saved", unreal.EditorAssetLibrary.save_loaded_asset(bp, False))
`;
const pyf = new URL('../out/_block_cdo.py', import.meta.url);
fs.writeFileSync(pyf, py_);
console.log(String(await py(`exec(open(r"${pyf.pathname.replace(/^\//, '')}", encoding="utf-8").read())`).catch((e) => 'ERR ' + e.message.slice(-600))).trim());
await relinkCtl();
