// Evening lighting of the type-4 block, kept discreet like a real residential facade:
//  • small bronze up/down wall lights on the solid piers between the window columns, each throwing a warm
//    scallop of light up and down the wall; dense on the lower storeys, thinning out and dimming going up;
//  • a soft warm wash from the ground (canopy downlights, ground floods) that fades with height;
//  • lit windows, the parapet LED crown, accent lines on the arch frame, the canopy downlight strip.
// Everything follows the night factor 0..1.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CUT, prep, type MatName } from './materials';
import { BLOCK_W, FLOOR_H, FLOORS, SLAB, pointInPoly, planFor, type Rect } from './plan';
import { ROOF_Z } from './facade';

/** Night factor of the facade wash (shared by every facade material's shader). */
export const FACADE_NIGHT = { value: 0 };
/** Facade materials and how strongly the ground wash catches them (ornament a little more). */
const GLOW: Partial<Record<MatName, number>> = {
  facade: 1, facade_mint: 1, facade_white: 1, brick: 1, spandrel: 0.6, slab_edge: 0.8, sill: 1, frame_light: 1,
  lattice_white: 1, pilaster: 1.5, pilaster_tile: 1.5, lattice_gold: 2.2,
};
/** Adds the night facade wash to the facade materials (raster: a shader term, no extra lights). */
export function facadeGlow(lib: Record<MatName, THREE.Material>) {
  for (const [name, extra] of Object.entries(GLOW) as [MatName, number][]) {
    const m = lib[name] as THREE.MeshStandardMaterial;
    if (!m || m.userData.glow) continue;
    m.userData.glow = true;
    const prev = m.onBeforeCompile;
    const hasPrev = Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile');   // prep()'s cut-face shading
    m.onBeforeCompile = (sh, r) => {
      if (hasPrev) prev.call(m, sh, r);
      sh.uniforms.uNightFac = FACADE_NIGHT;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vNightY;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          #ifdef USE_INSTANCING
            vNightY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;
          #else
            vNightY = (modelMatrix * vec4(transformed, 1.0)).y;
          #endif`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNightFac;\nvarying float vNightY;')
        .replace('#include <opaque_fragment>', `if (uNightFac > 0.001) {
            float ny = vNightY;
            // ground floods and canopy downlights: strongest on the shop fronts, fading out by mid-height
            float g = ny < ${FLOOR_H.toFixed(2)} ? 0.32 : 0.012 + 0.2 * exp(-(ny - ${FLOOR_H.toFixed(2)}) / 7.0);
            outgoingLight += diffuseColor.rgb * vec3(1.0, 0.78, 0.56) * (g * ${extra.toFixed(2)} * uNightFac);
          }
          #include <opaque_fragment>`);
    };
    const pk = Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') ? m.customProgramCacheKey : null;
    m.customProgramCacheKey = () => (pk ? pk.call(m) : '') + `|nightwash:${extra}`;
    m.needsUpdate = true;
  }
}

function hash(a: number, b: number) {
  let h = (a * 374761393 + b * 668265263) ^ 0x5bd1e995;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function buildNightLights() {
  const group = new THREE.Group();
  const paneMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [CUT] });
  const panes: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const warm = ['#ffd49a', '#ffe2b8', '#fff0d6', '#ffc982', '#f6e6c8', '#ffe9cc', '#fff5e8'].map((c) => new THREE.Color(c));
  const add = (r: Rect, z0: number, z1: number, storey: number, idx: number, always = false) => {
    const plan = planFor(storey);
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    const inApt = (x: number, y: number) => plan.rooms.some((q) => (q.apt !== null || q.kind === 'shop') && q.kind !== 'balcony' && pointInPoly(x, y, q.poly));
    let px: number, py: number, rotY: number, w: number;
    if (r.axis === 'x') {
      const outside = inApt(cx, r.y1 + 0.25) ? -1 : 1; // offset toward the non-room side
      px = cx; py = outside < 0 ? r.y0 - 0.025 : r.y1 + 0.025; rotY = 0; w = r.x1 - r.x0;
    } else {
      const outside = inApt(r.x1 + 0.25, cy) ? -1 : 1;
      px = outside < 0 ? r.x0 - 0.025 : r.x1 + 0.025; py = cy; rotY = Math.PI / 2; w = r.y1 - r.y0;
    }
    if (!always && hash(storey * 131 + idx, 7) > 0.72) return;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(px, (storey - 1) * FLOOR_H + (z0 + z1) / 2, py),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(Math.max(0.1, w - 0.12), z1 - z0 - 0.1, 1),
    );
    panes.push({ m, c: warm[Math.floor(hash(storey, idx) * warm.length)] });
  };
  for (let s = 1; s <= FLOORS; s++) {
    const p = planFor(s);
    const sill = s === 1 ? 0.35 : 1.05, head = s === 1 ? 2.75 : 2.5;
    p.windows.forEach((w, i) => add(w, sill, head, s, i, s === 1));
    p.openings.forEach((o, i) => {
      if (o.kind === 'lift') return;
      const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
      const bal = p.rooms.some((q) => q.kind === 'balcony' && (o.axis === 'x'
        ? pointInPoly(cx, o.y0 - 0.2, q.poly) || pointInPoly(cx, o.y1 + 0.2, q.poly)
        : pointInPoly(o.x0 - 0.2, cy, q.poly) || pointInPoly(o.x1 + 0.2, cy, q.poly)));
      if (bal) add(o, SLAB, 2.5, s, 1000 + i);
    });
  }
  const plane = new THREE.PlaneGeometry(1, 1);
  const inst = new THREE.InstancedMesh(plane, paneMat, panes.length);
  panes.forEach((p, i) => { inst.setMatrixAt(i, p.m); inst.setColorAt(i, p.c); });
  inst.frustumCulled = false;
  group.add(inst);

  // LED crown along the roof edge, accent lines on the arch frame, canopy downlight strip
  const ledMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, depthWrite: false, clippingPlanes: [CUT] });
  const goldMat = new THREE.MeshBasicMaterial({ color: '#ffcf7a', transparent: true, opacity: 0, depthWrite: false, clippingPlanes: [CUT] });
  const strip = (mat: THREE.Material, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(x1 - x0, 0.02), z1 - z0, Math.max(y1 - y0, 0.02)), mat);
    m.position.set((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2);
    group.add(m);
  };
  const fp = planFor(3).footprint.outer;
  for (let i = 0; i < fp.length; i++) {
    const [ax, ay] = fp[i], [bx, by] = fp[(i + 1) % fp.length];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 0.3) continue;
    let nx = (by - ay) / L, ny = -(bx - ax) / L;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (pointInPoly(mx + nx * 0.05, my + ny * 0.05, planFor(3).footprint)) { nx = -nx; ny = -ny; }
    const o = 0.035;
    strip(ledMat, Math.min(ax, bx) + nx * o - 0.01, Math.min(ay, by) + ny * o - 0.01, Math.max(ax, bx) + nx * o + 0.01, Math.max(ay, by) + ny * o + 0.01, ROOF_Z + 1.12, ROOF_Z + 1.18);
    strip(ledMat, Math.min(ax, bx) + nx * o - 0.01, Math.min(ay, by) + ny * o - 0.01, Math.max(ax, bx) + nx * o + 0.01, Math.max(ay, by) + ny * o + 0.01, ROOF_Z - 0.06, ROOF_Z);
  }
  const cx = BLOCK_W / 2, bx0 = 12.42, bx1 = 17.32, fy = -1.47, PW = 0.75, IN = 0.29;
  for (const x of [bx0 - PW, bx0 + IN, bx1 - IN, bx1 + PW]) strip(goldMat, x - 0.02, fy - 0.06, x + 0.02, fy - 0.02, 5.7, 21.05);
  strip(goldMat, bx0 - PW, fy - 0.16, bx1 + PW, fy - 0.12, 21.05, 21.1);
  strip(ledMat, 0, -1.52, cx - 3.1, -1.48, 3.0, 3.06);
  strip(ledMat, cx + 3.1, -1.52, BLOCK_W, -1.48, 3.0, 3.06);
  strip(goldMat, cx - 2.4, -1.53, cx + 2.4, -1.5, 3.68, 3.72);

  // up/down wall lights on the piers (see the client's reference photo)
  const wl = wallLights();
  group.add(wl.group);

  const set = (n: number) => {
    paneMat.opacity = n * 0.92;
    wl.set(n);
    FACADE_NIGHT.value = n;
    ledMat.opacity = n;
    goldMat.opacity = n;
    group.visible = n > 0.01;
  };
  set(0);
  return { group, set, decals: wl.decals };
}

/** Scallop of an up/down wall light: narrow at the fixture, widening and fading up and down the wall. */
function scallopTexture() {
  const W = 128, H = 256, d = new Uint8Array(W * H * 4);
  const QW = 1.1, QH = 2.6;                                      // quad size in metres
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = ((i + 0.5) / W - 0.5) * QW, y = ((j + 0.5) / H - 0.5) * QH;
    const r = Math.abs(y), up = y > 0;
    const w = 0.035 + 0.38 * Math.pow(r, 0.85);                   // cone half-width
    const edge = Math.min(1, Math.max(0, (w - Math.abs(x)) / (w * 0.45)));
    let v = Math.exp(-r / (up ? 0.62 : 0.5)) * (up ? 1 : 0.8) * edge * edge * (3 - 2 * edge);
    v += 0.9 * Math.exp(-(x * x + y * y) / 0.0035) + 0.1 * Math.exp(-(x * x + y * y) / 0.06);
    const k = (j * W + i) * 4;
    d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(Math.min(1, v) * 255);
  }
  const t = new THREE.DataTexture(d, W, H);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return { t, QW, QH };
}

/** Bronze up/down lights on the solid piers of the outer walls, sparser and dimmer on the upper storeys. */
function wallLights() {
  const plan = planFor(3), fp = plan.footprint, ring = fp.outer;
  const piers: { x: number; y: number; nx: number; ny: number }[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 0.6) continue;
    const tx = (bx - ax) / L, ty = (by - ay) / L;
    let nx = ty, ny = -tx;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (pointInPoly(mx + nx * 0.05, my + ny * 0.05, fp)) { nx = -nx; ny = -ny; }
    // what is not wall along this edge: windows, doors (with frames) and balcony railings
    const blocked: [number, number][] = [];
    const along = (x: number, y: number) => (x - ax) * tx + (y - ay) * ty;
    const near = (x: number, y: number) => Math.abs((x - ax) * nx + (y - ay) * ny) < 0.4;
    for (const r of [...plan.windows, ...plan.openings.filter((o) => o.kind !== 'lift')]) {
      const cs: [number, number][] = [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]];
      if (!cs.some(([x, y]) => near(x, y))) continue;
      const ss = cs.map(([x, y]) => along(x, y));
      blocked.push([Math.min(...ss) - 0.08, Math.max(...ss) + 0.08]);
    }
    for (const rl of plan.rails) {
      const [p, q] = rl.axis === 'h' ? [[rl.lo, rl.off], [rl.hi, rl.off]] : [[rl.off, rl.lo], [rl.off, rl.hi]];
      if (!near(p[0], p[1]) || !near(q[0], q[1])) continue;
      const a = along(p[0], p[1]), b = along(q[0], q[1]);
      blocked.push([Math.min(a, b) - 0.1, Math.max(a, b) + 0.1]);
    }
    blocked.sort((a, b) => a[0] - b[0]);
    let s0 = 0.12;
    const free: [number, number][] = [];
    for (const [b0, b1] of [...blocked, [L - 0.12, L - 0.12] as [number, number]]) {
      if (b0 > s0) free.push([s0, Math.min(b0, L - 0.12)]);
      s0 = Math.max(s0, b1);
    }
    for (const [f0, f1] of free) {
      const w = f1 - f0;
      if (w < 0.5) continue;
      const n = Math.max(1, Math.floor(w / 3.2));
      for (let k = 0; k < n; k++) {
        const sc = f0 + (w * (k + 0.5)) / n;
        const x = ax + tx * sc, y = ay + ty * sc;
        // street facade: the ornamental pilasters and the lattice arch frame have their own accents
        if (ny < -0.5 && y < 0.6 && (Math.abs(x - 6.42) < 0.75 || Math.abs(x - (BLOCK_W - 6.28)) < 0.75 || (x > 11.4 && x < 18.3))) continue;
        piers.push({ x, y, nx, ny });
      }
    }
  }
  // which storeys get a light on each pier: every pier on the lower storeys, then every 2nd, then every 4th
  const top = (k: number) => (k % 4 === 0 ? 12 : k % 2 === 0 ? 8 : 5);
  const { t, QW, QH } = scallopTexture();
  const decalParts: THREE.BufferGeometry[] = [], bodyParts: THREE.BufferGeometry[] = [], capParts: THREE.BufferGeometry[] = [];
  const col = new THREE.Color('#ffcf9a');
  piers.forEach((p, k) => {
    for (let st = 2; st <= top(k); st++) {
      const z = (st - 1) * FLOOR_H + 1.75;
      const level = Math.max(0.25, 1 - (st - 2) * 0.075);          // dimmer going up
      const rot = Math.atan2(p.nx, p.ny);                            // local +z → wall normal
      const M = new THREE.Matrix4().makeRotationY(rot).setPosition(p.x, z, p.y);
      const q = new THREE.PlaneGeometry(QW, QH); q.translate(0, 0, 0.012); q.applyMatrix4(M);
      const c = new Float32Array(q.getAttribute('position').count * 3);
      for (let v = 0; v < c.length; v += 3) { c[v] = col.r * level; c[v + 1] = col.g * level; c[v + 2] = col.b * level; }
      q.setAttribute('color', new THREE.BufferAttribute(c, 3));
      decalParts.push(q);
      const b = new THREE.CylinderGeometry(0.034, 0.034, 0.13, 16); b.translate(0, 0, 0.055); b.applyMatrix4(M); b.deleteAttribute('uv');
      const arm = new THREE.BoxGeometry(0.03, 0.03, 0.03); arm.translate(0, 0, 0.015); arm.applyMatrix4(M); arm.deleteAttribute('uv');
      bodyParts.push(b.toNonIndexed(), arm.toNonIndexed());
      for (const sgn of [1, -1]) {
        const cap = new THREE.CircleGeometry(0.028, 14); cap.rotateX(sgn > 0 ? -Math.PI / 2 : Math.PI / 2); cap.translate(0, sgn * 0.0655, 0.055); cap.applyMatrix4(M); cap.deleteAttribute('uv');
        capParts.push(cap.toNonIndexed());
      }
    }
  });
  const group = new THREE.Group(); group.name = 'wall-lights';
  const decalMat = new THREE.MeshBasicMaterial({ map: t, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: [CUT], polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const decals = new THREE.Mesh(mergeGeometries(decalParts, false)!, decalMat);
  decals.name = 'wall-light-scallops'; decals.renderOrder = 3; decals.frustumCulled = false;
  const bodyMat = prep(new THREE.MeshStandardMaterial({ color: '#4a3b2e', roughness: 0.4, metalness: 0.7 }), false);
  const body = new THREE.Mesh(mergeGeometries(bodyParts, false)!, bodyMat);
  const capMat = new THREE.MeshBasicMaterial({ color: '#ffe0b8', transparent: true, opacity: 0, clippingPlanes: [CUT] });
  capMat.userData.ptEmissive = 40;          // the path tracer lights the wall from the caps themselves
  const caps = new THREE.Mesh(mergeGeometries(capParts, false)!, capMat);
  [...decalParts, ...bodyParts, ...capParts].forEach((g) => g.dispose());
  group.add(body, caps, decals);
  const set = (n: number) => { decalMat.opacity = n; capMat.opacity = n; decals.visible = caps.visible = n > 0.01; };
  set(0);
  return { group, set, decals, count: decalParts.length };
}
