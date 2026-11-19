# Hardware ray tracing (Lumen) traces Nanite "fallback" meshes. AUTO fallbacks simplified the thin walls, so rays
# leaked and walls/facades got black patches. Architecture is low-poly: keep the full mesh as the fallback (100 %).
import unreal
sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
reg = unreal.AssetRegistryHelpers.get_asset_registry()
n = 0
for path in ("/Game/Blok1/Full", "/Game/Blok1/Kit"):
    for a in reg.get_assets_by_path(path, recursive=True):
        if str(a.asset_class_path.asset_name) != "StaticMesh": continue
        m = a.get_asset(); s = sms.get_nanite_settings(m)
        if not s.enabled: continue
        heavy = path.endswith("Kit") or any(k in str(a.asset_name) for k in ("_Lattice", "_Brick", "_Signs"))   # dense: light AUTO fallback (memory)
        want = unreal.NaniteFallbackTarget.AUTO if heavy else unreal.NaniteFallbackTarget.PERCENT_TRIANGLES
        if s.fallback_target == want and (heavy or s.fallback_percent_triangles >= 1.0): continue
        s.fallback_target = want
        s.fallback_percent_triangles = 1.0
        sms.set_nanite_settings(m, s, apply_changes=True); n += 1
        print(" ", a.asset_name, "AUTO" if heavy else "100%")
print("rt fallback full on", n, "meshes")
