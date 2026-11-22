# C items of QOLGAN_ISHLAR.md (complex), 2026-11-22. Safe to re-run.
#  C2  block 1 at night: not every flat lit. ~DARK_SHARE of the flats (lights grouped by storey + 7.5 x 6 m cell) get
#      intensity 0; public lights (corridors, stairs, shops) and storeys 1, 2 and 5 (the "Ichkari" camera flat) stay on.
#      The time bar drives the colour, so a dark flat stays dark at any hour (by day the lit ones barely show anyway).
#  C3  the blue-hour light (Kompleks_Shafaq): softer shadows, source angle 12 -> SHAFAQ_ANGLE deg
#  C4  the big parking / driveway areas of the complex (genplan road polygons > 1000 m2) got dark middles at night:
#      slim lamps (prop_lamp2 + down spot, tag "ChiroqSpot") on an 18 m grid, 5 m inside the edges, clear of bollards
import unreal, json, math, zlib
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem); EAL = unreal.EditorAssetLibrary
SDS = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem); BFL = unreal.SubobjectDataBlueprintFunctionLibrary
DARK_SHARE, SHAFAQ_ANGLE = globals().get("DARK_SHARE", 0.35), globals().get("SHAFAQ_ANGLE", 35.0)
acts = eas.get_all_level_actors()

# C2
dark = lit = 0
for a in acts:
    l = a.get_actor_label()
    if not (isinstance(a, unreal.PointLight) and l.startswith("Blok1_L_")): continue
    c = a.get_component_by_class(unreal.PointLightComponent); st = int(l[8:10])
    if c.get_editor_property("intensity") < 900 and c.get_editor_property("intensity") > 0: continue      # public 800 lm
    p = a.get_actor_location(); key = "%d_%d_%d" % (st, int(p.x // 750), int(p.y // 600))
    off = st not in (1, 2, 5) and (zlib.crc32(key.encode()) & 0xffff) / 65535.0 < DARK_SHARE
    a.modify(); c.set_editor_property("intensity", 0.0 if off else 1100.0)
    dark += off; lit += (not off)
print("C2 flat lights dark", dark, "lit", lit)

# C3
for a in acts:
    if a.get_actor_label() == "Kompleks_Shafaq":
        c = a.get_component_by_class(unreal.DirectionalLightComponent); a.modify(); c.set_editor_property("light_source_angle", SHAFAQ_ANGLE)
        print("C3 shafaq source angle", c.get_editor_property("light_source_angle"))

# C4
exec(open(ROOT + "/ue_scripts/kompleks_coords.py", encoding="utf-8").read())
G = json.load(open(ROOT + "/out/genplan.json")); GL = json.load(open(ROOT + "/out/ground_lights.json"))
others = [(r[0], r[1]) for r in GL["bollards"] + GL["bollards_new"]]
def area(poly):
    return 0.5 * abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly))))
def inside(pt, poly):
    c = False; n = len(poly)
    for i in range(n):
        (ax, ay), (bx, by) = poly[i], poly[(i + 1) % n]
        if (ay > pt[1]) != (by > pt[1]) and pt[0] < (bx - ax) * (pt[1] - ay) / (by - ay) + ax: c = not c
    return c
def edge_d(pt, poly):
    best = 1e9
    for i in range(len(poly)):
        (ax, ay), (bx, by) = poly[i], poly[(i + 1) % len(poly)]; dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy or 1e-9
        t = max(0, min(1, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / L2)); best = min(best, math.hypot(ax + t * dx - pt[0], ay + t * dy - pt[1]))
    return best
spots = []
for p in G["road"]:
    ring = [p[0][k:k + 2] for k in range(0, len(p[0]), 2)]
    ue = [[v / 100.0 for v in web_to_ue(x, z)] for x, z in ring]            # Unreal metres
    ue_cm = [[v * 100 for v in q] for q in ue]
    if area(ue) < 1000: continue
    xs, ys = [q[0] for q in ue], [q[1] for q in ue]
    x = min(xs) + 3
    while x < max(xs):
        y = min(ys) + 3
        while y < max(ys):
            if inside((x, y), ue) and edge_d((x, y), ue) > 2.5 and all(math.hypot(x * 100 - o[0], y * 100 - o[1]) > 700 for o in others) and all(math.hypot(x - s_[0], y - s_[1]) > 14 for s_ in spots):
                spots.append((x, y))
            y += 8
        x += 8
for a in acts:
    if a.get_actor_label().startswith(("Kompleks_LotLamps", "Kompleks_LotLampL_")): eas.destroy_actor(a)
lamp = None
for pth in EAL.list_assets("/Game/Kompleks/Props/prop_lamp2", recursive=True):
    o = unreal.load_asset(pth)
    if isinstance(o, unreal.StaticMesh): lamp = o
act = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0))
act.set_actor_label("Kompleks_LotLamps"); act.set_folder_path("Kompleks/Chiroqlar")
act.tags = [unreal.Name("Kompleks")]; act.set_editor_property("is_spatially_loaded", False)
h, _ = SDS.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=SDS.k2_gather_subobject_data_for_instance(act)[0], new_class=unreal.HierarchicalInstancedStaticMeshComponent))
comp = BFL.get_object(BFL.get_data(h)); comp.set_editor_property("static_mesh", lamp); comp.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS)
Z = G["z"]["road"] * 100
for k, (x, y) in enumerate(spots):
    comp.add_instance(unreal.Transform(location=unreal.Vector(x * 100, y * 100, Z)), True)
    s = eas.spawn_actor_from_class(unreal.SpotLight, unreal.Vector(x * 100, y * 100, Z + 448.0), unreal.Rotator(roll=0.0, pitch=-90.0, yaw=0.0))
    s.set_actor_label("Kompleks_LotLampL_%d" % k); s.set_folder_path("Kompleks/Chiroqlar")
    c = s.get_component_by_class(unreal.SpotLightComponent)
    c.set_editor_property("intensity_units", unreal.LightUnits.LUMENS); c.set_editor_property("intensity", 4500.0)
    c.set_editor_property("use_temperature", True); c.set_editor_property("temperature", 4000.0)
    c.set_editor_property("attenuation_radius", 1800.0); c.set_editor_property("source_radius", 25.0)
    c.set_editor_property("inner_cone_angle", 45.0); c.set_editor_property("outer_cone_angle", 75.0); c.set_editor_property("cast_shadows", False)
    c.set_editor_property("max_draw_distance", 9000.0); c.set_editor_property("max_distance_fade_range", 1500.0)
    s.tags = [unreal.Name("Kompleks"), unreal.Name("ChiroqSpot")]; s.set_editor_property("is_spatially_loaded", False)
print("C4 lot lamps", len(spots))
