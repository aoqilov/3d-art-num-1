// Trees and small plants from the owner's GLB files (glb-models/ → tools/trees_user/optimize.mjs →
// public/trees/user/): two broadleaf trees (daraxt.glb) for every deciduous tree of the app — street, courtyard,
// fruit, poplar — and, from the forest pack (pack.glb), four conifers, two bushes and two grass tufts for the
// small things. One InstancedMesh per variant: thousands of trees in a few draw calls.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { diffuseColor, exp, materialEmissive, normalWorld, positionWorld, texture, uniform, vec3, vec4 } from 'three/tsl';
import { nodes } from './gpu';

export type GlbKind = 'chinor' | 'terak' | 'mevali' | 'archa' | 'buta' | 'ot';
export type GlbAt = { x: number; z: number; y?: number; s?: number; kind: GlbKind };

type Cat = 'bargli' | 'archa' | 'buta' | 'ot';
type Variant = { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; h: number };
/** per kind: model family, height in metres at s = 1, and how much narrower than the model (poplar) */
const KIND: Record<GlbKind, { cat: Cat; h: number; xz: number }> = {
  chinor: { cat: 'bargli', h: 12, xz: 1 },
  terak: { cat: 'bargli', h: 15, xz: 0.55 },
  mevali: { cat: 'bargli', h: 5, xz: 1.05 },
  archa: { cat: 'archa', h: 7.5, xz: 1 },
  buta: { cat: 'buta', h: 1.1, xz: 1 },
  ot: { cat: 'ot', h: 0.45, xz: 1 },
};
/** mesh names in pack.glb (three drops the dots of the original names) */
const PACK: Record<Exclude<Cat, 'bargli'>, string[]> = {
  archa: ['002', '003', '006', '009'],
  buta: ['010', '011'],
  ot: ['008', '012'],
};

/** 0 day … 1 night: uplights at the feet of the trees (the block view's evening lighting) */
export const TREE_NIGHT = uniform(0);
/** lit from below: the undersides of the crowns and the lower branches catch the warm light */
const uplight = materialEmissive.add(diffuseColor.rgb.mul(vec3(1.0, 0.78, 0.52))
  .mul(normalWorld.y.mul(-0.6).add(0.5).clamp(0.1, 1)).mul(exp(positionWorld.y.div(-6))).mul(TREE_NIGHT.mul(1.6)));

let lib: Promise<Record<Cat, Variant[]> | null> | null = null;
function load(name: string) {
  // the preview host serves no .glb files, so the same bytes are also published under a served extension
  const L = new GLTFLoader();
  return L.loadAsync(`trees/user/${name}.glb`).catch(() => L.loadAsync(`trees/user/${name}.wasm`));
}
/** each mesh as a variant standing on the origin, its world transform baked in */
function variant(mesh: THREE.Mesh): Variant {
  const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.computeBoundingSphere();
  const src = mesh.material as THREE.MeshStandardMaterial;
  const mat = new THREE.MeshStandardMaterial({ map: src.map, color: src.color, roughness: 0.9, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide });
  return { geo, mat, h: b.max.y - b.min.y };
}
function library() {
  if (!lib) {
    lib = Promise.all([load('daraxt'), load('pack')]).then(([d, p]) => {
      const meshes = (g: { scene: THREE.Object3D }) => { g.scene.updateMatrixWorld(true); const out: THREE.Mesh[] = []; g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); }); return out; };
      const pm = meshes(p);
      const pick = (ids: string[]) => ids.map((id) => pm.find((m) => m.name.startsWith(`Background_Tree_Atlas${id}`))).filter(Boolean).map((m) => variant(m!));
      return { bargli: meshes(d).map(variant), archa: pick(PACK.archa), buta: pick(PACK.buta), ot: pick(PACK.ot) };
    }).catch((e) => { console.warn('trees could not load', e); return null; });
  }
  return lib;
}

export class GlbForest {
  readonly group = new THREE.Group();
  /** resolves true when the models arrived and the meshes are in the group */
  readonly ready: Promise<boolean>;
  private mats: THREE.MeshStandardMaterial[] = [];
  private white = false;
  private mask: [unknown, unknown] | null = null;
  constructor(list: GlbAt[], seed = 5) {
    this.group.name = 'trees';
    this.ready = library().then((L) => {
      if (!L) return false;
      let sd = seed; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
      for (const cat of ['bargli', 'archa', 'buta', 'ot'] as Cat[]) {
        const V = L[cat];
        if (!V.length) continue;
        const mine = list.filter((t) => KIND[t.kind].cat === cat);
        V.forEach((v, vi) => {
          const part = mine.filter((_, i) => i % V.length === vi);
          if (!part.length) return;
          const mat = v.mat.clone();
          if (cat !== 'ot') nodes(mat).emissiveNode = uplight;
          this.mats.push(mat);
          const inst = new THREE.InstancedMesh(v.geo, mat, part.length);
          part.forEach((t, i) => {
            const k = KIND[t.kind], s = ((t.s ?? 1) * k.h * (0.87 + rnd() * 0.26)) / v.h;
            q.setFromAxisAngle(p.set(0, 1, 0), rnd() * Math.PI * 2);
            m.compose(p.set(t.x, t.y ?? 0, t.z), q, sc.set(s * k.xz, s, s * k.xz));
            inst.setMatrixAt(i, m);
            inst.setColorAt(i, col.setScalar(0.98 + rnd() * 0.24));          // each tree a little lighter or darker
          });
          inst.castShadow = cat !== 'ot'; inst.receiveShadow = true;
          inst.raycast = () => {};
          inst.computeBoundingSphere();
          this.group.add(inst);
        });
      }
      this.setWhite(this.white);
      if (this.mask) this.setMask(...this.mask);
      return true;
    });
  }
  /** an extra discard mask on every material (a block's page: the corridor between the camera and the block), and
   *  the one its shadow keeps */
  setMask(mask: unknown, shadow: unknown) {
    this.mask = [mask, shadow];
    for (const m of this.mats) { nodes(m).maskNode = mask; nodes(m).maskShadowNode = shadow; m.needsUpdate = true; }
  }
  /** white model: plain white plants, the texture only cuts out the leaves */
  setWhite(white: boolean) {
    this.white = white;
    for (const m of this.mats) {
      nodes(m).colorNode = white && m.map ? vec4(vec3(0.94, 0.94, 0.92), texture(m.map).a) : null;
      m.needsUpdate = true;
    }
  }
}
