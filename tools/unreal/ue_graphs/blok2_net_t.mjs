// PIE test of block 2: player on the street between the blocks looking at block 2, then -1 / +1 / Play through the
// controller functions; full editor screenshots (bottom bar included).
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { init, call, py } from './ue.mjs';
await init();
const SP = process.argv[2];
const SL = 'SlateInspectorToolset.SlateInspectorToolset';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const fg = () => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${SP}/fg.ps1"`);
const H = `
import unreal
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
q = unreal.GameplayStatics.get_all_actors_with_tag(w, "Blok2Ctl")[0]
pl = unreal.GameplayStatics.get_player_character(w, 0)
pc = unreal.GameplayStatics.get_player_controller(w, 0)
`;
const st = `print("N", q.get_editor_property("N"), "pardoz", q.get_editor_property("Pardoz"), "net9 hidden", unreal.GameplayStatics.get_all_actors_with_tag(w, "B2N9")[0].get_editor_property("hidden"), "visible B2S7", not unreal.GameplayStatics.get_all_actors_with_tag(w, "B2S7")[0].get_editor_property("hidden"))`;
const shot = async (n) => { fg(); await wait(1); const r = await call(SL, 'Screenshot', { ref: '' }); const find = (o) => (typeof o === 'string' ? (o.length > 1000 ? o : null) : o && typeof o === 'object' ? Object.values(o).map(find).find(Boolean) : null); const d = find(r); if (!d) { console.log('no image', JSON.stringify(r).slice(0, 300)); return; } fs.writeFileSync(`${SP}/${n}.png`, Buffer.from(d, 'base64')); console.log(n, String(await py(H + st)).trim()); };
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
await wait(2); fg();
await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch(() => {});
await wait(14); fg();
console.log(String(await py(H + `pl.set_actor_location(unreal.Vector(1500 + 4450, -1500 - 4800, 114), False, True)
pl.get_movement_component().stop_movement_immediately()
pc.set_control_rotation(unreal.Rotator(pitch=14, yaw=78, roll=0))
` + st)).trim());
await wait(6);
await shot('n_start');
await py(H + 'q.call_method("Plus")\nq.call_method("Plus")\nq.call_method("PardozBtn")'); await wait(4); await shot('n_on8');
await py(H + 'q.call_method("Plus")'); await wait(4); await shot('n_on9');
await py(H + 'q.call_method("PardozBtn")'); await wait(3); await shot('n_off9');
