# Inside the editor (ue.py runs it): builds the level /Game/Obod/Majmua from the imported files (ue_import.py)
# and scene.json: the world pieces, the instanced things (blocks, trees, hedges …), the ground, sun / sky / clouds /
# fog, the cameras of the web app. Re-runnable: everything it made carries the tag 'obod' and is replaced.
# three.js (metres, Y up, right-handed) -> Unreal (cm, Z up): X = x, Y = z, Z = y (checked on the block's bounds).
import json
import math

import unreal

SRC = 'D:/3d-aps/ObodMaskanUE/Import'
IMP = '/Game/Obod/Import'
MAT = '/Game/Obod/Mat'
LEVEL = '/Game/Obod/Majmua'
TAG = 'obod'

eal = unreal.EditorAssetLibrary
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
tools = unreal.AssetToolsHelpers.get_asset_tools()
mel = unreal.MaterialEditingLibrary


def V(x, y, z):
    """a three.js point (m) in Unreal (cm)"""
    return unreal.Vector(x * 100, z * 100, y * 100)


def D(x, y, z):
    """a three.js direction in Unreal"""
    return unreal.Vector(x, z, y)


def tagged(a, folder):
    a.tags = [TAG]
    a.set_folder_path(folder)
    return a


def spawn(cls, folder, label, loc=unreal.Vector(0, 0, 0), rot=unreal.Rotator(0, 0, 0)):
    a = actors.spawn_actor_from_class(cls, loc, rot)
    a.set_actor_label(label)
    return tagged(a, folder)


def mesh_in(folder):
    for p in eal.list_assets(folder, recursive=True):
        if eal.find_asset_data(p).asset_class_path.asset_name == 'StaticMesh':
            return unreal.load_asset(p)
    return None


def transform(e):
    """three.js column-major 4x4 -> Unreal transform (rotation from the X and Z axes, scale per axis)"""
    s = (0, 2, 1)
    L = [[e[c * 4 + r] for c in range(3)] for r in range(3)]
    Lp = [[L[s[i]][s[j]] for j in range(3)] for i in range(3)]
    col = [unreal.Vector(Lp[0][j], Lp[1][j], Lp[2][j]) for j in range(3)]
    sc = [c.length() for c in col]
    rot = unreal.MathLibrary.make_rot_from_xz(col[0], col[2])
    return unreal.Transform(V(e[12], e[13], e[14]), rot, unreal.Vector(sc[0], sc[1], sc[2]))


# ---------- level ----------
def open_level():
    if eal.does_asset_exist(LEVEL):
        levels.load_level(LEVEL)
    else:
        levels.new_level(LEVEL)
    for a in actors.get_all_level_actors():
        if TAG in [str(t) for t in a.tags]:
            actors.destroy_actor(a)


# ---------- ground ----------
def texture(name):
    path = MAT + '/T_' + name
    if not eal.does_asset_exist(path):
        t = unreal.AssetImportTask()
        t.filename = SRC + '/' + name + '.jpg'
        t.destination_path = MAT
        t.destination_name = 'T_' + name
        t.automated = True
        t.replace_existing = True
        t.save = True
        tools.import_asset_tasks([t])
    return unreal.load_asset(path)


def ground_material():
    """earth and grass by world position, two scales each, blended in ~50 m patches (as the web app's ground)"""
    path = MAT + '/M_Yer'
    if eal.does_asset_exist(path):
        eal.delete_asset(path)
    m = tools.create_asset('M_Yer', MAT, unreal.Material, unreal.MaterialFactoryNew())
    E = lambda cls, x, y: mel.create_material_expression(m, cls, x, y)
    wp = E(unreal.MaterialExpressionWorldPosition, -1400, 0)
    xy = E(unreal.MaterialExpressionComponentMask, -1200, 0)
    xy.set_editor_property('r', True); xy.set_editor_property('g', True)
    mel.connect_material_expressions(wp, '', xy, '')

    def sample(tex, size_m, x, y):
        d = E(unreal.MaterialExpressionDivide, x - 200, y)
        d.set_editor_property('const_b', size_m * 100.0)
        mel.connect_material_expressions(xy, '', d, 'A')
        s = E(unreal.MaterialExpressionTextureSample, x, y)
        s.set_editor_property('texture', tex)
        mel.connect_material_expressions(d, '', s, 'UVs')
        return s

    def two(tex, size, y, tint):
        a, b = sample(tex, size, -700, y), sample(tex, size * 7.3, -700, y + 260)
        l = E(unreal.MaterialExpressionLinearInterpolate, -400, y + 100)
        l.set_editor_property('const_alpha', 0.4)
        mel.connect_material_expressions(a, 'RGB', l, 'A'); mel.connect_material_expressions(b, 'RGB', l, 'B')
        t = E(unreal.MaterialExpressionConstant3Vector, -400, y + 260)
        t.set_editor_property('constant', unreal.LinearColor(*tint, 1))
        mul = E(unreal.MaterialExpressionMultiply, -250, y + 100)
        mel.connect_material_expressions(l, '', mul, 'A'); mel.connect_material_expressions(t, '', mul, 'B')
        return mul

    earth = two(texture('yer_dirt'), 5, -600, (0.9 * 0.92, 1.04 * 0.92, 0.82 * 0.92))
    lawn = two(texture('yer_grass'), 4, 0, (0.8, 1.45, 0.55))           # a deeper green than the web app's
    nz = E(unreal.MaterialExpressionNoise, -700, 600)
    nz.set_editor_property('scale', 1.0 / 5000.0)                 # patches of ~50 m
    nz.set_editor_property('levels', 3)
    nz.set_editor_property('output_min', 0.0); nz.set_editor_property('output_max', 1.0)
    nz.set_editor_property('turbulence', False)
    mel.connect_material_expressions(wp, '', nz, 'Position')
    sm = E(unreal.MaterialExpressionSmoothStep, -400, 600)
    # mostly lawn, bare earth only in the low patches (the renders' surroundings are green)
    sm.set_editor_property('const_min', 0.12); sm.set_editor_property('const_max', 0.38)
    mel.connect_material_expressions(nz, '', sm, 'Value')
    mix = E(unreal.MaterialExpressionLinearInterpolate, -100, 0)
    mel.connect_material_expressions(earth, '', mix, 'A'); mel.connect_material_expressions(lawn, '', mix, 'B')
    mel.connect_material_expressions(sm, '', mix, 'Alpha')
    mel.connect_material_property(mix, '', unreal.MaterialProperty.MP_BASE_COLOR)
    r = E(unreal.MaterialExpressionConstant, -100, 300)
    r.set_editor_property('r', 0.95)
    mel.connect_material_property(r, '', unreal.MaterialProperty.MP_ROUGHNESS)
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    return m


def ground():
    plane = unreal.load_asset('/Engine/BasicShapes/Plane')
    a = spawn(unreal.StaticMeshActor, 'Obod/Yer', 'Yer', unreal.Vector(0, 0, -5))
    a.set_actor_scale3d(unreal.Vector(6000, 6000, 1))         # 6 km (the plane is 1 m)
    c = a.static_mesh_component
    c.set_static_mesh(plane)
    c.set_material(0, ground_material())
    return a


# ---------- the scene ----------
def world():
    n = 0
    for p in eal.list_assets(IMP + '/world', recursive=True):
        if eal.find_asset_data(p).asset_class_path.asset_name != 'StaticMesh':
            continue
        m = unreal.load_asset(p)
        a = spawn(unreal.StaticMeshActor, 'Obod/Atrof', m.get_name())
        a.static_mesh_component.set_static_mesh(m)
        n += 1
    return n


def instances(scene):
    sds = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
    lib = unreal.SubobjectDataBlueprintFunctionLibrary
    out = []
    for name, mats in scene['instances'].items():
        mesh = mesh_in(IMP + '/' + name.lower())
        if not mesh:
            print('no mesh for', name)
            continue
        a = spawn(unreal.StaticMeshActor, 'Obod/Nusxalar', name[2:])
        root = sds.k2_gather_subobject_data_for_instance(a)[0]
        h, fail = sds.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=root, new_class=unreal.InstancedStaticMeshComponent, blueprint_context=None))
        comp = lib.get_object(lib.get_data(h))
        comp.set_static_mesh(mesh)
        comp.add_instances([transform(e) for e in mats], False, True)
        out.append((name, len(mats)))
    return out


# ---------- light ----------
def sun_rotation(scene, hour):
    s = scene['sun'][str(hour)]
    return unreal.MathLibrary.make_rot_from_x(D(-s[0], -s[1], -s[2]))   # the light travels away from the sun


def environment(scene, hour):
    sun = spawn(unreal.DirectionalLight, 'Obod/Yoritish', 'Quyosh', unreal.Vector(0, 0, 50000), sun_rotation(scene, hour))
    lc = sun.light_component
    lc.set_intensity(75000.0)                          # lux: physical sun (the atmosphere takes its share)
    lc.set_editor_property('atmosphere_sun_light', True)
    lc.set_editor_property('dynamic_shadow_distance_movable_light', 40000.0)
    lc.set_editor_property('cast_shadows', True)
    spawn(unreal.SkyAtmosphere, 'Obod/Yoritish', 'Atmosfera')
    sky = spawn(unreal.SkyLight, 'Obod/Yoritish', 'Osmon_nuri')
    sc = sky.light_component
    sc.set_mobility(unreal.ComponentMobility.MOVABLE)
    sc.set_editor_property('real_time_capture', True)
    sc.set_intensity(4.0)                              # with 1.0 the shaded facades went black (checked on pictures)
    spawn(unreal.VolumetricCloud, 'Obod/Yoritish', 'Bulutlar')
    fog = spawn(unreal.ExponentialHeightFog, 'Obod/Yoritish', 'Tuman', unreal.Vector(0, 0, 0))
    fc = fog.component
    fc.set_editor_property('fog_density', 0.006)
    fc.set_editor_property('fog_height_falloff', 0.08)
    pp = spawn(unreal.PostProcessVolume, 'Obod/Yoritish', 'Post')
    pp.set_editor_property('unbound', True)
    st = pp.settings
    st.set_editor_property('override_auto_exposure_method', True)
    st.set_editor_property('auto_exposure_method', unreal.AutoExposureMethod.AEM_HISTOGRAM)
    st.set_editor_property('override_auto_exposure_min_brightness', True)
    st.set_editor_property('auto_exposure_min_brightness', 10.0)        # EV100 (extended range is on)
    st.set_editor_property('override_auto_exposure_max_brightness', True)
    st.set_editor_property('auto_exposure_max_brightness', 15.0)
    st.set_editor_property('override_auto_exposure_bias', True)
    st.set_editor_property('auto_exposure_bias', 0.5)
    st.set_editor_property('override_vignette_intensity', True)
    st.set_editor_property('vignette_intensity', 0.25)
    pp.settings = st
    return sun


def cameras(scene):
    out = []
    for name, c in scene['cameras'].items():
        p, t = c['pos'], c['target']
        loc, tgt = V(*p), V(*t)
        rot = unreal.MathLibrary.make_rot_from_x(tgt - loc)
        cam = spawn(unreal.CineCameraActor, 'Obod/Kameralar', 'Kamera_' + name, loc, rot)
        cc = cam.get_cine_camera_component()
        fb = cc.filmback
        fb.sensor_width, fb.sensor_height = 36.0, 20.25
        cc.filmback = fb
        # the web app's vertical field of view on a 16:9 frame
        cc.current_focal_length = (20.25 / 2) / math.tan(math.radians(c['vfov'] / 2))
        fs = cc.focus_settings
        fs.focus_method = unreal.CameraFocusMethod.DISABLE
        cc.focus_settings = fs
        out.append(cam)
    return out


def main():
    scene = json.load(open(SRC + '/scene.json', encoding='utf-8'))
    open_level()
    print('yer:', ground().get_actor_label())
    print('atrof:', world(), 'bo\'lak')
    for n, k in instances(scene):
        print('  %-18s %5d' % (n, k))
    sun = environment(scene, 10)
    cams = cameras(scene)
    for a in actors.get_all_level_actors():
        if a.get_actor_label() == 'Osmon_nuri':
            a.light_component.recapture_sky()              # without it the sky light stayed dark until touched
    levels.save_current_level()
    # the editor's view from the first camera
    unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).set_level_viewport_camera_info(cams[0].get_actor_location(), cams[0].get_actor_rotation())
    print('tayyor:', LEVEL)


main()
