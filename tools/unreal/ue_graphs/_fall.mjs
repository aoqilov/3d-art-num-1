import { init, call, py } from './ue.mjs';
await init(); const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch(() => {});
await wait(8);
console.log(String(await py(`import unreal
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
pl = unreal.GameplayStatics.get_player_character(w, 0)
print('player z after 8 s', round(pl.get_actor_location().z) if pl else None)`)).trim());
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
