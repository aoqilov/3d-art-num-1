// BP_Blok1Player: FindUse() picks the E target every tick -> Focus. The view ray (2.5 m) gives the look point P; among the
// actors tagged U<storey> the one whose bounds are closest to P within 30 cm wins, if nothing blocks the eye -> it line.
// E uses Focus (doors: Use; lift doors/buttons: CallHere). The hint widget reads Focus.
import fs from 'node:fs';
import { init, call, BP, ref } from './ue.mjs';
await init();
const B = '/Game/Blok1/Player/BP_Blok1Player.BP_Blok1Player', bp = ref(B);
await call(BP, 'add_object_variable', { blueprint: bp, name: 'Focus', object_class: ref('/Script/Engine.Actor') }).catch((e) => console.log('Focus', e.message.slice(0, 100)));
await call(BP, 'add_variable', { blueprint: bp, name: 'BestD', type_name: 'float' }).catch((e) => console.log('BestD', e.message.slice(0, 100)));
await call(BP, 'add_object_variable', { blueprint: bp, name: 'Best', object_class: ref('/Script/Engine.Actor') }).catch((e) => console.log('Best', e.message.slice(0, 100)));
await call(BP, 'add_function_graph', { blueprint: bp, graph_name: 'FindUse' }).catch(() => {});
console.log('FindUse', await call(BP, 'write_graph_dsl', { graph: ref(`${B}:FindUse`), code: `
(fn FindUse ()
  (bind fwd (Math|Vector|GetForwardVector :InRot (Pawn|GetControlRotation :self (Game|GetPlayerController :PlayerIndex 0))))
  (bind me (Transformation|GetActorLocation :self self))
  (bind eye (+ me (Math|Vector|MakeVector :X 0.0 :Y 0.0 :Z 77.0)))
  (bind far (+ eye (* fwd 250.0)))
  (bind (hr hit) (Collision|LineTraceByChannel :Start eye :End far :TraceChannel "Visibility" :bTraceComplex true :bIgnoreSelf true))
  (bind (hb1 hb2 hb3 hb4 hloc hb6 hb7 hb8 hb9 hact) (Collision|BreakHitResult :Hit hr))
  (bind p (select hit hloc far))
  (bind st (+ (Math|Float|Round (/ (- (.z me) 112.0) 300.0)) 1))
  (bind cands (Actor|GetAllActorswithTag :Tag (Utilities|String|StringToName (Utilities|String|Append "U" (Utilities|String|ToString(Integer) st)))))
  (Variables|Default|SetBestD 30.0)
  (Variables|Default|SetBest (Variables|Default|GetFocus))
  (Variables|Default|SetFocus)
  (Variables|Default|SetBest)
  (for a cands
    (bind (o e) (Collision|GetActorBounds :self a :bOnlyCollidingComponents true))
    (bind dx (Math|Float|Max(Float) :A 0.0 :B (- (Math|Float|Absolute(Float) (- (.x p) (.x o))) (.x e))))
    (bind dy (Math|Float|Max(Float) :A 0.0 :B (- (Math|Float|Absolute(Float) (- (.y p) (.y o))) (.y e))))
    (bind dz (Math|Float|Max(Float) :A 0.0 :B (- (Math|Float|Absolute(Float) (- (.z p) (.z o))) (.z e))))
    (bind d (Math|Vector|VectorLength (Math|Vector|MakeVector :X dx :Y dy :Z dz)))
    (if (< d (Variables|Default|GetBestD))
      (bind (hr2 hit2) (Collision|LineTraceByChannel :Start eye :End o :TraceChannel "Visibility" :bTraceComplex true :bIgnoreSelf true))
      (bind (h1 h2 h3 h4 h5 h6 h7 h8 h9 ha2) (Collision|BreakHitResult :Hit hr2))
      (if (or (not hit2) (== ha2 a))
        (Variables|Default|SetBestD d)
        (Variables|Default|SetBest a))))
  (Variables|Default|SetFocus (Variables|Default|GetBest)))` }).catch((e) => 'ERR ' + e.message.slice(0, 700)));
await call(BP, 'add_function_graph', { blueprint: bp, graph_name: 'UseFocus' }).catch(() => {});
console.log('UseFocus', await call(BP, 'write_graph_dsl', { graph: ref(`${B}:UseFocus`), code: `
(fn UseFocus ()
  (bind ha (Variables|Default|GetFocus))
  (Utilities|IsValid ha
    (:"Is Valid"
      (Utilities|Time|SetTimerbyFunctionName :Object ha :FunctionName "Use" :Time 0.01 :bLooping false)
      (if (Actor|ActorHasTag :self ha :Tag "LiftA")
        (for la (Actor|GetAllActorswithTag :Tag "LiftCtlA")
          (Utilities|Time|SetTimerbyFunctionName :Object la :FunctionName "CallHere" :Time 0.01 :bLooping false)))
      (if (Actor|ActorHasTag :self ha :Tag "LiftB")
        (for lb (Actor|GetAllActorswithTag :Tag "LiftCtlB")
          (Utilities|Time|SetTimerbyFunctionName :Object lb :FunctionName "CallHere" :Time 0.01 :bLooping false))))
    (:"Is Not Valid")))` }).catch((e) => 'ERR ' + e.message.slice(0, 700)));
const code = fs.readFileSync('player_ev_code.txt', 'utf8');
console.log('ev', await call(BP, 'write_graph_dsl', { graph: ref(`${B}:EventGraph`), code }).catch((e) => 'ERR ' + e.message.slice(0, 700)));
const r = String(await call(BP, 'read_graph_dsl', { graph: ref(`${B}:EventGraph`) }));
console.log('events:', (r.match(/\(event [^\s)]+/g) || []).join(' '), r.includes('FindUse'));
console.log(String(await call(BP, 'read_graph_dsl', { graph: ref(`${B}:FindUse`) })).slice(0, 2500));
console.log('compile', JSON.stringify(await call(BP, 'compile_blueprint', { blueprint: bp })));
