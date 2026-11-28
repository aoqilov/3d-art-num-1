# "Shaxmatka" volumes for Unreal, straight from src/block/data/plan_t4.json, same rules as src/block/aptVolumes.ts:
# every flat of the block is one closed solid (outline extruded 2.62 m, standing 0.2 m above the storey floor).
#   D:/blender-program/blender.exe -b --factory-startup -P tools/unreal/build_vols.py
# out: tools/unreal/out/vols.glb. Blender (x, y, z) = plan (x, -y, height), the same convention as build_f12.py, so the
# objects are placed exactly like the Blok1 storey meshes: actor at the block's plan origin, storey-local flats.
#   Vol_A2_<i>  the 7 flats of storey 2        (storey-local, place at the storey floor)
#   Vol_A3_<i>  the 7 flats of storeys 3-16    (storey-local, one mesh placed 14 times)
#   Vol_Rest    core / corridors of storeys 2-16 + the roof slab (absolute heights, pale glass in Unreal)
#   Vol_Shop    storey 1 (shops), absolute heights
import bpy, bmesh, json, os
from mathutils import Vector, geometry

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)
PLAN = json.load(open(os.path.join(ROOT, 'src/block/data/plan_t4.json'), encoding='utf-8'))
FLOORS, FLOOR_H, H, LIFT = 16, 3.0, 2.62, 0.2
bpy.ops.wm.read_factory_settings(use_empty=True)
PLACEHOLDER = bpy.data.materials.new('M_Vol')     # a primitive without a material imports as a bad mesh description in Unreal

def clean(r):
    out = []
    for p in r:
        if not out or abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) > 1e-4: out.append((p[0], p[1]))
    while len(out) > 2 and abs(out[0][0] - out[-1][0]) + abs(out[0][1] - out[-1][1]) <= 1e-4: out.pop()
    return out

def solid(name, items):
    """items: [(poly{outer,holes}, z0, z1)] -> one object with closed solids (outer walls + hole walls + caps)."""
    bm = bmesh.new()
    for poly, z0, z1 in items:
        outer = clean(poly['outer']); holes = [clean(h) for h in poly.get('holes', []) if len(clean(h)) > 2]
        if len(outer) < 3: continue
        rings = [outer] + holes
        pts = [p for r in rings for p in r]
        tris = geometry.tessellate_polygon([[Vector((u, -v, 0)) for (u, v) in r] for r in rings])
        vb = [bm.verts.new((u, -v, z0)) for (u, v) in pts]
        vt = [bm.verts.new((u, -v, z1)) for (u, v) in pts]
        for t in tris:
            for f in ((vt[t[0]], vt[t[1]], vt[t[2]]), (vb[t[2]], vb[t[1]], vb[t[0]])):
                try: bm.faces.new(f)
                except ValueError: pass
        k = 0
        for r in rings:
            n = len(r)
            for i in range(n):
                j = (i + 1) % n
                try: bm.faces.new((vb[k + i], vb[k + j], vt[k + j], vt[k + i]))
                except ValueError: pass
            k += n
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(PLACEHOLDER)
    me.uv_layers.new(name='UVMap')                    # Unreal wants a UV channel (all zero here)
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    print('OBJ', name, len(me.polygons), 'faces')
    return ob

for key, tag in (('2', 'A2'), ('3', 'A3')):
    for i, a in enumerate(PLAN[key]['apts']):
        solid('Vol_%s_%d' % (tag, i), [(a['outline'], LIFT, LIFT + H)])

rest = []
for s in range(2, FLOORS + 1):
    plan = PLAN['2' if s == 2 else '3']
    for r in plan['rest']: rest.append((r, (s - 1) * FLOOR_H + LIFT, (s - 1) * FLOOR_H + LIFT + H))
rest.append((PLAN['3']['footprint'], FLOORS * FLOOR_H, FLOORS * FLOOR_H + 0.25))
solid('Vol_Rest', rest)
solid('Vol_Shop', [(r, LIFT, LIFT + H) for r in PLAN['1']['rest']])

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'vols.glb'), export_format='GLB', export_yup=True, export_apply=True,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT')
print('DONE', os.path.join(OUT, 'vols.glb'))
