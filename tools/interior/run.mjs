// npm run interior [apt] — 360° rooms of a flat: the storey's geometry from the app (export.mjs), the Poly Haven
// assets (fetch.mjs, once), then Blender Cycles (build.py) → public/pano/apt<N>/ (panoramas + rooms.json).
// env passes through: PREVIEW=1 (quick 2048 px, 64 samples), ROOMS=living,kitchen, RES, SAMPLES, EXPOSURE.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const blender = process.env.BLENDER || (existsSync('D:/blender.exe') ? 'D:/blender.exe' : 'blender');
const apt = process.argv[2] ?? process.env.APT ?? '4';
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, APT: apt } });
run('node', ['tools/interior/export.mjs']);
run('node', ['tools/interior/fetch.mjs']);
run(blender, ['-b', '--factory-startup', '-P', 'tools/interior/build.py']);
