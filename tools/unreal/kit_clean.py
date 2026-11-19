# Clean kit: every downloaded Poly Haven model -> one static mesh (animations / armatures removed, node transforms
# applied, parts joined, origin kept) -> tools/unreal/kit_glb/<id>.glb. Unreal then imports exactly one StaticMesh each.
#   D:/blender-program/blender.exe -b --factory-startup -P tools/unreal/kit_clean.py
import bpy, os, glob
HERE = os.path.dirname(os.path.abspath(__file__)); SRC = os.path.join(HERE, 'kit_src'); OUT = os.path.join(HERE, 'kit_glb')
os.makedirs(OUT, exist_ok=True)
for g in sorted(glob.glob(os.path.join(SRC, '*', '*.gltf'))):
    name = os.path.basename(os.path.dirname(g))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=g)
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in meshes:
        for m in list(o.modifiers):
            if m.type == 'ARMATURE': o.modifiers.remove(m)
        o.animation_data_clear()
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in [o for o in bpy.context.scene.objects if o.type != 'MESH']: bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = name; ob.data.name = name
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', export_apply=True, export_animations=False, export_skins=False)
    print('CLEAN', name, len(meshes), 'parts', len(ob.data.polygons), 'faces', len(ob.data.materials), 'mats')
