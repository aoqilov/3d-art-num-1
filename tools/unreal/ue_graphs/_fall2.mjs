import { init, call, py } from './ue.mjs';
await init(); const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch(() => {});
await wait(6);
for (const [n, x, y, z] of [['start', 2805, 1138, 120], ['hovli', 8313, -902, 150], ['kocha', 2300, -3000, 150], ['shahar', -9000, -3000, 300]]) {
  await py(`import unreal
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
pl = unreal.GameplayStatics.get_player_character(w, 0)
pl.get_movement_component().stop_movement_immediately(); pl.set_actor_location(unreal.Vector(${x}, ${y}, ${z}), False, True)`);
  await wait(3);
  console.log(n, String(await py(`import unreal
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
pl = unreal.GameplayStatics.get_player_character(w, 0); mc = pl.get_movement_component()
print(round(pl.get_actor_location().z), 'falling', mc.is_falling(), 'mode', mc.get_editor_property('movement_mode'))`)).trim());
}
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
