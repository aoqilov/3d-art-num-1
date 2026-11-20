"""Underground car park (one level under the whole site; owner 2026-11-20) -> out/parking.json (+ out/parking_check.jpg).
Web scene metres (genplan2 frame) converted to Blender metres of Unreal space (x = ue_x/100, y = -ue_y/100), like ground.glb.
  floor     z -3.60 (the 3 courtyard ramps end there), ceiling underside -0.35 (courtyard slab), walls on the outline
  grid      plan-aligned bays: stall 5.3 | aisle 6.0 | stall 5.3 (16.6 m), stalls 2.5 m, columns 0.6 m on the back lines
            every 3 stalls; cross aisles every 48 m; stalls only where their aisle cell is free
  obstacles ramp trenches (+1 m) and their landings (8 m beyond the ramp end), lift/stair cores of every block
            (basement core = stair + 2 lifts, lift doors on its +x side, a 2.2 m lobby in front)
  lights    ceiling fixture over every free aisle cell (emissive), a point light over every second one
Usage: python tools/unreal/parking_layout.py   (after genplan2.py)
"""
import json, math, os, sys
import numpy as np
from shapely.geometry import Polygon, Point, LineString, box, MultiPolygon
from shapely.ops import unary_union
from shapely import affinity
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import genplan2 as gp
G = json.load(open(os.path.join(HERE, 'out', 'genplan.json')))
Z_FLOOR, Z_CEIL = -3.6, -0.35
STALL_L, STALL_W, AISLE = 5.3, 2.5, 6.0
BAY = 2 * STALL_L + AISLE
CROSS = 48.0

def B(x, z):                                    # web metres -> Blender metres (Unreal space)
    ux, uy = gp.web_to_ue(x, z); return [round(ux / 100, 3), round(-uy / 100, 3)]

site = gp.SITE.buffer(-1.5, join_style='mitre')
# ramps: trench polygon + landing
ramps, landings, ramp_ends = [], [], []
for x0, z0, x1, z1, w, dep in G['ramps']:
    a, b = np.array([x0, z0]), np.array([x1, z1]); d = (b - a) / np.linalg.norm(b - a)
    ramps.append(LineString([tuple(a), tuple(b)]).buffer(w / 2 + 0.3, cap_style='flat'))
    landings.append(LineString([tuple(b), tuple(b + d * 8)]).buffer(w / 2 + 0.5, cap_style='flat'))
    ramp_ends.append((a, d, w))
ramp_g = unary_union(ramps)
# the trench outline's bottom edge is where the ramp enters the car park: no wall there (owner 2026-11-21: "exit closed")
mouths = []
for x0, z0, x1, z1, w, dep in G['ramps']:
    b = np.array([x1, z1]); d = (b - np.array([x0, z0])); d /= np.linalg.norm(d); n_ = np.array([-d[1], d[0]])
    mouths.append(LineString([tuple(b - n_ * (w / 2 + 0.5)), tuple(b + n_ * (w / 2 + 0.5))]))
# lift cores (block plan metres): stair + lifts x 9.6..17.0, y 10.3..16.4; lobby in front of the lift doors x 17.0..19.2
cores, lobbies, doors = [], [], []
for i in gp.BLOCKS:
    poly = lambda x0, y0, x1, y1: Polygon([gp.web_xz(i, x, y) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))])
    cores.append(poly(9.6, 10.3, 17.0, 16.4)); lobbies.append(poly(17.0, 10.3, 19.2, 16.4))
    doors.append([gp.web_xz(i, 17.0, 11.9), gp.web_xz(i, 17.0, 14.6), gp.web_xz(i, 18.0, 11.9)])   # two lift doors + facing point
obst = unary_union(ramps + landings + [c.buffer(1.0) for c in cores] + [l.buffer(0.5) for l in lobbies])
inner = site.buffer(-0.3)

minx, minz, maxx, maxz = site.bounds
stalls, cols, aisles = [], [], []
z = minz + 0.3
while z + BAY < maxz:
    for xs in np.arange(minx, maxx, CROSS):
        x = xs + AISLE                                     # cross aisle at the start of every 48 m block
        while x + STALL_W * 3 <= min(xs + CROSS, maxx):
            cell = box(x, z + STALL_L, x + 3 * STALL_W, z + STALL_L + AISLE)
            if inner.contains(cell) and not cell.intersects(obst):
                aisles.append(cell)
                for k in range(3):
                    for z0 in (z, z + STALL_L + AISLE):
                        s = box(x + k * STALL_W, z0, x + (k + 1) * STALL_W, z0 + STALL_L)
                        if inner.contains(s) and not s.intersects(obst): stalls.append(s)
            x += 3 * STALL_W
    z += BAY
# columns on the back lines (z = bay edges), every 3 stalls, only where they touch a stall and miss aisles / obstacles
aisle_g = unary_union(aisles) if aisles else Polygon()
stall_g = unary_union(stalls) if stalls else Polygon()
z = minz + 0.3
while z <= maxz:
    for xs in np.arange(minx, maxx, CROSS):
        x = xs + AISLE
        while x <= min(xs + CROSS, maxx):
            c = Point(x, z).buffer(0.3, cap_style='square')
            if inner.contains(c) and c.buffer(0.2).intersects(stall_g) and not c.intersects(aisle_g) and not c.intersects(obst):
                cols.append((x, z))
            x += 3 * STALL_W
    z += BAY

floor = site.difference(ramp_g)
walls = []                                                  # outline faces, inward normal
for p in (floor.geoms if isinstance(floor, MultiPolygon) else [floor]):
    for ring in [p.exterior, *p.interiors]:
        c = np.array(ring.coords)
        for (x1, z1), (x2, z2) in zip(c[:-1], c[1:]):
            L = math.hypot(x2 - x1, z2 - z1)
            if L < 0.05: continue
            if any(m.distance(Point((x1 + x2) / 2, (z1 + z2) / 2)) < 0.3 for m in mouths): continue
            nx, nz = (z2 - z1) / L, -(x2 - x1) / L
            if not p.contains(Point((x1 + x2) / 2 + nx * 0.05, (z1 + z2) / 2 + nz * 0.05)): nx, nz = -nx, -nz
            walls.append(B(x1, z1) + B(x2, z2) + B((x1 + x2) / 2 + nx, (z1 + z2) / 2 + nz))
lines = []                                                  # stall paint: the two sides + the back of every stall
for s in stalls:
    x0, z0, x1, z1 = s.bounds
    for a, b in (((x0, z0), (x0, z1)), ((x1, z0), (x1, z1))):
        lines.append(B(*a) + B(*b))
lights, fix = [], []
for k, a in enumerate(aisles):
    c = a.centroid
    fix.append(B(c.x, c.y))
    if k % 2 == 0: lights.append(B(c.x, c.y))

def rings(g):
    out = []
    for p in (g.geoms if isinstance(g, MultiPolygon) else [g]):
        if p.is_empty: continue
        out.append([[B(x, z) for x, z in list(r.coords)[:-1]] for r in [p.exterior, *p.interiors]])
    return out
out = {'z_floor': Z_FLOOR, 'z_ceil': Z_CEIL, 'floor': rings(floor), 'walls': walls,
       'cols': [B(x, z) for x, z in cols], 'lines': lines, 'lights': lights, 'fixtures': fix,
       'cores': [[B(x, z) for x, z in list(c.exterior.coords)[:-1]] for c in cores],
       'lobbies': [[B(x, z) for x, z in list(l.exterior.coords)[:-1]] for l in lobbies],
       'doors': [[B(*d[0]), B(*d[1]), B(*d[2])] for d in doors],
       'ramp_heads': [B(*(a - d)) + B(*(a + np.array([-d[1], d[0]]) * (w / 2 + 0.3))) + B(*(a - np.array([-d[1], d[0]]) * (w / 2 + 0.3))) for a, d, w in ramp_ends],
       'stalls': len(stalls)}
json.dump(out, open(os.path.join(HERE, 'out', 'parking.json'), 'w'))
print('stalls', len(stalls), 'columns', len(cols), 'aisle cells', len(aisles), 'lights', len(lights), 'floor m2', round(floor.area))

import cv2
S = 2; PX, CX, CY = gp.PX, gp.CX, gp.CY
img = np.full((820 * S, 740 * S, 3), 255, np.uint8)
P = lambda g: [np.int32([[(x / PX + CX) * S, (z / PX + CY) * S] for x, z in np.array(r.coords)]) for r in [g.exterior, *g.interiors]]
def fill(g, col):
    for p in (g.geoms if hasattr(g, 'geoms') else [g]):
        if not p.is_empty: cv2.fillPoly(img, P(p), col)
fill(floor, (200, 200, 200)); fill(aisle_g, (150, 150, 150))
for s in stalls: cv2.polylines(img, P(s), True, (60, 60, 60), 1)
fill(ramp_g, (40, 40, 160)); fill(unary_union(landings), (120, 120, 220))
for c in cores: fill(c, (0, 120, 200))
for l in lobbies: fill(l, (0, 200, 255))
for x, z in cols: cv2.circle(img, (int((x / PX + CX) * S), int((z / PX + CY) * S)), 2, (0, 0, 0), -1)
for i, b in G['blocks'].items():
    q = np.array(b).reshape(-1, 2); cv2.polylines(img, [np.int32([[(x / PX + CX) * S, (z / PX + CY) * S] for x, z in q])], True, (0, 0, 255), 1)
cv2.putText(img, '%d joy' % len(stalls), (30, 60), 0, 1.4, (0, 0, 200), 3)
cv2.imwrite(os.path.join(HERE, 'out', 'parking_check.jpg'), img, [cv2.IMWRITE_JPEG_QUALITY, 88])
