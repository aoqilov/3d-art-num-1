# Inside the editor (ue.py runs it), after ue_tune.py: the look of the developer's renders (D:/3d-aps/referens).
#  - facade: warm white walls; the lower (mint in the web app) walls per block in the renders' colours — sage green,
#    dusty blue, ochre, warm beige — through per-instance data of the blocks' instanced mesh
#  - the panels between the windows (spandrels): ochre, as on the renders; frames dark grey
#  - ground: mostly lawn (the renders' surroundings are green)
import unreal

IMP = '/Game/Obod/Import'
MAT = '/Game/Obod/Mat'
eal = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)


def srgb(h):
    """'#rrggbb' -> linear colour"""
    c = [int(h[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return unreal.LinearColor(lin[0], lin[1], lin[2], 1.0)


# block colours (by block id, cycling): the renders' sage green, dusty blue, ochre, warm beige
BLOCK_COLOURS = ['#B4BD99', '#A9BFD8', '#DDB97B', '#D6CCBA']     # light: the plaster texture darkens them
WALL = '#E9E3D8'           # warm white plaster
SPANDREL = '#D2B47E'       # ochre panels beside the windows (softer than first tried: #C79A4B)
FRAME = '#3A3D42'          # window frames, rails


def master():
    """M_Obod_Pbr: albedo texture x (Color, or the instance's colour when InstColor = 1), normal map, roughness"""
    path = MAT + '/M_Obod_Pbr'
    if eal.does_asset_exist(path):
        return unreal.load_asset(path)
    m = tools.create_asset('M_Obod_Pbr', MAT, unreal.Material, unreal.MaterialFactoryNew())
    E = lambda cls, x, y: mel.create_material_expression(m, cls, x, y)
    tex = E(unreal.MaterialExpressionTextureSampleParameter2D, -900, -300)
    tex.set_editor_property('parameter_name', 'Tex')
    tex.set_editor_property('texture', unreal.load_asset('/Engine/EngineResources/WhiteSquareTexture'))
    col = E(unreal.MaterialExpressionVectorParameter, -900, -50)
    col.set_editor_property('parameter_name', 'Color'); col.set_editor_property('default_value', unreal.LinearColor(1, 1, 1, 1))
    pic = E(unreal.MaterialExpressionPerInstanceCustomData3Vector, -900, 100)
    pic.set_editor_property('data_index', 0)
    k = E(unreal.MaterialExpressionScalarParameter, -900, 250)
    k.set_editor_property('parameter_name', 'InstColor'); k.set_editor_property('default_value', 0.0)
    lc = E(unreal.MaterialExpressionLinearInterpolate, -600, 50)
    mel.connect_material_expressions(col, '', lc, 'A'); mel.connect_material_expressions(pic, '', lc, 'B'); mel.connect_material_expressions(k, '', lc, 'Alpha')
    mul = E(unreal.MaterialExpressionMultiply, -400, -150)
    mel.connect_material_expressions(tex, 'RGB', mul, 'A'); mel.connect_material_expressions(lc, '', mul, 'B')
    mel.connect_material_property(mul, '', unreal.MaterialProperty.MP_BASE_COLOR)
    nt = E(unreal.MaterialExpressionTextureSampleParameter2D, -900, 400)
    nt.set_editor_property('parameter_name', 'NTex')
    nt.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
    nt.set_editor_property('texture', unreal.load_asset('/Engine/EngineMaterials/DefaultNormal'))
    mel.connect_material_property(nt, 'RGB', unreal.MaterialProperty.MP_NORMAL)
    for i, (name, val, prop) in enumerate([('Roughness', 0.85, unreal.MaterialProperty.MP_ROUGHNESS),
                                           ('Metallic', 0.0, unreal.MaterialProperty.MP_METALLIC),
                                           ('Specular', 0.5, unreal.MaterialProperty.MP_SPECULAR)]):
        p = E(unreal.MaterialExpressionScalarParameter, -400, 300 + i * 120)
        p.set_editor_property('parameter_name', name); p.set_editor_property('default_value', val)
        mel.connect_material_property(p, '', prop)
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    return m


def mi(name, parent, src=None, color=None, inst=0.0, rough=0.85, metal=0.0, spec=0.5):
    path = MAT + '/' + name
    x = unreal.load_asset(path) if eal.does_asset_exist(path) else tools.create_asset(name, MAT, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    x.set_editor_property('parent', parent)
    if src:
        t = mel.get_material_instance_texture_parameter_value(src, 'BaseColorTexture')
        n = mel.get_material_instance_texture_parameter_value(src, 'NormalTexture')
        if t: mel.set_material_instance_texture_parameter_value(x, 'Tex', t)
        if n: mel.set_material_instance_texture_parameter_value(x, 'NTex', n)
    if color is not None:
        mel.set_material_instance_vector_parameter_value(x, 'Color', color)
    for p, v in (('InstColor', inst), ('Roughness', rough), ('Metallic', metal), ('Specular', spec)):
        mel.set_material_instance_scalar_parameter_value(x, p, v)
    mel.update_material_instance(x)
    eal.save_loaded_asset(x)
    return x


def block_mesh():
    for p in eal.list_assets(IMP + '/a_blok', recursive=True):
        if eal.find_asset_data(p).asset_class_path.asset_name == 'StaticMesh':
            return unreal.load_asset(p)


def facade():
    base = master()
    mesh = block_mesh()
    plan = {   # web app material -> (instance name, settings)
        'facade_mint': ('MI_Fasad_rangli', dict(inst=1.0, rough=0.9)),
        'facade_white': ('MI_Fasad_oq', dict(color=srgb(WALL), rough=0.9)),
        'spandrel': ('MI_Panel_oxra', dict(color=srgb(SPANDREL), rough=0.7)),
        'frame': ('MI_Rom', dict(color=srgb(FRAME), rough=0.45)),
        'canopy': ('MI_Soyabon', dict(color=srgb(FRAME), rough=0.5)),
    }
    done = []
    for i, sm in enumerate(mesh.static_materials):
        m = sm.material_interface
        name = m.get_name() if m else ''
        for key, (mname, kw) in plan.items():
            if name.startswith('M0') and name.endswith('_' + key):
                mesh.set_material(i, mi(mname, base, src=m, **kw))
                done.append(key)
    eal.save_loaded_asset(mesh)
    # (the glass is its own see-through mesh now: ue_materials.glass_material; opaque glass covered the frames)
    # each block its colour: per-instance data on the blocks' instanced mesh
    n = 0
    for a in actors.get_all_level_actors():
        if a.get_actor_label() != 'blok':
            continue
        for c in a.get_components_by_class(unreal.InstancedStaticMeshComponent):
            c.set_editor_property('num_custom_data_floats', 3)
            for k in range(c.get_instance_count()):
                col = srgb(BLOCK_COLOURS[k % len(BLOCK_COLOURS)])
                c.set_custom_data_value(k, 0, col.r, False)
                c.set_custom_data_value(k, 1, col.g, False)
                c.set_custom_data_value(k, 2, col.b, k == c.get_instance_count() - 1)
                n += 1
    print('facade materials:', done, '| block colours:', n)


def ground():
    """the ground material again (ue_build.py: now mostly lawn) on the ground plane"""
    src = open('D:/3d-aps/art-house-obodmaskan/tools/unreal/ue_build.py', encoding='utf-8-sig').read()
    ns = {}
    exec(src.split('\ndef main')[0], ns)
    m = ns['ground_material']()
    for a in actors.get_all_level_actors():
        if a.get_actor_label() == 'Yer':
            a.static_mesh_component.set_material(0, m)


def setp(obj, **kw):
    for k, v in kw.items():
        try:
            obj.set_editor_property(k, v)
        except Exception as e:                     # names differ between versions: say so, go on
            print('  no property', k, '-', str(e)[:80])


def sky():
    """the renders' air: a paler, hazier sky than the default deep blue; warm, slightly soft grading"""
    by = {a.get_actor_label(): a for a in actors.get_all_level_actors()}
    atm = by['Atmosfera'].get_component_by_class(unreal.SkyAtmosphereComponent)
    setp(atm, mie_scattering_scale=0.009, aerial_pespective_view_distance_scale=1.6,
         sky_luminance_factor=unreal.LinearColor(1.35, 1.35, 1.35, 1))      # a paler sky, as in the renders
    fog = by['Tuman'].component
    setp(fog, fog_density=0.009, fog_height_falloff=0.06)
    pp = by['Post']
    st = pp.settings
    for k, v in (('white_temp', 6100.0), ('bloom_intensity', 0.35)):
        setp(st, **{'override_' + k: True, k: v})
    setp(st, override_color_saturation=True, color_saturation=unreal.Vector4(0.93, 0.93, 0.93, 1.0))
    # shade: the renders keep it bright (deep courtyards went near black); a little sky leaking into Lumen's
    # shadowed areas and a lower exposure floor
    setp(st, override_lumen_skylight_leaking=True, lumen_skylight_leaking=0.12)
    setp(st, override_auto_exposure_min_brightness=True, auto_exposure_min_brightness=11.8)
    pp.settings = st
    by['Osmon_nuri'].light_component.recapture_sky()
    # the ochre panels: softer, as on the renders
    p = MAT + '/MI_Panel_oxra'
    if eal.does_asset_exist(p):
        x = unreal.load_asset(p)
        mel.set_material_instance_vector_parameter_value(x, 'Color', srgb(SPANDREL))
        mel.update_material_instance(x); eal.save_loaded_asset(x)


facade()
ground()
sky()
unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
