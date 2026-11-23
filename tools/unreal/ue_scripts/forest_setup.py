# Forest variant of the surroundings (owner 2026-11-22), out/forest.json (forest_layout.py). Everything in folder
# Kompleks/Ormon, tag "Ormon"; atrof_switch.py shows either the city (Kompleks/Shahar) or this forest.
#   ground  the city terrain mesh again ("Kompleks_Ormon_Terrain", same relief + collision) with the lawn material
#   trees   Megaplants Norway maple A / B (Nanite skinned), 12..22 m
#   bushes  Megascans boxwood C / D and hydrangea A (static, Nanite) undergrowth
# Built hidden (the city stays the default); run atrof_switch.py MODE="ormon" to see it. Safe to re-run.
import unreal, json, zlib
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
SDS = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem); BFL = unreal.SubobjectDataBlueprintFunctionLibrary
F = json.load(open(ROOT + "/out/forest.json"))
for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith("Kompleks_Ormon_"): eas.destroy_actor(a)
TAGS = [unreal.Name("Kompleks"), unreal.Name("Ormon")]
def holder(label, cls, asset, skinned):
    act = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0))
    act.set_actor_label(label); act.set_folder_path("Kompleks/Ormon"); act.tags = TAGS; act.set_editor_property("is_spatially_loaded", False)
    h, _ = SDS.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=SDS.k2_gather_subobject_data_for_instance(act)[0], new_class=cls))
    c = BFL.get_object(BFL.get_data(h))
    if skinned: c.set_skinned_asset_and_update(asset)
    else: c.set_editor_property("static_mesh", asset)
    c.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION); c.set_editor_property("cast_shadow", True)
    return act, c
# ground
terrain = None
for a in eas.get_all_level_actors():
    if a.get_actor_label() == "Kompleks_Urban_Urban_Terrain": terrain = a.static_mesh_component.static_mesh
g = eas.spawn_actor_from_object(terrain, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
g.set_actor_label("Kompleks_Ormon_Terrain"); g.set_folder_path("Kompleks/Ormon"); g.tags = TAGS; g.set_editor_property("is_spatially_loaded", False)
g.static_mesh_component.set_material(0, unreal.load_asset("/Game/Kompleks/Mat/MI_GP_Soil"))
g.static_mesh_component.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS)
actors = [g]
# trees
MP = "/Game/Megaplant_Library/Tree_Norway_Maple/Tree_Norway_Maple_Forest_01/Tree_Norway_Maple_Forest_01_"
V = {"A": (MP + "A", 12.9), "B": (MP + "B", 15.3)}
tc = {}
for k, (p, _) in V.items():
    a, c = holder("Kompleks_Ormon_Tree_" + k, unreal.InstancedSkinnedMeshComponent, unreal.load_asset(p), True); tc[k] = c; actors.append(a)
for x, y, z, ht in F["trees"]:
    k = "A" if zlib.crc32(("%.1f,%.1f" % (x, y)).encode()) % 2 == 0 else "B"
    s = ht / V[k][1]; sxy = s * 1.6          # wider crowns: the "Forest" maple is slim
    tc[k].add_instance(unreal.Transform(location=unreal.Vector(x * 100, y * 100, z * 100 - 10),
                                        rotation=unreal.Rotator(roll=0.0, pitch=0.0, yaw=float(zlib.crc32(("%.1f" % (x * 5 + y)).encode()) % 360)),
                                        scale=unreal.Vector(sxy, sxy, s)), 0)
# bushes
B = ["/Game/Fab/Megascans/Plants/Boxwood_wfypfa3ha/Medium/wfypfa3ha_tier_2/StaticMeshes/SM_wfypfa3ha_VarC",
     "/Game/Fab/Megascans/Plants/Boxwood_wfypfa3ha/Medium/wfypfa3ha_tier_2/StaticMeshes/SM_wfypfa3ha_VarD",
     "/Game/Fab/Megascans/Plants/Bigleaf_Hydrangea_vgztealha/Medium/vgztealha_tier_2/StaticMeshes/SM_vgztealha_VarA"]
bc = []
for i, p in enumerate(B):
    a, c = holder("Kompleks_Ormon_Bush_%d" % i, unreal.HierarchicalInstancedStaticMeshComponent, unreal.load_asset(p), False); bc.append(c); actors.append(a)
for x, y, z, k in F["bushes"]:
    s = 1.6 + 1.2 * ((zlib.crc32(("%.1f,%.1f" % (x, y)).encode()) & 0xff) / 255.0)
    bc[k].add_instance(unreal.Transform(location=unreal.Vector(x * 100, y * 100, z * 100 - 5),
                                        rotation=unreal.Rotator(roll=0.0, pitch=0.0, yaw=float(zlib.crc32(("%.2f" % (x + y)).encode()) % 360)),
                                        scale=unreal.Vector(s, s, s)), True)
for a in actors:                                          # hidden until atrof_switch.py MODE="ormon"
    a.set_actor_hidden_in_game(True); a.set_is_temporarily_hidden_in_editor(True); a.set_actor_enable_collision(False)
print("forest ok: trees", len(F["trees"]), "bushes", len(F["bushes"]))
