# The other blocks of the complex (web layout) as the light finished block (tools/unreal/out/blok_lite.glb, build_lite.py):
# imported to /Game/Blok1/Lite, slots re-pointed to the block-1 materials, glass as an opaque reflective MI (the light
# model is hollow), Nanite. Placed at every web block except 1 (construction scene) and 2 (the walkable block):
# actors Kompleks_B<id>, tag Kompleks, no collision. Safe to re-run (REIMPORT=False skips the 100 MB import).
import unreal, os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "kompleks_coords.py"), encoding="utf-8").read())
AT = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary
D = "/Game/Blok1/Lite"
if globals().get("REIMPORT", True) or not EAL.does_asset_exist(D + "/blok_lite/StaticMeshes/Blok_Lite"):
    t = unreal.AssetImportTask()
    t.filename = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/out/blok_lite.glb"
    t.destination_path = D; t.automated = True; t.replace_existing = True; t.save = True
    AT.import_asset_tasks([t])
reg = unreal.AssetRegistryHelpers.get_asset_registry()
lite = next(a.get_asset() for a in reg.get_assets_by_path(D, recursive=True) if str(a.asset_class_path.asset_name) == "StaticMesh")
# slot name -> material used by the full block model (materials_blok1.py set them on the Full meshes)
lib = {}
for a in reg.get_assets_by_path("/Game/Blok1/Full/blok1_full/StaticMeshes", recursive=False):
    if str(a.asset_class_path.asset_name) != "StaticMesh": continue
    for sm_ in a.get_asset().static_materials:
        if sm_.material_interface and str(sm_.material_slot_name) not in lib: lib[str(sm_.material_slot_name)] = sm_.material_interface
# opaque reflective glass for the hollow light model
gp = D + "/M_GlassLite"
if not EAL.does_asset_exist(gp):
    MEL = unreal.MaterialEditingLibrary
    g = AT.create_asset("M_GlassLite", D, unreal.Material, unreal.MaterialFactoryNew())
    for prop, val, y in ((unreal.MaterialProperty.MP_METALLIC, 0.7, 0), (unreal.MaterialProperty.MP_ROUGHNESS, 0.06, 150)):
        c = MEL.create_material_expression(g, unreal.MaterialExpressionConstant, -300, y); c.set_editor_property("r", val)
        MEL.connect_material_property(c, "", prop)
    col = MEL.create_material_expression(g, unreal.MaterialExpressionConstant3Vector, -300, -150)
    col.set_editor_property("constant", unreal.LinearColor(0.035, 0.05, 0.065, 1))
    MEL.connect_material_property(col, "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.recompile_material(g); EAL.save_loaded_asset(g, False)
glass_lite = unreal.load_asset(gp)
n_set = 0
for i, sm_ in enumerate(lite.static_materials):
    name = str(sm_.material_slot_name)
    m = glass_lite if name == "M_Glass" else lib.get(name)
    if m: lite.set_material(i, m); n_set += 1
sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
s = sms.get_nanite_settings(lite); s.enabled = True; s.set_editor_property("shape_preservation", unreal.NaniteShapePreservation.PRESERVE_AREA)
sms.set_nanite_settings(lite, s, apply_changes=True)
EAL.save_loaded_asset(lite, False)
print("lite slots set", n_set, "of", len(lite.static_materials))

eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith("Kompleks_B"): eas.destroy_actor(a)
n = 0
for i in sorted(BLOCKS):
    if i in (1, 2): continue
    x, y, yaw, sx, sy = block_ue(i)
    a = eas.spawn_actor_from_object(lite, unreal.Vector(x, y, 2.0), unreal.Rotator(roll=0.0, pitch=0.0, yaw=yaw))
    a.set_actor_scale3d(unreal.Vector(sx, sy, 1.0))
    a.set_actor_label("Kompleks_B%02d" % i); a.set_folder_path("Kompleks")
    a.tags = [unreal.Name("Kompleks"), unreal.Name("KB%d" % i)]
    a.static_mesh_component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    a.set_actor_enable_collision(False)
    a.set_editor_property("is_spatially_loaded", False)     # always loaded, like block 1
    n += 1
print("complex blocks placed", n)
