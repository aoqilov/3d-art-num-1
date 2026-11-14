# Inside the editor: the block mesh as Unreal holds it (mesh description, before the render build): triangles per
# section, how many have an edge over 4 m, the longest — to compare with checkglb.mjs on the exported file.
import math
import sys

import unreal

eal = unreal.EditorAssetLibrary
folder = sys.argv[1] if len(sys.argv) > 1 else '/Game/Obod/Import/a_blok'
mesh = [unreal.load_asset(p) for p in eal.list_assets(folder, recursive=True) if eal.find_asset_data(p).asset_class_path.asset_name == 'StaticMesh'][0]
md = mesh.get_static_mesh_description(0)
print('vertices', md.get_vertex_count(), 'triangles', md.get_triangle_count(), 'polygon groups', md.get_polygon_group_count())
stats = {}
for t in range(md.get_triangle_count()):
    tid = unreal.TriangleID(t) if hasattr(unreal, 'TriangleID') else t
    g = md.get_triangle_polygon_group(tid)
    vs = list(md.get_triangle_vertices(tid))[-3:]        # the binding returns junk before the 3 real ids
    p = [md.get_vertex_position(v) for v in vs]
    e = max((p[0] - p[1]).length(), (p[1] - p[2]).length(), (p[2] - p[0]).length()) / 100.0
    ar = (p[1] - p[0]).cross(p[2] - p[0]).length() / 2 / 10000.0
    s = stats.setdefault(g.id_value if hasattr(g, 'id_value') else str(g), [0, 0, 0.0, 0.0, 0])
    s[0] += 1
    if e > 4:
        s[1] += 1
    s[2] = max(s[2], e)
    s[3] += ar
    s[4] += ar < 1e-6
names = [m.material_slot_name for m in mesh.static_materials]
for k in sorted(stats, key=lambda x: int(x) if str(x).isdigit() else 0):
    n, l, mx, ar, dg = stats[k]
    print('group %s: %d tris, >4 m: %d, longest %.1f m, area %.1f m2, degenerate %d' % (k, n, l, mx, ar, dg))
print('slots:', [str(x) for x in names])
