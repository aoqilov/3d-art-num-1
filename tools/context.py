"""Surroundings of the complex from a CADMapper DXF (OpenStreetMap data) → public/context/context.json.

What it writes (scene coordinates, metres: x = plan right, z = plan down, origin = centre of public/plan.jpg):
  buildings  every OSM building outside the site, with an estimated height (floors) and roof type
  road       asphalt area (union of road centre lines buffered by their class width), triangulated
  walk       sidewalk area (a band along the roads, minus road, buildings and the site), triangulated, top at +0.15 m
  curb       the road outline rings — the app raises a 15 cm curb along them
  paths      footpaths (paver strips at ground level), parks (lawns)
  dashes     centre-line dashes of the main roads, kept clear of junctions
  site       the site outline (plan.jpg is clipped to it once the surroundings are shown)

Georeferencing (see README notes in this file's history): the DXF was matched to public/sat.jpg on buildings and
roads, and plan_ctx.jpg to the satellite on the neighbouring towers and the main road. Result: the master plan is
rotated 15° counter-clockwise from north (plan "up" points 15° west of north, parallel to the towers east of the site) and its centre is DXF (486.72, 420.48).
Accuracy ≈ 5–10 m: fine for context, not for surveying.

Heights. A CADMapper file without "3D buildings" has none, so every house gets an estimate from its footprint
(see `estimate`). If the DXF has 3D buildings (polyline elevation/thickness, or 3DFACE/MESH entities), their height
wins. public/context/overrides.json (written by the in-app editor, ?edit=1) wins over both, in the app.

Usage: python3 tools/context.py path/to/cadmapper.dxf
Needs: pip install ezdxf shapely mapbox_earcut opencv-python-headless numpy
"""
import json
import math
import sys
from pathlib import Path

import cv2
import ezdxf
import mapbox_earcut as earcut
import numpy as np
from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.ops import unary_union

# ---------------------------------------------------------------- georeference
PHI = math.radians(15.0)           # plan rotated CCW from north
ORIGIN = (486.72, 420.48)          # DXF metres of the plan centre (moved 14 m so the site clears the main road)
PLAN_M_PER_PX = 251.6 / 740        # public/plan.jpg scale
# site outline traced on plan_ctx.jpg (px), see tools/context.py history
SITE_PX = [(28, 232), (132, 186), (250, 128), (350, 58), (480, 36), (540, 72), (610, 92), (616, 778), (232, 778), (228, 548), (48, 330)]

C, S = math.cos(PHI), math.sin(PHI)


def to_scene(X, Y):
    dx, dy = X - ORIGIN[0], Y - ORIGIN[1]
    return dx * C + dy * S, dx * S - dy * C


SITE = Polygon([((x - 370) * PLAN_M_PER_PX, (y - 410) * PLAN_M_PER_PX) for x, y in SITE_PX])

# ---------------------------------------------------------------- classes
ROAD_W = {'major_roads': 9.0, 'minor_roads': 5.5}       # carriageway width per centre line
WALK_W = {'major_roads': 3.5, 'minor_roads': 1.6}       # sidewalk width each side
PATH_W = 2.2
# the neighbouring high-rise complex east of the site (dark towers on sat.jpg; ~12 storeys judging by the shadows)
KNOWN = {i: 12 for i in (9, 1146, 999, 1100, 608, 465, 1019, 153, 474)}


def r2(v):
    return round(float(v), 2)


def estimate(poly):
    """floors, roof ('pitched' | 'flat') from the footprint alone"""
    a = poly.area
    (cx, cy), (w, l), _ = cv2.minAreaRect(np.float32(poly.exterior.coords))
    w, l = sorted((w, l))
    rect = a / max(w * l, 1e-6)                          # 1 = perfect rectangle
    if a < 160:
        return 1, 'pitched' if rect > 0.75 else 'flat'
    if a < 350:
        return 2, 'pitched' if rect > 0.85 else 'flat'
    if w > 40:
        return 2, 'flat'                                 # sheds, markets, schools: big & low
    if l / max(w, 1) > 2.2 and 9 <= w <= 20:
        return 5, 'flat'                                 # slab blocks
    if a < 1200:
        return 3, 'flat'
    return 5, 'flat'


def load(path):
    d = ezdxf.readfile(path)
    layers, heights = {}, {}
    for e in d.modelspace():
        if e.dxftype() != 'LWPOLYLINE':
            continue
        pts = [to_scene(x, y) for x, y in e.get_points('xy')]
        idx = len(layers.setdefault(e.dxf.layer, []))
        layers[e.dxf.layer].append(pts)
        h = float(e.dxf.get('thickness', 0) or 0)
        if e.dxf.layer == 'buildings' and h > 0.5:
            heights[idx] = h
    return layers, heights


def tri(geom, y=None):
    """earcut every polygon of geom → (flat xz list, index list)"""
    polys = list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom] if not geom.is_empty else []
    V, I = [], []
    for p in polys:
        if p.area < 0.5:
            continue
        p = p.simplify(0.05)
        rings = [np.array(p.exterior.coords)[:-1]] + [np.array(r.coords)[:-1] for r in p.interiors]
        rings = [r for r in rings if len(r) >= 3]
        verts = np.vstack(rings).astype(np.float64)
        ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
        t = earcut.triangulate_float64(verts, ends)
        base = len(V) // 2
        V += [r2(v) for v in verts.ravel()]
        I += [int(i) + base for i in t]
    return {'v': V, 'i': I}


def rings(geom):
    polys = list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom]
    out = []
    for p in polys:
        for r in [p.exterior, *p.interiors]:
            c = np.array(r.simplify(0.05).coords)
            if len(c) > 3:
                out.append([r2(v) for v in c.ravel()])
    return out


def main(path, out_dir):
    L, H3d = load(path)
    site_clear = SITE.buffer(2.0)
    bounds = unary_union([Polygon(p) for p in L['buildings'] if len(p) >= 3]).envelope

    # buildings
    blds, bpolys = [], []
    for i, pts in enumerate(L['buildings']):
        if len(pts) < 3:
            continue
        p = Polygon(pts).buffer(0)
        if p.is_empty or p.area < 8 or p.intersects(site_clear):
            continue
        if isinstance(p, MultiPolygon):
            p = max(p.geoms, key=lambda g: g.area)
        floors, roof = estimate(p)
        src = 'est'
        if i in H3d:
            floors, src = max(1, round(H3d[i] / 3.0)), 'osm'
        if i in KNOWN:
            floors, roof, src = KNOWN[i], 'flat', 'est'
        q = p.simplify(0.15)
        if not q.exterior.is_ccw:                        # one winding for the app
            q = Polygon(list(q.exterior.coords)[::-1])
        blds.append({'id': f'b{i}', 'p': [r2(v) for v in np.array(q.exterior.coords)[:-1].ravel()],
                     'f': floors, 'r': roof, 's': src, 'a': round(p.area)})
        bpolys.append(p)
    built = unary_union(bpolys)

    # roads & sidewalks
    lines = {k: [LineString(p) for p in L.get(k, []) if len(p) >= 2] for k in ROAD_W}
    road = unary_union([ln.buffer(ROAD_W[k] / 2, cap_style='flat', join_style='round') for k in ROAD_W for ln in lines[k]])
    # extend road ends a little so dead ends meet the junction cleanly
    road = unary_union([road] + [ln.buffer(ROAD_W[k] / 2, cap_style='round') for k in ROAD_W for ln in lines[k]])
    walk = unary_union([ln.buffer(ROAD_W[k] / 2 + WALK_W[k], cap_style='round', join_style='round') for k in ROAD_W for ln in lines[k]])
    clip = bounds.buffer(-1)
    road = road.intersection(clip).difference(site_clear)
    walk = walk.difference(road).difference(built.buffer(0.3)).difference(site_clear).intersection(clip)
    walk = walk.buffer(-0.01).buffer(0.01)               # drop slivers
    walk = MultiPolygon([g for g in (walk.geoms if isinstance(walk, MultiPolygon) else [walk]) if g.area > 2]) if not walk.is_empty else walk

    paths = unary_union([LineString(p).buffer(PATH_W / 2) for p in L.get('paths', []) if len(p) >= 2])
    paths = paths.difference(road).difference(walk).difference(built).difference(site_clear)
    parks = unary_union([Polygon(p).buffer(0) for p in L.get('parks', []) if len(p) >= 3]).difference(site_clear)

    # centre-line dashes on main roads, kept 14 m clear of junctions
    nodes = []
    allines = [ln for k in ROAD_W for ln in lines[k]]
    for a_i, a in enumerate(allines):
        for b in allines[a_i + 1:]:
            x = a.intersection(b)
            if not x.is_empty:
                nodes += [g for g in getattr(x, 'geoms', [x]) if g.geom_type == 'Point']
        nodes += [a.interpolate(0), a.interpolate(a.length)]
    clear = unary_union([n.buffer(14) for n in nodes]).union(site_clear.buffer(10))
    dashes = []
    for ln in lines['major_roads']:
        d = 2.0
        while d + 3 < ln.length:
            seg = LineString([ln.interpolate(d), ln.interpolate(d + 3)])
            if not seg.intersects(clear) and seg.within(road):
                (x0, z0), (x1, z1) = seg.coords
                dashes.append([r2(x0), r2(z0), r2(x1), r2(z1)])
            d += 9

    # trees. Street trees: on the sidewalk's outer edge every ~9 m (poplars on main roads, plane trees elsewhere).
    # Yard trees: Tashkent mahalla houses stand in walled yards full of fruit trees — 1–3 per small house.
    import random
    rnd = random.Random(5)
    from shapely.geometry import Point
    blocked = unary_union([road, built.buffer(1.2), site_clear.buffer(3)])
    street = []
    for k in ROAD_W:
        for ln in lines[k]:
            for side in (1, -1):
                off = ln.offset_curve(side * (ROAD_W[k] / 2 + WALK_W[k] - 0.7))
                if off.is_empty or off.geom_type != 'LineString':
                    continue
                d = rnd.uniform(2, 6)
                while d < off.length:
                    pt = off.interpolate(d)
                    if clip.contains(pt) and not blocked.contains(pt) and not pt.intersects(clear) and \
                            all(pt.distance(Point(q[0], q[1])) > 6 for q in street[-6:]):
                        street.append([r2(pt.x), r2(pt.y), 0 if k == 'major_roads' else 1])
                    d += rnd.uniform(11, 14)
    yard = []
    free = clip.difference(unary_union([road.buffer(0.8), walk, built.buffer(1.0), site_clear.buffer(4)]))
    for bp, b in zip(bpolys, blds):
        if b['a'] > 350:
            continue
        n = 1 + int(rnd.random() * 2.6)
        c = bp.centroid
        for _ in range(n * 8):
            if n <= 0:
                break
            ang, dist = rnd.uniform(0, 6.283), rnd.uniform(4, 9)
            pt = Point(c.x + dist * math.cos(ang), c.y + dist * math.sin(ang))
            if free.contains(pt) and all(pt.distance(Point(q[0], q[1])) > 3.5 for q in yard[-12:]):
                yard.append([r2(pt.x), r2(pt.y)])
                n -= 1

    # street lamps on the sidewalk next to the curb, arm over the road: main roads both sides staggered every
    # ~30 m, side streets one side every ~35 m
    lamps = []
    road_core = road.buffer(0.3)
    for k in ROAD_W:
        for ln in lines[k]:
            sides = (1, -1) if k == 'major_roads' else (1,)
            step = 30 if k == 'major_roads' else 35
            for si, side in enumerate(sides):
                off = ln.offset_curve(side * (ROAD_W[k] / 2 + 0.45))
                if off.is_empty or off.geom_type != 'LineString':
                    continue
                d = 6 + si * step / 2
                while d < off.length:
                    pt = off.interpolate(d)
                    # only on the road's outer edge: a dual carriageway is two centre lines, and the inner offset
                    # of one lands on the other carriageway — anything on or next to the asphalt is skipped
                    if clip.contains(pt) and not road_core.contains(pt) and not built.buffer(0.8).contains(pt) and \
                            not site_clear.buffer(2).contains(pt) and all(pt.distance(Point(q[0], q[1])) > 12 for q in lamps):
                        near = ln.interpolate(ln.project(pt))
                        ax, az = near.x - pt.x, near.y - pt.y
                        l = math.hypot(ax, az) or 1
                        lamps.append([r2(pt.x), r2(pt.y), round(ax / l, 3), round(az / l, 3)])
                    d += step

    out = {
        'note': 'generated by tools/context.py from a CADMapper DXF (© OpenStreetMap contributors)',
        'lamps': lamps,
        'streetTrees': street, 'yardTrees': yard,
        'site': [r2(v) for v in np.array(SITE.exterior.coords)[:-1].ravel()],
        'buildings': blds,
        'road': tri(road), 'walk': tri(walk), 'curb': rings(road),
        'paths': tri(paths), 'parks': tri(parks), 'dashes': dashes,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    f = out_dir / 'context.json'
    f.write_text(json.dumps(out, separators=(',', ':')))
    ov = out_dir / 'overrides.json'
    if not ov.exists():
        ov.write_text('{}\n')
    n_est = sum(b['s'] == 'est' for b in blds)
    print(f'{len(street)} street trees, {len(yard)} yard trees, {len(lamps)} street lamps')
    print(f'{f}: {len(blds)} buildings ({len(blds) - n_est} with height from the file, {n_est} estimated), '
          f'road {road.area / 1e4:.2f} ha, sidewalk {walk.area / 1e4:.2f} ha, {len(dashes)} dashes, {f.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main(sys.argv[1], Path(sys.argv[2] if len(sys.argv) > 2 else 'public/context'))
