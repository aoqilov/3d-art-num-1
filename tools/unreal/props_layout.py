"""Courtyard furniture positions -> out/props.json (Unreal cm; rows x, y, z, yaw, scale, model). Models are PLACEHOLDERS
(build_props.py) to be swapped for Fab models through out/model_map.json, so only the positions live here.
  prop_lamp     every ~20 m along the road edges (1 m onto the walk), both promenade edges of the boulevard every 24 m
  prop_bench    one per boulevard strip on the promenade side facing the axis; one per long side of every pad; 4 round
                the fountain
  prop_bin      next to every other bench
  prop_bollard  both sides of every courtyard-door path, every 4 m for the first 12 m (paving only)
Usage: python tools/unreal/props_layout.py   (after genplan2.py)
"""
import json, math, os, sys
import numpy as np
from shapely.geometry import Polygon, Point, MultiPolygon
from shapely.ops import unary_union
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import genplan2 as gp                                  # BLVD_PX, to_m, web_xz, web_to_ue, BLOCKS, BD
G = json.load(open(os.path.join(HERE, 'out', 'genplan.json')))
Z = G['z']

def polys(rs):
    return unary_union([Polygon(np.array(p[0]).reshape(-1, 2), [np.array(h).reshape(-1, 2) for h in p[1:]]) for p in rs])

road, bed, paving = polys(G['road']), polys(G['bed']), polys(G['paving'])
pads = {k: polys(v) for k, v in G['pads'].items() if v}
out = []
def put(x, z, face_dx, face_dz, model, zc=Z['pave'] * 100):
    """face_*: direction (web metres) the front of the prop looks at; bench seat faces it"""
    ux, uy = gp.web_to_ue(x, z); fx, fy = gp.web_to_ue(x + face_dx, z + face_dz)
    yaw = math.degrees(math.atan2(fy - uy, fx - ux)) - 90.0
    out.append([round(ux, 1), round(uy, 1), round(zc, 1), round(yaw, 1), 1.0, model])
free = lambda q, r=0.4: paving.contains(Point(q).buffer(r))
taken = []
def ok(q, d):
    if any(math.dist(q, t) < d for t in taken): return False
    taken.append(q); return True

# lamps along the roads
for p in (road.geoms if isinstance(road, MultiPolygon) else [road]):
    ring = p.buffer(1.0, join_style='mitre').exterior; L = ring.length
    for k in range(max(1, int(L / 20))):
        q = ring.interpolate(k * L / max(1, int(L / 20)))
        if free((q.x, q.y), 0.3) and ok((q.x, q.y), 12): put(q.x, q.y, 1, 0, 'prop_lamp')
# boulevard
a, b = np.array(gp.to_m(*gp.BLVD_PX[0])), np.array(gp.to_m(*gp.BLVD_PX[1]))
L = float(np.linalg.norm(b - a)); t = (b - a) / L; n = np.array([-t[1], t[0]])
s = 4.0; k = 0
while s + 10 < L - 2:
    for side in (-1, 1):
        m = a + t * (s + 5) + n * side * 2.4                          # bench at the strip middle, on the promenade
        if free(m, 0.5): put(*m, *(-n * side), 'prop_bench')
        if k % 2 == 0:
            q = m + t * 1.4
            if free(q, 0.3): put(*q, *(-n * side), 'prop_bin')
        if k % 2 == 0:
            q = a + t * (s + 11) + n * side * 2.7                     # lamp in the crossing between two strips
            if free(q, 0.2): put(*q, 1, 0, 'prop_lamp')
    s += 12; k += 1
# pads: benches on the paved rim, facing the pad
for kind, g in pads.items():
    for p in (g.geoms if isinstance(g, MultiPolygon) else [g]):
        c = np.array(p.centroid.coords[0])
        if kind == 'fountain':
            for ang in range(45, 360, 90):
                d = np.array([math.cos(math.radians(ang)), math.sin(math.radians(ang))])
                q = c + d * (p.length / (2 * math.pi) + 1.2)
                if free(q, 0.4): put(*q, *(-d), 'prop_bench')
            continue
        rr = np.array(p.minimum_rotated_rectangle.exterior.coords)[:4]
        for i in range(4):
            e0, e1 = rr[i], rr[(i + 1) % 4]
            if np.linalg.norm(e1 - e0) < 10: continue                     # long sides only
            mid = (e0 + e1) / 2; d = mid - c; d /= np.linalg.norm(d)
            q = mid + d * 1.0
            if free(q, 0.4):
                put(*q, *(-d), 'prop_bench')
                tt = (e1 - e0) / np.linalg.norm(e1 - e0); q2 = q + tt * 1.5
                if free(q2, 0.3): put(*q2, *(-d), 'prop_bin')
# bollards along the courtyard-door paths
for i in gp.BLOCKS:
    d0 = np.array(gp.web_xz(i, 13.25, gp.BD)); d1 = np.array(gp.web_xz(i, 13.25, gp.BD + 1)); v = d1 - d0; w = np.array([-v[1], v[0]])
    for s in (3, 7, 11):
        for side in (-1, 1):
            q = d0 + v * s + w * side * 1.9
            if free(q, 0.15): put(*q, *v, 'prop_bollard')
json.dump(out, open(os.path.join(HERE, 'out', 'props.json'), 'w'))
from collections import Counter
print(Counter(r[5] for r in out))
