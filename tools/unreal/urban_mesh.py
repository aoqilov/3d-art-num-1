"""Stages 1-3 of maps-urban/REJA.md (winding: right-handed maths on the Unreal numbers; flat pieces up,
walls away from the footprint centre; build_urban.py mirrors y for Blender and reverses every triangle back): triangles of the city around the complex from out/urban.json (urban_prep.py)
-> out/urban_mesh.npz, built into a glb by build_urban.py (Blender). All in Unreal METRES (x, y as Unreal, z up).
  terrain    5 m cells (the 15 m DXF grid split 3 x 3, bilinear), a hole exactly at the complex site (its own ground and
             the dented landscape / parking stay), a 3 km skirt at the edge heights
  roads etc. road / path / green / water areas clipped to the same 5 m cells and laid on the terrain (+6 / +8 / +4 / +5 cm),
             dashed centre line on the major roads
  buildings  footprint walls from the lowest ground under them to the Overture height; < 7 m: mahalla house (plaster /
             brick colours, hipped or gabled sheet-metal roof), else flat roof, light facade; window grid in UV0
             (u = 3.2 m bay, v = 3 m storey; walls < 2.4 m blank); colour in UV1 (r, g) + UV2 (b) for the Unreal materials
Objects (material slots): Urban_Terrain [ground], Urban_Roads [asphalt, pavers, grass, water, paint], Urban_Walls [wall],
Urban_Roofs [roof].  Usage: python tools/unreal/urban_mesh.py
"""
import json, math, os, zlib
import numpy as np
from shapely.geometry import Polygon, Point, box, MultiPolygon
from shapely.ops import unary_union, triangulate
from shapely import affinity
HERE = os.path.dirname(os.path.abspath(__file__))
U = json.load(open(os.path.join(HERE, 'out', 'urban.json')))
exec(open(os.path.join(HERE, 'ue_scripts', 'kompleks_coords.py'), encoding='utf-8').read())
G = json.load(open(os.path.join(HERE, 'out', 'genplan.json')))
SUB = 3                                                    # 15 m grid -> 5 m cells

# ---- grid sampler (the DXF grid is affine in Unreal space)
gue = np.array(U['grid']['ue']); Zg = np.array(U['grid']['z']); NI, NJ = Zg.shape
A0 = gue[0, 0]; Aj = (gue[0, -1] - gue[0, 0]) / (NJ - 1); Ai = (gue[-1, 0] - gue[0, 0]) / (NI - 1)
Minv = np.linalg.inv(np.array([Aj, Ai]).T)
def ij(p):
    q = Minv @ (np.asarray(p, float) - A0); return q[1], q[0]          # (i, j) float
def zat(p):
    i, j = ij(p); i = min(max(i, 0), NI - 1.0001); j = min(max(j, 0), NJ - 1.0001)
    i0, j0 = int(i), int(j); a, b = i - i0, j - j0
    return Zg[i0, j0] * (1 - a) * (1 - b) + Zg[i0, j0 + 1] * (1 - a) * b + Zg[i0 + 1, j0] * a * (1 - b) + Zg[i0 + 1, j0 + 1] * a * b
def at(i, j): return A0 + Aj * j + Ai * i

SITE = Polygon([[v / 100 for v in web_to_ue(*p)] for p in np.array(G['site']).reshape(-1, 2)])
def hsh(s): return (zlib.crc32(str(s).encode()) & 0xffffffff) / 0xffffffff
def lin(h):
    h = h.lstrip('#'); c = [int(h[k:k + 2], 16) / 255 for k in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)

class Obj:
    def __init__(self, name, mats): self.name, self.mats, self.P, self.UV, self.C, self.M = name, mats, [], [], [], []
    def tri(self, a, b, c, m, uv=None, col=(1, 1, 1)):
        a, b, c = np.asarray(a, float), np.asarray(b, float), np.asarray(c, float)
        if np.cross(b - a, c - a)[2] < 0 and uv is None: b, c = c, b            # flat pieces face up
        self.P += [a, b, c]; self.UV += uv if uv else [a[:2], b[:2], c[:2]]; self.C += [col] * 3; self.M.append(m)
    def quad(self, a, b, c, d, m, uv, col):
        self.P += [a, b, c, a, c, d]; self.UV += [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]]; self.C += [col] * 6; self.M += [m, m]
    def arrays(self):
        return {self.name + '_P': np.array(self.P, np.float32), self.name + '_UV': np.array(self.UV, np.float32),
                self.name + '_C': np.array(self.C, np.float32), self.name + '_M': np.array(self.M, np.int8)}

def pieces(poly):
    """triangles of a polygon (with holes): Delaunay of its vertices, kept where inside"""
    out = []
    for t in triangulate(poly):
        if poly.contains(t.representative_point()):
            out.append(list(t.exterior.coords)[:3])
    return out
def cell(i, j):                                           # fine cell (i, j) in 1/SUB grid units
    s = 1.0 / SUB
    return Polygon([at(i * s, j * s), at(i * s, (j + 1) * s), at((i + 1) * s, (j + 1) * s), at((i + 1) * s, j * s)])

# ---- terrain
T = Obj('Urban_Terrain', ['M_UR_Ground'])
FI, FJ = (NI - 1) * SUB, (NJ - 1) * SUB
site_b = SITE.bounds
for i in range(FI):
    for j in range(FJ):
        c = cell(i, j)
        if c.intersects(SITE):
            rest = c.difference(SITE)
            for p in (rest.geoms if hasattr(rest, 'geoms') else [rest]):
                if p.geom_type == 'Polygon' and p.area > 0.01:
                    for t in pieces(p): T.tri(*[(x, y, zat((x, y))) for x, y in t], 0)
            continue
        q = [np.array([*at(ii / SUB, jj / SUB), 0.0]) for ii, jj in ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))]
        for v in q: v[2] = zat(v[:2])
        T.tri(q[0], q[1], q[2], 0); T.tri(q[0], q[2], q[3], 0)
# skirt: 3 km outward from each edge, at the edge heights
SK = 3000.0
def edge(points, out):
    for k in range(len(points) - 1):
        a, b = points[k], points[k + 1]
        a2, b2 = a + np.r_[out, 0], b + np.r_[out, 0]
        T.tri(a, b, b2, 0); T.tri(a, b2, a2, 0)
def gp(i, j): p = at(i, j); return np.array([p[0], p[1], Zg[int(i), int(j)]])
nAi, nAj = Ai / np.linalg.norm(Ai), Aj / np.linalg.norm(Aj)
edge([gp(0, j) for j in range(NJ)], -nAi * SK); edge([gp(NI - 1, j) for j in range(NJ)], nAi * SK)
edge([gp(i, 0) for i in range(NI)], -nAj * SK); edge([gp(i, NJ - 1) for i in range(NI)], nAj * SK)
print('terrain tris', len(T.M))

# ---- areas on the terrain
R = Obj('Urban_Roads', ['M_UR_Asphalt', 'M_UR_Pavers', 'M_UR_Grass', 'M_UR_Water', 'M_UR_Paint'])
def lay(polys, m, dz):
    n = 0
    for pr in polys:
        poly = Polygon(pr[0], pr[1:]).buffer(0)
        if poly.is_empty: continue
        i0 = j0 = 1e9; i1 = j1 = -1e9
        for x, y in poly.exterior.coords:
            i, jj = ij((x, y)); i0, i1, j0, j1 = min(i0, i), max(i1, i), min(j0, jj), max(j1, jj)
        for i in range(max(0, int(i0 * SUB) - 1), min(FI, int(i1 * SUB) + 2)):
            for j in range(max(0, int(j0 * SUB) - 1), min(FJ, int(j1 * SUB) + 2)):
                part = cell(i, j).intersection(poly)
                for p in (part.geoms if hasattr(part, 'geoms') else [part]):
                    if p.geom_type != 'Polygon' or p.area < 0.01: continue
                    for t in pieces(p): R.tri(*[(x, y, zat((x, y)) + dz) for x, y in t], m); n += 1
    return n
A = U['areas']
print('roads', lay(A['ROADS_AREA'], 0, 0.06), 'paths', lay(A['PATHS_AREA'], 1, 0.08), 'green', lay(A['GREEN'], 2, 0.04), 'water', lay(A['WATER'], 3, 0.05))
nd = 0
for l in U['lines']['ROADS_MAJOR']:
    P = [np.array(p) for p in l]; acc = 6.0                  # dash phase carried along the whole line
    for k in range(len(P) - 1):
        a, b = P[k], P[k + 1]; L = np.linalg.norm(b - a)
        if L < 0.1: continue
        d = (b - a) / L; nrm = np.array([-d[1], d[0]]) * 0.07; t = acc
        while t + 3 < L:
            p0, p1 = a + d * t, a + d * (t + 3)
            q = [np.r_[p0 + nrm, 0], np.r_[p1 + nrm, 0], np.r_[p1 - nrm, 0], np.r_[p0 - nrm, 0]]
            for v in q: v[2] = zat(v[:2]) + 0.09
            R.tri(q[0], q[1], q[2], 4); R.tri(q[0], q[2], q[3], 4); nd += 1; t += 9.0
        acc = max(0.0, t - L)
print('dashes', nd)

# ---- buildings
W, F = Obj('Urban_Walls', ['M_UR_Wall']), Obj('Urban_Roofs', ['M_UR_Roof'])
HOUSE_WALL = ['#d8c3a5', '#cdb79e', '#e3d5c0', '#bfa98d', '#d6c7ad', '#a8705a', '#b98a6c']
HOUSE_ROOF = ['#8b3a2e', '#5e7d6a', '#7f8c95', '#a9aeb1', '#6b4e3d', '#9a5a3c', '#55707e']
TALL_WALL = ['#d9d4c8', '#cfc7b8', '#e2ddd2', '#c9c2b4', '#bdb8ad', '#d8cdb8']
def obb(p):
    best = None
    for k in range(len(p)):
        a, b = p[k], p[(k + 1) % len(p)]; L = np.linalg.norm(b - a)
        if L < 1e-6: continue
        u = (b - a) / L; v = np.array([-u[1], u[0]])
        us, vs = p @ u, p @ v; area = (us.max() - us.min()) * (vs.max() - vs.min())
        if best is None or area < best[0]:
            best = (area, u * (us.max() + us.min()) / 2 + v * (vs.max() + vs.min()) / 2, u, v, (us.max() - us.min()) / 2, (vs.max() - vs.min()) / 2)
    _, c, u, v, hu, hv = best
    if hu < hv: u, v, hu, hv = v, -u, hv, hu
    return c, u, v, hu, hv
nh = nt = 0
for b in U['buildings']:
    p = np.array(b['fp'], float)
    if len(p) < 3: continue
    h = b['h']
    if abs(h - 9.0) < 0.01 and b['area'] < 400:          # Overture's default 9 m = height unknown: a mahalla house
        h = 6.5 if hsh(str(b['id']) + 'f') < 0.25 else 3.6 + 0.9 * hsh(str(b['id']) + 'g')
    h = max(2.8, h); house = h < 7.0 and b['area'] < 400
    z0 = b['base']; z1 = z0 + h + 0.3
    wall = lin((HOUSE_WALL if house else TALL_WALL)[int(hsh(b['id']) * 997) % (7 if house else 6)])
    run = 0.0
    for k in range(len(p)):
        a, c_ = p[k], p[(k + 1) % len(p)]; L = float(np.linalg.norm(c_ - a))
        u0, u1 = (run / 3.2, (run + L) / 3.2) if L >= 2.4 else (0.0, 0.0)
        qa, qb, qc, qd = np.r_[c_, z0], np.r_[a, z0], np.r_[a, z1], np.r_[c_, z1]
        quv = [(u1, 0), (u0, 0), (u0, (z1 - z0) / 3.0), (u1, (z1 - z0) / 3.0)]
        nrm = np.cross(qb - qa, qc - qa); out_ = np.r_[(a + c_) / 2 - p.mean(0), 0]
        if nrm @ out_ < 0: qa, qb, qc, qd = qb, qa, qd, qc; quv = [quv[1], quv[0], quv[3], quv[2]]   # face away from the centre
        W.quad(qa, qb, qc, qd, 0, quv, wall)
        run += L
    if house:
        c, u, v, hu, hv = obb(p); ov = 0.35; hu += ov; hv += ov; rh = min(2.4, 0.55 * hv)
        hip = hu / max(hv, 0.1) < 1.6 or hsh(str(b['id']) + 'h') < 0.5
        ridge = max(0.0, hu - hv) if hip else hu
        P3 = lambda uu, vv, zz: np.r_[c + u * uu + v * vv, zz]
        ey = z1 - 0.1; rc = lin(HOUSE_ROOF[int(hsh(str(b['id']) + 'c') * 997) % 7])
        a1, a2, a3, a4 = P3(-hu, -hv, ey), P3(hu, -hv, ey), P3(hu, hv, ey), P3(-hu, hv, ey)
        r1, r2 = P3(-ridge, 0, ey + rh), P3(ridge, 0, ey + rh)
        for tri_, col in (((a1, r1, r2), rc), ((a1, r2, a2), rc), ((a3, r2, r1), rc), ((a3, r1, a4), rc),
                          ((a2, r2, a3), rc if hip else wall), ((a4, r1, a1), rc if hip else wall)):
            x, y, z = tri_
            if np.cross(y - x, z - x)[2] < 0: y, z = z, y
            F.P += [x, y, z]; F.UV += [x[:2], y[:2], z[:2]]; F.C += [col] * 3; F.M.append(0)
        nh += 1
    else:
        rc = tuple(np.array(lin('#7d7a74')) * (0.9 + 0.2 * hsh(str(b['id']) + 'r')))
        for t in pieces(Polygon(p).buffer(0) if not Polygon(p).is_valid else Polygon(p)):
            F.tri(*[(x, y, z1) for x, y in t], 0, None, rc)
        nt += 1
print('houses', nh, 'tall / flat', nt, 'wall tris', len(W.M), 'roof tris', len(F.M))

out = {}
for o in (T, R, W, F): out.update(o.arrays())
np.savez_compressed(os.path.join(HERE, 'out', 'urban_mesh.npz'), **out)
json.dump({o.name: o.mats for o in (T, R, W, F)}, open(os.path.join(HERE, 'out', 'urban_mesh_mats.json'), 'w'))
print('urban_mesh.npz written')
