# Typical storey only, both street corners:  blender -b tools/unreal/out/blok1_full.blend -P tools/unreal/preview_typ.py
import bpy, math, os
from mathutils import Vector
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
for o in list(bpy.data.objects):
    if not o.name.startswith('Blok1_F1_'): bpy.data.objects.remove(o)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x, sc.render.resolution_y = 1400, 900
w = bpy.data.worlds.new('w'); sc.world = w
try: w.use_nodes = True
except Exception: pass
nt = w.node_tree; nt.nodes.clear()
bg = nt.nodes.new('ShaderNodeBackground'); wo = nt.nodes.new('ShaderNodeOutputWorld'); nt.links.new(bg.outputs[0], wo.inputs['Surface'])
bg.inputs['Color'].default_value = (0.55, 0.68, 0.85, 1)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 4.0; sun.rotation_euler = (math.radians(50), 0, math.radians(200))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
def shot(name, loc, at, lens=30):
    cam.location = loc; cam.data.lens = lens
    cam.rotation_euler = (Vector(at) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
shot('pv_f1_shop', (3.2, -0.3, 1.7), (3.2, -6.5, 0.9), 18)
shot('pv_f1_hall', (15.8, -17.5, 1.7), (15.8, -12.0, 1.0), 18)
shot('pv_f1_top', (15, -4, 18), (15, -4.01, 0), 26)
