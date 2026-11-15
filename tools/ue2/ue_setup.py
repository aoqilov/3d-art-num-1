# Inside the editor of ObodMaskanUE2 (tools/unreal/ue.py tools/ue2/ue_setup.py): the test level of block 1.
# Imports Import/blok1.fbx + blok1_panjara.fbx (tools/ue2/blok_clean.py) as Nanite meshes, one master material with
# an instance per material slot (colours from materials.json), the level /Game/Blok1/Blok1_Sinov with the block at
# the origin, a ground plane, sun / sky atmosphere / sky light / fog, post process and the cameras.
# Re-runnable: what it made carries the tag 'obod' and is replaced; the meshes are imported again.
# Blender (m, Z up) → Unreal (cm): X = x, Y = -y, Z = z. The street facade faces −Y, the courtyard +Y.
import json
import math
import sys

import unreal

SRC = 'D:/3d-aps/ObodMaskanUE2/Import'
ROOT = '/Game/Blok1'
LEVEL = ROOT + '/Blok1_Sinov'
TAG = 'obod'

eal = unreal.EditorAssetLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
mel = unreal.MaterialEditingLibrary
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)

# material looks that differ from the web colours: glass reads as glass only dark and glossy under Lumen
OVERRIDE = {
    'glass': {'color': (0.012, 0.022, 0.032), 'rough': 0.06, 'metal': 0.0},
}

# cameras: (position, target) in Blender metres, vertical field of view on a 16:9 frame
CAMS = {
    'umumiy': ((-24, 52, 8), (14.85, -6, 24.5), 50),        # street side, 3/4 from the left (as the Blender render)
    'hovli': ((52, -66, 8), (14.85, -12, 24.5), 50),         # courtyard side
    'yaqin': ((-3, 13, 13), (7, 0, 16), 32),                 # balconies left of the portal
    'portal': ((20.85, 22, 2.2), (14.85, 0, 5.5), 42.6),     # ground floor
    # the old project's '_pair_balkon' view (block 19 there, scaled 0.92 × 0.94): telephoto on two floors
    'balkon': ((5.95, 32.54, 10), (21.93, -7.22, 16), 9),
    'oyna': ((3.5, 9.0, 14.0), (8.0, 0, 16.5), 34),          # a few windows from the balcony across the street
}


def V(x, y, z):
    return unreal.Vector(x * 100, -y * 100, z * 100)


def lin(h):
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5))


def spawn(cls, folder, label, loc=unreal.Vector(0, 0, 0), rot=unreal.Rotator(0, 0, 0)):
    a = actors.spawn_actor_from_class(cls, loc, rot)
    a.set_actor_label(label)
    a.tags = [TAG]
    a.set_folder_path(folder)
    return a


def open_level():
    if eal.does_asset_exist(LEVEL):
        levels.load_level(LEVEL)
    else:
        levels.new_level(LEVEL)
    for a in actors.get_all_level_actors():
        if TAG in [str(t) for t in a.tags]:
            actors.destroy_actor(a)


# ---------- meshes ----------
def import_mesh(name):
    folder = ROOT + '/Mesh/' + name
    if eal.does_directory_exist(folder):
        eal.delete_directory(folder)
    t = unreal.AssetImportTask()
    t.filename = SRC + '/' + name + '.fbx'
    t.destination_path = folder
    t.automated = True
    t.replace_existing = True
    t.save = True
    tools.import_asset_tasks([t])
    meshes = [p for p in eal.list_assets(folder, recursive=True) if eal.find_asset_data(p).asset_class_path.asset_name == 'StaticMesh']
    m = unreal.load_asset(meshes[0])
    ns = m.get_editor_property('nanite_settings')
    # Nanite reads at most 4 UV sets: the glass keeps 6 (the fake-room data), and it is small — no Nanite there
    ns.enabled = name != 'blok1_oyna'
    m.set_editor_property('nanite_settings', ns)
    eal.save_loaded_asset(m)
    b = m.get_bounding_box()
    print('mesh', name, m.get_name(), 'tris', m.get_num_triangles(0), 'bounds', [round(v) for v in (b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z)])
    return m


# ---------- materials ----------
def master():
    path = ROOT + '/Mat/M_Asos'
    if eal.does_asset_exist(path):
        return unreal.load_asset(path)
    m = tools.create_asset('M_Asos', ROOT + '/Mat', unreal.Material, unreal.MaterialFactoryNew())
    E = lambda cls, x, y: mel.create_material_expression(m, cls, x, y)
    bc = E(unreal.MaterialExpressionVectorParameter, -500, -200)
    bc.set_editor_property('parameter_name', 'BaseColor')
    bc.set_editor_property('default_value', unreal.LinearColor(0.8, 0.8, 0.8, 1))
    mel.connect_material_property(bc, '', unreal.MaterialProperty.MP_BASE_COLOR)
    for i, (name, val, prop) in enumerate((('Metallic', 0.0, unreal.MaterialProperty.MP_METALLIC),
                                           ('Specular', 0.5, unreal.MaterialProperty.MP_SPECULAR),
                                           ('Roughness', 0.8, unreal.MaterialProperty.MP_ROUGHNESS))):
        p = E(unreal.MaterialExpressionScalarParameter, -500, 50 + i * 120)
        p.set_editor_property('parameter_name', name)
        p.set_editor_property('default_value', val)
        mel.connect_material_property(p, '', prop)
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    return m


# The glass: a smooth reflective surface (Fresnel) with a room behind it drawn by the material ("interior mapping").
# Per pane (UV sets written by blok_clean.py glass_uv): 1 local m (along the wall, up), 2 size (w, h), 3 (sill, top),
# 4 two random numbers, 5 (ground floor = shop / lobby). A ray from the eye through the pixel enters a box: the room
# (wider than the pane, 3–5.5 m deep, floor 'sill' below the pane, ceiling 'top' above), and the face it meets gives
# the colour: back wall (with a sofa band or a dark picture), side walls, wooden or tiled floor, white ceiling,
# daylight fading with depth. Curtains / tulle / roller blinds hang 12 cm behind the glass. Unreal's FBX import
# flips V (v → 1 − v): FlipV = 1 undoes it.
ROOM_HLSL = r'''
float v    = flipV > 0.5 ? 1.0 - uvL.y : uvL.y;
float hh   = flipV > 0.5 ? 1.0 - sz.y  : sz.y;
float top  = flipV > 0.5 ? 1.0 - gap.y : gap.y;
float r2   = flipV > 0.5 ? 1.0 - rnd.y : rnd.y;
float w = sz.x, sill = gap.x, r1 = rnd.x;
bool shop = kind.x > 0.5;
float3 n = normalize(float3(nrm.x, nrm.y, 0.0));
float3 t = float3(n.y, -n.x, 0.0);
float3 rd = -cam;
float3 d = float3(dot(rd, t), rd.z, -dot(rd, n));
d.z = max(d.z, 0.02);
float roomW = shop ? max(w + 3.0, 7.0) : max(w + 1.2, 2.8 + 1.6 * r1);
float x0 = -(roomW - w) * (0.25 + 0.5 * r2);
float x1 = x0 + roomW;
float y0 = -sill;
float y1 = hh + top;
float D = shop ? 7.0 + 4.0 * r2 : 3.2 + 2.3 * frac(r1 * 7.31 + r2 * 3.17);
float3 p = float3(uvL.x, v, 0.0);
float tx = d.x > 1e-4 ? (x1 - p.x) / d.x : (d.x < -1e-4 ? (x0 - p.x) / d.x : 1e5);
float ty = d.y > 1e-4 ? (y1 - p.y) / d.y : (d.y < -1e-4 ? (y0 - p.y) / d.y : 1e5);
float tz = (D - p.z) / d.z;
float tt = min(tx, min(ty, tz));
float3 q = p + d * tt;
float k = frac(r2 * 5.73 + r1 * 1.91);
float3 wall = k < 0.35 ? float3(0.60, 0.53, 0.44) : (k < 0.6 ? float3(0.55, 0.43, 0.31) : (k < 0.8 ? float3(0.52, 0.49, 0.45) : float3(0.47, 0.48, 0.46)));
float3 flo = frac(r1 * 3.7) < 0.6 ? float3(0.24, 0.13, 0.06) : float3(0.40, 0.37, 0.33);
float3 c;
float cx = (x0 + x1) * 0.5;
if (tt == tz) {
    c = wall;
    float fb = frac(r1 * 11.3);
    if (!shop && fb > 0.45 && q.y - y0 < 0.85 && abs(q.x - cx) < roomW * 0.3)
        c = fb > 0.75 ? float3(0.16, 0.15, 0.14) : float3(0.40, 0.32, 0.25);
    if (!shop && fb < 0.3 && q.y - y0 > 1.1 && q.y - y0 < 1.7 && abs(q.x - cx) < 0.55)
        c = float3(0.04, 0.04, 0.05);
    if (shop && q.y - y0 < 2.0 && frac(q.x * 0.8) < 0.7)
        c = lerp(float3(0.75, 0.73, 0.70), float3(0.30, 0.28, 0.26), step(0.5, frac(q.y * 2.5)));
} else if (tt == tx) {
    c = wall * 0.85;
} else if (d.y < 0) {
    c = shop ? float3(0.55, 0.54, 0.52) : flo;
} else {
    c = float3(0.70, 0.68, 0.64);
}
// daylight from the window fades with depth; the ceiling gets less; a warm bounce inside
float L = 0.12 + 0.88 * exp(-q.z * 0.75);
if (tt == ty && d.y > 0) L *= 0.7;
float lit = shop ? 1.7 : (frac(r1 * 17.9 + r2 * 4.3) < 0.3 ? 0.45 : 1.0);
c *= L * lit * float3(1.0, 0.93, 0.82);
if (!shop) {
    // Tashkent flats: mostly white tulle, often with side curtains; some blinds; some bare
    float ct = frac(r1 * 13.7 + r2 * 2.9);
    float2 pc = p.xy + d.xy * (0.10 / d.z);
    float cs = frac(r2 * 9.1);
    float3 cc = cs < 0.4 ? float3(0.70, 0.62, 0.48) : (cs < 0.65 ? float3(0.80, 0.78, 0.72) : (cs < 0.85 ? float3(0.42, 0.36, 0.30) : float3(0.55, 0.30, 0.25)));
    float folds = 0.78 + 0.22 * sin(pc.x * 34.0 + r1 * 20.0);
    bool side = false;
    if (ct < 0.55) {
        float3 tul = float3(0.93, 0.92, 0.88) * (0.80 + 0.08 * sin(pc.x * 75.0 + r2 * 9.0));
        c = lerp(c, tul * 0.8, 0.45 + 0.25 * frac(r2 * 3.3));
        side = ct < 0.28;
    } else if (ct < 0.75) {
        side = true;
    } else if (ct < 0.85) {
        float down = hh * (0.25 + 0.5 * frac(r1 * 5.3));
        if (pc.y > hh - down) c = float3(0.82, 0.80, 0.74) * 0.8 * (0.9 + 0.1 * step(0.5, frac(pc.y * 12.0)));
    }
    if (side) {
        float openL = 0.10 + 0.18 * frac(r1 * 29.3);
        float openR = openL * (0.6 + 0.8 * frac(r2 * 7.7));
        if (pc.x < w * openL || pc.x > w * (1.0 - openR)) c = cc * folds * 0.95;
    }
}
// double glazing: ~7 % reflected straight on (Specular 0.9), a slight green-blue cast through the glass
float F = 0.072 + 0.928 * pow(1.0 - saturate(dot(normalize(nrm), cam)), 5.0);
return c * (1.0 - F) * float3(0.90, 0.96, 0.95);
'''

TILT_HLSL = r'''
float r2 = flipV > 0.5 ? 1.0 - rnd.y : rnd.y;
return normalize(float3((rnd.x - 0.5) * 0.024, (r2 - 0.5) * 0.024, 1.0));
'''


def glass_material():
    path = ROOT + '/Mat/M_Oyna'
    if eal.does_asset_exist(path):
        eal.delete_asset(path)
    m = tools.create_asset('M_Oyna', ROOT + '/Mat', unreal.Material, unreal.MaterialFactoryNew())
    E = lambda cls, x, y: mel.create_material_expression(m, cls, x, y)

    def scalar(name, val, x, y):
        p = E(unreal.MaterialExpressionScalarParameter, x, y)
        p.set_editor_property('parameter_name', name)
        p.set_editor_property('default_value', val)
        return p

    def custom(code, names, x, y, desc):
        c = E(unreal.MaterialExpressionCustom, x, y)
        c.set_editor_property('code', code)
        c.set_editor_property('output_type', unreal.CustomMaterialOutputType.CMOT_FLOAT3)
        c.set_editor_property('description', desc)
        ins = []
        for n in names:
            ci = unreal.CustomInput()
            ci.set_editor_property('input_name', n)
            ins.append(ci)
        c.set_editor_property('inputs', ins)
        return c

    tc = {}
    for i in range(1, 6):
        t = E(unreal.MaterialExpressionTextureCoordinate, -1300, -500 + i * 110)
        t.set_editor_property('coordinate_index', i)
        tc[i] = t
    cam = E(unreal.MaterialExpressionCameraVectorWS, -1300, 200)
    nrm = E(unreal.MaterialExpressionVertexNormalWS, -1300, 300)
    flip = scalar('FlipV', 1.0, -1300, 400)
    room = custom(ROOM_HLSL, ['uvL', 'sz', 'gap', 'rnd', 'kind', 'cam', 'nrm', 'flipV'], -800, -100, 'Ichki xona')
    for i, name in zip(range(1, 6), ('uvL', 'sz', 'gap', 'rnd', 'kind')):
        mel.connect_material_expressions(tc[i], '', room, name)
    mel.connect_material_expressions(cam, '', room, 'cam')
    mel.connect_material_expressions(nrm, '', room, 'nrm')
    mel.connect_material_expressions(flip, '', room, 'flipV')
    # cd/m² of a white interior surface by the window (sunlit white facade ~10000–20000; 1500 read as flat grey panes)
    glow = scalar('IchkiYorug', 5000.0, -800, 150)
    mul = E(unreal.MaterialExpressionMultiply, -500, 0)
    mel.connect_material_expressions(room, '', mul, 'A')
    mel.connect_material_expressions(glow, '', mul, 'B')
    mel.connect_material_property(mul, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    black = E(unreal.MaterialExpressionConstant3Vector, -500, -200)
    black.set_editor_property('constant', unreal.LinearColor(0.0, 0.0, 0.0, 1))
    mel.connect_material_property(black, '', unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(scalar('Roughness', 0.025, -500, 250), '', unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(scalar('Specular', 0.9, -500, 350), '', unreal.MaterialProperty.MP_SPECULAR)
    tilt = custom(TILT_HLSL, ['rnd', 'flipV'], -800, 450, 'Oyna egriligi')
    mel.connect_material_expressions(tc[4], '', tilt, 'rnd')
    mel.connect_material_expressions(flip, '', tilt, 'flipV')
    mel.connect_material_property(tilt, '', unreal.MaterialProperty.MP_NORMAL)
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    return m


def instance(name, spec, parent):
    path = ROOT + '/Mat/MI_' + name
    inst = unreal.load_asset(path) if eal.does_asset_exist(path) else \
        tools.create_asset('MI_' + name, ROOT + '/Mat', unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    mel.set_material_instance_parent(inst, parent)
    c = spec['color'] if isinstance(spec['color'], tuple) else lin(spec['color'])
    mel.set_material_instance_vector_parameter_value(inst, 'BaseColor', unreal.LinearColor(c[0], c[1], c[2], 1))
    mel.set_material_instance_scalar_parameter_value(inst, 'Roughness', float(spec['rough']))
    mel.set_material_instance_scalar_parameter_value(inst, 'Metallic', float(spec['metal']))
    eal.save_loaded_asset(inst)
    return inst


def assign(mesh, mats):
    for i, s in enumerate(mesh.get_editor_property('static_materials')):
        slot = str(s.material_slot_name)
        key = next((k for k in sorted(mats, key=len, reverse=True) if slot == k or slot.startswith(k)), None)
        if key:
            mesh.set_material(i, mats[key])
        else:
            print('  no material for slot', slot)
    eal.save_loaded_asset(mesh)


# ---------- light ----------
def environment():
    sun = spawn(unreal.DirectionalLight, 'Obod/Yoritish', 'Quyosh', unreal.Vector(0, 0, 10000),
                unreal.MathLibrary.make_rot_from_x(unreal.Vector(-0.55, 0.62, -0.56)))
    lc = sun.light_component
    lc.set_intensity(75000.0)                     # lux, physical sun (the atmosphere takes its share)
    lc.set_editor_property('atmosphere_sun_light', True)
    lc.set_editor_property('cast_shadows', True)
    spawn(unreal.SkyAtmosphere, 'Obod/Yoritish', 'Atmosfera')
    sky = spawn(unreal.SkyLight, 'Obod/Yoritish', 'Osmon_nuri')
    sc = sky.light_component
    sc.set_mobility(unreal.ComponentMobility.MOVABLE)
    sc.set_editor_property('real_time_capture', True)
    sc.set_intensity(1.0)
    fog = spawn(unreal.ExponentialHeightFog, 'Obod/Yoritish', 'Tuman')
    fog.component.set_editor_property('fog_density', 0.004)
    fog.component.set_editor_property('fog_height_falloff', 0.1)
    pp = spawn(unreal.PostProcessVolume, 'Obod/Yoritish', 'Post')
    pp.set_editor_property('unbound', True)
    st = pp.settings
    for k, v in (('auto_exposure_method', unreal.AutoExposureMethod.AEM_HISTOGRAM),
                 ('auto_exposure_min_brightness', 13.0), ('auto_exposure_max_brightness', 15.0),
                 ('auto_exposure_bias', 0.3), ('vignette_intensity', 0.2),
                 ('depth_of_field_fstop', 22.0)):
        st.set_editor_property('override_' + k, True)
        st.set_editor_property(k, v)
    pp.settings = st
    return sun, sky


def ground(parent):
    a = spawn(unreal.StaticMeshActor, 'Obod/Yer', 'Yer', unreal.Vector(1485, 900, -2))
    a.set_actor_scale3d(unreal.Vector(600, 600, 1))           # the plane is 1 m: 600 m
    c = a.static_mesh_component
    c.set_static_mesh(unreal.load_asset('/Engine/BasicShapes/Plane'))
    c.set_material(0, instance('yer', {'color': (0.20, 0.19, 0.18), 'rough': 0.9, 'metal': 0.0}, parent))


def cameras():
    out = []
    for name, (p, t, vfov) in CAMS.items():
        loc, tgt = V(*p), V(*t)
        cam = spawn(unreal.CineCameraActor, 'Obod/Kameralar', 'Kamera_' + name, loc, unreal.MathLibrary.make_rot_from_x(tgt - loc))
        cc = cam.get_cine_camera_component()
        fb = cc.filmback
        fb.sensor_width, fb.sensor_height = 36.0, 20.25
        cc.filmback = fb
        cc.current_focal_length = (20.25 / 2) / math.tan(math.radians(vfov / 2))
        fs = cc.focus_settings
        fs.focus_method = unreal.CameraFocusMethod.DISABLE
        cc.focus_settings = fs
        out.append(cam)
    return out


def place(name, mesh):
    a = spawn(unreal.StaticMeshActor, 'Obod/Blok', name)
    c = a.static_mesh_component
    c.set_static_mesh(mesh)
    if name == 'blok1_oyna':
        # the fake rooms glow: kept out of Lumen, or every pane lights its balcony like a lamp
        c.set_editor_property('affect_dynamic_indirect_lighting', False)
        c.set_editor_property('affect_distance_field_lighting', False)
    return a


def glass_only():
    """ue_setup.py oyna — only the glass again (blok_clean.py output + M_Oyna) and the cameras; the rest stays"""
    by = {a.get_actor_label(): a for a in actors.get_all_level_actors()}
    for label, a in by.items():
        if label == 'blok1_oyna' or label.startswith('Kamera_'):
            actors.destroy_actor(a)
    for test in ('MI_Oyna', 'MI_OynaDbg'):                         # instances from the calibration
        if eal.does_asset_exist(ROOT + '/Mat/' + test):
            eal.delete_asset(ROOT + '/Mat/' + test)
    mats = {'glass': glass_material()}
    mesh = import_mesh('blok1_oyna')
    assign(mesh, mats)
    place('blok1_oyna', mesh)
    cameras()
    levels.save_current_level()
    print('oyna tayyor')


def main():
    if 'oyna' in sys.argv[1:]:
        return glass_only()
    open_level()
    specs = json.load(open(SRC + '/materials.json', encoding='utf-8'))
    specs.update(OVERRIDE)
    parent = master()
    mats = {k: instance(k, v, parent) for k, v in specs.items()}
    mats['glass'] = glass_material()
    for name in ('blok1', 'blok1_panjara', 'blok1_oyna'):
        mesh = import_mesh(name)
        assign(mesh, mats)
        place(name, mesh)
    ground(parent)
    sun, sky = environment()
    cams = cameras()
    sky.light_component.recapture_sky()
    levels.save_current_level()
    unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).set_level_viewport_camera_info(cams[0].get_actor_location(), cams[0].get_actor_rotation())
    print('tayyor', LEVEL)


main()
