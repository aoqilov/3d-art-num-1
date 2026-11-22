// D3 fly-through without Movie Render Queue (plugin not enabled): PIE, summer, a time of day, the camera Blok1_Cam2
// moved along the orbit of ue_scripts/flythrough_setup.py frame by frame, HighResShot per frame ->
// tools/unreal/out/renders/D3_video/<time>/f_0000.png ... ; then python joins them into an mp4 (OpenCV).
// node flythrough_frames.mjs [time 13|1930|2030] [seconds] [fps] [WxH]
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { init, call, py } from './ue.mjs';
await init();
const [TN = '1930', SECS = '15', FPS = '24', RES = '1920x1080'] = process.argv.slice(2);
const SLIDER = { '13': 96, '1930': 174, '2030': 186 };
const OUT = `C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/out/renders/D3_video/${TN}`;
fs.mkdirSync(OUT, { recursive: true });
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
def cam():
    for a in unreal.GameplayStatics.get_all_actors_of_class(w, unreal.CameraActor):
        if a.get_actor_label() == 'Blok1_Cam2': return a
def hide_ui():
    for wd in unreal.ObjectIterator(unreal.UserWidget):
        if wd.get_world() == w and wd.is_in_viewport(): wd.set_visibility(unreal.SlateVisibility.HIDDEN)
`;
// orbit (same numbers as flythrough_setup.py)
const CX = 2430, CY = -830, R0 = 26000, R1 = 16000, H0 = 14000, H1 = 6500, ORBIT = 160;
const ease = (t) => t * t * (3 - 2 * t);
const pose = (t) => {
  const e = ease(t), a = ((200 + ORBIT * t) * Math.PI) / 180, r = R0 + (R1 - R0) * e, h = H0 + (H1 - H0) * e;
  const x = CX + r * Math.cos(a), y = CY + r * Math.sin(a);
  return { x, y, z: h, yaw: (Math.atan2(CY - y, CX - x) * 180) / Math.PI, pitch: (-Math.atan2(h - 1500, r) * 180) / Math.PI };
};
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
fg(); await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch(() => {});
await wait(20); fg();
await py(H + `wd = tw()
b = [x for x in unreal.ObjectIterator(unreal.Button) if x.get_typed_outer(unreal.UserWidget) == wd and x.get_name() == 'BSummer']
b[0].on_clicked.broadcast()
s = slider(wd); s.set_value(${SLIDER[TN]}); s.on_value_changed.broadcast(${SLIDER[TN]})`);
await wait(4);
const N = Number(SECS) * Number(FPS);
const p0 = pose(0);
await py(H + `c = cam(); c.set_actor_location_and_rotation(unreal.Vector(${p0.x}, ${p0.y}, ${p0.z}), unreal.Rotator(roll=0.0, pitch=${p0.pitch}, yaw=${p0.yaw}), False, True)
pc.set_view_target_with_blend(c, 0.0)`);
await wait(6); fg();
for (let k = 0; k < N; k++) {
  const p = pose(k / (N - 1));
  await py(H + `c = cam(); c.set_actor_location_and_rotation(unreal.Vector(${p.x}, ${p.y}, ${p.z}), unreal.Rotator(roll=0.0, pitch=${p.pitch}, yaw=${p.yaw}), False, True)`);
  await wait(0.35);
  await py(H + `unreal.SystemLibrary.execute_console_command(w, "HighResShot ${RES} filename=${OUT}/f_${String(k).padStart(4, '0')}")`);
  await wait(1.1);
  if (k % 60 === 0) { fg(); console.log('frame', k, '/', N); }
}
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
console.log('frames done', N);
