// public/models/blok1.glb in place: meshopt-compressed geometry, the occlusion map as WebP (see run.mjs)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { copyFileSync, statSync } from 'node:fs';
const p = 'public/models/blok1.glb';
const before = statSync(p).size;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(p);
// keepAttributes: the facade UVs feed the app's own textures, not the model's — prune would drop them
await doc.transform(prune({ keepAttributes: true }), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(p, doc);
copyFileSync(p, 'public/models/blok1.wasm');      // the preview host serves no .glb (blockGlb.ts tries both)
console.log(p, (before / 1e6).toFixed(1), '→', (statSync(p).size / 1e6).toFixed(1), 'MB');
