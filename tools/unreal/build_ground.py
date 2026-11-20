# Courtyard ground of the complex from tools/unreal/out/genplan.json (genplan2.py: designed on public/plan.jpg):
#   pavers (top +2 cm = block base), asphalt driveways 12 cm lower, planted beds behind a 15 cm concrete curb (soil +10 cm),
#   vertical curb faces between the levels. One mesh "Genplan_Ground", slots M_GP_Pavers / M_GP_Asphalt / M_GP_Curb /
#   M_GP_Soil. UVs = world metres (the Unreal materials tile them). Vertices are already in Unreal space
#   (web scene metres -> kompleks_coords.web_to_ue -> Blender (x, -y) metres), so the actor sits at the origin.
#   D:/blender-program/blender.exe -b --factory-startup -P tools/unreal/build_ground.py -> tools/unreal/out/ground.glb
import bpy, bmesh, json, os
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
exec(open(os.path.join(HERE, 'ue_scripts', 'kompleks_coords.py'), encoding='utf-8').read())
G = json.load(open(os.path.join(OUT, 'genplan.json'), encoding='utf-8'))
Z = G['z']

def P(x, z):
    ux, uy = web_to_ue(x, z)
    return ux / 100.0, -uy / 100.0

bpy.ops.wm.read_factory_settings(use_empty=True)
MATS = ['M_GP_Pavers', 'M_GP_Asphalt', 'M_GP_Curb', 'M_GP_Soil', 'M_GP_Play', 'M_GP_Sport', 'M_GP_Fountain', 'M_GP_Gate']
COL = {'M_GP_Pavers': (0.42, 0.40, 0.38), 'M_GP_Asphalt': (0.08, 0.08, 0.085), 'M_GP_Curb': (0.55, 0.55, 0.53), 'M_GP_Soil': (0.10, 0.16, 0.05),
       'M_GP_Play': (0.6, 0.2, 0.1), 'M_GP_Sport': (0.1, 0.35, 0.25), 'M_GP_Fountain': (0.6, 0.6, 0.6), 'M_GP_Gate': (0.03, 0.03, 0.03)}
me = bpy.data.meshes.new('Genplan_Ground')
for n in MATS:
    m = bpy.data.materials.new(n); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*COL[n], 1)
    me.materials.append(m)
bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')

def face(pts, mi):
    try:
        f = bm.faces.new([bm.verts.new(p) for p in pts])
    except ValueError:
        return
    f.material_index = mi
    f.normal_update(); n = f.normal
    if abs(n.z) > 0.5:
        for lp in f.loops: lp[uv].uv = (lp.vert.co.x, lp.vert.co.y)
    else:                                                       # vertical face: along-wall x z (no streaks)
        t = Vector((-n.y, n.x, 0)).normalized()
        for lp in f.loops: lp[uv].uv = (lp.vert.co.dot(t), lp.vert.co.z)

def flat(polys, z, mi):
    """polys = [[outer flat xz], [hole], ...]; up-facing triangles at height z"""
    n = 0
    for poly in polys:
        loops = [[Vector((*P(r[i], r[i + 1]), z)) for i in range(0, len(r), 2)] for r in poly]
        loops = [l for l in loops if len(l) >= 3]
        if not loops: continue
        flat_pts = [v for l in loops for v in l]
        for tri in tessellate_polygon(loops):
            a, b, c = (flat_pts[i] for i in tri)
            if (b - a).cross(c - a).z < 0: a, c = c, a          # face up
            face([a, b, c], mi); n += 1
    return n

nt = flat(G['under'], 0.0, 0)        # pavers under the block footprints (+2 m), 2 cm below the block floor: no gap to the dent
nt += flat(G['paving'], Z['pave'], 0) + flat(G['road'], Z['road'], 1) + flat(G['curb'], Z['curb'], 2) + flat(G['soil'], Z['soil'], 3)
for k, mi in (('play', 4), ('sport', 5), ('fountain', 6)):
    nt += flat(G.get('pads', {}).get(k, []), Z.get('pad', 0.03), mi)
nw = 0
for x1, z1, x2, z2, nx, nz, zb, zt in G['walls']:
    a, b = Vector((*P(x1, z1), 0)), Vector((*P(x2, z2), 0))
    n2 = Vector((*P(x1 + nx, z1 + nz), 0)) - a                   # visible-side direction in Blender space
    q = [Vector((a.x, a.y, zb)), Vector((b.x, b.y, zb)), Vector((b.x, b.y, zt)), Vector((a.x, a.y, zt))]
    if (q[1] - q[0]).cross(q[3] - q[0]).dot(n2) < 0: q.reverse()
    try:
        f = bm.faces.new([bm.verts.new(p) for p in q])
    except ValueError:
        continue
    f.material_index = 2; nw += 1
    L = (b - a).length
    for lp, t in zip(f.loops, ((0, zb), (L, zb), (L, zt), (0, zt)) if (q[0].z == zb and (q[1] - q[0]).length > 0 and q[0].xy == a.xy) else ((L, zt), (0, zt), (0, zb), (L, zb))):
        lp[uv].uv = t
# parking ramps: sloped asphalt, side walls with a 1 m parapet, a dark gate at the bottom, a roof slab over the last 7 m
def quad(pts, mi):
    face(pts, mi)
def box(c0, c1, w, z0, z1, mi):
    """wall box along c0->c1 (Blender xy), w thick"""
    d = (c1 - c0).normalized(); n = Vector((-d.y, d.x, 0)) * (w / 2)
    v = [c0 - n, c1 - n, c1 + n, c0 + n]
    for i in range(4):
        a, b = v[i], v[(i + 1) % 4]
        face([Vector((a.x, a.y, z0)), Vector((b.x, b.y, z0)), Vector((b.x, b.y, z1)), Vector((a.x, a.y, z1))], mi)
    face([Vector((p.x, p.y, z1)) for p in v], mi)
for x0, z0, x1, z1, w, dep in G.get('ramps', []):
    a = Vector((*P(x0, z0), 0)); b = Vector((*P(x1, z1), 0))
    d = (b - a).normalized(); n = Vector((-d.y, d.x, 0)) * (w / 2); L = (b - a).length
    zt, zb = Z['road'], -dep
    face([Vector((*(a - n).xy, zt)), Vector((*(b - n).xy, zb)), Vector((*(b + n).xy, zb)), Vector((*(a + n).xy, zt))], 1)
    for side in (-1, 1):
        o = n.normalized() * (w / 2 + 0.15) * side
        box(a + o, b + o, 0.3, zb - 0.2, 1.0, 2)                      # side wall + parapet
    pass  # gate removed 2026-11-20: the ramps now lead into the car park (parking_layout.py)
    # box(b - n * 1.05 + d * 0.15, b + n * 1.05 + d * 0.15, 0.3, zb, 0.0, 7)   # gate (placeholder: dark panel)
    r0 = b - d * 7.0
    face([Vector((*(r0 - n * 1.1).xy, 0.0)), Vector((*(b - n * 1.1).xy, 0.0)), Vector((*(b + n * 1.1).xy, 0.0)), Vector((*(r0 + n * 1.1).xy, 0.0))], 2)
    face([Vector((*(r0 + n * 1.1).xy, -0.3)), Vector((*(b + n * 1.1).xy, -0.3)), Vector((*(b - n * 1.1).xy, -0.3)), Vector((*(r0 - n * 1.1).xy, -0.3))], 2)
    box(r0 - n * 1.1, r0 + n * 1.1, 0.3, -0.3, 0.0, 2)                # roof slab front edge
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
bm.to_mesh(me); bm.free()
for p in me.polygons: p.use_smooth = False
ob = bpy.data.objects.new('Genplan_Ground', me); bpy.context.collection.objects.link(ob)
os.makedirs(OUT, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'ground.glb'), export_format='GLB', export_yup=True, export_apply=True)
print('ground tris', nt, 'walls', nw, 'verts', len(me.vertices), 'bounds',
      [round(min(v.co[k] for v in me.vertices), 1) for k in range(3)], [round(max(v.co[k] for v in me.vertices), 1) for k in range(3)])
