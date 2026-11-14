# Inside the editor (ue.py runs it): extra cameras like the developer's renders (eye level in the courtyard, from
# the street, a high aerial). Positions in the web app's coordinates (metres, Y up). Re-runnable.
import json
import math

import unreal

actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

# name: (position, target, vertical fov) — shared with webshot.mjs (cameras.json); 'kocha' stands on the south
# street (its centre line: context.json dashes)
_J = json.load(open('D:/3d-aps/art-house-obodmaskan/tools/unreal/cameras.json', encoding='utf-8'))
CAMS = {k: (tuple(v['pos']), tuple(v['target']), v['vfov']) for k, v in _J.items() if not k.startswith('_')}


def V(x, y, z):
    return unreal.Vector(x * 100, z * 100, y * 100)


def main():
    by = {a.get_actor_label(): a for a in actors.get_all_level_actors()}
    for name, (p, t, fov) in CAMS.items():
        old = by.get('Kamera_' + name)
        if old:
            actors.destroy_actor(old)
        loc, tgt = V(*p), V(*t)
        cam = actors.spawn_actor_from_class(unreal.CineCameraActor, loc, unreal.MathLibrary.make_rot_from_x(tgt - loc))
        cam.set_actor_label('Kamera_' + name)
        cam.tags = ['obod']
        cam.set_folder_path('Obod/Kameralar')
        cc = cam.get_cine_camera_component()
        fb = cc.filmback
        fb.sensor_width, fb.sensor_height = 36.0, 20.25
        cc.filmback = fb
        cc.current_focal_length = (20.25 / 2) / math.tan(math.radians(fov / 2))
        fs = cc.focus_settings
        fs.focus_method = unreal.CameraFocusMethod.DISABLE
        cc.focus_settings = fs
        print('camera', name)
    unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()


main()
