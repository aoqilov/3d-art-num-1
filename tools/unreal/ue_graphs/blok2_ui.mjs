// WBP_Blok2: bottom-centre bar for the block-2 construction: "Blok-2 · N/16" + [-1] [+1] [Play] [Pardozlash]. The buttons call
// BP_Qurilish (Blok2_Ctl) Minus / Plus / PlayBtn; the text follows its N and Playing every tick.
import { init, call, UMG, OBJ, BP, py, ref } from './ue.mjs';
await init();
const DIR = '/Game/Blok1/UI', NAME = 'WBP_Blok2', W = `${DIR}/${NAME}.${NAME}`, wb = ref(W);
await py(`
p="${DIR}/${NAME}"
if unreal.EditorAssetLibrary.does_asset_exist(p): unreal.EditorAssetLibrary.delete_asset(p)
print("ok")`);
await call(UMG, 'CreateWidgetBlueprint', { folderPath: DIR, assetName: NAME, parentClass: ref('/Script/UMG.UserWidget') });
const add = (cls, name, parent) => call(UMG, 'AddWidget', { widgetBlueprint: wb, widgetClass: ref(cls), widgetDisplayName: name, parentWidget: parent || null });
const set = (obj, values) => call(OBJ, 'set_properties', { instance: obj, values: JSON.stringify(values) }).catch((e) => console.log('set fail', e.message.slice(0, 200)));
const root = await add('/Script/UMG.CanvasPanel', 'Root');
const bar = await add('/Script/UMG.Border', 'Bar', root.widget);
await set(bar.widget, { BrushColor: { R: 0.05, G: 0.055, B: 0.06, A: 0.78 }, Padding: { Left: 14, Top: 8, Right: 14, Bottom: 8 } });
await set(bar.slot, { bAutoSize: true, LayoutData: { Offsets: { Left: 0, Top: -24, Right: 0, Bottom: 0 }, Anchors: { Minimum: { X: 0.5, Y: 1 }, Maximum: { X: 0.5, Y: 1 } }, Alignment: { X: 0.5, Y: 1 } } });
const row = await add('/Script/UMG.HorizontalBox', 'Row', bar.widget);
const txt = await add('/Script/UMG.TextBlock', 'Txt', row.widget);
await set(txt.widget, { Text: 'Blok-2 · 6/16 qavat', Font: { Size: 18 }, ColorAndOpacity: { SpecifiedColor: { R: 0.95, G: 0.82, B: 0.6, A: 1 } } });
await set(txt.slot, { Padding: { Left: 4, Top: 6, Right: 18, Bottom: 0 }, VerticalAlignment: 'VAlign_Center' });
for (const [b, label] of [['BMinus', '−1'], ['BPlus', '+1'], ['BPlay', '▶  Play'], ['BPardoz', 'Pardozlash']]) {  // new buttons are not variables: toggled on below, once
  const btn = await add('/Script/UMG.Button', b, row.widget);
  await set(btn.widget, { BackgroundColor: { R: 0.16, G: 0.17, B: 0.19, A: 1 } });
  await set(btn.slot, { Padding: { Left: 4, Top: 0, Right: 4, Bottom: 0 } });
  const t = await add('/Script/UMG.TextBlock', b + 'T', btn.widget);
  await set(t.widget, { Text: label, Font: { Size: 18 }, Justification: 'Center', ColorAndOpacity: { SpecifiedColor: { R: 1, G: 1, B: 1, A: 1 } } });
}
for (const b of ['BMinus', 'BPlus', 'BPlay', 'BPardoz']) await call(UMG, 'ToggleWidgetAsVariable', { widgetBlueprint: wb, widget: ref(`${W}:WidgetTree.${b}`), bIsVariable: true });
await call(UMG, 'ToggleWidgetAsVariable', { widgetBlueprint: wb, widget: ref(`${W}:WidgetTree.Txt`), bIsVariable: true });
await call(UMG, 'ToggleWidgetAsVariable', { widgetBlueprint: wb, widget: ref(`${W}:WidgetTree.BPlayT`), bIsVariable: true });
await call(UMG, 'ToggleWidgetAsVariable', { widgetBlueprint: wb, widget: ref(`${W}:WidgetTree.BPardozT`), bIsVariable: true });
console.log('compile1', JSON.stringify(await call(UMG, 'CompileWidgetBlueprint', { widgetBlueprint: wb })));
// button events must exist before the DSL can use them: (event OnClicked(BMinus) ...)
for (const b of ['BMinus', 'BPlus', 'BPlay', 'BPardoz'])
  await call(UMG, 'BindToEventProperty', { widgetBlueprint: wb, eventName: 'OnClicked', propertyName: b, propertyClass: ref('/Script/UMG.Button') });
await call(UMG, 'CompileWidgetBlueprint', { widgetBlueprint: wb });
const r = await call(BP, 'write_graph_dsl', { graph: ref(`${W}:EventGraph`), code: (await import('node:fs')).readFileSync('blok2/ui_ev.txt', 'utf8') }).then(() => 'ok').catch((e) => 'ERR ' + e.message);
console.log('dsl', JSON.stringify(r.slice(0, 900)));
console.log('compile2', JSON.stringify(await call(UMG, 'CompileWidgetBlueprint', { widgetBlueprint: wb })));
const g = String(await call(BP, 'read_graph_dsl', { graph: ref(`${W}:EventGraph`) }));
console.log((g.match(/\(event [^\n]*/g) || []).join('\n'), g.includes('GetN') ? 'GetN ok' : 'no GetN');
