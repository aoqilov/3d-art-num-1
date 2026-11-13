// Runs in a headless browser (see build.mjs next to it): grows trees with EZ-Tree (MIT, github.com/dgreenheck/ez-tree),
// lightens the geometry, bakes small textures and exports one GLB per kind with two variants each.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { Tree } from '@dgreenheck/ez-tree';

// kind → target height (m) and two variants (preset, seed, leaf tint)
const KINDS = {
  chinor: { h: 15, v: [['Oak Large', 23399, 0xbfd69a], ['Ash Large', 4411, 0xc4d8a0]] },     // plane tree: broad crown
  terak: { h: 19, v: [['Aspen Large', 911, 0xcfe0a8], ['Aspen Medium', 3187, 0xc6dba0]] },   // poplar: tall and narrow
  archa: { h: 9, v: [['Pine Medium', 77, 0xb9d0b0], ['Pine Small', 5150, 0xb4ccb0]] },       // juniper / pine
  mevali: { h: 6.5, v: [['Ash Small', 620, 0xd2e2a6], ['Oak Small', 9042, 0xcadd9c]] },      // small fruit tree
  buta: { h: 1.5, v: [['Bush 1', 12, 0xc2d79a], ['Bush 3', 808, 0xbdd494]] },                // bush
};
const LIGHT = { sections: [8, 5, 3, 2], segments: [7, 4, 3, 3] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function small(tex, size, alpha) {
  for (let i = 0; i < 100 && !(tex.image && tex.image.width); i++) await sleep(100);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  if (!alpha) { g.fillStyle = '#000'; g.fillRect(0, 0, size, size); }
  g.drawImage(tex.image, 0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.flipY = tex.flipY;
  return t;
}

window.genKind = async (kind) => {
  const K = KINDS[kind], root = new THREE.Scene();
  let bark = null, leaf = null; const stats = [];
  for (let vi = 0; vi < K.v.length; vi++) {
    const [preset, seed, tint] = K.v[vi];
    const tree = new Tree();
    tree.loadPreset(preset);
    tree.options.seed = seed;
    const b = tree.options.branch;
    for (let l = 0; l <= 3; l++) { if (b.sections[l] !== undefined) b.sections[l] = Math.min(b.sections[l], LIGHT.sections[l]); if (b.segments[l] !== undefined) b.segments[l] = Math.min(b.segments[l], LIGHT.segments[l]); }
    if (b.levels >= 3 && b.children[2] > 2) b.children[2] = 2;                    // fewer twigs …
    const lv = tree.options.leaves;
    lv.billboard = 'single'; lv.count = Math.max(2, Math.round(lv.count * 0.8)); lv.size *= 1.4;   // … and fewer, larger leaf cards
    lv.tint = tint;
    tree.generate();
    await sleep(300);
    if (!bark) {
      bark = new THREE.MeshStandardMaterial({ name: 'bark', map: await small(tree.branchesMesh.material.map, 256, false), color: tree.options.bark.tint, roughness: 0.95 });
      bark.map.repeat.copy(tree.branchesMesh.material.map.repeat);
      leaf = new THREE.MeshStandardMaterial({ name: 'leaf', map: await small(tree.leavesMesh.material.map, 512, true), color: tint, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
    }
    // scale to the target height, trunk base at the origin
    const box = new THREE.Box3().setFromObject(tree), k = K.h * (vi ? 0.92 : 1) / (box.max.y - box.min.y);
    const g = new THREE.Group(); g.name = 'v' + vi;
    for (const [src, mat, name] of [[tree.branchesMesh, bark, 'bark'], [tree.leavesMesh, leaf, 'leaf']]) {
      const geo = src.geometry.clone();
      for (const a of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(a)) geo.deleteAttribute(a);
      geo.scale(k, k, k).translate(0, -box.min.y * k, 0);
      const m = new THREE.Mesh(geo, mat); m.name = `v${vi}_${name}`; g.add(m);
    }
    stats.push([preset, (tree.branchesMesh.geometry.index.count / 3) | 0, (tree.leavesMesh.geometry.index.count / 3) | 0]);
    root.add(g);
  }
  const glb = await new GLTFExporter().parseAsync(root, { binary: true });
  const u8 = new Uint8Array(glb); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { b64: btoa(s), stats };
};
window.KINDS = Object.keys(KINDS);
window.ready = true;
