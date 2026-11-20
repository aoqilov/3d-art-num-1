// PIE GPU profile at a spot: node prof_t.mjs <outdir> x y z yaw
import { execSync } from 'node:child_process';
import { init, call, py } from './ue.mjs';
await init();
const [SP, X, Y, Z, YAW] = process.argv.slice(2);
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
await wait(16); fg();
await py(H + `pl.set_actor_location(unreal.Vector(${X}, ${Y}, ${Z}), False, True)
pc.set_control_rotation(unreal.Rotator(roll=0.0, pitch=-3.0, yaw=${YAW}))
pl.get_movement_component().stop_movement_immediately()`);
await wait(10); fg();
const ms = [];
for (let i = 0; i < 12; i++) { ms.push(parseFloat(String(await py(H + 'print(unreal.GameplayStatics.get_world_delta_seconds(w))')))); await wait(0.25); }
ms.sort((a, b) => a - b); console.log('FRAME median ms', (ms[6] * 1000).toFixed(1), 'max', (ms[11] * 1000).toFixed(1));
await py(H + 'unreal.SystemLibrary.execute_console_command(w, "ProfileGPU")'); await wait(6);
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
