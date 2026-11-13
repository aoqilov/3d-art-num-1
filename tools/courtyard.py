"""Landscaping inside the site, read from the master-plan picture (public/plan.jpg) → public/context/courtyard.json.

The picture is tinted teal all over, so classes come from simple colour rules (0.34 m per pixel):
  green  (G − B high)          → planted beds and lawns (raised 15 cm behind a curb), with trees on them
  bright green blobs            → tree crowns (one tree per blob centre, crown radius from the blob size)
  small dark diamonds on paving → young street trees in the paving
  all other open ground         → grey pavers (the app paves the whole site outline under the beds)
White building footprints and the blocks themselves are left out. Coordinates: scene metres, origin = plan centre.

Usage: python3 tools/courtyard.py            (reads public/plan.jpg and src/data/blocks.ts)
"""
import json
import math
import re
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union
from shapely import affinity

from context import SITE, PLAN_M_PER_PX, tri, rings, r2

ROOT = Path(__file__).resolve().parent.parent
PX = PLAN_M_PER_PX
CX, CY = 370, 410                                     # plan centre in px


def to_m(x, y):
    return (x - CX) * PX, (y - CY) * PX


def blocks():
    src = (ROOT / 'src/data/blocks.ts').read_text()
    out = []
    for m in re.finditer(r'x: ([-\d.]+), z: ([-\d.]+), w: ([\d.]+), d: ([\d.]+), rot: ([-\d.]+)', src):
        x, z, w, d, r = map(float, m.groups())
        b = box(-w / 2 - 1.2, -d / 2 - 1.2, w / 2 + 1.2, d / 2 + 1.2)
        # three.js rotation.y = r maps local (lx, lz) → (lx cos r + lz sin r, −lx sin r + lz cos r)
        b = affinity.rotate(b, -r, origin=(0, 0), use_radians=True)
        out.append(affinity.translate(b, x, z))
    return unary_union(out)


def polys_from_mask(mask, min_area_m2):
    cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    if hier is None:
        return out
    for i, c in enumerate(cs):
        if hier[0][i][3] != -1 or len(c) < 3:
            continue                                   # holes are attached to their parent below
        c = cv2.approxPolyDP(c, 0.8, True)
        if len(c) < 3:
            continue
        shell = [to_m(*q[0]) for q in c]
        holes = []
        k = hier[0][i][2]
        while k != -1:
            h = cv2.approxPolyDP(cs[k], 0.8, True)
            if len(h) >= 3:
                holes.append([to_m(*q[0]) for q in h])
            k = hier[0][k][0]
        p = Polygon(shell, holes).buffer(0)
        if p.area >= min_area_m2:
            out.append(p)
    return out


def main():
    img = cv2.imread(str(ROOT / 'public/plan.jpg')).astype(np.float32)
    B, G, R = img[..., 0], img[..., 1], img[..., 2]
    green = cv2.GaussianBlur(G - B, (0, 0), 1.5)
    lum = cv2.GaussianBlur((B + G + R) / 3, (0, 0), 1.2)
    white = (B > 200) & (G > 200) & (R > 200)

    site = SITE.buffer(-0.5)
    bld = blocks()

    # planted beds: greenish, closed up into continuous beds, small specks dropped
    veg = ((green > 17) & ~white).astype(np.uint8) * 255
    veg = cv2.morphologyEx(veg, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    veg = cv2.morphologyEx(veg, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    lawn = unary_union(polys_from_mask(veg, 4.0)).intersection(site).difference(bld)
    lawn = lawn.buffer(0.9, join_style="round").buffer(-0.9, join_style="round").simplify(0.1)   # round off the pixel steps

    # trees: local maxima of greenness on the beds, at least ~3 m apart
    trees = []
    strong = np.where(green > 30, green, 0).astype(np.float32)
    dil = cv2.dilate(strong, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    ys, xs = np.where((strong > 0) & (strong >= dil))
    order = np.argsort(-strong[ys, xs])
    taken = []
    for k in order:
        x, y = xs[k], ys[k]
        if any((x - a) ** 2 + (y - b) ** 2 < 8 ** 2 for a, b in taken):
            continue
        mx, mz = to_m(x, y)
        pt = Point(mx, mz)
        if not site.contains(pt) or bld.contains(pt):
            continue
        # crown size from how far the green blob extends
        reach = 3
        while reach < 9 and green[min(y + reach, green.shape[0] - 1), x] > 22 and green[max(y - reach, 0), x] > 22:
            reach += 1
        taken.append((x, y))
        trees.append([r2(mx), r2(mz), r2(min(3.2, max(1.4, reach * PX * 0.9)))])

    # young street trees: small dark compact blobs (the ◆ symbols) on paving
    dark = ((lum < 45) & (green < 25)).astype(np.uint8) * 255
    n, lab, stats, cent = cv2.connectedComponentsWithStats(dark, 8)
    young = []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if 12 <= a <= 90 and 0.6 < w / max(h, 1) < 1.6 and w <= 12 and h <= 12 and a / (w * h) > 0.35:
            mx, mz = to_m(*cent[i])
            pt = Point(mx, mz)
            if site.contains(pt) and not bld.contains(pt) and not lawn.contains(pt):
                young.append([r2(mx), r2(mz)])

    # path lamps: on the paving along the planted beds, at least 12 m apart, clear of the blocks
    import random
    rnd = random.Random(3)
    paving = site.buffer(-1.5).difference(bld.buffer(2.5)).difference(lawn)
    edge = lawn.buffer(2.2).difference(lawn) if not lawn.is_empty else paving
    lamps = []
    minx, minz, maxx, maxz = site.bounds
    z = minz
    while z < maxz:
        x = minx
        while x < maxx:
            pt = Point(x + rnd.uniform(-3, 3), z + rnd.uniform(-3, 3))
            if paving.contains(pt) and edge.contains(pt) and all(pt.distance(Point(q[0], q[1])) > 10 for q in lamps):
                lamps.append([r2(pt.x), r2(pt.y)])
            x += 7
        z += 7

    out = {
        'note': 'generated by tools/courtyard.py from public/plan.jpg',
        'lamps': lamps,
        'lawn': tri(lawn), 'lawnRings': rings(lawn) if not lawn.is_empty else [],
        'trees': trees, 'young': young,
    }
    f = ROOT / 'public/context/courtyard.json'
    f.write_text(json.dumps(out, separators=(',', ':')))
    print(f'{f.name}: lawn {lawn.area:.0f} m², {len(lamps)} path lamps, {len(trees)} trees, {len(young)} young trees, '
          f'site {SITE.area:.0f} m², {f.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
