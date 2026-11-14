// Ground textures for the free land around the complex (yards, plots, verges): CC0 photos from Poly Haven,
// re-encoded small for the app → public/ground/. Usage: node tools/ground/prepare.mjs (needs sharp)
//   dirt.webp  ← "Grass Path 2" (packed earth with grass tufts)   https://polyhaven.com/a/grass_path_2
//   grass.webp ← "Sparse Grass"                                     https://polyhaven.com/a/sparse_grass
import sharp from 'sharp';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
const OUT = 'public/ground';
mkdirSync(OUT, { recursive: true });
const SRC = { dirt: 'grass_path_2', grass: 'sparse_grass' };
for (const [name, id] of Object.entries(SRC)) {
  const url = `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${id}/${id}_diff_1k.jpg`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  const p = `${OUT}/${name}.webp`;
  writeFileSync(p, await sharp(Buffer.from(await r.arrayBuffer())).resize(1024, 1024).webp({ quality: 82 }).toBuffer());
  console.log(p, (statSync(p).size / 1024).toFixed(0) + ' KB');
}
writeFileSync(`${OUT}/CREDITS.txt`, 'Ground textures: "Grass Path 2" and "Sparse Grass" from Poly Haven (polyhaven.com), CC0. Resized to 1024 px, WebP.\n');
