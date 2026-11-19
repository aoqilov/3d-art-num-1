// PIE test of the Mannequin body: idle, walking, and a changed height / shoulder width, in third person.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { init, call, py } from './ue.mjs';
await init();
const SP = process.argv[2];
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const fg = () => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${SP}/fg.ps1"`);
const H = fs.readFileSync('zoom_t.mjs', 'utf8').split('const H = `')[1].split('`;')[0];
const run = async (code) => py(H + code).catch((e) => 'ERR ' + e.message.slice(-500));
const shot = async (n) => { await run(`unreal.SystemLibrary.execute_console_command(w, "HighResShot 1280x720 filename=${SP}/${n}")`); await wait(3); };
const info = `
m = pl.get_editor_property("mesh"); cap = pl.get_editor_property("capsule_component")
print("mesh", m.get_editor_property("skeletal_mesh_asset").get_name(), "scale", m.get_editor_property("relative_scale3d"), "z", m.get_editor_property("relative_location").z, "cap r/hh", cap.get_unscaled_capsule_radius(), cap.get_unscaled_capsule_half_height(), "eye z", arm.get_editor_property("relative_location").z, "anim", m.get_anim_instance().get_class().get_name() if m.get_anim_instance() else None, "speed", pl.get_velocity().length())`;
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
await wait(2);
fg();
await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch((e) => console.log('pie', e.message));
await wait(14);
fg();
console.log(await run(`pl.set_actor_location(unreal.Vector(3000, 900, 2 + 112), False, True)
pl.get_movement_component().stop_movement_immediately()
pc.set_control_rotation(unreal.Rotator(0, -10, 90))
inj("IA_View", 1)` ));
await wait(2);
console.log(await run(info));
await shot('m_idle');
// walk: continuous forward input for a few seconds, camera from behind-right
console.log(await run(`import builtins
def _walk(dt):
    p = unreal.GameplayStatics.get_player_character(unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world(), 0)
    if p: p.add_movement_input(unreal.Vector(1, 1, 0), 1.0)
builtins._walk_h = unreal.register_slate_post_tick_callback(_walk)
print("walking")`));
await wait(1.3);
console.log(await run(info));
await shot('m_walk');
console.log(await run(`import builtins
unreal.unregister_slate_post_tick_callback(builtins._walk_h)
print("rot", pl.get_actor_rotation(), "ctl", pc.get_control_rotation())`));
await wait(1);
// turn the camera so the figure is seen from the side, then try a tall, broad body
await run(`pl.get_movement_component().stop_movement_immediately()
pl.set_actor_location(unreal.Vector(3000, 900, 2 + 112), False, True)
pc.set_control_rotation(unreal.Rotator(0, -3, 180))
for _ in range(3): inj("IA_Zoom", -1)`);
await wait(1);
await shot('m_side176');
console.log(await run(`pl.set_editor_property("BoyiSm", 190.0)\npl.set_editor_property("YelkaSm", 52.0)\npl.call_method("ApplyBody")` + info));
await wait(1.5);
await shot('m_side190');
console.log(await run(`pl.set_editor_property("BoyiSm", 160.0)\npl.set_editor_property("YelkaSm", 40.0)\npl.call_method("ApplyBody")` + info));
await wait(1.5);
await shot('m_side160');
