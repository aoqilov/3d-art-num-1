// Shared helpers for the web-style UMG widgets (sales_ui.mjs, block_ui.mjs): colours (CSS sRGB -> Slate linear),
// rounded glass boxes, text, slots, buttons, and DSL snippets. Every widget builder deletes + recreates its asset.
import fs from 'node:fs';
import { call, UMG, OBJ, BP, py, ref } from './ue.mjs';

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const C = (hex, a = 1) => { const n = parseInt(hex.slice(1), 16); return { R: lin(((n >> 16) & 255) / 255), G: lin(((n >> 8) & 255) / 255), B: lin((n & 255) / 255), A: a }; };
export const WHITE = { R: 1, G: 1, B: 1, A: 1 }, NONE = { R: 0, G: 0, B: 0, A: 0 };
export const pad = (l, t = l, r = l, b = t) => ({ Left: l, Top: t, Right: r, Bottom: b });
export const rbox = (tint, r, outline = null, ow = 1) => ({ DrawAs: 'RoundedBox', TintColor: { SpecifiedColor: tint },
  OutlineSettings: { CornerRadii: { X: r, Y: r, Z: r, W: r }, Color: { SpecifiedColor: outline || NONE }, Width: outline ? ow : 0, RoundingType: 'FixedRadius' } });
export const lc = (c) => `unreal.LinearColor(${c.R}, ${c.G}, ${c.B}, ${c.A})`;

/** Widget-tree builder for one widget blueprint. */
export async function widget(DIR, NAME, fresh = true) {
  const W = `${DIR}/${NAME}.${NAME}`, wb = ref(W), VARS = [];
  if (fresh) {
    await py(`
p="${DIR}/${NAME}"
if unreal.EditorAssetLibrary.does_asset_exist(p): unreal.EditorAssetLibrary.delete_asset(p)
print("ok")`);
    await call(UMG, 'CreateWidgetBlueprint', { folderPath: DIR, assetName: NAME, parentClass: ref('/Script/UMG.UserWidget') });
  }
  const add = async (cls, name, parent, isVar = false) => {
    const r = await call(UMG, 'AddWidget', { widgetBlueprint: wb, widgetClass: ref('/Script/UMG.' + cls), widgetDisplayName: name, parentWidget: parent ? parent.widget : null });
    if (isVar) VARS.push(name);
    return r;
  };
  const set = (o, values) => call(OBJ, 'set_properties', { instance: o, values: JSON.stringify(values) }).catch((e) => console.log('set fail', JSON.stringify(values).slice(0, 120), e.message.slice(0, 300)));
  const box = async (name, parent, tint, r, padding, outline = null, isVar = false) => {
    const b = await add('Border', name, parent, isVar);
    await set(b.widget, { Background: rbox(WHITE, r, outline), BrushColor: tint, Padding: padding });
    return b;
  };
  const text = async (name, parent, s, size, color, weight = 'Regular', isVar = false, extra = {}) => {
    const t = await add('TextBlock', name, parent, isVar);
    await set(t.widget, { Text: s, Font: { FontObject: '/Engine/EngineFonts/Roboto.Roboto', TypefaceFontName: weight === true ? 'Bold' : weight, Size: size, LetterSpacing: extra.ls || 0 },
      ColorAndOpacity: { SpecifiedColor: color }, ...(extra.wrap ? { AutoWrapText: true } : {}), ...(extra.just ? { Justification: extra.just } : {}) });
    return t;
  };
  /** Vertical/HorizontalBox slot: padding, fill weight (null = auto), alignment. */
  const slot = (o, p, fill = null, h = 'HAlign_Fill', v = 'VAlign_Fill') => set(o.slot, { Padding: p, Size: fill === null ? { SizeRule: 'Automatic', Value: 1 } : { SizeRule: 'Fill', Value: fill }, HorizontalAlignment: h, VerticalAlignment: v });
  const canvas = (o, offsets, anchors, align = { X: 0, Y: 0 }, auto = false) => set(o.slot, { bAutoSize: auto, LayoutData: { Offsets: offsets, Anchors: anchors, Alignment: align } });
  const sizeBox = async (name, parent, w, h, isVar = false) => {
    const s = await add('SizeBox', name, parent, isVar);
    await set(s.widget, { ...(w !== null ? { bOverride_WidthOverride: true, WidthOverride: w } : {}), ...(h !== null ? { bOverride_HeightOverride: true, HeightOverride: h } : {}) });
    return s;
  };
  /** Button with fill/outline per state; tint multiplies (BackgroundColor). */
  const button = async (name, parent, { r = 12, padX = 0, padY = 0, fill = C('#ffffff', 0.06), hover = C('#ffffff', 0.12), line = null, hoverLine = null } = {}, isVar = true) => {
    const b = await add('Button', name, parent, isVar);
    await set(b.widget, { WidgetStyle: { Normal: rbox(fill, r, line), Hovered: rbox(hover, r, hoverLine || line), Pressed: rbox(hover, r, hoverLine || line),
      NormalPadding: pad(padX, padY), PressedPadding: pad(padX, padY) }, BackgroundColor: WHITE });
    return b;
  };
  const glass = async (name, parent, r, padding, isVar = false) => {
    const blur = await add('BackgroundBlur', name + 'Blur', parent, isVar);
    await set(blur.widget, { BlurStrength: 10, CornerRadius: { X: r, Y: r, Z: r, W: r }, Padding: pad(0) });
    const g = await box(name, blur, C('#09281d', 0.78), r, padding, C('#ffffff', 0.11));
    return { blur, g };
  };
  const toggleVars = async () => { for (const v of VARS) await call(UMG, 'ToggleWidgetAsVariable', { widgetBlueprint: wb, widget: ref(`${W}:WidgetTree.${v}`), bIsVariable: true }); };
  const compile = async () => JSON.stringify(await call(UMG, 'CompileWidgetBlueprint', { widgetBlueprint: wb })).slice(0, 200);
  const bindClicks = async (names) => { for (const b of names) await call(UMG, 'BindToEventProperty', { widgetBlueprint: wb, eventName: 'OnClicked', propertyName: b, propertyClass: ref('/Script/UMG.Button') }); };
  const addVar = (name, type_name, container_type) => call(BP, 'add_variable', { blueprint: wb, name, type_name, ...(container_type ? { container_type } : {}) }).catch((e) => console.log('var', name, e.message.slice(0, 120)));
  const addStruct = (name, struct) => call(BP, 'add_struct_variable', { blueprint: wb, name, struct_type: ref(struct) }).catch((e) => console.log('svar', name, e.message.slice(0, 120)));
  const fn = async (name, ins, outs, code) => {
    await call(BP, 'add_function_graph', { blueprint: wb, graph_name: name }).catch(() => {});
    const g = ref(`${W}:${name}`);
    for (const [p, t] of ins) await call(BP, 'add_function_param', { graph: g, param_name: p, param_type: t, input_param: true }).catch(() => {});
    for (const [p, t] of outs) await call(BP, 'add_function_param', { graph: g, param_name: p, param_type: t, input_param: false }).catch(() => {});
    { let d = 0, q = false, ln = 1; const at = []; for (const ch of code) { if (ch === '\n') ln++; if (ch === '"') q = !q; if (q) continue; if (ch === '(') d++; if (ch === ')') { d--; if (d === 0) at.push(ln); } } if (d) console.log('  paren balance', name, d); }
    if (process.env.DUMP) fs.writeFileSync(`_dump_${NAME}_${name}.txt`, code);
    const r = await call(BP, 'write_graph_dsl', { graph: g, code }).then(() => 'ok').catch((e) => 'ERR ' + e.message.slice(0, 1500));
    console.log('fn', name, r);
    return r;
  };
  /** Functions that call each other: create every graph + its params first, compile, then write the bodies. */
  const fnAll = async (list) => {
    for (const [name, ins, outs] of list) {
      await call(BP, 'add_function_graph', { blueprint: wb, graph_name: name }).catch(() => {});
      const g = ref(`${W}:${name}`);
      for (const [p, t] of ins) await call(BP, 'add_function_param', { graph: g, param_name: p, param_type: t, input_param: true }).catch(() => {});
      for (const [p, t] of outs) await call(BP, 'add_function_param', { graph: g, param_name: p, param_type: t, input_param: false }).catch(() => {});
    }
    await call(UMG, 'CompileWidgetBlueprint', { widgetBlueprint: wb }).catch(() => {});
    const bad = [];
    for (const [name, , , code] of list) if ((await fn(name, [], [], code)) !== 'ok') bad.push(name);
    return bad;
  };
  const events = async (code) => {
    if (process.env.DUMP) fs.writeFileSync(`_dump_${NAME}_EventGraph.txt`, code);
    const r = await call(BP, 'write_graph_dsl', { graph: ref(`${W}:EventGraph`), code }).then(() => 'ok').catch((e) => 'ERR ' + e.message.slice(0, 1500));
    console.log('events', r);
  };
  return { W, wb, VARS, add, set, box, text, slot, canvas, sizeBox, button, glass, toggleVars, compile, bindClicks, addVar, addStruct, fn, fnAll, events };
}

// ---------- DSL snippets (NAME = widget blueprint name for widget-variable getters)
export const dsl = (NAME) => {
  const V = (n) => `(Variables|${NAME}|Get${n})`;
  const D = (n) => `(Variables|Default|Get${n})`;
  const G = (arr, i) => `(Utilities|Array|Get(acopy) (Variables|Default|Get${arr}) ${i})`;
  const S = (n) => `(Utilities|String|ToString(Integer) ${n})`;
  const A = (...xs) => xs.reduce((a, b) => `(Utilities|String|Append ${a} ${b})`);
  const TX = (s) => `(Utilities|Text|ToText(String) ${s})`;
  const SET = (w, s) => `(Widget|SetText(Text) :self ${V(w)} :InText ${TX(s)})`;
  const SETT = (w, t) => `(Widget|SetText(Text) :self ${V(w)} :InText ${t})`;
  const VIS = (w, v) => `(Widget|SetVisibility :self ${V(w)} :InVisibility "${v}")`;
  const SHOW = (w, cond) => `(if ${cond} ${VIS(w, 'SelfHitTestInvisible')} (else ${VIS(w, 'Collapsed')}))`;
  const SHOWV = (w, cond) => `(if ${cond} ${VIS(w, 'Visible')} (else ${VIS(w, 'Collapsed')}))`;
  const F2 = (x) => `(Utilities|Text|ToText(Float) :Value ${x} :bUseGrouping false :MinimumFractionalDigits 2 :MaximumFractionalDigits 2)`;
  const F1 = (x) => `(Utilities|Text|ToText(Float) :Value ${x} :bUseGrouping false :MinimumFractionalDigits 1 :MaximumFractionalDigits 1)`;
  const I2F = (x) => `(Math|Conversions|ToFloat(Integer) ${x})`;
  return { V, D, G, S, A, TX, SET, SETT, VIS, SHOW, SHOWV, F2, F1, I2F };
};
/** "$54 400" (web usd()): a function body for a widget, input N (int), output S (string). */
export const USD_FN = `
(fn Usd (N)
  (bind k (/ N 1000))
  (bind r (Math|Integer|%(Integer) N 1000))
  (bind rs (Utilities|String|ToString(Integer) r))
  (return (select (< N 1000) (Utilities|String|Append "$" (Utilities|String|ToString(Integer) N))
    (Utilities|String|Append (Utilities|String|Append (Utilities|String|Append "$" (Utilities|String|ToString(Integer) k)) " ") (select (< r 10) (Utilities|String|Append "00" rs) (select (< r 100) (Utilities|String|Append "0" rs) rs))))))`;

/** BP_Blok1Ctl creates the sales widgets on BeginPlay: after a widget is deleted + recreated its Create Widget node loses the
 *  class (PIE then stops on a compile-error dialog). Rewrite the graph with the class paths and compile. */
export async function relinkCtl() {
  const CT = '/Game/Blok1/UI/BP_Blok1Ctl.BP_Blok1Ctl', cg = ref(`${CT}:EventGraph`);
  // the controller keeps both widgets (SalesW / BlockW): they reach each other through it (typed, no widget search)
  for (const v of ['SalesW', 'BlockW']) await call(BP, 'add_object_variable', { blueprint: ref(CT), name: v, object_class: ref('/Script/UMG.UserWidget') }).catch(() => {});
  await call(BP, 'compile_blueprint', { blueprint: ref(CT) }).catch(() => {});
  let code = String(await call(BP, 'read_graph_dsl', { graph: cg }));
  code = code.replace(/\n\s*\(Variables\|Default\|Set(SalesW|BlockW) _returnvalue_[45]\)/g, '');
  const want = [['_returnvalue_4', 'WBP_Sales', 4, 'SalesW'], ['_returnvalue_5', 'WBP_Block', 5, 'BlockW']];
  for (const [v, n, z, keep] of want) {
    const re = new RegExp(`\\(bind ${v} \\(UserInterface\\|CreateWidget[^\\n]*\\n\\s*\\(UserInterface\\|Viewport\\|AddToViewport ${v} ${z}\\)\\n`);
    const line = `(bind ${v} (UserInterface|CreateWidget "/Game/Blok1/UI/${n}.${n}_C" _returnvalue))\n  (UserInterface|Viewport|AddToViewport ${v} ${z})\n  (Variables|Default|Set${keep} ${v})\n`;
    if (re.test(code)) code = code.replace(re, line + '  ');
    else code = code.replace('(Development|ExecuteConsoleCommand "r.LumenScene', line + '  (Development|ExecuteConsoleCommand "r.LumenScene');
  }
  const r = await call(BP, 'write_graph_dsl', { graph: cg, code }).then(() => 'ok').catch((e) => 'ERR ' + e.message.slice(0, 300));
  await call(BP, 'compile_blueprint', { blueprint: ref(CT) }).catch((e) => console.log('ctl compile', e.message.slice(0, 200)));
  const back = String(await call(BP, 'read_graph_dsl', { graph: cg }));
  console.log('ctl', r, 'sales', back.includes('WBP_Sales_C'), 'block', back.includes('WBP_Block_C'));
}
