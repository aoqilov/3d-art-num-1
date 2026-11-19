// PIE: storey-7 flat interior, day (14:00) and evening (slider pushed via its OnValueChanged), first person.
// node light_t.mjs <outdir> <prefix>
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { init, call, py } from './ue.mjs';
await init();
const [SP, P] = process.argv.slice(2);
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const fg = () => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${SP}/fg.ps1"`);
const H = fs.readFileSync('zoom_t.mjs', 'utf8').split('const H = `')[1].split('`;')[0] + `
def slider():
    for wd in unreal.ObjectIterator(unreal.UserWidget):
        if 'WBP_Blok1Time' in wd.get_class().get_name() and wd.get_world() == w:
            for s in unreal.ObjectIterator(unreal.Slider):
                if s.get_outer() and s.get_typed_outer(unreal.UserWidget) == wd: return s
    return None
`;
const shot = async (n) => { await py(H + `unreal.SystemLibrary.execute_console_command(w, "HighResShot 1280x720 filename=${SP}/${P}_${n}")`); await wait(3); };
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
await wait(2); fg();
await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch(() => {});
await wait(14); fg();
const views = [['liv', 'pl.set_actor_location(unreal.Vector(1500 + 1860, -1500 + 1460, 2 + 6 * 300 + 112), False, True)\npc.set_control_rotation(unreal.Rotator(pitch=-8, yaw=-90, roll=0))'],      // flat 6 living room, storey 7
               ['liv2', 'pl.set_actor_location(unreal.Vector(1500 + 1860, -1500 + 1040, 2 + 6 * 300 + 112), False, True)\npc.set_control_rotation(unreal.Rotator(pitch=-8, yaw=90, roll=0))']];
const doViews = async (tag) => { for (const [n, c] of views) { await py(H + c + '\npl.get_movement_component().stop_movement_immediately()'); await wait(7); fg(); await shot(`${tag}_${n}`); } };
await doViews('day');
console.log(await py(H + `s = slider()
print('slider', s.get_name() if s else None, s.get_value() if s else None, s.get_editor_property('max_value') if s else None)
if s:
    s.set_value(186.0)   # ~20:30 on the 0..192 = 05:00..21:00 scale
    s.on_value_changed.broadcast(186.0)
print('lights tagged', len(unreal.GameplayStatics.get_all_actors_with_tag(w, 'ChiroqIch')))`).catch((e) => 'ERR ' + e.message.slice(-500)));
await wait(5);
await doViews('eve');
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
