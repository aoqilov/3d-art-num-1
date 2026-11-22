# Courtyard furniture (copy of plants_setup.py for out/props.json). Courtyard plants: Poly Haven CC0 models (tools/unreal/kit_glb, kit_clean.py) into /Game/Kompleks/Plants/<id>, Nanite on
# (masked foliage is supported), placed from tools/unreal/out/plants.json (plants_layout.py) as one actor per model with a
# HierarchicalInstancedStaticMeshComponent ("Kompleks_Plants_<id>", tag Kompleks). No collision. Safe to re-run;
# PLANTS_REIMPORT = True re-imports the meshes (their folder is deleted first: a glTF reimport over existing assets
# opens a modal dialog).
import unreal, json
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
AT = unreal.AssetToolsHelpers.get_asset_tools(); EAL = unreal.EditorAssetLibrary
sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
SDS = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem); BFL = unreal.SubobjectDataBlueprintFunctionLibrary
P = json.load(open(ROOT + "/out/props.json"))
DROP = {"prop_lamp"}   # 2026-11-22 owner: the old box-head lamp is gone; slim lamps at the same spots: street_lamps_setup.py
P = [r for r in P if r[5] not in DROP]
P = {"prop": P}
MODELS = {"prop": ["prop_lamp", "prop_bench", "prop_bin", "prop_bollard", "prop_dome", "prop_slide", "prop_swing", "prop_spring",
                   "prop_hoop", "prop_pullup", "prop_fountain", "prop_jets"]}     # build_props.py placeholders

# placeholder -> real asset (owner: Fab models later). out/model_map.json: {"jacaranda_tree": "/Game/Fab/.../SM_Tree", ...}
import os
MAP = json.load(open(ROOT + "/out/model_map.json")) if os.path.exists(ROOT + "/out/model_map.json") else {}
mesh = {}
for ids in MODELS.values():
    for m in ids:
        if m in MAP:
            mesh[m] = unreal.load_asset(MAP[m]); continue
        dst = "/Game/Kompleks/Props/" + m
        if globals().get("PLANTS_REIMPORT", False) and EAL.does_directory_exist(dst): EAL.delete_directory(dst)
        sm = None
        if EAL.does_directory_exist(dst):
            for p in EAL.list_assets(dst, recursive=True):
                a = EAL.load_asset(p)
                if isinstance(a, unreal.StaticMesh): sm = a
        if sm is None:
            t = unreal.AssetImportTask(); t.filename = ROOT + "/kit_glb/" + m + ".glb"; t.destination_path = dst
            t.automated = True; t.replace_existing = True; t.save = True
            AT.import_asset_tasks([t])
            sm = next(o for o in (unreal.load_asset(p) for p in t.imported_object_paths) if isinstance(o, unreal.StaticMesh))
            s = sms.get_nanite_settings(sm); s.enabled = True
            s.set_editor_property("shape_preservation", unreal.NaniteShapePreservation.PRESERVE_AREA)
            sms.set_nanite_settings(sm, s, apply_changes=True)
            EAL.save_loaded_asset(sm, False)
        mesh[m] = sm

for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith("Kompleks_Props_"): eas.destroy_actor(a)
counts = {}
for kind, rows in ({"prop": P} if isinstance(P, list) else P).items():   # props.json is a flat row list
    by = {}
    for r in rows:
        m = r[5] if len(r) > 5 else MODELS[kind][0]       # rows: x, y, z, yaw, scale[, model, z-scale (0 = uniform)]
        by.setdefault(m, []).append(r)
    for m, rs in by.items():
        act = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0))   # (a bare Actor has no root to attach to)
        act.set_actor_label("Kompleks_Props_" + m); act.set_folder_path("Kompleks/Props")
        act.tags = [unreal.Name("Kompleks"), unreal.Name("Props")]
        root = SDS.k2_gather_subobject_data_for_instance(act)[0]
        h, fail = SDS.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=root, new_class=unreal.HierarchicalInstancedStaticMeshComponent))
        comp = BFL.get_object(BFL.get_data(h))
        comp.set_editor_property("static_mesh", mesh[m])
        comp.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS)   # the player bumps into lamps / benches
        comp.set_editor_property("cast_shadow", True)
        for r in rs:
            x, y, z, yaw, sc = r[:5]
            sz = r[6] if len(r) > 6 and r[6] else sc
            comp.add_instance(unreal.Transform(location=unreal.Vector(x, y, z), rotation=unreal.Rotator(roll=0.0, pitch=0.0, yaw=yaw),
                                               scale=unreal.Vector(sc, sc, sz)), True)
        act.set_editor_property("is_spatially_loaded", False)
        counts[m] = comp.get_instance_count()
print("props ok", counts)

# ---- water for the fountain jets: translucent, slightly emissive (placeholder until a Niagara fountain)
MEL = unreal.MaterialEditingLibrary
wp = "/Game/Kompleks/Mat/M_Water"
if EAL.does_asset_exist(wp) and globals().get("WATER_REBUILD", False): EAL.delete_asset(wp)
if not EAL.does_asset_exist(wp):
    w = AT.create_asset("M_Water", "/Game/Kompleks/Mat", unreal.Material, unreal.MaterialFactoryNew())
    w.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    w.set_editor_property("translucency_lighting_mode", unreal.TranslucencyLightingMode.TLM_SURFACE)
    for prop, val in ((unreal.MaterialProperty.MP_OPACITY, 0.16), (unreal.MaterialProperty.MP_ROUGHNESS, 0.05), (unreal.MaterialProperty.MP_SPECULAR, 1.0)):
        c = MEL.create_material_expression(w, unreal.MaterialExpressionConstant, -300, 0); c.set_editor_property("r", val)
        MEL.connect_material_property(c, "", prop)
    col = MEL.create_material_expression(w, unreal.MaterialExpressionConstant3Vector, -300, -200)
    col.set_editor_property("constant", unreal.LinearColor(0.45, 0.6, 0.7, 1)); MEL.connect_material_property(col, "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.recompile_material(w); EAL.save_loaded_asset(w, False)
if "prop_jets" in mesh and "prop_jets" not in MAP:
    jm = mesh["prop_jets"]
    s = sms.get_nanite_settings(jm)
    if s.enabled: s.enabled = False; sms.set_nanite_settings(jm, s, apply_changes=True)     # translucent: no Nanite
    for i in range(len(jm.static_materials)): jm.set_material(i, unreal.load_asset(wp))
    EAL.save_loaded_asset(jm, False)

# ---- real light for the street lamps and bollards; tag "Chiroq" = the time bar switches them on at night
for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith("Kompleks_L_"): eas.destroy_actor(a)
nl = 0
for r in P:
    x, y, z, yaw, sc, m = r[:6]
    if m not in ("prop_lamp", "prop_bollard"): continue
    lamp = m == "prop_lamp"
    pl = eas.spawn_actor_from_class(unreal.PointLight, unreal.Vector(x, y, z + (410.0 if lamp else 62.0)))
    pl.set_actor_label("Kompleks_L_%d" % nl); pl.set_folder_path("Kompleks/Chiroqlar")
    lc = pl.get_component_by_class(unreal.PointLightComponent)
    lc.set_editor_property("intensity_units", unreal.LightUnits.LUMENS)
    lc.set_editor_property("intensity", 4500.0 if lamp else 400.0)  # 2026-11-22 physical units: sun 120000 lux, local lights and emissives x100 (were scene scale, sun 6 lux)
    lc.set_editor_property("use_temperature", True); lc.set_editor_property("temperature", 4000.0)   # 2026-11-22: neutral LED street light (3200 K made the night orange)
    lc.set_editor_property("attenuation_radius", 1500.0 if lamp else 350.0)
    lc.set_editor_property("source_radius", 10.0)
    lc.set_editor_property("cast_shadows", False)
    lc.set_editor_property("max_draw_distance", 6000.0); lc.set_editor_property("max_distance_fade_range", 1000.0)
    pl.set_editor_property("tags", [unreal.Name("Kompleks"), unreal.Name("Chiroq")])
    pl.set_editor_property("is_spatially_loaded", False)
    nl += 1
print("lamp lights", nl)
