"""B3 of QOLGAN_ISHLAR.md: mahalla street walls and gates (the look of a Tashkent mahalla street).
Along the minor streets: the road outlines pushed out OFFSET m (behind the curb), kept only where mahalla houses stand
(within NEAR m of a house < 7 m), away from the major roads, buildings and the complex. Every piece becomes a 2.2 m
plastered / brick wall (25 cm, with a cap), broken every ~GATE_EVERY m by a 3 m dark metal gate (2.4 m).
-> out/urban_walls_mesh.npz + _mats.json (Urban_Fence: [M_UR_Wall, M_UR_Gate]); colour in UV1/UV2 like the houses.
Usage: python tools/unreal/urban_walls.py
"""
import json, os, zlib
import numpy as np
from shapely.geometry import Polygon, LineString, Point, MultiLineString
from shapely.ops import unary_union
HERE = os.path.dirname(os.path.abspath(__file__))
U = json.load(open(os.path.join(HERE, 'out', 'urban.json'))); G = json.load(open(os.path.join(HERE, 'out', 'genplan.json')))
exec(open(os.path.join(HERE, 'ue_scripts', 'kompleks_coords.py'), encoding='utf-8').read())
gue = np.array(U['grid']['ue']); Zg = np.array(U['grid']['z']); NI, NJ = Zg.shape
A0 = gue[0, 0]; Aj = (gue[0, -1] - gue[0, 0]) / (NJ - 1); Ai = (gue[-1, 0] - gue[0, 0]) / (NI - 1)
Minv = np.linalg.inv(np.array([Aj, Ai]).T)
def zat(p):
    q = Minv @ (np.asarray(p, float) - A0); i, j = min(max(q[1], 0), NI - 1.0001), min(max(q[0], 0), NJ - 1.0001)
    i0, j0 = int(i), int(j); a, b = i - i0, j - j0
    return Zg[i0, j0] * (1 - a) * (1 - b) + Zg[i0, j0 + 1] * (1 - a) * b + Zg[i0 + 1, j0] * a * (1 - b) + Zg[i0 + 1, j0 + 1] * a * b
def hsh(s): return (zlib.crc32(str(s).encode()) & 0xffffffff) / 0xffffffff
def lin(h):
    h = h.lstrip('#'); c = [int(h[k:k + 2], 16) / 255 for k in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)
OFFSET, NEAR, H, T, GATE_W, GATE_H, GATE_EVERY, STEP = 0.9, 14.0, 2.2, 0.25, 3.0, 2.4, 18.0, 3.0
WALLS = [lin(c) for c in ('#d9c9ae', '#cbb492', '#e2d8c4', '#b08b6e', '#c7a37f', '#d4c4a8', '#a4704f')]
SITE = Polygon([[v / 100 for v in web_to_ue(*p)] for p in np.array(G['site']).reshape(-1, 2)])

road = unary_union([Polygon(p[0], p[1:]).buffer(0) for p in U['areas']['ROADS_AREA']])
major = unary_union([LineString(l) for l in U['lines']['ROADS_MAJOR']]).buffer(16.0)
def is_house(b): return (b['h'] < 7.0 or abs(b['h'] - 9.0) < 0.01) and b['area'] < 400
houses = [Polygon(b['fp']).buffer(0) for b in U['buildings'] if is_house(b)]
allb = unary_union([Polygon(b['fp']).buffer(0) for b in U['buildings']]).buffer(0.4)
zone = unary_union([h.buffer(NEAR) for h in houses])
lines = road.buffer(OFFSET, join_style='mitre').boundary
lines = lines.intersection(zone).difference(major).difference(allb).difference(SITE.buffer(10.0)).difference(road.buffer(OFFSET - 0.05))
parts = [g for g in (lines.geoms if hasattr(lines, 'geoms') else [lines]) if g.geom_type == 'LineString' and g.length > 3.0]
print('wall runs', len(parts), 'length %.0f m' % sum(p.length for p in parts))

P, UV, C, M = [], [], [], []
def quad(a, b, c, d, want, m, col):
    if np.cross(b - a, c - a) @ want < 0: b, d = d, b
    for t in ((a, b, c), (a, c, d)):
        P.extend(t); UV.extend([(0.0, 0.0)] * 3); C.extend([col] * 3); M.append(m)
def slab(p0, p1, z0a, z0b, z1a, z1b, th, m, col):
    """wall piece p0 -> p1, bottom z0a/z0b, top z1a/z1b, thickness th: both faces + top"""
    t = (p1 - p0) / np.linalg.norm(p1 - p0); n = np.array([-t[1], t[0]]) * th / 2
    A, B = np.r_[p0 + n, z0a], np.r_[p1 + n, z0b]; A2, B2 = np.r_[p0 - n, z0a], np.r_[p1 - n, z0b]
    At, Bt, A2t, B2t = np.r_[p0 + n, z1a], np.r_[p1 + n, z1b], np.r_[p0 - n, z1a], np.r_[p1 - n, z1b]
    quad(A, B, Bt, At, np.r_[n, 0], m, col); quad(A2, B2, B2t, A2t, np.r_[-n, 0], m, col)
    quad(At, Bt, B2t, A2t, np.array([0, 0, 1.0]), m, col)
def ends(p, z0, z1, t_dir, th, m, col):
    n = np.array([-t_dir[1], t_dir[0]]) * th / 2
    quad(np.r_[p + n, z0], np.r_[p - n, z0], np.r_[p - n, z1], np.r_[p + n, z1], np.r_[t_dir, 0], m, col)
ng = 0
for k, ln in enumerate(parts):
    col = WALLS[int(hsh(k) * 997) % len(WALLS)]; L = ln.length
    gates = [g for g in np.arange(GATE_EVERY * (0.4 + 0.4 * hsh(str(k) + 'g')), L - GATE_W - 1.0, GATE_EVERY)]
    cuts = [0.0]
    for g in gates: cuts += [g, g + GATE_W]
    cuts.append(L)
    for s in range(0, len(cuts) - 1):
        d0, d1 = cuts[s], cuts[s + 1]
        if d1 - d0 < 0.3: continue
        is_gate = s % 2 == 1
        m = max(1, int(np.ceil((d1 - d0) / STEP)))
        for q in range(m):
            p0 = np.array(ln.interpolate(d0 + (d1 - d0) * q / m).coords[0]); p1 = np.array(ln.interpolate(d0 + (d1 - d0) * (q + 1) / m).coords[0])
            if np.linalg.norm(p1 - p0) < 0.05: continue
            za, zb = zat(p0), zat(p1)
            if is_gate: slab(p0, p1, za - 0.05, zb - 0.05, za + GATE_H, zb + GATE_H, 0.08, 1, (0.03, 0.03, 0.035))
            else: slab(p0, p1, za - 0.3, zb - 0.3, za + H, zb + H, T, 0, col)
        if is_gate: ng += 1
        else:
            pa = np.array(ln.interpolate(d0).coords[0]); pb = np.array(ln.interpolate(d1).coords[0]); td = (pb - pa) / (np.linalg.norm(pb - pa) + 1e-9)
            ends(pa, zat(pa) - 0.3, zat(pa) + H, -td, T, 0, col); ends(pb, zat(pb) - 0.3, zat(pb) + H, td, T, 0, col)
print('gates', ng, 'tris', len(M))
np.savez_compressed(os.path.join(HERE, 'out', 'urban_walls_mesh.npz'), Urban_Fence_P=np.array(P, np.float32), Urban_Fence_UV=np.array(UV, np.float32),
                    Urban_Fence_C=np.array(C, np.float32), Urban_Fence_M=np.array(M, np.int8))
json.dump({'Urban_Fence': ['M_UR_Wall', 'M_UR_Gate']}, open(os.path.join(HERE, 'out', 'urban_walls_mesh_mats.json'), 'w'))
