// Bundled and run in headless Chromium by export.mjs: the typical storey (plan '3', floors 3–16) of the type-4 block
// as triangles per material — walls, window / door reveals, sills, frames, glass, floors (block-local metres, Y up).
import { buildStorey } from '../../src/block/floorGeom';
import { PLAN } from '../../src/block/plan';
import * as THREE from 'three';
const b64 = (a: Float32Array) => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
(window as unknown as { dump: () => unknown }).dump = () => {
  const { geometry: g, mats } = buildStorey(PLAN['3'], 3) as unknown as { geometry: THREE.BufferGeometry; mats: string[] };
  const P = g.getAttribute('position').array as Float32Array, N = g.getAttribute('normal').array as Float32Array, U = g.getAttribute('uv').array as Float32Array;
  return g.groups.map((gr) => ({
    name: mats[gr.materialIndex!], count: gr.count,
    pos: b64(P.slice(gr.start * 3, (gr.start + gr.count) * 3)), nor: b64(N.slice(gr.start * 3, (gr.start + gr.count) * 3)), uv: b64(U.slice(gr.start * 2, (gr.start + gr.count) * 2)),
  }));
};
(window as unknown as { ready: boolean }).ready = true;
