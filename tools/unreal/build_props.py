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
