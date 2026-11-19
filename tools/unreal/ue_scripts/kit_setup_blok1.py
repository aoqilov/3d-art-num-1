# Real furniture and decor (Poly Haven CC0, tools/unreal/kit_src) placed from tools/unreal/out/kit.json:
# F1 = shops (always shown), F2 = storey 2, Typ = storeys 3-16 (design mode, tag "Dizayn"). Safe to re-run.
import json, os, glob
import unreal

ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
O = unreal.Vector(1500.0, -1500.0, 2.0)
AT = unreal.AssetToolsHelpers.get_asset_tools()
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
reg = unreal.AssetRegistryHelpers.get_asset_registry()
K = json.load(open(ROOT + "/out/kit.json"))
models = sorted({p["m"] for v in K.values() for p in v})

mesh_of = {}
if globals().get("KIT_REIMPORT", False):
    for m in models: unreal.EditorAssetLibrary.delete_directory("/Game/Blok1/Kit/" + m)
for m in models:
    dst = "/Game/Blok1/Kit/" + m
    found = [a for a in reg.get_assets_by_path(dst, recursive=True) if str(a.asset_class_path.asset_name) == "StaticMesh"]
    if not found:
        g = ROOT + "/kit_glb/" + m + ".glb"                 # cleaned in Blender: one static mesh per model
        t = unreal.AssetImportTask(); t.filename = g; t.destination_path = dst; t.automated = True; t.replace_existing = True; t.save = False
        AT.import_asset_tasks([t])
        found = [a for a in reg.get_assets_by_path(dst, recursive=True) if str(a.asset_class_path.asset_name) == "StaticMesh"]
    meshes = [a.get_asset() for a in found]
    for sm in meshes:
        s = sms.get_nanite_settings(sm)
        if not s.enabled and "plant" not in m:          # foliage stays classic (masked leaves)
            s.enabled = True; sms.set_nanite_settings(sm, s, apply_changes=True)
    mesh_of[m] = meshes
print("kit meshes:", {m: len(v) for m, v in mesh_of.items()})

with unreal.ScopedEditorTransaction("Blok-1 mebel (Poly Haven)"):
    for a in eas.get_all_level_actors():
        if a.get_actor_label().startswith("Blok1_M_"):
            eas.destroy_actor(a)
    n = 0
    for key, storeys in (("F1", [1]), ("F2", [2]), ("Typ", list(range(3, 17)))):
        for st in storeys:
            for p in K.get(key, []):
                loc = unreal.Vector(O.x + p["x"] * 100.0, O.y + p["y"] * 100.0, O.z + (st - 1) * 300.0 + p["z"] * 100.0)
                for sm in mesh_of.get(p["m"], []):          # a model may import as several meshes (all share the origin)
                    a = eas.spawn_actor_from_object(sm, loc, unreal.Rotator(0, 0, p["yaw"]))
                    a.set_actor_scale3d(unreal.Vector(*p["s"]))
                    a.set_actor_label("Blok1_M_%02d_%d" % (st, n)); a.set_folder_path("Blok1/Mebel")
                    tags = [unreal.Name("Blok1"), unreal.Name("S%d" % st)] + ([] if key == "F1" else [unreal.Name("Dizayn")])
                    a.set_editor_property("tags", tags)
                    a.set_editor_property("is_spatially_loaded", False)
                    c = a.static_mesh_component
                    c.set_collision_profile_name("BlockAll")
                    n += 1
print("kit actors:", n)
