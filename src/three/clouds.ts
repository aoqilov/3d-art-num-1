// Clouds: a sky dome drawn at the far plane behind everything, with procedural cumulus (fbm noise projected
// onto a flat cloud layer), lit from the sun's side, warm at dusk, dark at night, thinning into the horizon
// haze and drifting slowly with the wind. One shader for the complex and the block scenes.
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

// node graph written loosely typed: the TSL typings get in the way of plain shader maths
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T = TSL as any;
const { Fn, Loop, Discard, vec2, vec3, vec4, float, fract, floor, dot, mix, smoothstep, clamp, max, pow, normalize, varying,
  positionLocal, cameraProjectionMatrix, cameraViewMatrix, mat3 } = T;

const hash = Fn(([q]: any[]) => {
  const p = vec2(q).toVar();
  p.assign(fract(p.mul(vec2(123.34, 456.21))));
  p.addAssign(dot(p, p.add(45.32)));
  return fract(p.x.mul(p.y));
});
const noise = Fn(([p]: any[]) => {
  const i = floor(p), f = fract(p);
  const u = f.mul(f).mul(float(3).sub(f.mul(2)));
  return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x), u.y);
});
const fbm = Fn(([q]: any[]) => {
  const p = vec2(q).toVar(), a = float(0.5).toVar(), s = float(0).toVar();
  Loop(5, () => { s.addAssign(a.mul(noise(p))); p.assign(p.mul(2.03).add(vec2(17.1, 9.2))); a.mulAssign(0.5); });
  return s;
});

export class CloudDome {
  readonly mesh: THREE.Mesh;
  private u = {
    uTime: T.uniform(140), uDay: T.uniform(1), uDusk: T.uniform(0), uNight: T.uniform(0),
    uCover: T.uniform(0.5), uSun: T.uniform(new THREE.Vector3(0.3, 0.8, 0.5)),
  };
  private last = performance.now();
  constructor() {
    const mat = this.material();
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -1000;
    this.mesh.raycast = () => {};
    this.mesh.onBeforeRender = () => { const now = performance.now(); this.u.uTime.value += Math.min(0.2, (now - this.last) / 1000); this.last = now; };
  }
  private material() {
    const { uTime, uDay, uDusk, uNight, uCover, uSun } = this.u;
    const mat = new MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, fog: false });
    // follows the camera (rotation only) and sits at the far plane
    mat.vertexNode = cameraProjectionMatrix.mul(vec4(mat3(cameraViewMatrix).mul(positionLocal), 1)).xyww;
    const vDir = varying(positionLocal);
    const density = Fn(([uv]: any[]) => {
      const big = fbm(uv.mul(0.35).add(3.7));                 // where the cloud fields are
      const d = fbm(uv).mul(0.75).add(big.mul(0.45));
      return smoothstep(uCover, uCover.add(0.17), d);
    });
    mat.colorNode = Fn(() => {
      const d = normalize(vDir);
      Discard(d.y.lessThan(0.01));
      const uv = d.xz.div(d.y.add(0.22)).mul(1.5).add(vec2(uTime.mul(0.006), uTime.mul(0.0025)));
      const c = density(uv);
      Discard(c.lessThan(0.004));
      // light: thinner towards the sun = brighter edge, thick away from it = grey belly
      const ls = normalize(uSun.xz.add(1e-4)).mul(0.16);
      const c2 = density(uv.add(ls));
      const lit = clamp(float(0.8).add(c.sub(c2).mul(1.6)).sub(c.mul(c).mul(0.42)), 0, 1);
      const toSun = max(0, dot(d, normalize(uSun)));
      const day = mix(vec3(0.42, 0.48, 0.6), vec3(1), lit);
      const dusk = mix(vec3(0.34, 0.33, 0.44), vec3(1.0, 0.66, 0.42), lit.mul(float(0.45).add(pow(toSun, 2).mul(0.55))));
      const night = mix(vec3(0.016, 0.02, 0.036), vec3(0.05, 0.06, 0.09), lit);
      const col = mix(mix(day, dusk, uDusk).mul(float(0.25).add(uDay.mul(0.75))), night, uNight)
        .add(vec3(1.0, 0.9, 0.75).mul(pow(toSun, 24).mul(0.25).mul(uDay).mul(float(1).sub(c.mul(0.6)))));   // silver lining
      const a = c.mul(smoothstep(0.012, 0.1, d.y)).mul(float(0.94).sub(uNight.mul(0.3)));
      return vec4(col, a);
    })();
    return mat;
  }
  /** sun direction and the daylight factors of sun.ts */
  setSun(dir: THREE.Vector3, k: { dayK: number; dusk: number; nightF: number }) {
    this.u.uSun.value.copy(dir).normalize();
    this.u.uDay.value = k.dayK; this.u.uDusk.value = Math.min(1, k.dusk); this.u.uNight.value = k.nightF;
  }
  /** 0 clear … 1 overcast */
  setCover(c: number) { this.u.uCover.value = 0.82 - 0.5 * c; }
  set visible(v: boolean) { this.mesh.visible = v; }
  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
