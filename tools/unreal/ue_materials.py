# Inside the editor (ue.py runs it), after ue_import.py: fixes what the glTF import does not carry well.
#  - vertex colours (the neighbourhood's coloured roofs, the outer city): the glTF master material ignores COLOR_0
#  - glass: opaque, dark and mirror-smooth (Lumen reflects the sky and the neighbours); see-through glass showed
#    the empty inside of the block model as black streaks
import unreal

IMP = '/Game/Obod/Import'
MAT = '/Game/Obod/Mat'
eal = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()

VCOL = '_vc'                                 # export names: materials with COLOR_0 end so (page.ts)
GLASS = {'a_blok_shaffof': '_glass'}         # the block's glazing (exported apart: page.ts, '_shaffof')


def master():
    """M_Obod_Rang: colour x texture x (vertex colour, by VCol 0/1); metallic, roughness, specular"""
    path = MAT + '/M_Obod_Rang'
    if eal.does_asset_exist(path):
        return unreal.load_asset(path)
    m = tools.create_asset('M_Obod_Rang', MAT, unreal.Material, unreal.MaterialFactoryNew())
    E = lambda cls, x, y: mel.create_material_expression(m, cls, x, y)
    col = E(unreal.MaterialExpressionVectorParameter, -900, -200)
    col.set_editor_property('parameter_name', 'Color'); col.set_editor_property('default_value', unreal.LinearColor(1, 1, 1, 1))
    tex = E(unreal.MaterialExpressionTextureSampleParameter2D, -900, 0)
    tex.set_editor_property('parameter_name', 'Tex'); tex.set_editor_property('texture', unreal.load_asset('/Engine/EngineResources/WhiteSquareTexture'))
    vc = E(unreal.MaterialExpressionVertexColor, -900, 250)
    one = E(unreal.MaterialExpressionConstant3Vector, -900, 400)
    one.set_editor_property('constant', unreal.LinearColor(1, 1, 1, 1))
    k = E(unreal.MaterialExpressionScalarParameter, -900, 500)
    k.set_editor_property('parameter_name', 'VCol'); k.set_editor_property('default_value', 0.0)
    lv = E(unreal.MaterialExpressionLinearInterpolate, -600, 300)
    mel.connect_material_expressions(one, '', lv, 'A'); mel.connect_material_expressions(vc, '', lv, 'B'); mel.connect_material_expressions(k, '', lv, 'Alpha')
    m1 = E(unreal.MaterialExpressionMultiply, -500, -100)
    mel.connect_material_expressions(col, '', m1, 'A'); mel.connect_material_expressions(tex, 'RGB', m1, 'B')
    m2 = E(unreal.MaterialExpressionMultiply, -300, 0)
    mel.connect_material_expressions(m1, '', m2, 'A'); mel.connect_material_expressions(lv, '', m2, 'B')
    mel.connect_material_property(m2, '', unreal.MaterialProperty.MP_BASE_COLOR)
    for i, (name, val, prop) in enumerate([('Metallic', 0.0, unreal.MaterialProperty.MP_METALLIC),
                                           ('Roughness', 0.8, unreal.MaterialProperty.MP_ROUGHNESS),
                                           ('Specular', 0.5, unreal.MaterialProperty.MP_SPECULAR)]):
        p = E(unreal.MaterialExpressionScalarParameter, -300, 300 + i * 120)
        p.set_editor_property('parameter_name', name); p.set_editor_property('default_value', val)
        mel.connect_material_property(p, '', prop)
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    return m


def instance(name, parent, color=None, tex=None, vcol=0.0, metallic=0.0, roughness=0.8, specular=0.5):
    path = MAT + '/' + name
    mi = unreal.load_asset(path) if eal.does_asset_exist(path) else tools.create_asset(name, MAT, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    mi.set_editor_property('parent', parent)
    if color is not None:
        mel.set_material_instance_vector_parameter_value(mi, 'Color', color)
    if tex is not None:
        mel.set_material_instance_texture_parameter_value(mi, 'Tex', tex)
    for p, v in (('VCol', vcol), ('Metallic', metallic), ('Roughness', roughness), ('Specular', specular)):
        mel.set_material_instance_scalar_parameter_value(mi, p, v)
    mel.update_material_instance(mi)
    eal.save_loaded_asset(mi)
    return mi


def from_gltf(src, name, parent, **kw):
    """an M_Obod_Rang instance with the colour, texture, metal and roughness of an imported glTF instance"""
    g = lambda f, p, d: (f(src, p) if src else d)
    color = g(mel.get_material_instance_vector_parameter_value, 'BaseColorFactor', unreal.LinearColor(1, 1, 1, 1))
    tex = g(mel.get_material_instance_texture_parameter_value, 'BaseColorTexture', None)
    met = g(mel.get_material_instance_scalar_parameter_value, 'MetallicFactor', 0.0)
    rough = g(mel.get_material_instance_scalar_parameter_value, 'RoughnessFactor', 0.8)
    return instance(name, parent, color=color, tex=tex, metallic=met, roughness=rough, **kw)


def meshes(folder):
    for p in eal.list_assets(folder, recursive=True):
        if eal.find_asset_data(p).asset_class_path.asset_name == 'StaticMesh':
            yield unreal.load_asset(p)


def swap(mesh, part, make):
    """material slots whose material name holds `part` -> make(old material)"""
    n = 0
    for i, sm in enumerate(mesh.static_materials):
        mi = sm.material_interface
        if mi and mi.get_name().startswith('M') and part in mi.get_name():
            mesh.set_material(i, make(mi))
            n += 1
    if n:
        eal.save_loaded_asset(mesh)
    return n


def main():
    base = master()
    made = {}

    def vcol(mi):
        if mi.get_name() not in made:
            made[mi.get_name()] = from_gltf(mi, 'MI_' + mi.get_name() + '_vc', base, vcol=1.0)
        return made[mi.get_name()]
    n = sum(swap(m, VCOL, vcol) for m in meshes(IMP + '/world'))
    print('vertex colour slots:', n)

    glass = glass_material()
    for folder, part in GLASS.items():
        for m in meshes(IMP + '/' + folder):
            print('glass slots in', m.get_name(), swap(m, part, lambda mi: glass))
            ns = m.get_editor_property('nanite_settings')            # translucent: Nanite would not draw it
            if ns.enabled:
                ns.enabled = False
                m.set_editor_property('nanite_settings', ns)
                eal.save_loaded_asset(m)


def glass_material():
    """see-through blue glass as in the web app (#35627f, 0.8 opaque in Ultra): drawn after the opaque scene, so the
    frames in the glazing plane stay in front of it, and the panes reflect the sky (forward shaded)"""
    path = MAT + '/M_Obod_Oyna'
    if not eal.does_asset_exist(path):
        m = tools.create_asset('M_Obod_Oyna', MAT, unreal.Material, unreal.MaterialFactoryNew())
        m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_TRANSLUCENT)
        m.set_editor_property('two_sided', True)
        m.set_editor_property('translucency_lighting_mode', unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
        E = lambda cls, x, y: mel.create_material_expression(m, cls, x, y)
        for i, (name, val, prop) in enumerate([('Opacity', 0.8, unreal.MaterialProperty.MP_OPACITY),
                                               ('Roughness', 0.05, unreal.MaterialProperty.MP_ROUGHNESS),
                                               ('Specular', 0.7, unreal.MaterialProperty.MP_SPECULAR),
                                               ('Metallic', 0.2, unreal.MaterialProperty.MP_METALLIC)]):
            p = E(unreal.MaterialExpressionScalarParameter, -400, 100 + i * 120)
            p.set_editor_property('parameter_name', name); p.set_editor_property('default_value', val)
            mel.connect_material_property(p, '', prop)
        c = E(unreal.MaterialExpressionVectorParameter, -400, -100)
        c.set_editor_property('parameter_name', 'Color'); c.set_editor_property('default_value', unreal.LinearColor(0.035, 0.122, 0.212, 1))
        mel.connect_material_property(c, '', unreal.MaterialProperty.MP_BASE_COLOR)
        mel.recompile_material(m)
        eal.save_loaded_asset(m)
    return unreal.load_asset(path)


main()
