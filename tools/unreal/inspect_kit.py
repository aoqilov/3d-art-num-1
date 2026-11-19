# Renders every downloaded kit model from Blender's front (-Y) at a 3/4 angle and prints its size; one PNG each.
import bpy, os, glob, math
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); SRC = os.path.join(HERE, 'kit_src'); OUT = os.path.join(HERE, 'out', 'kit_thumbs')
os.makedirs(OUT, exist_ok=True)
for g in sorted(glob.glob(os.path.join(SRC, '*', '*.gltf'))):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=g)
    obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(c) for o in obs for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    sz = mx - mn; c = (mn + mx) / 2
    name = os.path.basename(os.path.dirname(g))
    print('KIT', name, 'size x%.2f y%.2f z%.2f' % tuple(sz), 'min', tuple(round(v, 2) for v in mn))
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x = sc.render.resolution_y = 360
    w = bpy.data.worlds.new('w'); sc.world = w
    try: w.use_nodes = True
    except Exception: pass
    nt = w.node_tree; nt.nodes.clear(); bg = nt.nodes.new('ShaderNodeBackground'); wo = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(bg.outputs[0], wo.inputs['Surface']); bg.inputs['Color'].default_value = (0.8, 0.8, 0.8, 1)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    r = max(sz.x, sz.y, sz.z) * 2.2
    cam.location = c + Vector((r * 0.45, -r, r * 0.55))                 # from -Y (Blender front), a bit to the right
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
