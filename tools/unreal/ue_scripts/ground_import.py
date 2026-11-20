# Courtyard ground of the complex: imports tools/unreal/out/ground.glb (build_ground.py) into /Game/Kompleks/Ground,
# Poly Haven CC0 2K textures (tools/unreal/out/tex_ph) into /Game/Kompleks/Tex, a master M_GP_Surface (UV = world metres
# divided by Tile) and one instance per slot; places the actor "Kompleks_Ground" at the origin (vertices are already in
# Unreal space), with complex-as-simple collision so the player can walk on it. Safe to re-run.
import unreal, os
AT = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/out"
TEXD, MATD, GD = "/Game/Kompleks/Tex", "/Game/Kompleks/Mat", "/Game/Kompleks/Ground"

def imp(fn, dest, name=None):
    t = unreal.AssetImportTask(); t.filename = fn; t.destination_path = dest; t.automated = True
    t.replace_existing = True; t.save = True
    if name: t.destination_name = name
    AT.import_asset_tasks([t]); return t.imported_object_paths

# ---- textures
SETS = {"Pavers": "concrete_pavers", "Asphalt": "asphalt_02", "Curb": "concrete_floor_02", "Lawn": "leafy_grass"}
tex = {}
for key, ph in SETS.items():
    for m, kind in (("diff", "A"), ("nor_gl", "N"), ("arm", "ARM")):
        name = "T_GP_%s_%s" % (key, kind); path = TEXD + "/" + name
        fresh = not EAL.does_asset_exist(path)
        if fresh:
            imp(os.path.join(ROOT, "tex_ph", "%s_%s_2k.jpg" % (ph, m)), TEXD, name)
        t = unreal.load_asset(path)
        if fresh and kind != "A":                  # set once on import; re-saving textures on later runs hung the editor (2026-11-20)
            if kind == "N":
                t.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
                t.set_editor_property("flip_green_channel", True)        # OpenGL normal map -> Unreal (DirectX)
            else:
                t.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_MASKS)
            t.set_editor_property("srgb", False)
            EAL.save_loaded_asset(t, False)
        tex[(key, kind)] = t

# ---- master material: AO / roughness / metal from ARM, tint, tiling in metres (mesh UV = metres)
mp = MATD + "/M_GP_Surface"
if EAL.does_asset_exist(mp):                     # instances reference it: rebuild in place instead of deleting
    m = unreal.load_asset(mp); MEL.delete_all_material_expressions(m)
else:
    m = AT.create_asset("M_GP_Surface", MATD, unreal.Material, unreal.MaterialFactoryNew())
E = lambda cls, x, y: MEL.create_material_expression(m, cls, x, y)
tc = E(unreal.MaterialExpressionTextureCoordinate, -1300, 0)
tile = E(unreal.MaterialExpressionScalarParameter, -1300, 150); tile.set_editor_property("parameter_name", "TileM"); tile.set_editor_property("default_value", 2.0)
uv = E(unreal.MaterialExpressionDivide, -1100, 0); MEL.connect_material_expressions(tc, "", uv, "A"); MEL.connect_material_expressions(tile, "", uv, "B")
def samp(name, t, kind, y):
    s = E(unreal.MaterialExpressionTextureSampleParameter2D, -850, y)
    s.set_editor_property("parameter_name", name); s.set_editor_property("texture", t); s.set_editor_property("sampler_type", kind)
    MEL.connect_material_expressions(uv, "", s, "UVs"); return s
a = samp("Albedo", tex[("Pavers", "A")], unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, -300)
n = samp("Normal", tex[("Pavers", "N")], unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, 0)
r = samp("ARM", tex[("Pavers", "ARM")], unreal.MaterialSamplerType.SAMPLERTYPE_MASKS, 300)
tint = E(unreal.MaterialExpressionVectorParameter, -550, -450); tint.set_editor_property("parameter_name", "Tint"); tint.set_editor_property("default_value", unreal.LinearColor(1, 1, 1, 1))
base = E(unreal.MaterialExpressionMultiply, -300, -350); MEL.connect_material_expressions(a, "RGB", base, "A"); MEL.connect_material_expressions(tint, "", base, "B")
MEL.connect_material_property(base, "", unreal.MaterialProperty.MP_BASE_COLOR)
MEL.connect_material_property(n, "RGB", unreal.MaterialProperty.MP_NORMAL)
rs = E(unreal.MaterialExpressionScalarParameter, -550, 450); rs.set_editor_property("parameter_name", "RoughScale"); rs.set_editor_property("default_value", 1.0)
rough = E(unreal.MaterialExpressionMultiply, -300, 350); MEL.connect_material_expressions(r, "G", rough, "A"); MEL.connect_material_expressions(rs, "", rough, "B")
MEL.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
MEL.connect_material_property(r, "R", unreal.MaterialProperty.MP_AMBIENT_OCCLUSION)
MEL.recompile_material(m); EAL.save_loaded_asset(m, False)

# slot -> (texture set, tile metres, tint, roughness scale)
LOOK = {"M_GP_Pavers": ("Pavers", 2.0, (0.95, 0.88, 0.82), 1.0), "M_GP_Asphalt": ("Asphalt", 4.0, (0.42, 0.42, 0.44), 1.0),
        "M_GP_Curb": ("Curb", 2.0, (1.0, 1.0, 1.0), 1.0), "M_GP_Soil": ("Lawn", 2.5, (0.42, 0.68, 0.3), 1.0),
        "M_GP_Play": ("Curb", 1.5, (0.85, 0.32, 0.2), 1.3), "M_GP_Sport": ("Curb", 2.0, (0.25, 0.55, 0.42), 1.2),
        "M_GP_Fountain": ("Pavers", 1.0, (1.1, 1.1, 1.1), 0.6)}
mis = {}
for slot, (key, tm, tn, rsc) in LOOK.items():
    name = "MI_" + slot[2:]; path = MATD + "/" + name
    mi = unreal.load_asset(path) if EAL.does_asset_exist(path) else AT.create_asset(name, MATD, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    mi.set_editor_property("parent", m)
    MEL.set_material_instance_scalar_parameter_value(mi, "TileM", tm)
    MEL.set_material_instance_scalar_parameter_value(mi, "RoughScale", rsc)
    MEL.set_material_instance_vector_parameter_value(mi, "Tint", unreal.LinearColor(*tn, 1))
    for p, k in (("Albedo", "A"), ("Normal", "N"), ("ARM", "ARM")):
        MEL.set_material_instance_texture_parameter_value(mi, p, tex[(key, k)])
    MEL.update_material_instance(mi); EAL.save_loaded_asset(mi, False); mis[slot] = mi

# ---- mesh (old assets deleted first: a glTF reimport over them opens a modal "Overwrite Existing Object" dialog)
eas0 = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
for x in eas0.get_all_level_actors():
    if x.get_actor_label() == "Kompleks_Ground": eas0.destroy_actor(x)
if EAL.does_directory_exist(GD): EAL.delete_directory(GD)
paths = imp(os.path.join(ROOT, "ground.glb"), GD)              # (the asset registry lags right after an import)
mesh = next(o for o in (unreal.load_asset(p) for p in paths) if isinstance(o, unreal.StaticMesh))
for i, s in enumerate(mesh.static_materials):
    if str(s.material_slot_name) in mis: mesh.set_material(i, mis[str(s.material_slot_name)])
bs = mesh.get_editor_property("body_setup")
bs.set_editor_property("collision_trace_flag", unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
EAL.save_loaded_asset(mesh, False)

eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
for x in eas.get_all_level_actors():
    if x.get_actor_label() == "Kompleks_Ground": eas.destroy_actor(x)
g = eas.spawn_actor_from_object(mesh, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
g.set_actor_label("Kompleks_Ground"); g.set_folder_path("Kompleks"); g.tags = [unreal.Name("Kompleks")]
g.set_editor_property("is_spatially_loaded", False)
print("ground ok", mesh.get_name(), [str(s.material_slot_name) for s in mesh.static_materials])
