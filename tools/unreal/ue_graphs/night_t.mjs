// PIE night check of the complex: player on the boulevard, day shot, time slider (WBP_Blok1Time) to its last value, night shot.
// node night_t.mjs <outdir>
import { execSync } from 'node:child_process';
import { init, call, py } from './ue.mjs';
await init();
const [SP, PX = "5400", PY = "-2500", YAW = "60", NM = "pie"] = process.argv.slice(2);
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const fg = () => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${SP}/fg.ps1"`);
const H = `
import unreal
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
pl = unreal.GameplayStatics.get_player_character(w, 0)
pc = unreal.GameplayStatics.get_player_controller(w, 0)
def slider():
    for wd in unreal.ObjectIterator(unreal.UserWidget):
        if 'WBP_Blok1Time' in wd.get_class().get_name() and wd.get_world() == w:
            for s in unreal.ObjectIterator(unreal.Slider):
                if s.get_outer() and s.get_typed_outer(unreal.UserWidget) == wd: return s
    return None
`;
const shot = async (n) => { await py(H + `unreal.SystemLibrary.execute_console_command(w, "HighResShot 1600x900 filename=${SP}/${n}")`); await wait(4); };
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
fg(); await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch(() => {});
await wait(16); fg();
const place = `pl.set_actor_location(unreal.Vector(${PX}, ${PY}, 120), False, True)
pc.set_control_rotation(unreal.Rotator(roll=0.0, pitch=8.0, yaw=${YAW}))
pl.get_movement_component().stop_movement_immediately()`;
await py(H + place); await wait(8); fg(); await shot(NM + "_day");
console.log(String(await py(H + `s = slider()
print('slider', s.get_value() if s else None, s.get_editor_property('max_value') if s else None)
if s:
    v = s.get_editor_property('max_value'); s.set_value(v); s.on_value_changed.broadcast(v)
a = [x for x in unreal.GameplayStatics.get_all_actors_with_tag(w, 'Chiroq') if x.get_actor_label().startswith('Kompleks')] if hasattr(unreal.Actor,'get_actor_label') else []
x = unreal.GameplayStatics.get_all_actors_with_tag(w, 'Chiroq')
print('chiroq', len(x), 'hidden', sum(1 for y in x if not y.root_component.is_visible()))`)));
await wait(8); fg(); await py(H + place); await wait(6); fg(); await shot(NM + "_night");
await py(H + `pc.set_control_rotation(unreal.Rotator(roll=0.0, pitch=22.0, yaw=${YAW}))`); await wait(5); fg(); await shot(NM + "_night_up");
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
