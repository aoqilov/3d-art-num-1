"""Apartment entrance doors of the type-4 block: which opening, which jamb carries the hinges, which way it swings.
Openings come from plan_t4.json; the hinge side is read from the door leaf drawn in the floor-plan raster
(1 px = 1 cm, same origin as the plan extraction). Writes src/block/data/entries_t4.json.
Usage: python3 tools/entry_doors.py <raster dir with r5.png, r13.png> [debug png prefix]
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw
from shapely.geometry import Polygon, Point

RASTER = sys.argv[1]
DEBUG = sys.argv[2] if len(sys.argv) > 2 else None
PLAN = json.load(open('src/block/data/plan_t4.json'))
PAGES = {'2': (5, (766, 772)), '3': (13, (739, 862))}   # plan key -> (pdf page, raster origin of plan (0,0))


def room_at(p, x, y):
    for r in p['rooms']:
        o = r['poly']['outer']
        if Polygon(o, r['poly'].get('holes', [])).contains(Point(x, y)):
            return r
    return None


def line_score(a, ox, oy, pts, across):
    """How many sample points sit on a thin dark line (darker than both neighbours across the line)."""
    hits = 0
    for (x, y) in pts:
        px, py = int(round(ox + x * 100)), int(round(oy + y * 100))
        best = 0
        for d in range(-6, 7):                        # tolerate a few cm of drawing offset
            qx, qy = px + across[0] * d, py + across[1] * d
            c = a[qy, qx].mean()
            l = a[qy - across[1] * 3, qx - across[0] * 3].mean()
            r = a[qy + across[1] * 3, qx + across[0] * 3].mean()
            if l - c > 12 and r - c > 12:
                best = 1
                break
        hits += best
    return hits / max(1, len(pts))


out = {}
for key, (page, (ox, oy)) in PAGES.items():
    p = PLAN[key]
    a = np.asarray(Image.open(f'{RASTER}/r{page}.png').convert('RGB')).astype(np.int16)
    doors = []
    for o in p['openings']:
        if o['kind'] not in ('door', 'open'):
            continue
        cx, cy = (o['x0'] + o['x1']) / 2, (o['y0'] + o['y1']) / 2
        if o['axis'] == 'x':          # opening spans along x: wall runs along x, depth along y
            s1, s2 = room_at(p, cx, o['y0'] - 0.25), room_at(p, cx, o['y1'] + 0.25)
        else:
            s1, s2 = room_at(p, o['x0'] - 0.25, cy), room_at(p, o['x1'] + 0.25, cy)
        sides = [(s1, -1), (s2, 1)]
        apt = [s for s in sides if s[0] and s[0]['apt'] is not None]
        pub = [s for s in sides if s[0] and s[0]['apt'] is None and s[0]['kind'] not in ('lift',)]
        if len(apt) != 1 or len(pub) != 1:
            continue
        sign = pub[0][1]                                   # corridor on the low (-1) or high (+1) side
        if o['axis'] == 'x':
            n = (0, sign); face = o['y0'] if sign < 0 else o['y1']; back = o['y1'] if sign < 0 else o['y0']
            span = o['x1'] - o['x0']; jambs = [((o['x0'], face), (1, 0)), ((o['x1'], face), (-1, 0))]
        else:
            n = (sign, 0); face = o['x0'] if sign < 0 else o['x1']; back = o['x1'] if sign < 0 else o['x0']
            span = o['y1'] - o['y0']; jambs = [((face, o['y0']), (0, 1)), ((face, o['y1']), (0, -1))]
        scores = []
        for (jx, jy), u in jambs:
            pts = [(jx + u[0] * 0.04 + n[0] * t * span, jy + u[1] * 0.04 + n[1] * t * span) for t in np.linspace(0.18, 0.85, 26)]
            across = (abs(u[0]), abs(u[1]))
            scores.append(line_score(a, ox, oy, pts, across))
        k = int(np.argmax(scores))
        (hx, hy), u = jambs[k]
        doors.append(dict(apt=apt[0][0]['apt'], hinge=[round(hx, 3), round(hy, 3)], u=list(u), n=list(n), span=round(span, 3),
                          depth=round(abs(face - back), 3), axis=o['axis'], score=[round(v, 2) for v in scores]))
    doors.sort(key=lambda d: d['apt'])
    out[key] = doors
    print(key, len(doors), [(d['apt'], d['score']) for d in doors])
    if DEBUG:
        im = Image.open(f'{RASTER}/r{page}.png').convert('RGB'); dr = ImageDraw.Draw(im)
        for d in doors:
            hx, hy = d['hinge']; u = d['u']; n = d['n']; s = d['span']
            P = lambda x, y: (ox + x * 100, oy + y * 100)
            dr.line([P(hx, hy), P(hx + n[0] * s, hy + n[1] * s)], fill=(255, 0, 0), width=5)
            dr.line([P(hx, hy), P(hx + u[0] * s, hy + u[1] * s)], fill=(0, 160, 0), width=5)
        fx0, fy0 = ox + 450, oy + 550
        im.crop((fx0, fy0, fx0 + 2100, fy0 + 650)).save(f'{DEBUG}{key}.png')
json.dump(out, open('src/block/data/entries_t4.json', 'w'), indent=1)
