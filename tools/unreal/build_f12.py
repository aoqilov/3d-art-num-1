# High-detail Unreal model of block 1 (type 4), all 16 storeys + facade + roof, straight from the plan (src/block/data/plan_t4.json)
# and the facade rules of src/block/facade.ts. Unlike the web model every part is a closed solid with real thickness:
# walls, slabs, sills and lintels; profiled window frames with double glazing; the portal built brick by brick;
# the girih screen as real bars; 3D shop lettering; balusters as geometry (Nanite carries it in Unreal).
#   D:/blender.exe -b --factory-startup -P tools/unreal/build_f12.py
# out: tools/unreal/out/blok1_full.glb (+ .blend). Blender (x, y, z) = plan (x, -y, height); street facade faces +Y.
import bpy, json, math, os, random
from mathutils import Vector, geometry

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
TEX = os.path.join(ROOT, 'public-pro/pro/tex')
OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)
random.seed(4)
bpy.ops.wm.read_factory_settings(use_empty=True)       # no default cube / camera / light in the export

FLOOR_H, SLAB, BLOCK_W = 3.0, 0.2, 29.7
# 2026-11-19 reset to a clean base (owner): empty flats, no artificial lights; rebuilt step by step later
FURNITURE = False      # furniture, kitchens, sanitary ware, shop fit-out, Poly Haven kit placements
LAMPS = True           # ceiling fixtures + Unreal point lights (lights.json): soft warm light in flats (owner, 2026-11-18)
ZTOP = 2 * FLOOR_H + SLAB          # model ends with the slab over storey 2
PLAN = json.load(open(os.path.join(ROOT, 'src/block/data/plan_t4.json'), encoding='utf-8'))

# ------------------------------------------------------------------ plan fixes (checked against the brochure plans)
rect = lambda x0, y0, x1, y1: dict(outer=[[x0, y0], [x1, y0], [x1, y1], [x0, y1]], holes=[])
def _fix_plan():
    # 1. A partition drawn as two line layers: the extractor read one whole layer as a 1.8-2.8 m "door". It is wall,
    #    except where a real door of the same wall line sits next to it (that door is widened through the layer).
    for s in ('2', '3'):
        F = PLAN[s]; keep = []
        for o in F['openings']:
            if not (o['kind'] == 'door' and o['span'] > 1.6): keep.append(o); continue
            ax = o['axis']; lo, hi = ('x0', 'x1') if ax == 'x' else ('y0', 'y1'); n0, n1 = ('y0', 'y1') if ax == 'x' else ('x0', 'x1')
            if s == '2' and abs(o['x0'] - 9.1) < 0.05 and ax == 'y':
                keep.append(dict(o, y0=6.29, span=round(o['y1'] - 6.29, 3)))        # 40.73 flat: hall <-> corridor stays open
                o = dict(o, y1=6.29)
            cuts = []
            for d in F['openings']:
                if d is o or d['axis'] != ax or d['span'] > 1.6: continue
                if d[lo] < o[hi] and d[hi] > o[lo] and min(abs(d[n0] - o[n1]), abs(d[n1] - o[n0])) < 0.03:
                    cuts.append((d[lo], d[hi])); d[n0] = min(d[n0], o[n0]); d[n1] = max(d[n1], o[n1])
            u = o[lo]
            for a, b in sorted(cuts) + [(o[hi], o[hi])]:
                if a - u > 0.005:
                    F['walls'].append(rect(u, o['y0'], a, o['y1']) if ax == 'x' else rect(o['x0'], u, o['x1'], a))
                u = max(u, b)
        F['openings'] = keep
    # 2. Storey 2, 40.73 flat: bath and hall were read as one 6.5 m2 "bath" (no partition). Mirror of the 41.46 flat:
    #    bath x 6.41-8.02, partition 8.02-8.20 with a 0.9 m bath door, hall x 8.20-9.10.
    F = PLAN['2']; r16 = next(r for r in F['rooms'] if r['id'] == 16)
    nid = max(r['id'] for r in F['rooms']) + 1
    r16['poly'] = rect(6.49, 4.81, 8.02, 7.26); r16['area'] = round(1.53 * 2.45, 2)
    F['rooms'].append(dict(id=nid, kind=None, apt=r16['apt'], area=round(0.9 * 2.8, 2), poly=rect(8.20, 4.81, 9.10, 7.61)))
    for a in F['apts']:
        if 16 in a['rooms']: a['rooms'].append(nid)
    F['walls'] += [rect(8.02, 4.81, 8.20, 5.91), rect(8.02, 6.81, 8.20, 7.61)]
    F['openings'].append(dict(x0=8.02, y0=5.91, x1=8.20, y1=6.81, axis='y', kind='door', span=0.9))
    # 3. Storey 2, 54.40 and 63.56 flats: the bath partition is drawn but its doorway was not marked, so the bath and the
    #    flat corridor were read as one "bath". Mark the doorway and split the room at the partition (as on storeys 3-16).
    def clip(ring, c, keep_lo):
        out = []
        for i in range(len(ring)):
            a, b = ring[i], ring[(i + 1) % len(ring)]
            ia, ib = (a[0] <= c) == keep_lo, (b[0] <= c) == keep_lo
            if ia: out.append(a)
            if ia != ib:
                t = (c - a[0]) / (b[0] - a[0]); out.append([c, a[1] + t * (b[1] - a[1])])
        return out
    area = lambda r: abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2
    for rid, cx_, door in ((12, 1.945, (1.89, 7.91, 2.0, 8.81)), (2, 2.05, (1.99, 10.62, 2.11, 11.51))):
        r = next(q for q in F['rooms'] if q['id'] == rid); ring = r['poly']['outer']
        nid = max(q['id'] for q in F['rooms']) + 1
        bath = clip(ring, cx_, True); cor = clip(ring, cx_, False)
        r['poly'] = dict(outer=bath, holes=[]); r['area'] = round(area(bath), 2)
        F['rooms'].append(dict(id=nid, kind='corridor', apt=r['apt'], area=round(area(cor), 2), poly=dict(outer=cor, holes=[])))
        for a in F['apts']:
            if rid in a['rooms']: a['rooms'].append(nid)
        F['openings'].append(dict(x0=door[0], y0=door[1], x1=door[2], y1=door[3], axis='y', kind='door', span=round(door[3] - door[1], 3)))
_fix_plan()
os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'), exist_ok=True)
json.dump(PLAN, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'plan_fixed.json'), 'w', encoding='utf-8'))

# ------------------------------------------------------------------ plan helpers (ports of plan.ts / floorGeom.ts)
def in_ring(x, y, r):
    ins = False; j = len(r) - 1
    for i in range(len(r)):
        xi, yi = r[i]; xj, yj = r[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: ins = not ins
        j = i
    return ins
def in_poly(x, y, p): return in_ring(x, y, p['outer']) and not any(in_ring(x, y, h) for h in p['holes'])
def bounds(p):
    xs = [a[0] for a in p['outer']]; ys = [a[1] for a in p['outer']]
    return min(xs), min(ys), max(xs), max(ys)

for fp in PLAN.values():                 # unlabelled public room touching a railing = open balcony
    for r in fp['rooms']:
        if r['kind'] is not None or r['apt'] is not None: continue
        hit = False
        for rl in fp['rails']:
            u = rl['lo'] + 0.2
            while u < rl['hi'] - 0.2 and not hit:
                for d in (-0.12, 0.12):
                    x, y = (u, rl['off'] + d) if rl['axis'] == 'h' else (rl['off'] + d, u)
                    if in_poly(x, y, r['poly']): hit = True
                u += 0.4
        if hit: r['kind'] = 'balcony'
for fp in PLAN.values():                 # "window" with a habitable room on both sides = glass partition
    def kind_at(x, y, fp=fp):
        for r in fp['rooms']:
            if in_poly(x, y, r['poly']): return r['kind'] or 'none'
        return None
    keep = []
    for w in fp['windows']:
        cx, cy = (w['x0'] + w['x1']) / 2, (w['y0'] + w['y1']) / 2
        a, b = (kind_at(cx, w['y0'] - 0.25), kind_at(cx, w['y1'] + 0.25)) if w['axis'] == 'x' else (kind_at(w['x0'] - 0.25, cy), kind_at(w['x1'] + 0.25, cy))
        inner = lambda k: k not in (None, 'none', 'balcony')
        if inner(a) and inner(b): fp['glass'].append(w)
        else: keep.append(w)
    fp['windows'] = keep

# Owner's change (2026-11-18): the street-corner balconies of storeys 3-16 lose the side wall on the outer
# gable (x 0..0.21 and 29.51..29.71, plan y 0.2..1.59); the front railing runs to the corner and returns 90 degrees
# along the gable. CORNER_CUT is cut out of the gable walls with a boolean after the mesh is built.
CORNER_Y = (0.1, 1.59)
CORNER_CUT = [(-0.1, 0.215), (29.505, 29.8)]
for rl in PLAN['3']['rails']:
    if rl['axis'] == 'h' and abs(rl['off'] - 0.25) < 0.05:
        if rl['lo'] < 1: rl['lo'] = 0.04
        if rl['hi'] > 29: rl['hi'] = 29.67
PLAN['3']['rails'] += [dict(axis='v', off=0.04, lo=0.25, hi=CORNER_Y[1], n=3), dict(axis='v', off=29.67, lo=0.25, hi=CORNER_Y[1], n=3)]

def stair_room(p):
    for r in p['rooms']:
        if r['kind'] is None and r['apt'] is None and 12 < r['area'] < 17:
            x0, y0, x1, y1 = bounds(r['poly'])
            if 9 < (x0 + x1) / 2 < 13: return r
    return None
STAIR_LAND = 1.3
HALL1 = dict(x0=14.69, y0=9.79, x1=16.99, y1=17.9)
# door heads: 2.20 m clear above the 0.2 m slab (brochure: "Eshik balandligi 2.20 m")
H = {1: dict(sill=0.12, head=2.55, door=2.55, open=2.55), 2: dict(sill=1.05, head=2.5, door=2.4, open=2.4), 3: dict(sill=1.05, head=2.5, door=2.4, open=2.4)}
FLOORS = 16; ROOF_Z = FLOORS * FLOOR_H

# ------------------------------------------------------------------ mesh accumulation
class Part:
    def __init__(s, name): s.name = name; s.v = []; s.f = []; s.m = []
PARTS = {}
CUR = ['']                                   # mesh prefix: F1_, F2_, Typ_ (storey-local, z from 0) or Fac_ (absolute)
def part(n):
    n = CUR[0] + n
    if n not in PARTS: PARTS[n] = Part(n)
    return PARTS[n]

def area2(r): return sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r))) / 2
def clean(r):
    out = []
    for p in r:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > 1e-4: out.append(tuple(p))
    while len(out) > 2 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) <= 1e-4: out.pop()
    return out

def prism(pn, outer, holes, w0, w1, to3, top, bot, side):
    """Closed solid: 2D rings (u, v) swept from w0 to w1. to3(u, v, w) -> 3D. side: material or fn(mu, mv, nu, nv)."""
    if w1 - w0 < 1e-5: return
    P = part(pn)
    outer = clean(outer); holes = [clean(h) for h in holes if len(clean(h)) > 2]
    if len(outer) < 3: return
    if area2(outer) < 0: outer = outer[::-1]
    holes = [h if area2(h) < 0 else h[::-1] for h in holes]
    rings = [outer] + holes
    base = len(P.v); idx = []
    for r in rings:
        a = []; b = []
        for (u, v) in r:
            a.append(len(P.v)); P.v.append(tuple(to3(u, v, w0)))
        for (u, v) in r:
            b.append(len(P.v)); P.v.append(tuple(to3(u, v, w1)))
        idx.append((a, b))
    wdir = Vector(to3(0, 0, 1)) - Vector(to3(0, 0, 0))
    flat = [p for r in rings for p in r]
    lo = [i for a, _ in idx for i in a]; hi = [i for _, b in idx for i in b]
    tris = geometry.tessellate_polygon([[Vector((u, v, 0)) for (u, v) in r] for r in rings])
    for t in tris:
        A, B, C = (Vector(P.v[hi[k]]) for k in t)
        n = (B - A).cross(C - A)
        tt = t if n.dot(wdir) > 0 else (t[0], t[2], t[1])
        if top: P.f.append(tuple(hi[k] for k in tt)); P.m.append(top)
        if bot: P.f.append(tuple(lo[k] for k in (tt[0], tt[2], tt[1]))); P.m.append(bot)
    for r, (a, b) in zip(rings, idx):
        n = len(r)
        for i in range(n):
            j = (i + 1) % n
            du, dv = r[j][0] - r[i][0], r[j][1] - r[i][1]; L = math.hypot(du, dv)
            if L < 1e-5: continue
            nu, nv = dv / L, -du / L
            mu, mv = (r[i][0] + r[j][0]) / 2, (r[i][1] + r[j][1]) / 2
            mat = side(mu, mv, nu, nv) if callable(side) else side
            if not mat: continue
            q = (a[i], a[j], b[j], b[i])
            A, B, D = Vector(P.v[q[0]]), Vector(P.v[q[1]]), Vector(P.v[q[3]])
            out3 = Vector(to3(mu + nu, mv + nv, w0)) - Vector(to3(mu, mv, w0))
            if (B - A).cross(D - A).dot(out3) < 0: q = q[::-1]
            P.f.append(q); P.m.append(mat)

plan3 = lambda u, v, w: (u, -v, w)                 # plan (x, y) ring, height w
def fac3(y):                                         # facade plane: ring in (x, z), swept along plan y
    return lambda u, v, w: (u, -w, v)

def pbox(pn, mat, x0, y0, x1, y1, z0, z1, **faces):
    """Axis-aligned plan box. faces: top/bottom/px/nx/py/ny override (None = no face)."""
    if x1 - x0 < 1e-5 or y1 - y0 < 1e-5 or z1 - z0 < 1e-5: return
    def side(mu, mv, nu, nv):
        k = ('px' if nu > 0.5 else 'nx') if abs(nu) > 0.5 else ('py' if nv > 0.5 else 'ny')
        return faces.get(k, mat)
    prism(pn, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], [], z0, z1, plan3, faces.get('top', mat), faces.get('bottom', mat), side)

def gquad(pn, mat, axis, u0, u1, c, z0, z1):
    """Single glass sheet (one quad; the Unreal glass material is two-sided): plan axis 'x' = sheet along x at plan y = c."""
    P = part(pn); b = len(P.v)
    if axis == 'x': P.v += [(u0, -c, z0), (u1, -c, z0), (u1, -c, z1), (u0, -c, z1)]
    else: P.v += [(c, -u0, z0), (c, -u1, z0), (c, -u1, z1), (c, -u0, z1)]
    P.f.append((b, b + 1, b + 2, b + 3)); P.m.append(mat)

def obox(pn, mat, o, ax, ay, az):
    """Box from corner o (3D) with edge vectors ax, ay, az."""
    P = part(pn); o = Vector(o); ax, ay, az = Vector(ax), Vector(ay), Vector(az)
    base = len(P.v)
    for k in range(8):
        P.v.append(tuple(o + ax * (k & 1) + ay * ((k >> 1) & 1) + az * ((k >> 2) & 1)))
    quads = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    flip = ax.cross(ay).dot(az) < 0
    for q in quads:
        q = q[::-1] if flip else q
        P.f.append(tuple(base + i for i in q)); P.m.append(mat)

# ------------------------------------------------------------------ one storey (port of buildStorey)
def storey(s):
    """Storey-local geometry (slab underside at z = 0); s = plan type 1, 2 or 3 (3 = typical storeys 3-16)."""
    p = PLAN[str(s)]; h = H[s]; Z = 0.0
    rooms = p['rooms']
    def room_at(x, y):
        for r in rooms:
            if in_poly(x, y, r['poly']): return r
        return None
    in_hall = lambda x, y: s == 1 and HALL1['x0'] - 0.05 < x < HALL1['x1'] + 0.05 and HALL1['y0'] < y < HALL1['y1'] - 0.05
    inside = lambda x, y: in_poly(x, y, p['footprint']) or in_hall(x, y)
    balcony_at = lambda x, y: (room_at(x, y) or {}).get('kind') == 'balcony'
    ext_mat = 'M_BrickWall' if s == 1 else 'M_FacadeMint'
    def classify(x, y):
        if in_hall(x, y): return 'M_PaintPublic'
        r = room_at(x, y)
        if r:
            k = r['kind']
            if k == 'balcony': return 'M_FacadeWhite'
            if k == 'lift' or (r['apt'] is None and k != 'shop'): return 'M_PaintPublic'
            return 'M_Plaster'            # handover state: one coat of white plaster (bath tiles are a design overlay)
        return 'M_Jamb' if inside(x, y) else ext_mat
    def floor_mat(r):
        if not r: return 'M_Concrete'
        k = r['kind']
        return {'bath': 'M_FloorTile', 'balcony': 'M_FloorDeck', 'shop': 'M_FloorShop', 'lift': 'M_Concrete'}.get(k,
               ('M_FloorStone' if r['apt'] is None else 'M_FloorWood') if k is None else 'M_FloorWood')
    def floor_piece(r, make):
        """Flat finishes: inside a flat the design floor (FloorsD) and the handover screed (FloorsH) are separate meshes
        the UI swaps; public rooms keep one floor (Floors)."""
        if r and r['apt'] is not None:
            make('FloorsD', floor_mat(r)); make('FloorsH', 'M_Screed')
        else:
            make('Floors', floor_mat(r))
    wall_side = lambda mu, mv, nu, nv: classify(mu + nu * 0.06, mv + nv * 0.06)

    # walls: drawn wall polygons as solids, every face finished by what it faces
    for w in p['walls']:
        if s == 1:                                 # storey 1: no wall on the stair centre line (x 10.91-11.09, y 11.65-17.78);
            wx = [q[0] for q in w['outer']]; wy = [q[1] for q in w['outer']]     # owner 2026-11-19: open the flight to
            if 10.85 < min(wx) and max(wx) < 11.15 and min(wy) > 10.4 and max(wy) < 17.9: continue   # the strip beside it
        corner =s == 3 and any(y < CORNER_Y[1] and (x < 0.3 or x > 29.4) for x, y in w['outer'])
        prism('WallCut' if corner else 'Shell', w['outer'], w['holes'], Z + SLAB, Z + FLOOR_H, plan3, 'M_Concrete', None, wall_side)
    if s == 1:                                     # instead: brick wall closing the courtyard strip beside the stair entrance,
        # in line with the entrance door (pier at x 9.69 .. door casing at x 11.08); brick outside, stair paint inside
        pbox('Shell', 'M_BrickWall', 9.69, 17.6, 11.08, 17.78, Z, Z + FLOOR_H, top='M_Concrete', bottom=None, ny='M_PaintPublic')
    if s == 3:                                     # decking where the gable wall stood
        for x0, x1 in ((0.0, 0.215), (29.505, 29.71)):
            pbox('FloorsD', 'M_FloorDeck', x0, 0.2, x1, CORNER_Y[1], Z + SLAB - 0.004, Z + SLAB + 0.003, bottom=None)
            pbox('FloorsH', 'M_Screed', x0, 0.2, x1, CORNER_Y[1], Z + SLAB - 0.004, Z + SLAB + 0.003, bottom=None)

    def ext_side(r):
        if r['axis'] == 'x':
            cx = (r['x0'] + r['x1']) / 2
            if not inside(cx, r['y0'] - 0.15): return (0, -1)
            if not inside(cx, r['y1'] + 0.15): return (0, 1)
        else:
            cy = (r['y0'] + r['y1']) / 2
            if not inside(r['x0'] - 0.15, cy): return (-1, 0)
            if not inside(r['x1'] + 0.15, cy): return (1, 0)
        return None
    def fill(r, z0, z1, top, bot):        # wall piece above/below an opening
        # 1.5 cm into the neighbouring walls along the opening: no hairline cracks for ray-traced GI to leak through
        e = 0.015; ax_x = r['axis'] == 'x'
        x0, x1 = (r['x0'] - e, r['x1'] + e) if ax_x else (r['x0'], r['x1'])
        y0, y1 = (r['y0'], r['y1']) if ax_x else (r['y0'] - e, r['y1'] + e)
        prism('Shell', [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], [], Z + z0, Z + z1, plan3, top, bot, wall_side)

    def glazing(r, z0, z1, step, ext, transom=None, frame='M_Frame', door=False, leaf=0, dpane=None):
        """Profiled frame + double glazing inside opening r (plan rect), storey-local heights z0..z1.
        leaf=+1/-1: a flat's balcony door. Only the outer frame is built here; the glazed leaf is a BP_Blok1Door
        (Kit_DoorGlass, walk.json 'balc') hinged on the frame that swings 90 degrees into the room (room on +leaf side).
        dpane=(i, head, side): pane i of a glazed partition becomes a door: a transom at head, glass above it, and a
        glazed leaf below (walk.json 'balc') that swings to the side (+1/-1 along the frame normal)."""
        ax = r['axis']; u0, u1 = (r['x0'], r['x1']) if ax == 'x' else (r['y0'], r['y1'])
        t0, t1 = (r['y0'], r['y1']) if ax == 'x' else (r['x0'], r['x1'])
        if ext: c = (t0 + 0.085) if (ext[1] if ax == 'x' else ext[0]) < 0 else (t1 - 0.085)
        else: c = (t0 + t1) / 2
        def bar(a, b, za, zb, depth=0.07, mat=frame):
            if ax == 'x': pbox('Frames', mat, a, c - depth / 2, b, c + depth / 2, Z + za, Z + zb)
            else: pbox('Frames', mat, c - depth / 2, a, c + depth / 2, b, Z + za, Z + zb)
        F = 0.065                                            # outer frame
        bar(u0, u0 + F, z0, z1); bar(u1 - F, u1, z0, z1)
        if not door: bar(u0, u1, z0, z0 + F)
        bar(u0, u1, z1 - F, z1)
        span = u1 - u0; n = max(1, round(span / step))
        if leaf:
            # glazed leaf(s): one, or a pair hinged on both frame posts for wide openings
            ax_ = r['axis']; n_ = 1 if span < 1.3 else 2; wl = (span - 2 * F - 0.008) / n_
            for k in range(n_):
                hu = u0 + F + 0.004 if k == 0 else u1 - F - 0.004; d = 1 if k == 0 else -1
                hx, hy = (hu, c) if ax_ == 'x' else (c, hu)
                closed = (0.0 if d > 0 else 180.0) if ax_ == 'x' else (90.0 if d > 0 else -90.0)
                into = (90.0 if leaf > 0 else -90.0) if ax_ == 'x' else (0.0 if leaf > 0 else 180.0)   # leaf direction when open
                opened = closed + ((into - closed + 180.0) % 360.0 - 180.0)                             # shortest turn
                BALC.setdefault(CUR[0].rstrip('_'), []).append(dict(hinge=(round(hx, 3), round(hy, 3)), width=round(wl - 0.004, 3),
                    z=round(Z + z0 + 0.005, 3), height=round(z1 - F - z0 - 0.01, 3), closed=closed, opened=opened))
            return c
        cuts = [u0 + span * i / n for i in range(1, n)]
        for u in cuts: bar(u - 0.04, u + 0.04, z0, z1)
        if transom: bar(u0, u1, transom - 0.035, transom + 0.035)
        # sashes: slimmer, set 1 cm back, around every pane
        edges = [u0 + F] + [u for u in cuts] + [u1 - F]
        zs = [z0 + (0 if door else F), z1 - F] if not transom else [z0 + (0 if door else F), transom - 0.035, transom + 0.035, z1 - F]
        for i in range(len(edges) - 1):
            a = edges[i] + (0.04 if 0 < i else 0); b = edges[i + 1] - (0.04 if i + 1 < len(edges) - 1 else 0)
            if dpane and i == dpane[0]:
                hd, sd = dpane[1], dpane[2]; ax_ = r['axis']
                bar(a, b, hd - 0.035, hd + 0.035)                                     # transom over the door
                S = 0.05
                bar(a, a + S, hd + 0.035, z1 - F, 0.055); bar(b - S, b, hd + 0.035, z1 - F, 0.055)
                bar(a, b, hd + 0.035, hd + 0.035 + S, 0.055); bar(a, b, z1 - F - S, z1 - F, 0.055)
                gquad('Glass', 'M_Glass', ax_, a + 0.02, b - 0.02, c, Z + hd + 0.055, Z + z1 - F - 0.02)
                hx, hy = (a + 0.004, c) if ax_ == 'x' else (c, a + 0.004)
                closed = 0.0 if ax_ == 'x' else 90.0
                into = (90.0 if sd > 0 else -90.0) if ax_ == 'x' else (0.0 if sd > 0 else 180.0)
                BALC.setdefault(CUR[0].rstrip('_'), []).append(dict(hinge=(round(hx, 3), round(hy, 3)), width=round(b - a - 0.008, 3),
                    z=round(Z + z0 + 0.005, 3), height=round(hd - 0.035 - z0 - 0.01, 3), closed=closed,
                    opened=closed + ((into - closed + 180.0) % 360.0 - 180.0)))
                continue
            for k in range(0, len(zs) - 1, 2):
                za, zb = zs[k], zs[k + 1]; S = 0.05
                bar(a, a + S, za, zb, 0.055); bar(b - S, b, za, zb, 0.055)
                bar(a, b, za, za + S, 0.055); bar(a, b, zb - S, zb, 0.055)
                # one sheet per pane: stacked translucent layers read as fog, a real double-glazed unit reflects as one
                gquad('Glass', 'M_Glass', ax, a + 0.02, b - 0.02, c, Z + za + 0.02, Z + zb - 0.02)
        return c

    for w in p['windows']:
        fill(w, SLAB, h['sill'], 'M_SillIn', 'M_Jamb'); fill(w, h['head'], FLOOR_H, 'M_Concrete', 'M_Jamb')
        ext = ext_side(w)
        cx, cy = (w['x0'] + w['x1']) / 2, (w['y0'] + w['y1']) / 2
        loggia = (balcony_at(cx, w['y0'] - 0.2) or balcony_at(cx, w['y1'] + 0.2)) if w['axis'] == 'x' else (balcony_at(w['x0'] - 0.2, cy) or balcony_at(w['x1'] + 0.2, cy))
        c = glazing(w, h['sill'], h['head'], 1.25 if s == 1 else 0.75, ext, 2.08 if s == 1 else None)
        if ext and s != 1:
            # stone sill outside the frame with a 5 cm drip overhang; slate spandrel bands on the facade plane
            if w['axis'] == 'x':
                yo = w['y0'] if ext[1] < 0 else w['y1']; sgn = ext[1]
                ya, yb = sorted((c, yo + sgn * 0.05))
                pbox('Shell', 'M_Sill', w['x0'] - 0.03, ya, w['x1'] + 0.03, yb, Z + h['sill'] - 0.04, Z + h['sill'])
                if not loggia:
                    y0, y1 = sorted((yo, yo + sgn * 0.015))
                    pbox('Shell', 'M_Spandrel', w['x0'], y0, w['x1'], y1, Z + (SLAB if s == 2 else 0), Z + h['sill'] - 0.04)
                    pbox('Shell', 'M_Spandrel', w['x0'], y0, w['x1'], y1, Z + h['head'], Z + FLOOR_H)
            else:
                xo = w['x0'] if ext[0] < 0 else w['x1']; sgn = ext[0]
                xa, xb = sorted((c, xo + sgn * 0.05))
                pbox('Shell', 'M_Sill', xa, w['y0'] - 0.03, xb, w['y1'] + 0.03, Z + h['sill'] - 0.04, Z + h['sill'])
                if not loggia:
                    x0, x1 = sorted((xo, xo + sgn * 0.015))
                    pbox('Shell', 'M_Spandrel', x0, w['y0'], x1, w['y1'], Z + (SLAB if s == 2 else 0), Z + h['sill'] - 0.04)
                    pbox('Shell', 'M_Spandrel', x0, w['y0'], x1, w['y1'], Z + h['head'], Z + FLOOR_H)

    for o in p['openings']:
        cx, cy = (o['x0'] + o['x1']) / 2, (o['y0'] + o['y1']) / 2
        x = o['axis'] == 'x'
        if s == 1 and o['axis'] == 'y' and abs(o['x0'] - 14.5) < 0.05 and LIFT_Y[0][0] < cy < LIFT_Y[1][1]:
            o = dict(o, kind='lift')                       # ground-floor lift doorways are drawn as plain openings
        to_balc = (balcony_at(cx, o['y0'] - 0.2) or balcony_at(cx, o['y1'] + 0.2)) if x else (balcony_at(o['x0'] - 0.2, cy) or balcony_at(o['x1'] + 0.2, cy))
        head = h['open'] if o['kind'] == 'open' else (h['head'] if to_balc else h['door'])
        in_stair = 9.65 < cx < 12.35 and 10.4 < cy < 14.9            # stair zone: no lintel (head room over the landings)
        sides = [room_at(cx, o['y0'] - 0.1), room_at(cx, o['y1'] + 0.1)] if x else [room_at(o['x0'] - 0.1, cy), room_at(o['x1'] + 0.1, cy)]
        # inside one flat, hall <-> corridor is one L-shaped corridor on the drawings: an open passage (no lintel, casing, leaf)
        passage = (o['kind'] == 'door' and all(r for r in sides) and sides[0]['apt'] is not None and sides[0]['apt'] == sides[1]['apt']
                   and all(r['kind'] in (None, 'corridor', 'hall') for r in sides))
        if passage: PASSAGES.append((s, round(cx, 2), round(cy, 2), o['span']))
        if not in_stair and not passage: fill(o, head, FLOOR_H, 'M_Concrete', 'M_Jamb')
        fr = next((r for r in sides if r and r['kind'] not in ('bath', 'balcony')), None) or next((r for r in sides if r), None)
        floor_piece(fr, lambda pn, m: pbox(pn, m, o['x0'], o['y0'], o['x1'], o['y1'], Z + SLAB - 0.001, Z + SLAB + 0.003, bottom=None))
        outside = (not inside(cx, o['y0'] - 0.2) or not inside(cx, o['y1'] + 0.2)) if x else (not inside(o['x0'] - 0.2, cy) or not inside(o['x1'] + 0.2, cy))
        pub_in = [r for r in sides if r and r['apt'] is None and r['kind'] != 'shop'] or (in_hall(cx, cy - 0.3) or in_hall(cx, cy + 0.3))
        _apts = [r['apt'] for r in sides if r]
        _ent = o['kind'] == 'door' and any(a is None for a in _apts) and any(a is not None for a in _apts)
        OPLOG.append(dict(s=s, x=round(cx, 2), y=round(cy, 2), axis=o['axis'], kind=o['kind'], span=o['span'],
            a=[(r['id'], r['kind'], r['apt']) if r else None for r in sides],
            d='stair-open' if in_stair else 'passage' if passage
              else 'gate' if (s == 1 and outside and x and ((o['kind'] == 'open' and pub_in) or o['kind'] == 'door'))
              else 'pgate' if (s != 1 and to_balc and x and o['kind'] == 'door' and all(r is None or r['apt'] is None for r in sides))
              else 'glass-door' if ((s == 1 and o['kind'] == 'door' and outside) or to_balc or (outside and o['kind'] != 'lift'))
              else 'lift' if o['kind'] == 'lift' else 'casing-only' if (o['kind'] == 'door' and not _ent and all(a is None for a in _apts))
              else 'leaf-open' if (o['kind'] == 'door' and not _ent) else 'entrance' if _ent else 'opening-' + o['kind']))
        if in_stair or passage: continue                             # stair zone openings / flat passages stay open (no frame, glass, leaf)
        if s == 1 and outside and x and ((o['kind'] == 'open' and pub_in) or o['kind'] == 'door'):   # entrances, shop doors
            # building entrance (courtyard hall, stair exit): a casing plus glass leaves that open with E (BP_Blok1Door)
            u0, u1 = o['x0'], o['x1']; c = (o['y0'] + o['y1']) / 2; cw = 0.06
            for a_, b_ in ((u0, u0 + cw), (u1 - cw, u1)): pbox('Frames', 'M_Frame', a_, c - 0.05, b_, c + 0.05, Z + SLAB, Z + head)
            pbox('Frames', 'M_Frame', u0, c - 0.05, u1, c + 0.05, Z + head - cw, Z + head)
            inner = 1 if not inside(cx, o['y1'] + 0.2) else -1        # leaves swing outwards (escape direction)
            n = 2 if (u1 - u0) > 1.3 else 1; wl = (u1 - u0 - 2 * cw - 0.01) / n
            for k in range(n):
                left = k == 0
                hx = u0 + cw + 0.004 if left else u1 - cw - 0.004
                GATES.append(dict(axis='x', hinge=(round(hx, 3), round(c, 3)), width=round(wl - 0.004, 3), dir=1 if left else -1,
                                  z=round(Z + SLAB + 0.005, 3), height=round(head - cw - SLAB - 0.01, 3), swing=-inner))
            continue
        if s != 1 and to_balc and x and o['kind'] == 'door' and all(r is None or r['apt'] is None for r in sides):
            # public balcony (lift lobby <-> stair): glass leaves that open with E, swinging out onto the balcony
            u0, u1 = o['x0'], o['x1']; c = (o['y0'] + o['y1']) / 2; cw = 0.06
            for a_, b_ in ((u0, u0 + cw), (u1 - cw, u1)): pbox('Frames', 'M_Frame', a_, c - 0.05, b_, c + 0.05, Z + SLAB, Z + head)
            pbox('Frames', 'M_Frame', u0, c - 0.05, u1, c + 0.05, Z + head - cw, Z + head)
            balc_pos = 1 if balcony_at(cx, o['y1'] + 0.2) else -1
            n = 2 if (u1 - u0) > 1.3 else 1; wl = (u1 - u0 - 2 * cw - 0.01) / n
            for k in range(n):
                left = k == 0
                hx = u0 + cw + 0.004 if left else u1 - cw - 0.004
                PGATES.setdefault(CUR[0].rstrip('_'), []).append(dict(axis='x', hinge=(round(hx, 3), round(c, 3)), width=round(wl - 0.004, 3), dir=1 if left else -1,
                                  z=round(Z + SLAB + 0.005, 3), height=round(head - cw - SLAB - 0.01, 3), swing=-balc_pos))
            continue
        if s == 1 and o['kind'] == 'door' and outside:
            glazing(o, SLAB, head, 0.9, ext_side(o), 2.08, door=True)
        elif to_balc or (outside and o['kind'] != 'lift'):
            room = [k for k, r in enumerate(sides) if r and r['kind'] != 'balcony' and r['apt'] is not None]
            lf = 0 if (s == 1 or not to_balc or o['kind'] != 'door' or not room) else (1 if room[0] == 1 else -1)   # room on +u side?
            glazing(o, SLAB, head, 0.7 if o['span'] > 1.3 else 2, ext_side(o), door=True, leaf=lf)
        elif o['kind'] in ('door', 'lift'):
            # closed doors. Flat entrance (public corridor | flat): dark-brown steel door, peephole, black lever.
            # Interior (inside a flat): oak veneer leaf with oak casings and black levers on both sides. Lift: steel.
            apts = [r['apt'] for r in sides if r]
            entrance = o['kind'] == 'door' and any(a is None for a in apts) and any(a is not None for a in apts)
            interior = o['kind'] == 'door' and not entrance          # every other door stands open (flats, corridors, stair, hall)
            mat = 'M_Steel' if o['kind'] == 'lift' else 'M_DoorEntry' if entrance else 'M_DoorWood'
            u0, u1 = (o['x0'], o['x1']) if x else (o['y0'], o['y1'])
            t0, t1 = (o['y0'], o['y1']) if x else (o['x0'], o['x1']); c = (t0 + t1) / 2
            # doors inside a flat (casings, leaf, levers) go to their own part 'DoorsIn': Unreal hides it for the handover
            # state (owner 2026-11-19: no room doors in the flats); a finished-flat level can show it again
            pn_d = 'DoorsIn' if (interior and not all(a is None for a in apts)) else 'Frames'
            def b(a, bb, za, zb, d0, d1, m):
                if x: pbox(pn_d, m, a, d0, bb, d1, Z + za, Z + zb)
                else: pbox(pn_d, m, d0, a, d1, bb, Z + za, Z + zb)
            cas = 'M_Steel' if o['kind'] == 'lift' else 'M_DoorEntry' if entrance else 'M_DoorWood' if interior else 'M_FrameLight'
            cw = 0.07 if (entrance or interior) else 0.05
            b(u0, u0 + cw, SLAB, head, t0 - 0.012, t1 + 0.012, cas); b(u1 - cw, u1, SLAB, head, t0 - 0.012, t1 + 0.012, cas)
            b(u0, u1, head - cw, head, t0 - 0.012, t1 + 0.012, cas)
            if o['kind'] == 'lift':
                # landing door: one brushed-steel sliding panel on the lobby face, its own mesh per shaft (the lift
                # blueprint slides it into the wall when the cabin stops here)
                shaft = 'A' if cy < 13.0 else 'B'
                lx = t1 + 0.004
                # Centre-opening pair inside the wall thickness: LiftDoor<sh> slides to -y, LiftDoor<sh>R to +y, each by its
                # own width (walk.json door_y; the lift blueprint), and disappears into the wall (plain wall >= 1 m on both
                # sides of each doorway). The two shafts use different depths so their leaves pass in the wall between them.
                um = (u0 + u1) / 2
                d0 = t0 + (0.10 if shaft == 'A' else 0.135); d1 = d0 + 0.03       # A 6 cm, B 2.5-4.5 cm behind the lobby face
                part('LiftDoor' + shaft); part('LiftDoor' + shaft + 'R')
                pbox('LiftDoor' + shaft, 'M_Steel', d0, u0 + 0.045, d1, um - 0.002, Z + SLAB + 0.005, Z + head - 0.045)
                pbox('LiftDoor' + shaft + 'R', 'M_Steel', d0, um + 0.002, d1, u1 - 0.045, Z + SLAB + 0.005, Z + head - 0.045)
                # brushed-steel portal on the lobby face around the casing
                b(u0 - 0.09, u0, SLAB, head + 0.09, t1, t1 + 0.012, 'M_Steel'); b(u1, u1 + 0.09, SLAB, head + 0.09, t1, t1 + 0.012, 'M_Steel')
                b(u0, u1, head, head + 0.09, t1, t1 + 0.012, 'M_Steel')
                # call button right of the portal (seen from the lobby): steel plate + push button (own part per shaft:
                # tagged LiftA/LiftB in Unreal, E calls the lift; the lift blueprint lights it until the cabin arrives)
                by, bz = u1 + 0.09 + 0.14, SLAB + 1.05
                part('LiftPlate' + shaft); part('LiftBtn' + shaft)
                pbox('LiftPlate' + shaft, 'M_Steel', t1, by - 0.045, t1 + 0.012, by + 0.045, Z + bz - 0.09, Z + bz + 0.09)
                pbox('LiftBtn' + shaft, 'M_LiftBtn', t1 + 0.012, by - 0.018, t1 + 0.022, by + 0.018, Z + bz - 0.018, Z + bz + 0.018)
                lx = d1
                if s == 3 or s == 1: LIFTS[shaft] = dict(door_y=(u0, u1), door_x=lx)
            elif interior and all(a is None for a in apts):
                pass                                   # public <-> public (lobby, corridor, stair): open doorway, casing only
            elif interior:
                # interior doors stand open 90 degrees into the room (light reaches the windowless hall, walkable)
                lt = 0.02
                k_in = 1 if (sides[1] and sides[1]['kind'] not in ('hall', 'corridor', None)) else 0
                sg = 1 if k_in == 1 else -1
                face = t1 if sg > 0 else t0
                hu = u0 + cw + 0.004; Lw = (u1 - cw - 0.004) - hu
                b(hu, hu + 2 * lt, SLAB + 0.008, head - cw - 0.004, *sorted((face + sg * 0.004, face + sg * (Lw + 0.004))), mat)
                hd = face + sg * (Lw - 0.09)                                           # lever near the free edge
                for side_ in (-1, 1):
                    fx = hu + lt + side_ * lt
                    e0, e1 = sorted((fx, fx + side_ * 0.06))
                    b(e0, e1, SLAB + 0.988, SLAB + 1.012, hd - 0.012, hd + 0.012, 'M_Handle')
                    g0, g1 = sorted((fx + side_ * 0.045, fx + side_ * 0.065))
                    b(g0, g1, SLAB + 0.989, SLAB + 1.011, *sorted((hd, hd - sg * 0.13)), 'M_Handle')
            elif entrance:
                # flat entrance: the leaf is a separate Unreal actor (opens with E); record hinge, width, swing
                flat_side = 1 if (sides[1] and sides[1]['apt'] is not None) else -1
                hx, hy = (u0 + cw + 0.004, c) if x else (c, u0 + cw + 0.004)
                DOORS.setdefault(CUR[0].rstrip('_'), []).append(dict(axis=o['axis'], hinge=(round(hx, 3), round(hy, 3)), width=round(u1 - u0 - 2 * cw - 0.008, 3),
                                                                   z=round(Z + SLAB + 0.008, 3), height=round(head - cw - 0.004 - SLAB - 0.008, 3), swing=flat_side))
            else:
                lt = 0.035 if entrance else 0.02                                      # half leaf thickness
                b(u0 + cw + 0.004, u1 - cw - 0.004, SLAB + 0.008, head - cw - 0.004, c - lt, c + lt, mat)
                if entrance:
                    hu = u1 - cw - 0.09                                               # lever on the latch side
                    hz = SLAB + 1.0
                    for sgn in (-1, 1):
                        f = c + sgn * lt                                              # leaf face
                        d0, d1 = sorted((f, f + sgn * 0.012))
                        b(hu - 0.025, hu + 0.025, hz - 0.05, hz + 0.05, d0, d1, 'M_Handle')                  # rosette
                        e0, e1 = sorted((f + sgn * 0.012, f + sgn * 0.06))
                        b(hu - 0.012, hu + 0.012, hz - 0.012, hz + 0.012, e0, e1, 'M_Handle')               # neck
                        g0, g1 = sorted((f + sgn * 0.045, f + sgn * 0.065))
                        b(hu - 0.13, hu + 0.012, hz - 0.011, hz + 0.011, g0, g1, 'M_Handle')                # lever
                    if entrance:                                                      # peephole + lock cylinder
                        mu = (u0 + u1) / 2
                        for sgn in (-1, 1):
                            f = c + sgn * lt; d0, d1 = sorted((f, f + sgn * 0.01))
                            b(mu - 0.012, mu + 0.012, SLAB + 1.56, SLAB + 1.584, d0, d1, 'M_Handle')
                            b(hu - 0.012, hu + 0.012, hz + 0.1, hz + 0.16, d0, d1, 'M_Handle')

    for g in p['glass']:
        t = 0.03
        r = dict(g);
        if g['axis'] == 'x': m = (g['y0'] + g['y1']) / 2; r['y0'], r['y1'] = m - t, m + t
        else: m = (g['x0'] + g['x1']) / 2; r['x0'], r['x1'] = m - t, m + t
        # kitchen | living glass partition: the middle pane is a glazed door (the kitchen has no other way in),
        # swinging into the living room
        span_ = (g['x1'] - g['x0']) if g['axis'] == 'x' else (g['y1'] - g['y0']); n_ = max(1, round(span_ / 0.85))
        if g['axis'] == 'x': ra, rb = room_at((g['x0'] + g['x1']) / 2, r['y0'] - 0.15), room_at((g['x0'] + g['x1']) / 2, r['y1'] + 0.15)
        else: ra, rb = room_at(r['x0'] - 0.15, (g['y0'] + g['y1']) / 2), room_at(r['x1'] + 0.15, (g['y0'] + g['y1']) / 2)
        sd = -1 if (ra and ra['kind'] == 'living') else 1
        glazing(r, SLAB, FLOOR_H - 0.02, 0.85, None, frame='M_Rail', door=True, dpane=(n_ // 2, SLAB + 2.1, sd))

    # slab (open over the stair flights of the storey below)
    sr = stair_room(p) or stair_room(PLAN['3'])
    well = None
    if s != 1 and sr:
        x0, y0, x1, y1 = bounds(sr['poly']); well = (x0, y0, x1, y1 - STAIR_LAND)
    _s3 = stair_room(PLAN['3'])                                      # the well cut in the slab ABOVE this storey
    sr3_well = (lambda b: (b[0], b[1], b[2], b[3] - STAIR_LAND))(bounds(_s3['poly'])) if _s3 else None
    holes = [h_ for h_ in p['footprint']['holes']]
    if well: holes = holes + [[(well[0], well[1]), (well[2], well[1]), (well[2], well[3]), (well[0], well[3])]]
    if s != 1:                                                       # lift shafts run through every slab above the ground
        holes = holes + [[(LIFT_X[0], y0_), (LIFT_X[1], y0_), (LIFT_X[1], y1_), (LIFT_X[0], y1_)] for y0_, y1_ in LIFT_Y]
    def slab_side(mu, mv, nu, nv):
        if not in_poly(mu - nu * 0.05, mv - nv * 0.05, p['footprint']) and not in_poly(mu + nu * 0.05, mv + nv * 0.05, p['footprint']): pass
        if in_poly(mu + nu * 0.05, mv + nv * 0.05, p['footprint']): return 'M_Concrete'     # well edge
        if s == 1: return 'M_Granite'
        if balcony_at(mu - nu * 0.15, mv - nv * 0.15): return 'M_SlabEdge'
        return 'M_BrickWall' if s == 2 else 'M_FacadeMint'     # storey-2 slab edge: the ground-floor brick runs up to the canopy
    # slab top = wall bottom (Z + SLAB): a lower top left a 4 mm open seam on the facade at every storey; the floor
    # finishes (Z + SLAB - 0.004 .. + 0.003, no bottom face) still cover it from above
    prism('Shell', p['footprint']['outer'], holes, Z, Z + SLAB, plan3, 'M_Concrete', 'M_Ceiling', slab_side)

    # room finishes
    if s == 1:
        pbox('Floors', 'M_FloorStone', HALL1['x0'], HALL1['y0'], HALL1['x1'], HALL1['y1'] - 0.1, Z + SLAB - 0.004, Z + SLAB + 0.003, bottom=None)
    for r in rooms:
        if r['kind'] == 'lift': continue
        if well and r is sr:
            x0, y0, x1, y1 = bounds(r['poly'])
            pbox('Floors', floor_mat(r), x0, well[3], x1, y1, Z + SLAB - 0.004, Z + SLAB + 0.003, bottom=None); continue
        floor_piece(r, lambda pn, m, r=r: prism(pn, r['poly']['outer'], r['poly']['holes'], Z + SLAB - 0.004, Z + SLAB + 0.003, plan3, m, None, None))

    # ceiling lights: a flush round-ish downlight in every room of a flat and in the public corridors; the light sources
    # themselves are Unreal point lights placed from tools/unreal/out/lights.json (storey-local, Blender axes, metres)
    for r in rooms:
        k = r['kind']
        if k in ('lift', 'balcony') or r['area'] < 1.2: continue
        if r['apt'] is None and not (k is None and r['area'] > 4) and k != 'shop': continue
        if well and r is sr: continue
        x0, y0, x1, y1 = bounds(r['poly'])
        in_shaft = LIFT_X[0] - 0.1 < (x0 + x1) / 2 < LIFT_X[1] + 0.1 and LIFT_Y[0][0] - 0.1 < (y0 + y1) / 2 < LIFT_Y[1][1] + 0.1
        if r['apt'] is None and k is None and in_shaft: continue       # storey 1 lift shafts are unlabelled rooms: keep them open
        if r['apt'] is None and k is None:
            # public corridor / lobby: grey ceiling, round lamps every ~3 m along the long axis (owner's reference)
            ring_c, holes_c, skip_lamp = r['poly']['outer'], r['poly']['holes'], (lambda px, py: False)
            if s == 1 and sr3_well and x0 > sr3_well[0] - 0.05 and x1 < sr3_well[2] + 0.05 and y0 < sr3_well[3] < y1:
                # storey 1: the corridor that holds the stair has no ceiling under the storey-2 stair well (it was a grey
                # plate across the flights at 2.99 m); the part under the top landing / entrance passage stays
                yc = sr3_well[3]
                ring_c, holes_c = [(x0, yc), (x1, yc), (x1, y1), (x0, y1)], []
                skip_lamp = lambda px, py: py < yc + 0.2
            prism('Shell', ring_c, holes_c, Z + FLOOR_H - 0.006, Z + FLOOR_H - 0.002, plan3, None, 'M_CeilPublic', None)
            lx, ly = x1 - x0, y1 - y0; L_ = max(lx, ly); n_ = max(1, round(L_ / 3.0)) if LAMPS else 0
            for i in range(n_):
                t = (i + 0.5) / n_
                px, py = (x0 + t * lx, (y0 + y1) / 2) if lx >= ly else ((x0 + x1) / 2, y0 + t * ly)
                if not in_poly(px, py, r['poly']) or skip_lamp(px, py):
                    continue
                ring = [(px + 0.16 * math.cos(a * math.pi / 12), py + 0.16 * math.sin(a * math.pi / 12)) for a in range(24)]
                prism('Frames', ring, [], Z + FLOOR_H - 0.07, Z + FLOOR_H - 0.006, plan3, None, 'M_LampPublic', 'M_LightRim')
                LIGHTS.setdefault(CUR[0].rstrip('_'), []).append((round(px, 3), round(-py, 3), round(Z + FLOOR_H - 0.12, 3), 'public', round(r['area'] / n_, 1)))
            continue
        pts = r['poly']['outer']
        cx_ = sum(q[0] for q in pts) / len(pts); cy_ = sum(q[1] for q in pts) / len(pts)
        if not in_poly(cx_, cy_, r['poly']): cx_, cy_ = (x0 + x1) / 2, (y0 + y1) / 2
        if not in_poly(cx_, cy_, r['poly']): continue
        if not LAMPS: continue
        if r['apt'] is not None:
            # flat rooms: a grid of small recessed spots (~1.4 m apart, 0.5 m off the walls) + 1-2 soft point lights
            lx, ly = x1 - x0, y1 - y0
            nx_, ny_ = max(1, round((lx - 1.0) / 1.4) + 1), max(1, round((ly - 1.0) / 1.4) + 1)
            for i in range(nx_):
                for j in range(ny_):
                    px = (x0 + x1) / 2 if nx_ == 1 else x0 + 0.5 + i * (lx - 1.0) / (nx_ - 1)
                    py = (y0 + y1) / 2 if ny_ == 1 else y0 + 0.5 + j * (ly - 1.0) / (ny_ - 1)
                    if not all(in_poly(px + dx, py + dy, r['poly']) for dx, dy in ((0.3, 0), (-0.3, 0), (0, 0.3), (0, -0.3))): continue
                    ring = [(px + 0.045 * math.cos(a * math.pi / 8), py + 0.045 * math.sin(a * math.pi / 8)) for a in range(16)]
                    prism('Frames', ring, [], Z + FLOOR_H - 0.008, Z + FLOOR_H - 0.001, plan3, None, 'M_Spot', 'M_LightRim')
            n_ = 2 if r['area'] > 12 else 1
            for i in range(n_):
                t = (i + 0.5) / n_
                px, py = (x0 + t * lx, cy_) if lx >= ly else (cx_, y0 + t * ly)
                if not in_poly(px, py, r['poly']): px, py = cx_, cy_
                LIGHTS.setdefault(CUR[0].rstrip('_'), []).append((round(px, 3), round(-py, 3), round(Z + FLOOR_H - 0.25, 3), k or 'flat', round(r['area'] / n_, 1)))
            continue
        pbox('Frames', 'M_LightRim', cx_ - 0.09, cy_ - 0.09, cx_ + 0.09, cy_ + 0.09, Z + FLOOR_H - 0.012, Z + FLOOR_H - 0.001, top=None)
        pbox('Frames', 'M_LightEmit', cx_ - 0.07, cy_ - 0.07, cx_ + 0.07, cy_ + 0.07, Z + FLOOR_H - 0.014, Z + FLOOR_H - 0.012, top=None)
        LIGHTS.setdefault(CUR[0].rstrip('_'), []).append((round(cx_, 3), round(-cy_, 3), round(Z + FLOOR_H - 0.05, 3), k or 'public', round(r['area'], 1)))

    # design overlay: bathroom wall tiles (full height, 8 mm proud of the plaster, doorways left open)
    def in_rect(px, py, rc, e=0.03):
        return rc['x0'] - e < px < rc['x1'] + e and rc['y0'] - e < py < rc['y1'] + e
    gaps = p['openings'] + p['windows']
    for r in rooms:
        if r['kind'] != 'bath' or r['apt'] is None: continue
        ring = r['poly']['outer']
        for i in range(len(ring)):
            (ax_, ay_), (bx_, by_) = ring[i], ring[(i + 1) % len(ring)]
            L = math.hypot(bx_ - ax_, by_ - ay_)
            if L < 0.05: continue
            tx, ty = (bx_ - ax_) / L, (by_ - ay_) / L
            nx, ny = -ty, tx                                                          # inward normal
            mx, my = (ax_ + bx_) / 2, (ay_ + by_) / 2
            if not in_poly(mx + nx * 0.05, my + ny * 0.05, r['poly']): nx, ny = -nx, -ny
            n = max(1, int(L / 0.05)); run = None; runs = []
            for k in range(n):
                s0, s1 = L * k / n, L * (k + 1) / n; sm = (s0 + s1) / 2
                px, py = ax_ + tx * sm - nx * 0.06, ay_ + ty * sm - ny * 0.06      # just behind the room edge
                if any(in_rect(px, py, g) for g in gaps):
                    if run: runs.append(run); run = None
                else:
                    run = [run[0], s1] if run else [s0, s1]
            if run: runs.append(run)
            for s0, s1 in runs:
                o_ = 0.008
                pa = (ax_ + tx * s0 + nx * o_, ay_ + ty * s0 + ny * o_); pb = (ax_ + tx * s1 + nx * o_, ay_ + ty * s1 + ny * o_)
                P_ = part('DecorD'); bi = len(P_.v)
                P_.v += [(pa[0], -pa[1], Z + SLAB + 0.003), (pb[0], -pb[1], Z + SLAB + 0.003), (pb[0], -pb[1], Z + FLOOR_H - 0.005), (pa[0], -pa[1], Z + FLOOR_H - 0.005)]
                A, B_, D = Vector(P_.v[bi]), Vector(P_.v[bi + 1]), Vector(P_.v[bi + 3])
                q = (bi, bi + 1, bi + 2, bi + 3)
                if (B_ - A).cross(D - A).dot(Vector((nx, -ny, 0))) < 0: q = q[::-1]
                P_.f.append(q); P_.m.append('M_TileWall')

    # handover fittings (both modes): panel radiators under the windows of the flats, a gas boiler in every kitchen
    for w in p['windows']:
        if s == 1: continue
        ext = ext_side(w)
        if not ext: continue
        ax_ = w['axis']; u0, u1 = (w['x0'], w['x1']) if ax_ == 'x' else (w['y0'], w['y1'])
        t0, t1 = (w['y0'], w['y1']) if ax_ == 'x' else (w['x0'], w['x1'])
        sgn = -(ext[1] if ax_ == 'x' else ext[0])                                     # into the room
        face = t1 if sgn > 0 else t0
        mu = (u0 + u1) / 2
        rin = room_at(*((mu, face + sgn * 0.3) if ax_ == 'x' else (face + sgn * 0.3, mu)))
        if not rin or rin['apt'] is None or rin['kind'] in ('bath', 'balcony'): continue
        d0, d1 = sorted((face + sgn * 0.035, face + sgn * 0.135))
        def rb(a, b_, za, zb, e0, e1, m):
            if ax_ == 'x': pbox('Frames', m, a, e0, b_, e1, Z + za, Z + zb)
            else: pbox('Frames', m, e0, a, e1, b_, Z + za, Z + zb)
        ru0, ru1 = u0 + 0.1, u1 - 0.1
        rb(ru0, ru1, SLAB + 0.12, SLAB + 0.62, d0, d1, 'M_Radiator')
        n = int((ru1 - ru0) / 0.05)                                                   # vertical profiling of the front panel
        fz = d1 if sgn > 0 else d0
        for k in range(1, n):
            uu = ru0 + (ru1 - ru0) * k / n; f0, f1 = sorted((fz, fz + sgn * 0.004))
            rb(uu - 0.008, uu + 0.008, SLAB + 0.14, SLAB + 0.6, f0, f1, 'M_Radiator')
        for uu in (ru0 + 0.12, ru1 - 0.12):                                           # wall brackets
            rb(uu - 0.015, uu + 0.015, SLAB + 0.5, SLAB + 0.56, *sorted((face, face + sgn * 0.04)), 'M_Steel')
        if rin['kind'] == 'kitchen' and not rin.get('_boiler'):
            x0k, y0k, x1k, y1k = bounds(rin['poly'])
            k0, k1 = (x0k, x1k) if ax_ == 'x' else (y0k, y1k)
            if u0 - k0 >= 0.55: bu0, bu1 = k0 + 0.06, k0 + 0.46
            elif k1 - u1 >= 0.55: bu0, bu1 = k1 - 0.46, k1 - 0.06
            else: continue
            rin['_boiler'] = True
            e0, e1 = sorted((face + sgn * 0.01, face + sgn * 0.31))
            rb(bu0, bu1, SLAB + 1.45, SLAB + 2.17, e0, e1, 'M_Boiler')                       # casing
            f0, f1 = sorted((face + sgn * 0.31, face + sgn * 0.315))
            rb(bu0 + 0.12, bu1 - 0.12, SLAB + 1.52, SLAB + 1.62, f0, f1, 'M_Handle')            # display panel
            for kk in range(4):                                                             # pipes down to the floor box
                uu = bu0 + 0.08 + kk * 0.08; p0, p1 = sorted((face + sgn * 0.08, face + sgn * 0.1))
                rb(uu - 0.01, uu + 0.01, SLAB + 1.2, SLAB + 1.45, p0, p1, 'M_Steel')
            rb((bu0 + bu1) / 2 - 0.05, (bu0 + bu1) / 2 + 0.05, SLAB + 2.17, SLAB + 2.6, *sorted((face + sgn * 0.1, face + sgn * 0.2)), 'M_Radiator')   # flue

    # railings: every baluster is geometry
    for rl in p['rails']:
        z0, top = Z + SLAB, Z + SLAB + 1.1
        hz = rl['axis'] == 'h'
        def rb(lo, hi, hw, za, zb, m='M_Rail'):
            if hz: pbox('Frames', m, lo, rl['off'] - hw, hi, rl['off'] + hw, za, zb)
            else: pbox('Frames', m, rl['off'] - hw, lo, rl['off'] + hw, hi, za, zb)
        rb(rl['lo'], rl['hi'], 0.03, top - 0.05, top)
        rb(rl['lo'], rl['hi'], 0.02, z0 + 0.08, z0 + 0.12)
        L = rl['hi'] - rl['lo']; n = max(2, round(L / 0.11))
        for i in range(n + 1):
            u = rl['lo'] + L * i / n
            if i == 0 or i == n or i % 11 == 0: rb(u - 0.025, u + 0.025, 0.025, z0, top - 0.05)
            else: rb(u - 0.01, u + 0.01, 0.01, z0 + 0.12, top - 0.05)        # 20 mm balusters

    # switchback stair
    sr = stair_room(p) or stair_room(PLAN['3'])
    if sr:
        x0, y0, x1, y1 = bounds(sr['poly'])
        gap = 0.12; w = (x1 - x0 - gap) / 2; yF = y1 - STAIR_LAND; yM = y0 + STAIR_LAND
        steps = 9; rise = FLOOR_H / 2 / steps; run = (yF - yM) / (steps - 1); z00 = Z + SLAB
        for i in range(steps - 1):
            zt = z00 + rise * (i + 1); ya = yF - run * i; yb = ya - run
            pbox('Shell', 'M_Stair', x0 + w + gap, yb, x1, ya, zt - 0.22, zt)
            pbox('Frames', 'M_SillIn', x0 + w + gap, ya - 0.03, x1, ya + 0.0, zt - 0.02, zt + 0.004)       # nosing
        pbox('Shell', 'M_Stair', x0, y0, x1, yM, z00 + FLOOR_H / 2 - 0.22, z00 + FLOOR_H / 2)
        for i in range(steps - 1):
            zt = z00 + FLOOR_H / 2 + rise * (i + 1); ya = yM + run * i; yb = ya + run
            pbox('Shell', 'M_Stair', x0, ya, x0 + w, yb, zt - 0.22, zt)
        # handrails on the inner edge of both flights: sloped round-ish bar 0.9 m above the nosings, thin posts
        xr = x0 + w + gap / 2
        for (ya_, za_), (yb_, zb_) in (((yF, z00), (yM, z00 + FLOOR_H / 2)), ((yM, z00 + FLOOR_H / 2), (yF, z00 + FLOOR_H))):
            A_ = Vector((xr, -ya_, za_ + 0.9)); B_ = Vector((xr, -yb_, zb_ + 0.9)); d_ = B_ - A_
            obox('Frames', 'M_Rail', A_ - Vector((0.02, 0, 0.02)), d_, Vector((0.04, 0, 0)), Vector((0, 0, 0.04)))
            for k in range(0, 9, 2):
                t_ = k / 8; yy = ya_ + (yb_ - ya_) * t_; zz = za_ + (zb_ - za_) * t_
                pbox('Frames', 'M_Rail', xr - 0.012, yy - 0.012, xr + 0.012, yy + 0.012, zz - 0.02, zz + 0.9)

# ------------------------------------------------------------------ furniture (design mode) from furn_t4.json
# Each item: type, plan box, 'back' = the wall it stands against. Local frame: u along the back wall (0..W),
# v away from it (0..D), h up from the finished floor. Style from the brochure's interior renders.
FURN = json.load(open(os.path.join(ROOT, 'src/block/data/furn_t4.json'), encoding='utf-8'))
def furnish(items, Z):
    pn = 'FurnD'; F0 = Z + SLAB + 0.003
    for it in items:
        b = it['back']; x0, y0, x1, y1 = it['x0'], it['y0'], it['x1'], it['y1']
        W = (x1 - x0) if b in 'ns' else (y1 - y0); D = (y1 - y0) if b in 'ns' else (x1 - x0)
        def P(u, v):
            if b == 'n': return (x0 + u, y0 + v)
            if b == 's': return (x1 - u, y1 - v)
            if b == 'w': return (x0 + v, y1 - u)
            return (x1 - v, y0 + u)
        def bx(m, u0, v0, h0, u1, v1, h1):
            (ax, ay), (bx_, by) = P(u0, v0), P(u1, v1)
            pbox(pn, m, min(ax, bx_), min(ay, by), max(ax, bx_), max(ay, by), F0 + h0, F0 + h1)
        def cyl(m, uc, vc, r, h0, h1, n=20):
            ring = [P(uc + r * math.cos(2 * math.pi * k / n), vc + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
            prism(pn, ring, [], F0 + h0, F0 + h1, plan3, m, m, m)
        t = it['t']
        cxp, cyp = (x0 + x1) / 2, (y0 + y1) / 2
        yaw = {'n': 0.0, 's': 180.0, 'w': -90.0, 'e': 90.0}[b]
        def kit(model, su=1.0, sv=1.0, sh=1.0, du=0.0, dv=0.0, dyaw=0.0):
            ox, oy = P(W / 2 + du, D / 2 + dv)
            KIT.setdefault(CUR[0].rstrip('_'), []).append(dict(m=model, x=round(ox, 3), y=round(oy, 3), z=round(F0 - Z, 3), yaw=yaw + dyaw, s=[round(su, 3), round(sv, 3), round(sh, 3)]))
        clamp = lambda v, a_, b_: max(a_, min(b_, v))
        if t == 'chair': kit('dining_chair_02'); continue
        if t == 'armchair': kit('modern_arm_chair_01', clamp(W / 0.82, 0.8, 1.0), clamp(D / 0.99, 0.75, 1.0)); continue
        if t == 'pouf': kit('Ottoman_01', clamp(W / 0.88, 0.5, 1.0), clamp(D / 0.62, 0.6, 1.0), 0.75); continue
        if t == 'coffee':
            kit('coffee_table_round_01', clamp(min(W, D) / 1.3, 0.55, 0.8), clamp(min(W, D) / 1.3, 0.55, 0.8), 0.9)
            cyl('M_Rug', W / 2, D / 2, min(W, D) / 2 + 0.6, -0.002, 0.008, 32); continue
        if t == 'nightstand':
            kit('side_table_01', clamp(W / 0.55, 0.55, 1.0), clamp(D / 0.45, 0.6, 1.0))
            KIT[CUR[0].rstrip('_')].append(dict(m='ceramic_vase_03', x=KIT[CUR[0].rstrip('_')][-1]['x'], y=KIT[CUR[0].rstrip('_')][-1]['y'], z=round(F0 - Z + 0.55, 3), yaw=yaw, s=[0.8, 0.8, 0.8])); continue
        if t == 'sofa':
            kit('sofa_02', clamp(W / 1.81, 0.8, 1.15), clamp(D / 0.82, 0.85, 1.1))
            kit('potted_plant_02', 1, 1, 1, du=W / 2 + 0.35, dv=0.35); continue
        if t == 'tv':
            kit('modern_wooden_cabinet', clamp(W / 2.44, 0.4, 1.0), clamp(D / 0.52, 0.7, 1.0), 0.8, dv=-(D / 2) + 0.27)
            tw = min(W - 0.05, 1.45); tu = (W - tw) / 2
            bx('M_Black', tu, 0.0, 1.0, tu + tw, 0.04, 1.0 + tw * 0.5625)
            bx('M_TVScreen', tu + 0.01, 0.04, 1.01, tu + tw - 0.01, 0.042, 1.0 + tw * 0.5625 - 0.01); continue
        if t == 'bed':
            hb = 0.12
            bx('M_FurnHead', 0, 0, 0, W, hb, 1.15)                                     # upholstered headboard
            for k in range(5): bx('M_FurnHead', 0.05 + k * (W - 0.1) / 5 + 0.01, hb, 0.25, 0.05 + (k + 1) * (W - 0.1) / 5 - 0.01, hb + 0.02, 1.1)
            bx('M_WoodDark', 0.02, hb, 0, W - 0.02, D, 0.3)                            # base
            bx('M_FurnLinen', 0.04, hb, 0.3, W - 0.04, D - 0.02, 0.52)                 # mattress
            bx('M_FurnDuvet', 0.02, hb + 0.55, 0.5, W - 0.02, D, 0.58)                 # duvet
            bx('M_FurnThrow', 0.0, D - 0.55, 0.56, W, D - 0.15, 0.6)                   # throw across the foot
            for k, (pu, pw) in enumerate(((0.12, W / 2 - 0.16), (W / 2 + 0.04, W - 0.12))):
                bx('M_FurnLinen', pu, hb + 0.04, 0.52, pw, hb + 0.2, 0.8)              # pillows
        elif t == 'nightstand':
            bx('M_CabWhite', 0, 0, 0.12, W, D, 0.55); bx('M_Black', 0.02, 0.02, 0, W - 0.02, D - 0.02, 0.12)
            bx('M_Black', W * 0.3, D - 0.01, 0.4, W * 0.7, D + 0.005, 0.41)
            cyl('M_Ceramic', W / 2, D / 2, 0.06, 0.55, 0.85); cyl('M_LampShade', W / 2, D / 2, 0.13, 0.85, 1.05)
        elif t == 'wardrobe':
            H = 2.4
            bx('M_CabWhite', 0, 0, 0, W, D, H)
            n = max(2, round(W / 0.55))
            for k in range(1, n): bx('M_Black', k * W / n - 0.002, D, 0.05, k * W / n + 0.002, D + 0.004, H - 0.02)   # door joints
            for k in range(n):
                hu = (k + (0.88 if k % 2 == 0 else 0.12)) * W / n
                bx('M_Black', hu - 0.008, D, 0.7, hu + 0.008, D + 0.025, 1.6)                                          # long handles
        elif t == 'tv':
            bx('M_WoodOak', 0, 0, 0.15, W, min(D, 0.42), 0.55)                         # console
            bx('M_Black', 0.05, 0.05, 0, W - 0.05, 0.37, 0.15)
            tw = min(W - 0.05, 1.45); tu = (W - tw) / 2
            bx('M_Black', tu, 0.0, 1.0, tu + tw, 0.04, 1.0 + tw * 0.5625)              # wall TV
            bx('M_TVScreen', tu + 0.01, 0.04, 1.01, tu + tw - 0.01, 0.042, 1.0 + tw * 0.5625 - 0.01)
        elif t == 'table':
            bx('M_WoodDark', 0, 0, 0.72, W, D, 0.76)
            for (lu, lv) in ((0.06, 0.06), (W - 0.1, 0.06), (0.06, D - 0.1), (W - 0.1, D - 0.1)): bx('M_Black', lu, lv, 0, lu + 0.04, lv + 0.04, 0.72)
            KIT.setdefault(CUR[0].rstrip('_'), []).append(dict(m='ceramic_vase_01', x=round((x0 + x1) / 2, 3), y=round((y0 + y1) / 2, 3), z=round(F0 - Z + 0.76, 3), yaw=0.0, s=[1, 1, 1]))
        elif t == 'chair':
            for (lu, lv) in ((0.04, 0.04), (W - 0.07, 0.04), (0.04, D - 0.07), (W - 0.07, D - 0.07)): bx('M_Black', lu, lv, 0, lu + 0.03, lv + 0.03, 0.44)
            bx('M_Leather', 0.02, 0.02, 0.44, W - 0.02, D - 0.02, 0.5)
            bx('M_Leather', 0.02, 0.0, 0.5, W - 0.02, 0.06, 0.9)
        elif t in ('sofa', 'armchair'):
            arm = 0.14 if t == 'sofa' else 0.12
            bx('M_FurnFabric', 0, 0, 0.08, W, D, 0.42)
            bx('M_FurnFabric', 0, 0, 0.42, W, 0.2, 0.82)                                # back
            bx('M_FurnFabric', 0, 0, 0.42, arm, D, 0.62); bx('M_FurnFabric', W - arm, 0, 0.42, W, D, 0.62)
            n = 3 if (t == 'sofa' and W > 1.6) else (2 if t == 'sofa' else 1)
            for k in range(n):                                                          # seat and back cushions
                a = arm + k * (W - 2 * arm) / n + 0.01; c = arm + (k + 1) * (W - 2 * arm) / n - 0.01
                bx('M_FurnFabric', a, 0.2, 0.42, c, D - 0.02, 0.52); bx('M_FurnFabric', a, 0.12, 0.52, c, 0.3, 0.86)
            if t == 'sofa': bx('M_FurnThrow', W * 0.55, 0.15, 0.52, W * 0.75, 0.3, 0.75)
            for (lu, lv) in ((0.05, 0.05), (W - 0.09, 0.05), (0.05, D - 0.09), (W - 0.09, D - 0.09)): bx('M_Black', lu, lv, 0, lu + 0.04, lv + 0.04, 0.08)
        elif t == 'coffee':
            r = min(W, D) / 2 - 0.02
            cyl('M_Black', W / 2, D / 2, 0.06, 0, 0.36); cyl('M_Marble', W / 2, D / 2, r, 0.36, 0.4, 28)
            cyl('M_Rug', W / 2, D / 2, r + 0.75, -0.002, 0.008, 32)
        elif t == 'pouf':
            cyl('M_FurnThrow', W / 2, D / 2, min(W, D) / 2 - 0.02, 0, 0.42)
        elif t == 'counter':
            bx('M_Black', 0.05, 0, 0, W, D - 0.05, 0.1)                                # kick
            bx('M_CabWhite', 0, 0, 0.1, W, D, 0.87)
            bx('M_Marble', 0, 0, 0.87, W, D + 0.02, 0.9)                                # stone top
            n = max(1, round(W / 0.6))
            for k in range(1, n): bx('M_Black', k * W / n - 0.002, D, 0.12, k * W / n + 0.002, D + 0.004, 0.85)
            bx('M_Black', 0.02, D, 0.8, W - 0.02, D + 0.012, 0.81)                    # handle rail
            if W > 1.2:
                bx('M_CabWhite', 0, 0, 1.5, W, 0.35, 2.25)                              # upper cabinets
                bx('M_LightEmit', 0.02, 0.33, 1.49, W - 0.02, 0.35, 1.5)                # under-cabinet light
                su = W * 0.6
                bx('M_Black', su, 0.12, 0.84, su + 0.55, 0.5, 0.9)                     # sink
                cyl('M_Chrome', su + 0.27, 0.07, 0.015, 0.9, 1.22); bx('M_Chrome', su + 0.26, 0.06, 1.18, su + 0.29, 0.25, 1.21)
        elif t == 'burner':
            bx('M_TVScreen', -0.15, 0.05, 0.9, W + 0.2, D + 0.3, 0.905)                 # glass hob
        elif t == 'tub':
            bx('M_Ceramic', 0, 0, 0, W, D, 0.55)
            bx('M_Water', 0.08, 0.08, 0.4, W - 0.08, D - 0.08, 0.551)
            cyl('M_Chrome', W - 0.25, 0.04, 0.02, 0.55, 0.75)
            bx('M_Glass', 0, D - 0.01, 0.55, 0.8, D, 2.0)                              # glass screen
            bx('M_Chrome', 0, D - 0.015, 0.55, 0.02, D + 0.005, 2.0)
        elif t == 'toilet':
            bx('M_Ceramic', W * 0.1, 0, 0.0, W * 0.9, 0.06, 1.05)                       # cistern panel
            bx('M_Ceramic', W * 0.12, 0, 0.3, W * 0.88, D, 0.42)                         # wall-hung bowl
            bx('M_Ceramic', W * 0.14, 0.02, 0.42, W * 0.86, D - 0.02, 0.44)
            bx('M_Chrome', W * 0.4, 0.06, 0.95, W * 0.6, 0.07, 1.02)
        elif t == 'basin':
            bx('M_WoodOak', 0, 0, 0.45, W, D, 0.82)                                       # vanity
            bx('M_Marble', 0, 0, 0.82, W, D, 0.85)
            cyl('M_Ceramic', W / 2, D / 2, min(W, D) / 2 - 0.05, 0.85, 0.97)
            cyl('M_Chrome', W / 2, 0.05, 0.012, 0.85, 1.1)
            bx('M_Mirror', W * 0.1, 0, 1.2, W * 0.9, 0.015, 1.9)
            bx('M_LightEmit', W * 0.1, 0.015, 1.9, W * 0.9, 0.03, 1.93)
        elif t == 'washer':
            bx('M_CabWhite', 0, 0, 0, W, D, 0.85)
            bx('M_Black', W / 2 - 0.16, D, 0.2, W / 2 + 0.16, D + 0.01, 0.52)            # door ring
            bx('M_Glass', W / 2 - 0.12, D + 0.01, 0.24, W / 2 + 0.12, D + 0.02, 0.48)
        else:
            continue

def furnish_ground(p):
    """Storey 1 (always shown): shop fit-out (wall shelving, counter with till, display tables, pendants) and the
    entrance hall (mailbox bank, bench, plant, mat)."""
    pn = 'Furn'; F0 = SLAB + 0.003
    for r in p['rooms']:
        if r['kind'] != 'shop': continue
        x0, y0, x1, y1 = bounds(r['poly']); x0 += 0.02; x1 -= 0.02; y0 += 0.2; y1 -= 0.02
        W = x1 - x0
        # wall shelving on both side walls, from 1.2 m behind the glazing to 0.8 m before the back wall
        for side, sx in ((-1, x0), (1, x1)):                                         # steel-frame shelving units along both side walls
            n_ = int((y1 - y0 - 2.0) / 2.4)
            for k in range(n_):
                KIT.setdefault('F1', []).append(dict(m='steel_frame_shelves_03', x=round(sx - side * 0.37, 3), y=round(y0 + 1.2 + 1.2 + k * 2.4, 3), z=round(F0, 3),
                                                   yaw=-90.0 if side < 0 else 90.0, s=[1, 1, 0.95]))
        KIT.setdefault('F1', []).append(dict(m='potted_plant_01', x=round(x0 + 0.5, 3), y=round(y0 + 0.6, 3), z=round(F0, 3), yaw=0.0, s=[1, 1, 1]))
        for sx in ():
            pbox(pn, 'M_WoodOak', sx, y0 + 1.2, sx + 0.4, y1 - 0.8, F0, F0 + 0.1)
            for k in range(5):
                h = 0.1 + k * 0.45
                pbox(pn, 'M_WoodOak', sx, y0 + 1.2, sx + 0.4, y1 - 0.8, F0 + h, F0 + h + 0.03)
            pbox(pn, 'M_Black', sx + (0.0 if sx == x0 else 0.38), y0 + 1.2, sx + (0.02 if sx == x0 else 0.4), y1 - 0.8, F0, F0 + 2.0)   # back panel on the wall side
            for k in range(1, 5):
                yy = y0 + 1.2 + k * (y1 - y0 - 2.0) / 5
                pbox(pn, 'M_Black', sx, yy - 0.015, sx + 0.4, yy + 0.015, F0, F0 + 2.0)
            for k in range(4):                                                      # goods: boxes in two tones
                for j in range(int((y1 - y0 - 2.1) / 0.32)):
                    yy = y0 + 1.25 + j * 0.32; h = 0.13 + k * 0.45
                    pbox(pn, 'M_FurnThrow' if (j + k) % 3 else 'M_CabWhite', sx + 0.05, yy, sx + 0.33, yy + 0.24, F0 + h, F0 + h + 0.22 - 0.06 * ((j + k) % 2))
        # counter with till at the back, facing the door
        cx0, cx1 = x0 + W * 0.3, x0 + W * 0.7; cy = y1 - 1.6
        pbox(pn, 'M_WoodDark', cx0, cy, cx1, cy + 0.6, F0, F0 + 1.0)
        pbox(pn, 'M_Marble', cx0 - 0.03, cy - 0.03, cx1 + 0.03, cy + 0.63, F0 + 1.0, F0 + 1.04)
        pbox(pn, 'M_TVScreen', (cx0 + cx1) / 2 - 0.2, cy + 0.2, (cx0 + cx1) / 2 + 0.2, cy + 0.24, F0 + 1.04, F0 + 1.34)
        pbox(pn, 'M_Black', (cx0 + cx1) / 2 - 0.02, cy + 0.24, (cx0 + cx1) / 2 + 0.02, cy + 0.3, F0 + 1.04, F0 + 1.2)
        # two display tables in the middle
        for k, ty in enumerate((y0 + 2.2, y0 + 3.9)):
            if ty + 0.9 > cy - 0.6: continue
            tx0, tx1 = x0 + W / 2 - 0.7, x0 + W / 2 + 0.7
            pbox(pn, 'M_WoodOak', tx0, ty, tx1, ty + 0.9, F0 + 0.72, F0 + 0.76)
            pbox(pn, 'M_Black', tx0 + 0.08, ty + 0.1, tx1 - 0.08, ty + 0.8, F0, F0 + 0.72)
            for j in range(4):
                pbox(pn, 'M_FurnThrow' if j % 2 else 'M_Leather', tx0 + 0.12 + j * 0.3, ty + 0.25, tx0 + 0.34 + j * 0.3, ty + 0.65, F0 + 0.76, F0 + 0.86 + 0.04 * (j % 2))
        # pendant lights over counter and tables
        for (lx, ly) in ((x0 + W * 0.4, cy + 0.3), (x0 + W * 0.6, cy + 0.3), (x0 + W / 2, y0 + 2.65), (x0 + W / 2, y0 + 4.35)):
            pbox(pn, 'M_Black', lx - 0.004, ly - 0.004, lx + 0.004, ly + 0.004, FLOOR_H - 0.9, FLOOR_H - 0.01)
            prism(pn, [(lx + 0.16 * math.cos(2 * math.pi * k / 16), ly + 0.16 * math.sin(2 * math.pi * k / 16)) for k in range(16)], [],
                  FLOOR_H - 1.05, FLOOR_H - 0.9, plan3, 'M_Black', 'M_LampShade', 'M_Black')
    # entrance hall: mailbox bank on the east wall, bench, plant, entrance mat
    hx1 = HALL1['x1'] - 0.02
    pbox(pn, 'M_Steel', hx1 - 0.3, 12.3, hx1, 14.3, F0 + 0.9, F0 + 2.0)
    for i in range(6):
        for j in range(4):
            yy = 12.35 + i * 0.32; zz = F0 + 0.95 + j * 0.26
            pbox(pn, 'M_Black', hx1 - 0.305, yy, hx1 - 0.3, yy + 0.29, zz, zz + 0.23)
            pbox(pn, 'M_Chrome', hx1 - 0.31, yy + 0.22, hx1 - 0.305, yy + 0.25, zz + 0.1, zz + 0.13)
    pbox(pn, 'M_WoodOak', hx1 - 0.42, 15.0, hx1, 16.4, F0 + 0.42, F0 + 0.46)
    pbox(pn, 'M_Black', hx1 - 0.38, 15.05, hx1 - 0.04, 16.35, F0, F0 + 0.42)
    prism(pn, [(hx1 - 0.25 + 0.2 * math.cos(2 * math.pi * k / 16), 16.9 + 0.2 * math.sin(2 * math.pi * k / 16)) for k in range(16)], [],
          F0, F0 + 0.5, plan3, 'M_Black', 'M_Black', 'M_Black')
    for k, (rr, z0_, z1_) in enumerate(((0.26, 0.55, 0.95), (0.32, 0.95, 1.3), (0.24, 1.3, 1.6), (0.12, 1.6, 1.75))):   # plant: leafy tiers
        prism(pn, [(hx1 - 0.25 + rr * math.cos(2 * math.pi * j / 12 + k), 16.9 + rr * math.sin(2 * math.pi * j / 12 + k)) for j in range(12)], [],
              F0 + z0_, F0 + z1_, plan3, 'M_Leaf', 'M_Leaf', 'M_Leaf')
    pbox(pn, 'M_WoodDark', hx1 - 0.27, 16.88, hx1 - 0.23, 16.92, F0 + 0.5, F0 + 0.6)
    pbox(pn, 'M_Rug', 15.2, 17.0, 16.5, 17.75, F0 - 0.001, F0 + 0.012)

LIGHTS = {}; DOORS = {}; LIFTS = {}; GATES = []; PGATES = {}; KIT = {}; PASSAGES = []; OPLOG = []; BALC = {}
LIFT_X = (12.51, 14.5); LIFT_Y = ((10.91, 12.9), (13.11, 16.1))      # shaft interiors (plan)
for key, pre in ((1, 'F1_'), (2, 'F2_'), (3, 'Typ_')):
    CUR[0] = pre; storey(key)
    if FURNITURE and key in (2, 3): furnish(FURN[str(key)], 0.0)
    if FURNITURE and key == 1: furnish_ground(PLAN['1'])
json.dump(LIGHTS, open(os.path.join(OUT, 'lights.json'), 'w'), indent=0)
print('LIGHTS', {k: len(v) for k, v in LIGHTS.items()})

# ---- kit: generic entrance door leaf (1 m wide, scaled per door in Unreal; hinge at the origin, leaf along +x),
# lift cabins (block coordinates, storey 1; the lift blueprint moves them by whole storeys)
CUR[0] = 'Kit_'
LH = 2.32; T_ = 0.035
pbox('DoorEntry', 'M_DoorEntry', 0, -T_, 1.0, T_, 0, LH)
for sg in (-1, 1):
    f = sg * T_
    d0, d1 = sorted((f, f + sg * 0.003))
    pbox('DoorEntry', 'M_WoodOak', 0.70, d0, 0.97, d1, 0.03, LH - 0.03)                 # oak strip (handle side)
    for i in range(15):                                                                   # grooves on the navy part
        gx = 0.07 + i * 0.04
        pbox('DoorEntry', 'M_DoorGroove', gx, d0, gx + 0.008, d1, 0.06, LH - 0.06)
    f = f + sg * 0.003
    def kb(a, b_, za, zb, d0, d1, m='M_Handle'):
        pbox('DoorEntry', m, a, min(d0, d1), b_, max(d0, d1), za, zb)
    hu = 0.9; hz = 0.99
    kb(hu - 0.025, hu + 0.025, hz - 0.05, hz + 0.05, f, f + sg * 0.012)
    kb(hu - 0.012, hu + 0.012, hz - 0.012, hz + 0.012, f + sg * 0.012, f + sg * 0.06)
    kb(hu - 0.13, hu + 0.012, hz - 0.011, hz + 0.011, f + sg * 0.045, f + sg * 0.065)
    kb(0.488, 0.512, 1.55, 1.574, f, f + sg * 0.01)
    kb(hu - 0.012, hu + 0.012, hz + 0.1, hz + 0.16, f, f + sg * 0.01)
for sh, (y0_, y1_) in zip('AB', LIFT_Y):
    n = 'LiftCab' + sh; x0_, x1_ = LIFT_X[0] + 0.05, LIFT_X[1] - 0.04
    yy0, yy1 = y0_ + 0.05, y1_ - 0.05
    dy0, dy1 = LIFTS[sh]['door_y']
    zf = SLAB; H_ = 2.3
    pbox(n, 'M_Granite', x0_, yy0, x1_, yy1, zf - 0.06, zf)                                   # floor
    pbox(n, 'M_Steel', x0_, yy0, x1_, yy1, zf + H_, zf + H_ + 0.05)                           # roof
    pbox(n, 'M_LightEmit', x0_ + 0.25, yy0 + 0.25, x1_ - 0.25, yy1 - 0.25, zf + H_ - 0.01, zf + H_, top=None)
    pbox(n, 'M_Steel', x0_, yy0, x0_ + 0.03, yy1, zf, zf + H_)                                # back wall
    pbox(n, 'M_Steel', x0_, yy0, x1_, yy0 + 0.03, zf, zf + H_)                                # side walls
    pbox(n, 'M_Steel', x0_, yy1 - 0.03, x1_, yy1, zf, zf + H_)
    pbox(n, 'M_Steel', x1_ - 0.03, yy0, x1_, dy0 + 0.04, zf, zf + H_)                         # front returns
    pbox(n, 'M_Steel', x1_ - 0.03, dy1 - 0.04, x1_, yy1, zf, zf + H_)
    pbox(n, 'M_Steel', x1_ - 0.03, dy0, x1_, dy1, zf + 2.25, zf + H_)                          # door head
    pbox(n, 'M_Sill', x0_ + 0.031, yy0 + 0.3, x0_ + 0.04, yy1 - 0.3, zf + 0.9, zf + 2.1)       # mirror (light stone frame)
    pbox(n, 'M_Glass', x0_ + 0.04, yy0 + 0.33, x0_ + 0.042, yy1 - 0.33, zf + 0.93, zf + 2.07)
    pbox(n, 'M_Handle', x0_ + 0.03, yy0 + 0.1, x0_ + 0.07, yy1 - 0.1, zf + 0.88, zf + 0.92)    # handrail
    LIFTS[sh].update(cab=(x0_, yy0, x1_, yy1))
# glass entrance leaf: 1 m x 1 m unit (scaled per gate), hinge at the origin, leaf along +x
G_ = 0.05
pbox('DoorGlass', 'M_Frame', 0, -0.025, G_, 0.025, 0, 1)
pbox('DoorGlass', 'M_Frame', 1 - G_, -0.025, 1, 0.025, 0, 1)
pbox('DoorGlass', 'M_Frame', 0, -0.025, 1, 0.025, 0, 0.05)
pbox('DoorGlass', 'M_Frame', 0, -0.025, 1, 0.025, 1 - 0.04, 1)
gquad('DoorGlass', 'M_Glass', 'x', G_, 1 - G_, 0, 0.05, 1 - 0.04)
for sg in (-1, 1):
    pbox('DoorGlass', 'M_Handle', 0.86, sg * 0.025 + (0 if sg > 0 else -0.04), 0.88, sg * 0.025 + (0.04 if sg > 0 else 0), 0.3, 0.6)
json.dump(dict(doors=DOORS, gates=GATES, pgates=PGATES, balc=BALC, lifts=LIFTS, lift_x=LIFT_X, lift_y=LIFT_Y), open(os.path.join(OUT, 'walk.json'), 'w'), indent=0)
print('DOORS', {k: len(v) for k, v in DOORS.items()}, 'LIFTS', LIFTS)
CUR[0] = 'Fac_'

# ------------------------------------------------------------------ facade of storeys 1-2 (port of facade.ts, more detail)
def arch_pts(cx, w, zs, zA, n=14):
    r = w * 0.82; half = w / 2; cL = cx + half - r; cR = cx - half + r
    a1 = math.acos((cx - cL) / r); pts = []
    for i in range(n + 1):
        a = a1 * i / n; pts.append((cL + r * math.cos(a), zs + (zA - zs) * (math.sin(a) / math.sin(a1))))
    for i in range(n - 1, -1, -1):
        a = a1 * i / n; pts.append((cR - r * math.cos(a), zs + (zA - zs) * (math.sin(a) / math.sin(a1))))
    return pts
def fpanel(pn, mat, ring, y0, y1, side=None):        # solid panel in the facade plane between plan y0..y1
    prism(pn, ring, [], y0, y1, fac3(0), mat, mat, side or mat)

cx = BLOCK_W / 2
P = dict(x0=cx - 3.1, x1=cx + 3.1, d=1.5, top=5.95)
# street canopy: steel box with a slim fascia lip and a soffit, split by the portal
for a, b in ((0, P['x0']), (P['x1'], BLOCK_W)):
    pbox('Shell', 'M_Canopy', a, -1.5, b, 0, 3.12, 3.62, bottom='M_Soffit')
    pbox('Shell', 'M_Canopy', a, -1.56, b, -1.46, 3.02, 3.72)
pbox('Shell', 'M_Canopy', 9.5, 17.8, 17.0, 19.9, 3.05, 3.35, bottom='M_Soffit')

# brick portal
PIER, OPEN_TOP = 0.95, 5.2; SCR = -P['d'] + 0.3
ox0, ox1 = P['x0'] + PIER, P['x1'] - PIER
BR_L, BR_H, J = 0.25, 0.065, 0.01; PRO, EMB = 0.008, 0.012
BRICKS = ['M_Brick1', 'M_Brick2', 'M_Brick3', 'M_Brick4']
def bricks(o, ua, n, W, Hh, phase=0):
    """Running-bond bricks on a face: o corner (3D), ua unit along, n outward normal, W x Hh metres."""
    o, ua, n = Vector(o), Vector(ua), Vector(n); va = Vector((0, 0, 1))
    k = 0; z = 0.0
    while z < Hh - 0.02:
        h = min(BR_H, Hh - z - 0.002)
        u = -((k + phase) % 2) * (BR_L + J) / 2
        while u < W:
            a, b = max(u, -PRO), min(u + BR_L, W + PRO)
            if b - a > 0.04:
                obox('Brick', random.choice(BRICKS), o + ua * a + va * (z + J / 2) - n * EMB, ua * (b - a), va * h, n * (EMB + PRO))
            u += BR_L + J
        z += BR_H + J; k += 1
# Blender directions: plan +x = +X, plan -y (street) = +Y
X, Yst, Zv = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
pz0 = 0.5
for (a, b) in ((P['x0'], ox0), (ox1, P['x1'])):
    pbox('Shell', 'M_Mortar', a + 0.004, -P['d'] + 0.004, b - 0.004, 0, pz0, OPEN_TOP)        # core under the bricks
    pbox('Shell', 'M_Granite', a - 0.03, -P['d'] - 0.03, b + 0.03, 0, 0, pz0)
    pbox('Shell', 'M_Granite', a - 0.045, -P['d'] - 0.045, b + 0.045, 0, pz0 - 0.03, pz0)     # plinth cap
    bricks((a, P['d'], pz0), X, Yst, b - a, OPEN_TOP - pz0)                                     # street face
    bricks((a, 0, pz0), Yst, -X, P['d'], OPEN_TOP - pz0, 1)                                      # west face
    bricks((b, P['d'], pz0), -Yst, X, P['d'], OPEN_TOP - pz0, 1)                                 # east face
pbox('Shell', 'M_Mortar', P['x0'] + 0.004, -P['d'] + 0.004, P['x1'] - 0.004, 0, OPEN_TOP, P['top'], bottom='M_BrickWall')
bricks((P['x0'], P['d'], OPEN_TOP), X, Yst, P['x1'] - P['x0'], P['top'] - OPEN_TOP)
bricks((P['x0'], 0, OPEN_TOP), Yst, -X, P['d'], P['top'] - OPEN_TOP, 1)
bricks((P['x1'], P['d'], OPEN_TOP), -Yst, X, P['d'], P['top'] - OPEN_TOP, 1)
pbox('Shell', 'M_Canopy', P['x0'] - 0.05, -P['d'] - 0.05, P['x1'] + 0.05, 0, P['top'], P['top'] + 0.1)   # coping
pbox('Shell', 'M_Canopy', P['x0'] - 0.07, -P['d'] - 0.07, P['x1'] + 0.07, 0, P['top'] + 0.1, P['top'] + 0.13)

# girih screen with the stilted pointed arch cut out, as real bars (khatam stars joined by straight bars)
SH, STILT, APEX = 2.45, 3.3, 4.3; hw = (ox1 - ox0) / 2 - 0.24
curve = arch_pts(cx, hw * 2, STILT, APEX, 20)[::-1]
screen = [(ox1, SH), (ox1, OPEN_TOP), (ox0, OPEN_TOP), (ox0, SH), (cx - hw, SH)] + curve + [(cx + hw, SH)]
def clip_seg(p0, p1, poly):
    """Parts of segment p0-p1 inside polygon (even-odd), as (t0, t1) pairs."""
    ts = [0.0, 1.0]; dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        ex, ey = b[0] - a[0], b[1] - a[1]; den = dx * ey - dy * ex
        if abs(den) < 1e-12: continue
        t = ((a[0] - p0[0]) * ey - (a[1] - p0[1]) * ex) / den; s_ = ((a[0] - p0[0]) * dy - (a[1] - p0[1]) * dx) / den
        if 0 < t < 1 and 0 <= s_ <= 1: ts.append(t)
    ts.sort(); out = []
    for t0, t1 in zip(ts, ts[1:]):
        m = (t0 + t1) / 2
        if t1 - t0 > 1e-4 and in_ring(p0[0] + dx * m, p0[1] + dy * m, poly): out.append((t0, t1))
    return out
def fbar(pn, mat, p0, p1, wd, y0, y1):                 # bar in the facade plane from (x, z) p0 to p1
    d = Vector((p1[0] - p0[0], 0, p1[1] - p0[1])); L = d.length
    if L < 1e-4: return
    d /= L; perp = Vector((-d.z, 0, d.x))
    o = Vector((p0[0], -y1, p0[1])) - perp * wd / 2 - d * wd / 2
    obox(pn, mat, o, d * (L + wd), perp * wd, Vector((0, y1 - y0, 0)))
def girih(pn, mat, poly, A, wd, y0, y1, ox, oz, frame=0.045):
    """Khatam stars joined by straight bars on a grid of pitch A (origin ox, oz), clipped to poly (x, z), plus a frame."""
    Lh = A * 0.3; R = Lh * math.sqrt(2); segs = []
    xs = [p[0] for p in poly]; zs = [p[1] for p in poly]
    for i in range(int((min(xs) - ox) / A) - 2, int((max(xs) - ox) / A) + 2):
        for j in range(int((min(zs) - oz) / A) - 2, int((max(zs) - oz) / A) + 2):
            c0 = (ox + i * A, oz + j * A)
            sq = [(c0[0] + Lh, c0[1] + Lh), (c0[0] - Lh, c0[1] + Lh), (c0[0] - Lh, c0[1] - Lh), (c0[0] + Lh, c0[1] - Lh)]
            dm = [(c0[0] + R, c0[1]), (c0[0], c0[1] + R), (c0[0] - R, c0[1]), (c0[0], c0[1] - R)]
            for k in range(4): segs.append((sq[k], sq[(k + 1) % 4])); segs.append((dm[k], dm[(k + 1) % 4]))
            segs.append(((c0[0] + R, c0[1]), (c0[0] + A - R, c0[1])))       # to the east neighbour
            segs.append(((c0[0], c0[1] + R), (c0[0], c0[1] + A - R)))       # to the north neighbour
    for p0, p1 in segs:
        for t0, t1 in clip_seg(p0, p1, poly):
            a = (p0[0] + (p1[0] - p0[0]) * t0, p0[1] + (p1[1] - p0[1]) * t0); b = (p0[0] + (p1[0] - p0[0]) * t1, p0[1] + (p1[1] - p0[1]) * t1)
            fbar(pn, mat, a, b, wd, y0, y1)
    if frame:
        for k in range(len(poly)):
            fbar(pn, mat, poly[k], poly[(k + 1) % len(poly)], frame, y0 - 0.005, y1 + 0.005)
girih('Lattice', 'M_Gold', screen, 0.36, 0.018, SCR - 0.035, SCR, cx, SH + 0.12)
# glazing behind the screen
MB_ = 0.78                                                     # door bay between the mullions (cx +- MB)
gquad('Glass', 'M_Glass', 'x', ox0, cx - MB_, SCR + 0.06, 0.02, OPEN_TOP)
gquad('Glass', 'M_Glass', 'x', cx + MB_, ox1, SCR + 0.06, 0.02, OPEN_TOP)
gquad('Glass', 'M_Glass', 'x', cx - MB_, cx + MB_, SCR + 0.06, 2.12, OPEN_TOP)
# white archivolt: shoulders, stilts and the arch band, 6 cm proud
T = 0.09; wy0, wy1 = SCR - 0.06, SCR + 0.02
pbox('Shell', 'M_WhiteBand', ox0, wy0, cx - hw, wy1, SH - T, SH)
pbox('Shell', 'M_WhiteBand', cx + hw, wy0, ox1, wy1, SH - T, SH)
pbox('Shell', 'M_WhiteBand', cx - hw - T, wy0, cx - hw, wy1, SH - T, STILT)
pbox('Shell', 'M_WhiteBand', cx + hw, wy0, cx + hw + T, wy1, SH - T, STILT)
outer = arch_pts(cx, hw * 2 + 2 * T, STILT, APEX + T * 1.3, 20)
fpanel('Shell', 'M_WhiteBand', outer + [(cx - hw, STILT)] + curve[1:-1] + [(cx + hw, STILT)], wy0, wy1)
# glazing bars and the entrance door pair
def archZ(x):
    for i in range(len(curve) - 1):
        (x0, z0), (x1, z1) = curve[i], curve[i + 1]
        if (x - x0) * (x - x1) <= 0 and x0 != x1: return z0 + (z1 - z0) * (x - x0) / (x1 - x0)
    return STILT
gy0, gy1 = SCR + 0.03, SCR + 0.1; MB = 0.78
for u in (-MB, MB): pbox('Frames', 'M_Frame', cx + u - 0.04, gy0, cx + u + 0.04, gy1, 0.02, archZ(cx + u) - 0.02)
for x in (ox0, ox1 - 0.07): pbox('Frames', 'M_Frame', x, gy0, x + 0.07, gy1, 0.02, OPEN_TOP)
pbox('Frames', 'M_Frame', ox0, gy0, ox1, gy1, SH - T - 0.07, SH - T)
pbox('Frames', 'M_Frame', ox0, gy0, ox1, gy1, 0.02, 0.1)
pbox('Frames', 'M_Frame', cx - MB, gy0, cx + MB, gy1, 2.05, 2.12)
# portal door pair: glass leaves that open with E, swinging out to the street (BP_Blok1Door via walk.json gates)
for hx_, dir_ in ((cx - MB + 0.04, 1), (cx + MB - 0.04, -1)):
    GATES.append(dict(axis='x', hinge=(round(hx_, 3), round(SCR + 0.065, 3)), width=round(MB - 0.045, 3), dir=dir_, z=0.03, height=2.02, swing=1))
pbox('Shell', 'M_Granite', ox0, -P['d'], ox1, 0, 0, 0.03, top='M_FloorStone')

# shop fronts: granite plinths between bays, 3D gold lettering over the glazing
street = PLAN['1']
spans = sorted((r['x0'], r['x1']) for r in street['windows'] + street['openings'] if r['axis'] == 'x' and r['y0'] < 0.4)
bays = []
for a, b in spans:
    if bays and a - bays[-1][1] < 0.25: bays[-1][1] = max(bays[-1][1], b)
    else: bays.append([a, b])
px = 0
for a, b in bays + [[BLOCK_W, BLOCK_W]]:
    if a - px > 0.3 and not (px > P['x0'] and a < P['x1']):
        pbox('Shell', 'M_Granite', px - (0.03 if px == 0 else 0), -0.04, a + (0.03 if a == BLOCK_W else 0), 0, 0, 0.5)
    px = b
SIGNS = ['BOUTIQUE', 'ARTISAN GOODS', 'PREMIUM DELI', 'COFFEE HOUSE']
sign_objs = []
si = 0
for a, b in bays:
    if b > P['x0'] - 0.2 and a < P['x1'] + 0.2: continue
    txt = SIGNS[si % len(SIGNS)]; si += 1
    cu = bpy.data.curves.new('sign', 'FONT'); cu.body = txt; cu.align_x = 'CENTER'; cu.size = 0.5; cu.extrude = 0.012
    cu.bevel_depth = 0.002; cu.space_character = 1.08
    ob = bpy.data.objects.new('Sign', cu); bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    wmax = b - a - 0.5; wid = ob.dimensions.x
    sc = min(1.0, wmax / wid) if wid > 0 else 1
    ob.scale = (sc, sc, 1)
    ob.rotation_euler = (math.radians(90), 0, math.radians(180))
    ob.location = ((a + b) / 2, 0.035, 2.64)
    sign_objs.append(ob)

# ---- ornamental pilasters (owner's reference render, 2026-11-18): a greige perforated screen (staggered round holes,
# darker wall behind) between solid side margins; at every band a crown block: framed panel with five arched slots
# (the "Art House" crown), small ledges above and below. Up past the roof.
BAND_Z = [12, 21, 30, 39]
def circle(cx, cz, r, n=10):
    return [(cx + r * math.cos(2 * math.pi * k / n), cz + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
def arched_slot(cx, z0, w, h, n=8):
    r = w / 2; pts = [(cx - r, z0), (cx + r, z0)]
    for k in range(n + 1):
        a = math.pi * k / n; pts.append((cx + r * math.cos(a), z0 + h - r + r * math.sin(a)))
    return pts
PW, PD, MG, CROWN_H = 0.9, 0.16, 0.07, 1.2
for x in (6.42, BLOCK_W - 6.28):
    x0, x1 = x - PW / 2, x + PW / 2
    z_lo, z_hi = 3.72, ROOF_Z + 1.6
    crowns = BAND_Z + [ROOF_Z + 1.0]
    pbox('Shell', 'M_PilasterBack', x0 + MG, -0.05, x1 - MG, 0, z_lo, z_hi)          # wall seen through the holes
    for a, b in ((x0, x0 + MG), (x1 - MG, x1)):
        pbox('Shell', 'M_Pilaster', a, -PD, b, 0, z_lo, z_hi)                           # solid margins
    # perforated screen between the crown blocks, in pieces of <= 1.5 m (keeps the triangulation small)
    edges = [z_lo] + [v for z in crowns for v in (z - CROWN_H / 2, z + CROWN_H / 2)] + [z_hi]
    sx0, sx1 = x0 + MG, x1 - MG
    for i in range(0, len(edges) - 1, 2):
        za, zb = edges[i], edges[i + 1]
        # piece borders sit halfway between hole rows (rows at z_lo + 0.06 + r * 0.094), so no row is lost at a seam
        n = max(1, math.ceil((zb - za) / 1.5)); hh = (zb - za) / n
        cuts = [za] + [z_lo + 0.107 + round((za + k * hh - z_lo - 0.107) / 0.094) * 0.094 for k in range(1, n)] + [zb]
        for k in range(n):
            pa, pb = cuts[k], cuts[k + 1]
            holes = []; row = max(0, int((pa - z_lo - 0.06) / 0.094)); z = z_lo + row * 0.094 + 0.06
            while z < pb - 0.04:
                if z > pa + 0.04:
                    u = sx0 + 0.055 + (row % 2) * 0.054
                    while u < sx1 - 0.045:
                        holes.append(circle(u, z, 0.034)); u += 0.108
                z += 0.094; row += 1
            prism('Lattice', [(sx0, pa), (sx1, pa), (sx1, pb), (sx0, pb)], holes, -PD, -PD + 0.03, fac3(0), 'M_Pilaster', 'M_Pilaster', 'M_Pilaster')
    # crown blocks
    for z in crowns:
        bx0, bx1, zb0, zb1 = x0 - 0.05, x1 + 0.05, z - CROWN_H / 2, z + CROWN_H / 2
        pbox('Shell', 'M_PilasterSlot', bx0 + 0.01, -PD - 0.06, bx1 - 0.01, 0, zb0 + 0.01, zb1 - 0.01)   # shows in the slots
        slots = [arched_slot(x + c, z - 0.3, 0.065, h) for c, h in zip((-0.24, -0.12, 0, 0.12, 0.24), (0.38, 0.5, 0.62, 0.5, 0.38))]
        prism('Shell', [(bx0, zb0), (bx1, zb0), (bx1, zb1), (bx0, zb1)], slots, -PD - 0.1, -PD - 0.06, fac3(0), 'M_Pilaster', 'M_Pilaster', 'M_Pilaster')
        fi, ft = 0.09, 0.035                                                             # raised frame
        for a, b, c_, d in ((bx0 + fi, bx1 - fi, zb1 - fi - ft, zb1 - fi), (bx0 + fi, bx1 - fi, zb0 + fi, zb0 + fi + ft),
                            (bx0 + fi, bx0 + fi + ft, zb0 + fi, zb1 - fi), (bx1 - fi - ft, bx1 - fi, zb0 + fi, zb1 - fi)):
            pbox('Shell', 'M_Pilaster', a, -PD - 0.12, b, -PD - 0.1, c_, d)
        pbox('Shell', 'M_Pilaster', bx0 - 0.03, -PD - 0.13, bx1 + 0.03, 0, zb1, zb1 + 0.06)        # ledges
        pbox('Shell', 'M_Pilaster', bx0 - 0.03, -PD - 0.13, bx1 + 0.03, 0, zb0 - 0.06, zb0)

# ---- central lattice arch frame around the projecting balcony stack: white piers with perforated screens,
# a tall pointed arch under a white cornice at the mint/white line, a plain white frame up to the roof crown
bx0, bx1, fy, PW, IN = 12.42, 17.32, -1.47, 0.75, 0.29
zLat0, zTop, fzs, fzA = P['top'] + 0.13, 21.05, 16.4, 19.55
for a, b in ((bx0 - PW, bx0 + IN), (bx1 - IN, bx1 + PW)):
    pbox('Shell', 'M_FacadeWhite', a, fy + 0.07, b, 0, zLat0, ROOF_Z + 2.2, ny='M_Recess')       # recess behind the screen
    pbox('Shell', 'M_FacadeWhite', a, fy, b, fy + 0.07, zTop, ROOF_Z + 2.2)                      # solid above the cornice
    for x0_, x1_ in ((a, a + 0.07), (b - 0.07, b)):                                              # crisp white margins
        pbox('Shell', 'M_FacadeWhite', x0_, fy - 0.02, x1_, fy + 0.07, zLat0, zTop)
    girih('Lattice', 'M_FacadeWhite', [(a + 0.07, zLat0), (b - 0.07, zLat0), (b - 0.07, zTop), (a + 0.07, zTop)], 0.26, 0.022, fy, fy + 0.04, (a + b) / 2, zLat0 + 0.13, frame=0)
m_ = 0.06 + IN; aw = bx1 - bx0 - 2 * m_
farch = arch_pts(cx, aw, fzs, fzA, 22)[::-1]
sx0, sx1 = bx0 + IN, bx1 - IN
spand = [(sx1, fzs), (sx1, zTop), (sx0, zTop), (sx0, fzs), (cx - aw / 2, fzs)] + farch + [(cx + aw / 2, fzs)]
fpanel('Shell', 'M_Recess', spand, fy + 0.07, fy + 0.14)
girih('Lattice', 'M_FacadeWhite', spand, 0.26, 0.022, fy, fy + 0.04, cx, zLat0 + 0.13, frame=0)
outerA = arch_pts(cx, aw + 0.2, fzs, fzA + 0.13, 22)
fpanel('Shell', 'M_WhiteBand', outerA + [(cx - aw / 2, fzs)] + farch[1:-1] + [(cx + aw / 2, fzs)], fy - 0.05, fy + 0.07)
for xs_ in ((sx0, cx - aw / 2 - 0.1), (cx + aw / 2 + 0.1, sx1)):                                 # springing blocks
    pbox('Shell', 'M_WhiteBand', xs_[0], fy - 0.05, xs_[1], fy + 0.07, fzs - 0.25, fzs)
pbox('Shell', 'M_WhiteBand', bx0 - PW - 0.08, fy - 0.12, bx1 + PW + 0.08, 0, zTop, zTop + 0.3, top='M_Sill')     # cornice
pbox('Shell', 'M_WhiteBand', bx0 - PW - 0.04, fy - 0.08, bx1 + PW + 0.04, 0, zTop - 0.12, zTop)
pbox('Shell', 'M_FacadeWhite', bx0 - PW, fy, bx1 + PW, 0, ROOF_Z + 0.25, ROOF_Z + 2.2, top='M_Sill', bottom='M_SlabEdge')
# dark girih grilles over the balcony doors of the 40.84 m2 flats inside the arch (storeys 3-7)
typ = PLAN['3']
for o in typ['openings']:
    ocx = (o['x0'] + o['x1']) / 2
    if o['axis'] != 'x' or ocx < bx0 or ocx > bx1 or o['y0'] > 0.4: continue
    for st in range(3, 8):
        z0 = (st - 1) * FLOOR_H + SLAB
        g = [(o['x0'] + 0.05, z0 + 0.05), (o['x1'] - 0.05, z0 + 0.05), (o['x1'] - 0.05, z0 + 2.25), (o['x0'] + 0.05, z0 + 2.25)]
        girih('Lattice', 'M_LatticeDark', g, 0.2, 0.012, o['y0'] - 0.04, o['y0'] - 0.015, ocx, z0 + 0.15, frame=0.03)

# ---- horizontal bands across the slate window strips, every 3 storeys
for w in typ['windows']:
    if w['axis'] != 'x': continue
    ccx = (w['x0'] + w['x1']) / 2
    north = not in_poly(ccx, w['y0'] - 0.15, typ['footprint']); south = not in_poly(ccx, w['y1'] + 0.15, typ['footprint'])
    if not north and not south: continue
    y = w['y0'] - 0.06 if north else w['y1']
    for z in BAND_Z:
        pbox('Shell', 'M_FacadeMint' if z <= 21 else 'M_FacadeWhite', w['x0'] - 0.06, y, w['x1'] + 0.06, y + 0.06, z - 0.16, z + 0.16, top='M_Sill')

# ---- roof slab, parapets with copings (raised over the street loggias), soffit bands, stair / lift penthouse
fpT = typ['footprint']
prism('Shell', fpT['outer'], fpT['holes'], ROOF_Z, ROOF_Z + 0.25, plan3, 'M_Roof', 'M_Ceiling', 'M_FacadeWhite')
ring = fpT['outer']
for i in range(len(ring)):
    (ax_, ay_), (bx_, by_) = ring[i], ring[(i + 1) % len(ring)]
    L = math.hypot(bx_ - ax_, by_ - ay_)
    if L < 1e-3: continue
    nx, ny = (by_ - ay_) / L, -(bx_ - ax_) / L
    mx, my = (ax_ + bx_) / 2, (ay_ + by_) / 2
    if in_poly(mx + nx * 0.02, my + ny * 0.02, fpT): nx, ny = -nx, -ny
    t = 0.2
    px0, px1, py0, py1 = min(ax_, bx_), max(ax_, bx_), min(ay_, by_), max(ay_, by_)
    if abs(nx) > 0.5:
        if nx > 0: px0 -= t
        else: px1 += t
    else:
        if ny > 0: py0 -= t
        else: py1 += t
    raised = ny < -0.5 and my < 0.4 and any(a < mx < b for a, b in ((0.2, 3.2), (9.4, 12.3), (17.4, 20.3), (26.5, 29.6)))
    ztop = ROOF_Z + (2.0 if raised else 1.2)
    pbox('Shell', 'M_FacadeWhite', px0, py0, px1, py1, ROOF_Z + 0.25, ztop - 0.05)
    pbox('Shell', 'M_Sill', px0 - (0.03 if nx < -0.5 else 0), py0 - (0.03 if ny < -0.5 else 0), px1 + (0.03 if nx > 0.5 else 0), py1 + (0.03 if ny > 0.5 else 0), ztop - 0.05, ztop)
for a, b in ((0.22, 3.11), (9.51, 12.21), (17.52, 20.21), (26.62, 29.51)):
    pbox('Shell', 'M_Spandrel', a, -0.04, b, 0.02, ROOF_Z + 0.05, ROOF_Z + 0.3)
pbox('Shell', 'M_FacadeWhite', 9.6, 10.0, 16.9, 16.2, ROOF_Z + 0.25, ROOF_Z + 3.0, top='M_Roof')
pbox('Shell', 'M_Sill', 9.55, 9.95, 16.95, 16.25, ROOF_Z + 3.0, ROOF_Z + 3.08)
pbox('Frames', 'M_Steel', 12.0, 16.2, 13.0, 16.24, ROOF_Z + 0.25, ROOF_Z + 2.35)                     # roof door
for k in range(6):                                                                                     # rooftop units
    x = 2.0 + k * 4.6 if k < 3 else 18.0 + (k - 3) * 3.6
    if 9.0 < x < 17.5: continue
    pbox('Shell', 'M_Steel', x, 6.0, x + 1.4, 7.2, ROOF_Z + 0.25, ROOF_Z + 1.05)

# sidewalk in front and around
CUR[0] = 'Site_'
pbox('Ground','M_Pavers', -4, -6, BLOCK_W + 4, 0, -0.15, -0.0005, bottom=None)
pbox('Ground', 'M_Granite', -4, -6.15, BLOCK_W + 4, -6, -0.15, 0.0, bottom=None)      # kerb

# ------------------------------------------------------------------ materials
def tinted(name, src, color, soft=1.0):
    """Albedo image multiplied by an sRGB colour, saved next to the model; soft < 1 flattens the contrast."""
    path = os.path.join(TEX, src)
    img = bpy.data.images.load(path)
    import numpy as np
    w, h = img.size; px = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(-1, 4)
    c = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    m = px[:, :3].mean(0); px[:, :3] = np.clip((1 + (px[:, :3] / np.maximum(m, 1e-3) - 1) * soft) * c, 0, 1)    # keep (some) variation, set the mean
    out = bpy.data.images.new(name, w, h); out.pixels.foreach_set(px.ravel())
    out.filepath_raw = os.path.join(OUT, name + '.png'); out.file_format = 'PNG'; out.save()
    bpy.data.images.remove(img)
    return out
def load(f):
    p = os.path.join(TEX, f)
    return bpy.data.images.load(p) if os.path.exists(p) else None
grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
def mat(name, color='#ffffff', rough=0.8, metal=0.0, tex=None, tint=False, alpha=1.0, emit=None, tile=2.0, soft=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    c = [(int(color[i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5)] + [1]
    b.inputs['Base Color'].default_value = c; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if tex:
        a = tinted(name + '_a', tex + '_a.jpg', color, soft) if tint else load(tex + '_a.jpg')
        if a:
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = a; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
        n = load(tex + '_n.jpg')
        if n:
            n.colorspace_settings.name = 'Non-Color'
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = n; nm = nt.nodes.new('ShaderNodeNormalMap')
            nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
        o = load(tex + '_orm.jpg')
        if o:
            o.colorspace_settings.name = 'Non-Color'
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = o; sp = nt.nodes.new('ShaderNodeSeparateColor')
            nt.links.new(t.outputs['Color'], sp.inputs['Color'])
            nt.links.new(sp.outputs['Green'], b.inputs['Roughness']); nt.links.new(sp.outputs['Blue'], b.inputs['Metallic'])
            g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = grp; nt.links.new(sp.outputs['Red'], g.inputs['Occlusion'])
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
    if emit:
        b.inputs['Emission Color'].default_value = [(int(emit[i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5)] + [1]
        b.inputs['Emission Strength'].default_value = 1.5
    m['tile'] = tile
    return m
MATS = {m.name: m for m in [
    mat('M_FacadeMint', '#98d0ae', 0.85, tex='plaster', tint=True, tile=2.5),
    mat('M_FacadeWhite', '#f1eee8', 0.85, tex='plaster', tint=True, tile=2.5),
    mat('M_WhiteBand', '#f4f1ea', 0.6, tex='plaster', tint=True, tile=2.5),
    mat('M_BrickWall', '#b49d82', 0.92, tex='brick', tint=True, tile=1.2),
    mat('M_Brick1', '#b8a083', 0.9), mat('M_Brick2', '#a88f73', 0.92), mat('M_Brick3', '#c2ab8e', 0.88), mat('M_Brick4', '#9d846a', 0.93),
    mat('M_Mortar', '#cfc6b8', 0.95, tex='concrete', tint=True, tile=1.5),
    mat('M_Granite', '#2b2c2f', 0.3, tex='polished', tint=True, tile=1.5),
    mat('M_Canopy', '#5b5d61', 0.4, 0.7),
    mat('M_Soffit', '#e9e6df', 0.7),
    mat('M_Frame', '#3f444e', 0.38, 0.75),
    mat('M_FrameLight', '#e9e9e6', 0.5),
    mat('M_Glass', '#6f93ad', 0.03, 0.0, alpha=0.22),
    mat('M_Spandrel', '#4f586c', 0.55, 0.1),
    mat('M_PilasterDark', '#a48a72', 0.85),
    mat('M_PilasterBack', '#7d8079', 0.9),
    mat('M_Plaster', '#f3f1ed', 0.9, tex='plaster', tint=True, tile=2.5),      # flats: one coat of white plaster
    mat('M_Screed', '#a29e97', 0.95, tex='concrete', tint=True, tile=3.0),     # handover floor screed
    mat('M_DoorEntry', '#3a2e28', 0.45, 0.3),
    mat('M_Handle', '#121314', 0.3, 0.9),
    mat('M_Radiator', '#f2f2f0', 0.35),
    mat('M_Boiler', '#f4f4f2', 0.25),
    mat('M_LightRim', '#e9e9e7', 0.4, 0.6),
    mat('M_LightEmit', '#fff3e0', 0.5, emit='#fff1dc'),
    mat('M_LampPublic', '#f6f8fb', 0.5, emit='#eef3ff'),
    mat('M_FurnFabric', '#c2bfb9', 0.95, tex='fabric', tint=True, tile=1.0),
    mat('M_FurnLinen', '#f2efe9', 0.95, tex='fabric', tint=True, tile=1.0),
    mat('M_FurnDuvet', '#8d8f93', 0.95, tex='fabric', tint=True, tile=1.0),
    mat('M_FurnThrow', '#c8b49a', 0.95, tex='fabric', tint=True, tile=1.0),
    mat('M_FurnHead', '#cbbba6', 0.95, tex='fabric', tint=True, tile=1.0),
    mat('M_WoodOak', '#b68a5e', 0.55, tex='veneer', tint=True, tile=1.5),
    mat('M_WoodDark', '#4e3626', 0.5, tex='veneer', tint=True, tile=1.5),
    mat('M_Leather', '#b0643a', 0.5, tex='leather', tint=True, tile=1.0),
    mat('M_CabWhite', '#efece6', 0.45),
    mat('M_Marble', '#dcd9d3', 0.2, tex='polished', tint=True, tile=1.5),
    mat('M_Black', '#18191b', 0.3, 0.2),
    mat('M_Chrome', '#d0d3d6', 0.12, 1.0),
    mat('M_Ceramic', '#fbfbf9', 0.1),
    mat('M_Mirror', '#cfd8de', 0.02, 1.0),
    mat('M_LampShade', '#f6e7c8', 0.6, emit='#f3d6a0'),
    mat('M_TVScreen', '#050506', 0.08),
    mat('M_Rug', '#b9b1a6', 1.0, tex='fabric', tint=True, tile=1.0),
    mat('M_Water', '#dfe9ee', 0.05),
    mat('M_Leaf', '#4f6b3a', 0.7),
    mat('M_PilasterSlot', '#3b322e', 0.9),
    mat('M_Recess', '#cfccc5', 0.9),
    mat('M_LatticeDark', '#363b39', 0.45, 0.6),
    mat('M_Roof', '#9a958d', 0.95, tex='gravel', tint=True, tile=2.0),
    mat('M_SlabEdge', '#5d6270', 0.6),
    mat('M_Sill', '#e8e4dc', 0.45, tex='terrazzo', tint=True, tile=1.0),
    mat('M_SillIn', '#f1eee8', 0.45),
    mat('M_Jamb', '#f4f1eb', 0.85, tex='plaster', tint=True, tile=2.5),
    mat('M_Paint', '#efe9e1', 0.9, tex='plaster', tint=True, tile=2.5),
    mat('M_PaintPublic', '#eceeee', 0.9, tex='plaster', tint=True, tile=2.5),         # cool white (owner's corridor reference)
    mat('M_CeilPublic', '#a3a6a6', 0.95, tex='plaster', tint=True, tile=1.2),         # grey speckled corridor ceiling
    mat('M_TileWall', '#e8e4de', 0.3, tex='walltile', tile=1.2),
    mat('M_Ceiling', '#f7f5f1', 0.95),
    mat('M_Concrete', '#b9b4ab', 0.9, tex='concrete', tint=True, tile=3.0),
    mat('M_FloorWood', '#d4c3aa', 0.6, tex='parquet', tint=True, tile=2.0, soft=0.45),   # soft light natural oak laminate (owner reference)
    mat('M_Spot', '#fbfaf7', 0.25, emit='#fff6ea'),                                      # recessed ceiling spots in the flats
    mat('M_FloorTile', '#ffffff', 0.35, tex='porcelain', tile=1.2),
    mat('M_FloorStone', '#d9dad8', 0.35, tex='porcelain', tint=True, tile=1.2),     # light grey porcelain tiles
    mat('M_DoorGroove', '#1a2029', 0.6),                                              # entrance door: vertical grooves
    mat('M_FloorShop', '#d2d0cb', 0.3, tex='polished', tint=True, tile=3.0),
    mat('M_FloorDeck', '#a9a29a', 0.8, tex='slab30', tint=True, tile=1.2),
    mat('M_Stair', '#cbc6be', 0.6, tex='terrazzo', tint=True, tile=2.0),
    mat('M_Rail', '#2d3038', 0.4, 0.7),
    mat('M_Steel', '#b9bcc0', 0.3, 0.9, tex='brushed', tile=1.0),
    mat('M_Gold', '#caa865', 0.32, 1.0),
    mat('M_LiftBtn', '#3a3d42', 0.35, 0.8),                                          # lift call button (lit in Unreal: MI_LiftBtnOn)
    mat('M_Pilaster', '#d6c9c2', 0.75, tex='plaster', tint=True, tile=2.5),
    mat('M_DoorWood', '#d9cbb8', 0.55, tex='veneer', tint=True, tile=1.5),
    mat('M_Pavers', '#ffffff', 0.85, tex='ph_pavers', tile=3.0),
    mat('M_Sign', '#e2bd72', 0.3, 1.0, emit='#ffc873'),
]}

# ------------------------------------------------------------------ build objects, UVs (metres / tile), bevels
import numpy as np
def build(P):
    me = bpy.data.meshes.new(P.name); me.from_pydata(P.v, [], P.f)
    names = sorted(set(P.m)); index = {n: i for i, n in enumerate(names)}
    for n in names: me.materials.append(MATS[n])
    me.polygons.foreach_set('material_index', [index[n] for n in P.m])
    me.update()
    uv = me.uv_layers.new(name='uv')
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    nrm = np.empty(len(me.polygons) * 3, np.float32); me.polygons.foreach_get('normal', nrm); nrm = nrm.reshape(-1, 3)
    ls = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get('loop_start', ls)
    lt = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get('loop_total', lt)
    mi = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get('material_index', mi)
    lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
    tiles = np.array([MATS[n].get('tile', 2.0) for n in names], np.float32)
    out = np.zeros((len(me.loops), 2), np.float32)
    ax = np.abs(nrm).argmax(1)
    for pi in range(len(me.polygons)):
        L = slice(ls[pi], ls[pi] + lt[pi]); c = co[lv[L]]; t = tiles[mi[pi]]
        if ax[pi] == 2: out[L] = c[:, [0, 1]] / t
        elif ax[pi] == 0: out[L] = np.stack([c[:, 1] * np.sign(nrm[pi, 0]), c[:, 2]], 1) / t
        else: out[L] = np.stack([-c[:, 0] * np.sign(nrm[pi, 1]), c[:, 2]], 1) / t
    uv.data.foreach_set('uv', out.ravel())
    ob = bpy.data.objects.new('Blok1_' + P.name, me); bpy.context.scene.collection.objects.link(ob)
    return ob
def bevel(ob, width, seg):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    m = ob.modifiers.new('bevel', 'BEVEL'); m.width = width; m.segments = seg; m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(30); m.use_clamp_overlap = True; m.harden_normals = True
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
objs = {n: build(p) for n, p in PARTS.items()}
# corner balconies: boolean the gable wall pieces, cut faces get the balcony finish, then merge into the shell
if 'Typ_WallCut' in objs:
    wc = objs.pop('Typ_WallCut')
    for x0, x1 in CORNER_CUT:
        bpy.ops.mesh.primitive_cube_add(size=1)
        c = bpy.context.object
        c.scale = (x1 - x0, CORNER_Y[1] - CORNER_Y[0], FLOOR_H)
        c.location = ((x0 + x1) / 2, -(CORNER_Y[0] + CORNER_Y[1]) / 2, SLAB + 0.001 + FLOOR_H / 2)
        c.data.materials.append(MATS['M_FacadeWhite'])
        bm_ = wc.modifiers.new('cut', 'BOOLEAN'); bm_.operation = 'DIFFERENCE'; bm_.solver = 'EXACT'; bm_.object = c
        try: bm_.material_mode = 'TRANSFER'
        except Exception: pass
        bpy.ops.object.select_all(action='DESELECT'); wc.select_set(True); bpy.context.view_layer.objects.active = wc
        bpy.ops.object.modifier_apply(modifier=bm_.name)
        bpy.data.objects.remove(c)
    sh = objs['Typ_Shell']
    bpy.ops.object.select_all(action='DESELECT'); wc.select_set(True); sh.select_set(True); bpy.context.view_layer.objects.active = sh
    bpy.ops.object.join()
for n, o in objs.items():
    done = False
    for suf, (w, s) in {'Shell': (0.01, 2), 'Brick': (0.004, 1), 'Frames': (0.003, 1), 'FurnD': (0.025, 3), 'Furn': (0.008, 2)}.items():
        if n.endswith(suf): bevel(o, w, s); done = True
    if not done:                                   # boxes share corner vertices: split normals at hard edges
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
# storey shells (~30 x 18 m each) split into 6 tiles by face centre: Lumen gives every mesh at most 32 surface-cache
# cards, one whole storey shell got too few and thin wall parts went black ("burnt" patches next to windows)
TILES = {
         # whole-building facade (30 x 18 x 50 m): front / back, 10 m wide, 2 storeys high
         'Fac_Shell': (lambda c: (0 if -c.y < 9.0 else 100) + min(9, max(0, int(c.z // 6.0))) * 3 + min(2, max(0, int(c.x // 10.0))) + 1,
                       [s + z * 3 + x + 1 for s in (0, 100) for z in range(10) for x in range(3)])}
for key, (tile, ks) in TILES.items():
    if key not in objs: continue
    ob = objs.pop(key); pre = key.split('_')[0]
    ks = list(ks)
    for k in ks:
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
        sel = [tile(p.center) == k for p in ob.data.polygons]
        if not any(sel): continue
        if all(sel):
            ob.name = ob.data.name = 'Blok1_%s_S%d_Shell' % (pre, k); objs['%s_S%d_Shell' % (pre, k)] = ob; break
        ob.data.polygons.foreach_set('select', sel)
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
        new = [o for o in bpy.context.selected_objects if o is not ob][0]
        new.name = new.data.name = 'Blok1_%s_S%d_Shell' % (pre, k); objs['%s_S%d_Shell' % (pre, k)] = new
# storey shells -> 2 x 2 m cells, faces really cut on the grid lines (bmesh bisect). Lumen surface-cache cards look at
# a mesh from outside: inside one big storey mesh the interior walls hide behind each other and got no cache at all
# (black rooms, dark gable). Small simple pieces are fully covered.
import bmesh
CELL = 2.0
for key in ('F1_Shell', 'F2_Shell', 'Typ_Shell'):
    if key not in objs: continue
    ob = objs.pop(key); pre = key.split('_')[0]
    bm = bmesh.new(); bm.from_mesh(ob.data)
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]
    gx = [CELL * i for i in range(int(min(xs) // CELL) + 1, int(max(xs) // CELL) + 1)]
    gy = [CELL * i for i in range(int(min(ys) // CELL) + 1, int(max(ys) // CELL) + 1)]
    for x in gx:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(x, 0, 0), plane_no=(1, 0, 0))
    for y in gy:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, y, 0), plane_no=(0, 1, 0))
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    # the bevel's hardened custom normals were interpolated across the cuts -> streaky shading, white seams:
    # drop them and rebuild plain normals (flat walls, smooth only across <30 deg)
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='FACE'); bpy.ops.object.mode_set(mode='OBJECT')
    cid = [(int(p.center.x // CELL), int(p.center.y // CELL)) for p in ob.data.polygons]
    cells = sorted(set(cid)); n = 0
    for c in cells[:-1]:
        sel = [k == c for k in cid]
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
        ob.data.polygons.foreach_set('select', sel)
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
        new = [o for o in bpy.context.selected_objects if o is not ob][0]
        nm = '%s_C%02d%02d_Shell' % (pre, c[0] + 5, c[1] + 15)
        new.name = new.data.name = 'Blok1_' + nm; objs[nm] = new; n += 1
        cid = [k for k in cid if k != c]
    c = cells[-1]; nm = '%s_C%02d%02d_Shell' % (pre, c[0] + 5, c[1] + 15)
    ob.name = ob.data.name = 'Blok1_' + nm; objs[nm] = ob
    print('CELLS', key, n + 1)
# shop lettering: one mesh
if sign_objs:
    bpy.ops.object.select_all(action='DESELECT')
    for o in sign_objs: o.select_set(True)
    bpy.context.view_layer.objects.active = sign_objs[0]
    bpy.ops.object.convert(target='MESH'); bpy.ops.object.join()
    so = bpy.context.view_layer.objects.active; so.name = 'Blok1_Signs'
    so.data.materials.clear(); so.data.materials.append(MATS['M_Sign'])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    objs['Signs'] = so
for o in objs.values():
    print('OBJ', o.name, len(o.data.polygons), 'faces', sum(len(p.vertices) - 2 for p in o.data.polygons), 'tris')

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'blok1_full.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'blok1_full.glb'), export_format='GLB', export_yup=True, export_apply=True,
                          export_image_format='AUTO', export_texcoords=True, export_normals=True, export_materials='EXPORT')
print('DONE', os.path.join(OUT, 'blok1_full.glb'))
# facade gates (portal doors) are added after the first dump: write walk.json again with everything
json.dump(dict(doors=DOORS, gates=GATES, pgates=PGATES, balc=BALC, lifts=LIFTS, lift_x=LIFT_X, lift_y=LIFT_Y), open(os.path.join(OUT, 'walk.json'), 'w'), indent=0)
print('GATES', len(GATES))
json.dump(KIT, open(os.path.join(OUT, 'kit.json'), 'w'), indent=0)
print('KIT', {k: len(v) for k, v in KIT.items()})
print('PASSAGES', PASSAGES)
json.dump(OPLOG, open(os.path.join(OUT, 'openings_log.json'), 'w'), indent=0)
