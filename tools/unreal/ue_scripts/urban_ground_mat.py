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
MEL.connect_material_property(l, "", unreal.MaterialProperty.MP_BASE_COLOR)
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
