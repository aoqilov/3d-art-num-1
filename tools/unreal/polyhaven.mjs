// node tools/unreal/polyhaven.mjs <asset> [res] — a Poly Haven model (CC0) as glTF with its files, into
// ../ObodMaskanUE/Assets/polyhaven/<asset>/ (kept out of Import/, which every export wipes).
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const [name, res = '2k'] = process.argv.slice(2);
if (!name) { console.log('usage: polyhaven.mjs <asset> [1k|2k|4k]'); process.exit(2); }
const dir = path.resolve(here, '../../../ObodMaskanUE/Assets/polyhaven', name);
const files = await (await fetch(`https://api.polyhaven.com/files/${name}`)).json();
const g = files.gltf?.[res]?.gltf;
if (!g) { console.log('no glTF at', res, 'available:', Object.keys(files.gltf ?? {})); process.exit(1); }
const list = [[path.basename(new URL(g.url).pathname), g]].concat(Object.entries(g.include ?? {}));
for (const [rel, f] of list) {
  const out = path.join(dir, rel);
  if (!out.startsWith(dir)) throw new Error('path outside the asset folder: ' + rel);
  if (existsSync(out) && statSync(out).size === f.size) continue;
  mkdirSync(path.dirname(out), { recursive: true });
  const r = await fetch(f.url);
  if (!r.ok) throw new Error(`${r.status} ${f.url}`);
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  console.log(`  ${rel} ${(f.size / 1048576).toFixed(1)} MB`);
}
console.log(dir);
