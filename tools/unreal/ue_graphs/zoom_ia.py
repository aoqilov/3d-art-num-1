AT = unreal.AssetToolsHelpers.get_asset_tools()
D = "/Game/Blok1/Input"
p = D + "/IA_Zoom"
a = unreal.load_asset(p) if unreal.EditorAssetLibrary.does_asset_exist(p) else AT.create_asset("IA_Zoom", D, unreal.InputAction, unreal.InputAction_Factory())
a.set_editor_property("value_type", unreal.InputActionValueType.AXIS1D)
imc = unreal.load_asset(D + "/IMC_Blok1")
k = unreal.Key(); k.import_text("MouseWheelAxis")
maps = imc.get_editor_property("default_key_mappings").get_editor_property("mappings")
if not any(m.get_editor_property("action") == a for m in maps):
    imc.map_key(a, k)
unreal.EditorAssetLibrary.save_asset(p); unreal.EditorAssetLibrary.save_asset(D + "/IMC_Blok1")
print("ok", [(str(m.get_editor_property("action").get_name()), str(m.get_editor_property("key").get_editor_property("key_name"))) for m in imc.get_editor_property("default_key_mappings").get_editor_property("mappings")])
