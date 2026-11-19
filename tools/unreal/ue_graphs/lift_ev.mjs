// BP_Blok1Lift EventGraph (whole): BeginPlay (+ lift A adds the "E — liftni chaqirish" hint widget) and Tick (from lift_bp.mjs).
import { init, call, BP, ref } from './ue.mjs';
await init();
const B = '/Game/Blok1/Walk/BP_Blok1Lift.BP_Blok1Lift';
const code = `
(event EventBeginPlay
  (Variables|Default|SetTargetFloor 1)
  (Variables|Default|SetDoorAlpha 1.0)
  (CallFunction|ApplyDoors :Floor 1)
  (if (Utilities|String|EqualExactly(String) :A (Variables|Default|GetShaft) :B "A")
    (bind hw (UserInterface|CreateWidget :Class "/Game/Blok1/UI/WBP_Blok1Hint.WBP_Blok1Hint_C" :OwningPlayer (Game|GetPlayerController :PlayerIndex 0)))
    (UserInterface|Viewport|AddtoViewport :self hw :ZOrder 2)))
(event EventTick (DeltaSeconds)
  (bind me (Transformation|GetActorLocation :self self))
  (bind tz (+ (Variables|Default|GetBaseZ) (* (Math|Conversions|ToFloat(Integer) (- (Variables|Default|GetTargetFloor) 1)) 300.0)))
  (bind here (CallFunction|FloorAt :Z (.z me)))
  (if (> (Math|Float|Absolute(Float) (- (.z me) tz)) 0.5)
    (if (> (Variables|Default|GetDoorAlpha) 0.0)
      (Variables|Default|SetDoorAlpha (Math|Float|Max(Float) :A 0.0 :B (- (Variables|Default|GetDoorAlpha) (* DeltaSeconds 1.2))))
      (CallFunction|ApplyDoors :Floor here)
      (else
        (Transformation|SetActorLocation :self self
          :NewLocation (Math|Vector|MakeVector :X (.x me) :Y (.y me)
            :Z (Math|Interpolation|FInterptoConstant :Current (.z me) :Target tz :DeltaTime DeltaSeconds :InterpSpeed 150.0)))))
    (else
      (Variables|Default|SetDoorAlpha (Math|Float|Min(Float) :A 1.0 :B (+ (Variables|Default|GetDoorAlpha) (* DeltaSeconds 1.2))))
      (CallFunction|ApplyDoors :Floor (Variables|Default|GetTargetFloor))))
  (bind inside (CallFunction|PlayerInside))
  (if (and inside (not (Variables|Default|GetPanelShown)))
    (Variables|Default|SetPanelShown true)
    (bind w (UserInterface|CreateWidget :Class "/Game/Blok1/UI/WBP_Blok1LiftPanel.WBP_Blok1LiftPanel_C" :OwningPlayer (Game|GetPlayerController :PlayerIndex 0)))
    (Variables|Default|SetPanel w)
    (UserInterface|Viewport|AddtoViewport :self w :ZOrder 1)
    (elif (and (not inside) (Variables|Default|GetPanelShown))
      (Variables|Default|SetPanelShown false)
      (Widget|RemovefromParent :self (Variables|Default|GetPanel)))))
`;
console.log(await call(BP, 'write_graph_dsl', { graph: ref(`${B}:EventGraph`), code }).catch((e) => 'ERR ' + e.message.slice(0, 600)));
const r = String(await call(BP, 'read_graph_dsl', { graph: ref(`${B}:EventGraph`) }));
console.log('events:', (r.match(/\(event [^\s)]+/g) || []).join(' '), '| hint', r.includes('WBP_Blok1Hint'));
console.log(JSON.stringify(await call(BP, 'compile_blueprint', { blueprint: ref(B) })));
