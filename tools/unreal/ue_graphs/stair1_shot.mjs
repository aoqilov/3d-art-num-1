// Storey-1 stair hall views (plan coords -> Unreal: x = 1500 + 100 px, y = -1500 + 100 py, z = 2 + cm).
// node stair1_shot.mjs <outdir> <prefix>
import fs from 'node:fs';
import { init, call } from './ue.mjs';
await init();
const [DIR, P] = process.argv.slice(2);
const APP = 'EditorToolset.EditorAppToolset';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
await call(APP, 'StopPIE', {}).catch(() => {});
const U = (px, py, h) => ({ x: 1500 + 100 * px, y: -1500 + 100 * py, z: 2 + h });
const views = [
  ['corr', U(11.7, 17.4, 170), { pitch: -12, yaw: -100 }],     // from the courtyard entrance corridor toward the stair
  ['left', U(10.3, 17.2, 170), { pitch: -12, yaw: -90 }],      // the strip left of the wall
  ['court', U(11.2, 21.0, 160), { pitch: 2, yaw: -90 }],
  ['court2', U(13.6, 20.2, 150), { pitch: 0, yaw: -125 }],     // the entrance door at an angle       // from the courtyard, facing the entrance
];
for (const [n, loc, rot] of views) {
  const tr = { location: loc, rotation: { ...rot, roll: 0 }, scale: { x: 1, y: 1, z: 1 } };
  await call(APP, 'SetCameraTransform', { transform: tr });
  await wait(5);
  const r = await call(APP, 'CaptureViewport', { captureTransform: tr, annotations: { gridSpacing: 0, gridExtent: 0, gridHeight: 0, maxLabelDistance: 0, classFilter: { refPath: '' }, maxLabels: 0 }, bShowUI: false });
  fs.writeFileSync(`${DIR}/${P}_${n}.png`, Buffer.from(r.image.data, 'base64')); console.log('shot', n);
}
