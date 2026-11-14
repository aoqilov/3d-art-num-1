// The type-4 block exterior prepared in Blender (tools/blender/block1.py): same geometry as the drawings give,
// plus bevelled corners, a second UV set and a baked ambient-occlusion map (npm run model; meshopt-compressed,
// ~4 MB). The drawn geometry stays as the instant placeholder and the fallback.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { MatName } from '../block/materials';

export type BlockGlb = { geometry: THREE.BufferGeometry; names: MatName[]; ao: THREE.Texture | null };
let cache: Promise<BlockGlb | null> | null = null;

export function loadBlockGlb() {
  if (cache) return cache;
  const L = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // the preview host serves no .glb files, so the same bytes are also published under a served extension
  cache = L.loadAsync('models/blok1.glb').catch(() => L.loadAsync('models/blok1.wasm')).then((g) => {
    g.scene.updateMatrixWorld(true);
    const parts: { name: MatName; geo: THREE.BufferGeometry }[] = [];
    let ao: THREE.Texture | null = null;
    g.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat.aoMap) ao = mat.aoMap;
      const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      // quantised attributes (16-bit, KHR_mesh_quantization) to plain floats before the node's transform is baked in
      for (const [k, a] of Object.entries(src.attributes) as [string, THREE.BufferAttribute][]) {
        if (a.array instanceof Float32Array && !a.normalized) continue;
        const o = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) o[i * a.itemSize + c] = a.getComponent(i, c);
        src.setAttribute(k, new THREE.BufferAttribute(o, a.itemSize));
      }
      src.applyMatrix4(mesh.matrixWorld);
      const n = src.getAttribute('position').count;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', src.getAttribute('position'));
      geo.setAttribute('normal', src.getAttribute('normal'));
      geo.setAttribute('uv', src.getAttribute('uv') ?? new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      geo.setAttribute('uvb', src.getAttribute('uv1') ?? new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      parts.push({ name: mat.name.replace(/\.\d+$/, '') as MatName, geo });
    });
    if (!parts.length) return null;
    parts.sort((a, b) => (a.name === 'glass' ? 1 : 0) - (b.name === 'glass' ? 1 : 0));     // transparent last
    const geometry = mergeGeometries(parts.map((p) => p.geo), true);
    if (!geometry) return null;
    geometry.computeBoundingSphere();
    if (ao) { (ao as THREE.Texture).wrapS = (ao as THREE.Texture).wrapT = THREE.ClampToEdgeWrapping; (ao as THREE.Texture).anisotropy = 4; }
    return { geometry, names: parts.map((p) => p.name), ao };
  }).catch(() => null);
  return cache;
}
