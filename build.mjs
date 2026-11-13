// Bundles src/ into dist/ and dist-pro/. Both hold the whole app with a BASIC | PRO switch; the PRO renderer
// (sky, PBR materials, post-processing) is a separate chunk and its PBR textures separate files, loaded only in PRO.
// dist/ starts in BASIC, dist-pro/ (sales-office computer) starts in PRO.
// Usage: node build.mjs            → both
//        node build.mjs light|pro  → one of them
import { build } from 'esbuild';
import { rmSync, mkdirSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const which = process.argv[2] ?? 'all';
const common = {
  bundle: true, minify: true, format: 'esm', splitting: true, target: 'es2020', jsx: 'automatic', legalComments: 'none',
  entryNames: '[name]', chunkNames: 'chunks/[name]-[hash]',
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
};
async function variant(out, mode) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync('public', out, { recursive: true });
  if (existsSync('public-pro')) cpSync('public-pro', out, { recursive: true });
  await build({ ...common, define: { ...common.define, __DEFAULT_MODE__: JSON.stringify(mode) }, entryPoints: { app: 'src/main.tsx' }, outdir: out });
  console.log(out + '/ ready');
}
if (which === 'all' || which === 'light') await variant('dist', 'basic');
if (which === 'all' || which === 'pro') {
  await variant('dist-pro', 'pro');
  const f = 'dist-pro/index.html';
  writeFileSync(f, readFileSync(f, 'utf8').replace(/<title>.*<\/title>/, '<title>Obod Maskan PRO — savdo ofisi</title>'));
}
