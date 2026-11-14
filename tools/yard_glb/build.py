# Blender: courtyard plants and furniture → public/yard/*.glb (run by tools/yard_glb/run.mjs)
#   buta_tosiq.glb  clipped hedge clump (1 × 1 × 1 m, base at 0): a rounded box of dense foliage — real leaf
#                   clusters of Poly Haven's shrub_02 scattered over a dark green core
#   buta.glb        shrub_02, four bushes
#   gul.glb         flower_gazania (8) and periwinkle_plant (3 of 6)
#   orindiq.glb     painted_wooden_bench
# Every variant is its own object, standing on the origin (base at z = 0, centred), reduced for instancing.
import bpy, bmesh, os, sys, math, random
from mathutils import Matrix, Vector

SRC, OUT = [os.path.abspath(p) for p in sys.argv[sys.argv.index('--') + 1:][:2]]
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(7)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def imp(id):
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, id, f'{id}_1k.gltf'))
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']

def bake_transform(o):
    mw = o.matrix_world.copy(); o.parent = None; o.data.transform(mw); o.matrix_world = Matrix()

def stand(o):
    """base on z = 0, centred in x, y"""
    vs = [v.co for v in o.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    o.data.transform(Matrix.Translation(Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))))
    return mx - mn

def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

def decimate(o, target):
    t = tris(o)
    if t <= target: return
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = target / t; m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=m.name)

def export(objs, name):
    for o in bpy.context.scene.objects: o.select_set(o in objs)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True, export_texcoords=True, export_normals=True,
                              export_materials='EXPORT', export_image_format='AUTO')
    print('wrote', name, [(o.name, tris(o)) for o in objs])

def variants(id, keep, target, rename):
    reset()
    obs = imp(id)
    for o in [x for x in bpy.context.scene.objects if x.type != 'MESH']: bpy.data.objects.remove(o)
    obs = sorted(obs, key=lambda o: o.name)[:keep]
    for x in [o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in obs]: bpy.data.objects.remove(x)
    out = []
    for i, o in enumerate(obs):
        bake_transform(o); size = stand(o); decimate(o, target)
        o.name = f'{rename}_{i}'; out.append(o)
        print(rename, i, 'size', tuple(round(v, 2) for v in size))
    return out

def leaf_parts(o, mat_name):
    """faces of the leaf material grouped into single leaves (connected pieces)"""
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    li = [i for i, m in enumerate(o.data.materials) if m and m.name == mat_name]
    todo = {f.index for f in bm.faces if f.material_index in li}
    parts = []
    while todo:
        stack = [todo.pop()]; comp = []
        while stack:
            fi = stack.pop(); comp.append(fi)
            for e in bm.faces[fi].edges:
                for g in e.link_faces:
                    if g.index in todo: todo.discard(g.index); stack.append(g.index)
        parts.append(comp)
    return bm, parts

def thin_leaves(o, keep, grow, mat_name):
    """drop most single leaves, enlarge the rest about their own centre: the same silhouette, far fewer triangles"""
    bm, parts = leaf_parts(o, mat_name)
    gone = []
    for comp in parts:
        if rnd.random() < keep:
            vs = {v for fi in comp for v in bm.faces[fi].verts}
            c = sum((v.co for v in vs), Vector()) / len(vs)
            for v in vs: v.co = c + (v.co - c) * grow
        else:
            gone += [bm.faces[fi] for fi in comp]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bm.to_mesh(o.data); bm.free()

# ---------------------------------------------------------------- bushes
def split_by_material(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='MATERIAL'); bpy.ops.object.mode_set(mode='OBJECT')
    return list(bpy.context.selected_objects)

reset()
obs = sorted(imp('searsia_lucida'), key=lambda o: o.name)
for o in [x for x in bpy.context.scene.objects if x.type != 'MESH']: bpy.data.objects.remove(o)
bushes = []
for i, o in enumerate(obs):
    if i not in (0, 2, 4): bpy.data.objects.remove(o); continue
    bake_transform(o)
    pieces = split_by_material(o)
    for p in pieces:
        m = p.data.materials[p.data.polygons[0].material_index].name if p.data.polygons else ''
        if m == 'searsia_lucida': decimate(p, 2500)                       # trunk and branches
        else: thin_leaves(p, 0.22, 1.85, m)                               # leaves, twig cards
    bpy.ops.object.select_all(action='DESELECT')
    for p in pieces: p.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]; bpy.ops.object.join()
    o = bpy.context.object; size = stand(o)
    o.name = f'buta_{len(bushes)}'; bushes.append(o)
    print('buta', o.name, 'size', tuple(round(v, 2) for v in size), 'tris', tris(o))
export(bushes, 'buta')

# ---------------------------------------------------------------- flowers
export(variants('flower_gazania', 8, 900, 'gul'), 'gul')

# ---------------------------------------------------------------- bench: built here (slats + steel side frames)
# timber texture from Poly Haven's modular_street_seating (CC0)
reset()
TEX = os.path.join(SRC, 'modular_street_seating', 'textures')
def pbr(name, stem, tint=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = bpy.data.images.load(os.path.join(TEX, stem + '_diff_1k.jpg'))
    nt.links.new(tx.outputs['Color'], b.inputs['Base Color'])
    nm = nt.nodes.new('ShaderNodeTexImage'); nm.image = bpy.data.images.load(os.path.join(TEX, stem + '_nor_gl_1k.jpg')); nm.image.colorspace_settings.name = 'Non-Color'
    nn = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nm.outputs['Color'], nn.inputs['Color']); nt.links.new(nn.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = 0.7
    return m
wood = pbr('orindiq_wood', 'modular_street_seating_timber')
steel = bpy.data.materials.new('orindiq_steel'); steel.use_nodes = True
sb = steel.node_tree.nodes['Principled BSDF']; sb.inputs['Base Color'].default_value = (0.03, 0.035, 0.04, 1); sb.inputs['Metallic'].default_value = 0.8; sb.inputs['Roughness'].default_value = 0.4

def box(sx, sy, sz, loc, rot_x=0.0, mat=None, bevel=0.006):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.scale = (sx, sy, sz); o.rotation_euler = (rot_x, 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel:
        bv = o.modifiers.new('b', 'BEVEL'); bv.width = bevel; bv.segments = 2; bpy.ops.object.modifier_apply(modifier=bv.name)
    o.data.materials.append(mat)
    return o
parts = []
L = 1.8
for i in range(5):                                   # seat slats, 43–45 cm high
    parts.append(box(L, 0.075, 0.032, (0, 0.2 - i * 0.088, 0.44), mat=wood))
for i in range(3):                                   # back slats, leaning back 15°
    a = math.radians(15); y = -0.2 - 0.06 - i * 0.11 * math.sin(a); z = 0.58 + i * 0.11 * math.cos(a)
    parts.append(box(L, 0.032, 0.085, (0, y, z), rot_x=a, mat=wood))
def tube(points, r=0.022):
    cu = bpy.data.curves.new('t', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 2
    sp = cu.splines.new('POLY'); sp.points.add(len(points) - 1)
    for p, c in zip(sp.points, points): p.co = (*c, 1)
    o = bpy.data.objects.new('t', cu); bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.convert(target='MESH')
    o.data.materials.append(steel)
    return o
for x in (-0.78, 0.78):                              # side frames
    parts.append(tube([(x, 0.26, 0.0), (x, 0.24, 0.42), (x, -0.24, 0.42), (x, -0.36, 0.95)]))
    parts.append(tube([(x, -0.22, 0.0), (x, -0.24, 0.42)]))
    parts.append(tube([(x, 0.22, 0.42), (x, 0.24, 0.62), (x, -0.2, 0.64)], r=0.018))   # armrest
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
bench = bpy.context.object; bench.name = 'orindiq'
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.cube_project(cube_size=1.0); bpy.ops.object.mode_set(mode='OBJECT')
stand(bench)
print('bench tris', tris(bench))
export([bench], 'orindiq')

# ---------------------------------------------------------------- clipped hedge
# 1) foliage texture: thousands of small searsia leaves on a tile, photographed from above (Cycles) — colour and
#    normals, tiling (leaves near an edge are repeated on the opposite side)
reset()
src = sorted(imp('searsia_lucida'), key=lambda o: o.name)[0]
for o in [x for x in bpy.context.scene.objects if x != src]: bpy.data.objects.remove(o)
bake_transform(src)
bm_src, comps = leaf_parts(src, 'searsia_lucida_leaves')
uv_src = bm_src.loops.layers.uv.active
leaf_mat = src.data.materials[bm_src.faces[comps[0][0]].material_index]
single = [c for c in comps if 2 <= len(c) <= 8]

def scatter_leaves(bm_out, uv_out, n, place):
    """copies n random single leaves into bm_out; place() → (position, rotation matrix, scale)"""
    for _ in range(n):
        comp = rnd.choice(single)
        vs = list({v for fi in comp for v in bm_src.faces[fi].verts})
        c = sum((v.co for v in vs), Vector()) / len(vs)
        ext = max((v.co - c).length for v in vs) or 1
        for at, R, k in place(ext):
            vmap = {v: bm_out.verts.new(at + R @ ((v.co - c) * k)) for v in vs}
            for fi in comp:
                sf = bm_src.faces[fi]
                try: nf = bm_out.faces.new([vmap[v] for v in sf.verts])
                except ValueError: continue
                for l_new, l_old in zip(nf.loops, sf.loops): l_new[uv_out].uv = l_old[uv_src].uv

T = 0.5                                                   # tile: 0.5 m of hedge surface
def place_tile(ext):
    x, y = rnd.random() * T, rnd.random() * T
    R = Matrix.Rotation(rnd.random() * 6.283, 3, 'Z') @ Matrix.Rotation((rnd.random() - 0.5) * 1.3, 3, 'X') @ Matrix.Rotation((rnd.random() - 0.5) * 1.3, 3, 'Y')
    k = 0.03 / ext * (0.7 + rnd.random() * 0.6)          # 4–8 cm leaves, like boxwood / privet
    z = rnd.random() * 0.06
    out = []
    for dx in (-T, 0, T):
        for dy in (-T, 0, T):
            if -0.05 < x + dx < T + 0.05 and -0.05 < y + dy < T + 0.05: out.append((Vector((x + dx, y + dy, z)), R, k))
    return out
bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
scatter_leaves(bm, uvl, int(os.environ.get('TILE_LEAVES', 2600)), place_tile)
me = bpy.data.meshes.new('tile'); bm.to_mesh(me); bm.free()
me.materials.append(leaf_mat)
tile = bpy.data.objects.new('tile', me); bpy.context.scene.collection.objects.link(tile)
src.hide_render = True
# dark leafy floor under the leaves (shows in the gaps)
bpy.ops.mesh.primitive_plane_add(size=T * 1.4, location=(T / 2, T / 2, -0.01))
floor = bpy.context.object
fm = bpy.data.materials.new('floor'); fm.use_nodes = True; fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.018, 0.035, 0.012, 1)
floor.data.materials.append(fm)
cam_d = bpy.data.cameras.new('c'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = T
cam = bpy.data.objects.new('c', cam_d); cam.location = (T / 2, T / 2, 2); bpy.context.scene.collection.objects.link(cam)
sc = bpy.context.scene; sc.camera = cam
sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.render.resolution_x = sc.render.resolution_y = 1024
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA'):
        prefs.compute_device_type = kind; prefs.get_devices()
        if any(d.type == kind for d in prefs.devices):
            for d in prefs.devices: d.use = d.type == kind
            sc.cycles.device = 'GPU'; break
except Exception as e: print('cpu render', e)
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
sun = bpy.data.lights.new('s', 'SUN'); sun.energy = 2.5; so = bpy.data.objects.new('s', sun); so.rotation_euler = (math.radians(20), math.radians(10), 0)
bpy.context.scene.collection.objects.link(so)
sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.file_format = 'PNG'
sc.render.filepath = os.path.join(OUT, 'hedge_diff.png'); bpy.ops.render.render(write_still=True)
# normals: every surface shows its normal as a colour (flat emission), the floor points straight up
nmat = bpy.data.materials.new('n'); nmat.use_nodes = True; nt = nmat.node_tree
for nd in list(nt.nodes): nt.nodes.remove(nd)
geo = nt.nodes.new('ShaderNodeNewGeometry'); vm = nt.nodes.new('ShaderNodeVectorMath'); vm.operation = 'MULTIPLY_ADD'
vm.inputs[1].default_value = (0.5, 0.5, 0.5); vm.inputs[2].default_value = (0.5, 0.5, 0.5)
em = nt.nodes.new('ShaderNodeEmission'); outn = nt.nodes.new('ShaderNodeOutputMaterial')
# leaf cut-out kept: alpha of the leaf texture mixes in transparency
lt = nt.nodes.new('ShaderNodeTexImage'); lt.image = [n for n in leaf_mat.node_tree.nodes if n.type == 'TEX_IMAGE' and 'diff' in n.image.name][0].image
tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
nt.links.new(geo.outputs['Normal'], vm.inputs[0]); nt.links.new(vm.outputs['Vector'], em.inputs['Color'])
nt.links.new(lt.outputs['Alpha'], mx.inputs['Fac']); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
nt.links.new(mx.outputs[0], outn.inputs['Surface'])
tile.data.materials[0] = nmat
fm2 = bpy.data.materials.new('fn'); fm2.use_nodes = True; t2 = fm2.node_tree
for nd in list(t2.nodes): t2.nodes.remove(nd)
e2 = t2.nodes.new('ShaderNodeEmission'); e2.inputs['Color'].default_value = (0.5, 0.5, 1, 1); o2 = t2.nodes.new('ShaderNodeOutputMaterial')
t2.links.new(e2.outputs[0], o2.inputs['Surface']); floor.data.materials[0] = fm2
sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0; so.hide_render = True
sc.cycles.samples = 16; sc.render.image_settings.color_management = 'OVERRIDE'; sc.render.image_settings.view_settings.view_transform = 'Raw'
sc.render.filepath = os.path.join(OUT, 'hedge_nor.png'); bpy.ops.render.render(write_still=True)
print('hedge tile rendered')

# 2) clump: a rounded box, lumpy surface, the foliage tile mapped by box projection (1 tile = 0.5 m),
#    a few loose leaves for a broken silhouette
reset()
src = sorted(imp('searsia_lucida'), key=lambda o: o.name)[0]
for o in [x for x in bpy.context.scene.objects if x != src]: bpy.data.objects.remove(o)
bake_transform(src); src.hide_render = True
bm_src, comps = leaf_parts(src, 'searsia_lucida_leaves'); uv_src = bm_src.loops.layers.uv.active
leaf_mat = src.data.materials[bm_src.faces[comps[0][0]].material_index]
single = [c for c in comps if 2 <= len(c) <= 8]
bpy.ops.mesh.primitive_cube_add(size=0.9, location=(0, 0, 0.45))
core = bpy.context.object
bv = core.modifiers.new('b', 'BEVEL'); bv.width = 0.14; bv.segments = 3; bpy.ops.object.modifier_apply(modifier=bv.name)
sd = core.modifiers.new('s', 'SUBSURF'); sd.levels = 1; bpy.ops.object.modifier_apply(modifier=sd.name)
tex = bpy.data.textures.new('lumps', 'CLOUDS'); tex.noise_scale = 0.12
dp = core.modifiers.new('d', 'DISPLACE'); dp.texture = tex; dp.strength = 0.045; dp.mid_level = 0.5
bpy.ops.object.modifier_apply(modifier=dp.name)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.cube_project(cube_size=0.5, scale_to_bounds=False); bpy.ops.object.mode_set(mode='OBJECT')
hm = bpy.data.materials.new('hedge_foliage'); hm.use_nodes = True; nt = hm.node_tree; b = nt.nodes['Principled BSDF']
d = nt.nodes.new('ShaderNodeTexImage'); d.image = bpy.data.images.load(os.path.join(OUT, 'hedge_diff.png'))
nmi = nt.nodes.new('ShaderNodeTexImage'); nmi.image = bpy.data.images.load(os.path.join(OUT, 'hedge_nor.png')); nmi.image.colorspace_settings.name = 'Non-Color'
nn = nt.nodes.new('ShaderNodeNormalMap')
nt.links.new(d.outputs['Color'], b.inputs['Base Color']); nt.links.new(nmi.outputs['Color'], nn.inputs['Color']); nt.links.new(nn.outputs['Normal'], b.inputs['Normal'])
b.inputs['Roughness'].default_value = 0.85
core.data.materials.append(hm)
# loose leaves over the surface
cbm = bmesh.new(); cbm.from_mesh(core.data); cbm.faces.ensure_lookup_table()
areas = [f.calc_area() for f in cbm.faces]; total = sum(areas)
def place_surface(ext):
    r = rnd.random() * total
    for f, a in zip(cbm.faces, areas):
        r -= a
        if r <= 0: break
    if f.calc_center_median().z < 0.12: return []
    p = f.calc_center_median(); n = f.normal.copy()
    R = n.to_track_quat('Z', 'Y').to_matrix() @ Matrix.Rotation(rnd.random() * 6.283, 3, 'Z') @ Matrix.Rotation((rnd.random() - 0.5) * 1.6, 3, 'X')
    return [(p + n * 0.015, R, 0.035 / ext * (0.8 + rnd.random() * 0.5))]
lb = bmesh.new(); luv = lb.loops.layers.uv.new('UVMap')
scatter_leaves(lb, luv, int(os.environ.get('HEDGE_LOOSE', 50)), place_surface)
lme = bpy.data.meshes.new('loose'); lb.to_mesh(lme); lb.free(); cbm.free()
lme.materials.append(leaf_mat)
loose = bpy.data.objects.new('loose', lme); bpy.context.scene.collection.objects.link(loose)
bpy.data.objects.remove(src)
bpy.ops.object.select_all(action='DESELECT'); loose.select_set(True); core.select_set(True); bpy.context.view_layer.objects.active = core
bpy.ops.object.join()
hedge = bpy.context.object; hedge.name = 'buta_tosiq'
stand(hedge)
print('hedge tris', tris(hedge))
export([hedge], 'buta_tosiq')
