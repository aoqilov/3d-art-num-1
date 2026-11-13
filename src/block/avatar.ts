// Visitor figure for the third-person walk: a simple mannequin built for a 175 cm / 45 cm person and
// scaled to the height and shoulder width the client enters, with a walking swing of legs and arms.
import * as THREE from 'three';

const H0 = 1.75, W0 = 0.45;

export class Avatar {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private legs: THREE.Object3D[] = [];
  private arms: THREE.Object3D[] = [];
  private phase = 0;
  private swing = 0;
  private stride = 1.3;

  constructor() {
    const skin = new THREE.MeshStandardMaterial({ color: '#d7aa86', roughness: 0.7 });
    const shirt = new THREE.MeshStandardMaterial({ color: '#2f6a52', roughness: 0.75 });
    const trousers = new THREE.MeshStandardMaterial({ color: '#2a2f38', roughness: 0.8 });
    const shoes = new THREE.MeshStandardMaterial({ color: '#1a1b1e', roughness: 0.5 });
    const hair = new THREE.MeshStandardMaterial({ color: '#2b211b', roughness: 0.9 });
    const gold = new THREE.MeshStandardMaterial({ color: '#e2c785', roughness: 0.4, metalness: 0.4 });
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
    };
    const b = this.body;
    // legs (pivot at the hip)
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sx * 0.095, 0.9, 0); b.add(hip);
      add(hip, new THREE.CapsuleGeometry(0.068, 0.7, 4, 10), trousers, 0, -0.42, 0);
      add(hip, new THREE.BoxGeometry(0.1, 0.07, 0.26), shoes, 0, -0.86, -0.05);
      this.legs.push(hip);
    }
    // pelvis + torso
    add(b, new THREE.CapsuleGeometry(0.15, 0.08, 4, 12), trousers, 0, 0.93, 0).scale.set(1.12, 1, 0.75);
    const torso = add(b, new THREE.CapsuleGeometry(0.165, 0.34, 6, 14), shirt, 0, 1.22, 0);
    torso.scale.set(1.3, 1, 0.72);
    add(b, new THREE.BoxGeometry(0.06, 0.06, 0.01), gold, 0.07, 1.35, -0.12); // badge, shows which way is front
    // arms (pivot at the shoulder)
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * 0.215, 1.4, 0); b.add(sh);
      add(sh, new THREE.CapsuleGeometry(0.048, 0.46, 4, 10), shirt, 0, -0.27, 0);
      add(sh, new THREE.SphereGeometry(0.048, 10, 8), skin, 0, -0.56, 0);
      this.arms.push(sh);
    }
    // neck + head
    add(b, new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), skin, 0, 1.5, 0);
    add(b, new THREE.SphereGeometry(0.105, 18, 14), skin, 0, 1.62, 0).scale.set(0.92, 1.08, 1);
    const cap = add(b, new THREE.SphereGeometry(0.108, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 1.64, 0.008);
    cap.scale.set(0.95, 1.05, 1.03);
    add(b, new THREE.BoxGeometry(0.12, 0.022, 0.02), skin, 0, 1.6, -0.1); // nose line at the front
    this.group.add(b);
    this.group.visible = false;
  }

  /** Height and shoulder width in metres. */
  setSize(h: number, w: number) {
    const sy = h / H0, sx = w / W0;
    this.body.scale.set(sx, sy, (sx + 1) / 2);
    this.stride = 1.3 * sy;
  }

  /** Place in world space (feet), facing yaw; moved = metres walked since the last frame. */
  update(x: number, y: number, z: number, yaw: number, moved: number, dt: number) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
    const target = moved > 0.0005 ? Math.min(1, moved / (dt * 1.2 + 1e-4)) : 0;
    this.swing += (target - this.swing) * Math.min(1, dt * 8);
    this.phase += (moved / this.stride) * Math.PI * 2;
    const a = Math.sin(this.phase) * 0.5 * this.swing;
    this.legs[0].rotation.x = a; this.legs[1].rotation.x = -a;
    this.arms[0].rotation.x = -a * 0.8; this.arms[1].rotation.x = a * 0.8;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.025 * this.swing;
  }
}
