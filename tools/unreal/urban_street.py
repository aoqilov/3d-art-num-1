"""B6 of QOLGAN_ISHLAR.md: street furniture of the city (Unreal metres) from urban.json + urban_wall_lines.json.
  crossings   where a major road centre line meets another road line (clusters within 15 m, off the complex): on every
              arm of a major road, a zebra across the carriageway 3 m before the edge of the crossing road
              -> mesh Urban_Zebra (slot M_UR_Paint) in out/urban_street_mesh.npz (build_urban.py URBAN_SET=urban_street_mesh)
  svetofor    major x major crossings: one pole on the right-hand kerb of each major arm, facing the oncoming traffic
  bekat       bus shelters along the major roads every ~BUS_STEP m, on each side, kerb + 2.5 m, open side to the road
  mahalla     slim lamps along the mahalla walls (urban_wall_lines.json) every ~MAH_STEP m within MAH_R m of the complex
-> out/urban_street.json {svetofor: [[x, y, z, yaw]], bekat: [...], lamps_mahalla: [[x, y, z]]}
Usage: python tools/unreal/urban_street.py
"""
import json, os, math, zlib
import numpy as np
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union
HERE = os.path.dirname(os.path.abspath(__file__))
U = json.load(open(os.path.join(HERE, 'out', 'urban.json'))); G = json.load(open(os.path.join(HERE, 'out', 'genplan.json')))
W = json.load(open(os.path.join(HERE, 'out', 'urban_wall_lines.json')))
exec(open(os.path.join(HERE, 'ue_scripts', 'kompleks_coords.py'), encoding='utf-8').read())
gue = np.array(U['grid']['ue']); Zg = np.array(U['grid']['z']); NI, NJ = Zg.shape
A0 = gue[0, 0]; Aj = (gue[0, -1] - gue[0, 0]) / (NJ - 1); Ai = (gue[-1, 0] - gue[0, 0]) / (NI - 1)
Minv = np.linalg.inv(np.array([Aj, Ai]).T)
def zat(p):
    q = Minv @ (np.asarray(p, float) - A0); i, j = min(max(q[1], 0), NI - 1.0001), min(max(q[0], 0), NJ - 1.0001)
    i0, j0 = int(i), int(j); a, b = i - i0, j - j0
    return Zg[i0, j0] * (1 - a) * (1 - b) + Zg[i0, j0 + 1] * (1 - a) * b + Zg[i0 + 1, j0] * a * (1 - b) + Zg[i0 + 1, j0 + 1] * a * b
def hsh(s): return (zlib.crc32(str(s).encode()) & 0xffffffff) / 0xffffffff
SITE = Polygon([[v / 100 for v in web_to_ue(*p)] for p in np.array(G['site']).reshape(-1, 2)])
ROAD = unary_union([Polygon(p[0], p[1:]).buffer(0) for p in U['areas']['ROADS_AREA']])
MAJ = [LineString(l) for l in U['lines']['ROADS_MAJOR']]; MIN = [LineString(l) for l in U['lines']['ROADS_MINOR']]
BUS_STEP, MAH_STEP, MAH_R = 380.0, 32.0, 500.0
def half_width(p, d, cap=25.0):
    """distance from p along d to the road edge"""
    s = 0.0
    while s < cap and ROAD.contains(Point(*(p + d * s))): s += 0.25
    return s if s < cap else None
yaw = lambda v: math.degrees(math.atan2(v[1], v[0]))

# ---- crossings
pts = []
for i, a in enumerate(MAJ):
    for j, b in enumerate(MAJ + MIN):
        if j == i and j < len(MAJ): continue
        x = a.intersection(b)
        for g in (x.geoms if hasattr(x, 'geoms') else [x]):
            if g.geom_type == 'Point' and SITE.distance(g) > 30: pts.append((g.x, g.y, j < len(MAJ)))
cl = []
for x, y, mm in pts:
    for c in cl:
        if math.hypot(c[0] - x, c[1] - y) < 15: c[2] = c[2] or mm; break
    else: cl.append([x, y, mm])
print('crossings', len(cl), 'major x major', sum(1 for c in cl if c[2]))
P, UV, C, M = [], [], [], []
def quad(a, b, c, d):
    if np.cross(b - a, c - a)[2] < 0: b, d = d, b
    for t in ((a, b, c), (a, c, d)): P.extend(t); UV.extend([v[:2] for v in t]); C.extend([(1, 1, 1)] * 3); M.append(0)
svet = []; nz = 0
for cx, cy, mm in cl:
    c = np.array([cx, cy])
    for ln in MAJ:
        if ln.distance(Point(cx, cy)) > 1.0: continue
        d0 = ln.project(Point(cx, cy))
        for sgn in (1, -1):
            dd = d0 + sgn * 2.0
            if dd < 0 or dd > ln.length: continue
            q = np.array(ln.interpolate(dd).coords[0]); t = (q - c) / (np.linalg.norm(q - c) + 1e-9)      # arm direction
            n = np.array([-t[1], t[0]])
            cross_hw = max(half_width(c, n) or 0, half_width(c, -n) or 0, 6.0)                     # the crossing road's width
            p = c + t * (cross_hw + 3.0)
            if not ROAD.contains(Point(*p)): continue
            wl, wr = half_width(p, n), half_width(p, -n)
            if not wl or not wr: continue
            # zebra: stripes 0.5 m wide every 1.0 m across the carriageway, 3 m long along the road
            for s in np.arange(-wr + 0.5, wl - 0.5, 1.0):
                a0 = p + n * s; z = zat(a0) + 0.095
                quad(np.r_[a0, z], np.r_[a0 + n * 0.5, z], np.r_[a0 + n * 0.5 + t * 3.0, z], np.r_[a0 + t * 3.0, z])
            nz += 1
            if mm:                                                                  # right-hand kerb of traffic coming in
                s_ = p + (-n) * (wr + 0.8) + t * 0.5
                svet.append([round(float(s_[0]), 2), round(float(s_[1]), 2), round(float(zat(s_)), 2), round(yaw(t), 1)])
print('zebras', nz, 'svetofor', len(svet))
np.savez_compressed(os.path.join(HERE, 'out', 'urban_street_mesh.npz'), Urban_Zebra_P=np.array(P, np.float32), Urban_Zebra_UV=np.array(UV, np.float32),
                    Urban_Zebra_C=np.array(C, np.float32), Urban_Zebra_M=np.array(M, np.int8))
json.dump({'Urban_Zebra': ['M_UR_Paint']}, open(os.path.join(HERE, 'out', 'urban_street_mesh_mats.json'), 'w'))

# ---- bus stops
bekat = []
for k, ln in enumerate(MAJ):
    if ln.length < 120: continue
    d = 60.0 + 80.0 * hsh(k)
    while d < ln.length - 40:
        p = np.array(ln.interpolate(d).coords[0]); q = np.array(ln.interpolate(min(ln.length, d + 1)).coords[0])
        t = (q - p) / (np.linalg.norm(q - p) + 1e-9); n = np.array([-t[1], t[0]])
        near_x = min((math.hypot(c[0] - p[0], c[1] - p[1]) for c in cl), default=1e9)
        if near_x > 35 and SITE.distance(Point(*p)) > 20:
            for side in (1, -1):
                e = half_width(p, n * side)
                if not e or e < 3: continue
                s_ = p + n * side * (e + 2.5)
                if ROAD.contains(Point(*s_)) or any(math.hypot(b[0] - s_[0], b[1] - s_[1]) < 120 for b in bekat): continue
                bekat.append([round(float(s_[0]), 2), round(float(s_[1]), 2), round(float(zat(s_)), 2), round(yaw(-n * side) - 90.0, 1)])
        d += BUS_STEP
print('bekat', len(bekat))

# ---- mahalla lamps
lamps = []
for k, w in enumerate(W):
    ln = LineString(w['pts'])
    if ln.distance(SITE) > MAH_R or ln.length < 10: continue
    d = 6.0 + 10.0 * hsh(str(k) + 'l')
    while d < ln.length - 2:
        p = np.array(ln.interpolate(d).coords[0]); p2 = np.array(ln.interpolate(min(ln.length, d + 0.5)).coords[0])
        t = (p2 - p) / (np.linalg.norm(p2 - p) + 1e-9); n = np.array([-t[1], t[0]]) * w['road_side']
        q = p + n * 0.5
        lamps.append([round(float(q[0]), 2), round(float(q[1]), 2), round(float(zat(q)), 2)])
        d += MAH_STEP
print('mahalla lamps', len(lamps))
json.dump({'svetofor': svet, 'bekat': bekat, 'lamps_mahalla': lamps}, open(os.path.join(HERE, 'out', 'urban_street.json'), 'w'))
