# Night facade lighting of the type-4 block, as approved in the web app (src/block/nightLights.ts, owner's night render):
#   vertical LED lines on the solid piers of the outer walls (canopy 3.75 m -> parapet), one per ~4.2 m of free wall
#   LED crown: two bands round the roof edge; gold accent lines on the portal frame; LED strip under the shop canopy
# -> tools/unreal/out/blok_night.glb, pivot = block plan origin (like Blok_Lite), plan (x, y) -> Blender (x, -y).
# Slots: M_Led (warm white), M_LedGold. Unreal makes them emissive (ue_scripts/night_setup.py).
#   D:/blender-program/blender.exe -b --factory-startup -P tools/unreal/build_night.py
import bpy, bmesh, json, math, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PLAN = json.load(open(os.path.join(ROOT, 'src', 'block', 'data', 'plan_t4.json')))['3']
BLOCK_W, ROOF_Z = 29.7, 48.0
fp = PLAN['footprint']['outer']

def inside(x, y, poly=fp):
    c = False; n = len(poly)
    for i in range(n):
        (ax, ay), (bx, by) = poly[i], poly[(i + 1) % n]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax: c = not c
    return c

bpy.ops.wm.read_factory_settings(use_empty=True)
me = bpy.data.meshes.new('blok_night'); bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
for n in ('M_Led', 'M_LedGold', 'M_LedWash'):
    m = bpy.data.materials.new(n); me.materials.append(m)

def box(x0, y0, x1, y1, z0, z1, mi):
    """axis-aligned box in plan coords"""
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r['verts']:
        v.co.x = (x0 + x1) / 2 + v.co.x * max(abs(x1 - x0), 0.02)
        v.co.y = -((y0 + y1) / 2 + v.co.y * max(abs(y1 - y0), 0.02))
        v.co.z = (z0 + z1) / 2 + v.co.z * (z1 - z0)
    for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = mi

piers = []
for i in range(len(fp)):
    (ax, ay), (bx, by) = fp[i], fp[(i + 1) % len(fp)]
    L = math.hypot(bx - ax, by - ay)
    if L < 0.3: continue
    tx, ty = (bx - ax) / L, (by - ay) / L; nx, ny = ty, -tx
    mx, my = (ax + bx) / 2, (ay + by) / 2
    if inside(mx + nx * 0.05, my + ny * 0.05): nx, ny = -nx, -ny
    o = 0.035                                             # LED crown: 2 bands
    for z0, z1 in ((ROOF_Z + 1.12, ROOF_Z + 1.18), (ROOF_Z - 0.06, ROOF_Z)):
        box(min(ax, bx) + nx * o - 0.01, min(ay, by) + ny * o - 0.01, max(ax, bx) + nx * o + 0.01, max(ay, by) + ny * o + 0.01, z0, z1, 0)
    if L < 0.6: continue
    along = lambda x, y: (x - ax) * tx + (y - ay) * ty
    near = lambda x, y: abs((x - ax) * nx + (y - ay) * ny) < 0.4
    blocked = []
    for r in PLAN['windows'] + [o_ for o_ in PLAN['openings'] if o_.get('kind') != 'lift']:
        cs = [(r['x0'], r['y0']), (r['x1'], r['y0']), (r['x0'], r['y1']), (r['x1'], r['y1'])]
        if not any(near(*c) for c in cs): continue
        ss = [along(*c) for c in cs]; blocked.append((min(ss) - 0.08, max(ss) + 0.08))
    for rl in PLAN['rails']:
        p, q = ((rl['lo'], rl['off']), (rl['hi'], rl['off'])) if rl['axis'] == 'h' else ((rl['off'], rl['lo']), (rl['off'], rl['hi']))
        if not (near(*p) and near(*q)): continue
        a, b = along(*p), along(*q); blocked.append((min(a, b) - 0.1, max(a, b) + 0.1))
    blocked.sort(); s0 = 0.12; free = []
    for b0, b1 in blocked + [(L - 0.12, L - 0.12)]:
        if b0 > s0: free.append((s0, min(b0, L - 0.12)))
        s0 = max(s0, b1)
    for f0, f1 in free:
        w = f1 - f0
        if w < 0.5: continue
        n = max(1, int(w / 4.2))
        for k in range(n):
            sc = f0 + w * (k + 0.5) / n; x, y = ax + tx * sc, ay + ty * sc
            if ny < -0.5 and y < 0.6 and 11.4 < x < 18.3: continue          # portal frame has its own gold lines
            piers.append((x, y, nx, ny))
Z0, Z1 = 3.75, ROOF_Z + 1.15
for x, y, nx, ny in piers:                                # 3.5 x 3 cm line standing 2 cm off the wall
    cx, cy = x + nx * 0.03, y + ny * 0.03
    hx, hy = (0.0175, 0.015) if abs(ny) > abs(nx) else (0.015, 0.0175)
    box(cx - hx, cy - hy, cx + hx, cy + hy, Z0, Z1, 0)
# soft wash of every line on the wall (owner 2026-11-20: "blur, scattered", not a hard line): a 2.4 m wide plane 1.5 cm
# off the wall; UV u = across (0..1), v = along (0 bottom .. 1 top); the Unreal material draws the falloff (additive)
QW = 3.2
def wash(x, y, nx, ny, z0, z1, w=QW, mi=2):
    tx, ty = -ny, nx; ox, oy = x + nx * 0.015, y + ny * 0.015
    vs = [bm.verts.new((ox + tx * s_ * w / 2, -(oy + ty * s_ * w / 2), z)) for s_, z in ((-1, z0), (1, z0), (1, z1), (-1, z1))]
    f = bm.faces.new(vs if (nx * 0 + 1) else vs); f.material_index = mi
    for lp, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): lp[uvl].uv = uv
    if (f.normal.x * nx - f.normal.y * ny) < 0: f.normal_flip()
# 2026-11-20: the wash planes looked like bright bars (auto exposure lifts them; balconies cut holes). Replaced by real
# tube lights along every line (ue_scripts/night_setup.py reads out/night_piers.json); planes kept only behind WASH_PLANES.
if os.environ.get('WASH_PLANES'):
    for x, y, nx, ny in piers: wash(x, y, nx, ny, Z0, Z1)
json.dump({'piers': [[round(v, 3) for v in p_] for p_ in piers], 'z0': Z0, 'z1': Z1}, open(os.path.join(HERE, 'out', 'night_piers.json'), 'w'))
cx, bx0, bx1, fy, PW, IN = BLOCK_W / 2, 12.42, 17.32, -1.47, 0.75, 0.29
for x in (bx0 - PW, bx0 + IN, bx1 - IN, bx1 + PW): box(x - 0.02, fy - 0.06, x + 0.02, fy - 0.02, 5.7, 21.05, 1)
box(bx0 - PW, fy - 0.16, bx1 + PW, fy - 0.12, 21.05, 21.1, 1)
box(0, -1.52, cx - 3.1, -1.48, 3.0, 3.06, 0); box(cx + 3.1, -1.52, BLOCK_W, -1.48, 3.0, 3.06, 0)
box(cx - 2.4, -1.53, cx + 2.4, -1.5, 3.68, 3.72, 1)
bm.to_mesh(me); bm.free()
ob = bpy.data.objects.new('blok_night', me); bpy.context.collection.objects.link(ob)
bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, 'out', 'blok_night.glb'), export_format='GLB')
print('NIGHT piers', len(piers), 'faces', len(me.polygons))
