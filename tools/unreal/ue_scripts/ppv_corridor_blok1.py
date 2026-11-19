import unreal
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
O = (1500.0, -1500.0, 2.0)
for a in eas.get_all_level_actors():
    if a.get_actor_label() == "Blok1_PPV_Yolak": eas.destroy_actor(a)
# public corridor strip of storeys 2-16 (plan x 6.4-23.4, y 7.7-9.8) + lift lobby (x 9.6-17, y 9.8-16)
for i, (x0, y0, x1, y1) in enumerate(((6.3, 7.65, 23.5, 9.85), (9.6, 9.85, 17.4, 16.2))):
    cx, cy = O[0] + (x0 + x1) * 50, O[1] + (y0 + y1) * 50
    v = eas.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(cx, cy, O[2] + 300 + 15 * 150))
    v.set_actor_label("Blok1_PPV_Yolak" if i == 0 else "Blok1_PPV_Yolak"); v.set_folder_path("Blok1")
    v.set_editor_property("unbound", False)
    v.set_actor_scale3d(unreal.Vector((x1 - x0) * 100 / 200, (y1 - y0) * 100 / 200, 15 * 300 / 200))   # brush is 200 cm cube
    v.set_editor_property("blend_radius", 30.0); v.set_editor_property("priority", 1.0)
    s = v.get_editor_property("settings")
    s.set_editor_property("override_white_temp", True); s.set_editor_property("white_temp", 5200.0)   # neutral-cool white walls
    s.set_editor_property("override_auto_exposure_bias", True); s.set_editor_property("auto_exposure_bias", 0.8)
    v.set_editor_property("settings", s)
print("ppv ok")
