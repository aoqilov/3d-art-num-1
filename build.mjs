// Bundles src/ into dist/ and dist-pro/. Both hold the whole app with a BASIC | PRO switch; the PRO renderer
// (sky, PBR materials, post-processing) is a separate chunk and its PBR textures separate files, loaded only in PRO.
// dist/ starts in BASIC, dist-pro/ (sales-office computer) starts in PRO.
// Usage: node build.mjs            → both
//        node build.mjs light|pro  → one of them
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { rmSync, mkdirSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const which = process.argv[2] ?? 'all';
// Every `import 'three'` (ours and the examples') resolves to the WebGPU build: one copy of three.js, whose
// renderer runs on WebGPU and falls back to WebGL 2 by itself.
const threeWebGPU = {
  name: 'three-webgpu',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, async (a) => {
      // @takram packages also touch WebGL-only classes: they get three.module.js, which shares its core
      // (three.core.js) with the WebGPU build, so nothing is duplicated but the WebGL renderer
      if (/[\\/]node_modules[\\/]@takram[\\/]/.test(a.importer)) return undefined;
      const r = await b.resolve('three/webgpu', { kind: a.kind, resolveDir: a.resolveDir });
      return { path: r.path };
    });
    b.onResolve({ filter: /^three\/src\/nodes\/core\/NodeUtils\.js$/ }, () => ({ path: fileURLToPath(new URL('./src/three/nodeUtilsShim.ts', import.meta.url)) }));
    // @takram 0.19 reads TSL struct types as `struct(...).layout.name`; three r187 keeps the name on the struct
    // type itself (struct(...).name, struct(...).isStructTypeNode)
    b.onLoad({ filter: /@takram[\\/]three-(atmosphere|geospatial)[\\/]build[\\/]webgpu\.js$/ }, async (a) => {
      const src = readFileSync(a.path, 'utf8')
        .replace(/"layout" in (\w+) && \1\.layout instanceof \w+/g, '($1 != null && $1.isStructTypeNode === true)')
        .replace(/\.layout\.name/g, '.name');
      return { contents: src, loader: 'js' };
    });
  },
};
const common = {
  bundle: true, minify: true, format: 'esm', splitting: true, target: 'es2022', jsx: 'automatic', legalComments: 'none',
  plugins: [threeWebGPU],
  entryNames: '[name]', chunkNames: 'chunks/[name]-[hash]',
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
};
async function variant(out, mode) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync('public', out, { recursive: true });
  if (existsSync('public-pro')) cpSync('public-pro', out, { recursive: true });
  await build({ ...common, define: { ...common.define, __DEFAULT_MODE__: JSON.stringify(mode) }, entryPoints: { app: 'src/main.tsx' }, outdir: out });
  // app.js / app.css keep their names but are cached for a day (vercel.json) while index.html is fetched every time:
  // a version from their contents in index.html, or a visitor gets a new page with yesterday's code (the loading
  // clouds of the new page never part under the old code)
  const ver = (f) => createHash('sha1').update(readFileSync(`${out}/${f}`)).digest('hex').slice(0, 10);
  const html = `${out}/index.html`;
  writeFileSync(html, readFileSync(html, 'utf8').replace('src="app.js"', `src="app.js?v=${ver('app.js')}"`).replace('href="app.css"', `href="app.css?v=${ver('app.css')}"`));
  console.log(out + '/ ready');
}
if (which === 'all' || which === 'light') await variant('dist', 'basic');
if (which === 'all' || which === 'pro') {
  await variant('dist-pro', 'pro');
  const f = 'dist-pro/index.html';
  writeFileSync(f, readFileSync(f, 'utf8').replace(/<title>.*<\/title>/, '<title>Obod Maskan PRO — savdo ofisi</title>'));
}
