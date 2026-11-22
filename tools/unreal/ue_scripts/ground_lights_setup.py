# Night ground lighting (owner 2026-11-22): out/ground_lights.json (tools/unreal/ground_lights_layout.py)
#   spots         SpotLight pointing straight down under the facades at 3 m: light the walk, graze only the ground floor
#                 (tag "ChiroqSpot": WBP_Blok1Time dims them with the night like the "Chiroq" point lights)
#   bollards_new  more bollards (same mesh as Kompleks_Props_prop_bollard) with a point light each (tag "Chiroq")
#   bollards      the existing courtyard-door bollard lights (Kompleks_L_*) get the same light as the new ones
# Physical units (sun 120000 lux). Safe to re-run.
import unreal, json
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
L = json.load(open(ROOT + "/out/ground_lights.json"))
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
SDS = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem); BFL = unreal.SubobjectDataBlueprintFunctionLibrary
SPOT_LM, BOLL_LM, BOLL_R, TEMP = globals().get("SPOT_LM", 3500.0), globals().get("BOLL_LM", 3000.0), 1000.0, 3800.0

for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith(("Kompleks_GLS_", "Kompleks_GLB_", "Kompleks_Props_bollard_yer")): eas.destroy_actor(a)

def point(lbl, loc, lm, r, tags):
    pl = eas.spawn_actor_from_class(unreal.PointLight, loc)
    pl.set_actor_label(lbl); pl.set_folder_path("Kompleks/YerChiroq")
    lc = pl.get_component_by_class(unreal.PointLightComponent); style(lc, lm, r)
    pl.tags = [unreal.Name(t) for t in tags]; pl.set_editor_property("is_spatially_loaded", False)
def style(lc, lm, r):
    lc.set_editor_property("intensity_units", unreal.LightUnits.LUMENS); lc.set_editor_property("intensity", lm)
    lc.set_editor_property("use_temperature", True); lc.set_editor_property("temperature", TEMP)
    lc.set_editor_property("attenuation_radius", r); lc.set_editor_property("source_radius", 8.0)
    lc.set_editor_property("cast_shadows", False)
    lc.set_editor_property("max_draw_distance", 9000.0); lc.set_editor_property("max_distance_fade_range", 1500.0)

for k, (x, y, z) in enumerate(L["spots"]):
    s = eas.spawn_actor_from_class(unreal.SpotLight, unreal.Vector(x, y, z), unreal.Rotator(roll=0.0, pitch=-90.0, yaw=0.0))
    s.set_actor_label("Kompleks_GLS_%d" % k); s.set_folder_path("Kompleks/YerChiroq")
    lc = s.get_component_by_class(unreal.SpotLightComponent); style(lc, SPOT_LM, 1000.0)
    lc.set_editor_property("inner_cone_angle", 35.0); lc.set_editor_property("outer_cone_angle", 70.0)
    s.tags = [unreal.Name("Kompleks"), unreal.Name("ChiroqSpot")]; s.set_editor_property("is_spatially_loaded", False)

mesh = None
for a in eas.get_all_level_actors():
    if a.get_actor_label() == "Kompleks_Props_prop_bollard":
        mesh = a.get_component_by_class(unreal.HierarchicalInstancedStaticMeshComponent).get_editor_property("static_mesh")
act = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0))
act.set_actor_label("Kompleks_Props_bollard_yer"); act.set_folder_path("Kompleks/Props")
act.tags = [unreal.Name("Kompleks"), unreal.Name("Props")]; act.set_editor_property("is_spatially_loaded", False)
h, _ = SDS.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=SDS.k2_gather_subobject_data_for_instance(act)[0], new_class=unreal.HierarchicalInstancedStaticMeshComponent))
comp = BFL.get_object(BFL.get_data(h)); comp.set_editor_property("static_mesh", mesh)
comp.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS)
for k, (x, y, z) in enumerate(L["bollards_new"]):
    comp.add_instance(unreal.Transform(location=unreal.Vector(x, y, z)), True)
    point("Kompleks_GLB_%d" % k, unreal.Vector(x, y, z + 62.0), BOLL_LM, BOLL_R, ["Kompleks", "Chiroq"])
n_old = 0
for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith("Kompleks_L_") and isinstance(a, unreal.PointLight):
        style(a.get_component_by_class(unreal.PointLightComponent), BOLL_LM, BOLL_R); n_old += 1
print("ground lights ok: spots", len(L["spots"]), "new bollards", len(L["bollards_new"]), "old bollard lights", n_old)
