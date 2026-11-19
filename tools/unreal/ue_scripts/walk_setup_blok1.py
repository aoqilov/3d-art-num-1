# Walkable block: entrance doors (BP_Blok1Door), two lifts (BP_Blok1Lift) with sliding landing doors, the walk start in
# the ground-floor hall and the game mode that spawns BP_Blok1Player. Reads tools/unreal/out/walk.json. Safe to re-run.
import json
import unreal

eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
O = unreal.Vector(1500.0, -1500.0, 2.0)
W = json.load(open(r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/out/walk.json"))
FULL = "/Game/Blok1/Full/blok1_full/StaticMeshes/"
wp = lambda x, y, z: unreal.Vector(O.x + x * 100.0, O.y + y * 100.0, O.z + z * 100.0)     # plan metres -> world

with unreal.ScopedEditorTransaction("Blok-1 yurish: eshik, lift"):
    for a in eas.get_all_level_actors():
        if a.get_actor_label().startswith(("Blok1_D_", "Blok1_Lift", "Blok1_WalkStart")):
            eas.destroy_actor(a)

    # ---- entrance doors
    door_cls = unreal.load_asset("/Game/Blok1/Walk/BP_Blok1Door").generated_class()
    nd = 0
    for st in range(2, 17):
        for d in W["doors"].get("F2" if st == 2 else "Typ", []):
            hx, hy = d["hinge"]
            closed = 0.0 if d["axis"] == "x" else 90.0
            opened = closed + (90.0 * d["swing"] if d["axis"] == "x" else -90.0 * d["swing"])
            loc = wp(hx, hy, (st - 1) * 3.0 + d["z"])
            a = eas.spawn_actor_from_class(door_cls, loc, unreal.Rotator(0, 0, closed))
            a.set_actor_label("Blok1_D_%02d_%d" % (st, nd)); a.set_folder_path("Blok1/Eshiklar")
            a.set_actor_scale3d(unreal.Vector(d["width"], 1.0, d["height"] / 2.32))
            a.set_editor_property("ClosedYaw", closed); a.set_editor_property("OpenYaw", opened)
            a.set_editor_property("tags", [unreal.Name("Blok1"), unreal.Name("S%d" % st)])
            nd += 1

    # ---- ground-floor entrances (courtyard hall, stair exit): glass leaves swinging out to the courtyard
    glass = unreal.load_asset(FULL + "Blok1_Kit_DoorGlass")
    gl = [(1, g) for g in W.get("gates", [])]
    for st in range(2, 17):                                 # public balcony (lift lobby <-> stair) on every storey
        gl += [(st, dict(g, z=(st - 1) * 3.0 + g["z"])) for g in W.get("pgates", {}).get("F2" if st == 2 else "Typ", [])]
    for st, g in gl:
        hx, hy = g["hinge"]
        out = -g["swing"]                                   # +1: swings towards +plan y (+world Y)
        closed = 0.0 if g["dir"] > 0 else 180.0
        opened = closed + 90.0 * out * g["dir"]
        a = eas.spawn_actor_from_class(door_cls, wp(hx, hy, g["z"]), unreal.Rotator(0, 0, closed))
        a.set_actor_label("Blok1_D_%02d_%d" % (st, nd)); a.set_folder_path("Blok1/Eshiklar")
        a.get_component_by_class(unreal.StaticMeshComponent).set_editor_property("static_mesh", glass)
        a.set_actor_scale3d(unreal.Vector(g["width"], 1.0, g["height"]))
        a.set_editor_property("ClosedYaw", closed); a.set_editor_property("OpenYaw", opened)
        a.set_editor_property("tags", [unreal.Name("Blok1"), unreal.Name("S%d" % st)])
        nd += 1

    # ---- flats' balcony doors: glazed leaves (black frame) swinging 90 degrees into the room, E opens / closes
    for st in range(2, 17):
        for g in W.get("balc", {}).get("F2" if st == 2 else "Typ", []):
            hx, hy = g["hinge"]
            a = eas.spawn_actor_from_class(door_cls, wp(hx, hy, (st - 1) * 3.0 + g["z"]), unreal.Rotator(0, 0, g["closed"]))
            a.set_actor_label("Blok1_D_%02d_%d" % (st, nd)); a.set_folder_path("Blok1/Eshiklar")
            a.get_component_by_class(unreal.StaticMeshComponent).set_editor_property("static_mesh", glass)
            a.set_actor_scale3d(unreal.Vector(g["width"], 1.0, g["height"]))
            a.set_editor_property("ClosedYaw", g["closed"]); a.set_editor_property("OpenYaw", g["opened"])
            a.set_editor_property("tags", [unreal.Name("Blok1"), unreal.Name("S%d" % st), unreal.Name("Balkon")])
            nd += 1

    # ---- lifts and their landing doors
    lift_cls = unreal.load_asset("/Game/Blok1/Walk/BP_Blok1Lift").generated_class()
    for sh, L in W["lifts"].items():
        a = eas.spawn_actor_from_class(lift_cls, O)
        a.set_actor_label("Blok1_Lift" + sh); a.set_folder_path("Blok1")
        cab = a.get_component_by_class(unreal.StaticMeshComponent)
        cab.set_editor_property("static_mesh", unreal.load_asset(FULL + "Blok1_Kit_LiftCab" + sh))
        x0, y0, x1, y1 = L["cab"]
        u0, u1 = L["door_y"]
        for k, v in (("Shaft", sh), ("OriginX", O.x), ("OriginY", O.y), ("BaseZ", O.z), ("DoorWidth", (u1 - u0) * 50.0 - 4.0),     # centre-opening pair: each leaf slides its own width into the wall
                     ("CabCX", O.x + (x0 + x1) * 50.0), ("CabCY", O.y + (y0 + y1) * 50.0), ("CabHX", (x1 - x0) * 50.0), ("CabHY", (y1 - y0) * 50.0)):
            a.set_editor_property(k, v)
        a.set_editor_property("tags", [unreal.Name("Blok1"), unreal.Name("Lift"), unreal.Name("LiftCtl" + sh)])
    nl = 0
    for a in eas.get_all_level_actors():
        lab = a.get_actor_label()
        if lab.startswith("Blok1_Q") and "_LiftDoor" in lab:
            st = int(lab[7:9]); sh = "B" if "_LiftDoorB" in lab else "A"
            a.static_mesh_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
            tags = [str(t) for t in a.tags] + ["LD%s%d" % (sh, st), "Lift" + sh] + (["LDPos"] if lab.endswith("R") else [])   # LDPos: right leaf, slides to +y
            a.set_editor_property("tags", [unreal.Name(t) for t in dict.fromkeys(tags)])
            nl += 1
        elif lab.startswith("Blok1_Q") and ("_LiftBtn" in lab or "_LiftPlate" in lab):
            # call button + its plate: E on either calls that lift (player graph: tag Lift<sh>); the lift lights LB<sh><st>
            st = int(lab[7:9]); sh = lab[-1]
            tags = [str(t) for t in a.tags] + ["Lift" + sh] + (["LB%s%d" % (sh, st)] if "_LiftBtn" in lab else [])
            a.set_editor_property("tags", [unreal.Name(t) for t in dict.fromkeys(tags)])
            if "_LiftBtn" in lab: a.static_mesh_component.set_material(0, unreal.load_asset("/Game/Blok1/Mat/MI_LiftBtnOff"))

    # ---- E targets: everything the player can use gets U<storey> (BP_Blok1Player FindUse looks only at its storey)
    for a in eas.get_all_level_actors():
        lab = a.get_actor_label(); st = 0
        if lab.startswith("Blok1_D_"): st = int(lab[8:10])
        elif lab.startswith("Blok1_Q") and any(k in lab for k in ("_LiftDoor", "_LiftBtn", "_LiftPlate")): st = int(lab[7:9])
        if st:
            a.set_editor_property("tags", [unreal.Name(t) for t in dict.fromkeys([str(t) for t in a.tags] + ["U%d" % st])])

    # ---- walk start: ground-floor hall in front of the lifts, facing them
    ws = eas.spawn_actor_from_class(unreal.TargetPoint, wp(15.9, 13.0, 0.2 + 0.9), unreal.Rotator(0, 0, 180.0))
    ws.set_actor_label("Blok1_WalkStart"); ws.set_folder_path("Blok1")
    ws.set_editor_property("tags", [unreal.Name("Blok1"), unreal.Name("WalkStart")])

# ---- game mode: spawn the walking player
gm_path = "/Game/Blok1/Player/BP_Blok1GameMode"
if not unreal.EditorAssetLibrary.does_asset_exist(gm_path):
    f = unreal.BlueprintFactory(); f.set_editor_property("parent_class", unreal.GameModeBase)
    unreal.AssetToolsHelpers.get_asset_tools().create_asset("BP_Blok1GameMode", "/Game/Blok1/Player", unreal.Blueprint, f)
gm = unreal.load_asset(gm_path)
gcdo = unreal.get_default_object(gm.generated_class())
gcdo.set_editor_property("default_pawn_class", unreal.load_asset("/Game/Blok1/Player/BP_Blok1Player").generated_class())
unreal.BlueprintEditorLibrary.compile_blueprint(gm)
ws_ = unreal.EditorLevelLibrary.get_editor_world().get_world_settings()
ws_.set_editor_property("default_game_mode", gm.generated_class())
print("walk setup: doors", nd, "landing doors", nl, "lifts", len(W["lifts"]))

# one building in an Open World map: World Partition must not stream its pieces in and out (storeys vanished while
# turning the camera) -> every Blok1 actor is always loaded
with unreal.ScopedEditorTransaction("Blok-1 doim yuklangan"):
    n_sl = 0
    for a in eas.get_all_level_actors():
        if a.get_actor_label().startswith("Blok1") and a.get_editor_property("is_spatially_loaded"):
            a.set_editor_property("is_spatially_loaded", False); n_sl += 1
print("always loaded:", n_sl)
