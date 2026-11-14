// Physically based sky and sunlight for the Ultra renderer (@takram/three-atmosphere, Bruneton's precomputed
// scattering — the model behind Unreal's sky atmosphere): sky, sun disc, moon, stars, sunlight coloured and
// dimmed by the air it crosses, sky light for reflections, and aerial perspective (haze over distance).
// The scene is placed on the earth at the site in Tashkent, so the sky matches the real sun of sun.ts.
import * as THREE from 'three';
import { context } from 'three/tsl';
import {
  AtmosphereContext, AtmosphereLight, AtmosphereLightNode, AtmosphereParameters, StarsNode, aerialPerspective, skyEnvironment,
} from '@takram/three-atmosphere/webgpu';
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial';
import type { Renderer } from '../three/gpu';

const LAT = 41.31, LON = 69.28, HEIGHT = 440;
/** the master plan is turned 15° from north (sun.ts): complex scene frame → local north / up / east */
const PHI = THREE.MathUtils.degToRad(15);
const COMPLEX_TO_NUE = new THREE.Matrix4().set(
  Math.sin(PHI), 0, -Math.cos(PHI), 0,
  0, 1, 0, 0,
  Math.cos(PHI), 0, Math.sin(PHI), 0,
  0, 0, 0, 1,
);
/** The default scale makes noon want an exposure of ~10; ours brings it to ~1, the range the existing lamps,
 *  lit windows and facade lights were made for, so they need no change. */
const LUMINANCE = 8;

/** The sun as an atmosphere light: direction from the context, colour and strength from the air it crosses. */
export function sunLight(distance: number) {
  return new AtmosphereLight(distance);
}

/**
 * @param worldToComplex rotation from this scene's frame to the complex frame (identity for the complex view,
 *   the block's turn for the block view)
 */
export function createAtmosphere(renderer: Renderer, camera: THREE.Camera, worldToComplex = new THREE.Matrix4()) {
  const params = new AtmosphereParameters();
  params.luminanceScale *= LUMINANCE;
  const atm = new AtmosphereContext(params);
  atm.camera = camera;
  const r = renderer as unknown as { contextNode: { value: object }; library: { addLight(n: unknown, l: unknown): void } };
  r.contextNode = context({ ...r.contextNode.value, getAtmosphere: () => atm }) as unknown as { value: object };
  r.library.addLight(AtmosphereLightNode, AtmosphereLight);

  const ecef = new Geodetic(radians(LON), radians(LAT), HEIGHT).toECEF();
  const m = Ellipsoid.WGS84.getNorthUpEastFrame(ecef, atm.matrixWorldToECEF.value as THREE.Matrix4);
  m.multiply(COMPLEX_TO_NUE).multiply(worldToComplex);
  const rot = new THREE.Matrix3().setFromMatrix4(m);
  const v = new THREE.Vector3();

  return {
    context: atm,
    /** sun direction in this scene's frame (sun.ts); the full moon stands opposite */
    setSun(dir: THREE.Vector3) {
      (atm.sunDirectionECEF.value as THREE.Vector3).copy(dir).applyMatrix3(rot).normalize();
      v.copy(dir).negate(); v.y = Math.abs(v.y) * 0.8 + 0.25;
      (atm.moonDirectionECEF.value as THREE.Vector3).copy(v.normalize()).applyMatrix3(rot).normalize();
    },
    /** post-processing node: haze and in-scattered light over distance, the sky where nothing was drawn */
    aerial(color: unknown, depth: unknown) {
      const ap = aerialPerspective(color as never, depth as never);
      // star catalogue served with the app, not fetched from GitHub
      if (ap.skyNode) (ap.skyNode as unknown as { starsNode: unknown }).starsNode = new StarsNode('pro/atm/stars.bin');
      return ap;
    },
    environment: () => skyEnvironment(),
  };
}
export type Atmosphere = ReturnType<typeof createAtmosphere>;
