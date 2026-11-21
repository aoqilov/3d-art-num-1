// Courtyard plant captures (editor viewport) from fixed views, for before/after comparison of plants_setup.py.
// node plants_shot.mjs <dir> <prefix>
import fs from 'node:fs';
import { init, call } from './ue.mjs';
await init();
const [DIR, P] = process.argv.slice(2);
const APP = 'EditorToolset.EditorAppToolset';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
// boulevard strip with trees, hedge and flowers around plan (4300, -4450) cm
const views = [
  ['ped', { x: 3300, y: -3300, z: 170 }, { pitch: -4, yaw: -45 }],
  ['mid', { x: 2600, y: -2600, z: 2200 }, { pitch: -28, yaw: -45 }],
  ['road', { x: 3300, y: -2300, z: 250 }, { pitch: -12, yaw: -33 }],     // inner road near UE (4100, -2820): asphalt + curb
];
for (const [n, loc, rot] of views) {
  const tr = { location: loc, rotation: { ...rot, roll: 0 }, scale: { x: 1, y: 1, z: 1 } };
  await call(APP, 'SetCameraTransform', { transform: tr }); await wait(8);
  const r = await call(APP, 'CaptureViewport', { captureTransform: tr, annotations: { gridSpacing: 0, gridExtent: 0, gridHeight: 0, maxLabelDistance: 0, classFilter: { refPath: '' }, maxLabels: 0 }, bShowUI: false });
  fs.writeFileSync(`${DIR}/${P}_${n}.png`, Buffer.from(r.image.data, 'base64')); console.log('shot', n);
}
