// BP_OrbitCam logic: web OrbitControls (three.js) for the Unreal sales UI. Make the asset + level actor first:
//   ue_scripts/orbit_setup.py        then:   node orbit_bp.mjs
// Model: the actor is the orbit pivot (= target), its rotation is the camera direction (roll 0), the Cam component sits
// DistA cm behind the pivot (relative X = -DistA). Input only changes the DESIRED state (DT*, DPitch, DYaw, DDist); every
// frame the real state interpolates to it (that is the damping of OrbitControls). A preset / fly-to just sets the desired
// state, so it glides like the web "goal"; user input overrides it at once.
//   left drag   orbit (360 deg per viewport height)      right drag / Shift+left drag   pan (screen plane)
//   wheel       dolly x0.9 per notch, towards the target  AutoRot  4.8 deg/s (autoRotateSpeed 0.8)
//   Mode 0 complex: dist 20-900 m, never below the horizon   Mode 1 block: dist 6-520 m, may look up 18 deg
// Click vs drag: Click is true after a left press+release that moved < 5 px (TakeClick consumes it); widgets use it so a
// drag never opens a block or selects a flat.
import { init, call, ref, BP } from './ue.mjs';
await init();
const P = '/Game/Blok1/UI/BP_OrbitCam.BP_OrbitCam', bp = ref(P);
const V = (n) => `(Variables|Default|Get${n})`;
const SET = (n, x) => `(Variables|Default|Set${n} ${x})`;
for (const n of ['DTx', 'DTy', 'DTz', 'DPitch', 'DYaw', 'DDist', 'DistA', 'MinD', 'MaxD', 'MinP', 'MaxP', 'Moved', 'PX', 'PY', 'Mdx', 'Mdy', 'Smooth', 'ClickT']) await call(BP, 'add_variable', { blueprint: bp, name: n, type_name: 'float' }).catch(() => {});
for (const n of ['Active', 'AutoRot', 'PressL', 'PressR', 'Click', 'ClickOut']) await call(BP, 'add_variable', { blueprint: bp, name: n, type_name: 'bool' }).catch(() => {});
await call(BP, 'add_variable', { blueprint: bp, name: 'Mode', type_name: 'int' }).catch(() => {});

const FN = [];
const def = (name, ins, outs, code, objIns = []) => FN.push({ name, ins, outs, code, objIns });
const CAM = V('Cam');
const SETCAM = (d) => `(Transformation|SetRelativeLocation :self ${CAM} :NewLocation (Math|Vector|MakeVector :X (- 0.0 ${d}) :Y 0.0 :Z 0.0) :bSweep false :bTeleport true)`;

def('Limits', [], [], `
(fn Limits ()
  (if (== ${V('Mode')} 0)
    ${SET('MinD', '2000.0')}
    ${SET('MaxD', '90000.0')}
    ${SET('MinP', '-90.0')}
    ${SET('MaxP', '-2.3')}
    (else
      ${SET('MinD', '600.0')}
      ${SET('MaxD', '52000.0')}
      ${SET('MinP', '-90.0')}
      ${SET('MaxP', '18.0')})))`);
// first activation: put the pivot in front of the current view so the camera does not jump
def('Snap', [], [], `
(fn Snap ()
  (bind pc (Game|GetPlayerController 0))
  (bind cm (Game|GetPlayerCameraManager 0))
  (bind cl (Camera|GetCameraLocation :self cm))
  (bind cr (Camera|GetCameraRotation :self cm))
  (bind d (Math|Float|Clamp(Float) ${V('DistA')} 600.0 90000.0))
  (Transformation|SetActorRotation self (Math|Rotator|MakeRotator 0.0 (.pitch cr) (.yaw cr)))
  (bind f (Transformation|GetActorForwardVector :self self))
  (Transformation|SetActorLocation :self self :NewLocation (+ cl (* f d)) :bSweep false :bTeleport true)
  ${SETCAM('d')}
  ${SET('DistA', 'd')}
  ${SET('DTx', '(.x (+ cl (* f d)))')}
  ${SET('DTy', '(.y (+ cl (* f d)))')}
  ${SET('DTz', '(.z (+ cl (* f d)))')}
  ${SET('DPitch', '(.pitch cr)')}
  ${SET('DYaw', '(.yaw cr)')}
  ${SET('DDist', 'd')}
  (Game|Player|SetViewTargetWithBlend pc self 0.0))`);
def('OrbitTo', [['Tx', 'float'], ['Ty', 'float'], ['Tz', 'float'], ['Pitch', 'float'], ['Yaw', 'float'], ['Dist', 'float'], ['Mode', 'int']], [], `
(fn OrbitTo (Tx Ty Tz Pitch Yaw Dist Mode)
  ${SET('Mode', 'Mode')}
  (CallFunction|Limits)
  (if (not ${V('Active')})
    (CallFunction|Snap))
  ${SET('DTx', 'Tx')}
  ${SET('DTy', 'Ty')}
  ${SET('DTz', 'Tz')}
  ${SET('DPitch', `(Math|Float|Clamp(Float) Pitch ${V('MinP')} ${V('MaxP')})`)}
  ${SET('DYaw', 'Yaw')}
  ${SET('DDist', `(Math|Float|Clamp(Float) Dist ${V('MinD')} ${V('MaxD')})`)}
  ${SET('Active', 'true')})`);
// aim at a (preset) camera actor: its pose becomes the desired state; the pivot is where its view axis meets the
// plane z = 2400 cm (block mid-height) or z = 0 (complex overview), distance clamped to 15-300 m
def('OrbitCam', [['Mode', 'int']], [], `
(fn OrbitCam (Cam Mode)
  (bind cl (Transformation|GetActorLocation :self Cam))
  (bind cr (Transformation|GetActorRotation :self Cam))
  (bind f (Transformation|GetActorForwardVector :self Cam))
  (bind zp (select (== Mode 0) 0.0 2400.0))
  (bind fz (.z f))
  (bind t (select (< fz -0.05) (/ (- zp (.z cl)) fz) 7000.0))
  (bind d (Math|Float|Clamp(Float) t 1500.0 30000.0))
  (bind tg (+ cl (* f d)))
  (CallFunction|OrbitTo :Tx (.x tg) :Ty (.y tg) :Tz (.z tg) :Pitch (.pitch cr) :Yaw (.yaw cr) :Dist d :Mode Mode))`, [['Cam', '/Script/Engine.Actor']]);
def('OrbitOff', [], [], `
(fn OrbitOff ()
  ${SET('Active', 'false')}
  ${SET('PressL', 'false')}
  ${SET('PressR', 'false')}
  ${SET('Click', 'false')})`);
def('SetAuto', [['On', 'bool']], [], `
(fn SetAuto (On)
  ${SET('AutoRot', 'On')})`);
def('TakeClick', [], [['R', 'bool']], `
(fn TakeClick ()
  ${SET('ClickOut', V('Click'))}
  ${SET('Click', 'false')}
  (return ${V('ClickOut')}))`);
def('Rot', [['Dx', 'float'], ['Dy', 'float']], [], `
(fn Rot (Dx Dy)
  ${SET('DYaw', `(- ${V('DYaw')} (* Dx 0.33))`)}
  ${SET('DPitch', `(Math|Float|Clamp(Float) (- ${V('DPitch')} (* Dy 0.33)) ${V('MinP')} ${V('MaxP')})`)})`);
def('PanBy', [['Dx', 'float'], ['Dy', 'float']], [], `
(fn PanBy (Dx Dy)
  (bind s (* ${V('DDist')} 0.00095))
  (bind r (Transformation|GetActorRightVector :self self))
  (bind u (Transformation|GetActorUpVector :self self))
  ${SET('DTx', `(+ ${V('DTx')} (* s (- (* (.x u) Dy) (* (.x r) Dx))))`)}
  ${SET('DTy', `(+ ${V('DTy')} (* s (- (* (.y u) Dy) (* (.y r) Dx))))`)}
  ${SET('DTz', `(+ ${V('DTz')} (* s (- (* (.z u) Dy) (* (.z r) Dx))))`)})`);
def('Zoom', [['W', 'float']], [], `
(fn Zoom (W)
  ${SET('DDist', `(Math|Float|Clamp(Float) (* ${V('DDist')} (Math|Float|Power 0.9 W)) ${V('MinD')} ${V('MaxD')})`)})`);
// the damping: real state -> desired state
def('Apply', [['Dt', 'float']], [], `
(fn Apply (Dt)
  (bind rot (Transformation|GetActorRotation :self self))
  (Transformation|SetActorRotation self (Math|Interpolation|RInterpTo :Current rot :Target (Math|Rotator|MakeRotator 0.0 ${V('DPitch')} ${V('DYaw')}) :DeltaTime Dt :InterpSpeed ${V('Smooth')}))
  (bind loc (Transformation|GetActorLocation :self self))
  (Transformation|SetActorLocation :self self :NewLocation (Math|Interpolation|VInterpTo :Current loc :Target (Math|Vector|MakeVector :X ${V('DTx')} :Y ${V('DTy')} :Z ${V('DTz')}) :DeltaTime Dt :InterpSpeed ${V('Smooth')}) :bSweep false :bTeleport true)
  (bind nd (Math|Interpolation|FInterpTo :Current ${V('DistA')} :Target ${V('DDist')} :DeltaTime Dt :InterpSpeed ${V('Smooth')}))
  ${SET('DistA', 'nd')}
  ${SETCAM('nd')})`);

// ----- create graphs + params, then write them
for (const f of FN) {
  await call(BP, 'add_function_graph', { blueprint: bp, graph_name: f.name }).catch(() => {});
  const g = ref(`${P}:${f.name}`);
  for (const [n, t] of f.ins) await call(BP, 'add_function_param', { graph: g, param_name: n, param_type: t, input_param: true }).catch(() => {});
  for (const [n, c] of f.objIns) await call(BP, 'add_object_function_param', { graph: g, param_name: n, object_class: ref(c), input_param: true }).catch((e) => console.log('objparam', n, e.message.slice(0, 160)));
  for (const [n, t] of f.outs) await call(BP, 'add_function_param', { graph: g, param_name: n, param_type: t, input_param: false }).catch(() => {});
}
for (const f of FN) {
  const r = await call(BP, 'write_graph_dsl', { graph: ref(`${P}:${f.name}`), code: f.code }).then(() => 'ok').catch((e) => 'ERR ' + e.message.slice(0, 900));
  console.log('fn', f.name, r);
}

const EV = `
(event EventTick (DeltaSeconds)
  (if ${V('Click')}
    ${SET('ClickT', `(+ ${V('ClickT')} DeltaSeconds)`)}
    (if (> ${V('ClickT')} 0.25)
      ${SET('Click', 'false')}))
  (if ${V('Active')}
    (bind pc (Game|GetPlayerController 0))
    (bind (mx my okm) (Game|Player|GetMousePosition :self pc))
    (bind lmb (Game|Player|IsInputKeyDown :self pc :Key "LeftMouseButton"))
    (bind rmb (Game|Player|IsInputKeyDown :self pc :Key "RightMouseButton"))
    (bind sh (Game|Player|IsInputKeyDown :self pc :Key "LeftShift"))
    (bind jpl (Game|Player|WasInputKeyJustPressed :self pc :Key "LeftMouseButton"))
    (bind jpr (Game|Player|WasInputKeyJustPressed :self pc :Key "RightMouseButton"))
    (bind w (Game|Player|GetInputAnalogKeyState :self pc :Key "MouseWheelAxis"))
    ; a variable read happens when the consuming node runs, so the delta is latched BEFORE PX/PY change
    ${SET('Mdx', `(select (or jpl jpr) 0.0 (- mx ${V('PX')}))`)}
    ${SET('Mdy', `(select (or jpl jpr) 0.0 (- my ${V('PY')}))`)}
    ${SET('PX', 'mx')}
    ${SET('PY', 'my')}
    (if jpl
      ${SET('PressL', 'true')}
      ${SET('Moved', '0.0')})
    (if jpr
      ${SET('PressR', 'true')})
    (if (and ${V('PressL')} lmb)
      ${SET('Moved', `(+ ${V('Moved')} (+ (select (> ${V('Mdx')} 0.0) ${V('Mdx')} (- 0.0 ${V('Mdx')})) (select (> ${V('Mdy')} 0.0) ${V('Mdy')} (- 0.0 ${V('Mdy')}))))`)}
      (if sh
        (CallFunction|PanBy :Dx ${V('Mdx')} :Dy ${V('Mdy')})
        (else
          (CallFunction|Rot :Dx ${V('Mdx')} :Dy ${V('Mdy')}))))
    (if (and ${V('PressR')} rmb)
      (CallFunction|PanBy :Dx ${V('Mdx')} :Dy ${V('Mdy')}))
    (if (and ${V('PressL')} (not lmb))
      (if (< ${V('Moved')} 5.0)
        ${SET('Click', 'true')}
        ${SET('ClickT', '0.0')})
      ${SET('PressL', 'false')})
    (if (and ${V('PressR')} (not rmb))
      ${SET('PressR', 'false')})
    (if (not (== w 0.0))
      (CallFunction|Zoom :W w))
    (if (and ${V('AutoRot')} (not (and ${V('PressL')} lmb)))
      ${SET('DYaw', `(+ ${V('DYaw')} (* 4.8 DeltaSeconds))`)})
    (CallFunction|Apply :Dt DeltaSeconds)))`;
console.log('event', await call(BP, 'write_graph_dsl', { graph: ref(`${P}:EventGraph`), code: EV }).then(() => 'ok').catch((e) => 'ERR ' + e.message.slice(0, 1200)));
console.log('compile', JSON.stringify(await call(BP, 'compile_blueprint', { blueprint: bp }).catch((e) => 'ERR ' + e.message.slice(0, 400))));
