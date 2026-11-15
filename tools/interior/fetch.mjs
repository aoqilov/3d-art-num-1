// Downloads the CC0 Poly Haven assets of the 360° interiors → tools/interior/src/ (git-ignored):
//   models (2k glTF), surface textures (2k: colour, GL normal, roughness), the HDRI seen through the windows (4k).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
export const MODELS = ['sofa_02', 'modern_arm_chair_01', 'modern_coffee_table_01', 'side_table_01', 'dining_table', 'dining_chair_02',
  'modern_wooden_cabinet', 'television_02', 'potted_plant_01', 'potted_plant_04', 'calathea_orbifolia_01', 'pachira_aquatica_01',
  'modern_ceiling_lamp_01', 'throw_pillows_01', 'decorative_book_set_01', 'ceramic_vase_01', 'hanging_picture_frame_01',
  'hanging_picture_frame_02', 'drawer_cabinet', 'wall_clock', 'side_table_tall_01'];
export const TEXTURES = ['laminate_floor_02', 'painted_plaster_wall', 'interior_tiles', 'rough_linen', 'velour_velvet', 'wool_boucle', 'marble_01'];
export const HDRI = 'rooftop_day';
const SRC = 'tools/interior/src';
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return Buffer.from(await r.arrayBuffer()); };
const files = async (id) => JSON.parse((await get(`https://api.polyhaven.com/files/${id}`)).toString());
for (const id of MODELS) {
  const dir = path.join(SRC, 'models', id), gltf = path.join(dir, `${id}_2k.gltf`);
  if (existsSync(gltf)) continue;
  const f = await files(id), g = (f.gltf?.['2k'] ?? f.gltf?.['1k'])?.gltf;
  if (!g) { console.log('no glTF, skipped:', id); continue; }
  mkdirSync(dir, { recursive: true });
  writeFileSync(gltf, await get(g.url));
  for (const [rel, v] of Object.entries(g.include ?? {})) { mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); writeFileSync(path.join(dir, rel), await get(v.url)); }
  console.log('model', id);
}
for (const id of TEXTURES) {
  const dir = path.join(SRC, 'tex', id);
  if (existsSync(path.join(dir, 'diff.jpg'))) continue;
  const f = await files(id);
  mkdirSync(dir, { recursive: true });
  for (const [key, out] of [['Diffuse', 'diff.jpg'], ['nor_gl', 'nor.jpg'], ['Rough', 'rough.jpg']]) {
    const v = f[key]?.['2k']?.jpg ?? f[key]?.['2k']?.png;
    if (v) writeFileSync(path.join(dir, out), await get(v.url));
  }
  console.log('texture', id);
}
const hd = path.join(SRC, 'hdri', `${HDRI}_4k.hdr`);
if (!existsSync(hd)) { mkdirSync(path.dirname(hd), { recursive: true }); writeFileSync(hd, await get((await files(HDRI)).hdri['4k'].hdr.url)); console.log('hdri', HDRI); }
console.log('done');
