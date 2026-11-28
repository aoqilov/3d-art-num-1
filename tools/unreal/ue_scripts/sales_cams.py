# Cameras for the web-style sales UI (WBP_Sales / WBP_Block): "SCam0" = the whole complex from above (web complex view),
# "SCam<N>" = block N from outside the complex, 3/4 from above (web block page, "Render burchagi"). Folder Sotuv/Kameralar.
# Safe to re-run (replaces the Sales_Cam* actors).   exec(open(r".../ue_scripts/sales_cams.py").read())
import unreal, math, os
exec(open(os.path.join(r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/ue_scripts", "kompleks_coords.py"), encoding="utf-8").read())
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

def look(frm, to):
    d = to - frm
    return unreal.Rotator(roll=0.0, pitch=math.degrees(math.atan2(d.z, math.hypot(d.x, d.y))), yaw=math.degrees(math.atan2(d.y, d.x)))

def cam(label, tag, pos, target, fov):
    a = eas.spawn_actor_from_class(unreal.CameraActor, pos, look(pos, target))
    a.set_actor_label(label); a.set_folder_path("Sotuv/Kameralar"); a.tags = [unreal.Name("Sotuv"), unreal.Name(tag)]
    a.set_editor_property("is_spatially_loaded", False)
    c = a.get_component_by_class(unreal.CameraComponent)
    c.set_editor_property("field_of_view", fov); c.set_editor_property("constrain_aspect_ratio", False)
    return a

with unreal.ScopedEditorTransaction("Sotuv kameralari"):
    for a in eas.get_all_level_actors():
        if a.get_actor_label().startswith("Sales_Cam"): eas.destroy_actor(a)
    cx, cy = web_to_ue(0.0, 0.0)                               # complex centre (web plan centre)
    C = unreal.Vector(cx, cy, 0.0)
    made = [cam("Sales_CamK", "SCam0", C + unreal.Vector(-17000, -21000, 19000), C + unreal.Vector(0, 0, 1500), 50.0)]
    for i in sorted(BLOCKS):
        bx, by = web_to_ue(*web_xz(i, BW / 2, BD / 2))         # block centre
        B = unreal.Vector(bx, by, 2400.0)
        o = unreal.Vector(bx - cx, by - cy, 0.0)
        o = o / max(o.length(), 1.0)
        a = math.radians(55.0 if i == 2 else -35.0)            # a 3/4 view; block 2 from the other side (the crane + construction stand in front)
        d = unreal.Vector(o.x * math.cos(a) - o.y * math.sin(a), o.x * math.sin(a) + o.y * math.cos(a), 0.0)
        made.append(cam("Sales_CamB%02d" % i, "SCam%d" % i, B + d * 16000 + unreal.Vector(0, 0, 7500), B, 50.0))
        # block page views (web: Hovli tomoni / Yon tomondan / Yuqoridan): courtyard side, side, straight-ish down
        side = unreal.Vector(-o.y, o.x, 0.0)
        made.append(cam("Sales_CamB%02dc" % i, "SCam%dc" % i, B - o * 14000 + unreal.Vector(0, 0, 6000), B, 50.0))
        made.append(cam("Sales_CamB%02ds" % i, "SCam%ds" % i, B + side * 15000 + unreal.Vector(0, 0, 4000), B, 50.0))
        made.append(cam("Sales_CamB%02dt" % i, "SCam%dt" % i, B + o * 2500 + unreal.Vector(0, 0, 17000), B - unreal.Vector(0, 0, 2400), 50.0))
print("sales cams", len(made), "saved", unreal.EditorLoadingAndSavingUtils.save_packages([m.get_package() for m in made], True))
