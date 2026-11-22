# Ground of the city terrain (maps-urban/REJA.md stage 1, 2026-11-22). The complex lawn texture (Megascans Lawn_Grass) has
# bright dry patches that read as snow over the big terrain, whatever the tint / tiling. M_UR_GroundFlat: a dusty
# green-brown base mixed with only MIX of the lawn albedo (8 m tiles) + the lawn normal (3 m) for detail up close.
# UVs = world position in metres. Applied to the terrain and the green areas of the roads mesh.
import unreal
AT = unreal.AssetToolsHelpers.get_asset_tools(); EAL = unreal.EditorAssetLibrary; MEL = unreal.MaterialEditingLibrary
D = "/Game/Kompleks/Urban/Mat"; p = D + "/M_UR_GroundWP"   # (M_UR_GroundFlat: its delete failed half-way 2026-11-22, left alone)
BASE = globals().get("BASE", (0.15, 0.16, 0.095)); MIX = globals().get("MIX", 0.35)
# never delete a material that meshes use (that opened a modal "overwrite" dialog and froze the editor): clear and rebuild
if EAL.does_asset_exist(p):
    m = unreal.load_asset(p); MEL.delete_all_material_expressions(m)
else:
    m = AT.create_asset("M_UR_GroundWP", D, unreal.Material, unreal.MaterialFactoryNew())
E = lambda cls, x, y: MEL.create_material_expression(m, cls, x, y)
def K(v, x, y):
    c = E(unreal.MaterialExpressionConstant, x, y); c.set_editor_property("r", v); return c
def op(cls, a, b, x, y, pa="A", pb="B"):
    o = E(cls, x, y); MEL.connect_material_expressions(a, "", o, pa); MEL.connect_material_expressions(b, "", o, pb); return o
# UVs from the world position (metres, XY): the mesh UVs are metres up to +-1500 and Nanite / half floats streaked them
wpos = E(unreal.MaterialExpressionWorldPosition, -1500, 0)
wxy = E(unreal.MaterialExpressionComponentMask, -1350, 0)
for k_ in "rgba": wxy.set_editor_property(k_, k_ in "rg")
MEL.connect_material_expressions(wpos, "", wxy, "")
uv = op(unreal.MaterialExpressionDivide, wxy, K(100.0, -1350, 100), -1200, 0)
alb = E(unreal.MaterialExpressionTextureSample, -800, -100); alb.set_editor_property("texture", unreal.load_asset("/Game/Fab/Megascans/Surfaces/Lawn_Grass_tkynejer/High/tkynejer_tier_1/Textures/T_tkynejer_4K_B"))
MEL.connect_material_expressions(op(unreal.MaterialExpressionDivide, uv, K(8.0, -1200, 120), -1000, 0), "", alb, "UVs")
nrm = E(unreal.MaterialExpressionTextureSample, -800, 250); nt = unreal.load_asset("/Game/Fab/Megascans/Surfaces/Lawn_Grass_tkynejer/High/tkynejer_tier_1/Textures/T_tkynejer_4K_N")
nrm.set_editor_property("texture", nt); nrm.set_editor_property("sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
MEL.connect_material_expressions(op(unreal.MaterialExpressionDivide, uv, K(3.0, -1200, 320), -1000, 250), "", nrm, "UVs")
base = E(unreal.MaterialExpressionConstant3Vector, -800, -300); base.set_editor_property("constant", unreal.LinearColor(*BASE, 1))
tinted = op(unreal.MaterialExpressionMultiply, alb, base, -550, -150)
tinted = op(unreal.MaterialExpressionMultiply, tinted, K(3.0, -700, -50), -450, -150)
l = E(unreal.MaterialExpressionLinearInterpolate, -300, -200)
MEL.connect_material_expressions(base, "", l, "A"); MEL.connect_material_expressions(tinted, "", l, "B"); MEL.connect_material_expressions(K(MIX, -450, -50), "", l, "Alpha")
# B8 (2026-11-22): beyond ~400 m the ground takes the colour of the satellite image (maps-urban jpg, Sentinel-2 / EOX,
# CC BY 4.0) - parks green, dry plots brown. UV from world position (out/sat_uv.json, urban_ground_mat via SAT).
import json as _json
SAT = _json.load(open(r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/out/sat_uv.json"))
sp = "/Game/Kompleks/Urban/Tex/T_Satellite"
if not EAL.does_asset_exist(sp):
    t_ = unreal.AssetImportTask(); t_.filename = r"C:/Users/user/Desktop/3esd/3d-art-num-1/maps-urban/urban-export_41.3153_69.1912_2600x1890m.jpg"
    t_.destination_path = "/Game/Kompleks/Urban/Tex"; t_.destination_name = "T_Satellite"; t_.automated = True; t_.replace_existing = True; t_.save = True
    AT.import_asset_tasks([t_])
sat_tex = unreal.load_asset(sp); sat_tex.set_editor_property("address_x", unreal.TextureAddress.TA_CLAMP); sat_tex.set_editor_property("address_y", unreal.TextureAddress.TA_CLAMP)
def V3_(rgb, x, y):
    c = E(unreal.MaterialExpressionConstant3Vector, x, y); c.set_editor_property("constant", unreal.LinearColor(*rgb, 1)); return c
w3 = E(unreal.MaterialExpressionWorldPosition, -1500, 600)
su = op(unreal.MaterialExpressionAdd, op(unreal.MaterialExpressionDotProduct, w3, V3_((SAT["u"][0], SAT["u"][1], 0.0), -1350, 650), -1250, 600), K(SAT["u"][2], -1250, 680), -1150, 600)
sv = op(unreal.MaterialExpressionAdd, op(unreal.MaterialExpressionDotProduct, w3, V3_((SAT["v"][0], SAT["v"][1], 0.0), -1350, 750), -1250, 720), K(SAT["v"][2], -1250, 800), -1150, 720)
suv = op(unreal.MaterialExpressionAppendVector, su, sv, -1050, 650)
sat = E(unreal.MaterialExpressionTextureSample, -900, 650); sat.set_editor_property("texture", sat_tex)
MEL.connect_material_expressions(suv, "", sat, "UVs")
satc = op(unreal.MaterialExpressionMultiply, sat, K(globals().get("SAT_GAIN", 0.75), -900, 800), -750, 700)
# far = saturate((distance to the complex centre - 400 m) / 400 m) * SAT_MIX
cen = V3_((2430.0, -830.0, 0.0), -1350, 900)
dxy = E(unreal.MaterialExpressionComponentMask, -1150, 900)
for k_ in "rgba": dxy.set_editor_property(k_, k_ in "rg")
MEL.connect_material_expressions(op(unreal.MaterialExpressionSubtract, w3, cen, -1250, 900), "", dxy, "")
dist = E(unreal.MaterialExpressionLength, -1050, 900); MEL.connect_material_expressions(dxy, "", dist, "")
far = E(unreal.MaterialExpressionSaturate, -800, 900)
MEL.connect_material_expressions(op(unreal.MaterialExpressionDivide, op(unreal.MaterialExpressionSubtract, dist, K(40000.0, -1000, 980), -900, 900), K(40000.0, -900, 980), -850, 900), "", far, "")
farm = op(unreal.MaterialExpressionMultiply, far, K(globals().get("SAT_MIX", 0.75), -750, 980), -700, 900)
l2 = E(unreal.MaterialExpressionLinearInterpolate, -150, -100)
MEL.connect_material_expressions(l, "", l2, "A"); MEL.connect_material_expressions(satc, "", l2, "B"); MEL.connect_material_expressions(farm, "", l2, "Alpha")
MEL.connect_material_property(l2, "", unreal.MaterialProperty.MP_BASE_COLOR)
MEL.connect_material_property(nrm, "RGB", unreal.MaterialProperty.MP_NORMAL)
MEL.connect_material_property(K(0.95, -300, 100), "", unreal.MaterialProperty.MP_ROUGHNESS)
MEL.recompile_material(m); EAL.save_loaded_asset(m, False)
for lab, slot in (("Kompleks_Urban_Urban_Terrain", None), ("Kompleks_Urban_Urban_Roads", "M_UR_Grass")):
    for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors():
        if a.get_actor_label() == lab:
            sm = a.static_mesh_component.static_mesh
            for i, s in enumerate(sm.static_materials):
                if slot is None or str(s.material_slot_name).startswith(slot): sm.set_material(i, m)
            EAL.save_loaded_asset(sm, False)
print("ground flat", BASE, MIX)
