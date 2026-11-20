# Free-flying "Dron" camera (owner 2026-11-21): BP_Drone = DefaultPawn (engine WASD + mouse look, E / Space up, Q / C / Ctrl
# down), fast (25 m/s), no collision (flies through anything, also down into the car park), invisible. One instance in
# the level (label Kompleks_Dron, never auto-possessed); the left panel's "Dron" button (WBP_Blok1Btn action 6)
# moves it to the current camera and possesses it, pressing again gives control back to BP_Blok1Player.
import unreal
AT = unreal.AssetToolsHelpers.get_asset_tools(); EAL = unreal.EditorAssetLibrary
SDS = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem); BFL = unreal.SubobjectDataBlueprintFunctionLibrary
P = "/Game/Blok1/Player/BP_Drone"
if not EAL.does_asset_exist(P):
    f = unreal.BlueprintFactory(); f.set_editor_property("parent_class", unreal.DefaultPawn)
    AT.create_asset("BP_Drone", "/Game/Blok1/Player", unreal.Blueprint, f)
bp = unreal.load_asset(P)
for h in SDS.k2_gather_subobject_data_for_blueprint(bp):
    o = BFL.get_object(BFL.get_data(h))
    if isinstance(o, unreal.FloatingPawnMovement):
        o.set_editor_property("max_speed", 2500.0); o.set_editor_property("acceleration", 9000.0); o.set_editor_property("deceleration", 12000.0)
    elif isinstance(o, unreal.SphereComponent):
        o.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    elif isinstance(o, unreal.StaticMeshComponent):
        o.set_editor_property("hidden_in_game", True); o.set_editor_property("visible", False)
    print("comp", o.get_name(), o.get_class().get_name())
cdo = unreal.get_default_object(bp.generated_class())
cdo.set_editor_property("auto_possess_player", unreal.AutoReceiveInput.DISABLED)
unreal.BlueprintEditorLibrary.compile_blueprint(bp); EAL.save_loaded_asset(bp, False)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
for a in eas.get_all_level_actors():
    if a.get_actor_label() == "Kompleks_Dron": eas.destroy_actor(a)
d = eas.spawn_actor_from_class(bp.generated_class(), unreal.Vector(5000, 2000, 3000))
d.set_actor_label("Kompleks_Dron"); d.set_folder_path("Kompleks"); d.tags = [unreal.Name("Dron")]
d.set_actor_enable_collision(False); d.set_editor_property("is_spatially_loaded", False)
print("drone ok")
