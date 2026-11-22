"""Stage 5 of maps-urban/REJA.md: street lamps of the city -> out/urban_props.json (Unreal metres).
Along every major road centre line (urban.json lines.ROADS_MAJOR) every LAMP_STEP m on both sides, standing on the road
edge + 0.8 m (the edge found by marching out of the road area along the normal), z on the terrain (urban_mesh sampler).
Usage: python tools/unreal/urban_props.py   (after urban_prep.py)
"""
import json, os, math
import numpy as np
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union
HERE = os.path.dirname(os.path.abspath(__file__))
U = json.load(open(os.path.join(HERE, 'out', 'urban.json')))
gue = np.array(U['grid']['ue']); Zg = np.array(U['grid']['z']); NI, NJ = Zg.shape
A0 = gue[0, 0]; Aj = (gue[0, -1] - gue[0, 0]) / (NJ - 1); Ai = (gue[-1, 0] - gue[0, 0]) / (NI - 1)
Minv = np.linalg.inv(np.array([Aj, Ai]).T)
def zat(p):
    q = Minv @ (np.asarray(p, float) - A0); i, j = min(max(q[1], 0), NI - 1.0001), min(max(q[0], 0), NJ - 1.0001)
    i0, j0 = int(i), int(j); a, b = i - i0, j - j0
    return Zg[i0, j0] * (1 - a) * (1 - b) + Zg[i0, j0 + 1] * (1 - a) * b + Zg[i0 + 1, j0] * a * (1 - b) + Zg[i0 + 1, j0 + 1] * a * b
ROAD = unary_union([Polygon(p[0], p[1:]).buffer(0) for p in U['areas']['ROADS_AREA']])
LAMP_STEP = 32.0
lamps = []
def far(q, d, cap=25.0):
    """distance from q along d to the road edge (march out of the road area)"""
    s = 0.0
    while s < cap and ROAD.contains(Point(*(q + d * s))): s += 0.5
    return s if s < cap else None
for l in U['lines']['ROADS_MAJOR']:
    P = [np.array(p) for p in l]; acc = LAMP_STEP / 2
    for k in range(len(P) - 1):
        a, b = P[k], P[k + 1]; L = np.linalg.norm(b - a)
        if L < 0.1: continue
        d = (b - a) / L; nrm = np.array([-d[1], d[0]]); t = acc
        while t < L:
            q = a + d * t
            for side in (1, -1):
                e = far(q, nrm * side)
                if e is None or e < 2: continue
                p = q + nrm * side * (e + 0.8)
                if any(np.hypot(p[0] - o[0], p[1] - o[1]) < 14 for o in lamps[-40:]): continue
                lamps.append([round(float(p[0]), 2), round(float(p[1]), 2), round(float(zat(p)), 2)])
            t += LAMP_STEP
        acc = t - L
print('lamps', len(lamps))
json.dump({'lamps': lamps}, open(os.path.join(HERE, 'out', 'urban_props.json'), 'w'))
