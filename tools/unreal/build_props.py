# Courtyard furniture PLACEHOLDERS (owner 2026-11-20: to be swapped for Fab models later) -> tools/unreal/kit_glb:
#   prop_lamp     4.5 m square black post, slim light box on top (video ref Screenshot_3), base at 0
#   prop_bollard  0.8 m black square bollard with a glowing slot
#   prop_bin      0.9 m bin with a girih-like slotted steel shell (render 14), dark
#   prop_bench    the web courtyard bench (tools/yard_glb/out/orindiq.glb), seat facing +Y (Blender) after this script
# Origins at the base centre. Metres, Z up.
#   D:/blender-program/blender.exe -b --factory-startup -P tools/unreal/build_props.py
import bpy, bmesh, os, math
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'kit_glb')

def mat(name, rgb, rough=0.5, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (1.0, 0.85, 0.65, 1); b.inputs['Emission Strength'].default_value = emit
    return m

bpy.ops.wm.read_factory_settings(use_empty=True)
def build(name, parts):
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    me = bpy.data.meshes.new(name); bm = bmesh.new(); mats = []
    for (cx, cy, cz), (sx, sy, sz), m in parts:
        if m not in mats: mats.append(m)
        r = bmesh.ops.create_cube(bm, size=1.0)
        for v in r['verts']: v.co.x = v.co.x * sx + cx; v.co.y = v.co.y * sy + cy; v.co.z = v.co.z * sz + cz
        for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = mats.index(m)
    bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB')
    print('PROP', name, tuple(round(v, 2) for v in ob.dimensions))

black = mat('M_PropBlack', (0.02, 0.02, 0.022), 0.35, 0.8)
glow = mat('M_PropGlow', (1, 0.9, 0.75), 0.4, 0, 8.0)
steel = mat('M_PropSteel', (0.05, 0.05, 0.055), 0.45, 0.9)
build('prop_lamp', [((0, 0, 2.1), (0.12, 0.12, 4.2), black), ((0, 0, 4.35), (0.22, 0.22, 0.3), black), ((0, 0, 4.18), (0.18, 0.18, 0.04), glow),
                    ((0, 0, 0.05), (0.3, 0.3, 0.1), black)])
build('prop_bollard', [((0, 0, 0.4), (0.16, 0.16, 0.8), black), ((0, 0, 0.66), (0.17, 0.17, 0.05), glow)])
parts = [((0, 0, 0.03), (0.5, 0.5, 0.06), steel), ((0, 0, 0.88), (0.52, 0.52, 0.05), steel)]
for k in range(4):                                       # slotted shell: vertical slats on each side
    for j in range(-3, 4):
        a = k * math.pi / 2; o = 0.23; t = j * 0.065
        x, y = math.cos(a) * o - math.sin(a) * t, math.sin(a) * o + math.cos(a) * t
        parts.append(((x, y, 0.45), (0.03 if k % 2 == 0 else 0.035, 0.035 if k % 2 == 0 else 0.03, 0.82), steel))
build('prop_bin', parts)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, '..', 'yard_glb', 'out', 'orindiq.glb'))
obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in obs: o.select_set(True)
bpy.context.view_layer.objects.active = obs[0]
if len(obs) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active; ob.name = 'prop_bench'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
d = ob.dimensions
# where is the backrest? the higher half of the vertices tells the back side
hi = [v.co for v in ob.data.vertices if v.co.z > d.z * 0.7]
bx = sum(v.x for v in hi) / max(1, len(hi)); by = sum(v.y for v in hi) / max(1, len(hi))
print('PROP prop_bench', tuple(round(v, 2) for v in d), 'backrest centroid', round(bx, 2), round(by, 2))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'prop_bench.glb'), export_format='GLB', export_apply=True)

# ---- playground / sport / fountain placeholders (video refs Screenshot_5-7, renders 17, 21, 25)
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
red = mat('M_PropRed', (0.55, 0.05, 0.03), 0.4, 0.3)
yel = mat('M_PropYellow', (0.85, 0.55, 0.05), 0.4, 0.3)
blu = mat('M_PropBlue', (0.05, 0.2, 0.55), 0.4, 0.3)
wood = mat('M_PropWood', (0.35, 0.2, 0.1), 0.6)
white = mat('M_PropWhite', (0.85, 0.85, 0.85), 0.4)
granite = mat('M_PropGranite', (0.22, 0.22, 0.23), 0.35)
water = mat('M_Water', (0.75, 0.88, 1.0), 0.05)
grate = mat('M_PropGrate', (0.03, 0.03, 0.03), 0.4, 0.9)

def bar(a, b, w, m):
    """box part list entry approximating a bar from a to b (axis aligned bars only are exact; diagonals use bmesh below)"""
    return (tuple((a[i] + b[i]) / 2 for i in range(3)), tuple(max(abs(b[i] - a[i]), w) for i in range(3)), m)

def build_bars(name, boxes, rods):
    """boxes: build() parts; rods: (a, b, radius, mat) arbitrary-direction cylinders"""
    from mathutils import Vector, Matrix
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    me = bpy.data.meshes.new(name); bm = bmesh.new(); mats = []
    def mi(m):
        if m not in mats: mats.append(m)
        return mats.index(m)
    for (cx, cy, cz), (sx, sy, sz), m in boxes:
        r = bmesh.ops.create_cube(bm, size=1.0)
        for v in r['verts']: v.co.x = v.co.x * sx + cx; v.co.y = v.co.y * sy + cy; v.co.z = v.co.z * sz + cz
        k = mi(m)
        for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = k
    for a, b, rad, m in rods:
        a, b = Vector(a), Vector(b); d = b - a; L = d.length
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=rad, radius2=rad, depth=L)
        q = d.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ q, verts=r['verts'])
        k = mi(m)
        for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = k
    bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB')
    print('PROP', name, tuple(round(v, 2) for v in ob.dimensions))

# climbing dome (geodesic, 4 m wide, 2 m high): icosphere edges of the upper half
bm0 = bmesh.new(); bmesh.ops.create_icosphere(bm0, subdivisions=2, radius=2.0)
rods = []
for e in bm0.edges:
    a, b = e.verts[0].co.copy(), e.verts[1].co.copy()
    if a.z >= -0.05 and b.z >= -0.05: rods.append((tuple(a), tuple(b), 0.035, red if (len(rods) % 3) else yel))
bm0.free()
build_bars('prop_dome', [], rods)
# slide tower: 4 posts, deck 1.2 m, roof, slide, ladder
P = [(x, y) for x in (-0.6, 0.6) for y in (-0.6, 0.6)]
boxes = [((x, y, 1.35), (0.1, 0.1, 2.7), blu) for x, y in P] + [((0, 0, 1.2), (1.4, 1.4, 0.08), wood), ((0, 0, 2.75), (1.6, 1.6, 0.1), red),
         ((0, 0.75, 1.55), (1.3, 0.04, 0.6), yel), ((-0.75, 0, 1.55), (0.04, 1.3, 0.6), yel)]
rods = [((0.7, -0.4, 1.25), (2.9, -0.4, 0.15), 0.03, yel), ((0.7, 0.4, 1.25), (2.9, 0.4, 0.15), 0.03, yel)]
boxes += [((1.8, 0, 0.7), (2.4, 0.7, 0.04), yel)]   # slide bed (approximate; tilted below)
build_bars('prop_slide', boxes[:-1], rods + [((0.7, 0, 1.22), (2.9, 0, 0.12), 0.33, yel)] +
           [((-0.7 - 0.05 * k, -0.25, 0.2 * k), (-0.7 - 0.05 * k, 0.25, 0.2 * k), 0.025, white) for k in range(1, 6)])
# swing: A-frame 2.4 m, 2 seats
rods = [((-1.6, -0.9, 0), (-1.6, 0, 2.4), 0.05, blu), ((-1.6, 0.9, 0), (-1.6, 0, 2.4), 0.05, blu),
        ((1.6, -0.9, 0), (1.6, 0, 2.4), 0.05, blu), ((1.6, 0.9, 0), (1.6, 0, 2.4), 0.05, blu), ((-1.6, 0, 2.4), (1.6, 0, 2.4), 0.05, blu)]
for sx in (-0.7, 0.7):
    rods += [((sx - 0.2, 0, 2.4), (sx - 0.2, 0, 0.45), 0.01, white), ((sx + 0.2, 0, 2.4), (sx + 0.2, 0, 0.45), 0.01, white)]
build_bars('prop_swing', [((sx, 0, 0.43), (0.5, 0.2, 0.04), red) for sx in (-0.7, 0.7)], rods)
# spring rider
build_bars('prop_spring', [((0, 0, 0.65), (0.7, 0.25, 0.3), yel), ((0.3, 0, 0.9), (0.15, 0.2, 0.3), yel), ((0, 0, 0.02), (0.4, 0.4, 0.04), granite)],
           [((0, 0, 0.04), (0, 0, 0.5), 0.09, white), ((0.3, -0.2, 1.0), (0.3, 0.2, 1.0), 0.02, red)])
# basketball hoop (3.05 m rim), board facing +Y
build_bars('prop_hoop', [((0, -0.2, 3.4), (1.8, 0.05, 1.05), white), ((0, -0.95, 0.05), (0.5, 0.5, 0.1), granite)],
           [((0, -0.95, 0), (0, -0.95, 3.3), 0.06, blu), ((0, -0.95, 3.2), (0, -0.25, 3.2), 0.05, blu),
            ] +
           [((0.23 * math.cos(a), 0.05 + 0.23 + 0.23 * math.sin(a), 3.05), (0.23 * math.cos(a + 0.4), 0.05 + 0.23 + 0.23 * math.sin(a + 0.4), 3.05), 0.012, red)
            for a in [k * 0.4 for k in range(16)]])
# fitness: red pull-up bars (video Screenshot_6)
build_bars('prop_pullup', [((0, 0, 0.03), (2.6, 0.4, 0.06), granite)],
           [((-1.2, 0, 0), (-1.2, 0, 2.3), 0.05, red), ((0, 0, 0), (0, 0, 2.3), 0.05, red), ((1.2, 0, 0), (1.2, 0, 2.3), 0.05, red),
            ((-1.2, 0, 2.2), (0, 0, 2.2), 0.025, red), ((0, 0, 1.8), (1.2, 0, 1.8), 0.025, red)])
# dry fountain: granite disc 9 m with nozzle grates on a 1.2 m grid; jets: separate mesh (translucent water in Unreal)
grates, jets = [], []
for i in range(-3, 4):
    for j in range(-3, 4):
        x, y = i * 1.2, j * 1.2
        if x * x + y * y > 3.6 ** 2: continue
        grates.append(((x, y, 0.005), (0.25, 0.25, 0.01), grate))
        h = 1.2 + 1.3 * (1 - (x * x + y * y) / 13.0)
        jets.append(((x, y, 0), (x, y, h), 0.045, water))
build_bars('prop_fountain', [((0, 0, 0.004), (0.01, 0.01, 0.008), granite)] + grates, [])
build_bars('prop_jets', [], jets)
