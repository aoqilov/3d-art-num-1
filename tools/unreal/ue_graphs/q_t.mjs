// Step-4 scenarios on lift SH (PIE must be running, fresh).
import { init, py } from './ue.mjs';
await init();
const SH = process.argv[2] || 'A';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const H = `
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
pl = unreal.GameplayStatics.get_player_character(w, 0)
L = unreal.GameplayStatics.get_all_actors_with_tag(w, "LiftCtl${SH}")[0]
def B(f):
    b = unreal.GameplayStatics.get_all_actors_with_tag(w, "LB${SH}%d" % f)[0]
    return "on" if "On" in b.static_mesh_component.get_material(0).get_name() else "off"
def st(t): print(t, "| floor %.2f target %d door %.2f want %s open %.1f calls %s" % ((L.get_actor_location().z - 2) / 300 + 1, L.get_editor_property("TargetFloor"), L.get_editor_property("DoorAlpha"), L.get_editor_property("WantOpen"), L.get_editor_property("OpenTime"), list(L.get_editor_property("Calls"))), "| btn5 %s btn9 %s" % (B(5), B(9)), "| player z %.0f" % pl.get_actor_location().z)
def put(f, inside=False):
    cx, cy = L.get_editor_property("CabCX"), L.get_editor_property("CabCY")
    x = cx if inside else cx + L.get_editor_property("CabHX") + 150
    pl.set_actor_location(unreal.Vector(x, cy, 2 + (f - 1) * 300 + 112), False, True)
`;
const S = (t, extra = '') => py(H + extra + `\nst(${JSON.stringify(t)})`).then(console.log, (e) => console.log('ERR', e.message.slice(-400)));
console.log('--- T1: doors at storey 1 close by themselves (~5 s)');
await S('t0', 'put(1)'); await wait(4); await S('t4'); await wait(3.5); await S('t7.5');
console.log('--- T2: call from 9 (lift idle, doors closed) -> comes, opens, button off, closes after 5 s');
await S('call9', 'put(9)\nL.call_method("CallHere")'); await wait(19); await S('+19s'); await wait(7); await S('+26s');
console.log('--- T3: busy: from 5 call while doors open at 9 -> queued, served after the doors close');
await S('call9 again (reopen)', 'put(9)\nL.call_method("CallHere")'); await wait(1.5);
await S('call5 while open at 9', 'put(5)\nL.call_method("CallHere")'); await wait(6); await S('+6s'); await wait(8); await S('+14s');
console.log('--- T4: player stands in doorway at 5 -> doors stay open');
await S('in doorway', `cx, cy = L.get_editor_property("CabCX"), L.get_editor_property("CabCY")
pl.set_actor_location(unreal.Vector(cx + L.get_editor_property("CabHX") + 17, cy, 2 + 4 * 300 + 112), False, True)`); await wait(8); await S('+8s in doorway');
console.log('--- T5: player inside presses 3 -> doors close ~1 s, rides to 3');
await S('inside go3', 'put(5, True)'); await wait(1); await S('go3', 'L.call_method("Go3")'); await wait(2); await S('+2s'); await wait(7); await S('+9s');
