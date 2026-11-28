# Web-style orbit camera (three.js OrbitControls feel) for the sales UI. BP_OrbitCam = a pivot (the orbit target) with a camera
# child sitting `Dist` behind it; the actor's rotation is the camera direction, so orbiting = rotating the actor, zooming =
# moving the camera along its axis, panning = moving the actor. The logic lives in tools/unreal/ue_graphs/orbit_bp.mjs.
# This script makes the Blueprint (components + defaults) and one level instance Sales_Orbit (tag SOrbit) that carries the
# same post-process look as the other Sales_Cam* cameras.
#   exec(open(r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/ue_scripts/orbit_setup.py", encoding="utf-8").read())
import unreal
AT = unreal.AssetToolsHelpers.get_asset_tools(); EAL = unreal.EditorAssetLibrary
SDS = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem); BFL = unreal.SubobjectDataBlueprintFunctionLibrary
P = "/Game/Blok1/UI/BP_OrbitCam"
if not EAL.does_asset_exist(P):
    f = unreal.BlueprintFactory(); f.set_editor_property("parent_class", unreal.Actor)
    AT.create_asset("BP_OrbitCam", "/Game/Blok1/UI", unreal.Blueprint, f)
bp = unreal.load_asset(P)
hs = SDS.k2_gather_subobject_data_for_blueprint(bp)
if not any(str(BFL.get_variable_name(BFL.get_data(h))) == "Cam" for h in hs):
    p = unreal.AddNewSubobjectParams(parent_handle=hs[0], new_class=unreal.CameraComponent, blueprint_context=bp)
    h, fail = SDS.add_new_subobject(p)
    SDS.rename_subobject(h, unreal.Text("Cam"))
for h in SDS.k2_gather_subobject_data_for_blueprint(bp):
    o = BFL.get_object(BFL.get_data(h))
    if isinstance(o, unreal.CameraComponent):
        o.set_editor_property("field_of_view", 50.0)
        o.set_editor_property("constrain_aspect_ratio", False)
        o.set_editor_property("relative_location", unreal.Vector(-6000.0, 0.0, 0.0))
    print("comp", o.get_name(), o.get_class().get_name())
unreal.BlueprintEditorLibrary.compile_blueprint(bp); EAL.save_loaded_asset(bp, False)

eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
src = next((a for a in eas.get_all_level_actors() if a.get_actor_label() == "Sales_CamB02"), None)
orb = next((a for a in eas.get_all_level_actors() if a.get_actor_label() == "Sales_Orbit"), None)
if orb is None:
    orb = eas.spawn_actor_from_class(bp.generated_class(), unreal.Vector(0, 0, 3000), unreal.Rotator(roll=0.0, pitch=-30.0, yaw=0.0))
    orb.set_actor_label("Sales_Orbit"); orb.set_folder_path("Kompleks")
orb.set_editor_property("tags", [unreal.Name("Sotuv"), unreal.Name("SOrbit")])
orb.set_editor_property("is_spatially_loaded", False)
if src:
    sc = src.get_component_by_class(unreal.CameraComponent); oc = orb.get_component_by_class(unreal.CameraComponent)
    oc.set_editor_property("post_process_settings", sc.get_editor_property("post_process_settings"))
    oc.set_editor_property("post_process_blend_weight", sc.get_editor_property("post_process_blend_weight"))
print("orbit actor:", orb.get_actor_label(), "BP saved")
