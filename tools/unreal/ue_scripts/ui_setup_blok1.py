# Level setup for the on-screen buttons (WBP_Blok1UI, logic inside WBP_Blok1Btn): run after import_blok1.py (safe to re-run).
#   tags: storeys "S1".."S16", facade pieces "Fasad" (hidden while a floor is cut open), "Blok1" on all
#   cameras: Cam0 street, Cam1 courtyard, Cam2 aerial, Cam3 inside the 40.84 m2 flat on storey 5
#   BP_Blok1Ctl in the level (creates the UI on Play); PlayerStart moved to the street in front of the portal.
import math
import unreal

eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
O = unreal.Vector(1500.0, -1500.0, 2.0)                       # block origin (import_blok1.py SPOT)
P = lambda x, y, z: unreal.Vector(O.x + x * 100, O.y + y * 100, O.z + z * 100)   # plan metres -> world

def look(frm, to):
    d = to - frm
    return unreal.Rotator(roll=0.0, pitch=math.degrees(math.atan2(d.z, math.hypot(d.x, d.y))), yaw=math.degrees(math.atan2(d.y, d.x)))

with unreal.ScopedEditorTransaction("Blok-1 tugmalar uchun sozlash"):
    for a in eas.get_all_level_actors():
        lab = a.get_actor_label()
        if not lab.startswith("Blok1_"):
            continue
        tags = [unreal.Name("Blok1")]
        if lab.startswith("Blok1_Q"):
            tags.append(unreal.Name("S%d" % int(lab[7:9])))
        elif lab.startswith(("Blok1_Fac_", "Blok1_Signs")):
            tags.append(unreal.Name("Fasad"))
        # interior modes: design finishes (FloorsD / DecorD, later furniture) vs handover screed (FloorsH); design shows first
        if lab.endswith(("_FloorsD", "_DecorD", "_FurnD")):
            tags.append(unreal.Name("Dizayn"))
        if lab.endswith("_FloorsH"):
            tags.append(unreal.Name("Topshirish"))
            a.set_actor_hidden_in_game(True)
            a.set_is_temporarily_hidden_in_editor(True)
        a.set_editor_property("tags", tags)
    # 2026-11-22: FloorsD and FloorsH share one plane. "Temporarily hidden in editor" is not saved, so after an editor
    # restart both showed and z-fought (owner: floor flickering wood <-> screed). The screed sits 5 mm under the design floor
    # (relative to FloorsD of the same storey, so re-running gives the same result); the game shows only one of them anyway.
    acts = {a.get_actor_label(): a for a in eas.get_all_level_actors()}
    for lab, h in acts.items():
        d = acts.get(lab[:-len("_FloorsH")] + "_FloorsD") if lab.endswith("_FloorsH") else None
        if d:
            p = d.get_actor_location(); h.set_actor_location(unreal.Vector(p.x, p.y, p.z - 0.5), False, False)

    cams = [
        ("Cam0", P(9.0, -37.0, 4.5), P(14.85, 0, 15.0)),            # street
        ("Cam1", P(21.0, 47.0, 6.0), P(14.85, 18.0, 15.0)),         # courtyard
        ("Cam2", P(-35.0, -45.0, 75.0), P(14.85, 9.0, 24.0)),       # aerial
        ("Cam3", P(16.9, 7.3, 12.0 + 0.2 + 1.55), P(13.4, 1.6, 12.0 + 0.2 + 1.2)),  # storey 5, 40.84 m2 flat: hall -> kitchen / balcony
    ]
    for name, frm, to in cams:
        cam = next((a for a in eas.get_all_level_actors() if a.get_actor_label() == "Blok1_" + name), None)
        if not cam:
            cam = eas.spawn_actor_from_class(unreal.CameraActor, frm, look(frm, to))
            cam.set_actor_label("Blok1_" + name)
            cam.set_folder_path("Blok1/Kameralar")
        cam.set_actor_location_and_rotation(frm, look(frm, to), False, False)
        cam.set_editor_property("tags", [unreal.Name("Blok1"), unreal.Name(name)])
        cc = cam.get_component_by_class(unreal.CameraComponent)
        cc.set_editor_property("field_of_view", 70.0 if name != "Cam3" else 85.0)
        cc.set_editor_property("constrain_aspect_ratio", False)

    ctl = next((a for a in eas.get_all_level_actors() if a.get_actor_label() == "Blok1_Ctl"), None)
    if not ctl:
        cls = unreal.load_asset("/Game/Blok1/UI/BP_Blok1Ctl").generated_class()
        ctl = eas.spawn_actor_from_class(cls, P(14.85, -8.0, 0.5))
        ctl.set_actor_label("Blok1_Ctl")
        ctl.set_folder_path("Blok1")
    # ceiling lights from the Blender build (tools/unreal/out/lights.json): warm 3000 K point lights, no shadows, small reach
    import json, os
    LJ = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/out/lights.json"
    for a in eas.get_all_level_actors():
        if a.get_actor_label().startswith("Blok1_L_"):
            eas.destroy_actor(a)
    if os.path.exists(LJ):
        L = json.load(open(LJ))
        n_l = 0
        for st in range(1, 17):
            key = "F1" if st == 1 else "F2" if st == 2 else "Typ"
            for (bx, by, bz, kind, area) in L.get(key, []):
                loc = unreal.Vector(O.x + bx * 100, O.y - by * 100, O.z + (st - 1) * 300 + bz * 100)
                pl = eas.spawn_actor_from_class(unreal.PointLight, loc)
                pl.set_actor_label("Blok1_L_%02d_%d" % (st, n_l)); pl.set_folder_path("Blok1/Chiroqlar")
                lc = pl.get_component_by_class(unreal.PointLightComponent)
                lc.set_editor_property("intensity_units", unreal.LightUnits.LUMENS)
                lc.set_editor_property("intensity", 1100.0 if kind != "public" else 800.0)  # 2026-11-22 physical units: sun 120000 lux, local lights and emissives x100 (were scene scale, sun 6 lux)
                lc.set_editor_property("use_temperature", True); lc.set_editor_property("temperature", 4000.0 if kind != "public" else 5200.0)
                flat = kind not in ("public", "shop")
                lc.set_editor_property("attenuation_radius", (380.0 if area < 9 else 480.0) if not flat else (420.0 if area < 9 else 560.0))
                lc.set_editor_property("source_radius", 6.0 if not flat else 30.0)          # flats: broad soft light (owner reference)
                lc.set_editor_property("cast_shadows", False)
                # 2026-11-22: was 35 m with an 8 m fade -> lights switched off and on while walking (owner: flicker).
                # 50 m with a 25 m fade dims them gradually; 100 m cost ~8.5 ms/frame (RTX 4060 laptop) for no visible gain.
                lc.set_editor_property("max_draw_distance", 5000.0); lc.set_editor_property("max_distance_fade_range", 2500.0)
                # (after this script: complex_fixes_c.py turns ~35 % of the flats dark for the night look)
                # all block-1 lights carry "ChiroqIch": the time bar keeps them at 60 % by day (2026-11-22: corridors, stairs and
                # shops too, they were dark by day; in physical units a lit room does not glow through the glass in sunlight)
                pl.set_editor_property("tags", [unreal.Name("Blok1"), unreal.Name("S%d" % st), unreal.Name("ChiroqIch")])
                n_l += 1
        print("lights", n_l)

    ps = next((a for a in eas.get_all_level_actors() if a.get_class().get_name() == "PlayerStart"), None)
    if ps:
        frm = P(14.85, -14.0, 1.0)
        ps.set_actor_location_and_rotation(frm, unreal.Rotator(0, 0, 90.0), False, False)   # facing the portal (+Y)
print("ui setup ok")
