# Blue-hour / night ambient (owner reference foto-reference/Screenshot_2.png, 2026-11-22): a second directional light
# "Kompleks_Shafaq" (atmosphere light #1) high in the sky. The sky atmosphere turns deep blue from it and the real-time
# sky light spreads that cool light over roofs, ground and trees, so the whole complex stays readable at night.
# WBP_Blok1Time sets its intensity = night weight x SHAFAQ_LUX (tag "Shafaq"); here it starts at 0. Safe to re-run.
import unreal
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
a = next((x for x in eas.get_all_level_actors() if x.get_actor_label() == "Kompleks_Shafaq"), None)
if not a:
    a = eas.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 3000), unreal.Rotator(roll=0.0, pitch=-38.0, yaw=135.0))
    a.set_actor_label("Kompleks_Shafaq"); a.set_folder_path("Lighting")
a.set_actor_rotation(unreal.Rotator(roll=0.0, pitch=-38.0, yaw=135.0), False)
a.tags = [unreal.Name("Shafaq")]
c = a.get_component_by_class(unreal.DirectionalLightComponent)
c.set_mobility(unreal.ComponentMobility.MOVABLE)
for k, v in (("atmosphere_sun_light", True), ("atmosphere_sun_light_index", 1), ("intensity", 0.0), ("use_temperature", True),
             ("temperature", 9000.0), ("cast_shadows", True), ("light_source_angle", 35.0), ("specular_scale", 0.3)):
    try: c.set_editor_property(k, v)
    except Exception as e: print("skip", k, e)
print("twilight ok", a.get_actor_rotation())
