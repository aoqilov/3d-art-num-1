// WBP_Blok1Hint: "E — liftni chaqirish" under the screen centre while the player looks (<= 2.5 m) at a lift call button,
// its plate or a landing door (actors tagged LiftA / LiftB). The widget traces itself every tick; the lift A actor
// adds it to the viewport at BeginPlay.
import { init, call, UMG, OBJ, BP, py, ref } from './ue.mjs';
await init();
const DIR = '/Game/Blok1/UI', NAME = 'WBP_Blok1Hint', W = `${DIR}/${NAME}.${NAME}`, wb = ref(W);
await py(`
p="${DIR}/${NAME}"
if unreal.EditorAssetLibrary.does_asset_exist(p): unreal.EditorAssetLibrary.delete_asset(p)
print("ok")`);
await call(UMG, 'CreateWidgetBlueprint', { folderPath: DIR, assetName: NAME, parentClass: ref('/Script/UMG.UserWidget') });
const add = (cls, name, parent) => call(UMG, 'AddWidget', { widgetBlueprint: wb, widgetClass: ref(cls), widgetDisplayName: name, parentWidget: parent || null });
const set = (obj, values) => call(OBJ, 'set_properties', { instance: obj, values: JSON.stringify(values) }).catch((e) => console.log('set fail', e.message.slice(0, 200)));
const root = await add('/Script/UMG.CanvasPanel', 'Root');
const box = await add('/Script/UMG.Border', 'Box', root.widget);
await set(box.widget, { BrushColor: { R: 0.05, G: 0.055, B: 0.06, A: 0.75 }, Padding: { Left: 14, Top: 6, Right: 14, Bottom: 6 }, Visibility: 'Hidden' });
await set(box.slot, { bAutoSize: true, LayoutData: { Offsets: { Left: 0, Top: 70, Right: 0, Bottom: 0 }, Anchors: { Minimum: { X: 0.5, Y: 0.5 }, Maximum: { X: 0.5, Y: 0.5 } }, Alignment: { X: 0.5, Y: 0 } } });
const t = await add('/Script/UMG.TextBlock', 'Txt', box.widget);
await set(t.widget, { Text: 'E — liftni chaqirish', Justification: 'Center', ColorAndOpacity: { SpecifiedColor: { R: 0.95, G: 0.82, B: 0.6, A: 1 } } });
await call(UMG, 'ToggleWidgetAsVariable', { widgetBlueprint: wb, widget: ref(`${W}:WidgetTree.Box`), bIsVariable: true });
console.log('compile1', JSON.stringify(await call(UMG, 'CompileWidgetBlueprint', { widgetBlueprint: wb })));
const g = ref(`${W}:EventGraph`);
const code = `
(event UserInterface|EventTick (MyGeometry InDeltaTime)
  (bind p (Game|GetPlayerCharacter :PlayerIndex 0))
  (bind fwd (Math|Vector|GetForwardVector :InRot (Pawn|GetControlRotation :self (Game|GetPlayerController :PlayerIndex 0))))
  (bind eye (+ (Transformation|GetActorLocation :self p) (Math|Vector|MakeVector :X 0.0 :Y 0.0 :Z 77.0)))
  (bind (hr hit) (Collision|LineTraceByChannel :Start eye :End (+ eye (* fwd 250.0)) :TraceChannel "Visibility" :bTraceComplex true :bIgnoreSelf true))
  (bind (hb1 hb2 hb3 hb4 hb5 hb6 hb7 hb8 hb9 ha) (Collision|BreakHitResult :Hit hr))
  (if (and hit (or (Actor|ActorHasTag :self ha :Tag "LiftA") (Actor|ActorHasTag :self ha :Tag "LiftB")))
    (Widget|SetVisibility :self (Variables|WBP_Blok1Hint|GetBox) :InVisibility "HitTestInvisible")
    (else
      (Widget|SetVisibility :self (Variables|WBP_Blok1Hint|GetBox) :InVisibility "Hidden"))))`;
console.log('dsl', await call(BP, 'write_graph_dsl', { graph: g, code }).catch((e) => 'ERR ' + e.message.slice(0, 700)));
console.log(String(await call(BP, 'read_graph_dsl', { graph: g })).slice(0, 1500));
console.log('compile2', JSON.stringify(await call(UMG, 'CompileWidgetBlueprint', { widgetBlueprint: wb })));
