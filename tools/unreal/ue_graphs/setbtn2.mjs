import { init, call, BP, ref } from './ue.mjs';
await init();
const B = '/Game/Blok1/Walk/BP_Blok1Lift.BP_Blok1Lift', g = ref(`${B}:SetBtn`);
console.log(await call(BP, 'write_graph_dsl', { graph: g, code: `
(fn SetBtn (Floor On)
  (bind tag (Utilities|String|StringToName (Utilities|String|Append (Utilities|String|Append "LB" (Variables|Default|GetShaft)) (Utilities|String|ToString(Integer) Floor))))
  (bind bs (Actor|GetAllActorswithTag :Tag tag))
  (for a bs
    (bind c (Actor|GetComponentbyClass :self a :ComponentClass "/Script/Engine.StaticMeshComponent"))
    (if On
      (Rendering|Material|SetMaterial :self c :ElementIndex 0 :Material "/Game/Blok1/Mat/MI_LiftBtnOn.MI_LiftBtnOn")
      (else
        (Rendering|Material|SetMaterial :self c :ElementIndex 0 :Material "/Game/Blok1/Mat/MI_LiftBtnOff.MI_LiftBtnOff")))))` }).catch((e) => 'ERR ' + e.message.slice(0, 600)));
console.log((await call(BP, 'read_graph_dsl', { graph: g })).toString());
console.log(JSON.stringify(await call(BP, 'compile_blueprint', { blueprint: ref(B) })));
