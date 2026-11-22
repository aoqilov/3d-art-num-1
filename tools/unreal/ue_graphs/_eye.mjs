import fs from 'node:fs';
import { init, call, py } from './ue.mjs';
await init();
const APP = 'EditorToolset.EditorAppToolset';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const SP = process.argv[2], night = process.argv[3] === 'night';
const views = JSON.parse(process.argv[4]);
let saved = null;
if (night) saved = String(await py(`import unreal
s=[a for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors() if isinstance(a, unreal.DirectionalLight)][0]
r=s.get_actor_rotation(); print(r.pitch, r.yaw, r.roll)
s.set_actor_rotation(unreal.Rotator(roll=r.roll, pitch=8.0, yaw=r.yaw), False)`)).trim().split(/\s+/).map(Number);
for (const [n, loc, rot] of views) {
  const tr = { location: loc, rotation: { ...rot, roll: 0 }, scale: { x: 1, y: 1, z: 1 } };
  await call(APP, 'SetCameraTransform', { transform: tr }); await wait(night ? 14 : 8);
  const r = await call(APP, 'CaptureViewport', { captureTransform: tr, annotations: { gridSpacing: 0, gridExtent: 0, gridHeight: 0, maxLabelDistance: 0, classFilter: { refPath: '' }, maxLabels: 0 }, bShowUI: false });
  fs.writeFileSync(`${SP}/${n}.png`, Buffer.from(r.image.data, 'base64')); console.log('shot', n);
}
if (saved) await py(`import unreal
s=[a for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors() if isinstance(a, unreal.DirectionalLight)][0]
s.set_actor_rotation(unreal.Rotator(roll=${saved[2]}, pitch=${saved[0]}, yaw=${saved[1]}), False)
print('restored')`);
