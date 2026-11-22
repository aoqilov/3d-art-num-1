"""Stage 6 of maps-urban/REJA.md (owner: detailed buildings only along the main road): shop fronts on the main road.
Main road = the major road centre lines (urban.json lines.ROADS_MAJOR) within MAIN_R m of the complex site. Every
building (urban.json) with a wall facing that road within FRONT_D m gets, on that wall (Yandex refs: Darvoza ko'chasi):
  storefront  glass band 0.3 .. 3.2 m above its base, 5 cm proud of the wall, 0.4 m margins     [M_UR_Shop]
  sign band   3.35 .. 3.95 m, colour per shop (UV1 r, g + UV2 b)                                   [M_UR_Sign]
  canopy      slab at 3.25 m reaching 1.4 m out, 12 cm thick                                       [M_UR_Canopy]
-> out/urban_main_mesh.npz + out/urban_main_mesh_mats.json (same layout as urban_mesh.py; URBAN_SET=urban_main_mesh
   build_urban.py -> out/urban_main_mesh.glb). Usage: python tools/unreal/urban_main.py
"""
import json, os, zlib
import numpy as np
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
HERE = os.path.dirname(os.path.abspath(__file__))
U = json.load(open(os.path.join(HERE, 'out', 'urban.json'))); G = json.load(open(os.path.join(HERE, 'out', 'genplan.json')))
exec(open(os.path.join(HERE, 'ue_scripts', 'kompleks_coords.py'), encoding='utf-8').read())
MAIN_R, FRONT_D, SPAN = 60.0, 35.0, 700.0   # the main road is ~30 m wide
SITE = Polygon([[v / 100 for v in web_to_ue(*p)] for p in np.array(G['site']).reshape(-1, 2)])
main = unary_union([LineString(l) for l in U['lines']['ROADS_MAJOR'] if LineString(l).distance(SITE) < MAIN_R])
print('main road length %.0f m' % main.length)
def hsh(s): return (zlib.crc32(str(s).encode()) & 0xffffffff) / 0xffffffff
SIGNS = [(0.75, 0.05, 0.04), (0.02, 0.25, 0.7), (0.9, 0.55, 0.02), (0.05, 0.45, 0.15), (0.85, 0.85, 0.8), (0.5, 0.02, 0.4), (0.02, 0.4, 0.45)]
P, UV, C, M = [], [], [], []
def quad(a, b, c, d, m, col=(1, 1, 1), uv=((0, 0), (1, 0), (1, 1), (0, 1))):
    for t in ((0, 1, 2), (0, 2, 3)):
        q = [(a, b, c, d)[k] for k in t]; P.extend(q); UV.extend([uv[k] for k in t]); C.extend([col] * 3); M.append(m)
def boxq(a, b, n, z0, z1, depth, m, col):
    """slab / panel along wall a->b, out along n by depth, z0..z1: 5 visible faces, each oriented outward"""
    A, B = np.r_[a, 0], np.r_[b, 0]; N = np.r_[n, 0] * depth; Z0, Z1 = np.array([0, 0, z0]), np.array([0, 0, z1])
    faces = [(A + Z0 + N, B + Z0 + N, B + Z1 + N, A + Z1 + N, N),                    # front
             (A + Z1, A + Z1 + N, B + Z1 + N, B + Z1, np.array([0, 0, 1.0])),        # top
             (A + Z0, B + Z0, B + Z0 + N, A + Z0 + N, np.array([0, 0, -1.0])),       # bottom
             (A + Z0, A + Z0 + N, A + Z1 + N, A + Z1, A - B), (B + Z0, B + Z1, B + Z1 + N, B + Z0 + N, B - A)]
    for p0, p1, p2, p3, want in faces:
        if np.cross(p1 - p0, p2 - p0) @ want < 0: p1, p3 = p3, p1
        quad(p0, p1, p2, p3, m, col)
nb = nw = 0
for b in U['buildings']:
    p = np.array(b['fp'], float)
    if main.distance(Point(*p.mean(0))) > FRONT_D + 25 or SITE.distance(Point(*p.mean(0))) > SPAN: continue
    poly = Polygon(p); cen = p.mean(0); hit = False
    for k in range(len(p)):
        a, c_ = p[k], p[(k + 1) % len(p)]; L = np.linalg.norm(c_ - a)
        if L < 4.0: continue
        mid = (a + c_) / 2; t = (c_ - a) / L; n = np.array([-t[1], t[0]])
        if poly.contains(Point(*(mid + n * 0.3))): n = -n                       # outward
        near = main.interpolate(main.project(Point(*mid))); to = np.array(near.coords[0]) - mid
        if np.linalg.norm(to) > FRONT_D or n @ (to / (np.linalg.norm(to) + 1e-6)) < 0.6: continue
        z = b['base'] + 0.3; col = SIGNS[int(hsh(str(b['id']) + str(k)) * 997) % len(SIGNS)]
        a2, c2 = a + t * 0.4, c_ - t * 0.4
        boxq(a2, c2, n, z + 0.3, z + 3.2, 0.05, 0, (1, 1, 1))                   # glass
        boxq(a2, c2, n, z + 3.35, z + 3.95, 0.08, 1, col)                       # sign band
        boxq(a, c_, n, z + 3.25, z + 3.37, 1.4, 2, (1, 1, 1))                   # canopy
        hit = True; nw += 1
    nb += hit
print('main street buildings', nb, 'shop fronts', nw)
np.savez_compressed(os.path.join(HERE, 'out', 'urban_main_mesh.npz'), Urban_Main_P=np.array(P, np.float32), Urban_Main_UV=np.array(UV, np.float32),
                    Urban_Main_C=np.array(C, np.float32), Urban_Main_M=np.array(M, np.int8))
json.dump({'Urban_Main': ['M_UR_Shop', 'M_UR_Sign', 'M_UR_Canopy']}, open(os.path.join(HERE, 'out', 'urban_main_mesh_mats.json'), 'w'))
