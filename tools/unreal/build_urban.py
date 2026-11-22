# out/urban_mesh.npz (urban_mesh.py) -> out/urban.glb: one object per array set. Unreal metres -> Blender (x, -y, z);
# the mirror flips the winding, so every triangle is reversed back (urban_mesh.py oriented them in Unreal maths).
# UV sets: UVMap (UV0), C1 = colour (r, g), C2 = colour (b, 0) (the Unreal materials read the colour there; glTF stores v as 1-v).
#   D:/blender-program/blender.exe -b --factory-startup -P tools/unreal/build_urban.py
import bpy, os, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
SET = os.environ.get('URBAN_SET', 'urban_mesh')          # urban_mesh (stages 1-3) | urban_main_mesh (stage 6)
D = np.load(os.path.join(HERE, 'out', SET + '.npz'))
MATS = json.load(open(os.path.join(HERE, 'out', SET + '_mats.json')))
bpy.ops.wm.read_factory_settings(use_empty=True)
for name, mats in MATS.items():
    P, UV, C, M = D[name + '_P'], D[name + '_UV'], D[name + '_C'], D[name + '_M']
    if not len(M): continue
    n = len(M)
    V = P.copy(); V[:, 1] *= -1
    faces = [(3 * k, 3 * k + 2, 3 * k + 1) for k in range(n)]           # reversed (mirror)
    me = bpy.data.meshes.new(name); me.from_pydata(V.tolist(), [], faces)
    for m in mats: me.materials.append(bpy.data.materials.get(m) or bpy.data.materials.new(m))
    me.polygons.foreach_set('material_index', M.astype(np.int32))
    order = np.array(faces).reshape(-1)                                  # loop k of face f = vertex faces[f][k]
    for lname, data in (('UVMap', UV), ('C1', C[:, :2]), ('C2', np.c_[C[:, 2], np.zeros(len(C))])):
        uv = me.uv_layers.new(name=lname); uv.data.foreach_set('uv', data[order].astype(np.float32).reshape(-1))
    me.validate(); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    print('OBJ', name, n, 'tris')
bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, 'out', 'urban.glb' if SET == 'urban_mesh' else SET + '.glb'), export_format='GLB')
print('URBAN glb done')
