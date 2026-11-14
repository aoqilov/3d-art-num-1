// Trees from the owner's GLB files (glb-models/, Sketchfab) → light assets for the app (public/trees/user/):
//   tree_low_poly_lowpoly.glb    → daraxt.glb  two broadleaf trees: street, courtyard and block trees
//   low_poly_forest_tree_pack.glb → pack.glb   only the small things kept: four conifers, bushes, grass tufts
// Textures are resized and re-encoded as WebP (the pack shrinks from ~14.5 MB to a fraction).
// Usage: node tools/trees_user/optimize.mjs   (needs the devDependencies @gltf-transform/*, sharp)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';

const SRC = 'glb-models', OUT = 'public/trees/user';
mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const plain = (n) => n.replace(/[.\s]/g, '');

async function write(doc, name) {
  const p = `${OUT}/${name}.glb`;
  await io.write(p, doc);
  // the preview host serves no .glb files: the same bytes under a served extension (see trees.ts)
  copyFileSync(p, `${OUT}/${name}.wasm`);
  console.log(p, (statSync(p).size / 1024).toFixed(0) + ' KB');
}

// broadleaf trees: everything, smaller textures
{
  const doc = await io.read(`${SRC}/tree_low_poly_lowpoly.glb`);
  await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }));
  await write(doc, 'daraxt');
}

// pack: conifers (archa) and the small plants only; the tall forest giants, autumn trees and rocks go
{
  const KEEP = new Set([
    'Background_Tree_Atlas002_Background_Tree_Atlas_0', 'Background_Tree_Atlas003_Background_Tree_Atlas_0',
    'Background_Tree_Atlas006_Background_Tree_Atlas_0', 'Background_Tree_Atlas009_Background_Tree_Atlas_0',   // conifers
    'Background_Tree_Atlas010_Background_Tree_Atlas_0', 'Background_Tree_Atlas011_Background_Tree_Atlas_0',   // bushes
    'Background_Tree_Atlas008_Background_Tree_Atlas_0', 'Background_Tree_Atlas012_Background_Tree_Atlas_0',   // grass tufts
  ]);
  const doc = await io.read(`${SRC}/low_poly_forest_tree_pack.glb`);
  for (const node of doc.getRoot().listNodes()) if (node.getMesh() && !KEEP.has(plain(node.getName()))) node.setMesh(null);
  await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 82 }));
  await write(doc, 'pack');
}
