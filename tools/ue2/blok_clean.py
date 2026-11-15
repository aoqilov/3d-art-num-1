# Blender: the type-4 block ("Blok-1") as clean geometry for Unreal (the new project, ObodMaskanUE2).
#   D:/blender.exe -b --factory-startup -P tools/ue2/blok_clean.py          (node tools/ue2/run.mjs model)
# in : tools/blender/out/block_t4.json   (the drawings' exterior triangles per material: node tools/blender/export.mjs)
# out: <OUT>/blok1.fbx (walls, slabs, frames, glass …), <OUT>/blok1_panjara.fbx (balcony railings with real bars),
#      <OUT>/materials.json (colour / roughness / metal per material slot), tools/ue2/out/blok1_clean.blend
# Why: the web model is a triangle soup — every wall is a fan of long slivers and ~46 % of the triangles have zero area
# (they stitch collinear points). Unreal's mesh build drops those and the facade broke into shards and "teeth". Here:
# weld → dissolve the zero-area faces (their points move into the neighbour polygon) → merge coplanar faces of one
# material into polygons → triangulate them again with the 'beauty' rule. The railing panel (a bar texture on the
# web) becomes real 16 mm bars. UVs are world-aligned metres (1 UV = 1 m), so tiling materials need no unwrapping.
import array
import base64
import json
import math
import os
import random
import time

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.environ.get('OUT', 'D:/3d-aps/ObodMaskanUE2/Import')
BAR_STEP = float(os.environ.get('BAR_STEP', 0.11))      # bar centres along a railing panel (m)
BAR_W = float(os.environ.get('BAR_W', 0.016))            # bar section (m)
RAIL = {'rail'}                                           # posts and handrails (already geometry)
PANEL = 'rail_panel'                                      # the textured bar panel → real bars
GLASS = 'glass'                                           # panes: own mesh with the fake-room data (glass_uv)
FLOOR0, FLOOR_H, FLOORS = 0.2, 3.0, 16                    # first finished floor, storey height, storeys (the drawings)
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)

t0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
data = json.load(open(os.path.join(ROOT, 'tools/blender/out/block_t4.json')))
f32 = lambda s: array.array('f', base64.b64decode(s))
lin = lambda h: tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (1, 3, 5))


def soup(groups):
    """triangles of the groups in one bmesh (material index = position in groups); three (x, up, y) → Blender (x, -y, up)"""
    bm = bmesh.new()
    for k, g in enumerate(groups):
        P = f32(g['pos'])
        for i in range(0, g['count'], 3):
            vs = [bm.verts.new((P[j * 3], -P[j * 3 + 2], P[j * 3 + 1])) for j in (i, i + 1, i + 2)]
            f = bm.faces.new(vs)
            f.material_index = k
    return bm


def degenerate(bm, eps=1e-6):
    return sum(1 for f in bm.faces if f.calc_area() < eps)


def sliver(bm):
    """triangles thinner than 1:40 (shortest height / longest edge) — what showed as shards"""
    n = 0
    for f in bm.faces:
        if len(f.verts) != 3:
            continue
        a = f.calc_area()
        L = max(e.calc_length() for e in f.edges)
        if L > 0.05 and a > 1e-6 and 2 * a / L / L < 1 / 40:
            n += 1
    return n


def clean(bm, label):
    before = len(bm.faces)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    d0 = degenerate(bm)
    bmesh.ops.dissolve_degenerate(bm, dist=0.0002, edges=bm.edges)
    # coplanar neighbours of one material become one polygon; the angle keeps real folds (bevels are 35°+)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), use_dissolve_boundaries=False,
                             verts=bm.verts, edges=bm.edges, delimit={'MATERIAL'})
    bmesh.ops.dissolve_degenerate(bm, dist=0.0002, edges=bm.edges)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    polys = len(bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY', ngon_method='BEAUTY')
    # a polygon with collinear points can still leave a zero-area triangle: one more pass
    bmesh.ops.dissolve_degenerate(bm, dist=0.0002, edges=bm.edges)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method='BEAUTY', ngon_method='BEAUTY')
    print('%-8s tris %6d → polygons %6d → tris %6d | zero-area %6d → %d | slivers %d'
          % (label, before, polys, len(bm.faces), d0, degenerate(bm), sliver(bm)))


def world_uv(bm):
    """1 UV = 1 m, walls: (along the wall, height), floors / ceilings: (x, y)"""
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        n = f.normal
        if abs(n.z) > 0.7:
            for lp in f.loops:
                lp[uv].uv = (lp.vert.co.x, lp.vert.co.y)
        else:
            t = Vector((-n.y, n.x, 0)).normalized()
            for lp in f.loops:
                lp[uv].uv = (lp.vert.co.dot(t), lp.vert.co.z)


def islands_of(bm):
    """connected face patches"""
    bm.faces.ensure_lookup_table()
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, isl = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        out.append(isl)
    return out


def face_out(bm, bvh):
    """turn every pane to face outdoors: many panes of the drawings face the rooms (the web draws glass two-sided,
    Unreal culls the back) — rays from a few points of the pane: indoors they meet the shell (the far facade, slabs),
    outdoors they leave; hits nearer than 15 cm are the pane's own frame and mullions"""
    flipped = 0
    for isl in islands_of(bm):
        n = Vector((0, 0, 0))
        for f in isl:
            n += f.normal * f.calc_area()
        if n.length < 1e-6:
            continue
        n.normalize()
        pts = [v.co for f in isl for v in f.verts]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        vote = 0
        for a in (0.2, 0.5, 0.8):
            for b in (0.3, 0.7):
                s = Vector((lo.x + (hi.x - lo.x) * a, lo.y + (hi.y - lo.y) * a, lo.z + (hi.z - lo.z) * b))
                fwd = bvh.ray_cast(s + n * 0.15, n, 60.0)[0] is not None
                back = bvh.ray_cast(s - n * 0.15, -n, 60.0)[0] is not None
                vote += (1 if back else 0) - (1 if fwd else 0)       # > 0: the normal already points out
        if vote < 0:
            bmesh.ops.reverse_faces(bm, faces=isl)
            flipped += 1
    bm.normal_update()
    print('panes turned to face outdoors:', flipped)


def glass_uv(bm):
    """per pane, for the glass material's fake room (interior mapping) — extra UV sets:
       'local' (m along the pane from its lower left: along the wall, up), 'size' (width, height m),
       'room' (sill: floor below the pane, top: pane top to the ceiling, m), 'rnd' (two random numbers: room, curtains)
       The along-the-wall direction is (-n.y, n.x) in Blender = (n.y, -n.x) in Unreal, which the material rebuilds."""
    lay = {k: bm.loops.layers.uv.new(k) for k in ('local', 'size', 'room', 'rnd', 'kind')}
    # finished floors at 0.2 + 3 k, slab undersides 0.2 m below the next floor (checked in block_t4.json)
    levels = [0.0] + [FLOOR0 + FLOOR_H * i for i in range(FLOORS + 1)]
    panes = []
    for isl in islands_of(bm):
        n = Vector((0, 0, 0))
        for f in isl:
            n += f.normal * f.calc_area()
        n.z = 0
        if n.length < 1e-6:
            continue
        n.normalize()
        t = Vector((-n.y, n.x, 0))
        pts = {v for f in isl for v in f.verts}
        us = [v.co.dot(t) for v in pts]
        zs = [v.co.z for v in pts]
        c = sum((v.co for v in pts), Vector()) / len(pts)
        panes.append({'isl': isl, 'n': n, 't': t, 'u0': min(us), 'u1': max(us), 'z0': min(zs), 'z1': max(zs), 'd': c.dot(n), 'c': c})
    # the sashes of one window (same plane, same bottom and top, side by side) share the room and the curtains
    parent = list(range(len(panes)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for i, a in enumerate(panes):
        for j in range(i + 1, len(panes)):
            b = panes[j]
            if a['n'].dot(b['n']) > 0.99 and abs(a['d'] - b['d']) < 0.08 and abs(a['z0'] - b['z0']) < 0.05 \
                    and abs(a['z1'] - b['z1']) < 0.05 and max(a['u0'], b['u0']) - min(a['u1'], b['u1']) < 0.3:
                parent[find(i)] = find(j)
    groups = {}
    for i in range(len(panes)):
        groups.setdefault(find(i), []).append(panes[i])
    stats = []
    for grp in groups.values():
        t = grp[0]['t']
        u0, u1 = min(p['u0'] for p in grp), max(p['u1'] for p in grp)
        z0, z1 = min(p['z0'] for p in grp), max(p['z1'] for p in grp)
        w, h = u1 - u0, z1 - z0
        fl = max(l for l in levels if l <= z0 + 0.05)
        up = [l for l in levels if l > z0 + 0.05]
        ceil = (up[0] if up else fl + FLOOR_H) - 0.2
        sill, top = z0 - fl, max(0.05, ceil - (z0 + h))
        c = sum((p['c'] for p in grp), Vector()) / len(grp)
        rng = random.Random('%.2f,%.2f,%.2f' % (c.x, c.y, c.z))
        r = (rng.random(), rng.random())
        shop = 1.0 if z0 < FLOOR0 + FLOOR_H - 0.5 else 0.0          # ground floor: shop / lobby
        for p in grp:
            for f in p['isl']:
                for lp in f.loops:
                    lp[lay['local']].uv = (lp.vert.co.dot(t) - u0, lp.vert.co.z - z0)
                    lp[lay['size']].uv = (w, h)
                    lp[lay['room']].uv = (sill, top)
                    lp[lay['rnd']].uv = r
                    lp[lay['kind']].uv = (shop, 0.0)
        stats.append((round(z0, 2), round(w, 2), round(h, 2), round(sill, 2), round(top, 2), len(grp)))
    print('glass panes', len(panes), '→ windows', len(stats), 'e.g.', stats[:6])
    print('  ground floor panes', sum(1 for s in stats if s[0] < FLOOR0 + FLOOR_H - 0.5),
          '| sill values', sorted({s[3] for s in stats}), '| top values', sorted({s[4] for s in stats}))


def bars(groups):
    """real bars for every railing panel: a panel is a connected vertical patch; bars stand along its long side"""
    pan = soup(groups)
    bmesh.ops.remove_doubles(pan, verts=pan.verts, dist=0.0005)
    islands = islands_of(pan)
    out = bmesh.new()
    nb = 0
    for isl in islands:
        big = max(isl, key=lambda f: f.calc_area())
        n = big.normal.copy()
        n.z = 0
        if n.length < 0.5:
            continue
        n.normalize()
        t = Vector((-n.y, n.x, 0))
        pts = {v for f in isl for v in f.verts}
        us = [v.co.dot(t) for v in pts]
        zs = [v.co.z for v in pts]
        d = sum(v.co.dot(n) for v in pts) / len(pts)
        u0, u1, z0, z1 = min(us), max(us), min(zs), max(zs)
        k = max(1, round((u1 - u0) / BAR_STEP))
        step = (u1 - u0) / k
        for i in range(k + 1):
            if i in (0, k):
                continue                                   # the end posts are already there ('rail')
            c = t * (u0 + i * step) + n * d
            m = bmesh.ops.create_cube(out, size=1.0)
            for v in m['verts']:
                lx, ly, lz = v.co
                v.co = Vector((c.x, c.y, 0)) + t * (lx * BAR_W) + n * (ly * BAR_W) + Vector((0, 0, z0 + (lz + 0.5) * (z1 - z0)))
            nb += 1
    pan.free()
    print('railing panels', len(islands), 'bars', nb)
    return out


def to_object(name, bm, groups, extra=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    for g in groups:
        me.materials.append(material(g))
    if extra is not None:                                  # bars: appended with the last material index ('rail')
        bme = bmesh.new()
        bme.from_mesh(me)
        k = len(groups) - 1
        vmap = {}
        for v in extra.verts:
            vmap[v] = bme.verts.new(v.co)
        for f in extra.faces:
            nf = bme.faces.new([vmap[v] for v in f.verts])
            nf.material_index = k
        bmesh.ops.triangulate(bme, faces=bme.faces, quad_method='BEAUTY', ngon_method='BEAUTY')
        bme.normal_update()
        world_uv(bme)
        bme.to_mesh(me)
        bme.free()
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(30))     # flat walls, smooth arch curves
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


_mats = {}


def material(g):
    if g['name'] in _mats:
        return _mats[g['name']]
    m = bpy.data.materials.new(g['name'])
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = lin(g['color']) + (1,)
    b.inputs['Roughness'].default_value = g['rough']
    b.inputs['Metallic'].default_value = g['metal']
    _mats[g['name']] = m
    return m


main_g = [g for g in data if g['name'] not in RAIL and g['name'] not in (PANEL, GLASS)]
rail_g = [g for g in data if g['name'] in RAIL]
panel_g = [g for g in data if g['name'] == PANEL]
glass_g = [g for g in data if g['name'] == GLASS]

bm = soup(main_g)
clean(bm, 'blok1')
bm.normal_update()
world_uv(bm)
blok = to_object('blok1', bm, main_g)
bm.free()

bm = soup(rail_g)
clean(bm, 'panjara')
bm.normal_update()
world_uv(bm)
rail = to_object('blok1_panjara', bm, rail_g, extra=bars(panel_g))
bm.free()

# glass panes: own mesh, UV 0 world metres, UV 1–4 the pane data of glass_uv (Unreal: TexCoord 1–4)
bm = soup(glass_g)
clean(bm, 'oyna')
bm.normal_update()
face_out(bm, BVHTree.FromObject(blok, bpy.context.evaluated_depsgraph_get()))
world_uv(bm)
glass_uv(bm)
glass = to_object('blok1_oyna', bm, glass_g)
bm.free()
print('objects', [(o.name, len(o.data.polygons)) for o in (blok, rail, glass)], round(time.time() - t0, 1), 's')

json.dump({g['name']: {'color': g['color'], 'rough': g['rough'], 'metal': g['metal']} for g in data},
          open(os.path.join(OUT, 'materials.json'), 'w'), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'out/blok1_clean.blend'))


def export(ob, path):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    # Unreal: 1 Blender m = 100 cm (FBX unit scale), X stays, Unreal Y = -Blender Y, Z up
    bpy.ops.export_scene.fbx(filepath=path, use_selection=True, object_types={'MESH'}, apply_unit_scale=True,
                             apply_scale_options='FBX_SCALE_NONE', axis_forward='-Z', axis_up='Y',
                             mesh_smooth_type='FACE', use_mesh_modifiers=True, add_leaf_bones=False,
                             bake_anim=False, path_mode='STRIP')
    print('fbx', path, round(os.path.getsize(path) / 1e6, 1), 'MB')


export(blok, os.path.join(OUT, 'blok1.fbx'))
export(rail, os.path.join(OUT, 'blok1_panjara.fbx'))
export(glass, os.path.join(OUT, 'blok1_oyna.fbx'))
print('done', round(time.time() - t0, 1), 's')
