# D3 of QOLGAN_ISHLAR.md: orbit fly-through of the complex. Level sequence /Game/Kompleks/Video/LS_Aylanma with a
# spawnable CineCameraActor circling the complex centre (ORBIT_DEG over SECONDS, radius / height easing in), a camera
# cut track, 30 fps. Rendered by ue_graphs/flythrough_render.mjs (Movie Render Queue -> JPG frames -> mp4 with OpenCV).
# Safe to re-run (the sequence is rebuilt in place, never deleted).
import unreal, math
AT = unreal.AssetToolsHelpers.get_asset_tools(); EAL = unreal.EditorAssetLibrary
D, N = "/Game/Kompleks/Video", "LS_Aylanma"
SECONDS, FPS, ORBIT_DEG = globals().get("SECONDS", 20), 30, globals().get("ORBIT_DEG", 160.0)
CX, CY = 2430.0, -830.0                                  # complex centre (cm)
R0, R1, H0, H1 = 26000.0, 16000.0, 14000.0, 6500.0       # radius / height at start -> end
if not EAL.does_directory_exist(D): EAL.make_directory(D)
p = D + "/" + N
seq = unreal.load_asset(p) if EAL.does_asset_exist(p) else AT.create_asset(N, D, unreal.LevelSequence, unreal.LevelSequenceFactoryNew())
for b in list(seq.get_bindings()): b.remove()
for t in list(seq.get_tracks()): seq.remove_track(t)
seq.set_display_rate(unreal.FrameRate(FPS, 1)); seq.set_tick_resolution(unreal.FrameRate(FPS, 1))
seq.set_playback_start(0); seq.set_playback_end(SECONDS * FPS)
cam = seq.add_spawnable_from_class(unreal.CineCameraActor)
tt = cam.add_track(unreal.MovieScene3DTransformTrack); sec = tt.add_section(); sec.set_range(0, SECONDS * FPS)
ch = sec.get_all_channels()                               # loc x y z, rot roll pitch yaw, scale x y z
def ease(t): return t * t * (3 - 2 * t)
prev_yaw = None
for k in range(SECONDS + 1):
    t = k / SECONDS; e = ease(t)
    a = math.radians(200.0 + ORBIT_DEG * t)
    r, h = R0 + (R1 - R0) * e, H0 + (H1 - H0) * e
    x, y = CX + r * math.cos(a), CY + r * math.sin(a)
    yaw = math.degrees(math.atan2(CY - y, CX - x)); pitch = -math.degrees(math.atan2(h - 1500.0, r))
    if prev_yaw is not None:                                 # keep the yaw continuous (no 360 spin)
        while yaw - prev_yaw > 180: yaw -= 360
        while yaw - prev_yaw < -180: yaw += 360
    prev_yaw = yaw
    f = unreal.FrameNumber(k * FPS)
    for c, v in ((ch[0], x), (ch[1], y), (ch[2], h), (ch[3], 0.0), (ch[4], pitch), (ch[5], yaw)):
        c.add_key(f, v, interpolation=unreal.MovieSceneKeyInterpolation.AUTO)
cc = cam.add_track(unreal.MovieSceneCameraComponentTrack) if hasattr(unreal, "MovieSceneCameraComponentTrack") else None
cut = seq.add_track(unreal.MovieSceneCameraCutTrack); cs = cut.add_section(); cs.set_range(0, SECONDS * FPS)
cs.set_camera_binding_id(seq.get_binding_id(cam))
EAL.save_loaded_asset(seq, False)
print("sequence ok", p, SECONDS * FPS, "frames")
