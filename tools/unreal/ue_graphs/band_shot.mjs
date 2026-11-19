// Street facade under the canopy (storey-1 brick up to the canopy): editor viewport captures.
// node band_shot.mjs <outdir> <prefix>
import fs from 'node:fs';
import { init, call } from './ue.mjs';
await init();
const [DIR, P] = process.argv.slice(2);
const APP = 'EditorToolset.EditorAppToolset';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
await call(APP, 'StopPIE', {}).catch(() => {});
const U = (px, py, h) => ({ x: 1500 + 100 * px, y: -1500 + 100 * py, z: 2 + h });
const views = [
  ['up', U(20.5, -2.6, 165), { pitch: 22, yaw: 80 }],          // under the canopy looking up at a shop sign
  ['wide', U(14.85, -13, 220), { pitch: 6, yaw: 90 }],        // the whole street front
];
for (const [n, loc, rot] of views) {
  const tr = { location: loc, rotation: { ...rot, roll: 0 }, scale: { x: 1, y: 1, z: 1 } };
  await call(APP, 'SetCameraTransform', { transform: tr });
  await wait(5);
  const r = await call(APP, 'CaptureViewport', { captureTransform: tr, annotations: { gridSpacing: 0, gridExtent: 0, gridHeight: 0, maxLabelDistance: 0, classFilter: { refPath: '' }, maxLabels: 0 }, bShowUI: false });
  fs.writeFileSync(`${DIR}/${P}_${n}.png`, Buffer.from(r.image.data, 'base64')); console.log('shot', n);
}
