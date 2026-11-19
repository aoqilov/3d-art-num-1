// BP_Blok1Lift step 4: doors close by themselves 5 s after opening (not while the player stands in the doorway);
// calls made while the lift is busy (moving, or doors open on another floor) wait in the queue Calls and are served
// in order once the doors have closed. WantOpen: doors should open at TargetFloor. OpenTime: seconds fully open.
import { init, call, BP, ref } from './ue.mjs';
await init();
const B = '/Game/Blok1/Walk/BP_Blok1Lift.BP_Blok1Lift', bp = ref(B);
const v = async (name, type_name, extra = {}) => console.log('var', name, await call(BP, 'add_variable', { blueprint: bp, name, type_name, ...extra }).then(() => 'ok').catch((e) => e.message.slice(0, 120)));
await v('WantOpen', 'bool'); await v('OpenTime', 'float'); await v('Calls', 'int', { container_type: 'ARRAY' });
const fn = async (name, ins, outs, code) => {
  await call(BP, 'add_function_graph', { blueprint: bp, graph_name: name }).catch(() => {});
  const g = ref(`${B}:${name}`);
  for (const [p, t] of ins) await call(BP, 'add_function_param', { graph: g, param_name: p, param_type: t, input_param: true }).catch(() => {});
  for (const [p, t] of outs) await call(BP, 'add_function_param', { graph: g, param_name: p, param_type: t, input_param: false }).catch(() => {});
  console.log('fn', name, await call(BP, 'write_graph_dsl', { graph: g, code }).catch((e) => 'ERR ' + e.message.slice(0, 500)));
};
await fn('IsMoving', [], [['Moving', 'bool']], `
(fn IsMoving ()
  (bind me (Transformation|GetActorLocation :self self))
  (bind tz (+ (Variables|Default|GetBaseZ) (* (Math|Conversions|ToFloat(Integer) (- (Variables|Default|GetTargetFloor) 1)) 300.0)))
  (return (> (Math|Float|Absolute(Float) (- (.z me) tz)) 0.5)))`);
await fn('InDoorway', [], [['Blocked', 'bool']], `
(fn InDoorway ()
  (bind p (Transformation|GetActorLocation :self (Game|GetPlayerCharacter :PlayerIndex 0)))
  (bind me (Transformation|GetActorLocation :self self))
  (return (and (and (< (Math|Float|Absolute(Float) (- (.x p) (+ (+ (Variables|Default|GetCabCX) (Variables|Default|GetCabHX)) 17.0))) 40.0)
                    (< (Math|Float|Absolute(Float) (- (.y p) (Variables|Default|GetCabCY))) (Variables|Default|GetCabHY)))
               (< (Math|Float|Absolute(Float) (- (.z p) (+ (.z me) 110.0))) 100.0))))`);
// Request(Floor): serve now if the lift is idle with closed doors or already open here; otherwise queue it.
await fn('Request', [['Floor', 'int']], [], `
(fn Request (Floor)
  (bind moving (CallFunction|IsMoving))
  (bind same (== Floor (Variables|Default|GetTargetFloor)))
  (if (and (not moving) (or same (<= (Variables|Default|GetDoorAlpha) 0.0)))
    (Variables|Default|SetTargetFloor Floor)
    (Variables|Default|SetWantOpen true)
    (Variables|Default|SetOpenTime 0.0)
    (else
      (if (not (and moving same))
        (Utilities|Array|AddUnique :TargetArray (Variables|Default|GetCalls) :NewItem Floor)))))`);
await fn('CallHere', [], [], `
(fn CallHere ()
  (bind p (Game|GetPlayerCharacter :PlayerIndex 0))
  (bind f (CallFunction|FloorAt :Z (- (.z (Transformation|GetActorLocation :self p)) 88.0)))
  (CallFunction|SetBtn :Floor f :On true)
  (CallFunction|Request :Floor f))`);
for (let f = 1; f <= 16; f++) await fn(`Go${f}`, [], [], `
(fn Go${f} ()
  (if (CallFunction|PlayerInside)
    (CallFunction|Request :Floor ${f})
    (if (> (Variables|Default|GetOpenTime) 0.0)
      (Variables|Default|SetOpenTime (Math|Float|Max(Float) :A (Variables|Default|GetOpenTime) :B 4.0)))))`);   // floor chosen inside: doors close after ~1 s
const ev = `
(event EventBeginPlay
  (Variables|Default|SetTargetFloor 1)
  (Variables|Default|SetDoorAlpha 1.0)
  (Variables|Default|SetWantOpen true)
  (Variables|Default|SetOpenTime 0.0)
  (CallFunction|ApplyDoors :Floor 1)
  (if (Utilities|String|EqualExactly(String) :A (Variables|Default|GetShaft) :B "A")
    (bind hw (UserInterface|CreateWidget :Class "/Game/Blok1/UI/WBP_Blok1Hint.WBP_Blok1Hint_C" :OwningPlayer (Game|GetPlayerController :PlayerIndex 0)))
    (UserInterface|Viewport|AddtoViewport :self hw :ZOrder 2)))
(event EventTick (DeltaSeconds)
  (bind me (Transformation|GetActorLocation :self self))
  (bind tz (+ (Variables|Default|GetBaseZ) (* (Math|Conversions|ToFloat(Integer) (- (Variables|Default|GetTargetFloor) 1)) 300.0)))
  (bind here (CallFunction|FloorAt :Z (.z me)))
  (if (CallFunction|IsMoving)
    (if (> (Variables|Default|GetDoorAlpha) 0.0)
      (Variables|Default|SetDoorAlpha (Math|Float|Max(Float) :A 0.0 :B (- (Variables|Default|GetDoorAlpha) (* DeltaSeconds 1.2))))
      (CallFunction|ApplyDoors :Floor here)
      (else
        (Transformation|SetActorLocation :self self
          :NewLocation (Math|Vector|MakeVector :X (.x me) :Y (.y me)
            :Z (Math|Interpolation|FInterptoConstant :Current (.z me) :Target tz :DeltaTime DeltaSeconds :InterpSpeed 150.0)))))
    (elif (Variables|Default|GetWantOpen)
      (Variables|Default|SetDoorAlpha (Math|Float|Min(Float) :A 1.0 :B (+ (Variables|Default|GetDoorAlpha) (* DeltaSeconds 1.2))))
      (CallFunction|ApplyDoors :Floor (Variables|Default|GetTargetFloor))
      (if (>= (Variables|Default|GetDoorAlpha) 1.0)
        (Variables|Default|SetOpenTime (+ (Variables|Default|GetOpenTime) DeltaSeconds)))
      (if (and (> (Variables|Default|GetOpenTime) 5.0) (not (CallFunction|InDoorway)))
        (Variables|Default|SetWantOpen false))
      (else
        (if (CallFunction|InDoorway)
          (Variables|Default|SetWantOpen true)
          (Variables|Default|SetOpenTime 3.0)
          (else
            (Variables|Default|SetDoorAlpha (Math|Float|Max(Float) :A 0.0 :B (- (Variables|Default|GetDoorAlpha) (* DeltaSeconds 1.2))))
            (CallFunction|ApplyDoors :Floor (Variables|Default|GetTargetFloor))
            (if (and (<= (Variables|Default|GetDoorAlpha) 0.0) (> (Utilities|Array|Length :TargetArray (Variables|Default|GetCalls)) 0))
              (Variables|Default|SetTargetFloor (Utilities|Array|Get(acopy) (Variables|Default|GetCalls) 0))
              (Utilities|Array|RemoveIndex :TargetArray (Variables|Default|GetCalls) :IndexToRemove 0)
              (Variables|Default|SetWantOpen true)
              (Variables|Default|SetOpenTime 0.0)))))))
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
console.log('ev', await call(BP, 'write_graph_dsl', { graph: ref(`${B}:EventGraph`), code: ev }).catch((e) => 'ERR ' + e.message.slice(0, 700)));
const r = String(await call(BP, 'read_graph_dsl', { graph: ref(`${B}:EventGraph`) }));
console.log('events:', (r.match(/\(event [^\s)]+/g) || []).join(' '), r.includes('RemoveIndex'));
console.log('compile', JSON.stringify(await call(BP, 'compile_blueprint', { blueprint: bp })));
