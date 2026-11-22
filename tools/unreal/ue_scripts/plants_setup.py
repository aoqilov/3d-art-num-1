# Courtyard plants: Poly Haven CC0 models (tools/unreal/kit_glb, kit_clean.py) into /Game/Kompleks/Plants/<id>, Nanite on
# (masked foliage is supported), placed from tools/unreal/out/plants.json (plants_layout.py), one actor per mesh with an
# instanced component ("Kompleks_Plants_<id>[_<n>]", tag Kompleks). No collision. Safe to re-run;
# PLANTS_REIMPORT = True re-imports the meshes (their folder is deleted first: a glTF reimport over existing assets
# opens a modal dialog).
#
# out/model_map.json swaps a placeholder for real (Fab) assets without re-layout:
#   {"jacaranda_tree": "/Game/Fab/.../SM_Tree"}                         one mesh
#   {"yard_hedge": {"meshes": ["/Game/...VarC", "/Game/...VarD"], "fit": 1.3}}  variants mixed per instance, scale x fit
#   optional "fit_xy" / "fit_z" (default: fit) scale width and height apart, e.g. a lower tree with a wider crown
#   {"yard_gul_0": null}                                                 placeholder removed (no actor)
# StaticMesh -> HierarchicalInstancedStaticMeshComponent; SkeletalMesh (Fab Megaplants, Nanite skinned foliage)
# -> InstancedSkinnedMeshComponent.
import unreal, json, os, zlib
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
AT = unreal.AssetToolsHelpers.get_asset_tools(); EAL = unreal.EditorAssetLibrary
sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
SDS = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem); BFL = unreal.SubobjectDataBlueprintFunctionLibrary
P = json.load(open(ROOT + "/out/plants.json"))
MODELS = {"tree": ["jacaranda_tree"], "shrub": ["yard_hedge", "yard_buta_0", "yard_buta_1", "yard_buta_2"],
          "flower": ["yard_gul_%d" % i for i in range(8)]}       # yard_*: tools/unreal/yard_split.py (web courtyard plants)
MAP = json.load(open(ROOT + "/out/model_map.json")) if os.path.exists(ROOT + "/out/model_map.json") else {}


def placeholder(m):
    dst = "/Game/Kompleks/Plants/" + m
    if globals().get("PLANTS_REIMPORT", False) and EAL.does_directory_exist(dst): EAL.delete_directory(dst)
    if EAL.does_directory_exist(dst):
        for p in EAL.list_assets(dst, recursive=True):
            a = EAL.load_asset(p)
            if isinstance(a, unreal.StaticMesh): return a
    t = unreal.AssetImportTask(); t.filename = ROOT + "/kit_glb/" + m + ".glb"; t.destination_path = dst
    t.automated = True; t.replace_existing = True; t.save = True
    AT.import_asset_tasks([t])
    sm = next(o for o in (unreal.load_asset(p) for p in t.imported_object_paths) if isinstance(o, unreal.StaticMesh))
    s = sms.get_nanite_settings(sm); s.enabled = True
    s.set_editor_property("shape_preservation", unreal.NaniteShapePreservation.PRESERVE_AREA)
    sms.set_nanite_settings(sm, s, apply_changes=True)
    EAL.save_loaded_asset(sm, False)
    return sm


# model id -> ([meshes], (fit_xy, fit_z)); an empty list drops the model
mesh = {}
for ids in MODELS.values():
    for m in ids:
        if m not in MAP: mesh[m] = ([placeholder(m)], (1.0, 1.0)); continue
        v = MAP[m]
        if v is None: mesh[m] = ([], (1.0, 1.0)); continue
        if isinstance(v, str): v = {"meshes": [v]}
        ms = [unreal.load_asset(p) for p in v["meshes"]]
        bad = [p for p, a in zip(v["meshes"], ms) if a is None]
        if bad: raise RuntimeError("model_map: missing assets %s" % bad)
        for sm in ms:      # Fab static foliage (Megascans boxwood, hydrangea) ships with classic LODs: they popped while walking -> Nanite
            if isinstance(sm, unreal.StaticMesh):
                s = sms.get_nanite_settings(sm)
                if not s.enabled:
                    s.enabled = True; s.set_editor_property("shape_preservation", unreal.NaniteShapePreservation.PRESERVE_AREA)
                    sms.set_nanite_settings(sm, s, apply_changes=True); EAL.save_loaded_asset(sm, False)
        f = float(v.get("fit", 1.0))
        mesh[m] = (ms, (float(v.get("fit_xy", f)), float(v.get("fit_z", f))))

for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith("Kompleks_Plants_"): eas.destroy_actor(a)


def spawn(label, sm):
    act = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0))   # (a bare Actor has no root to attach to)
    act.set_actor_label(label); act.set_folder_path("Kompleks/Plants")
    act.tags = [unreal.Name("Kompleks"), unreal.Name("Plants")]
    root = SDS.k2_gather_subobject_data_for_instance(act)[0]
    skinned = isinstance(sm, unreal.SkeletalMesh)
    cls = unreal.InstancedSkinnedMeshComponent if skinned else unreal.HierarchicalInstancedStaticMeshComponent
    h, fail = SDS.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=root, new_class=cls))
    comp = BFL.get_object(BFL.get_data(h))
    if skinned: comp.set_skinned_asset_and_update(sm)
    else: comp.set_editor_property("static_mesh", sm)
    comp.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    comp.set_editor_property("cast_shadow", True)
    if "yard_hedge" in label: comp.set_evaluate_world_position_offset(False)   # clipped hedge: Megascans wind made its top edge shimmer
    act.set_editor_property("is_spatially_loaded", False)
    return comp, skinned


counts = {}
for kind, rows in P.items():
    by = {}
    for r in rows:
        m = r[5] if len(r) > 5 else MODELS[kind][0]       # rows: x, y, z, yaw, scale[, model, z-scale (0 = uniform)]
        by.setdefault(m, []).append(r)
    for m, rs in by.items():
        ms, fit = mesh[m]
        if not ms: continue
        groups = [[] for _ in ms]
        for r in rs:                                       # stable variant pick from the position (same result on re-run)
            groups[zlib.crc32(("%.1f,%.1f" % (r[0], r[1])).encode()) % len(ms)].append(r)
        for i, (sm, g) in enumerate(zip(ms, groups)):
            if not g: continue
            label = "Kompleks_Plants_" + m + ("_%d" % i if len(ms) > 1 else "")
            comp, skinned = spawn(label, sm)
            for r in g:
                x, y, z, yaw, sc = r[:5]
                sz = r[6] if len(r) > 6 and r[6] else sc
                t = unreal.Transform(location=unreal.Vector(x, y, z), rotation=unreal.Rotator(roll=0.0, pitch=0.0, yaw=yaw),
                                     scale=unreal.Vector(sc * fit[0], sc * fit[0], sz * fit[1]))
                if skinned: comp.add_instance(t, 0)
                else: comp.add_instance(t, True)
            counts[label] = comp.get_instance_count()
print("plants ok", counts)
