// BP_Blok1Player FindUse v2. Score(): distance from the look point LookP to candidate CandA -> CandD (1e4 = rejected).
//   doors (BP_Blok1Door): distance from the view ray (eye -> look point) to the doorway (closed leaf) or to the current
//     leaf, each taken as a disc of the leaf width around its middle, vertically within the leaf bounds; visible if the eye -> doorway-centre ray reaches the leaf or passes the doorway.
//   others (lift buttons, plates, landing leaves): distance to the actor bounds; visible if eye -> bounds centre hits it.
import { init, call, BP, ref } from './ue.mjs';
await init();
const B = '/Game/Blok1/Player/BP_Blok1Player.BP_Blok1Player', bp = ref(B);
for (const [n, t] of [['LookP', 'vector'], ['EyeP', 'vector'], ['CandD', 'float']])
  console.log(n, await call(BP, 'add_variable', { blueprint: bp, name: n, type_name: t }).then(() => 'ok').catch((e) => e.message.slice(0, 120)));
console.log('CandA', await call(BP, 'add_object_variable', { blueprint: bp, name: 'CandA', object_class: ref('/Script/Engine.Actor') }).then(() => 'ok').catch((e) => e.message.slice(0, 100)));
await call(BP, 'add_function_graph', { blueprint: bp, graph_name: 'Score' }).catch(() => {});
console.log('Score', await call(BP, 'write_graph_dsl', { graph: ref(`${B}:Score`), code: `
(fn Score ()
  (bind a (Variables|Default|GetCandA))
  (bind p (Variables|Default|GetLookP))
  (bind eye (Variables|Default|GetEyeP))
  (bind (o e) (Collision|GetActorBounds :self a :bOnlyCollidingComponents true))
  (bind dz (Math|Float|Max(Float) :A 0.0 :B (- (Math|Float|Absolute(Float) (- (.z p) (.z o))) (.z e))))
  (Variables|Default|SetCandD 10000.0)
  (bind dr (Utilities|Casting|CastToBP_Blok1Door :Object a)
    (:then
      (bind h (Transformation|GetActorLocation :self a))
      (bind w (* (.x (Transformation|GetActorScale3D :self a)) 100.0))
      (bind dc (Math|Vector|GetForwardVector :InRot (Math|Rotator|MakeRotator :Roll 0.0 :Pitch 0.0 :Yaw (Class|BPBlok1Door|GetClosedYaw :self dr))))
      (bind dn (Transformation|GetActorForwardVector :self a))
      (bind m1 (+ h (* dc (* w 0.5))))
      (bind m2 (+ h (* dn (* w 0.5))))
      (bind q1 (Math|Vector|MakeVector :X (.x m1) :Y (.y m1) :Z (.z o)))
      (bind q2 (Math|Vector|MakeVector :X (.x m2) :Y (.y m2) :Z (.z o)))
      (bind c1 (Math|Vector|FindClosestPointonSegment :Point q1 :SegmentStart eye :SegmentEnd p))
      (bind c2 (Math|Vector|FindClosestPointonSegment :Point q2 :SegmentStart eye :SegmentEnd p))
      (bind r1 (Math|Vector|MakeVector :X (Math|Float|Max(Float) :A 0.0 :B (- (Math|Vector|VectorLengthXY (- c1 q1)) (* w 0.5)))
                                     :Y (Math|Float|Max(Float) :A 0.0 :B (- (Math|Float|Absolute(Float) (- (.z c1) (.z o))) (.z e))) :Z 0.0))
      (bind r2 (Math|Vector|MakeVector :X (Math|Float|Max(Float) :A 0.0 :B (- (Math|Vector|VectorLengthXY (- c2 q2)) (* w 0.5)))
                                     :Y (Math|Float|Max(Float) :A 0.0 :B (- (Math|Float|Absolute(Float) (- (.z c2) (.z o))) (.z e))) :Z 0.0))
      (bind dd (Math|Float|Min(Float) :A (Math|Vector|VectorLength r1) :B (Math|Vector|VectorLength r2)))
      (bind mid (+ h (* dc (* w 0.5))))
      (bind tgt (Math|Vector|MakeVector :X (.x mid) :Y (.y mid) :Z (.z o)))
      (bind (hr hit) (Collision|LineTraceByChannel :Start eye :End tgt :TraceChannel "Visibility" :bTraceComplex true :bIgnoreSelf true))
      (bind (h1 h2 h3 hdist h5 h6 h7 h8 h9 ha) (Collision|BreakHitResult :Hit hr))
      (if (or (or (not hit) (== ha a)) (> hdist (- (Math|Vector|VectorLength (- tgt eye)) 15.0)))
        (Variables|Default|SetCandD dd)))
    (:CastFailed
      (bind dx (Math|Float|Max(Float) :A 0.0 :B (- (Math|Float|Absolute(Float) (- (.x p) (.x o))) (.x e))))
      (bind dy (Math|Float|Max(Float) :A 0.0 :B (- (Math|Float|Absolute(Float) (- (.y p) (.y o))) (.y e))))
      (bind (hr2 hit2) (Collision|LineTraceByChannel :Start eye :End o :TraceChannel "Visibility" :bTraceComplex true :bIgnoreSelf true))
      (bind (g1 g2 g3 g4 g5 g6 g7 g8 g9 ha2) (Collision|BreakHitResult :Hit hr2))
      (if (or (not hit2) (== ha2 a))
        (Variables|Default|SetCandD (Math|Vector|VectorLength (Math|Vector|MakeVector :X dx :Y dy :Z dz)))))))` }).catch((e) => 'ERR ' + e.message.slice(0, 700)));
console.log('FindUse', await call(BP, 'write_graph_dsl', { graph: ref(`${B}:FindUse`), code: `
(fn FindUse ()
  (bind fwd (Math|Vector|GetForwardVector :InRot (Pawn|GetControlRotation :self (Game|GetPlayerController :PlayerIndex 0))))
  (bind me (Transformation|GetActorLocation :self self))
  (bind eye (+ me (Math|Vector|MakeVector :X 0.0 :Y 0.0 :Z 77.0)))
  (bind far (+ eye (* fwd 250.0)))
  (bind (hr hit) (Collision|LineTraceByChannel :Start eye :End far :TraceChannel "Visibility" :bTraceComplex true :bIgnoreSelf true))
  (bind (hb1 hb2 hb3 hb4 hloc hb6 hb7 hb8 hb9 hact) (Collision|BreakHitResult :Hit hr))
  (Variables|Default|SetLookP (select hit hloc far))
  (Variables|Default|SetEyeP eye)
  (bind st (+ (Math|Float|Round (/ (- (.z me) 112.0) 300.0)) 1))
  (bind cands (Actor|GetAllActorswithTag :Tag (Utilities|String|StringToName (Utilities|String|Append "U" (Utilities|String|ToString(Integer) st)))))
  (Variables|Default|SetBestD 30.0)
  (Variables|Default|SetBest)
  (for a cands
    (Variables|Default|SetCandA a)
    (CallFunction|Score)
    (if (< (Variables|Default|GetCandD) (Variables|Default|GetBestD))
      (Variables|Default|SetBestD (Variables|Default|GetCandD))
      (Variables|Default|SetBest a)))
  (Variables|Default|SetFocus (Variables|Default|GetBest)))` }).catch((e) => 'ERR ' + e.message.slice(0, 700)));
console.log('compile', JSON.stringify(await call(BP, 'compile_blueprint', { blueprint: bp })));
console.log(String(await call(BP, 'read_graph_dsl', { graph: ref(`${B}:Score`) })).slice(0, 600));
