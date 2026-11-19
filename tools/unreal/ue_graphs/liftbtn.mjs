// Lift call buttons: SetBtn(Floor, On) swaps the material of the actors tagged LB<Shaft><Floor> (MI_LiftBtnOn / Off).
// CallHere lights the caller's button; Tick puts it out once the cabin stands at the target floor.
import { init, call, BP, ref } from './ue.mjs';
await init();
const B = '/Game/Blok1/Walk/BP_Blok1Lift.BP_Blok1Lift', bp = ref(B);
const g = await call(BP, 'add_function_graph', { blueprint: bp, graph_name: 'SetBtn' }).catch(() => ref(`${B}:SetBtn`));
await call(BP, 'add_function_param', { graph: ref(`${B}:SetBtn`), param_name: 'Floor', param_type: 'int', input_param: true }).catch(() => {});
await call(BP, 'add_function_param', { graph: ref(`${B}:SetBtn`), param_name: 'On', param_type: 'bool', input_param: true }).catch(() => {});
console.log('SetBtn', await call(BP, 'write_graph_dsl', { graph: ref(`${B}:SetBtn`), code: `
(fn SetBtn (Floor On)
  (bind tag (Utilities|String|StringToName (Utilities|String|Append (Utilities|String|Append "LB" (Variables|Default|GetShaft)) (Utilities|String|ToString(Integer) Floor))))
  (bind bs (Actor|GetAllActorswithTag :Tag tag))
  (for a bs
    (bind sma (Utilities|Casting|CastToStaticMeshActor :Object a)
      (:then
        (bind c (Class|StaticMeshActor|GetStaticMeshComponent :self sma))
        (if On
          (Rendering|Material|SetMaterial :self c :ElementIndex 0 :Material "/Game/Blok1/Mat/MI_LiftBtnOn.MI_LiftBtnOn")
          (else
            (Rendering|Material|SetMaterial :self c :ElementIndex 0 :Material "/Game/Blok1/Mat/MI_LiftBtnOff.MI_LiftBtnOff"))))
      (:CastFailed))))` }).catch((e) => 'ERR ' + e.message.slice(0, 600)));
console.log('CallHere', await call(BP, 'write_graph_dsl', { graph: ref(`${B}:CallHere`), code: `
(fn CallHere ()
  (bind p (Game|GetPlayerCharacter :PlayerIndex 0))
  (bind f (CallFunction|FloorAt :Z (- (.z (Transformation|GetActorLocation :self p)) 88.0)))
  (Variables|Default|SetTargetFloor f)
  (CallFunction|SetBtn :Floor f :On true))` }).catch((e) => 'ERR ' + e.message.slice(0, 600)));
console.log((await call(BP, 'read_graph_dsl', { graph: ref(`${B}:EventGraph`) })).toString());
