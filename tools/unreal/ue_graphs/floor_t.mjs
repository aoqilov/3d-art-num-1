// PIE: storey-7 bedroom floor seen by the player (first person), to check the slab top against the floor finish.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { init, call, py } from './ue.mjs';
await init();
const SP = process.argv[2];
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const fg = () => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${SP}/fg.ps1"`);
const H = fs.readFileSync('zoom_t.mjs', 'utf8').split('const H = `')[1].split('`;')[0];
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
await wait(2); fg();
await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch(() => {});
await wait(14); fg();
console.log(await py(H + `pl.set_actor_location(unreal.Vector(1500 + 1540, -1500 + 380, 2 + 6 * 300 + 112), False, True)
pl.get_movement_component().stop_movement_immediately()
pc.set_control_rotation(unreal.Rotator(0, -45, 90))
print("ok")`).catch((e) => e.message.slice(-300)));
await wait(6);
await py(H + `unreal.SystemLibrary.execute_console_command(w, "HighResShot 1280x720 filename=${SP}/after_floor")`);
await wait(3);
await py(H + `pc.set_control_rotation(unreal.Rotator(0, -30, -90))`);
await wait(4);
await py(H + `unreal.SystemLibrary.execute_console_command(w, "HighResShot 1280x720 filename=${SP}/after_floor2")`);
await wait(3);
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
