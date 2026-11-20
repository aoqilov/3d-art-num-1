// PIE test of the "Dron" button: click it, fly the drone (AddMovementInput for ~2 s), shot, click again.
import { execSync } from 'node:child_process';
import { init, call, py } from './ue.mjs';
await init();
const SP = process.argv[2];
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const fg = () => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${SP}/fg.ps1"`);
const H = `
import unreal
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
pc = unreal.GameplayStatics.get_player_controller(w, 0)
def click():
    for b in unreal.ObjectIterator(unreal.UserWidget):
        if 'WBP_Blok1Btn' in b.get_class().get_name() and b.get_world() == w and b.get_editor_property('action') == 6:
            b.get_editor_property('btn').on_clicked.broadcast(); return True
    return False
def st(t):
    p = pc.get_controlled_pawn(); print(t, p.get_class().get_name(), [round(v) for v in (p.get_actor_location().x, p.get_actor_location().y, p.get_actor_location().z)])
`;
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
fg(); await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch(() => {});
await wait(16); fg();
console.log(String(await py(H + 'st("start")\nprint("clicked", click())\nst("after click")')).trim());
await wait(2); fg();
for (let i = 0; i < 20; i++) await py(H + `p = pc.get_controlled_pawn()
p.add_movement_input(unreal.Vector(0, 0, 1), 1.0, False)
p.add_movement_input(p.get_actor_forward_vector(), 1.0, False)`);
await wait(1); fg();
console.log(String(await py(H + `st("flown")
pc.set_control_rotation(unreal.Rotator(roll=0.0, pitch=-35.0, yaw=60.0))`)).trim());
await wait(3); fg();
await py(H + `unreal.SystemLibrary.execute_console_command(w, "HighResShot 1600x900 filename=${SP}/drone_view")`); await wait(4);
console.log(String(await py(H + 'print("clicked", click())\nst("back")')).trim());
await wait(3);
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
