// Fixed render set (maps-urban/REJA.md stage 8, used after every stage): PIE, summer, the time bar at each time, the
// camera Blok1_Cam2 moved to every pose of tools/unreal/out/render_cams.json, HighResShot (no UI) ->
// tools/unreal/out/renders/<stage>/<cam>_<time>.png, plus the frame time per shot (renders/<stage>/fps.txt).
// node render_set.mjs <stage> [times e.g. 13,2030] [cams e.g. A1_sw,S1_asosiy] [WxH]
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { init, call, py } from './ue.mjs';
await init();
const [STAGE, TIMES = '13,2030', ONLY = '', RES = '1920x1080'] = process.argv.slice(2);
const OUT = `C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/out/renders/${STAGE}`;
fs.mkdirSync(OUT, { recursive: true });
const SLIDER = { '08': 36, '13': 96, '1730': 150, '1930': 174, '2030': 186 };
const cams = JSON.parse(fs.readFileSync('C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/out/render_cams.json', 'utf8')).filter((c) => !ONLY || ONLY.split(',').includes(c[0]));
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const FG = 'C:/Users/user/AppData/Local/Temp/claude/5dd975448678a671/ce62cba6-a2ec-4fbb-8771-80b8aecba808/scratchpad/fg.ps1';
const fg = () => { try { execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${FG}"`); } catch {} };
const H = `
import unreal
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
pc = unreal.GameplayStatics.get_player_controller(w, 0)
def tw():
    for wd in unreal.ObjectIterator(unreal.UserWidget):
        if 'WBP_Blok1Time' in wd.get_class().get_name() and wd.get_world() == w: return wd
def slider(wd):
    for s in unreal.ObjectIterator(unreal.Slider):
        if s.get_outer() and s.get_typed_outer(unreal.UserWidget) == wd: return s
def actor(label):
    for a in unreal.GameplayStatics.get_all_actors_of_class(w, unreal.CameraActor):
        if a.get_actor_label() == label: return a
`;
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
fg(); await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch(() => {});
await wait(20); fg();
await py(H + `wd = tw()
b = [x for x in unreal.ObjectIterator(unreal.Button) if x.get_typed_outer(unreal.UserWidget) == wd and x.get_name() == 'BSummer']
b[0].on_clicked.broadcast()`);
const log = [];
for (const tn of TIMES.split(',')) {
  await py(H + `s = slider(tw()); s.set_value(${SLIDER[tn]}); s.on_value_changed.broadcast(${SLIDER[tn]})`); await wait(5);
  for (const [cn, x, y, z, pitch, yaw] of cams) {
    await py(H + `c = actor('Blok1_Cam2'); c.set_actor_location_and_rotation(unreal.Vector(${x}, ${y}, ${z}), unreal.Rotator(roll=0.0, pitch=${pitch}, yaw=${yaw}), False, True)
pc.set_view_target_with_blend(c, 0.0)`);
    await wait(7); fg();
    const ms = []; for (let i = 0; i < 6; i++) { ms.push(parseFloat(String(await py(H + 'print(unreal.GameplayStatics.get_world_delta_seconds(w))')))); await wait(0.15); }
    ms.sort((a, b) => a - b);
    await py(H + `unreal.SystemLibrary.execute_console_command(w, "HighResShot ${RES} filename=${OUT}/${cn}_${tn}")`); await wait(4);
    const line = `${cn} ${tn} ${(ms[3] * 1000).toFixed(1)} ms`; log.push(line); console.log(line);
  }
}
fs.appendFileSync(`${OUT}/fps.txt`, log.join('\n') + '\n');
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
