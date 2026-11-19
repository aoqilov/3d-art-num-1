# Facade pieces only (absolute coordinates), close-ups:  blender -b tools/unreal/out/blok1_full.blend -P tools/unreal/preview_fac.py
import bpy, math, os
from mathutils import Vector
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
for o in list(bpy.data.objects):
    if not o.name.startswith('Blok1_Fac_'): bpy.data.objects.remove(o)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x, sc.render.resolution_y = 900, 1200
w = bpy.data.worlds.new('w'); sc.world = w
try: w.use_nodes = True
except Exception: pass
nt = w.node_tree; nt.nodes.clear()
bg = nt.nodes.new('ShaderNodeBackground'); wo = nt.nodes.new('ShaderNodeOutputWorld'); nt.links.new(bg.outputs[0], wo.inputs['Surface'])
bg.inputs['Color'].default_value = (0.55, 0.68, 0.85, 1)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 4.0; sun.rotation_euler = (math.radians(50), 0, math.radians(200))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
def shot(name, loc, at, lens=50):
    cam.location = loc; cam.data.lens = lens
    cam.rotation_euler = (Vector(at) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
shot('pv_pil_crown', (7.6, 4.5, 21.5), (6.42, 0, 21.0), 50)
shot('pv_pil_long', (9.0, 14, 14), (6.42, 0, 21.0), 40)
