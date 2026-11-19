# M_Setka: translucent, two-sided green safety netting for Kran_Net (the glTF import made it opaque).
# Base colour = T_Net rgb, opacity = T_Net alpha (mesh threads ~0.9, holes ~0.4). Assigned to the mesh's netting slot.
import unreal
MEL = unreal.MaterialEditingLibrary
AT = unreal.AssetToolsHelpers.get_asset_tools()
D = "/Game/Blok1/Qurilish"
p = D + "/M_Setka"
if unreal.EditorAssetLibrary.does_asset_exist(p): unreal.EditorAssetLibrary.delete_asset(p)
m = AT.create_asset("M_Setka", D, unreal.Material, unreal.MaterialFactoryNew())
m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
m.set_editor_property("two_sided", True)
m.set_editor_property("translucency_lighting_mode", unreal.TranslucencyLightingMode.TLM_SURFACE)
tex = unreal.load_asset(D + "/crane/Textures/T_Net")
t = MEL.create_material_expression(m, unreal.MaterialExpressionTextureSample, -400, 0)
t.set_editor_property("texture", tex)
MEL.connect_material_property(t, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
MEL.connect_material_property(t, "A", unreal.MaterialProperty.MP_OPACITY)
r = MEL.create_material_expression(m, unreal.MaterialExpressionConstant, -400, 300); r.set_editor_property("r", 0.9)
MEL.connect_material_property(r, "", unreal.MaterialProperty.MP_ROUGHNESS)
MEL.recompile_material(m)
unreal.EditorAssetLibrary.save_loaded_asset(m, False)
net = unreal.load_asset(D + "/crane/StaticMeshes/Kran_Net")
mats = net.static_materials
for i, s in enumerate(mats):
    if "SafetyNet" in str(s.material_slot_name): net.set_material(i, m)
unreal.EditorAssetLibrary.save_loaded_asset(net, False)
print("M_Setka ok", [(str(s.material_slot_name), s.material_interface.get_name()) for s in net.static_materials])
