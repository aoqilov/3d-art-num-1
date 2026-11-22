# Slim street lamps (owner 2026-11-22, after the reference render foto-reference/Screenshot_2.png): tools/unreal/kit_glb/
# prop_lamp2.glb (build_lamp2.py) at the old prop_lamp positions of out/props.json (road edges every ~20 m, boulevard
# crossings). One HISM actor "Kompleks_Props_prop_lamp2" + a down-facing spot per lamp under the LED panel (tag
# "ChiroqSpot": the time bar switches them with the night). The panel glows with M_LampGlowNight (night only).
# props_setup.py keeps dropping the old prop_lamp. Safe to re-run.
import unreal, json
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
AT = unreal.AssetToolsHelpers.get_asset_tools(); EAL = unreal.EditorAssetLibrary
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem); sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
SDS = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem); BFL = unreal.SubobjectDataBlueprintFunctionLibrary
LM = globals().get("LAMP_LM", 4500.0)
D = "/Game/Kompleks/Props/prop_lamp2"
if EAL.does_directory_exist(D): EAL.delete_directory(D)
t = unreal.AssetImportTask(); t.filename = ROOT + "/kit_glb/prop_lamp2.glb"; t.destination_path = D
t.automated = True; t.replace_existing = True; t.save = True
AT.import_asset_tasks([t])
sm = next(o for o in (unreal.load_asset(p) for p in t.imported_object_paths) if isinstance(o, unreal.StaticMesh))
black = unreal.load_asset("/Game/Kompleks/Props/prop_bollard/prop_bollard/Materials/M_PropBlack")
if black is None:                                              # fall back: the bollard mesh's own black slot
    for p in EAL.list_assets("/Game/Kompleks/Props/prop_bollard", recursive=True):
        a = EAL.load_asset(p)
        if isinstance(a, unreal.StaticMesh): black = a.get_material(0)
glow = unreal.load_asset("/Game/Kompleks/Night/M_LampGlowNight")
for i, s in enumerate(sm.static_materials):
    sm.set_material(i, glow if "Glow" in str(s.material_slot_name) else black)
ns = sms.get_nanite_settings(sm); ns.enabled = True; sms.set_nanite_settings(sm, ns, apply_changes=True)
EAL.save_loaded_asset(sm, False)

for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith(("Kompleks_Props_prop_lamp2", "Kompleks_LampL_")): eas.destroy_actor(a)
rows = [r for r in json.load(open(ROOT + "/out/props.json")) if r[5] == "prop_lamp"]
act = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0))
act.set_actor_label("Kompleks_Props_prop_lamp2"); act.set_folder_path("Kompleks/Props")
act.tags = [unreal.Name("Kompleks"), unreal.Name("Props")]; act.set_editor_property("is_spatially_loaded", False)
h, _ = SDS.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=SDS.k2_gather_subobject_data_for_instance(act)[0], new_class=unreal.HierarchicalInstancedStaticMeshComponent))
comp = BFL.get_object(BFL.get_data(h)); comp.set_editor_property("static_mesh", sm)
comp.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS)
for k, r in enumerate(rows):
    x, y, z = r[0], r[1], r[2]
    comp.add_instance(unreal.Transform(location=unreal.Vector(x, y, z)), True)
    s = eas.spawn_actor_from_class(unreal.SpotLight, unreal.Vector(x, y, z + 448.0), unreal.Rotator(roll=0.0, pitch=-90.0, yaw=0.0))
    s.set_actor_label("Kompleks_LampL_%d" % k); s.set_folder_path("Kompleks/Chiroqlar")
    lc = s.get_component_by_class(unreal.SpotLightComponent)
    lc.set_editor_property("intensity_units", unreal.LightUnits.LUMENS); lc.set_editor_property("intensity", LM)
    lc.set_editor_property("use_temperature", True); lc.set_editor_property("temperature", 4000.0)
    lc.set_editor_property("attenuation_radius", 1800.0); lc.set_editor_property("source_radius", 25.0)
    lc.set_editor_property("inner_cone_angle", 45.0); lc.set_editor_property("outer_cone_angle", 75.0)
    lc.set_editor_property("cast_shadows", False)
    lc.set_editor_property("max_draw_distance", 12000.0); lc.set_editor_property("max_distance_fade_range", 2000.0)
    s.tags = [unreal.Name("Kompleks"), unreal.Name("ChiroqSpot")]; s.set_editor_property("is_spatially_loaded", False)
print("street lamps ok", len(rows), "black", black.get_name() if black else None, "glow", glow.get_name() if glow else None)
