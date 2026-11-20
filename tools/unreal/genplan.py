"""Courtyard master plan for Unreal, read from public/plan.jpg -> tools/unreal/out/genplan.json (+ genplan_check.jpg).

Coordinates: scene metres of the web app (x = plan right, z = plan down, origin = plan centre, 0.34 m per pixel), the
same frame as src/data/blocks.ts, so the blocks and the courtyard line up. Classes (colour rules on the teal plan):
  road     internal driveways (light teal bands)                    -> asphalt, 15 cm below the paving
  bed      planted beds and lawns (G - B high)                      -> raised 15 cm behind a curb
  dark     dark grey / brown patches beside the blocks -> asphalt too (owner 2026-11-20), merged into road
  paving   everything else inside the site outline                  -> pavers
  trees    crowns on the beds; young = the small dark diamonds on the paving
The west part of the picture is blurred (a haze blob): its false "road" triangle is masked out by hand (HAZE).
Usage: python tools/unreal/genplan.py      (needs opencv-python-headless, shapely, numpy)
"""
import json, math, re
from pathlib import Path
import cv2
import numpy as np
from shapely.geometry import Point, Polygon, MultiPolygon, box
from shapely.ops import unary_union
from shapely import affinity

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / 'out'
PX = 251.6 / 740
CX, CY = 370, 410
SITE_PX = [(28, 232), (132, 186), (250, 128), (350, 58), (480, 36), (540, 72), (610, 92), (616, 778), (232, 778), (228, 548), (48, 330)]
HAZE_PX = [(40, 330), (165, 338), (201, 480), (226, 545), (60, 545)]       # blurred area west of the west court loop
Z_PAVE, Z_ROAD, Z_CURB, Z_SOIL = 0.02, -0.10, 0.17, 0.10                   # top levels (m); the blocks stand at +2 cm in Unreal
CURB_W = 0.15                                                               # bed curb width (m)
BLVD_PX = ((258, 165), (432, 475), 24)                                     # pedestrian boulevard centre line + half width (px): never road
ROAD_ADD = [((158, 336), (178, 400), (201, 478), 14)]                       # px polyline + width: west leg of the west loop (under the haze)


def to_m(x, y):
    return (x - CX) * PX, (y - CY) * PX


def r2(v):
    return round(float(v), 2)


SITE = Polygon([to_m(*p) for p in SITE_PX])


def blocks():
    src = (ROOT / 'src/data/blocks.ts').read_text(encoding='utf-8')
    out = []
    for m in re.finditer(r'id: (\d+), x: ([-\d.]+), z: ([-\d.]+), w: ([\d.]+), d: ([\d.]+), rot: ([-\d.]+)', src):
        i = int(m.group(1)); x, z, w, d, r = map(float, m.groups()[1:])
        b = affinity.rotate(box(-w / 2, -d / 2, w / 2, d / 2), -r, origin=(0, 0), use_radians=True)
        out.append((i, affinity.translate(b, x, z)))
    return out


def polys(mask, min_area, eps=0.8):
    cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    if hier is None:
        return out
    for i, c in enumerate(cs):
        if hier[0][i][3] != -1 or len(c) < 3:
            continue
        c = cv2.approxPolyDP(c, eps, True)
        if len(c) < 3:
            continue
        holes, k = [], hier[0][i][2]
        while k != -1:
            h = cv2.approxPolyDP(cs[k], eps, True)
            if len(h) >= 3:
                holes.append([to_m(*q[0]) for q in h])
            k = hier[0][k][0]
        p = Polygon([to_m(*q[0]) for q in c], holes).buffer(0)
        if p.area >= min_area:
            out.append(p)
    return out


def smooth(g, r=0.6):
    return g.buffer(r, join_style='round').buffer(-r, join_style='round').simplify(0.12)


def regular(p):
    """beds in the renders are straight-edged: a near-rectangular blob becomes its oriented rectangle (a bit shrunk),
    anything else is simplified to straight runs"""
    if p.area < 3: return p
    rr = p.minimum_rotated_rectangle
    if p.area / rr.area > 0.62:
        return affinity.scale(rr, 0.96, 0.96)
    return p.simplify(0.9).buffer(0)


def plist(g):
    out = []
    for p in (g.geoms if hasattr(g, 'geoms') else [g]):
        if isinstance(p, MultiPolygon): out += plist(p)
        elif isinstance(p, Polygon) and not p.is_empty and p.area > 0.5: out.append(p)
    return out


def rings(g):
    """[[outer xz flat], [hole], ...] per polygon"""
    return [[[r2(v) for v in np.array(p.exterior.coords)[:-1].ravel()]] +
            [[r2(v) for v in np.array(h.coords)[:-1].ravel()] for h in p.interiors] for p in plist(g)]


def main():
    img = cv2.imread(str(ROOT / 'public/plan.jpg'))
    f = img.astype(np.float32)
    B, G, R = f[..., 0], f[..., 1], f[..., 2]
    H, W = B.shape
    site_px = np.zeros((H, W), np.uint8); cv2.fillPoly(site_px, [np.int32(SITE_PX)], 255)
    cv2.fillPoly(haze := np.zeros((H, W), np.uint8), [np.int32(HAZE_PX)], 255)
    white = (B > 200) & (G > 200) & (R > 200)
    K3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))

    def near(bgr, tol):
        return np.sqrt((B - bgr[0]) ** 2 + (G - bgr[1]) ** 2 + (R - bgr[2]) ** 2) < tol

    # roads: light teal bands, long components only
    road = (near((97, 109, 27), 22) & (site_px > 0) & (haze == 0)).astype(np.uint8) * 255
    road = cv2.morphologyEx(road, cv2.MORPH_OPEN, K3)
    road = cv2.morphologyEx(road, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    # dark grey patches + the brown strip south of blocks 16-17
    dark = ((near((64, 75, 45), 16) | near((50, 62, 95), 30)) & (site_px > 0)).astype(np.uint8) * 255
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    # planted beds
    green = cv2.GaussianBlur(G - B, (0, 0), 1.5)
    veg = ((green > 17) & ~white).astype(np.uint8) * 255
    veg = cv2.morphologyEx(veg, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    veg = cv2.morphologyEx(veg, cv2.MORPH_OPEN, K3)

    site = SITE.buffer(-0.3)
    blk = blocks()
    bld = unary_union([b for _, b in blk])
    from shapely.geometry import LineString
    add = [LineString([to_m(*q) for q in a[:-1]]).buffer(a[-1] * PX / 2, cap_style='flat', join_style='round') for a in ROAD_ADD]
    blvd = LineString([to_m(*BLVD_PX[0]), to_m(*BLVD_PX[1])]).buffer(BLVD_PX[2] * PX, cap_style='flat')
    road_g = unary_union(polys(road, 25.0)).difference(blvd)
    road_g = road_g.buffer(1.2, join_style='round').buffer(-2.0, join_style='round').buffer(0.8, join_style='round')  # close gaps, drop the ragged fringe
    road_g = unary_union([p for p in plist(road_g) if p.area > 25] + add).simplify(0.35).intersection(site).difference(bld.buffer(1.0))
    dark_g = unary_union([regular(p) for p in plist(smooth(unary_union(polys(dark, 30.0))))]).intersection(site).difference(bld).difference(road_g)
    bed_g = smooth(unary_union(polys(veg, 4.0))).intersection(site).difference(bld.buffer(0.6)).difference(road_g).difference(dark_g)
    bed_g = unary_union([regular(p) for p in plist(bed_g)]).intersection(site).difference(bld.buffer(0.6)).difference(road_g.buffer(0.8)).difference(dark_g)
    road_g = unary_union([road_g, dark_g])                              # owner: the dark patches are asphalt
    # the boulevard is designed, not traced (video ref Screenshot_3): 6 m paved promenade, planted strips 2.5 m wide on
    # both sides cut every 12 m by 2 m crossings, a tree in every strip segment
    a, b = np.array(to_m(*BLVD_PX[0])), np.array(to_m(*BLVD_PX[1]))
    L = float(np.linalg.norm(b - a)); t = (b - a) / L; nrm = np.array([-t[1], t[0]])
    strips, btrees = [], []
    for side in (-1, 1):
        s0 = 4.0
        while s0 + 10 < L - 2:
            c0, c1 = a + t * s0, a + t * (s0 + 10)
            q = [c0 + nrm * side * 3.0, c1 + nrm * side * 3.0, c1 + nrm * side * 5.5, c0 + nrm * side * 5.5]
            strips.append(Polygon(q))
            for k in (2.5, 7.5):
                m = a + t * (s0 + k) + nrm * side * 4.25; btrees.append([r2(m[0]), r2(m[1])])
            s0 += 12
    strips = unary_union(strips).intersection(site).difference(bld.buffer(0.6)).difference(road_g.buffer(0.5))
    bed_g = unary_union([bed_g.difference(blvd), strips])
    paving_g = site.difference(bld).difference(road_g).difference(bed_g)

    # trees: greenness maxima on the beds, >= 8 px apart; young trees: dark diamonds on the paving
    trees, taken = [], []
    strong = np.where(green > 30, green, 0).astype(np.float32)
    dil = cv2.dilate(strong, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    ys, xs = np.where((strong > 0) & (strong >= dil))
    for k in np.argsort(-strong[ys, xs]):
        x, y = xs[k], ys[k]
        if any((x - a) ** 2 + (y - b) ** 2 < 64 for a, b in taken):
            continue
        p = Point(*to_m(x, y))
        if site.contains(p) and not bld.buffer(2.0).contains(p) and not road_g.contains(p):
            taken.append((x, y)); trees.append([r2(p.x), r2(p.y)])
    lum = cv2.GaussianBlur((B + G + R) / 3, (0, 0), 1.2)
    dk = ((lum < 45) & (green < 25)).astype(np.uint8) * 255
    n, lab, st, cen = cv2.connectedComponentsWithStats(dk, 8)
    young = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if 12 <= a <= 90 and 0.6 < w / max(h, 1) < 1.6 and w <= 12 and h <= 12 and a / (w * h) > 0.35:
            p = Point(*to_m(*cen[i]))
            if paving_g.contains(p) and not bld.buffer(2.0).contains(p):
                young.append([r2(p.x), r2(p.y)])

    trees = [q for q in trees if not blvd.contains(Point(q))] + [q for q in btrees if strips.buffer(-0.5).contains(Point(q))]
    young = [q for q in young if not blvd.contains(Point(q))]

    # vertical curb faces: [x1, z1, x2, z2, nx, nz, z_bottom, z_top] with n pointing to the visible (lower) side
    soil_g = bed_g.buffer(-CURB_W, join_style='mitre')
    walls = []
    def faces(g, look_inside, zb, zt):
        for p in plist(g):
            for ring in [p.exterior, *p.interiors]:
                c = np.array(ring.coords)
                for (x1, z1), (x2, z2) in zip(c[:-1], c[1:]):
                    L = math.hypot(x2 - x1, z2 - z1)
                    if L < 0.02: continue
                    nx, nz = (z2 - z1) / L, -(x2 - x1) / L
                    inside = p.contains(Point((x1 + x2) / 2 + nx * 0.03, (z1 + z2) / 2 + nz * 0.03))
                    if inside != look_inside: nx, nz = -nx, -nz
                    walls.append([r2(x1), r2(z1), r2(x2), r2(z2), round(nx, 3), round(nz, 3), zb, zt])
    faces(road_g, True, Z_ROAD, Z_PAVE)
    faces(bed_g, False, Z_PAVE, Z_CURB)
    faces(soil_g, True, Z_SOIL, Z_CURB)

    out = {'note': 'tools/unreal/genplan.py from public/plan.jpg; scene metres (x right, z down, origin plan centre)',
           'site': rings(SITE)[0][0], 'road': rings(road_g), 'bed': rings(bed_g), 'soil': rings(soil_g), 'curb': rings(bed_g.difference(soil_g)), 'walls': walls,
           'z': {'pave': Z_PAVE, 'road': Z_ROAD, 'curb': Z_CURB, 'soil': Z_SOIL}, 'dark': rings(dark_g),
           'paving': rings(paving_g), 'under': rings(bld.buffer(2.0, join_style='mitre').intersection(site)), 'trees': trees, 'young': young,
           'blocks': {i: [r2(v) for v in np.array(b.exterior.coords)[:-1].ravel()] for i, b in blk}}
    OUT.mkdir(exist_ok=True)
    (OUT / 'genplan.json').write_text(json.dumps(out, separators=(',', ':')))
    print(f'road {road_g.area:.0f} m2, bed {bed_g.area:.0f} m2, dark {dark_g.area:.0f} m2, paving {paving_g.area:.0f} m2, '
          f'{len(trees)} trees, {len(young)} young, site {SITE.area:.0f} m2')

    # review picture: the plan at 2x with the classes drawn over it
    S = 2
    ov = cv2.resize(img, None, fx=S, fy=S, interpolation=cv2.INTER_CUBIC)
    lay = ov.copy()
    P = lambda g: [np.int32([[((x / PX) + CX) * S, ((z / PX) + CY) * S] for x, z in np.array(r.coords)]) for p in plist(g) for r in [p.exterior, *p.interiors]]
    for g, col in ((paving_g, (150, 160, 170)), (road_g, (60, 60, 60)), (bed_g, (40, 170, 60)), (dark_g, (120, 40, 140)), (bld, (245, 245, 245))):
        for p in plist(g):
            cv2.fillPoly(lay, P(p), col)
    ov = cv2.addWeighted(lay, 0.75, ov, 0.25, 0)
    for x, z in trees:
        cv2.circle(ov, (int((x / PX + CX) * S), int((z / PX + CY) * S)), 5, (0, 90, 0), -1)
    for x, z in young:
        cv2.circle(ov, (int((x / PX + CX) * S), int((z / PX + CY) * S)), 3, (0, 200, 255), -1)
    for i, b in blk:
        c = b.centroid
        cv2.putText(ov, str(i), (int((c.x / PX + CX) * S) - 8, int((c.y / PX + CY) * S) + 6), 0, 0.6, (0, 0, 255), 2)
    cv2.polylines(ov, P(SITE), True, (0, 0, 255), 1)
    cv2.imwrite(str(OUT / 'genplan_check.jpg'), ov, [cv2.IMWRITE_JPEG_QUALITY, 88])


if __name__ == '__main__':
    main()
