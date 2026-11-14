// Test page script (roundtrip.mjs injects it): the exported a_blok.glb back into the web app in place of the
// block model, to tell an export fault from an Unreal import fault.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

(window as unknown as { __roundtrip: (url: string) => Promise<string> }).__roundtrip = async (url: string) => {
  const g = await new GLTFLoader().loadAsync(url);
  const geos: THREE.BufferGeometry[] = [];
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const x = m.geometry.clone().applyMatrix4(m.matrixWorld);
    for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k);
    geos.push(x.index ? x.toNonIndexed() : x);
  });
  const merged = mergeGeometries(geos, true)!;
  merged.setAttribute('uvb', new THREE.BufferAttribute(new Float32Array(merged.getAttribute('position').count * 2), 2));
  const c = (window as unknown as { __complex: { inst: THREE.InstancedMesh; dirty: boolean } }).__complex;
  c.inst.geometry = merged as never;
  c.dirty = true;
  return `${geos.length} parts, ${merged.getAttribute('position').count / 3} triangles`;
};
