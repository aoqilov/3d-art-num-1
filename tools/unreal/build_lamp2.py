# Slim street lamp (owner 2026-11-22: the old 12 cm post with a box head was removed; reference render
# foto-reference/Screenshot_2.png has thin lamps along the streets): 7 cm round-ish post 4.5 m, flat 55 x 55 x 5 cm LED
# panel on top, glowing underside. -> tools/unreal/kit_glb/prop_lamp2.glb (slots M_PropBlack, M_PropGlow), origin base.
#   D:/blender-program/blender.exe -b --factory-startup -P tools/unreal/build_lamp2.py
import bpy, bmesh, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.read_factory_settings(use_empty=True)
me = bpy.data.meshes.new('prop_lamp2'); bm = bmesh.new()
for n in ('M_PropBlack', 'M_PropGlow'): me.materials.append(bpy.data.materials.new(n))
def tag(geom, mi):
    for f in [g for g in geom if isinstance(g, bmesh.types.BMFace)]: f.material_index = mi
r = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.04, radius2=0.032, depth=4.5)   # post
for v in r['verts']: v.co.z += 2.25
r = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.09, radius2=0.06, depth=0.12)   # foot
for v in r['verts']: v.co.z += 0.06
r = bmesh.ops.create_cube(bm, size=1.0)                                                             # head
for v in r['verts']: v.co.x *= 0.55; v.co.y *= 0.55; v.co.z = v.co.z * 0.05 + 4.53
r = bmesh.ops.create_cube(bm, size=1.0)                                                             # LED underside
for v in r['verts']: v.co.x *= 0.47; v.co.y *= 0.47; v.co.z = v.co.z * 0.01 + 4.502
for f in r['verts'][0].link_faces: pass
newf = {f for v in r['verts'] for f in v.link_faces}
for f in newf: f.material_index = 1
bm.to_mesh(me); bm.free()
ob = bpy.data.objects.new('prop_lamp2', me); bpy.context.collection.objects.link(ob)
bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, 'kit_glb', 'prop_lamp2.glb'), export_format='GLB')
print('LAMP2', tuple(round(v, 2) for v in ob.dimensions))
