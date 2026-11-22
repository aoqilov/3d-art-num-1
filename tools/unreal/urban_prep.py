"""Stage 0 of maps-urban/REJA.md: the urban-export DXF (maps-urban/, Overture / OSM / Copernicus) -> tools/unreal/out/urban.json
in the complex's frame, ready for build_urban.py (Blender) and the Unreal scripts.
  frame      urban DXF metres (north-up, origin = export centre) -> web scene metres (maps-urban/align.json: the web plan
             centre at t, 15 deg) -> Unreal (kompleks_coords.web_to_ue). Output x, y in Unreal METRES (cm / 100), z metres.
  terrain    the 15 m DXF grid, heights relative to the complex (Z0 = terrain at the site centre = Unreal z 0), FLAT within
             FLAT_R m of the site, smooth blend to the real relief by BLEND_R m (smoothstep)
  buildings  every building's footprint ring + height (Overture estimate), category layer; none inside the site + 8 m
  areas      roads / paths / green / water outlines (closed polylines; holes by XOR), clipped off the site
  lines      road centre lines (major / minor), path centre lines
  trees      positions + height (TREE_L blocks scaled by the DXF insert scale)
Usage: python tools/unreal/urban_prep.py
"""
import json, math, os, sys
import numpy as np
from shapely.geometry import Polygon, Point, LineString, MultiPolygon
from shapely.ops import unary_union
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
exec(open(os.path.join(HERE, 'ue_scripts', 'kompleks_coords.py'), encoding='utf-8').read())
DXF = os.path.join(ROOT, 'maps-urban', 'urban-export_41.3153_69.1912_2600x1890m.dxf')
AL = json.load(open(os.path.join(ROOT, 'maps-urban', 'align.json')))
G = json.load(open(os.path.join(HERE, 'out', 'genplan.json')))
T0 = np.array(AL['plan_centre_in_urban_dxf']); C15, S15 = math.cos(math.radians(15)), math.sin(math.radians(15))
FLAT_R, BLEND_R, SITE_PAD = 150.0, 300.0, 8.0

def u2w(x, y):                                     # urban DXF -> web scene
    dx, dy = x - T0[0], y - T0[1]; return dx * C15 + dy * S15, dx * S15 - dy * C15
def u2ue(x, y):                                    # urban DXF -> Unreal metres
    sx, sz = u2w(x, y); ux, uy = web_to_ue(sx, sz); return ux / 100.0, uy / 100.0

# ---- read the DXF (R12: POLYLINE / VERTEX / SEQEND, INSERT)
lines = open(DXF, encoding='latin-1').read().split('\n')
pairs = [(lines[i].strip(), lines[i + 1].strip()) for i in range(0, len(lines) - 1, 2)]
ents = []; i = 0; n = len(pairs)
while i < n:
    c, v = pairs[i]
    if c == '0' and v in ('POLYLINE', 'INSERT'):
        j = i + 1; hdr = {}
        while pairs[j][0] != '0': hdr[pairs[j][0]] = pairs[j][1]; j += 1
        if v == 'INSERT':
            ents.append(('INSERT', hdr, None, None)); i = j; continue
        V, F = [], []
        while pairs[j] != ('0', 'SEQEND'):
            if pairs[j] == ('0', 'VERTEX'):
                d = {}; j += 1
                while pairs[j][0] != '0': d[pairs[j][0]] = pairs[j][1]; j += 1
                if d.get('70') == '128': F.append([abs(int(d.get(k, 0))) for k in ('71', '72', '73', '74')])
                elif '10' in d: V.append((float(d['10']), float(d['20']), float(d.get('30', 0))))
            else: j += 1
        ents.append(('POLYLINE', hdr, np.array(V), F)); i = j
    i += 1
print('entities', len(ents))

# ---- terrain grid
tv = next(e for e in ents if e[1].get('8') == 'TERRAIN')[2]
xs, ys = np.unique(tv[:, 0].round(3)), np.unique(tv[:, 1].round(3))
Z = np.full((len(ys), len(xs)), np.nan)
ix = {x: k for k, x in enumerate(xs)}; iy = {y: k for k, y in enumerate(ys)}
for x, y, z in tv: Z[iy[round(y, 3)], ix[round(x, 3)]] = z
def zraw(x, y):
    fx = np.clip((x - xs[0]) / (xs[-1] - xs[0]) * (len(xs) - 1), 0, len(xs) - 1.001)
    fy = np.clip((y - ys[0]) / (ys[-1] - ys[0]) * (len(ys) - 1), 0, len(ys) - 1.001)
    i0, j0 = int(fy), int(fx); a, b = fy - i0, fx - j0
    return (Z[i0, j0] * (1 - a) * (1 - b) + Z[i0, j0 + 1] * (1 - a) * b + Z[i0 + 1, j0] * a * (1 - b) + Z[i0 + 1, j0 + 1] * a * b)

site_w = np.array(G['site']).reshape(-1, 2)
inv = lambda sx, sz: (sx * C15 + sz * S15 + T0[0], sx * S15 - sz * C15 + T0[1])   # web -> urban
SITE = Polygon([inv(*p) for p in site_w])
Z0 = float(np.mean([zraw(*p) for p in [SITE.centroid.coords[0]] + list(SITE.exterior.coords)]))
print('site terrain Z0 %.2f m (centre %.2f)' % (Z0, zraw(*SITE.centroid.coords[0])))
def ztop(x, y):
    """new ground height (relative to the complex) at urban (x, y): flat near the site, real relief further out"""
    d = SITE.distance(Point(x, y))
    t = min(1.0, max(0.0, (d - FLAT_R) / (BLEND_R - FLAT_R))); w = t * t * (3 - 2 * t)
    return w * (zraw(x, y) - Z0)

grid = {'x': [round(float(v), 3) for v in xs], 'y': [round(float(v), 3) for v in ys], 'z': []}
for yy in ys:
    grid['z'].append([round(ztop(xx, yy), 3) for xx in xs])
grid['ue'] = [[[round(c, 3) for c in u2ue(xx, yy)] for xx in xs] for yy in ys]

keep_out = SITE.buffer(SITE_PAD)
# ---- buildings
blds = []; skipped = 0
for kind, hdr, V, F in ents:
    lay = hdr.get('8', '')
    if kind != 'POLYLINE' or not lay.startswith('BUILDINGS') or V is None or len(V) < 6: continue
    zmin, zmax = V[:, 2].min(), V[:, 2].max()
    ring = [tuple(p[:2]) for p in V if abs(p[2] - zmin) < 0.01]
    if len(ring) < 3: continue
    poly = Polygon(ring)
    if not poly.is_valid: poly = poly.buffer(0)
    if poly.is_empty or poly.area < 6: continue
    if poly.intersects(keep_out): skipped += 1; continue
    if isinstance(poly, MultiPolygon): poly = max(poly.geoms, key=lambda g: g.area)
    cx, cy = poly.centroid.coords[0]
    base = min(ztop(x, y) for x, y in poly.exterior.coords) - 0.3
    blds.append({'id': len(blds), 'cat': lay.replace('BUILDINGS_', '').lower(), 'h': round(float(zmax - zmin), 2), 'base': round(base, 2),
                 'area': round(poly.area, 1), 'fp': [[round(c, 3) for c in u2ue(x, y)] for x, y in list(poly.exterior.coords)[:-1]],
                 'c': [round(c, 3) for c in u2ue(cx, cy)], 'dsite': round(SITE.distance(Point(cx, cy)), 1)})
print('buildings', len(blds), 'skipped in site', skipped)

# ---- areas (closed outlines, holes by XOR), clipped off the site
def areas(layer):
    rings = [Polygon(V[:, :2]) for k, h, V, F in ents if k == 'POLYLINE' and h.get('8') == layer and h.get('70') == '9' and len(V) >= 3]
    g = None
    for r in sorted(rings, key=lambda p: -abs(p.area)):
        r = r if r.is_valid else r.buffer(0)
        g = r if g is None else g.symmetric_difference(r)
    if g is None: return []
    g = g.difference(SITE.buffer(1.0))
    out = []
    for p in (g.geoms if hasattr(g, 'geoms') else [g]):
        if p.geom_type != 'Polygon' or p.area < 2: continue
        out.append([[[round(c, 3) for c in u2ue(x, y)] for x, y in list(r.coords)[:-1]] for r in [p.exterior, *p.interiors]])
    return out
def mesh_areas(layer):
    """the layer's polyface mesh faces (exact; the closed outlines XOR'ed into wrong big areas for PATHS_AREA)"""
    polys = []
    for k, h, V, F in ents:
        if k != 'POLYLINE' or h.get('8') != layer or h.get('70') != '64' or not F: continue
        for f in F:
            idx = [i - 1 for i in f if i > 0]
            if len(idx) < 3: continue
            p = Polygon(V[idx, :2])
            if p.is_valid and p.area > 1e-4: polys.append(p)
    if not polys: return []
    g = unary_union(polys).buffer(0.02).buffer(-0.02).difference(SITE.buffer(1.0))
    out = []
    for p in (g.geoms if hasattr(g, 'geoms') else [g]):
        if p.geom_type != 'Polygon' or p.area < 2: continue
        p = p.simplify(0.05)
        out.append([[[round(c, 3) for c in u2ue(x, y)] for x, y in list(r.coords)[:-1]] for r in [p.exterior, *p.interiors]])
    return out
A = {'ROADS_AREA': mesh_areas('ROADS_AREA'), 'PATHS_AREA': mesh_areas('PATHS_AREA'), 'GREEN': areas('GREEN'), 'WATER': mesh_areas('WATER')}
for k_, v_ in A.items(): print(k_, 'area m2', round(sum(Polygon(p[0], p[1:]).area for p in v_)))
print({k: len(v) for k, v in A.items()})

# ---- centre lines
def plines(layer):
    out = []
    for k, h, V, F in ents:
        if k == 'POLYLINE' and h.get('8') == layer and h.get('70') == '8' and len(V) >= 2:
            ls = LineString(V[:, :2]).difference(SITE.buffer(2.0))
            for l in (ls.geoms if hasattr(ls, 'geoms') else [ls]):
                if l.length > 3: out.append([[round(c, 3) for c in u2ue(x, y)] for x, y in l.coords])
    return out
L = {k: plines(k) for k in ('ROADS_MAJOR', 'ROADS_MINOR', 'PATHS')}
print({k: len(v) for k, v in L.items()})

# ---- trees (TREE_L block 22.7 m tall at scale 1? the FBX scales give the real size: here height from 43 scale)
# tree sizes: the FBX of the same export has one cone per tree (height / crown from Meta canopy height); owner 2026-11-22:
# the trees taller -> x TREE_TALL, clamped (maps-urban/_fbx_trees.json, written by a Blender read of the FBX)
TREE_TALL, TREE_MIN, TREE_MAX = 1.4, 9.0, 22.0
FT = {(round(t[0], 1), round(t[1], 1)): t for t in json.load(open(os.path.join(ROOT, 'maps-urban', '_fbx_trees.json')))}
trees = []
for k, h, V, F in ents:
    if k != 'INSERT' or h.get('8') != 'TREES': continue
    x, y = float(h['10']), float(h['20'])
    if SITE.buffer(4.0).contains(Point(x, y)): continue
    f = FT.get((round(x, 1), round(y, 1)))
    ht = min(TREE_MAX, max(TREE_MIN, (f[2] if f else 7.0) * TREE_TALL)); cr = (f[3] if f else 8.0) * TREE_TALL
    trees.append([*[round(float(c), 3) for c in u2ue(x, y)], round(float(ztop(x, y)), 2), round(ht, 2), round(cr, 2)])   # x, y, z, height, crown
print('trees', len(trees), 'scale sample', trees[:2])

json.dump({'note': 'maps-urban urban-export (OSM / Overture / Copernicus / Meta canopy) in Unreal metres; tools/unreal/urban_prep.py',
           'Z0': Z0, 'flat_r': FLAT_R, 'blend_r': BLEND_R, 'grid': grid, 'buildings': blds, 'areas': A, 'lines': L, 'trees': trees},
          open(os.path.join(HERE, 'out', 'urban.json'), 'w'))
print('urban.json written')
