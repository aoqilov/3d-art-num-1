# Preview renders of tools/unreal/out/blok1_f12.blend:  blender -b tools/unreal/out/blok1_f12.blend -P tools/unreal/preview.py
import bpy, math, os
from mathutils import Vector
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x, sc.render.resolution_y = 1600, 900
w = bpy.data.worlds.new('w'); sc.world = w
try: w.use_nodes = True
except Exception: pass
nt = w.node_tree; nt.nodes.clear()
bg = nt.nodes.new('ShaderNodeBackground'); wo = nt.nodes.new('ShaderNodeOutputWorld'); nt.links.new(bg.outputs[0], wo.inputs['Surface'])
bg.inputs['Color'].default_value = (0.55, 0.68, 0.85, 1); bg.inputs['Strength'].default_value = 1.0
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 4.0; sun.rotation_euler = (math.radians(50), 0, math.radians(200))
try: sc.view_settings.view_transform = 'AgX'
except Exception: pass
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
def shot(name, loc, at, lens=28):
    cam.location = loc; cam.data.lens = lens
    d = Vector(at) - Vector(loc); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
shot('pv_street', (8, 26, 4), (14.85, 0, 3.0), 24)
shot('pv_portal', (14.85, 7.5, 1.7), (14.85, 0, 3.0), 24)
shot('pv_corner', (-7, 12, 7), (8, 0, 3), 24)
