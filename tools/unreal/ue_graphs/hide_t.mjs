// Bisect what draws a surface: temporarily hide actors (editor only, not saved), capture the same view, unhide.
// node hide_t.mjs <outdir> <name> <label1,label2,...>   (labels may end with * for a prefix)
import fs from 'node:fs';
import { init, call, py } from './ue.mjs';
await init();
const [DIR, NAME, LIST] = process.argv.slice(2);
const U = (px, py, h) => ({ x: 1500 + 100 * px, y: -1500 + 100 * py, z: 2 + h });
const tr = { location: U(9.9, 11.0, 368), rotation: { pitch: -26.4, yaw: 28.2, roll: 0 }, scale: { x: 1, y: 1, z: 1 } };
const sel = `
import unreal
pats = ${JSON.stringify(LIST.split(','))}
def m(l): return any(l.startswith(p[:-1]) if p.endswith('*') else l == p for p in pats)
acts = [a for a in unreal.EditorLevelLibrary.get_all_level_actors() if m(a.get_actor_label())]
`;
console.log(await py(sel + `for a in acts: a.set_is_temporarily_hidden_in_editor(True)\nprint('hidden', len(acts))`));
await call('EditorToolset.EditorAppToolset', 'SetCameraTransform', { transform: tr });
await new Promise((r) => setTimeout(r, 5000));
const r = await call('EditorToolset.EditorAppToolset', 'CaptureViewport', { captureTransform: tr, annotations: { gridSpacing: 0, gridExtent: 0, gridHeight: 0, maxLabelDistance: 0, classFilter: { refPath: '' }, maxLabels: 0 }, bShowUI: false });
fs.writeFileSync(`${DIR}/${NAME}.png`, Buffer.from(r.image.data, 'base64'));
console.log(await py(sel + `for a in acts: a.set_is_temporarily_hidden_in_editor(False)\nprint('unhidden', len(acts))`));
