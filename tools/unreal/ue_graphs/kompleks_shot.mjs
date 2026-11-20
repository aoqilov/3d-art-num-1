// Overview captures of the complex (editor viewport): from above and an oblique view from the south-west.
import fs from 'node:fs';
import { init, call, py } from './ue.mjs';
await init();
const [DIR, P] = process.argv.slice(2);
const APP = 'EditorToolset.EditorAppToolset';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const c = JSON.parse(String(await py(`
import unreal, json
xs=[]; ys=[]
for a in unreal.EditorLevelLibrary.get_all_level_actors():
    l=a.get_actor_label()
    if l.startswith("Kompleks_B") or l == "Blok2_Kran" or l.startswith("Blok1_Q01_C"):
        p=a.get_actor_location(); xs.append(p.x); ys.append(p.y)
print(json.dumps([sum(xs)/len(xs), sum(ys)/len(ys), min(xs), max(xs), min(ys), max(ys)]))`)).trim());
const [cx, cy] = c;
const views = [
  ['top', { x: cx, y: cy + 1500, z: 30000 }, { pitch: -89.5, yaw: -90 }],
  ['sw', { x: cx - 16000, y: cy + 15000, z: 9000 }, { pitch: -24, yaw: -45 }],
];
for (const [n, loc, rot] of views) {
  const tr = { location: loc, rotation: { ...rot, roll: 0 }, scale: { x: 1, y: 1, z: 1 } };
  await call(APP, 'SetCameraTransform', { transform: tr }); await wait(6);
  const r = await call(APP, 'CaptureViewport', { captureTransform: tr, annotations: { gridSpacing: 0, gridExtent: 0, gridHeight: 0, maxLabelDistance: 0, classFilter: { refPath: '' }, maxLabels: 0 }, bShowUI: false });
  fs.writeFileSync(`${DIR}/${P}_${n}.png`, Buffer.from(r.image.data, 'base64')); console.log('shot', n);
}
console.log('centre', c.map((v) => Math.round(v)));
