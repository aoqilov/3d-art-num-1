# Creates the walkable blueprints' assets and components (graphs are written separately through the BlueprintTools DSL):
#   BP_Blok1Door  (Actor)     : StaticMesh "Leaf" = Kit_DoorEntry
#   BP_Blok1Lift  (Actor)     : StaticMesh "Cab"  = Kit_LiftCabA (instance may swap to B)
#   BP_Blok1Player (Character): SpringArm "Arm" > Camera "Cam"; StaticMesh "Body" = figure (1.76 m, 46 cm shoulders)
import unreal

AT = unreal.AssetToolsHelpers.get_asset_tools()
SDS = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
BFL = unreal.SubobjectDataBlueprintFunctionLibrary
FULL = "/Game/Blok1/Full/blok1_full/StaticMeshes/"

def figure():
    p = "/Game/Blok1/Player/Blok1_Figure"
    if not unreal.EditorAssetLibrary.does_asset_exist(p):
        t = unreal.AssetImportTask()
        t.filename = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/out/figure.glb"
        t.destination_path = "/Game/Blok1/Player"; t.automated = True; t.replace_existing = True; t.save = False
        AT.import_asset_tasks([t])
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    for a in reg.get_assets_by_path("/Game/Blok1/Player", recursive=True):
        if str(a.asset_class_path.asset_name) == "StaticMesh":
            return a.get_asset()

def bp(name, folder, parent):
    path = folder + "/" + name
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return unreal.load_asset(path)
    f = unreal.BlueprintFactory(); f.set_editor_property("parent_class", parent)
    return AT.create_asset(name, folder, unreal.Blueprint, f)

def handles(b):
    return SDS.k2_gather_subobject_data_for_blueprint(b)

def comp(b, cls, name, parent_handle=None):
    hs = handles(b)
    for h in hs:
        d = BFL.get_data(h)
        if str(BFL.get_variable_name(d)) == name:
            return h, BFL.get_object(d)
    root = parent_handle or hs[0]
    p = unreal.AddNewSubobjectParams(parent_handle=root, new_class=cls, blueprint_context=b)
    h, fail = SDS.add_new_subobject(p)
    SDS.rename_subobject(h, unreal.Text(name))
    return h, BFL.get_object(BFL.get_data(h))

fig = figure()
print("figure", fig.get_name() if fig else None)

door = bp("BP_Blok1Door", "/Game/Blok1/Walk", unreal.Actor)
h, leaf = comp(door, unreal.StaticMeshComponent, "Leaf")
leaf.set_editor_property("static_mesh", unreal.load_asset(FULL + "Blok1_Kit_DoorEntry"))
leaf.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)

lift = bp("BP_Blok1Lift", "/Game/Blok1/Walk", unreal.Actor)
h, cab = comp(lift, unreal.StaticMeshComponent, "Cab")
cab.set_editor_property("static_mesh", unreal.load_asset(FULL + "Blok1_Kit_LiftCabA"))
cab.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)

pl = bp("BP_Blok1Player", "/Game/Blok1/Player", unreal.Character)
hs = handles(pl)
names = {str(BFL.get_variable_name(BFL.get_data(x))): x for x in hs}
cap = names["CapsuleComponent"]
ha, arm = comp(pl, unreal.SpringArmComponent, "Arm", cap)
arm.set_editor_property("relative_location", unreal.Vector(0, 0, 77))          # eyes 1.65 m above the feet
arm.set_editor_property("target_arm_length", 0.0)
arm.set_editor_property("use_pawn_control_rotation", True)
arm.set_editor_property("do_collision_test", True)
arm.set_editor_property("probe_size", 10.0)
arm.set_editor_property("enable_camera_lag", False)
hc, cam = comp(pl, unreal.CameraComponent, "Cam", ha)
cam.set_editor_property("field_of_view", 80.0)
hb, body = comp(pl, unreal.StaticMeshComponent, "Body", cap)
if fig: body.set_editor_property("static_mesh", fig)
body.set_editor_property("relative_location", unreal.Vector(0, 0, -88))
body.set_editor_property("owner_no_see", True)                                    # first person: shadow only
body.set_editor_property("cast_hidden_shadow", True)
body.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
cdo = unreal.get_default_object(pl.generated_class())
cdo.get_editor_property("capsule_component").set_editor_property("capsule_radius", 23.0)    # 46 cm shoulders
cdo.get_editor_property("capsule_component").set_editor_property("capsule_half_height", 88.0)
mv = cdo.get_editor_property("character_movement")
mv.set_editor_property("max_walk_speed", 150.0)
mv.set_editor_property("max_step_height", 30.0)
mv.set_editor_property("jump_z_velocity", 330.0)
cdo.set_editor_property("use_controller_rotation_yaw", True)
cdo.set_editor_property("auto_possess_player", unreal.AutoReceiveInput.DISABLED)
for b in (door, lift, pl):
    unreal.BlueprintEditorLibrary.compile_blueprint(b)
print("ok", [str(BFL.get_variable_name(BFL.get_data(x))) for x in handles(pl)])
