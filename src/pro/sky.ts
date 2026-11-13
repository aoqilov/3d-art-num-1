// Physically based sky (Preetham / three.js Sky model) baked on the CPU into an HDR equirect texture,
// so the same picture serves as background and image-based lighting (PMREM).
// The sun disc itself is left out: the sun is a DirectionalLight with real shadows.
import * as THREE from 'three';

const totalRayleigh = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MieConst = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const cutoffAngle = 1.6110731556870734, steepness = 1.5, EE = 1000;
const rayleighZenithLength = 8.4e3, mieZenithLength = 1.25e3;
const THREE_OVER_SIXTEENPI = 0.05968310365946075, ONE_OVER_FOURPI = 0.07957747154594767;

export type SkyParams = { sun: THREE.Vector3; turbidity?: number; rayleigh?: number; mie?: number; g?: number; night?: number; gain?: number };

/** Linear HDR radiance for every texel of a W×H equirect map. */
export function skyPixels(W: number, H: number, p: SkyParams) {
  const turbidity = p.turbidity ?? 2.8, rayleigh = p.rayleigh ?? 2.2, mieCoefficient = p.mie ?? 0.005, g = p.g ?? 0.8, gain = p.gain ?? 1;
  const night = p.night ?? 0;
  const sd = p.sun.clone().normalize();
  const sunY = sd.y;
  const zen = Math.max(-1, Math.min(1, sunY));
  const sunE = EE * Math.max(0, 1 - Math.exp(-((cutoffAngle - Math.acos(zen)) / steepness)));
  const sunfade = 1 - Math.max(0, Math.min(1, 1 - Math.exp((sunY * 450000) / 450000)));
  const rc = rayleigh - (1 - sunfade);
  const bR = totalRayleigh.map((v) => v * rc);
  const c = 0.2 * turbidity * 10e-18;
  const bM = MieConst.map((v) => 0.434 * c * v * mieCoefficient);
  const horizonBlend = Math.max(0, Math.min(1, Math.pow(1 - sunY, 5)));
  const out = new Float32Array(W * H * 4);
  const ground = [0.16, 0.17, 0.15];
  let hz = [0, 0, 0];
  for (let j = 0; j < H; j++) {
    // three.js equirect: u = atan(dir.z, dir.x) / 2π + 0.5, v = asin(dir.y) / π + 0.5 (row 0 = v 0 = straight down)
    const elev = ((j + 0.5) / H - 0.5) * Math.PI;
    const dy = Math.sin(elev), sr = Math.cos(elev);
    for (let i = 0; i < W; i++) {
      const phi = ((i + 0.5) / W - 0.5) * Math.PI * 2;
      const dx = Math.cos(phi) * sr, dz = Math.sin(phi) * sr;
      const up = Math.max(0, dy);
      const za = Math.acos(up);
      const inv = 1 / (Math.cos(za) + 0.15 * Math.pow(Math.max(1e-3, 93.885 - (za * 180) / Math.PI), -1.253));
      const sR = rayleighZenithLength * inv, sM = mieZenithLength * inv;
      const cosT = dx * sd.x + Math.max(dy, 0.002) * sd.y + dz * sd.z;
      const rPhase = THREE_OVER_SIXTEENPI * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
      const g2 = g * g;
      const mPhase = ONE_OVER_FOURPI * ((1 - g2) / Math.pow(1 - 2 * g * cosT + g2, 1.5));
      const k = (i + j * W) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const Fex = Math.exp(-(bR[ch] * sR + bM[ch] * sM));
        const bt = (bR[ch] * rPhase + bM[ch] * mPhase) / (bR[ch] + bM[ch]);
        let Lin = Math.pow(sunE * bt * (1 - Fex), 1.5);
        Lin *= 1 + (Math.pow(sunE * bt * Fex, 0.5) - 1) * horizonBlend;
        const L0 = 0.1 * Fex;
        let v = (Lin + L0) * 0.04 + [0, 0.0003, 0.00075][ch];
        v = Math.pow(v, 1 / (1.2 + 1.2 * sunfade));
        out[k + ch] = v * gain;
      }
      if (dy >= 0 && dy < 0.02) hz = [out[k], out[k + 1], out[k + 2]];
      if (dy < 0) {
        // ground: lit grey-green, fading into the horizon haze
        const t = Math.min(1, -dy * 6);
        const lit = 0.25 + 0.75 * Math.max(0, sunY);
        for (let ch = 0; ch < 3; ch++) out[k + ch] = out[k + ch] * (1 - t) + ground[ch] * lit * (0.3 + 0.7 * (1 - night)) * t;
      }
      out[k + 3] = 1;
    }
  }
  // night: deep blue dome with a faint horizon glow (city light); no stars: on a 512 px sky they blur into blobs
  if (night > 0) {
    for (let j = 0; j < H; j++) {
      const dy = Math.sin(((j + 0.5) / H - 0.5) * Math.PI);
      for (let i = 0; i < W; i++) {
        const k = (i + j * W) * 4;
        const glow = Math.exp(-Math.max(0, dy) * 7);
        const n = dy >= 0 ? [0.004 + 0.02 * glow, 0.007 + 0.016 * glow, 0.018 + 0.012 * glow] : [0.006, 0.006, 0.007];
        for (let ch = 0; ch < 3; ch++) out[k + ch] = out[k + ch] * (1 - night) + n[ch] * night;
      }
    }
  }
  return { data: out, horizon: hz };
}

export function skyTexture(W: number, H: number, p: SkyParams) {
  const { data, horizon } = skyPixels(W, H, p);
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.needsUpdate = true;
  return { texture: t, horizon };
}
