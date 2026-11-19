import fs from 'node:fs';
import { init, py } from './ue.mjs';
await init();
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const base = fs.readFileSync('use_t.mjs', 'utf8');
const H = base.slice(base.indexOf('const H = `') + 11, base.indexOf('`;', base.indexOf('const H = `')));
const PRESS = `
ia = unreal.load_asset("/Game/Blok1/Input/IA_Use")
import re
subs = sorted([x for x in unreal.ObjectIterator(unreal.EnhancedInputLocalPlayerSubsystem) if "LocalPlayer_" in x.get_path_name()], key=lambda x: int(x.get_path_name().split("LocalPlayer_")[1].split(".")[0]))
subs[-1].inject_input_vector_for_action(ia, unreal.Vector(1, 0, 0), [], [])
print("E pressed via", subs[-1].get_path_name()[-60:])
`;
const run = (c) => py(H + c).then(console.log, (e) => console.log('ERR', e.message.slice(-700)));
// door: aim 25 cm past its edge, press E
await run(`
a = find("Blok1_D_05_27"); o, e = a.get_actor_bounds(True)
thin = 0 if e.x < e.y else 1
for sgn in (1, -1):
    n = unreal.Vector(sgn, 0, 0) if thin == 0 else unreal.Vector(0, sgn, 0)
    loc = unreal.Vector(o.x + n.x * 140, o.y + n.y * 140, 2 + round((o.z - 102) / 300) * 300 + 112)
    hr = unreal.SystemLibrary.line_trace_single(w, loc + unreal.Vector(0,0,77), o, unreal.TraceTypeQuery.TRACE_TYPE_QUERY1, True, [pl], unreal.DrawDebugTrace.NONE, True)
    if hr and hr.to_tuple()[9] == a: break
pl.set_actor_location(loc, False, True)
lat = unreal.Vector(0, 1, 0) if thin == 0 else unreal.Vector(1, 0, 0)
pc.set_control_rotation(unreal.MathLibrary.find_look_at_rotation(loc + unreal.Vector(0,0,77), o + lat * (max(e.x, e.y) + 25)))
print("door half width %.0f" % max(e.x, e.y))`);
await wait(1.5); await run(`report("door, 25 cm past edge, before E")\nprint("IsOpen", find("Blok1_D_05_27").get_editor_property("IsOpen"))`);
await run(PRESS); await wait(1.5);
await run(`report("after E")\nprint("IsOpen", find("Blok1_D_05_27").get_editor_property("IsOpen"))`);
await wait(1.5); await run(PRESS); await wait(1.5);
await run(`report("after 2nd E")\nprint("IsOpen", find("Blok1_D_05_27").get_editor_property("IsOpen"))`);
// lift button 20 cm aside, press E
await run(`
b = unreal.GameplayStatics.get_all_actors_with_tag(w, "LBA5")[0]; o, e = b.get_actor_bounds(True)
loc = unreal.Vector(o.x + 140, o.y, 2 + 4 * 300 + 112); pl.set_actor_location(loc, False, True)
pc.set_control_rotation(unreal.MathLibrary.find_look_at_rotation(loc + unreal.Vector(0,0,77), o + unreal.Vector(0, 20, 0)))`);
await wait(1.5); await run(`report("lift A button, 20 cm aside")`);
await run(PRESS); await wait(1.5);
await run(`L = unreal.GameplayStatics.get_all_actors_with_tag(w, "LiftCtlA")[0]\nprint("lift A target", L.get_editor_property("TargetFloor"), "calls", list(L.get_editor_property("Calls")), "btn", b.static_mesh_component.get_material(0).get_name() if False else unreal.GameplayStatics.get_all_actors_with_tag(w, "LBA5")[0].static_mesh_component.get_material(0).get_name())`);
