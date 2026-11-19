import { init, py } from './ue.mjs';
await init();
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const H = `
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
pl = unreal.GameplayStatics.get_player_character(w, 0)
pc = unreal.GameplayStatics.get_player_controller(w, 0)
sub = sorted([x for x in unreal.ObjectIterator(unreal.EnhancedInputLocalPlayerSubsystem) if "LocalPlayer_" in x.get_path_name()], key=lambda x: int(x.get_path_name().split("LocalPlayer_")[1].split(".")[0]))[-1]
def inj(name, v): sub.inject_input_vector_for_action(unreal.load_asset("/Game/Blok1/Input/" + name), unreal.Vector(v, 0, 0), [], [])
arm = pl.get_editor_property("Arm")
def st(t): print(t, "| 3rd", pl.get_editor_property("ThirdPerson"), "level", pl.get_editor_property("ZoomLevel"), "arm %.0f cm, z %.0f" % (arm.get_editor_property("target_arm_length"), arm.get_editor_property("socket_offset").z), "| camera-player %.0f cm" % (pl.get_editor_property("Cam").get_world_location() - pl.get_actor_location()).length())
`;
const step = async (code, t, s = 1.2) => { await py(H + code).catch((e) => console.log('ERR', e.message.slice(-300))); await wait(s); console.log(await py(H + `st(${JSON.stringify(t)})`)); };
// open spot: the courtyard in front of the building (plan 15, 22), facing the block
await step(`pl.set_actor_location(unreal.Vector(1500 + 1500, -1500 + 2400, 2 + 112), False, True)\npl.get_movement_component().stop_movement_immediately()\npc.set_control_rotation(unreal.Rotator(0, -8, 90))`, 'first person');
await step(`inj("IA_View", 1)`, 'V -> third person');
await step(`inj("IA_Zoom", -1)`, 'wheel back');
await step(`inj("IA_Zoom", -1)`, 'wheel back');
await step(`inj("IA_Zoom", -1)`, 'wheel back (stays +2)');
await step(`inj("IA_Zoom", 1)`, 'wheel forward');
await step(`inj("IA_Zoom", 1)`, 'wheel forward');
await step(`inj("IA_Zoom", 1)`, 'wheel forward (stays 0)');
await step(`inj("IA_Zoom", -1)`, 'wheel back');
await step(`inj("IA_View", 1)`, 'V -> first person');
await step(`inj("IA_View", 1)`, 'V -> third person again (level remembered)');
