# Blender (Cycles): one flat of the type-4 block, furnished, rendered as 360° panoramas (equirectangular), one per room.
#   node tools/interior/run.mjs [apt]        (export.mjs → fetch.mjs → this; or D:/blender.exe -b --factory-startup -P …)
# env: APT (4), PREVIEW=1 (2048×1024, 64 samples), ROOMS=living,kitchen (only those), SAMPLES, RES (width)
# in : tools/interior/out/storey3.json (walls, reveals, sills, frames, glass, floors of the typical storey, export.mjs),
#      src/block/data/plan_t4.json (rooms, flats, windows, doors), furn_t4.json (the architect's furniture symbols),
#      tools/interior/src (Poly Haven CC0 models, textures, the HDRI seen through the windows — fetch.mjs)
# out: public/pano/apt<N>/<room>.jpg + rooms.json (panorama per room: name, kind, camera, links to the other rooms)
# The flat's shell is the web app's own geometry (buildStorey), so the panoramas show exactly the drawn plan.
import array
import base64
import json
import math
import os
import random
import time

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(HERE, 'src')
APT = int(os.environ.get('APT', 4))
PREVIEW = os.environ.get('PREVIEW') == '1'
ONLY = [s for s in os.environ.get('ROOMS', '').split(',') if s]
OUT = os.path.join(ROOT, 'public', 'pano', 'apt%d' % APT)
SLAB, FLOOR_H, EYE = 0.2, 3.0, 1.55                 # finished floor, storey, eye height above the floor
t0 = time.time()
rnd = random.Random(APT * 7 + 3)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
plan = json.load(open(os.path.join(ROOT, 'src/block/data/plan_t4.json')))['3']
furn = json.load(open(os.path.join(ROOT, 'src/block/data/furn_t4.json')))['3']
apt = plan['apts'][APT]
rooms = [dict(plan['rooms'][i], idx=i) for i in apt['rooms']]
f32 = lambda s: array.array('f', base64.b64decode(s))


def P(x, y, z=0.0):
    """plan (x, y) + height → Blender (x, -y, z)"""
    return Vector((x, -y, z))


def in_poly(x, y, ring):
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


xs = [p[0] for p in apt['outline']['outer']]
ys = [p[1] for p in apt['outline']['outer']]
BB = (min(xs) - 0.45, min(ys) - 0.45, max(xs) + 0.45, max(ys) + 0.45)


# ------------------------------------------------------------------ materials
_luma = {}


def mean_luma(image):
    """average linear luminance of a colour texture (to normalise it before tinting)"""
    if image.name not in _luma:
        import numpy as np
        px = np.empty(image.size[0] * image.size[1] * 4, np.float32)
        image.pixels.foreach_get(px)
        _luma[image.name] = max(0.02, float((px.reshape(-1, 4)[:, :3] * (0.2126, 0.7152, 0.0722)).sum(1).mean()))
    return _luma[image.name]


def tex_nodes(nt, name, scale, tint=None, rough_mul=1.0, normal=0.6, rotate=0.0, flat=0.0):
    """Poly Haven texture set on box-projected object coordinates (metres), returns the BSDF"""
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / scale, 1 / scale, 1 / scale)
    mp.inputs['Rotation'].default_value = (0, 0, rotate)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])

    def img(file, colour):
        path = os.path.join(SRC, 'tex', name, file)
        if not os.path.exists(path):
            return None
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = bpy.data.images.load(path, check_existing=True)
        t.image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
        t.projection = 'BOX'
        t.projection_blend = 0.2
        nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
        return t
    d, r, n = img('diff.jpg', True), img('rough.jpg', False), img('nor.jpg', False)
    if d:
        out = d.outputs['Color']
        if tint:
            # the photo's own colour out (a red velvet, a blue linen …): its light and shade, normalised to 1 on
            # average, times the wanted colour
            bw = nt.nodes.new('ShaderNodeRGBToBW')
            nt.links.new(out, bw.inputs['Color'])
            k = nt.nodes.new('ShaderNodeMath')
            k.operation = 'MULTIPLY_ADD'                     # light and shade, flattened toward 1 by 'flat'
            k.inputs[1].default_value = (1.0 - flat) / mean_luma(d.image)
            k.inputs[2].default_value = flat
            nt.links.new(bw.outputs['Val'], k.inputs[0])
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            nt.links.new(k.outputs['Value'], mix.inputs['A'])
            mix.inputs['B'].default_value = tuple(tint) + (1,)
            out = mix.outputs['Result']
        nt.links.new(out, b.inputs['Base Color'])
    if r:
        m = nt.nodes.new('ShaderNodeMath')
        m.operation = 'MULTIPLY'
        m.inputs[1].default_value = rough_mul
        nt.links.new(r.outputs['Color'], m.inputs[0])
        nt.links.new(m.outputs['Value'], b.inputs['Roughness'])
    if n:
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = normal
        nt.links.new(n.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    return b


def mat(name, color=(0.8, 0.8, 0.8), rough=0.8, metal=0.0, tex=None, scale=1.0, tint=None, rough_mul=1.0, normal=0.6, rotate=0.0,
        emit=None, emit_k=0.0, alpha=1.0, sheen=0.0, flat=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = tuple(color) + (1,)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if sheen:
        b.inputs['Sheen Weight'].default_value = sheen
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
    if emit:
        b.inputs['Emission Color'].default_value = tuple(emit) + (1,)
        b.inputs['Emission Strength'].default_value = emit_k
    if tex:
        tex_nodes(m.node_tree, tex, scale, tint, rough_mul, normal, rotate, flat)
    return m


def glass_mat():
    """window glass: light passes straight (no refraction / caustics), reflections by Fresnel — fast and clean in Cycles"""
    m = bpy.data.materials.new('glass')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    tr.inputs['Color'].default_value = (0.93, 0.97, 0.96, 1)
    gl = nt.nodes.new('ShaderNodeBsdfGlossy')
    gl.inputs['Roughness'].default_value = 0.02
    fr = nt.nodes.new('ShaderNodeFresnel')
    fr.inputs['IOR'].default_value = 1.52
    mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fr.outputs['Fac'], mx.inputs['Fac'])
    nt.links.new(tr.outputs['BSDF'], mx.inputs[1])
    nt.links.new(gl.outputs['BSDF'], mx.inputs[2])
    nt.links.new(mx.outputs['Shader'], o.inputs['Surface'])
    return m


WALL = (0.88, 0.86, 0.82)
SHELL = {
    'paint': lambda: mat('wall', tex='painted_plaster_wall', scale=2.0, tint=WALL, rough_mul=1.0, normal=0.15, flat=0.8),
    'paint_public': lambda: mat('wall_public', tex='painted_plaster_wall', scale=2.0, tint=(0.80, 0.80, 0.78), normal=0.15, flat=0.8),
    'jamb': lambda: mat('jamb', WALL, 0.85),
    'cap': lambda: mat('jamb', WALL, 0.85),
    'sill': lambda: mat('sill', (0.92, 0.92, 0.90), 0.3),
    'tile_wall': lambda: mat('tile', tex='interior_tiles', scale=1.2, rough_mul=0.6, normal=0.8),
    'floor_tile': lambda: mat('tile', tex='interior_tiles', scale=1.2, rough_mul=0.6, normal=0.8),
    'floor_wood': lambda: mat('laminate', tex='laminate_floor_02', scale=2.4, rough_mul=0.8, normal=0.5),
    'frame': lambda: mat('pvc', (0.93, 0.93, 0.92), 0.3),
    'glass': glass_mat,
    'rail': lambda: mat('rail', (0.04, 0.045, 0.05), 0.4, 0.6),
}


def shell_mat(name):
    f = SHELL.get(name)
    return f() if f else mat('m_' + name, (0.55, 0.55, 0.53), 0.85)


# ------------------------------------------------------------------ the flat's shell (the web app's storey)
def build_shell():
    data = json.load(open(os.path.join(HERE, 'out/storey3.json')))
    bm = bmesh.new()
    me = bpy.data.meshes.new('shell')
    mats = []
    for g in data:
        if g['name'] in ('rail_panel', 'ceiling', 'stair'):
            continue
        Pp = f32(g['pos'])
        k = None
        for i in range(0, g['count'], 3):
            tri = [(Pp[(i + j) * 3], Pp[(i + j) * 3 + 1], Pp[(i + j) * 3 + 2]) for j in range(3)]
            cx = sum(t[0] for t in tri) / 3
            cz = sum(t[2] for t in tri) / 3
            if not (BB[0] < cx < BB[2] and BB[1] < cz < BB[3]):
                continue
            if k is None:
                m = shell_mat(g['name'])
                if m.name not in [x.name for x in mats]:
                    mats.append(m)
                k = [x.name for x in mats].index(m.name)
            vs = [bm.verts.new((x, -z, y)) for (x, y, z) in tri]
            try:
                f = bm.faces.new(vs)
                f.material_index = k
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new('shell', me)
    sc.collection.objects.link(ob)
    # the ceiling of the flat (the slab above): one plane over the whole crop
    bpy.ops.mesh.primitive_plane_add(size=1, location=((BB[0] + BB[2]) / 2, -(BB[1] + BB[3]) / 2, FLOOR_H))
    c = bpy.context.object
    c.name = 'ceiling'
    c.scale = (BB[2] - BB[0], BB[3] - BB[1], 1)
    c.rotation_euler = (math.pi, 0, 0)
    c.data.materials.append(mat('ceiling_paint', (0.9, 0.9, 0.88), 0.9))
    return ob


# ------------------------------------------------------------------ helpers for furniture
def box(name, m, x0, y0, z0, x1, y1, z1, bevel=0.0):
    """axis box in Blender coordinates"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.object
    o.name = name
    o.scale = (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width = bevel
        b.segments = 3
        b.limit_method = 'ANGLE'
    o.data.materials.append(m)
    return o


class Frame:
    """a furniture symbol's local frame: u along the wall it backs on (0…W), v away from it (0…D), h up from the floor"""

    def __init__(self, it):
        self.it = it
        b = it['back']
        x0, y0, x1, y1 = it['x0'], it['y0'], it['x1'], it['y1']
        self.W = (x1 - x0) if b in 'ns' else (y1 - y0)
        self.D = (y1 - y0) if b in 'ns' else (x1 - x0)
        # origin (plan) and axes (plan): back n — wall at y0, front toward +y …
        if b == 'n':
            self.o, self.u, self.v = (x0, y0), (1, 0), (0, 1)
        elif b == 's':
            self.o, self.u, self.v = (x1, y1), (-1, 0), (0, -1)
        elif b == 'w':
            self.o, self.u, self.v = (x0, y1), (0, -1), (1, 0)
        else:
            self.o, self.u, self.v = (x1, y0), (0, 1), (-1, 0)

    def plan(self, u, v):
        return (self.o[0] + self.u[0] * u + self.v[0] * v, self.o[1] + self.u[1] * u + self.v[1] * v)

    def at(self, u, v, h=0.0):
        x, y = self.plan(u, v)
        return P(x, y, SLAB + h)

    def yaw(self):
        """rotation about Z that turns a model facing Blender −Y (glTF front) to face this frame's front (+v)"""
        vx, vy = self.v[0], -self.v[1]                 # front direction in Blender
        return math.atan2(vx, -vy)

    def lbox(self, name, m, u0, v0, h0, u1, v1, h1, bevel=0.0):
        """box in the local frame (always axis-aligned in the plan: the symbols are)"""
        a, b = self.plan(u0, v0), self.plan(u1, v1)
        return box(name, m, min(a[0], b[0]), -max(a[1], b[1]), SLAB + h0, max(a[0], b[0]), -min(a[1], b[1]), SLAB + h1, bevel)


_cache = {}


def model(mid, variant=None):
    """a Poly Haven model as hidden template objects (instanced by place); returns (objects, low, high corner).
    variant: some files hold several versions side by side (pachira_aquatica_01_bark_a … _d): keep the one whose
    objects end in _<variant> (and what hangs under them)"""
    key = (mid, variant)
    if key not in _cache:
        path = os.path.join(SRC, 'models', mid, '%s_2k.gltf' % mid)
        if not os.path.exists(path):
            path = path.replace('_2k', '_1k')
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        objs = [o for o in bpy.data.objects if o not in before]
        if variant:
            base = lambda o: o.name.split('.')[0]
            keep = {o for o in objs if base(o).endswith('_' + variant)}
            keep |= {c for o in keep for c in o.children_recursive}
            keep |= {o.parent for o in list(keep) if o.parent in objs}
            drop = [o for o in objs if o not in keep]
            objs = [o for o in objs if o in keep]
            for o in drop:
                bpy.data.objects.remove(o)
        meshes = [o for o in objs if o.type == 'MESH']
        bpy.context.view_layer.update()
        lo = Vector((1e9, 1e9, 1e9))
        hi = -lo
        for o in meshes:
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, w))
                hi = Vector(map(max, hi, w))
        _cache[key] = (objs, lo, hi)
        for o in objs:
            o.hide_render = True
            o.hide_viewport = True
    return _cache[key]


def place(mid, fr, u, v, w=None, d=None, h=None, yaw_extra=0.0, lift=0.0, uniform=True, max_scale=1.25, min_scale=0.7, variant=None):
    """instance of a model, its footprint centred at (u, v) of the frame, fitted into w × d (and/or height h)"""
    objs, lo, hi = model(mid, variant)
    size = hi - lo
    s = []
    if w:
        s.append(w / max(size.x, 1e-3))
    if d:
        s.append(d / max(size.y, 1e-3))
    if h:
        s.append(h / max(size.z, 1e-3))
    k = min(s) if s else 1.0
    k = max(min_scale, min(max_scale, k)) if (w or d) and not h else k
    root = bpy.data.objects.new(mid + '_inst', None)
    sc.collection.objects.link(root)
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    # every object of the template copied (mesh data shared), each one under the copy of its own parent
    copies = {}
    for o in objs:
        c = o.copy()
        c.hide_render = c.hide_viewport = False
        sc.collection.objects.link(c)
        copies[o] = c
    for o, c in copies.items():
        if o.parent in copies:
            c.parent = copies[o.parent]
            c.matrix_parent_inverse = o.matrix_parent_inverse.copy()
        else:
            c.parent = root
            c.matrix_parent_inverse = Matrix.Translation(-centre)
    root.location = fr.at(u, v, lift)
    root.rotation_euler = (0, 0, fr.yaw() + yaw_extra)
    root.scale = (k, k, k)
    if not uniform and w and d:                       # tables: the top stretched to the footprint, the height kept
        root.scale = (w / max(size.x, 1e-3), d / max(size.y, 1e-3), 1.0 if not h else h / max(size.z, 1e-3))
    return root


def table(fr):
    """oak top on black steel legs"""
    m = mats()
    W, D = fr.W, fr.D
    fr.lbox('table_top', m['oak'], 0, 0, 0.72, W, D, 0.76, 0.006)
    for (u, v) in ((0.06, 0.06), (W - 0.1, 0.06), (0.06, D - 0.1), (W - 0.1, D - 0.1)):
        fr.lbox('table_leg', m['black'], u, v, 0, u + 0.04, v + 0.04, 0.72)
    note(*fr.plan(0, 0), *fr.plan(W, D))


def chair(fr):
    """upholstered seat and back on oak legs; the back on the frame's wall side"""
    m = mats()
    for (u, v) in ((0.03, 0.05), (0.42, 0.05), (0.03, 0.44), (0.42, 0.44)):
        fr.lbox('chair_leg', m['oak'], u, v, 0, u + 0.03, v + 0.03, 0.44, 0.004)
    fr.lbox('chair_seat', m['seat'], 0.0, 0.02, 0.43, 0.48, 0.50, 0.50, 0.025)
    fr.lbox('chair_back', m['seat'], 0.02, 0.02, 0.50, 0.46, 0.08, 0.86, 0.025)
    note(*fr.plan(0, 0), *fr.plan(0.48, 0.5))


def sofa_(fr):
    """a modern three-seat sofa: arms, base, seat and back cushions, two throw pillows"""
    m = mats()
    W, D = fr.W, fr.D
    for (u, v) in ((0.08, 0.1), (W - 0.12, 0.1), (0.08, D - 0.14), (W - 0.12, D - 0.14)):
        fr.lbox('sofa_leg', m['black'], u, v, 0, u + 0.04, v + 0.04, 0.10)
    fr.lbox('sofa_base', m['sofa'], 0.0, 0.04, 0.10, W, D, 0.40, 0.03)
    for u0, u1 in ((0.0, 0.18), (W - 0.18, W)):
        fr.lbox('sofa_arm', m['sofa'], u0, 0.04, 0.10, u1, D, 0.64, 0.05)
    n = 3
    seat = (W - 0.36) / n
    for i in range(n):
        u = 0.18 + i * seat
        fr.lbox('sofa_seat', m['sofa'], u + 0.005, 0.26, 0.40, u + seat - 0.005, D - 0.01, 0.56, 0.06)
        fr.lbox('sofa_back', m['sofa'], u + 0.005, 0.05, 0.40, u + seat - 0.005, 0.28, 0.90, 0.07)
    for uc in (0.36, W - 0.36):
        c = fr.at(uc, 0.36, 0.56)
        rounded('sofa_pillow', m['accent'], c.x, c.y, c.z, 0.42, 0.14, 0.40, rot=fr.yaw(), bevel=0.06, subdiv=2)
    note(*fr.plan(0, 0), *fr.plan(W, D))


def living(r):
    """the living room redrawn for the sale (the plan's symbols put an 8-seat table in it): a 4-seat dining table by
    the glass wall to the kitchen, a lounge at the far end — sofa on the long wall, coffee table, tv wall, rug, art"""
    ring = r['poly']['outer']
    x0, y0 = min(p[0] for p in ring), min(p[1] for p in ring)
    x1, y1 = max(p[0] for p in ring), max(p[1] for p in ring)
    cx = (x0 + x1) / 2
    ty0 = y0 + 0.75
    t = Frame({'back': 'n', 'x0': cx - 0.7, 'y0': ty0, 'x1': cx + 0.7, 'y1': ty0 + 0.85})
    table(t)
    for dx in (-0.35, 0.35):
        chair(Frame({'back': 'n', 'x0': cx + dx - 0.24, 'y0': ty0 - 0.56, 'x1': cx + dx + 0.24, 'y1': ty0 - 0.06}))
        chair(Frame({'back': 's', 'x0': cx + dx - 0.24, 'y0': ty0 + 0.91, 'x1': cx + dx + 0.24, 'y1': ty0 + 1.41}))
    # lounge: sofa on the east wall, tv on the west wall, clear of the door in the south wall
    sy0, sy1 = y1 - 2.75, y1 - 0.65
    sofa = Frame({'back': 'e', 'x0': x1 - 0.95, 'y0': sy0, 'x1': x1, 'y1': sy1})
    sofa_(sofa)
    art(sofa, sofa.W / 2, 1.2, 0.75, 1.05)
    ct = Frame({'back': 'e', 'x0': x1 - 1.85, 'y0': (sy0 + sy1) / 2 - 0.45, 'x1': x1 - 1.2, 'y1': (sy0 + sy1) / 2 + 0.45})
    place('modern_coffee_table_01', ct, ct.W / 2, ct.D / 2, w=ct.W, d=ct.D, max_scale=1.6, min_scale=0.5)
    note(*ct.plan(0, 0), *ct.plan(ct.W, ct.D))
    tv_unit(Frame({'back': 'w', 'x0': x0, 'y0': (sy0 + sy1) / 2 - 0.85, 'x1': x0 + 0.45, 'y1': (sy0 + sy1) / 2 + 0.85}))
    rug(*P(x1 - 1.45, (sy0 + sy1) / 2).xy, 2.0, 2.6)


def doors():
    """the flat's entrance door (closed, the public corridor is not built) and white casings round the inner doorways"""
    m = mats()
    leaf = mat('door_leaf', (0.18, 0.14, 0.11), 0.45, tex='laminate_floor_02', scale=1.2, tint=(0.32, 0.24, 0.18), normal=0.2, rotate=math.pi / 2)
    casing = mat('casing', (0.92, 0.92, 0.90), 0.4)
    head = 2.3
    for o in plan['openings']:
        if o['kind'] != 'door':
            continue
        cx, cy = centre(o)
        sides = [(cx, o['y0'] - 0.2), (cx, o['y1'] + 0.2)] if o['axis'] == 'x' else [(o['x0'] - 0.2, cy), (o['x1'] + 0.2, cy)]
        rs = [room_of(*s) for s in sides]
        if not any(rs):
            continue
        if any(r_ and r_['kind'] == 'balcony' for r_ in rs) or (not all(rs) and (o['y0'] < 0.5 or o['y1'] > 15.5)):
            continue                                          # glazed balcony doors and doors to outside
        if not all(rs):                                       # entrance from the public corridor: a closed leaf
            if o['axis'] == 'x':
                box('entrance', leaf, o['x0'], -(cy + 0.025), SLAB, o['x1'], -(cy - 0.025), SLAB + 2.1, 0.004)
            else:
                box('entrance', leaf, cx - 0.025, -o['y1'], SLAB, cx + 0.025, -o['y0'], SLAB + 2.1, 0.004)
            continue
        # casings, 7 cm wide, 1.5 cm proud, on both faces
        for side in (0, 1):
            if o['axis'] == 'x':
                f = o['y0'] if side == 0 else o['y1']
                d0, d1 = (f - 0.015, f) if side == 0 else (f, f + 0.015)
                box('casing', casing, o['x0'] - 0.07, -d1, SLAB, o['x0'], -d0, SLAB + head + 0.07)
                box('casing', casing, o['x1'], -d1, SLAB, o['x1'] + 0.07, -d0, SLAB + head + 0.07)
                box('casing', casing, o['x0'] - 0.07, -d1, SLAB + head - 0.2 + 0.2, o['x1'] + 0.07, -d0, SLAB + head + 0.07)
            else:
                f = o['x0'] if side == 0 else o['x1']
                d0, d1 = (f - 0.015, f) if side == 0 else (f, f + 0.015)
                box('casing', casing, d0, -o['y0'], SLAB, d1, -(o['y0'] - 0.07), SLAB + head + 0.07)
                box('casing', casing, d0, -(o['y1'] + 0.07), SLAB, d1, -o['y1'], SLAB + head + 0.07)
                box('casing', casing, d0, -(o['y1'] + 0.07), SLAB + head, d1, -(o['y0'] - 0.07), SLAB + head + 0.07)


def rounded(name, m, cx, cy, z0, sx, sy, sz, rot=0.0, bevel=0.06, subdiv=0):
    o = box(name, m, -sx / 2, -sy / 2, 0, sx / 2, sy / 2, sz, bevel)
    o.location = (cx, cy, z0)
    o.rotation_euler = (0, 0, rot)
    if subdiv:
        s = o.modifiers.new('sub', 'SUBSURF')
        s.levels = s.render_levels = subdiv
    return o


# ------------------------------------------------------------------ furniture materials (one palette per flat)
M = {}


def mats():
    if M:
        return M
    M.update(
        linen=mat('linen', (0.93, 0.92, 0.89), 0.95, tex='rough_linen', scale=0.5, tint=(1.0, 0.99, 0.96), normal=0.4, sheen=0.4),
        duvet=mat('duvet', (0.86, 0.83, 0.77), 0.95, tex='rough_linen', scale=0.45, tint=(0.97, 0.93, 0.86), normal=0.5, sheen=0.4),
        velour=mat('velour', (0.30, 0.36, 0.33), 0.8, tex='velour_velvet', scale=0.6, tint=(0.62, 0.72, 0.66), normal=0.5, sheen=0.6),
        accent=mat('accent', (0.55, 0.35, 0.22), 0.85, tex='velour_velvet', scale=0.6, tint=(0.95, 0.62, 0.40), normal=0.5, sheen=0.6),
        boucle=mat('boucle', (0.85, 0.82, 0.77), 1.0, tex='wool_boucle', scale=0.4, tint=(1.0, 0.97, 0.92), normal=0.8, sheen=0.5),
        rug=mat('rug', (0.60, 0.56, 0.50), 1.0, tex='rough_linen', scale=0.25, tint=(0.62, 0.57, 0.50), normal=1.2, sheen=0.4, flat=0.3),
        screen=mat('screen', (0.005, 0.005, 0.006), 0.08),
        sofa=mat('sofa', (0.70, 0.68, 0.64), 1.0, tex='rough_linen', scale=0.3, tint=(0.74, 0.72, 0.68), normal=0.9, sheen=0.5, flat=0.4),
        seat=mat('seat', (0.82, 0.78, 0.70), 1.0, tex='rough_linen', scale=0.3, tint=(0.86, 0.80, 0.70), normal=0.9, sheen=0.5, flat=0.4),
        bezel=mat('bezel', (0.02, 0.02, 0.022), 0.4),
        oak=mat('oak', (0.6, 0.45, 0.3), 0.5, tex='laminate_floor_02', scale=1.4, rough_mul=0.7, normal=0.3, rotate=math.pi / 2),
        white=mat('cabinet_white', (0.90, 0.90, 0.88), 0.45),
        grey=mat('cabinet_grey', (0.42, 0.44, 0.44), 0.5),
        black=mat('black_metal', (0.02, 0.02, 0.02), 0.35, 0.8),
        marble=mat('marble', (0.9, 0.9, 0.88), 0.2, tex='marble_01', scale=1.6, rough_mul=0.35, normal=0.2),
        cook=mat('cooktop', (0.008, 0.008, 0.01), 0.06),
        steel=mat('steel', (0.75, 0.76, 0.77), 0.22, 1.0),
        porcelain=mat('porcelain', (0.95, 0.95, 0.94), 0.08),
    )
    return M


def tulle_mat():
    """sheer tulle: lets light through, glows where the sun hits it"""
    m = bpy.data.materials.get('tulle')
    if m:
        return m
    m = bpy.data.materials.new('tulle')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    tl = nt.nodes.new('ShaderNodeBsdfTranslucent')
    tl.inputs['Color'].default_value = (0.92, 0.91, 0.88, 1)
    df = nt.nodes.new('ShaderNodeBsdfDiffuse')
    df.inputs['Color'].default_value = (0.92, 0.91, 0.88, 1)
    tp = nt.nodes.new('ShaderNodeBsdfTransparent')
    a = nt.nodes.new('ShaderNodeMixShader')
    a.inputs['Fac'].default_value = 0.5
    nt.links.new(tl.outputs['BSDF'], a.inputs[1])
    nt.links.new(df.outputs['BSDF'], a.inputs[2])
    b = nt.nodes.new('ShaderNodeMixShader')
    b.inputs['Fac'].default_value = 0.45                 # 45 % passes straight through
    nt.links.new(a.outputs['Shader'], b.inputs[1])
    nt.links.new(tp.outputs['BSDF'], b.inputs[2])
    nt.links.new(b.outputs['Shader'], o.inputs['Surface'])
    return m


boxes = []          # plan footprints of everything standing on the floor (x0, y0, x1, y1): kept clear by the cameras


def note(x0, y0, x1, y1):
    boxes.append((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)))


def bed(fr):
    m = mats()
    W, D = fr.W, fr.D
    fr.lbox('bed_base', m['velour'], 0.0, 0.06, 0.0, W, D, 0.32, 0.02)
    fr.lbox('headboard', m['velour'], -0.08, 0.0, 0.0, W + 0.08, 0.09, 1.15, 0.03)
    fr.lbox('mattress', m['linen'], 0.04, 0.12, 0.30, W - 0.04, D - 0.03, 0.52, 0.06)
    fr.lbox('duvet', m['duvet'], -0.03, 0.78, 0.49, W + 0.03, D + 0.03, 0.585, 0.05)
    fr.lbox('duvet_fold', m['duvet'], -0.03, 0.70, 0.55, W + 0.03, 0.95, 0.615, 0.05)
    fr.lbox('throw', m['accent'], -0.04, D - 0.62, 0.575, W + 0.04, D - 0.18, 0.60, 0.015)
    for k, uc in enumerate((W * 0.27, W * 0.73)):
        c = fr.at(uc, 0.36, 0.50)
        rounded('pillow%d' % k, m['linen'], c.x, c.y, c.z, min(0.62, W * 0.42), 0.40, 0.16, rot=fr.yaw(), bevel=0.07, subdiv=2)
    note(*fr.plan(0, 0), *fr.plan(W, D))
    # a picture over the headboard
    art(fr, W / 2, min(1.1, W * 0.62), 0.72, 1.45)


def art_mat():
    """an abstract canvas: soft noise in sand, terracotta and sage"""
    m = bpy.data.materials.get('art')
    if m:
        return m
    m = bpy.data.materials.new('art')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.85
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 1.6
    nz.inputs['Detail'].default_value = 3.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.35, (0.80, 0.70, 0.56, 1)
    els[1].position, els[1].color = 0.62, (0.62, 0.33, 0.22, 1)
    e = els.new(0.5)
    e.color = (0.45, 0.52, 0.45, 1)
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


def art(fr, uc, w, h, z0):
    """a framed canvas on the wall the frame backs on"""
    m = mats()
    fr.lbox('art_frame', m['oak'], uc - w / 2 - 0.025, 0.0, z0 - 0.025, uc + w / 2 + 0.025, 0.035, z0 + h + 0.025, 0.003)
    fr.lbox('art_canvas', art_mat(), uc - w / 2, 0.035, z0, uc + w / 2, 0.04, z0 + h)


def wardrobe(fr):
    m = mats()
    W, D = fr.W, max(fr.D, 0.55)
    fr.lbox('wardrobe', m['white'], 0, 0, 0, W, D - 0.02, 2.45, 0.004)
    n = max(2, round(W / 0.5))
    for i in range(n):
        u0, u1 = W * i / n + 0.002, W * (i + 1) / n - 0.002
        fr.lbox('wdoor', m['white'], u0, D - 0.02, 0.02, u1, D, 2.43, 0.002)
        hu = u1 - 0.05 if i % 2 == 0 else u0 + 0.035
        fr.lbox('handle', m['black'], hu, D, 1.0, hu + 0.015, D + 0.02, 1.35)
    note(*fr.plan(0, 0), *fr.plan(W, D))


def tv_unit(fr):
    m = mats()
    W, d = fr.W, 0.42
    fr.lbox('tv_unit', m['oak'], 0.0, 0.0, 0.18, W, d, 0.55, 0.01)
    for uu in (0.08, W - 0.1):
        fr.lbox('tv_leg', m['black'], uu, 0.06, 0.0, uu + 0.02, 0.08, 0.18)
        fr.lbox('tv_leg', m['black'], uu, d - 0.08, 0.0, uu + 0.02, d - 0.06, 0.18)
    tw = min(1.25, W * 0.92)
    th = tw * 9 / 16
    fr.lbox('tv_foot', m['black'], W / 2 - 0.12, 0.12, 0.55, W / 2 + 0.12, 0.30, 0.565)
    fr.lbox('tv_neck', m['black'], W / 2 - 0.03, 0.14, 0.565, W / 2 + 0.03, 0.17, 0.65)
    fr.lbox('tv_panel', m['bezel'], W / 2 - tw / 2, 0.10, 0.62, W / 2 + tw / 2, 0.135, 0.62 + th, 0.004)
    fr.lbox('tv_screen', m['screen'], W / 2 - tw / 2 + 0.008, 0.135, 0.628, W / 2 + tw / 2 - 0.008, 0.137, 0.612 + th)
    place('ceramic_vase_01', fr, W * 0.1, 0.2, h=0.28, lift=0.55)
    note(*fr.plan(0, 0), *fr.plan(W, d))


def nightstand(fr):
    place('side_table_01', fr, fr.W / 2, fr.D / 2, w=max(fr.W, 0.42), d=fr.D, max_scale=2)
    note(*fr.plan(0, 0), *fr.plan(fr.W, fr.D))


def armchair(fr):
    place('modern_arm_chair_01', fr, fr.W / 2, fr.D / 2, w=fr.W + 0.15, d=fr.D + 0.1)
    note(*fr.plan(0, 0), *fr.plan(fr.W, fr.D))


def pouf(fr):
    m = mats()
    c = fr.at(fr.W / 2, fr.D / 2)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=min(fr.W, fr.D) / 2, depth=0.42, location=(c.x, c.y, c.z + 0.21))
    o = bpy.context.object
    b = o.modifiers.new('bevel', 'BEVEL')
    b.width, b.segments = 0.06, 4
    o.data.materials.append(m['boucle'])
    bpy.ops.object.shade_smooth()
    note(*fr.plan(0, 0), *fr.plan(fr.W, fr.D))


def dining(fr, chairs):
    place('dining_table', fr, fr.W / 2, fr.D / 2, w=fr.W, d=fr.D + 0.15, max_scale=2, min_scale=0.4)
    note(*fr.plan(0, 0), *fr.plan(fr.W, fr.D))
    for c in chairs:
        cf = Frame(c)
        place('dining_chair_02', cf, cf.W / 2, cf.D / 2, w=0.48, d=0.52, max_scale=1.6)


def rug(cx, cy, w, d, rot=0.0):
    m = mats()
    bpy.ops.mesh.primitive_plane_add(size=1, location=(cx, cy, SLAB + 0.006))
    o = bpy.context.object
    o.scale = (w, d, 1)
    o.rotation_euler = (0, 0, rot)
    s = o.modifiers.new('thick', 'SOLIDIFY')
    s.thickness = 0.012
    o.data.materials.append(m['rug'])


def kitchen(room):
    """galley with an L: base units along the west wall and under the window, worktop, hob, sink, upper cabinets,
    fridge column (the drawn counter symbols overlap the walls; the units are snapped to the room)"""
    m = mats()
    xs_ = [p[0] for p in room['poly']['outer']]
    ys_ = [p[1] for p in room['poly']['outer']]
    x0, y0, x1, y1 = min(xs_), min(ys_), max(xs_), max(ys_)
    dep = 0.60
    runs = [(x0, y0, x0 + dep, y1 - 0.08), (x0 + dep, y0, x1 - 0.70, y0 + dep)]
    for (a, b, c, d) in runs:
        box('base', m['grey'], a, -d, SLAB + 0.10, c, -b, SLAB + 0.86, 0.003)
        box('plinth', m['black'], a + 0.05, -d + 0.05, SLAB, c - 0.05, -b - 0.05, SLAB + 0.10)
        box('top', m['marble'], a, -d, SLAB + 0.86, c, -b, SLAB + 0.90, 0.003)
        note(a, b, c, d)
    for i in range(12):                                   # door fronts along the west run
        yy = y0 + dep + i * 0.6
        if yy + 0.58 > y1 - 0.08:
            break
        box('door', m['grey'], x0 + dep, -(yy + 0.58), SLAB + 0.12, x0 + dep + 0.018, -(yy + 0.02), SLAB + 0.84, 0.002)
        box('handle', m['black'], x0 + dep + 0.018, -(yy + 0.45), SLAB + 0.80, x0 + dep + 0.03, -(yy + 0.15), SLAB + 0.815)
    hy = y0 + dep + 0.75                                  # hob and hood on the west run
    box('hob', m['cook'], x0 + 0.06, -(hy + 0.58), SLAB + 0.901, x0 + 0.56, -hy, SLAB + 0.907, 0.003)
    box('hood', m['steel'], x0 + 0.02, -(hy + 0.60), SLAB + 1.62, x0 + 0.50, -hy + 0.02, SLAB + 1.72, 0.01)
    sx = (x0 + dep + x1 - 0.70) / 2                       # sink under the window
    box('sink', m['steel'], sx - 0.30, -(y0 + 0.50), SLAB + 0.75, sx + 0.30, -(y0 + 0.08), SLAB + 0.905, 0.01)
    box('tap', m['steel'], sx - 0.015, -(y0 + 0.07), SLAB + 0.90, sx + 0.015, -(y0 + 0.05), SLAB + 1.20)
    box('upper', m['white'], x0, -(y1 - 0.08), SLAB + 1.50, x0 + 0.35, -(y0 + dep + 0.05), SLAB + 2.25, 0.003)
    box('splash', m['marble'], x0, -(y1 - 0.08), SLAB + 0.90, x0 + 0.012, -y0, SLAB + 1.50)
    box('fridge', m['steel'], x1 - 0.68, -(y0 + 0.66), SLAB, x1 - 0.02, -(y0 + 0.02), SLAB + 2.0, 0.01)
    note(x1 - 0.7, y0, x1, y0 + 0.7)
    place('potted_plant_04', Frame({'back': 'n', 'x0': sx + 0.35, 'y0': y0 + 0.1, 'x1': sx + 0.6, 'y1': y0 + 0.35}), 0.12, 0.12, h=0.35, lift=0.90)


def bath_items(items):
    m = mats()
    mirror = mat('mirror', (0.9, 0.9, 0.9), 0.02, 1.0)
    for it in items:
        fr = Frame(it)
        if it['t'] == 'tub':
            fr.lbox('tub', m['porcelain'], 0, 0, 0, fr.W, max(fr.D, 0.7), 0.58, 0.05)
        elif it['t'] == 'toilet':
            c = fr.at(fr.W / 2, 0.35)
            rounded('toilet', m['porcelain'], c.x, c.y, c.z, 0.38, 0.55, 0.42, rot=fr.yaw(), bevel=0.12, subdiv=1)
            fr.lbox('cistern', m['porcelain'], fr.W / 2 - 0.2, 0, 0.4, fr.W / 2 + 0.2, 0.18, 0.85, 0.03)
        elif it['t'] == 'basin':
            fr.lbox('vanity', m['oak'], 0, 0, 0.45, fr.W, 0.46, 0.85, 0.01)
            fr.lbox('basin', m['porcelain'], 0.1, 0.06, 0.85, fr.W - 0.1, 0.42, 0.95, 0.04)
            fr.lbox('mirror', mirror, 0.05, 0.0, 1.1, fr.W - 0.05, 0.015, 1.9)
        elif it['t'] == 'washer':
            fr.lbox('washer', m['white'], 0, 0, 0, max(fr.W, 0.6), max(fr.D, 0.58), 0.85, 0.02)
        note(*fr.plan(0, 0), *fr.plan(fr.W, fr.D))


# ------------------------------------------------------------------ curtains
def folds(name, m, a, b, z0, z1, depth, amp, period):
    """a hanging fabric panel along plan a → b, moved `depth` along the left normal of a → b (indoors), sine folds"""
    L = (Vector(b) - Vector(a)).length
    n = max(8, int(L / period * 8))
    tx, ty = (b[0] - a[0]) / L, (b[1] - a[1]) / L
    nx, ny = -ty, tx
    bm = bmesh.new()
    rows = []
    for z in (z0, z1):
        row = []
        for i in range(n + 1):
            s = L * i / n
            off = amp * math.sin(2 * math.pi * s / period)
            row.append(bm.verts.new(P(a[0] + tx * s + nx * (depth + off), a[1] + ty * s + ny * (depth + off), z)))
        rows.append(row)
    for i in range(n):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    me.materials.append(m)
    for p_ in me.polygons:
        p_.use_smooth = True
    sol = o.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.004
    return o


def curtains(op, inward, colour, tulle=True, side=True):
    """tulle over the opening and two side curtains, on a track just under the ceiling (plan units)"""
    if op['axis'] == 'x':
        c = (op['y0'] + op['y1']) / 2
        a, b = (op['x0'] - 0.30, c), (op['x1'] + 0.30, c)
        half = (op['y1'] - op['y0']) / 2
    else:
        c = (op['x0'] + op['x1']) / 2
        a, b = (c, op['y0'] - 0.30), (c, op['y1'] + 0.30)
        half = (op['x1'] - op['x0']) / 2
    L = math.dist(a, b)
    nx, ny = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
    if nx * inward[0] + ny * inward[1] < 0:
        a, b = b, a
    if tulle:
        folds('tulle', tulle_mat(), a, b, SLAB + 0.02, FLOOR_H - 0.06, half + 0.12, 0.025, 0.11)
    if side:
        cm = mat('curtain_' + colour[0], colour[1], 0.9, tex='velour_velvet', scale=0.5, tint=colour[1], normal=0.6, sheen=0.5)
        t = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
        for (s0, s1) in ((0, 0.42), (L - 0.42, L)):
            folds('curtain', cm, (a[0] + t[0] * s0, a[1] + t[1] * s0), (a[0] + t[0] * s1, a[1] + t[1] * s1),
                  SLAB + 0.01, FLOOR_H - 0.06, half + 0.22, 0.045, 0.16)


# ------------------------------------------------------------------ the flat furnished
NAMES = {'living': 'Mehmonxona', 'kitchen': 'Oshxona', 'bedroom': 'Yotoqxona', 'corridor': 'Koridor', 'hall': 'Dahliz', 'bath': 'Hammom'}
CURTAIN = [('sage', (0.45, 0.52, 0.47)), ('sand', (0.78, 0.68, 0.55)), ('clay', (0.62, 0.42, 0.33))]


def room_of(x, y):
    for r in rooms:
        if in_poly(x, y, r['poly']['outer']):
            return r
    return None


def centre(it):
    return ((it['x0'] + it['x1']) / 2, (it['y0'] + it['y1']) / 2)


def openings_of(r):
    """windows and glazed doors on the room's edge, with the indoor direction"""
    out = []
    for w in plan['windows'] + [o for o in plan['openings'] if o['kind'] == 'door']:
        cx, cy = centre(w)
        sides = [(cx, w['y0'] - 0.25), (cx, w['y1'] + 0.25)] if w['axis'] == 'x' else [(w['x0'] - 0.25, cy), (w['x1'] + 0.25, cy)]
        ins = [in_poly(x, y, r['poly']['outer']) for (x, y) in sides]
        if ins[0] == ins[1]:
            continue
        other = room_of(*sides[1 if ins[0] else 0])
        glazed = w in plan['windows'] or other is None or other['kind'] == 'balcony'
        if not glazed:
            continue
        inward = ((0, -1) if ins[0] else (0, 1)) if w['axis'] == 'x' else ((-1, 0) if ins[0] else (1, 0))
        out.append((w, inward, w in plan['windows']))
    return out


SPOT_W = float(os.environ.get('SPOTS', 6.0))      # W per recessed spot (warm 3000 K), on by day as well (archviz habit)


def spot_light(x, y):
    """a recessed downlight: a small glowing disc in a ring, and a spot lamp just under it"""
    m = mats()
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.045, depth=0.012, location=P(x, y, FLOOR_H - 0.006))
    ring_ = bpy.context.object
    ring_.data.materials.append(m['white'])
    bpy.ops.mesh.primitive_circle_add(vertices=24, radius=0.032, fill_type='NGON', location=P(x, y, FLOOR_H - 0.0125))
    disc = bpy.context.object
    disc.rotation_euler = (math.pi, 0, 0)
    disc.data.materials.append(mat('spot_glow', (1, 0.9, 0.75), 0.5, emit=(1.0, 0.82, 0.62), emit_k=40.0))
    if SPOT_W > 0:
        ld = bpy.data.lights.new('spot', 'SPOT')
        ld.energy = SPOT_W
        ld.color = (1.0, 0.84, 0.66)
        ld.spot_size = math.radians(110)
        ld.spot_blend = 0.8
        ld.shadow_soft_size = 0.03
        lo_ = bpy.data.objects.new('spot', ld)
        sc.collection.objects.link(lo_)
        lo_.location = P(x, y, FLOOR_H - 0.02)


def furnish():
    items = [it for it in furn if in_poly(*centre(it), apt['outline']['outer'])]
    chairs = [it for it in items if it['t'] == 'chair']
    for it in items:
        fr, r = Frame(it), room_of(*centre(it))
        kind = r['kind'] if r else None
        t = it['t']
        if t == 'bed':
            bed(fr)
            rug(*P(*fr.plan(fr.W / 2, fr.D * 0.62)).xy, fr.W + 1.3, 1.7, fr.yaw())
        elif t == 'wardrobe':
            wardrobe(fr)
        elif t == 'tv':
            tv_unit(fr)
        elif t == 'nightstand':
            nightstand(fr)
        elif t == 'armchair':
            armchair(fr)
        elif t == 'pouf':
            pouf(fr)
        elif t == 'table' and kind != 'living':
            near = [c for c in chairs if math.dist(centre(c), centre(it)) < 1.6]
            dining(fr, near)
    for r in rooms:
        if r['kind'] == 'kitchen':
            kitchen(r)
        elif r['kind'] == 'living':
            living(r)
    doors()
    bath_items([it for it in items if it['t'] in ('tub', 'toilet', 'basin') and (room_of(*centre(it)) or {}).get('kind') == 'bath'])
    # plants, ceiling lamps, curtains per room
    for k, r in enumerate(rooms):
        if r['kind'] not in ('living', 'bedroom', 'kitchen', 'corridor', 'hall'):
            continue
        ring = r['poly']['outer']
        x0, y0 = min(p[0] for p in ring), min(p[1] for p in ring)
        x1, y1 = max(p[0] for p in ring), max(p[1] for p in ring)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        # recessed spots in a grid (stretch ceilings, as in Tashkent's new flats); a pendant hung in front of the
        # panorama camera at eye height
        nx_, ny_ = max(1, round((x1 - x0) / 1.4)), max(1, round((y1 - y0) / 1.4))
        for i in range(nx_):
            for j in range(ny_):
                sx_, sy_ = x0 + (x1 - x0) * (i + 0.5) / nx_, y0 + (y1 - y0) * (j + 0.5) / ny_
                if not in_poly(sx_, sy_, ring):
                    continue
                spot_light(sx_, sy_)
        ops = openings_of(r)
        if r['kind'] in ('living', 'bedroom'):
            # a tall plant in the free corner nearest a window (or the room's far corner)
            corners = [(x0 + 0.35, y0 + 0.35), (x1 - 0.35, y0 + 0.35), (x0 + 0.35, y1 - 0.35), (x1 - 0.35, y1 - 0.35)]
            free = [c for c in corners if all(not (b[0] - 0.25 < c[0] < b[2] + 0.25 and b[1] - 0.25 < c[1] < b[3] + 0.25) for b in boxes)]
            if free:
                if ops:
                    wc = centre(ops[0][0])
                    free.sort(key=lambda c: math.dist(c, wc))
                pid, var = ('pachira_aquatica_01', 'd') if r['kind'] == 'living' else rnd.choice([('potted_plant_01', None), ('calathea_orbifolia_01', 'b')])
                place(pid, Frame({'back': 'n', 'x0': free[0][0] - 0.25, 'y0': free[0][1] - 0.25, 'x1': free[0][0] + 0.25, 'y1': free[0][1] + 0.25}),
                      0.25, 0.25, h=1.5 if r['kind'] == 'living' else 0.9, variant=var)
                note(free[0][0] - 0.3, free[0][1] - 0.3, free[0][0] + 0.3, free[0][1] + 0.3)
        for (w, inward, is_window) in ops:
            if r['kind'] == 'kitchen':
                curtains(w, inward, CURTAIN[1], tulle=True, side=False)
            elif r['kind'] in ('living', 'bedroom'):
                curtains(w, inward, CURTAIN[k % len(CURTAIN)], tulle=is_window, side=True)


# ------------------------------------------------------------------ light: the city outside, the sun on the street side
def world_and_light():
    import numpy as np
    w = bpy.data.worlds.new('city')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(os.path.join(SRC, 'hdri', 'rooftop_day_4k.hdr'))
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], env.inputs['Vector'])
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = float(os.environ.get('SKY', 1.0))
    img = env.image
    W, H = img.size
    px = np.empty(W * H * 4, np.float32)
    img.pixels.foreach_get(px)
    lum = (px.reshape(-1, 4)[:, :3] * (0.2126, 0.7152, 0.0722)).sum(1)
    i = int(lum.argmax())
    u, v = (i % W + 0.5) / W, (i // W + 0.5) / H
    phi = (u - 0.5) * 2 * math.pi
    sun_az = math.atan2(math.sin(phi), -math.cos(phi))
    target = math.atan2(1.0, 0.45)                       # the sun on the street side (Blender +Y), a little east
    mp.inputs['Rotation'].default_value = (0, 0, sun_az - target)
    print('hdri sun at u %.3f v %.3f (elevation %.0f°), turned by %.0f°' % (u, v, (v - 0.5) * 180, math.degrees(sun_az - target)))
    # light portals in the glazed openings: Cycles samples the sky through them (far less noise indoors)
    seen = set()
    for r in rooms:
        for (w_, inward, is_window) in openings_of(r):
            key = (w_['x0'], w_['y0'])
            if key in seen:
                continue
            seen.add(key)
            z0, z1 = (1.05, 2.5) if is_window else (SLAB, 2.5)
            cx, cy = centre(w_)
            span = (w_['x1'] - w_['x0']) if w_['axis'] == 'x' else (w_['y1'] - w_['y0'])
            ld = bpy.data.lights.new('portal', 'AREA')
            ld.shape = 'RECTANGLE'
            ld.size, ld.size_y = span, z1 - z0
            try:
                ld.cycles.is_portal = True
            except AttributeError:
                ld.is_portal = True
            lo = bpy.data.objects.new('portal', ld)
            sc.collection.objects.link(lo)
            lo.location = P(cx, cy, (z0 + z1) / 2)
            d = Vector((inward[0], -inward[1], 0))            # the portal shines indoors (area lights point along −Z)
            lo.rotation_euler = d.to_track_quat('-Z', 'Z').to_euler()


# ------------------------------------------------------------------ cameras: the clearest spot of every room
def spot(r):
    ring = r['poly']['outer']
    x0, y0 = min(p[0] for p in ring), min(p[1] for p in ring)
    x1, y1 = max(p[0] for p in ring), max(p[1] for p in ring)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    best, score = (cx, cy), -1e9

    def dseg(px, py, a, b):
        ax, ay = a
        bx, by = b
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / max(dx * dx + dy * dy, 1e-9)))
        return math.hypot(px - ax - t * dx, py - ay - t * dy)
    x = x0 + 0.3
    while x < x1 - 0.3:
        y = y0 + 0.3
        while y < y1 - 0.3:
            if in_poly(x, y, ring):
                dw = min(dseg(x, y, ring[i], ring[(i + 1) % len(ring)]) for i in range(len(ring)))
                df = min([max(b[0] - x, x - b[2], b[1] - y, y - b[3], 0.0) if not (b[0] < x < b[2] and b[1] < y < b[3]) else 0.0
                          for b in boxes] or [9])
                s = min(dw, df * 1.4) - 0.05 * math.hypot(x - cx, y - cy)
                if dw > 0.5 and s > score:
                    best, score = (x, y), s
            y += 0.08
        x += 0.08
    return best


def cameras():
    out = []
    count = {}
    for r in rooms:
        if r['kind'] not in NAMES or r['kind'] == 'bath':
            continue
        count[r['kind']] = count.get(r['kind'], 0) + 1
    seen = {}
    for r in rooms:
        if r['kind'] not in NAMES or r['kind'] == 'bath':
            continue
        seen[r['kind']] = seen.get(r['kind'], 0) + 1
        rid = r['kind'] + ('-%d' % seen[r['kind']] if count[r['kind']] > 1 else '')
        name = NAMES[r['kind']] + (' %d' % seen[r['kind']] if count[r['kind']] > 1 else '')
        x, y = spot(r)
        ops = openings_of(r)
        # the panorama opens toward the room's window (else along the room's long side)
        if ops:
            wx, wy = centre(ops[0][0])
            yaw = math.atan2(-(wy - y), wx - x) - math.pi / 2
        else:
            yaw = 0.0
        cd = bpy.data.cameras.new(rid)
        cd.type = 'PANO'
        try:
            cd.panorama_type = 'EQUIRECTANGULAR'
        except AttributeError:
            cd.cycles.panorama_type = 'EQUIRECTANGULAR'
        cd.clip_start = 0.05
        co = bpy.data.objects.new('cam_' + rid, cd)
        sc.collection.objects.link(co)
        co.location = P(x, y, SLAB + EYE)
        co.rotation_euler = (math.pi / 2, 0, yaw)
        out.append({'id': rid, 'name': name, 'kind': r['kind'], 'cam': co, 'pos': [round(x, 3), round(y, 3)], 'yaw': round(yaw, 4)})
    return out


def render(cams):
    sc.render.engine = 'CYCLES'
    cy = sc.cycles
    cy.device = 'CPU'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            prefs.compute_device_type = kind
            prefs.get_devices()
            if any(d.type == kind for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == kind
                cy.device = 'GPU'
                print('render on', kind)
                break
    except Exception as e:
        print('GPU unavailable:', e)
    cy.samples = int(os.environ.get('SAMPLES', 64 if PREVIEW else 512))
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.02 if PREVIEW else 0.008
    cy.use_denoising = True
    cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 12, 6, 4
    cy.transmission_bounces, cy.transparent_max_bounces = 8, 24
    cy.caustics_reflective = cy.caustics_refractive = False
    cy.sample_clamp_indirect = 10
    w = int(os.environ.get('RES', 2048 if PREVIEW else 4096))
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, w // 2, 100
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = 'AgX - Base Contrast'
    except TypeError:
        pass
    sc.view_settings.exposure = float(os.environ.get('EXPOSURE', 4.3))          # indoors: ~4.3 EV over the sky (3.5 dark, 5 burnt)
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 90
    os.makedirs(OUT, exist_ok=True)
    for c in cams:
        if ONLY and c['id'] not in ONLY and c['kind'] not in ONLY:
            continue
        sc.camera = c['cam']
        sc.render.filepath = os.path.join(OUT, c['id'] + '.jpg')
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print('PANO', c['id'], round(time.time() - t, 1), 's')


def plan_view():
    """a check from above: orthographic, ceiling hidden"""
    cd = bpy.data.cameras.new('top')
    cd.type = 'ORTHO'
    cd.ortho_scale = max(BB[2] - BB[0], BB[3] - BB[1]) + 0.4
    co = bpy.data.objects.new('cam_top', cd)
    sc.collection.objects.link(co)
    co.location = ((BB[0] + BB[2]) / 2, -(BB[1] + BB[3]) / 2, FLOOR_H - 0.05)
    bpy.data.objects['ceiling'].hide_render = True
    lamps = []
    for o in lamps:
        for ch in o.children_recursive:
            ch.hide_render = True
    sc.camera = co
    res = (sc.render.resolution_x, sc.render.resolution_y, sc.cycles.samples)
    sc.render.resolution_x = 900
    sc.render.resolution_y = int(900 * (BB[3] - BB[1]) / (BB[2] - BB[0]))
    sc.cycles.samples = 24
    sc.render.filepath = os.path.join(HERE, 'out', 'apt%d_plan.jpg' % APT)
    bpy.ops.render.render(write_still=True)
    sc.render.resolution_x, sc.render.resolution_y, sc.cycles.samples = res
    bpy.data.objects['ceiling'].hide_render = False
    for o in lamps:
        for ch in o.children_recursive:
            ch.hide_render = False


build_shell()
furnish()
world_and_light()
cams = cameras()
print('built', round(time.time() - t0, 1), 's; rooms', [(c['id'], c['pos']) for c in cams])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'out', 'apt%d.blend' % APT))
render([])                                                 # settings only
if os.environ.get('PLAN', '1') == '1':
    plan_view()
render(cams)
ORDER = ['living', 'kitchen', 'bedroom', 'corridor', 'hall']          # the tour opens in the living room
cams.sort(key=lambda c: (ORDER.index(c['kind']) if c['kind'] in ORDER else 9, c['id']))
others = lambda c: [o['id'] for o in cams if o is not c]
json.dump({'apt': APT, 'label': apt['label'], 'rooms': [{k: v for k, v in c.items() if k != 'cam'} | {'file': c['id'] + '.jpg', 'links': others(c)} for c in cams]},
          open(os.path.join(OUT, 'rooms.json'), 'w'), ensure_ascii=False, indent=1)
print('done', round(time.time() - t0, 1), 's')
