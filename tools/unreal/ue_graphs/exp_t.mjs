// PIE outdoors in daylight: full editor screenshots (on-screen messages included) with r.EyeAdaptation.CachedLightingPreExposure = each arg.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { init, call, py } from './ue.mjs';
await init();
const [SP, ...vals] = process.argv.slice(2);
const SL = 'SlateInspectorToolset.SlateInspectorToolset';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const fg = () => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${SP}/fg.ps1"`);
const H = fs.readFileSync('zoom_t.mjs', 'utf8').split('const H = `')[1].split('`;')[0];
const shot = async (n) => { const r = await call(SL, 'Screenshot', { ref: '' }); const d = r.data || (r.image && r.image.data) || (r.returnValue && r.returnValue.data); fs.writeFileSync(`${SP}/${n}.png`, Buffer.from(d, 'base64')); };
await call('EditorToolset.EditorAppToolset', 'StopPIE', {}).catch(() => {});
await wait(2); fg();
await call('EditorToolset.EditorAppToolset', 'StartPIE', { options: { bSimulate: false, playMode: 'PlayMode_InViewPort' } }).catch(() => {});
await wait(13); fg();
await py(H + process.env.SPOT);
await wait(8);
for (const v of vals) {
  await py(H + `unreal.SystemLibrary.execute_console_command(w, "r.EyeAdaptation.CachedLightingPreExposure ${v}")`);
  await wait(4); fg(); await wait(1);
  await shot(`exp_${v}`); console.log('shot', v);
}
