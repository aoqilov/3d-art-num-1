eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
mel = unreal.MaterialEditingLibrary
at = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary

# ---------- 1) Pol uchun o't materiali (dunyo bo'yicha takrorlanadi) ----------
path = '/Game/Materials/M_Zamin'
if EAL.does_asset_exist(path):
    mat = unreal.load_asset(path)
else:
    mat = at.create_asset('M_Zamin', '/Game/Materials', unreal.Material, unreal.MaterialFactoryNew())
    wp = mel.create_material_expression(mat, unreal.MaterialExpressionWorldPosition, -900, 0)
    mask = mel.create_material_expression(mat, unreal.MaterialExpressionComponentMask, -700, 0)
    mask.set_editor_property('r', True); mask.set_editor_property('g', True)
    mask.set_editor_property('b', False); mask.set_editor_property('a', False)
    div = mel.create_material_expression(mat, unreal.MaterialExpressionDivide, -500, 0)
    div.set_editor_property('const_b', 300.0)  # 3 m da bir takrorlanadi
    tex = mel.create_material_expression(mat, unreal.MaterialExpressionTextureSample, -300, 0)
    tex.texture = unreal.load_asset('/Game/GroundGrassGreen002_COL_2K')
    rough = mel.create_material_expression(mat, unreal.MaterialExpressionConstant, -300, 250)
    rough.set_editor_property('r', 0.9)
    mel.connect_material_expressions(wp, '', mask, '')
    mel.connect_material_expressions(mask, '', div, 'A')
    mel.connect_material_expressions(div, '', tex, 'UVs')
    mel.connect_material_property(tex, 'RGB', unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(rough, '', unreal.MaterialProperty.MP_ROUGHNESS)
    mel.recompile_material(mat)

with unreal.ScopedEditorTransaction("Realistik qilish"):
    acts = eas.get_all_level_actors()
    for a in acts:
        lbl = a.get_actor_label()
        if lbl == 'Pol':
            a.static_mesh_component.set_material(0, mat)
        # ---------- 2) Quyosh: pastroq, iliq rang ----------
        if isinstance(a, unreal.DirectionalLight):
            a.set_actor_rotation(unreal.Rotator(0, -32, -50), False)
            lc = a.light_component
            lc.set_light_color(unreal.LinearColor(1.0, 0.93, 0.82, 1))
            lc.set_intensity(8.0)
            lc.set_editor_property('light_source_angle', 1.0)
        if isinstance(a, unreal.SkyLight):
            a.light_component.set_intensity(1.0)
        if isinstance(a, unreal.ExponentialHeightFog):
            fc = a.component
            fc.set_editor_property('fog_density', 0.01)
            fc.set_volumetric_fog(True)

    # ---------- 3) Post Process ----------
    ppv = None
    for a in acts:
        if isinstance(a, unreal.PostProcessVolume):
            ppv = a
    if ppv is None:
        ppv = eas.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 300))
        ppv.set_actor_label('PostProcess')
        ppv.set_folder_path('Yorugʻlik')
    ppv.set_editor_property('unbound', True)
    s = ppv.settings

    def setp(name, val):
        s.set_editor_property('override_' + name, True)
        s.set_editor_property(name, val)

    setp('auto_exposure_method', unreal.AutoExposureMethod.AEM_HISTOGRAM)
    setp('auto_exposure_min_brightness', 0.5)
    setp('auto_exposure_max_brightness', 2.0)
    setp('auto_exposure_bias', 0.3)
    setp('bloom_intensity', 0.4)
    setp('vignette_intensity', 0.35)
    setp('film_grain_intensity', 0.05)
    setp('color_saturation', unreal.Vector4(1.08, 1.08, 1.08, 1))
    setp('color_contrast', unreal.Vector4(1.08, 1.08, 1.08, 1))
    setp('lumen_final_gather_quality', 2.0)
    setp('lumen_reflection_quality', 2.0)
    setp('lumen_scene_lighting_quality', 2.0)
    setp('ambient_occlusion_intensity', 0.6)
    setp('chromatic_aberration_intensity'.replace('chromatic_aberration_intensity', 'scene_fringe_intensity'), 0.3)
    ppv.settings = s

print('ok', ppv.get_actor_label())
