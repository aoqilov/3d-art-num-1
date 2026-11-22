# Neighbourhood + outer city as in the web app: tools/unreal/out/context.glb (build_context.py) -> /Game/Kompleks/Context,
# one actor per mesh at the origin ("Kompleks_Ctx_*", folder Kompleks/Atrof), Nanite, no collision.
# Materials: streets use the complex ground's Megascans instances (MI_GP_Asphalt / Pavers / Curb / Soil); walls get
# M_CX_Wall (colour from UV sets 1-2 + a window grid from the UVs: u = bay 3.2 m, v = storey 3 m; ~25 % of the windows lit at night
# by MPC_Blok1.LightOn), roofs M_CX_Roof (colour from UV sets 1-2), outer boxes M_CX_Outer (web grey #a4a4a0, two-sided).
# Safe to re-run (CTX_REIMPORT = True re-imports the glb).
import unreal
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
AT = unreal.AssetToolsHelpers.get_asset_tools(); EAL = unreal.EditorAssetLibrary; MEL = unreal.MaterialEditingLibrary
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem); sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
D, MD = "/Game/Kompleks/Context", "/Game/Kompleks/Context/Mat"
MPC = unreal.load_asset("/Game/Blok1/Mat/MPC_Blok1")

def fresh(name):
    p = MD + "/" + name
    if EAL.does_asset_exist(p): EAL.delete_asset(p)
    return AT.create_asset(name, MD, unreal.Material, unreal.MaterialFactoryNew())
def E(m, cls, x, y): return MEL.create_material_expression(m, cls, x, y)
def K(m, v, x, y):
    c = E(m, unreal.MaterialExpressionConstant, x, y); c.set_editor_property("r", v); return c
def V3(m, rgb, x, y):
    c = E(m, unreal.MaterialExpressionConstant3Vector, x, y); c.set_editor_property("constant", unreal.LinearColor(*rgb, 1)); return c
def op(m, cls, a, b, x, y, pa="A", pb="B"):
    o = E(m, cls, x, y); MEL.connect_material_expressions(a, "", o, pa); MEL.connect_material_expressions(b, "", o, pb); return o
def one(m, cls, a, x, y):
    o = E(m, cls, x, y); MEL.connect_material_expressions(a, "", o, ""); return o
def mask(m, a, ch, x, y):
    o = E(m, unreal.MaterialExpressionComponentMask, x, y)
    for k in "rgba": o.set_editor_property(k, k == ch)
    MEL.connect_material_expressions(a, "", o, ""); return o
def band(m, f, lo, hi, x, y):
    """1 inside [lo, hi] of a 0..1 value (sharp)"""
    a = one(m, unreal.MaterialExpressionSaturate, op(m, unreal.MaterialExpressionMultiply, op(m, unreal.MaterialExpressionSubtract, f, K(m, lo, x - 150, y + 40), x - 80, y), K(m, 200.0, x - 80, y + 60), x, y), x + 60, y)
    b = one(m, unreal.MaterialExpressionSaturate, op(m, unreal.MaterialExpressionMultiply, op(m, unreal.MaterialExpressionSubtract, K(m, hi, x - 150, y + 140), f, x - 80, y + 100), K(m, 200.0, x - 80, y + 160), x, y + 100), x + 60, y + 100)
    return op(m, unreal.MaterialExpressionMultiply, a, b, x + 140, y + 50)

def vcolor(m, x, y):
    """the colour baked into UV sets 1 (r, g) and 2 (b) by build_context.py"""
    t1 = E(m, unreal.MaterialExpressionTextureCoordinate, x - 300, y); t1.set_editor_property("coordinate_index", 1)
    t2 = E(m, unreal.MaterialExpressionTextureCoordinate, x - 300, y + 120); t2.set_editor_property("coordinate_index", 2)
    r, g = mask(m, t1, "r", x - 150, y - 60), one(m, unreal.MaterialExpressionOneMinus, mask(m, t1, "g", x - 150, y + 20), x - 60, y + 20)   # glTF stores v as 1 - v
    b = mask(m, t2, "r", x - 150, y + 120)
    return op(m, unreal.MaterialExpressionAppendVector, op(m, unreal.MaterialExpressionAppendVector, r, g, x - 30, y - 30), b, x, y)

def build_wall():
    m = fresh("M_CX_Wall")
    vc = vcolor(m, -1400, -200)
    uv = E(m, unreal.MaterialExpressionTextureCoordinate, -1800, 200)
    u, v = mask(m, uv, "r", -1650, 150), mask(m, uv, "g", -1650, 350)
    fu, fv = one(m, unreal.MaterialExpressionFrac, u, -1500, 150), one(m, unreal.MaterialExpressionFrac, v, -1500, 350)
    has = one(m, unreal.MaterialExpressionSaturate, op(m, unreal.MaterialExpressionMultiply, u, K(m, 1000.0, -1500, 500), -1400, 500), -1300, 500)   # u = 0: blank wall
    win = op(m, unreal.MaterialExpressionMultiply, op(m, unreal.MaterialExpressionMultiply, band(m, fu, 0.22, 0.78, -1300, 100), band(m, fv, 0.3, 0.8, -1300, 300), -1000, 200), has, -900, 250)
    glass = V3(m, (0.035, 0.045, 0.06), -900, 0)
    base = E(m, unreal.MaterialExpressionLinearInterpolate, -600, -100)
    MEL.connect_material_expressions(vc, "", base, "A"); MEL.connect_material_expressions(glass, "", base, "B"); MEL.connect_material_expressions(win, "", base, "Alpha")
    MEL.connect_material_property(base, "", unreal.MaterialProperty.MP_BASE_COLOR)
    rough = E(m, unreal.MaterialExpressionLinearInterpolate, -600, 100)
    MEL.connect_material_expressions(K(m, 0.9, -750, 80), "", rough, "A"); MEL.connect_material_expressions(K(m, 0.12, -750, 140), "", rough, "B"); MEL.connect_material_expressions(win, "", rough, "Alpha")
    MEL.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    # night: a random ~25 % of the windows glow warm (cell = bay, storey, + coarse world position)
    cu, cv = one(m, unreal.MaterialExpressionFloor, u, -1500, 650), one(m, unreal.MaterialExpressionFloor, v, -1500, 750)
    wp = E(m, unreal.MaterialExpressionWorldPosition, -1650, 850)
    wc = one(m, unreal.MaterialExpressionFloor, op(m, unreal.MaterialExpressionDivide, wp, K(m, 2000.0, -1650, 950), -1500, 850), -1400, 850)
    s = op(m, unreal.MaterialExpressionAdd, op(m, unreal.MaterialExpressionMultiply, cu, K(m, 12.9898, -1350, 650), -1250, 650),
           op(m, unreal.MaterialExpressionMultiply, cv, K(m, 78.233, -1350, 750), -1250, 750), -1150, 700)
    s = op(m, unreal.MaterialExpressionAdd, s, op(m, unreal.MaterialExpressionDotProduct, wc, V3(m, (37.719, 4.581, 9.17), -1400, 950), -1250, 850), -1050, 750)
    h = one(m, unreal.MaterialExpressionFrac, op(m, unreal.MaterialExpressionMultiply, one(m, unreal.MaterialExpressionSine, s, -950, 750), K(m, 43758.5453, -950, 850), -850, 750), -750, 750)
    lit = one(m, unreal.MaterialExpressionSaturate, op(m, unreal.MaterialExpressionMultiply, op(m, unreal.MaterialExpressionSubtract, h, K(m, 0.75, -750, 850), -650, 750), K(m, 1000.0, -650, 850), -550, 750), -450, 750)
    var = op(m, unreal.MaterialExpressionAdd, op(m, unreal.MaterialExpressionMultiply, one(m, unreal.MaterialExpressionFrac, op(m, unreal.MaterialExpressionMultiply, h, K(m, 17.0, -650, 950), -550, 950), -450, 950), K(m, 0.8, -450, 1000), -350, 950), K(m, 0.4, -350, 1000), -250, 950)
    nits = E(m, unreal.MaterialExpressionScalarParameter, -450, 550); nits.set_editor_property("parameter_name", "WindowNits"); nits.set_editor_property("default_value", 60.0)
    on = E(m, unreal.MaterialExpressionCollectionParameter, -250, 1050); on.set_editor_property("collection", MPC); on.set_editor_property("parameter_name", "LightOn")
    e = op(m, unreal.MaterialExpressionMultiply, op(m, unreal.MaterialExpressionMultiply, V3(m, (1.0, 0.72, 0.42), -300, 500), nits, -200, 520), op(m, unreal.MaterialExpressionMultiply, lit, var, -150, 800), -50, 600)
    e = op(m, unreal.MaterialExpressionMultiply, op(m, unreal.MaterialExpressionMultiply, e, win, 50, 650), on, 150, 700)
    MEL.connect_material_property(e, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    MEL.recompile_material(m); return m

def simple(name, rgb=None, rough=0.8, metal=0.0, vcol=False, two=False):
    m = fresh(name)
    c = vcolor(m, -400, 0) if vcol else V3(m, rgb, -400, 0)
    MEL.connect_material_property(c, "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(K(m, rough, -400, 150), "", unreal.MaterialProperty.MP_ROUGHNESS)
    if metal: MEL.connect_material_property(K(m, metal, -400, 250), "", unreal.MaterialProperty.MP_METALLIC)
    if two: m.set_editor_property("two_sided", True)
    MEL.recompile_material(m); return m

if not EAL.does_directory_exist(MD): EAL.make_directory(MD)
mats = {
    "M_CX_Asphalt": unreal.load_asset("/Game/Kompleks/Mat/MI_GP_Asphalt"),
    "M_CX_Pavers": unreal.load_asset("/Game/Kompleks/Mat/MI_GP_Pavers"),
    "M_CX_Curb": unreal.load_asset("/Game/Kompleks/Mat/MI_GP_Curb"),
    "M_CX_Park": unreal.load_asset("/Game/Kompleks/Mat/MI_GP_Soil"),
    "M_CX_Paint": simple("M_CX_Paint", (0.85, 0.84, 0.8), 0.6),
    "M_CX_Wall": build_wall(),
    "M_CX_Roof": simple("M_CX_Roof", rough=0.75, metal=0.15, vcol=True, two=True),
    "M_CX_Outer": simple("M_CX_Outer", (0.37, 0.37, 0.355), 0.9, two=True),
}
print("materials", {k: (v.get_name() if v else None) for k, v in mats.items()})

if globals().get("CTX_REIMPORT", True) and EAL.does_directory_exist(D + "/context"): EAL.delete_directory(D + "/context")
t = unreal.AssetImportTask(); t.filename = ROOT + "/out/context.glb"; t.destination_path = D + "/context"
t.automated = True; t.replace_existing = True; t.save = True
AT.import_asset_tasks([t])
meshes = [o for o in (unreal.load_asset(p) for p in t.imported_object_paths) if isinstance(o, unreal.StaticMesh)]
for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith("Kompleks_Ctx_"): eas.destroy_actor(a)
for sm in meshes:
    for i, s in enumerate(sm.static_materials):
        n = str(s.material_slot_name)
        key = next((k for k in mats if n.startswith(k)), None)
        if key and mats[key]: sm.set_material(i, mats[key])
    ns = sms.get_nanite_settings(sm); ns.enabled = True; sms.set_nanite_settings(sm, ns, apply_changes=True)
    EAL.save_loaded_asset(sm, False)
    a = eas.spawn_actor_from_object(sm, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    a.set_actor_label("Kompleks_Ctx_" + sm.get_name()); a.set_folder_path("Kompleks/Atrof")
    a.tags = [unreal.Name("Kompleks"), unreal.Name("Atrof")]; a.set_editor_property("is_spatially_loaded", False)
    a.static_mesh_component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    print("mesh", sm.get_name(), [str(s.material_slot_name) for s in sm.static_materials])
print("context ok", len(meshes))
