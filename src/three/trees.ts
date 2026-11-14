// Trees made of a trunk with branches and a crown of leaf cards (alpha-tested leaf clusters painted on a canvas).
// Card normals point out of the crown centre so a crown shades like a soft volume, and the leaf alpha is used for
// the shadow too. Four kinds common in Tashkent: plane tree (chinor), poplar (terak), juniper / pine (archa) and a
// small fruit tree (mevali). One InstancedMesh per kind: thousands of trees in a handful of draw calls.
// Now only the instant placeholder: the owner's GLB trees (glbTrees.ts) replace them once loaded.
import * as THREE from 'three';

export type TreeKind = 'chinor' | 'terak' | 'archa' | 'mevali';
export type TreeAt = { x: number; z: number; y?: number; s?: number; kind: TreeKind };

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function leafTexture(tone: string[], needle = false) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  // a loose round cluster of leaves, denser in the middle, ragged at the edge
  for (let i = 0; i < (needle ? 900 : 520); i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * S * 0.46;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
    g.save(); g.translate(x, y); g.rotate(rnd() * Math.PI * 2);
    g.fillStyle = tone[Math.floor(rnd() * tone.length)];
    g.globalAlpha = 1;
    g.beginPath();
    if (needle) g.ellipse(0, 0, 9 + rnd() * 6, 1.6, 0, 0, Math.PI * 2);
    else g.ellipse(0, 0, 7 + rnd() * 6, 4 + rnd() * 3, 0, 0, Math.PI * 2);
    g.fill(); g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

type Proto = { geo: THREE.BufferGeometry; leaf: THREE.MeshStandardMaterial };

/** one tree of the kind at unit scale (metres) as one geometry with two groups: 0 bark, 1 leaves */
function prototype(kind: TreeKind): THREE.BufferGeometry {
  const parts: { g: THREE.BufferGeometry; m: number }[] = [];
  const cyl = (r0: number, r1: number, a: THREE.Vector3, b: THREE.Vector3) => {
    const d = b.clone().sub(a), l = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, l, 6, 1, true).translate(0, l / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate(a.x, a.y, a.z);
    parts.push({ g, m: 0 });
  };
  // crown: ellipsoid centre c, radii (rx, ry), n cards of size sz
  const crown = (c: THREE.Vector3, rx: number, ry: number, n: number, sz: number) => {
    for (let i = 0; i < n; i++) {
      // points spread through the volume, more of them near the shell
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, k = 0.45 + 0.55 * Math.cbrt(rnd());
      const s = Math.sqrt(1 - u * u);
      const p = new THREE.Vector3(Math.cos(th) * s * rx * k, u * ry * k, Math.sin(th) * s * rx * k).add(c);
      const q = new THREE.PlaneGeometry(sz * (0.8 + rnd() * 0.5), sz * (0.8 + rnd() * 0.5));
      q.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI)));
      q.translate(p.x, p.y, p.z);
      // normals out of the crown centre: soft, volume-like shading instead of flat-card flicker
      const P = q.attributes.position, N = q.attributes.normal, v = new THREE.Vector3();
      for (let j = 0; j < P.count; j++) {
        v.set(P.getX(j) - c.x, (P.getY(j) - c.y) * (rx / ry), P.getZ(j) - c.z).normalize();
        N.setXYZ(j, v.x, v.y, v.z);
      }
      parts.push({ g: q, m: 1 });
    }
  };
  const O = new THREE.Vector3();
  if (kind === 'chinor') {           // plane tree: thick trunk, wide domed crown ~ 8 m across, 10 m tall
    const top = new THREE.Vector3(0, 3.2, 0);
    cyl(0.26, 0.2, O, top);
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * Math.PI * 2 + rnd() * 0.5;
      cyl(0.13, 0.06, top, new THREE.Vector3(Math.cos(a) * 2.2, 6 + rnd() * 1.2, Math.sin(a) * 2.2));
    }
    crown(new THREE.Vector3(0, 6.6, 0), 4.0, 3.0, 56, 2.9);
  } else if (kind === 'terak') {     // poplar: slim column ~ 3 m wide, 15 m tall
    cyl(0.18, 0.08, O, new THREE.Vector3(0, 12, 0));
    crown(new THREE.Vector3(0, 8.6, 0), 1.5, 6.2, 40, 2.3);
  } else if (kind === 'archa') {     // juniper / pine: cone of needle cards
    cyl(0.12, 0.05, O, new THREE.Vector3(0, 6.5, 0));
    for (let t = 0; t < 4; t++) crown(new THREE.Vector3(0, 1.6 + t * 1.3, 0), 1.6 - t * 0.33, 0.9, 9, 1.7);
  } else {                           // fruit tree: short trunk, low round crown ~ 4.5 m
    const top = new THREE.Vector3(0, 1.3, 0);
    cyl(0.1, 0.08, O, top);
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * Math.PI * 2 + rnd();
      cyl(0.06, 0.03, top, new THREE.Vector3(Math.cos(a) * 1.2, 2.6, Math.sin(a) * 1.2));
    }
    crown(new THREE.Vector3(0, 2.9, 0), 2.2, 1.5, 28, 1.9);
  }
  // merge into one geometry with groups by material
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const geo = new THREE.BufferGeometry();
  let start = 0;
  for (const m of [0, 1]) {
    const from = start;
    for (const p of parts.filter((q) => q.m === m)) {
      const g = p.g.index ? p.g.toNonIndexed() : p.g;
      pos.push(...(g.attributes.position.array as Float32Array));
      nor.push(...(g.attributes.normal.array as Float32Array));
      uv.push(...(g.attributes.uv.array as Float32Array));
      start += g.attributes.position.count;
    }
    geo.addGroup(from, start - from, m);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

const TONES: Record<TreeKind, string[]> = {
  chinor: ['#4e7a32', '#5f8c3a', '#6f9a44', '#3f6a2a', '#7aa34c'],
  terak: ['#55803a', '#668f42', '#4a7432', '#7b9e4c'],
  archa: ['#2f5130', '#3a5f37', '#284628', '#46693f'],
  mevali: ['#5c8a3a', '#6e9a40', '#83aa4e', '#4b7a31', '#9bb85a'],
};
const BARK = new THREE.MeshStandardMaterial({ color: '#5f4b3b', roughness: 0.95 });
let protos: Map<TreeKind, Proto> | null = null;
function getProtos() {
  if (protos) return protos;
  protos = new Map();
  for (const k of ['chinor', 'terak', 'archa', 'mevali'] as TreeKind[]) {
    const leaf = new THREE.MeshStandardMaterial({ map: leafTexture(TONES[k], k === 'archa'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
    protos.set(k, { geo: prototype(k), leaf });
  }
  return protos;
}

/** All trees of a layer as one InstancedMesh per kind; random turn and ±15 % size. */
export class Forest {
  readonly group = new THREE.Group();
  private leaves: THREE.MeshStandardMaterial[] = [];
  /** shadow: false for far trees (a block's page: their shadows cost more than they show) */
  constructor(list: TreeAt[], shadow = true) {
    const P = getProtos();
    for (const [kind, pr] of P) {
      const mine = list.filter((t) => t.kind === kind);
      if (!mine.length) continue;
      const leaf = pr.leaf.clone();
      this.leaves.push(leaf);
      const mesh = new THREE.InstancedMesh(pr.geo, [BARK, leaf], mine.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
      mine.forEach((t, i) => {
        const s = (t.s ?? 1) * (0.85 + rnd() * 0.3);
        q.setFromAxisAngle(v.set(0, 1, 0), rnd() * Math.PI * 2);
        mesh.setMatrixAt(i, m.compose(v.set(t.x, t.y ?? 0, t.z), q, sc.set(s, s * (0.9 + rnd() * 0.2), s)));
        mesh.setColorAt(i, col.setScalar(0.85 + rnd() * 0.3));
      });
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      // shadows with the leaf alpha, not as solid cards
      mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leaf.map, alphaTest: 0.5 });
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }
  /** white model: plain pale leaves, the painted texture only cuts the leaf shapes (alpha from its green channel) */
  setWhite(white: boolean) {
    for (const l of this.leaves) {
      const u = l.userData as { tex?: THREE.Texture };
      if (l.map) u.tex = l.map;
      l.map = white ? null : u.tex ?? null;
      l.alphaMap = white ? u.tex ?? null : null;
      l.alphaTest = white ? 0.2 : 0.5;
      l.color.set(white ? '#f1f0eb' : '#ffffff');
      l.needsUpdate = true;
    }
  }
}

/** the app targets desktop computers: the heavy models are always used */
export const realTreesOk = () => true;
