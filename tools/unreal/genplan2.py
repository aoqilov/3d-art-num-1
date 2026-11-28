"""Courtyard master plan, DESIGNED (clean vectors) on top of public/plan.jpg -> tools/unreal/out/genplan.json
(+ genplan_check.jpg). Replaces the colour tracing of genplan.py (blobby beds, ragged roads; owner 2026-11-20).

Rules:
  roads      centre lines picked from the plan (px), 6 m asphalt, 6 m corner radius, 12 cm below the paving
  blocks     3 m paving all round; street / boulevard facade: 5 m shop frontage + 10 x 6 m plaza at the portal;
             courtyard door: 3 m path straight out until it meets paving or a road
  boulevard  6 m promenade, planted strips 2.5 m cut every 12 m (video ref Screenshot_3)
  pads       playgrounds / sport court / fountain where the plan shows them (rubber, court colour, stone)
  lawns      what is left, 1.5 m clear of everything, behind a 15 cm curb; trees on a grid in the lawns
Block orientation (portal side) comes from ue_scripts/kompleks_coords.py (FLIP).
Usage: python tools/unreal/genplan2.py
"""
import json, math, os
from pathlib import Path
import cv2
import numpy as np
from shapely.geometry import Point, Polygon, LineString, MultiPolygon, box
from shapely.ops import unary_union
from shapely import affinity

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = HERE / 'out'
exec(open(HERE / 'ue_scripts' / 'kompleks_coords.py', encoding='utf-8').read())
PX = 251.6 / 740
CX, CY = 370, 410
to_m = lambda x, y: ((x - CX) * PX, (y - CY) * PX)
r2 = lambda v: round(float(v), 2)

SITE_PX = [(28, 232), (132, 186), (250, 128), (350, 58), (480, 36), (540, 72), (610, 92), (616, 778), (232, 778), (228, 548), (48, 330)]
SITE = Polygon([to_m(*p) for p in SITE_PX])
ROAD_W, ROAD_R = 6.0, 6.0
# road centre lines (plan px), read from the traced driveways
ROADS = [
    [(32, 232), (42, 236), (140, 207), (267, 236)],                              # north road along blocks 1-2 (+ west entry)
    [(32, 232), (52, 327)],                                                      # west edge access
    [(160, 337), (247, 342), (277, 432), (200, 475), (160, 337)],               # west court loop
    [(247, 342), (262, 330)],
    [(477, 155), (430, 185), (457, 252), (495, 252)],                           # north-east court
    [(457, 252), (375, 317)],
    [(405, 365), (445, 395), (555, 352)],                                        # south of blocks 16-17
    [(318, 552), (318, 666), (497, 666), (497, 574), (420, 602), (318, 602)],   # south court loop round the oval
    [(497, 574), (495, 545)],
]
BLVD_PX = ((258, 165), (432, 475))
PADS = [  # (kind, centre px, w m, d m, angle deg (plan), label)
    ('play', (213, 402), 16, 12, -15, 'west court playground'),
    ('play', (468, 214), 14, 18, -30, 'north-east court playground'),
    ('sport', (352, 632), 22, 13, 0, 'south court sport court'),
    ('fountain', (397, 632), 9, 9, 0, 'south court dry fountain'),
    ('play', (450, 632), 18, 12, 0, 'south court playground'),
]
# underground parking ramps (owner 2026-11-20: the complex has a basement car park): start on a driveway (px) -> end (px);
# 6.5 m wide, down to RAMP_DEPTH at the end (gate to the car park), concrete side walls with a 1 m parapet
RAMPS = [((162, 238), (161, 286)), ((250, 452), (256, 504)), ((364, 598), (348, 549))]
RAMP_W, RAMP_DEPTH = 6.5, 3.6
Z_PAVE, Z_ROAD, Z_CURB, Z_SOIL, Z_PAD = 0.02, -0.10, 0.17, 0.10, 0.03
CURB_W = 0.15


def plist(g):
    out = []
    for p in (g.geoms if hasattr(g, 'geoms') else [g]):
        if isinstance(p, MultiPolygon): out += plist(p)
        elif isinstance(p, Polygon) and not p.is_empty and p.area > 0.3: out.append(p)
    return out


def rings(g):
    return [[[r2(v) for v in np.array(p.exterior.coords)[:-1].ravel()]] +
            [[r2(v) for v in np.array(h.coords)[:-1].ravel()] for h in p.interiors] for p in plist(g)]


def main():
    site = SITE
    # ---- blocks, portals, courtyard doors (web scene metres)
    blk, portals, doors = {}, {}, {}
    for i in BLOCKS:
        blk[i] = Polygon([web_xz(i, px, py) for px, py in ((0, 0), (BW, 0), (BW, BD), (0, BD))])
        portals[i] = (web_xz(i, 14.85, 0), web_xz(i, 14.85, -1))           # point on facade, 1 m outward
        doors[i] = (web_xz(i, 13.25, BD), web_xz(i, 13.25, BD + 1))
    bld = unary_union(list(blk.values()))

    # ---- roads: constant width, rounded corners
    road = unary_union([LineString([to_m(*q) for q in r]).buffer(ROAD_W / 2, cap_style='flat', join_style='mitre') for r in ROADS])
    road = road.buffer(ROAD_R, join_style='round').buffer(-ROAD_R, join_style='round')     # fillets inside corners
    road = road.buffer(-1.0, join_style='round').buffer(1.0, join_style='round')            # rounded outer corners
    road = road.intersection(site).difference(bld.buffer(3.0))

    # ---- hard paving that must stay paving
    # targets an entrance path may end on: roads (+ their walks), the site perimeter walk, the boulevard, other blocks' walks
    a_, b_ = np.array(to_m(*BLVD_PX[0])), np.array(to_m(*BLVD_PX[1]))
    blvd = LineString([tuple(a_), tuple(b_)]).buffer(8.2, cap_style='flat')
    perim = site.difference(site.buffer(-4.0, join_style='mitre'))
    hard = [b.buffer(3.0, join_style='mitre') for b in blk.values()]
    def ray(i, p, v, width, dmax=30.0, dmin=3.5):
        """straight path from p along v; ends where it first reaches a road walk / perimeter / boulevard / another block"""
        others = unary_union([road.buffer(2.0), perim, blvd] + [blk[j].buffer(3.0, join_style='mitre') for j in blk if j != i])
        ln = LineString([p, (p[0] + v[0] * dmax, p[1] + v[1] * dmax)])
        hit = ln.intersection(others)
        d = dmax
        if not hit.is_empty:
            d = min(Point(p).distance(g) for g in (hit.geoms if hasattr(hit, 'geoms') else [hit]))
            d = max(d + 1.0, dmin)
        else:                                                               # nothing straight ahead: 4 m out, then to the nearest walk
            q = (p[0] + v[0] * 4, p[1] + v[1] * 4)
            from shapely.ops import nearest_points
            t_ = nearest_points(Point(q), others)[1]
            return LineString([p, q, (t_.x, t_.y)]).buffer(width / 2, cap_style='flat', join_style='round')
        return LineString([p, (p[0] + v[0] * d, p[1] + v[1] * d)]).buffer(width / 2, cap_style='flat')
    for i in BLOCKS:
        (a, a1) = portals[i]; (d, d1) = doors[i]
        ux, uz = a1[0] - a[0], a1[1] - a[1]                                   # unit outward normal (street side)
        e0, e1 = web_xz(i, 0, 0), web_xz(i, BW, 0)                            # street facade ends
        hard.append(Polygon([e0, e1, (e1[0] + ux * 5, e1[1] + uz * 5), (e0[0] + ux * 5, e0[1] + uz * 5)]))   # shop frontage
        c = (a[0] + ux * 3, a[1] + uz * 3)
        hard.append(affinity.rotate(box(c[0] - 5, c[1] - 3, c[0] + 5, c[1] + 3), math.atan2(uz, ux) - math.pi / 2, origin=c, use_radians=True))
        r = ray(i, a, (ux, uz), 6.0)                                          # portal plaza runs on to the road / walk
        if r is not None: hard.append(r)
        r = ray(i, d, (d1[0] - d[0], d1[1] - d[1]), 3.0)                      # courtyard door path
        if r is not None: hard.append(r)
    hard.append(perim)
    hard.append(road.buffer(2.0, join_style='round'))

    # ---- boulevard
    a, b = np.array(to_m(*BLVD_PX[0])), np.array(to_m(*BLVD_PX[1]))
    L = float(np.linalg.norm(b - a)); t = (b - a) / L; nrm = np.array([-t[1], t[0]])
    strips, trees = [], []
    for side in (-1, 1):
        s0 = 4.0
        while s0 + 10 < L - 2:
            c0, c1 = a + t * s0, a + t * (s0 + 10)
            strips.append(Polygon([c0 + nrm * side * 3.0, c1 + nrm * side * 3.0, c1 + nrm * side * 5.5, c0 + nrm * side * 5.5]))
            for k in (2.5, 7.5):
                m = a + t * (s0 + k) + nrm * side * 4.25; trees.append([r2(m[0]), r2(m[1])])
            s0 += 12
    strips = unary_union(strips).difference(road.buffer(2.0)).difference(bld.buffer(3.0))
    hard.append(blvd)

    # ---- pads
    pads = {'play': [], 'sport': [], 'fountain': []}
    for kind, c, w, d, ang, _ in PADS:
        cm = to_m(*c)
        g = Point(cm).buffer(w / 2, 48) if kind == 'fountain' else affinity.rotate(box(cm[0] - w / 2, cm[1] - d / 2, cm[0] + w / 2, cm[1] + d / 2), ang, origin=cm)
        pads[kind].append(g)
    pad_all = unary_union([g for v in pads.values() for g in v])
    hard.append(pad_all.buffer(2.0, join_style='mitre'))                       # paved rim round every pad

    hard = unary_union(hard)
    # ---- lawns: everything else, 1.5 m clear, straight edges, no slivers
    lawn = site.buffer(-4.0, join_style='mitre').difference(hard).difference(road.buffer(2.0)).difference(bld.buffer(3.0))
    lawn = lawn.buffer(-1.5, join_style='mitre').buffer(1.5, join_style='mitre')
    lawn = unary_union([p.simplify(0.3) for p in plist(lawn) if p.area > 25 and p.minimum_rotated_rectangle.length / 4 > 1.0])
    bed = unary_union([lawn, strips]).intersection(site)
    for k in pads: pads[k] = unary_union(pads[k]).difference(road)
    paving = site.difference(bld).difference(road).difference(bed).difference(pad_all)

    # trees: lawn grid 9 m, 3 m inside the edge, clear of pads
    inner = lawn.buffer(-3.0)
    minx, minz, maxx, maxz = site.bounds
    rng = np.random.default_rng(7)
    for x in np.arange(minx, maxx, 9.0):
        for z in np.arange(minz, maxz, 9.0):
            p = Point(x + rng.uniform(-2, 2), z + rng.uniform(-2, 2))
            if inner.contains(p): trees.append([r2(p.x), r2(p.y)])

    ramps, ramp_g = [], []
    for a0, a1 in RAMPS:
        p0, p1 = np.array(to_m(*a0)), np.array(to_m(*a1))
        ramps.append([r2(p0[0]), r2(p0[1]), r2(p1[0]), r2(p1[1]), RAMP_W, RAMP_DEPTH])
        ramp_g.append(LineString([tuple(p0), tuple(p1)]).buffer(RAMP_W / 2 + 0.3, cap_style='flat'))
    ramp_g = unary_union(ramp_g)
    trees = [t for t in trees if not ramp_g.buffer(2.5).contains(Point(t))]
    road, bed, paving = road.difference(ramp_g), bed.difference(ramp_g), paving.difference(ramp_g)
    for k in pads: pads[k] = pads[k].difference(ramp_g)
    soil = bed.buffer(-CURB_W, join_style='mitre')
    walls = []
    def faces(g, look_inside, zb, zt):
        for p in plist(g):
            for ring in [p.exterior, *p.interiors]:
                c = np.array(ring.coords)
                for (x1, z1), (x2, z2) in zip(c[:-1], c[1:]):
                    Lg = math.hypot(x2 - x1, z2 - z1)
                    if Lg < 0.02: continue
                    nx, nz = (z2 - z1) / Lg, -(x2 - x1) / Lg
                    if p.contains(Point((x1 + x2) / 2 + nx * 0.03, (z1 + z2) / 2 + nz * 0.03)) != look_inside: nx, nz = -nx, -nz
                    walls.append([r2(x1), r2(z1), r2(x2), r2(z2), round(nx, 3), round(nz, 3), zb, zt])
    faces(road, True, Z_ROAD, Z_PAVE)
    faces(bed, False, Z_PAVE, Z_CURB)
    faces(soil, True, Z_SOIL, Z_CURB)

    out = {'note': 'tools/unreal/genplan2.py (designed); scene metres (x right, z down, origin plan centre)',
           'site': [r2(v) for v in np.array(SITE.exterior.coords)[:-1].ravel()],
           'road': rings(road), 'bed': rings(bed), 'soil': rings(soil), 'curb': rings(bed.difference(soil)),
           'paving': rings(paving), 'under': rings(bld.buffer(2.0, join_style='mitre').intersection(site).difference(ramp_g)),   # 2026-11-23: was over 2 ramps (pavers through the ramp)
           'pads': {k: rings(v) for k, v in pads.items()}, 'walls': walls, 'ramps': ramps,
           'z': {'pave': Z_PAVE, 'road': Z_ROAD, 'curb': Z_CURB, 'soil': Z_SOIL, 'pad': Z_PAD},
           'trees': trees, 'young': [],
           'entrances': {i: {'portal': [r2(v) for v in portals[i][0]], 'door': [r2(v) for v in doors[i][0]]} for i in BLOCKS},
           'blocks': {i: [r2(v) for v in np.array(b.exterior.coords)[:-1].ravel()] for i, b in blk.items()}}
    OUT.mkdir(exist_ok=True)
    (OUT / 'genplan.json').write_text(json.dumps(out, separators=(',', ':')))
    print(f'road {road.area:.0f} m2, lawn+strips {bed.area:.0f} m2, paving {paving.area:.0f} m2, pads {pad_all.area:.0f} m2, '
          f'{len(trees)} trees, walls {len(walls)}')

    # ---- review picture: a clean 2D plan next to the master-plan picture
    S = 2
    img = cv2.resize(cv2.imread(str(ROOT / 'public/plan.jpg')), None, fx=S, fy=S, interpolation=cv2.INTER_CUBIC)
    lay = np.full_like(img, 255)
    P = lambda p: [np.int32([[((x / PX) + CX) * S, ((z / PX) + CY) * S] for x, z in np.array(r.coords)]) for r in [p.exterior, *p.interiors]]
    def fill(g, col):
        for p in plist(g):
            m = np.zeros(img.shape[:2], np.uint8); cv2.fillPoly(m, P(p), 255); lay[m > 0] = col
    fill(site, (190, 196, 200)); fill(paving, (190, 196, 200)); fill(road, (70, 70, 74)); fill(bed, (90, 170, 90))
    fill(ramp_g, (40, 40, 160))
    fill(pads['play'], (70, 120, 230)); fill(pads['sport'], (60, 140, 200)); fill(pads['fountain'], (220, 200, 140)); fill(bld, (245, 245, 245))
    for p in plist(bed): cv2.polylines(lay, P(p), True, (40, 110, 40), 1)
    for x, z in trees: cv2.circle(lay, (int((x / PX + CX) * S), int((z / PX + CY) * S)), 5, (30, 100, 30), -1)
    for i in BLOCKS:
        for key, col in (('portal', (0, 200, 255)), ('door', (200, 0, 200))):
            q = portals[i][0] if key == 'portal' else doors[i][0]
            cv2.circle(lay, (int((q[0] / PX + CX) * S), int((q[1] / PX + CY) * S)), 6, col, -1)
        c = blk[i].centroid
        cv2.putText(lay, str(i), (int((c.x / PX + CX) * S) - 8, int((c.y / PX + CY) * S) + 6), 0, 0.7, (0, 0, 255), 2)
    for p in plist(site): cv2.polylines(lay, P(p), True, (0, 0, 200), 2)
    cv2.imwrite(str(OUT / 'genplan_check.jpg'), np.hstack([lay, img]), [cv2.IMWRITE_JPEG_QUALITY, 88])


if __name__ == '__main__':
    main()
