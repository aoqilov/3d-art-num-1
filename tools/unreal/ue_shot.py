# Inside the editor (ue.py runs it): one picture from a camera of the level at an hour of the web app.
#   ue.py tools/unreal/ue_shot.py <camera> <hour> <file.png> [width height]
# Queued: the editor writes it on its next frames, and only while it is the foreground window (shot.ps1 brings it
# forward). No delay: the automation timer drops long frame deltas, so at a low frame rate it never ran out;
# r.HighResScreenshotDelay (8 frames, project config) already lets Lumen settle.
import json
import sys

import unreal

SRC = 'D:/3d-aps/ObodMaskanUE/Import'


def main(cam_name, hour, out, w=1600, h=900):
    scene = json.load(open(SRC + '/scene.json', encoding='utf-8'))
    by = {a.get_actor_label(): a for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()}
    s = scene['sun'][str(hour)]
    by['Quyosh'].set_actor_rotation(unreal.MathLibrary.make_rot_from_x(unreal.Vector(-s[0], -s[2], -s[1])), False)
    cam = by['Kamera_' + cam_name]
    unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).set_level_viewport_camera_info(cam.get_actor_location(), cam.get_actor_rotation())
    unreal.AutomationLibrary.take_high_res_screenshot(int(w), int(h), out, cam, False, False, unreal.ComparisonTolerance.LOW, '', 0.0)
    print('queued', out)


a = sys.argv[1:]
main(a[0], int(a[1]), a[2], *(int(x) for x in a[3:5]))
