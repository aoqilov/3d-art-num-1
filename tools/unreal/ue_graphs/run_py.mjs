// Runs a local Python file in the Unreal editor: node run_py.mjs <file.py> ["python prelude"]
import fs from 'node:fs';
import { init, py } from './ue.mjs';
await init();
const [file, pre] = process.argv.slice(2);
console.log(String(await py((pre || '') + '\n' + fs.readFileSync(file, 'utf8'))));
