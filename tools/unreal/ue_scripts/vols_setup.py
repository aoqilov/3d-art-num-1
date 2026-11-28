# "Shaxmatka" in Unreal: status-coloured flat volumes for every type-4 block (web: src/block/aptVolumes.ts).
# Imports out/vols.glb (tools/unreal/build_vols.py), makes the M_Vol* materials and places, for each type-4 block, one actor per
# flat plus the pale "rest" mass and the shop floor. Everything starts hidden with collision off; WBP_Block (Kvartiralar) shows
# the volumes of the open block and paints them. Actor tags: Vol, VB<block>, VA<flat index in sales.json apts> (flats) / VRest, VShop.
#   exec(open(r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/ue_scripts/vols_setup.py", encoding="utf-8").read())
import unreal, json, math

ROOT = "C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
SRC = ROOT + "/out/vols.glb"
SALES = ROOT + "/out/sales.json"
DST = "/Game/Blok1/Vol"
FLOOR_H = 300.0
exec(open(ROOT + "/ue_scripts/kompleks_coords.py", encoding="utf-8").read())      # block_ue(id), TYPE4

# ---- import
if globals().get("REIMPORT", True):
    task = unreal.AssetImportTask()
    task.filename = SRC; task.destination_path = DST; task.automated = True; task.replace_existing = True; task.save = False
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    print("imported:", len(task.imported_object_paths))
reg = unreal.AssetRegistryHelpers.get_asset_registry()
meshes = {a.get_asset().get_name(): a.get_asset() for a in reg.get_assets_by_path(DST, recursive=True) if a.asset_class_path.asset_name == "StaticMesh"}
print("meshes:", sorted(meshes))

for n, m in meshes.items():                          # a bad import made the editor hang once: stop before touching anything
    e = m.get_bounds().box_extent
    if not (0 < e.x < 1e5 and 0 < e.y < 1e5 and 0 < e.z < 1e5):
        raise RuntimeError("bad mesh after import: %s %s" % (n, e))
sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
for n, m in meshes.items():
    s = sms.get_nanite_settings(m)
    if s.enabled:
        s.enabled = False
        sms.set_nanite_settings(m, s, apply_changes=True)
    if n.startswith("Vol_A"):                       # flats are picked with a cursor trace -> triangle collision
        bs = m.get_editor_property("body_setup")
        bs.set_editor_property("collision_trace_flag", unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
        m.set_editor_property("body_setup", bs)

# ---- materials
def lin(c): return ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
def rgb(h, k=1.0):
    n = int(h.lstrip("#"), 16)
    return unreal.LinearColor(lin(((n >> 16) & 255) / 255) * k, lin(((n >> 8) & 255) / 255) * k, lin((n & 255) / 255) * k, 1.0)
lib = unreal.MaterialEditingLibrary
def make_mat(name, base, opacity=1.0, emissive=None, rough=0.5):
    path = DST + "/" + name
    if unreal.EditorAssetLibrary.does_asset_exist(path): return unreal.load_asset(path)
    m = unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, DST, unreal.Material, unreal.MaterialFactoryNew())
    c = lib.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -500, 0)
    c.set_editor_property("constant", base); lib.connect_material_property(c, "", unreal.MaterialProperty.MP_BASE_COLOR)
    r = lib.create_material_expression(m, unreal.MaterialExpressionConstant, -500, 200)
    r.set_editor_property("r", rough); lib.connect_material_property(r, "", unreal.MaterialProperty.MP_ROUGHNESS)
    if emissive is not None:
        e = lib.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -500, 400)
        e.set_editor_property("constant", emissive); lib.connect_material_property(e, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    if opacity < 1.0:
        m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
        o = lib.create_material_expression(m, unreal.MaterialExpressionConstant, -500, 600)
        o.set_editor_property("r", opacity); lib.connect_material_property(o, "", unreal.MaterialProperty.MP_OPACITY)
    lib.recompile_material(m)
    unreal.EditorAssetLibrary.save_loaded_asset(m, False)
    return m

COL = {"free": "#4fbf7f", "res": "#e8b04b", "sold": "#e0675f"}
EM = float(globals().get("EMISSIVE_K", 6.0))        # emissive needs a large factor under the project's daylight exposure
mats = {}
for k, h in COL.items():
    mats["M_Vol_" + k] = make_mat("M_Vol_" + k, rgb(h), rough=0.45)
    mats["M_Vol_" + k + "_Hot"] = make_mat("M_Vol_" + k + "_Hot", rgb(h), emissive=rgb(h, EM * 0.45), rough=0.4)
mats["M_Vol_Sel"] = make_mat("M_Vol_Sel", rgb("#e9b949"), emissive=rgb("#c98a1c", EM * 0.55), rough=0.35)
mats["M_Vol_Dim"] = make_mat("M_Vol_Dim", rgb("#c9d3ce"), opacity=0.16, rough=0.6)
mats["M_Vol_Rest"] = make_mat("M_Vol_Rest", rgb("#eef2ef"), opacity=0.22, rough=0.7)
mats["M_Vol_Shop"] = make_mat("M_Vol_Shop", rgb("#e2c785"), opacity=0.35, rough=0.6)
print("materials:", sorted(mats))

# ---- place
D = json.load(open(SALES, encoding="utf-8"))
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
with unreal.ScopedEditorTransaction("Shaxmatka hajmlari"):
    for a in eas.get_all_level_actors():
        if a.get_actor_label().startswith("Vol_B"):
            eas.destroy_actor(a)
    n = 0
    def put(mesh, mat, loc, yaw, label, tags):
        global n
        a = eas.spawn_actor_from_object(mesh, loc, unreal.Rotator(roll=0.0, pitch=0.0, yaw=yaw))   # (roll, pitch, yaw)!
        if a is None: raise RuntimeError("spawn failed: " + label)
        a.set_actor_label(label)
        a.set_editor_property("tags", [unreal.Name(t) for t in tags])
        a.set_folder_path("Shaxmatka")
        c = a.static_mesh_component
        c.set_material(0, mat)
        c.set_cast_shadow(mat is not mats["M_Vol_Dim"] and mat is not mats["M_Vol_Rest"] and mat is not mats["M_Vol_Shop"])
        a.set_actor_hidden_in_game(True)
        a.set_actor_enable_collision(False)
        n += 1
    for bid in TYPE4:
        x0, y0, yaw, sx, sy = block_ue(bid)
        base = unreal.Vector(x0, y0, 2.0)
        put(meshes["Vol_Rest"], mats["M_Vol_Rest"], base, yaw, "Vol_B%d_Rest" % bid, ["Vol", "VB%d" % bid, "VRest"])
        put(meshes["Vol_Shop"], mats["M_Vol_Shop"], base, yaw, "Vol_B%d_Shop" % bid, ["Vol", "VB%d" % bid, "VShop"])
        for ix, ap in enumerate(D["apts"]):
            if ap["block"] != bid or ap["index"] < 0: continue
            f = ap["floor"]
            mesh = meshes["Vol_A%d_%d" % (2 if f == 2 else 3, ap["index"])]
            loc = unreal.Vector(x0, y0, 2.0 + (f - 1) * FLOOR_H)
            put(mesh, mats["M_Vol_Dim"], loc, yaw, "Vol_B%d_S%d_%d" % (bid, f, ap["index"]), ["Vol", "VB%d" % bid, "VA%d" % ix])
    print("placed actors:", n)
print("save assets:", unreal.EditorAssetLibrary.save_directory(DST, only_if_is_dirty=False, recursive=True))
print("save level:", unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True))
