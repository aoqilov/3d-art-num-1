# B2 of QOLGAN_ISHLAR.md: real facade texture on the city houses and mahalla walls. Rebuilds M_CX_Wall IN PLACE (never
# deleted: meshes use it — a delete opens a modal dialog and freezes the editor).
#   colour   UV sets 1 (r, g) + 2 (b) (build_urban.py); reddish colours (lin g / r < 0.62) become brick, the rest plaster
#   texture  world-aligned (WorldAlignedTexture, any wall direction): Megascans Plaster_Facade (luminance x colour) or
#            Beige_Brick_Facade (its own pattern x colour), 3 m tiles
#   windows  UV0 grid (u = 3.2 m bay, v = 3 m storey; u = 0 -> blank wall), ~25 % lit at night (MPC_Blok1.LightOn)
import unreal
MEL = unreal.MaterialEditingLibrary; EAL = unreal.EditorAssetLibrary
MPC = unreal.load_asset("/Game/Blok1/Mat/MPC_Blok1")
m = unreal.load_asset("/Game/Kompleks/Context/Mat/M_CX_Wall"); MEL.delete_all_material_expressions(m)
TEX = "/Game/Fab/Megascans/Surfaces/"
PLASTER = unreal.load_asset(TEX + "Plaster_Facade_udkgeabew/Medium/udkgeabew_tier_2/Textures/T_udkgeabew_2K_B")
BRICK = unreal.load_asset(TEX + "Beige_Brick_Facade_udejafqg/Medium/udejafqg_tier_2/Textures/T_udejafqg_2K_B")
WAT = unreal.load_asset("/Engine/Functions/Engine_MaterialFunctions01/Texturing/WorldAlignedTexture")
def E(cls, x, y): return MEL.create_material_expression(m, cls, x, y)
def K(v, x, y):
    c = E(unreal.MaterialExpressionConstant, x, y); c.set_editor_property("r", v); return c
def V3(rgb, x, y):
    c = E(unreal.MaterialExpressionConstant3Vector, x, y); c.set_editor_property("constant", unreal.LinearColor(*rgb, 1)); return c
def op(cls, a, b, x, y, pa="A", pb="B"):
    o = E(cls, x, y); MEL.connect_material_expressions(a, "", o, pa); MEL.connect_material_expressions(b, "", o, pb); return o
def one(cls, a, x, y):
    o = E(cls, x, y); MEL.connect_material_expressions(a, "", o, ""); return o
def mask(a, ch, x, y):
    o = E(unreal.MaterialExpressionComponentMask, x, y)
    for k in "rgba": o.set_editor_property(k, k == ch)
    MEL.connect_material_expressions(a, "", o, ""); return o
def band(f, lo, hi, x, y):
    a = one(unreal.MaterialExpressionSaturate, op(unreal.MaterialExpressionMultiply, op(unreal.MaterialExpressionSubtract, f, K(lo, x - 150, y + 40), x - 80, y), K(200.0, x - 80, y + 60), x, y), x + 60, y)
    b = one(unreal.MaterialExpressionSaturate, op(unreal.MaterialExpressionMultiply, op(unreal.MaterialExpressionSubtract, K(hi, x - 150, y + 140), f, x - 80, y + 100), K(200.0, x - 80, y + 160), x, y + 100), x + 60, y + 100)
    return op(unreal.MaterialExpressionMultiply, a, b, x + 140, y + 50)
def lerp(a, b, t, x, y):
    o = E(unreal.MaterialExpressionLinearInterpolate, x, y)
    MEL.connect_material_expressions(a, "", o, "A"); MEL.connect_material_expressions(b, "", o, "B"); MEL.connect_material_expressions(t, "", o, "Alpha"); return o
def world_tex(tex, size, x, y):
    t = E(unreal.MaterialExpressionTextureObject, x - 300, y); t.set_editor_property("texture", tex)
    f = E(unreal.MaterialExpressionMaterialFunctionCall, x, y); f.set_material_function(WAT)
    MEL.connect_material_expressions(t, "", f, "TextureObject")
    MEL.connect_material_expressions(E(unreal.MaterialExpressionWorldPosition, x - 300, y + 100), "", f, "TexturePosition")
    MEL.connect_material_expressions(V3((size, size, size), x - 300, y + 200), "", f, "TextureSize")
    return f

# colour from UV1 / UV2
t1 = E(unreal.MaterialExpressionTextureCoordinate, -2200, -400); t1.set_editor_property("coordinate_index", 1)
t2 = E(unreal.MaterialExpressionTextureCoordinate, -2200, -250); t2.set_editor_property("coordinate_index", 2)
r, g = mask(t1, "r", -2050, -450), one(unreal.MaterialExpressionOneMinus, mask(t1, "g", -2050, -380), -1950, -380)
vc = op(unreal.MaterialExpressionAppendVector, op(unreal.MaterialExpressionAppendVector, r, g, -1850, -420), mask(t2, "r", -2050, -250), -1750, -380)
brickness = one(unreal.MaterialExpressionSaturate, op(unreal.MaterialExpressionMultiply,
              op(unreal.MaterialExpressionSubtract, K(0.62, -1750, -200), op(unreal.MaterialExpressionDivide, g, op(unreal.MaterialExpressionMax, r, K(0.01, -1900, -150), -1800, -150), -1700, -250), -1600, -220),
              K(20.0, -1600, -140), -1500, -220), -1400, -220)
pl = world_tex(PLASTER, 300.0, -1600, 0); br = world_tex(BRICK, 300.0, -1600, 350)
lum = op(unreal.MaterialExpressionDotProduct, pl, V3((0.3, 0.59, 0.11), -1350, 80), -1250, 0)
plaster_c = op(unreal.MaterialExpressionMultiply, vc, op(unreal.MaterialExpressionMultiply, lum, K(1.8, -1200, 80), -1100, 20), -1000, -50)
brick_c = op(unreal.MaterialExpressionMultiply, br, op(unreal.MaterialExpressionMultiply, vc, K(2.2, -1200, 420), -1100, 380), -1000, 350)
wallc = lerp(plaster_c, brick_c, brickness, -850, 100)

# windows (UV0)
uv = E(unreal.MaterialExpressionTextureCoordinate, -2200, 700)
u, v = mask(uv, "r", -2050, 650), mask(uv, "g", -2050, 850)
fu, fv = one(unreal.MaterialExpressionFrac, u, -1900, 650), one(unreal.MaterialExpressionFrac, v, -1900, 850)
has = one(unreal.MaterialExpressionSaturate, op(unreal.MaterialExpressionMultiply, u, K(1000.0, -1900, 950), -1800, 950), -1700, 950)
win = op(unreal.MaterialExpressionMultiply, op(unreal.MaterialExpressionMultiply, band(fu, 0.22, 0.78, -1700, 600), band(fv, 0.3, 0.8, -1700, 800), -1400, 700), has, -1300, 750)
base = lerp(wallc, V3((0.035, 0.045, 0.06), -850, 300), win, -650, 150)
MEL.connect_material_property(base, "", unreal.MaterialProperty.MP_BASE_COLOR)
MEL.connect_material_property(lerp(K(0.88, -800, 450), K(0.12, -800, 520), win, -650, 450), "", unreal.MaterialProperty.MP_ROUGHNESS)
# night windows
cu, cv = one(unreal.MaterialExpressionFloor, u, -1900, 1100), one(unreal.MaterialExpressionFloor, v, -1900, 1200)
wc = one(unreal.MaterialExpressionFloor, op(unreal.MaterialExpressionDivide, E(unreal.MaterialExpressionWorldPosition, -2050, 1300), K(2000.0, -2050, 1400), -1900, 1300), -1800, 1300)
s = op(unreal.MaterialExpressionAdd, op(unreal.MaterialExpressionMultiply, cu, K(12.9898, -1750, 1100), -1650, 1100), op(unreal.MaterialExpressionMultiply, cv, K(78.233, -1750, 1200), -1650, 1200), -1550, 1150)
s = op(unreal.MaterialExpressionAdd, s, op(unreal.MaterialExpressionDotProduct, wc, V3((37.719, 4.581, 9.17), -1750, 1400), -1650, 1300), -1450, 1200)
h = one(unreal.MaterialExpressionFrac, op(unreal.MaterialExpressionMultiply, one(unreal.MaterialExpressionSine, s, -1350, 1200), K(43758.5453, -1350, 1300), -1250, 1200), -1150, 1200)
lit = one(unreal.MaterialExpressionSaturate, op(unreal.MaterialExpressionMultiply, op(unreal.MaterialExpressionSubtract, h, K(0.75, -1150, 1300), -1050, 1200), K(1000.0, -1050, 1300), -950, 1200), -850, 1200)
var = op(unreal.MaterialExpressionAdd, op(unreal.MaterialExpressionMultiply, one(unreal.MaterialExpressionFrac, op(unreal.MaterialExpressionMultiply, h, K(17.0, -1050, 1400), -950, 1400), -850, 1400), K(0.8, -850, 1450), -750, 1400), K(0.4, -750, 1450), -650, 1400)
nits = E(unreal.MaterialExpressionScalarParameter, -850, 1000); nits.set_editor_property("parameter_name", "WindowNits"); nits.set_editor_property("default_value", 60.0)
on = E(unreal.MaterialExpressionCollectionParameter, -650, 1500); on.set_editor_property("collection", MPC); on.set_editor_property("parameter_name", "LightOn")
e = op(unreal.MaterialExpressionMultiply, op(unreal.MaterialExpressionMultiply, V3((1.0, 0.72, 0.42), -700, 950), nits, -600, 980), op(unreal.MaterialExpressionMultiply, lit, var, -550, 1250), -450, 1050)
e = op(unreal.MaterialExpressionMultiply, op(unreal.MaterialExpressionMultiply, e, win, -350, 1100), on, -250, 1150)
MEL.connect_material_property(e, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
MEL.recompile_material(m); EAL.save_loaded_asset(m, False)
print("wall material rebuilt", MEL.get_num_material_expressions(m), "expressions")
