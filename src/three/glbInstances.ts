// Many copies of the variants of one GLB (public/yard/: hedge clump, bushes, flowers, bench) as InstancedMeshes:
// each top-level object of the file is a variant; item i uses variant `v` (or i mod count). Multi-material objects
// keep all their parts (bark + leaves …), each part one InstancedMesh. Loaded in the background; the group fills
// when the file arrives.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

type Part = { geo: THREE.BufferGeometry; mat: THREE.Material };
const cache = new Map<string, Promise<Part[][] | null>>();

function load(name: string) {
  let p = cache.get(name);
  if (!p) {
    // the preview host serves no .glb files, so the same bytes are also published under a served extension
    const L = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    p = L.loadAsync(`yard/${name}.glb`).catch(() => L.loadAsync(`yard/${name}.wasm`)).then((g) => {
      g.scene.updateMatrixWorld(true);
      return g.scene.children.map((root) => {
        const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
        const parts: Part[] = [];
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          // variant-local geometry (the variant's own placement in the file is dropped)
          const geo = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
          for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
            // see-through leaves and petals: cut out, not blended (no sorting, shadows follow the leaf shape)
            if (mat.map && (mat.transparent || mat.alphaTest > 0)) { mat.transparent = false; mat.alphaTest = 0.5; mat.depthWrite = true; mat.side = THREE.DoubleSide; }
            parts.push({ geo, mat });
          }
        });
        return parts;
      }).filter((v) => v.length);
    }).catch((e) => { console.warn('yard model could not load', name, e); return null; });
    cache.set(name, p);
  }
  return p;
}

export type GlbItem = { m: THREE.Matrix4; v?: number; tint?: number };

export function glbInstances(name: string, items: GlbItem[], o: { shadow?: boolean } = {}) {
  const group = new THREE.Group(); group.name = name;
  const ready = load(name).then((V) => {
    if (!V || !items.length) return false;
    const col = new THREE.Color();
    V.forEach((parts, vi) => {
      const mine = items.filter((it, i) => (it.v ?? i) % V.length === vi);
      if (!mine.length) return;
      for (const { geo, mat } of parts) {
        const inst = new THREE.InstancedMesh(geo, mat, mine.length);
        mine.forEach((it, i) => { inst.setMatrixAt(i, it.m); if (it.tint !== undefined) inst.setColorAt(i, col.setScalar(it.tint)); });
        inst.castShadow = o.shadow ?? true; inst.receiveShadow = true;
        inst.raycast = () => {};
        inst.computeBoundingSphere();
        group.add(inst);
      }
    });
    return true;
  });
  return { group, ready };
}
