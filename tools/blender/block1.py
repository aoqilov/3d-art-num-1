# Blender (bpy 4.x/5.x) build of the type-4 block exterior ("Blok-1"):
#   npm run model  (export → Blender → compress; tools/blender/run.mjs finds Blender)   or   blender -b -P tools/blender/block1.py
# in : tools/blender/out/block_t4.json   (node tools/blender/export.mjs — triangles per material from the drawings)
# out: public/models/blok1.glb (+ tools/blender/out/blok1.blend, blok1_ao.png)
# What Blender adds to the drawn geometry: welded meshes, bevelled corners (1.2 cm), a second UV set and ambient occlusion baked with Cycles
# (soft contact shadows under balconies, canopies, in window reveals and loggias) stored in the GLB as occlusion map.
import numpy as np
import bpy, bmesh, json, base64, os, sys, struct, array, time
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SIZE = int(os.environ.get('AO_SIZE', 4096)); SAMPLES = int(os.environ.get('AO_SAMPLES', 48))
NO_BAKE = {'rail', 'rail_panel', 'glass', 'lattice_dark', 'frame', 'frame_light', 'steel'}      # thin or see-through: no lightmap space
NO_CAST = {'rail', 'rail_panel', 'glass', 'lattice_dark'}

t0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
data = json.load(open(os.path.join(HERE, 'out/block_t4.json')))
f32 = lambda s: array.array('f', base64.b64decode(s))
hexc = lambda h: tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (1, 3, 5)) + (1,)

ao_img = bpy.data.images.new('blok1_ao', SIZE, SIZE, alpha=False); ao_img.generated_color = (1, 1, 1, 1)
# glTF exporter reads the occlusion map from a node group with this name
grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')

def material(g, baked):
    m = bpy.data.materials.new(g['name']); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hexc(g['color']); b.inputs['Roughness'].default_value = g['rough']; b.inputs['Metallic'].default_value = g['metal']
    if g['name'] == 'glass':
        b.inputs['Alpha'].default_value = 0.9
    if g['name'] == 'rail_panel':                       # see-through; also keeps the exporter from merging it with 'rail'
        b.inputs['Alpha'].default_value = 0.5
    if baked:
        uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'ao'
        tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = ao_img; tx.name = 'AO'
        nt.links.new(uv.outputs['UV'], tx.inputs['Vector'])
        gn = nt.nodes.new('ShaderNodeGroup'); gn.node_tree = grp
        nt.links.new(tx.outputs['Color'], gn.inputs['Occlusion'])
        nt.nodes.active = tx
    return m

def make(name, groups, baked):
    me = bpy.data.meshes.new(name); verts = []; faces = []; uvs = []; mi = []
    for k, g in enumerate(groups):
        P = f32(g['pos']); U = f32(g['uv']); base = len(verts)
        for i in range(g['count']):
            verts.append((P[i * 3], -P[i * 3 + 2], P[i * 3 + 1]))      # three (x, up, y) → Blender (x, -y, up)
            uvs.append((U[i * 2], 1 - U[i * 2 + 1]))
        for i in range(0, g['count'], 3):
            faces.append((base + i, base + i + 1, base + i + 2)); mi.append(k)
        me.materials.append(material(g, baked))
    me.from_pydata(verts, [], faces)
    me.polygons.foreach_set('material_index', mi)
    l = me.uv_layers.new(name='uv')
    l.data.foreach_set('uv', [c for lp in me.loops for c in uvs[lp.vertex_index]])
    me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bm.to_mesh(me); bm.free()
    return ob

shell = make('blok1_shell', [g for g in data if g['name'] not in NO_BAKE], True)
trim = make('blok1_trim', [g for g in data if g['name'] in NO_BAKE and g['name'] not in NO_CAST], False)
thin = make('blok1_thin', [g for g in data if g['name'] in NO_CAST], False)
print('meshes', [(o.name, len(o.data.polygons)) for o in (shell, trim, thin)], round(time.time() - t0, 1))

# ---- soft edges: a small bevel on every real corner (walls, window reveals, slab edges, pilasters) catches
# the light the way built corners do; thin and see-through parts stay sharp
import math
BEVEL = float(os.environ.get('BEVEL', 0.012))
def bevel(ob, width):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    m = ob.modifiers.new('bevel', 'BEVEL'); m.width = width; m.segments = 2; m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(35); m.use_clamp_overlap = True; m.loop_slide = True
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
if BEVEL > 0:
    bevel(shell, BEVEL)                                  # frames and steel: thin, a bevel there costs triangles for nothing
    print('bevel', [(o.name, len(o.data.polygons)) for o in (shell, trim)], round(time.time() - t0, 1))

# ---- second UV set for the bake
bpy.context.view_layer.objects.active = shell; shell.select_set(True)
ao = shell.data.uv_layers.new(name='ao'); shell.data.uv_layers.active = ao
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.0015, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
# slabs are mostly indoors: give them a third of the texel density, then repack
ao = shell.data.uv_layers['ao']
small = {i for i, m in enumerate(shell.data.materials) if m.name in ('floor_base', 'ceiling', 'roof')}
for poly in shell.data.polygons:
    if poly.material_index in small:
        for li in poly.loop_indices: ao.data[li].uv = ao.data[li].uv * 0.33
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.pack_islands(rotate=False, margin=0.0005)
bpy.ops.object.mode_set(mode='OBJECT')
ao = shell.data.uv_layers['ao']                       # re-fetch: layer references go stale across mode switches
buf = np.empty(len(ao.data) * 2, np.float32); ao.data.foreach_get('uv', buf)
ao.data.foreach_set('uv', buf * 0.98 + 0.01)      # keep the map's corners free
print('uv', round(time.time() - t0, 1))

# ---- bake ambient occlusion (ground plane and trim occlude; rails and glass don't)
bpy.ops.mesh.primitive_plane_add(size=400, location=(15, -9, -0.01)); ground = bpy.context.object; ground.name = 'ground'
thin.hide_render = True
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES
# the graphics card bakes when Cycles finds one (OptiX / CUDA), the processor otherwise (AO_DEVICE=CPU forces it)
if os.environ.get('AO_DEVICE', 'GPU') == 'GPU':
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            prefs.compute_device_type = kind; prefs.get_devices()
            if any(d.type == kind for d in prefs.devices):
                for d in prefs.devices: d.use = d.type == kind
                sc.cycles.device = 'GPU'; print('bake on', kind); break
    except Exception as e:
        print('GPU bake unavailable:', e)
sc.world = bpy.data.worlds.new('w'); sc.world.light_settings.distance = 4.0
sc.render.bake.margin = 3; sc.render.bake.use_clear = True
bpy.ops.object.select_all(action='DESELECT'); shell.select_set(True); bpy.context.view_layer.objects.active = shell
bpy.ops.object.bake(type='AO')
print('bake', round(time.time() - t0, 1))
px = np.empty(SIZE * SIZE * 4, np.float32); ao_img.pixels.foreach_get(px); px = px.reshape(SIZE, SIZE, 4)
c = SIZE // 128
px[:c, :c] = 1; px[-c:, :c] = 1                     # geometry without the second UV set samples a corner: keep it white
ao_img.pixels.foreach_set(px.ravel()); ao_img.update()
ao_img.filepath_raw = os.path.join(HERE, 'out/blok1_ao.png'); ao_img.file_format = 'PNG'; ao_img.save()
bpy.data.objects.remove(ground); thin.hide_render = False
ao_img.pack()

# ---- save
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'out/blok1.blend'))
os.makedirs(os.path.join(ROOT, 'public/models'), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'public/models/blok1.glb'), export_format='GLB', export_yup=True, export_apply=True,
                          export_image_format='JPEG', export_image_quality=82, export_texcoords=True, export_normals=True, export_materials='EXPORT')
print('done', round(time.time() - t0, 1))
