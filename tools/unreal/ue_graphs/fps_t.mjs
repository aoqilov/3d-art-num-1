// PIE frame-time sample: player at a given spot/view, editor in front, average of world delta seconds over ~4 s.
// node fps_t.mjs <outdir> <name> "<python placing pl/pc>"
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { init, call, py } from './ue.mjs';
await init();
const [SP, NAME, PLACE] = process.argv.slice(2);
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const fg = () => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${SP}/fg.ps1"`);
const H = `
import unreal
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
pl = unreal.GameplayStatics.get_player_character(w, 0)
pc = unreal.GameplayStatics.get_player_controller(w, 0)
`;
if (!String(await py(`import unreal\nprint(bool(unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()))`)).includes('True')) {
  fg(); await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch(() => {}); await wait(15);
}
fg();
await py(H + PLACE + '\npl.get_movement_component().stop_movement_immediately()');
await wait(8); fg();
const ms = [];
for (let i = 0; i < 16; i++) { ms.push(parseFloat(String(await py(H + 'print(unreal.GameplayStatics.get_world_delta_seconds(w))')))); await wait(0.25); }
ms.sort((a, b) => a - b);
const med = ms[Math.floor(ms.length / 2)];
console.log(NAME, 'median frame', (med * 1000).toFixed(1), 'ms =', (1 / med).toFixed(1), 'FPS', 'min/max ms', (ms[0] * 1000).toFixed(1), (ms[ms.length - 1] * 1000).toFixed(1));
await py(H + `unreal.SystemLibrary.execute_console_command(w, "HighResShot 1280x720 filename=${SP}/fps_${NAME}")`); await wait(3);
