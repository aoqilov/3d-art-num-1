# Stage 6 of maps-urban/REJA.md: shop fronts along the main road (tools/unreal/urban_main.py -> URBAN_SET=urban_main_mesh
# build_urban.py -> out/urban_main_mesh.glb) -> /Game/Kompleks/Urban/main, actor "Kompleks_Urban_Main" (folder Kompleks/Shahar).
#   M_UR_Shop    dark glass; warm interior glow at night (MPC_Blok1.LightOn) + a faint one by day
#   M_UR_Sign    shop sign: colour from UV sets 1-2 (urban_main.py), glows at night, a little by day
#   M_UR_Canopy  dark metal
# Safe to re-run.
import unreal
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
AT = unreal.AssetToolsHelpers.get_asset_tools(); EAL = unreal.EditorAssetLibrary; MEL = unreal.MaterialEditingLibrary
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem); sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
MD = "/Game/Kompleks/Urban/Mat"; MPC = unreal.load_asset("/Game/Blok1/Mat/MPC_Blok1")
def fresh(n):
    p = MD + "/" + n
    if EAL.does_asset_exist(p): EAL.delete_asset(p)
    return AT.create_asset(n, MD, unreal.Material, unreal.MaterialFactoryNew())
def E(m, cls, x, y): return MEL.create_material_expression(m, cls, x, y)
def K(m, v, x, y):
    c = E(m, unreal.MaterialExpressionConstant, x, y); c.set_editor_property("r", v); return c
def V3(m, rgb, x, y):
    c = E(m, unreal.MaterialExpressionConstant3Vector, x, y); c.set_editor_property("constant", unreal.LinearColor(*rgb, 1)); return c
def op(m, cls, a, b, x, y):
    o = E(m, cls, x, y); MEL.connect_material_expressions(a, "", o, "A"); MEL.connect_material_expressions(b, "", o, "B"); return o
def glow(m, x, y, day=0.08):
    """LightOn + a small daytime share"""
    on = E(m, unreal.MaterialExpressionCollectionParameter, x, y); on.set_editor_property("collection", MPC); on.set_editor_property("parameter_name", "LightOn")
    return op(m, unreal.MaterialExpressionAdd, on, K(m, day, x, y + 80), x + 150, y)
def mask(m, a, ch, x, y):
    o = E(m, unreal.MaterialExpressionComponentMask, x, y)
    for k in "rgba": o.set_editor_property(k, k == ch)
    MEL.connect_material_expressions(a, "", o, ""); return o

shop = fresh("M_UR_Shop")
MEL.connect_material_property(V3(shop, (0.03, 0.04, 0.05), -400, 0), "", unreal.MaterialProperty.MP_BASE_COLOR)
MEL.connect_material_property(K(shop, 0.06, -400, 100), "", unreal.MaterialProperty.MP_ROUGHNESS)
MEL.connect_material_property(K(shop, 0.4, -400, 180), "", unreal.MaterialProperty.MP_METALLIC)
MEL.connect_material_property(op(shop, unreal.MaterialExpressionMultiply, V3(shop, (40.0, 30.0, 18.0), -400, 300), glow(shop, -600, 400, 0.02), -200, 300), "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
MEL.recompile_material(shop)

sign = fresh("M_UR_Sign")
t1 = E(sign, unreal.MaterialExpressionTextureCoordinate, -900, 0); t1.set_editor_property("coordinate_index", 1)
t2 = E(sign, unreal.MaterialExpressionTextureCoordinate, -900, 150); t2.set_editor_property("coordinate_index", 2)
g = E(sign, unreal.MaterialExpressionOneMinus, -650, 40); MEL.connect_material_expressions(mask(sign, t1, "g", -750, 40), "", g, "")
col = op(sign, unreal.MaterialExpressionAppendVector, op(sign, unreal.MaterialExpressionAppendVector, mask(sign, t1, "r", -750, -40), g, -550, 0), mask(sign, t2, "r", -750, 150), -400, 50)
MEL.connect_material_property(col, "", unreal.MaterialProperty.MP_BASE_COLOR)
MEL.connect_material_property(op(sign, unreal.MaterialExpressionMultiply, op(sign, unreal.MaterialExpressionMultiply, col, K(sign, 120.0, -400, 200), -250, 120), glow(sign, -500, 300, 0.1), -100, 150), "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
MEL.recompile_material(sign)

can = fresh("M_UR_Canopy")
MEL.connect_material_property(V3(can, (0.04, 0.04, 0.045), -400, 0), "", unreal.MaterialProperty.MP_BASE_COLOR)
MEL.connect_material_property(K(can, 0.4, -400, 100), "", unreal.MaterialProperty.MP_ROUGHNESS)
MEL.connect_material_property(K(can, 0.6, -400, 180), "", unreal.MaterialProperty.MP_METALLIC)
MEL.recompile_material(can)
mats = {"M_UR_Shop": shop, "M_UR_Sign": sign, "M_UR_Canopy": can}
for m in mats.values(): EAL.save_loaded_asset(m, False)

D = "/Game/Kompleks/Urban/main"
if EAL.does_directory_exist(D): EAL.delete_directory(D)
t = unreal.AssetImportTask(); t.filename = ROOT + "/out/urban_main_mesh.glb"; t.destination_path = D
t.automated = True; t.replace_existing = True; t.save = True
AT.import_asset_tasks([t])
sm = next(o for o in (unreal.load_asset(p) for p in t.imported_object_paths) if isinstance(o, unreal.StaticMesh))
for i, s in enumerate(sm.static_materials):
    k = next((k for k in mats if str(s.material_slot_name).startswith(k)), None)
    if k: sm.set_material(i, mats[k])
bs = sms.get_lod_build_settings(sm, 0); bs.set_editor_property("use_full_precision_u_vs", True); sms.set_lod_build_settings(sm, 0, bs)
EAL.save_loaded_asset(sm, False)
for a in eas.get_all_level_actors():
    if a.get_actor_label() == "Kompleks_Urban_Main": eas.destroy_actor(a)
a = eas.spawn_actor_from_object(sm, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
a.set_actor_label("Kompleks_Urban_Main"); a.set_folder_path("Kompleks/Shahar")
a.tags = [unreal.Name("Kompleks"), unreal.Name("Shahar")]; a.set_editor_property("is_spatially_loaded", False)
a.static_mesh_component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
print("main street ok", [str(s.material_slot_name) for s in sm.static_materials])
