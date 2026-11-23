"""Forest variant of the surroundings (owner 2026-11-22: "a separate green forest around"). Instead of the city:
trees on the real relief around the complex, dense near it and thinner further out, a 25 m open ring round the site.
  trees   jittered grid: spacing 7 m within 250 m of the site, 10 m to 500 m, 15 m to MAX_R; heights 12..22 m
  bushes  undergrowth (boxwood / hydrangea) every ~6 m within 300 m, not under a trunk
-> out/forest.json {trees: [[x, y, z, h]], bushes: [[x, y, z, kind]]} (Unreal metres). Usage: python tools/unreal/forest_layout.py
"""
import json, os, zlib
import numpy as np
from shapely.geometry import Polygon, Point
from shapely.prepared import prep
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
def hsh(*s): return (zlib.crc32(('|'.join(map(str, s))).encode()) & 0xffffffff) / 0xffffffff
MAX_R, OPEN = float(os.environ.get('MAX_R', 700)), 25.0
SITE = Polygon([[v / 100 for v in web_to_ue(*p)] for p in np.array(G['site']).reshape(-1, 2)])
terrain = prep(Polygon([gue[0, 0], gue[0, -1], gue[-1, -1], gue[-1, 0]]).buffer(-5))
near, far = prep(SITE.buffer(OPEN)), prep(SITE.buffer(MAX_R))
x0, y0, x1, y1 = SITE.buffer(MAX_R).bounds
trees = []
for step, r_lo, r_hi in ((7.0, OPEN, 250.0), (10.0, 250.0, 500.0), (15.0, 500.0, MAX_R)):
    ring_in, ring_out = prep(SITE.buffer(r_lo)), prep(SITE.buffer(r_hi))
    for x in np.arange(x0, x1, step):
        for y in np.arange(y0, y1, step):
            p = np.array([x + (hsh(x, y, 'a') - 0.5) * step * 0.8, y + (hsh(x, y, 'b') - 0.5) * step * 0.8]); pt = Point(*p)
            if ring_out.contains(pt) and not ring_in.contains(pt) and terrain.contains(pt):
                trees.append([round(float(p[0]), 2), round(float(p[1]), 2), round(float(zat(p)), 2), round(12.0 + 10.0 * hsh(x, y, 'h'), 2)])
bushes = []
T = np.array([t[:2] for t in trees])
ring = prep(SITE.buffer(300.0))
for x in np.arange(x0, x1, 8.0):
    for y in np.arange(y0, y1, 8.0):
        p = np.array([x + (hsh(x, y, 'c') - 0.5) * 4, y + (hsh(x, y, 'd') - 0.5) * 4]); pt = Point(*p)
        if ring.contains(pt) and not near.contains(pt) and terrain.contains(pt) and np.min(np.hypot(*(T - p).T)) > 2.0:
            bushes.append([round(float(p[0]), 2), round(float(p[1]), 2), round(float(zat(p)), 2), int(hsh(x, y, 'k') * 3)])
print('trees', len(trees), 'bushes', len(bushes))
json.dump({'trees': trees, 'bushes': bushes}, open(os.path.join(HERE, 'out', 'forest.json'), 'w'))
