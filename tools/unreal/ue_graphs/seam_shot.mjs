// Gable-wall seam check: editor viewport captures of both gable walls (storeys 2-7) and a close-up of one storey seam.
// node seam_shot.mjs <outdir> <prefix>
import fs from 'node:fs';
import { init, call, py } from './ue.mjs';
await init();
const [DIR, P] = process.argv.slice(2);
const APP = 'EditorToolset.EditorAppToolset';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
await call(APP, 'StopPIE', {}).catch(() => {});
const b = JSON.parse(String(await py(`
import unreal, json
lo = [1e9] * 3; hi = [-1e9] * 3
for a in unreal.EditorLevelLibrary.get_all_level_actors():
    l = a.get_actor_label()
    if l.startswith("Blok1_Q05_") and l.endswith("Shell"):
        o, e = a.get_actor_bounds(False)
        for i, (c, d) in enumerate(((o.x, e.x), (o.y, e.y), (o.z, e.z))): lo[i] = min(lo[i], c - d); hi[i] = max(hi[i], c + d)
print(json.dumps([(lo[i] + hi[i]) / 2 for i in range(3)] + [(hi[i] - lo[i]) / 2 for i in range(3)]))`)).trim());
const [ox, oy, oz, ex, ey] = b;
const views = [
  ['gableW', { x: ox - ex - 900, y: oy, z: 1500 }, { pitch: 8, yaw: 0 }],
  ['gableE', { x: ox + ex + 900, y: oy, z: 1500 }, { pitch: 8, yaw: 180 }],
  ['closeW', { x: ox - ex - 120, y: oy - ey + 300, z: 2 + 4 * 300 + 40 }, { pitch: -8, yaw: 20 }],
];
for (const [n, loc, rot] of views) {
  const tr = { location: loc, rotation: { ...rot, roll: 0 }, scale: { x: 1, y: 1, z: 1 } };
  await call(APP, 'SetCameraTransform', { transform: tr });
  await wait(4);
  const r = await call(APP, 'CaptureViewport', { captureTransform: tr, annotations: { gridSpacing: 0, gridExtent: 0, gridHeight: 0, maxLabelDistance: 0, classFilter: { refPath: '' }, maxLabels: 0 }, bShowUI: false });
  fs.writeFileSync(`${DIR}/${P}_${n}.png`, Buffer.from(r.image.data, 'base64')); console.log('shot', n);
}
console.log('bounds', b.map((v) => Math.round(v)));
