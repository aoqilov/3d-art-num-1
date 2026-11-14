// Street lamps (8 m pole, arm over the road) and courtyard path lamps (4 m post with a lantern).
// At night the heads glow (bloom in PRO) and each lamp lights its surroundings:
//  • Ultra (complex view): a real point light per lamp — the ground, facades and trees catch it and it fades with
//    distance; the renderer's clustered lighting evaluates only the lamps near each pixel (LAMP_LIGHTS.real);
//  • otherwise: an additive radial decal on the ground — hundreds of lamps cost a few draw calls.
import * as THREE from 'three';

/** set by the view whose renderer runs clustered lighting (ComplexScene, Ultra), before the lamps are built */
export const LAMP_LIGHTS = { real: false };
/** real lamp lights made (stats panel) */
export const LAMP_COUNT = { n: 0 };

let pool: THREE.Texture | null = null;
function poolTexture() {
  if (pool) return pool;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  // roughly inverse-square: a bright spot under the lamp, a long soft tail
  for (let k = 0; k <= 10; k++) { const r = k / 10; gr.addColorStop(r, `rgba(255,255,255,${(Math.max(0, 1 - r) ** 2 / (1 + 14 * r * r)).toFixed(3)})`); }
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  pool = new THREE.CanvasTexture(c);
  return pool;
}

const METAL = new THREE.MeshStandardMaterial({ color: '#3d4045', roughness: 0.45, metalness: 0.6 });

export class Lamps {
  readonly group = new THREE.Group();
  private heads: THREE.MeshStandardMaterial;
  private pools: THREE.MeshBasicMaterial;
  private poolMeshes: THREE.Object3D[] = [];

  /** street: [x, z, armX, armZ] (arm direction towards the road), park: [x, z]; y0: ground level of each kind */
  private lights: { l: THREE.PointLight; k: number }[] = [];
  private real = LAMP_LIGHTS.real;
  constructor(street: number[][], park: number[][], yStreet = 0.15, yPark = 0.035) {
    this.heads = new THREE.MeshStandardMaterial({ color: '#d9d6cf', emissive: '#ffd59a', emissiveIntensity: 0, roughness: 0.4 });
    this.pools = new THREE.MeshBasicMaterial({ map: poolTexture(), color: '#ffcf8a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);

    if (street.length) {
      // pole + arm along +x, head at the arm's end
      const pole = new THREE.CylinderGeometry(0.06, 0.1, 8, 8).translate(0, 4, 0);
      const arm = new THREE.BoxGeometry(1.7, 0.08, 0.08).translate(0.85, 7.85, 0);
      const body = mergeTwo(pole, arm);
      const head = new THREE.BoxGeometry(0.62, 0.12, 0.26).translate(1.75, 7.78, 0);
      const poles = new THREE.InstancedMesh(body, METAL, street.length);
      const heads = new THREE.InstancedMesh(head, this.heads, street.length);
      const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.pools, street.length);
      street.forEach(([x, z, ax, az], i) => {
        q.setFromAxisAngle(up, Math.atan2(-az, ax));
        m.compose(v.set(x, yStreet, z), q, one);
        poles.setMatrixAt(i, m); heads.setMatrixAt(i, m);
        pools.setMatrixAt(i, new THREE.Matrix4().compose(v.set(x + ax * 1.75, 0.2, z + az * 1.75), new THREE.Quaternion(), new THREE.Vector3(13, 1, 13)));
        if (this.real) this.light(x + ax * 1.75, yStreet + 7.6, z + az * 1.75, 30, 650);
      });
      poles.castShadow = true;
      this.group.add(poles, heads, pools); this.poolMeshes.push(pools);
    }
    if (park.length) {
      const post = new THREE.CylinderGeometry(0.045, 0.06, 3.6, 8).translate(0, 1.8, 0);
      const lantern = new THREE.CylinderGeometry(0.16, 0.12, 0.5, 10).translate(0, 3.85, 0);
      const cap = new THREE.ConeGeometry(0.22, 0.18, 10).translate(0, 4.19, 0);
      const posts = new THREE.InstancedMesh(mergeTwo(post, cap), METAL, park.length);
      const heads = new THREE.InstancedMesh(lantern, this.heads, park.length);
      const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.pools, park.length);
      park.forEach(([x, z], i) => {
        m.compose(v.set(x, yPark, z), q.identity(), one);
        posts.setMatrixAt(i, m); heads.setMatrixAt(i, m);
        pools.setMatrixAt(i, new THREE.Matrix4().compose(v.set(x, 0.22, z), q, new THREE.Vector3(8, 1, 8)));
        if (this.real) this.light(x, yPark + 3.75, z, 15, 130);
      });
      posts.castShadow = true;
      this.group.add(posts, heads, pools); this.poolMeshes.push(pools);
    }
  }

  /** 0 = day … 1 = night */
  setNight(n: number) {
    this.heads.emissiveIntensity = 6 * n;
    this.pools.opacity = 0.42 * n;
    this.poolMeshes.forEach((p) => (p.visible = !this.real && n > 0.02));
    for (const { l, k } of this.lights) { l.intensity = k * n; l.visible = n > 0.02; }
  }
  /** a warm point light at a lamp head (candela; fades with the square of the distance, cut off at `range`) */
  private light(x: number, y: number, z: number, range: number, cd: number) {
    const l = new THREE.PointLight('#ffc387', 0, range, 2);
    l.position.set(x, y, z); l.castShadow = false; l.visible = false;
    this.lights.push({ l, k: cd }); LAMP_COUNT.n++;
    this.group.add(l);
  }
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const A = a.toNonIndexed(), B = b.toNonIndexed(), g = new THREE.BufferGeometry();
  for (const n of ['position', 'normal', 'uv']) {
    const x = A.getAttribute(n) as THREE.BufferAttribute, y = B.getAttribute(n) as THREE.BufferAttribute;
    const arr = new Float32Array(x.array.length + y.array.length); arr.set(x.array as Float32Array); arr.set(y.array as Float32Array, x.array.length);
    g.setAttribute(n, new THREE.BufferAttribute(arr, x.itemSize));
  }
  g.computeBoundingSphere();
  return g;
}
