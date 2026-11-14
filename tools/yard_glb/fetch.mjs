// Downloads the CC0 Poly Haven models used in the courtyard (1k glTF) → tools/yard_glb/src/<id>/
// shrub_02 keeps its leaf cut-out in a separate alpha map: merged into the colour map (RGBA PNG) here.
import sharp from 'sharp';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
export const IDS = ['searsia_lucida', 'flower_gazania', 'modular_street_seating'];
const SRC = 'tools/yard_glb/src';
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return Buffer.from(await r.arrayBuffer()); };
for (const id of IDS) {
  const dir = path.join(SRC, id), gltfPath = path.join(dir, `${id}_1k.gltf`);
  if (existsSync(gltfPath)) continue;
  const files = JSON.parse((await get(`https://api.polyhaven.com/files/${id}`)).toString());
  const g = files.gltf['1k'].gltf;
  mkdirSync(path.join(dir, 'textures'), { recursive: true });
  writeFileSync(gltfPath, await get(g.url));
  for (const [rel, v] of Object.entries(g.include ?? {})) writeFileSync(path.join(dir, rel), await get(v.url));
  if (files.Alpha) {
    const diff = path.join(dir, 'textures', `${id}_diff_1k.jpg`);
    const alpha = await sharp(await get(files.Alpha['1k'].png.url)).greyscale().raw().toBuffer({ resolveWithObject: true });
    const rgba = path.join(dir, 'textures', `${id}_diff_1k.png`);
    await sharp(diff).joinChannel(alpha.data, { raw: alpha.info }).png().toFile(rgba);
    const j = JSON.parse(readFileSync(gltfPath, 'utf8'));
    for (const im of j.images) if (im.uri.endsWith('_diff_1k.jpg')) { im.uri = im.uri.replace('.jpg', '.png'); im.mimeType = 'image/png'; }
    writeFileSync(gltfPath, JSON.stringify(j));
  }
  console.log('fetched', id);
}
