# Inside the editor (ue.py runs it), after ue_look.py: a clean block facade.
#  - normal maps off on the block: Unreal shades them with per-vertex tangents, which the block's UVs do not give
#    everywhere (planar, collapsed on slab undersides and returns) -> each triangle of a quad lit differently: black
#    teeth under the balconies, diagonal streaks on the walls. The web app reads normal maps without tangents
#    (screen-space), so it never showed. At building scale the plaster relief adds little.
import unreal

IMP = '/Game/Obod/Import'
eal = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary


def block_mesh():
    for p in eal.list_assets(IMP + '/a_blok', recursive=True):
        if eal.find_asset_data(p).asset_class_path.asset_name == 'StaticMesh':
            return unreal.load_asset(p)


def flat_normals(mesh):
    flat = unreal.load_asset('/Engine/EngineMaterials/DefaultNormal')
    done = []
    for s in mesh.static_materials:
        mi = s.material_interface
        if not isinstance(mi, unreal.MaterialInstanceConstant):
            continue
        parent = mi.get_editor_property('parent').get_name()
        if parent.startswith('M_GLTF') or 'GLTF' in parent:
            mel.set_material_instance_scalar_parameter_value(mi, 'NormalScale', 0.0)
        elif parent == 'M_Obod_Pbr':
            mel.set_material_instance_texture_parameter_value(mi, 'NTex', flat)
        else:
            continue
        mel.update_material_instance(mi)
        eal.save_loaded_asset(mi)
        done.append(mi.get_name())
    print('normal maps off:', len(done), done)


flat_normals(block_mesh())
