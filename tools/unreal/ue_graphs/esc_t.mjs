// PIE test 2026-11-21: Esc/Tab cursor toggle (IA_Cursor injected) and standing on block-2 storey 5 + stair climb.
import { execSync } from 'node:child_process';
import { init, call, py } from './ue.mjs';
await init();
const SP = process.argv[2];
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const fg = () => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${SP}/fg.ps1"`);
const H = `
import unreal
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
pl = unreal.GameplayStatics.get_player_character(w, 0)
pc = unreal.GameplayStatics.get_player_controller(w, 0)
def press(name):
    ia = unreal.load_asset("/Game/Blok1/Input/" + name)
    subs = sorted([x for x in unreal.ObjectIterator(unreal.EnhancedInputLocalPlayerSubsystem) if "LocalPlayer_" in x.get_path_name()], key=lambda x: int(x.get_path_name().split("LocalPlayer_")[1].split(".")[0]))
    subs[-1].inject_input_vector_for_action(ia, unreal.Vector(1, 0, 0), [], [])
`;
const run = (c) => py(H + c).then((r) => console.log(String(r).trim()), (e) => console.log('ERR', e.message.slice(-600)));
fg(); await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch((e) => console.log('pie', e.message.slice(0, 200)));
await wait(20); fg();
await run('print("cursor at start", pc.get_editor_property("show_mouse_cursor"))');
for (let i = 1; i <= 2; i++) { await run('press("IA_Cursor")'); await wait(0.6); fg(); await run(`print("after press $\{i}", pc.get_editor_property("show_mouse_cursor"))`.replace('$\{i}', i)); await wait(0.6); }
// block 2: storey 5 floor, a point in the plan middle
await run(`
exec(open(r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/ue_scripts/kompleks_coords.py", encoding="utf-8").read())
import math
bx, by, yaw, sx, sy = block_ue(1)
c, s_ = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
px, py_ = 14.85, 12.0
loc = unreal.Vector(bx + (px*c - py_*s_)*100, by + (px*s_ + py_*c)*100, 2 + 4*300 + 150)
pl.set_actor_location(loc, False, True); pl.get_movement_component().stop_movement_immediately()
print("put at", loc)`);
await wait(4);
await run('print("z after 4 s", round(pl.get_actor_location().z), "(storey 5 floor ~1202)")');
await run(`unreal.SystemLibrary.execute_console_command(w, "HighResShot 1280x720 filename=${SP}/b2_s5")`); await wait(3);
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
