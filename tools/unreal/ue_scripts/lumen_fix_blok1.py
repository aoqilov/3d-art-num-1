# Storey meshes are ~30 x 20 m single meshes: Lumen gave them too few surface-cache cards and a coarse distance field,
# so thin wall parts next to windows went black ("burnt" patches). More cards + finer, two-sided distance fields.
import unreal
sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
reg = unreal.AssetRegistryHelpers.get_asset_registry()
n = 0
for a in reg.get_assets_by_path("/Game/Blok1/Full", recursive=True):
    if str(a.asset_class_path.asset_name) != "StaticMesh": continue
    name = str(a.asset_name)
    if not any(name.endswith(s) for s in ("_Shell", "_WallCut", "_Floors", "_FloorsD", "_FloorsH")): continue
    m = a.get_asset()
    b = sms.get_lod_build_settings(m, 0)
    b.set_editor_property("max_lumen_mesh_cards", 12)        # engine default (32 + two-sided DF left walls without surface cache)
    b.set_editor_property("distance_field_resolution_scale", 1.0)
    b.set_editor_property("generate_distance_field_as_if_two_sided", False)
    sms.set_lod_build_settings(m, 0, b)
    n += 1
print("lumen fix meshes:", n)
