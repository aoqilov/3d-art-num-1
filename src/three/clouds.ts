// Clouds: a sky dome drawn at the far plane behind everything, with procedural cumulus (fbm noise projected
// onto a flat cloud layer), lit from the sun's side, warm at dusk, dark at night, thinning into the horizon
// haze and drifting slowly with the wind. One shader for the complex and the block scenes.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);   // follows the camera: rotation only
  gl_Position = p.xyww;                                                  // at the far plane
}`;
const FRAG = /* glsl */ `
uniform float uTime, uDay, uDusk, uNight, uCover;
uniform vec3 uSun;
varying vec3 vDir;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return s;
}
float density(vec2 uv) {
  float big = fbm(uv * 0.35 + 3.7);                       // where the cloud fields are
  float d = fbm(uv) * 0.75 + big * 0.45;
  return smoothstep(uCover, uCover + 0.17, d);
}
void main() {
  vec3 d = normalize(vDir);
  if (d.y < 0.01) discard;
  vec2 uv = d.xz / (d.y + 0.22) * 1.5 + vec2(uTime * 0.006, uTime * 0.0025);
  float c = density(uv);
  if (c < 0.004) discard;
  // light: thinner towards the sun = brighter edge, thick away from it = grey belly
  vec2 ls = normalize(uSun.xz + 1e-4) * 0.16;
  float c2 = density(uv + ls);
  float lit = clamp(0.8 + (c - c2) * 1.6 - c * c * 0.42, 0.0, 1.0);
  float toSun = max(0.0, dot(d, normalize(uSun)));
  vec3 day = mix(vec3(0.42, 0.48, 0.6), vec3(1.0), lit);
  vec3 dusk = mix(vec3(0.34, 0.33, 0.44), vec3(1.0, 0.66, 0.42), lit * (0.45 + 0.55 * pow(toSun, 2.0)));
  vec3 night = mix(vec3(0.016, 0.02, 0.036), vec3(0.05, 0.06, 0.09), lit);
  vec3 col = mix(day, dusk, uDusk);
  col = mix(col * (0.25 + 0.75 * uDay), night, uNight);
  col += vec3(1.0, 0.9, 0.75) * pow(toSun, 24.0) * 0.25 * uDay * (1.0 - c * 0.6);     // silver lining near the sun
  float a = c * smoothstep(0.012, 0.1, d.y) * (0.94 - 0.3 * uNight);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class CloudDome {
  readonly mesh: THREE.Mesh;
  private u = {
    uTime: { value: 140 }, uDay: { value: 1 }, uDusk: { value: 0 }, uNight: { value: 0 },
    uCover: { value: 0.5 }, uSun: { value: new THREE.Vector3(0.3, 0.8, 0.5) },
  };
  private last = performance.now();
  constructor() {
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -1000;
    this.mesh.raycast = () => {};
    this.mesh.onBeforeRender = () => { const now = performance.now(); this.u.uTime.value += Math.min(0.2, (now - this.last) / 1000); this.last = now; };
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
