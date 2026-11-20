// PIE shots in / into the underground car park. node parking_t.mjs <outdir> '[["name", x, y, z, pitch, yaw], ...]'
import { execSync } from 'node:child_process';
import { init, call, py } from './ue.mjs';
await init();
const [SP, V] = process.argv.slice(2);
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const fg = () => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${SP}/fg.ps1"`);
const H = `
import unreal
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
pl = unreal.GameplayStatics.get_player_character(w, 0)
pc = unreal.GameplayStatics.get_player_controller(w, 0)
`;
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
fg(); await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch(() => {});
await wait(16);
for (const [n, x, y, z, p, yw] of JSON.parse(V)) {
  fg();
  console.log(n, String(await py(H + `pl.set_actor_location(unreal.Vector(${x}, ${y}, ${z}), False, True)
pc.set_control_rotation(unreal.Rotator(roll=0.0, pitch=${p}, yaw=${yw}))
pl.get_movement_component().stop_movement_immediately()`)).trim());
  await wait(8); fg();
  console.log(String(await py(H + `print('z after', round(pl.get_actor_location().z))
unreal.SystemLibrary.execute_console_command(w, "HighResShot 1600x900 filename=${SP}/${n}")`)).trim()); await wait(4);
}
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
