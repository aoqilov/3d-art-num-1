# Inside the editor (ue.py runs it): imports the exported .glb files (tools/unreal/export.mjs) into /Game/Obod/Import.
#   ue.py tools/unreal/ue_import.py            -> all files
#   ue.py tools/unreal/ue_import.py a_blok     -> files whose name starts with this
import os
import sys
import time

import unreal

SRC = 'D:/3d-aps/ObodMaskanUE/Import'
DST = '/Game/Obod/Import'
LEVEL = '/Game/Obod/Majmua'


def import_glb(path, dest):
    task = unreal.AssetImportTask()
    task.filename = path
    task.destination_path = dest
    task.automated = True
    task.replace_existing = True
    task.replace_existing_settings = True
    task.save = True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    return list(task.imported_object_paths)


def clean():
    """a fresh start: the export numbers its pieces anew each time, so the old ones go (with the level's copies)"""
    eal = unreal.EditorAssetLibrary
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if eal.does_asset_exist(LEVEL):
        levels.load_level(LEVEL)
        for a in actors.get_all_level_actors():
            if 'obod' in [str(t) for t in a.tags]:
                actors.destroy_actor(a)
        levels.save_current_level()
    if eal.does_directory_exist(DST):
        eal.delete_directory(DST)


def main(prefix=''):
    files = sorted(f for f in os.listdir(SRC) if f.endswith('.glb') and f.startswith(prefix))
    t0 = time.time()
    if not prefix:
        clean()
    for f in files:
        name = f[:-4]
        got = import_glb(SRC + '/' + f, DST + '/' + name)
        meshes = [p for p in got if unreal.EditorAssetLibrary.find_asset_data(p).asset_class_path.asset_name == 'StaticMesh']
        print('%-22s %4d assets, %4d meshes  (%.0f s)' % (name, len(got), len(meshes), time.time() - t0))


main(sys.argv[1] if len(sys.argv) > 1 else '')
