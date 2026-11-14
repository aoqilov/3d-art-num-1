// The free land around the complex (yards, plots, verges between the OpenStreetMap layers): photo textures of
// packed earth and sparse grass (public/ground/, tools/ground/prepare.mjs), blended in patches by a large noise
// so the ground reads as worn yards and grassy verges. Each texture is sampled at two scales and two turns, so
// the repeat does not show from above. `plain` = the flat colour (white model, plan view).
import * as THREE from 'three';
import { dot, float, materialColor, mix, mx_fractal_noise_float, positionWorld, smoothstep, texture, uniform, vec2, vec3 } from 'three/tsl';
import { nodes } from './gpu';

function load(name: string) {
  const t = new THREE.TextureLoader().load(`ground/${name}.webp`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  return t;
}

export function groundMaterial() {
  const dirt = load('dirt'), grass = load('grass');
  const m = new THREE.MeshStandardMaterial({ color: '#a9b59a', roughness: 1 });
  const textured = uniform(1);
  const p = positionWorld.xz;
  // a 90°-turned, 7.3× larger second sample breaks the tiling
  const two = (t: THREE.Texture, size: number) => {
    const a = texture(t, p.div(size)).rgb, b = texture(t, vec2(p.y, p.x.negate()).div(size * 7.3)).rgb;
    return mix(a, b, 0.4);
  };
  const n = mx_fractal_noise_float(vec3(p.mul(0.018), 0), 3, 2, 0.5).mul(0.5).add(0.5);     // 0…1, patches ~50 m
  const fine = mx_fractal_noise_float(vec3(p.mul(0.11), 3.7), 2, 2, 0.5).mul(0.5).add(0.5);  // ragged edges
  // fresh young grass nearly everywhere, bare earth only in small patches (the owner: the land looked dried out).
  // The grass photo is mostly soil between blades (average linear 0.081 / 0.049 / 0.009: brown), so tinting it gave
  // olive; now only its light and shade is kept and it is coloured with two spring greens, mixed in patches.
  const k = smoothstep(0.03, 0.32, n.add(fine.sub(0.5).mul(0.35)));
  const g = two(grass, 4);
  const detail = dot(g, vec3(0.2126, 0.7152, 0.0722)).div(0.0531).clamp(0.4, 1.8);     // 0.0531: the photo's mean luminance
  // natural lawn greens (a first try at twice this saturation read as artificial turf from above)
  const fresh = mix(vec3(0.058, 0.145, 0.026), vec3(0.092, 0.17, 0.034), smoothstep(0.3, 0.7, fine));
  const lawn = fresh.mul(detail);
  const earth = two(dirt, 5).mul(vec3(0.82, 1.0, 0.72));          // the few bare patches: earth with a green cast
  const ground = mix(earth, lawn, k);
  nodes(m).colorNode = mix(materialColor, ground, textured);     // materialColor follows material.color
  return {
    material: m,
    /** false: the flat colour of material.color (white model) */
    setTextured(on: boolean) { textured.value = on ? 1 : 0; },
  };
}
