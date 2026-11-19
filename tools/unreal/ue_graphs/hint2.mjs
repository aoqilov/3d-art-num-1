// WBP_Blok1Hint reads BP_Blok1Player.Focus (picked by FindUse): lift parts -> "E — liftni chaqirish", doors -> open/close.
import { init, call, UMG, BP, ref } from './ue.mjs';
await init();
const W = '/Game/Blok1/UI/WBP_Blok1Hint.WBP_Blok1Hint', wb = ref(W), g = ref(`${W}:EventGraph`);
await call(UMG, 'ToggleWidgetAsVariable', { widgetBlueprint: wb, widget: ref(`${W}:WidgetTree.Txt`), bIsVariable: true }).catch((e) => console.log(e.message.slice(0, 100)));
await call(UMG, 'CompileWidgetBlueprint', { widgetBlueprint: wb });
const code = `
(event UserInterface|EventTick (MyGeometry InDeltaTime)
  (bind pp (Utilities|Casting|CastToBP_Blok1Player :Object (Game|GetPlayerCharacter :PlayerIndex 0))
    (:then
      (bind f (Class|BPBlok1Player|GetFocus :self pp))
      (Utilities|IsValid f
        (:"Is Valid"
          (Widget|SetVisibility :self (Variables|WBP_Blok1Hint|GetBox) :InVisibility "HitTestInvisible")
          (if (or (Actor|ActorHasTag :self f :Tag "LiftA") (Actor|ActorHasTag :self f :Tag "LiftB"))
            (Widget|SetText(Text) :self (Variables|WBP_Blok1Hint|GetTxt) :InText (Utilities|Text|ToText(String) "E — liftni chaqirish"))
            (else
              (bind dr (Utilities|Casting|CastToBP_Blok1Door :Object f)
                (:then
                  (if (Class|BPBlok1Door|GetIsOpen :self dr)
                    (Widget|SetText(Text) :self (Variables|WBP_Blok1Hint|GetTxt) :InText (Utilities|Text|ToText(String) "E — eshikni yopish"))
                    (else
                      (Widget|SetText(Text) :self (Variables|WBP_Blok1Hint|GetTxt) :InText (Utilities|Text|ToText(String) "E — eshikni ochish")))))
                (:CastFailed)))))
        (:"Is Not Valid"
          (Widget|SetVisibility :self (Variables|WBP_Blok1Hint|GetBox) :InVisibility "Hidden"))))
    (:CastFailed
      (Widget|SetVisibility :self (Variables|WBP_Blok1Hint|GetBox) :InVisibility "Hidden"))))`;
console.log('dsl', await call(BP, 'write_graph_dsl', { graph: g, code }).catch((e) => 'ERR ' + e.message.slice(0, 700)));
console.log(String(await call(BP, 'read_graph_dsl', { graph: g })).slice(0, 2000));
console.log('compile', JSON.stringify(await call(UMG, 'CompileWidgetBlueprint', { widgetBlueprint: wb })));
