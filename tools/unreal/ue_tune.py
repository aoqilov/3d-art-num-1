# Inside the editor (ue.py runs it), after ue_build.py and ue_materials.py: the look.
#  - exposure: fixed EV100 for a sunny day (auto exposure followed the shaded facades and burnt the sunlit ground)
#  - painted metal of the block (frames, rails, canopies: metallic 0.3-0.6 in the web app) -> powder-coated paint,
#    a dielectric: as metal it mirrored the bright sky and turned pale grey
#  - the balcony rail panel (thin bars in a texture, blended in glTF) -> masked: crisp bars, no grey sheet
import unreal

IMP = '/Game/Obod/Import'
MAT = '/Game/Obod/Mat'
EV100 = (12.6, 14.2)
eal = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()


def exposure(lo, hi=None):
    """EV100 range of the auto exposure: a shaded courtyard wants ~12.7, a sunlit view from above ~14"""
    for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors():
        if a.get_actor_label() == 'Post':
            st = a.settings
            st.set_editor_property('override_auto_exposure_min_brightness', True)
            st.set_editor_property('auto_exposure_min_brightness', lo)
            st.set_editor_property('override_auto_exposure_max_brightness', True)
            st.set_editor_property('auto_exposure_max_brightness', hi if hi is not None else lo)
            st.set_editor_property('override_auto_exposure_bias', True)
            st.set_editor_property('auto_exposure_bias', 0.0)
            a.settings = st
            print('exposure EV100', lo, hi)


def mask_master():
    path = MAT + '/M_Obod_Mask'
    if eal.does_asset_exist(path):
        return unreal.load_asset(path)
    m = tools.create_asset('M_Obod_Mask', MAT, unreal.Material, unreal.MaterialFactoryNew())
    m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_MASKED)
    m.set_editor_property('two_sided', True)
    E = lambda cls, x, y: mel.create_material_expression(m, cls, x, y)
    col = E(unreal.MaterialExpressionVectorParameter, -700, -200)
    col.set_editor_property('parameter_name', 'Color')
    tex = E(unreal.MaterialExpressionTextureSampleParameter2D, -700, 0)
    tex.set_editor_property('parameter_name', 'Tex')
    tex.set_editor_property('texture', unreal.load_asset('/Engine/EngineResources/WhiteSquareTexture'))
    mul = E(unreal.MaterialExpressionMultiply, -400, -100)
    mel.connect_material_expressions(col, '', mul, 'A'); mel.connect_material_expressions(tex, 'RGB', mul, 'B')
    mel.connect_material_property(mul, '', unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(tex, 'A', unreal.MaterialProperty.MP_OPACITY_MASK)
    r = E(unreal.MaterialExpressionScalarParameter, -400, 200)
    r.set_editor_property('parameter_name', 'Roughness'); r.set_editor_property('default_value', 0.45)
    mel.connect_material_property(r, '', unreal.MaterialProperty.MP_ROUGHNESS)
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    return m


def block():
    mesh = None
    for p in eal.list_assets(IMP + '/a_blok', recursive=True):
        if eal.find_asset_data(p).asset_class_path.asset_name == 'StaticMesh':
            mesh = unreal.load_asset(p)
    paint, rail = 0, None
    for i, sm in enumerate(mesh.static_materials):
        mi = sm.material_interface
        if not isinstance(mi, unreal.MaterialInstanceConstant) or not mi.get_name().startswith('M0'):
            continue
        met = mel.get_material_instance_scalar_parameter_value(mi, 'MetallicFactor')
        if 0.25 < met < 0.65:
            mel.set_material_instance_scalar_parameter_value(mi, 'MetallicFactor', 0.0)
            mel.update_material_instance(mi); eal.save_loaded_asset(mi); paint += 1
        if '_rail_panel' in mi.get_name():              # the rail panel (bars in the texture's alpha)
            tex = mel.get_material_instance_texture_parameter_value(mi, 'BaseColorTexture')
            col = mel.get_material_instance_vector_parameter_value(mi, 'BaseColorFactor')
            path = MAT + '/MI_Panjara'
            nm = unreal.load_asset(path) if eal.does_asset_exist(path) else tools.create_asset('MI_Panjara', MAT, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
            nm.set_editor_property('parent', mask_master())
            mel.set_material_instance_vector_parameter_value(nm, 'Color', unreal.LinearColor(col.r, col.g, col.b, 1))
            if tex:
                mel.set_material_instance_texture_parameter_value(nm, 'Tex', tex)
            mel.update_material_instance(nm); eal.save_loaded_asset(nm)
            mesh.set_material(i, nm); rail = tex.get_name() if tex else 'no texture'
    eal.save_loaded_asset(mesh)
    print('painted metal -> paint:', paint, '| rail panel:', rail)


exposure(*EV100)
block()
unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()

