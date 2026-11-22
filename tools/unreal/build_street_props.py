# B6 street furniture (simple, Tashkent style) -> tools/unreal/kit_glb/prop_svetofor.glb, prop_bekat.glb. Metres, Z up,
# origin at the base centre, +Y = the side facing the road.
#   prop_svetofor  3.4 m grey pole, black head 0.32 x 0.25 x 0.95 facing +Y, three lenses (slots M_TL_Red / Amber / Green)
#   prop_bekat     bus shelter 4.2 x 1.6 x 2.6: 4 posts, roof slab, glass back wall + side panels, bench, sign board (+Y open)
#   D:/blender-program/blender.exe -b --factory-startup -P tools/unreal/build_street_props.py
import bpy, bmesh, os
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'kit_glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
def build(name, parts, mats):
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    for (cx, cy, cz), (sx, sy, sz), mi in parts:
        r = bmesh.ops.create_cube(bm, size=1.0)
        for v in r['verts']: v.co.x = v.co.x * sx + cx; v.co.y = v.co.y * sy + cy; v.co.z = v.co.z * sz + cz
        for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = mi
    bm.to_mesh(me); bm.free()
    for n in mats: me.materials.append(bpy.data.materials.get(n) or bpy.data.materials.new(n))
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB')
    print('PROP', name, tuple(round(v, 2) for v in ob.dimensions))
# svetofor: 0 pole grey, 1 head black, 2 red, 3 amber, 4 green
build('prop_svetofor', [((0, 0, 1.7), (0.11, 0.11, 3.4), 0), ((0, 0.18, 3.0), (0.32, 0.25, 0.95), 1), ((0, 0.06, 3.0), (0.08, 0.12, 0.08), 0),
                        ((0, 0.31, 3.31), (0.2, 0.02, 0.2), 2), ((0, 0.31, 3.0), (0.2, 0.02, 0.2), 3), ((0, 0.31, 2.69), (0.2, 0.02, 0.2), 4),
                        ((0, 0, 0.04), (0.3, 0.3, 0.08), 0)],
      ['M_TL_Pole', 'M_TL_Head', 'M_TL_Red', 'M_TL_Amber', 'M_TL_Green'])
# bekat: 0 metal, 1 glass, 2 bench wood, 3 sign
parts = [((x, y, 1.25), (0.08, 0.08, 2.5), 0) for x in (-2.0, 2.0) for y in (-0.7, 0.6)]
parts += [((0, -0.05, 2.55), (4.4, 1.8, 0.1), 0),                       # roof
          ((0, -0.72, 1.3), (4.0, 0.03, 2.2), 1),                       # glass back
          ((-2.0, -0.05, 1.3), (0.03, 1.2, 2.2), 1), ((2.0, -0.05, 1.3), (0.03, 1.2, 2.2), 1),
          ((0, -0.45, 0.45), (3.0, 0.4, 0.06), 2), ((0, -0.6, 0.7), (3.0, 0.05, 0.4), 2),
          ((-1.0, -0.45, 0.22), (0.06, 0.3, 0.44), 0), ((1.0, -0.45, 0.22), (0.06, 0.3, 0.44), 0),
          ((1.4, 0.62, 2.25), (1.0, 0.04, 0.45), 3)]
build('prop_bekat', parts, ['M_BS_Metal', 'M_BS_Glass', 'M_BS_Wood', 'M_BS_Sign'])
