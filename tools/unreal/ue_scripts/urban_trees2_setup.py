# B7: mahalla street trees (out/urban_trees2.json, urban_trees2.py) as the Megaplants maple A / B,
# actors "Kompleks_UrbanStreetTree_A/B" (folder Kompleks/Shahar). Safe to re-run.
import unreal, json, zlib
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
SDS = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem); BFL = unreal.SubobjectDataBlueprintFunctionLibrary
T = json.load(open(ROOT + "/out/urban_trees2.json"))
for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith("Kompleks_UrbanStreetTree_"): eas.destroy_actor(a)
V = {"A": ("/Game/Megaplant_Library/Tree_Norway_Maple/Tree_Norway_Maple_Forest_01/Tree_Norway_Maple_Forest_01_A", 12.9),
     "B": ("/Game/Megaplant_Library/Tree_Norway_Maple/Tree_Norway_Maple_Forest_01/Tree_Norway_Maple_Forest_01_B", 15.3)}
comps = {}
for k, (p, _) in V.items():
    act = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0))
    act.set_actor_label("Kompleks_UrbanStreetTree_" + k); act.set_folder_path("Kompleks/Shahar")
    act.tags = [unreal.Name("Kompleks"), unreal.Name("Shahar")]; act.set_editor_property("is_spatially_loaded", False)
    h, _ = SDS.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=SDS.k2_gather_subobject_data_for_instance(act)[0], new_class=unreal.InstancedSkinnedMeshComponent))
    c = BFL.get_object(BFL.get_data(h)); c.set_skinned_asset_and_update(unreal.load_asset(p))
    c.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION); c.set_editor_property("cast_shadow", True); comps[k] = c
n = {"A": 0, "B": 0}
for x, y, z, ht in T:
    k = "A" if zlib.crc32(("%.1f,%.1f" % (x, y)).encode()) % 2 == 0 else "B"
    s = ht / V[k][1]; sxy = s * 1.15
    comps[k].add_instance(unreal.Transform(location=unreal.Vector(x * 100, y * 100, z * 100 - 10),
                                           rotation=unreal.Rotator(roll=0.0, pitch=0.0, yaw=float(zlib.crc32(("%.1f" % (x * 3 + y)).encode()) % 360)),
                                           scale=unreal.Vector(sxy, sxy, s)), 0)
    n[k] += 1
print("street trees", n)
