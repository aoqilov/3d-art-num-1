// Ultra renderer (sales-office computer, RTX class GPU), three.js WebGPU post-processing:
//  • physical atmosphere (atmosphere.ts): sky, sun, moon, stars, sunlight through the air, haze over distance
//  • PBR texture sets on every material, soft shadows
//  • SSGI: screen-space global illumination — light bounced off walls and ground, plus ambient occlusion
//  • SSR: screen-space reflections on metal and glass (off for now, see fx.ssr)
//  • bloom, TRAA (temporal anti-aliasing, replaces MSAA), tone mapping and grading per time of day
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from 'three';
import { RenderPipeline } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { ssgi } from 'three/examples/jsm/tsl/display/SSGINode.js';
import { ssr } from 'three/examples/jsm/tsl/display/SSRNode.js';
import TRAANode from 'three/examples/jsm/tsl/display/TRAANode.js';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import type { ProInternals, ProRenderer, ProState } from '../block/BlockScene';
import { applyProMaterials, metricUVs } from './proMaterials';
import { createAtmosphere } from './atmosphere';
import { skyTexture } from './sky';
import { lookAt } from '../three/timeStops';

// node graphs written loosely typed: the TSL typings get in the way of plain shader maths
const T = TSL as any;
const { pass, mrt, output, diffuseColor, normalView, packNormalToRGB, unpackRGBToNormal, sample, velocity, metalness, roughness,
  vec4, blendColor } = T;

/** TRAA jitters the camera with a view offset of its own; this one keeps the scene's offset (the block view is
 *  shifted left of the side panel, camera.userData.baseView) and adds the jitter on top. */
type View = { fullWidth: number; fullHeight: number; offsetX: number; offsetY: number; width: number; height: number };
class TRAAKeepView extends (TRAANode as unknown as new (...a: unknown[]) => { camera: THREE.PerspectiveCamera; setViewOffset(w: number, h: number): void; clearViewOffset(): void }) {
  setViewOffset(w: number, h: number) {
    const s = this.camera.userData.baseView as View | undefined;
    if (s) this.camera.setViewOffset(s.fullWidth, s.fullHeight, s.offsetX, s.offsetY, s.width, s.height);
    super.setViewOffset(w, h);
    const j = this.camera.view;
    if (s && j) this.camera.setViewOffset(s.fullWidth, s.fullHeight, s.offsetX + j.offsetX * s.fullWidth / w, s.offsetY + j.offsetY * s.fullHeight / h, s.width, s.height);
  }
  clearViewOffset() {
    super.clearViewOffset();
    const s = this.camera.userData.baseView as View | undefined;
    if (s) this.camera.setViewOffset(s.fullWidth, s.fullHeight, s.offsetX, s.offsetY, s.width, s.height);
  }
}

/** frames rendered after the last change, so the temporal effects (TRAA, SSGI denoise) settle */
const SETTLE = 60;

export function createPro(i: ProInternals): ProRenderer {
  const { renderer, scene, camera, sun, hemi } = i;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.type = THREE.PCFShadowMap;      // filtered with shadow.radius
  renderer.toneMapping = i.atmosphere ? THREE.AgXToneMapping : THREE.NeutralToneMapping;   // AgX: filmic roll-off for the physical sky's range
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);               // empty texels: sky (aerial perspective), no label
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.00015;

  const state: ProState = { pt: false, samples: 0, target: 0, busy: false, canPT: false, ao: true, bloom: true, ready: false };
  const emit = () => i.emit({ ...state });

  // ---------- materials
  applyProMaterials(renderer, () => { state.ready = true; i.redraw(); emit(); });

  // ---------- sky, sunlight, haze
  // physical (block view): the atmosphere. The old sky texture and fog stay assigned (the scenes still update
  // them) but are not seen: the atmosphere draws over every empty texel, fog is pushed out.
  // classic (complex view, for now): the CPU sky as background and image-based light, fog — seen from 300 m up
  // the aerial perspective tints the whole district brown and the atmosphere sun renders it black (CLAUDE.md).
  const physical = !!i.atmosphere;
  const atm = physical ? createAtmosphere(renderer, camera, i.worldToComplex) : null;
  if (atm) {
    const atmSun = sun as unknown as { indirect?: { value: boolean } };
    if (atmSun.indirect) atmSun.indirect.value = false;          // the sky environment lights instead
    scene.environment = null;
    (scene as unknown as { environmentNode: unknown }).environmentNode = atm.environment();
    if (scene.fog instanceof THREE.Fog) { scene.fog.near = 1e7; scene.fog.far = 1e7 + 1; }
  }
  let sky: THREE.DataTexture | null = null;

  // ---------- pipeline
  const pipeline = new RenderPipeline(renderer);
  pipeline.outputColorTransform = false;             // tone mapping, then grading, done below
  const scenePass = pass(scene, camera);
  // four targets (32 bytes a pixel, the WebGPU default limit): metalness rides in the albedo's alpha,
  // roughness in the normal's
  // see-through surfaces that write no depth (decals, light panes, open glazing) stay out of the reflections:
  // the depth there is whatever lies behind them
  const solid = (a: unknown, b: unknown) => T.Fn((_: unknown, builder: { material?: THREE.Material }) => {
    const m = builder.material;
    return m && m.transparent && !m.depthWrite ? b : a;
  })();
  scenePass.setMRT(mrt({
    output,
    diffuseColor: vec4(diffuseColor.rgb, solid(metalness, T.float(0))),
    normal: vec4(packNormalToRGB(normalView), roughness),
    velocity,
  }));
  for (const n of ['diffuseColor', 'normal']) scenePass.getTexture(n).type = THREE.UnsignedByteType;   // bandwidth
  const color = scenePass.getTextureNode('output');
  const diffuse = scenePass.getTextureNode('diffuseColor');
  const depth = scenePass.getTextureNode('depth');
  const normalTex = scenePass.getTextureNode('normal');
  const vel = scenePass.getTextureNode('velocity');
  const normal = sample((uv: unknown) => unpackRGBToNormal(normalTex.sample(uv).rgb));

  const gi = ssgi(color, depth, normal, camera);
  gi.sliceCount.value = 2; gi.stepCount.value = 12;
  gi.radius.value = 6; gi.giIntensity.value = 4; gi.aoIntensity.value = 1.2; gi.thickness.value = 0.6;
  const refl = ssr(color, depth, normal, { metalnessNode: diffuse.a, roughnessNode: normalTex.a, camera });
  refl.maxDistance.value = 60; refl.thickness.value = 0.25; refl.quality.value = 0.6;

  // clouds: their own pass laid over the sky after the aerial perspective (which repaints every empty texel)
  let clouds: any = null;
  const cloudGain = T.uniform(1);
  const nightSky = T.uniform(0);
  if (i.clouds && physical) {
    const cs = new THREE.Scene();
    scene.remove(i.clouds.mesh); cs.add(i.clouds.mesh);
    clouds = pass(cs, camera);
  }
  let overlay: unknown = null;
  if (i.overlay) {
    // its own camera, copied before the frame: TRAA jitters the main one during the pipeline
    const oc = i.camera.clone();
    overlay = pass(i.overlay, oc);
    (i as { syncOverlay?: () => void }).syncOverlay = () => oc.copy(camera);
  }
  // grading after tone mapping (per time of day, timeStops.ts)
  const gSat = T.uniform(1), gCon = T.uniform(1), gWarm = T.uniform(0), gLift = T.uniform(0);
  const grade = (c: any) => {
    const l = T.dot(c.rgb, T.vec3(0.2126, 0.7152, 0.0722));
    let g = T.mix(T.vec3(l), c.rgb, gSat);
    g = g.sub(0.5).mul(gCon).add(0.5);
    g = g.mul(T.vec3(T.float(1).add(gWarm), 1, T.float(1).sub(gWarm)));
    g = g.add(T.float(1).sub(g).mul(gLift));
    return vec4(g.clamp(0, 1), 1);
  };

  const glowK = { threshold: 1.0, strength: 0.15 };
  // SSR is off: on this geometry it smears black at depth edges (canopies, frames, sign letters); glazing keeps
  // reflecting the sky through the environment map. To revisit with the Blender model (stage 3).
  const fx = { ssr: false, clouds: true, overlay: true, aerial: true };
  let glow: ReturnType<typeof bloom> | null = null;
  let traa: { dispose(): void } | null = null;

  const build = () => {
    let c = color;
    if (state.ao) c = vec4(c.rgb.mul(gi.getAONode().r).add(diffuse.rgb.mul(gi.getGINode().rgb)), c.a);
    if (fx.ssr) c = blendColor(c, refl);
    if (atm) {
      if (fx.aerial) c = atm.aerial(c, depth);
      // only where nothing was drawn: the sky
      const isSky = T.step(0.99999, depth);
      // night: the physical sky is almost black at an exposure made for lamps and lit windows; keep the deep
      // blue dome with a faint city glow at the horizon (as in the light build)
      const vp = T.getViewPosition(T.screenUV, T.float(1), T.cameraProjectionMatrixInverse);
      const up = T.cameraWorldMatrix.mul(vec4(vp, 0)).xyz.normalize().y.max(0);
      const nightDome = T.mix(T.vec3(0.035, 0.032, 0.04), T.vec3(0.006, 0.011, 0.032), up.pow(0.45));
      c = vec4(c.rgb.add(nightDome.mul(nightSky).mul(isSky)), 1);
      if (clouds && fx.clouds) { const cl = clouds.getTextureNode(); c = vec4(T.mix(c.rgb, cl.rgb.mul(cloudGain), cl.a.mul(isSky)), 1); }
    }
    glow?.dispose(); glow = null;
    if (state.bloom) { glow = bloom(c, glowK.strength, 0.6, glowK.threshold); c = c.add(glow); }
    traa?.dispose();
    const aa = new TRAAKeepView(T.convertToTexture(c), depth, vel, camera);
    traa = aa as unknown as { dispose(): void };
    let out = grade(T.renderOutput(aa, physical ? THREE.AgXToneMapping : THREE.NeutralToneMapping, THREE.SRGBColorSpace));
    // labels on top: after tone mapping and grading, unjittered, untouched by AO / bloom
    if (overlay && fx.overlay) out = blendColor(out, T.renderOutput(overlay, THREE.NoToneMapping, THREE.SRGBColorSpace));
    (pipeline as unknown as { outputNode: unknown }).outputNode = out;
    pipeline.needsUpdate = true;
  };
  build();
  // tuning from the console: __pro.gi.giIntensity.value = …; __pro.fx.ssr = false; __pro.build()
  (window as unknown as { __pro: object }).__pro = {
    gi, refl, fx, state, pipeline, atm, grading: { gSat, gCon, gWarm, gLift, cloudGain },
    build: () => { build(); settle = SETTLE; i.redraw(); }, get glow() { return glow; },
  };

  let settle = SETTLE;
  const self: ProRenderer = {
    frame(changed) {
      if (changed) settle = SETTLE;
      if (settle <= 0) return false;
      (i as { syncOverlay?: () => void }).syncOverlay?.();
      settle--;
      pipeline.render();
      return settle > 0;
    },
    hour({ sunDir, nightF, dayK, hour }) {
      const L = lookAt(hour);
      const inside = i.interior?.() ?? false;
      gSat.value = L.sat; gCon.value = L.contrast; gWarm.value = L.warmth; gLift.value = L.lift;
      i.clouds?.setCover(L.cloud);
      if (atm) {
        atm.setSun(sunDir);
        // indoors the eye adapts: by day the rooms get only what the windows let in
        renderer.toneMappingExposure = L.exposure * (inside ? (nightF > 0.5 ? 1.5 : 3.5) : 1);
        cloudGain.value = (L.cloudGain * 0.9) / L.exposure;     // clouds were drawn for an exposure of 1
        // the atmosphere colours and dims the sun itself; at night the moon and the city glow are a faint blue fill
        sun.intensity = 1; sun.color.set('#ffffff');
        hemi.intensity = 0.02 + 0.3 * nightF;      // the building lights itself; the fill only keeps the ground readable
        nightSky.value = 2.2 * nightF;
      } else {
        // classic: the CPU sky as background and image-based light (prefiltered by the renderer), fog at its horizon
        const tex = skyTexture(512, 256, { sun: sunDir, night: nightF, gain: 0.55 });
        sky?.dispose(); sky = tex.texture;
        scene.environment = sky; scene.background = sky;
        scene.environmentIntensity = 0.05 + 0.75 * dayK + 0.25 * nightF;
        hemi.intensity = 0.04 + 0.06 * dayK + 0.7 * nightF;      // moon and city glow keep the night readable
        const hz = tex.horizon;
        (scene.fog as THREE.Fog).color.setRGB(Math.min(1, hz[0]), Math.min(1, hz[1]), Math.min(1, hz[2]), THREE.LinearSRGBColorSpace);
        renderer.toneMappingExposure = 1.0 + 0.35 * nightF;
        sun.intensity *= 1.7;
      }
      // indoors only the lit diffusers should glow; outdoors at night the whole lit facade may bloom
      glowK.threshold = inside ? 1.4 : 0.9 + 0.6 * (1 - nightF);
      glowK.strength = L.bloom;
      if (glow) { glow.threshold.value = glowK.threshold; glow.strength.value = glowK.strength; }
      settle = SETTLE;
      i.redraw();
    },
    resize() { settle = SETTLE; },
    furniture(g) { metricUVs(g); },
    set(o) {
      if (o.ao !== undefined) state.ao = o.ao;
      if (o.bloom !== undefined) state.bloom = o.bloom;
      build(); settle = SETTLE;
      i.redraw(); emit();
    },
    dispose() { pipeline.dispose(); sky?.dispose(); },
  };
  emit();
  return self;
}
