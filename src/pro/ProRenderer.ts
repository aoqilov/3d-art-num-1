// PRO renderer for the sales-office computer (GTX 1650 or better):
//  • physically based sky (HDR equirect) → background and image-based lighting
//  • PBR texture sets on every material, soft shadows, GTAO ambient occlusion, bloom, AgX tone mapping, MSAA
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { ProInternals, ProRenderer, ProState } from '../block/BlockScene';
import { CUT } from '../block/materials';
import { applyProMaterials, metricUVs } from './proMaterials';
import { skyTexture } from './sky';


export function createPro(i: ProInternals): ProRenderer {
  const { renderer, scene, camera, sun, hemi } = i;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;   // Khronos PBR Neutral: true-to-material colours
  renderer.toneMappingExposure = 1;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.00015;

  const state: ProState = { pt: false, samples: 0, target: 0, busy: false, canPT: false, ao: true, bloom: true, ready: false };
  const emit = () => i.emit({ ...state });

  // ---------- materials
  applyProMaterials(renderer, () => { state.ready = true; i.redraw(); emit(); });

  // ---------- sky
  const pmrem = new THREE.PMREMGenerator(renderer);
  let sky: THREE.DataTexture | null = null;
  let envRT: THREE.WebGLRenderTarget | null = null;
  let skyNight = 0;

  // ---------- raster pipeline
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.normalMaterial.clippingPlanes = [CUT];
  gtao.blendIntensity = 0.9;
  gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.6, thickness: 1.2, scale: 1, samples: 16, distanceFallOff: 1 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  composer.addPass(gtao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.28, 0.55, 1.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const raster = () => composer.render();

  const self: ProRenderer = {
    frame(changed) {
      if (changed) raster();
      return false;
    },
    hour({ sunDir, nightF, dayK }) {
      const tex = skyTexture(512, 256, { sun: sunDir, night: nightF, gain: 0.55 });
      sky?.dispose(); sky = tex.texture; skyNight = nightF;
      envRT?.dispose(); envRT = pmrem.fromEquirectangular(sky);
      scene.environment = envRT.texture;
      scene.background = sky;
      scene.environmentIntensity = 0.05 + 0.75 * dayK;
      scene.backgroundIntensity = 1;
      hemi.intensity = 0.04 + 0.06 * dayK;
      const inside = i.interior?.() ?? false;
      // indoors only the lit diffusers should glow; outdoors at night the whole lit facade may bloom
      bloom.threshold = inside ? 1.4 + 4 * dayK : 0.9 + 5 * dayK;
      bloom.strength = inside ? 0.12 + 0.06 * nightF : 0.12 + 0.3 * nightF;
      const h = tex.horizon;
      (scene.fog as THREE.Fog).color.setRGB(Math.min(1, h[0]), Math.min(1, h[1]), Math.min(1, h[2]), THREE.LinearSRGBColorSpace);
      renderer.toneMappingExposure = inside ? 1.0 : 1.0 + 0.35 * skyNight;
      sun.intensity *= 1.7;
      i.redraw();
    },
    resize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);   // passes (GTAO, bloom) are resized by the composer
    },
    furniture(g) { metricUVs(g); },
    set(o) {
      if (o.ao !== undefined) { state.ao = o.ao; gtao.enabled = o.ao; }
      if (o.bloom !== undefined) { state.bloom = o.bloom; bloom.enabled = o.bloom; }
      i.redraw(); emit();
    },
    dispose() { composer.dispose(); pmrem.dispose(); sky?.dispose(); envRT?.dispose(); },
  };
  emit();
  return self;
}
