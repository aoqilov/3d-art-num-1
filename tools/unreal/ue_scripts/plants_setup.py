# Courtyard plants: Poly Haven CC0 models (tools/unreal/kit_glb, kit_clean.py) into /Game/Kompleks/Plants/<id>, Nanite on
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
P = json.load(open(ROOT + "/out/plants.json"))
MODELS = {"tree": ["jacaranda_tree"], "shrub": ["yard_hedge", "yard_buta_0", "yard_buta_1", "yard_buta_2"],
          "flower": ["yard_gul_%d" % i for i in range(8)]}       # yard_*: tools/unreal/yard_split.py (web courtyard plants)

# placeholder -> real asset (owner: Fab models later). out/model_map.json: {"jacaranda_tree": "/Game/Fab/.../SM_Tree", ...}
import os
MAP = json.load(open(ROOT + "/out/model_map.json")) if os.path.exists(ROOT + "/out/model_map.json") else {}
mesh = {}
for ids in MODELS.values():
    for m in ids:
        if m in MAP:
            mesh[m] = unreal.load_asset(MAP[m]); continue
        dst = "/Game/Kompleks/Plants/" + m
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
    if a.get_actor_label().startswith("Kompleks_Plants_"): eas.destroy_actor(a)
counts = {}
for kind, rows in P.items():
    by = {}
    for r in rows:
        m = r[5] if len(r) > 5 else MODELS[kind][0]       # rows: x, y, z, yaw, scale[, model, z-scale (0 = uniform)]
        by.setdefault(m, []).append(r)
    for m, rs in by.items():
        act = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0))   # (a bare Actor has no root to attach to)
        act.set_actor_label("Kompleks_Plants_" + m); act.set_folder_path("Kompleks/Plants")
        act.tags = [unreal.Name("Kompleks"), unreal.Name("Plants")]
        root = SDS.k2_gather_subobject_data_for_instance(act)[0]
        h, fail = SDS.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=root, new_class=unreal.HierarchicalInstancedStaticMeshComponent))
        comp = BFL.get_object(BFL.get_data(h))
        comp.set_editor_property("static_mesh", mesh[m])
        comp.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
        comp.set_editor_property("cast_shadow", True)
        for r in rs:
            x, y, z, yaw, sc = r[:5]
            sz = r[6] if len(r) > 6 and r[6] else sc
            comp.add_instance(unreal.Transform(location=unreal.Vector(x, y, z), rotation=unreal.Rotator(roll=0.0, pitch=0.0, yaw=yaw),
                                               scale=unreal.Vector(sc, sc, sz)), True)
        act.set_editor_property("is_spatially_loaded", False)
        counts[m] = comp.get_instance_count()
print("plants ok", counts)
