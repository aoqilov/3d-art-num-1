// WBP_Sales — the web app's sales UI (src/App.tsx, complex screen) rebuilt 1:1 in UMG (owner 2026-11-23: web style first).
//   header   brand "OBOD MASKAN" + DEMO price pill                                  (App.tsx .top .brand / .demo)
//   panel    right, dark glass (rgba(9,40,29,.78), 14 px radius, blur), 340 px wide    (styles.css .panel)
//            "Majmua": KPIs, status bar + legend, hint, 20 block cells (4 per row)
//            "N-blok": back, title, 3D button (type-4), KPIs, status bar, floor buttons (Hammasi 16..1), flats table
// Data: tools/unreal/out/sales.json (node tools/unreal/sales_export.mjs — the web's own modules), stored as arrays on the
// widget's defaults. Safe to re-run: deletes and rebuilds the widget.   node sales_ui.mjs   (from tools/unreal/ue_graphs)
import fs from 'node:fs';
import { init, call, UMG, OBJ, BP, py, ref } from './ue.mjs';
await init();
const D = JSON.parse(fs.readFileSync(new URL('../out/sales.json', import.meta.url), 'utf8'));
const DIR = '/Game/Blok1/UI', NAME = 'WBP_Sales', W = `${DIR}/${NAME}.${NAME}`, wb = ref(W);

// ---------- colours: CSS sRGB -> Slate linear
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const C = (hex, a = 1) => { const n = parseInt(hex.slice(1), 16); return { R: lin(((n >> 16) & 255) / 255), G: lin(((n >> 8) & 255) / 255), B: lin((n & 255) / 255), A: a }; };
const INK = C('#f4f1ea'), MUT = C('#a7beb3'), GOLD = C('#e2c785'), DARK = C('#0a271d');
const FILL = C('#ffffff', 0.06), LINE = C('#ffffff', 0.11);
const ST = { free: C('#3fa66b'), reserved: C('#e0a63a'), sold: C('#c0584d') };
const px = (v) => v;                                          // CSS px -> Slate font size: 1:1 at 1080p (measured in PIE)

// ---------- widget helpers
const FNS = process.argv[2] === 'fns';
const VARS = [];
const bp = ref(W);
const BARW = 300;
if (!FNS) {
await py(`
p="${DIR}/${NAME}"
if unreal.EditorAssetLibrary.does_asset_exist(p): unreal.EditorAssetLibrary.delete_asset(p)
print("ok")`);
await call(UMG, 'CreateWidgetBlueprint', { folderPath: DIR, assetName: NAME, parentClass: ref('/Script/UMG.UserWidget') });
const add = async (cls, name, parent, isVar = false) => {
  const r = await call(UMG, 'AddWidget', { widgetBlueprint: wb, widgetClass: ref('/Script/UMG.' + cls), widgetDisplayName: name, parentWidget: parent ? parent.widget : null });
  if (isVar) VARS.push(name);
  return r;
};
const set = (o, values) => call(OBJ, 'set_properties', { instance: o, values: JSON.stringify(values) }).catch((e) => console.log('set fail', JSON.stringify(values).slice(0, 120), e.message.slice(0, 300)));
const rbox = (tint, r, outline = null, ow = 1) => ({ DrawAs: 'RoundedBox', TintColor: { SpecifiedColor: tint },
  OutlineSettings: { CornerRadii: { X: r, Y: r, Z: r, W: r }, Color: { SpecifiedColor: outline || { R: 0, G: 0, B: 0, A: 0 } }, Width: outline ? ow : 0, RoundingType: 'FixedRadius' } });
const pad = (l, t = l, r = l, b = t) => ({ Left: l, Top: t, Right: r, Bottom: b });
const box = async (name, parent, tint, r, padding, outline = null, isVar = false) => {
  const b = await add('Border', name, parent, isVar);
  await set(b.widget, { Background: rbox({ R: 1, G: 1, B: 1, A: 1 }, r, outline), BrushColor: tint, Padding: padding });
  return b;
};
const text = async (name, parent, s, size, color, bold = false, isVar = false, extra = {}) => {
  const t = await add('TextBlock', name, parent, isVar);
  await set(t.widget, { Text: s, Font: { FontObject: '/Engine/EngineFonts/Roboto.Roboto', TypefaceFontName: bold ? 'Bold' : 'Regular', Size: size, LetterSpacing: extra.ls || 0 },
    ColorAndOpacity: { SpecifiedColor: color }, ...(extra.wrap ? { AutoWrapText: true } : {}), ...(extra.just ? { Justification: extra.just } : {}) });
  return t;
};
const vslot = (o, p, fill = null, h = 'HAlign_Fill', v = 'VAlign_Fill') => set(o.slot, { Padding: p, Size: fill === null ? { SizeRule: 'Automatic', Value: 1 } : { SizeRule: 'Fill', Value: fill }, HorizontalAlignment: h, VerticalAlignment: v });
const btnStyle = (r, padY, on = false) => ({
  WidgetStyle: {
    Normal: rbox(on ? GOLD : { R: 1, G: 1, B: 1, A: 1 }, r, LINE),
    Hovered: rbox(on ? GOLD : { R: 1, G: 1, B: 1, A: 1 }, r, GOLD),
    Pressed: rbox(on ? GOLD : { R: 1, G: 1, B: 1, A: 1 }, r, GOLD),
    NormalPadding: pad(0, padY), PressedPadding: pad(0, padY),
  },
  BackgroundColor: FILL,
});
const sizeBox = async (name, parent, w, h, isVar = false) => {
  const s = await add('SizeBox', name, parent, isVar);
  await set(s.widget, { ...(w !== null ? { bOverride_WidthOverride: true, WidthOverride: w } : {}), ...(h !== null ? { bOverride_HeightOverride: true, HeightOverride: h } : {}) });
  return s;
};

// ---------- tree
const root = await add('CanvasPanel', 'Root');
// header (top-left)
const head = await add('HorizontalBox', 'Head', root);
await set(head.slot, { bAutoSize: true, LayoutData: { Offsets: pad(12, 12, 0, 0), Anchors: { Minimum: { X: 0, Y: 0 }, Maximum: { X: 0, Y: 0 } }, Alignment: { X: 0, Y: 0 } } });
const brand = await box('Brand', head, C('#1f4d3c'), 10, pad(14, 8));
await vslot(brand, pad(0), null, 'HAlign_Left', 'VAlign_Center');
const bv = await add('VerticalBox', 'BrandV', brand);
await text('BrandT', bv, 'OBOD MASKAN', px(15), C('#e3b878'), true, false, { ls: 120 });
await text('BrandS', bv, 'turar-joy majmuasi · 3D general plan', px(12), C('#ffffff', 0.85));
const demo = await box('Demo', head, C('#ffffff', 0.9), 8, pad(10, 6));
await vslot(demo, pad(10, 0, 0, 0), null, 'HAlign_Left', 'VAlign_Center');
await text('DemoT', demo, `DEMO · narx $${D.pricePerM2.toLocaleString('en-US').replace(/,/g, ' ')}/m²`, px(12), C('#16231d'), true);

// time of day (App.tsx .tog.time): the 7 stops; the hour lives in BP_Blok1Ctl, shared with WBP_Block
const HOURS = [4, 7, 10, 13, 16, 19, 23];
const tpill = await box('TimeP', head, C('#ffffff', 0.9), 8, pad(10, 4, 6, 4));
await vslot(tpill, pad(10, 0, 0, 0), null, 'HAlign_Left', 'VAlign_Center');
const timeH = await add('HorizontalBox', 'TimeH', tpill);
const sun = await text('Sun', timeH, '☀', px(13), C('#16231d'), false, true);
await set(sun.widget, { Visibility: 'Collapsed' });   // Roboto has no ☀ / ☾ glyph (drew a box)
await vslot(sun, pad(0, 0, 4, 0), null, 'HAlign_Left', 'VAlign_Center');
const hb_ = (on) => ({ WidgetStyle: { Normal: rbox(on ? C('#1f4d3c') : { R: 1, G: 1, B: 1, A: 0 }, 6), Hovered: rbox(on ? C('#1f4d3c') : C('#e9f1ec'), 6), Pressed: rbox(on ? C('#1f4d3c') : C('#e9f1ec'), 6), NormalPadding: pad(7, 3), PressedPadding: pad(7, 3) }, BackgroundColor: { R: 1, G: 1, B: 1, A: 1 } });
for (const h of HOURS) {
  const b = await add('Button', `H${h}`, timeH, true);
  await set(b.widget, hb_(h === 13));
  await vslot(b, pad(1, 0), null, 'HAlign_Left', 'VAlign_Center');
  await text(`H${h}T`, b, `${String(h).padStart(2, '0')}:00`, px(12.5), h === 13 ? C('#ffffff') : C('#2c3a33'), h === 13, true);
}
const tplS = await add('HorizontalBox', 'TplS', root);
await set(tplS.widget, { Visibility: 'Collapsed' });
for (const [n, on] of [['TplHOn', true], ['TplHOff', false]]) { const b = await add('Button', n, tplS); await set(b.widget, hb_(on)); }

// panel (right, under the header)
const blur = await add('BackgroundBlur', 'PanelBlur', root);
await set(blur.widget, { BlurStrength: 10, CornerRadius: { X: 14, Y: 14, Z: 14, W: 14 }, Padding: pad(0) });
await set(blur.slot, { LayoutData: { Offsets: { Left: -352, Top: 70, Right: 340, Bottom: 12 }, Anchors: { Minimum: { X: 1, Y: 0 }, Maximum: { X: 1, Y: 1 } }, Alignment: { X: 0, Y: 0 } } });
const glass = await box('Glass', blur, C('#09281d', 0.78), 14, pad(16), LINE);
const scroll = await add('ScrollBox', 'Scroll', glass);
await set(scroll.widget, { ScrollBarThickness: { X: 4, Y: 4 }, ScrollbarPadding: pad(0) });
const content = await add('VerticalBox', 'Content', scroll);

const kpis = async (prefix, parent, vals) => {
  const row = await add('HorizontalBox', prefix + 'Row', parent);
  await vslot(row, pad(0, 0, 0, 12));
  for (let i = 0; i < 3; i++) {
    const k = await box(`${prefix}${i}`, row, FILL, 10, pad(8), LINE);
    await vslot(k, pad(i ? 4 : 0, 0, i < 2 ? 4 : 0, 0), 1);
    const v = await add('VerticalBox', `${prefix}${i}V`, k);
    const b = await text(`${prefix}${i}B`, v, vals[i][0], px(17), INK, true, true, { just: 'Center' });
    await vslot(b, pad(0), null, 'HAlign_Center');
    const s = await text(`${prefix}${i}S`, v, vals[i][1], px(11), MUT, false, false, { just: 'Center' });
    await vslot(s, pad(0), null, 'HAlign_Center');
  }
};
const bar = async (prefix, parent, c, total) => {
  const ov = await add('Overlay', prefix + 'Bar', parent);
  await vslot(ov, pad(0));
  const track = await box(prefix + 'Track', ov, C('#ffffff', 0.12), 4, pad(0));
  await set(track.slot, { HorizontalAlignment: 'HAlign_Fill', VerticalAlignment: 'VAlign_Fill' });
  const tsb = await sizeBox(prefix + 'TrackH', track, null, 8);
  const hb = await add('HorizontalBox', prefix + 'Seg', ov);
  await set(hb.slot, { HorizontalAlignment: 'HAlign_Left', VerticalAlignment: 'VAlign_Fill' });
  for (const [k, key] of [['F', 'free'], ['R', 'reserved'], ['S', 'sold']]) {
    const sb = await sizeBox(prefix + 'W' + k, hb, Math.round((BARW * c[key]) / total * 10) / 10, 8, true);
    const seg = await box(prefix + 'C' + k, sb, ST[key], k === 'F' ? 4 : 0, pad(0));
  }
  const leg = await add('HorizontalBox', prefix + 'Leg', parent);
  await vslot(leg, pad(0, 6, 0, 0));
  for (const [k, key, label] of [['F', 'free', 'Sotuvda'], ['R', 'reserved', 'Bron'], ['S', 'sold', 'Sotilgan']]) {
    const dsb = await sizeBox(prefix + 'D' + k, leg, 9, 9);
    await vslot(dsb, pad(0, 0, 5, 0), null, 'HAlign_Left', 'VAlign_Center');
    await box(prefix + 'DC' + k, dsb, ST[key], 4.5, pad(0));
    const t = await text(prefix + 'L' + k, leg, `${label} ${c[key]}`, px(11), MUT, false, true);
    await vslot(t, pad(0, 0, 10, 0), null, 'HAlign_Left', 'VAlign_Center');
  }
};

// ----- Majmua view
const tot = { free: 0, reserved: 0, sold: 0 }; D.apts.forEach((a) => tot[a.status]++);
const vmaj = await add('VerticalBox', 'VMaj', content, true);
const h2m = await text('H2M', vmaj, 'Majmua', px(22), GOLD, true);
await vslot(h2m, pad(0, 0, 0, 12));
await kpis('KM', vmaj, [[String(D.blocks.length), 'blok'], [String(D.floors), 'qavat'], [String(D.total), 'xonadon']]);
await bar('BM', vmaj, tot, D.apts.length);
const hintm = await text('HintM', vmaj, 'Blokni xaritada yoki ro‘yxatdan tanlang. Aylantirish: sudrang, yaqinlashtirish: g‘ildirak.', px(12), MUT, false, false, { wrap: true });
await vslot(hintm, pad(0, 12, 0, 0));
const grid = await add('UniformGridPanel', 'Grid', vmaj);
await vslot(grid, pad(0, 8, 0, 0));
await set(grid.widget, { SlotPadding: pad(3) });
for (const [i, b] of D.blocks.entries()) {
  const cell = await add('Button', `Cell${b.id}`, grid, true);
  await set(cell.widget, btnStyle(10, 8));
  await set(cell.slot, { Row: Math.floor(i / 4), Column: i % 4, HorizontalAlignment: 'HAlign_Fill', VerticalAlignment: 'VAlign_Fill' });
  const cv = await add('VerticalBox', `Cell${b.id}V`, cell);
  await set(cv.slot, { HorizontalAlignment: 'HAlign_Center' });
  const cb = await text(`Cell${b.id}B`, cv, String(b.id), px(16), INK, true, false, { just: 'Center' });
  await vslot(cb, pad(0), null, 'HAlign_Center');
  const cs = await text(`Cell${b.id}S`, cv, `${b.free} ta`, px(11), MUT, false, false, { just: 'Center' });
  await vslot(cs, pad(0), null, 'HAlign_Center');
}

// ----- Blok view
const vblk = await add('VerticalBox', 'VBlk', content, true);
const back = await add('Button', 'Back', vblk, true);
await set(back.widget, { WidgetStyle: { Normal: { DrawAs: 'NoDrawType' }, Hovered: { DrawAs: 'NoDrawType' }, Pressed: { DrawAs: 'NoDrawType' }, NormalPadding: pad(0), PressedPadding: pad(0) } });
await vslot(back, pad(0, 0, 0, 8), null, 'HAlign_Left');
await text('BackT', back, '← Barcha bloklar', px(13), GOLD);
const h2b = await text('H2B', vblk, '1-blok', px(22), GOLD, true, true);
await vslot(h2b, pad(0, 0, 0, 12));
const go3d = await add('Button', 'Go3d', vblk, true);
await set(go3d.widget, { WidgetStyle: { Normal: rbox({ R: 1, G: 1, B: 1, A: 1 }, 10), Hovered: rbox({ R: 1, G: 1, B: 1, A: 1 }, 10, C('#ffffff', 0.5)), Pressed: rbox({ R: 1, G: 1, B: 1, A: 1 }, 10), NormalPadding: pad(0, 10), PressedPadding: pad(0, 10) }, BackgroundColor: GOLD });
await vslot(go3d, pad(0, 4, 0, 12));
await text('Go3dT', go3d, '3D bino: fasad va xonadonlar →', px(14), DARK, true, false, { just: 'Center' });
await kpis('KB', vblk, [[String(D.floors), 'qavat'], ['105', 'xonadon'], ['$34 960', 'dan']]);
await bar('BB', vblk, D.blocks[0], D.blocks[0].total);
const h3 = await text('H3Q', vblk, 'Qavat', px(14), INK, true);
await vslot(h3, pad(0, 16, 0, 8));
const ROWS = [[0, 16, 15, 14, 13], [12, 11, 10, 9, 8, 7], [6, 5, 4, 3, 2, 1]];
for (const [ri, row] of ROWS.entries()) {
  const hb = await add('HorizontalBox', `FRow${ri}`, vblk);
  await vslot(hb, pad(0, ri ? 5 : 0, 0, 0));
  for (const [ci, f] of row.entries()) {
    const fb = await add('Button', `F${f}`, hb, true);
    await set(fb.widget, btnStyle(8, 6));
    await vslot(fb, pad(ci ? 2.5 : 0, 0, ci < row.length - 1 ? 2.5 : 0, 0), f === 0 ? 2 : 1);
    const ft = await text(`F${f}T`, fb, f === 0 ? 'Hammasi' : String(f), px(13), INK, false, true, { just: 'Center' });
  }
}
const hintb = await text('HintB', vblk, 'Qavatni tanlasangiz, bino shu qavatgacha kesilib ko‘rsatiladi.', px(12), MUT, false, true, { wrap: true });
await vslot(hintb, pad(0, 12, 0, 0));
const table = await add('VerticalBox', 'Table', vblk, true);
await vslot(table, pad(0, 12, 0, 0));
const COLS = [['№', 0.9], ['Xona', 0.9], ['m²', 1.3], ['Narx', 1.6], ['', 0.5]];
const th = await add('HorizontalBox', 'TH', table);
await vslot(th, pad(4, 4, 4, 4));
for (const [i, [h, w]] of COLS.entries()) { const t = await text(`TH${i}`, th, h, px(11), MUT, true); await vslot(t, pad(0), w); }
for (let r = 0; r < 7; r++) {
  const rw = await add('VerticalBox', `R${r}`, table, true);
  const line = await sizeBox(`R${r}L`, rw, null, 1);
  await box(`R${r}LC`, line, C('#ffffff', 0.08), 0, pad(0));
  const hb = await add('HorizontalBox', `R${r}H`, rw);
  await vslot(hb, pad(4, 6, 4, 6));
  for (const [i, k] of ['N', 'X', 'A', 'P'].entries()) {
    const t = await text(`R${r}${k}`, hb, '', px(13), INK, false, true);
    await vslot(t, pad(0), COLS[i][1], 'HAlign_Fill', 'VAlign_Center');
  }
  const dc = await add('HorizontalBox', `R${r}DC`, hb);
  await vslot(dc, pad(0), COLS[4][1], 'HAlign_Fill', 'VAlign_Center');
  const dsb = await sizeBox(`R${r}DS`, dc, 9, 9);
  await vslot(dsb, pad(0), null, 'HAlign_Left', 'VAlign_Center');
  await box(`R${r}D`, dsb, ST.free, 4.5, pad(0), null, true);
}
const tip = await box('Tip', root, C('#1f4d3c'), 6, pad(9, 5), null, true);
await set(tip.slot, { bAutoSize: true, LayoutData: { Offsets: pad(0), Anchors: { Minimum: { X: 0, Y: 0 }, Maximum: { X: 0, Y: 0 } }, Alignment: { X: 0, Y: 0 } } });
await set(tip.widget, { Visibility: 'Collapsed' });
await text('TipT', tip, '1-blok · 61 ta sotuvda', px(12), C('#ffffff'), false, true);
console.log('tree built', VARS.length, 'vars');

// ---------- variables, events
for (const v of VARS) await call(UMG, 'ToggleWidgetAsVariable', { widgetBlueprint: wb, widget: ref(`${W}:WidgetTree.${v}`), bIsVariable: true });
const addVar = (name, type_name, container_type) => call(BP, 'add_variable', { blueprint: bp, name, type_name, ...(container_type ? { container_type } : {}) }).catch((e) => console.log('var', name, e.message.slice(0, 120)));
for (const v of ['SelBlock', 'SelFloor', 'RowK', 'Hover', 'TickN']) await addVar(v, 'int');
await addVar('TAcc', 'float');
for (const v of ['StHOn', 'StHOff']) await call(BP, 'add_struct_variable', { blueprint: bp, name: v, struct_type: ref('/Script/SlateCore.ButtonStyle') }).catch(() => {});
for (const v of ['TxtWhite', 'TxtDk']) await call(BP, 'add_struct_variable', { blueprint: bp, name: v, struct_type: ref('/Script/SlateCore.SlateColor') }).catch(() => {});
for (const v of ['ABlock', 'AFloor', 'ANum', 'ARooms', 'APrice', 'AStat', 'BTotal', 'BFree', 'BRes', 'BSold', 'BMin', 'BT4']) await addVar(v, 'int', 'ARRAY');
await addVar('AArea', 'float', 'ARRAY');
for (const v of ['ColOn', 'ColOff', 'ColFree', 'ColRes', 'ColSold']) await addVar(v, 'LinearColor');
for (const v of ['TxtOn', 'TxtOff']) await call(BP, 'add_struct_variable', { blueprint: bp, name: v, struct_type: ref('/Script/SlateCore.SlateColor') }).catch((e) => console.log('svar', v, e.message.slice(0, 120)));
console.log('compile1', JSON.stringify(await call(UMG, 'CompileWidgetBlueprint', { widgetBlueprint: wb })).slice(0, 200));
const BTNS = ['H4', 'H7', 'H10', 'H13', 'H16', 'H19', 'H23', 'Back', 'Go3d', ...D.blocks.map((b) => `Cell${b.id}`), ...Array.from({ length: 17 }, (_, f) => `F${f}`)];
for (const b of BTNS) await call(UMG, 'BindToEventProperty', { widgetBlueprint: wb, eventName: 'OnClicked', propertyName: b, propertyClass: ref('/Script/UMG.Button') });

}
// ---------- functions
const fn = async (name, ins, outs, code) => {
  await call(BP, 'add_function_graph', { blueprint: bp, graph_name: name }).catch(() => {});
  const g = ref(`${W}:${name}`);
  for (const [p, t] of ins) await call(BP, 'add_function_param', { graph: g, param_name: p, param_type: t, input_param: true }).catch(() => {});
  for (const [p, t] of outs) await call(BP, 'add_function_param', { graph: g, param_name: p, param_type: t, input_param: false }).catch(() => {});
  { let d = 0, q = false, ln = 1; const at = []; for (const ch of code) { if (ch === '\n') ln++; if (ch === '"') q = !q; if (q) continue; if (ch === '(') d++; if (ch === ')') { d--; if (d === 0) at.push(ln); } } if (d) console.log('  paren balance', name, d, 'top-level closes at lines', at.join(',')); }
  if (process.env.DUMP) fs.writeFileSync(`_dump_${name}.txt`, code);
  const r = await call(BP, 'write_graph_dsl', { graph: g, code }).then(() => 'ok').catch((e) => 'ERR ' + e.message.slice(0, 1500));
  console.log('fn', name, r);
};
const V = (n) => `(Variables|${NAME}|Get${n})`;
const G = (arr, i) => `(Utilities|Array|Get(acopy) (Variables|Default|Get${arr}) ${i})`;
const S = (n) => `(Utilities|String|ToString(Integer) ${n})`;
const A = (a, b) => `(Utilities|String|Append ${a} ${b})`;
const TX = (s) => `(Utilities|Text|ToText(String) ${s})`;
const SET = (w, s) => `(Widget|SetText(Text) :self ${V(w)} :InText ${TX(s)})`;
const VIS = (w, v) => `(Widget|SetVisibility :self ${V(w)} :InVisibility "${v}")`;

await fn('Usd', [['N', 'int']], [['S', 'string']], `
(fn Usd (N)
  (bind k (/ N 1000))
  (bind r (Math|Integer|%(Integer) N 1000))
  (bind rs ${S('r')})
  (return (select (< N 1000) ${A('"$"', S('N'))}
    ${A(A(A('"$"', S('k')), '" "'), `(select (< r 10) ${A('"00"', 'rs')} (select (< r 100) ${A('"0"', 'rs')} rs))`)})))`);

const floorStyle = Array.from({ length: 17 }, (_, f) => `
      (Class|Button|SetBackgroundColor :self ${V('F' + f)} :BackgroundColor (select (== f ${f}) (Variables|Default|GetColOn) (Variables|Default|GetColOff)))
      (Class|Text|SetColorandOpacity :self ${V(`F${f}T`)} :ColorAndOpacity (select (== f ${f}) (Variables|Default|GetTxtOn) (Variables|Default|GetTxtOff)))`).join('');
const rowCases = Array.from({ length: 7 }, (_, r) => `
              (if (== k ${r})
                ${SET(`R${r}N`, 'tn')}
                ${SET(`R${r}X`, 'tx')}
                (Widget|SetText(Text) :self ${V(`R${r}A`)} :InText ta)
                ${SET(`R${r}P`, 'tp')}
                (Class|Border|SetBrushColor :self ${V(`R${r}D`)} :BrushColor col))`).join('');
const rowVis = Array.from({ length: 7 }, (_, r) => `
          (if (< ${r} (Variables|Default|GetRowK)) ${VIS(`R${r}`, 'SelfHitTestInvisible')} (else ${VIS(`R${r}`, 'Collapsed')}))`).join('');
await fn('Refresh', [], [], `
(fn Refresh ()
  (bind b (Variables|Default|GetSelBlock))
  (bind f (Variables|Default|GetSelFloor))
  (if (== b 0)
    ${VIS('VMaj', 'SelfHitTestInvisible')}
    ${VIS('VBlk', 'Collapsed')}
    (else
      ${VIS('VMaj', 'Collapsed')}
      ${VIS('VBlk', 'SelfHitTestInvisible')}
      (bind i (- b 1))
      (bind tot ${G('BTotal', 'i')})
      (bind fr ${G('BFree', 'i')})
      (bind rs ${G('BRes', 'i')})
      (bind sd ${G('BSold', 'i')})
      (bind totf (Math|Conversions|ToFloat(Integer) tot))
      ${SET('H2B', A(S('b'), '"-blok"'))}
      ${SET('KB1B', S('tot'))}
      ${SET('KB2B', `(CallFunction|Usd :N ${G('BMin', 'i')})`)}
      (Class|SizeBox|SetWidthOverride :self ${V('BBWF')} :WidthOverride (/ (* ${BARW}.0 (Math|Conversions|ToFloat(Integer) fr)) totf))
      (Class|SizeBox|SetWidthOverride :self ${V('BBWR')} :WidthOverride (/ (* ${BARW}.0 (Math|Conversions|ToFloat(Integer) rs)) totf))
      (Class|SizeBox|SetWidthOverride :self ${V('BBWS')} :WidthOverride (/ (* ${BARW}.0 (Math|Conversions|ToFloat(Integer) sd)) totf))
      ${SET('BBLF', A('"Sotuvda "', S('fr')))}
      ${SET('BBLR', A('"Bron "', S('rs')))}
      ${SET('BBLS', A('"Sotilgan "', S('sd')))}
      (if (== ${G('BT4', 'i')} 1) ${VIS('Go3d', 'Visible')} (else ${VIS('Go3d', 'Collapsed')}))
      ${floorStyle}
      (if (== f 0)
        ${VIS('HintB', 'SelfHitTestInvisible')}
        ${SET('HintB', '"Qavatni tanlasangiz, bino shu qavatgacha kesilib ko‘rsatiladi."')}
        ${VIS('Table', 'Collapsed')}
        (elif (== f 1)
          ${VIS('HintB', 'SelfHitTestInvisible')}
          ${SET('HintB', '"1-qavat: savdo va tijorat maydonlari, xonadonlar yo‘q."')}
          ${VIS('Table', 'Collapsed')}
          (else
            ${VIS('HintB', 'Collapsed')}
            ${VIS('Table', 'SelfHitTestInvisible')}
            (Variables|Default|SetRowK 0)
            (bind n (Utilities|Array|Length (Variables|Default|GetABlock)))
            (for j (range n)
              (if (and (== ${G('ABlock', 'j')} b) (== ${G('AFloor', 'j')} f))
                (bind k (Variables|Default|GetRowK))
                (bind tn ${S(G('ANum', 'j'))})
                (bind tx ${S(G('ARooms', 'j'))})
                (bind ta (Utilities|Text|ToText(Float) :Value ${G('AArea', 'j')} :bUseGrouping false :MinimumFractionalDigits 2 :MaximumFractionalDigits 2))
                (bind tp (CallFunction|Usd :N ${G('APrice', 'j')}))
                (bind st ${G('AStat', 'j')})
                (bind col (select (== st 0) (Variables|Default|GetColFree) (select (== st 1) (Variables|Default|GetColRes) (Variables|Default|GetColSold))))
                ${rowCases}
                (Variables|Default|SetRowK (+ k 1))))
            ${rowVis}))))))`);
await fn('ShowBlock', [['B', 'int']], [], `
(fn ShowBlock (B)
  (Variables|Default|SetSelBlock B)
  (Variables|Default|SetSelFloor 0)
  (CallFunction|Refresh))`);
await fn('PickFloor', [['F', 'int']], [], `
(fn PickFloor (F)
  (Variables|Default|SetSelFloor F)
  (CallFunction|Refresh))`);

const HOURS_ = [4, 7, 10, 13, 16, 19, 23];
await fn('RTime', [], [], `
(fn RTime ()
  (bind ctl (Utilities|Casting|CastToBP_Blok1Ctl :Object (Actor|GetActorOfClass "/Game/Blok1/UI/BP_Blok1Ctl.BP_Blok1Ctl_C"))
    (:then
      (bind h (Class|BPBlok1Ctl|GetHour :self ctl))
      ${SET('Sun', '(select (and (>= h 7) (<= h 19)) "☀" "☾")')}${HOURS_.map((x) => `
      (Class|Button|SetStyle :self ${V('H' + x)} :WidgetStyle (select (== h ${x}) (Variables|Default|GetStHOn) (Variables|Default|GetStHOff)))
      (Class|Text|SetColorandOpacity :self ${V(`H${x}T`)} :ColorAndOpacity (select (== h ${x}) (Variables|Default|GetTxtWhite) (Variables|Default|GetTxtDk)))`).join('')})
    (:CastFailed)))`);
await fn('SetHour', [['H', 'int']], [], `
(fn SetHour (H)
  (bind ctl (Utilities|Casting|CastToBP_Blok1Ctl :Object (Actor|GetActorOfClass "/Game/Blok1/UI/BP_Blok1Ctl.BP_Blok1Ctl_C"))
    (:then
      (Class|BPBlok1Ctl|SetHour :self ctl :Hour H)
      (Utilities|Time|SetTimerbyFunctionName :Object (Class|BPBlok1Ctl|GetTimeW :self ctl) :FunctionName (Utilities|String|Append "Hour" (Utilities|String|ToString(Integer) H)) :Time 0.01)
      (CallFunction|RTime))
    (:CastFailed)))`);
await fn('OpenBlock', [['B', 'int']], [], `
(fn OpenBlock (B)
  (Widget|SetVisibility :self self :InVisibility "Collapsed")
  (Widget|SetVisibility :self (Variables|${NAME}|GetTip) :InVisibility "Collapsed")
  (bind ctl (Utilities|Casting|CastToBP_Blok1Ctl :Object (Actor|GetActorOfClass "/Game/Blok1/UI/BP_Blok1Ctl.BP_Blok1Ctl_C"))
    (:then
      (Utilities|Time|SetTimerbyFunctionName :Object (Class|BPBlok1Ctl|GetBlockW :self ctl) :FunctionName (Utilities|String|Append "OpenB" (Utilities|String|ToString(Integer) B)) :Time 0.01))
    (:CastFailed)))`);
// click = left press + release that moved < 5 px (BP_OrbitCam.TakeClick); a drag only orbits the camera
await fn('OrbClick', [], [['R', 'bool']], `
(fn OrbClick ()
  (bind orb (Utilities|Casting|CastToBP_OrbitCam :Object (Actor|GetActorOfClass "/Game/Blok1/UI/BP_OrbitCam.BP_OrbitCam_C"))
    (:then
      (return (Class|BPOrbitCam|TakeClick :self orb)))
    (:CastFailed
      (return false))))`);
await fn('Start', [], [], `
(fn Start ()
  (bind pc (Game|GetPlayerController 0))
  (Class|PlayerController|SetShowMouseCursor :self pc :bShowMouseCursor true)
  (Input|SetInputModeGameAndUI :PlayerController pc :InMouseLockMode "DoNotLock" :bHideCursorDuringCapture false)
  (CallFunction|SetHour :H 13)
  (bind cams (Actor|GetAllActorsWithTag "SCam0"))
  (bind orb (Utilities|Casting|CastToBP_OrbitCam :Object (Actor|GetActorOfClass "/Game/Blok1/UI/BP_OrbitCam.BP_OrbitCam_C"))
    (:then
      (if (> (Utilities|Array|Length cams) 0)
        (Class|BPOrbitCam|OrbitCam :self orb :Cam (Utilities|Array|Get(acopy) cams 0) :Mode 0)))
    (:CastFailed
      (if (> (Utilities|Array|Length cams) 0)
        (Game|Player|SetViewTargetWithBlend pc (Utilities|Array|Get(acopy) cams 0) 0.0)))))`);
await fn('Pick', [], [], `
(fn Pick ()
  (bind pc (Game|GetPlayerController 0))
  (bind (hit ok) (Game|Player|GetHitResultUnderCursorbyChannel :self pc :TraceChannel "TraceTypeQuery1" :bTraceComplex false))
  (Variables|Default|SetHover 0)
  (if ok
    (bind (h0 h1 h2 h3 h4 h5 h6 h7 h8 act h10 h11 h12 h13 h14 h15 h16 h17) (Collision|BreakHitResult hit))
    (Utilities|IsValid act
      (:"Is Valid"
        (if (Actor|ActorHasTag act "Blok1") (Variables|Default|SetHover 2))
        (if (Actor|ActorHasTag act "Blok2") (Variables|Default|SetHover 1))
        (for n (range 3 21)
          (if (Actor|ActorHasTag act (Utilities|String|StringToName (Utilities|String|Append "KB" (Utilities|String|ToString(Integer) n))))
            (Variables|Default|SetHover n))))
      (:"Is Not Valid"))))`);
const evs = [
  `(event UserInterface|EventConstruct\n  (CallFunction|Refresh))`,
  // start in the complex view once the game has settled (the player's BeginPlay sets view + input first), then 3D hover/click
  `(event UserInterface|EventTick (MyGeometry InDeltaTime)
  (if (== (Variables|Default|GetTickN) 0)
    (Variables|Default|SetTAcc (+ (Variables|Default|GetTAcc) InDeltaTime))
    (if (> (Variables|Default|GetTAcc) 1.5)
      (Variables|Default|SetTickN 1)
      (CallFunction|Start)))
  (CallFunction|Pick)
  (bind h (Variables|Default|GetHover))
  (if (> h 0)
    (Widget|SetVisibility :self (Variables|${NAME}|GetTip) :InVisibility "HitTestInvisible")
    (Widget|SetText(Text) :self (Variables|${NAME}|GetTipT) :InText (Utilities|Text|ToText(String) (Utilities|String|Append (Utilities|String|Append (Utilities|String|ToString(Integer) h) "-blok · ") (Utilities|String|Append (Utilities|String|ToString(Integer) (Utilities|Array|Get(acopy) (Variables|Default|GetBFree) (- h 1))) " ta sotuvda"))))
    (Widget|Transform|SetRenderTranslation :self (Variables|${NAME}|GetTip) :Translation (+ (Viewport|GetMousePositiononViewport) (Math|Vector2D|MakeVector2D 14.0 14.0)))
    (if (CallFunction|OrbClick)
      (CallFunction|OpenBlock :B h))
    (else
      (Widget|SetVisibility :self (Variables|${NAME}|GetTip) :InVisibility "Collapsed"))))`,
  `(event OnClicked(Back)\n  (CallFunction|ShowBlock :B 0))`,
  ...[4, 7, 10, 13, 16, 19, 23].map((h) => `(event OnClicked(H${h})\n  (CallFunction|SetHour :H ${h}))`),
  `(event OnClicked(Go3d))`,
  ...D.blocks.map((b) => `(event OnClicked(Cell${b.id})\n  (CallFunction|OpenBlock :B ${b.id}))`),
  ...Array.from({ length: 17 }, (_, f) => `(event OnClicked(F${f})\n  (CallFunction|PickFloor :F ${f}))`),
];
console.log('events', await call(BP, 'write_graph_dsl', { graph: ref(`${W}:EventGraph`), code: evs.join('\n') }).then(() => 'ok').catch((e) => 'ERR ' + e.message.slice(0, 1500)));
console.log('compile2', JSON.stringify(await call(UMG, 'CompileWidgetBlueprint', { widgetBlueprint: wb })).slice(0, 300));

// ---------- data + colours on the defaults
const ST_I = { free: 0, reserved: 1, sold: 2 };
const lc = (c) => `unreal.LinearColor(${c.R}, ${c.G}, ${c.B}, ${c.A})`;
const arr = (k) => JSON.stringify(D.apts.map((a) => a[k]));
fs.writeFileSync(new URL('../out/_sales_cdo.py', import.meta.url), `
import unreal, json
bp = unreal.load_asset("${DIR}/${NAME}")
cdo = unreal.get_default_object(bp.generated_class())
cdo.set_editor_property("ABlock", ${arr('block')})
cdo.set_editor_property("AFloor", ${arr('floor')})
cdo.set_editor_property("ANum", ${arr('num')})
cdo.set_editor_property("ARooms", ${arr('rooms')})
cdo.set_editor_property("APrice", ${arr('price')})
cdo.set_editor_property("AArea", ${arr('area')})
cdo.set_editor_property("AStat", ${JSON.stringify(D.apts.map((a) => ST_I[a.status]))})
cdo.set_editor_property("BTotal", ${JSON.stringify(D.blocks.map((b) => b.total))})
cdo.set_editor_property("BFree", ${JSON.stringify(D.blocks.map((b) => b.free))})
cdo.set_editor_property("BRes", ${JSON.stringify(D.blocks.map((b) => b.reserved))})
cdo.set_editor_property("BSold", ${JSON.stringify(D.blocks.map((b) => b.sold))})
cdo.set_editor_property("BMin", ${JSON.stringify(D.blocks.map((b) => b.minPrice))})
cdo.set_editor_property("BT4", ${JSON.stringify(D.blocks.map((b) => (D.type4.includes(b.id) ? 1 : 0)))})
cdo.set_editor_property("ColOn", ${lc(GOLD)})
cdo.set_editor_property("ColOff", ${lc(FILL)})
cdo.set_editor_property("ColFree", ${lc(ST.free)})
cdo.set_editor_property("ColRes", ${lc(ST.reserved)})
cdo.set_editor_property("ColSold", ${lc(ST.sold)})
cdo.set_editor_property("TxtOn", unreal.SlateColor(specified_color=${lc(DARK)}))
cdo.set_editor_property("TxtOff", unreal.SlateColor(specified_color=${lc(INK)}))
cdo.set_editor_property("TxtWhite", unreal.SlateColor(specified_color=${lc(C('#ffffff'))}))
cdo.set_editor_property("TxtDk", unreal.SlateColor(specified_color=${lc(C('#2c3a33'))}))
for v_, t_ in (("StHOn", "TplHOn"), ("StHOff", "TplHOff")):
    w_ = unreal.find_object(None, "${DIR}/${NAME}.${NAME}:WidgetTree." + t_)
    cdo.set_editor_property(v_, w_.get_editor_property("widget_style"))
print("cdo ok", len(cdo.get_editor_property("ABlock")), "saved", unreal.EditorAssetLibrary.save_loaded_asset(bp, False))
`);
console.log(String(await py(`exec(open(r"${new URL('../out/_sales_cdo.py', import.meta.url).pathname.replace(/^\//, '')}", encoding="utf-8").read())`)).trim());

// ---------- BP_Blok1Ctl creates the widget on BeginPlay: rebuilding WBP_Sales (delete + create) leaves its Create Widget
// node without a class, so PIE stops on a compile-error dialog. Rewrite its graph (re-resolves the class path) + compile.
{
  const CT = '/Game/Blok1/UI/BP_Blok1Ctl.BP_Blok1Ctl', cg = ref(`${CT}:EventGraph`);
  const code = String(await call(BP, 'read_graph_dsl', { graph: cg }));
  const fixed = code.includes('WBP_Sales_C') ? code : code.replace(/\(UserInterface\|CreateWidget\s+(?:0\s+|None\s+|\"\"\s+)?_returnvalue\)/, '(UserInterface|CreateWidget "/Game/Blok1/UI/WBP_Sales.WBP_Sales_C" _returnvalue)');
  console.log('ctl', await call(BP, 'write_graph_dsl', { graph: cg, code: fixed }).then(() => 'ok').catch((e) => 'ERR ' + e.message.slice(0, 300)));
  await call(BP, 'compile_blueprint', { blueprint: ref(CT) }).catch((e) => console.log('ctl compile', e.message.slice(0, 200)));
  console.log('ctl has sales', String(await call(BP, 'read_graph_dsl', { graph: cg })).includes('WBP_Sales_C'));
}
