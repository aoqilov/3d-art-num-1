# Web gallery / site images -> /Game/Blok1/UI/Gal (UI textures, no mips, never streamed). Safe to re-run.
import unreal, glob, os
SRC = r"C:/Users/user/Desktop/3esd/3d-art-num-1/dist"
D = "/Game/Blok1/UI/Gal"
AT = unreal.AssetToolsHelpers.get_asset_tools()
files = [(f, "T_G" + os.path.basename(f)[:-4]) for f in sorted(glob.glob(SRC + "/gal/*.jpg"))]
files += [(f, "T_GT" + os.path.basename(f)[:-4]) for f in sorted(glob.glob(SRC + "/gal/t/*.jpg"))]
files += [(SRC + "/pdf/b1-p2.jpg", "T_Gb1"), (SRC + "/plan.jpg", "T_Plan"), (SRC + "/sat.jpg", "T_Sat")]
tasks = []
for f, n in files:
    t = unreal.AssetImportTask(); t.filename = f; t.destination_path = D; t.destination_name = n
    t.automated = True; t.replace_existing = True; t.save = False
    tasks.append(t)
AT.import_asset_tasks(tasks)
ok = 0
for f, n in files:
    tx = unreal.load_asset(D + "/" + n)
    if not tx: print("missing", n); continue
    tx.set_editor_property("lod_group", unreal.TextureGroup.TEXTUREGROUP_UI)
    tx.set_editor_property("mip_gen_settings", unreal.TextureMipGenSettings.TMGS_NO_MIPMAPS)
    tx.set_editor_property("never_stream", True)
    tx.set_editor_property("srgb", True)
    unreal.EditorAssetLibrary.save_loaded_asset(tx, False); ok += 1
print("imported", ok, "of", len(files))
