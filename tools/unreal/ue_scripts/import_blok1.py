# Imports Obod Maskan block 1 (type 4), full 16 storeys, high-detail GLB from Blender, and places it in the level.
# Storey meshes are storey-local: F1 (storey 1), F2 (storey 2), Typ (storeys 3-16, one mesh placed 14 times);
# Fac_* / Site_* / Signs are absolute. Storeys 2-7 keep the mint facade, 8-16 get the white one (material override).
import unreal

SRC = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/out/blok1_full.glb"
DST = "/Game/Blok1/Full"
SPOT = unreal.Vector(1500.0, -1500.0, 2.0)
FLOOR_H = 300.0

if globals().get("REIMPORT", True):
    task = unreal.AssetImportTask()
    task.filename = SRC
    task.destination_path = DST
    task.automated = True
    task.replace_existing = True
    task.save = False
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    print("imported objects:", len(task.imported_object_paths))

reg = unreal.AssetRegistryHelpers.get_asset_registry()
assets = reg.get_assets_by_path(DST, recursive=True)
meshes = {a.get_asset().get_name(): a.get_asset() for a in assets if a.asset_class_path.asset_name == "StaticMesh"}
mats = {a.get_asset().get_name(): a.get_asset() for a in assets if "Material" in str(a.asset_class_path.asset_name)}
print("meshes:", sorted(meshes))

sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
# Nanite simplifies thin repeated bars (balusters, glazing bars, lattice) far away -> they crawl while the camera moves.
# Those meshes stay classic full-detail meshes; walls, slabs, bricks keep Nanite.
# Thin repeated bars (balusters, glazing bars, lattice, lettering) keep Nanite with "Preserve Area": Nanite then keeps
# their coverage far away instead of dropping bars (they crawled), and VSM shadows stay fast (non-Nanite meshes over
# the whole facade overflowed the VSM marking queue). Glass is translucent and the small moving kit stays classic.
NO_NANITE = ("Glass", "Kit_")
THIN = ("_Frames", "_Lattice", "_Signs", "_DoorsIn")
for n, m in meshes.items():
    s = sms.get_nanite_settings(m)
    want = not any(k in n for k in NO_NANITE)
    pa = any(k in n for k in THIN)
    sp = unreal.NaniteShapePreservation.PRESERVE_AREA if pa else unreal.NaniteShapePreservation.NONE
    # window frames + radiators: full-detail ray-tracing fallback (AUTO collapsed the bars into big spikes that
    # shadowed the walls next to every window)
    fb = unreal.NaniteFallbackTarget.PERCENT_TRIANGLES if n.endswith(("_Frames", "_DoorsIn")) else unreal.NaniteFallbackTarget.AUTO
    if s.enabled != want or s.get_editor_property("shape_preservation") != sp or s.fallback_target != fb:
        s.enabled = want
        s.set_editor_property("shape_preservation", sp)
        s.fallback_target = fb; s.fallback_percent_triangles = 1.0
        sms.set_nanite_settings(m, s, apply_changes=True)

white = next((m for k, m in mats.items() if k.endswith("M_FacadeWhite")), None)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
with unreal.ScopedEditorTransaction("Blok-1 to'liq joylash"):
    for a in eas.get_all_level_actors():
        if a.get_actor_label().startswith("Blok1_"):
            eas.destroy_actor(a)
    count = 0
    def put(mesh, storey, label):
        global count
        z = SPOT.z + (storey - 1) * FLOOR_H
        a = eas.spawn_actor_from_object(mesh, unreal.Vector(SPOT.x, SPOT.y, z), unreal.Rotator(0, 0, 0))
        a.set_actor_label(label)
        a.set_folder_path("Blok1/" + ("Fasad" if storey == 1 and not label.startswith("Blok1_Q") else "Qavatlar"))
        count += 1
        return a
    for n, m in sorted(meshes.items()):
        part = n.replace("Blok1_", "")
        if part.startswith("F1_"):
            put(m, 1, "Blok1_Q01_" + part[3:])
        elif part.startswith("F2_"):
            put(m, 2, "Blok1_Q02_" + part[3:])
        elif part.startswith("Typ_"):
            for s in range(3, 17):
                a = put(m, s, "Blok1_Q%02d_%s" % (s, part[4:]))
                if s >= 8 and white and part.endswith("Shell"):
                    a.static_mesh_component.set_material_by_name("M_FacadeMint", white)
        elif part.startswith("Kit_"):
            continue                     # doors / lift cabins: spawned by walk_setup_blok1.py as blueprint actors
        else:
            put(m, 1, "Blok1_" + part)
    print("actors:", count)

# realistic materials (Megascans plaster, black frames, glass) go back on every time the model is reimported
import os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "materials_blok1.py"), encoding="utf-8").read())
# tags, cameras and the UI controller for the on-screen buttons
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui_setup_blok1.py"), encoding="utf-8").read())
# walkable: collision, entrance doors, lifts, player
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "collision_blok1.py"), encoding="utf-8").read())
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "walk_setup_blok1.py"), encoding="utf-8").read())
# real furniture and decor (Poly Haven)
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "kit_setup_blok1.py"), encoding="utf-8").read())
# 2026-11-19 reset: the lighting experiments (lumen_fix, ppv_corridor/flats, rt_fallback) are no longer run;
# their scripts stay in this folder for reference. Lighting is rebuilt step by step from engine defaults.
# handover state (owner 2026-11-19): no room doors inside the flats. The *_DoorsIn actors (oak casings, leaves, levers)
# stay in the level, tagged "DoorsIn", hidden in game and editor and without collision; a finish level can show them again.
n_din = 0
for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors():
    if a.get_actor_label().endswith("_DoorsIn"):
        a.set_actor_hidden_in_game(True)
        a.set_is_temporarily_hidden_in_editor(True)
        try: a.set_editor_property("hidden_ed", True)          # persistent editor hide (bHiddenEd), where exposed
        except Exception: pass
        a.set_actor_enable_collision(False)
        a.static_mesh_component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
        tags = list(a.tags)
        if unreal.Name("DoorsIn") not in tags: a.tags = tags + [unreal.Name("DoorsIn")]
        n_din += 1
print("room doors hidden:", n_din)
