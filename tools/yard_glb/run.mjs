// npm run yard: courtyard models → public/yard/*.glb
//   1. fetch.mjs   CC0 models from Poly Haven (tools/yard_glb/src, not in git)
//   2. Blender     build.py: hedge clump (foliage tile rendered from real leaves), bushes, flowers, bench
//   3. here        meshopt geometry + WebP textures (≤1024 px); a .wasm copy for hosts that serve no .glb
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
const blender = process.env.BLENDER || ['D:/blender-program/blender.exe', 'D:/blender.exe'].find((p) => existsSync(p)) || 'blender';
if (!process.argv.includes('--no-blender')) {
  execFileSync('node', ['tools/yard_glb/fetch.mjs'], { stdio: 'inherit' });
  execFileSync(blender, ['-b', '--factory-startup', '-P', 'tools/yard_glb/build.py', '--', 'tools/yard_glb/src', 'tools/yard_glb/out'], { stdio: 'inherit' });
}
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
mkdirSync('public/yard', { recursive: true });
for (const f of readdirSync('tools/yard_glb/out').filter((f) => f.endsWith('.glb'))) {
  const doc = await io.read('tools/yard_glb/out/' + f);
  await doc.transform(prune({ keepAttributes: true }), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const p = 'public/yard/' + f;
  await io.write(p, doc); copyFileSync(p, p.replace(/\.glb$/, '.wasm'));
  console.log(p, (statSync(p).size / 1024).toFixed(0) + ' KB');
}
writeFileSync('public/yard/CREDITS.txt', 'Courtyard models (tools/yard_glb): from Poly Haven (polyhaven.com), CC0 — searsia_lucida (bushes, hedge leaves),\nflower_gazania (flowers), modular_street_seating (bench timber texture). Hedge and bench built in Blender from these.\n');
