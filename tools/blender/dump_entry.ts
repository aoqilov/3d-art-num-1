// Bundled and run in headless Chromium by export.mjs: dumps the exterior of the type-4 block per material.
import { mergedBlock } from '../../src/block/blockMerge';
import * as THREE from 'three';
const b64 = (a: Float32Array) => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
(window as any).dump = () => {
  const mb = mergedBlock(true);
  const P = mb.geometry.getAttribute('position').array as Float32Array, N = mb.geometry.getAttribute('normal').array as Float32Array, U = mb.geometry.getAttribute('uv').array as Float32Array;
  return mb.geometry.groups.map((g) => {
    const m = mb.materials[g.materialIndex!] as THREE.MeshStandardMaterial;
    return { name: mb.names[g.materialIndex!], count: g.count, color: '#' + m.color.getHexString(), rough: m.roughness, metal: m.metalness,
      pos: b64(P.slice(g.start * 3, (g.start + g.count) * 3)), nor: b64(N.slice(g.start * 3, (g.start + g.count) * 3)), uv: b64(U.slice(g.start * 2, (g.start + g.count) * 2)) };
  });
};
(window as any).ready = true;
