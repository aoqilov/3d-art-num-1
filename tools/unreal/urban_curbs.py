"""B5 of QOLGAN_ISHLAR.md: 15 cm concrete curbs along every road edge of the city (urban.json areas.ROADS_AREA).
A 15 cm wide, CURB_H high strip just outside each road outline, following the terrain (segments split to <= 3 m,
z from the same grid sampler as urban_mesh.py). Faces: top, road side, outer side (ends hidden in the neighbours).
-> out/urban_curbs_mesh.npz + _mats.json (URBAN_SET=urban_curbs_mesh build_urban.py -> out/urban_curbs_mesh.glb,
Unreal: ue_scripts/urban_extra_setup.py). Usage: python tools/unreal/urban_curbs.py
"""
import json, os
import numpy as np
from shapely.geometry import Polygon, Point
HERE = os.path.dirname(os.path.abspath(__file__))
U = json.load(open(os.path.join(HERE, 'out', 'urban.json')))
gue = np.array(U['grid']['ue']); Zg = np.array(U['grid']['z']); NI, NJ = Zg.shape
A0 = gue[0, 0]; Aj = (gue[0, -1] - gue[0, 0]) / (NJ - 1); Ai = (gue[-1, 0] - gue[0, 0]) / (NI - 1)
Minv = np.linalg.inv(np.array([Aj, Ai]).T)
def zat(p):
    q = Minv @ (np.asarray(p, float) - A0); i, j = min(max(q[1], 0), NI - 1.0001), min(max(q[0], 0), NJ - 1.0001)
    i0, j0 = int(i), int(j); a, b = i - i0, j - j0
    return Zg[i0, j0] * (1 - a) * (1 - b) + Zg[i0, j0 + 1] * (1 - a) * b + Zg[i0 + 1, j0] * a * (1 - b) + Zg[i0 + 1, j0 + 1] * a * b
CURB_W, CURB_H, ROAD_DZ, STEP = 0.15, 0.15, 0.06, 3.0
P, UV, C, M = [], [], [], []
def quad(a, b, c, d, want):
    if np.cross(b - a, c - a) @ want < 0: b, d = d, b
    for t in ((a, b, c), (a, c, d)):
        P.extend(t); UV.extend([v[:2] if abs(want[2]) > 0.5 else np.array([v[0] + v[1], v[2]]) for v in t]); C.extend([(1, 1, 1)] * 3); M.append(0)
n = 0
for pr in U['areas']['ROADS_AREA']:
    poly = Polygon(pr[0], pr[1:]).buffer(0)
    if poly.is_empty: continue
    polys = poly.geoms if hasattr(poly, 'geoms') else [poly]
    for pg in polys:
        for ring in [pg.exterior, *pg.interiors]:
            pts = np.array(ring.coords)
            for k in range(len(pts) - 1):
                a, b = pts[k], pts[k + 1]; L = np.linalg.norm(b - a)
                if L < 0.05: continue
                t = (b - a) / L; nrm = np.array([-t[1], t[0]])
                if pg.contains(Point(*((a + b) / 2 + nrm * 0.05))): nrm = -nrm          # nrm: away from the road
                m = max(1, int(np.ceil(L / STEP)))
                for s in range(m):
                    p0, p1 = a + (b - a) * s / m, a + (b - a) * (s + 1) / m
                    z0, z1 = zat(p0) + ROAD_DZ, zat(p1) + ROAD_DZ
                    i0, i1 = np.r_[p0, z0], np.r_[p1, z1]                               # road side, at road level
                    o0, o1 = np.r_[p0 + nrm * CURB_W, z0], np.r_[p1 + nrm * CURB_W, z1]
                    h = np.array([0, 0, CURB_H]); g = np.array([0, 0, -0.25])           # outer face runs into the ground
                    quad(i0 + h, i1 + h, o1 + h, o0 + h, np.array([0, 0, 1.0]))
                    quad(i0, i1, i1 + h, i0 + h, np.r_[-nrm, 0])
                    quad(o0 + g, o1 + g, o1 + h, o0 + h, np.r_[nrm, 0])
                    n += 1
print('curb pieces', n, 'tris', len(M))
np.savez_compressed(os.path.join(HERE, 'out', 'urban_curbs_mesh.npz'), Urban_Curbs_P=np.array(P, np.float32), Urban_Curbs_UV=np.array(UV, np.float32),
                    Urban_Curbs_C=np.array(C, np.float32), Urban_Curbs_M=np.array(M, np.int8))
json.dump({'Urban_Curbs': ['M_UR_Curb']}, open(os.path.join(HERE, 'out', 'urban_curbs_mesh_mats.json'), 'w'))
