# Night facade lighting on every finished block of the complex (all web blocks except 1 = the construction scene):
# tools/unreal/out/blok_night.glb (build_night.py) -> /Game/Kompleks/Night, emissive M_LedNight / M_LedGold, one actor per
# block at the block origin (same transform as Kompleks_B<id>; block 2 = the walkable block), plus 2 warm point lights
# in each portal arch. Everything tagged "Chiroq" (the time bar's night set) + "Kompleks". Safe to re-run.
import unreal, os, math
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
exec(open(ROOT + "/ue_scripts/kompleks_coords.py", encoding="utf-8").read())
AT = unreal.AssetToolsHelpers.get_asset_tools(); EAL = unreal.EditorAssetLibrary; MEL = unreal.MaterialEditingLibrary
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
D = "/Game/Kompleks/Night"

def emissive(name, rgb, k, wash=False):
    """wash=True: additive unlit soft glow on the wall beside an LED line, falloff across the plane from its UV
    (u across, v along): 0.75 (1-x)^14 + 0.35 (1-x)^3 with x = |2u-1|, faded at both ends"""
    p = D + "/" + name
    if EAL.does_asset_exist(p): EAL.delete_asset(p)
    m = AT.create_asset(name, D, unreal.Material, unreal.MaterialFactoryNew())
    if wash:
        m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_ADDITIVE)
        m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
        m.set_editor_property("two_sided", True)
    c = MEL.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -400, 0); c.set_editor_property("constant", unreal.LinearColor(*rgb, 1))
    s = MEL.create_material_expression(m, unreal.MaterialExpressionScalarParameter, -400, 150)
    s.set_editor_property("parameter_name", "Glow"); s.set_editor_property("default_value", k)
    mul = MEL.create_material_expression(m, unreal.MaterialExpressionMultiply, -200, 0)
    MEL.connect_material_expressions(c, "", mul, "A"); MEL.connect_material_expressions(s, "", mul, "B")
    # night factor = MPC_Blok1.LightOn (0..1), the time bar's light alpha: follows "Chiroq: Avto / Yoniq / O'chiq" like
    # the street lamps. (Was 1 - 1.5 x sun lux, tied to the old 8-lux scene-scale sun; 2026-11-22 physical units.)
    sat = MEL.create_material_expression(m, unreal.MaterialExpressionCollectionParameter, -400, 300)
    sat.set_editor_property("collection", unreal.load_asset("/Game/Blok1/Mat/MPC_Blok1")); sat.set_editor_property("parameter_name", "LightOn")
    em = MEL.create_material_expression(m, unreal.MaterialExpressionMultiply, -80, 100)
    MEL.connect_material_expressions(mul, "", em, "A"); MEL.connect_material_expressions(sat, "", em, "B")
    if wash:
        E = lambda cls, x, y: MEL.create_material_expression(m, cls, x, y)
        def const(v, x, y):
            c_ = E(unreal.MaterialExpressionConstant, x, y); c_.set_editor_property("r", v); return c_
        def op(cls, a, b, x, y):
            o = E(cls, x, y); MEL.connect_material_expressions(a, "", o, "A"); MEL.connect_material_expressions(b, "", o, "B"); return o
        tc = E(unreal.MaterialExpressionTextureCoordinate, -1600, 600)
        u = E(unreal.MaterialExpressionComponentMask, -1450, 560); u.set_editor_property("r", True); u.set_editor_property("g", False)
        v = E(unreal.MaterialExpressionComponentMask, -1450, 760); v.set_editor_property("r", False); v.set_editor_property("g", True)
        MEL.connect_material_expressions(tc, "", u, ""); MEL.connect_material_expressions(tc, "", v, "")
        x2 = op(unreal.MaterialExpressionMultiply, u, const(2.0, -1450, 640), -1300, 560)
        xm = op(unreal.MaterialExpressionSubtract, x2, const(1.0, -1300, 640), -1150, 560)
        ax = E(unreal.MaterialExpressionAbs, -1000, 560); MEL.connect_material_expressions(xm, "", ax, "")
        om = E(unreal.MaterialExpressionOneMinus, -850, 560); MEL.connect_material_expressions(ax, "", om, "")
        p14 = E(unreal.MaterialExpressionPower, -700, 520); MEL.connect_material_expressions(om, "", p14, "Base"); p14.set_editor_property("const_exponent", 10.0)
        p3 = E(unreal.MaterialExpressionPower, -700, 640); MEL.connect_material_expressions(om, "", p3, "Base"); p3.set_editor_property("const_exponent", 2.2)
        a1 = op(unreal.MaterialExpressionMultiply, p14, const(0.0, -700, 580), -550, 520)
        a2 = op(unreal.MaterialExpressionMultiply, p3, const(1.0, -700, 700), -550, 640)
        across = op(unreal.MaterialExpressionAdd, a1, a2, -400, 560)
        e0 = op(unreal.MaterialExpressionMultiply, v, const(25.0, -1300, 820), -1150, 760)
        e1m = E(unreal.MaterialExpressionOneMinus, -1300, 900); MEL.connect_material_expressions(v, "", e1m, "")
        e1 = op(unreal.MaterialExpressionMultiply, e1m, const(33.0, -1150, 960), -1000, 900)
        s0 = E(unreal.MaterialExpressionSaturate, -1000, 760); MEL.connect_material_expressions(e0, "", s0, "")
        s1 = E(unreal.MaterialExpressionSaturate, -850, 900); MEL.connect_material_expressions(e1, "", s1, "")
        ends = op(unreal.MaterialExpressionMultiply, s0, s1, -700, 800)
        g = op(unreal.MaterialExpressionMultiply, across, ends, -250, 650)
        em = op(unreal.MaterialExpressionMultiply, em, g, 50, 300)
    MEL.connect_material_property(em, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    if not wash:
        dk = MEL.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -400, -150); dk.set_editor_property("constant", unreal.LinearColor(0.12, 0.11, 0.1, 1))
        MEL.connect_material_property(dk, "", unreal.MaterialProperty.MP_BASE_COLOR)   # by day: a dark aluminium profile
    MEL.recompile_material(m); EAL.save_loaded_asset(m, False); return m

if EAL.does_directory_exist(D + "/blok_night"): EAL.delete_directory(D + "/blok_night")
t = unreal.AssetImportTask(); t.filename = ROOT + "/out/blok_night.glb"; t.destination_path = D; t.automated = True; t.replace_existing = True; t.save = True
for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith(("Kompleks_Night_", "Kompleks_PortalL_", "Kompleks_WashL_")): eas.destroy_actor(a)
AT.import_asset_tasks([t])
mesh = next(o for o in (unreal.load_asset(p) for p in t.imported_object_paths) if isinstance(o, unreal.StaticMesh))
led, gold = emissive("M_LedNight", (1.0, 0.78, 0.5), 800.0), emissive("M_LedGold", (1.0, 0.7, 0.3), 2500.0)  # 2026-11-22 physical units: sun 120000 lux, local lights and emissives x100 (were scene scale, sun 6 lux)
wash = emissive("M_LedWash", (1.0, 0.72, 0.42), 12.0, wash=True)
for i, s in enumerate(mesh.static_materials):
    n_ = str(s.material_slot_name)
    mesh.set_material(i, wash if "Wash" in n_ else gold if "Gold" in n_ else led)
EAL.save_loaded_asset(mesh, False)

TAGS = [unreal.Name("Kompleks"), unreal.Name("Chiroq")]
import json
PIERS = json.load(open(ROOT + "/out/night_piers.json"))
WASH_LM = globals().get("WASH_LM", 120.0)
n = 0
for i in sorted(BLOCKS):
    if i == 1: continue
    x, y, yaw, sx, sy = block_ue(i)
    a = eas.spawn_actor_from_object(mesh, unreal.Vector(x, y, 2.0), unreal.Rotator(roll=0.0, pitch=0.0, yaw=yaw))
    a.set_actor_scale3d(unreal.Vector(sx, sy, 1.0))
    a.set_actor_label("Kompleks_Night_B%02d" % i); a.set_folder_path("Kompleks/Tun"); a.tags = TAGS
    # 2026-11-23: the profile too — with BlockAll left on, a reload turns collision back on and the mesh's single convex
    # hull wraps the whole block (the player could not climb the stairs past storey 1)
    a.static_mesh_component.set_collision_profile_name("NoCollision")
    a.static_mesh_component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    a.static_mesh_component.set_editor_property("cast_shadow", False)
    a.set_editor_property("is_spatially_loaded", False)
    c, s_ = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    # 2026-11-22 owner: light the building only up to the 1st floor (the 9 m portal light lit 6 storeys)
    for k, (px, py, pz, lm) in enumerate(((14.85, -2.4, 2.6, 3000.0),)):
        px *= sx; py *= sy
        pl = eas.spawn_actor_from_class(unreal.PointLight, unreal.Vector(x + (px * c - py * s_) * 100, y + (px * s_ + py * c) * 100, 2.0 + pz * 100))
        pl.set_actor_label("Kompleks_PortalL_B%02d_%d" % (i, k)); pl.set_folder_path("Kompleks/Tun")
        lc = pl.get_component_by_class(unreal.PointLightComponent)
        lc.set_editor_property("intensity_units", unreal.LightUnits.LUMENS); lc.set_editor_property("intensity", lm)
        lc.set_editor_property("use_temperature", True); lc.set_editor_property("temperature", 3000.0)
        lc.set_editor_property("attenuation_radius", 1500.0); lc.set_editor_property("source_radius", 20.0)
        lc.set_editor_property("cast_shadows", False)
        lc.set_editor_property("max_draw_distance", 9000.0); lc.set_editor_property("max_distance_fade_range", 1500.0)
        pl.tags = TAGS; pl.set_editor_property("is_spatially_loaded", False)
    n += 1
# street lamp heads / bollard slots glow only at night too: same night material on their glow slots
lamp = emissive("M_LampGlowNight", (1.0, 0.85, 0.65), 2500.0)
for pm in ("prop_lamp", "prop_bollard"):
    for pth in EAL.list_assets("/Game/Kompleks/Props/" + pm, recursive=True):
        a = EAL.load_asset(pth)
        if isinstance(a, unreal.StaticMesh):
            for i, s in enumerate(a.static_materials):
                if "Glow" in str(s.material_slot_name): a.set_material(i, lamp)
            EAL.save_loaded_asset(a, False)
print("night ok, blocks", n)
