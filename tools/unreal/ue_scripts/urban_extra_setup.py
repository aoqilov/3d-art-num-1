# Import one extra city layer built by build_urban.py (URBAN_SET=<set>) -> out/<set>.glb into /Game/Kompleks/Urban/<set>,
# actor "Kompleks_Urban_<set>" (folder Kompleks/Shahar), Nanite, full-precision UVs, materials by slot name from MATS.
# Caller sets SET and MATS (slot -> asset path) and optionally COLLIDE. Safe to re-run (never deletes a used material).
import unreal
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
AT = unreal.AssetToolsHelpers.get_asset_tools(); EAL = unreal.EditorAssetLibrary
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem); sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
SET = globals()["SET"]; MATS = globals()["MATS"]; COLLIDE = globals().get("COLLIDE", False)
D = "/Game/Kompleks/Urban/" + SET
for a in eas.get_all_level_actors():
    if a.get_actor_label() == "Kompleks_Urban_" + SET: eas.destroy_actor(a)
if EAL.does_directory_exist(D): EAL.delete_directory(D)
t = unreal.AssetImportTask(); t.filename = ROOT + "/out/" + SET + ".glb"; t.destination_path = D
t.automated = True; t.replace_existing = True; t.save = True
AT.import_asset_tasks([t])
sm = next(o for o in (unreal.load_asset(p) for p in t.imported_object_paths) if isinstance(o, unreal.StaticMesh))
for i, s in enumerate(sm.static_materials):
    k = next((k for k in MATS if str(s.material_slot_name).startswith(k)), None)
    if k: sm.set_material(i, unreal.load_asset(MATS[k]))
ns = sms.get_nanite_settings(sm); ns.enabled = True; sms.set_nanite_settings(sm, ns, apply_changes=True)
bs = sms.get_lod_build_settings(sm, 0); bs.set_editor_property("use_full_precision_u_vs", True); sms.set_lod_build_settings(sm, 0, bs)
if COLLIDE: sm.get_editor_property("body_setup").set_editor_property("collision_trace_flag", unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
EAL.save_loaded_asset(sm, False)
a = eas.spawn_actor_from_object(sm, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
a.set_actor_label("Kompleks_Urban_" + SET); a.set_folder_path("Kompleks/Shahar")
a.tags = [unreal.Name("Kompleks"), unreal.Name("Shahar")]; a.set_editor_property("is_spatially_loaded", False)
a.static_mesh_component.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS if COLLIDE else unreal.CollisionEnabled.NO_COLLISION)
print("extra ok", SET, [str(s.material_slot_name) for s in sm.static_materials])
