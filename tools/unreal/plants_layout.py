"""Plant positions for the courtyard (out/genplan.json, genplan2.py) -> out/plants.json in Unreal cm.
  tree   genplan trees (lawn grid + boulevard rows), Poly Haven jacaranda_tree (green pinnate leaves, acacia-like),
         scale 0.45-0.6 (model is 24 m wide / 18 m tall), random yaw
  shrub  a row 1.0 m inside every lawn edge, one every 3.2 m (shrub_02/03/04 mixed), skipped near trees
  flower small clusters of flower_gazania in the boulevard strips between the trees
z = soil top (genplan z.soil). Usage: python tools/unreal/plants_layout.py
"""
import json, math, os
import numpy as np
from shapely.geometry import Polygon, Point, MultiPolygon
from shapely.ops import unary_union
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'ue_scripts', 'kompleks_coords.py'), encoding='utf-8').read())
G = json.load(open(os.path.join(HERE, 'out', 'genplan.json')))
rng = np.random.default_rng(11)
zs = G['z']['soil'] * 100

def polys(rs):
    out = []
    for p in rs:
        r = [np.array(x).reshape(-1, 2) for x in p]
        out.append(Polygon(r[0], r[1:]))
    return unary_union(out)

soil = polys(G['soil'])
U = lambda x, z: [round(c, 1) for c in web_to_ue(x, z)]
out = {'tree': [], 'shrub': [], 'flower': []}
trees = [(x, z) for x, z in G['trees']]
for x, z in trees:
    out['tree'].append(U(x, z) + [zs, round(float(rng.uniform(0, 360)), 1), round(float(rng.uniform(0.45, 0.6)), 3)])
tp = [Point(t) for t in trees]
near_tree = lambda q, d: any(q.distance(t) < d for t in tp)
def is_strip(p):                                   # boulevard planted strip: 2.2 x 9.7 m soil
    c = np.array(p.minimum_rotated_rectangle.exterior.coords)[:4]
    e = sorted([np.linalg.norm(c[1] - c[0]), np.linalg.norm(c[2] - c[1])])
    return 1.8 < e[0] < 2.6 and 8 < e[1] < 11
# hedge: clipped 1 m clumps 0.6 m inside every lawn / strip edge, one every 0.6 m, ~80 cm high (renders: trimmed edges)
# bush: searsia bushes 2.2 m inside, one every 5 m, not under the trees
for p in (soil.geoms if isinstance(soil, MultiPolygon) else [soil]):
    if p.area < 2 or is_strip(p): continue
    for inset, step, kind in ((0.6, 0.6, 'hedge'), (2.2, 5.0, 'bush')):
        g0 = p.buffer(-inset, join_style='mitre')
        for g in (g0.geoms if isinstance(g0, MultiPolygon) else [g0]):
            if g.is_empty or g.area < 1: continue
            for ring in [g.exterior, *g.interiors]:
                L = ring.length; n = max(1, int(L / step))
                for k in range(n):
                    q = ring.interpolate(k * L / n)
                    if kind == 'hedge':
                        if near_tree(q, 0.8): continue
                        sc = float(rng.uniform(0.95, 1.1))
                        out['shrub'].append(U(q.x, q.y) + [zs, round(float(rng.uniform(0, 360)), 1), round(sc, 3), 'yard_hedge', round(float(rng.uniform(0.75, 0.9)), 3)])
                    else:
                        if near_tree(q, 3.0) or p.area < 30: continue
                        out['shrub'].append(U(q.x, q.y) + [zs, round(float(rng.uniform(0, 360)), 1), round(float(rng.uniform(0.85, 1.15)), 3), 'yard_buta_%d' % rng.integers(0, 3), 0])
# flowers: gazania clumps filling the middle of the boulevard strips (2.2 x 10 m soil) between the trees
for p in (soil.geoms if isinstance(soil, MultiPolygon) else [soil]):
    if not is_strip(p): continue
    inner = p.buffer(-0.25)
    minx, minz, maxx, maxz = inner.bounds
    for j in range(70):
        q = Point(rng.uniform(minx, maxx), rng.uniform(minz, maxz))
        if inner.contains(q) and not near_tree(q, 0.6):
            out['flower'].append(U(q.x, q.y) + [zs, round(float(rng.uniform(0, 360)), 1), round(float(rng.uniform(1.0, 1.6)), 3), 'yard_gul_%d' % rng.integers(0, 8), 0])
json.dump(out, open(os.path.join(HERE, 'out', 'plants.json'), 'w'))
print({k: len(v) for k, v in out.items()})
