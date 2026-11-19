// Editor-world comparison: three Mannequins 160/40, 176/46, 190/52 (height / shoulders cm), viewport capture, then removed.
import fs from 'node:fs';
import { init, call, py } from './ue.mjs';
await init();
const SP = process.argv[2];
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const APP = 'EditorToolset.EditorAppToolset';
await call(APP, 'StopPIE', {}).catch(() => {});
await wait(2);
console.log(await py(`
import unreal
sk = unreal.load_asset("/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple")
idle = unreal.load_asset("/Game/Characters/Mannequins/Anims/Unarmed/MM_Idle")
for i, (h, s) in enumerate([(160, 40), (176, 46), (190, 52)]):
    a = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.SkeletalMeshActor, unreal.Vector(3000 + (i - 1) * 85, 1450, 2), unreal.Rotator(0, 0, 180))
    a.tags = ["MCmp"]; a.set_actor_label("MCmp_%d" % h)
    c = a.skeletal_mesh_component
    c.set_skinned_asset_and_update(sk)
    c.set_editor_property("animation_mode", unreal.AnimationMode.ANIMATION_SINGLE_NODE)
    c.set_editor_property("animation_data", unreal.SingleAnimationPlayData(anim_to_play=idle, saved_position=0.5))
    a.set_actor_scale3d(unreal.Vector(s / 46.0, h / 180.5, h / 180.5))
print("ok")`).catch((e) => e.message.slice(-600)));
await wait(2);
const tr = { location: { x: 3000, y: 1130, z: 110 }, rotation: { pitch: -3, yaw: 90, roll: 0 }, scale: { x: 1, y: 1, z: 1 } };
await call(APP, 'SetCameraTransform', { transform: tr });
await wait(2);
const r = await call(APP, 'CaptureViewport', { captureTransform: tr, annotations: { gridSpacing: 0, gridExtent: 0, gridHeight: 0, maxLabelDistance: 0, classFilter: { refPath: '' }, maxLabels: 0 }, bShowUI: false });
const d = r.image && r.image.data;
if (d) fs.writeFileSync(`${SP}/m_cmp.png`, Buffer.from(d, 'base64')); else console.log(JSON.stringify(r).slice(0, 400));
console.log(await py(`
import unreal
for a in unreal.EditorLevelLibrary.get_all_level_actors():
    if a.actor_has_tag("MCmp"): a.destroy_actor()
print("removed", len([a for a in unreal.EditorLevelLibrary.get_all_level_actors() if a.actor_has_tag("MCmp")]))`));
