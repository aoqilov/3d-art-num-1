// The free land around the complex (yards, plots, verges between the OpenStreetMap layers): photo textures of
// packed earth and sparse grass (public/ground/, tools/ground/prepare.mjs), blended in patches by a large noise
// so the ground reads as worn yards and grassy verges. Each texture is sampled at two scales and two turns, so
// the repeat does not show from above. `plain` = the flat colour (white model, plan view).
import * as THREE from 'three';
import { float, materialColor, mix, mx_fractal_noise_float, positionWorld, smoothstep, texture, uniform, vec2, vec3 } from 'three/tsl';
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
  // grass on ~3/4 of the land (the owner wanted it greener: watered yards and verges, bare earth only in patches)
  const k = smoothstep(0.14, 0.90, n.add(fine.sub(0.5).mul(0.35)));
  const lawn = two(grass, 4).mul(vec3(0.95, 1.6, 0.62)).mul(1.35);     // light, fresh green
  const earth = two(dirt, 5).mul(vec3(0.9, 1.04, 0.82));          // a hint of green in the bare patches too
  const ground = mix(earth, lawn, k).mul(float(0.92));
  nodes(m).colorNode = mix(materialColor, ground, textured);     // materialColor follows material.color
  return {
    material: m,
    /** false: the flat colour of material.color (white model) */
    setTextured(on: boolean) { textured.value = on ? 1 : 0; },
  };
}
