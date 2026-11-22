# Realistic materials for Obod Maskan block 1 (run after import_blok1.py; safe to re-run).
#  - M_Blok1_Plaster: master for painted render. Megascans plaster gives relief, roughness and AO; the colour comes from a
#    tint (taken from the architect's render), the texture only modulates it around 1.0 so the hue stays exact.
#  - M_Blok1_Solid: plain painted / powder-coated / metal surfaces.
# Material instances live in /Game/Blok1/Mat and are put into the matching mesh slots of every /Game/Blok1/Full mesh.
import unreal

MEL = unreal.MaterialEditingLibrary
AT = unreal.AssetToolsHelpers.get_asset_tools()
DIR = "/Game/Blok1/Mat"
FAB = "/Game/Fab/Megascans/Surfaces/Plaster_Facade_udkgeabew/Medium/udkgeabew_tier_2/Textures/T_udkgeabew_2K_"
PLASTER_MEAN = (150.4 / 255, 145.3 / 255, 136.1 / 255)          # sRGB mean of the albedo map (measured)
UV_M = 2.5                                                          # our facade UVs: 1 unit = 2.5 m
TEX_M = (2.0, 1.0)                                                  # the Megascans plaster covers 2 x 1 m

def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexlin(h):
    return unreal.LinearColor(lin(int(h[1:3], 16)), lin(int(h[3:5], 16)), lin(int(h[5:7], 16)), 1.0)

def fresh_material(name):
    path = DIR + "/" + name
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        unreal.EditorAssetLibrary.delete_asset(path)
    return AT.create_asset(name, DIR, unreal.Material, unreal.MaterialFactoryNew())

def expr(m, cls, x, y):
    return MEL.create_material_expression(m, cls, x, y)

def build_plaster():
    m = fresh_material("M_Blok1_Plaster")
    tc = expr(m, unreal.MaterialExpressionTextureCoordinate, -1400, 0)
    til = expr(m, unreal.MaterialExpressionVectorParameter, -1400, 150)
    til.set_editor_property("parameter_name", "Tiling"); til.set_editor_property("default_value", unreal.LinearColor(1.25, 2.5, 0, 0))
    mask = expr(m, unreal.MaterialExpressionComponentMask, -1200, 150)
    mask.set_editor_property("r", True); mask.set_editor_property("g", True); mask.set_editor_property("b", False); mask.set_editor_property("a", False)
    MEL.connect_material_expressions(til, "", mask, "")
    uv = expr(m, unreal.MaterialExpressionMultiply, -1000, 0)
    MEL.connect_material_expressions(tc, "", uv, "A"); MEL.connect_material_expressions(mask, "", uv, "B")

    def sampler(name, tex, kind, y):
        s = expr(m, unreal.MaterialExpressionTextureSampleParameter2D, -800, y)
        s.set_editor_property("parameter_name", name)
        s.set_editor_property("texture", unreal.load_asset(tex))
        s.set_editor_property("sampler_type", kind)
        MEL.connect_material_expressions(uv, "", s, "UVs")
        return s
    alb = sampler("Albedo", FAB + "B", unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, -300)
    nrm = sampler("Normal", FAB + "N", unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, 0)
    orm = sampler("ORM", FAB + "ORM", unreal.MaterialSamplerType.SAMPLERTYPE_MASKS, 300)

    # base colour = Tint * lerp(1, albedo / mean, Detail)
    inv = expr(m, unreal.MaterialExpressionVectorParameter, -800, -500)
    inv.set_editor_property("parameter_name", "AlbedoInvMean")
    inv.set_editor_property("default_value", unreal.LinearColor(*[1.0 / lin(c * 255) for c in PLASTER_MEAN], 1))
    norm = expr(m, unreal.MaterialExpressionMultiply, -500, -400)
    MEL.connect_material_expressions(alb, "RGB", norm, "A"); MEL.connect_material_expressions(inv, "", norm, "B")
    one = expr(m, unreal.MaterialExpressionConstant3Vector, -500, -550); one.set_editor_property("constant", unreal.LinearColor(1, 1, 1, 1))
    det = expr(m, unreal.MaterialExpressionScalarParameter, -500, -250)
    det.set_editor_property("parameter_name", "Detail"); det.set_editor_property("default_value", 0.6)
    lerp = expr(m, unreal.MaterialExpressionLinearInterpolate, -300, -400)
    MEL.connect_material_expressions(one, "", lerp, "A"); MEL.connect_material_expressions(norm, "", lerp, "B"); MEL.connect_material_expressions(det, "", lerp, "Alpha")
    tint = expr(m, unreal.MaterialExpressionVectorParameter, -300, -600)
    tint.set_editor_property("parameter_name", "Tint"); tint.set_editor_property("default_value", hexlin("#f1eee8"))
    base = expr(m, unreal.MaterialExpressionMultiply, -100, -450)
    MEL.connect_material_expressions(tint, "", base, "A"); MEL.connect_material_expressions(lerp, "", base, "B")
    MEL.connect_material_property(base, "", unreal.MaterialProperty.MP_BASE_COLOR)

    # normal strength
    ns = expr(m, unreal.MaterialExpressionScalarParameter, -500, 100)
    ns.set_editor_property("parameter_name", "NormalStrength"); ns.set_editor_property("default_value", 1.0)
    up = expr(m, unreal.MaterialExpressionConstant3Vector, -500, 0); up.set_editor_property("constant", unreal.LinearColor(0, 0, 1, 1))
    fl = expr(m, unreal.MaterialExpressionLinearInterpolate, -300, 0)       # lerp(flat, map, strength)
    MEL.connect_material_expressions(up, "", fl, "A"); MEL.connect_material_expressions(nrm, "RGB", fl, "B"); MEL.connect_material_expressions(ns, "", fl, "Alpha")
    MEL.connect_material_property(fl, "", unreal.MaterialProperty.MP_NORMAL)

    # roughness = ORM.g * RoughnessScale ; AO = ORM.r
    rs = expr(m, unreal.MaterialExpressionScalarParameter, -500, 400)
    rs.set_editor_property("parameter_name", "RoughnessScale"); rs.set_editor_property("default_value", 1.0)
    rough = expr(m, unreal.MaterialExpressionMultiply, -300, 350)
    MEL.connect_material_expressions(orm, "G", rough, "A"); MEL.connect_material_expressions(rs, "", rough, "B")
    MEL.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    MEL.connect_material_property(orm, "R", unreal.MaterialProperty.MP_AMBIENT_OCCLUSION)
    MEL.recompile_material(m)
    return m

def build_solid():
    m = fresh_material("M_Blok1_Solid")
    c = expr(m, unreal.MaterialExpressionVectorParameter, -400, -100)
    c.set_editor_property("parameter_name", "Color"); c.set_editor_property("default_value", hexlin("#808080"))
    r = expr(m, unreal.MaterialExpressionScalarParameter, -400, 100)
    r.set_editor_property("parameter_name", "Roughness"); r.set_editor_property("default_value", 0.5)
    mt = expr(m, unreal.MaterialExpressionScalarParameter, -400, 200)
    mt.set_editor_property("parameter_name", "Metallic"); mt.set_editor_property("default_value", 0.0)
    MEL.connect_material_property(c, "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(r, "", unreal.MaterialProperty.MP_ROUGHNESS)
    MEL.connect_material_property(mt, "", unreal.MaterialProperty.MP_METALLIC)
    MEL.recompile_material(m)
    return m

def build_glass():
    """Architectural glass: almost transparent head-on, mirror-like at grazing angles (Fresnel), reflections from
    Lumen front-layer translucency. Base colour stays near black: glass has no diffuse colour, only reflection + tint."""
    m = fresh_material("M_Blok1_Glass")
    m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    m.set_editor_property("translucency_lighting_mode", unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
    m.set_editor_property("two_sided", True)
    col = expr(m, unreal.MaterialExpressionVectorParameter, -500, -300)
    col.set_editor_property("parameter_name", "Color"); col.set_editor_property("default_value", hexlin("#0f1519"))
    MEL.connect_material_property(col, "", unreal.MaterialProperty.MP_BASE_COLOR)
    fr = expr(m, unreal.MaterialExpressionFresnel, -700, 100)
    fr.set_editor_property("exponent", 4.0); fr.set_editor_property("base_reflect_fraction", 0.04)
    o0 = expr(m, unreal.MaterialExpressionScalarParameter, -700, 250)
    o0.set_editor_property("parameter_name", "OpacityFacing"); o0.set_editor_property("default_value", 0.22)
    o1 = expr(m, unreal.MaterialExpressionScalarParameter, -700, 350)
    o1.set_editor_property("parameter_name", "OpacityGrazing"); o1.set_editor_property("default_value", 0.92)
    op = expr(m, unreal.MaterialExpressionLinearInterpolate, -400, 200)
    MEL.connect_material_expressions(o0, "", op, "A"); MEL.connect_material_expressions(o1, "", op, "B"); MEL.connect_material_expressions(fr, "", op, "Alpha")
    MEL.connect_material_property(op, "", unreal.MaterialProperty.MP_OPACITY)
    for name, val, prop, y in (("Roughness", 0.02, unreal.MaterialProperty.MP_ROUGHNESS, 0),
                               ("Specular", 1.0, unreal.MaterialProperty.MP_SPECULAR, -100),
                               ("Metallic", 0.0, unreal.MaterialProperty.MP_METALLIC, -200)):
        p = expr(m, unreal.MaterialExpressionScalarParameter, -400, y)
        p.set_editor_property("parameter_name", name); p.set_editor_property("default_value", val)
        MEL.connect_material_property(p, "", prop)
    MEL.recompile_material(m)
    return m

def build_emissive():
    m = fresh_material("M_Blok1_Emissive")
    c = expr(m, unreal.MaterialExpressionVectorParameter, -500, 0)
    c.set_editor_property("parameter_name", "Color"); c.set_editor_property("default_value", hexlin("#fff1dc"))
    s = expr(m, unreal.MaterialExpressionScalarParameter, -500, 150)
    s.set_editor_property("parameter_name", "Strength"); s.set_editor_property("default_value", 2000.0)
    mul = expr(m, unreal.MaterialExpressionMultiply, -250, 50)
    MEL.connect_material_expressions(c, "", mul, "A"); MEL.connect_material_expressions(s, "", mul, "B")
    MEL.connect_material_property(c, "", unreal.MaterialProperty.MP_BASE_COLOR)
    # LightOn (MPC_Blok1, 0..1) is driven by the time slider: ceiling panels glow only when the lights are on
    mpc = unreal.load_asset("/Game/Blok1/Mat/MPC_Blok1")
    if mpc:
        cp = expr(m, unreal.MaterialExpressionCollectionParameter, -250, 250)
        cp.set_editor_property("collection", mpc); cp.set_editor_property("parameter_name", "LightOn")
        m2 = expr(m, unreal.MaterialExpressionMultiply, -50, 100)
        MEL.connect_material_expressions(mul, "", m2, "A"); MEL.connect_material_expressions(cp, "", m2, "B")
        mul = m2
    MEL.connect_material_property(mul, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    MEL.recompile_material(m)
    return m

def build_glow():
    """Unlit-looking emissive that ignores the time of day (lift call button lit while a call is waiting)."""
    m = fresh_material("M_Blok1_Glow")
    c = expr(m, unreal.MaterialExpressionVectorParameter, -500, 0)
    c.set_editor_property("parameter_name", "Color"); c.set_editor_property("default_value", hexlin("#ffd9a0"))
    s = expr(m, unreal.MaterialExpressionScalarParameter, -500, 150)
    s.set_editor_property("parameter_name", "Strength"); s.set_editor_property("default_value", 3000.0)
    mul = expr(m, unreal.MaterialExpressionMultiply, -250, 50)
    MEL.connect_material_expressions(c, "", mul, "A"); MEL.connect_material_expressions(s, "", mul, "B")
    MEL.connect_material_property(c, "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(mul, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    MEL.recompile_material(m)
    return m

def ensure_ppv():
    """Unbound post-process volume for the block: Lumen reflections on translucent glass (front layer)."""
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    v = next((a for a in eas.get_all_level_actors() if a.get_actor_label() == "Blok1_PPV"), None)
    if not v:
        v = eas.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(2985, -584, 300))
        v.set_actor_label("Blok1_PPV"); v.set_folder_path("Blok1")
    v.set_editor_property("unbound", True)
    s = v.get_editor_property("settings")
    s.set_editor_property("override_lumen_front_layer_translucency_reflections", True)
    s.set_editor_property("lumen_front_layer_translucency_reflections", True)
    for k in ("lumen_final_gather_quality", "lumen_scene_lighting_quality", "lumen_skylight_leaking"):   # reset: engine defaults
        s.set_editor_property("override_" + k, False)
    v.set_editor_property("settings", s)
    return v

def instance(name, parent, vec=None, sca=None):
    path = DIR + "/" + name
    mi = unreal.load_asset(path) if unreal.EditorAssetLibrary.does_asset_exist(path) else \
        AT.create_asset(name, DIR, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    mi.set_editor_property("parent", parent)
    for k, v in (vec or {}).items(): MEL.set_material_instance_vector_parameter_value(mi, k, v)
    for k, v in (sca or {}).items(): MEL.set_material_instance_scalar_parameter_value(mi, k, v)
    MEL.update_material_instance(mi)
    return mi

plaster = build_plaster()
solid = build_solid()
glass = build_glass()
emissive = build_emissive()
glow = build_glow()
ensure_ppv()

# slot name -> (instance name, parent, vectors, scalars). Colours: architect's render (src/block/materials.ts COLORS).
P = lambda h, det=0.6, rough=1.0, nrm=1.0: ("plaster", {"Tint": hexlin(h), "Tiling": unreal.LinearColor(UV_M / TEX_M[0], UV_M / TEX_M[1], 0, 0)},
                                            {"Detail": det, "RoughnessScale": rough, "NormalStrength": nrm})
S = lambda h, rough, metal=0.0: ("solid", {"Color": hexlin(h)}, {"Roughness": rough, "Metallic": metal})
MAP = {
    "M_FacadeMint":   ("MI_FacadeMint",   P("#98d0ae")),
    "M_FacadeWhite":  ("MI_FacadeWhite",  P("#f1eee8")),
    "M_WhiteBand":    ("MI_WhiteBand",    P("#f4f1ea", det=0.35, rough=0.85, nrm=0.6)),
    "M_Jamb":         ("MI_Jamb",         P("#f4f1eb", det=0.4)),
    "M_Pilaster":     ("MI_Pilaster",     P("#d6c9c2", det=0.45)),          # greige perforated screen (reference render)
    "M_PilasterBack": ("MI_PilasterBack", P("#7d8079")),                     # wall seen through the holes
    "M_PilasterSlot": ("MI_PilasterSlot", P("#3b322e", det=0.3)),            # crown slots
    # interiors (brochure: white plaster walls, screed floors in the handover state, dark steel entrance doors)
    "M_Plaster":      ("MI_Plaster",      P("#f3f1ed", det=0.3, nrm=0.5)),
    "M_Screed":       ("MI_Screed",       P("#a29e97", det=0.9)),
    "M_DoorEntry":    ("MI_DoorEntry",    S("#2e3946", 0.5, 0.25)),          # navy steel entrance doors (owner reference)
    "M_Handle":       ("MI_Handle",       S("#121314", 0.28, 0.9)),
    "M_Radiator":     ("MI_Radiator",     S("#f2f2f0", 0.3, 0.0)),
    "M_Boiler":       ("MI_Boiler",       S("#f4f4f2", 0.22, 0.0)),
    "M_LightRim":     ("MI_LightRim",     S("#e9e9e7", 0.35, 0.6)),
    "M_LightEmit":    ("MI_LightEmit",    ("emit", {"Color": hexlin("#fff1dc")}, {"Strength": 800.0})),  # 2026-11-22 physical units: sun 120000 lux, local lights and emissives x100 (were scene scale, sun 6 lux)
    "M_LampPublic":   ("MI_LampPublic",   ("emit", {"Color": hexlin("#eef3ff")}, {"Strength": 500.0})),   # neutral corridor plafonds
    "M_LiftBtn":      ("MI_LiftBtnOff",   S("#3a3d42", 0.35, 0.8)),          # lift call button, off (MI_LiftBtnOn below)
    "M_PilasterDark": ("MI_PilasterDark", P("#a48a72")),
    "M_Recess":       ("MI_Recess",       P("#cfccc5")),
    "M_Frame":        ("MI_Frame",        S("#1d1f23", 0.38, 0.15)),          # black powder-coated aluminium (interior renders)
    "M_Rail":         ("MI_Rail",         S("#1f2124", 0.42, 0.2)),
    "M_Canopy":       ("MI_Canopy",       S("#34363a", 0.35, 0.6)),
    "M_Spandrel":     ("MI_Spandrel",     S("#4f586c", 0.85, 0.0)),        # matte composite panel (no streaky reflections)
    # light blue-tinted low-E glass (owner: "a bit bluer" — the architect's render shows blue-grey windows)
    "M_Glass":        ("MI_Glass",        ("glass", {"Color": hexlin("#5b8099")}, {"OpacityFacing": 0.34, "OpacityGrazing": 0.9, "Roughness": 0.03})),
}
made = {}
for slot, (name, (kind, vec, sca)) in MAP.items():
    made[slot] = instance(name, {"plaster": plaster, "solid": solid, "glass": glass, "emit": emissive}[kind], vec, sca)

instance("MI_LiftBtnOn", glow, {"Color": hexlin("#ffd9a0")}, {"Strength": 3000.0})

def apply_all():
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    n = 0
    for a in reg.get_assets_by_path("/Game/Blok1/Full", recursive=True):
        if str(a.asset_class_path.asset_name) != "StaticMesh": continue
        mesh = a.get_asset()
        for i, s in enumerate(mesh.static_materials):
            mi = made.get(str(s.material_slot_name))
            if mi: mesh.set_material(i, mi); n += 1
    # storeys 8-16 wear white instead of mint (actor override)
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    for act in eas.get_all_level_actors():
        lab = act.get_actor_label()
        if lab.startswith("Blok1_Q") and lab.endswith("_Shell") and int(lab[7:9]) >= 8:
            act.static_mesh_component.set_material_by_name("M_FacadeMint", made["M_FacadeWhite"])
    return n
print("slots set:", apply_all())
