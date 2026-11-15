// node tools/realsheet.mjs <tagA> [tagB] — shots/real pictures in one sheet: one tag (5 views), or A above B per view
import sharp from 'sharp';
import { existsSync } from 'node:fs';
const [a, b] = process.argv.slice(2);
const views = ['havo', 'baland', 'hovli', 'kocha', 'blok'].filter((v) => existsSync(`shots/real/${v}_${a}.png`));
const W = 800, H = 450, G = 6, CAP = 34;
const tiles = [];
const label = (t, w) => Buffer.from(`<svg width="${w}" height="${CAP}"><rect width="100%" height="100%" fill="rgba(0,0,0,0.6)"/><text x="12" y="23" font-family="Segoe UI, Arial" font-size="18" fill="#fff">${t}</text></svg>`);
const cols = b ? 2 : 2;
let i = 0;
for (const v of views) for (const t of b ? [a, b] : [a]) {
  const f = `shots/real/${v}_${t}.png`;
  if (!existsSync(f)) continue;
  const x = (i % cols) * (W + G), y = Math.floor(i / cols) * (H + G);
  tiles.push({ input: await sharp(f).resize(W, H).toBuffer(), left: x, top: y }, { input: label(`${v} — ${t}`, W), left: x, top: y });
  i++;
}
const rows = Math.ceil(i / cols);
const out = `shots/real/_${a}${b ? '_' + b : ''}.jpg`;
await sharp({ create: { width: cols * (W + G) - G, height: rows * (H + G) - G, channels: 3, background: '#111' } }).composite(tiles).jpeg({ quality: 86 }).toFile(out);
console.log(out);
