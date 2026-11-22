"""B7 of QOLGAN_ISHLAR.md: street trees of the mahalla streets (a row in front of the walls, the Tashkent look).
Along every wall line (out/urban_wall_lines.json, urban_walls.py) within R m of the complex, every STEP m (jittered),
0.35 m from the wall toward the road; not in front of a gate gap is not checked (trees in front of gates happen too).
Height 8..14 m. Capped at MAX trees, nearest first. -> out/urban_trees2.json [x, y, z, height] (Unreal metres).
Usage: python tools/unreal/urban_trees2.py
"""
import json, os, zlib
import numpy as np
from shapely.geometry import LineString, Polygon, Point
HERE = os.path.dirname(os.path.abspath(__file__))
U = json.load(open(os.path.join(HERE, 'out', 'urban.json'))); G = json.load(open(os.path.join(HERE, 'out', 'genplan.json')))
exec(open(os.path.join(HERE, 'ue_scripts', 'kompleks_coords.py'), encoding='utf-8').read())
W = json.load(open(os.path.join(HERE, 'out', 'urban_wall_lines.json')))
gue = np.array(U['grid']['ue']); Zg = np.array(U['grid']['z']); NI, NJ = Zg.shape
A0 = gue[0, 0]; Aj = (gue[0, -1] - gue[0, 0]) / (NJ - 1); Ai = (gue[-1, 0] - gue[0, 0]) / (NI - 1)
Minv = np.linalg.inv(np.array([Aj, Ai]).T)
def zat(p):
    q = Minv @ (np.asarray(p, float) - A0); i, j = min(max(q[1], 0), NI - 1.0001), min(max(q[0], 0), NJ - 1.0001)
    i0, j0 = int(i), int(j); a, b = i - i0, j - j0
    return Zg[i0, j0] * (1 - a) * (1 - b) + Zg[i0, j0 + 1] * (1 - a) * b + Zg[i0 + 1, j0] * a * (1 - b) + Zg[i0 + 1, j0 + 1] * a * b
def hsh(s): return (zlib.crc32(str(s).encode()) & 0xffffffff) / 0xffffffff
R, STEP, MAX = 500.0, 11.0, 2500
SITE = Polygon([[v / 100 for v in web_to_ue(*p)] for p in np.array(G['site']).reshape(-1, 2)])
existing = np.array([t[:2] for t in U['trees']])
out = []
for k, w in enumerate(W):
    ln = LineString(w['pts'])
    if ln.distance(SITE) > R: continue
    a, b = np.array(ln.coords[0]), np.array(ln.coords[-1])
    d = 2.0 + 3.0 * hsh(k)
    while d < ln.length - 1.0:
        p = np.array(ln.interpolate(d).coords[0]); p2 = np.array(ln.interpolate(min(ln.length, d + 0.5)).coords[0])
        t = (p2 - p) / (np.linalg.norm(p2 - p) + 1e-9); n = np.array([-t[1], t[0]]) * w['road_side']
        q = p + n * 0.35
        if not len(existing) or np.min(np.hypot(*(existing - q).T)) > 5.0:
            out.append([round(float(q[0]), 2), round(float(q[1]), 2), round(float(zat(q)), 2), round(8.0 + 6.0 * hsh(str(k) + str(int(d))), 2), SITE.distance(Point(*q))])
        d += STEP * (0.8 + 0.4 * hsh(str(k) + 's' + str(int(d))))
out.sort(key=lambda r: r[4]); out = [r[:4] for r in out[:MAX]]
print('street trees', len(out))
json.dump(out, open(os.path.join(HERE, 'out', 'urban_trees2.json'), 'w'))
