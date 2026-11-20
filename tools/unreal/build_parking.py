# Underground car park mesh from tools/unreal/out/parking.json (parking_layout.py) -> tools/unreal/out/parking.glb.
# Vertices already in Unreal space (Blender metres, y = -ue_y), actor at the origin. Slots:
#   M_PK_Floor (concrete, floor -3.60), M_PK_Ceil (underside of the courtyard slab, -0.35), M_PK_Wall (outline walls,
#   ramp head walls), M_PK_Col (0.6 m columns), M_PK_Band (yellow/black safety band on the column feet), M_PK_Paint
#   (white stall lines), M_PK_Core (lift / stair cores), M_PK_Door (lift doors), M_PK_Lobby (lobby floor tiles),
#   M_PK_Light (ceiling fixtures, emissive in Unreal). UVs: world metres.
#   D:/blender-program/blender.exe -b --factory-startup -P tools/unreal/build_parking.py
import bpy, bmesh, json, os, math
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'out', 'parking.json')))
ZF, ZC = D['z_floor'], D['z_ceil']
bpy.ops.wm.read_factory_settings(use_empty=True)
MATS = ['M_PK_Floor', 'M_PK_Ceil', 'M_PK_Wall', 'M_PK_Col', 'M_PK_Band', 'M_PK_Paint', 'M_PK_Core', 'M_PK_Door', 'M_PK_Lobby', 'M_PK_Light']
me = bpy.data.meshes.new('Parking')
for n in MATS: me.materials.append(bpy.data.materials.new(n))
MI = {n: i for i, n in enumerate(MATS)}
bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')

def face(pts, m):
    try: f = bm.faces.new([bm.verts.new(p) for p in pts])
    except ValueError: return None
    f.material_index = MI[m]; f.normal_update(); n = f.normal
    if abs(n.z) > 0.5:
        for lp in f.loops: lp[uv].uv = (lp.vert.co.x, lp.vert.co.y)
    else:
        t = Vector((-n.y, n.x, 0)).normalized()
        for lp in f.loops: lp[uv].uv = (lp.vert.co.dot(t), lp.vert.co.z)
    return f

def flat(rings, z, m, up=True):
    loops = [[Vector((x, y, z)) for x, y in r] for r in rings if len(r) >= 3]
    pts = [v for l in loops for v in l]
    for tri in tessellate_polygon(loops):
        a, b, c = (pts[i] for i in tri)
        if ((b - a).cross(c - a).z < 0) == up: a, c = c, a
        face([a, b, c], m)

def wall(a, b, z0, z1, look, m):
    """vertical quad a->b (xy), front facing the point `look`"""
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    q = [Vector((a.x, a.y, z0)), Vector((b.x, b.y, z0)), Vector((b.x, b.y, z1)), Vector((a.x, a.y, z1))]
    n = (q[1] - q[0]).cross(q[3] - q[0])
    if n.dot(Vector((look[0], look[1], 0)) - a) < 0: q.reverse()
    face(q, m)

def boxp(poly, z0, z1, m, top=True):
    """prism over a convex polygon (xy list), outward faces"""
    c = Vector((sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly), 0))
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        mid = Vector(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0))
        out = mid + (mid - c).normalized()
        wall(a, b, z0, z1, (out.x, out.y), m)
    if top: flat([poly], z1, m, up=True)

def sq(x, y, h, ang=0.0):
    c, s = math.cos(ang), math.sin(ang)
    return [(x + c * u - s * v, y + s * u + c * v) for u, v in ((-h, -h), (h, -h), (h, h), (-h, h))]

for p in D['floor']:
    flat(p, ZF, 'M_PK_Floor', up=True)
    flat(p, ZC, 'M_PK_Ceil', up=False)
for x1, y1, x2, y2, lx, ly in D['walls']:
    wall((x1, y1), (x2, y2), ZF, ZC, (lx, ly), 'M_PK_Wall')
# grid direction (plan x axis in Blender space) from the first stall line
ang = 0.0
if D['lines']:
    x1, y1, x2, y2 = D['lines'][0]; ang = math.atan2(y2 - y1, x2 - x1) + math.pi / 2
for x, y in D['cols']:
    boxp(sq(x, y, 0.3, ang), ZF + 1.0, ZC, 'M_PK_Col', top=False)
    boxp(sq(x, y, 0.302, ang), ZF, ZF + 1.0, 'M_PK_Band', top=False)
for x1, y1, x2, y2 in D['lines']:                            # 12 cm paint lines, 5 mm above the floor
    d = Vector((x2 - x1, y2 - y1, 0)); L = d.length
    if L < 0.1: continue
    n = Vector((-d.y, d.x, 0)).normalized() * 0.06
    a, b = Vector((x1, y1, ZF + 0.005)), Vector((x2, y2, ZF + 0.005))
    face([a - n, b - n, b + n, a + n] if (b - a).cross(n).z > 0 else [a + n, b + n, b - n, a - n], 'M_PK_Paint')
for core, lob, dr in zip(D['cores'], D['lobbies'], D['doors']):
    boxp(core, ZF, ZC, 'M_PK_Core', top=False)
    flat([lob], ZF + 0.01, 'M_PK_Lobby', up=True)
    (ax, ay), (bx, by), (fx, fy) = dr                         # two lift doors on the core face toward the lobby
    out = Vector((fx - ax, fy - ay, 0)).normalized()
    side = Vector((-out.y, out.x, 0))
    for cx_, cy_ in ((ax, ay), (bx, by)):
        c = Vector((cx_, cy_, 0)) + out * 0.03
        p0, p1 = c - side * 0.55, c + side * 0.55
        wall((p0.x, p0.y), (p1.x, p1.y), ZF + 0.01, ZF + 2.15, (c.x + out.x, c.y + out.y), 'M_PK_Door')
for hx, hy, ax, ay, bx, by in D['ramp_heads']:                # close the space under the ramp start
    wall((ax, ay), (bx, by), ZF - 0.2, -0.1, (hx, hy), 'M_PK_Wall')            # (hx, hy) = 1 m back toward the car park
for x, y in D['fixtures']:                                    # 1.2 m x 0.15 m fixtures 8 cm under the ceiling, across the aisle
    c, s = math.cos(ang), math.sin(ang)
    for off in (-1.5, 1.5):
        px, py = x + c * off, y + s * off
        q = [(px + c * u - s * v, py + s * u + c * v) for u, v in ((-0.075, -0.6), (0.075, -0.6), (0.075, 0.6), (-0.075, 0.6))]
        boxp(q, ZC - 0.08, ZC - 0.02, 'M_PK_Light', top=False)
        flat([q], ZC - 0.08, 'M_PK_Light', up=False)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
bm.to_mesh(me); bm.free()
ob = bpy.data.objects.new('Parking', me); bpy.context.collection.objects.link(ob)
bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, 'out', 'parking.glb'), export_format='GLB')
print('PARKING faces', len(me.polygons), 'stalls', D['stalls'])
