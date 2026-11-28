import { init, call, py } from './ue.mjs';
await init(); const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch(() => {});
for (let i = 0; i < 8; i++) {
  console.log(String(await py(`import unreal
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
pl = unreal.GameplayStatics.get_player_character(w, 0)
if pl:
    p = pl.get_actor_location(); mc = pl.get_movement_component()
    h = unreal.SystemLibrary.line_trace_single(w, unreal.Vector(p.x, p.y, 300), unreal.Vector(p.x, p.y, -500), unreal.TraceTypeQuery.TRACE_TYPE_QUERY1, True, [pl], unreal.DrawDebugTrace.NONE, True)
    t = h.to_tuple() if h else None
    print(round(unreal.GameplayStatics.get_time_seconds(w), 2), 'z', round(p.z), mc.get_editor_property('movement_mode'), 'ground', (round(t[4].z), next((x.get_actor_label() for x in t if isinstance(x, unreal.Actor)), None), next((x.get_name() for x in t if isinstance(x, unreal.PrimitiveComponent)), None)) if t else None, 'gravity', mc.get_editor_property('gravity_scale'))
else: print('no player')`)).trim());
  await wait(0.4);
}
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
