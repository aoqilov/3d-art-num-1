# Web courtyard plants (tools/yard_glb/out, built by tools/yard_glb/build.py from Poly Haven CC0 searsia_lucida /
# flower_gazania) -> one glb per plant in tools/unreal/kit_glb: yard_buta_0..2 (bushes 2.3 / 1.7 / 1.1 m),
# yard_hedge (1 x 1 x 1 m clipped hedge clump, base at 0), yard_gul_0..7 (gazania clumps).
#   D:/blender-program/blender.exe -b --factory-startup -P tools/unreal/yard_split.py
import bpy, os
HERE = os.path.dirname(os.path.abspath(__file__)); SRC = os.path.join(HERE, '..', 'yard_glb', 'out'); OUT = os.path.join(HERE, 'kit_glb')
for f, rename in (('buta', 'yard_buta'), ('buta_tosiq', 'yard_hedge'), ('gul', 'yard_gul')):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, f + '.glb'))
    obs = sorted([o for o in bpy.context.scene.objects if o.type == 'MESH'], key=lambda o: o.name)
    for i, o in enumerate(obs):
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        name = rename if len(obs) == 1 else '%s_%d' % (rename, i)
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True, export_apply=True)
        print('SPLIT', name, tuple(round(v, 2) for v in o.dimensions))
