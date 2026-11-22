"""Night ground lighting of the complex (owner 2026-11-22: "the ground, the walks must be lit and everything visible; the
buildings only up to the 1st floor, fading out unnoticed"). No lamp posts (removed at the owner's request).
  spots     down-lights tucked under the facade at 3.0 m, every ~6 m round every finished block (not 1 = construction
            site), 0.6 m off the wall: they light the walk next to the building and graze the ground-floor wall only
  bollards  existing courtyard-door bollards + new ones filling every walkable spot (paving, roads, pads) that no
            light reaches: greedy cover of a 1.5 m sample grid, reach R_SPOT / R_BOLL metres
-> out/ground_lights.json (Unreal cm): {"spots": [[x, y, z]], "bollards": [[x, y, z]], "bollards_new": [[x, y, z]]}
Usage: python tools/unreal/ground_lights_layout.py   (after genplan2.py / props_layout.py)
"""
import json, math, os, sys
import numpy as np
from shapely.geometry import Polygon, Point, MultiPolygon
from shapely.ops import unary_union
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import genplan2 as gp
G = json.load(open(os.path.join(HERE, 'out', 'genplan.json')))
ZP = G['z']['pave']
SPOT_STEP, SPOT_OFF, SPOT_Z = 6.0, 0.6, 3.0
R_SPOT, R_BOLL, GRID = 6.0, 7.5, 1.5

def polys(rs):
    return unary_union([Polygon(np.array(p[0]).reshape(-1, 2), [np.array(h).reshape(-1, 2) for h in p[1:]]) for p in rs])
def parts(g): return list(g.geoms) if isinstance(g, MultiPolygon) else [g]

paving, road = polys(G['paving']), polys(G['road'])
pads = unary_union([polys(v) for v in G['pads'].values() if v])
walk = unary_union([paving, road, pads])
blocks = {k: Polygon(np.array(v).reshape(-1, 2)) for k, v in G['blocks'].items()}

spots = []
for k, b in blocks.items():
    if k == '1': continue                                     # construction site
    ring = b.buffer(SPOT_OFF, join_style='mitre').exterior
    c = np.array(ring.coords)[:-1]
    for i in range(len(c)):
        a, e = c[i], c[(i + 1) % len(c)]; L = float(np.linalg.norm(e - a))
        n = max(1, round(L / SPOT_STEP))
        for j in range(n):
            q = a + (e - a) * (j + 0.5) / n
            if not any(o.buffer(0.2).contains(Point(q)) for kk, o in blocks.items() if kk != k): spots.append(tuple(q))

old = []
for r in json.load(open(os.path.join(HERE, 'out', 'props.json'))):
    if r[5] == 'prop_bollard': old.append(r)

def to_web(ux, uy):                                          # invert gp.web_to_ue numerically (affine)
    o = np.array(gp.web_to_ue(0, 0)); ax = np.array(gp.web_to_ue(1, 0)) - o; az = np.array(gp.web_to_ue(0, 1)) - o
    return tuple(np.linalg.solve(np.array([ax, az]).T, np.array([ux, uy]) - o))
src = [(q, R_SPOT) for q in spots] + [(to_web(r[0], r[1]), R_BOLL) for r in old]

minx, miny, maxx, maxy = walk.bounds
pts = [(x, y) for x in np.arange(minx, maxx, GRID) for y in np.arange(miny, maxy, GRID) if walk.contains(Point(x, y))]
pts = np.array(pts)
lit = np.zeros(len(pts), bool)
for (q, R) in src: lit |= np.hypot(pts[:, 0] - q[0], pts[:, 1] - q[1]) < R
print('walkable samples', len(pts), 'lit by facade spots + old bollards', round(lit.mean() * 100, 1), '%')

# new bollards: stand on paving / pad edge (never in the carriageway), 0.4 m clear of edges and blocks
stand = unary_union([paving, pads]).difference(road.buffer(0.3)).buffer(-0.4)   # paving runs under the roads in genplan
for b in blocks.values(): stand = stand.difference(b.buffer(1.2))
new = []
while not lit.all():
    i = int(np.flatnonzero(~lit)[0]); p = Point(pts[i])
    if stand.contains(p): q = p
    else:
        from shapely.ops import nearest_points
        q = nearest_points(stand, p)[0]
        if q.distance(p) > R_BOLL - 1.0:                     # nothing to stand on near it: give up on that sample
            lit[i] = True; continue
    # move the pick toward the middle of the unlit patch around it (fewer bollards)
    d = np.hypot(pts[:, 0] - q.x, pts[:, 1] - q.y); patch = (~lit) & (d < R_BOLL)
    cx, cy = pts[patch].mean(0) if patch.any() else (q.x, q.y)
    c = Point(cx, cy); c = c if stand.contains(c) else q
    new.append((c.x, c.y)); lit |= np.hypot(pts[:, 0] - c.x, pts[:, 1] - c.y) < R_BOLL
print('spots', len(spots), 'old bollards', len(old), 'new bollards', len(new))

U = lambda q, z: [round(v, 1) for v in gp.web_to_ue(*q)] + [round(z * 100, 1)]
json.dump({'spots': [U(q, ZP + SPOT_Z) for q in spots], 'bollards': [r[:3] for r in old],
           'bollards_new': [U(q, ZP) for q in new]}, open(os.path.join(HERE, 'out', 'ground_lights.json'), 'w'))
