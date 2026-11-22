# The neighbourhood and the outer city as in the web app (owner 2026-11-22: "first build it like the web, then we add
# detailed 3D models like the complex"). Same data and rules as src/three/context.ts and src/three/outer.ts:
#   public/context/context.json  inner neighbourhood (~600 m): roads, raised sidewalks + curb, paths, parks, lane dashes,
#                                houses (floors x 3 m, flat or hipped / gabled roofs, web wall / roof palettes)
#   public/context/outer.json    outer city (1.8 km): grey boxes at their CADMapper heights, streets from centre lines
#                                (major 9 m + 3.5 m walks, minor 5.5 m + 1.6 m walks, dashed centre line on the major ones)
# -> tools/unreal/out/context.glb, objects Ctx_Streets / Ctx_Houses / Ctx_Roofs / Outer_City / Outer_Streets.
# Vertices are in Unreal space (web scene metres -> kompleks_coords.web_to_ue -> Blender (x, -y) metres): actors at the origin.
# Walls: colour in UV sets 1 (r, g) and 2 (b); UV u = metres along the wall / 3.2 (one window bay), v = height / 3 (one storey);
# walls under 2.4 m get u = 0 (no window). Unreal: ue_scripts/context_setup.py.
#   D:/blender-program/blender.exe -b --factory-startup -P tools/unreal/build_context.py
import bpy, bmesh, json, os, math, zlib
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
exec(open(os.path.join(HERE, 'ue_scripts', 'kompleks_coords.py'), encoding='utf-8').read())
C = json.load(open(os.path.join(ROOT, 'public', 'context', 'context.json'), encoding='utf-8'))
O = json.load(open(os.path.join(ROOT, 'public', 'context', 'outer.json'), encoding='utf-8'))
FLOOR_M, CURB_H = 3.0, 0.15
Y_ROAD, Y_PATH, Y_PARK, Y_PAINT = 0.03, 0.04, 0.025, 0.036

def P(x, z):
    ux, uy = web_to_ue(x, z)
    return ux / 100.0, -uy / 100.0
def hsh(s): return (zlib.crc32(s.encode()) & 0xffffffff) / 0xffffffff
def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (1.0,)
WALLS_SMALL = ['#e9dfcc', '#efe9de', '#dcc8a8', '#e4d3b8', '#d2b48f', '#f1ede4', '#c9a585']
WALLS_BIG = ['#ddd7cc', '#e6e1d7', '#cfc8bc', '#e9e4da']
ROOFS = ['#9a4436', '#8a3a2f', '#4f7a5c', '#5b6f7e', '#8e9396', '#a65243', '#7c8285']
ROOF_FLAT = '#8f8d88'

bpy.ops.wm.read_factory_settings(use_empty=True)

class Obj:
    def __init__(self, name, mats):
        self.name, self.mats = name, mats
        self.bm = bmesh.new(); self.uv = self.bm.loops.layers.uv.new('UVMap')
        # colour in two extra UV sets (C1 = r, g; C2 = b): Blender 5's glTF export kept dropping / duplicating vertex colours
        self.c1 = self.bm.loops.layers.uv.new('C1'); self.c2 = self.bm.loops.layers.uv.new('C2')
    def face(self, pts, mi, uvs=None, color=(1, 1, 1, 1)):
        try: f = self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        except ValueError: return
        f.material_index = mi
        for k, lp in enumerate(f.loops):
            lp[self.uv].uv = uvs[k] if uvs else (lp.vert.co.x, lp.vert.co.y)
            lp[self.c1].uv = (color[0], color[1]); lp[self.c2].uv = (color[2], 0.0)
    def tri_up(self, a, b, c, mi, color=(1, 1, 1, 1)):
        if (b - a).cross(c - a).z < 0: a, c = c, a
        self.face([a, b, c], mi, None, color)
    def done(self):
        me = bpy.data.meshes.new(self.name)
        for n in self.mats:
            m = bpy.data.materials.get(n) or bpy.data.materials.new(n); me.materials.append(m)
        self.bm.to_mesh(me); self.bm.free()
        ob = bpy.data.objects.new(self.name, me); bpy.context.collection.objects.link(ob)
        print('OBJ', self.name, len(me.polygons))

def tris(t, z, o, mi):
    v, idx = t['v'], t['i']
    pts = [Vector((*P(v[k], v[k + 1]), z)) for k in range(0, len(v), 2)]
    for k in range(0, len(idx), 3): o.tri_up(pts[idx[k]], pts[idx[k + 1]], pts[idx[k + 2]], mi)
    return pts
def skirt(t, y0, y1, o, mi):
    """boundary edges of a triangle mesh -> vertical faces y0..y1 (web: 15 cm curb)"""
    v, idx = t['v'], t['i']; cnt = {}
    for k in range(0, len(idx), 3):
        for e in range(3):
            a, b = idx[k + e], idx[k + (e + 1) % 3]; key = (min(a, b), max(a, b))
            if key in cnt: del cnt[key]
            else: cnt[key] = (a, b)
    for a, b in cnt.values():
        ax, ay = P(v[a * 2], v[a * 2 + 1]); bx, by = P(v[b * 2], v[b * 2 + 1])
        L = math.hypot(bx - ax, by - ay)
        o.face([Vector((ax, ay, y0)), Vector((bx, by, y0)), Vector((bx, by, y1)), Vector((ax, ay, y1))], mi, [(0, 0), (L, 0), (L, y1 - y0), (0, y1 - y0)])

# ---- inner streets
S = Obj('Ctx_Streets', ['M_CX_Asphalt', 'M_CX_Pavers', 'M_CX_Curb', 'M_CX_Park', 'M_CX_Paint'])
tris(C['road'], Y_ROAD, S, 0)
tris(C['walk'], CURB_H, S, 1)
skirt(C['road'], Y_ROAD - 0.02, CURB_H, S, 2)
skirt(C['walk'], -0.02, CURB_H, S, 2)
tris(C['paths'], Y_PATH, S, 1)
tris(C['parks'], Y_PARK, S, 3)
for x0, z0, x1, z1 in C['dashes']:
    a, b = Vector((*P(x0, z0), Y_PAINT)), Vector((*P(x1, z1), Y_PAINT))
    d = (b - a); d.z = 0
    if d.length < 1e-3: continue
    n = Vector((-d.y, d.x, 0)).normalized() * 0.08
    S.face([a - n, b - n, b + n, a + n], 4)
S.done()

# ---- inner houses (web Context.build)
def obb(p):
    best = None; n = len(p)
    for k in range(n):
        (ax, az), (bx, bz) = p[k], p[(k + 1) % n]
        L = math.hypot(bx - ax, bz - az)
        if L < 1e-6: continue
        ux, uz = (bx - ax) / L, (bz - az) / L
        us = [x * ux + z * uz for x, z in p]; vs = [-x * uz + z * ux for x, z in p]
        area = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or area < best[0]:
            cu, cv = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
            best = (area, (cu * ux - cv * uz, cu * uz + cv * ux), ux, uz, (max(us) - min(us)) / 2, (max(vs) - min(vs)) / 2)
    _, c, ux, uz, hu, hv = best
    if hu < hv: ux, uz, hu, hv = -uz, ux, hv, hu                 # u = the long axis (ridge)
    return c, ux, uz, hu, hv
H = Obj('Ctx_Houses', ['M_CX_Wall'])
R = Obj('Ctx_Roofs', ['M_CX_Roof'])
nh = 0
for b in C['buildings']:
    f, roof = b['f'], b['r']
    if f <= 0: continue
    big = b['a'] > 600 or f >= 4
    h = f * FLOOR_M + (0.6 if roof == 'flat' else 0.2)
    p = [(b['p'][k], b['p'][k + 1]) for k in range(0, len(b['p']), 2)]
    if len(p) < 3: continue
    a2 = sum(p[k][0] * p[(k + 1) % len(p)][1] - p[(k + 1) % len(p)][0] * p[k][1] for k in range(len(p)))
    if a2 > 0: p = p[::-1]                                     # consistent winding (web: ccw in x, z)
    pal = WALLS_BIG if big else WALLS_SMALL
    wall = srgb(pal[int(hsh(b['id']) * len(pal)) % len(pal)])
    run = 0.0
    for k in range(len(p)):
        (ax, az), (bx, bz) = p[k], p[(k + 1) % len(p)]
        A, B = P(ax, az), P(bx, bz); L = math.hypot(B[0] - A[0], B[1] - A[1])
        u0, u1 = (run / 3.2, (run + L) / 3.2) if L >= 2.4 else (0.0, 0.0)
        H.face([Vector((B[0], B[1], 0)), Vector((A[0], A[1], 0)), Vector((A[0], A[1], h)), Vector((B[0], B[1], h))], 0,
               [(u1, 0), (u0, 0), (u0, h / FLOOR_M), (u1, h / FLOOR_M)], wall)
        run += L
    if roof == 'flat':
        c = srgb(ROOF_FLAT); k_ = 0.92 + 0.16 * hsh(b['id'] + 'r'); c = (c[0] * k_, c[1] * k_, c[2] * k_, 1)
        loop = [Vector((*P(x, z), h)) for x, z in p]
        for t in tessellate_polygon([loop]): R.tri_up(loop[t[0]], loop[t[1]], loop[t[2]], 0, c)
    else:
        (cx, cz), ux, uz, hu0, hv0 = obb(p); ov = 0.35
        hu, hv = hu0 + ov, hv0 + ov; rh = min(2.6, 0.62 * hv)
        hip = hu0 / max(hv0, 0.1) < 1.6 or hsh(b['id'] + 'h') < 0.5
        ridge = max(0.0, hu - hv) if hip else hu
        Pt = lambda u, v, y: Vector((*P(cx + u * ux - v * uz, cz + u * uz + v * ux), y))
        ey = h - 0.2; c = srgb(ROOFS[int(hsh(b['id'] + 'c') * len(ROOFS)) % len(ROOFS)])
        a1, a2_, a3, a4 = Pt(-hu, -hv, ey), Pt(hu, -hv, ey), Pt(hu, hv, ey), Pt(-hu, hv, ey)
        r1, r2 = Pt(-ridge, 0, ey + rh), Pt(ridge, 0, ey + rh)
        R.face([a1, r1, r2, a2_], 0, None, c); R.face([a3, r2, r1, a4], 0, None, c)
        R.face([a2_, r2, a3], 0, None, c if hip else wall); R.face([a4, r1, a1], 0, None, c if hip else wall)
    nh += 1
H.done(); R.done(); print('houses', nh)

# ---- outer city: grey boxes
OC = Obj('Outer_City', ['M_CX_Outer'])
nb = 0
for b in O['buildings']:
    h = b[1]; ring = [(b[i], b[i + 1]) for i in range(2, len(b) - 1, 2)]
    if len(ring) < 3 or h <= 0: continue
    loop = [Vector((*P(x, z), 0.0)) for x, z in ring]
    for k in range(len(loop)):
        A, B = loop[k], loop[(k + 1) % len(loop)]
        OC.face([A, B, B + Vector((0, 0, h)), A + Vector((0, 0, h))], 0, [(0, 0), (1, 0), (1, h / FLOOR_M), (0, h / FLOOR_M)])
    top = [v + Vector((0, 0, h)) for v in loop]
    for t in tessellate_polygon([top]): OC.tri_up(top[t[0]], top[t[1]], top[t[2]], 0)
    nb += 1
# walls must face out: recalc normals per building is costly; Unreal material is two-sided (context_setup.py)
OC.done(); print('outer buildings', nb)

# ---- outer streets (web outer.ts roads(): ribbons with round joints)
ROAD = [(9.0, 3.5), (5.5, 1.6)]
OS = Obj('Outer_Streets', ['M_CX_Asphalt', 'M_CX_Pavers', 'M_CX_Paint'])
def ribbons(lines, half, y, mi):
    for l in lines:
        hw = half(l)
        if hw <= 0: continue
        pts = [Vector((*P(l[i], l[i + 1]), y)) for i in range(1, len(l) - 1, 2)]
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]; d = b - a; d.z = 0
            if d.length < 0.05: continue
            n = Vector((-d.y, d.x, 0)).normalized() * hw
            OS.face([a + n, a - n, b - n, b + n], mi)
        for c in pts:                                          # round joints / end caps
            ring = [c + Vector((math.cos(k / 10 * math.tau) * hw, math.sin(k / 10 * math.tau) * hw, 0)) for k in range(10)]
            for k in range(10): OS.tri_up(c, ring[k], ring[(k + 1) % 10], mi)
ribbons(O['roads'], lambda l: ROAD[int(l[0])][0] / 2 + ROAD[int(l[0])][1], 0.02, 1)
ribbons(O['roads'], lambda l: ROAD[int(l[0])][0] / 2, 0.03, 0)
dash = []
for l in O['roads']:
    if int(l[0]) != 0: continue
    for i in range(1, len(l) - 3, 2):
        x0, z0, x1, z1 = l[i], l[i + 1], l[i + 2], l[i + 3]; L = math.hypot(x1 - x0, z1 - z0); t = 12.0
        while t + 3 < L - 12:
            dash.append([1, x0 + (x1 - x0) * t / L, z0 + (z1 - z0) * t / L, x0 + (x1 - x0) * (t + 3) / L, z0 + (z1 - z0) * (t + 3) / L]); t += 9
ribbons(dash, lambda l: 0.07, 0.036, 2)
OS.done()

fp = os.path.join(HERE, 'out', 'context.glb')
bpy.ops.export_scene.gltf(filepath=fp, export_format='GLB')
print('CONTEXT done')
