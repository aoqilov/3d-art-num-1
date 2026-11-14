// npm run unreal — the whole way from the web app to the Unreal level, with the editor open on ObodMaskanUE:
// export (browser) -> import (fresh) -> level -> material fixes -> look. Needs the dev server on :5173.
// Steps can be picked: node tools/unreal/run.mjs build materials tune
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const PY = process.env.UE_PYTHON ?? 'D:/UE_5.8/Engine/Binaries/ThirdParty/Python3/Win64/python.exe';
// look: the renders' colours and air; fasad: clean block facade; trees: Poly Haven trees (downloaded once:
// node tools/unreal/polyhaven.mjs tree_small_02 2k; ... jacaranda_tree 1k)
const all = ['export', 'import', 'build', 'materials', 'tune', 'look', 'fasad', 'cameras', 'trees'];
const steps = process.argv.length > 2 ? process.argv.slice(2) : all;

const run = (cmd, args) => {
  const t = Date.now();
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: path.resolve(here, '../..') });
  if (r.status !== 0) { console.error(`failed: ${cmd} ${args.join(' ')}`); process.exit(1); }
  console.log(`  (${((Date.now() - t) / 1000).toFixed(0)} s)`);
};
for (const s of steps) {
  console.log(`== ${s}`);
  if (s === 'export') {
    run('node', [path.join(here, 'export.mjs')]);
    // the ground textures for the Unreal ground material
    run('node', ['-e', "const s=require('sharp');(async()=>{for(const n of ['dirt','grass'])await s('public/ground/'+n+'.webp').jpeg({quality:92}).toFile('../ObodMaskanUE/Import/yer_'+n+'.jpg')})()"]);
  } else run(PY, [path.join(here, 'ue.py'), path.join(here, `ue_${s}.py`)]);
}
