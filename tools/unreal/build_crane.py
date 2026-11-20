# Tower crane for the construction animation (Unreal BP_Kran). Five separate objects, each with its own pivot, so the
# blueprint can move them:
#   Kran_Mast    lattice mast 60 m, pivot at the TOP centre (the blueprint lifts it as storeys rise; the rest is underground)
#   Kran_Top     slewing part: turntable, cab, A-frame peak, 30 m jib along +X, 14 m counter-jib with ballast, ties
#                pivot at the slewing ring (top of mast)
#   Kran_Trolley trolley under the jib chord, pivot at the trolley centre (blueprint moves it along +X)
#   Kran_Cable   1 m vertical cable pair, pivot at the top (blueprint scales Z = hook depth)
#   Kran_Hook    hook block + a hanging pallet of blocks, pivot at the top of the block
#   Kran_Net     one storey of scaffolding in green safety netting around block 2 (placed per storey, "Pardozlash")
# Yellow crane steel, dark grey ballast, light concrete-grey pallet. Metres, Z up, jib along +X.
#   D:/blender-program/blender.exe -b --factory-startup -P tools/unreal/build_crane.py  ->  tools/unreal/out/crane.glb
import bpy, bmesh, os, math
from mathutils import Vector, Matrix
bpy.ops.wm.read_factory_settings(use_empty=True)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

def mat(name, hexc, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = [(int(hexc[i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5)] + [1]
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
YEL, DARK, STEEL, GLASS, LOAD = (mat('M_CraneYellow', '#e3a51c', 0.45, 0.3), mat('M_CraneDark', '#3a3c40', 0.7),
                                 mat('M_CraneSteel', '#8a8d91', 0.35, 0.9), mat('M_CraneGlass', '#2b3a44', 0.1),
                                 mat('M_CraneLoad', '#b9b4aa', 0.85))

class M:
    def __init__(s, name): s.bm = bmesh.new(); s.name = name; s.mats = []
    def mi(s, m):
        if m not in s.mats: s.mats.append(m)
        return s.mats.index(m)
    def box(s, c, size, m, rot=None):
        r = bmesh.ops.create_cube(s.bm, size=1.0)
        T = Matrix.Translation(Vector(c)) @ (rot.to_4x4() if rot else Matrix()) @ Matrix.Diagonal((*size, 1))
        bmesh.ops.transform(s.bm, matrix=T, verts=r['verts'])
        k = s.mi(m)
        for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = k
    def bar(s, a, b, t, m):                      # square bar of side t from a to b
        a, b = Vector(a), Vector(b); d = b - a; L = d.length
        if L < 1e-6: return
        z = d.normalized(); x = z.orthogonal().normalized(); y = z.cross(x)
        R = Matrix((x, y, z)).transposed()
        s.box((a + b) / 2, (t, t, L), m, R)
    def done(s):
        me = bpy.data.meshes.new(s.name); s.bm.to_mesh(me); s.bm.free()
        for m in s.mats: me.materials.append(m)
        ob = bpy.data.objects.new(s.name, me); bpy.context.collection.objects.link(ob); return ob

def lattice(o, p0, p1, w, step, t, m):
    """Square lattice column/beam of width w from p0 to p1: 4 chords, a ring and a diagonal every step."""
    p0, p1 = Vector(p0), Vector(p1); d = p1 - p0; L = d.length; z = d.normalized()
    x = z.orthogonal().normalized(); y = z.cross(x); h = w / 2
    cs = [(-h, -h), (h, -h), (h, h), (-h, h)]
    for (u, v) in cs: o.bar(p0 + x * u + y * v, p1 + x * u + y * v, t * 1.4, m)
    n = max(1, round(L / step))
    for i in range(n + 1):
        q = p0 + z * (L * i / n)
        for k in range(4):
            (u0, v0), (u1, v1) = cs[k], cs[(k + 1) % 4]
            o.bar(q + x * u0 + y * v0, q + x * u1 + y * v1, t, m)
        if i < n:
            q2 = p0 + z * (L * (i + 1) / n)
            for k in range(4):
                (u0, v0), (u1, v1) = cs[k], cs[(k + 1) % 4]
                a_, b_ = (q, q2) if (i + k) % 2 == 0 else (q2, q)
                o.bar(a_ + x * u0 + y * v0, b_ + x * u1 + y * v1, t * 0.8, m)

# mast: 60 m, 1.6 m square, pivot at the top -> geometry from z = -60 to 0
mast = M('Kran_Mast')
lattice(mast, (0, 0, -60), (0, 0, 0), 1.6, 1.6, 0.07, YEL)
mast.done()

# slewing top: z = 0 is the slewing ring
top = M('Kran_Top')
top.box((0, 0, 0.35), (2.4, 2.4, 0.7), YEL)                               # turntable
top.box((0.2, -1.9, 1.8), (2.2, 1.6, 2.4), YEL)                            # cab
top.box((0.2, -2.72, 2.0), (1.9, 0.05, 1.3), GLASS)                        # cab glass (front)
top.box((1.32, -1.9, 2.0), (0.05, 1.3, 1.3), GLASS)                        # cab glass (side)
lattice(top, (0, 0, 0.7), (0, 0, 9.0), 1.4, 1.4, 0.06, YEL)                # A-frame peak (tower head)
lattice(top, (0.5, 0, 1.6), (30, 0, 1.6), 1.2, 2.0, 0.055, YEL)            # jib, 30 m along +X (owner 2026-11-20: shorter)
lattice(top, (-0.5, 0, 1.6), (-14, 0, 1.6), 1.2, 2.0, 0.055, YEL)          # counter-jib
for i in range(4):                                                         # ballast blocks at the counter-jib end
    top.box((-12.2 + i * 0.9 * 0, -0.0, -0.2 - i * 0.0), (0.1, 0.1, 0.1), DARK)
top.box((-12.0, 0, 0.3), (3.0, 2.2, 2.6), DARK)
top.box((-7.0, 0, 2.6), (2.0, 1.6, 0.8), YEL)                              # machinery deck / winch
for (xa, za) in ((30, 2.2), (15, 2.2), (-14, 2.2)):                         # pendant ties from the peak
    top.bar((0, 0.25, 9.0), (xa, 0.25, za), 0.05, STEEL); top.bar((0, -0.25, 9.0), (xa, -0.25, za), 0.05, STEEL)
top.done()

# trolley under the jib bottom chord (jib bottom at z = 1.0)
tr = M('Kran_Trolley')
tr.box((0, 0, 0.75), (1.4, 1.5, 0.4), YEL)
for sx in (-0.5, 0.5):
    for sy in (-0.65, 0.65): tr.box((sx, sy, 0.98), (0.3, 0.12, 0.16), DARK)
tr.box((0, 0, 0.45), (0.5, 0.5, 0.3), DARK)                                # sheave block
tr.done()

# cable: two ropes, 1 m, pivot at top
cb = M('Kran_Cable')
cb.bar((0, 0.12, 0), (0, 0.12, -1), 0.03, STEEL); cb.bar((0, -0.12, 0), (0, -0.12, -1), 0.03, STEEL)
cb.done()

# hook block + slings + pallet of blocks (pivot at the top of the hook block)
hk = M('Kran_Hook')
hk.box((0, 0, -0.35), (0.6, 0.5, 0.7), YEL)
hk.box((0, 0, -0.85), (0.12, 0.12, 0.3), DARK)                             # hook shank
for (sx, sy) in ((-0.7, -0.5), (0.7, -0.5), (0.7, 0.5), (-0.7, 0.5)):        # slings
    hk.bar((0, 0, -1.0), (sx, sy, -3.0), 0.025, DARK)
hk.box((0, 0, -3.1), (1.6, 1.2, 0.15), DARK)                               # pallet
for i in range(3):
    for j in range(2):
        hk.box((-0.5 + i * 0.5, -0.28 + j * 0.56, -2.72), (0.46, 0.5, 0.6), LOAD)   # block stack
hk.done()

# ---- Kran_Net: one storey (3 m) of facade scaffolding wrapped in green safety netting, around block 2's footprint
# (plan x 0..29.7, y 0..18.09 + street balconies to y -1.42). Pivot = storey floor level at the block origin, Blender
# axes (x, -plan y, z). Steel tubes 0.35 m inside the netting: standards every ~2.5 m, ledgers at 0 / 1.5 m.
import numpy as np
NX0, NX1, NY0, NY1 = -0.9, 30.6, -2.3, 19.0                     # netting rectangle (plan metres)
SX0, SX1, SY0, SY1 = NX0 + 0.35, NX1 - 0.35, NY0 + 0.35, NY1 - 0.35
img = bpy.data.images.new('T_Net', 128, 128, alpha=True)        # 8 x 8 mesh cells per tile (tile = 0.5 m)
yy, xx = np.mgrid[0:128, 0:128]
line = ((xx % 16) < 3) | ((yy % 16) < 3)
px = np.zeros((128, 128, 4), np.float32)
px[..., 0], px[..., 1], px[..., 2] = 0.10, 0.42, 0.16
px[..., 3] = np.where(line, 0.92, 0.42)
img.pixels.foreach_set(px.ravel()); img.pack()
NET = bpy.data.materials.new('M_SafetyNet'); NET.use_nodes = True
nt = NET.node_tree; bsdf = nt.nodes['Principled BSDF']
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
bsdf.inputs['Roughness'].default_value = 0.9
NET.blend_method = 'BLEND'; NET.use_backface_culling = False
TUBE = mat('M_ScaffoldTube', '#9aa0a6', 0.4, 0.85)

nm = bpy.data.meshes.new('Kran_Net'); bm = bmesh.new(); uvl = bm.loops.layers.uv.new()
def wall(a, b, z0, z1):                                          # vertical net quad from plan point a to b
    (ax, ay), (bx, by) = a, b
    vs = [bm.verts.new((ax, -ay, z0)), bm.verts.new((bx, -by, z0)), bm.verts.new((bx, -by, z1)), bm.verts.new((ax, -ay, z1))]
    f = bm.faces.new(vs); f.material_index = 0
    L = math.hypot(bx - ax, by - ay)
    for lp, (u, v) in zip(f.loops, ((0, 0), (L / 0.5, 0), (L / 0.5, (z1 - z0) / 0.5), (0, (z1 - z0) / 0.5))): lp[uvl].uv = (u, v)
ring = [(NX0, NY0), (NX1, NY0), (NX1, NY1), (NX0, NY1)]
for i in range(4): wall(ring[i], ring[(i + 1) % 4], 0.0, 3.0)
def tube(a, b, r=0.024):                                         # square-section tube between 3D points (plan coords)
    a = Vector((a[0], -a[1], a[2])); b = Vector((b[0], -b[1], b[2])); d = b - a; L = d.length
    z = d.normalized(); x = z.orthogonal().normalized(); y = z.cross(x)
    res = bmesh.ops.create_cube(bm, size=1.0)
    T = Matrix.Translation((a + b) / 2) @ Matrix((x, y, z)).transposed().to_4x4() @ Matrix.Diagonal((2 * r, 2 * r, L, 1))
    bmesh.ops.transform(bm, matrix=T, verts=res['verts'])
    for f in {f for v in res['verts'] for f in v.link_faces}: f.material_index = 1
sring = [(SX0, SY0), (SX1, SY0), (SX1, SY1), (SX0, SY1)]
for i in range(4):
    (ax, ay), (bx, by) = sring[i], sring[(i + 1) % 4]
    L = math.hypot(bx - ax, by - ay); n = max(1, round(L / 2.5))
    for k in range(n):                                           # standards (corner included once per side)
        t = k / n; px_, py_ = ax + (bx - ax) * t, ay + (by - ay) * t
        tube((px_, py_, 0.0), (px_, py_, 3.0))
    for z in (0.05, 1.5):                                        # ledgers
        tube((ax, ay, z), (bx, by, z))
bm.to_mesh(nm); bm.free()
nm.materials.append(NET); nm.materials.append(TUBE)
netob = bpy.data.objects.new('Kran_Net', nm); bpy.context.collection.objects.link(netob)

for ob in bpy.data.objects: ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'crane.glb'), export_format='GLB', export_yup=True, export_apply=True)
for ob in bpy.data.objects:
    print('OBJ', ob.name, len(ob.data.polygons), 'faces', [round(v, 2) for v in ob.dimensions])
print('DONE')
