# Inside the editor (ue.py runs it): the web app's broadleaf trees (owner's daraxt.glb, ~800 triangles of leaf
# cards) -> a fully modelled Poly Haven tree (CC0, Nanite), same places, same heights.
#   ue.py tools/unreal/ue_trees.py <asset> [labels]   e.g. tree_small_02 trees_9,trees_10
# asset: downloaded by polyhaven.mjs; labels: the instanced actors to change (default: every broadleaf variant).
# The instances are rebuilt from scene.json each time (re-runnable, any tree for any group).
import json
import os
import struct
import sys

import unreal

SRC = 'D:/3d-aps/ObodMaskanUE/Import'
PH = 'D:/3d-aps/ObodMaskanUE/Assets/polyhaven'
IMP = '/Game/Obod/Import'
DST = '/Game/Obod/Daraxt'
eal = unreal.EditorAssetLibrary
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)


def glb_triangles(path):
    """triangles of a .glb from its JSON chunk (index accessors)"""
    with open(path, 'rb') as f:
        f.read(12)
        n, _ = struct.unpack('<II', f.read(8))
        j = json.loads(f.read(n))
    return sum(j['accessors'][p['indices']]['count'] // 3 for m in j['meshes'] for p in m['primitives'] if 'indices' in p)


def broadleaf_assets():
    """the exported variants of daraxt.glb: ~800 triangles (pack.glb conifers / bushes / tufts have far fewer)"""
    return [f[2:-4] for f in os.listdir(SRC)
            if f.startswith('a_trees_') and f.endswith('.glb') and 600 < glb_triangles(SRC + '/' + f) < 1000]


def meshes(folder):
    return [unreal.load_asset(p) for p in eal.list_assets(folder, recursive=True)
            if eal.find_asset_data(p).asset_class_path.asset_name == 'StaticMesh']


def import_tree(name):
    """the tree's parts (trunk, branches, leaves) combined into one static mesh"""
    folder = DST + '/' + name
    if not eal.does_directory_have_assets(folder) or len(meshes(folder)) != 1:
        if eal.does_directory_exist(folder):
            eal.delete_directory(folder)
        res = '2k' if os.path.exists('%s/%s/%s_2k.gltf' % (PH, name, name)) else '1k'
        t = unreal.AssetImportTask()
        t.filename = '%s/%s/%s_%s.gltf' % (PH, name, name, res)
        t.destination_path = folder
        t.automated = True
        t.replace_existing = True
        t.save = True
        p = unreal.InterchangeGenericAssetsPipeline()
        p.mesh_pipeline.combine_static_meshes = True
        t.options = p
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([t])
    ms = meshes(folder)
    print('  %d mesh(es) in %s' % (len(ms), folder))
    tree = max(ms, key=height)
    solid_leaves(tree)
    # Nanite simplifies thin leaves away with distance (bare twigs from the street and from above):
    # UE 5.8's foliage path voxelizes the crown far away, so it keeps its volume
    ns = tree.get_editor_property('nanite_settings')
    if ns.get_editor_property('shape_preservation') != unreal.NaniteShapePreservation.VOXELIZE:
        ns.set_editor_property('shape_preservation', unreal.NaniteShapePreservation.VOXELIZE)
        tree.set_editor_property('nanite_settings', ns)
        eal.save_loaded_asset(tree)
        print('  nanite: voxelized far away (foliage)')
    return tree


def solid_leaves(mesh):
    """Poly Haven marks the leaves BLEND (their JPEG has no alpha: the leaves are modelled); Nanite draws no
    translucent material, so they vanished -> opaque, two-sided"""
    for s in mesh.static_materials:
        mi = s.material_interface
        if not isinstance(mi, unreal.MaterialInstanceConstant) or 'leaves' not in mi.get_name():
            continue
        o = mi.get_editor_property('base_property_overrides')
        o.set_editor_property('override_blend_mode', True); o.set_editor_property('blend_mode', unreal.BlendMode.BLEND_OPAQUE)
        o.set_editor_property('override_two_sided', True); o.set_editor_property('two_sided', True)
        mi.set_editor_property('base_property_overrides', o)
        unreal.MaterialEditingLibrary.update_material_instance(mi)
        eal.save_loaded_asset(mi)
        print('  leaves opaque, two-sided:', mi.get_name())


def height(mesh):
    b = mesh.get_bounding_box()
    return b.max.z - b.min.z


def transform(e, k):
    """three.js column-major 4x4 (m, Y up) -> Unreal transform (cm, Z up), scaled by k (as ue_build.transform)"""
    s = (0, 2, 1)
    L = [[e[c * 4 + r] for c in range(3)] for r in range(3)]
    Lp = [[L[s[i]][s[j]] for j in range(3)] for i in range(3)]
    col = [unreal.Vector(Lp[0][j], Lp[1][j], Lp[2][j]) for j in range(3)]
    rot = unreal.MathLibrary.make_rot_from_xz(col[0], col[2])
    return unreal.Transform(unreal.Vector(e[12] * 100, e[14] * 100, e[13] * 100), rot,
                            unreal.Vector(col[0].length() * k, col[1].length() * k, col[2].length() * k))


def auto():
    """the pipeline's choice: the dense young tree everywhere, but the second web variant in the neighbourhood
    (the big groups) as the wide jacaranda — some variety in the streets"""
    scene = json.load(open(SRC + '/scene.json', encoding='utf-8'))
    groups = [(glb_triangles(SRC + '/a_' + l + '.glb'), len(scene['instances']['A_' + l]), l) for l in broadleaf_assets()]
    if not groups:
        return
    top = max(t for t, _, _ in groups)
    jac = [l for t, n, l in groups if t != top and n >= 500]
    main('tree_small_02', ','.join(l for _, _, l in groups if l not in jac))
    if jac:
        main('jacaranda_tree', ','.join(jac))


def main(name='tree_small_02', labels=''):
    """labels: comma-separated instanced actors to change (default: all broadleaf variants)"""
    if name == 'auto':
        return auto()
    scene = json.load(open(SRC + '/scene.json', encoding='utf-8'))
    tree = import_tree(name)
    h_new = height(tree)
    print('tree', tree.get_name(), 'height %.1f m' % (h_new / 100))
    want = set(labels.split(',')) if labels else set(broadleaf_assets())
    n = 0
    for a in actors.get_all_level_actors():
        label = a.get_actor_label()
        if label not in want:
            continue
        orig = meshes(IMP + '/a_' + label)[0]                 # the web app's tree: its height is the target
        k = height(orig) / h_new
        ts = [transform(e, k) for e in scene['instances']['A_' + label]]
        for c in a.get_components_by_class(unreal.InstancedStaticMeshComponent):
            c.clear_instances()
            c.set_static_mesh(tree)
            c.add_instances(ts, False, True)
            n += len(ts)
    print('trees replaced:', n, 'in', sorted(want))
    unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()


main(*(sys.argv[1:3] or ['auto']))
