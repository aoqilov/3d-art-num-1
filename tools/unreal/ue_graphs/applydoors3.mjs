// ApplyDoors: right leaves (tag LDPos) slide to +y, the rest to -y; once the doors stand fully open on a floor, that floor's call button goes dark.
import { init, call, BP, ref } from './ue.mjs';
await init();
const B = '/Game/Blok1/Walk/BP_Blok1Lift.BP_Blok1Lift', g = ref(`${B}:ApplyDoors`);
console.log(await call(BP, 'write_graph_dsl', { graph: g, code: `
(fn ApplyDoors (Floor)
  (bind tag (Utilities|String|StringToName (Utilities|String|Append (Utilities|String|Append "LD" (Variables|Default|GetShaft)) (Utilities|String|ToString(Integer) Floor))))
  (bind ds (Actor|GetAllActorswithTag :Tag tag))
  (bind al (Variables|Default|GetDoorAlpha))
  (bind off (* al (Variables|Default|GetDoorWidth)))
  (bind z (+ (Variables|Default|GetBaseZ) (* (Math|Conversions|ToFloat(Integer) (- Floor 1)) 300.0)))
  (for d ds
    (if (Actor|ActorHasTag :self d :Tag "LDPos")
      (Transformation|SetActorLocation :self d
        :NewLocation (Math|Vector|MakeVector :X (Variables|Default|GetOriginX) :Y (+ (Variables|Default|GetOriginY) off) :Z z))
      (else
        (Transformation|SetActorLocation :self d
          :NewLocation (Math|Vector|MakeVector :X (Variables|Default|GetOriginX) :Y (- (Variables|Default|GetOriginY) off) :Z z)))))
  (if (>= al 1.0)
    (CallFunction|SetBtn :Floor Floor :On false)))` }).catch((e) => 'ERR ' + e.message.slice(0, 500)));
console.log((await call(BP, 'read_graph_dsl', { graph: g })).toString().slice(-400));
console.log((await call(BP, 'read_graph_dsl', { graph: ref(`${B}:SetBtn`) })).toString());
console.log(JSON.stringify(await call(BP, 'compile_blueprint', { blueprint: ref(B) })));
