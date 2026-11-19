import unreal

acts = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
L = [a for a in acts if a.get_class().get_name() == 'Landscape'][0]
world = unreal.EditorLevelLibrary.get_editor_world()

# Landscape size in vertices
xmin, xmax = 1e12, -1e12
for a in acts:
    if a.get_class().get_name() in ('LandscapeStreamingProxy', 'Landscape'):
        o, e = a.get_actor_bounds(False)
        xmin = min(xmin, o.x - e.x); xmax = max(xmax, o.x + e.x)
size = int(round((xmax - xmin) / L.get_actor_scale3d().x)) + 1
print('verts', size)

rt = unreal.RenderingLibrary.create_render_target2d(
    world, size, size, unreal.TextureRenderTargetFormat.RTF_RGBA32F)

# Check encoding: export current heights, read the centre pixel
ok = L.landscape_export_heightmap_to_render_target(rt, True, True)
c = unreal.RenderingLibrary.read_render_target_raw_uv(world, rt, 0.5, 0.5)
print('export ok', ok, 'centre R', c.r)

if FLATTEN:
    with unreal.ScopedEditorTransaction("Landscape tekislash"):
        # Height is stored as R (high byte) + G (low byte). 32640 = z 0 (current centre).
        unreal.RenderingLibrary.clear_render_target2d(
            world, rt, unreal.LinearColor(127/255.0, 128/255.0, 0.0, 1.0))
        r0 = L.landscape_import_heightmap_from_render_target(rt, True, 0)
        # Second edit layer ("Flat Middle"): 32768 = no change
        unreal.RenderingLibrary.clear_render_target2d(
            world, rt, unreal.LinearColor(128/255.0, 0.0, 0.0, 1.0))
        r1 = L.landscape_import_heightmap_from_render_target(rt, True, 1)
        print('import', r0, r1)
    L.force_layers_full_update()
