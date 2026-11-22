# Stages 4-5 of maps-urban/REJA.md: trees and street lamps of the real city around the complex.
#   trees  out/urban.json "trees" [x, y, z, height, crown] (Unreal metres; heights from the Meta canopy map x 1.4, 9..22 m,
#          owner: "use what we have, tall") -> the courtyard's Megaplants Norway maple A / B (Nanite skinned), one
#          InstancedSkinnedMesh actor per variant ("Kompleks_UrbanTree_A/B"), scaled to the height
#   lamps  out/urban_props.json (urban_props.py: both edges of every major road, every 32 m) -> the slim lamp prop_lamp2
#          (street_lamps_setup.py) as one HISM actor; a down spot (tag "ChiroqSpot", switched by the time bar) only within
#          LIGHT_R m of the complex, further ones only glow
# Safe to re-run.
import unreal, json, math, zlib
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
SDS = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem); BFL = unreal.SubobjectDataBlueprintFunctionLibrary
U = json.load(open(ROOT + "/out/urban.json")); PR = json.load(open(ROOT + "/out/urban_props.json"))
LIGHT_R = globals().get("LIGHT_R", 700.0)
for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith(("Kompleks_UrbanTree_", "Kompleks_UrbanLamps", "Kompleks_UrbanLampL_")): eas.destroy_actor(a)

def holder(label, cls, asset, skinned):
    act = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0))
    act.set_actor_label(label); act.set_folder_path("Kompleks/Shahar")
    act.tags = [unreal.Name("Kompleks"), unreal.Name("Shahar")]; act.set_editor_property("is_spatially_loaded", False)
    h, _ = SDS.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=SDS.k2_gather_subobject_data_for_instance(act)[0], new_class=cls))
    comp = BFL.get_object(BFL.get_data(h))
    if skinned: comp.set_skinned_asset_and_update(asset)
    else: comp.set_editor_property("static_mesh", asset)
    comp.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    comp.set_editor_property("cast_shadow", True)
    return comp

# ---- trees
V = {"A": ("/Game/Megaplant_Library/Tree_Norway_Maple/Tree_Norway_Maple_Forest_01/Tree_Norway_Maple_Forest_01_A", 12.9),
     "B": ("/Game/Megaplant_Library/Tree_Norway_Maple/Tree_Norway_Maple_Forest_01/Tree_Norway_Maple_Forest_01_B", 15.3)}
comps = {k: holder("Kompleks_UrbanTree_" + k, unreal.InstancedSkinnedMeshComponent, unreal.load_asset(p), True) for k, (p, _) in V.items()}
n = {"A": 0, "B": 0}
for x, y, z, ht, cr in U["trees"]:
    k = "A" if zlib.crc32(("%.1f,%.1f" % (x, y)).encode()) % 2 == 0 else "B"
    s = ht / V[k][1]; sxy = s * 1.1
    yaw = (zlib.crc32(("%.1f" % (x * 7 + y)).encode()) % 360)
    comps[k].add_instance(unreal.Transform(location=unreal.Vector(x * 100, y * 100, z * 100 - 10),
                                           rotation=unreal.Rotator(roll=0.0, pitch=0.0, yaw=float(yaw)), scale=unreal.Vector(sxy, sxy, s)), 0)
    n[k] += 1
print("trees", n)

# ---- lamps
lamp = unreal.load_asset("/Game/Kompleks/Props/prop_lamp2/StaticMeshes/prop_lamp2")
if lamp is None:
    for p in unreal.EditorAssetLibrary.list_assets("/Game/Kompleks/Props/prop_lamp2", recursive=True):
        a = unreal.load_asset(p)
        if isinstance(a, unreal.StaticMesh): lamp = a
lc_ = holder("Kompleks_UrbanLamps", unreal.HierarchicalInstancedStaticMeshComponent, lamp, False)
lit = 0
for k, (x, y, z) in enumerate(PR["lamps"]):
    lc_.add_instance(unreal.Transform(location=unreal.Vector(x * 100, y * 100, z * 100)), True)
    if math.hypot(x - 24.3, y + 8.3) < LIGHT_R:                     # the complex centre (Unreal metres, kompleks_shot.mjs)
        s = eas.spawn_actor_from_class(unreal.SpotLight, unreal.Vector(x * 100, y * 100, z * 100 + 448.0), unreal.Rotator(roll=0.0, pitch=-90.0, yaw=0.0))
        s.set_actor_label("Kompleks_UrbanLampL_%d" % k); s.set_folder_path("Kompleks/Shahar/Chiroq")
        c = s.get_component_by_class(unreal.SpotLightComponent)
        c.set_editor_property("intensity_units", unreal.LightUnits.LUMENS); c.set_editor_property("intensity", 4500.0)
        c.set_editor_property("use_temperature", True); c.set_editor_property("temperature", 4000.0)
        c.set_editor_property("attenuation_radius", 1800.0); c.set_editor_property("source_radius", 25.0)
        c.set_editor_property("inner_cone_angle", 45.0); c.set_editor_property("outer_cone_angle", 75.0)
        c.set_editor_property("cast_shadows", False)
        c.set_editor_property("max_draw_distance", 15000.0); c.set_editor_property("max_distance_fade_range", 3000.0)
        s.tags = [unreal.Name("Kompleks"), unreal.Name("ChiroqSpot")]; s.set_editor_property("is_spatially_loaded", False)
        lit += 1
print("lamps", len(PR["lamps"]), "with light", lit, "mesh", lamp.get_name() if lamp else None)
