# The real city around the complex (maps-urban/REJA.md stages 1-3): tools/unreal/out/urban.glb (urban_prep.py ->
# urban_mesh.py -> build_urban.py) -> /Game/Kompleks/Urban, one actor per mesh at the origin ("Kompleks_Urban_*", folder
# Kompleks/Shahar), Nanite. Terrain and roads collide (complex as simple: the player walks the real relief).
# The old flat landscape is hidden and stops colliding (it would cut the relief); the complex keeps its own ground.
# Materials: ground / grass MI_GP_Soil, asphalt MI_GP_Asphalt, pavers MI_GP_Pavers, paint M_CX_Paint, walls M_CX_Wall
# (colour from UV sets 1-2, window grid, night windows), roofs M_CX_Roof, water M_UR_Water (made here). Safe to re-run.
import unreal
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
AT = unreal.AssetToolsHelpers.get_asset_tools(); EAL = unreal.EditorAssetLibrary; MEL = unreal.MaterialEditingLibrary
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem); sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
D, MD = "/Game/Kompleks/Urban", "/Game/Kompleks/Urban/Mat"
if not EAL.does_directory_exist(MD): EAL.make_directory(MD)

wp = MD + "/M_UR_Water"
if not EAL.does_asset_exist(wp):
    m = AT.create_asset("M_UR_Water", MD, unreal.Material, unreal.MaterialFactoryNew())
    c = MEL.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -400, 0); c.set_editor_property("constant", unreal.LinearColor(0.02, 0.05, 0.05, 1))
    r = MEL.create_material_expression(m, unreal.MaterialExpressionConstant, -400, 150); r.set_editor_property("r", 0.06)
    MEL.connect_material_property(c, "", unreal.MaterialProperty.MP_BASE_COLOR); MEL.connect_material_property(r, "", unreal.MaterialProperty.MP_ROUGHNESS)
    MEL.recompile_material(m); EAL.save_loaded_asset(m, False)
L = unreal.load_asset
mats = {"M_UR_Ground": L("/Game/Kompleks/Urban/Mat/M_UR_GroundWP"), "M_UR_Grass": L("/Game/Kompleks/Urban/Mat/M_UR_GroundWP"),   # urban_ground_mat.py
        "M_UR_Asphalt": L("/Game/Kompleks/Mat/MI_GP_Asphalt"), "M_UR_Pavers": L("/Game/Kompleks/Mat/MI_GP_Pavers"),
        "M_UR_Paint": L("/Game/Kompleks/Context/Mat/M_CX_Paint"), "M_UR_Wall": L("/Game/Kompleks/Context/Mat/M_CX_Wall"),
        "M_UR_Roof": L("/Game/Kompleks/Context/Mat/M_CX_Roof"), "M_UR_Water": L(wp)}
print("materials", {k: (v.get_name() if v else None) for k, v in mats.items()})

if EAL.does_directory_exist(D + "/urban"): EAL.delete_directory(D + "/urban")
t = unreal.AssetImportTask(); t.filename = ROOT + "/out/urban.glb"; t.destination_path = D + "/urban"
t.automated = True; t.replace_existing = True; t.save = True
AT.import_asset_tasks([t])
meshes = [o for o in (unreal.load_asset(p) for p in t.imported_object_paths) if isinstance(o, unreal.StaticMesh)]
for a in eas.get_all_level_actors():
    if a.get_actor_label() in ("Kompleks_Urban_Urban_Terrain", "Kompleks_Urban_Urban_Roads", "Kompleks_Urban_Urban_Walls", "Kompleks_Urban_Urban_Roofs"):
        eas.destroy_actor(a)          # only its own 4 meshes (2026-11-22: a prefix match also removed curbs, walls, zebras, shops)
for sm in meshes:
    for i, s in enumerate(sm.static_materials):
        n = str(s.material_slot_name); key = next((k for k in mats if n.startswith(k)), None)
        if key and mats[key]: sm.set_material(i, mats[key])
    ns = sms.get_nanite_settings(sm); ns.enabled = True; sms.set_nanite_settings(sm, ns, apply_changes=True)
    bs_ = sms.get_lod_build_settings(sm, 0); bs_.set_editor_property("use_full_precision_u_vs", True)   # UVs are metres (up to
    sms.set_lod_build_settings(sm, 0, bs_)                                                              # +-1500): half floats streak
    walk = sm.get_name() in ("Urban_Terrain", "Urban_Roads")
    if walk:
        bs = sm.get_editor_property("body_setup"); bs.set_editor_property("collision_trace_flag", unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
    EAL.save_loaded_asset(sm, False)
    a = eas.spawn_actor_from_object(sm, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    a.set_actor_label("Kompleks_Urban_" + sm.get_name()); a.set_folder_path("Kompleks/Shahar")
    a.tags = [unreal.Name("Kompleks"), unreal.Name("Shahar")]; a.set_editor_property("is_spatially_loaded", False)
    a.static_mesh_component.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS if walk else unreal.CollisionEnabled.NO_COLLISION)
    print("mesh", sm.get_name(), [str(s.material_slot_name) for s in sm.static_materials])
n = 0
for a in eas.get_all_level_actors():
    if isinstance(a, (unreal.Landscape, unreal.LandscapeStreamingProxy)) or type(a).__name__ == "WorldPartitionHLOD":   # the HLODs draw a landscape proxy
        a.set_actor_hidden_in_game(True); a.set_is_temporarily_hidden_in_editor(True); a.set_actor_enable_collision(False); n += 1   # flat z 0 would be an invisible floor over the lower relief
        for c in a.get_components_by_class(unreal.PrimitiveComponent): c.set_hidden_in_game(True); c.set_visibility(False)
print("landscape hidden", n, "urban ok", len(meshes))
