# B6: street furniture of the city (tools/unreal/urban_street.py -> out/urban_street.json; models build_street_props.py)
#   svetofor  prop_svetofor (lenses glow: red / amber / green), HISM "Kompleks_UrbanSvetofor"
#   bekat     prop_bekat (glass = MI_Glass, sign glows), HISM "Kompleks_UrbanBekat"
#   mahalla   slim lamp prop_lamp2, HISM "Kompleks_UrbanMahallaLamps"; a down spot (tag "ChiroqSpot", time bar) only within
#             LIGHT_R m of the complex, the rest glow only
# The zebra mesh is imported by urban_extra_setup.py (SET urban_street_mesh). Safe to re-run (never deletes used materials).
import unreal, json, math
ROOT = r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal"
AT = unreal.AssetToolsHelpers.get_asset_tools(); EAL = unreal.EditorAssetLibrary; MEL = unreal.MaterialEditingLibrary
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem); sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
SDS = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem); BFL = unreal.SubobjectDataBlueprintFunctionLibrary
S = json.load(open(ROOT + "/out/urban_street.json")); LIGHT_R = globals().get("LIGHT_R", 350.0)
MD = "/Game/Kompleks/Urban/Mat"
def mat(name, rgb, rough=0.5, metal=0.0, glow=0.0):
    p = MD + "/" + name
    m = unreal.load_asset(p) if EAL.does_asset_exist(p) else AT.create_asset(name, MD, unreal.Material, unreal.MaterialFactoryNew())
    MEL.delete_all_material_expressions(m)
    c = MEL.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -400, 0); c.set_editor_property("constant", unreal.LinearColor(*rgb, 1))
    MEL.connect_material_property(c, "", unreal.MaterialProperty.MP_BASE_COLOR)
    r = MEL.create_material_expression(m, unreal.MaterialExpressionConstant, -400, 120); r.set_editor_property("r", rough)
    MEL.connect_material_property(r, "", unreal.MaterialProperty.MP_ROUGHNESS)
    if metal:
        k = MEL.create_material_expression(m, unreal.MaterialExpressionConstant, -400, 200); k.set_editor_property("r", metal)
        MEL.connect_material_property(k, "", unreal.MaterialProperty.MP_METALLIC)
    if glow:
        g = MEL.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -400, 300); g.set_editor_property("constant", unreal.LinearColor(rgb[0] * glow, rgb[1] * glow, rgb[2] * glow, 1))
        MEL.connect_material_property(g, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    MEL.recompile_material(m); EAL.save_loaded_asset(m, False); return m
M = {"M_TL_Pole": mat("M_TL_Pole", (0.25, 0.26, 0.27), 0.5, 0.7), "M_TL_Head": mat("M_TL_Head", (0.02, 0.02, 0.02), 0.4),
     "M_TL_Red": mat("M_TL_Red", (1.0, 0.04, 0.02), 0.3, 0, 400.0), "M_TL_Amber": mat("M_TL_Amber", (0.25, 0.12, 0.0), 0.3),
     "M_TL_Green": mat("M_TL_Green", (0.08, 0.12, 0.08), 0.3),
     "M_BS_Metal": mat("M_BS_Metal", (0.05, 0.055, 0.06), 0.4, 0.8), "M_BS_Glass": unreal.load_asset("/Game/Blok1/Mat/MI_Glass"),
     "M_BS_Wood": mat("M_BS_Wood", (0.35, 0.2, 0.1), 0.7), "M_BS_Sign": mat("M_BS_Sign", (0.05, 0.25, 0.7), 0.4, 0, 60.0)}

def imp(name):
    D = "/Game/Kompleks/Props/" + name
    if EAL.does_directory_exist(D):
        for p in EAL.list_assets(D, recursive=True):
            a = unreal.load_asset(p)
            if isinstance(a, unreal.StaticMesh): sm = a; break
    else:
        t = unreal.AssetImportTask(); t.filename = ROOT + "/kit_glb/" + name + ".glb"; t.destination_path = D
        t.automated = True; t.replace_existing = True; t.save = True
        AT.import_asset_tasks([t]); sm = next(o for o in (unreal.load_asset(p) for p in t.imported_object_paths) if isinstance(o, unreal.StaticMesh))
    for i, s in enumerate(sm.static_materials):
        k = next((k for k in M if str(s.material_slot_name).startswith(k)), None)
        if k: sm.set_material(i, M[k])
    if name != "prop_bekat":                                                    # translucent glass: no Nanite
        ns = sms.get_nanite_settings(sm); ns.enabled = True; sms.set_nanite_settings(sm, ns, apply_changes=True)
    EAL.save_loaded_asset(sm, False); return sm
def hism(label, sm, rows, collide=True):
    for a in eas.get_all_level_actors():
        if a.get_actor_label() == label: eas.destroy_actor(a)
    act = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0))
    act.set_actor_label(label); act.set_folder_path("Kompleks/Shahar")
    act.tags = [unreal.Name("Kompleks"), unreal.Name("Shahar")]; act.set_editor_property("is_spatially_loaded", False)
    h, _ = SDS.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=SDS.k2_gather_subobject_data_for_instance(act)[0], new_class=unreal.HierarchicalInstancedStaticMeshComponent))
    c = BFL.get_object(BFL.get_data(h)); c.set_editor_property("static_mesh", sm)
    c.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS if collide else unreal.CollisionEnabled.NO_COLLISION)
    for r in rows:
        c.add_instance(unreal.Transform(location=unreal.Vector(r[0] * 100, r[1] * 100, r[2] * 100),
                                        rotation=unreal.Rotator(roll=0.0, pitch=0.0, yaw=(r[3] - 90.0) if len(r) > 3 else 0.0)), True)
    return c
# models face +Y; a row's yaw is the direction the front must face -> rotate by yaw - 90
hism("Kompleks_UrbanSvetofor", imp("prop_svetofor"), [[x, y, z, yw + 180.0] for x, y, z, yw in S["svetofor"]])
hism("Kompleks_UrbanBekat", imp("prop_bekat"), [[x, y, z, yw + 90.0 + 90.0] for x, y, z, yw in S["bekat"]])
lamp = None
for p in EAL.list_assets("/Game/Kompleks/Props/prop_lamp2", recursive=True):
    a = unreal.load_asset(p)
    if isinstance(a, unreal.StaticMesh): lamp = a
hism("Kompleks_UrbanMahallaLamps", lamp, S["lamps_mahalla"])
for a in eas.get_all_level_actors():
    if a.get_actor_label().startswith("Kompleks_MahallaLampL_"): eas.destroy_actor(a)
lit = 0
for k, (x, y, z) in enumerate(S["lamps_mahalla"]):
    if math.hypot(x - 24.3, y + 8.3) > LIGHT_R: continue
    s = eas.spawn_actor_from_class(unreal.SpotLight, unreal.Vector(x * 100, y * 100, z * 100 + 448.0), unreal.Rotator(roll=0.0, pitch=-90.0, yaw=0.0))
    s.set_actor_label("Kompleks_MahallaLampL_%d" % k); s.set_folder_path("Kompleks/Shahar/Chiroq")
    c = s.get_component_by_class(unreal.SpotLightComponent)
    c.set_editor_property("intensity_units", unreal.LightUnits.LUMENS); c.set_editor_property("intensity", 3000.0)
    c.set_editor_property("use_temperature", True); c.set_editor_property("temperature", 3800.0)
    c.set_editor_property("attenuation_radius", 1500.0); c.set_editor_property("source_radius", 20.0)
    c.set_editor_property("inner_cone_angle", 45.0); c.set_editor_property("outer_cone_angle", 75.0)
    c.set_editor_property("cast_shadows", False)
    c.set_editor_property("max_draw_distance", 12000.0); c.set_editor_property("max_distance_fade_range", 2500.0)
    s.tags = [unreal.Name("Kompleks"), unreal.Name("ChiroqSpot")]; s.set_editor_property("is_spatially_loaded", False)
    lit += 1
print("street ok: svetofor", len(S["svetofor"]), "bekat", len(S["bekat"]), "mahalla lamps", len(S["lamps_mahalla"]), "lit", lit)
