# Construction animation assets: imports tools/unreal/out/crane.glb into /Game/Blok1/Qurilish and makes BP_Kran
# (Actor: Scene root > Mast, Top > Trolley > Cable, Hook) with the meshes assigned. Graph: tools/unreal/ue_graphs/qurilish_bp.mjs
import unreal
AT = unreal.AssetToolsHelpers.get_asset_tools()
SDS = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
BFL = unreal.SubobjectDataBlueprintFunctionLibrary
D = "/Game/Blok1/Qurilish"
t = unreal.AssetImportTask()
t.filename = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/out/crane.glb"
t.destination_path = D; t.automated = True; t.replace_existing = True; t.save = True
AT.import_asset_tasks([t])
reg = unreal.AssetRegistryHelpers.get_asset_registry()
meshes = {a.get_asset().get_name(): a.get_asset() for a in reg.get_assets_by_path(D, recursive=True) if str(a.asset_class_path.asset_name) == "StaticMesh"}
print("crane meshes", sorted(meshes))
sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
for n, m in meshes.items():                     # thin lattice: Nanite with preserve-area (like the facade frames);
    s = sms.get_nanite_settings(m)              # the netting is translucent -> classic mesh, no Nanite
    s.enabled = n != "Kran_Net"; s.set_editor_property("shape_preservation", unreal.NaniteShapePreservation.PRESERVE_AREA)
    sms.set_nanite_settings(m, s, apply_changes=True)
    m.set_editor_property("body_setup", m.get_editor_property("body_setup"))

def bp(name, parent):
    path = D + "/" + name
    if unreal.EditorAssetLibrary.does_asset_exist(path): return unreal.load_asset(path)
    f = unreal.BlueprintFactory(); f.set_editor_property("parent_class", parent)
    return AT.create_asset(name, D, unreal.Blueprint, f)
def comp(b, cls, name, parent_handle=None):
    hs = SDS.k2_gather_subobject_data_for_blueprint(b)
    for h in hs:
        if str(BFL.get_variable_name(BFL.get_data(h))) == name: return h, BFL.get_object(BFL.get_data(h))
    p = unreal.AddNewSubobjectParams(parent_handle=parent_handle or hs[0], new_class=cls, blueprint_context=b)
    h, fail = SDS.add_new_subobject(p); SDS.rename_subobject(h, unreal.Text(name))
    return h, BFL.get_object(BFL.get_data(h))
def sm(c, mesh):
    c.set_editor_property("static_mesh", mesh); c.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    c.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    c.set_editor_property("cast_shadow", True)

k = bp("BP_Kran", unreal.Actor)
hs = SDS.k2_gather_subobject_data_for_blueprint(k)
root = hs[0]
hm, mast = comp(k, unreal.StaticMeshComponent, "Mast", root); sm(mast, meshes.get("Kran_Mast"))
ht, top = comp(k, unreal.StaticMeshComponent, "Top", root); sm(top, meshes.get("Kran_Top"))
htr, trol = comp(k, unreal.StaticMeshComponent, "Trolley", ht); sm(trol, meshes.get("Kran_Trolley"))
trol.set_editor_property("relative_location", unreal.Vector(2500, 0, 0))
hc, cab = comp(k, unreal.StaticMeshComponent, "Cable", htr); sm(cab, meshes.get("Kran_Cable"))
cab.set_editor_property("relative_location", unreal.Vector(0, 0, 30))
hh, hook = comp(k, unreal.StaticMeshComponent, "Hook", htr); sm(hook, meshes.get("Kran_Hook"))
unreal.BlueprintEditorLibrary.compile_blueprint(k)
print("BP_Kran", [str(BFL.get_variable_name(BFL.get_data(h))) for h in SDS.k2_gather_subobject_data_for_blueprint(k)])
print("saved", unreal.EditorAssetLibrary.save_loaded_asset(k, False))
