# Lowers the landscape inside the complex site (out/landscape_dent.json, dent_tris.py: site outline shrunk 1 m) to
# DEPTH_CM, so the courtyard ground mesh (driveways 10 cm below the block base) and later the underground parking are not
# covered by it. The courtyard mesh hides the dent from above; the slope falls inside its 1 m edge.
# How: fill a float render target with the flat base height (the landscape was flattened to z = 0 by
# flatten_landscape.py), draw the triangles over it in the target height with a Canvas (checked: exact bytes; R = high
# byte, G = low byte), import it into edit layer 0 (layer 1 "Flat Middle" is neutral).
# DO NOT use landscape_export_heightmap_to_render_target here: with World Partition it returned 0 for the whole map and
# the import sank the landscape to -255 m (2026-11-20). The heightmap import is NOT undoable; set DEPTH_CM = 0 to undo.
import unreal, json
DEPTH_CM = globals().get("DEPTH_CM", -600.0)
RL = unreal.RenderingLibrary
acts = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
L = [a for a in acts if a.get_class().get_name() == 'Landscape'][0]
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
sc = L.get_actor_scale3d(); org = L.get_actor_location()
xmin, xmax = 1e12, -1e12
for a in acts:
    if a.get_class().get_name() in ('LandscapeStreamingProxy', 'Landscape'):
        o, e = a.get_actor_bounds(False); xmin = min(xmin, o.x - e.x); xmax = max(xmax, o.x + e.x)
size = int(round((xmax - xmin) / sc.x)) + 1
# height code h: z = org.z + (h - 32768) / 128 * sc.z
code = lambda z_cm: int(round(32768 + (z_cm - org.z) * 128.0 / sc.z))
h, h0 = code(DEPTH_CM), code(0.0)
col = unreal.LinearColor((h >> 8) / 255.0, (h & 255) / 255.0, 0.0, 1.0)
tris = json.load(open(r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/out/landscape_dent.json"))['tris']
rt = RL.create_render_target2d(world, size, size, unreal.TextureRenderTargetFormat.RTF_RGBA32F)
RL.clear_render_target2d(world, rt, unreal.LinearColor((h0 >> 8) / 255.0, (h0 & 255) / 255.0, 0.0, 1.0))
print('size', size, 'h', h, 'base', h0)
P = lambda x, y: unreal.Vector2D((x - org.x) / sc.x + 0.5, (y - org.y) / sc.y + 0.5)
if True:
    canvas, _, ctx = RL.begin_draw_canvas_to_render_target(world, rt)
    T = []
    for t in tris:
        u = unreal.CanvasUVTri()
        for k in range(3):
            u.set_editor_property("v%d_pos" % k, P(t[2 * k], t[2 * k + 1])); u.set_editor_property("v%d_color" % k, col)
        T.append(u)
    canvas.draw_triangles(None, T)
    RL.end_draw_canvas_to_render_target(world, ctx)
    print('import', L.landscape_import_heightmap_from_render_target(rt, True, 0))
L.force_layers_full_update()
c = RL.read_render_target_raw_uv(world, rt, *[((v - org.x) / sc.x + 0.5) / size for v in (2985.0, -1500.0)])
print('dent done, height code at block 1', round(c.r * 255) * 256 + round(c.g * 255), 'target', h)
