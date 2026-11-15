# Inside the editor of ObodMaskanUE2 (tools/unreal/ue.py, shot.ps1 runs it): one picture from a camera of the level.
#   ue.py tools/ue2/ue_shot.py <camera> <file.png> [width height]
# The sun is turned per camera so that the facade in view is lit from the side (the street side for most views,
# the courtyard for 'hovli'). Queued: the editor writes the file on its next frames (r.HighResScreenshotDelay = 8).
import sys

import unreal

SUN = {
    'hovli': (0.5, -0.65, -0.56),
}
SUN_DEFAULT = (-0.55, 0.62, -0.56)          # light travelling toward +Y: the street facade (−Y) lit from the right


def main(cam_name, out, w=1600, h=900):
    # cinematic Lumen / reflections / shadows and 120 settling frames: at the editor's Epic the shaded parts were grainy
    for c in ('sg.GlobalIlluminationQuality 4', 'sg.ReflectionQuality 4', 'sg.ShadowQuality 4', 'r.HighResScreenshotDelay 120'):
        unreal.SystemLibrary.execute_console_command(None, c)
    by = {a.get_actor_label(): a for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()}
    d = SUN.get(cam_name, SUN_DEFAULT)
    by['Quyosh'].set_actor_rotation(unreal.MathLibrary.make_rot_from_x(unreal.Vector(*d)), False)
    cam = by['Kamera_' + cam_name]
    unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).set_level_viewport_camera_info(cam.get_actor_location(), cam.get_actor_rotation())
    unreal.AutomationLibrary.take_high_res_screenshot(int(w), int(h), out, cam, False, False, unreal.ComparisonTolerance.LOW, '', 0.0)
    print('queued', out)


a = sys.argv[1:]
main(a[0], a[1], *(int(x) for x in a[2:4]))
