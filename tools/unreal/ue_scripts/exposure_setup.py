# 2026-11-22 physical lighting: sun 120000 lux (time bar), local lights / emissives in real units (x100 of the old scene
# scale). Exposure stays automatic (walking into a flat must adapt) but inside an EV100 range per time of day:
#   Blok1_PPV        unbound, priority 0: day range
#   Kompleks_PPV_Tun unbound, priority 1: night range; WBP_Blok1Time sets its blend weight from the sun elevation
# Safe to re-run. DAY / NIGHT ranges can be overridden from the caller (globals).
import unreal
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
DAY = globals().get("DAY", (6.0, 15.0))   # low end: walking into windowless corridors by day; NIGHT = globals().get("NIGHT", (1.0, 6.5))
def setup(v, rng, prio):
    v.set_editor_property("unbound", True); v.set_editor_property("priority", prio)
    s = v.get_editor_property("settings")
    for k, val in (("auto_exposure_method", unreal.AutoExposureMethod.AEM_HISTOGRAM), ("auto_exposure_bias", 0.0),
                   ("auto_exposure_min_brightness", rng[0]), ("auto_exposure_max_brightness", rng[1]),
                   ("auto_exposure_speed_up", 1.5), ("auto_exposure_speed_down", 1.5),
                   ("auto_exposure_apply_physical_camera_exposure", False)):
        s.set_editor_property("override_" + k, True); s.set_editor_property(k, val)
    v.set_editor_property("settings", s)
day = next(a for a in eas.get_all_level_actors() if a.get_actor_label() == "Blok1_PPV")
setup(day, DAY, 0.0)
night = next((a for a in eas.get_all_level_actors() if a.get_actor_label() == "Kompleks_PPV_Tun"), None)
if not night:
    night = eas.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 500))
    night.set_actor_label("Kompleks_PPV_Tun"); night.set_folder_path("Lighting")
night.tags = [unreal.Name("PPV_Tun")]
setup(night, NIGHT, 1.0)
night.set_editor_property("blend_weight", 0.0)
print("exposure ok", DAY, NIGHT)
