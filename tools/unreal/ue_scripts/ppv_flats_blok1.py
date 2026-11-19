import unreal
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
O = (1500.0, -1500.0, 2.0)
for a in eas.get_all_level_actors():
    if a.get_actor_label() == "Blok1_PPV_Xonalar": eas.destroy_actor(a)
x0, y0, x1, y1 = 0.15, 0.15, 29.55, 17.9                     # block interior, storeys 2-16
v = eas.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(O[0] + (x0 + x1) * 50, O[1] + (y0 + y1) * 50, O[2] + 300 + 15 * 150))
v.set_actor_label("Blok1_PPV_Xonalar"); v.set_folder_path("Blok1")
v.set_editor_property("unbound", False)
v.set_actor_scale3d(unreal.Vector((x1 - x0) * 0.5, (y1 - y0) * 0.5, 15 * 1.5))
v.set_editor_property("blend_radius", 40.0); v.set_editor_property("priority", 0.5)
s = v.get_editor_property("settings")
s.set_editor_property("override_white_temp", True); s.set_editor_property("white_temp", 5600.0)        # soft warm-neutral
s.set_editor_property("override_auto_exposure_bias", True); s.set_editor_property("auto_exposure_bias", 1.0)
s.set_editor_property("override_color_saturation", True); s.set_editor_property("color_saturation", unreal.Vector4(0.86, 0.86, 0.86, 1.0))
for k in ("lumen_scene_detail", "lumen_final_gather_quality", "lumen_scene_lighting_quality"):   # defaults (quality 2 was too slow)
    try: s.set_editor_property("override_" + k, False)
    except Exception: pass
v.set_editor_property("settings", s)
print("ppv flats ok")
