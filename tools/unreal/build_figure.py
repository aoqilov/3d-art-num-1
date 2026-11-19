# Human scale figure for the third-person view (until a rigged character is added): 1.75 m tall, 46 cm shoulders,
# 25 cm chest depth, neutral clothing colours. Feet at z = 0, facing +X (Unreal forward after glTF import).
#   D:/blender.exe -b --factory-startup -P tools/unreal/build_figure.py  ->  tools/unreal/out/figure.glb
import bpy, os, math
bpy.ops.wm.read_factory_settings(use_empty=True)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

def mat(name, hexc, rough=0.7):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = [(int(hexc[i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5)] + [1]
    b.inputs['Roughness'].default_value = rough
    return m
SKIN, SHIRT, PANTS, SHOE, HAIR = mat('M_Skin', '#c89a7c', 0.55), mat('M_Shirt', '#5f7488'), mat('M_Pants', '#2f3238'), mat('M_Shoe', '#1b1b1c', 0.4), mat('M_Hair', '#2a211c', 0.6)
parts = []
def add(op, m, loc, scale=(1, 1, 1), rot=(0, 0, 0), **kw):
    op(location=loc, rotation=rot, **kw); o = bpy.context.object
    o.scale = scale; o.data.materials.append(m)
    bpy.ops.object.shade_smooth(); parts.append(o); return o
cyl = lambda m, loc, r, d, sc=(1, 1, 1), rot=(0, 0, 0): add(bpy.ops.mesh.primitive_cylinder_add, m, loc, sc, rot, radius=r, depth=d, vertices=24)
sph = lambda m, loc, r, sc=(1, 1, 1): add(bpy.ops.mesh.primitive_uv_sphere_add, m, loc, sc, radius=r, segments=24, ring_count=14)
# legs (hips at 0.92 m), feet
for s in (-1, 1):
    y = s * 0.095
    cyl(PANTS, (0, y, 0.70), 0.075, 0.46, (1.0, 1.05, 1))           # thigh
    cyl(PANTS, (0, y, 0.30), 0.058, 0.46)                            # shin
    sph(SHOE, (0.05, y, 0.045), 0.06, (2.0, 1.0, 0.75))             # shoe
# torso: hips, waist, chest with 46 cm shoulders
sph(PANTS, (0, 0, 0.93), 0.17, (0.8, 1.0, 0.55))
cyl(SHIRT, (0, 0, 1.13), 0.15, 0.42, (0.78, 1.08, 1))
sph(SHIRT, (0, 0, 1.36), 0.2, (0.62, 1.15, 0.45))                    # shoulder girdle: 2 * 0.2 * 1.15 = 0.46 m
for s in (-1, 1):
    y = s * 0.205
    sph(SHIRT, (0, y, 1.37), 0.065)
    cyl(SHIRT, (0, s * 0.215, 1.20), 0.047, 0.32)                    # upper arm
    cyl(SKIN, (0, s * 0.22, 0.92), 0.038, 0.28)                      # forearm
    sph(SKIN, (0, s * 0.22, 0.75), 0.045, (0.8, 0.6, 1.2))           # hand
cyl(SKIN, (0, 0, 1.50), 0.05, 0.12)                                  # neck
sph(SKIN, (0.01, 0, 1.63), 0.105, (1.05, 0.9, 1.15))                 # head (top at ~1.75 m)
sph(HAIR, (-0.01, 0, 1.67), 0.106, (1.05, 0.93, 0.9))
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join(); fig = bpy.context.object; fig.name = 'Blok1_Figure'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
d = fig.dimensions; print('FIGURE size m', round(d.x, 3), round(d.y, 3), round(d.z, 3))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'figure.glb'), export_format='GLB', export_yup=True, export_apply=True)
print('DONE')
