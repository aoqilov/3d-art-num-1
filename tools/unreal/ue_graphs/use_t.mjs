// PIE: aim near a target with a lateral offset; report the player's Focus and the hint text.
import { init, py } from './ue.mjs';
await init();
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const H = `
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
pl = unreal.GameplayStatics.get_player_character(w, 0)
pc = unreal.GameplayStatics.get_player_controller(w, 0)
cls = unreal.load_object(None, "/Game/Blok1/UI/WBP_Blok1Hint.WBP_Blok1Hint_C")
hw = [x for x in unreal.ObjectIterator(cls) if x.get_world() == w]
def find(label):
    return [a for a in unreal.GameplayStatics.get_all_actors_of_class(w, unreal.Actor) if a.get_actor_label() == label][0]
def report(t):
    f = pl.get_editor_property("Focus")
    box = hw[0].get_editor_property("Box"); txt = hw[0].get_editor_property("Txt")
    print(t, "| focus:", f.get_actor_label() if f else None, "| hint:", str(box.get_visibility()).split(".")[-1].split(":")[0], txt.get_text())
`;
async function aim(label, off, t, opts = {}) {
  console.log(await py(H + `
a = find("${label}")
o, e = a.get_actor_bounds(True)
thin = 0 if e.x < e.y else 1                          # door / button faces along the thin axis
best = None
for sgn in (1, -1):
    n = unreal.Vector(sgn, 0, 0) if thin == 0 else unreal.Vector(0, sgn, 0)
    feet = unreal.Vector(o.x + n.x * ${opts.dist || 140}, o.y + n.y * ${opts.dist || 140}, o.z)
    st = round((o.z - 2 - 100) / 300)
    loc = unreal.Vector(feet.x, feet.y, 2 + st * 300 + 112)
    eye = loc + unreal.Vector(0, 0, 77)
    hr = unreal.SystemLibrary.line_trace_single(w, eye, o, unreal.TraceTypeQuery.TRACE_TYPE_QUERY1, True, [pl], unreal.DrawDebugTrace.NONE, True)
    ok = hr and hr.to_tuple()[9] == a
    if ok or ${opts.behind ? 'True' : 'False'}: best = (loc, n); break
loc, n = best if best else (loc, n)
if ${opts.behind ? 'True' : 'False'}: loc = unreal.Vector(o.x + n.x * 140 * -1 if thin == 0 else loc.x, o.y + n.y * 140 * -1 if thin == 1 else loc.y, loc.z)
pl.set_actor_location(loc, False, True)
lat = unreal.Vector(0, 1, 0) if thin == 0 else unreal.Vector(1, 0, 0)
tgt = o + lat * ${off}
pc.set_control_rotation(unreal.MathLibrary.find_look_at_rotation(loc + unreal.Vector(0, 0, 77), tgt))
print("placed", "ok-side" if best else "NO clear side")`).catch((e) => 'ERR ' + e.message.slice(-500)));
  await wait(1.5);
  console.log(await py(H + `report(${JSON.stringify(t)})`).catch((e) => 'ERR ' + e.message.slice(-400)));
}
const doors = JSON.parse(await py(H + `
import json
print(json.dumps([a.get_actor_label() for a in unreal.GameplayStatics.get_all_actors_with_tag(w, "U5") if a.get_actor_label().startswith("Blok1_D_")]))`));
console.log('storey-5 doors', doors);
await aim('Blok1_Q05_LiftBtnA', 0, 'button A, aimed at centre');
await aim('Blok1_Q05_LiftBtnA', 20, 'button A, 20 cm aside');
await aim('Blok1_Q05_LiftBtnB', -25, 'button B, 25 cm aside');
await aim(doors[0], 0, 'entrance door, centre');
await aim(doors[0], 70, 'entrance door, 70 cm from centre (~25 cm past the edge)');
await aim(doors[0], 110, 'entrance door, 110 cm from centre (~65 cm past the edge)');
await aim(doors[0], 0, 'entrance door seen from behind its wall?', { behind: true, dist: 140 });
