import { execSync } from 'node:child_process';
import { init, call, py } from './ue.mjs';
await init();
const SP = process.argv[2];
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const fg = () => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${SP}/fg.ps1"`);
const H = `
import unreal
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
def slider():
    for wd in unreal.ObjectIterator(unreal.UserWidget):
        if 'WBP_Blok1Time' in wd.get_class().get_name() and wd.get_world() == w:
            for s in unreal.ObjectIterator(unreal.Slider):
                if s.get_outer() and s.get_typed_outer(unreal.UserWidget) == wd: return s
def sun():
    for a in unreal.GameplayStatics.get_all_actors_of_class(w, unreal.DirectionalLight):
        c = a.get_component_by_class(unreal.DirectionalLightComponent)
        print('sun rot', a.get_actor_rotation(), 'int', c.get_editor_property('intensity'), 'vis', c.is_visible())
    for a in unreal.GameplayStatics.get_all_actors_of_class(w, unreal.SkyLight):
        print('sky int', a.get_component_by_class(unreal.SkyLightComponent).get_editor_property('intensity'))
`;
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
fg(); await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch(() => {});
await wait(16);
for (const v of [108, 160, 180, 192]) {
  console.log(v, String(await py(H + `s=slider(); s.set_value(${v}); s.on_value_changed.broadcast(${v})`)));
  await wait(4); console.log(String(await py(H + 'sun()')));
}
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
