# Night look after the owner's reference render (foto-reference/Screenshot_2.png), 2026-11-22:
#   1. tree up-lights: a warm spot at the foot of every courtyard tree (out/plants.json "tree"), tag "ChiroqSpot"
#   2. lit windows on the light blocks: M_GlassLite gets a random warm glow per window cell (world position hash,
#      ~LIT_SHARE of the windows, brightness varies), times MPC_Blok1.LightOn (0 by day)
#   3. night colour: cooler white balance + a bit more bloom on Kompleks_PPV_Tun
# Safe to re-run.
import unreal, json
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem); MEL = unreal.MaterialEditingLibrary
TREE_LM, WIN_NITS, LIT_SHARE = globals().get("TREE_LM", 1200.0), globals().get("WIN_NITS", 60.0), globals().get("LIT_SHARE", 0.25)

# 1. tree up-lights
for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith("Kompleks_TreeL_"): eas.destroy_actor(a)
P = json.load(open(ROOT + "/out/plants.json"))
for k, r in enumerate(P["tree"]):
    x, y, z = r[0], r[1], r[2]
    s = eas.spawn_actor_from_class(unreal.SpotLight, unreal.Vector(x + 70.0, y, z + 15.0), unreal.Rotator(roll=0.0, pitch=80.0, yaw=180.0))
    s.set_actor_label("Kompleks_TreeL_%d" % k); s.set_folder_path("Kompleks/YerChiroq")
    lc = s.get_component_by_class(unreal.SpotLightComponent)
    lc.set_editor_property("intensity_units", unreal.LightUnits.LUMENS); lc.set_editor_property("intensity", TREE_LM)
    lc.set_editor_property("use_temperature", True); lc.set_editor_property("temperature", 3000.0)
    lc.set_editor_property("attenuation_radius", 1200.0); lc.set_editor_property("source_radius", 5.0)
    lc.set_editor_property("inner_cone_angle", 18.0); lc.set_editor_property("outer_cone_angle", 38.0)
    lc.set_editor_property("cast_shadows", False)
    lc.set_editor_property("max_draw_distance", 9000.0); lc.set_editor_property("max_distance_fade_range", 1500.0)
    s.tags = [unreal.Name("Kompleks"), unreal.Name("ChiroqSpot")]; s.set_editor_property("is_spatially_loaded", False)
print("tree lights", len(P["tree"]))

# 2. lit windows on the light blocks
m = unreal.load_asset("/Game/Blok1/Lite/M_GlassLite")
E = lambda cls, x, y: MEL.create_material_expression(m, cls, x, y)
def const(v, x, y):
    c = E(unreal.MaterialExpressionConstant, x, y); c.set_editor_property("r", v); return c
def op(cls, a, b, x, y, pa="A", pb="B"):
    o = E(cls, x, y); MEL.connect_material_expressions(a, "", o, pa); MEL.connect_material_expressions(b, "", o, pb); return o
old = MEL.get_material_property_input_node(m, unreal.MaterialProperty.MP_EMISSIVE_COLOR)
if old is None:
    wp = E(unreal.MaterialExpressionWorldPosition, -1600, 400)
    cell = E(unreal.MaterialExpressionConstant3Vector, -1600, 520); cell.set_editor_property("constant", unreal.LinearColor(140.0, 140.0, 300.0, 1))
    f = E(unreal.MaterialExpressionFloor, -1300, 450); MEL.connect_material_expressions(op(unreal.MaterialExpressionDivide, wp, cell, -1450, 450), "", f, "")
    k3 = E(unreal.MaterialExpressionConstant3Vector, -1300, 560); k3.set_editor_property("constant", unreal.LinearColor(12.9898, 78.233, 37.719, 1))
    d = op(unreal.MaterialExpressionDotProduct, f, k3, -1150, 480)
    sn = E(unreal.MaterialExpressionSine, -1000, 480); MEL.connect_material_expressions(d, "", sn, "")
    h = E(unreal.MaterialExpressionFrac, -700, 480); MEL.connect_material_expressions(op(unreal.MaterialExpressionMultiply, sn, const(43758.5453, -1000, 560), -850, 480), "", h, "")
    share = E(unreal.MaterialExpressionScalarParameter, -700, 600); share.set_editor_property("parameter_name", "LitShare"); share.set_editor_property("default_value", LIT_SHARE)
    # lit = saturate((h - (1 - share)) * 1000)
    thr = E(unreal.MaterialExpressionOneMinus, -550, 600); MEL.connect_material_expressions(share, "", thr, "")
    lit = E(unreal.MaterialExpressionSaturate, -250, 500)
    MEL.connect_material_expressions(op(unreal.MaterialExpressionMultiply, op(unreal.MaterialExpressionSubtract, h, thr, -400, 500), const(1000.0, -400, 600), -330, 500), "", lit, "")
    vh = E(unreal.MaterialExpressionFrac, -400, 700); MEL.connect_material_expressions(op(unreal.MaterialExpressionMultiply, h, const(17.0, -550, 720), -480, 700), "", vh, "")
    var = op(unreal.MaterialExpressionAdd, op(unreal.MaterialExpressionMultiply, vh, const(0.8, -330, 760), -250, 700), const(0.4, -250, 780), -150, 700)
    col = E(unreal.MaterialExpressionConstant3Vector, -250, 300); col.set_editor_property("constant", unreal.LinearColor(1.0, 0.72, 0.42, 1))
    nits = E(unreal.MaterialExpressionScalarParameter, -250, 380); nits.set_editor_property("parameter_name", "WindowNits"); nits.set_editor_property("default_value", WIN_NITS)
    on = E(unreal.MaterialExpressionCollectionParameter, -250, 850)
    on.set_editor_property("collection", unreal.load_asset("/Game/Blok1/Mat/MPC_Blok1")); on.set_editor_property("parameter_name", "LightOn")
    e = op(unreal.MaterialExpressionMultiply, op(unreal.MaterialExpressionMultiply, col, nits, -80, 320), op(unreal.MaterialExpressionMultiply, lit, var, -80, 560), 80, 400)
    e = op(unreal.MaterialExpressionMultiply, e, on, 220, 450)
    MEL.connect_material_property(e, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    MEL.recompile_material(m); print("glass lite: lit windows added")
else: print("glass lite: emissive already wired")

# 3. night colour
v = next(a for a in eas.get_all_level_actors() if a.get_actor_label() == "Kompleks_PPV_Tun")
s = v.get_editor_property("settings")
for k, val in (("white_temp", 5300.0), ("bloom_intensity", 0.9)):
    s.set_editor_property("override_" + k, True); s.set_editor_property(k, val)
v.set_editor_property("settings", s); print("night colour ok")
