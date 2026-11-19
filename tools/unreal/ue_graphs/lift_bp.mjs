// BP_Blok1Lift: one actor per shaft, at the block origin + (floor-1) * 300 cm. The cabin mesh is in block coordinates.
// Instance vars (set by walk_setup_blok1.py): Shaft "A"/"B", OriginX/OriginY/BaseZ (block origin), DoorWidth (cm),
// CabCX/CabCY/CabHX/CabHY (cabin centre and half size, world cm).
// CallHere: cabin comes to the player's floor.  Go1..Go16: if the player stands inside, ride there.
// Tick: doors close before moving (1 s), cabin travels 150 cm/s, doors open on arrival; landing doors of each storey
// are actors tagged "LD<Shaft><floor>" that slide sideways by DoorWidth. The floor panel shows while the player is inside.
import { init, call, BP, ref } from './ue.mjs';
await init();
const B = '/Game/Blok1/Walk/BP_Blok1Lift.BP_Blok1Lift', bp = ref(B);
const vars = [['Shaft', 'string'], ['OriginX', 'float'], ['OriginY', 'float'], ['BaseZ', 'float'], ['DoorWidth', 'float'],
  ['CabCX', 'float'], ['CabCY', 'float'], ['CabHX', 'float'], ['CabHY', 'float'], ['TargetFloor', 'int'], ['DoorAlpha', 'float'], ['PanelShown', 'bool']];
for (const [n, t] of vars) {
  await call(BP, 'add_variable', { blueprint: bp, name: n, type_name: t }).catch(() => {});
  await call(BP, 'set_variable_instance_editable', { blueprint: bp, variable_name: n, instance_editable: true });
}
await call(BP, 'add_object_variable', { blueprint: bp, name: 'Panel', object_class: ref('/Script/UMG.UserWidget') }).catch(() => {});
const fn = async (name, params, code) => {
  const g = await call(BP, 'add_function_graph', { blueprint: bp, graph_name: name });
  for (const [p, t] of params) await call(BP, 'add_function_param', { graph: g, param_name: p, param_type: t, input_param: true }).catch(() => {});
  await call(BP, 'write_graph_dsl', { graph: g, code });
  console.log('fn', name, 'ok');
};
// floor of a world height
await fn('FloorAt', [['Z', 'float']], `
(fn FloorAt (Z)
  (return (Math|Integer|Clamp(Integer) :Value (Math|Float|Round (/ (- Z (Variables|Default|GetBaseZ)) 300.0)) :Min 1 :Max 16)))`);
await call(BP, 'add_function_param', { graph: ref(`${B}:FloorAt`), param_name: 'Floor', param_type: 'int', input_param: false }).catch(() => {});
await fn('PlayerInside', [], `
(fn PlayerInside ()
  (bind p (Game|GetPlayerCharacter :PlayerIndex 0))
  (bind pl (Transformation|GetActorLocation :self p))
  (bind me (Transformation|GetActorLocation :self self))
  (return (and (and (< (Math|Float|Absolute(Float) (- (.x pl) (Variables|Default|GetCabCX))) (Variables|Default|GetCabHX))
                    (< (Math|Float|Absolute(Float) (- (.y pl) (Variables|Default|GetCabCY))) (Variables|Default|GetCabHY)))
               (and (> (.z pl) (.z me)) (< (.z pl) (+ (.z me) 300.0))))))`);
await call(BP, 'add_function_param', { graph: ref(`${B}:PlayerInside`), param_name: 'Inside', param_type: 'bool', input_param: false }).catch(() => {});
await fn('CallHere', [], `
(fn CallHere ()
  (bind p (Game|GetPlayerCharacter :PlayerIndex 0))
  (Variables|Default|SetTargetFloor (CallFunction|FloorAt :Z (- (.z (Transformation|GetActorLocation :self p)) 88.0))))`).catch((e) => console.log('CallHere', e.message.slice(0, 300)));
for (let f = 1; f <= 16; f++) {
  await fn(`Go${f}`, [], `
(fn Go${f} ()
  (if (CallFunction|PlayerInside)
    (Variables|Default|SetTargetFloor ${f})))`).catch((e) => console.log('Go', f, e.message.slice(0, 300)));
}
await fn('ApplyDoors', [['Floor', 'int']], `
(fn ApplyDoors (Floor)
  (bind tag (Utilities|String|StringToName (Utilities|String|Append (Utilities|String|Append "LD" (Variables|Default|GetShaft)) (Utilities|String|ToString(Integer) Floor))))
  (bind ds (Actor|GetAllActorswithTag :Tag tag))
  (for d ds
    (Transformation|SetActorLocation :self d
      :NewLocation (Math|Vector|MakeVector :X (Variables|Default|GetOriginX)
        :Y (- (Variables|Default|GetOriginY) (* (Variables|Default|GetDoorAlpha) (Variables|Default|GetDoorWidth)))
        :Z (+ (Variables|Default|GetBaseZ) (* (Math|Conversions|ToFloat(Integer) (- Floor 1)) 300.0))))))`).catch((e) => console.log('ApplyDoors', e.message.slice(0, 300)));
const tick = `
(event EventBeginPlay
  (Variables|Default|SetTargetFloor 1)
  (Variables|Default|SetDoorAlpha 1.0)
  (CallFunction|ApplyDoors :Floor 1))
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
try { console.log('tick', await call(BP, 'write_graph_dsl', { graph: ref(`${B}:EventGraph`), code: tick })); } catch (e) { console.log('TICK ERR', e.message.slice(0, 600)); }
console.log('compile', JSON.stringify(await call(BP, 'compile_blueprint', { blueprint: bp })));
