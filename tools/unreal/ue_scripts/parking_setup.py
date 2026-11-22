# Underground car park: tools/unreal/out/parking.glb (build_parking.py) -> /Game/Kompleks/Parking, actor
# "Kompleks_Parking" at the origin with complex-as-simple collision (walkable), material instances of the courtyard
# master M_GP_Surface (ground_import.py) + an emissive fixture material, and point lights over the aisles
# ("Kompleks_PkL_*", tag Parking, always on). Safe to re-run.
import unreal, json
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
AT = unreal.AssetToolsHelpers.get_asset_tools(); EAL = unreal.EditorAssetLibrary; MEL = unreal.MaterialEditingLibrary
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
D = "/Game/Kompleks/Parking"; MATD = "/Game/Kompleks/Mat"; TEX = "/Game/Kompleks/Tex/T_GP_"
P = json.load(open(ROOT + "/out/parking.json"))
for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith(("Kompleks_Parking", "Kompleks_PkL_")): eas.destroy_actor(a)
if EAL.does_directory_exist(D + "/parking"): EAL.delete_directory(D + "/parking")

master = unreal.load_asset(MATD + "/M_GP_Surface")
LOOK = {  # slot: (texture set, tile m, tint, roughness scale)
    "M_PK_Floor": ("Curb", 3.0, (0.5, 0.5, 0.5), 0.7), "M_PK_Ceil": ("Curb", 3.0, (0.85, 0.85, 0.85), 1.0),
    "M_PK_Wall": ("Curb", 2.5, (0.9, 0.9, 0.88), 1.0), "M_PK_Col": ("Curb", 2.0, (0.95, 0.95, 0.95), 1.0),
    "M_PK_Band": ("Curb", 2.0, (1.0, 0.7, 0.05), 0.8), "M_PK_Paint": ("Curb", 4.0, (1.4, 1.4, 1.4), 0.6),
    "M_PK_Core": ("Curb", 2.0, (0.72, 0.78, 0.86), 1.0), "M_PK_Door": ("Curb", 2.0, (0.35, 0.37, 0.4), 0.4),
    "M_PK_Lobby": ("Pavers", 1.0, (1.05, 1.05, 1.05), 0.6)}
mis = {}
for slot, (key, tm, tn, rsc) in LOOK.items():
    name = "MI_" + slot[2:]; path = MATD + "/" + name
    mi = unreal.load_asset(path) if EAL.does_asset_exist(path) else AT.create_asset(name, MATD, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    mi.set_editor_property("parent", master)
    MEL.set_material_instance_scalar_parameter_value(mi, "TileM", tm)
    MEL.set_material_instance_scalar_parameter_value(mi, "RoughScale", rsc)
    MEL.set_material_instance_vector_parameter_value(mi, "Tint", unreal.LinearColor(*tn, 1))
    for p_, k in (("Albedo", "A"), ("Normal", "N"), ("ARM", "ARM")):
        MEL.set_material_instance_texture_parameter_value(mi, p_, unreal.load_asset(TEX + key + "_" + k))
    MEL.update_material_instance(mi); EAL.save_loaded_asset(mi, False); mis[slot] = mi
lp = MATD + "/M_PK_LightE"
if not EAL.does_asset_exist(lp):
    m = AT.create_asset("M_PK_LightE", MATD, unreal.Material, unreal.MaterialFactoryNew())
    m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    c = MEL.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -300, 0); c.set_editor_property("constant", unreal.LinearColor(600.0, 620.0, 650.0, 1))
    MEL.connect_material_property(c, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    MEL.recompile_material(m); EAL.save_loaded_asset(m, False)
mis["M_PK_Light"] = unreal.load_asset(lp)

t = unreal.AssetImportTask(); t.filename = ROOT + "/out/parking.glb"; t.destination_path = D; t.automated = True; t.replace_existing = True; t.save = True
AT.import_asset_tasks([t])
mesh = next(o for o in (unreal.load_asset(p_) for p_ in t.imported_object_paths) if isinstance(o, unreal.StaticMesh))
for i, s in enumerate(mesh.static_materials):
    if str(s.material_slot_name) in mis: mesh.set_material(i, mis[str(s.material_slot_name)])
mesh.get_editor_property("body_setup").set_editor_property("collision_trace_flag", unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
EAL.save_loaded_asset(mesh, False)
g = eas.spawn_actor_from_object(mesh, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
g.set_actor_label("Kompleks_Parking"); g.set_folder_path("Kompleks/Parking"); g.tags = [unreal.Name("Kompleks"), unreal.Name("Parking")]
g.set_editor_property("is_spatially_loaded", False)

zc = P["z_ceil"] * 100 - 30
for k, (x, y) in enumerate(P["lights"]):
    pl = eas.spawn_actor_from_class(unreal.PointLight, unreal.Vector(x * 100, -y * 100, zc))
    pl.set_actor_label("Kompleks_PkL_%d" % k); pl.set_folder_path("Kompleks/Parking")
    lc = pl.get_component_by_class(unreal.PointLightComponent)
    lc.set_editor_property("intensity_units", unreal.LightUnits.LUMENS); lc.set_editor_property("intensity", 6000.0)  # 2026-11-22 physical units: sun 120000 lux, local lights and emissives x100 (were scene scale, sun 6 lux)
    lc.set_editor_property("use_temperature", True); lc.set_editor_property("temperature", 5000.0)
    lc.set_editor_property("attenuation_radius", 1600.0); lc.set_editor_property("source_radius", 30.0)
    lc.set_editor_property("cast_shadows", False)
    lc.set_editor_property("max_draw_distance", 5000.0); lc.set_editor_property("max_distance_fade_range", 1000.0)
    pl.tags = [unreal.Name("Kompleks"), unreal.Name("Parking")]; pl.set_editor_property("is_spatially_loaded", False)
print("parking ok", P["stalls"], "stalls,", len(P["lights"]), "lights")
