# Light "finished block" for the other blocks of the complex (owner 2026-11-20: the complex like the web app, every block
# drawn with the block-1 model). From tools/unreal/out/blok1_full.blend (run build_f12.py first):
#   storeys 1, 2 and 3-16 stacked (Typ copied 14 x, storeys 8-16 with the white facade), the facade parts (portal, brick,
#   lattice, signs), window frames and glass. The storey shells keep their inner walls / ceilings / slabs (2026-11-20:
#   a hollow block showed the sky through its windows); the frames lose lamps, radiators, boilers and handles; the
#   balcony-door leaves (separate actors in block 1, walk.json "balc") become dark glass panes so no opening is empty.
#   No floors / room doors / lifts / furniture. One mesh, pivot = block plan origin (street facade at plan y = 0).
#   D:/blender-program/blender.exe -b tools/unreal/out/blok1_full.blend -P tools/unreal/build_lite.py
#   -> tools/unreal/out/blok_lite.glb
import bpy, bmesh, os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
FLOOR_H = 3.0
INTERIOR = {'M_Plaster', 'M_PaintPublic', 'M_Ceiling', 'M_CeilPublic', 'M_Stair', 'M_Concrete', 'M_SillIn', 'M_Screed',
            'M_FloorWood', 'M_FloorTile', 'M_FloorStone', 'M_FloorDeck', 'M_FloorShop', 'M_Radiator', 'M_Boiler',
            'M_LampPublic', 'M_LightRim', 'M_LightEmit', 'M_Spot', 'M_DoorWood', 'M_Steel', 'M_LiftBtn', 'M_Handle'}
KEEP_STOREY = ('_Shell', '_Frames', '_Glass', 'WallCut')
white = bpy.data.materials.get('M_FacadeWhite'); mint = bpy.data.materials.get('M_FacadeMint')

def strip(me):
    """Delete faces with interior materials from a mesh datablock (in place)."""
    bm = bmesh.new(); bm.from_mesh(me)
    bad = [f for f in bm.faces if me.materials[f.material_index] and me.materials[f.material_index].name in INTERIOR]
    bmesh.ops.delete(bm, geom=bad, context='FACES'); bm.to_mesh(me); bm.free()

src = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Blok1_')]
parts = []
def take(o, dz=0.0, to_white=False):
    me = o.data.copy()
    if to_white and white and mint:
        for i, m in enumerate(me.materials):
            if m == mint: me.materials[i] = white
    c = bpy.data.objects.new(o.name + '_L', me); bpy.context.collection.objects.link(c)
    c.matrix_world = o.matrix_world.copy(); c.location.z += dz
    parts.append(c)
stripped = set()
for o in src:
    n = o.name[len('Blok1_'):]
    if n.startswith('Fac_') or n == 'Signs':
        take(o)
    elif n.startswith(('F1_', 'F2_', 'Typ_')) and n.endswith(KEEP_STOREY):
        if n.endswith('_Frames') and o.data.name not in stripped: strip(o.data); stripped.add(o.data.name)
        if n.startswith('F1_'): take(o)
        elif n.startswith('F2_'): take(o, FLOOR_H)
        else:
            for s in range(3, 17): take(o, (s - 1) * FLOOR_H, to_white=s >= 8)
# balcony-door leaves as closed glass panes (leaf from the hinge along its "closed" yaw, plan coords, storey-local z)
import json, math
walk = json.load(open(os.path.join(OUT, 'walk.json'), encoding='utf-8'))
glass = bpy.data.materials.get('M_Glass')
pm = bpy.data.meshes.new('BalcPanes'); bm = bmesh.new()
for key, storeys in (('F2', [2]), ('Typ', range(3, 17))):
    for d in walk.get('balc', {}).get(key, []):
        hx, hy = d['hinge']; a = math.radians(d['closed']); w = d['width']
        ex, ey = hx + w * math.cos(a), hy + w * math.sin(a)
        for st in storeys:
            z0 = (st - 1) * FLOOR_H + d['z']; z1 = z0 + d['height']
            vs = [bm.verts.new((hx, -hy, z0)), bm.verts.new((ex, -ey, z0)), bm.verts.new((ex, -ey, z1)), bm.verts.new((hx, -hy, z1))]
            bm.faces.new(vs); bm.faces.new(list(reversed([bm.verts.new(v.co) for v in vs])))
bm.to_mesh(pm); bm.free(); pm.materials.append(glass)
po = bpy.data.objects.new('BalcPanes', pm); bpy.context.collection.objects.link(po); parts.append(po)
print('balcony panes', len(pm.polygons) // 2)
for o in src: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for p in parts: p.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
lite = bpy.context.object; lite.name = 'Blok_Lite'; lite.data.name = 'Blok_Lite'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
tris = sum(len(p.vertices) - 2 for p in lite.data.polygons)
print('LITE tris', tris, 'materials', [m.name for m in lite.data.materials])
for o in list(bpy.data.objects):
    if o != lite: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'blok_lite.glb'), export_format='GLB', export_yup=True,
                          export_apply=True, export_image_format='NONE')
print('DONE')
