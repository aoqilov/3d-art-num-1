const sharp = require('sharp'); const R = 'D:/3d-aps/ObodMaskanUE/Renders/';
const label = (t) => Buffer.from(`<svg width="300" height="40"><rect width="300" height="40" rx="6" fill="rgba(0,0,0,0.6)"/><text x="12" y="27" font-size="22" fill="#fff" font-family="Arial">${t}</text></svg>`);
(async () => {
  const [web, ue, out] = process.argv.slice(2);
  const a = await sharp(R + web).resize(1600, 900).composite([{ input: label('Veb'), left: 12, top: 12 }]).png().toBuffer();
  const b = await sharp(R + ue).resize(1600, 900).composite([{ input: label('Unreal'), left: 12, top: 12 }]).png().toBuffer();
  await sharp({ create: { width: 1600, height: 1808, channels: 3, background: '#000' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: 0, top: 908 }]).jpeg({ quality: 88 }).toFile(R + out);
})();
