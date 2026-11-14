// Road and sidewalk textures (CC0 photos, Poly Haven) → public-pro/pro/tex/ph_*_{a,n}.jpg (the street loader's names)
//   ph_asphalt ← asphalt_02 (worn city asphalt, 3.0 m a repeat)   https://polyhaven.com/a/asphalt_02
//   ph_pavers  ← concrete_pavers (interlocking pavers, 1.92 m)     https://polyhaven.com/a/concrete_pavers
// Usage: node tools/ground/roads.mjs (needs sharp)
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
const SRC = { ph_asphalt: 'asphalt_02', ph_pavers: 'concrete_pavers' };
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return Buffer.from(await r.arrayBuffer()); };
for (const [name, id] of Object.entries(SRC)) {
  for (const [k, map] of [['a', 'diff'], ['n', 'nor_gl']]) {
    const img = await get(`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${id}/${id}_${map}_1k.jpg`);
    const p = `public-pro/pro/tex/${name}_${k}.jpg`;
    writeFileSync(p, await sharp(img).resize(1024, 1024).jpeg({ quality: 84 }).toBuffer());
    console.log(p);
  }
}
