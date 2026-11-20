# Construction scene = the block-1 model as a grey concrete carcass under construction, on the complex position of
# block 1 (owner 2026-11-20; first version stood one building width east of the walkable block). Only the storey shells (walls, slabs, stairs) are placed: no facade, glass, frames, floors, doors or
# lights, so it is much lighter than block 1. Materials are set to raw concrete here, in the editor (no runtime material
# swaps). Tags: Blok2 + B2S<storey>; BP_Qurilish (label Blok2_Ctl) shows storeys 1..N, the crane (Blok2_Kran) follows N.
# Safe to re-run: removes the previous Blok2_* storey actors first.
import unreal
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
# 2026-11-20 (owner): the construction stands on the complex position of BLOCK 1 (web layout, kompleks_coords.py);
# the walkable finished block is web block 2. O = block-1 plan origin in UE, YAW = its rotation.
import os, math
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "kompleks_coords.py"), encoding="utf-8").read())
_bx, _by, YAW, _sx, _sy = block_ue(1)
O = unreal.Vector(_bx, _by, 2.0)
ROT = unreal.Rotator(roll=0.0, pitch=0.0, yaw=YAW)
def PL(px, py, z_cm):                           # block-1 plan point (metres) -> UE world
    c, s_ = math.cos(math.radians(YAW)), math.sin(math.radians(YAW))
    return unreal.Vector(O.x + (px * c - py * s_) * 100, O.y + (px * s_ + py * c) * 100, z_cm)
FULL = "/Game/Blok1/Full/blok1_full/StaticMeshes/"
CONC = unreal.load_asset("/Game/Blok1/Full/blok1_full/Materials/M_Concrete")
reg = unreal.AssetRegistryHelpers.get_asset_registry()
names = [str(a.asset_name) for a in reg.get_assets_by_path(FULL.rstrip("/"), recursive=False) if str(a.asset_class_path.asset_name) == "StaticMesh"]
def shells(prefix):
    return sorted(n for n in names if n.startswith("Blok1_" + prefix) and (n.endswith("_Shell") or "WallCut" in n))
SETS = {1: shells("F1_"), 2: shells("F2_"), 3: shells("Typ_")}

with unreal.ScopedEditorTransaction("Blok-2 karkas"):
    for a in eas.get_all_level_actors():
        if a.get_actor_label().startswith("Blok2_Q"):
            eas.destroy_actor(a)                # (netting segments are rebuilt below)
    n = 0
    for st in range(1, 17):
        for mn in SETS[1 if st == 1 else 2 if st == 2 else 3]:
            m = unreal.load_asset(FULL + mn)
            a = eas.spawn_actor_from_object(m, unreal.Vector(O.x, O.y, O.z + (st - 1) * 300), ROT)
            a.set_actor_label("Blok2_Q%02d_%s" % (st, mn.split("_", 2)[2]))
            a.set_folder_path("Blok2/Qavatlar")
            a.tags = [unreal.Name("Blok2"), unreal.Name("B2S%d" % st)]
            c = a.static_mesh_component
            for i in range(c.get_num_materials()):
                c.set_material(i, CONC)
            c.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
            a.set_actor_enable_collision(False)
            n += 1
    print("block 2 storey actors", n, {k: len(v) for k, v in SETS.items()})

    # "Pardozlash": one storey of scaffolding + green safety netting per storey (Kran_Net), hidden until the button
    NETM = unreal.load_asset("/Game/Blok1/Qurilish/crane/StaticMeshes/Kran_Net")
    for a in eas.get_all_level_actors():
        if a.get_actor_label().startswith("Blok2_Setka"):
            eas.destroy_actor(a)
    for st in range(1, 17):
        a = eas.spawn_actor_from_object(NETM, unreal.Vector(O.x, O.y, O.z + (st - 1) * 300), ROT)
        a.set_actor_label("Blok2_Setka_%02d" % st); a.set_folder_path("Blok2/Setka")
        a.tags = [unreal.Name("Blok2"), unreal.Name("Blok2Net"), unreal.Name("B2N%d" % st)]
        a.static_mesh_component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
        a.set_actor_enable_collision(False)
        a.set_actor_hidden_in_game(True)
    print("netting segments", 16)

    # the crane stands in front of the block: mid street facade, 7 m out (owner 2026-11-20); always visible in game
    for a in eas.get_all_level_actors():
        l = a.get_actor_label()
        if l in ("Blok1_Kran", "Blok2_Kran"):
            a.modify()                          # moved, not respawned: mark its World Partition package dirty
            a.set_actor_label("Blok2_Kran"); a.set_folder_path("Blok2")
            a.set_actor_location_and_rotation(PL(14.85, -7.0, 2.0), unreal.Rotator(roll=0.0, pitch=0.0, yaw=YAW + 90.0), False, False)   # in front of the street facade (owner), jib over the block
            a.set_actor_hidden_in_game(False)
            a.tags = [unreal.Name("Blok2"), unreal.Name("Kran")]
        if l in ("Blok1_Qurilish", "Blok2_Ctl"):
            a.modify()
            a.set_actor_label("Blok2_Ctl"); a.set_folder_path("Blok2")
            a.set_actor_location_and_rotation(PL(-5.0, -6.0, 2.0), ROT, False, False)
            a.tags = [unreal.Name("Blok2"), unreal.Name("Blok2Ctl")]
        if l == "Blok1_CamQ":                   # the block-1 construction camera is not used any more
            eas.destroy_actor(a)
# always loaded (like block 1): World Partition must not stream these from older packages in PIE
for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith("Blok2_"):
        a.modify(); a.set_editor_property("is_spatially_loaded", False)
print("blok2 setup ok")
